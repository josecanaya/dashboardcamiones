import type { EtlTransformOutput } from './etlTransformContracts'
import { fetchRunTable, getRunSummary, listRunTables } from '../api/etlRunCacheApi'
import { persistedLegRowsToSegmentLegs } from './etlComposeRuns'
import { rebuildSegmentTimingIndexFromLegs } from './etlSegmentTiming'
import { aggregateCircuitTimingSummaries, circuitTimingJourneysFromCsvRows } from './etlCircuitTiming'

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
  const finalSummary = await getRunSummary(runId)
  if (summary.revision && summary.revision !== finalSummary.revision) throw new Error('La corrida cambió durante la carga. Volvé a cargar el período.')
  const rulesVersion = String((summary.manifest?.rulesVersion as string) ?? '')
  // stats.json conserva solo contadores: los índices se reconstruyen desde hechos persistidos.
  const stats = { ...summary.stats } as EtlTransformOutput['stats']
  stats.materializationRevisions = summary.revision ? { [runId]:summary.revision } : {}
  if (tables.circuit_timing_journeys) {
    const journeys = circuitTimingJourneysFromCsvRows(tables.circuit_timing_journeys.rows.map(row => Object.fromEntries(Object.entries(row).map(([key,value]) => [key, String(value ?? '')]))))
    const summaries = aggregateCircuitTimingSummaries(journeys)
    stats.circuitTiming = { journeys, summaries, circuitCodes: summaries.map(row => row.executiveCircuitCode) }
  } else stats.circuitTiming = null
  const legTable = tables.segment_timing_legs
  if (legTable) {
    const legs = persistedLegRowsToSegmentLegs(legTable.rows)
    if (legTable.rows.length && !legs.length) throw new Error('La corrida contiene tramos con un esquema incompatible. No es un período sin datos.')
    stats.segmentTiming = rebuildSegmentTimingIndexFromLegs(legs)
    stats.kpiTiemposBuilt = true
  } else if (stats.kpiTiemposBuilt && !Array.isArray(stats.segmentTiming?.aggregates)) {
    stats.kpiTiemposBuilt = false
    stats.segmentTiming = undefined
  }
  return {
    csv,
    tables: tables as unknown as EtlTransformOutput['tables'],
    stats,
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
