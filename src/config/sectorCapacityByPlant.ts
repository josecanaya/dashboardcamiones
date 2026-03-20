/**
 * Capacidad máxima de camiones por sector según DENSIDAD CAMARAS.
 * Criterios: Playa = 0,010101 camiones/m2, Camino = 0,0056 camiones/m2.
 * Un sector se considera saturado cuando count >= capacidad.
 *
 * San Lorenzo y Ricardone: datos del archivo de densidades.
 * Avellaneda: SIN DATOS.
 */

import type { SiteId } from '../domain/sites'

/** Capacidad máxima de camiones por sector (saturación cuando count >= este valor) */
export type SectorCapacityMap = Record<string, number>

/**
 * San Lorenzo — zonas del archivo mapeadas a sectores:
 * S0-S1 u S2: 92 | S2: 2 | S1: 2 | S1-S3: 13 | S3-S4: 17 | S3-S6: 28
 * S4-S5: 20 | S5-S7: 14 | S5-S8: 24 | S8-S2 o S1: 11 | S10: 11
 */
export const SECTOR_CAPACITY_SAN_LORENZO: SectorCapacityMap = {
  S0: 92,   // S0-S1 u S2 (playa compartida)
  S1: 2,    // S1 (camino)
  S2: 2,    // S2 (camino)
  S3: 13,   // S1-S3 (más restrictivo que S3-S4)
  S4: 17,   // S3-S4 (más restrictivo que S4-S5)
  S5: 14,   // S5-S7
  S6: 28,   // S3-S6
  S7: 14,   // S5-S7
  S8: 11,   // S8-S2 o S1
  S10: 11,
}

/**
 * Ricardone — zonas del archivo mapeadas a sectores:
 * S0-S1: 28 | S1-S2: 263 | S2-S3: 39 | S2-S4: 73 | S4-S5: 14
 * S6: 141 | Playa espera: 202 | Pulmon: 44
 */
export const SECTOR_CAPACITY_RICARDONE: SectorCapacityMap = {
  S0: 28,   // S0-S1
  S1: 263,  // S1-S2 (playa)
  S2: 39,   // S2-S3 (más restrictivo que S2-S4)
  S3: 39,   // S2-S3
  S4: 14,   // S4-S5
  S5: 14,   // S4-S5
  S6: 141,  // S6 (playa)
  S7: 44,   // Pulmon (fallback)
  S8: 44,   // Pulmon (fallback)
  S9: 44,   // Pulmon (fallback)
  S10: 44,  // Pulmon (fallback)
}

/** Avellaneda: sin datos de capacidad por sector */
export const SECTOR_CAPACITY_AVELLANEDA: SectorCapacityMap | null = null

export function getSectorCapacityByPlant(siteId: SiteId): SectorCapacityMap | null {
  switch (siteId) {
    case 'san_lorenzo':
      return SECTOR_CAPACITY_SAN_LORENZO
    case 'ricardone':
      return SECTOR_CAPACITY_RICARDONE
    case 'avellaneda':
      return SECTOR_CAPACITY_AVELLANEDA
    default:
      return null
  }
}

export function hasSectorCapacityData(siteId: SiteId): boolean {
  return getSectorCapacityByPlant(siteId) != null
}
