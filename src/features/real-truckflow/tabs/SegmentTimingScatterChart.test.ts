import { describe, expect, it } from 'vitest'
import { buildSegmentTimingBinStackPoints } from './SegmentTimingScatterChart'

describe('buildSegmentTimingBinStackPoints', () => {
  it('apila camiones por bin de tiempo en Y (como histograma con puntos)', () => {
    const points = buildSegmentTimingBinStackPoints([12, 13, 48, 49, 50], 5)
    expect(points).toHaveLength(5)

    const bin10 = points.filter((p) => p.binStart === 10)
    expect(bin10.map((p) => p.y).sort()).toEqual([1, 2])

    const bin45 = points.filter((p) => p.binStart === 45)
    expect(bin45.map((p) => p.y).sort()).toEqual([1, 2])

    const bin50 = points.filter((p) => p.binStart === 50)
    expect(bin50.map((p) => p.y)).toEqual([1])
  })

  it('permite varios puntos en el mismo X con distinto Y dentro del bin', () => {
    const points = buildSegmentTimingBinStackPoints([100, 100.5, 101], 5)
    expect(points.every((p) => p.binStart === 100)).toBe(true)
    expect(new Set(points.map((p) => p.y)).size).toBe(3)
  })
})
