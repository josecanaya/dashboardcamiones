/**
 * Capa: normalización — similaridad OCR entre patentes (funciones puras).
 * No sustituye reglas temporales/secuenciales del ETL: solo produce candidatos.
 */

const OCR_EQUIV_GROUPS: readonly (readonly string[])[] = [
  ['0', 'O', 'Q'],
  ['1', 'I', 'L'],
  ['2', 'Z'],
  ['5', 'S'],
  ['6', 'G'],
  ['8', 'B'],
  ['7', 'T'],
]

const CHAR_TO_GROUP = new Map<string, number>()
for (let gi = 0; gi < OCR_EQUIV_GROUPS.length; gi++) {
  for (const ch of OCR_EQUIV_GROUPS[gi]!) CHAR_TO_GROUP.set(ch, gi)
}

const MIN_PLATE_LEN_FUZZY = 6
const ARG_PLATE_EXPECTED_LEN = 7

/** Patente lista para comparar: mayúsculas, sin espacios ni guiones, solo A-Z 0-9. */
export function normalizePlateStrict(plate: string): string {
  return String(plate ?? '')
    .toUpperCase()
    .replace(/[\s\-]/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Huella estable por equivalencias OCR (colapsar 0/O/Q → '0', etc.) para clustering débil opcional.
 */
export function normalizePlateOcrKey(plate: string): string {
  const s = normalizePlateStrict(plate)
  let out = ''
  for (const c of s) {
    const g = CHAR_TO_GROUP.get(c)
    if (g !== undefined) {
      const rep = OCR_EQUIV_GROUPS[g]![0]!
      out += rep
    } else out += c
  }
  return out
}

function substitutionCost(ca: string, cb: string): number {
  if (ca === cb) return 0
  const ga = CHAR_TO_GROUP.get(ca)
  const gb = CHAR_TO_GROUP.get(cb)
  if (ga !== undefined && ga === gb) return 0
  return 1
}

/** Levenshtein con sustitución coste 0 entre pares OCR equivalentes. */
/**
 * Distancia de edición con costo de sustitución reducido entre caracteres confundibles por OCR.
 *
 * Usa dos filas rodantes en vez de la matriz `(na+1) × (nb+1)` completa. El resultado es idéntico
 * —misma recurrencia— pero sin allocar `na+1` sub-arrays por llamada: la auditoría de cámaras la
 * invoca millones de veces y esas allocaciones dominaban el tiempo del botón de calibración.
 */
export function weightedOcrLevenshtein(a: string, b: string): number {
  const na = a.length
  const nb = b.length
  if (na === 0) return nb
  if (nb === 0) return na

  let prev = new Float64Array(nb + 1)
  let cur = new Float64Array(nb + 1)
  for (let j = 0; j <= nb; j++) prev[j] = j

  for (let i = 1; i <= na; i++) {
    cur[0] = i
    const ca = a[i - 1]!
    for (let j = 1; j <= nb; j++) {
      const cost = substitutionCost(ca, b[j - 1]!)
      const del = prev[j]! + 1
      const ins = cur[j - 1]! + 1
      const sub = prev[j - 1]! + cost
      cur[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[nb]!
}

/**
 * Score 0..1 entre patentes ya strict-normalizadas o crudas (se aplicará strict dentro).
 */
export function plateSimilarityScore(aPlate: string, bPlate: string): number {
  const a = normalizePlateStrict(aPlate)
  const b = normalizePlateStrict(bPlate)
  if (a === b) return 1
  const la = a.length
  const lb = b.length
  if (la < MIN_PLATE_LEN_FUZZY || lb < MIN_PLATE_LEN_FUZZY) return 0

  if (la === lb) {
    /** Posiciones donde no hay equivalencia OCR “gratis”. */
    let hard = 0
    for (let i = 0; i < la; i++) {
      if (substitutionCost(a[i]!, b[i]!) > 0) hard++
      if (hard > 2) break
    }
    if (hard === 0 && a !== b) return 0.94
    if (hard === 1) return 0.9
    if (hard === 2) return 0.82
  }

  const d = weightedOcrLevenshtein(a, b)
  const maxLen = Math.max(la, lb)
  if (d === 1) {
    const lenGap = Math.abs(la - lb)
    return lenGap === 0 ? 0.86 : 0.8
  }
  if (d === 2) {
    /** Penaliza más cuando las longitudes se alejan del formato típico. */
    const nearArg = Math.abs(la - ARG_PLATE_EXPECTED_LEN) <= 1 && Math.abs(lb - ARG_PLATE_EXPECTED_LEN) <= 1
    return nearArg ? 0.76 : 0.71
  }
  return Math.max(0, 1 - d / Math.max(maxLen * 1.2, 1))
}

/** Candidatos OCR válidos (no implica fusión: el ETL aplica tiempo + score operativo). */
export function isLikelyOcrPlateMatch(aPlate: string, bPlate: string): boolean {
  const a = normalizePlateStrict(aPlate)
  const b = normalizePlateStrict(bPlate)
  if (a === b) return true
  if (a.length < MIN_PLATE_LEN_FUZZY || b.length < MIN_PLATE_LEN_FUZZY) return false
  // Cada inserción/borrado cuesta 1 y las sustituciones no cambian la longitud, así que
  // d >= |na - nb|. Con diferencia >= 3 la distancia ya excede el umbral: se evita la DP.
  if (Math.abs(a.length - b.length) > 2) return false

  const d = weightedOcrLevenshtein(a, b)
  const sim = plateSimilarityScore(a, b)

  if (d <= 1) return sim >= 0.79
  if (d === 2) return sim >= 0.7
  return false
}
