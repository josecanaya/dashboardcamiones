import type { CircuitClassificationEntry } from './etlCircuitClassificationIndex'
import { parseCsvToRecords } from './etlCsvParse'

export type JourneyProductLookup = {
  byJourneyId: Map<string, string>
  products: string[]
}

export const PRODUCT_FILTER_ALL = 'ALL'

/** Producto por journey desde merge Truckflow + Movimientos por Contrato. */
export function parseJourneyProductLookup(mergeCsv: string | undefined): JourneyProductLookup | null {
  if (!mergeCsv?.trim()) return null
  const { rows } = parseCsvToRecords(mergeCsv)
  const byJourneyId = new Map<string, string>()
  const productSet = new Set<string>()
  for (const r of rows) {
    const product = String(r.product_normalized ?? '').trim()
    if (!product) continue
    const uid = String(r.journey_uid ?? r.journey_id ?? '').trim()
    if (uid) byJourneyId.set(uid, product)
    productSet.add(product)
  }
  if (!productSet.size) return null
  return { byJourneyId, products: [...productSet].sort((a, b) => a.localeCompare(b, 'es')) }
}

export function journeyIdsForProduct(lookup: JourneyProductLookup, product: string): Set<string> {
  const ids = new Set<string>()
  for (const [id, p] of lookup.byJourneyId) {
    if (p === product) ids.add(id)
  }
  return ids
}

export function filterClassificationEntriesByProduct(
  entries: CircuitClassificationEntry[],
  lookup: JourneyProductLookup | null,
  product: string
): CircuitClassificationEntry[] {
  if (!lookup || !product || product === PRODUCT_FILTER_ALL) return entries
  const ids = journeyIdsForProduct(lookup, product)
  return entries.filter((e) => ids.has(e.journeyId))
}

export function productForJourney(lookup: JourneyProductLookup | null, journeyId: string): string {
  if (!lookup || !journeyId) return ''
  return lookup.byJourneyId.get(journeyId) ?? ''
}
