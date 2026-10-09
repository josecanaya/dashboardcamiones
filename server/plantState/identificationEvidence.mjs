/**
 * Evidencia por candidato para revisar una lectura dudosa: patente, color, marca, tipo y recorrido,
 * combinados en una probabilidad. Los atributos salen del DSS (el feed en vivo no los trae).
 *
 * Razones de verosimilitud medidas entre cámaras (3.683 pasos del mismo camión, 24–30/09,
 * outputs/reconocimiento_20260924_30/atributos_entre_camaras.py): cuánto más probable es que
 * sean el mismo camión si el atributo coincide o no.
 */

const LR_COLOR_MATCH = { White: 1.21, Black: 2.22, Blue: 3.04, Silver: 2.78, Red: 10.8, Gray: 2.51 }
const LR_COLOR_DEFAULT = 3.0
const LR_COLOR_MISMATCH = 0.728
const LR_BRAND_MATCH = 4.75
const LR_BRAND_MISMATCH = 0.197
const LR_TYPE_MATCH = 1.09
const LR_TYPE_MISMATCH = 0.759
/** Camión contra auto/camioneta: la cámara confunde camión grande/mediano, no camión con auto. */
const LR_TYPE_CROSS = 0.3
/*
 * Calibrado el 07/10 con 116 lecturas revisadas por operaciones (máxima verosimilitud sobre
 * patente + recorrido): cuando la probabilidad da ≥ 90 % acertó 7 de 7.
 *   - «otro camión / la lectura está bien»: 0,20 si la lectura es una patente válida, 0,03 si no.
 *   - recorrido: no esperado en el nodo multiplica 0,7 como mínimo (las cámaras se saltean nodos).
 */
const OTHER_TRUCK_PRIOR = 0.2
const OTHER_INVALID_PRIOR = 0.03
const ROUTE_FLOOR = 0.7
const NO_CIRCUIT_ROUTE = 0.3

const TRUCK = new Set(['Large Truck', 'Medium Truck', 'Small Truck', 'LargeTruck', 'MidTruck', 'SmallTruck', 'Heavy Truck'])

function known(v) {
  const s = String(v ?? '').trim()
  return s && !/^(unknown|unrecognized|other|-1|99)$/i.test(s) ? s : null
}

/** Comparación de un atributo: coincide / no coincide / sin dato, con su razón de verosimilitud. */
export function compareAttribute(kind, a, b) {
  const x = known(a)
  const y = known(b)
  if (!x || !y) return { kind, read: x, candidate: y, result: 'sin_dato', lr: 1 }
  if (kind === 'tipo') {
    if (x === y) return { kind, read: x, candidate: y, result: 'coincide', lr: LR_TYPE_MATCH }
    const cross = TRUCK.has(x) !== TRUCK.has(y)
    return { kind, read: x, candidate: y, result: 'distinto', lr: cross ? LR_TYPE_CROSS : LR_TYPE_MISMATCH }
  }
  if (x === y) {
    const lr = kind === 'marca' ? LR_BRAND_MATCH : LR_COLOR_MATCH[x] ?? LR_COLOR_DEFAULT
    return { kind, read: x, candidate: y, result: 'coincide', lr }
  }
  return { kind, read: x, candidate: y, result: 'distinto', lr: kind === 'marca' ? LR_BRAND_MISMATCH : LR_COLOR_MISMATCH }
}

/** Verosimilitud de la patente leída dado el candidato (parecido 1 → 1; 0,83 → 0,26; 0,65 → 0,06). */
export function plateLikelihood(similarity) {
  return Math.exp(8 * (Math.max(0, Math.min(1, similarity)) - 1))
}

/**
 * @param {{ readPlate: string, validFormat: boolean, readAttrs: object|null }} read
 * @param {{ plate: string, similarity: number, nodeProbability: number, circuit: string|null, circuitProbability: number, sameNode?: boolean, attrs: object|null }[]} candidates
 */
export function scoreCandidates(read, candidates) {
  const rows = candidates.map((c) => {
    const comparisons = [
      compareAttribute('color', read.readAttrs?.vehicleColor, c.attrs?.vehicleColor),
      compareAttribute('marca', read.readAttrs?.vehicleBrand, c.attrs?.vehicleBrand),
      compareAttribute('tipo', read.readAttrs?.vehicleCategory, c.attrs?.vehicleCategory),
    ]
    const attrLr = comparisons.reduce((p, a) => p * a.lr, 1)
    const plate = plateLikelihood(c.similarity)
    // Recorrido: si el nodo no es esperado no se descarta (puede faltar una cámara), pero pesa poco.
    // Si ningún circuito del modelo pasa por lo que hizo + este nodo, el recorrido pesa en contra.
    const route = c.sameNode ? 1 : c.circuit == null ? NO_CIRCUIT_ROUTE : Math.max(c.nodeProbability, ROUTE_FLOOR)
    return { plate: c.plate, plateLikelihood: plate, route, attrLr, comparisons, score: plate * route * attrLr }
  })
  // Hipótesis «otro camión»: la lectura es una patente válida de un camión que no está entre los candidatos.
  const other = read.validFormat ? OTHER_TRUCK_PRIOR : OTHER_INVALID_PRIOR
  const total = rows.reduce((s, r) => s + r.score, 0) + other
  return {
    candidates: rows.map((r) => ({ ...r, probability: total ? r.score / total : 0 })),
    otherProbability: total ? other / total : 1,
  }
}

/*
 * Umbrales para aplicar sola una lectura con color/marca/tipo del DSS. Calibrados el 08/10 con 78
 * decisiones de operaciones con atributos (scratchpad/attrcal.mjs):
 *   - ≥ 90 %: 5 de 5 bien. Entre 85 y 90 % falló AB912RO → AB912PO (camiones distintos, mismos atributos).
 *   - patente válida leída en este mismo nodo: 2 de 2 bien desde 75 % (AC297UX → AC297HX 90 %,
 *     AH861QO → AH861QQ 87 % el 08/10 en vivo); se usa 85 % por margen.
 */
export const AUTO_EVIDENCE_PROBABILITY = 0.9
export const AUTO_EVIDENCE_SAME_NODE_PROBABILITY = 0.85
