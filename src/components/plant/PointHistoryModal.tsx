import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PlantPoint } from '../../data/plantZones.types'
import type { ExpectedTruck, LiveCapture } from '../../services/live/plantStateApi'
import { getRecentCaptures } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'
import { ExpectedTrucksSummary } from './ExpectedTrucksSummary'
import type { CameraActivityLabels } from '../../features/real-truckflow/tabs/CaladaCamerasPanel'
import type { History } from './PointHistoryLastWeek'
import './pointHistory.css'

// Los últimos 7 días componen corridas guardadas con el código del ETL: se baja solo al abrir esa pestaña.
const LastWeek = lazy(() => import('./PointHistoryLastWeek').then(m => ({ default: m.LastWeek })))

type Site = 'ricardone' | 'san_lorenzo'

const L = (entitySingular: string, entityPlural: string, trucksMetric: string, activityMetric: string, tableName: string, extra: Partial<CameraActivityLabels> = {}): CameraActivityLabels => ({
  entitySingular, entityPlural, columnHeader: entitySingular[0].toUpperCase() + entitySingular.slice(1), trucksMetric, activityMetric, exportName: tableName, tableName, ...extra,
})

/** Qué tabla del análisis (corridas guardadas) corresponde a cada punto del plano; mismos textos que Descargas/Calada. */
function historyFor(site: Site, pointId: string): History | null {
  if (site === 'ricardone') {
    if (pointId === 'S2') return { table: 'calada_camera_events', labels: L('cámara de calada', 'cámaras de calada', 'Camiones en calada', 'Cámaras con actividad', 'calada_camera_events', { hourlyTrucksExcludeCameras: ['RicCalLiq'] }) }
    if (pointId === 'S2-LIQ') return { table: 'calada_ricardone_liquid_events', labels: L('cámara de calada líquida', 'cámaras de calada líquida', 'Camiones en calada líquida', 'Cámaras con actividad', 'calada_ricardone_liquid_events') }
    if (pointId.startsWith('S9')) return { table: 'ricardone_volcable_events', labels: L('volcable Ric', 'volcables Ric', 'Camiones en volcables', 'Volcables con actividad', 'ricardone_volcable_events') }
    if (pointId.startsWith('S7') || pointId === 'S8') return { table: 'ricardone_silo_events', labels: L('línea de silo', 'líneas de silo', 'Camiones en silos', 'Líneas con actividad', 'ricardone_silo_events') }
    if (pointId === 'S5') return { table: 'ricardone_celda16_events', labels: L('boca de Celda 16', 'bocas de Celda 16', 'Camiones en Celda 16', 'Bocas con actividad', 'ricardone_celda16_events') }
    return null
  }
  if (pointId === 'S2') return { table: 'calada_sl_camera_events', labels: L('cámara de calada SL', 'cámaras de calada SL', 'Camiones en calada SL', 'Cámaras con actividad', 'calada_sl_camera_events') }
  if (pointId === 'S4') return { table: 'san_lorenzo_volcable_events', labels: L('calle del volcable SL', 'calles del volcable SL', 'Camiones en volcable SL', 'Calles con actividad', 'san_lorenzo_volcable_events', { splitExcelVsCamera: true } as Partial<CameraActivityLabels>) }
  if (pointId === 'S10') return { table: 'san_lorenzo_aceite_pto_events', labels: L('punto de aceite', 'puntos de aceite', 'Camiones en aceite (puerto)', 'Puntos con actividad', 'san_lorenzo_aceite_pto_events') }
  if (pointId === 'S6') return { table: 'san_lorenzo_aceite_osl_events', labels: L('punto de aceite OSL', 'puntos de aceite OSL', 'Camiones en aceite OSL', 'Puntos con actividad', 'san_lorenzo_aceite_osl_events') }
  return null
}

/** Puntos de llegada: Ingreso y Preingreso de Ricardone, Ingreso de San Lorenzo. Muestran los esperados del día. */
const isEntryPoint = (site: Site, pointId: string) => (site === 'ricardone' ? pointId === 'S0' || pointId === 'S1' : pointId === 'S0')

const TZ = 'America/Argentina/Buenos_Aires'
export const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ })
const hourOf = (iso: string) => Number(new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2))
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * Un clic en un punto del plano: cámaras, actividad de hoy (en vivo) y los últimos 7 días con los
 * gráficos de siempre (por calle/cámara), compuestos desde las corridas guardadas sin tocar el resto
 * del dashboard.
 */
export function PointHistoryModal({ site, point, onClose, onOpenCameras, onOpenTrip }: { site: Site; point: PlantPoint; onClose: () => void; onOpenCameras: () => void; onOpenTrip?: (truck: ExpectedTruck) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = dialog.current
    el?.showModal()
    return () => { el?.close(); opener?.focus?.() }
  }, [])
  const history = historyFor(site, point.id)
  const expected = isEntryPoint(site, point.id)
  const [tab, setTab] = useState<'esperados' | 'hoy' | 'semana'>(expected ? 'esperados' : 'hoy')
  return createPortal(
    <dialog ref={dialog} className="ph-dialog" aria-labelledby="ph-title" onCancel={e => { e.preventDefault(); onClose() }}>
      <header className="ph-header">
        <div>
          <span>{site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'} · {point.id}</span>
          <h2 id="ph-title">{point.label}</h2>
        </div>
        <div className="ph-header__actions">
          {point.cameraGroup.devices.length ? <button type="button" className="ph-live" onClick={onOpenCameras}>▶ Cámaras en vivo ({point.cameraGroup.devices.length})</button> : null}
          <button type="button" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
      </header>
      <div className="ph-tabs" role="tablist">
        {expected ? <button type="button" role="tab" aria-selected={tab === 'esperados'} onClick={() => setTab('esperados')}>Esperados hoy</button> : null}
        <button type="button" role="tab" aria-selected={tab === 'hoy'} onClick={() => setTab('hoy')}>Hoy (en vivo)</button>
        <button type="button" role="tab" aria-selected={tab === 'semana'} onClick={() => setTab('semana')}>Últimos 7 días</button>
      </div>
      <div className="ph-body">
        {tab === 'esperados' ? <ExpectedTrucksSummary onOpenTrip={onOpenTrip} /> : tab === 'hoy' ? <Today site={site} devices={point.cameraGroup.devices} /> : <Suspense fallback={<p className="ph-empty">Cargando…</p>}><LastWeek history={history} /></Suspense>}
      </div>
    </dialog>,
    document.body,
  )
}

/** Capturas de hoy en las cámaras del punto: total, por hora y las últimas con foto. */
function Today({ site, devices }: { site: Site; devices: string[] }) {
  const [captures, setCaptures] = useState<LiveCapture[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    const load = () => getRecentCaptures(site, 200).then(r => { if (alive) { setCaptures(r.captures); setError('') } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    void load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [site])
  const today = dayOf(Date.now())
  const mine = useMemo(() => (captures ?? []).filter(c => devices.includes(c.deviceCode) && dayOf(Date.parse(c.at)) === today), [captures, devices, today])
  const plates = new Set(mine.map(c => c.identifiedPlate ?? c.readPlate))
  const byHour = Array.from({ length: 24 }, (_, h) => mine.filter(c => hourOf(c.at) === h).length)
  const max = Math.max(1, ...byHour)
  const nowH = hourOf(new Date().toISOString())
  if (error) return <p className="ph-empty">No se pudieron leer las capturas: {error}</p>
  if (!captures) return <p className="ph-empty">Cargando capturas…</p>
  return (
    <div className="ph-today">
      <dl className="ph-kpis">
        <div><dt>Capturas recientes de hoy</dt><dd>{mine.length}</dd></div>
        <div><dt>Patentes distintas en la muestra</dt><dd>{plates.size}</dd></div>
        <div><dt>Última</dt><dd>{mine[0] ? hhmm(mine[0].at) : '—'}</dd></div>
      </dl>
      <div className="ph-hours" aria-label="Capturas por hora">
        {byHour.map((n, h) => <div key={h} className={h === nowH ? 'is-now' : ''} title={`${h}:00 · ${n} capturas`}>
          <i style={{ height: `${(n / max) * 100}%` }} className={n === max && n > 0 ? 'is-max' : ''} />
          <span>{h % 3 === 0 ? h : ''}</span>
        </div>)}
      </div>
      <p className="ph-note">Ventana en vivo del servidor (últimas ~200 capturas de la planta): para el día completo y la comparación usá «Últimos 7 días».</p>
      <h3>Últimas capturas</h3>
      <ul className="ph-caps">
        {mine.slice(0, 12).map(c => <li key={`${c.deviceCode}-${c.at}`}>
          <time>{hhmm(c.at)}</time>
          <strong>{c.identifiedPlate ?? c.readPlate}</strong>
          <span>{c.deviceCode}</span>
          <CapturePhoto deviceCode={c.deviceCode} at={c.at} readPlate={c.readPlate} buttonClassName="ph-photo-btn" />
        </li>)}
        {!mine.length ? <li className="ph-empty">Sin capturas hoy en estas cámaras dentro de la ventana en vivo.</li> : null}
      </ul>
    </div>
  )
}
