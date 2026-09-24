import { describe, it, expect, vi } from "vitest";
import type { sheets_v4, drive_v3 } from "googleapis";
import {
  SheetsService,
  quoteSheetTitle,
  buildA1Range,
  padRows,
  spreadsheetUrl,
  SHEETS_MIME,
  XLSX_MIME,
  PPTX_MIME,
  SLIDES_MIME,
  gridRangeOf,
  columnIndex,
  uploadKindFor,
} from "../src/google/sheetsService.js";
import { AppError } from "../src/lib/errors.js";
import type { AppConfig } from "../src/config.js";

const cfg = { GOOGLE_MAX_RETRIES: 0 } as AppConfig;

describe("quoteSheetTitle", () => {
  it("deja los títulos simples sin comillas", () => {
    expect(quoteSheetTitle("Soja")).toBe("Soja");
    expect(quoteSheetTitle("Descargas_2")).toBe("Descargas_2");
  });
  it("cita los títulos con espacios o acentos", () => {
    expect(quoteSheetTitle("Textos PPTX")).toBe("'Textos PPTX'");
    expect(quoteSheetTitle("Girasol año")).toBe("'Girasol año'");
  });
  it("duplica el apóstrofo dentro de las comillas", () => {
    expect(quoteSheetTitle("O'Higgins")).toBe("'O''Higgins'");
  });
  it("cita un título que empieza con dígito (sería una referencia A1 ambigua)", () => {
    expect(quoteSheetTitle("2026 Soja")).toBe("'2026 Soja'");
  });
});

describe("buildA1Range", () => {
  it("arma hoja!celdas", () => {
    expect(buildA1Range("Soja", "A7:C11")).toBe("Soja!A7:C11");
    expect(buildA1Range("Textos PPTX", "C7:C9")).toBe("'Textos PPTX'!C7:C9");
  });
  it("sin celdas devuelve la pestaña entera", () => {
    expect(buildA1Range("Calada")).toBe("Calada");
  });
});

describe("padRows", () => {
  it("rellena con null hasta el ancho máximo", () => {
    expect(
      padRows([
        ["Jueves", "Ricardone"],
        ["Jueves", "San Lorenzo", 137],
      ]),
    ).toEqual([
      ["Jueves", "Ricardone", null],
      ["Jueves", "San Lorenzo", 137],
    ]);
  });
  it("respeta un ancho explícito y recorta el sobrante", () => {
    expect(padRows([["a", "b", "c", "d"]], 3)).toEqual([["a", "b", "c"]]);
    expect(padRows([["a"]], 3)).toEqual([["a", null, null]]);
  });
  it("no rompe con una matriz vacía", () => {
    expect(padRows([])).toEqual([]);
  });
});

function makeSheets(batchGet: unknown, get: unknown = { data: {} }) {
  return {
    spreadsheets: {
      get: vi.fn().mockResolvedValue(get),
      values: { batchGet: vi.fn().mockResolvedValue(batchGet) },
    },
  } as unknown as sheets_v4.Sheets;
}

describe("SheetsService.getValues", () => {
  it("pide los rangos en una sola llamada y devuelve filas parejas", async () => {
    const sheets = makeSheets({
      data: {
        valueRanges: [
          { range: "Soja!A21:C34", values: [["Jueves", "Ricardone"], ["Jueves", "San Lorenzo", 137]] },
        ],
      },
    });
    const svc = new SheetsService(sheets, {} as drive_v3.Drive, cfg);
    const out = await svc.getValues("SS1", ["Soja!A21:C34"]);

    expect(out).toHaveLength(1);
    expect(out[0].rows).toBe(2);
    expect(out[0].values).toEqual([
      ["Jueves", "Ricardone", null],
      ["Jueves", "San Lorenzo", 137],
    ]);
    const call = (sheets.spreadsheets.values.batchGet as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.ranges).toEqual(["Soja!A21:C34"]);
    expect(call.valueRenderOption).toBe("UNFORMATTED_VALUE");
  });

  it("formatted:true pide el texto de la celda en vez del número crudo", async () => {
    const sheets = makeSheets({ data: { valueRanges: [] } });
    const svc = new SheetsService(sheets, {} as drive_v3.Drive, cfg);
    await svc.getValues("SS1", ["Soja!A1:C2"], { formatted: true });
    const call = (sheets.spreadsheets.values.batchGet as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.valueRenderOption).toBe("FORMATTED_VALUE");
  });

  it("pad:false devuelve las filas tal cual las manda Google", async () => {
    const sheets = makeSheets({
      data: { valueRanges: [{ range: "S!A1:C2", values: [["a"], ["a", "b", 1]] }] },
    });
    const svc = new SheetsService(sheets, {} as drive_v3.Drive, cfg);
    const out = await svc.getValues("SS1", ["S!A1:C2"], { pad: false });
    expect(out[0].values).toEqual([["a"], ["a", "b", 1]]);
  });

  it("un rango ausente devuelve values vacío, no explota", async () => {
    const sheets = makeSheets({ data: { valueRanges: [{ range: "S!A1:C2" }] } });
    const svc = new SheetsService(sheets, {} as drive_v3.Drive, cfg);
    const out = await svc.getValues("SS1", ["S!A1:C2"]);
    expect(out[0].values).toEqual([]);
    expect(out[0].rows).toBe(0);
  });

  it("rechaza una lista de rangos vacía", async () => {
    const svc = new SheetsService(makeSheets({ data: {} }), {} as drive_v3.Drive, cfg);
    await expect(svc.getValues("SS1", [])).rejects.toBeInstanceOf(AppError);
  });
});

describe("SheetsService.getMetadata", () => {
  it("resume las pestañas con sus dimensiones", async () => {
    const sheets = makeSheets(
      { data: {} },
      {
        data: {
          spreadsheetId: "SS1",
          properties: { title: "Datos informe" },
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: "Soja",
                index: 0,
                gridProperties: { rowCount: 200, columnCount: 8 },
              },
            },
            { properties: { sheetId: 7, title: "Textos", index: 1 } },
          ],
        },
      },
    );
    const svc = new SheetsService(sheets, {} as drive_v3.Drive, cfg);
    const out = await svc.getMetadata("SS1");

    expect(out.title).toBe("Datos informe");
    expect(out.url).toBe(spreadsheetUrl("SS1"));
    expect(out.sheets.map((s) => s.title)).toEqual(["Soja", "Textos"]);
    expect(out.sheets[0].rowCount).toBe(200);
    expect(out.sheets[1].rowCount).toBeUndefined();
  });
});

function makeDrive(fileMime: string | undefined, copy?: unknown) {
  return {
    files: {
      get: vi.fn().mockResolvedValue({
        data: { id: "F1", name: "Datos.xlsx", mimeType: fileMime },
      }),
      copy: vi.fn().mockResolvedValue(copy ?? {
        data: { id: "SS_NEW", name: "Datos (Sheets)", mimeType: SHEETS_MIME },
      }),
      list: vi.fn(),
    },
  } as unknown as drive_v3.Drive;
}

describe("SheetsService.importXlsxAsSpreadsheet", () => {
  it("copia el .xlsx convirtiéndolo, sin tocar el original", async () => {
    const drive = makeDrive(XLSX_MIME);
    const svc = new SheetsService(makeSheets({ data: {} }), drive, cfg);
    const out = await svc.importXlsxAsSpreadsheet("F1");

    expect(out.id).toBe("SS_NEW");
    const call = (drive.files.copy as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.fileId).toBe("F1");
    expect(call.requestBody.mimeType).toBe(SHEETS_MIME);
    expect(call.requestBody.name).toBe("Datos (Sheets)");
    // No hay update/delete sobre el archivo fuente.
    expect((drive.files as unknown as Record<string, unknown>).update).toBeUndefined();
  });

  it("rechaza un archivo que ya es hoja de Google y explica qué hacer", async () => {
    const svc = new SheetsService(makeSheets({ data: {} }), makeDrive(SHEETS_MIME), cfg);
    await expect(svc.importXlsxAsSpreadsheet("F1")).rejects.toThrow(/ya es una hoja/);
  });

  it("rechaza un tipo que no es xlsx", async () => {
    const svc = new SheetsService(makeSheets({ data: {} }), makeDrive("application/pdf"), cfg);
    await expect(svc.importXlsxAsSpreadsheet("F1")).rejects.toThrow(/no es un \.xlsx/);
  });
});

describe("SheetsService.searchFiles", () => {
  it("arma la query sin fijar mimeType y escapa los valores", async () => {
    const drive = makeDrive(XLSX_MIME);
    (drive.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { files: [{ id: "F1", name: "Datos.xlsx" }], nextPageToken: "T2" },
    });
    const svc = new SheetsService(makeSheets({ data: {} }), drive, cfg);
    const out = await svc.searchFiles({ nameContains: "O'Higgins", folderId: "FOLD1" });

    const q = (drive.files.list as ReturnType<typeof vi.fn>).mock.calls[0][0].q as string;
    expect(q).toContain("trashed = false");
    expect(q).toContain("name contains 'O\\'Higgins'");
    expect(q).toContain("'FOLD1' in parents");
    expect(q).not.toContain("mimeType =");
    expect(out.nextPageToken).toBe("T2");
  });

  it("filtra por mimeType cuando se pide", async () => {
    const drive = makeDrive(XLSX_MIME);
    (drive.files.list as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { files: [] } });
    const svc = new SheetsService(makeSheets({ data: {} }), drive, cfg);
    await svc.searchFiles({ mimeType: XLSX_MIME });
    const q = (drive.files.list as ReturnType<typeof vi.fn>).mock.calls[0][0].q as string;
    expect(q).toContain(`mimeType = '${XLSX_MIME}'`);
  });
});

describe("gridRangeOf", () => {
  it("convierte A1 a GridRange 0-based con fin excluido", () => {
    expect(gridRangeOf("Calada!A7:C12", 3)).toEqual({
      sheetId: 3,
      startRowIndex: 6,
      endRowIndex: 12,
      startColumnIndex: 0,
      endColumnIndex: 3, // C incluida: el fin del GridRange es excluido
    });
  });
  it("acepta un rango sin pestaña y columnas de dos letras", () => {
    expect(gridRangeOf("AA1:AB2", 0)).toEqual({
      sheetId: 0,
      startRowIndex: 0,
      endRowIndex: 2,
      startColumnIndex: 26,
      endColumnIndex: 28,
    });
  });
  it("acepta una pestaña citada con espacios", () => {
    expect(gridRangeOf("'Graficos pivote'!B4:B9", 9).startColumnIndex).toBe(1);
  });
  it("rechaza un rango abierto (columna entera)", () => {
    expect(() => gridRangeOf("Soja!A:C", 0)).toThrow(AppError);
  });
});

describe("columnIndex", () => {
  it("mapea letras a índice 0-based", () => {
    expect(columnIndex("A")).toBe(0);
    expect(columnIndex("C")).toBe(2);
    expect(columnIndex("Z")).toBe(25);
    expect(columnIndex("AA")).toBe(26);
  });
});

describe("uploadKindFor", () => {
  it("resuelve .xlsx a hoja de Google y .pptx a presentación", () => {
    expect(uploadKindFor("C:/x/Datos.xlsx")).toEqual({ source: XLSX_MIME, converted: SHEETS_MIME });
    expect(uploadKindFor("C:/x/Informe.PPTX")).toEqual({ source: PPTX_MIME, converted: SLIDES_MIME });
  });
  it("rechaza una extensión que Drive no convierte", () => {
    expect(() => uploadKindFor("C:/x/informe.pdf")).toThrow(/no soportada/);
  });
});
