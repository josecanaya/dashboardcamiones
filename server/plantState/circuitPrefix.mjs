/**
 * Matching provisional de circuito por PREFIJO de secuencia lógica (S0, S1, …).
 * Fuente: src/etl-core/domain/circuitCatalog.ts (bridge vía tsx al arranque).
 * provisional: true — la clasificación definitiva la hace el Transform.
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSectorProfile } from './sectorProfiles.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

/**
 * sectorCode del feed / perfil → código lógico de la matriz de circuitos.
 * Nota: Celda 16 → S5 (matriz); Volcable → S9; Egreso → S10 (salida tras 2ª balanza).
 */
const SECTOR_TO_LOGICAL = {
  RICARDONE_INGRESO_CAMIONES: 'S0',
  RICARDONE_PREINGRESO: 'S1',
  RICARDONE_CALADA: 'S2',
  RICARDONE_EGRESO_CAMIONES: 'S10',
  RICARDONE_BALANZA: 'S4',
  RICARDONE_CELDA_16: 'S5',
  RICARDONE_VOLCABLE: 'S9',
  RICARDONE_VOLCABLE_1: 'S9',
  RICARDONE_VOLCABLE_2: 'S9',
  S6: 'S6',
  S7: 'S7',
  S8: 'S8',

  /*
   * San Lorenzo. El catalogo de circuitos (R*) describe recorridos de Ricardone,
   * asi que el matching por prefijo no va a encontrar circuito para el puerto y
   * devuelve null: es correcto, no es una falla. Mapear igual los logicos deja
   * legible la secuencia observada en la ficha del camion.
   */
  PUERTO_SAN_LORENZO_INGRESO_CAMIONES: 'SL_S0',
  PUERTO_SAN_LORENZO_BALANZA_INGRESO: 'SL_S1',
  PUERTO_SAN_LORENZO_CALADA: 'SL_S2',
  PUERTO_SAN_LORENZO_VOLCABLE: 'SL_S4',
  PUERTO_SAN_LORENZO_BALANZA_SALIDA: 'SL_S5',
  Liquido_2: 'SL_S6',
  PUERTO_SAN_LORENZO_EGRESO_CAMIONES: 'SL_S7',
  INGRESO_RENOVA: 'SL_S8',
  PUERTO_SAN_LORENZO_LIQUIDOS_PUNTO_1: 'SL_S10',
}

const LOGICAL_LABELS = {
  S0: 'Ingreso',
  S1: 'Preingreso',
  S2: 'Calada',
  S3: 'Egreso / Salida 2',
  S4: 'Balanza',
  S5: 'Celda 16',
  S6: 'Playa 3',
  S7: 'Despacho silos',
  S8: 'Carga silo Chief',
  S9: 'Volcable',
  S10: 'Egreso',
  SL_S0: 'Ingreso SL',
  SL_S1: 'Balanza ingreso SL',
  SL_S2: 'Calada SL',
  SL_S4: 'Volcable SL',
  SL_S5: 'Balanza salida SL',
  SL_S6: 'Balanza liquidos SL',
  SL_S7: 'Egreso SL',
  SL_S8: 'Ingreso Renova',
  SL_S10: 'Liquidos punto 1',
  ESPERA: 'Espera',
}

/** Fallback si tsx no puede cargar el catálogo (mismas baseSequence de circuitos Ricardone comunes). */
const FALLBACK_ENTRIES = [
  {
    code: 'R1',
    label: 'Recepción Celda 16',
    sequences: [
      ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
    ],
  },
  {
    code: 'R5',
    label: 'Recepción Volcable 1',
    sequences: [
      ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    ],
  },
  {
    code: 'R6',
    label: 'Recepción Volcable 2',
    sequences: [
      ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    ],
  },
  {
    code: 'R7',
    label: 'Ricardone → San Lorenzo',
    sequences: [
      ['S0', 'S1', 'S2', 'S3'],
      ['S0', 'S1', 'S3'],
      ['S0', 'S1', 'ESPERA', 'S3'],
    ],
  },
  {
    code: 'RS_REC',
    label: 'Recepción sólida inferida',
    sequences: [['S0', 'S1', 'S2', 'S4', 'S6']],
  },
]

/** @type {{ code: string, label: string, sequences: string[][] }[]|null} */
let _catalog = null
let _loadSource = 'unloaded'

function loadViaTsx() {
  const dumpScript = path.join(__dirname, 'dumpCircuitCatalog.ts')
  const result = spawnSync('npx', ['tsx', dumpScript], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    shell: true,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr?.slice(0, 400) || `tsx exit ${result.status}`)
  }
  const raw = String(result.stdout || '').trim()
  const jsonStart = raw.indexOf('[')
  if (jsonStart < 0) {
    throw new Error(`tsx no devolvió JSON: ${(raw || result.stderr || '').slice(0, 200)}`)
  }
  return JSON.parse(raw.slice(jsonStart))
}

function ensureCatalog() {
  if (_catalog) return _catalog
  try {
    _catalog = loadViaTsx()
    _loadSource = 'circuitCatalog.ts'
  } catch (e) {
    console.warn(
      '[circuitPrefix] no se pudo cargar circuitCatalog vía tsx; usando fallback provisional:',
      e instanceof Error ? e.message : e
    )
    _catalog = FALLBACK_ENTRIES
    _loadSource = 'fallback'
  }
  return _catalog
}

/**
 * @param {string} sectorCode
 * @returns {string|null}
 */
export function sectorToLogical(sectorCode) {
  const key = String(sectorCode ?? '').trim()
  if (!key) return null
  if (SECTOR_TO_LOGICAL[key]) return SECTOR_TO_LOGICAL[key]
  if (/^(SL_)?S\d+$/i.test(key)) return key.toUpperCase()
  return null
}

/**
 * @param {string} logical
 */
export function logicalLabel(logical) {
  const k = String(logical ?? '').trim().toUpperCase()
  return LOGICAL_LABELS[k] || getSectorProfile(k)?.label || k
}

/**
 * Colapsa consecutivos iguales (sin ESPERA).
 * @param {string[]} sectorCodes
 * @returns {string[]}
 */
export function buildLogicalSequence(sectorCodes) {
  /** @type {string[]} */
  const out = []
  for (const raw of sectorCodes) {
    const log = sectorToLogical(raw)
    if (!log || log === 'ESPERA') continue
    if (out.length && out[out.length - 1] === log) continue
    out.push(log)
  }
  return out
}

/**
 * @param {string[]} prefix
 * @param {string[]} seq
 */
function isPrefix(prefix, seq) {
  if (prefix.length > seq.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== seq[i]) return false
  }
  return true
}

/**
 * Match por prefijo. provisional: true siempre.
 * @param {string[]} observedLogical
 * @returns {{ circuit: string|null, circuitLabel: string|null, nextExpectedPoint: string|null, nextExpectedLabel: string|null, matchedSequence: string[]|null, provisional: true, source: string }}
 */
export function matchCircuitByPrefix(observedLogical) {
  const catalog = ensureCatalog()
  const observed = (observedLogical || []).filter((s) => s && s !== 'ESPERA')
  if (!observed.length) {
    return {
      circuit: null,
      circuitLabel: null,
      nextExpectedPoint: null,
      nextExpectedLabel: null,
      matchedSequence: null,
      provisional: true,
      source: _loadSource,
    }
  }

  /** @type {{ code: string, label: string, seq: string[], next: string|null }[]} */
  const hits = []
  for (const entry of catalog) {
    for (const seq of entry.sequences) {
      if (!isPrefix(observed, seq)) continue
      const next = observed.length < seq.length ? seq[observed.length] : null
      hits.push({ code: entry.code, label: entry.label, seq: [...seq], next })
    }
  }

  if (!hits.length) {
    return {
      circuit: null,
      circuitLabel: null,
      nextExpectedPoint: null,
      nextExpectedLabel: null,
      matchedSequence: null,
      provisional: true,
      source: _loadSource,
    }
  }

  // Preferir matches con próximo punto (viaje en curso), luego no-inferidos, luego secuencia corta.
  hits.sort((a, b) => {
    const aOpen = a.next != null ? 0 : 1
    const bOpen = b.next != null ? 0 : 1
    if (aOpen !== bOpen) return aOpen - bOpen
    const aInf = a.code.startsWith('RS_') || a.code === 'SIN_PUNTO' ? 1 : 0
    const bInf = b.code.startsWith('RS_') || b.code === 'SIN_PUNTO' ? 1 : 0
    if (aInf !== bInf) return aInf - bInf
    const len = a.seq.length - b.seq.length
    if (len !== 0) return len
    return a.code.localeCompare(b.code)
  })
  const best = hits[0]
  return {
    circuit: best.code,
    circuitLabel: best.label,
    nextExpectedPoint: best.next,
    nextExpectedLabel: best.next ? logicalLabel(best.next) : null,
    matchedSequence: best.seq,
    provisional: true,
    source: _loadSource,
  }
}

/**
 * Tope provisional del tramo actual → próximo punto (minutos).
 * Sin dato fino de etlSegmentTimingRules: usa 90 min genérico, 180 en buffer/queue.
 * @param {string|null} fromLogical
 * @param {string|null} toLogical
 * @param {string|null} currentSectorType
 * @returns {number|null}
 */
export function provisionalSegmentCapMin(fromLogical, toLogical, currentSectorType) {
  void fromLogical
  void toLogical
  if (currentSectorType === 'buffer' || currentSectorType === 'queue') return 180
  if (currentSectorType === 'process' || currentSectorType === 'scale') return 90
  if (currentSectorType === 'discharge' || currentSectorType === 'load') return 120
  if (currentSectorType === 'gate' || currentSectorType === 'exit') return 45
  return 90
}

export function circuitCatalogSource() {
  ensureCatalog()
  return _loadSource
}
