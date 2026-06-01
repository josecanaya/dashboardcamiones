import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { MAX_DURATION_MINUTES } from '../../../config/durationBounds'

/** Duración mínima operativa del circuito completo (excluye ruido / falsos positivos). */
export const MIN_CIRCUIT_TOTAL_DURATION_MINUTES = 3
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import { recordsToCsv } from './etlCsv'
import { isEtlRearCameraDevice } from './etlRearDevices'
import { EXECUTIVE_CIRCUIT_ORDER } from './finalCircuitScoring'
import type { CommitteeGroup } from './committeeClassification'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'

export type ClassifiedJourneyForCircuitTiming = ClassifiedJourneyForTiming & {
  executiveStatus?: string
  validDetail?: string
  circuitName?: string
}

export type CircuitTimingJourneyRow = {
  journeyId: string
  plate: string
  executiveCircuitCode: string
  circuitName: string
  executiveStatus: string
  validDetail: string
  startTime: string
  endTime: string
  totalDurationMin: number
  eventCount: number
}

export type CircuitTimingSummaryRow = {
  executiveCircuitCode: string
  circuitName: string
  executiveStatus: string
  nJourneys: number
  meanTotalMin: number
  stdTotalMin: number
  medianTotalMin: number
  p90TotalMin: number
  minTotalMin: number
  maxTotalMin: number
  q1TotalMin: number
  q3TotalMin: number
  iqrTotalMin: number
  minPlate: string
  maxPlate: string
}

export type CircuitTimingIndex = {
  journeys: CircuitTimingJourneyRow[]
  summaries: CircuitTimingSummaryRow[]
  circuitCodes: string[]
}

function journeyFrontEventsSorted(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode)).sort(compareRealEvents)
}

function isExcludedLogicalCode(code: string): boolean {
  if (!code) return true
  if (code.includes('TRASERA')) return true
  return false
}

function usefulFrontEvents(j: ReconstructedRealJourney) {
  return journeyFrontEventsSorted(j).filter((e) => {
    const code = normalizeRealEventPoint(e).logicalCode
    return !isExcludedLogicalCode(code)
  })
}

function minutesBetweenIso(isoA: string, isoB: string): number {
  const a = Date.parse(isoA)
  const b = Date.parse(isoB)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN
  return (b - a) / 60000
}

export function isValidCircuitTotalDuration(minutes: number): boolean {
  return (
    Number.isFinite(minutes) &&
    minutes > MIN_CIRCUIT_TOTAL_DURATION_MINUTES &&
    minutes <= MAX_DURATION_MINUTES
  )
}

export function extractJourneyCircuitTotal(
  journey: ReconstructedRealJourney
): Omit<CircuitTimingJourneyRow, 'executiveCircuitCode' | 'circuitName' | 'executiveStatus' | 'validDetail'> | null {
  const events = usefulFrontEvents(journey)
  if (events.length < 2) return null
  const startTime = String(events[0]!.occurredAt ?? '')
  const endTime = String(events[events.length - 1]!.occurredAt ?? '')
  const totalDurationMin = minutesBetweenIso(startTime, endTime)
  if (!isValidCircuitTotalDuration(totalDurationMin)) return null
  return {
    journeyId: journey.journeyUid,
    plate: journey.normalizedPlate || journey.plate,
    startTime,
    endTime,
    totalDurationMin,
    eventCount: events.length,
  }
}

function sortCircuitCodes(codes: string[]): string[] {
  const order = EXECUTIVE_CIRCUIT_ORDER as readonly string[]
  return [...codes].sort((a, b) => {
    const ia = order.indexOf(a as (typeof order)[number])
    const ib = order.indexOf(b as (typeof order)[number])
    const ai = ia >= 0 ? ia : 999
    const bi = ib >= 0 ? ib : 999
    if (ai !== bi) return ai - bi
    return a.localeCompare(b, 'es')
  })
}

function dominantExecutiveStatus(rows: CircuitTimingJourneyRow[]): string {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const k = String(row.executiveStatus ?? '').trim() || 'UNKNOWN'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best = 'UNKNOWN'
  let bestN = -1
  for (const [status, n] of counts.entries()) {
    if (n > bestN) {
      best = status
      bestN = n
    }
  }
  return best
}

function aggregateCircuitSummary(
  executiveCircuitCode: string,
  rows: CircuitTimingJourneyRow[]
): CircuitTimingSummaryRow {
  const durations = rows.map((r) => r.totalDurationMin)
  const stats = computeStayTimeStats(durations)
  let minRow = rows[0]!
  let maxRow = rows[0]!
  for (const row of rows) {
    if (row.totalDurationMin < minRow.totalDurationMin) minRow = row
    if (row.totalDurationMin > maxRow.totalDurationMin) maxRow = row
  }
  const circuitName = rows.find((r) => r.circuitName)?.circuitName ?? ''
  return {
    executiveCircuitCode,
    circuitName,
    executiveStatus: dominantExecutiveStatus(rows),
    nJourneys: stats.count,
    meanTotalMin: stats.mean,
    stdTotalMin: stats.std,
    medianTotalMin: stats.median,
    p90TotalMin: stats.p90,
    minTotalMin: stats.min,
    maxTotalMin: stats.max,
    q1TotalMin: stats.q1,
    q3TotalMin: stats.q3,
    iqrTotalMin: stats.iqr,
    minPlate: minRow.plate,
    maxPlate: maxRow.plate,
  }
}

export function buildCircuitTimingIndex(
  journeys: ClassifiedJourneyForCircuitTiming[],
  options?: { committeeGroups?: CommitteeGroup[] }
): CircuitTimingIndex {
  const allowedGroups = new Set(options?.committeeGroups ?? ['COMPLETOS'])
  const journeyRows: CircuitTimingJourneyRow[] = []

  for (const row of journeys) {
    if (!allowedGroups.has(row.committeeGroup)) continue
    const executiveCircuitCode = String(row.executiveCircuitCode ?? '').trim()
    if (!executiveCircuitCode) continue
    const extracted = extractJourneyCircuitTotal(row.journey)
    if (!extracted) continue
    journeyRows.push({
      ...extracted,
      executiveCircuitCode,
      circuitName: String(row.circuitName ?? '').trim(),
      executiveStatus: String(row.executiveStatus ?? '').trim(),
      validDetail: String(row.validDetail ?? '').trim(),
    })
  }

  const byCircuit = new Map<string, CircuitTimingJourneyRow[]>()
  for (const row of journeyRows) {
    const list = byCircuit.get(row.executiveCircuitCode) ?? []
    list.push(row)
    byCircuit.set(row.executiveCircuitCode, list)
  }

  const summaries = sortCircuitCodes([...byCircuit.keys()]).map((code) =>
    aggregateCircuitSummary(code, byCircuit.get(code) ?? [])
  )

  return {
    journeys: journeyRows,
    summaries,
    circuitCodes: summaries.map((s) => s.executiveCircuitCode),
  }
}

export function aggregateCircuitTimingSummaries(
  journeyRows: CircuitTimingJourneyRow[]
): CircuitTimingSummaryRow[] {
  const byCircuit = new Map<string, CircuitTimingJourneyRow[]>()
  for (const row of journeyRows) {
    const code = String(row.executiveCircuitCode ?? '').trim()
    if (!code) continue
    if (!isValidCircuitTotalDuration(row.totalDurationMin)) continue
    const list = byCircuit.get(code) ?? []
    list.push(row)
    byCircuit.set(code, list)
  }
  return sortCircuitCodes([...byCircuit.keys()]).map((code) =>
    aggregateCircuitSummary(code, byCircuit.get(code) ?? [])
  )
}

export function circuitTimingJourneysFromCsvRows(
  rows: Record<string, string>[]
): CircuitTimingJourneyRow[] {
  const out: CircuitTimingJourneyRow[] = []
  for (const r of rows) {
    const executiveCircuitCode = String(r.executive_circuit_code ?? '').trim()
    const journeyId = String(r.journey_id ?? '').trim()
    if (!executiveCircuitCode || !journeyId) continue
    const totalDurationMin = Number(r.total_duration_min)
    if (!isValidCircuitTotalDuration(totalDurationMin)) continue
    out.push({
      journeyId,
      plate: String(r.plate ?? ''),
      executiveCircuitCode,
      circuitName: String(r.circuit_name ?? ''),
      executiveStatus: String(r.executive_status ?? ''),
      validDetail: String(r.valid_detail ?? ''),
      startTime: String(r.start_time ?? ''),
      endTime: String(r.end_time ?? ''),
      totalDurationMin,
      eventCount: Number(r.event_count) || 0,
    })
  }
  return out
}

function fmtMin(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : ''
}

export function circuitTimingSummaryCsv(index: CircuitTimingIndex): string {
  const headers = [
    'executive_circuit_code',
    'circuit_name',
    'executive_status',
    'n_journeys',
    'mean_total_min',
    'std_total_min',
    'median_total_min',
    'p90_total_min',
    'min_total_min',
    'max_total_min',
    'q1_total_min',
    'q3_total_min',
    'iqr_total_min',
    'min_plate',
    'max_plate',
  ]
  const rows = index.summaries
    .filter((s) => s.nJourneys > 0)
    .map((s) => ({
      executive_circuit_code: s.executiveCircuitCode,
      circuit_name: s.circuitName,
      executive_status: s.executiveStatus,
      n_journeys: s.nJourneys,
      mean_total_min: fmtMin(s.meanTotalMin),
      std_total_min: fmtMin(s.stdTotalMin),
      median_total_min: fmtMin(s.medianTotalMin),
      p90_total_min: fmtMin(s.p90TotalMin),
      min_total_min: fmtMin(s.minTotalMin),
      max_total_min: fmtMin(s.maxTotalMin),
      q1_total_min: fmtMin(s.q1TotalMin),
      q3_total_min: fmtMin(s.q3TotalMin),
      iqr_total_min: fmtMin(s.iqrTotalMin),
      min_plate: s.minPlate,
      max_plate: s.maxPlate,
    }))
  return recordsToCsv(headers, rows)
}

export function circuitTimingJourneysCsv(index: CircuitTimingIndex): string {
  const headers = [
    'journey_id',
    'plate',
    'executive_circuit_code',
    'circuit_name',
    'executive_status',
    'valid_detail',
    'start_time',
    'end_time',
    'total_duration_min',
    'event_count',
  ]
  const rows = index.journeys.map((j) => ({
    journey_id: j.journeyId,
    plate: j.plate,
    executive_circuit_code: j.executiveCircuitCode,
    circuit_name: j.circuitName,
    executive_status: j.executiveStatus,
    valid_detail: j.validDetail,
    start_time: j.startTime,
    end_time: j.endTime,
    total_duration_min: fmtMin(j.totalDurationMin),
    event_count: j.eventCount,
  }))
  return recordsToCsv(headers, rows)
}
