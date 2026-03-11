interface KpiCardProps {
  title: string
  value: number
  tone?: 'success' | 'warning' | 'danger' | 'info'
}

const TONE_STYLES: Record<NonNullable<KpiCardProps['tone']>, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
  info: 'border-sky-200 bg-sky-50 text-sky-800',
}

export function KpiCard({ title, value, tone = 'info' }: KpiCardProps) {
  return (
    <div className={`rounded-lg border p-3 ${TONE_STYLES[tone]}`}>
      <div className="text-xs font-medium opacity-80">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  )
}
