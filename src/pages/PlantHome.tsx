import { useEffect, useState } from 'react'
import { Button, MetricCard as KpiCard } from '../components/ui/Interface'
import './plantHome.css'
import { LiveCameraPlayerModal } from '../components/plant/LiveCameraPlayerModal'
import { PlantMap } from '../components/plant/PlantMap'
import type { PlantLayout } from '../data/plantZones.types'
import type { TruckRow, ZoneState } from '../services/live/plantStateApi'
import { formatDrainMinutes, getSectorTrucks } from '../services/live/plantStateApi'

const ZONE_ROW: Record<string, string> = {
  normal: '',
  attention: 'bg-amber-50/60',
  critical: 'bg-rose-50/70',
  no_data: 'bg-slate-50',
}

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
  recent: RecentTruck[]
  loading: boolean
  onClear: () => void
}) {
  const { selectedZone, selectedSector, recent, loading, onClear } = props
  const selected = selectedZone ?? selectedSector
  return (
    <aside className="tf-map-context" aria-live="polite">
      {selected ? <>
        <div className="tf-map-context__head">
          <div>
            <span className="tf-map-context__eyebrow">Sector seleccionado</span>
            <h2>{selected.label}</h2>
          </div>
          <button type="button" onClick={onClear} aria-label="Cerrar detalle">×</button>
        </div>
        <div className="tf-map-context__status"><span style={{ background: STATUS_DOT[selected.status] }} />{ZONE_STATUS_LABEL[selected.status]}</div>
        <dl className="tf-map-context__metrics">
          {selectedZone ? <>
            <div><dt>Esperando</dt><dd>{selectedZone.backlog}</dd></div>
            <div><dt>Tiempo estimado</dt><dd>{formatDrainMinutes(selectedZone.drainMinutes) ?? 'sin dato'}</dd></div>
            <div><dt>Tasa efectiva</dt><dd>{selectedZone.drainRatePerHour == null ? 'sin dato' : `${selectedZone.drainRatePerHour}/h`}</dd></div>
            <div><dt>Capacidad</dt><dd>{selectedZone.capacityOperational == null ? 'sin dato' : `${selectedZone.backlog}/${selectedZone.capacityOperational}`}</dd></div>
          </> : selectedSector ? <>
            <div><dt>Presentes</dt><dd>{selectedSector.present}</dd></div>
            <div><dt>Ingresos / h</dt><dd>{selectedSector.in60}</dd></div>
            <div><dt>Ritmo</dt><dd>{selectedSector.rate60}/h</dd></div>
            <div><dt>Estadía P90</dt><dd>{formatMinutes(selectedSector.dwellP90Min)}</dd></div>
          </> : null}
        </dl>
        <p className="tf-map-context__note">Seleccioná una cámara del mapa para abrir la transmisión en vivo.</p>
      </> : <>
        <div className="tf-map-context__head">
          <div>
            <span className="tf-map-context__eyebrow">Movimiento en planta</span>
            <h2>Ingresos recientes</h2>
          </div>
          <span className="tf-map-context__live">En vivo</span>
        </div>
        {loading ? <p className="tf-map-context__empty">Actualizando ingresos…</p> : recent.length ? (
          <ol className="tf-recent-trucks">
            {recent.map((truck, index) => <li key={`${truck.siteLabel}-${truck.plate}`} style={{ animationDelay: `${index * 90}ms` }}>
              <span className="tf-recent-trucks__dot" />
              <div><strong>{truck.plate}</strong><small>{truck.siteLabel} · {truck.circuitLabel ?? truck.circuit ?? 'circuito sin confirmar'}</small></div>
              <time>{truck.minutesSinceLastDetection == null ? 'ahora' : truck.minutesSinceLastDetection < 1 ? 'ahora' : `${Math.round(truck.minutesSinceLastDetection)} min`}</time>
            </li>)}
          </ol>
        ) : <p className="tf-map-context__empty">No hay ingresos recientes disponibles.</p>}
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

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className ?? 'h-8 w-16'}`} />
}

export function PlantHome() {
  const ricLive = useLivePlantState('ricardone')
  const slLive = useLivePlantState('san_lorenzo')
  const [scope, setScope] = useState<'ricardone' | 'san_lorenzo' | 'both'>('ricardone')
  const [view, setView] = useState<'plano' | 'colas' | 'actividad'>('plano')
  const [layoutError, setLayoutError] = useState(false)
  const [layouts, setLayouts] = useState<Record<'ricardone' | 'san_lorenzo', PlantLayout | null>>({ ricardone: null, san_lorenzo: null })
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedMapSite, setSelectedMapSite] = useState<'ricardone' | 'san_lorenzo'>('ricardone')
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [cameraGroup, setCameraGroup] = useState<{ label: string; devices: string[] } | null>(null)
  const [recentTrucks, setRecentTrucks] = useState<RecentTruck[]>([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [nowTick, setNowTick] = useState(() => Date.now())

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
      const lists = await Promise.allSettled(sites.map(async site => {
        const ingress = layouts[site]?.points?.find((point) => point.id === 'S0')?.sectorCode
        if (!ingress) return []
        const result = await getSectorTrucks(site, ingress, 'dwell')
        return result.trucks.map(truck => ({ ...truck, siteLabel: site === 'ricardone' ? 'Ricardone' : 'San Lorenzo' }))
      }))
      if (cancelled) return
      const rows = lists.flatMap(result => result.status === 'fulfilled' ? result.value : [])
        .sort((a, b) => (a.minutesSinceLastDetection ?? Number.MAX_SAFE_INTEGER) - (b.minutesSinceLastDetection ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 6)
      setRecentTrucks(rows)
      setRecentLoading(false)
    }
    setRecentLoading(true)
    void load()
    timer = setInterval(() => { void load() }, 15_000)
    return () => { cancelled = true; if (timer) clearInterval(timer) }
  }, [scope, layouts])

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

  const zones: ZoneState[] = scope === 'both' ? [...(ricLive.snapshot?.zones ?? []), ...(slLive.snapshot?.zones ?? [])] : selectedLive.snapshot?.zones ?? []
  const layout = layouts[selectedMapSite]
  const visibleSites: ('ricardone' | 'san_lorenzo')[] = scope === 'both' ? ['ricardone', 'san_lorenzo'] : [scope]
  const selectedSector = (selectedMapSite === 'ricardone' ? ricLive.snapshot : slLive.snapshot)?.sectors.find(item => item.sectorCode === selected) ?? null
  const selectedLiveZone = (selectedMapSite === 'ricardone' ? ricLive.snapshot : slLive.snapshot)?.zones.find(item => item.id === selectedZoneId) ?? null
  const selectedZone = layout?.zones.find((z) => z.zoneId === selectedZoneId)
  /** Una zona sin `cameraGroups` se comporta como un único grupo con todas sus cámaras. */
  const cameraGroups =
    selectedZone?.cameraGroups?.filter((g) => g.devices.length > 0) ??
    (selectedZone && selectedZone.cameras.length > 0
      ? [{ label: selectedZone.label, devices: selectedZone.cameras }]
      : [])
  const cameraCount = cameraGroups.reduce((acc, g) => acc + g.devices.length, 0)
  const cameraLabel = selectedZone
    ? `${selectedZone.label} · ${cameraCount > 0 ? `${cameraCount} cámaras` : 'sin cámara'}`
    : 'Elegí una zona'

  /** Al elegir una zona se abre el detalle del punto que la drena: ahí está el problema. */
  const pickZone = (zoneId: string) => {
    setSelectedZoneId(zoneId)
    const zone = zones.find((z) => z.id === zoneId)
    setSelected(zone?.drainPoints?.[0]?.sectorCode ?? null)
  }

  const openCameraGroup = (group: { label: string; devices: string[] }) => {
    if (group.devices.length > 0) setCameraGroup(group)
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
            {lastUpdateMs != null ? ` · actualizado ${formatAge(lastUpdateMs)}` : ''}
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
        {([{ id: 'plano', label: 'Plano y cámaras' }, { id: 'colas', label: 'Colas por zona' }, { id: 'actividad', label: 'Actividad y grupos de cámaras' }] as const).map(item => (
          <Button key={item.id} primary={view === item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</Button>
        ))}
      </nav>
      {/* Mapa + NVAi: se conserva montado al cambiar de vista. */}
      <div hidden={view !== 'plano'}>
      <div className="tf-map-layout">
      <div className={scope === 'both' ? 'grid min-w-0 gap-3 2xl:grid-cols-2' : 'min-w-0'}>
        {visibleSites.map(site => {
          const siteLayout = layouts[site]
          const siteLive = site === 'ricardone' ? ricLive : slLive
          return <div key={site} className="min-w-0">
          {scope === 'both' ? <div className="tf-map-site-label">{site === 'ricardone' ? 'Ricardone' : 'San Lorenzo'}</div> : null}
          {siteLayout ? (
            <PlantMap
              layout={siteLayout}
              site={site}
              compact={scope === 'both'}
              showCircuitControls={false}
              align="left"
              zones={siteLive.snapshot?.zones ?? []}
              selectedSector={selected}
              onSelectSector={(sectorCode) => { setSelectedMapSite(site); setSelected(sectorCode) }}
              onSelectZone={(zoneId) => { setSelectedMapSite(site); setSelectedZoneId(zoneId || null) }}
              onOpenCameras={(group) => setCameraGroup(group)}
            />
          ) : (
            <div className="flex h-[480px] items-center justify-center rounded-[14px] border border-slate-200 bg-slate-100 text-sm text-slate-500">
              {layoutError ? 'Plano no disponible. Recargá la página para volver a intentar.' : 'Cargando plano…'}
            </div>
          )}
        </div>})}
      </div>
      <MapContextPanel selectedZone={selectedLiveZone} selectedSector={selectedSector} recent={recentTrucks} loading={recentLoading} onClear={() => { setSelected(null); setSelectedZoneId(null) }} />
      </div>

      </div>
      <div hidden={view !== 'colas'}>
      {/* Backlog por zona: donde el camión espera y cuánto tarda en salir */}
      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline gap-3 border-b border-slate-200 px-4 py-3">
          <span className="text-[14px] font-semibold text-slate-800">Colas por zona</span>
          <span className="text-[12px] text-slate-400">
            Elegí una zona para revisar el punto de salida, los camiones y sus cámaras.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr>
                {['Zona', 'Esperando', 'Drena por', 'Tasa efectiva', 'Tiempo estimado', 'Espacio', 'Estado'].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-b border-slate-200 px-3 pb-2 text-left text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2" colSpan={7}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                : zones
                    .filter((z) => z.backlog > 0 || z.capacityOperational != null)
                    .map((z) => {
                      const drain = formatDrainMinutes(z.drainMinutes)
                      const targets =
                        z.drainPoints.length > 1
                          ? `${z.drainPoints.length} puntos`
                          : (z.drainPoints[0]?.label ?? '—')
                      return (
                        <tr
                          key={z.id}
                          onClick={() => pickZone(z.id)}
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickZone(z.id) } }}
                          aria-label={`Ver zona ${z.label}`}
                          className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${ZONE_ROW[z.status]} ${
                            selectedZoneId === z.id ? 'ring-1 ring-inset ring-sky-300' : ''
                          }`}
                        >
                          <td className="px-3 py-2 text-[12.5px] text-slate-700">
                            <span className="font-semibold text-slate-900">{z.label}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-[15px] font-semibold tabular-nums text-slate-900">
                            {z.backlog}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-slate-600">{targets}</td>
                          <td className="px-3 py-2 font-mono text-[12px] text-slate-600">
                            {z.drainRatePerHour == null ? (
                              <span className="text-amber-700">sin relevar</span>
                            ) : (
                              <>
                                {z.drainRatePerHour}/h
                                {z.idlePoints.length ? (
                                  <span className="text-slate-400">
                                    {' '}
                                    ({z.idlePoints.length} sin operar)
                                  </span>
                                ) : null}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[13px] font-semibold tabular-nums text-slate-900">
                            {drain ?? <span className="text-slate-400">sin referencia</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-slate-500">
                            {z.capacityOperational == null
                              ? '—'
                              : `${z.backlog} / ${z.capacityOperational}`}
                          </td>
                          <td className="px-3 py-2 text-[12px]">
                            <span style={{ color: STATUS_DOT[z.status] }}>
                              {ZONE_STATUS_LABEL[z.status]}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5 text-[11.5px] text-slate-500">
          Total en planta <span className="font-mono text-slate-800">{plant?.trucksInPlant ?? '—'}</span> — la suma de
          las zonas. La tasa de la balanza de Ricardone es 38/h (1,5 min por pesaje), igual que las de San Lorenzo.
        </div>
      </div>

      </div>
      <div hidden={view !== 'actividad'}>
      {/* Fila inferior */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[13px] font-semibold text-slate-800">Actividad de la última hora</div>
          {loading ? (
            <Skeleton className="mt-4 h-28 w-full" />
          ) : plant ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-slate-500">Ingresos última hora</span>
                <span className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                  {plant.inflow60}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-slate-500">Egresos última hora</span>
                <span className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                  {plant.outflow60}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-slate-500">Balance</span>
                <span className="font-mono text-lg font-semibold tabular-nums text-slate-900">
                  {plant.balance60 > 0 ? `+${plant.balance60}` : String(plant.balance60)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Ingresos, egresos y balance de los últimos 60 minutos.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-400">sin dato</p>
          )}
        </div>

        <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-[13px] font-semibold text-slate-800">Últimas detecciones</div>
          <p className="mt-4 text-sm text-slate-400">sin dato</p>
          <p className="mt-2 text-[11px] text-slate-400">
            Las detecciones individuales no están disponibles en esta vista.
          </p>
        </div>

        <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[13px] font-semibold text-slate-800">Cámaras en vivo</span>
            <span className="font-mono text-[11px] text-slate-400">{cameraLabel}</span>
          </div>
          {cameraGroups.length === 0 ? (
            <div
              className="flex aspect-video w-full items-center justify-center rounded-[10px] border border-[#16243A] text-[11px] text-slate-400"
              style={{ background: '#0B1220' }}
            >
              Elegí una zona de la tabla
            </div>
          ) : (
            <div className="space-y-2">
              {cameraGroups.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => openCameraGroup(group)}
                  className="relative flex aspect-video w-full items-center justify-center rounded-[10px] border border-[#16243A]"
                  style={{ background: '#0B1220' }}
                  aria-label={`Abrir en vivo ${group.label}`}
                >
                  <svg width="34" height="34" viewBox="0 0 26 26" aria-hidden>
                    <rect
                      x="2.5"
                      y="6.5"
                      width="17"
                      height="13"
                      rx="2"
                      stroke="#2B3D55"
                      strokeWidth="1.4"
                      fill="none"
                    />
                    <path d="M19.5 11l4-2.5v9L19.5 15z" stroke="#2B3D55" strokeWidth="1.4" fill="none" />
                  </svg>
                  <span className="absolute bottom-2 left-2 rounded bg-[rgba(12,23,40,.85)] px-2 py-1 text-[10.5px] text-slate-300">
                    {group.label} · {group.devices.length} {group.devices.length === 1 ? 'cámara' : 'cámaras'}
                  </span>
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Abrí una cámara desde el mapa o elegí una zona de la tabla para ver sus grupos.
          </p>
        </div>
      </div>

      </div>
      <LiveCameraPlayerModal
        open={cameraGroup != null}
        devices={cameraGroup?.devices ?? null}
        title={cameraGroup ? `${selectedZone?.label ?? ''} · ${cameraGroup.label}` : undefined}
        onClose={() => setCameraGroup(null)}
      />
    </section>
  )
}
