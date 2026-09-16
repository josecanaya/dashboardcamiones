/**
 * Reducer puro del estado de preparación de datos (ficha R03 del cierre).
 *
 * Sin fetch/Date.now/localStorage acá: sólo transiciones de estado. Ver
 * `docs/rediseno/cierre/CONTRATO.md` §1. Todo evento de una operación en curso lleva
 * `operationId`; si no coincide con el actual, el reducer lo ignora (devuelve el mismo
 * estado). `SET_DRAFT` es la única excepción (no pertenece a ninguna operación).
 * `LOAD_SUCCEEDED` es la única acción que muta `active`.
 */
import { INITIAL_PREPARATION_STATE, type PreparationPhase, type PreparationState, type PreparationAction, type PreparationStep } from './types'

/** Fases en las que una operación sigue "viva" (no terminal). Usadas por RESTORED. */
const LIVE_PHASES = new Set<PreparationPhase>([
  'checking',
  'downloading',
  'processing',
  'loading',
  'needs_sources',
  'needs_processing',
])

/** Fase resultante de un chequeo exitoso, según los pasos del plan y si `active` ya cubre lo pedido. */
function phaseFromPlan(
  steps: PreparationStep[],
  active: PreparationState['active'],
  requested: PreparationState['requested']
): PreparationPhase {
  if (steps.some((s) => s.kind === 'download')) return 'needs_sources'
  if (steps.some((s) => s.kind === 'process')) return 'needs_processing'
  // Sólo queda (a lo sumo) el paso load.
  const covered =
    active != null && requested != null && active.from === requested.from && active.to === requested.to
  return covered ? 'ready' : 'needs_processing'
}

export function preparationReducer(state: PreparationState, action: PreparationAction): PreparationState {
  switch (action.type) {
    case 'SET_DRAFT':
      // No toca requested/active: es edición libre, sin disparar escrituras.
      return { ...state, draft: action.draft }

    case 'CHECK_STARTED':
      return {
        ...state,
        phase: 'checking',
        operationId: state.operationId + 1,
        requested: state.draft,
        sourceDays: [],
        missingExcelDays: [],
        steps: [],
        error: null,
        limitations: [],
      }

    case 'CHECK_SUCCEEDED': {
      if (action.operationId !== state.operationId) return state
      if (action.error) {
        return {
          ...state,
          phase: 'failed',
          error: action.error,
          sourceDays: action.sourceDays,
          missingExcelDays: action.missingExcelDays,
          limitations: action.limitations,
        }
      }
      const steps: PreparationStep[] = action.steps.map((s) => ({
        key: s.key,
        kind: s.kind,
        from: s.from,
        to: s.to,
        state: 'queued',
        error: null,
        ...(s.note ? { note: s.note } : {}),
      }))
      return {
        ...state,
        phase: phaseFromPlan(steps, state.active, state.requested),
        sourceDays: action.sourceDays,
        missingExcelDays: action.missingExcelDays,
        steps,
        error: null,
        limitations: action.limitations,
      }
    }

    case 'STEP_STARTED': {
      if (action.operationId !== state.operationId) return state
      const idx = state.steps.findIndex((s) => s.key === action.key)
      if (idx < 0) return state
      const steps = state.steps.slice()
      steps[idx] = { ...steps[idx], state: 'running', error: null }
      const phase: PreparationPhase =
        steps[idx].kind === 'download' ? 'downloading' : steps[idx].kind === 'process' ? 'processing' : 'loading'
      return { ...state, steps, phase }
    }

    case 'STEP_SUCCEEDED': {
      if (action.operationId !== state.operationId) return state
      const idx = state.steps.findIndex((s) => s.key === action.key)
      if (idx < 0) return state
      const steps = state.steps.slice()
      steps[idx] = { ...steps[idx], state: 'done', error: null }
      return { ...state, steps }
    }

    case 'STEP_FAILED': {
      if (action.operationId !== state.operationId) return state
      const idx = state.steps.findIndex((s) => s.key === action.key)
      const steps = state.steps.slice()
      if (idx >= 0) steps[idx] = { ...steps[idx], state: 'failed', error: action.error }
      // active se preserva: sólo LOAD_SUCCEEDED lo cambia.
      return { ...state, steps, phase: 'failed', error: action.error }
    }

    case 'LOAD_SUCCEEDED': {
      if (action.operationId !== state.operationId) return state
      return { ...state, active: action.range, phase: 'ready' }
    }

    case 'STOPPED':
      // Comando del usuario, no una respuesta de operación: no se filtra por operationId.
      return { ...state, phase: 'interrupted' }

    case 'EXTERNAL_LOAD':
      // Camino legacy (fuera del runner): actualiza qué período es "el de las tablas
      // cargadas" sin tocar operationId/phase, que siguen reflejando la cola del runner.
      return { ...state, active: action.range, limitations: action.limitations, error: null }

    case 'RESTORED': {
      const phase: PreparationPhase = LIVE_PHASES.has(action.phase) ? 'interrupted' : action.phase
      return {
        ...INITIAL_PREPARATION_STATE,
        draft: action.draft,
        requested: action.requested,
        phase,
      }
    }

    default:
      return state
  }
}
