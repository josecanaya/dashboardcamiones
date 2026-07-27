/**
 * Matriz operativa — Ricardone y San Lorenzo.
 * Códigos de columna (R1…, SL1…) según planillas.
 *
 * El filtrado se resuelve SOLO por código de matriz (R…, SL…). No se infieren equivalencias
 * con los códigos legacy A/B/E del simulador: el mapa previo (MATRIX_CODE_TO_LEGACY_TRIP_BASES)
 * asignaba bases con reglas fabricadas (`idx % 2 ? B1 : B2` para R26-R34 y
 * `E{min(idx+1,5)}` para SL8-SL15, que colapsaba SL12-SL15 en E5). Un viaje sin código
 * reconocido no se hace coincidir con ningún circuito concreto.
 */

import type { SiteId } from '../domain/sites'
import type { HistoricalTrip } from '../domain/logistics'

export type KpiMatrixPlant = 'ricardone' | 'san_lorenzo'

export type KpiOperationKind = 'recepcion' | 'despacho' | 'transile_interno' | 'transile_externo'

export const KPI_OPERATION_LABELS: Record<KpiOperationKind, string> = {
  recepcion: 'Recepción',
  despacho: 'Despacho',
  transile_interno: 'Transile interno',
  transile_externo: 'Transile externo',
}

export const MATRIX_CODES_BY_PLANT_OP: Record<KpiMatrixPlant, Record<KpiOperationKind, string[]>> = {
  ricardone: {
    recepcion: Array.from({ length: 8 }, (_, i) => `R${i + 1}`),
    despacho: Array.from({ length: 8 }, (_, i) => `R${i + 9}`),
    transile_interno: Array.from({ length: 18 }, (_, i) => `R${i + 17}`),
    transile_externo: [],
  },
  san_lorenzo: {
    recepcion: ['R7', 'SL1', 'SL2', 'SL3'],
    despacho: ['SL4', 'SL5', 'SL6', 'SL7'],
    transile_interno: [],
    transile_externo: [
      ...Array.from({ length: 9 }, (_, i) => `R${26 + i}`),
      ...Array.from({ length: 8 }, (_, i) => `SL${8 + i}`),
    ],
  },
}

export function supportsKpiCircuitMatrix(siteId: SiteId): siteId is KpiMatrixPlant {
  return siteId === 'ricardone' || siteId === 'san_lorenzo'
}

export function operationsAvailableForPlant(siteId: SiteId): KpiOperationKind[] {
  if (!supportsKpiCircuitMatrix(siteId)) return []
  const o = MATRIX_CODES_BY_PLANT_OP[siteId]
  return (Object.keys(o) as KpiOperationKind[]).filter((k) => o[k].length > 0)
}

export function circuitsForPlantOperation(siteId: KpiMatrixPlant, operation: KpiOperationKind): string[] {
  return MATRIX_CODES_BY_PLANT_OP[siteId][operation] ?? []
}

/** Código matriz del viaje (R7, R5_R6, …) o legacy A7/B3. */
export function tripMatrixOrCatalogCode(trip: HistoricalTrip): string {
  return (trip.catalogCode ?? trip.circuitoFinal ?? '').trim().toUpperCase()
}

function tripMatchesMatrixCodeList(tripCode: string, codes: string[]): boolean {
  if (!tripCode) return false
  const normalizedCodes = codes.map((c) => c.toUpperCase())
  if (normalizedCodes.includes(tripCode)) return true
  if (tripCode.includes('_')) {
    const parts = tripCode.split('_').filter((p) => /^R\d+$/.test(p) || /^SL\d+$/.test(p))
    if (parts.some((p) => normalizedCodes.includes(p))) return true
  }
  return false
}

export function tripMatchesKpiMatrixFilter(
  trip: HistoricalTrip,
  siteId: SiteId,
  operation: KpiOperationKind,
  /** null = todos los circuitos del tipo */
  matrixCode: string | null
): boolean {
  if (!supportsKpiCircuitMatrix(siteId) || trip.siteId !== siteId) return true
  const codes =
    matrixCode != null ? [matrixCode] : MATRIX_CODES_BY_PLANT_OP[siteId][operation]
  if (tripMatchesMatrixCodeList(tripMatrixOrCatalogCode(trip), codes)) return true
  // Sin código R*/SL* reconocido no se infiere equivalencia con bases legacy:
  // el viaje solo entra en la vista agregada ("todos los circuitos del tipo").
  return matrixCode == null
}

/** Circuitos presentes en datos Truckflow (p. ej. R5_R6) no listados en la matriz fija. */
export function extraMatrixCodesFromTrips(trips: HistoricalTrip[], siteId: SiteId): string[] {
  if (!supportsKpiCircuitMatrix(siteId)) return []
  const standard = new Set<string>()
  for (const op of Object.keys(MATRIX_CODES_BY_PLANT_OP[siteId]) as KpiOperationKind[]) {
    for (const c of MATRIX_CODES_BY_PLANT_OP[siteId][op]) standard.add(c)
  }
  const seen = new Set<string>()
  for (const t of trips) {
    if (t.siteId !== siteId) continue
    const code = tripMatrixOrCatalogCode(t)
    if (!code || standard.has(code)) continue
    seen.add(code)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** Mantiene todos los viajes de otras plantas; en `focusedSiteId` aplica matriz operación/circuito. */
export function filterTripsForKpiContext(
  trips: HistoricalTrip[],
  focusedSiteId: SiteId,
  operation: KpiOperationKind,
  matrixCode: string | null
): HistoricalTrip[] {
  return trips.filter((t) => {
    if (t.siteId !== focusedSiteId) return true
    if (!supportsKpiCircuitMatrix(focusedSiteId)) return true
    return tripMatchesKpiMatrixFilter(t, focusedSiteId, operation, matrixCode)
  })
}
