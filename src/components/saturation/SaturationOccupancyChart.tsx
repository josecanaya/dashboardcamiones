/**
 * Gráfico Ocupación vs Capacidad para un sector.
 * Reutilizable para el detalle principal y la sección "Sectores saturados".
 */

import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { HistoricalTrip } from '../../domain/logistics'
import type { SiteId } from '../../domain/sites'
import type { SaturationAnalysisResult, SaturationGranularity } from '../../services/saturationAnalytics'
import { buildDetailWindowSeries } from '../../services/saturationAnalytics'

export interface SaturationOccupancyChartProps {
  siteId: SiteId
  sectorId: string
  result: SaturationAnalysisResult
  granularity: SaturationGranularity
  trips: HistoricalTrip[]
  height?: number
  title?: string
}

export function SaturationOccupancyChart({
  siteId,
  sectorId,
  result,
  granularity,
  trips,
  height = 200,
  title,
}: SaturationOccupancyChartProps) {
  const { chartData, capVal } = useMemo(() => {
    const { rangeStartMs, rangeEndMs, intervalsBySector, capacityMap } = result
    const intervals = intervalsBySector.get(sectorId) ?? []
    const cap = capacityMap?.[sectorId] ?? null
    const tripsSite = trips.filter((t) => t.siteId === siteId)
    const { points } = buildDetailWindowSeries(
      sectorId,
      intervals,
      cap,
      rangeStartMs,
      rangeEndMs,
      granularity,
      tripsSite
    )
    const chartData = points.map((p, i) => {
      const occ = p.occupancy
      const c = cap ?? occ
      const occupancyCapped = Math.min(occ, c)
      const overflow = cap != null ? Math.max(0, occ - cap) : 0
      return {
        ...p,
        xKey: String(i),
        capLine: cap ?? undefined,
        occupancyCapped,
        overflow,
      }
    })
    return { chartData, capVal: cap }
  }, [siteId, sectorId, result, granularity, trips])

  const chartTitle = title ?? `Detalle del sector — ${sectorId}`

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-900">{chartTitle}</h3>
      <div style={{ height }}>
        <p className="mb-1 text-[10px] font-medium uppercase text-slate-500">Ocupación vs capacidad</p>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="xKey"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => chartData[Number(v)]?.label ?? v}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 9 }} width={32} allowDecimals={false} />
            <Tooltip
              formatter={(v: number | undefined, name?: string) => [v ?? '—', name ?? '']}
              labelFormatter={(l) => chartData[Number(l)]?.label ?? l}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area
              type="stepAfter"
              dataKey="occupancyCapped"
              stackId="occ"
              name="Ocupación estimada"
              stroke="#64748b"
              fill="#cbd5e1"
              fillOpacity={0.5}
            />
            {capVal != null && (
              <Area
                type="stepAfter"
                dataKey="overflow"
                stackId="occ"
                name="Exceso sobre capacidad"
                legendType="none"
                stroke="#000"
                strokeWidth={1}
                fill="rgba(239, 68, 68, 0.45)"
                fillOpacity={1}
                isAnimationActive={false}
              />
            )}
            {capVal != null && (
              <Line
                type="monotone"
                dataKey="capLine"
                name="Capacidad"
                stroke="#334155"
                strokeDasharray="5 3"
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
