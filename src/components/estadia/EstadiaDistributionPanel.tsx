/**
 * Pieza 3 — Distribución / Gráfico
 * Protagonista visual: histograma + curva, líneas de referencia.
 * Slide-ready, dashboard premium.
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'

export interface ChartPoint {
  x: number
  count: number
  freqSmoothed: number
}

export interface EstadiaDistributionPanelProps {
  chartData: ChartPoint[]
  mean: number
  median: number
}

export function EstadiaDistributionPanel({
  chartData,
  mean,
  median,
}: EstadiaDistributionPanelProps) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={{ minWidth: 720 }}
    >
      <div className="border-b border-slate-100 px-8 py-6">
        <h3 className="text-xl font-bold text-slate-800">
          Distribución de estadía de camiones
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Horas de permanencia vs cantidad de camiones. Barras cada 10 min, curva suavizada.
        </p>
      </div>
      <div className="px-6 pb-6 pt-4">
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 24, bottom: 20, left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, 24]}
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(v) => `${v}h`}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                type="number"
                domain={[0, 'auto']}
                tick={{ fontSize: 12, fill: '#64748b' }}
                allowDecimals={false}
                axisLine={false}
                tickLine={{ stroke: '#e2e8f0' }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as ChartPoint | undefined
                  if (!p) return null
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
                      <div className="font-semibold text-slate-800">
                        {(p.x ?? 0).toFixed(2)} h de permanencia
                      </div>
                      <div className="text-slate-500">{(p.count ?? 0)} camiones</div>
                    </div>
                  )
                }}
              />
              <Bar
                dataKey="count"
                fill="#64748b"
                fillOpacity={0.6}
                radius={[4, 4, 0, 0]}
                name="Cantidad"
              />
              <Line
                type="monotone"
                dataKey="freqSmoothed"
                stroke="#0ea5e9"
                strokeWidth={3}
                dot={false}
                name="Curva"
                connectNulls
              />
              <ReferenceLine
                x={mean}
                stroke="#8b5cf6"
                strokeDasharray="5 4"
                strokeWidth={2}
                label={{
                  value: 'Promedio',
                  position: 'top',
                  fontSize: 10,
                  fill: '#7c3aed',
                }}
              />
              <ReferenceLine
                x={median}
                stroke="#059669"
                strokeDasharray="4 3"
                strokeWidth={2}
                label={{
                  value: 'Mediana',
                  position: 'top',
                  fontSize: 10,
                  fill: '#047857',
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="h-3 w-4 rounded-sm bg-slate-400/60" />
            Histograma
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-sky-500" />
            Curva suavizada
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-violet-500" />
            Promedio
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-600" />
            Mediana
          </span>
        </div>
      </div>
    </div>
  )
}
