import { useEffect, useMemo, useState } from 'react'
import type { SiteId } from '../domain/sites'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { KpiCard } from '../components/dashboard/KpiCard'

interface OperationalAlertsPageProps {
  siteId: SiteId
  mode?: 'history' | 'notifications'
  onOpenTruck: (plate: string) => void
}

export function OperationalAlertsPage({ siteId, mode = 'notifications', onOpenTruck }: OperationalAlertsPageProps) {
  const { operationalAlerts, setAlertStatus } = useLogisticsOps()
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('OPEN')
  useEffect(() => {
    setStatusFilter(mode === 'history' ? 'RESOLVED' : 'OPEN')
  }, [mode])

  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [cameraFilter, setCameraFilter] = useState('')
  const [circuitFilter, setCircuitFilter] = useState('')

  const rows = useMemo(
    () =>
      operationalAlerts
        .filter((alert) => alert.siteId === siteId)
        .filter((alert) => (mode === 'history' ? alert.status === 'RESOLVED' : alert.status !== 'RESOLVED'))
        .filter((alert) => !severityFilter || alert.severity === severityFilter)
        .filter((alert) => !statusFilter || alert.status === statusFilter)
        .filter((alert) => !cameraFilter || (alert.cameraCode ?? '').toLowerCase().includes(cameraFilter.toLowerCase()))
        .filter((alert) => !circuitFilter || (alert.circuitoEsperado ?? '').toLowerCase().includes(circuitFilter.toLowerCase())),
    [operationalAlerts, siteId, mode, severityFilter, statusFilter, cameraFilter, circuitFilter]
  )

  const selectedAlert = rows.find((row) => row.alertId === selectedAlertId) ?? rows[0] ?? null
  const openCount = rows.filter((a) => a.status === 'OPEN').length
  const criticalCount = rows.filter((a) => a.status !== 'RESOLVED' && a.severity === 'CRITICAL').length
  const resolvedToday = rows.filter((a) => a.status === 'RESOLVED').length

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Alertas operativas · {mode === 'history' ? 'Histórico' : 'Notificaciones'}</h2>
          <p className="text-xs text-slate-500">Centro operativo de anomalías, severidad y resolución.</p>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <KpiCard title="Open" value={openCount} tone={openCount > 0 ? 'warning' : 'success'} />
          <KpiCard title="Críticas activas" value={criticalCount} tone={criticalCount > 0 ? 'danger' : 'success'} />
          <KpiCard title="Resueltas hoy" value={resolvedToday} tone="info" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-5">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Severidad</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            >
              <option value="">Estado</option>
              <option value="OPEN">OPEN</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
            <input
              value={cameraFilter}
              onChange={(e) => setCameraFilter(e.target.value)}
              placeholder="Cámara"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <input
              value={circuitFilter}
              onChange={(e) => setCircuitFilter(e.target.value)}
              placeholder="Circuito"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
            <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              Planta: {siteId}
            </div>
          </div>

          <div className="space-y-2">
            {rows.length === 0 ? (
              <div className="text-xs text-slate-500">No hay alertas para los filtros seleccionados.</div>
            ) : (
              rows.map((alert) => (
                <button
                  key={alert.alertId}
                  type="button"
                  onClick={() => setSelectedAlertId(alert.alertId)}
                  className={`w-full rounded-lg border p-2 text-left ${
                    selectedAlert?.alertId === alert.alertId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-800">{alert.type}</div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-700'
                          : alert.severity === 'HIGH'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {alert.plate} · {alert.circuitoEsperado ?? 'sin circuito'} · {alert.cameraCode ?? 'sin camara'}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">{alert.elapsedMinutes} min · {alert.status}</div>
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Detalle de alerta</h3>
          {!selectedAlert ? (
            <p className="mt-2 text-xs text-slate-500">Seleccioná una alerta para ver contexto operativo.</p>
          ) : (
            <div className="mt-2 space-y-2 text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="font-semibold text-slate-900">{selectedAlert.type}</div>
                <div className="text-slate-600">
                  {selectedAlert.plate} · {selectedAlert.circuitoEsperado ?? 'sin circuito esperado'}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-md border border-slate-200 p-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Cámara</div>
                  <div className="font-semibold text-slate-800">{selectedAlert.cameraCode ?? '—'}</div>
                </div>
                <div className="rounded-md border border-slate-200 p-1.5">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Sector</div>
                  <div className="font-semibold text-slate-800">{selectedAlert.sectorId ?? '—'}</div>
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-1.5 text-slate-700">
                Esperado: {selectedAlert.circuitoEsperado ?? '—'} | Observado: {selectedAlert.circuitoObservado ?? '—'}
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAlert.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => setAlertStatus(selectedAlert.alertId, 'ACKNOWLEDGED')}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px]"
                  >
                    Reconocer
                  </button>
                )}
                {selectedAlert.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => setAlertStatus(selectedAlert.alertId, 'RESOLVED')}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                  >
                    Resolver
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenTruck(selectedAlert.plate)}
                  className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                >
                  Ir a Planta en vivo
                </button>
              </div>
            </div>
          )}
        </aside>
      </section>
    </div>
  )
}
