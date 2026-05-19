export function csvEscapeCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function recordsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map((h) => csvEscapeCell(h)).join(',')]
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscapeCell(r[h])).join(','))
  }
  return lines.join('\n')
}

export function triggerBrowserCsvDownload(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
