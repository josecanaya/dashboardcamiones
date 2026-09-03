import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'

/**
 * Acción posterior al transform (pasos 1–3): calcular KPI tiempos bajo demanda.
 * La calibración de cámaras, líquidos, transiles y base de datos son ahora rutas
 * propias (ver `src/app/postTransformRoutes.tsx`).
 */
export function PostTransformOptionalActions() {
  const wb = useEtlWorkbenchOptional()
  if (!wb) return null

  const hasTransform = Boolean(wb.transformResult)
  const kpiReady = wb.kpiTiemposBuilt || wb.transformResult?.stats.kpiTiemposBuilt

  return (
    <article className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50/50 via-white to-white p-6 shadow-sm">
      <h3 className="text-base font-bold text-slate-900">Paso opcional · manual</h3>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        No se ejecuta con «Procesar todo». Usalo cuando necesites recalcular los KPI de tiempos.
      </p>

      {!hasTransform ?
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Completá primero los pasos 1–3 (transform).
        </p>
      : (
        <div className="mt-5">
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
            <h4 className="text-sm font-bold text-slate-900">KPI tiempos y dispersión</h4>
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
        </div>
      )}
    </article>
  )
}
