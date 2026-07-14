/**
 * Reglas de oro de anomalías de comportamiento (independientes de cobertura LPR).
 * Un journey puede conservar su circuito R* y a la vez marcar BEHAVIORAL.
 */

import type { AnomalyReason } from './anomalyClassifier'

export const GOLDEN_ANOMALY_REASONS = [
  'SL_RIC_VUELTA_RAPIDA_NO_PELLET',
  'REGRESION_CALADA_PREINGRESO',
  'SKIP_PUNTO_LAPSO_EXTREMO',
  'RIC_SL_DEMORA',
] as const

export type GoldenAnomalyReason = (typeof GOLDEN_ANOMALY_REASONS)[number]

export function isGoldenAnomalyReason(reason: string | null | undefined): reason is GoldenAnomalyReason {
  return GOLDEN_ANOMALY_REASONS.includes(String(reason ?? '').trim() as GoldenAnomalyReason)
}

/** Circuitos pellet / tolvas 09–11: viaje SL→Ric rápido es legítimo. */
export const PELLET_TRANSILE_CIRCUIT_CODES = new Set(['R30', 'R31', 'R32'])

/** Ventana G1: SL → Ric ≤ 30 min. */
export const GOLDEN_SL_RIC_MAX_MS = 30 * 60 * 1000
/** G2: Calada → Preingreso < 20 min. */
export const GOLDEN_CALADA_PREINGRESO_MAX_MS = 20 * 60 * 1000
/** G3: gap flanqueante con skip > 4 h. */
export const GOLDEN_SKIP_GAP_MAX_MS = 240 * 60 * 1000
/** G4: Ric EGRESO → SL_INGRESO > 30 min. */
export const GOLDEN_RIC_SL_MIN_MS = 30 * 60 * 1000

const SL_EXIT_LOGICAL = new Set(['SL_EGRESO', 'SL_BALANZA_SALIDA'])
const RIC_RETURN_LOGICAL = new Set(['INGRESO', 'PREINGRESO', 'CALADA'])

export type GoldenTimelinePoint = {
  t: number
  logicalCode: string
  siteId?: string
  journeyUid?: string
}

export type GoldenAnomalyHit = {
  reason: GoldenAnomalyReason
  kind: 'BEHAVIORAL'
  detail: string
  deltaMinutes?: number
  fromLogical?: string
  toLogical?: string
  circuitCode?: string
}

export type EvaluateGoldenAnomalyInput = {
  /** Timeline del journey (eventos frontales normalizados). */
  points: readonly GoldenTimelinePoint[]
  /**
   * Timeline de la misma patente (puede cruzar journeys). Si falta, se usa `points`.
   * Necesario para G1/G4 interplanta.
   */
  platePoints?: readonly GoldenTimelinePoint[]
  circuitCode?: string
  /** Plantilla lógica esperada del circuito (ej. DEFAULT_CIRCUIT_MATRIX). */
  expectedLogicalSequence?: readonly string[]
  missingExpectedPoints?: readonly string[]
  /** True si Excel/circuito indica pellet / R30–R32. */
  isPelletTransile?: boolean
}

function roundMin(ms: number): number {
  return Math.round((ms / 60000) * 10) / 10
}

function collapseConsecutive(points: readonly GoldenTimelinePoint[]): GoldenTimelinePoint[] {
  const out: GoldenTimelinePoint[] = []
  for (const p of points) {
    const code = String(p.logicalCode ?? '').trim()
    if (!code || code.includes('TRASERA_EXCLUIDA')) continue
    const last = out[out.length - 1]
    if (last && last.logicalCode === code) continue
    out.push({ ...p, logicalCode: code })
  }
  return out
}

function sortedPoints(points: readonly GoldenTimelinePoint[]): GoldenTimelinePoint[] {
  return [...points]
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
}

/** G1: salida SL seguida de ingreso Ric ≤ 30 min, y no es pellet. */
export function detectSlRicQuickReturnNoPellet(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { maxMs?: number; isPelletTransile?: boolean }
): GoldenAnomalyHit | null {
  if (opts?.isPelletTransile) return null
  const maxMs = opts?.maxMs ?? GOLDEN_SL_RIC_MAX_MS
  const list = sortedPoints(platePoints)
  for (let i = 0; i < list.length; i++) {
    const row = list[i]!
    if (row.siteId === 'ricardone') continue
    if (!SL_EXIT_LOGICAL.has(row.logicalCode)) continue
    if (row.siteId && row.siteId !== 'san_lorenzo') continue
    for (let j = i + 1; j < list.length; j++) {
      const next = list[j]!
      const delta = next.t - row.t
      if (delta > maxMs) break
      if (delta <= 0) continue
      const ricSite = !next.siteId || next.siteId === 'ricardone'
      if (!ricSite || !RIC_RETURN_LOGICAL.has(next.logicalCode)) continue
      return {
        reason: 'SL_RIC_VUELTA_RAPIDA_NO_PELLET',
        kind: 'BEHAVIORAL',
        detail: `Salida SL→Ricardone en ${roundMin(delta)} min (≤${roundMin(maxMs)}) sin pellet`,
        deltaMinutes: roundMin(delta),
        fromLogical: row.logicalCode,
        toLogical: next.logicalCode,
      }
    }
  }
  return null
}

/** G2: CALADA seguida de PREINGRESO en < 20 min (regresión de secuencia). */
export function detectCaladaToPreingresoRegression(
  points: readonly GoldenTimelinePoint[],
  opts?: { maxMs?: number }
): GoldenAnomalyHit | null {
  const maxMs = opts?.maxMs ?? GOLDEN_CALADA_PREINGRESO_MAX_MS
  const collapsed = collapseConsecutive(sortedPoints(points))
  for (let i = 0; i < collapsed.length - 1; i++) {
    const a = collapsed[i]!
    const b = collapsed[i + 1]!
    if (a.logicalCode !== 'CALADA' || b.logicalCode !== 'PREINGRESO') continue
    const delta = b.t - a.t
    if (delta <= 0 || delta >= maxMs) continue
    return {
      reason: 'REGRESION_CALADA_PREINGRESO',
      kind: 'BEHAVIORAL',
      detail: `Calada→Preingreso en ${roundMin(delta)} min (<${roundMin(maxMs)})`,
      deltaMinutes: roundMin(delta),
      fromLogical: 'CALADA',
      toLogical: 'PREINGRESO',
    }
  }
  return null
}

/**
 * G3: faltó al menos un hito esperado y el gap entre flanqueantes observados supera el umbral.
 */
export function detectSkippedPointWithExtremeGap(
  points: readonly GoldenTimelinePoint[],
  expectedLogicalSequence: readonly string[],
  missingExpectedPoints: readonly string[],
  opts?: { maxGapMs?: number }
): GoldenAnomalyHit | null {
  if (!expectedLogicalSequence.length || !missingExpectedPoints.length) return null
  const maxGapMs = opts?.maxGapMs ?? GOLDEN_SKIP_GAP_MAX_MS
  const missing = new Set(missingExpectedPoints.map((x) => String(x).trim()).filter(Boolean))
  if (!missing.size) return null

  const tplIndex = new Map<string, number>()
  expectedLogicalSequence.forEach((code, i) => {
    const c = String(code).trim()
    if (c && !tplIndex.has(c)) tplIndex.set(c, i)
  })

  const observed = collapseConsecutive(sortedPoints(points)).filter((p) => tplIndex.has(p.logicalCode))
  for (let i = 0; i < observed.length - 1; i++) {
    const a = observed[i]!
    const b = observed[i + 1]!
    const posA = tplIndex.get(a.logicalCode)
    const posB = tplIndex.get(b.logicalCode)
    if (posA == null || posB == null || posB <= posA) continue
    const between = expectedLogicalSequence.slice(posA + 1, posB).map((x) => String(x).trim())
    const skipped = between.filter((c) => missing.has(c))
    if (!skipped.length) continue
    const delta = b.t - a.t
    if (delta <= maxGapMs) continue
    return {
      reason: 'SKIP_PUNTO_LAPSO_EXTREMO',
      kind: 'BEHAVIORAL',
      detail: `Faltó ${skipped.join('+')} entre ${a.logicalCode}→${b.logicalCode} (${roundMin(delta)} min > ${roundMin(maxGapMs)})`,
      deltaMinutes: roundMin(delta),
      fromLogical: a.logicalCode,
      toLogical: b.logicalCode,
    }
  }
  return null
}

/**
 * G4: EGRESO Ricardone → SL_INGRESO con Δt > 30 min (demora excesiva del puente).
 * Busca el primer SL_INGRESO posterior a cada EGRESO Ric.
 */
export function detectRicToSlTravelTooSlow(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { minMs?: number }
): GoldenAnomalyHit | null {
  const minMs = opts?.minMs ?? GOLDEN_RIC_SL_MIN_MS
  const list = sortedPoints(platePoints)
  for (let i = 0; i < list.length; i++) {
    const eg = list[i]!
    if (eg.logicalCode !== 'EGRESO') continue
    if (eg.siteId && eg.siteId !== 'ricardone') continue
    for (let j = i + 1; j < list.length; j++) {
      const sl = list[j]!
      if (sl.logicalCode !== 'SL_INGRESO') continue
      if (sl.siteId && sl.siteId !== 'san_lorenzo') continue
      const delta = sl.t - eg.t
      if (delta <= minMs) break
      return {
        reason: 'RIC_SL_DEMORA',
        kind: 'BEHAVIORAL',
        detail: `Ric→SL en ${roundMin(delta)} min (>${roundMin(minMs)})`,
        deltaMinutes: roundMin(delta),
        fromLogical: 'EGRESO',
        toLogical: 'SL_INGRESO',
      }
    }
  }
  return null
}

export function isPelletCircuitCode(circuitCode: string | null | undefined): boolean {
  return PELLET_TRANSILE_CIRCUIT_CODES.has(String(circuitCode ?? '').trim().toUpperCase())
}

/**
 * Evalúa G1–G4. Prioridad: G1 → G2 → G3 → G4 (primera hit gana para `anomaly_kind_reason`).
 * Devuelve todas las hits; el cableado usa la primera.
 */
export function evaluateGoldenAnomalyRules(input: EvaluateGoldenAnomalyInput): GoldenAnomalyHit[] {
  const platePts = input.platePoints?.length ? input.platePoints : input.points
  const isPellet =
    input.isPelletTransile === true || isPelletCircuitCode(input.circuitCode)
  const hits: GoldenAnomalyHit[] = []

  const g1 = detectSlRicQuickReturnNoPellet(platePts, { isPelletTransile: isPellet })
  if (g1) hits.push({ ...g1, circuitCode: input.circuitCode })

  const g2 = detectCaladaToPreingresoRegression(input.points)
  if (g2) hits.push({ ...g2, circuitCode: input.circuitCode })

  const g3 = detectSkippedPointWithExtremeGap(
    input.points,
    input.expectedLogicalSequence ?? [],
    input.missingExpectedPoints ?? []
  )
  if (g3) hits.push({ ...g3, circuitCode: input.circuitCode })

  const g4 = detectRicToSlTravelTooSlow(platePts)
  if (g4) hits.push({ ...g4, circuitCode: input.circuitCode })

  return hits
}

/** Convierte hit de oro a AnomalyReason del clasificador. */
export function goldenHitToAnomalyReason(hit: GoldenAnomalyHit): AnomalyReason {
  return hit.reason
}
