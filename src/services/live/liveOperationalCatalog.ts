import type { SiteId } from '../../domain/sites'
import { lookupRealSectorCode } from '../../data/realSectorCodeMap'
import { inferSiteIdFromSectorCode } from '../realJourneyEventsMapper'
import type { RealJourneyEventDto } from '../realJourneyEvents.types'
import type { NormalizedRealAlertView } from '../realAlertsInspector'

/** Ricardone, San Lorenzo o ambas plantas en la consola en vivo. */
export type LiveMonitorScope = SiteId | 'all'

/** Agrupa volcable 1 y 2 en una sola entrada del monitor. */
export const RICARDONE_VOLCABLE_GROUP_ID = 'RICARDONE_VOLCABLE'

const HIDDEN_SECTOR_CODES = new Set(['RICARDONE_VOLCABLE_1', 'RICARDONE_VOLCABLE_2'])

export type LiveSectorGroup = {
  id: string
  label: string
  sectorCodes: string[]
  devices: string[]
}

export type LiveSectorEntry =
  | { kind: 'group'; group: LiveSectorGroup }
  | { kind: 'sector'; sectorCode: string; label: string; devices: string[] }

type LiveSectorDef = { sectorCode: string; label: string; devices: string[] }

const RICARDONE_SECTORS: LiveSectorDef[] = [
  {
    sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    label: 'Ingreso camiones',
    devices: ['RicIngCamFrente', 'RicIngCamTrasera'],
  },
  {
    sectorCode: 'RICARDONE_PREINGRESO',
    label: 'Preingreso',
    devices: ['RicPreIngInFr', 'RicPreIngInTr', 'RicPreIngEgFr', 'RicPreIngEgTr'],
  },
  {
    sectorCode: 'RICARDONE_CALADA',
    label: 'Calada',
    devices: ['RicCalLiq', 'RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05', 'RicCal06'],
  },
  {
    sectorCode: 'RICARDONE_BALANZA',
    label: 'Balanza',
    devices: ['RicB1Ingreso', 'RicB1Egreso', 'RicB2Ingreso', 'RicB2Egreso', 'RicB3Ingreso', 'RicB3Egreso'],
  },
  {
    sectorCode: 'RICARDONE_EGRESO_CAMIONES',
    label: 'Egreso camiones',
    devices: ['RicEgrCamFrente', 'RicEgrCamTrasera'],
  },
  {
    sectorCode: 'RICARDONE_CELDA_16',
    label: 'Celda 16',
    devices: ['RicC16Descarga1', 'RicC16Descarga2', 'RicC16Carga1', 'RicC16Carga2'],
  },
]

const RICARDONE_VOLCABLE_GROUP: LiveSectorGroup = {
  id: RICARDONE_VOLCABLE_GROUP_ID,
  label: 'Ricardone volcable',
  /** La API envía `RICARDONE_VOLCABLE`; _1/_2 son alias históricos del mapa semanal. */
  sectorCodes: ['RICARDONE_VOLCABLE', 'RICARDONE_VOLCABLE_1', 'RICARDONE_VOLCABLE_2'],
  devices: ['RicVolcable1', 'RicVolcable2'],
}

import { lookupSanLorenzoCameraByDevice, SAN_LORENZO_CAMERAS } from '../../data/sanLorenzoCameraCatalog'

/** sectorCode ya en formato catálogo (RICARDONE_* / PUERTO_SAN_LORENZO_*). */
export function isCanonicalLiveSectorCode(sectorCode: string): boolean {
  const raw = String(sectorCode ?? '').trim()
  if (!raw) return false
  if (lookupRealSectorCode(raw)) return true
  const upper = raw.toUpperCase()
  return upper.startsWith('RICARDONE_') || upper.startsWith('PUERTO_SAN_LORENZO_')
}

let deviceToCanonicalSector: Map<string, string> | null = null

function liveDeviceToCanonicalSectorMap(): Map<string, string> {
  if (deviceToCanonicalSector) return deviceToCanonicalSector
  const map = new Map<string, string>()
  for (const plant of ['ricardone', 'san_lorenzo'] as SiteId[]) {
    for (const entry of getLiveSectorEntries(plant)) {
      const codes = entrySectorCodes(entry)
      const primary = codes[0]
      if (!primary) continue
      for (const dev of entryDevices(entry)) {
        map.set(dev.trim(), primary)
      }
    }
  }
  for (const cam of SAN_LORENZO_CAMERAS) {
    map.set(cam.deviceCode.trim(), cam.sectorCode)
  }
  deviceToCanonicalSector = map
  return map
}

/** Truckflow a veces envía sectorCode corto (`1-S1`, `2-S4`); el catálogo en vivo usa nombres canónicos. */
export function lookupCanonicalSectorByDevice(deviceCode: string): string | undefined {
  const dev = String(deviceCode ?? '').trim()
  if (!dev) return undefined
  const fromCatalog = liveDeviceToCanonicalSectorMap().get(dev)
  if (fromCatalog) return fromCatalog
  return lookupSanLorenzoCameraByDevice(dev)?.sectorCode
}

export function resolveCanonicalSectorForLiveFeed(sectorCode: string, deviceCode: string): string {
  const raw = String(sectorCode ?? '').trim()
  if (isCanonicalLiveSectorCode(raw)) return raw
  return lookupCanonicalSectorByDevice(deviceCode) ?? raw
}

export function inferLiveMonitorSiteId(sectorCode: string, deviceCode: string): SiteId | 'unknown' {
  const fromSector = inferSiteIdFromSectorCode(sectorCode)
  if (fromSector !== 'unknown') return fromSector
  const dev = String(deviceCode ?? '').trim()
  if (dev.startsWith('Ric')) return 'ricardone'
  if (/^SLZ/i.test(dev)) return 'san_lorenzo'
  const canonical = lookupCanonicalSectorByDevice(dev)
  if (canonical) return inferSiteIdFromSectorCode(canonical)
  return 'unknown'
}

function buildSanLorenzoSectorEntries(): LiveSectorEntry[] {
  const bySector = new Map<string, { label: string; devices: string[] }>()
  for (const cam of SAN_LORENZO_CAMERAS) {
    if (cam.installed === false || cam.rearExcluded) continue
    const mapped = lookupRealSectorCode(cam.sectorCode)
    const bucket = bySector.get(cam.sectorCode) ?? {
      label: mapped?.label?.trim() || cam.label.replace(/ San Lorenzo.*/i, '').trim() || cam.label,
      devices: [],
    }
    bucket.devices.push(cam.deviceCode)
    bySector.set(cam.sectorCode, bucket)
  }
  return [...bySector.entries()].map(([sectorCode, meta]) => ({
    kind: 'sector' as const,
    sectorCode,
    label: meta.label,
    devices: meta.devices,
  }))
}

const SAN_LORENZO_SECTORS: LiveSectorEntry[] = buildSanLorenzoSectorEntries()

export function getLiveSectorEntries(plant: SiteId): LiveSectorEntry[] {
  if (plant === 'avellaneda') return []
  if (plant === 'san_lorenzo') return SAN_LORENZO_SECTORS

  const out: LiveSectorEntry[] = RICARDONE_SECTORS.map((s) => ({
    kind: 'sector' as const,
    sectorCode: s.sectorCode,
    label: s.label,
    devices: [...s.devices],
  }))
  out.push({ kind: 'group', group: RICARDONE_VOLCABLE_GROUP })
  return out
}

/** Clave única cuando scope=all (evita colisión Ric/SL). */
export function scopedEntryKey(scope: LiveMonitorScope, entry: LiveSectorEntry, plant: SiteId): string {
  if (scope !== 'all') return entryKey(entry)
  return `${plant}:${entryKey(entry)}`
}

export function getLiveSectorEntriesForScope(scope: LiveMonitorScope): { plant: SiteId; entry: LiveSectorEntry }[] {
  if (scope === 'all') {
    return [
      ...getLiveSectorEntries('ricardone').map((entry) => ({ plant: 'ricardone' as const, entry })),
      ...getLiveSectorEntries('san_lorenzo').map((entry) => ({ plant: 'san_lorenzo' as const, entry })),
    ]
  }
  if (scope === 'avellaneda') return []
  return getLiveSectorEntries(scope).map((entry) => ({ plant: scope, entry }))
}

export function findLiveSectorEntryForScope(
  scope: LiveMonitorScope,
  key: string
): { plant: SiteId; entry: LiveSectorEntry } | undefined {
  return getLiveSectorEntriesForScope(scope).find((row) => scopedEntryKey(scope, row.entry, row.plant) === key)
}

export function filterEventsByMonitorScope(
  events: RealJourneyEventDto[],
  scope: LiveMonitorScope
): RealJourneyEventDto[] {
  if (scope === 'all') return events
  return events.filter((e) => inferLiveMonitorSiteId(e.sectorCode, e.deviceCode) === scope)
}

export function filterAlertsByMonitorScope(
  alerts: NormalizedRealAlertView[],
  scope: LiveMonitorScope
): NormalizedRealAlertView[] {
  if (scope === 'all') return alerts
  return alerts.filter((a) => inferLiveMonitorSiteId(a.sectorCode || '', a.deviceCode || '') === scope)
}

export function sectorDisplayName(code: string): string {
  const entry = lookupRealSectorCode(code)
  const label = entry?.label?.trim()
  const raw = code.trim()
  return label || raw || '—'
}

export function entryKey(entry: LiveSectorEntry): string {
  return entry.kind === 'group' ? entry.group.id : entry.sectorCode
}

export function entryLabel(entry: LiveSectorEntry): string {
  return entry.kind === 'group' ? entry.group.label : entry.label
}

export function entrySectorCodes(entry: LiveSectorEntry): string[] {
  return entry.kind === 'group' ? entry.group.sectorCodes : [entry.sectorCode]
}

export function entryDevices(entry: LiveSectorEntry): string[] {
  return entry.kind === 'group' ? entry.group.devices : entry.devices
}

export function isHiddenLiveSectorCode(sectorCode: string): boolean {
  return HIDDEN_SECTOR_CODES.has(sectorCode.trim().toUpperCase())
}

export function findLiveSectorEntry(plant: SiteId, key: string): LiveSectorEntry | undefined {
  return getLiveSectorEntries(plant).find((e) => entryKey(e) === key)
}

/** @deprecated Usar getLiveSectorEntries — compatibilidad con imports viejos */
export function getCatalogSectorCodesForLiveMonitor(plant: SiteId): string[] {
  return getLiveSectorEntries(plant)
    .flatMap((e) => entrySectorCodes(e))
    .filter((c) => !isHiddenLiveSectorCode(c))
}

export function getExpectedDevicesForLiveSector(sectorCode: string): readonly string[] {
  const key = (sectorCode ?? '').trim().toUpperCase()
  for (const entry of getLiveSectorEntries('ricardone')) {
    if (entry.kind === 'group') {
      if (entry.group.sectorCodes.includes(key)) return entry.group.devices
    } else if (entry.sectorCode === key) {
      return entry.devices
    }
  }
  for (const entry of SAN_LORENZO_SECTORS) {
    if (entry.kind === 'sector' && entry.sectorCode === key) return entry.devices
  }
  return []
}
