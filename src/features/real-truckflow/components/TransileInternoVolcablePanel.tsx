import { useMemo } from 'react'
import { parseCsvToRecords } from '../etlWorkbench/etlCsvParse'
import { triggerBrowserCsvDownload } from '../etlWorkbench/etlCsv'
import {
  TRANSILE_LAP_MIN_MS,
  TRANSILE_SESSION_BREAK_MS,
  VOLCABLE_TRANSILE_DEVICES,
} from '../etlWorkbench/transileInternoVolcable'

type Props = {
  sessionsCsv?: string
  summaryCsv?: string
  disabled?: boolean
}

function parseSummary(csv: string | undefined): Record<string, string> {
  if (!csv?.trim()) return {}
  return parseCsvToRecords(csv).rows[0] ?? {}
}

export function TransileInternoVolcablePanel({ sessionsCsv, summaryCsv, disabled }: Props) {
  const summary = useMemo(() => parseSummary(summaryCsv), [summaryCsv])
  const sessions = useMemo(() => {
    if (!sessionsCsv?.trim()) return []
    return parseCsvToRecords(sessionsCsv).rows
  }, [sessionsCsv])

  const transileSessions = useMemo(
    () => sessions.filter((s) => String(s.inferred_transile_interno).toLowerCase() === 'true'),
    [sessions]
  )

  if (!sessionsCsv?.trim()) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Ejecutá el <strong>Transform</strong> para detectar transiles internos por repeticiones en{' '}
        {VOLCABLE_TRANSILE_DEVICES.join(' / ')}.
      </p>
    )
  }

  const lapMin = Math.round(TRANSILE_LAP_MIN_MS / 60_000)
  const breakH = TRANSILE_SESSION_BREAK_MS / (60 * 60_000)

  return (
    <div className="mt-3 space-y-4">
      <p className="text-xs text-slate-600">
        Cobertura en <strong>Volcable 1 y 2</strong> únicamente. Sesión de transile interno si hay{' '}
        <strong>≥4 visitas</strong> (lecturas separadas &gt; {lapMin} min) con{' '}
        <strong>≥3 intervalos</strong> entre {lapMin} min y {breakH} h. Si pasan ≥ {breakH} h, cuenta como
        otra sesión (puede repetir varios días).
      </p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
          <dt className="text-xs text-violet-800">Patentes en Volcable</dt>
          <dd className="font-bold tabular-nums">{summary.patentes_con_volcable ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
          <dt className="text-xs text-violet-800">Sesiones</dt>
          <dd className="font-bold tabular-nums">{summary.sesiones_detectadas ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
          <dt className="text-xs text-violet-800">Transile inferido</dt>
          <dd className="font-bold tabular-nums text-violet-900">
            {summary.sesiones_transile_interno ?? '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2">
          <dt className="text-xs text-violet-800">Visitas agrupadas</dt>
          <dd className="font-bold tabular-nums">{summary.visitas_volcable_total ?? '—'}</dd>
        </div>
      </dl>

      {transileSessions.length > 0 ?
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-2">Patente</th>
                <th className="px-2 py-2">Fecha</th>
                <th className="px-2 py-2">Visitas</th>
                <th className="px-2 py-2">Lapsos válidos</th>
                <th className="px-2 py-2">Cámaras</th>
                <th className="px-2 py-2">Excel</th>
                <th className="px-2 py-2">Duración (min)</th>
              </tr>
            </thead>
            <tbody>
              {transileSessions.slice(0, 30).map((r) => (
                <tr key={String(r.session_id)} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-mono">{r.patente}</td>
                  <td className="px-2 py-1.5">{r.fecha_sesion}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.visit_count}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.valid_laps}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">{r.volcable_devices}</td>
                  <td className="px-2 py-1.5">{r.excel_circuit_hint || '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.duration_min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : <p className="text-sm text-slate-600">Ninguna sesión cumple la regla de transile interno en este período.</p>}

      <button
        type="button"
        disabled={disabled || !sessionsCsv}
        onClick={() =>
          sessionsCsv && triggerBrowserCsvDownload('transile_interno_volcable_sessions.csv', sessionsCsv)
        }
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
      >
        Export CSV sesiones
      </button>
    </div>
  )
}
