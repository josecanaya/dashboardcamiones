import type { ReconstructedVisit } from '../domain/events'
import type { EventType } from '../domain/truck'
import { EVENT_TYPE_LABELS } from '../lib/eventLabels'

const NOISE_EVENTS = new Set<EventType>(['DOCS_OK', 'DOCS_PROBLEM', 'QUEUE_OUTSIDE'])
const COMPRESS_REPEAT = true

/** Secuencia de EventType reducida (opcional: comprimir repetidos, quitar ruido). */
export function getRouteSignature(visit: ReconstructedVisit, options?: { compress?: boolean; noNoise?: boolean }): string {
  const compress = options?.compress ?? COMPRESS_REPEAT
  const noNoise = options?.noNoise ?? true
  let seq: string[] = visit.events.map((e) => e.eventType)
  if (noNoise) seq = seq.filter((t) => !NOISE_EVENTS.has(t as EventType))
  if (compress) {
    const out: string[] = []
    for (const t of seq) {
      if (out[out.length - 1] !== t) out.push(t)
    }
    seq = out
  }
  return seq.join(' > ')
}

/** Signature "humana" con labels. */
export function getRouteSignatureLabel(visit: ReconstructedVisit): string {
  const sig = getRouteSignature(visit)
  return sig
    .split(' > ')
    .map((t) => EVENT_TYPE_LABELS[t as EventType] ?? t)
    .join(' → ')
}

export interface RouteAggregation {
  signature: string
  signatureLabel: string
  count: number
  cycleTimeAvg: number
  cycleTimeP95: number
  waitTimeAvg: number
  rejectedPercent: number
  topProducts: { product: string; count: number }[]
  topDischargeLocations: { location: string; count: number }[]
}

export function computeRoutes(visits: ReconstructedVisit[]): RouteAggregation[] {
  const bySig = new Map<string, ReconstructedVisit[]>()
  for (const v of visits) {
    const sig = getRouteSignature(v)
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(v)
  }
  const result: RouteAggregation[] = []
  for (const [signature, list] of bySig) {
    const cycleTimes = list
      .map((v) => v.metrics.cycleTimeMinutes ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b)
    const waitTimes = list
      .map((v) => v.metrics.yardWaitTimeMinutes ?? v.metrics.labTurnaroundMinutes ?? 0)
      .filter((n) => n > 0)
    const rejected = list.filter((v) => v.status === 'REJECTED').length
    const productCount = new Map<string, number>()
    const locationCount = new Map<string, number>()
    for (const v of list) {
      const p = v.product || '—'
      productCount.set(p, (productCount.get(p) ?? 0) + 1)
      const dischargeEv = v.events.find((e) => e.eventType === 'DISCHARGE_START' || e.eventType === 'DISCHARGE_ASSIGNED')
      const loc = dischargeEv?.locationKey ? String(dischargeEv.locationKey) : '—'
      locationCount.set(loc, (locationCount.get(loc) ?? 0) + 1)
    }
    const cycleTimeAvg = cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0
    const p95Idx = Math.floor(cycleTimes.length * 0.95)
    const cycleTimeP95 = cycleTimes.length ? cycleTimes[p95Idx] ?? cycleTimes[cycleTimes.length - 1] : 0
    const waitTimeAvg = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0
    result.push({
      signature,
      signatureLabel: getRouteSignatureLabel(list[0]),
      count: list.length,
      cycleTimeAvg: Math.round(cycleTimeAvg),
      cycleTimeP95: Math.round(cycleTimeP95),
      waitTimeAvg: Math.round(waitTimeAvg),
      rejectedPercent: list.length ? Math.round((rejected / list.length) * 100) : 0,
      topProducts: Array.from(productCount.entries())
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      topDischargeLocations: Array.from(locationCount.entries())
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    })
  }
  return result.sort((a, b) => b.count - a.count)
}
