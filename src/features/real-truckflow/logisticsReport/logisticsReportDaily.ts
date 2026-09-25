/**
 * Bloques propios del informe DIARIO, que el paquete semanal no trae.
 *
 * El diario reutiliza `buildLogisticsReportPackage` para un período de un día (actividad,
 * tiempos, muestra por circuito: mismas reglas y tablas que el semanal). Esto agrega lo que
 * el semanal no publica:
 *
 * - **Movimientos del Excel del día** (`excel_operations_with_truckflow`, por `source_date`,
 *   el archivo del día). Es el denominador «movimientos según Excel», distinto de los
 *   «recorridos de cámara clasificados» del bloque ejecutivo.
 * - **Anomalías de comportamiento** (`debug_matrix_classification.anomaly_kind = BEHAVIORAL`),
 *   con el código de regla de `goldenRulesCatalog` (el mismo del panel /seguridad). Las
 *   `DATA_COVERAGE` son cobertura de cámara, no conducta, y no cuentan.
 * - **Demorados** de los tramos con umbral (`SEGMENT_DEMORA_THRESHOLD_MINUTES`): los legs que
 *   el KPI de tiempos deja afuera y el dashboard lista aparte.
 *
 * Día: anomalías y demorados usan el **día operativo 22:00** (`operationalDayOfIso`), igual
 * que el bloque ejecutivo y los tiempos del paquete.
 */
import { operationalDayOfIso, buildJourneyOperationalDayMap } from '../etlWorkbench/etlOperationalDay'
import {
  demoraThresholdForTransition,
  isDemoraLegDuration,
  SEGMENT_DEMORA_THRESHOLD_MINUTES,
} from '../etlWorkbench/etlSegmentTimingRules'
import { EXECUTIVE_SAMPLE_PRODUCTS, productMatchesExecutiveSampleFilter } from '../etlWorkbench/etlProductFilter'
import { isExcludedExcelPlate } from '../etlWorkbench/excludedExcelPlates'
import { normalizePlate } from '../../../etl-core/domain/argentinaPlate'
import { GOLDEN_BY_REASON, R2_SUBGROUP_BY_REASON, parentRuleReason } from '../tabs/goldenRulesCatalog'

type Row = Record<string, unknown>
type Tables = Record<string, { rows?: Row[] } | undefined>

export type DailyInput = {
  tables: Tables
  csv: Record<string, string | undefined>
  /** Patentes de servicio del registro (agua, comida, prestadores): fuera de anomalías. */
  excludedPlates?: ReadonlySet<string>
}

export type DailyMovimientos = {
  total: number
  ingresos: number
  /** Egresos y despachos. */
  egresos: number
  /** Kilos netos del Excel del día. */
  kgNetos: number
  /** SOJA / GIRASOL / MAIZ / ACEITE / PELLET / OTROS: camiones y kilos. */
  porProducto: Record<string, number>
  kgPorProducto: Record<string, number>
  /** Planta del Excel (RICARDONE, TERMINAL_EMBARQUE…). */
  porPlanta: Record<string, number>
  /** Plataforma declarada (descarga/carga); sin plataforma no cuenta. */
  porPlataforma: Record<string, number>
  /** Camiones por hora (0–23, reloj de planta) de ingreso y de salida, solo si caen en el día. */
  ingresosPorHora: number[]
  salidasPorHora: number[]
  missing: boolean
}

export type DailyAnomalyCase = {
  plate: string
  code: string
  title: string
  reason: string
  circuito: string
  inicio: string
  secuencia: string
}

export type DailyAnomalias = {
  total: number
  porRegla: { code: string; title: string; count: number }[]
  casos: DailyAnomalyCase[]
  /** Casos descartados por ser patentes de servicio del registro. */
  excluidasRegistro: number
}

export type DailyDemoraTramo = {
  tramo: string
  umbralMin: number
  casos: { plate: string; circuito: string; minutos: number }[]
}

export type DailyExtras = {
  dia: string
  movimientos: DailyMovimientos
  anomalias: DailyAnomalias
  demorados: DailyDemoraTramo[]
}

const str = (v: unknown) => String(v ?? '').trim()

export function productGroupOf(product: string): string {
  for (const p of EXECUTIVE_SAMPLE_PRODUCTS) if (productMatchesExecutiveSampleFilter(product, p)) return p
  // El maíz tiene volumen propio (Avellaneda): va aparte de «otros». Los subproductos no.
  if (/^MA[IÍ]Z\b/i.test(product.trim())) return 'MAIZ'
  return 'OTROS'
}

/** Hora (0–23) de un timestamp del Excel si cae en el día; si no, null. */
function horaEnDia(iso: string, dia: string): number | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})/)
  return m && m[1] === dia ? Number(m[2]) : null
}

export function buildDailyMovimientos(rows: Row[] | undefined, dia: string): DailyMovimientos {
  const out: DailyMovimientos = {
    total: 0,
    ingresos: 0,
    egresos: 0,
    kgNetos: 0,
    porProducto: {},
    kgPorProducto: {},
    porPlanta: {},
    porPlataforma: {},
    ingresosPorHora: Array(24).fill(0),
    salidasPorHora: Array(24).fill(0),
    missing: !rows?.length,
  }
  const sumar = (m: Record<string, number>, k: string, v = 1) => {
    if (k) m[k] = (m[k] ?? 0) + v
  }
  for (const r of rows ?? []) {
    if (str(r.source_date) !== dia) continue
    if (isExcludedExcelPlate(str(r.plate_normalized))) continue
    out.total++
    const tipo = str(r.movement_type).toUpperCase()
    if (tipo === 'INGRESO') out.ingresos++
    else if (tipo === 'EGRESO' || tipo === 'DESPACHO') out.egresos++
    const kg = Number(str(r.kgs_neto)) || 0
    out.kgNetos += kg
    const g = productGroupOf(str(r.resolved_product) || str(r.product_normalized))
    sumar(out.porProducto, g)
    sumar(out.kgPorProducto, g, kg)
    sumar(out.porPlanta, str(r.planta_normalized))
    sumar(out.porPlataforma, str(r.platform_normalized))
    const hi = horaEnDia(str(r.external_ingreso_at), dia)
    if (hi !== null) out.ingresosPorHora[hi]++
    const hs = horaEnDia(str(r.external_salida_at), dia)
    if (hs !== null) out.salidasPorHora[hs]++
  }
  return out
}

export function buildDailyAnomalias(
  rows: Row[] | undefined,
  dia: string,
  excludedPlates: ReadonlySet<string> = new Set()
): DailyAnomalias {
  const vistos = new Set<string>()
  const casos: DailyAnomalyCase[] = []
  let excluidasRegistro = 0
  for (const r of rows ?? []) {
    if (str(r.anomaly_kind) !== 'BEHAVIORAL') continue
    const reason = str(r.anomaly_kind_reason)
    if (!reason) continue
    if (operationalDayOfIso(str(r.first_event_at)) !== dia) continue
    const plate = normalizePlate(str(r.plate))
    if (excludedPlates.has(plate)) {
      excluidasRegistro++
      continue
    }
    const circuito = str(r.executive_circuit_code)
    // R6 es regla del circuito de grano R7 (el panel /seguridad filtra igual: aceite/R8 fuera).
    if (reason === 'RIC_SL_MAS30M_SIN_CALADA_SL' && circuito !== 'R7') continue
    // Una tarjeta por patente y regla: los ciclos de un mismo camión no se cuentan dos veces.
    const clave = `${plate}|${reason}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    const sub = R2_SUBGROUP_BY_REASON.get(reason)
    const regla = GOLDEN_BY_REASON.get(parentRuleReason(reason))
    casos.push({
      plate,
      code: sub?.code ?? regla?.code ?? '?',
      title: sub ? `${regla?.title ?? 'R2'} · ${sub.title}` : (regla?.title ?? reason),
      reason,
      circuito,
      inicio: str(r.first_event_at),
      secuencia: str(r.detected_sequence),
    })
  }
  casos.sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }) || a.inicio.localeCompare(b.inicio))
  const porCodigo = new Map<string, { code: string; title: string; count: number }>()
  for (const c of casos) {
    const code = c.code.replace(/-[a-z]$/, '')
    const title = GOLDEN_BY_REASON.get(parentRuleReason(c.reason))?.title ?? c.title
    const g = porCodigo.get(code) ?? { code, title, count: 0 }
    g.count++
    porCodigo.set(code, g)
  }
  return {
    total: casos.length,
    porRegla: [...porCodigo.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    casos,
    excluidasRegistro,
  }
}

export function buildDailyDemorados(
  legs: Row[] | undefined,
  dayOf: ReadonlyMap<string, string>,
  dia: string
): DailyDemoraTramo[] {
  const porTramo = new Map<string, DailyDemoraTramo>()
  for (const tramo of Object.keys(SEGMENT_DEMORA_THRESHOLD_MINUTES)) {
    const [from, to] = tramo.split('→')
    porTramo.set(tramo, { tramo, umbralMin: demoraThresholdForTransition(from, to) ?? 0, casos: [] })
  }
  for (const r of legs ?? []) {
    const from = str(r.from_logical)
    const to = str(r.to_logical)
    const g = porTramo.get(`${from}→${to}`)
    if (!g) continue
    const minutos = Number(str(r.duration_min))
    if (!isDemoraLegDuration(minutos, from, to)) continue
    if (dayOf.get(str(r.journey_id)) !== dia) continue
    g.casos.push({ plate: normalizePlate(str(r.plate)), circuito: str(r.executive_circuit_code), minutos: Math.round(minutos) })
  }
  for (const g of porTramo.values()) g.casos.sort((a, b) => b.minutos - a.minutos)
  return [...porTramo.values()]
}

export function buildDailyExtras(input: DailyInput, dia: string): DailyExtras {
  const dayOf = buildJourneyOperationalDayMap({
    circuitTimingJourneysCsv: input.csv.circuit_timing_journeys,
    excelOperationsCsv: input.csv.excel_operations_with_truckflow,
  })
  return {
    dia,
    movimientos: buildDailyMovimientos(input.tables.excel_operations_with_truckflow?.rows, dia),
    anomalias: buildDailyAnomalias(input.tables.debug_matrix_classification?.rows, dia, input.excludedPlates),
    demorados: buildDailyDemorados(input.tables.segment_timing_legs?.rows, dayOf, dia),
  }
}
