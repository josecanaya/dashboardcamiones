/**
 * Nivel C — el nodo fuerte del modelo.
 *
 * C = movimiento del Excel de contrato (nivel A) cruzado con lo que vieron las
 * cámaras (nivel B). Se parte en dos tablas, nunca en una con bandera:
 *   C_operaciones_con_camara  → el movimiento tiene evidencia de cámara
 *   C_operaciones_sin_camara  → no la tiene, con el motivo a la vista
 * Esconder los sin-cámara dentro de la misma tabla fue una fuente real de
 * conteos inflados; separarlos obliga a decir el denominador.
 *
 * TIEMPOS (regla de negocio, decidida 2026-08-03): los tiempos los da
 * TRUCKFLOW. El Excel es sólo respaldo cuando falta cobertura de cámara. Cada
 * fila declara en `time_source` de dónde salió cada extremo, así que la mezcla
 * es auditable y nadie tiene que adivinar si un promedio comparó peras con
 * manzanas.
 */

import {
  buildJourneyKeyIndex,
  canonicalJourneyKey,
  parseUidList,
  resolveJourneyKeys,
  shortUid,
  type JourneyKeyIndex,
} from './journeyKey'

export type Row = Record<string, unknown>

/** De dónde salieron los extremos temporales de la operación. */
export type TimeSource =
  /** Ambos extremos los dio la cámara. Es el caso bueno. */
  | 'CAMARA'
  /** Un extremo de cámara, el otro del Excel por falta de cobertura. */
  | 'CAMARA_PARCIAL_EXCEL'
  /** Sin cobertura de cámara utilizable: ambos extremos del Excel. */
  | 'EXCEL_RESPALDO'
  /** Ni cámara ni Excel tienen horas válidas. */
  | 'SIN_TIEMPO'

/** Ventana temporal observada por cámara para un journey. */
export type JourneyTimes = {
  readonly inicio: string
  readonly fin: string
}

export type LevelCInput = {
  /** Filas del Excel de contrato enriquecidas (excel_operations_with_truckflow). */
  readonly excelRows: readonly Row[]
  /** Journeys disponibles para religar: final_circuits + pool limpio. */
  readonly journeyUids: readonly string[]
  /** Horas por journey_uid crudo o fusionado (de clean_journeys_for_analysis). */
  readonly journeyTimes: ReadonlyMap<string, JourneyTimes>
}

export type LevelCOutput = {
  readonly conCamara: Row[]
  readonly sinCamara: Row[]
  readonly index: JourneyKeyIndex
  /** Llaves de journey que C cita — es el universo del nivel D. */
  readonly citedKeys: Set<string>
  /** Prefijos citados que ningún journey respalda. Se reportan, no se tapan. */
  readonly huerfanas: Set<string>
  readonly stats: LevelCStats
}

export type LevelCStats = {
  readonly excelTotal: number
  readonly conCamara: number
  readonly sinCamara: number
  readonly porTimeSource: Record<TimeSource, number>
  readonly citedKeys: number
  readonly huerfanas: number
  /** Operaciones cuyo uid citado cayó en más de una vuelta y se desempató por tiempo. */
  readonly ambiguas: number
}

const str = (v: unknown): string => String(v ?? '').trim()

const parseMs = (v: unknown): number => {
  const t = Date.parse(str(v))
  return Number.isFinite(t) ? t : NaN
}

const isValidTime = (v: unknown): boolean => !Number.isNaN(parseMs(v))

const minutesBetween = (a: unknown, b: unknown): number | '' => {
  const t0 = parseMs(a)
  const t1 = parseMs(b)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return ''
  return Math.round((t1 - t0) / 60000)
}

/**
 * Solape en minutos entre dos ventanas temporales. Negativo/0 = no se tocan.
 */
function solapeMin(
  a: { inicio: string; fin: string },
  b: { inicio: unknown; fin: unknown }
): number {
  const a0 = parseMs(a.inicio)
  const a1 = parseMs(a.fin)
  const b0 = parseMs(b.inicio)
  const b1 = parseMs(b.fin)
  if (![a0, a1, b0, b1].every(Number.isFinite)) return 0
  return (Math.min(a1, b1) - Math.max(a0, b0)) / 60000
}

/**
 * Desempata cuando un uid citado por el Excel corresponde a varias vueltas del
 * mismo camión (`__cycle_N`). Elige la vuelta que más se solapa con la ventana
 * de la operación; sin horas de Excel, la más temprana. Tomar todas inflaría
 * la duración a la suma del día entero, que es el error que esto evita.
 */
function elegirVuelta(
  candidatas: readonly string[],
  timesByKey: ReadonlyMap<string, JourneyTimes>,
  ventanaExcel: { inicio: unknown; fin: unknown }
): string {
  if (candidatas.length <= 1) return candidatas[0] ?? ''
  let mejor = ''
  let mejorSolape = -Infinity
  let masTemprana = ''
  let masTempranaMs = Infinity
  for (const k of candidatas) {
    const t = timesByKey.get(k)
    if (!t) continue
    const ms = parseMs(t.inicio)
    if (Number.isFinite(ms) && ms < masTempranaMs) {
      masTempranaMs = ms
      masTemprana = k
    }
    const s = solapeMin(t, { inicio: ventanaExcel.inicio, fin: ventanaExcel.fin })
    if (s > mejorSolape) {
      mejorSolape = s
      mejor = k
    }
  }
  if (mejorSolape > 0 && mejor) return mejor
  return masTemprana || candidatas[0]!
}

/**
 * Extremos de cámara de una operación: el journey más temprano y el más tardío
 * de los que cita. Una operación puede tocar varios journeys (ida y vuelta).
 */
function cameraSpan(
  keys: readonly string[],
  timesByKey: ReadonlyMap<string, JourneyTimes>
): { inicio: string; fin: string } {
  let inicio = ''
  let fin = ''
  for (const k of keys) {
    const t = timesByKey.get(k)
    if (!t) continue
    if (isValidTime(t.inicio) && (!inicio || parseMs(t.inicio) < parseMs(inicio))) inicio = t.inicio
    if (isValidTime(t.fin) && (!fin || parseMs(t.fin) > parseMs(fin))) fin = t.fin
  }
  return { inicio, fin }
}

/**
 * Resuelve los tiempos de la operación: cámara primero, Excel de respaldo.
 * Nunca mezcla en silencio — el resultado dice qué fuente alimentó cada extremo.
 */
export function resolveOperationTimes(
  camera: { inicio: string; fin: string },
  excel: { ingreso: unknown; salida: unknown }
): {
  inicio_at: string
  fin_at: string
  total_min: number | ''
  time_source: TimeSource
  inicio_source: 'CAMARA' | 'EXCEL' | ''
  fin_source: 'CAMARA' | 'EXCEL' | ''
} {
  const camIn = isValidTime(camera.inicio) ? camera.inicio : ''
  const camOut = isValidTime(camera.fin) ? camera.fin : ''
  const exIn = isValidTime(excel.ingreso) ? str(excel.ingreso) : ''
  const exOut = isValidTime(excel.salida) ? str(excel.salida) : ''

  const inicio_at = camIn || exIn
  const fin_at = camOut || exOut
  const inicio_source = camIn ? 'CAMARA' : exIn ? 'EXCEL' : ''
  const fin_source = camOut ? 'CAMARA' : exOut ? 'EXCEL' : ''

  let time_source: TimeSource
  if (camIn && camOut) time_source = 'CAMARA'
  else if (camIn || camOut) time_source = inicio_at && fin_at ? 'CAMARA_PARCIAL_EXCEL' : 'SIN_TIEMPO'
  else if (exIn && exOut) time_source = 'EXCEL_RESPALDO'
  else time_source = 'SIN_TIEMPO'

  return {
    inicio_at,
    fin_at,
    total_min: minutesBetween(inicio_at, fin_at),
    time_source,
    inicio_source: inicio_source as 'CAMARA' | 'EXCEL' | '',
    fin_source: fin_source as 'CAMARA' | 'EXCEL' | '',
  }
}

/**
 * Columnas de negocio que C arrastra del Excel. C es el nodo fuerte: quien
 * consulta C no debería tener que volver al nivel A nunca.
 */
const COLUMNAS_NEGOCIO = [
  'external_operation_id',
  'source_date',
  'plate_normalized',
  'product_normalized',
  'producto_original',
  'platform_normalized',
  'plataforma_original',
  'planta_normalized',
  'movement_type',
  'movement_type_detail',
  'contrato',
  'comprob',
  'cp_remito',
  'ctg',
  'cupo',
  'kgs_neto',
  'resolved_product',
  'resolved_platform',
  'resolved_circuit_family',
  'resolved_executive_circuit_code',
  'resolved_operational_point',
  'resolved_plant_hint',
  'resolution_source',
  'match_quality',
  'route_quality',
  'observaciones',
] as const

/** Horas crudas del Excel, conservadas aunque manden las de cámara (auditoría). */
const COLUMNAS_TIEMPO_EXCEL = [
  'external_ingreso_at',
  'external_calado_at',
  'external_salida_at',
  'external_sl_balanza_entrada_at',
  'external_sl_balanza_salida_at',
] as const

export const LEVEL_C_HEADERS: readonly string[] = [
  'journey_key',
  'journey_keys',
  'journey_count',
  'inicio_at',
  'fin_at',
  'total_min',
  'time_source',
  'inicio_source',
  'fin_source',
  ...COLUMNAS_NEGOCIO,
  ...COLUMNAS_TIEMPO_EXCEL,
  'evidence_count',
  'no_truckflow_reason',
  'journey_keys_huerfanas',
  'journey_uids_ambiguos',
]

function proyectar(src: Row, extra: Row): Row {
  const out: Row = { ...extra }
  for (const c of [...COLUMNAS_NEGOCIO, ...COLUMNAS_TIEMPO_EXCEL]) out[c] = src[c] ?? ''
  out.evidence_count = src.evidence_count ?? ''
  out.no_truckflow_reason = src.no_truckflow_reason ?? ''
  return out
}

export function buildLevelC(input: LevelCInput): LevelCOutput {
  const index = buildJourneyKeyIndex(input.journeyUids)

  // Horas re-indexadas por llave canónica (llegan por uid crudo).
  const timesByKey = new Map<string, JourneyTimes>()
  for (const [uid, t] of input.journeyTimes) {
    const key = canonicalJourneyKey(uid)
    if (!key) continue
    const prev = timesByKey.get(key)
    if (!prev) {
      timesByKey.set(key, t)
      continue
    }
    // Un journey fusionado hereda el span de todas sus partes.
    timesByKey.set(key, {
      inicio:
        isValidTime(t.inicio) && (!isValidTime(prev.inicio) || parseMs(t.inicio) < parseMs(prev.inicio))
          ? t.inicio
          : prev.inicio,
      fin:
        isValidTime(t.fin) && (!isValidTime(prev.fin) || parseMs(t.fin) > parseMs(prev.fin))
          ? t.fin
          : prev.fin,
    })
  }

  const conCamara: Row[] = []
  const sinCamara: Row[] = []
  const citedKeys = new Set<string>()
  const huerfanas = new Set<string>()
  let ambiguasTotal = 0
  const porTimeSource: Record<TimeSource, number> = {
    CAMARA: 0,
    CAMARA_PARCIAL_EXCEL: 0,
    EXCEL_RESPALDO: 0,
    SIN_TIEMPO: 0,
  }

  const ventana = (src: Row) => ({ inicio: src.external_ingreso_at, fin: src.external_salida_at })

  for (const src of input.excelRows) {
    const citadas = parseUidList(src.matched_journey_uids)
    // Una llave por uid citado: si el journey se partió en vueltas, se elige
    // la que corresponde a ESTA operación, no todas.
    const resueltas: string[] = []
    const huerf: string[] = []
    const ambiguas: string[] = []
    for (const uid of citadas) {
      const candidatas = resolveJourneyKeys(uid, index)
      if (!candidatas.length) {
        huerf.push(shortUid(uid))
        continue
      }
      if (candidatas.length > 1) ambiguas.push(shortUid(uid))
      const elegida = elegirVuelta(candidatas, timesByKey, ventana(src))
      if (elegida && !resueltas.includes(elegida)) resueltas.push(elegida)
    }
    for (const h of huerf) huerfanas.add(h)
    if (ambiguas.length) ambiguasTotal++

    const tieneEvidencia = resueltas.length > 0
    const camera = tieneEvidencia ? cameraSpan(resueltas, timesByKey) : { inicio: '', fin: '' }
    const tiempos = resolveOperationTimes(camera, {
      ingreso: src.external_ingreso_at,
      salida: src.external_salida_at,
    })

    const fila = proyectar(src, {
      journey_key: resueltas[0] ?? '',
      journey_keys: resueltas.join(';'),
      journey_count: resueltas.length,
      ...tiempos,
      journey_keys_huerfanas: huerf.join(';'),
      journey_uids_ambiguos: ambiguas.join(';'),
    })

    if (tieneEvidencia) {
      for (const k of resueltas) citedKeys.add(k)
      porTimeSource[tiempos.time_source]++
      conCamara.push(fila)
    } else {
      // Sin evidencia religable. Si citaba uids que no existen, el motivo es
      // ese y no "nunca se vio la patente": queda dicho en la fila.
      if (citadas.length && !fila.no_truckflow_reason) {
        fila.no_truckflow_reason = 'CITA_JOURNEYS_INEXISTENTES'
      }
      sinCamara.push(fila)
    }
  }

  return {
    conCamara,
    sinCamara,
    index,
    citedKeys,
    huerfanas,
    stats: {
      excelTotal: input.excelRows.length,
      conCamara: conCamara.length,
      sinCamara: sinCamara.length,
      porTimeSource,
      citedKeys: citedKeys.size,
      huerfanas: huerfanas.size,
      ambiguas: ambiguasTotal,
    },
  }
}
