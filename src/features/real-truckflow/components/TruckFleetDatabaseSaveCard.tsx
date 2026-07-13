import { useEffect, useState } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { pingLocalTruckflowServer } from '../api/truckflowLocalFetch'
import { fetchFleetStorageStatus } from '../api/truckFleetApi'

export function TruckFleetDatabaseSaveCard({ embedded = false }: { embedded?: boolean }) {
  const wb = useEtlWorkbenchOptional()
  const [fleetStorage, setFleetStorage] = useState<string | null>(null)
  const [supabaseConfigured, setSupabaseConfigured] = useState(false)
  const [fleetStatusError, setFleetStatusError] = useState<string | null>(null)
  const [localServerOk, setLocalServerOk] = useState<boolean | null>(null)
  const [supabaseHost, setSupabaseHost] = useState<string | null>(null)
  const [tableCounts, setTableCounts] = useState<{ camion: number; visitaPlanta: number } | null>(null)

  const refreshServerStatus = () => {
    void pingLocalTruckflowServer().then((ping) => {
      setLocalServerOk(ping.ok)
      setSupabaseHost(ping.supabaseHost ?? null)
      if (!ping.ok) {
        setFleetStorage(null)
        setFleetStatusError(ping.error ?? null)
        setTableCounts(null)
        return
      }
      setFleetStatusError(null)
      setFleetStorage(ping.fleetRegistryStorage ?? null)
      setSupabaseConfigured(Boolean(ping.supabaseConfigured))
    })
    void fetchFleetStorageStatus()
      .then((st) => {
        if (st.counts) setTableCounts(st.counts)
        if (st.supabaseHost) setSupabaseHost(st.supabaseHost)
        if (st.countsError) setFleetStatusError(st.countsError)
        if (!st.ready && st.error) setFleetStatusError(st.error)
      })
      .catch(() => {})
  }

  useEffect(() => {
    refreshServerStatus()
  }, [])

  if (!wb) return null

  const hasTransform = Boolean(wb.transformResult)
  const visitPreview = hasTransform ?
    (wb.transformResult?.csv.merged_truckflow_movimientos?.trim() ?
      'merge Truckflow + contrato'
    : wb.transformResult?.csv.clean_journeys_for_analysis?.trim() ?
      'journeys análisis'
    : wb.transformResult?.tables?.final_circuits?.rows?.length ||
        wb.transformResult?.csv.final_circuits?.trim() ?
      'circuitos finales'
    : 'sin CSV de visitas')
  : null

  return (
    <div className={embedded ? '' : 'mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/40 px-4 py-4'}>
      {!embedded ?
        <h3 className="text-sm font-bold text-slate-900">Base de datos de visitas</h3>
      : null}
      <p className={`text-xs text-slate-600 ${embedded ? 'mt-0' : 'mt-1'}`}>
        No se guarda al transformar: usá el botón cuando quieras persistir. Requiere{' '}
        <code className="rounded bg-white px-1">npm run server:truckflow</code> en otra terminal (puerto 8787).
      </p>
      {localServerOk === null ?
        <p className="mt-2 text-xs text-slate-500">Comprobando servidor local (8787)…</p>
      : null}
      {localServerOk === false ?
        <p className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950">
          Servidor local no alcanzable en el puerto 8787. Iniciá{' '}
          <code className="rounded bg-white px-1">npm run server:truckflow</code> y recargá esta página.
        </p>
      : null}
      {fleetStorage ?
        <p className="mt-2 text-xs text-slate-500">
          Destino actual: <span className="font-semibold text-indigo-800">{fleetStorage}</span>
          {supabaseHost ?
            <>
              {' '}
              · proyecto <span className="font-mono text-slate-700">{supabaseHost}</span>
            </>
          : null}
          {tableCounts ?
            <>
              {' '}
              · en base: {tableCounts.camion} camiones, {tableCounts.visitaPlanta} visitas
            </>
          : null}
          {fleetStorage === 'json' && supabaseConfigured ?
            ' — hay variables Supabase pero el servidor podría no haberlas cargado al iniciar'
          : null}
          {fleetStorage === 'json' && !supabaseConfigured ?
            ' — configurá SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env y reiniciá el servidor'
          : null}
        </p>
      : null}

      {fleetStatusError ?
        <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          Supabase no listo: {fleetStatusError}. Aplicá la migración{' '}
          <code className="rounded bg-white px-1">20260625120000_camion_visita_planta.sql</code> en tu proyecto.
        </p>
      : null}

      {hasTransform && visitPreview ?
        <p className="mt-2 text-xs text-slate-600">
          Fuente en este transform: <span className="font-medium">{visitPreview}</span>
        </p>
      : null}

      {wb.fleetSaveError ?
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {wb.fleetSaveError}
        </p>
      : null}
      {wb.fleetSaveMessage ?
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {wb.fleetSaveMessage}
        </p>
      : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!hasTransform || wb.fleetSaveBusy || wb.transformBusy || localServerOk !== true}
          onClick={() => {
            void wb.saveFleetDatabase().then(() => refreshServerStatus())
          }}
          className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {wb.fleetSaveBusy ?
            wb.fleetSaveMessage || 'Guardando en base (por lotes)…'
          : 'Guardar visitas en base de datos'}
        </button>
        <button
          type="button"
          onClick={refreshServerStatus}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Reintentar conexión
        </button>
        {!hasTransform ?
          <span className="text-xs text-slate-500">Requiere un transform ejecutado.</span>
        : null}
      </div>
    </div>
  )
}
