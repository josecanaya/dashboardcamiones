/**
 * Analítica: scatter (tiempos), torta (clasificación), barras (recorridos válidos).
 * Layout compacto, cross-filter Bar → Scatter por path.
 */

import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts'
import type { ScatterShapeProps } from 'recharts'
import { useSite } from '../context/SiteContext'
import { useData } from '../context/DataContext'
import {
  selectScatterPoints,
  selectScatterStats,
  selectPieData,
  selectValidPathsBar,
  filterVisitsByStatus,
  type ScatterPoint,
  type PieSegment,
  type BarItem,
  type DisplayStatus,
  type ScatterColorKey,
} from '../engine'
import type { ReconstructedVisit } from '../domain/events'

const STATUS_COLOR: Record<ScatterColorKey, string> = {
  PERFECT: '#22c55e',
  VALID: '#eab308',
  INVALID: '#ef4444',
  OPEN: '#94a3b8',
}

interface AnalyticsPageProps {
  onOpenDetail?: (visit: ReconstructedVisit) => void
  onSimulate?: (visit: ReconstructedVisit) => void
}

export function AnalyticsPage({ onOpenDetail, onSimulate }: AnalyticsPageProps) {
  const { siteId } = useSite()
  const { getVisitsBySite, lastProcessedAt } = useData()

  const [pieFilter, setPieFilter] = useState<DisplayStatus | null>(null)
  const [showP95, setShowP95] = useState(false)
  const [selectedPathKey, setSelectedPathKey] = useState<string | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<ScatterPoint | null>(null)

  const siteVisits = useMemo(() => getVisitsBySite(siteId), [getVisitsBySite, siteId])
  const filteredVisits = useMemo(
    () => filterVisitsByStatus(siteVisits, pieFilter),
    [siteVisits, pieFilter]
  )

  const scatterPointsAll = useMemo(() => selectScatterPoints(filteredVisits), [filteredVisits])
  const scatterPointsForPath = useMemo(() => {
    if (!selectedPathKey) return []
    const allPoints = selectScatterPoints(siteVisits)
    return allPoints.filter((p) => p.pathKey === selectedPathKey)
  }, [siteVisits, selectedPathKey])
  const scatterPoints = selectedPathKey ? scatterPointsForPath : scatterPointsAll
  const scatterStats = useMemo(() => selectScatterStats(scatterPoints), [scatterPoints])
  const refLineValue = showP95 ? scatterStats.p95 : scatterStats.p50
  const yMax = useMemo(() => {
    if (scatterPoints.length === 0) return 120
    const maxY = Math.max(...scatterPoints.map((p) => p.yMinutes))
    return Math.min(50 * 60, Math.max(60, Math.ceil(Math.max(maxY, refLineValue) * 1.2)))
  }, [scatterPoints, refLineValue])

  const pieDataAll = useMemo(() => selectPieData(siteVisits), [siteVisits])
  const barData = useMemo(() => selectValidPathsBar(siteVisits), [siteVisits])
  const selectedPathDisplay = useMemo(
    () => barData.find((b) => b.path === selectedPathKey)?.pathDisplay ?? selectedPathKey ?? '',
    [barData, selectedPathKey]
  )

  const handleSimulate = (visit: ReconstructedVisit) => onSimulate?.(visit)

  if (!lastProcessedAt) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        Cargá datos primero con el botón <strong>Cargar archivo</strong> en el header.
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-120px)] flex gap-3 min-h-0">
      {/* Columna izquierda (2/3): Scatter + Bar */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {/* Scatter */}
        <section className="flex-1 min-h-0 rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col min-w-0">
          <div className="shrink-0 px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-slate-700">Tiempos por visita</h2>
              {selectedPathKey && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-800 px-2 py-0.5 text-xs">
                  Filtro: {selectedPathDisplay}
                  <button
                    type="button"
                    onClick={() => setSelectedPathKey(null)}
                    className="hover:bg-primary-200 rounded p-0.5"
                    aria-label="Quitar filtro"
                  >
                    ✕
                  </button>
                </span>
              )}
              <span className="text-xs text-slate-500">
                {scatterPoints.length} visita{scatterPoints.length !== 1 ? 's' : ''}
              </span>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={showP95}
                onChange={(e) => setShowP95(e.target.checked)}
              />
              p50 / p95
            </label>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <p className="text-xs text-slate-500 mb-1">
              Eje X: hora ingreso (GATE_CHECKIN). Eje Y: cycle time (min). Solo Perfectos + Válidos.
            </p>
            <div className="flex gap-3 mb-1 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Perfectos
              </span>
              <span className="inline-flex items-center gap-1 text-xs">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Válidos
              </span>
            </div>
            <div className="h-[calc(100%-3rem)] min-h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 24, bottom: 12, left: 12 }}>
                  <XAxis
                    type="number"
                    dataKey="entryTimeMinutes"
                    name="Hora ingreso"
                    domain={[0, 1440]}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(min) => {
                      const h = Math.floor(min / 60)
                      const m = Math.floor(min % 60)
                      return `${h}:${m.toString().padStart(2, '0')}`
                    }}
                  />
                  <YAxis type="number" dataKey="yMinutes" name="Min" unit=" min" domain={[0, yMax]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as ScatterPoint | undefined
                      if (!p) return null
                      return (
                        <div className="rounded-lg bg-white border border-slate-200 shadow-lg p-2 text-xs min-w-[180px]">
                          <div className="font-medium">{p.visitId}</div>
                          <div>Patente: {p.plate}</div>
                          <div>Path: {p.pathDisplay || p.path || '—'}</div>
                          <div>Ciclo: {p.yMinutes} min</div>
                          {p.flags.length > 0 && <div className="text-slate-500">Flags: {p.flags.join(', ')}</div>}
                          <div className="mt-1 flex gap-2">
                            {onOpenDetail && (
                              <button type="button" onClick={() => onOpenDetail(p.visit)} className="text-primary-600 hover:underline">
                                Ver detalle
                              </button>
                            )}
                            {onSimulate && (
                              <button type="button" onClick={() => handleSimulate(p.visit)} className="text-primary-600 hover:underline">
                                Simular
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    }}
                  />
                  {showP95 && scatterStats.p95 > 0 && (
                    <ReferenceLine y={scatterStats.p95} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: 'p95', position: 'right', fontSize: 10 }} />
                  )}
                  {scatterStats.p50 > 0 && (
                    <ReferenceLine y={scatterStats.p50} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'p50', position: 'right', fontSize: 10 }} />
                  )}
                  <Scatter
                    data={scatterPoints}
                    fill="#94a3b8"
                    shape={(props: ScatterShapeProps) => {
                      const payload = props.payload as ScatterPoint | undefined
                      const fill = payload ? STATUS_COLOR[payload.colorKey] : '#94a3b8'
                      return (
                        <circle
                          cx={props.cx ?? 0}
                          cy={props.cy ?? 0}
                          r={4}
                          fill={fill}
                          fillOpacity={0.85}
                          style={{ cursor: 'pointer' }}
                        />
                      )
                    }}
                    onClick={(e: unknown) => {
                      const p = (e as { payload?: ScatterPoint })?.payload
                      if (p) setSelectedPoint(p)
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Bar */}
        <section className="h-[260px] shrink-0 rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col min-w-0">
          <div className="shrink-0 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
            <h2 className="text-xs font-semibold text-slate-700">Recorridos válidos (Perfectos + Válidos)</h2>
          </div>
          <div className="flex-1 min-h-0 p-2">
            <p className="text-xs text-slate-500 mb-1">Click en una barra para filtrar el scatter por ese recorrido.</p>
            {barData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500 text-xs">Sin recorridos válidos</div>
            ) : (
              <div className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barData}
                    margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
                    layout="vertical"
                    barCategoryGap="6%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="path" width={72} tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ payload }) => {
                        const item = payload?.[0]?.payload as BarItem | undefined
                        if (!item) return null
                        return (
                          <div className="rounded bg-white border border-slate-200 shadow p-2 text-xs">
                            <div className="font-medium">{item.pathDisplay}</div>
                            <div>Visitas: {item.count}</div>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Visitas"
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                      style={{ cursor: 'pointer' }}
                      onClick={(data: BarItem) => setSelectedPathKey(data?.path ?? null)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Columna derecha (1/3): Torta a altura completa */}
      <section className="w-[420px] shrink-0 h-full rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-0">
        <div className="shrink-0 px-2 py-1.5 border-b border-slate-200 bg-slate-50">
          <h2 className="text-xs font-semibold text-slate-700">Clasificación</h2>
        </div>
        <div className="flex-1 min-h-0 flex items-center gap-4 p-4">
          <div className="h-full min-w-[180px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieDataAll}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                  onClick={(entry: PieSegment) => setPieFilter(pieFilter === entry.status ? null : entry.status)}
                >
                  {pieDataAll.map((seg) => (
                    <Cell key={seg.status} fill={STATUS_COLOR[seg.status]} strokeWidth={pieFilter === seg.status ? 2 : 1} stroke="#334155" />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => [value ?? 0, 'visitas']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-slate-600 flex flex-col gap-0.5 overflow-y-auto min-w-0">
            {pieDataAll.map((seg) => (
              <div key={seg.status} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[seg.status] }} />
                <span>{seg.name}: {seg.value}</span>
              </div>
            ))}
            {pieFilter && (
              <button type="button" onClick={() => setPieFilter(null)} className="text-primary-600 hover:underline text-left">
                Quitar filtro
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Popup visita (patente + recorrido) al hacer clic en un punto */}
      {selectedPoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="visit-popup-title">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedPoint(null)} aria-hidden />
          <div className="relative z-10 rounded-xl bg-white shadow-xl border border-slate-200 p-6 min-w-[280px] max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="visit-popup-title" className="text-sm font-semibold text-slate-500 mb-3">Visita seleccionada</h2>
                <div className="text-2xl font-bold text-slate-800 tracking-wide">
                  {selectedPoint.plate}
                </div>
                <div className="mt-2 text-sm text-slate-500 font-mono">
                  {selectedPoint.pathDisplay || selectedPoint.path || '—'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPoint(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {onOpenDetail && (
                <button
                  type="button"
                  onClick={() => { onOpenDetail(selectedPoint.visit); setSelectedPoint(null) }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Ver detalle
                </button>
              )}
              {onSimulate && (
                <button
                  type="button"
                  onClick={() => { handleSimulate(selectedPoint.visit); setSelectedPoint(null) }}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
                >
                  Simular recorrido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
