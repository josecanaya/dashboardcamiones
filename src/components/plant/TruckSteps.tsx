import { useEffect, useState } from 'react'
import type { TruckJourney } from '../../services/live/plantStateApi'
import { getTruckJourney } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

/**
 * Últimos pasos de un camión en planta, con la foto de cada lectura (DSS): para comprobar qué
 * vehículo es antes de sacarlo o moverlo (ej. una chata que pasó por preingreso y quedó en la playa).
 */
export function TruckSteps({ site, plate }: { site: string; plate: string }) {
  const [journey, setJourney] = useState<TruckJourney | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setJourney(null)
    setError(null)
    getTruckJourney(site, plate)
      .then((j) => {
        if (alive) setJourney(j)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [site, plate])

  if (error) return <p className="mt-1 text-[11px] text-rose-700">No se pudo leer el recorrido: {error}</p>
  if (!journey) return <p className="mt-1 text-[11px] text-slate-500">Cargando recorrido…</p>

  const steps = [...(journey.timeline ?? [])].reverse().slice(0, 8)
  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-[11px]">
      <div className="mb-1 text-slate-600">
        {journey.circuit ? `Circuito provisorio ${journey.circuit}` : 'Sin circuito'}
        {journey.nextExpectedLabel ? ` · próximo esperado: ${journey.nextExpectedLabel}` : ''}
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={`${s.deviceCode}-${s.at}`}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono tabular-nums text-slate-600">{hhmm(s.at)}</span>
              <span className="font-semibold text-slate-800">{s.label}</span>
              <span className="text-slate-500">{s.deviceCode}</span>
            </div>
            {s.deviceCode ? (
              <CapturePhoto deviceCode={s.deviceCode} at={s.at} readPlate={plate} buttonClassName="mt-0.5 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]" />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
