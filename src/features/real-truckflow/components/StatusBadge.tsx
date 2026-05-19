import type { WorkPeriodStatus } from '../workspaceTypes'

const LABELS: Record<WorkPeriodStatus, string> = {
  idle: 'Sin cargar',
  loading: 'Cargando…',
  loaded: 'Cargado',
  error: 'Error',
}

const CLASS_BY_STATUS: Record<WorkPeriodStatus, string> = {
  idle: 'bg-slate-100 text-slate-700 ring-slate-200',
  loading: 'bg-amber-50 text-amber-950 ring-amber-200',
  loaded: 'bg-emerald-50 text-emerald-950 ring-emerald-200',
  error: 'bg-rose-50 text-rose-950 ring-rose-200',
}

export function StatusBadge({ status }: { status: WorkPeriodStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${CLASS_BY_STATUS[status]}`}
    >
      {LABELS[status]}
    </span>
  )
}
