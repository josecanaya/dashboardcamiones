import { describe, expect, it } from 'vitest'
import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import { MAX_DURATION_MINUTES } from '../../../config/durationBounds'
import {
  aggregateCircuitTimingSummaries,
  buildCircuitTimingIndex,
  circuitTimingJourneysFromCsvRows,
  extractJourneyCircuitTotal,
  isValidCircuitTotalDuration,
  type ClassifiedJourneyForCircuitTiming,
} from './etlCircuitTiming'

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

function classified(
  partial: Partial<ClassifiedJourneyForCircuitTiming> & Pick<ClassifiedJourneyForCircuitTiming, 'journey'>
): ClassifiedJourneyForCircuitTiming {
  return {
    executiveCircuitCode: 'R5',
    committeeGroup: 'COMPLETOS',
    executiveStatus: 'VALIDO',
    validDetail: 'COMPLETO',
    circuitName: 'Circuito R5',
    ...partial,
  }
}

describe('etlCircuitTiming', () => {
  it('calcula duración total entre primer y último evento frontal útil', () => {
    const j = journey({
      journeyUid: 'j1',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicPreIngInFr', 'RICARDONE_PREINGRESO', '2026-05-12T08:30:00'),
        ev('RicCal01', 'RICARDONE_CALADA', '2026-05-12T09:15:00'),
        ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T10:00:00'),
      ],
      eventCount: 4,
    })

    const total = extractJourneyCircuitTotal(j)
    expect(total).toMatchObject({
      journeyId: 'j1',
      plate: 'ABC123',
      startTime: '2026-05-12T08:00:00',
      endTime: '2026-05-12T10:00:00',
      totalDurationMin: 120,
      eventCount: 4,
    })
  })

  it('excluye journeys sin eventos suficientes o duración inválida', () => {
    const oneEvent = journey({
      journeyUid: 'j-one',
      events: [ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00')],
      eventCount: 1,
    })
    expect(extractJourneyCircuitTotal(oneEvent)).toBeNull()

    const zeroDuration = journey({
      journeyUid: 'j-zero',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T08:00:00'),
      ],
      eventCount: 2,
    })
    expect(extractJourneyCircuitTotal(zeroDuration)).toBeNull()

    const tooShort = journey({
      journeyUid: 'j-short',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T08:03:00'),
      ],
      eventCount: 2,
    })
    expect(extractJourneyCircuitTotal(tooShort)).toBeNull()

    const okDuration = journey({
      journeyUid: 'j-ok',
      events: [
        ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
        ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T08:04:00'),
      ],
      eventCount: 2,
    })
    expect(extractJourneyCircuitTotal(okDuration)?.totalDurationMin).toBe(4)
    expect(isValidCircuitTotalDuration(MAX_DURATION_MINUTES + 1)).toBe(false)
  })

  it('agrega estadísticas por circuito con min/max plate', () => {
    const mk = (uid: string, plate: string, endHour: number): ClassifiedJourneyForCircuitTiming =>
      classified({
        journey: journey({
          journeyUid: uid,
          plate,
          normalizedPlate: plate,
          events: [
            ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
            ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', `2026-05-12T${String(endHour).padStart(2, '0')}:00:00`),
          ],
          eventCount: 2,
        }),
        executiveCircuitCode: 'R5',
      })

    const index = buildCircuitTimingIndex(
      [mk('j1', 'AAA111', 9), mk('j2', 'BBB222', 10), mk('j3', 'CCC333', 11)],
      { committeeGroups: ['COMPLETOS'] }
    )
    const summary = index.summaries.find((s) => s.executiveCircuitCode === 'R5')
    expect(summary).toBeDefined()
    const expected = computeStayTimeStats([60, 120, 180])
    expect(summary!.meanTotalMin).toBeCloseTo(expected.mean, 5)
    expect(summary!.stdTotalMin).toBeCloseTo(expected.std, 5)
    expect(summary!.medianTotalMin).toBeCloseTo(expected.median, 5)
    expect(summary!.p90TotalMin).toBeCloseTo(expected.p90, 5)
    expect(summary!.q1TotalMin).toBeCloseTo(expected.q1, 5)
    expect(summary!.q3TotalMin).toBeCloseTo(expected.q3, 5)
    expect(summary!.iqrTotalMin).toBeCloseTo(expected.iqr, 5)
    expect(summary!.minPlate).toBe('AAA111')
    expect(summary!.maxPlate).toBe('CCC333')
    expect(summary!.nJourneys).toBe(3)
  })

  it('solo incluye journeys COMPLETOS con circuito identificado', () => {
    const j = classified({
      journey: journey({
        journeyUid: 'j-anom',
        events: [
          ev('RicIngCamFrente', 'RICARDONE_INGRESO_CAMIONES', '2026-05-12T08:00:00'),
          ev('RicEgrCamFrente', 'RICARDONE_EGRESO_CAMIONES', '2026-05-12T09:00:00'),
        ],
        eventCount: 2,
      }),
      committeeGroup: 'ANOMALIAS',
    })
    const index = buildCircuitTimingIndex([j], { committeeGroups: ['COMPLETOS'] })
    expect(index.journeys).toHaveLength(0)
  })

  it('reconstruye summary desde filas CSV de journeys', () => {
    const rows = circuitTimingJourneysFromCsvRows([
      {
        journey_id: 'j1',
        plate: 'AAA111',
        executive_circuit_code: 'R1',
        circuit_name: 'R1 test',
        executive_status: 'VALIDO',
        valid_detail: 'DEDUCIDO',
        start_time: '2026-05-12T08:00:00',
        end_time: '2026-05-12T09:00:00',
        total_duration_min: '60',
        event_count: '3',
      },
      {
        journey_id: 'j2',
        plate: 'BBB222',
        executive_circuit_code: 'R1',
        circuit_name: 'R1 test',
        executive_status: 'VALIDO',
        valid_detail: 'COMPLETO',
        start_time: '2026-05-12T08:00:00',
        end_time: '2026-05-12T10:00:00',
        total_duration_min: '120',
        event_count: '4',
      },
    ])
    const summaries = aggregateCircuitTimingSummaries(rows)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.nJourneys).toBe(2)
    expect(summaries[0]!.executiveStatus).toBe('VALIDO')
  })
})
