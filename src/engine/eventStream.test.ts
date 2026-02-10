import { describe, it, expect } from 'vitest'
import {
  parseRawEventRow,
  getVisitKey,
  getVisitKeyWithMeta,
  buildTripFromEvents,
  buildTripsFromEventStream,
  buildStory,
  buildTripSummaryFromEvents,
} from './eventStream'
import type { RawEventRow } from './eventStream'
import { buildVisits } from './buildVisits'
import type { NormalizedEvent } from '../domain/events'

const SITE = 'ricardone' as const

function row(overrides: Partial<RawEventRow> & { occurredAt: string; eventType: string }): RawEventRow {
  const { occurredAt, eventType, ...rest } = overrides
  return {
    siteId: SITE,
    visitId: 'v1',
    plate: 'ABC123',
    occurredAt,
    eventType,
    ...rest,
  }
}

describe('eventStream', () => {
  describe('parseRawEventRow', () => {
    it('parses fixed columns and optional labResult', () => {
      const r = parseRawEventRow({
        siteId: 's1',
        visitId: 'v1',
        occurredAt: '2024-01-15T08:00:00',
        eventType: 'GATE_CHECKIN',
        locationKey: 'GATE',
        labResult: 'OK',
      })
      expect(r).not.toBeNull()
      expect(r!.siteId).toBe('s1')
      expect(r!.visitId).toBe('v1')
      expect(r!.eventType).toBe('GATE_CHECKIN')
      expect(r!.labResult).toBe('OK')
    })

    it('returns null when occurredAt or eventType missing', () => {
      expect(parseRawEventRow({ eventType: 'A' })).toBeNull()
      expect(parseRawEventRow({ occurredAt: '2024-01-01T00:00:00' })).toBeNull()
    })
  })

  describe('getVisitKey / getVisitKeyWithMeta', () => {
    it('uses visitId when present and fallbackUsed is false', () => {
      const r = row({ visitId: 'vis-1', occurredAt: '2024-01-01T10:00:00', eventType: 'GATE_CHECKIN' })
      expect(getVisitKey(r)).toMatch(/ricardone\|vis-1\|/)
      const meta = getVisitKeyWithMeta(r)
      expect(meta.fallbackUsed).toBe(false)
    })

    it('uses plate|docNumber|2h block when visitId empty and sets fallbackUsed', () => {
      const r = row({ visitId: '', plate: 'P1', docNumber: 'D1', occurredAt: '2024-01-01T10:00:00', eventType: 'GATE_CHECKIN' })
      expect(getVisitKey(r)).toMatch(/ricardone\|P1\|D1\|/)
      const meta = getVisitKeyWithMeta(r)
      expect(meta.fallbackUsed).toBe(true)
    })

    it('same 2h block gives same key, different 2h block gives different key (no visitId)', () => {
      const r1 = row({ visitId: '', plate: 'P1', docNumber: 'D1', occurredAt: '2024-01-01T10:00:00Z', eventType: 'GATE_CHECKIN' })
      const r2 = row({ visitId: '', plate: 'P1', docNumber: 'D1', occurredAt: '2024-01-01T11:00:00Z', eventType: 'GATE_CHECKIN' })
      const r3 = row({ visitId: '', plate: 'P1', docNumber: 'D1', occurredAt: '2024-01-01T14:00:00Z', eventType: 'GATE_CHECKIN' })
      expect(getVisitKey(r1)).toBe(getVisitKey(r2))
      expect(getVisitKey(r1)).not.toBe(getVisitKey(r3))
    })
  })

  describe('buildTripFromEvents', () => {
    it('ideal ABCDEF with labResult OK', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN', locationKey: 'GATE' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN', weightKg: 40000 }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'DISCHARGE_END', unloadPoint: 'PIT_1', unloadQty: 25000 }),
        row({ occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABCDEF')
      expect(trip.status).toBe('VALID_IDEAL')
      expect(trip.flags).toHaveLength(0)
      expect(trip.story).toContain('Ingreso')
      expect(trip.story).toContain('Egreso')
    })

    it('acceptable AGBCDEF', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:02:00', eventType: 'YARD_WAIT' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'DISCHARGE_END' }),
        row({ occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('AGBCDEF')
      expect(trip.status).toBe('VALID_ACCEPTABLE')
    })

    it('sin descarga ABCF with labResult NO', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'NO' }),
        row({ occurredAt: '2024-01-01T08:20:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABCF')
      expect(trip.status).toBe('VALID_NO_DISCHARGE')
    })

    it('sin descarga ABCGCF', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:12:00', eventType: 'YARD_WAIT' }),
        row({ occurredAt: '2024-01-01T08:18:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:22:00', eventType: 'LAB_RESULT_READY', labResult: 'NO' }),
        row({ occurredAt: '2024-01-01T08:25:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABCGCF')
      expect(trip.status).toBe('VALID_NO_DISCHARGE')
    })

    it('invalid: D without OK (rechazado con descarga)', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'NO' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'DISCHARGE_END' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.status).toBe('INVALID')
      expect(trip.flags).toContain('D_WITHOUT_OK')
    })

    it('invalid: open trip (no EXIT)', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.status).toBe('INVALID')
      expect(trip.flags).toContain('OPEN_TRIP')
    })

    it('maps UNLOAD_END and GATE_CHECKOUT to internal types', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'UNLOAD_END', unloadPoint: 'PIT_1' }),
        row({ occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'GATE_CHECKOUT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABCDEF')
      expect(trip.status).toBe('VALID_IDEAL')
    })

    it('UNLOAD_START + UNLOAD_END colapsan a una D → path ABCDEF, VALID_IDEAL', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:35:00', eventType: 'UNLOAD_START', unloadPoint: 'PIT_1' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'UNLOAD_END', unloadPoint: 'PIT_1', unloadQty: 25000 }),
        row({ occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'GATE_CHECKOUT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABCDEF')
      expect(trip.status).toBe('VALID_IDEAL')
    })

    it('raw eventType WAIT normalizes to YARD_WAIT and path includes G → VALID_ACCEPTABLE', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:08:00', eventType: 'WAIT' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:45:00', eventType: 'UNLOAD_END' }),
        row({ occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T08:55:00', eventType: 'GATE_CHECKOUT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.path).toBe('ABGCDEF')
      expect(trip.status).toBe('VALID_ACCEPTABLE')
    })

    it('empty rows returns INVALID with MISSING_EVENT', () => {
      const trip = buildTripFromEvents([], SITE)
      expect(trip.timeline).toHaveLength(0)
      expect(trip.status).toBe('INVALID')
      expect(trip.flags).toContain('MISSING_EVENT')
      expect(trip.story).toBe('Sin eventos.')
    })

    it('buildTripsFromEventStream groups by visitKey', () => {
      const rows: RawEventRow[] = [
        row({ visitId: 'v1', occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ visitId: 'v1', occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ visitId: 'v2', occurredAt: '2024-01-01T09:00:00', eventType: 'GATE_CHECKIN' }),
        row({ visitId: 'v2', occurredAt: '2024-01-01T09:05:00', eventType: 'SCALE_IN' }),
      ]
      const trips = buildTripsFromEventStream(rows, SITE)
      expect(trips).toHaveLength(2)
      expect(trips[0].visitId).toBe('v1')
      expect(trips[1].visitId).toBe('v2')
    })

    it('without visitId sets visitKeyFallbackUsed and VISIT_KEY_FALLBACK_USED flag', () => {
      const rows: RawEventRow[] = [
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:45:00', eventType: 'DISCHARGE_END' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:50:00', eventType: 'SCALE_OUT' }),
        row({ visitId: '', plate: 'X1', docNumber: 'DOC1', occurredAt: '2024-01-01T08:55:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      expect(trip.visitKeyFallbackUsed).toBe(true)
      expect(trip.flags).toContain('VISIT_KEY_FALLBACK_USED')
    })

    it('preserves DISCHARGE_START and DISCHARGE_END in timeline and story has inicio/fin and duration', () => {
      const rows: RawEventRow[] = [
        row({ occurredAt: '2024-01-01T08:00:00', eventType: 'GATE_CHECKIN' }),
        row({ occurredAt: '2024-01-01T08:05:00', eventType: 'SCALE_IN' }),
        row({ occurredAt: '2024-01-01T08:10:00', eventType: 'SAMPLE_SOLID_TAKEN' }),
        row({ occurredAt: '2024-01-01T08:15:00', eventType: 'LAB_RESULT_READY', labResult: 'OK' }),
        row({ occurredAt: '2024-01-01T08:35:00', eventType: 'DISCHARGE_START', unloadPoint: 'PIT_1' }),
        row({ occurredAt: '2024-01-01T09:05:00', eventType: 'DISCHARGE_END', unloadPoint: 'PIT_1', unloadQty: 25000 }),
        row({ occurredAt: '2024-01-01T09:10:00', eventType: 'SCALE_OUT' }),
        row({ occurredAt: '2024-01-01T09:15:00', eventType: 'EXIT' }),
      ]
      const trip = buildTripFromEvents(rows, SITE)
      const startEv = trip.timeline.filter((e) => e.eventType === 'DISCHARGE_START')
      const endEv = trip.timeline.filter((e) => e.eventType === 'DISCHARGE_END')
      expect(startEv).toHaveLength(1)
      expect(endEv).toHaveLength(1)
      expect(trip.story).toContain('Inicio descarga')
      expect(trip.story).toContain('Fin descarga')
      expect(trip.story).toMatch(/Duración \d+ min/)
    })
  })

  describe('buildStory', () => {
    it('includes ingreso, pesaje, resultado, fin descarga, egreso', () => {
      const events: NormalizedEvent[] = [
        { siteId: SITE, eventType: 'GATE_CHECKIN', occurredAt: '2024-01-01T08:00:00', raw: {} },
        { siteId: SITE, eventType: 'SCALE_IN', occurredAt: '2024-01-01T08:05:00', raw: { weightKg: 40000 } },
        { siteId: SITE, eventType: 'LAB_RESULT_READY', occurredAt: '2024-01-01T08:15:00', raw: { labResult: 'OK' } },
        { siteId: SITE, eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T08:45:00', raw: { unloadPoint: 'PIT_1' } },
        { siteId: SITE, eventType: 'EXIT', occurredAt: '2024-01-01T08:55:00', raw: {} },
      ]
      const story = buildStory(events)
      expect(story).toContain('Ingreso')
      expect(story).toContain('Pesaje')
      expect(story).toMatch(/Lab .* \(OK\)/)
      expect(story).toContain('Fin descarga')
      expect(story).toContain('Egreso')
    })

    it('shows Inicio descarga and Fin descarga with Duración when both START and END present', () => {
      const events: NormalizedEvent[] = [
        { siteId: SITE, eventType: 'GATE_CHECKIN', occurredAt: '2024-01-01T08:00:00', raw: {} },
        { siteId: SITE, eventType: 'DISCHARGE_START', occurredAt: '2024-01-01T08:30:00', raw: { unloadPoint: 'PIT_1' } },
        { siteId: SITE, eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T09:00:00', raw: { unloadPoint: 'PIT_1', unloadQty: 1000 } },
      ]
      const story = buildStory(events)
      expect(story).toContain('Inicio descarga')
      expect(story).toContain('Fin descarga')
      expect(story).toMatch(/Duración \d+ min/)
    })
  })

  describe('buildVisits preserves re-caladas and partial discharges (1:1)', () => {
    it('keeps all events in order: 2 C (re-calada) and 2 D (descargas)', () => {
      const events: NormalizedEvent[] = [
        { siteId: SITE, visitId: 'v1', eventType: 'GATE_CHECKIN', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SCALE_IN', occurredAt: '2024-01-01T08:05:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SAMPLE_SOLID_TAKEN', occurredAt: '2024-01-01T08:10:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'YARD_WAIT', occurredAt: '2024-01-01T08:12:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SAMPLE_SOLID_TAKEN', occurredAt: '2024-01-01T08:18:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'LAB_RESULT_READY', occurredAt: '2024-01-01T08:22:00Z', raw: { labResult: 'OK' } },
        { siteId: SITE, visitId: 'v1', eventType: 'DISCHARGE_START', occurredAt: '2024-01-01T08:35:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T08:50:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'DISCHARGE_START', occurredAt: '2024-01-01T08:55:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T09:10:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SCALE_OUT', occurredAt: '2024-01-01T09:15:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'EXIT', occurredAt: '2024-01-01T09:20:00Z', raw: {} },
      ]
      const visits = buildVisits(events, SITE)
      expect(visits).toHaveLength(1)
      const visit = visits[0]
      expect(visit.events).toHaveLength(events.length)
      const types = visit.events.map((e) => e.eventType)
      const expected = events.map((e) => e.eventType)
      expect(types).toEqual(expected)
    })

    it('sorts by occurredAt then eventType (tie-break)', () => {
      const events: NormalizedEvent[] = [
        { siteId: SITE, visitId: 'v1', eventType: 'GATE_CHECKIN', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SCALE_IN', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SAMPLE_SOLID_TAKEN', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'LAB_RESULT_READY', occurredAt: '2024-01-01T08:00:00Z', raw: { labResult: 'OK' } },
        { siteId: SITE, visitId: 'v1', eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'SCALE_OUT', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
        { siteId: SITE, visitId: 'v1', eventType: 'EXIT', occurredAt: '2024-01-01T08:00:00Z', raw: {} },
      ]
      const visits = buildVisits(events, SITE)
      const sorted = visits[0].events.map((e) => e.eventType).slice().sort()
      expect(sorted).toEqual([
        'DISCHARGE_END', 'EXIT', 'GATE_CHECKIN', 'LAB_RESULT_READY', 'SAMPLE_SOLID_TAKEN', 'SCALE_IN', 'SCALE_OUT',
      ])
    })
  })

  describe('buildTripSummaryFromEvents', () => {
    it('returns path, story, status from NormalizedEvent[]', () => {
      const events: NormalizedEvent[] = [
        { siteId: SITE, eventType: 'GATE_CHECKIN', occurredAt: '2024-01-01T08:00:00', raw: {} },
        { siteId: SITE, eventType: 'SCALE_IN', occurredAt: '2024-01-01T08:05:00', raw: {} },
        { siteId: SITE, eventType: 'SAMPLE_SOLID_TAKEN', occurredAt: '2024-01-01T08:10:00', raw: {} },
        { siteId: SITE, eventType: 'LAB_RESULT_READY', occurredAt: '2024-01-01T08:15:00', raw: { resultado: 'aprobado' } },
        { siteId: SITE, eventType: 'DISCHARGE_END', occurredAt: '2024-01-01T08:45:00', raw: {} },
        { siteId: SITE, eventType: 'SCALE_OUT', occurredAt: '2024-01-01T08:50:00', raw: {} },
        { siteId: SITE, eventType: 'EXIT', occurredAt: '2024-01-01T08:55:00', raw: {} },
      ]
      const summary = buildTripSummaryFromEvents(events)
      expect(summary.path).toBe('ABCDEF')
      expect(summary.pathDisplay).toBe('A-B-C-D-E-F')
      expect(summary.status).toBe('VALID_IDEAL')
      expect(summary.story).toContain('Ingreso')
    })
  })
})
