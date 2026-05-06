type Stage = {
  title: string
  value: number
  pctOfRaw?: number
  badge?: string
}

/** Embudo ejecutivo: cada etapa más angosta visualmente hacia abajo. */
export function DataQualityFunnel(props: { stages: Stage[] }) {
  const { stages } = props
  if (stages.length === 0) return null

  const max = Math.max(...stages.map((s) => Math.max(1, s.value)), 1)

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-1">
      {stages.map((st, idx) => {
        const isLast = idx === stages.length - 1
        const widthPct = Math.max(72, Math.round((st.value / max) * 100))
        return (
          <div key={`${st.title}-${idx}`} className="flex flex-col items-center">
            <div
              style={{ width: `${widthPct}%`, minWidth: '12rem' }}
              className={`rounded-2xl border px-4 py-4 shadow-sm transition-all ${
                isLast
                  ? 'border-blue-900 bg-gradient-to-br from-blue-900 to-indigo-950 text-white ring-1 ring-blue-800/40'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    isLast ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  {st.title}
                </div>
                {st.badge !== undefined ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isLast ? 'bg-white/15 text-blue-50' : 'bg-white text-slate-700 ring-1 ring-slate-200'
                    }`}
                  >
                    {st.badge}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{st.value.toLocaleString()}</div>
              {st.pctOfRaw !== undefined ? (
                <div className={`mt-2 text-[11px] ${isLast ? 'text-blue-100/90' : 'text-slate-600'}`}>
                  {`${(st.pctOfRaw * 100).toFixed(1)}% respecto de datos crudos (journeys UID)`}
                </div>
              ) : null}
            </div>
            {!isLast ? (
              <div className="flex justify-center py-0.5 text-slate-400" aria-hidden>
                <span className="text-lg leading-none">↓</span>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
