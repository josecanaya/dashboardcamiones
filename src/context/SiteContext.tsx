import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  type SiteId,
  getSiteIdFromStorage,
  setSiteIdInStorage,
  getSite,
  SITES,
} from '../domain/sites'

interface SiteContextValue {
  siteId: SiteId
  setSiteId: (id: SiteId) => void
  siteName: string
}

const SiteContext = createContext<SiteContextValue | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [siteId, setSiteIdState] = useState<SiteId>(getSiteIdFromStorage)

  const setSiteId = useCallback((id: SiteId) => {
    setSiteIdInStorage(id)
    setSiteIdState(id)
  }, [])

  const value = useMemo(
    () => ({
      siteId,
      setSiteId,
      siteName: getSite(siteId)?.name ?? SITES[0].name,
    }),
    [siteId, setSiteId]
  )

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error('useSite must be used within SiteProvider')
  return ctx
}
