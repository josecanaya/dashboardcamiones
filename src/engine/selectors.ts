/**
 * Selectores para gráficos: datos agregados desde TripResult (buildTripSummaryFromEvents).
 * No recalcular lógica en la UI.
 */

import type { ReconstructedVisit } from '../domain/events'
import type { TripValidationStatus } from '../validation'
import { buildTripSummaryFromEvents } from './eventStream'
import { p50, p95 } from '../lib/stats'

const DEBUG = typeof window !== 'undefined' && (window as unknown as { __ANALYTICS_DEBUG?: boolean }).__ANALYTICS_DEBUG === true

/** Status simplificado para UI: PERFECT (ideal), VALID (aceptable/sin descarga), INVALID. */
export type DisplayStatus = 'PERFECT' | 'VALID' | 'INVALID'

/** Color key para scatter: OPEN (abierta) o status de cerrada. */
export type ScatterColorKey = DisplayStatus | 'OPEN'

/**
 * Agrupa TripValidationStatus en tres buckets para la UI.
 * - VALID_IDEAL => PERFECT
 * - VALID_ACCEPTABLE | VALID_NO_DISCHARGE => VALID
 * - INVALID => INVALID
 */
export function bucketStatus(tripStatus: TripValidationStatus): DisplayStatus {
  if (tripStatus === 'VALID_IDEAL') return 'PERFECT'
  if (tripStatus === 'VALID_ACCEPTABLE' || tripStatus === 'VALID_NO_DISCHARGE') return 'VALID'
  return 'INVALID'
}

/**
 * Normaliza path/pathDisplay a una key estable para agrupar en bar chart.
 * - Quita espacios y guiones
 * - Quita paréntesis y su contenido: "A-B-C(OK)-D-E-F" => "ABCDEF", "A-B-G-C-D-E-F" => "ABGCDEF"
 * - Conserva todas las letras (A..G), incluida G para WAIT
 * - Si queda vacío, usa el raw.
 */
export function normalizePathKey(raw: string | undefined): string {
  if (raw == null || raw === '') return '—'
  const s = String(raw)
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/\([^)]*\)/g, '')
  return s || raw.trim()
}

/** Minutos desde medianoche (0–1440) para hora de ingreso (GATE_CHECKIN). */
function getEntryTimeMinutes(visit: ReconstructedVisit): number | undefined {
  const ev = visit.events.find((e) => e.eventType === 'GATE_CHECKIN')
  if (!ev) return undefined
  const d = new Date(ev.occurredAt)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function logDiagnostics(visits: ReconstructedVisit[], forceWhenNoPerfect = false): void {
  if (visits.length === 0) return
  const counts = new Map<TripValidationStatus, number>()
  const examples: { visitId: string; status: TripValidationStatus; path: string; pathDisplay: string; flags: string[]; rawLabResultPresent?: boolean }[] = []
  let exampleCount = 0
  for (const v of visits) {
    const summary = buildTripSummaryFromEvents(v.events)
    const s = summary.status as TripValidationStatus
    counts.set(s, (counts.get(s) ?? 0) + 1)
    if (exampleCount < 5) {
      const hasLabResult = v.events.some((e) => e.raw?.labResult != null || e.raw?.resultado != null)
      examples.push({
        visitId: v.visitId,
        status: s,
        path: summary.path ?? '',
        pathDisplay: summary.pathDisplay ?? '',
        flags: summary.flags ?? [],
        rawLabResultPresent: hasLabResult,
      })
      exampleCount++
    }
  }
  const perfectCount = counts.get('VALID_IDEAL') ?? 0
  const shouldLog = DEBUG || (forceWhenNoPerfect && perfectCount === 0 && visits.length > 0)
  if (!shouldLog) return
  console.log('[Analytics DEBUG] TripResult.status counts:', Object.fromEntries(counts))
  console.log('[Analytics DEBUG] 5 example trips:', examples)
  if (perfectCount === 0 && visits.length > 0) {
    console.warn('[Analytics DEBUG] 0 PERFECT (VALID_IDEAL). Set window.__ANALYTICS_DEBUG = true for more logs. Examples above show path and raw.labResult presence.')
  }
}

export interface ScatterPoint {
  visitId: string
  plate: string
  entryTimeMinutes: number
  /** Eje Y: cycle time (cerrada) o elapsed desde A hasta nowRef (abierta). */
  yMinutes: number
  /** Cycle time final (solo cerradas); abiertas no tienen. */
  cycleTimeMinutes: number | null
  status: DisplayStatus
  path: string
  pathDisplay: string
  /** Key normalizada para cross-filter con bar (mismo que BarItem.path). */
  pathKey: string
  flags: string[]
  visit: ReconstructedVisit
  /** true si no tiene F (GATE_CHECKOUT). */
  isOpen: boolean
  /** 'OPEN' (gris) o PERFECT/VALID/INVALID para color. */
  colorKey: ScatterColorKey
}

/** Timestamp del último evento F (EXIT) en la visita, o undefined si no hay. */
function getExitTime(visit: ReconstructedVisit): string | undefined {
  const ev = visit.events.find((e) => e.eventType === 'EXIT')
  return ev?.occurredAt
}

/** nowRef estable = max occurredAt del dataset (no Date.now()). */
function getNowRefFromVisits(visits: ReconstructedVisit[]): number {
  let max = 0
  for (const v of visits) {
    for (const e of v.events) {
      const t = new Date(e.occurredAt).getTime()
      if (t > max) max = t
    }
  }
  return max || Date.now()
}

export function selectScatterPoints(visits: ReconstructedVisit[]): ScatterPoint[] {
  logDiagnostics(visits, true)
  const nowRefMs = getNowRefFromVisits(visits)
  const out: ScatterPoint[] = []
  for (const v of visits) {
    const entryMin = getEntryTimeMinutes(v)
    if (entryMin == null) continue
    const aEv = v.events.find((e) => e.eventType === 'GATE_CHECKIN')
    const aTimeMs = aEv ? new Date(aEv.occurredAt).getTime() : 0
    const fTime = getExitTime(v)
    const isOpen = !fTime
    const summary = buildTripSummaryFromEvents(v.events)
    const statusBucket = bucketStatus(summary.status as TripValidationStatus)
    let yMinutes: number
    let cycleTimeMinutes: number | null
    if (isOpen) {
      yMinutes = Math.max(0, Math.round((nowRefMs - aTimeMs) / 60000))
      cycleTimeMinutes = null
    } else {
      const fTimeMs = new Date(fTime).getTime()
      yMinutes = Math.max(1, Math.round((fTimeMs - aTimeMs) / 60000))
      cycleTimeMinutes = yMinutes
    }
    const colorKey: ScatterColorKey = isOpen ? 'OPEN' : statusBucket
    const includeInScatter = !isOpen && (statusBucket === 'PERFECT' || statusBucket === 'VALID')
    if (!includeInScatter) continue
    const pathRaw = summary.path ?? summary.pathDisplay ?? ''
    const pathKey = normalizePathKey(pathRaw)
    out.push({
      visitId: v.visitId,
      plate: v.plate ?? v.visitId,
      entryTimeMinutes: entryMin,
      yMinutes,
      cycleTimeMinutes,
      status: statusBucket,
      path: summary.path ?? '',
      pathDisplay: summary.pathDisplay ?? '',
      pathKey,
      flags: summary.flags ?? [],
      visit: v,
      isOpen,
      colorKey,
    })
  }
  out.sort((a, b) => a.entryTimeMinutes - b.entryTimeMinutes)
  return out
}

/** p50/p95 sobre los puntos del scatter (solo Perfect+Valid cerrados). */
export function selectScatterStats(points: ScatterPoint[]): { p50: number; p95: number } {
  const times = points.map((p) => p.yMinutes).sort((a, b) => a - b)
  return { p50: p50(times), p95: p95(times) }
}

/** Pie: conteos por Perfect / Valid / Invalid. Solo visitas cerradas (con F). Siempre 3 segmentos. */
export interface PieSegment {
  name: string
  value: number
  status: DisplayStatus
}

export function selectPieData(visits: ReconstructedVisit[]): PieSegment[] {
  if (visits.length > 0) logDiagnostics(visits, true)
  const closedVisits = visits.filter((v) => getExitTime(v) != null)
  let perfect = 0
  let valid = 0
  let invalid = 0
  for (const v of closedVisits) {
    const summary = buildTripSummaryFromEvents(v.events)
    const s = bucketStatus(summary.status as TripValidationStatus)
    if (s === 'PERFECT') perfect++
    else if (s === 'VALID') valid++
    else invalid++
  }
  return [
    { name: 'Perfectos', value: perfect, status: 'PERFECT' },
    { name: 'Válidos', value: valid, status: 'VALID' },
    { name: 'Inválidos', value: invalid, status: 'INVALID' },
  ]
}

/** Bar: path normalizado → count (+ pathDisplay para tooltip). Solo PERFECT + VALID. */
export interface BarItem {
  path: string
  pathDisplay: string
  count: number
}

export function selectValidPathsBar(visits: ReconstructedVisit[]): BarItem[] {
  const byPath = new Map<string, { count: number; pathDisplay: string }>()
  for (const v of visits) {
    const summary = buildTripSummaryFromEvents(v.events)
    const bucket = bucketStatus(summary.status as TripValidationStatus)
    if (bucket === 'INVALID') continue
    const raw = summary.path || summary.pathDisplay || '—'
    const key = normalizePathKey(raw)
    const pathDisplay = summary.pathDisplay ?? summary.path ?? key
    const prev = byPath.get(key)
    if (!prev) byPath.set(key, { count: 1, pathDisplay })
    else byPath.set(key, { count: prev.count + 1, pathDisplay: prev.pathDisplay })
  }
  return Array.from(byPath.entries())
    .map(([path, { count, pathDisplay }]) => ({ path, pathDisplay, count }))
    .sort((a, b) => b.count - a.count)
}

/** Filtra visitas por DisplayStatus (para click en segmento de torta). */
export function filterVisitsByStatus(
  visits: ReconstructedVisit[],
  status: DisplayStatus | null
): ReconstructedVisit[] {
  if (!status) return visits
  return visits.filter((v) => bucketStatus(buildTripSummaryFromEvents(v.events).status as TripValidationStatus) === status)
}
