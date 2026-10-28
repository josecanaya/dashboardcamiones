/**
 * La IA en vivo (capa 3, última instancia): para cada lectura abierta (con o sin candidatos) o ilegible, baja
 * del DSS la foto de la captura y las de las lecturas anteriores de cada candidato, las guarda en la
 * galería por patente (data/vision/fotos + galeria.jsonl con su vector) y le pregunta a Claude Opus
 * de quién es, imagen contra imagen (claudeVision.mjs). De la galería se suman, por candidato, las
 * fotos anteriores que la base vectorial ve más parecidas a la captura.
 *
 * El veredicto queda en el caso (`ia`) y en data/vision/veredictos.jsonl; se aplica solo si la patente que lee
 * la IA figura en la carta o en Vehículos Permitidos (seenPlate.mjs). Las máquinas van a la base de no camiones.
 * Apagada por defecto: VISION_IA=1 la prende; VISION_MAX_PER_DAY limita cuántas consultas hace por día.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { decideByImage } from './claudeVision.mjs'
import { cosine, embedImage } from './vectorBase.mjs'

/** La hora operativa del feed es la de la cámara + 240 s (ver dssPhotoLookup.mjs). */
const FEED_LAG_MS = 240_000
const OPEN = new Set(['provisorio', 'pendiente'])
const safe = (v) => String(v || 'x').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80)
const f32ToB64 = (v) => Buffer.from(new Float32Array(v).buffer).toString('base64')
const b64ToF32 = (s) => Array.from(new Float32Array(Buffer.from(s, 'base64').buffer.slice(0)))

export function createVisionJudge({ dss, getPlantState, projectRoot, intervalMs = 60_000, perTick = 1, maxPerDay = Number(process.env.VISION_MAX_PER_DAY || 300), onMachine = () => {}, log = console }) {
  const dir = path.join(projectRoot, 'data', 'vision')
  const galleryFile = path.join(dir, 'galeria.jsonl')
  const verdictFile = path.join(dir, 'veredictos.jsonl')
  mkdirSync(path.join(dir, 'fotos'), { recursive: true })

  /** @type {Map<string, { plate: string, device: string, at: string, scene: string, plateCrop: string|null, cls: number[] }[]>} */
  const gallery = new Map()
  const seen = new Set()
  if (existsSync(galleryFile)) {
    for (const line of readFileSync(galleryFile, 'utf8').split('\n')) {
      if (!line) continue
      try {
        const g = JSON.parse(line)
        const e = { ...g, cls: b64ToF32(g.cls) }
        gallery.set(g.plate, [...(gallery.get(g.plate) ?? []), e])
        seen.add(`${g.device}|${g.at}`)
      } catch {}
    }
  }
  /** Veredictos ya pedidos: fragmento → veredicto (no se vuelve a preguntar). */
  const verdicts = new Map()
  if (existsSync(verdictFile)) {
    for (const line of readFileSync(verdictFile, 'utf8').split('\n')) {
      try {
        const v = JSON.parse(line)
        verdicts.set(`${v.site}|${v.fragmentKey}`, v)
      } catch {}
    }
  }
  let day = ''
  let usedToday = 0
  let running = false
  let lastError = null

  /** Baja la lectura del DSS y la guarda (escena + patente) en la galería de esa patente. */
  async function capture(device, feedAtIso, plate, { addToGallery = true } = {}) {
    if (!device || !feedAtIso) return null
    const r = await dss.findVehicleCapture(device, Date.parse(feedAtIso) - FEED_LAG_MS, plate)
    if (!r?.scenePicture) return null
    const base = path.join(dir, 'fotos', safe(plate || 'sin-patente'))
    mkdirSync(base, { recursive: true })
    const stem = `${safe(device)}_${safe(r.at)}`
    const scene = path.join(base, `${stem}-escena.jpg`)
    const plateCrop = r.platePicture ? path.join(base, `${stem}-patente.jpg`) : null
    if (!existsSync(scene)) writeFileSync(scene, (await dss.fetchPicture(r.scenePicture)).buf)
    if (plateCrop && !existsSync(plateCrop)) writeFileSync(plateCrop, (await dss.fetchPicture(r.platePicture)).buf)
    const cls = (await embedImage(scene)).cls
    const entry = { plate, device, at: r.at, scene, plateCrop, cls }
    if (addToGallery && plate && !seen.has(`${device}|${r.at}`)) {
      seen.add(`${device}|${r.at}`)
      gallery.set(plate, [...(gallery.get(plate) ?? []), entry])
      appendFileSync(galleryFile, `${JSON.stringify({ ...entry, cls: f32ToB64(cls) })}\n`)
    }
    return entry
  }

  /** Fotos anteriores del candidato: las de sus últimas lecturas y las más parecidas de la galería. */
  async function candidateImages(c, captureEntry) {
    const fresh = []
    for (const r of (c.recentReads ?? []).slice(0, 2)) {
      const e = await capture(r.device, r.at, c.plate).catch(() => null)
      if (e) fresh.push(e)
    }
    const old = (gallery.get(c.plate) ?? [])
      .filter((g) => !fresh.some((f) => f.scene === g.scene))
      .map((g) => ({ g, sim: captureEntry ? cosine(captureEntry.cls, g.cls) : 0 }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, Math.max(0, 3 - fresh.length))
      .map(({ g }) => g)
    return [...fresh, ...old].slice(0, 3)
  }

  async function judge(site, item) {
    const cap = await capture(item.deviceCode, item.at, item.readPlate, { addToGallery: false })
    if (!cap) return { skipped: 'sin foto de la captura en el DSS' }
    // Los candidatos que mira operaciones: parecidos por patente o el de la cuenta.
    const cands = item.candidates.filter((c) => c.similarity >= 0.4 || c.plate === item.cuenta?.plate).slice(0, 3)
    const withImages = []
    for (const c of cands) {
      const imgs = await candidateImages(c, cap)
      if (imgs.length) withImages.push({ id: c.plate, images: imgs.map((g) => ({ scene: g.scene, plate: g.plateCrop, label: g.device })) })
    }
    // Sin candidatos (o sin fotos de ellos) la IA igual mira la captura: lee la patente y dice qué vehículo es.
    const r = await decideByImage({ scene: cap.scene, plate: cap.plateCrop, label: item.deviceCode }, withImages)
    // seenPlate: la patente que la IA lee en la foto (vuelve a buscarse en la capa 2, ver seenPlate.mjs).
    return { plate: r.choice, confidence: r.confidence, seenPlate: r.seenPlate, seenPlateConfidence: r.seenPlateConfidence, vehicleType: r.vehicleType, reason: r.reason, candidates: withImages.map((c) => c.id), costUsd: r.costUsd }
  }

  async function tick() {
    if (running || !dss.isDssConfigured()) return
    const today = new Date().toISOString().slice(0, 10)
    if (today !== day) {
      day = today
      usedToday = 0
    }
    if (usedToday >= maxPerDay) return
    running = true
    try {
      const ps = getPlantState()
      for (const site of ['ricardone', 'san_lorenzo']) {
        const ids = await ps.getIdentifications(site)
        // Abiertas (con o sin candidatos) y las ilegibles que quedaron «fuera del sistema». Primero las sin
        // candidatos (nadie más las puede resolver), y dentro de cada grupo las más recientes.
        const queue = ids.items
          .filter((it) => (OPEN.has(it.level) || (it.level === 'fuera_sistema' && !it.validFormat)) && !it.decision && !it.archived && !verdicts.has(`${site}|${it.fragmentKey}`))
          .sort((a, b) => Number(Boolean(a.candidates?.length)) - Number(Boolean(b.candidates?.length)) || b.at.localeCompare(a.at))
        for (const item of queue.slice(0, perTick)) {
          if (usedToday >= maxPerDay) break
          usedToday++
          const at = new Date().toISOString()
          const v = { site, fragmentKey: item.fragmentKey, readPlate: item.readPlate, node: item.node, captureAt: item.at, levelBefore: item.level, at, ...(await judge(site, item)) }
          verdicts.set(`${site}|${item.fragmentKey}`, v)
          appendFileSync(verdictFile, `${JSON.stringify(v)}\n`)
          ps.setVisionVerdict?.(site, item.fragmentKey, v)
          // Una máquina vista en la foto entra a la base de no camiones (aprendizaje.mjs).
          if (v.vehicleType === 'maquinaria') onMachine(v)
          log.info?.(`[ia] ${site} ${item.readPlate}: ${v.skipped ?? `${v.plate ?? 'ninguno'} (${Math.round((v.confidence ?? 0) * 100)} %)`}`)
        }
      }
      lastError = null
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      log.warn?.(`[ia] ${lastError}`)
    } finally {
      running = false
    }
  }

  return {
    start() {
      // Veredictos guardados de antes del reinicio vuelven a los casos.
      const ps = getPlantState()
      for (const v of verdicts.values()) ps.setVisionVerdict?.(v.site, v.fragmentKey, v)
      setInterval(() => void tick(), intervalMs).unref?.()
    },
    tick,
    status: () => ({ veredictos: verdicts.size, hoy: usedToday, maxPorDia: maxPerDay, patentesEnGaleria: gallery.size, fotosEnGaleria: [...gallery.values()].reduce((s, l) => s + l.length, 0), lastError }),
    verdicts: (site) => [...verdicts.values()].filter((v) => !site || v.site === site),
  }
}
