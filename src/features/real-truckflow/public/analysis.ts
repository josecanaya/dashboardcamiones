import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { fetchRunTable, listWindows } from '../api/etlRunCacheApi'
import { composeRunsIntoTransformOutput, computeRangeCoverage } from '../etlWorkbench/etlComposeRuns'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
export type { RangeCoverage } from '../etlWorkbench/etlComposeRuns'
export function useAnalysisPeriod() {
  const wb = useEtlWorkbenchOptional()
  const range = wb?.dataPreparation.state.active
  const days = wb?.loadSummary?.daysDetected ?? []
  const revisions = wb?.transformResult?.stats.materializationRevisions
  return { from: range?.from ?? wb?.cachedWindow?.from ?? days[0] ?? null, to: range?.to ?? wb?.cachedWindow?.to ?? days[days.length - 1] ?? null, runIds: revisions && Object.keys(revisions).length ? Object.keys(revisions) : wb?.cachedWindow ? [wb.cachedWindow.runId] : (wb?.transformResult?.stats as { composedFrom?: string[] } | undefined)?.composedFrom ?? [], revisions }
}
/** Fachada pública: descarga únicamente la tabla pedida. */
export async function loadPointHistory(table: string, from: string, to: string) {
  const windows = (await listWindows()).filter(w => !w.stale)
  const coverage = computeRangeCoverage(from, to, windows)
  const loaded = await Promise.all(coverage.selectedRuns.map(async r => {
    const data = await fetchRunTable(r.runId, table)
    return { ...r, output: { tables: { [table]: data }, csv: {}, stats: {}, rulesVersion: windows.find(w => w.runId === r.runId)?.rulesVersion ?? '' } as unknown as EtlTransformOutput }
  }))
  return { csv: loaded.length ? composeRunsIntoTransformOutput(loaded, from, to).output.csv[table] : undefined, coverage }
}
