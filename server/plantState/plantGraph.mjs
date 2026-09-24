/**
 * Grafo operativo de Ricardone: PUNTOS (donde se procesa) y ZONAS (donde se espera).
 *
 * La corrección de fondo: un camión no está "en la cámara" que lo leyó, está en el
 * espacio que viene después. Si pasó preingreso, está en Playa 1 hasta que pase por
 * calada. Lo que se acumula son los espacios entre puntos — eso es el backlog.
 *
 * Tasas y capacidades: docs/traspaso del modelo de capacidades (09-09-2026).
 * Este archivo es SOLO DATOS + resolución. Sin I/O.
 */

import { SECTOR_DEVICES, DEFAULT_SITE, normalizeSiteKey } from './sectorProfiles.mjs'

/**
 * @typedef {{
 *   id: string, site: string, sectorCode: string, logical: string, label: string,
 *   ratePerHour: number|null, note?: string, exclusiveWith?: string,
 *   loadDevices?: string[], stockMaxT?: number
 * }} PlantPoint
 */

/** Puntos de proceso. `ratePerHour` es lo que drena la zona que llega al punto. */
export const POINTS = {
  INGRESO: {
    id: 'INGRESO',
    site: 'ricardone',
    sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    logical: 'S0',
    label: 'Ingreso',
    ratePerHour: null,
    note: 'punto de control, sin tasa relevada',
  },
  PREINGRESO: {
    id: 'PREINGRESO',
    site: 'ricardone',
    sectorCode: 'RICARDONE_PREINGRESO',
    logical: 'S1',
    label: 'Preingreso',
    ratePerHour: null,
    note: 'punto de control, sin tasa relevada',
  },
  CALADA: {
    id: 'CALADA',
    site: 'ricardone',
    sectorCode: 'RICARDONE_CALADA',
    logical: 'S2',
    label: 'Calada',
    ratePerHour: 60,
    note: '2 de 3 caladores a 30/h; con los 3 son 90/h. 6 calles, -20 min por cambio de turno',
  },
  BALANZA: {
    id: 'BALANZA',
    site: 'ricardone',
    sectorCode: 'RICARDONE_BALANZA',
    logical: 'S4',
    label: 'Balanza',
    ratePerHour: 38,
    note: '1,5 min por pesaje — misma tasa que las balanzas de San Lorenzo (confirmado 14-09)',
  },
  PLAYA3: {
    id: 'PLAYA3',
    site: 'ricardone',
    sectorCode: 'S6',
    logical: 'S6',
    label: 'Playa 3',
    ratePerHour: null,
    note: 'no procesa: solo espera y clasificación por destino',
  },
  VOLCABLES: {
    id: 'VOLCABLES',
    site: 'ricardone',
    sectorCode: 'RICARDONE_VOLCABLE',
    logical: 'S9',
    label: 'Volcables',
    ratePerHour: 4.5,
    note: '4-5/h entre los dos, no cada uno. Limpieza 1 h diaria',
  },
  CELDA16: {
    id: 'CELDA16',
    site: 'ricardone',
    sectorCode: 'RICARDONE_CELDA_16',
    logical: 'S5',
    label: 'Celda 16',
    ratePerHour: 11,
    note: '2 plataformas, 11/h entre ambas. No puede recibir y cargar a la vez (carga 5/h)',
    loadDevices: ['RicC16Carga1', 'RicC16Carga2'],
    stockMaxT: 100000,
  },
  SILOS: {
    id: 'SILOS',
    site: 'ricardone',
    sectorCode: 'S7',
    logical: 'S7',
    label: 'Silos',
    ratePerHour: 9,
    note: 'Keppler 4-5/h + Chief 4-5/h. No simultáneo con la carga desde silos (12-15/h)',
    loadDevices: ['RicS7Carga'],
    exclusiveWith: 'CARGA_SILOS',
  },
  CARGA_SILOS: {
    id: 'CARGA_SILOS',
    site: 'ricardone',
    sectorCode: 'S8',
    logical: 'S8',
    label: 'Carga silo Chief',
    ratePerHour: 13.5,
    note: '3 puntos a 4-5/h. Excluyente con la recepción de silos',
    loadDevices: ['RicS8CargaLinea1', 'RicS8CargaLinea2'],
    exclusiveWith: 'SILOS',
  },
  EGRESO: {
    id: 'EGRESO',
    site: 'ricardone',
    sectorCode: 'RICARDONE_EGRESO_CAMIONES',
    logical: 'S10',
    label: 'Egreso',
    ratePerHour: 120,
    note: '~30 segundos por camión',
  },

  /*
   * San Lorenzo. La cadena operativa es la de SL_OPERATIONAL_KPI_CHAIN en
   * etlSegmentTimingRules: ingreso -> balanza ingreso -> volcable -> egreso, con
   * calada y balanza de salida como pasos intermedios reales.
   *
   * `ratePerHour: null` en todos: no hay relevamiento de tasas en el puerto.
   * Con tasa null, drainMinutes devuelve null y la pantalla muestra "sin dato"
   * en vez de una espera estimada que nadie midio.
   */
  SL_INGRESO: {
    id: 'SL_INGRESO',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_INGRESO_CAMIONES',
    logical: 'SL_S0',
    label: 'Ingreso',
    ratePerHour: null,
    note: 'punto de control, sin tasa relevada',
  },
  SL_BALANZA_INGRESO: {
    id: 'SL_BALANZA_INGRESO',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
    logical: 'SL_S1',
    label: 'Balanza ingreso',
    ratePerHour: null,
    note: 'sin tasa relevada en el puerto',
  },
  SL_CALADA: {
    id: 'SL_CALADA',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_CALADA',
    logical: 'SL_S2',
    label: 'Calada',
    ratePerHour: null,
    note: 'sin tasa relevada en el puerto',
  },
  SL_BALANZA_LIQUIDOS: {
    id: 'SL_BALANZA_LIQUIDOS',
    site: 'san_lorenzo',
    sectorCode: 'Liquido_2',
    logical: 'SL_S6',
    label: 'Balanza liquidos',
    ratePerHour: null,
    note: 'sin tasa relevada en el puerto',
  },
  SL_VOLCABLE: {
    id: 'SL_VOLCABLE',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_VOLCABLE',
    logical: 'SL_S4',
    label: 'Volcables',
    ratePerHour: null,
    note: '5 calles VOLCABLE PTO; sin tasa relevada',
  },
  SL_BALANZA_SALIDA: {
    id: 'SL_BALANZA_SALIDA',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_BALANZA_SALIDA',
    logical: 'SL_S5',
    label: 'Balanza salida',
    ratePerHour: null,
    note: 'sin tasa relevada en el puerto',
  },
  SL_EGRESO: {
    id: 'SL_EGRESO',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_EGRESO_CAMIONES',
    logical: 'SL_S7',
    label: 'Egreso',
    ratePerHour: null,
    note: 'sin tasa relevada en el puerto',
  },
  SL_INGRESO_RENOVA: {
    id: 'SL_INGRESO_RENOVA',
    site: 'san_lorenzo',
    sectorCode: 'INGRESO_RENOVA',
    logical: 'SL_S8',
    label: 'Ingreso Renova',
    ratePerHour: null,
    note: 'camara SLZTK400',
  },
  SL_LIQUIDOS_1: {
    id: 'SL_LIQUIDOS_1',
    site: 'san_lorenzo',
    sectorCode: 'PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1',
    logical: 'SL_S10',
    label: 'Liquidos punto 1',
    ratePerHour: null,
    note: 'carga y descarga Renova; sin tasa relevada',
  },
}

/** Puntos que drenan Playa 3 (todos los destinos de descarga/carga). */
const DISCHARGE_POINTS = ['VOLCABLES', 'CELDA16', 'SILOS', 'CARGA_SILOS']

/** Puntos de descarga de San Lorenzo: despues de ellos el camion vuelve a pesar. */
const SL_DISCHARGE_POINTS = ['SL_VOLCABLE', 'SL_LIQUIDOS_1']

/**
 * @typedef {{
 *   id: string, site: string, label: string, from: string|null, to: string[],
 *   capacityPhysical: number|null, capacityOperational: number|null,
 *   role?: 'access'|'postDischarge'|'fallback',
 *   pending?: string, note?: string
 * }} PlantZone
 */

/**
 * Zonas de espera. `from` es el punto que dejó el camión; `to`, los puntos que la drenan.
 * Orden = orden de lectura en la pantalla.
 * @type {PlantZone[]}
 */
export const ZONES = [
  {
    id: 'Z0',
    site: 'ricardone',
    role: 'access',
    label: 'Acceso',
    from: null,
    to: ['INGRESO'],
    capacityPhysical: 28,
    capacityOperational: 28,
  },
  {
    id: 'Z1',
    site: 'ricardone',
    label: 'Ingreso → Preingreso',
    from: 'INGRESO',
    to: ['PREINGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z2',
    site: 'ricardone',
    label: 'Playa 1',
    from: 'PREINGRESO',
    to: ['CALADA'],
    capacityPhysical: 263,
    capacityOperational: 450,
    pending: 'definir si Playa 1 son los 263 de densidad o parte de los 450 de las dos playas',
  },
  {
    id: 'Z3',
    site: 'ricardone',
    label: 'Calada → Balanza',
    from: 'CALADA',
    to: ['BALANZA'],
    capacityPhysical: 39,
    capacityOperational: 39,
  },
  {
    id: 'Z4',
    site: 'ricardone',
    label: 'Calada → Egreso',
    from: 'CALADA',
    to: ['EGRESO'],
    capacityPhysical: 39,
    capacityOperational: 39,
    note: 'R7 no pesa en Ricardone',
  },
  {
    id: 'Z3U',
    site: 'ricardone',
    label: 'Calada → destino indeterminado',
    from: 'CALADA',
    to: [],
    capacityPhysical: null,
    capacityOperational: null,
    note: 'el circuito todavía no se puede determinar por prefijo; si crece es cobertura floja',
  },
  {
    id: 'Z5',
    site: 'ricardone',
    label: 'Balanza → descarga',
    from: 'BALANZA',
    to: ['PLAYA3', ...DISCHARGE_POINTS],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z6',
    site: 'ricardone',
    label: 'Playa 3',
    from: 'PLAYA3',
    to: DISCHARGE_POINTS,
    capacityPhysical: 141,
    capacityOperational: 30,
    note: 'solo espera y clasificación por destino; nunca debe llenarse porque bloquea circulación',
  },
  {
    id: 'Z7',
    site: 'ricardone',
    role: 'postDischarge',
    label: 'Descarga → Balanza',
    from: '*DESCARGA',
    to: ['BALANZA'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z8',
    site: 'ricardone',
    label: 'Balanza → Egreso',
    from: 'BALANZA',
    to: ['EGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'ZX',
    site: 'ricardone',
    role: 'fallback',
    label: 'Otros tramos',
    from: '*',
    to: [],
    capacityPhysical: null,
    capacityOperational: null,
    note: 'pares from→to no declarados; visible a propósito para no perder camiones',
  },

  /*
   * San Lorenzo. Los ids Z0 y Z1 son los mismos que
   * public/plant/san_lorenzo/plantZones.json: el plano pinta el poligono de una
   * zona buscando su zoneId en el snapshot, asi que tienen que coincidir o el
   * sector queda dibujado pero muerto.
   *
   * Capacidades: Playa OSL 150 y Balanza-Volcable 20 camiones (dato de planta,
   * 21-09-2026). El resto queda en null hasta que se releve: un numero inventado
   * se propaga a ocupacion, estado y ETA sin distinguirse de uno medido.
   */
  {
    id: 'SL_ACCESO',
    site: 'san_lorenzo',
    role: 'access',
    label: 'Acceso',
    from: null,
    to: ['SL_INGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z0',
    site: 'san_lorenzo',
    label: 'Playa OSL',
    from: 'SL_INGRESO',
    to: ['SL_BALANZA_INGRESO'],
    capacityPhysical: 150,
    capacityOperational: 150,
    note: 'espera entre ingreso y balanza; SL_INGRESO_TO_BALANZA_MAX_MINUTES la trata como cola',
  },
  {
    id: 'Z1',
    site: 'san_lorenzo',
    label: 'Balanza-Volcable',
    from: 'SL_BALANZA_INGRESO',
    to: ['SL_CALADA', 'SL_VOLCABLE'],
    capacityPhysical: 20,
    capacityOperational: 20,
  },
  {
    id: 'SL_Z2',
    site: 'san_lorenzo',
    label: 'Calada -> Volcable',
    from: 'SL_CALADA',
    to: ['SL_VOLCABLE'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'SL_Z3',
    site: 'san_lorenzo',
    role: 'postDischarge',
    label: 'Descarga -> Balanza salida',
    from: '*DESCARGA',
    to: ['SL_BALANZA_SALIDA'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'SL_Z4',
    site: 'san_lorenzo',
    label: 'Balanza salida -> Egreso',
    from: 'SL_BALANZA_SALIDA',
    to: ['SL_EGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'SL_Z5',
    site: 'san_lorenzo',
    label: 'Renova -> Liquidos',
    from: 'SL_INGRESO_RENOVA',
    to: ['SL_LIQUIDOS_1'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'SL_Z6',
    site: 'san_lorenzo',
    label: 'Balanza liquidos -> Liquidos',
    from: 'SL_BALANZA_LIQUIDOS',
    to: ['SL_LIQUIDOS_1'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'SL_ZX',
    site: 'san_lorenzo',
    role: 'fallback',
    label: 'Otros tramos',
    from: '*',
    to: [],
    capacityPhysical: null,
    capacityOperational: null,
    note: 'pares from->to no declarados; visible a proposito para no perder camiones',
  },
]

/*
 * Los ids de zona NO son unicos entre plantas: San Lorenzo reusa Z0 y Z1 porque
 * son los que trae su plano. Por eso el indice es por sitio, y todo lo que
 * resuelve una zona recibe el sitio.
 */
const ZONE_BY_SITE = (() => {
  /** @type {Map<string, Map<string, PlantZone>>} */
  const m = new Map()
  for (const z of ZONES) {
    let byId = m.get(z.site)
    if (!byId) {
      byId = new Map()
      m.set(z.site, byId)
    }
    byId.set(z.id, z)
  }
  return m
})()

/** @param {string} site @returns {PlantZone[]} */
export function zonesOfSite(site) {
  const key = normalizeSiteKey(site)
  return ZONES.filter((z) => z.site === key)
}

/** @param {string} site @returns {string[]} ids de punto de esa planta */
export function pointIdsOfSite(site) {
  const key = normalizeSiteKey(site)
  return Object.values(POINTS)
    .filter((p) => p.site === key)
    .map((p) => p.id)
}

/**
 * Primera zona de un rol dentro de una planta. Evita hardcodear 'Z0'/'Z7'/'ZX',
 * que solo existen con ese significado en Ricardone.
 * @param {string} site
 * @param {'access'|'postDischarge'|'fallback'} role
 */
function zoneOfRole(site, role) {
  const key = normalizeSiteKey(site)
  return ZONES.find((z) => z.site === key && z.role === role) ?? null
}

const POINT_BY_SECTOR = (() => {
  /** @type {Map<string, string>} */
  const m = new Map()
  for (const p of Object.values(POINTS)) m.set(p.sectorCode, p.id)
  return m
})()

const POINT_BY_LOGICAL = (() => {
  /** @type {Map<string, string>} */
  const m = new Map()
  for (const p of Object.values(POINTS)) m.set(p.logical, p.id)
  // S3 aparece en algunas plantillas como salida; para el grafo es egreso.
  m.set('S3', 'EGRESO')
  return m
})()

/** Dispositivos que indican CARGA (no recepción) por punto. */
export const LOAD_DEVICES = (() => {
  /** @type {Map<string, string[]>} */
  const m = new Map()
  for (const p of Object.values(POINTS)) {
    if (p.loadDevices?.length) m.set(p.id, p.loadDevices)
  }
  return m
})()

/** @param {string} sectorCode @returns {string|null} */
export function pointOfSector(sectorCode) {
  return POINT_BY_SECTOR.get(String(sectorCode ?? '').trim()) ?? null
}

/** @param {string|null} logical @returns {string|null} */
export function pointOfLogical(logical) {
  if (!logical) return null
  return POINT_BY_LOGICAL.get(String(logical).trim()) ?? null
}

/** @param {string} zoneId @param {string} [site] @returns {PlantZone|null} */
export function getZone(zoneId, site = DEFAULT_SITE) {
  return ZONE_BY_SITE.get(normalizeSiteKey(site))?.get(zoneId) ?? null
}

/** @param {string} pointId */
export function isDischargePoint(pointId) {
  return DISCHARGE_POINTS.includes(pointId) || SL_DISCHARGE_POINTS.includes(pointId)
}

/**
 * Resuelve en qué zona espera un camión.
 * @param {string|null} fromPoint  punto de la última lectura
 * @param {string|null} toPoint    próximo punto esperado (de la plantilla del circuito)
 * @param {string} [site]
 * @returns {PlantZone}
 */
export function resolveZone(fromPoint, toPoint, site = DEFAULT_SITE) {
  const zones = zonesOfSite(site)
  if (!fromPoint) return zoneOfRole(site, 'access')

  // Descarga o carga → siempre vuelve a pesar.
  if (isDischargePoint(fromPoint)) return zoneOfRole(site, 'postDischarge')

  const candidates = zones.filter((z) => z.from === fromPoint && z.to.length)
  if (!candidates.length) return zoneOfRole(site, 'fallback')

  // Manda el punto de origen: si pasó preingreso está en Playa 1, diga lo que diga
  // la plantilla del circuito. El destino esperado solo desempata las bifurcaciones
  // reales (después de calada, y después de balanza).
  if (candidates.length === 1) return candidates[0]

  if (toPoint && toPoint !== fromPoint) {
    const hit = candidates.find((z) => z.to.includes(toPoint))
    if (hit) return hit
  }

  // Bifurcación sin destino determinado: zona propia si está declarada.
  const unknown = zones.find((z) => z.from === fromPoint && !z.to.length)
  return unknown ?? candidates[0]
}

/** Cámaras esperadas de un punto (espejo del catálogo en vivo). */
export function devicesOfPoint(pointId) {
  const p = POINTS[pointId]
  if (!p) return []
  return SECTOR_DEVICES[p.sectorCode] ?? []
}
