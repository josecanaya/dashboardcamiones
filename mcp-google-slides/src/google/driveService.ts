import type { drive_v3 } from "googleapis";
import type { AppConfig } from "../config.js";
import { AppError, normalizeError } from "../lib/errors.js";
import { withRetry } from "../lib/retry.js";

const SLIDES_MIME = "application/vnd.google-apps.presentation";

export const EXPORT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  owners?: string[];
  parents?: string[];
}

export interface SearchResult {
  files: DriveFileSummary[];
  nextPageToken?: string;
}

/** Escapa comillas simples para queries `q` de Drive. */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Construye la query `q` de Drive para buscar presentaciones. Combina filtros
 * con AND. Siempre restringe a mimeType de Slides y a no-trashed.
 */
export function buildPresentationQuery(opts: {
  nameContains?: string;
  folderId?: string;
  modifiedAfter?: string; // RFC3339
  modifiedBefore?: string;
}): string {
  const clauses: string[] = [`mimeType = '${SLIDES_MIME}'`, "trashed = false"];
  if (opts.nameContains) {
    clauses.push(`name contains '${escapeDriveQueryValue(opts.nameContains)}'`);
  }
  if (opts.folderId) {
    clauses.push(`'${escapeDriveQueryValue(opts.folderId)}' in parents`);
  }
  if (opts.modifiedAfter) {
    clauses.push(`modifiedTime > '${escapeDriveQueryValue(opts.modifiedAfter)}'`);
  }
  if (opts.modifiedBefore) {
    clauses.push(`modifiedTime < '${escapeDriveQueryValue(opts.modifiedBefore)}'`);
  }
  return clauses.join(" and ");
}

export function mapDriveFile(f: drive_v3.Schema$File): DriveFileSummary {
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? undefined,
    modifiedTime: f.modifiedTime ?? undefined,
    webViewLink: f.webViewLink ?? undefined,
    owners: f.owners?.map((o) => o.emailAddress ?? o.displayName ?? "").filter(Boolean),
    parents: f.parents ?? undefined,
  };
}

export class DriveService {
  constructor(
    private drive: drive_v3.Drive,
    private cfg: AppConfig,
  ) {}

  private retryOpts(context: string) {
    return { maxRetries: this.cfg.GOOGLE_MAX_RETRIES, context };
  }

  /** Busca presentaciones con paginación (devuelve nextPageToken). */
  async searchPresentations(opts: {
    nameContains?: string;
    folderId?: string;
    modifiedAfter?: string;
    modifiedBefore?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<SearchResult> {
    const q = buildPresentationQuery(opts);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
    return withRetry(async () => {
      try {
        const res = await this.drive.files.list({
          q,
          pageSize,
          pageToken: opts.pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, owners(emailAddress,displayName), parents)",
          orderBy: "modifiedTime desc",
          spaces: "drive",
          corpora: "user",
          supportsAllDrives: false,
        });
        return {
          files: (res.data.files ?? []).map(mapDriveFile),
          nextPageToken: res.data.nextPageToken ?? undefined,
        };
      } catch (err) {
        throw normalizeError(err, "drive.files.list");
      }
    }, this.retryOpts("drive.files.list"));
  }

  /** Exporta una presentación como PDF o PPTX. Devuelve base64. */
  async exportPresentation(
    presentationId: string,
    format: "pdf" | "pptx",
  ): Promise<{ mimeType: string; base64: string; bytes: number }> {
    const mimeType = EXPORT_MIME[format];
    if (!mimeType) throw new AppError("INVALID_ARGUMENT", `Formato no soportado: ${format}`);
    return withRetry(async () => {
      try {
        const res = await this.drive.files.export(
          { fileId: presentationId, mimeType },
          { responseType: "arraybuffer" },
        );
        const buf = Buffer.from(res.data as ArrayBuffer);
        return { mimeType, base64: buf.toString("base64"), bytes: buf.length };
      } catch (err) {
        throw normalizeError(err, "drive.files.export");
      }
    }, this.retryOpts("drive.files.export"));
  }

  /** Duplica una presentación (files.copy), opcionalmente a otra carpeta. */
  async duplicatePresentation(
    sourceId: string,
    opts: { name?: string; folderId?: string } = {},
  ): Promise<DriveFileSummary> {
    return withRetry(async () => {
      try {
        const res = await this.drive.files.copy({
          fileId: sourceId,
          requestBody: {
            name: opts.name,
            parents: opts.folderId ? [opts.folderId] : undefined,
          },
          fields: "id, name, mimeType, modifiedTime, webViewLink, parents",
        });
        return mapDriveFile(res.data);
      } catch (err) {
        throw normalizeError(err, "drive.files.copy");
      }
    }, this.retryOpts("drive.files.copy"));
  }

  /** Mueve un archivo a una carpeta (usado tras crear una presentación). */
  async moveToFolder(fileId: string, folderId: string): Promise<void> {
    await withRetry(async () => {
      try {
        const meta = await this.drive.files.get({ fileId, fields: "parents" });
        const previousParents = (meta.data.parents ?? []).join(",");
        await this.drive.files.update({
          fileId,
          addParents: folderId,
          removeParents: previousParents || undefined,
          fields: "id, parents",
        });
      } catch (err) {
        throw normalizeError(err, "drive.files.update");
      }
    }, this.retryOpts("drive.files.update"));
  }
}
