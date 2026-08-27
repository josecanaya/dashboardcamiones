/**
 * Comparativa Excel (movimientos por contrato) vs captura por hito de cámara en eventos crudos.
 * Misma lógica que scripts/audit-excel-camera-matrix.mjs, para UI Workbench.
 */

import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import {
  buildExcelCameraMatrix,
  summarizeExcelCameraMatrix,
  summarizeRouteRecognition,
  realJourneyEventDtoToCameraAuditRow,
  type CameraMatrixRow,
  type CameraStepSummary,
  type RouteRecognitionSummary,
  AUDIT_CIRCUIT_CODES,
  type CameraAuditAlertLike,
} from './auditExcelCameraMatrix'
import {
  buildCameraCalibrationReport,
  type CameraCalibrationReport,
} from './auditExcelCameraCalibration'
import {
  buildExcelMovimientosUniverse,
  computeExcelPeriodTotals,
  parseNormalizedMovimientosCsvRow,
  type ExcelPeriodTotals,
  type MovimientoContratoLike,
} from './auditExcelMovimientosSource'

export type CircuitCameraComparativa = {
  circuitCode: string
  excelCamiones: number
  summaries: CameraStepSummary[]
  routeRecognition: RouteRecognitionSummary
  matrixRows: CameraMatrixRow[]
  calibration: CameraCalibrationReport
}

export type ExcelCameraComparativaReport = {
  periodTotals: ExcelPeriodTotals
  fromDay?: string
  toDay?: string
  rawEventCount: number
  circuits: CircuitCameraComparativa[]
}

export function parseMovimientosFromNormalizedCsv(csv: string): MovimientoContratoLike[] {
  const body = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv
  const lines = body.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const rows: MovimientoContratoLike[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!)
    const rec: Record<string, string> = {}
    headers.forEach((h, idx) => {
      rec[h] = cols[idx] ?? ''
    })
    rows.push(parseNormalizedMovimientosCsvRow(rec))
  }
  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQ = false
      } else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

export function buildExcelCameraComparativaReport(input: {
  movimientos: MovimientoContratoLike[]
  events: RealJourneyEventDto[]
  alerts?: RealAlertDto[]
  fromDay?: string
  toDay?: string
  minRoutePoints?: number
}): ExcelCameraComparativaReport {
  const periodTotals = computeExcelPeriodTotals(input.movimientos, input.fromDay, input.toDay)
  const minRoutePoints = input.minRoutePoints ?? 4
  const circuits: CircuitCameraComparativa[] = []
  const alertRows: CameraAuditAlertLike[] = (input.alerts ?? []).map((a) => ({
    journeyUid: a.journeyUid,
    journeyUuid: a.journeyUuid,
    truckPlate: a.truckPlate,
    deviceCode: a.deviceCode,
    sectorCode: a.sectorCode,
    occurredAt: a.occurredAt,
    createdAt: a.createdAt,
    modifiedAt: a.modifiedAt,
    recordedAt: a.recordedAt,
    payload: a.payload,
  }))
  const eventRows = input.events.map(realJourneyEventDtoToCameraAuditRow)

  for (const circuitCode of AUDIT_CIRCUIT_CODES) {
    const universe = buildExcelMovimientosUniverse(input.movimientos, circuitCode, {
      fromDay: input.fromDay,
      toDay: input.toDay,
    })
    if (universe.length === 0) continue
    const matrixRows = buildExcelCameraMatrix(circuitCode, universe, eventRows, {
      alerts: alertRows,
    })
    const summaries = summarizeExcelCameraMatrix(circuitCode, matrixRows)
    const routeRecognition = summarizeRouteRecognition(circuitCode, matrixRows, minRoutePoints)
    const calibration = buildCameraCalibrationReport(circuitCode, universe, eventRows, {
      alerts: alertRows,
      minRoutePoints,
    })
    circuits.push({
      circuitCode,
      excelCamiones: universe.length,
      summaries,
      routeRecognition,
      matrixRows,
      calibration,
    })
  }

  return {
    periodTotals,
    fromDay: input.fromDay,
    toDay: input.toDay,
    rawEventCount: input.events.length,
    circuits,
  }
}
