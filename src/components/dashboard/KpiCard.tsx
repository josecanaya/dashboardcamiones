interface KpiCardProps {
  title: string
  value: string | number
  subtitle?: string
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}

export function KpiCard({ title, value, subtitle, tone = 'neutral' }: KpiCardProps) {
  const toneClass =
    tone === 'info'
      ? 'border-slate-200 bg-white'
      : tone === 'success'
        ? 'border-slate-200 bg-white'
        : tone === 'warning'
          ? 'border-slate-200 bg-white'
          : tone === 'danger'
            ? 'border-slate-200 bg-white'
            : 'border-slate-200 bg-white'

  return (
    <article className={`rounded-lg border px-2.5 py-2 shadow-sm ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-0.5 text-lg font-bold leading-none text-slate-900">{value}</p>
      {subtitle && <p className="mt-0.5 text-[10px] text-slate-500">{subtitle}</p>}
    </article>
  )
}
