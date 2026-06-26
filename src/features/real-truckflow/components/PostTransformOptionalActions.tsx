import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { ExcelCameraComparativaPanel } from './ExcelCameraComparativaPanel'
import { TruckFleetDatabaseSaveCard } from './TruckFleetDatabaseSaveCard'

/**
 * Acciones posteriores al transform (pasos 1–3): solo bajo demanda del usuario.
 */
export function PostTransformOptionalActions() {
  const wb = useEtlWorkbenchOptional()
  if (!wb) return null

  const hasTransform = Boolean(wb.transformResult)
  const mc = wb.transformResult?.stats.movimientosContrato
  const kpiReady = wb.kpiTiemposBuilt || wb.transformResult?.stats.kpiTiemposBuilt

  return (
    <article className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/50 via-white to-white p-6 shadow-sm">
      <h3 className="text-base font-bold text-slate-900">Pasos opcionales · manual</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        No se ejecutan con «Procesar todo». Usalos solo cuando necesites KPI, auditoría de cámaras o
        persistir visitas en Supabase.
      </p>

      {!hasTransform ?
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Completá primero los pasos 1–3 (transform).
        </p>
      : (
        <div className="mt-5 space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">A · KPI tiempos y dispersión</h4>
            <p className="mt-1 text-xs text-slate-600">
              Calcula tramos, scatter y tablas de la pestaña KPI Tiempos a partir del último transform.
            </p>
            {wb.kpiTiemposError ?
              <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {wb.kpiTiemposError}
              </p>
            : null}
            {kpiReady ?
              <p className="mt-2 text-xs font-medium text-emerald-800">KPI generado para este transform.</p>
            : null}
            <button
              type="button"
              disabled={wb.kpiTiemposBusy || wb.transformBusy}
              onClick={() => void wb.runKpiTiempos()}
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-45"
            >
              {wb.kpiTiemposBusy ? 'Calculando KPI…' : kpiReady ? 'Recalcular KPI tiempos' : 'Calcular KPI tiempos'}
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">B · Calibración de cámaras vs Excel</h4>
            <ExcelCameraComparativaPanel
              manual
              events={wb.events}
              alerts={wb.alerts}
              diskPeriod={wb.diskPeriod ?? null}
              normalizedMovimientosCsv={wb.transformResult?.csv.external_movimientos_contrato_normalized}
              excelTotalMovimientos={mc?.normalizedCount}
              disabled={wb.transformBusy}
            />
          </section>

          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/30 px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">C · Base de datos de visitas</h4>
            <TruckFleetDatabaseSaveCard embedded />
          </section>
        </div>
      )}
    </article>
  )
}
