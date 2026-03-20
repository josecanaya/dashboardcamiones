import { useMemo } from 'react'
import { compareSectorIdAsc, type HeatmapBand, type SaturationAnalysisResult } from '../../services/saturationAnalytics'

export interface SaturationWeekOccupancyLinesProps {
  result: SaturationAnalysisResult
}

function isSectorS1ToS10(id: string): boolean {
  const m = /^S(\d+)$/i.exec(id.trim())
  if (!m) return false
  const n = Number(m[1])
  return n >= 1 && n <= 10
}

/**
 * Mismo formato que el timeline (título, fechas, pista gris, S1–S10), pero la barra muestra
 * **toda la semana** franja a franja (ocupación vs capacidad). Colores pastel **opacos** — sin velos ni transparencias.
 */
const STRIP_SOLID: Record<HeatmapBand, string> = {
  /** Normal — menta legible */
  normal: '#5ee9b5',
  /** Cerca del límite */
  high: '#fbbf24',
  /** Saturado */
  saturated: '#fb7185',
  /** Severo */
  severe: '#e11d48',
}

const DAY_MS = 86_400_000
const NOON_MS = 12 * 60 * 60 * 1000

function timelineDayAndNoonMarkers(rangeStartMs: number, rangeEndMs: number) {
  const total = rangeEndMs - rangeStartMs
  if (total <= 0) {
    return { dayStarts: [] as { pct: number; label: string; key: string }[], noons: [] as { pct: number; key: string }[] }
  }
  const pctAt = (ms: number) => ((ms - rangeStartMs) / total) * 100

  const dayStarts: { pct: number; label: string; key: string }[] = []
  const noons: { pct: number; key: string }[] = []

  const s = new Date(rangeStartMs)
  let d = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0)

  while (d < rangeEndMs) {
    if (d >= rangeStartMs) {
      const p = pctAt(d)
      if (p >= -0.5 && p <= 100.5) {
        const raw = new Date(d).toLocaleDateString('es-AR', {
          weekday: 'short',
          day: 'numeric',
          month: 'numeric',
          timeZone: 'UTC',
        })
        const label = raw.charAt(0).toUpperCase() + raw.slice(1)
        dayStarts.push({ pct: Math.min(100, Math.max(0, p)), label, key: `day-${d}` })
      }
    }
    const noon = d + NOON_MS
    if (noon >= rangeStartMs && noon < rangeEndMs) {
      const p = pctAt(noon)
      if (p >= -0.5 && p <= 100.5) {
        noons.push({ pct: Math.min(100, Math.max(0, p)), key: `noon-${d}` })
      }
    }
    d += DAY_MS
  }

  return { dayStarts, noons }
}

export function SaturationWeekOccupancyLines({ result }: SaturationWeekOccupancyLinesProps) {
  const { rangeStartMs, rangeEndMs, heatmapCells, capacityMap, buckets } = result
  const totalMs = rangeEndMs - rangeStartMs

  const sectorsS1S10 = useMemo(() => {
    if (!capacityMap) return [] as string[]
    return Object.keys(capacityMap).filter(isSectorS1ToS10).sort(compareSectorIdAsc)
  }, [capacityMap])

  const cellMap = useMemo(() => {
    const map = new Map<string, Map<number, (typeof heatmapCells)[0]>>()
    for (const c of heatmapCells) {
      if (!map.has(c.sectorId)) map.set(c.sectorId, new Map())
      map.get(c.sectorId)!.set(c.bucketIndex, c)
    }
    return map
  }, [heatmapCells])

  if (!capacityMap || sectorsS1S10.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3 text-center text-sm text-slate-500">
        Sin sectores S1–S10 con capacidad.
      </div>
    )
  }

  if (totalMs <= 0 || buckets.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-3 text-center text-sm text-slate-500">
        Sin franjas en el período.
      </div>
    )
  }

  const startLabel = new Date(rangeStartMs).toLocaleDateString('es-AR', { timeZone: 'UTC' })
  const endLabel = new Date(rangeEndMs).toLocaleDateString('es-AR', { timeZone: 'UTC' })

  const { dayStarts, noons } = useMemo(
    () => timelineDayAndNoonMarkers(rangeStartMs, rangeEndMs),
    [rangeStartMs, rangeEndMs]
  )

  return (
    <div
      className="rounded-md border border-slate-200 bg-white p-3 print:border print:shadow-none"
      aria-label="Ocupación por sector en el tiempo, vista estática"
    >
      <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">
        Episodios de saturación en el tiempo
      </div>

      <div className="relative min-h-[100px] space-y-2">
        <div className="mb-1 flex h-5 text-[9px] text-slate-500">
          <div className="w-12 shrink-0" />
          <div className="relative flex-1 border-b border-slate-300">
            <span className="absolute left-0 top-0 font-medium text-slate-600">{startLabel}</span>
            <span className="absolute right-0 top-0 font-medium text-slate-600">{endLabel}</span>
          </div>
        </div>

        {/* Línea de tiempo: inicio de cada día (etiqueta) + mediodía 12:00 UTC (marca) — alineado con las barras */}
        <div className="mb-2 flex">
          <div className="w-12 shrink-0" aria-hidden />
          <div className="relative h-11 flex-1 border-b-2 border-slate-400">
            {noons.map((n) => (
              <div
                key={n.key}
                className="absolute bottom-0 z-0 w-[2px] rounded-full bg-slate-400"
                style={{ left: `${n.pct}%`, height: '7px', transform: 'translateX(-50%)' }}
                title="Mediodía 12:00 UTC"
              />
            ))}
            {dayStarts.map((m) => (
              <div
                key={m.key}
                className="absolute bottom-0 z-[1] flex flex-col items-center"
                style={{ left: `${m.pct}%`, transform: 'translateX(-50%)' }}
                title={`Inicio del día UTC · ${m.label}`}
              >
                <span className="mb-0.5 max-w-[3.5rem] truncate text-center text-[8px] font-bold capitalize leading-none text-slate-700">
                  {m.label}
                </span>
                <div className="h-[10px] w-[2px] rounded-full bg-slate-600" />
              </div>
            ))}
          </div>
        </div>

        <div className="pointer-events-none select-none space-y-2">
          {sectorsS1S10.map((sec) => (
            <div key={sec} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-[10px] font-semibold text-slate-800">{sec}</span>
              <div className="relative h-6 min-w-[160px] flex-1 overflow-hidden rounded-md border border-slate-300 bg-slate-200">
                <div className="flex h-full w-full">
                  {buckets.map((b) => {
                    const cell = cellMap.get(sec)?.get(b.index)
                    const band: HeatmapBand = cell?.band ?? 'normal'
                    return (
                      <div
                        key={`${sec}-${b.index}`}
                        className="h-full min-w-0 flex-1"
                        style={{ backgroundColor: STRIP_SOLID[band] }}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 pt-2 text-[9px] font-medium text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ backgroundColor: STRIP_SOLID.normal }} />
          Normal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ backgroundColor: STRIP_SOLID.high }} />
          Alerta (80–100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ backgroundColor: STRIP_SOLID.saturated }} />
          Saturado (&gt;100%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm border border-slate-300" style={{ backgroundColor: STRIP_SOLID.severe }} />
          Severo (≥120%)
        </span>
      </div>
    </div>
  )
}
