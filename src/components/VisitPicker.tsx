import type { ReconstructedVisit } from '../domain/events'
import { detectAnomalies } from '../analytics/anomalies'

export type VisitFilter = 'all' | 'ok' | 'anomalies' | 'open'

interface VisitPickerProps {
  filteredVisits: ReconstructedVisit[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
  filter: VisitFilter
  onFilterChange: (f: VisitFilter) => void
  onLoadVisit: () => void
  onRandomOK: () => void
  onRandomAnomalies: () => void
  onOpenDetail?: (visit: ReconstructedVisit) => void
}

const FILTER_LABELS: Record<VisitFilter, string> = {
  all: 'Todos',
  ok: 'Solo válidos',
  anomalies: 'Solo anomalías',
  open: 'Solo abiertos',
}

export function VisitPicker({
  filteredVisits,
  selectedIndex,
  onSelectIndex,
  filter,
  onFilterChange,
  onLoadVisit,
  onRandomOK,
  onRandomAnomalies,
  onOpenDetail,
}: VisitPickerProps) {
  const selectedVisit = filteredVisits[selectedIndex] ?? null
  const hasData = filteredVisits.length > 0

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Visita / Camión</h3>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(FILTER_LABELS) as VisitFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilterChange(f)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      {hasData ? (
        <>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Seleccionar visita</label>
            <select
              value={selectedIndex}
              onChange={(e) => onSelectIndex(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {filteredVisits.map((v, i) => {
                const anomalies = detectAnomalies(v)
                const label = `${v.plate ?? v.visitId} · ${v.status} · ${v.cargoForm}${anomalies.length ? ` ⚠ ${anomalies.length}` : ''}`
                return (
                  <option key={v.visitId} value={i}>
                    {label}
                  </option>
                )
              })}
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={onLoadVisit}
              className="flex-1 min-w-[100px] rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              Cargar visita
            </button>
            <button
              type="button"
              onClick={() => onSelectIndex(selectedIndex > 0 ? selectedIndex - 1 : filteredVisits.length - 1)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-50"
              title="Anterior"
            >
              ◀ Anterior
            </button>
            <button
              type="button"
              onClick={() => onSelectIndex(selectedIndex < filteredVisits.length - 1 ? selectedIndex + 1 : 0)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-sm hover:bg-slate-50"
              title="Siguiente"
            >
              Siguiente ▶
            </button>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRandomOK}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:bg-slate-50"
            >
              Aleatorio OK
            </button>
            <button
              type="button"
              onClick={onRandomAnomalies}
              className="flex-1 rounded-lg border border-anomaly-200 px-2 py-1.5 text-xs text-anomaly-600 hover:bg-anomaly-100"
            >
              Aleatorio con anomalías
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
        </>
      ) : (
        <p className="text-xs text-slate-500">Importá datos y elegí planta para ver visitas.</p>
      )}
    </div>
  )
}
