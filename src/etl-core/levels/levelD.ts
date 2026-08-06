/**
 * Nivel D — partición de los recorridos.
 *
 * Hasta v13 `final_circuits` llevaba DOS taxonomías paralelas en la misma fila
 * (`executive_bucket` con 4 valores y `anomaly_kind` con 3) que se
 * contradecían: sobre 2026-07-13_2026-07-19 había 52 journeys COMPLETO que
 * además eran BEHAVIORAL. Un recorrido con comportamiento anómalo alimentaba
 * los KPI de logística como si fuera limpio.
 *
 * v14 lo convierte en una PARTICIÓN real: cada journey cae en exactamente un
 * archivo, y los cuatro suman el universo.
 *
 *   D    circuitos_validos      → COMPLETO + DEDUCIDO (marcados)
 *   D'   circuitos_anomalos     → comportamiento anómalo afirmable
 *   D''  circuitos_incompletos  → cobertura insuficiente
 *   D''' camiones_sin_contrato  → la cámara lo vio, el Excel no lo tiene
 *
 * PRECEDENCIA: ANOMALO > INCOMPLETO > DEDUCIDO > COMPLETO. Un journey con
 * anomalía afirmable no puede salir COMPLETO, que era el agujero de v13.
 *
 * UMBRAL DE EVIDENCIA: hacen falta más de 3 lecturas de cámara para afirmar un
 * comportamiento o para declarar un camión sin contrato. Con 3 o menos no se
 * puede afirmar nada, y decirlo es más honesto que contarlo.
 *
 * UNIVERSO: los journeys que cita C, más los que la cámara vio sin contrato.
 * Ya no es "los que sobrevivieron al filtro del Tramo 2".
 */

import { canonicalJourneyKey, journeyUidParts, type JourneyKeyIndex } from './journeyKey'
import type { Row } from './levelC'

/** Lecturas de cámara mínimas para afirmar comportamiento o ausencia de contrato. */
export const MIN_EVENTOS_AFIRMABLE = 3

export type NivelD = 'D' | "D'" | "D''" | "D'''"

/** De dónde viene la fila: clasificada por el ETL, o absorbida del pool limpio. */
export type OrigenD = 'CLASIFICADO' | 'ABSORBIDO'

export type LevelDInput = {
  /** Journeys clasificados (final_circuits). */
  readonly clasificados: readonly Row[]
  /** Pool limpio completo (clean_journeys_for_analysis), para absorber huérfanos. */
  readonly poolLimpio: readonly Row[]
  /** Llaves que cita el nivel C. Define el universo con contrato. */
  readonly citedKeys: ReadonlySet<string>
  readonly index: JourneyKeyIndex
  /** Eventos por llave, para el umbral. Cae a `event_count_front` si falta. */
  readonly eventCounts?: ReadonlyMap<string, number>
  /**
   * Horas por llave. `final_circuits` no las trae, y sin ellas la pantalla de
   * Seguridad no puede decir CUÁNDO pasó la anomalía.
   */
  readonly journeyTimes?: ReadonlyMap<string, { inicio: string; fin: string }>
}

export type LevelDOutput = {
  readonly validos: Row[]
  readonly anomalos: Row[]
  readonly incompletos: Row[]
  readonly sinContrato: Row[]
  /** Vistos por cámara, sin contrato y sin evidencia suficiente. No se tiran: se cuentan. */
  readonly descartados: Row[]
  readonly stats: LevelDStats
}

export type LevelDStats = {
  readonly universo: number
  readonly validos: number
  readonly anomalos: number
  readonly incompletos: number
  readonly sinContrato: number
  readonly descartados: number
  readonly absorbidos: number
  /** Debe dar true siempre: es el invariante que v13 no podía cumplir. */
  readonly esParticion: boolean
}

const str = (v: unknown): string => String(v ?? '').trim()
const upper = (v: unknown): string => str(v).toUpperCase()
const num = (v: unknown): number => {
  const n = Number(str(v))
  return Number.isFinite(n) ? n : 0
}

export const LEVEL_D_HEADERS: readonly string[] = [
  'journey_key',
  'journey_parts',
  'nivel',
  'origen',
  'plate',
  'circuito_code',
  'circuito_label',
  'clasificacion',
  'motivo',
  'eventos',
  'inicio_at',
  'fin_at',
  'total_min',
  'coverage_percent',
  'secuencia_observada',
  'planta_origen',
  'tiene_contrato',
]

/**
 * ¿El journey tiene una anomalía que se pueda AFIRMAR?
 * Requiere motivo de comportamiento y evidencia suficiente. `ANOMALO` del
 * bucket ejecutivo entra siempre: ya es un veredicto del ETL.
 */
export function esAnomaliaAfirmable(bucket: string, kind: string, eventos: number): boolean {
  if (bucket === 'ANOMALO') return true
  return kind === 'BEHAVIORAL' && eventos > MIN_EVENTOS_AFIRMABLE
}

/** Aplica la precedencia. Es la única función que decide el nivel. */
export function clasificarConContrato(
  bucket: string,
  kind: string,
  eventos: number
): Exclude<NivelD, "D'''"> {
  if (esAnomaliaAfirmable(bucket, kind, eventos)) return "D'"
  if (bucket === 'INCOMPLETO') return "D''"
  if (bucket === 'COMPLETO' || bucket === 'DEDUCIDO') return 'D'
  // Sin bucket reconocible no se puede afirmar el circuito: es incompleto.
  return "D''"
}

function filaDesdeClasificado(
  r: Row,
  eventos: number,
  nivel: NivelD,
  conContrato: boolean,
  tiempos?: { inicio: string; fin: string }
): Row {
  const uid = str(r.journey_uid)
  const inicio = tiempos?.inicio ?? ''
  const fin = tiempos?.fin ?? ''
  const t0 = Date.parse(inicio)
  const t1 = Date.parse(fin)
  const total =
    Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 ? Math.round((t1 - t0) / 60000) : ''
  return {
    journey_key: canonicalJourneyKey(uid),
    journey_parts: journeyUidParts(uid).join(';'),
    nivel,
    origen: 'CLASIFICADO' satisfies OrigenD,
    plate: str(r.truck_plate) || str(r.normalized_plate),
    circuito_code: str(r.executive_circuit_code),
    circuito_label: str(r.executive_circuit_label),
    clasificacion: upper(r.executive_bucket),
    motivo: str(r.anomaly_kind_reason) || str(r.executive_anomaly_reason),
    eventos,
    inicio_at: inicio,
    fin_at: fin,
    total_min: total,
    coverage_percent: str(r.coverage_percent),
    secuencia_observada: str(r.logical_sequence_front),
    planta_origen: str(r.anomaly_origin_plant),
    tiene_contrato: conContrato ? 'SI' : 'NO',
  }
}

function filaDesdePool(r: Row, eventos: number, nivel: NivelD): Row {
  const uid = str(r.journey_uid)
  return {
    journey_key: canonicalJourneyKey(uid),
    journey_parts: journeyUidParts(uid).join(';'),
    nivel,
    origen: 'ABSORBIDO' satisfies OrigenD,
    plate: str(r.plate_normalized),
    circuito_code: str(r.circuit_code),
    circuito_label: str(r.circuit_label),
    // No pasó por la clasificación del Tramo 2: no se le inventa un bucket.
    clasificacion: 'NO_CLASIFICADO',
    motivo: str(r.analysis_exclusion_reason) || 'NO_CLASIFICADO_TRAMO2',
    eventos,
    inicio_at: str(r.start_time),
    fin_at: str(r.end_time),
    total_min: str(r.duration_min),
    coverage_percent: str(r.coverage_percent),
    secuencia_observada: str(r.observed_sequence),
    planta_origen: str(r.planta_normalized),
    tiene_contrato: 'SI',
  }
}

export function buildLevelD(input: LevelDInput): LevelDOutput {
  const validos: Row[] = []
  const anomalos: Row[] = []
  const incompletos: Row[] = []
  const sinContrato: Row[] = []
  const descartados: Row[] = []

  const vistos = new Set<string>()
  /**
   * El conteo propio de la fila manda: es por recorrido, y por lo tanto por
   * vuelta. La timeline sólo religa por prefijo, que dos vueltas del mismo
   * camión comparten — usarla primero le daría a cada vuelta los eventos de
   * todas. Queda como respaldo para las filas que no traen conteo.
   */
  const eventosDe = (key: string, propio: unknown): number => {
    const n = num(propio)
    if (n > 0) return n
    return input.eventCounts?.get(key) ?? 0
  }

  // --- 1) Journeys ya clasificados por el ETL -------------------------------
  for (const r of input.clasificados) {
    const key = canonicalJourneyKey(str(r.journey_uid))
    if (!key || vistos.has(key)) continue
    vistos.add(key)

    const eventos = eventosDe(key, r.event_count_front)
    const conContrato =
      input.citedKeys.has(key) || journeyUidParts(str(r.journey_uid)).some((p) => input.citedKeys.has(p))

    if (!conContrato) {
      // La cámara lo vio y el Excel no lo tiene. Sólo es afirmable con
      // evidencia suficiente; con 3 lecturas o menos no se puede sostener.
      const fila = filaDesdeClasificado(r, eventos, "D'''", false, input.journeyTimes?.get(key))
      if (eventos > MIN_EVENTOS_AFIRMABLE) sinContrato.push(fila)
      else descartados.push({ ...fila, nivel: '', motivo: 'EVIDENCIA_INSUFICIENTE_SIN_CONTRATO' })
      continue
    }

    const nivel = clasificarConContrato(upper(r.executive_bucket), upper(r.anomaly_kind), eventos)
    const fila = filaDesdeClasificado(r, eventos, nivel, true, input.journeyTimes?.get(key))
    if (nivel === "D'") anomalos.push(fila)
    else if (nivel === "D''") incompletos.push(fila)
    else validos.push(fila)
  }

  // --- 2) Absorción: journeys que C cita y el Tramo 2 nunca clasificó -------
  // v13 los dejaba colgando (C citaba uids que no existían en D). Ahora entran
  // al modelo como incompletos declarados, sin inventarles una clasificación.
  let absorbidos = 0
  for (const r of input.poolLimpio) {
    const uid = str(r.journey_uid)
    const key = canonicalJourneyKey(uid)
    if (!key || vistos.has(key)) continue
    const citado =
      input.citedKeys.has(key) || journeyUidParts(uid).some((p) => input.citedKeys.has(p))
    if (!citado) continue
    vistos.add(key)

    const eventos = eventosDe(key, r.event_count)
    const fila = filaDesdePool(r, eventos, "D''")
    if (eventos > MIN_EVENTOS_AFIRMABLE) {
      incompletos.push(fila)
      absorbidos++
    } else {
      descartados.push({ ...fila, nivel: '', motivo: 'EVIDENCIA_INSUFICIENTE_ABSORBIDO' })
    }
  }

  const universo =
    validos.length + anomalos.length + incompletos.length + sinContrato.length + descartados.length

  // Invariante: ninguna llave en dos niveles. `vistos` lo garantiza por
  // construcción; se verifica igual porque es la promesa del modelo.
  const llaves = new Set<string>()
  let duplicadas = 0
  for (const f of [...validos, ...anomalos, ...incompletos, ...sinContrato, ...descartados]) {
    const k = str(f.journey_key)
    if (llaves.has(k)) duplicadas++
    llaves.add(k)
  }

  return {
    validos,
    anomalos,
    incompletos,
    sinContrato,
    descartados,
    stats: {
      universo,
      validos: validos.length,
      anomalos: anomalos.length,
      incompletos: incompletos.length,
      sinContrato: sinContrato.length,
      descartados: descartados.length,
      absorbidos,
      esParticion: duplicadas === 0 && llaves.size === universo,
    },
  }
}
