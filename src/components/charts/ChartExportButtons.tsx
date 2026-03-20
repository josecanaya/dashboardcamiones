/**
 * Botones de exportación reutilizables para gráficos.
 * PNG (alta res), SVG, CSV.
 */

import { useRef, useCallback } from 'react'
import {
  exportChartAsPng,
  exportChartAsSvg,
  exportChartDataAsCsv,
  exportReportToPdf,
  safeExportFilename,
  type ExportMeta,
  type ReportStats,
} from '../../utils/chartExport'

export interface ChartExportButtonsProps {
  /** Ref del contenedor del gráfico (para PNG/SVG). Si no se pasa, se usa el wrapper. */
  chartRef?: React.RefObject<HTMLDivElement | null>
  /** Prefijo para el nombre del archivo */
  filenamePrefix: string
  /** Datos para exportar a CSV. Si no hay, el botón CSV se oculta. */
  csvData?: Record<string, unknown>[]
  /** Metadatos para incluir en exportación */
  meta?: ExportMeta
  /** Título del gráfico (para meta) */
  title?: string
  /** Clases adicionales para el contenedor */
  className?: string
  /** Tamaño de los botones */
  size?: 'sm' | 'xs'
  /** Ref del panel completo (gráfico + estadísticas) para exportar todo junto */
  fullPanelRef?: React.RefObject<HTMLDivElement | null>
  /** Prefijo para el archivo de exportación completa */
  fullExportFilename?: string
  /** Estadísticas para informe PDF (requerido si fullPanelRef) */
  reportStats?: ReportStats
  children: React.ReactNode
}

export function ChartExportButtons({
  chartRef,
  filenamePrefix,
  csvData,
  meta,
  title,
  className = '',
  size = 'sm',
  fullPanelRef,
  fullExportFilename,
  reportStats,
  children,
}: ChartExportButtonsProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ref = chartRef ?? wrapperRef

  const handleFullPng = useCallback(async () => {
    const el = fullPanelRef?.current
    if (!el || !fullExportFilename) return
    const m = { ...meta, title: title ?? meta?.title, generatedAt: new Date().toLocaleString('es-AR') }
    await exportChartAsPng(el, safeExportFilename(fullExportFilename, 'png'), m, 2)
  }, [fullPanelRef, fullExportFilename, meta, title])

  const handleFullPdf = useCallback(async () => {
    const el = fullPanelRef?.current
    if (!el || !fullExportFilename || !reportStats) return
    const m = { ...meta, plant: meta?.plant, period: meta?.period, generatedAt: new Date().toLocaleString('es-AR') }
    await exportReportToPdf(el, safeExportFilename(fullExportFilename, 'pdf'), reportStats, m)
  }, [fullPanelRef, fullExportFilename, reportStats, meta])

  const handlePng = useCallback(async () => {
    const el = ref?.current
    if (!el) return
    const metaWithTitle = { ...meta, title: title ?? meta?.title, generatedAt: new Date().toLocaleString('es-AR') }
    await exportChartAsPng(el, safeExportFilename(filenamePrefix, 'png'), metaWithTitle, 2)
  }, [ref, filenamePrefix, meta, title])

  const handleSvg = useCallback(async () => {
    const el = ref?.current
    if (!el) return
    await exportChartAsSvg(el, safeExportFilename(filenamePrefix, 'svg'))
  }, [ref, filenamePrefix])

  const handleCsv = useCallback(() => {
    if (!csvData || csvData.length === 0) return
    const metaWithTitle = { ...meta, title: title ?? meta?.title, generatedAt: new Date().toLocaleString('es-AR') }
    exportChartDataAsCsv(csvData, safeExportFilename(filenamePrefix, 'csv'), metaWithTitle)
  }, [csvData, filenamePrefix, meta, title])

  const btnClass = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="export-hide absolute right-0 top-0 z-10 flex gap-1 rounded border border-slate-200 bg-white/95 px-1 py-0.5 shadow-sm">
        {fullPanelRef && fullExportFilename && (
          <>
            <button
              type="button"
              onClick={handleFullPdf}
              className={`${btnClass} rounded font-semibold bg-violet-600 text-white hover:bg-violet-700`}
              title="Exportar informe PDF (gráfico + estadísticas)"
            >
              PDF
            </button>
            <button
              type="button"
              onClick={handleFullPng}
              className={`${btnClass} rounded font-medium text-violet-600 hover:bg-violet-50`}
              title="Exportar panel completo PNG"
            >
              Completo
            </button>
          </>
        )}
        <button
          type="button"
          onClick={handlePng}
          className={`${btnClass} rounded font-medium text-slate-600 hover:bg-slate-100`}
          title="Exportar como PNG (alta resolución para PowerPoint)"
        >
          PNG
        </button>
        <button
          type="button"
          onClick={handleSvg}
          className={`${btnClass} rounded font-medium text-slate-600 hover:bg-slate-100`}
          title="Exportar como SVG"
        >
          SVG
        </button>
        {csvData && csvData.length > 0 && (
          <button
            type="button"
            onClick={handleCsv}
            className={`${btnClass} rounded font-medium text-slate-600 hover:bg-slate-100`}
            title="Exportar datos a CSV"
          >
            CSV
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
