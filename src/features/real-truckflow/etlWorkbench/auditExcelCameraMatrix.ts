/**
 * Matriz Excel por circuito: CTG, patente, día egreso + SI/NO por hito de cámara en crudo.
 */

import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import { operationalInstantIso, parseInstantMs, normalizePlateKey } from './auditSlCameraExcelCoverage'

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
    truckPlate: String(e.truckPlate ?? e.normalizedPlate ?? ''),
    deviceCode: String(e.deviceCode ?? e.device_code ?? ''),
    sectorCode: String(e.sectorCode ?? e.sector_code ?? ''),
    occurredAt: String(e.occurredAt ?? e.occurred_at ?? ''),
    createdAt: String(e.createdAt ?? e.created_at ?? ''),
    modifiedAt: String(e.modifiedAt ?? e.modified_at ?? ''),
    recordedAt: String(e.recordedAt ?? e.recorded_at ?? ''),
  } as RealJourneyEventDto
}

export function eventLogicalCodeOperational(e: RawJourneyEventLike): string {
  try {
    const pt = normalizeRealEventPoint(toEventDto(e))
    const code = String(pt.logicalCode ?? '').trim()
    if (code.includes('EXCLUIDA') || code.includes('TRASERA')) return ''
    return code
  } catch {
    return ''
  }
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
    const plate =
      normalizePlateKey(e.normalizedPlate ?? '') || normalizePlateKey(e.truckPlate ?? '')
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
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number }
): CameraMatrixRow[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const preferCreatedAt = opts?.preferCreatedAt !== false
  const padding = opts?.windowPaddingHours ?? 6
  const byPlate = indexEventsByPlate(events, preferCreatedAt)

  return movimientos.map((mov) => {
    const plateKey = normalizePlateKey(mov.plate)
    const hits = byPlate.get(plateKey) ?? []
    const { fromMs, toMs } = operationCaptureWindowMs(mov, padding)
    const inWindow =
      Number.isFinite(fromMs) && Number.isFinite(toMs) ?
        hits.filter((h) => h.ms >= fromMs && h.ms <= toMs)
      : hits

    const captures: Record<string, boolean> = {}
    for (const step of steps) {
      captures[step.key] = inWindow.some((h) => h.logicalCode === step.logicalCode)
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
