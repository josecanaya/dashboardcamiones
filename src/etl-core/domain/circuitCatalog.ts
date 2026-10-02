/**
 * Catálogo de circuitos logísticos (clave: codigo ejecutivo R*, SL*, RS_*).
 *
 * La topología NO se define acá: el recorrido de cada circuito sale del modelo de nodos del
 * Nodo Sur (`nodoSur.ts`, fuente única de verdad). `baseSequence` es la proyección del
 * recorrido a las cámaras (nodos con cámara, sin repetir consecutivos). Este archivo solo
 * agrega lo que no es topología: etiqueta, tipo, producto, cobertura, punto fuerte, si se
 * clasifica por secuencia, alias legacy y variantes observadas (`allowedSequences`).
 *
 * Los baldes de inferencia (RS_REC, RS_DESP, SIN_PUNTO) no son circuitos del modelo.
 */
import { nodoSurCameraSequence } from './nodoSur'

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

/** Recorrido del modelo proyectado a cámaras. */
const seq = (code: string): readonly string[] => {
  const s = nodoSurCameraSequence(code)
  if (!s.length) throw new Error(`circuitCatalog: ${code} no está en el modelo de nodos`)
  return s
}

/**
 * Variantes contempladas sobre la base del modelo: espera antes de calada (cualquier paso de
 * más sobre la base) y recalado (vuelve a Preingreso→Calada). `extra` = variantes observadas.
 */
function variants(base: readonly string[], extra: readonly (readonly string[])[] = []): readonly (readonly string[])[] {
  const iCal = base.indexOf('S2')
  if (iCal < 0) return extra
  const espera = [...base.slice(0, iCal), 'ESPERA', ...base.slice(iCal)]
  const recalado = [...base.slice(0, iCal + 1), 'S1', ...base.slice(iCal)]
  return [espera, recalado, ...extra]
}

const R5_BASE = seq('R5')
/**
 * Observadas: 14 de 179 camiones de volcable (21–27/09) pasan también por la cámara S7 antes
 * del volcable; y doble paso por balanza sin lectura del volcable.
 */
const R5_VARIANTS = variants(R5_BASE, [
  ['S0', 'S1', 'S2', 'S4', 'S6', 'S7', 'S9', 'S4'],
  ['S0', 'S1', 'S2', 'S4', 'S4'],
])

const R19_BASE = seq('R19')

/** R7 visto solo en Ricardone (la pata del puerto llega en otro journey o no se lee). */
const R7_RIC_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'S2', 'S3'],
  ['S0', 'S1', 'S3'],
  ['S0', 'S1', 'ESPERA', 'S3'],
  ['S0', 'S2', 'S1', 'S3'],
]

/** Circuito del modelo que todavía no se clasifica por secuencia (lo asigna el Excel o queda a futuro). */
function modelOnly(
  code: string,
  label: string,
  kind: CircuitCatalogKind,
  coveragePercent: number,
  product?: CircuitCatalogProduct
): CircuitCatalogEntry {
  return {
    code,
    label,
    kind,
    ...(product ? { product } : {}),
    coveragePercent,
    hasStrongPoint: false,
    enabledForClassification: false,
    baseSequence: seq(code),
  }
}

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
    baseSequence: seq('R1'),
    allowedSequences: variants(seq('R1')),
  },
  R2: modelOnly('R2', 'Recepción Silo Australiano', 'recepcion', 67),
  R5: {
    code: 'R5',
    label: 'Recepción Volcable 1',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: R5_BASE,
    allowedSequences: R5_VARIANTS,
  },
  R6: {
    code: 'R6',
    label: 'Recepción Volcable 2',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_VOLCABLE_1_2'],
    baseSequence: seq('R6'),
    allowedSequences: R5_VARIANTS,
  },
  R7: {
    code: 'R7',
    label: 'Ricardone → San Lorenzo',
    kind: 'recepcion',
    coveragePercent: 80,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SAN_LORENZO', 'CIRCUITO_R7_MIXTO'],
    baseSequence: seq('R7'),
    allowedSequences: [
      ...R7_RIC_ALLOWED_S_SEQUENCES,
      ['S0', 'S1', 'ESPERA', 'S5', 'S7'],
      ['S0', 'S2', 'S1', 'S5', 'S7'],
      ['S0', 'S1', 'S2', 'S3', 'S0', 'S1', 'S3', 'S4', 'S5', 'S7'],
    ],
  },
  SL1: {
    code: 'SL1',
    label: 'Recepción Carga OSL San Lorenzo',
    kind: 'recepcion',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_SL_RECEPCION'],
    baseSequence: seq('SL1'),
    allowedSequences: variants(seq('SL1')),
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
    baseSequence: seq('SL2'),
    allowedSequences: variants(seq('SL2')),
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
    baseSequence: seq('SL3'),
    allowedSequences: variants(seq('SL3')),
  },
  SL4: modelOnly('SL4', 'Despacho Cargadero San Lorenzo', 'despacho', 86),
  SL5: modelOnly('SL5', 'Despacho Carga OSL San Lorenzo', 'despacho', 100, 'ACEITE'),
  SL6: modelOnly('SL6', 'Despacho Renova', 'despacho', 100, 'ACEITE'),
  SL7: modelOnly('SL7', 'Despacho Carga y descarga San Lorenzo', 'despacho', 100, 'ACEITE'),
  SL8: modelOnly('SL8', 'Transile San Lorenzo → Celda 16', 'transile_externo', 81),
  SL9: modelOnly('SL9', 'Transile San Lorenzo → Silo Australiano', 'transile_externo', 75),
  SL10: modelOnly('SL10', 'Transile San Lorenzo → Silo Keppler', 'transile_externo', 81),
  SL11: modelOnly('SL11', 'Transile San Lorenzo → Silo Chief', 'transile_externo', 75),
  SL12: modelOnly('SL12', 'Transile San Lorenzo → Volcable 1', 'transile_externo', 81),
  SL13: modelOnly('SL13', 'Transile San Lorenzo → Volcable 2', 'transile_externo', 81),
  SL14: modelOnly('SL14', 'Transile líquidos Carga OSL → Ricardone', 'transile_externo', 80, 'ACEITE'),
  SL15: modelOnly('SL15', 'Transile líquidos Carga y descarga → Ricardone', 'transile_externo', 80, 'ACEITE'),
  R8: {
    code: 'R8',
    label: 'Recepción Mercadería Líquida',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 63,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_LIQUIDO'],
    baseSequence: seq('R8'),
    allowedSequences: variants(seq('R8')),
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
    baseSequence: seq('R9'),
    allowedSequences: variants(seq('R9')),
  },
  R10: modelOnly('R10', 'Despacho Silo Australiano', 'despacho', 89),
  R11: modelOnly('R11', 'Despacho Silo Keppler', 'despacho', 100),
  R12: modelOnly('R12', 'Despacho Tolva silo Chief', 'despacho', 100),
  /**
   * Despacho de pellet desde tolvas 09–11 (R9–R16 = despacho Ricardone en la matriz KPI).
   *
   * Es el destino del pellet que **no** es «de la vuelta»: carga en la celda y sale a
   * otro destino, no a San Lorenzo. El par de la vuelta es R30/R31/R32.
   *
   * Las tolvas no tienen cámara: por secuencia R13/R14/R15 son indistinguibles entre sí (y de
   * R10), por eso no se clasifican por secuencia — lo asigna el Excel de Movimientos.
   */
  R13: {
    code: 'R13',
    label: 'Despacho Pellet (Celda 09)',
    kind: 'despacho',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: false,
    aliases: ['DESPACHO_PELLET_C09'],
    baseSequence: seq('R13'),
  },
  R14: {
    code: 'R14',
    label: 'Despacho Pellet (Celda 10)',
    kind: 'despacho',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: false,
    aliases: ['DESPACHO_PELLET_C10'],
    baseSequence: seq('R14'),
  },
  R15: {
    code: 'R15',
    label: 'Despacho Pellet (Celda 11)',
    kind: 'despacho',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: false,
    aliases: ['DESPACHO_PELLET_C11'],
    baseSequence: seq('R15'),
  },
  R16: {
    code: 'R16',
    label: 'Despacho Mercadería Líquida',
    kind: 'liquido',
    product: 'ACEITE',
    coveragePercent: 75,
    hasStrongPoint: true,
    enabledForClassification: true,
    baseSequence: seq('R16'),
    allowedSequences: variants(seq('R16')),
  },
  R17: modelOnly('R17', 'Transile Celda 16 → Silo Chief', 'transile_interno', 67),
  R18: modelOnly('R18', 'Transile Celda 16 → Silo Keppler', 'transile_interno', 78),
  R19: {
    code: 'R19',
    label: 'Transile C16 Volcable 1',
    kind: 'transile_interno',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: R19_BASE,
    allowedSequences: variants(R19_BASE),
  },
  R20: {
    code: 'R20',
    label: 'Transile C16 Volcable 2',
    kind: 'transile_interno',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_VOLCABLE_BALANZA'],
    baseSequence: seq('R20'),
    allowedSequences: variants(R19_BASE),
  },
  R21: modelOnly('R21', 'Transile Tolva silo Chief → Celda 16', 'transile_interno', 82),
  R22: modelOnly('R22', 'Transile Tolva silo Chief → Volcable 1', 'transile_interno', 80),
  R23: modelOnly('R23', 'Transile Silo Keppler → Celda 16', 'transile_interno', 82),
  R24: modelOnly('R24', 'Transile Silo Keppler → Volcable 1', 'transile_interno', 80),
  R25: modelOnly('R25', 'Transile Silo Keppler → Volcable 2', 'transile_interno', 80),
  R3: {
    code: 'R3',
    label: 'Recepción Silos Kepler 1',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_1'],
    baseSequence: seq('R3'),
    allowedSequences: variants(seq('R3')),
  },
  R4: {
    code: 'R4',
    label: 'Recepción Silos Kepler 2',
    kind: 'recepcion',
    coveragePercent: 67,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['CIRCUITO_KEPLER_SILOS', 'KEPPLER_SILO_2'],
    baseSequence: seq('R4'),
    allowedSequences: variants(seq('R4')),
  },
  R26: {
    code: 'R26',
    label: 'Transile externo Soja (Celda 16)',
    kind: 'transile_externo',
    product: 'SOJA',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    /** Legacy cámara C16↔SL (ambos sentidos → R26; Celda 16 solo soja). */
    aliases: [
      'TRANSILE_C16_A_SL',
      'TRANSILE_C16_A_SL_DESCARGA',
      'TRANSILE_SL_A_C16',
      'TRANSILE_SL_A_C16_DESCARGA',
    ],
    baseSequence: seq('R26'),
    allowedSequences: [],
  },
  R27: {
    code: 'R27',
    label: 'Transile externo Girasol (candidato)',
    kind: 'transile_externo',
    product: 'GIRASOL',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_EXTERNO_GIRASOL'],
    baseSequence: seq('R27'),
    allowedSequences: [],
  },
  R28: {
    code: 'R28',
    label: 'Transile externo Girasol (variante matriz)',
    kind: 'transile_externo',
    product: 'GIRASOL',
    coveragePercent: 60,
    hasStrongPoint: true,
    enabledForClassification: true,
    aliases: ['TRANSILE_EXTERNO_GIRASOL_R28'],
    baseSequence: seq('R28'),
    allowedSequences: [],
  },
  /**
   * Soja «de la vuelta» cargada en los silos de Ricardone (Silo Chief) y descargada en las
   * volcables del puerto. Aparece en el Excel desde el 21-09-2026 (plataforma SILO_CHIEF_2).
   *
   * Antes caía en R26 porque toda soja «de la vuelta» iba ahí sin mirar la plataforma, y R26
   * es de Celda 16: 182 recorridos rotulados «Celda 16» que nunca pasaron por Celda 16 (la
   * cámara de la celda vio 2 camiones en la semana). Se resuelve desde el Excel, por eso no
   * tiene punto fuerte de cámara propio.
   */
  R29: {
    code: 'R29',
    label: 'Transile externo Soja (Silos → Volcables puerto)',
    kind: 'transile_externo',
    product: 'SOJA',
    coveragePercent: 55,
    hasStrongPoint: false,
    // Como R13–R15: lo asigna el Excel (plataforma de carga), no la secuencia de cámaras.
    enabledForClassification: false,
    aliases: ['TRANSILE_EXTERNO_SOJA_SILOS'],
    baseSequence: seq('R29'),
  },
  /** Pellet: Tolva Celda 09 — sin cámara Truckflow en destino (matriz Excel 2026-07-13). */
  R30: {
    code: 'R30',
    label: 'Transile externo Pellet (Celda 09)',
    kind: 'transile_externo',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: true,
    aliases: ['TRANSILE_EXTERNO_PELLET_C09'],
    baseSequence: seq('R30'),
    allowedSequences: [],
  },
  R31: {
    code: 'R31',
    label: 'Transile externo Pellet (Celda 10)',
    kind: 'transile_externo',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: true,
    aliases: ['TRANSILE_EXTERNO_PELLET_C10'],
    baseSequence: seq('R31'),
    allowedSequences: [],
  },
  R32: {
    code: 'R32',
    label: 'Transile externo Pellet (Celda 11)',
    kind: 'transile_externo',
    product: 'PELLET',
    coveragePercent: 55,
    hasStrongPoint: false,
    enabledForClassification: true,
    aliases: ['TRANSILE_EXTERNO_PELLET_C11'],
    baseSequence: seq('R32'),
    allowedSequences: [],
  },
  R33: modelOnly('R33', 'Transile externo Líquidos (Carga OSL)', 'transile_externo', 93, 'ACEITE'),
  R34: {
    code: 'R34',
    label: 'Transile externo Líquidos SLZ 2',
    kind: 'transile_externo',
    product: 'ACEITE',
    coveragePercent: 64,
    hasStrongPoint: true,
    enabledForClassification: true,
    baseSequence: seq('R34'),
  },
  /** Circuito nuevo del modelo (29-09-2026): cala en Ricardone y descarga líquido en el puerto. */
  R35: modelOnly('R35', 'Calada Ricardone → descarga líquidos puerto', 'liquido', 100, 'ACEITE'),
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
