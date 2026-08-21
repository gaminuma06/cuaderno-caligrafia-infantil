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
 */

const SHEET_ID = "1QScesaVPIQhF3SU6N-VCCLQ7Ih30sIt14JBSfM0mVOc";
const SEGUNDOS_MINIMOS_EN_PAGINA = 3; // menos que esto = casi seguro un bot
const MINUTOS_ANTIDUPLICADO = 3; // mismo teléfono repetido antes de este tiempo = ignorado

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);

    if (!esPedidoLegitimo(datos)) {
      return responderOk(); // se descarta en silencio, no se escribe nada
    }

    // LockService asegura que dos pedidos casi simultáneos (ej: doble clic,
    // o alguien mandando el mismo teléfono varias veces seguidas) no puedan
    // "colarse" ambos antes de que el primero alcance a marcar el teléfono
    // como visto. Sin esto, el chequeo de duplicados tiene una condición de
    // carrera y puede fallar (ya pasó en pruebas).
    const lock = LockService.getScriptLock();
    const tieneLock = lock.tryLock(10000);
    if (!tieneLock) {
      return responderOk(); // no se pudo asegurar exclusividad, mejor no arriesgar
    }

    try {
      const hoja = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

      if (hoja.getLastRow() === 0) {
        hoja.appendRow([
          "Fecha", "Nombres", "Apellidos", "Cedula", "Telefono", "Departamento",
          "Ciudad", "Direccion", "Notas", "Bundle", "Unidades", "Total", "Estado",
        ]);
        hoja.getRange(1, 1, 1, 13).setFontWeight("bold");
      }

      if (esDuplicadoReciente(hoja, datos.telefono)) {
        return responderOk(); // mismo teléfono hace muy poco, probable doble clic o reintento
      }

      hoja.appendRow([
        new Date(datos.fecha || Date.now()),
        datos.nombres || "",
        datos.apellidos || "",
        datos.cedula || "",
        datos.telefono || "",
        datos.departamento || "",
        datos.ciudad || "",
        datos.direccion || "",
        datos.notas || "",
        datos.bundle || "",
        datos.unidades || "",
        datos.total || "",
        "Nuevo", // Estado: marca manualmente como "Enviado a Dropi" al procesarlo
      ]);
      SpreadsheetApp.flush(); // fuerza a que la fila quede escrita de una vez, no en cola
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
  const ciudad = (datos.ciudad || "").trim();
  const direccion = (datos.direccion || "").trim();

  if (nombres.length < 2) return false;
  if (apellidos.length < 2) return false;
  if (!/^\d{6,10}$/.test(cedula)) return false;
  if (!/^3\d{9}$/.test(telefono)) return false;
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
  if (ultimaFila < 2) return false;

  const primeraFilaARevisar = Math.max(2, ultimaFila - 20 + 1); // últimas ~20 filas alcanza de sobra
  const cantidadFilas = ultimaFila - primeraFilaARevisar + 1;
  const valores = hoja.getRange(primeraFilaARevisar, 1, cantidadFilas, 5).getValues(); // A:Fecha ... E:Telefono

  const limiteMs = MINUTOS_ANTIDUPLICADO * 60 * 1000;
  const ahora = Date.now();

  for (let i = valores.length - 1; i >= 0; i--) {
    const [fecha, , , , tel] = valores[i];
    if (String(tel) === telefono && fecha instanceof Date && (ahora - fecha.getTime()) < limiteMs) {
      return true;
    }
  }
  return false;
}

/**
 * Función de prueba: selecciónala en el desplegable de arriba en el editor
 * de Apps Script (junto al botón ▷ Ejecutar) y dale clic a Ejecutar.
 * Si todo está bien, debería aparecer una fila de prueba en tu hoja.
 */
function pruebaManual() {
  const resultado = doPost({
    postData: {
      contents: JSON.stringify({
        nombres: "Prueba",
        apellidos: "Sistema",
        cedula: "1000000000",
        telefono: "3000000000",
        departamento: "Antioquia",
        ciudad: "Medellín",
        direccion: "Dirección de prueba",
        notas: "Esto es una fila de prueba, la puedes borrar",
        bundle: "1 Kit",
        unidades: 1,
        total: 45900,
        segundos_en_pagina: 10,
      }),
    },
  });
  Logger.log(resultado.getContent()); // Ver: Ejecución > este registro, para leer el resultado
}
