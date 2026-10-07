import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { PlantPoint } from '../../data/plantZones.types'
import type { LiveCapture } from '../../services/live/plantStateApi'
import { getRecentCaptures } from '../../services/live/plantStateApi'
import { CapturePhoto } from './CapturePhoto'
import { CaladaCamerasPanel, type CameraActivityLabels } from '../../features/real-truckflow/tabs/CaladaCamerasPanel'
import { listWindows } from '../../features/real-truckflow/api/etlRunCacheApi'
import { composeRunsIntoTransformOutput, computeRangeCoverage, type RangeCoverage } from '../../features/real-truckflow/etlWorkbench/etlComposeRuns'
import { loadTransformOutputFromRun } from '../../features/real-truckflow/etlWorkbench/etlTransformOutputFromDisk'
import './pointHistory.css'

type Site = 'ricardone' | 'san_lorenzo'
type History = { table: string; labels: CameraActivityLabels }

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

const TZ = 'America/Argentina/Buenos_Aires'
const dayOf = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ })
const hourOf = (iso: string) => Number(new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2))
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

/**
 * Un clic en un punto del plano: cámaras, actividad de hoy (en vivo) y los últimos 7 días con los
 * gráficos de siempre (por calle/cámara), compuestos desde las corridas guardadas sin tocar el resto
 * del dashboard.
 */
export function PointHistoryModal({ site, point, onClose, onOpenCameras }: { site: Site; point: PlantPoint; onClose: () => void; onOpenCameras: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = dialog.current
    el?.showModal()
    return () => { el?.close(); opener?.focus?.() }
  }, [])
  const history = historyFor(site, point.id)
  const [tab, setTab] = useState<'hoy' | 'semana'>('hoy')
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
        <button type="button" role="tab" aria-selected={tab === 'hoy'} onClick={() => setTab('hoy')}>Hoy (en vivo)</button>
        <button type="button" role="tab" aria-selected={tab === 'semana'} onClick={() => setTab('semana')}>Últimos 7 días</button>
      </div>
      <div className="ph-body">
        {tab === 'hoy' ? <Today site={site} devices={point.cameraGroup.devices} /> : <LastWeek history={history} />}
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
        <div><dt>Capturas hoy</dt><dd>{mine.length}</dd></div>
        <div><dt>Camiones distintos</dt><dd>{plates.size}</dd></div>
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

/** Últimos 7 días (hasta ayer) desde las corridas semanales guardadas, con el panel estándar por calle/cámara. */
function LastWeek({ history }: { history: History | null }) {
  const to = dayOf(Date.now() - 86_400_000)
  const from = dayOf(Date.now() - 7 * 86_400_000)
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'ok'; csv?: string; coverage: RangeCoverage } | { phase: 'error'; msg: string }>({ phase: 'loading' })
  useEffect(() => {
    if (!history) return
    let alive = true
    ;(async () => {
      try {
        const windows = (await listWindows()).filter(w => !w.stale)
        const coverage = computeRangeCoverage(from, to, windows)
        if (!coverage.selectedRuns.length) { if (alive) setState({ phase: 'ok', coverage }); return }
        const loaded = await Promise.all(coverage.selectedRuns.map(async r => ({ runId: r.runId, output: await loadTransformOutputFromRun(r.runId), spanFrom: r.spanFrom, spanTo: r.spanTo })))
        const composed = composeRunsIntoTransformOutput(loaded, from, to)
        if (alive) setState({ phase: 'ok', csv: composed.output.csv[history.table], coverage })
      } catch (e) {
        if (alive) setState({ phase: 'error', msg: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { alive = false }
  }, [history, from, to])
  if (!history) return (
    <div className="ph-empty">
      <p>Este punto no tiene un panel por cámara en el análisis. Sus tiempos están en el KPI de tiempos por tramo.</p>
      <Link to="/estadisticas/indicadores/tiempos" className="ph-link">Abrir KPI de tiempos →</Link>
    </div>
  )
  if (state.phase === 'loading') return <p className="ph-empty">Armando {from} → {to} desde las corridas guardadas…</p>
  if (state.phase === 'error') return <p className="ph-empty">No se pudo cargar el histórico: {state.msg}</p>
  const missing = state.coverage.missingDays
  return (
    <div>
      {missing.length ? <p className="ph-warn">Sin corrida guardada para {missing.length} día(s): {missing.join(', ')}. Procesalos en «Análisis local» para completarlos.</p> : null}
      {state.csv
        ? <CaladaCamerasPanel csv={state.csv} checkedCircuits={new Set()} filterActive={false} periodLabel={`${from} → ${to}`} labels={history.labels} />
        : <p className="ph-empty">Las corridas de este período no tienen la tabla {history.table}.</p>}
    </div>
  )
}
