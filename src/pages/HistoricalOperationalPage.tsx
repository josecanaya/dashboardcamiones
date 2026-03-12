import { useEffect, useMemo, useState } from 'react'
import { IfcLoadingOverlay } from '../components/IfcLoadingOverlay'
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
  Legend,
} from 'recharts'
import type { SiteId } from '../domain/sites'
import { SITES } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { useHistoricalPageData } from '../hooks/useHistoricalPageData'
import { getCircuitsForSite, getCodigoBase, findCircuitByCode, type MasterCircuitItem } from '../data/masterCircuitCatalog'

/**
 * Datos: historico_recorridos.json en /mock-data/live/{ricardone|san_lorenzo|avellaneda}/
 * Cargados por LogisticsOpsContext -> loadLogisticsSnapshot
 */

interface HistoricalOperationalPageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
  mode?: 'stats' | 'records'
  onViewInModel: (plate: string) => void
  onModeChange?: (mode: 'stats' | 'records') => void
}

type PeriodPreset = 'last_day' | 'last_week' | 'last_month'

interface StatsTruckPopupInfo {
  plate: string
  cargoType: string
  driverName: string
  lastCheckpoint: string
  operationType: 'RECEPCION' | 'DESPACHANDO' | 'TRANSILE'
  assignedCircuitPrefix: string
  assignedCircuitLabel: string
  cameraCaptures: Array<{ cameraId: string; imageUrl: string; captureLabel: string }>
}

export function HistoricalOperationalPage({ siteId, onChangeSite, mode = 'stats', onViewInModel, onModeChange }: HistoricalOperationalPageProps) {
  const { historicalTrips } = useLogisticsOps()
  const [query, setQuery] = useState('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedStatsTruck, setSelectedStatsTruck] = useState<StatsTruckPopupInfo | null>(null)
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string | null>(null)
  const [selectedCircuitCode, setSelectedCircuitCode] = useState<string | null>(null)
  const [enterLoading, setEnterLoading] = useState(true)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [drilledWeek, setDrilledWeek] = useState<number | null>(null)
  const [drilledDay, setDrilledDay] = useState<number | null>(null)

  const withChartsLoading = (fn: () => void) => {
    setChartsLoading(true)
    fn()
    setTimeout(() => setChartsLoading(false), 500)
  }

  const effectiveView = useMemo(() => {
    if (periodPreset === 'last_day') return 'day' as const
    if (periodPreset === 'last_week') return drilledDay ? ('day' as const) : ('week' as const)
    if (periodPreset === 'last_month') {
      if (drilledWeek && drilledDay) return 'day' as const
      if (drilledWeek) return 'week' as const
      return 'month' as const
    }
    return 'week' as const
  }, [periodPreset, drilledWeek, drilledDay])

  const { enrichedRows, refData, effectiveDate } = useHistoricalPageData({
    historicalTrips,
    siteId,
    effectiveView,
    periodPreset,
    drilledWeek,
    drilledDay,
    selectedDate,
    query,
  })

  const circuits = useMemo(() => {
    const siteCircuits = getCircuitsForSite(siteId)
    if (siteCircuits.length === 0) return getCircuitsForSite('ricardone')
    return siteCircuits
  }, [siteId])

  useEffect(() => {
    setEnterLoading(true)
    const t = setTimeout(() => setEnterLoading(false), 1200)
    return () => clearTimeout(t)
  }, [mode])

  useEffect(() => {
    setSelectedDate(refData.refFecha)
  }, [refData.refFecha, siteId])

  const statsFromTrips = useMemo(() => {
    const allCircuits = circuits.length > 0 ? circuits : [{ codigo: 'PEND', nombre: 'Pendiente catálogo', codigoCircuito: 'N/A', codigoVuelta: 'N/A', tipo: 'recepcion' as const, subtipo: 'solidos', destino: 'N/A', descripcion: 'Sin catálogo cargado.' } as MasterCircuitItem]
    const source = allCircuits.filter((c) => c.codigo.endsWith('V0') || c.codigo === 'PEND')
    const statusMap: Record<string, string> = {
      VALIDADO: 'Circuitos completos',
      CON_OBSERVACIONES: 'Variaciones operativas',
      ANOMALO: 'Anómalos',
    }
    const dayMs = 24 * 60 * 60 * 1000
    const [sy, sm] = effectiveDate.split('-').map(Number)
    const refDateMs = effectiveView === 'month' ? new Date(sy, sm, 0).getTime() : new Date(effectiveDate + 'T12:00:00Z').getTime()

    const scatter = enrichedRows.map((row, idx) => {
      const status = statusMap[row.estadoFinal] ?? 'Circuitos completos'
      const circuit = source.find((c) => c.codigo === (row.catalogCode ?? row.circuitoFinal)) ?? source[0]
      const operationType = circuit.tipo === 'recepcion' ? 'RECEPCION' : circuit.tipo === 'despacho' ? 'DESPACHANDO' : 'TRANSILE'
      const cargoType = circuit.tipo === 'recepcion' ? 'Descarga granel' : circuit.tipo === 'despacho' ? 'Carga despacho' : 'Movimiento interno'
      const lastCheckpoint = circuit.tipo === 'recepcion' ? 'Playa descarga' : circuit.tipo === 'despacho' ? 'Cargadero' : 'Transferencia'
      const secuencia = (row.secuenciaCamaras ?? []).slice(0, 6)
      const cameraCaptures = secuencia.map((cameraId, cameraIdx) => {
        const isLast = cameraIdx === secuencia.length - 1
        return {
          cameraId,
          captureLabel: isLast ? 'Última cámara' : `Paso ${cameraIdx + 1}`,
          imageUrl: '/ejemplo.png',
        }
      })
      const d = new Date(row.ingresoAt)
      const entryHours = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
      const entryTime = Math.round(entryHours * 100) / 100

      const fecha = row.fecha ?? `${new Date(row.egresoAt).getUTCFullYear()}-${String(new Date(row.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(row.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs

      let xAxisValue: number
      if (effectiveView === 'day') {
        xAxisValue = entryTime
      } else if (effectiveView === 'week') {
        const dayIndex = 7 - daysDiff
        xAxisValue = Math.max(1, Math.min(7, dayIndex)) + entryTime / 24
      } else {
        const weekIndex = Math.floor(daysDiff / 7)
        const weekNum = 5 - weekIndex
        const dayInWeek = daysDiff % 7
        xAxisValue = Math.max(1, Math.min(5, weekNum)) + dayInWeek / 7 + entryTime / 24 / 7
      }

      return {
        id: idx + 1,
        plate: row.plate,
        entryTime,
        xAxisValue,
        fecha,
        cycleMinutes: row.durationMinutes,
        status,
        color: '#64748b',
        circuitCode: row.catalogCode ?? row.circuitoFinal,
        circuitName: row.catalogName ?? circuit.nombre,
        cir: row.cir ?? circuit.codigoCircuito,
        vue: row.vue ?? circuit.codigoVuelta,
        description: row.descripcion ?? circuit.descripcion,
        circuitType: circuit.tipo,
        popupInfo: {
          plate: row.plate,
          cargoType,
          driverName: row.plate,
          lastCheckpoint,
          operationType,
          assignedCircuitPrefix: row.catalogCode ?? row.circuitoFinal,
          assignedCircuitLabel: row.catalogName ?? circuit.nombre,
          cameraCaptures: cameraCaptures.length > 0 ? cameraCaptures : [{ cameraId: 'S0', captureLabel: 'Última cámara', imageUrl: '/ejemplo.png' }],
        } as StatsTruckPopupInfo,
      }
    })
    const byXKey = new Map<number, number>()
    for (const p of scatter) {
      const key = Math.round(p.xAxisValue * 100)
      const count = byXKey.get(key) ?? 0
      byXKey.set(key, count + 1)
      if (count > 0) {
        const maxX = effectiveView === 'day' ? 23.99 : effectiveView === 'week' ? 7.99 : 5.99
        p.xAxisValue = Math.min(maxX, p.xAxisValue + count * 0.008)
      }
    }
    const classification = [
      { name: 'Circuitos completos', value: scatter.filter((s) => s.status === 'Circuitos completos').length, color: '#2563eb' },
      { name: 'Variaciones operativas', value: scatter.filter((s) => s.status === 'Variaciones operativas').length, color: '#7c3aed' },
      { name: 'Anómalos', value: scatter.filter((s) => s.status === 'Anómalos').length, color: '#0ea5e9' },
    ]
    const FIXED_GROUPS: Array<{ key: string; label: string; barColor: string; tipo: string; match: (c: MasterCircuitItem) => boolean }> = [
      { key: 'recepcion-solidos', label: 'Recepción / Descargas', barColor: '#2563eb', tipo: 'recepcion', match: (c) => c.tipo === 'recepcion' && c.subtipo === 'solidos' },
      { key: 'recepcion-liquidos', label: 'Recepción líquido', barColor: '#7c3aed', tipo: 'recepcion', match: (c) => c.tipo === 'recepcion' && c.subtipo === 'liquidos' },
      { key: 'despacho-solidos', label: 'Despacho', barColor: '#16a34a', tipo: 'despacho', match: (c) => c.tipo === 'despacho' && c.subtipo === 'solidos' },
      { key: 'despacho-liquidos', label: 'Despacho líquido', barColor: '#7c3aed', tipo: 'despacho', match: (c) => c.tipo === 'despacho' && c.subtipo === 'liquidos' },
      { key: 'movimiento_interno-transile', label: 'Transile', barColor: '#f97316', tipo: 'movimiento_interno', match: (c) => c.tipo === 'movimiento_interno' },
    ]

    const validBars = FIXED_GROUPS.map((group) => {
      const circuitsInGroup = source.filter(group.match)
      const destinoCounts = new Map<string, number>()
      let totalCount = 0
      for (const point of scatter) {
        if (point.status === 'Anómalos') continue
        const circuit = findCircuitByCode(allCircuits, point.circuitCode)
        if (!circuit || !group.match(circuit)) continue
        const destino = circuit.tipo === 'movimiento_interno' ? circuit.nombre : circuit.destino
        destinoCounts.set(destino, (destinoCounts.get(destino) ?? 0) + 1)
        totalCount += 1
      }
      const breakdown = Array.from(destinoCounts.entries())
        .filter(([, n]) => n > 0)
        .map(([destino, count]) => ({ destino, count }))
        .sort((a, b) => b.count - a.count)
      const circuitCodes = circuitsInGroup.flatMap((c) => [
        c.codigo,
        ...(c.codigosEquivalentes ?? []),
      ])
      return {
        key: group.key,
        label: group.label,
        count: totalCount,
        barColor: group.barColor,
        circuitCodes: [...new Set(circuitCodes)],
        breakdown,
      }
    })
    return { scatter, classification, validBars }
  }, [enrichedRows, circuits, effectiveView, effectiveDate, refData])

  const selectedCircuitCodes = useMemo(() => {
    if (!selectedCircuitCode) return null
    const bar = statsFromTrips.validBars.find((b) => b.key === selectedCircuitCode)
    return bar && 'circuitCodes' in bar ? (bar as { circuitCodes: string[] }).circuitCodes : [selectedCircuitCode]
  }, [selectedCircuitCode, statsFromTrips.validBars])

  const scatterFiltered = useMemo(() => {
    return statsFromTrips.scatter.filter((point) => {
      if (selectedStatusFilter && point.status !== selectedStatusFilter) return false
      if (selectedCircuitCodes) {
        const pointBase = getCodigoBase(point.circuitCode)
        const matches = selectedCircuitCodes.some(
          (cc) => point.circuitCode === cc || getCodigoBase(cc) === pointBase
        )
        if (!matches) return false
      }
      return true
    })
  }, [statsFromTrips.scatter, selectedStatusFilter, selectedCircuitCodes])

  const centralBand = useMemo(() => {
    if (scatterFiltered.length === 0) return { y1: 7 * 60, y2: 11 * 60, center: 9 * 60 }
    const sorted = [...scatterFiltered].map((p) => p.cycleMinutes).sort((a, b) => a - b)
    const center = sorted[Math.floor(sorted.length / 2)] ?? 9 * 60
    const halfWindow = 10 // franja central de 20 minutos (10 min a cada lado del centro)
    return {
      y1: Math.max(0, center - halfWindow),
      y2: Math.min(36 * 60, center + halfWindow),
      center,
    }
  }, [scatterFiltered])

  const yAxisDomain = useMemo(() => {
    const dataMax = scatterFiltered.length > 0 ? Math.max(...scatterFiltered.map((p) => p.cycleMinutes)) : 0
    const minMax = 2 * 60 // mínimo 2 h para que se vea algo
    const max = Math.max(minMax, dataMax * 1.15) // 15% margen sobre el máximo real
    return [0, max] as [number, number]
  }, [scatterFiltered])

  const scatterWithDynamicColor = useMemo(() => {
    if (scatterFiltered.length === 0) return []
    const { y1, y2 } = centralBand
    return scatterFiltered.map((point) => ({
      ...point,
      color:
        point.cycleMinutes < y1
          ? '#22c55e'
          : point.cycleMinutes <= y2
            ? '#eab308'
            : '#ef4444',
    }))
  }, [scatterFiltered, centralBand])

  useEffect(() => {
    if (effectiveView !== 'day' && selectedStatsTruck) setSelectedStatsTruck(null)
  }, [effectiveView, selectedStatsTruck])

  return (
    <div className="relative min-h-[400px] flex-1 overflow-auto">
      {(enterLoading || chartsLoading) && (
        <div className="absolute inset-0 z-10 rounded-2xl border border-slate-200 bg-white">
          <IfcLoadingOverlay
            variant="inline"
            loadingStage={chartsLoading ? 'Cargando datos...' : mode === 'stats' ? 'Cargando estadísticas...' : 'Cargando registros...'}
          />
        </div>
      )}
      <div className="space-y-3">
      {onModeChange && (
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onModeChange('stats')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'stats' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Estadísticas
          </button>
          <button
            type="button"
            onClick={() => onModeChange('records')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${mode === 'records' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            Registros
          </button>
        </div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100/80 p-1">
            {SITES.map((site) => {
              const isActive = site.id === siteId
              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => withChartsLoading(() => onChangeSite(site.id))}
                  className={`rounded-md px-4 py-2 text-base font-bold transition ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-md'
                      : 'bg-transparent text-slate-500 hover:bg-slate-200/80 hover:text-slate-700'
                  }`}
                >
                  {site.name}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              <button
                type="button"
                onClick={() => withChartsLoading(() => { setPeriodPreset('last_day'); setDrilledWeek(null); setDrilledDay(null) })}
                className={`rounded-md px-2.5 py-1 ${periodPreset === 'last_day' ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Día
              </button>
              <button
                type="button"
                onClick={() => withChartsLoading(() => { setPeriodPreset('last_week'); setDrilledWeek(null); setDrilledDay(null) })}
                className={`rounded-md px-2.5 py-1 ${periodPreset === 'last_week' ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => withChartsLoading(() => { setPeriodPreset('last_month'); setDrilledWeek(null); setDrilledDay(null) })}
                className={`rounded-md px-2.5 py-1 ${periodPreset === 'last_month' ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Mes
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <span>Fecha:</span>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => withChartsLoading(() => setSelectedDate(e.target.value))}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
          </div>
          {mode === 'records' && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por patente"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
          )}
        </div>

      </section>

      {mode === 'stats' && (
        <section className="space-y-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="font-semibold text-slate-700">
                Camiones x {effectiveView === 'day' ? 'día' : effectiveView === 'week' ? 'semana' : 'mes'}: {scatterWithDynamicColor.length}
              </span>
              {effectiveView === 'month' && (
                <>
                  <span className="text-slate-400">|</span>
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => withChartsLoading(() => setDrilledWeek(w))}
                      className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      S{w}
                    </button>
                  ))}
                </>
              )}
              {effectiveView === 'week' && (
                <>
                  <span className="text-slate-400">|</span>
                  {drilledWeek && (
                    <button
                      type="button"
                      onClick={() => withChartsLoading(() => { setDrilledWeek(null); setDrilledDay(null) })}
                      className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200"
                    >
                      ← Volver
                    </button>
                  )}
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => withChartsLoading(() => setDrilledDay(d))}
                      className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                    >
                      D{d}
                    </button>
                  ))}
                </>
              )}
              {effectiveView === 'day' && (drilledDay || drilledWeek) && (
                <button
                  type="button"
                  onClick={() => withChartsLoading(() => {
                    if (drilledDay) setDrilledDay(null)
                    else if (drilledWeek) { setDrilledWeek(null); setDrilledDay(null) }
                  })}
                  className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200"
                >
                  ← Volver
                </button>
              )}
            </div>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <XAxis
                    type="number"
                    dataKey="xAxisValue"
                    name={effectiveView === 'day' ? 'Hora de ingreso' : effectiveView === 'week' ? 'Día' : 'Semana'}
                    unit={effectiveView === 'day' ? 'h' : undefined}
                    domain={effectiveView === 'day' ? [0, 24] : effectiveView === 'week' ? [1, 8] : [1, 6]}
                    tick={{ fontSize: 10 }}
                    tickFormatter={effectiveView === 'day' ? (v) => `${Math.round(Number(v))}h` : effectiveView === 'week' ? (v) => `D${Math.round(Number(v))}` : (v) => `S${Math.round(Number(v))}`}
                  />
                  <YAxis
                    type="number"
                    dataKey="cycleMinutes"
                    name="Tiempo en planta"
                    unit="h"
                    domain={yAxisDomain}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `${Math.round(Number(value) / 60)}h`}
                  />
                  <ReferenceArea
                    y1={centralBand.y1}
                    y2={centralBand.y2}
                    fill="#eab308"
                    fillOpacity={0.15}
                    ifOverflow="extendDomain"
                  />
                  {effectiveView === 'day' && (
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        const p = payload?.[0]?.payload as (typeof statsFromTrips.scatter)[number] | undefined
                        if (!p) return null
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs shadow-md">
                            <div className="font-semibold">{p.plate}</div>
                            <div className="text-slate-500 text-[10px]">Ver más</div>
                          </div>
                        )
                      }}
                    />
                  )}
                  <Scatter
                    data={scatterWithDynamicColor}
                    isAnimationActive={false}
                    cursor={effectiveView === 'day' ? 'pointer' : 'default'}
                    onClick={effectiveView === 'day'
                      ? (event) => {
                          const point = (event as { payload?: StatsTruckPopupInfo & { popupInfo?: StatsTruckPopupInfo } } | undefined)?.payload
                          const popupInfo = point?.popupInfo
                          if (!popupInfo) return
                          setSelectedStatsTruck(popupInfo)
                        }
                      : undefined}
                    shape={(props: { cx?: number; cy?: number; payload?: { color?: string; plate?: string }; fill?: string }) => {
                      const p = props.payload
                      const fill = props.fill ?? p?.color ?? '#64748b'
                      const n = scatterWithDynamicColor.length
                      const r = n <= 100 ? 5 : n <= 500 ? 3 : n <= 2000 ? 2 : n <= 7000 ? 1.5 : 1
                      const canSelect = effectiveView === 'day' && p?.plate
                      return (
                        <circle
                          cx={props.cx}
                          cy={props.cy}
                          r={r}
                          fill={fill}
                          fillOpacity={n > 2000 ? 0.7 : 0.9}
                          stroke={n > 2000 ? 'none' : '#ffffff'}
                          strokeWidth={n > 2000 ? 0 : 1}
                          style={{ cursor: canSelect ? 'pointer' : 'default' }}
                        />
                      )
                    }}
                  >
                    {scatterWithDynamicColor.map((entry, i) => (
                      <Cell key={i} fill={entry.color ?? '#64748b'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </article>

          <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.6fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Clasificación</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statsFromTrips.classification}
                      dataKey="value"
                      nameKey="name"
                      cx="38%"
                      cy="48%"
                      outerRadius={58}
                      label={false}
                      labelLine={false}
                      onClick={(data) => {
                        const name = (data as { name?: string } | undefined)?.name
                        if (!name) return
                        setSelectedStatusFilter((prev) => (prev === name ? null : name))
                      }}
                    >
                      {statsFromTrips.classification.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          fillOpacity={selectedStatusFilter && selectedStatusFilter !== entry.name ? 0.3 : 1}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}`, 'Cantidad']} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 10, lineHeight: '16px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Recorridos válidos (barras horizontales)</h3>
              <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Recepción</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" /> Despacho</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Transile</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-600" /> Líquidos</span>
              </div>
              <div className="max-h-[500px] min-h-[220px] overflow-y-auto">
                <div style={{ height: Math.round(5 * 36 * 1.25), minWidth: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsFromTrips.validBars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ payload }) => {
                        const p = payload?.[0]?.payload as (typeof statsFromTrips.validBars)[number] | undefined
                        if (!p) return null
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md min-w-[180px]">
                            <div className="font-semibold text-slate-800">{p.label}</div>
                            <div className="mt-1 text-slate-600">Total: {p.count}</div>
                            {p.breakdown && p.breakdown.length > 0 && (
                              <div className="mt-2 border-t border-slate-100 pt-2">
                                <div className="text-[10px] font-medium text-slate-500 uppercase">Por destino</div>
                                {p.breakdown.map(({ destino, count }) => (
                                  <div key={destino} className="flex justify-between gap-4 text-slate-700">
                                    <span>{destino}</span>
                                    <span>{count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} minPointSize={6}>
                      {statsFromTrips.validBars.map((entry) => (
                        <Cell
                          key={entry.key}
                          fill={entry.barColor}
                          fillOpacity={selectedCircuitCode && selectedCircuitCode !== entry.key ? 0.35 : 1}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedCircuitCode((prev) => (prev === entry.key ? null : entry.key))}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </article>
          </section>
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
                <th className="px-2 py-2 text-left">Descripción</th>
                <th className="px-2 py-2 text-left">Ingreso</th>
                <th className="px-2 py-2 text-left">Egreso</th>
                <th className="px-2 py-2 text-left">Duración</th>
                <th className="px-2 py-2 text-left">Secuencia cámaras</th>
                <th className="px-2 py-2 text-left">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {enrichedRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    No hay recorridos para el período y filtros seleccionados.
                  </td>
                </tr>
              )}
              {enrichedRows.map((trip) => (
                <tr key={trip.tripId} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-semibold text-slate-800">{trip.plate}</td>
                  <td className="px-2 py-2 font-semibold">{trip.catalogCode}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {selectedStatsTruck && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="relative w-[980px] max-w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedStatsTruck(null)}
              className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              aria-label="Cerrar panel de camion"
            >
              ×
            </button>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_390px]">
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-slate-700">
                <div className="col-span-2">
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Patente</div>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold leading-none text-blue-700">{selectedStatsTruck.plate}</div>
                    <div
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        selectedStatsTruck.operationType === 'RECEPCION'
                          ? 'bg-sky-100 text-sky-700'
                          : selectedStatsTruck.operationType === 'DESPACHANDO'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-violet-100 text-violet-700'
                      }`}
                    >
                      {selectedStatsTruck.operationType}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Tipo de carga</div>
                  <div className="text-sm font-semibold text-slate-900">{selectedStatsTruck.cargoType}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Última check</div>
                  <div className="text-sm font-semibold text-slate-900">{selectedStatsTruck.lastCheckpoint}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Chofer</div>
                  <div className="text-xs font-medium text-slate-900">{selectedStatsTruck.driverName}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">Circuito activo</div>
                  <div className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                    {selectedStatsTruck.assignedCircuitPrefix}
                  </div>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Secuencia de cámaras ({selectedStatsTruck.assignedCircuitLabel})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedStatsTruck.cameraCaptures.map((capture, idx) => (
                      <div
                        key={`${capture.cameraId}-${idx}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-800"
                      >
                        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-emerald-500 bg-emerald-500 text-[9px] font-bold text-white">✓</span>
                        <span className="font-semibold">{capture.cameraId}</span>
                        <span className="opacity-70">#{idx + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="md:justify-self-end">
                <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-900/95 shadow-lg ring-1 ring-slate-200/70">
                  <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      Última cámara que lo registró · {selectedStatsTruck.cameraCaptures[selectedStatsTruck.cameraCaptures.length - 1]?.cameraId ?? 'S0'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      REC
                    </span>
                  </div>
                  <div className="flex aspect-video min-h-[176px] items-center justify-center bg-slate-950">
                    <img
                      src={selectedStatsTruck.cameraCaptures[selectedStatsTruck.cameraCaptures.length - 1]?.imageUrl}
                      alt={`Camara ${selectedStatsTruck.plate}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="border-t border-slate-700 bg-slate-950/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-200">
                    ULTIMA FOTO TOMADA
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
