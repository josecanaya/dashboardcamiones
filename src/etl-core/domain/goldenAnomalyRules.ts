/**
 * Reglas de anomalías de comportamiento (independientes de cobertura LPR).
 *
 * REEMPLAZO TOTAL (2026-08-05, pedido del usuario): una anomalía de
 * comportamiento se define EXCLUSIVAMENTE por estas reglas. Ya no cuentan
 * ruta/arranque inválido, retroceso de secuencia, ni las viejas reglas de oro
 * (calada→preingreso, salto de hito, sin movimiento Excel). Ver
 * [[anomalias-comportamiento-vs-datos]].
 *
 * CURACIÓN DEL SET (2026-09-04, pedido del usuario):
 *  - Se retira R3 (Ric→SL 40 min–6 h): queda ABSORBIDA por R6 (cruce a puerto sin
 *    pasar por el calado). Se elimina el solapamiento.
 *  - R2 se REDEFINE: ya no es «mismo día ≤ 6 h». Ahora es «vuelven a Ricardone
 *    desde San Lorenzo en < 2 h» (no pellet), robusto a fallo de cámara: cualquier
 *    evento en Ricardone (ingreso, preingreso, calada, lo que sea) cuenta como
 *    retorno, y la ventana se mide del ÚLTIMO registro en San Lorenzo al PRIMER
 *    registro en Ricardone. R2 se evalúa antes que R1 para que el retorno desde
 *    San Lorenzo quede etiquetado como R2 (R1 = reingreso a Ric sin pasar por SL).
 *    El hit de R2 se adjudica SOLO al journey de retorno (el que contiene el regreso
 *    a Ricardone), no a todos los journeys de la patente. R2 se subdivide en 3
 *    subgrupos (prioridad a → b → c), TODOS no pellet:
 *      · R2-a `..._ERROR_DESTINO_..`   — San Lorenzo fue su primer destino (NO hubo Ric antes).
 *      · R2-b `..._CICLO_COMPLETO_..`  — el retorno completó un circuito (VÁLIDO/COMPLETO); shuttle.
 *      · R2-c `..._SIN_CIRCUITO_..`    — el resto: volvieron del puerto sin completar circuito.
 * El set vigente es R1, R2, R4, R5, R6 (los códigos se conservan para no divergir
 * de docs/memoria).
 *
 *  R1  Salida de Ricardone y reingreso a Ricardone en < 1 h.            (no pellet)
 *  R2  Vuelven a Ricardone desde San Lorenzo en < 2 h (3 subgrupos).    (no pellet)
 *  R4  Balanza ingreso → Playa 3 → Celda 16 → (Playa 3) → Balanza.
 *  R5  Pasa por punto de carga y luego por una plataforma de descarga.
 *  R6  Egreso Ricardone → ingreso San Lorenzo en > 30 min (≤ 2 h) y luego
 *      NO pasa por Calado San Lorenzo (`SL_CALADA`) en esa visita.       (pedido 2026-08-27)
 *
 * AMPLIACIÓN (2026-09-09, pedido del usuario): el set anterior o marcaba
 * comportamiento normal (R2) o apuntaba a cámaras sin registro (R4/R5), así que no
 * quedaba nada presentable. Se agregan dos reglas elegidas por su **tipo de
 * evidencia**, no por su volumen — el criterio para que una regla distinga «falló la
 * cámara» de «el camionero hizo algo que no debía»:
 *
 *  R9   Visita relámpago al puerto: entra y sale de San Lorenzo en < 30 min sin
 *       ningún registro de operación. Dos detecciones positivas + umbral medido
 *       (p05 real de permanencia = 40 min).                        ~1-3 / semana
 *  R11  Descargó en una calle de volcable distinta a la declarada en el Excel.
 *       Contradicción entre dos fuentes independientes.            ~2-12 / semana
 *  R12  Descargó en volcable de Ricardone sin registro de calado en cámara Y sin hora
 *       de calado en el Excel del movimiento. Doble ausencia probada.  ~0-2 / semana
 *
 * DESCARTADA (2026-09-10): «pesaje sin control de acceso» (≥2 pesadas en Ricardone y cero
 * cruces de portería, con testigo). Parecía sólida por el contraste 94 % / 33 % entre la
 * balanza 3 y las balanzas 1-2, pero al revisar el núcleo duro se cayó por dos motivos que
 * el usuario aportó y los datos confirmaron: (a) la balanza 3 es de autos, camionetas y
 * vehículos de servicio, que legítimamente no cruzan la portería de camiones — explica 65
 * de las 150 patentes; (b) los casos restantes son camiones CON contrato en el Excel que
 * pasaron por calada, balanza, playa y volcable — todo el circuito registrado salvo la
 * portería. Un camión que evade el control de acceso no tendría contrato ni pasaría por
 * calada: es la cámara de portería perdiendo lecturas, el mismo patrón de OCR que en el
 * calado. Lección: una ausencia con testigo NO alcanza si el resto del circuito prueba que
 * el camión estaba operando de forma normal.
 *
 * Una cámara caída produce SILENCIO, nunca una detección positiva ni una
 * contradicción: por eso estas dos no se disparan por falta de cobertura.
 *
 * DESCARTADA: «cruce interplanta imposible» (misma patente en las dos plantas separada
 * por menos del viaje físico). Con el piso en 5 min da CERO en tres semanas sobre 11.962
 * cruces: el más rápido registrado son 4,3 min y es de una patente que no entra al
 * universo clasificado. Una regla que no dispara nunca no se sostiene.
 *
 * R1/R2/R6/R9 cruzan journeys de la misma patente (usan `platePoints`).
 * R4/R5/R11 son de secuencia dentro del journey (usan `points`).
 */

import type { AnomalyReason } from './anomalyClassifier'

/** Sub-motivos de R2 (los 3 subgrupos). Prioridad de asignación: a → b → c. */
export const R2_RETURN_SUBGROUP_REASONS = [
  'SL_RIC_2H_ERROR_DESTINO_NO_PELLET', // R2-a
  'SL_RIC_2H_CICLO_COMPLETO_NO_PELLET', // R2-b
  'SL_RIC_2H_SIN_CIRCUITO_NO_PELLET', // R2-c
] as const

export const GOLDEN_ANOMALY_REASONS = [
  'RIC_REINGRESO_RAPIDO_NO_PELLET',
  ...R2_RETURN_SUBGROUP_REASONS,
  'RUTA_BALANZA_PLAYA_C16_BALANZA',
  'CARGA_LUEGO_DESCARGA',
  'RIC_SL_MAS30M_SIN_CALADA_SL',
  'SL_VISITA_RELAMPAGO_SIN_OPERAR',
  'PLATAFORMA_DISTINTA_A_DECLARADA',
  'PLATAFORMA_MULTIPLE_CALLES',
  'VOLCABLE_SIN_CALADA_RIC',
  'OBSERVACION_MANUAL',
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
  ...R2_RETURN_SUBGROUP_REASONS,
])

/** Circuitos pellet / tolvas 09–11: SL↔Ric rápido es legítimo. */
export const PELLET_TRANSILE_CIRCUIT_CODES = new Set(['R30', 'R31', 'R32'])

/** Ventana histórica SL → Ric ≤ 30 min (usada por el panel de sospechosos, no es regla). */
export const GOLDEN_SL_RIC_MAX_MS = 30 * 60 * 1000
/** R1: salida Ric → reingreso Ric ≤ 1 h. */
export const RIC_REINGRESO_MAX_MS = 60 * 60 * 1000
/**
 * R2: retorno desde San Lorenzo a Ricardone en < 2 h. Se mide del último registro
 * en San Lorenzo al primer registro en Ricardone posterior. Cota estricta (< 2 h):
 * más allá se asume que son viajes distintos.
 */
export const SL_RIC_RETURN_MAX_MS = 2 * 60 * 60 * 1000
/**
 * R6: egreso Ric → ingreso SL en banda (30 min, 2 h] y sin pasar por calado SL.
 * Cota inferior estricta (> 30 min). Cota superior 2 h: más allá son dos viajes
 * distintos y no se puede afirmar que el tramo pertenezca al mismo recorrido.
 */
export const RIC_SL_NO_CALADA_MIN_MS = 30 * 60 * 1000
export const RIC_SL_NO_CALADA_MAX_MS = 2 * 60 * 60 * 1000
/**
 * R9: permanencia mínima creíble en el puerto. Medido sobre 16 días de eventos
 * (2026-08-24..09-08): el p05 de SL_INGRESO→SL_EGRESO es 40 min y la mediana 162 min.
 * Por debajo de 30 min no hay tiempo material para balanza + descarga.
 */
export const SL_FLASH_VISIT_MAX_MS = 30 * 60 * 1000
/**
 * R11: ventana para atribuir un evento de volcable a un movimiento del Excel.
 * Se compara contra [external_ingreso_at, external_salida_at] con este margen.
 */
export const DECLARED_PLATFORM_MATCH_WINDOW_MS = 2 * 60 * 60 * 1000
/**
 * R12: margen para atribuir un calado del Excel a un journey de cámara. Se compara el
 * `external_calado_at` contra la ventana [primer evento del journey − 4 h, VOLCABLE + 30 min].
 * 4 h contempla el desfase real observado ingreso-Excel vs ingreso-cámara.
 */
export const DECLARED_CALADA_MATCH_WINDOW_MS = 4 * 60 * 60 * 1000

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
/** R9: cualquier registro que pruebe que el camión operó en el puerto. */
const SL_OPERATION_LOGICAL = new Set([
  'SL_BALANZA_INGRESO',
  'SL_BALANZA_SALIDA',
  'SL_VOLCABLE',
  'SL_DESCARGA',
  'SL_LIQUIDO_CARGA',
  'SL_LIQUIDO_DESCARGA',
  'SL_CALADA',
])
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
  /** Device crudo de la cámara. R11 lo necesita: la calle del volcable vive en el device. */
  deviceCode?: string
}

/**
 * R11: movimiento del Excel con plataforma declarada, acotado en el tiempo. Se pasa
 * la lista de movimientos de la patente en la ventana; la regla elige el que cubre
 * el evento de cámara observado.
 */
/**
 * R12: movimiento del Excel de esta patente que sí tiene hora de calado registrada.
 * El operario de balanza anota la hora cuando el camión se cala físicamente, así que si el
 * Excel trae `external_calado_at` en una ventana coherente, el calado se hizo aunque la
 * cámara `RicCal*` no lo haya captado (fallas de OCR: patente confundida, «SCANIA», luces
 * altas, etc., verificadas manualmente el 2026-09-10). Sin ese cruce, la regla dispararía
 * ~29 falsos positivos por semana.
 */
export type DeclaredCaladaMovement = {
  /** `external_calado_at` en ms. */
  caladoMs: number
}

export type DeclaredPlatformMovement = {
  /** `platform_normalized` del Excel (p. ej. `VOLCABLE_PTO_3`). */
  platform: string
  /** `external_ingreso_at` en ms. */
  fromMs: number
  /** `external_salida_at` en ms (o `fromMs` si falta). */
  toMs: number
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
  /**
   * R2-b: True si el journey quedó con un circuito reconocido/completo (ejecutivo VÁLIDO o
   * matriz COMPLETO). Define el subgrupo «corrigieron y completaron» dentro de R2.
   */
  circuitCompleted?: boolean
  /** R11: movimientos del Excel de esta patente con plataforma declarada. */
  declaredPlatformMovements?: readonly DeclaredPlatformMovement[]
  /** R12: movimientos del Excel de esta patente con hora de calado registrada. */
  declaredCaladaMovements?: readonly DeclaredCaladaMovement[]
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

/**
 * R2: la patente estuvo en San Lorenzo y vuelve a Ricardone en < 2 h, no pellet.
 *
 * Robusto a fallo de cámara: NO exige un `INGRESO` de Ricardone puntual. Cualquier
 * evento con `siteId === 'ricardone'` (ingreso, preingreso, calada, balanza, etc.)
 * cuenta como «volvió a Ricardone», y cualquier evento con `siteId === 'san_lorenzo'`
 * cuenta como «estuvo en San Lorenzo». La ventana se mide del ÚLTIMO registro en San
 * Lorenzo al PRIMER registro en Ricardone que le sigue. Si ese primer retorno cae a
 * más de 2 h, esa presencia en SL se descarta y se espera la próxima.
 *
 * `journeyPoints` (opcional): si se pasa, el hit se adjudica SOLO cuando el evento de
 * retorno a Ricardone (RIC*) pertenece a ESE journey. Así, en una patente shuttle con
 * varios viajes, R2 marca únicamente el viaje de retorno (el que arranca de nuevo en
 * Ricardone) y no se dispersa entre journeys. Sin `journeyPoints` (tests unitarios), no
 * se aplica el filtro.
 */
export function detectSlThenRicReturn(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: {
    maxMs?: number
    isPelletTransile?: boolean
    isDeVuelta?: boolean
    circuitCompleted?: boolean
    journeyPoints?: readonly GoldenTimelinePoint[]
  }
): GoldenAnomalyHit | null {
  if (opts?.isPelletTransile || opts?.isDeVuelta) return null
  const maxMs = opts?.maxMs ?? SL_RIC_RETURN_MAX_MS
  const list = sortedPoints(platePoints)
  const journeyKeys = opts?.journeyPoints
    ? new Set(opts.journeyPoints.map((p) => `${p.t}:${p.logicalCode}`))
    : null
  let lastSl: GoldenTimelinePoint | null = null
  for (const p of list) {
    if (p.siteId === 'san_lorenzo') {
      lastSl = p
      continue
    }
    if (p.siteId === 'ricardone' && lastSl) {
      const delta = p.t - lastSl.t
      if (delta > 0 && delta < maxMs) {
        // El retorno debe pertenecer a este journey (si se acota por journey).
        if (journeyKeys && !journeyKeys.has(`${p.t}:${p.logicalCode}`)) {
          lastSl = null
          continue
        }
        const reason = classifyR2ReturnSubgroup(list, lastSl.t, opts?.circuitCompleted === true)
        return {
          reason,
          kind: 'BEHAVIORAL',
          detail: `Retorno San Lorenzo → Ricardone en ${roundMin(delta)} min (<2 h) sin pellet`,
          deltaMinutes: roundMin(delta),
          fromLogical: lastSl.logicalCode,
          toLogical: p.logicalCode,
        }
      }
      // Retorno demasiado tardío (≥ 2 h): esta presencia en SL ya no cuenta.
      lastSl = null
    }
  }
  return null
}

/**
 * Subgrupo de R2 (prioridad a → b → c), sobre la timeline de la patente ya ordenada.
 * `slStarT` es el instante del ÚLTIMO registro en San Lorenzo previo al retorno (SL*).
 *  - a: San Lorenzo fue el primer destino — NO hay ningún evento en Ricardone antes de SL*.
 *  - b: el journey de retorno completó un circuito reconocido (`circuitCompleted`); shuttle.
 *  - c: el resto — volvieron del puerto a Ricardone sin completar un circuito.
 */
function classifyR2ReturnSubgroup(
  sorted: readonly GoldenTimelinePoint[],
  slStarT: number,
  circuitCompleted: boolean
): GoldenAnomalyReason {
  const ricBeforeSl = sorted.some((p) => p.siteId === 'ricardone' && p.t < slStarT)
  if (!ricBeforeSl) return 'SL_RIC_2H_ERROR_DESTINO_NO_PELLET'
  if (circuitCompleted) return 'SL_RIC_2H_CICLO_COMPLETO_NO_PELLET'
  return 'SL_RIC_2H_SIN_CIRCUITO_NO_PELLET'
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

/**
 * R9: visita relámpago al puerto — entra y sale de San Lorenzo en menos de 30 min
 * SIN ningún registro de operación (balanza de ingreso o de salida, volcable,
 * descarga, líquidos, TK400).
 *
 * Por qué es robusta al fallo de cámara: los DOS extremos son detecciones positivas
 * (`SL_INGRESO` y `SL_EGRESO`), y el umbral no es arbitrario — el p05 real de
 * permanencia en el puerto son 40 min. Que falte la cámara de descarga no explica
 * el caso: aunque hubiera descargado sin que la cámara lo viera, en menos de media
 * hora no entra la cola de balanza. Es «pasó por el puerto sin operar».
 *
 * `journeyPoints`: si se pasa, el hit se adjudica solo al journey que contiene el
 * egreso del puerto (evita repetirlo en todos los journeys de la patente).
 */
export function detectSlFlashVisit(
  platePoints: readonly GoldenTimelinePoint[],
  opts?: { maxMs?: number; journeyPoints?: readonly GoldenTimelinePoint[] }
): GoldenAnomalyHit | null {
  const maxMs = opts?.maxMs ?? SL_FLASH_VISIT_MAX_MS
  const list = sortedPoints(platePoints)
  const journeyKeys = opts?.journeyPoints
    ? new Set(opts.journeyPoints.map((p) => `${p.t}:${p.logicalCode}`))
    : null
  for (let i = 0; i < list.length; i++) {
    const ing = list[i]!
    if (!SL_ENTRY_LOGICAL.has(ing.logicalCode)) continue
    if (ing.siteId && ing.siteId !== 'san_lorenzo') continue
    let operated = false
    for (let j = i + 1; j < list.length; j++) {
      const p = list[j]!
      if (p.siteId === 'ricardone') break
      if (SL_OPERATION_LOGICAL.has(p.logicalCode)) {
        operated = true
        continue
      }
      if (!SL_EXIT_LOGICAL.has(p.logicalCode)) continue
      const delta = p.t - ing.t
      if (delta <= 0 || delta >= maxMs || operated) break
      if (journeyKeys && !journeyKeys.has(`${p.t}:${p.logicalCode}`)) break
      return {
        reason: 'SL_VISITA_RELAMPAGO_SIN_OPERAR',
        kind: 'BEHAVIORAL',
        detail: `Entró y salió de San Lorenzo en ${roundMin(delta)} min sin balanza ni descarga registradas`,
        deltaMinutes: roundMin(delta),
        fromLogical: ing.logicalCode,
        toLogical: p.logicalCode,
      }
    }
  }
  return null
}

/**
 * R11: descargó en una calle de volcable distinta a la declarada en el Excel.
 *
 * Es la regla más sólida del set porque no depende de ninguna ausencia: exige un
 * movimiento del Excel con plataforma declarada (`VOLCABLE_PTO_n`) Y que NINGUNA de
 * las calles que la cámara registró en esa ventana sea la declarada. Dos fuentes
 * independientes que se contradicen — una cámara caída produce silencio, nunca una
 * contradicción.
 *
 * Se exige que falten TODAS las lecturas de la calle declarada, no que la primera
 * sea distinta: las cámaras de calles contiguas leen el mismo camión (dos lecturas
 * en el mismo minuto). Verificado contra los eventos crudos de la semana 24/08–30/08:
 * marcar sobre la primera lectura daba 11 casos de los cuales 5 eran falsos.
 */
export function detectDeclaredPlatformMismatch(
  points: readonly GoldenTimelinePoint[],
  movements: readonly DeclaredPlatformMovement[] | undefined,
  opts?: { windowMs?: number }
): GoldenAnomalyHit | null {
  if (!movements?.length) return null
  const windowMs = opts?.windowMs ?? DECLARED_PLATFORM_MATCH_WINDOW_MS
  const sorted = sortedPoints(points)
  for (const mov of movements) {
    const declared = volcableStreetFromPlatform(mov.platform)
    if (!declared) continue
    // TODAS las calles observadas dentro de la ventana del movimiento, no la primera:
    // las cámaras de calles contiguas leen el mismo camión (dos lecturas en el mismo
    // minuto), así que basta con que UNA de ellas sea la declarada para que no haya
    // contradicción. Marcar sobre la primera lectura daba ~45 % de falsos positivos.
    const observed = new Set<string>()
    for (const p of sorted) {
      if (p.t < mov.fromMs - windowMs) continue
      if (p.t > mov.toMs + windowMs) break
      const street = volcableStreetFromDevice(p.deviceCode)
      if (street) observed.add(street)
    }
    if (observed.size === 0) continue
    if (observed.has(declared)) continue
    const seen = [...observed].sort().join(' y ')
    return {
      reason: 'PLATAFORMA_DISTINTA_A_DECLARADA',
      kind: 'BEHAVIORAL',
      detail: `Excel declara volcable ${declared} y la cámara solo lo registró en el volcable ${seen}`,
      fromLogical: `VOLCABLE_PTO_${declared}`,
      toLogical: `CAMARA_VOLCABLE_${seen.replace(/ y /g, '_')}`,
    }
  }
  return null
}

/**
 * R12: descargó en el volcable de Ricardone sin pasar por la cámara de calado, y el Excel
 * tampoco registra hora de calado en la ventana del viaje. Es el caso donde ni la cámara ni
 * el papel prueban el muestreo obligatorio.
 *
 * Por qué se cruza contra Excel: la cámara `RicCal*` se equivoca de manera masiva
 * (verificado el 2026-09-10 sobre la semana 03-09/09-09 → 27 de 29 casos «sin calada» sí
 * tenían hora en el Excel; fallas de OCR: patente confundida como marca «SCANIA» o «IVECO»,
 * caracteres mal leídos, luces altas). Marcar sobre la cámara sola generaba ~29 falsos
 * positivos por semana. Con el cruce, quedan solo los casos donde ninguna de las dos fuentes
 * prueba el calado.
 *
 * Evidencia: positiva sobre la descarga (VOLCABLE existe), doble ausencia comprobada — la
 * cámara y el operario de balanza que registra el calado son fuentes independientes; que
 * ambas fallen a la vez sobre el mismo camión es lo que sostiene el hit.
 */
export function detectRicVolcableWithoutCalada(
  points: readonly GoldenTimelinePoint[],
  caladoMovements: readonly DeclaredCaladaMovement[] | undefined,
  opts?: { caladoWindowMs?: number }
): GoldenAnomalyHit | null {
  const list = sortedPoints(points)
  // Recorrer cada visita a Ricardone (INGRESO/PREINGRESO → EGRESO o fin) buscando VOLCABLE
  // sin CALADA previa dentro de esa visita.
  let visitStart = -1
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!
    const isEntry = p.siteId === 'ricardone' && RIC_ENTRY_LOGICAL.has(p.logicalCode)
    if (isEntry && visitStart < 0) visitStart = i
    if (p.siteId === 'ricardone' && p.logicalCode === 'EGRESO') { visitStart = -1; continue }
    if (p.logicalCode !== 'VOLCABLE') continue
    if (p.siteId && p.siteId !== 'ricardone') continue
    if (visitStart < 0) continue
    const inside = list.slice(visitStart, i + 1)
    if (inside.some((x) => x.logicalCode === 'CALADA')) continue
    // Sin cámara de calado en la visita: ¿hay hora de calado en el Excel dentro de la ventana?
    const windowMs = opts?.caladoWindowMs ?? DECLARED_CALADA_MATCH_WINDOW_MS
    const lo = list[visitStart]!.t - windowMs
    const hi = p.t + 30 * 60 * 1000
    const excelHasCalado = (caladoMovements ?? []).some((m) => m.caladoMs >= lo && m.caladoMs <= hi)
    if (excelHasCalado) continue
    return {
      reason: 'VOLCABLE_SIN_CALADA_RIC',
      kind: 'BEHAVIORAL',
      detail: 'Descargó en el volcable de Ricardone sin registro de calado en la cámara ni en el Excel',
      fromLogical: list[visitStart]!.logicalCode,
      toLogical: 'VOLCABLE',
    }
  }
  return null
}

/**
 * R11-b: la cámara registró descargas en DOS o más calles de volcable distintas dentro de la
 * ventana del mismo movimiento del Excel. El patrón operativo es una descarga por movimiento —
 * dos calles distintas sobre el mismo contrato es evidencia positiva doble (dos cámaras
 * disparando) que no se explica con silencios ni ambigüedad de lectura.
 *
 * Se descarta el caso de calles contiguas leídas casi al mismo tiempo (dos cámaras vecinas
 * viendo el mismo camión en el mismo minuto): solo dispara si el intervalo entre la primera
 * y la última lectura de distintas calles supera 20 min.
 */
export function detectMultipleVolcableStreets(
  points: readonly GoldenTimelinePoint[],
  movements: readonly DeclaredPlatformMovement[] | undefined,
  opts?: { windowMs?: number; minStreetGapMs?: number }
): GoldenAnomalyHit | null {
  if (!movements?.length) return null
  const windowMs = opts?.windowMs ?? DECLARED_PLATFORM_MATCH_WINDOW_MS
  const minGap = opts?.minStreetGapMs ?? 20 * 60 * 1000
  const sorted = sortedPoints(points)
  for (const mov of movements) {
    const declared = volcableStreetFromPlatform(mov.platform)
    if (!declared) continue
    // (street, t) por cada lectura de volcable en la ventana del movimiento
    const readings: { street: string; t: number }[] = []
    for (const p of sorted) {
      if (p.t < mov.fromMs - windowMs) continue
      if (p.t > mov.toMs + windowMs) break
      const street = volcableStreetFromDevice(p.deviceCode)
      if (street) readings.push({ street, t: p.t })
    }
    const streets = new Set(readings.map((r) => r.street))
    if (streets.size < 2) continue
    // Descartar cámaras contiguas leyendo al mismo camión: exigir separación mínima entre
    // la primera y la última lectura de calles distintas.
    let minT = Infinity
    let maxT = -Infinity
    for (const r of readings) {
      if (r.t < minT) minT = r.t
      if (r.t > maxT) maxT = r.t
    }
    if (maxT - minT < minGap) continue
    const list = [...streets].sort().join(' y ')
    return {
      reason: 'PLATAFORMA_MULTIPLE_CALLES',
      kind: 'BEHAVIORAL',
      detail: `La cámara registró descargas en las calles ${list} sobre el mismo movimiento (Excel declara ${declared})`,
      fromLogical: `VOLCABLE_PTO_${declared}`,
      toLogical: `CAMARA_VOLCABLES_${list.replace(/ y /g, '_')}`,
    }
  }
  return null
}

/** Calle del volcable de puerto desde el device de cámara (`SLZVolcableC3` → `3`). */
function volcableStreetFromDevice(deviceCode: string | undefined): string {
  const m = /^SLZVolcableC([1-5])$/i.exec(String(deviceCode ?? '').trim())
  return m ? m[1]! : ''
}

/** Calle del volcable de puerto desde la plataforma del Excel (`VOLCABLE_PTO_3` → `3`). */
function volcableStreetFromPlatform(platform: string | undefined): string {
  const m = /^VOLCABLE_PTO_([1-5])$/i.exec(String(platform ?? '').trim().toUpperCase())
  return m ? m[1]! : ''
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
 * Evalúa el set vigente R11, R9, R2, R1, R6, R4, R5 en orden de prioridad (la primera
 * hit gana para `anomaly_kind_reason`). R1/R2/R6/R9 sobre la timeline de la patente;
 * R4/R5/R11 sobre la del journey. Devuelve todas las hits; el cableado usa la primera.
 *
 * R2 va ANTES que R1: el retorno desde San Lorenzo (R2) es más específico que el
 * reingreso genérico a Ricardone (R1), así que un Ric→SL→Ric queda etiquetado como
 * R2 y R1 queda para reingresos que no pasaron por el puerto. R3 fue retirada
 * (2026-09-04): quedó absorbida por R6.
 */
export function evaluateGoldenAnomalyRules(input: EvaluateGoldenAnomalyInput): GoldenAnomalyHit[] {
  const platePts = input.platePoints?.length ? input.platePoints : input.points
  const isPellet = input.isPelletTransile === true || isPelletCircuitCode(input.circuitCode)
  const isDeVuelta = input.isDeVuelta === true
  const hits: GoldenAnomalyHit[] = []

  // R11 y R9 van primero: son las de evidencia más fuerte (contradicción entre fuentes
  // y par de detecciones positivas). Si una de ellas pega, es la que mejor describe el caso.
  const r11 = detectDeclaredPlatformMismatch(input.points, input.declaredPlatformMovements)
  if (r11) hits.push({ ...r11, circuitCode: input.circuitCode })

  const r11b = detectMultipleVolcableStreets(input.points, input.declaredPlatformMovements)
  if (r11b) hits.push({ ...r11b, circuitCode: input.circuitCode })

  const r12 = detectRicVolcableWithoutCalada(input.points, input.declaredCaladaMovements)
  if (r12) hits.push({ ...r12, circuitCode: input.circuitCode })

  const r9 = detectSlFlashVisit(platePts, { journeyPoints: input.points })
  if (r9) hits.push({ ...r9, circuitCode: input.circuitCode })

  const r2 = detectSlThenRicReturn(platePts, {
    isPelletTransile: isPellet,
    isDeVuelta,
    circuitCompleted: input.circuitCompleted === true,
    journeyPoints: input.points,
  })
  if (r2) hits.push({ ...r2, circuitCode: input.circuitCode })

  const r1 = detectRicQuickReEntry(platePts, { isPelletTransile: isPellet, isDeVuelta })
  if (r1) hits.push({ ...r1, circuitCode: input.circuitCode })

  const r6 = detectRicToSlWithoutSlCalada(platePts)
  if (r6) hits.push({ ...r6, circuitCode: input.circuitCode })

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
