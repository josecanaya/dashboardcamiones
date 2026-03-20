/**
 * Histograma principal con líneas de referencia (media, mediana, moda, P90).
 * Indicadores de forma: centro, dispersión, concentración central.
 * Orientado a comité.
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts'
import type { IndicadoresForma } from '../../lib/distribucionForma'

export interface ChartPoint {
  x: number
  count: number
  freqSmoothed: number
}

export interface EstadiaHistogramWithRefsProps {
  chartData: ChartPoint[]
  mean: number
  median: number
  std: number
  mode: number
  /** Indicadores de forma para overlays y coloreo de barras (rango central, cola derecha) */
  indicadoresForma?: IndicadoresForma | null
}

const DOMAIN_MIN = 0.5
const DOMAIN_MAX = 24

export function EstadiaHistogramWithRefs({
  chartData,
  mean,
  median,
  std,
  mode,
  indicadoresForma,
}: EstadiaHistogramWithRefsProps) {
  const maxCount = Math.max(0, ...chartData.map((d) => d.count))
  const gaussian = (x: number) => {
    if (std <= 0) return 0
    const z = (x - mean) / std
    return maxCount * Math.exp(-0.5 * z * z)
  }
  const dataWithGaussian = chartData.map((d) => ({
    ...d,
    freqSmoothed: gaussian(d.x),
  }))

  const getBarColor = (index: number) => {
    const x = dataWithGaussian[index]!.x
    if (!indicadoresForma) return '#94a3b8'
    if (x >= indicadoresForma.rangoCentralMin && x <= indicadoresForma.rangoCentralMax) return '#0ea5e9' // rango central
    if (x > indicadoresForma.colaDerechaUmbral) return '#f59e0b' // cola derecha
    return '#94a3b8' // resto
  }

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dataWithGaussian} margin={{ top: 24, right: 24, bottom: 20, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[DOMAIN_MIN, DOMAIN_MAX]}
            padding={{ left: 0, right: 0 }}
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(v) => `${v}h`}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={{ stroke: '#e2e8f0' }}
            name="Duración (h)"
          />
          <YAxis
            type="number"
            domain={[0, 'auto']}
            tick={{ fontSize: 12, fill: '#64748b' }}
            allowDecimals={false}
            axisLine={false}
            tickLine={{ stroke: '#e2e8f0' }}
            name="Cantidad"
          />
          {indicadoresForma && indicadoresForma.rangoCentralMin < indicadoresForma.rangoCentralMax && (
            <>
              <ReferenceArea
                x1={indicadoresForma.rangoCentralMin}
                x2={indicadoresForma.rangoCentralMax}
                fill="#0ea5e9"
                fillOpacity={0.12}
              />
              <ReferenceLine
                x={indicadoresForma.rangoCentralMin}
                stroke="#0ea5e9"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
              <ReferenceLine
                x={indicadoresForma.rangoCentralMax}
                stroke="#0ea5e9"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
            </>
          )}
          {indicadoresForma && indicadoresForma.colaDerechaUmbral < DOMAIN_MAX && (
            <>
              <ReferenceArea
                x1={indicadoresForma.colaDerechaUmbral}
                x2={DOMAIN_MAX}
                fill="#f59e0b"
                fillOpacity={0.15}
              />
              <ReferenceLine
                x={indicadoresForma.colaDerechaUmbral}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                strokeOpacity={0.7}
              />
            </>
          )}
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
            content={({ payload }) => {
              const p = payload?.[0]?.payload as ChartPoint | undefined
              if (!p) return null
              const binStart = Math.floor((p.x ?? 0) * 6) / 6
              const binEnd = binStart + 1 / 6
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
                  <div className="font-semibold text-slate-800">
                    Rango: {binStart.toFixed(2)}–{binEnd.toFixed(2)} h
                  </div>
                  <div className="text-slate-600">Cantidad: {(p.count ?? 0)} camiones</div>
                  <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-500">
                    Media {mean.toFixed(1)}h · Moda {mode.toFixed(1)}h · Mediana {median.toFixed(1)}h
                  </div>
                </div>
              )
            }}
          />
          <Bar
            dataKey="count"
            fillOpacity={0.85}
            radius={[4, 4, 0, 0]}
            name="Cantidad"
          >
            {dataWithGaussian.map((_, index) => (
              <Cell key={index} fill={getBarColor(index)} />
            ))}
          </Bar>
          <Line
            type="monotone"
            dataKey="freqSmoothed"
            stroke="#0ea5e9"
            strokeWidth={2}
            strokeOpacity={0.6}
            dot={false}
            name="Gaussiana"
            connectNulls
          />
          {indicadoresForma && (
            <ReferenceDot
              x={mode}
              y={indicadoresForma.picoFrecuencia}
              r={6}
              fill="#dc2626"
              stroke="white"
              strokeWidth={2}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
