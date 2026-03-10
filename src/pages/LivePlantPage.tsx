import { useCallback, useEffect, useMemo, useState } from 'react'
import TruckRouteSimulator from '../components/TruckRouteSimulator'
import type { IfcSelectedTruckInfo, PlantId } from '../components/IfcViewer'
import type { ReconstructedVisit } from '../domain/events'
import { useLogisticsOps } from '../context/LogisticsOpsContext'
import { useSite } from '../context/SiteContext'

interface LivePlantPageProps {
  onOpenVisitDetail?: (visit: ReconstructedVisit) => void
  focusPlate?: string | null
  onFocusPlateHandled?: () => void
}

export function LivePlantPage({ onOpenVisitDetail, focusPlate, onFocusPlateHandled }: LivePlantPageProps) {
  const { siteId } = useSite()
  const { cameraEvents, operationalAlerts, trucksInPlant } = useLogisticsOps()
  const [alertKindFilter, setAlertKindFilter] = useState<'ALL' | 'DESVIO' | 'DEMORA'>('ALL')
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null)
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null)
  const [operationFilter, setOperationFilter] = useState<"ALL" | IfcSelectedTruckInfo["operationType"]>('ALL')
  const [fleetSummary, setFleetSummary] = useState({ enPlanta: 0, despachando: 0, recepcion: 0, transile: 0 })
  const [streamTick, setStreamTick] = useState(6)

  const siteEvents = useMemo(() => cameraEvents.filter((event) => event.siteId === siteId), [cameraEvents, siteId])
  const siteAlerts = useMemo(() => operationalAlerts.filter((alert) => alert.siteId === siteId), [operationalAlerts, siteId])
  const siteTrucks = useMemo(() => trucksInPlant.filter((truck) => truck.siteId === siteId), [trucksInPlant, siteId])

  const cameraStreamSource = useMemo(
    () =>
      [...siteEvents]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(-48),
    [siteEvents]
  )

  useEffect(() => {
    if (cameraStreamSource.length <= 6) return
    const timer = window.setInterval(() => {
      setStreamTick((prev) => (prev >= cameraStreamSource.length ? 6 : prev + 1))
    }, 1800)
    return () => window.clearInterval(timer)
  }, [cameraStreamSource.length])

  const activeAlertCount = siteAlerts.filter((a) => a.status !== 'RESOLVED').length
  const criticalAlertCount = siteAlerts.filter((a) => a.status !== 'RESOLVED' && a.severity === 'CRITICAL').length

  const deviationOrDelayAlerts = useMemo(
    () =>
      siteAlerts
        .filter((alert) => alert.status !== 'RESOLVED')
        .filter((alert) => {
          const isDeviation = alert.type === 'FUERA_CIRCUITO' || alert.type === 'CONFLICTO_CIRCUITO_CAMARA'
          const isDelay = alert.type === 'EXCESO_TIEMPO_SECTOR' || alert.type === 'SIN_ACTUALIZACION'
          if (alertKindFilter === 'DESVIO') return isDeviation
          if (alertKindFilter === 'DEMORA') return isDelay
          return isDeviation || isDelay
        })
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [siteAlerts, alertKindFilter]
  )

  const trucksWithDeviationOrDelay = useMemo(() => {
    const truckIds = new Set(deviationOrDelayAlerts.map((alert) => alert.camionId))
    return siteTrucks.filter((truck) => truckIds.has(truck.camionId))
  }, [deviationOrDelayAlerts, siteTrucks])

  const selectedAlert = useMemo(
    () => deviationOrDelayAlerts.find((alert) => alert.alertId === selectedAlertId) ?? deviationOrDelayAlerts[0] ?? null,
    [deviationOrDelayAlerts, selectedAlertId]
  )

  const selectedTruck = useMemo(
    () => trucksWithDeviationOrDelay.find((truck) => truck.camionId === selectedTruckId) ?? trucksWithDeviationOrDelay[0] ?? null,
    [trucksWithDeviationOrDelay, selectedTruckId]
  )

  const handleLiveFleetChange = useCallback((fleet: IfcSelectedTruckInfo[], _plant: PlantId) => {
    const despachando = fleet.filter((truck) => truck.operationType === 'DESPACHANDO').length
    const recepcion = fleet.filter((truck) => truck.operationType === 'RECEPCION').length
    const transile = fleet.filter((truck) => truck.operationType === 'TRANSILE').length
    setFleetSummary({ enPlanta: fleet.length, despachando, recepcion, transile })
  }, [])

  useEffect(() => {
    if (!selectedAlert) return
    setSelectedTruckId(selectedAlert.camionId)
  }, [selectedAlert])

  const streamWindow = useMemo(
    () => cameraStreamSource.slice(Math.max(0, streamTick - 6), streamTick).reverse(),
    [cameraStreamSource, streamTick]
  )

  const lastStreamEvent = cameraStreamSource.length > 0 ? cameraStreamSource[cameraStreamSource.length - 1] : undefined
  const lastUpdate = lastStreamEvent?.timestamp
    ? new Date(lastStreamEvent.timestamp).toLocaleTimeString('es-AR')
    : '—'

  const selectedAlertTypeLabel = (type: string) => {
    if (type === 'FUERA_CIRCUITO' || type === 'CONFLICTO_CIRCUITO_CAMARA') return 'Desvio'
    if (type === 'EXCESO_TIEMPO_SECTOR' || type === 'SIN_ACTUALIZACION') return 'Demora'
    return 'Alerta'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <div>
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Planta en vivo</h2>
            <p className="text-[9px] text-slate-500">Estado actual, trazabilidad y alertas.</p>
          </div>
          <div className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
            Última actualización: {lastUpdate}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Estado general: <strong className="text-emerald-700">Operativo</strong></span>
          <button
            type="button"
            onClick={() => setOperationFilter('ALL')}
            className={`rounded border px-2 py-0.5 text-slate-600 ${operationFilter === 'ALL' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
          >
            En planta: <strong className="text-slate-800">{fleetSummary.enPlanta}</strong>
          </button>
          <button
            type="button"
            onClick={() => setOperationFilter('DESPACHANDO')}
            className={`rounded border px-2 py-0.5 text-slate-600 ${operationFilter === 'DESPACHANDO' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
          >
            Despachando: <strong className="text-slate-800">{fleetSummary.despachando}</strong>
          </button>
          <button
            type="button"
            onClick={() => setOperationFilter('RECEPCION')}
            className={`rounded border px-2 py-0.5 text-slate-600 ${operationFilter === 'RECEPCION' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
          >
            Recepción: <strong className="text-slate-800">{fleetSummary.recepcion}</strong>
          </button>
          <button
            type="button"
            onClick={() => setOperationFilter('TRANSILE')}
            className={`rounded border px-2 py-0.5 text-slate-600 ${operationFilter === 'TRANSILE' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
          >
            Transile: <strong className="text-slate-800">{fleetSummary.transile}</strong>
          </button>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Alertas: <strong className="text-slate-800">{activeAlertCount}</strong></span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Críticas: <strong className="text-slate-800">{criticalAlertCount}</strong></span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Camiones con desvío/demora: <strong className="text-slate-800">{trucksWithDeviationOrDelay.length}</strong></span>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-2 xl:grid-cols-[1fr_360px] overflow-hidden">
        <div className="min-h-0 min-w-0 overflow-hidden">
          <TruckRouteSimulator
            onOpenVisitDetail={onOpenVisitDetail}
            fleetOperationFilter={operationFilter}
            onFleetOperationFilterChange={setOperationFilter}
            focusPlate={focusPlate}
            onFocusPlateHandled={onFocusPlateHandled}
            onLiveFleetChange={handleLiveFleetChange}
          />
        </div>

        <aside className="flex min-h-0 flex-col space-y-2 overflow-y-auto">
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="flex items-center justify-between gap-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Alertas de desvíos y demoras</h3>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                {deviationOrDelayAlerts.length}
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => setAlertKindFilter('ALL')}
                className={`rounded-md border px-2 py-1 ${alertKindFilter === 'ALL' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setAlertKindFilter('DESVIO')}
                className={`rounded-md border px-2 py-1 ${alertKindFilter === 'DESVIO' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
              >
                Desviados
              </button>
              <button
                type="button"
                onClick={() => setAlertKindFilter('DEMORA')}
                className={`rounded-md border px-2 py-1 ${alertKindFilter === 'DEMORA' ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
              >
                Demorados
              </button>
            </div>
            <div className="mt-1 max-h-[120px] space-y-1 overflow-y-auto pr-1">
              {deviationOrDelayAlerts.length === 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-500">
                  No hay alertas abiertas de desvío o demora.
                </div>
              )}
              {deviationOrDelayAlerts.map((alert) => (
                <button
                  key={alert.alertId}
                  type="button"
                  onClick={() => {
                    setSelectedAlertId(alert.alertId)
                    setSelectedTruckId(alert.camionId)
                  }}
                  className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                    selectedAlert?.alertId === alert.alertId ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{alert.plate}</span>
                    <span className="text-[10px] text-slate-500">{selectedAlertTypeLabel(alert.type)}</span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {alert.cameraCode ?? 'sin camara'} · {alert.sectorId ?? 'sin sector'} · {alert.elapsedMinutes} min
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Contexto del camión</h3>
            {!selectedTruck ? (
              <p className="mt-1 text-[11px] text-slate-500">Seleccioná un camión desviado o demorado.</p>
            ) : (
              <div className="mt-1 space-y-1.5 text-[11px]">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-1.5">
                  <div className="text-sm font-bold text-blue-700">{selectedTruck.plate}</div>
                  <div className="text-slate-600">{selectedTruck.circuitoEstimado} · {selectedTruck.estadoOperativo}</div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <div className="rounded-md border border-slate-200 p-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Última cámara</div>
                    <div className="font-semibold text-slate-800">{selectedTruck.camaraActual}</div>
                  </div>
                  <div className="rounded-md border border-slate-200 p-1">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Sector actual</div>
                    <div className="font-semibold text-slate-800">{selectedTruck.sectorActual}</div>
                  </div>
                </div>
                <div className="rounded-md border border-slate-200 p-1">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Secuencia parcial</div>
                  <div className="mt-0.5 truncate text-slate-700" title={selectedTruck.secuenciaParcialCamaras.join(' -> ')}>{selectedTruck.secuenciaParcialCamaras.join(' → ')}</div>
                </div>
              </div>
            )}
          </div>
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Registro de cámaras en vivo</h3>
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">REC</span>
            </div>
            {streamWindow.length === 0 ? (
              <div className="text-xs text-slate-500">Sin registros recientes para esta planta.</div>
            ) : (
              <div className="max-h-[100px] space-y-1 overflow-y-auto">
                {streamWindow.map((event, idx) => (
                  <div
                    key={`${event.eventId}-${idx}`}
                    className={`flex items-center justify-between rounded-md border px-2 py-0.5 text-[11px] ${
                      idx === 0 ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <span className="font-semibold text-slate-800">{event.plate}</span>
                    <span className="text-slate-600">{event.cameraCode} · {event.sectorId}</span>
                    <span className="text-slate-500">{new Date(event.timestamp).toLocaleTimeString('es-AR')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  )
}
