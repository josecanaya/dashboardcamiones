import { Fragment, useMemo, useState } from 'react'
import type { SaturationAnalysisResult, SaturationEpisode } from '../../services/saturationAnalytics'
import { SATURATION_BAND_BG, SATURATION_BAND_LEGEND } from './saturationPalette'

export interface SaturationHeatmapProps {
  result: SaturationAnalysisResult
  selectedSectorId: string | null
  onSelectSector: (id: string | null) => void
  highlightedEpisode: SaturationEpisode | null
  hoverBucketIndex: number | null
  onHoverBucket: (i: number | null) => void
}

export function SaturationHeatmap({
  result,
  selectedSectorId,
  onSelectSector,
  highlightedEpisode,
  hoverBucketIndex,
  onHoverBucket,
}: SaturationHeatmapProps) {
  const [hoverSector, setHoverSector] = useState<string | null>(null)

  const matrix = useMemo(() => {
    const { sectorsOrdered, buckets, heatmapCells } = result
    const map = new Map<string, Map<number, (typeof heatmapCells)[0]>>()
    for (const c of heatmapCells) {
      if (!map.has(c.sectorId)) map.set(c.sectorId, new Map())
      map.get(c.sectorId)!.set(c.bucketIndex, c)
    }
    return { sectorsOrdered, buckets, map }
  }, [result])

  const dayHeaderCells = useMemo(() => {
    const { buckets } = matrix
    return buckets.map((b, i) => {
      const prev = buckets[i - 1]
      const isNewDay = !prev || prev.dayKeyUtc !== b.dayKeyUtc
      const name = b.weekdayLong
      const cap = name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
      return { key: `${b.index}`, showDay: isNewDay, dayTitle: cap }
    })
  }, [matrix])

  const { sectorsOrdered, buckets, map } = matrix

  if (sectorsOrdered.length === 0 || buckets.length === 0) {
    return <div className="rounded-md border border-slate-200 p-6 text-center text-sm text-slate-500">Sin datos de sectores en el período.</div>
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <div className="inline-block min-w-full p-2">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Ocupación vs capacidad por franja</div>
        <div
          className="grid gap-px bg-slate-300 p-px"
          style={{
            gridTemplateColumns: `minmax(44px,auto) repeat(${buckets.length}, minmax(10px, 1fr))`,
          }}
        >
          <div className="bg-slate-100" />
          {dayHeaderCells.map((d, i) => (
            <div
              key={`d-${d.key}`}
              className="flex items-end justify-center bg-slate-100 px-0.5 pb-0.5 text-center text-[9px] font-medium capitalize leading-tight text-slate-700"
              title={buckets[i] ? new Date(buckets[i]!.startMs).toISOString() : ''}
            >
              {d.showDay ? d.dayTitle : ''}
            </div>
          ))}
          <div className="bg-slate-50 text-[8px] text-slate-500">Hora</div>
          {buckets.map((b) => (
            <div
              key={`t-${b.index}`}
              className={`bg-slate-50 px-0.5 py-0.5 text-center text-[8px] leading-tight text-slate-600 ${
                hoverBucketIndex === b.index ? 'ring-1 ring-slate-500' : ''
              }`}
              title={new Date(b.startMs).toISOString()}
              onMouseEnter={() => onHoverBucket(b.index)}
              onMouseLeave={() => onHoverBucket(null)}
            >
              {b.tickLabel6h || ''}
            </div>
          ))}
          {sectorsOrdered.map((sec) => (
            <Fragment key={sec}>
              <button
                type="button"
                onClick={() => onSelectSector(selectedSectorId === sec ? null : sec)}
                className={`flex items-center bg-slate-50 px-1 py-0.5 text-left text-[10px] font-medium text-slate-800 hover:bg-slate-100 ${
                  selectedSectorId === sec ? 'ring-1 ring-slate-700' : ''
                } ${hoverSector === sec ? 'bg-slate-200' : ''}`}
                onMouseEnter={() => setHoverSector(sec)}
                onMouseLeave={() => setHoverSector(null)}
              >
                {sec}
              </button>
              {buckets.map((b) => {
                const cell = map.get(sec)?.get(b.index)
                const band = cell?.band ?? 'normal'
                const epSel =
                  highlightedEpisode &&
                  highlightedEpisode.sectorId === sec &&
                  highlightedEpisode.startMs < b.endMs &&
                  highlightedEpisode.endMs > b.startMs
                const from = new Date(b.startMs).toLocaleString('es-AR', { timeZone: 'UTC' })
                const to = new Date(b.endMs).toLocaleString('es-AR', { timeZone: 'UTC' })
                const tip = cell
                  ? `Sector ${sec}\n${from} – ${to}\nOcupación estimada: ${cell.occupancy}\nCapacidad: ${cell.capacity ?? '—'}\nUtilización: ${cell.utilization != null ? `${Math.round(cell.utilization * 100)}%` : '—'}${cell.capacity && cell.occupancy > cell.capacity ? `\nExceso: ${cell.occupancy - cell.capacity}` : ''}`
                  : sec
                return (
                  <div
                    key={`${sec}-${b.index}`}
                    role="button"
                    tabIndex={0}
                    className={`relative min-h-[22px] min-w-[10px] cursor-pointer ${SATURATION_BAND_BG[band]} ${
                      hoverSector === sec || hoverBucketIndex === b.index ? 'ring-1 ring-slate-500 ring-inset z-10' : ''
                    } ${epSel ? 'ring-2 ring-rose-400 ring-inset' : ''}`}
                    title={tip}
                    onClick={() => onSelectSector(sec)}
                    onMouseEnter={() => {
                      setHoverSector(sec)
                      onHoverBucket(b.index)
                    }}
                    onMouseLeave={() => {
                      setHoverSector(null)
                      onHoverBucket(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelectSector(sec)
                      }
                    }}
                  >
                    <span className="sr-only">{tip.replace(/\n/g, ' · ')}</span>
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${SATURATION_BAND_LEGEND.normal}`} /> Todo bien (&lt;80% capacidad)
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${SATURATION_BAND_LEGEND.high}`} /> Cerca del límite (80–100%)
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${SATURATION_BAND_LEGEND.saturated}`} /> Colapsado (&gt;100%)
          </span>
          <span className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${SATURATION_BAND_LEGEND.severe}`} /> Muy severo (≥120%)
          </span>
        </div>
      </div>
    </div>
  )
}
