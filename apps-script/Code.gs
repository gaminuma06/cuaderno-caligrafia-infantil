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
        hoja.appendRow([
          "Fecha", "Nombres", "Apellidos", "Cedula", "Telefono", "Correo", "Departamento",
          "Ciudad", "Direccion", "Notas", "Bundle", "Unidades", "Total", "Estado", "Producto",
          "Mensaje WhatsApp", "Link WhatsApp",
        ]);
        hoja.getRange(1, 1, 1, 17).setFontWeight("bold");
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
        "Nuevo", // Estado: marca manualmente como "Enviado a Dropi" al procesarlo
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
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
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
