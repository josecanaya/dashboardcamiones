import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlantMap, type MapTruck } from '../components/plant/PlantMap'
import { LiveCameraPlayerModal } from '../components/plant/LiveCameraPlayerModal'
import { LiveActivityFeed } from '../components/plant/LiveActivityFeed'
import { IdentificationPanel } from '../components/plant/IdentificationPanel'
import { useLivePlantState } from '../hooks/useLivePlantState'
import type { PlantLayout, PlantCameraGroup } from '../data/plantZones.types'
import type { TruckJourney, TruckRow } from '../services/live/plantStateApi'
import { formatDrainMinutes, getIdentifications, getPlantTrucks, getTruckJourney } from '../services/live/plantStateApi'
import './liveMonitor.css'

type Site = 'ricardone' | 'san_lorenzo'
type Panel = 'camiones' | 'camaras' | 'capturas'
const SITE_NAME: Record<Site, string> = { ricardone: 'Ricardone', san_lorenzo: 'San Lorenzo' }
const STATUS_TEXT: Record<TruckRow['status'], string> = { normal: 'En tiempo', attention: 'Demorado', critical: 'Muy demorado' }

function minutes(min: number | null | undefined) {
  if (min == null || !Number.isFinite(min)) return '—'
  const m = Math.max(0, Math.round(min))
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}
function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' })
}

/**
 * Monitoreo de cámaras y flujo de camiones: el plano es protagonista, cada camión está en su punto,
 * y elegir uno lo sigue (recorrido sobre el plano + ficha con pasos y cámara).
 */
export function LiveMonitorPage() {
  const [site, setSite] = useState<Site>(() => {
    try { return (localStorage.getItem('lm-site') as Site) || 'ricardone' } catch { return 'ricardone' }
  })
  useEffect(() => { try { localStorage.setItem('lm-site', site) } catch { /* sin storage */ } }, [site])
  const [view, setView] = useState<'monitoreo' | 'patentes'>('monitoreo')
  const live = useLivePlantState(site)
  const [layout, setLayout] = useState<PlantLayout | null>(null)
  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [trucksError, setTrucksError] = useState<string | null>(null)
  const [followed, setFollowed] = useState<string | null>(null)
  const [journey, setJourney] = useState<TruckJourney | null>(null)
  const [panel, setPanel] = useState<Panel>('camiones')
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<string | null>(null)
  const [camera, setCamera] = useState<{ title: string; devices: string[] } | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t) }, [])

  useEffect(() => {
    let alive = true
    setLayout(null); setFollowed(null); setZoneFilter(null)
    fetch(`/plant/${site}/plantZones.json`).then(r => r.ok ? r.json() : null).then(l => { if (alive) setLayout(l) }).catch(() => undefined)
    return () => { alive = false }
  }, [site])

  // Camiones abiertos: se refrescan junto con cada estado nuevo de planta (y como mínimo cada 15 s).
  useEffect(() => {
    let alive = true
    const load = () => getPlantTrucks(site).then(r => { if (alive) { setTrucks(r.trucks); setTrucksError(null) } }).catch(e => { if (alive) setTrucksError(e instanceof Error ? e.message : String(e)) })
    void load()
    const t = setInterval(load, 15_000)
    return () => { alive = false; clearInterval(t) }
  }, [site, live.lastUpdateMs])

  // Camión seguido: su recorrido completo, refrescado cada 10 s.
  useEffect(() => {
    if (!followed) { setJourney(null); return }
    let alive = true
    const load = () => getTruckJourney(site, followed).then(j => { if (alive) setJourney(j) }).catch(() => { if (alive) setJourney(null) })
    void load()
    const t = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [site, followed])

  // Patentes por confirmar (solo el número; la bandeja completa vive en su pestaña).
  useEffect(() => {
    let alive = true
    const load = () => getIdentifications(site).then(r => { if (alive) setPending(r.items.filter(i => i.level === 'provisorio' || i.level === 'pendiente').length) }).catch(() => undefined)
    void load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [site])

  const points = useMemo(() => layout?.points ?? [], [layout])
  const pointOfSector = useMemo(() => new Map(points.map(p => [p.sectorCode, p.id])), [points])
  const pointLabel = useMemo(() => new Map(points.map(p => [p.id, p.label])), [points])
  const mapTrucks: MapTruck[] = useMemo(() => trucks.flatMap(t => {
    const pointId = pointOfSector.get(t.sectorCode)
    return pointId ? [{ plate: t.plate, pointId, status: t.status, label: `${STATUS_TEXT[t.status]} · ${minutes(t.dwellSectorMin)} en el punto` }] : []
  }), [trucks, pointOfSector])

  const snap = live.snapshot
  const zones = snap?.zones ?? []
  const queues = zones.filter(z => z.backlog > 0 || z.status === 'attention' || z.status === 'critical').sort((a, b) => b.backlog - a.backlog)
  const alerts = zones.filter(z => z.status === 'critical' || z.status === 'attention')
  const visibleTrucks = trucks
    .filter(t => !zoneFilter || t.zoneId === zoneFilter)
    .filter(t => !search || t.plate.includes(search.toUpperCase()))
  const followedRow = trucks.find(t => t.plate === followed) ?? null
  const ageS = live.lastUpdateMs ? Math.round((now - live.lastUpdateMs) / 1000) : null
  const statusText = live.status === 'live' ? 'En vivo' : live.status === 'stale' ? 'Datos demorados' : live.status === 'error' ? 'Sin conexión' : 'Conectando…'
  const lastEvent = snap?.source?.lastEventAt ? Math.round((now - Date.parse(snap.source.lastEventAt)) / 60000) : null

  const follow = (plate: string | null) => { setFollowed(plate); if (plate) setPanel('camiones') }
  const openPoint = (group: PlantCameraGroup) => { if (group.devices.length) setCamera({ title: `${SITE_NAME[site]} · ${group.label}`, devices: group.devices }) }

  return (
    <section className="lm">
      <header className="lm-top">
        <div className="lm-top__title">
          <h1>Monitoreo en vivo</h1>
          <span className={`lm-live lm-live--${live.status}`}><i />{statusText}{ageS != null && live.status !== 'live' ? ` · hace ${ageS} s` : ''}</span>
          {lastEvent != null ? <span className={`lm-source${lastEvent > 15 ? ' is-stale' : ''}`}>última cámara hace {lastEvent < 1 ? '<1' : lastEvent} min</span> : null}
        </div>
        <div className="lm-sites" role="group" aria-label="Planta">
          {(Object.keys(SITE_NAME) as Site[]).map(s => <button key={s} type="button" aria-pressed={site === s} onClick={() => setSite(s)}>{SITE_NAME[s]}</button>)}
        </div>
        <dl className="lm-kpis">
          <div><dt>En planta</dt><dd>{snap?.plant.trucksInPlant ?? '—'}</dd></div>
          <div><dt>Ingresan / h</dt><dd>{snap?.plant.inflow60 ?? '—'}</dd></div>
          <div><dt>Salen / h</dt><dd>{snap?.plant.outflow60 ?? '—'}</dd></div>
          <div className={snap?.plant.bottleneck ? 'is-warn' : ''}><dt>Cuello de botella</dt><dd>{snap?.plant.bottleneck ? `${snap.plant.bottleneck.label}` : 'Sin cola'}</dd></div>
        </dl>
        <nav className="lm-views" aria-label="Vista">
          <button type="button" aria-pressed={view === 'monitoreo'} onClick={() => setView('monitoreo')}>Mapa</button>
          <button type="button" aria-pressed={view === 'patentes'} onClick={() => setView('patentes')}>
            Patentes {pending ? <b className="lm-badge">{pending}</b> : null}
          </button>
          <Link to="/en-vivo/detalle" className="lm-link">Vista detallada</Link>
        </nav>
      </header>

      {view === 'patentes' ? <div className="lm-desk"><IdentificationPanel sites={[site]} /></div> : (
        <div className="lm-body">
          <div className="lm-map">
            {alerts.length ? <div className="lm-alerts" role="status">
              {alerts.slice(0, 4).map(z => <button key={z.id} type="button" className={`lm-alert lm-alert--${z.status}`} onClick={() => { setZoneFilter(z.id); setPanel('camiones'); setFollowed(null) }}>
                <b>{z.label}</b> {z.entryBlind ? 'sin dato de ingreso' : `${z.backlog} esperando`}{formatDrainMinutes(z.drainMinutes) ? ` · ${formatDrainMinutes(z.drainMinutes)}` : ''}
              </button>)}
            </div> : null}
            {layout ? <PlantMap
              layout={layout}
              site={site}
              fill
              quietZones
              showCircuitControls={false}
              zones={zones}
              trucks={mapTrucks}
              followedPlate={followed}
              onSelectTruck={plate => follow(plate === followed ? null : plate)}
              followPath={journey?.timeline.map(r => r.logicalSector ?? '').filter(Boolean) ?? []}
              followNext={journey?.nextExpectedPoint ?? null}
              onOpenCameras={openPoint}
              onSelectZone={id => { if (id) { setZoneFilter(id); setPanel('camiones'); setFollowed(null) } }}
            /> : <div className="lm-map__empty">Cargando plano…</div>}
            <div className="lm-legend" aria-hidden>
              <span><i style={{ background: '#16A34A' }} />En tiempo</span>
              <span><i style={{ background: '#F59E0B' }} />Demorado</span>
              <span><i style={{ background: '#DC2626' }} />Muy demorado</span>
              <span>Clic en un camión para seguirlo · clic en un punto para ver sus cámaras</span>
            </div>
          </div>

          <aside className="lm-side">
            {followed ? (
              <TruckCard
                plate={followed}
                row={followedRow}
                journey={journey}
                pointLabel={pointLabel}
                onClose={() => setFollowed(null)}
                onCamera={device => setCamera({ title: `${followed} · ${device}`, devices: [device] })}
              />
            ) : (
              <>
                <div className="lm-tabs" role="tablist">
                  {([['camiones', `Camiones ${trucks.length}`], ['camaras', 'Cámaras'], ['capturas', 'Capturas']] as const).map(([id, label]) =>
                    <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{label}</button>)}
                </div>
                {panel === 'camiones' ? <div className="lm-panel">
                  {queues.length ? <div className="lm-queues">
                    <h3>Colas</h3>
                    {queues.slice(0, 6).map(z => <button key={z.id} type="button" aria-pressed={zoneFilter === z.id} className={`lm-queue lm-queue--${z.status}`} onClick={() => setZoneFilter(zoneFilter === z.id ? null : z.id)}>
                      <span>{z.label}</span>
                      <b>{z.entryBlind ? 's/d' : z.backlog}{z.capacityOperational != null && !z.entryBlind ? <small>/{z.capacityOperational}</small> : null}</b>
                      <i style={{ width: `${Math.min(100, z.capacityOperational ? (z.backlog / z.capacityOperational) * 100 : z.backlog * 10)}%` }} />
                    </button>)}
                  </div> : null}
                  <div className="lm-search">
                    <input placeholder="Buscar patente" aria-label="Buscar patente" value={search} onChange={e => setSearch(e.target.value)} />
                    {zoneFilter ? <button type="button" onClick={() => setZoneFilter(null)}>{zones.find(z => z.id === zoneFilter)?.label ?? zoneFilter} ×</button> : null}
                  </div>
                  {trucksError ? <p className="lm-error">No se pudo actualizar la lista: {trucksError}</p> : null}
                  <ol className="lm-trucks">
                    {visibleTrucks.map(t => <li key={t.plate}>
                      <button type="button" onClick={() => follow(t.plate)}>
                        <i className={`lm-dot lm-dot--${t.status}`} />
                        <strong>{t.plate}</strong>
                        <span>{pointLabel.get(pointOfSector.get(t.sectorCode) ?? '') ?? t.sectorCode}</span>
                        <em>{minutes(t.dwellSectorMin)}</em>
                      </button>
                    </li>)}
                    {!visibleTrucks.length ? <li className="lm-empty">{trucks.length ? 'Ningún camión con ese filtro.' : 'Sin camiones en planta.'}</li> : null}
                  </ol>
                </div> : null}
                {panel === 'camaras' ? <div className="lm-panel">
                  <ul className="lm-cams">
                    {points.filter(p => p.cameraGroup.devices.length).map(p => <li key={p.id}>
                      <button type="button" onClick={() => openPoint(p.cameraGroup)}>
                        <span className="lm-cams__icon" aria-hidden>▶</span>
                        <strong>{p.label}</strong>
                        <small>{p.cameraGroup.devices.length} {p.cameraGroup.devices.length === 1 ? 'cámara' : 'cámaras'}</small>
                      </button>
                    </li>)}
                  </ul>
                </div> : null}
                {panel === 'capturas' ? <div className="lm-panel lm-panel--feed"><LiveActivityFeed sites={[site]} onOpenCase={() => setView('patentes')} /></div> : null}
              </>
            )}
          </aside>
        </div>
      )}
      <LiveCameraPlayerModal open={camera != null} devices={camera?.devices ?? null} title={camera?.title} onClose={() => setCamera(null)} />
    </section>
  )
}

/** Ficha del camión seguido: dónde está, cuánto lleva, por dónde pasó y qué sigue. */
function TruckCard({ plate, row, journey, pointLabel, onClose, onCamera }: {
  plate: string
  row: TruckRow | null
  journey: TruckJourney | null
  pointLabel: Map<string, string>
  onClose: () => void
  onCamera: (device: string) => void
}) {
  const status = (journey?.status ?? row?.status ?? 'normal') as TruckRow['status']
  return (
    <div className="lm-card">
      <header>
        <div>
          <span className="lm-card__eyebrow">Siguiendo</span>
          <h2>{plate}</h2>
          <p>{journey?.circuitLabel ?? row?.circuitLabel ?? 'Circuito sin confirmar'}{journey?.provisional ? ' · provisorio' : ''}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Dejar de seguir">Dejar de seguir</button>
      </header>
      <div className={`lm-card__state lm-card__state--${status}`}>
        <i className={`lm-dot lm-dot--${status}`} />
        <div>
          <strong>{journey?.sectorLabel ?? row?.sectorCode ?? '—'}</strong>
          <span>{STATUS_TEXT[status] ?? status} · {minutes(journey?.dwellSectorMin ?? row?.dwellSectorMin)} en este punto</span>
        </div>
      </div>
      <dl className="lm-card__facts">
        <div><dt>En planta</dt><dd>{minutes(journey?.dwellPlantMin ?? row?.dwellPlantMin)}</dd></div>
        <div><dt>Próximo</dt><dd>{journey?.nextExpectedLabel ?? row?.nextExpectedLabel ?? '—'}</dd></div>
        <div><dt>Última lectura</dt><dd>hace {minutes(journey?.minutesSinceLastDetection ?? row?.minutesSinceLastDetection)}</dd></div>
      </dl>
      {journey?.anomaly ? <p className="lm-card__alert">{journey.anomaly.rule}</p> : null}
      {(journey?.lastDevice ?? row?.lastDevice) ? <button type="button" className="lm-card__cam" onClick={() => onCamera((journey?.lastDevice ?? row?.lastDevice)!)}>▶ Ver cámara donde se lo vio por última vez</button> : null}
      <h3>Recorrido</h3>
      {journey ? <ol className="lm-steps">
        {journey.timeline.map((r, i) => <li key={`${r.at}-${i}`} className={i === journey.timeline.length - 1 ? 'is-current' : ''}>
          <time>{hhmm(r.at)}</time>
          <div>
            <strong>{pointLabel.get(r.logicalSector ?? '') ?? r.label}</strong>
            {r.legFromPreviousMin != null ? <span>{minutes(r.legFromPreviousMin)} desde el paso anterior</span> : <span>Primera lectura</span>}
          </div>
          {r.deviceCode ? <button type="button" onClick={() => onCamera(r.deviceCode!)} aria-label={`Ver cámara ${r.deviceCode}`}>▶</button> : null}
        </li>)}
        {journey.nextExpectedLabel ? <li className="is-next"><time>…</time><div><strong>{journey.nextExpectedLabel}</strong><span>Próximo punto esperado</span></div></li> : null}
      </ol> : <p className="lm-empty">Cargando recorrido…</p>}
    </div>
  )
}
