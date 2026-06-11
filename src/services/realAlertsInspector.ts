/**
 * Capa: diagnóstico / soporte export — vista normalizada de alertas.
 */
import { isValidArgentinaPlate, normalizePlate } from './argentinaPlate'
import type { RealAlertDto } from './realTruckflowApi'

export type AlertInferenceCategory = 'ocr_plate' | 'invalid_route' | 'sector_device' | 'other'

export type NormalizedRealAlertView = {
  raw: RealAlertDto
  alertId: string
  occurredAt: string
  journeyUid: string
  rawPlate: string
  normalizedPlate: string
  isValidPlate: boolean
  sectorCode: string
  deviceCode: string
  site: string
  alertCode: string
  alertType: string
  reason: string
  description: string
  message: string
  alertLevel: number
  payload: Record<string, unknown>
  inferenceCategory: AlertInferenceCategory
  inferenceIsHeuristic: boolean
}

export type AlertsQuickFilter =
  | 'all'
  | 'invalid_plate'
  | 'valid_plate'
  | 'with_journey'
  | 'without_journey'
  | 'invalid_route'
  | 'ocr_plate'
  | 'sector_device'
  | 'level_high'
  | 'level_medium'
  | 'level_low'

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

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

function inferCategory(input: string): AlertInferenceCategory {
  const v = input.toLowerCase()
  if (/(patente|plate|ocr|lectura|invalid plate)/i.test(v)) return 'ocr_plate'
  if (/(route|path|recorrido|camino|invalid journey|invalid sequence)/i.test(v)) return 'invalid_route'
  if (/(sector|device|camera|camara|cámara)/i.test(v)) return 'sector_device'
  return 'other'
}

export function normalizeRealAlertForView(alert: RealAlertDto): NormalizedRealAlertView {
  const payload = parsePayload(alert.payload)
  const journeyUid =
    String(alert.journeyUid ?? alert.journeyUuid ?? readString(payload, 'journeyUid') ?? readString(payload, 'journeyUuid') ?? '').trim()
  const rawPlate =
    String(
      alert.truckPlate ??
        alert.plate ??
        readString(payload, 'truckPlate') ??
        readString(payload, 'plate') ??
        readString(payload, 'normalizedPlate') ??
        ''
    ).trim()
  const normalizedPlate = normalizePlate(rawPlate)
  const occurredAt =
    String(alert.occurredAt ?? alert.createdAt ?? alert.recordedAt ?? alert.modifiedAt ?? alert.createdAt ?? '').trim()
  const sectorCode = String(alert.sectorCode ?? alert.sector ?? readString(payload, 'sectorCode') ?? readString(payload, 'sector') ?? '').trim()
  const deviceCode = String(alert.deviceCode ?? alert.device ?? readString(payload, 'deviceCode') ?? readString(payload, 'device') ?? '').trim()
  const site = String(alert.site ?? readString(payload, 'site') ?? '').trim()
  const alertCode = String((alert as Record<string, unknown>).alertCode ?? readString(payload, 'alertCode') ?? '').trim()
  const alertType = String(alert.alertType ?? alert.type ?? readString(payload, 'alertType') ?? readString(payload, 'type') ?? '').trim()
  const reason = String(alert.reason ?? readString(payload, 'reason') ?? '').trim()
  const description = String((alert as Record<string, unknown>).description ?? readString(payload, 'description') ?? '').trim()
  const message = String(alert.message ?? readString(payload, 'message') ?? '').trim()
  const alertLevel = toNumber(alert.alertLevel ?? (alert as Record<string, unknown>).severity ?? payload.alertLevel ?? payload.severity, 0)
  const combined = [alertCode, alertType, reason, description, message].join(' | ')
  const inferenceCategory = inferCategory(combined)
  const alertId = String(alert.id ?? `${journeyUid || 'no-journey'}-${normalizedPlate || 'no-plate'}-${occurredAt || 'no-time'}`)
  return {
    raw: alert,
    alertId,
    occurredAt,
    journeyUid,
    rawPlate,
    normalizedPlate,
    isValidPlate: Boolean(normalizedPlate) && isValidArgentinaPlate(normalizedPlate),
    sectorCode,
    deviceCode,
    site,
    alertCode,
    alertType,
    reason,
    description,
    message,
    alertLevel,
    payload,
    inferenceCategory,
    inferenceIsHeuristic: true,
  }
}

export function applyAlertsQuickFilter(list: NormalizedRealAlertView[], filter: AlertsQuickFilter): NormalizedRealAlertView[] {
  if (filter === 'all') return list
  return list.filter((a) => {
    if (filter === 'invalid_plate') return Boolean(a.normalizedPlate) && !a.isValidPlate
    if (filter === 'valid_plate') return a.isValidPlate
    if (filter === 'with_journey') return Boolean(a.journeyUid)
    if (filter === 'without_journey') return !a.journeyUid
    if (filter === 'invalid_route') return a.inferenceCategory === 'invalid_route'
    if (filter === 'ocr_plate') return a.inferenceCategory === 'ocr_plate'
    if (filter === 'sector_device') return a.inferenceCategory === 'sector_device'
    if (filter === 'level_high') return a.alertLevel >= 3
    if (filter === 'level_medium') return a.alertLevel === 2
    if (filter === 'level_low') return a.alertLevel <= 1
    return true
  })
}
