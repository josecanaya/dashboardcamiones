/**
 * Plan determinista de preparación (ficha R03 del cierre). Función pura: sin
 * fetch/Date.now/localStorage. El día actual llega vía `lastCompleteDay` (ayer en
 * America/Argentina/Buenos_Aires, calculado afuera).
 *
 * Reutiliza `historicalWeeks` (semanas canónicas L→D) y `computeRangeCoverage` (cobertura
 * por corridas guardadas) de los módulos existentes; no reinventa el calendario ni el
 * cálculo de cobertura. Ver `docs/rediseno/cierre/CONTRATO.md` §2 y §4.
 */
import { historicalWeeks, type HistoricalRange } from '../etlWorkbench/historicalPeriodLoader'
import { computeRangeCoverage, enumerateDays } from '../etlWorkbench/etlComposeRuns'
import type { SavedWindow } from '../api/etlRunCacheApi'
import type { DateRange, PreparationPlanStep, SourceDay, SourceState } from './types'

export type BuildPreparationPlanInput = {
  range: DateRange
  sourceDays: SourceDay[]
  /** Corridas ya verificadas vigentes (no stale) vía resolveWindow. */
  savedRuns: SavedWindow[]
  excelCoverage: { day: string; rows: number }[]
  /** Ayer en America/Argentina/Buenos_Aires, calculado afuera. */
  lastCompleteDay: string
  excelIncompleteAcknowledged: boolean
}

export type BuildPreparationPlanResult = {
  steps: PreparationPlanStep[]
  requiresExcelDecision: boolean
  limitations: string[]
  missingExcelDays: string[]
  usesFullyCachedCoverage: boolean
}

const DOWNLOAD_NOTE = 'Actualizar eventos y alertas del día'
const OPEN_WEEK_LIMITATION_PREFIX = 'Semana en curso · datos hasta '

function prevDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
}

const NEEDS_DOWNLOAD_STATES = new Set<SourceState>(['missing', 'partial', 'error', 'unknown'])

/** true si el día, según `sourceDays`, necesita descarga (eventos y/o alertas no disponibles). */
function dayNeedsDownload(sourceDays: SourceDay[], day: string): { needed: boolean; hasError: boolean } {
  const found = sourceDays.find((s) => s.day === day)
  if (!found) return { needed: true, hasError: false }
  const needed = NEEDS_DOWNLOAD_STATES.has(found.events.state) || NEEDS_DOWNLOAD_STATES.has(found.alerts.state)
  const hasError = found.events.state === 'error' || found.alerts.state === 'error'
  return { needed, hasError }
}

export function buildPreparationPlan(input: BuildPreparationPlanInput): BuildPreparationPlanResult {
  const { range, sourceDays, savedRuns, excelCoverage, lastCompleteDay, excelIncompleteAcknowledged } = input

  // Rango íntegramente futuro: nada que preparar.
  if (range.from > lastCompleteDay) {
    return {
      steps: [],
      requiresExcelDecision: false,
      limitations: ['El rango solicitado es futuro; no hay datos que preparar'],
      missingExcelDays: [],
      usesFullyCachedCoverage: false,
    }
  }

  const effectiveTo = range.to > lastCompleteDay ? lastCompleteDay : range.to
  const openFuture = range.to > lastCompleteDay

  const limitations: string[] = []
  const excelDaysInRange = enumerateDays(range.from, effectiveTo)
  const excelKnown = new Set(excelCoverage.map((c) => c.day))
  const missingExcelDays = excelDaysInRange.filter((d) => !excelKnown.has(d))
  const requiresExcelDecision = missingExcelDays.length > 0 && !excelIncompleteAcknowledged
  if (excelIncompleteAcknowledged && missingExcelDays.length > 0) {
    limitations.push(
      `Cobertura Excel incompleta (${missingExcelDays.length} días sin datos): ${missingExcelDays.join(', ')}`
    )
  }

  // ¿La cobertura vigente ya cubre todo el rango hasta el último día completo?
  const rangeCoverage = computeRangeCoverage(range.from, effectiveTo, savedRuns)
  if (rangeCoverage.missingDays.length === 0) {
    if (openFuture) limitations.push(`${OPEN_WEEK_LIMITATION_PREFIX}${lastCompleteDay}`)
    return {
      steps: [{ key: `load:${range.from}:${range.to}`, kind: 'load', from: range.from, to: range.to }],
      requiresExcelDecision,
      limitations,
      missingExcelDays,
      usesFullyCachedCoverage: true,
    }
  }

  const weeks: HistoricalRange[] = historicalWeeks(range)
  const downloadDays = new Set<string>()
  const sourceErrorDays = new Set<string>()
  const processSteps: PreparationPlanStep[] = []
  let openWeekLimitationAdded = false

  for (const week of weeks) {
    if (week.from > effectiveTo) continue // semana íntegramente futura: no cuenta como hueco.
    const weekEffectiveTo = week.to > effectiveTo ? effectiveTo : week.to
    const weekOpen = week.to > effectiveTo

    const weekCoverage = computeRangeCoverage(week.from, weekEffectiveTo, savedRuns)
    if (weekCoverage.missingDays.length === 0) continue // semana ya vigente: se omite.

    const carry = prevDay(week.from)
    const daysToCheck = [carry, ...enumerateDays(week.from, weekEffectiveTo)]
    for (const day of daysToCheck) {
      const { needed, hasError } = dayNeedsDownload(sourceDays, day)
      if (needed) downloadDays.add(day)
      if (hasError) sourceErrorDays.add(day)
    }

    processSteps.push({
      key: `process:${week.from}:${weekEffectiveTo}`,
      kind: 'process',
      from: week.from,
      to: weekEffectiveTo,
    })

    if (weekOpen && !openWeekLimitationAdded) {
      limitations.push(`${OPEN_WEEK_LIMITATION_PREFIX}${lastCompleteDay}`)
      openWeekLimitationAdded = true
    }
  }

  for (const day of Array.from(sourceErrorDays).sort()) {
    limitations.push(`No se pudo confirmar la fuente del día ${day} (error de inspección)`)
  }

  const downloadSteps: PreparationPlanStep[] = Array.from(downloadDays)
    .sort()
    .map((day) => ({ key: `download:${day}`, kind: 'download', from: day, to: day, note: DOWNLOAD_NOTE }))

  const loadStep: PreparationPlanStep = {
    key: `load:${range.from}:${range.to}`,
    kind: 'load',
    from: range.from,
    to: range.to,
  }

  return {
    steps: [...downloadSteps, ...processSteps, loadStep],
    requiresExcelDecision,
    limitations,
    missingExcelDays,
    usesFullyCachedCoverage: false,
  }
}
