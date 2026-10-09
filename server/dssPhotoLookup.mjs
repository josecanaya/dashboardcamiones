// Foto de una lectura de patente, pedida al DSS bajo demanda (no se guarda nada en disco).
//
import fs from 'node:fs/promises'
import path from 'node:path'
import { AUTO_EVIDENCE_PROBABILITY, AUTO_EVIDENCE_SAME_NODE_PROBABILITY, scoreCandidates } from './plantState/identificationEvidence.mjs'
import { scoreWithNodeModel } from './plantState/nodeModelScore.mjs'

// El DSS registra todas las lecturas con foto, confianza, marca, color y tipo. El dashboard
// le pide la lectura de una cámara a una hora y baja la foto solo cuando alguien la mira.

/**
 * La hora operativa del feed TruckFlow (occurredAt + 206 min) es la hora real de la cámara
 * + 240 s exactos: coincide al milisegundo (06-10: AH175CU, AB693XO, ESF485 en RicEgrCamFrente).
 */
const FEED_LAG_MS = 240_000
const EVIDENCE_CACHE_MS = 10 * 60_000

/**
 * @param {{ dss: { findVehicleCapture: Function, fetchPicture: Function, isDssConfigured: () => boolean }, getPlantState?: () => ({ getIdentifications: Function }) }} opts
 */
export function createDssPhotoLookup({ dss, getPlantState = () => null }) {
  /** @type {Map<string, { at: number, body: object }>} */
  const evidenceCache = new Map()

  /** Atributos por lectura (no cambian): se piden una sola vez al DSS. 6 h en memoria. */
  /** @type {Map<string, { at: number, value: object|null }>} */
  const attrsCache = new Map()
  const ATTRS_CACHE_MS = 6 * 60 * 60_000

  /** Color, marca y tipo de una lectura (hora operativa del feed), según el DSS. */
  async function attrsAt(device, feedAtIso, plate) {
    if (!device || !feedAtIso) return null
    const k = `${device}|${feedAtIso}|${plate}`
    const hit = attrsCache.get(k)
    if (hit && Date.now() - hit.at < ATTRS_CACHE_MS) return hit.value
    const r = await dss.findVehicleCapture(device, Date.parse(feedAtIso) - FEED_LAG_MS, plate)
    const value = r ? { plate: r.plate, confidence: r.confidence, vehicleColor: r.vehicleColor, vehicleBrand: r.vehicleBrand, vehicleCategory: r.vehicleCategory } : null
    attrsCache.set(k, { at: Date.now(), value })
    if (attrsCache.size > 5000) attrsCache.delete(attrsCache.keys().next().value)
    return value
  }

  /** Patente, color, marca, tipo y recorrido de cada candidato de una lectura, con la probabilidad combinada. */
  async function computeEvidence(item) {
    const shown = item.candidates.filter((c) => c.similarity >= 0.4 || c.nodeProbability >= 0.5).slice(0, 3)
    const dssOk = dss.isDssConfigured()
    // Un error del DSS no se oculta como «sin dato»: se informa y el resultado no se guarda en caché.
    let dssError = null
    const safe = (p) =>
      p.catch((e) => {
        dssError = e instanceof Error ? e.message : String(e)
        return null
      })
    const readAttrs = dssOk ? await safe(attrsAt(item.deviceCode, item.at, item.readPlate)) : null
    const withAttrs = []
    for (const c of shown) withAttrs.push({ ...c, attrs: dssOk ? await safe(attrsAt(c.photoDevice, c.photoAt, c.plate)) : null })
    const scored = scoreCandidates({ readPlate: item.readPlate, validFormat: item.validFormat, readAttrs }, withAttrs)
    // Modelo por nodos, en evaluación: todos los candidatos (no solo los 3 con fotos) y «nunca visto»
    // según el nodo. No interviene en la aplicación automática.
    const attrLrOf = new Map(withAttrs.map((c, i) => [c.plate, scored.candidates[i].attrLr]))
    const nodeModel = scoreWithNodeModel(item, item.candidates.map((c) => ({ ...c, attrLr: attrLrOf.get(c.plate) ?? 1 })))
    return {
      nodeModel,
      fragmentKey: item.fragmentKey,
      read: { plate: item.readPlate, validFormat: item.validFormat, attrs: readAttrs },
      candidates: withAttrs.map((c, i) => ({ ...c, ...scored.candidates[i] })),
      otherProbability: scored.otherProbability,
      dss: dssOk,
      dssError,
    }
  }

  /**
   * GET /api/truckflow/live/identifications/:fragmentKey/evidence?site=
   * Por candidato: patente, color, marca, tipo y recorrido, con la probabilidad combinada.
   */
  const signatureOf = item => JSON.stringify(item.candidates.map(c=>[c.plate,c.journeyKey,c.photoAt,c.inUniverse,c.inventory?.visitId,c.score]))
  async function evidence(req, res) {
    const site = String(req.query.site ?? 'ricardone').trim().toLowerCase() || 'ricardone'
    const key = String(req.params.fragmentKey ?? '')
    const cached = evidenceCache.get(`${site}|${key}`)

    try {
      const ids = await getPlantState().getIdentifications(site)
      const item = ids.items.find((it) => it.fragmentKey === key)
      if (!item) return res.status(404).json({ error: 'lectura no encontrada' })
      const signature=signatureOf(item)
      if (cached && cached.signature===signature && Date.now()-cached.at<EVIDENCE_CACHE_MS) return res.json(cached.body)
      const body = await computeEvidence(item)
      if (!body.dssError) evidenceCache.set(`${site}|${key}`, { at: Date.now(), signature, body })
      res.json(body)
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  /*
   * Aplicación automática con atributos: en segundo plano se pide al DSS la evidencia de las lecturas
   * que el algoritmo marcó `evidenceEligible` (único camión del universo; si la patente es válida,
   * leído en este mismo nodo). Si el candidato supera el umbral calibrado, el servicio la aplica sola.
   * Se procesan pocas por vuelta y en serie: el DSS limita las consultas (HTTP 429).
   */
  /** @type {Set<string>} lecturas ya evaluadas (fragmento + candidato) */
  const autoTried = new Set()
  let autoTimer = null
  let autoRunning = false
  async function autoEvidenceTick(sites, perTick) {
    if (autoRunning || !dss.isDssConfigured()) return
    autoRunning = true
    try {
      for (const site of sites) {
        const ps = getPlantState()
        if (!ps?.setEvidenceVerdict) return
        const ids = await ps.getIdentifications(site)
        const queue = ids.items.filter((it) => it.evidenceEligible && it.candidates[0] && !autoTried.has(`${site}|${it.fragmentKey}|${it.candidates[0].plate}`))
        for (const item of queue.slice(0, perTick)) {
          const best = item.candidates[0]
          const tag = `${site}|${item.fragmentKey}|${best.plate}`
          const ev = await computeEvidence(item)
          if (ev.dssError) continue // se reintenta en la próxima vuelta
          autoTried.add(tag)
          evidenceCache.set(`${site}|${item.fragmentKey}`, { at: Date.now(), signature:signatureOf(item), body: ev })
          const top = [...ev.candidates].sort((a, b) => b.probability - a.probability)[0]
          const threshold = item.validFormat ? AUTO_EVIDENCE_SAME_NODE_PROBABILITY : AUTO_EVIDENCE_PROBABILITY
          if (top && top.plate === best.plate && top.probability >= threshold) {
            ps.setEvidenceVerdict(site, item.fragmentKey, { plate: top.plate, probability: Math.round(top.probability * 1000) / 1000, at: new Date().toISOString() })
            console.log(`[identificación] ${site} ${item.readPlate} → ${top.plate} aplicada con DSS (${Math.round(top.probability * 100)}%)`)
          }
        }
      }
    } catch (e) {
      console.warn('[identificación] evidencia automática falló:', e instanceof Error ? e.message : e)
    } finally {
      autoRunning = false
      if (autoTried.size > 20000) autoTried.clear()
    }
  }
  function startAutoEvidence({ sites = ['ricardone', 'san_lorenzo'], intervalMs = 30_000, perTick = 3 } = {}) {
    if (autoTimer) return
    autoTimer = setInterval(() => void autoEvidenceTick(sites, perTick), intervalMs)
    autoTimer.unref?.()
  }

  /** GET /api/truckflow/camera-captures/find?device=&at=<hora operativa del feed>&plate= */
  async function find(req, res) {
    const device = String(req.query.device ?? '').trim()
    const atMs = Date.parse(String(req.query.at ?? ''))
    const plate = String(req.query.plate ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
    if (!device || !Number.isFinite(atMs)) return res.status(400).json({ error: 'faltan parámetros device/at' })
    const realMs = atMs - FEED_LAG_MS
    const realAt = new Date(realMs).toISOString()
    if (!dss.isDssConfigured()) return res.json({ found: false, capture: null, realAt, error: 'DSS no configurado en .env' })
    try {
      const r = await dss.findVehicleCapture(device, realMs, plate)
      if (!r) return res.json({ found: false, capture: null, realAt, error: null })
      const pic = (u) => (u ? Buffer.from(u).toString('base64url') : null)
      const { scenePicture, platePicture, ...meta } = r
      res.json({
        found: true,
        realAt,
        error: null,
        capture: { ...meta, sceneFile: pic(scenePicture), plateFile: pic(platePicture), diffMs: Math.abs(Date.parse(r.at) - realMs) },
      })
    } catch (e) {
      res.json({ found: false, capture: null, realAt, error: e instanceof Error ? e.message : String(e) })
    }
  }

  /** GET /api/truckflow/camera-captures/image?file=<URL de foto del DSS en base64url> */
  async function image(req, res) {
    const file = String(req.query.file ?? '')
    if (!/^[A-Za-z0-9_-]+$/.test(file)) return res.status(400).json({ error: 'foto inválida' })
    try {
      const { type, buf } = await dss.fetchPicture(Buffer.from(file, 'base64url').toString('utf8'))
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', 'private, max-age=86400')
      res.send(buf)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  /**
   * EV-40: copia en disco las fotos que el operador vio al decidir, para reconstruir la decisión
   * aunque el DSS deje de servirlas. data/identification-evidence/<site>/<fragmentKey>/<opId>/
   * @param {string} root carpeta base
   * @param {{ site: string, fragmentKey: string, opId: string|null, decision: object|null, photos: Record<string, { device?: string, at?: string, plate?: string, sceneFile?: string|null, plateFile?: string|null }> }} rec
   */
  async function archiveEvidence(root, rec) {
    const safe = (v) => String(v || 'sin-id').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 120)
    const dir = path.join(root, safe(rec.site), safe(rec.fragmentKey), safe(rec.opId || Date.now()))
    await fs.mkdir(dir, { recursive: true })
    const saved = {}
    for (const [role, photo] of Object.entries(rec.photos || {})) {
      for (const kind of ['sceneFile', 'plateFile']) {
        const file = photo?.[kind]
        if (!file || !/^[A-Za-z0-9_-]+$/.test(file)) continue
        try {
          const { type, buf } = await dss.fetchPicture(Buffer.from(file, 'base64url').toString('utf8'))
          const name = `${safe(role)}-${kind === 'sceneFile' ? 'escena' : 'patente'}.${String(type).includes('png') ? 'png' : 'jpg'}`
          await fs.writeFile(path.join(dir, name), buf)
          ;(saved[role] ||= {})[kind] = name
        } catch (e) {
          ;(saved[role] ||= {})[`${kind}Error`] = e instanceof Error ? e.message : String(e)
        }
      }
    }
    await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ ...rec, savedAt: new Date().toISOString(), saved }, null, 2))
    return { dir, saved }
  }

  return { find, image, evidence, archiveEvidence, startAutoEvidence, autoEvidenceTick }
}
