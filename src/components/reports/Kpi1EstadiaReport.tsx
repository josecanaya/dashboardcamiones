/**
 * KPI 1 — Tiempo de estadía en planta.
 * 4 piezas visuales separadas, slide-ready, exportables como PNG individuales.
 */

import { useRef, useCallback } from 'react'
import { exportChartAsPng, safeExportFilename } from '../../utils/chartExport'
import { EstadiaMetricsAndChart } from '../estadia/EstadiaMetricsAndChart'
import { EstadiaTechnicalFooter } from '../estadia/EstadiaTechnicalFooter'

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

export interface ChartPoint {
  x: number
  count: number
  freqSmoothed: number
}

export interface Kpi1EstadiaReportProps {
  stayStats: StayStats
  chartData: ChartPoint[]
  durations: number[]
  plantName: string
  periodLabel: string
  panelRef: React.RefObject<HTMLDivElement | null>
}

function ExportPngButton({
  label,
  elementRef,
  filenamePrefix,
  variant = 'default',
}: {
  label: string
  elementRef: React.RefObject<HTMLDivElement | null>
  filenamePrefix: string
  variant?: 'default' | 'colored'
}) {
  const handleExport = useCallback(async () => {
    const el = elementRef.current
    if (!el) return
    await exportChartAsPng(el, safeExportFilename(filenamePrefix, 'png'), undefined, 2)
  }, [elementRef, filenamePrefix])

  const btnClass =
    variant === 'colored'
      ? 'rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700'
      : 'rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50'

  return (
    <button
      type="button"
      onClick={handleExport}
      className={btnClass}
      title={`Exportar ${label} como PNG`}
    >
      PNG
    </button>
  )
}

export function Kpi1EstadiaReport({
  stayStats,
  chartData,
  durations,
  plantName,
  periodLabel,
  panelRef,
}: Kpi1EstadiaReportProps) {
  const metricsChartRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={panelRef} className="space-y-8">
      {/* Métricas + Distribución */}
      <div className="relative">
        <div className="export-hide absolute right-0 top-0 z-10 flex gap-2">
          <ExportPngButton
            elementRef={metricsChartRef}
            filenamePrefix="estadia_metricas_distribucion"
            label="Métricas y gráfico"
            variant="colored"
          />
        </div>
        <div ref={metricsChartRef}>
          <EstadiaMetricsAndChart
            stayStats={stayStats}
            chartData={chartData}
            durations={durations}
            context={`${plantName} · ${periodLabel}`}
            exportMeta={{ plant: plantName, period: periodLabel }}
          />
        </div>
      </div>

      {/* Pieza 3 — Contexto técnico */}
      <div className="relative">
        <div className="export-hide absolute right-0 top-0 z-10 flex gap-2">
          <ExportPngButton elementRef={footerRef} filenamePrefix="estadia_tecnico" label="Técnico" variant="colored" />
        </div>
        <div ref={footerRef}>
          <EstadiaTechnicalFooter />
        </div>
      </div>
    </div>
  )
}
