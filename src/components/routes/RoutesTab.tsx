import { useState } from 'react'
import { useSite } from '../../context/SiteContext'
import { useData } from '../../context/DataContext'
import { getRouteSignature } from '../../analytics/routes'
export function RoutesTab() {
  const { siteId } = useSite()
  const { getVisitsBySite, getRoutesBySite, lastProcessedAt } = useData()
  const visits = getVisitsBySite(siteId)
  const routes = getRoutesBySite(siteId)
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null)
  const visitsForRoute = selectedSignature
    ? visits.filter((v) => getRouteSignature(v) === selectedSignature)
    : []

  if (!lastProcessedAt) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        Importá datos primero (Importar o datos de ejemplo).
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-slate-700">Rutas detectadas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700">Ruta</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Cant.</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Prom. ciclo</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">P95 ciclo</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">Prom. espera</th>
                <th className="px-3 py-2 text-right font-medium text-slate-700">% Rech.</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.signature}
                  className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                    selectedSignature === r.signature ? 'bg-primary-100' : ''
                  }`}
                  onClick={() => setSelectedSignature(selectedSignature === r.signature ? null : r.signature)}
                >
                  <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={r.signatureLabel}>
                    {r.signatureLabel}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{r.count}</td>
                  <td className="px-3 py-2 text-right">{r.cycleTimeAvg} min</td>
                  <td className="px-3 py-2 text-right">{r.cycleTimeP95} min</td>
                  <td className="px-3 py-2 text-right">{r.waitTimeAvg} min</td>
                  <td className="px-3 py-2 text-right">{r.rejectedPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {selectedSignature && visitsForRoute.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-700">Visitas con esta ruta</h3>
            <button
              type="button"
              onClick={() => setSelectedSignature(null)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cerrar
            </button>
          </div>
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {visitsForRoute.map((v) => (
              <li key={v.visitId} className="p-3 flex justify-between items-center text-sm">
                <span>{v.plate ?? v.visitId}</span>
                <span className="text-slate-500">
                  {v.metrics.cycleTimeMinutes ?? '—'} min · {v.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
