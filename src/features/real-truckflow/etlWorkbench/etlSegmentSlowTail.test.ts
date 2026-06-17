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

  it('CSV lentos (default) usa el mismo universo que la gráfica (incluye excel_salida)', () => {
    const truckflowRows = Array.from({ length: 8 }, (_, i) =>
      row({
        duracion_minutos: 50 + i,
        patente: `TF${i}`,
        journey_id: `tf${i}`,
        horario_fuente: 'truckflow',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'truckflow',
      })
    )
    const excelRows = Array.from({ length: 5 }, (_, i) =>
      row({
        duracion_minutos: 500 + i,
        patente: `EX${i}`,
        journey_id: `ex${i}`,
        horario_fuente: 'excel_salida',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'excel_salida',
      })
    )
    const tail = pickSlowTailScatterRows([...excelRows, ...truckflowRows])
    expect(tail[0]!.patente).toBe('EX4')
    expect(tail[0]!.duracion_minutos).toBe(504)
  })

  it('máximos estrictos: excluye salida Excel e inicio inferido (sin inducir nada)', () => {
    const truckflowRows = Array.from({ length: 8 }, (_, i) =>
      row({
        duracion_minutos: 135 + i,
        patente: `TF${i}`,
        journey_id: `tf${i}`,
        horario_fuente: 'truckflow',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'truckflow',
      })
    )
    const excelRows = [
      row({
        duracion_minutos: 239,
        patente: 'EXCEL',
        journey_id: 'excel',
        horario_fuente: 'excel_salida',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'excel_salida',
      }),
      row({
        duracion_minutos: 300,
        patente: 'INFER',
        journey_id: 'infer',
        horario_fuente: 'mixto',
        horario_fuente_inicio: 'balanza_ingreso_inferido',
        horario_fuente_fin: 'truckflow',
      }),
    ]
    const tail = pickSlowTailScatterRows([...excelRows, ...truckflowRows], {
      strictTruckflowOnly: true,
      minDurationMinutes: 130,
    })
    expect(tail.every((r) => r.horario_fuente_inicio === 'truckflow')).toBe(true)
    expect(tail.every((r) => r.horario_fuente_fin === 'truckflow')).toBe(true)
    expect(tail.some((r) => r.patente === 'EXCEL' || r.patente === 'INFER')).toBe(false)
    expect(tail.every((r) => r.duracion_minutos > 130)).toBe(true)
  })

  it('máximos estrictos: umbral mínimo descarta duraciones ≤ 130 min', () => {
    const rows = [
      row({
        duracion_minutos: 120,
        patente: 'CORTO',
        horario_fuente: 'truckflow',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'truckflow',
      }),
      row({
        duracion_minutos: 145,
        patente: 'LARGO',
        horario_fuente: 'truckflow',
        horario_fuente_inicio: 'truckflow',
        horario_fuente_fin: 'truckflow',
      }),
    ]
    const tail = pickSlowTailScatterRows(rows, {
      strictTruckflowOnly: true,
      minDurationMinutes: 130,
    })
    expect(tail).toHaveLength(1)
    expect(tail[0]!.patente).toBe('LARGO')
  })
})
