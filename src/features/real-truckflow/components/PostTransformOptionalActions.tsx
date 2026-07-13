import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { ExcelCameraComparativaPanel } from './ExcelCameraComparativaPanel'
import { LiquidMovementsPanel } from './LiquidMovementsPanel'
import { TransileInternoVolcablePanel } from './TransileInternoVolcablePanel'
import { TransileExternoCicloPanel } from './TransileExternoCicloPanel'
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

          <section className="rounded-2xl border border-sky-200 bg-sky-50/40 px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">D · Líquidos RicCalLiq y SL1/SL5 (S10)</h4>
            <p className="mt-1 text-xs text-slate-600">
              Informe generado en el Transform (cohorte RicCalLiq, captura Renova S10, puente Ric→SL).
            </p>
            <LiquidMovementsPanel
              ricCsv={wb.transformResult?.csv.liquid_movements_riccalliq_cohort}
              slCsv={wb.transformResult?.csv.liquid_movements_sl1_sl5_s10}
              aceiteCrossCsv={wb.transformResult?.csv.liquid_movements_aceite_truckflow_excel}
              summaryCsv={wb.transformResult?.csv.liquid_movements_summary}
              ricRows={wb.transformResult?.tables?.liquid_movements_riccalliq_cohort?.rows as
                | Record<string, unknown>[]
                | undefined}
              slRows={wb.transformResult?.tables?.liquid_movements_sl1_sl5_s10?.rows as
                | Record<string, unknown>[]
                | undefined}
              aceiteCrossRows={
                wb.transformResult?.tables?.liquid_movements_aceite_truckflow_excel?.rows as
                  | Record<string, unknown>[]
                  | undefined
              }
              summaryRow={
                wb.transformResult?.tables?.liquid_movements_summary?.rows?.[0] as
                  | Record<string, unknown>
                  | undefined
              }
              disabled={wb.transformBusy}
            />
          </section>

          <section className="rounded-2xl border border-violet-200 bg-violet-50/40 px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">E · Transile interno (Volcable 1 / 2)</h4>
            <p className="mt-1 text-xs text-slate-600">
              Sesiones con ≥4 pasadas y lapsos 20 min–3 h entre lecturas en RicVolcable1/2.
            </p>
            <TransileInternoVolcablePanel
              sessionsCsv={wb.transformResult?.csv.transile_interno_volcable_sessions}
              summaryCsv={wb.transformResult?.csv.transile_interno_volcable_summary}
              sessions={
                wb.transformResult?.tables?.transile_interno_volcable_sessions?.rows as
                  | import('../etlWorkbench/transileInternoVolcable').TransileInternoSession[]
                  | undefined
              }
              summary={
                wb.transformResult?.tables?.transile_interno_volcable_summary?.rows?.[0] as
                  | import('../etlWorkbench/transileInternoVolcable').TransileInternoVolcableSummary
                  | undefined
              }
              disabled={wb.transformBusy}
            />
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">E · Transile externo (es de vuelta)</h4>
            <p className="mt-1 text-xs text-slate-600">
              Movimientos Excel marcados “es de vuelta = SI”; circuito por producto (Pellet/Soja/Girasol).
            </p>
            <TransileExternoCicloPanel
              operationsCsv={wb.transformResult?.csv.transile_externo_operaciones}
              summaryCsv={wb.transformResult?.csv.transile_externo_summary}
              operations={
                wb.transformResult?.tables?.transile_externo_operaciones?.rows as
                  | import('../etlWorkbench/transileExternoCiclo').TransileExternoOperation[]
                  | undefined
              }
              summary={
                wb.transformResult?.tables?.transile_externo_summary?.rows?.[0] as
                  | import('../etlWorkbench/transileExternoCiclo').TransileExternoSummary
                  | undefined
              }
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
