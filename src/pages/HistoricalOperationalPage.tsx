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
import { getCircuitsForSite, type MasterCircuitItem } from '../data/masterCircuitCatalog'

interface HistoricalOperationalPageProps {
  siteId: SiteId
  onChangeSite: (siteId: SiteId) => void
  mode?: 'stats' | 'records'
  onViewInModel: (plate: string) => void
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

function buildCameraSnapshotDataUrl(
  plate: string,
  cargoType: string,
  lastCheckpoint: string,
  cameraId = 'S0',
  captureLabel = 'Captura'
): string {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#334155"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#g)"/>
    <rect x="18" y="18" width="604" height="324" rx="10" fill="#0b1220" stroke="#64748b" stroke-width="2"/>
    <text x="32" y="48" fill="#93c5fd" font-size="18" font-family="Arial, sans-serif">${cameraId}</text>
    <text x="32" y="86" fill="#e2e8f0" font-size="24" font-family="Arial, sans-serif">${plate}</text>
    <text x="32" y="120" fill="#cbd5e1" font-size="16" font-family="Arial, sans-serif">Carga: ${cargoType}</text>
    <text x="32" y="148" fill="#cbd5e1" font-size="16" font-family="Arial, sans-serif">Ultimo check: ${lastCheckpoint}</text>
    <text x="32" y="174" fill="#93c5fd" font-size="14" font-family="Arial, sans-serif">${captureLabel}</text>
    <circle cx="566" cy="54" r="8" fill="#ef4444"/>
    <text x="584" y="60" fill="#fecaca" font-size="12" font-family="Arial, sans-serif">REC</text>
    <rect x="210" y="190" width="220" height="95" rx="8" fill="#1e293b" stroke="#60a5fa" stroke-width="2"/>
    <text x="320" y="247" text-anchor="middle" fill="#bfdbfe" font-size="30" font-family="Arial, sans-serif">${plate}</text>
  </svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function HistoricalOperationalPage({ siteId, onChangeSite, mode = 'stats', onViewInModel }: HistoricalOperationalPageProps) {
  const { historicalTrips } = useLogisticsOps()
  const [query, setQuery] = useState('')
  const [circuitFilter, setCircuitFilter] = useState('')
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('last_week')
  const [selectedStatsTruck, setSelectedStatsTruck] = useState<StatsTruckPopupInfo | null>(null)
  const [selectedStatsCaptureIndex, setSelectedStatsCaptureIndex] = useState(0)
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

  useEffect(() => {
    setEnterLoading(true)
    const t = setTimeout(() => setEnterLoading(false), 1200)
    return () => clearTimeout(t)
  }, [mode])

  const circuits = useMemo(() => {
    const siteCircuits = getCircuitsForSite(siteId)
    if (siteCircuits.length === 0) return getCircuitsForSite('ricardone')
    return siteCircuits
  }, [siteId])

  const refData = useMemo(() => {
    const siteTrips = historicalTrips.filter((trip) => trip.siteId === siteId)
    const maxEgreso = siteTrips.length > 0
      ? Math.max(...siteTrips.map((t) => new Date(t.egresoAt).getTime()))
      : Date.now()
    const refDate = new Date(maxEgreso)
    const refFecha = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, '0')}-${String(refDate.getUTCDate()).padStart(2, '0')}`
    return { maxEgreso, refDate, refFecha }
  }, [historicalTrips, siteId])

  const rows = useMemo(() => {
    const siteTrips = historicalTrips.filter((trip) => trip.siteId === siteId)
    const { refFecha } = refData
    const dayMs = 24 * 60 * 60 * 1000
    const refDateMs = new Date(refFecha + 'T12:00:00Z').getTime()

    const passesFilter = (trip: (typeof siteTrips)[0]) => {
      const fecha = trip.fecha ?? `${new Date(trip.egresoAt).getUTCFullYear()}-${String(new Date(trip.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(trip.egresoAt).getUTCDate()).padStart(2, '0')}`
      const tripDateMs = new Date(fecha + 'T12:00:00Z').getTime()
      const daysDiff = (refDateMs - tripDateMs) / dayMs

      if (effectiveView === 'day') {
        if (periodPreset === 'last_day') return fecha === refFecha
        if (periodPreset === 'last_week' && drilledDay) {
          return daysDiff >= drilledDay - 1 && daysDiff < drilledDay
        }
        if (periodPreset === 'last_month' && drilledWeek && drilledDay) {
          const weekStart = (4 - drilledWeek) * 7
          return daysDiff >= weekStart + drilledDay - 1 && daysDiff < weekStart + drilledDay
        }
        return fecha === refFecha
      }
      if (effectiveView === 'week') {
        if (periodPreset === 'last_month' && drilledWeek) {
          const weekStart = (4 - drilledWeek) * 7
          return daysDiff >= weekStart && daysDiff < weekStart + 7
        }
        return daysDiff >= 0 && daysDiff <= 7
      }
      return daysDiff >= 0 && daysDiff <= 30
    }

    return siteTrips
      .filter(passesFilter)
      .filter((trip) => !query || trip.plate.toLowerCase().includes(query.toLowerCase()))
      .filter((trip) => !circuitFilter || trip.circuitoFinal.toLowerCase().includes(circuitFilter.toLowerCase()))
      .sort((a, b) => new Date(b.egresoAt).getTime() - new Date(a.egresoAt).getTime())
  }, [historicalTrips, siteId, effectiveView, periodPreset, drilledWeek, drilledDay, query, circuitFilter, refData])

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

  const statsFromTrips = useMemo(() => {
    const source = circuits.length > 0 ? circuits : [{ codigo: 'PEND', nombre: 'Pendiente catálogo', codigoCircuito: 'N/A', codigoVuelta: 'N/A', tipo: 'recepcion' as const, subtipo: 'solidos', destino: 'N/A', descripcion: 'Sin catálogo cargado.' } as MasterCircuitItem]
    const statusMap: Record<string, string> = {
      VALIDADO: 'Circuitos completos',
      CON_OBSERVACIONES: 'Variaciones operativas',
      ANOMALO: 'Anómalos',
    }
    const dayMs = 24 * 60 * 60 * 1000
    const refDateMs = new Date(refData.refFecha + 'T12:00:00Z').getTime()

    const scatter = enrichedRows.map((row, idx) => {
      const status = statusMap[row.estadoFinal] ?? 'Circuitos completos'
      const circuit = source.find((c) => c.codigo === (row.catalogCode ?? row.circuitoFinal)) ?? source[0]
      const operationType = circuit.tipo === 'recepcion' ? 'RECEPCION' : circuit.tipo === 'despacho' ? 'DESPACHANDO' : 'TRANSILE'
      const cargoType = circuit.tipo === 'recepcion' ? 'Descarga granel' : circuit.tipo === 'despacho' ? 'Carga despacho' : 'Movimiento interno'
      const lastCheckpoint = circuit.tipo === 'recepcion' ? 'Playa descarga' : circuit.tipo === 'despacho' ? 'Cargadero' : 'Transferencia'
      const cameraCaptures = (row.secuenciaCamaras ?? []).slice(0, 6).map((cameraId, cameraIdx) => ({
        cameraId,
        captureLabel: `Paso ${cameraIdx + 1}`,
        imageUrl: buildCameraSnapshotDataUrl(row.plate, cargoType, lastCheckpoint, cameraId, `Paso ${cameraIdx + 1}`),
      }))
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
          cameraCaptures: cameraCaptures.length > 0 ? cameraCaptures : [{ cameraId: 'S0', captureLabel: 'Paso 1', imageUrl: buildCameraSnapshotDataUrl(row.plate, cargoType, lastCheckpoint) }],
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
    const validBars = source.map((circuit) => ({
      key: circuit.codigo,
      label: circuit.nombre,
      cir: circuit.codigoCircuito,
      vue: circuit.codigoVuelta,
      descripcion: circuit.descripcion,
      tipo: circuit.tipo,
      count: scatter.filter((s) => s.circuitCode === circuit.codigo && s.status !== 'Anómalos').length,
      barColor: circuit.tipo === 'recepcion' ? '#2563eb' : circuit.tipo === 'despacho' ? '#16a34a' : '#f97316',
    })).sort((a, b) => b.count - a.count)
    return { scatter, classification, validBars }
  }, [enrichedRows, circuits, effectiveView, refData])

  const scatterFiltered = useMemo(() => {
    return statsFromTrips.scatter.filter((point) => {
      if (selectedStatusFilter && point.status !== selectedStatusFilter) return false
      if (selectedCircuitCode && point.circuitCode !== selectedCircuitCode) return false
      return true
    })
  }, [statsFromTrips.scatter, selectedStatusFilter, selectedCircuitCode])

  const centralBand = useMemo(() => {
    if (scatterFiltered.length === 0) return { y1: 7 * 60, y2: 11 * 60, center: 9 * 60 }
    const sorted = [...scatterFiltered].map((p) => p.cycleMinutes).sort((a, b) => a - b)
    const center = sorted[Math.floor(sorted.length / 2)] ?? 9 * 60
    const halfWindow = 2 * 60 // franja de 4 horas
    return {
      y1: Math.max(0, center - halfWindow),
      y2: Math.min(36 * 60, center + halfWindow),
      center,
    }
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
    setSelectedStatsCaptureIndex(0)
  }, [selectedStatsTruck?.plate])

  useEffect(() => {
    if (effectiveView !== 'day' && selectedStatsTruck) setSelectedStatsTruck(null)
  }, [effectiveView, selectedStatsTruck])

  useEffect(() => {
    if (!selectedStatsTruck) return
    const totalSteps = selectedStatsTruck.cameraCaptures.length
    if (totalSteps <= 1) return
    const timer = window.setInterval(() => {
      setSelectedStatsCaptureIndex((prev) => (prev >= totalSteps - 1 ? prev : prev + 1))
    }, 1400)
    return () => window.clearInterval(timer)
  }, [selectedStatsTruck?.plate, selectedStatsTruck?.cameraCaptures.length])

  return (
    <div className="relative min-h-[400px]">
      {(enterLoading || chartsLoading) && (
        <div className="absolute inset-0 z-10 rounded-2xl border border-slate-200 bg-white">
          <IfcLoadingOverlay
            variant="inline"
            loadingStage={chartsLoading ? 'Cargando datos...' : mode === 'stats' ? 'Cargando estadísticas...' : 'Cargando registros...'}
          />
        </div>
      )}
      <div className="space-y-3">
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
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
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
          <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Puntos por camión
              <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-normal normal-case text-slate-700">
                {scatterWithDynamicColor.length} puntos
              </span>
            </h3>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Tiempo bajo</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Tiempo medio</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Tiempo alto</span>
              {effectiveView === 'day' && (
                <span className="ml-2 text-blue-600">Click en un punto para ver el detalle del camión</span>
              )}
            </div>
            <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                Eje X: {effectiveView === 'day' ? 'hora de ingreso (0h-24h)' : effectiveView === 'week' ? 'día (1-7)' : 'semana (1-5)'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">Eje Y: tiempo en planta (0h-36h)</span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                Franja central 4h: {(centralBand.y1 / 60).toFixed(1)}h a {(centralBand.y2 / 60).toFixed(1)}h
              </span>
              {(selectedStatusFilter || selectedCircuitCode) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatusFilter(null)
                    setSelectedCircuitCode(null)
                  }}
                  className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-slate-700"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {effectiveView === 'month' && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
                <span className="font-medium text-slate-600">Seleccionar semana:</span>
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => withChartsLoading(() => setDrilledWeek(w))}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  >
                    S{w}
                  </button>
                ))}
              </div>
            )}
            {effectiveView === 'week' && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
                {drilledWeek && (
                  <button
                    type="button"
                    onClick={() => withChartsLoading(() => { setDrilledWeek(null); setDrilledDay(null) })}
                    className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-600 hover:bg-slate-200"
                  >
                    ← Volver
                  </button>
                )}
                <span className="font-medium text-slate-600">Seleccionar día:</span>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => withChartsLoading(() => setDrilledDay(d))}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  >
                    D{d}
                  </button>
                ))}
              </div>
            )}
            {effectiveView === 'day' && (drilledDay || drilledWeek) && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => withChartsLoading(() => {
                    if (drilledDay) setDrilledDay(null)
                    else if (drilledWeek) { setDrilledWeek(null); setDrilledDay(null) }
                  })}
                  className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-200"
                >
                  ← Volver
                </button>
              </div>
            )}
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
                    domain={[0, 36 * 60]}
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
                          <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-md">
                            <div className="font-semibold">{p.plate}</div>
                            <div>{p.circuitCode} · {p.circuitName}</div>
                            <div>{p.cir} / {p.vue}</div>
                            <div>Ingreso: {p.entryTime} h</div>
                            <div>Tiempo en planta: {(p.cycleMinutes / 60).toFixed(1)} h</div>
                            <div>{p.status}</div>
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
                    shape={(props) => {
                    const p = props.payload as ((typeof statsFromTrips.scatter)[number] & { popupInfo?: StatsTruckPopupInfo }) | undefined
                    const n = scatterWithDynamicColor.length
                    const r = n <= 100 ? 5 : n <= 500 ? 3 : n <= 2000 ? 2 : n <= 7000 ? 1.5 : 1
                    const canSelect = effectiveView === 'day' && p?.plate
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={r}
                        fill={p?.color ?? '#64748b'}
                        fillOpacity={n > 2000 ? 0.7 : 0.9}
                        stroke={n > 2000 ? 'none' : '#ffffff'}
                        strokeWidth={n > 2000 ? 0 : 1}
                        style={{ cursor: canSelect ? 'pointer' : 'default' }}
                      />
                    )
                  }}
                  />
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
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-600" /> Recepción / Descarga</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-600" /> Despacho / Carga</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-500" /> Transile / Mov. interno</span>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsFromTrips.validBars.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={180} tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ payload }) => {
                        const p = payload?.[0]?.payload as (typeof statsFromTrips.validBars)[number] | undefined
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
                      {statsFromTrips.validBars.slice(0, 10).map((entry) => (
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
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Secuencia de cámaras ({selectedStatsTruck.assignedCircuitLabel})
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedStatsTruck.cameraCaptures.map((capture, idx) => {
                      const isDone = idx <= selectedStatsCaptureIndex
                      const isCurrent = idx === selectedStatsCaptureIndex
                      return (
                        <button
                          key={`${capture.cameraId}-${idx}`}
                          type="button"
                          onClick={() => setSelectedStatsCaptureIndex(idx)}
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition ${
                            isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'
                          } ${isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                        >
                          <span className="font-semibold">{capture.cameraId}</span>
                          <span className="opacity-70">#{idx + 1}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="md:justify-self-end">
                <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-900/95 shadow-lg ring-1 ring-slate-200/70">
                  <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      Cámara operativa · {selectedStatsTruck.cameraCaptures[selectedStatsCaptureIndex]?.cameraId ?? 'S0'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      REC
                    </span>
                  </div>
                  <div className="flex aspect-video min-h-[176px] items-center justify-center bg-slate-950">
                    <img
                      src={selectedStatsTruck.cameraCaptures[selectedStatsCaptureIndex]?.imageUrl}
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
