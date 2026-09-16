import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPreparationRunner, type PreparationRunnerDeps } from './preparationRunner'
import type { PreparationAction } from './types'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
import { enumerateDays } from '../etlWorkbench/etlComposeRuns'

/** Cobertura Excel completa (incluye el día de arrastre) para no disparar requiresExcelDecision de más. */
function fullExcelCoverage(from: string, to: string) {
  const carry = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  return { days: [carry, ...enumerateDays(from, to)].map((day) => ({ day, rows: 1 })), totalRows: 1, totalDays: 1 }
}

/** Promesa controlable manualmente desde el test (sin mocks de red reales). */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const fakeOutput = { csv: {}, tables: {}, stats: {}, rulesVersion: 'v1' } as unknown as EtlTransformOutput

const savedWindow = (from: string, to: string, runId = `run:${from}:${to}`, stale = false) => ({
  from,
  to,
  runId,
  rulesVersion: 'v1',
  createdAt: '2026-01-01T00:00:00.000Z',
  stale,
})

function makeDeps(overrides: Partial<PreparationRunnerDeps> = {}) {
  const dispatch = vi.fn<(action: PreparationAction) => void>()
  const publish = vi.fn<(output: EtlTransformOutput) => void>()
  const deps: PreparationRunnerDeps = {
    postSourceAvailability: vi.fn().mockResolvedValue({ days: [] }),
    getMovimientosBackupCoverage: vi.fn().mockResolvedValue(fullExcelCoverage('2026-03-02', '2026-03-08')),
    listWindows: vi.fn().mockResolvedValue([]),
    resolveWindow: vi.fn().mockResolvedValue(null),
    requestRunEtl: vi.fn().mockResolvedValue({ runId: 'run', cached: false }),
    postTruckflowExportOneDay: vi.fn().mockResolvedValue({
      dataRoot: '', baseUrl: '', site: 'all', day: '2026-03-02', eventsDownloaded: 1, alertsDownloaded: 1, status: 'ok',
    }),
    loadHistoricalPeriod: vi.fn().mockResolvedValue({
      range: { from: '2026-03-02', to: '2026-03-08' },
      coverage: { coveredDays: [], missingDays: [], coveringRuns: [], selectedRuns: [] },
      windows: [], staleWindows: [], output: fakeOutput, usedRunIds: ['run'], composed: false, compositionCounts: null,
    }),
    dispatch,
    publish,
    todayIso: () => '2026-03-15',
    ...overrides,
  }
  return { deps, dispatch, publish }
}

const RANGE = { from: '2026-03-02', to: '2026-03-08' }

function actionsOfType(dispatch: ReturnType<typeof vi.fn>, type: PreparationAction['type']) {
  return dispatch.mock.calls.map((c) => c[0] as PreparationAction).filter((a) => a.type === type)
}

describe('preparationRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('cache vigente → sólo load, cero POST de descarga/process', async () => {
    const { deps, dispatch, publish } = makeDeps({
      listWindows: vi.fn().mockResolvedValue([savedWindow(RANGE.from, RANGE.to)]),
      resolveWindow: vi.fn().mockResolvedValue({ ...savedWindow(RANGE.from, RANGE.to), inputHash: '', currentRulesVersion: 'v1' }),
      getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
        days: [
          { day: '2026-03-02', rows: 1 }, { day: '2026-03-03', rows: 1 }, { day: '2026-03-04', rows: 1 },
          { day: '2026-03-05', rows: 1 }, { day: '2026-03-06', rows: 1 }, { day: '2026-03-07', rows: 1 },
          { day: '2026-03-08', rows: 1 },
        ],
        totalRows: 7,
        totalDays: 7,
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    expect(plan.usesFullyCachedCoverage).toBe(true)
    expect(plan.steps).toEqual([{ key: `load:${RANGE.from}:${RANGE.to}`, kind: 'load', from: RANGE.from, to: RANGE.to }])

    await runner.execute(plan)
    expect(deps.postTruckflowExportOneDay).not.toHaveBeenCalled()
    expect(deps.requestRunEtl).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledExactlyOnceWith(fakeOutput)
    expect(actionsOfType(dispatch, 'LOAD_SUCCEEDED')).toHaveLength(1)
  })

  it('descarga secuencial por días ascendentes', async () => {
    const calls: string[] = []
    const { deps } = makeDeps({
      postTruckflowExportOneDay: vi.fn().mockImplementation(async ({ day }: { day: string }) => {
        calls.push(day)
        return { dataRoot: '', baseUrl: '', site: 'all', day, eventsDownloaded: 1, alertsDownloaded: 1, status: 'ok' }
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    const downloadDays = plan.steps.filter((s) => s.kind === 'download').map((s) => s.from)
    expect(downloadDays.length).toBeGreaterThan(0)
    await runner.execute(plan)
    expect(calls).toEqual(downloadDays) // orden de ejecución = orden del plan (asc)
    expect(calls).toEqual([...calls].sort())
  })

  it('clic doble: dos execute en paralelo → sólo una cola avanza, la segunda es no-op', async () => {
    const gate = deferred<{ status: 'ok'; dataRoot: string; baseUrl: string; site: string; day: string; eventsDownloaded: number; alertsDownloaded: number }>()
    const exportDay = vi.fn().mockReturnValue(gate.promise)
    const { deps, dispatch } = makeDeps({ postTruckflowExportOneDay: exportDay })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)

    const p1 = runner.execute(plan)
    const p2 = runner.execute(plan) // debe ser no-op inmediato

    await p2
    expect(exportDay).toHaveBeenCalledTimes(1) // la segunda no arrancó nada

    gate.resolve({ status: 'ok', dataRoot: '', baseUrl: '', site: 'all', day: plan.steps[0].from, eventsDownloaded: 1, alertsDownloaded: 1 })
    await p1
    // La primera llamada avanzó su primer paso sin que la segunda (no-op) haya interferido.
    expect(actionsOfType(dispatch, 'STEP_STARTED').filter((a) => 'key' in a && a.key === plan.steps[0].key)).toHaveLength(1)
  })

  it('navegación no cancela: no se usa AbortController', async () => {
    const { deps } = makeDeps()
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    await runner.execute(plan)
    for (const call of (deps.postTruckflowExportOneDay as ReturnType<typeof vi.fn>).mock.calls) {
      const body = call[0] as { signal?: unknown }
      expect(body.signal).toBeUndefined()
    }
  })

  it('stop tras paso activo: completa el step en curso y marca STOPPED', async () => {
    const gate = deferred<{ status: 'ok'; dataRoot: string; baseUrl: string; site: string; day: string; eventsDownloaded: number; alertsDownloaded: number }>()
    const { deps, dispatch } = makeDeps({ postTruckflowExportOneDay: vi.fn().mockReturnValue(gate.promise) })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    expect(plan.steps.filter((s) => s.kind === 'download').length).toBeGreaterThan(1)

    const exec = runner.execute(plan)
    runner.requestStop()
    gate.resolve({ status: 'ok', dataRoot: '', baseUrl: '', site: 'all', day: plan.steps[0].from, eventsDownloaded: 1, alertsDownloaded: 1 })
    await exec

    expect(actionsOfType(dispatch, 'STEP_SUCCEEDED')).toHaveLength(1) // sólo el step activo terminó
    expect(actionsOfType(dispatch, 'STOPPED')).toHaveLength(1)
    expect(deps.requestRunEtl).not.toHaveBeenCalled() // no arrancó el siguiente paso
  })

  it('error HTTP 500 en descarga: falla y conserva pasos previos como done', async () => {
    let call = 0
    const { deps, dispatch } = makeDeps({
      postTruckflowExportOneDay: vi.fn().mockImplementation(async ({ day }: { day: string }) => {
        call += 1
        if (call === 2) throw new Error('HTTP 500')
        return { dataRoot: '', baseUrl: '', site: 'all', day, eventsDownloaded: 1, alertsDownloaded: 1, status: 'ok' }
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    expect(plan.steps.filter((s) => s.kind === 'download').length).toBeGreaterThanOrEqual(2)

    await runner.execute(plan)
    expect(actionsOfType(dispatch, 'STEP_SUCCEEDED')).toHaveLength(1)
    expect(actionsOfType(dispatch, 'STEP_FAILED')).toHaveLength(1)
    expect(deps.requestRunEtl).not.toHaveBeenCalled() // se detuvo antes de procesar
  })

  it('respuesta 200 con status:"error" es una falla, no un éxito', async () => {
    const { deps, dispatch } = makeDeps({
      postTruckflowExportOneDay: vi.fn().mockResolvedValue({
        dataRoot: '', baseUrl: '', site: 'all', day: '2026-03-01', eventsDownloaded: 0, alertsDownloaded: 0,
        status: 'error', error: 'fuente caída',
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    await runner.execute(plan)
    const failed = actionsOfType(dispatch, 'STEP_FAILED')
    expect(failed).toHaveLength(1)
    expect((failed[0] as { error: string }).error).toContain('fuente caída')
  })

  it('reload interrupted: el runner no relanza solo; retry vuelve a inspeccionar y ejecutar', async () => {
    const { deps } = makeDeps({
      listWindows: vi.fn().mockResolvedValue([savedWindow(RANGE.from, RANGE.to)]),
      resolveWindow: vi.fn().mockResolvedValue({ ...savedWindow(RANGE.from, RANGE.to), inputHash: '', currentRulesVersion: 'v1' }),
      getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
        days: [
          { day: '2026-03-02', rows: 1 }, { day: '2026-03-03', rows: 1 }, { day: '2026-03-04', rows: 1 },
          { day: '2026-03-05', rows: 1 }, { day: '2026-03-06', rows: 1 }, { day: '2026-03-07', rows: 1 },
          { day: '2026-03-08', rows: 1 },
        ],
        totalRows: 7,
        totalDays: 7,
      }),
    })
    const runner = createPreparationRunner(deps)
    // El runner nunca dispara nada al construirse: sólo cuando se llama inspect()/execute().
    expect(deps.postSourceAvailability).not.toHaveBeenCalled()
    const plan = await runner.inspect(RANGE) // esto simula el "retry" (re-inspecciona siempre)
    await runner.execute(plan)
    expect(deps.postTruckflowExportOneDay).not.toHaveBeenCalled()
  })

  it('Excel incompleto sin opt-in: execute lanza excel-decision-required sin POSTs', async () => {
    const { deps } = makeDeps({ getMovimientosBackupCoverage: vi.fn().mockResolvedValue({ days: [], totalRows: 0, totalDays: 0 }) })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    expect(plan.requiresExcelDecision).toBe(true)
    await expect(runner.execute(plan)).rejects.toThrow('excel-decision-required')
    expect(deps.postTruckflowExportOneDay).not.toHaveBeenCalled()
    expect(deps.requestRunEtl).not.toHaveBeenCalled()
  })

  it('Excel incompleto con opt-in: sigue normal y propaga limitations', async () => {
    const { deps } = makeDeps({ getMovimientosBackupCoverage: vi.fn().mockResolvedValue({ days: [], totalRows: 0, totalDays: 0 }) })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE, { excelIncompleteAcknowledged: true })
    expect(plan.requiresExcelDecision).toBe(false)
    expect(plan.limitations.some((l) => l.startsWith('Cobertura Excel incompleta'))).toBe(true)
    await runner.execute(plan) // no debe lanzar
    expect(deps.postTruckflowExportOneDay).toHaveBeenCalled()
  })

  it('falla en loadHistoricalPeriod (tabla incompleta): no publica ni LOAD_SUCCEEDED', async () => {
    const { deps, dispatch, publish } = makeDeps({
      listWindows: vi.fn().mockResolvedValue([savedWindow(RANGE.from, RANGE.to)]),
      resolveWindow: vi.fn().mockResolvedValue({ ...savedWindow(RANGE.from, RANGE.to), inputHash: '', currentRulesVersion: 'v1' }),
      getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
        days: [
          { day: '2026-03-02', rows: 1 }, { day: '2026-03-03', rows: 1 }, { day: '2026-03-04', rows: 1 },
          { day: '2026-03-05', rows: 1 }, { day: '2026-03-06', rows: 1 }, { day: '2026-03-07', rows: 1 },
          { day: '2026-03-08', rows: 1 },
        ],
        totalRows: 7,
        totalDays: 7,
      }),
      loadHistoricalPeriod: vi.fn().mockResolvedValue({
        range: RANGE,
        coverage: { coveredDays: [], missingDays: ['2026-03-08'], coveringRuns: [], selectedRuns: [] },
        windows: [], staleWindows: [], output: null, usedRunIds: [], composed: false, compositionCounts: null,
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    await runner.execute(plan)
    expect(publish).not.toHaveBeenCalled()
    expect(actionsOfType(dispatch, 'LOAD_SUCCEEDED')).toHaveLength(0)
    expect(actionsOfType(dispatch, 'STEP_FAILED')).toHaveLength(1)
  })

  it('stale con force:true en process', async () => {
    const { deps } = makeDeps({
      listWindows: vi.fn().mockResolvedValue([savedWindow(RANGE.from, RANGE.to, 'run', true)]),
      resolveWindow: vi.fn()
        .mockResolvedValueOnce({ ...savedWindow(RANGE.from, RANGE.to, 'run', true), inputHash: '', currentRulesVersion: 'v2' }) // inspect() verifica vigencia
        .mockResolvedValueOnce({ ...savedWindow(RANGE.from, RANGE.to, 'run', true), inputHash: '', currentRulesVersion: 'v2' }) // runProcessStep: antes de procesar
        .mockResolvedValue({ ...savedWindow(RANGE.from, RANGE.to, 'run', false), inputHash: '', currentRulesVersion: 'v2' }), // después de procesar: vigente
      getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
        days: [
          { day: '2026-03-02', rows: 1 }, { day: '2026-03-03', rows: 1 }, { day: '2026-03-04', rows: 1 },
          { day: '2026-03-05', rows: 1 }, { day: '2026-03-06', rows: 1 }, { day: '2026-03-07', rows: 1 },
          { day: '2026-03-08', rows: 1 },
        ],
        totalRows: 7,
        totalDays: 7,
      }),
    })
    const runner = createPreparationRunner(deps)
    const plan = await runner.inspect(RANGE)
    expect(plan.steps.some((s) => s.kind === 'process')).toBe(true)
    await runner.execute(plan)
    expect(deps.requestRunEtl).toHaveBeenCalledWith(RANGE.from, RANGE.to, { force: true })
  })

  it('operationId viejo: dispatches de una operación reemplazada por stop+nuevo execute se descartan', async () => {
    const gate = deferred<{ status: 'ok'; dataRoot: string; baseUrl: string; site: string; day: string; eventsDownloaded: number; alertsDownloaded: number }>()
    let call = 0
    const { deps, dispatch } = makeDeps({
      getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
        days: [
          ...fullExcelCoverage('2026-03-02', '2026-03-08').days,
          ...fullExcelCoverage('2026-04-06', '2026-04-12').days,
        ],
        totalRows: 1,
        totalDays: 1,
      }),
      postTruckflowExportOneDay: vi.fn().mockImplementation(async ({ day }: { day: string }) => {
        call += 1
        if (call === 1) return gate.promise // primer download de la 1ra operación: queda colgado
        return { dataRoot: '', baseUrl: '', site: 'all', day, eventsDownloaded: 1, alertsDownloaded: 1, status: 'ok' }
      }),
    })
    const runner = createPreparationRunner(deps)
    const planA = await runner.inspect(RANGE)
    const execA = runner.execute(planA) // arranca, primer download queda pendiente en `gate`

    runner.requestStop() // libera el lock sin cancelar la llamada activa
    const planB = await runner.inspect({ from: '2026-04-06', to: '2026-04-12' }) // otra semana, sin corridas: pide más pasos
    dispatch.mockClear()
    const execB = runner.execute(planB) // nueva operación: opId avanza

    // Ahora se resuelve la llamada vieja (colgada desde la operación A).
    gate.resolve({ status: 'ok', dataRoot: '', baseUrl: '', site: 'all', day: planA.steps[0].from, eventsDownloaded: 1, alertsDownloaded: 1 })
    await execA
    await execB

    // Nada del step 1 de A (STEP_SUCCEEDED/STOPPED tardío) debió llegar después de que B arrancó.
    const staleStepSucceeded = actionsOfType(dispatch, 'STEP_SUCCEEDED').filter(
      (a) => 'key' in a && a.key === planA.steps[0].key
    )
    expect(staleStepSucceeded).toHaveLength(0)
    expect(actionsOfType(dispatch, 'STOPPED')).toHaveLength(0) // el STOPPED de A también se descarta: B ya está en curso
  })
})
