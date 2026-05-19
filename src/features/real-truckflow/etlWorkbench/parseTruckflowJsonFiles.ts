import { extractTruckflowPayloadArray } from '../../../services/realTruckflowApi'

export type TruckflowJsonKind = 'events' | 'alerts' | 'unknown'

export type ParsedTruckflowFile = {
  filename: string
  kind: TruckflowJsonKind
  recordCount: number
  records: unknown[]
  dayHint?: string
  endpointHint?: string
}

function detectKindFromDoc(doc: unknown): TruckflowJsonKind {
  if (!doc || typeof doc !== 'object') return 'unknown'
  const o = doc as Record<string, unknown>
  const ep = String(o.endpoint ?? '').toLowerCase()
  if (ep.includes('journey-event') || ep.includes('journey_event')) return 'events'
  if (ep.includes('alert')) return 'alerts'
  const sample = extractTruckflowPayloadArray(o.records ?? o).slice(0, 80)
  let evHits = 0
  let alHits = 0
  for (const row of sample) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const hasSeq = typeof r.sequenceNumber === 'number'
    const hasJ = Boolean(String(r.journeyUid ?? r.journeyUuid ?? '').trim())
    const typ = String(r.alertType ?? r.reason ?? r.type ?? '').toUpperCase()
    if (hasSeq && hasJ) evHits++
    if (typ || r.alertLevel !== undefined || (hasJ && !hasSeq)) alHits++
  }
  if (evHits >= 5 && evHits >= alHits) return 'events'
  if (alHits > evHits) return 'alerts'
  return 'unknown'
}

export function extractRecordsFromTruckflowJsonRoot(rawRoot: unknown): {
  records: unknown[]
  dayHint?: string
  endpointHint?: string
  docWrapper: unknown
} {
  if (Array.isArray(rawRoot)) {
    return { records: rawRoot, docWrapper: rawRoot }
  }
  if (rawRoot && typeof rawRoot === 'object') {
    const o = rawRoot as Record<string, unknown>
    const rec = extractTruckflowPayloadArray(o.records ?? o)
    return {
      records: rec,
      dayHint: typeof o.day === 'string' ? o.day : undefined,
      endpointHint: typeof o.endpoint === 'string' ? o.endpoint : undefined,
      docWrapper: rawRoot,
    }
  }
  return { records: [], docWrapper: rawRoot }
}

export async function parseTruckflowJsonFile(file: File): Promise<ParsedTruckflowFile> {
  const text = await file.text()
  let root: unknown
  try {
    root = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`JSON inválido: ${file.name}`)
  }
  const { records, dayHint, endpointHint, docWrapper } = extractRecordsFromTruckflowJsonRoot(root)
  const kind = detectKindFromDoc(docWrapper)
  return {
    filename: file.name,
    kind: kind === 'unknown' && records.length === 0 ? 'unknown' : kind,
    recordCount: records.length,
    records,
    dayHint,
    endpointHint,
  }
}
