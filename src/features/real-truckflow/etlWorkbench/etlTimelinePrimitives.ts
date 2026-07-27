/**
 * Primitivas de timeline de tramos: colapsado de puntos, selección del grupo coherente de
 * segmentos y construcción de la línea de tiempo lógica. Genérico — no sabe de San Lorenzo
 * ni de circuitos concretos.
 *
 * Extraído de `etlSegmentTiming.ts` (god-file) como módulo leaf, para que el enriquecimiento
 * San Lorenzo pueda apoyarse en estas primitivas sin crear un ciclo contra el archivo grande.
 * `etlSegmentTiming` re-exporta su superficie pública original.
 */
import { formatArgentinaIsoFromMs, parseTimestampMs } from './etlTimestampNormalize'
import {
  BALANZA_STAY_MIN_MINUTES,
  BALANZA_STAY_ROLLUP_TRANSITION,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  MIN_SEGMENT_DURATION_MINUTES,
  OPERATIONAL_TRIP_GAP_MAX_MINUTES,
  maxAllowedMinutesForTransition,
} from './etlSegmentTimingRules'
export type CollapsedLogicalPoint = { code: string; occurredAt: string }

export type TimedLogicalPoint = CollapsedLogicalPoint

export function collapseTimedPoints(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  const out: TimedLogicalPoint[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last?.code === p.code) continue
    out.push(p)
  }
  return out
}

export function isoLocalFromMs(ms: number): string {
  return formatArgentinaIsoFromMs(ms)
}

export function inferMidpointBetweenMs(fromMs: number, toMs: number, minOffsetMs = 60_000, maxOffsetMs = 30 * 60_000): string {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return ''
  const span = toMs - fromMs
  const offsetMs = Math.min(Math.max(Math.floor(span / 2), minOffsetMs), maxOffsetMs)
  return isoLocalFromMs(fromMs + offsetMs)
}

export type TimedSegmentInput = {
  segment_from: string
  segment_to: string
  segment_start_time: string
  segment_end_time: string
}

function segmentTimeBounds(seg: TimedSegmentInput): { startMs: number; endMs: number } | null {
  const startMs = parseTimestampMs(String(seg.segment_start_time ?? ''))
  const endMs = parseTimestampMs(String(seg.segment_end_time ?? ''))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null
  return { startMs, endMs: Math.max(startMs, endMs) }
}

function scoreOperationalTimeSpan(
  minMs: number,
  maxMs: number,
  externalIngresoAt?: string,
  externalSalidaAt?: string
): number {
  const spanMin = (maxMs - minMs) / 60000
  let score = 0
  if (spanMin > INFERRED_KPI_ROLLUP_MAX_MINUTES) score -= 10_000
  const ingMs = parseTimestampMs(String(externalIngresoAt ?? ''))
  const salMs = parseTimestampMs(String(externalSalidaAt ?? ''))
  if (Number.isFinite(ingMs) && Number.isFinite(salMs)) {
    if (maxMs >= ingMs && minMs <= salMs) score += 1000
    score -= Math.abs((minMs + maxMs) / 2 - (ingMs + salMs) / 2) / 60000
  } else if (Number.isFinite(salMs)) {
    score -= Math.abs(maxMs - salMs) / 60000
  } else if (Number.isFinite(ingMs)) {
    score -= Math.abs(minMs - ingMs) / 60000
  }
  return score
}

/**
 * Separa tramos de viajes distintos (misma patente, >6 h de brecha) y conserva el cluster
 * que mejor coincide con ingreso/salida Excel.
 */
export function selectCoherentSegmentGroup(
  segments: TimedSegmentInput[],
  externalIngresoAt?: string,
  externalSalidaAt?: string,
  gapMaxMinutes = OPERATIONAL_TRIP_GAP_MAX_MINUTES
): TimedSegmentInput[] {
  if (segments.length <= 1) return segments

  const ingMs = parseTimestampMs(String(externalIngresoAt ?? ''))
  let scoped = segments
  if (Number.isFinite(ingMs)) {
    const cutoffMs = ingMs - 30 * 60_000
    const afterIngreso = segments.filter((seg) => {
      const bounds = segmentTimeBounds(seg)
      if (!bounds) return true
      return bounds.endMs >= cutoffMs
    })
    if (afterIngreso.length) scoped = afterIngreso
  }

  const withBounds = scoped
    .map((seg) => ({ seg, bounds: segmentTimeBounds(seg) }))
    .filter(
      (x): x is { seg: TimedSegmentInput; bounds: { startMs: number; endMs: number } } =>
        x.bounds !== null
    )
    .sort((a, b) => a.bounds.startMs - b.bounds.startMs)

  if (!withBounds.length) return segments

  const gapMs = gapMaxMinutes * 60000
  const clusters: Array<typeof withBounds> = [[withBounds[0]!]]
  for (let i = 1; i < withBounds.length; i++) {
    const item = withBounds[i]!
    const cluster = clusters[clusters.length - 1]!
    const prev = cluster[cluster.length - 1]!
    if (item.bounds.startMs - prev.bounds.endMs > gapMs) {
      clusters.push([item])
    } else {
      cluster.push(item)
    }
  }

  if (clusters.length === 1) return clusters[0]!.map((x) => x.seg)

  let bestCluster = clusters[0]!
  let bestScore = -Infinity
  for (const cluster of clusters) {
    const minS = Math.min(...cluster.map((x) => x.bounds.startMs))
    const maxE = Math.max(...cluster.map((x) => x.bounds.endMs))
    const score = scoreOperationalTimeSpan(minS, maxE, externalIngresoAt, externalSalidaAt)
    if (score > bestScore) {
      bestScore = score
      bestCluster = cluster
    }
  }
  return bestCluster.map((x) => x.seg)
}

/** Timeline lógico desde tramos con timestamps (merge Excel-first / fragmentado). */
export function buildTimedLogicalTimelineFromSegments(
  segments: TimedSegmentInput[],
  opts?: { externalIngresoAt?: string; externalSalidaAt?: string }
): TimedLogicalPoint[] {
  const coherent = selectCoherentSegmentGroup(
    segments,
    opts?.externalIngresoAt,
    opts?.externalSalidaAt
  )
  const pointTimes = new Map<string, string>()
  for (const seg of coherent) {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    const start = String(seg.segment_start_time ?? '').trim()
    const end = String(seg.segment_end_time ?? '').trim()
    if (from && start && Number.isFinite(parseTimestampMs(start))) {
      const prev = pointTimes.get(from)
      const startMs = parseTimestampMs(start)
      const prevMs = prev ? parseTimestampMs(prev) : Number.NaN
      if (!prev || (Number.isFinite(prevMs) && startMs < prevMs)) pointTimes.set(from, start)
    }
    if (to && end && Number.isFinite(parseTimestampMs(end))) {
      const prev = pointTimes.get(to)
      const endMs = parseTimestampMs(end)
      const prevMs = prev ? parseTimestampMs(prev) : Number.NaN
      if (!prev || (Number.isFinite(prevMs) && endMs > prevMs)) pointTimes.set(to, end)
    }
  }
  return collapseTimedPoints(
    [...pointTimes.entries()]
      .map(([code, occurredAt]) => ({ code, occurredAt }))
      .sort((a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt))
  )
}

/** Quita egresos SL de journeys fragmentados anteriores a balanza salida/ingreso. */

export type SegmentLeg = {
  journeyId: string
  plate: string
  executiveCircuitCode: string
  fromCode: string
  toCode: string
  durationMinutes: number
}

export function minutesBetweenIso(isoA: string, isoB: string): number {
  const a = parseTimestampMs(isoA)
  const b = parseTimestampMs(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN
  return (b - a) / 60000
}

export function isSlKpiTransition(fromCode?: string, toCode?: string): boolean {
  return Boolean(
    fromCode?.startsWith('SL_') || toCode?.startsWith('SL_')
  )
}

export function isBalanzaStayKpiTransition(fromCode?: string, toCode?: string): boolean {
  return (
    fromCode === BALANZA_STAY_ROLLUP_TRANSITION.from &&
    toCode === BALANZA_STAY_ROLLUP_TRANSITION.to
  )
}

export function isValidSegmentDuration(
  minutes: number,
  fromCode?: string,
  toCode?: string
): boolean {
  if (!Number.isFinite(minutes) || minutes <= 0) return false
  if (
    fromCode &&
    toCode &&
    isBalanzaStayKpiTransition(fromCode, toCode) &&
    minutes < BALANZA_STAY_MIN_MINUTES
  ) {
    return false
  }
  if (
    fromCode &&
    toCode &&
    isSlKpiTransition(fromCode, toCode) &&
    minutes <= MIN_SEGMENT_DURATION_MINUTES
  ) {
    return false
  }
  const max =
    fromCode && toCode ?
      maxAllowedMinutesForTransition(fromCode, toCode)
    : INFERRED_KPI_ROLLUP_MAX_MINUTES
  return minutes <= max
}
