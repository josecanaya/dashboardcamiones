import type { NormalizedRealAlertView } from '../realAlertsInspector'
import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import { getEventLiveInstantIso, getEventLiveInstantMs, parseLiveMillis } from './liveEventTime'

export const LIVE_MATCH_WINDOW_MS = 20_000

export function isLprMalfunctionAlert(alert: Pick<NormalizedRealAlertView, 'alertCode' | 'alertType'>): boolean {
  return (alert.alertCode || alert.alertType || '').trim().toUpperCase() === 'LPR_MALFUNCTION'
}

export function filterLiveAlertsForView(
  alerts: NormalizedRealAlertView[],
  hideLprMalfunction: boolean
): NormalizedRealAlertView[] {
  if (!hideLprMalfunction) return alerts
  return alerts.filter((a) => !isLprMalfunctionAlert(a))
}

export type LiveDetectionKind = 'EVENTO OK' | 'SOLO ALERTA' | 'EVENTO + ALERTA' | 'SIN DATOS'

export type LiveDetectionRow = {
  key: string
  at: string
  plate: string
  kind: LiveDetectionKind
  deviceCode: string
  sectorCode: string
  journeyUid: string
  eventType: string
  alertCode: string
}

function platesStrongMatch(ev: RealJourneyEventDto, al: NormalizedRealAlertView): boolean {
  const ep = (ev.normalizedPlate || ev.truckPlate || '').trim()
  const ap = (al.normalizedPlate || '').trim()
  if (ep && ap && ep === ap) return true
  return (al.rawPlate || '').trim().toUpperCase() === (ev.truckPlate || '').trim().toUpperCase()
}

export function buildLiveDetections(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  deviceCode: string,
  sectorCodes: string[],
  matchWindowMs = LIVE_MATCH_WINDOW_MS
): LiveDetectionRow[] {
  const sectorSet = new Set(sectorCodes.map((s) => s.trim()))
  const evs = events
    .filter((e) => e.deviceCode === deviceCode && sectorSet.has(e.sectorCode.trim()))
    .sort((a, b) => getEventLiveInstantMs(b) - getEventLiveInstantMs(a))
  const als = alerts
    .filter((a) => a.deviceCode === deviceCode && sectorSet.has((a.sectorCode || '').trim()))
    .sort((a, b) => parseLiveMillis(b.occurredAt) - parseLiveMillis(a.occurredAt))

  if (!evs.length && !als.length) return []

  const usedAlertIds = new Set<string>()
  const rows: LiveDetectionRow[] = []

  for (const ev of evs) {
    const t0 = getEventLiveInstantMs(ev)
    let best: NormalizedRealAlertView | null = null
    let bestD = Infinity
    for (const al of als) {
      if (usedAlertIds.has(al.alertId)) continue
      const t1 = parseLiveMillis(al.occurredAt)
      if (Number.isNaN(t0) || Number.isNaN(t1)) continue
      const d = Math.abs(t0 - t1)
      if (d <= matchWindowMs && d < bestD) {
        bestD = d
        best = al
      }
    }
    const plate = ev.truckPlate || ev.normalizedPlate || best?.rawPlate || best?.normalizedPlate || '—'
    if (best) {
      usedAlertIds.add(best.alertId)
      rows.push({
        key: `ea-${ev.id}-${best.alertId}`,
        at: getEventLiveInstantIso(ev),
        plate,
        kind: platesStrongMatch(ev, best) ? 'EVENTO + ALERTA' : 'EVENTO + ALERTA',
        deviceCode,
        sectorCode: ev.sectorCode,
        journeyUid: ev.journeyUid || best.journeyUid || '',
        eventType: ev.eventType || ev.eventCategory || '',
        alertCode: best.alertCode || best.alertType || '',
      })
    } else {
      rows.push({
        key: `ev-${ev.id}`,
        at: getEventLiveInstantIso(ev),
        plate,
        kind: 'EVENTO OK',
        deviceCode,
        sectorCode: ev.sectorCode,
        journeyUid: ev.journeyUid,
        eventType: ev.eventType || ev.eventCategory || '',
        alertCode: '',
      })
    }
  }

  for (const al of als) {
    if (usedAlertIds.has(al.alertId)) continue
    rows.push({
      key: `al-${al.alertId}`,
      at: al.occurredAt,
      plate: al.rawPlate || al.normalizedPlate || '—',
      kind: 'SOLO ALERTA',
      deviceCode,
      sectorCode: al.sectorCode || sectorCodes[0] || '',
      journeyUid: al.journeyUid || '',
      eventType: '',
      alertCode: al.alertCode || al.alertType || '',
    })
  }

  rows.sort((a, b) => parseLiveMillis(b.at) - parseLiveMillis(a.at))
  return rows
}

export type LiveCameraRow = {
  deviceCode: string
  sectorCode: string
  eventCount: number
  alertCount: number
  lastEventAt: string
  lastAlertAt: string
  displayPlate: string
  lastDetectionAt: string
  liveResultado: LiveDetectionKind
  status: 'ok' | 'alertas' | 'critica' | 'sin_datos'
}

export function buildLiveCameraRow(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  deviceCode: string,
  sectorCodes: string[]
): LiveCameraRow {
  const sectorSet = new Set(sectorCodes.map((s) => s.trim()))
  const evC = events.filter((e) => e.deviceCode === deviceCode && sectorSet.has(e.sectorCode.trim()))
  const alC = alerts.filter((a) => a.deviceCode === deviceCode && sectorSet.has((a.sectorCode || '').trim()))
  const combined = buildLiveDetections(events, alerts, deviceCode, sectorCodes)
  const latest = combined[0]
  const lastEv = [...evC].sort((a, b) => getEventLiveInstantMs(b) - getEventLiveInstantMs(a))[0]
  const lastAl = [...alC].sort((a, b) => parseLiveMillis(b.occurredAt) - parseLiveMillis(a.occurredAt))[0]

  let liveResultado: LiveDetectionKind = 'SIN DATOS'
  let displayPlate = '—'
  let lastDetectionAt = ''
  if (latest) {
    liveResultado = latest.kind
    displayPlate = latest.plate || '—'
    lastDetectionAt = latest.at
  } else if (lastEv) {
    liveResultado = 'EVENTO OK'
    displayPlate = lastEv.truckPlate || lastEv.normalizedPlate || '—'
    lastDetectionAt = getEventLiveInstantIso(lastEv)
  } else if (lastAl) {
    liveResultado = 'SOLO ALERTA'
    displayPlate = lastAl.rawPlate || lastAl.normalizedPlate || '—'
    lastDetectionAt = lastAl.occurredAt
  }

  const critical = alC.some((a) => a.alertLevel >= 8)
  const status: LiveCameraRow['status'] =
    evC.length === 0 && alC.length === 0 ? 'sin_datos' : critical ? 'critica' : alC.length > 0 ? 'alertas' : 'ok'

  const primarySector = evC[0]?.sectorCode || alC[0]?.sectorCode || sectorCodes[0] || ''

  return {
    deviceCode,
    sectorCode: primarySector,
    eventCount: evC.length,
    alertCount: alC.length,
    lastEventAt: lastEv ? getEventLiveInstantIso(lastEv) : '',
    lastAlertAt: lastAl?.occurredAt ?? '',
    displayPlate,
    lastDetectionAt,
    liveResultado,
    status,
  }
}

export type LiveSectorSummary = {
  key: string
  label: string
  sectorCodes: string[]
  eventCount: number
  alertCount: number
  cameraCount: number
  status: 'sin_datos' | 'operativa' | 'con_alertas' | 'critica'
}

export type LiveFeedBreakdownRow = {
  sectorCode: string
  deviceCode: string
  eventCount: number
  alertCount: number
}

/** Conteo crudo por par sectorCode·deviceCode tal como llega de Truckflow (sin catálogo). */
export function buildLiveFeedSectorDeviceBreakdown(
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[]
): LiveFeedBreakdownRow[] {
  const map = new Map<string, LiveFeedBreakdownRow>()
  const upsert = (sectorCode: string, deviceCode: string, kind: 'event' | 'alert') => {
    const sec = sectorCode.trim() || '—'
    const dev = deviceCode.trim() || '—'
    const k = `${sec}\0${dev}`
    const row = map.get(k) ?? { sectorCode: sec, deviceCode: dev, eventCount: 0, alertCount: 0 }
    if (kind === 'event') row.eventCount++
    else row.alertCount++
    map.set(k, row)
  }
  for (const e of events) upsert(String(e.sectorCode ?? ''), String(e.deviceCode ?? ''), 'event')
  for (const a of alerts) upsert(String(a.sectorCode ?? ''), String(a.deviceCode ?? ''), 'alert')
  return [...map.values()].sort(
    (a, b) =>
      b.eventCount + b.alertCount - (a.eventCount + a.alertCount) ||
      a.sectorCode.localeCompare(b.sectorCode) ||
      a.deviceCode.localeCompare(b.deviceCode)
  )
}

export function buildLiveSectorSummary(
  key: string,
  label: string,
  sectorCodes: string[],
  devices: string[],
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[]
): LiveSectorSummary {
  const sectorSet = new Set(sectorCodes.map((s) => s.trim()))
  const evs = events.filter((e) => sectorSet.has(e.sectorCode.trim()))
  const als = alerts.filter((a) => sectorSet.has((a.sectorCode || '').trim()))
  const deviceSet = new Set<string>()
  for (const d of devices) deviceSet.add(d)
  for (const e of evs) {
    if (e.deviceCode.trim()) deviceSet.add(e.deviceCode.trim())
  }
  for (const a of als) {
    if (a.deviceCode?.trim()) deviceSet.add(a.deviceCode.trim())
  }

  const critical = als.some((a) => a.alertLevel >= 8)
  let status: LiveSectorSummary['status'] = 'sin_datos'
  if (evs.length === 0 && als.length === 0) status = 'sin_datos'
  else if (critical) status = 'critica'
  else if (als.length > 0) status = 'con_alertas'
  else status = 'operativa'

  return {
    key,
    label,
    sectorCodes,
    eventCount: evs.length,
    alertCount: als.length,
    cameraCount: deviceSet.size,
    status,
  }
}
