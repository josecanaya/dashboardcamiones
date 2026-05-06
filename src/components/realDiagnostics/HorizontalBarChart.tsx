export function HorizontalBarChart(props: {
  items: { id: string; label: string; count: number; colorClass?: string }[]
  title?: string
  onPick?: (id: string) => void
}) {
  const { items, title, onPick } = props
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h4 className="mb-4 text-sm font-semibold text-slate-800">{title}</h4> : null}
      <ul className="space-y-3">
        {items.length === 0 ? (
          <li className="text-sm text-slate-500">Sin datos para graficar.</li>
        ) : (
          items.map((row) => {
            const pct = (row.count / max) * 100
            return (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={!onPick}
                  onClick={() => onPick?.(row.id)}
                  className={`flex w-full flex-col gap-1 rounded-xl text-left transition-colors ${onPick ? 'hover:bg-slate-50' : ''} ${onPick ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="min-w-0 flex-1 text-xs font-semibold leading-snug text-slate-800">{row.label}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{row.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${row.colorClass ?? 'bg-sky-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
