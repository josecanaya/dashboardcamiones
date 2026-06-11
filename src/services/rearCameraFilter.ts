/**
 * Capa: normalización / filtro — excluye cámaras traseras (lista alineada con etlRearDevices).
 * Tocar con cuidado si solo trabajás clasificación v2 (afecta comité y pre-filtros).
 */
import {
  isEtlRearCameraDevice,
  listEtlRearDeviceCodes,
} from '../features/real-truckflow/etlWorkbench/etlRearDevices'
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { RealAlertDto } from './realTruckflowApi'

/** Fuente única: misma lista que el pipeline ETL (`etlRearDevices.ts`). */
export const EXCLUDED_REAR_DEVICE_CODES = listEtlRearDeviceCodes()
export const EXCLUDED_INGRESS_ROUTE_ALERT_SECTORS = ['RICARDONE_INGRESO_CAMIONES', 'RICARDONE_PREINGRESO'] as const
export const EXCLUDED_INGRESS_ROUTE_ALERT_CODES = ['INVALID_ROUTE', 'INVALID_START_JOURNEY'] as const
export const EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODES = [
  'RicIngCamFrente',
  'RicIngCamTrasera',
  'RicIngCamTraser',
  'RicPreIngInFr',
  'RicPreIngInTr',
] as const

const EXCLUDED_INGRESS_ROUTE_ALERT_SECTOR_SET = new Set<string>(EXCLUDED_INGRESS_ROUTE_ALERT_SECTORS)
const EXCLUDED_INGRESS_ROUTE_ALERT_CODE_SET = new Set<string>(EXCLUDED_INGRESS_ROUTE_ALERT_CODES)
const EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODE_SET = new Set(
  EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODES.map((d) => d.toUpperCase())
)

export type RearCameraFilterMetadata = {
  enabled: true
  excludedDeviceCodes: readonly string[]
  excludedIngressRouteAlertSectors: readonly string[]
  excludedIngressRouteAlertCodes: readonly string[]
  excludedIngressRouteAlertDeviceCodes: readonly string[]
  excludedEventsCount: number
  excludedAlertsCount: number
  excludedIngressRouteAlertsCount: number
  excludedRearOnlyJourneyCount: number
}

export type RearCameraFilterTrace = {
  rawEvents: RealJourneyEventDto[]
  rawAlerts: RealAlertDto[]
  excludedRearEvents: RealJourneyEventDto[]
  excludedRearAlerts: RealAlertDto[]
  excludedIngressRouteAlerts: RealAlertDto[]
  operationalEvents: RealJourneyEventDto[]
  operationalAlerts: RealAlertDto[]
  excludedRearOnlyJourneyUids: string[]
  metadata: RearCameraFilterMetadata
}

function normalizeDeviceCode(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function parsePayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string' && payload.trim()) {
    try {
      const parsed = JSON.parse(payload)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export function isExcludedRearDeviceCode(deviceCode: unknown): boolean {
  return isEtlRearCameraDevice(deviceCode)
}

export function getAlertDeviceCodeForRearFilter(alert: RealAlertDto): string {
  const payload = parsePayload(alert.payload)
  return (
    normalizeDeviceCode(alert.deviceCode) ||
    normalizeDeviceCode(alert.device) ||
    normalizeDeviceCode(payload.deviceCode) ||
    normalizeDeviceCode(payload.device)
  )
}

function getAlertSectorCodeForFilter(alert: RealAlertDto): string {
  const payload = parsePayload(alert.payload)
  return (
    normalizeDeviceCode(alert.sectorCode) ||
    normalizeDeviceCode(alert.sector) ||
    normalizeDeviceCode(payload.sectorCode) ||
    normalizeDeviceCode(payload.sector)
  )
}

function getAlertCodeForFilter(alert: RealAlertDto): string {
  const payload = parsePayload(alert.payload)
  const candidates = [
    (alert as Record<string, unknown>).alertCode,
    alert.alertType,
    alert.type,
    typeof payload.alertCode === 'string' ? payload.alertCode : '',
    typeof payload.alertType === 'string' ? payload.alertType : '',
    alert.reason,
    alert.message,
    typeof payload.reason === 'string' ? payload.reason : '',
    typeof payload.message === 'string' ? payload.message : '',
  ]
  return candidates.map(normalizeDeviceCode).find(Boolean) ?? ''
}

function getAlertTextForFilter(alert: RealAlertDto): string {
  const payload = parsePayload(alert.payload)
  return [
    getAlertCodeForFilter(alert),
    alert.reason,
    alert.message,
    (alert as Record<string, unknown>).description,
    payload.reason,
    payload.message,
    payload.description,
    JSON.stringify(payload),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
}

export function isRearCameraEvent(event: RealJourneyEventDto): boolean {
  return isExcludedRearDeviceCode(event.deviceCode)
}

export function isRearCameraAlert(alert: RealAlertDto): boolean {
  return isExcludedRearDeviceCode(getAlertDeviceCodeForRearFilter(alert))
}

export function isIngressPreingressRouteAlert(alert: RealAlertDto): boolean {
  const deviceCode = getAlertDeviceCodeForRearFilter(alert)
  const sectorCode = getAlertSectorCodeForFilter(alert)
  const text = getAlertTextForFilter(alert)
  const isRouteAlert =
    EXCLUDED_INGRESS_ROUTE_ALERT_CODE_SET.has(getAlertCodeForFilter(alert)) ||
    text.includes('INVALID_ROUTE') ||
    text.includes('INVALID_START_JOURNEY') ||
    text.includes('DOES NOT MATCH ANY CONFIGURED ROUTE') ||
    text.includes('INICIA EN') ||
    text.includes('LUGAR NO INDICADO')
  const isIngressOrPreingress =
    EXCLUDED_INGRESS_ROUTE_ALERT_SECTOR_SET.has(sectorCode) ||
    EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODE_SET.has(deviceCode) ||
    text.includes('RICARDONE_PREINGRESO') ||
    text.includes('RICARDONE_INGRESO_CAMIONES')
  return isRouteAlert && isIngressOrPreingress
}

export function buildRearCameraFilterTrace(
  rawEvents: RealJourneyEventDto[],
  rawAlerts: RealAlertDto[]
): RearCameraFilterTrace {
  const excludedRearEvents = rawEvents.filter(isRearCameraEvent)
  const operationalEvents = rawEvents.filter((event) => !isRearCameraEvent(event))
  const excludedRearAlerts = rawAlerts.filter(isRearCameraAlert)
  const excludedIngressRouteAlerts = rawAlerts.filter(
    (alert) => !isRearCameraAlert(alert) && isIngressPreingressRouteAlert(alert)
  )
  const operationalAlerts = rawAlerts.filter(
    (alert) => !isRearCameraAlert(alert) && !isIngressPreingressRouteAlert(alert)
  )

  const eventsByJourney = new Map<string, RealJourneyEventDto[]>()
  for (const event of rawEvents) {
    const uid = event.journeyUid?.trim()
    if (!uid) continue
    const bucket = eventsByJourney.get(uid)
    if (bucket) bucket.push(event)
    else eventsByJourney.set(uid, [event])
  }

  const excludedRearOnlyJourneyUids = [...eventsByJourney.entries()]
    .filter(([, events]) => events.length > 0 && events.every(isRearCameraEvent))
    .map(([uid]) => uid)
    .sort()

  return {
    rawEvents,
    rawAlerts,
    excludedRearEvents,
    excludedRearAlerts,
    excludedIngressRouteAlerts,
    operationalEvents,
    operationalAlerts,
    excludedRearOnlyJourneyUids,
    metadata: {
      enabled: true,
      excludedDeviceCodes: EXCLUDED_REAR_DEVICE_CODES,
      excludedIngressRouteAlertSectors: EXCLUDED_INGRESS_ROUTE_ALERT_SECTORS,
      excludedIngressRouteAlertCodes: EXCLUDED_INGRESS_ROUTE_ALERT_CODES,
      excludedIngressRouteAlertDeviceCodes: EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODES,
      excludedEventsCount: excludedRearEvents.length,
      excludedAlertsCount: excludedRearAlerts.length,
      excludedIngressRouteAlertsCount: excludedIngressRouteAlerts.length,
      excludedRearOnlyJourneyCount: excludedRearOnlyJourneyUids.length,
    },
  }
}
