import type { CircuitClassificationEntry } from './etlCircuitClassificationIndex'
import {
  excelOpsHasData,
  excelOpsRows,
  parseExcelFirstByJourneyUid,
  type ExcelOpsSource,
} from './etlCircuitClassificationIndex'
import { parseCsvToRecords } from './etlCsvParse'
import { isAceiteExecutiveCircuitCode, isAceiteAnalysisExcludedPlant, isExcelLiquidProductName } from './slLiquidCameras'
import { isPelletExcelProduct } from '../../../etl-core/reports/transileExternoCiclo'

export type JourneyProductLookup = {
  byJourneyId: Map<string, string>
  products: string[]
  /**
   * Journeys / excel:ops de plantas Avellaneda o Renopack — fuera del filtro Aceite.
   */
  aceiteExcludedJourneyIds?: Set<string>
}

export const PRODUCT_FILTER_ALL = 'ALL'

/** Productos de la muestra operativa en Resumen ejecutivo (Excel-first). */
export const EXECUTIVE_SAMPLE_PRODUCTS = ['SOJA', 'GIRASOL', 'ACEITE', 'PELLET'] as const

export type ExecutiveSampleProduct = (typeof EXECUTIVE_SAMPLE_PRODUCTS)[number]

export const PRODUCT_FILTER_ACEITE: ExecutiveSampleProduct = 'ACEITE'
export const PRODUCT_FILTER_PELLET: ExecutiveSampleProduct = 'PELLET'

const EXECUTIVE_SAMPLE_PRODUCT_LABELS: Record<string, string> = {
  [PRODUCT_FILTER_ALL]: 'Todos',
  SOJA: 'Soja',
  GIRASOL: 'Girasol',
  ACEITE: 'Aceite',
  PELLET: 'Pellet',
}

export function executiveSampleProductLabel(product: string): string {
  return EXECUTIVE_SAMPLE_PRODUCT_LABELS[product.toUpperCase()] ?? product
}

/** Filtro Aceite: no incluir R7/R5/R6 de matriz aunque el merge traiga producto líquido. */
function entryBelongsToAceiteExecutiveView(
  entry: CircuitClassificationEntry,
  product: string,
  lookup: JourneyProductLookup | null
): boolean {
  if (!productMatchesExecutiveSampleFilter(product, 'ACEITE')) return false
  if (lookup?.aceiteExcludedJourneyIds?.has(entry.journeyId)) return false
  if (isAceiteAnalysisExcludedPlant(entry.site)) return false
  if (entry.journeyId.startsWith('excel:')) return true
  if (parseExcelProductFromCommitteeReason(entry.committeeReason ?? '')) return true
  if (isAceiteExecutiveCircuitCode(entry.executiveCircuitCode)) return true
  if (SOLID_ROUTE_EXECUTIVE_FOR_ACEITE_VIEW.has(entry.executiveCircuitCode)) return false
  return true
}

const SOLID_ROUTE_EXECUTIVE_FOR_ACEITE_VIEW = new Set(['R7', 'R5', 'R6'])

/** Coincide producto Excel con filtro de muestra (ACEITE = aceites y AC GIRASOL / girasol industrial). */
export function productMatchesExecutiveSampleFilter(product: string, filter: string): boolean {
  const p = String(product ?? '').trim().toUpperCase()
  const f = String(filter ?? '').trim().toUpperCase()
  if (!f || f === PRODUCT_FILTER_ALL) return true
  if (f === 'ACEITE') return isExcelLiquidProductName(p)
  // Pellet primero: "PELLETS GIRASOL" es pellet, no girasol. Y no alcanza con
  // startsWith: "CASCARA DE SOJA PELLETEADA" y "EXPELLER" también son pellet, y con
  // el prefijo quedaban sin chip (ni Pellet ni Soja) → invisibles hasta en «Todos».
  if (f === 'PELLET') return isPelletExcelProduct(p)
  if (isPelletExcelProduct(p)) return false
  if (f === 'GIRASOL') return p === 'GIRASOL' || p.startsWith('GIRASOL ')
  return p === f
}

/** Producto embebido en motivo comité tras conciliación Excel-first. */
export function parseExcelProductFromCommitteeReason(committeeReason: string): string {
  const reason = String(committeeReason ?? '').trim()
  // Acepta cualquier `EXCEL_<TOKEN>:<producto>@…` — se agregó EXCEL_PELLET_* y sin esto
  // el recorrido quedaba sin producto resuelto y por lo tanto sin chip.
  const match = reason.match(/^EXCEL_[A-Z_]+:([^@]+)@/i)
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
 * ¿La operación Excel tiene evidencia en Truckflow? (cámara lo vio en algún tramo).
 * Las tolvas de pellet 09–11 no tienen cámara, pero el recorrido pasa por otras
 * (preingreso, balanza…): un pellet con `evidence_count > 0` fue visto; con 0 no.
 */
function excelOpsRowHasTruckflowEvidence(r: Record<string, unknown>): boolean {
  const ev = Number(r.evidence_count ?? r.matched_journey_count ?? 0)
  if (Number.isFinite(ev) && ev > 0) return true
  return String(r.matched_journey_uids ?? '').trim().length > 0
}

/**
 * Regla pellet Excel-first: un movimiento por contrato de pellet solo entra al bucket
 * de producto PELLET si el camión tiene evidencia en Truckflow. Sin evidencia queda
 * fuera del bucket (movimiento sin verificar por cámara). Solo aplica a pellet; el
 * resto de productos entra siempre. [[sl3-camara-slztk400-y-exclusion-patentes]]
 */
function pelletExcelProductNeedsEvidence(product: string, hasEvidence: boolean): boolean {
  return isPelletExcelProduct(product) && !hasEvidence
}

/**
 * Producto por journey desde operaciones Excel-first.
 * Usa la misma regla de mejor match por journey_uid que la conciliación comité.
 */
export function parseExcelFirstProductLookup(excelOps: ExcelOpsSource): JourneyProductLookup | null {
  if (!excelOpsHasData(excelOps)) return null
  const byJourney = parseExcelFirstByJourneyUid(excelOps)
  const byJourneyId = new Map<string, string>()
  const productSet = new Set<string>()
  const aceiteExcludedJourneyIds = new Set<string>()

  const markExcluded = (r: Record<string, unknown>) => {
    if (
      !isAceiteAnalysisExcludedPlant(
        String(r.planta_normalized ?? ''),
        String(r.planta_original ?? '')
      )
    ) {
      return
    }
    const operationId = String(r.external_operation_id ?? '').trim()
    if (operationId) {
      aceiteExcludedJourneyIds.add(operationId)
      aceiteExcludedJourneyIds.add(`excel:${operationId}`)
    }
    for (const uid of String(r.matched_journey_uids ?? '')
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      aceiteExcludedJourneyIds.add(uid)
    }
  }

  for (const [uid, lite] of byJourney) {
    const product = lite.product_normalized
    if (!product) continue
    if (pelletExcelProductNeedsEvidence(product, lite.evidence_count > 0)) continue
    byJourneyId.set(uid, product)
    productSet.add(product)
    if (isAceiteAnalysisExcludedPlant(lite.planta_normalized)) {
      aceiteExcludedJourneyIds.add(uid)
    }
  }

  for (const r of excelOpsRows(excelOps)) {
    markExcluded(r)
    const product = String(r.resolved_product ?? r.product_normalized ?? '').trim()
    if (!product) continue
    if (pelletExcelProductNeedsEvidence(product, excelOpsRowHasTruckflowEvidence(r))) continue
    productSet.add(product)
    const operationId = String(r.external_operation_id ?? '').trim()
    if (operationId) {
      if (!byJourneyId.has(operationId)) byJourneyId.set(operationId, product)
      const excelJourneyId = `excel:${operationId}`
      if (!byJourneyId.has(excelJourneyId)) byJourneyId.set(excelJourneyId, product)
    }
  }

  if (!productSet.size) return null
  return {
    byJourneyId,
    products: [...productSet].sort((a, b) => a.localeCompare(b, 'es')),
    aceiteExcludedJourneyIds,
  }
}

/** Prefiere Excel-first; fallback al merge Truckflow-first (diagnóstico). */
export function resolveAnalysisProductLookup(
  source:
    | {
        excel_operations_with_truckflow?: string
        merged_truckflow_movimientos?: string
        excelOperationsRows?: readonly Record<string, unknown>[]
      }
    | undefined
): JourneyProductLookup | null {
  if (!source) return null
  return (
    parseExcelFirstProductLookup(source.excelOperationsRows ?? source.excel_operations_with_truckflow) ??
    parseJourneyProductLookup(source.merged_truckflow_movimientos)
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
  const counts: Record<string, number> = {}
  const journeyIdsByProduct = new Map<string, Set<string>>()
  const matchedAnyIds = new Set<string>()
  for (const sample of EXECUTIVE_SAMPLE_PRODUCTS) {
    counts[sample] = 0
    journeyIdsByProduct.set(sample, new Set())
  }

  for (const entry of entries) {
    const product = resolveProductForClassificationEntry(entry, lookup)
    if (!product) continue
    for (const sample of EXECUTIVE_SAMPLE_PRODUCTS) {
      if (!productMatchesExecutiveSampleFilter(product, sample)) continue
      // Aceite tiene una vista más restrictiva (no R7/R5/R6 de matriz sólida).
      if (sample === 'ACEITE' && !entryBelongsToAceiteExecutiveView(entry, product, lookup)) continue
      counts[sample] = (counts[sample] ?? 0) + 1
      journeyIdsByProduct.get(sample)!.add(entry.journeyId)
      matchedAnyIds.add(entry.journeyId)
    }
  }
  // "Todos" = unión de los 4 productos (Soja/Girasol/Aceite/Pellet), NO entries.length.
  // Los productos son disjuntos, así que la unión == la suma de los chips. Los recorridos
  // sin producto Excel resuelto quedan fuera del total (son cobertura faltante, ver UI).
  counts[PRODUCT_FILTER_ALL] = matchedAnyIds.size
  journeyIdsByProduct.set(PRODUCT_FILTER_ALL, matchedAnyIds)
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
