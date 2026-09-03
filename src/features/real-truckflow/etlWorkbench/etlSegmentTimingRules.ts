/**
 * Reglas, umbrales y cadenas KPI de tiempos de tramo (bloque declarativo, sin lógica de cálculo).
 *
 * Extraído de `etlSegmentTiming.ts` (god-file de ~5k LOC) por responsabilidad: acá viven los
 * topes por transición, los rollups por circuito y las cadenas KPI; el cálculo de tramos y la
 * construcción del índice quedan en `etlSegmentTiming.ts`.
 *
 * No importa nada del workbench: es un módulo leaf. `etlSegmentTiming` re-exporta su superficie
 * pública original, así que ningún import existente cambia.
 */
import {
  PELLET_DESPACHO_CODES,
  PELLET_DESPACHO_UNIFIED_CODE,
  PELLET_TRANSILE_CODES,
  PELLET_TRANSILE_UNIFIED_CODE,
} from '../../../etl-core/reports/transileExternoCiclo'

/** Bins del histograma de tramos largos (minutos). */
export const SEGMENT_TIMING_HISTOGRAM_BIN_MIN = 5

/** Umbral máximo razonable por tramo (8 h). */
export const MAX_SEGMENT_DURATION_MINUTES = 8 * 60

/**
 * Kepler (R3/R4): la estadía en silo (playa 3 → descarga S7) es una espera real de hasta ~24 h.
 * Sin este tope alto se descartaba como "tramo demasiado largo" y esos camiones quedaban sin tiempo.
 */
export const KEPLER_LONG_DWELL_MAX_MINUTES = 24 * 60

/** Tramos SL ≤ 3 min se descartan (ruido OCR / fragmentación en puerto). */
export const MIN_SEGMENT_DURATION_MINUTES = 3

/**
 * Tramo rollup San Lorenzo: balanza ingreso → egreso real (S1→S7).
 * Unifica estadía en balanza + tránsito a salida del puerto en un solo KPI.
 */
export const SL_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_INGRESO',
  to: 'SL_EGRESO',
} as const

/**
 * Recepción Ricardone (Celda 16 / Volcable 1-2): estadía completa balanza ingreso → balanza egreso.
 * La plataforma de descarga viene del Excel (circuito R1/R5/R6); no se fragmenta por cámara de descarga.
 */
export const BALANZA_STAY_ROLLUP_TRANSITION = {
  from: 'BALANZA_INGRESO',
  to: 'BALANZA_EGRESO',
} as const

export const CIRCUITS_WITH_BALANZA_STAY_ROLLUP = new Set(['R1', 'R5', 'R6', 'R3', 'R4'])

/** Mínimo estadía balanza con paso por Volcable (subtramos cortos son tránsito, no B1/B2). */
export const VOLCABLE_RECEIPT_BALANZA_STAY_MIN_MINUTES = 3

/** Balanza ingreso→egreso Ricardone: < 10 min = lecturas B1/B2 casi simultáneas (error cámara/OCR). */
export const BALANZA_STAY_MIN_MINUTES = 10

/**
 * Template KPI recepción Ricardone base (fallback). Los circuitos con destino
 * instrumentado definen su cadena propia en EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE
 * (con playa 3 / descarga en el medio).
 */
export const RECEPTION_BALANZA_KPI_CHAIN = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
] as const

/**
 * KPI de líquidos (R8 recepción / R16 despacho): la calada de líquidos **no** registra
 * un punto `CALADA` — el muestreo de líquidos entra como `LIQUIDO`.
 *
 * Medido en dos ventanas (2026-07-13→19 y 20→26): sobre 138 recorridos R8, `CALADA`
 * aparece **0 veces** y `LIQUIDO` en el 100%. La cadena tenía un `CALADA` fantasma entre
 * preingreso y líquido, y eso partía el tramo real (`preingreso → líquido`) en dos tramos
 * imposibles de medir, los dos siempre vacíos en la tabla del comité.
 */
export const LIQUID_KPI_CHAIN = [
  'INGRESO',
  'PREINGRESO',
  'LIQUIDO',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
] as const

/** KPI Silos Kepler base (R3/R4): entrada estándar con preingreso. La cadena con descarga S7 se
 * define por circuito en EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE. */
export const KEPLER_KPI_CHAIN = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
] as const

/** Códigos ejecutivos legacy antes de renombrar a R3/R4. */
export const LEGACY_KEPLER_EXECUTIVE_ALIASES: Record<string, string> = {
  RK1: 'R3',
  RK2: 'R4',
}

export function normalizeExecutiveCircuitForKpi(circuitCode: string): string {
  return LEGACY_KEPLER_EXECUTIVE_ALIASES[circuitCode] ?? circuitCode
}

/** Volcable 1 / Volcable 2: misma cadena KPI recepción; vista unificada en pestaña tiempos. */
export const VOLCABLE_RECEIPT_KPI_UNION_CODE = 'R5+R6'

export const VOLCABLE_RECEIPT_CIRCUIT_CODES = ['R5', 'R6'] as const

/** Tope KPI recepción Volcable 1/2 (esperas en calada, estadía). */
export const VOLCABLE_RECEIPT_KPI_MAX_MINUTES = 8 * 60

export function isVolcableReceiptCircuit(circuitCode: string): boolean {
  const c = normalizeExecutiveCircuitForKpi(String(circuitCode ?? '').trim())
  return c === 'R5' || c === 'R6'
}

export function kpiCircuitCodesForScatterFilter(circuitFilter: string): string[] {
  if (circuitFilter === VOLCABLE_RECEIPT_KPI_UNION_CODE) return [...VOLCABLE_RECEIPT_CIRCUIT_CODES]
  // Pellet unificado: el scatter guarda los subcódigos por celda (R13/R30…); el filtro
  // unificado los expande para incluirlos todos.
  if (circuitFilter === PELLET_DESPACHO_UNIFIED_CODE) return [circuitFilter, ...PELLET_DESPACHO_CODES]
  if (circuitFilter === PELLET_TRANSILE_UNIFIED_CODE) return [circuitFilter, ...PELLET_TRANSILE_CODES]
  const code = String(circuitFilter ?? '').trim()
  return code ? [code] : []
}

export const KEPLER_KPI_CIRCUIT_CODES = new Set(['R3', 'R4'])

/** @deprecated Unificado en SL_BALANZA_ROLLUP_TRANSITION (S1→S7). */
export const SL_SALIDA_EGRESO_ROLLUP_TRANSITION = {
  from: 'SL_BALANZA_SALIDA',
  to: 'SL_EGRESO',
} as const

/**
 * Tránsito físico balanza salida SL → egreso (~200–300 m). No es estadía en puerto.
 * El calado Excel NO aplica acá (eso es otra fase operativa).
 */
export const SL_SALIDA_EGRESO_MAX_MINUTES = 30

/** Si falta cámara S5 y solo hay salida Excel, balanza salida se infiere pocos min antes. */
export const SL_EXIT_TRANSIT_DEFAULT_MINUTES = 5

/** Tránsito ingreso SL → balanza ingreso (cámaras S0→S1/S2); no inferir si el hueco es mayor. */
export const SL_INGRESO_TO_BALANZA_MAX_MINUTES = 60

/** Anclas Excel por operación (match patente + external_operation_id). */
export type SlExcelTimelineAnchors = {
  externalIngresoAt?: string
  externalCaladoAt?: string
  externalSalidaAt?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
  plantaNormalized?: string
  executiveCircuitCode?: string
}

export function shouldUseExcelCaladoAsSlDescarga(
  executiveCircuitCode?: string,
  plantaNormalized?: string
): boolean {
  // Importante: en SL no se debe usar `external_calado_at` como proxy de `SL_DESCARGA`.
  // `SL_DESCARGA` debe provenir de cámara/traza de descarga (o el proxy correcto para el caso, si existiera),
  // pero no fijarse con la hora de calado del contrato.
  return false
}

/** Tránsito físico Volcable → balanza egreso (~200 m): solo cámaras Truckflow o salida Excel cercana. */
export const VOLCABLE_BALANZA_EGRESO_MAX_MINUTES = 30

/** Tope gráfico KPI / dispersión (6 h) — tabla y scatter usan el mismo filtro. */
export const KPI_SEGMENT_DISPLAY_MAX_MINUTES = 360

export function isWithinKpiSegmentDisplayMax(minutes: number): boolean {
  return Number.isFinite(minutes) && minutes > 0 && minutes <= KPI_SEGMENT_DISPLAY_MAX_MINUTES
}

/** Tramos cortos: solo tránsitos físicos (~200 m). Resto: tope operativo 6 h (360 min). */
export const SHORT_SEGMENT_MAX_MINUTES: Record<string, number> = {
  'SL_BALANZA_SALIDA→SL_EGRESO': SL_SALIDA_EGRESO_MAX_MINUTES,
  'VOLCABLE→BALANZA_EGRESO': VOLCABLE_BALANZA_EGRESO_MAX_MINUTES,
}

/** Rollup ingreso SL → balanza ingreso SL (falta cámara S2 u otras intermedias). */
export const SL_INGRESO_BALANZA_ROLLUP_TRANSITION = {
  from: 'SL_INGRESO',
  to: 'SL_BALANZA_INGRESO',
} as const

/** Tránsito típico ingreso puerto (S0) → balanza ingreso (S1) cuando falta cámara S1. */
export const SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES = 15

/** Fin del tramo KPI balanza ingreso → egreso SL (S7 real o salida Excel). */
const SL_BALANZA_ROLLUP_END_CODES = ['SL_EGRESO'] as const

/** Brecha máxima entre hitos del mismo recorrido operativo (mismo viaje). */
export const OPERATIONAL_TRIP_GAP_MAX_MINUTES = 6 * 60

/** Rollups deducidos Ric/Volcable: tope para no mezclar viajes distintos. */
export const INFERRED_KPI_ROLLUP_MAX_MINUTES = 6 * 60

/** Tramos KPI San Lorenzo (S0→S1, etc.): sin tope 6 h — estadías reales pueden superarlo. */
export const SL_KPI_SEGMENT_MAX_MINUTES = 72 * 60

/** Estadía máxima balanza entrada → egreso SL (comité scatter/CSV): 3 h operativas. */
export const SL_BALANZA_STAY_MAX_MINUTES = 180

/**
 * Pata SL en KPI: ingreso puerto → balanza entrada → **volcable (descarga)** → egreso.
 * La soja (R7) descarga en los volcables del puerto igual que el pellet: la cámara
 * `SLZVolcableC{N}` (SL_VOLCABLE) parte el tramo balanza→egreso en balanza→volcable y
 * volcable→egreso. El camión que NO pasó esa cámara no parte el tramo (el rollup
 * balanza→egreso lo sigue cubriendo para comité).
 */
export const SL_OPERATIONAL_KPI_CHAIN = [
  'SL_INGRESO',
  'SL_BALANZA_INGRESO',
  'SL_VOLCABLE',
  'SL_EGRESO',
] as const

export const CIRCUITS_WITH_SL_BALANZA_ROLLUP = new Set(['R7', 'SL1', 'R26', 'R27'])

/** Puente Ricardone ↔ San Lorenzo en transiles externos (sin cámaras en ruta). */
export const TRANSILE_BRIDGE_KPI_TRANSITIONS = {
  R7: { fromCode: 'EGRESO', toCode: 'SL_INGRESO' },
  R26: { fromCode: 'BALANZA_EGRESO', toCode: 'SL_INGRESO' },
  R27: { fromCode: 'SL_EGRESO', toCode: 'INGRESO' },
} as const

const CIRCUITS_WITH_TRANSILE_BRIDGE_ROLLUP = new Set(Object.keys(TRANSILE_BRIDGE_KPI_TRANSITIONS))

export function usesFullOperationalSegmentTimeline(executiveCircuitCode: string): boolean {
  const code = normalizeExecutiveCircuitForKpi(executiveCircuitCode)
  return (
    CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(code) || CIRCUITS_WITH_TRANSILE_BRIDGE_ROLLUP.has(code)
  )
}

/** Duración máxima del rollup balanza SL → egreso (S1→S7). */
const SL_BALANZA_ROLLUP_MAX_MINUTES = SL_BALANZA_STAY_MAX_MINUTES

/** Rollup KPI descarga/carga Ricardone cuando faltan cámaras en Celda 16 / Volcable. */
export type DischargeKpiRollupRule = {
  fromCode: string
  toCode: string
  /** Puntos Truckflow que cierran el tramo (salto no consecutivo). */
  endCodes: readonly string[]
}

const DISCHARGE_KPI_ROLLUP_MAX_MINUTES = INFERRED_KPI_ROLLUP_MAX_MINUTES

const BALANZA_STAY_KPI_ROLLUP_RULE: DischargeKpiRollupRule = {
  fromCode: BALANZA_STAY_ROLLUP_TRANSITION.from,
  toCode: BALANZA_STAY_ROLLUP_TRANSITION.to,
  endCodes: ['BALANZA_EGRESO', 'EGRESO'],
}

export const DISCHARGE_KPI_ROLLUP_BY_CIRCUIT: Record<string, DischargeKpiRollupRule[]> = {
  R1: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R5: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R6: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R3: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R4: [BALANZA_STAY_KPI_ROLLUP_RULE],
  R9: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R19: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R20: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'VOLCABLE',
      endCodes: ['VOLCABLE', 'BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R7: [
    {
      fromCode: 'EGRESO',
      toCode: 'SL_INGRESO',
      endCodes: ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_EGRESO'],
    },
  ],
  R26: [
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_CARGA',
      endCodes: ['CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_CARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'BALANZA_EGRESO',
      toCode: 'SL_INGRESO',
      endCodes: ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_BALANZA_SALIDA', 'SL_EGRESO'],
    },
  ],
  R27: [
    {
      fromCode: 'SL_EGRESO',
      toCode: 'INGRESO',
      endCodes: ['INGRESO', 'PREINGRESO', 'CALADA', 'BALANZA_INGRESO'],
    },
    {
      fromCode: 'BALANZA_INGRESO',
      toCode: 'CELDA16_DESCARGA',
      endCodes: ['CELDA16_DESCARGA', 'CELDA16_CARGA', 'BALANZA_EGRESO', 'EGRESO'],
    },
    {
      fromCode: 'CELDA16_DESCARGA',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
  R34: [
    {
      fromCode: 'LIQUIDO',
      toCode: 'BALANZA_EGRESO',
      endCodes: ['BALANZA_EGRESO', 'EGRESO'],
    },
  ],
}

export const CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP = new Set(Object.keys(DISCHARGE_KPI_ROLLUP_BY_CIRCUIT))

export function getDischargeKpiRollupRules(circuitCode: string): DischargeKpiRollupRule[] {
  const code = normalizeExecutiveCircuitForKpi(circuitCode)
  return DISCHARGE_KPI_ROLLUP_BY_CIRCUIT[code] ?? []
}

export function transitionKey(fromCode: string, toCode: string): string {
  return `${fromCode}→${toCode}`
}

/**
 * Umbral de "demora" por transición (minutos). Un tramo que supera el umbral se **excluye
 * del análisis de tiempo** (media/histograma/scatter) y se lista aparte como DEMORADO.
 *
 * `CALADA→EGRESO` (R7): terminar la calada y egresar hacia el puerto es un tránsito corto;
 * más de 30 min es una demora que distorsiona el KPI del tramo. Pedido operativo 2026-08-18.
 *
 * `EGRESO→SL_INGRESO` (R7): trayecto por ruta Ricardone → San Lorenzo. La mediana real es
 * ~11 min (p99 ~25); >30 min es un apareo erróneo de cámara/OCR (egreso de Ric matcheado con
 * un ingreso a SL horas después) que infla la media. Se saca del KPI y se lista como DEMORADO
 * (con patente). Pedido operativo 2026-09-03.
 */
export const SEGMENT_DEMORA_THRESHOLD_MINUTES: Record<string, number> = {
  'CALADA→EGRESO': 30,
  'EGRESO→SL_INGRESO': 30,
}

/** Umbral de demora del tramo, o null si el tramo no tiene regla de demora. */
export function demoraThresholdForTransition(fromCode: string, toCode: string): number | null {
  return SEGMENT_DEMORA_THRESHOLD_MINUTES[transitionKey(fromCode, toCode)] ?? null
}

/** True si el leg supera el umbral de demora del tramo (queda fuera del KPI, se lista como DEMORADO). */
export function isDemoraLegDuration(minutes: number, fromCode: string, toCode: string): boolean {
  const threshold = demoraThresholdForTransition(fromCode, toCode)
  return threshold != null && Number.isFinite(minutes) && minutes > threshold
}

export function maxAllowedMinutesForTransition(fromCode: string, toCode: string): number {
  const key = transitionKey(fromCode, toCode)
  // Kepler: la estadía en silo (playa 3 → descarga S7) es una espera real de hasta ~24 h.
  // (Transición exclusiva de R3/R4, no afecta a otros circuitos.)
  if (key === transitionKey('PLAYA', 'DESCARGA_S7')) {
    return KEPLER_LONG_DWELL_MAX_MINUTES
  }
  if (key === transitionKey(SL_BALANZA_ROLLUP_TRANSITION.from, SL_BALANZA_ROLLUP_TRANSITION.to)) {
    return SL_BALANZA_ROLLUP_MAX_MINUTES
  }
  if (key === transitionKey(SL_SALIDA_EGRESO_ROLLUP_TRANSITION.from, SL_SALIDA_EGRESO_ROLLUP_TRANSITION.to)) {
    return SL_SALIDA_EGRESO_MAX_MINUTES
  }
  if (key === transitionKey(SL_INGRESO_BALANZA_ROLLUP_TRANSITION.from, SL_INGRESO_BALANZA_ROLLUP_TRANSITION.to)) {
    return SL_KPI_SEGMENT_MAX_MINUTES
  }
  if (key === transitionKey('VOLCABLE', 'BALANZA_EGRESO')) {
    return VOLCABLE_BALANZA_EGRESO_MAX_MINUTES
  }
  for (const rules of Object.values(DISCHARGE_KPI_ROLLUP_BY_CIRCUIT)) {
    for (const rule of rules) {
      if (key === transitionKey(rule.fromCode, rule.toCode)) {
        return DISCHARGE_KPI_ROLLUP_MAX_MINUTES
      }
    }
  }
  if (fromCode.startsWith('SL_') || toCode.startsWith('SL_')) {
    return SL_KPI_SEGMENT_MAX_MINUTES
  }
  return SHORT_SEGMENT_MAX_MINUTES[key] ?? INFERRED_KPI_ROLLUP_MAX_MINUTES
}

export function histogramBinMinutesForTransition(_fromCode?: string, _toCode?: string): number {
  return SEGMENT_TIMING_HISTOGRAM_BIN_MIN
}

export function isShortOperationalTransition(fromCode: string, toCode: string): boolean {
  return transitionKey(fromCode, toCode) in SHORT_SEGMENT_MAX_MINUTES
}
