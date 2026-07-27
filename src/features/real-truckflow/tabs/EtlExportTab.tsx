import { useMemo, useState } from 'react'
import { useRealTruckflowWorkspace } from '../RealTruckflowWorkspaceContext'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { LoadedPeriodSummaryCard } from '../components/LoadedPeriodSummary'
import {
  CANONICAL_CSV_TABLES,
  availableCanonicalKeys,
  downloadCanonicalCsv,
  downloadCanonicalCsvZip,
} from '../etlWorkbench/etlCanonicalCsvExport'

export function EtlExportTab() {
  const ws = useRealTruckflowWorkspace()
  const wb = useEtlWorkbenchOptional()
  const [exportError, setExportError] = useState<string | null>(null)

  const csv = wb?.transformResult?.csv ?? null
  const available = useMemo(() => availableCanonicalKeys(csv), [csv])
  const canExport = available.size > 0

  const exec = (fn: () => boolean, label: string) => {
    setExportError(null)
    try {
      const ok = fn()
      if (!ok) setExportError(`No hay datos para ${label}. Procesá el Transform del período primero.`)
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    }
  }

  const cds = ws.cleanDataset
  const execSummary = ws.committee?.executiveSummary
  const circuitsShown =
    cds?.reconstructedJourneysRaw.length ??
    ws.lastLoadCounts?.circuitsApprox ??
    execSummary?.journeysProcessedCount ??
    0

  const summaryReady = ws.status === 'loaded' && ws.loadedRange && ws.loadedAt && execSummary

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Export CSV — tablas canónicas</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Descarga las <strong>tablas canónicas del ETL</strong> tal como las produce el Transform, en CSV plano y sin
          duplicación de datos. Usan el <strong>período cargado</strong> arriba. Cada tabla es la fuente única de su
          dominio (operaciones, circuitos, tiempos, alertas).
        </p>
      </div>

      {exportError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{exportError}</div>
      ) : null}

      {summaryReady ? (
        <>
          <LoadedPeriodSummaryCard
            queryStart={ws.loadedRange!.startIso}
            queryEnd={ws.loadedRange!.endIso}
            loadedAtIso={ws.loadedAt!}
            eventsReceived={ws.rawEventsRicardone.length}
            alertsReceived={ws.rawAlerts.length}
            operationalEvents={execSummary!.operationalEventCount}
            operationalAlerts={execSummary!.operationalAlertCount}
            circuitsGenerated={circuitsShown}
          />

          {!canExport ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong>Transform pendiente.</strong> Procesá el Transform del período en{' '}
              <strong>Período de trabajo</strong> para habilitar la exportación de tablas canónicas.
            </div>
          ) : null}

          <div className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Tablas canónicas (CSV)</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CANONICAL_CSV_TABLES.map((t) => {
                const has = available.has(t.key)
                return (
                  <button
                    key={t.key}
                    type="button"
                    disabled={!has}
                    title={has ? t.filename : 'No disponible en esta corrida'}
                    onClick={() => exec(() => downloadCanonicalCsv(csv, t.key), t.label)}
                    className="inline-flex flex-col rounded-xl border border-indigo-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-xs font-black uppercase tracking-wide text-indigo-950">{t.label}</span>
                    <span className="mt-0.5 text-[11px] leading-snug text-slate-600">{t.hint}</span>
                    <span className="mt-1 font-mono text-[10px] text-slate-500">{t.filename}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={!canExport}
                onClick={() => exec(() => downloadCanonicalCsvZip(csv), 'ZIP de tablas canónicas')}
                className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
              >
                Descargar todo (ZIP)
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
          Cargá un período en <strong>Período de trabajo</strong> para habilitar la exportación.
        </div>
      )}
    </section>
  )
}
