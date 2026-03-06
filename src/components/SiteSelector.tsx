import { SITES, type SiteId } from '../domain/sites'
import { useSite } from '../context/SiteContext'

interface SiteSelectorProps {
  tone?: 'light' | 'dark'
}

export function SiteSelector({ tone = 'light' }: SiteSelectorProps) {
  const { siteId, setSiteId, siteName } = useSite()
  const isDark = tone === 'dark'

  return (
    <div className="flex items-center gap-2">
      <span className={isDark ? 'text-xs font-semibold uppercase tracking-wide text-violet-200/90' : 'text-sm text-slate-500'}>
        Planta
      </span>
      <select
        value={siteId}
        onChange={(e) => setSiteId(e.target.value as SiteId)}
        className={
          isDark
            ? 'rounded-lg border border-violet-300/25 bg-violet-900/50 px-3 py-1.5 text-sm font-medium text-violet-50 outline-none ring-violet-300/40 focus:ring-2'
            : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'
        }
        aria-label="Seleccionar planta"
      >
        {SITES.filter((s) => s.enabled).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <span
        className={
          isDark
            ? 'rounded-full border border-violet-300/30 bg-violet-700/35 px-2.5 py-0.5 text-xs font-semibold text-violet-100'
            : 'rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-600'
        }
        aria-live="polite"
      >
        {siteName}
      </span>
    </div>
  )
}
