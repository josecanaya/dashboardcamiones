/**
 * Ensamblador de pasos: la unidad del reconocedor es el PASO de un vehículo por un nodo, no cada fila del
 * microservicio. Un paso junta:
 *   - las capturas repetidas de la misma cámara (camión parado en la descarga: I91 ×5 en Silo Keppler,
 *     03/11 10:31–10:34, era un solo camión);
 *   - la frontal y la trasera del mismo nodo (la trasera lee el acoplado), en el orden de la fila y con el
 *     desfase medido de cada cámara trasera. El feed nunca trae traseras: llegan solo como alertas.
 * El evento y la alerta de una misma captura ya llegan unidos (alertReads.mjs: atributos y sin duplicar).
 *
 * Cada paso tiene un ancla (la mejor lectura: frontal, patente válida, del feed). Las demás capturas del paso
 * se reescriben al viaje y la patente del ancla: el reconocedor decide una vez por paso y lo que decide vale
 * para todas sus capturas. Medido 03/11 04:57–10:57: Ricardone 382 capturas → 306 pasos, San Lorenzo 692 → 523.
 */
import { isValidPlate, MIN_SIMILARITY, plateSimilarity, REAR_DEVICE } from './plateIdentification.mjs'
import { getEventLiveInstantMs } from './liveEventTime.mjs'
import { resolveCanonicalSectorForLiveFeed } from './sectorProfiles.mjs'
import { sectorToLogical } from './circuitPrefix.mjs'

/** Repetición de la misma cámara: la captura siguiente a ≤ 2 min de la anterior del paso. */
export const REPEAT_MS = 2 * 60_000
/** Parecido mínimo de una lectura sin formato con la patente del paso para tomarla como repetición. */
export const REPEAT_SIMILARITY = 0.5
/** Mismo disparo de la cámara. */
export const SAME_TRIGGER_MS = 5_000
/**
 * Segundos de la trasera después de la frontal del mismo camión, por cámara trasera: p5 / mediana / p95 de los
 * pares chasis–acoplado que confirma la carta de porte (02–03/11). No son 3 min: entre 10 s y 1 min.
 */
export const REAR_OFFSET_S = {
  RicIngCamTrasera: [8, 16, 21],
  RicPreIngInTr: [12, 20, 45],
  RicEgrCamTraser: [18, 28, 62],
  SLZIngCamTrasera: [25, 49, 113],
  SLZBalIngTras: [-5, 1, 29],
  SLZBalSC2Tras: [43, 63, 120],
  SLZSalidaC1Tras: [22, 32, 45],
}
const DEFAULT_OFFSET_S = [-10, 30, 120]
/** Margen sobre p5/p95 medidos. */
const OFFSET_SLACK_S = [15, 30]
const GENERIC = new Set(['', 'SINPATENTE', 'NOPLATE', 'XXXXXX', 'PPPPPP', 'TTTTTT'])

const plateOf = (e) => String(e?.normalizedPlate || e?.truckPlate || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const brandOf = (e) => (e?.attributes?.brand ? String(e.attributes.brand).replace(/\d+$/, '') : null)
/** Clave estable de una captura (para aplicar la reescritura a los eventos fuera del reconocedor). */
export const captureKey = (e) => `${e?.id ?? ''}|${e?.deviceCode ?? ''}|${e?.occurredAt ?? ''}`

function logicalOf(e) {
  return sectorToLogical(resolveCanonicalSectorForLiveFeed(e.sectorCode, String(e.deviceCode ?? '').trim()))
}

/** Marca del paso: la de cualquiera de sus capturas que la tenga. */
const pasoBrand = (p) => p.caps.map((c) => c.brand).find(Boolean) ?? null

/**
 * ¿La captura c es del mismo vehículo que el paso p (misma cámara, a pocos minutos)?
 * Misma patente útil → sí. Dos ilegibles con la misma marca del DSS → sí (I91 ×5). Una ilegible junto a un
 * camión bien leído NO se junta por la marca: en la cola de una balanza muchos son de la misma marca
 * (DN828 era MDN828 y se iba con EQE422, 03/11); la decide el reconocedor.
 */
function sameVehicle(p, c) {
  // La cámara dispara dos veces por el mismo vehículo, una con patente y otra sin lectura: la trasera se
  // emparejaba con la vacía (GLM592, VNA879). Solo la vacía: en la cola de la balanza la frontal también lee
  // al camión de atrás a segundos (DN828 era MDN828, no EQE422).
  if (c.t - p.lastT <= SAME_TRIGGER_MS && (GENERIC.has(c.plate) || p.caps.every((x) => GENERIC.has(x.plate)))) return true
  const b = pasoBrand(p)
  if (b && c.brand && b !== c.brand) return false
  if (p.caps.some((x) => x.plate === c.plate) && !GENERIC.has(c.plate)) return true
  // Lectura sin formato de patente que se parece a la patente bien leída del paso (la cámara volvió a captar al
  // mismo camión al moverse, a segundos o minutos): es una lectura errónea confirmada de ese mismo paso.
  // 03/11: 45 de las 302 sin formato a ≤ 2 min de una buena en la misma cámara.
  if (isValidPlate(p.anchor.plate) && !isValidPlate(c.plate) && !GENERIC.has(c.plate) && plateSimilarity(c.plate, p.anchor.plate) >= REPEAT_SIMILARITY) return true
  if (isValidPlate(p.anchor.plate) || isValidPlate(c.plate)) return false
  return Boolean(b && c.brand && b === c.brand)
}

/**
 * Mejor lectura del paso: válida > ilegible, frontal > trasera, feed > alerta, la primera. Con la frontal
 * ilegible ancla el acoplado leído atrás: la carta de porte da el chasis (acoplado_carta).
 */
function anchorRank(c) {
  return (isValidPlate(c.plate) ? 0 : 4) + (c.rear ? 2 : 0) + (c.fromAlert ? 1 : 0)
}

/**
 * Empareja traseras con frontales de un nodo respetando el orden de la fila (los camiones no se adelantan
 * entre las dos cámaras): alineación de las dos secuencias por programación dinámica. Un par vale si el
 * desfase cae en la ventana medida de esa cámara; cuanto más cerca de la mediana, mejor. Una frontal sin
 * trasera es normal (la trasera no leyó); una trasera sin frontal cuesta.
 * @returns {[number, number][]} pares [índice frontal, índice trasera]
 */
export function alignRears(fronts, rears, { contradicts = null } = {}) {
  const n = fronts.length
  const m = rears.length
  if (!n || !m) return []
  const SKIP_REAR = 1
  const pairCost = (f, r) => {
    if (contradicts?.(f, r)) return Infinity
    const [p5, med, p95] = REAR_OFFSET_S[r.device] ?? DEFAULT_OFFSET_S
    const lo = p5 - OFFSET_SLACK_S[0]
    const hi = p95 + OFFSET_SLACK_S[1]
    const dt = (r.firstT - f.firstT) / 1000
    if (dt < lo || dt > hi) return Infinity
    const half = Math.max(med - lo, hi - med, 1)
    return 0.5 * ((dt - med) / half) ** 2
  }
  const W = m + 1
  const cost = new Float64Array((n + 1) * W).fill(Infinity)
  const move = new Uint8Array((n + 1) * W)
  cost[0] = 0
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const here = cost[i * W + j]
      if (here === Infinity) continue
      if (i < n && here < cost[(i + 1) * W + j]) { cost[(i + 1) * W + j] = here; move[(i + 1) * W + j] = 1 }
      if (j < m && here + SKIP_REAR < cost[i * W + j + 1]) { cost[i * W + j + 1] = here + SKIP_REAR; move[i * W + j + 1] = 2 }
      if (i < n && j < m) {
        const c = here + pairCost(fronts[i], rears[j])
        if (c < cost[(i + 1) * W + j + 1]) { cost[(i + 1) * W + j + 1] = c; move[(i + 1) * W + j + 1] = 3 }
      }
    }
  }
  const pairs = []
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const mv = move[i * W + j]
    if (mv === 3) { pairs.push([i - 1, j - 1]); i--; j-- } else if (mv === 2) j--
    else i--
  }
  return pairs.reverse()
}

/**
 * @param {object[]} events eventos del feed y lecturas de alerta (con atributos), de una planta
 * @returns {{ events: object[], pasos: object[], rewrites: Map<string, { journeyUid: string|null, plate: string, pasoId: string }> }}
 */
export function ensamblarPasos(events, { acopladoChasis = null } = {}) {
  const caps = []
  for (const e of events || []) {
    if (e?.inferred || e?.manualCorrection) continue
    const t = getEventLiveInstantMs(e)
    const device = String(e?.deviceCode ?? '').trim()
    const logical = Number.isFinite(t) && device ? logicalOf(e) : null
    if (!logical) continue
    caps.push({ e, t, device, logical, plate: plateOf(e), brand: brandOf(e), rear: REAR_DEVICE.test(device), fromAlert: Boolean(e.fromAlert) })
  }
  caps.sort((a, b) => a.t - b.t)

  // 1. Repeticiones de la misma cámara.
  const open = new Map()
  const pasos = []
  for (const c of caps) {
    const p = open.get(c.device)
    if (p && c.t - p.lastT <= REPEAT_MS && sameVehicle(p, c)) {
      p.caps.push(c)
      p.lastT = c.t
      if (anchorRank(c) < anchorRank(p.anchor)) p.anchor = c
      continue
    }
    const np = { caps: [c], anchor: c, firstT: c.t, lastT: c.t, logical: c.logical, rear: c.rear, pairedRear: null }
    open.set(c.device, np)
    pasos.push(np)
  }

  // 2. Trasera con la frontal del mismo nodo, en el orden de la fila (la trasera lee el acoplado).
  const merged = new Set()
  const byNode = new Map()
  for (const p of pasos) {
    if (!byNode.has(p.logical)) byNode.set(p.logical, { fronts: [], rears: [] })
    byNode.get(p.logical)[p.rear ? 'rears' : 'fronts'].push(p)
  }
  // La carta de porte dice con qué chasis va ese acoplado: si la frontal leyó otro camión (y no una lectura
  // parecida), ese par no es. Validado 02–03/11 contra la carta: sin esta guarda 12 de 100 pares mal en Ricardone.
  const contradicts = acopladoChasis
    ? (f, r) => {
        const fp = f.anchor.plate
        const rp = r.anchor.plate
        if (!isValidPlate(fp) || !isValidPlate(rp)) return false
        const chasis = acopladoChasis(rp, r.firstT)
        return Boolean(chasis && chasis !== fp && plateSimilarity(fp, chasis) < MIN_SIMILARITY)
      }
    : null
  for (const { fronts, rears } of byNode.values()) {
    for (const [i, j] of alignRears(fronts.map((f) => ({ firstT: f.firstT, anchor: f.anchor })), rears.map((r) => ({ firstT: r.firstT, device: r.anchor.device, anchor: r.anchor })), { contradicts })) {
      const f = fronts[i]
      const r = rears[j]
      f.pairedRear = r
      f.caps.push(...r.caps)
      f.lastT = Math.max(f.lastT, r.lastT)
      // El acoplado ancla solo si la carta dice que es un acoplado: la trasera de la balanza SL también lee la
      // patente delantera del camión que sigue en la cola (DN828/EQE422, 03/11).
      if (anchorRank(r.anchor) < anchorRank(f.anchor) && acopladoChasis?.(r.anchor.plate, r.firstT)) f.anchor = r.anchor
      merged.add(r)
    }
  }

  const out = pasos.filter((p) => !merged.has(p))
  const rewrites = new Map()
  const summary = out.map((p, i) => {
    const a = p.anchor
    const pasoId = `paso-${a.device}-${a.t}`
    const journeyUid = String(a.e.journeyUid ?? '').trim() || null
    for (const c of p.caps) {
      if (c === a) continue
      const same = String(c.e.journeyUid ?? '').trim() === journeyUid && c.plate === a.plate
      if (!same) rewrites.set(captureKey(c.e), { journeyUid, plate: a.plate, pasoId })
    }
    const rearCaps = p.caps.filter((c) => c.rear)
    return {
      id: pasoId,
      anchorKey: captureKey(a.e),
      node: p.logical,
      at: new Date(p.firstT).toISOString(),
      until: new Date(p.lastT).toISOString(),
      plate: a.plate,
      journeyUid,
      devices: [...new Set(p.caps.map((c) => c.device))],
      captures: p.caps.length,
      fromAlerts: p.caps.filter((c) => c.fromAlert).length,
      acoplado: rearCaps.map((c) => c.plate).find((x) => isValidPlate(x) && x !== a.plate) ?? null,
      reads: [...new Set(p.caps.map((c) => c.plate).filter(Boolean))],
      brand: pasoBrand(p),
      order: i,
    }
  })
  return { events: applyPasoRewrites(events, rewrites), pasos: summary, rewrites }
}

/** Pasa cada captura reescrita al viaje y la patente del ancla de su paso (guarda lo que leyó la cámara). */
export function applyPasoRewrites(events, rewrites) {
  if (!rewrites?.size) return events
  return events.map((e) => {
    const r = e.pasoId ? null : rewrites.get(captureKey(e))
    if (!r) return e
    return { ...e, journeyUid: r.journeyUid ?? e.journeyUid, normalizedPlate: r.plate, truckPlate: r.plate, pasoId: r.pasoId, pasoReadPlate: plateOf(e) }
  })
}
