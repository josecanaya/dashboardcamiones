/**
 * Servicio Plant State en vivo.
 * Buffer 6 h · refresh incremental 10 s · reconciliación 5 min.
 * Fuente preferida: API Truckflow; fallback: data/truckflow/<día>/event-list.json.
 */

import { sanitizeLearning } from './cameraLearning.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEventLiveInstantMs, formatArgentinaIsoFromMs, parseLiveMillis } from './liveEventTime.mjs'
import { reducePlantState } from './reducer.mjs'
import { buildBaselines, quarterOf } from './baselines.mjs'
import { resolveSectorStatus, resolveZoneStatus, resolveBottleneck } from './status.mjs'
import { POINTS, zonesOfSite } from './plantGraph.mjs'
import { SECTOR_DEVICES } from './sectorProfiles.mjs'
import { applyIdentifications, applyLinks, findPredecessors, identifyFragments, journeyKeyOf, nodeModelCatalog, recentCaptures, updateRecentCircuits } from './plateIdentification.mjs'
import { createIdentificationArchive } from './identificationArchive.mjs'
import { assessVehicleRelevance, excludeIrrelevantEvents } from './vehicleRelevance.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const BUFFER_MS = 6 * 60 * 60 * 1000
/** Historia para identificar patentes: 24 h, así entran las lecturas de la noche (cuando más se equivocan las cámaras). */
const HISTORY_MS = 24 * 60 * 60 * 1000
const REFRESH_MS = 10_000
const RECONCILE_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = Number(process.env.TRUCKFLOW_FETCH_TIMEOUT_MS || 30_000)
const DEFAULT_API_BASE =
  process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'

const KNOWN_SITES = new Set(['ricardone', 'san_lorenzo'])
const MANUAL_OVERRIDES_PATH = path.join(ROOT, 'data', 'plant-state-manual-overrides.json')
const SENSOR_CLOCK_SKEW_MS = 206 * 60_000
const MANUAL_OVERRIDE_TTL_MS = 12 * 60 * 60 * 1000
const IDENTIFICATION_DECISIONS_PATH = path.join(ROOT, 'data', 'plate-identification-decisions.json')
const IDENTIFICATION_CACHE_MS = 10_000

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
      // Motivo opcional: «no es un camión» (tractor, auto particular…) queda registrado con la quita.
      const reason = correction?.reason ? String(correction.reason).slice(0, 120) : null
      const operator = correction?.operator ? String(correction.operator).slice(0, 80) : null
      manualOverrides[key][plate] = { action, journeyUid, reason, operator, updatedAt: new Date().toISOString() }
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
  /*
   * Identificación de patentes en vivo: lecturas sueltas → camión en planta.
   * casi_seguro se aplica sola; provisorio y pendiente esperan la decisión de operaciones.
   */
  const decisionsPath = path.join(projectRoot, path.relative(ROOT, IDENTIFICATION_DECISIONS_PATH))
  const decisionsLogPath = path.join(path.dirname(decisionsPath), 'plate-identification-log.jsonl')
  const identificationArchive = createIdentificationArchive(path.join(path.dirname(decisionsPath), 'plate-identification-archive.json'))
  let identificationDecisions = {}
  try {
    identificationDecisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'))
  } catch {
    identificationDecisions = {}
  }
  /** @type {Map<string, Map<string, { code: string, t: number }>>} */
  const recentCircuitsBySite = new Map()
  /** @type {Map<string, { at: number, result: object }>} */
  const identificationCache = new Map()
  /**
   * Veredictos con color/marca/tipo del DSS (los calcula dssPhotoLookup en segundo plano): fragmento →
   * candidato que superó el umbral. Solo en memoria: tras un reinicio se recalculan.
   * @type {Map<string, Record<string, { plate: string, probability: number, at: string }>>}
   */
  const evidenceVerdicts = new Map()
  function setEvidenceVerdict(site, fragmentKey, verdict) {
    const key = String(site || '').trim().toLowerCase()
    if (!evidenceVerdicts.has(key)) evidenceVerdicts.set(key, {})
    evidenceVerdicts.get(key)[fragmentKey] = verdict
    identificationCache.delete(key)
  }

  function identifyRaw(site, rawEvents, nowMs = Date.now()) {
    const cached = identificationCache.get(site)
    if (cached && nowMs - cached.at < IDENTIFICATION_CACHE_MS) return cached.result
    const catalog = nodeModelCatalog()
    if (!recentCircuitsBySite.has(site)) recentCircuitsBySite.set(site, new Map())
    const recentCounts = updateRecentCircuits(recentCircuitsBySite.get(site), rawEvents, nowMs, catalog)
    const result = {
      site,
      ...identifyFragments(rawEvents, nowMs, {
        catalog,
        recentCounts,
        decisions: identificationDecisions[site] || {},
        evidenceVerdicts: evidenceVerdicts.get(site) || {},
        otherSiteEvents: [...(bySite.get(site === 'ricardone' ? 'san_lorenzo' : 'ricardone')?.history.values() ?? [])],
      }),
      recentCounts,
    }
    result.items = identificationArchive.merge(site, result.items, identificationDecisions[site] || {})
    result.counts = result.items.reduce((counts, item) => ({ ...counts, [item.level]: (counts[item.level] || 0) + 1 }), {})
    identificationCache.set(site, { at: nowMs, result })
    return result
  }

  /** Aplica las identificaciones (calculadas sobre la historia de 24 h) a los eventos del buffer. */
  function withIdentifications(site, rawEvents, nowMs = Date.now(), st = null) {
    try {
      const source = st ? [...st.history.values()] : rawEvents
      // Vínculos de lecturas anteriores (sobre claves crudas) y después las identificaciones de fragmentos.
      const items = identifyRaw(site, source, nowMs).items
      const operational = excludeIrrelevantEvents(rawEvents, items, e => journeyKeyOf(e, getEventLiveInstantMs(e)))
      return applyIdentifications(applyLinks(operational, linksOf(site)), items.filter(item => !item.archived))
    } catch (e) {
      console.warn('[plant-state] identificación de patentes falló:', e instanceof Error ? e.message : e)
      return rawEvents
    }
  }

  /** Vínculos confirmados (viaje mal leído → camión), guardados junto a las decisiones con clave `link:<journeyKey>`. */
  function linksOf(site) {
    return Object.entries(identificationDecisions[site] || {})
      .filter(([k, d]) => k.startsWith('link:') && d?.action === 'link')
      .map(([k, d]) => ({ journeyKey: k.slice(5), plate: d.plate, journeyUid: d.journeyUid ?? null }))
  }

  /** Lecturas anteriores candidatas para un camión que arranca a mitad de circuito. */
  async function getPredecessors(site, plate, windowHours = 6) {
    const { key, st } = ensureSite(site)
    startBackground(key)
    startBackground(otherSite(key))
    if (st.events.size === 0) await refresh(key, { fullHour: true })
    const want = normalizePlate(plate)
    if (!want) throw new PlantStateError('plate_required', 400, 'patente requerida')
    const nowMs = Date.now()
    const catalog = nodeModelCatalog()
    const links = linksOf(key)
    const result = findPredecessors([...st.history.values()], nowMs, want, {
      catalog,
      recentCounts: identificationCache.get(key)?.result?.recentCounts ?? {},
      otherSiteEvents: [...(bySite.get(otherSite(key))?.history.values() ?? [])],
      // Ya vinculados (a cualquier camión) o descartados por el operador para ESTE camión.
      linkedKeys: [...links.map((l) => l.journeyKey), ...dismissedFor(key, want)],
      windowMs: Math.min(24, Math.max(1, Number(windowHours) || 6)) * 60 * 60 * 1000,
    })
    return { site: key, ...result, linked: links.filter((l) => l.plate === want) }
  }

  /*
   * Correcciones de operaciones para el ETL (análisis e informe semanal): patentes confirmadas,
   * vínculos de lecturas anteriores y descartes de lecturas que no son camiones. Clave = journeyKey
   * del reconocedor (journeyUid o PATENTE#bloque de 12 h). Se aplican en runEtlTransform.
   */
  const ANALYTICS_DROP_REASONS = /tractor|maquinaria|auto particular|camioneta|servicio|duplicada|fantasma/i
  function exportCorrections() {
    const corrections = []
    for (const [site, entries] of Object.entries(identificationDecisions)) {
      for (const [k, d] of Object.entries(entries || {})) {
        if (!d || k.startsWith('nolink:')) continue
        const base = { site, source: d.action, decidedAt: d.updatedAt ?? null }
        if (k.startsWith('link:') && d.action === 'link') corrections.push({ ...base, key: k.slice(5), kind: 'rename', plate: d.plate, journeyUid: d.journeyUid ?? null })
        else if (d.action === 'confirm' && d.plate) {
          corrections.push({ ...base, key: k, kind: 'rename', plate: d.plate, journeyUid: d.journeyUid ?? null })
          // «La lectura era correcta y el viaje del candidato es el mismo camión»: ese viaje se renombra.
          if (d.journeyUid) corrections.push({ ...base, key: d.journeyUid, kind: 'rename', plate: d.plate, journeyUid: null })
        } else if (d.action === 'reject') corrections.push({ ...base, key: k, kind: 'drop' })
      }
    }
    for (const [site, entries] of Object.entries(manualOverrides)) {
      for (const [plate, o] of Object.entries(entries || {})) {
        // Solo «no es un camión»: «ya salió de planta» no borra datos del análisis.
        if (o?.action === 'remove' && o.journeyUid && ANALYTICS_DROP_REASONS.test(String(o.reason || ''))) {
          corrections.push({ site, key: o.journeyUid, kind: 'drop', plate, source: 'discard', decidedAt: o.updatedAt ?? null })
        }
      }
    }
    return { generatedAt: new Date().toISOString(), corrections }
  }

  /** Viajes que el operador marcó «no es» para este camión (clave `nolink:<patente>:<journeyKey>`). */
  function dismissedFor(site, plate) {
    const prefix = `nolink:${plate}:`
    return Object.keys(identificationDecisions[site] || {}).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
  }

  /** Vincula (o desvincula) un viaje mal leído a un camión. Mismo registro y opId que las decisiones. */
  function linkJourney(site, plate, body) {
    // Una lectura de la otra planta se corrige en ESA planta (sus eventos son los que cambian de patente).
    const { key } = ensureSite(body?.sourceSite ? String(body.sourceSite) : site)
    const want = normalizePlate(plate)
    const journeyKey = String(body?.journeyKey || '').trim()
    if (!want || !journeyKey) throw new PlantStateError('link_invalid', 400, 'patente y viaje requeridos')
    const opId = body?.opId ? String(body.opId) : null
    if (opId && appliedOps.has(opId)) return { ...appliedOps.get(opId), replayed: true }
    identificationDecisions[key] ||= {}
    const k = `link:${journeyKey}`
    const now = new Date().toISOString()
    const operator = body?.operator ? String(body.operator).slice(0, 80) : null
    if (body?.dismiss) identificationDecisions[key][`nolink:${want}:${journeyKey}`] = { action: 'nolink', plate: want, readPlate: body?.readPlate ? String(body.readPlate) : null, operator, updatedAt: now }
    else if (body?.unlink) delete identificationDecisions[key][k]
    else identificationDecisions[key][k] = { action: 'link', plate: want, journeyUid: body?.journeyUid ? String(body.journeyUid) : null, readPlate: body?.readPlate ? String(body.readPlate) : null, operator, updatedAt: now }
    fs.mkdirSync(path.dirname(decisionsPath), { recursive: true })
    const tmp = `${decisionsPath}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(identificationDecisions, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, decisionsPath)
    try {
      fs.appendFileSync(decisionsLogPath, `${JSON.stringify({ decidedAt: now, opId, site: key, action: body?.dismiss ? 'nolink' : body?.unlink ? 'unlink' : 'link', journeyKey, plate: want, readPlate: body?.readPlate ?? null, operator })}\n`, 'utf8')
    } catch (e) {
      console.warn('[plant-state] log de vínculo falló:', e instanceof Error ? e.message : e)
    }
    identificationCache.delete(key)
    const result = { ok: true, site: key, journeyKey, plate: want, linked: !body?.unlink && !body?.dismiss, dismissed: Boolean(body?.dismiss) }
    if (opId) appliedOps.set(opId, result)
    return result
  }

  /** La otra planta aporta candidatos: se arranca su carga también. */
  const otherSite = (key) => (key === 'ricardone' ? 'san_lorenzo' : 'ricardone')

  async function getIdentifications(site) {
    const { key, st } = ensureSite(site)
    startBackground(key)
    startBackground(otherSite(key))
    if (st.events.size === 0) await refresh(key, { fullHour: true })
    return withClaims(key, identifyRaw(key, [...st.history.values()]))
  }

  /*
   * Reserva blanda de un caso (EV-06): el puesto que lo tiene abierto la renueva cada minuto.
   * No bloquea guardar (la versión ya evita sobrescrituras); avisa a los demás que alguien lo atiende.
   */
  const CLAIM_TTL_MS = 2 * 60_000
  /** @type {Map<string, { by: string, label: string|null, at: number }>} */
  const claims = new Map()
  function claimIdentification(site, fragmentKey, body) {
    const { key } = ensureSite(site)
    const id = `${key}:${String(fragmentKey || '').trim()}`
    const by = String(body?.by || '').slice(0, 80)
    if (!by) throw new PlantStateError('claimant_required', 400, 'puesto requerido')
    const nowMs = Date.now()
    const held = claims.get(id)
    if (body?.release) {
      if (held?.by === by) claims.delete(id)
      return { ok: true, claim: null }
    }
    if (held && held.by !== by && nowMs - held.at < CLAIM_TTL_MS) return { ok: false, claim: { by: held.by, label: held.label, at: new Date(held.at).toISOString() } }
    claims.set(id, { by, label: body?.label ? String(body.label).slice(0, 80) : null, at: nowMs })
    return { ok: true, claim: { by, label: body?.label ?? null, at: new Date(nowMs).toISOString() } }
  }
  function withClaims(key, result) {
    const nowMs = Date.now()
    if (!claims.size) return result
    return {
      ...result,
      items: result.items.map((it) => {
        const c = claims.get(`${key}:${it.fragmentKey}`)
        return c && nowMs - c.at < CLAIM_TTL_MS ? { ...it, claim: { by: c.by, label: c.label, at: new Date(c.at).toISOString() } } : it
      }),
    }
  }

  async function getRecentCaptures(site, limit = 60) {
    const { key, st } = ensureSite(site)
    startBackground(key)
    startBackground(otherSite(key))
    if (st.events.size === 0) await refresh(key, { fullHour: true })
    const raw = [...st.history.values()]
    const nowMs = Date.now()
    return {
      site: key,
      at: new Date(nowMs).toISOString(),
      captures: recentCaptures(raw, identifyRaw(key, raw, nowMs), nowMs, Math.min(200, Math.max(1, Number(limit) || 60))),
    }
  }

  /** Resultados por opId: reintentar la misma operación devuelve lo ya aplicado (EV-05). */
  const appliedOps = new Map()
  const PENDING_LEVELS = new Set(['provisorio', 'pendiente'])

  /** Lecturas pendientes con la misma patente leída en ±3 h: candidatas a recibir la misma decisión. */
  function identificationSiblings(key, fk) {
    const items = identificationCache.get(key)?.result?.items ?? []
    const me = items.find((it) => it.fragmentKey === fk)
    if (!me) return []
    const meT = Date.parse(me.at)
    return items.filter((it) => it.fragmentKey !== fk && it.readPlate === me.readPlate && PENDING_LEVELS.has(it.level) && Math.abs(Date.parse(it.at) - meT) <= 3 * 60 * 60 * 1000)
  }

  // Contexto de la visita para descartar ruido, nunca de un candidato de otra patente.
  const relevanceLocalCache = new Map()
  function getIdentificationRelevanceContext(site, fragmentKey) {
    const { key, st } = ensureSite(site)
    const result = withClaims(key, identifyRaw(key, [...st.history.values()]))
    const item = result.items.find(i => i.fragmentKey === fragmentKey)
    if (!item) return null
    const at = Date.parse(item.at)
    const from = at - 8 * 3600000, to = at + 8 * 3600000
    const day = dayIsoFromMs(at)
    let local = relevanceLocalCache.get(day)
    if (!local || Date.now() - local.loadedAt > 60000) {
      local = { loadedAt: Date.now(), rows: loadLocalEventsFor(from, to) }
      relevanceLocalCache.set(day, local)
      if (relevanceLocalCache.size > 8) relevanceLocalCache.delete(relevanceLocalCache.keys().next().value)
    }
    const reads = [...st.history.values(), ...local.rows].filter(e => {
      const t = getEventLiveInstantMs(e)
      return !e.inferred && !e.manualCorrection && eventPlate(e) === normalizePlate(item.readPlate) && t >= from && t <= to
    })
    const historyAvailable = reads.some(e => e.deviceCode === item.deviceCode && Math.abs(getEventLiveInstantMs(e) - at) <= 2000)
    return { site: key, item, reads, historyAvailable }
  }
  function rejectIdentificationByRelevance(site, fragmentKey, capture) {
    const context = getIdentificationRelevanceContext(site, fragmentKey)
    if (!context) return { applied: false, reason: 'caso_no_disponible' }
    const assessment = assessVehicleRelevance({ ...context, capture })
    if (!assessment.reject) return { applied: false, assessment }
    const result = decideIdentification(site, fragmentKey, {
      action: 'reject', reason: assessment.reason, operator: 'Sistema · relevancia',
      expectedVersion: context.item.decision?.updatedAt ?? null,
      relevance: { ruleVersion: assessment.ruleVersion, capture, historyAvailable: true, checkedAt: new Date().toISOString() },
    })
    return { applied: true, assessment, result }
  }

  function decideIdentification(site, fragmentKey, body) {
    const { key } = ensureSite(site)
    const fk = String(fragmentKey || '').trim()
    if (!fk) throw new PlantStateError('fragment_required', 400, 'lectura requerida')
    const opId = body?.opId ? String(body.opId) : null
    if (opId && appliedOps.has(opId)) return { ...appliedOps.get(opId), replayed: true }
    const action = String(body?.action || '')
    identificationDecisions[key] ||= {}
    // EV-06: la decisión viaja con la versión que vio el operador; si cambió, conflicto.
    if (body && 'expectedVersion' in body) {
      const current = identificationDecisions[key][fk]?.updatedAt ?? null
      if ((body.expectedVersion ?? null) !== current) throw new PlantStateError('version_conflict', 409, 'el caso cambió desde que se abrió')
    }
    const now = new Date().toISOString()
    const reason = body?.reason ? String(body.reason).slice(0, 300) : null
    const operator = body?.operator ? String(body.operator).slice(0, 80) : null
    const previous = identificationDecisions[key][fk] ?? null
    const learningItem=identificationCache.get(key)?.result?.items?.find(it=>it.fragmentKey===fk)??null
    const learning=sanitizeLearning(body?.learning,body,learningItem)
    // Notas de relevo (EV-21): se conservan a través de cualquier decisión.
    const notes = Array.isArray(previous?.notes) ? previous.notes : undefined
    if (action === 'note') {
      const text = String(body?.text || '').trim().slice(0, 500)
      if (!text) throw new PlantStateError('note_required', 400, 'nota vacía')
      identificationDecisions[key][fk] = { ...(previous ?? { action: 'note' }), notes: [...(notes ?? []), { text, operator, at: now }].slice(-20), updatedAt: now }
    } else if (action === 'confirm') {
      const plate = normalizePlate(body?.plate)
      if (!plate) throw new PlantStateError('plate_required', 400, 'patente requerida')
      // EV-15: atributos del DSS que el operador marcó como mal detectados (no se editan los originales).
      const attrFlags = Array.isArray(body?.attrFlags) ? body.attrFlags.map(String).filter((k) => ['color', 'marca', 'tipo'].includes(k)) : undefined
      identificationDecisions[key][fk] = { action, plate, journeyUid: body?.journeyUid ? String(body.journeyUid) : null, reason, operator, attrFlags, learning, notes, updatedAt: now }
    } else if (action === 'reject') {
      if (!reason) throw new PlantStateError('reason_required', 400, 'motivo requerido para descartar')
      identificationDecisions[key][fk] = { action, reason, operator, notes, updatedAt: now, ...(body?.relevance ? { source: 'automatic_relevance', relevance: body.relevance } : {}) }
    } else if (action === 'defer') {
      // EV-08: "no puedo determinar" — sigue pendiente, con motivo y próximo paso.
      if (!reason) throw new PlantStateError('reason_required', 400, 'motivo requerido')
      identificationDecisions[key][fk] = { action, reason, operator, attempts: (previous?.attempts ?? 0) + 1, notes, updatedAt: now }
    } else if (action === 'clear' || action === 'review') {
      // EV-23: reabrir deja "revisión humana solicitada": la asignación automática no la vuelve a resolver sola.
      identificationDecisions[key][fk] = { action: 'review', reason, operator, previous: previous ? { ...previous, notes: undefined } : null, notes, updatedAt: now }
    } else {
      throw new PlantStateError('decision_invalid', 400, 'acción inválida')
    }
    // EV-01: solo las gemelas que el operador eligió explícitamente (y que siguen siendo elegibles).
    const siblings = []
    if ((action === 'confirm' || action === 'reject') && Array.isArray(body?.applyTo) && body.applyTo.length) {
      const wanted = new Set(body.applyTo.map(String))
      for (const it of identificationSiblings(key, fk)) {
        if (!wanted.has(it.fragmentKey)) continue
        identificationDecisions[key][it.fragmentKey] = { ...identificationDecisions[key][fk], sameAs: fk }
        siblings.push(it.fragmentKey)
      }
    }
    fs.mkdirSync(path.dirname(decisionsPath), { recursive: true })
    const tmp = `${decisionsPath}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(identificationDecisions, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, decisionsPath)
    // Registro permanente con candidatos: sirve para auditar y para aprender cómo se equivoca cada cámara.
    // La decisión ya quedó escrita: un fallo del log no debe hacer creer que no se guardó (EV-05).
    const item = identificationCache.get(key)?.result?.items?.find((it) => it.fragmentKey === fk) ?? null
    let logged = true
    try {
      fs.appendFileSync(
        decisionsLogPath,
        `${JSON.stringify({
          decidedAt: now,
          opId,
          site: key,
          fragmentKey: fk,
          action: identificationDecisions[key][fk]?.action ?? action,
          plate: identificationDecisions[key][fk]?.plate ?? null,
          journeyUid: identificationDecisions[key][fk]?.journeyUid ?? null,
          reason,
          operator,
          attrFlags: identificationDecisions[key][fk]?.attrFlags ?? null,
          learning: identificationDecisions[key][fk]?.learning ?? null,
          note: action === 'note' ? identificationDecisions[key][fk]?.notes?.at(-1)?.text ?? null : null,
          relevance: identificationDecisions[key][fk]?.relevance ?? null,
          source: identificationDecisions[key][fk]?.source ?? 'operator',
          previousVersion: previous?.updatedAt ?? null,
          previousAction: previous?.action ?? null,
          readPlate: item?.readPlate ?? null,
          deviceCode: item?.deviceCode ?? null,
          node: item?.node ?? null,
          captureAt: item?.at ?? null,
          levelBefore: item?.level ?? null,
          suggested: item?.candidates?.[0]?.plate ?? null,
          candidates: item?.candidates ?? [],
          siblings,
        })}\n`,
        'utf8'
      )
    } catch (e) {
      logged = false
      console.warn('[plant-state] log de identificación falló:', e instanceof Error ? e.message : e)
    }
    identificationCache.delete(key)
    const decision = identificationDecisions[key][fk] ?? null
    const result = { ok: true, site: key, fragmentKey: fk, decision, version: decision?.updatedAt ?? null, siblings, logged }
    if (opId) {
      appliedOps.set(opId, result)
      if (appliedOps.size > 500) appliedOps.delete(appliedOps.keys().next().value)
    }
    return result
  }

  /** Resultado de una operación (EV-05): permite saber si un envío sin respuesta se aplicó. */
  function getIdentificationOp(opId) {
    return appliedOps.get(String(opId)) ?? null
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
        /** Eventos de las últimas 24 h (solo para identificación de patentes). */
        history: new Map(),
        historyLoaded: false,
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
    const histCut = nowMs - HISTORY_MS
    const keepT = (e) => {
      const t = getEventLiveInstantMs(e)
      return Number.isFinite(t) ? t : parseLiveMillis(String(e.occurredAt ?? e.recordedAt ?? ''))
    }
    for (const [k, e] of st.events) {
      const t = keepT(e)
      if (!Number.isFinite(t) || t < cut) st.events.delete(k)
    }
    for (const [k, e] of st.history) {
      const t = keepT(e)
      if (!Number.isFinite(t) || t < histCut) st.history.delete(k)
    }
  }

  function mergeEvents(st, rows) {
    for (const e of rows) {
      st.events.set(eventKey(e), e)
      st.history.set(eventKey(e), e)
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

    if (!st.historyLoaded) {
      // Primera carga: 24 h completas (antes solo entraba la última hora y se perdía la noche).
      startIso = formatArgentinaIsoFromMs(nowMs - HISTORY_MS).slice(0, 19)
    } else if (opts.fullHour || !st.lastOccurredAt) {
      startIso = formatArgentinaIsoFromMs(opts.fullHour ? nowMs - 60 * 60 * 1000 : bufferStart).slice(0, 19)
    } else {
      startIso = String(st.lastOccurredAt).slice(0, 19)
    }

    let rows = []
    let usedRemote = false
    try {
      rows = await fetchRemoteEvents(base, startIso, endIso, siteQ)
      usedRemote = true
      st.historyLoaded = true
      st.lastError = null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      st.lastError = msg
      // Fallback local (desarrollo)
      const local = loadLocalEventsFor(st.historyLoaded ? bufferStart : nowMs - HISTORY_MS, nowMs)
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
      for (const [k, e] of st.history) {
        const raw = parseLiveMillis(String(e.occurredAt ?? ''))
        if (Number.isFinite(raw) && raw >= hourCut) st.history.delete(k)
      }
    }

    if (!usedRemote && (!st.lastOccurredAt || opts.fullHour)) {
      // Carga completa local del buffer
      st.events.clear()
      st.history.clear()
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
    let events = withIdentifications(key, [...st.events.values()], nowMs, st)

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
    // Frescura de la fuente (EV-35): último evento de cámara recibido y último error de consulta,
    // distintos de la hora en que el navegador recibió este snapshot.
    const lastEventMs = st.lastOccurredAt ? getEventLiveInstantMs({ occurredAt: st.lastOccurredAt }) : NaN
    snap.source = { lastEventAt: Number.isFinite(lastEventMs) ? new Date(lastEventMs).toISOString() : null, lastRefreshAt: st.lastRefreshMs ? new Date(st.lastRefreshMs).toISOString() : null, lastError: st.lastError ?? null }

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
    return applyManualOverrides(key, withIdentifications(key, [...st.events.values()], Date.now(), st))
  }

  return {
    getSnapshot,
    getEvents,
    getBaselines: loadBaselines,
    startBackground,
    refresh,
    correctTruck,
    getIdentifications,
    setEvidenceVerdict,
    getRecentCaptures,
    decideIdentification,
    getIdentificationRelevanceContext,
    rejectIdentificationByRelevance,
    getIdentificationOp,
    claimIdentification,
    getPredecessors,
    exportCorrections,
    linkJourney,
    PlantStateError,
  }
}

/** Singleton lazy para el server local. */
let _singleton = null
export function getPlantStateService() {
  if (!_singleton) _singleton = createPlantStateService()
  return _singleton
}
