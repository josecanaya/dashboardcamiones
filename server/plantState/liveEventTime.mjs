/**
 * Instantánea operativa para Plant State.
 * Regla: occurredAt/recordedAt + skew fijo 206 min (reloj de pared). Nunca createdAt.
 */

const SENSOR_CLOCK_SKEW_MS = 206 * 60_000
const ARGENTINA_UTC_OFFSET_MINUTES = -180

function hasExplicitTimezone(iso) {
  const s = iso.trim()
  return /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)
}

export function parseLiveMillis(iso) {
  const raw = String(iso ?? '').trim()
  if (!raw) return Number.NaN
  if (hasExplicitTimezone(raw)) {
    const t = Date.parse(raw)
    return Number.isFinite(t) ? t : Number.NaN
  }
  const normalized = raw.includes('T') ? raw : `${raw}T00:00:00`
  const t = Date.parse(`${normalized}-03:00`)
  return Number.isFinite(t) ? t : Number.NaN
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatArgentinaIsoFromMs(ms) {
  if (!Number.isFinite(ms)) return ''
  const localMs = ms + ARGENTINA_UTC_OFFSET_MINUTES * 60_000
  const d = new Date(localMs)
  const y = d.getUTCFullYear()
  const mo = pad2(d.getUTCMonth() + 1)
  const da = pad2(d.getUTCDate())
  const h = pad2(d.getUTCHours())
  const mi = pad2(d.getUTCMinutes())
  const se = pad2(d.getUTCSeconds())
  return `${y}-${mo}-${da}T${h}:${mi}:${se}-03:00`
}

/** Instantánea operativa (occurredAt + 206 min). */
export function getEventLiveInstantMs(e) {
  for (const iso of [e?.occurredAt, e?.recordedAt]) {
    const ms = parseLiveMillis(String(iso ?? '').trim())
    if (Number.isFinite(ms)) return ms + SENSOR_CLOCK_SKEW_MS
  }
  return Number.NaN
}

export function getEventLiveInstantIso(e) {
  const ms = getEventLiveInstantMs(e)
  return Number.isFinite(ms) ? formatArgentinaIsoFromMs(ms) : ''
}
