import { isLikelyOcrPlateMatch, normalizePlateStrict, plateSimilarityScore } from '../../../services/circuitPlateOcr'

export type PlateMatchKind = 'exact' | 'fuzzy' | null

export type PlateMatchCache = Map<string, PlateMatchKind>

export function createPlateMatchCache(): PlateMatchCache {
  return new Map()
}

export function plateMatchKindCached(
  plateJ: string,
  plateM: string,
  ocrThreshold: number,
  cache: PlateMatchCache
): PlateMatchKind {
  const j = normalizePlateStrict(plateJ)
  const m = normalizePlateStrict(plateM)
  if (!j || !m) return null
  const key = `${j}|${m}|${ocrThreshold}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let kind: PlateMatchKind = null
  if (j === m) kind = 'exact'
  else {
    const sim = plateSimilarityScore(j, m)
    if (sim >= ocrThreshold || isLikelyOcrPlateMatch(j, m)) kind = 'fuzzy'
  }
  cache.set(key, kind)
  return kind
}
