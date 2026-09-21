import { useState } from 'react'

type View = 'plano' | 'colas' | 'actividad'

const alerts = [
  { tone: 'red', title: 'Playa 3 sobre capacidad', detail: '21 camiones · 1 h 55 de drenaje' },
  { tone: 'amber', title: '2 cámaras degradadas', detail: 'Calada y egreso · revisar evidencia' },
  { tone: 'slate', title: 'Datos actualizados', detail: 'Última lectura hace 8 segundos' },
]

export function HomeUxPrototype() {
  const [view, setView] = useState<View>('plano')
  const [sectorOpen, setSectorOpen] = useState(true)
  const [allCircuits, setAllCircuits] = useState(false)
  const circuits = allCircuits ? ['R1', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R16', 'R19', 'R20'] : ['R1', 'R5', 'R7']

  return <div className="min-h-screen bg-slate-100 text-slate-950">
    <div className="mx-auto max-w-[1500px] p-4 lg:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Prototipo UX · datos ilustrativos</div><h1 className="mt-1 text-2xl font-black">Centro de control Ricardone</h1></div>
        <label className="flex min-w-[300px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500"><span aria-hidden>⌕</span><input className="w-full bg-transparent outline-none" placeholder="Buscar patente, sector, circuito o cámara" /></label>
      </div>

      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-bold"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Operación en vivo</span>
        <span className="text-sm text-slate-500">Última lectura hace 8 s</span><span className="text-sm text-slate-500">Lunes 21 de septiembre · 14:23</span>
        <button className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold">Catálogo de patentes</button>
      </header>

      <section className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Excepciones operativas">
        {alerts.map((alert, index) => <button key={alert.title} onClick={() => index === 0 && setSectorOpen(true)} className={`min-w-[260px] flex-1 rounded-xl border bg-white px-3 py-2 text-left ${alert.tone === 'red' ? 'border-red-300' : alert.tone === 'amber' ? 'border-amber-300' : 'border-slate-200'}`}><div className="flex items-center gap-2 text-sm font-bold"><span className={`h-2 w-2 rounded-full ${alert.tone === 'red' ? 'bg-red-600' : alert.tone === 'amber' ? 'bg-amber-500' : 'bg-slate-400'}`} />{alert.title}</div><div className="mt-0.5 pl-4 text-xs text-slate-500">{alert.detail}</div></button>)}
      </section>

      <section className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {[['En planta', '64', 'camiones'], ['Ingresos', '24', 'últimos 60 min'], ['Egresos', '26', 'últimos 60 min'], ['Cuello de botella', 'Playa 3', '21 esperando · 1 h 55'], ['Estadía P90', '3h14', 'media 1h45']].map(([label, value, note], index) => <button key={label} onClick={() => index === 3 && setSectorOpen(true)} className={`min-h-[100px] rounded-xl border p-3 text-left ${index === 3 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-black">{value}</div><div className="mt-1 text-xs text-slate-500">{note}</div></button>)}
      </section>

      <nav className="sticky top-0 z-30 mt-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5" aria-label="Modo de trabajo">
        {([['plano', 'Plano y cámaras'], ['colas', 'Colas por zona'], ['actividad', 'Actividad']] as const).map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 text-sm font-bold ${view === key ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
        <button className="ml-auto rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700">Consultar NVAi</button>
      </nav>

      {view === 'plano' ? <main className="relative mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Circuitos frecuentes</span>
          {circuits.map(c => <button key={c} className={`min-h-10 rounded-full border px-4 text-sm font-bold ${c === 'R1' ? 'border-blue-700 bg-blue-50 text-blue-800' : 'border-slate-300'}`}>{c}</button>)}
          <button onClick={() => setAllCircuits(v => !v)} className="min-h-10 rounded-full border border-slate-300 px-4 text-sm font-semibold">{allCircuits ? 'Mostrar favoritos' : 'Todos los circuitos'}</button>
          <div className="ml-auto flex gap-2"><button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Sectores</button><button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm">Cámaras</button></div>
        </div>
        <div className="relative min-h-[650px] bg-slate-900/5 p-3 lg:pr-[455px]">
          <div className="relative mx-auto max-w-[790px] overflow-hidden rounded-xl border border-slate-300 bg-slate-200" style={{ aspectRatio: '1335/1178' }}>
            <img src="/plant/ricardone/ricardone-plano.png" alt="Plano cenital de Ricardone" className="absolute inset-0 h-full w-full object-cover" />
            <button onClick={() => setSectorOpen(true)} aria-label="Abrir Playa 3" className="absolute left-[60%] top-[53%] grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-red-600 text-xs font-black text-white outline outline-2 outline-red-700">21</button>
            <button className="absolute left-[19%] top-[47%] grid h-11 w-11 place-items-center rounded-full border-4 border-white bg-emerald-600 text-xs font-black text-white">17</button>
            <div className="pointer-events-none absolute left-[20%] top-[66%] h-[3px] w-[43%] -rotate-6 bg-blue-600" />
          </div>
          {sectorOpen ? <aside className="absolute inset-y-3 right-3 z-20 w-[430px] overflow-auto rounded-xl border border-slate-300 bg-white p-4 max-lg:left-3 max-lg:w-auto">
            <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-red-700">Requiere atención</div><h2 className="mt-1 text-xl font-black">Playa 3</h2><p className="text-sm text-slate-500">Acceso y espera previa a descarga</p></div><button onClick={() => setSectorOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300" aria-label="Cerrar detalle">×</button></div>
            <div className="mt-4 grid grid-cols-3 gap-2 border-y border-slate-200 py-4"><div><div className="text-xs text-slate-500">Presentes</div><b className="text-xl">21</b></div><div><div className="text-xs text-slate-500">Capacidad</div><b className="text-xl">18</b></div><div><div className="text-xs text-slate-500">Drenaje</div><b className="text-xl">1h55</b></div></div>
            <div className="mt-4"><h3 className="text-sm font-bold">Acciones recomendadas</h3><button className="mt-2 w-full rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-bold text-white">Abrir cámaras de Playa 3</button><button className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold">Ver camiones por permanencia</button></div>
            <div className="mt-5"><h3 className="text-sm font-bold">Evidencia</h3><div className="mt-2 space-y-2 text-sm"><div className="flex justify-between border-b border-slate-100 py-2"><span>Salud de cámaras</span><b className="text-amber-700">1 degradada</b></div><div className="flex justify-between border-b border-slate-100 py-2"><span>Tasa efectiva</span><b>11 camiones/h</b></div><div className="flex justify-between border-b border-slate-100 py-2"><span>Ocupación vs. 1 h</span><b className="text-red-700">+31%</b></div></div></div>
          </aside> : null}
        </div>
      </main> : <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-black">{view === 'colas' ? 'Colas priorizadas por impacto' : 'Actividad y evidencia reciente'}</h2><p className="mt-2 text-sm text-slate-500">En la propuesta, cada modo ocupa toda la superficie de trabajo y conserva la misma franja de excepciones.</p></section>}
    </div>
  </div>
}
