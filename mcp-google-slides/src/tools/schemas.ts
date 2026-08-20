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
