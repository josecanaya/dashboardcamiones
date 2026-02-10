import { useSite } from '../../context/SiteContext'
import { useData } from '../../context/DataContext'
import { countAnomaliesByType } from '../../analytics/anomalies'

export function DashboardTab() {
  const { siteId } = useSite()
  const { getVisitsBySite, getRoutesBySite, lastProcessedAt } = useData()
  const visits = getVisitsBySite(siteId)
  const routes = getRoutesBySite(siteId)
  const anomalies = countAnomaliesByType(visits)
  const topRoutes = routes.slice(0, 3)
  const totalVisits = visits.length
  const cycleTimes = visits
    .map((v) => v.metrics.cycleTimeMinutes ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
  const avgCycle = cycleTimes.length ? Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : 0
  const p95Idx = Math.floor(cycleTimes.length * 0.95)
  const p95Cycle = cycleTimes.length ? (cycleTimes[p95Idx] ?? cycleTimes[cycleTimes.length - 1]) : 0
  const rejected = visits.filter((v) => v.status === 'REJECTED').length

  return (
    <div className="max-w-5xl space-y-6">
      {!lastProcessedAt && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          No hay datos importados. Andá a <strong>Importar</strong> y subí un CSV/Excel, o cargá datos de ejemplo.
        </div>
      )}
      {lastProcessedAt && (
        <>
          <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Dashboard</h2>
            <p className="text-xs text-slate-500 mb-4">
              Última importación: {lastProcessedAt.toLocaleString('es-AR')}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Visitas totales" value={String(totalVisits)} />
              <KPI label="Promedio ciclo (min)" value={String(avgCycle)} />
              <KPI label="P95 ciclo (min)" value={String(p95Cycle)} />
              <KPI label="Rechazados" value={String(rejected)} />
            </div>
          </div>
          <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700">Top 3 rutas</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {topRoutes.length === 0 ? (
                <li className="p-4 text-sm text-slate-500">Sin rutas detectadas.</li>
              ) : (
                topRoutes.map((r) => (
                  <li key={r.signature} className="p-3 flex justify-between items-center">
                    <span className="text-sm text-slate-700 truncate max-w-[70%]" title={r.signatureLabel}>
                      {r.signatureLabel}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{r.count} visitas</span>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-anomaly-100/50">
              <h3 className="text-sm font-semibold text-anomaly-700">Anomalías más frecuentes</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {anomalies.length === 0 ? (
                <li className="p-4 text-sm text-slate-500">Ninguna detectada.</li>
              ) : (
                anomalies.slice(0, 10).map((a) => (
                  <li key={a.code} className="p-3 flex justify-between items-center">
                    <span className="text-sm text-slate-700">{a.message}</span>
                    <span className="text-sm font-medium text-anomaly-600">{a.count}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
    </div>
  )
}
