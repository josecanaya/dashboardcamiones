/**
 * Modelo de planta/sitio — multi-planta (Ricardone, San Lorenzo, Avellaneda).
 * Extensible para mapear ubicaciones reales a LocationKey más adelante.
 */

export type SiteId = 'ricardone' | 'san_lorenzo' | 'avellaneda'

export interface Site {
  id: SiteId
  name: string
  timezone: string
  enabled: boolean
}

export const SITES: Site[] = [
  { id: 'ricardone', name: 'Ricardone', timezone: 'America/Argentina/Buenos_Aires', enabled: true },
  { id: 'san_lorenzo', name: 'San Lorenzo', timezone: 'America/Argentina/Buenos_Aires', enabled: true },
  { id: 'avellaneda', name: 'Avellaneda', timezone: 'America/Argentina/Buenos_Aires', enabled: true },
]

export const DEFAULT_SITE_ID: SiteId = 'ricardone'

export const STORAGE_KEY_SITE = 'selectedSiteId'

export function getSite(siteId: SiteId): Site | undefined {
  return SITES.find((s) => s.id === siteId)
}

export function getSiteIdFromStorage(): SiteId {
  if (typeof window === 'undefined') return DEFAULT_SITE_ID
  const raw = localStorage.getItem(STORAGE_KEY_SITE)
  if (raw === 'ricardone' || raw === 'san_lorenzo' || raw === 'avellaneda') return raw
  return DEFAULT_SITE_ID
}

export function setSiteIdInStorage(siteId: SiteId): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY_SITE, siteId)
}
