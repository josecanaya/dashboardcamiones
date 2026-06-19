/**
 * Cruce Excel-first vs lecturas crudas por cámara / punto SL (catálogo San Lorenzo).
 * Misma idea que audit S1, extendido S0→S7 para diagnóstico cámara por cámara.
 */

import {
  listSanLorenzoInstalledCameras,
  lookupSanLorenzoCameraByDevice,
  lookupSanLorenzoSectorFallback,
} from '../../../data/sanLorenzoCameraCatalog'

export type RawJourneyEventLike = {
  truckPlate?: string
  normalizedPlate?: string
  deviceCode?: string
  device_code?: string
  sectorCode?: string
  sector_code?: string
  occurredAt?: string
  occurred_at?: string
  createdAt?: string
  created_at?: string
  modifiedAt?: string
  modified_at?: string
  recordedAt?: string
  recorded_at?: string
}

export type TimedSegmentLike = {
  segment_from: string
  segment_to: string
  segment_start_time?: string
  segment_end_time?: string
}

export type ExcelOperationLike = {
  operationId: string
  plate: string
  executiveCircuitCode: string
  externalIngresoAt?: string
  externalSalidaAt?: string
  analysisReadyForScatter: boolean
  segments: TimedSegmentLike[]
}

export type SlCameraAuditSlot = {
  slotId: string
  logicalCode: string
  /** Punto lógico en segmentos merge (puede diferir de logicalCode en modo por-dispositivo). */
  pipelineLogicalCode: string
  label: string
  deviceCodes: Set<string>
  sectorCodes: Set<string>
  /** Solo modo --por-dispositivo */
  deviceCode?: string
}

export type SlCameraGapClass =
  | 'ok_both'
  | 'raw_no_pipeline'
  | 'pipeline_no_raw'
  | 'neither'
  | 'raw_outside_window_only'

export type SlCameraOpSlotAuditRow = {
  operationId: string
  plate: string
  circuit: string
  analysisReadyForScatter: boolean
  slotId: string
  logicalCode: string
  slotLabel: string
  deviceCode?: string
  rawInExcelWindow: boolean
  rawAnytimeForPlate: boolean
  rawCountInWindow: number
  rawBestInstant: string
  pipelineHasPoint: boolean
  gapClass: SlCameraGapClass
  notes: string
}

export function normalizePlateKey(plate: string): string {
  return String(plate ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function parseInstantMs(iso: string): number {
  const t = Date.parse(String(iso ?? '').trim())
  return Number.isFinite(t) ? t : Number.NaN
}

export function operationalInstantIso(
  e: RawJourneyEventLike,
  preferCreatedAt = true
): string {
  const chain = preferCreatedAt
    ? [
        e.createdAt ?? e.created_at,
        e.modifiedAt ?? e.modified_at,
        e.recordedAt ?? e.recorded_at,
        e.occurredAt ?? e.occurred_at,
      ]
    : [e.occurredAt ?? e.occurred_at, e.createdAt ?? e.created_at]
  for (const iso of chain) {
    const s = String(iso ?? '').trim()
    if (s && Number.isFinite(parseInstantMs(s))) return s
  }
  return ''
}

/** Puntos SL KPI (S0–S7) con cámaras frontales instaladas; opcional traseras y S10. */
export function buildSlKpiCameraAuditSlots(options?: {
  includeRear?: boolean
  includeLiquids?: boolean
}): SlCameraAuditSlot[] {
  const includeRear = options?.includeRear === true
  const includeLiquids = options?.includeLiquids === true
  const byLogical = new Map<string, SlCameraAuditSlot>()

  for (const cam of listSanLorenzoInstalledCameras()) {
    if (!includeRear && cam.rearExcluded) continue
    if (!includeLiquids && cam.logicalSector === 'S10') continue
    if (cam.logicalCode.includes('EXCLUIDA')) continue

    let slot =
      byLogical.get(cam.logicalCode) ??
      {
        slotId: cam.logicalSector,
        logicalCode: cam.logicalCode,
        pipelineLogicalCode: cam.logicalCode,
        label: cam.label.replace(/\s*\(frente\)$/i, '').replace(/\s*\(trasera\)$/i, ''),
        deviceCodes: new Set<string>(),
        sectorCodes: new Set<string>(),
      }
    slot.deviceCodes.add(cam.deviceCode)
    slot.sectorCodes.add(cam.sectorCode)
    slot.sectorCodes.add(cam.logicalSector)
    slot.sectorCodes.add(`1-${cam.logicalSector}`)
    byLogical.set(cam.logicalCode, slot)
  }

  const order = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S7', 'S10']
  return [...byLogical.values()].sort(
    (a, b) => order.indexOf(a.slotId) - order.indexOf(b.slotId) || a.logicalCode.localeCompare(b.logicalCode)
  )
}

/** Una fila de auditoría por deviceCode físico (diagnóstico fino). */
export function buildPerDeviceAuditSlots(options?: {
  includeRear?: boolean
  includeLiquids?: boolean
}): SlCameraAuditSlot[] {
  const includeRear = options?.includeRear === true
  const includeLiquids = options?.includeLiquids === true
  const order = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S7', 'S10']
  return listSanLorenzoInstalledCameras()
    .filter((cam) => {
      if (!includeRear && cam.rearExcluded) return false
      if (!includeLiquids && cam.logicalSector === 'S10') return false
      return true
    })
    .map((cam) => ({
      slotId: cam.logicalSector,
      logicalCode: cam.logicalCode,
      pipelineLogicalCode: cam.logicalCode.replace(/_TRASERA_EXCLUIDA$/, '').replace(/_EXCLUIDA$/, ''),
      label: cam.label,
      deviceCode: cam.deviceCode,
      deviceCodes: new Set([cam.deviceCode]),
      sectorCodes: new Set([cam.sectorCode, cam.logicalSector, `1-${cam.logicalSector}`]),
    }))
    .sort(
      (a, b) =>
        order.indexOf(a.slotId) - order.indexOf(b.slotId) ||
        String(a.deviceCode).localeCompare(String(b.deviceCode))
    )
}

export function isRawEventForSlot(e: RawJourneyEventLike, slot: SlCameraAuditSlot): boolean {
  const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
  if (dev && slot.deviceCodes.has(dev)) return true

  const byDev = lookupSanLorenzoCameraByDevice(dev)
  if (byDev && byDev.logicalCode === slot.logicalCode) {
    if (!byDev.rearExcluded || slot.deviceCodes.has(dev)) return true
  }

  const sec = String(e.sectorCode ?? e.sector_code ?? '').trim()
  const secUp = sec.toUpperCase()
  if (sec && slot.sectorCodes.has(sec)) return true
  if (secUp && slot.sectorCodes.has(secUp)) return true

  const fb = lookupSanLorenzoSectorFallback(secUp)
  if (fb && fb.logicalCode === slot.logicalCode) return true

  return false
}

export function pipelineHasLogicalPoint(
  segments: TimedSegmentLike[],
  logicalCode: string
): boolean {
  const code = String(logicalCode ?? '').trim()
  if (!code) return false
  for (const s of segments) {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    if (from === code || to === code) return true
  }
  return false
}

export function excelWindowMs(op: ExcelOperationLike, paddingHours = 6): {
  fromMs: number
  toMs: number
} {
  const ing = parseInstantMs(op.externalIngresoAt ?? '')
  const sal = parseInstantMs(op.externalSalidaAt ?? '')
  const pad = paddingHours * 3600_000
  let fromMs = Number.isFinite(ing) ? ing - pad : Number.NaN
  let toMs = Number.isFinite(sal) ? sal + pad : Number.NaN
  if (!Number.isFinite(fromMs) && Number.isFinite(sal)) fromMs = sal - 48 * 3600_000
  if (!Number.isFinite(toMs) && Number.isFinite(ing)) toMs = ing + 48 * 3600_000
  return { fromMs, toMs }
}

export function indexSlotEventsByPlate(
  events: RawJourneyEventLike[],
  slot: SlCameraAuditSlot,
  preferCreatedAt = true
): Map<string, Array<{ instant: string; ms: number; deviceCode: string }>> {
  const map = new Map<string, Array<{ instant: string; ms: number; deviceCode: string }>>()
  for (const e of events) {
    if (!isRawEventForSlot(e, slot)) continue
    const plate =
      normalizePlateKey(e.normalizedPlate ?? '') || normalizePlateKey(e.truckPlate ?? '')
    if (!plate) continue
    const instant = operationalInstantIso(e, preferCreatedAt)
    const ms = parseInstantMs(instant)
    if (!Number.isFinite(ms)) continue
    const deviceCode = String(e.deviceCode ?? e.device_code ?? '').trim()
    const arr = map.get(plate) ?? []
    arr.push({ instant, ms, deviceCode })
    map.set(plate, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => a.ms - b.ms)
  return map
}

export function findRawInWindow(
  byPlate: Map<string, Array<{ instant: string; ms: number }>>,
  plate: string,
  fromMs: number,
  toMs: number
): { count: number; bestInstant: string } {
  const key = normalizePlateKey(plate)
  const hits = byPlate.get(key) ?? []
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { count: hits.length, bestInstant: hits[0]?.instant ?? '' }
  }
  const inWin = hits.filter((h) => h.ms >= fromMs && h.ms <= toMs)
  return { count: inWin.length, bestInstant: inWin[0]?.instant ?? '' }
}

export function auditExcelOperationsAgainstSlCameraSlots(
  operations: ExcelOperationLike[],
  events: RawJourneyEventLike[],
  slots: SlCameraAuditSlot[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number }
): SlCameraOpSlotAuditRow[] {
  const preferCreatedAt = opts?.preferCreatedAt !== false
  const padding = opts?.windowPaddingHours ?? 6
  const indexes = slots.map((slot) => ({
    slot,
    byPlate: indexSlotEventsByPlate(events, slot, preferCreatedAt),
  }))

  const rows: SlCameraOpSlotAuditRow[] = []
  for (const op of operations) {
    const { fromMs, toMs } = excelWindowMs(op, padding)
    for (const { slot, byPlate } of indexes) {
      const plateKey = normalizePlateKey(op.plate)
      const anytime = (byPlate.get(plateKey) ?? []).length > 0
      const { count, bestInstant } = findRawInWindow(byPlate, op.plate, fromMs, toMs)
      const rawInWindow = count > 0
      const pipelineHasPoint = pipelineHasLogicalPoint(
        op.segments,
        slot.pipelineLogicalCode ?? slot.logicalCode
      )

      let gapClass: SlCameraGapClass = 'neither'
      let notes = ''
      if (rawInWindow && pipelineHasPoint) gapClass = 'ok_both'
      else if (rawInWindow && !pipelineHasPoint) {
        gapClass = 'raw_no_pipeline'
        notes = `${slot.slotId} crudo en ventana Excel; merge sin punto ${slot.logicalCode}`
      } else if (!rawInWindow && anytime) {
        gapClass = 'raw_outside_window_only'
        notes = `Lecturas ${slot.slotId} para patente fuera de ventana ingreso/salida Excel`
      } else if (!rawInWindow && pipelineHasPoint) {
        gapClass = 'pipeline_no_raw'
        notes = `Pipeline con ${slot.logicalCode} sin lectura cruda en ventana (rollup/inferido)`
      } else {
        gapClass = 'neither'
        notes = anytime ? `${slot.slotId} fuera de ventana` : `Sin lectura cruda ${slot.slotId}`
      }
      if (!op.analysisReadyForScatter && (rawInWindow || pipelineHasPoint)) {
        notes += '; analysis_ready_for_scatter=false'
      }

      rows.push({
        operationId: op.operationId,
        plate: op.plate,
        circuit: op.executiveCircuitCode,
        analysisReadyForScatter: op.analysisReadyForScatter,
        slotId: slot.slotId,
        logicalCode: slot.logicalCode,
        slotLabel: slot.label,
        deviceCode: slot.deviceCode,
        rawInExcelWindow: rawInWindow,
        rawAnytimeForPlate: anytime,
        rawCountInWindow: count,
        rawBestInstant: bestInstant,
        pipelineHasPoint,
        gapClass,
        notes,
      })
    }
  }
  return rows
}

export type SlCameraSlotSummary = {
  slotId: string
  logicalCode: string
  slotLabel: string
  operations: number
  rawInWindow: number
  pipelineHasPoint: number
  rawYesPipelineNo: number
  pipelineYesRawNo: number
  rawOutsideWindowOnly: number
  okBoth: number
  /** Lecturas crudas totales en el archivo (todas las patentes). */
  rawEventsInFile: number
}

export function summarizeSlCameraAuditBySlot(
  rows: SlCameraOpSlotAuditRow[],
  rawCountsBySlot?: Map<string, number>
): SlCameraSlotSummary[] {
  const bySlot = new Map<string, SlCameraOpSlotAuditRow[]>()
  for (const r of rows) {
    const key = r.deviceCode ? `dev:${r.deviceCode}` : r.logicalCode
    const arr = bySlot.get(key) ?? []
    arr.push(r)
    bySlot.set(key, arr)
  }
  const out: SlCameraSlotSummary[] = []
  for (const [, slotRows] of bySlot) {
    const head = slotRows[0]!
    out.push({
      slotId: head.slotId,
      logicalCode: head.logicalCode,
      slotLabel: head.slotLabel,
      operations: slotRows.length,
      rawInWindow: slotRows.filter((r) => r.rawInExcelWindow).length,
      pipelineHasPoint: slotRows.filter((r) => r.pipelineHasPoint).length,
      rawYesPipelineNo: slotRows.filter((r) => r.gapClass === 'raw_no_pipeline').length,
      pipelineYesRawNo: slotRows.filter((r) => r.gapClass === 'pipeline_no_raw').length,
      rawOutsideWindowOnly: slotRows.filter((r) => r.gapClass === 'raw_outside_window_only').length,
      okBoth: slotRows.filter((r) => r.gapClass === 'ok_both').length,
      rawEventsInFile: rawCountsBySlot?.get(head.deviceCode ?? head.logicalCode) ?? 0,
    })
  }
  const order = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S7', 'S10']
  out.sort((a, b) => order.indexOf(a.slotId) - order.indexOf(b.slotId))
  return out
}

export function slCameraAuditToCsv(rows: SlCameraOpSlotAuditRow[]): string {
  const header = [
    'external_operation_id',
    'plate',
    'circuit',
    'analysis_ready_for_scatter',
    'device_code',
    'slot_id',
    'logical_code',
    'slot_label',
    'raw_in_excel_window',
    'raw_anytime_plate',
    'raw_count_in_window',
    'raw_best_instant',
    'pipeline_has_logical_point',
    'gap_class',
    'notes',
  ]
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.operationId,
        r.plate,
        r.circuit,
        r.analysisReadyForScatter,
        r.deviceCode ?? '',
        r.slotId,
        r.logicalCode,
        r.slotLabel,
        r.rawInExcelWindow,
        r.rawAnytimeForPlate,
        r.rawCountInWindow,
        r.rawBestInstant,
        r.pipelineHasPoint,
        r.gapClass,
        r.notes,
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n')
}

export function formatSlCameraAuditSummaryLog(summaries: SlCameraSlotSummary[]): string {
  const lines = ['=== Diagnóstico SL cámara por cámara (Excel vs crudo) ===']
  for (const s of summaries) {
    const title = s.slotLabel.includes('SLZ') ? s.slotLabel : `${s.slotId} ${s.slotLabel}`
    lines.push(
      [
        title,
        `ops=${s.operations}`,
        `crudo_ventana=${s.rawInWindow}`,
        `pipeline=${s.pipelineHasPoint}`,
        `crudo_si_pipeline_no=${s.rawYesPipelineNo}`,
        `pipeline_si_crudo_no=${s.pipelineYesRawNo}`,
        `ok=${s.okBoth}`,
        `lecturas_archivo=${s.rawEventsInFile}`,
      ].join(' | ')
    )
  }
  return lines.join('\n')
}
