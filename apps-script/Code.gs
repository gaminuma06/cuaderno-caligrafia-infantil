/**
 * Google Apps Script — recibe los pedidos del formulario de la landing
 * y los guarda como fila nueva en la PRIMERA pestaña de la hoja de cálculo
 * indicada por SHEET_ID (apuntado directo por ID, no depende de que el
 * script esté "vinculado" a la hoja).
 *
 * Incluye filtros anti-spam: pedidos con datos inválidos, con el campo
 * trampa lleno (bots), enviados demasiado rápido, o repetidos con el mismo
 * teléfono en pocos minutos, NO se guardan en la hoja — así no la ensucian
 * con basura. En todos los casos se responde igual (ok:true) para no darle
 * pistas a los bots de que fueron detectados.
 *
 * También: al guardar un pedido válido, manda un correo de aviso al dueño
 * del script, y guarda en la hoja un link directo de WhatsApp + un mensaje
 * de confirmación ya redactado, listos para copiar/pegar al cliente.
 */

const SHEET_ID = "1QScesaVPIQhF3SU6N-VCCLQ7Ih30sIt14JBSfM0mVOc";
const SEGUNDOS_MINIMOS_EN_PAGINA = 3; // menos que esto = casi seguro un bot
const MINUTOS_ANTIDUPLICADO = 3; // mismo teléfono repetido antes de este tiempo = ignorado

// PIN para el panel de pedidos (/panel/pedidos.html) — CAMBIA este valor por
// uno tuyo antes de usar el panel. Sin este PIN nadie puede ver ni mover
// pedidos, aunque conozca la URL del script (que ya es pública: está en el
// código de la página).
const PANEL_PIN = "CAMBIA-ESTE-PIN";

const NOMBRE_HOJA_ENVIADOS = "Pedidos Enviados";
const COL_ESTADO = 14; // columna "Estado", igual en ambas hojas
const ENCABEZADOS_PEDIDOS = [
  "Fecha", "Nombres", "Apellidos", "Cedula", "Telefono", "Correo", "Departamento",
  "Ciudad", "Direccion", "Notas", "Bundle", "Unidades", "Total", "Estado", "Producto",
  "Mensaje WhatsApp", "Link WhatsApp",
];
const ENCABEZADOS_ENVIADOS = ENCABEZADOS_PEDIDOS.concat(["Fecha Envio", "Fecha Recibido"]);

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);

    if (!esPedidoLegitimo(datos)) {
      return responderOk();
    }

    // LockService asegura que dos pedidos casi simultáneos (ej: doble clic,
    // o alguien mandando el mismo teléfono varias veces seguidas) no puedan
    // "colarse" ambos antes de que el primero alcance a marcar el teléfono
    // como visto. Sin esto, el chequeo de duplicados tiene una condición de
    // carrera y puede fallar (ya pasó en pruebas).
    const lock = LockService.getScriptLock();
    const tieneLock = lock.tryLock(10000);
    if (!tieneLock) {
      return responderOk();
    }

    try {
      const hoja = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

      if (hoja.getLastRow() === 0) {
        hoja.appendRow(ENCABEZADOS_PEDIDOS);
        hoja.getRange(1, 1, 1, ENCABEZADOS_PEDIDOS.length).setFontWeight("bold");
      }

      if (esDuplicadoReciente(hoja, datos.telefono).esDuplicado) {
        return responderOk();
      }

      const mensajeWhatsapp = construirMensajeWhatsapp(datos);
      const linkWhatsapp = construirLinkWhatsapp(datos.telefono);

      hoja.appendRow([
        new Date(datos.fecha || Date.now()),
        datos.nombres || "",
        datos.apellidos || "",
        datos.cedula || "",
        datos.telefono || "",
        datos.correo || "",
        datos.departamento || "",
        datos.ciudad || "",
        datos.direccion || "",
        datos.notas || "",
        datos.bundle || "",
        datos.unidades || "",
        datos.total || "",
        "Nuevo", // Estado: pasa a "Enviado" desde /panel/pedidos.html al subirlo a Dropi
        datos.producto || "", // qué landing/producto generó el pedido (varios productos comparten esta hoja)
        mensajeWhatsapp,
        linkWhatsapp,
      ]);
      SpreadsheetApp.flush(); // fuerza a que la fila quede escrita de una vez, no en cola

      avisarPorCorreo(datos, mensajeWhatsapp, linkWhatsapp);
    } finally {
      lock.releaseLock();
    }

    return responderOk();
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function responderOk() {
  return responderJson({ ok: true });
}

function responderJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Panel de pedidos (/panel/pedidos.html): listar pedidos pendientes/enviados
 * y mover un pedido de estado con un toque desde el celular.
 *   ?accion=listar&hoja=pendientes|enviados&pin=...
 *   ?accion=marcarEnviado&fila=N&pin=...   (mueve de "Pedidos" a "Pedidos Enviados")
 *   ?accion=marcarRecibido&fila=N&pin=...  (cierra el pedido en "Pedidos Enviados")
 * Protegido con PANEL_PIN: sin el PIN correcto no se devuelve ni se mueve nada,
 * aunque esta URL sea pública (está en el código de la página).
 */
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.pin !== PANEL_PIN) {
      return responderJson({ ok: false, error: "PIN incorrecto." });
    }

    if (p.accion === "listar") {
      if (p.hoja === "enviados") {
        return responderJson({ ok: true, pedidos: listarPedidos(obtenerHojaEnviados(), "Enviado") });
      }
      const hojaPedidos = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
      return responderJson({ ok: true, pedidos: listarPedidos(hojaPedidos, "Nuevo") });
    }

    if (p.accion === "marcarEnviado") {
      return responderJson(marcarComoEnviado(parseInt(p.fila, 10)));
    }

    if (p.accion === "marcarRecibido") {
      return responderJson(marcarComoRecibido(parseInt(p.fila, 10)));
    }

    return responderJson({ ok: false, error: "Acción no reconocida." });
  } catch (err) {
    return responderJson({ ok: false, error: String(err) });
  }
}

/** Devuelve la hoja "Pedidos Enviados", creándola (con encabezados) la
 * primera vez que se necesita — no hay que crearla a mano en Sheets. */
function obtenerHojaEnviados() {
  const libro = SpreadsheetApp.openById(SHEET_ID);
  let hoja = libro.getSheetByName(NOMBRE_HOJA_ENVIADOS);
  if (!hoja) {
    hoja = libro.insertSheet(NOMBRE_HOJA_ENVIADOS);
    hoja.appendRow(ENCABEZADOS_ENVIADOS);
    hoja.getRange(1, 1, 1, ENCABEZADOS_ENVIADOS.length).setFontWeight("bold");
  }
  return hoja;
}

/** Filas de `hoja` cuyo Estado sea exactamente `estadoBuscado`, con su
 * número de fila real (para poder marcarlas después). Más nuevas primero. */
function listarPedidos(hoja, estadoBuscado) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return [];

  const valores = hoja.getRange(2, 1, ultimaFila - 1, 15).getValues(); // A:Producto
  const resultado = [];
  valores.forEach((fila, i) => {
    if (fila[COL_ESTADO - 1] !== estadoBuscado) return;
    resultado.push({
      fila: i + 2,
      fecha: fila[0] ? new Date(fila[0]).toLocaleString("es-CO") : "",
      nombres: fila[1],
      apellidos: fila[2],
      telefono: fila[4],
      departamento: fila[6],
      ciudad: fila[7],
      notas: fila[9],
      bundle: fila[10],
      total: fila[12],
      producto: fila[14],
    });
  });
  return resultado.reverse();
}

/** Mueve la fila `fila` de "Pedidos" a "Pedidos Enviados", marcándola
 * "Enviado". Revalida el estado por si la lista quedó desactualizada
 * (ej. dos toques seguidos, o el pedido ya se movió desde otra pestaña). */
function marcarComoEnviado(fila) {
  if (!fila || fila < 2) return { ok: false, error: "Pedido inválido." };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "Ocupado, intenta de nuevo en un momento." };
  try {
    const hojaPedidos = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    if (fila > hojaPedidos.getLastRow()) {
      return { ok: false, error: "Ese pedido ya no está en la lista. Actualiza." };
    }
    const rango = hojaPedidos.getRange(fila, 1, 1, ENCABEZADOS_PEDIDOS.length);
    const valores = rango.getValues()[0];
    if (valores[COL_ESTADO - 1] !== "Nuevo") {
      return { ok: false, error: "Ese pedido ya cambió de estado. Actualiza la lista." };
    }

    valores[COL_ESTADO - 1] = "Enviado";
    obtenerHojaEnviados().appendRow(valores.concat([new Date(), ""]));
    hojaPedidos.deleteRow(fila);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Cierra un pedido en "Pedidos Enviados": Enviado -> Recibido por cliente. */
function marcarComoRecibido(fila) {
  if (!fila || fila < 2) return { ok: false, error: "Pedido inválido." };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: "Ocupado, intenta de nuevo en un momento." };
  try {
    const hoja = obtenerHojaEnviados();
    if (fila > hoja.getLastRow()) {
      return { ok: false, error: "Ese pedido ya no está en la lista. Actualiza." };
    }
    const celdaEstado = hoja.getRange(fila, COL_ESTADO);
    if (celdaEstado.getValue() !== "Enviado") {
      return { ok: false, error: "Ese pedido ya cambió de estado. Actualiza la lista." };
    }
    celdaEstado.setValue("Recibido por cliente");
    hoja.getRange(fila, ENCABEZADOS_ENVIADOS.length).setValue(new Date());
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/** Revalida en el servidor lo mismo que ya valida el formulario, más las
 * señales anti-bot. Nunca confíes solo en la validación del navegador: cualquiera
 * puede mandarle datos directo a esta URL sin pasar por la página. */
function esPedidoLegitimo(datos) {
  if (datos.sitio_web) return false; // campo trampa lleno = bot

  if (typeof datos.segundos_en_pagina === "number" &&
      datos.segundos_en_pagina < SEGUNDOS_MINIMOS_EN_PAGINA) {
    return false; // envió el formulario demasiado rápido para ser una persona
  }

  const nombres = (datos.nombres || "").trim();
  const apellidos = (datos.apellidos || "").trim();
  const cedula = (datos.cedula || "").trim();
  const telefono = (datos.telefono || "").trim();
  const correo = (datos.correo || "").trim();
  const ciudad = (datos.ciudad || "").trim();
  const direccion = (datos.direccion || "").trim();

  if (nombres.length < 2) return false;
  if (apellidos.length < 2) return false;
  if (!/^\d{6,10}$/.test(cedula)) return false;
  if (!/^3\d{9}$/.test(telefono)) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return false;
  if (!datos.departamento) return false;
  if (ciudad.length < 2) return false;
  if (direccion.length < 5) return false;

  return true;
}

/** true si YA hay un pedido con el mismo teléfono en los últimos minutos
 * (doble clic, reintento de red, o alguien mandando el mismo número varias
 * veces seguidas). Revisa la hoja directamente en vez de CacheService: el
 * caché no garantiza estar al día de inmediato entre ejecuciones separadas
 * (se comprobó en pruebas), la hoja sí — es la fuente real de los datos. */
function esDuplicadoReciente(hoja, telefono) {
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return { esDuplicado: false };

  const primeraFilaARevisar = Math.max(2, ultimaFila - 20 + 1); // últimas ~20 filas alcanza de sobra
  const cantidadFilas = ultimaFila - primeraFilaARevisar + 1;
  const valores = hoja.getRange(primeraFilaARevisar, 1, cantidadFilas, 5).getValues(); // A:Fecha ... E:Telefono

  const limiteMs = MINUTOS_ANTIDUPLICADO * 60 * 1000;
  const ahora = Date.now();

  // OJO: no uses "fecha instanceof Date" — los valores de fecha que devuelve
  // getValues() a veces no pasan ese chequeo aunque SÍ sean fechas válidas
  // (confirmado con pruebas: era la causa real de que el filtro de duplicados
  // no funcionara). new Date(fecha).getTime() sí funciona siempre.
  for (let i = valores.length - 1; i >= 0; i--) {
    const [fecha, , , , tel] = valores[i];
    const fechaMs = fecha ? new Date(fecha).getTime() : NaN;
    if (String(tel) === telefono && !isNaN(fechaMs) && (ahora - fechaMs) < limiteMs) {
      return { esDuplicado: true };
    }
  }
  return { esDuplicado: false };
}

/** El mensaje listo para copiar y pegarle al cliente por WhatsApp, ya con
 * sus datos rellenados. Edítalo aquí si quieres cambiar el texto — se
 * regenera automáticamente para cada pedido nuevo. */
function construirMensajeWhatsapp(datos) {
  const nombreCompleto = `${datos.nombres || ""} ${datos.apellidos || ""}`.trim();
  const producto = datos.producto || "tu pedido";
  const direccionCompleta = `${datos.direccion}, ${datos.ciudad}, ${datos.departamento}`;

  return `Hola ${nombreCompleto}, somos Tienda Expres 😊 Gracias por confiar en nosotros. Queremos confirmar la información de tu pedido para enviarte tu ${producto} lo antes posible.

Los datos que nos diste son:
📍 Dirección: ${direccionCompleta}
🪪 Cédula: ${datos.cedula}
📱 Teléfono: ${datos.telefono}

Si necesitas corregir algo, avísame y así confirmamos tu pedido para que te llegue lo antes posible.`;
}

/** Link que abre directo el chat de WhatsApp con el cliente (wa.me). */
function construirLinkWhatsapp(telefono) {
  const soloDigitos = String(telefono || "").replace(/\D/g, "");
  return `https://wa.me/57${soloDigitos}`;
}

/** Manda un correo avisando del pedido nuevo. Nunca deja que un problema
 * de correo (cuota, lo que sea) tumbe el guardado del pedido — por eso va
 * en su propio try/catch, separado del guardado en la hoja. */
function avisarPorCorreo(datos, mensajeWhatsapp, linkWhatsapp) {
  try {
    const destinatario = Session.getEffectiveUser().getEmail();
    if (!destinatario) return;

    const nombreCompleto = `${datos.nombres || ""} ${datos.apellidos || ""}`.trim();
    const asunto = `🎉 Nuevo pedido: ${nombreCompleto} — ${datos.bundle || ""}`;
    const cuerpo =
`Nuevo pedido recibido${datos.producto ? " (" + datos.producto + ")" : ""}:

Cliente: ${nombreCompleto}
Cédula: ${datos.cedula}
Teléfono: ${datos.telefono}
Correo: ${datos.correo}
Ciudad: ${datos.ciudad}, ${datos.departamento}
Dirección: ${datos.direccion}
Pedido: ${datos.bundle} — $${datos.total}
Notas del cliente: ${datos.notas || "(ninguna)"}

WhatsApp del cliente: ${linkWhatsapp}

Mensaje de confirmación listo para copiar y pegar:
---
${mensajeWhatsapp}
---

(También queda todo guardado en la hoja de pedidos.)`;

    MailApp.sendEmail(destinatario, asunto, cuerpo);
  } catch (err) {
    // No relanzar: si falla el correo, el pedido ya quedó guardado igual.
  }
}

/**
 * Función de prueba: selecciónala en el desplegable de arriba en el editor
 * de Apps Script (junto al botón ▷ Ejecutar) y dale clic a Ejecutar.
 * Si todo está bien, debería aparecer una fila de prueba en tu hoja Y
 * llegarte un correo de aviso.
 */
function pruebaManual() {
  const resultado = doPost({
    postData: {
      contents: JSON.stringify({
        nombres: "Prueba",
        apellidos: "Sistema",
        cedula: "1000000000",
        telefono: "3000000000",
        correo: "prueba@ejemplo.com",
        departamento: "Antioquia",
        ciudad: "Medellín",
        direccion: "Dirección de prueba",
        notas: "Esto es una fila de prueba, la puedes borrar",
        bundle: "1 Kit",
        unidades: 1,
        total: 45900,
        producto: "Kit Cuadernos Mágicos Montessori de Caligrafía",
        segundos_en_pagina: 10,
      }),
    },
  });
  Logger.log(resultado.getContent()); // Ver: Ejecución > este registro, para leer el resultado
}
