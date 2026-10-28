import * as THREE from 'three'
import type { PlantLayout } from '../../data/plantZones.types'

/**
 * Vista fija del modelo IFC para En vivo: misma proyección ortogonal que las imágenes de
 * circuitos (scripts/planta-3d/exportar-modelo.mjs la saca de sus matrices). No hay controles:
 * la cámara no se mueve, así el modelo se dibuja una vez como imagen y todo lo interactivo
 * (puntos, playas, camiones) sigue siendo la capa en porcentajes de PlantMap, reproyectada.
 */
export type Plant3dModel = {
  site: string
  camera: { right: [number, number, number]; up: [number, number, number] }
  groundZ: number
  cenitalToLocal: { width: number; height: number; affine: [[number, number, number], [number, number, number]] }
  meshes: { t: string; n: string; v: number[]; f: number[] }[]
  /** Franjas de circuito de las imágenes de referencia: por imagen, contornos [x0,y0,x1,y1…]. */
  bands?: number[][][]
  /** Punto del layout → su nodo del IFC: posición y, si es una playa, su piso. */
  pointNodes?: Record<string, { node: string; at: [number, number, number]; area?: [number, number][]; areaZ?: number }>
  /** Zona de espera del layout → piso del IFC que tiene debajo. */
  zoneFloors?: Record<string, IfcFloor>
  /** Pisos del IFC: los que el editor de plano puede asignar a una zona. */
  floors?: IfcFloor[]
  /** Caminos entre puntos sobre los ejes viales del IFC, en coordenadas locales de `fromPointId` a `toPointId`. */
  tramos?: { id: string; fromPointId: string; toPointId: string; lengthM: number; edges: string[]; points: [number, number, number][] }[]
  /** Ejes viales con trazado (sin repetidos): con ellos el editor de plano arma tramos a mano. */
  edges?: IfcEdge[]
}

export type IfcEdge = { id: string; from: string; to: string; lengthM: number; points: [number, number, number][] }

export type IfcFloor = { guid: string; polygon: [number, number][]; z: number }

/**
 * Ajustes a mano del editor de plano (public/plant/<site>/ifc-overrides.json): ganan sobre lo que
 * deduce el exportador.
 *   - `points`: posición local del punto.
 *   - `zoneFloors`: piso o pisos del IFC que forman la playa de la zona.
 *   - `removedZones`: zonas que no se dibujan (sus camiones van al punto o a la línea).
 *   - `tramos`: piezas del IFC que forman el camino de un par de puntos (`A::B`): ejes viales (id de
 *     `edges`) y pisos (guid de `floors`, el camión los cruza a lo largo); vacío = línea recta.
 */
export type IfcOverrides = {
  points?: Record<string, [number, number, number]>
  zoneFloors?: Record<string, string | string[]>
  removedZones?: string[]
  tramos?: Record<string, string[]>
}

/** Pisos de la zona: los del editor si los eligió, si no el que dedujo el exportador. */
export function zoneFloorGuids(model: Plant3dModel, overrides: IfcOverrides, zoneId: string): string[] {
  const own = overrides.zoneFloors?.[zoneId]
  if (own != null) return Array.isArray(own) ? own : [own]
  const auto = model.zoneFloors?.[zoneId]
  return auto ? [auto.guid] : []
}

/** Piezas del tramo (ejes y pisos): las del editor si las eligió, si no los ejes del camino más corto del exportador. */
export function tramoPieceIds(model: Plant3dModel, overrides: IfcOverrides, tramoId: string): string[] {
  return overrides.tramos?.[tramoId] ?? model.tramos?.find((t) => t.id === tramoId)?.edges ?? []
}

/** Margen desde el borde del piso hasta donde empieza y termina su línea de paso, en metros. */
const FLOOR_AXIS_INSET_M = 5

/**
 * Línea de paso de un piso usado como tramo: su eje largo (dirección principal de los vértices)
 * por el centro, de punta a punta menos un margen.
 */
export function floorAxis(floor: IfcFloor): [number, number, number][] {
  const n = floor.polygon.length
  const cx = floor.polygon.reduce((s, q) => s + q[0], 0) / n, cy = floor.polygon.reduce((s, q) => s + q[1], 0) / n
  let sxx = 0, syy = 0, sxy = 0
  for (const [x, y] of floor.polygon) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy) }
  const angle = Math.atan2(2 * sxy, sxx - syy) / 2
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)]
  const ts = floor.polygon.map(([x, y]) => (x - cx) * dx + (y - cy) * dy)
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)]
  const inset = Math.min(FLOOR_AXIS_INSET_M, (t1 - t0) / 4)
  return [t0 + inset, t1 - inset].map((t) => [cx + t * dx, cy + t * dy, floor.z] as [number, number, number])
}

/**
 * Encadena las piezas elegidas en cualquier orden: arranca por el extremo más cercano a `start` y sigue
 * siempre por la pieza cuyo extremo queda más cerca del final del camino, dándola vuelta si hace falta.
 * Si el camino empieza o termina con un eje, su extremo es el nodo y se saca: el camión sale y llega
 * al marcador del punto. La línea de un piso se deja entera.
 */
type Piece = { points: [number, number, number][]; edge: boolean }
function chainPieces(pieces: Piece[], start: XY): [number, number, number][] {
  const left = [...pieces]
  const out: [number, number, number][] = []
  let cur = start
  let first: Piece | null = null, lastPiece: Piece | null = null
  while (left.length) {
    let best = 0, reverse = false, dist = Infinity
    left.forEach(({ points: pts }, i) => {
      const a = Math.hypot(pts[0][0] - cur[0], pts[0][1] - cur[1])
      const b = Math.hypot(pts[pts.length - 1][0] - cur[0], pts[pts.length - 1][1] - cur[1])
      if (a < dist) { dist = a; best = i; reverse = false }
      if (b < dist) { dist = b; best = i; reverse = true }
    })
    const piece = left.splice(best, 1)[0]
    first ??= piece
    lastPiece = piece
    const seq = reverse ? [...piece.points].reverse() : piece.points
    out.push(...seq)
    const last = seq[seq.length - 1]
    cur = [last[0], last[1]]
  }
  return out.slice(first?.edge ? 1 : 0, lastPiece?.edge ? -1 : undefined)
}

type Pct = { xPercent: number; yPercent: number }

/** Ancho lógico de la imagen: deja los marcadores de PlantMap del mismo tamaño que sobre la foto cenital. */
const LOGICAL_WIDTH = 1500
/** Resolución real del render respecto del ancho lógico (nitidez al ampliar). */
const SUPERSAMPLE = 2
const MARGIN = 0.03

const COLOR = {
  background: '#ffffff',
  terrain: '#e4f4e2',
  floor: '#f6f7f4',
  building: '#ffffff',
  edge: '#2f3437',
  band: '#f2c4cb',
}

/** Metros por píxel de la textura de franjas. */
const BAND_RES = 0.5

/**
 * Red de circuitos de las imágenes, pintada sobre el piso como en las vistas de referencia.
 * Cada imagen se rellena con evenodd (sus huecos rodean edificios); la unión de todas es la red.
 */
function bandsMesh(bands: number[][][], z: number): THREE.Mesh | null {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const img of bands) for (const poly of img) for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1])
  }
  if (!Number.isFinite(x0)) return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((x1 - x0) / BAND_RES)
  canvas.height = Math.ceil((y1 - y0) / BAND_RES)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = COLOR.band
  // Suaviza el escalonado de 2,5 m de la digitalización.
  ctx.filter = 'blur(1.5px)'
  for (const img of bands) {
    ctx.beginPath()
    for (const poly of img) {
      for (let i = 0; i < poly.length; i += 2) {
        const px = (poly[i] - x0) / BAND_RES, py = (y1 - poly[i + 1]) / BAND_RES
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py)
      }
      ctx.closePath()
    }
    ctx.fill('evenodd')
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0),
    // Opaco con recorte: se dibuja sobre el piso y debajo de los edificios (renderOrder), sin pasar al pase transparente.
    new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5, depthTest: false, depthWrite: false }),
  )
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, z)
  mesh.renderOrder = 2
  return mesh
}

function horizontalArea(v: number[]) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < v.length; i += 3) {
    x0 = Math.min(x0, v[i]); x1 = Math.max(x1, v[i])
    y0 = Math.min(y0, v[i + 1]); y1 = Math.max(y1, v[i + 1])
  }
  return (x1 - x0) * (y1 - y0)
}

function mergeGeometries(parts: THREE.BufferGeometry[]) {
  const total = parts.reduce((n, g) => n + g.getAttribute('position').count, 0)
  const pos = new Float32Array(total * 3)
  let o = 0
  for (const g of parts) {
    const a = g.getAttribute('position').array as Float32Array
    pos.set(a, o)
    o += a.length
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return out
}

export type Plant3dView = { image: string; width: number; height: number; project: (x: number, y: number, z?: number) => Pct; truckAxis: [number, number]; pxPerMeterAlongAxis: number }

export async function renderPlant3d(model: Plant3dModel): Promise<Plant3dView> {
  const r = new THREE.Vector3(...model.camera.right)
  const u = new THREE.Vector3(...model.camera.up)
  const back = new THREE.Vector3().crossVectors(r, u)

  // El terreno es la losa horizontal más grande: va en verde, como en las imágenes.
  const terrainIdx = model.meshes.reduce((best, m, i) => (m.t === 'IfcSlab' && horizontalArea(m.v) > (best < 0 ? 0 : horizontalArea(model.meshes[best].v)) ? i : best), -1)
  const groups: Record<'terrain' | 'floor' | 'building', THREE.BufferGeometry[]> = { terrain: [], floor: [], building: [] }
  const edges: THREE.BufferGeometry[] = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  const p = new THREE.Vector3()
  for (const [i, m] of model.meshes.entries()) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m.v), 3))
    g.setIndex(m.f)
    const flat = g.toNonIndexed()
    const kind = i === terrainIdx ? 'terrain' : m.n === 'Floors' ? 'floor' : 'building'
    groups[kind].push(flat)
    edges.push(new THREE.EdgesGeometry(g, 25))
    g.dispose()
    for (let k = 0; k < m.v.length; k += 3) {
      p.set(m.v[k], m.v[k + 1], m.v[k + 2])
      const X = p.dot(r), Y = p.dot(u)
      minX = Math.min(minX, X); maxX = Math.max(maxX, X); minY = Math.min(minY, Y); maxY = Math.max(maxY, Y)
    }
  }
  const padX = (maxX - minX) * MARGIN, padY = (maxY - minY) * MARGIN
  minX -= padX; maxX += padX; minY -= padY; maxY += padY

  const width = LOGICAL_WIDTH
  const height = Math.round(width * (maxY - minY) / (maxX - minX))

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLOR.background)
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9ccd0', 2.2))
  const sun = new THREE.DirectionalLight('#ffffff', 1.4)
  // Luz desde arriba y a la izquierda de la vista: techos claros, una cara lateral en gris.
  sun.position.copy(u.clone().multiplyScalar(0.6).add(r.clone().multiplyScalar(-0.5)).add(back.clone().multiplyScalar(0.6)).add(new THREE.Vector3(0, 0, 1)))
  scene.add(sun)
  const material = (color: string) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  // Orden de dibujo: piso → franjas → edificios, así las franjas tapan el piso y los edificios a las franjas.
  const ORDER = { terrain: 0, floor: 1, building: 3 }
  for (const kind of ['terrain', 'floor', 'building'] as const) {
    if (!groups[kind].length) continue
    const g = mergeGeometries(groups[kind])
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, material(COLOR[kind]))
    mesh.renderOrder = ORDER[kind]
    scene.add(mesh)
  }
  const bands = model.bands?.length ? bandsMesh(model.bands, model.groundZ) : null
  if (bands) scene.add(bands)
  const lines = new THREE.LineSegments(mergeGeometries(edges), new THREE.LineBasicMaterial({ color: COLOR.edge, transparent: true, opacity: 0.55 }))
  lines.renderOrder = 4
  scene.add(lines)

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const center = r.clone().multiplyScalar(cx).add(u.clone().multiplyScalar(cy))
  const halfW = (maxX - minX) / 2, halfH = (maxY - minY) / 2
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 1, 20000)
  camera.up.copy(u)
  camera.position.copy(center.clone().add(back.clone().multiplyScalar(5000)))
  camera.lookAt(center)

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width * SUPERSAMPLE, height * SUPERSAMPLE, false)
  renderer.render(scene, camera)
  const blob = await new Promise<Blob | null>((ok) => renderer.domElement.toBlob(ok, 'image/png'))
  renderer.dispose()
  renderer.forceContextLoss()
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return
    o.geometry.dispose()
    const mat = o.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.dispose()
  })
  if (!blob) throw new Error('No se pudo dibujar el modelo 3D')

  const project = (x: number, y: number, z = model.groundZ): Pct => {
    p.set(x, y, z)
    return { xPercent: ((p.dot(r) - minX) / (maxX - minX)) * 100, yPercent: ((maxY - p.dot(u)) / (maxY - minY)) * 100 }
  }
  // Eje del camión en el piso: la dirección local que en pantalla cae sobre el eje largo del glifo
  // isométrico (abajo a la derecha, 30°). Resuelve r·d = cos30, -u·d = sin30 con d horizontal.
  const det = r.x * -u.y - r.y * -u.x
  const axis = new THREE.Vector3((0.866 * -u.y - r.y * 0.5) / det, (r.x * 0.5 - 0.866 * -u.x) / det, 0).normalize()
  const pxPerMeterAlongAxis = Math.hypot(axis.dot(r), axis.dot(u)) * (width / (maxX - minX))
  return { image: URL.createObjectURL(blob), width, height, project, truckAxis: [axis.x, axis.y] as [number, number], pxPerMeterAlongAxis }
}

/**
 * Clic en la imagen → coordenadas locales sobre el plano z = `z`. `project` es afín en x e y a z fijo,
 * así que alcanza con invertir la matriz 2×2 que sale de proyectar el origen y los dos ejes.
 */
export function unprojectAt(view: Plant3dView, q: Pct, z: number): XY {
  const o = view.project(0, 0, z), ex = view.project(1, 0, z), ey = view.project(0, 1, z)
  const [a, c] = [ex.xPercent - o.xPercent, ey.xPercent - o.xPercent]
  const [b, d] = [ex.yPercent - o.yPercent, ey.yPercent - o.yPercent]
  const det = a * d - b * c
  const [u, v] = [q.xPercent - o.xPercent, q.yPercent - o.yPercent]
  return [(d * u - c * v) / det, (a * v - b * u) / det]
}

/** Chasis y acoplado: largo y paso entre filas (con pasillo), y separación lado a lado, en metros. */
const TRUCK_LENGTH_M = 20
const ROW_STEP_M = 24
const SIDE_STEP_M = 7
/** Unidades de largo del glifo IsoTruck de PlantMap (cabina + caja) y ancho de su viewBox. */
const GLYPH_LENGTH_UNITS = 19
const GLYPH_VIEWBOX_UNITS = 22
const MAX_SLOTS = 240
const ACCESS_CLEAR_M = 14

type XY = [number, number]
function insidePoly(poly: XY[], [x, y]: XY) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/**
 * Lugares de estacionamiento dentro de un piso, en metros del modelo: filas de camiones lado a lado,
 * todos alineados con el eje del glifo, y una fila detrás de otra. Se llena desde el acceso.
 */
function parkingSlots(poly: XY[], axis: XY, anchor: XY | null): XY[] {
  const [dx, dy] = axis
  const [px, py] = [-dy, dx]
  const S = (q: XY) => q[0] * dx + q[1] * dy
  const T = (q: XY) => q[0] * px + q[1] * py
  const ss = poly.map(S), ts = poly.map(T)
  const [s0, s1, t0, t1] = [Math.min(...ss), Math.max(...ss), Math.min(...ts), Math.max(...ts)]
  const at = (s: number, t: number): XY => [s * dx + t * px, s * dy + t * py]
  const fits = (s: number, t: number) => [-1, 1].every((k) => [-1, 1].every((m) => insidePoly(poly, at(s + (k * TRUCK_LENGTH_M) / 2, t + m * 1.3))))
  const cells: { s: number; t: number }[] = []
  for (let s = s0 + TRUCK_LENGTH_M / 2 + 1; s <= s1 - TRUCK_LENGTH_M / 2; s += ROW_STEP_M)
    for (let t = t0 + 2; t <= t1 - 2; t += SIDE_STEP_M) if (fits(s, t)) cells.push({ s, t })
  const aS = anchor ? S(anchor) : s0, aT = anchor ? T(anchor) : t0
  // El acceso queda libre (ahí va el marcador del punto).
  const free = cells.filter((cell) => Math.hypot(cell.s - aS, cell.t - aT) >= ACCESS_CLEAR_M)
  // Primero la fila más cercana al acceso; dentro de la fila, del lado del acceso hacia afuera.
  free.sort((a, b) => Math.abs(a.s - aS) - Math.abs(b.s - aS) || Math.abs(a.t - aT) - Math.abs(b.t - aT))
  return free.slice(0, MAX_SLOTS).map(({ s, t }) => at(s, t))
}

/** Camiones en un punto sin playa: de a cuatro lado a lado al costado del punto, las filas hacia atrás. */
function lineupSlots(at: XY, axis: XY): XY[] {
  const [dx, dy] = axis
  const [px, py] = [-dy, dx]
  return Array.from({ length: 24 }, (_, k) => {
    const side = 8 + (k % 4) * SIDE_STEP_M, back = -Math.floor(k / 4) * ROW_STEP_M
    return [at[0] + side * px + back * dx, at[1] + side * py + back * dy] as XY
  })
}

/**
 * Pasa el layout a la vista fija del modelo. Puntos, playas y tramos salen del IFC (nodos, pisos y ejes
 * viales); solo un punto o una zona sin equivalente en el IFC se pasa desde la foto cenital
 * (ajuste afín del exportador). Los tramos del plano cenital no se usan: un par sin eje va en línea recta.
 */
export function projectLayout(layout: PlantLayout, model: Plant3dModel, view: Plant3dView, overrides: IfcOverrides = {}): PlantLayout {
  const { width: cw, height: ch, affine: [[a, b, c], [d, e, f]] } = model.cenitalToLocal
  const move = <T extends Pct>(q: T): T => {
    const x = (q.xPercent / 100) * cw, y = (q.yPercent / 100) * ch
    return { ...q, ...view.project(a * x + b * y + c, d * x + e * y + f) }
  }
  const toLocal = (q: Pct): XY => {
    const x = (q.xPercent / 100) * cw, y = (q.yPercent / 100) * ch
    return [a * x + b * y + c, d * x + e * y + f]
  }
  const pct = (z: number) => (q: XY) => view.project(q[0], q[1], z)

  // Puntos y playas salen del IFC cuando el modelo los tiene; un punto o zona sin nodo ni piso se pasa desde la foto.
  const pointNodes = { ...model.pointNodes }
  for (const [id, at] of Object.entries(overrides.points ?? {})) pointNodes[id] = { ...(pointNodes[id] ?? { node: 'editor' }), at }
  const pointLocal = new Map((layout.points ?? []).map((p) => {
    const node = pointNodes[p.id]
    return [p.id, node ? { xy: [node.at[0], node.at[1]] as XY, z: node.at[2] } : { xy: toLocal(p), z: model.groundZ }]
  }))
  const atNode = (p: NonNullable<PlantLayout['points']>[number]) => {
    const node = pointNodes[p.id]
    const { xy, z } = pointLocal.get(p.id)!
    const areaZ = node?.areaZ ?? z
    return {
      ...p,
      ...(node ? view.project(...node.at) : move(p)),
      ...(node?.area ? { areaPercent: node.area.map(pct(areaZ)) } : {}),
      parkPercent: node?.area ? parkingSlots(node.area, view.truckAxis, xy).map(pct(areaZ)) : lineupSlots(xy, view.truckAxis).map(pct(z)),
    }
  }
  const floorById = new Map((model.floors ?? []).map((f) => [f.guid, f]))
  const centroid = (q: XY[]): XY => [q.reduce((s, v) => s + v[0], 0) / q.length, q.reduce((s, v) => s + v[1], 0) / q.length]
  const zoneShape = (zone: PlantLayout['zones'][number]) => {
    const floors = zoneFloorGuids(model, overrides, zone.zoneId).flatMap((g) => floorById.get(g) ?? [])
    if (!floors.length && !zone.polygonPercent) return zone
    const parts = floors.length ? floors.map((f) => ({ local: f.polygon, z: f.z })) : [{ local: zone.polygonPercent!.map(toLocal), z: model.groundZ }]
    // El acceso de la playa es el punto que la usa de espera; con varios pisos se llena primero el más cercano.
    const access = (layout.points ?? []).find((p) => p.waitZone === zone.zoneId)
    const anchor = access ? pointLocal.get(access.id)!.xy : null
    if (anchor) parts.sort((x, y) => {
      const [cx, cy] = centroid(x.local), [dx, dy] = centroid(y.local)
      return Math.hypot(cx - anchor[0], cy - anchor[1]) - Math.hypot(dx - anchor[0], dy - anchor[1])
    })
    const polygons = parts.map(({ local, z }) => local.map(pct(z)))
    return {
      ...zone,
      polygonPercent: polygons[0],
      polygonsPercent: polygons,
      parkPercent: parts.flatMap(({ local, z }) => parkingSlots(local, view.truckAxis, anchor).map(pct(z))),
    }
  }
  const removed = new Set(overrides.removedZones ?? [])
  const edgeById = new Map((model.edges ?? []).map((e) => [e.id, e]))
  const tramoIds = new Set([...(model.tramos ?? []).map((t) => t.id), ...Object.keys(overrides.tramos ?? {})])
  return {
    ...layout,
    basePlan: {
      image: view.image, width: view.width, height: view.height, projection: 'iso',
      note: 'Modelo IFC en vista fija (proyección de las imágenes de circuitos).',
      truckGlyphWidth: (GLYPH_VIEWBOX_UNITS * view.pxPerMeterAlongAxis * TRUCK_LENGTH_M) / GLYPH_LENGTH_UNITS,
    },
    points: layout.points?.map(atNode),
    zones: layout.zones.filter((z) => !removed.has(z.zoneId)).map(zoneShape),
    tramos: [...tramoIds].flatMap((id) => {
      const [fromPointId, toPointId] = id.split('::')
      const start = pointLocal.get(fromPointId)
      if (!start || !pointLocal.has(toPointId)) return []
      const pieces = tramoPieceIds(model, overrides, id).flatMap((p): Piece[] => {
        const edge = edgeById.get(p)
        if (edge) return [{ points: edge.points, edge: true }]
        const floor = floorById.get(p)
        return floor ? [{ points: floorAxis(floor), edge: false }] : []
      })
      // Sin piezas, el par va en línea recta (tramoPath sin vía).
      if (!pieces.length) return []
      return [{ id, fromPointId, toPointId, viaPercent: chainPieces(pieces, start.xy).map(([x, y, z]) => view.project(x, y, z)) }]
    }),
  }
}

const viewCache = new Map<string, Promise<{ model: Plant3dModel; view: Plant3dView }>>()

/** Modelo IFC del sitio y su imagen en la vista fija. Se dibuja una sola vez por sitio y sesión. */
export function loadPlant3dView(site: string): Promise<{ model: Plant3dModel; view: Plant3dView }> {
  if (!viewCache.has(site)) {
    viewCache.set(site, fetch(`/plant/${site}/modelo-3d.json`)
      .then((res) => { if (!res.ok) throw new Error(`modelo-3d.json ${res.status}`); return res.json() as Promise<Plant3dModel> })
      .then(async (model) => ({ model, view: await renderPlant3d(model) }))
      .catch((err) => { viewCache.delete(site); throw err }))
  }
  return viewCache.get(site)!
}

/** Ajustes del editor de plano; sin archivo (o el index.html del fallback de Vite) no hay ajustes. */
export function loadIfcOverrides(site: string): Promise<IfcOverrides> {
  return fetch(`/plant/${site}/ifc-overrides.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() as Promise<IfcOverrides> : {}))
    .catch(() => ({}))
}

/** Layout de En vivo sobre el modelo IFC del sitio, con los ajustes del editor de plano. */
export async function loadPlant3dLayout(site: string, layout: PlantLayout): Promise<PlantLayout> {
  const [{ model, view }, overrides] = await Promise.all([loadPlant3dView(site), loadIfcOverrides(site)])
  return projectLayout(layout, model, view, overrides)
}
