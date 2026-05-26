import { useMemo } from 'react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { ETL_DEV_MODE } from '../../../config/committeeEtlLite'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformPipeline'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'

const DEV_EXPORT_DEF: {
  csvKey: keyof EtlTransformOutput['csv']
  filename: string
  label: string
}[] = [
  { csvKey: 'front_events', filename: 'front_events.csv', label: 'Eventos frontales' },
  { csvKey: 'rear_events', filename: 'rear_events.csv', label: 'Eventos traseros' },
  { csvKey: 'front_alerts', filename: 'front_alerts.csv', label: 'Alertas frontales' },
  { csvKey: 'rear_alerts', filename: 'rear_alerts.csv', label: 'Alertas traseras' },
  { csvKey: 'alerts_operational', filename: 'alerts_operational.csv', label: 'Alertas operativas' },
  { csvKey: 'camera_lpr_status', filename: 'camera_lpr_status.csv', label: 'Estado LPR cámaras' },
  { csvKey: 'clean_journeys', filename: 'clean_journeys.csv', label: 'Journeys limpios' },
  { csvKey: 'classified_circuits', filename: 'classified_circuits.csv', label: 'Circuitos (intermedio)' },
  { csvKey: 'final_circuits', filename: 'final_circuits.csv', label: 'Circuitos finales' },
  {
    csvKey: 'debug_matrix_classification',
    filename: 'debug_matrix_classification.csv',
    label: 'Debug matriz clasificación',
  },
  { csvKey: 'lpr_merge_candidates', filename: 'lpr_merge_candidates.csv', label: 'LPR merge candidatos' },
  { csvKey: 'lpr_merge_applied', filename: 'lpr_merge_applied.csv', label: 'LPR merge aplicados' },
  { csvKey: 'lpr_merge_review', filename: 'lpr_merge_review.csv', label: 'LPR merge revisión' },
  { csvKey: 'unclassified_journeys', filename: 'unclassified_journeys.csv', label: 'Sin clasificar' },
  { csvKey: 'rear_only_journeys_debug', filename: 'rear_only_journeys_debug.csv', label: 'Debug sólo traseros' },
  { csvKey: 'journey_merge_candidates', filename: 'journey_merge_candidates.csv', label: 'Candidatos merge' },
  { csvKey: 'merge_candidates_debug', filename: 'merge_candidates_debug.csv', label: 'Merge (solo sugerencias)' },
  { csvKey: 'transform_summary', filename: 'transform_summary.csv', label: 'Resumen transform' },
]

const CIRCUIT_PIE_COLORS = [
  '#059669',
  '#0ea5e9',
  '#e11d48',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
]

function classificationOrder(label: string): number {
  const u = String(label ?? '').toUpperCase().trim()
  if (u === 'COMPLETO') return 10
  if (u === 'DEDUCIDO') return 20
  if (u.startsWith('INCOMPLETO')) {
    const m = /INCOMPLETO\s*\((\d+)\s*EVENTOS\)/i.exec(u)
    if (!m) return 30
    return 30 + Number(m[1])
  }
  if (u === 'ANOMALO') return 200
  return 999
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

export function TransformEtlTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult ?? null
  const exec = useMemo(() => tr?.stats.executive ?? null, [tr])
  const stats = useMemo(() => tr?.stats ?? null, [tr])

  const circuitClassificationPie = useMemo(() => {
    if (!tr?.csv?.debug_matrix_classification) {
      if (!exec) return []
      return [
        { name: 'COMPLETO', value: exec.completos },
        { name: 'DEDUCIDO', value: exec.deducidos },
        { name: 'ANOMALO', value: exec.anomalos },
        { name: 'INCOMPLETO', value: exec.incompletos },
      ]
        .filter((d) => d.value > 0)
        .map((d, idx) => ({ ...d, color: CIRCUIT_PIE_COLORS[idx % CIRCUIT_PIE_COLORS.length] }))
    }

    const { rows } = parseCsvToRecords(tr.csv.debug_matrix_classification)
    if (!rows.length) return []
    const counts = new Map<string, number>()
    for (const r of rows) {
      const matrixStatus = String(r.matrix_final_status ?? '').trim().toUpperCase()
      const usefulN = Number(String(r.useful_events_count ?? '').trim())
      if (matrixStatus === 'INCOMPLETO') {
        const k = Number.isFinite(usefulN) ? `INCOMPLETO (${usefulN} eventos)` : 'INCOMPLETO'
        counts.set(k, (counts.get(k) ?? 0) + 1)
        continue
      }
      const k = matrixStatus || 'SIN_CLASIFICACION'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, value], idx) => ({ name, value, color: CIRCUIT_PIE_COLORS[idx % CIRCUIT_PIE_COLORS.length] }))
      .sort((a, b) => {
        const oa = classificationOrder(a.name)
        const ob = classificationOrder(b.name)
        if (oa !== ob) return oa - ob
        return b.value - a.value
      })
  }, [exec, tr])

  const circuitPieTotal = circuitClassificationPie.reduce((acc, d) => acc + Math.max(0, d.value), 0)
  const circuitClassificationRows = useMemo(
    () =>
      circuitClassificationPie.map((d) => ({
        ...d,
        pct: circuitPieTotal > 0 ? Math.round((d.value / circuitPieTotal) * 10000) / 100 : 0,
      })),
    [circuitClassificationPie, circuitPieTotal]
  )

  const downloadDevCsvs = () => {
    if (!tr?.csv) return
    for (const d of DEV_EXPORT_DEF) {
      const text = tr.csv[d.csvKey]
      if (text) triggerBrowserCsvDownload(d.filename, text)
    }
  }

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        El workbench ETL no está disponible en este layout.
      </p>
    )
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50/90 via-white to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Transform</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Clasificación única de journeys y alertas para evidencia de comité. Los CSV intermedios solo están disponibles
          en modo diagnóstico DEV.
        </p>

        {!tr ?
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Aún no hay transform ejecutado. Cargá JSON en «Análisis local» y pulsá{' '}
            <strong>Procesar Transform</strong>.
          </p>
        : null}

        {wb.transformError ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950">
            {wb.transformError}
          </div>
        : null}

        {wb.transformBusy ?
          <p className="mt-4 text-sm font-semibold text-amber-800">Ejecutando transform…</p>
        : null}
      </div>

      {exec ?
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">Resumen ejecutivo</h3>
          <p className="text-sm text-slate-600">
            Período:{' '}
            <span className="font-mono font-semibold">
              {exec.periodStart || '—'}
              {exec.periodEnd && exec.periodEnd !== exec.periodStart ? ` → ${exec.periodEnd}` : ''}
            </span>
            {' · '}
            Reglas: <span className="font-mono text-xs">{tr?.rulesVersion ?? '—'}</span>
          </p>

          <article
            aria-label="Gráfico clasificación operativa de circuitos"
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Clasificación operativa de circuitos
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Total de journeys clasificados:{' '}
              <span className="font-semibold tabular-nums text-slate-700">
                {circuitPieTotal.toLocaleString()}
              </span>
            </p>
            {circuitPieTotal === 0 ?
              <p className="mt-8 text-center text-sm text-slate-400">Sin datos para esta comparación.</p>
            : <div className="mt-2 h-[220px] w-full max-w-lg mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={circuitClassificationPie}
                      dataKey="value"
                      nameKey="name"
                      cx="38%"
                      cy="50%"
                      outerRadius={72}
                      innerRadius={36}
                      paddingAngle={2}
                      minAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {circuitClassificationPie.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined, _name: string | number, item: { payload?: { value?: number } }) =>
                        value != null ?
                          [
                            `${value.toLocaleString()} (${circuitPieTotal > 0 ? `${(((item?.payload?.value ?? 0) / circuitPieTotal) * 100).toFixed(2)}%` : '0%'})`,
                            'Cantidad',
                          ]
                        : ['', '']
                      }
                      contentStyle={{
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 11, lineHeight: '18px', paddingLeft: 4 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            }
            {circuitClassificationRows.length ?
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {circuitClassificationRows.map((row) => (
                  <div
                    key={`legend-${row.name}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="font-semibold text-slate-700">{row.name}</span>
                    </div>
                    <span className="font-mono text-slate-900">
                      {row.value.toLocaleString()} · {row.pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            : null}
          </article>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Eventos" value={exec.eventCount.toLocaleString()} />
            <Metric label="Alertas" value={exec.alertCount.toLocaleString()} />
            <Metric label="Circuitos completos" value={exec.completos.toLocaleString()} />
            <Metric label="Incompletos" value={exec.incompletos.toLocaleString()} />
            <Metric label="Anómalos" value={exec.anomalos.toLocaleString()} />
            <Metric label="Deducidos" value={exec.deducidos.toLocaleString()} />
            <Metric label="Alertas LPR (LPR_MALFUNCTION)" value={exec.lprAlerts.toLocaleString()} />
            <Metric label="Alertas operativas" value={exec.operationalAlerts.toLocaleString()} />
            <Metric
              label="Alertas operativas cruzadas"
              value={exec.operationalAlertsCrossed.toLocaleString()}
            />
            <Metric
              label="Journeys con INVALID_ROUTE"
              value={exec.journeysWithInvalidRoute.toLocaleString()}
            />
            <Metric
              label="Journeys con INVALID_START_JOURNEY"
              value={exec.journeysWithInvalidJourneyStart.toLocaleString()}
            />
            <Metric
              label="Incompletos con alerta operativa"
              value={exec.incompletosWithOperationalAlert.toLocaleString()}
            />
            <Metric
              label="Anómalos con alerta operativa"
              value={exec.anomalosWithOperationalAlert.toLocaleString()}
            />
            <Metric
              label="Estado exportación"
              value={exec.exportReady ? 'Listo para Load / Export' : 'Pendiente'}
            />
          </div>

          {ETL_DEV_MODE && stats?.validation.lprMalfunctionByCamera.length ?
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-700">
                Alertas LPR por cámara (DEV)
              </summary>
              <ul className="mt-2 grid gap-1 font-mono text-[11px] text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                {stats.validation.lprMalfunctionByCamera.slice(0, 20).map((r) => (
                  <li key={r.deviceCode}>
                    {r.deviceCode}: {r.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
          : null}
          <p className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
            Continuá en <strong>Load / Export</strong> para generar los archivos <span className="font-mono text-xs">pb_*</span>{' '}
            del comité.
          </p>
        </div>
      : null}

      {ETL_DEV_MODE && stats ?
        <details className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">
            Diagnóstico DEV — CSVs intermedios y métricas técnicas
          </summary>
          <div className="mt-4 space-y-6">
            <div className="flex flex-wrap gap-2">
              {DEV_EXPORT_DEF.map((d) => (
                <button
                  key={d.filename}
                  type="button"
                  disabled={!tr?.csv[d.csvKey]}
                  onClick={() =>
                    tr?.csv[d.csvKey] ? triggerBrowserCsvDownload(d.filename, tr.csv[d.csvKey]) : undefined
                  }
                  className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs shadow-sm hover:bg-violet-50 disabled:opacity-40"
                >
                  <div className="font-bold text-violet-950">{d.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-600">{d.filename}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={downloadDevCsvs}
                disabled={!tr}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Descargar todos (DEV)
              </button>
            </div>

            <h4 className="text-sm font-bold text-slate-800">Paso 1 — clasificación frontal / trasera</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Metric label="Eventos frontales" value={stats.step1.frontEvents.toLocaleString()} />
              <Metric label="Eventos traseros excl." value={stats.step1.rearEvents.toLocaleString()} />
              <Metric label="% eventos traseros (excl.)" value={`${stats.step1.pctExcludedEvents}%`} />
              <Metric label="Alertas frontales" value={stats.step1.frontAlerts.toLocaleString()} />
              <Metric label="Alertas traseras excl." value={stats.step1.rearAlerts.toLocaleString()} />
            </div>

            <h4 className="text-sm font-bold text-slate-800">Control de coherencia</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Circuitos finales" value={stats.coherence.final_circuits_count.toLocaleString()} />
              <Metric label="Circuitos completos" value={stats.coherence.final_circuitos_completos.toLocaleString()} />
              <Metric label="Incompletos revisión" value={stats.coherence.final_incompletos_revision.toLocaleString()} />
              <Metric label="Journeys tras filtro" value={stats.coherence.journeys_after_rear_filter.toLocaleString()} />
            </div>
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                stats.coherence.coherenceLabel === 'Coherente' ?
                  'border-emerald-200 bg-emerald-50 text-emerald-950'
                : stats.coherence.coherenceLabel === 'Fragmentación alta' ?
                  'border-rose-200 bg-rose-50 text-rose-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              <div className="font-bold">{stats.coherence.coherenceLabel}</div>
              {stats.coherence.coherenceDetail ?
                <p className="mt-2 text-[13px] leading-relaxed opacity-95">{stats.coherence.coherenceDetail}</p>
              : null}
            </div>

            <p className="text-xs text-slate-500">
              Candidatos merge: gap fijo 120 min — merge automático no aplicado; ver{' '}
              <span className="font-mono">merge_candidates_debug.csv</span>.
            </p>
          </div>
        </details>
      : null}
    </section>
  )
}
