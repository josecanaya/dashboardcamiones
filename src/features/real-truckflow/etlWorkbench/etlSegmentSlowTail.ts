import { percentile } from '../../../utils/stats'
import { recordsToCsv, triggerBrowserCsvDownload } from './etlCsv'
import type { SegmentScatterByDayRow } from './etlSegmentScatterByDay'
import type { SegmentLeg, SegmentTimingIndex } from './etlSegmentTiming'

/** Fracción más lenta de la cola (20 % superior en duración). */
export const SLOW_TAIL_FRACTION = 0.2
export const SLOW_TAIL_PERCENTILE = (1 - SLOW_TAIL_FRACTION) * 100

export function slowTailDurationThreshold(durations: number[]): number | null {
  const clean = durations.filter((d) => Number.isFinite(d) && d > 0)
  if (clean.length < 2) return null
  return Math.round(percentile(clean, SLOW_TAIL_PERCENTILE) * 10) / 10
}

export function isSlowTailDuration(duration: number, threshold: number | null): boolean {
  if (threshold == null || !Number.isFinite(threshold)) return false
  return duration >= threshold
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
  if (!rows.length) return []
  const th = slowTailDurationThreshold(rows.map((r) => r.duracion_minutos))
  if (th == null) {
    const max = rows.reduce((a, b) => (a.duracion_minutos >= b.duracion_minutos ? a : b))
    return [max]
  }
  return rows
    .filter((r) => r.duracion_minutos >= th)
    .sort((a, b) => b.duracion_minutos - a.duracion_minutos)
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
  if (!legs.length) return []
  const th = slowTailDurationThreshold(legs.map((l) => l.durationMinutes))
  const picked =
    th == null ? [...legs]
    : legs.filter((l) => l.durationMinutes >= th)
  return picked
    .sort((a, b) => b.durationMinutes - a.durationMinutes)
    .map((l) => ({
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
