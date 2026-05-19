import { useMemo, useState } from 'react'
import {
  getTruckflowHealth,
  getTruckflowListDays,
  postTruckflowExportPeriod,
  postTruckflowExportWindow,
  type TruckflowSiteParam,
} from '../api/truckflowLocalServerApi'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { previousCalendarWeekRange, thisCalendarWeekRange } from '../utils/weekDateRange'
import { yieldToMain } from '../yieldToMain'

type RowState = {
  partitionDay: string
  startDatetime: string
  endDatetime: string
  eventsDownloaded: number
  alertsDownloaded: number
  status: 'pending' | 'running' | 'ok' | 'error'
  error?: string
}

type Props = {
  /** Tras descargar/cargar, ir a Análisis local. */
  onGoToAnalysis?: () => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function combineLocal(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const tm = timeStr?.trim() || '00:00'
  const [hhRaw, mmRaw] = tm.split(':')
  const hh = Number(hhRaw) || 0
  const mm = Number(mmRaw) || 0
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 0)
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatLocalDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`
}

/** Días completos 00:00–23:59 → el servidor descarga todo el período en paralelo (un request). */
function isFullDayRange(startTime: string, endTime: string): boolean {
  const end = endTime?.trim() || ''
  return startTime === '00:00' && (end === '23:59' || end === '24:00')
}

export function buildExportWindowChunks(startDate: string, startTime: string, endDate: string, endTime: string) {
  const start = combineLocal(startDate, startTime)
  const end = combineLocal(endDate, endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null
  const out: { partitionDay: string; startDatetime: string; endDatetime: string }[] = []
  let cur = startOfLocalDay(start)
  const last = endOfLocalDay(end)
  while (cur <= last) {
    const dayFloor = startOfLocalDay(cur)
    const dayCeil = endOfLocalDay(cur)
    const winStart = start > dayFloor ? start : dayFloor
    const winEnd = end < dayCeil ? end : dayCeil
    if (winStart <= winEnd) {
      out.push({
        partitionDay: localDayKey(cur),
        startDatetime: formatLocalDateTime(winStart),
        endDatetime: formatLocalDateTime(winEnd),
      })
    }
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return out
}

export function ExtraccionDatosTab({ onGoToAnalysis }: Props) {
  const wb = useEtlWorkbenchOptional()
  const weekDefault = thisCalendarWeekRange()
  const [startDate, setStartDate] = useState(weekDefault.startDate)
  const [startTime, setStartTime] = useState('00:00')
  const [endDate, setEndDate] = useState(weekDefault.endDate)
  const [endTime, setEndTime] = useState('23:59')
  const [site, setSite] = useState<TruckflowSiteParam>('all')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<RowState[]>([])
  const [dataRoot, setDataRoot] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)

  const totals = useMemo(() => {
    let okDays = 0
    let ev = 0
    let al = 0
    let err = 0
    for (const r of rows) {
      if (r.status === 'ok') okDays++
      if (r.status === 'error') err++
      ev += r.eventsDownloaded
      al += r.alertsDownloaded
    }
    return { okDays, ev, al, err }
  }, [rows])

  const applyWeekPreset = (preset: 'this' | 'last') => {
    const w = preset === 'this' ? thisCalendarWeekRange() : previousCalendarWeekRange()
    setStartDate(w.startDate)
    setEndDate(w.endDate)
    setStartTime('00:00')
    setEndTime('23:59')
  }

  const handleListDays = async () => {
    setStatusNote(null)
    try {
      const res = await getTruckflowListDays()
      setDataRoot(res.dataRoot)
      setStatusNote(`Días en disco: ${res.days.length}. Ej.: ${res.days.slice(0, 8).join(', ') || '—'}`)
    } catch (e) {
      setStatusNote(e instanceof Error ? e.message : String(e))
    }
  }

  const handleExport = async () => {
    setBusy(true)
    setDataRoot(null)
    setStatusNote(null)

    try {
      await getTruckflowHealth()
    } catch (e) {
      setBusy(false)
      const msg = e instanceof Error ? e.message : String(e)
      setStatusNote(
        `${msg}\n\nSi sólo corrés «pnpm run dev», falta el servidor local. En otra terminal: pnpm run server:truckflow (puerto 8787).`
      )
      return
    }

    const useBatch = isFullDayRange(startTime, endTime)

    if (useBatch) {
      setRows([])
      setStatusNote(`Descargando período ${startDate} → ${endDate} (todos los días juntos)…`)
      try {
        const res = await postTruckflowExportPeriod({
          startDate,
          endDate,
          site,
          baseUrl: baseUrl.trim() || undefined,
        })
        setDataRoot(res.dataRoot)
        wb?.setDiskPeriod({ startDate, endDate })
        const mapped: RowState[] = res.days.map((d) => ({
          partitionDay: d.day,
          startDatetime: `${d.day}T00:00:00`,
          endDatetime: `${d.day}T23:59:59`,
          eventsDownloaded: d.eventsDownloaded,
          alertsDownloaded: d.alertsDownloaded,
          status: d.status === 'ok' ? 'ok' : 'error',
          error: d.error,
        }))
        setRows(mapped)
        const okN = mapped.filter((r) => r.status === 'ok').length
        setStatusNote(
          `Período guardado: ${okN}/${mapped.length} día(s) en data/truckflow/. Siguiente paso: Análisis → Cargar período.`
        )
      } catch (e) {
        setStatusNote(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
      return
    }

    const chunks = buildExportWindowChunks(startDate, startTime, endDate, endTime)
    if (!chunks?.length) {
      setRows([])
      setStatusNote('Rango inválido: revisá fechas/horas (inicio ≤ fin).')
      setBusy(false)
      return
    }

    setStatusNote(
      'Horario parcial: se descarga día por día (más lento). Para una semana entera dejá 00:00–23:59.'
    )
    setRows(
      chunks.map((c) => ({
        partitionDay: c.partitionDay,
        startDatetime: c.startDatetime,
        endDatetime: c.endDatetime,
        eventsDownloaded: 0,
        alertsDownloaded: 0,
        status: 'pending',
      }))
    )

    try {
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i]
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, status: 'running' } : r)))
        try {
          const one = await postTruckflowExportWindow({
            partitionDay: ch.partitionDay,
            startDatetime: ch.startDatetime,
            endDatetime: ch.endDatetime,
            site,
            baseUrl: baseUrl.trim() || undefined,
          })
          setDataRoot(one.dataRoot)
          setRows((prev) =>
            prev.map((r, j) =>
              j === i
                ? {
                    ...r,
                    eventsDownloaded: one.eventsDownloaded,
                    alertsDownloaded: one.alertsDownloaded,
                    status: one.status === 'ok' ? 'ok' : 'error',
                    error: one.error,
                  }
                : r
            )
          )
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setRows((prev) =>
            prev.map((r, j) =>
              j === i ?
                { ...r, status: 'error', error: msg, eventsDownloaded: 0, alertsDownloaded: 0 }
              : r
            )
          )
        }
        await yieldToMain()
      }
      wb?.setDiskPeriod({ startDate, endDate })
    } finally {
      setBusy(false)
    }
  }

  const handleLoadAndContinue = async () => {
    if (!wb) {
      setStatusNote('Workbench no disponible para cargar en memoria.')
      return
    }
    const ok = await wb.loadLocalPeriod(startDate, endDate)
    if (ok) onGoToAnalysis?.()
    else if (!wb.transformError) setStatusNote('No hay datos en disco para ese período. Descargá primero.')
  }

  const exportDone = rows.length > 0 && rows.some((r) => r.status === 'ok')

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/90 via-white to-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Extracción de datos</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Elegí el rango (semana recomendada con 00:00–23:59) y descargá{' '}
          <strong>todo el período de una vez</strong>. Los JSON quedan en{' '}
          <span className="font-mono text-xs">data/truckflow/YYYY-MM-DD/</span>. Requiere{' '}
          <span className="font-mono text-[11px]">pnpm run server:truckflow</span>.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => applyWeekPreset('this')}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100 disabled:opacity-50"
          >
            Semana actual
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyWeekPreset('last')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Semana anterior
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Desde
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={busy}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hora
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={busy}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hasta
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={busy}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Hora
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              disabled={busy}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Site
            <select
              value={site}
              onChange={(e) => setSite(e.target.value as TruckflowSiteParam)}
              disabled={busy}
              className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="all">Todos</option>
              <option value="ricardone">Ricardone</option>
              <option value="san_lorenzo">San Lorenzo</option>
            </select>
          </label>
          <label className="min-w-[200px] text-xs font-semibold text-slate-600">
            Base URL API (opcional)
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="default servidor"
              disabled={busy}
              className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-[11px] disabled:bg-slate-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleExport()}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? 'Descargando período…' : 'Descargar período'}
          </button>
          {exportDone && wb ?
            <button
              type="button"
              disabled={busy || wb.busyLoad}
              onClick={() => void handleLoadAndContinue()}
              className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
            >
              {wb.busyLoad ? 'Cargando…' : 'Cargar período y continuar'}
            </button>
          : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleListDays()}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Ver archivos en disco
          </button>
        </div>

        {statusNote ?
          <p className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            {statusNote}
          </p>
        : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Días OK</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totals.okDays}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Eventos</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totals.ev.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-slate-500">Alertas</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{totals.al.toLocaleString()}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-rose-800">Errores</div>
          <div className="mt-1 text-2xl font-bold text-rose-950">{totals.err}</div>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase text-indigo-900">Carpeta</div>
          <div className="mt-1 font-mono text-[11px] text-indigo-950 break-all">{dataRoot ?? '—'}</div>
        </div>
      </div>

      {rows.length ?
        <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">Día</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Eventos</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right">Alertas</th>
                <th className="border-b border-slate-200 px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partitionDay} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{r.partitionDay}</td>
                  <td className="px-3 py-2 text-right">{r.eventsDownloaded.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{r.alertsDownloaded.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        r.status === 'ok'
                          ? 'bg-emerald-100 text-emerald-900'
                          : r.status === 'error'
                            ? 'bg-rose-100 text-rose-900'
                            : r.status === 'running'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.error ?
                      <span className="ml-2 text-xs text-rose-700" title={r.error}>
                        {r.error.slice(0, 40)}
                      </span>
                    : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : null}
    </section>
  )
}
