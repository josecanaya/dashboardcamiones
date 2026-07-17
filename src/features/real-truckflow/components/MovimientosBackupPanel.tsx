import { useEffect, useRef, useState } from 'react'
import {
  getMovimientosBackupCoverage,
  postMovimientosIngest,
  type MovimientosBackupCoverage,
} from '../api/movimientosBackupApi'

/**
 * Carga de Movimientos por Contrato al backup local particionado por día.
 * Subís el/los Excel (meses enteros); se parten por la fecha de cada fila y
 * quedan como respaldo. Las corridas del ETL/agente los leen por rango.
 */
export function MovimientosBackupPanel() {
  const [coverage, setCoverage] = useState<MovimientosBackupCoverage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastSummary, setLastSummary] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  async function refresh() {
    try {
      setCoverage(await getMovimientosBackupCoverage())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onFiles(files: FileList | null) {
    if (!files || !files.length || busy) return
    setBusy(true)
    setError('')
    const summaries: string[] = []
    try {
      for (const file of Array.from(files)) {
        const res = await postMovimientosIngest(file)
        summaries.push(res.summary || `${res.file}: ok`)
        setCoverage(res.coverage)
      }
      setLastSummary(summaries.join('\n'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const days = coverage?.days ?? []

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Backup de Movimientos por Contrato</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Subí los Excel (meses enteros). Se parten por la fecha de cada fila y quedan de respaldo;
            las corridas los leen por rango. Volver a subir el mismo archivo no duplica.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Subiendo…' : 'Subir movimientos'}
          </button>
        </div>
      </div>

      {error ?
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
      : null}
      {lastSummary && !error ?
        <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
          {lastSummary}
        </pre>
      : null}

      <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
        <span>
          Backup: <strong>{coverage?.totalDays ?? 0}</strong> días ·{' '}
          <strong>{(coverage?.totalRows ?? 0).toLocaleString()}</strong> movimientos
        </span>
        <button type="button" onClick={() => void refresh()} className="text-slate-500 hover:text-slate-800">
          Refrescar
        </button>
      </div>

      {days.length ?
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-100">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Día</th>
                <th className="px-3 py-1.5 text-right font-medium">Movimientos</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-t border-slate-100">
                  <td className="px-3 py-1 text-slate-700">{d.day}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-slate-700">{d.rows.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      : <p className="mt-2 text-xs text-slate-400">Todavía no hay movimientos en el backup.</p>}
    </section>
  )
}
