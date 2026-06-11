import type { EtlTransformOutput } from '../etlWorkbench/etlTransformPipeline'

type Props = {
  tramoCompleted: 0 | 1 | 2 | 3
  transformResult: EtlTransformOutput | null
  hasXlsx: boolean
  onOpenTransformTab?: () => void
}

export function TransformTramoSummary({
  tramoCompleted,
  transformResult,
  hasXlsx,
  onOpenTransformTab,
}: Props) {
  if (!transformResult || tramoCompleted < 1) return null

  const s3 = transformResult.stats.step3
  const exec = transformResult.stats.executive
  const coh = transformResult.stats.coherence
  const mov = transformResult.stats.movimientosContrato

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 text-sm text-slate-800">
      <p className="font-semibold text-emerald-900">
        {tramoCompleted >= 3 ?
          'Pasos 1–3 completos'
        : tramoCompleted >= 2 ?
          'Pasos 1 y 2 listos'
        : 'Paso 1 listo'}{' '}
        — seguí en esta pantalla.
      </p>

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tramoCompleted >= 1 && s3 ?
          <li className="rounded-lg bg-white/80 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">Paso 1</span>
            <div className="mt-0.5">
              {s3.journeysValidFront?.toLocaleString() ?? '—'} journeys ·{' '}
              {s3.classifiedCircuitsOperational?.toLocaleString() ?? '—'} clasificados
            </div>
          </li>
        : null}
        {tramoCompleted >= 2 && exec ?
          <li className="rounded-lg bg-white/80 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">Paso 2</span>
            <div className="mt-0.5">
              Comité: {exec.committeeCompletos ?? '—'} completos · {exec.committeeVariaciones ?? '—'} variaciones ·{' '}
              {exec.committeeAnomalias ?? '—'} anomalías
            </div>
            {coh?.final_circuits_count != null ?
              <div className="text-slate-600">{coh.final_circuits_count} circuitos finales</div>
            : null}
          </li>
        : null}
        {tramoCompleted >= 3 && mov?.enabled ?
          <li className="rounded-lg bg-white/80 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-700">Paso 3</span>
            <div className="mt-0.5">
              Excel: {mov.normalizedCount ?? '—'} movimientos · merge listo
            </div>
          </li>
        : tramoCompleted >= 2 && !hasXlsx ?
          <li className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-xs text-slate-600">
            Paso 3 omitido (sin XLSX). Cargá movimientos y ejecutá paso 3 si lo necesitás.
          </li>
        : null}
      </ul>

      {tramoCompleted >= 2 && onOpenTransformTab ?
        <button
          type="button"
          onClick={onOpenTransformTab}
          className="text-xs font-semibold text-sky-800 underline decoration-sky-300 hover:text-sky-950"
        >
          Ver tablero completo en Transform ETL (opcional)
        </button>
      : null}

      {tramoCompleted >= 2 ?
        <p className="text-xs text-slate-600">
          Paso 4 (KPI tiempos): pestaña <strong>KPI Tiempos</strong> → Procesar KPI tiempos.
        </p>
      : null}
    </div>
  )
}
