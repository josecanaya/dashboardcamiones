/**
 * Utilidades para exportar gráficos a PNG, SVG, CSV y PDF.
 * Para uso en PowerPoint, informes y análisis externo.
 */

import { toPng, toSvg } from 'html-to-image'
import { jsPDF } from 'jspdf'

export interface ExportMeta {
  title?: string
  subtitle?: string
  plant?: string
  period?: string
  generatedAt?: string
}

/** Genera subtítulo con metadatos para el gráfico exportado. */
export function buildExportSubtitle(meta: ExportMeta): string {
  const parts: string[] = []
  if (meta.plant) parts.push(`Planta: ${meta.plant}`)
  if (meta.period) parts.push(`Período: ${meta.period}`)
  if (meta.generatedAt) parts.push(`Generado: ${meta.generatedAt}`)
  return parts.join(' | ')
}

/** Exporta un elemento DOM a PNG de alta resolución (2x scale para PowerPoint). */
export async function exportChartAsPng(
  element: HTMLElement | null,
  filename: string,
  _meta?: ExportMeta,
  scale = 2,
  options?: { excludeExportHide?: boolean }
): Promise<void> {
  if (!element) return
  try {
    const filter = options?.excludeExportHide
      ? (node: HTMLElement) => !(node as HTMLElement).classList?.contains('export-hide')
      : undefined
    const dataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: scale,
      backgroundColor: '#ffffff',
      style: { margin: '8px' },
      filter,
    })
    const link = document.createElement('a')
    link.download = filename.endsWith('.png') ? filename : `${filename}.png`
    link.href = dataUrl
    link.click()
  } catch (err) {
    console.error('[exportChartAsPng]', err)
    throw err
  }
}

/** Exporta un elemento DOM a SVG. */
export async function exportChartAsSvg(
  element: HTMLElement | null,
  filename: string
): Promise<void> {
  if (!element) return
  try {
    const dataUrl = await toSvg(element, {
      cacheBust: true,
      backgroundColor: '#ffffff',
    })
    const link = document.createElement('a')
    link.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
    link.href = dataUrl
    link.click()
  } catch (err) {
    console.error('[exportChartAsSvg]', err)
    throw err
  }
}

/** Exporta datos tabulares a CSV. */
export function exportChartDataAsCsv(
  data: Record<string, unknown>[],
  filename: string,
  meta?: ExportMeta
): void {
  if (data.length === 0) return
  const headers = Object.keys(data[0]!)
  const metaLines = meta
    ? [
        meta.title ? `# ${meta.title}` : null,
        meta.subtitle ? `# ${meta.subtitle}` : null,
        meta.plant ? `# Planta: ${meta.plant}` : null,
        meta.period ? `# Período: ${meta.period}` : null,
        meta.generatedAt ? `# Generado: ${meta.generatedAt}` : null,
      ].filter(Boolean)
    : []
  const csvHeader = headers.join(',')
  const csvRows = data.map((row) =>
    headers.map((h) => {
      const v = row[h]
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  )
  const content = [...metaLines, csvHeader, ...csvRows].join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

/** Nombre de archivo seguro para exportación. */
export function safeExportFilename(prefix: string, ext: string): string {
  const now = new Date()
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
  return `${safe}_${ts}.${ext}`
}

export interface ReportStats {
  n: number
  promedio: string
  mediana: string
  min: string
  max: string
  sigma: string
  p90: string
  p95: string
  iqr: string
}

/** Exporta panel completo a PDF para informe profesional. */
export async function exportReportToPdf(
  element: HTMLElement | null,
  filename: string,
  stats: ReportStats,
  meta: ExportMeta
): Promise<void> {
  if (!element) return
  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      style: { padding: '16px' },
      filter: (node) => {
        const el = node as HTMLElement
        return !el.classList?.contains('export-hide')
      },
    })
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const margin = 15
    let y = 15

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Informe KPI 1 — Tiempo de estadía en planta', margin, y)
    y += 8

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    if (meta.plant) doc.text(`Planta: ${meta.plant}`, margin, y)
    if (meta.period) doc.text(`Período: ${meta.period}`, margin + 50, y)
    y += 6

    doc.setFontSize(9)
    doc.text('Fórmula: Tiempo de estadía = timestamp egreso - timestamp ingreso. Datos entre 30 min y 15 h.', margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.text('Estadísticas', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    const statsText = `n: ${stats.n}  |  Promedio: ${stats.promedio}  |  Mediana: ${stats.mediana}  |  Mín: ${stats.min}  |  Máx: ${stats.max}  |  Desv. est.: ${stats.sigma}  |  P90: ${stats.p90}  |  P95: ${stats.p95}  |  IQR: ${stats.iqr}`
    doc.setFontSize(8)
    doc.text(statsText, margin, y)
    y += 10

    const imgW = pageW - 2 * margin
    const imgH = 70
    doc.addImage(dataUrl, 'PNG', margin, y, imgW, imgH)
    y += imgH + 10

    doc.setFontSize(8)
    doc.setTextColor(128, 128, 128)
    doc.text(`Generado: ${meta.generatedAt ?? new Date().toLocaleString('es-AR')} — Truckflow`, margin, y)
    doc.setTextColor(0, 0, 0)

    doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
  } catch (err) {
    console.error('[exportReportToPdf]', err)
    throw err
  }
}
