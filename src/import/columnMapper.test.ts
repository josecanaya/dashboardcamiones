import { describe, it, expect } from 'vitest'
import { mapRowsToNormalizedEvents } from './columnMapper'
import type { ColumnMapping } from './types'
import type { SiteId } from '../domain/sites'
import { buildVisits } from '../engine'
import { buildTripSummaryFromEvents } from '../engine'

const SITE: SiteId = 'san_lorenzo'

describe('mapRowsToNormalizedEvents', () => {
  const baseMapping: ColumnMapping = {
    timestamp: 'occurredAt',
    event: 'eventType',
    location: 'locationKey',
    visitId: 'visitId',
    plate: 'plate',
  }

  it('preserves raw.labResult when CSV has labResult column', () => {
    const rows = [
      {
        occurredAt: '2024-01-15T10:00:00Z',
        eventType: 'LAB_RESULT_READY',
        locationKey: 'LAB',
        visitId: 'v1',
        plate: 'ABC123',
        labResult: 'OK',
      },
    ]
    const events = mapRowsToNormalizedEvents(rows, SITE, { ...baseMapping })
    expect(events.length).toBe(1)
    expect(events[0].raw.labResult).toBe('OK')
    expect(events[0].raw.resultado).toBeUndefined()
    expect(events[0].eventType).toBe('LAB_RESULT_READY')
  })

  it('preserves raw.resultado when CSV has resultado column (overlayRawExtras)', () => {
    const rows = [
      {
        occurredAt: '2024-01-15T10:00:00Z',
        eventType: 'LAB_RESULT_READY',
        locationKey: 'LAB',
        visitId: 'v1',
        plate: 'ABC123',
        resultado: 'aprobado',
      },
    ]
    const events = mapRowsToNormalizedEvents(rows, SITE, { ...baseMapping })
    expect(events.length).toBe(1)
    expect(events[0].raw.resultado).toBe('aprobado')
    expect(events[0].raw.labResult).toBe('aprobado')
  })

  it('CALADA_OK produces LAB_RESULT_READY and raw.labResult OK', () => {
    const rows = [
      {
        occurredAt: '2024-01-15T10:00:00Z',
        eventType: 'CALADA_OK',
        locationKey: 'LAB',
        visitId: 'v1',
        plate: 'ABC123',
      },
    ]
    const events = mapRowsToNormalizedEvents(rows, SITE, { ...baseMapping })
    expect(events.length).toBe(1)
    expect(events[0].eventType).toBe('LAB_RESULT_READY')
    expect(events[0].raw.labResult).toBe('OK')
    expect(events[0].raw.resultado).toBe('OK')
  })

  it('CALADA_NO produces LAB_RESULT_READY and raw.labResult NO', () => {
    const rows = [
      {
        occurredAt: '2024-01-15T10:00:00Z',
        eventType: 'CALADA_NO',
        locationKey: 'LAB',
        visitId: 'v1',
        plate: 'ABC123',
      },
    ]
    const events = mapRowsToNormalizedEvents(rows, SITE, { ...baseMapping })
    expect(events.length).toBe(1)
    expect(events[0].eventType).toBe('LAB_RESULT_READY')
    expect(events[0].raw.labResult).toBe('NO')
    expect(events[0].raw.resultado).toBe('NO')
  })

  it('preserves weightKg, moisture, unloadPoint in raw (canonical keys)', () => {
    const rows = [
      {
        occurredAt: '2024-01-15T10:00:00Z',
        eventType: 'SCALE_IN',
        locationKey: 'SCALE_IN',
        visitId: 'v1',
        plate: 'ABC123',
        weightKg: 42000,
        moisture: 12.5,
        unloadPoint: 'PIT_1',
      },
    ]
    const events = mapRowsToNormalizedEvents(rows, SITE, { ...baseMapping })
    expect(events.length).toBe(1)
    expect(events[0].raw.weightKg).toBe(42000)
    expect(events[0].raw.moisture).toBe(12.5)
    expect(events[0].raw.unloadPoint).toBe('PIT_1')
  })

  it('one full valid visit yields VALID_IDEAL when labResult OK is present', () => {
    const rows = [
      { occurredAt: '2024-01-15T08:00:00Z', eventType: 'GATE_CHECKIN', locationKey: 'GATE', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T08:05:00Z', eventType: 'SCALE_IN', locationKey: 'SCALE_IN', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T08:10:00Z', eventType: 'SAMPLE_SOLID_TAKEN', locationKey: 'SAMPLE', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T08:15:00Z', eventType: 'LAB_RESULT_READY', locationKey: 'LAB', visitId: 'v1', plate: 'P1', labResult: 'OK' },
      { occurredAt: '2024-01-15T08:30:00Z', eventType: 'DISCHARGE_START', locationKey: 'PIT_1', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T09:00:00Z', eventType: 'DISCHARGE_END', locationKey: 'PIT_1', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T09:10:00Z', eventType: 'SCALE_OUT', locationKey: 'SCALE_OUT', visitId: 'v1', plate: 'P1' },
      { occurredAt: '2024-01-15T09:15:00Z', eventType: 'EXIT', locationKey: 'EXIT', visitId: 'v1', plate: 'P1' },
    ]
    const mapping: ColumnMapping = {
      timestamp: 'occurredAt',
      event: 'eventType',
      location: 'locationKey',
      visitId: 'visitId',
      plate: 'plate',
    }
    const events = mapRowsToNormalizedEvents(rows, SITE, mapping)
    expect(events.length).toBe(8)
    const labEv = events.find((e) => e.eventType === 'LAB_RESULT_READY')
    expect(labEv?.raw.labResult).toBe('OK')
    const visits = buildVisits(events, SITE)
    expect(visits.length).toBe(1)
    const summary = buildTripSummaryFromEvents(visits[0].events)
    expect(summary.status).toBe('VALID_IDEAL')
    expect(summary.path).toBe('ABCDEF')
  })
})
