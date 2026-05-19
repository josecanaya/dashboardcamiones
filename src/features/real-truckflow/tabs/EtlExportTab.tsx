import { useState } from 'react'
import { useRealTruckflowWorkspace } from '../RealTruckflowWorkspaceContext'
import { LoadedPeriodSummaryCard } from '../components/LoadedPeriodSummary'
import { POWER_BI_ETL_DEBUG_FILE_COUNT } from '../../../services/powerBiEtlExport'
import { POWER_BI_STANDARD_EXPORT_ROWS, usePowerBiExport } from '../hooks/usePowerBiExport'

export function EtlExportTab() {
  const ws = useRealTruckflowWorkspace()
  const { exportCsvByFilename, exportZip, canExport } = usePowerBiExport(ws)
  const [bundleError, setBundleError] = useState<string | null>(null)

  const exec = (fn: () => boolean, label: string) => {
    setBundleError(null)
    try {
      const ok = fn()
      if (!ok) setBundleError(`No se pudo generar ${label}. Volvé a cargar el período.`)
    } catch (e) {
      setBundleError(e instanceof Error ? e.message : String(e))
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
        <h2 className="text-lg font-bold text-slate-900">Export ETL para Power BI</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Los CSV usan el <strong>mismo período de trabajo</strong> cargado arriba. Cada clic arma el bundle en memoria y descarga un archivo (rangos grandes pueden tardar varios segundos).{' '}
          El ZIP incluye el conjunto debug completo ({POWER_BI_ETL_DEBUG_FILE_COUNT} archivos, incluye capas v2 y auditoría).
        </p>
      </div>

      {bundleError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{bundleError}</div>
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

          {ws.cleanDatasetDeferred ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <strong>Dataset limpio pendiente.</strong> Los exports siguen funcionando (regeneran capas internamente), pero algunos conteos reflejan el pipeline hasta que procesés el dataset en{' '}
              <strong>Período de trabajo</strong>.
            </div>
          ) : null}

          {ws.rawEventsRicardone.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Aviso: <strong>0 eventos</strong> Ricardone en este rango; las capas de eventos pueden salir vacías.
            </div>
          ) : null}
          {ws.rawAlerts.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Aviso: <strong>0 alertas</strong> en este rango.
            </div>
          ) : null}

          <div className="rounded-3xl border border-indigo-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Exportar CSV estándar Power BI</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Incluye <span className="font-mono">clean_alerts</span> con alertas operativas del pipeline (con fallback trasero si hace falta filas).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {POWER_BI_STANDARD_EXPORT_ROWS.map(({ filename, label }) => (
                <button
                  key={filename}
                  type="button"
                  disabled={!canExport}
                  title={filename}
                  onClick={() => exec(() => exportCsvByFilename(filename), filename)}
                  className="inline-flex flex-col rounded-xl border border-amber-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-amber-500 hover:bg-amber-50 disabled:opacity-40"
                >
                  <span className="text-xs font-black uppercase tracking-wide text-amber-950">{label}</span>
                  <span className="mt-0.5 font-mono text-[10px] text-slate-600">{filename}</span>
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={!canExport}
                onClick={() => exec(() => exportZip(), 'ZIP Power BI')}
                className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
              >
                Descargar ZIP Power BI (debug completo)
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
