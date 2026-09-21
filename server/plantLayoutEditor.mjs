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
    const { points, zones, tramos, circuitCompositions } = req.body ?? {}
    if (!Array.isArray(points)) return res.status(400).json({ error: 'falta `points` (array)' })
    for (const p of points) {
      if (!p || typeof p.id !== 'string' || !p.id.trim()) {
        return res.status(400).json({ error: 'cada punto necesita `id`' })
      }
      if (typeof p.xPercent !== 'number' || typeof p.yPercent !== 'number') {
        return res.status(400).json({ error: `punto ${p.id}: xPercent/yPercent tienen que ser números` })
      }
      if (p.xPercent < 0 || p.xPercent > 100 || p.yPercent < 0 || p.yPercent > 100) {
        return res.status(400).json({ error: `punto ${p.id}: coordenadas fuera del plano` })
      }
    }
    const ids = points.map((p) => p.id)
    const dupe = ids.find((id, i) => ids.indexOf(id) !== i)
    if (dupe) return res.status(400).json({ error: `id de punto repetido: ${dupe}` })

    if (zones != null && !Array.isArray(zones)) {
      return res.status(400).json({ error: '`zones` tiene que ser un array' })
    }
    if (Array.isArray(zones)) {
      const zoneIds = zones.map((z) => z?.zoneId)
      const duplicateZone = zoneIds.find((id, i) => typeof id === 'string' && zoneIds.indexOf(id) !== i)
      if (duplicateZone) return res.status(400).json({ error: `zoneId repetido: ${duplicateZone}` })
      for (const zone of zones) {
        if (!zone || typeof zone.zoneId !== 'string' || !zone.zoneId.trim()) {
          return res.status(400).json({ error: 'cada sector necesita `zoneId`' })
        }
        if (typeof zone.label !== 'string' || !zone.label.trim()) {
          return res.status(400).json({ error: `sector ${zone.zoneId}: falta nombre` })
        }
        if (zone.polygonPercent != null) {
          if (!Array.isArray(zone.polygonPercent) || (zone.polygonPercent.length > 0 && zone.polygonPercent.length < 3)) {
            return res.status(400).json({ error: `sector ${zone.zoneId}: el polígono necesita al menos 3 vértices` })
          }
          for (const vertex of zone.polygonPercent) {
            const x = vertex?.xPercent
            const y = vertex?.yPercent
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) {
              return res.status(400).json({ error: `sector ${zone.zoneId}: vértice fuera del plano` })
            }
          }
        }
      }
    }
    if (tramos != null && !Array.isArray(tramos)) return res.status(400).json({ error: '`tramos` tiene que ser un array' })
    if (Array.isArray(tramos)) {
      const tramoIds = new Set()
      for (const tramo of tramos) {
        if (!tramo || typeof tramo.id !== 'string' || tramoIds.has(tramo.id)) return res.status(400).json({ error: 'tramo inválido o repetido' })
        tramoIds.add(tramo.id)
        if (typeof tramo.fromPointId !== 'string' || typeof tramo.toPointId !== 'string' || tramo.fromPointId === tramo.toPointId) return res.status(400).json({ error: `tramo ${tramo.id}: extremos inválidos` })
        if (!ids.includes(tramo.fromPointId) || !ids.includes(tramo.toPointId)) return res.status(400).json({ error: `tramo ${tramo.id}: referencia un punto inexistente` })
        if (!Array.isArray(tramo.viaPercent)) return res.status(400).json({ error: `tramo ${tramo.id}: falta viaPercent` })
        for (const vertex of tramo.viaPercent) {
          if (!Number.isFinite(vertex?.xPercent) || !Number.isFinite(vertex?.yPercent) || vertex.xPercent < 0 || vertex.xPercent > 100 || vertex.yPercent < 0 || vertex.yPercent > 100) return res.status(400).json({ error: `tramo ${tramo.id}: vértice fuera del plano` })
        }
      }
    }
    if (circuitCompositions != null && !Array.isArray(circuitCompositions)) return res.status(400).json({ error: '`circuitCompositions` tiene que ser un array' })
    if (Array.isArray(circuitCompositions)) {
      const validTramos = new Set((tramos ?? []).map((item) => item.id))
      for (const composition of circuitCompositions) {
        if (!composition || typeof composition.circuitCode !== 'string' || !Array.isArray(composition.tramos)) return res.status(400).json({ error: 'composición de circuito inválida' })
        if (composition.tramos.some((ref) => !ref || typeof ref.tramoId !== 'string' || !validTramos.has(ref.tramoId))) return res.status(400).json({ error: `circuito ${composition.circuitCode}: referencia un tramo inexistente` })
      }
    }

    if (!fs.existsSync(layoutPath(site))) return res.status(404).json({ error: `${site} no tiene plano cargado todavía` })
    let current
    try {
      current = JSON.parse(fs.readFileSync(layoutPath(site), 'utf8'))
    } catch (e) {
      return res.status(500).json({ error: `plantZones.json de ${site} no se pudo leer: ${e.message}` })
    }
    current.points = points
    if (Array.isArray(zones)) current.zones = zones
    if (Array.isArray(tramos)) current.tramos = tramos
    if (Array.isArray(circuitCompositions)) current.circuitCompositions = circuitCompositions
    current.rev = new Date().toISOString().slice(0, 10)
    try {
      writeJsonAtomic(layoutPath(site), current)
    } catch (e) {
      return res.status(500).json({ error: `no se pudo guardar: ${e.message}` })
    }
    res.json({ ok: true, pointCount: points.length, zoneCount: current.zones?.length ?? 0, tramoCount: current.tramos?.length ?? 0 })
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
      ? { rev: new Date().toISOString().slice(0, 10), zones: [], points: [], tramos: [], circuitCompositions: [] }
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
