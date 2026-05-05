/**
 * Matriz operativa — Ricardone y San Lorenzo.
 * Códigos de columna (R1…, SL1…) según planillas; el mock actual usa bases A/B/E en historico_recorridos.
 * @see MATRIX_CODE_TO_LEGACY_TRIP_BASES para el cruce con inferredCircuitCode.
 */

import type { SiteId } from '../domain/sites'
import type { HistoricalTrip } from '../domain/logistics'
import { getCodigoBase } from '../data/masterCircuitCatalog'

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

function buildRicardoneLegacyMap(): Record<string, string[]> {
  const m: Record<string, string[]> = {}
  for (let i = 1; i <= 7; i++) m[`R${i}`] = [`A${i}`]
  m.R8 = []
  for (let j = 9; j <= 16; j++) m[`R${j}`] = [`B${j - 8}`]
  for (let k = 17; k <= 21; k++) m[`R${k}`] = [`E${k - 16}`]
  for (let k = 22; k <= 34; k++) m[`R${k}`] = []
  return m
}

function buildSanLorenzoLegacyMap(): Record<string, string[]> {
  const m: Record<string, string[]> = {}
  for (const c of ['SL1', 'SL2', 'SL3', 'R7']) m[c] = ['A1']
  const desp = ['SL4', 'SL5', 'SL6', 'SL7']
  desp.forEach((c, idx) => {
    m[c] = [`B${idx + 1}`]
  })
  Array.from({ length: 9 }, (_, i) => `R${26 + i}`).forEach((c, idx) => {
    m[c] = idx % 2 === 0 ? ['B1'] : ['B2']
  })
  Array.from({ length: 8 }, (_, i) => `SL${8 + i}`).forEach((c, idx) => {
    m[c] = [`E${Math.min(idx + 1, 5)}`]
  })
  return m
}

/** Equivalencias matriz → códigos de viaje del mock/simulador (getCodigoBase). */
export const MATRIX_CODE_TO_LEGACY_TRIP_BASES: Record<KpiMatrixPlant, Record<string, string[]>> = {
  ricardone: buildRicardoneLegacyMap(),
  san_lorenzo: buildSanLorenzoLegacyMap(),
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

function collectLegacyBases(
  plant: KpiMatrixPlant,
  matrixCodes: string[]
): Set<string> {
  const bases = new Set<string>()
  const map = MATRIX_CODE_TO_LEGACY_TRIP_BASES[plant]
  for (const code of matrixCodes) {
    for (const b of map[code] ?? []) bases.add(b.toUpperCase())
  }
  return bases
}

export function tripMatchesKpiMatrixFilter(
  trip: HistoricalTrip,
  siteId: SiteId,
  operation: KpiOperationKind,
  /** null = todos los circuitos del tipo */
  matrixCode: string | null
): boolean {
  if (!supportsKpiCircuitMatrix(siteId) || trip.siteId !== siteId) return true
  const plant = siteId
  const codes =
    matrixCode != null ? [matrixCode] : MATRIX_CODES_BY_PLANT_OP[plant][operation]
  const allowed = collectLegacyBases(plant, codes)
  if (allowed.size === 0) return true
  const raw = trip.catalogCode ?? trip.circuitoFinal ?? ''
  const base = getCodigoBase(raw).toUpperCase()
  return allowed.has(base)
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
