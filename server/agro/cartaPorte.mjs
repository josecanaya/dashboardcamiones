/**
 * Cartas de porte (ARCA) de los camiones en planta, vía la API de control de acceso de agro.bimtrazer.com.
 *
 * - La llave de cámara no puede listar cartas: el CTG de cada patente sale de la copia de la base
 *   (data/arca/arca_consignment_notes.json, export de saasDB.arca_consignment_notes). Se relee si cambia.
 * - El PDF oficial se pide a la API en el momento (solo consulta, no registra lecturas); las claves
 *   quedan del lado del servidor (AGRO_API_BASE, AGRO_GW_KEY, AGRO_PLANT_ACCESS_KEY en .env.local).
 * - Router: GET /api/truckflow/agro/esperados?day=, GET /api/truckflow/agro/recorrido/:ctg, GET /api/truckflow/agro/carta-porte?plate=, GET /api/truckflow/agro/carta-porte/:ctg/pdf.
 */
import express from 'express'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { getEventLiveInstantMs } from '../plantState/liveEventTime.mjs'
import { resolveCanonicalSectorForLiveFeed } from '../plantState/sectorProfiles.mjs'
import { logicalLabel, sectorToLogical } from '../plantState/circuitPrefix.mjs'

/**
 * Vicentin como destino. No se filtra por planta: lo que descarga en Ricardone viaja con carta a la
 * 25567 (San Lorenzo) — la 813124 no recibe cartas — y el SGC lo registra igual como «PLANTA SAN LORENZO».
 */
const VICENTIN_CUIT = '30500959629'
/** Activa, contingencia, arribo confirmado, descargando: el camión todavía no terminó con esa carta. */
const OPEN_STATES = new Set(['AC', 'CT', 'CF', 'DD'])
const STATE_TEXT = { AC: 'Activa', CT: 'Contingencia', CF: 'Arribo confirmado', DD: 'Descargando', CN: 'Descargada', AN: 'Anulada', RE: 'Rechazada', DE: 'Desactivada' }
const MAX_AGE_MS = 10 * 86400000
/** codGrano ARCA → producto, deducido del cruce con PRODUCTO del SGC (26/10/2026). */
const GRAIN_NAME = { 2: 'Girasol', 19: 'Maíz', 23: 'Soja', 31: 'Algodón', 32: 'Cártamo' }
/** Localidad ARCA de San Lorenzo: las plantas del Nodo Sur (Ricardone descarga con carta a la 25567). */
const NODO_SUR_LOCALITY = 18794
/** Turno STOP: VIC<nro><DDMMAA>. */
const TURN_RE = /^[A-Z]+\d+(\d{2})(\d{2})(\d{2})$/i
const turnDayOf = code => {
  const m = TURN_RE.exec(String(code ?? '').trim())
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null
}
const arDay = (ms = Date.now()) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10)
const prevDay = day => arDay(Date.parse(`${day}T15:00:00Z`) - 86400000)
/** Cuartos operativos unificados (Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22) por hora local. */
const quarterOf = h => (h >= 22 || h < 4 ? 'Q1' : h < 10 ? 'Q2' : h < 16 ? 'Q3' : 'Q4')
const ARRIVED = new Set(['arribo', 'en_planta', 'salio', 'descargado'])
/**
 * La partida declarada en la carta no es confiable: 71 de 482 ingresos de grano (24–27/10) entraron
 * por balanza ANTES de esa hora (mediana 3,4 h). El cruce acepta ingresos hasta 12 h antes.
 */
const DEPARTURE_SLACK_MS = 12 * 3600000
const SENSOR_SKEW_MS = 206 * 60_000
const siteOfDevice = d => (/^Ric/i.test(d) ? 'ricardone' : /^(SLZ|Ren)/i.test(d) ? 'san_lorenzo' : null)

/**
 * Lecturas de cámara de las patentes de una carta desde su partida, pedidas a TruckFlow por patente
 * (el buffer en vivo guarda 6 h: no alcanza para los que entraron a la madrugada). Se agrupan en
 * tramos por planta; misma cámara repetida en < 2 min = una lectura.
 */
async function fetchPlateReads(plates, fromMs, toMs) {
  const base = (process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://100.54.73.142:8090').replace(/\/$/, '')
  // occurredAt viene corrido −206 min: la consulta se adelanta lo mismo.
  const q = p => new URLSearchParams({ plate: p, startDate: new Date(fromMs - SENSOR_SKEW_MS).toISOString(), endDate: new Date(toMs).toISOString() })
  const lists = await Promise.all(plates.map(p =>
    fetch(`${base}/journey-event/list?${q(p)}`, { signal: AbortSignal.timeout(30_000) }).then(r => (r.ok ? r.json() : [])).catch(() => [])))
  const reads = []
  for (const e of lists.flat()) {
    const t = getEventLiveInstantMs(e)
    const device = String(e?.deviceCode ?? '').trim()
    const logical = sectorToLogical(resolveCanonicalSectorForLiveFeed(e?.sectorCode, device))
    const site = siteOfDevice(device)
    if (!Number.isFinite(t) || t < fromMs || !logical || logical === 'ESPERA' || !site) continue
    reads.push({ t, device, site, node: logical, nodeLabel: logicalLabel(logical), readPlate: normPlate(e.truckPlate) })
  }
  reads.sort((a, b) => a.t - b.t)
  const dedup = reads.filter((r, i) => !reads.slice(Math.max(0, i - 4), i).some(o => o.device === r.device && r.t - o.t < 120_000))
  const trips = []
  for (const r of dedup) {
    const last = trips[trips.length - 1]
    const read = { at: new Date(r.t).toISOString(), node: r.node, nodeLabel: r.nodeLabel, device: r.device, readPlate: r.readPlate }
    if (last && last.site === r.site) { last.reads.push(read); last.endAt = read.at } else trips.push({ site: r.site, startAt: read.at, endAt: read.at, reads: [read] })
  }
  return trips
}

const normPlate = p => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const dateOf = v => (v && typeof v === 'object' ? v.$date : v) ?? null
const numOf = v => (v && typeof v === 'object' ? v.$numberLong : v) ?? null

/** getLive: () => Promise<{ trucks: {plate, site, sectorCode, dwellPlantMin}[], sgc: BalanzaRow[] }> (cámaras y SGC de ambos sitios). */
export function createCartaPorteSource({ projectRoot, getLive = null }) {
  const file = path.join(projectRoot, 'data', 'arca', 'arca_consignment_notes.json')
  const cache = { mtimeMs: 0, byPlate: new Map(), newestDeparture: null }

  function index() {
    if (!existsSync(file)) return cache
    const { mtimeMs } = statSync(file)
    if (mtimeMs === cache.mtimeMs) return cache
    const byPlate = new Map()
    const all = []
    let newest = null
    for (const n of JSON.parse(readFileSync(file, 'utf8'))) {
      const note = {
        ctg: String(n.ctg),
        stateCode: n.arca_state_code,
        stateSince: dateOf(n.state_start_time),
        departure: dateOf(n.departure_time),
        expire: dateOf(n.expire_time),
        plant: String(numOf(n.destination?.plant) ?? ''),
        destCuit: String(n.destination?.cuit ?? ''),
        plates: (n.transport?.plates ?? []).map(normPlate),
        turnCode: n.transport?.turn_code ?? null,
        turnDay: turnDayOf(n.transport?.turn_code),
        locality: n.destination?.locality_code ?? null,
        grain: GRAIN_NAME[n.load?.grain_code] ?? (n.load?.grain_code != null ? `Grano ${n.load.grain_code}` : null),
        distanceKm: n.transport?.distance_km ?? null,
        grossKg: Number(numOf(n.load?.gross_weight_kg)) || null,
        tareKg: Number(numOf(n.load?.tare_weight_kg)) || null,
      }
      if (note.departure && (!newest || note.departure > newest)) newest = note.departure
      all.push(note)
      for (const p of note.plates) {
        if (!byPlate.has(p)) byPlate.set(p, [])
        byPlate.get(p).push(note)
      }
    }
    Object.assign(cache, { mtimeMs, byPlate, all, newestDeparture: newest })
    return cache
  }

  /**
   * Camiones esperados en el Nodo Sur un día: cartas a Vicentin con turno STOP de ese día, más las
   * activas sin turno que partieron hace ≤ 3 días, más las de turno de ayer todavía sin llegar
   * (≈ 1 de cada 5 llega un día tarde: medido 26/10). El sitio físico no se sabe hasta que llega
   * (la 25567 descarga en Ricardone y en la Terminal): se cruza con cámaras y SGC.
   */
  async function expected(day) {
    const { all = [] } = index()
    const dayStart = Date.parse(`${day}T03:00:00Z`)
    const yesterday = prevDay(day)
    const notes = all.filter(n => n.destCuit === VICENTIN_CUIT && n.locality === NODO_SUR_LOCALITY && !['AN', 'RE', 'DE'].includes(n.stateCode))
      .filter(n => n.turnDay === day || (n.turnDay === yesterday && OPEN_STATES.has(n.stateCode))
        || (!n.turnDay && n.stateCode !== 'CN' && n.departure && dayStart - Date.parse(n.departure) < 3 * 86400000 && Date.parse(n.departure) < dayStart + 86400000))
    const live = getLive ? await getLive().catch(() => null) : null
    const camByPlate = new Map((live?.trucks ?? []).map(t => [normPlate(t.plate), t]))
    const sgcByPlate = new Map()
    for (const r of live?.sgc ?? []) for (const p of [r.plate, r.trailer]) if (p) sgcByPlate.set(normPlate(p), [...(sgcByPlate.get(normPlate(p)) ?? []), r])
    const rows = notes.map(n => {
      const cam = n.plates.map(p => camByPlate.get(p)).find(Boolean) ?? null
      // El ingreso SGC de esta carta: el primero posterior a la partida (hora local sin zona, como el SGC).
      const departedLocal = n.departure ? new Date(Date.parse(n.departure) - 3 * 3600000 - DEPARTURE_SLACK_MS).toISOString().slice(0, 19) : ''
      const sgc =n.plates.flatMap(p => sgcByPlate.get(p) ?? []).filter(r => String(r.ingresoAt) >= departedLocal)
        .sort((a, b) => String(a.ingresoAt).localeCompare(String(b.ingresoAt)))[0] ?? null
      const status = sgc?.salidaAt ? 'salio' : cam || sgc ? 'en_planta' : n.stateCode === 'CN' ? 'descargado' : n.stateCode === 'CF' || n.stateCode === 'DD' ? 'arribo' : 'en_camino'
      // Hora de llegada: ingreso SGC (hora local sin zona) o, sin SGC, el cambio de estado en ARCA (UTC).
      const arrivedLocal = !ARRIVED.has(status) ? null
        : sgc ? String(sgc.ingresoAt)
        : n.stateSince ? new Date(Date.parse(n.stateSince) - 3 * 3600000).toISOString().slice(0, 19) : null
      // Turno de ayer que ya llegó ayer: no es esperado de hoy.
      if (n.turnDay === yesterday && arrivedLocal && arrivedLocal.slice(0, 10) < day) return null
      const arrivedHour = arrivedLocal ? Number(arrivedLocal.slice(11, 13)) : null
      return {
        ...n,
        stateText: STATE_TEXT[n.stateCode] ?? n.stateCode,
        status,
        late: n.turnDay === yesterday,
        arrivedQuarter: arrivedHour == null || Number.isNaN(arrivedHour) ? null : quarterOf(arrivedHour),
        site: cam?.site ?? null,
        camera: cam ? { plate: cam.plate, sectorCode: cam.sectorCode ?? null, dwellPlantMin: cam.dwellPlantMin ?? null } : null,
        sgc: sgc ? { nroIngreso: sgc.nroIngreso, plantName: sgc.plantName, product: sgc.product, ingresoAt: sgc.ingresoAt, salidaAt: sgc.salidaAt } : null,
      }
    }).filter(Boolean).sort((a, b) => String(a.departure).localeCompare(String(b.departure)))
    const counts = {}
    const products = new Map()
    const quarters = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 }
    for (const r of rows) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
      const p = products.get(r.grain ?? 'Sin dato') ?? { product: r.grain ?? 'Sin dato', esperados: 0, llegaron: 0, faltan: 0, deAyer: 0 }
      p.esperados++
      if (ARRIVED.has(r.status)) p.llegaron++; else p.faltan++
      if (r.late) p.deAyer++
      products.set(p.product, p)
      if (r.arrivedQuarter) quarters[r.arrivedQuarter]++
    }
    const arrived = rows.filter(r => ARRIVED.has(r.status)).length
    return {
      day,
      total: rows.length,
      arrived,
      pending: rows.length - arrived,
      lateFromYesterday: rows.filter(r => r.late).length,
      counts,
      byProduct: [...products.values()].sort((a, b) => b.esperados - a.esperados),
      arrivedByQuarter: quarters,
      rows,
      live: Boolean(live),
    }
  }

  /** La carta con la que el camión está hoy en planta: abierta primero, después la descargada más reciente. */
  function findForPlate(plate, now = Date.now()) {
    const notes = (index().byPlate.get(normPlate(plate)) ?? [])
      .filter(n => n.destCuit === VICENTIN_CUIT && n.departure && now - Date.parse(n.departure) < MAX_AGE_MS)
      .filter(n => OPEN_STATES.has(n.stateCode) || (n.stateCode === 'CN' && now - Date.parse(n.stateSince ?? 0) < 86400000))
      .sort((a, b) => Number(OPEN_STATES.has(b.stateCode)) - Number(OPEN_STATES.has(a.stateCode)) || b.departure.localeCompare(a.departure))
    return notes.map(n => ({ ...n, stateText: STATE_TEXT[n.stateCode] ?? n.stateCode, byTrailer: n.plates[0] !== normPlate(plate) }))
  }

  /** Ingresos SGC guardados por día (data/sgc/<día>/ingresos.json), por patente de chasis y acoplado. */
  function sgcIngresosByPlate(days) {
    const byPlate = new Map()
    for (const d of days) {
      const f = path.join(projectRoot, 'data', 'sgc', d, 'ingresos.json')
      if (!existsSync(f)) continue
      for (const r of Object.values(JSON.parse(readFileSync(f, 'utf8')))) {
        const row = { ingresoAt: r.FECHAINGRESO, salidaAt: r.FECHASALIDA ?? null, plantName: r.PLANTA, product: r.PRODUCTO }
        for (const p of [r.PATENTECAMION, r.PATENTEACOPLADO]) if (p) byPlate.set(normPlate(p), [...(byPlate.get(normPlate(p)) ?? []), row])
      }
    }
    return byPlate
  }

  /**
   * ¿Se cumplió el turno STOP de un día? Cartas a Vicentin (Nodo Sur) con turno de ese día contra
   * los ingresos guardados del SGC: llegó en el día, llegó al día siguiente o no llegó.
   */
  function compliance(day) {
    const { all = [] } = index()
    const next = arDay(Date.parse(`${day}T15:00:00Z`) + 86400000)
    const sgc = sgcIngresosByPlate([prevDay(day), day, next])
    const notes = all.filter(n => n.turnDay === day && n.destCuit === VICENTIN_CUIT && n.locality === NODO_SUR_LOCALITY && !['AN', 'RE', 'DE'].includes(n.stateCode))
    const rows = notes.map(n => {
      const departedLocal = n.departure ? new Date(Date.parse(n.departure) - 3 * 3600000 - DEPARTURE_SLACK_MS).toISOString().slice(0, 19) : ''
      const hit =n.plates.flatMap(p => sgc.get(p) ?? []).filter(r => String(r.ingresoAt) >= departedLocal)
        .sort((a, b) => String(a.ingresoAt).localeCompare(String(b.ingresoAt)))[0] ?? null
      const arrivedDay = hit ? String(hit.ingresoAt).slice(0, 10) : null
      const result = !hit ? (n.stateCode === 'CN' ? 'descargado_sin_sgc' : 'no_llego') : arrivedDay < day ? 'antes' : arrivedDay === day ? 'en_el_dia' : 'tarde'
      return { ctg: n.ctg, plates: n.plates, grain: n.grain, turnCode: n.turnCode, departure: n.departure, stateCode: n.stateCode, result, ingresoAt: hit?.ingresoAt ?? null, plantName: hit?.plantName ?? null }
    })
    const counts = { antes: 0, en_el_dia: 0, tarde: 0, descargado_sin_sgc: 0, no_llego: 0 }
    const products = new Map()
    for (const r of rows) {
      counts[r.result]++
      const p = products.get(r.grain ?? 'Sin dato') ?? { product: r.grain ?? 'Sin dato', turnos: 0, enElDia: 0, tarde: 0, noLlego: 0 }
      p.turnos++
      if (r.result === 'en_el_dia' || r.result === 'antes') p.enElDia++
      else if (r.result === 'tarde') p.tarde++
      else if (r.result === 'no_llego') p.noLlego++
      products.set(p.product, p)
    }
    const cumplidos = counts.antes + counts.en_el_dia + counts.descargado_sin_sgc
    return { day, turnos: rows.length, cumplidos, counts, byProduct: [...products.values()].sort((a, b) => b.turnos - a.turnos), rows: rows.filter(r => r.result === 'no_llego' || r.result === 'tarde') }
  }

  // Los esperados se recalculan en segundo plano: la vista los lee de memoria (sin esperar cámaras/SGC).
  const expectedCache = new Map()
  const inFlight = new Map()
  async function expectedCached(day) {
    const hit = expectedCache.get(day)
    if (hit && Date.now() - hit.at < 60_000) return hit.value
    if (!inFlight.has(day)) {
      inFlight.set(day, expected(day)
        .then(value => { expectedCache.set(day, { at: Date.now(), value }); return value })
        .finally(() => inFlight.delete(day)))
    }
    // Mientras se recalcula, el último valor sirve: no se hace esperar a la vista.
    return hit ? hit.value : inFlight.get(day)
  }
  const warm = () => expectedCached(arDay()).catch(() => undefined)
  setTimeout(warm, 5_000)
  setInterval(warm, 55_000).unref?.()
  const tripCache = new Map()

  const router = express.Router()

  router.get('/api/truckflow/agro/carta-porte', (req, res) => {
    const plate = normPlate(req.query.plate)
    if (!plate) return res.status(400).json({ error: 'Falta la patente' })
    const { newestDeparture, mtimeMs } = index()
    res.json({
      plate,
      notes: findForPlate(plate),
      copy: { available: mtimeMs > 0, newestDeparture, updatedAt: mtimeMs ? new Date(mtimeMs).toISOString() : null },
    })
  })

  router.get('/api/truckflow/agro/esperados', async (req, res) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day ?? '')) ? String(req.query.day) : arDay()
    const { newestDeparture, mtimeMs } = index()
    res.json({ ...(await expectedCached(day)), copy:{ available: mtimeMs > 0, newestDeparture, updatedAt: mtimeMs ? new Date(mtimeMs).toISOString() : null } })
  })

  router.get('/api/truckflow/agro/cumplimiento', (req, res) => {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day ?? '')) ? String(req.query.day) : prevDay(arDay())
    res.json(compliance(day))
  })

  router.get('/api/truckflow/agro/recorrido/:ctg', async (req, res) => {
    const ctg = String(req.params.ctg ?? '').replace(/\D/g, '')
    const note = (index().all ?? []).find(n => n.ctg === ctg)
    if (!note) return res.status(404).json({ error: 'La carta no está en la copia' })
    const fromMs = Date.parse(note.departure ?? '') || Date.now() - 86400000
    const toMs = Math.min(Date.now(), fromMs + 6 * 86400000)
    try {
      const hit = tripCache.get(ctg)
      if (hit && Date.now() - hit.at < 120_000) return res.json(hit.value)
      const value = { ctg, plates: note.plates, trips: await fetchPlateReads(note.plates, fromMs, toMs) }
      tripCache.set(ctg, { at: Date.now(), value })
      res.json(value)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  router.get('/api/truckflow/agro/carta-porte/:ctg/pdf', async (req, res) => {
    const ctg = String(req.params.ctg ?? '').replace(/\D/g, '')
    const { AGRO_API_BASE, AGRO_GW_KEY, AGRO_PLANT_ACCESS_KEY } = process.env
    if (!ctg) return res.status(400).json({ error: 'CTG inválido' })
    if (!AGRO_API_BASE || !AGRO_GW_KEY || !AGRO_PLANT_ACCESS_KEY) return res.status(503).json({ error: 'Faltan las claves de agro en .env.local' })
    try {
      const r = await fetch(`${AGRO_API_BASE.replace(/\/$/, '')}/v1/arca_consignment_notes/${ctg}:pdf`, {
        headers: { SaasAgroArApiKey: AGRO_GW_KEY, 'X-Plant-Access-Key': AGRO_PLANT_ACCESS_KEY },
        signal: AbortSignal.timeout(60_000),
      })
      if (!r.ok) {
        const body = await r.json().catch(() => ({}))
        return res.status(r.status).json({ error: body.detail ?? body.title ?? `HTTP ${r.status}` })
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="carta-porte-${ctg}.pdf"`)
      res.send(Buffer.from(await r.arrayBuffer()))
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
    }
  })

  return { router, findForPlate }
}
