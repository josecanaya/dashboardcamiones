import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import {
  buildSegmentTimingIndex,
  extractSegmentLegs,
  extractSlBalancaRollupLeg,
  extractSlSalidaEgresoRollupLeg,
  histogramBinMinutesForTransition,
  listCircuitSegmentAggregates,
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
})
