import type { slides_v1 } from "googleapis";

/** Resumen estable de una diapositiva (apto para devolver a un LLM). */
export interface SlideSummary {
  objectId: string;
  index: number;
  layoutObjectId?: string;
  title?: string;
  text: string; // texto concatenado de todos los shapes
  speakerNotes?: string;
  /** Oculta en la presentación (no se muestra al presentar). */
  skipped?: boolean;
  elements: ElementSummary[];
}

export interface ElementSummary {
  objectId: string;
  type: "text" | "image" | "table" | "shape" | "video" | "line" | "group" | "chart" | "other";
  text?: string;
  rows?: number;
  columns?: number;
  /** Posición y tamaño en EMU, ya con la escala del elemento aplicada. */
  box?: { x: number; y: number; width: number; height: number };
  /** URL de origen de una imagen, útil para reconocer qué gráfico ocupaba el lugar. */
  imageUrl?: string;
  /** Hoja y gráfico de origen, cuando el elemento es un gráfico vinculado. */
  chart?: { spreadsheetId: string; chartId: number; linked: boolean };
}

export interface PresentationSummary {
  presentationId: string;
  title: string;
  revisionId?: string;
  pageSize?: { width?: number; height?: number; unit?: string };
  slideCount: number;
  slides: SlideSummary[];
}

// Slides usa el caracter vertical-tab (U+000B) para saltos de línea suaves.
const SOFT_BREAK = new RegExp(String.fromCharCode(11), "g");

/** Extrae el texto plano de un TextContent de Slides. */
export function extractText(textContent?: slides_v1.Schema$TextContent | null): string {
  if (!textContent?.textElements) return "";
  let out = "";
  for (const el of textContent.textElements) {
    if (el.textRun?.content) out += el.textRun.content;
  }
  return out.replace(SOFT_BREAK, "\n").trimEnd();
}

function elementType(el: slides_v1.Schema$PageElement): ElementSummary["type"] {
  if (el.shape) {
    if (el.shape.shapeType === "TEXT_BOX" || el.shape.text) return "text";
    return "shape";
  }
  // Un gráfico vinculado a una hoja llega como sheetsChart, no como imagen: distinguirlo
  // es lo que permite ver de un vistazo qué gráficos ya están vinculados y cuáles siguen
  // siendo una captura muerta heredada del PPTX.
  if (el.sheetsChart) return "chart";
  if (el.image) return "image";
  if (el.table) return "table";
  if (el.video) return "video";
  if (el.line) return "line";
  if (el.elementGroup) return "group";
  return "other";
}

/**
 * Caja del elemento en EMU.
 *
 * Slides guarda el tamaño "sin escalar" en `size` y la escala en `transform`, así que el
 * ancho real es `size.width * scaleX`. Sin multiplicar, una imagen reescalada devuelve su
 * tamaño original y un gráfico puesto en su lugar sale de cualquier medida.
 */
function elementBox(el: slides_v1.Schema$PageElement): ElementSummary["box"] {
  const t = el.transform;
  const w = el.size?.width?.magnitude;
  const h = el.size?.height?.magnitude;
  if (t?.translateX === undefined && t?.translateY === undefined && w === undefined) return undefined;
  return {
    x: t?.translateX ?? 0,
    y: t?.translateY ?? 0,
    width: (w ?? 0) * (t?.scaleX ?? 1),
    height: (h ?? 0) * (t?.scaleY ?? 1),
  };
}

function summarizeElement(el: slides_v1.Schema$PageElement): ElementSummary {
  const type = elementType(el);
  const summary: ElementSummary = { objectId: el.objectId ?? "", type };
  if (el.shape?.text) summary.text = extractText(el.shape.text);
  if (el.table) {
    summary.rows = el.table.rows ?? undefined;
    summary.columns = el.table.columns ?? undefined;
  }
  const box = elementBox(el);
  if (box) summary.box = box;
  if (el.image?.contentUrl) summary.imageUrl = el.image.contentUrl;
  if (el.sheetsChart) {
    summary.chart = {
      spreadsheetId: el.sheetsChart.spreadsheetId ?? "",
      chartId: el.sheetsChart.chartId ?? 0,
      linked: el.sheetsChart.contentUrl !== undefined,
    };
  }
  return summary;
}

/** Título de una slide: primer placeholder TITLE/CENTERED_TITLE, si existe. */
function slideTitle(page: slides_v1.Schema$Page): string | undefined {
  for (const el of page.pageElements ?? []) {
    const ph = el.shape?.placeholder?.type;
    if ((ph === "TITLE" || ph === "CENTERED_TITLE") && el.shape?.text) {
      const t = extractText(el.shape.text);
      if (t) return t;
    }
  }
  return undefined;
}

/** Notas del orador de una slide. */
function speakerNotes(page: slides_v1.Schema$Page): string | undefined {
  const notesPage = page.slideProperties?.notesPage;
  const notesId = notesPage?.notesProperties?.speakerNotesObjectId;
  if (!notesId) return undefined;
  for (const el of notesPage?.pageElements ?? []) {
    if (el.objectId === notesId && el.shape?.text) {
      const t = extractText(el.shape.text);
      return t || undefined;
    }
  }
  return undefined;
}

export function summarizeSlide(page: slides_v1.Schema$Page, index: number): SlideSummary {
  const elements = (page.pageElements ?? []).map(summarizeElement);
  const text = elements
    .map((e) => e.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    objectId: page.objectId ?? "",
    index,
    layoutObjectId: page.slideProperties?.layoutObjectId ?? undefined,
    ...(page.slideProperties?.isSkipped ? { skipped: true } : {}),
    title: slideTitle(page),
    text,
    speakerNotes: speakerNotes(page),
    elements,
  };
}

export function summarizePresentation(
  p: slides_v1.Schema$Presentation,
): PresentationSummary {
  const slides = (p.slides ?? []).map((s, i) => summarizeSlide(s, i));
  return {
    presentationId: p.presentationId ?? "",
    title: p.title ?? "",
    revisionId: p.revisionId ?? undefined,
    pageSize: {
      width: p.pageSize?.width?.magnitude ?? undefined,
      height: p.pageSize?.height?.magnitude ?? undefined,
      unit: p.pageSize?.width?.unit ?? undefined,
    },
    slideCount: slides.length,
    slides,
  };
}
