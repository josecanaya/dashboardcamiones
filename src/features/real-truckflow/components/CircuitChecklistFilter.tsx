/**
 * Checklist multi-circuito. Reemplaza al filtro de Producto en KPI Tiempos: el usuario
 * tilda qué circuitos entran. Usa `<details>` para el abrir/cerrar (sin estado de
 * click-outside). Espeja el layout label+control de `ProductFilterSelect`.
 */
export type CircuitChecklistOption = { id: string; label: string }

type Props = {
  options: CircuitChecklistOption[]
  checked: Set<string>
  onChange: (next: Set<string>) => void
  className?: string
}

export function CircuitChecklistFilter({ options, checked, onChange, className }: Props) {
  if (!options.length) return null

  const toggle = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  const setAll = (all: boolean) => onChange(all ? new Set(options.map((o) => o.id)) : new Set())

  const checkedCount = options.filter((o) => checked.has(o.id)).length
  const summaryLabel =
    checkedCount === 0 ? 'Ningún circuito'
    : checkedCount === options.length ? `Todos (${options.length})`
    : `${checkedCount} de ${options.length}`

  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ''}`}>
      <span className="font-semibold text-slate-700">Circuitos (filtro)</span>
      <details className="group relative">
        <summary className="flex min-w-[16rem] cursor-pointer list-none items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          <span>{summaryLabel}</span>
          <span className="text-slate-400 group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute z-20 mt-1 max-h-72 w-72 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <div className="mb-1 flex gap-2 border-b border-slate-100 pb-2">
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setAll(false)}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ninguno
            </button>
          </div>
          <ul className="space-y-0.5">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={checked.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-slate-700">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </label>
  )
}
