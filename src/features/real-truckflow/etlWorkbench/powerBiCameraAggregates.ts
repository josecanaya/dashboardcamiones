import { recordsToCsv } from './etlCsv'
import { rowGet } from './etlCsvParse'

export const POWER_BI_CAMERA_AGGREGATE_FILES = {
  camera_summary: 'pb_camera_summary.csv',
  camera_daynight_summary: 'pb_camera_daynight_summary.csv',
  sector_camera_summary: 'pb_sector_camera_summary.csv',
} as const

export type PowerBiCameraAggregateKey = keyof typeof POWER_BI_CAMERA_AGGREGATE_FILES

type CamMetrics = {
  event_count: number
  alert_count_total: number
  alert_lpr_count: number
}

function numFromRow(r: Record<string, string>, ...keys: string[]): number {
  const v = rowGet(r, ...keys)
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function readCamMetrics(r: Record<string, string>): CamMetrics {
  return {
    event_count: numFromRow(r, 'event_count'),
    alert_count_total: numFromRow(r, 'alert_count_total'),
    alert_lpr_count: numFromRow(r, 'alert_lpr_count'),
  }
}

function addMetrics(target: CamMetrics, add: CamMetrics): void {
  target.event_count += add.event_count
  target.alert_count_total += add.alert_count_total
  target.alert_lpr_count += add.alert_lpr_count
}

/** Índice LPR por 100 eventos; vacío si no hay base de eventos. */
export function ratePer100Events(numerator: number, eventCount: number): number | '' {
  if (eventCount <= 0) return ''
  return Math.round((numerator / eventCount) * 100 * 1000) / 1000
}

/** Estado operativo para agregados Power BI. */
export function cameraAggregateStatus(eventCount: number, lprAlerts: number): string {
  if (eventCount <= 0 && lprAlerts > 0) return 'Sin base'
  if (eventCount <= 0) return 'Sin eventos'
  const r = (lprAlerts / eventCount) * 100
  if (r > 100) return 'Crítico'
  if (r >= 30) return 'Alto'
  if (r > 10) return 'Medio'
  return 'Bajo'
}

export function recommendedActionForCameraStatus(status: string): string {
  switch (status) {
    case 'Sin base':
      return 'Validar sincronización de eventos y alertas LPR en esta cámara'
    case 'Sin eventos':
      return 'Sin lecturas en el período: revisar actividad o exclusión en ETL'
    case 'Bajo':
      return 'Mantener monitoreo rutinario'
    case 'Medio':
      return 'Programar revisión de calibración LPR'
    case 'Alto':
      return 'Priorizar revisión con operaciones y mantenimiento'
    case 'Crítico':
      return 'Intervención urgente en cámara / soporte LPR'
    default:
      return 'Revisar diagnóstico'
  }
}

type BucketBase = CamMetrics

function buildCameraSummaryRows(granular: Record<string, string>[]): Record<string, unknown>[] {
  const map = new Map<
    string,
    BucketBase & { deviceCode: string; sectorCode: string; camera_type: string }
  >()

  for (const r of granular) {
    const deviceCode = rowGet(r, 'deviceCode', 'device_code') || '?'
    const sectorCode = rowGet(r, 'sectorCode', 'sector_code') || '?'
    const camera_type = rowGet(r, 'camera_type') || 'front'
    const key = `${deviceCode}|${sectorCode}|${camera_type}`
    let b = map.get(key)
    if (!b) {
      b = { deviceCode, sectorCode, camera_type, event_count: 0, alert_count_total: 0, alert_lpr_count: 0 }
      map.set(key, b)
    }
    addMetrics(b, readCamMetrics(r))
  }

  return [...map.values()]
    .sort((a, b) => b.alert_lpr_count - a.alert_lpr_count || a.deviceCode.localeCompare(b.deviceCode))
    .map((b) => {
      const status = cameraAggregateStatus(b.event_count, b.alert_lpr_count)
      const lprRate = ratePer100Events(b.alert_lpr_count, b.event_count)
      const totalRate = ratePer100Events(b.alert_count_total, b.event_count)
      return {
        deviceCode: b.deviceCode,
        sectorCode: b.sectorCode,
        camera_type: b.camera_type,
        event_count: b.event_count,
        alert_count_total: b.alert_count_total,
        alert_lpr_count: b.alert_lpr_count,
        lpr_alerts_per_100_events: lprRate,
        total_alerts_per_100_events: totalRate,
        status,
        recommended_action: recommendedActionForCameraStatus(status),
      }
    })
}

function buildDayNightSummaryRows(granular: Record<string, string>[]): Record<string, unknown>[] {
  const map = new Map<string, BucketBase & { day_night: string; camera_type: string }>()

  for (const r of granular) {
    const day_night = rowGet(r, 'day_night') || 'unknown'
    const camera_type = rowGet(r, 'camera_type') || 'front'
    const key = `${day_night}|${camera_type}`
    let b = map.get(key)
    if (!b) {
      b = { day_night, camera_type, event_count: 0, alert_count_total: 0, alert_lpr_count: 0 }
      map.set(key, b)
    }
    addMetrics(b, readCamMetrics(r))
  }

  return [...map.values()]
    .sort((a, b) => a.day_night.localeCompare(b.day_night) || a.camera_type.localeCompare(b.camera_type))
    .map((b) => ({
      day_night: b.day_night,
      camera_type: b.camera_type,
      event_count: b.event_count,
      alert_count_total: b.alert_count_total,
      alert_lpr_count: b.alert_lpr_count,
      lpr_alerts_per_100_events: ratePer100Events(b.alert_lpr_count, b.event_count),
    }))
}

function buildSectorCameraSummaryRows(granular: Record<string, string>[]): Record<string, unknown>[] {
  const map = new Map<string, BucketBase & { sectorCode: string; camera_type: string }>()

  for (const r of granular) {
    const sectorCode = rowGet(r, 'sectorCode', 'sector_code') || '?'
    const camera_type = rowGet(r, 'camera_type') || 'front'
    const key = `${sectorCode}|${camera_type}`
    let b = map.get(key)
    if (!b) {
      b = { sectorCode, camera_type, event_count: 0, alert_count_total: 0, alert_lpr_count: 0 }
      map.set(key, b)
    }
    addMetrics(b, readCamMetrics(r))
  }

  return [...map.values()]
    .sort((a, b) => b.alert_lpr_count - a.alert_lpr_count || a.sectorCode.localeCompare(b.sectorCode))
    .map((b) => ({
      sectorCode: b.sectorCode,
      camera_type: b.camera_type,
      event_count: b.event_count,
      alert_count_total: b.alert_count_total,
      alert_lpr_count: b.alert_lpr_count,
      lpr_alerts_per_100_events: ratePer100Events(b.alert_lpr_count, b.event_count),
      total_alerts_per_100_events: ratePer100Events(b.alert_count_total, b.event_count),
    }))
}

export type CameraPowerBiAggregates = {
  csv: Record<PowerBiCameraAggregateKey, string>
  rowCounts: Record<PowerBiCameraAggregateKey, number>
}

export function buildCameraPowerBiAggregates(
  granularRows: Record<string, string>[]
): CameraPowerBiAggregates {
  const summaryRows = buildCameraSummaryRows(granularRows)
  const dayNightRows = buildDayNightSummaryRows(granularRows)
  const sectorRows = buildSectorCameraSummaryRows(granularRows)

  const csv: Record<PowerBiCameraAggregateKey, string> = {
    camera_summary:
      summaryRows.length ?
        recordsToCsv(
          [
            'deviceCode',
            'sectorCode',
            'camera_type',
            'event_count',
            'alert_count_total',
            'alert_lpr_count',
            'lpr_alerts_per_100_events',
            'total_alerts_per_100_events',
            'status',
            'recommended_action',
          ],
          summaryRows
        )
      : 'deviceCode,sectorCode,camera_type,event_count,status,recommended_action\n',

    camera_daynight_summary:
      dayNightRows.length ?
        recordsToCsv(
          [
            'day_night',
            'camera_type',
            'event_count',
            'alert_count_total',
            'alert_lpr_count',
            'lpr_alerts_per_100_events',
          ],
          dayNightRows
        )
      : 'day_night,camera_type,event_count,alert_lpr_count,lpr_alerts_per_100_events\n',

    sector_camera_summary:
      sectorRows.length ?
        recordsToCsv(
          [
            'sectorCode',
            'camera_type',
            'event_count',
            'alert_count_total',
            'alert_lpr_count',
            'lpr_alerts_per_100_events',
            'total_alerts_per_100_events',
          ],
          sectorRows
        )
      : 'sectorCode,camera_type,event_count,alert_lpr_count\n',
  }

  return {
    csv,
    rowCounts: {
      camera_summary: summaryRows.length,
      camera_daynight_summary: dayNightRows.length,
      sector_camera_summary: sectorRows.length,
    },
  }
}
