import { useMemo, useRef, useState } from 'react'
import type {
  PlantBasePlan,
  PlantCircuitComposition,
  PlantPoint,
  PlantPointTone,
  PlantPointType,
  PlantTramo,
  PlantZoneShape,
} from '../../data/plantZones.types'
import { getRicardoneCircuitRoutes } from '../../data/plantCircuitRoutes'
import { plantTramoId, tramoPath } from '../../data/plantRouteGeometry'
import { SAN_LORENZO_CAMERAS } from '../../data/sanLorenzoCameraCatalog'

type Tool = 'select' | 'sector' | 'point' | 'tramo'
type PercentPoint = { xPercent: number; yPercent: number }

const TONES: PlantPointTone[] = ['acceso', 'calada', 'balanza', 'celda16', 'volcable', 'playa3', 'silos']
const TONE_COLOR: Record<PlantPointTone, string> = {
  acceso: '#38BDF8', calada: '#22C55E', balanza: '#F97316', celda16: '#EAB308',
  volcable: '#2563EB', playa3: '#1E3A8A', silos: '#7C3AED',
}
const TYPES: PlantPointType[] = ['camera', 'camera-group', 'control-point', 'operation']
const TYPE_LABEL: Record<PlantPointType, string> = {
  camera: 'Cámara', 'camera-group': 'Frente con varias cámaras',
  'control-point': 'Punto de control', operation: 'Carga o descarga',
}
const ZONE_COLORS = ['#2563EB', '#16A34A', '#D97706', '#7C3AED', '#DB2777', '#0891B2', '#475569']

const SAN_LORENZO_POINT_LABELS: Record<string, string> = {
  S0: 'Ingreso',
  S1: 'Balanza ingreso',
  S2: 'Calada',
  S3: 'Enlace S1–S3',
  S4: 'Descarga / volcable',
  S5: 'Balanza salida',
  S6: 'Espera en Playa OSL',
  S7: 'Egreso',
  S10: 'Líquidos punto 1',
}

function sanLorenzoPointDefinition(code: string) {
  const cameras = SAN_LORENZO_CAMERAS.filter((camera) => camera.logicalSector === code)
  const preferred = cameras.find((camera) => camera.sectorCode.includes('VOLCABLE')) ?? cameras[0]
  return {
    label: SAN_LORENZO_POINT_LABELS[code] ?? code,
    sectorCode: preferred?.sectorCode ?? (code === 'S6' ? 'Playa_OSL' : ''),
    devices: cameras.map((camera) => camera.deviceCode),
  }
}

function emptyPoint(xPercent: number, yPercent: number, zoneId?: string): PlantPoint {
  return {
    id: '', label: '', sectorCode: '', zoneId, type: 'camera', tone: 'acceso',
    xPercent, yPercent, cameraGroup: { label: '', devices: [] },
  }
}

function emptyZone(index: number): PlantZoneShape {
  return {
    zoneId: `Z${index}`, label: `Sector ${index}`, sectorCode: '',
    color: ZONE_COLORS[index % ZONE_COLORS.length], polygonPercent: [], cameras: [],
  }
}

function polygonCenter(vertices: PercentPoint[]): PercentPoint {
  if (!vertices.length) return { xPercent: 50, yPercent: 50 }
  return {
    xPercent: vertices.reduce((sum, v) => sum + v.xPercent, 0) / vertices.length,
    yPercent: vertices.reduce((sum, v) => sum + v.yPercent, 0) / vertices.length,
  }
}

function pointInPolygon(point: PercentPoint, vertices: PercentPoint[]): boolean {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!
    const b = vertices[j]!
    const crosses = (a.yPercent > point.yPercent) !== (b.yPercent > point.yPercent)
      && point.xPercent < ((b.xPercent - a.xPercent) * (point.yPercent - a.yPercent)) /
        (b.yPercent - a.yPercent || Number.EPSILON) + a.xPercent
    if (crosses) inside = !inside
  }
  return inside
}

export function PlantLayoutEditor({ site, basePlan, initialPoints, initialZones, initialTramos, initialCircuitCompositions, initialUnplacedSteps, onSave }: {
  site: string
  basePlan: PlantBasePlan
  initialPoints: PlantPoint[]
  initialZones: PlantZoneShape[]
  initialTramos: PlantTramo[]
  initialCircuitCompositions: PlantCircuitComposition[]
  initialUnplacedSteps: { code: string; label: string }[]
  onSave: (points: PlantPoint[], zones: PlantZoneShape[], tramos: PlantTramo[], circuitCompositions: PlantCircuitComposition[]) => Promise<void>
}) {
  const [points, setPoints] = useState(initialPoints)
  const [zones, setZones] = useState(initialZones)
  const [tramos, setTramos] = useState(initialTramos)
  const [circuitCompositions, setCircuitCompositions] = useState(initialCircuitCompositions)
  const [newTramoFrom, setNewTramoFrom] = useState('')
  const [newTramoTo, setNewTramoTo] = useState('')
  const [tramoToAdd, setTramoToAdd] = useState('')
  const [pendingPointCode, setPendingPointCode] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialZones[0]?.zoneId ?? null)
  const [draftPoint, setDraftPoint] = useState<PlantPoint | null>(null)
  const [drawingOriginal, setDrawingOriginal] = useState<PercentPoint[] | null>(null)
  const [draggingVertex, setDraggingVertex] = useState<number | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [circuit, setCircuit] = useState<string>('')
  const [selectedTramoId, setSelectedTramoId] = useState<string | null>(null)
  const [selectedTramoEnds, setSelectedTramoEnds] = useState<{ from: string; to: string } | null>(null)
  const [drawingTramoOriginal, setDrawingTramoOriginal] = useState<PlantTramo | null | undefined>(undefined)
  const [draggingTramoVertex, setDraggingTramoVertex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedPoint = draftPoint ?? points.find((p) => p.id === selectedPointId) ?? null
  const selectedZone = zones.find((z) => z.zoneId === selectedZoneId) ?? null
  const routes = useMemo(() => getRicardoneCircuitRoutes(points.map((p) => p.id)), [points])
  const selectedCatalogRoute = routes.find((route) => route.code === circuit) ?? null
  const selectedTramo = tramos.find((tramo) => tramo.id === selectedTramoId) ?? null
  const activeComposition = circuitCompositions.find((item) => item.circuitCode === circuit)
  const compositionRefs = activeComposition?.tramos ?? (selectedCatalogRoute?.steps.slice(0, -1).flatMap((from, index) => {
    const id = plantTramoId(from, selectedCatalogRoute.steps[index + 1]!)
    const tramo = tramos.find((item) => item.id === id)
    return tramo ? [{ tramoId: id, reverse: tramo.fromPointId !== from }] : []
  }) ?? [])
  const isNewPoint = draftPoint != null
  const pointIdClash = Boolean(selectedPoint?.id.trim())
    && points.some((p) => p.id === selectedPoint!.id && (isNewPoint || p.id !== selectedPointId))
  const nextZoneIndex = useMemo(() => {
    const used = new Set(zones.map((z) => z.zoneId))
    let i = 0
    while (used.has(`Z${i}`)) i += 1
    return i
  }, [zones])
  const pendingSteps = initialUnplacedSteps.filter((step) => !points.some((point) => point.id === step.code))
  const pendingDefinition = (code: string) => site === 'san_lorenzo'
    ? sanLorenzoPointDefinition(code)
    : code === 'S3'
    ? { label: 'Egreso', sectorCode: 'RICARDONE_EGRESO_CAMIONES', devices: ['RicEgrCamFrente', 'RicEgrCamTraser'] }
    : code === 'S10'
      ? { label: 'Salida', sectorCode: 'RICARDONE_EGRESO_CAMIONES', devices: ['RicEgrCamFrente', 'RicEgrCamTraser'] }
      : { label: initialUnplacedSteps.find((step) => step.code === code)?.label ?? code, sectorCode: '', devices: [] }

  const markDirty = () => { setDirty(true); setSaveState('idle') }
  const eventPoint = (clientX: number, clientY: number): PercentPoint => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      xPercent: Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)) * 10) / 10,
      yPercent: Math.round(Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)) * 10) / 10,
    }
  }

  const updatePoint = (patch: Partial<PlantPoint>) => {
    if (draftPoint) setDraftPoint({ ...draftPoint, ...patch })
    else if (selectedPointId) {
      setPoints((current) => current.map((p) => p.id === selectedPointId ? { ...p, ...patch } : p))
      markDirty()
    }
  }
  const updateZone = (patch: Partial<PlantZoneShape>) => {
    if (!selectedZoneId) return
    setZones((current) => current.map((z) => z.zoneId === selectedZoneId ? { ...z, ...patch } : z))
    markDirty()
  }
  const selectZone = (zoneId: string) => {
    setSelectedZoneId(zoneId); setSelectedPointId(null); setDraftPoint(null)
    setTool('select'); setDrawingOriginal(null)
  }
  const startDrawing = (zoneId: string) => {
    const zone = zones.find((z) => z.zoneId === zoneId)
    setSelectedZoneId(zoneId); setSelectedPointId(null); setDraftPoint(null)
    setDrawingOriginal([...(zone?.polygonPercent ?? [])])
    setZones((current) => current.map((z) => z.zoneId === zoneId ? { ...z, polygonPercent: [] } : z))
    setTool('sector')
  }
  const finishDrawing = () => {
    if ((selectedZone?.polygonPercent?.length ?? 0) < 3) return
    setTool('select'); setDrawingOriginal(null); markDirty()
  }
  const cancelDrawing = () => {
    if (selectedZoneId && drawingOriginal) {
      setZones((current) => current.map((z) => z.zoneId === selectedZoneId ? { ...z, polygonPercent: drawingOriginal } : z))
    }
    setTool('select'); setDrawingOriginal(null)
  }
  const addZone = () => {
    const zone = emptyZone(nextZoneIndex)
    setZones((current) => [...current, zone]); setSelectedZoneId(zone.zoneId)
    setSelectedPointId(null); setDrawingOriginal([]); setTool('sector'); markDirty()
  }
  const deleteZone = () => {
    if (!selectedZoneId) return
    setZones((current) => current.filter((z) => z.zoneId !== selectedZoneId))
    setPoints((current) => current.map((p) => p.zoneId === selectedZoneId ? { ...p, zoneId: undefined } : p))
    setSelectedZoneId(null); setTool('select'); setDrawingOriginal(null); markDirty()
  }

  const selectTramo = (from: string, to: string) => {
    const id = plantTramoId(from, to)
    setSelectedTramoId(id); setSelectedTramoEnds({ from, to }); setSelectedPointId(null); setSelectedZoneId(null); setDraftPoint(null); setTool('tramo')
  }
  const startDrawingTramo = () => {
    if (!selectedTramoId || !selectedTramoEnds) return
    setDrawingTramoOriginal(tramos.find((item) => item.id === selectedTramoId) ?? null)
    const blank = { id: selectedTramoId, fromPointId: selectedTramoEnds.from, toPointId: selectedTramoEnds.to, viaPercent: [] }
    setTramos((current) => current.some((item) => item.id === selectedTramoId)
      ? current.map((item) => item.id === selectedTramoId ? blank : item) : [...current, blank])
    setTool('tramo')
  }
  const cancelDrawingTramo = () => {
    if (!selectedTramoId || drawingTramoOriginal === undefined) return
    setTramos((current) => drawingTramoOriginal
      ? current.map((item) => item.id === selectedTramoId ? drawingTramoOriginal : item)
      : current.filter((item) => item.id !== selectedTramoId))
    setDrawingTramoOriginal(undefined)
  }
  const finishDrawingTramo = () => {
    setDrawingTramoOriginal(undefined); markDirty()
  }
  const createTramo = () => {
    if (!newTramoFrom || !newTramoTo || newTramoFrom === newTramoTo) return
    const id = plantTramoId(newTramoFrom, newTramoTo)
    if (!tramos.some((item) => item.id === id)) setTramos((current) => [...current, { id, fromPointId: newTramoFrom, toPointId: newTramoTo, viaPercent: [] }])
    selectTramo(newTramoFrom, newTramoTo); setNewTramoFrom(''); setNewTramoTo(''); markDirty()
  }
  const updateComposition = (next: PlantCircuitComposition['tramos']) => {
    if (!circuit) return
    setCircuitCompositions((current) => current.some((item) => item.circuitCode === circuit)
      ? current.map((item) => item.circuitCode === circuit ? { ...item, tramos: next } : item)
      : [...current, { circuitCode: circuit, tramos: next }])
    markDirty()
  }

  const onCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('[data-map-control]')) return
    const position = eventPoint(event.clientX, event.clientY)
    if (tool === 'sector' && selectedZoneId) {
      setZones((current) => current.map((z) => z.zoneId === selectedZoneId
        ? { ...z, polygonPercent: [...(z.polygonPercent ?? []), position] } : z))
      return
    }
    if (tool === 'point') {
      const containing = zones.find((z) => (z.polygonPercent?.length ?? 0) >= 3 && pointInPolygon(position, z.polygonPercent!))
      const base = emptyPoint(position.xPercent, position.yPercent, containing?.zoneId)
      if (pendingPointCode) {
        const definition = pendingDefinition(pendingPointCode)
        setDraftPoint({ ...base, id: pendingPointCode, label: definition.label, sectorCode: definition.sectorCode, cameraGroup: { label: definition.label, devices: definition.devices } })
      } else setDraftPoint(base)
      setSelectedPointId(null); setSelectedZoneId(containing?.zoneId ?? null)
    }
    if (tool === 'tramo' && selectedTramo && drawingTramoOriginal !== undefined) {
      setTramos((current) => current.map((item) => item.id === selectedTramo.id
        ? { ...item, viaPercent: [...item.viaPercent, position] } : item))
    }
  }
  const commitPoint = () => {
    if (!draftPoint || !draftPoint.id.trim() || !draftPoint.label.trim() || pointIdClash) return
    setPoints((current) => [...current, draftPoint]); setSelectedPointId(draftPoint.id)
    setDraftPoint(null); setPendingPointCode(null); setTool('select'); markDirty()
  }
  const save = async () => {
    setSaveState('busy')
    try { await onSave(points, zones, tramos, circuitCompositions); setSaveState('done'); setDirty(false) }
    catch (error) { setSaveState('error'); setSaveError(error instanceof Error ? error.message : String(error)) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Herramientas del plano">
            <button type="button" onClick={() => setTool('select')} className={`ui-button ${tool === 'select' ? 'ui-button--primary' : ''}`}>Seleccionar</button>
            <button type="button" onClick={addZone} className="ui-button">Dibujar sector</button>
            <button type="button" onClick={() => { setTool('point'); setDraftPoint(null); setPendingPointCode(null) }} className={`ui-button ${tool === 'point' ? 'ui-button--primary' : ''}`}>Agregar cámara</button>
            <button type="button" onClick={() => setTool('tramo')} className={`ui-button ${tool === 'tramo' ? 'ui-button--primary' : ''}`}>Editar tramos</button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Zoom</label>
            <input type="range" min="1" max="2.5" step="0.25" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={save} disabled={!dirty || saveState === 'busy'} className="ui-button ui-button--primary">
              {saveState === 'busy' ? 'Guardando…' : saveState === 'done' ? '✓ Guardado' : `Guardar${dirty ? ' *' : ''}`}
            </button>
          </div>
        </div>

        {tool === 'sector' ? (
          <div className="ui-message ui-message--warning flex flex-wrap items-center justify-between gap-2">
            <span>Clic para agregar vértices. Cerrá el polígono cuando tenga al menos tres.</span>
            <span className="flex gap-2">
              <button type="button" className="ui-button" onClick={() => setZones((current) => current.map((z) => z.zoneId === selectedZoneId ? { ...z, polygonPercent: z.polygonPercent?.slice(0, -1) ?? [] } : z))}>Deshacer vértice</button>
              <button type="button" className="ui-button" onClick={cancelDrawing}>Cancelar</button>
              <button type="button" className="ui-button ui-button--primary" disabled={(selectedZone?.polygonPercent?.length ?? 0) < 3} onClick={finishDrawing}>Cerrar polígono</button>
            </span>
          </div>
        ) : tool === 'point' ? <div className="ui-message">{pendingPointCode ? `Hacé clic sobre la ubicación real de ${pendingPointCode} en el plano.` : 'Hacé clic sobre la imagen para colocar una cámara o punto de control.'}</div>
          : tool === 'tramo' && drawingTramoOriginal !== undefined ? <div className="ui-message ui-message--warning flex flex-wrap items-center justify-between gap-2"><span>Clic para agregar quiebres a la línea del tramo.</span><span className="flex gap-2"><button type="button" className="ui-button" onClick={() => setTramos((current) => current.map((item) => item.id === selectedTramoId ? { ...item, viaPercent: item.viaPercent.slice(0, -1) } : item))}>Deshacer punto</button><button type="button" className="ui-button" onClick={cancelDrawingTramo}>Cancelar</button><button type="button" className="ui-button ui-button--primary" onClick={finishDrawingTramo}>Terminar tramo</button></span></div>
          : tool === 'tramo' ? <div className="ui-message">Elegí un tramo físico y presioná “Dibujar tramo”.</div>
          : <div className="ui-message">Seleccioná un sector, una cámara o arrastrá los vértices de un polígono.</div>}
        {saveState === 'error' ? <div className="ui-message ui-message--error" role="alert">No se pudo guardar: {saveError}</div> : null}

        <div className="max-h-[72vh] overflow-auto rounded-[14px] border border-slate-200 bg-slate-100 p-2">
          <div
            ref={canvasRef}
            onClick={onCanvasClick}
            onPointerMove={(event) => {
              const position = eventPoint(event.clientX, event.clientY)
              if (draggingPointId) {
                setPoints((current) => current.map((point) => point.id === draggingPointId ? { ...point, ...position } : point))
                markDirty()
                return
              }
              if (draggingTramoVertex != null && selectedTramoId) {
                setTramos((current) => current.map((tramo) => {
                  if (tramo.id !== selectedTramoId) return tramo
                  const viaPercent = [...tramo.viaPercent]; viaPercent[draggingTramoVertex] = position
                  return { ...tramo, viaPercent }
                })); markDirty(); return
              }
              if (draggingVertex == null || !selectedZoneId) return
              setZones((current) => current.map((z) => {
                if (z.zoneId !== selectedZoneId) return z
                const vertices = [...(z.polygonPercent ?? [])]; vertices[draggingVertex] = position
                return { ...z, polygonPercent: vertices }
              })); markDirty()
            }}
            onPointerUp={() => { setDraggingVertex(null); setDraggingPointId(null); setDraggingTramoVertex(null) }}
            onPointerLeave={() => { setDraggingVertex(null); setDraggingPointId(null); setDraggingTramoVertex(null) }}
            className={`relative origin-top-left select-none bg-white ${tool !== 'select' ? 'cursor-crosshair' : ''}`}
            style={{ aspectRatio: `${basePlan.width} / ${basePlan.height}`, width: `${zoom * 100}%` }}
          >
            <img src={`/plant/${site}/${basePlan.image}`} alt={`Plano de ${site}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs><marker id="editorTramoArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,1 L9,5 L0,9 z" fill="#0284c7" /></marker></defs>
              {zones.map((zone) => {
                const vertices = zone.polygonPercent ?? []
                if (vertices.length < 2) return null
                const selected = zone.zoneId === selectedZoneId
                return <g key={zone.zoneId} data-map-control>
                  <polygon points={vertices.map((v) => `${v.xPercent},${v.yPercent}`).join(' ')} fill={zone.color ?? '#2563EB'} fillOpacity={selected ? 0.24 : 0.13} stroke={zone.color ?? '#2563EB'} strokeWidth={selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); selectZone(zone.zoneId) }} />
                  {selected && tool === 'select' ? vertices.map((vertex, index) => <circle key={index} cx={vertex.xPercent} cy={vertex.yPercent} r={0.9} fill="white" stroke={zone.color ?? '#2563EB'} strokeWidth={0.45} vectorEffect="non-scaling-stroke" className="cursor-move" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDraggingVertex(index) }} />) : null}
                </g>
              })}
              {tool === 'tramo' ? tramos.map((tramo) => {
                const from = points.find((p) => p.id === tramo.fromPointId), to = points.find((p) => p.id === tramo.toPointId)
                if (!from || !to) return null
                const path = tramoPath(from, to, tramos)
                return <g key={tramo.id} data-map-control className="cursor-pointer" onClick={(e) => { e.stopPropagation(); selectTramo(tramo.fromPointId, tramo.toPointId) }}>
                  <polyline points={path.map((p) => `${p.xPercent},${p.yPercent}`).join(' ')} fill="none" stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <polyline points={path.map((p) => `${p.xPercent},${p.yPercent}`).join(' ')} fill="none" stroke={selectedTramoId === tramo.id ? '#0369a1' : '#0ea5e9'} strokeWidth={selectedTramoId === tramo.id ? 0.9 : 0.55} strokeDasharray="2 1.4" markerMid="url(#editorTramoArrow)" markerEnd="url(#editorTramoArrow)" vectorEffect="non-scaling-stroke" />
                </g>
              }) : null}
              {selectedTramo ? selectedTramo.viaPercent.map((vertex, index) => <circle key={index} data-map-control cx={vertex.xPercent} cy={vertex.yPercent} r={1.05} fill="white" stroke="#0369a1" strokeWidth={0.5} vectorEffect="non-scaling-stroke" className="cursor-move" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDraggingTramoVertex(index) }} />) : null}
            </svg>
            {zones.filter((z) => (z.polygonPercent?.length ?? 0) >= 3).map((zone) => {
              const center = polygonCenter(zone.polygonPercent!)
              return <button key={`label-${zone.zoneId}`} type="button" data-map-control onClick={(e) => { e.stopPropagation(); selectZone(zone.zoneId) }} className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-800 shadow" style={{ left: `${center.xPercent}%`, top: `${center.yPercent}%` }}>{zone.label}</button>
            })}
            {points.map((point) => <button key={point.id} type="button" data-map-control onClick={(e) => { e.stopPropagation(); setSelectedPointId(point.id); setSelectedZoneId(point.zoneId ?? null); setDraftPoint(null); setTool('select') }} onPointerDown={(e) => { if (tool !== 'select') return; e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDraggingPointId(point.id) }} className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-move flex-col items-center" style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}><span className="h-4 w-4 rounded-full border-2 border-white shadow" style={{ background: TONE_COLOR[point.tone], outline: selectedPointId === point.id ? '2px solid #0EA5E9' : undefined }} /><span className="mt-0.5 whitespace-nowrap rounded bg-white/90 px-1 text-[10px] font-semibold text-slate-700 shadow-sm">{point.id}</span></button>)}
            {draftPoint ? <span className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-sky-600 bg-sky-200" style={{ left: `${draftPoint.xPercent}%`, top: `${draftPoint.yPercent}%` }} /> : null}
          </div>
        </div>
      </div>

      <aside className="space-y-3">
        <section className="ui-panel p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Puntos pendientes</h2><span className="ui-badge">{pendingSteps.length}</span></div>
          {pendingSteps.length ? <><p className="text-xs text-slate-500">Elegí uno y después hacé clic en su ubicación real sobre el plano.</p><div className="mt-3 space-y-1">{pendingSteps.map((step) => { const definition = pendingDefinition(step.code); return <button key={step.code} type="button" className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm ${pendingPointCode === step.code ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`} onClick={() => { setPendingPointCode(step.code); setDraftPoint(null); setTool('point') }}><span>{definition.label}</span><span className="font-mono text-xs text-slate-500">{step.code}</span></button> })}</div></> : <p className="text-xs text-green-700">Todos los puntos están ubicados.</p>}
        </section>
        <section className="ui-panel p-4">
          <h2 className="text-base font-bold">Tramos físicos</h2>
          <p className="mt-1 text-xs text-slate-500">Crealos primero, sin depender de ningún circuito.</p>
          <div className="mt-3 grid grid-cols-2 gap-2"><select aria-label="Inicio del tramo" className="ui-input" value={newTramoFrom} onChange={(e) => setNewTramoFrom(e.target.value)}><option value="">Desde…</option>{points.map((point) => <option key={point.id} value={point.id}>{point.id}</option>)}</select><select aria-label="Fin del tramo" className="ui-input" value={newTramoTo} onChange={(e) => setNewTramoTo(e.target.value)}><option value="">Hasta…</option>{points.map((point) => <option key={point.id} value={point.id}>{point.id}</option>)}</select></div>
          <button type="button" className="ui-button mt-2" disabled={!newTramoFrom || !newTramoTo || newTramoFrom === newTramoTo} onClick={createTramo}>Crear tramo</button>
          <div className="mt-3 max-h-40 space-y-1 overflow-auto">{tramos.map((tramo) => <button key={tramo.id} type="button" onClick={() => selectTramo(tramo.fromPointId, tramo.toPointId)} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs ${selectedTramoId === tramo.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}><span className="font-mono">{tramo.fromPointId} ↔ {tramo.toPointId}</span><span>{tramo.viaPercent.length} quiebres</span></button>)}</div>
          {selectedTramoEnds ? <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3"><span className="w-full text-xs text-slate-600">Une {selectedTramoEnds.from} con {selectedTramoEnds.to}.</span>{drawingTramoOriginal === undefined ? <button type="button" className="ui-button ui-button--primary" onClick={startDrawingTramo}>{selectedTramo?.viaPercent.length ? 'Redibujar tramo' : 'Dibujar tramo'}</button> : null}{selectedTramo && drawingTramoOriginal === undefined ? <button type="button" className="ui-button text-red-700" onClick={() => { setTramos((current) => current.filter((item) => item.id !== selectedTramo.id)); setCircuitCompositions((current) => current.map((composition) => ({ ...composition, tramos: composition.tramos.filter((ref) => ref.tramoId !== selectedTramo.id) }))); setSelectedTramoId(null); markDirty() }}>Eliminar tramo</button> : null}</div> : null}
        </section>
        <section className="ui-panel p-4">
          <h2 className="text-base font-bold">Composición de circuitos</h2>
          <p className="mt-1 text-xs text-slate-500">Agregá y ordená los tramos que forman cada circuito.</p>
          <label className="mt-3 block text-xs font-medium text-slate-600">Circuito<select className="ui-input mt-1 w-full" value={circuit} onChange={(e) => { setCircuit(e.target.value); setTramoToAdd(''); setTool('tramo') }}><option value="">Elegir circuito…</option>{routes.map((route) => <option key={route.code} value={route.code}>{route.code} · {route.label}</option>)}</select></label>
          {circuit ? <><div className="mt-3 flex gap-2"><select aria-label="Tramo para agregar" className="ui-input min-w-0 flex-1" value={tramoToAdd} onChange={(e) => setTramoToAdd(e.target.value)}><option value="">Elegir tramo…</option>{tramos.map((tramo) => <option key={tramo.id} value={tramo.id}>{tramo.fromPointId} ↔ {tramo.toPointId}</option>)}</select><button type="button" className="ui-button" disabled={!tramoToAdd} onClick={() => { updateComposition([...compositionRefs, { tramoId: tramoToAdd }]); setTramoToAdd('') }}>Agregar</button></div>
          {!activeComposition && compositionRefs.length ? <p className="mt-2 text-xs text-amber-700">Composición inicial tomada del catálogo. La primera edición la guarda como composición visual propia.</p> : null}
          <div className="mt-3 space-y-1">{compositionRefs.map((ref, index, all) => { const tramo = tramos.find((item) => item.id === ref.tramoId); if (!tramo) return null; const label = ref.reverse ? `${tramo.toPointId} → ${tramo.fromPointId}` : `${tramo.fromPointId} → ${tramo.toPointId}`; return <div key={`${ref.tramoId}-${index}`} className="flex items-center gap-1 rounded-lg border border-slate-200 p-1.5 text-xs"><span className="min-w-0 flex-1 truncate font-mono">{index + 1}. {label}</span><button type="button" className="ui-button" onClick={() => updateComposition(all.map((item, i) => i === index ? { ...item, reverse: !item.reverse } : item))}>Invertir</button><button type="button" className="ui-button" disabled={index === 0} onClick={() => { const next = [...all]; [next[index - 1], next[index]] = [next[index]!, next[index - 1]!]; updateComposition(next) }}>↑</button><button type="button" className="ui-button" disabled={index === all.length - 1} onClick={() => { const next = [...all]; [next[index], next[index + 1]] = [next[index + 1]!, next[index]!]; updateComposition(next) }}>↓</button><button type="button" className="ui-button text-red-700" onClick={() => updateComposition(all.filter((_item, i) => i !== index))}>Quitar</button></div> })}</div></> : null}
        </section>
        <section className="ui-panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-bold">Sectores</h2><button type="button" className="ui-button" onClick={addZone}>Nuevo</button></div>
          <div className="max-h-48 space-y-1 overflow-auto">
            {zones.map((zone) => <button key={zone.zoneId} type="button" onClick={() => selectZone(zone.zoneId)} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm ${selectedZoneId === zone.zoneId && !selectedPoint ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}><span><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: zone.color ?? '#2563EB' }} />{zone.label}</span><span className="font-mono text-xs text-slate-400">{zone.polygonPercent?.length ? `${zone.polygonPercent.length} vértices` : 'sin polígono'}</span></button>)}
          </div>
          {selectedZone && !selectedPoint ? <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
            <label className="block text-xs font-medium text-slate-600">Nombre visible<input className="ui-input mt-1 w-full" value={selectedZone.label} onChange={(e) => updateZone({ label: e.target.value })} /></label>
            <label className="block text-xs font-medium text-slate-600">zoneId operativo<input className="ui-input mt-1 w-full font-mono" value={selectedZone.zoneId} readOnly title="El identificador operativo no se cambia desde el editor." /></label>
            <label className="block text-xs font-medium text-slate-600">sectorCode<input className="ui-input mt-1 w-full font-mono" value={selectedZone.sectorCode ?? ''} onChange={(e) => updateZone({ sectorCode: e.target.value })} placeholder="RICARDONE_CALADA" /></label>
            <label className="flex items-center justify-between text-xs font-medium text-slate-600">Color<input type="color" value={selectedZone.color ?? '#2563EB'} onChange={(e) => updateZone({ color: e.target.value })} /></label>
            <div className="flex flex-wrap gap-2"><button type="button" className="ui-button" onClick={() => startDrawing(selectedZone.zoneId)}>{selectedZone.polygonPercent?.length ? 'Redibujar límite' : 'Dibujar límite'}</button><button type="button" className="ui-button text-red-700" onClick={deleteZone}>Eliminar sector</button></div>
            <p className="text-xs text-slate-500">Cambiar el nombre es seguro. El zoneId queda bloqueado para no romper el estado en vivo.</p>
          </div> : null}
        </section>

        <section className="ui-panel p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold">Cámaras y puntos</h2><span className="ui-badge">{points.length}</span></div>
          <div className="max-h-44 space-y-1 overflow-auto">
            {points.map((point) => <button key={point.id} type="button" onClick={() => { setSelectedPointId(point.id); setSelectedZoneId(point.zoneId ?? null); setDraftPoint(null); setTool('select') }} className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-sm ${selectedPointId === point.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200'}`}><span>{point.label}</span><span className="font-mono text-xs text-slate-400">{point.id}</span></button>)}
          </div>
          {selectedPoint ? <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
            <label className="block text-xs font-medium text-slate-600">Id<input className="ui-input mt-1 w-full font-mono" value={selectedPoint.id} readOnly={!isNewPoint} onChange={(e) => isNewPoint && updatePoint({ id: e.target.value.trim() })} placeholder="RicCal01" /></label>
            {pointIdClash ? <p className="text-xs text-red-700">Ese id ya existe.</p> : null}
            <label className="block text-xs font-medium text-slate-600">Nombre<input className="ui-input mt-1 w-full" value={selectedPoint.label} onChange={(e) => updatePoint({ label: e.target.value })} /></label>
            <label className="block text-xs font-medium text-slate-600">Sector visual<select className="ui-input mt-1 w-full" value={selectedPoint.zoneId ?? ''} onChange={(e) => updatePoint({ zoneId: e.target.value || undefined })}><option value="">Sin asignar</option>{zones.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.label}</option>)}</select></label>
            <label className="block text-xs font-medium text-slate-600">sectorCode<input className="ui-input mt-1 w-full font-mono" value={selectedPoint.sectorCode} onChange={(e) => updatePoint({ sectorCode: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs font-medium text-slate-600">Familia<select className="ui-input mt-1 w-full" value={selectedPoint.tone} onChange={(e) => updatePoint({ tone: e.target.value as PlantPointTone })}>{TONES.map((tone) => <option key={tone}>{tone}</option>)}</select></label><label className="text-xs font-medium text-slate-600">Tipo<select className="ui-input mt-1 w-full" value={selectedPoint.type} onChange={(e) => updatePoint({ type: e.target.value as PlantPointType })}>{TYPES.map((type) => <option key={type} value={type}>{TYPE_LABEL[type]}</option>)}</select></label></div>
            <label className="block text-xs font-medium text-slate-600">Device codes, uno por línea<textarea className="ui-input mt-1 w-full font-mono" rows={4} value={selectedPoint.cameraGroup.devices.join('\n')} onChange={(e) => updatePoint({ cameraGroup: { label: selectedPoint.cameraGroup.label || selectedPoint.label, devices: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) } })} /></label>
            <div className="flex flex-wrap gap-2">{isNewPoint ? <><button type="button" className="ui-button ui-button--primary" disabled={!selectedPoint.id.trim() || !selectedPoint.label.trim() || pointIdClash} onClick={commitPoint}>Agregar</button><button type="button" className="ui-button" onClick={() => setDraftPoint(null)}>Cancelar</button></> : <button type="button" className="ui-button text-red-700" onClick={() => { setPoints((current) => current.filter((p) => p.id !== selectedPointId)); setTramos((current) => current.filter((item) => item.fromPointId !== selectedPointId && item.toPointId !== selectedPointId)); setSelectedPointId(null); markDirty() }}>Eliminar punto</button>}</div>
          </div> : <p className="mt-3 text-xs text-slate-500">Elegí un punto o usá “Agregar cámara”.</p>}
        </section>
      </aside>
    </div>
  )
}
