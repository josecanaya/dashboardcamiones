import fs from "node:fs";
import path from "node:path";
import type { sheets_v4, drive_v3 } from "googleapis";
import type { AppConfig } from "../config.js";
import { AppError, normalizeError } from "../lib/errors.js";
import { withRetry } from "../lib/retry.js";
import { mapDriveFile, escapeDriveQueryValue, type DriveFileSummary } from "./driveService.js";

/** MIME de una hoja de cálculo nativa de Google. */
export const SHEETS_MIME = "application/vnd.google-apps.spreadsheet";

/** MIME de un .xlsx subido a Drive (lo que deja la automatización del dashboard). */
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** MIME de una presentación nativa de Google. */
export const SLIDES_MIME = "application/vnd.google-apps.presentation";

/** MIME de un .pptx (el informe que arma `actualizar.py`). */
export const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Tipo de origen y destino de una subida, por extensión.
 *
 * La conversión es el punto del asunto: un `.pptx` subido tal cual queda como archivo
 * adjunto y los gráficos siguen siendo un binario opaco; convertido a Slides, cada
 * gráfico pasa a ser un objeto nativo editable. Lo mismo con `.xlsx` → hoja de Google.
 */
export const UPLOAD_KINDS: Record<string, { source: string; converted: string }> = {
  ".xlsx": { source: XLSX_MIME, converted: SHEETS_MIME },
  ".pptx": { source: PPTX_MIME, converted: SLIDES_MIME },
};

/** Resuelve los MIME de subida a partir de la extensión del archivo. */
export function uploadKindFor(localPath: string): { source: string; converted: string } {
  const ext = path.extname(localPath).toLowerCase();
  const kind = UPLOAD_KINDS[ext];
  if (!kind) {
    throw new AppError(
      "INVALID_ARGUMENT",
      `Extensión no soportada para subir: "${ext || "(sin extensión)"}". Soportadas: ${Object.keys(UPLOAD_KINDS).join(", ")}.`,
    );
  }
  return kind;
}

export interface SheetChartSummary {
  chartId: number;
  title?: string;
  /** Tipo de gráfico (COLUMN, LINE, BAR, PIE…). */
  type?: string;
  /** Rangos de datos que lee, como `sheetId:filaIni-filaFin:colIni-colFin` (0-based). */
  sources: string[];
}

export interface SheetTabSummary {
  sheetId: number;
  title: string;
  index: number;
  rowCount?: number;
  columnCount?: number;
  /** Gráficos anclados en esta pestaña. */
  charts?: SheetChartSummary[];
}

export interface SpreadsheetSummary {
  spreadsheetId: string;
  title: string;
  url: string;
  sheets: SheetTabSummary[];
}

export interface RangeValues {
  range: string;
  /** Filas tal como las devuelve Google: matriz irregular, sin relleno. */
  values: unknown[][];
  rows: number;
}

/** Rango de datos de un gráfico en forma compacta, para poder compararlo a simple vista. */
function sourceOf(r: sheets_v4.Schema$GridRange): string {
  return `${r.sheetId ?? 0}:${r.startRowIndex ?? 0}-${r.endRowIndex ?? ""}:${r.startColumnIndex ?? 0}-${r.endColumnIndex ?? ""}`;
}

/**
 * Resumen de un gráfico de la hoja: qué es y qué rangos lee.
 *
 * Los rangos son lo importante: dos gráficos con el mismo título pueden estar leyendo
 * filas distintas, y un gráfico que lee filas corridas muestra datos de otro sin avisar.
 */
function summarizeChart(c: sheets_v4.Schema$EmbeddedChart): SheetChartSummary {
  const spec = c.spec ?? {};
  const ranges: sheets_v4.Schema$GridRange[] = [];
  const add = (cd?: sheets_v4.Schema$ChartData | null) => {
    for (const r of cd?.sourceRange?.sources ?? []) ranges.push(r);
  };
  for (const dm of spec.basicChart?.domains ?? []) add(dm.domain);
  for (const se of spec.basicChart?.series ?? []) add(se.series);
  add(spec.pieChart?.domain);
  add(spec.pieChart?.series);
  return {
    chartId: c.chartId ?? 0,
    title: spec.title ?? undefined,
    type: spec.basicChart?.chartType ?? (spec.pieChart ? "PIE" : undefined),
    sources: ranges.map(sourceOf),
  };
}

/** URL canónica de una hoja de cálculo. */
export function spreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/**
 * Cita el nombre de una pestaña para un rango A1.
 *
 * Google exige comillas simples cuando el título tiene espacios, acentos o signos
 * (`Textos PPTX` → `'Textos PPTX'`), y dentro de las comillas el apóstrofo se duplica.
 * Sin esto, una hoja como `Textos PPTX!A1:C10` devuelve 400 y el informe queda a medias.
 */
export function quoteSheetTitle(title: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(title)) return title;
  return `'${title.replace(/'/g, "''")}'`;
}

/** Arma un rango A1 `'Hoja'!A1:C10` a partir de la pestaña y el rango de celdas. */
export function buildA1Range(sheetTitle: string, cells?: string): string {
  const tab = quoteSheetTitle(sheetTitle);
  return cells ? `${tab}!${cells}` : tab;
}

/**
 * Rellena una matriz irregular a un ancho fijo con `null`.
 *
 * `values.get` recorta las celdas vacías del final de cada fila, así que una fila
 * `["Jueves", "Ricardone"]` y otra `["Jueves", "Ricardone", 137]` llegan con largos
 * distintos. Para leer el Excel del informe por posición de columna (A=categoría,
 * B=serie, C=valor) hace falta el ancho estable.
 */
export function padRows(values: unknown[][], width?: number): unknown[][] {
  const w = width ?? values.reduce((max, r) => Math.max(max, r.length), 0);
  return values.map((r) => {
    const row = r.slice(0, w);
    while (row.length < w) row.push(null);
    return row;
  });
}

export class SheetsService {
  constructor(
    private sheets: sheets_v4.Sheets,
    private drive: drive_v3.Drive,
    private cfg: AppConfig,
  ) {}

  private retryOpts(context: string) {
    return { maxRetries: this.cfg.GOOGLE_MAX_RETRIES, context };
  }

  /** Pestañas y dimensiones de una hoja de cálculo (sin traer los valores). */
  async getMetadata(spreadsheetId: string): Promise<SpreadsheetSummary> {
    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.get({
          spreadsheetId,
          // Sin espacios y en notación de punto: la máscara de Sheets es más estricta
          // que la de Drive y rechaza `sheets(properties(...))` con un 400 genérico.
          fields:
            "spreadsheetId,properties.title,sheets.properties(sheetId,title,index,gridProperties(rowCount,columnCount))," +
            "sheets.charts(chartId,spec(title,basicChart(chartType,domains,series),pieChart(domain,series)))",
        });
        const d = res.data;
        return {
          spreadsheetId: d.spreadsheetId ?? spreadsheetId,
          title: d.properties?.title ?? "",
          url: spreadsheetUrl(d.spreadsheetId ?? spreadsheetId),
          sheets: (d.sheets ?? []).map((s) => ({
            sheetId: s.properties?.sheetId ?? 0,
            title: s.properties?.title ?? "",
            index: s.properties?.index ?? 0,
            rowCount: s.properties?.gridProperties?.rowCount ?? undefined,
            columnCount: s.properties?.gridProperties?.columnCount ?? undefined,
            charts: (s.charts ?? []).map(summarizeChart),
          })),
        };
      } catch (err) {
        throw normalizeError(err, "sheets.spreadsheets.get");
      }
    }, this.retryOpts("sheets.spreadsheets.get"));
  }

  /**
   * Lee uno o varios rangos A1 en una sola llamada (`values.batchGet`).
   *
   * `majorDimension: ROWS` y `valueRenderOption: UNFORMATTED_VALUE` son deliberados:
   * queremos el número crudo (137) y no el texto formateado ("137 min"), porque estos
   * valores van directo a un gráfico.
   */
  async getValues(
    spreadsheetId: string,
    ranges: string[],
    opts: { pad?: boolean; formatted?: boolean } = {},
  ): Promise<RangeValues[]> {
    if (ranges.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "Hay que pedir al menos un rango");
    }
    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.values.batchGet({
          spreadsheetId,
          ranges,
          majorDimension: "ROWS",
          valueRenderOption: opts.formatted ? "FORMATTED_VALUE" : "UNFORMATTED_VALUE",
          dateTimeRenderOption: "FORMATTED_STRING",
        });
        return (res.data.valueRanges ?? []).map((vr) => {
          const values = (vr.values ?? []) as unknown[][];
          const out = opts.pad === false ? values : padRows(values);
          return { range: vr.range ?? "", values: out, rows: out.length };
        });
      } catch (err) {
        throw normalizeError(err, "sheets.values.batchGet");
      }
    }, this.retryOpts("sheets.values.batchGet"));
  }

  /** Metadatos mínimos de un archivo de Drive, para decidir cómo leerlo. */
  async getFileInfo(fileId: string): Promise<DriveFileSummary> {
    return withRetry(async () => {
      try {
        const res = await this.drive.files.get({
          fileId,
          fields: "id, name, mimeType, modifiedTime, webViewLink, parents",
        });
        return mapDriveFile(res.data);
      } catch (err) {
        throw normalizeError(err, "drive.files.get");
      }
    }, this.retryOpts("drive.files.get"));
  }

  /**
   * Busca archivos en Drive por nombre, carpeta y/o tipo. A diferencia de
   * `DriveService.searchPresentations`, no fija el mimeType: sirve para encontrar
   * el Excel que la automatización deja en la carpeta del informe.
   */
  async searchFiles(opts: {
    nameContains?: string;
    folderId?: string;
    mimeType?: string;
    modifiedAfter?: string;
    pageSize?: number;
    pageToken?: string;
  }): Promise<{ files: DriveFileSummary[]; nextPageToken?: string }> {
    const clauses: string[] = ["trashed = false"];
    if (opts.nameContains) {
      clauses.push(`name contains '${escapeDriveQueryValue(opts.nameContains)}'`);
    }
    if (opts.folderId) clauses.push(`'${escapeDriveQueryValue(opts.folderId)}' in parents`);
    if (opts.mimeType) clauses.push(`mimeType = '${escapeDriveQueryValue(opts.mimeType)}'`);
    if (opts.modifiedAfter) {
      clauses.push(`modifiedTime > '${escapeDriveQueryValue(opts.modifiedAfter)}'`);
    }
    const q = clauses.join(" and ");
    const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);

    return withRetry(async () => {
      try {
        const res = await this.drive.files.list({
          q,
          pageSize,
          pageToken: opts.pageToken,
          fields:
            "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, parents)",
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

  /**
   * Convierte un `.xlsx` de Drive en una hoja de cálculo nativa y devuelve la copia.
   *
   * La API de Sheets no sabe leer un `.xlsx`: solo opera sobre hojas nativas. Por eso
   * el Excel que sube la automatización necesita este paso una vez por revisión. Es una
   * **copia**: el archivo original no se toca ni se reemplaza.
   */
  async importXlsxAsSpreadsheet(
    fileId: string,
    opts: { name?: string; folderId?: string } = {},
  ): Promise<DriveFileSummary> {
    const info = await this.getFileInfo(fileId);
    if (info.mimeType === SHEETS_MIME) {
      throw new AppError(
        "INVALID_ARGUMENT",
        `"${info.name}" ya es una hoja de cálculo de Google: leela directo con google_sheets_get_values.`,
      );
    }
    if (info.mimeType !== XLSX_MIME) {
      throw new AppError(
        "INVALID_ARGUMENT",
        `"${info.name}" no es un .xlsx (mimeType: ${info.mimeType ?? "desconocido"}).`,
      );
    }

    return withRetry(async () => {
      try {
        const res = await this.drive.files.copy({
          fileId,
          requestBody: {
            name: opts.name ?? `${info.name.replace(/\.xlsx$/i, "")} (Sheets)`,
            mimeType: SHEETS_MIME,
            parents: opts.folderId ? [opts.folderId] : undefined,
          },
          fields: "id, name, mimeType, modifiedTime, webViewLink, parents",
        });
        return mapDriveFile(res.data);
      } catch (err) {
        throw normalizeError(err, "drive.files.copy(xlsx→sheets)");
      }
    }, this.retryOpts("drive.files.copy(xlsx→sheets)"));
  }

  /**
   * Sube un archivo local a Drive. Con `convertToSheet` lo deja como hoja nativa de Google
   * en el mismo paso, que es lo que necesita el informe: el `.xlsx` que genera el dashboard
   * entra listo para leerse con `getValues`, sin el rodeo de subir y después copiar.
   *
   * Siempre **crea** un archivo nuevo: no sobrescribe ninguno existente, así que una revisión
   * nueva nunca pisa la anterior.
   */
  async uploadFile(
    localPath: string,
    opts: { name?: string; folderId?: string; convert?: boolean } = {},
  ): Promise<DriveFileSummary> {
    if (!fs.existsSync(localPath)) {
      throw new AppError("NOT_FOUND", `No existe el archivo local: ${localPath}`);
    }
    const kind = uploadKindFor(localPath);
    const convert = opts.convert !== false;
    const base = path.basename(localPath);
    const name = opts.name ?? (convert ? base.replace(/\.(xlsx|pptx)$/i, "") : base);
    const size = fs.statSync(localPath).size;

    return withRetry(async () => {
      try {
        const res = await this.drive.files.create(
          {
            requestBody: {
              name,
              parents: opts.folderId ? [opts.folderId] : undefined,
              mimeType: convert ? kind.converted : undefined,
            },
            media: { mimeType: kind.source, body: fs.createReadStream(localPath) },
            fields: "id, name, mimeType, modifiedTime, webViewLink, parents",
          },
          // El informe pesa decenas de MB: sin timeout propio la subida corta a la
          // mitad y Drive queda con un archivo incompleto.
          { timeout: Math.max(this.cfg.GOOGLE_HTTP_TIMEOUT_MS, 10 * 60_000) },
        );
        return { ...mapDriveFile(res.data), bytesUploaded: size } as DriveFileSummary & {
          bytesUploaded: number;
        };
      } catch (err) {
        throw normalizeError(err, "drive.files.create");
      }
    }, this.retryOpts("drive.files.create"));
  }

  /**
   * Manda un archivo a la papelera de Drive.
   *
   * Es a la papelera y no un borrado definitivo a propósito: el archivo se puede restaurar
   * durante 30 días desde el propio Drive. Una limpieza de copias viejas no justifica una
   * operación irreversible.
   */
  async trashFile(fileId: string): Promise<DriveFileSummary> {
    const info = await this.getFileInfo(fileId);
    return withRetry(async () => {
      try {
        const res = await this.drive.files.update({
          fileId,
          requestBody: { trashed: true },
          fields: "id, name, mimeType, modifiedTime, webViewLink, parents",
        });
        return { ...mapDriveFile(res.data), name: info.name };
      } catch (err) {
        throw normalizeError(err, "drive.files.update(trash)");
      }
    }, this.retryOpts("drive.files.update(trash)"));
  }

  /**
   * Escribe rangos puntuales sin tocar el resto de la hoja.
   *
   * Es la diferencia entre actualizar el informe y rehacerlo: `writeSheet` limpia la pestaña
   * entera, y una pestaña limpiada pierde el formato que alguien ajustó a mano. Acá solo se
   * pisan las celdas indicadas, así que los gráficos y su diseño sobreviven a la corrida
   * siguiente.
   */
  async updateValues(
    spreadsheetId: string,
    rangos: { range: string; values: unknown[][] }[],
  ): Promise<{ updatedRanges: number; updatedCells: number }> {
    if (rangos.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "Hay que indicar al menos un rango")
    }
    await this.ensureRows(spreadsheetId, rangos.map((r) => r.range));
    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: "RAW",
            data: rangos.map((r) => ({ range: r.range, values: r.values as unknown[][] })),
          },
        });
        return {
          updatedRanges: res.data.totalUpdatedSheets ?? rangos.length,
          updatedCells: res.data.totalUpdatedCells ?? 0,
        };
      } catch (err) {
        throw normalizeError(err, "sheets.values.batchUpdate");
      }
    }, this.retryOpts("sheets.values.batchUpdate"));
  }

  /**
   * Agranda las pestañas cuyo alto no alcanza para los rangos que se van a escribir.
   *
   * Sheets rechaza escribir más allá de la grilla (una pestaña nueva nace con 1000 filas) en
   * vez de agrandarla. Sin esto, un informe que crece una semana fallaría a la mitad de la
   * escritura, con parte de la hoja actualizada y parte no.
   */
  private async ensureRows(spreadsheetId: string, ranges: string[]): Promise<void> {
    const necesarias = new Map<string, number>();
    for (const r of ranges) {
      const bang = r.lastIndexOf("!");
      if (bang < 0) continue;
      const tab = r.slice(0, bang).replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
      const filas = [...r.slice(bang + 1).matchAll(/[A-Za-z]+(\d+)/g)].map((m) => Number(m[1]));
      if (!filas.length) continue;
      necesarias.set(tab, Math.max(necesarias.get(tab) ?? 0, ...filas));
    }
    if (!necesarias.size) return;
    const meta = await this.getMetadata(spreadsheetId);
    const requests: sheets_v4.Schema$Request[] = [];
    for (const [tab, filas] of necesarias) {
      const hoja = meta.sheets.find((s) => s.title === tab);
      if (!hoja || (hoja.rowCount ?? 0) >= filas) continue;
      // Un margen chico evita agrandar de a una fila en cada corrida.
      requests.push({
        appendDimension: { sheetId: hoja.sheetId, dimension: "ROWS", length: filas - (hoja.rowCount ?? 0) + 50 },
      });
    }
    if (!requests.length) return;
    await withRetry(async () => {
      try {
        await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
      } catch (err) {
        throw normalizeError(err, "sheets.appendDimension");
      }
    }, this.retryOpts("sheets.appendDimension"));
  }

  /**
   * Crea o reemplaza una pestaña con una matriz de valores.
   *
   * La usa el armado de gráficos: los datos del informe vienen en formato largo
   * (`categoría | serie | valor`, una fila por combinación) y un gráfico de Sheets con
   * varias series necesita cada serie en su propia columna. En vez de tocar las hojas
   * del informe —que son la fuente y no se deben alterar— se vuelca el pivote en una
   * pestaña de apoyo aparte.
   */
  async writeSheet(
    spreadsheetId: string,
    sheetTitle: string,
    values: unknown[][],
  ): Promise<{ sheetId: number; rows: number; columns: number }> {
    const meta = await this.getMetadata(spreadsheetId);
    const existing = meta.sheets.find((sh) => sh.title === sheetTitle);

    return withRetry(async () => {
      try {
        let sheetId = existing?.sheetId;
        if (existing === undefined) {
          const res = await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: { requests: [{ addSheet: { properties: { title: sheetTitle } } }] },
          });
          sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId ?? undefined;
        } else {
          // Limpiar antes de escribir: si la corrida nueva tiene menos filas, las viejas
          // quedarían colgando dentro del rango del gráfico.
          await this.sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: quoteSheetTitle(sheetTitle),
            requestBody: {},
          });
        }
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${quoteSheetTitle(sheetTitle)}!A1`,
          valueInputOption: "RAW",
          requestBody: { values: values as unknown[][] },
        });
        return {
          sheetId: sheetId ?? 0,
          rows: values.length,
          columns: values.reduce((m, r) => Math.max(m, r.length), 0),
        };
      } catch (err) {
        throw normalizeError(err, "sheets.writeSheet");
      }
    }, this.retryOpts("sheets.writeSheet"));
  }

  /**
   * Borra gráficos de la hoja por `chartId`.
   *
   * Un gráfico vinculado en Slides que se reemplaza deja su original huérfano en la hoja; sin
   * esto, cada reintento suma un gráfico invisible encima de la pestaña que el usuario usa.
   */
  async deleteCharts(spreadsheetId: string, chartIds: number[]): Promise<{ deleted: number }> {
    if (!chartIds.length) return { deleted: 0 };
    return withRetry(async () => {
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests: chartIds.map((objectId) => ({ deleteEmbeddedObject: { objectId } })) },
        });
        return { deleted: chartIds.length };
      } catch (err) {
        throw normalizeError(err, "sheets.deleteEmbeddedObject");
      }
    }, this.retryOpts("sheets.deleteEmbeddedObject"));
  }

  /**
   * Specs completas de los gráficos (tipo, series, colores, etiquetas) de toda la hoja.
   *
   * `getMetadata` resume; esto trae el `spec` entero porque `updateChartSpec` REEMPLAZA el
   * spec: para cambiar solo el estilo hay que partir del spec actual y devolverlo modificado.
   */
  async getCharts(spreadsheetId: string): Promise<{ sheetId: number; sheetTitle: string; chartId: number; spec: sheets_v4.Schema$ChartSpec }[]> {
    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.get({
          spreadsheetId,
          fields: "sheets.properties(sheetId,title),sheets.charts(chartId,spec)",
        });
        return (res.data.sheets ?? []).flatMap((sh) =>
          (sh.charts ?? []).map((c) => ({
            sheetId: sh.properties?.sheetId ?? 0,
            sheetTitle: sh.properties?.title ?? "",
            chartId: c.chartId ?? 0,
            spec: c.spec ?? {},
          })),
        );
      } catch (err) {
        throw normalizeError(err, "sheets.getCharts");
      }
    }, this.retryOpts("sheets.getCharts"));
  }

  /** `spreadsheets.batchUpdate` crudo: formato de celdas, specs de gráficos, etc. */
  async batchUpdate(spreadsheetId: string, requests: sheets_v4.Schema$Request[]): Promise<{ replies: number }> {
    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
        return { replies: res.data.replies?.length ?? 0 };
      } catch (err) {
        throw normalizeError(err, "sheets.batchUpdate");
      }
    }, this.retryOpts("sheets.batchUpdate"));
  }

  /**
   * Crea un gráfico dentro de la hoja de cálculo y devuelve su `chartId`.
   *
   * Es el paso previo obligatorio para tener un gráfico **vinculado** en Slides: la API de
   * Slides no sabe dibujar un gráfico, solo incrustar uno que ya vive en una hoja
   * (`createSheetsChart`). Hecho así, el gráfico de la presentación queda atado al rango:
   * se corrige un dato en la hoja y la slide se actualiza, en vez de quedar una imagen muerta.
   *
   * `domain` es el rango de las categorías y cada entrada de `series` es una columna de
   * valores. Los rangos son A1 dentro de esta misma hoja de cálculo.
   */
  async addChart(opts: {
    spreadsheetId: string;
    title?: string;
    chartType: "COLUMN" | "BAR" | "LINE" | "AREA" | "SCATTER" | "PIE";
    domain: string;
    series: string[];
    axisTitle?: string;
    legendPosition?: "BOTTOM_LEGEND" | "RIGHT_LEGEND" | "NO_LEGEND";
    anchorSheetTitle?: string;
  }): Promise<{ chartId: number; spreadsheetId: string }> {
    if (opts.series.length === 0) {
      throw new AppError("INVALID_ARGUMENT", "El gráfico necesita al menos una serie");
    }
    const meta = await this.getMetadata(opts.spreadsheetId);
    const idOf = (a1: string) => {
      const tab = a1.includes("!") ? a1.slice(0, a1.lastIndexOf("!")) : a1;
      const clean = tab.replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
      const hit = meta.sheets.find((sh) => sh.title === clean);
      if (!hit) {
        throw new AppError(
          "INVALID_ARGUMENT",
          `El rango "${a1}" apunta a una pestaña inexistente: "${clean}". Pestañas: ${meta.sheets.map((sh) => sh.title).join(", ")}.`,
        );
      }
      return hit.sheetId;
    };
    const ref = (a1: string): sheets_v4.Schema$ChartData => ({
      sourceRange: { sources: [gridRangeOf(a1, idOf(a1))] },
    });
    const anchorTitle = opts.anchorSheetTitle ?? meta.sheets[0].title;
    const anchorId = meta.sheets.find((sh) => sh.title === anchorTitle)?.sheetId ?? 0;

    const isPie = opts.chartType === "PIE";
    // En un gráfico de barras horizontales los valores van en el eje de abajo: Sheets rechaza
    // una serie apuntada al eje izquierdo («Bar charts series may only target the BOTTOM_AXIS»).
    const valueAxis = opts.chartType === "BAR" ? "BOTTOM_AXIS" : "LEFT_AXIS";
    const chartSpec: sheets_v4.Schema$ChartSpec = isPie
      ? {
          title: opts.title,
          hiddenDimensionStrategy: "SHOW_ALL",
          pieChart: {
            legendPosition: opts.legendPosition ?? "RIGHT_LEGEND",
            domain: ref(opts.domain),
            series: ref(opts.series[0]),
          },
        }
      : {
          title: opts.title,
          // Graficar también filas/columnas ocultas. Por defecto Sheets las saltea y, si la
          // pestaña tiene columnas ocultas (la de pivote las tiene, retocada a mano), el
          // gráfico nace SIN series y en la presentación aparece «Agrega una serie».
          hiddenDimensionStrategy: "SHOW_ALL",
          basicChart: {
            chartType: opts.chartType,
            legendPosition: opts.legendPosition ?? "BOTTOM_LEGEND",
            headerCount: 0,
            axis: opts.axisTitle
              ? [{ position: valueAxis, title: opts.axisTitle }]
              : undefined,
            domains: [{ domain: ref(opts.domain) }],
            series: opts.series.map((r) => ({ series: ref(r), targetAxis: valueAxis })),
          },
        };

    return withRetry(async () => {
      try {
        const res = await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: opts.spreadsheetId,
          requestBody: {
            requests: [
              {
                addChart: {
                  chart: {
                    spec: chartSpec,
                    position: {
                      overlayPosition: {
                        anchorCell: { sheetId: anchorId, rowIndex: 0, columnIndex: 10 },
                        widthPixels: 600,
                        heightPixels: 371,
                      },
                    },
                  },
                },
              },
            ],
          },
        });
        const chartId = res.data.replies?.[0]?.addChart?.chart?.chartId;
        if (typeof chartId !== "number") {
          throw new AppError("UPSTREAM_ERROR", "Google no devolvió el chartId del gráfico creado");
        }
        return { chartId, spreadsheetId: opts.spreadsheetId };
      } catch (err) {
        throw normalizeError(err, "sheets.addChart");
      }
    }, this.retryOpts("sheets.addChart"));
  }
}

/** Índice 0-based de una columna A1 (`A`→0, `C`→2, `AA`→26). */
export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Convierte un rango A1 (`Calada!A7:C12`) al `GridRange` que pide la API de Sheets,
 * que es 0-based y con el final **excluido**.
 */
export function gridRangeOf(a1: string, sheetId: number) {
  const cells = a1.includes("!") ? a1.slice(a1.lastIndexOf("!") + 1) : a1;
  const m = cells.match(/^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/);
  if (!m) {
    throw new AppError("INVALID_ARGUMENT", `Rango A1 no soportado para un gráfico: "${a1}"`);
  }
  return {
    sheetId,
    startRowIndex: Number(m[2]) - 1,
    endRowIndex: Number(m[4]),
    startColumnIndex: columnIndex(m[1]),
    endColumnIndex: columnIndex(m[3]) + 1,
  };
}
