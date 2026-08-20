import { AppError } from "./errors.js";

/**
 * Extrae el ID de una presentación de Google Slides desde una URL o desde el ID
 * pelado. Acepta formatos como:
 *   https://docs.google.com/presentation/d/<ID>/edit#slide=id.p
 *   https://docs.google.com/presentation/d/<ID>/edit?usp=sharing
 *   https://docs.google.com/presentation/d/<ID>
 *   https://drive.google.com/file/d/<ID>/view
 *   https://drive.google.com/open?id=<ID>
 *   <ID>  (id pelado)
 */
export function extractPresentationId(input: string): string {
  if (typeof input !== "string") {
    throw new AppError("INVALID_ARGUMENT", "Se esperaba una URL o ID de presentación (string)");
  }
  const raw = input.trim();
  if (raw.length === 0) {
    throw new AppError("INVALID_ARGUMENT", "URL/ID de presentación vacío");
  }

  // /d/<ID> (presentation, document, spreadsheets, file)
  const dPath = raw.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dPath?.[1]) return dPath[1];

  // ?id=<ID> o &id=<ID>
  const idParam = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParam?.[1]) return idParam[1];

  // ID pelado: los IDs de Drive son alfanuméricos con _ y -, típicamente >= 20 chars.
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw) && !raw.includes("/") && !raw.includes(" ")) {
    return raw;
  }

  throw new AppError(
    "INVALID_ARGUMENT",
    `No se pudo extraer un ID de presentación desde: "${raw.slice(0, 80)}"`,
  );
}

/** Construye la URL canónica de edición para un presentationId. */
export function presentationUrl(id: string): string {
  return `https://docs.google.com/presentation/d/${id}/edit`;
}

/** Valida que un objectId de Slides tenga forma aceptable (no vacío). */
export function assertObjectId(objectId: string, field = "objectId"): string {
  if (typeof objectId !== "string" || objectId.trim().length === 0) {
    throw new AppError("INVALID_ARGUMENT", `${field} inválido o vacío`);
  }
  return objectId.trim();
}
