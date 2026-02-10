/**
 * Modal mínimo: path, story, flags y botón Simular.
 */

import { buildTripSummaryFromEvents } from '../engine'
import type { ReconstructedVisit } from '../domain/events'

interface VisitDetailModalProps {
  visit: ReconstructedVisit
  onClose: () => void
  onSimulate: (visit: ReconstructedVisit) => void
}

export function VisitDetailModal({ visit, onClose, onSimulate }: VisitDetailModalProps) {
  const summary = buildTripSummaryFromEvents(visit.events)
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} aria-hidden />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-slate-800">{visit.plate ?? visit.visitId}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-200 text-slate-600">✕</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <span className="text-slate-500">Path:</span>{' '}
            <span className="font-mono">{summary.pathDisplay || summary.path || '—'}</span>
          </div>
          <div>
            <span className="text-slate-500">Estado:</span>{' '}
            <span className={summary.status === 'INVALID' ? 'text-red-600' : 'text-slate-700'}>{summary.status}</span>
            {summary.flags.length > 0 && <span className="text-slate-500"> · {summary.flags.join(', ')}</span>}
          </div>
          <div>
            <span className="text-slate-500">Ciclo:</span> {visit.metrics.cycleTimeMinutes ?? '—'} min
          </div>
          <p className="text-slate-600 text-xs leading-relaxed border-t border-slate-100 pt-3" title={summary.story}>
            {summary.story}
          </p>
        </div>
        <div className="p-4 border-t border-slate-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50">
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => onSimulate(visit)}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm text-white hover:bg-primary-600"
          >
            Simular esta visita
          </button>
        </div>
      </div>
    </>
  )
}
