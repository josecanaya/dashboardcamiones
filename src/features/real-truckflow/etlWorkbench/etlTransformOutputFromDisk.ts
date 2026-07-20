import type { EtlTransformOutput } from './etlTransformPipeline'
import { fetchRunTable, getRunSummary, listRunTables } from '../api/etlRunCacheApi'

/**
 * Reconstruye un EtlTransformOutput a partir de runs/windows/<runId>/ (o legacy).
 * No corre el pipeline: hidrata la vista con el resultado ya materializado (tablas núcleo).
 */
export async function loadTransformOutputFromRun(runId: string): Promise<EtlTransformOutput> {
  const [summary, tableNames] = await Promise.all([getRunSummary(runId), listRunTables(runId)])
  const tables: Record<string, { headers: string[]; rows: Record<string, unknown>[] }> = {}
  const csv: Record<string, string> = {}
  for (const name of tableNames) {
    const t = await fetchRunTable(runId, name)
    tables[name] = t
    csv[name] = serializeCsv(t.headers, t.rows)
  }
  const rulesVersion = String((summary.manifest?.rulesVersion as string) ?? '')
  return {
    csv,
    tables: tables as unknown as EtlTransformOutput['tables'],
    stats: summary.stats as EtlTransformOutput['stats'],
    rulesVersion: rulesVersion as EtlTransformOutput['rulesVersion'],
  }
}

function serializeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  if (!headers.length) return ''
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}
