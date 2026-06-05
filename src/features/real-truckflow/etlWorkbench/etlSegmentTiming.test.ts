import { describe, expect, it } from 'vitest'
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
  getDischargeKpiRollupRules,
  buildTimedLogicalTimelineFromSegments,
  histogramBinMinutesForTransition,
  listCircuitSegmentAggregates,
  enrichSlTimelineWithExcelSalida,
  synthesizeSlRollupLegsFromTimedSegments,
  synthesizeDischargeRollupLegsFromTimedSegments,
  selectCoherentSegmentGroup,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
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
      'BALANZA_INGRESO→CELDA16_DESCARGA',
      'CELDA16_DESCARGA→BALANZA_EGRESO',
    ])
  })

  it('R7 incluye tramo rollup balanza ingreso SL → balanza salida SL', () => {
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
      'SL_BALANZA_INGRESO→SL_BALANZA_SALIDA',
      'SL_BALANZA_SALIDA→SL_EGRESO',
    ])
  })

  it('rollup balanza SL mide salto no consecutivo ingreso→salida', () => {
    const j = journey({
      journeyUid: 'j-sl-rollup',
      events: [
        ev('SLZBalIngFte', 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', '2026-05-12T09:00:00'),
        ev('SLZIngCamFrente', 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES', '2026-05-12T09:30:00'),
        ev('SLZBalSC1Fte', 'PUERTO_SAN_LORENZO_BALANZA_SALIDA', '2026-05-12T11:00:00'),
      ],
    })
    const rollup = extractSlBalancaRollupLeg(j, 'R7')
    expect(rollup).not.toBeNull()
    expect(rollup!.durationMinutes).toBe(120)
    expect(rollup!.fromCode).toBe('SL_BALANZA_INGRESO')
    expect(rollup!.toCode).toBe('SL_BALANZA_SALIDA')
  })

  it('rollup balanza ingreso SL usa egreso si no hay balanza salida', () => {
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
  })

  it('extractSegmentLegsWithTimes exporta rollup ingreso→egreso sin S5', () => {
    const j = journey({
      journeyUid: 'j-sl-export',
      events: [
        ev('SLZBalIngFte', 'PUERTO_SAN_LORENZO_BALANZA_INGRESO', '2026-05-12T09:00:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T10:30:00'),
      ],
    })
    const legs = extractSegmentLegsWithTimes(j, 'SL1')
    const rollup = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_BALANZA_SALIDA'
    )
    expect(rollup).toBeDefined()
    expect(rollup!.durationMinutes).toBe(90)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments deduce rollup SL en KPI', () => {
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
        segment_to: 'SL_BALANZA_INGRESO',
        segment_start_time: '2026-05-12T08:15:00',
        segment_end_time: '2026-05-12T08:15:00',
        segment_duration_min: 0.01,
        truckflow_circuit_code: 'SL1',
        resolved_executive_circuit_code: 'SL1',
        external_salida_at: '2026-05-12T10:00:00',
      },
    ])
    const rollup = index.legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_BALANZA_SALIDA'
    )
    expect(rollup).toBeDefined()
    expect(rollup!.durationMinutes).toBeCloseTo(105, 0)
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

  it('buildSegmentTimingIndexFromExcelFirstSegments deduce salida→egreso SL con salida Excel', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
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
        external_salida_at: '2026-05-12T10:30:00',
      },
    ])
    const salidaEgreso = index.legs.find(
      (l) => l.fromCode === 'SL_BALANZA_SALIDA' && l.toCode === 'SL_EGRESO'
    )
    expect(salidaEgreso).toBeDefined()
    expect(salidaEgreso!.durationMinutes).toBe(90)
  })

  it('deduce salida→egreso SL aunque egreso fragmentado sea anterior a balanza salida', () => {
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
      externalSalidaAt: '2026-05-12T11:00:00',
    })
    const salidaEgreso = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_SALIDA' && l.toCode === 'SL_EGRESO'
    )
    expect(salidaEgreso).toBeDefined()
    expect(salidaEgreso!.durationMinutes).toBe(60)
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
    expect(ingresoSl).toBeDefined()
    expect(ingresoSl!.durationMinutes).toBeLessThanOrEqual(INFERRED_KPI_ROLLUP_MAX_MINUTES)
    expect(ingresoSl!.durationMinutes).toBeGreaterThan(0)
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
    const approach = legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'CELDA16_DESCARGA'
    )
    const exit = legs.find((l) => l.fromCode === 'CELDA16_DESCARGA' && l.toCode === 'BALANZA_EGRESO')
    expect(approach).toBeDefined()
    expect(approach!.durationMinutes).toBe(75)
    expect(exit).toBeDefined()
    expect(exit!.durationMinutes).toBe(30)
  })

  it('extractDischargeRollupFromTimeline usa balanza egreso Truckflow como fin de descarga', () => {
    const points = [
      { code: 'BALANZA_INGRESO', occurredAt: '2026-05-12T08:00:00' },
      { code: 'BALANZA_EGRESO', occurredAt: '2026-05-12T09:30:00' },
    ]
    const rule = getDischargeKpiRollupRules('R1')[0]!
    const leg = extractDischargeRollupFromTimeline(points, 'R1', 'j1', 'AA111', rule)
    expect(leg).not.toBeNull()
    expect(leg!.toCode).toBe('CELDA16_DESCARGA')
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
    const approach = legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'CELDA16_DESCARGA'
    )
    expect(approach).toBeDefined()
    expect(approach!.durationMinutes).toBe(90)
  })

  it('buildSegmentTimingIndexFromExcelFirstSegments deduce rollup R1 con calado Excel', () => {
    const index = buildSegmentTimingIndexFromExcelFirstSegments([
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
    const approach = index.legs.find(
      (l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'CELDA16_DESCARGA'
    )
    expect(approach).toBeDefined()
    expect(approach!.journeyId).toBe('op-c16')
  })

  it('synthesizeDischargeRollupLegs inyecta Volcable Kepler en calado Excel (descarga silo)', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-kepler',
      plate: 'AA111',
      executiveCircuitCode: 'RK1',
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
    const c16 = legs.find((l) => l.fromCode === 'BALANZA_INGRESO' && l.toCode === 'CELDA16_CARGA')
    const silo = legs.find((l) => l.fromCode === 'CELDA16_CARGA' && l.toCode === 'VOLCABLE')
    expect(c16).toBeDefined()
    expect(silo).toBeDefined()
    expect(c16!.durationMinutes).toBe(30)
    expect(silo!.durationMinutes).toBe(30)
  })

  it('Kepler sin calado Excel no inventa descarga en silo', () => {
    const legs = synthesizeDischargeRollupLegsFromTimedSegments({
      operationId: 'op-kepler-no-cal',
      plate: 'AA111',
      executiveCircuitCode: 'RK1',
      segments: [
        {
          segment_from: 'BALANZA_INGRESO',
          segment_to: 'BALANZA_EGRESO',
          segment_start_time: '2026-05-12T08:00:00',
          segment_end_time: '2026-05-12T10:00:00',
        },
      ],
      externalSalidaAt: '2026-05-12T10:00:00',
      platformNormalized: 'KEPPLER_1',
    })
    const silo = legs.find((l) => l.fromCode === 'CELDA16_CARGA' && l.toCode === 'VOLCABLE')
    expect(silo).toBeUndefined()
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

  it('rollup balanza salida SL → egreso con punto intermedio', () => {
    const j = journey({
      journeyUid: 'j-sl-sal-egr',
      events: [
        ev('SLZBalSC1Fte', 'PUERTO_SAN_LORENZO_BALANZA_SALIDA', '2026-05-12T09:00:00'),
        ev('SLZDescCam', 'PUERTO_SAN_LORENZO_DESCARGA', '2026-05-12T09:45:00'),
        ev('SLZSalidaC1Fte', 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES', '2026-05-12T10:30:00'),
      ],
    })
    const leg = extractSlSalidaEgresoRollupLeg(j, 'R7')
    expect(leg).not.toBeNull()
    expect(leg!.durationMinutes).toBe(90)
  })

  it('excluye ingreso→preingreso mayor a 1 h', () => {
    const j = journey({
      journeyUid: 'j-long',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T10:30:00'),
      ],
      eventCount: 2,
    })
    expect(extractSegmentLegs(j, 'R7')).toHaveLength(0)
    const jOk = journey({
      journeyUid: 'j-ok',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T08:12:00'),
      ],
      eventCount: 2,
    })
    expect(extractSegmentLegs(jOk, 'R7')[0]?.durationMinutes).toBe(12)
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
})
