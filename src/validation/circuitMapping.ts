/**
 * Mapeo evento normalizado → circuito lógico A..G.
 * A=Ingreso, B=Balanza1, C=Calada, D=Descarga, E=Balanza2, F=Egreso, G=Espera.
 * C.resultado (OK/NO/OBS) se obtiene de LAB_RESULT_READY o de raw.labResult en la fila de SAMPLE_*.
 * D: solo DISCHARGE_END (UNLOAD_END) añade letra D para que pathKey sea ABCDEF con start+end.
 */

import type { NormalizedEvent } from '../domain/events'

export type CircuitLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'

/** Resultado de calada: OK=aprobado, NO=rechazado, OBS=observado (re-calada posible). */
export type CaladaResult = 'OK' | 'NO' | 'OBS'

/** Un paso del circuito con opcional resultado (solo para C). */
export interface CircuitStep {
  letter: CircuitLetter
  /** Solo presente cuando letter === 'C'. */
  resultado?: CaladaResult
}

const EVENT_TO_LETTER: Partial<Record<string, CircuitLetter>> = {
  GATE_CHECKIN: 'A',
  SCALE_IN: 'B',
  SAMPLE_SOLID_TAKEN: 'C',
  SAMPLE_LIQUID_TAKEN: 'C',
  DISCHARGE_END: 'D',
  SCALE_OUT: 'E',
  EXIT: 'F',
  YARD_WAIT: 'G',
}

/** Máximo de C (1 inicial + 2 re-caladas). Máximo de D = 2. */
const MAX_C = 3
const MAX_D = 2

/** Extrae resultado de calada desde ev.raw (labResult, resultado, status). Sirve para LAB_RESULT_READY o para SAMPLE_* con labResult en la misma fila. */
function getCaladaResultFromRaw(ev: NormalizedEvent): CaladaResult | undefined {
  const status = (ev.raw?.status as string)?.toUpperCase()
  const resultado = String(ev.raw?.resultado ?? ev.raw?.labResult ?? '')
    .toLowerCase()
    .trim()
  const lab = String(ev.raw?.labResult ?? '').toUpperCase()
  if (status === 'REJECTED' || lab === 'NO' || resultado === 'rechazado' || resultado === 'no') return 'NO'
  if (status === 'OBSERVED' || lab === 'OBS' || resultado === 'observado' || resultado === 'obs') return 'OBS'
  if (status === 'APPROVED' || lab === 'OK' || resultado === 'aprobado' || resultado === 'ok' || resultado === 'si') return 'OK'
  return undefined
}

function getCaladaResult(ev: NormalizedEvent): CaladaResult | undefined {
  if (ev.eventType !== 'LAB_RESULT_READY') return undefined
  return getCaladaResultFromRaw(ev)
}

/**
 * Construye la secuencia del circuito (path) y los resultados de calada desde eventos ordenados por tiempo.
 * No inventa eventos; solo mapea los existentes a A..G.
 */
export function eventsToCircuit(events: NormalizedEvent[]): { path: string; steps: CircuitStep[]; caladaResults: CaladaResult[] } {
  const steps: CircuitStep[] = []
  const caladaResults: CaladaResult[] = []
  let cCount = 0
  let dCount = 0
  const sorted = events.slice().sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i]
    const letter = EVENT_TO_LETTER[ev.eventType]
    if (letter === 'C') {
      if (cCount >= MAX_C) continue
      cCount++
      steps.push({ letter: 'C' })
      const resFromRow = getCaladaResultFromRaw(ev)
      if (resFromRow != null) caladaResults.push(resFromRow)
    } else if (letter === 'D') {
      if (dCount >= MAX_D) continue
      dCount++
      steps.push({ letter: 'D' })
    } else if (letter) {
      steps.push({ letter })
    }
    if (ev.eventType === 'LAB_RESULT_READY') {
      const res = getCaladaResult(ev)
      if (res != null) caladaResults.push(res)
    }
  }

  // Asignar resultado al último C cuando corresponda (el LAB_RESULT_READY sigue al C)
  let caladaIdx = 0
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].letter === 'C' && caladaIdx < caladaResults.length) {
      steps[i].resultado = caladaResults[caladaIdx]
      caladaIdx++
    }
  }

  const path = steps.map((s) => s.letter).join('')
  return { path, steps, caladaResults }
}
