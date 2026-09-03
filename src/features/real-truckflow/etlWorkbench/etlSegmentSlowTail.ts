import { percentile } from '../../../utils/stats'
import { recordsToCsv, triggerBrowserCsvDownload } from './etlCsv'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'
import type { SegmentLeg, SegmentTimingIndex } from './etlSegmentTiming'
import { unifyPelletCircuitCode } from '../../../etl-core/reports/transileExternoCiclo'

/** Fracción más lenta exportada / resaltada (10 % superior en duración). */
export const SLOW_TAIL_FRACTION = 0.1
export const SLOW_TAIL_PERCENTILE = (1 - SLOW_TAIL_FRACTION) * 100
/** Tope de filas en CSV de lentos (más camiones no aporta lectura operativa). */
export const SLOW_TAIL_MAX_TRUCKS = 30
/** Export desde gráfica KPI: los N más lentos visibles en la vista actual. */
export const CHART_VISIBLE_SLOW_EXPORT_COUNT = 10

export function slowTailExportCount(total: number): number {
  if (total < 1) return 0
  if (total === 1) return 1
  return Math.min(SLOW_TAIL_MAX_TRUCKS, Math.max(1, Math.ceil(total * SLOW_TAIL_FRACTION)))
}

export function slowTailDurationThreshold(durations: number[]): number | null {
  const clean = durations.filter((d) => Number.isFinite(d) && d > 0)
  if (clean.length < 2) return null
  return Math.round(percentile(clean, SLOW_TAIL_PERCENTILE) * 10) / 10
}

/** Top 10 % más lentos, máximo {@link SLOW_TAIL_MAX_TRUCKS} camiones. */
export function pickSlowTailByDuration<T>(
  items: T[],
  getDuration: (item: T) => number
): T[] {
  if (!items.length) return []
  const sorted = [...items].sort((a, b) => getDuration(b) - getDuration(a))
  return sorted.slice(0, slowTailExportCount(sorted.length))
}

export function isSlowTailDuration(duration: number, threshold: number | null): boolean {
  if (threshold == null || !Number.isFinite(threshold)) return false
  return duration >= threshold
}

export function slowTailSelectionKeys<T>(
  items: T[],
  getDuration: (item: T) => number,
  getKey: (item: T) => string
): Set<string> {
  return new Set(pickSlowTailByDuration(items, getDuration).map(getKey))
}

export type SlowTailExportRow = {
  patente: string
  horario_ingreso: string
  horario_egreso: string
  duracion_minutos: number
  horario_fuente: string
  horario_fuente_inicio: string
  horario_fuente_fin: string
  journey_id: string
  producto: string
  circuito: string
  tramo: string
}

export const SLOW_TAIL_EXPORT_HEADERS = [
  'patente',
  'horario_ingreso',
  'horario_egreso',
  'duracion_minutos',
  'horario_fuente',
  'horario_fuente_inicio',
  'horario_fuente_fin',
  'journey_id',
  'producto',
  'circuito',
  'tramo',
] as const

/** Umbral mínimo de los máximos del tramo de descarga (balanza ingreso → egreso). */
export const DISCHARGE_MAX_MIN_MINUTES = 130

/**
 * Fila con horarios estrictamente de cámara Truckflow (sin inducir nada): inicio y fin
 * por cámara. Excluye salida Excel (`excel_salida`), inicio inferido
 * (`balanza_ingreso_inferido`) y rollups Excel (`excel_inferido`).
 */
export function isStrictTruckflowScatterRow(row: SegmentScatterByDayRow): boolean {
  const inicio = row.horario_fuente_inicio
  const fin = row.horario_fuente_fin
  if (inicio || fin) return inicio === 'truckflow' && fin === 'truckflow'
  return row.horario_fuente === 'truckflow'
}

export type SlowTailSelectionOptions = {
  /** Solo filas con horarios estrictamente de cámara Truckflow (sin Excel ni inferencia). */
  strictTruckflowOnly?: boolean
  /** Excluye duraciones que no superen este mínimo (min). */
  minDurationMinutes?: number
}

/** Mismo universo que la gráfica salvo que se pidan opciones (máximos estrictos). */
export function pickSlowTailScatterRows(
  rows: SegmentScatterByDayRow[],
  opts?: SlowTailSelectionOptions
): SegmentScatterByDayRow[] {
  const strict = opts?.strictTruckflowOnly ?? false
  const minDur = opts?.minDurationMinutes ?? 0
  const filtered = rows.filter(
    (r) =>
      Number.isFinite(r.duracion_minutos) &&
      r.duracion_minutos > minDur &&
      (!strict || isStrictTruckflowScatterRow(r))
  )
  return pickSlowTailByDuration(filtered, (r) => r.duracion_minutos)
}

export function scatterRowsToSlowTailExport(
  rows: SegmentScatterByDayRow[],
  opts?: SlowTailSelectionOptions
): SlowTailExportRow[] {
  return pickSlowTailScatterRows(rows, opts).map((r) => ({
    patente: r.patente,
    horario_ingreso: r.timestamp_inicio,
    horario_egreso: r.timestamp_fin,
    duracion_minutos: r.duracion_minutos,
    horario_fuente: r.horario_fuente || 'truckflow',
    horario_fuente_inicio: r.horario_fuente_inicio || '',
    horario_fuente_fin: r.horario_fuente_fin || '',
    journey_id: r.journey_id,
    producto: r.producto,
    circuito: r.circuito,
    tramo: r.tramo_operativo,
  }))
}

export function legsToSlowTailExport(
  legs: SegmentLeg[],
  circuitCode: string,
  tramoLabel: string
): SlowTailExportRow[] {
  return pickSlowTailByDuration(legs, (l) => l.durationMinutes).map((l) => ({
    patente: l.plate,
    horario_ingreso: '',
    horario_egreso: '',
    duracion_minutos: Math.round(l.durationMinutes * 10) / 10,
    horario_fuente: 'sin_timestamp',
    horario_fuente_inicio: '',
    horario_fuente_fin: '',
    journey_id: l.journeyId,
    producto: '',
    circuito: circuitCode,
    tramo: tramoLabel,
  }))
}

export function slowTailExportCsv(exportRows: SlowTailExportRow[]): string {
  return recordsToCsv([...SLOW_TAIL_EXPORT_HEADERS], exportRows as unknown as Record<string, unknown>[])
}

export function downloadSlowTailCsv(filename: string, rows: SlowTailExportRow[]): void {
  if (!rows.length) return
  triggerBrowserCsvDownload(filename, slowTailExportCsv(rows))
}

export type ChartVisibleExportRow = {
  patente: string
  fecha_tramo: string
  hora_inicio: string
  horario_ingreso: string
  horario_egreso: string
  duracion_minutos: number
}

export const CHART_VISIBLE_EXPORT_HEADERS = [
  'patente',
  'fecha_tramo',
  'hora_inicio',
  'horario_ingreso',
  'horario_egreso',
  'duracion_minutos',
] as const

/** Los N camiones con mayor duración entre los que se ven en la gráfica (misma vista/filtros). */
export function pickTopDurationFromChartView<T>(
  items: T[],
  getDuration: (item: T) => number,
  limit = CHART_VISIBLE_SLOW_EXPORT_COUNT
): T[] {
  if (!items.length) return []
  const sorted = [...items].sort((a, b) => getDuration(b) - getDuration(a))
  return sorted.slice(0, Math.min(limit, sorted.length))
}

export function scatterRowsToChartVisibleExport(
  rows: SegmentScatterByDayRow[],
  limit = CHART_VISIBLE_SLOW_EXPORT_COUNT
): ChartVisibleExportRow[] {
  return pickTopDurationFromChartView(rows, (r) => r.duracion_minutos, limit).map((r) => ({
    patente: r.patente,
    fecha_tramo: r.fecha_tramo,
    hora_inicio: r.hora_inicio,
    horario_ingreso: r.timestamp_inicio,
    horario_egreso: r.timestamp_fin,
    duracion_minutos: Math.round(r.duracion_minutos * 10) / 10,
  }))
}

export function chartVisibleExportCsv(exportRows: ChartVisibleExportRow[]): string {
  return recordsToCsv(
    [...CHART_VISIBLE_EXPORT_HEADERS],
    exportRows as unknown as Record<string, unknown>[]
  )
}

export function downloadChartVisibleCsv(filename: string, rows: ChartVisibleExportRow[]): void {
  if (!rows.length) return
  triggerBrowserCsvDownload(filename, chartVisibleExportCsv(rows))
}

export function legsToChartVisibleExport(
  legs: SegmentLeg[],
  limit = CHART_VISIBLE_SLOW_EXPORT_COUNT
): ChartVisibleExportRow[] {
  return pickTopDurationFromChartView(legs, (l) => l.durationMinutes, limit).map((l) => ({
    patente: l.plate,
    fecha_tramo: '',
    hora_inicio: '',
    horario_ingreso: '',
    horario_egreso: '',
    duracion_minutos: Math.round(l.durationMinutes * 10) / 10,
  }))
}

export function legsForAggregate(
  index: Pick<SegmentTimingIndex, 'legs'>,
  circuitCode: string,
  fromCode: string,
  toCode: string
): SegmentLeg[] {
  // El pellet se muestra con código unificado (R30/31/32, R13/14/15) pero sus legs llevan el
  // subcódigo por celda (R30/R31/R32…). Comparar con `unifyPelletCircuitCode` para que la
  // vista unificada encuentre sus legs (sin esto la ficha del pellet no filtraba por día).
  const wanted = unifyPelletCircuitCode(circuitCode)
  return index.legs.filter(
    (l) =>
      unifyPelletCircuitCode(l.executiveCircuitCode) === wanted &&
      l.fromCode === fromCode &&
      l.toCode === toCode
  )
}
