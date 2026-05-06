import type { ReactNode } from 'react'

export type ExecCardAccent = 'default' | 'green' | 'amber' | 'rose' | 'blue' | 'slate'

const ACCENT: Record<ExecCardAccent, string> = {
  default: 'border-slate-200 bg-white shadow-sm',
  green: 'border-emerald-200/90 bg-emerald-50/50 shadow-sm',
  amber: 'border-amber-200/90 bg-amber-50/40 shadow-sm',
  rose: 'border-rose-200/90 bg-rose-50/40 shadow-sm',
  blue: 'border-sky-200/90 bg-sky-50/40 shadow-sm',
  slate: 'border-slate-200 bg-slate-50/70 shadow-sm',
}

export function ExecutiveMetricCard(props: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: ExecCardAccent
}) {
  const { label, value, sub, accent = 'default' } = props
  return (
    <div className={`rounded-2xl border p-4 ${ACCENT[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      {sub !== undefined && sub !== null && sub !== '' ? (
        <div className="mt-1 text-xs text-slate-600">{sub}</div>
      ) : null}
    </div>
  )
}
