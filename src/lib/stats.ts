/**
 * Estadísticas simples para scatter y referencias (mean, percentiles).
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Percentil (0-100). p50 = mediana. */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const idx = (p / 100) * (sortedValues.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedValues[lo]
  const w = idx - lo
  return sortedValues[lo] * (1 - w) + sortedValues[hi] * w
}

export function p50(sortedValues: number[]): number {
  return percentile(sortedValues, 50)
}

export function p95(sortedValues: number[]): number {
  return percentile(sortedValues, 95)
}
