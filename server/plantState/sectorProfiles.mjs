/**
 * Perfiles de sector por planta — solo datos, sin lógica.
 * Capacidades Ricardone de SECTOR_CAPACITY_RICARDONE (S-code).
 *
 * Los códigos de sector y los dispositivos de Ricardone y San Lorenzo son
 * disjuntos, así que conviven en una sola tabla. Lo que SÍ es por planta es la
 * *enumeración*: un snapshot de San Lorenzo no debe listar sectores de
 * Ricardone en cero. Para eso está el campo `site` y `sectorCodesOfSite`.
 *
 * San Lorenzo todavía no tiene relevamiento de capacidades ni de tasas: van en
 * `null` a propósito. Un número inventado se propaga a ocupación, estado y ETA
 * de espera, y ahí ya no se distingue de uno medido.
 */

/**
 * @typedef {'gate'|'queue'|'process'|'buffer'|'scale'|'discharge'|'load'|'exit'} SectorType
 * @typedef {{ site: string, type: SectorType, label: string, capacity: number|null, edgeId: string }} SectorProfile
 */

/** @type {Record<string, SectorProfile>} */
export const SECTOR_PROFILES = {
  RICARDONE_INGRESO_CAMIONES: { site: 'ricardone', type: 'gate', label: 'Ingreso', capacity: 28, edgeId: 'EDGE_INGRESO' },
  RICARDONE_PREINGRESO: { site: 'ricardone', type: 'queue', label: 'Preingreso', capacity: 263, edgeId: 'EDGE_PREINGRESO' },
  RICARDONE_CALADA: { site: 'ricardone', type: 'process', label: 'Calada', capacity: 39, edgeId: 'EDGE_CALADA' },
  RICARDONE_BALANZA: { site: 'ricardone', type: 'scale', label: 'Balanza', capacity: 14, edgeId: 'EDGE_BALANZA' },
  S6: { site: 'ricardone', type: 'buffer', label: 'Playa 3', capacity: 141, edgeId: 'EDGE_PLAYA' },
  RICARDONE_VOLCABLE: { site: 'ricardone', type: 'discharge', label: 'Volcables', capacity: 44, edgeId: 'EDGE_DESCARGA' },
  RICARDONE_CELDA_16: { site: 'ricardone', type: 'discharge', label: 'Celda 16', capacity: 44, edgeId: 'EDGE_DESCARGA' },
  S7: { site: 'ricardone', type: 'load', label: 'Despacho silos', capacity: 44, edgeId: 'EDGE_SILOS' },
  S8: { site: 'ricardone', type: 'load', label: 'Carga silo Chief', capacity: 44, edgeId: 'EDGE_SILOS' },
  RICARDONE_EGRESO_CAMIONES: { site: 'ricardone', type: 'exit', label: 'Egreso', capacity: 39, edgeId: 'EDGE_EGRESO' },

  // San Lorenzo — capacidad sin relevar (ver nota de cabecera).
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: { site: 'san_lorenzo', type: 'gate', label: 'Ingreso', capacity: null, edgeId: 'SL_EDGE_INGRESO' },
  PUERTO_SAN_LORENZO_BALANZA_INGRESO: { site: 'san_lorenzo', type: 'scale', label: 'Balanza ingreso', capacity: null, edgeId: 'SL_EDGE_BALANZA_ING' },
  PUERTO_SAN_LORENZO_CALADA: { site: 'san_lorenzo', type: 'process', label: 'Calada', capacity: null, edgeId: 'SL_EDGE_CALADA' },
  PUERTO_SAN_LORENZO_VOLCABLE: { site: 'san_lorenzo', type: 'discharge', label: 'Volcables', capacity: null, edgeId: 'SL_EDGE_DESCARGA' },
  PUERTO_SAN_LORENZO_BALANZA_SALIDA: { site: 'san_lorenzo', type: 'scale', label: 'Balanza salida', capacity: null, edgeId: 'SL_EDGE_BALANZA_SAL' },
  PUERTO_SAN_LORENZO_EGRESO_CAMIONES: { site: 'san_lorenzo', type: 'exit', label: 'Egreso', capacity: null, edgeId: 'SL_EDGE_EGRESO' },
  Liquido_2: { site: 'san_lorenzo', type: 'scale', label: 'Balanza líquidos', capacity: null, edgeId: 'SL_EDGE_BALANZA_LIQ' },
  INGRESO_RENOVA: { site: 'san_lorenzo', type: 'gate', label: 'Ingreso Renova', capacity: null, edgeId: 'SL_EDGE_RENOVA' },
  PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1: { site: 'san_lorenzo', type: 'discharge', label: 'Líquidos punto 1', capacity: null, edgeId: 'SL_EDGE_LIQUIDOS' },
}

export const DEFAULT_SITE = 'ricardone'

/** @param {string} site */
export function normalizeSiteKey(site) {
  const s = String(site ?? '').trim().toLowerCase()
  if (s === 'sanlorenzo' || s === 'san-lorenzo') return 'san_lorenzo'
  return s || DEFAULT_SITE
}

/**
 * Sectores que pertenecen a una planta. La UI de San Lorenzo no debe recibir
 * los sectores de Ricardone en cero, ni al revés.
 * @param {string} site
 * @returns {string[]}
 */
export function sectorCodesOfSite(site) {
  const key = normalizeSiteKey(site)
  return Object.entries(SECTOR_PROFILES)
    .filter(([, p]) => p.site === key)
    .map(([code]) => code)
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

  // San Lorenzo — espejo de public/plant/san_lorenzo/plantZones.json.
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: ['SLZIngCamFrente', 'SLZIngCamTrasera'],
  PUERTO_SAN_LORENZO_BALANZA_INGRESO: ['SLZBalIngFte', 'SLZBalIngTras'],
  PUERTO_SAN_LORENZO_CALADA: ['SLZCalado'],
  PUERTO_SAN_LORENZO_VOLCABLE: ['SLZVolcableC1', 'SLZVolcableC2', 'SLZVolcableC3', 'SLZVolcableC4', 'SLZVolcableC5'],
  PUERTO_SAN_LORENZO_BALANZA_SALIDA: ['SLZBalSC1Fte', 'SLZBalSC1Tras', 'SLZBalSC2Fte', 'SLZBalSC2Tras'],
  PUERTO_SAN_LORENZO_EGRESO_CAMIONES: ['SLZSalidaC1Fte', 'SLZSalidaC1Tras', 'SLZSalidaC2Fte', 'SLZSalidaC2Tras'],
  Liquido_2: ['SLZBalLiq1a', 'SLZBalLiq1b', 'SLZBalLiq2a', 'SLZBalLiq2b'],
  INGRESO_RENOVA: ['SLZTK400'],
  PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1: ['RenCargFte', 'RenCargTras', 'RenDescFte', 'RenDescTras'],
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
  SL_EDGE_INGRESO: 'Edge Ingreso SL',
  SL_EDGE_BALANZA_ING: 'Edge Balanza ingreso SL',
  SL_EDGE_CALADA: 'Edge Calada SL',
  SL_EDGE_DESCARGA: 'Edge Volcables SL',
  SL_EDGE_BALANZA_SAL: 'Edge Balanza salida SL',
  SL_EDGE_BALANZA_LIQ: 'Edge Balanza líquidos SL',
  SL_EDGE_RENOVA: 'Edge Ingreso Renova',
  SL_EDGE_LIQUIDOS: 'Edge Líquidos SL',
  SL_EDGE_EGRESO: 'Edge Egreso SL',
  EDGE_INGRESO: 'Edge Ingreso',
  EDGE_PREINGRESO: 'Edge Preingreso',
  EDGE_CALADA: 'Edge Calada',
  EDGE_BALANZA: 'Edge Balanza',
  EDGE_PLAYA: 'Edge Playa',
  EDGE_DESCARGA: 'Edge Descarga',
  EDGE_SILOS: 'Edge Silos',
  EDGE_EGRESO: 'Edge Egreso',
}
