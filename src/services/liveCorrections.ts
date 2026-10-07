import type { RealJourneyEventDto } from '../etl-core/domain/journeyEvents.types'

/**
 * Correcciones hechas por operaciones en «En vivo» (bandeja de patentes, vínculos de lecturas
 * anteriores, descartes) aplicadas a los eventos de cámara del ETL, antes de clasificar.
 * Así el análisis y el informe semanal usan las mismas patentes que se corrigieron en planta.
 *
 * La clave es la misma que usa el reconocedor en vivo (server/plantState/plateIdentification.mjs
 * `journeyKeyOf`): el journeyUid, o `PATENTE#bloque de 12 h` (hora operativa) si el viaje no tiene uid.
 */
export type LiveCorrection = {
  site: string
  key: string
  kind: 'rename' | 'drop'
  plate?: string | null
  /** Viaje al que se suman las lecturas (vínculo / confirmación con candidato). */
  journeyUid?: string | null
  source: string
  decidedAt?: string | null
}

export type LiveCorrectionsDocument = { generatedAt: string; corrections: LiveCorrection[] }

const SENSOR_CLOCK_SKEW_MS = 206 * 60_000
const TWELVE_H_MS = 12 * 60 * 60 * 1000

function liveKeyOf(e: RealJourneyEventDto): string {
  const uid = String(e.journeyUid ?? '').trim()
  if (uid) return uid
  const t = Date.parse(String(e.occurredAt ?? e.recordedAt ?? '')) + SENSOR_CLOCK_SKEW_MS
  const plate = String(e.normalizedPlate || e.truckPlate || e.rawTruckPlate || '')
  return `${plate || 'NOPLATE'}#${Math.floor(t / TWELVE_H_MS)}`
}

export function applyLiveCorrections(
  events: RealJourneyEventDto[],
  doc: LiveCorrectionsDocument | null | undefined
): { events: RealJourneyEventDto[]; renamed: number; dropped: number; rules: number } {
  const list = doc?.corrections ?? []
  if (!list.length) return { events, renamed: 0, dropped: 0, rules: 0 }
  const byKey = new Map(list.map((c) => [c.key, c]))
  let renamed = 0
  let dropped = 0
  const out: RealJourneyEventDto[] = []
  for (const e of events) {
    const c = byKey.get(liveKeyOf(e))
    if (!c) { out.push(e); continue }
    if (c.kind === 'drop') { dropped++; continue }
    if (c.kind === 'rename' && c.plate) {
      renamed++
      out.push({ ...e, truckPlate: c.plate, normalizedPlate: c.plate, isValidPlate: true, journeyUid: c.journeyUid || e.journeyUid })
      continue
    }
    out.push(e)
  }
  return { events: out, renamed, dropped, rules: list.length }
}
