import {
  EXECUTIVE_SAMPLE_PRODUCTS,
  executiveSampleProductLabel,
  PRODUCT_FILTER_ALL,
  type ExecutiveProductFilterPlan,
} from '../etlWorkbench/etlProductFilter'

type Props = {
  plan: ExecutiveProductFilterPlan | null
  value: string
  onChange: (product: string) => void
  pending?: boolean
  className?: string
}

/** Filtro de muestra: Soja, Girasol y Aceite (+ Todos). Los conteos vienen precalculados del padre. */
export function ExecutiveSampleProductFilter({ plan, value, onChange, pending, className }: Props) {
  if (!plan) return null

  const options = [PRODUCT_FILTER_ALL, ...EXECUTIVE_SAMPLE_PRODUCTS] as const

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Producto (muestra)</span>
        {pending ?
          <span className="text-xs font-medium text-violet-600">Actualizando gráficos…</span>
        : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((product) => {
          const active = value === product
          const count = plan.counts[product] ?? 0
          return (
            <button
              key={product}
              type="button"
              onClick={() => onChange(product)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                active ?
                  'border-violet-500 bg-violet-600 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50'
              }`}
            >
              {executiveSampleProductLabel(product)}
              <span className={`ml-1.5 tabular-nums ${active ? 'text-violet-100' : 'text-slate-400'}`}>
                ({count.toLocaleString()})
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
