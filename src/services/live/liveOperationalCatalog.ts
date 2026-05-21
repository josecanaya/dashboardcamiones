import type { SiteId } from '../../domain/sites'
import { lookupRealSectorCode } from '../../data/realSectorCodeMap'

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

const SAN_LORENZO_SECTORS: LiveSectorEntry[] = [
  {
    kind: 'sector',
    sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
    label: 'Ingreso San Lorenzo',
    devices: ['SLZIngCamFrente'],
  },
]

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
