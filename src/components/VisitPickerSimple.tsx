/**
 * Selector de visita para simulador: lista/dropdown + cargar. Sin filtros ni aleatorio.
 */

import type { ReconstructedVisit } from '../domain/events'
import { buildTripSummaryFromEvents } from '../engine'

interface VisitPickerSimpleProps {
  visits: ReconstructedVisit[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
  onLoadVisit: () => void
  onOpenDetail?: (visit: ReconstructedVisit) => void
}

export function VisitPickerSimple({
  visits,
  selectedIndex,
  onSelectIndex,
  onLoadVisit,
  onOpenDetail,
}: VisitPickerSimpleProps) {
  const safeIndex = Math.min(selectedIndex, Math.max(0, visits.length - 1))
  const selectedVisit = visits[safeIndex] ?? null

  if (visits.length === 0) {
    return (
      <p className="text-xs text-slate-500">Importá datos y elegí planta para ver visitas.</p>
    )
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Visita</h3>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Seleccionar visita</label>
        <select
          value={safeIndex}
          onChange={(e) => onSelectIndex(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {visits.map((v, i) => {
            const summary = buildTripSummaryFromEvents(v.events)
            const label = `${v.plate ?? v.visitId} · ${summary.pathDisplay || summary.path || '—'} · ${v.metrics.cycleTimeMinutes ?? '—'} min`
            return (
              <option key={v.visitId} value={i}>
                {label}
              </option>
            )
          })}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onLoadVisit}
          className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          Cargar visita
        </button>
        <button
          type="button"
          onClick={() => onSelectIndex(safeIndex > 0 ? safeIndex - 1 : visits.length - 1)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-50"
          title="Anterior"
        >
          ◀
        </button>
        <button
          type="button"
          onClick={() => onSelectIndex(safeIndex < visits.length - 1 ? safeIndex + 1 : 0)}
          className="rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-50"
          title="Siguiente"
        >
          ▶
        </button>
      </div>
      {selectedVisit && onOpenDetail && (
        <button
          type="button"
          onClick={() => onOpenDetail(selectedVisit)}
          className="w-full text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Abrir detalle completo
        </button>
      )}
    </div>
  )
}
