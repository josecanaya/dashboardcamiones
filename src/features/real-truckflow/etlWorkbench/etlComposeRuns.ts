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

/**
 * Dedup de legs de KPI (`segment_timing_legs`) tras concatenar corridas. La tabla de legs NO
 * tiene columna de día, así que `filterRowsByDay` no la puede acotar por tramo: si un journey
 * cae en el día-borde que dos corridas comparten (una corrida trae el día anterior por
 * arrastre nocturno), su leg aparecería en ambas y el KPI lo contaría dos veces. La clave
 * journey+from+to identifica el tramo de forma única. Ver [[composicion-rango-y-kpi-persistido]].
 */
function dedupeLegRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  for (const r of rows) {
    const key = `${r.journey_id ?? ''}|${r.from_logical ?? ''}|${r.to_logical ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
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
 * rango [from,to]. Concatena las filas de cada tabla y re-agrega el KPI de tiempos desde
 * los legs.
 *
 * Cada corrida se filtra a **su tramo asignado** (`spanFrom`/`spanTo`), no al rango global.
 * Así, cuando el rango se cubre con varias corridas **superpuestas** (típico: ventanas
 * ad-hoc como `27_02` + `27_01` + `31_01` que comparten días), cada día se cuenta una sola
 * vez —la corrida dueña de ese día— en lugar de sumarse tantas veces como ventanas lo cubran.
 * Si no se pasa `spanFrom`/`spanTo`, se cae al rango global (compat: una sola corrida).
 * `selectNonOverlappingCover` produce tramos disjuntos que tapan este agujero de raíz.
 */
export function composeRunsIntoTransformOutput(
  runs: { runId: string; output: EtlTransformOutput; spanFrom?: string; spanTo?: string }[],
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
    for (const { output, spanFrom, spanTo } of runs) {
      const t = (output.tables as Record<string, RunTable> | undefined)?.[name]
      if (t && Array.isArray(t.rows)) {
        parts.push({ headers: t.headers ?? [], rows: filterRowsByDay(t, spanFrom ?? from, spanTo ?? to) })
      }
    }
    if (!parts.length) continue
    const rows = parts.flatMap((p) => p.rows)
    mergedTables[name] = {
      headers: unionHeaders(parts),
      // Los legs no tienen columna de día: el filtro por tramo no los acota, así que se
      // deduplican por journey+from+to para no contar dos veces el día-borde compartido.
      rows: name === 'segment_timing_legs' ? dedupeLegRows(rows) : rows,
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

/** Corrida seleccionada para componer, con el tramo de días que le toca (disjunto). */
export type SelectedRun = {
  runId: string
  /** Rango declarado de la ventana. */
  from: string
  to: string
  /** Tramo asignado dentro del rango pedido (disjunto entre corridas). */
  spanFrom: string
  spanTo: string
}

export type RangeCoverage = {
  /** Días del rango cubiertos por alguna corrida guardada. */
  coveredDays: string[]
  /** Días del rango sin corrida guardada (habría que procesarlos). */
  missingDays: string[]
  /** Corridas guardadas que solapan el rango, por runId (todas, incluidas las redundantes). */
  coveringRuns: { runId: string; from: string; to: string }[]
  /**
   * Subconjunto de corridas que **realmente** hay que componer: una cobertura sin solape,
   * con tramos disjuntos. Descarta ventanas superpuestas redundantes para no contar días
   * dos veces. Esto es lo que debe cargar y pasar el llamador (no `coveringRuns`).
   */
  selectedRuns: SelectedRun[]
}

/**
 * Elige una cobertura **sin solape** del rango [from,to] a partir de las ventanas que lo
 * cubren. Greedy clásico de cobertura por intervalos: avanza un cursor por los días y en cada
 * paso toma la ventana que, cubriendo el cursor, llega más lejos a la derecha; le asigna el
 * tramo `[cursor, min(ventana.to, to)]` y salta el cursor al día siguiente. Así cada día queda
 * en una sola corrida (tramos disjuntos) y se descartan las ventanas ad-hoc superpuestas.
 */
export function selectNonOverlappingCover(
  from: string,
  to: string,
  coveringRuns: { runId: string; from: string; to: string }[]
): SelectedRun[] {
  const nextDay = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10)
  const wins = [...coveringRuns].sort((a, b) => a.from.localeCompare(b.from) || b.to.localeCompare(a.to))
  const selected: SelectedRun[] = []
  let cursor = from
  while (cursor <= to) {
    // Ventanas que cubren el día `cursor`.
    const covering = wins.filter((w) => w.from <= cursor && w.to >= cursor)
    if (!covering.length) {
      // Hueco: saltar al inicio de la próxima ventana disponible (los días saltados quedan
      // como missingDays en computeRangeCoverage).
      const next = wins.filter((w) => w.from > cursor).map((w) => w.from).sort()[0]
      if (!next) break
      cursor = next
      continue
    }
    // La que llega más a la derecha (desempate: la más larga / la primera por orden).
    const best = covering.reduce((a, b) => (b.to > a.to ? b : a))
    const spanTo = best.to < to ? best.to : to
    selected.push({ runId: best.runId, from: best.from, to: best.to, spanFrom: cursor, spanTo })
    cursor = nextDay(spanTo)
  }
  return selected
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
    selectedRuns: selectNonOverlappingCover(from, to, coveringRuns),
  }
}
