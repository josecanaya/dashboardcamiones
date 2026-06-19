/**
 * Compatibilidad R7 sobre auditExcelCameraMatrix.
 */
import {
  buildExcelCameraMatrix,
  summarizeExcelCameraMatrix,
  excelCameraMatrixToCsv,
  formatExcelCameraSummaryLog,
  type ExcelMovimientoLike,
  type RawJourneyEventLike,
} from './auditExcelCameraMatrix'

export {
  R7_EXCEL_CAMERA_STEPS,
  type RawJourneyEventLike,
  type ExcelMovimientoLike as R7ExcelMovimientoLike,
  type CameraMatrixRow as R7CameraMatrixRow,
  type CameraStepSummary as R7CameraStepSummary,
  eventLogicalCodeOperational,
  extractCtgFromOperationId,
  dayKeyFromSalida,
  operationCaptureWindowMs,
  indexEventsByPlate as indexR7EventsByPlate,
} from './auditExcelCameraMatrix'

export function buildR7CameraMatrix(
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number }
) {
  return buildExcelCameraMatrix('R7', movimientos, events, opts)
}

export function summarizeR7CameraMatrix(
  rows: Parameters<typeof summarizeExcelCameraMatrix>[1]
) {
  return summarizeExcelCameraMatrix('R7', rows)
}

export function r7CameraMatrixToCsv(
  rows: Parameters<typeof excelCameraMatrixToCsv>[1],
  summaries?: Parameters<typeof excelCameraMatrixToCsv>[2]
) {
  return excelCameraMatrixToCsv('R7', rows, summaries)
}

export function formatR7CameraSummaryLog(
  summaries: Parameters<typeof formatExcelCameraSummaryLog>[1],
  total: number
) {
  return formatExcelCameraSummaryLog('R7', summaries, total)
}
