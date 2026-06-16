/** Zona operativa del dashboard (San Lorenzo / Ricardone). */
export const ARGENTINA_UTC_OFFSET_MINUTES = -180

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function hasExplicitTimezone(iso: string): boolean {
  const s = iso.trim()
  return /[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s) || /[+-]\d{4}$/.test(s)
}

/** Parsea ISO a ms UTC; strings sin zona se interpretan como hora Argentina (-03:00). */
export function parseTimestampMs(iso: string): number {
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

/** Formatea instante como ISO local Argentina con offset -03:00. */
export function formatArgentinaIsoFromMs(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const localMs = ms + ARGENTINA_UTC_OFFSET_MINUTES * 60_000
  const d = new Date(localMs)
  const y = d.getUTCFullYear()
  const mo = pad2(d.getUTCMonth() + 1)
  const da = pad2(d.getUTCDate())
  const h = pad2(d.getUTCHours())
  const mi = pad2(d.getUTCMinutes())
  const se = pad2(d.getUTCSeconds())
  const frac = ms % 1000
  const msPart = frac ? `.${String(frac).padStart(3, '0')}` : ''
  return `${y}-${mo}-${da}T${h}:${mi}:${se}${msPart}-03:00`
}

/** Strings sin zona = reloj Argentina; solo se agrega -03:00 sin pasar por Date.parse local/UTC. */
export function ensureArgentinaOffsetIso(iso: string): string {
  const raw = String(iso ?? '').trim()
  if (!raw) return raw
  if (hasExplicitTimezone(raw)) {
    if (/[zZ]$/.test(raw) || /\+00:00$/.test(raw) || /\+0000$/.test(raw)) {
      const ms = parseTimestampMs(raw)
      return Number.isFinite(ms) ? formatArgentinaIsoFromMs(ms) : raw
    }
    return raw
  }
  const normalized = raw.includes('T') ? raw : `${raw}T00:00:00`
  return `${normalized}-03:00`
}

/** Normaliza para export/UI: preserva reloj Truckflow/Excel; convierte Z a -03:00. */
export function normalizeTimestampForExport(iso: string): string {
  return ensureArgentinaOffsetIso(iso)
}

export function argentinaLocalParts(iso: string): { fecha_tramo: string; hora_inicio: string } | null {
  const ms = parseTimestampMs(iso)
  if (!Number.isFinite(ms)) return null
  const localMs = ms + ARGENTINA_UTC_OFFSET_MINUTES * 60_000
  const d = new Date(localMs)
  return {
    fecha_tramo: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
    hora_inicio: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`,
  }
}

export function argentinaLocalMinutesOfDay(iso: string): number | null {
  const parts = argentinaLocalParts(iso)
  if (!parts) return null
  const [h, m] = parts.hora_inicio.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}
