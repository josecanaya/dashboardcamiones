// Editor del plano de planta: guarda a disco lo que se edita a mano en
// PlantLayoutEditor.tsx (`/herramientas/editor-plano`), para no seguir
// describiendo coordenadas por chat — el punto se ubica clickeando la imagen
// real y ahí queda.
//
// Archivos que toca, por sitio (`ricardone`, `san_lorenzo`, …):
//   public/plant/<site>/plantZones.json — el layout completo (PlantLayout).
//     Este módulo solo reemplaza el array `points`; el resto (zones, roads,
//     unplacedCameras, etc.) se relee y se reescribe tal cual estaba.
//   public/plant/<site>/<site>-plano.<ext> — la imagen de fondo, si todavía
//     no existe una planta cargada para ese sitio.
//
// Es una herramienta local de configuración (la usa quien administra el
// tablero), no una API pública: sin auth propia, pensada para correr en la
// máquina de planta como el resto de `server/*.mjs`.

import fs from 'node:fs'
import path from 'node:path'

const SITE_RE = /^[a-z_]{2,32}$/

function isValidSite(site) {
  return typeof site === 'string' && SITE_RE.test(site)
}

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/webp': '.webp' }

export function createPlantLayoutEditorRouter({ publicDir }) {
  const plantDir = (site) => path.join(publicDir, 'plant', site)
  const layoutPath = (site) => path.join(plantDir(site), 'plantZones.json')

  /** Escribe atómico: a un .tmp primero, después rename — no deja el JSON a medio escribir. */
  function writeJsonAtomic(filePath, data) {
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(tmp, filePath)
  }

  /** GET /api/truckflow/plant-layout/:site */
  function getLayout(req, res) {
    const { site } = req.params
    if (!isValidSite(site)) return res.status(400).json({ error: 'sitio inválido' })
    if (!fs.existsSync(layoutPath(site))) return res.status(404).json({ exists: false })
    try {
      const data = JSON.parse(fs.readFileSync(layoutPath(site), 'utf8'))
      res.json({ exists: true, layout: data })
    } catch (e) {
      res.status(500).json({ error: `plantZones.json de ${site} no se pudo leer: ${e.message}` })
    }
  }

  /**
   * PUT /api/truckflow/plant-layout/:site — reemplaza `points` (y opcionalmente
   * `zones`/`flow` si vienen) en el layout guardado. El resto del archivo
   * (metersPerUnit, unplacedCameras, etc.) se conserva tal cual.
   */
  function savePoints(req, res) {
    const { site } = req.params
    if (!isValidSite(site)) return res.status(400).json({ error: 'sitio inválido' })
    const { points } = req.body ?? {}
    if (!Array.isArray(points)) return res.status(400).json({ error: 'falta `points` (array)' })
    for (const p of points) {
      if (!p || typeof p.id !== 'string' || !p.id.trim()) {
        return res.status(400).json({ error: 'cada punto necesita `id`' })
      }
      if (typeof p.xPercent !== 'number' || typeof p.yPercent !== 'number') {
        return res.status(400).json({ error: `punto ${p.id}: xPercent/yPercent tienen que ser números` })
      }
    }
    const ids = points.map((p) => p.id)
    const dupe = ids.find((id, i) => ids.indexOf(id) !== i)
    if (dupe) return res.status(400).json({ error: `id de punto repetido: ${dupe}` })

    if (!fs.existsSync(layoutPath(site))) return res.status(404).json({ error: `${site} no tiene plano cargado todavía` })
    let current
    try {
      current = JSON.parse(fs.readFileSync(layoutPath(site), 'utf8'))
    } catch (e) {
      return res.status(500).json({ error: `plantZones.json de ${site} no se pudo leer: ${e.message}` })
    }
    current.points = points
    current.rev = new Date().toISOString().slice(0, 10)
    try {
      writeJsonAtomic(layoutPath(site), current)
    } catch (e) {
      return res.status(500).json({ error: `no se pudo guardar: ${e.message}` })
    }
    res.json({ ok: true, count: points.length })
  }

  /**
   * POST /api/truckflow/plant-layout/:site/image?width=&height= — sube la
   * imagen de fondo. Si el sitio no tiene `plantZones.json`, crea uno nuevo y
   * vacío (sin puntos: se agregan después, clickeando en el editor); si ya
   * existe, solo reemplaza la imagen y sus medidas.
   *
   * El ancho/alto viajan por query porque los mide el browser al elegir el
   * archivo (`img.naturalWidth/Height`) — evita sumar una librería de imágenes
   * en el server solo para leer el header.
   */
  function uploadImage(req, res) {
    const { site } = req.params
    if (!isValidSite(site)) return res.status(400).json({ error: 'sitio inválido' })
    const width = Number(req.query.width)
    const height = Number(req.query.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return res.status(400).json({ error: 'faltan width/height (numéricos) de la imagen' })
    }
    const ext = EXT_BY_MIME[req.headers['content-type']]
    if (!ext) return res.status(400).json({ error: `Content-Type de imagen no soportado: ${req.headers['content-type']}` })
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'cuerpo de la petición vacío' })
    }

    const dir = plantDir(site)
    fs.mkdirSync(dir, { recursive: true })
    const fileName = `${site}-plano${ext}`
    fs.writeFileSync(path.join(dir, fileName), req.body)

    const isNewSite = !fs.existsSync(layoutPath(site))
    const existing = isNewSite
      ? { rev: new Date().toISOString().slice(0, 10), zones: [], points: [] }
      : JSON.parse(fs.readFileSync(layoutPath(site), 'utf8'))
    existing.basePlan = {
      image: fileName,
      width,
      height,
      note: 'Vista cenital de la planta. Capa fija: no se redibuja ni se recorta.',
    }
    writeJsonAtomic(layoutPath(site), existing)
    res.json({ ok: true, image: fileName, width, height, isNewSite })
  }

  return { getLayout, savePoints, uploadImage }
}
