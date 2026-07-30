import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  CALADA_CAMERA_EVENTS_HEADERS,
  type CaladaCameraEventRow,
} from '../etlWorkbench/etlCaladaCameraActivity'
import { safeExportFilename } from '../../../utils/chartExport'

const DAY_FILTER_ALL = '__ALL_DIAS__'

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] text-slate-500">{hint}</div> : null}
    </div>
  )
}

function parseCaladaRows(csv: string | undefined): CaladaCameraEventRow[] {
  if (!csv?.trim()) return []
  const { rows } = parseCsvToRecords(csv)
  return rows as unknown as CaladaCameraEventRow[]
}

export function CaladaCamerasPanel({
  csv,
  checkedCircuits,
  filterActive,
  periodLabel,
}: {
  csv: string | undefined
  /** Circuitos tildados en el checklist. */
  checkedCircuits: Set<string>
  /** True solo si el usuario acotó (no están todos tildados). Si es false, se muestra todo. */
  filterActive: boolean
  periodLabel: string
}) {
  const allRows = useMemo(() => parseCaladaRows(csv), [csv])
  const [selectedDay, setSelectedDay] = useState(DAY_FILTER_ALL)

  const dayOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.fecha))].filter(Boolean).sort(),
    [allRows]
  )

  const rows = useMemo(() => {
    let out = allRows
    // Solo filtra por circuito si el usuario acotó; así el default muestra toda la
    // actividad de calada, incluidos journeys sin circuito ejecutivo asignado.
    if (filterActive) out = out.filter((r) => checkedCircuits.has(r.circuito))
    if (selectedDay !== DAY_FILTER_ALL) out = out.filter((r) => r.fecha === selectedDay)
    return out
  }, [allRows, checkedCircuits, filterActive, selectedDay])

  /** Por cámara: camiones distintos, eventos y pico de camiones en una ventana de 30 min. */
  const perCamera = useMemo(() => {
    const byCam = new Map<string, { trucks: Set<string>; events: number; perBucket: Map<string, Set<string>> }>()
    for (const r of rows) {
      const c = byCam.get(r.camara) ?? { trucks: new Set(), events: 0, perBucket: new Map() }
      c.trucks.add(r.journey_id)
      c.events++
      const b = c.perBucket.get(r.intervalo_30min) ?? new Set<string>()
      b.add(r.journey_id)
      c.perBucket.set(r.intervalo_30min, b)
      byCam.set(r.camara, c)
    }
    return [...byCam.entries()]
      .map(([camara, c]) => ({
        camara,
        camiones: c.trucks.size,
        eventos: c.events,
        picoPorVentana: Math.max(0, ...[...c.perBucket.values()].map((s) => s.size)),
      }))
      .sort((a, b) => b.camiones - a.camiones || a.camara.localeCompare(b.camara))
  }, [rows])

  /** Por ventana de 30 min: cámaras activas simultáneas y camiones en calada. */
  const concurrency = useMemo(() => {
    const byBucket = new Map<string, { cams: Set<string>; trucks: Set<string> }>()
    for (const r of rows) {
      const b = byBucket.get(r.intervalo_30min) ?? { cams: new Set(), trucks: new Set() }
      b.cams.add(r.camara)
      b.trucks.add(r.journey_id)
      byBucket.set(r.intervalo_30min, b)
    }
    return [...byBucket.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        bucket,
        label: `${bucket.slice(8, 10)}/${bucket.slice(5, 7)} ${bucket.slice(11, 16)}`,
        camaras_activas: v.cams.size,
        camiones: v.trucks.size,
      }))
  }, [rows])

  const totals = useMemo(() => {
    const trucks = new Set(rows.map((r) => r.journey_id))
    const cams = new Set(rows.map((r) => r.camara))
    const peakCams = Math.max(0, ...concurrency.map((c) => c.camaras_activas))
    const peakTrucks = Math.max(0, ...concurrency.map((c) => c.camiones))
    return { trucks: trucks.size, cams: cams.size, peakCams, peakTrucks }
  }, [rows, concurrency])

  if (!allRows.length) {
    return (
      <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-950">
        No hay datos de cámaras de calada en esta corrida. La tabla <code>calada_camera_events</code> se genera al
        procesar KPI tiempos; si es una corrida guardada vieja, reprocesá el período (Análisis local → Transform →
        KPI) para verla.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-slate-700">Día</span>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value={DAY_FILTER_ALL}>Todos</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <p className="max-w-xl text-xs text-slate-500">
            Ocupación por <strong>ventana de 30 min</strong>: cuántos camiones vio cada cámara de calada y cuántas
            cámaras operaban a la vez. Filtrado por los circuitos tildados. Período: {periodLabel}.
          </p>
        </div>
        <button
          type="button"
          disabled={!rows.length}
          onClick={() =>
            triggerBrowserCsvDownload(
              safeExportFilename('calada_camaras', 'csv'),
              `${CALADA_CAMERA_EVENTS_HEADERS.join(',')}\n${rows
                .map((r) => CALADA_CAMERA_EVENTS_HEADERS.map((h) => r[h] ?? '').join(','))
                .join('\n')}\n`
            )
          }
          className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export CSV detalle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Camiones en calada" value={totals.trucks.toLocaleString()} />
        <MetricCard label="Cámaras con actividad" value={String(totals.cams)} />
        <MetricCard label="Pico cámaras simultáneas" value={String(totals.peakCams)} hint="en una ventana de 30 min" />
        <MetricCard label="Pico camiones simultáneos" value={String(totals.peakTrucks)} hint="en una ventana de 30 min" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <th className="px-4 py-3">Cámara de calada</th>
              <th className="px-4 py-3 text-right">Camiones recibidos</th>
              <th className="px-4 py-3 text-right">Eventos</th>
              <th className="px-4 py-3 text-right">Pico por ventana (30 min)</th>
            </tr>
          </thead>
          <tbody>
            {perCamera.map((c) => (
              <tr key={c.camara} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{c.camara}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.camiones.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.eventos.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{c.picoPorVentana}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
          Concurrencia por ventana de 30 min
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Cuántas cámaras de calada operaban al mismo tiempo y cuántos camiones había en calada, ventana por ventana.
        </p>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={concurrency} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="camaras_activas"
                name="Cámaras activas"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="camiones"
                name="Camiones en calada"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
