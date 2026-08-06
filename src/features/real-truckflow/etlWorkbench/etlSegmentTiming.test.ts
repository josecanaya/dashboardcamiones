import { describe, expect, it } from 'vitest'
import { parseTimestampMs } from './etlTimestampNormalize'
import { buildExcelScatterByDaySources } from './etlSegmentScatterByDay'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import {
  buildSegmentTimingIndex,
  buildSegmentTimingIndexFromExcelFirstSegments,
  extractSegmentLegs,
  extractSlBalancaRollupLeg,
  extractSlSalidaEgresoRollupLeg,
  extractSegmentLegsWithTimes,
  extractAllSegmentLegsForCircuit,
  extractDischargeRollupFromTimeline,
  getCircuitSegmentTemplate,
  getDischargeKpiRollupRules,
  buildTimedLogicalTimelineFromSegments,
  histogramBinMinutesForTransition,
  listCircuitSegmentAggregates,
  enrichSlTimelineWithExcelSalida,
  synthesizeSlRollupLegsFromTimedSegments,
  synthesizeDischargeRollupLegsFromTimedSegments,
  synthesizeInferredRollupLegsFromTimedSegments,
  synthesizeTemplateChainLegsFromTimedSegments,
  synthesizeVolcableReceiptKpiLegsForOperation,
  diagnoseBalanzaStayFromTimedSegments,
  diagnoseR7SlBalanzaIngresoSalida,
  mergeVolcableReceiptSegmentTiming,
  mergeSegmentTimingIndexes,
  VOLCABLE_RECEIPT_KPI_UNION_CODE,
  selectCoherentSegmentGroup,
  isValidSegmentDuration,
  resolveSlBalanzaRollupEndpointsForKpi,
  resolveSlBalanzaEgresoHorarioForKpi,
  repairSlBalanzaScatterSegment,
  shouldRejectSlBalanzaScatterForExcelIngreso,
  isSlBalanzaIngresoAnchoredOnExcelIngreso,
  SL_BALANZA_STAY_MAX_MINUTES,
  evaluateSlBalanzaComitePayload,
  SL_BALANZA_COMITE_PRODUCT_OPTIONS,
  buildSlComiteTruckflowContext,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  SL_KPI_SEGMENT_MAX_MINUTES,
  SL_INGRESO_TO_BALANZA_MAX_MINUTES,
  type ClassifiedJourneyForTiming,
} from './etlSegmentTiming'

function journey(
  partial: Partial<ReconstructedRealJourney> & Pick<ReconstructedRealJourney, 'journeyUid'>
): ReconstructedRealJourney {
  return {
    journeyUid: partial.journeyUid,
    plate: 'ABC123',
    normalizedPlate: 'ABC123',
    isValidPlate: true,
    startedAt: '2026-05-12T08:00:00',
    endedAt: '2026-05-12T10:00:00',
    durationMinutes: 120,
    eventCount: 4,
    events: [],
    logicalCodeSequence: [],
    preliminaryCircuitCode: 'CIRCUITO_VOLCABLE_1_2',
    preliminaryCircuitName: 'Volcable',
    preliminaryCircuitConfidence: 'media',
    isDiscardedOperational: false,
    siteId: 'ricardone',
    ...partial,
  }
}

function ev(deviceCode: string, sectorCode: string, occurredAt: string) {
  return {
    deviceCode,
    sectorCode,
    occurredAt,
    sequenceNumber: 1,
  } as never
}

describe('etlSegmentTiming', () => {
  it('extrae tramos lógicos con timestamps frontales', () => {
    const j = journey({
      journeyUid: 'j1',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:05:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T08:20:00'),
        ev('RicCal01', 'RICARDONE_CALADA', '2026-05-12T09:00:00'),
        ev('RicB1Ingreso', 'RICARDONE_BALANZA_1', '2026-05-12T09:30:00'),
      ],
      eventCount: 5,
    })

    const legs = extractSegmentLegs(j, 'R5')
    expect(legs).toHaveLength(3)
    expect(legs[0]).toMatchObject({
      fromCode: 'INGRESO',
      toCode: 'PREINGRESO',
      durationMinutes: 20,
    })
    expect(legs[1]).toMatchObject({
      fromCode: 'PREINGRESO',
      toCode: 'CALADA',
      durationMinutes: 40,
    })
    expect(legs[2]).toMatchObject({
      fromCode: 'CALADA',
      toCode: 'BALANZA_INGRESO',
      durationMinutes: 30,
    })
  })

  it('agrega mean/min/max/std coherentes con computeStayTimeStats', () => {
    const mk = (uid: string, preMin: number): ClassifiedJourneyForTiming => ({
      journey: journey({
        journeyUid: uid,
        events: [
          ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
          ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', `2026-05-12T08:${String(preMin).padStart(2, '0')}:00`),
        ],
        eventCount: 2,
      }),
      executiveCircuitCode: 'R1',
      committeeGroup: 'COMPLETOS',
    })

    const index = buildSegmentTimingIndex([mk('j1', 10), mk('j2', 20), mk('j3', 30)], {
      committeeGroups: ['COMPLETOS'],
    })
    const agg = index.aggregates.find((a) => a.fromCode === 'INGRESO' && a.toCode === 'PREINGRESO')
    expect(agg).toBeDefined()
    const expected = computeStayTimeStats([10, 20, 30])
    expect(agg!.stats.mean).toBeCloseTo(expected.mean, 5)
    expect(agg!.stats.min).toBeCloseTo(expected.min, 5)
    expect(agg!.stats.max).toBeCloseTo(expected.max, 5)
    expect(agg!.stats.std).toBeCloseTo(expected.std, 5)
    expect(agg!.stats.count).toBe(3)
  })

  it('excluye del KPI camiones sin ingreso ni preingreso (circuito Ricardone)', () => {
    // Con ingreso+preingreso+calada: se cuenta.
    const conEntrada: ClassifiedJourneyForTiming = {
      journey: journey({
        journeyUid: 'j-ok',
        events: [
          ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
          ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T08:15:00'),
          ev('RicCal01', 'RICARDONE_CALADA', '2026-05-12T09:00:00'),
        ],
        eventCount: 3,
      }),
      executiveCircuitCode: 'R1',
      committeeGroup: 'COMPLETOS',
    }
    // Sin ingreso ni preingreso (arranca en calada): dato falso → se excluye.
    const sinEntrada: ClassifiedJourneyForTiming = {
      journey: journey({
        journeyUid: 'j-fake',
        events: [
          ev('RicCal01', 'RICARDONE_CALADA', '2026-05-12T09:00:00'),
          ev('RicB1Ingreso', 'RICARDONE_BALANZA_1', '2026-05-12T09:30:00'),
        ],
        eventCount: 2,
      }),
      executiveCircuitCode: 'R1',
      committeeGroup: 'COMPLETOS',
    }
    const index = buildSegmentTimingIndex([conEntrada, sinEntrada], {
      committeeGroups: ['COMPLETOS'],
    })
    expect(index.excludedNoEntryAnchor).toBe(1)
    // Ningún leg debe pertenecer al journey sin entrada.
    expect(index.legs.some((l) => l.journeyId === 'j-fake')).toBe(false)
    expect(index.legs.some((l) => l.journeyId === 'j-ok')).toBe(true)
  })

  it('solo agrega tramos del template del circuito (sin ingreso→egreso)', () => {
    const j = journey({
      journeyUid: 'j-spurious',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T09:00:00'),
      ],
      eventCount: 2,
    })
    const index = buildSegmentTimingIndex(
      [{ journey: j, executiveCircuitCode: 'R1', committeeGroup: 'COMPLETOS' }],
      { committeeGroups: ['COMPLETOS'] }
    )
    expect(index.legs).toHaveLength(0)
    const r1Rows = listCircuitSegmentAggregates(index, 'R1')
    expect(r1Rows.map((r) => r.transitionKey)).toEqual([
      'INGRESO→PREINGRESO',
      'PREINGRESO→CALADA',
      'CALADA→BALANZA_INGRESO',
      // R1 mide la descarga real (celda 16) + playa 3, no el rollup balanza→balanza.
      'BALANZA_INGRESO→CELDA16_DESCARGA',
      'CELDA16_DESCARGA→PLAYA',
      'PLAYA→BALANZA_EGRESO',
    ])
  })

  it('R7 incluye cadena operativa SL unificada (ingreso → balanza entrada → egreso)', () => {
    const rows = listCircuitSegmentAggregates(
      buildSegmentTimingIndex([], { committeeGroups: ['COMPLETOS'] }),
      'R7'
    )
    expect(rows.map((r) => r.transitionKey)).toEqual([
      'INGRESO→PREINGRESO',
      'PREINGRESO→CALADA',
      'CALADA→EGRESO',
      'EGRESO→SL_INGRESO',
      'SL_INGRESO→SL_BALANZA_INGRESO',
      'SL_BALANZA_INGRESO→SL_EGRESO',
    ])
    expect(rows.at(-1)?.label).toBe('balanza de entrada → egreso')
  })

  it('rollup balanza SL mide S1→S7 con egreso real', () => {
    const j = journey({
      journeyUid: 'j-sl-rollup',
      events: [
        ev('SLZBalIngFte', 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', '2026-05-12T09:00:00'),
        ev('SLZIngCamFrente', 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', '2026-05-12T09:30:00'),
        ev('SLZBalSC1Fte', 'PUERTO_SAN_LORENZO_BALANZA_SALIDA', '2026-05-12T11:00:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T11:30:00'),
      ],
    })
    const rollup = extractSlBalancaRollupLeg(j, 'R7')
    expect(rollup).not.toBeNull()
    expect(rollup!.durationMinutes).toBe(150)
    expect(rollup!.fromCode).toBe('SL_BALANZA_INGRESO')
    expect(rollup!.toCode).toBe('SL_EGRESO')
  })

  it('rollup balanza SL unifica S1→S7 cuando falta cámara S5', () => {
    const j = journey({
      journeyUid: 'j-sl-fallback',
      events: [
        ev('SLZIngCamFrente', 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('SLZBalIngFte', 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', '2026-05-12T08:30:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T10:00:00'),
      ],
    })
    const rollup = extractSlBalancaRollupLeg(j, 'R7')
    expect(rollup).not.toBeNull()
    expect(rollup!.durationMinutes).toBe(90)
    expect(rollup!.toCode).toBe('SL_EGRESO')
  })

  it('extractSegmentLegsWithTimes arma rollup S1→S7 con solo balanza ingreso y egreso', () => {
    const j = journey({
      journeyUid: 'j-sl-export',
      events: [
        ev('SLZBalIngFte', 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', '2026-05-12T09:00:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T10:30:00'),
      ],
    })
    const legs = extractSegmentLegsWithTimes(j, 'SL1')
    const rollup = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(rollup).toBeDefined()
    expect(rollup!.durationMinutes).toBe(90)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments deduce cadena SL con salida Excel', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'SL_INGRESO',
        segment_to: 'SL_BALANZA_INGRESO',
        segment_start_time: '2026-05-12T08:00:00',
        segment_end_time: '2026-05-12T08:15:00',
        segment_duration_min: 15,
        truckflow_circuit_code: 'SL1',
        resolved_executive_circuit_code: 'SL1',
        external_salida_at: '2026-05-12T10:00:00',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-05-12T08:15:00',
        segment_end_time: '2026-05-12T08:45:00',
        segment_duration_min: 30,
        truckflow_circuit_code: 'SL1',
        resolved_executive_circuit_code: 'SL1',
        external_salida_at: '2026-05-12T10:00:00',
      },
    ])
    const ingresoBalanza = index.legs.find(
      (l) => l.fromCode === 'SL_INGRESO' && l.toCode === 'SL_BALANZA_INGRESO'
    )
    const balanzaEgreso = index.legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(ingresoBalanza).toBeDefined()
    expect(ingresoBalanza!.durationMinutes).toBe(15)
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBe(105)
  })

  it('rechaza balanza ingreso→egreso < 10 min (error cámara B1/B2)', () => {
    expect(isValidSegmentDuration(3, 'BALANZA_INGRESO', 'BALANZA_EGRESO')).toBe(false)
    expect(isValidSegmentDuration(9.9, 'BALANZA_INGRESO', 'BALANZA_EGRESO')).toBe(false)
    expect(isValidSegmentDuration(10, 'BALANZA_INGRESO', 'BALANZA_EGRESO')).toBe(true)
    expect(isValidSegmentDuration(30, 'BALANZA_INGRESO', 'BALANZA_EGRESO')).toBe(true)
    expect(isValidSegmentDuration(480, 'SL_INGRESO', 'SL_BALANZA_INGRESO')).toBe(true)
    expect(isValidSegmentDuration(361, 'INGRESO', 'PREINGRESO')).toBe(false)
  })

  it('descarta tramos SL unificados de 3 minutos o menos', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-short',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-05-12T10:00:00',
        segment_end_time: '2026-05-12T10:02:00',
        segment_duration_min: 2,
        truckflow_circuit_code: 'SL1',
        resolved_executive_circuit_code: 'SL1',
      },
    ])
    expect(
      index.legs.find((l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO')
    ).toBeUndefined()
  })

  it('enrichSlTimelineWithExcelSalida inyecta egreso SL tras balanza salida', () => {
    const enriched = enrichSlTimelineWithExcelSalida(
      [
        { code: 'SL_BALANZA_INGRESO', occurredAt: '2026-05-12T08:00:00' },
        { code: 'SL_BALANZA_SALIDA', occurredAt: '2026-05-12T09:00:00' },
      ],
      '2026-05-12T10:30:00'
    )
    expect(enriched.some((p) => p.code === 'SL_EGRESO')).toBe(true)
  })

  it('rollup balanza entrada→egreso con fin en salida Excel si no hay S7', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      // Entrada por puerta Ricardone: requerida para que el KPI cuente al camión.
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl-s5',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_start_time: '2026-05-12T06:00:00',
        segment_end_time: '2026-05-12T06:10:00',
        segment_duration_min: 10,
        truckflow_circuit_code: 'R7',
        resolved_executive_circuit_code: 'R7',
        external_salida_at: '2026-05-12T09:05:00',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl-s5',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-05-12T08:00:00',
        segment_end_time: '2026-05-12T09:00:00',
        segment_duration_min: 60,
        truckflow_circuit_code: 'R7',
        resolved_executive_circuit_code: 'R7',
        external_salida_at: '2026-05-12T09:05:00',
      },
    ])
    const balanzaEgreso = index.legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBe(65)
  })

  it('rollup balanza→egreso usa salida Excel aunque haya egreso fragmentado anterior', () => {
    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-sl-frag',
      plate: 'AA111',
      executiveCircuitCode: 'R7',
      segments: [
        {
          segment_from: 'SL_EGRESO',
          segment_to: 'SL_INGRESO',
          segment_start_time: '2026-05-12T07:00:00',
          segment_end_time: '2026-05-12T08:00:00',
        },
        {
          segment_from: 'SL_BALANZA_INGRESO',
          segment_to: 'SL_BALANZA_SALIDA',
          segment_start_time: '2026-05-12T09:00:00',
          segment_end_time: '2026-05-12T10:00:00',
        },
      ],
      externalSalidaAt: '2026-05-12T10:05:00',
    })
    const balanzaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBe(65)
  })

  it('rollup balanza→egreso con solo S1 y salida Excel (sin cámara egreso)', () => {
    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-no-calado-exit',
      plate: 'AA111',
      executiveCircuitCode: 'R7',
      segments: [
        {
          segment_from: 'SL_BALANZA_INGRESO',
          segment_to: 'SL_BALANZA_SALIDA',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
      ],
      externalCaladoAt: '2026-05-12T06:00:00',
      externalSalidaAt: '2026-05-12T10:30:00',
    })
    const balanzaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBeLessThanOrEqual(SL_BALANZA_STAY_MAX_MINUTES)
    expect(balanzaEgreso!.segment_end_time).toContain('10:30')
  })

  it('evaluateSlBalanzaComitePayload clasifica duración > 180 min', () => {
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-05-12T08:00:00',
        segment_end_time: '2026-05-12T09:00:00',
      },
    ]
    const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments,
      externalSalidaAt: '2026-05-12T14:00:00',
      executiveCircuitCode: 'R7',
    })
    const ev = evaluateSlBalanzaComitePayload(
      opSegments,
      truckflowPoints,
      '2026-05-12T14:00:00',
      undefined,
      enrichedPoints
    )
    expect(ev.reason).toBe('duracion_excede_180')
    expect(ev.payload).toBeNull()
    expect(ev.durationMin).toBeGreaterThan(SL_BALANZA_STAY_MAX_MINUTES)
  })

  it('TiemposEntrePasos override: usa balanza entrada/salida planilla aunque haya cámara S1', () => {
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-18T20:00:00',
        segment_end_time: '2026-06-18T20:30:00',
      },
    ]
    const ev = evaluateSlBalanzaComitePayload(
      segments,
      buildTimedLogicalTimelineFromSegments(segments),
      '2026-06-19T00:01:00',
      '2026-06-18T22:13:00',
      undefined,
      {
        ...SL_BALANZA_COMITE_PRODUCT_OPTIONS,
        useTiemposEntrePasosBalanza: true,
        tiemposEntrePasosEntradaAt: '2026-06-18T23:23:00',
        tiemposEntrePasosSalidaAt: '2026-06-19T00:05:00',
      }
    )
    expect(ev.reason).toBe('ok')
    expect(ev.payload?.segment_start_time).toContain('23:23')
    expect(ev.payload?.segment_end_time).toContain('00:05')
    expect(ev.payload?.horario_fuente).toBe('tiempos_entre_pasos')
  })

  it('comité SL: rollup unificado balanza→egreso con cámara S1/S7 (LHT051, Excel salida temprana)', () => {
    // Caso real: sin cámara S5 (balanza salida); S1→S5 y S5→S7 como segmentos cámara.
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-04T02:33:32',
        segment_end_time: '2026-06-04T03:00:00',
      },
      {
        segment_from: 'SL_BALANZA_SALIDA',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-04T03:00:00',
        segment_end_time: '2026-06-04T03:16:18',
      },
    ]
    const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments,
      externalSalidaAt: '2026-06-04T02:40:00',
      executiveCircuitCode: 'R7',
    })
    const ev = evaluateSlBalanzaComitePayload(
      opSegments,
      truckflowPoints,
      '2026-06-04T02:40:00',
      undefined,
      enrichedPoints,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    expect(ev.reason).toBe('ok')
    expect(ev.payload).not.toBeNull()
    expect(ev.payload!.segment_duration_min).toBeGreaterThan(40)
    expect(ev.payload!.segment_duration_min).toBeLessThan(45)
    expect(ev.payload!.horario_fuente_inicio).toBe('truckflow')
    expect(ev.payload!.horario_fuente_fin).toBe('truckflow')
    expect(ev.payload!.segment_start_time).toContain('02:33:32')
    expect(ev.payload!.segment_end_time).toContain('03:16:18')
  })

  it('comité SL: estadía larga conserva inicio cámara S1 (sin recalcular desde Excel salida)', () => {
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-10T20:55:00',
        segment_end_time: '2026-06-10T21:00:00',
      },
    ]
    const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments,
      externalSalidaAt: '2026-06-11T00:30:00',
      executiveCircuitCode: 'R7',
    })
    const ev = evaluateSlBalanzaComitePayload(
      opSegments,
      truckflowPoints,
      '2026-06-11T00:30:00',
      undefined,
      enrichedPoints,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    expect(ev.reason).toBe('ok')
    expect(ev.payload!.segment_start_time).toContain('20:55:00')
    expect(ev.payload!.segment_duration_min).toBeGreaterThan(200)
  })

  it('comité SL: rollup unificado NO confía inicio anclado al ingreso Excel Ricardone', () => {
    const excelIng = '2026-06-04T02:33:32'
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: excelIng,
        segment_end_time: '2026-06-04T03:16:18',
      },
      {
        segment_from: 'SL_BALANZA_SALIDA',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-04T03:00:00',
        segment_end_time: '2026-06-04T03:16:18',
      },
    ]
    const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments,
      externalIngresoAt: excelIng,
      externalSalidaAt: '2026-06-04T03:16:18',
      executiveCircuitCode: 'R7',
    })
    const ev = evaluateSlBalanzaComitePayload(
      opSegments,
      truckflowPoints,
      '2026-06-04T03:16:18',
      excelIng,
      enrichedPoints,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    expect(ev.payload).toBeNull()
    expect(ev.reason).toBe('inicio_anchored_excel_ric')
  })

  it('comité SL balanza→egreso: fin Excel y duración ≤ 180 min con cámara S1', () => {
    const sources = buildExcelScatterByDaySources([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl-priority',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        product_normalized: 'SOJA',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-05-12T10:00:00',
        segment_end_time: '2026-05-12T10:08:00',
        segment_duration_min: 8,
        truckflow_circuit_code: 'R7',
        resolved_executive_circuit_code: 'R7',
        external_salida_at: '2026-05-12T11:30:00',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl-priority',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        product_normalized: 'SOJA',
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-05-12T10:00:00',
        segment_end_time: '2026-05-12T10:08:00',
        segment_duration_min: 8,
        truckflow_circuit_code: 'R7',
        resolved_executive_circuit_code: 'R7',
        external_salida_at: '2026-05-12T11:30:00',
      },
    ] as never)
    const sl = sources.find(
      (s) => s.segment_from === 'SL_BALANZA_INGRESO' && s.segment_to === 'SL_EGRESO'
    )
    expect(sl).toBeDefined()
    expect(sl!.duracion_minutos).toBeLessThanOrEqual(SL_BALANZA_STAY_MAX_MINUTES)
    expect(sl!.horario_fuente_inicio).toBe('truckflow')
  })

  it('selectCoherentSegmentGroup separa dos recorridos del mismo camión (>6 h)', () => {
    const trip1 = [
      {
        segment_from: 'SL_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-01T01:32:47',
        segment_end_time: '2026-06-01T05:13:26',
      },
    ]
    const trip2 = [
      {
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_start_time: '2026-06-01T08:28:03',
        segment_end_time: '2026-06-01T08:29:23',
      },
      {
        segment_from: 'PREINGRESO',
        segment_to: 'CALADA',
        segment_start_time: '2026-06-01T08:29:23',
        segment_end_time: '2026-06-01T10:00:55',
      },
      {
        segment_from: 'CALADA',
        segment_to: 'EGRESO',
        segment_start_time: '2026-06-01T10:00:55',
        segment_end_time: '2026-06-01T10:07:53',
      },
      {
        segment_from: 'EGRESO',
        segment_to: 'SL_INGRESO',
        segment_start_time: '2026-06-01T10:07:53',
        segment_end_time: '2026-06-01T10:17:01',
      },
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-01T13:04:11',
        segment_end_time: '2026-06-01T14:09:47',
      },
    ]
    const picked = selectCoherentSegmentGroup(
      [...trip1, ...trip2],
      '2026-06-01T08:28:03',
      '2026-06-01T14:09:47'
    )
    expect(picked.some((s) => s.segment_from === 'INGRESO')).toBe(true)
    expect(picked.some((s) => s.segment_from === 'SL_INGRESO' && s.segment_start_time.startsWith('2026-06-01T01'))).toBe(false)

    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-uzx533',
      plate: 'UZX533',
      executiveCircuitCode: 'R7',
      segments: [...trip1, ...trip2],
      externalIngresoAt: '2026-06-01T08:28:03',
      externalSalidaAt: '2026-06-01T14:09:47',
    })
    const ingresoSl = legs.find((l) => l.fromCode === 'SL_INGRESO' && l.toCode === 'SL_BALANZA_INGRESO')
    const balanzaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBeGreaterThan(15)
    expect(balanzaEgreso!.durationMinutes).toBeLessThanOrEqual(SL_BALANZA_STAY_MAX_MINUTES)
    if (ingresoSl) {
      expect(ingresoSl.durationMinutes).toBeLessThanOrEqual(SL_KPI_SEGMENT_MAX_MINUTES)
    }
  })

  it('deduce ingreso SL → balanza ingreso SL sin cámara S2', () => {
    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-sl-ing',
      plate: 'AA111',
      executiveCircuitCode: 'R7',
      segments: [
        {
          segment_from: 'EGRESO',
          segment_to: 'SL_INGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
        {
          segment_from: 'SL_BALANZA_INGRESO',
          segment_to: 'SL_BALANZA_SALIDA',
          segment_start_time: '2026-05-12T10:00:00',
          segment_end_time: '2026-05-12T11:00:00',
        },
      ],
      externalSalidaAt: '2026-05-12T12:00:00',
    })
    const ingresoBalIn = legs.find(
      (l) => l.fromCode === 'SL_INGRESO' && l.toCode === 'SL_BALANZA_INGRESO'
    )
    expect(ingresoBalIn).toBeDefined()
  })

  it('rollup balanza→egreso con ingreso SL + salida Excel: sin cámara S1 no hay tramo KPI', () => {
    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-sl-long-queue',
      plate: 'BB222',
      executiveCircuitCode: 'R26',
      segments: [
        {
          segment_from: 'BALANZA_EGRESO',
          segment_to: 'SL_INGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T10:00:00',
        },
      ],
      externalSalidaAt: '2026-05-12T14:00:00',
    })
    const balanzaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeUndefined()
  })

  it('no usa ingreso Excel Ricardone como inicio de balanza SL (solo cámara S1)', () => {
    const legs = synthesizeSlRollupLegsFromTimedSegments({
      operationId: 'op-ric-ingreso',
      plate: 'CC333',
      executiveCircuitCode: 'R26',
      segments: [
        {
          segment_from: 'BALANZA_EGRESO',
          segment_to: 'SL_INGRESO',
          segment_start_time: '2026-05-12T10:00:00',
          segment_end_time: '2026-05-12T10:30:00',
        },
        {
          segment_from: 'SL_BALANZA_INGRESO',
          segment_to: 'SL_BALANZA_SALIDA',
          segment_start_time: '2026-05-12T11:00:00',
          segment_end_time: '2026-05-12T11:30:00',
        },
      ],
      externalIngresoAt: '2026-05-12T06:00:00',
      externalSalidaAt: '2026-05-12T14:00:00',
    })
    const balanzaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(balanzaEgreso).toBeDefined()
    expect(balanzaEgreso!.durationMinutes).toBeLessThanOrEqual(SL_BALANZA_STAY_MAX_MINUTES)
    expect(balanzaEgreso!.segment_start_time).not.toBe('2026-05-12T06:00:00')
    expect(Date.parse(balanzaEgreso!.segment_start_time)).toBeGreaterThan(
      Date.parse('2026-05-12T10:00:00')
    )
  })

  it('resolveSlBalanzaEgresoHorarioForKpi: ignora SL_INGRESO→SL_EGRESO (Excel) y usa cámara S7', () => {
    const s1Ms = parseTimestampMs('2026-06-11T02:01:11.342-03:00')
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-11T02:01:11.342-03:00',
        segment_end_time: '2026-06-11T02:05:00-03:00',
      },
      {
        segment_from: 'SL_BALANZA_SALIDA',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-11T02:05:00-03:00',
        segment_end_time: '2026-06-11T02:45:30.123-03:00',
      },
      {
        segment_from: 'SL_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-11T01:00:00',
        segment_end_time: '2026-06-11T06:01:00',
      },
    ]
    const r = resolveSlBalanzaEgresoHorarioForKpi(segments, s1Ms, '2026-06-11T06:01:00')
    expect(r).not.toBeNull()
    expect(r!.fin_fuente).toBe('truckflow')
    expect(r!.endIso).toContain('02:45:30')
  })

  it('KPI balanza: inicio Truckflow 15:00 + salida Excel 17:00 = 2 h (sin desfase -3h)', () => {
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-10T15:00:00',
        segment_end_time: '2026-06-10T15:05:00',
      },
    ]
    const truckflowPoints = buildTimedLogicalTimelineFromSegments(segments)
    const kpi = resolveSlBalanzaRollupEndpointsForKpi(truckflowPoints, {
      externalSalidaAt: '2026-06-10T17:00:00',
      truckflowPoints,
      truckflowSegments: segments,
    })
    expect(kpi).not.toBeNull()
    expect(kpi!.inicio_fuente).toBe('truckflow')
    expect(kpi!.fin_fuente).toBe('excel_salida')
    expect(kpi!.from.occurredAt).toContain('15:00:00')
    expect(kpi!.to.occurredAt).toContain('17:00:00')
    const dur =
      (parseTimestampMs(kpi!.to.occurredAt) - parseTimestampMs(kpi!.from.occurredAt)) / 60000
    expect(dur).toBe(120)

    const repaired = repairSlBalanzaScatterSegment(
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-10T12:00:00',
        segment_end_time: '2026-06-10T17:00:00',
        segment_duration_min: 300,
      },
      { external_salida_at: '2026-06-10T17:00:00', operationSegments: segments }
    )
    expect(repaired).not.toBeNull()
    expect(repaired!.segment_duration_min).toBe(120)
    expect(repaired!.segment_start_time).toContain('15:00:00')
    expect(repaired!.horario_fuente_inicio).toBe('truckflow')
    expect(repaired!.horario_fuente_fin).toBe('excel_salida')
  })

  it('KPI balanza: fin por cámara de egreso (S7), no Excel; balanza salida S5 ignorada', () => {
    const segments = [
      {
        segment_from: 'SL_BALANZA_INGRESO',
        segment_to: 'SL_BALANZA_SALIDA',
        segment_start_time: '2026-06-10T10:00:00',
        segment_end_time: '2026-06-10T10:20:00',
      },
      {
        segment_from: 'SL_BALANZA_SALIDA',
        segment_to: 'SL_EGRESO',
        segment_start_time: '2026-06-10T10:20:00',
        segment_end_time: '2026-06-10T10:45:00',
      },
    ]
    const truckflowPoints = buildTimedLogicalTimelineFromSegments(segments)
    const kpi = resolveSlBalanzaRollupEndpointsForKpi(truckflowPoints, {
      externalSalidaAt: '2026-06-10T14:00:00',
      truckflowPoints,
      truckflowSegments: segments,
    })
    expect(kpi?.inicio_fuente).toBe('truckflow')
    expect(kpi?.from.occurredAt).toContain('10:00:00')
    expect(kpi?.fin_fuente).toBe('truckflow')
    expect(kpi?.to.occurredAt).toContain('10:45:00')
  })

  it('no usa ingreso Excel Ric como inicio S1 ni en scatter > 180 min', () => {
    const excelIng = '2026-06-10T06:00:00'
    const excelSal = '2026-06-10T14:00:00'
    const segments = [
      {
        segment_from: 'BALANZA_EGRESO',
        segment_to: 'SL_INGRESO',
        segment_start_time: '2026-06-10T09:00:00',
        segment_end_time: '2026-06-10T09:30:00',
      },
    ]
    const truckflowPoints = buildTimedLogicalTimelineFromSegments(segments)
    const kpi = resolveSlBalanzaRollupEndpointsForKpi(truckflowPoints, {
      externalSalidaAt: excelSal,
      externalIngresoAt: excelIng,
      truckflowPoints,
      truckflowSegments: segments,
    })
    if (kpi) {
      expect(isSlBalanzaIngresoAnchoredOnExcelIngreso(kpi.from.occurredAt, excelIng)).toBe(false)
    }
    expect(
      shouldRejectSlBalanzaScatterForExcelIngreso(240, excelIng, excelIng)
    ).toBe(true)
    expect(
      shouldRejectSlBalanzaScatterForExcelIngreso(120, excelIng, excelIng)
    ).toBe(true)
    expect(SL_BALANZA_STAY_MAX_MINUTES).toBe(180)
  })

  it('R5: estadía balanza→balanza sale del discharge rollup; el template chain da los tramos finos (playa/volcable)', () => {
    // La estadía total balanza ingreso → balanza egreso la da el discharge rollup
    // (Excel-first), independiente del template. Es lo que se conserva como "estadía".
    const dischargeLegs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-r5-volc',
      plate: 'AA111',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
      ],
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T09:45:00',
    })
    expect(dischargeLegs).toHaveLength(1)
    expect(dischargeLegs[0]).toMatchObject({
      fromCode: 'BALANZA_INGRESO',
      toCode: 'BALANZA_EGRESO',
      durationMinutes: 105,
    })

    // El template R5 ahora incluye playa/volcable, así que el template chain mide los
    // tramos finos (balanza ingreso → volcable → balanza egreso) desde cámara, NO el
    // rollup balanza→balanza (eso lo da el discharge rollup de arriba).
    const templateLegs = synthesizeTemplateChainLegsFromTimedSegments({
      operationId: 'op-r5-volc',
      plate: 'AA111',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
        {
          segment_from: 'VOLCABLE',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:30:00',
          segment_end_time: '2026-05-12T08:38:00',
        },
      ],
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T09:45:00',
    })
    expect(
      templateLegs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'VOLCABLE')
        ?.durationMinutes
    ).toBe(30)
    expect(
      templateLegs.find((l) => l.fromCode === 'VOLCABLE' && l.toCode === 'BALANZA_EGRESO')
        ?.durationMinutes
    ).toBe(8)
    // La estadía balanza→balanza ya NO sale del template chain (viene del discharge rollup).
    expect(
      templateLegs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO')
    ).toBeUndefined()
  })

  it('synthesizeDischargeRollupLegs usa calado Excel para R1 sin cámara C16', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-c16',
      plate: 'AA111',
      executiveCircuitCode: 'R1',
      segments: [
        {
          segment_from: 'CALADA',
          segment_to: 'BALANZA_INGRESO',
          segment_start_time: '2026-05-12T07:30:00',
          segment_end_time: '2026-05-12T07:45:00',
        },
      ],
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T09:30:00',
    })
    const stay = legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO'
    )
    expect(stay).toBeDefined()
    expect(stay!.durationMinutes).toBe(105)
  })

  it('extractDischargeRollupFromTimeline usa balanza egreso Truckflow como fin de descarga', () => {
    const points = [
      { code: 'BALANZA_INGRESO', occurredAt: '2026-05-12T08:00:00' },
      { code: 'BALANZA_EGRESO', occurredAt: '2026-05-12T09:30:00' },
    ]
    const rule = getDischargeKpiRollupRules('R1')[0]!
    const leg = extractDischargeRollupFromTimeline(points, 'R1', 'j1', 'AA111', rule)
    expect(leg).not.toBeNull()
    expect(leg!.toCode).toBe('BALANZA_EGRESO')
    expect(leg!.durationMinutes).toBe(90)
  })

  it('extractAllSegmentLegsForCircuit incluye rollup C16 con balanza ingreso y egreso', () => {
    const j = journey({
      journeyUid: 'j-c16-proxy',
      events: [
        ev('RicB1Ingreso', 'RICARDONE_BALANZA', '2026-05-12T08:00:00'),
        ev('RicB1Egreso', 'RICARDONE_BALANZA', '2026-05-12T09:30:00'),
      ],
      eventCount: 2,
    })
    expect(extractSegmentLegs(j, 'R1')).toHaveLength(0)
    const legs = extractAllSegmentLegsForCircuit(j, 'R1')
    const stay = legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO'
    )
    expect(stay).toBeDefined()
    expect(stay!.durationMinutes).toBe(90)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments deduce rollup R1 con calado Excel', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      // Entrada por puerta Ricardone: requerida para que el KPI cuente al camión.
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-c16',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_start_time: '2026-05-12T07:00:00',
        segment_end_time: '2026-05-12T07:10:00',
        segment_duration_min: 10,
        truckflow_circuit_code: 'R1',
        resolved_executive_circuit_code: 'R1',
        external_calado_at: '2026-05-12T09:00:00',
        external_salida_at: '2026-05-12T09:40:00',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-c16',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'CALADA',
        segment_to: 'BALANZA_INGRESO',
        segment_start_time: '2026-05-12T07:30:00',
        segment_end_time: '2026-05-12T07:45:00',
        segment_duration_min: 15,
        truckflow_circuit_code: 'R1',
        resolved_executive_circuit_code: 'R1',
        external_calado_at: '2026-05-12T09:00:00',
        external_salida_at: '2026-05-12T09:40:00',
      },
    ])
    const stay = index.legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO'
    )
    expect(stay).toBeDefined()
    expect(stay!.journeyId).toBe('op-c16')
    expect(stay!.durationMinutes).toBe(115)
  })

  it('R3 Excel-first: rollup balanza ingreso → balanza egreso (sin C16/Volcable)', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-kepler',
      plate: 'AA111',
      executiveCircuitCode: 'R3',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T10:00:00',
        },
      ],
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T10:00:00',
      platformNormalized: 'KEPPLER_1',
    })
    expect(legs).toHaveLength(1)
    expect(legs[0]).toMatchObject({
      fromCode: 'BALANZA_INGRESO',
      toCode: 'BALANZA_EGRESO',
      durationMinutes: 120,
    })
    expect(legs.find((l) => l.toCode === 'VOLCABLE')).toBeUndefined()
    expect(legs.find((l) => l.toCode === 'CELDA16_CARGA')).toBeUndefined()
  })

  it('R3 template: calada desde Excel si falta cámara S2', () => {
    const legs = synthesizeTemplateChainLegsFromTimedSegments({
      operationId: 'op-kepler-cal',
      plate: 'AA111',
      executiveCircuitCode: 'R3',
      segments: [
        {
          segment_from: 'INGRESO',
          segment_to: 'BALANZA_INGRESO',
          segment_start_time: '2026-05-12T07:00:00',
          segment_end_time: '2026-05-12T08:00:00',
        },
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T09:30:00',
        },
      ],
      externalCaladoAt: '2026-05-12T07:30:00',
      externalSalidaAt: '2026-05-12T09:30:00',
    })
    const ingCal = legs.find((l) => l.fromCode === 'INGRESO' && l.toCode === 'CALADA')
    expect(ingCal).toBeDefined()
    expect(ingCal!.durationMinutes).toBe(30)
  })

  it('synthesizeDischargeRollupLegs deduce puente R26 Ric→SL', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-r26',
      plate: 'AA111',
      executiveCircuitCode: 'R26',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T09:00:00',
        },
      ],
      externalCaladoAt: '2026-05-12T08:30:00',
      externalSalidaAt: '2026-05-12T11:00:00',
    })
    const bridge = legs.find((l) => l.fromCode === 'BALANZA_EGRESO' && l.toCode === 'SL_INGRESO')
    const c16 = legs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'CELDA16_CARGA')
    expect(c16).toBeDefined()
    expect(bridge).toBeDefined()
    expect(bridge!.durationMinutes).toBe(120)
  })

  it('synthesizeDischargeRollupLegs deduce puente R7 egreso Ric→SL ingreso', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-r7',
      plate: 'AA111',
      executiveCircuitCode: 'R7',
      segments: [
        {
          segment_from: 'CALADA',
          segment_to: 'EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T09:00:00',
        },
        {
          segment_from: 'SL_INGRESO',
          segment_to: 'SL_BALANZA_INGRESO',
          segment_start_time: '2026-05-12T10:30:00',
          segment_end_time: '2026-05-12T10:35:00',
        },
      ],
      externalCaladoAt: '2026-05-12T08:30:00',
      externalSalidaAt: '2026-05-12T11:00:00',
    })
    const bridge = legs.find((l) => l.fromCode === 'EGRESO' && l.toCode === 'SL_INGRESO')
    expect(bridge).toBeDefined()
    expect(bridge!.durationMinutes).toBe(90)
  })

  it('synthesizeDischargeRollupLegs deduce puente R27 SL→Ric', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-r27',
      plate: 'AA111',
      executiveCircuitCode: 'R27',
      segments: [
        {
          segment_from: 'SL_BALANZA_SALIDA',
          segment_to: 'SL_EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
      ],
      externalCaladoAt: '2026-05-12T10:00:00',
      externalSalidaAt: '2026-05-12T11:00:00',
    })
    const bridge = legs.find((l) => l.fromCode === 'SL_EGRESO' && l.toCode === 'INGRESO')
    expect(bridge).toBeDefined()
    expect(bridge!.durationMinutes).toBe(150)
  })

  it('rollup balanza salida SL → egreso con punto intermedio (tope tránsito corto)', () => {
    const j = journey({
      journeyUid: 'j-sl-sal-egr',
      events: [
        ev('SLZBalSC1Fte', 'PUERTO_SAN_LORENZO_BALANZA_SALIDA', '2026-05-12T09:00:00'),
        ev('SLZDescCam', 'PUERTO_SAN_LORENZO_DESCARGA', '2026-05-12T09:10:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T09:20:00'),
      ],
    })
    const leg = extractSlSalidaEgresoRollupLeg(j, 'R7')
    expect(leg).not.toBeNull()
    expect(leg!.durationMinutes).toBe(20)
  })

  it('excluye ingreso→preingreso mayor a 6 h (360 min)', () => {
    const j = journey({
      journeyUid: 'j-long',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T15:00:00'),
      ],
      eventCount: 2,
    })
    expect(extractSegmentLegs(j, 'R7')).toHaveLength(0)
    const jOk = journey({
      journeyUid: 'j-ok',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T10:30:00'),
      ],
      eventCount: 2,
    })
    expect(extractSegmentLegs(jOk, 'R7')[0]?.durationMinutes).toBe(150)
  })

  it('histograma siempre en bins de 5 min', () => {
    expect(histogramBinMinutesForTransition('INGRESO', 'PREINGRESO')).toBe(5)
    expect(histogramBinMinutesForTransition('PREINGRESO', 'CALADA')).toBe(5)
  })

  it('registra patente del mínimo y máximo por tramo', () => {
    const mk = (uid: string, plate: string, preMin: number): ClassifiedJourneyForTiming => ({
      journey: journey({
        journeyUid: uid,
        normalizedPlate: plate,
        plate,
        events: [
          ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
          ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', `2026-05-12T08:${String(preMin).padStart(2, '0')}:00`),
        ],
        eventCount: 2,
      }),
      executiveCircuitCode: 'R1',
      committeeGroup: 'COMPLETOS',
    })
    const index = buildSegmentTimingIndex([mk('j1', 'AAA111', 10), mk('j2', 'BBB222', 30)], {
      committeeGroups: ['COMPLETOS'],
    })
    const agg = index.aggregates.find((a) => a.fromCode === 'INGRESO' && a.toCode === 'PREINGRESO')
    expect(agg?.minPlate).toBe('AAA111')
    expect(agg?.maxPlate).toBe('BBB222')
  })

  it('excluye journeys ANOMALIAS cuando filtro COMPLETOS', () => {
    const completos = buildSegmentTimingIndex(
      [
        {
          journey: journey({
            journeyUid: 'ok',
            events: [
              ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
              ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T08:15:00'),
            ],
            eventCount: 2,
          }),
          executiveCircuitCode: 'R7',
          committeeGroup: 'COMPLETOS',
        },
        {
          journey: journey({
            journeyUid: 'bad',
            events: [
              ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T09:00:00'),
              ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T09:45:00'),
            ],
            eventCount: 2,
          }),
          executiveCircuitCode: 'R7',
          committeeGroup: 'ANOMALIAS',
        },
      ],
      { committeeGroups: ['COMPLETOS'] }
    )

    expect(completos.journeyCount).toBe(1)
    expect(completos.legs).toHaveLength(1)
    expect(completos.legs[0]!.durationMinutes).toBe(15)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments agrega tramos listos para scatter', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op1',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_duration_min: 12,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
        resolved_circuit_family: 'VOLCABLE',
      },
      {
        analysis_ready_for_scatter: false,
        external_operation_id: 'op2',
        journey_uid: 'j2',
        plate_normalized: 'BB222',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_duration_min: 99,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
        resolved_circuit_family: 'VOLCABLE',
      },
    ])
    expect(index.journeyCount).toBe(1)
    expect(index.legs).toHaveLength(1)
    expect(index.legs[0]!.durationMinutes).toBe(12)
    expect(index.legs[0]!.journeyId).toBe('op1')
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments deduplica journeys fragmentados por operación', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op1',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_duration_min: 8,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op1',
        journey_uid: 'j2',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_duration_min: 15,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
      },
    ])
    expect(index.journeyCount).toBe(1)
    expect(index.legs).toHaveLength(1)
    expect(index.legs[0]!.durationMinutes).toBe(15)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments usa circuito Excel, no Truckflow erróneo', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-sl',
        journey_uid: 'j-sl',
        plate_normalized: 'SL111',
        segment_from: 'INGRESO',
        segment_to: 'PREINGRESO',
        segment_duration_min: 10,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R7',
      },
    ])
    expect(index.circuitCodes).toEqual(['R7'])
    expect(index.legs[0]!.executiveCircuitCode).toBe('R7')
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments excluye tramos fuera del template', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op1',
        journey_uid: 'j1',
        plate_normalized: 'AA111',
        segment_from: 'INGRESO',
        segment_to: 'VOLCABLE',
        segment_duration_min: 50,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
      },
    ])
    expect(index.legs).toHaveLength(0)
  })

  it('synthesizeTemplateChain deduce ingreso→preingreso con ingreso Excel y solo preingreso Truckflow', () => {
    const legs = synthesizeTemplateChainLegsFromTimedSegments({
      operationId: 'op-r5-ing',
      plate: 'AA111',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'PREINGRESO',
          segment_to: 'CALADA',
          segment_start_time: '2026-05-12T08:12:00',
          segment_end_time: '2026-05-12T08:20:00',
        },
        {
          segment_from: 'CALADA',
          segment_to: 'BALANZA_INGRESO',
          segment_start_time: '2026-05-12T08:20:00',
          segment_end_time: '2026-05-12T08:25:00',
        },
      ],
      externalIngresoAt: '2026-05-12T08:00:00',
    })
    const ingPre = legs.find((l) => l.fromCode === 'INGRESO' && l.toCode === 'PREINGRESO')
    expect(ingPre).toBeDefined()
    expect(ingPre!.durationMinutes).toBe(12)
  })

  it('balanza ingreso→egreso Volcable: estadía hasta salida Excel si es posterior a B2', () => {
    const legs = synthesizeInferredRollupLegsFromTimedSegments({
      operationId: 'op-r5-vol',
      plate: 'BB222',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T10:00:00',
          segment_end_time: '2026-05-12T10:30:00',
        },
        {
          segment_from: 'VOLCABLE',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T10:30:00',
          segment_end_time: '2026-05-12T10:38:00',
        },
      ],
      externalCaladoAt: '2026-05-12T10:30:00',
      externalSalidaAt: '2026-05-12T14:00:00',
    })
    const stay = legs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO')
    expect(stay).toBeDefined()
    expect(stay!.durationMinutes).toBe(240)
  })

  it('balanza ingreso→egreso infiere salida Excel si falta cámara B2 (discharge rollup)', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-r5-vol-far',
      plate: 'CC333',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T10:00:00',
          segment_end_time: '2026-05-12T10:30:00',
        },
      ],
      externalCaladoAt: '2026-05-12T10:30:00',
      externalSalidaAt: '2026-05-12T14:00:00',
    })
    const stay = legs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO')
    expect(stay).toBeDefined()
    expect(stay!.durationMinutes).toBe(240)
  })

  it('template chain salta calada faltante: preingreso→balanza ingreso', () => {
    const legs = synthesizeTemplateChainLegsFromTimedSegments({
      operationId: 'op-skip-calada',
      plate: 'EE555',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'PREINGRESO',
          segment_to: 'BALANZA_INGRESO',
          segment_start_time: '2026-05-12T08:10:00',
          segment_end_time: '2026-05-12T08:22:00',
        },
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T08:22:00',
          segment_end_time: '2026-05-12T08:35:00',
        },
      ],
      externalIngresoAt: '2026-05-12T08:00:00',
    })
    const ingPre = legs.find((l) => l.fromCode === 'INGRESO' && l.toCode === 'PREINGRESO')
    const preBal = legs.find((l) => l.fromCode === 'PREINGRESO' && l.toCode === 'BALANZA_INGRESO')
    expect(ingPre?.durationMinutes).toBe(10)
    expect(preBal?.durationMinutes).toBe(12)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments sintetiza ingreso→preingreso faltante', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-ing',
        journey_uid: 'j1',
        plate_normalized: 'DD444',
        segment_from: 'PREINGRESO',
        segment_to: 'CALADA',
        segment_start_time: '2026-05-12T08:15:00',
        segment_end_time: '2026-05-12T08:22:00',
        segment_duration_min: 7,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
        external_ingreso_at: '2026-05-12T08:00:00',
      },
    ])
    const ingPre = index.legs.find((l) => l.fromCode === 'INGRESO' && l.toCode === 'PREINGRESO')
    expect(ingPre).toBeDefined()
    expect(ingPre!.durationMinutes).toBe(15)
  })

  it('Volcable 1 Excel-only: reconstruye cadena KPI desde ingreso/calado/salida', () => {
    const legs = synthesizeVolcableReceiptKpiLegsForOperation({
      operationId: 'op-excel-only',
      plate: 'GG999',
      executiveCircuitCode: 'R5',
      segments: [],
      externalIngresoAt: '2026-05-12T07:00:00',
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T11:00:00',
    })
    expect(legs.find((l) => l.fromCode === 'INGRESO' && l.toCode === 'PREINGRESO')).toBeDefined()
    expect(legs.find((l) => l.fromCode === 'PREINGRESO' && l.toCode === 'CALADA')).toBeDefined()
    expect(legs.find((l) => l.fromCode === 'CALADA' && l.toCode === 'BALANZA_INGRESO')).toBeDefined()
    const stay = legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'BALANZA_EGRESO'
    )
    expect(stay).toBeDefined()
    expect(stay!.durationMinutes).toBeGreaterThan(30)
  })

  it('mergeVolcableReceiptSegmentTiming une legs R5 y R6 bajo R5+R6', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-r5',
        journey_uid: 'j5',
        plate_normalized: 'AA111',
        segment_from: 'PREINGRESO',
        segment_to: 'CALADA',
        segment_start_time: '2026-05-12T08:00:00',
        segment_end_time: '2026-05-12T08:10:00',
        segment_duration_min: 10,
        truckflow_circuit_code: 'R5',
        resolved_executive_circuit_code: 'R5',
        external_ingreso_at: '2026-05-12T07:50:00',
      },
      {
        analysis_ready_for_scatter: true,
        external_operation_id: 'op-r6',
        journey_uid: 'j6',
        plate_normalized: 'BB222',
        segment_from: 'PREINGRESO',
        segment_to: 'CALADA',
        segment_start_time: '2026-05-12T09:00:00',
        segment_end_time: '2026-05-12T09:12:00',
        segment_duration_min: 12,
        truckflow_circuit_code: 'R6',
        resolved_executive_circuit_code: 'R6',
        external_ingreso_at: '2026-05-12T08:50:00',
      },
    ])
    const merged = mergeVolcableReceiptSegmentTiming(index)
    expect(merged.circuitCodes).toContain(VOLCABLE_RECEIPT_KPI_UNION_CODE)
    expect(merged.legs.every((l) => l.executiveCircuitCode === VOLCABLE_RECEIPT_KPI_UNION_CODE)).toBe(true)
    expect(merged.legs.length).toBeGreaterThanOrEqual(2)
  })

  it('diagnoseBalanzaStayFromTimedSegments marca rollup Excel largo vs cámara (R5)', () => {
    const diag = diagnoseBalanzaStayFromTimedSegments({
      operationId: 'op-r5-volc',
      plate: 'AA111',
      executiveCircuitCode: 'R5',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'VOLCABLE',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T08:30:00',
        },
        {
          segment_from: 'VOLCABLE',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:30:00',
          segment_end_time: '2026-05-12T08:38:00',
        },
      ],
      externalCaladoAt: '2026-05-12T09:00:00',
      externalSalidaAt: '2026-05-12T09:45:00',
    })
    expect(diag).not.toBeNull()
    expect(diag!.cameraBalanzaStayMinutes).toBe(38)
    // Con el template R5 fino (playa/volcable) el balanza-stay ya no sale del template
    // chain, así que no hay candidato `excel_template_chain` para comparar (no dispara
    // ROLLUP_VS_TEMPLATE_GAP). La señal esencial rollup(105') vs cámara(38') se mantiene.
    expect(diag!.flags).toContain('KPI_VS_CAMARA_DELTA>=15MIN')
    expect(diag!.kpiWinnerMinutes).toBe(105)
    expect(['excel_discharge_rollup', 'excel_volcable_merged']).toContain(diag!.kpiWinnerSource)
  })

  it('diagnoseR7SlBalanzaIngresoSalida: fin cámara S7 aunque Excel salida sea más temprana', () => {
    const diag = diagnoseR7SlBalanzaIngresoSalida({
      operationId: 'op-lht051',
      plate: 'LHT051',
      executiveCircuitCode: 'R7',
      segments: [
        {
          segment_from: 'SL_BALANZA_INGRESO',
          segment_to: 'SL_BALANZA_SALIDA',
          segment_start_time: '2026-06-04T02:33:32',
          segment_end_time: '2026-06-04T03:00:00',
        },
        {
          segment_from: 'SL_BALANZA_SALIDA',
          segment_to: 'SL_EGRESO',
          segment_start_time: '2026-06-04T03:00:00',
          segment_end_time: '2026-06-04T03:16:18',
        },
      ],
      externalSalidaAt: '2026-06-04T02:40:00',
    })
    expect(diag).not.toBeNull()
    expect(diag!.comite.payload?.horario_fuente_fin).toBe('truckflow')
    expect(diag!.flags).toContain('EXCEL_SALIDA_ANTES_QUE_EGRESO_CAMARA')
    expect(diag!.flags).toContain('FIN_CAMARA_EGRESO_S7')
    expect(diag!.comite.reason).toBe('ok')
  })
})

describe('mergeSegmentTimingIndexes', () => {
  const leg = (journeyId: string, circuit: string, from: string, to: string, min: number) => ({
    journeyId,
    plate: 'AAA111',
    executiveCircuitCode: circuit,
    fromCode: from,
    toCode: to,
    transitionLabel: `${from} → ${to}`,
    durationMinutes: min,
  })
  const idx = (legs: ReturnType<typeof leg>[]) =>
    buildSegmentTimingIndexFromExcelFirstSegments(
      legs.map((l) => ({
        analysis_ready_for_scatter: true,
        external_operation_id: l.journeyId,
        journey_uid: l.journeyId,
        plate_normalized: l.plate,
        segment_from: l.fromCode,
        segment_to: l.toCode,
        segment_duration_min: l.durationMinutes,
        truckflow_circuit_code: l.executiveCircuitCode,
        resolved_executive_circuit_code: l.executiveCircuitCode,
      })),
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )

  it('conserva los tramos de cámara aunque el Excel aporte uno solo', () => {
    // El bug: el índice Excel-first reemplazaba al de cámaras y el KPI se quedaba sin R7.
    const camera = idx([
      leg('j1', 'R7', 'INGRESO', 'PREINGRESO', 12),
      leg('j1', 'R7', 'PREINGRESO', 'CALADA', 30),
      leg('j2', 'R1', 'INGRESO', 'CALADA', 40),
    ])
    const excel = idx([leg('op-9', 'R3', 'INGRESO', 'CALADA', 55)])

    const merged = mergeSegmentTimingIndexes(camera, excel)
    expect(merged.legs.length).toBe(4)
    expect([...new Set(merged.legs.map((l) => l.executiveCircuitCode))].sort()).toEqual([
      'R1',
      'R3',
      'R7',
    ])
  })

  it('no cuenta dos veces el mismo tramo del mismo viaje: gana el Excel', () => {
    const camera = idx([leg('j1', 'R7', 'INGRESO', 'CALADA', 100)])
    const excel = idx([leg('op-1', 'R7', 'INGRESO', 'CALADA', 90)])
    const merged = mergeSegmentTimingIndexes(camera, excel, {
      journeyUidByOperationId: new Map([['op-1', 'j1']]),
    })
    expect(merged.legs.length).toBe(1)
    expect(merged.legs[0]!.durationMinutes).toBe(90)
  })

  it('sin mapa de operación→journey no puede deduplicar y quedan los dos', () => {
    const camera = idx([leg('j1', 'R7', 'INGRESO', 'CALADA', 100)])
    const excel = idx([leg('op-1', 'R7', 'INGRESO', 'CALADA', 90)])
    expect(mergeSegmentTimingIndexes(camera, excel).legs.length).toBe(2)
  })
})

describe('plantilla KPI de líquidos (R8 / R16)', () => {
  it('no tiene CALADA: en líquidos el muestreo entra como LIQUIDO', () => {
    // Medido sobre 138 recorridos R8 de dos ventanas: CALADA=0, LIQUIDO=100%.
    // El CALADA fantasma partía «preingreso → líquido» en dos tramos siempre vacíos.
    for (const code of ['R8', 'R16']) {
      const t = getCircuitSegmentTemplate(code)
      expect(t, `${code} no debe declarar CALADA`).not.toContain('CALADA')
      expect(t).toEqual(['INGRESO', 'PREINGRESO', 'LIQUIDO', 'BALANZA_INGRESO', 'BALANZA_EGRESO'])
    }
  })

  it('el tramo real preingreso → líquido queda medible', () => {
    const t = getCircuitSegmentTemplate('R8')
    const tramos: string[] = []
    for (let i = 0; i < t.length - 1; i++) tramos.push(`${t[i]}→${t[i + 1]}`)
    expect(tramos).toContain('PREINGRESO→LIQUIDO')
    expect(tramos).not.toContain('PREINGRESO→CALADA')
    expect(tramos).not.toContain('CALADA→LIQUIDO')
  })

  it('los sólidos conservan su calada', () => {
    expect(getCircuitSegmentTemplate('R1')).toContain('CALADA')
    expect(getCircuitSegmentTemplate('R5')).toContain('CALADA')
    expect(getCircuitSegmentTemplate('R7')).toContain('CALADA')
  })
})
