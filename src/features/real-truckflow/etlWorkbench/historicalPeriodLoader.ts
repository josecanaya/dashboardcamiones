import { listWindows, resolveWindow, requestRunEtl, type SavedWindow } from '../api/etlRunCacheApi'
import { computeRangeCoverage, composeRunsIntoTransformOutput, type RangeCoverage } from './etlComposeRuns'
import { loadTransformOutputFromRun } from './etlTransformOutputFromDisk'
import type { EtlTransformOutput } from './etlTransformContracts'

export type HistoricalRange = { from: string; to: string }
export type HistoricalPeriodResult = {
  range: HistoricalRange
  coverage: RangeCoverage
  windows: SavedWindow[]
  staleWindows: SavedWindow[]
  output: EtlTransformOutput | null
  usedRunIds: string[]
  composed: boolean
  compositionCounts: { legCount: number; kpiRowCount: number } | null
}

export function validHistoricalRange({ from, to }: HistoricalRange): boolean {
  const valid = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  return valid(from) && valid(to) && from <= to
}

/** Semanas calendario, incluso cuando el usuario pide un rango parcial. */
export function historicalWeeks(range: HistoricalRange): HistoricalRange[] {
  if (!validHistoricalRange(range)) throw new Error('Elegí un rango de fechas válido: desde debe ser anterior o igual a hasta.')
  const start = new Date(`${range.from}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const weeks: HistoricalRange[] = []
  while (start.toISOString().slice(0, 10) <= range.to) {
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    weeks.push({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) })
    start.setUTCDate(start.getUTCDate() + 7)
  }
  return weeks
}

/**
 * Verifica vigencia de las corridas guardadas que solapan `range`. `listWindows` puede
 * conocer versiones desactualizadas; `resolveWindow` confirma también inputs actuales.
 * Reutilizada por `loadHistoricalPeriod` y por `preparationRunner` (R04) para no duplicar
 * el criterio de "vigente" entre ambos. No cambia cálculos: mismo comportamiento que antes.
 */
export async function inspectSavedWindowsValidity(
  range: HistoricalRange,
  deps: { listWindows: typeof listWindows; resolveWindow: typeof resolveWindow } = { listWindows, resolveWindow },
  options: { concurrency?: number } = {},
): Promise<SavedWindow[]> {
  const listed = await deps.listWindows()
  const overlapping = listed.filter(w => w.from <= range.to && w.to >= range.from)
  const limit = options.concurrency && options.concurrency > 0 ? options.concurrency : overlapping.length
  const checked: SavedWindow[] = []
  for (let i = 0; i < overlapping.length; i += limit) {
    const batch = overlapping.slice(i, i + limit)
    const results = await Promise.all(batch.map(async w => {
      const resolved = await deps.resolveWindow(w.from, w.to)
      return resolved ? { ...w, ...resolved } : { ...w, stale: true }
    }))
    checked.push(...results)
  }
  return listed.map(w => checked.find(c => c.from === w.from && c.to === w.to) ?? w)
}

/** Orquestación del cliente. Usa el compositor y runner existentes sin cambiar sus cálculos. */
export async function loadHistoricalPeriod(
  range: HistoricalRange,
  options: { processMissing?: boolean; onProgress?: (message: string) => void } = {},
): Promise<HistoricalPeriodResult> {
  const weeks = historicalWeeks(range)
  const inspect = () => inspectSavedWindowsValidity(range)
  let windows = await inspect()
  let coverage = computeRangeCoverage(range.from, range.to, windows.filter(w => !w.stale))
  if (options.processMissing && coverage.missingDays.length) {
    for (const week of weeks.filter(w => coverage.missingDays.some(d => d >= w.from && d <= w.to))) {
      options.onProgress?.(`Procesando semana ${week.from} → ${week.to}…`)
      const hit = await resolveWindow(week.from, week.to)
      if (!hit || hit.stale) await requestRunEtl(week.from, week.to, { force: Boolean(hit?.stale) })
    }
    windows = await inspect()
    coverage = computeRangeCoverage(range.from, range.to, windows.filter(w => !w.stale))
  }
  const staleWindows = windows.filter(w => w.stale && w.from <= range.to && w.to >= range.from)
  const base = { range, windows, coverage, staleWindows, usedRunIds: [] as string[], composed: false, compositionCounts: null }
  // No presentar una fracción del período como si estuviera completo.
  if (coverage.missingDays.length) return { ...base, output: null }
  options.onProgress?.('Cargando las tablas del período…')
  const exact = windows.find(w => !w.stale && w.from === range.from && w.to === range.to)
  if (exact) return { ...base, output: await loadTransformOutputFromRun(exact.runId), usedRunIds: [exact.runId] }
  const loaded = await Promise.all(coverage.selectedRuns.map(async r => ({
    ...r, output: await loadTransformOutputFromRun(r.runId),
  })))
  const result = composeRunsIntoTransformOutput(loaded, range.from, range.to)
  return { ...base, output: result.output, usedRunIds: result.usedRunIds, composed: true,
    compositionCounts: { legCount: result.composedLegCount, kpiRowCount: result.kpiRowCount } }
}
