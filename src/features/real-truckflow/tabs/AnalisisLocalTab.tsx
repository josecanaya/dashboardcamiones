import { useEffect, useRef, useState } from 'react'
import { ApiJourneyCountByDayTable } from '../components/ApiJourneyCountByDayTable'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { MovimientosContratoPanel } from '../components/MovimientosContratoPanel'
import { TransformPhaseStepper } from '../components/TransformPhaseStepper'
import { TransformRunProgress } from '../components/TransformRunProgress'
import { TransformTramoSummary } from '../components/TransformTramoSummary'
import { previousCalendarWeekRange, thisCalendarWeekRange } from '../utils/weekDateRange'

type Props = {
  /** Solo si el usuario elige abrir el tablero detallado (no automático). */
  onOpenTransformTab?: () => void
}

export function AnalisisLocalTab({ onOpenTransformTab }: Props) {
  const wb = useEtlWorkbenchOptional()
  const weekDefault = thisCalendarWeekRange()
  const [periodStart, setPeriodStart] = useState(weekDefault.startDate)
  const [periodEnd, setPeriodEnd] = useState(weekDefault.endDate)
  const transformSectionRef = useRef<HTMLElement | null>(null)
  const wasTransformBusy = useRef(false)

  useEffect(() => {
    if (!wb) return
    if (wb.transformBusy && !wasTransformBusy.current) {
      transformSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    wasTransformBusy.current = wb.transformBusy
  }, [wb?.transformBusy, wb])

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
  const dataReady = wb.events.length > 0 || wb.alerts.length > 0
  const transformDisabled = wb.busyLoad || wb.transformBusy || !dataReady

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Análisis local</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          En esta misma pantalla: <strong>cargar datos</strong> (paso 0) y <strong>procesar</strong> (pasos 1–3).
          No te movemos a otra pestaña al terminar.
        </p>
      </div>

      {/* —— Paso 0 —— */}
      <article className="rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-50/90 via-white to-white p-6 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-700 text-xs font-bold text-white">
              0
            </span>
            Cargar datos en memoria
          </h3>
          {dataReady ?
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900">
              Datos listos
            </span>
          : <span className="text-[11px] text-slate-500">Pendiente: cargar período</span>}
        </div>

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

        <div className="mt-4">
          <MovimientosContratoPanel wb={wb} compact />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Días</div>
            <div className="mt-0.5 text-xl font-bold text-slate-900">{s?.daysDetected.length ?? 0}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Eventos</div>
            <div className="mt-0.5 text-xl font-bold text-slate-900">
              {s?.rawEventsCount != null ? s.rawEventsCount.toLocaleString() : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Alertas</div>
            <div className="mt-0.5 text-xl font-bold text-slate-900">
              {s?.rawAlertsCount != null ? s.rawAlertsCount.toLocaleString() : '—'}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500">Período disco</div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-900">
              {wb.diskPeriod ? `${wb.diskPeriod.startDate} → ${wb.diskPeriod.endDate}` : '—'}
            </div>
          </div>
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-slate-700">
            Alternativa: subir JSON sueltos
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

        {(wb.loadSummary?.parseErrors?.length ?? 0) > 0 ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-950">
            {wb.loadSummary.parseErrors.map((ln) => (
              <div key={ln}>{ln}</div>
            ))}
          </div>
        : null}

        {wb.busyLoad ?
          <p className="mt-4 text-sm font-semibold text-sky-800">Cargando archivos…</p>
        : null}
      </article>

      {/* —— Pasos 1–3 —— */}
      <article
        ref={transformSectionRef}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h3 className="text-base font-bold text-slate-900">Pasos 1 a 3 · Procesar Truckflow</h3>
        <p className="mt-1 text-sm text-slate-600">
          {!dataReady ?
            'Primero completá el paso 0 (cargar período).'
          : 'Elegí un paso o procesá todo de una vez. El resumen aparece aquí abajo.'}
        </p>

        <div className="mt-4">
          <TransformRunProgress
            active={wb.transformBusy}
            activeTramo={wb.transformActiveTramo}
            runAll={wb.transformRunAllInProgress}
            contractFirst={wb.contractFirstProgress}
          />
        </div>

        <div className="mt-4">
          <TransformPhaseStepper
            tramoStatus={wb.transformTramoStatus}
            activeTramo={wb.transformActiveTramo}
            tramoCompleted={wb.transformTramoCompleted}
            hasXlsx={wb.movimientosContratoFiles.length > 0}
            disabled={transformDisabled}
            runAllInProgress={wb.transformRunAllInProgress}
            onRunTramo={(tramo) => void wb.runTransformTramo(tramo)}
            onRunAll={() => void wb.runTransform()}
          />
        </div>

        {wb.transformError ?
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {wb.transformError}
          </div>
        : null}

        <div className="mt-4">
          <TransformTramoSummary
            tramoCompleted={wb.transformTramoCompleted}
            transformResult={wb.transformResult}
            hasXlsx={wb.movimientosContratoFiles.length > 0}
            onOpenTransformTab={onOpenTransformTab}
          />
        </div>
      </article>

      {s ?
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-800">
          <span className="font-semibold">Días cargados:</span>{' '}
          {s.daysDetected.length ? s.daysDetected.join(', ') : '—'}
        </div>
      : null}

      {wb.apiJourneyStatsPerDay?.length ?
        <div className="rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50/60 via-white to-white p-6 shadow-sm">
          <ApiJourneyCountByDayTable
            rows={wb.apiJourneyStatsPerDay}
            title="Journeys API por día (sin limpieza ETL)"
          />
        </div>
      : null}
    </section>
  )
}
