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
  RICARDONE_CALADA: {
    siteId: 'ricardone',
    logicalSector: 'S2',
    label: 'Calada Ricardone',
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
  RICARDONE_VOLCABLE: {
    siteId: 'ricardone',
    logicalSector: 'S9',
    label: 'Volcable Ricardone',
  },
  RICARDONE_CELDA_16: {
    siteId: 'ricardone',
    logicalSector: 'S9',
    label: 'Celda 16 Ricardone',
  },
  // —— Grupo nuevo S6/S7/S8 (matriz de circuito = fuente de verdad). Las cámaras
  //    nuevas reportan el sectorCode ya en S-code. Alta aditiva; ver
  //    docs/NUEVAS_CAMARAS_RICARDONE.md.
  //    ⚠️ Pendiente de reconciliación: los S-codes viejos de Ricardone acá
  //    (S3=egreso, Celda16=S9) difieren de la matriz (S3=Salida 2, Celda16=S5).
  //    No se tocan en este alta para no cambiar coberturas existentes sin gate.
  S6: {
    siteId: 'ricardone',
    logicalSector: 'S6',
    label: 'Playa 3 Ricardone',
  },
  S7: {
    siteId: 'ricardone',
    logicalSector: 'S7',
    label: 'Despacho S7 Ricardone (carga/descarga silos)',
  },
  S8: {
    siteId: 'ricardone',
    logicalSector: 'S8',
    label: 'Carga S8 Ricardone (silo Chief)',
  },
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: {
    siteId: 'san_lorenzo',
    logicalSector: 'S0',
    label: 'Ingreso camiones San Lorenzo',
  },
  PUERTO_SAN_LORENZO_BALANZA_INGRESO: {
    siteId: 'san_lorenzo',
    logicalSector: 'S1',
    label: 'Balanza ingreso San Lorenzo',
  },
  PUERTO_SAN_LORENZO_CALADA: {
    siteId: 'san_lorenzo',
    logicalSector: 'S2',
    label: 'Calada San Lorenzo (no instalada)',
  },
  PUERTO_SAN_LORENZO_ENLACE_S3: {
    siteId: 'san_lorenzo',
    logicalSector: 'S3',
    label: 'Enlace S1–S3 (no instalada)',
  },
  PUERTO_SAN_LORENZO_DESCARGA: {
    siteId: 'san_lorenzo',
    logicalSector: 'S4',
    label: 'Descarga San Lorenzo (no instalada)',
  },
  PUERTO_SAN_LORENZO_BALANZA_SALIDA: {
    siteId: 'san_lorenzo',
    logicalSector: 'S5',
    label: 'Balanza salida San Lorenzo',
  },
  PUERTO_SAN_LORENZO_EGRESO_CAMIONES: {
    siteId: 'san_lorenzo',
    logicalSector: 'S7',
    label: 'Egreso camiones San Lorenzo',
  },
  PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1: {
    siteId: 'san_lorenzo',
    logicalSector: 'S10',
    label: 'Líquidos punto 1 San Lorenzo',
  },
}

/** Placeholder alineado con raw cuando aún no hay fila en REAL_SECTOR_CODE_MAP */
export const UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER = '?' as const

export function lookupRealSectorCode(sectorCode: string): RealSectorMappingEntry | undefined {
  const key = (sectorCode ?? '').trim()
  if (!key) return undefined
  return REAL_SECTOR_CODE_MAP[key] ?? REAL_SECTOR_CODE_MAP[key.toUpperCase()]
}
