import { PRODUCT_FILTER_ALL, type JourneyProductLookup } from '../etlWorkbench/etlProductFilter'

type Props = {
  lookup: JourneyProductLookup | null
  value: string
  onChange: (product: string) => void
  className?: string
}

/** Selector simple de producto (merge XLSX). Si no hay merge, no renderiza nada. */
export function ProductFilterSelect({ lookup, value, onChange, className }: Props) {
  if (!lookup?.products.length) return null

  return (
    <label className={`flex flex-col gap-1 text-sm ${className ?? ''}`}>
      <span className="font-semibold text-slate-700">Producto</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[10rem] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
      >
        <option value={PRODUCT_FILTER_ALL}>Todos</option>
        {lookup.products.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </label>
  )
}
