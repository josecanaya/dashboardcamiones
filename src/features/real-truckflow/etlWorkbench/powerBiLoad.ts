import { strToU8, zipSync } from 'fflate'
import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords, rowGet, unionHeaders } from './etlCsvParse'
import { buildCameraPowerBiAggregates } from './powerBiCameraAggregates'
import {
  buildCommitteeExecutiveCsvPack,
  projectFinalCircuitsForCommittee,
  type DssReferenceMetrics,
} from './powerBiCommitteeExecutive'
import { ETL_TRANSFORM_RULES_VERSION } from './etlTransformPipeline'
import type { EtlTransformOutput } from './etlTransformPipeline'

export const POWER_BI_STABLE_FILES = {
  committee_summary: 'pb_committee_summary.csv',
  final_circuits: 'pb_final_circuits.csv',
  camera_committee_status: 'pb_camera_committee_status.csv',
  circuit_coverage: 'pb_circuit_coverage.csv',
  dss_vs_truckflow: 'pb_dss_vs_truckflow.csv',
  transform_summary: 'pb_transform_summary.csv',
  camera_status: 'pb_camera_status_general.csv',
  camera_summary: 'pb_camera_summary.csv',
  camera_daynight_summary: 'pb_camera_daynight_summary.csv',
  sector_camera_summary: 'pb_sector_camera_summary.csv',
  front_events: 'pb_front_events.csv',
  front_alerts: 'pb_front_alerts.csv',
  rear_events: 'pb_rear_events.csv',
  rear_alerts: 'pb_rear_alerts.csv',
  manifest: 'pb_load_manifest.json',
} as const

export type { DssReferenceMetrics } from './powerBiCommitteeExecutive'

export type PowerBiStableFileKey = keyof typeof POWER_BI_STABLE_FILES

export type LoadGroupType = 'day' | 'week' | 'month' | 'custom'

export type TransformDayFileKind =
  | 'final_circuits'
  | 'camera_status'
  | 'front_events'
  | 'front_alerts'
  | 'rear_events'
  | 'rear_alerts'
  | 'transform_summary'

const SOURCE_FILE_PATTERNS: Record<TransformDayFileKind, string[]> = {
  final_circuits: ['final_circuits.csv'],
  camera_status: ['camera_status_general.csv', 'camera_lpr_status.csv'],
  front_events: ['front_events.csv'],
  front_alerts: ['front_alerts.csv'],
  rear_events: ['rear_events.csv'],
  rear_alerts: ['rear_alerts.csv'],
  transform_summary: ['transform_summary.csv'],
}

const TRANSFORM_CSV_KEY_MAP: Record<TransformDayFileKind, keyof EtlTransformOutput['csv']> = {
  final_circuits: 'final_circuits',
  camera_status: 'camera_lpr_status',
  front_events: 'front_events',
  front_alerts: 'front_alerts',
  rear_events: 'rear_events',
  rear_alerts: 'rear_alerts',
  transform_summary: 'transform_summary',
}

export type LoadedTransformDay = {
  sourceDay: string
  files: Partial<Record<TransformDayFileKind, string>>
  sourcePaths: Partial<Record<TransformDayFileKind, string>>
}

export type PowerBiConsolidatedOutput = {
  periodStart: string
  periodEnd: string
  loadGroupType: LoadGroupType
  outputFolder: string
  loadGeneratedAt: string
  rulesVersion: string
  sourceDays: string[]
  files: Record<PowerBiStableFileKey, string>
  rowCounts: Record<PowerBiStableFileKey, number>
  stats: PowerBiLoadUiStats
}

export type PowerBiLoadUiStats = {
  daysConsolidated: number
  frontEvents: number
  frontAlerts: number
  rearEvents: number
  rearAlerts: number
  finalCircuits: number
  circuitosUtiles: number
  finalCircuitosProbables: number
  finalCircuitosSinIngreso: number
  incompletosRevision: number
  ingresoFrontal: number
  finalCircuitsVsIngresoRatio: number | null
  journeysVsIngresoRatio: number | null
  journeysAfterRearFilter: number
}

const SUMMARY_NUMERIC_FIELDS = [
  'raw_events_count',
  'raw_alerts_count',
  'front_events_count',
  'rear_events_count',
  'front_alerts_count',
  'rear_alerts_count',
  'ingreso_frontal_event_count',
  'ingresos_operativos_count',
  'total_journeys_raw',
  'rear_only_journeys_excluded',
  'journeys_after_rear_filter',
  'final_circuits_count',
  'final_classified_count',
  'final_incomplete_count',
  'final_circuitos_completos',
  'final_circuitos_probables',
  'final_circuitos_sin_ingreso',
  'final_circuitos_sin_egreso',
  'final_incompletos_revision',
  'final_descartados',
  'circuitos_con_ingreso_operativo',
  'circuitos_con_egreso_operativo',
  'circuitos_con_ingreso_y_egreso_operativo',
  'clean_journeys_count',
  'classified_circuits_count',
  'unclassified_journeys_count',
  'single_event_discarded',
  'merge_candidates_count',
] as const

const USEFUL_FINAL_STATUSES = new Set([
  'circuito_completo',
  'circuito_probable',
  'circuito_probable_sin_ingreso',
  'circuito_probable_sin_egreso',
])

function parseDay(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})$/.exec(String(iso).trim())
  return m ? m[1] : null
}

export function daysInclusive(start: string, end: string): string[] {
  const a = parseDay(start)
  const b = parseDay(end)
  if (!a || !b) throw new Error('Fechas inválidas (use YYYY-MM-DD)')
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  let cur = new Date(ay, am - 1, ad)
  const endDt = new Date(by, bm - 1, bd)
  if (cur > endDt) throw new Error('La fecha desde debe ser <= hasta')
  const out: string[] = []
  while (cur <= endDt) {
    out.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    )
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return out
}

function inferDayFromPath(filePath: string): string | null {
  const m = filePath.replace(/\\/g, '/').match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function classifyFileName(name: string): TransformDayFileKind | null {
  const base = name.split(/[/\\]/).pop()?.toLowerCase() ?? ''
  for (const [kind, patterns] of Object.entries(SOURCE_FILE_PATTERNS) as [TransformDayFileKind, string[]][]) {
    if (patterns.some((p) => base === p.toLowerCase())) return kind
  }
  return null
}

export async function readTransformFilesFromFileList(files: FileList | File[]): Promise<LoadedTransformDay[]> {
  const packByDay = new Map<string, LoadedTransformDay>()

  for (const file of [...files]) {
    const kind = classifyFileName(file.name)
    if (!kind) continue
    const day = inferDayFromPath(file.webkitRelativePath || file.name) ?? 'unknown'
    let pack = packByDay.get(day)
    if (!pack) {
      pack = { sourceDay: day, files: {}, sourcePaths: {} }
      packByDay.set(day, pack)
    }
    const text = await file.text()
    pack.files[kind] = text
    pack.sourcePaths![kind] = file.webkitRelativePath || file.name
  }

  return [...packByDay.values()].sort((a, b) => a.sourceDay.localeCompare(b.sourceDay))
}

export function loadedDayFromTransformResult(
  tr: EtlTransformOutput,
  sourceDay: string
): LoadedTransformDay {
  const files: Partial<Record<TransformDayFileKind, string>> = {}
  for (const [kind, csvKey] of Object.entries(TRANSFORM_CSV_KEY_MAP) as [TransformDayFileKind, keyof EtlTransformOutput['csv']][]) {
    const text = tr.csv[csvKey]
    if (text?.trim()) files[kind] = text
  }
  return {
    sourceDay,
    files,
    sourcePaths: { transform_summary: 'memory://transform' },
  }
}

export function mergeLoadedDays(
  existing: LoadedTransformDay[],
  incoming: LoadedTransformDay[]
): LoadedTransformDay[] {
  const map = new Map<string, LoadedTransformDay>()
  for (const d of existing) map.set(d.sourceDay, { ...d, files: { ...d.files }, sourcePaths: { ...d.sourcePaths } })
  for (const d of incoming) {
    const prev = map.get(d.sourceDay)
    if (!prev) {
      map.set(d.sourceDay, d)
      continue
    }
    map.set(d.sourceDay, {
      sourceDay: d.sourceDay,
      files: { ...prev.files, ...d.files },
      sourcePaths: { ...prev.sourcePaths, ...d.sourcePaths },
    })
  }
  return [...map.values()].sort((a, b) => a.sourceDay.localeCompare(b.sourceDay))
}

function filterDaysInPeriod(days: LoadedTransformDay[], start: string, end: string): LoadedTransformDay[] {
  const allowed = new Set(daysInclusive(start, end))
  return days.filter((d) => d.sourceDay === 'unknown' || allowed.has(d.sourceDay))
}

function dedupeByKey(rows: Record<string, string>[], keyFn: (r: Record<string, string>) => string): Record<string, string>[] {
  const seen = new Set<string>()
  const out: Record<string, string>[] = []
  for (const r of rows) {
    const k = keyFn(r)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function appendLoadMeta(
  rows: Record<string, string>[],
  meta: {
    source_day: string
    source_file: string
    load_period_start: string
    load_period_end: string
    load_group_type: LoadGroupType
    load_generated_at: string
    camera_type?: string
  }
): Record<string, string>[] {
  return rows.map((r) => ({
    ...r,
    source_day: meta.source_day,
    source_file: meta.source_file,
    load_period_start: meta.load_period_start,
    load_period_end: meta.load_period_end,
    load_group_type: meta.load_group_type,
    load_generated_at: meta.load_generated_at,
    ...(meta.camera_type ? { camera_type: meta.camera_type } : {}),
  }))
}

function recordsToCsvFromRows(headers: string[], rows: Record<string, string>[]): string {
  const objs = rows.map((r) => {
    const o: Record<string, unknown> = {}
    for (const h of headers) o[h] = r[h] ?? ''
    return o
  })
  return recordsToCsv(headers, objs)
}

function numVal(v: string | undefined): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function ratioOrNull(num: number, den: number): number | null {
  if (den <= 0) return null
  return Math.round((num / den) * 10000) / 10000
}

function buildFolderName(group: LoadGroupType, start: string, end: string): string {
  if (group === 'day' && start === end) return `dia_${start}`
  if (group === 'week') return `semana_${start}_${end}`
  if (group === 'month') return `mes_${start.slice(0, 7)}_${start}_${end}`
  return `rango_${start}_${end}`
}

export function consolidatePowerBiLoad(input: {
  days: LoadedTransformDay[]
  periodStart: string
  periodEnd: string
  loadGroupType: LoadGroupType
  /** Valores DSS manuales para pb_dss_vs_truckflow (opcional). */
  dssReference?: DssReferenceMetrics
}): PowerBiConsolidatedOutput {
  const periodStart = parseDay(input.periodStart) ?? input.periodStart
  const periodEnd = parseDay(input.periodEnd) ?? input.periodEnd
  const loadGeneratedAt = new Date().toISOString()
  const filtered = filterDaysInPeriod(input.days, periodStart, periodEnd)
  const sourceDays = filtered.map((d) => d.sourceDay).filter((d) => d !== 'unknown')

  let finalHeaders: string[] = []
  const finalRows: Record<string, string>[] = []

  let camHeaders: string[] = []
  const camRows: Record<string, string>[] = []

  let feHeaders: string[] = []
  const feRows: Record<string, string>[] = []
  let reHeaders: string[] = []
  const reRows: Record<string, string>[] = []

  let faHeaders: string[] = []
  const faRows: Record<string, string>[] = []
  let raHeaders: string[] = []
  const raRows: Record<string, string>[] = []

  const summaryDayRows: Record<string, string>[] = []

  for (const dayPack of filtered) {
    const metaBase = {
      source_day: dayPack.sourceDay,
      load_period_start: periodStart,
      load_period_end: periodEnd,
      load_group_type: input.loadGroupType,
      load_generated_at: loadGeneratedAt,
    }

    const fc = dayPack.files.final_circuits
    if (fc) {
      const parsed = parseCsvToRecords(fc)
      finalHeaders = unionHeaders(finalHeaders, [
        ...parsed.headers,
        'load_period_start',
        'load_period_end',
        'load_group_type',
        'source_day',
        'source_file',
        'load_generated_at',
      ])
      finalRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.final_circuits ?? 'final_circuits.csv',
        })
      )
    }

    const cam = dayPack.files.camera_status
    if (cam) {
      const parsed = parseCsvToRecords(cam)
      camHeaders = unionHeaders(camHeaders, [
        ...parsed.headers,
        'source_day',
        'load_period_start',
        'load_period_end',
        'load_generated_at',
      ])
      camRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.camera_status ?? 'camera_lpr_status.csv',
        })
      )
    }

    const fe = dayPack.files.front_events
    if (fe) {
      const parsed = parseCsvToRecords(fe)
      feHeaders = unionHeaders(feHeaders, [
        ...parsed.headers,
        'source_day',
        'camera_type',
        'load_period_start',
        'load_period_end',
      ])
      feRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.front_events ?? 'front_events.csv',
          camera_type: 'front',
        })
      )
    }

    const re = dayPack.files.rear_events
    if (re) {
      const parsed = parseCsvToRecords(re)
      reHeaders = unionHeaders(reHeaders, [
        ...parsed.headers,
        'source_day',
        'camera_type',
        'load_period_start',
        'load_period_end',
      ])
      reRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.rear_events ?? 'rear_events.csv',
          camera_type: 'rear',
        })
      )
    }

    const fa = dayPack.files.front_alerts
    if (fa) {
      const parsed = parseCsvToRecords(fa)
      faHeaders = unionHeaders(faHeaders, [
        ...parsed.headers,
        'source_day',
        'camera_type',
        'load_period_start',
        'load_period_end',
      ])
      faRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.front_alerts ?? 'front_alerts.csv',
          camera_type: 'front',
        })
      )
    }

    const ra = dayPack.files.rear_alerts
    if (ra) {
      const parsed = parseCsvToRecords(ra)
      raHeaders = unionHeaders(raHeaders, [
        ...parsed.headers,
        'source_day',
        'camera_type',
        'load_period_start',
        'load_period_end',
      ])
      raRows.push(
        ...appendLoadMeta(parsed.rows, {
          ...metaBase,
          source_file: dayPack.sourcePaths?.rear_alerts ?? 'rear_alerts.csv',
          camera_type: 'rear',
        })
      )
    }

    const ts = dayPack.files.transform_summary
    if (ts) {
      const parsed = parseCsvToRecords(ts)
      for (const r of parsed.rows) {
        summaryDayRows.push({
          ...r,
          summary_level: 'day',
          source_day: dayPack.sourceDay,
          load_period_start: periodStart,
          load_period_end: periodEnd,
          load_generated_at: loadGeneratedAt,
        })
      }
    }
  }

  const finalDeduped = dedupeByKey(finalRows, (r) =>
    [
      rowGet(r, 'journey_uid'),
      rowGet(r, 'journey_uid_final'),
      rowGet(r, 'original_journey_uids'),
      rowGet(r, 'first_event_at'),
      rowGet(r, 'truck_plate', 'normalized_plate'),
    ].join('|')
  )

  const camDeduped = dedupeByKey(camRows, (r) =>
    [
      rowGet(r, 'date'),
      rowGet(r, 'week'),
      rowGet(r, 'day_name'),
      rowGet(r, 'day_night'),
      rowGet(r, 'time_bucket'),
      rowGet(r, 'deviceCode', 'device_code'),
      rowGet(r, 'sectorCode', 'sector_code'),
      rowGet(r, 'camera_type'),
    ].join('|')
  )

  const feDeduped = dedupeByKey(feRows, (r) =>
    [rowGet(r, 'id'), rowGet(r, 'occurredAt', 'occurred_at'), rowGet(r, 'deviceCode', 'device_code'), rowGet(r, 'truckPlate', 'truck_plate')].join('|')
  )
  const reDeduped = dedupeByKey(reRows, (r) =>
    [rowGet(r, 'id'), rowGet(r, 'occurredAt', 'occurred_at'), rowGet(r, 'deviceCode', 'device_code'), rowGet(r, 'truckPlate', 'truck_plate')].join('|')
  )
  const faDeduped = dedupeByKey(faRows, (r) =>
    [rowGet(r, 'id'), rowGet(r, 'createdAt', 'occurredAt'), rowGet(r, 'deviceCode', 'device_code'), rowGet(r, 'alertCode', 'alert_code')].join('|')
  )
  const raDeduped = dedupeByKey(raRows, (r) =>
    [rowGet(r, 'id'), rowGet(r, 'createdAt', 'occurredAt'), rowGet(r, 'deviceCode', 'device_code'), rowGet(r, 'alertCode', 'alert_code')].join('|')
  )

  const summaryHeaders = unionHeaders(
    [
      'summary_level',
      'source_day',
      'load_period_start',
      'load_period_end',
      ...SUMMARY_NUMERIC_FIELDS,
      'journeys_vs_ingreso_ratio',
      'final_circuits_vs_ingreso_ratio',
      'journey_vs_ingreso_ratio',
      'generated_at',
      'load_generated_at',
      'rules_version',
    ],
    summaryDayRows.flatMap((r) => Object.keys(r))
  )

  const totalSummary: Record<string, string> = {
    summary_level: 'total',
    source_day: '',
    load_period_start: periodStart,
    load_period_end: periodEnd,
    load_generated_at: loadGeneratedAt,
    rules_version: ETL_TRANSFORM_RULES_VERSION,
    generated_at: loadGeneratedAt,
  }

  for (const field of SUMMARY_NUMERIC_FIELDS) {
    let sum = 0
    for (const r of summaryDayRows) sum += numVal(r[field])
    totalSummary[field] = String(sum)
  }

  const ingresoTotal = numVal(totalSummary.ingreso_frontal_event_count)
  const journeysAfter = numVal(totalSummary.journeys_after_rear_filter)
  const finalCircuitsTotal = numVal(totalSummary.final_circuits_count)

  const jRatio = ratioOrNull(journeysAfter, ingresoTotal)
  const cRatio = ratioOrNull(finalCircuitsTotal, ingresoTotal)
  totalSummary.journeys_vs_ingreso_ratio = jRatio != null ? String(jRatio) : ''
  totalSummary.final_circuits_vs_ingreso_ratio = cRatio != null ? String(cRatio) : ''
  totalSummary.journey_vs_ingreso_ratio = jRatio != null ? String(jRatio) : ''

  const summaryAll = [...summaryDayRows, totalSummary]
  const summaryCsv = recordsToCsvFromRows(summaryHeaders, summaryAll)

  const finalProjected = projectFinalCircuitsForCommittee(finalDeduped)
  const loadMetaKeys = ['load_period_start', 'load_period_end', 'load_group_type', 'source_day', 'source_file', 'load_generated_at']
  const finalHeadersExec = unionHeaders(
    unionHeaders(finalProjected.headers, loadMetaKeys),
    finalHeaders
  )
  const pb_final_circuits = recordsToCsvFromRows(
    finalHeadersExec.length ? finalHeadersExec : ['journey_uid', 'final_status', 'final_status_label'],
    finalProjected.rows
  )

  const pb_camera = recordsToCsvFromRows(
    camHeaders.length ? camHeaders : ['date', 'deviceCode'],
    camDeduped
  )
  const cameraAggregates = buildCameraPowerBiAggregates(camDeduped)

  const daysInPeriod = daysInclusive(periodStart, periodEnd).length
  const executivePack = buildCommitteeExecutiveCsvPack({
    periodStart,
    periodEnd,
    loadGeneratedAt,
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
    totalSummary,
    finalCircuits: finalProjected.rows,
    cameraSummaryCsv: cameraAggregates.csv.camera_summary,
    daysInPeriod,
    dssReference: input.dssReference,
  })
  const pb_front_events = recordsToCsvFromRows(feHeaders.length ? feHeaders : ['id'], feDeduped)
  const pb_rear_events = recordsToCsvFromRows(reHeaders.length ? reHeaders : ['id'], reDeduped)
  const pb_front_alerts = recordsToCsvFromRows(faHeaders.length ? faHeaders : ['id'], faDeduped)
  const pb_rear_alerts = recordsToCsvFromRows(raHeaders.length ? raHeaders : ['id'], raDeduped)

  const outputFolder = `data/powerbi/${buildFolderName(input.loadGroupType, periodStart, periodEnd)}/`

  let circuitosUtiles = 0
  let incompletosRevision = 0
  for (const r of finalDeduped) {
    const st = rowGet(r, 'final_status')
    if (USEFUL_FINAL_STATUSES.has(st)) circuitosUtiles++
    if (st === 'incompleto_revision') incompletosRevision++
  }

  const rowCounts: Record<PowerBiStableFileKey, number> = {
    committee_summary: executivePack.rowCounts.committee_summary,
    final_circuits: finalProjected.rows.length,
    camera_committee_status: executivePack.rowCounts.camera_committee_status,
    circuit_coverage: executivePack.rowCounts.circuit_coverage,
    dss_vs_truckflow: executivePack.rowCounts.dss_vs_truckflow,
    transform_summary: summaryAll.length,
    camera_status: camDeduped.length,
    camera_summary: cameraAggregates.rowCounts.camera_summary,
    camera_daynight_summary: cameraAggregates.rowCounts.camera_daynight_summary,
    sector_camera_summary: cameraAggregates.rowCounts.sector_camera_summary,
    front_events: feDeduped.length,
    front_alerts: faDeduped.length,
    rear_events: reDeduped.length,
    rear_alerts: raDeduped.length,
    manifest: 1,
  }

  const manifest = {
    generated_at: loadGeneratedAt,
    load_period_start: periodStart,
    load_period_end: periodEnd,
    load_group_type: input.loadGroupType,
    layer: 'executive_committee',
    source_files_count: filtered.reduce((acc, d) => acc + Object.keys(d.files).length, 0),
    source_days: sourceDays,
    output_folder: outputFolder,
    output_files: Object.values(POWER_BI_STABLE_FILES),
    executive_files: [
      POWER_BI_STABLE_FILES.committee_summary,
      POWER_BI_STABLE_FILES.final_circuits,
      POWER_BI_STABLE_FILES.camera_committee_status,
      POWER_BI_STABLE_FILES.circuit_coverage,
      POWER_BI_STABLE_FILES.dss_vs_truckflow,
    ],
    technical_detail_files: [
      POWER_BI_STABLE_FILES.transform_summary,
      POWER_BI_STABLE_FILES.camera_status,
      POWER_BI_STABLE_FILES.front_events,
      POWER_BI_STABLE_FILES.rear_events,
    ],
    total_rows_by_file: Object.fromEntries(
      (Object.keys(POWER_BI_STABLE_FILES) as PowerBiStableFileKey[])
        .filter((k) => k !== 'manifest')
        .map((k) => [POWER_BI_STABLE_FILES[k], rowCounts[k]])
    ),
    rules_version: ETL_TRANSFORM_RULES_VERSION,
  }

  const files: Record<PowerBiStableFileKey, string> = {
    committee_summary: executivePack.csv.committee_summary,
    final_circuits: pb_final_circuits,
    camera_committee_status: executivePack.csv.camera_committee_status,
    circuit_coverage: executivePack.csv.circuit_coverage,
    dss_vs_truckflow: executivePack.csv.dss_vs_truckflow,
    transform_summary: summaryCsv,
    camera_status: pb_camera,
    camera_summary: cameraAggregates.csv.camera_summary,
    camera_daynight_summary: cameraAggregates.csv.camera_daynight_summary,
    sector_camera_summary: cameraAggregates.csv.sector_camera_summary,
    front_events: pb_front_events,
    front_alerts: pb_front_alerts,
    rear_events: pb_rear_events,
    rear_alerts: pb_rear_alerts,
    manifest: JSON.stringify(manifest, null, 2),
  }

  return {
    periodStart,
    periodEnd,
    loadGroupType: input.loadGroupType,
    outputFolder,
    loadGeneratedAt,
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
    sourceDays,
    files,
    rowCounts,
    stats: {
      daysConsolidated: sourceDays.length,
      frontEvents: feDeduped.length,
      frontAlerts: faDeduped.length,
      rearEvents: reDeduped.length,
      rearAlerts: raDeduped.length,
      finalCircuits: finalDeduped.length,
      circuitosUtiles,
      finalCircuitosProbables: numVal(totalSummary.final_circuitos_probables),
      finalCircuitosSinIngreso: numVal(totalSummary.final_circuitos_sin_ingreso),
      incompletosRevision,
      ingresoFrontal: ingresoTotal,
      finalCircuitsVsIngresoRatio: cRatio,
      journeysVsIngresoRatio: jRatio,
      journeysAfterRearFilter: journeysAfter,
    },
  }
}

export function buildPowerBiZipName(periodStart: string, periodEnd: string): string {
  return `powerbi_semana_${periodStart}_${periodEnd}.zip`
}

export function zipPowerBiConsolidated(out: PowerBiConsolidatedOutput): Uint8Array {
  const map: Record<string, Uint8Array> = {}
  for (const key of Object.keys(POWER_BI_STABLE_FILES) as PowerBiStableFileKey[]) {
    map[POWER_BI_STABLE_FILES[key]] = strToU8(out.files[key])
  }
  return zipSync(map, { level: 0 })
}

export function triggerPowerBiZipDownload(out: PowerBiConsolidatedOutput): void {
  const zipped = zipPowerBiConsolidated(out)
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = buildPowerBiZipName(out.periodStart, out.periodEnd)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

export async function tryWritePowerBiToLocalServer(out: PowerBiConsolidatedOutput): Promise<{
  ok: boolean
  path?: string
  error?: string
}> {
  try {
    const res = await fetch('/api/truckflow/powerbi-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodStart: out.periodStart,
        periodEnd: out.periodEnd,
        loadGroupType: out.loadGroupType,
        files: Object.fromEntries(
          (Object.keys(POWER_BI_STABLE_FILES) as PowerBiStableFileKey[]).map((k) => [
            POWER_BI_STABLE_FILES[k],
            out.files[k],
          ])
        ),
      }),
    })
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: j.error ?? `HTTP ${res.status}` }
    }
    const j = (await res.json()) as { outputDir?: string }
    return { ok: true, path: j.outputDir }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
