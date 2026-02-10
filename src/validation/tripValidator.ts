/**
 * Validador de recorrido: máquina de estados según circuito A..G y caminos válidos.
 * validateTrip(events) → { status, flags, path, explanation }
 */

import type { NormalizedEvent } from '../domain/events'
import { eventsToCircuit, type CircuitStep, type CaladaResult } from './circuitMapping'

export type TripValidationStatus =
  | 'VALID_IDEAL'
  | 'VALID_ACCEPTABLE'
  | 'VALID_NO_DISCHARGE'
  | 'INVALID'

export type TripValidationFlag =
  | 'MISSING_EVENT'
  | 'OUT_OF_ORDER'
  | 'TOO_MANY_CALADAS'
  | 'D_WITHOUT_OK'
  | 'WAIT_SUSPICIOUS'
  | 'DUPLICATE_EVENT'
  | 'OPEN_TRIP'
  | 'INVALID_PATH'
  | 'NO_CALADA_RESULT'
  | 'VISIT_KEY_FALLBACK_USED'

export interface TripValidationResult {
  status: TripValidationStatus
  flags: TripValidationFlag[]
  path: string
  /** Secuencia legible ej. A-B-C-...-F */
  pathDisplay: string
  /** Resultado(s) de calada (último es el decisivo si hay D o no). */
  caladaResults: CaladaResult[]
  explanation: string
}

const VALID_PATHS_WITH_DISCHARGE: readonly string[] = [
  'ABCDEF',       // PERFECT: exacto sin WAIT ni re-calada
  'ABCCDEF',      // re-calada (2 C)
  'ABCCCDEF',     // 3 caladas
  'AGBCDEF',
  'ABGCDEF',      // espera antes de descarga
  'ABCGDEF',
  'ABCGCDEF',
  'ABGCCDEF',     // espera + re-calada
  'ABCGCGCDEF',
  'ABCDDEF',      // 2 descargas (start+end)
  'AGBCDDEF',
  'ABGCDDEF',
  'ABCGDDEF',
  'ABCGCDDEF',
  'ABCGCGCDDEF',
]

const VALID_PATHS_NO_DISCHARGE: readonly string[] = [
  'ABCF',
  'AGBCF',
  'ABGCF',
  'ABCGF',
  'ABCGCF',
  'ABCGCGF',
]

const ALL_VALID_PATHS = new Set([...VALID_PATHS_WITH_DISCHARGE, ...VALID_PATHS_NO_DISCHARGE])

function pathToDisplay(path: string): string {
  return path.split('').join('-')
}

function getLastCaladaResult(steps: CircuitStep[]): CaladaResult | undefined {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].letter === 'C') return steps[i].resultado
  }
  return undefined
}

function hasDuplicateAtomic(events: NormalizedEvent[]): boolean {
  const seen = new Set<string>()
  const atomic = ['SCALE_IN', 'SCALE_OUT', 'EXIT']
  for (const e of events) {
    if (atomic.includes(e.eventType)) {
      if (seen.has(e.eventType)) return true
      seen.add(e.eventType)
    }
  }
  return false
}

/** G después de D y antes de E es sospechosa. G repetida sin re-calada también. */
function isWaitSuspicious(path: string): boolean {
  if (/D.*G.*E/.test(path)) return true
  if (/G.*G.*G/.test(path)) return true
  return false
}

export function validateTrip(events: NormalizedEvent[]): TripValidationResult {
  const flags: TripValidationFlag[] = []
  const empty: TripValidationResult = {
    status: 'INVALID',
    flags: ['MISSING_EVENT'],
    path: '',
    pathDisplay: '',
    caladaResults: [],
    explanation: 'Sin eventos.',
  }

  if (!events || events.length === 0) return empty

  const { path, steps, caladaResults } = eventsToCircuit(events)
  const pathDisplay = pathToDisplay(path)
  const lastResult = getLastCaladaResult(steps)
  const hasD = path.includes('D')
  const hasF = path.endsWith('F')

  if (!path) {
    return {
      ...empty,
      explanation: 'No se pudo construir secuencia del circuito (ningún evento mapeable a A..G).',
    }
  }

  if (!path.startsWith('A')) flags.push('MISSING_EVENT')
  if (!path.includes('B') && (path.includes('C') || path.includes('D') || path.includes('E'))) flags.push('MISSING_EVENT')
  if (!path.includes('C')) flags.push('MISSING_EVENT')
  if (!hasF) flags.push('OPEN_TRIP')

  const cCount = (path.match(/C/g) || []).length
  if (cCount > 3) flags.push('TOO_MANY_CALADAS')

  if (hasD && lastResult !== 'OK') {
    flags.push('D_WITHOUT_OK')
  }
  if (!hasD && lastResult === 'OK') {
    flags.push('D_WITHOUT_OK')
  }

  if (!ALL_VALID_PATHS.has(path)) flags.push('INVALID_PATH')
  if (hasD && lastResult == null) flags.push('NO_CALADA_RESULT')
  if (isWaitSuspicious(path)) flags.push('WAIT_SUSPICIOUS')
  if (hasDuplicateAtomic(events)) flags.push('DUPLICATE_EVENT')

  const isInvalid = flags.length > 0
  if (isInvalid) {
    const reasons = flags.join(', ')
    return {
      status: 'INVALID',
      flags,
      path,
      pathDisplay,
      caladaResults,
      explanation: `Recorrido inválido: ${reasons}. Secuencia: ${pathDisplay}.`,
    }
  }

  if (path === 'ABCDEF' && hasD) {
    return {
      status: 'VALID_IDEAL',
      flags: [],
      path,
      pathDisplay,
      caladaResults,
      explanation: 'Recorrido ideal sin esperas. Secuencia: ' + pathDisplay + '.',
    }
  }

  if (hasD) {
    return {
      status: 'VALID_ACCEPTABLE',
      flags: [],
      path,
      pathDisplay,
      caladaResults,
      explanation: 'Recorrido aceptable (con espera y/o re-calada). Secuencia: ' + pathDisplay + '.',
    }
  }

  return {
    status: 'VALID_NO_DISCHARGE',
    flags: [],
    path,
    pathDisplay,
    caladaResults,
    explanation: 'Recorrido sin descarga (calada NO). Secuencia: ' + pathDisplay + '.',
  }
}
