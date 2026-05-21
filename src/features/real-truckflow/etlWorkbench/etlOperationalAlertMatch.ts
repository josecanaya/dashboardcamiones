import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import { getEventOperationalInstantMs } from '../../../services/liveCameraDiagnostics'
import type { ExecutiveBucket } from './finalCircuitScoring'

export const OPERATIONAL_ALERT_CODE_INVALID_ROUTE = 'INVALID_ROUTE'
/** Código canónico en API Truckflow (alias histórico INVALID_JOURNEY_START). */
export const OPERATIONAL_ALERT_CODE_INVALID_JOURNEY_START = 'INVALID_START_JOURNEY'

export type SystemCutReason =
  | 'INVALID_JOURNEY_START_AT_NON_ENTRY_SECTOR'
  | 'INVALID_ROUTE_DURING_JOURNEY'
  | 'OPERATIONAL_ALERT_WITHOUT_EVENT_MATCH'
  | 'NONE'

export type MatchStrategy =
  | 'journey_uid_exact'
  | 'plate_sector_device_time'
  | 'plate_sector_time'
  | 'plate_within_journey_window'
  | 'none'

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none'

export type JourneyMetaForAlertMatch = {
  journeyUid: string
  normalizedPlate: string
  startedAt: string
  endedAt: string
  preliminaryCircuitCode: string
  executiveBucket: ExecutiveBucket | ''
}

export type JourneyOperationalAlertSummary = {
  operationalAlertCount: number
  hasInvalidRoute: boolean
  hasInvalidJourneyStart: boolean
  operationalAlertCodes: string
  firstOperationalAlertAt: string
  operationalAlertSectors: string
  possibleSystemCutReason: SystemCutReason
  alertsWithoutEventMatch: number
}

export type EnrichedOperationalAlertRow = {
  alertId: string
  alertCode: string
  severity: string
  status: string
  createdAt: string
  truckPlate: string
  sectorCode: string
  deviceCode: string
  journeyUid: string
  matchedEventId: string
  matchedJourneyUid: string
  matchedCircuitCode: string
  matchedBucket: ExecutiveBucket | ''
  matchStrategy: MatchStrategy
  matchConfidence: MatchConfidence
}

export type OperationalAlertCrossMetrics = {
  operationalAlertsCrossed: number
  journeysWithOperationalAlerts: number
  journeysWithInvalidRoute: number
  journeysWithInvalidJourneyStart: number
  incompletosWithOperationalAlert: number
  anomalosWithOperationalAlert: number
  incompletosWithInvalidJourneyStart: number
  anomalosWithInvalidRoute: number
}

export type CrossOperationalAlertsResult = {
  alertRows: EnrichedOperationalAlertRow[]
  journeySummaries: Map<string, JourneyOperationalAlertSummary>
  metrics: OperationalAlertCrossMetrics
}

const RELATED_EVENT_NEAR_MS = 30 * 60 * 1000
const RELATED_EVENT_WIDE_MS = 120 * 60 * 1000

function normUpper(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : ''
}

function normPlate(v: unknown): string {
  return normUpper(v).replace(/[^A-Z0-9]/g, '')
}

function alertTimeMs(iso: string): number {
  if (!iso) return NaN
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? NaN : t
}

function journeyWindowMs(startedAt: string, endedAt: string): { start: number; end: number } {
  const start = alertTimeMs(startedAt)
  const end = alertTimeMs(endedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { start: NaN, end: NaN }
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export function isOperationalAlertCode(code: string): boolean {
  const u = normUpper(code)
  return u !== '' && u !== 'LPR_MALFUNCTION'
}

export function isInvalidRouteCode(code: string): boolean {
  return normUpper(code) === OPERATIONAL_ALERT_CODE_INVALID_ROUTE
}

export function isInvalidJourneyStartCode(code: string): boolean {
  const u = normUpper(code)
  return u === OPERATIONAL_ALERT_CODE_INVALID_JOURNEY_START || u === 'INVALID_JOURNEY_START'
}

/** Reutiliza la lógica de `powerBiEtlExport.findRelatedOperationalEvent`. */
export function findRelatedOperationalEvent(
  alert: RealAlertDto,
  eventsByJourney: Map<string, RealJourneyEventDto[]>,
  read: {
    journeyUid: (a: RealAlertDto) => string
    deviceCode: (a: RealAlertDto) => string
    sectorCode: (a: RealAlertDto) => string
    occurredAt: (a: RealAlertDto) => string
  }
): RealJourneyEventDto | undefined {
  const uid = read.journeyUid(alert).trim()
  const list = eventsByJourney.get(uid)
  if (!list?.length) return undefined
  const taMs = alertTimeMs(read.occurredAt(alert))
  if (!Number.isFinite(taMs)) return undefined

  const ad = normUpper(read.deviceCode(alert))
  const asc = normUpper(read.sectorCode(alert))

  type Scored = { e: RealJourneyEventDto; pri: number; dt: number }
  const cand: Scored[] = []

  for (const e of list) {
    const teMs = getEventOperationalInstantMs(e)
    if (!Number.isFinite(teMs)) continue
    const dt = Math.abs(teMs - taMs)
    const ed = normUpper(e.deviceCode)
    const ec = normUpper(e.sectorCode)

    const devMatch = !ad || !ed || ad === ed
    const secMatch = !asc || !ec || asc === ec
    const tight = Boolean(ad && ed && ad === ed && asc && ec && asc === ec)

    if (tight && dt <= RELATED_EVENT_NEAR_MS) {
      cand.push({ e, pri: 0, dt })
      continue
    }
    if (devMatch && secMatch && dt <= RELATED_EVENT_NEAR_MS) {
      cand.push({ e, pri: 1, dt })
      continue
    }
    if (devMatch && secMatch && dt <= RELATED_EVENT_WIDE_MS) {
      cand.push({ e, pri: 2, dt })
    }
  }

  if (!cand.length) return undefined
  cand.sort((a, b) => (a.pri !== b.pri ? a.pri - b.pri : a.dt - b.dt))
  return cand[0]!.e
}

/** Alineación temporal alerta ↔ segmento journey (adaptado de `alignAlertsToSegments`). */
export function alertWithinJourneyWindow(
  alert: RealAlertDto,
  meta: JourneyMetaForAlertMatch,
  read: { occurredAt: (a: RealAlertDto) => string }
): boolean {
  const ta = alertTimeMs(read.occurredAt(alert))
  const { start, end } = journeyWindowMs(meta.startedAt, meta.endedAt)
  if (!Number.isFinite(ta) || !Number.isFinite(start) || !Number.isFinite(end)) return false
  return ta >= start && ta <= end
}

type MatchCandidate = {
  journeyUid: string
  event?: RealJourneyEventDto
  strategy: MatchStrategy
  confidence: MatchConfidence
  pri: number
}

function findBestJourneyMatch(
  alert: RealAlertDto,
  journeys: ReconstructedRealJourney[],
  journeyMetaByUid: Map<string, JourneyMetaForAlertMatch>,
  eventsByJourney: Map<string, RealJourneyEventDto[]>,
  read: {
    alertCode: (a: RealAlertDto) => string
    alertId: (a: RealAlertDto) => string
    journeyUid: (a: RealAlertDto) => string
    truckPlate: (a: RealAlertDto) => string
    deviceCode: (a: RealAlertDto) => string
    sectorCode: (a: RealAlertDto) => string
    occurredAt: (a: RealAlertDto) => string
    createdAt: (a: RealAlertDto) => string
  }
): MatchCandidate {
  const alertJu = read.journeyUid(alert).trim()
  const alertPlate = normPlate(read.truckPlate(alert))
  const taMs = alertTimeMs(read.occurredAt(alert) || read.createdAt(alert))
  const ad = normUpper(read.deviceCode(alert))
  const asc = normUpper(read.sectorCode(alert))

  const candidates: MatchCandidate[] = []

  if (alertJu && journeyMetaByUid.has(alertJu)) {
    const ev = findRelatedOperationalEvent(alert, eventsByJourney, read)
    candidates.push({
      journeyUid: alertJu,
      event: ev,
      strategy: 'journey_uid_exact',
      confidence: ev ? 'high' : 'medium',
      pri: 0,
    })
  }

  for (const j of journeys) {
    const meta = journeyMetaByUid.get(j.journeyUid)
    if (!meta) continue
    const jPlate = normPlate(meta.normalizedPlate || j.normalizedPlate || j.plate)
    if (!alertPlate || !jPlate || alertPlate !== jPlate) continue

    const { start, end } = journeyWindowMs(meta.startedAt, meta.endedAt)
    const inWindow = Number.isFinite(taMs) && Number.isFinite(start) && Number.isFinite(end) && taMs >= start && taMs <= end

    const events = eventsByJourney.get(j.journeyUid) ?? []
    let bestDt = Infinity
    let bestEvent: RealJourneyEventDto | undefined
    for (const e of events) {
      const teMs = getEventOperationalInstantMs(e)
      if (!Number.isFinite(teMs) || !Number.isFinite(taMs)) continue
      const dt = Math.abs(teMs - taMs)
      const ed = normUpper(e.deviceCode)
      const ec = normUpper(e.sectorCode)
      const deviceOk = !ad || !ed || ad === ed
      const sectorOk = !asc || !ec || asc === ec
      if (!deviceOk || !sectorOk) continue
      if (dt < bestDt) {
        bestDt = dt
        bestEvent = e
      }
    }

    if (bestEvent && ad && asc && bestDt <= RELATED_EVENT_NEAR_MS) {
      const tight =
        normUpper(bestEvent.deviceCode) === ad && normUpper(bestEvent.sectorCode) === asc
      candidates.push({
        journeyUid: j.journeyUid,
        event: bestEvent,
        strategy: 'plate_sector_device_time',
        confidence: tight ? 'high' : 'medium',
        pri: 1,
      })
      continue
    }

    if (bestEvent && asc && bestDt <= RELATED_EVENT_NEAR_MS) {
      candidates.push({
        journeyUid: j.journeyUid,
        event: bestEvent,
        strategy: 'plate_sector_time',
        confidence: 'medium',
        pri: 2,
      })
      continue
    }

    if (inWindow) {
      candidates.push({
        journeyUid: j.journeyUid,
        event: bestEvent,
        strategy: 'plate_within_journey_window',
        confidence: bestEvent ? 'medium' : 'low',
        pri: 3,
      })
    }
  }

  if (!candidates.length) {
    return { journeyUid: '', strategy: 'none', confidence: 'none', pri: 99 }
  }

  candidates.sort((a, b) => a.pri - b.pri)
  return candidates[0]!
}

function emptyJourneySummary(): JourneyOperationalAlertSummary {
  return {
    operationalAlertCount: 0,
    hasInvalidRoute: false,
    hasInvalidJourneyStart: false,
    operationalAlertCodes: '',
    firstOperationalAlertAt: '',
    operationalAlertSectors: '',
    possibleSystemCutReason: 'NONE',
    alertsWithoutEventMatch: 0,
  }
}

function resolveSystemCutReason(summary: JourneyOperationalAlertSummary): SystemCutReason {
  if (summary.hasInvalidJourneyStart) return 'INVALID_JOURNEY_START_AT_NON_ENTRY_SECTOR'
  if (summary.hasInvalidRoute) return 'INVALID_ROUTE_DURING_JOURNEY'
  if (summary.operationalAlertCount > 0 && summary.alertsWithoutEventMatch > 0) {
    return 'OPERATIONAL_ALERT_WITHOUT_EVENT_MATCH'
  }
  return 'NONE'
}

export function crossOperationalAlerts(input: {
  operationalAlerts: RealAlertDto[]
  journeys: ReconstructedRealJourney[]
  eventsByJourney: Map<string, RealJourneyEventDto[]>
  journeyMetaByUid: Map<string, JourneyMetaForAlertMatch>
  read: {
    alertCode: (a: RealAlertDto) => string
    alertId: (a: RealAlertDto) => string
    journeyUid: (a: RealAlertDto) => string
    truckPlate: (a: RealAlertDto) => string
    deviceCode: (a: RealAlertDto) => string
    sectorCode: (a: RealAlertDto) => string
    severity: (a: RealAlertDto) => string
    status: (a: RealAlertDto) => string
    occurredAt: (a: RealAlertDto) => string
    createdAt: (a: RealAlertDto) => string
  }
}): CrossOperationalAlertsResult {
  const journeySummaries = new Map<string, JourneyOperationalAlertSummary>()
  for (const uid of input.journeyMetaByUid.keys()) {
    journeySummaries.set(uid, emptyJourneySummary())
  }

  const alertRows: EnrichedOperationalAlertRow[] = []
  let operationalAlertsCrossed = 0

  for (const alert of input.operationalAlerts) {
    const code = input.read.alertCode(alert)
    if (!isOperationalAlertCode(code)) continue

    const match = findBestJourneyMatch(
      alert,
      input.journeys,
      input.journeyMetaByUid,
      input.eventsByJourney,
      input.read
    )

    const meta = match.journeyUid ? input.journeyMetaByUid.get(match.journeyUid) : undefined
    const matchedEventId = match.event?.id != null ? String(match.event.id) : ''
    const matchedBucket = meta?.executiveBucket ?? ''
    const matchedCircuitCode = meta?.preliminaryCircuitCode ?? ''

    if (match.journeyUid) operationalAlertsCrossed++

    alertRows.push({
      alertId: input.read.alertId(alert),
      alertCode: code,
      severity: input.read.severity(alert),
      status: input.read.status(alert),
      createdAt: input.read.createdAt(alert),
      truckPlate: input.read.truckPlate(alert),
      sectorCode: input.read.sectorCode(alert),
      deviceCode: input.read.deviceCode(alert),
      journeyUid: input.read.journeyUid(alert),
      matchedEventId,
      matchedJourneyUid: match.journeyUid,
      matchedCircuitCode,
      matchedBucket,
      matchStrategy: match.strategy,
      matchConfidence: match.confidence,
    })

    if (!match.journeyUid) continue
    const sum = journeySummaries.get(match.journeyUid) ?? emptyJourneySummary()
    sum.operationalAlertCount++
    if (isInvalidRouteCode(code)) sum.hasInvalidRoute = true
    if (isInvalidJourneyStartCode(code)) sum.hasInvalidJourneyStart = true
    if (!matchedEventId) sum.alertsWithoutEventMatch++

    const at = input.read.occurredAt(alert) || input.read.createdAt(alert)
    if (at && (!sum.firstOperationalAlertAt || at < sum.firstOperationalAlertAt)) {
      sum.firstOperationalAlertAt = at
    }

    const codes = new Set(sum.operationalAlertCodes ? sum.operationalAlertCodes.split('|') : [])
    codes.add(code)
    sum.operationalAlertCodes = [...codes].filter(Boolean).sort().join('|')

    const sectors = new Set(
      sum.operationalAlertSectors ? sum.operationalAlertSectors.split('|') : []
    )
    const sec = input.read.sectorCode(alert)
    if (sec && sec !== '?') sectors.add(sec)
    sum.operationalAlertSectors = [...sectors].filter(Boolean).sort().join('|')

    sum.possibleSystemCutReason = resolveSystemCutReason(sum)
    journeySummaries.set(match.journeyUid, sum)
  }

  let journeysWithOperationalAlerts = 0
  let journeysWithInvalidRoute = 0
  let journeysWithInvalidJourneyStart = 0
  let incompletosWithOperationalAlert = 0
  let anomalosWithOperationalAlert = 0
  let incompletosWithInvalidJourneyStart = 0
  let anomalosWithInvalidRoute = 0

  for (const [uid, sum] of journeySummaries) {
    if (sum.operationalAlertCount <= 0) continue
    const meta = input.journeyMetaByUid.get(uid)
    journeysWithOperationalAlerts++
    if (sum.hasInvalidRoute) journeysWithInvalidRoute++
    if (sum.hasInvalidJourneyStart) journeysWithInvalidJourneyStart++
    if (meta?.executiveBucket === 'INCOMPLETO') {
      incompletosWithOperationalAlert++
      if (sum.hasInvalidJourneyStart) incompletosWithInvalidJourneyStart++
    }
    if (meta?.executiveBucket === 'ANOMALO') {
      anomalosWithOperationalAlert++
      if (sum.hasInvalidRoute) anomalosWithInvalidRoute++
    }
    sum.possibleSystemCutReason = resolveSystemCutReason(sum)
  }

  return {
    alertRows,
    journeySummaries,
    metrics: {
      operationalAlertsCrossed,
      journeysWithOperationalAlerts,
      journeysWithInvalidRoute,
      journeysWithInvalidJourneyStart,
      incompletosWithOperationalAlert,
      anomalosWithOperationalAlert,
      incompletosWithInvalidJourneyStart,
      anomalosWithInvalidRoute,
    },
  }
}

export const OPERATIONAL_ALERTS_CSV_COLUMNS = [
  'alertId',
  'alertCode',
  'severity',
  'status',
  'createdAt',
  'truckPlate',
  'sectorCode',
  'deviceCode',
  'journeyUid',
  'matchedEventId',
  'matchedJourneyUid',
  'matchedCircuitCode',
  'matchedBucket',
  'matchStrategy',
  'matchConfidence',
] as const

export const JOURNEY_ALERT_SUMMARY_COLUMNS = [
  'operationalAlertCount',
  'hasInvalidRoute',
  'hasInvalidJourneyStart',
  'operationalAlertCodes',
  'firstOperationalAlertAt',
  'operationalAlertSectors',
  'possibleSystemCutReason',
] as const
