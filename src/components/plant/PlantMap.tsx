import { useMemo, useState } from 'react'
import type {
  PlantCameraGroup,
  PlantLayout,
  PlantPoint,
  PlantPointTone,
  PlantPointType,
} from '../../data/plantZones.types'
import { getRicardoneCircuitRoutes, type PlantCircuitRoute } from '../../data/plantCircuitRoutes'
import { tramoPath } from '../../data/plantRouteGeometry'
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
}): JSX.Element {
  const { layout, site = 'ricardone', compact = false, showCircuitControls = true, align = 'center', flowPulse = { ingress: 0, egress: 0 }, zones, onOpenCameras, onSelectSector, onSelectZone, selectedSector } = props
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
        style={compact
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
          {showSectors ? layout.zones.map((zone) => {
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
