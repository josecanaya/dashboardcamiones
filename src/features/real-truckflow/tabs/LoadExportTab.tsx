import { useCallback, useEffect, useMemo, useState } from 'react'
import { ETL_DEV_MODE, POWER_BI_PRODUCT_FILES } from '../../../config/committeeEtlLite'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import {
  consolidatePowerBiLoad,
  daysInclusive,
  loadedDayFromTransformResult,
  mergeLoadedDays,
  POWER_BI_STABLE_FILES,
  readTransformFilesFromFileList,
  resolveTransformPackSourceDay,
  transformPeriodFromSummary,
  triggerPowerBiZipDownload,
  tryWritePowerBiToLocalServer,
  type LoadGroupType,
  type LoadedTransformDay,
  type PowerBiConsolidatedOutput,
} from '../etlWorkbench/powerBiLoad'
import type { DssReferenceMetrics } from '../etlWorkbench/powerBiCommitteeExecutive'
import { parseDssReferenceCsv } from '../etlWorkbench/dssReferenceCsv'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  )
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayFromTransformSummaryCsv(csv: string): string {
  const { rows } = parseCsvToRecords(csv)
  const r = rows[0]
  if (!r) return todayIso()
  const dm = String(r.date_min ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dm)) return dm
  return todayIso()
}

export function LoadExportTab() {
  const wb = useEtlWorkbenchOptional()
  const [dateFrom, setDateFrom] = useState('2026-05-12')
  const [dateTo, setDateTo] = useState('2026-05-18')
  const [groupType, setGroupType] = useState<LoadGroupType>('week')
  const [loadedDays, setLoadedDays] = useState<LoadedTransformDay[]>([])
  const [consolidated, setConsolidated] = useState<PowerBiConsolidatedOutput | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dssReference, setDssReference] = useState<DssReferenceMetrics | undefined>(undefined)
  const [dssNote, setDssNote] = useState<string | null>(null)

  useEffect(() => {
    if (wb?.diskPeriod) {
      setDateFrom(wb.diskPeriod.startDate)
      setDateTo(wb.diskPeriod.endDate)
    } else if (wb?.loadSummary?.daysDetected.length) {
      const days = wb.loadSummary.daysDetected
      setDateFrom(days[0])
      setDateTo(days[days.length - 1])
    }
  }, [wb?.diskPeriod, wb?.loadSummary?.daysDetected])

  const periodDays = useMemo(() => {
    try {
      return daysInclusive(dateFrom, dateTo)
    } catch {
      return []
    }
  }, [dateFrom, dateTo])

  const loadFromFolder = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError(null)
    try {
      const packs = await readTransformFilesFromFileList(files)
      if (!packs.length) {
        setError('No se encontraron CSV transformados (final_circuits, transform_summary, etc.).')
        return
      }
      setLoadedDays((prev) => mergeLoadedDays(prev, packs))
      setMessage(`Cargados ${packs.length} día(s) desde carpeta.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const loadFromMemory = useCallback(() => {
    if (!wb?.transformResult) {
      setError('No hay resultado Transform en memoria. Procesá Transform o cargá una carpeta.')
      return
    }
    setError(null)
    const days = wb.loadSummary?.daysDetected ?? []
    const day =
      days.length >= 2 ? `${days[0]}_${days[days.length - 1]}`
      : wb.transformResult.csv.transform_summary ?
        dayFromTransformSummaryCsv(wb.transformResult.csv.transform_summary)
      : todayIso()
    if (days.length >= 2) {
      setDateFrom(days[0])
      setDateTo(days[days.length - 1])
    }
    const pack = loadedDayFromTransformResult(wb.transformResult, day)
    setLoadedDays((prev) => mergeLoadedDays(prev, [pack]))
    const fc = wb.transformResult.stats.coherence?.final_circuits_count ?? '?'
    setMessage(`Transform en memoria agregado (día ${day}, ${fc} circuitos finales en ese run).`)
  }, [wb?.transformResult])

  const generatePowerBi = useCallback(() => {
    setError(null)
    setMessage(null)
    if (!loadedDays.length) {
      setError('Cargá al menos un día transformado (carpeta o Transform en memoria).')
      return
    }
    try {
      const out = consolidatePowerBiLoad({
        days: loadedDays,
        periodStart: dateFrom,
        periodEnd: dateTo,
        loadGroupType: groupType,
        dssReference,
      })
      setConsolidated(out)
      setMessage(
        `Salida Power BI generada: ${out.outputFolder} (${out.sourceDays.length} días, ${out.stats.finalCircuits} circuitos finales).`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [loadedDays, dateFrom, dateTo, groupType])

  const downloadZip = useCallback(
    (productOnly = true) => {
      if (!consolidated) {
        setError('Generá la carpeta Power BI antes de descargar el ZIP.')
        return
      }
      triggerPowerBiZipDownload(consolidated, productOnly)
      setMessage(
        productOnly ?
          'ZIP productivo descargado (solo archivos pb_* del comité).'
        : 'ZIP completo descargado (incluye archivos técnicos DEV).'
      )
    },
    [consolidated]
  )

  const saveToLocalServer = useCallback(async () => {
    if (!consolidated) {
      setError('Generá la carpeta Power BI antes de guardar en disco.')
      return
    }
    setBusy(true)
    const res = await tryWritePowerBiToLocalServer(consolidated)
    setBusy(false)
    if (res.ok) {
      setMessage(`Guardado en servidor local: ${res.path}`)
    } else {
      setError(
        res.error ??
          'No se pudo guardar en servidor local. Ejecutá pnpm run server:truckflow o usá Descargar ZIP.'
      )
    }
  }, [consolidated])

  const clearPowerBi = useCallback(() => {
    setConsolidated(null)
    setLoadedDays([])
    setMessage('Salida Power BI y días cargados limpiados.')
    setError(null)
  }, [])

  const fileTable = useMemo(() => {
    if (!consolidated) return []
    return (Object.keys(POWER_BI_STABLE_FILES) as (keyof typeof POWER_BI_STABLE_FILES)[]).map((k) => ({
      key: k,
      archivo: POWER_BI_STABLE_FILES[k],
      filas: consolidated.rowCounts[k],
      ruta: `${consolidated.outputFolder}${POWER_BI_STABLE_FILES[k]}`,
      isProduct: (POWER_BI_PRODUCT_FILES as readonly string[]).includes(POWER_BI_STABLE_FILES[k]),
    }))
  }, [consolidated])

  const productFileTable = useMemo(() => fileTable.filter((r) => r.isProduct), [fileTable])
  const devFileTable = useMemo(() => fileTable.filter((r) => !r.isProduct), [fileTable])

  if (!wb) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        El workbench ETL no está disponible en este layout.
      </p>
    )
  }

  const stats = consolidated?.stats

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Load / Export Power BI</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Genera la salida ejecutiva para comité. Archivos productivos:{' '}
          {POWER_BI_PRODUCT_FILES.map((f) => (
            <span key={f} className="mr-1 font-mono text-[11px]">
              {f}
            </span>
          ))}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-600">
            Fecha desde
            <input
              type="date"
              value={dateFrom}
              disabled={busy}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Fecha hasta
            <input
              type="date"
              value={dateTo}
              disabled={busy}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Agrupación
            <select
              value={groupType}
              disabled={busy}
              onChange={(e) => setGroupType(e.target.value as LoadGroupType)}
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
              <option value="custom">Rango personalizado</option>
            </select>
          </label>
          <div className="text-xs text-slate-600">
            <span className="font-semibold">Días en rango</span>
            <p className="mt-2 text-lg font-bold text-slate-900">{periodDays.length}</p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          <div className="text-xs font-bold text-amber-950">Referencia DSS (opcional, para pb_dss_vs_truckflow.csv)</div>
          <label className="mt-2 inline-flex cursor-pointer flex-col text-sm">
            <span className="text-xs text-slate-700">CSV con metric_key,dss_count</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              className="mt-1 max-w-xs text-xs"
              onChange={async (ev) => {
                const f = ev.target.files?.[0]
                if (!f) return
                const text = await f.text()
                const { metrics, errors } = parseDssReferenceCsv(text)
                if (errors.length) {
                  setDssNote(`DSS: ${errors.join(' ')}`)
                  return
                }
                setDssReference(Object.keys(metrics).length ? metrics : undefined)
                setDssNote(
                  Object.keys(metrics).length ?
                    `DSS cargado: ${Object.entries(metrics).map(([k, v]) => `${k}=${v}`).join(', ')}`
                  : 'CSV vacío'
                )
              }}
            />
          </label>
          {dssNote ?
            <p className="mt-2 text-xs text-amber-900">{dssNote}</p>
          : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer flex-col rounded-xl border border-dashed border-indigo-400 bg-white px-4 py-3 text-sm shadow-sm hover:border-indigo-600">
            <span className="font-bold text-indigo-950">Cargar transformados (carpeta)</span>
            <span className="mt-1 text-xs text-slate-600">
              Seleccioná carpetas con CSV por día (webkitdirectory).
            </span>
            <input
              type="file"
              multiple
              disabled={busy}
              className="mt-2 max-w-[240px] text-xs"
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
              onChange={(ev) => void loadFromFolder(ev.target.files)}
            />
          </label>
          <button
            type="button"
            disabled={busy || !wb.transformResult}
            onClick={loadFromMemory}
            className="self-end rounded-xl border border-indigo-300 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 hover:bg-indigo-50 disabled:opacity-40"
          >
            Cargar Transform (memoria)
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !loadedDays.length}
            onClick={generatePowerBi}
            className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-indigo-800 disabled:opacity-50"
          >
            Generar carpeta Power BI
          </button>
          <button
            type="button"
            disabled={!consolidated}
            onClick={() => downloadZip(true)}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Descargar ZIP comité
          </button>
          <button
            type="button"
            disabled={!consolidated || busy}
            onClick={() => void saveToLocalServer()}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
          >
            Guardar en data/powerbi (servidor local)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={clearPowerBi}
            className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-semibold text-rose-900 hover:bg-rose-100"
          >
            Limpiar salida Power BI
          </button>
        </div>

        {loadedDays.length ?
          <p className="mt-3 text-xs text-slate-600">
            Días cargados en buffer:{' '}
            <span className="font-mono font-semibold">{loadedDays.map((d) => d.sourceDay).join(', ')}</span>
          </p>
        : null}

        {message ?
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            {message}
          </p>
        : null}
        {error ?
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
            {error}
          </p>
        : null}
      </div>

      {stats ?
        <>
          <h3 className="text-base font-bold text-slate-900">Resumen del período</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Días consolidados" value={stats.daysConsolidated} />
            <Metric label="Circuitos finales" value={stats.finalCircuits.toLocaleString()} />
            <Metric label="Circuitos completos (ejec.)" value={stats.circuitosUtiles.toLocaleString()} />
            <Metric label="Incompletos revisión" value={stats.incompletosRevision.toLocaleString()} />
            <Metric label="Alertas operativas (front)" value={stats.frontAlerts.toLocaleString()} />
            <Metric
              label="Estado exportación"
              value={consolidated ? 'Generado — listo para comité' : 'Pendiente'}
            />
          </div>

          <div className="overflow-auto rounded-xl border border-indigo-200 bg-white p-3">
            <div className="text-xs font-bold text-indigo-950">Archivos productivos (comité / Power BI)</div>
            <table className="mt-2 w-full min-w-[520px] text-left text-[12px] text-slate-800">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1 font-semibold">Archivo</th>
                  <th className="py-1 font-semibold">Filas</th>
                  <th className="py-1 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {productFileTable.map((row) => (
                  <tr key={row.archivo} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-[11px]">{row.archivo}</td>
                    <td className="py-2">{row.filas.toLocaleString()}</td>
                    <td className="py-2 text-emerald-700">listo</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-2">
              {productFileTable.map((row) => (
                <button
                  key={`dl-${row.archivo}`}
                  type="button"
                  className="rounded-lg border border-indigo-200 px-2 py-1 text-[10px] font-semibold text-indigo-900 hover:bg-indigo-50"
                  onClick={() => triggerBrowserCsvDownload(row.archivo, consolidated!.files[row.key])}
                >
                  ↓ {row.archivo}
                </button>
              ))}
            </div>
          </div>

          {ETL_DEV_MODE && devFileTable.length ?
            <details className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">
                Export técnico DEV ({devFileTable.length} archivos adicionales)
              </summary>
              <div className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white p-3">
                <table className="w-full min-w-[520px] text-left text-[12px] text-slate-800">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-1 font-semibold">Archivo</th>
                      <th className="py-1 font-semibold">Filas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devFileTable.map((row) => (
                      <tr key={row.archivo} className="border-b border-slate-100">
                        <td className="py-2 font-mono text-[11px]">{row.archivo}</td>
                        <td className="py-2">{row.filas.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-[10px] font-bold uppercase text-white"
                    onClick={() => downloadZip(false)}
                  >
                    ZIP completo (DEV)
                  </button>
                  {devFileTable.map((row) => (
                    <button
                      key={`dev-dl-${row.archivo}`}
                      type="button"
                      className="rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-100"
                      onClick={() => triggerBrowserCsvDownload(row.archivo, consolidated!.files[row.key])}
                    >
                      ↓ {row.archivo}
                    </button>
                  ))}
                </div>
              </div>
            </details>
          : null}
        </>
      : null}
    </section>
  )
}
