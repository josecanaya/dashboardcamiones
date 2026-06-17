import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords } from './etlCsvParse'
import { inferPlantaFromSegment } from './etlSectorOccupancy30min'
import {
  formatTransitionLabel,
  INFERRED_KPI_ROLLUP_MAX_MINUTES,
  repairSlBalanzaScatterSegment,
  buildSlBalanzaEgresoComiteScatterPayload,
  buildSlComiteTruckflowContext,
  evaluateSlBalanzaComitePayload,
  type SlBalanzaComiteRejectReason,
  type SlBalanzaComiteOptions,
  SL_BALANZA_COMITE_PRODUCT_OPTIONS,
  SL_BALANZA_ROLLUP_TRANSITION,
  SL_BALANZA_STAY_MAX_MINUTES,
  SL_INGRESO_BALANZA_ROLLUP_TRANSITION,
  SL_INGRESO_TO_BALANZA_MAX_MINUTES,
  SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES,
  synthesizeSlRollupLegsFromTimedSegments,
  buildTimedLogicalTimelineFromSegments,
  segmentsForSlTruckflowTimeline,
  type SlScatterHorarioFuente,
  type SlScatterHorarioInicioFuente,
  type SlScatterHorarioFinFuente,
} from './etlSegmentTiming'
import { argentinaLocalParts, ARGENTINA_UTC_OFFSET_MINUTES, parseTimestampMs } from './etlTimestampNormalize'
import { INFERRED_ROLLUP_VALID_DETAIL, type ExcelOperationSegmentScatterRow } from './etlExcelFirstMerge'
import type { SegmentScatterRow } from './etlOperationalAnalysis'
import { p75, p90 } from '../../../utils/stats'

/** Turnos de 6 h según hora local de inicio del tramo. */
export type FranjaHoraria = 'Madrugada' | 'Mañana' | 'Tarde' | 'Noche'

export const FRANJA_HORARIA_WINDOWS: Record<FranjaHoraria, { desde: string; hasta: string }> = {
  Madrugada: { desde: '00:00', hasta: '06:00' },
  Mañana: { desde: '06:00', hasta: '12:00' },
  Tarde: { desde: '12:00', hasta: '18:00' },
  Noche: { desde: '18:00', hasta: '24:00' },
}

export const FRANJA_HORARIA_COLORS: Record<FranjaHoraria, string> = {
  Madrugada: '#2563eb',
  Mañana: '#f97316',
  Tarde: '#16a34a',
  Noche: '#dc2626',
}

export const FRANJA_HORARIA_ORDER: FranjaHoraria[] = ['Madrugada', 'Mañana', 'Tarde', 'Noche']

/** Valor del selector de día para vista general (todos los días del período). */
export const SCATTER_DAY_FILTER_ALL = '__ALL_DAYS__'

export type SegmentScatterByDayRow = {
  journey_id: string
  patente: string
  producto: string
  circuito: string
  tramo_operativo: string
  sector: string
  planta: string
  segment_from: string
  segment_to: string
  timestamp_inicio: string
  timestamp_fin: string
  fecha_tramo: string
  hora_inicio: string
  franja_horaria: FranjaHoraria | ''
  color_franja: string
  duracion_minutos: number
  estado_ejecutivo: string
  es_ultimo_cuarto: boolean
  p75_tramo: number
  p90_tramo: number
  /** Origen de horarios del tramo (KPI comité). */
  horario_fuente: SlScatterHorarioFuente | 'excel_inferido' | ''
  horario_fuente_inicio?: SlScatterHorarioInicioFuente | ''
  horario_fuente_fin?: SlScatterHorarioFinFuente | ''
}

export type SegmentScatterByDaySource = {
  journey_id: string
  patente: string
  producto: string
  circuito: string
  segment_from: string
  segment_to: string
  timestamp_inicio: string
  timestamp_fin: string
  duracion_minutos: number
  estado_ejecutivo: string
  horario_fuente?: SlScatterHorarioFuente | 'excel_inferido' | ''
  horario_fuente_inicio?: SlScatterHorarioInicioFuente | ''
  horario_fuente_fin?: SlScatterHorarioFinFuente | ''
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Fecha y hora local Argentina (-03:00) del inicio del tramo. */
export function segmentStartLocalParts(iso: string): { fecha_tramo: string; hora_inicio: string } | null {
  return argentinaLocalParts(iso)
}

/** 00–06 · 06–12 · 12–18 · 18–24 (hora Argentina). */
export function resolveFranjaHoraria(iso: string): FranjaHoraria | '' {
  const ms = parseTimestampMs(iso)
  if (!Number.isFinite(ms)) return ''
  const localMs = ms + ARGENTINA_UTC_OFFSET_MINUTES * 60_000
  const minutes = new Date(localMs).getUTCHours() * 60 + new Date(localMs).getUTCMinutes()
  if (minutes < 6 * 60) return 'Madrugada'
  if (minutes < 12 * 60) return 'Mañana'
  if (minutes < 18 * 60) return 'Tarde'
  return 'Noche'
}

export function colorForFranja(franja: FranjaHoraria | ''): string {
  if (!franja) return '#64748b'
  return FRANJA_HORARIA_COLORS[franja]
}

function normalizeFranjaLabel(raw: string, timestampInicio = ''): FranjaHoraria | '' {
  const u = String(raw ?? '').trim()
  if (u === 'Madrugada' || u === 'Mañana' || u === 'Tarde' || u === 'Noche') return u
  if (u === 'Día') return resolveFranjaHoraria(timestampInicio) || 'Mañana'
  const fromTs = resolveFranjaHoraria(timestampInicio)
  return fromTs
}

function tramoOperativoLabel(fromCode: string, toCode: string): string {
  const from = String(fromCode ?? '').trim()
  const to = String(toCode ?? '').trim()
  if (!from || !to) return ''
  return formatTransitionLabel(from, to)
}

function operationTimedSegments(rows: ExcelOperationSegmentScatterRow[]) {
  return rows.map((r) => ({
    segment_from: String(r.segment_from ?? '').trim(),
    segment_to: String(r.segment_to ?? '').trim(),
    segment_start_time: String(r.segment_start_time ?? '').trim(),
    segment_end_time: String(r.segment_end_time ?? '').trim(),
  }))
}

function resolveExcelFirstSegmentCircuitCode(row: ExcelOperationSegmentScatterRow): string {
  return (
    String(row.resolved_executive_circuit_code ?? '').trim() ||
    String(row.truckflow_circuit_code ?? '').trim()
  )
}

function scatterMetaFromRow(row: ExcelOperationSegmentScatterRow) {
  const circuito = resolveExcelFirstSegmentCircuitCode(row)
  const journey_id =
    String(row.journey_uid ?? '').trim() || String(row.external_operation_id ?? '').trim()
  return {
    journey_id,
    patente: String(row.plate_normalized ?? '').trim(),
    producto: String(row.product_normalized ?? '').trim(),
    circuito,
    estado_ejecutivo: String(row.truckflow_executive_status ?? '').trim(),
  }
}

function resolveSlBalanzaScatterSourceForOperation(
  opRows: ExcelOperationSegmentScatterRow[],
  comiteOpts?: SlBalanzaComiteOptions
): SegmentScatterByDaySource | null {
  const metaRow = opRows[0]
  if (!metaRow) return null
  const meta = scatterMetaFromRow(metaRow)
  const circuitCode = meta.circuito
  const operationId = String(metaRow.external_operation_id ?? metaRow.journey_uid ?? '').trim()
  if (!circuitCode || !operationId) return null

  const salida = String(metaRow.external_salida_at ?? '').trim()
  if (!salida) return null

  // Solo segmentos de cámara real: los rollups deducidos (DEDUCIDO_INFERRED_ROLLUP) no deben
  // aportar puntos de balanza ingreso/egreso "truckflow" porque no provienen de cámara.
  const realCameraRows = opRows.filter(
    (r) => String(r.truckflow_valid_detail ?? '').trim() !== INFERRED_ROLLUP_VALID_DETAIL
  )
  const operationSegments = operationTimedSegments(realCameraRows)
  const { opSegments: truckflowSegments, truckflowPoints, enrichedPoints } =
    buildSlComiteTruckflowContext({
      segments: operationSegments,
      externalIngresoAt: metaRow.external_ingreso_at,
      externalSalidaAt: salida,
      externalCaladoAt: metaRow.external_calado_at,
      plantaNormalized: metaRow.planta_normalized,
      executiveCircuitCode: circuitCode,
    })

  const payload = buildSlBalanzaEgresoComiteScatterPayload(
    truckflowSegments,
    truckflowPoints,
    salida,
    metaRow.external_ingreso_at,
    enrichedPoints,
    comiteOpts
  )
  if (!payload) return null

  return {
    ...meta,
    segment_from: SL_BALANZA_ROLLUP_TRANSITION.from,
    segment_to: SL_BALANZA_ROLLUP_TRANSITION.to,
    timestamp_inicio: payload.segment_start_time,
    timestamp_fin: payload.segment_end_time,
    duracion_minutos: payload.segment_duration_min,
    horario_fuente: payload.horario_fuente,
    horario_fuente_inicio: payload.horario_fuente_inicio,
    horario_fuente_fin: payload.horario_fuente_fin,
  }
}

function resolveSlIngresoBalanzaScatterSourceForOperation(
  opRows: ExcelOperationSegmentScatterRow[]
): SegmentScatterByDaySource | null {
  const metaRow = opRows[0]
  if (!metaRow) return null
  const meta = scatterMetaFromRow(metaRow)
  const circuitCode = meta.circuito
  const operationId = String(metaRow.external_operation_id ?? metaRow.journey_uid ?? '').trim()
  if (!circuitCode || !operationId) return null

  const operationSegments = operationTimedSegments(opRows)
  const measuredRows = opRows.filter(
    (r) =>
      String(r.segment_from ?? '').trim() === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
      String(r.segment_to ?? '').trim() === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to
  )

  for (const r of measuredRows) {
    const duration = Number(r.segment_duration_min)
    const clock = minutesBetweenScatter(
      String(r.segment_start_time ?? ''),
      String(r.segment_end_time ?? '')
    )
    if (
      Number.isFinite(duration) &&
      duration > 0 &&
      duration <= INFERRED_KPI_ROLLUP_MAX_MINUTES &&
      Number.isFinite(clock) &&
      clock > 0 &&
      clock <= INFERRED_KPI_ROLLUP_MAX_MINUTES &&
      Math.abs(clock - duration) <= 2
    ) {
      return {
        ...meta,
        segment_from: SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from,
        segment_to: SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to,
        timestamp_inicio: String(r.segment_start_time ?? ''),
        timestamp_fin: String(r.segment_end_time ?? ''),
        duracion_minutos: duration,
        horario_fuente: 'truckflow',
      }
    }
  }

  const synthLegs = synthesizeSlRollupLegsFromTimedSegments({
    operationId,
    plate: meta.patente,
    executiveCircuitCode: circuitCode,
    segments: operationSegments,
    externalCaladoAt: metaRow.external_calado_at,
    externalSalidaAt: metaRow.external_salida_at,
    externalIngresoAt: metaRow.external_ingreso_at,
    plantaNormalized: metaRow.planta_normalized,
  })
  const leg = synthLegs.find(
    (l) =>
      l.fromCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
      l.toCode === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to
  )
  if (!leg || leg.durationMinutes <= 0 || leg.durationMinutes > INFERRED_KPI_ROLLUP_MAX_MINUTES) {
    return null
  }
  const hasTrustedS1 = operationSegments.some(
    (s) =>
      String(s.segment_to ?? '').trim() === 'SL_BALANZA_INGRESO' &&
      String(s.segment_from ?? '').trim() !== 'SL_BALANZA_INGRESO'
  )
  const hasMeasuredIngresoBal = measuredRows.length > 0
  if (
    !hasTrustedS1 &&
    !hasMeasuredIngresoBal &&
    leg.durationMinutes <= SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES + 2
  ) {
    return null
  }
  return {
    ...meta,
    segment_from: SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from,
    segment_to: SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to,
    timestamp_inicio: leg.segment_start_time,
    timestamp_fin: leg.segment_end_time,
    duracion_minutos: leg.durationMinutes,
    horario_fuente: 'excel_inferido',
  }
}

/** Scatter Excel-first agrupado por operación (un punto SL balanza→egreso por camión). */
export function buildExcelScatterByDaySources(
  rows: ExcelOperationSegmentScatterRow[],
  comiteOpts?: SlBalanzaComiteOptions
): SegmentScatterByDaySource[] {
  const byOperation = new Map<string, ExcelOperationSegmentScatterRow[]>()
  for (const row of rows) {
    if (!row.analysis_ready_for_scatter) continue
    const opId = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!opId) continue
    const bucket = byOperation.get(opId) ?? []
    bucket.push(row)
    byOperation.set(opId, bucket)
  }

  const sources: SegmentScatterByDaySource[] = []
  for (const opRows of byOperation.values()) {
    const slScatter = resolveSlBalanzaScatterSourceForOperation(opRows, comiteOpts)
    if (slScatter) sources.push(slScatter)

    const ingresoBalanzaScatter = resolveSlIngresoBalanzaScatterSourceForOperation(opRows)
    if (ingresoBalanzaScatter) sources.push(ingresoBalanzaScatter)

    for (const row of opRows) {
      const from = String(row.segment_from ?? '').trim()
      const to = String(row.segment_to ?? '').trim()
      if (
        from === SL_BALANZA_ROLLUP_TRANSITION.from &&
        to === SL_BALANZA_ROLLUP_TRANSITION.to
      ) {
        continue
      }
      if (
        from === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
        to === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to
      ) {
        continue
      }
      const normalized = normalizeExcelSegmentForScatterByDay(row, opRows)
      if (normalized) sources.push(normalized)
    }
  }
  return sources
}

export function normalizeExcelSegmentForScatterByDay(
  row: ExcelOperationSegmentScatterRow,
  operationRows?: ExcelOperationSegmentScatterRow[]
): SegmentScatterByDaySource | null {
  const from = String(row.segment_from ?? '').trim()
  const to = String(row.segment_to ?? '').trim()
  const start = String(row.segment_start_time ?? '').trim()
  const end = String(row.segment_end_time ?? '').trim()
  const duration = Number(row.segment_duration_min)
  const circuito =
    String(row.resolved_executive_circuit_code ?? '').trim() ||
    String(row.truckflow_circuit_code ?? '').trim()
  const journey_id =
    String(row.journey_uid ?? '').trim() || String(row.external_operation_id ?? '').trim()
  if (!from || !to || !start || !circuito || !journey_id) return null
  if (!Number.isFinite(duration) || duration <= 0) return null

  const repaired = repairSlBalanzaScatterSegment(
    {
      segment_from: from,
      segment_to: to,
      segment_start_time: start,
      segment_end_time: end || start,
      segment_duration_min: duration,
    },
    {
      external_salida_at: row.external_salida_at,
      external_ingreso_at: row.external_ingreso_at,
      planta_normalized: row.planta_normalized,
      executive_circuit_code: circuito,
      operationSegments: operationRows ? operationTimedSegments(operationRows) : undefined,
    }
  )
  if (repaired) {
    return {
      journey_id,
      patente: String(row.plate_normalized ?? '').trim(),
      producto: String(row.product_normalized ?? '').trim(),
      circuito,
      segment_from: from,
      segment_to: to,
      timestamp_inicio: repaired.segment_start_time,
      timestamp_fin: repaired.segment_end_time,
      duracion_minutos: repaired.segment_duration_min,
      estado_ejecutivo: String(row.truckflow_executive_status ?? '').trim(),
      horario_fuente: repaired.horario_fuente,
      horario_fuente_inicio: repaired.horario_fuente_inicio,
      horario_fuente_fin: repaired.horario_fuente_fin,
    }
  }

  if (
    (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') ||
    (from === 'SL_BALANZA_SALIDA' && to === 'SL_EGRESO')
  ) {
    return null
  }

  if (
    from === 'SL_BALANZA_INGRESO' &&
    to === 'SL_EGRESO' &&
    (duration > SL_BALANZA_STAY_MAX_MINUTES ||
      minutesBetweenScatter(start, end || start) > SL_BALANZA_STAY_MAX_MINUTES)
  ) {
    return null
  }

  if (
    from === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from &&
    to === SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to &&
    (duration > INFERRED_KPI_ROLLUP_MAX_MINUTES ||
      minutesBetweenScatter(start, end || start) > INFERRED_KPI_ROLLUP_MAX_MINUTES)
  ) {
    return null
  }

  return {
    journey_id,
    patente: String(row.plate_normalized ?? '').trim(),
    producto: String(row.product_normalized ?? '').trim(),
    circuito,
    segment_from: from,
    segment_to: to,
    timestamp_inicio: start,
    timestamp_fin: end || start,
    duracion_minutos: duration,
    estado_ejecutivo: String(row.truckflow_executive_status ?? '').trim(),
    horario_fuente: 'truckflow',
  }
}

function minutesBetweenScatter(isoA: string, isoB: string): number {
  const ms = parseTimestampMs(isoB) - parseTimestampMs(isoA)
  return Number.isFinite(ms) && ms > 0 ? ms / 60_000 : Number.NaN
}

export function normalizeTruckflowScatterRowForByDay(row: SegmentScatterRow): SegmentScatterByDaySource | null {
  const from = String(row.segment_from ?? '').trim()
  const to = String(row.segment_to ?? '').trim()
  const start = String(row.segment_start_time ?? '').trim()
  const end = String(row.segment_end_time ?? '').trim()
  const duration = Number(row.segment_duration_min)
  const journey_id = String(row.journey_uid ?? '').trim()
  const circuito = String(row.circuit_code ?? '').trim()
  if (!from || !to || !start || !circuito || !journey_id) return null
  if (!Number.isFinite(duration) || duration <= 0) return null
  return {
    journey_id,
    patente: String(row.plate_normalized ?? '').trim(),
    producto: String(row.product_normalized ?? '').trim(),
    circuito,
    segment_from: from,
    segment_to: to,
    timestamp_inicio: start,
    timestamp_fin: end || start,
    duracion_minutos: duration,
    estado_ejecutivo: String(row.executive_status ?? '').trim(),
  }
}

export function buildSegmentScatterByDayRows(sources: SegmentScatterByDaySource[]): SegmentScatterByDayRow[] {
  const base: SegmentScatterByDayRow[] = []
  for (const s of sources) {
    const local = segmentStartLocalParts(s.timestamp_inicio)
    if (!local) continue
    const franja = resolveFranjaHoraria(s.timestamp_inicio)
    const tramo = tramoOperativoLabel(s.segment_from, s.segment_to)
    base.push({
      journey_id: s.journey_id,
      patente: s.patente,
      producto: s.producto,
      circuito: s.circuito,
      tramo_operativo: tramo,
      sector: tramo,
      planta: inferPlantaFromSegment(s.circuito, s.segment_from),
      segment_from: s.segment_from,
      segment_to: s.segment_to,
      timestamp_inicio: s.timestamp_inicio,
      timestamp_fin: s.timestamp_fin,
      fecha_tramo: local.fecha_tramo,
      hora_inicio: local.hora_inicio,
      franja_horaria: franja,
      color_franja: colorForFranja(franja),
      duracion_minutos: Math.round(s.duracion_minutos * 10) / 10,
      estado_ejecutivo: s.estado_ejecutivo,
      es_ultimo_cuarto: false,
      p75_tramo: 0,
      p90_tramo: 0,
      horario_fuente: s.horario_fuente ?? '',
      horario_fuente_inicio: s.horario_fuente_inicio ?? '',
      horario_fuente_fin: s.horario_fuente_fin ?? '',
    })
  }

  type GroupKey = string
  const durationsByGroup = new Map<GroupKey, number[]>()
  for (const row of base) {
    const key = `${row.producto}|${row.circuito}|${row.tramo_operativo}`
    const arr = durationsByGroup.get(key) ?? []
    arr.push(row.duracion_minutos)
    durationsByGroup.set(key, arr)
  }

  const statsByGroup = new Map<GroupKey, { p75: number; p90: number }>()
  for (const [key, durs] of durationsByGroup) {
    if (durs.length < 2) {
      statsByGroup.set(key, { p75: 0, p90: 0 })
      continue
    }
    statsByGroup.set(key, { p75: p75(durs), p90: p90(durs) })
  }

  for (const row of base) {
    const key = `${row.producto}|${row.circuito}|${row.tramo_operativo}`
    const st = statsByGroup.get(key)
    if (!st) continue
    row.p75_tramo = Math.round(st.p75 * 10) / 10
    row.p90_tramo = Math.round(st.p90 * 10) / 10
    if (st.p75 > 0 && row.duracion_minutos >= st.p75) {
      row.es_ultimo_cuarto = true
    }
  }

  return base.sort((a, b) => {
    const d = a.fecha_tramo.localeCompare(b.fecha_tramo)
    if (d !== 0) return d
    return a.duracion_minutos - b.duracion_minutos
  })
}

export const SEGMENT_SCATTER_BY_DAY_HEADERS = [
  'journey_id',
  'patente',
  'producto',
  'circuito',
  'tramo_operativo',
  'sector',
  'planta',
  'segment_from',
  'segment_to',
  'timestamp_inicio',
  'timestamp_fin',
  'fecha_tramo',
  'hora_inicio',
  'franja_horaria',
  'color_franja',
  'duracion_minutos',
  'estado_ejecutivo',
  'es_ultimo_cuarto',
  'p75_tramo',
  'p90_tramo',
  'horario_fuente',
  'horario_fuente_inicio',
  'horario_fuente_fin',
] as const

export type SlScatterAuditReason =
  | 'not_ready_for_scatter'
  | 'sin_salida_excel'
  | 'sin_inicio_balanza'
  | 'duracion_invalida'
  | 'duracion_excede_tope'
  | 'incluido'

export type SlScatterAuditRow = {
  external_operation_id: string
  patente: string
  circuito: string
  reason: SlScatterAuditReason
}

const SL_BALANZA_COMITE_CIRCUITS = new Set(['R7', 'SL1', 'R26', 'R27'])

function comiteRejectToAuditReason(reason: SlBalanzaComiteRejectReason): SlScatterAuditReason {
  switch (reason) {
    case 'ok':
      return 'incluido'
    case 'sin_salida_excel':
      return 'sin_salida_excel'
    case 'sin_inicio_balanza':
      return 'sin_inicio_balanza'
    case 'duracion_excede_180':
      return 'duracion_excede_tope'
    case 'inicio_anchored_excel_ric':
    case 'inicio_antes_ingreso_sl':
    case 'fin_no_posterior':
    case 'duracion_corta':
      return 'duracion_invalida'
    default:
      return 'duracion_invalida'
  }
}

export type SlBalanzaComiteFunnelSummary = Record<SlScatterAuditReason, number> & {
  operaciones_evaluadas: number
  con_evidencia_camara_balanza: number
  circuito_r7_sl: number
}

/** Embudo: por qué una operación no genera punto balanza ingreso→egreso en scatter. */
export function auditSlBalanzaScatterEligibility(
  rows: ExcelOperationSegmentScatterRow[],
  comiteOpts?: SlBalanzaComiteOptions
): SlScatterAuditRow[] {
  const byOperation = new Map<string, ExcelOperationSegmentScatterRow[]>()
  for (const row of rows) {
    const opId = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!opId) continue
    const bucket = byOperation.get(opId) ?? []
    bucket.push(row)
    byOperation.set(opId, bucket)
  }

  const audits: SlScatterAuditRow[] = []
  for (const [opId, opRows] of byOperation) {
    const metaRow = opRows[0]
    if (!metaRow) continue
    const patente = String(metaRow.plate_normalized ?? '').trim()
    const circuito =
      String(metaRow.resolved_executive_circuit_code ?? '').trim() ||
      String(metaRow.truckflow_circuit_code ?? '').trim()

    if (!metaRow.analysis_ready_for_scatter) {
      audits.push({ external_operation_id: opId, patente, circuito, reason: 'not_ready_for_scatter' })
      continue
    }
    if (!String(metaRow.external_salida_at ?? '').trim()) {
      audits.push({ external_operation_id: opId, patente, circuito, reason: 'sin_salida_excel' })
      continue
    }

    const operationSegments = operationTimedSegments(opRows)
    const { opSegments: truckflowSegments, truckflowPoints, enrichedPoints } =
      buildSlComiteTruckflowContext({
        segments: operationSegments,
        externalIngresoAt: metaRow.external_ingreso_at,
        externalSalidaAt: String(metaRow.external_salida_at ?? ''),
        externalCaladoAt: metaRow.external_calado_at,
        plantaNormalized: metaRow.planta_normalized,
        executiveCircuitCode: circuito,
      })
    const evaluation = evaluateSlBalanzaComitePayload(
      truckflowSegments,
      truckflowPoints,
      String(metaRow.external_salida_at ?? ''),
      metaRow.external_ingreso_at,
      enrichedPoints,
      comiteOpts
    )
    audits.push({
      external_operation_id: opId,
      patente,
      circuito,
      reason: comiteRejectToAuditReason(evaluation.reason),
    })
  }
  return audits
}

export function summarizeSlBalanzaComiteFunnel(
  rows: ExcelOperationSegmentScatterRow[],
  audits: SlScatterAuditRow[]
): SlBalanzaComiteFunnelSummary {
  const base = summarizeSlScatterAudit(audits)
  const byOperation = new Map<string, ExcelOperationSegmentScatterRow[]>()
  for (const row of rows) {
    const opId = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!opId) continue
    const bucket = byOperation.get(opId) ?? []
    bucket.push(row)
    byOperation.set(opId, bucket)
  }

  let conEvidenciaCamara = 0
  let circuitoR7Sl = 0
  for (const [opId, opRows] of byOperation) {
    const metaRow = opRows[0]
    if (!metaRow?.analysis_ready_for_scatter) continue
    const circuito =
      String(metaRow.resolved_executive_circuit_code ?? '').trim() ||
      String(metaRow.truckflow_circuit_code ?? '').trim()
    if (SL_BALANZA_COMITE_CIRCUITS.has(circuito)) circuitoR7Sl++

    const operationSegments = operationTimedSegments(opRows)
    const hasCameraSeg = operationSegments.some((s) => {
      const from = String(s.segment_from ?? '').trim()
      const to = String(s.segment_to ?? '').trim()
      if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') return true
      if (to === 'SL_BALANZA_INGRESO' && from !== 'SL_BALANZA_INGRESO') return true
      return false
    })
    if (hasCameraSeg) conEvidenciaCamara++
  }

  const evaluadas = audits.filter((a) => a.reason !== 'not_ready_for_scatter').length

  return {
    ...base,
    operaciones_evaluadas: evaluadas,
    con_evidencia_camara_balanza: conEvidenciaCamara,
    circuito_r7_sl: circuitoR7Sl,
  }
}

export function formatSlBalanzaComiteFunnelLog(summary: SlBalanzaComiteFunnelSummary): string {
  return [
    `SL balanza→egreso embudo`,
    `incluido=${summary.incluido}`,
    `evaluadas=${summary.operaciones_evaluadas}`,
    `circuito_R7/SL=${summary.circuito_r7_sl}`,
    `con_segmento_camara_balanza=${summary.con_evidencia_camara_balanza}`,
    `sin_salida_excel=${summary.sin_salida_excel}`,
    `sin_inicio_balanza=${summary.sin_inicio_balanza}`,
    `duracion_invalida=${summary.duracion_invalida}`,
    `duracion_excede_180=${summary.duracion_excede_tope}`,
    `not_ready_scatter=${summary.not_ready_for_scatter}`,
  ].join(' · ')
}

export function summarizeSlBalanzaComiteRejectDetail(
  rows: ExcelOperationSegmentScatterRow[],
  comiteOpts?: SlBalanzaComiteOptions
): Record<SlBalanzaComiteRejectReason, number> {
  const out: Record<SlBalanzaComiteRejectReason, number> = {
    ok: 0,
    sin_salida_excel: 0,
    sin_inicio_balanza: 0,
    inicio_anchored_excel_ric: 0,
    inicio_antes_ingreso_sl: 0,
    fin_no_posterior: 0,
    duracion_corta: 0,
    duracion_excede_180: 0,
  }
  const byOperation = new Map<string, ExcelOperationSegmentScatterRow[]>()
  for (const row of rows) {
    const opId = String(row.external_operation_id ?? row.journey_uid ?? '').trim()
    if (!opId) continue
    const bucket = byOperation.get(opId) ?? []
    bucket.push(row)
    byOperation.set(opId, bucket)
  }
  for (const opRows of byOperation.values()) {
    const metaRow = opRows[0]
    if (!metaRow?.analysis_ready_for_scatter) continue
    const circuito =
      String(metaRow.resolved_executive_circuit_code ?? '').trim() ||
      String(metaRow.truckflow_circuit_code ?? '').trim()
    if (!String(metaRow.external_salida_at ?? '').trim()) {
      out.sin_salida_excel++
      continue
    }
    const operationSegments = operationTimedSegments(opRows)
    const { opSegments, truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
      segments: operationSegments,
      externalIngresoAt: metaRow.external_ingreso_at,
      externalSalidaAt: String(metaRow.external_salida_at ?? ''),
      externalCaladoAt: metaRow.external_calado_at,
      plantaNormalized: metaRow.planta_normalized,
      executiveCircuitCode: circuito,
    })
    const evaluation = evaluateSlBalanzaComitePayload(
      opSegments,
      truckflowPoints,
      String(metaRow.external_salida_at ?? ''),
      metaRow.external_ingreso_at,
      enrichedPoints,
      comiteOpts
    )
    out[evaluation.reason]++
  }
  return out
}

export function formatSlBalanzaComiteRejectDetailLog(
  detail: Record<SlBalanzaComiteRejectReason, number>
): string {
  return [
    `detalle_comité`,
    `ok=${detail.ok}`,
    `sin_inicio=${detail.sin_inicio_balanza}`,
    `excel_ric_como_s1=${detail.inicio_anchored_excel_ric}`,
    `s1_antes_ingreso_sl=${detail.inicio_antes_ingreso_sl}`,
    `salida_antes_s1=${detail.fin_no_posterior}`,
    `duracion_corta=${detail.duracion_corta}`,
    `duracion_mayor_180=${detail.duracion_excede_180}`,
    `sin_salida=${detail.sin_salida_excel}`,
  ].join(' · ')
}

export function summarizeSlScatterAudit(audits: SlScatterAuditRow[]): Record<SlScatterAuditReason, number> {
  const out: Record<SlScatterAuditReason, number> = {
    not_ready_for_scatter: 0,
    sin_salida_excel: 0,
    sin_inicio_balanza: 0,
    duracion_invalida: 0,
    duracion_excede_tope: 0,
    incluido: 0,
  }
  for (const a of audits) out[a.reason]++
  return out
}

export function segmentScatterByDayCsv(rows: SegmentScatterByDayRow[]): string {
  const out = rows.map((r) => ({
    ...r,
    es_ultimo_cuarto: r.es_ultimo_cuarto ? 'true' : 'false',
  }))
  return recordsToCsv([...SEGMENT_SCATTER_BY_DAY_HEADERS], out as unknown as Record<string, unknown>[])
}

export function parseSegmentScatterByDayCsv(csvText: string | undefined | null): SegmentScatterByDayRow[] {
  if (!csvText?.trim()) return []
  const { rows } = parseCsvToRecords(csvText)
  const out: SegmentScatterByDayRow[] = []
  for (const r of rows) {
    const dur = Number(String(r.duracion_minutos ?? '').trim())
    if (!Number.isFinite(dur) || dur <= 0) continue
    const timestamp_inicio = String(r.timestamp_inicio ?? '').trim()
    const franja = normalizeFranjaLabel(String(r.franja_horaria ?? ''), timestamp_inicio)
    const tramo = String(r.tramo_operativo ?? '').trim()
    const segment_from = String(r.segment_from ?? '').trim()
    const circuito = String(r.circuito ?? '').trim()
    out.push({
      journey_id: String(r.journey_id ?? '').trim(),
      patente: String(r.patente ?? '').trim(),
      producto: String(r.producto ?? '').trim(),
      circuito,
      tramo_operativo: tramo,
      sector: String(r.sector ?? '').trim() || tramo,
      planta: String(r.planta ?? '').trim() || inferPlantaFromSegment(circuito, segment_from),
      segment_from,
      segment_to: String(r.segment_to ?? '').trim(),
      timestamp_inicio,
      timestamp_fin: String(r.timestamp_fin ?? '').trim(),
      fecha_tramo: String(r.fecha_tramo ?? '').trim(),
      hora_inicio: String(r.hora_inicio ?? '').trim(),
      franja_horaria: franja,
      color_franja: String(r.color_franja ?? '').trim() || colorForFranja(franja),
      duracion_minutos: dur,
      estado_ejecutivo: String(r.estado_ejecutivo ?? '').trim(),
      es_ultimo_cuarto: String(r.es_ultimo_cuarto ?? '').trim().toLowerCase() === 'true',
      p75_tramo: Number(String(r.p75_tramo ?? '').trim()) || 0,
      p90_tramo: Number(String(r.p90_tramo ?? '').trim()) || 0,
      horario_fuente: (String(r.horario_fuente ?? '').trim() as SegmentScatterByDayRow['horario_fuente']) || '',
      horario_fuente_inicio:
        (String(r.horario_fuente_inicio ?? '').trim() as SegmentScatterByDayRow['horario_fuente_inicio']) ||
        '',
      horario_fuente_fin:
        (String(r.horario_fuente_fin ?? '').trim() as SegmentScatterByDayRow['horario_fuente_fin']) || '',
    })
  }
  return out
}
