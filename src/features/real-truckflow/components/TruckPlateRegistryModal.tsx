import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TRUCK_PLATE_REGISTRY_CATEGORY_LABELS,
  normalizeRegistryPlate,
  type TruckPlateRegistryCategory,
  type TruckPlateRegistryEntry,
} from '../../../domain/truckPlateRegistry'
import { isValidArgentinaPlate } from '../../../services/argentinaPlate'
import {
  createTruckPlateRegistryEntry,
  deleteTruckPlateRegistryEntry,
  getTruckPlateRegistry,
} from '../api/truckPlateRegistryApi'
import { getTruckflowHealth } from '../api/truckflowLocalServerApi'

const CATEGORY_OPTIONS: TruckPlateRegistryCategory[] = [
  'vicentin_asociado',
  'prestador_servicio',
  'vehiculo_particular',
]

type Props = {
  open: boolean
  onClose: () => void
}

export function TruckPlateRegistryModal({ open, onClose }: Props) {
  const [plate, setPlate] = useState('')
  const [category, setCategory] = useState<TruckPlateRegistryCategory>('prestador_servicio')
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [entries, setEntries] = useState<TruckPlateRegistryEntry[]>([])
  const [storage, setStorage] = useState<string | null>(null)
  const [serverOk, setServerOk] = useState<boolean | null>(null)

  const normalizedPreview = useMemo(() => normalizeRegistryPlate(plate), [plate])
  const plateValid = plate.trim().length > 0 && isValidArgentinaPlate(plate)

  const loadEntries = useCallback(async () => {
    setLoadingList(true)
    setError(null)
    try {
      const [health, doc] = await Promise.all([
        getTruckflowHealth().catch(() => null),
        getTruckPlateRegistry(),
      ])
      setServerOk(Boolean(health?.ok))
      setStorage(
        health && 'plateRegistryStorage' in health ?
          String((health as { plateRegistryStorage?: string }).plateRegistryStorage ?? '')
        : null
      )
      const active = (doc.entries ?? []).filter((e) => e.active)
      active.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      setEntries(active)
    } catch (e) {
      setServerOk(false)
      setError(
        e instanceof Error ?
          `${e.message} — ¿Está corriendo npm run server:truckflow?`
        : 'No se pudo conectar al servidor local'
      )
      setEntries([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setSuccess(null)
    setError(null)
    void loadEntries()
  }, [open, loadEntries])

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    setError(null)
    setSuccess(null)
    if (!plateValid) {
      setError('Ingresá una patente argentina válida (ej. ABC123 o AB123CD).')
      return
    }
    setBusy(true)
    try {
      const res = await createTruckPlateRegistryEntry({
        plate: normalizedPreview,
        category,
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        createdBy: 'dashboard',
      })
      setSuccess(`Patente ${res.entry.plate} registrada (${TRUCK_PLATE_REGISTRY_CATEGORY_LABELS[res.entry.category]}).`)
      setPlate('')
      setLabel('')
      setNotes('')
      await loadEntries()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleDeactivate = async (entry: TruckPlateRegistryEntry) => {
    if (!window.confirm(`¿Quitar ${entry.plate} del catálogo de exclusión?`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteTruckPlateRegistryEntry(entry.id)
      setSuccess(`Patente ${entry.plate} desactivada.`)
      await loadEntries()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-900/45" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plate-registry-title"
        className="fixed left-1/2 top-1/2 z-[61] flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 id="plate-registry-title" className="text-lg font-bold text-slate-900">
              Catálogo de patentes
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Excluye servicios, asociados y particulares del ETL para no contarlos como anomalías.
            </p>
            {serverOk === false ? (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
                Servidor local no disponible. Ejecutá{' '}
                <code className="rounded bg-white px-1">npm run server:truckflow</code>
              </p>
            ) : storage ? (
              <p className="mt-2 text-xs text-slate-500">
                Almacenamiento: <span className="font-semibold text-indigo-700">{storage}</span>
                {storage === 'supabase' ? ' (Supabase)' : ' (JSON local)'}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 border-b border-slate-100 px-5 py-4">
          <div>
            <label htmlFor="plate-registry-plate" className="block text-xs font-semibold uppercase text-slate-500">
              Patente
            </label>
            <input
              id="plate-registry-plate"
              type="text"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AB 123 CD"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-lg tracking-wide text-slate-900 outline-none ring-indigo-500 focus:border-indigo-400 focus:ring-2"
              autoComplete="off"
              disabled={busy}
            />
            {plate.trim() ? (
              <p className={`mt-1 text-xs ${plateValid ? 'text-emerald-700' : 'text-amber-700'}`}>
                Normalizada: <span className="font-mono font-semibold">{normalizedPreview || '—'}</span>
                {!plateValid ? ' · formato inválido' : null}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="plate-registry-category" className="block text-xs font-semibold uppercase text-slate-500">
              Tipo de vehículo
            </label>
            <select
              id="plate-registry-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as TruckPlateRegistryCategory)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500"
              disabled={busy}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {TRUCK_PLATE_REGISTRY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="plate-registry-label" className="block text-xs font-semibold uppercase text-slate-500">
              Referencia (opcional)
            </label>
            <input
              id="plate-registry-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Empresa, tarea, chofer…"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="plate-registry-notes" className="block text-xs font-semibold uppercase text-slate-500">
              Notas (opcional)
            </label>
            <textarea
              id="plate-registry-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Motivo de exclusión…"
              className="mt-1 w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm"
              disabled={busy}
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={busy}
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={busy || !plateValid || serverOk === false}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Guardando…' : 'Registrar en catálogo'}
            </button>
          </div>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Activas en catálogo</h3>
            <button
              type="button"
              onClick={() => void loadEntries()}
              disabled={loadingList || busy}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Actualizar
            </button>
          </div>
          {loadingList ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500">No hay patentes cargadas todavía.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-bold text-slate-900">{e.plate}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">
                      {TRUCK_PLATE_REGISTRY_CATEGORY_LABELS[e.category]}
                      {e.label ? ` · ${e.label}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeactivate(e)}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
