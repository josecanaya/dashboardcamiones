/** Parser CSV mínimo (comillas y comas dentro de campos). */

export function parseCsvToRecords(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const text = csvText.replace(/^\uFEFF/, '').trim()
  if (!text) return { headers: [], rows: [] }

  const lines: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      // Este bucle SOLO separa líneas: rastrea comillas para no cortar en un salto de
      // línea citado, pero las conserva intactas. Si las consumiera, parseCsvLine recibiría
      // una línea sin comillas y partiría por cada coma interna, corriendo todas las
      // columnas siguientes (bug histórico: date_min tomaba el valor de la columna previa).
      if (inQuotes && text[i + 1] === '"') {
        cur += '""'
        i++
      } else {
        inQuotes = !inQuotes
        cur += '"'
      }
      continue
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      if (cur.length) lines.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.length) lines.push(cur)

  if (!lines.length) return { headers: [], rows: [] }

  const headers = parseCsvLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li])
    if (!cells.some((c) => c.trim())) continue
    const row: Record<string, string> = {}
    for (let hi = 0; hi < headers.length; hi++) {
      row[headers[hi]] = cells[hi] ?? ''
    }
    rows.push(row)
  }
  return { headers, rows }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

export function unionHeaders(existing: string[], more: string[]): string[] {
  const set = new Set(existing)
  for (const h of more) if (h && !set.has(h)) set.add(h)
  return [...set]
}

export function rowGet(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (k in row) return String(row[k] ?? '').trim()
    const lower = k.toLowerCase()
    for (const [hk, hv] of Object.entries(row)) {
      if (hk.toLowerCase() === lower) return String(hv ?? '').trim()
    }
  }
  return ''
}
