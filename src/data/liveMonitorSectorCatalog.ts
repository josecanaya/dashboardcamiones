import type { SiteId } from '../domain/sites'
import { REAL_SECTOR_CODE_MAP, type RealSectorMapSiteId } from './realSectorCodeMap'

const SAN_LORENZO_INGRESO = 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES'

/**
 * Sectores conocidos por planta según `REAL_SECTOR_CODE_MAP`.
 * En «En vivo» se muestran aunque no haya eventos/alertas en la ventana temporal.
 */
export function getCatalogSectorCodesForLiveMonitor(plant: SiteId): string[] {
  if (plant === 'avellaneda') return []
  const siteId: RealSectorMapSiteId = plant === 'san_lorenzo' ? 'san_lorenzo' : 'ricardone'
  return Object.entries(REAL_SECTOR_CODE_MAP)
    .filter(([, entry]) => entry.siteId === siteId)
    .map(([code]) => code)
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Cámaras (`deviceCode`) típicas por sector Ricardone / Puerto SL (referencia datos reales y reglas LPR).
 * Se unen con los deviceCode observados en API para no ocultar equipos aunque no pasen camiones en los últimos minutos.
 */
const RICARDONE_DEVICES_BY_SECTOR: Record<string, readonly string[]> = {
  RICARDONE_INGRESO_CAMIONES: ['RicIngCamFrente', 'RicIngCamTrasera', 'RicIngCamTraser'],
  RICARDONE_PREINGRESO: ['RicPreIngInFr', 'RicPreIngInTr'],
  RICARDONE_EGRESO_CAMIONES: ['RicEgrCamFrente', 'RicEgrCamTraser', 'RicEgrCamTrasera'],
  RICARDONE_BALANZA: [
    'RicB1Ingreso',
    'RicB1Egreso',
    'RicB2Ingreso',
    'RicB2Egreso',
    'RicB3Ingreso',
    'RicB3Egreso',
  ],
  /** Descarga volcable — sector operativo Ricardone */
  RICARDONE_VOLCABLE_1: ['RicVolcable1'],
  RICARDONE_VOLCABLE_2: ['RicVolcable2'],
  /** Celda 16: los deviceCode reales varían; lista vacía pero el sector figura en catálogo de sectores */
  RICARDONE_CELDA_16: [],
}

const SAN_LORENZO_DEVICES_BY_SECTOR: Record<string, readonly string[]> = {
  [SAN_LORENZO_INGRESO]: ['SLZIngCamFrente'],
}

export function getExpectedDevicesForLiveSector(sectorCode: string): readonly string[] {
  const key = (sectorCode ?? '').trim().toUpperCase()
  if (!key) return []
  return RICARDONE_DEVICES_BY_SECTOR[key] ?? SAN_LORENZO_DEVICES_BY_SECTOR[key] ?? []
}
