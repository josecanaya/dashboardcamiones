import type { SiteId } from '../../domain/sites'
import type { TruckVisit, VisitEvent } from '../../domain/truck'
import { visitsRicardone, eventsRicardone } from './ricardone'
import { visitsSanLorenzo, eventsSanLorenzo } from './san_lorenzo'
import { visitsAvellaneda, eventsAvellaneda } from './avellaneda'

const visitsBySite: Record<SiteId, TruckVisit[]> = {
  ricardone: visitsRicardone,
  san_lorenzo: visitsSanLorenzo,
  avellaneda: visitsAvellaneda,
}

const allEvents: VisitEvent[] = [
  ...eventsRicardone,
  ...eventsSanLorenzo,
  ...eventsAvellaneda,
]

export function getVisitsBySite(siteId: SiteId): TruckVisit[] {
  return visitsBySite[siteId] ?? []
}

export function getEventsForVisit(visitId: string): VisitEvent[] {
  return allEvents
    .filter((e) => e.visitId === visitId)
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
}

export function getVisitById(visitId: string): TruckVisit | undefined {
  for (const site of Object.keys(visitsBySite) as SiteId[]) {
    const v = visitsBySite[site].find((x) => x.visitId === visitId)
    if (v) return v
  }
  return undefined
}
