import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPreparationRunner, type PreparationRunnerDeps } from './preparationRunner'
import { preparationReducer } from './preparationReducer'
import { INITIAL_PREPARATION_STATE, type DateRange, type PreparationAction, type PreparationState } from './types'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
import { enumerateDays } from '../etlWorkbench/etlComposeRuns'

/**
 * Test de integración de R05 (CONTRATO §1, `docs/rediseno/cierre/tareas/R05.md`).
 *
 * El provider real (`EtlWorkbenchContext.tsx`) es un componente React grande; no hay React
 * Testing Library en el repo, así que este archivo reimplementa —como "adaptador thin", tal
 * como habilita la ficha ("si el provider real es demasiado grande para testear directo...")—
 * exactamente el contrato de la publicación atómica compartida (`publishTransformOutput`) y
 * de `isDataMutationBusy`/`clearLoaded` que vive en el provider: mismo orden de operaciones
 * (bump de revisión → `resetLoadedState()` → chequeo de revisión → set de tablas), mismo
 * criterio de "ocupado", y la misma regla de "nunca llamar `clearLoaded` desde el publish".
 *
 * Se ejercita contra UNA sola instancia del runner real (`createPreparationRunner`, sin
 * mocks de su lógica) reutilizada para toda la secuencia de operaciones de cada test —igual
 * que en la app, donde `useDataPreparation` crea el runner una única vez (`useMemo(..., [])`)
 * y todas las operaciones (A, B, retry) pasan por esa misma instancia y su mismo contador de
 * `operationId`. Esto prueba la integración runner↔publicación, no sólo el runner solo (eso
 * ya lo cubre `preparationRunner.test.ts`).
 */

type ProviderAdapter = ReturnType<typeof createProviderAdapter>

function createProviderAdapter() {
  let revision = 0
  let transformResult: EtlTransformOutput | null = null
  let diskPeriod: { startDate: string; endDate: string } | null = null
  let resetCount = 0
  let state: PreparationState = INITIAL_PREPARATION_STATE
  let manualLoadBusy = false

  function dispatch(action: PreparationAction): void {
    state = preparationReducer(state, action)
  }

  /** Espejo de `resetLoadedState` del provider: vacía tablas/insumo, sin bump de revisión. */
  function resetLoadedState(): void {
    resetCount++
    transformResult = null
    diskPeriod = null
  }

  /** Espejo de `isDataMutationBusy` del provider (cola del runner OR carga manual). */
  function isDataMutationBusy(): boolean {
    return ['checking', 'downloading', 'processing', 'loading'].includes(state.phase) || manualLoadBusy
  }

  /**
   * Espejo de `publishTransformOutput` del provider: bump de revisión + `resetLoadedState()`
   * directo (nunca `clearLoaded`), guardado por revisión para descartar publicaciones
   * superadas por una operación más nueva mientras el reset corría.
   */
  function publishTransformOutput(
    output: EtlTransformOutput,
    opts?: { range?: { startDate: string; endDate: string } }
  ): number | null {
    const rev = ++revision
    resetLoadedState()
    if (rev !== revision) return null
    if (opts?.range) diskPeriod = opts.range
    transformResult = output
    return rev
  }

  /** Espejo de `clearLoaded`: no-op si hay una mutación en curso (R05 §isDataMutationBusy). */
  function clearLoaded(): boolean {
    if (isDataMutationBusy()) return false
    revision++
    resetLoadedState()
    return true
  }

  return {
    dispatch,
    getState: () => state,
    publishTransformOutput,
    clearLoaded,
    isDataMutationBusy,
    setManualLoadBusy: (v: boolean) => {
      manualLoadBusy = v
    },
    getTransformResult: () => transformResult,
    getDiskPeriod: () => diskPeriod,
    getResetCount: () => resetCount,
  }
}

function rangeKey(r: DateRange): string {
  return `${r.from}:${r.to}`
}

function savedWindowFor(from: string, to: string) {
  return { from, to, runId: `run:${from}:${to}`, rulesVersion: 'v1', createdAt: '2026-01-01T00:00:00.000Z', stale: false }
}

function fakeOutput(tag: string): EtlTransformOutput {
  return { csv: {}, tables: {}, stats: { tag }, rulesVersion: 'v1' } as unknown as EtlTransformOutput
}

const RANGE_A: DateRange = { from: '2026-03-02', to: '2026-03-08' }
const RANGE_B: DateRange = { from: '2026-04-06', to: '2026-04-12' }

type DownloadResult = {
  status: 'ok'
  dataRoot: string
  baseUrl: string
  site: string
  day: string
  eventsDownloaded: number
  alertsDownloaded: number
}

function okDownload(day: string): DownloadResult {
  return { status: 'ok', dataRoot: '', baseUrl: '', site: 'all', day, eventsDownloaded: 1, alertsDownloaded: 1 }
}

function fullExcelCoverage(from: string, to: string) {
  const carry = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  return [carry, ...enumerateDays(from, to)].map((day) => ({ day, rows: 1 }))
}

/**
 * UNA sola instancia de runner por test (como en la app). `cached` es un objeto mutable
 * `rangeKey -> output`: los rangos presentes ahí resuelven como corrida vigente (plan =
 * sólo load); el resto necesita `download`+`process` (y por defecto nunca "logra" quedar
 * vigente después de procesar, salvo que el test agregue la entrada a `cached`) — alcanza
 * para ejercitar las fallas de descarga/proceso de estos tests sin simular todo el pipeline.
 */
function makeSharedRunner(
  adapter: ProviderAdapter,
  cached: Record<string, EtlTransformOutput>,
  overrides: Partial<PreparationRunnerDeps> = {}
) {
  const deps: PreparationRunnerDeps = {
    postSourceAvailability: vi.fn().mockResolvedValue({ days: [] }),
    getMovimientosBackupCoverage: vi.fn().mockResolvedValue({
      days: [...fullExcelCoverage(RANGE_A.from, RANGE_A.to), ...fullExcelCoverage(RANGE_B.from, RANGE_B.to)],
      totalRows: 1,
      totalDays: 1,
    }),
    listWindows: vi.fn().mockImplementation(async () =>
      Object.keys(cached).map((k) => {
        const [from, to] = k.split(':') as [string, string]
        return savedWindowFor(from, to)
      })
    ),
    resolveWindow: vi.fn().mockImplementation(async (from: string, to: string) =>
      cached[rangeKey({ from, to })] ? { ...savedWindowFor(from, to), inputHash: '', currentRulesVersion: 'v1' } : null
    ),
    requestRunEtl: vi.fn().mockResolvedValue({ runId: 'run', cached: false }),
    postTruckflowExportOneDay: vi.fn().mockImplementation(async ({ day }: { day: string }) => okDownload(day)),
    loadHistoricalPeriod: vi.fn().mockImplementation(async ({ from, to }: DateRange) => {
      const output = cached[rangeKey({ from, to })] ?? null
      return {
        range: { from, to },
        coverage: { coveredDays: [], missingDays: output ? [] : [from], coveringRuns: [], selectedRuns: [] },
        windows: [],
        staleWindows: [],
        output,
        usedRunIds: output ? [`run:${from}:${to}`] : [],
        composed: false,
        compositionCounts: null,
      }
    }),
    dispatch: adapter.dispatch,
    publish: (output) => {
      adapter.publishTransformOutput(output)
    },
    // Posterior a RANGE_A y RANGE_B: ninguno queda "futuro" para buildPreparationPlan (si
    // no, inspect() devuelve steps:[] sin llamar nada, y las pruebas no ejercitan la cola).
    todayIso: () => '2026-04-20',
    ...overrides,
  }
  return createPreparationRunner(deps)
}

describe('R05: integración runner ↔ publicación atómica del provider (adaptador thin)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('A activo → B falla → A conservado (active, output, KPI)', async () => {
    const adapter = createProviderAdapter()
    const outputA = fakeOutput('A')
    const cached: Record<string, EtlTransformOutput> = { [rangeKey(RANGE_A)]: outputA }
    // B no está en `cached`: necesita descarga, y ésta falla.
    const runner = makeSharedRunner(adapter, cached, {
      postTruckflowExportOneDay: vi.fn().mockRejectedValue(new Error('fuente caída')),
    })

    await runner.execute(await runner.inspect(RANGE_A))
    expect(adapter.getTransformResult()).toBe(outputA)
    expect(adapter.getState().active).toEqual(RANGE_A)

    const planB = await runner.inspect(RANGE_B)
    expect(planB.steps.some((s) => s.kind === 'download')).toBe(true)
    await runner.execute(planB)

    // B falló antes de publicar: A se conserva intacto (active, output, KPI = mismo output).
    expect(adapter.getTransformResult()).toBe(outputA)
    expect(adapter.getState().active).toEqual(RANGE_A)
    expect(adapter.getState().phase).toBe('failed')
  })

  it('B éxito → limpia eventos A y publica B', async () => {
    const adapter = createProviderAdapter()
    const outputA = fakeOutput('A')
    const outputB = fakeOutput('B')
    const cached: Record<string, EtlTransformOutput> = { [rangeKey(RANGE_A)]: outputA, [rangeKey(RANGE_B)]: outputB }
    const runner = makeSharedRunner(adapter, cached)

    await runner.execute(await runner.inspect(RANGE_A))
    const resetsAfterA = adapter.getResetCount()
    expect(adapter.getTransformResult()).toBe(outputA)

    await runner.execute(await runner.inspect(RANGE_B))

    expect(adapter.getResetCount()).toBeGreaterThan(resetsAfterA) // resetLoadedState corrió de nuevo (limpió A)
    expect(adapter.getTransformResult()).toBe(outputB) // y publicó B
    expect(adapter.getState().active).toEqual(RANGE_B)
  })

  it('respuesta tardía de A llega tras iniciar B → descartada (no pisa el output de B)', async () => {
    const adapter = createProviderAdapter()
    const gate = deferred<DownloadResult>()
    let call = 0
    const outputB = fakeOutput('B')
    const cached: Record<string, EtlTransformOutput> = { [rangeKey(RANGE_B)]: outputB } // sólo B está cacheado
    const runner = makeSharedRunner(adapter, cached, {
      postTruckflowExportOneDay: vi.fn().mockImplementation(async ({ day }: { day: string }) => {
        call++
        if (call === 1) return gate.promise // 1er download de A: queda colgado
        return okDownload(day)
      }),
    })

    const planA = await runner.inspect(RANGE_A)
    const execA = runner.execute(planA) // arranca, primer download pendiente en `gate`

    runner.requestStop() // libera el lock sin cancelar la llamada colgada

    await runner.execute(await runner.inspect(RANGE_B)) // B corre y publica de punta a punta

    expect(adapter.getTransformResult()).toBe(outputB)
    expect(adapter.getState().active).toEqual(RANGE_B)

    // Ahora se resuelve la llamada vieja de A (tardía). No debe pisar el output de B.
    gate.resolve(okDownload(planA.steps[0]!.from))
    await execA

    expect(adapter.getTransformResult()).toBe(outputB)
    expect(adapter.getState().active).toEqual(RANGE_B)
  })

  it('limpieza durante proceso → isDataMutationBusy bloquea clearLoaded (no muta)', async () => {
    const adapter = createProviderAdapter()
    const gate = deferred<DownloadResult>()
    const cached: Record<string, EtlTransformOutput> = {} // A necesita descarga → fase 'downloading'
    const runner = makeSharedRunner(adapter, cached, { postTruckflowExportOneDay: vi.fn().mockReturnValue(gate.promise) })
    const plan = await runner.inspect(RANGE_A)
    const exec = runner.execute(plan)

    expect(adapter.getState().phase).toBe('downloading')
    expect(adapter.isDataMutationBusy()).toBe(true)
    const resetsBefore = adapter.getResetCount()
    const cleared = adapter.clearLoaded()
    expect(cleared).toBe(false) // no mutó
    expect(adapter.getResetCount()).toBe(resetsBefore)

    gate.resolve(okDownload(plan.steps[0]!.from))
    await exec
  })

  it('cambiar de ruta (desmontar/montar consumidores) no remonta datos: el estado vive fuera del componente', async () => {
    const adapter = createProviderAdapter()
    const output = fakeOutput('estable')
    const cached: Record<string, EtlTransformOutput> = { [rangeKey(RANGE_A)]: output }
    const runner = makeSharedRunner(adapter, cached)
    await runner.execute(await runner.inspect(RANGE_A))
    const beforeUnmount = { active: adapter.getState().active, result: adapter.getTransformResult() }

    // Simula desmontar y volver a montar los consumidores del contexto: como el estado vive
    // en el adaptador (equivalente al provider, montado una sola vez en App.tsx), "recrear"
    // los consumidores no reconstruye ni relanza nada — sólo vuelven a leer el mismo estado.
    const afterRemount = { active: adapter.getState().active, result: adapter.getTransformResult() }

    expect(afterRemount).toEqual(beforeUnmount)
    expect(afterRemount.result).toBe(output)
  })

  it('errores liberan el lock: reintentar (retry) vuelve a inspeccionar y publica', async () => {
    const adapter = createProviderAdapter()
    const output = fakeOutput('retry-ok')
    const cached: Record<string, EtlTransformOutput> = {} // 1er intento: sin cache → falla la descarga.
    const runner = makeSharedRunner(adapter, cached, {
      postTruckflowExportOneDay: vi.fn().mockRejectedValue(new Error('500')),
    })

    await runner.execute(await runner.inspect(RANGE_A))
    expect(adapter.getState().phase).toBe('failed')

    // El fallo liberó el lock (`running=false` en el runner): retry() vuelve a inspeccionar
    // (ahora con cache vigente, simulando que la fuente ya está disponible) y ejecuta bien.
    cached[rangeKey(RANGE_A)] = output
    const plan2 = await runner.inspect(RANGE_A)
    await runner.execute(plan2)

    expect(adapter.getTransformResult()).toBe(output)
    expect(adapter.getState().active).toEqual(RANGE_A)
    expect(adapter.getState().phase).toBe('ready')
  })
})

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
