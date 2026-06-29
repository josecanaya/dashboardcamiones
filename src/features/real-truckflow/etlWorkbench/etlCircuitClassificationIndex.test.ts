import { describe, expect, it } from 'vitest'
import {
  buildAnomalyReviewSummary,
  buildAnomalySequenceBreakdown,
  buildCommitteeCircuitCrossTab,
  buildCircuitClassificationIndex,
  buildSuspiciousDischargeWithoutBalanza,
  committeeChartExportCsv,
  normalizeAnomalySequenceKey,
  promoteExcelMovimientosContrato,
  reclassifyPossibleRejections,
  resolveDischargePointLabel,
  type CircuitClassificationEntry,
} from './etlCircuitClassificationIndex'

function entry(partial: Partial<CircuitClassificationEntry>): CircuitClassificationEntry {
  return {
    journeyId: 'j1',
    plate: 'ABC123',
    normalizedPlate: 'ABC123',
    site: 'ricardone',
    matchedCircuitCode: 'R7',
    executiveCircuitCode: 'R7',
    executiveCircuitLabel: 'Ric→SL',
    executiveCircuitDisplay: 'R7 · Ric→SL',
    matrixFinalStatus: 'INCOMPLETO',
    executiveStatus: 'INCOMPLETO',
    validDetail: '',
    committeeGroup: 'ANOMALIAS',
    committeeReason: 'JOURNEY_INCOMPLETO',
    operationalVariationType: '',
    detectedSequence: 'INGRESO>PREINGRESO>CALADA',
    deviceSequence: '',
    firstEventAt: '2026-05-12T08:00:00.000Z',
    lastEventAt: '2026-05-12T09:30:00.000Z',
    executiveReason: 'JOURNEY_INCOMPLETO',
    pieSliceLabel: 'ANOMALÍAS',
    usefulEventsCount: 3,
    executiveBucket: 'INCOMPLETO',
    matrixReason: 'EVENTOS_INSUFICIENTES',
    color: '#e11d48',
    ...partial,
  }
}

describe('etlCircuitClassificationIndex anomalías', () => {
  it('excluye incompletos (<3 evt) del listado por secuencia', () => {
    const summary = buildAnomalyReviewSummary([
      entry({ journeyId: 'a', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({ journeyId: 'b', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({ journeyId: 'c', usefulEventsCount: 4, detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
    ])
    expect(summary.incompleteCount).toBe(2)
    expect(summary.listedAnomalyCount).toBe(1)
    expect(summary.sequenceRows).toHaveLength(1)
    expect(summary.sequenceRows[0]!.count).toBe(1)
  })

  it('agrupa anomalías por secuencia detectada', () => {
    const rows = buildAnomalySequenceBreakdown([
      entry({ journeyId: 'a', plate: 'A1', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
      entry({ journeyId: 'b', plate: 'A2', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
      entry({ journeyId: 'c', plate: 'B1', detectedSequence: 'INGRESO>EGRESO' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]!.displaySequence).toBe('INGRESO>PREINGRESO>CALADA')
    expect(rows[0]!.count).toBe(2)
    expect(rows[1]!.count).toBe(1)
  })

  it('no asigna anomalías a filas de circuito en cross-tab', () => {
    const cross = buildCommitteeCircuitCrossTab([
      entry({ executiveCircuitCode: 'SIN_PUNTO' }),
      entry({
        journeyId: 'ok',
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
        executiveCircuitCode: 'R7',
      }),
    ])
    const sinPunto = cross.find((r) => r.code === 'SIN_PUNTO')
    expect(sinPunto).toBeUndefined()
    const r7 = cross.find((r) => r.code === 'R7')
    expect(r7?.completos).toBe(1)
    expect(r7?.anomalias).toBe(0)
  })

  it('normaliza claves de secuencia', () => {
    expect(normalizeAnomalySequenceKey('ingreso > preingreso')).toBe('INGRESO>PREINGRESO')
    expect(normalizeAnomalySequenceKey('')).toBe('(SIN_SECUENCIA_DETECTADA)')
  })

  it('exporta CSV unificado para gráficos de conciliación', () => {
    const entries = [
      entry({
        journeyId: 'ok1',
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
        executiveCircuitCode: 'R7',
        executiveCircuitLabel: 'Ric→SL',
        executiveCircuitDisplay: 'R7 · Ric→SL',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
        usefulEventsCount: 5,
      }),
      entry({
        journeyId: 'var1',
        committeeGroup: 'VARIACIONES_OPERATIVAS',
        pieSliceLabel: 'VARIACIONES OPERATIVAS',
        executiveCircuitCode: 'R7',
        operationalVariationType: 'ESPERA_EN_CALADA',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
        usefulEventsCount: 5,
      }),
      entry({ journeyId: 'an1', usefulEventsCount: 2, detectedSequence: 'INGRESO' }),
      entry({
        journeyId: 'an2',
        usefulEventsCount: 4,
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>SL_INGRESO',
        executiveCircuitCode: 'R7',
      }),
    ]
    const crossTab = buildCommitteeCircuitCrossTab(entries)
    const anomalyReview = buildAnomalyReviewSummary(entries)
    const csv = committeeChartExportCsv({
      entries,
      crossTab,
      crossTabTotals: { total: 2, completos: 1, variaciones: 1 },
      anomalyReview,
      circuitBarSlices: [{ code: 'R7', label: 'Ric→SL', displayLabel: 'R7 · Ric→SL', count: 3 }],
    })
    expect(csv).toContain('record_type')
    expect(csv).toContain('CIRCUITO_COMITE')
    expect(csv).toContain('CIRCUITO_COMITE_CELDA')
    expect(csv).toContain('ANOMALIA_RECORRIDO')
    expect(csv).toContain('JOURNEY')
    expect(csv).toContain('ANOMALIA_INCOMPLETOS')
  })

  it('detecta descarga C16/Volcable sin balanza como sospechoso', () => {
    const rows = buildSuspiciousDischargeWithoutBalanza([
      entry({
        journeyId: 'ok-balanza',
        plate: 'AAA111',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>BALANZA_INGRESO>VOLCABLE>BALANZA_EGRESO>EGRESO',
        deviceSequence: 'RicIng>F>RicVolcable1',
      }),
      entry({
        journeyId: 'susp-volc',
        plate: 'BBB222',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>VOLCABLE>EGRESO',
        deviceSequence: 'RicIng>F>RicVolcable2',
      }),
      entry({
        journeyId: 'susp-c16',
        plate: 'CCC333',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>CELDA16_DESCARGA>EGRESO',
        deviceSequence: 'RicIng>F>RicC16Descarga1',
      }),
      entry({
        journeyId: 'no-descarga',
        plate: 'DDD444',
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
      }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.plate).sort()).toEqual(['BBB222', 'CCC333'])
    expect(resolveDischargePointLabel('INGRESO>VOLCABLE', 'RicVolcable2')).toBe('Volcable 2')
    expect(resolveDischargePointLabel('CELDA16_DESCARGA', 'RicC16Descarga1')).toBe('C16 descarga 1')
  })
})

describe('promoteExcelMovimientosContrato', () => {
  const mergeCsv = [
    'journey_uid,product_normalized,platform_normalized,circuit_code,circuit_label,merge_status',
    'j-anom,SOJA,VOLCABLE_1,R5,R5 · Volcable 1,MATCH_EXCEL_ANCHOR',
    'j-ok,TRIGO,CELDA_16,R1,R1 · C16 ingreso,MATCH_EXACT',
  ].join('\n')

  it('saca anomalías con Excel y las asigna al circuito del movimiento', () => {
    const entries = [
      entry({
        journeyId: 'j-anom',
        committeeGroup: 'ANOMALIAS',
        pieSliceLabel: 'ANOMALÍAS',
        executiveCircuitCode: 'SIN_PUNTO',
      }),
      entry({
        journeyId: 'j-ok',
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
        executiveCircuitCode: 'R1',
      }),
    ]
    const { entries: promoted, promotedCount } = promoteExcelMovimientosContrato(entries, mergeCsv)
    expect(promotedCount).toBe(1)
    const recovered = promoted.find((e) => e.journeyId === 'j-anom')!
    expect(recovered.committeeGroup).toBe('COMPLETOS')
    expect(recovered.pieSliceLabel).toBe('COMPLETOS')
    expect(recovered.executiveCircuitCode).toBe('R5')
    expect(recovered.committeeReason).toContain('EXCEL_CONTRATO')

    const anomalyReview = buildAnomalyReviewSummary(promoted)
    expect(anomalyReview.listedAnomalyCount).toBe(0)

    const cross = buildCommitteeCircuitCrossTab(promoted)
    const r5 = cross.find((r) => r.code === 'R5')
    expect(r5?.completos).toBe(1)
    expect(r5?.anomalias).toBe(0)
  })

  it('integra promoción en buildCircuitClassificationIndex', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-anom,ABC123,ricardone,ANOMALIAS,ANOMALÍAS,SIN_PUNTO,,INGRESO>PREINGRESO,4,ANOMALO,ANOMALO,JOURNEY_INCOMPLETO,,JOURNEY_INCOMPLETO,EVENTOS_INSUFICIENTES,,INCOMPLETO,2026-05-12T08:00:00.000Z,2026-05-12T09:00:00.000Z,',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, mergeCsv)
    expect(index.excelPromotedCount).toBe(1)
    expect(index.pieSlices.find((s) => s.name === 'COMPLETOS')?.value).toBe(1)
    expect(index.pieSlices.find((s) => s.name === 'ANOMALÍAS')?.value ?? 0).toBe(0)
  })

  it('POSIBLE_RECHAZO no se concilia con Excel aunque exista fila emparejada', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-rech,DEF456,ricardone,VARIACIONES_OPERATIVAS,VARIACIONES OPERATIVAS,R7,R7 · Ric→SL,INGRESO>PREINGRESO>CALADA>EGRESO,6,INCOMPLETO,INCOMPLETO,POSIBLE_RECHAZO_CONTEMPLADO,POSIBLE_RECHAZO,POSIBLE_RECHAZO_CONTEMPLADO,,,INCOMPLETO,2026-05-29T08:00:00.000Z,2026-05-29T18:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-rech,DEF456,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE PTO 3,R7,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-rech')!
    expect(row.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(row.operationalVariationType).toBe('POSIBLE_RECHAZO')
    expect(row.executiveCircuitCode).toBe('R7')
    expect(row.committeeReason).toBe('POSIBLE_RECHAZO_CONTEMPLADO')
    expect(index.excelFirstReconciledCount).toBe(0)
  })

  it('RS_REC con demora en calada concilia a R7 pero mantiene variación operativa', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-rs,EQV925,ricardone,VARIACIONES_OPERATIVAS,VARIACIONES OPERATIVAS,RS_REC,Recepción sólida inferida,INGRESO>PREINGRESO>CALADA>EGRESO,6,DEDUCIDO,INCOMPLETO,ESPERA_EN_CALADA_CONTEMPLADA,ESPERA_EN_CALADA,ESPERA_EN_CALADA_CONTEMPLADA,,DEDUCIDO,DEDUCIDO,2026-05-29T07:00:00.000Z,2026-05-29T18:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-rs,EQV925,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE PTO 3,RS_REC,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-rs')!
    expect(row.executiveCircuitCode).toBe('R7')
    expect(row.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(row.operationalVariationType).toBe('ESPERA_EN_CALADA')
    expect(buildCommitteeCircuitCrossTab(index.entries).find((r) => r.code === 'R7')?.variaciones).toBe(1)
  })

  it('preserva variaciones de calado por cámara al conciliar Excel-first', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-wait,ABC123,ricardone,VARIACIONES_OPERATIVAS,VARIACIONES OPERATIVAS,R7,R7 · Ric→SL,INGRESO>PREINGRESO>CALADA>EGRESO,6,INCOMPLETO,INCOMPLETO,ESPERA_EN_CALADA_CONTEMPLADA,ESPERA_EN_CALADA,ESPERA_EN_CALADA_CONTEMPLADA,,,INCOMPLETO,2026-05-29T08:00:00.000Z,2026-05-29T18:00:00.000Z,',
      'j-rech,DEF456,ricardone,VARIACIONES_OPERATIVAS,VARIACIONES OPERATIVAS,R5,R5 · Volcable,INGRESO>PREINGRESO>CALADA>EGRESO,6,INCOMPLETO,INCOMPLETO,POSIBLE_RECHAZO_CONTEMPLADO,POSIBLE_RECHAZO,POSIBLE_RECHAZO_CONTEMPLADO,,,INCOMPLETO,2026-05-29T08:00:00.000Z,2026-05-29T18:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-wait,ABC123,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE PTO 3,R7,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
      'op2,j-rech,DEF456,RICARDONE,INGRESO,2026-05-29,MAIZ,MAIZ,VOLCABLE_1,VOLCABLE_1,R5,VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const wait = index.entries.find((e) => e.journeyId === 'j-wait')!
    const rech = index.entries.find((e) => e.journeyId === 'j-rech')!
    expect(wait.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(wait.operationalVariationType).toBe('ESPERA_EN_CALADA')
    expect(wait.executiveCircuitCode).toBe('R7')
    expect(rech.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(rech.operationalVariationType).toBe('POSIBLE_RECHAZO')
    expect(rech.executiveCircuitCode).toBe('R5')
    expect(rech.committeeReason).toBe('POSIBLE_RECHAZO_CONTEMPLADO')
    expect(rech.committeeReason).not.toContain('EXCEL_PLATAFORMA')
    const cross = buildCommitteeCircuitCrossTab(index.entries)
    expect(cross.find((r) => r.code === 'R7')?.variaciones).toBe(1)
    expect(cross.find((r) => r.code === 'R5')?.variaciones).toBe(1)
  })

  it('concilia con excel_operations_with_truckflow en gráficos comité', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-anom,ABC123,ricardone,ANOMALIAS,ANOMALÍAS,SIN_PUNTO,,INGRESO>PREINGRESO>CALADA,5,ANOMALO,ANOMALO,JOURNEY_INCOMPLETO,,JOURNEY_INCOMPLETO,EVENTOS_INSUFICIENTES,,INCOMPLETO,2026-05-12T08:00:00.000Z,2026-05-12T09:00:00.000Z,',
      'j-var,DEF456,ricardone,VARIACIONES_OPERATIVAS,VARIACIONES OPERATIVAS,R1,R1 · C16,INGRESO>PREINGRESO,6,VALIDO,VALIDO,VAR,,,,COMPLETO,2026-05-12T10:00:00.000Z,2026-05-12T11:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-anom,ABC123,RICARDONE,INGRESO,2026-05-12,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE PTO 3,SIN_PUNTO,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_NO_DISCHARGE_POINT,1',
      'op2,j-var,DEF456,RICARDONE,INGRESO,2026-05-12,MAIZ,MAIZ,VOLCABLE_1,VOLCABLE_1,R5,VOLCABLE,EXTERNAL_MATCH_PROBABLE,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    expect(index.excelFirstReconciledCount).toBe(2)
    expect(index.excelPromotedCount).toBe(1)
    const recovered = index.entries.find((e) => e.journeyId === 'j-anom')!
    expect(recovered.committeeGroup).toBe('COMPLETOS')
    expect(recovered.executiveCircuitCode).toBe('R7')
    const moved = index.entries.find((e) => e.journeyId === 'j-var')!
    expect(moved.executiveCircuitCode).toBe('R5')
    const cross = buildCommitteeCircuitCrossTab(index.entries)
    expect(cross.find((r) => r.code === 'R7')?.total).toBe(1)
    expect(cross.find((r) => r.code === 'R5')?.total).toBe(1)
    expect(cross.find((r) => r.code === 'SIN_PUNTO')).toBeUndefined()
  })

  it('VOLCABLE PTO 3 en Excel concilia a R7 no a R5', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-sl,SL001,ricardone,COMPLETOS,COMPLETOS,RS_REC,Recepción sólida inferida,INGRESO>PREINGRESO>CALADA>EGRESO,8,PROBABLE,PROBABLE,RS_REC,,,,DEDUCIDO,2026-05-29T10:00:00.000Z,2026-05-29T12:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-sl,SL001,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE_PTO_3,VOLCABLE PTO 3,RS_REC,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_DEDUCED,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-sl')!
    expect(row.executiveCircuitCode).toBe('R7')
    expect(buildCommitteeCircuitCrossTab(index.entries).find((r) => r.code === 'RS_REC')).toBeUndefined()
  })

  it('RS_REC con VOLCABLE en Excel pasa a R5/R6 según plataforma', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-rs,EQV925,ricardone,COMPLETOS,COMPLETOS,RS_REC,Recepción sólida inferida,INGRESO>PREINGRESO>CALADA>EGRESO,6,PROBABLE,PROBABLE,RS_REC,,,,DEDUCIDO,2026-05-29T10:00:00.000Z,2026-05-29T11:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-rs,EQV925,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,VOLCABLE_2,VOLCABLE_2,RS_REC,VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_DEDUCED,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-rs')!
    expect(row.executiveCircuitCode).toBe('R6')
    expect(row.committeeGroup).toBe('COMPLETOS')
    expect(buildCommitteeCircuitCrossTab(index.entries).find((r) => r.code === 'RS_REC')).toBeUndefined()
  })

  it('anomalía NO_DIFERENCIABLE con SOJA+CELDA_16 en Excel sale de anomalías a R1', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-nd,SU0158,ricardone,ANOMALIAS,ANOMALÍAS,SIN_PUNTO,Sin punto,CALADA>EGRESO>SL_INGRESO,4,NO_DIFERENCIABLE,NO_DIFERENCIABLE,NO_DIFERENCIABLE_SIN_PUNTO_FUERTE,,,,,2026-05-29T12:00:00.000Z,2026-05-29T13:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-nd,SU0158,RICARDONE,INGRESO,2026-05-29,SOJA,SOJA,CELDA_16,CELDA_16,SIN_PUNTO,CELDA16,EXTERNAL_MATCH_PROBABLE,ROUTE_ANOMALOUS,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-nd')!
    expect(row.committeeGroup).toBe('COMPLETOS')
    expect(row.executiveCircuitCode).toBe('R1')
    expect(buildAnomalyReviewSummary(index.entries).listedAnomalyCount).toBe(0)
  })
})

describe('reclassifyPossibleRejections', () => {
  function anomalyRic(detectedSequence: string, partial: Partial<CircuitClassificationEntry> = {}) {
    return entry({
      committeeGroup: 'ANOMALIAS',
      pieSliceLabel: 'ANOMALÍAS',
      executiveCircuitCode: 'SIN_PUNTO',
      committeeReason: 'NO_DIFERENCIABLE_SIN_PUNTO_FUERTE',
      operationalVariationType: '',
      detectedSequence,
      ...partial,
    })
  }

  it('marca POSIBLE_RECHAZO: ingreso→preingreso→calada sin egreso ni SL', () => {
    const { entries, reclassifiedCount } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>CALADA'),
    ])
    expect(reclassifiedCount).toBe(1)
    expect(entries[0]!.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(entries[0]!.pieSliceLabel).toBe('VARIACIONES OPERATIVAS')
    expect(entries[0]!.operationalVariationType).toBe('POSIBLE_RECHAZO')
    expect(entries[0]!.committeeReason).toBe('POSIBLE_RECHAZO_CONTEMPLADO')
  })

  it('marca POSIBLE_RECHAZO con balanza ingreso (sin balanza egreso) y con egreso', () => {
    const { entries } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>CALADA>BALANZA_INGRESO', { journeyId: 'a' }),
      anomalyRic('INGRESO>PREINGRESO>CALADA>EGRESO', { journeyId: 'b' }),
    ])
    expect(entries.every((e) => e.operationalVariationType === 'POSIBLE_RECHAZO')).toBe(true)
  })

  it('NO marca rechazo si completó descarga (volcable o balanza egreso)', () => {
    const { entries, reclassifiedCount } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>CALADA>VOLCABLE>EGRESO', { journeyId: 'a' }),
      anomalyRic('INGRESO>PREINGRESO>CALADA>BALANZA_INGRESO>BALANZA_EGRESO>EGRESO', { journeyId: 'b' }),
    ])
    expect(reclassifiedCount).toBe(0)
    expect(entries.every((e) => e.committeeGroup === 'ANOMALIAS')).toBe(true)
  })

  it('NO marca rechazo si pasó por San Lorenzo', () => {
    const { reclassifiedCount } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>CALADA>EGRESO>SL_INGRESO'),
    ])
    expect(reclassifiedCount).toBe(0)
  })

  it('NO marca rechazo sin calada ni sin entrada Ricardone', () => {
    const { reclassifiedCount } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>EGRESO', { journeyId: 'a' }),
      anomalyRic('CALADA>EGRESO', { journeyId: 'b' }),
    ])
    expect(reclassifiedCount).toBe(0)
  })

  it('NO toca entries que no son anomalías', () => {
    const { reclassifiedCount } = reclassifyPossibleRejections([
      anomalyRic('INGRESO>PREINGRESO>CALADA', {
        committeeGroup: 'COMPLETOS',
        pieSliceLabel: 'COMPLETOS',
      }),
    ])
    expect(reclassifiedCount).toBe(0)
  })

  it('cableado Excel: en Excel → COMPLETOS; sin Excel mismo patrón → POSIBLE_RECHAZO', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-excel,ABC123,ricardone,ANOMALIAS,ANOMALÍAS,SIN_PUNTO,,INGRESO>PREINGRESO>CALADA,5,ANOMALO,ANOMALO,NO_DIFERENCIABLE_SIN_PUNTO_FUERTE,,NO_DIFERENCIABLE_SIN_PUNTO_FUERTE,EVENTOS_INSUFICIENTES,,INCOMPLETO,2026-05-12T08:00:00.000Z,2026-05-12T09:00:00.000Z,',
      'j-rech,XYZ789,ricardone,ANOMALIAS,ANOMALÍAS,SIN_PUNTO,,INGRESO>PREINGRESO>CALADA,5,ANOMALO,ANOMALO,NO_DIFERENCIABLE_SIN_PUNTO_FUERTE,,NO_DIFERENCIABLE_SIN_PUNTO_FUERTE,EVENTOS_INSUFICIENTES,,INCOMPLETO,2026-05-12T08:00:00.000Z,2026-05-12T09:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count',
      'op1,j-excel,ABC123,RICARDONE,INGRESO,2026-05-12,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE PTO 3,SIN_PUNTO,SAN_LORENZO_VOLCABLE,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const inExcel = index.entries.find((e) => e.journeyId === 'j-excel')!
    const notInExcel = index.entries.find((e) => e.journeyId === 'j-rech')!
    expect(inExcel.committeeGroup).toBe('COMPLETOS')
    expect(notInExcel.committeeGroup).toBe('VARIACIONES_OPERATIVAS')
    expect(notInExcel.operationalVariationType).toBe('POSIBLE_RECHAZO')
    expect(buildAnomalyReviewSummary(index.entries).listedAnomalyCount).toBe(0)
  })

  it('aceite/líquido Excel no conserva R7 de Truckflow (R7 es ruta sólidos)', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-aceite,EQV925,terminal_embarque,COMPLETOS,COMPLETOS,R7,Ric→SL,INGRESO>PREINGRESO>CALADA>SL_INGRESO,8,COMPLETO,VALIDO,RUTA_RIC_SAN_LORENZO_COMPLETA,,RUTA_RIC_SAN_LORENZO_COMPLETA,,COMPLETO,COMPLETO,2026-05-12T08:00:00.000Z,2026-05-12T12:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,resolved_executive_circuit_code,match_quality,route_quality,evidence_count',
      'op-aceite,j-aceite,EQV925,TERMINAL_EMBARQUE,INGRESO,2026-05-12,AC GIRASOL OLEICO,AC GIRASOL OLEICO,ACEITE_OSL,ACEITE OSL,ACEITE OSL,R7,LIQUIDO,SL1,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const row = index.entries.find((e) => e.journeyId === 'j-aceite')!
    expect(row.executiveCircuitCode).toBe('SL1')
    expect(row.executiveCircuitCode).not.toBe('R7')
  })
})
