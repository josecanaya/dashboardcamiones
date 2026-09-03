import type { ReactNode } from 'react'
import { useEtlWorkbenchOptional } from '../features/real-truckflow/etlWorkbench/EtlWorkbenchContext'
import { ExcelCameraComparativaPanel } from '../features/real-truckflow/components/ExcelCameraComparativaPanel'
import { LiquidMovementsPanel } from '../features/real-truckflow/components/LiquidMovementsPanel'
import { TransileInternoVolcablePanel } from '../features/real-truckflow/components/TransileInternoVolcablePanel'
import { TransileExternoCicloPanel } from '../features/real-truckflow/components/TransileExternoCicloPanel'
import { TruckFleetDatabaseSaveCard } from '../features/real-truckflow/components/TruckFleetDatabaseSaveCard'

/**
 * Marco común de las rutas post-transform: título + gate de datos. Todas
 * dependen de `wb.transformResult` (persistido en el EtlWorkbenchContext, que
 * envuelve al router), así que sobreviven al cambio de ruta.
 */
function PostTransformRoute({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: (wb: NonNullable<ReturnType<typeof useEtlWorkbenchOptional>>) => ReactNode
}) {
  const wb = useEtlWorkbenchOptional()

  if (!wb || !wb.transformResult) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Necesitás procesar el Transform (pasos 1–3) del período en <strong>Análisis local</strong> o{' '}
          <strong>Transform</strong> antes de ver este informe.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      <div className="mt-5">{children(wb)}</div>
    </section>
  )
}

/** B · Calibración de cámaras vs Excel. */
export function CalibracionCamarasRoute() {
  return (
    <PostTransformRoute
      title="Calibración de cámaras vs Excel"
      description="Cruza los movimientos de Excel contra las lecturas crudas de cámara del período."
    >
      {(wb) => (
        <ExcelCameraComparativaPanel
          manual
          events={wb.events}
          alerts={wb.alerts}
          diskPeriod={wb.diskPeriod ?? null}
          normalizedMovimientosCsv={wb.transformResult?.csv.external_movimientos_contrato_normalized}
          excelTotalMovimientos={wb.transformResult?.stats.movimientosContrato?.normalizedCount}
          disabled={wb.transformBusy}
        />
      )}
    </PostTransformRoute>
  )
}

/** D · Líquidos RicCalLiq y SL1/SL5 (S10). */
export function LiquidosRoute() {
  return (
    <PostTransformRoute
      title="Líquidos RicCalLiq y SL1/SL5 (S10)"
      description="Informe generado en el Transform (cohorte RicCalLiq, captura Renova S10, puente Ric→SL)."
    >
      {(wb) => (
        <LiquidMovementsPanel
          ricCsv={wb.transformResult?.csv.liquid_movements_riccalliq_cohort}
          slCsv={wb.transformResult?.csv.liquid_movements_sl1_sl5_s10}
          aceiteCrossCsv={wb.transformResult?.csv.liquid_movements_aceite_truckflow_excel}
          summaryCsv={wb.transformResult?.csv.liquid_movements_summary}
          ricRows={
            wb.transformResult?.tables?.liquid_movements_riccalliq_cohort?.rows as
              | Record<string, unknown>[]
              | undefined
          }
          slRows={
            wb.transformResult?.tables?.liquid_movements_sl1_sl5_s10?.rows as
              | Record<string, unknown>[]
              | undefined
          }
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
      )}
    </PostTransformRoute>
  )
}

/** E · Transile interno (Volcable 1 / 2). */
export function TransileInternoRoute() {
  return (
    <PostTransformRoute
      title="Transile interno (Volcable 1 / 2)"
      description="Sesiones con ≥4 pasadas y lapsos 20 min–3 h entre lecturas en RicVolcable1/2."
    >
      {(wb) => (
        <TransileInternoVolcablePanel
          sessionsCsv={wb.transformResult?.csv.transile_interno_volcable_sessions}
          summaryCsv={wb.transformResult?.csv.transile_interno_volcable_summary}
          sessions={
            wb.transformResult?.tables?.transile_interno_volcable_sessions?.rows as
              | import('../features/real-truckflow/etlWorkbench/transileInternoVolcable').TransileInternoSession[]
              | undefined
          }
          summary={
            wb.transformResult?.tables?.transile_interno_volcable_summary?.rows?.[0] as
              | import('../features/real-truckflow/etlWorkbench/transileInternoVolcable').TransileInternoVolcableSummary
              | undefined
          }
          disabled={wb.transformBusy}
        />
      )}
    </PostTransformRoute>
  )
}

/** E · Transile externo (es de vuelta). */
export function TransileExternoRoute() {
  return (
    <PostTransformRoute
      title="Transile externo (es de vuelta)"
      description="Movimientos Excel marcados “es de vuelta = SI”; circuito por producto (Pellet/Soja/Girasol)."
    >
      {(wb) => (
        <TransileExternoCicloPanel
          operationsCsv={wb.transformResult?.csv.transile_externo_operaciones}
          summaryCsv={wb.transformResult?.csv.transile_externo_summary}
          operations={
            wb.transformResult?.tables?.transile_externo_operaciones?.rows as
              | import('../features/real-truckflow/etlWorkbench/transileExternoCiclo').TransileExternoOperation[]
              | undefined
          }
          summary={
            wb.transformResult?.tables?.transile_externo_summary?.rows?.[0] as
              | import('../features/real-truckflow/etlWorkbench/transileExternoCiclo').TransileExternoSummary
              | undefined
          }
          disabled={wb.transformBusy}
        />
      )}
    </PostTransformRoute>
  )
}

/** C · Base de datos de visitas (persistencia Supabase). No requiere transform. */
export function BaseDatosVisitasRoute() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">Base de datos de visitas</h2>
      <p className="mt-1 text-sm text-slate-600">
        Persistí las visitas del último transform en la base (Supabase / servidor local).
      </p>
      <div className="mt-5">
        <TruckFleetDatabaseSaveCard embedded />
      </div>
    </section>
  )
}
