import { useMemo, useState } from 'react'
import { compareSectorIdAsc, type SectorSaturationSummary } from '../../services/saturationAnalytics'

type SortKey = 'sector' | 'episodes' | 'totalMin' | 'longest' | 'critical' | 'excess' | 'status'

const STATUS_LABEL: Record<SectorSaturationSummary['status'], string> = {
  critico: 'Crítico',
  alto: 'Alto',
  moderado: 'Moderado',
  sin_saturacion: 'Sin saturación',
}

export interface SectorSaturationSummaryTableProps {
  summaries: SectorSaturationSummary[]
  selectedSectorId: string | null
  onSelectSector: (id: string | null) => void
}

export function SectorSaturationSummaryTable({
  summaries,
  selectedSectorId,
  onSelectSector,
}: SectorSaturationSummaryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('sector')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const list = [...summaries]
    list.sort((a, b) => {
      let va: string | number = 0
      let vb: string | number = 0
      switch (sortKey) {
        case 'sector':
          return compareSectorIdAsc(a.sectorId, b.sectorId) * (sortDir === 'asc' ? 1 : -1)
        case 'episodes':
          va = a.episodeCount
          vb = b.episodeCount
          break
        case 'totalMin':
          va = a.totalSaturatedMinutes
          vb = b.totalSaturatedMinutes
          break
        case 'longest':
          va = a.longestEpisodeMinutes
          vb = b.longestEpisodeMinutes
          break
        case 'critical':
          va = a.criticalBandLabel
          vb = b.criticalBandLabel
          return a.criticalBandLabel.localeCompare(b.criticalBandLabel) * dir
        case 'excess':
          va = a.maxExcess
          vb = b.maxExcess
          break
        case 'status':
          va = a.status
          vb = b.status
          return a.status.localeCompare(b.status) * dir
        default:
          break
      }
      return (Number(va) - Number(vb)) * dir
    })
    return list
  }, [summaries, sortKey, sortDir])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'sector' || k === 'critical' || k === 'status' ? 'asc' : 'desc')
    }
  }

  const th = (k: SortKey, label: string) => (
    <th className="cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-slate-600 hover:bg-slate-100" onClick={() => toggle(k)}>
      {label}
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {th('sector', 'Sector')}
            {th('episodes', 'Episodios')}
            {th('totalMin', 'Duración saturado')}
            {th('longest', 'Episodio más largo')}
            {th('critical', 'Franja crítica')}
            {th('excess', 'Máx. exceso')}
            {th('status', 'Estado')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr
              key={s.sectorId}
              className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${selectedSectorId === s.sectorId ? 'bg-amber-50' : ''}`}
              onClick={() => onSelectSector(selectedSectorId === s.sectorId ? null : s.sectorId)}
            >
              <td className="px-2 py-1.5 font-medium text-slate-900">{s.sectorId}</td>
              <td className="px-2 py-1.5 text-slate-700">{s.episodeCount}</td>
              <td className="px-2 py-1.5 text-slate-700">{s.totalSaturatedMinutes < 60 ? `${Math.round(s.totalSaturatedMinutes)} min` : `${(s.totalSaturatedMinutes / 60).toFixed(1)} h`}</td>
              <td className="px-2 py-1.5 text-slate-700">{Math.round(s.longestEpisodeMinutes)} min</td>
              <td className="px-2 py-1.5 text-slate-700">{s.criticalBandLabel}</td>
              <td className="px-2 py-1.5 text-slate-700">{s.maxExcess}</td>
              <td className="px-2 py-1.5">
                <span
                  className={
                    s.status === 'critico'
                      ? 'font-medium text-red-700'
                      : s.status === 'alto'
                        ? 'text-amber-800'
                        : s.status === 'moderado'
                          ? 'text-slate-700'
                          : 'text-slate-500'
                  }
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
