import { useMemo } from 'react'
import type { ChartPoint } from '../../../components/estadia/EstadiaHistogramWithRefs'
import type { StayTimeStats } from '../../../services/analyticsKpi'
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import { safeExportFilename } from '../../../utils/chartExport'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN, type SegmentLeg } from '../etlWorkbench/etlSegmentTiming'
import { histogramWithKde } from '../../../utils/stats'
import type { SegmentScatterByDayRow } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  downloadSlowTailCsv,
  legsToSlowTailExport,
  SLOW_TAIL_MAX_TRUCKS,
} from '../etlWorkbench/etlSegmentSlowTail'
import { SegmentScatterByDayChart } from './SegmentScatterByDayChart'
import {
  SegmentTimingScatterChart,
  SEGMENT_TIMING_DOT_RADIUS,
  buildColoredBinStackPoints,
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
  scatterByDayRows,
  segmentLegs,
  panelExportRef,
}: {
  title: string
  circuitCode: string
  periodLabel: string
  stats: StayTimeStats
  durationsMinutes: number[]
  chartData: ChartPoint[]
  scatterByDayRows?: SegmentScatterByDayRow[]
  segmentLegs?: SegmentLeg[]
  panelExportRef?: (el: HTMLDivElement | null) => void
}) {
  const useDayScatter = Boolean(scatterByDayRows?.length)

  const displayStats = useMemo((): StayTimeStats => {
    if (useDayScatter && scatterByDayRows?.length) {
      return computeStayTimeStats(scatterByDayRows.map((r) => r.duracion_minutos))
    }
    return stats
  }, [useDayScatter, scatterByDayRows, stats])

  const displayDurations = useMemo(() => {
    if (useDayScatter && scatterByDayRows?.length) {
      return scatterByDayRows.map((r) => r.duracion_minutos)
    }
    return durationsMinutes
  }, [useDayScatter, scatterByDayRows, durationsMinutes])

  const displayChartData = useMemo(() => {
    if (useDayScatter && displayDurations.length) {
      return histogramWithKde(displayDurations, SEGMENT_TIMING_HISTOGRAM_BIN_MIN, 5, { unit: 'min' })
    }
    return chartData
  }, [useDayScatter, displayDurations, chartData])

  const coloredLegPoints = useMemo(() => {
    if (useDayScatter || !segmentLegs?.length) return null
    return buildColoredBinStackPoints(
      segmentLegs.map((leg) => ({ leg, duracion_minutos: leg.durationMinutes })),
      ({ leg, duracion_minutos }) => ({
        fill: '#2563eb',
        stroke: '#1e40af',
        dotRadius: SEGMENT_TIMING_DOT_RADIUS,
        tooltipTitle: leg.plate || leg.journeyId,
        tooltipLines: [
          `Patente: ${leg.plate || '—'}`,
          `${duracion_minutos.toFixed(1)} min`,
          'Sin hora de ingreso/egreso en este modo',
        ],
      })
    )
  }, [segmentLegs, useDayScatter])

  const scatterPoints = buildSegmentTimingBinStackPoints(
    displayDurations,
    SEGMENT_TIMING_HISTOGRAM_BIN_MIN
  )

  const exportSlowTailLegs = () => {
    if (!segmentLegs?.length) return
    const rows = legsToSlowTailExport(segmentLegs, circuitCode, title)
    if (!rows.length) return
    const slug = title.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    downloadSlowTailCsv(safeExportFilename(`kpi_${circuitCode}_${slug}_top10_lentos`, 'csv'), rows)
  }

  const showCharts = displayStats.count > 0 || useDayScatter

  return (
    <div
      ref={panelExportRef}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ minWidth: 720 }}
    >
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Circuito {circuitCode} · {periodLabel} · {displayStats.count.toLocaleString('es-AR')} camiones
              {useDayScatter ?
                ' · general o por día · turnos 0–6 / 6–12 / 12–18 / 18–24'
              : ` · bins ${SEGMENT_TIMING_HISTOGRAM_BIN_MIN} min`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Pasá el mouse sobre un punto para ver la patente. Los más lentos se exportan con el botón CSV (10 %, máx.{' '}
              {SLOW_TAIL_MAX_TRUCKS}).
            </p>
          </div>
          {!useDayScatter && segmentLegs?.length ?
            <button
              type="button"
              onClick={exportSlowTailLegs}
              className="shrink-0 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              CSV 10 % más lentos (máx. {SLOW_TAIL_MAX_TRUCKS})
            </button>
          : null}
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Tiempo mínimo" value={displayStats.min} />
        <MetricCard label="Tiempo máximo" value={displayStats.max} />
        <MetricCard label="Tiempo medio" value={displayStats.mean} />
        <MetricCard label="Desvío estándar" value={displayStats.std} />
      </div>

      <div className="px-6 py-4">
        {!showCharts ?
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Sin camiones en este tramo para el período. En balanza ingreso → egreso entran operaciones con inicio de
            balanza (cámara o inferido) y salida Excel, con −2 h 20 min de corrección y tope de 240 min. Ejecutá de
            nuevo{' '}
            <span className="font-medium">Transform</span> y <span className="font-medium">KPI tiempos (tramo 4)</span>{' '}
            tras cambios en el ETL.
          </p>
        : useDayScatter ?
          <SegmentScatterByDayChart rows={scatterByDayRows!} tramoLabel={title} circuitCode={circuitCode} />
        : <SegmentTimingScatterChart
            coloredScatterPoints={coloredLegPoints ?? undefined}
            scatterPoints={coloredLegPoints ? undefined : scatterPoints}
            chartData={displayChartData}
            mean={displayStats.mean}
            std={displayStats.std}
            legendExtra={undefined}
          />
        }
      </div>
    </div>
  )
}
