/**
 * Servicio Plant State en vivo.
 * Buffer 6 h · refresh incremental 10 s · reconciliación 5 min.
 * Fuente preferida: API Truckflow; fallback: data/truckflow/<día>/event-list.json.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEventLiveInstantMs, formatArgentinaIsoFromMs, parseLiveMillis } from './liveEventTime.mjs'
import { reducePlantState } from './reducer.mjs'
import { buildBaselines, quarterOf } from './baselines.mjs'
import { resolveSectorStatus, resolveZoneStatus, resolveBottleneck } from './status.mjs'
import { POINTS } from './plantGraph.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const BUFFER_MS = 6 * 60 * 60 * 1000
const REFRESH_MS = 10_000
const RECONCILE_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = Number(process.env.TRUCKFLOW_FETCH_TIMEOUT_MS || 30_000)
const DEFAULT_API_BASE =
  process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'

const KNOWN_SITES = new Set(['ricardone'])

export class PlantStateError extends Error {
  /**
   * @param {string} code
   * @param {number} httpStatus
   * @param {string} [message]
   */
  constructor(code, httpStatus, message) {
    super(message || code)
    this.code = code
    this.httpStatus = httpStatus
  }
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.value)) return payload.value
    if (Array.isArray(payload.data)) return payload.data
    if (Array.isArray(payload.events)) return payload.events
    if (Array.isArray(payload.records)) return payload.records
    if (Array.isArray(payload.items)) return payload.items
  }
  return []
}

function mapSiteQuery(site) {
  const s = String(site ?? '').trim().toLowerCase()
  if (s === 'ricardone') return 'Ricardone'
  return ''
}

function normalizeEvent(r) {
  return {
    ...r,
    normalizedPlate: String(r.truckPlate || '')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase(),
    rawTruckPlate: r.truckPlate || '',
    isValidPlate: Boolean(r.truckPlate),
  }
}

function eventKey(e) {
  return `${e.id ?? ''}-${e.sequenceNumber ?? ''}-${e.deviceCode ?? ''}-${e.occurredAt ?? ''}`
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function dayIsoFromMs(ms) {
  return formatArgentinaIsoFromMs(ms).slice(0, 10)
}

function addDays(dayIso, delta) {
  const [y, m, d] = dayIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + delta))
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`
}

/**
 * @param {string} baseUrl
 * @param {string} startIso
 * @param {string} endIso
 * @param {string} siteQuery
 */
async function fetchRemoteEvents(baseUrl, startIso, endIso, siteQuery) {
  const u = new URL('journey-event/list', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  u.searchParams.set('startDate', startIso)
  u.searchParams.set('endDate', endIso)
  if (siteQuery) u.searchParams.set('site', siteQuery)

  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(u.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const payload = await res.json()
    return extractArray(payload).map(normalizeEvent)
  } finally {
    clearTimeout(t)
  }
}

/**
 * @param {string} [projectRoot]
 */
export function createPlantStateService({ projectRoot = ROOT, apiBase = DEFAULT_API_BASE } = {}) {
  const localDataRoot = path.join(projectRoot, 'data', 'truckflow')

  /** @type {Map<string, { events: Map<string, object>, lastOccurredAt: string|null, lastRefreshMs: number, lastReconcileMs: number, lastError: string|null, baselines: object|null, timer: NodeJS.Timeout|null, reconcileTimer: NodeJS.Timeout|null, started: boolean }>} */
  const bySite = new Map()

  function loadLocalEventsFor(fromMs, toMs) {
    const fromDay = addDays(dayIsoFromMs(fromMs), -1)
    const toDay = dayIsoFromMs(toMs)
    /** @type {object[]} */
    const out = []
    let cur = fromDay
    while (cur <= toDay) {
      const file = path.join(localDataRoot, cur, 'event-list.json')
      if (fs.existsSync(file)) {
        try {
          const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
          for (const r of raw.records || raw.rows || []) out.push(normalizeEvent(r))
        } catch {
          /* día corrupto: saltar */
        }
      }
      cur = addDays(cur, 1)
    }
    return out
  }

  function ensureSite(site) {
    const key = String(site || '').trim().toLowerCase()
    if (!KNOWN_SITES.has(key)) {
      throw new PlantStateError('site_unknown', 400, `site desconocido: ${site}`)
    }
    let st = bySite.get(key)
    if (!st) {
      st = {
        events: new Map(),
        lastOccurredAt: null,
        lastRefreshMs: 0,
        lastReconcileMs: 0,
        lastError: null,
        baselines: null,
        timer: null,
        reconcileTimer: null,
        started: false,
      }
      bySite.set(key, st)
    }
    return { key, st }
  }

  function pruneBuffer(st, nowMs) {
    const cut = nowMs - BUFFER_MS
    for (const [k, e] of st.events) {
      const t = getEventLiveInstantMs(e)
      const raw = parseLiveMillis(String(e.occurredAt ?? e.recordedAt ?? ''))
      const keepT = Number.isFinite(t) ? t : raw
      if (!Number.isFinite(keepT) || keepT < cut) st.events.delete(k)
    }
  }

  function mergeEvents(st, rows) {
    for (const e of rows) {
      st.events.set(eventKey(e), e)
      const occ = String(e.occurredAt ?? '').trim()
      if (occ && (!st.lastOccurredAt || occ > st.lastOccurredAt)) st.lastOccurredAt = occ
    }
  }

  async function loadBaselines(site) {
    const { st } = ensureSite(site)
    if (!st.baselines) {
      try {
        st.baselines = await buildBaselines({ site, days: 14 })
      } catch (e) {
        st.baselines = {}
        console.warn('[plant-state] baselines no disponibles:', e instanceof Error ? e.message : e)
      }
    }
    return st.baselines
  }

  /**
   * Intenta API remota; si falla, fallback a archivos locales.
   * @param {string} site
   * @param {{ fullHour?: boolean }} [opts]
   */
  async function refresh(site, opts = {}) {
    const { key, st } = ensureSite(site)
    const nowMs = Date.now()
    const siteQ = mapSiteQuery(key)
    const base = String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '')

    const bufferStart = nowMs - BUFFER_MS
    let startIso
    let endIso = formatArgentinaIsoFromMs(nowMs).replace(/-03:00$/, '') // API suele aceptar local sin TZ
    // Preferir ISO con reloj de pared ART para la API
    endIso = formatArgentinaIsoFromMs(nowMs).slice(0, 19)

    if (opts.fullHour || !st.lastOccurredAt) {
      startIso = formatArgentinaIsoFromMs(opts.fullHour ? nowMs - 60 * 60 * 1000 : bufferStart).slice(0, 19)
    } else {
      startIso = String(st.lastOccurredAt).slice(0, 19)
    }

    let rows = []
    let usedRemote = false
    try {
      rows = await fetchRemoteEvents(base, startIso, endIso, siteQ)
      usedRemote = true
      st.lastError = null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      st.lastError = msg
      // Fallback local (desarrollo)
      const local = loadLocalEventsFor(bufferStart, nowMs)
      if (!local.length && st.events.size === 0) {
        throw new PlantStateError('feed_unreachable', 502, msg)
      }
      rows = local
      if (local.length) {
        console.warn(`[plant-state] API falló (${msg}); usando data/truckflow local (${rows.length} evt)`)
      }
    }

    if (opts.fullHour && usedRemote) {
      // Reconciliación: reemplazar tramo de la última hora
      const hourCut = nowMs - 60 * 60 * 1000
      for (const [k, e] of st.events) {
        const raw = parseLiveMillis(String(e.occurredAt ?? ''))
        if (Number.isFinite(raw) && raw >= hourCut) st.events.delete(k)
      }
    }

    if (!usedRemote && (!st.lastOccurredAt || opts.fullHour)) {
      // Carga completa local del buffer
      st.events.clear()
      mergeEvents(st, rows)
    } else {
      mergeEvents(st, rows)
    }

    pruneBuffer(st, nowMs)
    st.lastRefreshMs = nowMs
    if (opts.fullHour) st.lastReconcileMs = nowMs
    return { count: st.events.size, usedRemote }
  }

  function startBackground(site) {
    const { key, st } = ensureSite(site)
    if (st.started) return
    st.started = true
    // Primera carga (no bloquea el caller si ya hay datos)
    refresh(key, { fullHour: true }).catch((e) => {
      st.lastError = e instanceof Error ? e.message : String(e)
    })
    st.timer = setInterval(() => {
      refresh(key).catch((e) => {
        st.lastError = e instanceof Error ? e.message : String(e)
      })
    }, REFRESH_MS)
    st.reconcileTimer = setInterval(() => {
      refresh(key, { fullHour: true }).catch((e) => {
        st.lastError = e instanceof Error ? e.message : String(e)
      })
    }, RECONCILE_MS)
    if (typeof st.timer.unref === 'function') st.timer.unref()
    if (typeof st.reconcileTimer.unref === 'function') st.reconcileTimer.unref()
  }

  /**
   * Snapshot actual con status resuelto.
   * @param {string} site
   */
  async function getSnapshot(site) {
    const { key, st } = ensureSite(site)
    startBackground(key)

    if (st.events.size === 0) {
      try {
        await refresh(key, { fullHour: true })
      } catch (e) {
        if (e instanceof PlantStateError) throw e
        throw new PlantStateError('feed_unreachable', 502, e instanceof Error ? e.message : String(e))
      }
    }

    if (st.events.size === 0 && st.lastError) {
      throw new PlantStateError('feed_unreachable', 502, st.lastError)
    }

    const baselines = await loadBaselines(key)
    const nowMs = Date.now()
    const events = [...st.events.values()]
    const snap = reducePlantState(events, nowMs, { site: key })
    const q = quarterOf(snap.at) || quarterOf(formatArgentinaIsoFromMs(nowMs))
    const edgeById = Object.fromEntries(snap.edges.map((e) => [e.id, e]))

    snap.sectors = snap.sectors.map((s) => {
      const bl = q && baselines?.[s.sectorCode]?.[q] ? baselines[s.sectorCode][q] : null
      const edge = edgeById[s.edgeId] || null
      return { ...s, status: resolveSectorStatus(s, bl, edge) }
    })

    // Estado por zona: se evalúa contra la capacidad operativa y el tiempo de drenaje.
    // El Edge de referencia es el del punto que drena la zona, no el de origen.
    const edgeOfSector = Object.fromEntries(snap.sectors.map((s) => [s.sectorCode, s.edgeId]))
    snap.zones = snap.zones.map((z) => {
      const firstDrain = z.drainPoints?.[0]?.id
      const drainSector = firstDrain ? POINTS[firstDrain]?.sectorCode : null
      const drainEdge = drainSector ? edgeById[edgeOfSector[drainSector]] || null : null
      const bl = q && baselines?.[`zone:${z.id}`]?.[q] ? baselines[`zone:${z.id}`][q] : null
      return { ...z, status: resolveZoneStatus(z, bl, drainEdge) }
    })
    snap.plant = { ...snap.plant, bottleneck: resolveBottleneck(snap.zones) }

    return snap
  }

  /**
   * Eventos del buffer (tras asegurar carga). Para queries de sector/camiones.
   * @param {string} site
   */
  async function getEvents(site) {
    const { key, st } = ensureSite(site)
    startBackground(key)
    if (st.events.size === 0) {
      try {
        await refresh(key, { fullHour: true })
      } catch (e) {
        if (e instanceof PlantStateError) throw e
        throw new PlantStateError('feed_unreachable', 502, e instanceof Error ? e.message : String(e))
      }
    }
    if (st.events.size === 0 && st.lastError) {
      throw new PlantStateError('feed_unreachable', 502, st.lastError)
    }
    return [...st.events.values()]
  }

  return {
    getSnapshot,
    getEvents,
    getBaselines: loadBaselines,
    startBackground,
    refresh,
    PlantStateError,
  }
}

/** Singleton lazy para el server local. */
let _singleton = null
export function getPlantStateService() {
  if (!_singleton) _singleton = createPlantStateService()
  return _singleton
}
