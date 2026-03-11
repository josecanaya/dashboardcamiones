import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { SiteId } from '../domain/sites'
import type { ReconstructedVisit } from '../domain/events'

interface DataContextValue {
  getVisitsBySite: (siteId: SiteId) => ReconstructedVisit[]
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [visits] = useState<ReconstructedVisit[]>([])

  const getVisitsBySite = useCallback(
    (siteId: SiteId) => visits.filter((v) => v.siteId === siteId),
    [visits]
  )

  const value = useMemo(() => ({ getVisitsBySite }), [getVisitsBySite])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
