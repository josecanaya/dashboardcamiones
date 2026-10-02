#!/usr/bin/env node
/**
 * Modelo de nodos del Nodo Sur → src/etl-core/domain/nodoSur.generated.ts
 *
 * El modelo (docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json) es la
 * fuente de verdad de nodos, cámaras y circuitos. Este script lo vuelca a TypeScript para que
 * ETL, tablero en vivo y agentes lean lo mismo. No se edita el .generated.ts a mano: se corrige
 * el modelo (fuente/sur_model.py + camaras_por_nodo.json), se regenera y se corre esto.
 *
 *   node scripts/nodo-sur-sync.mjs          escribe el archivo
 *   node scripts/nodo-sur-sync.mjs --check  falla si el archivo no coincide con el modelo
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MODEL = path.join(ROOT, 'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json')
const OUT = path.join(ROOT, 'src/etl-core/domain/nodoSur.generated.ts')

/** Prefijo de planta en el sectorCode del feed TruckFlow (`2-S6`, `1-S10`). */
const FEED_PREFIX = { ricardone: '2', san_lorenzo: '1' }
const KIND = {
  Recepción: 'recepcion',
  Despacho: 'despacho',
  'Transile interno': 'transile_interno',
  'Transile externo': 'transile_externo',
}

const model = JSON.parse(fs.readFileSync(MODEL, 'utf8'))

const nodes = model.nodes.map((n) => ({
  id: n.id,
  plant: n.plant,
  label: n.label,
  code: n.code || null,
  feedCode: n.code ? `${FEED_PREFIX[n.plant]}-${n.code}` : null,
  hasCamera: Boolean(n.hasCamera),
  area: Boolean(n.area),
  capacity: n.capacity ?? null,
  optional: Boolean(n.optional),
  devices: n.devices ?? [],
  rearDevices: n.rear ?? [],
}))

const circuits = model.circuits.map((c) => ({
  id: c.id,
  kind: KIND[c.cat],
  category: c.cat,
  ...(c.label ? { label: c.label } : {}),
  plants: c.plants,
  nodes: c.seq,
}))

const body = `/**
 * GENERADO por scripts/nodo-sur-sync.mjs desde el modelo de nodos del Nodo Sur.
 * NO EDITAR A MANO: corregir el modelo y regenerar (ver docs/propuesta-en-vivo/CRUCE_NODOS_VS_ETL.md).
 */

export type NodoSurPlant = 'ricardone' | 'san_lorenzo'

export type NodoSurNode = {
  /** \`planta:nombre\` tal como figura en la matriz. */
  readonly id: string
  readonly plant: NodoSurPlant
  readonly label: string
  /** Código S del nodo (\`S6\`); null = el modelo no le asigna código. */
  readonly code: string | null
  /** sectorCode con que lo reporta TruckFlow (\`2-S6\`). */
  readonly feedCode: string | null
  /** Tiene al menos una cámara frontal: el paso se observa. */
  readonly hasCamera: boolean
  /** Playa: área de espera sin cámara propia ni dato del sistema de camiones; se mide por las cámaras de entrada y salida. */
  readonly area: boolean
  /** Capacidad del área en camiones (dato de planta); null si no es área. */
  readonly capacity: number | null
  /** Desvío: no es paso de ningún circuito (Playa demorado). */
  readonly optional: boolean
  readonly devices: readonly string[]
  readonly rearDevices: readonly string[]
}

export type NodoSurCircuitKind = 'recepcion' | 'despacho' | 'transile_interno' | 'transile_externo'

export type NodoSurCircuit = {
  readonly id: string
  readonly kind: NodoSurCircuitKind
  readonly category: string
  readonly label?: string
  readonly plants: readonly NodoSurPlant[]
  /** Secuencia de ids de nodo: el recorrido verdadero, con y sin cámara. */
  readonly nodes: readonly string[]
}

export const NODO_SUR_NODES: readonly NodoSurNode[] = ${JSON.stringify(nodes, null, 2)}

export const NODO_SUR_CIRCUITS: readonly NodoSurCircuit[] = ${JSON.stringify(circuits, null, 2)}
`

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''
  if (current !== body) {
    console.error('nodoSur.generated.ts no coincide con el modelo: correr node scripts/nodo-sur-sync.mjs')
    process.exit(1)
  }
  console.log('nodoSur.generated.ts al día')
} else {
  fs.writeFileSync(OUT, body)
  console.log(`nodoSur.generated.ts: ${nodes.length} nodos, ${circuits.length} circuitos`)
}
