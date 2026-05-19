import type { RealJourneyEventDto } from '../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../services/realTruckflowApi'
import {
  filterRicardoneSiteEventsOnly,
  inferSiteIdFromSectorCode,
} from '../../services/realJourneyEventsMapper'

export type TruckflowSiteScope = 'ricardone' | 'san_lorenzo' | 'all'

export function filterSanLorenzoSiteEventsOnly(events: RealJourneyEventDto[]): RealJourneyEventDto[] {
  return events.filter((e) => inferSiteIdFromSectorCode(e.sectorCode) === 'san_lorenzo')
}

export function filterRealEventsBySiteScope(
  events: RealJourneyEventDto[],
  scope: TruckflowSiteScope
): RealJourneyEventDto[] {
  if (scope === 'all') return events
  if (scope === 'ricardone') return filterRicardoneSiteEventsOnly(events)
  return filterSanLorenzoSiteEventsOnly(events)
}

export function filterRealAlertsBySiteScope(alerts: RealAlertDto[], scope: TruckflowSiteScope): RealAlertDto[] {
  if (scope === 'all') return alerts
  return alerts.filter((a) => {
    const sec = String(a.sectorCode ?? '').trim()
    if (sec) {
      const sid = inferSiteIdFromSectorCode(sec)
      if (scope === 'ricardone') return sid === 'ricardone'
      return sid === 'san_lorenzo'
    }
    const siteStr = String(a.site ?? '').trim().toLowerCase()
    if (!siteStr) return scope === 'ricardone'
    if (scope === 'ricardone') return siteStr.includes('ricard')
    return siteStr.includes('lorenzo') || siteStr.includes('san')
  })
}
