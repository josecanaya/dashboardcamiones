import type { SaturationAnalysisResult } from '../../services/saturationAnalytics'

export function SaturationSummaryCards({ result }: { result: SaturationAnalysisResult }) {
  const { executive } = result
  const top = executive.topSector
  const totalH = executive.totalSaturatedMinutes / 60

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Sectores con saturación</div>
        <div className="text-xl font-semibold text-slate-900">{executive.sectorsWithSaturation}</div>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Episodios detectados</div>
        <div className="text-xl font-semibold text-slate-900">{executive.totalEpisodes}</div>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Tiempo total saturado</div>
        <div className="text-xl font-semibold text-slate-900">{totalH < 1 ? `${Math.round(executive.totalSaturatedMinutes)} min` : `${totalH.toFixed(1)} h`}</div>
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Sector más crítico</div>
        {top ? (
          <>
            <div className="text-xl font-semibold text-slate-900">{top.sectorId}</div>
            <div className="text-[10px] text-slate-500">
              {top.episodes} episodios · {top.hoursSaturated.toFixed(1)} h saturado
            </div>
          </>
        ) : (
          <div className="text-sm text-slate-500">—</div>
        )}
      </div>
    </div>
  )
}
