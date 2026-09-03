import type { EtlTransformOutput } from './etlTransformContracts'
import type { SegmentLeg } from './etlTimelinePrimitives'
import {
  rebuildSegmentTimingIndexFromLegs,
  segmentTimingKpiCsv,
  segmentTimingLegsCsv,
} from './etlSegmentTiming'

type RunTable = { headers: string[]; rows: Record<string, unknown>[] }

/**
 * Composición de corridas guardadas para un rango arbitrario, SIN reprocesar.
 *
 * Cada corrida (`runs/windows/<from>_<to>/`) ya trae las tablas materializadas. Para
 * un rango que abarca varias corridas se concatenan las filas y se **re-agrega** el
 * KPI de tiempos desde los `segment_timing_legs` persistidos (mismo agregador que el
 * Transform, así los promedios/percentiles quedan idénticos, no concatenados).
 *
 * Limitación conocida: los legs persistidos no llevan fecha, así que el KPI compuesto
 * es a nivel corrida-entera. El filtrado fino por día aplica solo a tablas que sí
 * traen una columna de día/fecha (ver `filterRowsByDay`).
 */

/** Columnas candidatas a "día" para filtrar filas a un rango exacto. */
const DAY_COLUMN_CANDIDATES = ['day', 'dia', 'fecha', 'date', 'source_date', 'partition_day']

function pickDayColumn(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase())
  for (const cand of DAY_COLUMN_CANDIDATES) {
    const i = lower.indexOf(cand)
    if (i >= 0) return headers[i]
  }
  return null
}

/** Extrae el YYYY-MM-DD de un valor de celda (acepta ISO datetime o fecha suelta). */
function toDayIso(value: unknown): string | null {
  const s = String(value ?? '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** Deja solo las filas cuyo día cae en [from,to]. Si no hay columna de día, no filtra. */
function filterRowsByDay(table: RunTable, from: string, to: string): Record<string, unknown>[] {
  const col = pickDayColumn(table.headers)
  if (!col) return table.rows
  return table.rows.filter((r) => {
    const d = toDayIso(r[col])
    return d == null || (d >= from && d <= to)
  })
}

/** Parsea las filas persistidas de `segment_timing_legs` de vuelta a `SegmentLeg[]`. */
export function persistedLegRowsToSegmentLegs(rows: Record<string, unknown>[]): SegmentLeg[] {
  return rows
    .map((r): SegmentLeg => ({
      journeyId: String(r.journey_id ?? ''),
      plate: String(r.plate ?? ''),
      executiveCircuitCode: String(r.executive_circuit_code ?? ''),
      fromCode: String(r.from_logical ?? ''),
      toCode: String(r.to_logical ?? ''),
      durationMinutes: Number(r.duration_min ?? r.duration_minutes ?? NaN),
    }))
    .filter((l) => l.executiveCircuitCode && l.fromCode && l.toCode && Number.isFinite(l.durationMinutes))
}

function serializeCsv(headers: string[], rows: Record<string, unknown>[]): string {
  if (!headers.length) return ''
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','))
  return lines.join('\n')
}

/** Unión ordenada de headers preservando el orden de aparición. */
function unionHeaders(tables: RunTable[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tables) {
    for (const h of t.headers) {
      if (!seen.has(h)) {
        seen.add(h)
        out.push(h)
      }
    }
  }
  return out
}

export type ComposeRunsResult = {
  output: EtlTransformOutput
  /** Corridas efectivamente combinadas (runId). */
  usedRunIds: string[]
  /** Total de legs de KPI tras la composición. */
  composedLegCount: number
  /** Filas de resumen KPI re-agregadas. */
  kpiRowCount: number
}

/**
 * Combina varias corridas materializadas en un único `EtlTransformOutput` para el
 * rango [from,to]. Concatena las filas de cada tabla (filtrando por día donde exista
 * columna) y re-agrega el KPI de tiempos desde los legs.
 */
export function composeRunsIntoTransformOutput(
  runs: { runId: string; output: EtlTransformOutput }[],
  from: string,
  to: string
): ComposeRunsResult {
  const tableNames = new Set<string>()
  for (const { output } of runs) {
    for (const name of Object.keys(output.tables ?? {})) tableNames.add(name)
  }

  const mergedTables: Record<string, RunTable> = {}
  for (const name of tableNames) {
    const parts: RunTable[] = []
    for (const { output } of runs) {
      const t = (output.tables as Record<string, RunTable> | undefined)?.[name]
      if (t && Array.isArray(t.rows)) parts.push({ headers: t.headers ?? [], rows: filterRowsByDay(t, from, to) })
    }
    if (!parts.length) continue
    mergedTables[name] = {
      headers: unionHeaders(parts),
      rows: parts.flatMap((p) => p.rows),
    }
  }

  // Re-agregación del KPI de tiempos desde los legs compuestos (idéntico al Transform).
  const legRows = mergedTables['segment_timing_legs']?.rows ?? []
  const legs = persistedLegRowsToSegmentLegs(legRows)
  const index = rebuildSegmentTimingIndexFromLegs(legs)
  const kpiCsv = segmentTimingKpiCsv(index)
  const legsCsv = segmentTimingLegsCsv(index)

  // Serializa todas las tablas concatenadas a CSV.
  const csv: Record<string, string> = {}
  for (const [name, t] of Object.entries(mergedTables)) {
    csv[name] = serializeCsv(t.headers, t.rows)
  }
  // El KPI y sus legs se sobreescriben con la versión re-agregada (no la concatenada).
  csv['segment_timing_kpi'] = kpiCsv
  csv['segment_timing_legs'] = legsCsv

  const rulesVersion = runs[0]?.output.rulesVersion ?? ('' as EtlTransformOutput['rulesVersion'])
  const stats = {
    ...(runs[0]?.output.stats ?? {}),
    // Los gráficos del KPI leen `stats.segmentTiming` (no el CSV): hay que reemplazarlo
    // por el índice re-agregado del rango, no dejar el de la primera corrida.
    segmentTiming: index,
    kpiTiemposBuilt: true,
    composedFrom: runs.map((r) => r.runId),
    composedRange: { from, to },
  } as unknown as EtlTransformOutput['stats']

  return {
    output: {
      csv,
      tables: mergedTables as unknown as EtlTransformOutput['tables'],
      stats,
      rulesVersion,
    },
    usedRunIds: runs.map((r) => r.runId),
    composedLegCount: legs.length,
    kpiRowCount: index.aggregates.filter((a) => a.stats.count > 0).length,
  }
}

export type RangeCoverage = {
  /** Días del rango cubiertos por alguna corrida guardada. */
  coveredDays: string[]
  /** Días del rango sin corrida guardada (habría que procesarlos). */
  missingDays: string[]
  /** Corridas guardadas que solapan el rango, por runId. */
  coveringRuns: { runId: string; from: string; to: string }[]
}

/** Enumera los días YYYY-MM-DD entre from y to inclusive. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Dado el rango pedido y las ventanas guardadas, calcula qué días quedan cubiertos
 * y cuáles faltan, y qué corridas hay que combinar.
 */
export function computeRangeCoverage(
  from: string,
  to: string,
  savedWindows: { from: string; to: string; runId: string }[]
): RangeCoverage {
  const days = enumerateDays(from, to)
  const covered = new Set<string>()
  const coveringRuns: { runId: string; from: string; to: string }[] = []
  for (const w of savedWindows) {
    const overlaps = w.from <= to && w.to >= from
    if (!overlaps) continue
    coveringRuns.push({ runId: w.runId, from: w.from, to: w.to })
    for (const d of enumerateDays(w.from, w.to)) {
      if (d >= from && d <= to) covered.add(d)
    }
  }
  return {
    coveredDays: days.filter((d) => covered.has(d)),
    missingDays: days.filter((d) => !covered.has(d)),
    coveringRuns,
  }
}
