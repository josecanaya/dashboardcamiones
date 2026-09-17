import { useMemo, useState } from 'react'
import type { PlantBasePlan, PlantPoint, PlantPointTone, PlantPointType } from '../../data/plantZones.types'

/**
 * Editor de puntos sobre el plano real: clickear la imagen ubica el punto, en
 * vez de describir coordenadas por chat. Pensado para configurar rápido, no
 * para el uso diario — por eso las etiquetas de cada punto se ven siempre
 * (a diferencia de `PlantMap`, donde solo aparecen al pasar el cursor).
 *
 * Guarda solo `points`: el resto del layout (zonas, caminos, notas) no se
 * toca. Si algún día hace falta dibujar zonas o el recorrido de circuitos
 * acá también, es una extensión de este mismo componente, no otro archivo.
 */

const TONES: PlantPointTone[] = ['acceso', 'calada', 'balanza', 'celda16', 'volcable', 'playa3', 'silos']
const TONE_COLOR: Record<PlantPointTone, string> = {
  acceso: '#38BDF8',
  calada: '#22C55E',
  balanza: '#F97316',
  celda16: '#EAB308',
  volcable: '#2563EB',
  playa3: '#1E3A8A',
  silos: '#7C3AED',
}
const TYPES: PlantPointType[] = ['camera', 'camera-group', 'control-point', 'operation']
const TYPE_LABEL: Record<PlantPointType, string> = {
  camera: 'Cámara',
  'camera-group': 'Frente con varias cámaras',
  'control-point': 'Punto de control',
  operation: 'Carga o descarga',
}

function emptyPoint(xPercent: number, yPercent: number): PlantPoint {
  return {
    id: '',
    label: '',
    sectorCode: '',
    type: 'camera',
    tone: 'acceso',
    xPercent,
    yPercent,
    cameraGroup: { label: '', devices: [] },
  }
}

export function PlantLayoutEditor({
  site,
  basePlan,
  initialPoints,
  onSave,
}: {
  site: string
  basePlan: PlantBasePlan
  initialPoints: PlantPoint[]
  /** PUT al server; lanza si falla. */
  onSave: (points: PlantPoint[]) => Promise<void>
}) {
  const [points, setPoints] = useState<PlantPoint[]>(initialPoints)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<PlantPoint | null>(null)
  const [repositioning, setRepositioning] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  const editing = draft ?? points.find((p) => p.id === selectedId) ?? null
  const isNew = draft != null

  const idClash = useMemo(() => {
    if (!editing || !editing.id.trim()) return false
    return points.some((p) => p.id === editing.id && (isNew || p.id !== selectedId))
  }, [editing, points, isNew, selectedId])

  const markDirty = () => {
    setDirty(true)
    setSaveState('idle')
  }

  const updateEditing = (patch: Partial<PlantPoint>) => {
    if (draft) setDraft({ ...draft, ...patch })
    else if (selectedId) setPoints((prev) => prev.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)))
  }

  const onImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xPercent = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10
    const yPercent = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10

    if (repositioning && selectedId) {
      setPoints((prev) => prev.map((p) => (p.id === selectedId ? { ...p, xPercent, yPercent } : p)))
      setRepositioning(false)
      markDirty()
      return
    }
    setDraft(emptyPoint(xPercent, yPercent))
    setSelectedId(null)
  }

  const commitDraft = () => {
    if (!draft || !draft.id.trim() || !draft.label.trim() || idClash) return
    setPoints((prev) => [...prev, draft])
    setSelectedId(draft.id)
    setDraft(null)
    markDirty()
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setPoints((prev) => prev.filter((p) => p.id !== selectedId))
    setSelectedId(null)
    markDirty()
  }

  const cancelEdit = () => {
    setDraft(null)
    setRepositioning(false)
  }

  const save = async () => {
    setSaveState('busy')
    try {
      await onSave(points)
      setSaveState('done')
      setDirty(false)
    } catch (e) {
      setSaveState('error')
      setSaveError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Plano: clic en vacío = punto nuevo; clic en un punto = seleccionarlo */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-slate-500">
            {repositioning
              ? 'Hacé clic en la nueva posición del punto seleccionado.'
              : 'Hacé clic en cualquier lugar vacío del plano para agregar un punto. Hacé clic en un punto existente para editarlo.'}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saveState === 'busy'}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition disabled:opacity-50 ${
              saveState === 'done'
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700'
            }`}
          >
            {saveState === 'busy' ? 'Guardando…' : saveState === 'done' ? '✓ Guardado' : `💾 Guardar plano${dirty ? ' *' : ''}`}
          </button>
        </div>
        {saveState === 'error' ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">No se pudo guardar: {saveError}</p>
        ) : null}

        <div
          onClick={onImageClick}
          className={`relative mx-auto w-full max-w-[900px] select-none rounded-[14px] border border-slate-200 bg-white ${
            repositioning ? 'cursor-crosshair ring-2 ring-sky-400' : 'cursor-crosshair'
          }`}
          style={{ aspectRatio: `${basePlan.width} / ${basePlan.height}` }}
        >
          <img
            src={`/plant/${site}/${basePlan.image}`}
            alt={`Plano de ${site}`}
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none"
          />
          {points.map((p) => {
            const isSelected = selectedId === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (repositioning) return // el clic en el plano define la nueva posición
                  setDraft(null)
                  setSelectedId(p.id)
                }}
                className="absolute flex flex-col items-center"
                style={{
                  left: `${p.xPercent}%`,
                  top: `${p.yPercent}%`,
                  transform: 'translate(-50%, -50%)',
                  opacity: repositioning && isSelected ? 0.35 : 1,
                }}
              >
                <span
                  className="block h-4 w-4 rounded-full border-2 border-white shadow"
                  style={{ background: TONE_COLOR[p.tone], outline: isSelected ? '2px solid #0EA5E9' : undefined }}
                />
                <span className="mt-0.5 whitespace-nowrap rounded bg-white/90 px-1 text-[9.5px] font-semibold text-slate-700 shadow-sm">
                  {p.id}
                </span>
              </button>
            )
          })}
          {draft ? (
            <span
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-sky-500 bg-sky-200"
              style={{ left: `${draft.xPercent}%`, top: `${draft.yPercent}%` }}
            />
          ) : null}
        </div>

        {/* Tabla: para editar sin tener que ubicar el punto en la imagen a ojo */}
        <div className="overflow-x-auto rounded-[14px] border border-slate-200 bg-white">
          <table className="w-full min-w-[480px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10.5px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2">Id</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Familia</th>
                <th className="px-3 py-2">X / Y %</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => {
                    setDraft(null)
                    setSelectedId(p.id)
                  }}
                  className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                    selectedId === p.id ? 'bg-sky-50' : ''
                  }`}
                >
                  <td className="px-3 py-1.5 font-mono">{p.id}</td>
                  <td className="px-3 py-1.5">{p.label}</td>
                  <td className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: TONE_COLOR[p.tone] }} />
                      {p.tone}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500">
                    {p.xPercent.toFixed(1)} / {p.yPercent.toFixed(1)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPoints((prev) => prev.filter((x) => x.id !== p.id))
                        if (selectedId === p.id) setSelectedId(null)
                        markDirty()
                      }}
                      className="rounded px-1.5 py-0.5 text-rose-600 hover:bg-rose-50"
                      aria-label={`Eliminar ${p.id}`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {points.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                    Todavía no hay puntos. Hacé clic en el plano para agregar el primero.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario del punto seleccionado o en creación */}
      <div className="h-fit rounded-[14px] border border-slate-200 bg-white p-4">
        {!editing ? (
          <p className="text-[12px] text-slate-400">
            Elegí un punto de la tabla o hacé clic en el plano para editar uno.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {isNew ? 'Punto nuevo' : 'Editar punto'}
            </p>

            <label className="block text-[11.5px] font-medium text-slate-600">
              Id (código, como aparece en las secuencias)
              <input
                value={editing.id}
                onChange={(e) => isNew && updateEditing({ id: e.target.value.trim() })}
                readOnly={!isNew}
                placeholder="ej: S12, RIC-EGRESO"
                title={!isNew ? 'El id no se puede cambiar una vez creado el punto.' : undefined}
                className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 font-mono text-[13px] ${
                  idClash ? 'border-rose-400' : 'border-slate-200'
                } ${!isNew ? 'bg-slate-50 text-slate-500' : ''}`}
              />
              {idClash ? <span className="text-[11px] text-rose-600">Ya existe un punto con ese id.</span> : null}
            </label>

            <label className="block text-[11.5px] font-medium text-slate-600">
              Nombre
              <input
                value={editing.label}
                onChange={(e) => updateEditing({ label: e.target.value })}
                placeholder="ej: Ingreso"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]"
              />
            </label>

            <label className="block text-[11.5px] font-medium text-slate-600">
              sectorCode (abre el panel de sector en vivo)
              <input
                value={editing.sectorCode}
                onChange={(e) => updateEditing({ sectorCode: e.target.value })}
                placeholder="ej: RICARDONE_INGRESO_CAMIONES"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[12px]"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block text-[11.5px] font-medium text-slate-600">
                Familia (color)
                <select
                  value={editing.tone}
                  onChange={(e) => updateEditing({ tone: e.target.value as PlantPointTone })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11.5px] font-medium text-slate-600">
                Tipo
                <select
                  value={editing.type}
                  onChange={(e) => updateEditing({ type: e.target.value as PlantPointType })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px]"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[11.5px] font-medium text-slate-600">
              Cámaras del grupo (una por línea, deviceCode del catálogo)
              <textarea
                value={editing.cameraGroup.devices.join('\n')}
                onChange={(e) =>
                  updateEditing({
                    cameraGroup: {
                      label: editing.cameraGroup.label || editing.label,
                      devices: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
                rows={3}
                placeholder={'RicCal01\nRicCal02'}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-[12px]"
              />
            </label>

            <p className="font-mono text-[11px] text-slate-400">
              x {editing.xPercent.toFixed(1)}% · y {editing.yPercent.toFixed(1)}%
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {isNew ? (
                <>
                  <button
                    type="button"
                    onClick={commitDraft}
                    disabled={!editing.id.trim() || !editing.label.trim() || idClash}
                    className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Agregar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setRepositioning(true)}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-[12px] font-semibold text-sky-700"
                  >
                    📍 Reposicionar
                  </button>
                  <button
                    type="button"
                    onClick={deleteSelected}
                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700"
                  >
                    Eliminar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
