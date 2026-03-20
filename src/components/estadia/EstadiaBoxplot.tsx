/**
 * Barra horizontal tipo timeline para resumen de estadía.
 * Escala 0–24 h. Marcadores: Media, Mediana, Moda, IQR (Q1–Q3), P90.
 * Sin cantidad de camiones.
 * Evita solapamiento de etiquetas con asignación a filas.
 */

const SCALE_MIN = 0
const SCALE_MAX = 24
const LABEL_MIN_GAP = 8 // % mínimo entre etiquetas para no solaparse

function toPct(value: number) {
  const pct = ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100
  return Math.max(0, Math.min(100, pct))
}

/** Asigna filas (0, 1, 2...) a etiquetas para evitar solapamiento. */
function assignRows(items: { pct: number }[]): number[] {
  const sorted = [...items].map((it, i) => ({ ...it, i })).sort((a, b) => a.pct - b.pct)
  const rows: number[] = new Array(items.length).fill(0)
  const rowEnds: number[] = [-999]

  for (const { pct, i } of sorted) {
    let row = 0
    while (row < rowEnds.length && pct - rowEnds[row]! < LABEL_MIN_GAP) row++
    if (row >= rowEnds.length) rowEnds.push(-999)
    rows[i] = row
    rowEnds[row] = pct
  }
  return rows
}

export interface BoxplotStats {
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean?: number
  p90?: number
  p95?: number
  mode?: number
  count?: number
}

export function EstadiaBoxplot({ stats }: { stats: BoxplotStats }) {
  const q1Pct = toPct(stats.q1)
  const q3Pct = toPct(stats.q3)
  const meanPct = stats.mean != null ? toPct(stats.mean) : null
  const medianPct = toPct(stats.median)
  const p90Pct = stats.p90 != null ? toPct(stats.p90) : null
  const modePct = stats.mode != null ? toPct(stats.mode) : null

  const aboveItems = [
    { pct: q1Pct, val: stats.q1.toFixed(1), color: 'text-slate-600' },
    { pct: medianPct, val: stats.median.toFixed(1), color: 'text-emerald-600' },
    { pct: q3Pct, val: stats.q3.toFixed(1), color: 'text-slate-600' },
  ]
  const belowItems = [
    ...(meanPct != null ? [{ pct: meanPct, val: stats.mean!.toFixed(1), color: 'text-violet-600' }] : []),
    ...(modePct != null ? [{ pct: modePct, val: stats.mode!.toFixed(1), color: 'text-red-600' }] : []),
    ...(p90Pct != null ? [{ pct: p90Pct, val: stats.p90!.toFixed(1), color: 'text-sky-600' }] : []),
  ]
  const aboveRows = assignRows(aboveItems.map((x) => ({ pct: x.pct })))
  const belowRows = assignRows(belowItems.map((x) => ({ pct: x.pct })))

  const markerClass = 'absolute top-0 h-full z-10 w-1.5 -translate-x-1/2'
  const labelClass = 'absolute -translate-x-1/2 text-xs font-medium tabular-nums whitespace-nowrap'

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-5 py-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
        Línea de tiempo (0–24 h)
      </div>
      <div className="relative h-32 w-full overflow-visible">
        {/* Inicio y Fin */}
        <div className="absolute top-0 left-0 right-0 h-5 overflow-visible text-xs font-medium text-slate-600">
          <span className="absolute left-0">0 h</span>
          <span className="absolute right-0">24 h</span>
        </div>
        {/* Etiquetas ARRIBA (con filas para evitar solapamiento) */}
        <div className="absolute left-0 right-0 top-0 h-12 overflow-visible">
          {aboveItems.map((it, i) => (
            <span
              key={`a-${i}`}
              className={`${labelClass} ${it.color}`}
              style={{ left: `${it.pct}%`, top: `${aboveRows[i]! * 14}px` }}
            >
              {it.val}
            </span>
          ))}
        </div>
        {/* Barra central — timeline */}
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center">
          <div className="relative h-12 w-full rounded-lg overflow-hidden shadow-sm">
            {/* Barra base gris */}
            <div className="absolute inset-0 rounded-lg bg-slate-300/50" />
            {/* Zona IQR (Q1–Q3) */}
            <div
              className="absolute left-0 top-0 h-full bg-sky-500/75"
              style={{ left: `${q1Pct}%`, width: `${Math.max(0, q3Pct - q1Pct)}%` }}
              title={`IQR: ${stats.q1.toFixed(1)}–${stats.q3.toFixed(1)}h`}
            />
            {/* Marcadores gruesos */}
            {meanPct != null && (
              <div
                className={`${markerClass} bg-violet-600`}
                style={{ left: `${meanPct}%` }}
                title={`Media: ${stats.mean!.toFixed(1)}h`}
              />
            )}
            <div
              className={`${markerClass} bg-emerald-600`}
              style={{ left: `${medianPct}%` }}
              title={`Mediana: ${stats.median.toFixed(1)}h`}
            />
            {modePct != null && (
              <div
                className={`${markerClass} bg-red-600`}
                style={{ left: `${modePct}%` }}
                title={`Moda: ${stats.mode!.toFixed(1)}h`}
              />
            )}
            {p90Pct != null && (
              <div
                className={`${markerClass} bg-sky-600`}
                style={{ left: `${p90Pct}%` }}
                title={`P90: ${stats.p90!.toFixed(1)}h`}
              />
            )}
          </div>
        </div>
        {/* Etiquetas ABAJO (con filas para evitar solapamiento) */}
        <div className="absolute left-0 right-0 bottom-0 h-12 overflow-visible">
          {belowItems.map((it, i) => (
            <span
              key={`b-${i}`}
              className={`${labelClass} ${it.color}`}
              style={{ left: `${it.pct}%`, bottom: `${belowRows[i]! * 14}px` }}
            >
              {it.val}
            </span>
          ))}
        </div>
      </div>
      {/* Leyenda */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-3 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-violet-600" />
          <span className="text-slate-600">Media</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-600" />
          <span className="text-slate-600">Mediana</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-600" />
          <span className="text-slate-600">Moda</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sky-600" />
          <span className="text-slate-600">P90</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm bg-sky-500/75" />
          <span className="text-slate-600">IQR (Q1–Q3)</span>
        </span>
      </div>
    </div>
  )
}
