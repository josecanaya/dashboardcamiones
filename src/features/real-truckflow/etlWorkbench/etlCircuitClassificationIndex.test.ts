import { describe, expect, it } from 'vitest'
import {
  buildAnomalyListContextFromTransformCsv,
  buildAnomalyReviewSummary,
  buildAnomalySequenceBreakdown,
  buildCommitteeCircuitCrossTab,
  buildCircuitClassificationIndex,
  buildSuspiciousDischargeWithoutBalanza,
  committeeChartExportCsv,
  collectNormalizedPlatesFromCsv,
  collectTransileInternoExcludedPlates,
  collectExcelPlateDaysFromCsv,
  excelPlateDayKey,
  stampMissingExcelAnomalies,
  filterEntriesByMinTruckflowCrossings,
  isListedAnomalyCandidate,
  isTransileExcludedFromAnomalyList,
  normalizeAnomalySequenceKey,
  promoteExcelMovimientosContrato,
  reclassifyPossibleRejections,
  resolveDischargePointLabel,
  truckflowCrossingCountFromEntry,
  type AnomalyListContext,
  type CircuitClassificationEntry,
} from './etlCircuitClassificationIndex'

/** Excel cargado sin esas patentes → candidatas a anomalía. */
const excelLoadedEmpty: AnomalyListContext = { excelPlates: new Set() }

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
    eventCount: 3,
    executiveBucket: 'INCOMPLETO',
    matrixReason: 'EVENTOS_INSUFICIENTES',
    color: '#e11d48',
    ...partial,
  }
}

describe('filterEntriesByMinTruckflowCrossings', () => {
  it('excluye event_count 0 y 1; incluye 2 y 3', () => {
    const rows = [
      entry({ journeyId: 'e0', eventCount: 0, usefulEventsCount: 5, detectedSequence: '' }),
      entry({ journeyId: 'e1', eventCount: 1, detectedSequence: 'INGRESO' }),
      entry({ journeyId: 'e2', eventCount: 2, detectedSequence: 'INGRESO>EGRESO' }),
      entry({ journeyId: 'e3', eventCount: 3, detectedSequence: 'A>B>C' }),
    ]
    const out = filterEntriesByMinTruckflowCrossings(rows, 2)
    expect(out.map((e) => e.journeyId)).toEqual(['e2', 'e3'])
  })

  it('no usa useful_events_count cuando eventCount está definido', () => {
    const kept = filterEntriesByMinTruckflowCrossings(
      [entry({ eventCount: 0, usefulEventsCount: 10 })],
      2
    )
    expect(kept).toHaveLength(0)
    expect(truckflowCrossingCountFromEntry(entry({ eventCount: 0, usefulEventsCount: 10 }))).toBe(0)
  })

  it('R7 soja no se altera al filtrar (solo filtra lista)', () => {
    const r7 = entry({
      executiveCircuitCode: 'R7',
      committeeReason: 'RUTA_RIC_SAN_LORENZO',
      eventCount: 4,
    })
    expect(filterEntriesByMinTruckflowCrossings([r7], 2)).toHaveLength(1)
    expect(filterEntriesByMinTruckflowCrossings([r7], 2)[0]!.executiveCircuitCode).toBe('R7')
  })
})

describe('etlCircuitClassificationIndex anomalías', () => {
  it('sin Excel cargado el listado queda vacío', () => {
    const summary = buildAnomalyReviewSummary([
      entry({ journeyId: 'c', usefulEventsCount: 4, detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
    ])
    expect(summary.incompleteCount).toBe(0)
    expect(summary.listedAnomalyCount).toBe(0)
  })

  it('excluye incompletos (<2 evt) del listado por secuencia', () => {
    const summary = buildAnomalyReviewSummary(
      [
        entry({ journeyId: 'a', usefulEventsCount: 1, detectedSequence: 'INGRESO' }),
        entry({ journeyId: 'b', usefulEventsCount: 1, detectedSequence: 'INGRESO' }),
        entry({ journeyId: 'c', usefulEventsCount: 4, detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
      ],
      excelLoadedEmpty
    )
    expect(summary.incompleteCount).toBe(2)
    expect(summary.listedAnomalyCount).toBe(1)
    expect(summary.sequenceRows).toHaveLength(1)
    expect(summary.sequenceRows[0]!.count).toBe(1)
  })

  it('lista ≥2 capturas Truckflow aunque el comité no diga ANOMALIAS', () => {
    const summary = buildAnomalyReviewSummary(
      [
        entry({
          journeyId: 'ok',
          committeeGroup: 'COMPLETOS',
          pieSliceLabel: 'COMPLETOS',
          usefulEventsCount: 2,
          detectedSequence: 'INGRESO>EGRESO',
        }),
      ],
      excelLoadedEmpty
    )
    expect(summary.listedAnomalyCount).toBe(1)
  })

  it('excluye patente presente en Excel contractual', () => {
    const ctx: AnomalyListContext = { excelPlates: new Set(['ABC123']) }
    expect(isListedAnomalyCandidate(entry({ usefulEventsCount: 4 }), ctx)).toBe(false)
    expect(buildAnomalyReviewSummary([entry({ usefulEventsCount: 4 })], ctx).listedAnomalyCount).toBe(0)
  })

  it('excluye transile externo e interno', () => {
    expect(isTransileExcludedFromAnomalyList(entry({ executiveCircuitCode: 'R26' }))).toBe(true)
    expect(isTransileExcludedFromAnomalyList(entry({ executiveCircuitCode: 'R19' }))).toBe(true)
    expect(isTransileExcludedFromAnomalyList(entry({ executiveCircuitCode: 'R7' }))).toBe(false)
    const summary = buildAnomalyReviewSummary(
      [
        entry({ journeyId: 'ext', executiveCircuitCode: 'R27', usefulEventsCount: 5 }),
        entry({ journeyId: 'int', executiveCircuitCode: 'R20', usefulEventsCount: 5 }),
        entry({
          journeyId: 'ok',
          executiveCircuitCode: 'R5',
          usefulEventsCount: 5,
          plate: 'ZZZ999',
          normalizedPlate: 'ZZZ999',
        }),
      ],
      excelLoadedEmpty
    )
    expect(summary.listedAnomalyCount).toBe(1)
    expect(summary.sequenceRows[0]!.trucks[0]!.journeyId).toBe('ok')
  })

  it('excluye flota del plate registry', () => {
    const ctx: AnomalyListContext = {
      excelPlates: new Set(),
      excludedRegistryPlates: new Set(['ABC123']),
    }
    expect(buildAnomalyReviewSummary([entry({ usefulEventsCount: 5 })], ctx).listedAnomalyCount).toBe(0)
  })

  describe('corridas nuevas con anomaly_kind (clasificador de comportamiento)', () => {
    it('lista solo BEHAVIORAL; separa DATA_COVERAGE en incompleteCount', () => {
      const summary = buildAnomalyReviewSummary(
        [
          entry({
            journeyId: 'beh',
            plate: 'B1',
            normalizedPlate: 'B1',
            anomalyKind: 'BEHAVIORAL',
            anomalyKindReason: 'RETROCESO_SECUENCIA',
            detectedSequence: 'INGRESO>PREINGRESO>EGRESO>INGRESO',
          }),
          entry({
            journeyId: 'data',
            plate: 'D1',
            normalizedPlate: 'D1',
            anomalyKind: 'DATA_COVERAGE',
            anomalyKindReason: 'EVENTOS_INSUFICIENTES',
            detectedSequence: 'INGRESO',
          }),
          entry({
            journeyId: 'ok',
            plate: 'O1',
            normalizedPlate: 'O1',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
          }),
        ],
        excelLoadedEmpty
      )
      expect(summary.listedAnomalyCount).toBe(1)
      expect(summary.sequenceRows[0]!.trucks[0]!.journeyId).toBe('beh')
      expect(summary.incompleteCount).toBe(1)
    })

    it('BEHAVIORAL aparece aunque no haya Excel cargado', () => {
      const summary = buildAnomalyReviewSummary([
        entry({ anomalyKind: 'BEHAVIORAL', detectedSequence: 'INGRESO>EGRESO>INGRESO' }),
      ])
      expect(summary.listedAnomalyCount).toBe(1)
    })

    it('excluye BEHAVIORAL cuya patente es transile interno de sesión', () => {
      const ctx: AnomalyListContext = {
        excelPlates: null,
        transileExcludedPlates: new Set(['TR1']),
      }
      const summary = buildAnomalyReviewSummary(
        [
          entry({ journeyId: 't', plate: 'TR1', normalizedPlate: 'TR1', anomalyKind: 'BEHAVIORAL' }),
          entry({ journeyId: 'x', plate: 'XX9', normalizedPlate: 'XX9', anomalyKind: 'BEHAVIORAL' }),
        ],
        ctx
      )
      expect(summary.listedAnomalyCount).toBe(1)
      expect(summary.sequenceRows[0]!.trucks[0]!.journeyId).toBe('x')
    })

    it('registry excluye BEHAVIORAL también', () => {
      const ctx: AnomalyListContext = {
        excelPlates: null,
        excludedRegistryPlates: new Set(['SRV1']),
      }
      const summary = buildAnomalyReviewSummary(
        [entry({ plate: 'SRV1', normalizedPlate: 'SRV1', anomalyKind: 'BEHAVIORAL' })],
        ctx
      )
      expect(summary.listedAnomalyCount).toBe(0)
    })

    it('excluye BEHAVIORAL / reglas de oro si Excel De la vuelta = SI', () => {
      const ctx: AnomalyListContext = {
        excelPlates: new Set(['V1', 'V2']),
        deVueltaExcludedPlates: new Set(['V1']),
      }
      const summary = buildAnomalyReviewSummary(
        [
          entry({
            journeyId: 'vuelta',
            plate: 'V1',
            normalizedPlate: 'V1',
            anomalyKind: 'BEHAVIORAL',
            anomalyKindReason: 'SL_RIC_VUELTA_RAPIDA_NO_PELLET',
          }),
          entry({
            journeyId: 'otra',
            plate: 'V2',
            normalizedPlate: 'V2',
            anomalyKind: 'BEHAVIORAL',
            anomalyKindReason: 'RIC_SL_DEMORA',
          }),
        ],
        ctx
      )
      expect(summary.listedAnomalyCount).toBe(1)
      expect(summary.sequenceRows[0]!.trucks[0]!.journeyId).toBe('otra')
    })

    it('G5 stampMissingExcelAnomalies: entrada+salida sin Excel patente+día', () => {
      const day = '2026-07-10'
      const ctx: AnomalyListContext = {
        excelPlates: new Set(['EN_EXCEL']),
        excelPlateDays: new Set([excelPlateDayKey('EN_EXCEL', day)]),
      }
      const stamped = stampMissingExcelAnomalies(
        [
          entry({
            journeyId: 'sin',
            plate: 'XX1',
            normalizedPlate: 'XX1',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>PREINGRESO>EGRESO',
            firstEventAt: `${day}T10:00:00-03:00`,
            lastEventAt: `${day}T18:00:00-03:00`,
          }),
          entry({
            journeyId: 'con',
            plate: 'EN_EXCEL',
            normalizedPlate: 'EN_EXCEL',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>EGRESO',
            firstEventAt: `${day}T10:00:00-03:00`,
            lastEventAt: `${day}T12:00:00-03:00`,
          }),
          entry({
            journeyId: 'solo_ing',
            plate: 'YY2',
            normalizedPlate: 'YY2',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>PREINGRESO',
            firstEventAt: `${day}T10:00:00-03:00`,
          }),
        ],
        ctx
      )
      expect(stamped.find((e) => e.journeyId === 'sin')?.anomalyKindReason).toBe('SIN_MOVIMIENTO_EXCEL')
      expect(stamped.find((e) => e.journeyId === 'con')?.anomalyKind).toBe('NONE')
      expect(stamped.find((e) => e.journeyId === 'solo_ing')?.anomalyKind).toBe('NONE')
      const summary = buildAnomalyReviewSummary(stamped, ctx)
      expect(summary.listedAnomalyCount).toBe(1)
    })

    it('collectExcelPlateDaysFromCsv arma PLATE|día', () => {
      const csv =
        'plate_normalized,source_date\n' +
        'ABC123,2026-07-10\n' +
        'DEF456,2026-07-11\n'
      const set = collectExcelPlateDaysFromCsv(csv)
      expect(set.has(excelPlateDayKey('ABC123', '2026-07-10'))).toBe(true)
      expect(set.has(excelPlateDayKey('DEF456', '2026-07-11'))).toBe(true)
    })

    it('collectExcelPlateDaysFromCsv prioriza día de salida sobre ingreso (overnight)', () => {
      const csv =
        'plate_normalized,external_ingreso_at,external_salida_at,source_date\n' +
        'R7SOJA,2026-07-18T22:10:00-03:00,2026-07-19T01:40:00-03:00,2026-07-19\n'
      const set = collectExcelPlateDaysFromCsv(csv)
      expect(set.has(excelPlateDayKey('R7SOJA', '2026-07-19'))).toBe(true)
      expect(set.has(excelPlateDayKey('R7SOJA', '2026-07-18'))).toBe(false)
    })

    it('G5 overnight R7: no marca si Excel es del día de salida (D+1)', () => {
      const stamped = stampMissingExcelAnomalies(
        [
          entry({
            journeyId: 'r7-overnight',
            plate: 'R7SOJA',
            normalizedPlate: 'R7SOJA',
            anomalyKind: 'NONE',
            executiveCircuitCode: 'R7',
            detectedSequence: 'INGRESO>PREINGRESO>EGRESO>SL_INGRESO>SL_EGRESO',
            firstEventAt: '2026-07-18T22:00:00-03:00',
            lastEventAt: '2026-07-19T01:30:00-03:00',
          }),
        ],
        {
          excelPlateDays: new Set([excelPlateDayKey('R7SOJA', '2026-07-19')]),
        }
      )
      expect(stamped[0]?.anomalyKind).toBe('NONE')
      expect(stamped[0]?.anomalyKindReason).toBeFalsy()
    })

    it('G5 no marca si ya hay match Excel en committee_reason (aunque el día no cruce)', () => {
      const stamped = stampMissingExcelAnomalies(
        [
          entry({
            journeyId: 'matched',
            plate: 'AB123CD',
            normalizedPlate: 'AB123CD',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>PREINGRESO>CALADA>EGRESO',
            committeeReason: 'EXCEL_PLATAFORMA:SOJA@VOLCABLE_PTO_2:EXTERNAL_MATCH_PROBABLE',
            firstEventAt: '2026-07-18T22:00:00-03:00',
            lastEventAt: '2026-07-18T23:50:00-03:00',
          }),
        ],
        {
          excelPlateDays: new Set([excelPlateDayKey('AB123CD', '2026-07-19')]),
        }
      )
      expect(stamped[0]?.anomalyKind).toBe('NONE')
    })

    it('G5 no marca si faltan first/last_event_at (no afirmar ausencia)', () => {
      const stamped = stampMissingExcelAnomalies(
        [
          entry({
            journeyId: 'sin-fechas',
            plate: 'ZZ9',
            normalizedPlate: 'ZZ9',
            anomalyKind: 'NONE',
            detectedSequence: 'INGRESO>EGRESO',
            firstEventAt: '',
            lastEventAt: '',
          }),
        ],
        { excelPlateDays: new Set([excelPlateDayKey('OTRA', '2026-07-19')]) }
      )
      expect(stamped[0]?.anomalyKind).toBe('NONE')
    })
  })

  it('collectTransileInternoExcludedPlates toma solo sesiones inferred=true', () => {
    const set = collectTransileInternoExcludedPlates([
      { patente: 'AA1', inferred_transile_interno: 'true' },
      { patente: 'BB2', inferred_transile_interno: 'false' },
      { patente: 'CC3', inferred_transile_interno: 'true' },
    ])
    expect(set.has('AA1')).toBe(true)
    expect(set.has('CC3')).toBe(true)
    expect(set.has('BB2')).toBe(false)
  })

  it('arma contexto desde CSV de transform', () => {
    const ctx = buildAnomalyListContextFromTransformCsv({
      external_movimientos_contrato_normalized: 'plate_normalized\nABC123\nDEF456\n',
      plate_registry_excluded: 'plate\nSRV001\n',
    })
    expect(ctx.excelPlates?.has('ABC123')).toBe(true)
    expect(ctx.excelPlates?.has('DEF456')).toBe(true)
    expect(ctx.excludedRegistryPlates?.has('SRV001')).toBe(true)
    expect(collectNormalizedPlatesFromCsv('plate_normalized\nAA11BB\n').has('AA11BB')).toBe(true)
  })

  it('agrupa anomalías por secuencia detectada', () => {
    const rows = buildAnomalySequenceBreakdown(
      [
        entry({ journeyId: 'a', plate: 'A1', normalizedPlate: 'A1', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
        entry({ journeyId: 'b', plate: 'A2', normalizedPlate: 'A2', detectedSequence: 'INGRESO>PREINGRESO>CALADA' }),
        entry({ journeyId: 'c', plate: 'B1', normalizedPlate: 'B1', detectedSequence: 'INGRESO>EGRESO' }),
      ],
      undefined,
      excelLoadedEmpty
    )
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
      entry({ journeyId: 'an1', usefulEventsCount: 1, detectedSequence: 'INGRESO' }),
      entry({
        journeyId: 'an2',
        usefulEventsCount: 4,
        detectedSequence: 'INGRESO>PREINGRESO>CALADA>SL_INGRESO',
        executiveCircuitCode: 'R7',
      }),
    ]
    const crossTab = buildCommitteeCircuitCrossTab(entries)
    const anomalyReview = buildAnomalyReviewSummary(entries, excelLoadedEmpty)
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

    const anomalyReview = buildAnomalyReviewSummary(promoted, {
      excelPlates: new Set(['ABC123']),
    })
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
    const row = index.entries.find((e) => e.journeyId === 'excel:op1')!
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
    const wait = index.entries.find((e) => e.journeyId === 'excel:op1')!
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
    const recovered = index.entries.find((e) => e.journeyId === 'excel:op1')!
    expect(recovered.committeeGroup).toBe('COMPLETOS')
    expect(recovered.executiveCircuitCode).toBe('R7')
    const moved = index.entries.find((e) => e.journeyId === 'excel:op2')!
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
    const row = index.entries.find((e) => e.journeyId === 'excel:op1')!
    expect(row.executiveCircuitCode).toBe('R7')
    expect(buildCommitteeCircuitCrossTab(index.entries).find((r) => r.code === 'RS_REC')).toBeUndefined()
  })

  it('gráficos ejecutivos: una entrada por operación Excel con evidencia', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-a,AAA111,terminal_embarque,ANOMALIAS,ANOMALÍAS,RS_REC,Recepción,INGRESO>CALADA,4,ANOMALO,ANOMALO,SIN_PUNTO,,,,INCOMPLETO,2026-06-28T08:00:00.000Z,2026-06-28T09:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,resolved_executive_circuit_code,match_quality,route_quality,evidence_count',
      'CTG_A,j-a,AAA111,TERMINAL_EMBARQUE,INGRESO,2026-06-28,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE_PTO_3,VOLCABLE PTO 3,R7,SAN_LORENZO_VOLCABLE,R7,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
      'CTG_B,j-a,AAA111,TERMINAL_EMBARQUE,INGRESO,2026-06-28,SOJA,SOJA,VOLCABLE_PTO_3,VOLCABLE_PTO_3,VOLCABLE PTO 3,R7,SAN_LORENZO_VOLCABLE,R7,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    expect(index.entries.filter((e) => e.journeyId.startsWith('excel:'))).toHaveLength(2)
    expect(index.entries.find((e) => e.journeyId === 'j-a')).toBeUndefined()
    expect(index.excelFirstReconciledCount).toBe(2)
    expect(buildCommitteeCircuitCrossTab(index.entries).find((r) => r.code === 'R7')?.total).toBe(2)
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
    const row = index.entries.find((e) => e.journeyId === 'excel:op1')!
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
    const row = index.entries.find((e) => e.journeyId === 'excel:op1')!
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
    const inExcel = index.entries.find((e) => e.journeyId === 'excel:op1')!
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
    const row = index.entries.find((e) => e.journeyId === 'excel:op-aceite')!
    expect(row.executiveCircuitCode).toBe('SL1')
    expect(row.executiveCircuitCode).not.toBe('R7')
  })

  it('suprime R7 Ric→SL huérfano INGRESO>EGRESO si Excel aceite en la misma patente', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-r7-simple,GFL685,ricardone,COMPLETOS,COMPLETOS,R7,Ric→SL,INGRESO>PREINGRESO>EGRESO,3,COMPLETO,VALIDO,RUTA_RIC_SAN_LORENZO_DEDUCIDA,,RUTA_RIC_SAN_LORENZO_DEDUCIDA,,COMPLETO,COMPLETO,2026-06-28T08:00:00.000Z,2026-06-28T09:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,resolved_executive_circuit_code,match_quality,route_quality,evidence_count',
      'CTG_GFL,j-other,GFL685,TERMINAL_EMBARQUE,INGRESO,2026-06-28,ACEITE GIRASOL,ACEITE GIRASOL,ACEITE_PTO,ACEITE_PTO,ACEITE PTO,SL2,LIQUIDO,SL2,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    expect(index.entries.some((e) => e.journeyId === 'j-r7-simple')).toBe(false)
    expect(index.entries.some((e) => e.executiveCircuitCode === 'R7')).toBe(false)
  })

  it('suprime R7 Ric→SL huérfano si Excel aceite en la misma patente y día', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-r7-orphan,GFL685,ricardone,COMPLETOS,COMPLETOS,R7,Ric→SL,INGRESO>PREINGRESO>EGRESO>SL_INGRESO>SL_BALANZA_INGRESO,5,COMPLETO,VALIDO,RUTA_RIC_SAN_LORENZO_COMPLETA,,RUTA_RIC_SAN_LORENZO_COMPLETA,,COMPLETO,COMPLETO,2026-06-28T08:00:00.000Z,2026-06-28T12:00:00.000Z,',
      'j-other,GFL685,terminal_embarque,COMPLETOS,COMPLETOS,SL2,SL2,SL_INGRESO>SL_EGRESO,4,COMPLETO,VALIDO,EXCEL_PLATAFORMA,,EXCEL_PLATAFORMA_RECONCILED,,COMPLETO,COMPLETO,2026-06-28T08:00:00.000Z,2026-06-28T12:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count,truckflow_observed_sequence_combined',
      'CTG_GFL,j-other,GFL685,TERMINAL_EMBARQUE,INGRESO,2026-06-28,ACEITE GIRASOL,ACEITE GIRASOL,ACEITE_PTO,ACEITE_PTO,ACEITE PTO,SL2,LIQUIDO,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1,SL_INGRESO>SL_EGRESO',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    expect(index.entries.some((e) => e.journeyId === 'j-r7-orphan')).toBe(false)
    expect(index.entries.find((e) => e.journeyId === 'excel:CTG_GFL')?.executiveCircuitCode).toBe('SL2')
  })

  it('matriz Ric líquida conserva R8 aunque Excel SL empareje por patente', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-ric-r8,CDN829,ricardone,COMPLETOS,COMPLETOS,R8,Recepción líquida,INGRESO>PREINGRESO>LIQUIDO>BALANZA_INGRESO>BALANZA_EGRESO>EGRESO,6,COMPLETO,VALIDO,CIRCUITO_COMPLETO,,CIRCUITO_COMPLETO,,COMPLETO,COMPLETO,2026-06-28T08:00:00-03:00,2026-06-28T10:00:00-03:00,RicB1Ingreso>RicB2Egreso',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,match_quality,route_quality,evidence_count,truckflow_observed_sequence_combined',
      'CTG_SL,j-other,CDN829,TERMINAL_EMBARQUE,INGRESO,2026-06-28,ACEITE GIRASOL,ACEITE GIRASOL,ACEITE_PTO,ACEITE_PTO,ACEITE PTO,SL2,LIQUIDO,EXTERNAL_MATCH_EXACT,ROUTE_COMPLETE,1,SL_INGRESO>SL_EGRESO',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const ric = index.entries.find((e) => e.journeyId === 'j-ric-r8')
    expect(ric?.executiveCircuitCode).toBe('R8')
  })

  it('huérfanas ACEITE_OSL con CTG=0 generan dos filas SL1 distintas', () => {
    const debugCsv = [
      'journey_id,plate,site,committee_group,pie_slice_label,executive_circuit_code,executive_circuit_label,detected_sequence,useful_events_count,matrix_final_status,executive_status,committee_reason,operational_variation_type,executive_reason,matrix_reason,valid_detail,executive_bucket,first_event_at,last_event_at,device_sequence',
      'j-dummy,ZZZ999,ricardone,ANOMALIAS,ANOMALIAS,,,,0,INCOMPLETO,NO_EVALUABLE,,,,,,,2026-06-01T08:00:00.000Z,2026-06-01T09:00:00.000Z,',
    ].join('\n')
    const excelCsv = [
      'external_operation_id,matched_journey_uids,plate_normalized,planta_normalized,movement_type,source_date,resolved_product,product_normalized,resolved_platform,platform_normalized,plataforma_original,truckflow_circuit_codes,resolved_circuit_family,resolved_executive_circuit_code,match_quality,route_quality,evidence_count,ctg,comprob,ingreso_id',
      'CTG_0,,AAA111,TERMINAL_EMBARQUE,INGRESO,2026-06-01,ACEITE GIRASOL,ACEITE GIRASOL,ACEITE_OSL,ACEITE_OSL,ACEITE OSL,,LIQUIDO,SL1,NO_TRUCKFLOW_EVIDENCE,ROUTE_NO_EVALUABLE,0,0,10,1001',
      'CTG_0,,BBB222,TERMINAL_EMBARQUE,INGRESO,2026-06-01,ACEITE GIRASOL,ACEITE GIRASOL,ACEITE_OSL,ACEITE_OSL,ACEITE OSL,,LIQUIDO,SL1,NO_TRUCKFLOW_EVIDENCE,ROUTE_NO_EVALUABLE,0,0,11,1002',
    ].join('\n')
    const index = buildCircuitClassificationIndex(debugCsv, undefined, excelCsv)
    const sl1 = index.entries.filter((e) => e.executiveCircuitCode === 'SL1' && e.journeyId.startsWith('excel:'))
    expect(sl1).toHaveLength(2)
    expect(new Set(sl1.map((e) => e.journeyId)).size).toBe(2)
  })
})
