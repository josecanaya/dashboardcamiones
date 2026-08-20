import { describe, it, expect, vi } from "vitest";
import type { drive_v3 } from "googleapis";
import {
  DriveService,
  buildPresentationQuery,
  mapDriveFile,
  escapeDriveQueryValue,
  EXPORT_MIME,
} from "../src/google/driveService.js";
import type { AppConfig } from "../src/config.js";

const cfg = { GOOGLE_MAX_RETRIES: 0 } as AppConfig;

describe("buildPresentationQuery", () => {
  it("siempre filtra por mimeType Slides y no-trashed", () => {
    const q = buildPresentationQuery({});
    expect(q).toContain("mimeType = 'application/vnd.google-apps.presentation'");
    expect(q).toContain("trashed = false");
  });
  it("agrega name contains, folder y fechas con AND", () => {
    const q = buildPresentationQuery({
      nameContains: "Comité",
      folderId: "FOLDER1",
      modifiedAfter: "2026-08-01T00:00:00Z",
      modifiedBefore: "2026-08-31T00:00:00Z",
    });
    expect(q).toContain("name contains 'Comité'");
    expect(q).toContain("'FOLDER1' in parents");
    expect(q).toContain("modifiedTime > '2026-08-01T00:00:00Z'");
    expect(q).toContain("modifiedTime < '2026-08-31T00:00:00Z'");
    expect(q.split(" and ").length).toBe(6);
  });
  it("escapa comillas simples (anti-inyección de query)", () => {
    expect(escapeDriveQueryValue("O'Higgins")).toBe("O\\'Higgins");
    const q = buildPresentationQuery({ nameContains: "a' or '1'='1" });
    expect(q).toContain("name contains 'a\\' or \\'1\\'=\\'1'");
  });
});

describe("mapDriveFile", () => {
  it("mapea campos y owners", () => {
    const f: drive_v3.Schema$File = {
      id: "F1",
      name: "Deck",
      mimeType: "application/vnd.google-apps.presentation",
      modifiedTime: "2026-08-20T10:00:00Z",
      webViewLink: "https://x",
      owners: [{ emailAddress: "a@b.com" }],
      parents: ["P1"],
    };
    expect(mapDriveFile(f)).toEqual({
      id: "F1",
      name: "Deck",
      mimeType: "application/vnd.google-apps.presentation",
      modifiedTime: "2026-08-20T10:00:00Z",
      webViewLink: "https://x",
      owners: ["a@b.com"],
      parents: ["P1"],
    });
  });
});

describe("DriveService.searchPresentations (paginación)", () => {
  it("propaga pageToken y devuelve nextPageToken", async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        files: [{ id: "F1", name: "Deck 1" }],
        nextPageToken: "TOKEN_2",
      },
    });
    const drive = { files: { list } } as unknown as drive_v3.Drive;
    const svc = new DriveService(drive, cfg);

    const page1 = await svc.searchPresentations({ nameContains: "Deck", pageSize: 1 });
    expect(page1.files).toHaveLength(1);
    expect(page1.nextPageToken).toBe("TOKEN_2");

    // segunda página usando el token
    await svc.searchPresentations({ pageToken: "TOKEN_2" });
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageToken: "TOKEN_2" }),
    );
  });

  it("clampa pageSize al rango 1..100", async () => {
    const list = vi.fn().mockResolvedValue({ data: { files: [] } });
    const drive = { files: { list } } as unknown as drive_v3.Drive;
    const svc = new DriveService(drive, cfg);
    await svc.searchPresentations({ pageSize: 9999 });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });
});

describe("DriveService.exportPresentation", () => {
  it("exporta a PDF y devuelve base64", async () => {
    const bytes = Buffer.from("%PDF-1.7 fake");
    const exportFn = vi.fn().mockResolvedValue({ data: bytes.buffer.slice(0) });
    const drive = { files: { export: exportFn } } as unknown as drive_v3.Drive;
    const svc = new DriveService(drive, cfg);
    const out = await svc.exportPresentation("PRES1", "pdf");
    expect(out.mimeType).toBe(EXPORT_MIME.pdf);
    expect(Buffer.from(out.base64, "base64").length).toBe(out.bytes);
    expect(exportFn).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "PRES1", mimeType: EXPORT_MIME.pdf }),
      expect.objectContaining({ responseType: "arraybuffer" }),
    );
  });

  it("rechaza formato no soportado", async () => {
    const drive = { files: { export: vi.fn() } } as unknown as drive_v3.Drive;
    const svc = new DriveService(drive, cfg);
    // @ts-expect-error prueba de runtime
    await expect(svc.exportPresentation("P", "docx")).rejects.toThrow();
  });
});

describe("DriveService.duplicatePresentation", () => {
  it("copia con nombre y carpeta destino", async () => {
    const copy = vi.fn().mockResolvedValue({ data: { id: "COPY1", name: "Copia", parents: ["F2"] } });
    const drive = { files: { copy } } as unknown as drive_v3.Drive;
    const svc = new DriveService(drive, cfg);
    const out = await svc.duplicatePresentation("SRC", { name: "Copia", folderId: "F2" });
    expect(out.id).toBe("COPY1");
    expect(copy).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "SRC",
        requestBody: { name: "Copia", parents: ["F2"] },
      }),
    );
  });
});
