/**
 * Selector de procesos guardados, agrupado por mes.
 *
 * Reemplaza al listado plano de botones `<from> → <to>`: con una ventana por semana la lista
 * crece ~4 por mes y se volvía ilegible. Acá cada mes es una fila con sus semanas numeradas
 * (S1, S2, …), el rango en formato corto y el estado visible.
 */
import type { SavedWindow } from '../api/etlRunCacheApi'

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** `2026-07-20` → `20/07`. Sin `new Date()`: evita corrimientos por zona horaria. */
function shortDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  const idx = Number(m) - 1
  return `${MESES[idx] ?? m} ${y}`
}

export type SavedWindowsPickerProps = {
  windows: SavedWindow[]
  activeRunId?: string | null
  disabled?: boolean
  onPick: (w: SavedWindow) => void
}

export function SavedWindowsPicker({
  windows,
  activeRunId,
  disabled,
  onPick,
}: SavedWindowsPickerProps) {
  if (!windows.length) return null

  // Agrupado por mes de la fecha de inicio, mes más reciente primero, semanas ascendentes.
  const byMonth = new Map<string, SavedWindow[]>()
  for (const w of [...windows].sort((a, b) => a.from.localeCompare(b.from))) {
    const k = monthKey(w.from)
    const list = byMonth.get(k)
    if (list) list.push(w)
    else byMonth.set(k, [w])
  }
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a))
  const staleCount = windows.filter((w) => w.stale).length

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
            Procesos guardados
          </span>
          <span className="text-[11px] text-slate-500">
            {windows.length} {windows.length === 1 ? 'semana' : 'semanas'} · clic = ver sin
            reprocesar
          </span>
        </div>
        {staleCount > 0 ?
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            {staleCount} con reglas viejas
          </span>
        : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {months.map((mk) => (
          <div key={mk} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="w-28 shrink-0 text-[11px] font-semibold capitalize text-slate-500">
              {monthLabel(mk)}
            </span>
            {byMonth.get(mk)!.map((w, i) => {
              const active = activeRunId === w.runId
              return (
                <button
                  key={w.runId}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(w)}
                  title={`${w.from} → ${w.to} · run ${w.runId} · guardado ${w.createdAt.slice(0, 10)}${
                    w.stale ? ` · reglas ${w.rulesVersion} (viejas)` : ''
                  }`}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                    active ? 'border-emerald-600 bg-emerald-600 text-white'
                    : w.stale ? 'border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100'
                    : 'border-slate-300 bg-white text-slate-800 hover:border-emerald-400 hover:bg-emerald-50'
                  }`}
                >
                  <span
                    className={`rounded px-1 text-[10px] font-bold ${
                      active ? 'bg-emerald-800/60 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    S{i + 1}
                  </span>
                  <span className="tabular-nums">
                    {shortDay(w.from)}–{shortDay(w.to)}
                  </span>
                  {w.stale ?
                    <span title="Reglas cambiaron: conviene recalcular">⚠</span>
                  : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
