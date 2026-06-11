/**
 * Capa: diagnóstico — cámaras y tiempos operativos (live/validación). Fuera del pipeline batch.
 */
import { isValidArgentinaPlate, normalizePlate } from './argentinaPlate'
import type { NormalizedRealAlertView } from './realAlertsInspector'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import {
  alignJourneyEventTimeForLiveView as alignJourneyEventTimeForLiveViewFromModule,
  getEventOperationalInstantIso as getEventOperationalInstantIsoFromModule,
  getEventOperationalInstantMs as getEventOperationalInstantMsFromModule,
  parseLiveMillis as parseLiveMillisFromModule,
} from './live/liveEventTime'

export const LIVE_MATCH_WINDOW_MS = 20_000
export const MANUAL_VALIDATION_WINDOW_MS = 30_000

export type LiveWorkMode = 'live' | 'validation' | 'lpr' | 'front_rear'

export type LiveSectorStatus = 'sin_datos' | 'operativa' | 'con_alertas' | 'critica' | 'pendiente_validacion'

export type LiveCameraStatus =
  | 'OK'
  | 'Revisar LPR'
  | 'Revisar orientación'
  | 'Revisar zona de captura'
  | 'Revisar configuración de sector'
  | 'Revisar integración'
  | 'Sin datos'

export type VehicleType =
  | 'camion_tractor'
  | 'camion_con_acoplado'
  | 'semirremolque'
  | 'camioneta'
  | 'auto'
  | 'vehiculo_interno'
  | 'desconocido'

export type ManualObservationResult =
  | 'pendiente'
  | 'detecto_evento'
  | 'detecto_alerta'
  | 'detecto_evento_alerta'
  | 'no_detecto_nada'

export type ManualObservation = {
  id: string
  observedAt: string
  sectorCode: string
  sectorLabel: string
  deviceCode: string
  vehicleType: VehicleType
  observedPlate: string
  operatorNote: string
  manualObservation: string
  result: ManualObservationResult
  linkedEventSummary: string
  linkedAlertSummary: string
}

export type OperationalTimelineKind =
  | 'EVENTO OK'
  | 'SOLO ALERTA'
  | 'EVENTO + ALERTA'
  | 'SIN EVENTO ASOCIADO'
  | 'LPR inválida'
  | 'Posible falso positivo'

export type OperationalTimelineRow = {
  key: string
  kind: OperationalTimelineKind
  at: string
  plate: string
  rawPlate: string
  deviceCode: string
  sectorCode: string
  journeyUid: string
  description: string
  event?: RealJourneyEventDto
  alert?: NormalizedRealAlertView
}

export type CameraDiagnostics = {
  deviceCode: string
  sectorCode: string
  events: RealJourneyEventDto[]
  alerts: NormalizedRealAlertView[]
  eventCount: number
  alertCount: number
  eventsLast10Min: number
  alertsLast10Min: number
  lprAlertCount: number
  visibleEventCount: number
  lprPer100Events: number
  lastEvent?: RealJourneyEventDto
  lastAlert?: NormalizedRealAlertView
  lastValidPlate: string
  lastInvalidReading: string
  latestKind: 'event' | 'alert' | 'none'
  latestAt: string
  suggestedStatus: LiveCameraStatus
  recommendedAction: string
  invalidReadings: { value: string; count: number }[]
  timeline: OperationalTimelineRow[]
}

export type FrontRearComparisonResult =
  | 'misma patente / mismo journey'
  | 'distinta patente / mismo journey'
  | 'distinta patente / distinto journey'
  | 'solo trasera'
  | 'solo frontal'
  | 'sin datos'

export type FrontRearComparisonRow = {
  key: string
  frontDeviceCode: string
  rearDeviceCode: string
  sectorCode: string
  at: string
  frontPlate: string
  rearPlate: string
  frontJourneyUid: string
  rearJourneyUid: string
  deltaSeconds: number | null
  result: FrontRearComparisonResult
}

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  camion_tractor: 'Camión tractor',
  camion_con_acoplado: 'Camión con acoplado',
  semirremolque: 'Semirremolque',
  camioneta: 'Camioneta',
  auto: 'Auto',
  vehiculo_interno: 'Vehículo interno',
  desconocido: 'Desconocido',
}

export const WORK_MODE_LABELS: Record<LiveWorkMode, string> = {
  live: 'Monitoreo en vivo',
  validation: 'Validación de cámara',
  lpr: 'Diagnóstico LPR',
  front_rear: 'Comparación frente / trasera',
}

export function parseLiveMillis(iso: string): number {
  return parseLiveMillisFromModule(iso)
}

export function alignJourneyEventTimeForLiveView(e: RealJourneyEventDto): RealJourneyEventDto {
  return alignJourneyEventTimeForLiveViewFromModule(e)
}

export function getEventOperationalInstantMs(e: RealJourneyEventDto): number {
  return getEventOperationalInstantMsFromModule(e)
}

export function getEventOperationalInstantIso(e: RealJourneyEventDto): string {
  return getEventOperationalInstantIsoFromModule(e)
}

function alertInstantMs(a: NormalizedRealAlertView): number {
  return parseLiveMillis(a.occurredAt)
}

function alertIsLpr(a: NormalizedRealAlertView): boolean {
  const text = `${a.alertCode} ${a.alertType} ${a.reason} ${a.description} ${a.message}`.toLowerCase()
  return a.inferenceCategory === 'ocr_plate' || /lpr|ocr|plate|patente|lectura/.test(text)
}

function plateFromEvent(e: RealJourneyEventDto): string {
  return e.truckPlate || e.normalizedPlate || '—'
}

function plateFromAlert(a: NormalizedRealAlertView): string {
  return a.rawPlate || a.normalizedPlate || '—'
}

function sortEventsDesc(a: RealJourneyEventDto, b: RealJourneyEventDto): number {
  return getEventOperationalInstantMs(b) - getEventOperationalInstantMs(a)
}

function sortAlertsDesc(a: NormalizedRealAlertView, b: NormalizedRealAlertView): number {
  return alertInstantMs(b) - alertInstantMs(a)
}

export function buildOperationalTimeline(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  deviceCode: string,
  sectorCode: string,
  matchWindowMs = LIVE_MATCH_WINDOW_MS
): OperationalTimelineRow[] {
  const evs = events
    .filter((e) => e.deviceCode === deviceCode && e.sectorCode === sectorCode)
    .sort(sortEventsDesc)
  const als = alerts
    .filter((a) => a.deviceCode === deviceCode && a.sectorCode === sectorCode)
    .sort(sortAlertsDesc)

  const usedAlertIds = new Set<string>()
  const rows: OperationalTimelineRow[] = []

  for (const ev of evs) {
    const evMs = getEventOperationalInstantMs(ev)
    let best: NormalizedRealAlertView | undefined
    let bestDelta = Infinity
    for (const al of als) {
      if (usedAlertIds.has(al.alertId)) continue
      const alMs = alertInstantMs(al)
      if (Number.isNaN(evMs) || Number.isNaN(alMs)) continue
      const d = Math.abs(evMs - alMs)
      if (d <= matchWindowMs && d < bestDelta) {
        bestDelta = d
        best = al
      }
    }

    if (best) {
      usedAlertIds.add(best.alertId)
      const alertLpr = alertIsLpr(best)
      const invalid = Boolean(best.rawPlate || best.normalizedPlate) && !best.isValidPlate
      rows.push({
        key: `event-alert-${ev.id}-${best.alertId}`,
        kind: invalid ? 'LPR inválida' : 'EVENTO + ALERTA',
        at: getEventOperationalInstantIso(ev),
        plate: plateFromEvent(ev) || plateFromAlert(best),
        rawPlate: best.rawPlate || ev.truckPlate,
        deviceCode,
        sectorCode,
        journeyUid: ev.journeyUid || best.journeyUid,
        description: alertLpr
          ? `Evento asociado a alerta LPR (${Math.round(bestDelta / 1000)}s)`
          : `Evento asociado a alerta (${Math.round(bestDelta / 1000)}s)`,
        event: ev,
        alert: best,
      })
    } else {
      rows.push({
        key: `event-${ev.id}`,
        kind: ev.isValidPlate ? 'EVENTO OK' : 'LPR inválida',
        at: getEventOperationalInstantIso(ev),
        plate: plateFromEvent(ev),
        rawPlate: ev.rawTruckPlate || ev.truckPlate,
        deviceCode,
        sectorCode,
        journeyUid: ev.journeyUid,
        description: ev.isValidPlate ? 'Evento visible sin alerta cercana' : 'Evento con patente inválida o no normalizable',
        event: ev,
      })
    }
  }

  for (const al of als) {
    if (usedAlertIds.has(al.alertId)) continue
    const invalid = Boolean(al.rawPlate || al.normalizedPlate) && !al.isValidPlate
    rows.push({
      key: `alert-${al.alertId}`,
      kind: invalid ? 'LPR inválida' : alertIsLpr(al) ? 'SIN EVENTO ASOCIADO' : 'SOLO ALERTA',
      at: al.occurredAt,
      plate: plateFromAlert(al),
      rawPlate: al.rawPlate,
      deviceCode,
      sectorCode,
      journeyUid: al.journeyUid,
      description: al.description || al.message || al.reason || 'Alerta sin evento asociado en la ventana cercana',
      alert: al,
    })
  }

  rows.sort((a, b) => parseLiveMillis(b.at) - parseLiveMillis(a.at))
  return rows
}

export function buildCameraDiagnostics(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  deviceCode: string,
  sectorCode: string,
  nowMs = Date.now()
): CameraDiagnostics {
  const evs = events
    .filter((e) => e.deviceCode === deviceCode && e.sectorCode === sectorCode)
    .sort(sortEventsDesc)
  const als = alerts
    .filter((a) => a.deviceCode === deviceCode && a.sectorCode === sectorCode)
    .sort(sortAlertsDesc)
  const tenMinAgo = nowMs - 10 * 60 * 1000
  const eventsLast10Min = evs.filter((e) => {
    const t = getEventOperationalInstantMs(e)
    return !Number.isNaN(t) && t >= tenMinAgo && t <= nowMs
  }).length
  const alertsLast10Min = als.filter((a) => {
    const t = alertInstantMs(a)
    return !Number.isNaN(t) && t >= tenMinAgo && t <= nowMs
  }).length
  const lprAlerts = als.filter(alertIsLpr)
  const visibleEventCount = evs.length
  const lprPer100Events = visibleEventCount > 0 ? Math.round((lprAlerts.length / visibleEventCount) * 100) : lprAlerts.length > 0 ? 100 : 0
  const lastValid = evs.find((e) => e.isValidPlate && (e.normalizedPlate || e.truckPlate))?.normalizedPlate || ''
  const invalidAlerts = als.filter((a) => Boolean(a.rawPlate || a.normalizedPlate) && !a.isValidPlate)
  const invalidEvents = evs.filter((e) => Boolean(e.truckPlate || e.normalizedPlate) && !e.isValidPlate)
  const invalidReadings = countInvalidReadings(invalidAlerts, invalidEvents)
  const timeline = buildOperationalTimeline(events, alerts, deviceCode, sectorCode)
  const lastEvent = evs[0]
  const lastAlert = als[0]
  const lastEventMs = lastEvent ? getEventOperationalInstantMs(lastEvent) : NaN
  const lastAlertMs = lastAlert ? alertInstantMs(lastAlert) : NaN
  const latestKind =
    Number.isNaN(lastEventMs) && Number.isNaN(lastAlertMs)
      ? 'none'
      : Number.isNaN(lastAlertMs) || lastEventMs >= lastAlertMs
        ? 'event'
        : 'alert'
  const latestAt =
    latestKind === 'event' && lastEvent
      ? getEventOperationalInstantIso(lastEvent)
      : latestKind === 'alert' && lastAlert
        ? lastAlert.occurredAt
        : ''
  const diagnosis = suggestCameraStatus(evs, als, lprAlerts.length, lprPer100Events, timeline)

  return {
    deviceCode,
    sectorCode,
    events: evs,
    alerts: als,
    eventCount: evs.length,
    alertCount: als.length,
    eventsLast10Min,
    alertsLast10Min,
    lprAlertCount: lprAlerts.length,
    visibleEventCount,
    lprPer100Events,
    lastEvent,
    lastAlert,
    lastValidPlate: lastValid || '—',
    lastInvalidReading: invalidReadings[0]?.value ?? '—',
    latestKind,
    latestAt,
    suggestedStatus: diagnosis.status,
    recommendedAction: diagnosis.action,
    invalidReadings,
    timeline,
  }
}

function countInvalidReadings(
  invalidAlerts: NormalizedRealAlertView[],
  invalidEvents: RealJourneyEventDto[]
): { value: string; count: number }[] {
  const map = new Map<string, number>()
  for (const a of invalidAlerts) {
    const v = (a.rawPlate || a.normalizedPlate || 'LECTURA_INVALIDA').trim()
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  for (const e of invalidEvents) {
    const v = (e.rawTruckPlate || e.truckPlate || e.normalizedPlate || 'LECTURA_INVALIDA').trim()
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

function suggestCameraStatus(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  lprAlertCount: number,
  lprPer100Events: number,
  timeline: OperationalTimelineRow[]
): { status: LiveCameraStatus; action: string } {
  if (!events.length && !alerts.length) {
    return { status: 'Sin datos', action: 'Revisar cámara, conectividad o ventana de consulta.' }
  }
  if (!events.length && alerts.length) {
    return { status: 'Revisar integración', action: 'Hay alertas sin eventos visibles; revisar integración journey-event/list o asociación por cámara.' }
  }
  const invalidEventRatio = events.length ? events.filter((e) => !e.isValidPlate).length / events.length : 0
  const soloAlerts = timeline.filter((r) => r.kind === 'SIN EVENTO ASOCIADO' || r.kind === 'SOLO ALERTA').length
  if (lprAlertCount >= 3 && lprPer100Events >= 50) {
    return { status: 'Revisar zona de captura', action: 'Alta carga LPR por evento; revisar iluminación, encuadre y zona de disparo.' }
  }
  if (invalidEventRatio >= 0.4) {
    return { status: 'Revisar LPR', action: 'Muchos eventos tienen patente inválida; calibrar OCR/LPR.' }
  }
  if (soloAlerts >= 3 && soloAlerts > events.length) {
    return { status: 'Revisar integración', action: 'Predominan alertas sin evento asociado; revisar reglas y payload de cámara.' }
  }
  return { status: 'OK', action: 'Cámara operativa dentro de los umbrales iniciales.' }
}

export function evaluateManualObservation(
  observation: ManualObservation,
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  windowMs = MANUAL_VALIDATION_WINDOW_MS
): ManualObservation {
  const center = parseLiveMillis(observation.observedAt)
  if (Number.isNaN(center)) return observation
  const start = center - windowMs
  const end = center + windowMs
  const evHit = events
    .filter((e) => e.deviceCode === observation.deviceCode && e.sectorCode === observation.sectorCode)
    .find((e) => {
      const t = getEventOperationalInstantMs(e)
      return !Number.isNaN(t) && t >= start && t <= end
    })
  const alHit = alerts
    .filter((a) => a.deviceCode === observation.deviceCode && a.sectorCode === observation.sectorCode)
    .find((a) => {
      const t = alertInstantMs(a)
      return !Number.isNaN(t) && t >= start && t <= end
    })

  const result: ManualObservationResult =
    evHit && alHit ? 'detecto_evento_alerta' : evHit ? 'detecto_evento' : alHit ? 'detecto_alerta' : 'no_detecto_nada'

  return {
    ...observation,
    result,
    linkedEventSummary: evHit
      ? `${getEventOperationalInstantIso(evHit)} · ${evHit.eventType || evHit.eventCategory} · ${plateFromEvent(evHit)}`
      : '—',
    linkedAlertSummary: alHit
      ? `${alHit.occurredAt} · ${alHit.alertCode || alHit.alertType || 'alerta'} · ${plateFromAlert(alHit)}`
      : '—',
  }
}

export function compareFrontRearCameras(
  events: RealJourneyEventDto[],
  sectorCode: string,
  frontDeviceCode: string,
  rearDeviceCode: string,
  windowMs = 60_000
): FrontRearComparisonRow[] {
  const front = events
    .filter((e) => e.sectorCode === sectorCode && e.deviceCode === frontDeviceCode)
    .sort(sortEventsDesc)
  const rear = events
    .filter((e) => e.sectorCode === sectorCode && e.deviceCode === rearDeviceCode)
    .sort(sortEventsDesc)
  const usedRear = new Set<number>()
  const rows: FrontRearComparisonRow[] = []

  for (const f of front) {
    const ft = getEventOperationalInstantMs(f)
    let best: RealJourneyEventDto | undefined
    let bestDelta = Infinity
    for (const r of rear) {
      if (usedRear.has(r.id)) continue
      const rt = getEventOperationalInstantMs(r)
      if (Number.isNaN(ft) || Number.isNaN(rt)) continue
      const d = Math.abs(ft - rt)
      if (d <= windowMs && d < bestDelta) {
        bestDelta = d
        best = r
      }
    }
    if (best) usedRear.add(best.id)
    rows.push(buildFrontRearRow(sectorCode, frontDeviceCode, rearDeviceCode, f, best, bestDelta))
  }

  for (const r of rear) {
    if (usedRear.has(r.id)) continue
    rows.push(buildFrontRearRow(sectorCode, frontDeviceCode, rearDeviceCode, undefined, r, Infinity))
  }

  rows.sort((a, b) => parseLiveMillis(b.at) - parseLiveMillis(a.at))
  return rows
}

function buildFrontRearRow(
  sectorCode: string,
  frontDeviceCode: string,
  rearDeviceCode: string,
  front: RealJourneyEventDto | undefined,
  rear: RealJourneyEventDto | undefined,
  deltaMs: number
): FrontRearComparisonRow {
  const frontPlate = front ? normalizePlate(front.truckPlate || front.normalizedPlate) : ''
  const rearPlate = rear ? normalizePlate(rear.truckPlate || rear.normalizedPlate) : ''
  let result: FrontRearComparisonResult = 'sin datos'
  if (front && rear) {
    const samePlate = Boolean(frontPlate && rearPlate && frontPlate === rearPlate)
    const sameJourney = Boolean(front.journeyUid && rear.journeyUid && front.journeyUid === rear.journeyUid)
    if (samePlate && sameJourney) result = 'misma patente / mismo journey'
    else if (!samePlate && sameJourney) result = 'distinta patente / mismo journey'
    else result = 'distinta patente / distinto journey'
  } else if (front) {
    result = 'solo frontal'
  } else if (rear) {
    result = 'solo trasera'
  }
  const at = front ? getEventOperationalInstantIso(front) : rear ? getEventOperationalInstantIso(rear) : ''
  return {
    key: `${front?.id ?? 'no-front'}-${rear?.id ?? 'no-rear'}`,
    frontDeviceCode,
    rearDeviceCode,
    sectorCode,
    at,
    frontPlate: front ? plateFromEvent(front) : '—',
    rearPlate: rear ? plateFromEvent(rear) : '—',
    frontJourneyUid: front?.journeyUid ?? '—',
    rearJourneyUid: rear?.journeyUid ?? '—',
    deltaSeconds: Number.isFinite(deltaMs) ? Math.round(deltaMs / 1000) : null,
    result,
  }
}

export function buildSectorStatus(
  eventCount: number,
  alertCount: number,
  hasPendingValidation: boolean,
  alerts: NormalizedRealAlertView[]
): LiveSectorStatus {
  if (hasPendingValidation) return 'pendiente_validacion'
  if (eventCount === 0 && alertCount === 0) return 'sin_datos'
  const critical = alerts.some((a) => a.alertLevel >= 8 || /CRITICAL|CRÍTICO|HIGH|ALTA/i.test(String(a.raw.severity ?? '')))
  if (critical) return 'critica'
  if (alertCount > 0) return 'con_alertas'
  return 'operativa'
}

export function exportCameraDiagnosticJson(input: {
  diagnostic: CameraDiagnostics
  periodLabel: string
  observations: ManualObservation[]
}): string {
  return JSON.stringify(input, null, 2)
}

export function exportCameraDiagnosticCsv(input: {
  diagnostic: CameraDiagnostics
  periodLabel: string
  observations: ManualObservation[]
}): string {
  const { diagnostic, periodLabel, observations } = input
  const rows = [
    ['campo', 'valor'],
    ['camara', diagnostic.deviceCode],
    ['sector', diagnostic.sectorCode],
    ['periodo', periodLabel],
    ['eventos', String(diagnostic.eventCount)],
    ['alertas', String(diagnostic.alertCount)],
    ['alertas_lpr', String(diagnostic.lprAlertCount)],
    ['ultimo_evento', diagnostic.lastEvent ? getEventOperationalInstantIso(diagnostic.lastEvent) : ''],
    ['ultima_alerta', diagnostic.lastAlert?.occurredAt ?? ''],
    ['lecturas_invalidas_frecuentes', diagnostic.invalidReadings.map((r) => `${r.value}:${r.count}`).join('|')],
    ['estado_sugerido', diagnostic.suggestedStatus],
    ['accion_recomendada', diagnostic.recommendedAction],
    ['observaciones_manuales', String(observations.length)],
  ]
  const obsRows = observations.map((o) => [
    'observacion_manual',
    `${o.observedAt}|${o.deviceCode}|${o.sectorCode}|${o.result}|${o.vehicleType}|${o.observedPlate}|${o.operatorNote}`,
  ])
  return [...rows, ...obsRows].map((r) => r.map(csvEscape).join(',')).join('\n')
}

function csvEscape(value: string): string {
  const v = value ?? ''
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function isValidObservedPlate(value: string): boolean {
  const normalized = normalizePlate(value)
  return Boolean(normalized) && isValidArgentinaPlate(normalized)
}
