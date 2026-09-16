/**
 * Tipos del estado de preparación de datos (ficha R03 del cierre).
 *
 * Ver `docs/rediseno/cierre/CONTRATO.md` §1. Copiados textuales del contrato; `SourceDay`
 * se reutiliza desde el cliente API (R02), no se duplica acá.
 */
import type { SourceDay } from '../api/truckflowLocalServerApi'

export type DateRange = { from: string; to: string }

export type SourceState = 'available' | 'missing' | 'partial' | 'error' | 'unknown'

export type { SourceDay }

export type PreparationPhase =
  | 'idle'
  | 'checking'
  | 'needs_sources'
  | 'needs_processing'
  | 'downloading'
  | 'processing'
  | 'loading'
  | 'ready'
  | 'failed'
  | 'interrupted'

export type PreparationStepKind = 'download' | 'process' | 'load'
export type PreparationStepState = 'queued' | 'running' | 'done' | 'failed'

export type PreparationStep = {
  key: string
  kind: PreparationStepKind
  from: string
  to: string
  state: PreparationStepState
  error: string | null
  /** Aclaración para la UI (p. ej. "Actualizar eventos y alertas del día"). No forma parte del contrato mínimo. */
  note?: string
}

export type PreparationState = {
  draft: DateRange
  requested: DateRange | null
  active: DateRange | null
  phase: PreparationPhase
  operationId: number
  sourceDays: SourceDay[]
  missingExcelDays: string[]
  steps: PreparationStep[]
  error: string | null
  limitations: string[]
}

/** Plan mínimo de un paso, tal como lo produce `buildPreparationPlan` (sin estado de ejecución). */
export type PreparationPlanStep = {
  key: string
  kind: PreparationStepKind
  from: string
  to: string
  note?: string
}

export const INITIAL_PREPARATION_STATE: PreparationState = {
  draft: { from: '', to: '' },
  requested: { from: '', to: '' },
  active: null,
  phase: 'idle',
  operationId: 0,
  sourceDays: [],
  missingExcelDays: [],
  steps: [],
  error: null,
  limitations: [],
}

export type PreparationAction =
  | { type: 'SET_DRAFT'; draft: DateRange }
  | { type: 'CHECK_STARTED' }
  | {
      type: 'CHECK_SUCCEEDED'
      operationId: number
      sourceDays: SourceDay[]
      missingExcelDays: string[]
      steps: PreparationPlanStep[]
      limitations: string[]
      /** Presente cuando la inspección misma falló (no una fuente puntual). */
      error?: string | null
    }
  | { type: 'STEP_STARTED'; operationId: number; key: string }
  | { type: 'STEP_SUCCEEDED'; operationId: number; key: string }
  | { type: 'STEP_FAILED'; operationId: number; key: string; error: string }
  | { type: 'LOAD_SUCCEEDED'; operationId: number; range: DateRange }
  | { type: 'STOPPED' }
  | { type: 'RESTORED'; draft: DateRange; requested: DateRange | null; phase: PreparationPhase }
