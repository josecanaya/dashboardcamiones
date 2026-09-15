import { useEffect, useState } from 'react'
import {
  getSectorDetail,
  type SectorDetail,
  type SectorState,
  type SectorStatus,
} from '../../services/live/plantStateApi'
import { KPI_BY_TYPE, KPI_LABELS, TYPE_LABELS, type SectorKpiKey } from './sectorKpiProfile'
import { TrucksTable } from './TrucksTable'

const STATUS_LABEL: Record<SectorStatus, string> = {
  normal: 'Normal',
  attention: 'Atención',
  critical: 'Crítico',
  no_data: 'Sin dato',
}

const STATUS_BADGE: Record<SectorStatus, string> = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  attention: 'border-amber-200 bg-amber-50 text-amber-900',
  critical: 'border-red-200 bg-red-50 text-red-800',
  no_data: 'border-slate-200 bg-slate-50 text-slate-500',
}

function formatMinutes(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return 'sin dato'
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h <= 0) return `${m}′`
  return `${h}h${String(m).padStart(2, '0')}′`
}

function formatDelta(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return 'sin dato'
  if (n > 0) return `+${n}`
  return String(n)
}

function kpiValue(
  key: SectorKpiKey,
  sector: SectorState,
  detail: SectorDetail | null
): { primary: string; hint?: string } {
  const cap = sector.capacity
  switch (key) {
    case 'present':
      return {
        primary: String(sector.present),
        hint: cap != null ? `de ${cap}` : undefined,
      }
    case 'occupancy': {
      if (cap == null || cap <= 0) return { primary: 'sin dato' }
      const pct = Math.round((sector.present / cap) * 100)
      return {
        primary: `${sector.present} / ${cap}`,
        hint: `${pct} %`,
      }
    }
    case 'rate60':
      return { primary: String(sector.rate60), hint: 'salidas / h' }
    case 'in60':
      return { primary: String(sector.in60) }
    case 'out60':
      return { primary: String(sector.out60) }
    case 'dwellP90':
      return {
        primary: formatMinutes(sector.dwellP90Min),
        hint:
          detail?.baseline?.dwellP90Min != null
            ? `habitual ${formatMinutes(detail.baseline.dwellP90Min)}`
            : 'sin referencia',
      }
    case 'dwellAvg':
      return { primary: formatMinutes(sector.dwellAvgMin) }
    case 'delta40':
      return {
        primary: formatDelta(sector.delta40),
        hint: `${sector.in60} entraron · ${sector.out60} salieron (60 min)`,
      }
    case 'queueAhead':
    case 'waitAvg':
    case 'accumulationUpstream':
    case 'balance60':
      return { primary: 'sin dato', hint: 'no disponible en el snapshot' }
    default:
      return { primary: 'sin dato' }
  }
}

function PresenceSparkline({ series }: { series: { at: string; present: number }[] }) {
  if (!series.length) return <p className="text-sm text-slate-400">sin dato</p>
  const max = Math.max(1, ...series.map((p) => p.present))
  const w = 320
  const h = 72
  const pts = series
    .map((p, i) => {
      const x = (i / Math.max(1, series.length - 1)) * w
      const y = h - 8 - (p.present / max) * (h - 16)
      return `${x},${y}`
    })
    .join(' ')
  const first = series[0]
  const mid = series[Math.floor(series.length / 2)]
  const last = series[series.length - 1]
  const fmt = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[72px] w-full" role="img" aria-label="Serie de ocupación">
        <polyline points={pts} fill="none" stroke="#DC2626" strokeWidth="2" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
        <span>{fmt(first.at)}</span>
        <span>{fmt(mid.at)}</span>
        <span>{fmt(last.at)}</span>
      </div>
    </div>
  )
}

export function SectorPanel(props: {
  site?: string
  sectorCode: string
  sectorFromSnapshot?: SectorState | null
  onClose: () => void
  onOpenCamera?: (deviceCode: string) => void
}) {
  const site = props.site ?? 'ricardone'
  const [detail, setDetail] = useState<SectorDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlate, setSelectedPlate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelectedPlate(null)
    getSectorDetail(site, props.sectorCode)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [site, props.sectorCode])

  const sector = detail?.sector ?? props.sectorFromSnapshot ?? null
  const keys = sector ? KPI_BY_TYPE[sector.type] : []

  return (
    <div className="rounded-[14px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">{props.sectorCode}</span>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
              {sector?.label ?? props.sectorCode}
            </h2>
            {sector ? (
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[sector.status]}`}
              >
                {STATUS_LABEL[sector.status]}
              </span>
            ) : null}
          </div>
          {sector ? (
            <p className="mt-1 text-[12px] text-slate-400">
              Sector de tipo <span className="font-semibold text-slate-600">{TYPE_LABELS[sector.type]}</span>
              {' — '}
              indicadores propios del tipo, no una grilla fija.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {detail?.cameras[0]?.deviceCode && props.onOpenCamera ? (
            <button
              type="button"
              onClick={() => props.onOpenCamera?.(detail.cameras[0].deviceCode)}
              className="rounded-lg bg-blue-600 px-3 py-2 text-[12.5px] font-semibold text-white"
            >
              Ver cámara en vivo
            </button>
          ) : null}
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] text-slate-600"
          >
            Cerrar
          </button>
        </div>
      </div>

      {error ? (
        <p className="px-4 py-6 text-sm text-red-600">{error}</p>
      ) : loading && !sector ? (
        <p className="px-4 py-6 text-sm text-slate-400">Cargando sector…</p>
      ) : sector ? (
        <div className="space-y-4 p-4">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
          >
            {keys.map((key) => {
              const v = kpiValue(key, sector, detail)
              return (
                <div key={key} className="rounded-[12px] border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {KPI_LABELS[key]}
                  </div>
                  <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900">
                    {v.primary}
                  </div>
                  {v.hint ? <div className="mt-1 text-[11px] text-slate-400">{v.hint}</div> : null}
                </div>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-[12px] border border-slate-200 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-800">
                  {detail?.edge?.label ?? sector.edgeId}
                </span>
                {detail?.edge ? (
                  <span className="text-[11px] font-semibold uppercase text-slate-500">
                    {detail.edge.status} · {detail.edge.camerasOk} de {detail.edge.camerasExpected}
                  </span>
                ) : null}
              </div>
              {detail?.cameras?.length ? (
                <ul className="divide-y divide-slate-100">
                  {detail.cameras.map((c) => (
                    <li key={c.deviceCode} className="flex items-center gap-2 py-2 text-[12.5px]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          background:
                            c.health === 'ok' ? '#22C55E' : c.health === 'stale' ? '#F59E0B' : '#94A3B8',
                        }}
                      />
                      <button
                        type="button"
                        className="font-mono text-slate-700 hover:text-blue-600"
                        onClick={() => props.onOpenCamera?.(c.deviceCode)}
                      >
                        {c.deviceCode}
                      </button>
                      <span className="flex-1" />
                      <span className="font-mono text-[11px] text-slate-400">{c.detections60} det/h</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {c.lastEventAgeS == null ? 'sin dato' : `${c.lastEventAgeS}s`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-400">sin dato</p>
              )}
            </div>

            <div className="rounded-[12px] border border-slate-200 p-3">
              <div className="mb-2 text-[13px] font-semibold text-slate-800">
                Ocupación · últimas 3 h
              </div>
              {detail?.presenceSeries ? (
                <PresenceSparkline series={detail.presenceSeries} />
              ) : (
                <p className="text-sm text-slate-400">sin dato</p>
              )}
              {detail?.baseline ? (
                <p className="mt-2 text-[11px] text-slate-400">
                  Baseline {detail.baseline.quarter ?? '—'}: ritmo{' '}
                  {detail.baseline.rate60 ?? 'sin dato'} · P90{' '}
                  {formatMinutes(detail.baseline.dwellP90Min)}
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">sin referencia de cuarto de día</p>
              )}
            </div>
          </div>

          <TrucksTable
            site={site}
            sectorCode={props.sectorCode}
            selectedPlate={selectedPlate}
            onSelectPlate={setSelectedPlate}
            onOpenCamera={props.onOpenCamera}
          />
        </div>
      ) : null}
    </div>
  )
}
