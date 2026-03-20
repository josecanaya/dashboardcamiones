/**
 * Pieza 2 — KPIs complementarios
 * Grid de cards: n, Min, Max, Desvío estándar, P90, P95, IQR.
 * Slide de métricas bien diseñada.
 */

export interface StayStats {
  count: number
  min: number
  max: number
  std: number
  p90: number
  p95: number
  iqr: number
}

export interface EstadiaKpiGridProps {
  stayStats: StayStats
}

function KpiCard({
  label,
  value,
  unit,
  helper,
}: {
  label: string
  value: string
  unit?: string
  helper?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-slate-800">{value}</span>
        {unit && <span className="text-base font-medium text-slate-500">{unit}</span>}
      </div>
      {helper && <p className="mt-1 text-[11px] text-slate-400">{helper}</p>}
    </div>
  )
}

export function EstadiaKpiGrid({ stayStats }: EstadiaKpiGridProps) {
  const fmt = (v: number) => v.toFixed(2)
  return (
    <div
      className="rounded-2xl border border-slate-200/80 bg-white px-8 py-8 shadow-sm"
      style={{ minWidth: 720 }}
    >
      <h3 className="mb-6 text-lg font-semibold text-slate-700">
        Métricas complementarias
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <KpiCard label="n" value={String(stayStats.count)} helper="Observaciones" />
        <KpiCard label="Mín" value={fmt(stayStats.min)} unit="h" />
        <KpiCard label="Máx" value={fmt(stayStats.max)} unit="h" />
        <KpiCard label="Desvío estándar" value={fmt(stayStats.std)} unit="h" />
        <KpiCard label="P90" value={fmt(stayStats.p90)} unit="h" helper="Percentil 90" />
        <KpiCard label="P95" value={fmt(stayStats.p95)} unit="h" helper="Percentil 95" />
        <KpiCard label="IQR" value={fmt(stayStats.iqr)} unit="h" helper="Rango intercuartílico" />
      </div>
    </div>
  )
}
