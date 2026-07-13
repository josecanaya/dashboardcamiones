/**
 * Fuente unica de verdad de circuitos logisticos (clave: codigo ejecutivo R*, SL*, RS_*).
 * Fase 3.1: copia fiel de EXECUTIVE_CIRCUIT_MATRIX (+ kind/product). En 3.2 se redefinen R26-R32.
 */

export type CircuitCatalogKind =
  | 'recepcion'
  | 'despacho'
  | 'transile_interno'
  | 'transile_externo'
  | 'liquido'
  | 'inferido'

export type CircuitCatalogProduct = 'SOJA' | 'GIRASOL' | 'PELLET' | 'ACEITE' | ''

export type CircuitCatalogEntry = {
  code: string
  label: string
  kind: CircuitCatalogKind
  product?: CircuitCatalogProduct
  coveragePercent: number
  hasStrongPoint: boolean
  enabledForClassification: boolean
  aliases?: readonly string[]
  baseSequence?: readonly string[]
  allowedSequences?: readonly (readonly string[])[]
}

const R5_ALLOWED_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'ESPERA', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'ESPERA', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'ESPERA', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S6', 'S7', 'S9', 'S4', 'S10'],
]

const R19_ALLOWED_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
  ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
]

const KEPLER_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [['S0', 'S1', 'S2', 'S4', 'S4']]

const SL1_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'S2', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'ESPERA', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'S2', 'S1', 'S3', 'S5', 'S7'],
  ['S0', 'S1', 'S3', 'S4', 'ESPERA', 'S5', 'S7'],
]

const R7_RIC_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'S2', 'S3'],
  ['S0', 'S1', 'S3'],
  ['S0', 'S1', 'ESPERA', 'S3'],
  ['S0', 'S2', 'S1', 'S3'],
]

/** Catálogo unificado (paridad con EXECUTIVE_CIRCUIT_MATRIX al cierre de 3.1). */
export const CIRCUIT_CATALOG: Record<string, CircuitCatalogEntry> = {
  R1: {
    code: 'R1',
    label: 'Recepción Celda 16',
    kind: 'recepcion',
    product: 'SOJA',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_CELDA16_DESCARGA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
    allowedSequences: [
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'S4', 'ESPERA', 'S5', 'S6', 'S7', 'S4', 'S10'],
      ['S0', 'S1', 'S2', 'S4', 'S5', 'ESPERA', 'S6', 'S7', 'S4', 'S10'],
    ],
  },
  R5: {
    code: 'R5',
    label: 'Recepción Volcable 1',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R5_ALLOWED_SEQUENCES,
  },
  R6: {
    code: 'R6',
    label: 'Recepción Volcable 2',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R5_ALLOWED_SEQUENCES,
  },
  R7: {
    code: 'R7',
    label: 'Ricardone → San Lorenzo',
    kind: 'recepcion',
    coveragePercent: 80,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SAN_LORENZO', 'CIRCUITO_R7_MIXTO'],
    baseSequence: ['S0', 'S1', 'S2', 'S3'],
    allowedSequences: [
      ...R7_RIC_ALLOWED_S_SEQUENCES,
      ['S0', 'S1', 'S3'],
      ['S0', 'S1', 'ESPERA', 'S5', 'S7'],
      ['S0', 'S2', 'S1', 'S5', 'S7'],
      ['S0', 'S1', 'S2', 'S3', 'S0', 'S1', 'S3', 'S4', 'S5', 'S7'],
    ],
  },
  SL1: {
    code: 'SL1',
    label: 'Recepción interna San Lorenzo',
    kind: 'recepcion',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SL_RECEPCION'],
    baseSequence: SL1_ALLOWED_S_SEQUENCES[0]!,
    allowedSequences: SL1_ALLOWED_S_SEQUENCES.slice(1),
  },
  SL2: {
    code: 'SL2',
    label: 'Aceite PTO San Lorenzo (sin S10)',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 70,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SL_ACEITE_PTO'],
    baseSequence: SL1_ALLOWED_S_SEQUENCES[0]!,
    allowedSequences: SL1_ALLOWED_S_SEQUENCES.slice(1),
  },
  SL3: {
    code: 'SL3',
    label: 'Aceite Renova (observación Excel)',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 65,
    hasStrongPoint: false,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SL_RENOVA'],
    baseSequence: SL1_ALLOWED_S_SEQUENCES[0]!,
    allowedSequences: SL1_ALLOWED_S_SEQUENCES.slice(1),
  },
  R8: {
    code: 'R8',
    label: 'Recepción Mercadería Líquida',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 63,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_LIQUIDO'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4', 'S3'],
    allowedSequences: [['S0', 'S1', 'ESPERA', 'S1', 'S2', 'S4', 'S4', 'S3']],
  },
  R9: {
    code: 'R9',
    label: 'Despacho Celda 16',
    kind: 'despacho',
    product: 'SOJA',
    coveragePercent: 78,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_CELDA16_CARGA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'S2', 'S3'],
    allowedSequences: [
      ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S5', 'S6', 'S7', 'S1', 'S2', 'S3'],
      ['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'ESPERA', 'S2', 'S3'],
      ['S0', 'S1', 'S2', 'ESPERA', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S4', 'S1', 'S2', 'S3'],
    ],
  },
  R16: {
    code: 'R16',
    label: 'Despacho Mercadería Líquida',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4', 'S1', 'S2', 'S3'],
    allowedSequences: [['S0', 'S1', 'ESPERA', 'S2', 'S4', 'S4', 'S1', 'ESPERA', 'S2', 'S3']],
  },
  R19: {
    code: 'R19',
    label: 'Transile C16 Volcable 1',
    kind: 'transile_interno',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R19_ALLOWED_SEQUENCES,
  },
  R20: {
    code: 'R20',
    label: 'Transile C16 Volcable 2',
    kind: 'transile_interno',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S5', 'S6', 'S7', 'S9', 'S4', 'S10'],
    allowedSequences: R19_ALLOWED_SEQUENCES,
  },
  R3: {
    code: 'R3',
    label: 'Recepción Silos Kepler 1',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_1'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4'],
    allowedSequences: KEPLER_ALLOWED_S_SEQUENCES,
  },
  R4: {
    code: 'R4',
    label: 'Recepción Silos Kepler 2',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_2'],
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S4'],
    allowedSequences: KEPLER_ALLOWED_S_SEQUENCES,
  },
  R26: {
    code: 'R26',
    label: 'Transile Celda 16 → San Lorenzo',
    kind: 'transile_externo',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_C16_A_SL', 'TRANSILE_C16_A_SL_DESCARGA'],
    baseSequence: [
      'S0',
      'S1',
      'S2',
      'S4',
      'S5',
      'S6',
      'S7',
      'S4',
      'S10',
      'S0',
      'S1',
      'S3',
      'S4',
      'S5',
      'S7',
    ],
    allowedSequences: [],
  },
  R27: {
    code: 'R27',
    label: 'Transile San Lorenzo → Celda 16',
    kind: 'transile_externo',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_SL_A_C16', 'TRANSILE_SL_A_C16_DESCARGA'],
    baseSequence: [
      'S0',
      'S1',
      'S3',
      'S4',
      'S5',
      'S7',
      'S0',
      'S1',
      'S2',
      'S4',
      'S5',
      'S6',
      'S7',
      'S4',
      'S10',
    ],
    allowedSequences: [],
  },
  R34: {
    code: 'R34',
    label: 'Transile externo Líquidos SLZ 2',
    kind: 'transile_externo',
    product: 'ACEITE',
    coveragePercent: 64,
    hasStrongPoint: true,
    enabledForClassification: true,
  },
  RS_REC: {
    code: 'RS_REC',
    label: 'Recepción sólida inferida (sin cámara destino)',
    kind: 'inferido',
    coveragePercent: 50,
    hasStrongPoint: false,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S2', 'S4', 'S6'],
  },
  RS_DESP: {
    code: 'RS_DESP',
    label: 'Despacho sólido inferido (sin cámara destino)',
    kind: 'inferido',
    coveragePercent: 50,
    hasStrongPoint: false,
    enabledForClassification: true,
    baseSequence: ['S0', 'S1', 'S4', 'S6', 'S2'],
  },
  SIN_PUNTO: {
    code: 'SIN_PUNTO',
    label: 'Sin punto instrumentado (sólidos)',
    kind: 'inferido',
    coveragePercent: 0,
    hasStrongPoint: false,
    enabledForClassification: false,
  },
}

/** Proyecta al shape ExecutiveCircuitConfig (sin kind/product). */
export function toExecutiveCircuitConfig(entry: CircuitCatalogEntry): {
  code: string
  label: string
  coveragePercent: number
  hasStrongPoint: boolean
  enabledForClassification: boolean
  baseSequence?: readonly string[]
  allowedSequences?: readonly (readonly string[])[]
  aliases?: readonly string[]
} {
  return {
    code: entry.code,
    label: entry.label,
    coveragePercent: entry.coveragePercent,
    hasStrongPoint: entry.hasStrongPoint,
    enabledForClassification: entry.enabledForClassification,
    ...(entry.baseSequence ? { baseSequence: entry.baseSequence } : {}),
    ...(entry.allowedSequences ? { allowedSequences: entry.allowedSequences } : {}),
    ...(entry.aliases ? { aliases: entry.aliases } : {}),
  }
}

export function getCircuitCatalogEntry(code: string): CircuitCatalogEntry | undefined {
  return CIRCUIT_CATALOG[String(code ?? '').trim().toUpperCase()]
}
