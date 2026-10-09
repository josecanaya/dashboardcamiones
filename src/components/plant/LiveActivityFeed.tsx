import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveCapture } from '../../services/live/plantStateApi'
import { getRecentCaptures } from '../../services/live/plantStateApi'
import { LiveCameraPlayerModal } from './LiveCameraPlayerModal'
import { openIdentificationCase } from './IdentificationPanel'
import { CapturePhoto } from './CapturePhoto'

type Site = 'ricardone' | 'san_lorenzo'
type Row = LiveCapture & { site: Site }

const POLL_MS = 5_000

const LEVEL: Record<LiveCapture['level'], { label: string; cls: string }> = {
  leida: { label: 'Leída', cls: 'bg-slate-100 text-slate-600' },
  confirmado: { label: 'Confirmada por operador', cls: 'bg-emerald-100 text-emerald-800' },
  casi_seguro: { label: 'Aplicada automáticamente', cls: 'bg-emerald-50 text-emerald-700' },
  provisorio: { label: 'Por confirmar', cls: 'bg-amber-100 text-amber-800' },
  pendiente: { label: 'Lectura ilegible', cls: 'bg-rose-100 text-rose-800' },
  rechazado: { label: 'Descartada', cls: 'bg-slate-100 text-slate-500' },
}

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/**
 * Actividad en vivo: cada captura de cámara a medida que llega, con la patente identificada.
 * Las que necesitan revisión se abren en la bandeja (EV-37): la comparación necesita espacio amplio.
 */
export function LiveActivityFeed({ sites, onOpenCase }: { sites: Site[]; onOpenCase?: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const seen = useRef<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const [camera, setCamera] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)

  // EV-33: la dependencia es el contenido de `sites`, no la identidad del arreglo (que cambia cada render).
  const sitesKey = sites.join(',')
  const load = useCallback(async () => {
    {
      // EV-34: una planta caída no bloquea a la otra.
      const settled = await Promise.allSettled(
        (sitesKey.split(',') as Site[]).map(async (site) => (await getRecentCaptures(site, 40)).captures.map((c) => ({ ...c, site })))
      )
      const failed = (sitesKey.split(',') as Site[]).filter((_, i) => settled[i].status === 'rejected')
      const lists = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (!lists.length) {
        setError(failed.length ? 'sin respuesta del servidor' : null)
        return
      }
      const merged = lists.flat().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40)
      const keyOf = (r: Row) => `${r.site}|${r.deviceCode}|${r.at}|${r.readPlate}`
      const first = seen.current.size === 0
      const nowFresh = new Set<string>()
      for (const r of merged) {
        const k = keyOf(r)
        if (!seen.current.has(k)) {
          if (!first) nowFresh.add(k)
          seen.current.add(k)
        }
      }
      // Registro acotado de capturas vistas.
      if (seen.current.size > 2000) seen.current = new Set(merged.map(keyOf))
      setFresh(nowFresh)
      setRows(merged)
      setError(failed.length ? `sin datos nuevos de ${failed.map((f) => (f === 'ricardone' ? 'Ricardone' : 'San Lorenzo')).join(', ')}` : null)
    }
  }, [sitesKey])

  useEffect(() => {
    seen.current = new Set()
    void load()
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const toReview = rows.filter((r) => r.level === 'provisorio' || r.level === 'pendiente').length
  const visibleRows = rows.filter(r => (!reviewOnly || r.level === 'provisorio' || r.level === 'pendiente') && `${r.readPlate} ${r.identifiedPlate ?? ''} ${r.nodeLabel} ${r.deviceCode}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <aside className="tf-activity-feed" aria-label="Actividad de cámaras en vivo">
      <div className="tf-map-context__head">
        <div>
          <span className="tf-map-context__eyebrow">Actividad de cámaras</span>
          <h2>Capturas en vivo</h2>
        </div>
        <span className="tf-map-context__live" title="Entre las últimas 40 capturas. La bandeja cuenta casos, que pueden agrupar varias capturas.">{toReview ? `${toReview} capturas por revisar (últimas 40)` : 'Últimas 40 capturas'}</span>
      </div>
      <div className="tf-capture-filters">
        <input aria-label="Buscar captura por patente o cámara" placeholder="Patente o cámara…" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="button" aria-pressed={reviewOnly} className={reviewOnly ? 'is-active' : ''} onClick={() => setReviewOnly(v => !v)}>Por revisar</button>
      </div>
      {error ? <p className="mt-3 text-xs text-rose-700">{rows.length ? 'Datos anteriores: ' : 'Sin conexión: '}{error}</p> : null}
      <ol className="tf-activity-feed__list">
        {rows.length === 0 && !error ? <li className="text-xs text-slate-400">Esperando capturas…</li> : null}
        {rows.length > 0 && visibleRows.length === 0 ? <li className="tf-empty-state">No hay capturas que coincidan. <button type="button" onClick={() => { setQuery(''); setReviewOnly(false) }}>Limpiar filtros</button></li> : null}
        {visibleRows.map((r) => {
          const k = `${r.site}|${r.deviceCode}|${r.at}|${r.readPlate}`
          const lv = LEVEL[r.level]
          const review = r.level === 'provisorio' || r.level === 'pendiente'
          const deduced = r.identifiedPlate
          const corrected = deduced && deduced !== r.readPlate
          return (
            <li key={k} className={fresh.has(k) ? 'tf-activity-feed__item is-new' : 'tf-activity-feed__item'}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[11px] tabular-nums text-slate-500" title={r.cameraTime ? `Hora en la cámara (DSS): ${r.cameraTime}` : undefined}>
                  {hora(r.at)}
                </span>
                <span className="truncate text-[11px] text-slate-500" title={r.deviceCode}>
                  {r.nodeLabel}
                  {sites.length > 1 ? ` · ${r.site === 'ricardone' ? 'Ric' : 'SL'}` : ''}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                {review ? <span className="text-[10px] uppercase tracking-wide text-slate-400">Leyó</span> : null}
                <span className={`font-mono text-[14px] font-semibold ${corrected && !review ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {r.readPlate}
                </span>
                {corrected && !review ? <span className="font-mono text-[14px] font-semibold text-emerald-800">→ {deduced}</span> : null}
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${lv.cls}`}>{lv.label}</span>
              </div>
                <div className="tf-capture-actions">
                  {review && r.fragmentKey && onOpenCase ? (
                    <button type="button" className="tf-activity-feed__btn" onClick={() => { openIdentificationCase(r.site, r.fragmentKey!); onOpenCase() }}>
                      Abrir caso
                    </button>
                  ) : null}
                  <button type="button" className="tf-activity-feed__btn" onClick={() => setCamera(r.deviceCode)}>Ver cámara</button>
                </div>
              <div className="tf-capture-photo"><CapturePhoto deviceCode={r.deviceCode} at={r.at} readPlate={r.readPlate} /></div>
            </li>
          )
        })}
      </ol>
      <LiveCameraPlayerModal open={camera != null} devices={camera ? [camera] : null} title={camera ? `Cámara ${camera}` : undefined} onClose={() => setCamera(null)} />
    </aside>
  )
}
