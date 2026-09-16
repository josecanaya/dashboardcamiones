/**
 * Hook React de la preparación de datos (ficha R04 del cierre). Instancia el reducer de R03
 * y el runner (sin React) con las APIs reales por defecto. Ver
 * `docs/rediseno/cierre/CONTRATO.md` §1.
 */
import { useEffect, useMemo, useReducer, useRef } from 'react'
import { postSourceAvailability, postTruckflowExportOneDay } from '../api/truckflowLocalServerApi'
import { getMovimientosBackupCoverage } from '../api/movimientosBackupApi'
import { listWindows, resolveWindow, requestRunEtl } from '../api/etlRunCacheApi'
import { loadHistoricalPeriod } from '../etlWorkbench/historicalPeriodLoader'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
import { preparationReducer } from './preparationReducer'
import { createPreparationRunner, type PreparationInspection, type PreparationRunnerDeps } from './preparationRunner'
import { INITIAL_PREPARATION_STATE, type DateRange, type PreparationPhase, type PreparationState } from './types'

const STORAGE_KEY = 'truckflow.dataPreparation.v1'
const LEGACY_STORAGE_KEY = 'truckflow.historicalPeriod.v1'

type StoredPreparation = {
  draft: DateRange
  requested: DateRange | null
  phase: PreparationPhase
  updatedAt: string
}

const TERMINAL_PHASES = new Set<PreparationPhase>(['idle', 'ready', 'failed', 'interrupted'])

function isDateRange(v: unknown): v is DateRange {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as DateRange).from === 'string' &&
    typeof (v as DateRange).to === 'string'
  )
}

/** Lee y valida `localStorage[STORAGE_KEY]`, migrando desde la clave legacy si hace falta. */
function readStoredPreparation(): StoredPreparation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredPreparation>
      if (isDateRange(parsed.draft)) {
        return {
          draft: parsed.draft,
          requested: isDateRange(parsed.requested) ? parsed.requested : null,
          phase: typeof parsed.phase === 'string' ? (parsed.phase as PreparationPhase) : 'idle',
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        }
      }
      return null
    }
    // Migración: sin clave nueva, buscar el rango guardado por el flujo legacy.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const range = JSON.parse(legacy) as unknown
      if (isDateRange(range)) return { draft: range, requested: null, phase: 'idle', updatedAt: '' }
    }
    return null
  } catch {
    return null // parseo defensivo: JSON corrupto o localStorage inaccesible.
  }
}

function writeStoredPreparation(value: StoredPreparation): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* cuota o storage no disponible: la preparación sigue funcionando en memoria */
  }
}

export type UseDataPreparationOverrides = Partial<PreparationRunnerDeps>

export type UseDataPreparationResult = {
  state: PreparationState
  setDraft: (draft: DateRange) => void
  inspect: (options?: { excelIncompleteAcknowledged?: boolean }) => Promise<PreparationInspection | null>
  execute: (plan: PreparationInspection) => Promise<void>
  requestStop: () => void
  retry: () => Promise<void>
  /**
   * Notifica que una API legacy (fuera del runner) hidrató tablas para `range`, con sus
   * `limitations` (p. ej. corrida stale o rango compuesto). Ver R05: mantiene `active`
   * sincronizado con "el período de las tablas cargadas" también en los caminos viejos.
   */
  notifyExternalLoad: (range: DateRange, limitations?: string[]) => void
}

/**
 * `publish` por defecto es un no-op: R05 lo conecta al provider real (EtlWorkbenchContext).
 * Los llamadores actuales de este hook (tests, y el futuro R05) deben pasar su propio
 * `publish` vía `overrides`.
 */
function noopPublish(): void {
  /* no-op hasta que R05 conecte el provider */
}

export function useDataPreparation(overrides: UseDataPreparationOverrides = {}): UseDataPreparationResult {
  const [state, dispatch] = useReducer(preparationReducer, INITIAL_PREPARATION_STATE)

  const runner = useMemo(() => {
    const deps: PreparationRunnerDeps = {
      postSourceAvailability,
      getMovimientosBackupCoverage,
      listWindows,
      resolveWindow,
      requestRunEtl,
      postTruckflowExportOneDay,
      loadHistoricalPeriod,
      dispatch,
      publish: noopPublish,
      ...overrides,
    }
    return createPreparationRunner(deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps/overrides se fijan una vez por montaje (ver R05 para reconexión).
  }, [])

  // Lock síncrono (antes del primer await de cada operación) para impedir doble click.
  const busyRef = useRef(false)

  // Hidratación inicial: sólo restaura draft/requested/phase, nunca relanza operaciones.
  useEffect(() => {
    const stored = readStoredPreparation()
    if (stored) {
      dispatch({ type: 'RESTORED', draft: stored.draft, requested: stored.requested, phase: stored.phase })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo al montar.
  }, [])

  // Persistencia: nunca credenciales/URLs/archivos/tablas/output, sólo draft/requested/phase.
  useEffect(() => {
    const persistedPhase: StoredPreparation['phase'] = TERMINAL_PHASES.has(state.phase) ? state.phase : 'interrupted'
    writeStoredPreparation({
      draft: state.draft,
      requested: state.requested,
      phase: persistedPhase,
      updatedAt: new Date().toISOString(),
    })
  }, [state.draft, state.requested, state.phase])

  function setDraft(draft: DateRange): void {
    dispatch({ type: 'SET_DRAFT', draft })
  }

  async function inspect(options?: { excelIncompleteAcknowledged?: boolean }): Promise<PreparationInspection | null> {
    if (busyRef.current) return null
    busyRef.current = true
    try {
      return await runner.inspect(state.draft, options)
    } finally {
      busyRef.current = false
    }
  }

  async function execute(plan: PreparationInspection): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    try {
      await runner.execute(plan)
    } finally {
      busyRef.current = false
    }
  }

  function requestStop(): void {
    runner.requestStop()
  }

  /** Reintento: siempre re-inspecciona el rango pedido y ejecuta el plan resultante. */
  async function retry(): Promise<void> {
    const range = state.requested ?? state.draft
    if (busyRef.current) return
    busyRef.current = true
    try {
      const plan = await runner.inspect(range)
      if (plan.error || plan.requiresExcelDecision) return
      await runner.execute(plan)
    } finally {
      busyRef.current = false
    }
  }

  function notifyExternalLoad(range: DateRange, limitations: string[] = []): void {
    dispatch({ type: 'EXTERNAL_LOAD', range, limitations })
  }

  return { state, setDraft, inspect, execute, requestStop, retry, notifyExternalLoad }
}

export type { PreparationInspection }
export type { EtlTransformOutput }
