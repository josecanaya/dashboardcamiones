/**
 * Sección ejecutiva del informe: muestra por producto y distribución por circuito.
 *
 * Reusa la MISMA cadena que arma el Resumen ejecutivo del dashboard —
 * `buildCircuitClassificationIndex` → `buildExecutiveProductFilterPlan` →
 * `buildExecutiveCircuitBarSlices`— y solo agrega el recorte al período exacto.
 *
 * ## Denominador
 *
 * Esto cuenta **recorridos de cámara clasificados**, no movimientos del Excel. Son
 * poblaciones distintas y el informe lo declara: «X recorridos de cámara» ≠ «X movimientos
 * según Excel». La distribución por circuito de la plantilla vive dentro de la sección de
 * cada producto, así que se calcula por producto.
 *
 * ## Recorte al período
 *
 * `debug_matrix_classification` trae `first_event_at`, así que el día operativo sale de la
 * propia fila y no hace falta joinear contra otra tabla.
 */
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import { recordsToCsv } from '../../../etl-core/csv'
import {
  buildCircuitClassificationIndex,
  buildExecutiveCircuitBarSlices,
  type CircuitClassificationEntry,
  type ExecutiveCircuitBarSlice,
} from '../etlWorkbench/etlCircuitClassificationIndex'
import {
  buildExecutiveProductFilterPlan,
  EXECUTIVE_SAMPLE_PRODUCTS,
  resolveAnalysisProductLookup,
} from '../etlWorkbench/etlProductFilter'
import { operationalDayOfIso } from '../etlWorkbench/etlOperationalDay'
import type { ReportPeriod } from './logisticsReportPeriod'

export type EjecutivoInput = {
  debugMatrixCsv?: string
  mergedTruckflowCsv?: string
  excelOperationsCsv?: string
}

export type CircuitCount = { code: string; label: string; count: number }

export type EjecutivoSection = {
  /** Recorridos clasificados dentro del período exacto. */
  recorridosEnPeriodo: number
  /** Recorridos por producto (SOJA / GIRASOL / ACEITE / PELLET). */
  porProducto: Record<string, number>
  /** Distribución por circuito dentro de cada producto. */
  circuitosPorProducto: Record<string, CircuitCount[]>
  /** Distribución por circuito de todo el período, sin filtrar por producto. */
  circuitosTotales: CircuitCount[]
  /** `true` si no hay insumo para calcular nada. */
  missing: boolean
}

const EMPTY: EjecutivoSection = {
  recorridosEnPeriodo: 0,
  porProducto: {},
  circuitosPorProducto: {},
  circuitosTotales: [],
  missing: true,
}

function toCounts(slices: ExecutiveCircuitBarSlice[]): CircuitCount[] {
  return slices.map((s) => ({ code: s.code, label: s.displayLabel || s.label, count: s.count }))
}

/**
 * Recorta un CSV a las filas cuyo día operativo (22:00) cae dentro del período.
 *
 * El recorte se hace **sobre el CSV, antes** de construir el índice, y no filtrando las
 * entries después. Motivo: `buildCircuitClassificationIndex` canonicaliza el uid del journey
 * (los tres formatos de NIVELES_ABCD — crudo, fusionado y de ciclo — se normalizan y las
 * partes de un fusionado se ordenan), así que `entry.journeyId` ya no coincide con el
 * `journey_id` crudo de la tabla. Filtrando después se perdían 2.600 de 3.056 recorridos en
 * silencio.
 */
function filterCsvToPeriod(
  csv: string,
  period: ReportPeriod,
  dateColumn: string
): { csv: string; rowsIn: number; rowsTotal: number } {
  const days = new Set(period.days)
  const { headers, rows } = parseCsvToRecords(csv)
  const kept = rows.filter((r) => days.has(operationalDayOfIso(String(r[dateColumn] ?? ''))))
  return { csv: recordsToCsv(headers, kept), rowsIn: kept.length, rowsTotal: rows.length }
}

export function buildEjecutivoSection(
  input: EjecutivoInput,
  period: ReportPeriod
): EjecutivoSection {
  if (!input.debugMatrixCsv?.trim()) return { ...EMPTY }

  // Recorte al período ANTES de clasificar (ver `filterCsvToPeriod`).
  const debugMatrix = filterCsvToPeriod(input.debugMatrixCsv, period, 'first_event_at')
  // Las operaciones Excel también se recortan: promueven entries propias al índice.
  const excelInPeriod = input.excelOperationsCsv?.trim()
    ? filterCsvToPeriod(input.excelOperationsCsv, period, 'external_ingreso_at').csv
    : undefined

  const index = buildCircuitClassificationIndex(
    debugMatrix.csv,
    // El merge va entero: acá solo se usa como fallback de producto, no para contar.
    input.mergedTruckflowCsv,
    excelInPeriod
  )
  const entries: CircuitClassificationEntry[] = index.entries
  if (!entries.length) {
    return { ...EMPTY, missing: debugMatrix.rowsTotal === 0 }
  }

  const lookup = resolveAnalysisProductLookup({
    excel_operations_with_truckflow: excelInPeriod,
    merged_truckflow_movimientos: input.mergedTruckflowCsv,
  })
  const plan = buildExecutiveProductFilterPlan(entries, lookup)

  const porProducto: Record<string, number> = {}
  const circuitosPorProducto: Record<string, CircuitCount[]> = {}
  for (const product of EXECUTIVE_SAMPLE_PRODUCTS) {
    porProducto[product] = plan.counts[product] ?? 0
    const ids = plan.journeyIdsByProduct.get(product)
    const productEntries = ids ? entries.filter((e) => ids.has(e.journeyId)) : []
    circuitosPorProducto[product] = toCounts(buildExecutiveCircuitBarSlices(productEntries))
  }

  return {
    recorridosEnPeriodo: entries.length,
    porProducto,
    circuitosPorProducto,
    circuitosTotales: toCounts(buildExecutiveCircuitBarSlices(entries)),
    missing: false,
  }
}
