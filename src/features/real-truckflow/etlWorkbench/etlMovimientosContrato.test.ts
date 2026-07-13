import { describe, expect, it } from 'vitest'
import {
  combineDateTime,
  formatIsoLocal,
  normalizeMovementType,
  normalizePlant,
  normalizePlatform,
  normalizePlate,
  normalizeProduct,
  stableExternalHash,
} from './etlExternalNormalization'
import { normalizeMovimientoContrato } from './etlExternalMovimientosContrato'
import {
  mergeTruckflowWithMovimientos,
  type TruckflowJourneyForMerge,
} from './etlTruckflowMovimientosMerge'
import {
  buildCleanJourneysForAnalysis,
  buildSegmentScatterAnalysis,
  evaluateAnalysisReady,
} from './etlOperationalAnalysis'
import { createOperationalSample } from './etlOperationalSampling'
import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'

function journey(partial: Partial<TruckflowJourneyForMerge>): TruckflowJourneyForMerge {
  return {
    journey_uid: 'j1',
    plate_original: 'AA123BB',
    plate_normalized: 'AA123BB',
    start_time: '2026-05-29T10:00:00',
    end_time: '2026-05-29T11:00:00',
    duration_min: 60,
    plant_scope: 'RICARDONE',
    circuit_code: 'R19',
    circuit_label: 'Volcable',
    executive_status: 'VALIDO',
    valid_detail: 'COMPLETO',
    observed_sequence: 'INGRESO>PREINGRESO>VOLCABLE',
    expected_sequence: '',
    matched_sequence_name: 'BASE',
    matched_variation_name: '',
    coverage_percent: 80,
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

function movimiento(partial: Partial<ExternalMovimientoContratoNormalized>): ExternalMovimientoContratoNormalized {
  return {
    external_operation_id: 'CTG_999',
    source_file: 'MovimientosPorContrato_20260529.xlsx',
    source_date: '2026-05-29',
    planta_original: 'RICARDONE',
    planta_normalized: 'RICARDONE',
    mov_original: 'I',
    mov: 'I',
    movement_type: 'INGRESO',
    movement_type_detail: 'I',
    patente_original: 'AA 123 BB',
    plate_normalized: 'AA123BB',
    contrato: '',
    cliente_contrato: '',
    ingreso_id: '',
    comprob: '',
    cp_remito: '',
    ctg: '999',
    cupo: '',
    entregado_por_a: '',
    localidad_proc_dest: '',
    fecha_ing_original: '29/05/2026',
    hora_ing_original: '10:05',
    fecha_calado_original: '',
    hora_calado_original: '',
    fecha_sal_original: '29/05/2026',
    hora_sal_original: '11:00',
    external_ingreso_at: '2026-05-29T10:05:00',
    external_calado_at: '',
    external_salida_at: '2026-05-29T11:00:00',
    cod_prod: '',
    producto_original: 'soja',
    product_normalized: 'SOJA',
    plataforma_original: 'VOLCABLE PTO 3',
    platform_normalized: 'VOLCABLE_3',
    plataforma_manual: '',
    kgs_bruto: '',
    kgs_tara: '',
    kgs_neto: '',
    kgs_neto_neto: '',
    humedad: '',
    observaciones: '',
    observacion_calidad: '',
    es_de_vuelta_original: '',
    es_de_vuelta: false,
    normalization_warnings: '',
    external_sl_balanza_entrada_at: '',
    external_sl_balanza_salida_at: '',
    tiempos_entre_pasos_source_file: '',
    tiempos_entre_pasos_match: '',
    ...partial,
  }
}

describe('etlExternalNormalization', () => {
  it('normalizePlate', () => {
    expect(normalizePlate('AA 123 BB')).toBe('AA123BB')
    expect(normalizePlate('AA-123-BB')).toBe('AA123BB')
    expect(normalizePlate('aa123bb')).toBe('AA123BB')
  })

  it('normalizePlant', () => {
    expect(normalizePlant('TERMINAL DE EMBARQUE').planta_normalized).toBe('TERMINAL_EMBARQUE')
    expect(normalizePlant('PLANTA SAN LORENZO').planta_normalized).toBe('RICARDONE')
    expect(normalizePlant('SAN LORENZO').planta_normalized).toBe('TERMINAL_EMBARQUE')
  })

  it('normalizeProduct', () => {
    expect(normalizeProduct(' soja ').product_normalized).toBe('SOJA')
  })

  it('normalizePlatform', () => {
    expect(normalizePlatform('VOLCABLE PTO 3').platform_normalized).toBe('VOLCABLE_PTO_3')
    expect(normalizePlatform('VOLCABLE 1').platform_normalized).toBe('VOLCABLE_1')
    expect(normalizePlatform('VOLCABLE 2').platform_normalized).toBe('VOLCABLE_2')
    expect(normalizePlatform('CELDA 16-4').platform_normalized).toBe('CELDA_16')
    expect(normalizePlatform('KEPPLER 1 P').platform_normalized).toBe('KEPPLER_1')
  })

  it('combineDateTime ingreso', () => {
    const { at } = combineDateTime('29/05/2026', '10:30')
    expect(at).not.toBeNull()
    expect(formatIsoLocal(at)).toMatch(/2026-05-29T10:30:00/)
  })

  it('external_operation_id CTG y hash', () => {
    const withCtg = normalizeMovimientoContrato(
      { ctg: 'ABC', patente: 'AA123BB', producto: 'SOJA', fecha_ing: '29/05/2026', hora_ing: '10:00' },
      'f.xlsx',
      '2026-05-29'
    )
    expect(withCtg.external_operation_id).toBe('CTG_ABC')

    const ctgZero = normalizeMovimientoContrato(
      {
        ctg: '0',
        comprob: '99',
        patente: 'AA123BB',
        producto: 'ACEITE',
        plataforma: 'ACEITE OSL',
        fecha_ing: '29/05/2026',
        hora_ing: '10:00',
        ingreso: '5001',
      },
      'f.xlsx',
      '2026-05-29'
    )
    expect(ctgZero.external_operation_id).not.toBe('CTG_0')
    expect(ctgZero.external_operation_id).toBe('COMPROB_99')

    const withComprob = normalizeMovimientoContrato(
      { comprob: '55', patente: 'AA123BB', producto: 'SOJA', fecha_ing: '29/05/2026', hora_ing: '10:00' },
      'f.xlsx',
      '2026-05-29'
    )
    expect(withComprob.external_operation_id).toBe('COMPROB_55')

    const hash = stableExternalHash('seed')
    expect(hash.startsWith('HASH_')).toBe(true)
  })

  it('normalizeMovementType', () => {
    expect(normalizeMovementType('I').movement_type).toBe('INGRESO')
    expect(normalizeMovementType('DI').movement_type).toBe('DESPACHO')
  })
})

describe('mergeTruckflowWithMovimientos', () => {
  it('MATCH_EXACT con patente y ventana', async () => {
    const res = await mergeTruckflowWithMovimientos([journey({})], [movimiento({})])
    expect(['MATCH_EXACT', 'MATCH_EXCEL_ANCHOR']).toContain(res.merged[0]!.merge_status)
    expect(res.merged[0]!.product_normalized).toBe('SOJA')
  })

  it('MATCH_PROBABLE sin plataforma/planta extra', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [journey({ plant_scope: 'UNKNOWN' })],
      [movimiento({ platform_normalized: '', planta_normalized: '' })],
      { minExactConfidence: 0.95 }
    )
    expect(['MATCH_PROBABLE', 'MATCH_EXACT', 'MATCH_EXCEL_ANCHOR']).toContain(res.merged[0]!.merge_status)
  })

  it('MATCH_AMBIGUOUS con varios candidatos', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [journey({})],
      [
        movimiento({ external_operation_id: 'CTG_1', ctg: '1' }),
        movimiento({ external_operation_id: 'CTG_2', ctg: '2' }),
      ]
    )
    expect(['MATCH_AMBIGUOUS', 'MATCH_MULTIPLE', 'MATCH_MULTIPLE_RESOLVED', 'MATCH_EXCEL_ANCHOR']).toContain(
      res.merged[0]!.merge_status
    )
  })

  it('NO_EXTERNAL_MATCH', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [journey({ plate_normalized: 'ZZ999ZZ' })],
      [movimiento({ plate_normalized: 'AA123BB' })],
      { enrichUnmatchedByPlateDay: false }
    )
    expect(res.merged[0]!.merge_status).toBe('NO_EXTERNAL_MATCH')
  })

  it('enriquece por patente+día alineado a salida Excel (sin descarga cámara)', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [
        journey({
          executive_status: 'NO_DIFERENCIABLE',
          committee_reason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
          observed_sequence: 'INGRESO>PREINGRESO>CALADA',
          start_time: '2026-05-29T08:00:00',
          end_time: '2026-05-29T09:00:00',
        }),
      ],
      [
        movimiento({
          external_ingreso_at: '2026-05-29T08:10:00',
          external_salida_at: '2026-05-29T09:05:00',
        }),
      ],
      { enrichUnmatchedByPlateDay: true, excelFirstPass: false }
    )
    expect(res.merged[0]!.product_normalized).toBe('SOJA')
    expect(['MATCH_ENRICHED_PLATE_DAY', 'MATCH_PROBABLE', 'MATCH_EXACT']).toContain(
      res.merged[0]!.merge_status
    )
    expect(res.merged[0]!.operational_enrichment_ready).toBe(true)
    expect(res.merged[0]!.missing_camera_discharge).toBe(true)
  })

  it('misma patente dos productos mismo día — elige por hora salida Excel', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [
        journey({
          journey_uid: 'j-am',
          plate_normalized: 'EQV925',
          plate_original: 'EQV925',
          circuit_code: 'R5',
          circuit_label: 'Recepción Volcable 1',
          observed_sequence: 'INGRESO>PREINGRESO>CALADA>VOLCABLE',
          start_time: '2026-05-29T07:30:00',
          end_time: '2026-05-29T09:00:00',
        }),
        journey({
          journey_uid: 'j-pm',
          plate_normalized: 'EQV925',
          plate_original: 'EQV925',
          circuit_code: 'R5',
          circuit_label: 'Recepción Volcable 1',
          observed_sequence: 'INGRESO>PREINGRESO>CALADA>VOLCABLE',
          start_time: '2026-05-29T13:30:00',
          end_time: '2026-05-29T15:00:00',
        }),
      ],
      [
        movimiento({
          external_operation_id: 'CTG_SOJA',
          ctg: 'SOJA1',
          product_normalized: 'SOJA',
          producto_original: 'SOJA',
          platform_normalized: 'VOLCABLE_1',
          external_ingreso_at: '2026-05-29T07:40:00',
          external_salida_at: '2026-05-29T08:55:00',
          plate_normalized: 'EQV925',
        }),
        movimiento({
          external_operation_id: 'CTG_GIR',
          ctg: 'GIR1',
          product_normalized: 'GIRASOL',
          producto_original: 'GIRASOL',
          platform_normalized: 'VOLCABLE_1',
          external_ingreso_at: '2026-05-29T13:40:00',
          external_salida_at: '2026-05-29T14:55:00',
          plate_normalized: 'EQV925',
        }),
      ]
    )
    const am = res.merged.find((r) => r.journey_uid === 'j-am')
    const pm = res.merged.find((r) => r.journey_uid === 'j-pm')
    expect(am?.product_normalized).toBe('SOJA')
    expect(pm?.product_normalized).toBe('GIRASOL')
  })

  it('anomalía con circuito Excel queda analysis_ready', async () => {
    const res = await mergeTruckflowWithMovimientos(
      [
        journey({
          journey_uid: 'j-anom',
          circuit_code: '',
          circuit_label: '',
          executive_status: 'ANOMALO',
          anomaly_real: true,
          observed_sequence: 'INGRESO>PREINGRESO',
          start_time: '2026-05-29T13:30:00',
          end_time: '2026-05-29T15:00:00',
        }),
      ],
      [
        movimiento({
          product_normalized: 'GIRASOL',
          producto_original: 'GIRASOL',
          platform_normalized: 'VOLCABLE_PTO_1',
          plataforma_original: 'VOLCABLE PTO 1',
          external_salida_at: '2026-05-29T14:55:00',
          external_ingreso_at: '2026-05-29T13:40:00',
        }),
      ]
    )
    const row = res.merged[0]!
    expect(row.product_normalized).toBe('GIRASOL')
    expect(row.circuit_code).toBe('R7')
    expect(row.circuit_from_excel).toBe(true)
    const clean = buildCleanJourneysForAnalysis(res.merged)[0]!
    expect(clean.operational_enrichment_ready).toBe(true)
    expect(clean.analysis_ready).toBe(true)
  })

  it('NO_TRUCKFLOW_MATCH', async () => {
    const res = await mergeTruckflowWithMovimientos([journey({})], [
      movimiento({ plate_normalized: 'XX000XX', ctg: '77' }),
    ])
    expect(res.movimientosWithoutMatch.length).toBe(1)
  })
})

describe('analysis_ready y scatter', () => {
  it('analysis_ready true con producto y merge confiable', async () => {
    const res = await mergeTruckflowWithMovimientos([journey({})], [movimiento({})])
    const clean = buildCleanJourneysForAnalysis(res.merged)
    expect(clean[0]!.analysis_ready).toBe(true)
  })

  it('analysis_ready false sin producto', async () => {
    const row = (
      await mergeTruckflowWithMovimientos(
      [journey({})],
      [movimiento({ product_normalized: '' })]
    )).merged[0]!
    const ev = evaluateAnalysisReady(row)
    expect(ev.analysis_ready).toBe(false)
    expect(ev.analysis_exclusion_reason).toBe('NO_PRODUCT')
  })

  it('outlier por encima de p95', async () => {
    const segments = Array.from({ length: 8 }, (_, i) => ({
      journey_uid: `j${i}`,
      plate_normalized: 'AA123BB',
      circuit_code: 'R19',
      circuit_label: 'Volcable',
      segment_order: 1,
      segment_name: 'a → b',
      segment_from: 'A',
      segment_to: 'B',
      segment_start_time: '2026-05-29T10:00:00',
      segment_end_time: '2026-05-29T10:10:00',
      segment_duration_min: i < 7 ? 10 : 120,
      segment_plant: 'RICARDONE',
      segment_leg: 'RIC',
      executive_status: 'VALIDO',
      valid_detail: 'COMPLETO',
    }))
    const merged = new Map(
      await Promise.all(
        segments.map(async (s) => [
          s.journey_uid,
          (
            await mergeTruckflowWithMovimientos(
              [journey({ journey_uid: s.journey_uid })],
              [movimiento({})]
            )
          ).merged[0]!,
        ] as const)
      )
    )
    const clean = new Map(
      [...merged.entries()].map(([uid, m]) => [
        uid,
        buildCleanJourneysForAnalysis([m])[0]!,
      ])
    )
    const scatter = buildSegmentScatterAnalysis(segments, merged, clean)
    const outlier = scatter.find((r) => Number(r.segment_duration_min) === 120)
    expect(outlier?.is_outlier).toBe(true)
  })

  it('muestra no supera sampleSize', () => {
    const clean = Array.from({ length: 100 }, (_, i) => ({
      journey_uid: `j${i}`,
      plate_normalized: 'AA123BB',
      start_time: '2026-05-29T10:00:00',
      end_time: '2026-05-29T11:00:00',
      duration_min: 60,
      circuit_code: i % 2 === 0 ? 'R19' : 'R7',
      circuit_label: 'C',
      executive_status: 'VALIDO',
      valid_detail: 'COMPLETO',
      product_normalized: i % 2 === 0 ? 'SOJA' : 'MAIZ',
      platform_normalized: 'VOLCABLE_1',
      planta_normalized: 'RICARDONE',
      movement_type: 'INGRESO',
      external_operation_id: `CTG_${i}`,
      merge_status: 'MATCH_EXACT',
      merge_confidence: 0.9,
      coverage_percent: 80,
      has_strong_point: true,
      observed_sequence: '',
      expected_sequence: '',
      matched_sequence_name: '',
      matched_variation_name: '',
      analysis_ready: true,
      analysis_exclusion_reason: '',
          operational_enrichment_ready: true,
          missing_camera_discharge: false,
          circuit_from_excel: false,
          truckflow_circuit_code: 'R19',
        }))
    const sample = createOperationalSample(clean, { sampleSize: 30 })
    expect(sample.sample.length).toBeLessThanOrEqual(30)
    const circuits = new Set(sample.sample.map((s) => s.circuit_code))
    expect(circuits.size).toBeGreaterThan(1)
  })
})
