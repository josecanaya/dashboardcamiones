/**
 * Espejo de KPI_BY_TYPE (server/plantState/sectorProfiles.mjs).
 * La UI lee esto; no decide qué KPIs mostrar.
 */
import type { SectorType } from '../../services/live/plantStateApi'

export type SectorKpiKey =
  | 'rate60'
  | 'present'
  | 'occupancy'
  | 'in60'
  | 'out60'
  | 'dwellP90'
  | 'dwellAvg'
  | 'delta40'
  | 'queueAhead'
  | 'waitAvg'
  | 'accumulationUpstream'
  | 'balance60'

export const KPI_BY_TYPE: Record<SectorType, SectorKpiKey[]> = {
  gate: ['rate60', 'present'],
  queue: ['present', 'occupancy', 'in60', 'out60', 'dwellP90'],
  process: ['present', 'rate60', 'dwellAvg', 'dwellP90', 'queueAhead'],
  buffer: ['present', 'occupancy', 'in60', 'out60', 'delta40', 'dwellP90'],
  scale: ['present', 'rate60', 'waitAvg', 'dwellAvg'],
  discharge: ['present', 'rate60', 'waitAvg', 'accumulationUpstream'],
  load: ['present', 'rate60', 'dwellAvg'],
  exit: ['rate60', 'queueAhead', 'balance60'],
}

export const KPI_LABELS: Record<SectorKpiKey, string> = {
  rate60: 'Ritmo / h',
  present: 'Presentes',
  occupancy: 'Ocupación',
  in60: 'Entraron 60 min',
  out60: 'Salieron 60 min',
  dwellP90: 'Permanencia P90',
  dwellAvg: 'Permanencia media',
  delta40: 'Variación 40 min',
  queueAhead: 'Cola aguas arriba',
  waitAvg: 'Espera media',
  accumulationUpstream: 'Acumulación aguas arriba',
  balance60: 'Balance 60 min',
}

export const TYPE_LABELS: Record<SectorType, string> = {
  gate: 'acceso',
  queue: 'cola',
  process: 'proceso',
  buffer: 'pulmón',
  scale: 'balanza',
  discharge: 'descarga',
  load: 'carga',
  exit: 'egreso',
}
