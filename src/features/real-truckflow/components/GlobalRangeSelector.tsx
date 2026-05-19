import { StatusBadge } from './StatusBadge'
import { useRealTruckflowWorkspaceOptional } from '../RealTruckflowWorkspaceContext'
import type { WorkspaceLoadStage } from '../workspaceTypes'
import { RANGE_WARNING_HOURS } from '../workspaceConstants'
import { parseLocalPeriodEnd, parseLocalPeriodStart } from '../dateTime'

const STAGE_LABEL: Record<WorkspaceLoadStage, string> = {
  idle: 'Sin actividad',
  fetching_events: 'Cargando eventos (API)…',
  fetching_alerts: 'Cargando alertas (API)…',
  filtering_ricardone: 'Filtrando Ricardone…',
  committee_pipeline: 'Procesando pipeline comité…',
  clean_dataset: 'Generando dataset limpio…',
  committing_state: 'Actualizando interfaz…',
  ready: 'Listo',
}

export function GlobalRangeSelector() {
  const ws = useRealTruckflowWorkspaceOptional()

  if (!ws) {
    return (
      <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
        <strong className="font-semibold">Período de trabajo</strong>{' '}
        <span className="text-amber-900/95">
          (workspace no disponible — recargá la página con un refresh completo; si aparece después de guardar código, suele ser
          HMR incompleto).
        </span>
      </div>
    )
  }

  const start = parseLocalPeriodStart(ws.rangeStartDate, ws.rangeStartTime)
  const end = parseLocalPeriodEnd(ws.rangeEndDate, ws.rangeEndTime)
  const rangeHours = start <= end ? (end.getTime() - start.getTime()) / 3_600_000 : 0
  const showLargeRangeHint = rangeHours > RANGE_WARNING_HOURS

  return (
    <details className="rounded-3xl border border-dashed border-slate-300 bg-white shadow-sm">
      <summary className="cursor-pointer px-6 py-4 text-sm font-bold text-slate-800">
        Modo diagnóstico · API directa (opcional)
        <span className="mt-1 block text-xs font-normal text-slate-600">
          Para períodos largos usá «Extracción local» y «Análisis local».
        </span>
      </summary>
      <section className="mx-6 mb-6 rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Período de trabajo</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Un único rango para todas las pestañas. Consultas{' '}
            <code className="rounded bg-white px-1">/journey-event/list</code> y{' '}
            <code className="rounded bg-white px-1">/alert/list</code> siempre con{' '}
            <span className="font-mono">startDate</span> y <span className="font-mono">endDate</span>.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Tiempo máximo de carga: <span className="font-semibold">60 s</span> (luego se cancela). Presupuesto restante por request se reparte entre eventos y alertas.
          </p>
          {showLargeRangeHint ? (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
              Rango ~<strong>{rangeHours.toFixed(1)} h</strong> (&gt; {RANGE_WARNING_HOURS} h). Es probable que tarde o se cancele; recomendado trabajar en ventanas de 4–6 h. Al cargar te pediremos confirmación.
            </p>
          ) : null}
          {ws.loadedRange ? (
            <p className="mt-3 font-mono text-xs text-slate-700">
              Desde: {ws.loadedRange.startIso}
              <br />
              Hasta: {ws.loadedRange.endIso}
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">Todavía no hay período cargado.</p>
          )}
          {ws.status === 'loading' ? (
            <p className="mt-2 text-sm font-semibold text-indigo-900">{STAGE_LABEL[ws.loadStage]}</p>
          ) : null}
          {ws.cleanDatasetProcessing ? (
            <p className="mt-2 text-sm font-semibold text-violet-900">Generando dataset limpio (manual)…</p>
          ) : null}
        </div>
        <StatusBadge status={ws.status === 'loading' ? 'loading' : ws.status === 'loaded' ? 'loaded' : ws.status === 'error' ? 'error' : 'idle'} />
      </div>

      {ws.lastLoadCounts && ws.status === 'loaded' ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-800">
          <div className="font-bold text-slate-900">Última carga</div>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            <li>Eventos API: {ws.lastLoadCounts.eventsApiCount.toLocaleString()}</li>
            <li>Alertas API: {ws.lastLoadCounts.alertsApiCount.toLocaleString()}</li>
            <li>Eventos Ricardone: {ws.lastLoadCounts.ricardoneEventCount.toLocaleString()}</li>
            <li>Eventos operativos: {ws.lastLoadCounts.operationalEventCount.toLocaleString()}</li>
            <li>Alertas operativas: {ws.lastLoadCounts.operationalAlertCount.toLocaleString()}</li>
            <li>Circuitos (aprox.): {ws.lastLoadCounts.circuitsApprox.toLocaleString()}</li>
          </ul>
          {ws.cleanDatasetDeferred ? (
            <p className="mt-3 font-medium text-amber-900">
              Datos cargados. <strong>Procesamiento limpio pendiente</strong> (volumen alto). Usá el botón de abajo.
            </p>
          ) : null}
        </div>
      ) : null}

      {ws.cleanDatasetDeferred && ws.status === 'loaded' && !ws.cleanDatasetProcessing ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void ws.processDeferredCleanDataset()}
            className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-violet-800"
          >
            Procesar dataset limpio
          </button>
        </div>
      ) : null}

      {ws.cleanDatasetError ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Dataset limpio: {ws.cleanDatasetError}
        </div>
      ) : null}

      {import.meta.env.DEV && ws.lastTimingRows.length > 0 ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-600">Últimos tiempos (dev)</summary>
          <table className="mt-2 w-full border-collapse text-left">
            <thead>
              <tr>
                <th className="border border-slate-200 p-1">Etapa</th>
                <th className="border border-slate-200 p-1">ms</th>
                <th className="border border-slate-200 p-1">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {ws.lastTimingRows.map((r) => (
                <tr key={r.etapa}>
                  <td className="border border-slate-200 p-1">{r.etapa}</td>
                  <td className="border border-slate-200 p-1">{r.ms}</td>
                  <td className="border border-slate-200 p-1">{r.detalle ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Fecha inicial
          <input
            type="date"
            value={ws.rangeStartDate}
            onChange={(e) => ws.setRangeStartDate(e.target.value)}
            disabled={ws.status === 'loading'}
            className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Hora inicial
          <input
            type="time"
            value={ws.rangeStartTime}
            onChange={(e) => ws.setRangeStartTime(e.target.value)}
            disabled={ws.status === 'loading'}
            className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Fecha final
          <input
            type="date"
            value={ws.rangeEndDate}
            onChange={(e) => ws.setRangeEndDate(e.target.value)}
            disabled={ws.status === 'loading'}
            className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Hora final
          <input
            type="time"
            value={ws.rangeEndTime}
            onChange={(e) => ws.setRangeEndTime(e.target.value)}
            disabled={ws.status === 'loading'}
            className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void ws.loadPeriod()}
          disabled={ws.status === 'loading' || ws.cleanDatasetProcessing}
          className="rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {ws.status === 'loading' ? STAGE_LABEL[ws.loadStage] : 'Cargar período'}
        </button>
        <button
          type="button"
          onClick={ws.clearData}
          disabled={ws.status === 'loading'}
          className="rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          Limpiar datos
        </button>
      </div>

      {ws.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{ws.error}</div>
      ) : null}
    </section>
    </details>
  )
}
