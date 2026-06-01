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
  unit?: 'h' | 'min'
  domainMin?: number
  domainMax?: number
  /** Ancho de bin en la unidad del eje X. */
  binSize?: number
  /** Indicadores de forma para overlays y coloreo de barras (rango central, cola derecha) */
  indicadoresForma?: IndicadoresForma | null
}

function resolveHistogramDomain(
  chartData: ChartPoint[],
  unit: 'h' | 'min',
  domainMin?: number,
  domainMax?: number,
  binSize = 5
): { min: number; max: number } {
  if (domainMin != null && domainMax != null) return { min: domainMin, max: domainMax }
  if (unit === 'h') return { min: 0.5, max: 24 }
  const dataMax = Math.max(0, ...chartData.map((d) => d.x))
  const step = Math.max(1, binSize)
  const max = Math.max(step * 6, Math.ceil((dataMax * 1.12) / step) * step)
  return { min: 0, max }
}

export function EstadiaHistogramWithRefs({
  chartData,
  mean,
  median,
  std,
  mode,
  unit = 'h',
  domainMin,
  domainMax,
  binSize,
  indicadoresForma,
}: EstadiaHistogramWithRefsProps) {
  const binWidth = binSize ?? (unit === 'min' ? 5 : 1 / 6)
  const domain = resolveHistogramDomain(chartData, unit, domainMin, domainMax, binWidth)
  const unitLabel = unit === 'min' ? 'min' : 'h'
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
            domain={[domain.min, domain.max]}
            padding={{ left: 0, right: 0 }}
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(v) => `${v}${unitLabel}`}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={{ stroke: '#e2e8f0' }}
            name={`Duración (${unitLabel})`}
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
          {indicadoresForma && indicadoresForma.colaDerechaUmbral < domain.max && (
            <>
              <ReferenceArea
                x1={indicadoresForma.colaDerechaUmbral}
                x2={domain.max}
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
              const binStart = Math.floor((p.x ?? 0) / binWidth) * binWidth
              const binEnd = binStart + binWidth
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
                  <div className="font-semibold text-slate-800">
                    Rango: {binStart.toFixed(1)}–{binEnd.toFixed(1)} {unitLabel}
                  </div>
                  <div className="text-slate-600">Cantidad: {p.count ?? 0} camiones</div>
                  <div className="mt-1 border-t border-slate-100 pt-1 text-[10px] text-slate-500">
                    Media {mean.toFixed(1)}{unitLabel} · Moda {mode.toFixed(1)}{unitLabel} · Mediana{' '}
                    {median.toFixed(1)}{unitLabel}
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
