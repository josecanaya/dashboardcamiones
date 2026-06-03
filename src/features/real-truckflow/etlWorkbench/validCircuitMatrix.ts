/** Cadena lógica SL estándar (recepción interna / pata SL de R7 / transiles). */
export const SL_RECEPCION_LOGICAL_CHAIN = [
  'SL_INGRESO',
  'SL_BALANZA_INGRESO',
  'SL_CALADA',
  'SL_ENLACE',
  'SL_DESCARGA',
  'SL_BALANZA_SALIDA',
  'SL_EGRESO',
] as const

/** Pata Ricardone típica de ruta R7 antes del puente. */
export const R7_RIC_LOGICAL_PREFIX = ['INGRESO', 'PREINGRESO', 'CALADA', 'EGRESO'] as const

/** Prefijo Ric transile C16 → SL (carga). */
export const TRANSILE_C16_RIC_CARGA_PREFIX = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'CELDA16_CARGA',
  'BALANZA_EGRESO',
  'EGRESO',
] as const

/** Prefijo Ric transile C16 → SL (descarga). */
export const TRANSILE_C16_RIC_DESCARGA_PREFIX = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'CELDA16_DESCARGA',
  'BALANZA_EGRESO',
  'EGRESO',
] as const

/** Secuencias S* SL1 — matriz operativa San Lorenzo recepción. */
export const SL1_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'S2', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'ESPERA', 'S1', 'S3', 'S4', 'S5', 'S7'],
  ['S0', 'S2', 'S1', 'S3', 'S5', 'S7'],
  ['S0', 'S1', 'S3', 'S4', 'ESPERA', 'S5', 'S7'],
]

/** Secuencias S* R7 Ric → SL (pata Ric + extensión SL opcional en allowed del config). */
export const R7_RIC_ALLOWED_S_SEQUENCES: readonly (readonly string[])[] = [
  ['S0', 'S1', 'S2', 'S3'],
  ['S0', 'S1', 'S3'],
  ['S0', 'S1', 'ESPERA', 'S3'],
  ['S0', 'S2', 'S1', 'S3'],
]

/** Normaliza ESPERA / W como marcador virtual de variación. */
export function normalizeExecutiveSectorToken(token: string): string {
  const t = String(token ?? '').trim().toUpperCase()
  if (t === 'W') return 'ESPERA'
  return t
}

export function normalizeExecutiveSectorSequence(seq: readonly string[]): string[] {
  return seq.map((s) => normalizeExecutiveSectorToken(s))
}

/** Subsecuencia ordenada permitiendo tokens ESPERA como comodín de variación. */
export function matchesExecutiveSectorSequence(
  observed: readonly string[],
  expected: readonly string[]
): boolean {
  const obs = normalizeExecutiveSectorSequence(observed)
  const exp = normalizeExecutiveSectorSequence(expected)
  let j = 0
  for (let i = 0; i < obs.length && j < exp.length; i++) {
    if (obs[i] === exp[j]) {
      j++
      continue
    }
    if (exp[j] === 'ESPERA') {
      j++
      i--
      continue
    }
  }
  return j === exp.length
}

export function findMatchingExecutiveSequence(
  observed: readonly string[],
  candidates: readonly (readonly string[])[]
): { name: string; sequence: readonly string[] } | null {
  for (let i = 0; i < candidates.length; i++) {
    const seq = candidates[i]!
    if (matchesExecutiveSectorSequence(observed, seq)) {
      return { name: `SEQ_${i + 1}`, sequence: seq }
    }
  }
  return null
}
