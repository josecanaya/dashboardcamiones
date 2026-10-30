import { useEffect, useState } from 'react'
import type { AlgorithmLayer, AlgorithmLayerKey, LiveCapture } from '../../services/live/plantStateApi'
import { cameraCaptureImageUrl, findCameraCapture, getRecentCaptures } from '../../services/live/plantStateApi'

const POLL_MS = 5_000
const SHOWN = 4

/** Cómo quedó asignada la captura: color de la ficha y texto corto. */
const LEVEL: Record<LiveCapture['level'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'off' }> = {
  leida: { label: 'leída', tone: 'ok' },
  confirmado: { label: 'confirmada', tone: 'ok' },
  casi_seguro: { label: 'automática', tone: 'ok' },
  provisorio: { label: 'por confirmar', tone: 'warn' },
  pendiente: { label: 'sin asignar', tone: 'bad' },
  rechazado: { label: 'descartada', tone: 'off' },
  fuera_sistema: { label: 'fuera del sistema', tone: 'off' },
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.floor(s / 60)} min` : `hace ${Math.floor(s / 3600)} h`
}

/**
 * Semáforo de una capa: trabajando (decidió en la última hora), quieta (decidió hoy pero no en la última
 * hora) o sin casos en 24 h. «Sin resolver» y «Operaciones» no se pintan: no son capas automáticas.
 */
function layerHealth(l: AlgorithmLayer, now: number) {
  if (l.key === 'sin_resolver' || l.key === 'operador') return 'neutral'
  if (!l.lastAt) return 'off'
  return now - Date.parse(l.lastAt) < 3600_000 ? 'ok' : 'idle'
}

/** Patente del camión al que quedó asignada la captura (la leída si es válida y propia). */
function truckOf(c: LiveCapture) {
  return c.identifiedPlate ?? (c.level === 'leida' ? c.readPlate : null)
}

/**
 * Captura que pasó por el algoritmo: la llevó a otra patente, o quedó por confirmar o sin asignar.
 * Las leídas bien (incluida la patente válida que la balanza o la carta confirman) no son corrección.
 */
function isCorrected(c: LiveCapture) {
  if (c.level === 'provisorio' || c.level === 'pendiente') return true
  return Boolean(c.identifiedPlate && c.identifiedPlate !== c.readPlate)
}

/** Foto de la captura (DSS), pedida una vez por captura. */
function CapturePhoto({ c }: { c: LiveCapture }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    findCameraCapture(c.deviceCode, c.at, c.readPlate || undefined)
      .then((r) => { if (alive) setSrc(r.capture?.sceneFile ? cameraCaptureImageUrl(r.capture.sceneFile) : r.capture?.plateFile ? cameraCaptureImageUrl(r.capture.plateFile) : null) })
      .catch(() => { if (alive) setSrc(null) })
    return () => { alive = false }
  }, [c.deviceCode, c.at, c.readPlate])
  if (src === undefined) return <div className="lm-rail__wait">Buscando foto…</div>
  if (src === null) return <div className="lm-rail__wait">Sin foto en el DSS</div>
  return <img src={src} alt={`Captura ${c.readPlate || 'sin patente'} en ${c.nodeLabel}`} />
}

/**
 * Margen izquierdo del monitoreo: cada captura de cámara apenas llega, con su foto, la hora y el camión
 * al que se asignó (las últimas cuatro, la más nueva arriba). Por defecto solo las que pasaron por el
 * algoritmo, para evaluarlo. Clic en una ficha: seguir a ese camión en el plano.
 */
export function CaptureRail({ site, onSelectTruck }: { site: string; onSelectTruck?: (plate: string) => void }) {
  const [all, setAll] = useState<LiveCapture[]>([])
  const [layers, setLayers] = useState<AlgorithmLayer[]>([])
  const [view, setView] = useState<'corregidas' | 'todas' | AlgorithmLayerKey>('corregidas')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    setAll([])
    setLayers([])
    // Las corregidas son pocas entre las leídas bien: se piden muchas para encontrar cuatro.
    const load = () =>
      getRecentCaptures(site, 200)
        .then((r) => {
          if (!alive) return
          const caps = [...r.captures].sort((a, b) => b.at.localeCompare(a.at))
          setAll(caps)
          // La hora de un caso es la de su primera lectura; la última captura de la capa puede ser más nueva.
          setLayers((r.layers ?? []).map((l) => {
            const last = caps.find((c) => c.layer === l.key)?.at
            return last && (!l.lastAt || last > l.lastAt) ? { ...l, lastAt: last } : l
          }))
        })
        .catch(() => undefined)
    load()
    const t = setInterval(load, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [site])
  const captures = (view === 'corregidas' ? all.filter(isCorrected) : view === 'todas' ? all : all.filter((c) => c.layer === view)).slice(0, SHOWN)
  const layerLabel = new Map(layers.map((l) => [l.key, l.label]))

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <aside className="lm-rail" aria-label="Últimas capturas de cámara">
      <div className="lm-rail__tabs" role="group" aria-label="Qué capturas mostrar">
        <button type="button" aria-pressed={view === 'corregidas'} onClick={() => setView('corregidas')}>Corregidas</button>
        <button type="button" aria-pressed={view === 'todas'} onClick={() => setView('todas')}>Todas</button>
      </div>
      {layers.length ? (
        <div className="lm-rail__layers" role="group" aria-label="Capas del algoritmo, últimas 24 h">
          {layers.map((l) => (
            <button key={l.key} type="button" aria-pressed={view === l.key} className={`is-${layerHealth(l, now)}`} onClick={() => setView(view === l.key ? 'corregidas' : l.key)}
              title={`${l.label}: ${l.decided} en 24 h${l.proposed ? ` · ${l.proposed} propuestas por confirmar` : ''}${l.rejectedByOps ? ` · ${l.rejectedByOps} rechazadas por operaciones` : ''}. Clic: ver sus capturas`}>
              <span>{l.label}</span>
              <b>{l.decided}</b>
              <small>{l.lastAt ? ago(l.lastAt, now) : 'sin casos'}{l.rejectedByOps ? ` · ✗${l.rejectedByOps}` : ''}</small>
            </button>
          ))}
        </div>
      ) : null}
      <ol>
        {captures.map((c, i) => {
          const truck = truckOf(c)
          const lv = LEVEL[c.level]
          return (
            <li key={`${c.deviceCode}-${c.at}`} className={i === 0 ? 'is-new' : undefined}>
              <button type="button" disabled={!truck || !onSelectTruck} onClick={() => truck && onSelectTruck?.(truck)} title={truck ? `Seguir a ${truck}` : undefined}>
                <CapturePhoto c={c} />
                <span className="lm-rail__clock">🕒 {clock(c.at)} · {ago(c.at, now)}</span>
                <span className="lm-rail__node">{c.nodeLabel}{c.layer ? <i> · {layerLabel.get(c.layer) ?? c.layer}{c.rule ? ` (${c.rule.replace(/_/g, ' ')})` : ''}</i> : null}</span>
                <span className={`lm-rail__truck is-${lv.tone}`}>
                  {truck ? <b>{truck}</b> : <b>—</b>}
                  {truck && c.readPlate && c.readPlate !== truck ? <small>leyó {c.readPlate}</small> : !truck ? <small>leyó {c.readPlate || 'sin patente'}</small> : null}
                  <em>{lv.label}</em>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {!captures.length ? <p className="lm-rail__wait">{view === 'todas' || !all.length ? 'Esperando capturas…' : view === 'corregidas' ? 'Sin correcciones en las últimas capturas' : `Sin capturas de ${layerLabel.get(view) ?? view} en las últimas ${all.length}`}</p> : null}
    </aside>
  )
}
