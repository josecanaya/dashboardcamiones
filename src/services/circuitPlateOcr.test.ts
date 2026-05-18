import { describe, it, expect } from 'vitest'
import { normalizePlateStrict, plateSimilarityScore, isLikelyOcrPlateMatch, weightedOcrLevenshtein } from './circuitPlateOcr'

describe('circuitPlateOcr', () => {
  it('normalizePlateStrict limpia formato', () => {
    expect(normalizePlateStrict(' aa-702 tr ')).toBe('AA702TR')
  })

  it('errores OCR clásicos alta similitud', () => {
    expect(weightedOcrLevenshtein('AA702TR', 'AA7O2TR')).toBe(0)
    expect(plateSimilarityScore('AA702TR', 'AA7O2TR')).toBeGreaterThanOrEqual(0.9)
    expect(isLikelyOcrPlateMatch('AA702TR', 'AA7O2TR')).toBe(true)
  })

  it('ejemplos usuario: lecturas cercanas siguen siendo candidatos', () => {
    expect(isLikelyOcrPlateMatch('AA702TR', 'AA702TQ')).toBe(true)
    expect(isLikelyOcrPlateMatch('AA702TR', 'AA702IR')).toBe(true)
  })
})
