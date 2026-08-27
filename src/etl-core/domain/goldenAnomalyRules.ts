/**
 * Reglas de anomalías de comportamiento (independientes de cobertura LPR).
 *
 * REEMPLAZO TOTAL (2026-08-05, pedido del usuario): una anomalía de
 * comportamiento se define EXCLUSIVAMENTE por estas reglas. Ya no cuentan
 * ruta/arranque inválido, retroceso de secuencia, ni las viejas reglas de oro
 * (calada→preingreso, salto de hito, sin movimiento Excel). Ver
 * [[anomalias-comportamiento-vs-datos]]. R6 agregada 2026-08-27.
 *
 *  R1  Salida de Ricardone y reingreso a Ricardone en < 1 h.            (no pellet)
 *  R2  Mismo día: San Lorenzo primero y luego Ricardone en ≤ 6 h.       (no pellet)
 *  R3  Egreso Ricardone → ingreso San Lorenzo entre 40 min y 6 h.
 *  R4  Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza.
 *  R5  Pasa por punto de carga y luego por una plataforma de descarga.
 *  R6  Egreso Ricardone → ingreso San Lorenzo en > 30 min (≤ 2 h) y luego
 *      NO pasa por Calado San Lorenzo (`SL_CALADA`) en esa visita.       (pedido 2026-08-27)
 *
 * R1/R2/R3/R6 cruzan journeys de la misma patente (usan `platePoints`).
 * R4/R5 son de secuencia dentro del journey (usan `points`).
 *
 * R6 es más específica que R3 (agrega la condición «sin calado») y, cuando
 * ambas aplican, tiene prioridad: se evalúa antes que R3 para que ese sea el
 * motivo reportado.
 */

import type { AnomalyReason } from './anomalyClassifier'

export const GOLDEN_ANOMALY_REASONS = [
  'RIC_REINGRESO_RAPIDO_NO_PELLET',
  'SL_LUEGO_RIC_MISMO_DIA_NO_PELLET',
  'RIC_SL_TRAMO_40M_6H',
  'RUTA_BALANZA_PLAYA_C16_BALANZA',
  'CARGA_LUEGO_DESCARGA',
  'RIC_SL_MAS30M_SIN_CALADA_SL',
] as const

export type GoldenAnomalyReason = (typeof GOLDEN_ANOMALY_REASONS)[number]

export function isGoldenAnomalyReason(reason: string | null | undefined): reason is GoldenAnomalyReason {
  return GOLDEN_ANOMALY_REASONS.includes(String(reason ?? '').trim() as GoldenAnomalyReason)
}

/**
 * Reglas con condición «NO PELLET». El circuito pellet (tolvas 09–11) no tiene
 * cámara: solo se conoce tras cruzar patente+día con el Excel, así que la
 * exclusión se aplica también en el listado (`isHardExcludedFromAnomalyList`),
 * no solo acá.
 */
export const NO_PELLET_ANOMALY_REASONS = new Set<GoldenAnomalyReason>([
  'RIC_REINGRESO_RAPIDO_NO_PELLET',
  'SL_LUEGO_RIC_MISMO_DIA_NO_PELLET',
])

/** Circuitos pellet / tolvas 09–11: SL↔Ric rápido es legítimo. */
export const PELLET_TRANSILE_CIRCUIT_CODES = new Set(['R30', 'R31', 'R32'])

/** Ventana histórica SL → Ric ≤ 30 min (usada por el panel de sospechosos, no es regla). */
export const GOLDEN_SL_RIC_MAX_MS = 30 * 60 * 1000
/** R1: salida Ric → reingreso Ric ≤ 1 h. */
export const RIC_REINGRESO_MAX_MS = 60 * 60 * 1000
/**
 * R2: tope SL → Ric el mismo día ≤ 6 h. Si el camión descarga en San Lorenzo y
 * recién reaparece en Ricardone después de 6 h, son dos viajes distintos, no una
 * anomalía.
 */
export const SL_RIC_SAME_DAY_MAX_MS = 6 * 60 * 60 * 1000
/** R3: egreso Ric → ingreso SL, banda [40 min, 6 h]. */
export const RIC_SL_MIN_MS = 40 * 60 * 1000
export const RIC_SL_MAX_MS = 6 * 60 * 60 * 1000
/**
 * R6: egreso Ric → ingreso SL en banda (30 min, 2 h] y sin pasar por calado SL.
 * Cota inferior estricta (> 30 min). Cota superior 2 h: más allá son dos viajes
 * distintos y no se puede afirmar que el tramo pertenezca al mismo recorrido.
 */
export const RIC_SL_NO_CALADA_MIN_MS = 30 * 60 * 1000
export const RIC_SL_NO_CALADA_MAX_MS = 2 * 60 * 60 * 1000

const RIC_ENTRY_LOGICAL = new Set(['INGRESO', 'PREINGRESO'])
const RIC_EXIT_LOGICAL = new Set(['EGRESO'])
const SL_ENTRY_LOGICAL = new Set(['SL_INGRESO'])
/** R6: Calado San Lorenzo (S2; devices SLZCalCam / SLZCalado → SL_CALADA vía catálogo). */
const SL_CALADA_LOGICAL = new Set(['SL_CALADA'])
/** R6: cierre de la visita a San Lorenzo (egreso o balanza de salida del puerto). */
const SL_EXIT_LOGICAL = new Set(['SL_EGRESO', 'SL_BALANZA_SALIDA'])
/** R5: puntos de carga (silo → camión). */
const LOAD_LOGICAL = new Set(['CELDA16_CARGA', 'CARGA_S7', 'CARGA_S8'])
/** R5: plataformas de descarga (camión → silo/plataforma). Incluye San Lorenzo. */
const DISCHARGE_LOGICAL = new Set(['VOLCABLE', 'CELDA16_DESCARGA', 'DESCARGA_S7', 'SL_DESCARGA'])
/** R4: paso por Celda 16 (carga o descarga). */
const CELDA16_LOGICAL = new Set(['CELDA16_CARGA', 'CELDA16_DESCARGA'])
const BALANZA_CLOSE_LOGICAL = new Set(['BALANZA_EGRESO', 'BALANZA'])

export type GoldenTimelinePoint = {
  t: number
  logicalCode: string
  siteId?: string
  journeyUid?: string
  /** Día operativo `YYYY-MM-DD` (para R2, mismo día). */
  day?: string
}

export type GoldenAnomalyHit = {
  reason: GoldenAnomalyReason
  kind: 'BEHAVIORAL'
  detail: string
  deltaMinutes?: number
  fromLogical?: string
  toLogical?: string
  circuitCode?: string
}

export type EvaluateGoldenAnomalyInput = {
  /** Timeline del journey (eventos frontales normalizados). */
  points: readonly GoldenTimelinePoint[]
  /**
   * Timeline de la misma patente (puede cruzar journeys). Si falta, se usa `points`.
   * Necesario para R1/R2/R3 interplanta.
   */
  platePoints?: readonly GoldenTimelinePoint[]
  circuitCode?: string
  /** True si Excel/circuito indica pellet / R30–R32. */
  isPelletTransile?: boolean
  /** True si Excel «De la vuelta» = SI (transile de vuelta legítimo). */
  isDeVuelta?: boolean
}

function roundMin(ms: number): number {
  return Math.round((ms / 60000) * 10) / 10
}

function collapseConsecutive(points: readonly GoldenTimelinePoint[]): GoldenTimelinePoint[] {
  const out: GoldenTimelinePoint[] = []
  for (const p of points) {
    const code = String(p.logicalCode ?? '').trim()
    if (!code || code.includes('TRASERA_EXCLUIDA')) continue
    const last = out[out.length - 1]
    if (last && last.logicalCode === code) continue
    out.push({ ...p, logicalCode: code })
  }
  return out
}

function sortedPoints(points: readonly GoldenTimelinePoint[]): GoldenTimelinePoint[] {
  return [...points]
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t)
}

/** R1: salida de Ricardone (EGRESO) seguida de reingreso a Ricardone (INGRESO/PREINGRESO) ≤ 1 h, no pellet. */
export function detectRicQuickReEntry(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { maxMs?: number; isPelletTransile?: boolean; isDeVuelta?: boolean }
): GoldenAnomalyHit | null {
  if (opts?.isPelletTransile || opts?.isDeVuelta) return null
  const maxMs = opts?.maxMs ?? RIC_REINGRESO_MAX_MS
  const list = sortedPoints(platePoints)
  for (let i = 0; i < list.length; i++) {
    const eg = list[i]!
    if (!RIC_EXIT_LOGICAL.has(eg.logicalCode)) continue
    if (eg.siteId && eg.siteId !== 'ricardone') continue
    for (let j = i + 1; j < list.length; j++) {
      const next = list[j]!
      const delta = next.t - eg.t
      if (delta > maxMs) break
      if (delta <= 0) continue
      if (next.siteId && next.siteId !== 'ricardone') continue
      if (!RIC_ENTRY_LOGICAL.has(next.logicalCode)) continue
      return {
        reason: 'RIC_REINGRESO_RAPIDO_NO_PELLET',
        kind: 'BEHAVIORAL',
        detail: `Salida Ricardone → reingreso en ${roundMin(delta)} min (≤${roundMin(maxMs)}) sin pellet`,
        deltaMinutes: roundMin(delta),
        fromLogical: eg.logicalCode,
        toLogical: next.logicalCode,
      }
    }
  }
  return null
}

/** R2: mismo día, San Lorenzo (SL_INGRESO) primero y luego Ricardone (INGRESO/PREINGRESO), no pellet. */
export function detectSlThenRicSameDay(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { isPelletTransile?: boolean; isDeVuelta?: boolean }
): GoldenAnomalyHit | null {
  if (opts?.isPelletTransile || opts?.isDeVuelta) return null
  const list = sortedPoints(platePoints)
  // Última entrada a SL por día: el tope de 6 h se mide contra la descarga en SL
  // más reciente previa a Ricardone, no contra la primera del día.
  const lastSlByDay = new Map<string, number>()
  for (const p of list) {
    const day = String(p.day ?? '').trim()
    if (!day) continue
    const slSite = !p.siteId || p.siteId === 'san_lorenzo'
    if (slSite && SL_ENTRY_LOGICAL.has(p.logicalCode)) {
      lastSlByDay.set(day, p.t)
      continue
    }
    const ricSite = !p.siteId || p.siteId === 'ricardone'
    if (ricSite && RIC_ENTRY_LOGICAL.has(p.logicalCode)) {
      const slT = lastSlByDay.get(day)
      // Tope 6 h: más allá son dos viajes distintos, no una anomalía.
      if (slT != null && p.t > slT && p.t - slT <= SL_RIC_SAME_DAY_MAX_MS) {
        return {
          reason: 'SL_LUEGO_RIC_MISMO_DIA_NO_PELLET',
          kind: 'BEHAVIORAL',
          detail: `San Lorenzo y luego Ricardone el mismo día (${day}) sin pellet`,
          deltaMinutes: roundMin(p.t - slT),
          fromLogical: 'SL_INGRESO',
          toLogical: p.logicalCode,
        }
      }
    }
  }
  return null
}

/** R3: egreso Ricardone (EGRESO) → ingreso San Lorenzo (SL_INGRESO) con Δt en [40 min, 6 h]. */
export function detectRicToSlBridgeWindow(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { minMs?: number; maxMs?: number }
): GoldenAnomalyHit | null {
  const minMs = opts?.minMs ?? RIC_SL_MIN_MS
  const maxMs = opts?.maxMs ?? RIC_SL_MAX_MS
  const list = sortedPoints(platePoints)
  for (let i = 0; i < list.length; i++) {
    const eg = list[i]!
    if (!RIC_EXIT_LOGICAL.has(eg.logicalCode)) continue
    if (eg.siteId && eg.siteId !== 'ricardone') continue
    for (let j = i + 1; j < list.length; j++) {
      const sl = list[j]!
      if (!SL_ENTRY_LOGICAL.has(sl.logicalCode)) continue
      if (sl.siteId && sl.siteId !== 'san_lorenzo') continue
      const delta = sl.t - eg.t
      if (delta <= 0) continue
      if (delta > maxMs) break
      if (delta < minMs) continue
      return {
        reason: 'RIC_SL_TRAMO_40M_6H',
        kind: 'BEHAVIORAL',
        detail: `Egreso Ricardone → ingreso San Lorenzo en ${roundMin(delta)} min (40 min–6 h)`,
        deltaMinutes: roundMin(delta),
        fromLogical: 'EGRESO',
        toLogical: 'SL_INGRESO',
      }
    }
  }
  return null
}

/**
 * ¿La visita a San Lorenzo que arranca en `ingresoIdx` (un `SL_INGRESO`) registra
 * un paso por calado (`SL_CALADA`)? La visita se cierra en el próximo egreso de
 * San Lorenzo (`SL_EGRESO` / `SL_BALANZA_SALIDA`) o si el camión vuelve a
 * Ricardone (nuevo ingreso/preingreso). Un `SL_CALADA` antes de ese cierre = pasó.
 */
function slVisitHasCalada(list: readonly GoldenTimelinePoint[], ingresoIdx: number): boolean {
  for (let k = ingresoIdx + 1; k < list.length; k++) {
    const p = list[k]!
    const inSl = !p.siteId || p.siteId === 'san_lorenzo'
    if (inSl && SL_CALADA_LOGICAL.has(p.logicalCode)) return true
    if (inSl && SL_EXIT_LOGICAL.has(p.logicalCode)) return false
    if (p.siteId === 'ricardone' && RIC_ENTRY_LOGICAL.has(p.logicalCode)) return false
  }
  return false
}

/**
 * R6: egreso Ricardone (EGRESO) → ingreso San Lorenzo (SL_INGRESO) con Δt en
 * (30 min, 2 h] y SIN paso por calado San Lorenzo en esa visita. Es el caso del
 * camión que cruza a puerto tomándose su tiempo y descarga sin muestreo de calado.
 */
export function detectRicToSlWithoutSlCalada(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { minMs?: number; maxMs?: number }
): GoldenAnomalyHit | null {
  const minMs = opts?.minMs ?? RIC_SL_NO_CALADA_MIN_MS
  const maxMs = opts?.maxMs ?? RIC_SL_NO_CALADA_MAX_MS
  const list = sortedPoints(platePoints)
  for (let i = 0; i < list.length; i++) {
    const eg = list[i]!
    if (!RIC_EXIT_LOGICAL.has(eg.logicalCode)) continue
    if (eg.siteId && eg.siteId !== 'ricardone') continue
    for (let j = i + 1; j < list.length; j++) {
      const sl = list[j]!
      if (!SL_ENTRY_LOGICAL.has(sl.logicalCode)) continue
      if (sl.siteId && sl.siteId !== 'san_lorenzo') continue
      const delta = sl.t - eg.t
      if (delta <= 0) continue
      if (delta > maxMs) break
      if (delta <= minMs) continue
      // Primer ingreso a SL dentro de la banda: si pasó por calado, ese viaje es
      // legítimo; cortamos y seguimos con el próximo egreso Ricardone.
      if (slVisitHasCalada(list, j)) break
      return {
        reason: 'RIC_SL_MAS30M_SIN_CALADA_SL',
        kind: 'BEHAVIORAL',
        detail: `Egreso Ricardone → ingreso San Lorenzo en ${roundMin(delta)} min (>30 min) sin pasar por Calado San Lorenzo`,
        deltaMinutes: roundMin(delta),
        fromLogical: 'EGRESO',
        toLogical: 'SL_INGRESO',
      }
    }
  }
  return null
}

/** R4: recorrido Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza. */
export function detectBalanzaPlayaCelda16Route(
  points: readonly GoldenTimelinePoint[]
): GoldenAnomalyHit | null {
  const seq = collapseConsecutive(sortedPoints(points)).map((p) => p.logicalCode)
  const idxBalIng = seq.indexOf('BALANZA_INGRESO')
  if (idxBalIng < 0) return null
  const idxPlaya = seq.indexOf('PLAYA', idxBalIng + 1)
  if (idxPlaya < 0) return null
  let idxC16 = -1
  for (let k = idxPlaya + 1; k < seq.length; k++) {
    if (CELDA16_LOGICAL.has(seq[k]!)) {
      idxC16 = k
      break
    }
  }
  if (idxC16 < 0) return null
  let idxClose = -1
  for (let k = idxC16 + 1; k < seq.length; k++) {
    if (BALANZA_CLOSE_LOGICAL.has(seq[k]!)) {
      idxClose = k
      break
    }
  }
  if (idxClose < 0) return null
  return {
    reason: 'RUTA_BALANZA_PLAYA_C16_BALANZA',
    kind: 'BEHAVIORAL',
    detail: 'Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza',
    fromLogical: 'BALANZA_INGRESO',
    toLogical: seq[idxClose]!,
  }
}

/** R5: pasa por un punto de carga y luego por una plataforma de descarga. */
export function detectLoadThenDischarge(
  points: readonly GoldenTimelinePoint[]
): GoldenAnomalyHit | null {
  const seq = collapseConsecutive(sortedPoints(points)).map((p) => p.logicalCode)
  let idxLoad = -1
  for (let k = 0; k < seq.length; k++) {
    if (LOAD_LOGICAL.has(seq[k]!)) {
      idxLoad = k
      break
    }
  }
  if (idxLoad < 0) return null
  for (let k = idxLoad + 1; k < seq.length; k++) {
    if (DISCHARGE_LOGICAL.has(seq[k]!)) {
      return {
        reason: 'CARGA_LUEGO_DESCARGA',
        kind: 'BEHAVIORAL',
        detail: `Carga (${seq[idxLoad]}) y luego descarga (${seq[k]})`,
        fromLogical: seq[idxLoad]!,
        toLogical: seq[k]!,
      }
    }
  }
  return null
}

export function isPelletCircuitCode(circuitCode: string | null | undefined): boolean {
  return PELLET_TRANSILE_CIRCUIT_CODES.has(String(circuitCode ?? '').trim().toUpperCase())
}

/**
 * Evalúa R1–R6 en orden. Prioridad: R1 → R2 → R6 → R3 → R4 → R5 (la primera hit
 * gana para `anomaly_kind_reason`). R1/R2/R3/R6 sobre la timeline de la patente;
 * R4/R5 sobre la del journey. R6 va antes que R3 porque es más específica (agrega
 * «sin calado»). Devuelve todas las hits; el cableado usa la primera.
 */
export function evaluateGoldenAnomalyRules(input: EvaluateGoldenAnomalyInput): GoldenAnomalyHit[] {
  const platePts = input.platePoints?.length ? input.platePoints : input.points
  const isPellet = input.isPelletTransile === true || isPelletCircuitCode(input.circuitCode)
  const isDeVuelta = input.isDeVuelta === true
  const hits: GoldenAnomalyHit[] = []

  const r1 = detectRicQuickReEntry(platePts, { isPelletTransile: isPellet, isDeVuelta })
  if (r1) hits.push({ ...r1, circuitCode: input.circuitCode })

  const r2 = detectSlThenRicSameDay(platePts, { isPelletTransile: isPellet, isDeVuelta })
  if (r2) hits.push({ ...r2, circuitCode: input.circuitCode })

  const r6 = detectRicToSlWithoutSlCalada(platePts)
  if (r6) hits.push({ ...r6, circuitCode: input.circuitCode })

  const r3 = detectRicToSlBridgeWindow(platePts)
  if (r3) hits.push({ ...r3, circuitCode: input.circuitCode })

  const r4 = detectBalanzaPlayaCelda16Route(input.points)
  if (r4) hits.push({ ...r4, circuitCode: input.circuitCode })

  const r5 = detectLoadThenDischarge(input.points)
  if (r5) hits.push({ ...r5, circuitCode: input.circuitCode })

  return hits
}

/** Convierte hit de oro a AnomalyReason del clasificador. */
export function goldenHitToAnomalyReason(hit: GoldenAnomalyHit): AnomalyReason {
  return hit.reason
}
