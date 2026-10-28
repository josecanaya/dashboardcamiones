// Exporta el modelo IFC de cada planta (paquete NVA en data/nva-ifc) al formato que dibuja En vivo:
// public/plant/<site>/modelo-3d.json con las mallas, la cámara fija de las imágenes de circuitos
// la transformación del plano cenital (porcentajes del layout) a coordenadas locales del IFC
// y los tramos entre puntos sobre los ejes viales del IFC (trafico.json → edges).
//
//   node scripts/planta-3d/exportar-modelo.mjs
//
// La cámara sale de `affine_world_to_reference` de las imágenes de referencia: es la proyección
// ortogonal con que se armaron las vistas de circuitos, así el visor queda en ese mismo punto fijo.
// Los puntos del layout se pasan al IFC por un ajuste afín contra los nodos de tráfico del paquete.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '../..')
const SRC = path.join(ROOT, 'data/nva-ifc/datos')
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))

const modelos = read(path.join(SRC, 'modelos.json'))
const trafico = read(path.join(SRC, 'trafico.json'))
const trazados = read(path.join(SRC, 'trazados_imagenes.json'))
const simplificada = read(path.join(SRC, 'vista-simplificada.json'))

/**
 * Punto del layout (id) → nodo de tráfico del IFC (nombre). Solo los que son el mismo lugar físico.
 * En el modelo el punto va donde está su nodo (IfcGroup NVA_TRAFFIC_NODE), no donde cae la foto.
 */
const ANCHORS = {
  ricardone: {
    S0: 'Ingreso', S1: 'Pre ingreso', S2: 'Calada', 'S2-LIQ': 'Liquidos Carga/Descarga', S4: 'Balanza Ingreso',
    S5: 'Celda 16', S6: 'Playa 3', 'S9-V1': 'Volcable 1', 'S9-V2': 'Volcable 2', 'S7-A': 'Volcable Silo Keppler',
    'S7-B': 'Volcable Silo Chief', S8: 'Tolva de carga silo Chief', S3: 'Salida 2', S10: 'Salida 1',
  },
  san_lorenzo: {
    S1: 'Balanza Ingreso', S2: 'Calada', S4: 'Plataformas Volcables', S5: 'Balanza Egreso', S7: 'Egreso',
    S8: 'Carga/Descarga Renova', S10: 'Carga / Descarga OSL', S6: 'Carga/descarga',
  },
}
/**
 * Puntos de ajuste marcados a mano (pixel de la foto cenital → coordenada local del IFC), para
 * plantas donde los nodos no alcanzan: los nodos son centros de zona y los puntos del plano son cámaras.
 * Son rasgos que se ven en los dos: galpones, grupos de silos y tanques.
 */
const TIEPOINTS = {
  ricardone: {
    // La foto mide 1375×1144 aunque el layout declare otra medida: los porcentajes son de la imagen.
    imageSize: [1375, 1144],
    points: [
      { feature: 'Celda 16, centro del galpón', px: [250, 200], local: [-441, 262] },
      { feature: 'silos Chief (2 hileras de 5)', px: [1035, 955], local: [210, -360] },
      { feature: 'grupo de silos este', px: [1205, 940], local: [345, -330] },
      { feature: 'galpón girado', px: [1080, 800], local: [230, -230] },
      { feature: 'galpón largo sur', px: [608, 898], local: [-113, -370] },
      { feature: 'dos domos plateados', px: [755, 600], local: [-31, -120] },
      { feature: 'cuatro domos plateados', px: [315, 791], local: [-348, -296] },
    ],
  },
  san_lorenzo: {
    imageSize: [1891, 831],
    points: [
      { feature: 'tanques de líquidos (6)', px: [580, 535], local: [-105, -80] },
      { feature: 'tanques grandes junto al galpón', px: [635, 322], local: [-99, 56] },
      { feature: 'silos domo (4)', px: [1215, 670], local: [225, -115] },
      { feature: 'galpón largo norte, centro', px: [888, 238], local: [21, 125] },
      { feature: 'tanques junto al muelle', px: [1520, 775], local: [395, -155] },
    ],
  },
}
/** Un nodo con piso de al menos esta superficie es una playa: sus camiones se estacionan adentro. */
const PLAYA_MIN_M2 = 1000

const polyArea = (p) => {
  let a = 0
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1 }
  return Math.abs(a / 2)
}
const pointInPoly = (p, [x, y]) => {
  let c = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** Punto del borde de `poly` más cercano a `q`, corrido unos metros hacia adentro. */
const ACCESS_INSET_M = 6
function accessOnEdge(poly, q) {
  let best = null
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const c = [a[0] + t * dx, a[1] + t * dy]
    const d = Math.hypot(c[0] - q[0], c[1] - q[1])
    if (!best || d < best.d) best = { c, d }
  }
  const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length, cy = poly.reduce((s, v) => s + v[1], 0) / poly.length
  const k = ACCESS_INSET_M / (Math.hypot(cx - best.c[0], cy - best.c[1]) || 1)
  return [best.c[0] + (cx - best.c[0]) * k, best.c[1] + (cy - best.c[1]) * k]
}

/** Un ancla más lejos que esto del ajuste se descarta (nodo mal ubicado en alguno de los dos planos). */
const MAX_RESIDUAL_M = 35

const r2 = (n) => Math.round(n * 100) / 100

/** Mínimos cuadrados de [x y 1]·M = [X Y]: devuelve [[a b c], [d e f]] con X = a·x + b·y + c. */
function fitAffine(src, dst) {
  const solve3 = (A, b) => {
    const m = A.map((row, i) => [...row, b[i]])
    for (let c = 0; c < 3; c++) {
      let p = c
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
      ;[m[c], m[p]] = [m[p], m[c]]
      for (let r = 0; r < 3; r++) if (r !== c) {
        const k = m[r][c] / m[c][c]
        for (let j = c; j < 4; j++) m[r][j] -= k * m[c][j]
      }
    }
    return m.map((row, i) => row[3] / row[i])
  }
  const AtA = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const AtX = [0, 0, 0]
  const AtY = [0, 0, 0]
  src.forEach(([x, y], i) => {
    const row = [x, y, 1]
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) AtA[a][b] += row[a] * row[b]
      AtX[a] += row[a] * dst[i][0]
      AtY[a] += row[a] * dst[i][1]
    }
  })
  return [solve3(AtA, AtX), solve3(AtA, AtY)]
}
const applyAffine = (M, [x, y]) => [M[0][0] * x + M[0][1] * y + M[0][2], M[1][0] * x + M[1][1] * y + M[1][2]]

/** Ejes viales del IFC que siguen el centro de una franja de las imágenes (los demás son pendientes o lógicos). */
const EDGE_OK = 'centro_de_franja_extraida_de_imagen'

/**
 * Tramos entre puntos del layout sobre los ejes del IFC. Cada nodo con punto (ANCHORS) es un extremo;
 * los nodos sin punto (Playa 1, Balanza Egreso…) se atraviesan encadenando ejes, nunca otro punto.
 * Por cada par queda el camino más corto (suma de `length_m`), en coordenadas locales.
 */
function tramosFromEdges(site) {
  const pointOf = new Map(Object.entries(ANCHORS[site]).map(([id, name]) => [`${site}:${name}`, id]))
  const adj = new Map()
  const link = (from, to, e, pts) => adj.set(from, [...(adj.get(from) ?? []), { to, e, pts }])
  for (const e of trafico.edges) {
    if (e.plant !== site || e.status !== EDGE_OK || !e.points?.length || e.from === e.to) continue
    link(e.from, e.to, e, e.points)
    link(e.to, e.from, e, [...e.points].reverse())
  }
  const best = new Map()
  for (const [start, fromId] of pointOf) {
    if (!adj.has(start)) continue
    const dist = new Map([[start, { d: 0, steps: [] }]])
    const open = new Set([start])
    while (open.size) {
      const node = [...open].reduce((m, n) => (dist.get(n).d < dist.get(m).d ? n : m))
      open.delete(node)
      const cur = dist.get(node)
      // Un punto del layout corta el camino: se llega a él, no se pasa por él.
      if (node !== start && pointOf.has(node)) continue
      for (const { to, e, pts } of adj.get(node) ?? []) {
        const d = cur.d + e.length_m
        if (dist.has(to) && dist.get(to).d <= d) continue
        dist.set(to, { d, steps: [...cur.steps, { e, pts }] })
        open.add(to)
      }
    }
    for (const [node, { d, steps }] of dist) {
      const toId = pointOf.get(node)
      if (!toId || node === start) continue
      const id = [fromId, toId].sort().join('::')
      if (best.has(id) && best.get(id).lengthM <= d) continue
      const points = steps.flatMap(({ pts }, i) => (i ? pts.slice(1) : pts)).map((q) => q.map(r2))
      best.set(id, { id, fromPointId: fromId, toPointId: toId, lengthM: r2(d), edges: steps.map(({ e }) => e.id), points })
    }
  }
  return [...best.values()].sort((x, y) => x.id.localeCompare(y.id))
}

/** Ejes de pantalla de la proyección ortogonal de las imágenes: derecha y arriba en coordenadas locales. */
function cameraFromImages(site) {
  const best = trazados.filter((t) => t.plant === site).sort((a, b) => b.registration_inliers - a.registration_inliers)[0]
  const [[a, b], [d, e]] = best.affine_world_to_reference
  const scale = Math.hypot(a, b)
  const right = [a / scale, b / scale, 0]
  // En la imagen la Y crece hacia abajo: el "arriba" en planta es -fila.
  const upXY = [-d / scale, -e / scale]
  const sinEl = Math.hypot(...upXY)
  const up = [upXY[0], upXY[1], Math.sqrt(Math.max(0, 1 - sinEl * sinEl))]
  return { right: right.map((v) => +v.toFixed(5)), up: up.map((v) => +v.toFixed(5)), elevationDeg: +(Math.asin(sinEl) * 180 / Math.PI).toFixed(1), sourceImage: best.source_filename }
}

for (const site of ['ricardone', 'san_lorenzo']) {
  const layout = read(path.join(ROOT, 'public/plant', site, 'plantZones.json'))
  const { width, height } = layout.basePlan
  const nodes = new Map(trafico.nodes.filter((n) => n.plant === site && n.position).map((n) => [n.name, n.position]))

  const tie = TIEPOINTS[site]
  const groundGuess = [...nodes.values()][0][2]
  let pairs = tie
    ? tie.points.map((t) => ({ id: t.feature, px: [(t.px[0] / tie.imageSize[0]) * width, (t.px[1] / tie.imageSize[1]) * height], local: [...t.local, groundGuess] }))
    : (layout.points ?? []).flatMap((p) => {
      const pos = nodes.get(ANCHORS[site][p.id])
      return pos ? [{ id: p.id, px: [(p.xPercent / 100) * width, (p.yPercent / 100) * height], local: pos }] : []
    })
  let M
  for (;;) {
    M = fitAffine(pairs.map((p) => p.px), pairs.map((p) => p.local))
    for (const p of pairs) {
      const [x, y] = applyAffine(M, p.px)
      p.residual = Math.hypot(x - p.local[0], y - p.local[1])
    }
    const worst = pairs.reduce((w, p) => (p.residual > w.residual ? p : w))
    if (worst.residual <= MAX_RESIDUAL_M || pairs.length <= 4) break
    console.log(`  ${site}: descarto ancla ${worst.id} (${worst.residual.toFixed(1)} m)`)
    pairs = pairs.filter((p) => p !== worst)
  }
  const groundZ = pairs.map((p) => p.local[2]).sort((a, b) => a - b)[Math.floor(pairs.length / 2)]

  // Geometría de los nodos del IFC: dónde va cada punto y en qué piso esperan los camiones.
  const objects = new Map(simplificada[site].objects.map((o) => [o.guid, o]))
  const floors = simplificada[site].objects.filter((o) => o.floor)
  const toLocal = (q) => applyAffine(M, [(q.xPercent / 100) * width, (q.yPercent / 100) * height])
  const ring = (o) => o.points.map(([x, y]) => [r2(x), r2(y)])

  const pointNodes = {}
  for (const p of layout.points ?? []) {
    const node = trafico.nodes.find((n) => n.plant === site && n.name === ANCHORS[site][p.id] && n.position)
    if (!node) continue
    const playa = (node.ifc_global_ids ?? []).map((g) => objects.get(g)).filter((o) => o?.floor && polyArea(o.points) >= PLAYA_MIN_M2)
      .sort((a, b) => polyArea(b.points) - polyArea(a.points))[0]
    // En una playa el punto es su acceso: va al borde del piso más cercano a la cámara (posición de la foto),
    // no al centro del nodo, que puede quedar debajo de un galpón.
    const at = playa ? [...accessOnEdge(playa.points, toLocal(p)), playa.z] : node.position
    pointNodes[p.id] = { node: node.name, at: at.map(r2), ...(playa ? { area: ring(playa), areaZ: r2(playa.z) } : {}) }
  }

  // Cada playa del mapa toma el piso del IFC que tiene debajo (el más grande que contiene su centro).
  const zoneFloors = {}
  for (const z of layout.zones) {
    if ((z.polygonPercent?.length ?? 0) < 3) continue
    const local = z.polygonPercent.map(toLocal)
    const center = [local.reduce((s, q) => s + q[0], 0) / local.length, local.reduce((s, q) => s + q[1], 0) / local.length]
    const floor = floors.filter((o) => pointInPoly(o.points, center)).sort((a, b) => polyArea(b.points) - polyArea(a.points))[0]
    if (floor) zoneFloors[z.zoneId] = { guid: floor.guid, polygon: ring(floor), z: r2(floor.z) }
    console.log(`  ${site} ${z.zoneId} ${z.label}: ${floor ? `piso ${floor.guid} (${Math.round(polyArea(floor.points))} m²)` : 'sin piso en el IFC, queda el polígono de la foto'}`)
  }

  // Ejes con trazado sin repetidos: el mismo eje figura una vez por circuito que lo recorre.
  const byShape = new Map()
  const canonical = new Map()
  for (const e of trafico.edges) {
    if (e.plant !== site || !(e.points?.length >= 2)) continue
    const points = e.points.map((q) => q.map(r2))
    const key = [JSON.stringify(points), JSON.stringify([...points].reverse())].sort()[0]
    if (!byShape.has(key)) byShape.set(key, { id: e.id, from: e.from, to: e.to, lengthM: e.length_m, points })
    canonical.set(e.id, byShape.get(key).id)
  }
  const edges = [...byShape.values()]
  const tramos = tramosFromEdges(site).map((t) => ({ ...t, edges: t.edges.map((id) => canonical.get(id) ?? id) }))
  console.log(`  ${site} tramos sobre ejes del IFC: ${tramos.map((t) => `${t.id} (${Math.round(t.lengthM)} m, ${t.edges.length} ejes)`).join(' · ')}`)

  const meshes = modelos[site]
    .filter((o) => o.t !== 'IfcOpeningElement')
    .map((o) => ({ t: o.t, n: o.name.split(':')[0].trim(), v: o.v.flat().map(r2), f: o.f.flat() }))

  const out = {
    site,
    source: 'data/nva-ifc (paquete NVA_IFC_y_visor_frontend_CORREGIDO)',
    units: 'm',
    camera: cameraFromImages(site),
    groundZ: r2(groundZ),
    /** Pixel del plano cenital (basePlan) → coordenadas locales del modelo. */
    cenitalToLocal: { width, height, affine: M.map((row) => row.map((v) => +v.toFixed(6))) },
    anchors: pairs.map((p) => ({ id: p.id, residualM: r2(p.residual) })),
    /** Franjas de circuito digitalizadas de cada imagen (coordenadas locales, regla evenodd por imagen). */
    bands: trazados.filter((t) => t.plant === site).map((t) => t.mask_polygons.map((poly) => poly.flat().map(r2))),
    /** Punto del layout → posición de su nodo en el IFC (y piso, si el nodo es una playa). */
    pointNodes,
    /** Zona de espera del layout → piso del IFC donde se dibujan sus camiones. */
    zoneFloors,
    /** Pisos del IFC (vista simplificada): las playas que el editor de plano puede asignar a cada zona. */
    floors: floors.map((o) => ({ guid: o.guid, polygon: ring(o), z: r2(o.z) })),
    /** Ejes viales con trazado de la planta, sin repetidos (un eje por circuito que lo usa): el editor de plano arma tramos con ellos. */
    edges,
    /** Caminos entre puntos del layout sobre los ejes viales del IFC (coordenadas locales, de `fromPointId` a `toPointId`). */
    tramos,
    meshes,
  }
  const file = path.join(ROOT, 'public/plant', site, 'modelo-3d.json')
  fs.writeFileSync(file, JSON.stringify(out))
  console.log(`${site}: ${meshes.length} mallas · cámara de ${out.camera.sourceImage} (elev ${out.camera.elevationDeg}°) · anclas ${pairs.map((p) => `${p.id}=${p.residual.toFixed(1)}m`).join(' ')} · ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`)
}
