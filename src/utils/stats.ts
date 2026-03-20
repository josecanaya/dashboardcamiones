/**
 * Utilidades estadísticas reutilizables para KPIs operativos.
 * Compatible con lib/stats.ts existente.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = (sorted.length - 1) / 2
  return (sorted[Math.floor(mid)]! + sorted[Math.ceil(mid)]!) / 2
}

export function mode(values: number[]): number {
  if (values.length === 0) return 0
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let maxCount = 0
  let modeVal = values[0]!
  for (const [v, c] of counts) {
    if (c > maxCount) {
      maxCount = c
      modeVal = v
    }
  }
  return modeVal
}

export function min(values: number[]): number {
  if (values.length === 0) return 0
  return Math.min(...values)
}

export function max(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values)
}

export function std(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Coeficiente de variación (CV) = std/mean * 100. Indica variabilidad relativa. */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values)
  if (m === 0) return 0
  return (std(values) / m) * 100
}

/** Percentil (0-100). p50 = mediana. */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const sorted = [...sortedValues].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const w = idx - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

export function p50(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 50)
}

export function p5(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 5)
}

export function p90(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 90)
}

export function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return percentile(sorted, 95)
}

/** Rango intercuartílico (IQR) = Q3 - Q1 */
export function iqr(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  return q3 - q1
}

/** Z-score: (x - mean) / std. Indica cuántas desviaciones estándar está x del promedio. */
export function zScore(values: number[], x: number): number {
  const s = std(values)
  if (s === 0) return 0
  return (x - mean(values)) / s
}

export type OutlierClass = 'normal' | 'alto_desvio' | 'outlier' | 'extremo'

/** Clasificación de un valor según desviación respecto del promedio. */
export function classifyOutlier(z: number): OutlierClass {
  const abs = Math.abs(z)
  if (abs <= 2) return 'normal'
  if (abs <= 3) return 'alto_desvio'
  if (abs <= 4) return 'outlier'
  return 'extremo'
}

/** Detecta outliers por método IQR. Retorna índices de valores atípicos. */
export function detectOutliersIqr(values: number[]): number[] {
  if (values.length < 4) return []
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = percentile(sorted, 25)
  const q3 = percentile(sorted, 75)
  const iqrVal = q3 - q1
  const lower = q1 - 1.5 * iqrVal
  const upper = q3 + 1.5 * iqrVal
  return values.map((v, i) => (v < lower || v > upper ? i : -1)).filter((i) => i >= 0)
}

/** Detecta outliers por z-score (|z| > 3). Retorna índices. */
export function detectOutliersZScore(values: number[]): number[] {
  if (values.length < 3) return []
  const m = mean(values)
  const s = std(values)
  if (s === 0) return []
  return values
    .map((v, i) => (Math.abs((v - m) / s) > 3 ? i : -1))
    .filter((i) => i >= 0)
}

/** Puntos para curva de Gauss teórica. */
export function gaussianCurvePoints(
  mean: number,
  std: number,
  maxY: number,
  xMin: number,
  xMax: number,
  steps = 50
): Array<{ x: number; y: number }> {
  if (std <= 0) return []
  const result: Array<{ x: number; y: number }> = []
  const step = (xMax - xMin) / steps
  for (let i = 0; i <= steps; i++) {
    const x = xMin + i * step
    const z = (x - mean) / std
    const y = maxY * Math.exp(-0.5 * z * z)
    result.push({ x, y })
  }
  return result
}

/**
 * Kernel Density Estimation (KDE) — curva suave de densidad a partir de datos reales.
 * No asume distribución normal. Respeta sesgo, colas largas y multimodalidad.
 *
 * Método: kernel gaussiano con ancho de banda de Silverman.
 * K(u) = (1/√2π) exp(-u²/2)
 * f(x) = (1/(n·h)) Σ K((x - xi)/h)
 *
 * @param sample Datos de estadía (ej. horas)
 * @param xGrid Puntos donde evaluar la densidad
 * @param bandwidth Ancho de banda opcional (si no se pasa, usa regla de Silverman)
 * @returns Densidad en cada punto del grid (integral ≈ 1)
 */
export function kernelDensityEstimation(
  sample: number[],
  xGrid: number[],
  bandwidth?: number
): number[] {
  const n = sample.length
  if (n === 0 || xGrid.length === 0) return xGrid.map(() => 0)

  const m = mean(sample)
  const s = std(sample)
  const sigma = s > 0 ? s : Math.max(1e-6, (max(sample) - min(sample)) / 4 || 0.1)
  const h = bandwidth ?? Math.max(sigma * 1.06 * Math.pow(n, -0.2), sigma * 0.2)

  const K = (u: number) => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u)

  return xGrid.map((x) => {
    let sum = 0
    for (const xi of sample) {
      sum += K((x - xi) / h)
    }
    return sum / (n * h)
  })
}

/**
 * Genera puntos para una curva de densidad suave (KDE) lista para graficar.
 * Escala la densidad para que la curva sea comparable a frecuencias (altura visual).
 *
 * @param sample Datos en horas
 * @param numPoints Número de puntos del grid (más = más suave)
 * @param padding Extensión del rango en cada lado (en unidades de datos)
 */
export function kdeCurvePoints(
  sample: number[],
  numPoints = 80,
  padding = 0.1
): Array<{ x: number; density: number; freqSmoothed: number }> {
  if (sample.length === 0) return []

  const xMin = Math.max(0, min(sample) - padding)
  const xMax = max(sample) + padding
  const step = (xMax - xMin) / (numPoints - 1)
  const xGrid = Array.from({ length: numPoints }, (_, i) => xMin + i * step)

  const density = kernelDensityEstimation(sample, xGrid)

  const totalArea = density.reduce((acc, d, i) => {
    const w = i === 0 ? step / 2 : i === density.length - 1 ? step / 2 : step
    return acc + d * w
  }, 0)
  const scale = totalArea > 0 ? sample.length / totalArea : 1

  return xGrid.map((x, i) => ({
    x,
    density: density[i]!,
    freqSmoothed: density[i]! * scale,
  }))
}

/** Suavizado por media móvil (ventana 5). La curva acompaña a las barras. */
function smoothBarHeights(counts: number[], windowSize = 5): number[] {
  const half = Math.floor(windowSize / 2)
  return counts.map((_, i) => {
    let sum = 0
    let n = 0
    for (let k = i - half; k <= i + half; k++) {
      if (k >= 0 && k < counts.length) {
        sum += counts[k]!
        n++
      }
    }
    return n > 0 ? sum / n : 0
  })
}

/** Histograma con barras cada 10 min + curva suavizada. Rango: 0.5h a 15h. */
export function histogramWithKde(
  sample: number[],
  binSizeMinutes = 10,
  smoothWindow = 5
): Array<{ x: number; count: number; freqSmoothed: number }> {
  if (sample.length === 0) return []
  const binSizeHours = binSizeMinutes / 60
  const rangeHours = 23.5 // 0.5 a 24 h
  const numBins = Math.ceil(rangeHours * 60 / binSizeMinutes)
  const binCenters = Array.from({ length: numBins }, (_, i) => 0.5 + (i + 0.5) * binSizeHours)
  const counts = new Array<number>(numBins).fill(0)
  for (const v of sample) {
    const idx = Math.min(numBins - 1, Math.max(0, Math.floor((v - 0.5) / binSizeHours)))
    counts[idx]++
  }
  const smoothed = smoothBarHeights(counts, smoothWindow)
  return binCenters.map((x, i) => ({
    x: Math.round(x * 100) / 100,
    count: counts[i]!,
    freqSmoothed: smoothed[i]!,
  }))
}

/** Bins para histograma. */
export function histogramBins(
  values: number[],
  binSize: number,
  roundBin?: (v: number) => number
): Map<number, number> {
  const round = roundBin ?? ((v) => Math.round(v * 10) / 10)
  const byBin = new Map<number, number>()
  for (const v of values) {
    const binStart = round(Math.floor(v / binSize) * binSize)
    byBin.set(binStart, (byBin.get(binStart) ?? 0) + 1)
  }
  return byBin
}
