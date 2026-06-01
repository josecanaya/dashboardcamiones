import type { ChartPoint } from '../../../components/estadia/EstadiaHistogramWithRefs'
import type { StayTimeStats } from '../../../services/analyticsKpi'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN } from '../etlWorkbench/etlSegmentTiming'
import {
  SegmentTimingScatterChart,
  buildSegmentTimingBinStackPoints,
} from './SegmentTimingScatterChart'

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
        {value.toFixed(1)} <span className="text-sm font-semibold text-slate-500">min</span>
      </div>
    </div>
  )
}

export function SegmentTimingChartPanel({
  title,
  circuitCode,
  periodLabel,
  stats,
  durationsMinutes,
  chartData,
  panelExportRef,
}: {
  title: string
  circuitCode: string
  periodLabel: string
  stats: StayTimeStats
  durationsMinutes: number[]
  chartData: ChartPoint[]
  panelExportRef?: (el: HTMLDivElement | null) => void
}) {
  const scatterPoints = buildSegmentTimingBinStackPoints(
    durationsMinutes,
    SEGMENT_TIMING_HISTOGRAM_BIN_MIN
  )

  return (
    <div
      ref={panelExportRef}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ minWidth: 720 }}
    >
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Circuito {circuitCode} · {periodLabel} · {stats.count.toLocaleString('es-AR')} camiones · bins{' '}
          {SEGMENT_TIMING_HISTOGRAM_BIN_MIN} min
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Tiempo mínimo" value={stats.min} />
        <MetricCard label="Tiempo máximo" value={stats.max} />
        <MetricCard label="Tiempo medio" value={stats.mean} />
        <MetricCard label="Desvío estándar" value={stats.std} />
      </div>

      <div className="px-6 py-4">
        <SegmentTimingScatterChart
          scatterPoints={scatterPoints}
          chartData={chartData}
          mean={stats.mean}
          std={stats.std}
          binSize={SEGMENT_TIMING_HISTOGRAM_BIN_MIN}
        />
      </div>
    </div>
  )
}
