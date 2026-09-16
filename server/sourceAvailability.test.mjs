import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getSourceAvailability, inspectSourceFile } from './sourceAvailability.mjs'

let tmpRoot

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'source-availability-'))
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

function dayDir(day) {
  const dir = path.join(tmpRoot, day)
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeJson(dir, name, obj) {
  writeFileSync(path.join(dir, name), JSON.stringify(obj), 'utf8')
}

describe('inspectSourceFile', () => {
  it('missing file -> missing, count null', async () => {
    const dir = dayDir('2026-01-01')
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-01',
      'journey-event/list'
    )
    expect(result).toEqual({ state: 'missing', count: null, fetchedAt: null })
  })

  it('corrupt JSON -> error, count null', async () => {
    const dir = dayDir('2026-01-02')
    writeFileSync(path.join(dir, 'event-list.json'), '{ not valid json', 'utf8')
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-02',
      'journey-event/list'
    )
    expect(result).toEqual({ state: 'error', count: null, fetchedAt: null })
  })

  it('payload with non-empty error and records=[] -> error', async () => {
    const dir = dayDir('2026-01-03')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-03',
      endpoint: 'journey-event/list',
      siteFilter: null,
      error: 'boom',
      records: [],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-03',
      'journey-event/list'
    )
    expect(result.state).toBe('error')
    expect(result.count).toBeNull()
  })

  it('valid global daily export, empty -> available, count 0', async () => {
    const dir = dayDir('2026-01-04')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-04',
      fetchedAt: '2026-01-05T00:00:00.000Z',
      endpoint: 'journey-event/list',
      siteFilter: null,
      recordCount: 0,
      records: [],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-04',
      'journey-event/list'
    )
    expect(result).toEqual({
      state: 'available',
      count: 0,
      fetchedAt: '2026-01-05T00:00:00.000Z',
    })
  })

  it('valid global daily export, 3 rows -> available, count 3', async () => {
    const dir = dayDir('2026-01-05')
    writeJson(dir, 'alert-list.json', {
      day: '2026-01-05',
      fetchedAt: '2026-01-06T00:00:00.000Z',
      endpoint: 'alert/list',
      siteFilter: null,
      recordCount: 3,
      records: [{ id: 1 }, { id: 2 }, { id: 3 }],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'alert-list.json'),
      '2026-01-05',
      'alert/list'
    )
    expect(result).toEqual({
      state: 'available',
      count: 3,
      fetchedAt: '2026-01-06T00:00:00.000Z',
    })
  })

  it('daily export with siteFilter="RIC" -> partial', async () => {
    const dir = dayDir('2026-01-06')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-06',
      fetchedAt: '2026-01-07T00:00:00.000Z',
      endpoint: 'journey-event/list',
      siteFilter: 'RIC',
      recordCount: 2,
      records: [{ id: 1 }, { id: 2 }],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-06',
      'journey-event/list'
    )
    expect(result.state).toBe('partial')
    expect(result.count).toBe(2)
  })

  it('window payload with queryStart/queryEnd partial (not full day) -> partial', async () => {
    const dir = dayDir('2026-01-07')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-07',
      fetchedAt: '2026-01-07T12:00:00.000Z',
      endpoint: 'journey-event/list',
      siteFilter: null,
      queryStart: '2026-01-07T08:00:00',
      queryEnd: '2026-01-07T10:00:00',
      recordCount: 1,
      records: [{ id: 1 }],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-07',
      'journey-event/list'
    )
    expect(result.state).toBe('partial')
  })

  it('window payload covering the full day but without site indicator -> unknown', async () => {
    const dir = dayDir('2026-01-08')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-08',
      fetchedAt: '2026-01-08T23:59:59.000Z',
      endpoint: 'journey-event/list',
      queryStart: '2026-01-08T00:00:00',
      queryEnd: '2026-01-08T23:59:59',
      recordCount: 5,
      records: [1, 2, 3, 4, 5],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-08',
      'journey-event/list'
    )
    expect(result.state).toBe('unknown')
    expect(result.count).toBe(5)
  })

  it('window payload covering the full day WITH global site -> available', async () => {
    const dir = dayDir('2026-01-09')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-09',
      fetchedAt: '2026-01-09T23:59:59.000Z',
      endpoint: 'journey-event/list',
      siteFilter: null,
      queryStart: '2026-01-09T00:00:00',
      queryEnd: '2026-01-09T23:59:59',
      recordCount: 2,
      records: [1, 2],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-09',
      'journey-event/list'
    )
    expect(result.state).toBe('available')
    expect(result.count).toBe(2)
  })

  it('legacy: bare array of records with no wrapper metadata -> unknown', async () => {
    const dir = dayDir('2026-01-10')
    writeJson(dir, 'event-list.json', [{ id: 1 }, { id: 2 }])
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-10',
      'journey-event/list'
    )
    expect(result.state).toBe('unknown')
    expect(result.count).toBe(2)
    expect(result.fetchedAt).toBeNull()
  })

  it('legacy: wrapper object with records but no siteFilter/endpoint/query -> unknown', async () => {
    const dir = dayDir('2026-01-11')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-11',
      records: [{ id: 1 }],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-11',
      'journey-event/list'
    )
    expect(result.state).toBe('unknown')
    expect(result.count).toBe(1)
  })

  it('fetchedAt preserved when valid ISO, null when missing/invalid', async () => {
    const dir = dayDir('2026-01-12')
    writeJson(dir, 'event-list.json', {
      day: '2026-01-12',
      endpoint: 'journey-event/list',
      siteFilter: null,
      fetchedAt: 'not-a-date',
      records: [],
    })
    const result = await inspectSourceFile(
      path.join(dir, 'event-list.json'),
      '2026-01-12',
      'journey-event/list'
    )
    expect(result.fetchedAt).toBeNull()
  })
})

describe('getSourceAvailability', () => {
  it('returns ascending order, two entries per day, no records/baseUrl/absolute paths', async () => {
    const days = ['2026-02-03', '2026-02-01', '2026-02-02']

    // 2026-02-01: available day
    const dir1 = dayDir('2026-02-01')
    writeJson(dir1, 'event-list.json', {
      day: '2026-02-01',
      fetchedAt: '2026-02-02T00:00:00.000Z',
      endpoint: 'journey-event/list',
      siteFilter: null,
      baseUrl: 'http://sensitive-internal-host:8090',
      records: [{ id: 1 }],
    })
    writeJson(dir1, 'alert-list.json', {
      day: '2026-02-01',
      fetchedAt: '2026-02-02T00:00:00.000Z',
      endpoint: 'alert/list',
      siteFilter: null,
      records: [],
    })

    // 2026-02-02: missing both files (dir exists but empty).
    dayDir('2026-02-02')

    // 2026-02-03: mixed - events partial, alerts error
    const dir3 = dayDir('2026-02-03')
    writeJson(dir3, 'event-list.json', {
      day: '2026-02-03',
      endpoint: 'journey-event/list',
      siteFilter: 'RIC',
      records: [{ id: 1 }, { id: 2 }],
    })
    writeJson(dir3, 'alert-list.json', {
      day: '2026-02-03',
      endpoint: 'alert/list',
      error: 'timeout',
      records: [],
    })

    const result = await getSourceAvailability(tmpRoot, days)

    expect(result.map((r) => r.day)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03'])
    for (const row of result) {
      expect(row).toHaveProperty('events')
      expect(row).toHaveProperty('alerts')
      expect(row.events).not.toHaveProperty('records')
      expect(row.alerts).not.toHaveProperty('records')
    }

    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/baseUrl/i)
    expect(serialized).not.toMatch(/records/i)
    expect(serialized).not.toContain(tmpRoot)

    const day1 = result.find((r) => r.day === '2026-02-01')
    expect(day1.events.state).toBe('available')
    expect(day1.events.count).toBe(1)
    expect(day1.alerts.state).toBe('available')
    expect(day1.alerts.count).toBe(0)

    const day2 = result.find((r) => r.day === '2026-02-02')
    expect(day2.events.state).toBe('missing')
    expect(day2.alerts.state).toBe('missing')

    const day3 = result.find((r) => r.day === '2026-02-03')
    expect(day3.events.state).toBe('partial')
    expect(day3.alerts.state).toBe('error')
  })
})
