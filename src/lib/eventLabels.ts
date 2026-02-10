import type { EventType, LocationKey } from '../domain/truck'

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  QUEUE_OUTSIDE: 'Cola exterior',
  GATE_CHECKIN: 'Ingreso portería',
  DOCS_OK: 'Documentación OK',
  DOCS_PROBLEM: 'Problema documentación',
  SCALE_IN: 'Pesaje entrada',
  YARD_WAIT: 'Espera en patio',
  SAMPLE_SOLID_TAKEN: 'Calada (sólidos)',
  SAMPLE_LIQUID_TAKEN: 'Muestreo líquido',
  LAB_RESULT_READY: 'Resultado laboratorio',
  DISCHARGE_ASSIGNED: 'Descarga asignada',
  DISCHARGE_START: 'Inicio descarga',
  DISCHARGE_END: 'Fin descarga',
  SCALE_OUT: 'Pesaje salida',
  EXIT: 'Egreso',
  UNKNOWN: 'Desconocido',
}

export const LOCATION_LABELS: Record<LocationKey, string> = {
  GATE: 'Portería',
  SCALE_IN: 'Balanza entrada',
  SAMPLE_BAY_A: 'Calada A',
  SAMPLE_BAY_B: 'Calada B',
  LAB: 'Laboratorio',
  YARD_A: 'Patio A',
  YARD_B: 'Patio B',
  PIT_1: 'Fosa 1',
  PIT_2: 'Fosa 2',
  PIT_3: 'Fosa 3',
  LIQUID_BAY_1: 'Muelle líquidos 1',
  LIQUID_BAY_2: 'Muelle líquidos 2',
  LIQUID_BAY_3: 'Muelle líquidos 3',
  SCALE_OUT: 'Balanza salida',
  EXIT: 'Salida',
  UNKNOWN: '—',
}
