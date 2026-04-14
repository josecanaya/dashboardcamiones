import { useMemo, useState } from 'react'
import { compareSectorIdAsc, type SectorSaturationSummary } from '../../services/saturationAnalytics'
import type { SiteId } from '../../domain/sites'
import { getSectorCapacityByPlant } from '../../config/sectorCapacityByPlant'
import { getSectorDisplayName } from '../../config/sectorDisplayNames'

type SortKey = 'sector' | 'nombre' | 'capacity' | 'critical' | 'excess' | 'status'

const STATUS_LABEL: Record<SectorSaturationSummary['status'], string> = {
  critico: 'Crítico',
  alto: 'Alto',
  moderado: 'Moderado',
  sin_saturacion: 'Sin saturación',
}

export interface SectorSaturationSummaryTableProps {
  siteId: SiteId
  summaries: SectorSaturationSummary[]
  selectedSectorId: string | null
  onSelectSector: (id: string | null) => void
}

export function SectorSaturationSummaryTable({
  siteId,
  summaries,
  selectedSectorId,
  onSelectSector,
}: SectorSaturationSummaryTableProps) {
  const capMap = getSectorCapacityByPlant(siteId)

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
        case 'nombre':
          return getSectorDisplayName(siteId, a.sectorId).localeCompare(getSectorDisplayName(siteId, b.sectorId), 'es') * dir
        case 'capacity': {
          const ca = capMap?.[a.sectorId]
          const cb = capMap?.[b.sectorId]
          va = ca ?? -1
          vb = cb ?? -1
          break
        }
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
  }, [summaries, sortKey, sortDir, siteId, capMap])

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir(k === 'sector' || k === 'nombre' || k === 'critical' || k === 'status' ? 'asc' : 'desc')
    }
  }

  const th = (k: SortKey, label: string) => (
    <th
      className="cursor-pointer px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-slate-600 hover:bg-slate-100"
      onClick={() => toggle(k)}
    >
      {label}
      {sortKey === k ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {th('sector', 'Código')}
            {th('nombre', 'Nombre / función')}
            {th('capacity', 'Cap. máx.')}
            {th('critical', 'Franja crítica')}
            {th('excess', 'Máx. exceso')}
            {th('status', 'Estado')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const cap = capMap?.[s.sectorId]
            return (
              <tr
                key={s.sectorId}
                className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${selectedSectorId === s.sectorId ? 'bg-amber-50' : ''}`}
                onClick={() => onSelectSector(selectedSectorId === s.sectorId ? null : s.sectorId)}
              >
                <td className="px-2 py-1.5 font-mono font-medium text-slate-900">{s.sectorId}</td>
                <td className="max-w-[200px] px-2 py-1.5 text-slate-700">{getSectorDisplayName(siteId, s.sectorId)}</td>
                <td className="px-2 py-1.5 tabular-nums text-slate-700">
                  {cap != null ? cap : '—'}
                </td>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
