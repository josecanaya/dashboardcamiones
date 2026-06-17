import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import {
  detectSanLorenzoEgressToRicardoneReturnFromEvents,
  SL_EGRESS_RIC_RETURN_WINDOW_MS_DEFAULT,
} from '../../../services/realPlateAudit'
import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords } from './etlCsvParse'
import { MERGE_STATUSES_WITH_PRODUCT } from './etlTruckflowMovimientosMerge'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import {
  EXECUTIVE_CIRCUIT_MATRIX,
  EXECUTIVE_CIRCUIT_ORDER,
  formatExecutiveCircuitLabel,
} from './finalCircuitScoring'

/** Variaciones por cámaras que persisten si Excel confirma producto/plataforma. */
export const CAMERA_PRESERVED_OPERATIONAL_VARIATIONS = new Set([
  'ESPERA_EN_CALADA',
  'RECALADO',
  'DOBLE_PREINGRESO',
])

/** Rechazos: no figuran en Excel → no se concilian ni promueven por movimientos contrato. */
export const EXCEL_RECONCILIATION_EXCLUDED_VARIATIONS = new Set(['POSIBLE_RECHAZO', 'RECHAZO_OPERATIVO'])

function operationalVariationFromCommitteeReason(reason: string): string {
  const u = String(reason ?? '').toUpperCase()
  if (u.includes('ESPERA_EN_CALADA')) return 'ESPERA_EN_CALADA'
  if (u.includes('POSIBLE_RECHAZO')) return 'POSIBLE_RECHAZO'
  if (u.includes('RECHAZO_OPERATIVO')) return 'RECHAZO_OPERATIVO'
  if (u.includes('DOBLE_PREINGRESO')) return 'DOBLE_PREINGRESO'
  if (u.includes('RECALADO')) return 'RECALADO'
  return ''
}

function resolveCameraVariationType(entry: CircuitClassificationEntry): string {
  const direct = String(entry.operationalVariationType ?? '').trim()
  if (direct) return direct
  return operationalVariationFromCommitteeReason(entry.committeeReason)
}

export function isExcelReconciliationExcludedVariation(variation: string): boolean {
  return EXCEL_RECONCILIATION_EXCLUDED_VARIATIONS.has(String(variation ?? '').trim())
}

/** POSIBLE_RECHAZO / RECHAZO_OPERATIVO: solo Truckflow, sin cruce Excel. */
export function isExcelReconciliationExcludedEntry(entry: CircuitClassificationEntry): boolean {
  return isExcelReconciliationExcludedVariation(resolveCameraVariationType(entry))
}

/** Demoras por cámaras que persisten aunque Excel confirme destino (no aplica a rechazos). */
export function resolvePreservedCameraVariation(entry: CircuitClassificationEntry): string {
  const variation = resolveCameraVariationType(entry)
  if (!variation || isExcelReconciliationExcludedVariation(variation)) return ''
  if (!CAMERA_PRESERVED_OPERATIONAL_VARIATIONS.has(variation)) return ''
  return variation
}

export const CIRCUIT_PIE_COLORS = [
  '#059669',
  '#0ea5e9',
  '#e11d48',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
] as const

export type CircuitClassificationEntry = {
  journeyId: string
  plate: string
  normalizedPlate: string
  site: string
  matchedCircuitCode: string
  executiveCircuitCode: string
  executiveCircuitLabel: string
  executiveCircuitDisplay: string
  matrixFinalStatus: string
  executiveStatus: string
  validDetail: string
  committeeGroup: string
  committeeReason: string
  operationalVariationType: string
  detectedSequence: string
  deviceSequence: string
  firstEventAt: string
  lastEventAt: string
  executiveReason: string
  pieSliceLabel: string
  usefulEventsCount: number
  executiveBucket: string
  matrixReason: string
  color: string
}

export type CircuitPieSlice = {
  name: string
  value: number
  color: string
}

export type ExecutiveCircuitBarSlice = {
  code: string
  label: string
  displayLabel: string
  count: number
}

export type CommitteeCrossTabCategory = 'completos' | 'variaciones' | 'anomalias'

export type CommitteeCircuitCrossTabRow = {
  code: string
  label: string
  displayLabel: string
  /** Solo completos + variaciones (anomalías van al panel por recorrido). */
  total: number
  completos: number
  variaciones: number
  anomalias: number
  pctCompletos: number
  pctVariaciones: number
  pctAnomalias: number
  trucksCompletos: CircuitClassificationEntry[]
  trucksVariaciones: CircuitClassificationEntry[]
  trucksAnomalias: CircuitClassificationEntry[]
}

export type AnomalyReasonCount = { reason: string; count: number }

/** Mínimo de eventos útiles para listar un journey en el panel de anomalías por recorrido. */
export const ANOMALY_LIST_MIN_EVENTS = 3

export type AnomalyReviewSummary = {
  /** Journeys comité ANOMALÍAS con menos de 3 eventos — solo contador, sin listado. */
  incompleteCount: number
  /** Journeys anómalos listables (≥3 eventos) agrupados por secuencia. */
  sequenceRows: AnomalySequenceBreakdownRow[]
  /** Total de journeys en sequenceRows. */
  listedAnomalyCount: number
}

/** Anomalías agrupadas por secuencia lógica observada (independiente del circuito R* asignado). */
export type AnomalySequenceBreakdownRow = {
  sequenceKey: string
  displaySequence: string
  count: number
  pctOfAnomalies: number
  eventCount: number
  topCommitteeReason: string
  reasonCounts: AnomalyReasonCount[]
  trucks: CircuitClassificationEntry[]
}

/** Camión con descarga instrumentada (C16 / Volcable) sin paso por balanza. */
export type SuspiciousDischargeWithoutBalanzaRow = {
  journeyId: string
  plate: string
  firstEventAt: string
  lastEventAt: string
  dischargePoint: string
  detectedSequence: string
  executiveCircuitDisplay: string
  committeeGroup: string
  committeeReason: string
  usefulEventsCount: number
}

export const SUSPICIOUS_DISCHARGE_CSV_HEADERS = [
  'journey_id',
  'plate',
  'first_event_at',
  'last_event_at',
  'discharge_point',
  'detected_sequence',
  'executive_circuit',
  'committee_group',
  'committee_reason',
  'useful_events_count',
] as const

/** Salida San Lorenzo y vuelta a Ricardone (ingreso/preingreso/calada) en ventana corta. */
export type SuspiciousSlExitRicReturnRow = {
  plate: string
  day: string
  slExitAt: string
  slExitPoint: string
  ricReturnAt: string
  ricReturnPoint: string
  deltaMinutes: number
  journeyUidAtExit: string
  journeyUidAtReturn: string
}

export const SUSPICIOUS_SL_RIC_RETURN_CSV_HEADERS = [
  'plate',
  'day',
  'sl_exit_at',
  'sl_exit_point',
  'ric_return_at',
  'ric_return_point',
  'delta_minutes',
  'journey_uid_exit',
  'journey_uid_return',
] as const

export const ANOMALY_SEQUENCE_CSV_HEADERS = [
  'sequence_key',
  'detected_sequence',
  'count',
  'pct_of_anomalies',
  'event_count',
  'top_committee_reason',
  'committee_reasons_breakdown',
] as const

/** Export unificado comité + circuitos + anomalías (filtrar por record_type en Excel / Power BI). */
export const COMMITTEE_CHART_EXPORT_HEADERS = [
  'record_type',
  'executive_circuit_code',
  'executive_circuit_label',
  'display_label',
  'committee_group',
  'committee_category',
  'journey_id',
  'plate',
  'detected_sequence',
  'count',
  'pct',
  'pct_completos',
  'pct_variaciones',
  'pct_of_anomalies',
  'useful_events_count',
  'committee_reason',
  'operational_variation_type',
  'matrix_final_status',
  'executive_status',
  'executive_reason',
  'matrix_reason',
  'top_committee_reason',
  'committee_reasons_breakdown',
  'event_count',
] as const

export type CommitteeChartExportOptions = {
  /** Incluir una fila JOURNEY por camión (archivo más grande). Default true. */
  includeJourneyRows?: boolean
}

export const COMMITTEE_DRILLDOWN_CSV_HEADERS = [
  'journey_id',
  'plate',
  'executive_circuit_code',
  'executive_circuit_label',
  'committee_group',
  'committee_reason',
  'operational_variation_type',
  'detected_sequence',
  'matrix_final_status',
  'executive_status',
  'executive_reason',
  'matrix_reason',
  'useful_events_count',
] as const

export type CircuitClassificationIndex = {
  entries: CircuitClassificationEntry[]
  byJourneyId: Map<string, CircuitClassificationEntry>
  byPlate: Map<string, CircuitClassificationEntry[]>
  byPieSlice: Map<string, CircuitClassificationEntry[]>
  pieSlices: CircuitPieSlice[]
  circuitBarSlices: ExecutiveCircuitBarSlice[]
  total: number
  /** Journeys actualizados por conciliación Excel-first (circuito/categoría). */
  excelFirstReconciledCount: number
  /** Anomalías reclasificadas como COMPLETOS por cruce Excel (plataforma/circuito). */
  excelPromotedCount: number
}

export function classificationOrder(label: string): number {
  const u = String(label ?? '').toUpperCase().trim()
  if (u === 'COMPLETOS') return 10
  if (u === 'VARIACIONES OPERATIVAS') return 20
  if (u === 'ANOMALÍAS' || u === 'ANOMALIAS') return 30
  if (u === 'VALIDO') return 10
  if (u === 'PROBABLE') return 20
  if (u.startsWith('INCOMPLETO')) {
    const m = /INCOMPLETO\s*\((\d+)\s*EVENTOS\)/i.exec(u)
    if (!m) return 30
    return 30 + Number(m[1])
  }
  if (u === 'ANOMALO') return 200
  if (u === 'NO_EVALUABLE') return 300
  return 999
}

export function pieSliceLabelFromMatrixRow(row: Record<string, string>): string {
  const committeeGroup = String(row.committee_group ?? '').trim().toUpperCase()
  if (committeeGroup === 'COMPLETOS') return 'COMPLETOS'
  if (committeeGroup === 'VARIACIONES_OPERATIVAS') return 'VARIACIONES OPERATIVAS'
  if (committeeGroup === 'ANOMALIAS') return 'ANOMALÍAS'

  const executiveStatus = String(row.executive_status ?? '').trim().toUpperCase()
  const matrixStatus = String(row.matrix_final_status ?? '').trim().toUpperCase()
  const validDetail = String(row.valid_detail ?? '').trim().toUpperCase()
  if (
    matrixStatus === 'COMPLETO' ||
    matrixStatus === 'DEDUCIDO' ||
    executiveStatus === 'VALIDO' ||
    validDetail === 'COMPLETO' ||
    validDetail === 'DEDUCIDO'
  ) {
    return 'COMPLETOS'
  }

  if (executiveStatus === 'PROBABLE' || executiveStatus === 'INCOMPLETO' || executiveStatus === 'ANOMALO' || executiveStatus === 'NO_EVALUABLE') {
    return executiveStatus
  }
  const usefulN = Number(String(row.useful_events_count ?? '').trim())
  if (matrixStatus === 'INCOMPLETO') {
    return Number.isFinite(usefulN) ? `INCOMPLETO (${usefulN} eventos)` : 'INCOMPLETO'
  }
  return matrixStatus || 'SIN_CLASIFICACION'
}

function normalizePlate(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
}

function resolveExecutiveFields(row: Record<string, string>): {
  code: string
  label: string
  display: string
} {
  const code = String(
    row.executive_circuit_code ?? row.matched_circuit_code ?? ''
  ).trim()
  const label = String(row.executive_circuit_label ?? '').trim()
  if (code || label) {
    return {
      code,
      label,
      display: formatExecutiveCircuitLabel(code, label),
    }
  }
  const technical = String(row.technical_matched_circuit_code ?? row.preliminary_code ?? '').trim()
  return {
    code: '',
    label: technical,
    display: technical || 'Sin asignar',
  }
}

function rowToEntry(row: Record<string, string>, color: string): CircuitClassificationEntry {
  const pieSliceLabel = pieSliceLabelFromMatrixRow(row)
  const plate = String(row.plate ?? '').trim()
  const executive = resolveExecutiveFields(row)
  return {
    journeyId: String(row.journey_id ?? '').trim(),
    plate,
    normalizedPlate: normalizePlate(plate),
    site: String(row.site ?? '').trim(),
    matchedCircuitCode: executive.code || executive.display,
    executiveCircuitCode: executive.code,
    executiveCircuitLabel: executive.label,
    executiveCircuitDisplay: executive.display,
    matrixFinalStatus: String(row.matrix_final_status ?? '').trim().toUpperCase(),
    executiveStatus: String(row.executive_status ?? '').trim().toUpperCase(),
    validDetail: String(row.valid_detail ?? '').trim().toUpperCase(),
    committeeGroup: String(row.committee_group ?? '').trim().toUpperCase(),
    committeeReason: String(row.committee_reason ?? '').trim(),
    operationalVariationType: String(row.operational_variation_type ?? '').trim(),
    detectedSequence: String(row.detected_sequence ?? '').trim(),
    deviceSequence: String(row.device_sequence ?? '').trim(),
    firstEventAt: String(row.first_event_at ?? '').trim(),
    lastEventAt: String(row.last_event_at ?? '').trim(),
    executiveReason: String(row.executive_reason ?? '').trim(),
    pieSliceLabel,
    usefulEventsCount: Number(String(row.useful_events_count ?? '').trim()) || 0,
    executiveBucket: String(row.executive_bucket ?? '').trim().toUpperCase(),
    matrixReason: String(row.matrix_reason ?? '').trim(),
    color,
  }
}

export function buildExecutiveCircuitBarSlices(
  entries: CircuitClassificationEntry[]
): ExecutiveCircuitBarSlice[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = entry.executiveCircuitCode || 'SIN_ASIGNAR'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const slices: ExecutiveCircuitBarSlice[] = []
  for (const code of EXECUTIVE_CIRCUIT_ORDER) {
    const count = counts.get(code) ?? 0
    if (count <= 0) continue
    const cfg = EXECUTIVE_CIRCUIT_MATRIX[code]
    slices.push({
      code,
      label: cfg?.label ?? code,
      displayLabel: formatExecutiveCircuitLabel(code, cfg?.label ?? code),
      count,
    })
  }

  const unassigned = counts.get('SIN_ASIGNAR') ?? 0
  if (unassigned > 0) {
    slices.push({
      code: 'SIN_ASIGNAR',
      label: 'Sin circuito en matriz',
      displayLabel: 'Sin asignar',
      count: unassigned,
    })
  }

  return slices
}

export function committeeCategoryFromEntry(entry: CircuitClassificationEntry): CommitteeCrossTabCategory {
  const g = entry.committeeGroup || entry.pieSliceLabel.toUpperCase()
  if (g === 'COMPLETOS') return 'completos'
  if (g === 'VARIACIONES_OPERATIVAS' || g === 'VARIACIONES OPERATIVAS') return 'variaciones'
  return 'anomalias'
}

export function trucksForCommitteeCrossTabCell(
  row: CommitteeCircuitCrossTabRow,
  category: CommitteeCrossTabCategory | 'total'
): CircuitClassificationEntry[] {
  if (category === 'completos') return row.trucksCompletos
  if (category === 'variaciones') return row.trucksVariaciones
  if (category === 'anomalias') return row.trucksAnomalias
  return [...row.trucksCompletos, ...row.trucksVariaciones, ...row.trucksAnomalias]
}

export function committeeDrilldownCsv(entries: CircuitClassificationEntry[]): string {
  if (!entries.length) {
    return `${COMMITTEE_DRILLDOWN_CSV_HEADERS.join(',')}\n`
  }
  const rows = entries.map((e) => ({
    journey_id: e.journeyId,
    plate: e.plate,
    executive_circuit_code: e.executiveCircuitCode,
    executive_circuit_label: e.executiveCircuitLabel,
    committee_group: e.committeeGroup,
    committee_reason: e.committeeReason,
    operational_variation_type: e.operationalVariationType,
    detected_sequence: e.detectedSequence,
    matrix_final_status: e.matrixFinalStatus,
    executive_status: e.executiveStatus,
    executive_reason: e.executiveReason,
    matrix_reason: e.matrixReason,
    useful_events_count: e.usefulEventsCount,
  }))
  return recordsToCsv([...COMMITTEE_DRILLDOWN_CSV_HEADERS], rows)
}

function sortDrilldownEntries(list: CircuitClassificationEntry[]): CircuitClassificationEntry[] {
  return [...list].sort(
    (a, b) =>
      a.plate.localeCompare(b.plate) ||
      a.committeeReason.localeCompare(b.committeeReason) ||
      a.journeyId.localeCompare(b.journeyId)
  )
}

const ANOMALY_SEQUENCE_EMPTY = '(SIN_SECUENCIA_DETECTADA)'

const BALANZA_LOGICAL_CODES = new Set(['BALANZA', 'BALANZA_INGRESO', 'BALANZA_EGRESO'])
const DISCHARGE_LOGICAL_CODES = new Set(['CELDA16_DESCARGA', 'VOLCABLE'])
const DISCHARGE_EXECUTIVE_CODES = new Set(['R1', 'R5', 'R6', 'R9'])

function entryHasDischargeClassification(e: CircuitClassificationEntry): boolean {
  if (DISCHARGE_EXECUTIVE_CODES.has(e.executiveCircuitCode)) return true
  return e.committeeReason.includes('DESCARGA_INSTRUMENTADA')
}

/** Fragmentos UID con pocos eventos heredan COMPLETOS de otro journey misma patente. */
function promotePlateDischargeFragments(
  entries: CircuitClassificationEntry[]
): CircuitClassificationEntry[] {
  const bestByPlate = new Map<string, CircuitClassificationEntry>()
  for (const e of entries) {
    if (e.committeeGroup !== 'COMPLETOS' && e.committeeGroup !== 'VARIACIONES_OPERATIVAS') continue
    if (!entryHasDischargeClassification(e)) continue
    const prev = bestByPlate.get(e.normalizedPlate)
    if (!prev || e.usefulEventsCount > prev.usefulEventsCount) bestByPlate.set(e.normalizedPlate, e)
  }

  return entries.map((e) => {
    if (e.committeeGroup !== 'ANOMALIAS' || !e.normalizedPlate || e.usefulEventsCount > 3) return e
    const best = bestByPlate.get(e.normalizedPlate)
    if (!best) return e
    return {
      ...e,
      committeeGroup: 'COMPLETOS',
      pieSliceLabel: 'COMPLETOS',
      committeeReason: `HEREDA_DESCARGA_INSTRUMENTADA:${best.committeeReason}`,
      executiveCircuitCode: best.executiveCircuitCode,
      executiveCircuitLabel: best.executiveCircuitLabel,
      executiveCircuitDisplay: best.executiveCircuitDisplay,
      executiveStatus: 'VALIDO',
      executiveReason: best.executiveReason,
      matrixFinalStatus: best.matrixFinalStatus,
      matchedCircuitCode: best.executiveCircuitCode,
    }
  })
}

type ExcelMergeLite = {
  journey_uid: string
  product_normalized: string
  platform_normalized: string
  circuit_code: string
  circuit_label: string
  merge_status: string
}

function parseExcelMergeByJourneyUid(mergeCsv: string | undefined | null): Map<string, ExcelMergeLite> {
  const map = new Map<string, ExcelMergeLite>()
  if (!mergeCsv?.trim()) return map
  const { rows } = parseCsvToRecords(mergeCsv)
  for (const r of rows) {
    const journey_uid = String(r.journey_uid ?? '').trim()
    if (!journey_uid) continue
    map.set(journey_uid, {
      journey_uid,
      product_normalized: String(r.product_normalized ?? '').trim(),
      platform_normalized: String(r.platform_normalized ?? '').trim(),
      circuit_code: String(r.circuit_code ?? '').trim(),
      circuit_label: String(r.circuit_label ?? '').trim(),
      merge_status: String(r.merge_status ?? '').trim(),
    })
  }
  return map
}

function shouldPromoteAnomalyFromExcel(entry: CircuitClassificationEntry, merge: ExcelMergeLite): boolean {
  if (entry.committeeGroup !== 'ANOMALIAS') return false
  if (!MERGE_STATUSES_WITH_PRODUCT.has(merge.merge_status as never)) return false
  if (!merge.product_normalized || !merge.platform_normalized || !merge.circuit_code) return false
  return true
}

function promoteEntryFromExcelMovimiento(
  entry: CircuitClassificationEntry,
  merge: ExcelMergeLite
): CircuitClassificationEntry {
  const code = merge.circuit_code
  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
  const label = merge.circuit_label || cfg?.label || code
  return {
    ...entry,
    committeeGroup: 'COMPLETOS',
    pieSliceLabel: 'COMPLETOS',
    committeeReason: `EXCEL_CONTRATO:${merge.product_normalized}@${merge.platform_normalized}`,
    operationalVariationType: '',
    executiveCircuitCode: code,
    executiveCircuitLabel: label,
    executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
    matchedCircuitCode: code,
    executiveStatus: 'PROBABLE',
    executiveReason: 'EXCEL_MOVIMIENTOS_CONTRATO',
    validDetail: 'DEDUCIDO',
    executiveBucket: 'DEDUCIDO',
  }
}

type ExcelFirstReconcileLite = {
  product_normalized: string
  platform_normalized: string
  plataforma_original: string
  plate_normalized: string
  planta_normalized: string
  movement_type: string
  source_date: string
  truckflow_circuit_codes: string
  resolved_circuit_family: string
  match_quality: string
  route_quality: string
  evidence_count: number
}

const EXCEL_FIRST_MATCH_RANK: Record<string, number> = {
  EXTERNAL_MATCH_EXACT: 5,
  EXTERNAL_MATCH_PROBABLE: 4,
  EXTERNAL_MATCH_WIDE_WINDOW: 3,
  EXTERNAL_MATCH_LOW_CONFIDENCE: 2,
  EXTERNAL_MATCH_FRAGMENTED: 1,
}

const EXCEL_FIRST_RECONCILABLE_MATCH = new Set(Object.keys(EXCEL_FIRST_MATCH_RANK))

/** Circuitos inferidos por Truckflow sin punto de descarga — no usar si Excel tiene plataforma. */
const GENERIC_INFERRED_CIRCUIT_CODES = new Set([
  'RS_REC',
  'RS_DESP',
  'SIN_PUNTO',
  'SIN_ASIGNAR',
  'DESCARGA_SIN_PUNTO',
  'NO_DIFERENCIABLE',
  'NO_EVALUABLE',
])

const FAMILY_TO_EXECUTIVE: Record<string, string> = {
  VOLCABLE: 'R5',
  SAN_LORENZO_VOLCABLE: 'R7',
  CELDA16: 'R1',
  KEPLER: 'R3',
  LIQUIDO: 'R9',
}

function excelFirstMatchRank(lite: ExcelFirstReconcileLite): number {
  return EXCEL_FIRST_MATCH_RANK[lite.match_quality] ?? 0
}

function pickBestExcelFirstLite(candidates: ExcelFirstReconcileLite[]): ExcelFirstReconcileLite | undefined {
  if (!candidates.length) return undefined
  return candidates.reduce((best, c) => (excelFirstMatchRank(c) > excelFirstMatchRank(best) ? c : best))
}

function inferExecutiveCircuitFromExcelPlatform(lite: ExcelFirstReconcileLite): string {
  const movType = String(lite.movement_type ?? '').toUpperCase()
  const inferred = inferCircuitFromExternalMovimiento({
    platform_normalized: lite.platform_normalized,
    plataforma_original: lite.plataforma_original,
    planta_normalized: lite.planta_normalized,
    movement_type: movType,
    movement_type_detail: movType,
    mov: movType === 'DESPACHO' ? 'DE' : movType === 'INGRESO' ? 'I' : '',
  })
  return inferred?.circuit_code ?? ''
}

function pickExecutiveCircuitFromExcelFirst(lite: ExcelFirstReconcileLite): string {
  const fromPlatform = inferExecutiveCircuitFromExcelPlatform(lite)
  if (fromPlatform && !GENERIC_INFERRED_CIRCUIT_CODES.has(fromPlatform)) {
    return fromPlatform
  }

  const codes = lite.truckflow_circuit_codes
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const code of codes) {
    if (GENERIC_INFERRED_CIRCUIT_CODES.has(code)) continue
    if ((EXECUTIVE_CIRCUIT_ORDER as readonly string[]).includes(code)) return code
    if (EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]) return code
  }

  if (fromPlatform) return fromPlatform

  const fromFamily = FAMILY_TO_EXECUTIVE[lite.resolved_circuit_family.toUpperCase()]
  if (fromFamily) return fromFamily

  return ''
}

function committeeGroupFromExcelFirst(
  entry: CircuitClassificationEntry,
  lite: ExcelFirstReconcileLite
): { committeeGroup: string; pieSliceLabel: string; operationalVariationType: string } {
  const cameraVariation = resolvePreservedCameraVariation(entry)
  if (cameraVariation) {
    return {
      committeeGroup: 'VARIACIONES_OPERATIVAS',
      pieSliceLabel: 'VARIACIONES OPERATIVAS',
      operationalVariationType: cameraVariation,
    }
  }

  const hasExcelDestino = Boolean(lite.product_normalized && lite.platform_normalized)

  if (!hasExcelDestino) {
    if (lite.route_quality === 'ROUTE_OPERATIONAL_VARIATION') {
      return {
        committeeGroup: 'VARIACIONES_OPERATIVAS',
        pieSliceLabel: 'VARIACIONES OPERATIVAS',
        operationalVariationType: 'EXCEL_FIRST',
      }
    }
    return {
      committeeGroup: 'COMPLETOS',
      pieSliceLabel: 'COMPLETOS',
      operationalVariationType: '',
    }
  }

  if (
    lite.match_quality === 'EXTERNAL_MATCH_WIDE_WINDOW' ||
    lite.match_quality === 'EXTERNAL_MATCH_LOW_CONFIDENCE' ||
    lite.match_quality === 'EXTERNAL_MATCH_FRAGMENTED' ||
    lite.route_quality === 'ROUTE_OPERATIONAL_VARIATION'
  ) {
    return {
      committeeGroup: 'VARIACIONES_OPERATIVAS',
      pieSliceLabel: 'VARIACIONES OPERATIVAS',
      operationalVariationType: lite.match_quality || 'EXCEL_FIRST',
    }
  }

  // Excel define producto + plataforma de descarga → circuito real (sale de RS_REC / SIN_PUNTO / anomalías)
  return {
    committeeGroup: 'COMPLETOS',
    pieSliceLabel: 'COMPLETOS',
    operationalVariationType: '',
  }
}

export function parseExcelFirstByJourneyUid(
  excelOpsCsv: string | undefined | null
): Map<string, ExcelFirstReconcileLite> {
  const map = new Map<string, ExcelFirstReconcileLite>()
  if (!excelOpsCsv?.trim()) return map
  const { rows } = parseCsvToRecords(excelOpsCsv)
  for (const r of rows) {
    const evidence = Number(r.evidence_count ?? 0)
    const matchQuality = String(r.match_quality ?? '').trim()
    if (evidence <= 0 || !EXCEL_FIRST_RECONCILABLE_MATCH.has(matchQuality)) continue
    const lite: ExcelFirstReconcileLite = {
      product_normalized: String(r.resolved_product ?? r.product_normalized ?? '').trim(),
      platform_normalized: String(r.resolved_platform ?? r.platform_normalized ?? '').trim(),
      plataforma_original: String(r.plataforma_original ?? r.platform_normalized ?? '').trim(),
      plate_normalized: String(r.plate_normalized ?? '').trim(),
      planta_normalized: String(r.planta_normalized ?? '').trim(),
      movement_type: String(r.movement_type ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      match_quality: matchQuality,
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: evidence,
    }
    const uids = String(r.matched_journey_uids ?? '')
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const uid of uids) {
      const prev = map.get(uid)
      if (!prev || excelFirstMatchRank(lite) > excelFirstMatchRank(prev)) {
        map.set(uid, lite)
      }
    }
  }
  return map
}

export function parseExcelFirstByPlate(
  excelOpsCsv: string | undefined | null
): Map<string, ExcelFirstReconcileLite[]> {
  const map = new Map<string, ExcelFirstReconcileLite[]>()
  if (!excelOpsCsv?.trim()) return map
  const { rows } = parseCsvToRecords(excelOpsCsv)
  for (const r of rows) {
    const evidence = Number(r.evidence_count ?? 0)
    const matchQuality = String(r.match_quality ?? '').trim()
    const plate = normalizePlate(String(r.plate_normalized ?? ''))
    if (!plate || evidence <= 0 || !EXCEL_FIRST_RECONCILABLE_MATCH.has(matchQuality)) continue
    const lite: ExcelFirstReconcileLite = {
      product_normalized: String(r.resolved_product ?? r.product_normalized ?? '').trim(),
      platform_normalized: String(r.resolved_platform ?? r.platform_normalized ?? '').trim(),
      plataforma_original: String(r.plataforma_original ?? r.platform_normalized ?? '').trim(),
      plate_normalized: plate,
      planta_normalized: String(r.planta_normalized ?? '').trim(),
      movement_type: String(r.movement_type ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      match_quality: matchQuality,
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: evidence,
    }
    const arr = map.get(plate) ?? []
    arr.push(lite)
    map.set(plate, arr)
  }
  return map
}

function resolveExcelFirstLiteForEntry(
  entry: CircuitClassificationEntry,
  byJourney: Map<string, ExcelFirstReconcileLite>,
  byPlate: Map<string, ExcelFirstReconcileLite[]>
): ExcelFirstReconcileLite | undefined {
  const direct = byJourney.get(entry.journeyId)
  if (direct) return direct
  if (!entry.normalizedPlate) return undefined
  const cands = byPlate.get(entry.normalizedPlate)
  if (!cands?.length) return undefined
  const dayKey = entry.firstEventAt.slice(0, 10)
  const sameDay = dayKey ? cands.filter((c) => c.source_date === dayKey) : []
  return pickBestExcelFirstLite(sameDay.length ? sameDay : cands)
}

function reconcileEntryFromExcelFirst(
  entry: CircuitClassificationEntry,
  lite: ExcelFirstReconcileLite
): CircuitClassificationEntry {
  const code = pickExecutiveCircuitFromExcelFirst(lite)
  if (!code || !lite.platform_normalized) return entry
  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
  const label = cfg?.label || code
  const group = committeeGroupFromExcelFirst(entry, lite)
  const preservedCameraVariation = Boolean(resolvePreservedCameraVariation(entry))
  return {
    ...entry,
    ...group,
    executiveCircuitCode: code,
    executiveCircuitLabel: label,
    executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
    matchedCircuitCode: code,
    committeeReason:
      preservedCameraVariation ?
        entry.committeeReason || `CAMARA_VARIACION:${entry.operationalVariationType}`
      : `EXCEL_PLATAFORMA:${lite.product_normalized}@${lite.platform_normalized}:${lite.match_quality}`,
    executiveStatus: group.committeeGroup === 'COMPLETOS' ? 'VALIDO' : entry.executiveStatus,
    executiveReason:
      preservedCameraVariation ? entry.executiveReason || entry.committeeReason : 'EXCEL_PLATAFORMA_RECONCILED',
    validDetail: preservedCameraVariation ? entry.validDetail || 'VARIACION_OPERATIVA' : 'DEDUCIDO',
    executiveBucket: group.committeeGroup === 'COMPLETOS' ? 'VALIDO' : entry.executiveBucket,
  }
}

function entryChangedByExcelFirst(before: CircuitClassificationEntry, after: CircuitClassificationEntry): boolean {
  return (
    before.committeeGroup !== after.committeeGroup ||
    before.executiveCircuitCode !== after.executiveCircuitCode ||
    before.pieSliceLabel !== after.pieSliceLabel
  )
}

/**
 * Aplica conciliación Excel-first: circuito y categoría comité según operaciones con evidencia Truckflow.
 */
export function applyExcelFirstReconciliation(
  entries: CircuitClassificationEntry[],
  excelOpsCsv: string | undefined | null
): { entries: CircuitClassificationEntry[]; reconciledCount: number; promotedCount: number } {
  const byJourney = parseExcelFirstByJourneyUid(excelOpsCsv)
  const byPlate = parseExcelFirstByPlate(excelOpsCsv)
  if (!byJourney.size && !byPlate.size) return { entries, reconciledCount: 0, promotedCount: 0 }

  let reconciledCount = 0
  let promotedCount = 0
  const out = entries.map((entry) => {
    if (isExcelReconciliationExcludedEntry(entry)) return entry
    const lite = resolveExcelFirstLiteForEntry(entry, byJourney, byPlate)
    if (!lite) return entry
    const wasAnomaly = entry.committeeGroup === 'ANOMALIAS'
    const wasGenericCircuit = GENERIC_INFERRED_CIRCUIT_CODES.has(entry.executiveCircuitCode)
    const next = reconcileEntryFromExcelFirst(entry, lite)
    if (!entryChangedByExcelFirst(entry, next)) return entry
    reconciledCount++
    if (wasAnomaly && next.committeeGroup !== 'ANOMALIAS') promotedCount++
    else if (wasGenericCircuit && !GENERIC_INFERRED_CIRCUIT_CODES.has(next.executiveCircuitCode)) promotedCount++
    return next
  })
  return { entries: out, reconciledCount, promotedCount }
}

/**
 * Camiones en Excel con producto+plataforma salen de ANOMALÍAS y entran al circuito del Excel.
 */
export function promoteExcelMovimientosContrato(
  entries: CircuitClassificationEntry[],
  mergeCsv: string | undefined | null
): { entries: CircuitClassificationEntry[]; promotedCount: number } {
  const byJourney = parseExcelMergeByJourneyUid(mergeCsv)
  if (!byJourney.size) return { entries, promotedCount: 0 }

  let promotedCount = 0
  const out = entries.map((entry) => {
    const merge = byJourney.get(entry.journeyId)
    if (!merge || !shouldPromoteAnomalyFromExcel(entry, merge)) return entry
    promotedCount++
    return promoteEntryFromExcelMovimiento(entry, merge)
  })
  return { entries: out, promotedCount }
}

/** Entrada a Ricardone (cualquiera de estas marca que el camión efectivamente ingresó/se preparó). */
const RIC_ENTRY_LOGICAL_CODES = new Set(['INGRESO', 'PREINGRESO', 'PREINGRESO_EGRESO'])
/** Evidencia de que la descarga se concretó en Ricardone (si está, NO es un rechazo). */
const RIC_DISCHARGE_COMPLETION_CODES = new Set([
  'VOLCABLE',
  'CELDA16_DESCARGA',
  'CELDA16_CARGA',
  'BALANZA_EGRESO',
])

function sequenceTokens(detectedSequence: string): string[] {
  const key = normalizeAnomalySequenceKey(detectedSequence)
  if (key === ANOMALY_SEQUENCE_EMPTY) return []
  return key.split('>').filter(Boolean)
}

function isSlSequenceToken(token: string): boolean {
  return token === 'SL' || token.startsWith('SL_')
}

/**
 * Patrón de posible rechazo (Ricardone): el camión ingresó y se caló, pero NO aparece en San Lorenzo
 * y NO completó descarga (sin volcable/celda/balanza egreso). Combinado con que la pasada corre
 * DESPUÉS de la conciliación Excel, equivale a "se caló, no fue a SL, no descargó y no figura en Excel".
 * La demora calada→egreso es una señal adicional opcional, no requerida.
 */
function sequenceLooksLikePossibleRejection(detectedSequence: string): boolean {
  const tokens = sequenceTokens(detectedSequence)
  if (!tokens.length) return false
  const hasCalada = tokens.includes('CALADA')
  const hasRicEntry = tokens.some((t) => RIC_ENTRY_LOGICAL_CODES.has(t))
  if (!hasCalada || !hasRicEntry) return false
  if (tokens.some(isSlSequenceToken)) return false
  if (tokens.some((t) => RIC_DISCHARGE_COMPLETION_CODES.has(t))) return false
  return true
}

function reclassifyEntryAsPossibleRejection(entry: CircuitClassificationEntry): CircuitClassificationEntry {
  return {
    ...entry,
    committeeGroup: 'VARIACIONES_OPERATIVAS',
    pieSliceLabel: 'VARIACIONES OPERATIVAS',
    committeeReason: 'POSIBLE_RECHAZO_CONTEMPLADO',
    operationalVariationType: 'POSIBLE_RECHAZO',
    executiveStatus: 'INCOMPLETO',
    executiveReason: 'POSIBLE_RECHAZO_CONTEMPLADO',
  }
}

/**
 * Reclasifica anomalías que en realidad son posibles rechazos (ingreso/preingreso → calada sin SL,
 * sin descarga instrumentada y sin confirmación de Excel). Debe ejecutarse DESPUÉS de las promociones
 * Excel: cualquier journey confirmado por Excel ya salió de ANOMALÍAS, de modo que lo que queda con
 * este patrón es precisamente lo que no figura en el Excel de movimientos por contrato.
 */
export function reclassifyPossibleRejections(
  entries: CircuitClassificationEntry[]
): { entries: CircuitClassificationEntry[]; reclassifiedCount: number } {
  let reclassifiedCount = 0
  const out = entries.map((entry) => {
    if (entry.committeeGroup !== 'ANOMALIAS') return entry
    if (!sequenceLooksLikePossibleRejection(entry.detectedSequence)) return entry
    reclassifiedCount++
    return reclassifyEntryAsPossibleRejection(entry)
  })
  return { entries: out, reclassifiedCount }
}

/** Reconstruye torta, barras e índices desde un subconjunto de entries (p. ej. filtro por producto). */
export function rebuildCircuitClassificationIndex(
  entries: CircuitClassificationEntry[],
  excelPromotedCount = 0,
  excelFirstReconciledCount = excelPromotedCount
): CircuitClassificationIndex {
  return rebuildClassificationIndexFromEntries(entries, excelPromotedCount, excelFirstReconciledCount)
}

function rebuildClassificationIndexFromEntries(
  entries: CircuitClassificationEntry[],
  excelPromotedCount: number,
  excelFirstReconciledCount = excelPromotedCount
): CircuitClassificationIndex {
  const { byJourneyId, byPlate, byPieSlice, sliceCounts } = rebuildIndexMaps(entries)

  const sortedSliceNames = [...sliceCounts.keys()].sort((a, b) => {
    const oa = classificationOrder(a)
    const ob = classificationOrder(b)
    if (oa !== ob) return oa - ob
    return (sliceCounts.get(b) ?? 0) - (sliceCounts.get(a) ?? 0)
  })

  const colorBySlice = new Map<string, string>()
  sortedSliceNames.forEach((name, idx) => {
    colorBySlice.set(name, CIRCUIT_PIE_COLORS[idx % CIRCUIT_PIE_COLORS.length]!)
  })
  for (const e of entries) {
    e.color = colorBySlice.get(e.pieSliceLabel) ?? CIRCUIT_PIE_COLORS[0]!
  }

  const pieSlices: CircuitPieSlice[] = sortedSliceNames.map((name) => ({
    name,
    value: sliceCounts.get(name) ?? 0,
    color: colorBySlice.get(name) ?? CIRCUIT_PIE_COLORS[0]!,
  }))

  return {
    entries,
    byJourneyId,
    byPlate,
    byPieSlice,
    pieSlices,
    circuitBarSlices: buildExecutiveCircuitBarSlices(entries),
    total: entries.length,
    excelFirstReconciledCount,
    excelPromotedCount,
  }
}

function rebuildIndexMaps(entries: CircuitClassificationEntry[]): {
  byJourneyId: Map<string, CircuitClassificationEntry>
  byPlate: Map<string, CircuitClassificationEntry[]>
  byPieSlice: Map<string, CircuitClassificationEntry[]>
  sliceCounts: Map<string, number>
} {
  const byJourneyId = new Map<string, CircuitClassificationEntry>()
  const byPlate = new Map<string, CircuitClassificationEntry[]>()
  const byPieSlice = new Map<string, CircuitClassificationEntry[]>()
  const sliceCounts = new Map<string, number>()

  for (const entry of entries) {
    sliceCounts.set(entry.pieSliceLabel, (sliceCounts.get(entry.pieSliceLabel) ?? 0) + 1)
    if (entry.journeyId) byJourneyId.set(entry.journeyId, entry)
    if (entry.normalizedPlate) {
      const bucket = byPlate.get(entry.normalizedPlate) ?? []
      bucket.push(entry)
      byPlate.set(entry.normalizedPlate, bucket)
    }
    const sliceBucket = byPieSlice.get(entry.pieSliceLabel) ?? []
    sliceBucket.push(entry)
    byPieSlice.set(entry.pieSliceLabel, sliceBucket)
  }

  for (const list of byPlate.values()) {
    list.sort((a, b) => a.plate.localeCompare(b.plate))
  }
  for (const list of byPieSlice.values()) {
    list.sort((a, b) => a.plate.localeCompare(b.plate) || a.journeyId.localeCompare(b.journeyId))
  }

  return { byJourneyId, byPlate, byPieSlice, sliceCounts }
}

export function parseLogicalSequence(detectedSequence: string): string[] {
  return String(detectedSequence ?? '')
    .split(/>|→|,|\|/g)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
}

export function journeyHasBalanzaInSequence(detectedSequence: string): boolean {
  return parseLogicalSequence(detectedSequence).some((code) => BALANZA_LOGICAL_CODES.has(code))
}

export function journeyHasInstrumentedDischarge(detectedSequence: string): boolean {
  return parseLogicalSequence(detectedSequence).some((code) => DISCHARGE_LOGICAL_CODES.has(code))
}

export function resolveDischargePointLabel(detectedSequence: string, deviceSequence = ''): string {
  const codes = parseLogicalSequence(detectedSequence)
  const parts: string[] = []
  const devs = String(deviceSequence ?? '')
    .split(/>|→|,|\|/g)
    .map((t) => t.trim())

  if (codes.includes('CELDA16_DESCARGA')) {
    const hasC16_1 = devs.some((d) => /RicC16Descarga1/i.test(d))
    const hasC16_2 = devs.some((d) => /RicC16Descarga2/i.test(d))
    if (hasC16_1 && hasC16_2) parts.push('C16 descarga 1 y 2')
    else if (hasC16_2) parts.push('C16 descarga 2')
    else if (hasC16_1) parts.push('C16 descarga 1')
    else parts.push('C16 descarga')
  }

  if (codes.includes('VOLCABLE')) {
    const hasV1 = devs.some((d) => /RicVolcable1/i.test(d))
    const hasV2 = devs.some((d) => /RicVolcable2/i.test(d))
    if (hasV1 && hasV2) parts.push('Volcable 1 y 2')
    else if (hasV2) parts.push('Volcable 2')
    else if (hasV1) parts.push('Volcable 1')
    else parts.push('Volcable')
  }

  return parts.join(' · ') || '—'
}

/** Descarga en C16 o Volcable sin ningún paso por balanza. */
export function buildSuspiciousDischargeWithoutBalanza(
  entries: CircuitClassificationEntry[]
): SuspiciousDischargeWithoutBalanzaRow[] {
  const rows: SuspiciousDischargeWithoutBalanzaRow[] = []

  for (const entry of entries) {
    if (!journeyHasInstrumentedDischarge(entry.detectedSequence)) continue
    if (journeyHasBalanzaInSequence(entry.detectedSequence)) continue

    rows.push({
      journeyId: entry.journeyId,
      plate: entry.plate,
      firstEventAt: entry.firstEventAt,
      lastEventAt: entry.lastEventAt,
      dischargePoint: resolveDischargePointLabel(entry.detectedSequence, entry.deviceSequence),
      detectedSequence: entry.detectedSequence,
      executiveCircuitDisplay: entry.executiveCircuitDisplay,
      committeeGroup: entry.committeeGroup,
      committeeReason: entry.committeeReason,
      usefulEventsCount: entry.usefulEventsCount,
    })
  }

  return rows.sort((a, b) => {
    const ta = a.firstEventAt ? new Date(a.firstEventAt).getTime() : 0
    const tb = b.firstEventAt ? new Date(b.firstEventAt).getTime() : 0
    if (ta !== tb) return ta - tb
    return a.plate.localeCompare(b.plate) || a.journeyId.localeCompare(b.journeyId)
  })
}

export function suspiciousDischargeCsv(rows: SuspiciousDischargeWithoutBalanzaRow[]): string {
  if (!rows.length) return `${SUSPICIOUS_DISCHARGE_CSV_HEADERS.join(',')}\n`
  const csvRows = rows.map((r) => ({
    journey_id: r.journeyId,
    plate: r.plate,
    first_event_at: r.firstEventAt,
    last_event_at: r.lastEventAt,
    discharge_point: r.dischargePoint,
    detected_sequence: r.detectedSequence,
    executive_circuit: r.executiveCircuitDisplay,
    committee_group: r.committeeGroup,
    committee_reason: r.committeeReason,
    useful_events_count: r.usefulEventsCount,
  }))
  return recordsToCsv([...SUSPICIOUS_DISCHARGE_CSV_HEADERS], csvRows)
}

function journeyUidMatchesFilter(uid: string, allowed: Set<string>): boolean {
  const u = String(uid ?? '').trim()
  if (!u) return false
  if (allowed.has(u)) return true
  const base = u.split('__cycle')[0] ?? ''
  return base !== '' && allowed.has(base)
}

/** Misma ventana que auditoría de patentes (40 min por defecto). */
export function buildSuspiciousSlExitRicReturn(
  events: RealJourneyEventDto[],
  opts?: { windowMs?: number; allowedJourneyIds?: Set<string> | null }
): SuspiciousSlExitRicReturnRow[] {
  if (!events.length) return []
  const windowMs = opts?.windowMs ?? SL_EGRESS_RIC_RETURN_WINDOW_MS_DEFAULT
  const allowed = opts?.allowedJourneyIds
  const hints = detectSanLorenzoEgressToRicardoneReturnFromEvents(events, windowMs)
  const rows: SuspiciousSlExitRicReturnRow[] = []
  for (const h of hints) {
    if (allowed?.size) {
      const ok =
        journeyUidMatchesFilter(h.journeyUidAtExit, allowed) ||
        journeyUidMatchesFilter(h.journeyUidAtReturn, allowed)
      if (!ok) continue
    }
    rows.push({
      plate: h.plate,
      day: h.day,
      slExitAt: h.slExitAt,
      slExitPoint: `${h.slExitLabel} (${h.slExitLogical})`,
      ricReturnAt: h.ricReturnAt,
      ricReturnPoint: `${h.ricReturnLabel} (${h.ricReturnLogical})`,
      deltaMinutes: Math.round((h.deltaMs / 60000) * 10) / 10,
      journeyUidAtExit: h.journeyUidAtExit,
      journeyUidAtReturn: h.journeyUidAtReturn,
    })
  }
  return rows
}

export function suspiciousSlExitRicReturnCsv(rows: SuspiciousSlExitRicReturnRow[]): string {
  if (!rows.length) return `${SUSPICIOUS_SL_RIC_RETURN_CSV_HEADERS.join(',')}\n`
  const csvRows = rows.map((r) => ({
    plate: r.plate,
    day: r.day,
    sl_exit_at: r.slExitAt,
    sl_exit_point: r.slExitPoint,
    ric_return_at: r.ricReturnAt,
    ric_return_point: r.ricReturnPoint,
    delta_minutes: r.deltaMinutes,
    journey_uid_exit: r.journeyUidAtExit,
    journey_uid_return: r.journeyUidAtReturn,
  }))
  return recordsToCsv([...SUSPICIOUS_SL_RIC_RETURN_CSV_HEADERS], csvRows)
}

/** Clave estable para agrupar recorridos anómalos. */
export function normalizeAnomalySequenceKey(detectedSequence: string): string {
  const raw = String(detectedSequence ?? '').trim()
  if (!raw) return ANOMALY_SEQUENCE_EMPTY
  return raw
    .split(/>|→|,|\|/g)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .join('>')
}

function displaySequenceFromKey(sequenceKey: string): string {
  return sequenceKey === ANOMALY_SEQUENCE_EMPTY ? '— sin secuencia —' : sequenceKey
}

function countReasons(trucks: CircuitClassificationEntry[]): AnomalyReasonCount[] {
  const m = new Map<string, number>()
  for (const t of trucks) {
    const r = t.committeeReason.trim() || '(sin motivo)'
    m.set(r, (m.get(r) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

/** Agrupa journeys anómalos listables (≥ minEvents) por recorrido observado. */
export function buildAnomalySequenceBreakdown(
  entries: CircuitClassificationEntry[],
  minEvents = ANOMALY_LIST_MIN_EVENTS
): AnomalySequenceBreakdownRow[] {
  const anomalies = entries.filter(
    (e) => committeeCategoryFromEntry(e) === 'anomalias' && e.usefulEventsCount >= minEvents
  )
  const total = anomalies.length
  if (total <= 0) return []

  const bySeq = new Map<string, CircuitClassificationEntry[]>()
  for (const entry of anomalies) {
    const key = normalizeAnomalySequenceKey(entry.detectedSequence)
    const list = bySeq.get(key) ?? []
    list.push(entry)
    bySeq.set(key, list)
  }

  const rows: AnomalySequenceBreakdownRow[] = []
  for (const [sequenceKey, trucks] of bySeq) {
    const sorted = sortDrilldownEntries(trucks)
    const reasonCounts = countReasons(sorted)
    rows.push({
      sequenceKey,
      displaySequence: displaySequenceFromKey(sequenceKey),
      count: sorted.length,
      pctOfAnomalies: Math.round((sorted.length / total) * 1000) / 10,
      eventCount: sequenceKey === ANOMALY_SEQUENCE_EMPTY ? 0 : sequenceKey.split('>').length,
      topCommitteeReason: reasonCounts[0]?.reason ?? '',
      reasonCounts,
      trucks: sorted,
    })
  }

  return rows.sort(
    (a, b) => b.count - a.count || a.displaySequence.localeCompare(b.displaySequence)
  )
}

/** Separa anomalías en incompletos (&lt;3 evt, solo contador) y listado por recorrido (≥3 evt). */
export function buildAnomalyReviewSummary(entries: CircuitClassificationEntry[]): AnomalyReviewSummary {
  const anomalies = entries.filter((e) => committeeCategoryFromEntry(e) === 'anomalias')
  const incompleteCount = anomalies.filter((e) => e.usefulEventsCount < ANOMALY_LIST_MIN_EVENTS).length
  const sequenceRows = buildAnomalySequenceBreakdown(entries, ANOMALY_LIST_MIN_EVENTS)
  const listedAnomalyCount = sequenceRows.reduce((acc, r) => acc + r.count, 0)
  return { incompleteCount, sequenceRows, listedAnomalyCount }
}

export function anomalySequenceSummaryCsv(rows: AnomalySequenceBreakdownRow[]): string {
  if (!rows.length) return `${ANOMALY_SEQUENCE_CSV_HEADERS.join(',')}\n`
  const csvRows = rows.map((r) => ({
    sequence_key: r.sequenceKey,
    detected_sequence: r.displaySequence,
    count: r.count,
    pct_of_anomalies: r.pctOfAnomalies,
    event_count: r.eventCount,
    top_committee_reason: r.topCommitteeReason,
    committee_reasons_breakdown: r.reasonCounts.map((x) => `${x.reason}:${x.count}`).join(' | '),
  }))
  return recordsToCsv([...ANOMALY_SEQUENCE_CSV_HEADERS], csvRows)
}

function emptyChartRow(recordType: string): Record<string, string | number> {
  return {
    record_type: recordType,
    executive_circuit_code: '',
    executive_circuit_label: '',
    display_label: '',
    committee_group: '',
    committee_category: '',
    journey_id: '',
    plate: '',
    detected_sequence: '',
    count: '',
    pct: '',
    pct_completos: '',
    pct_variaciones: '',
    pct_of_anomalies: '',
    useful_events_count: '',
    committee_reason: '',
    operational_variation_type: '',
    matrix_final_status: '',
    executive_status: '',
    executive_reason: '',
    matrix_reason: '',
    top_committee_reason: '',
    committee_reasons_breakdown: '',
    event_count: '',
  }
}

/**
 * CSV único para gráficos de barras / torta / anomalías — mismo contenido que la UI de conciliación.
 * record_type: CIRCUITO_COMITE | CIRCUITO_COMITE_CELDA | TOTAL_VALIDOS | COMITE_RESUMEN |
 * CIRCUITO_BARRA | ANOMALIA_INCOMPLETOS | ANOMALIA_RECORRIDO | JOURNEY
 */
export function committeeChartExportCsv(
  input: {
    entries: CircuitClassificationEntry[]
    crossTab: CommitteeCircuitCrossTabRow[]
    crossTabTotals: { total: number; completos: number; variaciones: number }
    anomalyReview: AnomalyReviewSummary
    circuitBarSlices: ExecutiveCircuitBarSlice[]
  },
  options: CommitteeChartExportOptions = {}
): string {
  const includeJourneyRows = options.includeJourneyRows !== false
  const rows: Record<string, string | number>[] = []
  const grandTotal =
    input.crossTabTotals.total +
    input.anomalyReview.incompleteCount +
    input.anomalyReview.listedAnomalyCount

  for (const r of input.crossTab) {
    rows.push({
      ...emptyChartRow('CIRCUITO_COMITE'),
      executive_circuit_code: r.code,
      executive_circuit_label: r.label,
      display_label: r.displayLabel,
      count: r.total,
      pct_completos: r.pctCompletos,
      pct_variaciones: r.pctVariaciones,
    })
    if (r.completos > 0) {
      rows.push({
        ...emptyChartRow('CIRCUITO_COMITE_CELDA'),
        executive_circuit_code: r.code,
        executive_circuit_label: r.label,
        display_label: r.displayLabel,
        committee_category: 'completos',
        count: r.completos,
        pct: r.pctCompletos,
      })
    }
    if (r.variaciones > 0) {
      rows.push({
        ...emptyChartRow('CIRCUITO_COMITE_CELDA'),
        executive_circuit_code: r.code,
        executive_circuit_label: r.label,
        display_label: r.displayLabel,
        committee_category: 'variaciones',
        count: r.variaciones,
        pct: r.pctVariaciones,
      })
    }
  }

  rows.push({
    ...emptyChartRow('TOTAL_VALIDOS'),
    display_label: 'Total válidos (completos + variaciones)',
    count: input.crossTabTotals.total,
    pct_completos:
      input.crossTabTotals.total > 0 ?
        Math.round((input.crossTabTotals.completos / input.crossTabTotals.total) * 1000) / 10
      : 0,
    pct_variaciones:
      input.crossTabTotals.total > 0 ?
        Math.round((input.crossTabTotals.variaciones / input.crossTabTotals.total) * 1000) / 10
      : 0,
  })

  const pushResumen = (category: string, count: number) => {
    if (count <= 0) return
    rows.push({
      ...emptyChartRow('COMITE_RESUMEN'),
      committee_category: category,
      count,
      pct: grandTotal > 0 ? Math.round((count / grandTotal) * 1000) / 10 : 0,
    })
  }
  pushResumen('completos', input.crossTabTotals.completos)
  pushResumen('variaciones', input.crossTabTotals.variaciones)
  pushResumen('anomalias_listadas', input.anomalyReview.listedAnomalyCount)
  pushResumen('anomalias_incompletos', input.anomalyReview.incompleteCount)

  for (const slice of input.circuitBarSlices) {
    rows.push({
      ...emptyChartRow('CIRCUITO_BARRA'),
      executive_circuit_code: slice.code,
      executive_circuit_label: slice.label,
      display_label: slice.displayLabel,
      count: slice.count,
      pct: input.entries.length > 0 ? Math.round((slice.count / input.entries.length) * 1000) / 10 : 0,
    })
  }

  if (input.anomalyReview.incompleteCount > 0) {
    rows.push({
      ...emptyChartRow('ANOMALIA_INCOMPLETOS'),
      display_label: `Incompletos (<${ANOMALY_LIST_MIN_EVENTS} eventos)`,
      count: input.anomalyReview.incompleteCount,
      pct:
        grandTotal > 0 ?
          Math.round((input.anomalyReview.incompleteCount / grandTotal) * 1000) / 10
        : 0,
    })
  }

  for (const ar of input.anomalyReview.sequenceRows) {
    rows.push({
      ...emptyChartRow('ANOMALIA_RECORRIDO'),
      detected_sequence: ar.displaySequence,
      count: ar.count,
      pct_of_anomalies: ar.pctOfAnomalies,
      event_count: ar.eventCount,
      top_committee_reason: ar.topCommitteeReason,
      committee_reasons_breakdown: ar.reasonCounts.map((x) => `${x.reason}:${x.count}`).join(' | '),
    })
  }

  if (includeJourneyRows) {
    for (const e of input.entries) {
      rows.push({
        ...emptyChartRow('JOURNEY'),
        executive_circuit_code: e.executiveCircuitCode,
        executive_circuit_label: e.executiveCircuitLabel,
        display_label: e.executiveCircuitDisplay,
        committee_group: e.committeeGroup,
        committee_category: committeeCategoryFromEntry(e),
        journey_id: e.journeyId,
        plate: e.plate,
        detected_sequence: e.detectedSequence,
        count: 1,
        useful_events_count: e.usefulEventsCount,
        committee_reason: e.committeeReason,
        operational_variation_type: e.operationalVariationType,
        matrix_final_status: e.matrixFinalStatus,
        executive_status: e.executiveStatus,
        executive_reason: e.executiveReason,
        matrix_reason: e.matrixReason,
        event_count: e.detectedSequence ? e.detectedSequence.split('>').length : 0,
      })
    }
  }

  return recordsToCsv([...COMMITTEE_CHART_EXPORT_HEADERS], rows)
}

/** Cruce circuito ejecutivo × categoría comité — reconcilia torta vs barras. */
export function buildCommitteeCircuitCrossTab(
  entries: CircuitClassificationEntry[]
): CommitteeCircuitCrossTabRow[] {
  const byCode = new Map<
    string,
    {
      completos: number
      variaciones: number
      anomalias: number
      label: string
      trucksCompletos: CircuitClassificationEntry[]
      trucksVariaciones: CircuitClassificationEntry[]
      trucksAnomalias: CircuitClassificationEntry[]
    }
  >()

  for (const entry of entries) {
    const code = entry.executiveCircuitCode || 'SIN_ASIGNAR'
    const bucket = byCode.get(code) ?? {
      completos: 0,
      variaciones: 0,
      anomalias: 0,
      label: entry.executiveCircuitLabel || code,
      trucksCompletos: [],
      trucksVariaciones: [],
      trucksAnomalias: [],
    }
    const category = committeeCategoryFromEntry(entry)
    if (category === 'completos') {
      bucket.completos++
      bucket.trucksCompletos.push(entry)
    } else if (category === 'variaciones') {
      bucket.variaciones++
      bucket.trucksVariaciones.push(entry)
    }
    // Anomalías: no se asignan a filas de circuito (ver buildAnomalySequenceBreakdown).
    byCode.set(code, bucket)
  }

  const rows: CommitteeCircuitCrossTabRow[] = []
  const emit = (
    code: string,
    data: {
      completos: number
      variaciones: number
      anomalias: number
      label: string
      trucksCompletos: CircuitClassificationEntry[]
      trucksVariaciones: CircuitClassificationEntry[]
      trucksAnomalias: CircuitClassificationEntry[]
    }
  ) => {
    const total = data.completos + data.variaciones
    if (total <= 0) return
    const cfg = EXECUTIVE_CIRCUIT_MATRIX[code]
    const label = cfg?.label ?? data.label ?? code
    rows.push({
      code,
      label,
      displayLabel: formatExecutiveCircuitLabel(code, label),
      total,
      completos: data.completos,
      variaciones: data.variaciones,
      anomalias: 0,
      pctCompletos: Math.round((data.completos / total) * 1000) / 10,
      pctVariaciones: Math.round((data.variaciones / total) * 1000) / 10,
      pctAnomalias: 0,
      trucksCompletos: sortDrilldownEntries(data.trucksCompletos),
      trucksVariaciones: sortDrilldownEntries(data.trucksVariaciones),
      trucksAnomalias: [],
    })
  }

  for (const code of EXECUTIVE_CIRCUIT_ORDER) {
    const data = byCode.get(code)
    if (data) emit(code, data)
  }
  const unassigned = byCode.get('SIN_ASIGNAR')
  if (unassigned) emit('SIN_ASIGNAR', unassigned)

  for (const [code, data] of byCode) {
    if (code === 'SIN_ASIGNAR' || (EXECUTIVE_CIRCUIT_ORDER as readonly string[]).includes(code)) continue
    emit(code, data)
  }

  return rows.sort((a, b) => b.total - a.total)
}

export function buildCircuitClassificationIndex(
  debugMatrixCsv: string | undefined | null,
  mergedTruckflowMovimientosCsv?: string | undefined | null,
  excelOperationsWithTruckflowCsv?: string | undefined | null
): CircuitClassificationIndex {
  const empty: CircuitClassificationIndex = {
    entries: [],
    byJourneyId: new Map(),
    byPlate: new Map(),
    byPieSlice: new Map(),
    pieSlices: [],
    circuitBarSlices: [],
    total: 0,
    excelFirstReconciledCount: 0,
    excelPromotedCount: 0,
  }
  if (!debugMatrixCsv?.trim()) return empty

  const { rows } = parseCsvToRecords(debugMatrixCsv)
  if (!rows.length) return empty

  const prelimEntries: CircuitClassificationEntry[] = []
  for (const r of rows) {
    prelimEntries.push(rowToEntry(r, CIRCUIT_PIE_COLORS[0]!))
  }

  let entries = promotePlateDischargeFragments(prelimEntries)

  if (excelOperationsWithTruckflowCsv?.trim()) {
    const excelReco = applyExcelFirstReconciliation(entries, excelOperationsWithTruckflowCsv)
    entries = reclassifyPossibleRejections(excelReco.entries).entries
    return rebuildClassificationIndexFromEntries(
      entries,
      excelReco.promotedCount,
      excelReco.reconciledCount
    )
  }

  const excelPromo = promoteExcelMovimientosContrato(entries, mergedTruckflowMovimientosCsv)
  entries = reclassifyPossibleRejections(excelPromo.entries).entries

  return rebuildClassificationIndexFromEntries(entries, excelPromo.promotedCount, excelPromo.promotedCount)
}

/** Resuelve clasificación ETL para una fila en vivo (prioriza journeyUid). */
export function resolveClassificationForLiveRow(
  index: CircuitClassificationIndex,
  journeyUid: string,
  plate: string
): CircuitClassificationEntry | null {
  const ju = journeyUid.trim()
  if (ju) {
    const byJ = index.byJourneyId.get(ju)
    if (byJ) return byJ
  }
  const p = normalizePlate(plate)
  if (!p) return null
  const list = index.byPlate.get(p)
  if (!list?.length) return null
  if (ju) {
    const match = list.find((e) => e.journeyId === ju)
    if (match && match.committeeGroup !== 'ANOMALIAS') return match
  }
  const dischargeCompletos = list
    .filter((e) => e.committeeGroup === 'COMPLETOS' && entryHasDischargeClassification(e))
    .sort((a, b) => b.usefulEventsCount - a.usefulEventsCount)
  if (dischargeCompletos.length) return dischargeCompletos[0]!
  const anyCompletos = list.filter((e) => e.committeeGroup === 'COMPLETOS').sort((a, b) => b.usefulEventsCount - a.usefulEventsCount)
  if (anyCompletos.length) return anyCompletos[0]!
  if (list.length === 1) return list[0]!
  if (ju) {
    const match = list.find((e) => e.journeyId === ju)
    if (match) return match
  }
  return list[0]!
}
