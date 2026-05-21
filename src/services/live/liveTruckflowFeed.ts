import type { NormalizedRealAlertView } from '../realAlertsInspector'
import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import type { SiteId } from '../../domain/sites'
import { resolveRealTruckflowApiOrigin, type RealTruckflowQueryParams } from '../realTruckflowApi'
import { fetchLiveRangeMerged, type LiveChunkFetchStats } from './liveApiChunkFetch'
import {
  alignJourneyEventTimeForLiveView,
  alertInUiWindow,
  journeyEventInUiWindow,
  type LiveUiWindow,
} from './liveEventTime'
import { normalizeRealAlertForView } from '../realAlertsInspector'
import { inferSiteIdFromSectorCode } from '../realJourneyEventsMapper'

export type LiveFeedFilters = {
  plate?: string
  journeyUuid?: string
}

export type LiveFeedResult = {
  events: RealJourneyEventDto[]
  alerts: NormalizedRealAlertView[]
  window: LiveUiWindow
  fetchStats?: LiveChunkFetchStats
}

export async function fetchLiveTruckflowFeed(
  window: LiveUiWindow,
  filters: LiveFeedFilters = {},
  opts?: { baseOrigin?: string }
): Promise<LiveFeedResult> {
  const baseParams: Omit<RealTruckflowQueryParams, 'startDate' | 'endDate'> = {}
  if (filters.plate?.trim()) baseParams.plate = filters.plate.trim()
  if (filters.journeyUuid?.trim()) baseParams.journeyUuid = filters.journeyUuid.trim()

  const fetchOpts = opts?.baseOrigin ? { baseOrigin: opts.baseOrigin } : undefined
  const { events: evts, alerts: rawAlerts, stats } = await fetchLiveRangeMerged(
    window.apiQueryStart,
    window.apiQueryEnd,
    baseParams,
    fetchOpts
  )

  const evFiltered = evts
    .map(alignJourneyEventTimeForLiveView)
    .filter((e) => journeyEventInUiWindow(e, window.uiStartMs, window.uiEndMs, window.eventSlackMs))
  const alerts = rawAlerts
    .map(normalizeRealAlertForView)
    .filter((a) => alertInUiWindow(a, window.uiStartMs, window.uiEndMs))

  return { events: evFiltered, alerts, window, fetchStats: stats }
}

export function resolveLiveFetchOrigin(): string {
  return resolveRealTruckflowApiOrigin()
}

export function filterEventsByPlant(events: RealJourneyEventDto[], plant: SiteId): RealJourneyEventDto[] {
  return events.filter((e) => inferSiteIdFromSectorCode(e.sectorCode) === plant)
}

export function filterAlertsByPlant(alerts: NormalizedRealAlertView[], plant: SiteId): NormalizedRealAlertView[] {
  return alerts.filter((a) => inferSiteIdFromSectorCode(a.sectorCode || '') === plant)
}
