import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import type { PlantLayout } from '../../data/plantZones.types'
import { plantTramoId, tramoPath } from '../../data/plantRouteGeometry'
import {
  loadIfcOverrides,
  loadPlant3dView,
  projectLayout,
  tramoPieceIds,
  unprojectAt,
  zoneFloorGuids,
  type IfcOverrides,
  type Plant3dModel,
  type Plant3dView,
} from './plant3dView'

/**
 * Editor del plano sobre el modelo IFC (Datos → Editar plano). Muestra la misma vista fija que En vivo
 * y guarda ajustes a mano en public/plant/<site>/ifc-overrides.json, que ganan sobre lo que deduce
 * el exportador:
 *   - un punto (S0, S6…) se elige de la lista y se ubica con un clic en el modelo (plano del piso);
 *   - una zona de espera (Z2, Z6…) se elige y se le suman o sacan pisos del IFC con un clic; también se puede eliminar;
 *   - un tramo (S1::S2) se elige y se le suman o sacan ejes viales y pisos del IFC con un clic (un piso se
 *     cruza a lo largo, por su eje largo); sin piezas va recto.
 */
const SITES = [
  { id: 'ricardone', label: 'Ricardone' },
  { id: 'san_lorenzo', label: 'San Lorenzo' },
] as const

type Loaded = { layout: PlantLayout; model: Plant3dModel; view: Plant3dView }
type Selection = { kind: 'point' | 'zone' | 'tramo'; id: string } | null
type Overrides = Required<IfcOverrides>
const EMPTY: Overrides = { points: {}, zoneFloors: {}, removedZones: [], tramos: {} }

const polyArea = (p: [number, number][]) => Math.abs(p.reduce((a, [x1, y1], i) => {
  const [x2, y2] = p[(i + 1) % p.length]
  return a + x1 * y2 - x2 * y1
}, 0) / 2)
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

export function PlantIfcEditor() {
  const [site, setSite] = useState<(typeof SITES)[number]['id']>('ricardone')
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [overrides, setOverrides] = useState<Overrides>(EMPTY)
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState<Selection>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [newTramo, setNewTramo] = useState<[string, string]>(['', ''])

  useEffect(() => {
    let alive = true
    setData(null); setError(''); setSel(null); setDirty(false); setStatus('')
    Promise.all([
      fetch(`/plant/${site}/plantZones.json`, { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`plantZones.json ${r.status}`)
        return r.json() as Promise<PlantLayout>
      }),
      loadPlant3dView(site),
      loadIfcOverrides(site),
    ])
      .then(([layout, { model, view }, ov]) => {
        if (!alive) return
        setData({ layout, model, view })
        setOverrides({ ...EMPTY, ...ov })
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
    return () => { alive = false }
  }, [site])

  const projected = useMemo(() => data && projectLayout(data.layout, data.model, data.view, overrides), [data, overrides])
  /** Pisos del IFC en la vista, de mayor a menor: los chicos quedan arriba y se pueden clickear. */
  const floorIds = useMemo(() => new Set((data?.model.floors ?? []).map((f) => f.guid)), [data])
  const floors = useMemo(() => {
    if (!data) return []
    return [...(data.model.floors ?? [])]
      .sort((a, b) => polyArea(b.polygon) - polyArea(a.polygon))
      .map((f) => ({ guid: f.guid, area: polyArea(f.polygon), pts: f.polygon.map(([x, y]) => data.view.project(x, y, f.z)) }))
  }, [data])
  const edges = useMemo(() => {
    if (!data) return []
    return (data.model.edges ?? []).map((e) => ({ ...e, pts: e.points.map(([x, y, z]) => data.view.project(x, y, z)) }))
  }, [data])
  /** Zonas de espera: las que tienen playa dibujada, piso en el IFC o las usa algún punto para esperar. */
  const waitZones = useMemo(() => {
    if (!data) return []
    const used = new Set((data.layout.points ?? []).map((p) => p.waitZone).filter(Boolean))
    return data.layout.zones.filter((z) => used.has(z.zoneId) || (z.polygonPercent?.length ?? 0) >= 3 || data.model.zoneFloors?.[z.zoneId])
  }, [data])
  /** Pares de puntos con camino: los del plano, los del exportador, los `nextDefault` y los agregados a mano. */
  const tramoIds = useMemo(() => {
    if (!data) return []
    const ids = new Set([
      ...(data.layout.tramos ?? []).map((t) => t.id),
      ...(data.model.tramos ?? []).map((t) => t.id),
      ...(data.layout.points ?? []).flatMap((p) => (p.nextDefault ? [plantTramoId(p.id, p.nextDefault)] : [])),
      ...Object.keys(overrides.tramos),
    ])
    const pointIds = new Set((data.layout.points ?? []).map((p) => p.id))
    return [...ids].filter((id) => id.split('::').every((p) => pointIds.has(p))).sort()
  }, [data, overrides.tramos])

  const change = (fn: (o: Overrides) => Overrides) => { setOverrides(fn); setDirty(true); setStatus('') }

  const onClickModel = (e: MouseEvent<SVGSVGElement>) => {
    if (!data || sel?.kind !== 'point') return
    const box = e.currentTarget.getBoundingClientRect()
    const q = { xPercent: ((e.clientX - box.left) / box.width) * 100, yPercent: ((e.clientY - box.top) / box.height) * 100 }
    const [x, y] = unprojectAt(data.view, q, data.model.groundZ)
    const id = sel.id
    change((o) => ({ ...o, points: { ...o.points, [id]: [x, y, data.model.groundZ] } }))
  }
  const pickFloor = (guid: string) => {
    if (!data || sel?.kind !== 'zone') return
    const id = sel.id
    change((o) => ({ ...o, zoneFloors: { ...o.zoneFloors, [id]: toggle(zoneFloorGuids(data.model, o, id), guid) } }))
  }
  const pickPiece = (pieceId: string) => {
    if (!data || sel?.kind !== 'tramo') return
    const id = sel.id
    change((o) => ({ ...o, tramos: { ...o.tramos, [id]: toggle(tramoPieceIds(data.model, o, id), pieceId) } }))
  }
  const clear = (kind: 'points' | 'zoneFloors' | 'tramos', id: string) => change((o) => {
    const next = { ...o[kind] }
    delete next[id]
    return { ...o, [kind]: next }
  })
  const setRemoved = (zoneId: string, removed: boolean) => change((o) => ({
    ...o, removedZones: removed ? [...o.removedZones.filter((z) => z !== zoneId), zoneId] : o.removedZones.filter((z) => z !== zoneId),
  }))
  const addTramo = () => {
    const [a, b] = newTramo
    if (!a || !b || a === b) return
    const id = plantTramoId(a, b)
    if (!(id in overrides.tramos)) change((o) => ({ ...o, tramos: { ...o.tramos, [id]: data ? tramoPieceIds(data.model, o, id) : [] } }))
    setSel({ kind: 'tramo', id })
    setNewTramo(['', ''])
  }

  const save = async () => {
    setSaving(true)
    try {
      const r = await fetch(`/api/truckflow/plant-layout/${site}/ifc-overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overrides),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
      setDirty(false)
      setStatus('Guardado. En vivo lo toma al volver a abrirlo.')
    } catch (e) {
      setStatus(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const view = data?.view
  const toPx = (q: { xPercent: number; yPercent: number }) => view ? `${(q.xPercent / 100) * view.width},${(q.yPercent / 100) * view.height}` : ''
  const removed = new Set(overrides.removedZones)
  /** Piso → zona que lo usa (las eliminadas no cuentan). */
  const floorZone = new Map(data ? waitZones.filter((z) => !removed.has(z.zoneId)).flatMap((z) => zoneFloorGuids(data.model, overrides, z.zoneId).map((g) => [g, z.zoneId] as const)) : [])
  const selectedFloors = new Set(data && sel?.kind === 'zone' ? zoneFloorGuids(data.model, overrides, sel.id) : [])
  const selectedPieces = new Set(data && sel?.kind === 'tramo' ? tramoPieceIds(data.model, overrides, sel.id) : [])
  const byPointId = new Map((projected?.points ?? []).map((p) => [p.id, p]))
  const selectedPath = (() => {
    if (sel?.kind !== 'tramo' || !projected) return null
    const [a, b] = sel.id.split('::').map((id) => byPointId.get(id))
    return a && b ? tramoPath(a, b, projected.tramos ?? []) : null
  })()
  const tramoEnds = new Set(sel?.kind === 'tramo' ? sel.id.split('::') : [])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Editar plano sobre el modelo</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">
            Punto: elegilo y hacé clic en el modelo. Zona: elegila y hacé clic en los pisos que forman su playa (varios). Tramo: elegilo y hacé clic en los ejes y pisos por donde pasa el camión.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {SITES.map((s) => (
            <button key={s.id} type="button" onClick={() => { if (s.id !== site && (!dirty || confirm('Hay cambios sin guardar. ¿Descartarlos?'))) setSite(s.id) }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${site === s.id ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
              {s.label}
            </button>
          ))}
          <button type="button" onClick={() => void save()} disabled={!dirty || saving}
            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </header>
      {status ? <p className="mb-2 text-[12.5px] text-slate-600">{status}</p> : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">No se pudo cargar el modelo: {error}</p>
        : !data || !projected || !view ? <p className="text-sm text-slate-500">Dibujando el modelo…</p>
        : (
          <div className="flex flex-col-reverse gap-4 lg:flex-row">
            <aside className="max-h-[80vh] w-full shrink-0 space-y-3 overflow-y-auto pr-1 text-[12.5px] lg:w-64">
              <Section title="Puntos">
                {(projected.points ?? []).map((p) => {
                  const on = sel?.kind === 'point' && sel.id === p.id
                  return (
                    <Row key={p.id} on={on} tone="bg-violet-100" onSelect={() => setSel(on ? null : { kind: 'point', id: p.id })}
                      label={<><span className="font-mono font-bold text-slate-800">{p.id}</span> <span className="text-slate-500">{p.label}</span></>}>
                      {overrides.points[p.id] ? <Chip title="Quitar el ajuste (vuelve al nodo del IFC)" onClick={() => clear('points', p.id)}>ajustado ✕</Chip> : null}
                    </Row>
                  )
                })}
              </Section>
              <Section title="Zonas de espera">
                {waitZones.map((z) => {
                  const on = sel?.kind === 'zone' && sel.id === z.zoneId
                  const gone = removed.has(z.zoneId)
                  const n = zoneFloorGuids(data.model, overrides, z.zoneId).length
                  return (
                    <Row key={z.zoneId} on={on} tone="bg-sky-100" onSelect={() => setSel(on ? null : { kind: 'zone', id: z.zoneId })}
                      label={<span className={gone ? 'line-through opacity-60' : ''}>
                        <span className="font-mono font-bold text-slate-800">{z.zoneId}</span> <span className="text-slate-500">{z.label}</span>
                        {!gone ? <span className={`ml-1 text-[11px] ${n ? 'text-slate-400' : 'text-red-600'}`}>{n ? `${n} ${n === 1 ? 'piso' : 'pisos'}` : 'sin piso'}</span> : null}
                      </span>}>
                      {overrides.zoneFloors[z.zoneId] && !gone ? <Chip title="Volver al piso que deduce el exportador" onClick={() => clear('zoneFloors', z.zoneId)}>ajustado ✕</Chip> : null}
                      {gone
                        ? <Chip title="Volver a dibujar la zona" onClick={() => setRemoved(z.zoneId, false)}>restaurar</Chip>
                        : <Chip danger title="No dibujar esta zona: sus camiones van al punto o a la línea" onClick={() => setRemoved(z.zoneId, true)}>eliminar</Chip>}
                    </Row>
                  )
                })}
              </Section>
              <Section title="Tramos">
                {tramoIds.map((id) => {
                  const on = sel?.kind === 'tramo' && sel.id === id
                  const own = overrides.tramos[id]
                  const pieces = tramoPieceIds(data.model, overrides, id)
                  const n = pieces.length
                  const nFloors = pieces.filter((p) => floorIds.has(p)).length
                  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
                  const summary = [n - nFloors ? plural(n - nFloors, 'eje', 'ejes') : '', nFloors ? plural(nFloors, 'piso', 'pisos') : ''].filter(Boolean).join(' · ')
                  return (
                    <Row key={id} on={on} tone="bg-fuchsia-100" onSelect={() => setSel(on ? null : { kind: 'tramo', id })}
                      label={<><span className="font-mono font-bold text-slate-800">{id.replace('::', ' ↔ ')}</span>{' '}
                        <span className={`text-[11px] ${n ? 'text-slate-400' : 'text-amber-700'}`}>{n ? summary : 'recta'}</span></>}>
                      {on && n ? <Chip title="Sacar todos los ejes y pisos: el camión va en línea recta" onClick={() => change((o) => ({ ...o, tramos: { ...o.tramos, [id]: [] } }))}>recta</Chip> : null}
                      {own ? <Chip title="Volver al camino más corto que arma el exportador" onClick={() => clear('tramos', id)}>ajustado ✕</Chip> : null}
                    </Row>
                  )
                })}
                <li className="mt-1 flex items-center gap-1">
                  {[0, 1].map((k) => (
                    <select key={k} value={newTramo[k]} onChange={(e) => setNewTramo((t) => (k ? [t[0], e.target.value] : [e.target.value, t[1]]))}
                      className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-0.5 text-[12px]">
                      <option value="">{k ? 'hasta' : 'desde'}</option>
                      {(data.layout.points ?? []).map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
                    </select>
                  ))}
                  <button type="button" onClick={addTramo} disabled={!newTramo[0] || !newTramo[1] || newTramo[0] === newTramo[1]}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[12px] font-semibold disabled:opacity-40">+</button>
                </li>
              </Section>
            </aside>
            <div className="relative w-full min-w-0 flex-1 self-start overflow-hidden rounded-xl border border-slate-200" style={{ aspectRatio: `${view.width} / ${view.height}` }}>
              <img src={view.image} alt={`Modelo de ${site}`} draggable={false} className="absolute inset-0 h-full w-full select-none" />
              <svg viewBox={`0 0 ${view.width} ${view.height}`} preserveAspectRatio="none" onClick={onClickModel}
                className={`absolute inset-0 h-full w-full ${sel?.kind === 'point' ? 'cursor-crosshair' : ''}`}>
                {floors.map((f) => {
                  const zoneId = floorZone.get(f.guid)
                  const tramoMode = sel?.kind === 'tramo'
                  // En modo tramo el piso elegido va en el color del tramo; si no, en el de la zona.
                  const picked = tramoMode ? selectedPieces.has(f.guid) : selectedFloors.has(f.guid)
                  const pickable = sel?.kind === 'zone' || tramoMode
                  const [strong, edge] = tramoMode ? ['#C026D3', '#86198F'] : ['#0EA5E9', '#0369A1']
                  return (
                    <polygon key={f.guid} points={f.pts.map(toPx).join(' ')}
                      fill={picked ? strong : zoneId ? '#38BDF8' : '#64748B'} fillOpacity={picked ? 0.45 : zoneId ? 0.15 : pickable ? 0.06 : 0}
                      stroke={picked ? edge : zoneId ? '#0EA5E9' : '#64748B'} strokeOpacity={picked || zoneId ? 0.9 : pickable ? 0.45 : 0}
                      strokeWidth={picked ? 2.5 : 1} vectorEffect="non-scaling-stroke"
                      className={pickable ? `cursor-pointer ${tramoMode ? 'hover:fill-fuchsia-400' : 'hover:fill-sky-400'}` : ''}
                      style={{ pointerEvents: pickable ? 'auto' : 'none' }}
                      onClick={(e) => { e.stopPropagation(); if (tramoMode) pickPiece(f.guid); else pickFloor(f.guid) }}>
                      <title>{`${zoneId ? `${zoneId} · ` : ''}piso ${f.guid} · ${Math.round(f.area)} m²`}</title>
                    </polygon>
                  )
                })}
                {sel?.kind === 'tramo' ? edges.map((e) => {
                  const pts = e.pts.map(toPx).join(' ')
                  const picked = selectedPieces.has(e.id)
                  return (
                    <g key={e.id} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); pickPiece(e.id) }}>
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={16} />
                      <polyline points={pts} fill="none" stroke={picked ? '#A21CAF' : '#475569'} strokeOpacity={picked ? 0.95 : 0.55}
                        strokeWidth={picked ? 6 : 2.5} strokeLinecap="round" strokeLinejoin="round" className="hover:stroke-fuchsia-500" />
                      <title>{`${e.from.split(':')[1]} → ${e.to.split(':')[1]} · ${Math.round(e.lengthM)} m`}</title>
                    </g>
                  )
                }) : null}
                {selectedPath ? (
                  <polyline points={selectedPath.map(toPx).join(' ')} fill="none" stroke="#7C3AED" strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                ) : null}
                {(projected.points ?? []).map((p) => {
                  const on = (sel?.kind === 'point' && sel.id === p.id) || tramoEnds.has(p.id)
                  const [x, y] = toPx(p).split(',').map(Number)
                  return (
                    <g key={p.id} style={{ pointerEvents: 'none' }}>
                      <circle cx={x} cy={y} r={on ? 11 : 8} fill={overrides.points[p.id] ? '#F59E0B' : '#7C3AED'} stroke="#fff" strokeWidth={3} />
                      <text x={x + 12} y={y - 10} fontSize={on ? 22 : 17} fontWeight={800} fill="#1E293B" stroke="#fff" strokeWidth={4} paintOrder="stroke">{p.id}</text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

function Row({ on, tone, onSelect, label, children }: { on: boolean; tone: string; onSelect: () => void; label: ReactNode; children?: ReactNode }) {
  return (
    <li className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${on ? tone : ''}`}>
      <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={onSelect}>{label}</button>
      {children}
    </li>
  )
}

function Chip({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return <button type="button" title={title} onClick={onClick} className={`shrink-0 text-[11px] ${danger ? 'text-red-600' : 'text-amber-700'}`}>{children}</button>
}
