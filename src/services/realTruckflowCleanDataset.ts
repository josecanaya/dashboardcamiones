import { normalizePlate } from './argentinaPlate'
import { reconstructRealJourneys } from './realJourneyEventsMapper'
import type { RealJourneyEventDto, ReconstructedRealJourney } from './realJourneyEvents.types'
import type { RealAlertDto } from './realTruckflowApi'

export type NormalizedRealAlert = {
  raw: RealAlertDto
  alertId: string
  journeyUid: string | null
  normalizedPlate: string | null
  sectorCode: string | null
  deviceCode: string | null
  alertType: string | null
  reason: string | null
  occurredAt: string | null
}

type AlertIndex = {
  byJourneyUid: Map<string, NormalizedRealAlert[]>
  byPlate: Map<string, NormalizedRealAlert[]>
  bySectorDevice: Map<string, NormalizedRealAlert[]>
  byPlateSector: Map<string, NormalizedRealAlert[]>
}

export type EventWithAlertInfo = RealJourneyEventDto & {
  relatedAlerts: NormalizedRealAlert[]
  hasAlert: boolean
}

export type BuildCleanDatasetOptions = {
  excludeInvalidPlates?: boolean
  excludeAlertedJourneys?: boolean
  excludeAlertedEvents?: boolean
  excludeOnlyIngreso?: boolean
  excludeOnlyEgreso?: boolean
  excludeSoloRutaProbable?: boolean
  keepPreliminaryValid?: boolean
}

const DEFAULT_OPTIONS: Required<BuildCleanDatasetOptions> = {
  excludeInvalidPlates: true,
  excludeAlertedJourneys: true,
  excludeAlertedEvents: false,
  excludeOnlyIngreso: true,
  excludeOnlyEgreso: true,
  excludeSoloRutaProbable: true,
  keepPreliminaryValid: true,
}

function toUpper(v?: string | null): string | null {
  const s = (v ?? '').trim()
  return s ? s.toUpperCase() : null
}

function normalizeAlertDate(alert: RealAlertDto): string | null {
  const value = alert.occurredAt ?? alert.recordedAt ?? alert.createdAt
  return typeof value === 'string' && value.trim() ? value : null
}

function safeParsePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string' && payload.trim()) {
    try {
      const parsed = JSON.parse(payload)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export function normalizeRealAlert(alert: RealAlertDto): NormalizedRealAlert {
  const payload = safeParsePayload(alert.payload)
  const payloadJourney = typeof payload.journeyUid === 'string' ? payload.journeyUid : typeof payload.journeyUuid === 'string' ? payload.journeyUuid : ''
  const payloadPlate =
    typeof payload.truckPlate === 'string'
      ? payload.truckPlate
      : typeof payload.plate === 'string'
        ? payload.plate
        : typeof payload.normalizedPlate === 'string'
          ? payload.normalizedPlate
          : ''
  const rawJourney = alert.journeyUid ?? alert.journeyUuid ?? payloadJourney
  const rawPlate = alert.truckPlate ?? alert.plate ?? payloadPlate
  const alertId = String(alert.id ?? `${rawJourney ?? 'no-journey'}-${rawPlate ?? 'no-plate'}-${normalizeAlertDate(alert) ?? 'no-time'}`)
  const normalizedPlate = rawPlate ? normalizePlate(rawPlate) : ''
  return {
    raw: alert,
    alertId,
    journeyUid: rawJourney?.trim() || null,
    normalizedPlate: normalizedPlate || null,
    sectorCode: toUpper(
      alert.sectorCode ??
        alert.sector ??
        (typeof payload.sectorCode === 'string' ? payload.sectorCode : null) ??
        (typeof payload.sector === 'string' ? payload.sector : null)
    ),
    deviceCode: toUpper(
      alert.deviceCode ??
        alert.device ??
        (typeof payload.deviceCode === 'string' ? payload.deviceCode : null) ??
        (typeof payload.device === 'string' ? payload.device : null)
    ),
    alertType: (alert.alertType ?? alert.type ?? alert.alertCode ?? (typeof payload.alertType === 'string' ? payload.alertType : null)) as
      | string
      | null,
    reason: (alert.reason ??
      alert.message ??
      alert.description ??
      (typeof payload.reason === 'string' ? payload.reason : null) ??
      (typeof payload.message === 'string' ? payload.message : null)) as string | null,
    occurredAt: normalizeAlertDate(alert),
  }
}

export function buildAlertIndex(alerts: RealAlertDto[]): AlertIndex {
  const byJourneyUid = new Map<string, NormalizedRealAlert[]>()
  const byPlate = new Map<string, NormalizedRealAlert[]>()
  const bySectorDevice = new Map<string, NormalizedRealAlert[]>()
  const byPlateSector = new Map<string, NormalizedRealAlert[]>()
  for (const raw of alerts) {
    const normalized = normalizeRealAlert(raw)
    if (normalized.journeyUid) byJourneyUid.set(normalized.journeyUid, [...(byJourneyUid.get(normalized.journeyUid) ?? []), normalized])
    if (normalized.normalizedPlate) byPlate.set(normalized.normalizedPlate, [...(byPlate.get(normalized.normalizedPlate) ?? []), normalized])
    if (normalized.normalizedPlate && normalized.sectorCode) {
      byPlateSector.set(
        `${normalized.normalizedPlate}__${normalized.sectorCode}`,
        [...(byPlateSector.get(`${normalized.normalizedPlate}__${normalized.sectorCode}`) ?? []), normalized]
      )
    }
    if (normalized.normalizedPlate && normalized.sectorCode && normalized.deviceCode) {
      bySectorDevice.set(
        `${normalized.normalizedPlate}__${normalized.sectorCode}__${normalized.deviceCode}`,
        [...(bySectorDevice.get(`${normalized.normalizedPlate}__${normalized.sectorCode}__${normalized.deviceCode}`) ?? []), normalized]
      )
    }
  }
  return { byJourneyUid, byPlate, bySectorDevice, byPlateSector }
}

function isCloseTime(eventIso: string, alertIso: string | null, maxMs = 6 * 60 * 60 * 1000): boolean {
  if (!alertIso) return true
  const e = new Date(eventIso).getTime()
  const a = new Date(alertIso).getTime()
  if (!Number.isFinite(e) || !Number.isFinite(a)) return true
  return Math.abs(e - a) <= maxMs
}

export function attachAlertsToEvents(events: RealJourneyEventDto[], alerts: RealAlertDto[]): EventWithAlertInfo[] {
  const index = buildAlertIndex(alerts)
  return events.map((event) => {
    const hits = new Map<string, NormalizedRealAlert>()
    const byJourney = index.byJourneyUid.get(event.journeyUid) ?? []
    for (const a of byJourney) hits.set(a.alertId, a)
    if (hits.size === 0) {
      const keyFull = `${event.normalizedPlate}__${(event.sectorCode ?? '').toUpperCase()}__${(event.deviceCode ?? '').toUpperCase()}`
      const byFull = index.bySectorDevice.get(keyFull) ?? []
      for (const a of byFull) if (isCloseTime(event.occurredAt, a.occurredAt)) hits.set(a.alertId, a)
    }
    if (hits.size === 0) {
      const keyPartial = `${event.normalizedPlate}__${(event.sectorCode ?? '').toUpperCase()}`
      const byPartial = index.byPlateSector.get(keyPartial) ?? []
      for (const a of byPartial) if (isCloseTime(event.occurredAt, a.occurredAt, 12 * 60 * 60 * 1000)) hits.set(a.alertId, a)
    }
    return {
      ...event,
      relatedAlerts: [...hits.values()],
      hasAlert: hits.size > 0,
    }
  })
}

function isOnlyIngreso(journey: ReconstructedRealJourney): boolean {
  return journey.qualityFlags.includes('SOLO_INGRESO')
}

function isOnlyEgreso(journey: ReconstructedRealJourney): boolean {
  return journey.qualityFlags.includes('SOLO_EGRESO')
}

function isRutaProbable(journey: ReconstructedRealJourney): boolean {
  return journey.isDiscardedOperational && (isOnlyIngreso(journey) || isOnlyEgreso(journey))
}

export function buildCleanRealDataset(events: RealJourneyEventDto[], alerts: RealAlertDto[], options: BuildCleanDatasetOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const eventsWithAlertInfo = attachAlertsToEvents(events, alerts)
  const reconstructedJourneysRaw = reconstructRealJourneys(eventsWithAlertInfo)
  const alertedJourneyUids = new Set(eventsWithAlertInfo.filter((e) => e.hasAlert).map((e) => e.journeyUid))

  const discardedJourneys: Array<{ journey: ReconstructedRealJourney; reason: string }> = []
  const reconstructedJourneysClean: ReconstructedRealJourney[] = []
  for (const journey of reconstructedJourneysRaw) {
    const hasAlert = alertedJourneyUids.has(journey.journeyUid)
    let reason = ''
    if (opts.excludeAlertedJourneys && hasAlert) reason = 'ALERTED_JOURNEY'
    else if (opts.excludeOnlyIngreso && isOnlyIngreso(journey)) reason = 'ONLY_INGRESO'
    else if (opts.excludeOnlyEgreso && isOnlyEgreso(journey)) reason = 'ONLY_EGRESO'
    else if (opts.excludeSoloRutaProbable && isRutaProbable(journey)) reason = 'RUTA_PROBABLE'
    else if (!opts.keepPreliminaryValid && journey.feedsOperationalAnalytics) reason = 'PRELIMINARY_DISABLED'
    else if (!journey.feedsOperationalAnalytics && journey.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO') reason = 'INCOMPLETE_EXCLUDED'
    if (reason) discardedJourneys.push({ journey, reason })
    else reconstructedJourneysClean.push(journey)
  }

  const cleanJourneyUids = new Set(reconstructedJourneysClean.map((j) => j.journeyUid))
  const cleanEvents: EventWithAlertInfo[] = []
  const discardedEvents: Array<{ event: EventWithAlertInfo; reason: string }> = []
  for (const event of eventsWithAlertInfo) {
    let reason = ''
    if (opts.excludeInvalidPlates && !event.isValidPlate) reason = 'INVALID_PLATE'
    else if (opts.excludeAlertedEvents && event.hasAlert) reason = 'ALERTED_EVENT'
    else if (!cleanJourneyUids.has(event.journeyUid)) reason = 'JOURNEY_EXCLUDED'
    if (reason) discardedEvents.push({ event, reason })
    else cleanEvents.push(event)
  }

  const journeysWithAlertCount = reconstructedJourneysRaw.filter((j) => alertedJourneyUids.has(j.journeyUid)).length
  const summary = {
    rawEventCount: events.length,
    rawAlertCount: alerts.length,
    rawJourneyCount: reconstructedJourneysRaw.length,
    cleanEventCount: cleanEvents.length,
    cleanJourneyCount: reconstructedJourneysClean.length,
    discardedEventCount: discardedEvents.length,
    discardedJourneyCount: discardedJourneys.length,
    eventsWithAlertCount: eventsWithAlertInfo.filter((e) => e.hasAlert).length,
    journeysWithAlertCount,
    invalidPlateEventCount: eventsWithAlertInfo.filter((e) => !e.isValidPlate).length,
    onlyIngresoDiscardedCount: discardedJourneys.filter((x) => x.reason === 'ONLY_INGRESO').length,
    onlyEgresoDiscardedCount: discardedJourneys.filter((x) => x.reason === 'ONLY_EGRESO').length,
    cleanRatio: events.length > 0 ? cleanEvents.length / events.length : 0,
  }

  return {
    rawEvents: events,
    rawAlerts: alerts,
    eventsWithAlertInfo,
    reconstructedJourneysRaw,
    reconstructedJourneysClean,
    cleanEvents,
    discardedEvents,
    discardedJourneys,
    summary,
  }
}

export function mapCleanJourneysToHistoricalTrips(cleanJourneys: ReconstructedRealJourney[]) {
  return cleanJourneys.map((journey) => ({
    tripId: journey.journeyUid,
    journeyUid: journey.journeyUid,
    plate: journey.plate,
    startAt: journey.startedAt,
    endAt: journey.endedAt,
    durationMinutes: journey.durationMinutes,
    preliminaryCircuit: journey.preliminaryCircuitCode,
    logicalSequence: journey.logicalCodeSequence,
    rawSequence: journey.rawSectorSequence,
    qualityFlags: journey.qualityFlags,
    source: 'truckflow-clean-dataset',
  }))
}
