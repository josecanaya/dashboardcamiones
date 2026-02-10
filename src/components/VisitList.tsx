import { useSite } from '../context/SiteContext'
import { getVisitsBySite } from '../data/fixtures'
import type { TruckVisit } from '../domain/truck'

interface VisitListProps {
  onSelectVisit: (visitId: string) => void
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'En curso',
  CLOSED: 'Cerrado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

export function VisitList({ onSelectVisit }: VisitListProps) {
  const { siteId } = useSite()
  const visits = getVisitsBySite(siteId)

  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-3 border-b border-slate-200 bg-slate-50">
        <h2 className="text-sm font-semibold text-slate-700">Visitas en planta</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {visits.length} visita{visits.length !== 1 ? 's' : ''}
        </p>
      </div>
      <ul className="divide-y divide-slate-100 max-h-[calc(100vh-180px)] overflow-y-auto">
        {visits.length === 0 ? (
          <li className="p-4 text-sm text-slate-500 text-center">No hay visitas para esta planta.</li>
        ) : (
          visits.map((v) => (
            <VisitRow key={v.visitId} visit={v} onSelect={() => onSelectVisit(v.visitId)} />
          ))
        )}
      </ul>
    </div>
  )
}

function VisitRow({ visit, onSelect }: { visit: TruckVisit; onSelect: () => void }) {
  const statusLabel = STATUS_LABEL[visit.status] ?? visit.status
  const statusClass =
    visit.status === 'CLOSED'
      ? 'bg-success-100 text-green-700'
      : visit.status === 'REJECTED'
      ? 'bg-anomaly-100 text-anomaly-600'
      : visit.status === 'OPEN'
      ? 'bg-primary-100 text-primary-600'
      : 'bg-slate-100 text-slate-600'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex flex-col gap-1.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-slate-800">{visit.plate}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              visit.cargoForm === 'SOLID' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
            }`}
          >
            {visit.cargoForm === 'SOLID' ? 'SOLID' : 'LIQUID'}
          </span>
          <span className="text-xs text-slate-500">{visit.declaredProduct}</span>
          {visit.declaredQty != null && (
            <span className="text-xs text-slate-500">{visit.declaredQty.toLocaleString()} kg</span>
          )}
        </div>
        <div className="text-xs text-slate-400">
          {visit.visitId} · {formatDate(visit.createdAt)}
        </div>
      </button>
    </li>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
