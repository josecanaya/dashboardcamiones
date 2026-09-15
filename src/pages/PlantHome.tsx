import { useEffect, useState } from 'react'
import { Button, MetricCard as KpiCard } from '../components/ui/Interface'
import './plantHome.css'
import { LiveCameraPlayerModal } from '../components/plant/LiveCameraPlayerModal'
import { PlantMap } from '../components/plant/PlantMap'
import { SectorPanel } from '../components/plant/SectorPanel'
import { NvaiPanel } from '../components/nvai/NvaiPanel'
import type { PlantLayout } from '../data/plantZones.types'
import type { ZoneState } from '../services/live/plantStateApi'
import { formatDrainMinutes } from '../services/live/plantStateApi'

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
  const { snapshot, status, lastUpdateMs } = useLivePlantState('ricardone')
  const [view, setView] = useState<'plano' | 'colas' | 'actividad'>('plano')
  const [layoutError, setLayoutError] = useState(false)
  const [layout, setLayout] = useState<PlantLayout | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null)
  const [cameraGroup, setCameraGroup] = useState<{ label: string; devices: string[] } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    fetch('/plant/ricardone/plantZones.json')
      .then((r) => r.json())
      .then((data: PlantLayout) => {
        if (!cancelled) setLayout(data)
      })
      .catch(() => {
        if (!cancelled) { setLayout(null); setLayoutError(true) }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000)
    return () => clearInterval(t)
  }, [])

  const loading = snapshot == null && status === 'connecting'
  const plant = snapshot?.plant
  const sectors: SectorState[] = snapshot?.sectors ?? []
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

  const zones: ZoneState[] = snapshot?.zones ?? []
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
    <section className="tf-ui tf-home space-y-4 pb-4">
      {/* Barra de estado del home */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <span className="text-sm font-semibold text-slate-800">En vivo</span>
        <span className="h-5 w-px bg-slate-200" />
        <span className="inline-flex items-center gap-2 text-xs text-slate-500">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background:
                status === 'live' ? '#22C55E' : status === 'stale' ? '#F59E0B' : status === 'error' ? '#DC2626' : '#94A3B8',
            }}
          />
          {status === 'live'
            ? 'Planta en vivo'
            : status === 'stale'
              ? 'Dato demorado'
              : status === 'error'
                ? 'Sin conexión'
                : 'Conectando…'}
        </span>
        {status === 'stale' ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
            Última actualización {formatAge(lastUpdateMs)}
          </span>
        ) : null}
        <div className="flex-1" />
        <span className="font-mono text-base font-semibold tabular-nums text-slate-800">{clockTime}</span>
        <span className="text-[11.5px] text-slate-400">{clockDate}</span>
      </div>

      {/* Título + KPI */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[34px] font-extrabold tracking-tight text-slate-900">Ricardone</h1>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                status === 'live'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : status === 'stale'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              {status === 'live' ? 'En vivo' : status === 'stale' ? 'Demorado' : status === 'error' ? 'Error' : 'Conectando'}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] text-slate-400">
            Operación en tiempo real
            {lastUpdateMs != null ? ` · datos ${formatAge(lastUpdateMs)}` : ''}
          </p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-3">
          <KpiCard
            label="Camiones en planta"
            loading={loading}
            value={plant ? String(plant.trucksInPlant) : null}
          />
          <KpiCard
            label="Ingresos / h"
            loading={loading}
            value={plant ? String(plant.inflow60) : null}
          />
          <KpiCard
            label="Egresos / h"
            loading={loading}
            value={plant ? String(plant.outflow60) : null}
          />
          <KpiCard
            label="Cuello de botella"
            loading={loading}
            value={plant?.bottleneck ? plant.bottleneck.label : plant ? 'sin cola' : null}
            hint={
              plant?.bottleneck
                ? `${plant.bottleneck.backlog} esperando · ${formatDrainMinutes(plant.bottleneck.drainMinutes) ?? ''}`
                : null
            }
          />
          <KpiCard
            label="Estadía P90"
            loading={loading}
            value={dwellP90}
            hint={dwellAvg ? `media ${dwellAvg}` : null}
          />
        </div>
      </div>

      {status === 'error' ? <p className="ui-message ui-message--error" role="alert">Sin conexión con el estado de planta. {snapshot ? 'Se conserva la última lectura recibida.' : 'Sin dato disponible.'} La reconexión es automática.</p> : null}
      <nav className="ui-section-nav" aria-label="Vistas de planta">
        {([{ id: 'plano', label: 'Plano y cámaras' }, { id: 'colas', label: 'Colas por zona' }, { id: 'actividad', label: 'Actividad y grupos de cámaras' }] as const).map(item => (
          <Button key={item.id} primary={view === item.id} aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.label}</Button>
        ))}
      </nav>
      {/* Mapa + NVAi: se conserva montado al cambiar de vista. */}
      <div hidden={view !== 'plano'}>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {layout ? (
            <PlantMap
              layout={layout}
              zones={zones}
              selectedSector={selected}
              onSelectSector={setSelected}
              onOpenCameras={(group) => setCameraGroup(group)}
            />
          ) : (
            <div className="flex h-[480px] items-center justify-center rounded-[14px] border border-slate-200 bg-slate-100 text-sm text-slate-500">
              {layoutError ? 'Plano no disponible. Recargá la página para volver a intentar.' : 'Cargando plano…'}
            </div>
          )}
        </div>

        <div className="flex h-[560px] min-h-[320px] flex-col overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4">
          <NvaiPanel
            embedded
            site="ricardone"
            focus={selected ? { sector: selected } : null}
          />
        </div>
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
      {selected ? (
        <SectorPanel
          site="ricardone"
          sectorCode={selected}
          sectorFromSnapshot={sectors.find((s) => s.sectorCode === selected) ?? null}
          onClose={() => setSelected(null)}
          onOpenCamera={(device) => setCameraGroup({ label: device, devices: [device] })}
        />
      ) : null}

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
