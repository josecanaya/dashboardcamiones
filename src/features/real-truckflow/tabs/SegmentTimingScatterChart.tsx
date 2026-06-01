import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
} from 'recharts'
import type { ChartPoint } from '../../../components/estadia/EstadiaHistogramWithRefs'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN } from '../etlWorkbench/etlSegmentTiming'

/** Radio del punto por camión (px en SVG). */
export const SEGMENT_TIMING_DOT_RADIUS = 4
const SEGMENT_TIMING_DOT_STROKE = 0.6

export type SegmentTimingScatterPoint = {
  /** Tiempo del tramo (min). */
  x: number
  /** Posición apilada dentro del bin (1 … cantidad en ese bin). */
  y: number
  binStart: number
  pointKey: string
}

/** Un punto por camión: X = duración real, Y = apilado por bin de tiempo (como histograma con puntos). */
export function buildSegmentTimingBinStackPoints(
  durationsMinutes: number[],
  binSizeMinutes = SEGMENT_TIMING_HISTOGRAM_BIN_MIN
): SegmentTimingScatterPoint[] {
  const binSize = Math.max(1, binSizeMinutes)
  const byBin = new Map<number, number[]>()

  for (const duration of durationsMinutes) {
    const binStart = Math.floor(duration / binSize) * binSize
    const arr = byBin.get(binStart) ?? []
    arr.push(duration)
    byBin.set(binStart, arr)
  }

  const points: SegmentTimingScatterPoint[] = []
  for (const [binStart, values] of byBin.entries()) {
    values.forEach((duration, index) => {
      points.push({
        x: Math.round(duration * 10) / 10,
        y: index + 1,
        binStart,
        pointKey: `${binStart}-${index}-${duration}`,
      })
    })
  }
  return points
}

function resolveDomainMax(chartData: ChartPoint[], binSize: number): number {
  const dataMax = Math.max(0, ...chartData.map((d) => d.x))
  const step = Math.max(1, binSize)
  return Math.max(step * 6, Math.ceil((dataMax * 1.12) / step) * step)
}

function gaussianCurveFromBins(
  chartData: ChartPoint[],
  mean: number,
  std: number,
  maxCount: number
): Array<{ x: number; y: number }> {
  if (std <= 0 || !chartData.length) return []
  return chartData.map((d) => {
    const z = (d.x - mean) / std
    return {
      x: d.x,
      y: maxCount * Math.exp(-0.5 * z * z),
    }
  })
}

export function SegmentTimingScatterChart({
  scatterPoints,
  chartData,
  mean,
  std,
  binSize = SEGMENT_TIMING_HISTOGRAM_BIN_MIN,
}: {
  scatterPoints: SegmentTimingScatterPoint[]
  chartData: ChartPoint[]
  mean: number
  std: number
  binSize?: number
}) {
  const maxStack = Math.max(1, ...scatterPoints.map((p) => p.y), ...chartData.map((d) => d.count))
  const maxCount = Math.max(1, ...chartData.map((d) => d.count))
  const domainMax = resolveDomainMax(chartData, binSize)
  const domainMin = 0
  const gaussian = gaussianCurveFromBins(chartData, mean, std, maxCount)
  const yMax = Math.max(maxStack, maxCount) * 1.08

  return (
    <div className="h-[340px] w-full">
      <div className="mb-2 flex flex-wrap justify-end gap-4 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-blue-600" />
          Promedio
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-sky-200/80" />
          ±1 Desv. Estándar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block rounded-full bg-blue-600/70"
            style={{ width: SEGMENT_TIMING_DOT_RADIUS * 2, height: SEGMENT_TIMING_DOT_RADIUS * 2 }}
          />
          Camiones
        </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={gaussian} margin={{ top: 28, right: 24, bottom: 20, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={[domainMin, domainMax]}
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(v) => `${v}`}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={{ stroke: '#e2e8f0' }}
            label={{ value: 'Minutos', position: 'insideBottom', offset: -8, fontSize: 12, fill: '#64748b' }}
          />
          <YAxis
            type="number"
            domain={[0, yMax]}
            allowDecimals={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
            axisLine={false}
            tickLine={{ stroke: '#e2e8f0' }}
            label={{
              value: 'Camiones',
              angle: -90,
              position: 'insideLeft',
              offset: 10,
              fontSize: 12,
              fill: '#64748b',
            }}
          />
          {std > 0 && (
            <ReferenceArea
              x1={Math.max(domainMin, mean - std)}
              x2={Math.min(domainMax, mean + std)}
              fill="#0ea5e9"
              fillOpacity={0.12}
            />
          )}
          <ReferenceLine
            x={mean}
            stroke="#2563eb"
            strokeWidth={2}
            label={{
              value: `Promedio ${mean.toFixed(1)} min`,
              position: 'top',
              fontSize: 11,
              fill: '#2563eb',
            }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3', stroke: '#94a3b8' }}
            content={({ active, payload, label }) => {
              if (!active) return null
              const fromDot = payload?.find((p) => p.payload?.binStart != null)?.payload as
                | SegmentTimingScatterPoint
                | undefined
              if (fromDot) {
                const binEnd = fromDot.binStart + binSize
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
                    <div className="font-semibold text-slate-800">{fromDot.x.toFixed(1)} min</div>
                    <div className="text-slate-600">
                      Bin {fromDot.binStart.toFixed(0)}–{binEnd.toFixed(0)} min · fila {fromDot.y}
                    </div>
                  </div>
                )
              }
              const x = typeof label === 'number' ? label : Number(label)
              if (!Number.isFinite(x)) return null
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
                  <div className="font-semibold text-slate-800">{x.toFixed(1)} min</div>
                  <div className="text-slate-600">Curva gaussiana</div>
                </div>
              )
            }}
          />
          {gaussian.length > 1 && (
            <Line
              type="monotone"
              dataKey="y"
              stroke="#0ea5e9"
              strokeWidth={2}
              strokeOpacity={0.55}
              dot={false}
              isAnimationActive={false}
              name="Gaussiana"
              connectNulls
            />
          )}
          {scatterPoints.map((p) => (
            <ReferenceDot
              key={p.pointKey}
              x={p.x}
              y={p.y}
              r={SEGMENT_TIMING_DOT_RADIUS}
              fill="#2563eb"
              fillOpacity={0.62}
              stroke="#1e40af"
              strokeWidth={SEGMENT_TIMING_DOT_STROKE}
              ifOverflow="visible"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
