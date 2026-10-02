/**
 * Modelo de nodos del Nodo Sur (Ricardone + San Lorenzo): fuente única de verdad de nodos,
 * cámaras y recorridos de circuito. Los datos salen de `nodoSur.generated.ts` (generado desde
 * el modelo); acá solo hay lectura. Sin I/O.
 *
 * Convención de códigos: el feed de TruckFlow manda `<planta>-S<n>` (`2-` Ricardone, `1-` San
 * Lorenzo). El catálogo de circuitos usa el código S sin prefijo (`S6`), encadenando plantas en
 * los transiles; `nodoSurCameraSequence` produce esa forma.
 */
import {
  NODO_SUR_CIRCUITS,
  NODO_SUR_NODES,
  type NodoSurCircuit,
  type NodoSurNode,
  type NodoSurPlant,
} from './nodoSur.generated'

export { NODO_SUR_CIRCUITS, NODO_SUR_NODES }
export type { NodoSurCircuit, NodoSurNode, NodoSurPlant }

const FEED_PLANT: Record<string, NodoSurPlant> = { '2': 'ricardone', '1': 'san_lorenzo' }
const FEED_CODE = /^([12])-(S\d+)$/i

const NODE_BY_ID = new Map(NODO_SUR_NODES.map((n) => [n.id, n]))
const CIRCUIT_BY_ID = new Map(NODO_SUR_CIRCUITS.map((c) => [c.id, c]))

/** Nodos por cámara; un sector puede cubrir dos nodos (S8: Silo Chief y Tolva silo Chief). */
const NODES_BY_DEVICE = (() => {
  const map = new Map<string, NodoSurNode[]>()
  for (const n of NODO_SUR_NODES) {
    for (const d of [...n.devices, ...n.rearDevices]) {
      const k = d.toLowerCase()
      map.set(k, [...(map.get(k) ?? []), n])
    }
  }
  return map
})()

/** Nodos por sectorCode del feed; un código puede cubrir dos nodos (Balanza ingreso/egreso, Volcable 1/2). */
const NODES_BY_FEED_CODE = (() => {
  const map = new Map<string, NodoSurNode[]>()
  for (const n of NODO_SUR_NODES) {
    if (!n.feedCode || !n.hasCamera) continue
    map.set(n.feedCode, [...(map.get(n.feedCode) ?? []), n])
  }
  return map
})()

export function getNodoSurNode(id: string): NodoSurNode | undefined {
  return NODE_BY_ID.get(id)
}

export function getNodoSurCircuit(id: string): NodoSurCircuit | undefined {
  return CIRCUIT_BY_ID.get(String(id ?? '').trim().toUpperCase())
}

/** `2-S3` → `S3`; cualquier otra forma → null. */
export function feedSectorToLogicalCode(sectorCode: string | null | undefined): string | null {
  const m = FEED_CODE.exec(String(sectorCode ?? '').trim())
  return m ? m[2]!.toUpperCase() : null
}

/** `2-S3` → `ricardone`; cualquier otra forma → null. */
export function feedSectorPlant(sectorCode: string | null | undefined): NodoSurPlant | null {
  const m = FEED_CODE.exec(String(sectorCode ?? '').trim())
  return m ? FEED_PLANT[m[1]!]! : null
}

type EventRef = { sectorCode?: string | null; deviceCode?: string | null }

/** Nodos que pudieron observar el evento: por cámara si está en el modelo, si no por sectorCode del feed. */
function candidateNodes(event: EventRef): NodoSurNode[] {
  const byDevice = NODES_BY_DEVICE.get(String(event.deviceCode ?? '').trim().toLowerCase())
  if (byDevice?.length) return byDevice
  return NODES_BY_FEED_CODE.get(String(event.sectorCode ?? '').trim().toUpperCase()) ?? []
}

/**
 * Nodo que observó el evento, cuando es unívoco. La cámara manda (distingue Balanza ingreso de
 * egreso y Volcable 1 de 2). Si dos nodos comparten cámara (S8) devuelve null: decide el circuito.
 */
export function nodoSurNodeForEvent(event: EventRef): NodoSurNode | null {
  const candidates = candidateNodes(event)
  return candidates.length === 1 ? candidates[0]! : null
}

/** Código S del nodo que observó el evento (unívoco aunque el nodo no lo sea: S8, S4, S9). */
export function nodoSurCodeForEvent(event: EventRef): string | null {
  const codes = new Set(candidateNodes(event).map((n) => n.code))
  return codes.size === 1 ? [...codes][0] ?? null : null
}

/**
 * Recorrido del circuito tal como lo pueden ver las cámaras: códigos S de los nodos con cámara,
 * sin repetir consecutivos (igual que se arma la secuencia observada de un journey).
 */
export function nodoSurCameraSequence(circuitId: string): string[] {
  const c = getNodoSurCircuit(circuitId)
  if (!c) return []
  const out: string[] = []
  for (const id of c.nodes) {
    const n = NODE_BY_ID.get(id)
    if (!n?.hasCamera || !n.code) continue
    if (out[out.length - 1] !== n.code) out.push(n.code)
  }
  return out
}

/** Etiqueta del nodo por código y planta (`S6`, ricardone → `Playa 3`). Varios nodos → unidos. */
export function nodoSurLabel(code: string, plant: NodoSurPlant): string | null {
  const labels = NODO_SUR_NODES.filter((n) => n.plant === plant && n.code === code).map((n) => n.label)
  return labels.length ? [...new Set(labels)].join(' / ') : null
}
