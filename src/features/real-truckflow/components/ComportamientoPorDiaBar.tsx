import { useMemo } from 'react'
import { SCATTER_DAY_FILTER_ALL } from '../etlWorkbench/etlSegmentScatterByDay'

export type DayBarItem = {
  fecha: string
  label: string
  weekday: string
  total: number
}

/**
 * Selector visual por día (barras + «Todos los días»), compartido por la ficha de circuito
 * y los paneles de calada / volcable SL en KPI tiempos.
 */
export function ComportamientoPorDiaBar({
  dayBars,
  selectedDay,
  onSelectDay,
  hint = 'camiones por día · clic para filtrar',
}: {
  dayBars: DayBarItem[]
  selectedDay: string
  onSelectDay: (day: string) => void
  hint?: string
}) {
  const maxDay = useMemo(() => Math.max(...dayBars.map((d) => d.total), 1), [dayBars])
  const allDays = selectedDay === SCATTER_DAY_FILTER_ALL

  if (!dayBars.length) return null

  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-7 py-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Comportamiento por día</h3>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() => onSelectDay(SCATTER_DAY_FILTER_ALL)}
          className={`self-center whitespace-nowrap rounded-xl px-4 py-2 text-center text-[12.5px] font-bold leading-tight ${
            allDays ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Todos
          <br />
          los días
        </button>
        <div className="h-16 w-px self-end bg-slate-200" />
        {dayBars.map((d) => {
          const sel = selectedDay === d.fecha
          const h = Math.round(46 + (d.total / maxDay) * 34)
          return (
            <button
              key={d.fecha}
              type="button"
              onClick={() => onSelectDay(sel ? SCATTER_DAY_FILTER_ALL : d.fecha)}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`text-[11px] tabular-nums ${sel ? 'font-extrabold text-violet-700' : 'font-bold text-slate-400'}`}
              >
                {d.total > 0 ? Math.round(d.total) : '—'}
              </span>
              <span className="w-[30px] rounded-md" style={{ height: h, background: sel ? '#6d28d9' : '#c4b5fd' }} />
              <span className={`text-[11px] ${sel ? 'font-bold text-violet-700' : 'text-slate-500'}`}>
                {d.weekday} <b className="text-slate-700">{d.label}</b>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const WD = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

/** Camiones distintos (`journey_id`) por día calendario, a partir de filas con `localDay` + `journeyId`. */
export function buildDayBarsFromJourneySets(
  entries: { localDay: string; journeyId: string }[]
): DayBarItem[] {
  const byDay = new Map<string, Set<string>>()
  for (const { localDay, journeyId } of entries) {
    if (!localDay || !journeyId) continue
    const s = byDay.get(localDay) ?? new Set<string>()
    s.add(journeyId)
    byDay.set(localDay, s)
  }
  return [...byDay.keys()]
    .sort()
    .map((fecha) => ({
      fecha,
      label: fecha.slice(-2),
      weekday: WD[new Date(`${fecha}T00:00:00`).getDay()] ?? '',
      total: byDay.get(fecha)!.size,
    }))
}
