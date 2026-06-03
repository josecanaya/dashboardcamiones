import { describe, expect, it } from 'vitest'
import {
  countUniqueRawJourneyUids,
  countUniqueRawJourneyUidsByOccurredDay,
  enrichApiJourneyStatsFromRawEvents,
  normalizeApiJourneyDayStat,
  rawJourneyUidFromRecord,
} from './truckflowRawJourneyStats'

describe('truckflowRawJourneyStats', () => {
  it('extrae journeyUid y cuenta únicos', () => {
    expect(rawJourneyUidFromRecord({ journeyUid: 'a' })).toBe('a')
    expect(rawJourneyUidFromRecord({ journey_uuid: 'b' })).toBe('b')
    const n = countUniqueRawJourneyUids([
      { journeyUid: 'u1', occurredAt: '2026-06-01T10:00:00-03:00' },
      { journeyUid: 'u1', occurredAt: '2026-06-01T11:00:00-03:00' },
      { journeyUid: 'u2', occurredAt: '2026-06-01T12:00:00-03:00' },
    ])
    expect(n).toBe(2)
  })

  it('normaliza filas sin uniqueJourneyUids', () => {
    expect(normalizeApiJourneyDayStat({ day: '2026-06-01', events: 10, eventFile: true })).toMatchObject({
      day: '2026-06-01',
      events: 10,
      uniqueJourneyUids: 0,
      eventFile: true,
    })
  })

  it('enriquece conteos desde eventos crudos', () => {
    const rows = enrichApiJourneyStatsFromRawEvents(
      [{ day: '2026-06-01', events: 2, eventFile: true }],
      [
        { journeyUid: 'u1', occurredAt: '2026-06-01T10:00:00-03:00' },
        { journeyUid: 'u2', occurredAt: '2026-06-01T11:00:00-03:00' },
      ]
    )
    expect(rows[0].uniqueJourneyUids).toBe(2)
  })

  it('agrupa por día civil de occurredAt', () => {
    const rows = countUniqueRawJourneyUidsByOccurredDay([
      { journeyUid: 'u1', occurredAt: '2026-06-01T23:00:00-03:00' },
      { journeyUid: 'u2', occurredAt: '2026-06-02T01:00:00-03:00' },
      { journeyUid: 'u1', occurredAt: '2026-06-02T02:00:00-03:00' },
    ])
    expect(rows).toEqual([
      { day: '2026-06-01', uniqueJourneyUids: 1 },
      { day: '2026-06-02', uniqueJourneyUids: 2 },
    ])
  })
})
