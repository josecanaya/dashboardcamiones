import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import {
  detectSanLorenzoEgressToRicardoneReturnFromEvents,
} from '../../../services/realPlateAudit'
import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords } from './etlCsvParse'
import { MERGE_STATUSES_WITH_PRODUCT } from './etlTruckflowMovimientosMerge'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import { resolveCommitteeExcelOperationId } from './excelStableOperationId'
import { excelPlantaIsSanLorenzoTerminal } from './etlRicSanLorenzoRoute'
import {
  inferAceiteExecutiveCircuitFromExcel,
  inferAceiteExecutiveCircuitFromPlatform,
  inferAceiteExecutiveCircuitFromTruckflowEvidence,
  isAceiteAnalysisExcludedPlant,
  isAceiteExecutiveCircuitCode,
  isExcelLiquidMovementForOrphanCommittee,
  isExcelLiquidProductName,
  isPermittedAceiteLiquidDischargePlatform,
  excelObservacionesIndicateRenovaAceite,
  hasSl3RenovaCameraEvidence,
} from './slLiquidCameras'
import {
  EXECUTIVE_CIRCUIT_MATRIX,
  EXECUTIVE_CIRCUIT_ORDER,
  formatExecutiveCircuitLabel,
} from './finalCircuitScoring'
import { ensureArgentinaOffsetIso, operationalDayKeyFromIso } from './etlTimestampNormalize'
import { ANOMALY_MIN_FRONT_EVENTS, type AnomalyKind } from '../../../etl-core/domain/anomalyClassifier'
import {
  GOLDEN_SL_RIC_MAX_MS,
  isPelletCircuitCode,
  NO_PELLET_ANOMALY_REASONS,
  PELLET_TRANSILE_CIRCUIT_CODES,
} from '../../../etl-core/domain/goldenAnomalyRules'
import { normalizeDeVuelta } from '../../../etl-core/ingest/externalNormalization'
import { CIRCUIT_CATALOG } from '../../../etl-core/domain/circuitCatalog'
import {
  isPelletExcelProduct,
  resolvePelletCircuit,
  PELLET_DESPACHO_CODES,
  PELLET_TRANSILE_CODES,
  unifyPelletCircuitCode,
  pelletUnifiedCircuitLabel,
} from '../../../etl-core/reports/transileExternoCiclo'

/** Todos los circuitos de pellet (despacho R13/14/15 + transile externo R30/31/32). */
const ALL_PELLET_CIRCUIT_CODES = new Set<string>([...PELLET_DESPACHO_CODES, ...PELLET_TRANSILE_CODES])

/** Fuente de matriz de clasificación: CSV legacy o filas TypedTable (Fase 2). */
export type DebugMatrixSource = string | readonly Record<string, unknown>[] | null | undefined

export function debugMatrixHasData(source: DebugMatrixSource): boolean {
  if (source == null) return false
  if (typeof source === 'string') return Boolean(source.trim())
  return source.length > 0
}

export function debugMatrixRowsFrom(source: DebugMatrixSource): Record<string, unknown>[] {
  if (!debugMatrixHasData(source)) return []
  if (typeof source === 'string') return parseCsvToRecords(source).rows
  return [...(source as readonly Record<string, unknown>[])]
}

/** Fuente de operaciones Excel-first: CSV legacy o filas TypedTable (Fase 2). */
export type ExcelOpsSource = string | readonly Record<string, unknown>[] | null | undefined

export function excelOpsHasData(source: ExcelOpsSource): boolean {
  if (source == null) return false
  if (typeof source === 'string') return Boolean(source.trim())
  return source.length > 0
}

export function excelOpsRows(source: ExcelOpsSource): Record<string, unknown>[] {
  if (!excelOpsHasData(source)) return []
  if (typeof source === 'string') return parseCsvToRecords(source).rows
  return [...(source as readonly Record<string, unknown>[])]
}

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
  /** Cruces Truckflow (columna event_count comité; pasos en detected_sequence). No confundir con usefulEventsCount. */
  eventCount: number
  executiveBucket: string
  matrixReason: string
  /**
   * Eje comportamiento/datos del clasificador único `classifyAnomaly` (columna
   * anomaly_kind de debug_matrix). Opcional: entradas sintéticas/legacy no lo traen.
   * Cuando está presente, gobierna el listado de anomalías (BEHAVIORAL = real).
   */
  anomalyKind?: AnomalyKind
  anomalyKindReason?: string
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

/** Las tres porciones del comité. Universo: journeys evaluables (ver `buildCommitteeEvaluableModel`). */
export const COMMITTEE_PIE_SLICE_COMPLETOS = 'COMPLETOS'
export const COMMITTEE_PIE_SLICE_VARIACIONES = 'VARIACIONES OPERATIVAS'
export const COMMITTEE_PIE_SLICE_ANOMALIAS = 'ANOMALÍAS'

/** True si al abrir esta porción corresponde el panel de anomalías por recorrido. */
export function isAnomalyPanelPieSlice(sliceName: string): boolean {
  return String(sliceName ?? '').trim().toUpperCase() === COMMITTEE_PIE_SLICE_ANOMALIAS
}

export type CircuitPieSliceWithTrucks = CircuitPieSlice & {
  trucks: CircuitClassificationEntry[]
}

export type CommitteeCrossTabCategory = 'completos' | 'variaciones' | 'anomalias'

export type CommitteeCircuitCrossTabRow = {
  code: string
  label: string
  displayLabel: string
  /** Universo evaluable del circuito: completos + variaciones + anomalías. */
  total: number
  /** Netos de anomalías (un journey con anomalía ya no cuenta como completo). */
  completos: number
  variaciones: number
  /** Anomalías de comportamiento imputadas a este circuito. Mismo conjunto que la torta y el panel. */
  anomalias: number
  pctCompletos: number
  pctVariaciones: number
  pctAnomalias: number
  trucksCompletos: CircuitClassificationEntry[]
  trucksVariaciones: CircuitClassificationEntry[]
  trucksAnomalias: CircuitClassificationEntry[]
}

/** Prefijo de `journeyId` de las filas ancladas a una operación del Excel (Excel-first). */
export const EXCEL_ANCHOR_JOURNEY_PREFIX = 'excel:'

export type AnomalyReasonCount = { reason: string; count: number }

/** Mínimo de eventos útiles para listar un journey en el panel de anomalías por recorrido. */
export const ANOMALY_LIST_MIN_EVENTS = 2

/** Circuitos transile externo: no figuran en el listado de anomalías. */
export const TRANSILE_EXTERNO_ANOMALY_EXCLUDED_CODES = new Set([
  'R26',
  'R27',
  'R28',
  'R30',
  'R31',
  'R32',
  'R34',
])

/** Circuitos transile interno (Volcable / C16 interno): no figuran en el listado de anomalías. */
export const TRANSILE_INTERNO_ANOMALY_EXCLUDED_CODES = new Set([
  'R17',
  'R18',
  'R19',
  'R20',
  'R21',
  'R22',
  'R23',
  'R24',
  'R25',
  'R28',
  'R29',
  'R30',
  'R31',
  'R32',
  'R33',
])

export type AnomalyListContext = {
  /**
   * Patentes normalizadas presentes en Movimientos por Contrato.
   * `null` / omitido = no hay Excel cargado → listado vacío.
   * `Set` (aunque vacío) = Excel cargado; solo listan patentes ausentes del set.
   */
  excelPlates: Set<string> | null
  /**
   * Claves `PLATE|YYYY-MM-DD` de Movimientos por Contrato (G5).
   * `null` = Excel no cargado → G5 no dispara.
   */
  excelPlateDays?: Set<string> | null
  /** Patentes del plate registry con excludeFromAnalytics (refuerzo del filtro ETL). */
  excludedRegistryPlates?: Set<string>
  /**
   * Patentes (normalizadas) de sesiones transile interno/externo inferidas.
   * El transile interno no se estampa como código/razón en la entrada (es un
   * reporte de sesiones por patente), así que se excluye por patente acá.
   */
  transileExcludedPlates?: Set<string>
  /**
   * Patentes con Excel «De la vuelta» = SI (`es_de_vuelta`).
   * No deben figurar en anomalías ni en sospechosos SL→Ric.
   */
  deVueltaExcludedPlates?: Set<string>
  minEvents?: number
}

/** Clave estable patente+día operativo para matching Excel (G5). */
export function excelPlateDayKey(plate: string, day: string): string {
  return `${normalizePlate(plate)}|${String(day ?? '').trim()}`
}

export type AnomalyReviewSummary = {
  /** Candidatos sin Excel/transile/registry con menos de minEvents — solo contador, sin listado. */
  incompleteCount: number
  /** Journeys listables (≥ minEvents, sin Excel, sin transile, sin registry) agrupados por secuencia. */
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
  'anomaly_kind',
  'anomaly_kind_reason',
  'sample_filter',
] as const

export type CommitteeChartExportOptions = {
  /** Incluir una fila JOURNEY por camión (archivo más grande). Default true. */
  includeJourneyRows?: boolean
  /** Metadata de muestra aplicada en la exportación (p. ej. ACEITE_TRUCKFLOW_EVENT_COUNT_GTE_2). */
  sampleFilter?: string
}

export function eventCountFromDetectedSequence(detectedSequence: string): number {
  const s = String(detectedSequence ?? '').trim()
  if (!s) return 0
  return s.split('>').filter(Boolean).length
}

function eventCountFromMatrixRow(row: Record<string, unknown>, detectedSequence: string): number {
  const raw = String(row.event_count ?? '').trim()
  if (raw !== '') {
    const n = Number(raw)
    if (Number.isFinite(n)) return Math.max(0, n)
  }
  return eventCountFromDetectedSequence(detectedSequence)
}

/** Cruces Truckflow usados en comité (event_count), no useful_events_count. */
export function truckflowCrossingCountFromEntry(entry: CircuitClassificationEntry): number {
  const n = Number(entry.eventCount)
  if (Number.isFinite(n) && n >= 0) return n
  return eventCountFromDetectedSequence(entry.detectedSequence)
}

export function filterEntriesByMinTruckflowCrossings(
  entries: CircuitClassificationEntry[],
  minCrossings = 2
): CircuitClassificationEntry[] {
  const min = Math.max(0, minCrossings)
  return entries.filter((entry) => truckflowCrossingCountFromEntry(entry) >= min)
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

export function pieSliceLabelFromMatrixRow(row: Record<string, unknown>): string {
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

function resolveExecutiveFields(row: Record<string, unknown>): {
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

function rowToEntry(row: Record<string, unknown>, color: string): CircuitClassificationEntry {
  const pieSliceLabel = pieSliceLabelFromMatrixRow(row)
  const plate = String(row.plate ?? '').trim()
  const executive = resolveExecutiveFields(row)
  const detectedSequence = String(row.detected_sequence ?? '').trim()
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
    detectedSequence,
    deviceSequence: String(row.device_sequence ?? '').trim(),
    firstEventAt: String(row.first_event_at ?? '').trim(),
    lastEventAt: String(row.last_event_at ?? '').trim(),
    executiveReason: String(row.executive_reason ?? '').trim(),
    pieSliceLabel,
    usefulEventsCount: Number(String(row.useful_events_count ?? '').trim()) || 0,
    eventCount: eventCountFromMatrixRow(row, detectedSequence),
    executiveBucket: String(row.executive_bucket ?? '').trim().toUpperCase(),
    matrixReason: String(row.matrix_reason ?? '').trim(),
    ...parseAnomalyKindColumns(row),
    color,
  }
}

/**
 * Extrae `anomalyKind`/`anomalyKindReason` solo si la fuente trae la columna
 * `anomaly_kind` (debug_matrix nuevo). Sin la columna, deja los campos ausentes
 * para que el listado use el camino legacy (compatibilidad con corridas viejas y tests).
 */
function parseAnomalyKindColumns(
  row: Record<string, unknown>
): { anomalyKind?: AnomalyKind; anomalyKindReason?: string } {
  if (!('anomaly_kind' in row)) return {}
  const raw = String(row.anomaly_kind ?? '').trim().toUpperCase()
  const kind: AnomalyKind =
    raw === 'BEHAVIORAL' ? 'BEHAVIORAL'
    : raw === 'DATA_COVERAGE' ? 'DATA_COVERAGE'
    : 'NONE'
  return { anomalyKind: kind, anomalyKindReason: String(row.anomaly_kind_reason ?? '').trim() }
}

export function buildExecutiveCircuitBarSlices(
  entries: CircuitClassificationEntry[]
): ExecutiveCircuitBarSlice[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    // Pellet unificado: R13/14/15 y R30/31/32 cuentan como un solo circuito (no por celda).
    const key = unifyPelletCircuitCode(entry.executiveCircuitCode) || 'SIN_ASIGNAR'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const slices: ExecutiveCircuitBarSlice[] = []
  const emitted = new Set<string>()
  const pushSlice = (code: string, count: number) => {
    const cfg = EXECUTIVE_CIRCUIT_MATRIX[code]
    const label = pelletUnifiedCircuitLabel(code) ?? cfg?.label ?? CIRCUIT_CATALOG[code]?.label ?? code
    slices.push({ code, label, displayLabel: formatExecutiveCircuitLabel(code, label), count })
    emitted.add(code)
  }
  for (const code of EXECUTIVE_CIRCUIT_ORDER) {
    const count = counts.get(code) ?? 0
    if (count <= 0) continue
    pushSlice(code, count)
  }
  // Circuitos asignados que no están en EXECUTIVE_CIRCUIT_ORDER (ej. despacho pellet
  // R13/R14/R15) NO deben desaparecer del gráfico ni del total: se agregan al final,
  // por cantidad desc. Sin esto el "total de journeys con circuito asignado" quedaba
  // corto (faltaban las barras de esos circuitos).
  for (const [code, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    if (code === 'SIN_ASIGNAR' || emitted.has(code) || count <= 0) continue
    pushSlice(code, count)
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
  mov: string
  source_date: string
  truckflow_circuit_codes: string
  resolved_circuit_family: string
  resolved_executive_circuit_code: string
  match_quality: string
  route_quality: string
  evidence_count: number
  truckflow_observed_sequence_combined: string
  truckflow_device_sequence_combined: string
  observaciones: string
  observacion_calidad: string
  /** Excel «De la vuelta»: pellet a SLZ (R30/31/32) vs despacho (R13/14/15). */
  es_de_vuelta: boolean
}

const EXCEL_FIRST_MATCH_RANK: Record<string, number> = {
  EXTERNAL_MATCH_EXACT: 5,
  EXTERNAL_MATCH_PROBABLE: 4,
  EXTERNAL_MATCH_FUZZY_PLATE: 3,
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
}

/** Circuitos de sólidos que no deben asignarse si el Excel es aceite/líquido. */
const SOLID_EXECUTIVE_CIRCUITS = new Set([
  'R7',
  'R5',
  'R6',
  'R1',
  'R2',
  'R3',
  'R4',
  'R9',
  'R19',
  'R20',
  'R26',
])

const LIQUID_EXECUTIVE_CIRCUITS = new Set(['R8', 'SL1', 'SL2', 'SL3', 'R16', 'SL5', 'R34'])

function excelLiteIsLiquidOperational(lite: ExcelFirstReconcileLite): boolean {
  if (isAceiteAnalysisExcludedPlant(lite.planta_normalized)) return false
  if (lite.resolved_circuit_family.toUpperCase() === 'LIQUIDO') return true
  if (isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) return true
  return isExcelLiquidProductName(lite.product_normalized, lite.platform_normalized)
}

function excelFirstMatchRank(lite: ExcelFirstReconcileLite): number {
  return EXCEL_FIRST_MATCH_RANK[lite.match_quality] ?? 0
}

function pickBestExcelFirstLite(candidates: ExcelFirstReconcileLite[]): ExcelFirstReconcileLite | undefined {
  if (!candidates.length) return undefined
  return candidates.reduce((best, c) => (excelFirstMatchRank(c) > excelFirstMatchRank(best) ? c : best))
}

function excelLiteMatchesEntrySite(lite: ExcelFirstReconcileLite, entry: CircuitClassificationEntry): boolean {
  const plant = String(lite.planta_normalized ?? '').trim().toUpperCase()
  const site = String(entry.site ?? '').trim().toUpperCase()
  if (!plant || !site) return true
  if (plant === 'RICARDONE') return site.includes('RICARDONE')
  if (plant === 'TERMINAL_EMBARQUE' || plant === 'SAN_LORENZO') {
    return site.includes('TERMINAL') || site.includes('SAN_LORENZO') || site.includes('EMBARQUE')
  }
  return site.includes(plant)
}

function entryAceiteTruckflowExecutiveCode(entry: CircuitClassificationEntry): string {
  return (
    inferAceiteExecutiveCircuitFromTruckflowEvidence(
      entry.executiveCircuitCode || entry.matchedCircuitCode,
      aceiteTruckflowHaystackFromEntry(entry)
    ) ?? ''
  )
}

function shouldSkipCrossPlantAceiteExcelReconcile(
  entry: CircuitClassificationEntry,
  lite: ExcelFirstReconcileLite,
  byJourney: Map<string, ExcelFirstReconcileLite>
): boolean {
  if (byJourney.has(entry.journeyId)) return false
  const tfCode = entryAceiteTruckflowExecutiveCode(entry)
  if (tfCode !== 'R8') return false
  if (excelLiteMatchesEntrySite(lite, entry)) return false
  const plant = String(lite.planta_normalized ?? '').trim().toUpperCase()
  return plant === 'TERMINAL_EMBARQUE' || plant === 'SAN_LORENZO' || excelPlantaIsSanLorenzoTerminal(lite.planta_normalized)
}

function inferExecutiveCircuitFromExcelPlatform(lite: ExcelFirstReconcileLite): string {
  const movType = String(lite.movement_type ?? '').trim().toUpperCase()
  const movCode = String(lite.mov ?? '').trim().toUpperCase()
  const inferred = inferCircuitFromExternalMovimiento({
    platform_normalized: lite.platform_normalized,
    plataforma_original: lite.plataforma_original,
    planta_normalized: lite.planta_normalized,
    movement_type: movType,
    movement_type_detail: movCode || movType,
    mov: movCode || (movType === 'DESPACHO' ? 'DE' : movType === 'INGRESO' ? 'I' : ''),
    observaciones: lite.observaciones,
    observacion_calidad: lite.observacion_calidad,
    product_normalized: lite.product_normalized,
  })
  return inferred?.circuit_code ?? ''
}

function slCircuitAllowedForExcelLite(lite: ExcelFirstReconcileLite, code: string): boolean {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) return false

  if (excelLiteIsLiquidOperational(lite)) {
    if (SOLID_EXECUTIVE_CIRCUITS.has(c)) return false
    if (!LIQUID_EXECUTIVE_CIRCUITS.has(c)) return false
  }

  if (c !== 'SL1' && c !== 'SL2' && c !== 'SL3' && c !== 'SL5') return true
  if (c === 'SL3') {
    if (isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) {
      return false
    }
    // SL3 exige evidencia de cámara Renova (SLZTK400) en el recorrido del camión.
    if (
      !hasSl3RenovaCameraEvidence(
        lite.truckflow_observed_sequence_combined,
        lite.truckflow_device_sequence_combined
      )
    ) {
      return false
    }
    return (
      excelObservacionesIndicateRenovaAceite(lite.observaciones, lite.observacion_calidad) ||
      isExcelLiquidProductName(lite.product_normalized, lite.platform_normalized)
    )
  }
  if (excelPlantaIsSanLorenzoTerminal(lite.planta_normalized)) return true
  const plant = String(lite.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'TERMINAL_EMBARQUE' && isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) {
    return true
  }
  if (plant === 'RICARDONE' && excelLiteIsLiquidOperational(lite)) return false
  return false
}

function ricExecutiveFallbackFromExcelLite(lite: ExcelFirstReconcileLite): string {
  const plant = String(lite.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'TERMINAL_EMBARQUE' && isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) {
    const fromPlatform = inferExecutiveCircuitFromExcelPlatform(lite)
    if (fromPlatform && slCircuitAllowedForExcelLite(lite, fromPlatform)) return fromPlatform
  }
  if (plant !== 'RICARDONE') return ''
  const stored = String(lite.resolved_executive_circuit_code ?? '').trim().toUpperCase()
  if (stored && slCircuitAllowedForExcelLite(lite, stored)) return stored
  const fromPlatform = inferExecutiveCircuitFromExcelPlatform(lite)
  if (fromPlatform && slCircuitAllowedForExcelLite(lite, fromPlatform)) return fromPlatform
  const product = `${lite.product_normalized} ${lite.platform_normalized}`.toUpperCase()
  if (isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) return ''
  if (product.includes('ACEITE') || product.includes('LIQUIDO') || product.includes('OSL')) return 'R8'
  const fam = lite.resolved_circuit_family.toUpperCase()
  if (fam.includes('VOLCABLE')) return 'R5'
  if (fam.includes('CELDA')) return 'R1'
  if (fam.includes('KEPLER')) return 'R3'
  return ''
}

function normalizeLiquidExecutiveCircuitCode(code: string): string {
  const c = String(code ?? '').trim().toUpperCase()
  if (c === 'SL5') return 'SL2'
  if (c === 'R16') return 'R8'
  return c
}

function excelRowIndicatesAceite(lite: ExcelFirstReconcileLite): boolean {
  if (isAceiteAnalysisExcludedPlant(lite.planta_normalized)) return false
  if (isPermittedAceiteLiquidDischargePlatform(lite.platform_normalized, lite.plataforma_original)) {
    return true
  }
  if (
    inferAceiteExecutiveCircuitFromExcel(
      lite.platform_normalized,
      lite.plataforma_original,
      lite.planta_normalized,
      lite.observaciones,
      lite.observacion_calidad,
      lite.product_normalized
    )
  ) {
    return true
  }
  return isExcelLiquidProductName(lite.product_normalized, lite.platform_normalized)
}

/** Excel aceite por journey/patente (prioriza plataforma aceite explícita). */
function resolveExcelAceiteLiteForEntry(
  entry: CircuitClassificationEntry,
  byJourney: Map<string, ExcelFirstReconcileLite>,
  byPlate: Map<string, ExcelFirstReconcileLite[]>
): ExcelFirstReconcileLite | undefined {
  const direct = resolveExcelFirstLiteForEntry(entry, byJourney, byPlate)
  if (direct && excelRowIndicatesAceite(direct)) return direct

  const plate = entry.normalizedPlate
  if (!plate) return undefined
  const aceiteCands = (byPlate.get(plate) ?? []).filter(excelRowIndicatesAceite)
  if (!aceiteCands.length) return undefined

  const dayKey = operationalDayKeyFromIso(entry.firstEventAt)
  const sameDay = dayKey ? aceiteCands.filter((c) => c.source_date === dayKey) : []
  return pickBestExcelFirstLite(sameDay.length ? sameDay : aceiteCands)
}

const SOLID_ROUTE_EXECUTIVE_FOR_ACEITE_VIEW = new Set(['R7', 'R5', 'R6'])

function pickExecutiveCircuitFromExcelFirst(lite: ExcelFirstReconcileLite): string {
  // Pellet gana sobre cualquier evidencia de cámara: el camión de pellet pasa por la
  // calada de líquidos (que llevaría a R8) pero su circuito real es despacho R13/14/15
  // (no va a SLZ) o transile externo R30/31/32 (va a SLZ), según `es_de_vuelta`; la
  // celda 09/10/11 elige el subcódigo. [[glicerina-r8-liquido]]
  if (isPelletExcelProduct(lite.product_normalized)) {
    const platform = String(lite.platform_normalized || lite.plataforma_original || '').trim()
    return resolvePelletCircuit({ esDeVuelta: lite.es_de_vuelta, platformHint: platform }).assigned
  }

  const aceiteExcel = inferAceiteExecutiveCircuitFromExcel(
    lite.platform_normalized,
    lite.plataforma_original,
    lite.planta_normalized,
    lite.observaciones,
    lite.observacion_calidad,
    lite.product_normalized
  )
  if (aceiteExcel && slCircuitAllowedForExcelLite(lite, aceiteExcel)) {
    return aceiteExcel
  }

  const stored = String(lite.resolved_executive_circuit_code ?? '').trim().toUpperCase()
  if (stored && slCircuitAllowedForExcelLite(lite, stored) && !GENERIC_INFERRED_CIRCUIT_CODES.has(stored)) {
    return stored
  }

  const platform = String(lite.platform_normalized || lite.plataforma_original || '').trim()
  const fromPlatformRaw = platform ? inferExecutiveCircuitFromExcelPlatform(lite) : ''
  const fromPlatform = normalizeLiquidExecutiveCircuitCode(fromPlatformRaw)

  if (
    platform &&
    fromPlatform &&
    !GENERIC_INFERRED_CIRCUIT_CODES.has(fromPlatform) &&
    slCircuitAllowedForExcelLite(lite, fromPlatform)
  ) {
    return fromPlatform
  }

  if (excelRowIndicatesAceite(lite)) {
    const tfHay = `${lite.truckflow_observed_sequence_combined ?? ''}|${lite.truckflow_device_sequence_combined ?? ''}`
    const fromTf = inferAceiteExecutiveCircuitFromTruckflowEvidence(lite.truckflow_circuit_codes, tfHay)
    if (fromTf && slCircuitAllowedForExcelLite(lite, fromTf)) return fromTf
  }

  const codes = lite.truckflow_circuit_codes
    .split('|')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
  for (const code of codes) {
    if (GENERIC_INFERRED_CIRCUIT_CODES.has(code)) continue
    if (!slCircuitAllowedForExcelLite(lite, code)) continue
    if ((EXECUTIVE_CIRCUIT_ORDER as readonly string[]).includes(code)) return code
    if (EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]) return code
  }

  const ricFallback = ricExecutiveFallbackFromExcelLite(lite)
  if (ricFallback) return ricFallback

  if (fromPlatform && slCircuitAllowedForExcelLite(lite, fromPlatform)) return fromPlatform

  const fromFamily = FAMILY_TO_EXECUTIVE[lite.resolved_circuit_family.toUpperCase()]
  if (fromFamily && slCircuitAllowedForExcelLite(lite, fromFamily)) return fromFamily

  return ''
}

/** Circuito ejecutivo para conciliación comité / huérfanos Excel (líquidos nunca R7). */
export function resolveExecutiveCircuitFromExcelLite(lite: ExcelFirstReconcileLite): string {
  return pickExecutiveCircuitFromExcelFirst(lite)
}

export type ExcelOperationExecutiveCircuitInput = {
  product_normalized: string
  platform_normalized: string
  plataforma_original: string
  plate_normalized: string
  planta_normalized: string
  movement_type: string
  mov: string
  source_date: string
  resolved_circuit_family: string
  match_quality: string
  route_quality: string
  evidence_count: number
  truckflow_observed_sequence_combined: string
  truckflow_circuit_codes: string
  truckflow_device_sequence_combined?: string
  observaciones?: string
  observacion_calidad?: string
  es_de_vuelta?: boolean
}

/** Mismo criterio que comité / gráficos ejecutivos (Excel + Truckflow). */
export function resolveExecutiveCircuitForExcelOperation(
  input: ExcelOperationExecutiveCircuitInput
): string {
  const aceite = inferAceiteExecutiveCircuitFromExcel(
    input.platform_normalized,
    input.plataforma_original,
    input.planta_normalized,
    input.observaciones,
    input.observacion_calidad
  )
  // SL3 sólo es válido con evidencia de cámara Renova (SLZTK400); sin ella se descarta
  // y se continúa con la resolución basada en `lite` (que también aplica el gate).
  if (aceite && aceite !== 'SL3') return aceite
  if (
    aceite === 'SL3' &&
    hasSl3RenovaCameraEvidence(
      input.truckflow_observed_sequence_combined,
      input.truckflow_device_sequence_combined
    )
  ) {
    return aceite
  }

  const lite: ExcelFirstReconcileLite = {
    ...input,
    resolved_executive_circuit_code: '',
    truckflow_device_sequence_combined: input.truckflow_device_sequence_combined ?? '',
    observaciones: String(input.observaciones ?? '').trim(),
    observacion_calidad: String(input.observacion_calidad ?? '').trim(),
    es_de_vuelta: input.es_de_vuelta ?? false,
  }
  return resolveExecutiveCircuitFromExcelLite(lite)
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
    if (
      lite.route_quality === 'ROUTE_OPERATIONAL_VARIATION' ||
      lite.route_quality === 'ROUTE_ANOMALOUS' ||
      lite.route_quality === 'ROUTE_INCOMPLETE'
    ) {
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

  // Match Excel con producto + plataforma = operación completa (fragmentado / ventana ancha / ruta anómala en cámara).
  if (lite.match_quality === 'EXTERNAL_MATCH_AMBIGUOUS') {
    return {
      committeeGroup: 'VARIACIONES_OPERATIVAS',
      pieSliceLabel: 'VARIACIONES OPERATIVAS',
      operationalVariationType: lite.match_quality,
    }
  }

  return {
    committeeGroup: 'COMPLETOS',
    pieSliceLabel: 'COMPLETOS',
    operationalVariationType: '',
  }
}

export function parseExcelFirstByJourneyUid(
  excelOps: ExcelOpsSource
): Map<string, ExcelFirstReconcileLite> {
  const map = new Map<string, ExcelFirstReconcileLite>()
  const rows = excelOpsRows(excelOps)
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
      mov: String(r.mov ?? r.movement_type_detail ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
      match_quality: matchQuality,
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: evidence,
      truckflow_observed_sequence_combined: String(r.truckflow_observed_sequence_combined ?? '').trim(),
      truckflow_device_sequence_combined: truckflowDeviceSequenceFromExcelRow(r),
      observaciones: String(r.observaciones ?? '').trim(),
      observacion_calidad: String(r.observacion_calidad ?? '').trim(),
      es_de_vuelta: parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original),
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
  excelOps: ExcelOpsSource
): Map<string, ExcelFirstReconcileLite[]> {
  const map = new Map<string, ExcelFirstReconcileLite[]>()
  const rows = excelOpsRows(excelOps)
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
      mov: String(r.mov ?? r.movement_type_detail ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
      match_quality: matchQuality,
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: evidence,
      truckflow_observed_sequence_combined: String(r.truckflow_observed_sequence_combined ?? '').trim(),
      truckflow_device_sequence_combined: truckflowDeviceSequenceFromExcelRow(r),
      observaciones: String(r.observaciones ?? '').trim(),
      observacion_calidad: String(r.observacion_calidad ?? '').trim(),
      es_de_vuelta: parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original),
    }
    const arr = map.get(plate) ?? []
    arr.push(lite)
    map.set(plate, arr)
  }
  return map
}

function parseMatchedJourneyUidsFromExcelRow(r: Record<string, unknown>): string[] {
  return String(r.matched_journey_uids ?? '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function truckflowDeviceSequenceFromExcelRow(r: Record<string, unknown>): string {
  return String(r.truckflow_device_sequence_combined ?? r.device_sequence_combined ?? '').trim()
}

function aceiteTruckflowHaystackFromEntry(entry: CircuitClassificationEntry, extraSeq = ''): string {
  return [entry.detectedSequence, entry.deviceSequence, extraSeq].filter(Boolean).join('|')
}

function entryLooksLikeRicSanLorenzoRouteLabel(entry: CircuitClassificationEntry): boolean {
  const r = entry.committeeReason.toUpperCase()
  return r.includes('RUTA_RIC_SAN_LORENZO') || r.includes('SECUENCIA_OPERATIVA_RECONSTRUIDA')
}

function applyExecutiveCircuitCodeToEntry(entry: CircuitClassificationEntry, code: string): CircuitClassificationEntry {
  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
  const label = cfg?.label || code
  return {
    ...entry,
    executiveCircuitCode: code,
    executiveCircuitLabel: label,
    executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
    matchedCircuitCode: code,
  }
}

function shouldDropAceiteMatrixFragmentForExcelPlate(
  entry: CircuitClassificationEntry,
  lite: ExcelFirstReconcileLite | undefined,
  byJourney: Map<string, ExcelFirstReconcileLite>,
  byPlate: Map<string, ExcelFirstReconcileLite[]>
): boolean {
  if (entry.journeyId.startsWith('excel:')) return false
  if (entry.executiveCircuitCode === 'R8') return false
  if (entryAceiteTruckflowExecutiveCode(entry) === 'R8') return false

  const aceiteLite =
    lite && excelRowIndicatesAceite(lite) ? lite : resolveExcelAceiteLiteForEntry(entry, byJourney, byPlate)
  if (!aceiteLite) return false

  const excelMatchedThisJourney =
    byJourney.has(entry.journeyId) && excelRowIndicatesAceite(byJourney.get(entry.journeyId)!)
  if (excelMatchedThisJourney) return false

  const hay = aceiteTruckflowHaystackFromEntry(entry).toUpperCase()
  const hasLiquidTruckflowEvidence =
    /SL_INGRESO|SL_BALANZA|SL_LIQUIDO|LIQUIDO>/.test(hay) || Boolean(entryAceiteTruckflowExecutiveCode(entry))

  if (entry.executiveCircuitCode === 'R7' || entryLooksLikeRicSanLorenzoRouteLabel(entry)) return true

  if (isAceiteExecutiveCircuitCode(entry.executiveCircuitCode)) {
    if (!excelLiteMatchesEntrySite(aceiteLite, entry)) return true
    if (!hasLiquidTruckflowEvidence) return true
    return false
  }

  return /SL_INGRESO|SL_BALANZA|SL_LIQUIDO/.test(hay)
}

/**
 * Journeys matriz R7 (ruta Ric→SL sólidos) que en realidad son aceite/líquido o duplican Excel aceite.
 */
function reclassifyMislabeledR7AceiteMatrixEntries(
  entries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): CircuitClassificationEntry[] {
  if (!excelOpsHasData(excelOps)) return entries
  const byJourney = parseExcelFirstByJourneyUid(excelOps)
  const byPlate = parseExcelFirstByPlate(excelOps)
  const out: CircuitClassificationEntry[] = []

  for (const entry of entries) {
    if (entry.journeyId.startsWith('excel:')) {
      out.push(entry)
      continue
    }

    const lite = resolveExcelFirstLiteForEntry(entry, byJourney, byPlate)
    if (shouldDropAceiteMatrixFragmentForExcelPlate(entry, lite, byJourney, byPlate)) {
      continue
    }

    if (entry.executiveCircuitCode !== 'R7') {
      out.push(entry)
      continue
    }
    const aceiteLite = resolveExcelAceiteLiteForEntry(entry, byJourney, byPlate)
    if (!aceiteLite || !excelRowIndicatesAceite(aceiteLite)) {
      out.push(entry)
      continue
    }
    const code = pickExecutiveCircuitFromExcelFirst(aceiteLite)

    if (code && code !== 'R7' && isAceiteExecutiveCircuitCode(code)) {
      let next = applyExecutiveCircuitCodeToEntry(entry, code)
      next = reconcileEntryFromExcelFirst(next, aceiteLite)
      out.push(next)
      continue
    }

    if (entryLooksLikeRicSanLorenzoRouteLabel(entry)) {
      continue
    }

    out.push(entry)
  }
  return out
}

function excelFirstLiteFromOperationRow(r: Record<string, unknown>): ExcelFirstReconcileLite | null {
  const evidence = Number(r.evidence_count ?? 0)
  const matchQuality = String(r.match_quality ?? '').trim()
  if (evidence <= 0 || !EXCEL_FIRST_RECONCILABLE_MATCH.has(matchQuality)) return null
  return {
    product_normalized: String(r.resolved_product ?? r.product_normalized ?? '').trim(),
    platform_normalized: String(r.resolved_platform ?? r.platform_normalized ?? '').trim(),
    plataforma_original: String(r.plataforma_original ?? r.platform_normalized ?? '').trim(),
    plate_normalized: String(r.plate_normalized ?? '').trim(),
    planta_normalized: String(r.planta_normalized ?? '').trim(),
    movement_type: String(r.movement_type ?? '').trim(),
    mov: String(r.mov ?? r.movement_type_detail ?? '').trim(),
    source_date: String(r.source_date ?? '').trim(),
    truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
    resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
    resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
    match_quality: matchQuality,
    route_quality: String(r.route_quality ?? '').trim(),
    evidence_count: evidence,
    truckflow_observed_sequence_combined: String(r.truckflow_observed_sequence_combined ?? '').trim(),
    truckflow_device_sequence_combined: truckflowDeviceSequenceFromExcelRow(r),
    observaciones: String(r.observaciones ?? '').trim(),
    observacion_calidad: String(r.observacion_calidad ?? '').trim(),
    es_de_vuelta: parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original),
  }
}

function buildExecutiveEntryFromExcelOperationRow(
  r: Record<string, unknown>,
  cameraSeed?: CircuitClassificationEntry,
  rowIndex?: number
): CircuitClassificationEntry | null {
  const lite = excelFirstLiteFromOperationRow(r)
  if (!lite) return null
  const platform = String(lite.platform_normalized || lite.plataforma_original || '').trim()
  const code = pickExecutiveCircuitFromExcelFirst(lite)
  if (!code) return null
  if (!platform && code !== 'SL3') return null

  const opId = resolveCommitteeExcelOperationId(r, rowIndex)
  if (!opId) return null

  const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
  const label = cfg?.label ?? code
  const plate = String(r.plate_normalized ?? '').trim()
  const seed: CircuitClassificationEntry =
    cameraSeed ??
    ({
      journeyId: '',
      plate,
      normalizedPlate: normalizePlate(plate),
      site: lite.planta_normalized,
      matchedCircuitCode: '',
      executiveCircuitCode: '',
      executiveCircuitLabel: '',
      executiveCircuitDisplay: '',
      matrixFinalStatus: '',
      executiveStatus: '',
      validDetail: '',
      committeeGroup: '',
      committeeReason: '',
      operationalVariationType: '',
      detectedSequence: '',
      deviceSequence: '',
      firstEventAt: '',
      lastEventAt: '',
      executiveReason: '',
      pieSliceLabel: '',
      usefulEventsCount: 0,
      eventCount: 0,
      executiveBucket: '',
      matrixReason: '',
      color: CIRCUIT_PIE_COLORS[0]!,
    } satisfies CircuitClassificationEntry)

  const group = committeeGroupFromExcelFirst(seed, lite)
  const sourceDate = String(r.source_date ?? '').trim()
  const dayIso =
    sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ? `${sourceDate}T12:00:00-03:00` : ''
  const detectedSequence = String(r.truckflow_observed_sequence_combined ?? '').trim()
  const firstAt = ensureArgentinaOffsetIso(
    String(r.truckflow_first_seen_at || r.external_ingreso_at || dayIso || '').trim()
  )
  const lastAt = ensureArgentinaOffsetIso(
    String(r.truckflow_last_seen_at || r.external_salida_at || firstAt || '').trim()
  )
  const preservedCameraVariation = Boolean(resolvePreservedCameraVariation(seed))

  return {
    journeyId: `excel:${opId}`,
    plate,
    normalizedPlate: normalizePlate(plate),
    site: lite.planta_normalized,
    matchedCircuitCode: code,
    executiveCircuitCode: code,
    executiveCircuitLabel: label,
    executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
    matrixFinalStatus: group.committeeGroup === 'COMPLETOS' ? 'COMPLETO' : 'DEDUCIDO',
    executiveStatus: group.committeeGroup === 'COMPLETOS' ? 'VALIDO' : seed.executiveStatus || 'PROBABLE',
    validDetail: preservedCameraVariation ? seed.validDetail || 'VARIACION_OPERATIVA' : 'DEDUCIDO',
    committeeGroup: group.committeeGroup,
    committeeReason:
      preservedCameraVariation ?
        seed.committeeReason || `CAMARA_VARIACION:${seed.operationalVariationType}`
      : `EXCEL_PLATAFORMA:${lite.product_normalized}@${lite.platform_normalized}:${lite.match_quality}`,
    operationalVariationType: group.operationalVariationType,
    detectedSequence,
    deviceSequence: '',
    firstEventAt: firstAt || dayIso,
    lastEventAt: lastAt || firstAt || dayIso,
    executiveReason:
      preservedCameraVariation ? seed.executiveReason || seed.committeeReason : 'EXCEL_PLATAFORMA_RECONCILED',
    pieSliceLabel: group.pieSliceLabel,
    usefulEventsCount: Math.max(Number(r.matched_journey_count ?? 0), lite.evidence_count),
    eventCount: eventCountFromDetectedSequence(detectedSequence),
    executiveBucket: group.committeeGroup === 'COMPLETOS' ? 'COMPLETO' : seed.executiveBucket || 'INCOMPLETO',
    matrixReason: String(r.route_quality ?? lite.match_quality),
    color: CIRCUIT_PIE_COLORS[0]!,
  }
}

/**
 * Gráficos ejecutivos alineados a Movimientos por Contrato: 1 fila por operación Excel con evidencia,
 * sin duplicar journeys Truckflow que ya quedaron absorbidos por esa operación.
 */
export function reindexExecutiveChartsForExcelFirstOperations(
  matrixEntries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): {
  entries: CircuitClassificationEntry[]
  excelOperationCount: number
  supersededMatrixJourneyCount: number
} {
  if (!excelOpsHasData(excelOps)) {
    return { entries: matrixEntries, excelOperationCount: 0, supersededMatrixJourneyCount: 0 }
  }

  const rows = excelOpsRows(excelOps)
  const matrixByUid = new Map(matrixEntries.map((e) => [e.journeyId, e]))
  const supersededUids = new Set<string>()
  const excelEntries: CircuitClassificationEntry[] = []
  const seenOp = new Set<string>()

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex]!
    const lite = excelFirstLiteFromOperationRow(r)
    if (!lite) continue
    const opId = resolveCommitteeExcelOperationId(r, rowIndex)
    if (!opId || seenOp.has(opId)) continue
    seenOp.add(opId)

    const uids = parseMatchedJourneyUidsFromExcelRow(r)
    if (
      uids.some((uid) => {
        const e = matrixByUid.get(uid)
        return e != null && isExcelReconciliationExcludedEntry(e)
      })
    ) {
      continue
    }

    for (const uid of uids) {
      supersededUids.add(uid)
    }

    const matched = uids
      .map((uid) => matrixByUid.get(uid))
      .filter((e): e is CircuitClassificationEntry => e != null)
    const cameraSeed = matched[0]
    const built = buildExecutiveEntryFromExcelOperationRow(r, cameraSeed, rowIndex)
    if (built) {
      // Propagar la anomalía de comportamiento (reglas R1–R5) del journey a la
      // operación Excel. El universo op-centric reemplaza los journeys por
      // operaciones y descartaba su `anomaly_kind`, así que las anomalías
      // desaparecían del panel cuando el camión tenía movimiento en el Excel
      // (la gran mayoría). La exclusión «no pellet» de R1/R2 se sigue aplicando
      // en el listado según el circuito Excel de la operación.
      const behavioral = matched.find((e) => e.anomalyKind === 'BEHAVIORAL')
      if (behavioral) {
        built.anomalyKind = 'BEHAVIORAL'
        built.anomalyKindReason = behavioral.anomalyKindReason
        built.usefulEventsCount = Math.max(built.usefulEventsCount, behavioral.usefulEventsCount)
      }
      excelEntries.push(built)
    }
  }

  const keptMatrix = matrixEntries.filter((e) => !supersededUids.has(e.journeyId) && !e.journeyId.startsWith('excel:'))

  return {
    entries: [...keptMatrix, ...excelEntries],
    excelOperationCount: excelEntries.length,
    supersededMatrixJourneyCount: supersededUids.size,
  }
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
  const dayKey = operationalDayKeyFromIso(entry.firstEventAt)
  const sameDay = dayKey ? cands.filter((c) => c.source_date === dayKey) : []
  const pool = sameDay.length ? sameDay : cands
  const plantMatched = pool.filter((c) => excelLiteMatchesEntrySite(c, entry))
  return pickBestExcelFirstLite(plantMatched.length ? plantMatched : pool)
}

function reconcileEntryFromExcelFirst(
  entry: CircuitClassificationEntry,
  lite: ExcelFirstReconcileLite
): CircuitClassificationEntry {
  const code = pickExecutiveCircuitFromExcelFirst(lite)
  const platform = String(lite.platform_normalized || lite.plataforma_original || '').trim()
  if (!code) return entry
  // Pellet reconcilia por producto aunque no haya plataforma (celda) en el Excel.
  if (!platform && code !== 'SL3' && !isPelletExcelProduct(lite.product_normalized)) return entry
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

/** Segunda pasada: líquidos con Excel no pueden quedar en R7/R5 (ruta sólidos). */
function enforceLiquidExcelExecutiveCircuits(
  entries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): CircuitClassificationEntry[] {
  const byJourney = parseExcelFirstByJourneyUid(excelOps)
  const byPlate = parseExcelFirstByPlate(excelOps)
  return entries.map((entry) => {
    const aceiteLite = resolveExcelAceiteLiteForEntry(entry, byJourney, byPlate)
    if (!aceiteLite) return entry
    if (shouldSkipCrossPlantAceiteExcelReconcile(entry, aceiteLite, byJourney)) return entry
    const code = pickExecutiveCircuitFromExcelFirst(aceiteLite)
    if (!code || code === 'R7' || SOLID_ROUTE_EXECUTIVE_FOR_ACEITE_VIEW.has(code)) return entry
    if (code === entry.executiveCircuitCode && entry.committeeReason.includes('EXCEL_PLATAFORMA')) return entry
    return reconcileEntryFromExcelFirst(entry, aceiteLite)
  })
}

/** Restaura R8 en matriz cuando Truckflow muestra descarga líquida Ricardone (no terminal SL). */
function promoteAceiteRicardoneTruckflowExecutiveCircuits(
  entries: CircuitClassificationEntry[]
): CircuitClassificationEntry[] {
  return entries.map((entry) => {
    if (entry.journeyId.startsWith('excel:')) return entry
    // Pellet ya reconciliado (R13/14/15/R30/31/32) NO vuelve a R8 aunque su recorrido
    // pase por la calada de líquidos: el circuito real es el del Excel, no el líquido.
    if (ALL_PELLET_CIRCUIT_CODES.has(entry.executiveCircuitCode)) return entry
    const code = entryAceiteTruckflowExecutiveCode(entry)
    if (code !== 'R8' || entry.executiveCircuitCode === 'R8') return entry
    return applyExecutiveCircuitCodeToEntry(entry, 'R8')
  })
}

/**
 * Aplica conciliación Excel-first: circuito y categoría comité según operaciones con evidencia Truckflow.
 */
export function applyExcelFirstReconciliation(
  entries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): { entries: CircuitClassificationEntry[]; reconciledCount: number; promotedCount: number } {
  const byJourney = parseExcelFirstByJourneyUid(excelOps)
  const byPlate = parseExcelFirstByPlate(excelOps)
  if (!byJourney.size && !byPlate.size) return { entries, reconciledCount: 0, promotedCount: 0 }

  let reconciledCount = 0
  let promotedCount = 0
  const out = entries.map((entry) => {
    if (isExcelReconciliationExcludedEntry(entry)) return entry
    const lite = resolveExcelFirstLiteForEntry(entry, byJourney, byPlate)
    if (!lite) return entry
    if (byJourney.has(entry.journeyId)) {
      if (shouldSkipCrossPlantAceiteExcelReconcile(entry, lite, byJourney)) return entry
    } else if (excelRowIndicatesAceite(lite) && !excelLiteMatchesEntrySite(lite, entry)) {
      return entry
    } else if (shouldSkipCrossPlantAceiteExcelReconcile(entry, lite, byJourney)) {
      return entry
    }
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

/**
 * Operaciones Excel en plataformas aceite sin journey Truckflow emparejado:
 * entran al resumen ejecutivo como ancla Excel (no se pierden del conteo).
 */
export function appendPermittedAceiteExcelOrphansToEntries(
  entries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): { entries: CircuitClassificationEntry[]; appendedCount: number } {
  if (!excelOpsHasData(excelOps)) return { entries, appendedCount: 0 }
  const existingIds = new Set(entries.map((e) => e.journeyId))
  const rows = excelOpsRows(excelOps)
  const out = [...entries]
  let appendedCount = 0

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex]!
    const evidence = Number(r.evidence_count ?? 0)
    if (evidence > 0) continue

    const platform = String(r.resolved_platform ?? r.platform_normalized ?? '').trim()
    const original = String(r.plataforma_original ?? r.platform_normalized ?? '').trim()
    if (
      !isExcelLiquidMovementForOrphanCommittee({
        platform_normalized: platform,
        plataforma_original: original,
        planta_normalized: String(r.planta_normalized ?? '').trim(),
        planta_original: String(r.planta_original ?? '').trim(),
        resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
        resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
        resolved_product: String(r.resolved_product ?? r.product_normalized ?? '').trim(),
        product_normalized: String(r.product_normalized ?? '').trim(),
        observaciones: String(r.observaciones ?? '').trim(),
        observacion_calidad: String(r.observacion_calidad ?? '').trim(),
      })
    ) {
      continue
    }

    const matchedUids = String(r.matched_journey_uids ?? '')
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (matchedUids.length > 0) {
      const representedInMatrix = matchedUids.some((uid) => existingIds.has(uid))
      if (representedInMatrix) continue
    }

    const opId = resolveCommitteeExcelOperationId(r, rowIndex)
    if (!opId) continue
    const journeyId = `excel:${opId}`
    if (existingIds.has(journeyId)) continue
    existingIds.add(journeyId)

    const plate = String(r.plate_normalized ?? '').trim()
    const product = String(r.resolved_product ?? r.product_normalized ?? '').trim()
    const lite: ExcelFirstReconcileLite = {
      product_normalized: product,
      platform_normalized: platform,
      plataforma_original: original,
      plate_normalized: plate,
      planta_normalized: String(r.planta_normalized ?? '').trim(),
      movement_type: String(r.movement_type ?? '').trim(),
      mov: String(r.mov ?? r.movement_type_detail ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
      match_quality: String(r.match_quality ?? '').trim(),
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: Number(r.evidence_count ?? 0),
      truckflow_observed_sequence_combined: String(r.truckflow_observed_sequence_combined ?? '').trim(),
      truckflow_device_sequence_combined: truckflowDeviceSequenceFromExcelRow(r),
      observaciones: String(r.observaciones ?? '').trim(),
      observacion_calidad: String(r.observacion_calidad ?? '').trim(),
      es_de_vuelta: parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original),
    }
    const code = resolveExecutiveCircuitFromExcelLite(lite)
    if (!code) continue
    const cfg = EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]
    const label = cfg?.label ?? code
    const sourceDate = String(r.source_date ?? '').trim()
    const dayIso = sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ? `${sourceDate}T12:00:00-03:00` : ''

    out.push({
      journeyId,
      plate,
      normalizedPlate: normalizePlate(plate),
      site: String(r.planta_normalized ?? '').trim(),
      matchedCircuitCode: code,
      executiveCircuitCode: code,
      executiveCircuitLabel: label,
      executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
      matrixFinalStatus: 'COMPLETO',
      executiveStatus: 'VALIDO',
      validDetail: 'EXCEL_SIN_TRUCKFLOW',
      committeeGroup: 'COMPLETOS',
      committeeReason: `EXCEL_PLATAFORMA:${product || 'ACEITE'}@${platform}:EXCEL_SIN_EVIDENCIA_TRUCKFLOW`,
      operationalVariationType: '',
      detectedSequence: '',
      deviceSequence: '',
      firstEventAt: dayIso,
      lastEventAt: dayIso,
      executiveReason: 'EXCEL_SIN_EVIDENCIA_TRUCKFLOW',
      pieSliceLabel: 'COMPLETOS',
      usefulEventsCount: 0,
      eventCount: 0,
      executiveBucket: '',
      matrixReason: String(r.no_truckflow_reason ?? 'NO_TRUCKFLOW_EVIDENCE'),
      color: CIRCUIT_PIE_COLORS[0]!,
    })
    appendedCount++
  }

  return { entries: out, appendedCount }
}

/** Flag Excel «De la vuelta» (booleano, "SI"/"true"/"1"…) → booleano. Discrimina pellet
 * de la vuelta (va a SLZ, R30/31/32) vs despacho (no va a SLZ, R13/14/15). */
export function parseExcelDeVueltaFlag(flag: unknown): boolean {
  if (typeof flag === 'boolean') return flag
  const s = String(flag ?? '').trim()
  if (!s) return false
  return normalizeDeVuelta(s).es_de_vuelta || ['true', '1', 'yes'].includes(s.toLowerCase())
}

/**
 * Pellet del Excel **con evidencia Truckflow** cuyos journeys no entraron a la matriz.
 *
 * Las tolvas 09–11 no tienen cámara, así que el recorrido de pellet se clasifica por
 * cámaras sueltas (preingreso, balanza…) que quedan fuera del universo de la matriz de
 * circuitos. Esas operaciones tienen `matched_journey_uids` (el camión fue visto) pero
 * ninguna entry las representa → el producto Pellet daba 0 en la muestra. Se las inyecta
 * como ancla Excel para que cuenten en el chip Pellet y en la torta.
 *
 * Reglas (pedido operativo):
 * - **Solo con evidencia** (`evidence_count > 0`); el pellet sin cámara queda afuera.
 * - **Destino** decide la familia: de la vuelta (va a SLZ, `es_de_vuelta`) → R30/R31/R32;
 *   despacho (no va a SLZ) → R13/R14/R15. La celda 09/10/11 elige el subcódigo.
 * [[glicerina-r8-liquido]]
 */
export function appendPelletExcelWithEvidenceToEntries(
  entries: CircuitClassificationEntry[],
  excelOps: ExcelOpsSource
): { entries: CircuitClassificationEntry[]; appendedCount: number } {
  if (!excelOpsHasData(excelOps)) return { entries, appendedCount: 0 }
  const existingIds = new Set(entries.map((e) => e.journeyId))
  const rows = excelOpsRows(excelOps)
  const out = [...entries]
  let appendedCount = 0

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const r = rows[rowIndex]!
    const product = String(r.resolved_product ?? r.product_normalized ?? '').trim()
    if (!isPelletExcelProduct(product)) continue
    // Solo con evidencia Truckflow: el pellet sin cámara no entra al bucket.
    if (Number(r.evidence_count ?? 0) <= 0) continue

    // Si alguno de sus journeys ya está en la matriz, no duplicar (ya lo representa).
    const matchedUids = String(r.matched_journey_uids ?? '')
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (matchedUids.some((uid) => existingIds.has(uid))) continue

    const opId = resolveCommitteeExcelOperationId(r, rowIndex)
    if (!opId) continue
    const journeyId = `excel:${opId}`
    if (existingIds.has(journeyId)) continue
    existingIds.add(journeyId)

    const plate = String(r.plate_normalized ?? '').trim()
    const platform = String(r.resolved_platform ?? r.platform_normalized ?? '').trim()
    // Destino define la familia: **de la vuelta** (la carga va a San Lorenzo y descarga
    // allá) → R30/R31/R32; **despacho** (carga y NO va a SLZ) → R13/R14/R15. La celda
    // 09/10/11 elige el subcódigo dentro de la familia. [[glicerina-r8-liquido]]
    const esDeVuelta = parseExcelDeVueltaFlag(r.es_de_vuelta)
    const pellet = resolvePelletCircuit({ esDeVuelta, platformHint: platform })
    const code = pellet.assigned
    const label = CIRCUIT_CATALOG[code]?.label ?? EXECUTIVE_CIRCUIT_MATRIX[code as keyof typeof EXECUTIVE_CIRCUIT_MATRIX]?.label ?? code
    const sourceDate = String(r.source_date ?? '').trim()
    const dayIso = sourceDate && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate) ? `${sourceDate}T12:00:00-03:00` : ''

    out.push({
      journeyId,
      plate,
      normalizedPlate: normalizePlate(plate),
      site: String(r.planta_normalized ?? '').trim(),
      matchedCircuitCode: code,
      executiveCircuitCode: code,
      executiveCircuitLabel: label,
      executiveCircuitDisplay: formatExecutiveCircuitLabel(code, label),
      matrixFinalStatus: 'COMPLETO',
      executiveStatus: 'VALIDO',
      validDetail: 'EXCEL_PELLET_CON_TRUCKFLOW',
      committeeGroup: 'COMPLETOS',
      // Prefijo EXCEL_PELLET_<flow> para que el producto resuelva a pellet
      // (parseExcelProductFromCommitteeReason) y quede trazado el flujo (vuelta/despacho).
      committeeReason: `EXCEL_PELLET_${pellet.flow}:${product}@${platform || 'CELDA_SIN_IDENTIFICAR'}`,
      operationalVariationType: '',
      detectedSequence: '',
      deviceSequence: '',
      firstEventAt: dayIso,
      lastEventAt: dayIso,
      executiveReason: 'EXCEL_PELLET_CON_TRUCKFLOW',
      pieSliceLabel: 'COMPLETOS',
      usefulEventsCount: Number(r.evidence_count ?? 0),
      eventCount: 0,
      executiveBucket: '',
      matrixReason: 'EXCEL_PELLET_CON_TRUCKFLOW',
      color: CIRCUIT_PIE_COLORS[0]!,
    })
    appendedCount++
  }

  return { entries: out, appendedCount }
}

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
  // Clonamos las entries: esta función asigna `e.color` más abajo, y al filtrar por
  // producto llegan como subconjunto del índice base (read-only). Mutarlas tiraba
  // "Cannot assign to read only property 'color'" → pantalla en blanco al elegir
  // soja/girasol/aceite. Trabajar sobre copias deja el índice base intacto.
  const workEntries = entries.map((e) => ({ ...e }))
  const { byJourneyId, byPlate, byPieSlice, sliceCounts } = rebuildIndexMaps(workEntries)

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
  for (const e of workEntries) {
    e.color = colorBySlice.get(e.pieSliceLabel) ?? CIRCUIT_PIE_COLORS[0]!
  }

  const pieSlices: CircuitPieSlice[] = sortedSliceNames.map((name) => ({
    name,
    value: sliceCounts.get(name) ?? 0,
    color: colorBySlice.get(name) ?? CIRCUIT_PIE_COLORS[0]!,
  }))

  return {
    entries: workEntries,
    byJourneyId,
    byPlate,
    byPieSlice,
    pieSlices,
    circuitBarSlices: buildExecutiveCircuitBarSlices(workEntries),
    total: workEntries.length,
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

/**
 * Exclusiones compartidas con el listado de anomalías, aplicables a los paneles
 * de "sospechosos". A diferencia de `isAnomalyListPoolEntry`, NO exige que el
 * Excel esté cargado ni descarta por "ausencia del Excel": solo excluye por
 * pertenencia positiva a transile, registry (Supabase) o al plan del Excel. Así
 * un transile/servicio nunca aparece como sospechoso, pero un camión legítimo
 * fuera del Excel sigue siendo visible aunque no haya Excel cargado.
 */
export function isExcludedFromSuspiciousList(
  entry: CircuitClassificationEntry,
  ctx: AnomalyListContext
): boolean {
  const plate = normalizePlate(entry.normalizedPlate || entry.plate)
  if (plate && ctx.excelPlates?.has(plate)) return true
  if (plate && ctx.excludedRegistryPlates?.has(plate)) return true
  if (plate && ctx.transileExcludedPlates?.has(plate)) return true
  if (plate && ctx.deVueltaExcludedPlates?.has(plate)) return true
  if (isTransileExcludedFromAnomalyList(entry)) return true
  return false
}

/**
 * Patentes a excluir del panel SL→Ric (solo pellet / R30–R32), según plan reglas de oro.
 * No excluye el resto de transile externo (soja/girasol sí pueden ser anomalía).
 */
export function collectPelletExcludedPlates(
  entries: CircuitClassificationEntry[],
  ctx: AnomalyListContext = { excelPlates: null }
): Set<string> {
  const set = new Set<string>()
  for (const e of entries) {
    if (
      !isPelletCircuitCode(e.executiveCircuitCode) &&
      !isPelletCircuitCode(e.matchedCircuitCode) &&
      !PELLET_TRANSILE_CIRCUIT_CODES.has(String(e.executiveCircuitCode ?? '').trim().toUpperCase())
    ) {
      continue
    }
    const plate = normalizePlate(e.normalizedPlate || e.plate)
    if (plate) set.add(plate)
  }
  // Registry sigue excluida en sospechosos vía collectSuspiciousExcludedPlates legacy;
  // aquí solo pellet.
  void ctx
  return set
}

/**
 * Conjunto de patentes normalizadas a excluir de paneles de sospechosos basados
 * en eventos crudos (p. ej. SL → Ricardone), donde no se dispone del entry para
 * evaluar transile. Combina Excel + registry (Supabase) + patentes transile.
 */
export function collectSuspiciousExcludedPlates(
  entries: CircuitClassificationEntry[],
  ctx: AnomalyListContext = { excelPlates: null }
): Set<string> {
  const set = new Set<string>()
  for (const p of ctx.excelPlates ?? []) set.add(p)
  for (const p of ctx.excludedRegistryPlates ?? []) set.add(p)
  for (const p of ctx.transileExcludedPlates ?? []) set.add(p)
  for (const e of entries) {
    if (!isTransileExcludedFromAnomalyList(e)) continue
    const plate = normalizePlate(e.normalizedPlate || e.plate)
    if (plate) set.add(plate)
  }
  return set
}

/** Descarga en C16 o Volcable sin ningún paso por balanza. */
export function buildSuspiciousDischargeWithoutBalanza(
  entries: CircuitClassificationEntry[],
  ctx: AnomalyListContext = { excelPlates: null }
): SuspiciousDischargeWithoutBalanzaRow[] {
  const rows: SuspiciousDischargeWithoutBalanzaRow[] = []

  for (const entry of entries) {
    if (isExcludedFromSuspiciousList(entry, ctx)) continue
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

/** Misma ventana que reglas de oro G1 (30 min por defecto). */
export function buildSuspiciousSlExitRicReturn(
  events: RealJourneyEventDto[],
  opts?: {
    windowMs?: number
    allowedJourneyIds?: Set<string> | null
    /** Patentes (normalizadas) a excluir: pellet / registry. */
    excludedPlates?: Set<string> | null
  }
): SuspiciousSlExitRicReturnRow[] {
  if (!events.length) return []
  const windowMs = opts?.windowMs ?? GOLDEN_SL_RIC_MAX_MS
  const allowed = opts?.allowedJourneyIds
  const excludedPlates = opts?.excludedPlates
  const hints = detectSanLorenzoEgressToRicardoneReturnFromEvents(events, windowMs)
  const rows: SuspiciousSlExitRicReturnRow[] = []
  for (const h of hints) {
    if (excludedPlates?.size && excludedPlates.has(normalizePlate(h.plate))) continue
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

/** True si el journey es transile interno o externo (no debe listarse como anomalía). */
export function isTransileExcludedFromAnomalyList(entry: CircuitClassificationEntry): boolean {
  const code = String(entry.executiveCircuitCode ?? '').trim().toUpperCase()
  if (TRANSILE_EXTERNO_ANOMALY_EXCLUDED_CODES.has(code)) return true
  if (TRANSILE_INTERNO_ANOMALY_EXCLUDED_CODES.has(code)) return true
  const matched = String(entry.matchedCircuitCode ?? '').trim().toUpperCase()
  if (matched.includes('TRANSILE')) return true
  const reason = `${entry.committeeReason} ${entry.executiveReason}`.toUpperCase()
  if (reason.includes('TRANSILE_EXTERNO') || reason.includes('TRANSILE_INTERNO')) return true
  return false
}

/**
 * Exclusiones duras del listado de anomalías.
 *
 * REEMPLAZO TOTAL (2026-08-05): las anomalías se definen SOLO por las reglas
 * R1–R5 (`anomalyKind === 'BEHAVIORAL'`). Ya NO se filtra por transile
 * (interno/externo) ni por «de la vuelta»: eso vaciaba el panel y, además,
 * R4/R5 tienen que poder disparar sobre recorridos transile (celda 16, carga→
 * descarga). Quedan solo dos exclusiones:
 *  - flota de servicio (registry `excludeFromAnalytics`): no es camión a auditar;
 *  - pellet en R1/R2, que exigen «no pellet». El circuito pellet (tolvas 09–11,
 *    sin cámara) solo se conoce tras cruzar con Excel, así que se filtra acá.
 */
function isHardExcludedFromAnomalyList(
  entry: CircuitClassificationEntry,
  ctx: AnomalyListContext,
  plate: string
): boolean {
  if (plate && ctx.excludedRegistryPlates?.has(plate)) return true
  if (NO_PELLET_ANOMALY_REASONS.has(entry.anomalyKindReason as never)) {
    return (
      isPelletCircuitCode(entry.executiveCircuitCode) || isPelletCircuitCode(entry.matchedCircuitCode)
    )
  }
  return false
}

/**
 * Candidato al listado de anomalías.
 * - Corridas nuevas (traen `anomalyKind`): solo comportamiento real (`BEHAVIORAL`),
 *   fuente única `classifyAnomaly`. Transile/registry siempre excluidos.
 * - Corridas viejas / tests (sin `anomalyKind`): heurística legacy "Truckflow
 *   ≥ minEvents, patente ausente del Excel". Sin Excel cargado → nunca.
 */
/**
 * ¿Hay evidencia suficiente para que este journey entre al análisis del comité?
 *
 * Regla: hacen falta más de `ANOMALY_MIN_FRONT_EVENTS` cruces de cámara (mismo
 * umbral que `classifyAnomaly`) **o** un movimiento del Excel que documente el
 * viaje. Lo segundo importa: una operación Excel-first (`excel:…`, o con match
 * `EXCEL_*` / `EXTERNAL_MATCH_*`) tiene el viaje documentado en Movimientos por
 * Contrato aunque las cámaras lo hayan visto poco — ahí el dato existe, y sacarla
 * del universo rompería la conciliación Excel-first.
 */
export function hasMinimumEvidenceForCommittee(entry: CircuitClassificationEntry): boolean {
  if (hasCameraEvidenceForBehavior(entry)) return true
  if (String(entry.journeyId ?? '').startsWith(EXCEL_ANCHOR_JOURNEY_PREFIX)) return true
  return entryHasExcelMovementEvidence(entry)
}

/**
 * ¿Alcanzan las cámaras para afirmar *comportamiento*?
 *
 * Más estricto que `hasMinimumEvidenceForCommittee` y a propósito: todas las
 * reglas de comportamiento (ruta/arranque inválido, retroceso, G1–G5) se leen de
 * la línea de tiempo de cámaras. Un movimiento del Excel prueba que el viaje
 * existió — sirve para contarlo como operación completa — pero no puede sostener
 * un «se salteó un hito» ni un «volvió demasiado rápido».
 */
export function hasCameraEvidenceForBehavior(entry: CircuitClassificationEntry): boolean {
  return entry.usefulEventsCount > ANOMALY_MIN_FRONT_EVENTS
}

export function isListedAnomalyCandidate(
  entry: CircuitClassificationEntry,
  ctx: AnomalyListContext
): boolean {
  const plate = normalizePlate(entry.normalizedPlate || entry.plate)
  if (!plate) return false
  if (isHardExcludedFromAnomalyList(entry, ctx, plate)) return false
  // Evidencia de cámara, también para corridas viejas cuyo `anomaly_kind` se
  // calculó antes del guardia de `applyGoldenAnomalyOverride`: con ≤2 cruces no se
  // lista, aunque venga marcado BEHAVIORAL y aunque tenga movimiento en el Excel.
  if (!hasCameraEvidenceForBehavior(entry)) return false
  if (entry.anomalyKind !== undefined) return entry.anomalyKind === 'BEHAVIORAL'
  // Camino legacy.
  if (ctx.excelPlates == null) return false
  const minEvents = ctx.minEvents ?? ANOMALY_LIST_MIN_EVENTS
  if (entry.usefulEventsCount < minEvents) return false
  if (ctx.excelPlates.has(plate)) return false
  return true
}

/**
 * Pool de journeys "problemáticos" para separar comportamiento vs datos.
 * Nuevas corridas: cualquier `anomalyKind` distinto de NONE. Legacy: mismas
 * exclusiones Excel/transile/registry, con eventos posiblemente insuficientes.
 */
export function isAnomalyListPoolEntry(
  entry: CircuitClassificationEntry,
  ctx: AnomalyListContext
): boolean {
  const plate = normalizePlate(entry.normalizedPlate || entry.plate)
  if (!plate) return false
  if (isHardExcludedFromAnomalyList(entry, ctx, plate)) return false
  if (entry.anomalyKind !== undefined) return entry.anomalyKind !== 'NONE'
  // Camino legacy.
  if (ctx.excelPlates == null) return false
  if (ctx.excelPlates.has(plate)) return false
  return true
}

/** Patentes normalizadas desde CSV de movimientos / operaciones (columna plate_normalized o plate). */
export function collectNormalizedPlatesFromCsv(csv: string | undefined | null): Set<string> {
  const out = new Set<string>()
  if (!csv?.trim()) return out
  const { rows } = parseCsvToRecords(csv)
  for (const r of rows) {
    const plate = normalizePlate(r.plate_normalized ?? r.plate ?? r.patente ?? '')
    if (plate) out.add(plate)
  }
  return out
}

/**
 * Día operativo de un movimiento Excel para cruce patente+día (G5).
 * Regla de negocio: el Excel de Movimientos se arma por **horario de salida**.
 * Un camión que ingresa el día D y sale en la madrugada de D+1 figura en el Excel de D+1.
 *
 * Prioridad: `external_salida_at` → `source_date` (día del archivo) → `external_ingreso_at`.
 */
export function excelOperativeDayFromMovimientoRow(r: {
  source_date?: unknown
  external_salida_at?: unknown
  external_ingreso_at?: unknown
}): string {
  const salida = operationalDayKeyFromIso(String(r.external_salida_at ?? ''))
  if (salida) return salida
  const src = String(r.source_date ?? '').trim()
  const srcDay = src.match(/(\d{4}-\d{2}-\d{2})/)?.[1]
  if (srcDay) return srcDay
  return operationalDayKeyFromIso(String(r.external_ingreso_at ?? ''))
}

/**
 * Claves `PLATE|YYYY-MM-DD` desde Movimientos (día = salida / archivo Excel).
 * Si salida y `source_date` difieren, registra ambos para no perder el cruce.
 */
export function collectExcelPlateDaysFromCsv(csv: string | undefined | null): Set<string> {
  const out = new Set<string>()
  if (!csv?.trim()) return out
  const { rows } = parseCsvToRecords(csv)
  for (const r of rows) {
    const plate = normalizePlate(r.plate_normalized ?? r.plate ?? r.patente ?? '')
    if (!plate) continue
    for (const day of excelPlateDaysForMovimientoRow(r)) {
      out.add(excelPlateDayKey(plate, day))
    }
  }
  return out
}

function excelPlateDaysForMovimientoRow(r: {
  source_date?: unknown
  external_salida_at?: unknown
  external_ingreso_at?: unknown
}): string[] {
  const days = new Set<string>()
  const salida = operationalDayKeyFromIso(String(r.external_salida_at ?? ''))
  if (salida) days.add(salida)
  const src = String(r.source_date ?? '').trim().match(/(\d{4}-\d{2}-\d{2})/)?.[1]
  if (src) days.add(src)
  if (!days.size) {
    const ing = operationalDayKeyFromIso(String(r.external_ingreso_at ?? ''))
    if (ing) days.add(ing)
  }
  return [...days]
}

function collectExcelPlateDaysFromExcelOps(source: ExcelOpsSource): Set<string> {
  const out = new Set<string>()
  for (const r of excelOpsRows(source)) {
    const plate = normalizePlate(String(r.plate_normalized ?? r.plate ?? r.patente ?? ''))
    if (!plate) continue
    for (const day of excelPlateDaysForMovimientoRow(r)) {
      out.add(excelPlateDayKey(plate, day))
    }
  }
  return out
}

/**
 * Evidencia de que el journey ya está reconciliado con Movimientos Excel
 * (plataforma/match en committee_reason). Evita G5 falso positivo cuando el
 * cruce patente+día falla por overnight (ingreso D / Excel por salida D+1)
 * o por first/last_event_at vacíos.
 */
export function entryHasExcelMovementEvidence(entry: CircuitClassificationEntry): boolean {
  const reason = String(entry.committeeReason ?? '').trim().toUpperCase()
  if (!reason) return false
  if (reason.startsWith('EXCEL_')) return true
  if (reason.includes('EXTERNAL_MATCH_')) return true
  if (reason.includes('EXCEL_MOVIMIENTOS') || reason.includes('EXCEL_PLATAFORMA')) return true
  return false
}

/** `YYYY-MM-DD` + 1 día. Devuelve '' si la clave no es una fecha válida. */
export function nextDayKey(dayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey ?? '').trim())
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Días del journey a cruzar con Excel: inicio, fin (≈ salida) y **el día siguiente
 * al último evento**.
 *
 * Ese tercer día no es paranoia: el Excel de Movimientos se emite con la descarga,
 * así que un camión que ingresa el día D a las 23:00 descarga el D+1 y su
 * movimiento figura en el Excel del D+1, no del D.
 */
/** Días propios del recorrido (inicio y fin), sin el margen del D+1. */
export function entryOwnDays(entry: CircuitClassificationEntry): string[] {
  const days = new Set<string>()
  const end = operationalDayKeyFromIso(entry.lastEventAt)
  const start = operationalDayKeyFromIso(entry.firstEventAt)
  if (end) days.add(end)
  if (start) days.add(start)
  return [...days]
}

export function entryExcelCandidateDays(entry: CircuitClassificationEntry): string[] {
  const days = new Set<string>()
  const end = operationalDayKeyFromIso(entry.lastEventAt)
  const start = operationalDayKeyFromIso(entry.firstEventAt)
  if (end) days.add(end)
  if (start) days.add(start)
  const next = nextDayKey(end || start)
  if (next) days.add(next)
  return [...days]
}

/**
 * Días `YYYY-MM-DD` que el Excel cargado realmente cubre. Sale de las mismas
 * claves `PLATE|día`, así no hay un campo extra de contexto que un caller pueda
 * olvidarse de poblar y quedar desincronizado.
 */
export function excelCoveredDaysFromPlateDays(
  excelPlateDays: Set<string> | null | undefined
): Set<string> {
  const days = new Set<string>()
  for (const key of excelPlateDays ?? []) {
    const day = String(key).split('|')[1]
    if (day) days.add(day)
  }
  return days
}

/**
 * G5 (`SIN_MOVIMIENTO_EXCEL`) ELIMINADA en el reemplazo total 2026-08-05: las
 * anomalías se definen SOLO por las reglas R1–R5 (`anomaly_kind` que ya trae la
 * corrida). Se mantiene la firma como no-op para no tocar los call sites de la UI.
 */
export function stampMissingExcelAnomalies(
  entries: CircuitClassificationEntry[],
  _ctx: AnomalyListContext
): CircuitClassificationEntry[] {
  void _ctx
  return entries
}

export type PelletExcelMovement = {
  esDeVuelta: boolean
  platform: string
  product: string
}

/**
 * Movimientos de pellet del Excel por `PLATE|día`, para asignarle circuito al recorrido.
 *
 * Se lee de Movimientos por Contrato normalizado porque es la única tabla que trae
 * `es_de_vuelta`, que es el discriminante del circuito (`excel_operations_with_truckflow`
 * no lo propaga). Mismo patrón que G5: se resuelve acá y funciona sobre ventanas ya
 * guardadas, sin re-correr el ETL.
 */
export function buildPelletExcelMovementsFromCsv(
  csv: string | undefined | null
): Map<string, PelletExcelMovement> {
  const out = new Map<string, PelletExcelMovement>()
  if (!csv?.trim()) return out
  const { rows } = parseCsvToRecords(csv)
  for (const r of rows) {
    const product = String(r.product_normalized ?? r.producto_original ?? r.resolved_product ?? '')
    if (!isPelletExcelProduct(product)) continue
    const plate = normalizePlate(r.plate_normalized ?? r.plate ?? r.patente ?? '')
    if (!plate) continue
    const esDeVuelta = parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original)
    const movement: PelletExcelMovement = {
      esDeVuelta,
      platform: String(r.platform_normalized ?? r.plataforma_original ?? ''),
      product,
    }
    // El Excel se emite con la salida; registrar los dos días cubre el overnight.
    for (const day of excelPlateDaysForMovimientoRow(r)) {
      out.set(excelPlateDayKey(plate, day), movement)
    }
  }
  return out
}

/**
 * Asigna circuito de pellet al recorrido cruzando patente+día con Movimientos.
 *
 * Sin esto el pellet caía en **R8 · Recepción Mercadería Líquida**: el camión pasa por
 * la calada líquida (es un paso de su propio recorrido) y `finalCircuitScoring` asigna
 * R8 con solo ver `LIQUIDO` en la secuencia. Las tolvas 09–11 no tienen cámara, así que
 * el circuito de pellet solo puede venir del Excel.
 */
export function stampPelletCircuitsFromExcel(
  entries: CircuitClassificationEntry[],
  pelletMovements: Map<string, PelletExcelMovement>
): CircuitClassificationEntry[] {
  if (!pelletMovements.size) return entries
  return entries.map((entry) => {
    const plate = normalizePlate(entry.normalizedPlate || entry.plate)
    if (!plate) return entry
    // Solo los días propios del recorrido. El margen del D+1 de
    // `entryExcelCandidateDays` sirve para NEGAR un movimiento (no afirmar ausencia
    // sin haberlo buscado en la descarga), pero usarlo para ASIGNAR circuito le
    // pegaría el pellet a viajes del día anterior de la misma patente.
    const movement = entryOwnDays(entry)
      .map((day) => pelletMovements.get(excelPlateDayKey(plate, day)))
      .find(Boolean)
    if (!movement) return entry

    const pellet = resolvePelletCircuit({
      esDeVuelta: movement.esDeVuelta,
      platformHint: movement.platform,
    })
    const label = CIRCUIT_CATALOG[pellet.assigned]?.label ?? pellet.assigned
    return {
      ...entry,
      executiveCircuitCode: pellet.assigned,
      executiveCircuitLabel: label,
      executiveCircuitDisplay: `${pellet.assigned} · ${label}`,
      // Prefijo EXCEL_ para que cuente como evidencia de movimiento (G5 no dispara).
      committeeReason: `EXCEL_PELLET_${pellet.flow}:${movement.product}@${
        pellet.celdaResolved ? movement.platform : 'CELDA_SIN_IDENTIFICAR'
      }`,
      executiveStatus:
        entry.executiveStatus === 'ANOMALO' || entry.executiveStatus === 'NO_EVALUABLE' ?
          'VALIDO'
        : entry.executiveStatus,
    }
  })
}

/**
 * Patentes con Excel «De la vuelta» = SI (`es_de_vuelta` / `es_de_vuelta_original`).
 * Se sacan del listado de anomalías y de sospechosos SL→Ric.
 */
export function collectDeVueltaPlatesFromCsv(csv: string | undefined | null): Set<string> {
  const out = new Set<string>()
  if (!csv?.trim()) return out
  const { rows } = parseCsvToRecords(csv)
  for (const r of rows) {
    const truthy = parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original)
    if (!truthy) continue
    const plate = normalizePlate(r.plate_normalized ?? r.plate ?? r.patente ?? '')
    if (plate) out.add(plate)
  }
  return out
}

function collectDeVueltaPlatesFromExcelOps(source: ExcelOpsSource): Set<string> {
  const out = new Set<string>()
  for (const r of excelOpsRows(source)) {
    const truthy = parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original)
    if (!truthy) continue
    const plate = normalizePlate(String(r.plate_normalized ?? r.plate ?? r.patente ?? ''))
    if (plate) out.add(plate)
  }
  return out
}

/** Patentes normalizadas de sesiones transile interno inferidas (para excluir de anomalías). */
export function collectTransileInternoExcludedPlates(
  rows: readonly Record<string, unknown>[] | null | undefined
): Set<string> {
  const set = new Set<string>()
  for (const r of rows ?? []) {
    const inferred = String(r.inferred_transile_interno ?? '').trim().toLowerCase()
    if (inferred !== 'true' && inferred !== '1' && inferred !== 'yes') continue
    const plate = normalizePlate(String(r.patente ?? r.plate ?? ''))
    if (plate) set.add(plate)
  }
  return set
}

/**
 * Contexto de listado de anomalías a partir de CSV/tablas de transform.
 * Registry y transile interno se incluyen siempre (aplican también al camino de
 * comportamiento, que no depende del Excel). `excelPlates` solo se puebla si hay Excel.
 */
export function buildAnomalyListContextFromTransformCsv(
  csv: {
    external_movimientos_contrato_normalized?: string
    excel_operations_with_truckflow?: string
    plate_registry_excluded?: string
  } | null | undefined,
  excelOpsRowsPreferred?: ExcelOpsSource,
  transileInternoSessionRows?: readonly Record<string, unknown>[] | null
): AnomalyListContext {
  const normalized = String(csv?.external_movimientos_contrato_normalized ?? '').trim()
  const excelOps =
    excelOpsHasData(excelOpsRowsPreferred) ? excelOpsRowsPreferred
    : String(csv?.excel_operations_with_truckflow ?? '').trim()
  const hasExcel = Boolean(normalized || excelOpsHasData(excelOps))
  const excelPlates =
    !hasExcel ? null
    : normalized ? collectNormalizedPlatesFromCsv(normalized)
    : collectNormalizedPlatesFromExcelOps(excelOps)
  const excelPlateDays =
    !hasExcel ? null
    : normalized ? collectExcelPlateDaysFromCsv(normalized)
    : collectExcelPlateDaysFromExcelOps(excelOps)
  const excludedRegistryPlates = collectNormalizedPlatesFromCsv(csv?.plate_registry_excluded)
  const transileExcludedPlates = collectTransileInternoExcludedPlates(transileInternoSessionRows)
  const deVueltaExcludedPlates =
    normalized ? collectDeVueltaPlatesFromCsv(normalized)
    : excelOpsHasData(excelOps) ? collectDeVueltaPlatesFromExcelOps(excelOps)
    : new Set<string>()
  return {
    excelPlates,
    excelPlateDays,
    excludedRegistryPlates,
    transileExcludedPlates,
    deVueltaExcludedPlates,
  }
}

function collectNormalizedPlatesFromExcelOps(source: ExcelOpsSource): Set<string> {
  const out = new Set<string>()
  for (const r of excelOpsRows(source)) {
    const plate = normalizePlate(String(r.plate_normalized ?? r.plate ?? r.patente ?? ''))
    if (plate) out.add(plate)
  }
  return out
}

/** Agrupa journeys anómalos listables (≥ minEvents) por recorrido observado. */
export function buildAnomalySequenceBreakdown(
  entries: CircuitClassificationEntry[],
  minEvents = ANOMALY_LIST_MIN_EVENTS,
  ctx: AnomalyListContext = { excelPlates: null }
): AnomalySequenceBreakdownRow[] {
  const listCtx: AnomalyListContext = { ...ctx, minEvents }
  const anomalies = entries.filter((e) => isListedAnomalyCandidate(e, listCtx))
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

/**
 * Anomalías por recorrido. Corridas nuevas: `listedAnomalyCount` = comportamiento
 * real (`classifyAnomaly` → BEHAVIORAL) e `incompleteCount` = huecos de datos
 * (DATA_COVERAGE). Corridas viejas/tests (sin anomaly_kind): heurística legacy
 * "Truckflow ≥ minEvents fuera del Excel", incompletos por < minEvents.
 * En ambos casos transile y flota servicio quedan excluidos.
 */
export function buildAnomalyReviewSummary(
  entries: CircuitClassificationEntry[],
  ctx: AnomalyListContext = { excelPlates: null }
): AnomalyReviewSummary {
  const minEvents = ctx.minEvents ?? ANOMALY_LIST_MIN_EVENTS
  const pool = entries.filter((e) => isAnomalyListPoolEntry(e, ctx))
  const incompleteCount = pool.filter((e) =>
    e.anomalyKind !== undefined ?
      e.anomalyKind === 'DATA_COVERAGE'
    : e.usefulEventsCount < minEvents
  ).length
  const sequenceRows = buildAnomalySequenceBreakdown(entries, minEvents, ctx)
  const listedAnomalyCount = sequenceRows.reduce((acc, r) => acc + r.count, 0)
  return { incompleteCount, sequenceRows, listedAnomalyCount }
}

/**
 * Modelo único del comité: la ÚNICA partición de la que derivan torta, cross-tab
 * por circuito, panel de anomalías, métricas y CSV de gráficos. Mientras cada
 * superficie contaba por su cuenta (`committee_group` en la torta, reglas de oro
 * en el cross-tab, `classifyAnomaly` en el panel, `executive_bucket` en las
 * métricas) el mismo camión aparecía o no según dónde se clickeara.
 *
 * Dos decisiones que hacen que el número sea uno solo:
 *
 * 1. **La anomalía de comportamiento gana sobre el circuito.** Un journey con
 *    regla de oro salía en el cross-tab bajo su R* pero seguía contado como
 *    COMPLETO en la torta (dual visibilidad). Acá sale de completos/variaciones y
 *    entra a `anomalias`, así «148 en R7» son parte de las anomalías generales.
 * 2. **Sin datos = fuera del análisis.** Los journeys que no se pueden juzgar
 *    (≤2 eventos frontales, cobertura insuficiente, secuencia incompleta sin
 *    contradicción, o circuito sin punto instrumentado / sin secuencia) no entran
 *    en ningún gráfico ni en ningún total. Quedan en `excludedNoData` solo para
 *    poder informar el denominador; no son una categoría del comité.
 */
export type CommitteeEvaluableModel = {
  /** Comportamiento del camión. Mismo predicado que lista el panel. */
  anomalias: CircuitClassificationEntry[]
  /** Comité COMPLETOS, ya netos de anomalías. */
  completos: CircuitClassificationEntry[]
  /** Comité VARIACIONES_OPERATIVAS, ya netos de anomalías. */
  variaciones: CircuitClassificationEntry[]
  /** Sin evidencia para juzgar: excluidos de todo gráfico y de todo total. */
  excludedNoData: CircuitClassificationEntry[]
  /** completos + variaciones + anomalias. Denominador único de la torta. */
  evaluableTotal: number
}

export function buildCommitteeEvaluableModel(
  entries: readonly CircuitClassificationEntry[],
  ctx: AnomalyListContext = { excelPlates: null }
): CommitteeEvaluableModel {
  const anomalias: CircuitClassificationEntry[] = []
  const completos: CircuitClassificationEntry[] = []
  const variaciones: CircuitClassificationEntry[] = []
  const excludedNoData: CircuitClassificationEntry[] = []

  for (const entry of entries) {
    // Evidencia mínima como precondición de ser evaluable: un journey de ≤2 tomas
    // sin movimiento Excel no es completo ni anómalo, es un hueco de datos. Va
    // afuera antes que nada, sin importar qué diga `committee_group` (hay 2-tomas
    // etiquetados COMPLETOS con motivo RUTA_RIC_SAN_LORENZO_COMPLETA).
    if (!hasMinimumEvidenceForCommittee(entry)) {
      excludedNoData.push(entry)
      continue
    }
    // El comportamiento se evalúa primero: gana sobre la categoría del circuito.
    if (isListedAnomalyCandidate(entry, ctx)) {
      anomalias.push(entry)
      continue
    }
    const category = committeeCategoryFromEntry(entry)
    if (category === 'completos') completos.push(entry)
    else if (category === 'variaciones') variaciones.push(entry)
    else excludedNoData.push(entry)
  }

  return {
    anomalias,
    completos,
    variaciones,
    excludedNoData,
    evaluableTotal: completos.length + variaciones.length + anomalias.length,
  }
}

/** Las 3 porciones de la torta comité, derivadas del modelo único. */
export function committeePieSlicesFromModel(
  model: CommitteeEvaluableModel
): CircuitPieSliceWithTrucks[] {
  const slices: CircuitPieSliceWithTrucks[] = [
    {
      name: COMMITTEE_PIE_SLICE_COMPLETOS,
      value: model.completos.length,
      color: '#059669',
      trucks: model.completos,
    },
    {
      name: COMMITTEE_PIE_SLICE_VARIACIONES,
      value: model.variaciones.length,
      color: '#0ea5e9',
      trucks: model.variaciones,
    },
    {
      name: COMMITTEE_PIE_SLICE_ANOMALIAS,
      value: model.anomalias.length,
      color: '#e11d48',
      trucks: model.anomalias,
    },
  ]
  return slices.filter((s) => s.value > 0)
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
    anomaly_kind: '',
    anomaly_kind_reason: '',
    sample_filter: '',
  }
}

/**
 * CSV único para gráficos de barras / torta / anomalías — mismo contenido que la UI de conciliación.
 * record_type: CIRCUITO_COMITE | CIRCUITO_COMITE_CELDA | TOTAL_VALIDOS | COMITE_RESUMEN |
 * CIRCUITO_BARRA | EXCLUIDOS_SIN_DATOS | ANOMALIA_RECORRIDO | JOURNEY
 */
export function committeeChartExportCsv(
  input: {
    entries: CircuitClassificationEntry[]
    crossTab: CommitteeCircuitCrossTabRow[]
    crossTabTotals: { total: number; completos: number; variaciones: number }
    anomalyReview: AnomalyReviewSummary
    circuitBarSlices: ExecutiveCircuitBarSlice[]
    /** Journeys sin datos, excluidos del análisis (`CommitteeEvaluableModel.excludedNoData`). */
    excludedNoDataCount: number
  },
  options: CommitteeChartExportOptions = {}
): string {
  const includeJourneyRows = options.includeJourneyRows !== false
  const sampleFilter = String(options.sampleFilter ?? '').trim()
  const withSample = (row: Record<string, string | number>) =>
    sampleFilter ? { ...row, sample_filter: sampleFilter } : row
  const rows: Record<string, string | number>[] = []
  // Denominador único: el universo evaluable del cross-tab (ya incluye anomalías).
  // Los journeys sin datos no entran — se informan aparte como EXCLUIDOS_SIN_DATOS.
  const grandTotal = input.crossTabTotals.total

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
    if (r.anomalias > 0) {
      rows.push({
        ...emptyChartRow('CIRCUITO_COMITE_CELDA'),
        executive_circuit_code: r.code,
        executive_circuit_label: r.label,
        display_label: r.displayLabel,
        committee_category: 'anomalias',
        count: r.anomalias,
        pct: r.pctAnomalias,
      })
    }
  }

  rows.push({
    ...emptyChartRow('TOTAL_VALIDOS'),
    display_label: 'Total evaluable (completos + variaciones + anomalías)',
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
  pushResumen('anomalias', input.anomalyReview.listedAnomalyCount)

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

  // Fuera del análisis, pero informado para que el denominador sea auditable.
  if (input.excludedNoDataCount > 0) {
    rows.push({
      ...emptyChartRow('EXCLUIDOS_SIN_DATOS'),
      display_label: 'Excluidos por falta de datos (no entran en ningún total)',
      count: input.excludedNoDataCount,
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
    if (includeJourneyRows) {
      for (const e of ar.trucks) {
        rows.push({
          ...emptyChartRow('ANOMALIA_JOURNEY'),
          executive_circuit_code: e.executiveCircuitCode,
          executive_circuit_label: e.executiveCircuitLabel,
          display_label: e.executiveCircuitDisplay,
          committee_group: e.committeeGroup,
          committee_category: 'anomalias',
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
          event_count: truckflowCrossingCountFromEntry(e),
          anomaly_kind: e.anomalyKind ?? '',
          anomaly_kind_reason: e.anomalyKindReason ?? '',
        })
      }
    }
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
        event_count: truckflowCrossingCountFromEntry(e),
        anomaly_kind: e.anomalyKind ?? '',
        anomaly_kind_reason: e.anomalyKindReason ?? '',
      })
    }
  }

  const stamped = sampleFilter ? rows.map((r) => withSample(r)) : rows
  return recordsToCsv([...COMMITTEE_CHART_EXPORT_HEADERS], stamped)
}

/**
 * Cross-tab circuito × categoría, derivado del modelo único: las mismas tres
 * listas de `CommitteeEvaluableModel` agrupadas por `executiveCircuitCode`. Por
 * construcción, la suma de la columna «Anomalías» es igual a la porción ANOMALÍAS
 * de la torta y al total del panel — no hay forma de que difieran.
 */
export function buildCommitteeCircuitCrossTab(
  model: CommitteeEvaluableModel
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

  const bucketFor = (entry: CircuitClassificationEntry) => {
    // Pellet unificado: R13/14/15 y R30/31/32 se agrupan en una sola fila (no por celda).
    const code = unifyPelletCircuitCode(entry.executiveCircuitCode) || 'SIN_ASIGNAR'
    const bucket = byCode.get(code) ?? {
      completos: 0,
      variaciones: 0,
      anomalias: 0,
      label: pelletUnifiedCircuitLabel(code) ?? (entry.executiveCircuitLabel || code),
      trucksCompletos: [],
      trucksVariaciones: [],
      trucksAnomalias: [],
    }
    byCode.set(code, bucket)
    return bucket
  }

  for (const entry of model.completos) {
    const bucket = bucketFor(entry)
    bucket.completos++
    bucket.trucksCompletos.push(entry)
  }
  for (const entry of model.variaciones) {
    const bucket = bucketFor(entry)
    bucket.variaciones++
    bucket.trucksVariaciones.push(entry)
  }
  // La anomalía se imputa al circuito que el journey tenía asignado: así «148 en
  // R7» y las anomalías generales son el mismo conjunto, visto por circuito.
  for (const entry of model.anomalias) {
    const bucket = bucketFor(entry)
    bucket.anomalias++
    bucket.trucksAnomalias.push(entry)
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
    // El total de la fila es el universo evaluable del circuito: las anomalías
    // salieron de completos/variaciones, no se suman aparte.
    const total = data.completos + data.variaciones + data.anomalias
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
      anomalias: data.anomalias,
      pctCompletos: Math.round((data.completos / total) * 1000) / 10,
      pctVariaciones: Math.round((data.variaciones / total) * 1000) / 10,
      pctAnomalias: Math.round((data.anomalias / total) * 1000) / 10,
      trucksCompletos: sortDrilldownEntries(data.trucksCompletos),
      trucksVariaciones: sortDrilldownEntries(data.trucksVariaciones),
      trucksAnomalias: sortDrilldownEntries(data.trucksAnomalias),
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
  debugMatrix: DebugMatrixSource,
  mergedTruckflowMovimientosCsv?: string | undefined | null,
  excelOperationsWithTruckflow?: ExcelOpsSource
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
  if (!debugMatrixHasData(debugMatrix)) return empty

  const rows = debugMatrixRowsFrom(debugMatrix)
  if (!rows.length) return empty

  const prelimEntries: CircuitClassificationEntry[] = []
  for (const r of rows) {
    prelimEntries.push(rowToEntry(r, CIRCUIT_PIE_COLORS[0]!))
  }

  let entries = promotePlateDischargeFragments(prelimEntries)

  if (excelOpsHasData(excelOperationsWithTruckflow)) {
    const excelReco = applyExcelFirstReconciliation(entries, excelOperationsWithTruckflow)
    entries = reclassifyPossibleRejections(excelReco.entries).entries
    const opCentric = reindexExecutiveChartsForExcelFirstOperations(entries, excelOperationsWithTruckflow)
    entries = opCentric.entries
    const orphans = appendPermittedAceiteExcelOrphansToEntries(entries, excelOperationsWithTruckflow)
    entries = orphans.entries
    const pelletEvidence = appendPelletExcelWithEvidenceToEntries(entries, excelOperationsWithTruckflow)
    entries = pelletEvidence.entries
    entries = enforceLiquidExcelExecutiveCircuits(entries, excelOperationsWithTruckflow)
    entries = promoteAceiteRicardoneTruckflowExecutiveCircuits(entries)
    entries = reclassifyMislabeledR7AceiteMatrixEntries(entries, excelOperationsWithTruckflow)
    return rebuildClassificationIndexFromEntries(
      entries,
      excelReco.promotedCount + orphans.appendedCount + pelletEvidence.appendedCount,
      opCentric.excelOperationCount + orphans.appendedCount + pelletEvidence.appendedCount
    )
  }

  const excelPromo = promoteExcelMovimientosContrato(entries, mergedTruckflowMovimientosCsv)
  entries = reclassifyPossibleRejections(excelPromo.entries).entries

  return rebuildClassificationIndexFromEntries(entries, excelPromo.promotedCount, excelPromo.promotedCount)
}

/** Auditoría aceite: plataforma Excel → circuito ejecutivo (filas del CSV excel_operations_with_truckflow). */
export function buildAceiteCircuitResolutionDebugCsv(excelOps: ExcelOpsSource): string {
  if (!excelOpsHasData(excelOps)) return ''
  const rows = excelOpsRows(excelOps)
  const debugRows = rows.map((r, rowIndex) => {
    const platformRaw = String(r.plataforma_original ?? r.platform_normalized ?? '').trim()
    const platformNorm = String(r.resolved_platform ?? r.platform_normalized ?? '').trim()
    const product = String(r.resolved_product ?? r.product_normalized ?? '').trim()
    const obs = String(r.observaciones ?? '').trim()
    const obsCal = String(r.observacion_calidad ?? '').trim()
    const lite: ExcelFirstReconcileLite = {
      product_normalized: product,
      platform_normalized: platformNorm,
      plataforma_original: platformRaw,
      plate_normalized: String(r.plate_normalized ?? '').trim(),
      planta_normalized: String(r.planta_normalized ?? '').trim(),
      movement_type: String(r.movement_type ?? '').trim(),
      mov: String(r.mov ?? r.movement_type_detail ?? '').trim(),
      source_date: String(r.source_date ?? '').trim(),
      truckflow_circuit_codes: String(r.truckflow_circuit_codes ?? '').trim(),
      resolved_circuit_family: String(r.resolved_circuit_family ?? '').trim(),
      resolved_executive_circuit_code: String(r.resolved_executive_circuit_code ?? '').trim(),
      match_quality: String(r.match_quality ?? '').trim(),
      route_quality: String(r.route_quality ?? '').trim(),
      evidence_count: Number(r.evidence_count ?? 0),
      truckflow_observed_sequence_combined: String(r.truckflow_observed_sequence_combined ?? '').trim(),
      truckflow_device_sequence_combined: truckflowDeviceSequenceFromExcelRow(r),
      observaciones: obs,
      observacion_calidad: obsCal,
      es_de_vuelta: parseExcelDeVueltaFlag(r.es_de_vuelta ?? r.es_de_vuelta_original),
    }
    const resolved = String(r.resolved_executive_circuit_code ?? '').trim()
    const finalCode = pickExecutiveCircuitFromExcelFirst(lite)
    const opId = resolveCommitteeExcelOperationId(r, rowIndex)
    return {
      row_index: String(rowIndex),
      plate: String(r.plate_normalized ?? '').trim(),
      ctg: String(r.ctg ?? '').trim(),
      ingreso: String(r.ingreso_id ?? '').trim(),
      comprob: String(r.comprob ?? '').trim(),
      producto: product,
      platform_raw: platformRaw,
      platform_normalized: platformNorm,
      observaciones: obs,
      is_aceite: excelRowIndicatesAceite(lite) ? '1' : '0',
      is_renova_observation: excelObservacionesIndicateRenovaAceite(obs, obsCal) ? '1' : '0',
      resolved_executive_circuit_code: resolved,
      final_executive_circuit_code: finalCode,
      journey_id: `excel:${opId}`,
      source: 'excel_operations_with_truckflow',
      matched_truckflow: String(Number(r.evidence_count ?? 0) > 0 ? '1' : '0'),
    }
  })
  if (!debugRows.length) return ''
  return recordsToCsv(Object.keys(debugRows[0]!), debugRows)
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
