import type { NormalizedRealAlertView } from '../realAlertsInspector'
import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import type { SiteId } from '../../domain/sites'
import { getEventLiveInstantIso } from './liveEventTime'
import type { LiveUiWindow } from './liveEventTime'
import type { LiveDetectionRow } from './liveEventAlertMatch'

export type LiveExportScope = {
  siteId: SiteId
  sectorKey: string
  sectorLabel: string
  sectorCodes: string[]
  deviceCode: string
  window: LiveUiWindow
  filters: { plate: string; journeyUuid: string; hideLprMalfunction?: boolean }
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/"/g, '""')
  return `"${text}"`
}

export function buildLiveCameraExportPayload(
  scope: LiveExportScope,
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[],
  detections: LiveDetectionRow[]
) {
  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      siteId: scope.siteId,
      sectorKey: scope.sectorKey,
      sectorLabel: scope.sectorLabel,
      sectorCodes: scope.sectorCodes,
      deviceCode: scope.deviceCode,
      timeMode: scope.window.timeMode,
      calendarDay: scope.window.calendarDay,
      uiWindowStart: scope.window.uiStart.toISOString(),
      uiWindowEnd: scope.window.uiEnd.toISOString(),
      apiQueryStart: scope.window.apiQueryStart.toISOString(),
      apiQueryEnd: scope.window.apiQueryEnd.toISOString(),
      rangeLabel: scope.window.rangeLabel,
      filters: scope.filters,
      counts: {
        events: events.length,
        alerts: alerts.length,
        detections: detections.length,
      },
    },
    detections,
    events: events.map((e) => ({
      at: getEventLiveInstantIso(e),
      occurredAt: e.occurredAt,
      createdAt: e.createdAt ?? '',
      journeyUid: e.journeyUid,
      sequenceNumber: e.sequenceNumber,
      plate: e.truckPlate || e.normalizedPlate || '',
      sectorCode: e.sectorCode,
      deviceCode: e.deviceCode,
      eventType: e.eventType || e.eventCategory || '',
      alertLevel: e.alertLevel,
    })),
    alerts: alerts.map((a) => ({
      at: a.occurredAt,
      alertId: a.alertId,
      plate: a.rawPlate || a.normalizedPlate || '',
      sectorCode: a.sectorCode,
      deviceCode: a.deviceCode,
      alertCode: a.alertCode || a.alertType || '',
      alertLevel: a.alertLevel,
      description: a.description || a.message || a.reason || '',
    })),
  }
}

export function liveCameraExportJson(payload: ReturnType<typeof buildLiveCameraExportPayload>): string {
  return JSON.stringify(payload, null, 2)
}

export function liveCameraExportCsv(payload: ReturnType<typeof buildLiveCameraExportPayload>): string {
  const { metadata, events, alerts } = payload
  const header = ['kind', 'at', 'plate', 'sectorCode', 'deviceCode', 'journeyUid', 'detail', 'alertLevel']
  const eventRows = events.map((e) =>
    ['event', e.at, e.plate, e.sectorCode, e.deviceCode, e.journeyUid, e.eventType, String(e.alertLevel)]
  )
  const alertRows = alerts.map((a) =>
    ['alert', a.at, a.plate, a.sectorCode, a.deviceCode, '', a.alertCode, String(a.alertLevel)]
  )
  return (
    '\uFEFF' +
    [
      ['metadata', JSON.stringify(metadata)],
      [],
      header,
      ...eventRows,
      [],
      ...alertRows,
    ]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  )
}

export function liveSearchExportJson(
  metadata: Record<string, unknown>,
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[]
): string {
  return JSON.stringify(
    {
      metadata,
      events: events.map((e) => ({ at: getEventLiveInstantIso(e), ...e })),
      alerts,
    },
    null,
    2
  )
}

export function liveSearchExportCsv(
  metadata: Record<string, unknown>,
  events: RealJourneyEventDto[],
  alerts: NormalizedRealAlertView[]
): string {
  const header = ['kind', 'at', 'plate', 'sectorCode', 'deviceCode', 'journeyUid', 'detail']
  const eventRows = events.map((e) => [
    'event',
    getEventLiveInstantIso(e),
    e.truckPlate || e.normalizedPlate || '',
    e.sectorCode,
    e.deviceCode,
    e.journeyUid,
    e.eventType || e.eventCategory || '',
  ])
  const alertRows = alerts.map((a) => [
    'alert',
    a.occurredAt,
    a.rawPlate || a.normalizedPlate || '',
    a.sectorCode,
    a.deviceCode,
    a.journeyUid || '',
    a.alertCode || a.alertType || '',
  ])
  return (
    '\uFEFF' +
    [['metadata', JSON.stringify(metadata)], [], header, ...eventRows, [], ...alertRows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n')
  )
}

export function downloadTextFile(fileName: string, content: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
