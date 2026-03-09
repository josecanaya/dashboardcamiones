import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
  ReferenceArea,
} from 'recharts'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { getCircuitsForSite, type MasterCircuitItem } from '../data/masterCircuitCatalog'

interface HistoricalOperationalPageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
  mode?: 'stats' | 'records'
  onViewInModel: (plate: string) => void
}

type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

export function HistoricalOperationalPage({ siteId, onChangeSite, mode = 'stats', onViewInModel }: HistoricalOperationalPageProps) {
  const { historicalTrips } = useLogisticsOps()
  const [query, setQuery] = useState('')
  const [circuitFilter, setCircuitFilter] = useState('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')

  const circuits = useMemo(() => {
    const siteCircuits = getCircuitsForSite(siteId)
    // Si una planta todavía no tiene catálogo cargado, usar Ricardone
    // para mantener visible el diseño analítico en modo mock.
    if (siteCircuits.length === 0) return getCircuitsForSite('ricardone')
    return siteCircuits
  }, [siteId])

  const statsMock = useMemo(() => {
    const source = circuits.length > 0 ? circuits : [{ codigo: 'PEND', nombre: 'Pendiente catálogo', codigoCircuito: 'N/A', codigoVuelta: 'N/A', tipo: 'recepcion', subtipo: 'solidos', destino: 'N/A', descripcion: 'Sin catálogo cargado.' } as MasterCircuitItem]
    const baseEntryByGroup: Record<MasterCircuitItem['tipo'], number> = {
      recepcion: 360,
      despacho: 540,
      movimiento_interno: 720,
    }
    const rawScatter = Array.from({ length: 50 }).map((_, idx) => {
      const circuit = source[idx % source.length]
      const status = idx % 10 === 0 ? 'Anómalos' : idx % 3 === 0 ? 'Variaciones operativas' : 'Circuitos completos'
      const baseEntry = baseEntryByGroup[circuit.tipo]
      const jitter = ((idx * 17) % 85) - 40
      const statusPenalty = status === 'Anómalos' ? 35 : status === 'Variaciones operativas' ? 18 : 0
      return {
        id: idx + 1,
        plate: `SIM-${String(idx + 1).padStart(3, '0')}`,
        entryTime: Math.max(300, Math.min(960, baseEntry + jitter + (idx % 4) * 20)),
        cycleMinutes: 48 + (idx % 8) * 11 + statusPenalty + (circuit.subtipo === 'liquidos' ? 14 : 0),
        status,
        color: '#64748b',
        circuitCode: circuit.codigo,
        circuitName: circuit.nombre,
        cir: circuit.codigoCircuito,
        vue: circuit.codigoVuelta,
        description: circuit.descripcion,
        circuitType: circuit.tipo,
      }
    })
    const sortedCycles = rawScatter.map((s) => s.cycleMinutes).sort((a, b) => a - b)
    const lowThreshold = sortedCycles[Math.floor(sortedCycles.length * 0.33)] ?? 80
    const highThreshold = sortedCycles[Math.floor(sortedCycles.length * 0.66)] ?? 130
    const scatter = rawScatter.map((item) => ({
      ...item,
      color:
        item.cycleMinutes <= lowThreshold
          ? '#22c55e' // rapido
          : item.cycleMinutes >= highThreshold
            ? '#ef4444' // lento
            : '#f59e0b', // medio
    }))
    const classification = [
      { name: 'Circuitos completos', value: scatter.filter((s) => s.status === 'Circuitos completos').length, color: '#22c55e' },
      { name: 'Variaciones operativas', value: scatter.filter((s) => s.status === 'Variaciones operativas').length, color: '#f59e0b' },
      { name: 'Anómalos', value: scatter.filter((s) => s.status === 'Anómalos').length, color: '#ef4444' },
    ]
    const validBars = source.map((circuit) => ({
      key: circuit.codigo,
      label: circuit.nombre,
      cir: circuit.codigoCircuito,
      vue: circuit.codigoVuelta,
      descripcion: circuit.descripcion,
      tipo: circuit.tipo,
      count: scatter.filter((s) => s.circuitCode === circuit.codigo && s.status !== 'Anómalos').length,
      barColor:
        circuit.tipo === 'recepcion'
          ? '#2563eb' // recepcion/descarga
          : circuit.tipo === 'despacho'
            ? '#16a34a' // despacho/carga
            : '#f97316', // transile/mov interno
    })).sort((a, b) => b.count - a.count)
    return { scatter, classification, validBars, lowThreshold, highThreshold }
  }, [circuits])

  const rows = useMemo(() => {
    const now = Date.now()
    const msByPreset: Record<PeriodPreset, number> = {
      last_day: 24 * 60 * 60 * 1000,
      last_week: 7 * 24 * 60 * 60 * 1000,
      last_month: 30 * 24 * 60 * 60 * 1000,
    }
    const threshold = now - msByPreset[periodPreset]
    return historicalTrips
      .filter((trip) => trip.siteId === siteId)
      .filter((trip) => new Date(trip.egresoAt).getTime() >= threshold)
      .filter((trip) => !query || trip.plate.toLowerCase().includes(query.toLowerCase()))
      .filter((trip) => !circuitFilter || trip.circuitoFinal.toLowerCase().includes(circuitFilter.toLowerCase()))
      .sort((a, b) => new Date(b.egresoAt).getTime() - new Date(a.egresoAt).getTime())
  }, [historicalTrips, siteId, periodPreset, query, circuitFilter])

  const enrichedRows = useMemo(() => {
    const byCode = new Map(circuits.map((c) => [c.codigo.toUpperCase(), c]))
    return rows.map((row) => {
      const normalized = row.circuitoFinal.toUpperCase().replace(/^E0/, 'E').replace(/^B0/, 'B')
      const circuit = byCode.get(normalized)
      return {
        ...row,
        catalogCode: circuit?.codigo ?? row.circuitoFinal,
        catalogName: circuit?.nombre ?? 'Sin catálogo',
        cir: circuit?.codigoCircuito ?? 'N/A',
        vue: circuit?.codigoVuelta ?? 'N/A',
        descripcion: circuit?.descripcion ?? 'Sin descripción disponible',
      }
    })
  }, [rows, circuits])

  const periodSummary = useMemo(() => {
    const totalTrips = enrichedRows.length
    const avgDuration = totalTrips > 0 ? Math.round(enrichedRows.reduce((acc, row) => acc + row.durationMinutes, 0) / totalTrips) : 0
    const totalAlerts = enrichedRows.reduce((acc, row) => acc + row.alerts.length, 0)
    return { totalTrips, avgDuration, totalAlerts }
  }, [enrichedRows])

  const periodLabel = periodPreset === 'last_day' ? 'Último día' : periodPreset === 'last_week' ? 'Última semana' : 'Último mes'

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Histórico operativo</h2>
            <p className="text-sm text-slate-500">
              {mode === 'stats' ? 'Analítica histórica por operación.' : 'Registro cronológico filtrado por tiempo.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
              Período: <strong className="text-slate-800">{periodLabel}</strong>
            </span>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 xl:grid-cols-[420px_auto_auto_auto_1fr_1fr]">
          <div className="flex flex-wrap gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            {SITES.map((site) => {
              const isActive = site.id === siteId
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => onChangeSite(site.id)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                    isActive
                      ? 'border border-blue-200 bg-blue-50 text-blue-700'
                      : 'border border-transparent bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {site.name}
                </button>
              )
            })}
          </div>
            <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs">
              <button
                type="button"
              onClick={() => setPeriodPreset('last_day')}
              className={`rounded px-2 py-1 ${periodPreset === 'last_day' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600'}`}
              >
              Último día
              </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('last_week')}
              className={`rounded px-2 py-1 ${periodPreset === 'last_week' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600'}`}
            >
              Última semana
            </button>
            <button
              type="button"
              onClick={() => setPeriodPreset('last_month')}
              className={`rounded px-2 py-1 ${periodPreset === 'last_month' ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600'}`}
            >
              Último mes
            </button>
          </div>
          {mode === 'records' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por patente"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              />
              <input
                value={circuitFilter}
                onChange={(e) => setCircuitFilter(e.target.value)}
                placeholder="Filtrar por circuito"
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
              />
            </>
          )}
        </div>

        {mode === 'records' && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="text-slate-500">Recorridos</div>
              <div className="text-base font-semibold text-slate-900">{periodSummary.totalTrips}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="text-slate-500">Duración promedio</div>
              <div className="text-base font-semibold text-slate-900">{periodSummary.avgDuration} min</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="text-slate-500">Alertas</div>
              <div className="text-base font-semibold text-slate-900">{periodSummary.totalAlerts}</div>
            </div>
          </div>
        )}
      </section>

      {mode === 'stats' && (
        <section className="space-y-3">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_0.8fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Puntos por camión (mock 50)</h3>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Tiempo bajo</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Tiempo medio</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Tiempo alto</span>
            </div>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <XAxis type="number" dataKey="entryTime" name="Ingreso (min)" tick={{ fontSize: 10 }} />
                  <YAxis type="number" dataKey="cycleMinutes" name="Duración (min)" tick={{ fontSize: 10 }} />
                  <ReferenceArea
                    y1={statsMock.lowThreshold}
                    y2={statsMock.highThreshold}
                    fill="#f59e0b"
                    fillOpacity={0.12}
                    ifOverflow="extendDomain"
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as (typeof statsMock.scatter)[number] | undefined
                      if (!p) return null
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md">
                          <div className="font-semibold">{p.plate}</div>
                          <div>{p.circuitCode} · {p.circuitName}</div>
                          <div>{p.cir} / {p.vue}</div>
                          <div>{p.status}</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={statsMock.scatter} shape={(props) => {
                    const p = props.payload as (typeof statsMock.scatter)[number] | undefined
                    return <circle cx={props.cx} cy={props.cy} r={4.5} fill={p?.color ?? '#64748b'} fillOpacity={0.9} />
                  }} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Clasificación</h3>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statsMock.classification} dataKey="value" nameKey="name" outerRadius={78} label={({ name, value }) => `${name}: ${value}`} >
                    {statsMock.classification.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Recorridos válidos (barras horizontales)</h3>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Recepción / Descarga</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" /> Despacho / Carga</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Transile / Mov. interno</span>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statsMock.validBars.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as (typeof statsMock.validBars)[number] | undefined
                      if (!p) return null
                      return (
                        <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md">
                          <div className="font-semibold">{p.key} · {p.label}</div>
                          <div>{p.cir} / {p.vue}</div>
                          <div>{p.descripcion}</div>
                          <div>Count: {p.count}</div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statsMock.validBars.slice(0, 10).map((entry) => (
                      <Cell key={entry.key} fill={entry.barColor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>
      )}

      {mode === 'records' && (
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tabla histórica de recorridos finalizados</h3>
        </div>
        <div className="max-h-[56vh] overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">Patente</th>
                <th className="px-2 py-2 text-left">Código</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-left">CIR / VUE</th>
                <th className="px-2 py-2 text-left">Descripción</th>
                <th className="px-2 py-2 text-left">Ingreso</th>
                <th className="px-2 py-2 text-left">Egreso</th>
                <th className="px-2 py-2 text-left">Duración</th>
                <th className="px-2 py-2 text-left">Secuencia cámaras</th>
                <th className="px-2 py-2 text-left">Alertas</th>
                <th className="px-2 py-2 text-left">Acción</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-500">
                    No hay recorridos para el período y filtros seleccionados.
                  </td>
                </tr>
              )}
              {enrichedRows.map((trip) => (
                <tr key={trip.tripId} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-semibold text-slate-800">{trip.plate}</td>
                  <td className="px-2 py-2 font-semibold">{trip.catalogCode}</td>
                  <td className="px-2 py-2">{trip.catalogName}</td>
                  <td className="px-2 py-2">{trip.cir} / {trip.vue}</td>
                  <td className="max-w-[360px] px-2 py-2 text-[11px] text-slate-600">{trip.descripcion}</td>
                  <td className="px-2 py-2">{new Date(trip.ingresoAt).toLocaleString('es-AR')}</td>
                  <td className="px-2 py-2">{new Date(trip.egresoAt).toLocaleString('es-AR')}</td>
                  <td className="px-2 py-2">{trip.durationMinutes} min</td>
                  <td className="px-2 py-2">{trip.secuenciaCamaras.join(' -> ')}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        trip.alerts.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {trip.alerts.length}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => onViewInModel(trip.plate)}
                      className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                    >
                      Ver recorrido en modelo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </div>
  )
}
