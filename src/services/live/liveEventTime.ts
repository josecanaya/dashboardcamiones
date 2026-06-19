import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import type { NormalizedRealAlertView } from '../realAlertsInspector'
import {
  getEventOperationalInstantIso as getOperationalInstantIsoCore,
  getEventOperationalInstantMs as getOperationalInstantMsCore,
  parseOperationalMillis,
} from '../realEventOperationalTime'

export const LIVE_ROLLING_WINDOW_MS = 60 * 60 * 1000
export const LIVE_API_LOOKBACK_MS = 6 * 60 * 60 * 1000
export const LIVE_EVENT_TIME_SLACK_START_MS = 45 * 60 * 1000
const MAX_OCCURRED_VS_PERSISTED_DRIFT_MS = 30 * 24 * 60 * 60 * 1000

export type LiveTimeMode = 'rolling_hour' | 'calendar_day'

export type LiveUiWindow = {
  timeMode: LiveTimeMode
  calendarDay: string
  uiStart: Date
  uiEnd: Date
  uiStartMs: number
  uiEndMs: number
  apiQueryStart: Date
  apiQueryEnd: Date
  eventSlackMs: number
  rangeLabel: string
}

export function parseLiveMillis(iso: string): number {
  return parseOperationalMillis(iso)
}

export function fmtShort(iso: string): string {
  return fmtShort24(iso)
}

/** Hora local en 24 h (sin AM/PM). */
export function fmtShort24(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const dd = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${dd}, ${hh}:${mm}:${ss}`
}

export function toIsoLocal(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  const ss = String(dt.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`
}

export function getRollingLiveWindow(): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date(end.getTime() - LIVE_ROLLING_WINDOW_MS)
  return { start, end }
}

export function getCalendarDayBounds(dateStr: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const start = new Date(y, mo - 1, da, 0, 0, 0, 0)
  const end = new Date(y, mo - 1, da, 23, 59, 59, 999)
  if (start.getFullYear() !== y || start.getMonth() !== mo - 1 || start.getDate() !== da) return null
  return { start, end }
}

function liveListQueryBounds(start: Date, end: Date): { start: Date; end: Date } {
  const apiEnd = new Date(end.getTime() + 15 * 60 * 1000)
  const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0)
  const rollingApiStart = new Date(end.getTime() - LIVE_API_LOOKBACK_MS)
  const apiStart = new Date(Math.max(dayStart.getTime(), rollingApiStart.getTime()))
  return { start: apiStart, end: apiEnd }
}

export function resolveLiveUiWindow(
  timeMode: LiveTimeMode,
  calendarDay: string,
  dayTimeStart = '',
  dayTimeEnd = ''
): LiveUiWindow | { error: string } {
  if (timeMode === 'rolling_hour') {
    const w = getRollingLiveWindow()
    const listBounds = liveListQueryBounds(w.start, w.end)
    return {
      timeMode,
      calendarDay,
      uiStart: w.start,
      uiEnd: w.end,
      uiStartMs: w.start.getTime(),
      uiEndMs: w.end.getTime(),
      apiQueryStart: listBounds.start,
      apiQueryEnd: listBounds.end,
      eventSlackMs: LIVE_EVENT_TIME_SLACK_START_MS,
      rangeLabel: `${fmtShort24(toIsoLocal(w.start))} → ${fmtShort24(toIsoLocal(w.end))}`,
    }
  }
  const dayBounds = getCalendarDayBounds(calendarDay)
  if (!dayBounds) return { error: 'Fecha inválida: usá YYYY-MM-DD.' }

  const uiStart = applyTimeOnDay(dayBounds.start, dayTimeStart || '00:00')
  const uiEnd = applyTimeOnDay(dayBounds.start, dayTimeEnd || '23:59', true)
  if (!uiStart || !uiEnd) return { error: 'Franja horaria inválida (usá HH:MM).' }
  if (uiStart.getTime() > uiEnd.getTime()) return { error: 'La hora desde no puede ser posterior a la hora hasta.' }

  return {
    timeMode,
    calendarDay,
    uiStart,
    uiEnd,
    uiStartMs: uiStart.getTime(),
    uiEndMs: uiEnd.getTime(),
    apiQueryStart: uiStart,
    apiQueryEnd: uiEnd,
    eventSlackMs: 0,
    rangeLabel: `${fmtShort24(toIsoLocal(uiStart))} → ${fmtShort24(toIsoLocal(uiEnd))}`,
  }
}

function applyTimeOnDay(dayStart: Date, hhmm: string, endOfMinute = false): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  const d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), hh, mm, endOfMinute ? 59 : 0, endOfMinute ? 999 : 0)
  return d
}

export function alignJourneyEventTimeForLiveView(e: RealJourneyEventDto): RealJourneyEventDto {
  const occMs = parseLiveMillis(e.occurredAt)
  const anchorStr = (e.createdAt || e.modifiedAt || '').trim()
  if (!anchorStr) return e
  const anchMs = parseLiveMillis(anchorStr)
  if (Number.isNaN(occMs) || Number.isNaN(anchMs)) return e
  if (Math.abs(occMs - anchMs) <= MAX_OCCURRED_VS_PERSISTED_DRIFT_MS) return e
  return { ...e, occurredAt: anchorStr, recordedAt: anchorStr }
}

/** Instantánea operativa para En vivo: occurredAt alineado (no createdAt tardío). */
export function getEventLiveInstantIso(e: RealJourneyEventDto): string {
  const a = alignJourneyEventTimeForLiveView(e)
  return (a.occurredAt || a.recordedAt || '').trim()
}

export function getEventLiveInstantMs(e: RealJourneyEventDto): number {
  return parseLiveMillis(getEventLiveInstantIso(e))
}

export function getEventOperationalInstantMs(e: RealJourneyEventDto): number {
  return getOperationalInstantMsCore(e)
}

export function getEventOperationalInstantIso(e: RealJourneyEventDto): string {
  return getOperationalInstantIsoCore(e)
}

export function journeyEventInUiWindow(
  e: RealJourneyEventDto,
  uiStartMs: number,
  uiEndMs: number,
  slackStartMs: number = LIVE_EVENT_TIME_SLACK_START_MS
): boolean {
  const lo = uiStartMs - slackStartMs
  const hi = uiEndMs
  const a = alignJourneyEventTimeForLiveView(e)

  // Día completo: misma instantánea que la columna Hora (occurredAt alineado).
  if (slackStartMs === 0) {
    const t = getEventLiveInstantMs(e)
    if (Number.isNaN(t)) return false
    return t >= lo && t <= hi
  }

  const op = getEventOperationalInstantMs(e)
  if (!Number.isNaN(op) && op >= lo && op <= hi) return true
  const candidates = [
    parseLiveMillis(a.occurredAt),
    parseLiveMillis((a.createdAt || '').trim()),
    parseLiveMillis((a.modifiedAt || '').trim()),
    parseLiveMillis((a.recordedAt || '').trim()),
  ].filter((t) => !Number.isNaN(t))
  return candidates.some((t) => t >= lo && t <= hi)
}

export function alertInUiWindow(a: NormalizedRealAlertView, uiStartMs: number, uiEndMs: number): boolean {
  const t = parseLiveMillis(a.occurredAt)
  if (Number.isNaN(t)) return false
  return t >= uiStartMs && t <= uiEndMs
}
