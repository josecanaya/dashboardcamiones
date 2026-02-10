import { SITES, type SiteId } from '../domain/sites'
import { useSite } from '../context/SiteContext'

export function SiteSelector() {
  const { siteId, setSiteId, siteName } = useSite()

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">Planta:</span>
      <select
        value={siteId}
        onChange={(e) => setSiteId(e.target.value as SiteId)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        aria-label="Seleccionar planta"
      >
        {SITES.filter((s) => s.enabled).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <span
        className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-600"
        aria-live="polite"
      >
        {siteName}
      </span>
    </div>
  )
}
