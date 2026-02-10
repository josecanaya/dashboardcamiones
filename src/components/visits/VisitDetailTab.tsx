import { useState } from 'react'
import type { ReconstructedVisit, NormalizedEvent } from '../../domain/events'
import type { EventType, LocationKey } from '../../domain/truck'
import { detectAnomalies } from '../../analytics/anomalies'
import { validateTrip } from '../../validation'
import { buildTripSummaryFromEvents } from '../../engine'
import { EVENT_TYPE_LABELS } from '../../lib/eventLabels'
import { LOCATION_LABELS } from '../../lib/eventLabels'
import { useSimulatorVisit } from '../../context/SimulatorVisitContext'

interface VisitDetailTabProps {
  visit: ReconstructedVisit
  onBack: () => void
  onSimulate?: () => void
}

export function VisitDetailTab({ visit, onBack, onSimulate }: VisitDetailTabProps) {
  const { setVisitToSimulate } = useSimulatorVisit()
  const [rawRow, setRawRow] = useState<Record<string, unknown> | null>(null)
  const anomalies = detectAnomalies(visit)
  const validation = validateTrip(visit.events)
  const tripSummary = buildTripSummaryFromEvents(visit.events)
  const lastEv = visit.events[visit.events.length - 1]
  const currentState = lastEv
    ? `${EVENT_TYPE_LABELS[lastEv.eventType as EventType] ?? lastEv.eventType}${lastEv.locationKey ? ` · ${LOCATION_LABELS[lastEv.locationKey as LocationKey] ?? lastEv.locationKey}` : ''}`
    : 'Sin eventos'

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <button type="button" onClick={onBack} className="text-sm text-slate-500 hover:text-slate-700 mb-1">
              ← Volver a visitas
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {visit.plate ?? visit.visitId}
            </h2>
            <p className="text-xs text-slate-500">
              {visit.cargoForm} · {visit.product ?? '—'} · {visit.status}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600">
              {visit.status}
            </span>
            <span className="rounded px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600">
              Ciclo: {visit.metrics.cycleTimeMinutes ?? '—'} min
            </span>
            {onSimulate && (
              <button
                type="button"
                onClick={() => { setVisitToSimulate(visit); onSimulate() }}
                className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
              >
                Simular esta visita
              </button>
            )}
          </div>
        </div>
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase">Estado actual</h3>
          <p className="text-sm text-slate-800 mt-1">{currentState}</p>
        </div>
        <div className="p-4 border-b border-slate-100">
          <h3 className="text-xs font-semibold text-slate-500 uppercase">Validación</h3>
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  validation.status === 'VALID_IDEAL'
                    ? 'bg-green-100 text-green-800'
                    : validation.status === 'INVALID'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-sky-100 text-sky-800'
                }`}
              >
                {validation.status}
              </span>
              {validation.flags.length > 0 && (
                <span className="text-xs text-slate-600">{validation.flags.join(', ')}</span>
              )}
            </div>
            <p className="text-sm font-mono text-slate-700">Secuencia: {validation.pathDisplay || '—'}</p>
            {validation.caladaResults.length > 0 && (
              <p className="text-sm text-slate-600">Resultado(s) calada: {validation.caladaResults.join(', ')}</p>
            )}
            <p className="text-xs text-slate-500">{validation.explanation}</p>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <h4 className="text-xs font-semibold text-slate-500 uppercase mb-1">Relato</h4>
              <p className="text-sm text-slate-700 leading-relaxed">{tripSummary.story}</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Métricas</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li>Cycle: {visit.metrics.cycleTimeMinutes ?? '—'} min</li>
            <li>Time to sample: {visit.metrics.timeToSampleMinutes ?? '—'} min</li>
            <li>Lab turnaround: {visit.metrics.labTurnaroundMinutes ?? '—'} min</li>
            <li>Yard wait: {visit.metrics.yardWaitTimeMinutes ?? '—'} min</li>
            <li>Discharge duration: {visit.metrics.dischargeDurationMinutes ?? '—'} min</li>
            {visit.metrics.missingSteps?.length ? (
              <li className="col-span-2 text-amber-700">Missing: {visit.metrics.missingSteps.join(', ')}</li>
            ) : null}
          </ul>
        </div>
        <div className="p-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Timeline</h3>
          <ul className="space-y-0">
            {visit.events.map((ev, i) => (
              <EventRow
                key={i}
                event={ev}
                index={i}
                onShowRaw={() => setRawRow(ev.raw)}
              />
            ))}
          </ul>
        </div>
      </div>
      {anomalies.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-anomaly-200 overflow-hidden">
          <div className="p-3 border-b border-anomaly-100 bg-anomaly-100/50">
            <h3 className="text-sm font-semibold text-anomaly-700">Anomalías</h3>
          </div>
          <ul className="p-3 divide-y divide-slate-100">
            {anomalies.map((a) => (
              <li key={a.code} className={`py-2 text-sm ${a.severity === 'error' ? 'text-anomaly-700' : 'text-amber-700'}`}>
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rawRow && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-700">Fila original (raw)</h3>
            <button type="button" onClick={() => setRawRow(null)} className="text-slate-500 hover:text-slate-700">
              Cerrar
            </button>
          </div>
          <pre className="p-4 text-xs overflow-x-auto max-h-64 overflow-y-auto bg-slate-50">
            {JSON.stringify(rawRow, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function EventRow({
  event,
  index,
  onShowRaw,
}: {
  event: NormalizedEvent
  index: number
  onShowRaw: () => void
}) {
  const label = EVENT_TYPE_LABELS[event.eventType as EventType] ?? event.eventType
  const loc = event.locationKey ? (LOCATION_LABELS[event.locationKey as LocationKey] ?? event.locationKey) : '—'
  const time = formatTime(event.occurredAt)
  const dataSummary = formatEventData(event)

  return (
    <li className="flex gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="shrink-0 w-6 h-6 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-medium">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={onShowRaw}
        className="min-w-0 flex-1 text-left hover:bg-slate-50 rounded px-1 -mx-1"
      >
        <div className="font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500">{loc}</div>
        <div className="text-xs text-slate-400">{time}</div>
        {dataSummary && (
          <div className="text-xs text-slate-600 mt-1 bg-slate-50 rounded px-2 py-1 inline-block">
            {dataSummary}
          </div>
        )}
      </button>
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

function formatEventData(ev: NormalizedEvent): string {
  const d = ev.raw
  if (!d || Object.keys(d).length === 0) return ''
  if (ev.eventType === 'LAB_RESULT_READY' && d.status) return `Resultado: ${d.status}`
  if (ev.eventType === 'SCALE_IN' && (d.pesoBruto != null || d.pesoNeto != null)) {
    const parts = []
    if (d.pesoBruto != null) parts.push(`Bruto: ${d.pesoBruto}`)
    if (d.pesoNeto != null) parts.push(`Neto: ${d.pesoNeto}`)
    return parts.join(' · ')
  }
  if (ev.eventType === 'SCALE_OUT' && (d.pesoTara != null || d.pesoNeto != null || d.measuredQty != null)) {
    const parts = []
    if (d.pesoTara != null) parts.push(`Tara: ${d.pesoTara}`)
    if (d.pesoNeto != null) parts.push(`Neto: ${d.pesoNeto}`)
    if (d.measuredQty != null) parts.push(`Medido: ${d.measuredQty}`)
    return parts.join(' · ')
  }
  if (ev.eventType === 'DISCHARGE_ASSIGNED' && (d.pit || d.bay)) return `Destino: ${d.pit ?? d.bay}`
  if (ev.eventType === 'DISCHARGE_END' && d.measuredQty != null) return `Cantidad: ${d.measuredQty}`
  return ''
}
