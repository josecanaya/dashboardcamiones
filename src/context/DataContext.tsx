import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { SiteId } from '../domain/sites'
import type { NormalizedEvent } from '../domain/events'
import type { ReconstructedVisit } from '../domain/events'
import type { RouteAggregation } from '../analytics/routes'
import type { RawEventRow } from '../engine/eventStream'
import { buildVisits, buildTripsFromEventStream, tripResultsToReconstructedVisits } from '../engine'
import { computeRoutes } from '../analytics/routes'

interface DataContextValue {
  visits: ReconstructedVisit[]
  routes: RouteAggregation[]
  lastProcessedAt: Date | null
  lastLoadedFileName: string | null
  setLastLoadedFileName: (name: string | null) => void
  runPipeline: (events: NormalizedEvent[]) => void
  runEventStreamPipeline: (rawRows: RawEventRow[], siteId: SiteId) => void
  getVisitsBySite: (siteId: SiteId) => ReconstructedVisit[]
  getRoutesBySite: (siteId: SiteId) => RouteAggregation[]
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [visits, setVisits] = useState<ReconstructedVisit[]>([])
  const [routes, setRoutes] = useState<RouteAggregation[]>([])
  const [lastProcessedAt, setLastProcessedAt] = useState<Date | null>(null)
  const [lastLoadedFileName, setLastLoadedFileName] = useState<string | null>(null)

  const runPipeline = useCallback((events: NormalizedEvent[]) => {
    if (events.length === 0) {
      setVisits([])
      setRoutes([])
      setLastProcessedAt(null)
      return
    }
    const bySite = new Map<SiteId, NormalizedEvent[]>()
    for (const e of events) {
      if (!bySite.has(e.siteId)) bySite.set(e.siteId, [])
      bySite.get(e.siteId)!.push(e)
    }
    const allVisits: ReconstructedVisit[] = []
    for (const [siteId, evs] of bySite) {
      const siteVisits = buildVisits(evs, siteId)
      allVisits.push(...siteVisits)
    }
    const routeList = computeRoutes(allVisits)
    setVisits(allVisits)
    setRoutes(routeList)
    setLastProcessedAt(new Date())
  }, [])

  const runEventStreamPipeline = useCallback((rawRows: RawEventRow[], siteId: SiteId) => {
    if (rawRows.length === 0) {
      setVisits([])
      setRoutes([])
      setLastProcessedAt(null)
      return
    }
    const trips = buildTripsFromEventStream(rawRows, siteId)
    const allVisits = tripResultsToReconstructedVisits(trips, siteId)
    const routeList = computeRoutes(allVisits)
    setVisits(allVisits)
    setRoutes(routeList)
    setLastProcessedAt(new Date())
  }, [])

  const getVisitsBySite = useCallback(
    (siteId: SiteId) => visits.filter((v) => v.siteId === siteId),
    [visits]
  )

  const getRoutesBySite = useCallback(
    (siteId: SiteId) => {
      const siteVisits = visits.filter((v) => v.siteId === siteId)
      return computeRoutes(siteVisits)
    },
    [visits]
  )

  const value = useMemo(
    () => ({
      visits,
      routes,
      lastProcessedAt,
      lastLoadedFileName,
      setLastLoadedFileName,
      runPipeline,
      runEventStreamPipeline,
      getVisitsBySite,
      getRoutesBySite,
    }),
    [visits, routes, lastProcessedAt, lastLoadedFileName, runPipeline, runEventStreamPipeline, getVisitsBySite, getRoutesBySite]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
