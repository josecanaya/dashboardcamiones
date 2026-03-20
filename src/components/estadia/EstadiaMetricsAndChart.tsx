/**
 * Bloque unificado: Métricas + Distribución de estadía.
 * Versión A orientada a comité: visual, clara, lista para exportar a PowerPoint.
 *
 * 4 filas: Header | KPIs compactos | Histograma principal | Boxplot + Insight
 */

import { useRef } from 'react'
import {
  exportChartAsPng,
  exportChartAsSvg,
  exportChartDataAsCsv,
  safeExportFilename,
  type ExportMeta,
} from '../../utils/chartExport'
import { EstadiaKpiRow } from './EstadiaKpiRow'
import { EstadiaHistogramWithRefs } from './EstadiaHistogramWithRefs'
import { EstadiaBoxplot } from './EstadiaBoxplot'
import { generateEstadiaInsight } from '../../lib/estadiaInsight'
import { buildIndicadoresForma, type IndicadoresForma } from '../../lib/distribucionForma'

export interface ChartPoint {
  x: number
  count: number
  freqSmoothed: number
}

export interface StayStats {
  count: number
  mean: number
  median: number
  mode?: number
  min: number
  max: number
  std: number
  p5?: number
  p90: number
  p95: number
  q1?: number
  q3?: number
  iqr: number
  umbralFueraRango?: number
  countFueraRango?: number
  pctFueraRango?: number
  distanciaModaMediana?: number
}

export interface EstadiaMetricsAndChartProps {
  stayStats: StayStats
  chartData: ChartPoint[]
  /** Array de tiempos de estadía en horas para calcular concentración central */
  durations?: number[]
  /** Contexto opcional para subtítulo (ej. planta, período) */
  context?: string
  /** Metadatos para exportación */
  exportMeta?: ExportMeta
}

export function EstadiaMetricsAndChart({
  stayStats,
  chartData,
  durations = [],
  context,
  exportMeta,
}: EstadiaMetricsAndChartProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const chartsExportRef = useRef<HTMLDivElement>(null)
  const boxplotRef = useRef<HTMLDivElement>(null)
  const histogramRef = useRef<HTMLDivElement>(null)

  const meta = {
    ...exportMeta,
    generatedAt: new Date().toLocaleString('es-AR'),
  }

  const handleExportPng = async () => {
    const el = histogramRef.current ?? panelRef.current
    if (!el) return
    await exportChartAsPng(el, safeExportFilename('estadia_histograma', 'png'), meta, 2, {
      excludeExportHide: true,
    })
  }

  const handleExportSvg = async () => {
    const el = histogramRef.current ?? panelRef.current
    if (!el) return
    await exportChartAsSvg(el, safeExportFilename('estadia_histograma', 'svg'))
  }

  const handleExportCsv = () => {
    const csvData = chartData.map((p) => ({
      horas: p.x.toFixed(2),
      cantidad: p.count,
      freq_suavizada: p.freqSmoothed.toFixed(2),
    }))
    const metaWithStats = {
      ...meta,
      subtitle: `n=${stayStats.count} | Media=${stayStats.mean.toFixed(1)}h | Moda=${mode.toFixed(1)}h | P90=${stayStats.p90.toFixed(1)}h | IQR=${stayStats.iqr.toFixed(1)}h`,
    }
    exportChartDataAsCsv(csvData, safeExportFilename('estadia_metricas_histograma', 'csv'), metaWithStats)
  }

  const handleExportPanel = async () => {
    const el = chartsExportRef.current ?? panelRef.current
    if (!el) return
    await exportChartAsPng(el, safeExportFilename('estadia_graficos', 'png'), meta, 2, {
      excludeExportHide: true,
    })
  }

  const handleExportTimelinePng = async () => {
    if (!boxplotRef.current) return
    await exportChartAsPng(boxplotRef.current, safeExportFilename('estadia_linea_tiempo', 'png'), meta, 2)
  }

  // Moda = bin con más camiones (barra más alta del histograma)
  const modeBinIdx = chartData.reduce(
    (best, d, i) => (d.count > (chartData[best]?.count ?? 0) ? i : best),
    0
  )
  const mode = chartData[modeBinIdx]?.x ?? stayStats.mode ?? stayStats.median

  const maxCount = Math.max(0, ...chartData.map((d) => d.count))
  const indicadoresForma: IndicadoresForma | null =
    durations.length > 0 && stayStats.q1 != null && stayStats.q3 != null
      ? buildIndicadoresForma(
          stayStats.mean,
          stayStats.std,
          stayStats.q1,
          stayStats.q3,
          stayStats.p90,
          durations,
          maxCount,
          'media_std',
          'media_std'
        )
      : null

  const insights = generateEstadiaInsight({
    count: stayStats.count,
    mean: stayStats.mean,
    median: stayStats.median,
    mode,
    std: stayStats.std,
    p90: stayStats.p90,
    min: stayStats.min,
    max: stayStats.max,
    q1: stayStats.q1,
    q3: stayStats.q3,
    iqr: stayStats.iqr,
    distanciaModaMediana: stayStats.distanciaModaMediana ?? Math.abs(mode - stayStats.median),
    indicadoresForma: indicadoresForma
      ? {
          mode,
          picoFrecuencia: indicadoresForma.picoFrecuencia,
          picoFrecuenciaPct: indicadoresForma.picoFrecuenciaPct,
          camionesEnRangoCentral: indicadoresForma.camionesEnRangoCentral,
          camionesEnRangoCentralPct: indicadoresForma.camionesEnRangoCentralPct,
          camionesEnColaDerecha: indicadoresForma.camionesEnColaDerecha,
          camionesEnColaDerechaPct: indicadoresForma.camionesEnColaDerechaPct,
        }
      : undefined,
  })

  const boxplotStats = {
    min: stayStats.min,
    q1: stayStats.q1 ?? stayStats.min,
    median: stayStats.median,
    q3: stayStats.q3 ?? stayStats.max,
    max: stayStats.max,
    mean: stayStats.mean,
    p90: stayStats.p90,
    p95: stayStats.p95,
    mode,
    count: stayStats.count,
  }

  return (
    <div
      ref={panelRef}
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={{ minWidth: 720 }}
    >
      {/* FILA 1 — Header */}
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              Métricas y distribución de estadía
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">
              Resumen estadístico de permanencia de camiones en planta
              <span className="ml-2 font-semibold text-slate-700">
                · {stayStats.count.toLocaleString('es-AR')} camiones
              </span>
            </p>
            {context && (
              <p className="mt-1 text-xs text-slate-400">{context}</p>
            )}
          </div>
          <div className="export-hide flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={handleExportPanel}
              className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
              title="Exportar panel completo PNG"
            >
              Panel PNG
            </button>
            <button
              type="button"
              onClick={handleExportPng}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Exportar histograma PNG"
            >
              PNG
            </button>
            <button
              type="button"
              onClick={handleExportSvg}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Exportar histograma SVG"
            >
              SVG
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Exportar datos CSV"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* FILA 2 — KPIs compactos + indicadores de forma */}
      <div className="border-b border-slate-100 px-6 py-4">
        {indicadoresForma && (
          <div className="mb-4 flex flex-wrap gap-4">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pico de frecuencia</span>
              <div className="mt-0.5 text-lg font-bold text-slate-800">
                {indicadoresForma.picoFrecuencia.toLocaleString('es-AR')} camiones
                <span className="ml-1 text-sm font-normal text-slate-500">({indicadoresForma.picoFrecuenciaPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Camiones en rango central</span>
              <div className="mt-0.5 text-lg font-bold text-slate-800">
                {indicadoresForma.camionesEnRangoCentral.toLocaleString('es-AR')} camiones
                <span className="ml-1 text-sm font-normal text-slate-500">({indicadoresForma.camionesEnRangoCentralPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Camiones en cola derecha</span>
              <div className="mt-0.5 text-lg font-bold text-slate-800">
                {indicadoresForma.camionesEnColaDerecha.toLocaleString('es-AR')} camiones
                <span className="ml-1 text-sm font-normal text-slate-500">({indicadoresForma.camionesEnColaDerechaPct.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        )}
        <EstadiaKpiRow
          stats={{
            count: stayStats.count,
            mean: stayStats.mean,
            median: stayStats.median,
            mode,
            std: stayStats.std,
            p90: stayStats.p90,
            iqr: stayStats.iqr,
            distanciaModaMediana: stayStats.distanciaModaMediana ?? Math.abs(mode - stayStats.median),
          }}
        />
      </div>

      {/* FILA 3 — Gráficos (solo esto se exporta con Panel PNG) */}
      <div ref={chartsExportRef} className="border-b border-slate-100 px-6 py-4 space-y-6">
        {/* 1. Barra horizontal (timeline) — primero */}
        <div className="relative">
          <div className="export-hide absolute right-0 top-0 z-10">
            <button
              type="button"
              onClick={handleExportTimelinePng}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Exportar línea de tiempo PNG"
            >
              PNG
            </button>
          </div>
          <div ref={boxplotRef}>
            <EstadiaBoxplot stats={boxplotStats} />
          </div>
        </div>
        {/* 2. Histograma + curva gaussiana — después */}
        <div>
          <div className="mb-2">
            <h4 className="text-sm font-semibold text-slate-700">
              Histograma de tiempo de estadía
              <span className="ml-2 font-normal text-slate-500">(n = {stayStats.count.toLocaleString('es-AR')})</span>
            </h4>
            <div className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
              {indicadoresForma && (
                <>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm bg-sky-400/30" />
                    <span className="text-slate-600">Rango central</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm bg-amber-400/40" />
                    <span className="text-slate-600">Cola derecha</span>
                  </span>
                </>
              )}
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-0.5 w-4 bg-sky-500/70" />
                Curva Gaussiana
              </span>
            </div>
          </div>
          <div ref={histogramRef}>
            <EstadiaHistogramWithRefs
              chartData={chartData}
              mean={stayStats.mean}
              median={stayStats.median}
              std={stayStats.std}
              mode={mode}
              indicadoresForma={indicadoresForma}
            />
          </div>
        </div>
      </div>

      {/* FILA 4 — Lectura operativa (no se exporta con Panel PNG) */}
      <div className="px-6 py-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50/30 px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            Lectura operativa
          </div>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {insights.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
