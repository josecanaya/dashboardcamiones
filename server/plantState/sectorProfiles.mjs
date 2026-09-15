/**
 * Perfiles de sector Ricardone — solo datos, sin lógica.
 * Capacidades de SECTOR_CAPACITY_RICARDONE (S-code).
 */

/**
 * @typedef {'gate'|'queue'|'process'|'buffer'|'scale'|'discharge'|'load'|'exit'} SectorType
 * @typedef {{ type: SectorType, label: string, capacity: number|null, edgeId: string }} SectorProfile
 */

/** @type {Record<string, SectorProfile>} */
export const SECTOR_PROFILES = {
  RICARDONE_INGRESO_CAMIONES: { type: 'gate', label: 'Ingreso', capacity: 28, edgeId: 'EDGE_INGRESO' },
  RICARDONE_PREINGRESO: { type: 'queue', label: 'Preingreso', capacity: 263, edgeId: 'EDGE_PREINGRESO' },
  RICARDONE_CALADA: { type: 'process', label: 'Calada', capacity: 39, edgeId: 'EDGE_CALADA' },
  RICARDONE_BALANZA: { type: 'scale', label: 'Balanza', capacity: 14, edgeId: 'EDGE_BALANZA' },
  S6: { type: 'buffer', label: 'Playa 3', capacity: 141, edgeId: 'EDGE_PLAYA' },
  RICARDONE_VOLCABLE: { type: 'discharge', label: 'Volcables', capacity: 44, edgeId: 'EDGE_DESCARGA' },
  RICARDONE_CELDA_16: { type: 'discharge', label: 'Celda 16', capacity: 44, edgeId: 'EDGE_DESCARGA' },
  S7: { type: 'load', label: 'Despacho silos', capacity: 44, edgeId: 'EDGE_SILOS' },
  S8: { type: 'load', label: 'Carga silo Chief', capacity: 44, edgeId: 'EDGE_SILOS' },
  RICARDONE_EGRESO_CAMIONES: { type: 'exit', label: 'Egreso', capacity: 39, edgeId: 'EDGE_EGRESO' },
}

/**
 * @param {string} sectorCode
 * @returns {SectorProfile|null}
 */
export function getSectorProfile(sectorCode) {
  const key = String(sectorCode ?? '').trim()
  if (!key) return null
  return SECTOR_PROFILES[key] ?? null
}

/** Qué indicadores tienen sentido para cada tipo. La UI lee esto, no lo decide. */
export const KPI_BY_TYPE = {
  gate: ['rate60', 'present'],
  queue: ['present', 'occupancy', 'in60', 'out60', 'dwellP90'],
  process: ['present', 'rate60', 'dwellAvg', 'dwellP90', 'queueAhead'],
  buffer: ['present', 'occupancy', 'in60', 'out60', 'delta40', 'dwellP90'],
  scale: ['present', 'rate60', 'waitAvg', 'dwellAvg'],
  discharge: ['present', 'rate60', 'waitAvg', 'accumulationUpstream'],
  load: ['present', 'rate60', 'dwellAvg'],
  exit: ['rate60', 'queueAhead', 'balance60'],
}

/** Dispositivos esperados por sector (espejo del catálogo en vivo Ricardone). */
export const SECTOR_DEVICES = {
  RICARDONE_INGRESO_CAMIONES: ['RicIngCamFrente', 'RicIngCamTrasera'],
  RICARDONE_PREINGRESO: ['RicPreIngInFr', 'RicPreIngInTr', 'RicPreIngEgFr', 'RicPreIngEgTr'],
  RICARDONE_CALADA: ['RicCalLiq', 'RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05', 'RicCal06'],
  RICARDONE_BALANZA: ['RicB1Ingreso', 'RicB1Egreso', 'RicB2Ingreso', 'RicB2Egreso', 'RicB3Ingreso', 'RicB3Egreso'],
  S6: ['RicS6Playa3'],
  RICARDONE_VOLCABLE: ['RicVolcable1', 'RicVolcable2'],
  RICARDONE_CELDA_16: ['RicC16Descarga1', 'RicC16Descarga2', 'RicC16Carga1', 'RicC16Carga2'],
  S7: ['RicS7DescLinea1', 'RicS7DescLinea2', 'RicS7Carga'],
  S8: ['RicS8CargaLinea1', 'RicS8CargaLinea2'],
  RICARDONE_EGRESO_CAMIONES: ['RicEgrCamFrente', 'RicEgrCamTraser'],
}

/** Alias históricos → sector con perfil. */
const SECTOR_ALIASES = {
  RICARDONE_VOLCABLE_1: 'RICARDONE_VOLCABLE',
  RICARDONE_VOLCABLE_2: 'RICARDONE_VOLCABLE',
}

const deviceToSector = (() => {
  /** @type {Map<string, string>} */
  const map = new Map()
  for (const [sectorCode, devices] of Object.entries(SECTOR_DEVICES)) {
    for (const d of devices) map.set(d, sectorCode)
  }
  return map
})()

/**
 * @param {string} sectorCode
 * @param {string} deviceCode
 * @returns {string}
 */
export function resolveCanonicalSectorForLiveFeed(sectorCode, deviceCode) {
  const raw = String(sectorCode ?? '').trim()
  if (raw && (SECTOR_PROFILES[raw] || SECTOR_ALIASES[raw])) {
    return SECTOR_ALIASES[raw] ?? raw
  }
  const fromDevice = deviceToSector.get(String(deviceCode ?? '').trim())
  if (fromDevice) return fromDevice
  return SECTOR_ALIASES[raw] ?? raw
}

export const EDGE_LABELS = {
  EDGE_INGRESO: 'Edge Ingreso',
  EDGE_PREINGRESO: 'Edge Preingreso',
  EDGE_CALADA: 'Edge Calada',
  EDGE_BALANZA: 'Edge Balanza',
  EDGE_PLAYA: 'Edge Playa',
  EDGE_DESCARGA: 'Edge Descarga',
  EDGE_SILOS: 'Edge Silos',
  EDGE_EGRESO: 'Edge Egreso',
}
