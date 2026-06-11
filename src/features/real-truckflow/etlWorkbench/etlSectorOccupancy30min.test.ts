import { describe, expect, it } from 'vitest'
import {
  computeSectorOccupancyFromScatter,
  filterScatterRowsForOccupancyDay,
  markStockInitialEvents,
  STOCK_INITIAL_MOTIVO,
  type SectorOccupancyEvent,
} from './etlSectorOccupancy30min'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'

function row(partial: Partial<SegmentScatterByDayRow> & { timestamp_inicio: string; timestamp_fin: string }): SegmentScatterByDayRow {
  return {
    journey_id: 'j1',
    patente: 'AA111',
    producto: 'SOJA',
    circuito: 'R1',
    tramo_operativo: 'ingreso → preingreso',
    sector: 'ingreso → preingreso',
    planta: 'RICARDONE',
    segment_from: 'INGRESO',
    segment_to: 'PREINGRESO',
    fecha_tramo: '2026-05-29',
    hora_inicio: '08:00',
    franja_horaria: 'Mañana',
    color_franja: '#f97316',
    duracion_minutos: 15,
    estado_ejecutivo: 'COMPLETO',
    es_ultimo_cuarto: false,
    p75_tramo: 0,
    p90_tramo: 0,
    horario_fuente: 'truckflow',
    ...partial,
  }
}

describe('etlSectorOccupancy30min', () => {
  it('marca stock inicial si egresa en 2 h sin ingreso en ventana', () => {
    const periodStart = Date.parse('2026-05-29T00:00:00')
    const events: SectorOccupancyEvent[] = [
      {
        journey_id: 'a',
        patente: 'X',
        producto: 'SOJA',
        circuito: 'R1',
        tramo_operativo: 't',
        sector: 't',
        planta: 'RICARDONE',
        timestamp_inicio: '2026-05-28T20:00:00',
        timestamp_fin: '2026-05-29T01:00:00',
        duracion_minutos: 60,
        estado_ejecutivo: '',
        es_stock_inicial: false,
        motivo_stock_inicial: '',
        fecha_inicio: '',
        hora_inicio: '',
        fecha_fin: '',
        hora_fin: '',
      },
    ]
    const marked = markStockInitialEvents(events, periodStart)
    expect(marked[0]!.es_stock_inicial).toBe(true)
    expect(marked[0]!.motivo_stock_inicial).toBe(STOCK_INITIAL_MOTIVO)
  })

  it('primer intervalo > 0 si hay stock inicial (egreso temprano sin ingreso en ventana)', () => {
    const crossDay = row({
      journey_id: 'stock1',
      fecha_tramo: '2026-05-28',
      timestamp_inicio: '2026-05-28T22:00:00',
      timestamp_fin: '2026-05-29T01:00:00',
    })
    const { series } = computeSectorOccupancyFromScatter([crossDay], ['2026-05-29'])
    expect(series[0]!.ocupacion_inicial).toBe(1)
    expect(series[0]!.ocupacion_estimada).toBeGreaterThan(0)
  })

  it('incluye tramos que cruzan medianoche al filtrar por día', () => {
    const crossDay = row({
      journey_id: 'x',
      fecha_tramo: '2026-05-28',
      timestamp_inicio: '2026-05-28T23:00:00',
      timestamp_fin: '2026-05-29T02:00:00',
    })
    const kept = filterScatterRowsForOccupancyDay([crossDay], '2026-05-29')
    expect(kept).toHaveLength(1)
  })

  it('ocupacion = stock + ing acum - egr acum', () => {
    const { series } = computeSectorOccupancyFromScatter(
      [
        row({
          journey_id: 'j1',
          timestamp_inicio: '2026-05-29T08:00:00',
          timestamp_fin: '2026-05-29T08:30:00',
        }),
        row({
          journey_id: 'j2',
          timestamp_inicio: '2026-05-29T08:15:00',
          timestamp_fin: '2026-05-29T09:00:00',
        }),
      ],
      ['2026-05-29']
    )
    const slot8 = series.find((s) => s.intervalo_inicio.includes('T08:00'))
    expect(slot8).toBeDefined()
    expect(slot8!.ingresos_intervalo).toBeGreaterThanOrEqual(1)
    expect(slot8!.ocupacion_estimada).toBeGreaterThanOrEqual(1)
  })
})
