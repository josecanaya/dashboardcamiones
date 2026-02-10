import { useState, useMemo } from 'react'
import { useSite } from '../../context/SiteContext'
import { useData } from '../../context/DataContext'
import { detectAnomalies } from '../../analytics/anomalies'
import { validateTrip } from '../../validation'
import type { ReconstructedVisit } from '../../domain/events'

interface VisitsListTabProps {
  onSelectVisit: (visit: ReconstructedVisit) => void
}

export function VisitsListTab({ onSelectVisit }: VisitsListTabProps) {
  const { siteId } = useSite()
  const { getVisitsBySite, lastProcessedAt } = useData()
  const visits = getVisitsBySite(siteId)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterCargo, setFilterCargo] = useState<string>('')
  const [filterAnomaly, setFilterAnomaly] = useState(false)
  const [filterValidationStatus, setFilterValidationStatus] = useState<string>('')

  const filtered = useMemo(() => {
    let list = visits
    if (filterStatus) list = list.filter((v) => v.status === filterStatus)
    if (filterCargo) list = list.filter((v) => v.cargoForm === filterCargo)
    if (filterAnomaly) list = list.filter((v) => detectAnomalies(v).length > 0)
    if (filterValidationStatus) {
      list = list.filter((v) => validateTrip(v.events).status === filterValidationStatus)
    }
    return list
  }, [visits, filterStatus, filterCargo, filterAnomaly, filterValidationStatus])

  if (!lastProcessedAt) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        Importá datos primero.
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Filtros</h2>
        <div className="flex flex-wrap gap-3">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="OPEN">En curso</option>
            <option value="CLOSED">Cerrado</option>
            <option value="REJECTED">Rechazado</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
          <select
            value={filterCargo}
            onChange={(e) => setFilterCargo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Todos los tipos</option>
            <option value="SOLID">SOLID</option>
            <option value="LIQUID">LIQUID</option>
            <option value="UNKNOWN">UNKNOWN</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filterAnomaly}
              onChange={(e) => setFilterAnomaly(e.target.checked)}
            />
            Solo con anomalías
          </label>
          <select
            value={filterValidationStatus}
            onChange={(e) => setFilterValidationStatus(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            <option value="">Validación: todas</option>
            <option value="VALID_IDEAL">Ideal</option>
            <option value="VALID_ACCEPTABLE">Aceptable</option>
            <option value="VALID_NO_DISCHARGE">Sin descarga</option>
            <option value="INVALID">Inválido</option>
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
            filtered.map((v) => {
              const anomalies = detectAnomalies(v)
              const validation = validateTrip(v.events)
              return (
                <li key={v.visitId}>
                  <button
                    type="button"
                    onClick={() => onSelectVisit(v)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{v.plate ?? v.visitId}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          v.status === 'CLOSED'
                            ? 'bg-success-100 text-green-700'
                            : v.status === 'REJECTED'
                            ? 'bg-anomaly-100 text-anomaly-600'
                            : 'bg-primary-100 text-primary-600'
                        }`}
                      >
                        {v.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          v.cargoForm === 'SOLID' ? 'bg-amber-100 text-amber-800' : v.cargoForm === 'LIQUID' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {v.cargoForm}
                      </span>
                      {v.product && <span className="text-xs text-slate-500">{v.product}</span>}
                      {v.metrics.cycleTimeMinutes != null && (
                        <span className="text-xs text-slate-500">{v.metrics.cycleTimeMinutes} min</span>
                      )}
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          validation.status === 'VALID_IDEAL'
                            ? 'bg-green-100 text-green-700'
                            : validation.status === 'INVALID'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {validation.status === 'VALID_IDEAL' ? 'Ideal' : validation.status === 'VALID_ACCEPTABLE' ? 'Acept.' : validation.status === 'VALID_NO_DISCHARGE' ? 'Sin desc.' : 'Inválido'}
                      </span>
                      {anomalies.length > 0 && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-anomaly-100 text-anomaly-600">
                          {anomalies.length} anomalía(s)
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
