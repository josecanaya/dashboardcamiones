import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlantMap, type MapTruck } from '../components/plant/PlantMap'
import { LiveCameraPlayerModal } from '../components/plant/LiveCameraPlayerModal'
import { LiveActivityFeed } from '../components/plant/LiveActivityFeed'
import { IdentificationPanel } from '../components/plant/IdentificationPanel'
import { VerificationPhoto, type PhotoState } from '../components/plant/PlateVerification'
import { createPortal } from 'react-dom'
import { PointHistoryModal } from '../components/plant/PointHistoryModal'
import { placeTrucks } from '../services/live/truckTransit'
import { crossPlantSources, SOURCE_SGC, SOURCE_TF, type PlantTruck } from '../services/live/plantCrossSource'
import type { PlantPoint } from '../data/plantZones.types'
import { useLivePlantState } from '../hooks/useLivePlantState'
import type { PlantLayout, PlantCameraGroup } from '../data/plantZones.types'
import type { BalanzaRow, BalanzaSnapshot, PredecessorCandidate, PredecessorsResponse, TruckJourney, TruckRow, TruckTimelineRow } from '../services/live/plantStateApi'
import { cameraCaptureImageUrl, correctTruckLocation, findCameraCapture, formatDrainMinutes, getBalanza, getIdentifications, getPlantTrucks, getTruckJourney, getTruckPredecessors, linkTruckJourney } from '../services/live/plantStateApi'
import './liveMonitor.css'
import { usePublishAnalysis } from '../context/AnalysisContext'

type Site = 'ricardone' | 'san_lorenzo'
type Panel = 'camiones' | 'camaras' | 'capturas'
type SourceFilter = 'todas' | 'ambas' | 'sgc' | 'tf'
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
  const [journeyTick, setJourneyTick] = useState(0)
  const [panel, setPanel] = useState<Panel>('camiones')
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<string | null>(null)
  const [camera, setCamera] = useState<{ title: string; devices: string[] } | null>(null)
  const [pointOpen, setPointOpen] = useState<PlantPoint | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [balanza, setBalanza] = useState<BalanzaSnapshot | null>(null)
  const [balanzaError, setBalanzaError] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('todas')

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

  // Balanza (SGC Vicentin): el server la consulta cada 2 min; acá se relee cada 30 s.
  useEffect(() => {
    let alive = true
    setBalanza(null)
    const load = () => getBalanza(site).then(b => { if (alive) { setBalanza(b); setBalanzaError(null) } }).catch(e => { if (alive) setBalanzaError(e instanceof Error ? e.message : String(e)) })
    void load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [site])

  // Camión seguido: su recorrido completo, refrescado cada 10 s.
  const plantTrucks = useMemo(() => crossPlantSources(trucks, balanza?.inPlant ?? [], balanza?.closed ?? [], balanza?.otherOpen ?? []), [trucks, balanza])
  const followedItem = plantTrucks.find(t => t.plate === followed) ?? null
  const followedTf = followedItem?.tf?.plate ?? null
  useEffect(() => {
    if (!followedTf) { setJourney(null); return }
    let alive = true
    const load = () => getTruckJourney(site, followedTf).then(j => { if (alive) setJourney(j) }).catch(() => { if (alive) setJourney(null) })
    void load()
    const t = setInterval(load, 10_000)
    return () => { alive = false; clearInterval(t) }
  }, [site, followedTf, journeyTick])

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
  // Cada camión en su punto o en tránsito sobre la línea hacia el siguiente (como en el simulador).
  const mapTrucks: MapTruck[] = useMemo(() => {
    const byPlate = new Map(trucks.map(t => [t.plate, t]))
    // Alta en SGC = pasó Preingreso aunque la cámara no lo haya leído.
    const sgcPlates = new Set([...(balanza?.inPlant ?? []), ...(balanza?.otherOpen ?? [])].flatMap(r => [r.plate, r.trailer ?? '']).filter(Boolean))
    return placeTrucks(trucks, layout, { sgcPlates }).map(p => {
      const t = byPlate.get(p.plate)!
      const waitMin = t.dwellSectorMin ?? t.minutesSinceLastDetection
      const label = p.waitZoneId ? `${STATUS_TEXT[t.status]} · esperando hace ${minutes(waitMin)}` : p.transit ? `${STATUS_TEXT[t.status]} · salió hace ${minutes(t.minutesSinceLastDetection)}` : `${STATUS_TEXT[t.status]} · ${minutes(t.dwellSectorMin)} en el punto`
      return { ...p, status: t.status, waitMin, label }
    })
  }, [trucks, layout, balanza])

  const snap = live.snapshot
  const zones = snap?.zones ?? []
  const queues = zones.filter(z => z.backlog > 0 || z.status === 'attention' || z.status === 'critical').sort((a, b) => b.backlog - a.backlog)
  const alerts = zones.filter(z => z.status === 'critical' || z.status === 'attention')
  const counts = { ambas: 0, sgc: 0, tf: 0 }
  for (const t of plantTrucks) counts[t.sources]++
  const q = search.trim().toUpperCase()
  const visibleTrucks = plantTrucks
    .filter(t => sourceFilter === 'todas' || t.sources === sourceFilter)
    .filter(t => !zoneFilter || t.tf?.zoneId === zoneFilter)
    .filter(t => !q || [t.plate, t.tf?.plate, t.sgc?.trailer, t.sgc?.product].some(v => v?.toUpperCase().includes(q)))
  const followedRow = followedItem?.tf ?? null
  const placementOf = new Map(mapTrucks.map(m => [m.plate, m]))
  /** Dónde está según el mapa: en su punto o en camino al siguiente. */
  const placeText = (row: TruckRow) => {
    const m = placementOf.get(row.plate)
    if (m?.waitZoneId) return `Esperando en ${layout?.zones.find(z => z.zoneId === m.waitZoneId)?.label ?? 'playa'}${m.inferred ? ' (inferido)' : ''}`
    if (m?.transit) return `En camino a ${pointLabel.get(m.transit.toPointId) ?? m.transit.toPointId}`
    return pointLabel.get(m?.pointId ?? pointOfSector.get(row.sectorCode) ?? '') ?? row.sectorCode
  }
  const sgcOk = Boolean(balanza?.status.lastOkAt)
  usePublishAnalysis({ mode: 'live', site, sector: followedRow?.sectorCode ?? pointOpen?.sectorCode, zone: zoneFilter, plate: followed, label: pointOpen?.label, metricId: view === 'patentes' ? 'identification.pending_cases' : 'plant.trucks_present' })
  const ageS = live.lastUpdateMs ? Math.round((now - live.lastUpdateMs) / 1000) : null
  const statusText = live.status === 'live' ? 'En vivo' : live.status === 'stale' ? 'Datos demorados' : live.status === 'error' ? 'Sin conexión' : 'Conectando…'
  const lastEvent = snap?.source?.lastEventAt ? Math.round((now - Date.parse(snap.source.lastEventAt)) / 60000) : null

  const follow = (plate: string | null) => { setFollowed(plate); if (plate) setPanel('camiones') }
  /** El mapa devuelve la patente leída por cámara: se sigue al camión cruzado que la contiene. */
  const followCamera = (plate: string) => follow(plantTrucks.find(t => t.tf?.plate === plate)?.plate ?? plate)
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
          <div title={`Cruce ${SOURCE_TF} (cámaras) + ${SOURCE_SGC} (balanza Vicentin) por patente`}>
            <dt>En planta</dt><dd>{plantTrucks.length || (snap?.plant.trucksInPlant ?? '—')}</dd>
            <small className="lm-kpis__src">{sgcOk ? `${counts.ambas} en ambas · ${counts.sgc} solo ${SOURCE_SGC} · ${counts.tf} solo cámaras` : `${SOURCE_SGC} sin conexión`}</small>
          </div>
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
              showRoads
              showCircuitControls={false}
              zones={zones}
              trucks={mapTrucks}
              followedPlate={followedTf}
              onSelectTruck={plate => (plate === followedTf ? follow(null) : followCamera(plate))}
              followPath={journey?.timeline.map(r => r.logicalSector ?? '').filter(Boolean) ?? []}
              followDeduced={journey?.timeline.filter(r => r.step === 'deducido').map(r => r.logicalSector ?? '').filter(Boolean) ?? []}
              followNext={journey?.nextExpectedPoint ?? null}
              onOpenCameras={openPoint}
              onSelectPoint={setPointOpen}
              onSelectZone={id => { if (id) { setZoneFilter(id); setPanel('camiones'); setFollowed(null) } }}
            /> : <div className="lm-map__empty">Cargando plano…</div>}
            <div className="lm-legend" aria-hidden>
              <span><i style={{ background: '#16A34A' }} />En tiempo</span>
              <span><i style={{ background: '#F59E0B' }} />Demorado</span>
              <span><i style={{ background: '#DC2626' }} />Muy demorado</span>
              <span>Sobre la línea: en tránsito al punto siguiente (borde punteado = destino estimado)</span>
              <span>Clic en un camión para seguirlo · clic en un punto para ver cámaras, actividad de hoy y últimos 7 días</span>
            </div>
          </div>

          <aside className="lm-side">
            {followed ? (
              <TruckCard
                plate={followed}
                item={followedItem}
                row={followedRow}
                journey={journey}
                pointLabel={pointLabel}
                site={site}
                onClose={() => setFollowed(null)}
                onChanged={() => setJourneyTick(t => t + 1)}
                onDiscarded={() => { setFollowed(null); setTrucks(list => list.filter(t => t.plate !== followedTf)) }}
              />
            ) : (
              <>
                <div className="lm-tabs" role="tablist">
                  {([['camiones', `Camiones ${plantTrucks.length}`], ['camaras', 'Cámaras'], ['capturas', 'Capturas']] as const).map(([id, label]) =>
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
                  <div className="lm-srcfilter" role="group" aria-label="Fuente">
                    {([['todas', `Todos ${plantTrucks.length}`], ['ambas', `En ambas ${counts.ambas}`], ['sgc', `Solo ${SOURCE_SGC} ${counts.sgc}`], ['tf', `Solo cámaras ${counts.tf}`]] as const).map(([id, label]) =>
                      <button key={id} type="button" aria-pressed={sourceFilter === id} onClick={() => setSourceFilter(id)}>{label}</button>)}
                  </div>
                  {trucksError ? <p className="lm-error">{SOURCE_TF}: no se pudo actualizar la lista ({trucksError})</p> : null}
                  {balanza?.status.error || balanzaError ? <p className="lm-error">{SOURCE_SGC} sin conexión{balanza?.status.lastOkAt ? ` · datos de las ${hhmm(balanza.status.lastOkAt)}` : ''}</p> : null}
                  <ol className="lm-trucks">
                    {visibleTrucks.map(t => <li key={`${t.plate}-${t.sgc?.nroIngreso ?? t.tf?.plate}`}>
                      <button type="button" onClick={() => follow(t.plate)}>
                        <i className={`lm-dot lm-dot--${t.status}`} />
                        <strong>{t.plate}</strong>
                        <span>
                          {t.tf ? placeText(t.tf) : `Sin cámara · ingresó ${hhmm(t.sgc?.ingresoAt ?? '')}`}
                          {t.sgc ? <small> · {t.sgc.product}</small> : null}
                          {t.sgcClosed ? <small className="lm-warn"> · {SOURCE_SGC}: salió {hhmm(t.sgcClosed.salidaAt ?? '')}</small> : null}
                        </span>
                        <SourceTags t={t} />
                        <em>{minutes(t.tf?.dwellSectorMin ?? t.dwellPlantMin)}</em>
                      </button>
                    </li>)}
                    {!visibleTrucks.length ? <li className="lm-empty">{plantTrucks.length ? 'Ningún camión con ese filtro.' : 'Sin camiones en planta.'}</li> : null}
                  </ol>
                </div> : null}
                {panel === 'camaras' ? <div className="lm-panel">
                  <ul className="lm-cams">
                    {points.filter(p => p.cameraGroup.devices.length).map(p => <li key={p.id}>
                      <button type="button" onClick={() => setPointOpen(p)}>
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
      {pointOpen ? <PointHistoryModal site={site} point={pointOpen} onClose={() => setPointOpen(null)} onOpenCameras={() => openPoint(pointOpen.cameraGroup)} /> : null}
      <LiveCameraPlayerModal open={camera != null} devices={camera?.devices ?? null} title={camera?.title} onClose={() => setCamera(null)} />
    </section>
  )
}

/** Ficha del camión seguido: dónde está, cuánto lleva, por dónde pasó y qué sigue. */
/** Ficha del camión seguido: última captura (foto), pasos con su foto y recuperación de lecturas anteriores. */
/** Chips de fuente: qué sistema registra hoy a este camión. */
function SourceTags({ t }: { t: PlantTruck }) {
  return <span className="lm-srctags" aria-label="Fuentes">
    <b className={t.tf ? 'is-on' : ''} title={t.tf ? `${SOURCE_TF}: lo ven las cámaras` : `${SOURCE_TF}: sin lectura`}>TF</b>
    <b className={t.sgc ? 'is-on' : t.sgcClosed ? 'is-warn' : ''} title={t.sgc ? `${SOURCE_SGC}: ingreso ${t.sgc.nroIngreso}` : t.sgcClosed ? `${SOURCE_SGC}: ya salió` : `${SOURCE_SGC}: sin ingreso`}>{SOURCE_SGC}</b>
  </span>
}

const kgText = (kg: number | null) => (kg == null ? '—' : `${(kg / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} t`)
const MATCH_TEXT = { patente: 'misma patente', acoplado: 'la cámara leyó el acoplado', parecida: 'patente parecida (una letra distinta)' } as const

/** Lecturas de cámara del recorrido (sin los pasos deducidos, que no tienen hora). */
const readSteps = (journey: TruckJourney | null) => (journey?.timeline ?? []).filter((r): r is TruckTimelineRow & { at: string } => r.step !== 'deducido' && r.at != null)

/** Qué dice cada fuente del camión seguido, citada. */
function SourcesBlock({ item, journey }: { item: PlantTruck | null; journey: TruckJourney | null }) {
  const sgc = item?.sgc ?? item?.sgcClosed ?? null
  const steps = readSteps(journey)
  const first = steps[0]
  const last = steps[steps.length - 1]
  return <section className="lm-sources">
    <h3>Fuentes</h3>
    <div className={`lm-source-row${item?.tf ? '' : ' is-off'}`}>
      <b>{SOURCE_TF} · cámaras</b>
      {item?.tf ? <span>
        {first ? `Primera lectura ${hhmm(first.at)}` : 'Leyendo recorrido…'}{last ? ` · última ${hhmm(last.at)}` : ''}
        {item.tf.plate !== item.plate ? ` · leída como ${item.tf.plate}` : ''}
      </span> : <span>Sin lecturas de cámara hoy.</span>}
    </div>
    <div className={`lm-source-row${sgc ? '' : ' is-off'}`}>
      <b>{SOURCE_SGC} · balanza Vicentin</b>
      {sgc ? <span>
        Ingreso {sgc.nroIngreso} · entró {hhmm(sgc.ingresoAt)}{sgc.salidaAt ? ` · salió ${hhmm(sgc.salidaAt)}` : ''} · planta {sgc.plantName}<br />
        {sgc.product}{sgc.intent ? ` · vino a ${sgc.intent === 'carga' ? 'cargar' : 'descargar'}` : ''} · acoplado {sgc.trailer ?? '—'}<br />
        Bruto {kgText(sgc.brutoKg)} · Tara {kgText(sgc.taraKg)} · Neto {kgText(sgc.netoKg)}
        {item?.match && item.match !== 'patente' && item.tf ? <><br /><small>Cruce: {MATCH_TEXT[item.match]}</small></> : null}
      </span> : <span>Sin ingreso en {SOURCE_SGC}: no pasó por balanza en las últimas 24 h.</span>}
    </div>
    {item?.sgcClosed && item.tf ? <p className="lm-card__alert">{SOURCE_SGC} registra la salida a las {hhmm(item.sgcClosed.salidaAt ?? '')}, pero las cámaras lo siguen viendo.</p> : null}
  </section>
}

function TruckCard({ site, plate, item, row, journey, pointLabel, onClose, onChanged, onDiscarded }: {
  site: Site
  plate: string
  item: PlantTruck | null
  row: TruckRow | null
  journey: TruckJourney | null
  pointLabel: Map<string, string>
  onClose: () => void
  onChanged: () => void
  onDiscarded: () => void
}) {
  const status = (journey?.status ?? row?.status ?? 'normal') as TruckRow['status']
  const timeline = journey?.timeline ?? []
  const steps = readSteps(journey)
  const last = steps[steps.length - 1]
  const startsMidway = steps.length > 0 && !ENTRY_POINTS.has(steps[0].logicalSector ?? '')
  const sgc: BalanzaRow | null = item?.sgc ?? null
  const sgcOnly = Boolean(item && !item.tf)
  const tfPlate = row?.plate ?? plate
  return (
    <div className="lm-card">
      <header>
        <div>
          <span className="lm-card__eyebrow">Siguiendo</span>
          <h2>{plate}</h2>
          <p>{journey?.circuitLabel ?? row?.circuitLabel ?? 'Circuito sin confirmar'}{journey?.provisional ? ' · provisorio' : ''}{sgc ? ` · ${sgc.product}` : ''}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Dejar de seguir">Dejar de seguir</button>
      </header>
      <div className={`lm-card__state lm-card__state--${status}`}>
        <i className={`lm-dot lm-dot--${status}`} />
        <div>
          <strong>{sgcOnly ? 'En planta, sin lectura de cámara' : journey?.sectorLabel ?? row?.sectorCode ?? '—'}</strong>
          <span>{sgcOnly ? `Dato de ${SOURCE_SGC}: entró ${hhmm(sgc?.ingresoAt ?? '')}` : `${STATUS_TEXT[status] ?? status} · ${minutes(journey?.dwellSectorMin ?? row?.dwellSectorMin)} en este punto`}</span>
        </div>
      </div>
      <dl className="lm-card__facts">
        <div><dt>En planta</dt><dd>{minutes(sgc ? sgc.minutes : journey?.dwellPlantMin ?? row?.dwellPlantMin)}<small>{sgc ? SOURCE_SGC : SOURCE_TF}</small></dd></div>
        <div><dt>Ingreso</dt><dd>{sgc ? hhmm(sgc.ingresoAt) : steps[0] ? hhmm(steps[0].at) : '—'}<small>{sgc ? SOURCE_SGC : steps[0] ? SOURCE_TF : ''}</small></dd></div>
        <div><dt>Próximo</dt><dd>{journey?.nextExpectedLabel ?? row?.nextExpectedLabel ?? '—'}</dd></div>
        <div><dt>Última lectura</dt><dd>{sgcOnly ? 'Sin cámara' : `hace ${minutes(journey?.minutesSinceLastDetection ?? row?.minutesSinceLastDetection)}`}</dd></div>
      </dl>
      {journey?.anomaly ? <p className="lm-card__alert">{journey.anomaly.rule}</p> : null}
      <SourcesBlock item={item} journey={journey} />
      {sgcOnly ? <CrossPlant key={`cross-${plate}`} site={site} plate={plate} /> : <>
      <DiscardTruck site={site} plate={tfPlate} onDone={onDiscarded} />

      <h3>Última captura</h3>
      {last?.deviceCode ? <CaptureShot key={`${last.deviceCode}-${last.at}`} device={last.deviceCode} at={last.at} plate={tfPlate} caption={`${pointLabel.get(last.logicalSector ?? '') ?? last.label} · ${hhmm(last.at)}`} /> : <p className="lm-empty">{journey ? 'Sin cámara registrada en el último paso.' : 'Cargando…'}</p>}

      <CrossPlant key={`cross-${plate}`} site={site} plate={tfPlate} />

      <h3>Recorrido en {SITE_NAME[site]}</h3>
      {journey ? <ol className="lm-steps">
        {timeline.map((r, i) => <StepRow key={`${r.at ?? r.logicalSector}-${i}`} step={r} plate={tfPlate} label={pointLabel.get(r.logicalSector ?? '') ?? r.label} current={i === timeline.length - 1} />)}
        {journey.nextExpectedLabel ? <li className="is-next"><time>…</time><div><strong>{journey.nextExpectedLabel}</strong><span>Próximo punto esperado</span></div></li> : null}
      </ol> : <p className="lm-empty">Cargando recorrido…</p>}

      {journey ? <Predecessors key={plate} site={site} plate={row?.plate ?? plate} autoOpen={startsMidway} firstLabel={steps[0] ? (pointLabel.get(steps[0].logicalSector ?? '') ?? steps[0].label) : null} reference={steps[0]?.deviceCode ? { device: steps[0].deviceCode, at: steps[0].at, label: pointLabel.get(steps[0].logicalSector ?? '') ?? steps[0].label } : null} onChanged={onChanged} /> : null}
      </>}
    </div>
  )
}

const ENTRY_POINTS = new Set(['S0', 'S1', 'SL_S0', 'SL_S1'])
const OTHER_SITE: Record<Site, Site> = { ricardone: 'san_lorenzo', san_lorenzo: 'ricardone' }

/**
 * Descartar una lectura que no es un camión (tractor, auto particular…): sale del estado de planta
 * con el motivo registrado. No borra lecturas de cámara.
 */
function DiscardTruck({ site, plate, onDone }: { site: Site; plate: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const reasons = ['Tractor o maquinaria', 'Auto particular / camioneta', 'Vehículo de servicio (agua, comida, prestadores)', 'Lectura duplicada o fantasma', 'Ya salió de planta']
  async function discard() {
    setBusy(true); setError('')
    try {
      const operator = (() => { try { return localStorage.getItem('id-operator') || null } catch { return null } })()
      await correctTruckLocation(site, plate, { action: 'remove', reason, operator })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false) }
  }
  if (!open) return <button type="button" className="lm-discard__open" onClick={() => setOpen(true)}>Descartar: no es un camión / no está en planta</button>
  return (
    <div className="lm-discard" role="group" aria-label={`Descartar ${plate}`}>
      <strong>¿Por qué descartás {plate}?</strong>
      {reasons.map(r => <label key={r}><input type="radio" name={`discard-${plate}`} checked={reason === r} onChange={() => setReason(r)} disabled={busy} /> {r}</label>)}
      <p>Sale del estado de planta de {SITE_NAME[site]} (deja de figurar esperando). Las lecturas de cámara no se borran.</p>
      {error ? <p className="lm-error">No se descartó: {error}</p> : null}
      <div className="lm-discard__actions">
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>Cancelar</button>
        <button type="button" className="is-danger" disabled={!reason || busy} onClick={() => void discard()}>{busy ? 'Descartando…' : `Descartar ${plate}`}</button>
      </div>
    </div>
  )
}

/** Recorrido de la misma patente en la otra planta (ej. Ricardone → volcable de San Lorenzo), con fotos. */
function CrossPlant({ site, plate }: { site: Site; plate: string }) {
  const [trips, setTrips] = useState<NonNullable<PredecessorsResponse['otherPlantTrips']> | null>(null)
  useEffect(() => {
    let alive = true
    getTruckPredecessors(site, plate, 12).then(r => { if (alive) setTrips(r.otherPlantTrips ?? []) }).catch(() => { if (alive) setTrips([]) })
    return () => { alive = false }
  }, [site, plate])
  if (!trips?.length) return null
  const other = SITE_NAME[OTHER_SITE[site]]
  return (
    <section className="lm-cross">
      <h3>{trips.some(t => t.gapMin >= 0) ? `Viene de ${other}` : `También en ${other}`}</h3>
      {trips.map(t => <div key={t.journeyKey} className="lm-cross__trip">
        <span>{hhmm(t.startAt)} – {hhmm(t.endAt)} · {t.gapMin >= 0 ? `salió ${minutes(t.gapMin)} antes de llegar acá` : 'después de este viaje'}</span>
        <ol className="lm-steps">{t.reads.map((r, i) => <ReadRow key={`${r.at}-${i}`} read={r} plate={plate} />)}</ol>
      </div>)}
      <p className="lm-cross__hint">Si falta un paso en {other}, buscalo abajo en «Lecturas anteriores»: también propone lecturas mal leídas de {other}.</p>
    </section>
  )
}

/** Foto de una captura (escena + recorte de patente) pedida al DSS; avisa si leyó otra patente. */
function CaptureShot({ device, at, plate, caption }: { device: string; at: string; plate: string; caption: string }) {
  const [state, setState] = useState<{ phase: 'loading' } | { phase: 'ok'; scene: string | null; crop: string | null; read: string; conf: number | null } | { phase: 'none'; msg: string }>({ phase: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [zoom, setZoom] = useState(false)
  useEffect(() => {
    let alive = true
    setState({ phase: 'loading' })
    findCameraCapture(device, at, plate).then(r => {
      if (!alive) return
      const c = r.capture
      if (c && (c.sceneFile || c.plateFile)) setState({ phase: 'ok', scene: c.sceneFile ? cameraCaptureImageUrl(c.sceneFile) : null, crop: c.plateFile ? cameraCaptureImageUrl(c.plateFile) : null, read: c.plate, conf: c.confidence })
      else setState({ phase: 'none', msg: r.error ? `No se pudo consultar el DSS: ${r.error}` : 'El DSS no tiene la foto de esta captura.' })
    }).catch(e => { if (alive) setState({ phase: 'none', msg: e instanceof Error ? e.message : String(e) }) })
    return () => { alive = false }
  }, [device, at, plate, attempt])
  return (
    <figure className="lm-shot">
      {state.phase === 'loading' ? <div className="lm-shot__wait">Buscando la foto…</div> : null}
      {state.phase === 'none' ? <div className="lm-shot__wait">{state.msg} <button type="button" onClick={() => setAttempt(n => n + 1)}>Reintentar</button></div> : null}
      {state.phase === 'ok' ? <>
        {state.scene ? <button type="button" className={`lm-shot__scene${zoom ? ' is-zoomed' : ''}`} onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Achicar foto' : 'Ampliar foto'}><img src={state.scene} alt={`Captura de ${plate}`} /></button> : null}
        <figcaption>
          {state.crop ? <img className="lm-shot__crop" src={state.crop} alt={`Recorte de patente leída ${state.read}`} /> : null}
          <span>Leyó <b className={state.read && state.read !== plate ? 'is-diff' : ''}>{state.read || '—'}</b>{state.conf != null ? ` · confianza ${state.conf}` : ''}</span>
          <small>{caption} · {device}</small>
        </figcaption>
        {state.read && state.read !== plate ? <p className="lm-shot__warn">La cámara leyó {state.read}; este camión figura como {plate}. Compará el recorte.</p> : null}
      </> : null}
    </figure>
  )
}

/** Paso del recorrido con su foto a pedido. */
function StepRow({ step, plate, label, current }: { step: TruckJourney['timeline'][number]; plate: string; label: string; current: boolean }) {
  const [open, setOpen] = useState(false)
  if (step.step === 'deducido' || !step.at) {
    return (
      <li className="is-deduced">
        <time>—</time>
        <div>
          <strong>{label} <em className="lm-step-tag lm-step-tag--deducido">deducido</em></strong>
          <span>Sin lectura: el camión se leyó antes y después y todo circuito posible pasa por acá</span>
        </div>
      </li>
    )
  }
  return (
    <li className={current ? 'is-current' : ''}>
      <time>{hhmm(step.at)}</time>
      <div>
        <strong>{label}{step.step === 'corregido' ? <> <em className="lm-step-tag lm-step-tag--corregido" title={step.identificationLevel === 'confirmado' ? 'Asignada por operaciones' : 'Asignada automáticamente'}>corregido</em></> : null}</strong>
        {step.legFromPreviousMin != null ? <span>{minutes(step.legFromPreviousMin)} desde la lectura anterior</span> : <span>Primera lectura</span>}
        {step.step === 'corregido' && step.readPlate ? <span>La cámara leyó {step.readPlate}</span> : null}
        {open && step.deviceCode ? <CaptureShot device={step.deviceCode} at={step.at} plate={plate} caption={`${label} · ${hhmm(step.at)}`} /> : null}
      </div>
      {step.deviceCode ? <button type="button" aria-pressed={open} onClick={() => setOpen(o => !o)} aria-label={open ? 'Ocultar foto' : `Ver foto en ${label}`}>{open ? '×' : '📷'}</button> : null}
    </li>
  )
}

/** Lectura de un viaje anterior, con su foto a pedido. */
function ReadRow({ read, plate }: { read: { at: string; nodeLabel: string; device: string }; plate: string }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <time>{hhmm(read.at)}</time>
      <div>
        <strong>{read.nodeLabel}</strong>
        {open ? <CaptureShot device={read.device} at={read.at} plate={plate} caption={`${read.nodeLabel} · ${hhmm(read.at)}`} /> : null}
      </div>
      <button type="button" aria-pressed={open} onClick={() => setOpen(o => !o)} aria-label={open ? 'Ocultar foto' : `Ver foto en ${read.nodeLabel}`}>{open ? '×' : '📷'}</button>
    </li>
  )
}

/**
 * Lecturas anteriores perdidas: el algoritmo propone viajes mal leídos que encajan antes del primer
 * paso de este camión; el operador compara la foto y los vincula. Se puede ir más atrás en el tiempo.
 */
function Predecessors({ site, plate, autoOpen, firstLabel, reference, onChanged }: { site: Site; plate: string; autoOpen: boolean; firstLabel: string | null; reference: { device: string; at: string; label: string } | null; onChanged: () => void }) {
  const [open, setOpen] = useState(autoOpen)
  const [hours, setHours] = useState(6)
  const [data, setData] = useState<PredecessorsResponse | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [comparing, setComparing] = useState<PredecessorCandidate | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    let alive = true
    setError('')
    getTruckPredecessors(site, plate, hours).then(r => { if (alive) setData(r) }).catch(e => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [open, site, plate, hours, tick])
  const operator = (() => { try { return localStorage.getItem('id-operator') || null } catch { return null } })()
  async function link(c: PredecessorCandidate | { journeyKey: string; journeyUid: string | null; readPlate?: string }, mode: 'link' | 'unlink' | 'dismiss' = 'link') {
    setBusy(c.journeyKey); setError('')
    try {
      // Lectura de la otra planta: se corrige allá y sin unir viajes entre plantas.
      const fromOther = 'otherSite' in c && c.otherSite
      await linkTruckJourney(site, plate, { journeyKey: c.journeyKey, journeyUid: mode === 'link' && !fromOther ? data?.targetJourneyUid ?? null : null, readPlate: 'readPlate' in c ? c.readPlate : undefined, operator, unlink: mode === 'unlink', dismiss: mode === 'dismiss', sourceSite: fromOther && mode === 'link' ? OTHER_SITE[site] : undefined })
      setComparing(null); setTick(t => t + 1); if (mode !== 'dismiss') onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); throw e } finally { setBusy(null) }
  }
  if (!open) return <button type="button" className="lm-recover__open" onClick={() => setOpen(true)}>Buscar lecturas anteriores perdidas</button>
  return (
    <section className="lm-recover">
      <h3>Lecturas anteriores</h3>
      <p className="lm-recover__intro">{autoOpen && firstLabel ? `El recorrido arranca en ${firstLabel}: faltan los pasos previos. ` : ''}Lecturas de otros viajes que encajan antes de este camión, ordenadas por el algoritmo (parecido de patente, circuito y tiempo).</p>
      <div className="lm-recover__hours" role="group" aria-label="Buscar hacia atrás">
        {[3, 6, 12, 24].map(h => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}>{h} h</button>)}
      </div>
      {error ? <p className="lm-error">{error === 'HTTP 404' ? 'El servidor todavía no tiene esta función: reiniciá truckflow-local-server.' : `Error: ${error}`}</p> : null}
      {data?.previousTrips?.length ? <div className="lm-recover__prev">
        <h4>Viajes anteriores de {plate}</h4>
        {data.previousTrips.map(t => <div key={t.journeyKey} className="lm-recover__trip">
          <span>{hhmm(t.startAt)} – {hhmm(t.endAt)} · terminó {t.gapMin} min antes de {firstLabel ?? 'este viaje'}</span>
          <ol className="lm-steps">{t.reads.map((r, i) => <ReadRow key={`${r.at}-${i}`} read={r} plate={plate} />)}</ol>
        </div>)}
      </div> : null}
      {data?.linked.length ? <ul className="lm-recover__linked">{data.linked.map(l => l.auto
        ? <li key={l.journeyKey} title={l.reason}>Unido solo: lectura {l.readPlate} ({Math.round((l.probability ?? 0) * 100)} %) <button type="button" disabled={busy === l.journeyKey} onClick={() => void link({ journeyKey: l.journeyKey, journeyUid: null, readPlate: l.readPlate }, 'dismiss').then(onChanged).catch(() => undefined)}>No es</button></li>
        : <li key={l.journeyKey}>Vinculado: viaje {l.journeyKey.slice(0, 8)}… <button type="button" disabled={busy === l.journeyKey} onClick={() => void link({ journeyKey: l.journeyKey, journeyUid: null }, 'unlink').catch(() => undefined)}>Desvincular</button></li>)}</ul> : null}
      {!data && !error ? <p className="lm-empty">Buscando…</p> : null}
      {data && !data.candidates.length ? <p className="lm-empty">Ninguna lectura de otra patente encaja antes en las últimas {hours} h. Probá ir más atrás.</p> : null}
      <ol className="lm-recover__list">
        {data?.candidates.map(c => {
          const lastRead = c.reads[c.reads.length - 1]
          return <li key={c.journeyKey}>
            <div className="lm-recover__head">
              <strong className={c.validFormat ? '' : 'is-bad'}>{c.readPlate === 'SIN_PATENTE' ? 'Sin lectura' : c.readPlate}</strong>
              <span>{c.samePlate ? 'misma patente, viaje partido ·' : `${Math.round(c.similarity * 100)}% parecida ·`} {c.circuit} · {c.gapMin} min antes{c.otherSite ? ' · otra planta' : ''}</span>
            </div>
            {/* Fotos a pedido: pedirlas todas juntas supera el límite de consultas del DSS. */}
            {lastRead ? <ol className="lm-steps">{c.reads.map((r, i) => <ReadRow key={`${r.at}-${i}`} read={r} plate={c.readPlate} />)}</ol> : null}
            <div className="lm-recover__actions">
              <button type="button" className="lm-recover__link" onClick={() => setComparing(c)}>Comparar fotos y decidir</button>
              <button type="button" className="lm-recover__no" disabled={busy === c.journeyKey} onClick={() => void link(c, 'dismiss').catch(() => undefined)} title={`No es ${plate}: no se vuelve a proponer`}>No es</button>
            </div>
          </li>
        })}
      </ol>
      {comparing ? <LinkCompare candidate={comparing} plate={plate} reference={reference} onCancel={() => setComparing(null)} onDecide={mode => link(comparing, mode)} /> : null}
    </section>
  )
}

/**
 * Comparativo para vincular: la lectura candidata frente a la primera captura del camión, en grande.
 * Mismo diálogo que la bandeja de patentes; el operador decide «es» o «no es».
 */
function LinkCompare({ candidate, plate, reference, onCancel, onDecide }: {
  candidate: PredecessorCandidate
  plate: string
  reference: { device: string; at: string; label: string } | null
  onCancel: () => void
  onDecide: (mode: 'link' | 'dismiss') => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const el = dialog.current
    el?.showModal()
    return () => { el?.close(); opener?.focus?.() }
  }, [])
  const [photos, setPhotos] = useState<{ a: PhotoState; b: PhotoState }>({ a: 'loading', b: reference ? 'loading' : 'missing' })
  const [saving, setSaving] = useState<null | 'link' | 'dismiss'>(null)
  const [error, setError] = useState('')
  const read = candidate.reads[candidate.reads.length - 1]
  const loading = photos.a === 'loading' || photos.b === 'loading'
  const readName = candidate.readPlate === 'SIN_PATENTE' ? 'Sin lectura' : candidate.readPlate
  async function decide(mode: 'link' | 'dismiss') {
    setSaving(mode); setError('')
    try { await onDecide(mode) } catch (e) { setError(e instanceof Error ? e.message : String(e)); setSaving(null) }
  }
  return createPortal(
    <dialog ref={dialog} className="pv-dialog" aria-labelledby="lc-title" onCancel={e => { e.preventDefault(); if (!saving) onCancel() }}>
      <header className="pv-header">
        <div>
          <span>Recuperar lectura anterior</span>
          <h2 id="lc-title">¿Es el mismo camión?</h2>
          <p><b className="pv-change">{readName} → {plate}</b> · {candidate.reads.map(r => `${r.nodeLabel} ${hhmm(r.at)}`).join(' → ')} · {candidate.gapMin} min antes de su primera lectura</p>
        </div>
        <button type="button" aria-label="Cerrar sin decidir" disabled={Boolean(saving)} onClick={onCancel}>×</button>
      </header>
      <div className="pv-body">
        <div className="pv-photos">
          <VerificationPhoto label={`Lectura candidata · ${read.nodeLabel}`} device={read.device} at={read.at} plate={readName} onState={st => setPhotos(p => ({ ...p, a: st }))} />
          {reference
            ? <VerificationPhoto label={`Primera captura de ${plate} · ${reference.label}`} device={reference.device} at={reference.at} plate={plate} relation={`${candidate.gapMin} min después`} onState={st => setPhotos(p => ({ ...p, b: st }))} />
            : <section className="pv-photo"><header><span>Referencia</span><strong>{plate}</strong></header><div className="pv-photo__scene"><p>El camión no tiene una captura con cámara para comparar.</p></div></section>}
        </div>
        <div className="pv-scores">
          <div><span>Parecido de patente</span><strong>{candidate.samePlate ? 'Misma patente' : `${Math.round(candidate.similarity * 100)}%`}</strong><small>Cuánto se parecen los caracteres leídos.</small></div>
          <div><span>Circuito si es él</span><strong>{candidate.circuit} · {Math.round(candidate.circuitProbability * 100)}%</strong></div>
          <div><span>Tiempo hasta su primera lectura</span><strong>{candidate.gapMin} min</strong></div>
          <div><span>Lecturas que pasan a {plate}</span><strong>{candidate.reads.length}</strong></div>
        </div>
        <p className="pv-note">Compará el vehículo (color, cabina, carga) y el recorte de patente. «No es» lo saca de la lista de este camión.</p>
      </div>
      <footer className="pv-footer">
        <span role="status" className={error ? 'pv-error' : ''}>{error ? `No se guardó: ${error}` : saving ? 'Guardando…' : loading ? 'Cargando las fotos…' : 'Todavía no se guardó nada.'}</span>
        <button type="button" disabled={Boolean(saving)} onClick={onCancel}>Cancelar</button>
        <button type="button" className="pv-no" disabled={Boolean(saving)} onClick={() => void decide('dismiss')}>{saving === 'dismiss' ? 'Guardando…' : `No es ${plate}`}</button>
        <button type="button" className="pv-confirm" disabled={Boolean(saving) || loading} onClick={() => void decide('link')}>{saving === 'link' ? 'Guardando…' : `Sí, es ${plate}: vincular`}</button>
      </footer>
    </dialog>,
    document.body,
  )
}
