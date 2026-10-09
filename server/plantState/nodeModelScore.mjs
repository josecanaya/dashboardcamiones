/**
 * Modelo por nodos (en evaluación): de qué camión es una lectura dudosa, con la misma regla para
 * cada candidato y para «un camión nunca visto».
 *
 *   puntaje(c)  = ¿podía estar ahí? × ¿la cámara leería eso? × ¿se ve igual?
 *   puntaje(Ø)  = p_inicio(nodo) × (chance de que exista esa patente y se lea así)
 *   P(c)        = puntaje(c) / (Σ puntajes + puntaje(Ø))
 *
 * p_inicio(nodo) es la probabilidad de que un camión tenga en ese nodo su primera lectura buena:
 * sale de la secuencia de cámaras de cada circuito del modelo de nodos y de lo que lee cada punto
 * (scripts/p-inicio-nodos.mjs → data/pInicioNodos.json). Ingreso vale 1; Calada de día, 1,6 %.
 *
 * Modo evaluación: se calcula y se muestra, pero no decide asignaciones automáticas.
 * Ver docs/auditoria-patentes-2026-10-08/teorema/hipotesis-tesis.html.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODE_MODEL_VERSION = 'nodos-v1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

let _table = null
export function pInicioTable() {
  if (_table) return _table
  try {
    _table = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'pInicioNodos.json'), 'utf8'))
  } catch {
    _table = { floor: 0.016, fleetPlates: 12789, nodes: {} }
  }
  return _table
}

/*
 * Probabilidad de cada cambio de la cámara, por variante concreta (a medir por cámara con dobles
 * lecturas; valores iniciales de la presentación):
 *   - confusión típica (0/O, 8/B…): ≈ 10 % de las lecturas, repartido en ≈ 9 variantes
 *   - otra letra cualquiera: ≈ 5 % de las lecturas, repartido en 102 variantes (patente de 6)
 *   - letra de menos: ≈ 2,5 % en 6 variantes · letra de más: ≈ 1 % en ≈ 200 variantes
 */
const P_CONFUSION = 0.011
const P_OTHER_SUB = 0.05 / 102
const P_DELETE = 0.025 / 6
const P_INSERT = 0.01 / 200
const DEFAULT_READ = 0.75
/**
 * Lectura dañada: con dos o más cambios raros la lectura ya no informa la patente. Cualquier camión
 * (candidato o nunca visto) pudo producirla con esta chance; sin piso, el modelo corregía con 99 % a
 * un camión equivocado (IP6991 → IGP699, CS5111 → CMF111 el 06–07/10). Replay de 114 casos: sin piso
 * 11 de 14 correcciones ≥ 98 % bien; con 2,5e-8, 5 de 6 (scripts/replay-node-model.mjs).
 */
export const DAMAGED_READ = 2.5e-8
const CONFUSABLE = new Set(
  ['0O', '0D', '0Q', '8B', '1I', '1L', '5S', '2Z', '6G', '4A', 'MN', 'UV', 'VY', 'HM', 'EF', 'CG'].flatMap((p) => [p, p[1] + p[0]])
)
const cost = (p) => -Math.log(p)

/** Día 6–18 h, noche 18–6 h (hora argentina), como el informe de cámaras. */
export function franjaOf(ms) {
  const h = new Date(ms - 3 * 3600_000).getUTCHours()
  return h >= 6 && h < 18 ? 'dia' : 'noche'
}

/**
 * ¿La cámara leería `read` si pasara `real`? Exacta: lo que lee bien el punto. Si no, el camino de
 * cambios más probable (distancia de edición con costo −ln p de cada cambio).
 */
export function readLikelihood(read, real, readRate = DEFAULT_READ) {
  const a = String(read || '')
  const b = String(real || '')
  if (a.length < 4 || !b) return 0
  if (a === b) return readRate
  return Math.max(DAMAGED_READ, Math.exp(-editCost(a, b)))
}

/** −ln de la probabilidad del camino de cambios más probable de la patente real `b` a la lectura `a`. */
function editCost(a, b) {
  // a = lectura, b = patente real. Borrar un carácter de b = la cámara se comió una letra.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j * cost(P_DELETE))
  for (let i = 1; i <= a.length; i++) {
    const cur = [i * cost(P_INSERT)]
    for (let j = 1; j <= b.length; j++) {
      const sub = a[i - 1] === b[j - 1] ? 0 : cost(CONFUSABLE.has(a[i - 1] + b[j - 1]) ? P_CONFUSION : P_OTHER_SUB)
      cur[j] = Math.min(prev[j - 1] + sub, cur[j - 1] + cost(P_DELETE), prev[j] + cost(P_INSERT))
    }
    prev = cur
  }
  return prev[b.length]
}

let _fleet = null
/** Patentes que vienen seguido (leídas en 2 días distintos o más de septiembre). */
export function fleetPlates() {
  if (_fleet) return _fleet
  try {
    _fleet = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'flotaPatentes.json'), 'utf8')).plates
  } catch {
    _fleet = []
  }
  return _fleet
}

/**
 * ¿La cámara leería esto si pasara un camión que no tenemos en planta?
 *   - Lectura válida: que ese camión exista y se lea bien. Si viene seguido (flota), 1 entre la flota;
 *     si no, 1 entre todas las patentes válidas que vieron las cámaras en septiembre.
 *   - Lectura inválida: que algún camión de la flota (fuera de los candidatos) se lea mal y dé justo
 *     esto: el promedio de ¿la cámara leería eso? sobre la flota.
 */
export function neverSeenReadLikelihood(readPlate, validFormat, readRate = DEFAULT_READ, exclude = new Set()) {
  const fleet = fleetPlates()
  const all = pInicioTable().fleetPlates || 12789
  const plate = String(readPlate || '')
  if (validFormat) return fleet.includes(plate) && !exclude.has(plate) ? readRate / Math.max(1, fleet.length) : readRate / all
  if (!fleet.length) return DAMAGED_READ
  let sum = 0
  for (const x of fleet) if (!exclude.has(x)) sum += Math.exp(-editCost(plate, x))
  return Math.max(DAMAGED_READ, sum / fleet.length)
}

/**
 * ¿Podía estar ahí? Peso relativo del candidato en este nodo, antes de mirar la patente.
 * Una lectura posterior a la captura no cuenta en vivo (todavía no había ocurrido).
 */
export function arrivalWeight(c) {
  if (c.seenAfter) return 0
  if (c.sameNode) return 1
  // Próximo paso de su circuito; si no, alcanzable pero salteando al menos una cámara (× 0,25).
  const w = Math.max(c.nextProbability ?? 0, 0.25 * (c.nodeProbability ?? 0))
  return c.onTime === false ? w * 0.25 : w
}

/**
 * @param {{ readPlate: string, validFormat: boolean, node: string, at: string, expectedAtNode?: number }} item
 * @param {{ plate: string, seenAfter?: boolean, sameNode?: boolean, nextProbability?: number, nodeProbability?: number, onTime?: boolean, attrLr?: number }[]} candidates
 */
/**
 * `opts.ignorePlate`: lectura ilegible, la patente no informa. Se decide solo por recorrido, hora y
 * atributos (la chance de la lectura vale lo mismo para todos los candidatos y para «nunca visto»).
 */
export function scoreWithNodeModel(item, candidates, opts = {}) {
  const table = pInicioTable()
  const at = Date.parse(item.at)
  const franja = franjaOf(at)
  const node = table.nodes[item.node] ?? null
  const pInicio = node?.pInicio?.[franja] ?? 1
  const read = node?.read?.[franja] ?? DEFAULT_READ
  const weights = candidates.map(arrivalWeight)
  // Camiones conocidos que esperan este paso: los parecidos y los que no. Mínimo 1.
  const expected = Math.max(1, item.expectedAtNode ?? 0, weights.reduce((s, w) => s + w, 0))
  const rows = candidates.map((c, i) => {
    const prior = ((1 - pInicio) * weights[i]) / expected
    const likelihood = opts.ignorePlate ? 1 : readLikelihood(item.readPlate, c.plate, read)
    const attrLr = c.attrLr ?? 1
    return { plate: c.plate, prior, readLikelihood: likelihood, attrLr, score: prior * likelihood * attrLr }
  })
  const neverSeenLikelihood = opts.ignorePlate ? 1 : neverSeenReadLikelihood(item.readPlate, item.validFormat, read, new Set(candidates.map((c) => c.plate)))
  const neverSeen = pInicio * neverSeenLikelihood
  const total = rows.reduce((s, r) => s + r.score, 0) + neverSeen
  return {
    version: NODE_MODEL_VERSION,
    mode: 'evaluacion',
    node: item.node,
    franja,
    pInicio,
    readRate: read,
    expectedAtNode: Math.round(expected * 10) / 10,
    candidates: rows.map((r) => ({ ...r, probability: total ? r.score / total : 0 })),
    neverSeen: { prior: pInicio, readLikelihood: neverSeenLikelihood, score: neverSeen, probability: total ? neverSeen / total : 1 },
  }
}
