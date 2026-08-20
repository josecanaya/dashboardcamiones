import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import { AppError, toToolError } from "../lib/errors.js";
import { extractPresentationId, presentationUrl } from "../lib/urls.js";
import { logger } from "../lib/logging.js";
import { getGoogleClients } from "../google/googleClient.js";
import { SlidesService } from "../google/slidesService.js";
import { DriveService } from "../google/driveService.js";
import * as S from "./schemas.js";

/** Operaciones de batchUpdate consideradas destructivas / reemplazo masivo. */
const DESTRUCTIVE_OPS = new Set<string>([
  "deleteObject",
  "deleteText",
  "deleteTableRow",
  "deleteTableColumn",
  "replaceAllText",
  "replaceAllShapesWithImage",
  "replaceAllShapesWithSheetsChart",
  "replaceImage",
]);

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const e = toToolError(err);
  logger.error("Tool error", e);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: e }, null, 2) }],
    isError: true,
  };
}

/** Envuelve un handler para capturar errores y normalizarlos. */
function guard<T>(fn: (args: T) => Promise<CallToolResult>) {
  return async (args: T): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return fail(err);
    }
  };
}

export function registerTools(server: McpServer, cfg: AppConfig): void {
  const uid = (u?: string) => u ?? cfg.DEFAULT_USER_ID;

  async function services(userId: string) {
    const { slides, drive } = await getGoogleClients(cfg, userId);
    return { slides: new SlidesService(slides, cfg), drive: new DriveService(drive, cfg) };
  }

  // 1. GET PRESENTATION -------------------------------------------------------
  server.registerTool(
    "google_slides_get_presentation",
    {
      title: "Leer presentación (Google Slides)",
      description:
        "Devuelve título, dimensiones, diapositivas, textos, notas del orador, elementos y objectIds de una presentación. Acepta URL o ID.",
      inputSchema: S.getPresentationShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async (a: { presentation: string; userId?: string }) => {
      const { slides } = await services(uid(a.userId));
      const id = extractPresentationId(a.presentation);
      const summary = await slides.getPresentationSummary(id);
      return ok({ ...summary, url: presentationUrl(id) });
    }),
  );

  // 2. CREATE PRESENTATION ----------------------------------------------------
  server.registerTool(
    "google_slides_create_presentation",
    {
      title: "Crear presentación",
      description: "Crea una presentación nueva. Opcionalmente la mueve a una carpeta de Drive.",
      inputSchema: S.createPresentationShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(async (a: { title: string; folderId?: string; userId?: string }) => {
      const userId = uid(a.userId);
      const { slides, drive } = await services(userId);
      const created = await slides.createPresentation(a.title);
      const id = created.presentationId ?? "";
      if (a.folderId && id) await drive.moveToFolder(id, a.folderId);
      return ok({ presentationId: id, title: created.title, url: presentationUrl(id) });
    }),
  );

  // 3. DUPLICATE PRESENTATION -------------------------------------------------
  server.registerTool(
    "google_slides_duplicate_presentation",
    {
      title: "Duplicar presentación (plantilla)",
      description:
        "Duplica una presentación existente para usarla como plantilla. Permite nombre y carpeta destino.",
      inputSchema: S.duplicatePresentationShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(async (a: { presentation: string; name?: string; folderId?: string; userId?: string }) => {
      const { drive } = await services(uid(a.userId));
      const sourceId = extractPresentationId(a.presentation);
      const copy = await drive.duplicatePresentation(sourceId, {
        name: a.name,
        folderId: a.folderId,
      });
      return ok({ ...copy, url: presentationUrl(copy.id) });
    }),
  );

  // 4. LIST SLIDES ------------------------------------------------------------
  server.registerTool(
    "google_slides_list_slides",
    {
      title: "Listar diapositivas",
      description:
        "Devuelve el orden, objectId, título y contenido resumido de cada diapositiva.",
      inputSchema: S.listSlidesShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async (a: { presentation: string; userId?: string }) => {
      const { slides } = await services(uid(a.userId));
      const id = extractPresentationId(a.presentation);
      const summary = await slides.getPresentationSummary(id);
      const list = summary.slides.map((s) => ({
        index: s.index,
        objectId: s.objectId,
        title: s.title ?? null,
        text: s.text,
        elementCount: s.elements.length,
      }));
      return ok({ presentationId: id, slideCount: list.length, slides: list });
    }),
  );

  // 5. ADD SLIDE --------------------------------------------------------------
  server.registerTool(
    "google_slides_add_slide",
    {
      title: "Agregar diapositiva",
      description: "Agrega una diapositiva con un layout dado en una posición determinada.",
      inputSchema: S.addSlideShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        layout?: string;
        insertionIndex?: number;
        objectId?: string;
        userId?: string;
      }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        const { objectId } = await slides.addSlide(id, {
          layout: a.layout,
          insertionIndex: a.insertionIndex,
          objectId: a.objectId,
        });
        return ok({ presentationId: id, newSlideObjectId: objectId });
      },
    ),
  );

  // 6. REPLACE TEXT (placeholders) --------------------------------------------
  server.registerTool(
    "google_slides_replace_text",
    {
      title: "Reemplazar texto / placeholders",
      description:
        "Reemplaza placeholders como {{FECHA}}, {{PLANTA}}, {{TOTAL_CAMIONES}} en toda la presentación o en slides específicas.",
      inputSchema: S.replaceTextShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        replacements: Record<string, string>;
        pageObjectIds?: string[];
        matchCase?: boolean;
        userId?: string;
      }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        const res = await slides.replaceText(id, a.replacements, {
          pageObjectIds: a.pageObjectIds,
          matchCase: a.matchCase,
        });
        const occurrences = (res.replies ?? []).reduce(
          (sum, r) => sum + (r.replaceAllText?.occurrencesChanged ?? 0),
          0,
        );
        return ok({ presentationId: id, occurrencesChanged: occurrences });
      },
    ),
  );

  // 7. UPDATE TEXT ELEMENT ----------------------------------------------------
  server.registerTool(
    "google_slides_update_text_element",
    {
      title: "Actualizar cuadro de texto por objectId",
      description:
        "Actualiza el texto de un shape por objectId. Preserva el formato del inicio del texto en lo posible.",
      inputSchema: S.updateTextElementShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: { presentation: string; objectId: string; text: string; userId?: string }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        await slides.updateTextElement(id, a.objectId, a.text);
        return ok({ presentationId: id, objectId: a.objectId, updated: true });
      },
    ),
  );

  // 8. INSERT TEXTBOX ---------------------------------------------------------
  server.registerTool(
    "google_slides_insert_textbox",
    {
      title: "Insertar cuadro de texto",
      description: "Crea un cuadro de texto con posición, tamaño, contenido y formato básico.",
      inputSchema: S.insertTextboxShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        pageObjectId: string;
        text: string;
        position: { x: number; y: number; unit?: "EMU" | "PT" };
        size: { width: number; height: number; unit?: "EMU" | "PT" };
        fontSizePt?: number;
        bold?: boolean;
        objectId?: string;
        userId?: string;
      }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        const { objectId } = await slides.insertTextbox(id, {
          pageObjectId: a.pageObjectId,
          text: a.text,
          position: a.position,
          size: a.size,
          fontSizePt: a.fontSizePt,
          bold: a.bold,
          objectId: a.objectId,
        });
        return ok({ presentationId: id, objectId });
      },
    ),
  );

  // 9. INSERT / REPLACE IMAGE -------------------------------------------------
  server.registerTool(
    "google_slides_insert_image",
    {
      title: "Insertar o reemplazar imagen",
      description:
        "Inserta una imagen desde una URL accesible; o reemplaza una imagen existente si se pasa replaceImageObjectId.",
      inputSchema: S.insertImageShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        pageObjectId: string;
        url: string;
        position: { x: number; y: number; unit?: "EMU" | "PT" };
        size: { width: number; height: number; unit?: "EMU" | "PT" };
        replaceImageObjectId?: string;
        objectId?: string;
        userId?: string;
      }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        if (a.replaceImageObjectId) {
          await slides.replaceImage(id, a.replaceImageObjectId, a.url);
          return ok({ presentationId: id, replacedImageObjectId: a.replaceImageObjectId });
        }
        const { objectId } = await slides.insertImage(id, {
          pageObjectId: a.pageObjectId,
          url: a.url,
          position: a.position,
          size: a.size,
          objectId: a.objectId,
        });
        return ok({ presentationId: id, objectId });
      },
    ),
  );

  // 10. ADD TABLE -------------------------------------------------------------
  server.registerTool(
    "google_slides_add_table",
    {
      title: "Agregar tabla",
      description: "Crea una tabla y carga sus valores. Define filas, columnas, posición y tamaño.",
      inputSchema: S.addTableShape,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        pageObjectId: string;
        rows: number;
        columns: number;
        values?: string[][];
        position?: { x: number; y: number; unit?: "EMU" | "PT" };
        size?: { width: number; height: number; unit?: "EMU" | "PT" };
        objectId?: string;
        userId?: string;
      }) => {
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        const { objectId } = await slides.addTable(id, {
          pageObjectId: a.pageObjectId,
          rows: a.rows,
          columns: a.columns,
          values: a.values,
          position: a.position,
          size: a.size,
          objectId: a.objectId,
        });
        return ok({ presentationId: id, objectId });
      },
    ),
  );

  // 11. DELETE SLIDE (destructiva) --------------------------------------------
  server.registerTool(
    "google_slides_delete_slide",
    {
      title: "Eliminar diapositiva (DESTRUCTIVA)",
      description:
        "Elimina una diapositiva por objectId. Acción destructiva: requiere confirm=true.",
      inputSchema: S.deleteSlideShape,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    guard(
      async (a: { presentation: string; slideObjectId: string; confirm: boolean; userId?: string }) => {
        if (a.confirm !== true) {
          throw new AppError(
            "INVALID_ARGUMENT",
            "Acción destructiva: pasá confirm=true para eliminar la diapositiva.",
          );
        }
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        await slides.deleteSlide(id, a.slideObjectId);
        return ok({ presentationId: id, deletedSlideObjectId: a.slideObjectId });
      },
    ),
  );

  // 12. BATCH UPDATE ----------------------------------------------------------
  server.registerTool(
    "google_slides_batch_update",
    {
      title: "batchUpdate crudo (validado)",
      description:
        "Ejecuta operaciones de presentations.batchUpdate. Valida cada request contra una allowlist. Requiere confirm=true si hay operaciones destructivas/reemplazo masivo.",
      inputSchema: S.batchUpdateShape,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    guard(
      async (a: {
        presentation: string;
        requests: Array<Record<string, unknown>>;
        confirm?: boolean;
        userId?: string;
      }) => {
        const hasDestructive = a.requests.some((r) =>
          Object.keys(r ?? {}).some((k) => DESTRUCTIVE_OPS.has(k)),
        );
        if (hasDestructive && a.confirm !== true) {
          const ops = a.requests
            .flatMap((r) => Object.keys(r ?? {}))
            .filter((k) => DESTRUCTIVE_OPS.has(k));
          throw new AppError(
            "INVALID_ARGUMENT",
            `El batch incluye operaciones destructivas (${[...new Set(ops)].join(", ")}). Pasá confirm=true para ejecutarlo.`,
          );
        }
        const { slides } = await services(uid(a.userId));
        const id = extractPresentationId(a.presentation);
        const res = await slides.batchUpdate(id, a.requests as never);
        return ok({ presentationId: id, replies: res.replies ?? [] });
      },
    ),
  );

  // 13. DRIVE SEARCH PRESENTATIONS --------------------------------------------
  server.registerTool(
    "google_drive_search_presentations",
    {
      title: "Buscar presentaciones (Drive)",
      description:
        "Busca presentaciones accesibles por nombre, carpeta o fecha de modificación. Devuelve nextPageToken para paginar.",
      inputSchema: S.searchPresentationsShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(
      async (a: {
        nameContains?: string;
        folderId?: string;
        modifiedAfter?: string;
        modifiedBefore?: string;
        pageSize?: number;
        pageToken?: string;
        userId?: string;
      }) => {
        const { drive } = await services(uid(a.userId));
        const result = await drive.searchPresentations(a);
        return ok(result);
      },
    ),
  );

  // 14. DRIVE EXPORT PRESENTATION ---------------------------------------------
  server.registerTool(
    "google_drive_export_presentation",
    {
      title: "Exportar presentación (PDF/PPTX)",
      description:
        "Exporta una presentación como PDF o PPTX. Devuelve el archivo en base64 (útil para descarga posterior).",
      inputSchema: S.exportPresentationShape,
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guard(async (a: { presentation: string; format: "pdf" | "pptx"; userId?: string }) => {
      const { drive } = await services(uid(a.userId));
      const id = extractPresentationId(a.presentation);
      const exported = await drive.exportPresentation(id, a.format);
      return ok({
        presentationId: id,
        format: a.format,
        mimeType: exported.mimeType,
        bytes: exported.bytes,
        base64: exported.base64,
      });
    }),
  );

  logger.info("Tools MCP registradas", { count: 14 });
}
