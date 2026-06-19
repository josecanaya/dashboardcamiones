import { describe, expect, it } from 'vitest'
import type { RealJourneyEventDto, ReconstructedRealJourney } from './realJourneyEvents.types'
import { normalizeRealEventPoint } from './realEventNormalization'
import {
  getEventOperationalInstantIso,
  eventOperationalInstantForTimeline,
} from './realEventOperationalTime'
import { compareRealEvents } from './realJourneyEventsMapper'
import { extractSegmentLegsWithTimes } from '../features/real-truckflow/etlWorkbench/etlSegmentTiming'

function slEvent(partial: Partial<RealJourneyEventDto>): RealJourneyEventDto {
  return {
    id: partial.id ?? 1,
    journeyUid: partial.journeyUid ?? 'j-gjw',
    sequenceNumber: partial.sequenceNumber ?? 1,
    truckPlate: partial.truckPlate ?? 'GJW684',
    normalizedPlate: partial.normalizedPlate ?? 'GJW684',
    isValidPlate: true,
    sectorCode: partial.sectorCode ?? 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
    deviceCode: partial.deviceCode ?? 'SLZBalIngFte',
    eventType: partial.eventType ?? 'LPR',
    alertLevel: partial.alertLevel ?? 0,
    occurredAt: partial.occurredAt ?? '2026-06-10T18:53:00-03:00',
    recordedAt: partial.recordedAt ?? '',
    createdAt: partial.createdAt ?? '2026-06-10T22:16:00-03:00',
    modifiedAt: partial.modifiedAt ?? '',
    ...partial,
  } as RealJourneyEventDto
}

describe('realEventOperationalTime', () => {
  it('prioriza createdAt sobre occurredAt (caso GJW684 / SLZBalIngFte)', () => {
    const ev = slEvent({})
    expect(getEventOperationalInstantIso(ev)).toBe('2026-06-10T22:16:00-03:00')
    expect(normalizeRealEventPoint(ev).logicalCode).toBe('SL_BALANZA_INGRESO')
  })

  it('compareRealEvents ordena por createdAt operativo', () => {
    const a = slEvent({
      id: 1,
      occurredAt: '2026-06-10T23:00:00-03:00',
      createdAt: '2026-06-10T22:16:00-03:00',
      sequenceNumber: 1,
    })
    const b = slEvent({
      id: 2,
      occurredAt: '2026-06-10T18:00:00-03:00',
      createdAt: '2026-06-10T23:30:00-03:00',
      sequenceNumber: 2,
      deviceCode: 'SLZSalidaC1Fte',
      sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    })
    expect(compareRealEvents(a, b)).toBeLessThan(0)
  })

  it('extractSegmentLegsWithTimes: SL balanza ingreso a 22:16 (createdAt)', () => {
    const balIn = slEvent({})
    const egreso = slEvent({
      id: 2,
      sequenceNumber: 2,
      deviceCode: 'SLZSalidaC1Fte',
      sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
      occurredAt: '2026-06-10T23:00:00-03:00',
      createdAt: '2026-06-10T23:05:12.500-03:00',
    })
    const j: ReconstructedRealJourney = {
      journeyUid: 'j-gjw',
      plate: 'GJW684',
      normalizedPlate: 'GJW684',
      isValidPlate: true,
      startedAt: eventOperationalInstantForTimeline(balIn),
      endedAt: eventOperationalInstantForTimeline(egreso),
      durationMinutes: 60,
      eventCount: 2,
      siteId: 'san_lorenzo',
      day: '2026-06-10',
      events: [balIn, egreso],
      rawSectorSequence: [],
      rawDeviceSequence: [],
      logicalSectorSequence: [],
      logicalCodeSequence: [],
      unmappedSectorCodes: [],
    }
    const legs = extractSegmentLegsWithTimes(j, 'R7')
    const rollup = legs.find(
      (l) => l.fromCode === 'SL_BALANZA_INGRESO' && l.toCode === 'SL_EGRESO'
    )
    expect(rollup).toBeDefined()
    expect(rollup!.segment_start_time).toContain('22:16')
    expect(rollup!.segment_end_time).toContain('23:05')
  })
})
