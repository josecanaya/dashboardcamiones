/**
 * Cartas de porte (ARCA) de los camiones en planta, vía la API de control de acceso de agro.bimtrazer.com.
 *
 * - La llave de cámara no puede listar cartas: el CTG de cada patente sale de la copia de la base
 *   (data/arca/arca_consignment_notes.json, export de saasDB.arca_consignment_notes). Se relee si cambia.
 * - El PDF oficial se pide a la API en el momento (solo consulta, no registra lecturas); las claves
 *   quedan del lado del servidor (AGRO_API_BASE, AGRO_GW_KEY, AGRO_PLANT_ACCESS_KEY en .env.local).
 * - Router: GET /api/truckflow/agro/carta-porte?plate=&site=, GET /api/truckflow/agro/carta-porte/:ctg/pdf.
 */
import express from 'express'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

/** Plantas ARCA de Vicentin por sitio del En vivo. */
const SITE_PLANTS = {
  san_lorenzo: ['21831', '21832', '21836', '23326', '25567'],
  ricardone: ['813124'],
}
/** Activa, contingencia, arribo confirmado, descargando: el camión todavía no terminó con esa carta. */
const OPEN_STATES = new Set(['AC', 'CT', 'CF', 'DD'])
const STATE_TEXT = { AC: 'Activa', CT: 'Contingencia', CF: 'Arribo confirmado', DD: 'Descargando', CN: 'Descargada', AN: 'Anulada', RE: 'Rechazada', DE: 'Desactivada' }
const MAX_AGE_MS = 10 * 86400000

const normPlate = p => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const dateOf = v => (v && typeof v === 'object' ? v.$date : v) ?? null
const numOf = v => (v && typeof v === 'object' ? v.$numberLong : v) ?? null

export function createCartaPorteSource({ projectRoot }) {
  const file = path.join(projectRoot, 'data', 'arca', 'arca_consignment_notes.json')
  const cache = { mtimeMs: 0, byPlate: new Map(), newestDeparture: null }

  function index() {
    if (!existsSync(file)) return cache
    const { mtimeMs } = statSync(file)
    if (mtimeMs === cache.mtimeMs) return cache
    const byPlate = new Map()
    let newest = null
    for (const n of JSON.parse(readFileSync(file, 'utf8'))) {
      const note = {
        ctg: String(n.ctg),
        stateCode: n.arca_state_code,
        stateSince: dateOf(n.state_start_time),
        departure: dateOf(n.departure_time),
        expire: dateOf(n.expire_time),
        plant: String(numOf(n.destination?.plant) ?? ''),
        plates: (n.transport?.plates ?? []).map(normPlate),
        turnCode: n.transport?.turn_code ?? null,
        grossKg: Number(numOf(n.load?.gross_weight_kg)) || null,
        tareKg: Number(numOf(n.load?.tare_weight_kg)) || null,
      }
      if (note.departure && (!newest || note.departure > newest)) newest = note.departure
      for (const p of note.plates) {
        if (!byPlate.has(p)) byPlate.set(p, [])
        byPlate.get(p).push(note)
      }
    }
    Object.assign(cache, { mtimeMs, byPlate, newestDeparture: newest })
    return cache
  }

  /** La carta con la que el camión está hoy en planta: abierta primero, después la descargada más reciente. */
  function findForPlate(plate, site, now = Date.now()) {
    const plants = new Set(SITE_PLANTS[site] ?? Object.values(SITE_PLANTS).flat())
    const notes = (index().byPlate.get(normPlate(plate)) ?? [])
      .filter(n => plants.has(n.plant) && n.departure && now - Date.parse(n.departure) < MAX_AGE_MS)
      .filter(n => OPEN_STATES.has(n.stateCode) || (n.stateCode === 'CN' && now - Date.parse(n.stateSince ?? 0) < 86400000))
      .sort((a, b) => Number(OPEN_STATES.has(b.stateCode)) - Number(OPEN_STATES.has(a.stateCode)) || b.departure.localeCompare(a.departure))
    return notes.map(n => ({ ...n, stateText: STATE_TEXT[n.stateCode] ?? n.stateCode, byTrailer: n.plates[0] !== normPlate(plate) }))
  }

  const router = express.Router()

  router.get('/api/truckflow/agro/carta-porte', (req, res) => {
    const plate = normPlate(req.query.plate)
    const site = String(req.query.site ?? '').trim().toLowerCase()
    if (!plate) return res.status(400).json({ error: 'Falta la patente' })
    const { newestDeparture, mtimeMs } = index()
    res.json({
      plate,
      notes: findForPlate(plate, site),
      copy: { available: mtimeMs > 0, newestDeparture, updatedAt: mtimeMs ? new Date(mtimeMs).toISOString() : null },
    })
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
