import { describe, expect, it } from 'vitest'
import {
  computeSegmentTramoHourlyFlow,
  countSegmentTramoFlowPlacement,
  segmentTramoFlowMetrics,
} from './etlSegmentTramoFlow'

describe('etlSegmentTramoFlow', () => {
  it('acumula camiones en tramo por hora', () => {
    const slots = computeSegmentTramoHourlyFlow(
      [
        {
          timestamp_inicio: '2026-06-01T08:10:00',
          timestamp_fin: '2026-06-01T09:30:00',
          fecha_tramo: '2026-06-01',
        },
        {
          timestamp_inicio: '2026-06-01T08:45:00',
          timestamp_fin: '2026-06-01T10:00:00',
          fecha_tramo: '2026-06-01',
        },
      ],
      ['2026-06-01']
    )
    const h8 = slots.find((s) => s.hour === 8)!
    const h9 = slots.find((s) => s.hour === 9)!
    const h10 = slots.find((s) => s.hour === 10)!
    expect(h8.ingresos).toBe(2)
    expect(h9.egresos).toBe(1)
    expect(h10.egresos).toBe(1)
    expect(h9.camionesEnTramo).toBeGreaterThanOrEqual(1)
    const m = segmentTramoFlowMetrics(slots)
    expect(m.totalIngresos).toBe(2)
    expect(m.totalEgresos).toBe(2)
  })

  it('ubica filas aunque fecha_tramo no esté en el hint del disco', () => {
    const rows = [
      {
        timestamp_inicio: '2026-06-09T10:00:00',
        timestamp_fin: '2026-06-09T10:15:00',
        fecha_tramo: '2026-06-09',
      },
    ]
    const hintSoloCuatro = ['2026-06-04', '2026-06-05']
    const placement = countSegmentTramoFlowPlacement(rows, hintSoloCuatro)
    expect(placement.ingresosColocados).toBe(1)
    const slots = computeSegmentTramoHourlyFlow(rows, hintSoloCuatro)
    const h10 = slots.find((s) => s.fecha === '2026-06-09' && s.hour === 10)
    expect(h10?.ingresos).toBe(1)
    expect(h10?.egresos).toBe(1)
  })
})
