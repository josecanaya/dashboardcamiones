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
import { POINTS, zonesOfSite } from './plantGraph.mjs'
import { SECTOR_DEVICES } from './sectorProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const BUFFER_MS = 6 * 60 * 60 * 1000
const REFRESH_MS = 10_000
const RECONCILE_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = Number(process.env.TRUCKFLOW_FETCH_TIMEOUT_MS || 30_000)
const DEFAULT_API_BASE =
  process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'

const KNOWN_SITES = new Set(['ricardone', 'san_lorenzo'])
const MANUAL_OVERRIDES_PATH = path.join(ROOT, 'data', 'plant-state-manual-overrides.json')
const SENSOR_CLOCK_SKEW_MS = 206 * 60_000
const MANUAL_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000

function normalizePlate(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}

function eventPlate(event) {
  return normalizePlate(event?.normalizedPlate || event?.truckPlate || event?.rawTruckPlate)
}

/*
 * Ingreso inferido a San Lorenzo.
 *
 * La camara de ingreso del puerto (SLZIngCam*) dejo de emitir el 17-09-2026. Sin
 * lecturas de entrada, Playa OSL no se puede contar. Regla acordada con
 * operaciones: un egreso de Ricardone se cuenta como llegada al puerto 15 min
 * despues, y deja de atribuirse a la playa pasado el tope de permanencia.
 *
 * 15 min sale de los datos: la mediana real de transito Ricardone -> S0 SL fue
 * 11-12 min (p90 17) los dias 15 y 16-09 con la camara sana.
 *
 * LIMITES MEDIDOS contra esos mismos dias — esto es una ESTIMACION, no una
 * medicion, y por eso viaja marcada como tal hasta la pantalla:
 *   - ~1/3 de las llegadas al puerto NO vienen de un egreso de Ricardone
 *     (302 de 894 el 15-09): esas no las ve la regla.
 *   - ~39% de los egresos de Ricardone nunca llegan al puerto: esos sobran.
 *   - Error tipico +-23 camiones; en horas puntuales llego a diferir 2-5x.
 * Lo correcto es reparar la camara; mientras tanto, esto da el orden de magnitud.
 */
const SL_INFERRED_ENTRY = {
  fromSite: 'ricardone',
  fromDevices: /^RicEgrCam/i,
  toSectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
  /** Marca de origen: NO es una camara, y no debe contar como tal en el Edge. */
  deviceCode: 'SLZIngInferido',
  transitMs: 15 * 60 * 1000,
  maxResidenceMs: 180 * 60 * 1000,
}

/**
 * Llegadas sinteticas al ingreso del puerto a partir de los egresos de Ricardone.
 * Solo se llama cuando la camara real no emitio nada en todo el buffer.
 * @param {object[]} ricardoneEvents
 * @param {number} nowMs
 */
function inferSanLorenzoEntries(ricardoneEvents, nowMs) {
  const out = []
  for (const e of ricardoneEvents) {
    if (!SL_INFERRED_ENTRY.fromDevices.test(String(e.deviceCode ?? ''))) continue
    const raw = parseLiveMillis(String(e.occurredAt ?? e.recordedAt ?? ''))
    /*
     * La cuenta va en hora OPERATIVA, no en la cruda del sensor: getEventLiveInstantMs
     * corrige un skew fijo de varias horas. Restando mal, toda llegada nace vencida
     * contra maxResidenceMs y la inferencia no produce una sola fila.
     */
    const live = getEventLiveInstantMs(e)
    if (!Number.isFinite(raw) || !Number.isFinite(live)) continue
    const arrival = live + SL_INFERRED_ENTRY.transitMs
    if (arrival > nowMs) continue
    // Pasado el tope ya no se le atribuye la playa: sin este corte, los camiones
    // que nunca fueron al puerto se acumulan para siempre.
    if (nowMs - arrival > SL_INFERRED_ENTRY.maxResidenceMs) continue
    out.push({
      ...e,
      deviceCode: SL_INFERRED_ENTRY.deviceCode,
      sectorCode: SL_INFERRED_ENTRY.toSectorCode,
      // Se escribe en crudo: el reductor le vuelve a aplicar el skew y cae en `arrival`.
      occurredAt: formatArgentinaIsoFromMs(raw + SL_INFERRED_ENTRY.transitMs),
      recordedAt: formatArgentinaIsoFromMs(raw + SL_INFERRED_ENTRY.transitMs),
      inferred: true,
    })
  }
  return out
}

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

/*
 * Valor de `site` que espera journey-event/list.
 *
 * OJO: el feed en vivo NO usa el mismo vocabulario que el export por dia. Para
 * el puerto espera `PUERTO_SAN_LORENZO`; con `San Lorenzo` (el valor que sirve
 * en mapUiSiteToQuery de truckflow-local-server.mjs) devuelve 0 filas, sin
 * error, y el snapshot queda mudo como si la planta estuviera parada.
 * Verificado contra el feed el 21-09-2026: Ricardone 452 filas, San Lorenzo 0
 * con `San Lorenzo` y 291 con `PUERTO_SAN_LORENZO`.
 */
function mapSiteQuery(site) {
  const s = String(site ?? '').trim().toLowerCase()
  if (s === 'ricardone') return 'Ricardone'
  if (s === 'san_lorenzo') return 'PUERTO_SAN_LORENZO'
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
  const overridesPath = path.join(projectRoot, path.relative(ROOT, MANUAL_OVERRIDES_PATH))
  let manualOverrides = {}
  try {
    manualOverrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'))
  } catch {
    manualOverrides = {}
  }

  function saveManualOverrides() {
    fs.mkdirSync(path.dirname(overridesPath), { recursive: true })
    fs.writeFileSync(overridesPath, `${JSON.stringify(manualOverrides, null, 2)}\n`, 'utf8')
  }

  function applyManualOverrides(site, sourceEvents, nowMs = Date.now()) {
    const siteOverrides = manualOverrides[site] || {}
    const activeEntries = Object.entries(siteOverrides).filter(([, value]) => {
      const updatedAt = Date.parse(String(value?.updatedAt || ''))
      return Number.isFinite(updatedAt) && nowMs - updatedAt < MANUAL_OVERRIDE_TTL_MS
    })
    const matchesOverride = (event, plate, override) => {
      if (eventPlate(event) !== plate) return false
      const journeyUid = String(event?.journeyUid ?? '').trim()
      return !override.journeyUid || !journeyUid || journeyUid === override.journeyUid
    }
    const removed = activeEntries.filter(([, value]) => value?.action === 'remove')
    const events = sourceEvents.filter((event) => !removed.some(([plate, override]) => matchesOverride(event, plate, override)))
    for (const [plate, override] of activeEntries) {
      if (override?.action !== 'move') continue
      const matching = events.filter((event) => matchesOverride(event, plate, override))
      if (!matching.length) continue
      matching.sort((a, b) => getEventLiveInstantMs(a) - getEventLiveInstantMs(b))
      const last = matching[matching.length - 1]
      const occurredAt = formatArgentinaIsoFromMs(nowMs - SENSOR_CLOCK_SKEW_MS)
      events.push({
        ...last,
        journeyUid: String(last.journeyUid ?? '').trim() || `manual-${site}-${plate}`,
        normalizedPlate: plate,
        truckPlate: plate,
        sectorCode: override.sectorCode,
        deviceCode: `MANUAL_${override.zoneId}`,
        occurredAt,
        recordedAt: occurredAt,
        manualZoneId: override.zoneId,
        manualCorrection: true,
      })
    }
    return events
  }

  function correctTruck(site, plateValue, correction) {
    const { key, st } = ensureSite(site)
    const plate = normalizePlate(plateValue)
    if (!plate) throw new PlantStateError('plate_required', 400, 'patente requerida')
    const exists = [...st.events.values()].some((event) => eventPlate(event) === plate)
    if (!exists) throw new PlantStateError('truck_not_open', 404, `sin journey para ${plate}`)
    const latestEvent = [...st.events.values()]
      .filter((event) => eventPlate(event) === plate)
      .sort((a, b) => getEventLiveInstantMs(b) - getEventLiveInstantMs(a))[0]
    const journeyUid = String(latestEvent?.journeyUid ?? '').trim() || null
    const action = String(correction?.action || '')
    manualOverrides[key] ||= {}
    if (action === 'remove') {
      manualOverrides[key][plate] = { action, journeyUid, updatedAt: new Date().toISOString() }
    } else if (action === 'move') {
      const zoneId = String(correction?.zoneId || '').trim()
      const zone = zonesOfSite(key).find((item) => item.id === zoneId)
      const sectorCode = zone?.from ? POINTS[zone.from]?.sectorCode : null
      if (!zone || !sectorCode) throw new PlantStateError('zone_unknown', 404, `zona desconocida: ${zoneId}`)
      manualOverrides[key][plate] = { action, journeyUid, zoneId, sectorCode, updatedAt: new Date().toISOString() }
    } else {
      throw new PlantStateError('correction_invalid', 400, 'acción inválida')
    }
    saveManualOverrides()
    return { ok: true, site: key, plate, correction: manualOverrides[key][plate] }
  }
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
    let events = [...st.events.values()]

    /*
     * Si el ingreso del puerto no emitio NADA en el buffer, reponerlo con las
     * llegadas inferidas desde Ricardone. Si la camara vuelve, esta rama deja de
     * entrar sola y se vuelve a medir: no hay que tocar nada.
     */
    let inferredEntries = 0
    if (key === 'san_lorenzo') {
      const realEntryDevices = SECTOR_DEVICES[SL_INFERRED_ENTRY.toSectorCode] ?? []
      const hasRealEntry = events.some((e) =>
        realEntryDevices.includes(String(e.deviceCode ?? '').trim())
      )
      if (!hasRealEntry) {
        try {
          const ric = ensureSite(SL_INFERRED_ENTRY.fromSite)
          startBackground(ric.key)
          if (ric.st.events.size === 0) await refresh(ric.key, { fullHour: true })
          const synth = inferSanLorenzoEntries([...ric.st.events.values()], nowMs)
          inferredEntries = synth.length
          events = events.concat(synth)
        } catch (e) {
          // Sin Ricardone no hay inferencia posible: la zona queda "sin dato",
          // que es justamente el estado correcto.
          console.warn(
            '[plant-state] no se pudo inferir el ingreso de San Lorenzo:',
            e instanceof Error ? e.message : e
          )
        }
      }
    }

    events = applyManualOverrides(key, events, nowMs)
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
      /*
       * La zona que arranca en el ingreso inferido informa un backlog estimado,
       * no medido. Se marca para que la pantalla no lo muestre como un conteo.
       */
      const inferred =
        inferredEntries > 0 && POINTS[z.from]?.sectorCode === SL_INFERRED_ENTRY.toSectorCode
      const zone = inferred
        ? { ...z, backlogInferred: true, entryBlind: false, note: z.note }
        : z
      return { ...zone, status: resolveZoneStatus(zone, bl, drainEdge) }
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
    return applyManualOverrides(key, [...st.events.values()])
  }

  return {
    getSnapshot,
    getEvents,
    getBaselines: loadBaselines,
    startBackground,
    refresh,
    correctTruck,
    PlantStateError,
  }
}

/** Singleton lazy para el server local. */
let _singleton = null
export function getPlantStateService() {
  if (!_singleton) _singleton = createPlantStateService()
  return _singleton
}
