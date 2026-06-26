import { describe, expect, it } from 'vitest'
import {
  buildSegmentScatterByDayRows,
  resolveFranjaHoraria,
} from './etlSegmentScatterByDay'

describe('resolveFranjaHoraria', () => {
  it('turnos operativos 02–08 · 08–14 · 14–20 · 20–02', () => {
    expect(resolveFranjaHoraria('2026-05-29T03:00:00-03:00')).toBe('02_08')
    expect(resolveFranjaHoraria('2026-05-29T07:30:00-03:00')).toBe('02_08')
    expect(resolveFranjaHoraria('2026-05-29T08:00:00-03:00')).toBe('08_14')
    expect(resolveFranjaHoraria('2026-05-29T11:30:00-03:00')).toBe('08_14')
    expect(resolveFranjaHoraria('2026-05-29T14:00:00-03:00')).toBe('14_20')
    expect(resolveFranjaHoraria('2026-05-29T17:45:00-03:00')).toBe('14_20')
    expect(resolveFranjaHoraria('2026-05-29T20:00:00-03:00')).toBe('20_02')
    expect(resolveFranjaHoraria('2026-05-29T23:30:00-03:00')).toBe('20_02')
    expect(resolveFranjaHoraria('2026-05-29T01:00:00-03:00')).toBe('20_02')
  })
})

describe('buildSegmentScatterByDayRows', () => {
  it('asigna turno por inicio del tramo', () => {
    const rows = buildSegmentScatterByDayRows([
      {
        journey_id: 'j1',
        patente: 'ABC123',
        producto: 'SOJA',
        circuito: 'R1',
        segment_from: 'BALANZA_INGRESO',
        segment_to: 'BALANZA_EGRESO',
        timestamp_inicio: '2026-05-29T09:00:00-03:00',
        timestamp_fin: '2026-05-29T10:00:00-03:00',
        duracion_minutos: 60,
        estado_ejecutivo: 'VALIDO',
      },
    ])
    expect(rows[0]!.franja_horaria).toBe('08_14')
  })
})
