import { useMemo } from 'react'
import { histogramWithKde } from '../../../utils/stats'
import type { StayTimeStats } from '../../../services/analyticsKpi'
import { SEGMENT_TIMING_HISTOGRAM_BIN_MIN } from '../etlWorkbench/etlSegmentTiming'
import type { FranjaHoraria, SegmentScatterByDayRow } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  FRANJA_HORARIA_COLORS,
  FRANJA_HORARIA_ORDER,
  SCATTER_DAY_FILTER_ALL,
  colorForFranja,
} from '../etlWorkbench/etlSegmentScatterByDay'
import { turnoLabel } from '../etlWorkbench/operationalTurno'
import {
  SegmentTimingScatterChart,
  SEGMENT_TIMING_DOT_RADIUS,
  buildColoredBinStackPoints,
} from './SegmentTimingScatterChart'
import {
  CHART_VISIBLE_SLOW_EXPORT_COUNT,
  downloadChartVisibleCsv,
  scatterRowsToChartVisibleExport,
} from '../etlWorkbench/etlSegmentSlowTail'
import { safeExportFilename } from '../../../utils/chartExport'

function horarioFuenteTooltipLines(row: SegmentScatterByDayRow): string[] {
  const lines: string[] = []
  if (row.horario_fuente_inicio || row.horario_fuente_fin) {
    lines.push(
      `Fuente inicio: ${row.horario_fuente_inicio || '—'} · fin: ${row.horario_fuente_fin || '—'}`
    )
  } else if (row.horario_fuente) {
    lines.push(`Fuente horarios: ${row.horario_fuente}`)
  }
  if (row.horario_fuente === 'excel_inferido') {
    lines.push('(legacy) Horarios reconstruidos — revisar tramo ingreso→balanza')
  }
  return lines
}

function strokeForHorarioFuente(fuente: string): string {
  if (fuente === 'excel_salida' || fuente === 'mixto') return '#b45309'
  if (fuente === 'balanza_ingreso_inferido') return '#7c3aed'
  if (fuente === 'excel_inferido') return '#94a3b8'
  return '#0f172a'
}

function franjaLegendLabel(f: (typeof FRANJA_HORARIA_ORDER)[number]): string {
  // turnoLabel ya incluye el rango horario (p. ej. "Q1 (22–04)").
  return turnoLabel(f)
}

export function SegmentScatterByDayChart({
  rows,
  chartRows,
  tramoLabel,
  circuitCode,
  selectedDay,
  onSelectedDayChange,
  franjaFilter,
  onFranjaFilterChange,
  dayOptions,
  isAllDays,
  stats,
  visibleRowCount,
  scatterPoolHint,
  hideControls = false,
}: {
  rows: SegmentScatterByDayRow[]
  chartRows: SegmentScatterByDayRow[]
  tramoLabel: string
  circuitCode: string
  selectedDay: string
  onSelectedDayChange: (day: string) => void
  franjaFilter: FranjaHoraria | null
  onFranjaFilterChange: (franja: FranjaHoraria | null) => void
  dayOptions: string[]
  isAllDays: boolean
  stats: StayTimeStats
  visibleRowCount: number
  scatterPoolHint?: {
    uniqueOpsInCircuit: number
    globalReadyForScatter?: number
  }
  /** Oculta los controles internos (día/franja): el filtro lo maneja un control general. */
  hideControls?: boolean
}) {
  const durations = useMemo(() => chartRows.map((r) => r.duracion_minutos), [chartRows])

  const chartData = useMemo(() => {
    if (!durations.length) return []
    return histogramWithKde(durations, SEGMENT_TIMING_HISTOGRAM_BIN_MIN, 5, { unit: 'min' })
  }, [durations])

  const coloredPoints = useMemo(
    () =>
      buildColoredBinStackPoints(chartRows, (row) => {
        const fill = row.color_franja || colorForFranja(row.franja_horaria)
        const stroke = strokeForHorarioFuente(row.horario_fuente || 'truckflow')
        return {
          fill,
          stroke,
          dotRadius: SEGMENT_TIMING_DOT_RADIUS,
          tooltipTitle: row.patente || row.journey_id,
          tooltipLines: [
            `Patente: ${row.patente || '—'}`,
            `${row.duracion_minutos.toFixed(1)} min · turno ${row.franja_horaria ? turnoLabel(row.franja_horaria) : '—'} (${row.hora_inicio})`,
            `Ingreso: ${row.timestamp_inicio || '—'}`,
            `Egreso: ${row.timestamp_fin || '—'}`,
            isAllDays ?
              `fecha: ${row.fecha_tramo}`
            : `${row.fecha_tramo} · ${row.hora_inicio}`,
            `${row.producto || '—'} · ${row.circuito}`,
            ...horarioFuenteTooltipLines(row),
          ].filter(Boolean),
        }
      }),
    [chartRows, isAllDays]
  )

  const toggleFranjaFilter = (f: FranjaHoraria) => {
    if (hideControls) return
    onFranjaFilterChange(franjaFilter === f ? null : f)
  }

  const exportChartVisible = () => {
    const exportRows = scatterRowsToChartVisibleExport(chartRows, CHART_VISIBLE_SLOW_EXPORT_COUNT)
    if (!exportRows.length) return
    const slug = tramoLabel.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    downloadChartVisibleCsv(
      safeExportFilename(`kpi_${circuitCode}_${slug}_ultimos_${CHART_VISIBLE_SLOW_EXPORT_COUNT}_vista`, 'csv'),
      exportRows
    )
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
        Sin puntos con hora de inicio para este tramo. Reprocesá Transform con Movimientos por Contrato o revisá
        timestamps en Truckflow.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-600">
          Tramo: <span className="font-semibold text-slate-800">{tramoLabel}</span> · un punto por camión · eje X =
          duración (min)
        </p>
        <div className="flex flex-wrap items-end gap-2">
          {!hideControls ?
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Vista</span>
              <select
                value={selectedDay}
                onChange={(e) => onSelectedDayChange(e.target.value)}
                className="min-w-[13rem] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value={SCATTER_DAY_FILTER_ALL}>Todos los días (general)</option>
                {dayOptions.map((d) => (
                  <option key={d} value={d}>
                    Día {d}
                  </option>
                ))}
              </select>
            </label>
          : null}
          <button
            type="button"
            disabled={!chartRows.length}
            onClick={exportChartVisible}
            title={`Los ${CHART_VISIBLE_SLOW_EXPORT_COUNT} camiones más lentos de esta vista (mismos puntos que la gráfica)`}
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-40"
          >
            Export CSV ({CHART_VISIBLE_SLOW_EXPORT_COUNT} más lentos en vista)
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {chartRows.length.toLocaleString('es-AR')} camiones
        {franjaFilter ?
          ` (filtro: ${turnoLabel(franjaFilter)})`
        : null}
        {visibleRowCount !== chartRows.length ?
          ` · de ${visibleRowCount.toLocaleString('es-AR')} en la vista`
        : null}
        {isAllDays ?
          ` · ${dayOptions.length} días del período`
        : ` · ${selectedDay}`}{' '}
        · tiempo medio {stats.count ? `${stats.mean.toFixed(1)} min` : '—'}
        {franjaFilter && stats.count ?
          ` · desvío σ ${stats.std.toFixed(1)} min`
        : null}
        {scatterPoolHint ?
          ` · ${scatterPoolHint.uniqueOpsInCircuit.toLocaleString('es-AR')} operaciones con dispersión en ${circuitCode}${
            scatterPoolHint.globalReadyForScatter ?
              ` (de ${scatterPoolHint.globalReadyForScatter.toLocaleString('es-AR')} listas para scatter en el Excel)`
            : ''
          }`
        : null}
      </p>

      {!chartRows.length ?
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
          Sin camiones en la vista seleccionada.
        </p>
      : <>
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
              <span className="font-semibold uppercase tracking-wide text-slate-500">Turno (color):</span>
              {FRANJA_HORARIA_ORDER.map((f) => {
                const active = franjaFilter === f
                const dimmed = franjaFilter != null && !active
                const chipBody = (
                  <>
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: FRANJA_HORARIA_COLORS[f] }}
                    />
                    {franjaLegendLabel(f)}
                  </>
                )
                if (hideControls) {
                  // Solo leyenda de color: el filtro está en el control general.
                  return (
                    <span
                      key={f}
                      className={`inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 ${
                        dimmed ? 'opacity-40' : active ? 'font-semibold' : ''
                      }`}
                    >
                      {chipBody}
                    </span>
                  )
                }
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFranjaFilter(f)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition ${
                      active ?
                        'border-violet-400 bg-violet-100 font-semibold ring-2 ring-violet-300'
                      : dimmed ?
                        'opacity-50'
                      : 'hover:bg-white'
                    }`}
                  >
                    {chipBody}
                  </button>
                )
              })}
              <span className="ml-2 text-slate-500">Borde: Truckflow / Excel salida</span>
            </div>
          </div>
          <SegmentTimingScatterChart
          coloredScatterPoints={coloredPoints}
          chartData={chartData}
          mean={stats.mean}
          std={stats.std}
          binSize={SEGMENT_TIMING_HISTOGRAM_BIN_MIN}
          legendExtra={
            <>
              {!hideControls ?
                <>
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Filtrar:
                  </span>
                  {FRANJA_HORARIA_ORDER.map((f) => {
                    const active = franjaFilter === f
                    const dimmed = franjaFilter != null && !active
                    return (
                      <button
                        key={f}
                        type="button"
                        title={
                          active ?
                            `Quitar filtro ${turnoLabel(f)}`
                          : `Mostrar solo ${turnoLabel(f)}`
                        }
                        onClick={() => toggleFranjaFilter(f)}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
                          active ?
                            'border-violet-400 bg-violet-100 font-semibold text-violet-950 ring-2 ring-violet-300'
                          : dimmed ?
                            'border-transparent text-slate-400 opacity-50 hover:opacity-80'
                          : 'border-transparent text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: 10,
                            height: 10,
                            backgroundColor: FRANJA_HORARIA_COLORS[f],
                          }}
                        />
                        {franjaLegendLabel(f)}
                      </button>
                    )
                  })}
                  {franjaFilter ?
                    <button
                      type="button"
                      onClick={() => onFranjaFilterChange(null)}
                      className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Ver todas
                    </button>
                  : null}
                </>
              : null}
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Borde punto:
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-white" />
                Truckflow
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-700 bg-white" />
                Fin Excel / mixto
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-violet-700 bg-white" />
                S1 inferido
              </span>
            </>
          }
        />
        </>
      }
    </div>
  )
}
