import type { TruckflowApiJourneyDayStat } from '../../../services/truckflowRawJourneyStats'

type Props = {
  rows: TruckflowApiJourneyDayStat[]
  title?: string
  className?: string
}

export function ApiJourneyCountByDayTable({ rows, title, className }: Props) {
  if (!rows.length) return null

  const totalEvents = rows.reduce((s, r) => s + (Number(r.events) || 0), 0)
  const totalJourneys = rows.reduce((s, r) => s + (Number(r.uniqueJourneyUids) || 0), 0)

  return (
    <div className={className ?? ''}>
      {title ?
        <h3 className="mb-2 text-sm font-bold text-slate-900">{title}</h3>
      : null}
      <p className="mb-3 text-xs text-slate-600">
        Conteo de <strong className="text-slate-800">journeyUid</strong> distintos en el JSON crudo de la API (antes
        de limpieza, corte de ciclos o transform ETL). Por fila: carpeta{' '}
        <span className="font-mono">data/truckflow/YYYY-MM-DD/event-list.json</span>.
      </p>
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase text-violet-800">Σ journeys API (suma por día)</div>
          <div className="text-xl font-bold text-violet-950">{totalJourneys.toLocaleString()}</div>
          <div className="text-[10px] text-violet-800">
            Un mismo UID puede repetirse en varios días (comportamiento API).
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase text-slate-600">Σ eventos en archivos</div>
          <div className="text-xl font-bold text-slate-900">{totalEvents.toLocaleString()}</div>
        </div>
      </div>
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-600">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2">Día extracción</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Eventos</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Journeys API</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Alertas</th>
              <th className="border-b border-slate-200 px-3 py-2 text-right">Journeys alertas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.day} className="border-b border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{r.day}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(Number(r.events) || 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-violet-900">
                  {r.eventFile ? (Number(r.uniqueJourneyUids) || 0).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.alertFile ? (Number(r.alerts) || 0).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                  {r.alertFile ? (Number(r.uniqueAlertJourneyUids) || 0).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
