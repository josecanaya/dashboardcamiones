import { describe, it, expect } from 'vitest'
import { selectScatterPoints, selectScatterStats, selectPieData } from './selectors'
import type { ReconstructedVisit } from '../domain/events'
import type { NormalizedEvent } from '../domain/events'

const SITE = 'san_lorenzo' as const

function ev(eventType: NormalizedEvent['eventType'], occurredAt: string): NormalizedEvent {
  return {
    siteId: SITE,
    eventType,
    occurredAt,
    raw: {},
  }
}

function visit(visitId: string, events: NormalizedEvent[]): ReconstructedVisit {
  const startAt = events[0]?.occurredAt ?? ''
  const endAt = events.length > 0 ? events[events.length - 1].occurredAt : undefined
  return {
    visitId,
    siteId: SITE,
    events,
    startAt,
    endAt,
    status: events.some((e) => e.eventType === 'EXIT') ? 'CLOSED' : 'OPEN',
    metrics: {},
  }
}

describe('selectScatterPoints', () => {
  it('only PERFECT and VALID closed visits are in scatter (no Invalid, no Open)', () => {
    const closedFullPath = visit('v1', [
      ev('GATE_CHECKIN', '2024-01-01T08:00:00Z'),
      ev('SCALE_IN', '2024-01-01T08:05:00Z'),
      ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00Z'),
      ev('LAB_RESULT_READY', '2024-01-01T08:15:00Z'),
      ev('DISCHARGE_END', '2024-01-01T08:45:00Z'),
      ev('SCALE_OUT', '2024-01-01T08:50:00Z'),
      ev('EXIT', '2024-01-01T08:55:00Z'),
    ])
    const points = selectScatterPoints([closedFullPath])
    expect(points.every((p) => !p.isOpen && (p.status === 'PERFECT' || p.status === 'VALID'))).toBe(true)
    if (points.length > 0) expect(points[0].pathKey).toBeDefined()
  })

  it('open visit (no EXIT) is excluded from scatter', () => {
    const v = visit('v2', [
      ev('GATE_CHECKIN', '2024-01-01T09:00:00Z'),
      ev('SCALE_IN', '2024-01-01T09:05:00Z'),
      ev('SAMPLE_SOLID_TAKEN', '2024-01-01T09:10:00Z'),
    ])
    const points = selectScatterPoints([v])
    expect(points).toHaveLength(0)
  })

  it('visit without A (GATE_CHECKIN) is not in scatter', () => {
    const v = visit('v3', [
      ev('SCALE_IN', '2024-01-01T09:00:00Z'),
      ev('EXIT', '2024-01-01T09:05:00Z'),
    ])
    const points = selectScatterPoints([v])
    expect(points).toHaveLength(0)
  })

  it('selectScatterStats uses scatter points for p50/p95', () => {
    const closed = visit('c1', [
      ev('GATE_CHECKIN', '2024-01-01T08:00:00Z'),
      ev('EXIT', '2024-01-01T09:00:00Z'),
    ])
    const open = visit('o1', [
      ev('GATE_CHECKIN', '2024-01-01T09:00:00Z'),
    ])
    const points = selectScatterPoints([closed, open])
    expect(points.every((p) => !p.isOpen && (p.status === 'PERFECT' || p.status === 'VALID'))).toBe(true)
    const stats = selectScatterStats(points)
    expect(stats.p50).toBeGreaterThanOrEqual(0)
    expect(stats.p95).toBeGreaterThanOrEqual(0)
  })
})

describe('selectPieData', () => {
  it('counts only closed visits (with EXIT) in pie', () => {
    const closed = visit('c1', [
      ev('GATE_CHECKIN', '2024-01-01T08:00:00Z'),
      ev('SCALE_IN', '2024-01-01T08:05:00Z'),
      ev('SAMPLE_SOLID_TAKEN', '2024-01-01T08:10:00Z'),
      ev('LAB_RESULT_READY', '2024-01-01T08:15:00Z'),
      ev('DISCHARGE_END', '2024-01-01T08:45:00Z'),
      ev('SCALE_OUT', '2024-01-01T08:50:00Z'),
      ev('EXIT', '2024-01-01T08:55:00Z'),
    ])
    const open = visit('o1', [
      ev('GATE_CHECKIN', '2024-01-01T09:00:00Z'),
      ev('SCALE_IN', '2024-01-01T09:05:00Z'),
    ])
    const pie = selectPieData([closed, open])
    const total = pie.reduce((s, seg) => s + seg.value, 0)
    expect(total).toBe(1)
  })
})
