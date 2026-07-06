import { isLikelyOcrPlateMatch, normalizePlateStrict, plateSimilarityScore } from '../../../services/circuitPlateOcr'

export type PlateMatchKind = 'exact' | 'fuzzy' | null

/** V8 limita Map/Set a ~2^24 entradas; el merge Excel×Truckflow puede superarlo sin tope. */
export const PLATE_MATCH_CACHE_DEFAULT_MAX = 1_500_000

export type PlateMatchCache = {
  entries: Map<string, PlateMatchKind>
  maxEntries: number
}

export function createPlateMatchCache(maxEntries?: number): PlateMatchCache {
  return { entries: new Map(), maxEntries: maxEntries ?? PLATE_MATCH_CACHE_DEFAULT_MAX }
}

export function plateMatchCacheSize(cache: PlateMatchCache): number {
  return cache.entries.size
}

export function clearPlateMatchCache(cache: PlateMatchCache): void {
  cache.entries.clear()
}

/** Elimina entradas más antiguas (Map mantiene orden de inserción). */
export function prunePlateMatchCache(cache: PlateMatchCache, targetSize?: number): void {
  const target = targetSize ?? Math.floor(cache.maxEntries * 0.65)
  while (cache.entries.size > target) {
    const first = cache.entries.keys().next().value
    if (first === undefined) break
    cache.entries.delete(first)
  }
}

function ensurePlateMatchCacheRoom(cache: PlateMatchCache): void {
  if (cache.entries.size < cache.maxEntries) return
  prunePlateMatchCache(cache)
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
  const hit = cache.entries.get(key)
  if (hit !== undefined) return hit
  let kind: PlateMatchKind = null
  if (j === m) kind = 'exact'
  else {
    const sim = plateSimilarityScore(j, m)
    if (sim >= ocrThreshold || isLikelyOcrPlateMatch(j, m)) kind = 'fuzzy'
  }
  ensurePlateMatchCacheRoom(cache)
  cache.entries.set(key, kind)
  return kind
}
