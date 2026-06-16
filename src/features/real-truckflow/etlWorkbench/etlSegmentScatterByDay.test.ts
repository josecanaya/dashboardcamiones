import { describe, expect, it } from 'vitest'
import {
  buildExcelScatterByDaySources,
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

  it('scatter SL balanza→egreso no acepta fila cruda con clamp 180 min si hay ingreso puerto Truckflow', () => {
    const rows = [
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-scatter-sl',
        journey_uid: 'j-scatter',
        plate_normalized: 'CC333',
        product_normalized: 'SOJA',
        platform_normalized: 'SL1',
        resolved_circuit_family: 'SL',
        resolved_operational_point: '',
        segment_order_global: 1,
        segment_order_journey: 1,
        segment_name: 'balanza de entrada → egreso',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-05-12T06:00:00',
        segment_end_time: '2026-05-12T09:00:00',
        segment_duration_min: 180,
        segment_plant: 'SL',
        segment_leg: 'SL',
        truckflow_circuit_code: 'R26',
        resolved_executive_circuit_code: 'R26',
        truckflow_executive_status: 'VALIDO',
        truckflow_valid_detail: '',
        match_quality: 'exact' as const,
        route_quality: 'complete' as const,
        analysis_warning: '',
        external_salida_at: '2026-05-12T14:00:00',
        external_ingreso_at: '2026-05-12T06:00:00',
        planta_normalized: 'SAN_LORENZO',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-scatter-sl',
        journey_uid: 'j-scatter',
        plate_normalized: 'CC333',
        product_normalized: 'SOJA',
        platform_normalized: 'SL1',
        resolved_circuit_family: 'SL',
        resolved_operational_point: '',
        segment_order_global: 2,
        segment_order_journey: 2,
        segment_name: 'balanza egreso → san lorenzo ingreso',
        segment_from: 'BALANZA_EGRESO',
        segment_to: 'SL_INGRESO',
        segment_start_time: '2026-05-12T10:00:00',
        segment_end_time: '2026-05-12T10:30:00',
        segment_duration_min: 30,
        segment_plant: 'RIC',
        segment_leg: 'RIC',
        truckflow_circuit_code: 'R26',
        resolved_executive_circuit_code: 'R26',
        truckflow_executive_status: 'VALIDO',
        truckflow_valid_detail: '',
        match_quality: 'exact' as const,
        route_quality: 'complete' as const,
        analysis_warning: '',
        external_salida_at: '2026-05-12T14:00:00',
        external_ingreso_at: '2026-05-12T06:00:00',
        planta_normalized: 'SAN_LORENZO',
      },
    ]

    const sources = buildExcelScatterByDaySources(rows)
    const sl = sources.find(
      (s) => s.segment_from === 'SL_BALANZA_INGRESO' && s.segment_to === 'SL_EGRESO'
    )
    expect(sl).toBeDefined()
    expect(sl!.duracion_minutos).not.toBe(180)
    expect(sl!.duracion_minutos).toBeGreaterThan(60)
    expect(sl!.duracion_minutos).toBeLessThanOrEqual(360)
    expect(Date.parse(sl!.timestamp_inicio)).toBeGreaterThan(Date.parse('2026-05-12T10:00:00'))
  })
})
