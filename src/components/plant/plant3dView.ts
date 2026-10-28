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
  zoneFloors?: Record<string, { guid: string; polygon: [number, number][]; z: number }>
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

export async function renderPlant3d(model: Plant3dModel): Promise<{ image: string; width: number; height: number; project: (x: number, y: number, z?: number) => Pct }> {
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
  return { image: URL.createObjectURL(blob), width, height, project }
}

/**
 * Pasa el layout del plano cenital (porcentajes de la foto) a la vista fija del modelo:
 * foto → coordenadas locales del IFC (ajuste afín del exportador) → proyección de la cámara.
 */
export function projectLayout(layout: PlantLayout, model: Plant3dModel, view: Awaited<ReturnType<typeof renderPlant3d>>): PlantLayout {
  const { width: cw, height: ch, affine: [[a, b, c], [d, e, f]] } = model.cenitalToLocal
  const move = <T extends Pct>(q: T): T => {
    const x = (q.xPercent / 100) * cw, y = (q.yPercent / 100) * ch
    return { ...q, ...view.project(a * x + b * y + c, d * x + e * y + f) }
  }
  // Puntos y playas salen del IFC cuando el modelo los tiene; lo demás (tramos, zonas sin piso) se pasa desde la foto.
  const atNode = (p: NonNullable<PlantLayout['points']>[number]) => {
    const node = model.pointNodes?.[p.id]
    if (!node) return move(p)
    return {
      ...p,
      ...view.project(...node.at),
      ...(node.area ? { areaPercent: node.area.map(([x, y]) => view.project(x, y, node.areaZ)) } : {}),
    }
  }
  const zonePolygon = (z: PlantLayout['zones'][number]) => {
    const floor = model.zoneFloors?.[z.zoneId]
    if (floor) return floor.polygon.map(([x, y]) => view.project(x, y, floor.z))
    return z.polygonPercent?.map(move)
  }
  return {
    ...layout,
    basePlan: { image: view.image, width: view.width, height: view.height, note: 'Modelo IFC en vista fija (proyección de las imágenes de circuitos).', projection: 'iso' },
    points: layout.points?.map(atNode),
    zones: layout.zones.map((z) => (z.polygonPercent ? { ...z, polygonPercent: zonePolygon(z) } : z)),
    tramos: layout.tramos?.map((t) => ({ ...t, viaPercent: t.viaPercent.map(move) })),
  }
}

const cache = new Map<string, Promise<PlantLayout>>()

/** Layout de En vivo sobre el modelo IFC del sitio. Se dibuja una sola vez por sitio y sesión. */
export function loadPlant3dLayout(site: string, layout: PlantLayout): Promise<PlantLayout> {
  const key = `${site}:${layout.rev}`
  if (!cache.has(key)) {
    cache.set(key, fetch(`/plant/${site}/modelo-3d.json`)
      .then((res) => { if (!res.ok) throw new Error(`modelo-3d.json ${res.status}`); return res.json() as Promise<Plant3dModel> })
      .then(async (model) => projectLayout(layout, model, await renderPlant3d(model)))
      .catch((err) => { cache.delete(key); throw err }))
  }
  return cache.get(key)!
}
