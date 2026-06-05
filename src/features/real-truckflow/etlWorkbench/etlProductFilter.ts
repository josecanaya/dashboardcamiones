import type { CircuitClassificationEntry } from './etlCircuitClassificationIndex'
import { parseExcelFirstByJourneyUid } from './etlCircuitClassificationIndex'
import { parseCsvToRecords } from './etlCsvParse'

export type JourneyProductLookup = {
  byJourneyId: Map<string, string>
  products: string[]
}

export const PRODUCT_FILTER_ALL = 'ALL'

/** Productos de la muestra operativa en Resumen ejecutivo (Excel-first). */
export const EXECUTIVE_SAMPLE_PRODUCTS = ['SOJA', 'GIRASOL', 'ACEITE'] as const

export type ExecutiveSampleProduct = (typeof EXECUTIVE_SAMPLE_PRODUCTS)[number]

const EXECUTIVE_SAMPLE_PRODUCT_LABELS: Record<string, string> = {
  [PRODUCT_FILTER_ALL]: 'Todos',
  SOJA: 'Soja',
  GIRASOL: 'Girasol',
  ACEITE: 'Aceite',
}

export function executiveSampleProductLabel(product: string): string {
  return EXECUTIVE_SAMPLE_PRODUCT_LABELS[product.toUpperCase()] ?? product
}

/** Coincide producto Excel con filtro de muestra (ACEITE incluye variantes ACEITE *). */
export function productMatchesExecutiveSampleFilter(product: string, filter: string): boolean {
  const p = String(product ?? '').trim().toUpperCase()
  const f = String(filter ?? '').trim().toUpperCase()
  if (!f || f === PRODUCT_FILTER_ALL) return true
  if (f === 'ACEITE') return p === 'ACEITE' || p.startsWith('ACEITE ')
  return p === f
}

/** Producto embebido en motivo comité tras conciliación Excel-first. */
export function parseExcelProductFromCommitteeReason(committeeReason: string): string {
  const reason = String(committeeReason ?? '').trim()
  const match = reason.match(/^EXCEL_(?:PLATAFORMA|CONTRATO):([^@]+)@/i)
  return match?.[1]?.trim() ?? ''
}

/** Producto operativo para filtrar: conciliación Excel > lookup por journey. */
export function resolveProductForClassificationEntry(
  entry: { journeyId: string; committeeReason?: string },
  lookup: JourneyProductLookup | null
): string {
  const fromReason = parseExcelProductFromCommitteeReason(entry.committeeReason ?? '')
  if (fromReason) return fromReason
  return lookup?.byJourneyId.get(entry.journeyId) ?? ''
}

/** Producto por journey desde merge Truckflow + Movimientos por Contrato. */
export function parseJourneyProductLookup(mergeCsv: string | undefined): JourneyProductLookup | null {
  if (!mergeCsv?.trim()) return null
  const { rows } = parseCsvToRecords(mergeCsv)
  const byJourneyId = new Map<string, string>()
  const productSet = new Set<string>()
  for (const r of rows) {
    const product = String(r.product_normalized ?? r.resolved_product ?? '').trim()
    if (!product) continue
    const uid = String(r.journey_uid ?? r.journey_id ?? '').trim()
    if (uid) byJourneyId.set(uid, product)
    productSet.add(product)
  }
  if (!productSet.size) return null
  return { byJourneyId, products: [...productSet].sort((a, b) => a.localeCompare(b, 'es')) }
}

/**
 * Producto por journey desde operaciones Excel-first.
 * Usa la misma regla de mejor match por journey_uid que la conciliación comité.
 */
export function parseExcelFirstProductLookup(excelOpsCsv: string | undefined): JourneyProductLookup | null {
  if (!excelOpsCsv?.trim()) return null
  const byJourney = parseExcelFirstByJourneyUid(excelOpsCsv)
  const byJourneyId = new Map<string, string>()
  const productSet = new Set<string>()

  for (const [uid, lite] of byJourney) {
    const product = lite.product_normalized
    if (!product) continue
    byJourneyId.set(uid, product)
    productSet.add(product)
  }

  const { rows } = parseCsvToRecords(excelOpsCsv)
  for (const r of rows) {
    const product = String(r.resolved_product ?? r.product_normalized ?? '').trim()
    if (!product) continue
    productSet.add(product)
    const operationId = String(r.external_operation_id ?? '').trim()
    if (operationId && !byJourneyId.has(operationId)) {
      byJourneyId.set(operationId, product)
    }
  }

  if (!productSet.size) return null
  return { byJourneyId, products: [...productSet].sort((a, b) => a.localeCompare(b, 'es')) }
}

/** Prefiere Excel-first; fallback al merge Truckflow-first (diagnóstico). */
export function resolveAnalysisProductLookup(
  csv:
    | {
        excel_operations_with_truckflow?: string
        merged_truckflow_movimientos?: string
      }
    | undefined
): JourneyProductLookup | null {
  if (!csv) return null
  return (
    parseExcelFirstProductLookup(csv.excel_operations_with_truckflow) ??
    parseJourneyProductLookup(csv.merged_truckflow_movimientos)
  )
}

export function journeyIdsForProduct(lookup: JourneyProductLookup, product: string): Set<string> {
  const ids = new Set<string>()
  for (const [id, p] of lookup.byJourneyId) {
    if (productMatchesExecutiveSampleFilter(p, product)) ids.add(id)
  }
  return ids
}

export type ExecutiveProductFilterPlan = {
  counts: Record<string, number>
  journeyIdsByProduct: Map<string, Set<string>>
}

/** Un solo recorrido sobre entries para conteos Soja/Girasol/Aceite (evita O(n×k) por render). */
export function buildExecutiveProductFilterPlan(
  entries: CircuitClassificationEntry[],
  lookup: JourneyProductLookup | null
): ExecutiveProductFilterPlan {
  const counts: Record<string, number> = {
    [PRODUCT_FILTER_ALL]: entries.length,
  }
  const journeyIdsByProduct = new Map<string, Set<string>>()
  for (const sample of EXECUTIVE_SAMPLE_PRODUCTS) {
    counts[sample] = 0
    journeyIdsByProduct.set(sample, new Set())
  }

  for (const entry of entries) {
    const product = resolveProductForClassificationEntry(entry, lookup)
    if (!product) continue
    for (const sample of EXECUTIVE_SAMPLE_PRODUCTS) {
      if (!productMatchesExecutiveSampleFilter(product, sample)) continue
      counts[sample] = (counts[sample] ?? 0) + 1
      journeyIdsByProduct.get(sample)!.add(entry.journeyId)
    }
  }
  return { counts, journeyIdsByProduct }
}

export function filterClassificationEntriesByJourneyIds(
  entries: CircuitClassificationEntry[],
  ids: Set<string> | null | undefined
): CircuitClassificationEntry[] {
  if (!ids?.size) return ids ? [] : entries
  return entries.filter((e) => ids.has(e.journeyId))
}

export function filterClassificationEntriesByProduct(
  entries: CircuitClassificationEntry[],
  lookup: JourneyProductLookup | null,
  product: string
): CircuitClassificationEntry[] {
  if (!product || product === PRODUCT_FILTER_ALL) return entries
  return entries.filter((e) =>
    productMatchesExecutiveSampleFilter(resolveProductForClassificationEntry(e, lookup), product)
  )
}

export function productForJourney(
  lookup: JourneyProductLookup | null,
  journeyId: string,
  committeeReason?: string
): string {
  if (!journeyId) return ''
  const fromReason = parseExcelProductFromCommitteeReason(committeeReason ?? '')
  if (fromReason) return fromReason
  return lookup?.byJourneyId.get(journeyId) ?? ''
}
