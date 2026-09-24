/**
 * Baselines por cuarto de día (Q1 22–04 · Q2 04–10 · Q3 10–16 · Q4 16–22).
 * Fuente: data/truckflow/<día>/event-list.json (deviceCode/occurredAt).
 * Cache: runs/_cache/baselines-<site>.json (TTL 24 h).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLiveMillis, formatArgentinaIsoFromMs } from './liveEventTime.mjs'
import { reducePlantState } from './reducer.mjs'
import { SECTOR_PROFILES, sectorCodesOfSite } from './sectorProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const DATA_ROOT = path.join(ROOT, 'data', 'truckflow')
const WINDOWS_ROOT = path.join(ROOT, 'runs', 'windows')
const CACHE_DIR = path.join(ROOT, 'runs', '_cache')
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const MIN_SAMPLES = 5

/** Horas locales ART del comienzo de cada corte (6 por cuarto). */
const QUARTER_HOURS = {
  Q1: [22, 23, 0, 1, 2, 3],
  Q2: [4, 5, 6, 7, 8, 9],
  Q3: [10, 11, 12, 13, 14, 15],
  Q4: [16, 17, 18, 19, 20, 21],
}

/**
 * @param {string} dateIso
 * @returns {'Q1'|'Q2'|'Q3'|'Q4'|null}
 */
export function quarterOf(dateIso) {
  const ms = parseLiveMillis(String(dateIso ?? '').trim())
  if (!Number.isFinite(ms)) return null
  // Hora en ART (−03): epoch + offset → getUTCHours
  const local = new Date(ms - 180 * 60_000)
  const h = local.getUTCHours()
  if (h >= 22 || h < 4) return 'Q1'
  if (h < 10) return 'Q2'
  if (h < 16) return 'Q3'
  return 'Q4'
}

/**
 * @param {number[]} values
 * @returns {number|null}
 */
function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Suma/resta días a YYYY-MM-DD. */
function addDays(dayIso, delta) {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

function todayIsoArt(nowMs = Date.now()) {
  return formatArgentinaIsoFromMs(nowMs).slice(0, 10)
}

/**
 * Días calendario cubiertos por ventanas en runs/windows/ que intersectan [from, to].
 * @param {string} fromIso
 * @param {string} toIso
 * @returns {string[]}
 */
function daysFromWindows(fromIso, toIso) {
  /** @type {Set<string>} */
  const days = new Set()
  if (!fs.existsSync(WINDOWS_ROOT)) return []
  for (const name of fs.readdirSync(WINDOWS_ROOT)) {
    const m = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(name)
    if (!m) continue
    const wFrom = m[1]
    const wTo = m[2]
    if (wTo < fromIso || wFrom > toIso) continue
    let cur = wFrom < fromIso ? fromIso : wFrom
    const end = wTo > toIso ? toIso : wTo
    while (cur <= end) {
      days.add(cur)
      cur = addDays(cur, 1)
    }
  }
  return [...days].sort()
}

/**
 * @param {string} dayIso
 * @returns {object[]}
 */
function loadDayEvents(dayIso) {
  const file = path.join(DATA_ROOT, dayIso, 'event-list.json')
  if (!fs.existsSync(file)) return []
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const records = raw.records || raw.rows || []
    return records.map((r) => ({
      ...r,
      normalizedPlate: String(r.truckPlate || '')
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase(),
      rawTruckPlate: r.truckPlate || '',
      isValidPlate: Boolean(r.truckPlate),
    }))
  } catch {
    return []
  }
}

/**
 * Instantes de corte ART para un día + cuarto.
 * Q1 arranca a las 22:00 del día y cruza medianoche (00–03 del día siguiente).
 * @param {string} dayIso
 * @param {'Q1'|'Q2'|'Q3'|'Q4'} quarter
 * @returns {number[]}
 */
function cutsForDayQuarter(dayIso, quarter) {
  const hours = QUARTER_HOURS[quarter]
  /** @type {number[]} */
  const out = []
  for (const h of hours) {
    let day = dayIso
    if (quarter === 'Q1' && h < 4) day = addDays(dayIso, 1)
    const iso = `${day}T${pad2(h)}:00:00-03:00`
    const ms = Date.parse(iso)
    if (Number.isFinite(ms)) out.push(ms)
  }
  return out
}

function cachePath(site) {
  return path.join(CACHE_DIR, `baselines-${site}.json`)
}

/**
 * @param {string} site
 * @returns {object|null}
 */
function readCache(site) {
  const p = cachePath(site)
  try {
    if (!fs.existsSync(p)) return null
    const st = fs.statSync(p)
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
    return raw?.baselines && typeof raw.baselines === 'object' ? raw.baselines : null
  } catch {
    return null
  }
}

/**
 * @param {string} site
 * @param {object} baselines
 */
function writeCache(site, baselines) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const payload = {
    site,
    builtAt: new Date().toISOString(),
    baselines,
  }
  const tmp = `${cachePath(site)}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8')
  fs.renameSync(tmp, cachePath(site))
}

/**
 * @param {{ site?: string, days?: number, force?: boolean }} [opts]
 * @returns {Promise<{[sectorCode: string]: {[quarter: string]: {rate60: number, dwellP90Min: number, samples: number}}}>}
 */
export async function buildBaselines({ site = 'ricardone', days = 14, force = false } = {}) {
  if (!force) {
    const cached = readCache(site)
    if (cached) return cached
  }

  const toIso = todayIsoArt()
  const fromIso = addDays(toIso, -(Math.max(1, days) - 1))

  // Ventanas → días; si no hay ventanas en el rango, caer a días con event-list local.
  let dayList = daysFromWindows(fromIso, toIso)
  if (dayList.length === 0) {
    if (fs.existsSync(DATA_ROOT)) {
      dayList = fs
        .readdirSync(DATA_ROOT)
        .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n >= fromIso && n <= toIso)
        .sort()
    }
  } else {
    // Solo días con archivo de eventos (las tablas de windows no traen deviceCode).
    dayList = dayList.filter((d) => fs.existsSync(path.join(DATA_ROOT, d, 'event-list.json')))
  }

  /** @type {Record<string, Record<string, { rates: number[], dwells: number[] }>>} */
  const accum = {}
  for (const code of sectorCodesOfSite(site)) {
    accum[code] = { Q1: { rates: [], dwells: [] }, Q2: { rates: [], dwells: [] }, Q3: { rates: [], dwells: [] }, Q4: { rates: [], dwells: [] } }
  }

  /** Cache de eventos por día para no releer. */
  /** @type {Map<string, object[]>} */
  const dayEvents = new Map()
  function eventsFor(dayIso) {
    if (!dayEvents.has(dayIso)) dayEvents.set(dayIso, loadDayEvents(dayIso))
    return dayEvents.get(dayIso)
  }

  for (const day of dayList) {
    // Día anterior + día (+ siguiente para Q1) cubren idle 3 h y cortes nocturnos.
    const prev = addDays(day, -1)
    const next = addDays(day, 1)
    const pool = [...eventsFor(prev), ...eventsFor(day), ...eventsFor(next)]
    if (!pool.length) continue

    for (const quarter of /** @type {const} */ (['Q1', 'Q2', 'Q3', 'Q4'])) {
      for (const cutMs of cutsForDayQuarter(day, quarter)) {
        const snap = reducePlantState(pool, cutMs, { site, skipDelta: true })
        for (const s of snap.sectors) {
          const bucket = accum[s.sectorCode]?.[quarter]
          if (!bucket) continue
          if (Number.isFinite(s.rate60)) bucket.rates.push(s.rate60)
          if (s.dwellP90Min != null && Number.isFinite(s.dwellP90Min)) bucket.dwells.push(s.dwellP90Min)
        }
      }
    }
  }

  /** @type {Record<string, Record<string, { rate60: number, dwellP90Min: number, samples: number }>>} */
  const baselines = {}
  for (const [sectorCode, byQ] of Object.entries(accum)) {
    for (const [quarter, { rates, dwells }] of Object.entries(byQ)) {
      const samples = Math.min(rates.length, dwells.length)
      if (samples < MIN_SAMPLES) continue
      const rate60 = median(rates)
      const dwellP90Min = median(dwells)
      if (rate60 == null || dwellP90Min == null) continue
      if (!baselines[sectorCode]) baselines[sectorCode] = {}
      baselines[sectorCode][quarter] = {
        rate60: Math.round(rate60 * 10) / 10,
        dwellP90Min: Math.round(dwellP90Min * 10) / 10,
        samples,
      }
    }
  }

  writeCache(site, baselines)
  return baselines
}
