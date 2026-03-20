/**
 * Fila de KPIs para sección Métricas y distribución de estadía.
 * Orientada a comité: 4 métricas principales + 3 de apoyo.
 *
 * Principales: Media, Moda, P90, IQR
 * Apoyo: Mediana, Desvío estándar, Distancia moda-mediana
 */

export interface StayStatsForKpi {
  count: number
  mean: number
  median: number
  mode: number
  std: number
  p90: number
  iqr: number
  distanciaModaMediana: number
}

interface KpiItemProps {
  label: string
  value: string
  unit?: string
  hint?: string
  primary?: boolean
}

function KpiItem({ label, value, unit, hint, primary }: KpiItemProps) {
  return (
    <div
      className={`flex flex-col rounded-lg border px-3 py-2 ${
        primary
          ? 'border-violet-300 bg-violet-50/60'
          : 'border-slate-200 bg-slate-50/50'
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className={`tabular-nums ${primary ? 'text-lg font-bold text-violet-800' : 'text-base font-semibold text-slate-800'}`}
        >
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div>
      )}
    </div>
  )
}

export function EstadiaKpiRow({ stats }: { stats: StayStatsForKpi }) {
  const fmt = (v: number) => v.toFixed(2)

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Métricas principales
      </div>
      <div className="flex flex-wrap gap-3">
        <KpiItem
          label="Media"
          value={fmt(stats.mean)}
          unit="h"
          hint="centro de la distribución"
          primary
        />
        <KpiItem
          label="Moda"
          value={fmt(stats.mode)}
          unit="h"
          hint="tiempo más frecuente"
          primary
        />
        <KpiItem
          label="P90"
          value={fmt(stats.p90)}
          unit="h"
          hint="90% egresa antes de"
          primary
        />
        <KpiItem
          label="IQR"
          value={fmt(stats.iqr)}
          unit="h"
          hint="dispersión 50% central"
          primary
        />
      </div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Apoyo estadístico
      </div>
      <div className="flex flex-wrap gap-3">
        <KpiItem
          label="Mediana"
          value={fmt(stats.median)}
          unit="h"
          hint="valor típico"
        />
        <KpiItem
          label="Desvío estándar"
          value={fmt(stats.std)}
          unit="h"
          hint="variabilidad"
        />
        <KpiItem
          label="Distancia moda-mediana"
          value={fmt(stats.distanciaModaMediana)}
          unit="h"
          hint="coherencia de la distribución"
        />
      </div>
    </div>
  )
}
