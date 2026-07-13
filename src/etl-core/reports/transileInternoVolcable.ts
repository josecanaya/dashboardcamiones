/**
 * Transile interno Ricardone: detección por repeticiones en Volcable 1/2.
 * Regla: >3 pasadas (≥4 visitas), entre pasadas Δ > 20 min y < 3 h; nueva sesión si Δ ≥ 3 h.
 */

import { recordsToCsv } from '../csv'
import type { ExcelOperationWithTruckflowRow } from '../../features/real-truckflow/etlWorkbench/etlExcelFirstMerge'
import type { ClassifiedJourneyForTiming } from '../../features/real-truckflow/etlWorkbench/etlSegmentTiming'
import {
  normalizePlateKey,
  operationalInstantIso,
  parseInstantMs,
  type RawJourneyEventLike,
} from '../../features/real-truckflow/etlWorkbench/auditSlCameraExcelCoverage'
import { argentinaLocalParts } from '../domain/timestamps'
import { isEtlRearCameraDevice } from '../domain/rearDevices'

export const VOLCABLE_TRANSILE_DEVICES = ['RicVolcable1', 'RicVolcable2'] as const

/** Más de 20 minutos entre capturas que cuentan como otra vuelta. */
export const TRANSILE_LAP_MIN_MS = 20 * 60_000
/** Menos de 3 h entre vueltas de la misma sesión; ≥ 3 h abre sesión nueva. */
export const TRANSILE_SESSION_BREAK_MS = 3 * 60 * 60_000
/** Más de tres veces → al menos 4 visitas agrupadas. */
export const TRANSILE_MIN_VISITS = 4
/** Al menos 3 intervalos válidos entre visitas. */
export const TRANSILE_MIN_VALID_LAPS = 3

const INTERNAL_TRANSILE_CIRCUIT_HINTS = new Set([
  'R17', 'R18', 'R19', 'R20', 'R21', 'R22', 'R23', 'R24', 'R25', 'R26', 'R27', 'R28', 'R29', 'R30', 'R31', 'R32', 'R33', 'R34',
])

export type VolcableVisit = {
  instant: string
  ms: number
  deviceCode: string
  journeyUid: string
}

export type TransileInternoSession = {
  session_id: string
  patente: string
  fecha_sesion: string
  visit_count: number
  valid_laps: number
  volcable_devices: string
  session_start: string
  session_end: string
  duration_min: number
  inferred_transile_interno: boolean
  excel_circuit_hint: string
  journey_uids: string
  lap_minutes: string
}

export type TransileInternoVolcableSummary = {
  patentes_con_volcable: number
  sesiones_detectadas: number
  sesiones_transile_interno: number
  visitas_volcable_total: number
}

export type TransileInternoVolcableReport = {
  sessions: TransileInternoSession[]
  summary: TransileInternoVolcableSummary
}

export function isVolcableTransileDevice(deviceCode: string): boolean {
  const d = String(deviceCode ?? '').trim()
  return d === 'RicVolcable1' || d === 'RicVolcable2'
}

function fechaArgentina(iso: string): string {
  return argentinaLocalParts(iso)?.fecha_tramo ?? ''
}

export function clusterVolcableVisits(sorted: VolcableVisit[]): VolcableVisit[] {
  if (!sorted.length) return []
  const out: VolcableVisit[] = []
  let cur = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i]!
    if (v.ms - cur.ms <= TRANSILE_LAP_MIN_MS) {
      if (v.ms < cur.ms) cur = v
      continue
    }
    out.push(cur)
    cur = v
  }
  out.push(cur)
  return out
}

export function splitVolcableVisitSessions(visits: VolcableVisit[]): VolcableVisit[][] {
  if (!visits.length) return []
  const sessions: VolcableVisit[][] = []
  let cur: VolcableVisit[] = [visits[0]!]
  for (let i = 1; i < visits.length; i++) {
    const v = visits[i]!
    const prev = cur[cur.length - 1]!
    if (v.ms - prev.ms >= TRANSILE_SESSION_BREAK_MS) {
      sessions.push(cur)
      cur = [v]
    } else {
      cur.push(v)
    }
  }
  sessions.push(cur)
  return sessions
}

export function evaluateTransileSession(visits: VolcableVisit[]): {
  valid_laps: number
  lapMinutes: number[]
  inferred: boolean
} {
  const lapMinutes: number[] = []
  let valid_laps = 0
  for (let i = 1; i < visits.length; i++) {
    const delta = visits[i]!.ms - visits[i - 1]!.ms
    const min = delta / 60_000
    lapMinutes.push(Math.round(min * 10) / 10)
    if (delta > TRANSILE_LAP_MIN_MS && delta < TRANSILE_SESSION_BREAK_MS) valid_laps++
  }
  const inferred =
    visits.length >= TRANSILE_MIN_VISITS && valid_laps >= TRANSILE_MIN_VALID_LAPS
  return { valid_laps, lapMinutes, inferred }
}

function collectVolcableVisitsFromClassified(
  classified: ClassifiedJourneyForTiming[]
): Map<string, VolcableVisit[]> {
  const byPlate = new Map<string, VolcableVisit[]>()
  for (const cj of classified) {
    const journeyUid = String(cj.journey.journeyUid ?? '').trim()
    const plate = normalizePlateKey(cj.journey.normalizedPlate ?? cj.journey.plate ?? '')
    if (!plate) continue
    for (const e of cj.journey.events) {
      const dev = String(e.deviceCode ?? '').trim()
      if (!isVolcableTransileDevice(dev) || isEtlRearCameraDevice(dev)) continue
      const instant = operationalInstantIso({
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })
      const ms = parseInstantMs(instant)
      if (!Number.isFinite(ms)) continue
      const arr = byPlate.get(plate) ?? []
      arr.push({ instant, ms, deviceCode: dev, journeyUid })
      byPlate.set(plate, arr)
    }
  }
  for (const arr of byPlate.values()) arr.sort((a, b) => a.ms - b.ms)
  return byPlate
}

function collectVolcableVisitsFromRaw(events: RawJourneyEventLike[]): Map<string, VolcableVisit[]> {
  const byPlate = new Map<string, VolcableVisit[]>()
  for (const e of events) {
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!isVolcableTransileDevice(dev) || isEtlRearCameraDevice(dev)) continue
    const plate = normalizePlateKey(e.normalizedPlate ?? e.truckPlate ?? '')
    if (!plate) continue
    const instant = operationalInstantIso(e)
    const ms = parseInstantMs(instant)
    if (!Number.isFinite(ms)) continue
    const arr = byPlate.get(plate) ?? []
    arr.push({ instant, ms, deviceCode: dev, journeyUid: '' })
    byPlate.set(plate, arr)
  }
  for (const arr of byPlate.values()) arr.sort((a, b) => a.ms - b.ms)
  return byPlate
}

function excelCircuitHintForSession(
  plate: string,
  sessionStartMs: number,
  sessionEndMs: number,
  operations: ExcelOperationWithTruckflowRow[]
): string {
  const pad = 2 * 3600_000
  for (const op of operations) {
    if (normalizePlateKey(op.plate_normalized) !== plate) continue
    const codes = String(op.truckflow_circuit_codes ?? '')
      .split(/[|,]/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
    const hit = codes.find((c) => INTERNAL_TRANSILE_CIRCUIT_HINTS.has(c))
    if (!hit) continue
    const ing = parseInstantMs(String(op.external_ingreso_at ?? ''))
    const sal = parseInstantMs(String(op.external_salida_at ?? ''))
    if (!Number.isFinite(ing) && !Number.isFinite(sal)) return hit
    const from = Number.isFinite(ing) ? ing - pad : sessionStartMs - pad
    const to = Number.isFinite(sal) ? sal + pad : sessionEndMs + pad
    if (sessionStartMs <= to && sessionEndMs >= from) return hit
  }
  return ''
}

export function buildTransileInternoVolcableReport(input: {
  classifiedJourneys: ClassifiedJourneyForTiming[]
  rawEvents?: RawJourneyEventLike[]
  operations?: ExcelOperationWithTruckflowRow[]
}): TransileInternoVolcableReport {
  const byPlate =
    input.rawEvents?.length ?
      collectVolcableVisitsFromRaw(input.rawEvents)
    : collectVolcableVisitsFromClassified(input.classifiedJourneys)

  const operations = input.operations ?? []
  const sessions: TransileInternoSession[] = []
  let visitasTotal = 0

  for (const [plate, rawVisits] of byPlate) {
    const clustered = clusterVolcableVisits(rawVisits)
    visitasTotal += clustered.length
    const sessionGroups = splitVolcableVisitSessions(clustered)

    sessionGroups.forEach((group, idx) => {
      const { valid_laps, lapMinutes, inferred } = evaluateTransileSession(group)
      const start = group[0]!
      const end = group[group.length - 1]!
      const devices = [...new Set(group.map((v) => v.deviceCode))].sort().join('|')
      const uids = [...new Set(group.map((v) => v.journeyUid).filter(Boolean))].join('|')
      const fecha = fechaArgentina(start.instant)
      sessions.push({
        session_id: `${plate}_${fecha || 'sin-fecha'}_${idx + 1}`,
        patente: plate,
        fecha_sesion: fecha,
        visit_count: group.length,
        valid_laps,
        volcable_devices: devices,
        session_start: start.instant,
        session_end: end.instant,
        duration_min: Math.round(((end.ms - start.ms) / 60_000) * 10) / 10,
        inferred_transile_interno: inferred,
        excel_circuit_hint: excelCircuitHintForSession(plate, start.ms, end.ms, operations),
        journey_uids: uids,
        lap_minutes: lapMinutes.join('|'),
      })
    })
  }

  sessions.sort((a, b) => a.session_start.localeCompare(b.session_start))

  const transileCount = sessions.filter((s) => s.inferred_transile_interno).length
  return {
    sessions,
    summary: {
      patentes_con_volcable: byPlate.size,
      sesiones_detectadas: sessions.length,
      sesiones_transile_interno: transileCount,
      visitas_volcable_total: visitasTotal,
    },
  }
}

const SESSION_HEADERS = [
  'session_id',
  'patente',
  'fecha_sesion',
  'visit_count',
  'valid_laps',
  'volcable_devices',
  'session_start',
  'session_end',
  'duration_min',
  'inferred_transile_interno',
  'excel_circuit_hint',
  'journey_uids',
  'lap_minutes',
] as const

export function transileInternoVolcableSessionsCsv(sessions: TransileInternoSession[]): string {
  const rows = sessions.map((s) => ({
    ...s,
    inferred_transile_interno: s.inferred_transile_interno ? 'true' : 'false',
  }))
  return recordsToCsv([...SESSION_HEADERS], rows as unknown as Record<string, unknown>[])
}

export function transileInternoVolcableSummaryCsv(summary: TransileInternoVolcableSummary): string {
  return recordsToCsv(Object.keys(summary), [summary as unknown as Record<string, unknown>])
}

export function formatTransileInternoVolcableLog(summary: TransileInternoVolcableSummary): string {
  return [
    'Transile interno Volcable',
    `patentes=${summary.patentes_con_volcable}`,
    `sesiones=${summary.sesiones_detectadas}`,
    `transile_inferido=${summary.sesiones_transile_interno}`,
    `visitas=${summary.visitas_volcable_total}`,
  ].join(' · ')
}
