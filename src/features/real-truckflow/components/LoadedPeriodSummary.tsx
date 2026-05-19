function formatDateTimeShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

export type LoadedPeriodSummaryProps = {
  queryStart: string
  queryEnd: string
  loadedAtIso: string
  eventsReceived: number
  alertsReceived: number
  operationalEvents: number
  operationalAlerts: number
  circuitsGenerated: number
}

export function LoadedPeriodSummaryCard(p: LoadedPeriodSummaryProps) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-950">Período cargado</h3>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Desde</dt>
          <dd className="mt-1 font-mono text-sm text-emerald-950">{p.queryStart || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Hasta</dt>
          <dd className="mt-1 font-mono text-sm text-emerald-950">{p.queryEnd || '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Carga local</dt>
          <dd className="mt-1 text-sm text-emerald-950">{formatDateTimeShort(p.loadedAtIso)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Eventos recibidos</dt>
          <dd className="mt-1 text-lg font-bold text-emerald-950">{p.eventsReceived.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Alertas recibidas</dt>
          <dd className="mt-1 text-lg font-bold text-emerald-950">{p.alertsReceived.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Eventos operativos</dt>
          <dd className="mt-1 text-lg font-bold text-emerald-950">{p.operationalEvents.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Alertas operativas</dt>
          <dd className="mt-1 text-lg font-bold text-emerald-950">{p.operationalAlerts.toLocaleString()}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">
            Circuitos generados (preliminares)
          </dt>
          <dd className="mt-1 text-lg font-bold text-emerald-950">{p.circuitsGenerated.toLocaleString()}</dd>
        </div>
      </dl>
    </div>
  )
}
