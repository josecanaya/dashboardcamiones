import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useEtlWorkbenchOptional } from '../etlWorkbench/EtlWorkbenchContext'
import { useExecutiveProductBreakdown } from '../etlWorkbench/useExecutiveProductBreakdown'
import { useAnomalyReview } from '../etlWorkbench/useAnomalyReview'
import {
  parseLogicalSequence,
  type AnomalySequenceBreakdownRow,
  type CircuitClassificationEntry,
} from '../etlWorkbench/etlCircuitClassificationIndex'
import { normalizeRealEventPoint } from '../../../etl-core/domain/eventNormalization'
import {
  getEventOperationalInstantIso,
  getEventOperationalInstantMs,
} from '../../../services/realEventOperationalTime'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { ReconstructedRealSiteId } from '../../../etl-core/domain/journeyEvents.types'
import { postTruckflowLoadLocalPeriod } from '../api/truckflowLocalServerApi'
import { journeyDtoListFromRawExtractedRowsChunked } from '../../../services/realTruckflowApi'

/**
 * Seguridad · Anomalías: láminas de comité para revisar cada anomalía. Usa la MISMA revisión que el
 * panel de anomalías de Transform ({@link useAnomalyReview}): recorridos anómalos agrupados por
 * secuencia observada, con sus camiones (patente + primer/último evento) y el motivo principal.
 * Las imágenes de cámara se cargan manualmente (persisten por navegador); DSS queda para más
 * adelante. El recorrido muestra la secuencia detectada; los tiempos por cámara se sumarán cuando
 * se exponga el timeline crudo del journey.
 */

function fmtDate(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2}:\d{2})?/)
  if (!m) return '—'
  return m[4] ? `${m[3]}/${m[2]}/${m[1]!.slice(2)} · ${m[4]}` : `${m[3]}/${m[2]}/${m[1]!.slice(2)}`
}

/** Parte una secuencia («A → B → C» o con otros separadores) en etapas legibles. */
function parseStages(seq: string): string[] {
  const s = String(seq ?? '').trim()
  if (!s || /sin_secuencia|sin secuencia/i.test(s)) return []
  return s
    .split(/\s*(?:→|->|>|›|»|\||,|;)\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/** Paleta por planta: Ricardone = azul, San Lorenzo = naranja. */
type SiteStyle = {
  name: string
  dot: string
  card: string
  badge: string
  time: string
  /** Borde de la tarjeta de cámara. */
  border: string
  /** Chip de hora (sólido) sobre la tarjeta de cámara. */
  chip: string
}
const SITE_STYLE: Record<'ricardone' | 'san_lorenzo' | 'other', SiteStyle> = {
  ricardone: {
    name: 'Ricardone',
    dot: 'bg-blue-600',
    card: 'border-blue-300 bg-blue-50',
    badge: 'bg-blue-600 text-white',
    time: 'text-blue-900',
    border: 'border-blue-500',
    chip: 'bg-blue-600 text-white',
  },
  san_lorenzo: {
    name: 'San Lorenzo',
    dot: 'bg-orange-500',
    card: 'border-orange-300 bg-orange-50',
    badge: 'bg-orange-500 text-white',
    time: 'text-orange-900',
    border: 'border-orange-500',
    chip: 'bg-orange-500 text-white',
  },
  other: {
    name: 'Otro',
    dot: 'bg-slate-400',
    card: 'border-slate-300 bg-slate-50',
    badge: 'bg-slate-500 text-white',
    time: 'text-slate-700',
    border: 'border-slate-500',
    chip: 'bg-slate-600 text-white',
  },
}
function siteBucket(siteId: ReconstructedRealSiteId | string): 'ricardone' | 'san_lorenzo' | 'other' {
  return siteId === 'ricardone' ? 'ricardone' : siteId === 'san_lorenzo' ? 'san_lorenzo' : 'other'
}

type TimelineNode = {
  key: string
  site: 'ricardone' | 'san_lorenzo' | 'other'
  label: string
  logicalCode: string
  /** ISO del instante operativo (createdAt-first), o '' en el fallback sin eventos. */
  iso: string
  ms: number
}

/** HH:MM:SS del instante operativo. */
function fmtClock(iso: string): string {
  const m = String(iso ?? '').match(/[T ](\d{2}:\d{2}:\d{2})/)
  if (m) return m[1]!
  const m2 = String(iso ?? '').match(/[T ](\d{2}:\d{2})/)
  return m2 ? m2[1]! : '—'
}
/** DD/MM del instante operativo. */
function fmtDay(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : ''
}
/** Elapsed legible entre dos nodos (min → "Xh Ym" / "Zm"). */
function fmtElapsed(fromMs: number, toMs: number): string {
  const min = Math.round((toMs - fromMs) / 60000)
  if (!Number.isFinite(min) || min < 0) return ''
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/**
 * Sector corto de la cámara a partir del código lógico del punto (INGRESO, EGRESO, CALADA…).
 * Es la etiqueta que se muestra debajo de la hora: RicIngFrente → «Ingreso», RicEgrFte → «Egreso»,
 * RicCal0x → «Calada», balanzas → «Balanza ingreso/egreso», San Lorenzo → sin el prefijo SL_.
 */
function humanizeSector(logicalCode: string): string {
  const c = String(logicalCode ?? '').trim().toUpperCase()
  if (!c || c === 'UNKNOWN') return '—'
  const base = c.startsWith('SL_') ? c.slice(3) : c
  const words = base.replace(/_/g, ' ').toLowerCase().trim()
  return words.replace(/^\w/, (m) => m.toUpperCase())
}

/** Humaniza un código lógico para el fallback sin eventos crudos. */
function prettyLogical(code: string): { label: string; site: 'ricardone' | 'san_lorenzo' | 'other' } {
  const c = String(code ?? '').trim().toUpperCase()
  const isSl = c.startsWith('SL_')
  const base = isSl ? c.slice(3) : c
  const label = base
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (m) => m.toUpperCase())
  return { label: isSl ? `SL ${label}` : label, site: isSl ? 'san_lorenzo' : 'ricardone' }
}

/**
 * Timeline por camión: eventos crudos de esa patente dentro de la ventana [firstEventAt, lastEventAt]
 * del recorrido (los límites del journey se calculan con el mismo instante operativo createdAt-first,
 * ver {@link getEventOperationalInstantMs}). Cada evento se mapea a su punto semántico con
 * {@link normalizeRealEventPoint}; se descartan las cámaras traseras excluidas. Si no hay eventos
 * cargados, cae al `detectedSequence` del recorrido (nodos + planta, sin horario).
 */
function buildTruckTimeline(events: RealJourneyEventDto[], truck: CircuitClassificationEntry): {
  nodes: TimelineNode[]
  hasTimes: boolean
} {
  const plate = truck.normalizedPlate
  const firstMs = Date.parse(truck.firstEventAt)
  const lastMs = Date.parse(truck.lastEventAt)
  const tol = 1000
  if (plate && events.length) {
    const nodes: TimelineNode[] = []
    for (const e of events) {
      if (e.normalizedPlate !== plate) continue
      const ms = getEventOperationalInstantMs(e)
      if (!Number.isFinite(ms)) continue
      if (Number.isFinite(firstMs) && ms < firstMs - tol) continue
      if (Number.isFinite(lastMs) && ms > lastMs + tol) continue
      const p = normalizeRealEventPoint(e)
      if (/EXCLUIDA|TRASERA/.test(p.logicalCode)) continue
      nodes.push({
        key: `${e.id}`,
        site: siteBucket(p.siteId),
        label: p.pointLabel,
        logicalCode: p.logicalCode,
        iso: getEventOperationalInstantIso(e),
        ms,
      })
    }
    nodes.sort((a, b) => a.ms - b.ms)
    if (nodes.length) return { nodes, hasTimes: true }
  }
  // Fallback: sin eventos crudos, mostramos la secuencia detectada (nodos + planta, sin horario).
  const seq = parseLogicalSequence(truck.detectedSequence)
  const nodes: TimelineNode[] = seq.map((code, i) => {
    const pl = prettyLogical(code)
    return { key: `seq-${i}`, site: pl.site, label: pl.label, logicalCode: code, iso: '', ms: Number.NaN }
  })
  return { nodes, hasTimes: false }
}

/** YYYY-MM-DD del ISO. */
function dayKey(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1]! : ''
}
/** Corre una fecha YYYY-MM-DD `delta` días (para cubrir el desfase createdAt↔occurredAt). */
function shiftDay(day: string, delta: number): string {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + delta)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Persistencia de las correcciones manuales del informe (por navegador). Guardamos SETS de ids
 * ocultos: cuadraditos (nodos) por camión y camiones (journeyId) que no son anomalía. Así el
 * usuario corrige una vez y el recorrido/lista queda «listo para presentar» al volver a abrir.
 */
function loadHiddenSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.map(String)) : new Set()
  } catch {
    return new Set()
  }
}
function saveHiddenSet(key: string, set: Set<string>): void {
  try {
    if (set.size) localStorage.setItem(key, JSON.stringify([...set]))
    else localStorage.removeItem(key)
  } catch {
    /* cuota/entorno sin storage: queda sólo en memoria */
  }
}
/** Clave de nodos ocultos de un camión (cuadraditos). */
const hiddenNodesKey = (journeyId: string) => `seg-hidden-nodes:${journeyId}`
/** Clave global de camiones ocultos (no-anomalía). */
const HIDDEN_TRUCKS_KEY = 'seg-hidden-trucks'

/**
 * Almacén de imágenes de cámara en IndexedDB (no en localStorage): las fotos son data URL grandes
 * y localStorage tiene ~5 MB por origen; al superarlo, `setItem` tira QuotaExceededError y la
 * imagen NO se guardaba (se perdía al recargar). IndexedDB soporta cientos de MB, así que las fotos
 * quedan guardadas de verdad entre sesiones.
 */
const IDB_NAME = 'truckflow-seguridad'
const IDB_STORE = 'camera-images'
let idbPromise: Promise<IDBDatabase> | null = null
function openImageDb(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return idbPromise
}
async function idbGetImage(key: string): Promise<string | null> {
  try {
    const db = await openImageDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(key)
      req.onsuccess = () => resolve((req.result as string) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}
async function idbSetImage(key: string, value: string): Promise<boolean> {
  try {
    const db = await openImageDb()
    return await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}
async function idbDeleteImage(key: string): Promise<void> {
  try {
    const db = await openImageDb()
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(key)
      tx.oncomplete = () => resolve(null)
      tx.onerror = () => resolve(null)
    })
  } catch {
    /* noop */
  }
}

/**
 * Vista de un solo camión: recorrido con horario por nodo y color por planta.
 * Los eventos crudos se traen SOLO para el rango de días del recorrido (mucho más liviano que
 * la ventana completa). Si `wbEvents` ya trae esa patente (carga fresca en memoria), se usan esos
 * sin pedir nada.
 */
function TruckJourneyView({
  truck,
  wbEvents,
  onBack,
}: {
  truck: CircuitClassificationEntry
  wbEvents: RealJourneyEventDto[]
  onBack: () => void
}) {
  const plateInWb = useMemo(
    () => wbEvents.some((e) => e.normalizedPlate === truck.normalizedPlate),
    [wbEvents, truck.normalizedPlate]
  )
  const [localEvents, setLocalEvents] = useState<RealJourneyEventDto[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  useEffect(() => {
    if (plateInWb) {
      setLocalEvents([])
      setLoadingEvents(false)
      return
    }
    let alive = true
    setLoadingEvents(true)
    setLocalEvents([])
    void (async () => {
      const first = dayKey(truck.firstEventAt)
      const last = dayKey(truck.lastEventAt) || first
      // -1 día en el arranque: createdAt (instante operativo) puede caer un día después de occurredAt.
      const startDate = first ? shiftDay(first, -1) : last
      const endDate = last || first
      try {
        const res = await postTruckflowLoadLocalPeriod({ startDate, endDate })
        const dto = await journeyDtoListFromRawExtractedRowsChunked(res.events as unknown[])
        if (alive) setLocalEvents(dto)
      } catch {
        if (alive) setLocalEvents([])
      } finally {
        if (alive) setLoadingEvents(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [truck.journeyId, truck.firstEventAt, truck.lastEventAt, plateInWb])

  const effectiveEvents = plateInWb ? wbEvents : localEvents
  const { nodes, hasTimes } = useMemo(
    () => buildTruckTimeline(effectiveEvents, truck),
    [effectiveEvents, truck]
  )
  const spansDays = useMemo(() => {
    const days = new Set(nodes.filter((n) => n.iso).map((n) => fmtDay(n.iso)))
    return days.size > 1
  }, [nodes])

  // ---- Edición del recorrido: ocultar cuadraditos (cámaras duplicadas o erróneas) ----
  const [editMode, setEditMode] = useState(false)
  const hKey = hiddenNodesKey(truck.journeyId)
  const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setHiddenNodes(loadHiddenSet(hKey))
  }, [hKey])
  const toggleNode = (key: string) => {
    setHiddenNodes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      saveHiddenSet(hKey, next)
      return next
    })
  }
  const restoreNodes = () => {
    setHiddenNodes(new Set())
    saveHiddenSet(hKey, new Set())
  }
  // Botón «Guardar»: reasegura el guardado (nodos ocultos + las imágenes ya se guardan solas en
  // IndexedDB al soltarlas) y muestra confirmación.
  const [savedFlash, setSavedFlash] = useState(false)
  const doSave = () => {
    saveHiddenSet(hKey, hiddenNodes)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1800)
  }
  const visibleNodes = useMemo(() => nodes.filter((n) => !hiddenNodes.has(n.key)), [nodes, hiddenNodes])
  const hiddenCount = nodes.length - visibleNodes.length
  /** Numeración + tiempo desde el paso anterior VISIBLE (se recalcula al ocultar cuadraditos). */
  const nodeMeta = useMemo(() => {
    const m = new Map<string, { elapsed: string; vIdx: number }>()
    let prev: TimelineNode | null = null
    let idx = 0
    for (const n of nodes) {
      if (hiddenNodes.has(n.key)) continue
      const elapsed =
        prev && hasTimes && Number.isFinite(prev.ms) && Number.isFinite(n.ms)
          ? fmtElapsed(prev.ms, n.ms)
          : ''
      m.set(n.key, { elapsed, vIdx: idx })
      prev = n
      idx += 1
    }
    return m
  }, [nodes, hiddenNodes, hasTimes])

  return (
    <section className="space-y-4">
      {/* Cabecera del camión */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Camiones
          </button>
          <div className="rounded-lg border-2 border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-base font-bold tracking-[0.1em] text-slate-50">
            {truck.plate || '—'}
          </div>
          {truck.executiveCircuitDisplay ? (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {truck.executiveCircuitDisplay}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <LegendDot site="ricardone" />
          <LegendDot site="san_lorenzo" />
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-600">
              Recorrido del camión
            </span>
            <span className="text-[11px] text-slate-400">
              {hasTimes ? `${visibleNodes.length} pasos · horario por nodo` : 'secuencia detectada'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hiddenCount > 0 && !editMode ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500">
                {hiddenCount} oculto{hiddenCount > 1 ? 's' : ''}
              </span>
            ) : null}
            {editMode && hiddenCount > 0 ? (
              <button
                type="button"
                onClick={restoreNodes}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Restaurar todo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                editMode
                  ? 'border-violet-600 bg-violet-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {editMode ? '✓ Listo' : '✎ Editar recorrido'}
            </button>
            <button
              type="button"
              onClick={doSave}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                savedFlash
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {savedFlash ? '✓ Guardado' : '💾 Guardar'}
            </button>
          </div>
        </div>

        {loadingEvents && !hasTimes ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.2-8.6" />
            </svg>
            Cargando eventos crudos para los horarios…
          </div>
        ) : nodes.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">Sin recorrido reconstruible para este camión.</p>
        ) : (
          <>
            {/* Recorrido en una sola grilla que hace WRAP (baja de línea si no entra en el ancho):
                pensado para captura de pantalla completa, sin scroll horizontal. Cada celda es un nodo
                autocontenido: cámara (con foto) → hora → sector debajo de la hora → tiempo desde el
                paso anterior. Color por planta (azul Ricardone / naranja San Lorenzo). */}
            <div className="flex flex-wrap gap-x-4 gap-y-6">
              {(editMode ? nodes : visibleNodes).map((n) => {
                const st = SITE_STYLE[n.site]
                const info = nodeMeta.get(n.key)
                const isHidden = hiddenNodes.has(n.key)
                const elapsed = info?.elapsed ?? ''
                const vIdx = info?.vIdx ?? -1
                return (
                  <div key={n.key} className="flex w-[190px] flex-col items-center">
                    {/* Franja superior: en edición, botón quitar/restaurar; si no, tiempo desde el
                        paso anterior visible (queda alineado al hacer wrap). */}
                    {editMode ? (
                      <div className="mb-1 flex h-5 items-center justify-center">
                        {isHidden ? (
                          <button
                            type="button"
                            onClick={() => toggleNode(n.key)}
                            className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            ↩ Restaurar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleNode(n.key)}
                            title="Quitar este paso del recorrido"
                            className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 transition hover:bg-rose-100"
                          >
                            ✕ Quitar
                          </button>
                        )}
                      </div>
                    ) : vIdx > 0 ? (
                      <div className="mb-1 flex h-5 items-center gap-1 text-[10px] font-semibold text-slate-500">
                        {elapsed ? (
                          <>
                            <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
                              <path d="M1 6h18" stroke="#cbd5e1" strokeWidth="1.6" strokeDasharray="3 3" />
                              <path d="M18 2l5 4-5 4" stroke="#cbd5e1" strokeWidth="1.6" fill="none" />
                            </svg>
                            <span className="whitespace-nowrap">{elapsed}</span>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mb-1 h-5" />
                    )}
                    {/* Contenido del nodo (se atenúa cuando está oculto en modo edición). */}
                    <div
                      className={`flex w-full flex-col items-center transition ${
                        isHidden ? 'opacity-35 grayscale' : ''
                      }`}
                    >
                      <CameraSlot
                        storageKey={`seg-cam:truck:${truck.journeyId}:${n.key}`}
                        label={n.label}
                        accent={st}
                        width={190}
                        height={124}
                        hideLabel
                      />
                      {/* Hora del paso por el nodo (pill grande por planta) */}
                      {hasTimes && n.iso ? (
                        <span
                          className={`mt-2 rounded-lg px-3 py-1.5 text-center font-mono text-lg font-bold tabular-nums shadow-sm ${st.badge}`}
                        >
                          {fmtClock(n.iso)}
                        </span>
                      ) : (
                        <span className={`mt-2 rounded-lg px-3 py-1.5 text-center text-sm font-bold ${st.badge}`}>
                          {vIdx >= 0 ? vIdx + 1 : '–'}
                        </span>
                      )}
                      {/* Sector de la cámara, DEBAJO de la hora (INGRESO, EGRESO, CALADA…) */}
                      <span className={`mt-1 text-center text-[12.5px] font-bold ${st.time}`} title={n.label}>
                        {humanizeSector(n.logicalCode)}
                      </span>
                      {hasTimes && n.iso && spansDays ? (
                        <span className="text-[11px] font-semibold text-slate-400">{fmtDay(n.iso)}</span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {!hasTimes && !loadingEvents ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800">
            Horarios por nodo no disponibles: no hay eventos crudos cargados para esta ventana. Se muestra la
            secuencia de cámaras detectada.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function LegendDot({ site }: { site: 'ricardone' | 'san_lorenzo' }) {
  const st = SITE_STYLE[site]
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${st.dot}`} />
      {st.name}
    </span>
  )
}

/**
 * Reglas de oro (R1–R6, ver `goldenAnomalyRules.ts`): código interno de `anomaly_kind_reason`
 * → etiqueta legible. Son las ÚNICAS que definen anomalía de comportamiento.
 */
const GOLDEN_RULES: { reason: string; code: string; title: string; desc: string }[] = [
  {
    reason: 'RIC_REINGRESO_RAPIDO_NO_PELLET',
    code: 'R1',
    title: 'Reingreso rápido a Ricardone',
    desc: 'Salió de Ricardone y volvió a entrar en ≤ 1 h (circuito no pellet).',
  },
  {
    reason: 'SL_LUEGO_RIC_MISMO_DIA_NO_PELLET',
    code: 'R2',
    title: 'San Lorenzo y luego Ricardone el mismo día',
    desc: 'Pasó por San Lorenzo y después por Ricardone en el mismo día (no pellet).',
  },
  {
    reason: 'RIC_SL_TRAMO_40M_6H',
    code: 'R3',
    title: 'Ricardone → San Lorenzo en 40 min – 6 h',
    desc: 'Egreso de Ricardone e ingreso a San Lorenzo con demora de entre 40 min y 6 h.',
  },
  {
    reason: 'RUTA_BALANZA_PLAYA_C16_BALANZA',
    code: 'R4',
    title: 'Balanza → Playa → Celda 16 → Balanza',
    desc: 'Ruta interna balanza ingreso → playa 3 → celda 16 → balanza.',
  },
  {
    reason: 'CARGA_LUEGO_DESCARGA',
    code: 'R5',
    title: 'Carga y luego descarga',
    desc: 'Pasó por un punto de carga y luego por una plataforma de descarga.',
  },
  {
    reason: 'RIC_SL_MAS30M_SIN_CALADA_SL',
    code: 'R6',
    title: 'Ricardone → San Lorenzo sin calado SL',
    desc: 'Egreso Ricardone → ingreso San Lorenzo > 30 min (≤ 2 h) sin pasar por calado en San Lorenzo.',
  },
]
const GOLDEN_BY_REASON = new Map(GOLDEN_RULES.map((r) => [r.reason, r]))

/** Grupo unificado de anomalías: por regla de oro o por secuencia observada. */
type SecurityGroup = {
  key: string
  kind: 'golden' | 'sequence'
  /** R1–R6 en modo regla de oro. */
  code?: string
  title: string
  subtitle: string
  count: number
  pct: number
  trucks: CircuitClassificationEntry[]
  /** Secuencia de referencia (solo modo secuencia): habilita la tira de cámaras del grupo. */
  referenceSequence?: string
}

/** Agrupa los camiones anómalos por regla de oro (`anomalyKindReason`), orden R1→R6 por volumen. */
function buildGoldenGroups(rows: AnomalySequenceBreakdownRow[]): SecurityGroup[] {
  const allTrucks = rows.flatMap((r) => r.trucks)
  const total = allTrucks.length || 1
  const byReason = new Map<string, CircuitClassificationEntry[]>()
  for (const t of allTrucks) {
    const reason = String(t.anomalyKindReason ?? '').trim()
    const key = GOLDEN_BY_REASON.has(reason) ? reason : 'OTRAS'
    const arr = byReason.get(key)
    if (arr) arr.push(t)
    else byReason.set(key, [t])
  }
  const groups: SecurityGroup[] = []
  for (const rule of GOLDEN_RULES) {
    const trucks = byReason.get(rule.reason)
    if (!trucks?.length) continue
    groups.push({
      key: `golden:${rule.reason}`,
      kind: 'golden',
      code: rule.code,
      title: rule.title,
      subtitle: rule.desc,
      count: trucks.length,
      pct: Math.round((trucks.length / total) * 100),
      trucks,
    })
  }
  const otras = byReason.get('OTRAS')
  if (otras?.length) {
    groups.push({
      key: 'golden:OTRAS',
      kind: 'golden',
      title: 'Otras anomalías de comportamiento',
      subtitle: 'Sin regla de oro específica asignada en esta corrida.',
      count: otras.length,
      pct: Math.round((otras.length / total) * 100),
      trucks: otras,
    })
  }
  return groups.sort((a, b) => b.count - a.count)
}

/** Grupos por secuencia observada (comportamiento agrupado por recorrido de cámaras). */
function buildSequenceGroups(rows: AnomalySequenceBreakdownRow[]): SecurityGroup[] {
  return rows.map((r) => ({
    key: `seq:${r.sequenceKey}`,
    kind: 'sequence',
    title: r.displaySequence,
    subtitle: r.topCommitteeReason || 'Comportamiento anómalo',
    count: r.count,
    pct: r.pctOfAnomalies,
    trucks: r.trucks,
    referenceSequence: r.displaySequence,
  }))
}

/** Slot de cámara con carga manual (persistida en localStorage por clave). */
function CameraSlot({
  storageKey,
  label,
  accent,
  width = 132,
  height = 84,
  hideLabel = false,
}: {
  storageKey: string
  label: string
  /** Estilo por planta (azul Ricardone / naranja San Lorenzo). */
  accent?: SiteStyle
  width?: number
  height?: number
  /** Oculta la etiqueta bajo la tarjeta (cuando el sector ya se muestra debajo de la hora). */
  hideLabel?: boolean
}) {
  const [img, setImg] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void (async () => {
      const fromIdb = await idbGetImage(storageKey)
      if (!alive) return
      if (fromIdb) {
        setImg(fromIdb)
        return
      }
      // Migración: si quedó una imagen vieja en localStorage, moverla a IndexedDB.
      let legacy: string | null = null
      try {
        legacy = localStorage.getItem(storageKey)
      } catch {
        legacy = null
      }
      if (legacy) {
        setImg(legacy)
        const ok = await idbSetImage(storageKey, legacy)
        if (ok) {
          try {
            localStorage.removeItem(storageKey)
          } catch {
            /* noop */
          }
        }
      } else {
        setImg(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [storageKey])

  const onPick = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!url) return
      setImg(url)
      void (async () => {
        const ok = await idbSetImage(storageKey, url)
        if (!ok) {
          // Fallback para imágenes chicas si IndexedDB no está disponible.
          try {
            localStorage.setItem(storageKey, url)
          } catch {
            /* cuota superada: queda en memoria */
          }
        }
      })()
    }
    reader.readAsDataURL(file)
  }
  const clear = () => {
    setImg(null)
    void idbDeleteImage(storageKey)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* noop */
    }
  }

  // Drag & drop: arrastrar una imagen desde el explorador de archivos y soltarla en el cuadrado.
  const [dragOver, setDragOver] = useState(false)
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) onPick(file)
  }

  return (
    <div className="flex-shrink-0" style={{ width }}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          if (!dragOver) setDragOver(true)
        }}
        onDragLeave={(e) => {
          // Sólo desactivar cuando el cursor sale de la tarjeta (no al entrar en un hijo).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
        }}
        onDrop={onDrop}
        className={`relative overflow-hidden rounded-xl border-2 bg-gradient-to-br from-slate-800 to-slate-900 transition ${
          dragOver
            ? 'border-violet-400 ring-2 ring-violet-300 ring-offset-1'
            : accent
              ? accent.border
              : 'border-slate-700'
        }`}
        style={{ height }}
      >
        {img ? (
          <img src={img} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.4">
              <path d="M3 13l2-7h11l3 4h2v4" />
              <circle cx="7.5" cy="17.5" r="2" />
              <circle cx="17" cy="17.5" r="2" />
            </svg>
            <span className="text-center text-[10px] font-semibold leading-tight text-slate-400">
              Arrastrá una imagen<br />o hacé clic
            </span>
          </div>
        )}
        {/* Overlay al arrastrar un archivo sobre el cuadrado. */}
        {dragOver ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-violet-600/70 text-white">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v10M7 10l5 5 5-5" />
              <path d="M5 19h14" />
            </svg>
            <span className="text-[11px] font-bold">Soltá para cargar</span>
          </div>
        ) : null}
        <label className="absolute inset-x-0 bottom-0 cursor-pointer bg-black/55 py-1.5 text-center text-[11px] font-semibold text-slate-100 opacity-0 transition hover:opacity-100">
          {img ? 'Cambiar' : 'Cargar imagen'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPick(f)
              e.target.value = ''
            }}
          />
        </label>
        {img ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-1.5 top-1.5 rounded bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white"
          >
            ✕
          </button>
        ) : (
          <span className="absolute right-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-200">
            DSS
          </span>
        )}
      </div>
      {hideLabel ? null : (
        <div
          className={`mt-1.5 truncate text-center text-[12px] font-semibold ${accent ? 'text-slate-700' : 'text-slate-600'}`}
          title={label}
        >
          {label}
        </div>
      )}
    </div>
  )
}

export function SeguridadTab() {
  const wb = useEtlWorkbenchOptional()
  const tr = wb?.transformResult
  const breakdown = useExecutiveProductBreakdown(tr)
  const review = useAnomalyReview(tr, breakdown.index.entries)

  const [viewMode, setViewMode] = useState<'golden' | 'sequence'>('golden')
  const goldenGroups = useMemo(() => buildGoldenGroups(review.sequenceRows), [review.sequenceRows])
  const sequenceGroups = useMemo(
    () => buildSequenceGroups([...review.sequenceRows].sort((a, b) => b.count - a.count)),
    [review.sequenceRows]
  )
  const groups = viewMode === 'golden' ? goldenGroups : sequenceGroups

  const [selKey, setSelKey] = useState<string | null>(null)
  const selected = useMemo(() => groups.find((g) => g.key === selKey) ?? null, [groups, selKey])

  const [selTruckId, setSelTruckId] = useState<string | null>(null)
  const selTruck = useMemo(
    () => selected?.trucks.find((t) => t.journeyId === selTruckId) ?? null,
    [selected, selTruckId]
  )

  // Eventos ya en memoria (carga fresca): sirven de atajo. Si no están, el detalle del camión
  // trae solo los días de ESE recorrido (ver TruckJourneyView), sin cargar la ventana entera.
  const events = wb?.events ?? []

  const period = useMemo(() => {
    const days = wb?.loadSummary?.daysDetected ?? []
    if (days.length) {
      const from = days[0]!
      const to = days[days.length - 1]!
      return from === to ? from : `${from} → ${to}`
    }
    if (wb?.composedRange) return `${wb.composedRange.from} → ${wb.composedRange.to}`
    return '—'
  }, [wb?.loadSummary?.daysDetected, wb?.composedRange])

  // ---- Edición de la lista: ocultar camiones que no son anomalía (persistido por navegador) ----
  const [editTrucks, setEditTrucks] = useState(false)
  const [hiddenTrucks, setHiddenTrucks] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    setHiddenTrucks(loadHiddenSet(HIDDEN_TRUCKS_KEY))
  }, [])
  const toggleTruck = (journeyId: string) => {
    setHiddenTrucks((prev) => {
      const next = new Set(prev)
      if (next.has(journeyId)) next.delete(journeyId)
      else next.add(journeyId)
      saveHiddenSet(HIDDEN_TRUCKS_KEY, next)
      return next
    })
  }
  const restoreTrucks = (ids: string[]) => {
    setHiddenTrucks((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      saveHiddenSet(HIDDEN_TRUCKS_KEY, next)
      return next
    })
  }
  const [savedTrucksFlash, setSavedTrucksFlash] = useState(false)
  const doSaveTrucks = () => {
    saveHiddenSet(HIDDEN_TRUCKS_KEY, hiddenTrucks)
    setSavedTrucksFlash(true)
    window.setTimeout(() => setSavedTrucksFlash(false), 1800)
  }

  if (!tr) {
    return (
      <section className="space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Seguridad · Anomalías</h2>
          <p className="mt-1 text-sm text-slate-600">Sin datos cargados.</p>
        </div>
      </section>
    )
  }

  // ---------- CAMIÓN (recorrido individual con horario por nodo) ----------
  if (selected && selTruck) {
    return <TruckJourneyView truck={selTruck} wbEvents={events} onBack={() => setSelTruckId(null)} />
  }

  // ---------- DETALLE ----------
  if (selected) {
    const stages = selected.referenceSequence ? parseStages(selected.referenceSequence) : []
    const visibleTrucks = selected.trucks.filter((t) => !hiddenTrucks.has(t.journeyId))
    const hiddenTruckIds = selected.trucks.filter((t) => hiddenTrucks.has(t.journeyId)).map((t) => t.journeyId)
    const hiddenTruckCount = hiddenTruckIds.length
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setSelTruckId(null)
                setSelKey(null)
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
              Anomalías
            </button>
            <div className="flex items-center gap-2">
              {selected.code ? (
                <span className="rounded-md bg-rose-600 px-2.5 py-1 text-sm font-bold text-white">
                  {selected.code}
                </span>
              ) : (
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
              )}
              <span className="text-base font-bold text-slate-900">
                {selected.kind === 'golden' ? selected.title : 'Recorrido anómalo'}
              </span>
              <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
                {selected.kind === 'golden' ? 'Regla de oro' : 'Anomalía'}
              </span>
            </div>
          </div>
          <span className="text-sm text-slate-600">
            <b className="text-slate-900">{visibleTrucks.length}</b> camiones
            {hiddenTruckCount > 0 ? <span className="text-slate-400"> ({hiddenTruckCount} ocultos)</span> : null} ·{' '}
            {selected.pct}% del total anómalo
          </span>
        </div>

        {/* Regla de oro: descripción; o (modo secuencia) recorrido de referencia con cámaras. */}
        {selected.kind === 'golden' ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="1.7" className="mt-0.5 flex-shrink-0">
              <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
              <path d="M12 9v4M12 16v.5" />
            </svg>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-400">
                Regla de oro incumplida {selected.code ? `· ${selected.code}` : ''}
              </div>
              <div className="text-sm font-semibold text-rose-900">{selected.subtitle}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-600">
                Recorrido de referencia
              </span>
              <span className="text-[11px] text-slate-400">imágenes desde DSS o carga manual</span>
            </div>
            {stages.length === 0 ? (
              <p className="text-sm text-slate-500">Sin secuencia detectada para este grupo.</p>
            ) : (
              <>
                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-min gap-2.5">
                    {stages.map((st, i) => (
                      <CameraSlot key={i} storageKey={`seg-cam:${selected.key}:${i}`} label={st} />
                    ))}
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto pb-1">
                  <div className="flex min-w-min items-start">
                    {stages.map((st, i) => (
                      <div key={i} className="flex items-center">
                        <div className="flex w-[132px] flex-col items-center">
                          <span className="rounded-md bg-[#1e3a8a] px-2.5 py-1 text-center text-xs font-bold text-white">
                            {i + 1}
                          </span>
                          <span className="mt-1.5 text-center text-[10.5px] leading-tight text-slate-600" title={st}>
                            {st}
                          </span>
                        </div>
                        {i < stages.length - 1 ? (
                          <svg width="26" height="14" viewBox="0 0 26 14" fill="none" className="mt-1.5">
                            <path d="M1 7h20" stroke="#cbd5e1" strokeWidth="1.6" strokeDasharray="3 3" />
                            <path d="M20 3l5 4-5 4" stroke="#cbd5e1" strokeWidth="1.6" fill="none" />
                          </svg>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Camiones con esta anomalía */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-slate-600">
            {selected.kind === 'golden' ? 'Camiones que incumplen la regla' : 'Camiones con esta anomalía'}
          </span>
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] text-slate-400">{visibleTrucks.length} patentes</span>
          {editTrucks && hiddenTruckCount > 0 ? (
            <button
              type="button"
              onClick={() => restoreTrucks(hiddenTruckIds)}
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Restaurar ocultos
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setEditTrucks((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
              editTrucks
                ? 'border-violet-600 bg-violet-600 text-white'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {editTrucks ? '✓ Listo' : '✎ Editar lista'}
          </button>
          <button
            type="button"
            onClick={doSaveTrucks}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
              savedTrucksFlash
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {savedTrucksFlash ? '✓ Guardado' : '💾 Guardar'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(editTrucks ? selected.trucks : visibleTrucks).map((t) => {
            const isHidden = hiddenTrucks.has(t.journeyId)
            return (
              <div key={t.journeyId} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    if (!editTrucks) setSelTruckId(t.journeyId)
                  }}
                  className={`group w-full rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                    editTrucks ? 'cursor-default' : 'hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md'
                  } ${isHidden ? 'opacity-35 grayscale' : ''}`}
                >
                  <div className="rounded-lg border-2 border-slate-700 bg-slate-900 px-1 py-2 font-mono text-sm font-bold tracking-[0.08em] text-slate-50">
                    {t.plate || '—'}
                  </div>
                  <div className="mt-3 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Inicio</div>
                  <div className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 px-1 py-1 text-[12px] font-semibold text-slate-900">
                    {fmtDate(t.firstEventAt)}
                  </div>
                  <div className="mt-2 text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Fin</div>
                  <div className="mt-0.5 rounded-md border border-slate-200 bg-slate-50 px-1 py-1 text-[12px] font-semibold text-slate-900">
                    {fmtDate(t.lastEventAt)}
                  </div>
                  {editTrucks ? null : (
                    <div className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 opacity-0 transition group-hover:opacity-100">
                      Ver recorrido
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </div>
                  )}
                </button>
                {editTrucks ? (
                  <button
                    type="button"
                    onClick={() => toggleTruck(t.journeyId)}
                    title={isHidden ? 'Restaurar camión' : 'Quitar camión (no es anomalía)'}
                    className={`absolute right-2 top-2 z-10 rounded-md px-2 py-0.5 text-[12px] font-bold shadow-sm transition ${
                      isHidden
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    {isHidden ? '↩' : '✕'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Motivo (solo modo secuencia; en regla de oro ya está la ficha de la regla arriba). */}
        {selected.kind === 'sequence' ? (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="1.8">
              <path d="M12 9v4M12 16v.5" />
              <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-rose-400">Motivo principal</div>
              <div className="text-sm font-semibold text-rose-900">{selected.subtitle || 'Comportamiento anómalo'}</div>
            </div>
          </div>
        ) : null}
      </section>
    )
  }

  // ---------- LISTA ----------
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Seguridad · Anomalías</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Patrones de comportamiento anómalo · clic para revisar cada anomalía
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
            <path d="M3 9h18" />
          </svg>
          {period}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Recorridos en anomalías" value={review.listedAnomalyCount} accent="text-rose-600" />
        <StatCard
          label={viewMode === 'golden' ? 'Reglas de oro incumplidas' : 'Patrones detectados'}
          value={groups.length}
          accent="text-slate-900"
        />
        <StatCard label="Incompletos (datos)" value={review.incompleteCount} accent="text-amber-600" />
      </div>

      {/* Selector de vista: reglas de oro (R1–R6) vs secuencia observada. */}
      <div className="flex items-center gap-3 pt-1">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => {
              setSelKey(null)
              setViewMode('golden')
            }}
            className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
              viewMode === 'golden' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Reglas de oro
          </button>
          <button
            type="button"
            onClick={() => {
              setSelKey(null)
              setViewMode('sequence')
            }}
            className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
              viewMode === 'sequence' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Por secuencia
          </button>
        </div>
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] text-slate-400">
          {viewMode === 'golden' ? 'agrupado por R1–R6' : 'agrupado por recorrido de cámaras'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 px-6 py-6 text-sm text-slate-600">
          {breakdown.ready
            ? 'No hay recorridos anómalos listables en esta corrida.'
            : 'Calculando la revisión de anomalías…'}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <AnomalyCard key={g.key} group={g} onOpen={() => setSelKey(g.key)} />
          ))}
        </div>
      )}
    </section>
  )
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
      <div className={`mt-1.5 text-3xl font-bold ${accent}`}>{value.toLocaleString('es-AR')}</div>
    </div>
  )
}

function AnomalyCard({ group, onOpen }: { group: SecurityGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {group.code ? (
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-600 text-sm font-bold text-white">
              {group.code}
            </span>
          ) : (
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
                <path d="M12 9v4M12 16v.5" />
              </svg>
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-slate-900" title={group.title}>
              {group.title}
            </div>
            <div className="truncate text-xs text-slate-500" title={group.subtitle}>
              {group.subtitle || 'Comportamiento anómalo'}
            </div>
          </div>
        </div>
        <span className="flex-shrink-0 rounded bg-rose-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-600">
          {group.pct}%
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5">
        <span className="text-[12.5px] text-slate-500">
          <b className="text-[15px] text-slate-900">{group.count}</b> camiones
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700">
          {group.kind === 'golden' ? 'Ver camiones' : 'Ver anomalía'}
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            className="transition-transform group-hover:translate-x-0.5"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </button>
  )
}
