import { useMemo } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
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
import {
  computeSegmentTramoHourlyFlow,
  countSegmentTramoFlowPlacement,
  segmentTramoFlowCsv,
  segmentTramoFlowMetrics,
} from '../etlWorkbench/etlSegmentTramoFlow'
import { safeExportFilename } from '../../../utils/chartExport'

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</div>
      {hint ?
        <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>
      : null}
    </div>
  )
}

export function SegmentTramoFlowChartPanel({
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
  const slots = useMemo(
    () => computeSegmentTramoHourlyFlow(scatterRows, periodFechas),
    [scatterRows, periodFechas]
  )

  const metrics = useMemo(() => segmentTramoFlowMetrics(slots), [slots])

  const placement = useMemo(
    () => countSegmentTramoFlowPlacement(scatterRows, periodFechas),
    [scatterRows, periodFechas]
  )

  const sinColocar =
    scatterRows.length > 0 &&
    metrics.totalIngresos === 0 &&
    metrics.totalEgresos === 0

  const multiDay = periodFechas.length > 1 || new Set(scatterRows.map((r) => r.fecha_tramo)).size > 1

  const chartInterval = multiDay ? Math.max(0, Math.floor(slots.length / 24) - 1) : 1

  const dayBoundaryLabels = useMemo(() => {
    if (!multiDay) return [] as string[]
    const out: string[] = []
    for (const s of slots) {
      if (s.axisLabel) out.push(s.label)
    }
    return out
  }, [slots, multiDay])

  const exportCsv = () => {
    if (!slots.length) return
    const slug = title.replace(/\s*→\s*/g, '_').replace(/[^\w-]+/g, '_')
    triggerBrowserCsvDownload(
      safeExportFilename(`kpi_flujo_${circuitCode}_${slug}`, 'csv'),
      segmentTramoFlowCsv(slots)
    )
  }

  if (!scatterRows.length) {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
        <p className="mt-3 text-sm text-slate-600">
          Sin timestamps de inicio/fin para este tramo. Necesitás Excel-first o Truckflow con hora en el tramo
          (reprocesá KPI tiempos).
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
              Flujo en tramo · Circuito {circuitCode} · {periodLabel} · {scatterRows.length.toLocaleString('es-AR')}{' '}
              operaciones con hora
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ingreso = inicio del tramo · Egreso = fin del tramo · Línea ámbar = camiones estimados dentro del tramo
              (acumulado horario).
            </p>
          </div>
          <button
            type="button"
            disabled={!slots.length}
            onClick={exportCsv}
            className="shrink-0 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-40"
          >
            Export CSV flujo
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pico en tramo" value={String(metrics.picoEnTramo)} hint={metrics.horaPicoEnTramo} />
        <MetricCard label="Pico ingresos / h" value={String(metrics.picoIngresos)} />
        <MetricCard label="Pico egresos / h" value={String(metrics.picoEgresos)} />
        <MetricCard
          label="Total ingresos / egresos"
          value={`${metrics.totalIngresos} / ${metrics.totalEgresos}`}
          hint="en el período"
        />
      </div>

      {sinColocar ?
        <div className="mx-6 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
          Hay {scatterRows.length} operaciones con hora, pero ninguna cayó en el calendario del gráfico (
          {placement.ingresosColocados} ingresos / {placement.egresosColocados} egresos ubicados). Revisá
          timestamps o reprocesá KPI tiempos.
        </div>
      : placement.ingresosColocados < scatterRows.length * 0.5 ?
        <div className="mx-6 mb-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          Ubicadas en el calendario: {placement.ingresosColocados} ingresos y {placement.egresosColocados}{' '}
          egresos de {placement.filas} operaciones.
        </div>
      : null}

      <div className="px-6 py-4">
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={slots} margin={{ top: 12, right: 48, bottom: multiDay ? 40 : 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              {dayBoundaryLabels.map((x) => (
                <ReferenceLine key={x} x={x} stroke="#94a3b8" strokeDasharray="4 3" />
              ))}
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={chartInterval}
                angle={multiDay ? -35 : 0}
                textAnchor={multiDay ? 'end' : 'middle'}
                height={multiDay ? 48 : 28}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#64748b' }}
                allowDecimals={false}
                label={{
                  value: 'Ingresos / Egresos (cam/h)',
                  angle: -90,
                  position: 'insideLeft',
                  offset: 4,
                  fontSize: 11,
                  fill: '#64748b',
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#b45309' }}
                allowDecimals={false}
                label={{
                  value: 'En tramo',
                  angle: 90,
                  position: 'insideRight',
                  offset: 4,
                  fontSize: 11,
                  fill: '#b45309',
                }}
              />
              <Tooltip
                content={({ payload }) => {
                  const p = payload?.[0]?.payload as (typeof slots)[0] | undefined
                  if (!p) return null
                  const when =
                    p.fecha ? `${p.fecha} ${String(p.hour).padStart(2, '0')}:00` : p.label
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs shadow-lg">
                      <div className="font-semibold text-slate-900">{when}</div>
                      <div className="mt-1 text-emerald-700">Ingresos al tramo: {p.ingresos}</div>
                      <div className="text-rose-700">Egresos del tramo: {p.egresos}</div>
                      <div className="text-amber-800">Camiones en tramo: {p.camionesEnTramo}</div>
                      <div className="text-slate-600">Saldo hora: {p.saldoHorario >= 0 ? '+' : ''}{p.saldoHorario}</div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="ingresos"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                name="Ingresos"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="egresos"
                stroke="#dc2626"
                strokeWidth={2}
                dot={false}
                name="Egresos"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="camionesEnTramo"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={false}
                name="Camiones en tramo"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
