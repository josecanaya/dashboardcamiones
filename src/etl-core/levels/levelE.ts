/**
 * Nivel E — KPI de tiempos, derivado de D × C.
 *
 * Sólo entran recorridos del nivel D (válidos). Los anómalos y los incompletos
 * quedan afuera a propósito: mezclarlos era lo que hacía que la mediana de un
 * circuito incluyera camiones que se habían ido por otro lado.
 *
 * Los tiempos ya vienen resueltos de C (cámara primero, Excel de respaldo), así
 * que E no vuelve a elegir fuente: sólo agrega. Y publica la composición por
 * fuente en cada fila, porque una mediana calculada sobre 80% de respaldo Excel
 * no significa lo mismo que una sobre 80% de cámara, y quien la lee tiene que
 * poder verlo sin abrir otra tabla.
 */

import { canonicalJourneyKey } from './journeyKey'
import type { Row, TimeSource } from './levelC'

export type LevelEInput = {
  /** Operaciones con evidencia (C_operaciones_con_camara). */
  readonly operaciones: readonly Row[]
  /** Recorridos válidos (D). Define qué operaciones entran al KPI. */
  readonly validos: readonly Row[]
  /**
   * Patas por recorrido (`circuit_timing_journeys`): Ricardone, puente y San
   * Lorenzo. E las re-llavea a `journey_key` y las publica, para que ningún
   * consumidor tenga que joinear contra la forma vieja del uid — que no
   * coincide con la canónica y daba cero matches.
   */
  readonly legs?: readonly Row[]
}

export type LevelEOutput = {
  readonly kpiCircuito: Row[]
  readonly kpiOperacion: Row[]
  readonly stats: LevelEStats
}

export type LevelEStats = {
  readonly operacionesElegibles: number
  readonly operacionesConTiempo: number
  readonly circuitos: number
  /** Porcentaje del KPI sostenido por cámara pura. Es la métrica de confianza. */
  readonly porcentajeCamaraPura: number
}

const str = (v: unknown): string => String(v ?? '').trim()
const num = (v: unknown): number => {
  const n = Number(str(v))
  return Number.isFinite(n) ? n : NaN
}

/** Percentil sobre una lista YA ordenada. Mismo criterio que usa el front. */
export function percentil(ordenados: readonly number[], p: number): number {
  if (!ordenados.length) return 0
  return ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))]!
}

const mediana = (ordenados: readonly number[]): number => percentil(ordenados, 0.5)

/** Las tres patas del recorrido Ricardone → puente → San Lorenzo. */
export const TRAMOS = [
  { col: 'ric_duration_min', id: 'ric', desde: 'INGRESO', hasta: 'EGRESO' },
  { col: 'bridge_duration_min', id: 'bridge', desde: 'EGRESO', hasta: 'SL_INGRESO' },
  { col: 'sl_duration_min', id: 'sl', desde: 'SL_INGRESO', hasta: 'SL_EGRESO' },
] as const

export const LEVEL_E_CIRCUITO_HEADERS: readonly string[] = [
  'circuito_code',
  'n_operaciones',
  'mediana_min',
  'p90_min',
  'media_min',
  'min_min',
  'max_min',
  'n_camara',
  'n_camara_parcial',
  'n_excel_respaldo',
  'porcentaje_camara_pura',
  ...TRAMOS.flatMap((t) => [`${t.id}_media_min`, `${t.id}_p90_min`, `${t.id}_n`]),
]

export const LEVEL_E_OPERACION_HEADERS: readonly string[] = [
  'journey_key',
  'external_operation_id',
  'plate_normalized',
  'circuito_code',
  'product_normalized',
  'inicio_at',
  'fin_at',
  'total_min',
  'time_source',
  ...TRAMOS.map((t) => `${t.id}_min`),
]

export function buildLevelE(input: LevelEInput): LevelEOutput {
  // Llaves de recorrido válido: sólo esas entran al KPI.
  const validas = new Set<string>()
  const circuitoDeLlave = new Map<string, string>()
  for (const d of input.validos) {
    const k = str(d.journey_key)
    if (!k) continue
    validas.add(k)
    const c = str(d.circuito_code)
    if (c) circuitoDeLlave.set(k, c)
  }

  // Patas re-llaveadas a journey_key: es lo que permite que el front las lea
  // sin joinear contra la forma vieja del uid.
  const legsPorLlave = new Map<string, Row>()
  for (const l of input.legs ?? []) {
    const k = canonicalJourneyKey(str(l.journey_id))
    if (k && !legsPorLlave.has(k)) legsPorLlave.set(k, l)
  }

  const kpiOperacion: Row[] = []
  type Acc = { durs: number[]; fuentes: Record<TimeSource, number>; tramos: Record<string, number[]> }
  const porCircuito = new Map<string, Acc>()
  let elegibles = 0
  let conTiempo = 0

  for (const op of input.operaciones) {
    const llaves = str(op.journey_keys).split(';').filter(Boolean)
    const llaveValida = llaves.find((k) => validas.has(k))
    if (!llaveValida) continue
    elegibles++

    // El circuito lo manda D; C sólo lo aporta si D no lo tiene resuelto.
    const circuito = circuitoDeLlave.get(llaveValida) || str(op.resolved_executive_circuit_code)
    if (!circuito) continue

    const fuente = (str(op.time_source) || 'SIN_TIEMPO') as TimeSource
    const total = num(op.total_min)
    const leg = legsPorLlave.get(llaveValida)

    const fila: Row = {
      journey_key: llaveValida,
      external_operation_id: str(op.external_operation_id),
      plate_normalized: str(op.plate_normalized),
      circuito_code: circuito,
      product_normalized: str(op.product_normalized),
      inicio_at: str(op.inicio_at),
      fin_at: str(op.fin_at),
      total_min: Number.isFinite(total) ? total : '',
      time_source: fuente,
    }
    for (const t of TRAMOS) {
      const v = leg ? num(leg[t.col]) : NaN
      fila[`${t.id}_min`] = Number.isFinite(v) && v > 0 ? Math.round(v) : ''
    }
    kpiOperacion.push(fila)

    let acc = porCircuito.get(circuito)
    if (!acc) {
      acc = {
        durs: [],
        fuentes: { CAMARA: 0, CAMARA_PARCIAL_EXCEL: 0, EXCEL_RESPALDO: 0, SIN_TIEMPO: 0 },
        tramos: Object.fromEntries(TRAMOS.map((t) => [t.id, [] as number[]])),
      }
      porCircuito.set(circuito, acc)
    }
    acc.fuentes[fuente] = (acc.fuentes[fuente] ?? 0) + 1
    if (Number.isFinite(total) && total > 0) {
      acc.durs.push(total)
      conTiempo++
    }
    for (const t of TRAMOS) {
      const v = fila[`${t.id}_min`]
      if (typeof v === 'number' && v > 0) acc.tramos[t.id]!.push(v)
    }
  }

  const kpiCircuito: Row[] = []
  let camaraPura = 0
  let totalFuentes = 0
  for (const [circuito, acc] of [...porCircuito.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ds = [...acc.durs].sort((a, b) => a - b)
    const n = acc.fuentes.CAMARA + acc.fuentes.CAMARA_PARCIAL_EXCEL + acc.fuentes.EXCEL_RESPALDO
    camaraPura += acc.fuentes.CAMARA
    totalFuentes += n
    const tramos: Row = {}
    for (const t of TRAMOS) {
      const vals = [...(acc.tramos[t.id] ?? [])].sort((a, b) => a - b)
      tramos[`${t.id}_media_min`] = vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : ''
      tramos[`${t.id}_p90_min`] = vals.length ? Math.round(percentil(vals, 0.9)) : ''
      tramos[`${t.id}_n`] = vals.length
    }

    kpiCircuito.push({
      ...tramos,
      circuito_code: circuito,
      n_operaciones: n,
      mediana_min: ds.length ? Math.round(mediana(ds)) : '',
      p90_min: ds.length ? Math.round(percentil(ds, 0.9)) : '',
      media_min: ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : '',
      min_min: ds.length ? Math.round(ds[0]!) : '',
      max_min: ds.length ? Math.round(ds[ds.length - 1]!) : '',
      n_camara: acc.fuentes.CAMARA,
      n_camara_parcial: acc.fuentes.CAMARA_PARCIAL_EXCEL,
      n_excel_respaldo: acc.fuentes.EXCEL_RESPALDO,
      porcentaje_camara_pura: n ? Math.round((acc.fuentes.CAMARA / n) * 1000) / 10 : 0,
    })
  }

  return {
    kpiCircuito,
    kpiOperacion,
    stats: {
      operacionesElegibles: elegibles,
      operacionesConTiempo: conTiempo,
      circuitos: kpiCircuito.length,
      porcentajeCamaraPura: totalFuentes ? Math.round((camaraPura / totalFuentes) * 1000) / 10 : 0,
    },
  }
}
