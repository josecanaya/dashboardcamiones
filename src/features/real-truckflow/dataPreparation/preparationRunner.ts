/**
 * Orquestador de la preparación de datos (ficha R04 del cierre). Sin React: función/factoría
 * con dependencias inyectadas. Ver `docs/rediseno/cierre/CONTRATO.md` §2–4 y
 * `docs/rediseno/cierre/tareas/R04.md`.
 *
 * Orden fijo (§4): inspect → descargas pendientes (días asc) → re-inspect sources →
 * procesar semanas pendientes (asc) → resolve vigente → cargar tablas → publish atómico →
 * dispatch LOAD_SUCCEEDED → phase 'ready'.
 *
 * ## operationId (decisión de diseño)
 * El reducer (R03, `preparationReducer.ts`, no se toca acá) sólo tiene una forma de mover su
 * contador `operationId`: la acción `CHECK_STARTED` (se autoincrementa dentro del reducer, no
 * recibe el valor por parámetro). Como este runner es la única pieza que despacha
 * `CHECK_STARTED`, mantiene un contador local (`operationId`) que se incrementa exactamente
 * en los mismos puntos en que despacha `CHECK_STARTED` — así el contador del runner queda
 * siempre igual al del reducer, sin necesidad de leer el estado de vuelta (imposible de forma
 * síncrona con `useReducer`). Tanto `inspect()` como `execute()` despachan `CHECK_STARTED` +
 * `CHECK_SUCCEEDED` (éste último ya sea con el plan recién calculado, o re-publicando el plan
 * recibido por parámetro en `execute`), así que cada llamada a `execute()` sí incrementa el
 * contador, tal como pide la ficha. El resto de las acciones (`STEP_*`, `LOAD_SUCCEEDED`)
 * llevan ese mismo id y el reducer las descarta solo si no coincide con el suyo.
 *
 * ## Stop sin cancelar la llamada activa
 * `requestStop()` marca `stopRequested` y libera el lock (`running = false`) de inmediato, sin
 * tocar la petición en curso (no hay `AbortController`: el proceso del servidor sigue). Esto
 * permite iniciar un nuevo `execute()` sin esperar a que la llamada vieja resuelva. Cuando esa
 * llamada vieja finalmente resuelve, compara su `opId` capturado contra el contador actual del
 * runner: si difiere (porque un nuevo `execute()` ya lo incrementó), descarta su resultado en
 * silencio (no despacha nada) — así nunca pisa el estado de la operación nueva. Si nadie
 * arrancó una operación nueva, el paso activo termina normalmente, se despacha su resultado y
 * recién ahí, si `stopRequested` sigue en pie, se despacha `STOPPED` (fase `interrupted`).
 */
import { postSourceAvailability, postTruckflowExportOneDay } from '../api/truckflowLocalServerApi'
import { getMovimientosBackupCoverage } from '../api/movimientosBackupApi'
import { listWindows, resolveWindow, requestRunEtl, type SavedWindow } from '../api/etlRunCacheApi'
import { loadHistoricalPeriod, historicalWeeks, inspectSavedWindowsValidity, type HistoricalRange } from '../etlWorkbench/historicalPeriodLoader'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
import { buildPreparationPlan, type BuildPreparationPlanResult } from './buildPreparationPlan'
import type { DateRange, PreparationAction, PreparationPlanStep, SourceDay } from './types'

/** Máximo de `resolveWindow` en paralelo al verificar vigencia (CONTRATO §2). */
const RESOLVE_CONCURRENCY = 4

/** Resultado de `inspect()`: el plan más el detalle que necesita `CHECK_SUCCEEDED`. */
export type PreparationInspection = BuildPreparationPlanResult & {
  range: DateRange
  sourceDays: SourceDay[]
  /** Presente cuando la inspección misma falló (red, etc.), no una fuente puntual. */
  error: string | null
}

export type PreparationRunnerDeps = {
  postSourceAvailability: typeof postSourceAvailability
  getMovimientosBackupCoverage: typeof getMovimientosBackupCoverage
  listWindows: typeof listWindows
  resolveWindow: typeof resolveWindow
  requestRunEtl: typeof requestRunEtl
  postTruckflowExportOneDay: typeof postTruckflowExportOneDay
  loadHistoricalPeriod: typeof loadHistoricalPeriod
  dispatch: (action: PreparationAction) => void
  publish: (output: EtlTransformOutput) => void
  /** Inyectable para tests. Milisegundos epoch; no se usa hoy salvo por compatibilidad. */
  now?: () => number
  /** Inyectable para tests. Fecha civil de hoy en America/Argentina/Buenos_Aires (YYYY-MM-DD). */
  todayIso?: () => string
}

export type PreparationRunner = {
  inspect(range: DateRange, options?: { excelIncompleteAcknowledged?: boolean }): Promise<PreparationInspection>
  execute(plan: PreparationInspection, options?: Record<string, never>): Promise<void>
  requestStop(): void
}

function defaultTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

function addDaysIso(day: string, delta: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + delta * 86400000).toISOString().slice(0, 10)
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function createPreparationRunner(deps: PreparationRunnerDeps): PreparationRunner {
  const todayIso = deps.todayIso ?? defaultTodayIso
  let operationId = 0
  let running = false
  let stopRequested = false

  /** Recalcula el plan (lecturas únicamente, sin POSTs) para `range`. */
  async function inspect(
    range: DateRange,
    options: { excelIncompleteAcknowledged?: boolean } = {},
  ): Promise<PreparationInspection> {
    operationId += 1
    const opId = operationId
    deps.dispatch({ type: 'CHECK_STARTED' })

    const lastCompleteDay = addDaysIso(todayIso(), -1)

    let sourceDays: SourceDay[] = []
    let excelCoverage: { day: string; rows: number }[] = []
    let savedRuns: SavedWindow[] = []

    try {
      // Rango íntegramente futuro: nada que consultar (buildPreparationPlan lo corta igual).
      if (range.from <= lastCompleteDay) {
        const weeks: HistoricalRange[] = historicalWeeks(range)
        const effectiveTo = range.to > lastCompleteDay ? lastCompleteDay : range.to
        const sourceFrom = addDaysIso(weeks[0]?.from ?? range.from, -1)

        // Cobertura Excel y listado de corridas en paralelo (CONTRATO §2).
        const [sourceAvailability, excelBackup] = await Promise.all([
          deps.postSourceAvailability({ startDate: sourceFrom, endDate: effectiveTo }),
          deps.getMovimientosBackupCoverage(),
        ])
        sourceDays = sourceAvailability.days
        excelCoverage = excelBackup.days

        const verifiedWindows = await inspectSavedWindowsValidity(
          range,
          { listWindows: deps.listWindows, resolveWindow: deps.resolveWindow },
          { concurrency: RESOLVE_CONCURRENCY },
        )
        savedRuns = verifiedWindows.filter((w) => !w.stale)
      }

      const plan = buildPreparationPlan({
        range,
        sourceDays,
        savedRuns,
        excelCoverage,
        lastCompleteDay,
        excelIncompleteAcknowledged: options.excelIncompleteAcknowledged ?? false,
      })

      const result: PreparationInspection = { ...plan, range, sourceDays, error: null }
      if (opId === operationId) {
        deps.dispatch({
          type: 'CHECK_SUCCEEDED',
          operationId: opId,
          sourceDays: result.sourceDays,
          missingExcelDays: result.missingExcelDays,
          steps: result.steps,
          limitations: result.limitations,
        })
      }
      return result
    } catch (e) {
      const message = errorMessage(e)
      const result: PreparationInspection = {
        range,
        sourceDays: [],
        missingExcelDays: [],
        steps: [],
        limitations: [],
        requiresExcelDecision: false,
        usesFullyCachedCoverage: false,
        error: message,
      }
      if (opId === operationId) {
        deps.dispatch({
          type: 'CHECK_SUCCEEDED',
          operationId: opId,
          sourceDays: [],
          missingExcelDays: [],
          steps: [],
          limitations: [],
          error: message,
        })
      }
      return result
    }
  }

  async function runDownloadStep(step: PreparationPlanStep): Promise<void> {
    const res = await deps.postTruckflowExportOneDay({ day: step.from, site: 'all' })
    // 200 con status:'error' es una falla igual que un HTTP no-2xx (CONTRATO §4).
    if (res.status === 'error') throw new Error(res.error || `No se pudo descargar el día ${step.from}`)
  }

  async function runProcessStep(step: PreparationPlanStep): Promise<void> {
    const before = await deps.resolveWindow(step.from, step.to)
    // force=true únicamente cuando la ventana exacta existente fue resuelta stale.
    const force = Boolean(before && before.stale)
    await deps.requestRunEtl(step.from, step.to, { force })
    const after = await deps.resolveWindow(step.from, step.to)
    if (!after || after.stale) {
      throw new Error(`La corrida de ${step.from} a ${step.to} sigue sin vigencia después de procesar`)
    }
  }

  async function runLoadStep(step: PreparationPlanStep): Promise<EtlTransformOutput> {
    const result = await deps.loadHistoricalPeriod({ from: step.from, to: step.to }, { processMissing: false })
    if (!result.output) {
      throw new Error('La carga no devolvió el período completo; no se publica un resultado parcial')
    }
    return result.output
  }

  function requestStop(): void {
    stopRequested = true
    // Libera el lock ya: la llamada activa sigue en curso (no se cancela), pero una operación
    // nueva puede arrancar sin esperarla. Ver nota de diseño arriba.
    running = false
  }

  async function execute(plan: PreparationInspection): Promise<void> {
    if (plan.error) throw new Error(plan.error)
    if (plan.requiresExcelDecision) throw new Error('excel-decision-required')
    if (running) return // doble click / ejecución concurrente: la segunda llamada es no-op.

    running = true
    stopRequested = false
    operationId += 1
    const opId = operationId

    deps.dispatch({ type: 'CHECK_STARTED' })
    deps.dispatch({
      type: 'CHECK_SUCCEEDED',
      operationId: opId,
      sourceDays: plan.sourceDays,
      missingExcelDays: plan.missingExcelDays,
      steps: plan.steps,
      limitations: plan.limitations,
    })

    for (const step of plan.steps) {
      if (opId !== operationId) return // operación superada por un execute()/stop posterior.

      deps.dispatch({ type: 'STEP_STARTED', operationId: opId, key: step.key })
      let output: EtlTransformOutput | null = null
      try {
        if (step.kind === 'download') await runDownloadStep(step)
        else if (step.kind === 'process') await runProcessStep(step)
        else output = await runLoadStep(step)
      } catch (e) {
        if (opId !== operationId) return // respuesta tardía de una operación ya reemplazada.
        deps.dispatch({ type: 'STEP_FAILED', operationId: opId, key: step.key, error: errorMessage(e) })
        if (running) running = false
        return
      }

      if (opId !== operationId) return // resultado tardío: se descarta en silencio.

      if (step.kind === 'load' && output) {
        // Publish atómico + LOAD_SUCCEEDED una única vez, sólo con output completo.
        deps.publish(output)
        deps.dispatch({ type: 'LOAD_SUCCEEDED', operationId: opId, range: { from: step.from, to: step.to } })
      }
      deps.dispatch({ type: 'STEP_SUCCEEDED', operationId: opId, key: step.key })

      if (stopRequested) {
        deps.dispatch({ type: 'STOPPED' })
        if (running) running = false
        return
      }
    }

    if (running) running = false
  }

  return { inspect, execute, requestStop }
}
