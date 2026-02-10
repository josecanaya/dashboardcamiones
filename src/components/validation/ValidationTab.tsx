import { useState, useMemo } from 'react'
import { useSite } from '../../context/SiteContext'
import { useData } from '../../context/DataContext'
import { validateTrip } from '../../validation'
import type { ReconstructedVisit } from '../../domain/events'
import type { TripValidationStatus, TripValidationFlag } from '../../validation'

const STATUS_LABELS: Record<TripValidationStatus, string> = {
  VALID_IDEAL: 'Ideal',
  VALID_ACCEPTABLE: 'Aceptable',
  VALID_NO_DISCHARGE: 'Sin descarga',
  INVALID: 'Inválido',
}

const FLAG_OPTIONS: TripValidationFlag[] = [
  'MISSING_EVENT',
  'OUT_OF_ORDER',
  'TOO_MANY_CALADAS',
  'D_WITHOUT_OK',
  'WAIT_SUSPICIOUS',
  'DUPLICATE_EVENT',
  'OPEN_TRIP',
  'INVALID_PATH',
  'NO_CALADA_RESULT',
  'VISIT_KEY_FALLBACK_USED',
]

interface ValidationTabProps {
  onSelectVisit: (visit: ReconstructedVisit) => void
}

export function ValidationTab({ onSelectVisit }: ValidationTabProps) {
  const { siteId } = useSite()
  const { getVisitsBySite, lastProcessedAt } = useData()
  const visits = getVisitsBySite(siteId)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterFlag, setFilterFlag] = useState<string>('')

  const withValidation = useMemo(() => {
    return visits.map((v) => ({ visit: v, validation: validateTrip(v.events) }))
  }, [visits])

  const filtered = useMemo(() => {
    let list = withValidation
    if (filterStatus) list = list.filter((x) => x.validation.status === filterStatus)
    if (filterFlag) list = list.filter((x) => x.validation.flags.includes(filterFlag as TripValidationFlag))
    return list
  }, [withValidation, filterStatus, filterFlag])

  if (!lastProcessedAt) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        Importá datos primero.
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Validación de recorrido</h2>
        <p className="text-xs text-slate-500 mb-3">
          Circuito A=Ingreso, B=Balanza1, C=Calada, D=Descarga, E=Balanza2, F=Egreso, G=Espera. Resultado de C: OK / NO / OBS.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Todos los status</option>
            <option value="VALID_IDEAL">{STATUS_LABELS.VALID_IDEAL}</option>
            <option value="VALID_ACCEPTABLE">{STATUS_LABELS.VALID_ACCEPTABLE}</option>
            <option value="VALID_NO_DISCHARGE">{STATUS_LABELS.VALID_NO_DISCHARGE}</option>
            <option value="INVALID">{STATUS_LABELS.INVALID}</option>
          </select>
          <select
            value={filterFlag}
            onChange={(e) => setFilterFlag(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Cualquier flag</option>
            {FLAG_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Visitas ({filtered.length})</h3>
        </div>
        <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="p-4 text-sm text-slate-500">Ninguna visita coincide con los filtros.</li>
          ) : (
            filtered.map(({ visit, validation }) => (
              <li key={visit.visitId}>
                <button
                  type="button"
                  onClick={() => onSelectVisit(visit)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{visit.plate ?? visit.visitId}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        validation.status === 'VALID_IDEAL'
                          ? 'bg-green-100 text-green-800'
                          : validation.status === 'VALID_ACCEPTABLE' || validation.status === 'VALID_NO_DISCHARGE'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-anomaly-100 text-anomaly-600'
                      }`}
                    >
                      {STATUS_LABELS[validation.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono text-slate-600">{validation.pathDisplay || '—'}</span>
                    {validation.caladaResults.length > 0 && (
                      <span className="text-slate-500">C: {validation.caladaResults.join(', ')}</span>
                    )}
                    {validation.flags.length > 0 && (
                      <span className="text-anomaly-600">{validation.flags.join(', ')}</span>
                    )}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
