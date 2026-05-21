import { useMemo } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'green' | 'amber' | 'rose'
}) {
  const ring =
    accent === 'green' ? 'border-emerald-200 bg-emerald-50'
    : accent === 'amber' ? 'border-amber-200 bg-amber-50'
    : accent === 'rose' ? 'border-rose-200 bg-rose-50'
    : 'border-slate-200 bg-white'
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${ring}`}>
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-600">{sub}</div> : null}
    </div>
  )
}

export function KpiComiteTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult
  const c = tr?.stats.coherence
  const s2 = tr?.stats.step2

  const periodLabel = useMemo(() => {
    if (!wb?.loadSummary?.daysDetected.length) return '—'
    const d = wb.loadSummary.daysDetected
    return d.length === 1 ? d[0] : `${d[0]} → ${d[d.length - 1]}`
  }, [wb?.loadSummary])

  const executiveFromCsv = useMemo(() => {
    const csv = tr?.csv.transform_summary
    if (!csv) return null
    const { rows } = parseCsvToRecords(csv)
    return rows[0] ?? null
  }, [tr?.csv.transform_summary])

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Workbench ETL no disponible.
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">KPIs ETL</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Métricas del último <strong>Transform</strong>. Si no ves números, cargá el período en Análisis y ejecutá
          Procesar Transform. Para Power BI ejecutivo usá Load / Export.
        </p>
        <p className="mt-2 font-mono text-xs text-slate-500">
          Período cargado: {periodLabel} · Reglas: {tr?.rulesVersion ?? '—'}
        </p>
      </div>

      {!c ?
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          Sin transform. Andá a <strong>Análisis local</strong> → Cargar período → <strong>Procesar Transform</strong>.
        </p>
      : (
        <>
          <div>
            <h3 className="text-base font-bold text-slate-900">Volumen y coherencia</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Eventos frontales" value={tr.stats.step1.frontEvents.toLocaleString()} />
              <Metric label="Eventos traseros (excl.)" value={tr.stats.step1.rearEvents.toLocaleString()} accent="amber" />
              <Metric label="Alertas frontales" value={tr.stats.step1.frontAlerts.toLocaleString()} />
              <Metric label="Alertas traseras (excl.)" value={tr.stats.step1.rearAlerts.toLocaleString()} accent="amber" />
              <Metric label="Ingresos RicIngCamFrente" value={c.ingreso_frontal_event_count.toLocaleString()} accent="green" />
              <Metric label="Ingresos operativos" value={c.ingresos_operativos_count.toLocaleString()} accent="green" />
              <Metric label="Journeys Truckflow" value={c.journeys_after_rear_filter.toLocaleString()} />
              <Metric label="Circuitos finales" value={c.final_circuits_count.toLocaleString()} />
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">Clasificación de circuitos</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric label="Completos" value={c.final_circuitos_completos.toLocaleString()} accent="green" />
              <Metric label="Probables" value={c.final_circuitos_probables.toLocaleString()} />
              <Metric label="Sin ingreso" value={c.final_circuitos_sin_ingreso.toLocaleString()} accent="amber" />
              <Metric label="Sin egreso" value={c.final_circuitos_sin_egreso.toLocaleString()} accent="amber" />
              <Metric label="Incompletos revisión" value={c.final_incompletos_revision.toLocaleString()} accent="rose" />
              <Metric label="Con ingreso+egreso operativo" value={c.circuitos_con_ingreso_y_egreso_operativo.toLocaleString()} accent="green" />
            </div>
          </div>

          <div>
            <h3 className="text-base font-bold text-slate-900">Ratios ETL</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Journeys / ingresos frontales"
                value={c.journey_vs_ingreso_ratio != null ? c.journey_vs_ingreso_ratio.toFixed(3) : '—'}
              />
              <Metric
                label="Circuitos / ingresos frontales"
                value={c.final_circuits_vs_ingreso_ratio != null ? c.final_circuits_vs_ingreso_ratio.toFixed(3) : '—'}
              />
              <Metric label="Diagnóstico" value={c.coherenceLabel} sub={c.coherenceDetail.slice(0, 120)} />
            </div>
          </div>

          {s2 ?
            <div>
              <h3 className="text-base font-bold text-slate-900">LPR / cámaras</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Filas estado cámara" value={s2.rows} />
                <Metric label="Cámaras con eventos" value={s2.camerasWithEvents} />
                <Metric label="Cámaras con LPR" value={s2.camerasWithLpr} accent="amber" />
                <Metric label="Cámaras críticas" value={s2.criticalCameras} accent="rose" />
                <Metric label="Alertas LPR totales" value={s2.totalLprMalfunctionAlerts} />
              </div>
            </div>
          : null}
        </>
      )}

      <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-slate-900">
          Cómo pasarme archivos para procesarlos
        </summary>
        <div className="mt-4 space-y-4 text-sm text-slate-700">
          <div>
            <p className="font-semibold text-slate-900">1. Datos crudos Truckflow (recomendado)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Archivos: <span className="font-mono text-xs">event-list.json</span> y{' '}
                <span className="font-mono text-xs">alert-list.json</span> por día en{' '}
                <span className="font-mono text-xs">data/truckflow/YYYY-MM-DD/</span>
              </li>
              <li>
                En la app: <strong>Extracción</strong> → rango semana → Descargar período; luego{' '}
                <strong>Análisis</strong> → Cargar período
              </li>
              <li>
                Para el asistente en Cursor: pegá el período (fechas), cantidad de eventos/alertas, o subí los JSON al
                proyecto y pedí que los lea desde esa carpeta
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">2. CSV ya transformados (Power BI / comité)</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Mínimo: <span className="font-mono text-xs">transform_summary.csv</span> +{' '}
                <span className="font-mono text-xs">final_circuits.csv</span>
              </li>
              <li>
                Opcional: <span className="font-mono text-xs">camera_lpr_status.csv</span>, eventos/alertas front/rear
              </li>
              <li>
                En la app: <strong>Load / Export</strong> → carpeta con CSV por día
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">3. Referencia DSS (comparativa)</p>
            <p className="mt-2">
              CSV con columnas <span className="font-mono text-xs">metric_key,dss_count</span>. Claves:{' '}
              <span className="font-mono text-xs">ingreso_frontal</span>,{' '}
              <span className="font-mono text-xs">ingreso_operativo</span>,{' '}
              <span className="font-mono text-xs">journeys</span>,{' '}
              <span className="font-mono text-xs">circuitos_finales</span>,{' '}
              <span className="font-mono text-xs">circuitos_completos</span>,{' '}
              <span className="font-mono text-xs">circuitos_probables</span>. Cargalo en Load / Export.
            </p>
            <pre className="mt-2 overflow-auto rounded-lg bg-slate-100 p-3 font-mono text-[11px]">
{`metric_key,dss_count
ingreso_frontal,420
journeys,510
circuitos_finales,380`}
            </pre>
          </div>
          <div>
            <p className="font-semibold text-slate-900">4. Si me escribís en el chat</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Período exacto (desde / hasta)</li>
              <li>Qué querés: extracción, transform, KPIs o Power BI</li>
              <li>Números de referencia DSS si comparás</li>
              <li>Captura de error o fila de ejemplo si algo no cuadra</li>
            </ul>
          </div>
        </div>
      </details>

      {executiveFromCsv ?
        <details className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold">Resumen transform (fila CSV)</summary>
          <pre className="mt-2 overflow-auto font-mono text-[10px]">
            {JSON.stringify(executiveFromCsv, null, 2)}
          </pre>
        </details>
      : null}
    </section>
  )
}
