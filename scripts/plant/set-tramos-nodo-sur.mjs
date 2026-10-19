/**
 * Caminos entre puntos del plano (tramos) trazados sobre la foto aérea a partir del dibujo del
 * usuario del 15/10/2026. Fuente única para En vivo (PlantMap) y el simulador (build_replay_html).
 * Coordenadas en % de la imagen base. `nextDefault`: punto siguiente más probable desde cada punto,
 * para ubicar en tránsito a un camión sin circuito confirmado.
 *
 * Uso: node scripts/plant/set-tramos-nodo-sur.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const P = (...pairs) => pairs.map(([xPercent, yPercent]) => ({ xPercent, yPercent }))

// Camino común Playa 3 (S6) → silos, y ruta del sur Balanzas (S4) → Playa 3.
const S6_TO_SILOS = [[63.5, 57], [64, 62], [64.7, 70], [67.7, 74.6]]
const S4_EAST = [[35, 75], [45, 75.5], [52.2, 76.2], [57, 76.6]]
const V2_TO_S6 = [[48.2, 73], [54.9, 74.2], [59.6, 75], [61, 73.5], [61.3, 65.4], [61.7, 57.7]]

const RICARDONE = {
  tramos: {
    'S0::S1': ['S0', P([14.3, 75], [14.2, 65], [14.3, 55], [14.9, 48.5])],
    'S1::S2': ['S1', P([18.3, 51])],
    'S1::S2-LIQ': ['S1', P([15.2, 52], [15.2, 62], [15.8, 68])],
    'S2::S3': ['S2', P([19.3, 60], [19, 70], [18.6, 77], [17.5, 80.5])],
    'S2-LIQ::S3': ['S2-LIQ', P([16.4, 74], [16.4, 79])],
    'S2::S4': ['S2', P([20.6, 53.5], [20.9, 60], [20.9, 70], [21.5, 73], [26, 73.6], [30.4, 73.9])],
    'S2-LIQ::S4': ['S2-LIQ', P([17.5, 72.5], [21.5, 73.2], [26, 73.6], [30.4, 73.9])],
    // Balanza → Celda 16 bordeando Playa 1; Celda 16 → Playa 3 rodeando el galpón. Celda 16 nunca va directo a Calada.
    'S4::S5': ['S4', P([30.4, 73.9], [26, 73.6], [21.5, 73], [20.9, 70], [20.9, 60], [20.9, 53.5], [21.6, 51.5], [25.7, 52.3], [29.7, 50], [30.2, 42], [30.6, 35], [31.3, 27], [31.3, 20.5], [29.5, 18], [26, 17], [22.5, 17.8], [21.5, 21], [21.8, 27], [20.5, 31])],
    'S5::S6': ['S5', P([16, 30], [13, 26], [12.5, 18], [13.5, 10], [16, 5], [20, 4.5], [22.5, 6], [24, 10], [24.5, 14], [27, 15.5], [31, 15.8], [33.5, 18], [34, 25], [34, 35], [33.5, 42], [34, 46.8], [40, 47.5], [48, 49], [53.6, 50.8], [61, 51.5])],
    'S3::S4': ['S3', P([20.3, 82.3], [25, 83.7], [29.1, 83.8], [30.3, 80.8], [31.5, 78.5])],
    'S4::S6': ['S4', P(...S4_EAST, [60.4, 75.4], [62.1, 72.3], [62.5, 65.4], [62.9, 57.7])],
    'S4::S9-V1': ['S4', P([35, 74])],
    'S9-V1::S9-V2': ['S9-V1', P([38.7, 73.1])],
    'S6::S9-V2': ['S9-V2', P(...V2_TO_S6)],
    'S6::S9-V1': ['S9-V1', P([38.7, 71.6], [40.4, 71.6], ...V2_TO_S6)],
    'S10::S4': ['S4', P([33.8, 80.8], [35.1, 83.8], [40.5, 85.4], [45.9, 86.9])],
    'S6::S7-B': ['S6', P(...S6_TO_SILOS, [68.2, 80.8])],
    'S6::S7-A': ['S6', P(...S6_TO_SILOS, [68.4, 82.5])],
    'S6::S8': ['S6', P(...S6_TO_SILOS, [70.4, 79.2], [75.1, 80.8], [81.2, 83.1])],
    'S4::S7-A': ['S4', P(...S4_EAST, [59, 78.5], [64.1, 78.8], [64.4, 80.8], [60, 87.7], [59.7, 90], [61.7, 91.5], [65.1, 91.5], [67.1, 88.1])],
    'S7-A::S7-B': ['S7-A', P()],
    'S7-B::S8': ['S7-B', P([68.2, 80.8], [70.4, 79.2], [75.1, 80.8], [81.2, 83.1])],
  },
  keep: [],
  // Minutos en el punto antes de salir a la línea; null = punto de espera (Playa 3 es zona de espera).
  stayMin: { S0: 0, S1: 2, S2: 15, 'S2-LIQ': 15, S4: 3, S5: 30, S6: null, 'S9-V1': 20, 'S9-V2': 20, 'S7-A': 20, 'S7-B': 20, S8: 25, S3: 0, S10: 0 },
  // Al pasar Preingreso esperan en Playa 1; Playa 3 es su propia zona. El alta en SGC ocurre en Preingreso.
  // Después de Calada esperan en Playa Demorados (Z9); con mala calidad se quedan horas ahí.
  waitZone: { S1: 'Z2', S2: 'Z9', S6: 'Z6' },
  assumeNextAfterMin: { S0: 20 },
  nextDefault: { S0: 'S1', S1: 'S2', S2: 'S4', 'S2-LIQ': 'S4', S4: 'S6', S5: 'S6', S6: 'S9-V1', 'S9-V1': 'S4', 'S9-V2': 'S4', 'S7-A': 'S4', 'S7-B': 'S4', S8: 'S4' },
}

const S1_TO_K = [[35, 20.5], [44.4, 23.4], [55, 29.1], [61.8, 33.3], [64.8, 42.9], [65.5, 49.6]]
const S1_SOUTH = [[33.4, 20.7], [34.2, 24.5]]
const TO_S7 = [[41, 61], [44.4, 64.5], [47, 71], [45.5, 77]]

const SAN_LORENZO = {
  tramos: {
    // Ingreso → Playa OSL (espera) → Calada o Balanza de ingreso
    'S0::S2': ['S0', P([7, 28], [9.5, 29.5], [11.5, 24], [11, 18], [13, 13], [17, 11.5], [19.5, 12.5])],
    'S0::S1': ['S0', P([7, 28], [9.5, 29.5], [18, 27], [23, 24.5], [26.5, 20.5], [30.5, 19])],
    'S1::S2': ['S2', P([24, 15.3], [28, 17], [31, 19])],
    'S1::S4': ['S1', P(...S1_TO_K, [66, 57.2], [67.3, 64.8])],
    'S1::S10': ['S1', P(...S1_SOUTH, [35.5, 30.7], [38, 34.5])],
    'S1::S8': ['S1', P(...S1_SOUTH, [32.5, 27.6], [30, 35.3], [27.5, 41.4], [26.4, 49.6], [25.6, 54.2])],
    'S7::S8': ['S8', P([28, 56.9], [34.2, 60.3], [37.8, 59.5], ...TO_S7)],
    'S10::S7': ['S10', P([38.4, 41.4], [38.4, 49.6], [38, 57], [37.8, 59.5], ...TO_S7)],
    'S4::S5': ['S4', P([68.3, 71.8], [71.1, 84], [71.3, 87.4], [69.8, 89.5], [66.4, 88.2], [63, 87.1])],
    'S5::S7': ['S5', P([58.4, 85.7], [52.9, 82.6], [46, 79])],
    'S5::S6': ['S5', P([66, 92.4], [74.4, 97], [80.8, 99.5], [83.3, 99.3], [83.5, 93.2], [81.2, 87.5])],
    // Camino de la costa: sale del camino Balanza ingreso → Volcables y baja a Líquidos punto 2
    'S1::S6': ['S1', P(...S1_TO_K, [70.3, 49.8], [74.5, 51], [77, 55.4], [78.7, 63.1], [80.4, 73.8], [81.7, 81.1])],
  },
  keep: [],
  // S0: el camión espera en Playa OSL hasta la lectura de calada/balanza.
  stayMin: { S0: null, S2: 15, S1: 3, S4: 25, S5: 3, S6: 25, S7: 0, S8: 25, S10: 25 },
  waitZone: { S0: 'Z0' },
  assumeNextAfterMin: {},
  nextDefault: { S0: 'S1', S2: 'S1', S1: 'S4', S10: 'S7', S4: 'S5', S5: 'S7', S8: 'S7', S6: 'S5' },
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', '..')
for (const [site, spec] of [['ricardone', RICARDONE], ['san_lorenzo', SAN_LORENZO]]) {
  const file = path.join(root, 'public', 'plant', site, 'plantZones.json')
  const layout = JSON.parse(readFileSync(file, 'utf8'))
  const ids = new Set(layout.points.map(p => p.id))
  const kept = (layout.tramos ?? []).filter(t => spec.keep.includes(t.id))
  const tramos = Object.entries(spec.tramos).map(([id, [from, via]]) => {
    const [a, b] = id.split('::')
    if (!ids.has(a) || !ids.has(b)) throw new Error(`${site} ${id}: punto inexistente`)
    if (id !== [a, b].sort().join('::')) throw new Error(`${site} ${id}: id no ordenado`)
    return { id, fromPointId: from, toPointId: from === a ? b : a, viaPercent: via }
  })
  layout.tramos = [...kept, ...tramos]
  const validIds = new Set(layout.tramos.map(t => t.id))
  layout.circuitCompositions = (layout.circuitCompositions ?? []).filter(c => c.tramos.every(r => validIds.has(r.tramoId)))
  for (const p of layout.points) {
    if (spec.nextDefault[p.id]) p.nextDefault = spec.nextDefault[p.id]
    else delete p.nextDefault
    if (p.id in spec.stayMin) p.stayMin = spec.stayMin[p.id]
    else delete p.stayMin
    if (spec.waitZone[p.id]) p.waitZone = spec.waitZone[p.id]
    else delete p.waitZone
    if (spec.assumeNextAfterMin[p.id] != null) p.assumeNextAfterMin = spec.assumeNextAfterMin[p.id]
    else delete p.assumeNextAfterMin
  }
  layout.unplacedSteps = (layout.unplacedSteps ?? []).filter(s => !ids.has(s))
  writeFileSync(file, JSON.stringify(layout, null, 2) + '\n', 'utf8')
  console.log(`${site}: ${layout.tramos.length} tramos (${kept.length} previos conservados)`)
}
