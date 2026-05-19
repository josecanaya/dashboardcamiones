import { useEffect, useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { previousCalendarWeekRange, thisCalendarWeekRange } from '../utils/weekDateRange'

type Props = {
  onTransformSucceeded?: () => void
}

export function AnalisisLocalTab({ onTransformSucceeded }: Props) {
  const wb = useEtlWorkbenchOptional()
  const weekDefault = thisCalendarWeekRange()
  const [periodStart, setPeriodStart] = useState(weekDefault.startDate)
  const [periodEnd, setPeriodEnd] = useState(weekDefault.endDate)

  useEffect(() => {
    if (!wb?.diskPeriod) return
    setPeriodStart(wb.diskPeriod.startDate)
    setPeriodEnd(wb.diskPeriod.endDate)
  }, [wb?.diskPeriod])

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Contexto workbench ausente — verificá que la página datos reales envuelva con{' '}
        <span className="font-mono">EtlWorkbenchProvider</span>.
      </p>
    )
  }

  const s = wb.loadSummary

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50/90 via-white to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Análisis local</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Tras <strong>Extracción → Descargar período</strong>, cargá aquí la misma semana en un solo paso (todos los
          días a memoria). Luego <strong>Procesar Transform</strong> corre sobre el período completo.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={wb.busyLoad || wb.transformBusy}
            onClick={() => {
              const w = thisCalendarWeekRange()
              setPeriodStart(w.startDate)
              setPeriodEnd(w.endDate)
            }}
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 hover:bg-sky-100 disabled:opacity-50"
          >
            Semana actual
          </button>
          <button
            type="button"
            disabled={wb.busyLoad || wb.transformBusy}
            onClick={() => {
              const w = previousCalendarWeekRange()
              setPeriodStart(w.startDate)
              setPeriodEnd(w.endDate)
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Semana anterior
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-700">
            Desde
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              disabled={wb.busyLoad || wb.transformBusy}
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Hasta
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              disabled={wb.busyLoad || wb.transformBusy}
              className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={wb.busyLoad || wb.transformBusy}
            onClick={() => void wb.loadLocalPeriod(periodStart, periodEnd)}
            className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {wb.busyLoad ? 'Cargando período…' : 'Cargar período'}
          </button>
          <button
            type="button"
            disabled={wb.busyLoad || wb.transformBusy}
            onClick={() => wb.clearLoaded()}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
          >
            Limpiar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              wb.busyLoad || wb.transformBusy || (!wb.events.length && !wb.alerts.length)
            }
            onClick={async () => {
              const ok = await wb.runTransform()
              if (ok) onTransformSucceeded?.()
            }}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {wb.transformBusy ? 'Procesando transform…' : 'Procesar Transform (período completo)'}
          </button>
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Alternativa: subir JSON sueltos (más lento)
          </summary>
          <label className="mt-3 inline-flex cursor-pointer flex-col text-sm">
            <input
              type="file"
              accept=".json,application/json"
              multiple
              disabled={wb.busyLoad || wb.transformBusy}
              className="mt-2 max-w-[280px] text-xs"
              onChange={(ev) => {
                const fs = ev.target.files
                if (fs?.length) void wb.loadJsonFiles(fs)
              }}
            />
          </label>
        </details>

        {wb.loadSummary?.parseErrors.length ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-950">
            {wb.loadSummary.parseErrors.map((ln) => (
              <div key={ln}>{ln}</div>
            ))}
          </div>
        : null}

        {wb.transformError ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {wb.transformError}
          </div>
        : null}

        {(wb.busyLoad || wb.transformBusy) ?
          <p className="mt-4 text-sm font-semibold text-amber-800">Trabajando…</p>
        : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Días en memoria</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{s?.daysDetected.length ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Eventos</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{s?.rawEventsCount.toLocaleString() ?? '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Alertas</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{s?.rawAlertsCount.toLocaleString() ?? '—'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Período</div>
          <div className="mt-1 font-mono text-xs text-slate-900">
            {wb.diskPeriod ? `${wb.diskPeriod.startDate} → ${wb.diskPeriod.endDate}` : '—'}
          </div>
        </div>
      </div>

      {s ?
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-800">
          <span className="font-semibold">Días:</span>{' '}
          {s.daysDetected.length ? s.daysDetected.join(', ') : '—'}
          {s.timeMin && s.timeMax ?
            <>
              <span className="mx-2 text-slate-400">·</span>
              <span className="font-semibold">Rango:</span> {s.timeMin.slice(0, 10)} → {s.timeMax.slice(0, 10)}
            </>
          : null}
        </div>
      : null}
    </section>
  )
}
