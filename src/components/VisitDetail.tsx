import { getVisitById, getEventsForVisit } from '../data/fixtures'
import { detectAnomalies } from '../lib/anomalies'
import { EVENT_TYPE_LABELS, LOCATION_LABELS } from '../lib/eventLabels'
import type { VisitEvent } from '../domain/truck'
import type { LabResultStatus } from '../domain/truck'

interface VisitDetailProps {
  visitId: string
  onBack: () => void
}

export function VisitDetail({ visitId, onBack }: VisitDetailProps) {
  const visit = getVisitById(visitId)
  if (!visit) {
    return (
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-6">
        <p className="text-slate-500">Visita no encontrada.</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-3 text-sm text-primary-600 hover:underline"
        >
          ← Volver
        </button>
      </div>
    )
  }

  const events = getEventsForVisit(visitId)
  const anomalies = detectAnomalies(visit, events)
  const lastEvent = events[events.length - 1]
  const currentState = lastEvent
    ? `${EVENT_TYPE_LABELS[lastEvent.type]} · ${LOCATION_LABELS[lastEvent.location]}`
    : 'Sin eventos'

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-slate-500 hover:text-slate-700 mb-1 inline-block"
            >
              ← Volver a visitas
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {visit.plate} · {visit.visitId}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {visit.cargoForm} · {visit.declaredProduct}
              {visit.declaredQty != null && ` · ${visit.declaredQty.toLocaleString()} kg`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-1 text-xs font-medium ${
                visit.cargoForm === 'SOLID' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
              }`}
            >
              {visit.cargoForm}
            </span>
            <span className="rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600">
              {visit.status}
            </span>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Estado actual
          </h3>
          <p className="text-sm text-slate-800 mt-1">{currentState}</p>
        </div>

        <div className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Timeline</h3>
          <ul className="space-y-0">
            {events.map((ev, i) => (
              <EventRow key={ev.eventId} event={ev} index={i} />
            ))}
          </ul>
        </div>
      </div>

      {anomalies.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-anomaly-200 overflow-hidden">
          <div className="p-3 border-b border-anomaly-100 bg-anomaly-100/50">
            <h3 className="text-sm font-semibold text-anomaly-700">Posibles anomalías</h3>
          </div>
          <ul className="divide-y divide-slate-100 p-3">
            {anomalies.map((a) => (
              <li
                key={a.code}
                className={`flex items-start gap-2 py-2 text-sm ${
                  a.severity === 'error' ? 'text-anomaly-700' : 'text-amber-700'
                }`}
              >
                <span className="shrink-0" aria-hidden>
                  {a.severity === 'error' ? '⚠' : '⚡'}
                </span>
                <span>{a.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EventRow({ event, index }: { event: VisitEvent; index: number }) {
  const label = EVENT_TYPE_LABELS[event.type] ?? event.type
  const loc = LOCATION_LABELS[event.location] ?? event.location
  const time = formatTime(event.occurredAt)
  const dataSummary = formatEventData(event)

  return (
    <li className="flex gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{loc}</div>
        <div className="text-xs text-slate-400 mt-0.5">{time}</div>
        {dataSummary && (
          <div className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1 inline-block">
            {dataSummary}
          </div>
        )}
      </div>
    </li>
  )
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatEventData(ev: VisitEvent): string {
  if (!ev.data || Object.keys(ev.data).length === 0) return ''
  const d = ev.data as Record<string, unknown>
  if (ev.type === 'LAB_RESULT_READY' && d.status) {
    return `Resultado: ${d.status as LabResultStatus}`
  }
  if (ev.type === 'SCALE_IN' && (d.pesoBruto != null || d.pesoNeto != null)) {
    const parts = []
    if (d.pesoBruto != null) parts.push(`Bruto: ${d.pesoBruto} kg`)
    if (d.pesoNeto != null) parts.push(`Neto: ${d.pesoNeto} kg`)
    return parts.join(' · ')
  }
  if (ev.type === 'SCALE_OUT' && (d.pesoTara != null || d.pesoNeto != null || d.measuredQty != null)) {
    const parts = []
    if (d.pesoTara != null) parts.push(`Tara: ${d.pesoTara} kg`)
    if (d.pesoNeto != null) parts.push(`Neto: ${d.pesoNeto} kg`)
    if (d.measuredQty != null) parts.push(`Medido: ${d.measuredQty} kg`)
    return parts.join(' · ')
  }
  if (ev.type === 'DISCHARGE_ASSIGNED' && (d.pit || d.bay)) {
    return `Destino: ${(d.pit ?? d.bay) as string}`
  }
  if (ev.type === 'DISCHARGE_END' && d.measuredQty != null) {
    return `Cantidad: ${d.measuredQty} kg`
  }
  return ''
}
