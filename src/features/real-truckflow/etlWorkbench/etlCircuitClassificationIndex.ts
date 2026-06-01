import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords } from './etlCsvParse'
import {
  EXECUTIVE_CIRCUIT_MATRIX,
  EXECUTIVE_CIRCUIT_ORDER,
  formatExecutiveCircuitLabel,
} from './finalCircuitScoring'

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
  debugMatrixCsv: string | undefined | null
): CircuitClassificationIndex {
  const empty: CircuitClassificationIndex = {
    entries: [],
    byJourneyId: new Map(),
    byPlate: new Map(),
    byPieSlice: new Map(),
    pieSlices: [],
    circuitBarSlices: [],
    total: 0,
  }
  if (!debugMatrixCsv?.trim()) return empty

  const { rows } = parseCsvToRecords(debugMatrixCsv)
  if (!rows.length) return empty

  const sliceCounts = new Map<string, number>()
  for (const r of rows) {
    const label = pieSliceLabelFromMatrixRow(r)
    sliceCounts.set(label, (sliceCounts.get(label) ?? 0) + 1)
  }

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

  const entries: CircuitClassificationEntry[] = []
  const byJourneyId = new Map<string, CircuitClassificationEntry>()
  const byPlate = new Map<string, CircuitClassificationEntry[]>()
  const byPieSlice = new Map<string, CircuitClassificationEntry[]>()

  for (const r of rows) {
    const label = pieSliceLabelFromMatrixRow(r)
    const entry = rowToEntry(r, colorBySlice.get(label) ?? CIRCUIT_PIE_COLORS[0]!)
    entries.push(entry)
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
  }
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
  if (list.length === 1) return list[0]!
  if (ju) {
    const match = list.find((e) => e.journeyId === ju)
    if (match) return match
  }
  return list[0]!
}
