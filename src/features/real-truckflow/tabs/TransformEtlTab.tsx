import { useMemo } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformPipeline'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'

const EXPORT_DEF: {
  csvKey: keyof EtlTransformOutput['csv']
  filename: string
  label: string
}[] = [
  { csvKey: 'front_events', filename: 'front_events.csv', label: 'Eventos frontales' },
  { csvKey: 'rear_events', filename: 'rear_events.csv', label: 'Eventos traseros' },
  { csvKey: 'front_alerts', filename: 'front_alerts.csv', label: 'Alertas frontales' },
  { csvKey: 'rear_alerts', filename: 'rear_alerts.csv', label: 'Alertas traseras' },
  { csvKey: 'camera_lpr_status', filename: 'camera_lpr_status.csv', label: 'Estado LPR cámaras' },
  { csvKey: 'clean_journeys', filename: 'clean_journeys.csv', label: 'Journeys limpios' },
  { csvKey: 'classified_circuits', filename: 'classified_circuits.csv', label: 'Circuitos (intermedio)' },
  { csvKey: 'final_circuits', filename: 'final_circuits.csv', label: 'Circuitos finales (comité)' },
  { csvKey: 'unclassified_journeys', filename: 'unclassified_journeys.csv', label: 'Sin clasificar' },
  { csvKey: 'rear_only_journeys_debug', filename: 'rear_only_journeys_debug.csv', label: 'Debug sólo traseros' },
  { csvKey: 'journey_merge_candidates', filename: 'journey_merge_candidates.csv', label: 'Candidatos merge' },
  { csvKey: 'merged_journeys', filename: 'merged_journeys.csv', label: 'Journeys merge (pendiente)' },
  { csvKey: 'transform_summary', filename: 'transform_summary.csv', label: 'Resumen transform' },
]

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
  const stats = useMemo(() => tr?.stats ?? null, [tr])

  const downloadAllCsvs = () => {
    if (!tr?.csv) return
    for (const d of EXPORT_DEF) {
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
          Resultados del último procesamiento manual (pasos de separación frente/trasera, estado LPR, journeys y merge
          sugerido). No se recalcula al navegar entre pestañas.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <p className="max-w-xl text-xs text-slate-600">
            Candidatos merge: gap fijo de <strong>120 min</strong> (reglas {tr?.rulesVersion ?? 'ETL'}). El control de
            horas heredado no modifica ese paso.
          </p>
        </div>

        {!tr ?
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Aún no hay transform ejecutado. Cargá JSON en «Análisis local» y pulsá{' '}
            <strong>Procesar Transform</strong>.
          </p>
        : null}

        {tr ?
          <>
            <p className="mt-3 font-mono text-[11px] text-slate-500">Versión reglas: {tr.rulesVersion}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {EXPORT_DEF.map((d) => (
                <button
                  key={d.filename}
                  type="button"
                  disabled={!tr.csv[d.csvKey]}
                  onClick={() =>
                    tr.csv[d.csvKey] ? triggerBrowserCsvDownload(d.filename, tr.csv[d.csvKey]) : undefined
                  }
                  className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-left text-xs shadow-sm hover:bg-violet-50 disabled:opacity-40"
                >
                  <div className="font-bold text-violet-950">{d.label}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-600">{d.filename}</div>
                </button>
              ))}
              <button
                type="button"
                onClick={downloadAllCsvs}
                disabled={!tr}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                Descargar todos los CSV
              </button>
            </div>
          </>
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

      {stats ?
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">Paso 1 — clasificación frontal / trasera</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Eventos frontales" value={stats.step1.frontEvents.toLocaleString()} />
            <Metric label="Eventos traseros excl." value={stats.step1.rearEvents.toLocaleString()} />
            <Metric label="% eventos traseros (excl.)" value={`${stats.step1.pctExcludedEvents}%`} />
            <Metric label="Alertas frontales" value={stats.step1.frontAlerts.toLocaleString()} />
            <Metric label="Alertas traseras excl." value={stats.step1.rearAlerts.toLocaleString()} />
          </div>
          {stats.step1.deviceRearCounts.length ?
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-700">Lecturas por device trasero</div>
              <ul className="mt-2 grid gap-1 font-mono text-[11px] text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                {stats.step1.deviceRearCounts.slice(0, 30).map((r) => (
                  <li key={r.device}>
                    {r.device}: {r.count}
                  </li>
                ))}
              </ul>
            </div>
          : null}

          <h3 className="text-base font-bold text-slate-900">Control de coherencia</h3>
          <p className="text-sm text-slate-600">
            RicIngCamFrente cuenta ingresos frontales reales; INGRESO/PREINGRESO en secuencia cuentan como ingreso
            operativo para circuitos. Journeys Truckflow:{' '}
            <strong>{stats.coherence.journeys_after_rear_filter.toLocaleString()}</strong> · ingresos operativos en
            journeys: <strong>{stats.coherence.ingresos_operativos_count.toLocaleString()}</strong> · ingresos
            frontales RicIngCamFrente:{' '}
            <strong>{stats.coherence.ingreso_frontal_event_count.toLocaleString()}</strong>.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Ingresos frontales (RicIngCamFrente)"
              value={stats.coherence.ingreso_frontal_event_count.toLocaleString()}
            />
            <Metric
              label="Ingresos operativos (journeys)"
              value={stats.coherence.ingresos_operativos_count.toLocaleString()}
            />
            <Metric label="Circuitos finales" value={stats.coherence.final_circuits_count.toLocaleString()} />
            <Metric
              label="Con ingreso y egreso operativo"
              value={stats.coherence.circuitos_con_ingreso_y_egreso_operativo.toLocaleString()}
            />
            <Metric label="Circuitos completos" value={stats.coherence.final_circuitos_completos.toLocaleString()} />
            <Metric label="Circuitos probables" value={stats.coherence.final_circuitos_probables.toLocaleString()} />
            <Metric
              label="Circuitos sin ingreso frontal"
              value={stats.coherence.final_circuitos_sin_ingreso.toLocaleString()}
            />
            <Metric
              label="Probables sin egreso"
              value={stats.coherence.final_circuitos_sin_egreso.toLocaleString()}
            />
            <Metric
              label="Incompletos revisión"
              value={stats.coherence.final_incompletos_revision.toLocaleString()}
            />
            <Metric
              label="Ratio journeys / ingresos"
              value={
                stats.coherence.journey_vs_ingreso_ratio != null ?
                  stats.coherence.journey_vs_ingreso_ratio.toFixed(4)
                : '—'
              }
            />
            <Metric
              label="Ratio circuitos / ingresos"
              value={
                stats.coherence.final_circuits_vs_ingreso_ratio != null ?
                  stats.coherence.final_circuits_vs_ingreso_ratio.toFixed(4)
                : '—'
              }
            />
            <Metric
              label="Journeys tras filtro (fragmentación)"
              value={stats.coherence.journeys_after_rear_filter.toLocaleString()}
            />
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

          <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-bold text-slate-700">Motivo de exclusión (resumen cantidades)</div>
            <table className="mt-2 w-full min-w-[420px] text-left text-[12px] text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1 font-semibold">Motivo</th>
                  <th className="py-1 font-semibold">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {stats.coherence.exclusionMotives.map((row) => (
                  <tr key={row.motive} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-[11px]">{row.motive}</td>
                    <td className="py-2">{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-bold text-slate-900">Paso 2 — estado cámaras (LPR)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Metric label="Filas estado cámara" value={stats.step2.rows} />
            <Metric label="Cámaras con eventos" value={stats.step2.camerasWithEvents} />
            <Metric label="Cámaras con alerta LPR" value={stats.step2.camerasWithLpr} />
            <Metric label="Cámaras estado crítico (tasa)" value={stats.step2.criticalCameras} />
            <Metric label="Sin base de eventos" value={stats.step2.sinBaseCameras} />
          </div>

          <h3 className="text-base font-bold text-slate-900">Validación resultado (antes de Power BI)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Alertas LPR totales (LPR_MALFUNCTION)"
              value={stats.validation.totalLprMalfunctionAlerts.toLocaleString()}
            />
            <Metric
              label="Cámara con más alertas LPR"
              value={stats.validation.cameraWithMostLpr ?? '—'}
            />
            <Metric
              label="Circuitos clasificados (detectados)"
              value={stats.validation.circuitosClasificados.toLocaleString()}
            />
            <Metric
              label="Registros incompletos (operativo)"
              value={stats.validation.registrosIncompletosOperativos.toLocaleString()}
            />
            <Metric label="Sin clasificar" value={stats.validation.sinClasificar.toLocaleString()} />
            <Metric label="Journeys limpios (filas CSV)" value={stats.step3.cleanJourneysCount.toLocaleString()} />
            <Metric
              label="Candidatos merge (top filtrados)"
              value={stats.validation.mergeCandidatesFiltered.toLocaleString()}
            />
            <Metric label="Circuitos finales (comité)" value={stats.validation.final_circuits_count.toLocaleString()} />
            <Metric
              label="Candidatos antes del tope"
              value={stats.step4.candidatesBeforeCap.toLocaleString()}
            />
          </div>
          {stats.validation.lprMalfunctionByCamera.length ?
            <div className="overflow-auto rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-bold text-slate-700">Alertas LPR por cámara (deviceCode)</div>
              <ul className="mt-2 grid gap-1 font-mono text-[11px] text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
                {stats.validation.lprMalfunctionByCamera.slice(0, 40).map((r) => (
                  <li key={r.deviceCode}>
                    {r.deviceCode}: {r.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          : null}

          <h3 className="text-base font-bold text-slate-900">Paso 3 — journeys y circuitos</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Journeys totales (uid)" value={stats.step3.journeysTotal.toLocaleString()} />
            <Metric label="Journeys después filtro trasero" value={stats.step3.journeysValidFront.toLocaleString()} />
            <Metric label="Sólo cámaras excluidas (journeys)" value={stats.step3.rearOnlyExcluded.toLocaleString()} />
            <Metric label="Mixtos: lecturas traseras removidas" value={stats.step3.journeysWithRearEventsRemoved.toLocaleString()} />
            <Metric label="Single-event descartados (operativo)" value={stats.step3.single_event_discarded.toLocaleString()} />
            <Metric label="Duplicados sospechosos (flag)" value={stats.step3.duplicate_suspected.toLocaleString()} />
            <Metric label="Incompletos fuera del final CSV" value={stats.step3.incomplete_sequence_count.toLocaleString()} />
            <Metric label="Circuitos detectados (tier)" value={stats.step3.classifiedCircuitsOperational.toLocaleString()} />
            <Metric label="Circuitos incompletos (tier)" value={stats.step3.incompleteOperational.toLocaleString()} />
            <Metric label="Sin clasificar" value={stats.step3.unclassifiedCount.toLocaleString()} />
            <Metric label="Journeys limpios CSV" value={stats.step3.cleanJourneysCount.toLocaleString()} />
          </div>

          <h3 className="text-base font-bold text-slate-900">Paso 4 — candidatos merge (gap ≤120 min, máx. 500)</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Emitidos (top ordenado)" value={stats.step4.candidates.toLocaleString()} />
            <Metric label="Tipo: patente exacta" value={stats.step4.byExactPlate.toLocaleString()} />
            <Metric label="Tipo: patente similar" value={stats.step4.bySimilarPlate.toLocaleString()} />
            <Metric label="Tipo: secuencia + patente" value={stats.step4.bySequenceAndPlate.toLocaleString()} />
          </div>
        </div>
      : null}
    </section>
  )
}
