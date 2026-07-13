/**
 * Fases A0–A4: líquidos Ric (RicCalLiq), SL1/SL5 (S10 Ren*), puente Ric↔SL.
 */

import { makeTable, tableToCsv, type TypedTable } from '../../../etl-core/typedTable'
import type { ExcelOperationWithTruckflowRow } from './etlExcelFirstMerge'
import { inferCircuitFromExternalMovimiento } from './etlPlatformCircuitInference'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import {
  auditExcelOperationsAgainstSlCameraSlots,
  type RawJourneyEventLike,
  type SlCameraAuditSlot,
  type SlCameraOpSlotAuditRow,
  normalizePlateKey,
  operationalInstantIso,
} from './auditSlCameraExcelCoverage'
import {
  argentinaLocalParts,
  formatArgentinaIsoFromMs,
  parseTimestampMs,
} from './etlTimestampNormalize'
import {
  RIC_LIQUIDO_CAMERA,
  buildSlLiquidS10PerDeviceSlots,
  buildSlLiquidS10UnifiedSlot,
  isExcelLiquidProductName,
  isPermittedAceiteLiquidDischargePlatform,
  isRicLiquidDespachoCode,
  isRicLiquidReceptionCode,
  isSlLiquidCircuit,
  isSlLiquidS10Device,
  isTransileExternoRicSlCode,
  slLiquidS10DeviceRole,
} from './slLiquidCameras'

export type RicCalLiqCohort =
  | 'liquido_recepcion_ric'
  | 'liquido_despacho_ric'
  | 'transile_externo_ric_sl'
  | 'despacho_generico_calada'
  | 'sl_liquido_san_lorenzo'
  | 'ambiguo_riccalliq'
  | 'sin_riccalliq'

export type RicCalLiqCohortRow = {
  external_operation_id: string
  plate_normalized: string
  resolved_executive_circuit: string
  resolved_product: string
  resolved_platform: string
  cohort: RicCalLiqCohort
  riccalliq_in_truckflow: boolean
  s10_liquid_in_truckflow: boolean
  sl_circuit: string
  bridge_ric_sl: boolean
  truckflow_circuit_codes: string
  excel_planta: string
  notes: string
}

export type SlLiquidS10OpSummary = {
  external_operation_id: string
  plate_normalized: string
  excel_planta: string
  source_date: string
  circuit: string
  excel_platform: string
  audit_site: 'ricardone_calada' | 'san_lorenzo_s10'
  required_camera: string
  s10_captured: boolean
  s10_devices_hit: string
  s10_roles: string
  riccalliq_captured: boolean
  unified_slot_gap: string
  expected_sl_role: 'descarga' | 'carga' | 'cualquiera' | 'ric_calada'
  truckflow_match_quality: string
  excel_in_truckflow_window: boolean
  matched_journey_uids: string
  analysis_ready_for_scatter: boolean
  camera_best_instant: string
}

export type AceiteTruckflowExcelCrossRow = {
  external_operation_id: string
  plate_normalized: string
  source_date: string
  audit_site: string
  required_camera: string
  excel_planta: string
  excel_platform: string
  truckflow_matched: boolean
  camera_captured: boolean
  match_quality: string
  gap_note: string
}

export type LiquidMovementsSummary = {
  riccalliq_operations: number
  by_cohort: Record<RicCalLiqCohort, number>
  aceite_platform_excel_ops: number
  aceite_platform_s10_captured: number
  aceite_platform_excel_with_truckflow: number
  truckflow_s10_descarga_events: number
  truckflow_s10_with_excel_match: number
  sl1_sl5_operations: number
  sl1_sl5_s10_captured: number
  bridge_ric_sl_count: number
}

export type LiquidMovementsReport = {
  ricCalLiqRows: RicCalLiqCohortRow[]
  slLiquidRows: SlLiquidS10OpSummary[]
  aceiteTruckflowExcelRows: AceiteTruckflowExcelCrossRow[]
  slSlotAuditRows: SlCameraOpSlotAuditRow[]
  summary: LiquidMovementsSummary
}

function productFamilyLiquid(product: string, platform: string): boolean {
  return isExcelLiquidProductName(product, platform)
}

function operationCircuitCodes(op: ExcelOperationWithTruckflowRow): string[] {
  return String(op.truckflow_circuit_codes ?? '')
    .split(/[|,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
}

/** Circuito ejecutivo para líquidos: Excel (plataforma/planta) antes que Truckflow. */
export function executiveCircuitForExcelOperation(op: ExcelOperationWithTruckflowRow): string {
  const stored = String(op.resolved_executive_circuit_code ?? '').trim().toUpperCase()
  if (stored) return stored

  const inferred = inferCircuitFromExternalMovimiento({
    platform_normalized: op.platform_normalized,
    plataforma_original: op.plataforma_original,
    planta_normalized: op.planta_normalized,
    movement_type: op.movement_type,
    movement_type_detail: op.movement_type_detail,
    mov: op.mov,
  })
  if (inferred?.circuit_code) return inferred.circuit_code.toUpperCase()

  const codes = operationCircuitCodes(op)
  const plant = String(op.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'RICARDONE') {
    const ric = codes.find((c) => isRicLiquidReceptionCode(c) || isRicLiquidDespachoCode(c))
    if (ric) return ric
    if (codes.some((c) => isSlLiquidCircuit(c))) {
      const again = inferCircuitFromExternalMovimiento({
        platform_normalized: op.platform_normalized,
        plataforma_original: op.plataforma_original,
        planta_normalized: op.planta_normalized,
        movement_type: op.movement_type,
        movement_type_detail: op.movement_type_detail,
        mov: op.mov,
      })
      if (again?.circuit_code) return again.circuit_code.toUpperCase()
    }
  }

  const sl = codes.find((c) => isSlLiquidCircuit(c))
  if (sl) return sl
  return codes[0] ?? String(op.resolved_circuit_family ?? '').trim().toUpperCase()
}

function primaryCircuit(op: ExcelOperationWithTruckflowRow): string {
  return executiveCircuitForExcelOperation(op)
}

function operationIsSlLiquid(op: ExcelOperationWithTruckflowRow): boolean {
  return isSlLiquidCircuit(executiveCircuitForExcelOperation(op))
}

function operationOnPermittedAceiteDischargePlatform(op: ExcelOperationWithTruckflowRow): boolean {
  return isPermittedAceiteLiquidDischargePlatform(
    op.platform_normalized ?? op.resolved_platform,
    op.plataforma_original
  )
}

function excelOpsForLiquidAudit(ops: ExcelOperationWithTruckflowRow[]): ExcelOperationWithTruckflowRow[] {
  const seen = new Set<string>()
  const out: ExcelOperationWithTruckflowRow[] = []
  for (const op of ops) {
    if (!isLiquidExcelAuditOperation(op)) continue
    const id = String(op.external_operation_id ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(op)
  }
  return out
}

function isRicardoneLiquidExcelOp(op: ExcelOperationWithTruckflowRow): boolean {
  const plant = String(op.planta_normalized ?? '').trim().toUpperCase()
  if (plant === 'RICARDONE') {
    return (
      operationOnPermittedAceiteDischargePlatform(op) ||
      productFamilyLiquid(String(op.resolved_product ?? op.product_normalized ?? ''), String(op.resolved_platform ?? ''))
    )
  }
  const circuit = primaryCircuit(op)
  return isRicLiquidReceptionCode(circuit) || isRicLiquidDespachoCode(circuit)
}

function isLiquidExcelAuditOperation(op: ExcelOperationWithTruckflowRow): boolean {
  if (operationOnPermittedAceiteDischargePlatform(op)) return true
  if (isRicardoneLiquidExcelOp(op)) return true
  const circuit = primaryCircuit(op)
  return isSlLiquidCircuit(circuit) || isTransileExternoRicSlCode(circuit)
}

function resolveLiquidAuditSite(op: ExcelOperationWithTruckflowRow): 'ricardone_calada' | 'san_lorenzo_s10' {
  const plant = String(op.planta_normalized ?? '').trim().toUpperCase()
  const circuit = primaryCircuit(op)
  if (isRicardoneLiquidExcelOp(op) && plant === 'RICARDONE') return 'ricardone_calada'
  if (isRicLiquidReceptionCode(circuit) || isRicLiquidDespachoCode(circuit)) return 'ricardone_calada'
  if (isSlLiquidCircuit(circuit)) return 'san_lorenzo_s10'
  if (plant === 'TERMINAL_EMBARQUE' || plant === 'SAN_LORENZO') return 'san_lorenzo_s10'
  if (operationOnPermittedAceiteDischargePlatform(op)) return 'san_lorenzo_s10'
  return 'ricardone_calada'
}

function buildRicCalLiqAuditSlot(): SlCameraAuditSlot {
  return {
    slotId: 'RIC',
    logicalCode: 'LIQUIDO',
    pipelineLogicalCode: 'LIQUIDO',
    label: RIC_LIQUIDO_CAMERA,
    deviceCodes: new Set([RIC_LIQUIDO_CAMERA]),
    sectorCodes: new Set(),
  }
}

const LIQUID_EXCEL_WINDOW_PAD_HOURS = 12

function parseOperationalMs(iso: string): number {
  return parseTimestampMs(iso)
}

function argentinaDayKeyFromMs(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return argentinaLocalParts(formatArgentinaIsoFromMs(ms))?.fecha_tramo ?? ''
}

function excelOperationDayKey(op: ExcelOperationWithTruckflowRow): string {
  const sd = String(op.source_date ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(sd)) return sd
  for (const iso of [op.external_salida_at, op.external_ingreso_at, op.external_calado_at]) {
    const ms = parseTimestampMs(String(iso ?? ''))
    if (Number.isFinite(ms)) {
      const day = argentinaDayKeyFromMs(ms)
      if (day) return day
    }
  }
  return ''
}

function excelOperationWindowMs(
  op: ExcelOperationWithTruckflowRow,
  paddingHours = LIQUID_EXCEL_WINDOW_PAD_HOURS
): { fromMs: number; toMs: number } {
  const ing = parseTimestampMs(String(op.external_ingreso_at ?? ''))
  const sal = parseTimestampMs(String(op.external_salida_at ?? ''))
  const pad = paddingHours * 3600_000
  let fromMs = Number.isFinite(ing) ? ing - pad : Number.NaN
  let toMs = Number.isFinite(sal) ? sal + pad : Number.NaN
  const day = excelOperationDayKey(op)
  if (day) {
    const dayStart = parseTimestampMs(`${day}T00:00:00`)
    const dayEnd = parseTimestampMs(`${day}T23:59:59`)
    if (Number.isFinite(dayStart) && Number.isFinite(dayEnd)) {
      if (!Number.isFinite(fromMs)) fromMs = dayStart - pad
      if (!Number.isFinite(toMs)) toMs = dayEnd + pad
    }
  }
  if (!Number.isFinite(fromMs) && Number.isFinite(sal)) fromMs = sal - 48 * 3600_000
  if (!Number.isFinite(toMs) && Number.isFinite(ing)) toMs = ing + 48 * 3600_000
  return { fromMs, toMs }
}

function buildEventsByPlate(allEvents: RawJourneyEventLike[]): Map<string, RawJourneyEventLike[]> {
  const m = new Map<string, RawJourneyEventLike[]>()
  for (const e of allEvents) {
    const p = normalizePlateKey(e.normalizedPlate ?? e.truckPlate ?? '')
    if (!p) continue
    const arr = m.get(p) ?? []
    arr.push(e)
    m.set(p, arr)
  }
  return m
}

function eventsForLiquidAuditOperation(
  op: ExcelOperationWithTruckflowRow,
  eventsByPlate: Map<string, RawJourneyEventLike[]>,
  journeyByUid: Map<string, ClassifiedJourneyForTiming>
): RawJourneyEventLike[] {
  const plate = normalizePlateKey(op.plate_normalized ?? '')
  const uids = new Set(
    String(op.matched_journey_uids ?? '')
      .split(/[|,]/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
  const dedupe = new Set<string>()
  const out: RawJourneyEventLike[] = []
  const push = (e: RawJourneyEventLike) => {
    const key = `${e.journeyUid ?? e.journey_uuid ?? ''}|${operationalInstantIso(e)}|${e.deviceCode ?? e.device_code ?? ''}`
    if (dedupe.has(key)) return
    dedupe.add(key)
    out.push(e)
  }
  for (const uid of uids) {
    const cj = journeyByUid.get(uid)
    if (!cj) continue
    for (const e of cj.journey.events) {
      push({
        journeyUid: cj.journey.journeyUid,
        truckPlate: e.truckPlate,
        normalizedPlate: e.normalizedPlate,
        deviceCode: e.deviceCode,
        sectorCode: e.sectorCode,
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      })
    }
  }
  for (const e of eventsByPlate.get(plate) ?? []) {
    push(e)
  }
  return out
}

function cameraHitsInExcelWindow(
  op: ExcelOperationWithTruckflowRow,
  events: RawJourneyEventLike[],
  deviceTest: (deviceCode: string) => boolean
): { captured: boolean; devices: string[]; bestInstant: string } {
  const { fromMs, toMs } = excelOperationWindowMs(op)
  const plate = normalizePlateKey(op.plate_normalized ?? '')
  const devices = new Set<string>()
  let bestInstant = ''
  let bestMs = Number.POSITIVE_INFINITY
  for (const e of events) {
    if (plate && normalizePlateKey(e.normalizedPlate ?? e.truckPlate ?? '') !== plate) continue
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!deviceTest(dev)) continue
    const instant = operationalInstantIso(e)
    const ms = parseOperationalMs(instant)
    if (!Number.isFinite(ms)) continue
    if (Number.isFinite(fromMs) && Number.isFinite(toMs) && (ms < fromMs || ms > toMs)) continue
    devices.add(dev)
    if (ms < bestMs) {
      bestMs = ms
      bestInstant = instant
    }
  }
  return { captured: devices.size > 0, devices: [...devices].sort(), bestInstant }
}

function s10HitsForOperation(
  op: ExcelOperationWithTruckflowRow,
  events: RawJourneyEventLike[],
  role: 'descarga' | 'carga' | 'cualquiera'
): { captured: boolean; devices: string[]; roles: string[]; bestInstant: string } {
  const hit = cameraHitsInExcelWindow(op, events, (dev) => {
    if (!isSlLiquidS10Device(dev)) return false
    if (role === 'cualquiera') return true
    return slLiquidS10DeviceRole(dev) === role
  })
  const roles = [...new Set(hit.devices.map((d) => slLiquidS10DeviceRole(d)))].filter((r) => r !== 'otro')
  return { captured: hit.captured, devices: hit.devices, roles, bestInstant: hit.bestInstant }
}

function ricCalLiqHitsForOperation(op: ExcelOperationWithTruckflowRow, events: RawJourneyEventLike[]) {
  return cameraHitsInExcelWindow(op, events, (dev) => dev === RIC_LIQUIDO_CAMERA)
}

function truckflowMatchedOp(op: ExcelOperationWithTruckflowRow): boolean {
  const mq = String(op.match_quality ?? '').trim().toUpperCase()
  if (!mq || mq === 'NO_TRUCKFLOW_EVIDENCE' || mq === 'INSUFFICIENT_EXTERNAL_DATA') return false
  return (op.matched_journey_count ?? 0) > 0 || Boolean(String(op.matched_journey_uids ?? '').trim())
}

function buildExcelFirstGapRows(auditRows: SlLiquidS10OpSummary[]): AceiteTruckflowExcelCrossRow[] {
  return auditRows
    .filter((r) => !r.excel_in_truckflow_window || (!r.s10_captured && !r.riccalliq_captured))
    .map((r) => ({
      external_operation_id: r.external_operation_id,
      plate_normalized: r.plate_normalized,
      source_date: r.source_date,
      audit_site: r.audit_site,
      required_camera: r.required_camera,
      excel_planta: r.excel_planta,
      excel_platform: r.excel_platform,
      truckflow_matched: r.excel_in_truckflow_window,
      camera_captured: r.audit_site === 'ricardone_calada' ? r.riccalliq_captured : r.s10_captured,
      match_quality: r.truckflow_match_quality,
      gap_note:
        !r.excel_in_truckflow_window ?
          'SIN_JOURNEY_TRUCKFLOW'
        : r.audit_site === 'ricardone_calada' && !r.riccalliq_captured ?
          'FALTA_RICCALLIQ'
        : r.audit_site === 'san_lorenzo_s10' && !r.s10_captured ?
          'FALTA_S10'
        : '',
    }))
}

function journeyDevicesForOperation(
  op: ExcelOperationWithTruckflowRow,
  journeyByUid: Map<string, ClassifiedJourneyForTiming>
): Set<string> {
  const devices = new Set<string>()
  const uids = String(op.matched_journey_uids ?? '')
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const uid of uids) {
    const cj = journeyByUid.get(uid)
    if (!cj) continue
    for (const e of cj.journey.events) {
      const d = String(e.deviceCode ?? '').trim()
      if (d) devices.add(d)
    }
  }
  return devices
}

function hasDevice(devices: Set<string>, code: string): boolean {
  return devices.has(code)
}

function anySlLiquidS10(devices: Set<string>): boolean {
  for (const d of devices) {
    if (isSlLiquidS10Device(d)) return true
  }
  return false
}

export function classifyRicCalLiqCohort(input: {
  executiveCircuit: string
  product: string
  platform: string
  devices: Set<string>
}): RicCalLiqCohort {
  const circuit = String(input.executiveCircuit ?? '').trim().toUpperCase()
  const devices = input.devices
  const hasRicLiq = hasDevice(devices, RIC_LIQUIDO_CAMERA)

  if (isSlLiquidCircuit(circuit)) return 'sl_liquido_san_lorenzo'

  if (!hasRicLiq && !productFamilyLiquid(input.product, input.platform)) {
    if (isTransileExternoRicSlCode(circuit)) return 'transile_externo_ric_sl'
    return 'sin_riccalliq'
  }

  if (isTransileExternoRicSlCode(circuit) || hasDevice(devices, 'SLZIngCamFrente')) {
    if (hasRicLiq && anySlLiquidS10(devices)) return 'sl_liquido_san_lorenzo'
    return 'transile_externo_ric_sl'
  }

  if (isRicLiquidReceptionCode(circuit) || (productFamilyLiquid(input.product, input.platform) && !isRicLiquidDespachoCode(circuit))) {
    return 'liquido_recepcion_ric'
  }

  if (isRicLiquidDespachoCode(circuit)) return 'liquido_despacho_ric'

  const hasBal = [...devices].some((d) => d.includes('Balanza') || d.includes('RicB'))
  const hasVol = hasDevice(devices, 'RicVolcable1') || hasDevice(devices, 'RicVolcable2')
  const hasC16 = [...devices].some((d) => d.includes('C16'))

  if (hasRicLiq && hasBal && !hasVol && !hasC16) return 'despacho_generico_calada'

  if (hasRicLiq) return 'ambiguo_riccalliq'

  return 'sin_riccalliq'
}

function excelOpToAuditLike(
  op: ExcelOperationWithTruckflowRow,
  segmentsByOp: Map<string, { segment_from: string; segment_to: string }[]>
): {
  operationId: string
  plate: string
  executiveCircuitCode: string
  externalIngresoAt?: string
  externalSalidaAt?: string
  analysisReadyForScatter: boolean
  segments: { segment_from: string; segment_to: string }[]
} {
  const id = String(op.external_operation_id ?? '').trim()
  return {
    operationId: id,
    plate: String(op.plate_normalized ?? '').trim(),
    executiveCircuitCode: primaryCircuit(op),
    externalIngresoAt: String(op.external_ingreso_at ?? '').trim() || undefined,
    externalSalidaAt: String(op.external_salida_at ?? '').trim() || undefined,
    analysisReadyForScatter: Boolean(op.analysis_ready_for_scatter),
    segments: segmentsByOp.get(id) ?? [],
  }
}

function expectedS10Role(circuit: string): 'descarga' | 'carga' | 'cualquiera' {
  const c = circuit.toUpperCase()
  if (c === 'SL1') return 'descarga'
  if (c === 'SL5') return 'carga'
  return 'cualquiera'
}

export function buildLiquidMovementsReport(input: {
  operations: ExcelOperationWithTruckflowRow[]
  segmentRows: Array<{
    external_operation_id?: string
    segment_from?: string
    segment_to?: string
  }>
  classifiedJourneys: ClassifiedJourneyForTiming[]
  rawEvents?: RawJourneyEventLike[]
}): LiquidMovementsReport {
  const journeyByUid = new Map(
    input.classifiedJourneys.map((c) => [String(c.journey.journeyUid ?? '').trim(), c])
  )

  const events: RawJourneyEventLike[] =
    input.rawEvents?.length ?
      input.rawEvents
    : input.classifiedJourneys.flatMap((cj) =>
        cj.journey.events.map((e) => ({
          journeyUid: cj.journey.journeyUid,
          truckPlate: e.truckPlate,
          normalizedPlate: e.normalizedPlate,
          deviceCode: e.deviceCode,
          sectorCode: e.sectorCode,
          occurredAt: e.occurredAt,
          createdAt: e.createdAt,
        }))
      )

  const eventsByPlate = buildEventsByPlate(events)

  const segmentsByOp = new Map<string, { segment_from: string; segment_to: string }[]>()
  for (const row of input.segmentRows) {
    const id = String(row.external_operation_id ?? '').trim()
    if (!id) continue
    const bucket = segmentsByOp.get(id) ?? []
    bucket.push({
      segment_from: String(row.segment_from ?? '').trim(),
      segment_to: String(row.segment_to ?? '').trim(),
    })
    segmentsByOp.set(id, bucket)
  }

  const ricCalLiqRows: RicCalLiqCohortRow[] = []
  const byCohort = {} as Record<RicCalLiqCohort, number>
  for (const key of [
    'liquido_recepcion_ric',
    'liquido_despacho_ric',
    'transile_externo_ric_sl',
    'despacho_generico_calada',
    'sl_liquido_san_lorenzo',
    'ambiguo_riccalliq',
    'sin_riccalliq',
  ] as RicCalLiqCohort[]) {
    byCohort[key] = 0
  }

  for (const op of input.operations) {
    const opEvents = eventsForLiquidAuditOperation(op, eventsByPlate, journeyByUid)
    const devices = journeyDevicesForOperation(op, journeyByUid)
    for (const e of opEvents) {
      const d = String(e.deviceCode ?? e.device_code ?? '').trim()
      if (d) devices.add(d)
    }
    const circuit = primaryCircuit(op)
    const cohort = classifyRicCalLiqCohort({
      executiveCircuit: circuit,
      product: String(op.resolved_product ?? op.product_normalized ?? ''),
      platform: String(op.resolved_platform ?? op.platform_normalized ?? ''),
      devices,
    })
    byCohort[cohort] = (byCohort[cohort] ?? 0) + 1

    const s10Hit = s10HitsForOperation(op, opEvents, 'cualquiera')
    const ricHit = ricCalLiqHitsForOperation(op, opEvents)
    const bridge =
      (hasDevice(devices, RIC_LIQUIDO_CAMERA) || ricHit.captured || cohort.startsWith('liquido_')) &&
      s10Hit.devices.length > 0

    ricCalLiqRows.push({
      external_operation_id: String(op.external_operation_id ?? ''),
      plate_normalized: String(op.plate_normalized ?? ''),
      resolved_executive_circuit: circuit,
      resolved_product: String(op.resolved_product ?? ''),
      resolved_platform: String(op.resolved_platform ?? ''),
      cohort,
      riccalliq_in_truckflow: hasDevice(devices, RIC_LIQUIDO_CAMERA) || ricHit.captured,
      s10_liquid_in_truckflow: s10Hit.devices.length > 0,
      sl_circuit: isSlLiquidCircuit(circuit) ? circuit.toUpperCase() : '',
      bridge_ric_sl: bridge,
      truckflow_circuit_codes: String(op.truckflow_circuit_codes ?? ''),
      excel_planta: String(op.planta_normalized ?? ''),
      notes: String(op.diagnostic_detail ?? '').slice(0, 200),
    })
  }

  const auditOps = excelOpsForLiquidAudit(input.operations)

  const slAuditOps = auditOps.map((op) => excelOpToAuditLike(op, segmentsByOp))
  const unifiedSlot = buildSlLiquidS10UnifiedSlot()
  const ricSlot = buildRicCalLiqAuditSlot()
  const perDeviceSlots = buildSlLiquidS10PerDeviceSlots()
  const slSlotAuditRows = auditExcelOperationsAgainstSlCameraSlots(
    slAuditOps,
    events,
    [unifiedSlot, ricSlot, ...perDeviceSlots],
    { windowPaddingHours: LIQUID_EXCEL_WINDOW_PAD_HOURS }
  )

  const gapByOp = new Map<string, string>()
  for (const r of slSlotAuditRows) {
    if (r.logicalCode === unifiedSlot.logicalCode || r.logicalCode === ricSlot.logicalCode) {
      gapByOp.set(`${r.operationId}|${r.logicalCode}`, r.gapClass)
    }
  }

  const slLiquidRows: SlLiquidS10OpSummary[] = auditOps.map((op) => {
    const id = String(op.external_operation_id ?? '')
    const circuit = primaryCircuit(op)
    const site = resolveLiquidAuditSite(op)
    const opEvents = eventsForLiquidAuditOperation(op, eventsByPlate, journeyByUid)
    const slRole = expectedS10Role(circuit)
    const s10Hit = s10HitsForOperation(op, opEvents, slRole)
    const ricHit = ricCalLiqHitsForOperation(op, opEvents)
    const matched = truckflowMatchedOp(op)
    const requiredCamera = site === 'ricardone_calada' ? RIC_LIQUIDO_CAMERA : `S10_${slRole}`
    const gapKey =
      site === 'ricardone_calada' ?
        gapByOp.get(`${id}|${ricSlot.logicalCode}`)
      : gapByOp.get(`${id}|${unifiedSlot.logicalCode}`)
    return {
      external_operation_id: id,
      plate_normalized: String(op.plate_normalized ?? ''),
      excel_planta: String(op.planta_normalized ?? ''),
      source_date: String(op.source_date ?? ''),
      circuit: circuit.toUpperCase(),
      excel_platform: String(op.platform_normalized ?? op.resolved_platform ?? ''),
      audit_site: site,
      required_camera: requiredCamera,
      s10_captured: s10Hit.captured,
      s10_devices_hit: s10Hit.devices.join('|'),
      s10_roles: s10Hit.roles.join('|'),
      riccalliq_captured: ricHit.captured,
      unified_slot_gap: gapKey ?? 'neither',
      expected_sl_role: site === 'ricardone_calada' ? 'ric_calada' : slRole,
      truckflow_match_quality: String(op.match_quality ?? ''),
      excel_in_truckflow_window: matched,
      matched_journey_uids: String(op.matched_journey_uids ?? ''),
      analysis_ready_for_scatter: Boolean(op.analysis_ready_for_scatter),
      camera_best_instant: site === 'ricardone_calada' ? ricHit.bestInstant : s10Hit.bestInstant,
    }
  })

  const aceiteTruckflowExcelRows = buildExcelFirstGapRows(slLiquidRows)

  const riccalliq_operations = slLiquidRows.filter((r) => r.riccalliq_captured).length
  const bridge_ric_sl_count = ricCalLiqRows.filter((r) => r.bridge_ric_sl).length
  const aceite_platform_excel_ops = auditOps.length
  const aceite_platform_s10_captured = slLiquidRows.filter((r) => r.s10_captured).length
  const aceite_platform_excel_with_truckflow = slLiquidRows.filter((r) => r.excel_in_truckflow_window).length
  const truckflow_s10_descarga_events = slLiquidRows.filter((r) => r.audit_site === 'san_lorenzo_s10').length
  const truckflow_s10_with_excel_match = slLiquidRows.filter(
    (r) => r.excel_in_truckflow_window && (r.s10_captured || r.riccalliq_captured)
  ).length

  return {
    ricCalLiqRows,
    slLiquidRows,
    aceiteTruckflowExcelRows,
    slSlotAuditRows,
    summary: {
      riccalliq_operations,
      by_cohort: byCohort,
      aceite_platform_excel_ops,
      aceite_platform_s10_captured,
      aceite_platform_excel_with_truckflow,
      truckflow_s10_descarga_events,
      truckflow_s10_with_excel_match,
      sl1_sl5_operations: slLiquidRows.length,
      sl1_sl5_s10_captured: slLiquidRows.filter((r) => r.s10_captured).length,
      bridge_ric_sl_count,
    },
  }
}

export const RIC_COHORT_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'resolved_executive_circuit',
  'resolved_product',
  'resolved_platform',
  'cohort',
  'riccalliq_in_truckflow',
  's10_liquid_in_truckflow',
  'sl_circuit',
  'bridge_ric_sl',
  'truckflow_circuit_codes',
  'excel_planta',
  'notes',
] as const

export const SL_S10_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'excel_planta',
  'source_date',
  'circuit',
  'excel_platform',
  'audit_site',
  'required_camera',
  's10_captured',
  's10_devices_hit',
  's10_roles',
  'riccalliq_captured',
  'unified_slot_gap',
  'expected_sl_role',
  'truckflow_match_quality',
  'excel_in_truckflow_window',
  'matched_journey_uids',
  'analysis_ready_for_scatter',
  'camera_best_instant',
] as const

export const ACEITE_TF_EXCEL_HEADERS = [
  'external_operation_id',
  'plate_normalized',
  'source_date',
  'audit_site',
  'required_camera',
  'excel_planta',
  'excel_platform',
  'truckflow_matched',
  'camera_captured',
  'match_quality',
  'gap_note',
] as const

type CsvBool = 'true' | 'false'

function mapRicCsvRows(rows: RicCalLiqCohortRow[]) {
  return rows.map((r) => ({
    ...r,
    riccalliq_in_truckflow: (r.riccalliq_in_truckflow ? 'true' : 'false') as CsvBool,
    s10_liquid_in_truckflow: (r.s10_liquid_in_truckflow ? 'true' : 'false') as CsvBool,
    bridge_ric_sl: (r.bridge_ric_sl ? 'true' : 'false') as CsvBool,
  }))
}

function mapSlCsvRows(rows: SlLiquidS10OpSummary[]) {
  return rows.map((r) => ({
    ...r,
    s10_captured: (r.s10_captured ? 'true' : 'false') as CsvBool,
    riccalliq_captured: (r.riccalliq_captured ? 'true' : 'false') as CsvBool,
    excel_in_truckflow_window: (r.excel_in_truckflow_window ? 'true' : 'false') as CsvBool,
    analysis_ready_for_scatter: (r.analysis_ready_for_scatter ? 'true' : 'false') as CsvBool,
  }))
}

function mapAceiteCsvRows(rows: AceiteTruckflowExcelCrossRow[]) {
  return rows.map((r) => ({
    ...r,
    truckflow_matched: (r.truckflow_matched ? 'true' : 'false') as CsvBool,
    camera_captured: (r.camera_captured ? 'true' : 'false') as CsvBool,
  }))
}

function flattenLiquidSummary(summary: LiquidMovementsSummary): Record<string, unknown> {
  return {
    riccalliq_operations: summary.riccalliq_operations,
    aceite_platform_excel_ops: summary.aceite_platform_excel_ops,
    aceite_platform_s10_captured: summary.aceite_platform_s10_captured,
    aceite_platform_excel_with_truckflow: summary.aceite_platform_excel_with_truckflow,
    truckflow_s10_descarga_events: summary.truckflow_s10_descarga_events,
    truckflow_s10_with_excel_match: summary.truckflow_s10_with_excel_match,
    sl1_sl5_operations: summary.sl1_sl5_operations,
    sl1_sl5_s10_captured: summary.sl1_sl5_s10_captured,
    bridge_ric_sl_count: summary.bridge_ric_sl_count,
    ...Object.fromEntries(Object.entries(summary.by_cohort).map(([k, v]) => [`cohort_${k}`, v])),
  }
}

export function liquidMovementsTables(report: LiquidMovementsReport): {
  riccalliq_cohort: TypedTable
  sl1_sl5_s10: TypedTable
  aceite_truckflow_excel: TypedTable
  summary: TypedTable
} {
  const summaryFlat = flattenLiquidSummary(report.summary)
  return {
    riccalliq_cohort: makeTable(
      'liquid_movements_riccalliq_cohort',
      RIC_COHORT_HEADERS,
      mapRicCsvRows(report.ricCalLiqRows) as unknown as Record<string, unknown>[]
    ),
    sl1_sl5_s10: makeTable(
      'liquid_movements_sl1_sl5_s10',
      SL_S10_HEADERS,
      mapSlCsvRows(report.slLiquidRows) as unknown as Record<string, unknown>[]
    ),
    aceite_truckflow_excel: makeTable(
      'liquid_movements_aceite_truckflow_excel',
      ACEITE_TF_EXCEL_HEADERS,
      mapAceiteCsvRows(report.aceiteTruckflowExcelRows) as unknown as Record<string, unknown>[]
    ),
    summary: makeTable(
      'liquid_movements_summary',
      Object.keys(summaryFlat),
      [summaryFlat]
    ),
  }
}

export function liquidMovementsRicCalLiqCsv(rows: RicCalLiqCohortRow[]): string {
  return tableToCsv(
    makeTable(
      'liquid_movements_riccalliq_cohort',
      RIC_COHORT_HEADERS,
      mapRicCsvRows(rows) as unknown as Record<string, unknown>[]
    )
  )
}

export function liquidMovementsSlS10Csv(rows: SlLiquidS10OpSummary[]): string {
  return tableToCsv(
    makeTable(
      'liquid_movements_sl1_sl5_s10',
      SL_S10_HEADERS,
      mapSlCsvRows(rows) as unknown as Record<string, unknown>[]
    )
  )
}

export function liquidMovementsAceiteTruckflowExcelCsv(rows: AceiteTruckflowExcelCrossRow[]): string {
  return tableToCsv(
    makeTable(
      'liquid_movements_aceite_truckflow_excel',
      ACEITE_TF_EXCEL_HEADERS,
      mapAceiteCsvRows(rows) as unknown as Record<string, unknown>[]
    )
  )
}

export function liquidMovementsSummaryCsv(summary: LiquidMovementsSummary): string {
  const flat = flattenLiquidSummary(summary)
  return tableToCsv(makeTable('liquid_movements_summary', Object.keys(flat), [flat]))
}

export function formatLiquidMovementsLog(summary: LiquidMovementsSummary): string {
  return [
    'Líquidos / RicCalLiq',
    `riccalliq_ops=${summary.riccalliq_operations}`,
    `aceite_excel=${summary.aceite_platform_excel_ops}`,
    `aceite_s10=${summary.aceite_platform_s10_captured}`,
    `aceite_tf_match=${summary.aceite_platform_excel_with_truckflow}`,
    `tf_s10_desc=${summary.truckflow_s10_descarga_events}`,
    `tf_s10_excel=${summary.truckflow_s10_with_excel_match}`,
    `SL1+SL5=${summary.sl1_sl5_operations}`,
    `S10_capt=${summary.sl1_sl5_s10_captured}`,
    `puente_ric_sl=${summary.bridge_ric_sl_count}`,
    `cohorte_recep=${summary.by_cohort.liquido_recepcion_ric}`,
    `cohorte_desp=${summary.by_cohort.liquido_despacho_ric}`,
    `transile_ext=${summary.by_cohort.transile_externo_ric_sl}`,
    `ambiguo=${summary.by_cohort.ambiguo_riccalliq}`,
  ].join(' · ')
}
