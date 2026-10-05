/**
 * Sección ejecutiva del informe: movimientos por producto y circuitos de cámara.
 *
 * Los productos se cuentan sobre `excel_operations_with_truckflow` (movimientos
 * del Excel). La clasificación y el total de recorridos salen de `final_circuits`.
 * Ambas poblaciones se conservan separadas para no presentar journeys como movimientos.
 */
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import {
  EXECUTIVE_SAMPLE_PRODUCTS,
  productMatchesExecutiveSampleFilter,
} from '../etlWorkbench/etlProductFilter'
import { operationalDayOfIso } from '../etlWorkbench/etlOperationalDay'
import type { ReportPeriod } from './logisticsReportPeriod'

export type EjecutivoInput = {
  finalCircuitsCsv?: string
  excelOperationsCsv?: string
  /** Solo aporta la fecha de corte de corridas históricas sin timestamp en final_circuits. */
  debugMatrixCsv?: string
}

export type CircuitCount = { code: string; label: string; count: number }

export type EjecutivoSection = {
  /** Recorridos de cámara clasificados en `final_circuits`. */
  recorridosEnPeriodo: number
  /** Movimientos Excel por producto (SOJA / GIRASOL / ACEITE / PELLET). */
  porProducto: Record<string, number>
  /** Movimientos Excel por producto y circuito resuelto. */
  circuitosPorProducto: Record<string, CircuitCount[]>
  /** Recorridos de cámara clasificados por circuito. */
  circuitosTotales: CircuitCount[]
  /** `true` si faltan ambas fuentes canónicas. */
  missing: boolean
}

export const EMPTY: EjecutivoSection = {
  recorridosEnPeriodo: 0,
  porProducto: {},
  circuitosPorProducto: {},
  circuitosTotales: [],
  missing: true,
}

function dayOf(row: Record<string, string>): string {
  const sourceDay = String(row.source_date ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(sourceDay)
    ? sourceDay
    : operationalDayOfIso(String(row.external_ingreso_at ?? ''))
}

function countCircuits(rows: Record<string, string>[], codeKey: string, labelKey: string): CircuitCount[] {
  const counts = new Map<string, CircuitCount>()
  for (const row of rows) {
    const code = String(row[codeKey] ?? '').trim()
    if (!code || code === 'SIN_PUNTO') continue
    const current = counts.get(code)
    if (current) current.count += 1
    else counts.set(code, { code, label: String(row[labelKey] ?? code).trim() || code, count: 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
}

function finalCircuitDays(debugMatrixCsv: string | undefined): Map<string, string> {
  const days = new Map<string, string>()
  if (!debugMatrixCsv?.trim()) return days
  for (const row of parseCsvToRecords(debugMatrixCsv).rows) {
    const id = String(row.journey_id ?? row.journey_uid ?? '').trim()
    const day = operationalDayOfIso(String(row.first_event_at ?? ''))
    if (id && day) days.set(id, day)
  }
  return days
}

export function buildEjecutivoSection(input: EjecutivoInput, period: ReportPeriod): EjecutivoSection {
  const periodDays = new Set(period.days)
  const finalRows = input.finalCircuitsCsv?.trim() ? parseCsvToRecords(input.finalCircuitsCsv).rows : []
  const daysByJourney = finalCircuitDays(input.debugMatrixCsv)
  const finalInPeriod = finalRows.filter((row) => {
    const id = String(row.journey_uid ?? '').trim()
    const day = daysByJourney.get(id)
    // `final_circuits` antiguo no llevaba timestamp: sin fecha no se lo usa para cortes parciales.
    return Boolean(day && periodDays.has(day))
  })

  const excelRows = input.excelOperationsCsv?.trim() ? parseCsvToRecords(input.excelOperationsCsv).rows : []
  const excelInPeriod = excelRows.filter((row) => periodDays.has(dayOf(row)))
  const porProducto: Record<string, number> = {}
  const circuitosPorProducto: Record<string, CircuitCount[]> = {}
  for (const product of EXECUTIVE_SAMPLE_PRODUCTS) {
    const rows = excelInPeriod.filter((row) =>
      productMatchesExecutiveSampleFilter(String(row.resolved_product ?? row.product_normalized ?? ''), product)
    )
    const unique = new Map(rows.map((row) => [String(row.external_operation_id ?? '').trim() || JSON.stringify(row), row]))
    const movements = [...unique.values()]
    porProducto[product] = movements.length
    circuitosPorProducto[product] = countCircuits(
      movements,
      'resolved_executive_circuit_code',
      'resolved_circuit_family'
    )
  }

  return {
    recorridosEnPeriodo: new Set(finalInPeriod.map((row) => String(row.journey_uid ?? '').trim())).size,
    porProducto,
    circuitosPorProducto,
    circuitosTotales: countCircuits(finalInPeriod, 'executive_circuit_code', 'executive_circuit_label'),
    missing: finalRows.length === 0 && excelRows.length === 0,
  }
}
