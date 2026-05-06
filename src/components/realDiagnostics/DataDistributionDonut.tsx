type Slice = {
  label: string
  count: number
  colorVar: '--c0' | '--c1' | '--c2' | '--c3'
}

/** Dona ejecutiva usando conic-gradient; sin librerías. */
export function DataDistributionDonut(props: {
  slices: Slice[]
  centerLabel?: string
  centerValue?: string
}) {
  const { slices, centerLabel = 'TOTAL', centerValue } = props
  const total = slices.reduce((s, x) => s + Math.max(0, x.count), 0)

  const colors: Record<string, string> = {
    '--c0': '#059669',
    '--c1': '#e11d48',
    '--c2': '#d97706',
    '--c3': '#64748b',
  }

  let acc = 0
  const parts: string[] = []
  if (total <= 0) {
    parts.push(`#e2e8f0 0deg 360deg`)
  } else {
    for (const sl of slices) {
      const c = Math.max(0, sl.count)
      const start = (acc / total) * 360
      acc += c
      const end = (acc / total) * 360
      const col = colors[sl.colorVar] ?? '#64748b'
      parts.push(`${col} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`)
    }
  }

  const grad = total > 0 ? parts.join(', ') : undefined

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative h-52 w-52 shrink-0">
        <div
          className="h-full w-full rounded-full shadow-inner"
          style={
            grad
              ? { backgroundImage: `conic-gradient(${grad})`, boxSizing: 'border-box' }
              : { background: '#f1f5f9' }
          }
          role="img"
          aria-label="Distribución de journeys"
        />
        <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full bg-white shadow-md">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{centerLabel}</div>
          <div className="text-xl font-bold tabular-nums text-slate-900">{total > 0 ? total : '—'}</div>
          {centerValue ? <div className="mt-1 text-center text-[11px] text-slate-600">{centerValue}</div> : null}
        </div>
      </div>
      <ul className="min-w-[200px] space-y-3 text-sm">
        {slices.map((sl) => {
          const pct = total > 0 ? (sl.count / total) * 100 : 0
          return (
            <li key={sl.label} className="flex items-start gap-3">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colors[sl.colorVar] ?? '#64748b' }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2 font-medium text-slate-800">
                  <span>{sl.label}</span>
                  <span className="tabular-nums text-slate-900">
                    {sl.count.toLocaleString()}{' '}
                    <span className="text-xs font-normal text-slate-500">({pct.toFixed(1)}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      backgroundColor: colors[sl.colorVar] ?? '#64748b',
                    }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
