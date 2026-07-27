/**
 * Tipos compartidos de la auditoría de calibración de cámaras.
 *
 * Viven acá (módulo leaf respecto de `auditExcelCameraCalibration`) para cortar el ciclo
 * `auditExcelCameraCalibration ↔ auditExcelCameraMissedPlates`: missedPlates solo necesitaba
 * estos tipos, mientras que calibration necesita `buildMissedPlatesByCamera` de missedPlates.
 *
 * `auditExcelCameraCalibration` los re-exporta para no romper imports existentes.
 */
import type { CameraMatrixRow } from './auditExcelCameraMatrix'
import type { Turno } from './operationalTurno'

export type DayNight = Turno

export type RecognitionSegment = 'reconocido' | 'parcial' | 'no_reconocido'

export type CameraMatrixDetailRow = CameraMatrixRow & {
  pointsCaptured: number
  recognitionSegment: RecognitionSegment
  dayNight: Turno
  /** Por hito: deviceCode que disparó la captura (puede haber varios). */
  devicesByStep: Record<string, string[]>
}
