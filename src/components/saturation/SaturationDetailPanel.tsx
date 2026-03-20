import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import type { HistoricalTrip, OperationalAlert } from '../../domain/logistics'
import type { SiteId } from '../../domain/sites'
import type { SaturationAnalysisResult, SaturationEpisode, SaturationGranularity } from '../../services/saturationAnalytics'
import { buildDetailWindowSeries, buildOperationalMarkers } from '../../services/saturationAnalytics'

function detailWindowMs(
  episode: SaturationEpisode | null,
  rangeStartMs: number,
  rangeEndMs: number,
  granularity: SaturationGranularity
): { start: number; end: number } {
  if (!episode) return { start: rangeStartMs, end: rangeEndMs }
  const span = Math.max(episode.endMs - episode.startMs, 60_000)
  const step =
    granularity === 'day' ? 24 * 60 * 60_000 : granularity === '30min' ? 30 * 60_000 : 60 * 60_000
  const pad = Math.max(span * 2, step * 4)
  return {
    start: Math.max(rangeStartMs, episode.startMs - pad),
    end: Math.min(rangeEndMs, episode.endMs + pad),
  }
}

export interface SaturationDetailPanelProps {
  siteId: SiteId
  sectorId: string | null
  episode: SaturationEpisode | null
  result: SaturationAnalysisResult
  granularity: SaturationGranularity
  trips: HistoricalTrip[]
  alerts: OperationalAlert[]
}

export function SaturationDetailPanel({
  siteId,
  sectorId,
  episode,
  result,
  granularity,
  trips,
  alerts,
}: SaturationDetailPanelProps) {
  const { rangeStartMs, rangeEndMs, intervalsBySector, capacityMap: capMap } = result

  const { chartData, markerXKeys, peakInIdx, peakOutIdx, win } = useMemo(() => {
    if (!sectorId) {
      return { chartData: [], markerXKeys: [] as string[], peakInIdx: -1, peakOutIdx: -1, win: { start: 0, end: 0 } }
    }
    const intervals = intervalsBySector.get(sectorId) ?? []
    const cap = capMap?.[sectorId] ?? null
    const win = detailWindowMs(episode, rangeStartMs, rangeEndMs, granularity)
    const tripsSite = trips.filter((t) => t.siteId === siteId)
    const { points } = buildDetailWindowSeries(sectorId, intervals, cap, win.start, win.end, granularity, tripsSite)
    const markers = buildOperationalMarkers(alerts, siteId, win.start, win.end, sectorId)
    const markerXKeys = markers
      .map((m) => {
        const idx = points.findIndex((p) => m.atMs >= p.startMs && m.atMs < p.endMs)
        return idx >= 0 ? String(idx) : null
      })
      .filter((x): x is string => x != null)
    const markerXUnique = [...new Set(markerXKeys)]

    let peakIn = -1
    let peakOut = -1
    let maxIn = -1
    let maxOut = -1
    points.forEach((p, i) => {
      if (p.ingresos > maxIn) {
        maxIn = p.ingresos
        peakIn = i
      }
      if (p.egresos > maxOut) {
        maxOut = p.egresos
        peakOut = i
      }
    })

    const chartData = points.map((p, i) => ({
      ...p,
      xKey: String(i),
      capLine: cap ?? undefined,
    }))

    return {
      chartData,
      markerXKeys: markerXUnique,
      peakInIdx: peakIn,
      peakOutIdx: peakOut,
      win,
    }
  }, [sectorId, episode, rangeStartMs, rangeEndMs, granularity, trips, alerts, siteId, intervalsBySector, capMap])

  if (!sectorId) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-sm text-slate-500">
        Seleccioná un sector o un episodio en el heatmap o la tabla para ver ocupación, flujo y contexto.
      </div>
    )
  }

  const title = episode ? `Detalle del episodio — ${sectorId}` : `Detalle del sector — ${sectorId}`
  const sub = `${new Date(win.start).toLocaleString('es-AR')} → ${new Date(win.end).toLocaleString('es-AR')}`
  const capVal = sectorId && capMap ? capMap[sectorId] : undefined

  const commonX = (
    <XAxis dataKey="xKey" tick={{ fontSize: 9 }} tickFormatter={(v) => chartData[Number(v)]?.label ?? v} interval="preserveStartEnd" />
  )

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>

      <div className="h-[200px]">
        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">Ocupación vs capacidad</p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {commonX}
            <YAxis tick={{ fontSize: 9 }} width={32} allowDecimals={false} />
            <Tooltip
              formatter={(v: number | undefined, name?: string) => [v ?? '—', name ?? '']}
              labelFormatter={(l) => chartData[Number(l)]?.label ?? l}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="stepAfter" dataKey="occupancy" name="Ocupación estimada" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.5} />
            {capVal != null && (
              <Line type="monotone" dataKey="capLine" name="Capacidad" stroke="#334155" strokeDasharray="5 3" dot={false} connectNulls />
            )}
            {markerXKeys.map((xk) => (
              <ReferenceLine key={xk} x={xk} stroke="#6366f1" strokeDasharray="3 3" strokeOpacity={0.7} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[160px]">
        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">Ingresos por franja</p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {commonX}
            <YAxis tick={{ fontSize: 9 }} width={28} allowDecimals={false} />
            <Tooltip labelFormatter={(l) => chartData[Number(l)]?.label ?? l} />
            <Bar dataKey="ingresos" fill="#2563eb" name="Ingresos" radius={[2, 2, 0, 0]} />
            {peakInIdx >= 0 && <ReferenceLine x={String(peakInIdx)} stroke="#1e3a8a" strokeWidth={2} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[160px]">
        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">Egresos por franja</p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {commonX}
            <YAxis tick={{ fontSize: 9 }} width={28} allowDecimals={false} />
            <Tooltip labelFormatter={(l) => chartData[Number(l)]?.label ?? l} />
            <Bar dataKey="egresos" fill="#0d9488" name="Egresos" radius={[2, 2, 0, 0]} />
            {peakOutIdx >= 0 && <ReferenceLine x={String(peakOutIdx)} stroke="#0f766e" strokeWidth={2} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[180px]">
        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">Saldo acumulado (ingresos − egresos por franja)</p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            {commonX}
            <YAxis tick={{ fontSize: 9 }} width={36} />
            <Tooltip
              labelFormatter={(l) => chartData[Number(l)]?.label ?? l}
              formatter={(v: number | undefined, n?: string) => [v ?? '—', n ?? '']}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="acumulado" name="Acumulado" stroke="#7c3aed" fill="#c4b5fd" fillOpacity={0.35} />
            <Line type="monotone" dataKey="saldo" name="Saldo franja" stroke="#a78bfa" dot={false} strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-500">
        Marcadores azules: alertas operativas en la ventana (tipo en tooltip del backend). La ocupación se estima repartiendo estadía por secuencia de sectores.
      </div>
    </div>
  )
}
