import type { SaturationAnalysisResult, SaturationEpisode } from '../../services/saturationAnalytics'

export interface SaturationEpisodesTimelineProps {
  result: SaturationAnalysisResult
  filterSectorId: string | null
  selectedEpisode: SaturationEpisode | null
  onSelectEpisode: (ep: SaturationEpisode | null) => void
  orderBy: 'duration' | 'count'
}

export function SaturationEpisodesTimeline({
  result,
  filterSectorId,
  selectedEpisode,
  onSelectEpisode,
  orderBy,
}: SaturationEpisodesTimelineProps) {
  const { rangeStartMs, rangeEndMs, summaries, episodesBySector } = result
  const totalMs = rangeEndMs - rangeStartMs
  if (totalMs <= 0) return null

  let rows = filterSectorId ? summaries.filter((s) => s.sectorId === filterSectorId) : [...summaries]
  if (orderBy === 'count') {
    rows = [...rows].sort((a, b) => b.episodeCount - a.episodeCount || b.totalSaturatedMinutes - a.totalSaturatedMinutes)
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">Episodios de saturación en el tiempo</div>
      <div className="relative min-h-[120px] space-y-2">
        <div className="mb-1 flex h-5 text-[9px] text-slate-400">
          <div className="w-12 shrink-0" />
          <div className="relative flex-1 border-b border-slate-200">
            <span className="absolute left-0 top-0">{new Date(rangeStartMs).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</span>
            <span className="absolute right-0 top-0">{new Date(rangeEndMs).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</span>
          </div>
        </div>
        {rows.map((row) => {
          const eps = episodesBySector.get(row.sectorId) ?? []
          if (eps.length === 0) {
            return (
              <div key={row.sectorId} className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-10 shrink-0 font-medium text-slate-600">{row.sectorId}</span>
                <span className="flex-1 italic">Sin episodios</span>
              </div>
            )
          }
          return (
            <div key={row.sectorId} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[10px] font-semibold text-slate-800">{row.sectorId}</span>
              <div className="relative h-6 flex-1 rounded bg-slate-100">
                {eps.map((ep) => {
                  const left = ((ep.startMs - rangeStartMs) / totalMs) * 100
                  const width = Math.max(0.8, ((ep.endMs - ep.startMs) / totalMs) * 100)
                  const sel = selectedEpisode?.id === ep.id
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      title={`${row.sectorId}\nInicio: ${new Date(ep.startMs).toLocaleString('es-AR')}\nFin: ${new Date(ep.endMs).toLocaleString('es-AR')}\nDuración: ${ep.durationMinutes.toFixed(0)} min\nOcupación máx.: ${ep.maxOccupancy}\nCapacidad: ${ep.capacity}\nExceso máx.: ${ep.maxExcess}\nMáx. sobre capacidad: ${ep.maxUtilizationPct.toFixed(0)}%`}
                      className={`absolute top-0.5 h-5 rounded-sm border-y border-red-800/30 ${
                        ep.severity === 'severe' ? 'bg-red-600' : 'bg-red-400'
                      } ${sel ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%`, minWidth: '4px' }}
                      onClick={() => onSelectEpisode(sel ? null : ep)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
