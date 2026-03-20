/**
 * Pieza 1 — Hero KPI
 * Visual protagonista: Promedio enorme, Mediana secundaria.
 * Slide-ready para apertura de KPI.
 */

export interface EstadiaHeroCardProps {
  plantName: string
  periodLabel: string
  mean: number
  median: number
}

export function EstadiaHeroCard({ plantName, periodLabel, mean, median }: EstadiaHeroCardProps) {
  return (
    <div
      className="flex min-h-[320px] flex-col justify-center rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/30 px-14 py-12 shadow-sm"
      style={{ minWidth: 720 }}
    >
      <h2 className="mb-1 text-xl font-bold tracking-tight text-slate-700">
        Tiempo de estadía en planta
      </h2>
      <div className="mb-8 flex items-center gap-3 text-sm text-slate-500">
        <span>{plantName}</span>
        <span className="text-slate-300">·</span>
        <span>{periodLabel}</span>
      </div>
      <div className="flex flex-col gap-0">
        <div className="flex items-baseline gap-3">
          <span className="text-7xl font-bold tabular-nums tracking-tight text-slate-900">
            {mean.toFixed(2)}
          </span>
          <span className="text-3xl font-medium text-slate-500">h</span>
        </div>
        <p className="mt-2 text-base font-medium text-slate-500">Promedio</p>
      </div>
      <div className="mt-10 flex items-baseline gap-3 border-t border-slate-100 pt-8">
        <span className="text-2xl font-semibold tabular-nums text-slate-600">
          {median.toFixed(2)} h
        </span>
        <span className="text-sm text-slate-400">Mediana</span>
      </div>
    </div>
  )
}
