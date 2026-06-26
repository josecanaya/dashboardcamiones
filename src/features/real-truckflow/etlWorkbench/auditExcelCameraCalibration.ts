/**
 * Diagnóstico de calibración: reconocidos vs no, por cámara (device) y turno operativo.
 * Construido sobre la matriz Excel ↔ eventos crudos.
 */

import {
  buildCameraAuditCorpus,
  collectOperationWindowEvents,
  countRowCapturePoints,
  dayKeyFromSalida,
  eventMatchesCameraStep,
  getExcelCameraStepsForCircuit,
  plateFromCameraAuditRow,
  type CameraMatrixRow,
  type ExcelCameraStep,
  type ExcelMovimientoLike,
  type RawJourneyEventLike,
  type CameraAuditAlertLike,
} from './auditExcelCameraMatrix'
import type { MissedPlateByCameraRow } from './auditExcelCameraMissedPlates'
import { buildMissedPlatesByCamera } from './auditExcelCameraMissedPlates'
import { operationalInstantIso } from './auditSlCameraExcelCoverage'
import {
  turnoForMovimiento,
  turnoLabel,
  TURNOS_OPERATIVOS,
  type Turno,
} from './operationalTurno'

export type { Turno }
export type DayNight = Turno
export { turnoFromIso, turnoLabel, turnoForMovimiento, TURNOS_OPERATIVOS } from './operationalTurno'
/** @deprecated use turnoFromIso */
export { turnoFromIso as dayNightLabelFromIso } from './operationalTurno'

export type RecognitionSegment = 'reconocido' | 'parcial' | 'no_reconocido'

export type CameraMatrixDetailRow = CameraMatrixRow & {
  pointsCaptured: number
  recognitionSegment: RecognitionSegment
  dayNight: Turno
  /** Por hito: deviceCode que disparó la captura (puede haber varios). */
  devicesByStep: Record<string, string[]>
}

export type RecognitionDayNightSummary = {
  dayNight: Turno
  recognitionSegment: RecognitionSegment
  truckCount: number
}

export type StepDayNightSummary = {
  stepKey: string
  header: string
  logicalCode: string
  dayNight: Turno
  captured: number
  missed: number
  total: number
  captureRatePct: number
}

export type DeviceStepSummary = {
  deviceCode: string
  sectorCode: string
  stepKey: string
  header: string
  logicalCode: string
  dayNight: Turno
  /** Camiones Excel con lectura de este device en el hito (ventana operación). */
  trucksWithDeviceHit: number
  /** Camiones Excel sin captura en ese hito (oportunidad de mejora). */
  trucksMissingStep: number
  /** Camiones con hito OK donde este device participó. */
  trucksContributingToCapture: number
}

export type CameraCalibrationReport = {
  circuitCode: string
  minRoutePoints: number
  detailRows: CameraMatrixDetailRow[]
  recognitionByDayNight: RecognitionDayNightSummary[]
  stepByDayNight: StepDayNightSummary[]
  deviceByStep: DeviceStepSummary[]
  missedPlatesByCamera: MissedPlateByCameraRow[]
}

export function classifyRecognitionSegment(
  pointsCaptured: number,
  minRoutePoints: number
): RecognitionSegment {
  if (pointsCaptured >= minRoutePoints) return 'reconocido'
  if (pointsCaptured > 0) return 'parcial'
  return 'no_reconocido'
}

function dayNightForMovimiento(mov: ExcelMovimientoLike): Turno {
  return turnoForMovimiento(mov.externalSalidaAt, mov.externalIngresoAt)
}

function devicesMatchingStep(
  windowEvents: RawJourneyEventLike[],
  step: ExcelCameraStep
): string[] {
  const set = new Set<string>()
  for (const e of windowEvents) {
    if (!eventMatchesCameraStep(e, step)) continue
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (dev) set.add(dev)
  }
  return [...set].sort()
}

function sectorForDevice(events: RawJourneyEventLike[], deviceCode: string): string {
  for (const e of events) {
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (dev !== deviceCode) continue
    const sec = String(e.sectorCode ?? e.sector_code ?? '').trim()
    if (sec) return sec
  }
  return ''
}

export function buildExcelCameraMatrixDetailed(
  circuitCode: string,
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  opts?: {
    preferCreatedAt?: boolean
    windowPaddingHours?: number
    alerts?: CameraAuditAlertLike[]
    minRoutePoints?: number
  }
): CameraMatrixDetailRow[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const minRoutePoints = opts?.minRoutePoints ?? 4
  const corpus = buildCameraAuditCorpus(events, opts?.alerts)

  return movimientos.map((mov) => {
    const windowEvents = collectOperationWindowEvents(mov, corpus, opts)
    const captures: Record<string, boolean> = {}
    const devicesByStep: Record<string, string[]> = {}

    for (const step of steps) {
      const devs = devicesMatchingStep(windowEvents, step)
      devicesByStep[step.key] = devs
      captures[step.key] = devs.length > 0
    }

    const base: CameraMatrixRow = {
      ctg: mov.ctg,
      patente: mov.plate,
      diaEgreso: dayKeyFromSalida(mov.externalSalidaAt),
      captures,
    }
    const pointsCaptured = countRowCapturePoints(base, circuitCode)

    return {
      ...base,
      pointsCaptured,
      recognitionSegment: classifyRecognitionSegment(pointsCaptured, minRoutePoints),
      dayNight: dayNightForMovimiento(mov),
      devicesByStep,
    }
  })
}

export function summarizeRecognitionByDayNight(
  rows: CameraMatrixDetailRow[]
): RecognitionDayNightSummary[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.dayNight}|${r.recognitionSegment}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  const orderSeg: RecognitionSegment[] = ['reconocido', 'parcial', 'no_reconocido']
  const orderDn: Turno[] = [...TURNOS_OPERATIVOS, 'unknown']
  const out: RecognitionDayNightSummary[] = []
  for (const dayNight of orderDn) {
    for (const recognitionSegment of orderSeg) {
      const n = map.get(`${dayNight}|${recognitionSegment}`) ?? 0
      if (n > 0) out.push({ dayNight, recognitionSegment, truckCount: n })
    }
  }
  return out
}

export function summarizeStepByDayNight(
  circuitCode: string,
  rows: CameraMatrixDetailRow[]
): StepDayNightSummary[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const map = new Map<string, { captured: number; total: number }>()

  for (const r of rows) {
    for (const step of steps) {
      const key = `${r.dayNight}|${step.key}`
      const cur = map.get(key) ?? { captured: 0, total: 0 }
      cur.total += 1
      if (r.captures[step.key]) cur.captured += 1
      map.set(key, cur)
    }
  }

  const out: StepDayNightSummary[] = []
  for (const step of steps) {
    for (const dayNight of [...TURNOS_OPERATIVOS, 'unknown'] as Turno[]) {
      const cur = map.get(`${dayNight}|${step.key}`)
      if (!cur?.total) continue
      const missed = cur.total - cur.captured
      const captureRatePct =
        cur.total > 0 ? Math.round((cur.captured / cur.total) * 10000) / 100 : 0
      out.push({
        stepKey: step.key,
        header: step.header,
        logicalCode: step.logicalCode,
        dayNight,
        captured: cur.captured,
        missed,
        total: cur.total,
        captureRatePct,
      })
    }
  }
  return out
}

export function summarizeDeviceByStep(
  circuitCode: string,
  rows: CameraMatrixDetailRow[],
  corpus: RawJourneyEventLike[]
): DeviceStepSummary[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const map = new Map<
    string,
    DeviceStepSummary & { _missingStepTally: number }
  >()

  function getOrCreate(
    deviceCode: string,
    sectorCode: string,
    step: ExcelCameraStep,
    dayNight: Turno
  ) {
    const key = `${deviceCode}|${step.key}|${dayNight}`
    let b = map.get(key)
    if (!b) {
      b = {
        deviceCode,
        sectorCode,
        stepKey: step.key,
        header: step.header,
        logicalCode: step.logicalCode,
        dayNight,
        trucksWithDeviceHit: 0,
        trucksMissingStep: 0,
        trucksContributingToCapture: 0,
        _missingStepTally: 0,
      }
      map.set(key, b)
    }
    return b
  }

  for (const r of rows) {
    for (const step of steps) {
      const devs = r.devicesByStep[step.key] ?? []
      if (devs.length) {
        for (const dev of devs) {
          const sec = sectorForDevice(corpus, dev)
          const b = getOrCreate(dev, sec, step, r.dayNight)
          b.trucksContributingToCapture += 1
          b.trucksWithDeviceHit += 1
        }
      }
    }
  }

  const missingByStepDn = new Map<string, number>()
  for (const r of rows) {
    for (const step of steps) {
      if (r.captures[step.key]) continue
      const k = `${step.key}|${r.dayNight}`
      missingByStepDn.set(k, (missingByStepDn.get(k) ?? 0) + 1)
    }
  }

  return [...map.values()]
    .map(({ _missingStepTally: _, ...b }) => ({
      ...b,
      trucksMissingStep: missingByStepDn.get(`${b.stepKey}|${b.dayNight}`) ?? 0,
    }))
    .sort(
      (a, b) =>
        a.dayNight.localeCompare(b.dayNight) ||
        a.header.localeCompare(b.header) ||
        b.trucksContributingToCapture - a.trucksContributingToCapture ||
        a.deviceCode.localeCompare(b.deviceCode)
    )
}

export function buildCameraCalibrationReport(
  circuitCode: string,
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  opts?: {
    preferCreatedAt?: boolean
    windowPaddingHours?: number
    alerts?: CameraAuditAlertLike[]
    minRoutePoints?: number
  }
): CameraCalibrationReport {
  const minRoutePoints = opts?.minRoutePoints ?? 4
  const corpus = buildCameraAuditCorpus(events, opts?.alerts)
  const detailRows = buildExcelCameraMatrixDetailed(circuitCode, movimientos, events, opts)
  const missedPlatesByCamera = buildMissedPlatesByCamera(
    circuitCode,
    movimientos,
    events,
    detailRows,
    opts
  )

  return {
    circuitCode,
    minRoutePoints,
    detailRows,
    recognitionByDayNight: summarizeRecognitionByDayNight(detailRows),
    stepByDayNight: summarizeStepByDayNight(circuitCode, detailRows),
    deviceByStep: summarizeDeviceByStep(circuitCode, detailRows, corpus),
    missedPlatesByCamera,
  }
}

export function cameraCalibrationDetailToCsv(rows: CameraMatrixDetailRow[], circuitCode: string): string {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'ctg',
    'patente',
    'dia_egreso',
    'turno',
    'puntos_capturados',
    'segmento_reconocimiento',
    ...steps.map((s) => s.header),
    ...steps.map((s) => `${s.header}_devices`),
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.ctg,
        r.patente,
        r.diaEgreso,
        r.dayNight === 'unknown' ? '—' : turnoLabel(r.dayNight),
        r.pointsCaptured,
        r.recognitionSegment,
        ...steps.map((s) => (r.captures[s.key] ? 'SI' : 'NO')),
        ...steps.map((s) => (r.devicesByStep[s.key] ?? []).join('|')),
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n')
}

export function cameraCalibrationAggregatesToCsv(report: CameraCalibrationReport): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = [`# circuito,${report.circuitCode}`, '']

  lines.push('TURNO_POR_SEGMENTO')
  lines.push('turno,segmento,camiones')
  for (const r of report.recognitionByDayNight) {
    lines.push([turnoLabel(r.dayNight), r.recognitionSegment, r.truckCount].map(esc).join(','))
  }

  lines.push('', 'HITO_POR_TURNO')
  lines.push('turno,hito,logical,capturados,perdidos,total,pct_captura')
  for (const s of report.stepByDayNight) {
    lines.push(
      [turnoLabel(s.dayNight), s.header, s.logicalCode, s.captured, s.missed, s.total, `${s.captureRatePct}%`]
        .map(esc)
        .join(',')
    )
  }

  lines.push('', 'DEVICE_POR_HITO_TURNO')
  lines.push(
    'turno,device_code,sector,hito,logical,aportes_captura,lecturas_device,faltantes_hito'
  )
  for (const d of report.deviceByStep) {
    if (d.deviceCode.startsWith('(')) continue
    lines.push(
      [
        turnoLabel(d.dayNight),
        d.deviceCode,
        d.sectorCode,
        d.header,
        d.logicalCode,
        d.trucksContributingToCapture,
        d.trucksWithDeviceHit,
        d.trucksMissingStep,
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n')
}

/** Lecturas crudas con patente en ventana (para cruce manual). */
export function listRawReadsInOperationWindow(
  mov: ExcelMovimientoLike,
  events: RawJourneyEventLike[],
  opts?: { alerts?: CameraAuditAlertLike[] }
): Array<{ deviceCode: string; instant: string; plate: string; logicalCode: string }> {
  const corpus = buildCameraAuditCorpus(events, opts?.alerts)
  const windowEvents = collectOperationWindowEvents(mov, corpus, opts)
  const out: Array<{ deviceCode: string; instant: string; plate: string; logicalCode: string }> = []
  for (const e of windowEvents) {
    const plate = plateFromCameraAuditRow(e)
    if (!plate) continue
    const instant = operationalInstantIso(e, true)
    if (!instant) continue
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    const steps = eventLogicalCodesForEvent(e)
    out.push({ deviceCode: dev, instant, plate, logicalCode: steps.join('+') || '?' })
  }
  return out
}

function eventLogicalCodesForEvent(e: RawJourneyEventLike): string[] {
  const codes: string[] = []
  for (const code of [
    'INGRESO',
    'PREINGRESO',
    'CALADA',
    'EGRESO',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'CELDA16_DESCARGA',
    'VOLCABLE',
    'SL_INGRESO',
    'SL_BALANZA_INGRESO',
    'SL_BALANZA_SALIDA',
    'SL_EGRESO',
  ]) {
    const step = { key: code, header: code, logicalCode: code } as ExcelCameraStep
    if (eventMatchesCameraStep(e, step)) codes.push(code)
  }
  return codes
}
