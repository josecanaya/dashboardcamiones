import { useEffect, useState } from 'react'
import { getSectorTrucks, type TruckRow } from '../../services/live/plantStateApi'
import { TruckJourneyPanel } from './TruckJourneyPanel'

function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return 'sin dato'
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h <= 0) return `${m}′`
  return `${h}h ${String(m).padStart(2, '0')}′`
}

const STATUS_TEXT: Record<TruckRow['status'], { label: string; className: string }> = {
  normal: { label: 'Normal', className: 'text-slate-600' },
  attention: { label: 'Sobre habitual', className: 'text-amber-700' },
  critical: { label: 'Muy sobre habitual', className: 'text-red-700' },
}

export function TrucksTable(props: {
  site?: string
  sectorCode: string
  selectedPlate?: string | null
  onSelectPlate?: (plate: string | null) => void
  onOpenCamera?: (deviceCode: string) => void
}) {
  const site = props.site ?? 'ricardone'
  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const selected = props.selectedPlate ?? null

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    getSectorTrucks(site, props.sectorCode, 'dwell')
      .then((list) => {
        if (!cancelled) {
          setTrucks(list.trucks)
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
  }, [site, props.sectorCode])

  return (
    <div className="overflow-hidden rounded-[12px] border border-slate-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <span className="text-[13.5px] font-semibold text-slate-800">
          Camiones presentes · {loading ? '…' : trucks.length}
        </span>
        <span className="font-mono text-[11px] text-slate-400">ordenados por tiempo en el sector</span>
      </div>

      {error ? (
        <p className="px-4 py-4 text-sm text-red-600">{error}</p>
      ) : loading ? (
        <p className="px-4 py-4 text-sm text-slate-400">Cargando camiones…</p>
      ) : trucks.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-400">sin camiones abiertos en este sector</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                <th className="px-3 pb-2 pt-2">Patente</th>
                <th className="px-3 pb-2 pt-2">Circuito</th>
                <th className="px-3 pb-2 pt-2">En el sector</th>
                <th className="px-3 pb-2 pt-2">En planta</th>
                <th className="px-3 pb-2 pt-2">Próximo punto</th>
                <th className="px-3 pb-2 pt-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((t) => {
                const st = STATUS_TEXT[t.status]
                const dwellClass =
                  t.status === 'critical'
                    ? 'text-red-700'
                    : t.status === 'attention'
                      ? 'text-amber-700'
                      : 'text-slate-700'
                return (
                  <tr
                    key={t.plate}
                    className={`cursor-pointer border-b border-slate-50 hover:bg-slate-50 ${
                      selected === t.plate ? 'bg-sky-50' : ''
                    }`}
                    onClick={() => props.onSelectPlate?.(selected === t.plate ? null : t.plate)}
                  >
                    <td className="px-3 py-2 font-mono text-[12.5px] font-semibold text-slate-900">
                      {t.plate}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                      {t.circuit ?? 'sin dato'}
                      {t.provisional && t.circuit ? (
                        <span className="ml-1 text-[10px] text-slate-400">prov.</span>
                      ) : null}
                    </td>
                    <td className={`px-3 py-2 font-mono text-[12.5px] ${dwellClass}`}>
                      {formatMinutes(t.dwellSectorMin)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12.5px] text-slate-600">
                      {formatMinutes(t.dwellPlantMin)}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12.5px] text-slate-500">
                      {t.nextExpectedLabel ?? t.nextExpectedPoint ?? 'sin dato'}
                    </td>
                    <td className={`px-3 py-2 text-[12.5px] ${st.className}`}>{st.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-slate-50 px-4 py-2 text-[11.5px] text-slate-400">
        Cualquier fila abre el journey completo del camión, con su evidencia y la cámara de su última
        lectura.
      </p>

      {selected ? (
        <div className="border-t border-slate-100 p-3">
          <TruckJourneyPanel
            site={site}
            plate={selected}
            onClose={() => props.onSelectPlate?.(null)}
            onOpenCamera={props.onOpenCamera}
          />
        </div>
      ) : null}
    </div>
  )
}
