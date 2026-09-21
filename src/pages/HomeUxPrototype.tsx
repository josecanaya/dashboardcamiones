import { useEffect, useState } from 'react'
import { PlantMap } from '../components/plant/PlantMap'
import type { PlantLayout } from '../data/plantZones.types'
import type { ZoneState } from '../services/live/plantStateApi'

const demoZones = [
  { id: 'Z2', label: 'Playa 1', backlog: 17, status: 'normal', drainPoints: [{ id: 'S2', label: 'Calada', sectorCode: 'RICARDONE_CALADA', ratePerHour: 18 }], from: null, fromLabel: null, to: [], capacityPhysical: 30, capacityOperational: 24, in60: 16, out60: 18, delta40: -1, dwellAvgMin: 42, dwellP90Min: 76, drainRatePerHour: 18, drainRateNominalPerHour: 18, drainMinutes: 57, activePoints: ['S2'], idlePoints: [], note: null, pending: null },
  { id: 'Z6', label: 'Playa 3', backlog: 21, status: 'critical', drainPoints: [{ id: 'S6', label: 'Playa 3', sectorCode: 'S6', ratePerHour: 11 }], from: null, fromLabel: null, to: [], capacityPhysical: 24, capacityOperational: 18, in60: 19, out60: 11, delta40: 8, dwellAvgMin: 71, dwellP90Min: 115, drainRatePerHour: 11, drainRateNominalPerHour: 16, drainMinutes: 115, activePoints: ['S6'], idlePoints: [], note: null, pending: null },
] as ZoneState[]

const metrics = [['En planta', '64', 'camiones'], ['Ingresos', '24', 'última hora'], ['Egresos', '26', 'última hora'], ['Estadía P90', '3h14', 'media 1h45']]

export function HomeUxPrototype() {
  const [layout, setLayout] = useState<PlantLayout | null>(null)
  const [selectedSector, setSelectedSector] = useState<string | null>('S6')
  const [focusOpen, setFocusOpen] = useState(true)
  const [mode, setMode] = useState<'mapa' | 'colas' | 'actividad'>('mapa')
  useEffect(() => { fetch('/api/truckflow/plant-layout/ricardone').then(r => r.json()).then(data => setLayout(data.layout)).catch(() => {}) }, [])

  return <div className="min-h-[calc(100vh-24px)] bg-slate-950 text-white">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
      <div><span className="text-[10px] font-bold uppercase tracking-[.18em] text-blue-300">Prototipo · datos ilustrativos</span><h1 className="text-lg font-black">Ricardone · Centro de control</h1></div>
      <span className="ml-2 inline-flex items-center gap-2 text-xs text-slate-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />En vivo · hace 8 s</span>
      <label className="ml-auto flex w-[330px] items-center rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300"><input className="w-full bg-transparent outline-none" placeholder="Buscar patente, cámara, sector o circuito" /></label>
      <button className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold">14:23</button>
    </header>

    <div className="flex items-center gap-2 overflow-x-auto border-b border-white/10 px-4 py-2">
      <button onClick={() => { setSelectedSector('S6'); setFocusOpen(true) }} className="flex min-w-fit items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-200"><span className="h-2 w-2 rounded-full bg-red-400" />Playa 3 crítica · 21 · 1h55</button>
      <button className="min-w-fit rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-200">2 cámaras degradadas</button>
      {metrics.map(([label, value, note]) => <div key={label} className="min-w-fit border-l border-white/10 px-3"><span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span><b className="ml-2 text-sm">{value}</b><span className="ml-1 text-[10px] text-slate-500">{note}</span></div>)}
      <div className="ml-auto flex rounded-lg bg-white/5 p-1">{([['mapa', 'Mapa'], ['colas', 'Colas'], ['actividad', 'Actividad']] as const).map(([key, label]) => <button key={key} onClick={() => setMode(key)} className={`rounded-md px-3 py-1 text-xs font-bold ${mode === key ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>{label}</button>)}</div>
    </div>

    {mode === 'mapa' ? <main className="relative h-[calc(100vh-115px)] overflow-hidden bg-slate-100 p-3 text-slate-950">
      <style>{`.prototype-map > div > div:last-child{max-width:900px}`}</style>
      <div className="prototype-map mx-auto h-full max-w-[1380px] overflow-auto rounded-xl border border-slate-300 bg-white">
        {layout ? <PlantMap layout={layout} zones={demoZones} selectedSector={selectedSector} onSelectSector={(sector) => { setSelectedSector(sector); setFocusOpen(true) }} onOpenCameras={() => {}} /> : <div className="grid h-full place-items-center text-sm text-slate-500">Cargando plano SVG…</div>}
      </div>
      {focusOpen ? <aside className="w-[300px] rounded-xl border border-slate-700 p-3 text-white backdrop-blur-md" style={{ position: 'fixed', right: 28, top: 150, zIndex: 9999, background: 'rgba(15,23,42,.96)', color: '#fff' }}>
        <div className="flex items-start justify-between"><div><span className="text-[10px] font-black uppercase tracking-wide text-red-700">Excepción operativa</span><h2 className="text-lg font-black">Playa 3</h2></div><button onClick={() => setFocusOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg border border-slate-300">×</button></div>
        <div className="mt-3 flex divide-x divide-white/15 border-y border-white/15 py-2">{[['Cola', '21'], ['Capacidad', '18'], ['Drenaje', '1h55']].map(([label, value]) => <div key={label} className="flex-1 px-2 first:pl-0"><div className="text-[10px] text-slate-400">{label}</div><b>{value}</b></div>)}</div>
        <button className="mt-3 w-full rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Abrir cámaras</button>
        <button className="mt-2 w-full rounded-lg border border-white/20 px-3 py-2 text-xs font-bold">Ver camiones y permanencia</button>
        <div className="mt-3 text-xs text-slate-400">Tasa efectiva <b className="float-right text-white">11 camiones/h</b></div>
      </aside> : <button onClick={() => setFocusOpen(true)} className="absolute right-5 top-5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Abrir foco operativo</button>}
      <button className="absolute bottom-5 right-5 z-40 rounded-full bg-blue-700 px-4 py-3 text-xs font-black text-white">NVAi</button>
    </main> : <main className="grid h-[calc(100vh-115px)] place-items-center bg-slate-100 text-slate-900"><div><h2 className="text-xl font-black">{mode === 'colas' ? 'Colas priorizadas' : 'Actividad reciente'}</h2><p className="mt-1 text-sm text-slate-500">Este modo reemplaza el mapa y usa toda la superficie.</p></div></main>}
  </div>
}
