/**
 * Modelo de niveles A→B→C→D→E (v14).
 *
 *   A  movimientos_contrato          Excel de contrato (fuente)
 *   B  truckflow_events              eventos de cámara (fuente)
 *   C  operaciones                   A × B — el nodo fuerte, partido en
 *                                    con_camara / sin_camara
 *   D  circuitos                     partición: validos / anomalos /
 *                                    incompletos / camiones_sin_contrato
 *   E  kpi                           tiempos, derivados de D × C
 *
 * Regla: cada nivel se construye SÓLO desde el anterior. Nadie saltea. Las 28
 * tablas de v13 que no entran en este árbol pasan a ser derivadas o debug: no
 * son fuente de verdad para ninguna pregunta de negocio.
 */

import { canonicalJourneyKey, shortUid, type JourneyKeyIndex } from './journeyKey'
import { buildLevelC, LEVEL_C_HEADERS, type JourneyTimes, type Row } from './levelC'
import { buildLevelD, LEVEL_D_HEADERS } from './levelD'
import {
  buildLevelE,
  LEVEL_E_CIRCUITO_HEADERS,
  LEVEL_E_OPERACION_HEADERS,
} from './levelE'

export * from './journeyKey'
export * from './levelC'
export * from './levelD'
export * from './levelE'

/** Nombres canónicos en disco. El prefijo es el nivel: ordena y explica. */
export const LEVEL_TABLES = {
  cConCamara: 'C_operaciones_con_camara',
  cSinCamara: 'C_operaciones_sin_camara',
  dValidos: 'D_circuitos_validos',
  dAnomalos: 'D_circuitos_anomalos',
  dIncompletos: 'D_circuitos_incompletos',
  dSinContrato: 'D_camiones_sin_contrato',
  dDescartados: 'D_descartados',
  eKpiCircuito: 'E_kpi_circuito',
  eKpiOperacion: 'E_kpi_operacion',
} as const

export type LevelTableName = (typeof LEVEL_TABLES)[keyof typeof LEVEL_TABLES]

export type MaterializedTable = {
  readonly name: string
  readonly headers: readonly string[]
  readonly rows: readonly Row[]
}

export type BuildLevelsInput = {
  /** excel_operations_with_truckflow */
  readonly excelRows: readonly Row[]
  /** final_circuits */
  readonly finalCircuits: readonly Row[]
  /** clean_journeys_for_analysis */
  readonly cleanJourneys: readonly Row[]
  /** journey_timeline (opcional; da el conteo de eventos exacto por journey) */
  readonly journeyTimeline?: readonly Row[]
  /** circuit_timing_journeys (opcional; aporta las patas del recorrido a E) */
  readonly circuitTimingJourneys?: readonly Row[]
}

export type BuildLevelsResult = {
  readonly tables: Record<LevelTableName, MaterializedTable>
  readonly index: JourneyKeyIndex
  readonly stats: {
    readonly c: ReturnType<typeof buildLevelC>['stats']
    readonly d: ReturnType<typeof buildLevelD>['stats']
    readonly e: ReturnType<typeof buildLevelE>['stats']
  }
  /** Chequeos que deben pasar para que la corrida sea publicable. */
  readonly invariantes: Invariante[]
}

export type Invariante = {
  readonly nombre: string
  readonly ok: boolean
  readonly detalle: string
}

const str = (v: unknown): string => String(v ?? '').trim()

function tabla(name: string, headers: readonly string[], rows: readonly Row[]): MaterializedTable {
  return { name, headers, rows }
}

/** Eventos por llave canónica, desde la timeline cruda. */
function contarEventos(
  timeline: readonly Row[] | undefined,
  index: JourneyKeyIndex
): Map<string, number> {
  const out = new Map<string, number>()
  if (!timeline?.length) return out
  const porParte = new Map<string, number>()
  for (const e of timeline) {
    const parte = str(e.short_uid) || shortUid(str(e.journey_uid))
    if (!parte) continue
    porParte.set(parte, (porParte.get(parte) ?? 0) + 1)
  }
  // Un journey fusionado suma los eventos de todas sus partes. Si una parte la
  // comparten varias vueltas del mismo camión, no se reparte: atribuirle a cada
  // vuelta los eventos de todas sería inventar evidencia. Esas llaves quedan
  // sin conteo aquí y usan el de su propia fila.
  for (const [key, partes] of index.partsByKey) {
    if (partes.some((p) => (index.byPart.get(p)?.length ?? 0) > 1)) continue
    let n = 0
    for (const p of partes) n += porParte.get(p) ?? 0
    if (n) out.set(key, n)
  }
  return out
}

export function buildLevels(input: BuildLevelsInput): BuildLevelsResult {
  // El índice de religado se arma con TODOS los journeys conocidos: los
  // clasificados y el pool limpio. Así C puede resolver cualquier cita.
  const journeyUids = [
    ...input.finalCircuits.map((r) => str(r.journey_uid)),
    ...input.cleanJourneys.map((r) => str(r.journey_uid)),
  ].filter(Boolean)

  const journeyTimes = new Map<string, JourneyTimes>()
  for (const j of input.cleanJourneys) {
    const uid = str(j.journey_uid)
    if (!uid) continue
    journeyTimes.set(uid, { inicio: str(j.start_time), fin: str(j.end_time) })
  }

  const c = buildLevelC({ excelRows: input.excelRows, journeyUids, journeyTimes })
  const eventCounts = contarEventos(input.journeyTimeline, c.index)

  // Horas por llave canónica: `final_circuits` no las trae, así que D las toma
  // del pool limpio para poder decir CUÁNDO ocurrió cada anomalía.
  const timesByKey = new Map<string, JourneyTimes>()
  for (const [uid, t] of journeyTimes) {
    const key = canonicalJourneyKey(uid)
    if (key && !timesByKey.has(key)) timesByKey.set(key, t)
  }

  const d = buildLevelD({
    clasificados: input.finalCircuits,
    poolLimpio: input.cleanJourneys,
    citedKeys: c.citedKeys,
    index: c.index,
    eventCounts,
    journeyTimes: timesByKey,
  })

  const e = buildLevelE({
    operaciones: c.conCamara,
    validos: d.validos,
    legs: input.circuitTimingJourneys,
  })

  const tables = {
    [LEVEL_TABLES.cConCamara]: tabla(LEVEL_TABLES.cConCamara, LEVEL_C_HEADERS, c.conCamara),
    [LEVEL_TABLES.cSinCamara]: tabla(LEVEL_TABLES.cSinCamara, LEVEL_C_HEADERS, c.sinCamara),
    [LEVEL_TABLES.dValidos]: tabla(LEVEL_TABLES.dValidos, LEVEL_D_HEADERS, d.validos),
    [LEVEL_TABLES.dAnomalos]: tabla(LEVEL_TABLES.dAnomalos, LEVEL_D_HEADERS, d.anomalos),
    [LEVEL_TABLES.dIncompletos]: tabla(LEVEL_TABLES.dIncompletos, LEVEL_D_HEADERS, d.incompletos),
    [LEVEL_TABLES.dSinContrato]: tabla(LEVEL_TABLES.dSinContrato, LEVEL_D_HEADERS, d.sinContrato),
    [LEVEL_TABLES.dDescartados]: tabla(LEVEL_TABLES.dDescartados, LEVEL_D_HEADERS, d.descartados),
    [LEVEL_TABLES.eKpiCircuito]: tabla(
      LEVEL_TABLES.eKpiCircuito,
      LEVEL_E_CIRCUITO_HEADERS,
      e.kpiCircuito
    ),
    [LEVEL_TABLES.eKpiOperacion]: tabla(
      LEVEL_TABLES.eKpiOperacion,
      LEVEL_E_OPERACION_HEADERS,
      e.kpiOperacion
    ),
  } as Record<LevelTableName, MaterializedTable>

  return { tables, index: c.index, stats: { c: c.stats, d: d.stats, e: e.stats }, invariantes: verificar(c, d, input) }
}

function verificar(
  c: ReturnType<typeof buildLevelC>,
  d: ReturnType<typeof buildLevelD>,
  input: BuildLevelsInput
): Invariante[] {
  const inv: Invariante[] = []

  inv.push({
    nombre: 'C cubre todo el Excel',
    ok: c.stats.conCamara + c.stats.sinCamara === input.excelRows.length,
    detalle: `${c.stats.conCamara} + ${c.stats.sinCamara} vs ${input.excelRows.length} filas de Excel`,
  })

  inv.push({
    nombre: 'D es una partición',
    ok: d.stats.esParticion,
    detalle: `universo ${d.stats.universo}, sin llaves repetidas entre niveles`,
  })

  // Toda cita de C tiene que existir en D. Es el defecto que v13 no podía
  // cumplir: C citaba 1.828 prefijos que ningún journey de D respaldaba.
  const enD = new Set<string>()
  for (const f of [...d.validos, ...d.anomalos, ...d.incompletos, ...d.descartados]) {
    enD.add(str(f.journey_key))
  }
  const colgadas = [...c.citedKeys].filter((k) => !enD.has(k))
  inv.push({
    nombre: 'C no cita journeys fuera de D',
    ok: colgadas.length === 0,
    detalle: colgadas.length ? `${colgadas.length} llaves citadas sin fila en D` : 'sin citas colgadas',
  })

  inv.push({
    nombre: 'Llave canónica estable',
    ok: [...c.citedKeys].every((k) => canonicalJourneyKey(k) === k),
    detalle: 'toda llave citada es ya su forma canónica',
  })

  return inv
}
