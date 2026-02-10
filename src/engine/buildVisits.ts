import type { SiteId } from '../domain/sites'
import type {
  NormalizedEvent,
  ReconstructedVisit,
  VisitMetrics,
  ReconstructedVisitStatus,
} from '../domain/events'
const TIME_BUCKET_MS = 12 * 60 * 60 * 1000 // 12h window for composite key

/** Clave única por visita: visitId + bucket de fecha para no mezclar eventos de distintos días. */
function makeVisitKey(ev: NormalizedEvent, dateBucket: string): string {
  const base = ev.visitId && String(ev.visitId).trim()
    ? String(ev.visitId).trim()
    : `${(ev.plate ?? '').trim() || 'NONE'}|${(ev.docNumber ?? '').trim() || 'NONE'}`
  return `${ev.siteId}|${base}|${dateBucket}`
}

function getDateBucket(iso: string): string {
  const d = new Date(iso)
  const t = d.getTime()
  const bucket = Math.floor(t / TIME_BUCKET_MS) * TIME_BUCKET_MS
  return new Date(bucket).toISOString().slice(0, 13)
}

/** Orden de desempate cuando occurredAt coincide: A→B→C→Lab→D start/end→E→F→G (WAIT). */
const EVENT_TYPE_ORDER: Record<string, number> = {
  GATE_CHECKIN: 0,
  SCALE_IN: 1,
  SAMPLE_SOLID_TAKEN: 2,
  SAMPLE_LIQUID_TAKEN: 2,
  LAB_RESULT_READY: 3,
  DISCHARGE_START: 4,
  DISCHARGE_END: 5,
  SCALE_OUT: 6,
  EXIT: 7,
  YARD_WAIT: 8,
}

function eventTypeSortOrder(et: string): number {
  return EVENT_TYPE_ORDER[et] ?? 99
}

/**
 * Agrupa eventos por visitId (o clave compuesta), ordena por tiempo, calcula status y métricas.
 * NO fusiona ni elimina eventos: conserva todos. Orden estable: occurredAt asc, desempate por eventType (prioridad lógica).
 */
export function buildVisits(events: NormalizedEvent[], siteId: SiteId): ReconstructedVisit[] {
  if (events.length === 0) return []
  const byKey = new Map<string, NormalizedEvent[]>()
  for (const ev of events) {
    const bucket = getDateBucket(ev.occurredAt)
    const key = makeVisitKey(ev, bucket)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(ev)
  }
  const visits: ReconstructedVisit[] = []
  for (const [visitId, evs] of byKey) {
    const sorted = evs.slice().sort((a, b) => {
      const ta = new Date(a.occurredAt).getTime()
      const tb = new Date(b.occurredAt).getTime()
      if (ta !== tb) return ta - tb
      return eventTypeSortOrder(a.eventType || '') - eventTypeSortOrder(b.eventType || '')
    })
    const status = computeStatus(sorted)
    const metrics = computeMetrics(sorted)
    const startAt = sorted[0].occurredAt
    const endAt = status !== 'OPEN' ? sorted[sorted.length - 1].occurredAt : undefined
    const plate = sorted[0].plate ?? undefined
    const docNumber = sorted[0].docNumber ?? undefined
    const cargoForm = sorted[0].cargoForm ?? 'UNKNOWN'
    const product = sorted[0].product ?? undefined
    visits.push({
      visitId,
      siteId,
      plate,
      docNumber,
      cargoForm,
      product,
      events: sorted,
      startAt,
      endAt,
      status,
      metrics,
    })
  }
  return visits
}

function computeStatus(events: NormalizedEvent[]): ReconstructedVisitStatus {
  const hasExit = events.some((e) => e.eventType === 'EXIT')
  const hasRejectedLab = events.some(
    (e) =>
      e.eventType === 'LAB_RESULT_READY' &&
      (e.raw?.status === 'REJECTED' || String(e.raw?.resultado ?? '').toLowerCase() === 'rechazado')
  )
  const hasDischargeEnd = events.some((e) => e.eventType === 'DISCHARGE_END')
  if (hasRejectedLab && hasExit && !hasDischargeEnd) return 'REJECTED'
  if (hasExit) return 'CLOSED'
  return 'OPEN'
}

function computeMetrics(events: NormalizedEvent[]): VisitMetrics {
  const metrics: VisitMetrics = {}
  const start = new Date(events[0].occurredAt).getTime()
  const endEv = events[events.length - 1]
  const end = new Date(endEv.occurredAt).getTime()
  let cycleMin = Math.round((end - start) / 60000)
  // Visita cerrada (tiene egreso) no puede tener ciclo 0: suele ser mismo minuto en ingreso/egreso por redondeo o dato
  const hasExit = events.some((e) => e.eventType === 'EXIT')
  if (hasExit && cycleMin < 1) cycleMin = 1
  metrics.cycleTimeMinutes = cycleMin

  const gateIdx = events.findIndex((e) => e.eventType === 'GATE_CHECKIN')
  const sampleIdx = events.findIndex(
    (e) => e.eventType === 'SAMPLE_SOLID_TAKEN' || e.eventType === 'SAMPLE_LIQUID_TAKEN'
  )
  if (gateIdx >= 0 && sampleIdx >= 0) {
    const sampleTime = new Date(events[sampleIdx].occurredAt).getTime()
    const gateTime = new Date(events[gateIdx].occurredAt).getTime()
    metrics.timeToSampleMinutes = Math.round((sampleTime - gateTime) / 60000)
  }

  const labIdx = events.findIndex((e) => e.eventType === 'LAB_RESULT_READY')
  if (sampleIdx >= 0 && labIdx >= 0) {
    const labTime = new Date(events[labIdx].occurredAt).getTime()
    const sampleTime = new Date(events[sampleIdx].occurredAt).getTime()
    metrics.labTurnaroundMinutes = Math.round((labTime - sampleTime) / 60000)
  }

  const dischargeStartIdx = events.findIndex((e) => e.eventType === 'DISCHARGE_START')
  const dischargeEndIdx = events.findIndex((e) => e.eventType === 'DISCHARGE_END')
  if (dischargeStartIdx >= 0 && dischargeEndIdx >= 0) {
    const s = new Date(events[dischargeStartIdx].occurredAt).getTime()
    const e = new Date(events[dischargeEndIdx].occurredAt).getTime()
    metrics.dischargeDurationMinutes = Math.round((e - s) / 60000)
  }

  // Inferir espera por gaps: entre LAB_RESULT_READY y DISCHARGE_START (o entre sample y lab si no hay YARD_WAIT)
  const yardWaitEvents = events.filter((e) => e.eventType === 'YARD_WAIT')
  if (yardWaitEvents.length >= 2) {
    let total = 0
    for (let i = 0; i < yardWaitEvents.length - 1; i++) {
      const a = new Date(yardWaitEvents[i].occurredAt).getTime()
      const b = new Date(yardWaitEvents[i + 1].occurredAt).getTime()
      total += (b - a) / 60000
    }
    metrics.yardWaitTimeMinutes = Math.round(total)
  } else {
    // Infer: gap from last "wait" point to next material event (e.g. LAB_RESULT_READY -> DISCHARGE_ASSIGNED)
    const labIdx2 = events.findIndex((e) => e.eventType === 'LAB_RESULT_READY')
    const assignIdx = events.findIndex((e) => e.eventType === 'DISCHARGE_ASSIGNED')
    if (labIdx2 >= 0 && assignIdx > labIdx2) {
      const labT = new Date(events[labIdx2].occurredAt).getTime()
      const assignT = new Date(events[assignIdx].occurredAt).getTime()
      metrics.yardWaitTimeMinutes = Math.round((assignT - labT) / 60000)
    }
  }

  const missing: string[] = []
  const types = new Set(events.map((e) => e.eventType))
  if (events.some((e) => e.cargoForm === 'SOLID' || e.cargoForm === 'UNKNOWN')) {
    if (!types.has('SAMPLE_SOLID_TAKEN') && types.has('DISCHARGE_END')) missing.push('SAMPLE_SOLID_TAKEN')
  }
  if (types.has('SCALE_OUT') && !types.has('SCALE_IN')) missing.push('SCALE_IN')
  if (missing.length) metrics.missingSteps = missing

  return metrics
}
