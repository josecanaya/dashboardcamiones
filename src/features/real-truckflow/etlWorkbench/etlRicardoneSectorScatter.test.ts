import { describe, expect, it } from 'vitest'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'
import {
  filterScatterByDayForSector,
  summarizeCrossCircuitSectorFromScatter,
  RICARDONE_CROSS_CIRCUIT_SECTORS,
} from './etlRicardoneSectorScatter'

function row(partial: Partial<SegmentScatterByDayRow>): SegmentScatterByDayRow {
  return {
    journey_id: 'j1',
    patente: 'AA111',
    producto: 'SOJA',
    circuito: 'R7',
    tramo_operativo: 'preingreso → calada',
    sector: '',
    planta: 'RICARDONE',
    segment_from: 'PREINGRESO',
    segment_to: 'CALADA',
    timestamp_inicio: '2026-06-12T08:00:00-03:00',
    timestamp_fin: '2026-06-12T08:30:00-03:00',
    fecha_tramo: '2026-06-12',
    hora_inicio: '08:00',
    franja_horaria: 'Mañana',
    color_franja: '#f97316',
    duracion_minutos: 30,
    estado_ejecutivo: 'VALIDO',
    es_ultimo_cuarto: false,
    p75_tramo: 0,
    p90_tramo: 0,
    horario_fuente: 'truckflow',
    ...partial,
  }
}

describe('etlRicardoneSectorScatter', () => {
  it('agrupa preingreso→calada sin filtrar por circuito', () => {
    const rows = [
      row({ circuito: 'R7', journey_id: 'a' }),
      row({ circuito: 'R1', journey_id: 'b' }),
      row({ circuito: 'R7', segment_from: 'INGRESO', segment_to: 'PREINGRESO', journey_id: 'c' }),
    ]
    const sector = RICARDONE_CROSS_CIRCUIT_SECTORS[0]!
    const filtered = filterScatterByDayForSector(rows, sector.fromCode, sector.toCode)
    expect(filtered).toHaveLength(2)
    const sum = summarizeCrossCircuitSectorFromScatter(rows, sector)
    expect(sum.operationCount).toBe(2)
    expect(sum.circuitBreakdown).toHaveLength(2)
  })
})
