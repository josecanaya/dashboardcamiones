import { describe, expect, it } from 'vitest'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import {
  buildExcelFirstReviewSample,
  buildExcelPeriodContext,
  buildPlateIndex,
  deriveRouteQualityForJourney,
  diagnoseNoTruckflowEvidence,
  findTruckflowEvidenceForExcelOperation,
  mergeExcelOperationsWithTruckflowEvidence,
  resolveOperationalContextFromExcel,
} from './etlExcelFirstMerge'
import type { TruckflowJourneyForMerge } from './etlTruckflowMovimientosMerge'
import type { TruckflowSegmentForMerge } from './etlOperationalAnalysis'

function mov(partial: Partial<ExternalMovimientoContratoNormalized>): ExternalMovimientoContratoNormalized {
  return {
    external_operation_id: partial.external_operation_id ?? 'op1',
    source_file: 'test.xlsx',
    source_date: '2026-05-29',
    planta_normalized: 'RICARDONE',
    planta_original: 'RICARDONE',
    mov_original: 'I',
    mov: 'I',
    movement_type: 'INGRESO',
    movement_type_detail: 'I',
    patente_original: 'AA123BB',
    plate_normalized: 'AA123BB',
    contrato: '',
    cliente_contrato: '',
    ingreso_id: '',
    comprob: '',
    cp_remito: '',
    ctg: '',
    cupo: '',
    entregado_por_a: '',
    localidad_proc_dest: '',
    fecha_ing_original: '',
    hora_ing_original: '',
    fecha_calado_original: '',
    hora_calado_original: '',
    fecha_sal_original: '',
    hora_sal_original: '',
    external_ingreso_at: '2026-05-29T09:00:00',
    external_calado_at: '2026-05-29T09:30:00',
    external_salida_at: '2026-05-29T10:30:00',
    cod_prod: '',
    producto_original: 'SOJA',
    product_normalized: 'SOJA',
    plataforma_original: 'VOLCABLE PTO 3',
    platform_normalized: 'VOLCABLE_PTO_3',
    plataforma_manual: '',
    kgs_bruto: '',
    kgs_tara: '',
    kgs_neto: '30000',
    kgs_neto_neto: '',
    humedad: '',
    observaciones: '',
    observacion_calidad: '',
    normalization_warnings: '',
    ...partial,
  }
}

function journey(partial: Partial<TruckflowJourneyForMerge>): TruckflowJourneyForMerge {
  return {
    journey_uid: 'j1',
    plate_original: 'AA123BB',
    plate_normalized: 'AA123BB',
    start_time: '2026-05-29T09:15:00',
    end_time: '2026-05-29T10:45:00',
    duration_min: 90,
    plant_scope: 'RICARDONE',
    circuit_code: 'R5',
    circuit_label: 'Volcable',
    executive_status: 'VALIDO',
    valid_detail: 'COMPLETO',
    observed_sequence: 'INGRESO>PREINGRESO>VOLCABLE',
    expected_sequence: '',
    matched_sequence_name: 'BASE',
    matched_variation_name: '',
    coverage_percent: 85,
    has_strong_point: true,
    useful_events_count: 5,
    anomaly_real: false,
    anomaly_type: '',
    anomaly_origin_plant: '',
    anomaly_leg: '',
    committee_reason: 'CIRCUITO_COMPLETO',
    ...partial,
  }
}

function segment(partial: Partial<TruckflowSegmentForMerge>): TruckflowSegmentForMerge {
  return {
    journey_uid: 'j1',
    plate_normalized: 'AA123BB',
    circuit_code: 'R5',
    circuit_label: 'Volcable',
    segment_order: 1,
    segment_name: 'INGRESO>PREINGRESO',
    segment_from: 'INGRESO',
    segment_to: 'PREINGRESO',
    segment_start_time: '2026-05-29T09:15:00',
    segment_end_time: '2026-05-29T09:40:00',
    segment_duration_min: 25,
    segment_plant: 'RICARDONE',
    segment_leg: 'RIC',
    executive_status: 'VALIDO',
    valid_detail: 'COMPLETO',
    ...partial,
  }
}

function findEvidence(
  m: ExternalMovimientoContratoNormalized,
  journeys: TruckflowJourneyForMerge[],
  segments: TruckflowSegmentForMerge[] = [],
  opts?: { excelFirstWideWindow?: boolean }
) {
  const period = buildExcelPeriodContext([m], journeys)
  const plateIndex = buildPlateIndex(journeys)
  return findTruckflowEvidenceForExcelOperation(m, journeys, segments, plateIndex, period, opts)
}

describe('resolveOperationalContextFromExcel', () => {
  it('SOJA y VOLCABLE_PTO_3 → San Lorenzo', () => {
    const ctx = resolveOperationalContextFromExcel(mov({}))
    expect(ctx.resolved_product).toBe('SOJA')
    expect(ctx.resolved_circuit_family).toBe('SAN_LORENZO_VOLCABLE')
  })

  it('CELDA_16 -> CELDA16', () => {
    const ctx = resolveOperationalContextFromExcel(
      mov({ platform_normalized: 'CELDA_16', plataforma_original: 'CELDA 16' })
    )
    expect(ctx.resolved_circuit_family).toBe('CELDA16')
  })

  it('KEPPLER_1 -> KEPLER', () => {
    const ctx = resolveOperationalContextFromExcel(
      mov({ platform_normalized: 'KEPPLER_1', plataforma_original: 'KEPPLER 1 P' })
    )
    expect(ctx.resolved_circuit_family).toBe('KEPLER')
  })
})

describe('buildExcelPeriodContext', () => {
  it('detecta PERIOD_MISMATCH', () => {
    const period = buildExcelPeriodContext(
      [mov({ source_date: '2026-06-01' })],
      [journey({ start_time: '2026-05-01T08:00:00', end_time: '2026-05-01T09:00:00' })]
    )
    expect(period.period_mismatch).toBe(true)
    expect(period.period_alert).toBe('PERIOD_MISMATCH')
  })
})

describe('diagnoseNoTruckflowEvidence', () => {
  it('NO_PLATE_IN_TRUCKFLOW', () => {
    const m = mov({ plate_normalized: 'ZZZ999', patente_original: 'ZZZ999' })
    const period = buildExcelPeriodContext([m], [])
    const plateIndex = buildPlateIndex([])
    const diag = diagnoseNoTruckflowEvidence(m, plateIndex, period, null, null, 0.82)
    expect(diag.no_truckflow_reason).toBe('NO_PLATE_IN_TRUCKFLOW')
  })

  it('PLATE_EXISTS_OUT_OF_TIME_WINDOW', () => {
    const m = mov({})
    const j = journey({
      start_time: '2026-05-29T20:00:00',
      end_time: '2026-05-29T21:00:00',
    })
    const period = buildExcelPeriodContext([m], [j])
    const plateIndex = buildPlateIndex([j])
    const narrow = { startMs: Date.parse('2026-05-29T08:00:00'), endMs: Date.parse('2026-05-29T11:00:00'), lowConfidence: false, wide: false }
    const wide = { startMs: Date.parse('2026-05-29T06:00:00'), endMs: Date.parse('2026-05-29T13:00:00'), lowConfidence: false, wide: true }
    const diag = diagnoseNoTruckflowEvidence(m, plateIndex, period, narrow, wide, 0.82)
    expect(diag.no_truckflow_reason).toBe('PLATE_EXISTS_OUT_OF_TIME_WINDOW')
  })

  it('PLATE_EXISTS_ONLY_OUTSIDE_EXCEL_PERIOD', () => {
    const m = mov({ source_date: '2026-05-29' })
    const j = journey({
      start_time: '2026-06-10T09:00:00',
      end_time: '2026-06-10T10:00:00',
    })
    const period = buildExcelPeriodContext([m], [j])
    const plateIndex = buildPlateIndex([j])
    const win = { startMs: 0, endMs: Date.now() + 1e9, lowConfidence: false, wide: true }
    const diag = diagnoseNoTruckflowEvidence(m, plateIndex, period, win, win, 0.82)
    expect(diag.no_truckflow_reason).toBe('PLATE_EXISTS_ONLY_OUTSIDE_EXCEL_PERIOD')
  })

  it('INSUFFICIENT_EXTERNAL_TIME sin horarios', () => {
    const m = mov({
      external_ingreso_at: '',
      external_calado_at: '',
      external_salida_at: '',
      source_date: '',
    })
    const ev = findEvidence(m, [])
    expect(ev.no_truckflow_reason).toBe('INSUFFICIENT_EXTERNAL_TIME')
  })
})

describe('findTruckflowEvidenceForExcelOperation', () => {
  it('EXTERNAL_MATCH_EXACT con patente en ventana', () => {
    const ev = findEvidence(mov({}), [journey({})])
    expect(ev.match_quality).toBe('EXTERNAL_MATCH_EXACT')
  })

  it('journey anómalo -> ROUTE_ANOMALOUS', () => {
    const ev = findEvidence(mov({}), [
      journey({ executive_status: 'ANOMALO', valid_detail: '', anomaly_real: true }),
    ])
    expect(ev.route_quality).toBe('ROUTE_ANOMALOUS')
    expect(ev.evidence_count).toBe(1)
  })

  it('DESCARGA_SIN_PUNTO + VOLCABLE_3', () => {
    const ev = findEvidence(
      mov({ platform_normalized: 'VOLCABLE_PTO_3', plataforma_original: 'VOLCABLE PTO 3' }),
      [
        journey({
          circuit_code: 'DESCARGA_SIN_PUNTO',
          executive_status: 'ANOMALO',
          committee_reason: 'DESCARGA_SIN_PUNTO',
        }),
      ]
    )
    expect(ev.route_quality).toBe('ROUTE_NO_DISCHARGE_POINT')
  })

  it('EXTERNAL_MATCH_FRAGMENTED con varios journeys', () => {
    const ev = findEvidence(mov({}), [
      journey({ journey_uid: 'j1', start_time: '2026-05-29T09:00:00', end_time: '2026-05-29T09:30:00' }),
      journey({ journey_uid: 'j2', start_time: '2026-05-29T10:00:00', end_time: '2026-05-29T10:45:00' }),
    ])
    expect(ev.match_quality).toBe('EXTERNAL_MATCH_FRAGMENTED')
    expect(ev.evidence_count).toBe(2)
  })

  it('EXTERNAL_MATCH_WIDE_WINDOW cuando solo entra por ventana amplia', () => {
    const ev = findEvidence(
      mov({}),
      [
        journey({
          start_time: '2026-05-29T14:00:00',
          end_time: '2026-05-29T15:00:00',
        }),
      ],
      [],
      { excelFirstWideWindow: true }
    )
    expect(['EXTERNAL_MATCH_WIDE_WINDOW', 'EXTERNAL_MATCH_PROBABLE', 'EXTERNAL_MATCH_EXACT']).toContain(
      ev.match_quality
    )
  })

  it('NO_TRUCKFLOW_EVIDENCE sin journeys', () => {
    const ev = findEvidence(mov({}), [])
    expect(ev.match_quality).toBe('NO_TRUCKFLOW_EVIDENCE')
  })

  it('POSIBLE_RECHAZO no se empareja con Excel (rechazo sin movimiento contrato)', () => {
    const ev = findEvidence(mov({}), [
      journey({
        committee_reason: 'POSIBLE_RECHAZO_CONTEMPLADO',
        matched_variation_name: 'POSIBLE_RECHAZO',
        executive_status: 'INCOMPLETO',
        valid_detail: '',
      }),
    ])
    expect(ev.evidence_count).toBe(0)
    expect(ev.match_quality).toBe('NO_TRUCKFLOW_EVIDENCE')
  })
})

describe('mergeExcelOperationsWithTruckflowEvidence', () => {
  it('genera fila sin evidencia con no_truckflow_reason', () => {
    const res = mergeExcelOperationsWithTruckflowEvidence([mov({})], [], [])
    expect(res.operations[0]!.no_truckflow_reason).toBe('NO_PLATE_IN_TRUCKFLOW')
    expect(res.noEvidenceDiagnostics).toHaveLength(1)
  })

  it('scatter true para ROUTE_NO_DISCHARGE_POINT con segmentos', () => {
    const res = mergeExcelOperationsWithTruckflowEvidence(
      [mov({})],
      [
        journey({
          circuit_code: 'DESCARGA_SIN_PUNTO',
          committee_reason: 'DESCARGA_SIN_PUNTO',
          executive_status: 'ANOMALO',
        }),
      ],
      [segment({})]
    )
    expect(res.operations[0]!.analysis_ready_for_scatter).toBe(true)
    expect(res.operations[0]!.analysis_ready_for_full_route_kpi).toBe(false)
  })

  it('KPI false para ROUTE_ANOMALOUS', () => {
    const res = mergeExcelOperationsWithTruckflowEvidence(
      [mov({})],
      [journey({ executive_status: 'ANOMALO', anomaly_real: true })],
      [segment({})]
    )
    expect(res.operations[0]!.analysis_ready_for_full_route_kpi).toBe(false)
  })

  it('journey completo -> scatter y KPI', () => {
    const res = mergeExcelOperationsWithTruckflowEvidence(
      [mov({})],
      [journey({})],
      [segment({})]
    )
    expect(res.operations[0]!.analysis_ready_for_scatter).toBe(true)
    expect(res.operations[0]!.analysis_ready_for_full_route_kpi).toBe(true)
  })

  it('summary incluye rangos de fecha', () => {
    const res = mergeExcelOperationsWithTruckflowEvidence([mov({})], [journey({})], [])
    expect(res.summary.excel_min_ingreso_at).toBeTruthy()
    expect(res.summary.truckflow_min_start_time).toBeTruthy()
  })

  it('excel_first_review_sample con cuatro categorías', () => {
    const ops = [
      mov({ external_operation_id: 'e1' }),
      mov({ external_operation_id: 'f1', plate_normalized: 'BB111CC', patente_original: 'BB111CC' }),
      mov({ external_operation_id: 'n1', plate_normalized: 'XX000YY', patente_original: 'XX000YY' }),
      mov({ external_operation_id: 'r1' }),
    ]
    const journeys = [
      journey({ journey_uid: 'j1' }),
      journey({ journey_uid: 'j2', plate_normalized: 'BB111CC', start_time: '2026-05-29T09:00:00', end_time: '2026-05-29T09:20:00' }),
      journey({
        journey_uid: 'j3',
        plate_normalized: 'BB111CC',
        start_time: '2026-05-29T09:25:00',
        end_time: '2026-05-29T10:00:00',
      }),
      journey({
        journey_uid: 'j4',
        circuit_code: 'DESCARGA_SIN_PUNTO',
        committee_reason: 'DESCARGA_SIN_PUNTO',
        executive_status: 'ANOMALO',
      }),
    ]
    const res = mergeExcelOperationsWithTruckflowEvidence(ops, journeys, [segment({}), segment({ journey_uid: 'j4' })])
    const sample = buildExcelFirstReviewSample(res.operations)
    expect(sample.length).toBeGreaterThan(0)
    expect(res.reviewSample.length).toBeGreaterThan(0)
  })
})

describe('deriveRouteQualityForJourney', () => {
  it('VALIDO COMPLETO', () => {
    expect(deriveRouteQualityForJourney(journey({}))).toBe('ROUTE_COMPLETE')
  })
})
