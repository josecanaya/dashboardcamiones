import { useMemo, useState } from 'react'
import type {
  PlantCameraGroup,
  PlantLayout,
  PlantPoint,
  PlantPointTone,
  PlantPointType,
} from '../../data/plantZones.types'
import { getRicardoneCircuitRoutes, type PlantCircuitRoute } from '../../data/plantCircuitRoutes'
import { pointAlongPath, tramoPath } from '../../data/plantRouteGeometry'
import type { SectorStatus, ZoneState } from '../../services/live/plantStateApi'

/**
 * Plano operativo sobre la vista cenital real de la planta.
 *
 * Cinco capas, separadas a propósito:
 *   1. Fondo físico — la imagen, fija y tenue. No se redibuja ni se recorta.
 *   2. Recorridos   — la secuencia del circuito elegido, una por vez.
 *   3. Puntos       — marcadores en porcentaje del ancho y alto de la imagen.
 *   4. Cámaras      — cada punto abre su propio grupo en el monitor en vivo.
 *   5. Indicadores  — cola y estado, en chapitas chicas que no tapan el plano.
 *
 * Los nombres no se imprimen sobre el plano: aparecen al pasar el cursor.
 */

/** Color de identidad del punto: dice qué es, no cómo está. */
const TONE: Record<PlantPointTone, { color: string; label: string }> = {
  acceso: { color: '#38BDF8', label: 'Ingreso y preingreso' },
  calada: { color: '#22C55E', label: 'Caladas' },
  balanza: { color: '#F97316', label: 'Balanzas' },
  celda16: { color: '#EAB308', label: 'Celda 16' },
  volcable: { color: '#2563EB', label: 'Volcables 1 y 2' },
  playa3: { color: '#1E3A8A', label: 'Acceso a Playa 3' },
  silos: { color: '#7C3AED', label: 'Carga y descarga de silos' },
}

/** Estado operativo: se muestra en el aro del marcador, nunca pintando el plano. */
const STATUS: Record<SectorStatus, { ring: string; label: string }> = {
  normal: { ring: '#16A34A', label: 'Normal' },
  attention: { ring: '#D97706', label: 'Atención' },
  critical: { ring: '#DC2626', label: 'Alerta' },
  no_data: { ring: '#94A3B8', label: 'Sin datos' },
}

const TYPE_LABEL: Record<PlantPointType, string> = {
  camera: 'Punto de control con cámara',
  'camera-group': 'Frente con varias cámaras',
  'control-point': 'Punto de control',
  operation: 'Carga o descarga',
}

/**
 * Camión en el plano (capa de flujo del monitoreo): junto a su punto o, con `transit`, sobre la línea
 * que une su punto con el siguiente, a `fraction` del recorrido. `guessed` = destino estimado.
 */
export type MapTruck = {
  plate: string
  pointId: string
  status: 'normal' | 'attention' | 'critical'
  label?: string
  transit?: { toPointId: string; fraction: number; guessed: boolean } | null
  /** Playa donde espera: se dibuja en la grilla de su polígono, los que más esperan primero. */
  waitZoneId?: string | null
  /** Minutos esperando (ordena la grilla de la playa). */
  waitMin?: number | null
  /** Ubicación que supone una lectura de cámara que no llegó. */
  inferred?: boolean
}

/**
 * Lugares para camiones dentro de una playa: grilla recortada al polígono, de arriba a la izquierda
 * hacia abajo (como en el simulador). Se mide en píxeles de la imagen base para que sea pareja.
 */
function fillSlots(poly: { xPercent: number; yPercent: number }[], cap: number, width: number, height: number) {
  const px = poly.map((p) => [(p.xPercent / 100) * width, (p.yPercent / 100) * height] as const)
  const xs = px.map((p) => p[0])
  const ys = px.map((p) => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const inside = (x: number, y: number) => {
    let c = false
    for (let i = 0, j = px.length - 1; i < px.length; j = i++) {
      const [xi, yi] = px[i]
      const [xj, yj] = px[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  let sp = Math.max(6, Math.sqrt(((x1 - x0) * (y1 - y0)) / Math.max(1, cap)))
  let out: [number, number][] = []
  for (let k = 0; k < 12; k++) {
    out = []
    for (let y = y0 + sp / 2; y < y1; y += sp) for (let x = x0 + sp / 2; x < x1; x += sp) if (inside(x, y)) out.push([x, y])
    if (out.length >= cap) break
    sp *= 0.85
  }
  if (!out.length) out = [[(x0 + x1) / 2, (y0 + y1) / 2]]
  return out.map(([x, y]) => ({ xPercent: (x / width) * 100, yPercent: (y / height) * 100 }))
}
const TRUCK_COLOR: Record<MapTruck['status'], string> = { normal: '#16A34A', attention: '#F59E0B', critical: '#DC2626' }

/** Reparte los camiones de un mismo punto en anillos alrededor del marcador, para que no se tapen. */
function truckOffsets(count: number): { dx: number; dy: number }[] {
  const out: { dx: number; dy: number }[] = []
  let ring = 0
  while (out.length < count) {
    const capacity = 8 + ring * 6
    const radius = 26 + ring * 15
    const n = Math.min(capacity, count - out.length)
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / capacity) * Math.PI * 2
      out.push({ dx: Math.cos(a) * radius, dy: Math.sin(a) * radius })
    }
    ring++
  }
  return out
}

const STATUS_RANK: Record<SectorStatus, number> = { no_data: 0, normal: 1, attention: 2, critical: 3 }

type PointState = { queue: number | null; status: SectorStatus; zones: string[] }

/**
 * Reparte el backlog de cada zona al punto que la drena. Una zona se cuenta una
 * sola vez, en su primer punto de drenaje, así el mismo camión no aparece dos
 * veces cuando el sector tiene varias bocas (volcables, calada sólida y líquida).
 */
function statePerPoint(points: PlantPoint[], zones: ZoneState[]): Map<string, PointState> {
  const out = new Map<string, PointState>()
  for (const p of points) out.set(p.id, { queue: null, status: 'no_data', zones: [] })
  for (const zone of zones) {
    const sectorCode = zone.drainPoints?.[0]?.sectorCode
    if (!sectorCode) continue
    const target = points.find((p) => p.sectorCode === sectorCode)
    if (!target) continue
    const cur = out.get(target.id)!
    cur.queue = (cur.queue ?? 0) + zone.backlog
    cur.zones.push(zone.label)
    if (STATUS_RANK[zone.status] > STATUS_RANK[cur.status]) cur.status = zone.status
  }
  return out
}

export function PlantMap(props: {
  layout: PlantLayout
  site?: 'ricardone' | 'san_lorenzo'
  compact?: boolean
  showCircuitControls?: boolean
  align?: 'left' | 'center'
  flowPulse?: { ingress: number; egress: number }
  zones: ZoneState[]
  onOpenCameras: (group: PlantCameraGroup) => void
  onSelectSector?: (sectorCode: string) => void
  onSelectZone?: (zoneId: string) => void
  selectedSector?: string | null
  /** Ocupa todo el alto del contenedor (pantalla de monitoreo). */
  fill?: boolean
  /** Camiones en planta dibujados en su punto actual. */
  trucks?: MapTruck[]
  followedPlate?: string | null
  onSelectTruck?: (plate: string) => void
  /** Recorrido del camión seguido (ids de punto en orden) y su próximo punto esperado. */
  followPath?: string[]
  /** Puntos del recorrido que son pasos deducidos (sin lectura): se dibujan punteados. */
  followDeduced?: string[]
  followNext?: string | null
  /** Oculta los rótulos grandes de ocupación (el monitoreo los muestra en el panel). */
  quietZones?: boolean
  /** Dibuja la red de caminos (tramos) por donde circulan los camiones. */
  showRoads?: boolean
  /** Si está, el clic en un punto lo entrega entero (en vez de abrir directo sus cámaras). */
  onSelectPoint?: (point: PlantPoint) => void
}): JSX.Element {
  const { layout, site = 'ricardone', compact = false, showCircuitControls = true, align = 'center', flowPulse = { ingress: 0, egress: 0 }, zones, onOpenCameras, onSelectSector, onSelectZone, selectedSector, fill = false, trucks = [], followedPlate = null, onSelectTruck, followPath = [], followDeduced = [], followNext = null, quietZones = false, showRoads = false, onSelectPoint } = props
  const [hovered, setHovered] = useState<string | null>(null)
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [circuit, setCircuit] = useState<string | null>(null)
  const [legendOpen, setLegendOpen] = useState(false)
  const [showSectors, setShowSectors] = useState(true)
  const [showPoints, setShowPoints] = useState(true)

  const base = layout.basePlan
  const points = useMemo(() => layout.points ?? [], [layout.points])
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])
  const routes = useMemo(() => getRicardoneCircuitRoutes(points.map((p) => p.id)), [points])
  const active: PlantCircuitRoute | null = routes.find((r) => r.code === circuit) ?? null
  const activeComposition = layout.circuitCompositions?.find((item) => item.circuitCode === circuit)
  const activeSegments = useMemo(() => {
    if (activeComposition) return activeComposition.tramos.flatMap((ref, index) => {
      const tramo = (layout.tramos ?? []).find((item) => item.id === ref.tramoId)
      if (!tramo) return []
      return [{ key: `${ref.tramoId}-${index}`, from: ref.reverse ? tramo.toPointId : tramo.fromPointId, to: ref.reverse ? tramo.fromPointId : tramo.toPointId }]
    })
    return active ? active.steps.slice(0, -1).map((from, index) => ({ key: `${from}-${active.steps[index + 1]}-${index}`, from, to: active.steps[index + 1]! })) : []
  }, [active, activeComposition, layout.tramos])
  const inCircuit = useMemo(() => new Set(activeSegments.flatMap((segment) => [segment.from, segment.to])), [activeSegments])
  const pointState = useMemo(() => statePerPoint(points, zones), [points, zones])
  const liveZoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones])
  const zoneShape = useMemo(() => new Map(layout.zones.filter((z) => (z.polygonPercent?.length ?? 0) >= 3).map((z) => [z.zoneId, z.polygonPercent!])), [layout.zones])
  /** Camiones esperando en playas: cada uno en un lugar de la grilla, los que más esperan arriba a la izquierda. */
  const zoneTrucks = useMemo(() => {
    if (!base) return []
    const groups = new Map<string, MapTruck[]>()
    for (const t of trucks) if (t.waitZoneId && zoneShape.has(t.waitZoneId)) groups.set(t.waitZoneId, [...(groups.get(t.waitZoneId) ?? []), t])
    return [...groups.entries()].flatMap(([zoneId, list]) => {
      const cap = Math.max(list.length, liveZoneById.get(zoneId)?.capacityOperational ?? 40)
      const slots = fillSlots(zoneShape.get(zoneId)!, cap, base.width, base.height)
      return [...list].sort((a, b) => (b.waitMin ?? 0) - (a.waitMin ?? 0)).map((truck, i) => ({ truck, at: slots[i % slots.length] }))
    })
  }, [trucks, zoneShape, base, liveZoneById])
  const trucksByPoint = useMemo(() => {
    const m = new Map<string, MapTruck[]>()
    for (const t of trucks) {
      if (!byId.has(t.pointId) || (t.transit && byId.has(t.transit.toPointId)) || (t.waitZoneId && zoneShape.has(t.waitZoneId))) continue
      m.set(t.pointId, [...(m.get(t.pointId) ?? []), t])
    }
    return m
  }, [trucks, byId])
  /**
   * Camiones en tránsito: posición sobre el tramo. Los que comparten tramo se encolan hacia atrás
   * sobre la línea (fila de camiones) en vez de taparse en el mismo punto.
   */
  const transitTrucks = useMemo(() => {
    if (!base) return []
    const groups = new Map<string, { truck: MapTruck; a: PlantPoint; b: PlantPoint }[]>()
    for (const t of trucks) {
      const a = byId.get(t.pointId)
      const b = t.transit ? byId.get(t.transit.toPointId) : undefined
      if (!t.transit || !a || !b) continue
      const key = `${a.id}>${b.id}`
      groups.set(key, [...(groups.get(key) ?? []), { truck: t, a, b }])
    }
    return [...groups.values()].flatMap((list) => {
      const path = tramoPath(list[0].a, list[0].b, layout.tramos ?? [])
      let prev = Infinity
      return [...list].sort((x, y) => y.truck.transit!.fraction - x.truck.transit!.fraction).map(({ truck }, i) => {
        const f = Math.max(0.02, Math.min(truck.transit!.fraction, prev - 0.045))
        prev = f
        return { truck, at: pointAlongPath(path, f, base.width, base.height), lane: f <= 0.02 && i ? (i % 2 ? -1 : 1) : 0 }
      })
    })
  }, [trucks, byId, layout.tramos, base])
  const followSegments = useMemo(() => {
    const steps = followPath.filter((id, i) => byId.has(id) && followPath[i - 1] !== id)
    return steps.slice(0, -1).map((from, i) => ({ key: `f-${from}-${steps[i + 1]}-${i}`, from, to: steps[i + 1]! }))
  }, [followPath, byId])
  const followKnown = followPath.filter((id) => byId.has(id))
  const deducedSet = useMemo(() => new Set(followDeduced), [followDeduced])
  const followLast = followKnown[followKnown.length - 1] ?? null

  if (!base) {
    return (
      <div className="flex h-full items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-sm text-slate-500">
        El plano de la planta no está configurado.
      </div>
    )
  }

  const polygonPoints = (vertices: NonNullable<PlantLayout['zones'][number]['polygonPercent']>) =>
    vertices.map((vertex) => `${(vertex.xPercent / 100) * base.width},${(vertex.yPercent / 100) * base.height}`).join(' ')
  const polygonCenter = (vertices: NonNullable<PlantLayout['zones'][number]['polygonPercent']>) => ({
    x: vertices.reduce((sum, vertex) => sum + vertex.xPercent, 0) / vertices.length,
    y: vertices.reduce((sum, vertex) => sum + vertex.yPercent, 0) / vertices.length,
  })

  return (
    <div className="space-y-2">
      {/* Selector de circuito: uno por vez, nunca todos juntos */}
      {showCircuitControls ? <div className="tf-map-toolbar flex items-center gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur-sm">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Circuito
        </span>
        <button
          type="button"
          onClick={() => setCircuit(null)}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
            circuit == null
              ? 'border-slate-800 bg-slate-800 text-white'
              : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400'
          }`}
        >
          Ninguno
        </button>
        {routes.map((r) => (
          <button
            key={r.code}
            type="button"
            onClick={() => setCircuit((c) => (c === r.code ? null : r.code))}
            title={`${r.label} · secuencia ${r.sequence.join(' → ')}`}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              circuit === r.code
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-sky-400 hover:text-sky-700'
            }`}
          >
            <span className="font-mono">{r.code}</span> <span className="opacity-80">{r.label}</span>
            {r.missingSteps.length > 0 ? <span className="ml-1 text-amber-500">·</span> : null}
          </button>
        ))}
        <span className="ml-auto mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Capas</span>
        <button type="button" onClick={() => setShowSectors((value) => !value)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${showSectors ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`} aria-pressed={showSectors}>Sectores</button>
        <button type="button" onClick={() => setShowPoints((value) => !value)} className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${showPoints ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`} aria-pressed={showPoints}>Cámaras</button>
      </div> : null}

      {!activeComposition && active?.missingSteps.length ? (
        <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          El recorrido se corta en {active.missingSteps.join(' y ')}: ese paso todavía no tiene
          posición confirmada en el plano, y no se dibuja una inventada.
        </p>
      ) : null}

      {/*
        Capa 1: el plano. Las demás capas van encima, en porcentajes de esta caja.
        El ancho se topea para que el plano no se coma la pantalla; la relación de
        aspecto manda el alto, así los puntos nunca se corren.
      */}
      <div
        className={`relative max-w-full overflow-hidden rounded-2xl bg-slate-900 shadow-[0_18px_45px_rgba(15,23,42,.18)] ${align === 'left' ? 'mr-auto' : 'mx-auto'}`}
        style={fill
          ? { aspectRatio: `${base.width} / ${base.height}`, height: '100%', width: 'auto', maxWidth: '100%', marginInline: 'auto' }
          : compact
          ? { aspectRatio: '16 / 10', width: '100%' }
          // Relación real de la imagen: si se deforma, los puntos y los polígonos
          // dejan de caer donde los puso el editor. El alto se topea contra la
          // ventana y el ancho lo deduce el navegador, nunca al revés.
          : { aspectRatio: `${base.width} / ${base.height}`, height: 'min(62vh, 620px)', width: 'auto', maxWidth: '100%' }}
      >
        <div
          className="absolute"
          style={compact
            ? base.width / base.height > 1.6
              ? { height: '100%', width: `${(base.width / base.height) / 1.6 * 100}%`, left: `${(1 - (base.width / base.height) / 1.6) * 50}%`, top: 0 }
              : { width: '100%', height: `${1.6 / (base.width / base.height) * 100}%`, top: `${(1 - 1.6 / (base.width / base.height)) * 50}%`, left: 0 }
            : { inset: 0 }}
        >
        <img
          src={`/plant/${site}/${base.image}`}
          alt={`Vista cenital de la planta de ${site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'}`}
          draggable={false}
          className="absolute inset-0 h-full w-full select-none"
        />

        {flowPulse.ingress > 0 ? points.filter(point => point.id === 'S0').map(point => (
          <div key={`ingress-${flowPulse.ingress}-${point.id}`} className="tf-flow-pulse tf-flow-pulse--in" style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}><b>↓</b><span>Ingreso</span></div>
        )) : null}
        {flowPulse.egress > 0 ? points.filter(point => point.id === 'S3' || point.id === 'S10').map(point => (
          <div key={`egress-${flowPulse.egress}-${point.id}`} className="tf-flow-pulse tf-flow-pulse--out" style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}><b>↑</b><span>Egreso</span></div>
        )) : null}

        {/* Capa 2: el recorrido del circuito elegido */}
        <svg
          viewBox={`0 0 ${base.width} ${base.height}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-label="Sectores operativos y recorridos sobre el plano"
        >
          <defs>
            <marker
              id="circuitArrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L9,5 L0,9 z" fill="#0EA5E9" />
            </marker>
          </defs>
          {/* Red de caminos: los tramos por donde circulan los camiones entre puntos. */}
          {showRoads ? (layout.tramos ?? []).map((tramo) => {
            const a = byId.get(tramo.fromPointId)
            const b = byId.get(tramo.toPointId)
            if (!a || !b) return null
            const pts = tramoPath(a, b, layout.tramos ?? []).map((pt) => `${(pt.xPercent / 100) * base.width},${(pt.yPercent / 100) * base.height}`).join(' ')
            return <g key={`road-${tramo.id}`}>
              <polyline points={pts} fill="none" stroke="rgba(15,23,42,.55)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts} fill="none" stroke="#E2E8F0" strokeOpacity={0.85} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          }) : null}
          {/* Capa de sectores: límites configurados por el editor del plano. */}
          {showSectors ? layout.zones.map((zone) => {
            const vertices = zone.polygonPercent ?? []
            if (vertices.length < 3) return null
            const live = liveZoneById.get(zone.zoneId)
            const status = STATUS[live?.status ?? 'no_data']
            const sectorCode = zone.sectorCode || live?.drainPoints?.[0]?.sectorCode || ''
            const selected = Boolean(sectorCode && selectedSector === sectorCode)
            const hoveredNow = hoveredZone === zone.zoneId
            return (
              <polygon
                key={zone.zoneId}
                points={polygonPoints(vertices)}
                fill={zone.color ?? '#2563EB'}
                fillOpacity={hoveredNow || selected ? 0.24 : 0.1}
                stroke={selected || hoveredNow ? status.ring : (zone.color ?? '#2563EB')}
                strokeWidth={selected || hoveredNow ? 2.5 : 1.25}
                strokeOpacity={selected || hoveredNow ? 0.95 : 0.72}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className={sectorCode ? 'pointer-events-auto cursor-pointer' : 'pointer-events-auto'}
                tabIndex={sectorCode ? 0 : undefined}
                role={sectorCode ? 'button' : undefined}
                aria-label={`${zone.label}. Estado ${status.label}${live ? `, ${live.backlog} esperando` : ''}`}
                onMouseEnter={() => setHoveredZone(zone.zoneId)}
                onMouseLeave={() => setHoveredZone((current) => current === zone.zoneId ? null : current)}
                onFocus={() => setHoveredZone(zone.zoneId)}
                onBlur={() => setHoveredZone((current) => current === zone.zoneId ? null : current)}
                onClick={() => { onSelectZone?.(zone.zoneId); if (sectorCode) onSelectSector?.(sectorCode) }}
                onKeyDown={(event) => {
                  if (sectorCode && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault()
                    onSelectZone?.(zone.zoneId)
                    onSelectSector?.(sectorCode)
                  }
                }}
              />
            )
          }) : null}
          {showSectors && !quietZones ? layout.zones.map((zone) => {
            const vertices = zone.polygonPercent ?? []
            const live = liveZoneById.get(zone.zoneId)
            if (vertices.length < 3 || !live) return null
            const center = polygonCenter(vertices)
            return <g key={`capacity-${zone.zoneId}`} transform={`translate(${center.x / 100 * base.width} ${center.y / 100 * base.height})`} className="pointer-events-none">
              <text textAnchor="middle" y="-8" fontSize="18" fontWeight="800" fill="#fff" stroke="rgba(15,23,42,.9)" strokeWidth="5" paintOrder="stroke">OCUPACIÓN</text>
              {/* Zona ciega: sin lecturas en la entrada, "0" mentiría diciendo que está vacía. */}
              {live.entryBlind ? (
                <text textAnchor="middle" y="30" fontSize="30" fontWeight="900" fill="#fff" stroke="rgba(15,23,42,.92)" strokeWidth="7" paintOrder="stroke">SIN DATO</text>
              ) : (
                <>
                  <text textAnchor="middle" y="35" fontSize="44" fontWeight="900" fill="#fff" stroke="rgba(15,23,42,.92)" strokeWidth="8" paintOrder="stroke">{live.backlogInferred ? '≈' : ''}{live.backlog}{live.capacityOperational != null ? `/${live.capacityOperational}` : ''}</text>
                  {/* El simbolo solo no alcanza: hay que decir por que es estimado. */}
                  {live.backlogInferred ? (
                    <text textAnchor="middle" y="58" fontSize="15" fontWeight="800" fill="#FCD34D" stroke="rgba(15,23,42,.92)" strokeWidth="4" paintOrder="stroke">ESTIMADO · CÁMARA DE INGRESO CAÍDA</text>
                  ) : null}
                </>
              )}
            </g>
          }) : null}
          {/* Recorrido del camión seguido: lo hecho en sólido, lo próximo punteado. */}
          {followSegments.map(({ key, from, to }) => {
            const a = byId.get(from)
            const b = byId.get(to)
            if (!a || !b) return null
            const pts = tramoPath(a, b, layout.tramos ?? []).map((pt) => `${(pt.xPercent / 100) * base.width},${(pt.yPercent / 100) * base.height}`).join(' ')
            // Tramo hacia o desde un paso deducido: punteado (no hubo lectura en ese punto).
            const deduced = deducedSet.has(from) || deducedSet.has(to)
            return <g key={key}>
              <polyline points={pts} fill="none" stroke="#FFFFFF" strokeWidth={10} strokeOpacity={0.85} strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts} fill="none" stroke="#7C3AED" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={deduced ? '2 10' : undefined} />
            </g>
          })}
          {followLast && followNext && byId.get(followNext) ? (() => {
            const a = byId.get(followLast)!
            const b = byId.get(followNext)!
            const pts = tramoPath(a, b, layout.tramos ?? []).map((pt) => `${(pt.xPercent / 100) * base.width},${(pt.yPercent / 100) * base.height}`).join(' ')
            // Próximo nodo: punteado verde claro y suave, distinto del recorrido ya hecho.
            return <polyline points={pts} fill="none" stroke="#86EFAC" strokeOpacity={0.9} strokeWidth={4} strokeDasharray="4 12" strokeLinecap="round">
              <animate attributeName="stroke-dashoffset" from="16" to="0" dur="1.2s" repeatCount="indefinite" />
            </polyline>
          })() : null}
          {active
            ? activeSegments.map(({ key, from, to }) => {
                const a = byId.get(from)
                const b = byId.get(to)
                if (!a || !b) return null
                const routePoints = tramoPath(a, b, layout.tramos ?? []).map((point) =>
                  `${(point.xPercent / 100) * base.width},${(point.yPercent / 100) * base.height}`).join(' ')
                return (
                  <g key={key}>
                    <polyline
                      points={routePoints}
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth={7}
                      strokeOpacity={0.75}
                      strokeLinecap="round"
                    />
                    <polyline
                      points={routePoints}
                      fill="none"
                      stroke="#0EA5E9"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeDasharray="10 8"
                      markerMid="url(#circuitArrow)"
                      markerEnd="url(#circuitArrow)"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="18"
                        to="0"
                        dur="1.1s"
                        repeatCount="indefinite"
                      />
                    </polyline>
                  </g>
                )
              })
            : null}
        </svg>

        {showSectors ? layout.zones.map((zone) => {
          const vertices = zone.polygonPercent ?? []
          if (vertices.length < 3) return null
          const center = polygonCenter(vertices)
          const live = liveZoneById.get(zone.zoneId)
          const status = STATUS[live?.status ?? 'no_data']
          const sectorCode = zone.sectorCode || live?.drainPoints?.[0]?.sectorCode || ''
          const visible = hoveredZone === zone.zoneId || Boolean(sectorCode && selectedSector === sectorCode)
          if (!visible) return null
          return (
            <div key={`zone-label-${zone.zoneId}`} className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white/95 px-2 py-1 shadow-md" style={{ left: `${center.x}%`, top: `${center.y}%` }}>
              <div className="whitespace-nowrap text-[11px] font-bold text-slate-800">{zone.label}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[9.5px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full" style={{ background: status.ring }} />{status.label}{live ? (live.entryBlind ? ' · sin lectura en la entrada' : live.backlogInferred ? ` · ~${live.backlog} esperando (estimado)` : ` · ${live.backlog} esperando`) : ''}</div>
            </div>
          )
        }) : null}

        {/* Capas 3 a 5: puntos, cámaras e indicadores */}
        {showPoints ? points.map((p) => {
          const tone = TONE[p.tone]
          const state = pointState.get(p.id) ?? { queue: null, status: 'no_data' as SectorStatus, zones: [] }
          const status = STATUS[state.status]
          const dimmed = active != null && !inCircuit.has(p.id)
          const isHovered = hovered === p.id
          const isSelected = selectedSector === p.sectorCode
          const orderedPoints = activeSegments.flatMap((segment, index) => index === 0 ? [segment.from, segment.to] : [segment.to])
          const order = active ? orderedPoints.indexOf(p.id) : -1
          return (
            <div
              key={p.id}
              className="absolute"
              style={{
                left: `${p.xPercent}%`,
                top: `${p.yPercent}%`,
                transform: 'translate(-50%, -50%)',
                opacity: dimmed ? 0.25 : 1,
                transition: 'opacity .15s',
                zIndex: isHovered ? 30 : 10,
              }}
            >
              <button
                type="button"
                onMouseEnter={() => setHovered(p.id)}
                onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                onFocus={() => setHovered(p.id)}
                onBlur={() => setHovered((h) => (h === p.id ? null : h))}
                onClick={() => {
                  if (onSelectPoint) return onSelectPoint(p)
                  onSelectZone?.('')
                  onSelectSector?.(p.sectorCode)
                  onOpenCameras(p.cameraGroup)
                }}
                aria-label={`${p.id} ${p.label}. ${TYPE_LABEL[p.type]}. Estado ${status.label}. Abrir ${p.cameraGroup.devices.length} cámaras`}
                className="relative grid h-10 w-10 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-1"
              >
                {/* aro de estado */}
                <span
                  className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    border: `3px solid ${status.ring}`,
                    background: '#FFFFFF',
                    opacity: state.status === 'no_data' ? 0.7 : 0.98,
                    boxShadow: isHovered || isSelected ? `0 0 0 3px ${tone.color}33` : '0 1px 2px rgba(15,23,42,.25)',
                  }}
                />
                {state.status === 'critical' ? (
                  <span
                    className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full"
                    style={{ border: `2px solid ${STATUS.critical.ring}` }}
                  />
                ) : null}
                {/* identidad del punto */}
                <span
                  className="relative block rounded-full"
                  style={{ width: 14, height: 14, background: tone.color }}
                />
                {/* orden dentro del circuito activo */}
                {order >= 0 ? (
                  <span
                    className="absolute -left-1.5 -top-1.5 grid h-3 w-3 place-items-center rounded-full bg-sky-600 text-[7px] font-bold text-white"
                    aria-hidden
                  >
                    {order + 1}
                  </span>
                ) : null}
                {/* cola esperando */}
                {state.queue != null && state.queue > 0 ? (
                  <span
                    className="absolute -right-2 -top-1.5 rounded-full px-1 text-[8.5px] font-bold leading-[13px] tabular-nums text-white"
                    style={{ background: status.ring, minWidth: 13 }}
                    aria-hidden
                  >
                    {state.queue}
                  </span>
                ) : null}
              </button>

              {/* etiqueta flotante: solo al pasar el cursor */}
              {isHovered ? (
                <div
                  className="pointer-events-none absolute left-1/2 z-40 w-[190px] -translate-x-1/2 rounded-lg border border-slate-200 bg-white/97 p-2 shadow-lg"
                  style={p.yPercent < 22 ? { top: 18 } : { bottom: 18 }}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[10px] font-bold" style={{ color: tone.color }}>
                      {p.id}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-800">{p.label}</span>
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-slate-500">{TYPE_LABEL[p.type]}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: status.ring }}
                    />
                    <span className="text-[10.5px] text-slate-600">
                      {status.label}
                      {state.queue != null && state.queue > 0 ? ` · ${state.queue} esperando` : ''}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {p.cameraGroup.devices.length}{' '}
                    {p.cameraGroup.devices.length === 1 ? 'cámara' : 'cámaras'} · clic para abrir
                  </div>
                </div>
              ) : null}
            </div>
          )
        }) : null}

        {/* Puntos por los que pasó el camión seguido, numerados en orden; el próximo con aro verde. */}
        {followKnown.filter((id, i) => followKnown[i - 1] !== id).map((id, i) => {
          const p = byId.get(id)!
          return <span key={`fstep-${id}-${i}`} className={`tf-map-step${deducedSet.has(id) ? ' tf-map-step--deduced' : ''}`} title={deducedSet.has(id) ? 'Paso deducido: sin lectura de cámara' : undefined} style={{ left: `${p.xPercent}%`, top: `${p.yPercent}%` }} aria-hidden>{i + 1}</span>
        })}
        {followNext && byId.get(followNext) ? <span className="tf-map-step tf-map-step--next" style={{ left: `${byId.get(followNext)!.xPercent}%`, top: `${byId.get(followNext)!.yPercent}%` }} aria-hidden>→</span> : null}

        {/* Capa de flujo: cada camión en su punto actual. */}
        {[...trucksByPoint.entries()].map(([pointId, list]) => {
          const p = byId.get(pointId)!
          const offsets = truckOffsets(list.length)
          return list.map((t, i) => {
            const followed = t.plate === followedPlate
            return (
              <button
                key={`truck-${t.plate}`}
                type="button"
                className={`tf-map-truck${followed ? ' is-followed' : ''}${followedPlate && !followed ? ' is-dimmed' : ''}`}
                style={{ left: `calc(${p.xPercent}% + ${offsets[i].dx}px)`, top: `calc(${p.yPercent}% + ${offsets[i].dy}px)`, ['--truck' as string]: TRUCK_COLOR[t.status] }}
                onClick={() => onSelectTruck?.(t.plate)}
                aria-label={`Camión ${t.plate}${t.label ? `, ${t.label}` : ''}. Seguir`}
                aria-pressed={followed}
                title={`${t.plate}${t.label ? ` · ${t.label}` : ''}`}
              >
                {followed ? <span className="tf-map-truck__plate">{t.plate}</span> : null}
              </button>
            )
          })
        })}

        {/* Camiones esperando en playas, en su grilla. */}
        {zoneTrucks.map(({ truck: t, at }) => {
          const followed = t.plate === followedPlate
          return (
            <button
              key={`truck-${t.plate}`}
              type="button"
              className={`tf-map-truck is-waiting${t.inferred ? ' is-guessed' : ''}${followed ? ' is-followed' : ''}${followedPlate && !followed ? ' is-dimmed' : ''}`}
              style={{ left: `${at.xPercent}%`, top: `${at.yPercent}%`, ['--truck' as string]: TRUCK_COLOR[t.status] }}
              onClick={() => onSelectTruck?.(t.plate)}
              aria-label={`Camión ${t.plate} esperando en playa${t.label ? `, ${t.label}` : ''}. Seguir`}
              aria-pressed={followed}
              title={`${t.plate}${t.inferred ? ' · paso por Preingreso inferido' : ''}${t.label ? ` · ${t.label}` : ''}`}
            >
              {followed ? <span className="tf-map-truck__plate">{t.plate}</span> : null}
            </button>
          )
        })}

        {/* Camiones en tránsito: sobre la línea entre su último punto y el siguiente. */}
        {transitTrucks.map(({ truck: t, at, lane }) => {
          const followed = t.plate === followedPlate
          const dy = lane * 9
          return (
            <button
              key={`truck-${t.plate}`}
              type="button"
              className={`tf-map-truck is-transit${t.transit?.guessed ? ' is-guessed' : ''}${followed ? ' is-followed' : ''}${followedPlate && !followed ? ' is-dimmed' : ''}`}
              style={{ left: `${at.xPercent}%`, top: `calc(${at.yPercent}% + ${dy}px)`, ['--truck' as string]: TRUCK_COLOR[t.status] }}
              onClick={() => onSelectTruck?.(t.plate)}
              aria-label={`Camión ${t.plate} en tránsito hacia ${byId.get(t.transit!.toPointId)?.label ?? t.transit!.toPointId}${t.label ? `, ${t.label}` : ''}. Seguir`}
              aria-pressed={followed}
              title={`${t.plate} · hacia ${byId.get(t.transit!.toPointId)?.label ?? t.transit!.toPointId}${t.transit?.guessed ? ' (estimado)' : ''}${t.label ? ` · ${t.label}` : ''}`}
            >
              {followed ? <span className="tf-map-truck__plate">{t.plate}</span> : null}
            </button>
          )
        })}

        {/* Leyenda compacta y plegable */}
        <div className="absolute bottom-2 left-2 z-20 max-w-[230px] rounded-lg border border-slate-200 bg-white/94 text-[10.5px] shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setLegendOpen((o) => !o)}
            className="flex w-full items-center gap-1.5 px-2.5 py-1.5 font-semibold text-slate-600"
            aria-expanded={legendOpen}
          >
            <span className="text-slate-400">{legendOpen ? '▾' : '▸'}</span> Referencias
          </button>
          {legendOpen ? (
            <div className="space-y-1.5 border-t border-slate-100 px-2.5 py-2">
              {Object.entries(TONE).map(([key, t]) => (
                <div key={key} className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                  {t.label}
                </div>
              ))}
              <div className="border-t border-slate-100 pt-1.5 text-slate-500">
                El aro del punto es el estado: gris sin datos, verde normal, ámbar atención, rojo
                alerta. El número es la cola esperando.
              </div>
              {layout.unplacedCameras?.length ? (
                <div className="border-t border-slate-100 pt-1.5 text-amber-700">
                  Sin ubicar: {layout.unplacedCameras.map((c) => c.device).join(', ')}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  )
}
