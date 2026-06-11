import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords } from './etlCsvParse'
import { inferPlantaFromSegment } from './etlSectorOccupancy30min'
import { formatTransitionLabel, repairSlBalanzaScatterSegment } from './etlSegmentTiming'
import type { ExcelOperationSegmentScatterRow } from './etlExcelFirstMerge'
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
  /** truckflow medido o inferido desde salida Excel (S5 proxy). */
  horario_fuente: 'truckflow' | 'excel_inferido' | ''
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
  horario_fuente?: 'truckflow' | 'excel_inferido' | ''
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Fecha y hora local del navegador/ETL (misma convención que el resto del dashboard). */
export function segmentStartLocalParts(iso: string): { fecha_tramo: string; hora_inicio: string } | null {
  const ts = Date.parse(String(iso ?? '').trim())
  if (!Number.isFinite(ts)) return null
  const d = new Date(ts)
  const fecha_tramo = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const hora_inicio = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return { fecha_tramo, hora_inicio }
}

/** 00–06 · 06–12 · 12–18 · 18–24 */
export function resolveFranjaHoraria(iso: string): FranjaHoraria | '' {
  const ts = Date.parse(String(iso ?? '').trim())
  if (!Number.isFinite(ts)) return ''
  const minutes = new Date(ts).getHours() * 60 + new Date(ts).getMinutes()
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

export function normalizeExcelSegmentForScatterByDay(row: ExcelOperationSegmentScatterRow): SegmentScatterByDaySource | null {
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

  const repaired = repairSlBalanzaScatterSegment({
    segment_from: from,
    segment_to: to,
    segment_start_time: start,
    segment_end_time: end || start,
    segment_duration_min: duration,
    external_salida_at: row.external_salida_at,
  })
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
    }
  }

  if (
    from === 'SL_BALANZA_INGRESO' &&
    to === 'SL_BALANZA_SALIDA' &&
    (duration > 180 || minutesBetweenScatter(start, end || start) > 180)
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
  const ms = Date.parse(isoB) - Date.parse(isoA)
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
] as const

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
    })
  }
  return out
}
