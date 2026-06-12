import { percentile } from '../../../utils/stats'
import { recordsToCsv, triggerBrowserCsvDownload } from './etlCsv'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'
import type { SegmentLeg, SegmentTimingIndex } from './etlSegmentTiming'

/** Fracción más lenta exportada / resaltada (10 % superior en duración). */
export const SLOW_TAIL_FRACTION = 0.1
export const SLOW_TAIL_PERCENTILE = (1 - SLOW_TAIL_FRACTION) * 100
/** Tope de filas en CSV de lentos (más camiones no aporta lectura operativa). */
export const SLOW_TAIL_MAX_TRUCKS = 30

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
  'journey_id',
  'producto',
  'circuito',
  'tramo',
] as const

export function pickSlowTailScatterRows(rows: SegmentScatterByDayRow[]): SegmentScatterByDayRow[] {
  return pickSlowTailByDuration(rows, (r) => r.duracion_minutos)
}

export function scatterRowsToSlowTailExport(rows: SegmentScatterByDayRow[]): SlowTailExportRow[] {
  return pickSlowTailScatterRows(rows).map((r) => ({
    patente: r.patente,
    horario_ingreso: r.timestamp_inicio,
    horario_egreso: r.timestamp_fin,
    duracion_minutos: r.duracion_minutos,
    horario_fuente: r.horario_fuente || 'truckflow',
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

export function legsForAggregate(
  index: Pick<SegmentTimingIndex, 'legs'>,
  circuitCode: string,
  fromCode: string,
  toCode: string
): SegmentLeg[] {
  return index.legs.filter(
    (l) =>
      l.executiveCircuitCode === circuitCode && l.fromCode === fromCode && l.toCode === toCode
  )
}
