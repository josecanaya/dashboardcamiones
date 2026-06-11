import { describe, expect, it } from 'vitest'
import {
  pickSlowTailScatterRows,
  slowTailDurationThreshold,
  scatterRowsToSlowTailExport,
} from './etlSegmentSlowTail'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'

function row(partial: Partial<SegmentScatterByDayRow> & { duracion_minutos: number }): SegmentScatterByDayRow {
  return {
    journey_id: 'j1',
    patente: partial.patente ?? 'AA000BB',
    producto: 'SOJA',
    circuito: 'R1',
    tramo_operativo: 'INGRESO → BALANZA',
    timestamp_inicio: partial.timestamp_inicio ?? '2026-05-01T08:00:00',
    timestamp_fin: partial.timestamp_fin ?? '2026-05-01T09:00:00',
    fecha_tramo: '2026-05-01',
    hora_inicio: '08:00',
    franja_horaria: 'Mañana',
    color_franja: '#f97316',
    estado_ejecutivo: 'COMPLETO',
    es_ultimo_cuarto: false,
    p75_tramo: 0,
    p90_tramo: 0,
    ...partial,
  }
}

describe('etlSegmentSlowTail', () => {
  it('umbral P80 para cola del 20 %', () => {
    const durs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const th = slowTailDurationThreshold(durs)
    expect(th).toBe(82)
  })

  it('exporta patente e ingreso/egreso del 20 % más lento', () => {
    const rows = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((dur, i) =>
      row({
        duracion_minutos: dur,
        patente: `P${i}`,
        timestamp_inicio: `2026-05-01T0${i}:00:00`,
        timestamp_fin: `2026-05-01T1${i}:00:00`,
      })
    )
    const tail = pickSlowTailScatterRows(rows)
    expect(tail.length).toBeGreaterThanOrEqual(2)
    expect(tail[0]!.duracion_minutos).toBe(100)
    const csvRows = scatterRowsToSlowTailExport(rows)
    expect(csvRows[0]!.patente).toBe('P9')
    expect(csvRows[0]!.horario_ingreso).toContain('T9')
  })
})
