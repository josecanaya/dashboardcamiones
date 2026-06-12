import { describe, expect, it } from 'vitest'
import { createPlateMatchCache, plateMatchKindCached } from './etlPlateMatchCache'

describe('plateMatchKindCached', () => {
  it('cachea resultado exacto', () => {
    const cache = createPlateMatchCache()
    const a = plateMatchKindCached('AB123CD', 'AB123CD', 0.82, cache)
    const b = plateMatchKindCached('AB123CD', 'AB123CD', 0.82, cache)
    expect(a).toBe('exact')
    expect(b).toBe('exact')
    expect(cache.size).toBe(1)
  })
})
