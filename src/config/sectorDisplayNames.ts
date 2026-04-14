/**
 * Nombres operativos por código de sector (S0…S10) para tablas y reportes.
 * Ajustable por planta si hace falta.
 */

import type { SiteId } from '../domain/sites'

/** Etiqueta por defecto (circuito típico: preingreso → ingreso → calada → …). */
const SECTOR_NAME_DEFAULT: Record<string, string> = {
  S0: 'Preingreso',
  S1: 'Ingreso',
  S2: 'Calada',
  S3: 'Tramo S3',
  S4: 'Balanza',
  S5: 'Descarga / tránsito',
  S6: 'Sector S6',
  S7: 'Sector S7',
  S8: 'Sector S8',
  S9: 'Sector S9',
  S10: 'Egreso',
}

/** San Lorenzo — refina etiquetas si difieren del default. */
const SECTOR_NAME_SAN_LORENZO: Partial<Record<string, string>> = {
  S3: 'Enlace S1–S3',
  S4: 'Balanza / playa',
  S5: 'Descarga',
  S6: 'Tramo S3–S6',
  S7: 'Enlace S5–S7',
  S8: 'Enlace S8–S2',
  S10: 'Egreso final',
}

/**
 * Ricardone — sectores y cámaras (referencia operativa).
 * Cantidad de cámaras: S0×2, S1×4, S2×7, S3×2, S4×6, S5×4, S6—, S7×3, S8×2, S9×2, S10×2
 */
const SECTOR_NAME_RICARDONE: Record<string, string> = {
  S0: 'Ingreso a Planta',
  S1: 'Pre-ingreso',
  S2: 'Calada',
  S3: 'Salida 1',
  S4: 'Balanza',
  S5: 'Celda 16',
  S6: 'Punto de paso',
  S7: 'Puntos de carga/descarga',
  S8: 'Punto de carga',
  S9: 'Volcable 1 / Volcable 2',
  S10: 'Salida 2',
}

export function getSectorDisplayName(siteId: SiteId, sectorId: string): string {
  const id = sectorId.trim().toUpperCase()
  if (!/^S\d+$/i.test(id)) return sectorId
  if (siteId === 'ricardone') {
    return SECTOR_NAME_RICARDONE[id] ?? SECTOR_NAME_DEFAULT[id] ?? `Sector ${id}`
  }
  const overrides = siteId === 'san_lorenzo' ? SECTOR_NAME_SAN_LORENZO : {}
  return overrides[id] ?? SECTOR_NAME_DEFAULT[id] ?? `Sector ${id}`
}
