/**
 * Matriz Excel por circuito: CTG, patente, día egreso + SI/NO por hito de cámara en crudo.
 */

import { isLikelyOcrPlateMatch } from '../../../services/circuitPlateOcr'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import { operationalInstantIso, parseInstantMs, normalizePlateKey } from './auditSlCameraExcelCoverage'

export type RawJourneyEventLike = {
  journeyUid?: string
  journey_uuid?: string
  truckPlate?: string
  normalizedPlate?: string
  rawTruckPlate?: string
  raw_truck_plate?: string
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
  payload?: unknown
}

export type CameraAuditAlertLike = {
  journeyUid?: string
  journeyUuid?: string
  truckPlate?: string
  deviceCode?: string
  sectorCode?: string
  occurredAt?: string
  createdAt?: string
  modifiedAt?: string
  recordedAt?: string
  payload?: unknown
}

export type ExcelCameraStep = {
  key: string
  header: string
  logicalCode: string
}

/** Ricardone → San Lorenzo (R7). */
export const R7_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'egreso', header: 'egreso', logicalCode: 'EGRESO' },
  { key: 'ingreso_slz', header: 'ingreso_slz', logicalCode: 'SL_INGRESO' },
  { key: 'balanza_ingreso_slz', header: 'balanza_ingreso_slz', logicalCode: 'SL_BALANZA_INGRESO' },
  { key: 'balanza_egreso_slz', header: 'balanza_egreso_slz', logicalCode: 'SL_BALANZA_SALIDA' },
  { key: 'salida_slz', header: 'salida_slz', logicalCode: 'SL_EGRESO' },
]

/** Recepción Celda 16 (R1): Ric hasta balanza y descarga Celda 16 (sin cámara egreso Ric). */
export const R1_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'celda16_descarga', header: 'celda16_descarga', logicalCode: 'CELDA16_DESCARGA' },
]

/** Recepción Volcable 1 (R5): Ric hasta balanza y volcable (sin cámara egreso Ric). */
export const R5_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'volcable', header: 'volcable', logicalCode: 'VOLCABLE' },
]

/** Recepción Volcable 2 (R6): misma cadena cámara que R5. */
export const R6_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'volcable', header: 'volcable', logicalCode: 'VOLCABLE' },
]

export const EXCEL_CAMERA_STEPS_BY_CIRCUIT: Record<string, readonly ExcelCameraStep[]> = {
  R7: R7_EXCEL_CAMERA_STEPS,
  R1: R1_EXCEL_CAMERA_STEPS,
  R5: R5_EXCEL_CAMERA_STEPS,
  R6: R6_EXCEL_CAMERA_STEPS,
}

export const RAW_AUDIT_CIRCUIT_CODES = ['R1', 'R5', 'R6', 'R7'] as const

export function getExcelCameraStepsForCircuit(circuitCode: string): readonly ExcelCameraStep[] {
  const code = String(circuitCode ?? '').trim().toUpperCase()
  const steps = EXCEL_CAMERA_STEPS_BY_CIRCUIT[code]
  if (!steps?.length) {
    throw new Error(`Circuito no soportado para matriz cámara: ${code}. Use R1, R5, R6 o R7.`)
  }
  return steps
}

export type ExcelMovimientoLike = {
  operationId: string
  ctg: string
  plate: string
  externalIngresoAt?: string
  externalSalidaAt?: string
  executiveCircuitCode: string
}

export type CameraMatrixRow = {
  ctg: string
  patente: string
  diaEgreso: string
  captures: Record<string, boolean>
}

export type CameraStepSummary = {
  key: string
  header: string
  logicalCode: string
  captured: number
  total: number
  captureRatePct: number
  errorRatePct: number
}

function toEventDto(e: RawJourneyEventLike): RealJourneyEventDto {
  return {
    journeyUid: String(e.journeyUid ?? e.journey_uuid ?? '').trim(),
    truckPlate: String(e.truckPlate ?? e.normalizedPlate ?? ''),
    rawTruckPlate: String(e.rawTruckPlate ?? e.raw_truck_plate ?? ''),
    normalizedPlate: String(e.normalizedPlate ?? ''),
    deviceCode: String(e.deviceCode ?? e.device_code ?? ''),
    sectorCode: String(e.sectorCode ?? e.sector_code ?? ''),
    occurredAt: String(e.occurredAt ?? e.occurred_at ?? ''),
    createdAt: String(e.createdAt ?? e.created_at ?? ''),
    modifiedAt: String(e.modifiedAt ?? e.modified_at ?? ''),
    recordedAt: String(e.recordedAt ?? e.recorded_at ?? ''),
  } as RealJourneyEventDto
}

const RIC_BALANZA_EGRESO_DEVICE_RE = /^ricb[123]egreso/i
const RIC_BALANZA_INGRESO_DEVICE_RE = /^ricb[123]ingreso/i

/** Mismo criterio lógico que el ETL (`normalizeRealEventPoint`) + alias de dispositivo balanza. */
export function eventLogicalCodeOperational(e: RawJourneyEventLike): string {
  const device = String(e.deviceCode ?? e.device_code ?? '').trim()
  if (RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return 'BALANZA_EGRESO'
  if (RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return 'BALANZA_INGRESO'

  try {
    const pt = normalizeRealEventPoint(toEventDto(e))
    let code = String(pt.logicalCode ?? '').trim()
    if (code.includes('EXCLUIDA') || code.includes('TRASERA')) return ''
    if (code === 'BALANZA' && device) {
      const d = device.toLowerCase()
      if (d.includes('egreso') || d.includes('salida')) return 'BALANZA_EGRESO'
      if (d.includes('ingreso') || d.includes('entrada')) return 'BALANZA_INGRESO'
    }
    if (code && code !== 'UNKNOWN') return code
  } catch {
    /* fallback device */
  }

  if (RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return 'BALANZA_EGRESO'
  if (RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return 'BALANZA_INGRESO'
  return ''
}

export function eventMatchesCameraStep(e: RawJourneyEventLike, step: ExcelCameraStep): boolean {
  const code = eventLogicalCodeOperational(e)
  if (code === step.logicalCode) return true
  const device = String(e.deviceCode ?? e.device_code ?? '').trim().toLowerCase()
  if (step.logicalCode === 'BALANZA_EGRESO' && RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return true
  if (step.logicalCode === 'BALANZA_INGRESO' && RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return true
  return false
}

function journeyUidFromRaw(e: RawJourneyEventLike): string {
  return String(e.journeyUid ?? e.journey_uuid ?? '').trim()
}

function parsePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null
  if (typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string') {
    const t = payload.trim()
    if (!t.startsWith('{')) return null
    try {
      const parsed = JSON.parse(t) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

function plateFromPayload(payload: unknown): string {
  const p = parsePayloadRecord(payload)
  if (!p) return ''
  const keys = [
    'normalizedPlate',
    'payload_normalized_plate',
    'plate',
    'truckPlate',
    'truck_plate',
    'lprPlate',
    'Patente',
  ]
  for (const k of keys) {
    const v = normalizePlateKey(String(p[k] ?? ''))
    if (v) return v
  }
  return ''
}

/** Patente en fila cruda: campos DTO + payload LPR (alertas / eventos sin truckPlate). */
export function plateFromCameraAuditRow(e: RawJourneyEventLike): string {
  for (const raw of [
    e.normalizedPlate,
    e.truckPlate,
    e.rawTruckPlate,
    e.raw_truck_plate,
  ]) {
    const k = normalizePlateKey(raw ?? '')
    if (k) return k
  }
  return plateFromPayload(e.payload)
}

/** Cruce Excel ↔ lectura: clave exacta u OCR tolerante (balanza egreso Ric). */
export function platesMatchExcelCameraAudit(excelPlate: string, eventPlate: string): boolean {
  const a = normalizePlateKey(excelPlate)
  const b = normalizePlateKey(eventPlate)
  if (!a || !b) return false
  if (a === b) return true
  return isLikelyOcrPlateMatch(a, b)
}

/** Diagnóstico runtime (debug): fuentes de patente en lecturas RicB*Egreso. */
export function diagnoseBalanzaEgresoPlateSources(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): Record<string, number | string | boolean> {
  const corpus = buildCameraAuditCorpus(events, alerts)
  const stats = {
    corpusSize: corpus.length,
    alertInputCount: alerts?.length ?? 0,
    egressRows: 0,
    plateFromNormalized: 0,
    plateFromTruck: 0,
    plateFromRawTruckPlate: 0,
    plateFromPayload: 0,
    plateEmpty: 0,
    payloadIsString: 0,
    egressWithJourneyUid: 0,
    samplePayloadKeys: '' as string,
  }
  let sampleKeys = ''
  for (const e of corpus) {
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!RIC_BALANZA_EGRESO_DEVICE_RE.test(dev)) continue
    stats.egressRows += 1
    if (journeyUidFromRaw(e)) stats.egressWithJourneyUid += 1
    const norm = normalizePlateKey(e.normalizedPlate ?? '')
    const truck = normalizePlateKey(e.truckPlate ?? '')
    const raw = normalizePlateKey(String(e.rawTruckPlate ?? e.raw_truck_plate ?? ''))
    const pay = plateFromPayload(e.payload)
    if (typeof e.payload === 'string') stats.payloadIsString += 1
    if (norm) stats.plateFromNormalized += 1
    else if (truck) stats.plateFromTruck += 1
    else if (raw) stats.plateFromRawTruckPlate += 1
    else if (pay) stats.plateFromPayload += 1
    else {
      stats.plateEmpty += 1
      if (!sampleKeys && e.payload && typeof e.payload === 'object') {
        sampleKeys = Object.keys(e.payload as object).slice(0, 12).join(',')
      }
    }
  }
  stats.samplePayloadKeys = sampleKeys
  return stats
}

/** Instantáneas operativas: occurred/recorded y created/modified (API inconsistente en balanza egreso). */
export function auditEventInstantsMs(e: RawJourneyEventLike): number[] {
  const out = new Set<number>()
  for (const preferCreatedAt of [false, true]) {
    const t = parseInstantMs(operationalInstantIso(e, preferCreatedAt))
    if (Number.isFinite(t)) out.add(t)
  }
  return [...out]
}

export function auditEventInOperationWindow(
  e: RawJourneyEventLike,
  fromMs: number,
  toMs: number
): boolean {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true
  return auditEventInstantsMs(e).some((t) => t >= fromMs && t <= toMs)
}

/** Alertas RicB* / balanza con patente en payload → filas tipo evento para la matriz. */
export function buildCameraAuditCorpus(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): RawJourneyEventLike[] {
  const out: RawJourneyEventLike[] = [...events]
  if (!alerts?.length) return out
  for (const a of alerts) {
    const dev = String(a.deviceCode ?? '').trim()
    if (!dev) continue
    const sectorU = String(a.sectorCode ?? '').trim().toUpperCase()
    const balanzaDev = RIC_BALANZA_EGRESO_DEVICE_RE.test(dev) || RIC_BALANZA_INGRESO_DEVICE_RE.test(dev)
    if (!balanzaDev && !sectorU.includes('BALANZA')) continue
    const payloadPlate = plateFromPayload(a.payload)
    const plate = String(a.truckPlate ?? '').trim() || payloadPlate
    out.push({
      journeyUid: String(a.journeyUid ?? a.journeyUuid ?? ''),
      truckPlate: plate,
      normalizedPlate: payloadPlate || plate,
      deviceCode: dev,
      sectorCode: a.sectorCode,
      occurredAt: a.occurredAt,
      createdAt: a.createdAt,
      modifiedAt: a.modifiedAt,
      recordedAt: a.recordedAt,
      payload: a.payload,
    })
  }
  return out
}

/** Eventos en ventana Excel: patente + mismo journeyUid (egreso balanza sin OCR en patente). */
export function collectOperationWindowEvents(
  mov: ExcelMovimientoLike,
  events: RawJourneyEventLike[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number }
): RawJourneyEventLike[] {
  const padding = opts?.windowPaddingHours ?? 6
  const plateKey = normalizePlateKey(mov.plate)
  const { fromMs, toMs } = operationCaptureWindowMs(mov, padding)

  const byPlate: RawJourneyEventLike[] = []
  const journeyUids = new Set<string>()

  for (const e of events) {
    const plate = plateFromCameraAuditRow(e)
    if (!auditEventInOperationWindow(e, fromMs, toMs)) continue
    if (!plate || !platesMatchExcelCameraAudit(plateKey, plate)) continue
    byPlate.push(e)
    const uid = journeyUidFromRaw(e)
    if (uid) journeyUids.add(uid)
  }

  const seen = new Set(byPlate)
  const expanded = [...byPlate]

  for (const e of events) {
    const uid = journeyUidFromRaw(e)
    if (uid && journeyUids.has(uid) && auditEventInOperationWindow(e, fromMs, toMs) && !seen.has(e)) {
      seen.add(e)
      expanded.push(e)
    }
  }

  for (const e of events) {
    if (seen.has(e) || !auditEventInOperationWindow(e, fromMs, toMs)) continue
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!RIC_BALANZA_EGRESO_DEVICE_RE.test(dev)) continue
    const plate = plateFromCameraAuditRow(e)
    if (!plate || !platesMatchExcelCameraAudit(plateKey, plate)) continue
    seen.add(e)
    expanded.push(e)
    const uid = journeyUidFromRaw(e)
    if (uid) journeyUids.add(uid)
  }

  return expanded
}

export function extractCtgFromOperationId(operationId: string, ctgField?: string): string {
  const explicit = String(ctgField ?? '').trim()
  if (explicit) return explicit
  const id = String(operationId ?? '').trim()
  if (id.startsWith('CTG_')) return id.slice(4)
  return id
}

export function dayKeyFromSalida(externalSalidaAt?: string): string {
  const s = String(externalSalidaAt ?? '').trim()
  if (!s) return ''
  const d = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

export function operationCaptureWindowMs(
  mov: ExcelMovimientoLike,
  paddingHours = 6
): { fromMs: number; toMs: number } {
  const ing = parseInstantMs(mov.externalIngresoAt ?? '')
  const sal = parseInstantMs(mov.externalSalidaAt ?? '')
  const pad = paddingHours * 3600_000
  let fromMs = Number.isFinite(ing) ? ing - pad : Number.NaN
  let toMs = Number.isFinite(sal) ? sal + pad : Number.NaN
  if (!Number.isFinite(fromMs) && Number.isFinite(sal)) fromMs = sal - 48 * 3600_000
  if (!Number.isFinite(toMs) && Number.isFinite(ing)) toMs = ing + 48 * 3600_000
  return { fromMs, toMs }
}

export function indexEventsByPlate(
  events: RawJourneyEventLike[],
  preferCreatedAt = true
): Map<string, Array<{ ms: number; logicalCode: string }>> {
  const map = new Map<string, Array<{ ms: number; logicalCode: string }>>()
  for (const e of events) {
    const plate = plateFromCameraAuditRow(e)
    if (!plate) continue
    const logicalCode = eventLogicalCodeOperational(e)
    if (!logicalCode) continue
    const instant = operationalInstantIso(e, preferCreatedAt)
    const ms = parseInstantMs(instant)
    if (!Number.isFinite(ms)) continue
    const arr = map.get(plate) ?? []
    arr.push({ ms, logicalCode })
    map.set(plate, arr)
  }
  return map
}

export function buildExcelCameraMatrix(
  circuitCode: string,
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number; alerts?: CameraAuditAlertLike[] }
): CameraMatrixRow[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const corpus = buildCameraAuditCorpus(events, opts?.alerts)

  return movimientos.map((mov) => {
    const windowEvents = collectOperationWindowEvents(mov, corpus, opts)

    const captures: Record<string, boolean> = {}
    for (const step of steps) {
      captures[step.key] = windowEvents.some((e) => eventMatchesCameraStep(e, step))
    }

    return {
      ctg: mov.ctg,
      patente: mov.plate,
      diaEgreso: dayKeyFromSalida(mov.externalSalidaAt),
      captures,
    }
  })
}

export function countRowCapturePoints(row: CameraMatrixRow, circuitCode: string): number {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  return steps.filter((s) => row.captures[s.key]).length
}

/** Hitos que ensucian conclusiones generales del cuadro de calibración (no se usan en KPIs/brief). */
export const CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS = new Set(['balanza_egreso_slz'])

/** Puntos de “descarga” por circuito (Celda 16 / Volcable). */
export const DESCARGA_CAMERA_STEP_KEYS = new Set(['celda16_descarga', 'volcable'])

export function getCalibrationAnalysisSteps(circuitCode: string): readonly ExcelCameraStep[] {
  return getExcelCameraStepsForCircuit(circuitCode).filter(
    (s) => !CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS.has(s.key)
  )
}

export function countRowCapturePointsForCalibration(
  row: CameraMatrixRow,
  circuitCode: string
): number {
  return getCalibrationAnalysisSteps(circuitCode).filter((s) => row.captures[s.key]).length
}

export type PointCaptureDepthSummary = {
  total: number
  /** Camiones con todos los hitos de análisis capturados. */
  allPoints: number
  /** Todos los hitos de análisis excepto descarga (celda16/volcable). */
  allExceptDescarga: number
  /** Exactamente 3 hitos de análisis capturados. */
  exactly3Points: number
  analysisStepCount: number
  descargaStepKeys: string[]
}

/** Profundidad de lectura por camión (usa hitos de calibración, sin balanza egreso SL). */
export function summarizePointCaptureDepth(
  circuitCode: string,
  rows: CameraMatrixRow[]
): PointCaptureDepthSummary {
  const steps = getCalibrationAnalysisSteps(circuitCode)
  const descargaStepKeys = steps
    .filter((s) => DESCARGA_CAMERA_STEP_KEYS.has(s.key))
    .map((s) => s.key)
  const nonDescarga = steps.filter((s) => !DESCARGA_CAMERA_STEP_KEYS.has(s.key))
  let allPoints = 0
  let allExceptDescarga = 0
  let exactly3Points = 0
  for (const row of rows) {
    const n = steps.filter((s) => row.captures[s.key]).length
    if (steps.length > 0 && n === steps.length) allPoints += 1
    if (nonDescarga.length > 0 && nonDescarga.every((s) => row.captures[s.key])) {
      allExceptDescarga += 1
    }
    if (n === 3) exactly3Points += 1
  }
  return {
    total: rows.length,
    allPoints,
    allExceptDescarga,
    exactly3Points,
    analysisStepCount: steps.length,
    descargaStepKeys,
  }
}

export type RouteRecognitionSummary = {
  minPoints: number
  recognizedCount: number
  total: number
  recognizedRatePct: number
}

/** Camiones con al menos `minPoints` hitos de cámara SI en el recorrido del circuito. */
export function summarizeRouteRecognition(
  circuitCode: string,
  rows: CameraMatrixRow[],
  minPoints = 4
): RouteRecognitionSummary {
  const total = rows.length
  const recognizedCount = rows.filter(
    (r) => countRowCapturePoints(r, circuitCode) >= minPoints
  ).length
  const recognizedRatePct =
    total > 0 ? Math.round((recognizedCount / total) * 10000) / 100 : 0
  return { minPoints, recognizedCount, total, recognizedRatePct }
}

/** Reconocimiento para el cuadro general de calibración (excluye balanza egreso SL). */
export function summarizeRouteRecognitionForCalibration(
  circuitCode: string,
  rows: CameraMatrixRow[],
  minPoints = 4
): RouteRecognitionSummary {
  const total = rows.length
  const recognizedCount = rows.filter(
    (r) => countRowCapturePointsForCalibration(r, circuitCode) >= minPoints
  ).length
  const recognizedRatePct =
    total > 0 ? Math.round((recognizedCount / total) * 10000) / 100 : 0
  return { minPoints, recognizedCount, total, recognizedRatePct }
}

export function summarizeExcelCameraMatrix(
  circuitCode: string,
  rows: CameraMatrixRow[]
): CameraStepSummary[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const total = rows.length
  return steps.map((step) => {
    const captured = rows.filter((r) => r.captures[step.key]).length
    const captureRatePct = total > 0 ? Math.round((captured / total) * 10000) / 100 : 0
    const errorRatePct = total > 0 ? Math.round((1 - captured / total) * 10000) / 100 : 0
    return {
      key: step.key,
      header: step.header,
      logicalCode: step.logicalCode,
      captured,
      total,
      captureRatePct,
      errorRatePct,
    }
  })
}

export function excelCameraMatrixToCsv(
  circuitCode: string,
  rows: CameraMatrixRow[],
  summaries?: CameraStepSummary[],
  routeRecognition?: RouteRecognitionSummary
): string {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'ctg',
    'patente',
    'dia_egreso',
    'puntos_capturados',
    ...steps.map((s) => s.header),
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const puntos = countRowCapturePoints(r, circuitCode)
    lines.push(
      [
        r.ctg,
        r.patente,
        r.diaEgreso,
        puntos,
        ...steps.map((s) => (r.captures[s.key] ? 'SI' : 'NO')),
      ]
        .map(esc)
        .join(',')
    )
  }
  if (summaries?.length) {
    lines.push('')
    lines.push(['RESUMEN', '', 'total_camiones', String(rows.length)].map(esc).join(','))
    if (routeRecognition) {
      lines.push(
        [
          `reconocidos_${routeRecognition.minPoints}_puntos_o_mas`,
          '',
          `${routeRecognition.recognizedCount}/${routeRecognition.total}`,
          `${routeRecognition.recognizedRatePct}%`,
        ]
          .map(esc)
          .join(',')
      )
    }
    for (const s of summaries) {
      lines.push(
        [
          s.header,
          '',
          `${s.captured}/${s.total}`,
          `${s.captureRatePct}%`,
          `error_${s.errorRatePct}%`,
        ]
          .map(esc)
          .join(',')
      )
    }
  }
  return lines.join('\n')
}

/** Mapeo DTO API → filas de auditoría (incluye rawTruckPlate de balanza egreso). */
export function realJourneyEventDtoToCameraAuditRow(e: RealJourneyEventDto): RawJourneyEventLike {
  return {
    journeyUid: e.journeyUid,
    truckPlate: e.truckPlate,
    normalizedPlate: e.normalizedPlate,
    rawTruckPlate: e.rawTruckPlate,
    deviceCode: e.deviceCode,
    sectorCode: e.sectorCode,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
    modifiedAt: e.modifiedAt,
    recordedAt: e.recordedAt,
  }
}

export function formatExcelCameraSummaryLog(
  circuitCode: string,
  summaries: CameraStepSummary[],
  total: number,
  routeRecognition?: RouteRecognitionSummary
): string {
  const code = String(circuitCode).trim().toUpperCase()
  const lines = [
    `=== Matriz ${code}: captura por cámara (crudo vs listado Excel) ===`,
    `Total camiones ${code}: ${total}`,
  ]
  if (routeRecognition) {
    lines.push(
      `Reconocidos en >= ${routeRecognition.minPoints} puntos del recorrido: ${routeRecognition.recognizedCount}/${routeRecognition.total} (${routeRecognition.recognizedRatePct}%)`
    )
  }
  lines.push('', 'columna | capturados | % ok | % error (no leído)')
  for (const s of summaries) {
    lines.push(
      `${s.header} | ${s.captured}/${s.total} | ${s.captureRatePct}% | ${s.errorRatePct}%`
    )
  }
  return lines.join('\n')
}
