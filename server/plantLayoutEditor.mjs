// Editor del plano sobre el modelo IFC: guarda a disco los ajustes que se hacen a mano en
// PlantIfcEditor.tsx (Datos → Editar plano), para no seguir describiendo coordenadas por chat —
// el punto se ubica clickeando el modelo y ahí queda.
//
// Archivo que toca, por sitio (`ricardone`, `san_lorenzo`, …):
//   public/plant/<site>/ifc-overrides.json —
//     { points: { S6: [x, y, z] }, zoneFloors: { Z6: [guid, …] }, removedZones: ['Z3'], tramos: { 'S1::S2': [edgeId | floorGuid, …] } }
//     en coordenadas locales del IFC. En vivo (plant3dView.ts) los aplica por encima de lo que
//     deduce el exportador (`pointNodes`, `zoneFloors`, `tramos` de modelo-3d.json). Un tramo con
//     lista vacía va en línea recta.
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

/** Coordenadas locales razonables para una planta (metros desde el origen del modelo). */
const MAX_LOCAL_M = 5000

export function createPlantLayoutEditorRouter({ publicDir }) {
  const plantDir = (site) => path.join(publicDir, 'plant', site)
  const layoutPath = (site) => path.join(plantDir(site), 'plantZones.json')
  const modelPath = (site) => path.join(plantDir(site), 'modelo-3d.json')
  const overridesPath = (site) => path.join(plantDir(site), 'ifc-overrides.json')

  /** Escribe atómico: a un .tmp primero, después rename — no deja el JSON a medio escribir. */
  function writeJsonAtomic(filePath, data) {
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
    fs.renameSync(tmp, filePath)
  }

  /**
   * PUT /api/truckflow/plant-layout/:site/ifc-overrides — reemplaza el archivo entero. Cada punto y
   * zona tiene que existir en plantZones.json; cada piso y eje, en `floors`/`edges` de modelo-3d.json.
   */
  function saveIfcOverrides(req, res) {
    const { site } = req.params
    if (!isValidSite(site)) return res.status(400).json({ error: 'sitio inválido' })
    const { points = {}, zoneFloors = {}, removedZones = [], tramos = {} } = req.body ?? {}
    const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v)
    if (!isMap(points) || !isMap(zoneFloors) || !isMap(tramos) || !Array.isArray(removedZones)) {
      return res.status(400).json({ error: '`points`, `zoneFloors` y `tramos` tienen que ser objetos; `removedZones`, una lista' })
    }
    if (!fs.existsSync(layoutPath(site)) || !fs.existsSync(modelPath(site))) {
      return res.status(404).json({ error: `${site} no tiene plano o modelo IFC exportado` })
    }
    let layout, model
    try {
      layout = JSON.parse(fs.readFileSync(layoutPath(site), 'utf8'))
      model = JSON.parse(fs.readFileSync(modelPath(site), 'utf8'))
    } catch (e) {
      return res.status(500).json({ error: `no se pudo leer el plano de ${site}: ${e.message}` })
    }
    const pointIds = new Set((layout.points ?? []).map((p) => p.id))
    const zoneIds = new Set((layout.zones ?? []).map((z) => z.zoneId))
    const floorIds = new Set((model.floors ?? []).map((f) => f.guid))
    const edgeIds = new Set((model.edges ?? []).map((e) => e.id))

    for (const [id, at] of Object.entries(points)) {
      if (!pointIds.has(id)) return res.status(400).json({ error: `punto ${id}: no existe en el plano` })
      if (!Array.isArray(at) || at.length !== 3 || !at.every((v) => Number.isFinite(v) && Math.abs(v) <= MAX_LOCAL_M)) {
        return res.status(400).json({ error: `punto ${id}: tiene que ser [x, y, z] en metros del modelo` })
      }
    }
    for (const [id, guids] of Object.entries(zoneFloors)) {
      if (!zoneIds.has(id)) return res.status(400).json({ error: `zona ${id}: no existe en el plano` })
      const list = Array.isArray(guids) ? guids : [guids]
      const bad = list.find((g) => typeof g !== 'string' || !floorIds.has(g))
      if (bad !== undefined) return res.status(400).json({ error: `zona ${id}: el piso ${bad} no está en el modelo` })
    }
    const badZone = removedZones.find((id) => !zoneIds.has(id))
    if (badZone !== undefined) return res.status(400).json({ error: `zona ${badZone}: no existe en el plano` })
    for (const [id, edges] of Object.entries(tramos)) {
      const [a, b, extra] = id.split('::')
      if (extra !== undefined || !pointIds.has(a) || !pointIds.has(b) || a === b || [a, b].sort().join('::') !== id) {
        return res.status(400).json({ error: `tramo ${id}: tiene que ser A::B con dos puntos del plano en orden` })
      }
      if (!Array.isArray(edges)) return res.status(400).json({ error: `tramo ${id}: tiene que ser una lista de ejes y pisos` })
      const bad = edges.find((e) => !edgeIds.has(e) && !floorIds.has(e))
      if (bad !== undefined) return res.status(400).json({ error: `tramo ${id}: ${bad} no es un eje ni un piso del modelo` })
    }

    const out = {
      points: Object.fromEntries(Object.entries(points).map(([id, at]) => [id, at.map((v) => Math.round(v * 100) / 100)])),
      zoneFloors: Object.fromEntries(Object.entries(zoneFloors).map(([id, g]) => [id, [...new Set(Array.isArray(g) ? g : [g])]])),
      removedZones: [...new Set(removedZones)],
      tramos: Object.fromEntries(Object.entries(tramos).map(([id, e]) => [id, [...new Set(e)]])),
    }
    try {
      writeJsonAtomic(overridesPath(site), out)
    } catch (e) {
      return res.status(500).json({ error: `no se pudo guardar: ${e.message}` })
    }
    res.json({ ok: true, pointCount: Object.keys(out.points).length, zoneCount: Object.keys(out.zoneFloors).length, removedZoneCount: out.removedZones.length, tramoCount: Object.keys(out.tramos).length })
  }

  return { saveIfcOverrides }
}
