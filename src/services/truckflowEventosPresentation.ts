/**
 * Capa: analytics / presentación — filtros de eventos para vistas Ricardone.
 * No participa del motor v2 ni del comité interno.
 */
import type { RealJourneyEventDto } from './realJourneyEvents.types'
import { filterRicardoneSiteEventsOnly } from './realJourneyEventsMapper'

/**
 * Dataset para vista comité: Ricardone por sectorCode (`RICARDONE_*`),
 * sin San Lorenzo/Puerto, sin tipo LPR_MALFUNCTION (alertas fuera del alcance de esta vista).
 */
export function filterTruckflowPhysicalPresentationEvents(events: RealJourneyEventDto[]): RealJourneyEventDto[] {
  const ric = filterRicardoneSiteEventsOnly(events)
  return ric.filter((e) => (e.eventType || '').trim().toUpperCase() !== 'LPR_MALFUNCTION')
}

function localDayKey(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function localHourSlotKey(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:00`
}

export function inferVolumeChartMode(events: RealJourneyEventDto[]): 'day' | 'hour' {
  const keys = new Set<string>()
  for (const e of events) {
    const k = localDayKey(e.occurredAt)
    if (k) keys.add(k)
  }
  return keys.size >= 2 ? 'day' : 'hour'
}

export function buildVolumeSeries(events: RealJourneyEventDto[], mode: 'day' | 'hour'): { key: string; label: string; count: number }[] {
  const map = new Map<string, number>()
  for (const e of events) {
    const k = mode === 'day' ? localDayKey(e.occurredAt) : localHourSlotKey(e.occurredAt)
    if (!k) continue
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, label: mode === 'day' ? key : key.replace(' ', ' · '), count }))
}

export function groupingCode(events: RealJourneyEventDto[], field: 'sectorCode' | 'deviceCode'): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) {
    const raw = (field === 'sectorCode' ? e.sectorCode : e.deviceCode) ?? ''
    const code = raw.trim() || '(sin código)'
    m.set(code, (m.get(code) ?? 0) + 1)
  }
  return m
}

export type LowVolumeInsight = {
  /** Cámaras (deviceCode) en el cuartil inferior de volumen (con al menos 1 evento). */
  lowDeviceCount: number
  /** Sectores en el cuartil inferior. */
  lowSectorCount: number
  thresholdDevices: number
  thresholdSectors: number
}

function lowVolumeKeys(counts: Map<string, number>): { lowCount: number; threshold: number } {
  const values = [...counts.values()].filter((n) => n > 0).sort((a, b) => a - b)
  if (values.length === 0) return { lowCount: 0, threshold: 0 }
  const idx = Math.max(0, Math.floor(values.length * 0.25) - 1)
  const threshold = values[idx]!
  let lowCount = 0
  for (const [, c] of counts) {
    if (c <= threshold && c > 0) lowCount += 1
  }
  return { lowCount, threshold }
}

export function buildLowVolumeInsight(events: RealJourneyEventDto[]): LowVolumeInsight {
  const byDev = groupingCode(events, 'deviceCode')
  const bySec = groupingCode(events, 'sectorCode')
  const d = lowVolumeKeys(byDev)
  const s = lowVolumeKeys(bySec)
  return {
    lowDeviceCount: d.lowCount,
    lowSectorCount: s.lowCount,
    thresholdDevices: d.threshold,
    thresholdSectors: s.threshold,
  }
}

export function distinctNonEmptyDevices(events: RealJourneyEventDto[]): number {
  const s = new Set<string>()
  for (const e of events) {
    const d = (e.deviceCode ?? '').trim()
    if (d) s.add(d)
  }
  return s.size
}

export function distinctNonEmptySectors(events: RealJourneyEventDto[]): number {
  const s = new Set<string>()
  for (const e of events) {
    const sec = (e.sectorCode ?? '').trim()
    if (sec) s.add(sec)
  }
  return s.size
}

export function topEntry(counts: Map<string, number>): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count }
  }
  return best
}

export function toBarItems(counts: Map<string, number>, limit = 18): { id: string; label: string; count: number }[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ id: label, label, count }))
}
