/**
 * Checklist multi-circuito. Reemplaza al filtro de Producto en KPI Tiempos: el usuario
 * tilda qué circuitos entran. Usa `<details>` para el abrir/cerrar (sin estado de
 * click-outside). Espeja el layout label+control de `ProductFilterSelect`.
 *
 * Los tildes NO commitean en vivo: mutan un `draft` local y recién al tocar «Aplicar»
 * se llama `onChange`. Sin esto, cada click re-renderiza toda la pestaña KPI (tablas +
 * gráficos Recharts con histograma/KDE/scatter) y la UI se traba.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

export type CircuitChecklistOption = { id: string; label: string }

type Props = {
  options: CircuitChecklistOption[]
  /** Set actualmente aplicado (fuente de verdad del padre). */
  checked: Set<string>
  /** Se llama solo al «Aplicar», con el draft confirmado. */
  onChange: (next: Set<string>) => void
  className?: string
}

export function CircuitChecklistFilter({ options, checked, onChange, className }: Props) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null)

  // Clave por contenido (no identidad) del set aplicado: el padre puede recrear el Set
  // en cada render, pero mientras el contenido no cambie no reseteamos el draft.
  const appliedKey = useMemo(() => [...checked].sort().join('|'), [checked])
  const [draft, setDraft] = useState<Set<string>>(() => new Set(checked))

  // Resincroniza el draft cuando cambia el set aplicado desde afuera (Todos/Ninguno del
  // padre, o el commit propio).
  useEffect(() => {
    setDraft(new Set(appliedKey ? appliedKey.split('|') : []))
  }, [appliedKey])

  if (!options.length) return null

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const setAll = (all: boolean) => setDraft(all ? new Set(options.map((o) => o.id)) : new Set())

  const draftKey = [...draft].sort().join('|')
  const dirty = draftKey !== appliedKey
  const draftCount = options.filter((o) => draft.has(o.id)).length

  const appliedCount = options.filter((o) => checked.has(o.id)).length
  const summaryLabel =
    appliedCount === 0 ? 'Ningún circuito'
    : appliedCount === options.length ? `Todos (${options.length})`
    : `${appliedCount} de ${options.length}`

  const apply = () => {
    onChange(new Set(draft))
    if (detailsRef.current) detailsRef.current.open = false
  }

  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ''}`}>
      <span className="font-semibold text-slate-700">Circuitos (filtro)</span>
      <details ref={detailsRef} className="group relative">
        <summary className="flex min-w-[16rem] cursor-pointer list-none items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          <span>
            {summaryLabel}
            {dirty ?
              <span className="ml-2 text-[11px] font-semibold text-amber-600">· sin aplicar</span>
            : null}
          </span>
          <span className="text-slate-400 group-open:rotate-180">▾</span>
        </summary>
        <div className="absolute z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
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
          <ul className="max-h-56 space-y-0.5 overflow-auto">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={draft.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-slate-700">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <span className="text-[11px] text-slate-500">{draftCount} seleccionados</span>
            <button
              type="button"
              onClick={apply}
              disabled={!dirty}
              className="rounded-lg bg-violet-700 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Aplicar
            </button>
          </div>
        </div>
      </details>
    </label>
  )
}
