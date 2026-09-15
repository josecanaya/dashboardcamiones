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

import { SECTOR_DEVICES } from './sectorProfiles.mjs'

/**
 * @typedef {{
 *   id: string, sectorCode: string, logical: string, label: string,
 *   ratePerHour: number|null, note?: string, exclusiveWith?: string,
 *   loadDevices?: string[], stockMaxT?: number
 * }} PlantPoint
 */

/** Puntos de proceso. `ratePerHour` es lo que drena la zona que llega al punto. */
export const POINTS = {
  INGRESO: {
    id: 'INGRESO',
    sectorCode: 'RICARDONE_INGRESO_CAMIONES',
    logical: 'S0',
    label: 'Ingreso',
    ratePerHour: null,
    note: 'punto de control, sin tasa relevada',
  },
  PREINGRESO: {
    id: 'PREINGRESO',
    sectorCode: 'RICARDONE_PREINGRESO',
    logical: 'S1',
    label: 'Preingreso',
    ratePerHour: null,
    note: 'punto de control, sin tasa relevada',
  },
  CALADA: {
    id: 'CALADA',
    sectorCode: 'RICARDONE_CALADA',
    logical: 'S2',
    label: 'Calada',
    ratePerHour: 60,
    note: '2 de 3 caladores a 30/h; con los 3 son 90/h. 6 calles, -20 min por cambio de turno',
  },
  BALANZA: {
    id: 'BALANZA',
    sectorCode: 'RICARDONE_BALANZA',
    logical: 'S4',
    label: 'Balanza',
    ratePerHour: 38,
    note: '1,5 min por pesaje — misma tasa que las balanzas de San Lorenzo (confirmado 14-09)',
  },
  PLAYA3: {
    id: 'PLAYA3',
    sectorCode: 'S6',
    logical: 'S6',
    label: 'Playa 3',
    ratePerHour: null,
    note: 'no procesa: solo espera y clasificación por destino',
  },
  VOLCABLES: {
    id: 'VOLCABLES',
    sectorCode: 'RICARDONE_VOLCABLE',
    logical: 'S9',
    label: 'Volcables',
    ratePerHour: 4.5,
    note: '4-5/h entre los dos, no cada uno. Limpieza 1 h diaria',
  },
  CELDA16: {
    id: 'CELDA16',
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
    sectorCode: 'RICARDONE_EGRESO_CAMIONES',
    logical: 'S10',
    label: 'Egreso',
    ratePerHour: 120,
    note: '~30 segundos por camión',
  },
}

/** Puntos que drenan Playa 3 (todos los destinos de descarga/carga). */
const DISCHARGE_POINTS = ['VOLCABLES', 'CELDA16', 'SILOS', 'CARGA_SILOS']

/**
 * @typedef {{
 *   id: string, label: string, from: string|null, to: string[],
 *   capacityPhysical: number|null, capacityOperational: number|null,
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
    label: 'Acceso',
    from: null,
    to: ['INGRESO'],
    capacityPhysical: 28,
    capacityOperational: 28,
  },
  {
    id: 'Z1',
    label: 'Ingreso → Preingreso',
    from: 'INGRESO',
    to: ['PREINGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z2',
    label: 'Playa 1',
    from: 'PREINGRESO',
    to: ['CALADA'],
    capacityPhysical: 263,
    capacityOperational: 450,
    pending: 'definir si Playa 1 son los 263 de densidad o parte de los 450 de las dos playas',
  },
  {
    id: 'Z3',
    label: 'Calada → Balanza',
    from: 'CALADA',
    to: ['BALANZA'],
    capacityPhysical: 39,
    capacityOperational: 39,
  },
  {
    id: 'Z4',
    label: 'Calada → Egreso',
    from: 'CALADA',
    to: ['EGRESO'],
    capacityPhysical: 39,
    capacityOperational: 39,
    note: 'R7 no pesa en Ricardone',
  },
  {
    id: 'Z3U',
    label: 'Calada → destino indeterminado',
    from: 'CALADA',
    to: [],
    capacityPhysical: null,
    capacityOperational: null,
    note: 'el circuito todavía no se puede determinar por prefijo; si crece es cobertura floja',
  },
  {
    id: 'Z5',
    label: 'Balanza → descarga',
    from: 'BALANZA',
    to: ['PLAYA3', ...DISCHARGE_POINTS],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z6',
    label: 'Playa 3',
    from: 'PLAYA3',
    to: DISCHARGE_POINTS,
    capacityPhysical: 141,
    capacityOperational: 30,
    note: 'solo espera y clasificación por destino; nunca debe llenarse porque bloquea circulación',
  },
  {
    id: 'Z7',
    label: 'Descarga → Balanza',
    from: '*DESCARGA',
    to: ['BALANZA'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'Z8',
    label: 'Balanza → Egreso',
    from: 'BALANZA',
    to: ['EGRESO'],
    capacityPhysical: null,
    capacityOperational: null,
  },
  {
    id: 'ZX',
    label: 'Otros tramos',
    from: '*',
    to: [],
    capacityPhysical: null,
    capacityOperational: null,
    note: 'pares from→to no declarados; visible a propósito para no perder camiones',
  },
]

const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]))

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

/** @param {string} zoneId @returns {PlantZone|null} */
export function getZone(zoneId) {
  return ZONE_BY_ID.get(zoneId) ?? null
}

/** @param {string} pointId */
export function isDischargePoint(pointId) {
  return DISCHARGE_POINTS.includes(pointId)
}

/**
 * Resuelve en qué zona espera un camión.
 * @param {string|null} fromPoint  punto de la última lectura
 * @param {string|null} toPoint    próximo punto esperado (de la plantilla del circuito)
 * @returns {PlantZone}
 */
export function resolveZone(fromPoint, toPoint) {
  if (!fromPoint) return ZONE_BY_ID.get('Z0')

  // Descarga o carga → siempre vuelve a pesar.
  if (isDischargePoint(fromPoint)) return ZONE_BY_ID.get('Z7')

  const candidates = ZONES.filter((z) => z.from === fromPoint && z.to.length)
  if (!candidates.length) return ZONE_BY_ID.get('ZX')

  // Manda el punto de origen: si pasó preingreso está en Playa 1, diga lo que diga
  // la plantilla del circuito. El destino esperado solo desempata las bifurcaciones
  // reales (después de calada, y después de balanza).
  if (candidates.length === 1) return candidates[0]

  if (toPoint && toPoint !== fromPoint) {
    const hit = candidates.find((z) => z.to.includes(toPoint))
    if (hit) return hit
  }

  // Bifurcación sin destino determinado: zona propia si está declarada.
  const unknown = ZONES.find((z) => z.from === fromPoint && !z.to.length)
  return unknown ?? candidates[0]
}

/** Cámaras esperadas de un punto (espejo del catálogo en vivo). */
export function devicesOfPoint(pointId) {
  const p = POINTS[pointId]
  if (!p) return []
  return SECTOR_DEVICES[p.sectorCode] ?? []
}
