import { isValidArgentinaPlate, normalizePlate } from './argentinaPlate'
import { getEventOperationalInstantIso } from './liveCameraDiagnostics'
import type { RealJourneyEventDto, ReconstructedRealJourney } from './realJourneyEvents.types'
import { normalizeRealEventPoint } from './realEventNormalization'
import { occurredAtLocalDayKey } from './realJourneyQuality'

export function normalizePlateQuery(raw: string): string {
  return normalizePlate(raw ?? '')
}

/** True si la búsqueda no coincide con formato ABC123 / AB123CD (posible OCR ruidoso). */
export function plateSearchQueryIsValidArgentinaFormat(raw: string): boolean {
  return isValidArgentinaPlate(raw)
}

export function plateMatchesQuery(normalizedPlate: string, queryNormalized: string): boolean {
  if (!queryNormalized) return true
  const p = normalizedPlate ?? ''
  return p.includes(queryNormalized)
}

/** Coincidencias sobre {@link RealJourneyEventDto.normalizedPlate} (substring). */
export function filterEventsByPlate(events: RealJourneyEventDto[], rawQuery: string): RealJourneyEventDto[] {
  const q = normalizePlateQuery(rawQuery)
  if (!q) return []
  return events.filter((e) => plateMatchesQuery(e.normalizedPlate ?? '', q))
}

export type InterplantHint = {
  plate: string
  ricEgAt: string
  slIngAt: string
  deltaMs: number
  journeyUidRicardone: string
  journeyUidSanLorenzo: string
}

function lastOccurredWithLogical(j: ReconstructedRealJourney, logical: string): string | null {
  for (let i = j.events.length - 1; i >= 0; i--) {
    const pt = normalizeRealEventPoint(j.events[i])
    if (pt.logicalCode === logical && pt.siteId === 'ricardone') return j.events[i].occurredAt
  }
  return null
}

function firstOccurredWithLogical(j: ReconstructedRealJourney, logical: string): string | null {
  for (const e of j.events) {
    const pt = normalizeRealEventPoint(e)
    if (pt.logicalCode === logical && pt.siteId === 'san_lorenzo') return e.occurredAt
  }
  return null
}

/**
 * EGRESO Ricardone seguido de SL_INGRESO en otra ventana journey, misma patente, dentro de `windowMs`.
 * Solo indicio de auditoría; no modifica clasificación.
 */
export function detectRicardoneEgressToSanLorenzoWindow(
  journeys: ReconstructedRealJourney[],
  windowMs: number
): InterplantHint[] {
  const byPlate = new Map<string, ReconstructedRealJourney[]>()
  for (const j of journeys) {
    const p = (j.normalizedPlate || j.plate || '').trim()
    if (!p) continue
    if (!byPlate.has(p)) byPlate.set(p, [])
    byPlate.get(p)!.push(j)
  }

  const out: InterplantHint[] = []

  for (const [plate, list] of byPlate) {
    const sorted = [...list].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    for (let i = 0; i < sorted.length; i++) {
      const jR = sorted[i]
      const eg = lastOccurredWithLogical(jR, 'EGRESO')
      if (!eg) continue
      const tEg = new Date(eg).getTime()
      if (!Number.isFinite(tEg)) continue

      for (let k = i + 1; k < sorted.length; k++) {
        const jS = sorted[k]
        const sl = firstOccurredWithLogical(jS, 'SL_INGRESO')
        if (!sl) continue
        const tSl = new Date(sl).getTime()
        if (!Number.isFinite(tSl) || tSl < tEg) continue
        const delta = tSl - tEg
        if (delta >= 0 && delta <= windowMs) {
          out.push({
            plate,
            ricEgAt: eg,
            slIngAt: sl,
            deltaMs: delta,
            journeyUidRicardone: jR.journeyUid,
            journeyUidSanLorenzo: jS.journeyUid,
          })
          break
        }
      }
    }
  }

  return out
}

export function buildPlateEventRows(events: RealJourneyEventDto[], journeyByUid: Map<string, ReconstructedRealJourney>) {
  const eventInstant = (e: RealJourneyEventDto) => getEventOperationalInstantIso(e) || e.occurredAt
  const sorted = [...events].sort((a, b) => new Date(eventInstant(a)).getTime() - new Date(eventInstant(b)).getTime())
  return sorted.map((e) => {
    const pt = normalizeRealEventPoint(e)
    const j = journeyByUid.get(e.journeyUid)
    const occurredAt = eventInstant(e)
    return {
      occurredAt,
      day: occurredAtLocalDayKey(occurredAt),
      journeyUid: e.journeyUid,
      sequenceNumber: e.sequenceNumber,
      truckPlateOcr: (e.rawTruckPlate ?? e.truckPlate ?? '').trim(),
      normalizedPlate: e.normalizedPlate ?? '',
      isValidPlate: e.isValidPlate,
      sectorCode: e.sectorCode,
      deviceCode: e.deviceCode,
      pointLabel: pt.pointLabel,
      logicalCode: pt.logicalCode,
      eventType: e.eventType,
      preliminaryCircuitCode: j?.preliminaryCircuitCode ?? '—',
      qualityFlags: j?.qualityFlags ?? [],
    }
  })
}

export function exportPlateEventsToCsv(rows: ReturnType<typeof buildPlateEventRows>): string {
  const headers = [
    'occurredAt',
    'day',
    'journeyUid',
    'sequenceNumber',
    'truckPlateOcr',
    'normalizedPlate',
    'isValidPlate',
    'sectorCode',
    'deviceCode',
    'pointLabel',
    'logicalCode',
    'eventType',
    'preliminaryCircuitCode',
    'qualityFlags',
  ] as const
  const esc = (v: string | number) => {
    const s = String(v).replace(/"/g, '""')
    return `"${s}"`
  }
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        esc(r.occurredAt),
        esc(r.day),
        esc(r.journeyUid),
        esc(r.sequenceNumber),
        esc(r.truckPlateOcr),
        esc(r.normalizedPlate),
        r.isValidPlate ? 'true' : 'false',
        esc(r.sectorCode),
        esc(r.deviceCode),
        esc(r.pointLabel),
        esc(r.logicalCode),
        esc(r.eventType),
        esc(r.preliminaryCircuitCode),
        esc(r.qualityFlags.join('|')),
      ].join(',')
    ),
  ]
  return lines.join('\r\n')
}

export function summarizeQualityFlagsAcross(journeys: ReconstructedRealJourney[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const j of journeys) {
    for (const f of j.qualityFlags) {
      m.set(f, (m.get(f) ?? 0) + 1)
    }
  }
  return new Map([...m.entries()].sort((a, b) => b[1] - a[1]))
}
