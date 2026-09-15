/**
 * Tests de resolveSectorStatus — una rama por caso (T08).
 */
import { describe, expect, it } from 'vitest'
import { resolveSectorStatus } from './status.mjs'

const edgeOnline = { status: 'online', lastEventAgeS: 30 }
const edgeOffline = { status: 'offline', lastEventAgeS: 10 }
const edgeStale = { status: 'degraded', lastEventAgeS: 901 }
const baseline = { rate60: 20, dwellP90Min: 40, samples: 10 }

describe('resolveSectorStatus', () => {
  it('no_data si Edge offline', () => {
    expect(
      resolveSectorStatus({ type: 'buffer', present: 10, delta40: 0 }, baseline, edgeOffline)
    ).toBe('no_data')
  })

  it('no_data si lastEventAgeS > 900', () => {
    expect(
      resolveSectorStatus({ type: 'process', present: 1, rate60: 20, capacity: 39 }, baseline, edgeStale)
    ).toBe('no_data')
  })

  it('buffer critical por delta40 >= 15', () => {
    expect(
      resolveSectorStatus(
        { type: 'buffer', present: 40, delta40: 15, dwellP90Min: 30 },
        baseline,
        edgeOnline
      )
    ).toBe('critical')
  })

  it('queue attention por dwellP90 > 1.5× baseline', () => {
    expect(
      resolveSectorStatus(
        { type: 'queue', present: 50, delta40: 0, dwellP90Min: 61 },
        baseline,
        edgeOnline
      )
    ).toBe('attention')
  })

  it('process critical por rate60 < 0.7× baseline', () => {
    expect(
      resolveSectorStatus(
        { type: 'process', present: 5, capacity: 39, rate60: 10 },
        baseline,
        edgeOnline
      )
    ).toBe('critical')
  })

  it('scale attention por present >= 0.85× capacity', () => {
    expect(
      resolveSectorStatus(
        { type: 'scale', present: 12, capacity: 14, rate60: 20 },
        baseline,
        edgeOnline
      )
    ).toBe('attention')
  })

  it('gate attention por rate bajo; nunca critical solo', () => {
    expect(
      resolveSectorStatus({ type: 'gate', present: 2, rate60: 5, capacity: 28 }, baseline, edgeOnline)
    ).toBe('attention')
    expect(
      resolveSectorStatus({ type: 'exit', present: 0, rate60: 0, capacity: 39 }, baseline, edgeOnline)
    ).toBe('attention')
  })

  it('sin baseline solo capacidad; sin ambos → normal', () => {
    expect(
      resolveSectorStatus(
        { type: 'load', present: 44, capacity: 44, rate60: 0 },
        null,
        edgeOnline
      )
    ).toBe('critical')
    expect(
      resolveSectorStatus(
        { type: 'load', present: 5, capacity: 44, rate60: 0 },
        null,
        edgeOnline
      )
    ).toBe('normal')
    expect(
      resolveSectorStatus({ type: 'buffer', present: 0, delta40: 0 }, null, edgeOnline)
    ).toBe('normal')
  })
})
