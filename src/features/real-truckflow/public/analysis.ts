import { fetchRunTable, listWindows } from '../api/etlRunCacheApi'
import { composeRunsIntoTransformOutput, computeRangeCoverage } from '../etlWorkbench/etlComposeRuns'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
export type { RangeCoverage } from '../etlWorkbench/etlComposeRuns'
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
