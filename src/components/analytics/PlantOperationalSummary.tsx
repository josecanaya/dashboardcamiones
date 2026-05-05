/**
 * Tarjetas de resumen rápido para la planta activa (solo presentación).
 * Replica criterios de HomePage para activos, alertas y cerrados del día ref.
 */

import { useMemo } from 'react'
import type { SiteId } from '../../domain/sites'
import type { OperationalAlert } from '../../domain/logistics'
import type { HistoricalTrip } from '../../domain/logistics'
import type { TruckInPlant } from '../../domain/logistics'

export interface PlantOperationalSummaryProps {
  siteId: SiteId
  plantLabel: string
  trucksInPlant: TruckInPlant[]
  operationalAlerts: OperationalAlert[]
  historicalTrips: HistoricalTrip[]
  /** Viajes contemplados por el período seleccionado en Analytics (lista ya filtrada) */
  tripsInPeriod: number
  refDateLabel?: string
}

export function PlantOperationalSummary({
  siteId,
  plantLabel,
  trucksInPlant,
  operationalAlerts,
  historicalTrips,
  tripsInPeriod,
  refDateLabel,
}: PlantOperationalSummaryProps) {
  const metrics = useMemo(() => {
    const maxEgresoRef =
      historicalTrips.length === 0
        ? Date.now()
        : Math.max(...historicalTrips.map((t) => new Date(t.egresoAt).getTime()))
    const refDate = new Date(maxEgresoRef)
    const fechaRef = `${refDate.getUTCFullYear()}-${String(refDate.getUTCMonth() + 1).padStart(2, '0')}-${String(refDate.getUTCDate()).padStart(2, '0')}`
    const activosEnPlanta = trucksInPlant.filter((t) => t.siteId === siteId)
    const camionIdsEnPlanta = new Set(activosEnPlanta.map((t) => t.camionId))
    const alertasActivas = operationalAlerts.filter(
      (a) => a.siteId === siteId && a.status !== 'RESOLVED' && camionIdsEnPlanta.has(a.camionId)
    ).length
    const cerradosHoy = historicalTrips.filter((h) => {
      if (h.siteId !== siteId) return false
      const fecha =
        h.fecha ??
        `${new Date(h.egresoAt).getUTCFullYear()}-${String(new Date(h.egresoAt).getUTCMonth() + 1).padStart(2, '0')}-${String(new Date(h.egresoAt).getUTCDate()).padStart(2, '0')}`
      return fecha === fechaRef
    }).length
    return {
      activos: activosEnPlanta.length,
      alertasActivas,
      cerradosHoy,
    }
  }, [historicalTrips, operationalAlerts, siteId, trucksInPlant])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Resumen operativo · {plantLabel}</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Estado en tiempo (mock) · Viajes del período en análisis: <strong>{tripsInPeriod}</strong>
          </p>
        </div>
        {refDateLabel ? (
          <span className="text-xs text-slate-400">Referencia período · {refDateLabel}</span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <div className="text-xs font-medium text-slate-500">Camiones activos en planta</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{metrics.activos}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <div className="text-xs font-medium text-slate-500">Alertas (activos en planta)</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{metrics.alertasActivas}</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3">
          <div className="text-xs font-medium text-slate-500">Circuitos cerrados (día ref.)</div>
          <div className="mt-1 text-2xl font-bold text-emerald-800">{metrics.cerradosHoy}</div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3">
          <div className="text-xs font-medium text-violet-900/70">Viajes período seleccionado</div>
          <div className="mt-1 text-2xl font-bold text-violet-900">{tripsInPeriod}</div>
        </div>
      </div>
    </section>
  )
}
