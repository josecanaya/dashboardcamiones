/** @deprecated Lo puro vive en etl-core/csv. Aquí queda solo la descarga browser. */
export { csvEscapeCell, recordsToCsv } from '../../../etl-core/csv'

export function triggerBrowserCsvDownload(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
