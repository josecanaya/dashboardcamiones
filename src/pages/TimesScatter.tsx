import { useState, useMemo } from 'react'
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { ScatterShapeProps } from 'recharts'
import { useSite } from '../context/SiteContext'
import { useData } from '../context/DataContext'
import { useSimulatorVisit } from '../context/SimulatorVisitContext'
import { detectAnomalies } from '../analytics/anomalies'
import { mean, p50, p95 } from '../lib/stats'
import type { ReconstructedVisit } from '../domain/events'

interface PointItem {
  visitId: string
  plate: string
  product: string
  cargoForm: string
  cycleTime: number
  startAt: string
  timeOfDayMinutes: number
  status: string
  anomalyCount: number
  visit: ReconstructedVisit
  /** Color según posición vs media: verde = debajo, amarillo = en la media, rojo = encima */
  fill: string
}

/** Banda para considerar "en la media" (minutos). */
const MEAN_BAND_MIN = 3

function getPointFill(cycleTime: number, meanVal: number, minCycle: number, maxCycle: number): string {
  const diff = cycleTime - meanVal
  if (Math.abs(diff) <= MEAN_BAND_MIN) return '#eab308' // amarillo = en la media
  if (diff < 0) {
    // Debajo de la media (más rápidos) → verde; más oscuro cuanto más rápido (más lejos debajo)
    const range = meanVal - minCycle || 1
    const t = (meanVal - cycleTime) / range
    const darken = Math.min(1, t)
    const g = Math.floor(163 - darken * 80)
    const b = Math.floor(74 - darken * 40)
    return `rgb(22, ${Math.max(0, g)}, ${Math.max(0, b)})`
  }
  // Por encima de la media → rojo; más oscuro cuanto más lejos de la media
  const range = Math.max(maxCycle - meanVal, 1)
  const t = Math.min(1, (cycleTime - meanVal) / range)
  const r = Math.floor(239 - t * 100)
  const g = Math.floor(68 - t * 60)
  const b = Math.floor(68 - t * 40)
  return `rgb(${Math.max(0, r)}, ${Math.max(0, g)}, ${Math.max(0, b)})`
}

interface TimesScatterProps {
  onOpenDetail: (visit: ReconstructedVisit) => void
  onSimulate: (visit: ReconstructedVisit) => void
}

export function TimesScatter({ onOpenDetail, onSimulate }: TimesScatterProps) {
  const { siteId } = useSite()
  const { getVisitsBySite, lastProcessedAt } = useData()
  const { setVisitToSimulate } = useSimulatorVisit()
  const [showPercentiles, setShowPercentiles] = useState(false)
  const [selectedPoint, setSelectedPoint] = useState<PointItem | null>(null)

  const visits = getVisitsBySite(siteId)
  const MIN_CYCLE_DISPLAY_MIN = 1
  const { points, stats, yDomain, excludedLowCycleCount } = useMemo(() => {
    const list: PointItem[] = []
    let excludedLowCycle = 0
    for (const v of visits) {
      if (v.status !== 'CLOSED') continue
      const cycle = v.metrics.cycleTimeMinutes
      if (cycle == null || cycle < MIN_CYCLE_DISPLAY_MIN) {
        if (cycle != null && cycle < MIN_CYCLE_DISPLAY_MIN) excludedLowCycle++
        continue
      }
      const startAt = v.startAt
      const d = new Date(startAt)
      const timeOfDayMinutes = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
      list.push({
        visitId: v.visitId,
        plate: v.plate ?? v.visitId,
        product: v.product ?? '—',
        cargoForm: v.cargoForm,
        cycleTime: cycle,
        startAt,
        timeOfDayMinutes,
        status: v.status,
        anomalyCount: detectAnomalies(v).length,
        visit: v,
        fill: '#94a3b8',
      })
    }
    list.sort((a, b) => a.timeOfDayMinutes - b.timeOfDayMinutes)
    const cycleTimes = list.map((p) => p.cycleTime).sort((a, b) => a - b)
    const meanVal = mean(cycleTimes)
    const p95Val = p95(cycleTimes)
    const minCycle = cycleTimes[0] ?? 0
    const maxCycle = cycleTimes[cycleTimes.length - 1] ?? meanVal
    list.forEach((p) => {
      p.fill = getPointFill(p.cycleTime, meanVal, minCycle, maxCycle)
    })
    const MAX_CYCLE_DISPLAY_MIN = 50 * 60
    const yMax = Math.min(MAX_CYCLE_DISPLAY_MIN, Math.max(60, Math.ceil(p95Val * 1.15)))
    return {
      points: list,
      stats: {
        mean: meanVal,
        p50: p50(cycleTimes),
        p95: p95Val,
      },
      yDomain: [0, yMax] as [number, number],
      excludedLowCycleCount: excludedLowCycle,
    }
  }, [visits])

  const handleSimulate = (visit: ReconstructedVisit) => {
    setVisitToSimulate(visit)
    onSimulate(visit)
  }

  if (!lastProcessedAt) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
        Importá datos primero (Importar o datos de ejemplo).
      </div>
    )
  }

  return (
    <div className="max-w-6xl space-y-4">
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">Tiempos por visita (cycle time)</h2>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={showPercentiles}
              onChange={(e) => setShowPercentiles(e.target.checked)}
            />
            Mostrar p50 / p95
          </label>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500 mb-2">
            Solo visitas cerradas (descarga y egreso). Eje X: hora de ingreso · Eje Y: tiempo total (min) · {points.length} visitas
          </p>
          <p className="text-xs text-slate-500 mb-1 flex gap-4">
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600 align-middle mr-1" /> Debajo de la media (más rápidos)</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 align-middle mr-1" /> En la media</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 align-middle mr-1" /> Por encima de la media</span>
          </p>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <XAxis
                  type="number"
                  dataKey="timeOfDayMinutes"
                  name="Hora ingreso"
                  domain={[0, 1440]}
                  tickFormatter={(min) => {
                    const h = Math.floor(min / 60)
                    const m = Math.floor(min % 60)
                    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                  }}
                />
                <YAxis type="number" dataKey="cycleTime" name="Ciclo (min)" unit=" min" domain={yDomain} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    const p = payload?.[0]?.payload as PointItem | undefined
                    if (!p) return null
                    return (
                      <div className="rounded-lg bg-white border border-slate-200 shadow-lg p-3 text-xs">
                        <div className="font-medium">{p.plate}</div>
                        <div>{p.visitId} · {p.product} · {p.cargoForm}</div>
                        <div>Ciclo: {p.cycleTime} min · {p.status}</div>
                        {p.anomalyCount > 0 && <div className="text-anomaly-600">⚠ {p.anomalyCount} anomalía(s)</div>}
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={stats.mean} stroke="#64748b" strokeDasharray="3 3" label={{ value: 'Media', position: 'right' }} />
                {showPercentiles && (
                  <>
                    <ReferenceLine y={stats.p50} stroke="#94a3b8" strokeDasharray="2 2" label={{ value: 'p50', position: 'right' }} />
                    <ReferenceLine y={stats.p95} stroke="#cbd5e1" strokeDasharray="2 2" label={{ value: 'p95', position: 'right' }} />
                  </>
                )}
                <Scatter
                  data={points}
                  fill="#94a3b8"
                  fillOpacity={0.85}
                  shape={(props: ScatterShapeProps) => {
                    const cx = props.cx ?? 0
                    const cy = props.cy ?? 0
                    const payload = props.payload as PointItem | undefined
                    const fill = payload?.fill ?? '#94a3b8'
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={fill}
                        fillOpacity={0.85}
                        style={{ cursor: 'pointer' }}
                      />
                    )
                  }}
                  onClick={(entry: unknown) => setSelectedPoint(entry as PointItem)}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-slate-500 mt-1 space-y-0.5">
            {excludedLowCycleCount > 0 && (
              <p>
                {excludedLowCycleCount} visita(s) con ciclo &lt; {MIN_CYCLE_DISPLAY_MIN} min no mostradas (datos inconsistentes).
              </p>
            )}
            {points.some((p) => p.cycleTime > yDomain[1]) && (
              <p>
                {points.filter((p) => p.cycleTime > yDomain[1]).length} visita(s) con ciclo &gt; {yDomain[1]} min no mostradas en el eje (outliers).
              </p>
            )}
          </div>
        </div>
      </div>

      {selectedPoint && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Detalle rápido</h3>
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              className="text-slate-500 hover:text-slate-700 text-sm"
            >
              Cerrar
            </button>
          </div>
          <p className="text-sm text-slate-700">{selectedPoint.plate} · {selectedPoint.visitId} · {selectedPoint.cycleTime} min</p>
          <p className="text-xs text-slate-500 mt-1">{selectedPoint.product} · {selectedPoint.cargoForm} · {selectedPoint.status}</p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => { onOpenDetail(selectedPoint.visit); setSelectedPoint(null) }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Ver detalle visita
            </button>
            <button
              type="button"
              onClick={() => { handleSimulate(selectedPoint.visit); setSelectedPoint(null) }}
              className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm text-white hover:bg-primary-600"
            >
              Simular esta visita
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
