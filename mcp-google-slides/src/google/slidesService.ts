import type { slides_v1 } from "googleapis";
import type { AppConfig } from "../config.js";
import { AppError, normalizeError } from "../lib/errors.js";
import { withRetry } from "../lib/retry.js";
import { buildReplaceAllTextRequests, type Replacements } from "../lib/placeholders.js";
import { assertObjectId } from "../lib/urls.js";
import { summarizePresentation, extractText, type PresentationSummary } from "./slidesTransform.js";

/**
 * Allowlist de tipos de request válidos para presentations.batchUpdate.
 * Cualquier clave fuera de esta lista se rechaza ANTES de llamar a Google
 * (protección contra llamadas arbitrarias / payloads inesperados).
 * Fuente: https://developers.google.com/slides/api/reference/rest/v1/presentations/request
 */
export const ALLOWED_BATCH_REQUESTS = new Set<string>([
  "createSlide",
  "createShape",
  "createTable",
  "createImage",
  "createLine",
  "createVideo",
  "createSheetsChart",
  "createParagraphBullets",
  "deleteObject",
  "deleteText",
  "deleteTableRow",
  "deleteTableColumn",
  "deleteParagraphBullets",
  "insertText",
  "insertTableRows",
  "insertTableColumns",
  "replaceAllText",
  "replaceAllShapesWithImage",
  "replaceAllShapesWithSheetsChart",
  "replaceImage",
  "updateSlidesPosition",
  "updatePageProperties",
  "updateShapeProperties",
  "updateImageProperties",
  "updateVideoProperties",
  "updateLineProperties",
  "updateTableCellProperties",
  "updateTableRowProperties",
  "updateTableColumnProperties",
  "updateTableBorderProperties",
  "updateTextStyle",
  "updateParagraphStyle",
  "updatePageElementTransform",
  "updatePageElementAltText",
  "updatePageElementsZOrder",
  "groupObjects",
  "ungroupObjects",
  "mergeTableCells",
  "unmergeTableCells",
  "rerouteLine",
  "refreshSheetsChart",
]);

const EMU_PER_INCH = 914400;

export interface Dimension {
  /** unidades EMU (default) o PT si se indica en `unit`. */
  width: number;
  height: number;
  unit?: "EMU" | "PT";
}
export interface Position {
  x: number;
  y: number;
  unit?: "EMU" | "PT";
}

export class SlidesService {
  constructor(
    private slides: slides_v1.Slides,
    private cfg: AppConfig,
  ) {}

  private retryOpts(context: string) {
    return { maxRetries: this.cfg.GOOGLE_MAX_RETRIES, context };
  }

  /** Valida y lanza un batchUpdate crudo (solo requests de la allowlist). */
  async batchUpdate(
    presentationId: string,
    requests: slides_v1.Schema$Request[],
    writeControl?: slides_v1.Schema$WriteControl,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "batchUpdate requiere un array de requests no vacío");
    }
    requests.forEach((req, i) => {
      const keys = Object.keys(req ?? {});
      if (keys.length !== 1) {
        throw new AppError(
          "INVALID_ARGUMENT",
          `requests[${i}] debe tener exactamente una clave de operación (tiene ${keys.length})`,
        );
      }
      const op = keys[0];
      if (!ALLOWED_BATCH_REQUESTS.has(op)) {
        throw new AppError(
          "INVALID_ARGUMENT",
          `requests[${i}]: operación no permitida "${op}". Operaciones válidas: ${[...ALLOWED_BATCH_REQUESTS].join(", ")}`,
        );
      }
    });

    return withRetry(async () => {
      try {
        const res = await this.slides.presentations.batchUpdate({
          presentationId,
          requestBody: { requests, writeControl },
        });
        return res.data;
      } catch (err) {
        throw normalizeError(err, "slides.batchUpdate");
      }
    }, this.retryOpts("slides.batchUpdate"));
  }

  async getPresentation(presentationId: string): Promise<slides_v1.Schema$Presentation> {
    return withRetry(async () => {
      try {
        const res = await this.slides.presentations.get({ presentationId });
        return res.data;
      } catch (err) {
        throw normalizeError(err, "slides.presentations.get");
      }
    }, this.retryOpts("slides.presentations.get"));
  }

  async getPresentationSummary(presentationId: string): Promise<PresentationSummary> {
    const p = await this.getPresentation(presentationId);
    return summarizePresentation(p);
  }

  async createPresentation(title: string): Promise<slides_v1.Schema$Presentation> {
    return withRetry(async () => {
      try {
        const res = await this.slides.presentations.create({ requestBody: { title } });
        return res.data;
      } catch (err) {
        throw normalizeError(err, "slides.presentations.create");
      }
    }, this.retryOpts("slides.presentations.create"));
  }

  /** Agrega una slide con un layout dado en una posición (insertionIndex). */
  async addSlide(
    presentationId: string,
    opts: { layout?: string; insertionIndex?: number; objectId?: string },
  ): Promise<{ objectId: string; response: slides_v1.Schema$BatchUpdatePresentationResponse }> {
    const req: slides_v1.Schema$Request = {
      createSlide: {
        insertionIndex: opts.insertionIndex,
        objectId: opts.objectId,
        slideLayoutReference: opts.layout ? { predefinedLayout: opts.layout } : undefined,
      },
    };
    const response = await this.batchUpdate(presentationId, [req]);
    const objectId = response.replies?.[0]?.createSlide?.objectId ?? "";
    return { objectId, response };
  }

  async deleteSlide(
    presentationId: string,
    slideObjectId: string,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    assertObjectId(slideObjectId, "slideObjectId");
    return this.batchUpdate(presentationId, [{ deleteObject: { objectId: slideObjectId } }]);
  }

  /** Reemplaza placeholders en toda la presentación o en slides específicas. */
  async replaceText(
    presentationId: string,
    replacements: Replacements,
    opts: { pageObjectIds?: string[]; matchCase?: boolean } = {},
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    const requests = buildReplaceAllTextRequests(replacements, opts);
    if (requests.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "No se pasaron reemplazos");
    }
    return this.batchUpdate(presentationId, requests);
  }

  /**
   * Actualiza el texto de un shape existente por objectId. Estrategia
   * "best-effort" para preservar formato: inserta el texto nuevo al inicio y
   * borra el texto viejo, de modo que el nuevo hereda el estilo del índice 0.
   */
  async updateTextElement(
    presentationId: string,
    objectId: string,
    newText: string,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    assertObjectId(objectId);
    const presentation = await this.getPresentation(presentationId);
    const element = findElement(presentation, objectId);
    if (!element) {
      throw new AppError("NOT_FOUND", `No se encontró el elemento ${objectId}`);
    }
    if (!element.shape) {
      throw new AppError("INVALID_ARGUMENT", `El elemento ${objectId} no es un shape con texto`);
    }
    const currentLen = extractText(element.shape.text).length;
    const requests: slides_v1.Schema$Request[] = [];
    // Insertar el texto nuevo al inicio (hereda estilo del índice 0).
    requests.push({ insertText: { objectId, insertionIndex: 0, text: newText } });
    // Borrar el texto viejo (ahora desplazado detrás del nuevo).
    if (currentLen > 0) {
      requests.push({
        deleteText: {
          objectId,
          textRange: {
            type: "FIXED_RANGE",
            startIndex: newText.length,
            endIndex: newText.length + currentLen,
          },
        },
      });
    }
    return this.batchUpdate(presentationId, requests);
  }

  /** Crea un cuadro de texto en una slide con posición/tamaño/contenido. */
  async insertTextbox(
    presentationId: string,
    opts: {
      pageObjectId: string;
      text: string;
      position: Position;
      size: Dimension;
      objectId?: string;
      fontSizePt?: number;
      bold?: boolean;
    },
  ): Promise<{ objectId: string; response: slides_v1.Schema$BatchUpdatePresentationResponse }> {
    assertObjectId(opts.pageObjectId, "pageObjectId");
    const boxId = opts.objectId ?? `tb_${Date.now().toString(36)}_${rand()}`;
    const requests: slides_v1.Schema$Request[] = [
      {
        createShape: {
          objectId: boxId,
          shapeType: "TEXT_BOX",
          elementProperties: {
            pageObjectId: opts.pageObjectId,
            size: toSize(opts.size),
            transform: toTransform(opts.position),
          },
        },
      },
      { insertText: { objectId: boxId, insertionIndex: 0, text: opts.text } },
    ];
    if (opts.fontSizePt || opts.bold) {
      requests.push({
        updateTextStyle: {
          objectId: boxId,
          textRange: { type: "ALL" },
          style: {
            bold: opts.bold ?? undefined,
            fontSize: opts.fontSizePt ? { magnitude: opts.fontSizePt, unit: "PT" } : undefined,
          },
          fields: [opts.bold != null ? "bold" : "", opts.fontSizePt ? "fontSize" : ""]
            .filter(Boolean)
            .join(","),
        },
      });
    }
    const response = await this.batchUpdate(presentationId, requests);
    return { objectId: boxId, response };
  }

  /** Inserta una imagen desde una URL accesible públicamente. */
  async insertImage(
    presentationId: string,
    opts: {
      pageObjectId: string;
      url: string;
      position: Position;
      size: Dimension;
      objectId?: string;
    },
  ): Promise<{ objectId: string; response: slides_v1.Schema$BatchUpdatePresentationResponse }> {
    assertObjectId(opts.pageObjectId, "pageObjectId");
    const imgId = opts.objectId ?? `img_${Date.now().toString(36)}_${rand()}`;
    const requests: slides_v1.Schema$Request[] = [
      {
        createImage: {
          objectId: imgId,
          url: opts.url,
          elementProperties: {
            pageObjectId: opts.pageObjectId,
            size: toSize(opts.size),
            transform: toTransform(opts.position),
          },
        },
      },
    ];
    const response = await this.batchUpdate(presentationId, requests);
    return { objectId: imgId, response };
  }

  /** Reemplaza la imagen de un objeto imagen existente por otra URL. */
  async replaceImage(
    presentationId: string,
    imageObjectId: string,
    url: string,
  ): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
    assertObjectId(imageObjectId, "imageObjectId");
    return this.batchUpdate(presentationId, [
      { replaceImage: { imageObjectId, url, imageReplaceMethod: "CENTER_INSIDE" } },
    ]);
  }

  /** Crea una tabla y la puebla con valores (matriz de strings). */
  async addTable(
    presentationId: string,
    opts: {
      pageObjectId: string;
      rows: number;
      columns: number;
      values?: string[][];
      position?: Position;
      size?: Dimension;
      objectId?: string;
    },
  ): Promise<{ objectId: string; response: slides_v1.Schema$BatchUpdatePresentationResponse }> {
    assertObjectId(opts.pageObjectId, "pageObjectId");
    if (opts.rows < 1 || opts.columns < 1) {
      throw new AppError("INVALID_ARGUMENT", "rows y columns deben ser >= 1");
    }
    const tableId = opts.objectId ?? `tbl_${Date.now().toString(36)}_${rand()}`;
    const requests: slides_v1.Schema$Request[] = [
      {
        createTable: {
          objectId: tableId,
          rows: opts.rows,
          columns: opts.columns,
          elementProperties: {
            pageObjectId: opts.pageObjectId,
            size: opts.size ? toSize(opts.size) : undefined,
            transform: opts.position ? toTransform(opts.position) : undefined,
          },
        },
      },
    ];
    // Poblar celdas (insertText por celda). Se ignoran celdas fuera de rango.
    if (opts.values) {
      for (let r = 0; r < opts.values.length && r < opts.rows; r++) {
        for (let c = 0; c < opts.values[r].length && c < opts.columns; c++) {
          const text = opts.values[r][c];
          if (text == null || text === "") continue;
          requests.push({
            insertText: {
              objectId: tableId,
              cellLocation: { rowIndex: r, columnIndex: c },
              text: String(text),
              insertionIndex: 0,
            },
          });
        }
      }
    }
    const response = await this.batchUpdate(presentationId, requests);
    return { objectId: tableId, response };
  }
}

// --- helpers ---------------------------------------------------------------

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

function toSize(d: Dimension): slides_v1.Schema$Size {
  const unit = d.unit ?? "EMU";
  return {
    width: { magnitude: d.width, unit },
    height: { magnitude: d.height, unit },
  };
}

function toTransform(p: Position): slides_v1.Schema$AffineTransform {
  return {
    scaleX: 1,
    scaleY: 1,
    translateX: p.x,
    translateY: p.y,
    unit: p.unit ?? "EMU",
  };
}

export function inchesToEmu(inches: number): number {
  return Math.round(inches * EMU_PER_INCH);
}

function findElement(
  presentation: slides_v1.Schema$Presentation,
  objectId: string,
): slides_v1.Schema$PageElement | null {
  const pages = [
    ...(presentation.slides ?? []),
    ...(presentation.masters ?? []),
    ...(presentation.layouts ?? []),
  ];
  for (const page of pages) {
    for (const el of page.pageElements ?? []) {
      if (el.objectId === objectId) return el;
    }
  }
  return null;
}
