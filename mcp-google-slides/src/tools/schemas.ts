import { z } from "zod";

/**
 * Raw shapes (objetos de campos Zod) para `server.registerTool`. Se exportan
 * como shapes para que el MCP SDK genere el JSON Schema de entrada.
 */

const userId = z
  .string()
  .min(1)
  .optional()
  .describe("ID de usuario/tenant autorizado. Si se omite, usa DEFAULT_USER_ID.");

const presentation = z
  .string()
  .min(1)
  .describe("URL de Google Slides o ID pelado de la presentación.");

const unit = z.enum(["EMU", "PT"]).optional().describe("Unidad de medida (default EMU).");

const positionShape = {
  x: z.number().describe("Posición X (esquina superior izq)."),
  y: z.number().describe("Posición Y (esquina superior izq)."),
  unit,
};
const sizeShape = {
  width: z.number().positive().describe("Ancho."),
  height: z.number().positive().describe("Alto."),
  unit,
};

export const getPresentationShape = {
  presentation,
  userId,
};

export const createPresentationShape = {
  title: z.string().min(1).describe("Título de la nueva presentación."),
  folderId: z.string().optional().describe("ID de carpeta de Drive destino (opcional)."),
  userId,
};

export const duplicatePresentationShape = {
  presentation,
  name: z.string().optional().describe("Nombre de la copia (opcional)."),
  folderId: z.string().optional().describe("Carpeta de Drive destino (opcional)."),
  userId,
};

export const listSlidesShape = {
  presentation,
  userId,
};

export const addSlideShape = {
  presentation,
  layout: z
    .string()
    .optional()
    .describe(
      "Layout predefinido, p.ej. TITLE, TITLE_AND_BODY, BLANK, SECTION_HEADER, " +
        "TITLE_ONLY, CAPTION_ONLY, BIG_NUMBER, MAIN_POINT, ONE_COLUMN_TEXT.",
    ),
  insertionIndex: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Posición 0-based donde insertar la slide. Al final si se omite."),
  objectId: z.string().optional().describe("objectId deseado para la nueva slide (opcional)."),
  userId,
};

export const replaceTextShape = {
  presentation,
  replacements: z
    .record(z.string(), z.string())
    .describe(
      'Mapa placeholder->valor. Las claves pueden ir con o sin llaves: ' +
        '{ "FECHA": "2026-08-20", "{{PLANTA}}": "Ricardone" }.',
    ),
  pageObjectIds: z
    .array(z.string())
    .optional()
    .describe("Restringir el reemplazo a estas slides (objectIds). Toda la ppt si se omite."),
  matchCase: z.boolean().optional().describe("Coincidencia sensible a mayúsculas (default true)."),
  userId,
};

export const updateTextElementShape = {
  presentation,
  objectId: z.string().min(1).describe("objectId del cuadro de texto/shape a actualizar."),
  text: z.string().describe("Nuevo texto. Reemplaza el contenido preservando formato del inicio."),
  userId,
};

export const insertTextboxShape = {
  presentation,
  pageObjectId: z.string().min(1).describe("objectId de la slide donde crear el cuadro."),
  text: z.string().describe("Contenido del cuadro de texto."),
  position: z.object(positionShape).describe("Posición del cuadro."),
  size: z.object(sizeShape).describe("Tamaño del cuadro."),
  fontSizePt: z.number().positive().optional().describe("Tamaño de fuente en pt (opcional)."),
  bold: z.boolean().optional().describe("Negrita (opcional)."),
  objectId: z.string().optional().describe("objectId deseado (opcional)."),
  userId,
};

export const insertImageShape = {
  presentation,
  pageObjectId: z.string().min(1).describe("objectId de la slide destino."),
  url: z.string().url().describe("URL pública accesible de la imagen (PNG/JPG/GIF)."),
  position: z.object(positionShape).describe("Posición de la imagen."),
  size: z.object(sizeShape).describe("Tamaño de la imagen."),
  replaceImageObjectId: z
    .string()
    .optional()
    .describe("Si se indica, reemplaza la imagen de ese objectId en vez de insertar una nueva."),
  objectId: z.string().optional().describe("objectId deseado para la nueva imagen (opcional)."),
  userId,
};

export const addTableShape = {
  presentation,
  pageObjectId: z.string().min(1).describe("objectId de la slide destino."),
  rows: z.number().int().min(1).describe("Cantidad de filas."),
  columns: z.number().int().min(1).describe("Cantidad de columnas."),
  values: z
    .array(z.array(z.string()))
    .optional()
    .describe("Matriz de valores [fila][columna] para poblar la tabla (opcional)."),
  position: z.object(positionShape).optional().describe("Posición de la tabla (opcional)."),
  size: z.object(sizeShape).optional().describe("Tamaño de la tabla (opcional)."),
  objectId: z.string().optional().describe("objectId deseado (opcional)."),
  userId,
};

export const deleteSlideShape = {
  presentation,
  slideObjectId: z.string().min(1).describe("objectId de la slide a eliminar."),
  confirm: z
    .boolean()
    .describe("DEBE ser true para confirmar la eliminación (acción destructiva)."),
  userId,
};

export const batchUpdateShape = {
  presentation,
  requests: z
    .array(z.record(z.string(), z.any()))
    .min(1)
    .describe(
      "Array de requests de presentations.batchUpdate. Cada request debe tener " +
        "exactamente una operación permitida (ver allowlist).",
    ),
  confirm: z
    .boolean()
    .optional()
    .describe("Requerido (true) si algún request es destructivo (deleteObject/deleteText/replaceAll*)."),
  userId,
};

export const searchPresentationsShape = {
  nameContains: z.string().optional().describe("Filtra por nombre que contenga este texto."),
  folderId: z.string().optional().describe("Restringe a una carpeta de Drive."),
  modifiedAfter: z
    .string()
    .optional()
    .describe("RFC3339, p.ej. 2026-08-01T00:00:00Z. Modificadas después de esta fecha."),
  modifiedBefore: z.string().optional().describe("RFC3339. Modificadas antes de esta fecha."),
  pageSize: z.number().int().min(1).max(100).optional().describe("Tamaño de página (1-100, default 25)."),
  pageToken: z.string().optional().describe("Token de la página siguiente (paginación)."),
  userId,
};

export const exportPresentationShape = {
  presentation,
  format: z.enum(["pdf", "pptx"]).describe("Formato de exportación."),
  userId,
};

// —— Google Sheets / Drive genérico ————————————————————————————————————————
// El informe de logística sale de un Excel que la automatización deja en Drive:
// primero se ubica el archivo, después se leen sus rangos.

const spreadsheet = z
  .string()
  .min(1)
  .describe("URL de Google Sheets o ID pelado de la hoja de cálculo.");

export const searchDriveFilesShape = {
  nameContains: z.string().optional().describe("Filtra por nombre que contenga este texto."),
  folderId: z
    .string()
    .optional()
    .describe("ID de la carpeta de Drive (el tramo final de la URL de la carpeta)."),
  mimeType: z
    .string()
    .optional()
    .describe(
      "Filtra por tipo exacto. Atajos útiles: 'application/vnd.google-apps.spreadsheet' (hoja de Google), " +
        "'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' (.xlsx).",
    ),
  modifiedAfter: z.string().optional().describe("RFC3339. Modificados después de esta fecha."),
  pageSize: z.number().int().min(1).max(100).optional().describe("Tamaño de página (1-100, default 25)."),
  pageToken: z.string().optional().describe("Token de la página siguiente."),
  userId,
};

export const getSpreadsheetMetadataShape = {
  spreadsheet,
  userId,
};

export const getSheetValuesShape = {
  spreadsheet,
  ranges: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      "Rangos A1 a leer, p.ej. ['Soja!A7:C11', 'Textos!C7:C9']. Las pestañas con espacios se citan " +
        "con comillas simples: \"'Textos PPTX'!A1:D10\". Se leen todos en una sola llamada.",
    ),
  formatted: z
    .boolean()
    .optional()
    .describe(
      "false (default) devuelve el número crudo; true devuelve el texto formateado de la celda.",
    ),
  pad: z
    .boolean()
    .optional()
    .describe(
      "true (default) rellena con null las celdas vacías del final de cada fila para que todas " +
        "tengan el mismo ancho. false devuelve las filas tal cual las manda Google.",
    ),
  userId,
};

export const importXlsxShape = {
  file: z.string().min(1).describe("URL o ID del archivo .xlsx en Drive."),
  name: z.string().optional().describe("Nombre de la hoja de cálculo resultante (opcional)."),
  folderId: z.string().optional().describe("Carpeta destino de la copia (opcional)."),
  userId,
};

export const uploadFileShape = {
  localPath: z
    .string()
    .min(1)
    .describe(
      "Ruta absoluta de un .pptx o .xlsx en la máquina donde corre este servidor.",
    ),
  name: z.string().optional().describe("Nombre en Drive (default: el del archivo, sin extensión)."),
  folderId: z.string().optional().describe("Carpeta de Drive destino."),
  convert: z
    .boolean()
    .optional()
    .describe(
      "true (default) convierte al formato nativo de Google al subir: .pptx → Google Slides, " +
        ".xlsx → Google Sheets. false lo deja como archivo adjunto sin convertir.",
    ),
  userId,
};

export const addChartShape = {
  spreadsheet,
  chartType: z
    .enum(["COLUMN", "BAR", "LINE", "AREA", "SCATTER", "PIE"])
    .describe("Tipo de gráfico."),
  domain: z
    .string()
    .min(1)
    .describe("Rango A1 de las categorías (eje X), p.ej. 'Calada!A7:A12'."),
  series: z
    .array(z.string().min(1))
    .min(1)
    .describe("Rangos A1 de los valores, uno por serie, p.ej. ['Calada!C7:C12']."),
  title: z.string().optional().describe("Título del gráfico."),
  axisTitle: z.string().optional().describe("Título del eje de valores (p.ej. 'min')."),
  legendPosition: z
    .enum(["BOTTOM_LEGEND", "RIGHT_LEGEND", "NO_LEGEND"])
    .optional()
    .describe("Ubicación de la leyenda."),
  anchorSheetTitle: z
    .string()
    .optional()
    .describe("Pestaña donde queda anclado el gráfico (default: la primera)."),
  userId,
};

export const writeSheetShape = {
  spreadsheet,
  sheetTitle: z
    .string()
    .min(1)
    .describe("Pestaña destino. Se crea si no existe; si existe, se limpia antes de escribir."),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .min(1)
    .describe("Matriz [fila][columna] a escribir desde A1."),
  userId,
};

export const updateValuesShape = {
  spreadsheet,
  ranges: z
    .array(
      z.object({
        range: z.string().min(1).describe("Rango A1 destino, p.ej. \"'Calada'!C7:C12\"."),
        values: z
          .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
          .describe("Matriz [fila][columna] con el mismo tamaño que el rango."),
      }),
    )
    .min(1)
    .describe("Rangos a escribir. Solo se pisan esas celdas: el resto de la hoja queda igual."),
  userId,
};

export const trashFileShape = {
  file: z.string().min(1).describe("URL o ID del archivo de Drive a mandar a la papelera."),
  confirm: z
    .boolean()
    .describe("Obligatorio (true). Sin esto no se manda nada a la papelera."),
  userId,
};

export const deleteChartsShape = {
  spreadsheet,
  chartIds: z.array(z.number().int()).min(1).describe("chartId de los gráficos a borrar de la hoja."),
  confirm: z.boolean().describe("Obligatorio (true): borrar un gráfico no se deshace desde la API."),
  userId,
};
