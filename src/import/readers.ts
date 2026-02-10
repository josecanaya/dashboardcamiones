import type { ParsedFile, RawRow } from './types'
import * as XLSX from 'xlsx'

/** Parsea CSV string a filas con encabezados. Respeta comillas. */
export function parseCSV(csvText: string): ParsedFile {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseCSVLine(lines[0])
  const rows: RawRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: RawRow = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (inQuotes) {
      current += c
    } else if (c === ',' || c === ';') {
      result.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

/** Parsea archivo Excel (primera hoja) a filas. */
export function parseXLSX(buffer: ArrayBuffer): ParsedFile {
  const wb = XLSX.read(buffer, { type: 'array' })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) return { headers: [], rows: [] }
  const sheet = wb.Sheets[firstSheet]
  const data = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  if (data.length === 0) return { headers: [], rows: [] }
  const headerRow = data[0] as unknown[]
  const headers = headerRow.map((c) => String(c ?? ''))
  const rows: RawRow[] = []
  for (let i = 1; i < data.length; i++) {
    const rowArr = data[i] as unknown[]
    const row: RawRow = {}
    headers.forEach((h, j) => {
      row[h] = rowArr[j] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

/** Hash simple de encabezados para persistir mapping por "tipo de archivo". */
export function hashHeaders(headers: string[]): string {
  const s = headers.slice().sort().join('|')
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}
