/**
 * Rutas predefinidas del simulador. Solo circuitos aceptados (A..G).
 * DEC no existe como nodo; el resultado vive en C (OK/NO/OBS).
 */

export interface Route {
  id: number
  name: string
  seq: string[]
  /** Resultado de calada (último C) para rutas con/sin descarga. */
  caladaResult?: 'OK' | 'NO' | 'OBS'
  /** true = ruta inválida para probar detección. */
  invalid?: boolean
}

/** stepToNode: identidad (solo existen A,B,C,D,E,F,G). */
export function stepToNode(step: string): string {
  return step
}

/** Ruta ideal de referencia. */
export const HAPPY_ROUTE_SEQ = ['A', 'B', 'C', 'D', 'E', 'F']

/** Rutas aceptadas + 2 inválidas para pruebas (6 ejemplos). */
export const ROUTES: Route[] = [
  { id: 1, name: 'Ideal ABCDEF', seq: ['A', 'B', 'C', 'D', 'E', 'F'], caladaResult: 'OK' },
  { id: 2, name: 'Aceptable AGBCDEF', seq: ['A', 'G', 'B', 'C', 'D', 'E', 'F'], caladaResult: 'OK' },
  { id: 3, name: 'Sin descarga ABCF', seq: ['A', 'B', 'C', 'F'], caladaResult: 'NO' },
  { id: 4, name: 'Sin descarga ABCGCF', seq: ['A', 'B', 'C', 'G', 'C', 'F'], caladaResult: 'NO' },
  { id: 5, name: '[Inválida] ABF (falta C)', seq: ['A', 'B', 'F'], invalid: true },
  { id: 6, name: '[Inválida] Orden E antes D', seq: ['A', 'B', 'C', 'E', 'D', 'F'], invalid: true },
]
