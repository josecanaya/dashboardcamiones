/**
 * Fuente Excel cruda (movimientos por contrato), antes del transform/scatter.
 */

import type { ExternalMovimientoContratoNormalized } from './etlExternalMovimientosContrato'
import { isSanLorenzoVolcablePtoPlatform } from './etlPlatformCircuitInference'
import type { ExcelMovimientoLike } from './auditExcelCameraMatrix'
import { RAW_AUDIT_CIRCUIT_CODES } from './auditExcelCameraMatrix'
import { extractCtgFromOperationId, dayKeyFromSalida } from './auditExcelCameraMatrix'

export const R7_TERMINAL_PORT_VOLCABLE_PLATFORMS = new Set([
  'VOLCABLE_PTO_1',
  'VOLCABLE_PTO_2',
  'VOLCABLE_PTO_3',
  'VOLCABLE_PTO_4',
  'VOLCABLE_PTO_5',
])

export type MovimientoContratoLike = Pick<
  ExternalMovimientoContratoNormalized,
  | 'external_operation_id'
  | 'ctg'
  | 'plate_normalized'
  | 'platform_normalized'
  | 'plataforma_original'
  | 'planta_normalized'
  | 'planta_original'
  | 'mov'
  | 'movement_type'
  | 'movement_type_detail'
  | 'external_ingreso_at'
  | 'external_salida_at'
  | 'source_date'
>

export function normalizedPlatform(mov: MovimientoContratoLike): string {
  return String(mov.platform_normalized ?? '').trim().toUpperCase()
}

/** En el Excel operativo, Ricardone a veces figura como planta San Lorenzo (no es puerto R7). */
export function isExcelPlantaRicardoneMislabel(mov: MovimientoContratoLike): boolean {
  const plant = String(mov.planta_normalized ?? '').trim().toUpperCase()
  const orig = String(mov.planta_original ?? mov.planta_normalized ?? '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (plant === 'RICARDONE') return true
  if (plant === 'SAN_LORENZO' || orig.includes('SAN LORENZO')) return true
  if (orig.includes('RICARDONE')) return true
  return false
}

export function isR7TerminalPortVolcableMovimiento(mov: MovimientoContratoLike): boolean {
  const platform = normalizedPlatform(mov)
  if (R7_TERMINAL_PORT_VOLCABLE_PLATFORMS.has(platform)) return true
  if (isSanLorenzoVolcablePtoPlatform(platform)) return true
  const original = String(mov.plataforma_original ?? '').toUpperCase()
  if (/VOLCABLE\s+PTO\s*[1-5]\b/.test(original)) return true
  return false
}

/** Descarga Celda 16 Ricardone (R1). Excluye terminal embarque / volcables PTO. */
export function isR1Celda16Movimiento(mov: MovimientoContratoLike): boolean {
  if (normalizedPlatform(mov) !== 'CELDA_16') return false
  if (isR7TerminalPortVolcableMovimiento(mov)) return false
  const plant = String(mov.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'TERMINAL_EMBARQUE') return false
  return isExcelPlantaRicardoneMislabel(mov) || plant === 'RICARDONE' || !plant
}

export function isR5Volcable1RicardoneMovimiento(mov: MovimientoContratoLike): boolean {
  if (normalizedPlatform(mov) !== 'VOLCABLE_1') return false
  if (isR7TerminalPortVolcableMovimiento(mov)) return false
  const plant = String(mov.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'TERMINAL_EMBARQUE') return false
  return true
}

export function isR6Volcable2RicardoneMovimiento(mov: MovimientoContratoLike): boolean {
  if (normalizedPlatform(mov) !== 'VOLCABLE_2') return false
  if (isR7TerminalPortVolcableMovimiento(mov)) return false
  const plant = String(mov.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'TERMINAL_EMBARQUE') return false
  return true
}

export function movimientoMatchesExecutiveCircuit(
  mov: MovimientoContratoLike,
  circuitCode: string
): boolean {
  const code = String(circuitCode ?? '').trim().toUpperCase()
  switch (code) {
    case 'R7':
      return isR7TerminalPortVolcableMovimiento(mov)
    case 'R1':
      return isR1Celda16Movimiento(mov)
    case 'R5':
      return isR5Volcable1RicardoneMovimiento(mov)
    case 'R6':
      return isR6Volcable2RicardoneMovimiento(mov)
    default:
      return false
  }
}

export function classifyRawAuditCircuit(mov: MovimientoContratoLike): string | null {
  for (const code of RAW_AUDIT_CIRCUIT_CODES) {
    if (movimientoMatchesExecutiveCircuit(mov, code)) return code
  }
  return null
}

export function salidaDayKey(mov: MovimientoContratoLike): string {
  const fromSalida = dayKeyFromSalida(mov.external_salida_at)
  if (fromSalida) return fromSalida
  const sd = String(mov.source_date ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(sd) ? sd : ''
}

export function movimientoInSalidaDayRange(
  mov: MovimientoContratoLike,
  fromDay?: string,
  toDay?: string
): boolean {
  const day = salidaDayKey(mov)
  if (!day) return !fromDay && !toDay
  if (fromDay && day < fromDay) return false
  if (toDay && day > toDay) return false
  return true
}

export function movimientoRowEligibleForExcelTotal(
  mov: MovimientoContratoLike,
  fromDay?: string,
  toDay?: string
): boolean {
  if (!String(mov.plate_normalized ?? '').trim()) return false
  if (!movimientoInSalidaDayRange(mov, fromDay, toDay)) return false
  if (!salidaDayKey(mov) && !String(mov.external_salida_at ?? '').trim()) return false
  return true
}

export function ctgKeyForMovimiento(mov: MovimientoContratoLike): string {
  const opId = String(mov.external_operation_id ?? '').trim()
  const ctg = extractCtgFromOperationId(opId, mov.ctg)
  if (ctg) return ctg
  if (opId) return opId
  return `${mov.plate_normalized}|${salidaDayKey(mov)}`
}

export type ExcelPeriodTotals = {
  totalRowsInRange: number
  uniqueCtgsInRange: number
  rowsByCircuit: Record<string, number>
  uniqueCtgsByCircuit: Record<string, number>
}

export function computeExcelPeriodTotals(
  movimientos: MovimientoContratoLike[],
  fromDay?: string,
  toDay?: string
): ExcelPeriodTotals {
  const rowsByCircuit: Record<string, number> = {}
  const ctgSets: Record<string, Set<string>> = {}
  const allCtgs = new Set<string>()
  let totalRowsInRange = 0

  for (const code of RAW_AUDIT_CIRCUIT_CODES) {
    rowsByCircuit[code] = 0
    ctgSets[code] = new Set()
  }

  for (const mov of movimientos) {
    if (!movimientoRowEligibleForExcelTotal(mov, fromDay, toDay)) continue
    totalRowsInRange += 1
    const ctg = ctgKeyForMovimiento(mov)
    allCtgs.add(ctg)
    const circuit = classifyRawAuditCircuit(mov)
    if (circuit) {
      rowsByCircuit[circuit] = (rowsByCircuit[circuit] ?? 0) + 1
      ctgSets[circuit]!.add(ctg)
    }
  }

  const uniqueCtgsByCircuit: Record<string, number> = {}
  for (const code of RAW_AUDIT_CIRCUIT_CODES) {
    uniqueCtgsByCircuit[code] = ctgSets[code]!.size
  }

  return {
    totalRowsInRange,
    uniqueCtgsInRange: allCtgs.size,
    rowsByCircuit,
    uniqueCtgsByCircuit,
  }
}

export function movimientoToExcelOperation(mov: MovimientoContratoLike, circuitCode: string): ExcelMovimientoLike {
  const opId = String(mov.external_operation_id ?? '').trim()
  return {
    operationId: opId || `CTG_${mov.ctg}`,
    ctg: extractCtgFromOperationId(opId, mov.ctg),
    plate: String(mov.plate_normalized ?? '').trim(),
    executiveCircuitCode: circuitCode,
    externalIngresoAt: String(mov.external_ingreso_at ?? '').trim() || undefined,
    externalSalidaAt: String(mov.external_salida_at ?? '').trim() || undefined,
  }
}

export function buildExcelMovimientosUniverse(
  movimientos: MovimientoContratoLike[],
  circuitCode: string,
  opts?: { fromDay?: string; toDay?: string }
): ExcelMovimientoLike[] {
  const code = String(circuitCode).trim().toUpperCase()
  const byKey = new Map<string, ExcelMovimientoLike>()

  for (const mov of movimientos) {
    if (!movimientoMatchesExecutiveCircuit(mov, code)) continue
    if (!movimientoInSalidaDayRange(mov, opts?.fromDay, opts?.toDay)) continue
    const plate = String(mov.plate_normalized ?? '').trim()
    if (!plate) continue
    const op = movimientoToExcelOperation(mov, code)
    if (!op.externalSalidaAt && !salidaDayKey(mov)) continue

    const key = ctgKeyForMovimiento(mov) || op.operationId || `${plate}|${op.externalSalidaAt ?? ''}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, op)
      continue
    }
    if (!prev.externalIngresoAt && op.externalIngresoAt) prev.externalIngresoAt = op.externalIngresoAt
    if (!prev.externalSalidaAt && op.externalSalidaAt) prev.externalSalidaAt = op.externalSalidaAt
  }

  return [...byKey.values()].sort((a, b) => {
    const da = dayKeyFromSalida(a.externalSalidaAt)
    const db = dayKeyFromSalida(b.externalSalidaAt)
    const d = da.localeCompare(db)
    if (d !== 0) return d
    return a.ctg.localeCompare(b.ctg)
  })
}

export function parseNormalizedMovimientosCsvRow(row: Record<string, string>): MovimientoContratoLike {
  return {
    external_operation_id: row.external_operation_id ?? '',
    ctg: row.ctg ?? '',
    plate_normalized: row.plate_normalized ?? '',
    platform_normalized: row.platform_normalized ?? '',
    plataforma_original: row.plataforma_original ?? '',
    planta_normalized: row.planta_normalized ?? '',
    planta_original: row.planta_original ?? '',
    mov: row.mov ?? '',
    movement_type: row.movement_type ?? '',
    movement_type_detail: row.movement_type_detail ?? '',
    external_ingreso_at: row.external_ingreso_at ?? '',
    external_salida_at: row.external_salida_at ?? '',
    source_date: row.source_date ?? '',
  }
}

export function isPostTransformScatterCsvHeader(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()))
  return set.has('resolved_executive_circuit_code') && set.has('segment_from')
}

export function assertNotScatterCsvForRawAudit(headers: string[]): void {
  if (isPostTransformScatterCsvHeader(headers)) {
    throw new Error(
      'El archivo parece excel_operation_segments_for_scatter (post-transform). ' +
        'Use external_movimientos_contrato_normalized.csv o los Excel MovimientosPorContrato (.xlsx).'
    )
  }
}

export type ExcelUniverseStats = {
  circuitCode: string
  totalRowsRead: number
  matchedCircuit: number
  inDateRange: number
  uniqueOperations: number
  shareOfExcelRowsPct: number
  shareOfExcelCtgsPct: number
}

export function describeExcelUniverse(
  totalRowsRead: number,
  movimientos: MovimientoContratoLike[],
  circuitCode: string,
  universe: ExcelMovimientoLike[],
  periodTotals: ExcelPeriodTotals,
  fromDay?: string,
  toDay?: string
): ExcelUniverseStats {
  const code = circuitCode.toUpperCase()
  const matchedCircuit = movimientos.filter((m) => movimientoMatchesExecutiveCircuit(m, code)).length
  const inDateRange = movimientos.filter(
    (m) =>
      movimientoMatchesExecutiveCircuit(m, code) &&
      movimientoInSalidaDayRange(m, fromDay, toDay)
  ).length
  const uniqueOperations = universe.length
  const shareOfExcelRowsPct =
    periodTotals.totalRowsInRange > 0 ?
      Math.round((inDateRange / periodTotals.totalRowsInRange) * 10000) / 100
    : 0
  const shareOfExcelCtgsPct =
    periodTotals.uniqueCtgsInRange > 0 ?
      Math.round((uniqueOperations / periodTotals.uniqueCtgsInRange) * 10000) / 100
    : 0
  return {
    circuitCode: code,
    totalRowsRead,
    matchedCircuit,
    inDateRange,
    uniqueOperations,
    shareOfExcelRowsPct,
    shareOfExcelCtgsPct,
  }
}

export function formatExcelUniverseLog(
  stats: ExcelUniverseStats,
  periodTotals?: ExcelPeriodTotals
): string {
  const lines = [
    `Universo Excel (movimientos por contrato, sin transform):`,
    `  filas leídas (archivo): ${stats.totalRowsRead}`,
  ]
  if (periodTotals) {
    lines.push(
      `  movimientos en período (con patente/egreso): ${periodTotals.totalRowsInRange}`,
      `  CTG únicos en período (total Excel): ${periodTotals.uniqueCtgsInRange}`
    )
  }
  lines.push(
    `  coinciden circuito ${stats.circuitCode} (plataforma): ${stats.matchedCircuit}`,
    `  filas circuito en rango egreso: ${stats.inDateRange}`,
    `  camiones únicos (CTG) matriz: ${stats.uniqueOperations}`
  )
  if (periodTotals) {
    lines.push(
      `  % del Excel (filas en rango): ${stats.shareOfExcelRowsPct}%`,
      `  % del Excel (CTG únicos período): ${stats.shareOfExcelCtgsPct}%`
    )
  }
  return lines.join('\n')
}

export function formatExcelPeriodShareSummary(periodTotals: ExcelPeriodTotals): string {
  const lines = [
    '=== Participación circuitos R1/R5/R6/R7 en movimientos por contrato (Excel crudo) ===',
    `Movimientos en período: ${periodTotals.totalRowsInRange}`,
    `CTG únicos en período: ${periodTotals.uniqueCtgsInRange}`,
    '',
    'circuito | filas | % filas | CTG únicos | % CTG',
  ]
  for (const code of RAW_AUDIT_CIRCUIT_CODES) {
    const rows = periodTotals.rowsByCircuit[code] ?? 0
    const ctgs = periodTotals.uniqueCtgsByCircuit[code] ?? 0
    const pctRows =
      periodTotals.totalRowsInRange > 0 ?
        Math.round((rows / periodTotals.totalRowsInRange) * 10000) / 100
      : 0
    const pctCtgs =
      periodTotals.uniqueCtgsInRange > 0 ?
        Math.round((ctgs / periodTotals.uniqueCtgsInRange) * 10000) / 100
      : 0
    lines.push(`${code} | ${rows} | ${pctRows}% | ${ctgs} | ${pctCtgs}%`)
  }
  return lines.join('\n')
}

export function excelPeriodShareToCsv(periodTotals: ExcelPeriodTotals): string {
  const header = 'circuito,filas_movimiento,pct_filas_excel,ctg_unicos,pct_ctg_excel'
  const lines = [header]
  for (const code of RAW_AUDIT_CIRCUIT_CODES) {
    const rows = periodTotals.rowsByCircuit[code] ?? 0
    const ctgs = periodTotals.uniqueCtgsByCircuit[code] ?? 0
    const pctRows =
      periodTotals.totalRowsInRange > 0 ?
        Math.round((rows / periodTotals.totalRowsInRange) * 10000) / 100
      : 0
    const pctCtgs =
      periodTotals.uniqueCtgsInRange > 0 ?
        Math.round((ctgs / periodTotals.uniqueCtgsInRange) * 10000) / 100
      : 0
    lines.push(`${code},${rows},${pctRows}%,${ctgs},${pctCtgs}%`)
  }
  lines.push(
    `TOTAL_EXCEL,${periodTotals.totalRowsInRange},100%,${periodTotals.uniqueCtgsInRange},100%`
  )
  return lines.join('\n')
}
