import { useEffect, useState } from 'react'
import { getTruckJourney, type TruckJourney } from '../../services/live/plantStateApi'

function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return 'sin dato'
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h <= 0) return `${m}′`
  return `${h}h ${String(m).padStart(2, '0')}′`
}

function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function TruckJourneyPanel(props: {
  site?: string
  plate: string
  onClose: () => void
  onOpenCamera?: (deviceCode: string) => void
}) {
  const site = props.site ?? 'ricardone'
  const [journey, setJourney] = useState<TruckJourney | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getTruckJourney(site, props.plate)
      .then((j) => {
        if (!cancelled) {
          setJourney(j)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [site, props.plate])

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando journey de {props.plate}…</p>
  }
  if (error) {
    return (
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-red-600">{error}</p>
        <button type="button" onClick={props.onClose} className="text-sm text-slate-500">
          Cerrar
        </button>
      </div>
    )
  }
  if (!journey) return null

  return (
    <div className="rounded-[12px] border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-end gap-4 border-b border-slate-200 pb-3">
        <div>
          <h3 className="font-mono text-2xl font-semibold tracking-wide text-slate-900">
            {journey.plate}
          </h3>
          <p className="mt-1 text-[11.5px] text-slate-400">
            journey <span className="font-mono">{journey.journeyUid.slice(0, 8)}…</span>
            {journey.provisional ? ' · circuito provisional' : ''}
          </p>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Circuito
          </div>
          <div className="mt-0.5 text-[15px]">
            <span className="font-mono font-semibold">{journey.circuit ?? 'sin dato'}</span>
            {journey.circuitLabel ? (
              <span className="ml-1 text-[12.5px] text-slate-500">{journey.circuitLabel}</span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Estado actual
          </div>
          <div className="mt-0.5 text-[15px] font-semibold text-slate-800">
            {journey.sectorLabel}{' '}
            <span className="font-mono text-[12px] font-normal text-slate-400">
              {journey.sectorCode}
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Tiempo en planta
          </div>
          <div className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
            {formatMinutes(journey.dwellPlantMin)}
          </div>
        </div>
        <div className="flex-1" />
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2">
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-red-600">
            Sin detección
          </div>
          <div className="font-mono text-lg font-semibold text-red-600">
            {formatMinutes(journey.minutesSinceLastDetection)}
          </div>
          <div className="text-[10.5px] text-slate-500">
            tope del tramo:{' '}
            {journey.segmentCapMin != null ? `${journey.segmentCapMin} min` : 'sin dato'}
          </div>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-600"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Recorrido
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {journey.timeline.length} detecciones · el tiempo de cada fila es el del tramo anterior
            </span>
          </div>
          <ul className="space-y-0">
            {journey.timeline.map((row, idx) => {
              const isLast = idx === journey.timeline.length - 1
              return (
                <li key={`${row.at}-${idx}`} className="flex gap-3">
                  <div className="w-12 shrink-0 pt-0.5 text-right font-mono text-[13px] font-semibold text-slate-700">
                    {formatClock(row.at)}
                  </div>
                  <div className="flex w-3 shrink-0 flex-col items-center">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                        isLast ? 'border-blue-600 bg-blue-600' : 'border-slate-400 bg-white'
                      }`}
                    />
                    {!isLast ? <span className="w-px flex-1 bg-slate-200" /> : null}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono text-[10.5px] text-slate-400">
                        {row.logicalSector ?? '—'}
                      </span>
                      <span
                        className={`text-[13.5px] font-semibold ${isLast ? 'text-blue-700' : 'text-slate-800'}`}
                      >
                        {row.label}
                        {isLast ? ' · última detección' : ''}
                      </span>
                      {row.legFromPreviousMin != null ? (
                        <span className="font-mono text-[11px] text-slate-400">
                          +{formatMinutes(row.legFromPreviousMin)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {row.edgeId ?? '—'}
                      {row.deviceCode ? ` · ${row.deviceCode}` : ''}
                    </div>
                  </div>
                </li>
              )
            })}
            {journey.nextExpectedPoint ? (
              <li className="flex gap-3">
                <div className="w-12 shrink-0 pt-0.5 text-right font-mono text-[13px] text-slate-400">
                  ?
                </div>
                <div className="flex w-3 shrink-0 flex-col items-center">
                  <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-dashed border-red-300 bg-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[10.5px] text-slate-400">
                      {journey.nextExpectedPoint}
                    </span>
                    <span className="text-[13.5px] font-semibold text-slate-500">
                      {journey.nextExpectedLabel ?? journey.nextExpectedPoint}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                    próximo punto según plantilla
                    {journey.circuit ? ` de ${journey.circuit}` : ''} · provisional
                  </div>
                </div>
              </li>
            ) : null}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            {journey.lastDevice ? (
              <button
                type="button"
                onClick={() => props.onOpenCamera?.(journey.lastDevice!)}
                className="rounded-md bg-blue-600 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-white"
              >
                Ver en vivo · {journey.lastDevice}
              </button>
            ) : (
              <span className="text-[12px] text-slate-400">sin cámara de última lectura</span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {journey.anomaly ? (
            <div className="rounded-[12px] border border-red-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-600">
                  Anomalía abierta
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {journey.anomaly.code} · desde {formatClock(journey.anomaly.since)}
                </span>
              </div>
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex gap-3">
                  <dt className="w-40 shrink-0 text-slate-500">Regla que disparó</dt>
                  <dd className="font-mono text-slate-800">{journey.anomaly.rule}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-40 shrink-0 text-slate-500">Tiempo sin detección</dt>
                  <dd className="font-mono text-red-600">
                    {formatMinutes(journey.anomaly.minutesSinceLastDetection)}
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="w-40 shrink-0 text-slate-500">Tope del tramo</dt>
                  <dd className="font-mono text-slate-700">
                    {journey.anomaly.segmentCapMin != null
                      ? `${journey.anomaly.segmentCapMin} min`
                      : 'sin dato'}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="rounded-[12px] border border-slate-200 bg-white p-3 text-[12.5px] text-slate-500">
              Sin anomalía abierta.
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-slate-400">{journey.note}</p>
        </div>
      </div>
    </div>
  )
}
