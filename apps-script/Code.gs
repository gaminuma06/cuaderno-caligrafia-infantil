/**
 * Google Apps Script — recibe los pedidos del formulario de la landing
 * y los guarda como fila nueva en la PRIMERA pestaña de la hoja de cálculo
 * indicada por SHEET_ID (apuntado directo por ID, no depende de que el
 * script esté "vinculado" a la hoja).
 */

const SHEET_ID = "1QScesaVPIQhF3SU6N-VCCLQ7Ih30sIt14JBSfM0mVOc";

function doPost(e) {
  try {
    const datos = JSON.parse(e.postData.contents);
    const hoja = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];

    if (hoja.getLastRow() === 0) {
      hoja.appendRow([
        "Fecha", "Nombres", "Apellidos", "Cedula", "Telefono", "Departamento",
        "Ciudad", "Direccion", "Notas", "Bundle", "Unidades", "Total", "Estado",
      ]);
      hoja.getRange(1, 1, 1, 13).setFontWeight("bold");
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

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
        total: 42000,
      }),
    },
  });
  Logger.log(resultado.getContent()); // Ver: Ejecución > este registro, para leer el resultado
}
