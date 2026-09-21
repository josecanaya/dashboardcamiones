import { useMemo, useRef, useState } from 'react'
import type {
  PlantBasePlan,
  PlantPoint,
  PlantPointTone,
  PlantPointType,
  PlantZoneShape,
} from '../../data/plantZones.types'

type Tool = 'select' | 'sector' | 'point'
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

export function PlantLayoutEditor({ site, basePlan, initialPoints, initialZones, onSave }: {
  site: string
  basePlan: PlantBasePlan
  initialPoints: PlantPoint[]
  initialZones: PlantZoneShape[]
  onSave: (points: PlantPoint[], zones: PlantZoneShape[]) => Promise<void>
}) {
  const [points, setPoints] = useState(initialPoints)
  const [zones, setZones] = useState(initialZones)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialZones[0]?.zoneId ?? null)
  const [draftPoint, setDraftPoint] = useState<PlantPoint | null>(null)
  const [drawingOriginal, setDrawingOriginal] = useState<PercentPoint[] | null>(null)
  const [draggingVertex, setDraggingVertex] = useState<number | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedPoint = draftPoint ?? points.find((p) => p.id === selectedPointId) ?? null
  const selectedZone = zones.find((z) => z.zoneId === selectedZoneId) ?? null
  const isNewPoint = draftPoint != null
  const pointIdClash = Boolean(selectedPoint?.id.trim())
    && points.some((p) => p.id === selectedPoint!.id && (isNewPoint || p.id !== selectedPointId))
  const nextZoneIndex = useMemo(() => {
    const used = new Set(zones.map((z) => z.zoneId))
    let i = 0
    while (used.has(`Z${i}`)) i += 1
    return i
  }, [zones])

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
      setDraftPoint(emptyPoint(position.xPercent, position.yPercent, containing?.zoneId))
      setSelectedPointId(null); setSelectedZoneId(containing?.zoneId ?? null)
    }
  }
  const commitPoint = () => {
    if (!draftPoint || !draftPoint.id.trim() || !draftPoint.label.trim() || pointIdClash) return
    setPoints((current) => [...current, draftPoint]); setSelectedPointId(draftPoint.id)
    setDraftPoint(null); setTool('select'); markDirty()
  }
  const save = async () => {
    setSaveState('busy')
    try { await onSave(points, zones); setSaveState('done'); setDirty(false) }
    catch (error) { setSaveState('error'); setSaveError(error instanceof Error ? error.message : String(error)) }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Herramientas del plano">
            <button type="button" onClick={() => setTool('select')} className={`ui-button ${tool === 'select' ? 'ui-button--primary' : ''}`}>Seleccionar</button>
            <button type="button" onClick={addZone} className="ui-button">Dibujar sector</button>
            <button type="button" onClick={() => { setTool('point'); setDraftPoint(null) }} className={`ui-button ${tool === 'point' ? 'ui-button--primary' : ''}`}>Agregar cámara</button>
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
        ) : tool === 'point' ? <div className="ui-message">Hacé clic sobre la imagen para colocar una cámara o punto de control.</div>
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
              if (draggingVertex == null || !selectedZoneId) return
              setZones((current) => current.map((z) => {
                if (z.zoneId !== selectedZoneId) return z
                const vertices = [...(z.polygonPercent ?? [])]; vertices[draggingVertex] = position
                return { ...z, polygonPercent: vertices }
              })); markDirty()
            }}
            onPointerUp={() => { setDraggingVertex(null); setDraggingPointId(null) }}
            onPointerLeave={() => { setDraggingVertex(null); setDraggingPointId(null) }}
            className={`relative origin-top-left select-none bg-white ${tool !== 'select' ? 'cursor-crosshair' : ''}`}
            style={{ aspectRatio: `${basePlan.width} / ${basePlan.height}`, width: `${zoom * 100}%` }}
          >
            <img src={`/plant/${site}/${basePlan.image}`} alt={`Plano de ${site}`} draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none" />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {zones.map((zone) => {
                const vertices = zone.polygonPercent ?? []
                if (vertices.length < 2) return null
                const selected = zone.zoneId === selectedZoneId
                return <g key={zone.zoneId} data-map-control>
                  <polygon points={vertices.map((v) => `${v.xPercent},${v.yPercent}`).join(' ')} fill={zone.color ?? '#2563EB'} fillOpacity={selected ? 0.24 : 0.13} stroke={zone.color ?? '#2563EB'} strokeWidth={selected ? 0.7 : 0.4} vectorEffect="non-scaling-stroke" className="cursor-pointer" onClick={(e) => { e.stopPropagation(); selectZone(zone.zoneId) }} />
                  {selected && tool === 'select' ? vertices.map((vertex, index) => <circle key={index} cx={vertex.xPercent} cy={vertex.yPercent} r={0.9} fill="white" stroke={zone.color ?? '#2563EB'} strokeWidth={0.45} vectorEffect="non-scaling-stroke" className="cursor-move" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setDraggingVertex(index) }} />) : null}
                </g>
              })}
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
            <div className="flex flex-wrap gap-2">{isNewPoint ? <><button type="button" className="ui-button ui-button--primary" disabled={!selectedPoint.id.trim() || !selectedPoint.label.trim() || pointIdClash} onClick={commitPoint}>Agregar</button><button type="button" className="ui-button" onClick={() => setDraftPoint(null)}>Cancelar</button></> : <button type="button" className="ui-button text-red-700" onClick={() => { setPoints((current) => current.filter((p) => p.id !== selectedPointId)); setSelectedPointId(null); markDirty() }}>Eliminar punto</button>}</div>
          </div> : <p className="mt-3 text-xs text-slate-500">Elegí un punto o usá “Agregar cámara”.</p>}
        </section>
      </aside>
    </div>
  )
}
