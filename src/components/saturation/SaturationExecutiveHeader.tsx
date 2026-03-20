import type { SiteId } from '../../domain/sites'
import { SITES } from '../../domain/sites'
import type { SaturationGranularity } from '../../services/saturationAnalytics'
import type { SaturationPeriodPreset } from '../../hooks/useSaturationAnalysis'

export interface SaturationExecutiveHeaderProps {
  siteId: SiteId
  onSiteChange: (id: SiteId) => void
  periodPreset: SaturationPeriodPreset
  onPeriodChange: (p: SaturationPeriodPreset) => void
  granularity: SaturationGranularity
  onGranularityChange: (g: SaturationGranularity) => void
}

export function SaturationExecutiveHeader({
  siteId,
  onSiteChange,
  periodPreset,
  onPeriodChange,
  granularity,
  onGranularityChange,
}: SaturationExecutiveHeaderProps) {
  return (
    <header className="flex flex-col gap-2 border-b border-slate-200 pb-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Saturación por sector</h1>
        <p className="mt-0.5 text-xs text-slate-500">Detección de episodios críticos y contexto operativo</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={siteId}
          onChange={(e) => onSiteChange(e.target.value as SiteId)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
        >
          {SITES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={periodPreset}
          onChange={(e) => onPeriodChange(e.target.value as SaturationPeriodPreset)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
        >
          <option value="last_day">Último día</option>
          <option value="last_week">Última semana</option>
          <option value="last_month">Último mes</option>
        </select>
        <select
          value={granularity}
          onChange={(e) => onGranularityChange(e.target.value as SaturationGranularity)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
        >
          <option value="hour">Hora</option>
          <option value="30min">Bloque 30 min</option>
          <option value="day">Día</option>
        </select>
      </div>
    </header>
  )
}
