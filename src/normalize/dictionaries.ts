/**
 * Diccionarios editables: sinónimos de eventos y sectores para normalizar textos sucios.
 * Adaptar a los exports reales de planta.
 */

import type { EventType } from '../domain/truck'
import type { LocationKey } from '../domain/truck'

/** Raw (ej: "Calada", "CALADO", "MUESTRA") -> EventType. Claves en minusculas sin tildes (normalizeKey). */
export const EVENT_SYNONYMS: Record<string, EventType> = {
  // Canonical names (preserve when CSV already uses internal event types)
  queue_outside: 'QUEUE_OUTSIDE',
  gate_checkin: 'GATE_CHECKIN',
  docs_ok: 'DOCS_OK',
  docs_problem: 'DOCS_PROBLEM',
  scale_in: 'SCALE_IN',
  yard_wait: 'YARD_WAIT',
  sample_solid_taken: 'SAMPLE_SOLID_TAKEN',
  sample_liquid_taken: 'SAMPLE_LIQUID_TAKEN',
  lab_result_ready: 'LAB_RESULT_READY',
  discharge_assigned: 'DISCHARGE_ASSIGNED',
  discharge_start: 'DISCHARGE_START',
  discharge_end: 'DISCHARGE_END',
  scale_out: 'SCALE_OUT',
  cola: 'QUEUE_OUTSIDE',
  'cola exterior': 'QUEUE_OUTSIDE',
  queue: 'QUEUE_OUTSIDE',
  ingreso: 'GATE_CHECKIN',
  porteria: 'GATE_CHECKIN',
  gate: 'GATE_CHECKIN',
  checkin: 'GATE_CHECKIN',
  'check in': 'GATE_CHECKIN',
  entrada: 'GATE_CHECKIN',
  'documentacion ok': 'DOCS_OK',
  'docs ok': 'DOCS_OK',
  'documento ok': 'DOCS_OK',
  'problema documentacion': 'DOCS_PROBLEM',
  'docs problem': 'DOCS_PROBLEM',
  pesaje: 'SCALE_IN',
  'pesaje entrada': 'SCALE_IN',
  balanza: 'SCALE_IN',
  'balanza entrada': 'SCALE_IN',
  'scale in': 'SCALE_IN',
  'peso bruto': 'SCALE_IN',
  'pesaje salida': 'SCALE_OUT',
  'balanza salida': 'SCALE_OUT',
  'scale out': 'SCALE_OUT',
  tara: 'SCALE_OUT',
  'peso neto': 'SCALE_OUT',
  calada: 'SAMPLE_SOLID_TAKEN',
  calado: 'SAMPLE_SOLID_TAKEN',
  muestra: 'SAMPLE_SOLID_TAKEN',
  'muestra solida': 'SAMPLE_SOLID_TAKEN',
  sonda: 'SAMPLE_SOLID_TAKEN',
  'sample solid': 'SAMPLE_SOLID_TAKEN',
  'muestreo liquido': 'SAMPLE_LIQUID_TAKEN',
  'sample liquid': 'SAMPLE_LIQUID_TAKEN',
  espera: 'YARD_WAIT',
  'yard wait': 'YARD_WAIT',
  patio: 'YARD_WAIT',
  'espera patio': 'YARD_WAIT',
  wait: 'YARD_WAIT',
  queue_wait: 'YARD_WAIT',
  'queue wait': 'YARD_WAIT',
  laboratorio: 'LAB_RESULT_READY',
  lab: 'LAB_RESULT_READY',
  'resultado lab': 'LAB_RESULT_READY',
  'resultado laboratorio': 'LAB_RESULT_READY',
  aprobado: 'LAB_RESULT_READY',
  rechazado: 'LAB_RESULT_READY',
  observado: 'LAB_RESULT_READY',
  calada_ok: 'LAB_RESULT_READY',
  calada_obs: 'LAB_RESULT_READY',
  calada_no: 'LAB_RESULT_READY',
  'calada ok': 'LAB_RESULT_READY',
  'calada obs': 'LAB_RESULT_READY',
  'calada no': 'LAB_RESULT_READY',
  'descarga asignada': 'DISCHARGE_ASSIGNED',
  'asignacion descarga': 'DISCHARGE_ASSIGNED',
  'inicio descarga': 'DISCHARGE_START',
  'fin descarga': 'DISCHARGE_END',
  'descarga inicio': 'DISCHARGE_START',
  'descarga fin': 'DISCHARGE_END',
  'discharge start': 'DISCHARGE_START',
  'discharge end': 'DISCHARGE_END',
  'unload start': 'DISCHARGE_START',
  'unload end': 'DISCHARGE_END',
  unload_start: 'DISCHARGE_START',
  unload_end: 'DISCHARGE_END',
  egreso: 'EXIT',
  salida: 'EXIT',
  exit: 'EXIT',
  'gate checkout': 'EXIT',
  gate_checkout: 'EXIT',
  checkout: 'EXIT',
}

/** Raw (ej: "Porteria", "Balanza 1") -> LocationKey. Claves sin tildes. */
export const LOCATION_SYNONYMS: Record<string, LocationKey> = {
  porteria: 'GATE',
  gate: 'GATE',
  ingreso: 'GATE',
  'balanza entrada': 'SCALE_IN',
  'balanza 1': 'SCALE_IN',
  'scale in': 'SCALE_IN',
  'pesaje entrada': 'SCALE_IN',
  'calada a': 'SAMPLE_BAY_A',
  'calada b': 'SAMPLE_BAY_B',
  'sample bay a': 'SAMPLE_BAY_A',
  'sample bay b': 'SAMPLE_BAY_B',
  laboratorio: 'LAB',
  lab: 'LAB',
  'patio a': 'YARD_A',
  'patio b': 'YARD_B',
  'yard a': 'YARD_A',
  'yard b': 'YARD_B',
  'fosa 1': 'PIT_1',
  'fosa 2': 'PIT_2',
  'fosa 3': 'PIT_3',
  'pit 1': 'PIT_1',
  'pit 2': 'PIT_2',
  'pit 3': 'PIT_3',
  'muelle liquidos 1': 'LIQUID_BAY_1',
  'liquid bay 1': 'LIQUID_BAY_1',
  'muelle liquidos 2': 'LIQUID_BAY_2',
  'liquid bay 2': 'LIQUID_BAY_2',
  'muelle liquidos 3': 'LIQUID_BAY_3',
  'liquid bay 3': 'LIQUID_BAY_3',
  'balanza salida': 'SCALE_OUT',
  'balanza 2': 'SCALE_OUT',
  'scale out': 'SCALE_OUT',
  salida: 'EXIT',
  egreso: 'EXIT',
  exit: 'EXIT',
}

function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/\u0301/g, '')
    .replace(/\s+/g, ' ')
}

export function normalizeEventType(raw: string): EventType | 'UNKNOWN' {
  if (!raw || typeof raw !== 'string') return 'UNKNOWN'
  const key = normalizeKey(raw)
  if (EVENT_SYNONYMS[key]) return EVENT_SYNONYMS[key]
  // Intentar coincidencia parcial
  for (const [syn, type] of Object.entries(EVENT_SYNONYMS)) {
    if (key.includes(syn) || syn.includes(key)) return type
  }
  return 'UNKNOWN'
}

export function normalizeLocation(raw: string): LocationKey | 'UNKNOWN' {
  if (!raw || typeof raw !== 'string') return 'UNKNOWN'
  const key = normalizeKey(raw)
  if (LOCATION_SYNONYMS[key]) return LOCATION_SYNONYMS[key]
  for (const [syn, loc] of Object.entries(LOCATION_SYNONYMS)) {
    if (key.includes(syn) || syn.includes(key)) return loc
  }
  return 'UNKNOWN'
}

/** Si el evento crudo es CALADA_OK/OBS/NO, devuelve OK|OBS|NO para raw.labResult. */
export function getCaladaResultFromEventType(rawEvent: string): 'OK' | 'OBS' | 'NO' | undefined {
  if (!rawEvent || typeof rawEvent !== 'string') return undefined
  const key = normalizeKey(rawEvent).replace(/\s+/g, '_')
  if (key === 'calada_ok' || key === 'calada ok') return 'OK'
  if (key === 'calada_obs' || key === 'calada obs') return 'OBS'
  if (key === 'calada_no' || key === 'calada no') return 'NO'
  return undefined
}
