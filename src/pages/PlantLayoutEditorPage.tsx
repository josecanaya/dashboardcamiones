import { useEffect, useRef, useState } from 'react'
import { PlantLayoutEditor } from '../components/plant/PlantLayoutEditor'
import type { PlantBasePlan, PlantCircuitComposition, PlantPoint, PlantTramo, PlantZoneShape } from '../data/plantZones.types'

/**
 * Herramienta de configuración: ubicar los puntos del plano clickeando la
 * imagen real, en vez de describir coordenadas por chat. No es parte del
 * flujo diario — pensada para quien administra el tablero.
 *
 * Sitios: hoy solo Ricardone tiene plano cargado. San Lorenzo se habilita
 * solo subiendo su vista cenital (mismo botón que usó Ricardone la primera
 * vez) — el resto del editor es igual para cualquier sitio.
 */
const SITES: { id: string; label: string }[] = [
  { id: 'ricardone', label: 'Ricardone' },
  { id: 'san_lorenzo', label: 'San Lorenzo' },
]

type LoadState =
  | { phase: 'loading' }
  | { phase: 'missing' }
  | { phase: 'ready'; basePlan: PlantBasePlan; points: PlantPoint[]; zones: PlantZoneShape[]; tramos: PlantTramo[]; circuitCompositions: PlantCircuitComposition[] }
  | { phase: 'error'; message: string }

export function PlantLayoutEditorPage() {
  const [site, setSite] = useState(SITES[0]!.id)
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setState({ phase: 'loading' })
    fetch(`/api/truckflow/plant-layout/${site}`)
      .then(async (r) => {
        if (r.status === 404) return setState({ phase: 'missing' })
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
        setState({
          phase: 'ready',
          basePlan: data.layout.basePlan,
          points: data.layout.points ?? [],
          zones: data.layout.zones ?? [],
          tramos: data.layout.tramos ?? [],
          circuitCompositions: data.layout.circuitCompositions ?? [],
        })
      })
      .catch((e) => setState({ phase: 'error', message: e instanceof Error ? e.message : String(e) }))
  }
  useEffect(load, [site])

  const save = async (points: PlantPoint[], zones: PlantZoneShape[], tramos: PlantTramo[], circuitCompositions: PlantCircuitComposition[]) => {
    const r = await fetch(`/api/truckflow/plant-layout/${site}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points, zones, tramos, circuitCompositions }),
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
  }

  const onChooseFile = (file: File) => {
    setUploadError('')
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = async () => {
      const { naturalWidth, naturalHeight } = img
      URL.revokeObjectURL(url)
      setUploadBusy(true)
      try {
        const r = await fetch(
          `/api/truckflow/plant-layout/${site}/image?width=${naturalWidth}&height=${naturalHeight}`,
          { method: 'POST', headers: { 'Content-Type': file.type }, body: file }
        )
        const data = await r.json()
        if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`)
        load()
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e))
      } finally {
        setUploadBusy(false)
      }
    }
    img.onerror = () => setUploadError('El archivo no se pudo leer como imagen.')
    img.src = url
  }

  return (
    <section className="space-y-4 pb-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Configuración por capas</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500">
          Dibujá sectores, ubicá cámaras y corregí los tramos de cada circuito sobre la imagen. Se guarda en{' '}
          <code className="font-mono text-[11.5px]">public/plant/{site}/plantZones.json</code>.
        </p>
        <div className="mt-3 flex gap-2">
          {SITES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSite(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition ${
                site === s.id
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {state.phase === 'loading' ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : state.phase === 'error' ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">{state.message}</p>
      ) : state.phase === 'missing' ? (
        <div className="rounded-[14px] border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-[13px] font-semibold text-slate-700">
            {SITES.find((s) => s.id === site)?.label} todavía no tiene plano cargado.
          </p>
          <p className="mt-1 text-[12px] text-slate-500">
            Subí la vista cenital (PNG o JPG) — después se dibujan sectores y cámaras encima.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy}
            className="mt-4 rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
          >
            {uploadBusy ? 'Subiendo…' : 'Subir imagen'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onChooseFile(f)
              e.target.value = ''
            }}
          />
          {uploadError ? <p className="mt-3 text-[12px] text-rose-600">{uploadError}</p> : null}
        </div>
      ) : (
        <PlantLayoutEditor
          key={site}
          site={site}
          basePlan={state.basePlan}
          initialPoints={state.points}
          initialZones={state.zones}
          initialTramos={state.tramos}
          initialCircuitCompositions={state.circuitCompositions}
          onSave={save}
        />
      )}
    </section>
  )
}
