import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, MetricCard as KpiCard } from '../components/ui/Interface'
import './plantHome.css'
import { LiveCameraPlayerModal, PinnedCameras } from '../components/plant/LiveCameraPlayerModal'
import { PlantMap } from '../components/plant/PlantMap'
import { IdentificationPanel } from '../components/plant/IdentificationPanel'
import { TruckSteps } from '../components/plant/TruckSteps'
import { LiveActivityFeed } from '../components/plant/LiveActivityFeed'
import { usePublishAnalysis } from '../context/AnalysisContext'
import type { PlantLayout } from '../data/plantZones.types'
import type { TruckRow, ZoneState } from '../services/live/plantStateApi'
import { correctTruckLocation, formatDrainMinutes, getSectorTrucks, getZoneTrucks } from '../services/live/plantStateApi'

const ZONE_STATUS_LABEL: Record<string, string> = {
  normal: 'Normal',
  attention: 'Atención',
  critical: 'Crítico',
  no_data: 'Sin datos',
}
import { useLivePlantState } from '../hooks/useLivePlantState'
import type { SectorState, SectorStatus } from '../services/live/plantStateApi'

type RecentTruck = TruckRow & { siteLabel: string }

function MapContextPanel(props: {
  selectedZone: ZoneState | null
  selectedSector: SectorState | null
  recentEntries: RecentTruck[]
  recentExits: RecentTruck[]
  loading: boolean
  zoneTrucks: TruckRow[]
  zoneTrucksLoading: boolean
  zoneTrucksError: string | null
  availableZones: ZoneState[]
  busyPlate: string | null
  onRemoveTruck: (plate: string) => void
  onMoveTruck: (plate: string, zoneId: string) => void
  onClear: () => void
  site: 'ricardone' | 'san_lorenzo'
}) {
  const { site, selectedZone, selectedSector, recentEntries, recentExits, loading, zoneTrucks, zoneTrucksLoading, zoneTrucksError, availableZones, busyPlate, onRemoveTruck, onMoveTruck, onClear } = props
  const selected = selectedZone ?? selectedSector
  const [openPlate, setOpenPlate] = useState<string | null>(null)
  /** Acción preparada sobre un camión: nada se aplica hasta confirmar (EV-07). */
  const [pending, setPending] = useState<{ plate: string; action: 'move' | 'remove'; zoneId?: string } | null>(null)
  const siteLabel = site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'
  const zoneLabel = (id?: string) => availableZones.find(z => z.id === id)?.label ?? id ?? ''
  const renderMovements = (title: string, rows: RecentTruck[], direction: 'in' | 'out') => <div className="tf-movement-group">
    <h3><span className={direction === 'in' ? 'is-in' : 'is-out'}>{direction === 'in' ? '↓' : '↑'}</span>{title}</h3>
    {rows.length ? <ol className="tf-recent-trucks">{rows.slice(0, selected ? 3 : 6).map((truck, index) => <li key={`${direction}-${truck.siteLabel}-${truck.plate}`} style={{ animationDelay: `${index * 90}ms` }}>
      <span className={`tf-recent-trucks__dot ${direction === 'out' ? 'is-out' : ''}`} />
      <div><strong>{truck.plate}</strong><small>{truck.siteLabel} · {truck.circuitLabel ?? truck.circuit ?? 'circuito sin confirmar'}</small></div>
      <time>{truck.minutesSinceLastDetection == null ? 'ahora' : truck.minutesSinceLastDetection < 1 ? 'ahora' : `${Math.round(truck.minutesSinceLastDetection)} min`}</time>
    </li>)}</ol> : <p className="tf-map-context__empty">Sin detecciones recientes.</p>}
  </div>
  return (
    <aside className="tf-map-context" aria-live="polite">
      {selected ? <>
        <div className="tf-map-context__head">
          <div>
            <span className="tf-map-context__eyebrow">{site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'} · sector seleccionado</span>
            <h2>{selected.label}</h2>
          </div>
          <button type="button" onClick={onClear} aria-label="Cerrar detalle">×</button>
        </div>
        <div className="tf-map-context__status"><span style={{ background: STATUS_DOT[selected.status] }} />{ZONE_STATUS_LABEL[selected.status]}</div>
        <dl className="tf-map-context__metrics">
          {selectedZone ? <>
            <div><dt>Esperando</dt><dd>{selectedZone.entryBlind ? 'sin dato' : `${selectedZone.backlogInferred ? '≈' : ''}${selectedZone.backlog}`}</dd></div>
            <div><dt>Tiempo estimado</dt><dd>{formatDrainMinutes(selectedZone.drainMinutes) ?? 'sin dato'}</dd></div>
            <div><dt>Tasa efectiva</dt><dd>{selectedZone.drainRatePerHour == null ? 'sin dato' : `${selectedZone.drainRatePerHour}/h`}</dd></div>
            <div><dt>Capacidad</dt><dd>{selectedZone.entryBlind || selectedZone.capacityOperational == null ? 'sin dato' : `${selectedZone.backlog}/${selectedZone.capacityOperational}`}</dd></div>
          </> : selectedSector ? <>
            <div><dt>Presentes</dt><dd>{selectedSector.present}</dd></div>
            <div><dt>Ingresos / h</dt><dd>{selectedSector.in60}</dd></div>
            <div><dt>Ritmo</dt><dd>{selectedSector.rate60}/h</dd></div>
            <div><dt>Estadía P90</dt><dd>{formatMinutes(selectedSector.dwellP90Min)}</dd></div>
          </> : null}
        </dl>
        {selectedZone ? <section className="tf-zone-trucks" aria-label={`Camiones en ${selectedZone.label}`}>
          <div className="tf-zone-trucks__title">
            <h3>Patentes en esta playa</h3>
            <span>{zoneTrucksLoading ? 'actualizando…' : `${zoneTrucks.length} ${zoneTrucks.length === 1 ? 'camión' : 'camiones'}${zoneTrucks.length !== selectedZone.backlog && !selectedZone.entryBlind ? ` (el conteo de la zona dice ${selectedZone.backlog}; se actualizan por separado)` : ''}`}</span>
          </div>
          {zoneTrucksError ? <p className="tf-zone-trucks__error">{zoneTrucksError}</p> : null}
          {!zoneTrucksLoading && !zoneTrucks.length && !zoneTrucksError ? <p className="tf-map-context__empty">No hay camiones asignados a esta zona.</p> : null}
          {zoneTrucks.length ? <ol className={`tf-zone-trucks__list${zoneTrucksLoading ? ' is-loading' : ''}`}>{zoneTrucks.map(truck => <li key={truck.plate}>
            <div className="tf-zone-trucks__identity">
              <button type="button" className="font-mono font-bold underline decoration-dotted underline-offset-2" onClick={() => setOpenPlate(openPlate === truck.plate ? null : truck.plate)} title="Ver sus últimos pasos y fotos">
                {truck.plate} {openPlate === truck.plate ? '▾' : '▸'}
              </button>
              <small>{truck.dwellSectorMin == null ? 'sin tiempo' : `${Math.round(truck.dwellSectorMin)} min en zona`}</small>
            </div>
            <label>
              <span className="sr-only">Destino para reubicar {truck.plate}</span>
              <select value={pending?.plate === truck.plate && pending.action === 'move' ? pending.zoneId : selectedZone.id} disabled={busyPlate === truck.plate || zoneTrucksLoading} onChange={event => setPending(event.target.value === selectedZone.id ? null : { plate: truck.plate, action: 'move', zoneId: event.target.value })} aria-label={`Destino para reubicar ${truck.plate}`}>
                {availableZones.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
              </select>
            </label>
            <button type="button" className="tf-zone-trucks__remove" disabled={busyPlate === truck.plate || zoneTrucksLoading} onClick={() => setPending({ plate: truck.plate, action: 'remove' })}>Quitar…</button>
            {pending?.plate === truck.plate ? <div className="tf-zone-trucks__confirm" role="group" aria-label="Confirmar cambio">
              <span>{pending.action === 'move' ? `Reubicar ${truck.plate} (${siteLabel}): ${selectedZone.label} → ${zoneLabel(pending.zoneId)}` : `Quitar ${truck.plate} del estado de planta de ${siteLabel} (${selectedZone.label}). No borra registros de cámara.`}</span>
              <button type="button" disabled={busyPlate === truck.plate} onClick={() => { if (pending.action === 'move' && pending.zoneId) onMoveTruck(truck.plate, pending.zoneId); else onRemoveTruck(truck.plate); setPending(null) }}>{pending.action === 'move' ? 'Reubicar' : 'Quitar del estado de planta'}</button>
              <button type="button" onClick={() => setPending(null)}>Cancelar</button>
            </div> : null}
            {openPlate === truck.plate ? <div className="tf-zone-trucks__steps"><TruckSteps site={site} plate={truck.plate} /></div> : null}
          </li>)}</ol> : null}
          <p className="tf-map-context__note">Tocá la patente para ver sus últimos pasos y fotos. Elegir otra zona o «Quitar…» prepara el cambio; se aplica recién al confirmarlo.</p>
        </section> : <div className="tf-map-context__movements">
          {renderMovements('Últimos ingresos', recentEntries, 'in')}
          {renderMovements('Últimos egresos', recentExits, 'out')}
        </div>}
      </> : <>
        <div className="tf-map-context__head">
          <div>
            <span className="tf-map-context__eyebrow">Movimiento en planta</span>
            <h2>Ingresos recientes</h2>
          </div>
          <span className="tf-map-context__live">En vivo</span>
        </div>
        {loading ? <p className="tf-map-context__empty">Actualizando ingresos…</p> : renderMovements('Últimos ingresos', recentEntries, 'in')}
        <p className="tf-map-context__note">Al seleccionar un sector, este panel muestra su estado operativo.</p>
      </>}
    </aside>
  )
}

const STATUS_DOT: Record<SectorStatus, string> = {
  normal: '#22C55E',
  attention: '#F59E0B',
  critical: '#DC2626',
  no_data: '#94A3B8',
}

function formatMinutes(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min)) return null
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h <= 0) return `${m}m`
  return `${h}h${String(m).padStart(2, '0')}`
}

function formatAge(lastUpdateMs: number | null): string {
  if (lastUpdateMs == null) return 'sin dato'
  const sec = Math.max(0, Math.round((Date.now() - lastUpdateMs) / 1000))
  if (sec < 60) return `hace ${sec} s`
  const min = Math.floor(sec / 60)
  return `hace ${min} min`
}

export function PlantHome() {
  const ricLive = useLivePlantState('ricardone')
  const slLive = useLivePlantState('san_lorenzo')
  const [scope, setScope] = useState<'ricardone' | 'san_lorenzo' | 'both'>('ricardone')
  const [view, setView] = useState<'plano' | 'colas' | 'actividad' | 'identificacion'>('plano')
  const [zoneSearch, setZoneSearch] = useState('')
  const [onlyAttention, setOnlyAttention] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const [layouts, setLayouts] = useState<Record<'ricardone' | 'san_lorenzo', PlantLayout | null>>({ ricardone: null, san_lorenzo: null })
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedMapSite, setSelectedMapSite] = useState<'ricardone' | 'san_lorenzo'>('ricardone')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [cameraGroup, setCameraGroup] = useState<{ label: string; devices: string[]; site?: 'ricardone' | 'san_lorenzo' } | null>(null)
  const [recentEntries, setRecentEntries] = useState<RecentTruck[]>([])
  const [recentExits, setRecentExits] = useState<RecentTruck[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [zoneTrucks, setZoneTrucks] = useState<TruckRow[]>([])
  const [zoneTrucksLoading, setZoneTrucksLoading] = useState(false)
  const [zoneTrucksError, setZoneTrucksError] = useState<string | null>(null)
  const [busyPlate, setBusyPlate] = useState<string | null>(null)
  const [zoneRefreshKey, setZoneRefreshKey] = useState(0)
  const [flowPulse, setFlowPulse] = useState({ ingress: 0, egress: 0 })
  const previousFlow = useRef<{ scope: string; ingress: number; egress: number } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const zoneTrucksFor = useRef<string | null>(null)
  // La lista de camiones de la zona se vuelve a pedir con cada estado nuevo de su planta (EV-27).
  const selectedSiteUpdate = (selectedMapSite === 'ricardone' ? ricLive : slLive).lastUpdateMs

  useEffect(() => {
    let cancelled = false
    Promise.all((['ricardone', 'san_lorenzo'] as const).map(async site => {
      const response = await fetch(`/plant/${site}/plantZones.json`)
      if (!response.ok) throw new Error(String(response.status))
      return [site, await response.json() as PlantLayout] as const
    })).then(entries => { if (!cancelled) setLayouts(Object.fromEntries(entries) as Record<'ricardone' | 'san_lorenzo', PlantLayout>) })
      .catch(() => { if (!cancelled) setLayoutError(true) })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setInterval> | undefined
    const load = async () => {
      const sites = (scope === 'both' ? ['ricardone', 'san_lorenzo'] : [scope]) as ('ricardone' | 'san_lorenzo')[]
      const lists = await Promise.allSettled(sites.flatMap(site => {
        const points = layouts[site]?.points ?? []
        const ingress = points.find(point => point.id === 'S0')?.sectorCode
        const exits = [...new Set(points.filter(point => point.id === 'S3' || point.id === 'S10').map(point => point.sectorCode).filter(Boolean))]
        const siteLabel = site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'
        return [
          ingress ? getSectorTrucks(site, ingress, 'dwell').then(result => ({ kind: 'in' as const, rows: result.trucks.map(truck => ({ ...truck, siteLabel })) })) : Promise.resolve({ kind: 'in' as const, rows: [] as RecentTruck[] }),
          ...exits.map(exit => getSectorTrucks(site, exit, 'dwell').then(result => ({ kind: 'out' as const, rows: result.trucks.map(truck => ({ ...truck, siteLabel })) }))),
        ]
      }))
      if (cancelled) return
      const groups = lists.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
      const sortRecent = (rows: RecentTruck[]) => rows
        .sort((a, b) => (a.minutesSinceLastDetection ?? Number.MAX_SAFE_INTEGER) - (b.minutesSinceLastDetection ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6)
      setRecentEntries(sortRecent(groups.filter(group => group.kind === 'in').flatMap(group => group.rows)))
      setRecentExits(sortRecent(groups.filter(group => group.kind === 'out').flatMap(group => group.rows)))
      setRecentLoading(false)
    }
    setRecentLoading(true)
    void load()
    timer = setInterval(() => { void load() }, 15_000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [scope, layouts])

  useEffect(() => {
    let cancelled = false
    if (!selectedZoneId) {
      setZoneTrucks([])
      setZoneTrucksError(null)
      return
    }
    setZoneTrucksLoading(true)
    setZoneTrucksError(null)
    if (zoneTrucksFor.current !== `${selectedMapSite}:${selectedZoneId}`) setZoneTrucks([])
    zoneTrucksFor.current = `${selectedMapSite}:${selectedZoneId}`
    getZoneTrucks(selectedMapSite, selectedZoneId)
      .then(result => { if (!cancelled) setZoneTrucks(result.trucks) })
      .catch(error => { if (!cancelled) setZoneTrucksError(error instanceof Error ? error.message : String(error)) })
      .finally(() => { if (!cancelled) setZoneTrucksLoading(false) })
    return () => { cancelled = true }
  }, [selectedMapSite, selectedZoneId, zoneRefreshKey, selectedSiteUpdate])

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const selectedLive = scope === 'san_lorenzo' ? slLive : ricLive
  const status = scope === 'both'
    ? (ricLive.status === 'error' && slLive.status === 'error' ? 'error' : ricLive.status === 'live' && slLive.status === 'live' ? 'live' : ricLive.snapshot || slLive.snapshot ? 'stale' : 'connecting')
    : selectedLive.status
  const combinedUpdates = [ricLive.lastUpdateMs, slLive.lastUpdateMs].filter((value): value is number => value != null)
  const lastUpdateMs = scope === 'both' ? (combinedUpdates.length ? Math.min(...combinedUpdates) : null) : selectedLive.lastUpdateMs
  const loading = scope === 'both' ? !ricLive.snapshot && !slLive.snapshot : selectedLive.snapshot == null && status === 'connecting'
  const selectedPlant = selectedLive.snapshot?.plant
  const plant = scope === 'both' ? {
    trucksInPlant: (ricLive.snapshot?.plant.trucksInPlant ?? 0) + (slLive.snapshot?.plant.trucksInPlant ?? 0),
    inflow60: (ricLive.snapshot?.plant.inflow60 ?? 0) + (slLive.snapshot?.plant.inflow60 ?? 0),
    outflow60: (ricLive.snapshot?.plant.outflow60 ?? 0) + (slLive.snapshot?.plant.outflow60 ?? 0),
    balance60: (ricLive.snapshot?.plant.balance60 ?? 0) + (slLive.snapshot?.plant.balance60 ?? 0),
    dwellP90Min: Math.max(ricLive.snapshot?.plant.dwellP90Min ?? 0, slLive.snapshot?.plant.dwellP90Min ?? 0),
    dwellAvgMin: Math.max(ricLive.snapshot?.plant.dwellAvgMin ?? 0, slLive.snapshot?.plant.dwellAvgMin ?? 0),
    bottleneck: [ricLive.snapshot?.plant.bottleneck, slLive.snapshot?.plant.bottleneck].filter(Boolean).sort((a, b) => (b?.drainMinutes ?? 0) - (a?.drainMinutes ?? 0))[0] ?? null,
  } : selectedPlant
  useEffect(() => {
    if (!plant || scope === 'both') return
    const previous = previousFlow.current
    if (previous?.scope === scope) {
      setFlowPulse(current => ({
        ingress: plant.inflow60 > previous.ingress ? current.ingress + 1 : current.ingress,
        egress: plant.outflow60 > previous.egress ? current.egress + 1 : current.egress,
      }))
    }
    previousFlow.current = { scope, ingress: plant.inflow60, egress: plant.outflow60 }
  }, [scope, plant?.inflow60, plant?.outflow60])
  const dwellP90 = formatMinutes(plant?.dwellP90Min ?? null)
  const dwellAvg = formatMinutes(plant?.dwellAvgMin ?? null)

  const clock = new Date(nowTick)
  const clockTime = clock.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const clockDate = clock.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  // Cada zona lleva su planta: los identificadores pueden repetirse entre Ricardone y San Lorenzo (EV-03).
  type SiteZone = ZoneState & { site: 'ricardone' | 'san_lorenzo' }
  const tag = (site: 'ricardone' | 'san_lorenzo', list?: ZoneState[]): SiteZone[] => (list ?? []).map(z => ({ ...z, site }))
  const zones: SiteZone[] = scope === 'both' ? [...tag('ricardone', ricLive.snapshot?.zones), ...tag('san_lorenzo', slLive.snapshot?.zones)] : tag(scope, selectedLive.snapshot?.zones)
  const layout = layouts[selectedMapSite]
  const visibleSites = useMemo<('ricardone' | 'san_lorenzo')[]>(() => scope === 'both' ? ['ricardone', 'san_lorenzo'] : [scope], [scope])
  const selectedSector = (selectedMapSite === 'ricardone' ? ricLive.snapshot : slLive.snapshot)?.sectors.find(item => item.sectorCode === selected) ?? null
  const selectedLiveZone = (selectedMapSite === 'ricardone' ? ricLive.snapshot : slLive.snapshot)?.zones.find(item => item.id === selectedZoneId) ?? null
  const selectedZone = layout?.zones.find((z) => z.zoneId === selectedZoneId)
  const availableZones = (selectedMapSite === 'ricardone' ? ricLive.snapshot : slLive.snapshot)?.zones ?? []

  const applyTruckCorrection = async (plate: string, correction: { action: 'remove' } | { action: 'move'; zoneId: string }) => {
    setBusyPlate(plate)
    setZoneTrucksError(null)
    try {
      await correctTruckLocation(selectedMapSite, plate, correction)
      setZoneTrucks(current => current.filter(truck => truck.plate !== plate))
      setZoneRefreshKey(key => key + 1)
    } catch (error) {
      setZoneTrucksError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyPlate(null)
    }
  }
  /** Una zona sin `cameraGroups` se comporta como un único grupo con todas sus cámaras. */
  const cameraGroups =
    selectedZone?.cameraGroups?.filter((g) => g.devices.length > 0) ??
    (selectedZone && selectedZone.cameras.length > 0
      ? [{ label: selectedZone.label, devices: selectedZone.cameras }]
      : [])
  /** Al elegir una zona se abre el detalle del punto que la drena: ahí está el problema. */
  const pickZone = (site: 'ricardone' | 'san_lorenzo', zoneId: string) => {
    setSelectedMapSite(site)
    setSelectedZoneId(zoneId)
    const zone = zones.find((z) => z.site === site && z.id === zoneId)
    setSelected(zone?.drainPoints?.[0]?.sectorCode ?? null)
  }
  const siteName = (site: 'ricardone' | 'san_lorenzo') => site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'
  const contextPanel = <MapContextPanel selectedZone={selectedLiveZone} selectedSector={selectedSector} recentEntries={recentEntries} recentExits={recentExits} loading={recentLoading} zoneTrucks={zoneTrucks} zoneTrucksLoading={zoneTrucksLoading} zoneTrucksError={zoneTrucksError} availableZones={availableZones} busyPlate={busyPlate} onRemoveTruck={(plate) => void applyTruckCorrection(plate, { action: 'remove' })} onMoveTruck={(plate, zoneId) => void applyTruckCorrection(plate, { action: 'move', zoneId })} onClear={() => { setSelected(null); setSelectedZoneId(null) }} site={selectedMapSite} />
  const alertZones = zones.filter(z => z.status === 'critical' || z.status === 'attention')
  usePublishAnalysis({ mode: 'live', site: scope, sector: selected, zone: selectedZoneId, label: selectedLiveZone?.label })

  const openCameraGroup = (group: { label: string; devices: string[] }) => {
    if (group.devices.length > 0) setCameraGroup({ ...group, site: selectedMapSite })
  }

  return (
    <section className="tf-ui tf-home space-y-2 pb-6">
      <div className="tf-overview">
      {/* Encabezado operativo: identidad, estado y tiempo en una sola lectura. */}
      <header className="tf-home-hero">
        <div className="tf-home-hero__identity">
          <p className="tf-home-eyebrow">Centro de control operativo</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1>{scope === 'ricardone' ? 'Ricardone' : scope === 'san_lorenzo' ? 'San Lorenzo' : 'Vista combinada'}</h1>
            <span className={`tf-live-badge tf-live-badge--${status}`}>
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  background:
                    status === 'live' ? '#16A34A' : status === 'stale' ? '#D97706' : status === 'error' ? '#DC2626' : '#94A3B8',
                }}
              />
              {status === 'live' ? 'Operando en vivo' : status === 'stale' ? 'Datos demorados' : status === 'error' ? 'Sin conexión' : 'Conectando…'}
            </span>
          </div>
          <p className="tf-home-subtitle">
            Estado de planta, colas y evidencia de cámaras
            {lastUpdateMs != null ? ` · pantalla actualizada ${formatAge(lastUpdateMs)}` : ''}
          </p>
          {/* EV-35: la frescura de cada fuente de cámaras, separada de la conexión de la pantalla. */}
          <p className="tf-home-subtitle tf-source-freshness">
            {visibleSites.map(site => {
              const src = (site === 'ricardone' ? ricLive : slLive).snapshot?.source
              if (!src) return null
              const last = src.lastEventAt ? Date.parse(src.lastEventAt) : null
              const lag = last == null ? null : Math.round((nowTick - last) / 60000)
              return <span key={site} className={src.lastError ? 'is-down' : lag != null && lag > 15 ? 'is-stale' : ''}>
                {siteName(site)}: {src.lastError ? 'la fuente de cámaras no responde' : last == null ? 'sin eventos de cámara' : `último evento de cámara ${lag != null && lag < 1 ? 'hace menos de 1 min' : `hace ${lag} min`}`}
              </span>
            })}
          </p>
        </div>
        <div className="tf-site-switcher" role="group" aria-label="Planta visible">
          {([['ricardone', 'Ricardone'], ['san_lorenzo', 'San Lorenzo'], ['both', 'Ambas']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={scope === id} onClick={() => { setScope(id); if (id !== 'both') setSelectedMapSite(id); setSelected(null); setSelectedZoneId(null) }} className={scope === id ? 'is-active' : ''}>{label}</button>)}
        </div>
        <div className="tf-home-clock" aria-label={`Hora local ${clockTime}, ${clockDate}`}>
          <span>{clockTime}</span>
          <small>{clockDate}</small>
        </div>
      </header>

      {/* Resumen de decisión */}
      <div className="tf-kpi-grid">
          <KpiCard label="Camiones en planta" loading={loading} value={plant ? String(plant.trucksInPlant) : null} />
          <KpiCard label="Ingresos / h" loading={loading} value={plant ? String(plant.inflow60) : null} />
          <KpiCard label="Egresos / h" loading={loading} value={plant ? String(plant.outflow60) : null} />
          <KpiCard
            label="Cuello de botella"
            loading={loading}
            value={plant?.bottleneck ? plant.bottleneck.label : plant ? 'Sin cola' : null}
            hint={plant?.bottleneck ? `${plant.bottleneck.backlog} esperando · ${formatDrainMinutes(plant.bottleneck.drainMinutes) ?? 'sin tiempo estimado'}` : null}
          />
          <KpiCard label="Estadía P90" loading={loading} value={dwellP90} hint={dwellAvg ? `Media ${dwellAvg}` : null} />
      </div>
      </div>

      {status === 'stale' ? (
        <div className="tf-freshness-warning" role="status">
          <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: '#D97706' }}
          />
          La lectura puede no reflejar la operación actual.
        </span>
        </div>
      ) : null}

      {status === 'error' ? <p className="ui-message ui-message--error" role="alert">Sin conexión con el estado de planta. {selectedLive.snapshot ? 'Se conserva la última lectura recibida.' : 'Sin dato disponible.'} La reconexión es automática.</p> : null}
      <nav className="ui-section-nav tf-view-switcher" aria-label="Vistas de planta">
        {([{ id: 'plano', label: 'Supervisión', detail: 'Plano y puntos de control' }, { id: 'colas', label: 'Zonas de espera', detail: 'Ocupación y camiones' }, { id: 'actividad', label: 'Cámaras y capturas', detail: 'Acceso directo a cada punto' }, { id: 'identificacion', label: 'Revisión de patentes', detail: 'Resolver identificaciones' }] as const).map(item => (
          <Button key={item.id} primary={view === item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}><strong>{item.label}</strong><small>{item.detail}</small></Button>
        ))}
      </nav>
      {view !== 'identificacion' ? <IdentificationPanel sites={visibleSites} mode="monitor" onOpen={() => setView('identificacion')} /> : null}
      {view !== 'identificacion' ? <div className="tf-operations-workspace">
        <main className="tf-operations-main">
          <section className={"tf-operations-panel" + (view === 'plano' ? ' is-supervision' : '')}>
            <header className="tf-operations-heading">
              <div><span className="tf-home-eyebrow">{scope === 'both' ? 'Supervisión de ambas plantas' : siteName(scope)}</span><h2>{view === 'plano' ? 'La operación, de un vistazo' : view === 'colas' ? 'Zonas de espera' : 'Puntos de cámara'}</h2><p>{view === 'plano' ? 'Seleccioná una zona para ver sus camiones o una cámara para abrirla.' : view === 'colas' ? 'Elegí una zona. Su ocupación, camiones y cámaras se abren a la derecha.' : 'Abrí un punto de control. Las capturas recientes siguen visibles a la derecha.'}</p></div>
              <span className="tf-operations-count">{view === 'actividad' ? 'Acceso a transmisiones' : zones.length + ' zonas'}</span>
            </header>
            {view === 'plano' ? <div className="tf-supervision-maps">
              {visibleSites.map(site => <section key={site} className="tf-supervision-map">
                <div className="tf-map-label"><strong>{siteName(site)}</strong><span>{(site === 'ricardone' ? ricLive : slLive).snapshot?.plant.trucksInPlant ?? '—'} camiones en planta</span></div>
                {layouts[site] ? <PlantMap layout={layouts[site]!} site={site} showCircuitControls={false} align="center" flowPulse={scope === 'both' ? { ingress: 0, egress: 0 } : flowPulse} zones={(site === 'ricardone' ? ricLive : slLive).snapshot?.zones ?? []} selectedSector={selectedMapSite === site ? selected : null}
                  onSelectSector={sectorCode => { setSelectedMapSite(site); setSelected(sectorCode) }}
                  onSelectZone={zoneId => { setSelectedMapSite(site); setSelectedZoneId(zoneId || null) }}
                  onOpenCameras={group => setCameraGroup({ ...group, site })} /> : <p className="tf-empty-state">{layoutError ? 'No se pudo cargar el plano. Las zonas y cámaras siguen disponibles en sus vistas.' : 'Cargando plano…'}</p>}
              </section>)}
            </div> : null}
            {view === 'actividad' ? <div className="tf-camera-directory">
              {visibleSites.flatMap(site => (layouts[site]?.points ?? []).filter(point => point.cameraGroup.devices.length).map(point => <button type="button" className="tf-camera-tile" key={site + ':' + point.id} onClick={() => setCameraGroup({ ...point.cameraGroup, label: point.label, site })}>
                <span className="tf-camera-tile__screen" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="6" width="14" height="12" rx="3"/><path d="m16 10 6-3v10l-6-3"/></svg><span>Abrir cámaras ↗</span></span>
                <span className="tf-camera-tile__info"><small>{siteName(site)}</small><strong>{point.label}</strong><span>{point.cameraGroup.devices.length} {point.cameraGroup.devices.length === 1 ? 'cámara' : 'cámaras'} · {point.id}</span></span>
              </button>))}
              {!visibleSites.some(site => layouts[site]?.points?.some(point => point.cameraGroup.devices.length)) ? <p className="tf-empty-state">{layoutError ? 'No se pudo cargar el catálogo de cámaras.' : 'Cargando puntos de cámara…'}</p> : null}
            </div> : <>
              <div className="tf-zone-toolbar"><h3>{view === 'plano' ? 'Acceso rápido a zonas' : 'Buscar una zona'}</h3><div><input aria-label="Buscar zona" placeholder="Buscar zona…" value={zoneSearch} onChange={e => setZoneSearch(e.target.value)} /><button type="button" aria-pressed={onlyAttention} className={onlyAttention ? 'is-active' : ''} onClick={() => setOnlyAttention(v => !v)}>En atención ({alertZones.length})</button></div></div>
              <div className="tf-zone-cards">
                {zones.filter(z => (!onlyAttention || z.status === 'critical' || z.status === 'attention') && (z.label + ' ' + siteName(z.site)).toLowerCase().includes(zoneSearch.toLowerCase())).map(z => <button type="button" key={z.site + ':' + z.id} className={'tf-zone-card ' + (selectedMapSite === z.site && selectedZoneId === z.id ? 'is-selected' : '')} aria-pressed={selectedMapSite === z.site && selectedZoneId === z.id} onClick={() => pickZone(z.site, z.id)}>
                  <span className="tf-zone-card__top"><small>{siteName(z.site)}</small><span className={'tf-zone-status is-' + z.status}><i style={{background: STATUS_DOT[z.status]}} />{z.status === 'no_data' ? 'Estado sin evaluar' : ZONE_STATUS_LABEL[z.status]}</span></span>
                  <strong>{z.label}</strong><span className="tf-zone-card__occupancy"><b>{z.entryBlind ? '—' : (z.backlogInferred ? '≈' : '') + z.backlog}</b><span>{z.entryBlind ? 'Ocupación sin dato' : 'camiones esperando'}</span></span>
                  <span className="tf-zone-card__bottom"><span>{z.capacityOperational != null ? 'Capacidad ' + z.capacityOperational : 'Capacidad sin definir'}</span><span>Ver detalle →</span></span>
                </button>)}
                {!loading && !zones.some(z => (!onlyAttention || z.status === 'critical' || z.status === 'attention') && (z.label + ' ' + siteName(z.site)).toLowerCase().includes(zoneSearch.toLowerCase())) ? <div className="tf-empty-state">No hay zonas que coincidan con estos filtros. <button type="button" onClick={() => { setZoneSearch(''); setOnlyAttention(false) }}>Ver todas las zonas</button></div> : null}
                {loading ? <p className="tf-empty-state">Cargando estado de zonas…</p> : null}
              </div>
            </>}
          </section>
        </main>
        <aside className="tf-operations-rail" aria-label="Detalle y actividad operativa">
          {view !== 'actividad' ? <>
            <div key={selectedMapSite + ':' + selectedZoneId + ':' + selected}>{contextPanel}</div>
            {selectedZoneId && cameraGroups.length ? <section className="tf-zone-camera-links"><h3>Cámaras de {selectedLiveZone?.label ?? selectedZone?.label}</h3>{cameraGroups.map(group => <button key={group.label} type="button" onClick={() => openCameraGroup(group)}>{group.label}<span>Abrir ↗</span></button>)}</section> : null}
          </> : null}
          <LiveActivityFeed sites={visibleSites} onOpenCase={() => setView('identificacion')} />
        </aside>
      </div> : <>
        <p className={'tf-watch-strip' + (alertZones.length ? ' has-alerts' : '')} role="status">{alertZones.length ? alertZones.length + ' zonas requieren atención' : 'Supervisión de zonas · ' + formatAge(lastUpdateMs)}<button type="button" onClick={() => setView('plano')}>Volver a supervisión</button> <PinnedCameras /></p>
        <IdentificationPanel sites={visibleSites} />
      </>}
      <LiveCameraPlayerModal
        open={cameraGroup != null}
        devices={cameraGroup?.devices ?? null}
        title={cameraGroup ? `${siteName(cameraGroup.site ?? selectedMapSite)} · ${cameraGroup.label}` : undefined}
        onClose={() => setCameraGroup(null)}
      />
    </section>
  )
}
