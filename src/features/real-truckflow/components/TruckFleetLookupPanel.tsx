import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TRUCK_PLATE_REGISTRY_CATEGORY_LABELS,
  normalizeRegistryPlate,
} from '../../../domain/truckPlateRegistry'
import type { FleetPlateLookupResult } from '../../../domain/truckFleet'
import { isValidArgentinaPlate } from '../../../services/argentinaPlate'
import { lookupFleetByPlate, updateCamionProfile } from '../api/truckFleetApi'

type Props = {
  initialPlate?: string
  onPlateChange?: (plate: string) => void
  disabled?: boolean
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export function TruckFleetLookupPanel({ initialPlate = '', onPlateChange, disabled }: Props) {
  const [query, setQuery] = useState(initialPlate)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FleetPlateLookupResult | null>(null)
  const [transportista, setTransportista] = useState('')
  const [marca, setMarca] = useState('')
  const [color, setColor] = useState('')
  const [notas, setNotas] = useState('')

  const normalized = useMemo(() => normalizeRegistryPlate(query), [query])
  const plateValid = query.trim().length > 0 && isValidArgentinaPlate(query)

  const load = useCallback(async (plateRaw: string) => {
    const p = normalizeRegistryPlate(plateRaw)
    if (!p) {
      setError('Ingresá una patente válida.')
      setResult(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await lookupFleetByPlate(p)
      setResult(res)
      setTransportista(res.camion?.transportista ?? '')
      setMarca(res.camion?.marca ?? '')
      setColor(res.camion?.color ?? '')
      setNotas(res.camion?.notas ?? '')
    } catch (e) {
      setResult(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialPlate.trim()) {
      setQuery(initialPlate)
      void load(initialPlate)
    }
  }, [initialPlate, load])

  const handleSearch = () => {
    onPlateChange?.(normalized)
    void load(query)
  }

  const handleSaveFicha = async () => {
    if (!normalized) return
    setSaving(true)
    setError(null)
    try {
      await updateCamionProfile(normalized, {
        transportista: transportista.trim() || undefined,
        marca: marca.trim() || undefined,
        color: color.trim() || undefined,
        notas: notas.trim() || undefined,
      })
      await load(normalized)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Visitas registradas al procesar Truckflow / Movimientos por contrato. Podés completar marca, color y
        transportista de la unidad.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <label htmlFor="fleet-lookup-plate" className="block text-xs font-semibold uppercase text-slate-500">
            Patente
          </label>
          <input
            id="fleet-lookup-plate"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSearch()
              }
            }}
            placeholder="AB 123 CD"
            disabled={disabled || loading}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-lg tracking-wide"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={disabled || loading || !plateValid}
          className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Buscando…' : 'Buscar visitas'}
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {result ?
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-mono text-2xl font-bold text-slate-900">{result.plate}</span>
              <span className="text-xs text-slate-500">
                {result.summary.totalVisitas} visita{result.summary.totalVisitas === 1 ? '' : 's'}
                {result.storage ? ` · ${result.storage}` : ''}
              </span>
            </div>
            {result.registryEntry ?
              <p className="mt-2 text-xs text-amber-900">
                En catálogo ETL:{' '}
                <strong>
                  {TRUCK_PLATE_REGISTRY_CATEGORY_LABELS[
                    result.registryEntry.category as keyof typeof TRUCK_PLATE_REGISTRY_CATEGORY_LABELS
                  ] ?? result.registryEntry.category}
                </strong>
                {result.registryEntry.label ? ` · ${result.registryEntry.label}` : ''}
              </p>
            : null}
            {result.summary.productosDistintos.length ?
              <p className="mt-2 text-sm text-slate-700">
                Productos:{' '}
                <span className="font-medium">{result.summary.productosDistintos.join(', ')}</span>
              </p>
            : (
              <p className="mt-2 text-sm text-slate-500">Sin producto en visitas (solo Truckflow o sin merge).</p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Primera: {formatDt(result.summary.primeraVisitaAt)} · Última:{' '}
              {formatDt(result.summary.ultimaVisitaAt)}
            </p>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3">
            <h4 className="text-xs font-bold uppercase tracking-wide text-indigo-900">Ficha del camión</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs">
                <span className="font-semibold text-slate-600">Transportista / dueño</span>
                <input
                  type="text"
                  value={transportista}
                  onChange={(e) => setTransportista(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-xs">
                <span className="font-semibold text-slate-600">Marca</span>
                <input
                  type="text"
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-xs">
                <span className="font-semibold text-slate-600">Color</span>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="font-semibold text-slate-600">Notas</span>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  disabled={saving}
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void handleSaveFicha()}
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar ficha'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">Visitas a planta</h4>
            {result.visitas.length === 0 ?
              <p className="mt-2 text-sm text-slate-500">
                Sin visitas guardadas. Procesá un Transform con eventos Truckflow (y opcionalmente Excel) para
                sincronizar.
              </p>
            : (
              <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5 font-semibold">Ingreso</th>
                      <th className="px-2 py-1.5 font-semibold">Planta</th>
                      <th className="px-2 py-1.5 font-semibold">Producto</th>
                      <th className="px-2 py-1.5 font-semibold">Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.visitas.map((v) => (
                      <tr key={v.id} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 whitespace-nowrap">{formatDt(v.ingresoAt)}</td>
                        <td className="px-2 py-1.5">{v.planta}</td>
                        <td className="px-2 py-1.5">{v.producto ?? '—'}</td>
                        <td className="px-2 py-1.5 text-slate-500">{v.fuente}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      : null}
    </div>
  )
}
