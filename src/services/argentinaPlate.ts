/**
 * Capa: normalización — formato patente Argentina (funciones puras).
 */
const PATENTE_VIEJA = /^[A-Z]{3}[0-9]{3}$/
const PATENTE_MERCOSUR = /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/

/** Trim, uppercase, elimina espacios/guiones y caracteres no alfanuméricos. */
export function normalizePlate(rawPlate: string): string {
  let s = (rawPlate ?? '').trim().toUpperCase()
  s = s.replace(/[\s-]+/g, '')
  s = s.replace(/[^A-Z0-9]/g, '')
  return s
}

export function isValidArgentinaPlate(rawPlate: string): boolean {
  const n = normalizePlate(rawPlate)
  return PATENTE_VIEJA.test(n) || PATENTE_MERCOSUR.test(n)
}
