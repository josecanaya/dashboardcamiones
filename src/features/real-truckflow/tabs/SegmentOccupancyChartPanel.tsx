import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import type { SegmentScatterByDayRow } from '../etlWorkbench/etlSegmentScatterByDay'
import { SCATTER_DAY_FILTER_ALL } from '../etlWorkbench/etlSegmentScatterByDay'
import {
  computeSectorOccupancyFromScatter,
  filterScatterRowsForOccupancyDay,
  sectorOccupancy30MinCsv,
  sectorOccupancyEventsCsv,
  sectorOccupancyMetrics,
  type FranjaOperativaOccupancy,
} from '../etlWorkbench/etlSectorOccupancy30min'
import { getSectorOccupancyThreshold } from '../etlWorkbench/sectorOccupancyThresholds'
import { safeExportFilename } from '../../../utils/chartExport'

const FRANJA_FILTER_ALL = '__ALL_FRANJA__'
const ESTADO_FILTER_ALL = '__ALL_ESTADO__'

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</div>
      {hint ?
        <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>
      : null}
    </div>
  )
}

export function SegmentOccupancyChartPanel({
  title,
  circuitCode,
  periodLabel,
  scatterRows,
  periodFechas,
}: {
  title: string
  circuitCode: string
  periodLabel: string
  scatterRows: SegmentScatterByDayRow[]
  periodFechas: string[]
}) {
  const [selectedDay, setSelectedDay] = useState(SCATTER_DAY_FILTER_ALL)
  const [franjaFilter, setFranjaFilter] = useState<string>(FRANJA_FILTER_ALL)
  const [estadoFilter, setEstadoFilter] = useState(ESTADO_FILTER_ALL)
  const [umbralManual, setUmbralManual] = useState<string>('')

  const dayOptions = useMemo(
    () => [...new Set(scatterRows.map((r) => r.fecha_tramo))].filter(Boolean).sort(),
    [scatterRows]
  )

  const estadoOptions = useMemo(
    () => [...new Set(scatterRows.map((r) => r.estado_ejecutivo).filter(Boolean))].sort(),
    [scatterRows]
  )

  const filteredRows = useMemo(() => {
    let rows = scatterRows
    if (selectedDay !== SCATTER_DAY_FILTER_ALL) {
      rows = filterScatterRowsForOccupancyDay(rows, selectedDay)
    }
    if (estadoFilter !== ESTADO_FILTER_ALL) {
      rows = rows.filter((r) => r.estado_ejecutivo === estadoFilter)
    }
    return rows
  }, [scatterRows, selectedDay, estadoFilter])

  const umbral =
    umbralManual.trim() ?
      Number(umbralManual)
    : getSectorOccupancyThreshold(circuitCode, title)

  const { series: seriesRaw, events } = useMemo(
    () =>
      computeSectorOccupancyFromScatter(
        filteredRows,
        selectedDay === SCATTER_DAY_FILTER_ALL ? periodFechas : [selectedDay],
        umbral ?? null
      ),
    [filteredRows, periodFechas, selectedDay, umbral]
  )

  const series = useMemo(() => {
    if (franjaFilter === FRANJA_FILTER_ALL) return seriesRaw
    return seriesRaw.filter((s) => s.franja_horaria === franjaFilter)
  }, [seriesRaw, franjaFilter])

  const metrics = useMemo(() => sectorOccupancyMetrics(series), [series])

  const multiDay = series.length > 24 * 2
  const chartInterval = multiDay ? Math.max(1, Math.floor(series.length / 40)) : 3

  const exportSeries = () => {
    if (!series.length) return
    const slug = title.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    triggerBrowserCsvDownload(
      safeExportFilename(`sector_occupancy_30min_${circuitCode}_${slug}`, 'csv'),
      sectorOccupancy30MinCsv(series)
    )
  }

  const exportEvents = () => {
    if (!events.length) return
    const slug = title.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    triggerBrowserCsvDownload(
      safeExportFilename(`sector_occupancy_events_${circuitCode}_${slug}`, 'csv'),
      sectorOccupancyEventsCsv(events)
    )
  }

  if (!scatterRows.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-3 text-sm text-slate-600">
          Sin timestamps para ocupación en este tramo. Reprocesá KPI tiempos con dispersión por día.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ minWidth: 720 }}>
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Ocupación estimada cada 30 min · {circuitCode} · {periodLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              ocupación = stock inicial + ingresos acum. − egresos acum. · Stock: egreso en primeras 2 h sin ingreso
              en esa ventana (por journey).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!series.length}
              onClick={exportSeries}
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-40"
            >
              CSV 30 min
            </button>
            <button
              type="button"
              disabled={!events.length}
              onClick={exportEvents}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              CSV eventos
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-700">Fecha</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="min-w-[10rem] rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value={SCATTER_DAY_FILTER_ALL}>Todo el período</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-700">Franja</span>
            <select
              value={franjaFilter}
              onChange={(e) => setFranjaFilter(e.target.value)}
              className="min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value={FRANJA_FILTER_ALL}>Todas</option>
              {(['Mañana', 'Tarde', 'Noche'] as FranjaOperativaOccupancy[]).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-700">Estado ejecutivo</span>
            <select
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value)}
              className="min-w-[9rem] rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value={ESTADO_FILTER_ALL}>Todos</option>
              {estadoOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-slate-700">Umbral (camiones)</span>
            <input
              type="number"
              min={0}
              placeholder={umbral != null ? String(umbral) : 'sin umbral'}
              value={umbralManual}
              onChange={(e) => setUmbralManual(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-2 border-b border-slate-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          label="Ocupación inicial"
          value={String(metrics.ocupacionInicial)}
          hint="camiones ya en sector (estimado)"
        />
        <MetricCard label="Pico ocupación" value={String(metrics.picoOcupacion)} hint={metrics.fechaHoraPico} />
        <MetricCard label="Promedio" value={metrics.ocupacionPromedio.toFixed(1)} />
        <MetricCard label="P90" value={metrics.ocupacionP90.toFixed(1)} />
        <MetricCard
          label="% sobre umbral"
          value={umbral != null ? `${metrics.pctTiempoSobreUmbral}%` : '—'}
          hint={umbral != null ? `${metrics.horasSobreUmbral} h sobre umbral` : 'sin umbral'}
        />
        <MetricCard label="Total ingresos" value={String(metrics.totalIngresos)} />
        <MetricCard label="Total egresos" value={String(metrics.totalEgresos)} />
      </div>

      {!series.length ?
        <p className="px-6 py-8 text-center text-sm text-slate-600">Sin intervalos para los filtros seleccionados.</p>
      : <div className="px-6 py-4 pb-6">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, bottom: multiDay ? 36 : 20, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  interval={chartInterval}
                  angle={multiDay ? -35 : 0}
                  textAnchor={multiDay ? 'end' : 'middle'}
                  height={multiDay ? 44 : 28}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, 'auto']} />
                <Tooltip
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as (typeof series)[0] | undefined
                    if (!p) return null
                    return (
                      <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
                        <div className="font-semibold">{p.intervalo_inicio}</div>
                        <div>Ocupación estimada: {p.ocupacion_estimada}</div>
                        <div>Ocupación inicial: {p.ocupacion_inicial}</div>
                        <div>
                          Ingresos / egresos (intervalo): {p.ingresos_intervalo} / {p.egresos_intervalo}
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {umbral != null && umbral > 0 ?
                  <ReferenceLine y={umbral} stroke="#dc2626" strokeDasharray="4 2" name="Umbral operativo" />
                : null}
                <Line
                  type="monotone"
                  dataKey="ocupacion_estimada"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  dot={false}
                  name="Ocupación estimada"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      }
    </div>
  )
}
