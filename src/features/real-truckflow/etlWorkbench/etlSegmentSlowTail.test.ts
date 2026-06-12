import { describe, expect, it } from 'vitest'
import {
  pickSlowTailScatterRows,
  slowTailDurationThreshold,
  slowTailExportCount,
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
  it('umbral P90 para cola del 10 %', () => {
    const durs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    const th = slowTailDurationThreshold(durs)
    expect(th).toBe(91)
  })

  it('slowTailExportCount: 10 % con tope 30', () => {
    expect(slowTailExportCount(10)).toBe(1)
    expect(slowTailExportCount(100)).toBe(10)
    expect(slowTailExportCount(500)).toBe(30)
  })

  it('exporta solo el 10 % más lento (máx. 30)', () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      row({
        duracion_minutos: i + 1,
        patente: `P${i}`,
        journey_id: `j${i}`,
        timestamp_inicio: `2026-05-01T08:${String(i).padStart(2, '0')}:00`,
        timestamp_fin: `2026-05-01T09:${String(i).padStart(2, '0')}:00`,
      })
    )
    const tail = pickSlowTailScatterRows(rows)
    expect(tail).toHaveLength(10)
    expect(tail[0]!.duracion_minutos).toBe(100)
    expect(tail[9]!.duracion_minutos).toBe(91)

    const many = Array.from({ length: 400 }, (_, i) =>
      row({ duracion_minutos: i + 1, patente: `M${i}`, journey_id: `m${i}` })
    )
    expect(pickSlowTailScatterRows(many)).toHaveLength(30)

    const csvRows = scatterRowsToSlowTailExport(rows)
    expect(csvRows).toHaveLength(10)
    expect(csvRows[0]!.patente).toBe('P99')
    expect(csvRows[0]!.duracion_minutos).toBe(100)
  })
})
