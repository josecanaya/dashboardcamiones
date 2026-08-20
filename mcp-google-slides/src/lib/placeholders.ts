import type { slides_v1 } from "googleapis";

export type Replacements = Record<string, string>;

/** Normaliza una clave de placeholder al formato `{{CLAVE}}`. */
export function toPlaceholderToken(key: string): string {
  const trimmed = key.trim();
  if (/^\{\{.*\}\}$/.test(trimmed)) return trimmed;
  return `{{${trimmed}}}`;
}

/**
 * Reemplazo local de placeholders sobre un string (útil para tests y para
 * previsualizar). El reemplazo real en la presentación lo hace Google via
 * replaceAllText; esto sirve para validar/simular.
 */
export function applyPlaceholders(text: string, replacements: Replacements): string {
  let out = text;
  for (const [key, value] of Object.entries(replacements)) {
    const token = toPlaceholderToken(key);
    // Escapar el token para regex
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), value ?? "");
  }
  return out;
}

/**
 * Construye los requests `replaceAllText` de la Slides API a partir de un mapa
 * de reemplazos. Opcionalmente restringe a un conjunto de pageObjectIds
 * (diapositivas específicas).
 */
export function buildReplaceAllTextRequests(
  replacements: Replacements,
  opts: { matchCase?: boolean; pageObjectIds?: string[] } = {},
): slides_v1.Schema$Request[] {
  const requests: slides_v1.Schema$Request[] = [];
  for (const [key, value] of Object.entries(replacements)) {
    const req: slides_v1.Schema$Request = {
      replaceAllText: {
        containsText: {
          text: toPlaceholderToken(key),
          matchCase: opts.matchCase ?? true,
        },
        replaceText: value ?? "",
      },
    };
    if (opts.pageObjectIds && opts.pageObjectIds.length > 0) {
      req.replaceAllText!.pageObjectIds = opts.pageObjectIds;
    }
    requests.push(req);
  }
  return requests;
}
