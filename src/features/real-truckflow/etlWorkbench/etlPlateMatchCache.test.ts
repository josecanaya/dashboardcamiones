import { describe, expect, it } from 'vitest'
import {
  createPlateMatchCache,
  plateMatchCacheSize,
  plateMatchKindCached,
  prunePlateMatchCache,
} from './etlPlateMatchCache'

describe('plateMatchKindCached', () => {
  it('cachea resultado exacto', () => {
    const cache = createPlateMatchCache()
    const a = plateMatchKindCached('AB123CD', 'AB123CD', 0.82, cache)
    const b = plateMatchKindCached('AB123CD', 'AB123CD', 0.82, cache)
    expect(a).toBe('exact')
    expect(b).toBe('exact')
    expect(plateMatchCacheSize(cache)).toBe(1)
  })

  it('podar cache evita crecimiento ilimitado', () => {
    const cache = createPlateMatchCache(5)
    for (let i = 0; i < 20; i++) {
      plateMatchKindCached(`AA${i}111`, `BB${i}222`, 0.82, cache)
    }
    expect(plateMatchCacheSize(cache)).toBeLessThanOrEqual(5)
    prunePlateMatchCache(cache, 2)
    expect(plateMatchCacheSize(cache)).toBeLessThanOrEqual(2)
  })
})
