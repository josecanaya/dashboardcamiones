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
  const executiveStatus = String(row.executive_status ?? '').trim().toUpperCase()
  if (executiveStatus === 'VALIDO' || executiveStatus === 'PROBABLE' || executiveStatus === 'INCOMPLETO' || executiveStatus === 'ANOMALO' || executiveStatus === 'NO_EVALUABLE') {
    return executiveStatus
  }
  const matrixStatus = String(row.matrix_final_status ?? '').trim().toUpperCase()
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
