/**
 * Traducción sectorCode (archivo semanal de cámaras) → código lógico interno.
 * No define circuitos R/SL ni si un viaje es válido o anómalo.
 *
 * Referencia de códigos lógicos (documentación):
 * - S0 = ingreso
 * - S1 = pre ingreso
 * - S2 = calada
 * - S3 = egreso
 * - S4 = balanza
 * - S9 = volcable 1 / volcable 2
 */

/** Planta asociada en el mapa (solo entradas cargadas; Avellaneda cuando existan filas). */
export type RealSectorMapSiteId = 'ricardone' | 'san_lorenzo'

export type RealSectorMappingEntry = {
  siteId: RealSectorMapSiteId
  logicalSector: string
  label: string
}

export const REAL_SECTOR_CODE_MAP: Record<string, RealSectorMappingEntry> = {
  RICARDONE_INGRESO_CAMIONES: {
    siteId: 'ricardone',
    logicalSector: 'S0',
    label: 'Ingreso camiones Ricardone',
  },
  RICARDONE_PREINGRESO: {
    siteId: 'ricardone',
    logicalSector: 'S1',
    label: 'Pre ingreso Ricardone',
  },
  RICARDONE_BALANZA: {
    siteId: 'ricardone',
    logicalSector: 'S4',
    label: 'Balanza Ricardone',
  },
  RICARDONE_EGRESO_CAMIONES: {
    siteId: 'ricardone',
    logicalSector: 'S3',
    label: 'Egreso camiones Ricardone',
  },
  RICARDONE_VOLCABLE_1: {
    siteId: 'ricardone',
    logicalSector: 'S9',
    label: 'Volcable 1 Ricardone',
  },
  RICARDONE_VOLCABLE_2: {
    siteId: 'ricardone',
    logicalSector: 'S9',
    label: 'Volcable 2 Ricardone',
  },
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: {
    siteId: 'san_lorenzo',
    logicalSector: 'S0',
    label: 'Ingreso camiones San Lorenzo',
  },
}

/** Placeholder alineado con raw cuando aún no hay fila en REAL_SECTOR_CODE_MAP */
export const UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER = '?' as const

export function lookupRealSectorCode(sectorCode: string): RealSectorMappingEntry | undefined {
  const key = (sectorCode ?? '').trim()
  if (!key) return undefined
  return REAL_SECTOR_CODE_MAP[key] ?? REAL_SECTOR_CODE_MAP[key.toUpperCase()]
}
