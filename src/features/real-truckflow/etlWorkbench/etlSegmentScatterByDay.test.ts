import { describe, expect, it } from 'vitest'
import {
  buildSegmentScatterByDayRows,
  normalizeTruckflowScatterRowForByDay,
  resolveFranjaHoraria,
  segmentStartLocalParts,
} from './etlSegmentScatterByDay'

describe('resolveFranjaHoraria', () => {
  it('madrugada 00:00–05:59', () => {
    expect(resolveFranjaHoraria('2026-05-29T00:00:00')).toBe('Madrugada')
    expect(resolveFranjaHoraria('2026-05-29T05:30:00')).toBe('Madrugada')
  })

  it('mañana 06:00–11:59 (naranja)', () => {
    expect(resolveFranjaHoraria('2026-05-29T06:00:00')).toBe('Mañana')
    expect(resolveFranjaHoraria('2026-05-29T11:30:00')).toBe('Mañana')
  })

  it('tarde 12:00–17:59', () => {
    expect(resolveFranjaHoraria('2026-05-29T12:00:00')).toBe('Tarde')
    expect(resolveFranjaHoraria('2026-05-29T17:45:00')).toBe('Tarde')
  })

  it('noche 18:00–23:59', () => {
    expect(resolveFranjaHoraria('2026-05-29T18:00:00')).toBe('Noche')
    expect(resolveFranjaHoraria('2026-05-29T23:30:00')).toBe('Noche')
  })
})

describe('buildSegmentScatterByDayRows', () => {
  it('marca es_ultimo_cuarto con P75 por producto+circuito+tramo', () => {
    const sources = Array.from({ length: 4 }, (_, i) =>
      normalizeTruckflowScatterRowForByDay({
        journey_uid: `j${i}`,
        plate_normalized: `P${i}`,
        product_normalized: 'SOJA',
        circuit_code: 'R7',
        segment_from: 'PREINGRESO',
        segment_to: 'CALADA',
        segment_start_time: `2026-05-29T${String(7 + i).padStart(2, '0')}:00:00`,
        segment_end_time: `2026-05-29T${String(7 + i).padStart(2, '0')}:30:00`,
        segment_duration_min: [10, 20, 30, 100][i],
        executive_status: 'VALIDO',
      } as never)
    ).filter((s): s is NonNullable<typeof s> => s !== null)

    const rows = buildSegmentScatterByDayRows(sources)
    expect(rows).toHaveLength(4)
    const top = rows.find((r) => r.duracion_minutos === 100)
    expect(top?.es_ultimo_cuarto).toBe(true)
    expect(top?.p75_tramo).toBeGreaterThan(0)
    expect(top?.franja_horaria).toBe('Mañana')
    expect(top?.color_franja).toBe('#f97316')
    expect(segmentStartLocalParts(top!.timestamp_inicio)?.fecha_tramo).toBe('2026-05-29')
  })
})
