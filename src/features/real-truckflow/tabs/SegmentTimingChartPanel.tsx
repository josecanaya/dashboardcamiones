import { useEffect, useMemo, useState } from 'react'
import type { ChartPoint } from '../../../components/estadia/EstadiaHistogramWithRefs'
import type { StayTimeStats } from '../../../services/analyticsKpi'
import { computeStayTimeStats } from '../../../services/analyticsKpi'
import { safeExportFilename } from '../../../utils/chartExport'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN, type SegmentLeg } from '../etlWorkbench/etlSegmentTiming'
import { histogramWithKde } from '../../../utils/stats'
import type { FranjaHoraria, SegmentScatterByDayRow } from '../etlWorkbench/etlSegmentScatterByDay'
import { SCATTER_DAY_FILTER_ALL } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  CHART_VISIBLE_SLOW_EXPORT_COUNT,
  downloadChartVisibleCsv,
  legsToChartVisibleExport,
} from '../etlWorkbench/etlSegmentSlowTail'
import { SegmentScatterByDayChart } from './SegmentScatterByDayChart'
import {
  SegmentTimingScatterChart,
  SEGMENT_TIMING_DOT_RADIUS,
  buildColoredBinStackPoints,
  buildSegmentTimingBinStackPoints,
} from './SegmentTimingScatterChart'

function MetricCard({
  label,
  value,
  highlighted,
}: {
  label: string
  value: number
  highlighted?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        highlighted ? 'border-violet-300 bg-violet-50/90' : 'border-slate-200 bg-slate-50/80'
      }`}
    >
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

  const [selectedDay, setSelectedDay] = useState(SCATTER_DAY_FILTER_ALL)
  const [franjaFilter, setFranjaFilter] = useState<FranjaHoraria | null>(null)

  const dayOptions = useMemo(
    () => [...new Set(scatterByDayRows?.map((r) => r.fecha_tramo) ?? [])].filter(Boolean).sort(),
    [scatterByDayRows]
  )

  useEffect(() => {
    if (!dayOptions.length) {
      setSelectedDay('')
      return
    }
    if (selectedDay && selectedDay !== SCATTER_DAY_FILTER_ALL && !dayOptions.includes(selectedDay)) {
      setSelectedDay(SCATTER_DAY_FILTER_ALL)
    }
  }, [dayOptions, selectedDay])

  const isAllDays = selectedDay === SCATTER_DAY_FILTER_ALL

  const visibleScatterRows = useMemo(() => {
    if (!scatterByDayRows?.length) return []
    if (isAllDays) return scatterByDayRows
    return scatterByDayRows.filter((r) => r.fecha_tramo === selectedDay)
  }, [scatterByDayRows, isAllDays, selectedDay])

  const filteredScatterRows = useMemo(() => {
    if (!franjaFilter) return visibleScatterRows
    return visibleScatterRows.filter((r) => r.franja_horaria === franjaFilter)
  }, [visibleScatterRows, franjaFilter])

  const scatterRowsForStats = useDayScatter ? filteredScatterRows : []

  const displayStats = useMemo((): StayTimeStats => {
    if (useDayScatter) {
      return computeStayTimeStats(scatterRowsForStats.map((r) => r.duracion_minutos))
    }
    return stats
  }, [useDayScatter, scatterRowsForStats, stats])

  const displayDurations = useMemo(() => {
    if (useDayScatter) {
      return scatterRowsForStats.map((r) => r.duracion_minutos)
    }
    return durationsMinutes
  }, [useDayScatter, scatterRowsForStats, durationsMinutes])

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

  const exportChartVisibleLegs = () => {
    if (!segmentLegs?.length) return
    const rows = legsToChartVisibleExport(segmentLegs, CHART_VISIBLE_SLOW_EXPORT_COUNT)
    if (!rows.length) return
    const slug = title.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    downloadChartVisibleCsv(
      safeExportFilename(`kpi_${circuitCode}_${slug}_ultimos_${CHART_VISIBLE_SLOW_EXPORT_COUNT}_vista`, 'csv'),
      rows
    )
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
              Pasá el mouse sobre un punto para ver la patente. El botón CSV exporta los{' '}
              {CHART_VISIBLE_SLOW_EXPORT_COUNT} más lentos de la vista actual (patente, día y hora).
            </p>
          </div>
          {!useDayScatter && segmentLegs?.length ?
            <button
              type="button"
              onClick={exportChartVisibleLegs}
              className="shrink-0 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
            >
              Export CSV ({CHART_VISIBLE_SLOW_EXPORT_COUNT} más lentos en vista)
            </button>
          : null}
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Tiempo mínimo" value={displayStats.min} />
        <MetricCard label="Tiempo máximo" value={displayStats.max} />
        <MetricCard
          label={franjaFilter ? `Tiempo medio · ${franjaFilter}` : 'Tiempo medio'}
          value={displayStats.mean}
          highlighted={Boolean(franjaFilter)}
        />
        <MetricCard
          label={franjaFilter ? `Desvío estándar · ${franjaFilter}` : 'Desvío estándar'}
          value={displayStats.std}
          highlighted={Boolean(franjaFilter)}
        />
      </div>
      {franjaFilter ?
        <p className="border-b border-slate-100 px-6 pb-3 text-xs text-violet-800">
          KPI de la franja <strong>{franjaFilter}</strong>
          {!isAllDays ? ` · día ${selectedDay}` : ''}
          {' · '}
          {displayStats.count.toLocaleString('es-AR')} camiones
        </p>
      : null}

      <div className="px-6 py-4">
        {!showCharts ?
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
            Sin camiones en este tramo para el período. En balanza ingreso → egreso entran operaciones con inicio de
            balanza (cámara o inferido) y salida Excel; si la duración bruta supera 150 min se restan 2 h (desfase
            planta). Tope 240 min. Ejecutá de
            nuevo{' '}
            <span className="font-medium">Transform</span> y <span className="font-medium">KPI tiempos (tramo 4)</span>{' '}
            tras cambios en el ETL.
          </p>
        : useDayScatter ?
          <SegmentScatterByDayChart
            rows={scatterByDayRows!}
            chartRows={filteredScatterRows}
            tramoLabel={title}
            circuitCode={circuitCode}
            selectedDay={selectedDay}
            onSelectedDayChange={setSelectedDay}
            franjaFilter={franjaFilter}
            onFranjaFilterChange={setFranjaFilter}
            dayOptions={dayOptions}
            isAllDays={isAllDays}
            stats={displayStats}
            visibleRowCount={visibleScatterRows.length}
          />
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
