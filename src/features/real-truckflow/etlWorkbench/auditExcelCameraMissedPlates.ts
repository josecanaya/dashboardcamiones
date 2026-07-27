/**
 * Patentes en Excel sin lectura efectiva por cámara / hito (export DSS).
 */

import {
  cameraAuditIndexFor,
  collectOperationWindowEvents,
  eventMatchesCameraStep,
  getExcelCameraStepsForCircuit,
  plateFromCameraAuditRow,
  type ExcelCameraStep,
  type ExcelMovimientoLike,
  type RawJourneyEventLike,
  type CameraAuditAlertLike,
} from './auditExcelCameraMatrix'
import type { CameraMatrixDetailRow, DayNight, RecognitionSegment } from './auditCameraCalibrationTypes'
import { turnoLabel } from './operationalTurno'
import { operationalInstantIso } from './auditSlCameraExcelCoverage'

export type MissedPlateMotivo = 'sin_evento_en_ventana' | 'lectura_sin_hito'

export type MissedPlateByCameraRow = {
  circuito: string
  deviceCode: string
  sectorCode: string
  stepKey: string
  hitoHeader: string
  logicalCode: string
  ctg: string
  patente: string
  diaEgreso: string
  dayNight: DayNight
  recognitionSegment: RecognitionSegment
  puntosCapturados: number
  hitosOk: string
  excelIngresoAt: string
  excelSalidaAt: string
  motivo: MissedPlateMotivo
  /** Eventos del device en ventana (misma patente / journey). */
  deviceEventsInWindow: number
  /** Mejor instante del device en ventana (si hay). */
  ultimaLecturaDeviceAt: string
  /** Patente leída en ese evento (puede diferir por OCR). */
  ultimaPatenteLeida: string
}

export function indexDevicesByStepKey(
  corpus: RawJourneyEventLike[],
  circuitCode: string
): Map<string, string[]> {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const sets = new Map<string, Set<string>>()
  for (const step of steps) sets.set(step.key, new Set())
  for (const e of corpus) {
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!dev) continue
    for (const step of steps) {
      if (eventMatchesCameraStep(e, step)) sets.get(step.key)!.add(dev)
    }
  }
  const out = new Map<string, string[]>()
  for (const [k, set] of sets) out.set(k, [...set].sort())
  return out
}

function hitosOkLabel(row: CameraMatrixDetailRow, circuitCode: string): string {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  return steps
    .filter((s) => row.captures[s.key])
    .map((s) => s.header)
    .join('|')
}

function deviceEventsInWindow(
  windowEvents: RawJourneyEventLike[],
  deviceCode: string
): RawJourneyEventLike[] {
  const dev = deviceCode.trim()
  return windowEvents.filter((e) => String(e.deviceCode ?? e.device_code ?? '').trim() === dev)
}

function lastReadFromEvents(events: RawJourneyEventLike[]): {
  instant: string
  plate: string
} {
  let best = { instant: '', plate: '', ms: -1 }
  for (const e of events) {
    const instant = operationalInstantIso(e, true)
    const ms = Date.parse(instant)
    if (!Number.isFinite(ms) || ms < best.ms) continue
    best = { instant, plate: plateFromCameraAuditRow(e), ms }
  }
  return { instant: best.instant, plate: best.plate }
}

function motivoForDeviceMiss(
  windowEvents: RawJourneyEventLike[],
  deviceCode: string,
  step: ExcelCameraStep
): { motivo: MissedPlateMotivo; deviceEventsInWindow: number; ultimaLecturaDeviceAt: string; ultimaPatenteLeida: string } {
  const devEvents = deviceEventsInWindow(windowEvents, deviceCode)
  const last = lastReadFromEvents(devEvents)
  if (!devEvents.length) {
    return {
      motivo: 'sin_evento_en_ventana',
      deviceEventsInWindow: 0,
      ultimaLecturaDeviceAt: '',
      ultimaPatenteLeida: '',
    }
  }
  const matched = devEvents.some((e) => eventMatchesCameraStep(e, step))
  if (!matched) {
    return {
      motivo: 'lectura_sin_hito',
      deviceEventsInWindow: devEvents.length,
      ultimaLecturaDeviceAt: last.instant,
      ultimaPatenteLeida: last.plate,
    }
  }
  return {
    motivo: 'sin_evento_en_ventana',
    deviceEventsInWindow: devEvents.length,
    ultimaLecturaDeviceAt: last.instant,
    ultimaPatenteLeida: last.plate,
  }
}

/** Una fila por (camión Excel, hito fallido, cámara asociada al hito en el corpus). */
export function buildMissedPlatesByCamera(
  circuitCode: string,
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  detailRows: CameraMatrixDetailRow[],
  opts?: {
    preferCreatedAt?: boolean
    windowPaddingHours?: number
    alerts?: CameraAuditAlertLike[]
  }
): MissedPlateByCameraRow[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const index = cameraAuditIndexFor(events, opts?.alerts)
  const corpus = index.corpus
  const devicesByStep = indexDevicesByStepKey(corpus, circuitCode)
  const movByKey = new Map(movimientos.map((m) => [`${m.ctg}|${m.plate}`, m]))

  const out: MissedPlateByCameraRow[] = []

  for (const row of detailRows) {
    const mov = movByKey.get(`${row.ctg}|${row.patente}`)
    const windowEvents = mov ? collectOperationWindowEvents(mov, index, opts) : []

    for (const step of steps) {
      if (row.captures[step.key]) continue

      const devices = devicesByStep.get(step.key) ?? []
      const deviceList = devices.length ? devices : ['']

      for (const deviceCode of deviceList) {
        const sectorCode =
          deviceCode ? (index.deviceSectors.get(deviceCode) ?? '') : ''
        const m = deviceCode ?
          motivoForDeviceMiss(windowEvents, deviceCode, step)
        : {
            motivo: 'sin_evento_en_ventana' as const,
            deviceEventsInWindow: 0,
            ultimaLecturaDeviceAt: '',
            ultimaPatenteLeida: '',
          }

        out.push({
          circuito: circuitCode,
          deviceCode: deviceCode || `(hito_${step.key})`,
          sectorCode,
          stepKey: step.key,
          hitoHeader: step.header,
          logicalCode: step.logicalCode,
          ctg: row.ctg,
          patente: row.patente,
          diaEgreso: row.diaEgreso,
          dayNight: row.dayNight,
          recognitionSegment: row.recognitionSegment,
          puntosCapturados: row.pointsCaptured,
          hitosOk: hitosOkLabel(row, circuitCode),
          excelIngresoAt: String(mov?.externalIngresoAt ?? ''),
          excelSalidaAt: String(mov?.externalSalidaAt ?? ''),
          motivo: m.motivo,
          deviceEventsInWindow: m.deviceEventsInWindow,
          ultimaLecturaDeviceAt: m.ultimaLecturaDeviceAt,
          ultimaPatenteLeida: m.ultimaPatenteLeida,
        })
      }
    }
  }

  return out.sort(
    (a, b) =>
      a.deviceCode.localeCompare(b.deviceCode) ||
      a.stepKey.localeCompare(b.stepKey) ||
      a.patente.localeCompare(b.patente)
  )
}


export function summarizeMissedPlatesByDevice(rows: MissedPlateByCameraRow[]): Array<{
  deviceCode: string
  missedRows: number
  uniquePlates: number
}> {
  const map = new Map<string, { rows: number; plates: Set<string> }>()
  for (const r of rows) {
    const cur = map.get(r.deviceCode) ?? { rows: 0, plates: new Set() }
    cur.rows += 1
    cur.plates.add(r.patente)
    map.set(r.deviceCode, cur)
  }
  return [...map.entries()]
    .map(([deviceCode, v]) => ({
      deviceCode,
      missedRows: v.rows,
      uniquePlates: v.plates.size,
    }))
    .sort((a, b) => b.uniquePlates - a.uniquePlates || a.deviceCode.localeCompare(b.deviceCode))
}

export function missedPlatesByCameraToCsv(rows: MissedPlateByCameraRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'circuito',
    'device_code',
    'sector_code',
    'hito',
    'logical_code',
    'ctg',
    'patente',
    'dia_egreso',
    'turno',
    'segmento_reconocimiento',
    'puntos_capturados',
    'hitos_ok',
    'excel_ingreso_at',
    'excel_salida_at',
    'motivo',
    'device_events_en_ventana',
    'ultima_lectura_device_at',
    'ultima_patente_leida',
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.circuito,
        r.deviceCode,
        r.sectorCode,
        r.hitoHeader,
        r.logicalCode,
        r.ctg,
        r.patente,
        r.diaEgreso,
        r.dayNight === 'unknown' ? '—' : turnoLabel(r.dayNight),
        r.recognitionSegment,
        r.puntosCapturados,
        r.hitosOk,
        r.excelIngresoAt,
        r.excelSalidaAt,
        r.motivo,
        r.deviceEventsInWindow,
        r.ultimaLecturaDeviceAt,
        r.ultimaPatenteLeida,
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n')
}
