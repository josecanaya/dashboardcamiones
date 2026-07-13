import { recordsToCsv } from './csv'

/** Tabla tipada: filas + orden de columnas. CSV solo como serialización al borde. */
export type TypedTable<T extends Record<string, unknown> = Record<string, unknown>> = {
  readonly name: string
  readonly headers: readonly (keyof T & string)[]
  readonly rows: readonly T[]
}

export function makeTable<T extends Record<string, unknown>>(
  name: string,
  headers: readonly (keyof T & string)[],
  rows: readonly T[]
): TypedTable<T> {
  return { name, headers, rows }
}

export function tableToCsv<T extends Record<string, unknown>>(t: TypedTable<T>): string {
  return recordsToCsv([...t.headers], t.rows as unknown as Record<string, unknown>[])
}
