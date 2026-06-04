import { recordsToCsv } from './etlCsv'
import type { CleanJourneyForAnalysis } from './etlOperationalAnalysis'
import type { SegmentScatterRow } from './etlOperationalAnalysis'
import { p50, p90, mean } from '../../../utils/stats'
import { stableExternalHash } from './etlExternalNormalization'

export type OperationalSampleOptions = {
  sampleSize?: number
  periodStart?: string
  periodEnd?: string
  circuitCodes?: string[]
  products?: string[]
  platforms?: string[]
  mergeStatuses?: string[]
  executiveStatuses?: string[]
  validDetails?: string[]
  analysisReadyOnly?: boolean
  stratifyBy?: string[]
  minPerGroup?: number
  maxPerGroupPercent?: number
}

const DEFAULT_SAMPLE_OPTIONS: Required<
  Pick<
    OperationalSampleOptions,
    'sampleSize' | 'analysisReadyOnly' | 'stratifyBy' | 'minPerGroup' | 'maxPerGroupPercent'
  >
> = {
  sampleSize: 2000,
  analysisReadyOnly: true,
  stratifyBy: ['circuit_code', 'product_normalized'],
  minPerGroup: 20,
  maxPerGroupPercent: 40,
}

export type OperationalSampleRow = CleanJourneyForAnalysis & {
  sample_id: string
  sample_group: string
  sample_reason: string
}

function inPeriod(iso: string, start?: string, end?: string): boolean {
  if (!iso) return true
  if (start && iso < start) return false
  if (end && iso > end) return false
  return true
}

function sampleGroupKey(row: CleanJourneyForAnalysis, stratifyBy: string[]): string {
  return stratifyBy.map((f) => String((row as Record<string, unknown>)[f] ?? 'UNKNOWN')).join('|')
}

function stableSampleId(seed: string, journeyUid: string): string {
  return stableExternalHash(`${seed}|${journeyUid}`)
}

export function createOperationalSample(
  cleanJourneys: CleanJourneyForAnalysis[],
  options?: OperationalSampleOptions
): {
  sample: OperationalSampleRow[]
  summary: Record<string, unknown>
  byCircuitProduct: Record<string, unknown>[]
} {
  const opts = { ...DEFAULT_SAMPLE_OPTIONS, ...options }
  const seed = `sample_${opts.sampleSize}_${opts.stratifyBy.join('+')}`

  let pool = [...cleanJourneys]
  if (opts.analysisReadyOnly) {
    pool = pool.filter((r) => r.analysis_ready || r.operational_enrichment_ready)
  }
  /** Muestra operativa: solo camiones con producto asignado desde Movimientos por Contrato. */
  pool = pool.filter((r) => r.product_normalized)
  if (options?.periodStart || options?.periodEnd) {
    pool = pool.filter((r) => inPeriod(r.start_time, options.periodStart, options.periodEnd))
  }
  if (options?.circuitCodes?.length) {
    const set = new Set(options.circuitCodes)
    pool = pool.filter((r) => set.has(r.circuit_code))
  }
  if (options?.products?.length) {
    const set = new Set(options.products)
    pool = pool.filter((r) => set.has(r.product_normalized))
  }
  if (options?.platforms?.length) {
    const set = new Set(options.platforms)
    pool = pool.filter((r) => set.has(r.platform_normalized))
  }
  if (options?.mergeStatuses?.length) {
    const set = new Set(options.mergeStatuses)
    pool = pool.filter((r) => set.has(r.merge_status))
  }
  if (options?.executiveStatuses?.length) {
    const set = new Set(options.executiveStatuses)
    pool = pool.filter((r) => set.has(r.executive_status))
  }
  if (options?.validDetails?.length) {
    const set = new Set(options.validDetails)
    pool = pool.filter((r) => set.has(r.valid_detail))
  }

  const totalAvailable = cleanJourneys.length
  const totalAnalysisReady = cleanJourneys.filter((r) => r.analysis_ready).length

  if (pool.length <= opts.sampleSize) {
    const sample = pool.map((row) => ({
      ...row,
      sample_id: stableSampleId(seed, row.journey_uid),
      sample_group: sampleGroupKey(row, opts.stratifyBy),
      sample_reason: 'ALL_AVAILABLE_UNDER_TARGET',
    }))
    return {
      sample,
      summary: buildSampleSummary(totalAvailable, totalAnalysisReady, sample, opts.sampleSize),
      byCircuitProduct: buildByCircuitProduct(cleanJourneys, sample),
    }
  }

  const byGroup = new Map<string, CleanJourneyForAnalysis[]>()
  for (const row of pool) {
    const g = sampleGroupKey(row, opts.stratifyBy)
    const arr = byGroup.get(g) ?? []
    arr.push(row)
    byGroup.set(g, arr)
  }

  const groups = [...byGroup.entries()]
  const totalInPool = pool.length
  const maxPerGroup = Math.max(opts.minPerGroup, Math.floor((opts.sampleSize * opts.maxPerGroupPercent) / 100))

  const selected: CleanJourneyForAnalysis[] = []
  const remaining = new Map<string, CleanJourneyForAnalysis[]>()

  for (const [g, rows] of groups) {
    if (rows.length <= opts.minPerGroup) {
      selected.push(...rows)
    } else {
      const proportional = Math.max(
        opts.minPerGroup,
        Math.min(maxPerGroup, Math.round((rows.length / totalInPool) * opts.sampleSize))
      )
      const take = rows.slice(0, proportional)
      selected.push(...take)
      remaining.set(g, rows.slice(proportional))
    }
  }

  let selectedSorted = selected.slice(0, opts.sampleSize)
  if (selectedSorted.length < opts.sampleSize) {
    const extra: CleanJourneyForAnalysis[] = []
    for (const rows of remaining.values()) extra.push(...rows)
    for (const row of extra) {
      if (selectedSorted.length >= opts.sampleSize) break
      if (!selectedSorted.some((s) => s.journey_uid === row.journey_uid)) {
        selectedSorted.push(row)
      }
    }
  }
  selectedSorted = selectedSorted.slice(0, opts.sampleSize)

  const sample: OperationalSampleRow[] = selectedSorted.map((row) => ({
    ...row,
    sample_id: stableSampleId(seed, row.journey_uid),
    sample_group: sampleGroupKey(row, opts.stratifyBy),
    sample_reason: 'STRATIFIED_PROPORTIONAL',
  }))

  return {
    sample,
    summary: buildSampleSummary(totalAvailable, totalAnalysisReady, sample, opts.sampleSize),
    byCircuitProduct: buildByCircuitProduct(cleanJourneys, sample),
  }
}

function buildSampleSummary(
  totalAvailable: number,
  totalAnalysisReady: number,
  sample: OperationalSampleRow[],
  target: number
): Record<string, unknown> {
  const durations = sample.map((r) => r.duration_min).filter((d) => Number.isFinite(d) && d > 0)
  const mergeConf = sample.map((r) => r.merge_confidence).filter(Number.isFinite)
  const coverage = sample.map((r) => r.coverage_percent).filter(Number.isFinite)

  return {
    total_available: totalAvailable,
    total_analysis_ready: totalAnalysisReady,
    total_selected: sample.length,
    sample_size_target: target,
    unique_circuits: new Set(sample.map((r) => r.circuit_code)).size,
    unique_products: new Set(sample.map((r) => r.product_normalized)).size,
    unique_platforms: new Set(sample.map((r) => r.platform_normalized)).size,
    valid_complete: sample.filter((r) => r.valid_detail === 'COMPLETO').length,
    valid_deduced: sample.filter((r) => r.valid_detail === 'DEDUCIDO').length,
    valid_operational_variation: sample.filter((r) => r.valid_detail === 'VARIACION_OPERATIVA').length,
    incomplete: sample.filter((r) => r.executive_status === 'INCOMPLETO').length,
    anomalous_real: sample.filter((r) => r.analysis_exclusion_reason === 'ANOMALY_REAL').length,
    non_evaluable: sample.filter((r) => r.analysis_exclusion_reason === 'NO_EVALUABLE_CIRCUIT').length,
    matched_exact: sample.filter((r) => r.merge_status === 'MATCH_EXACT').length,
    matched_probable: sample.filter((r) => r.merge_status === 'MATCH_PROBABLE').length,
    matched_multiple_resolved: sample.filter((r) => r.merge_status === 'MATCH_MULTIPLE_RESOLVED').length,
    no_external_match: sample.filter((r) => r.merge_status === 'NO_EXTERNAL_MATCH').length,
    avg_merge_confidence:
      mergeConf.length ? Math.round((mean(mergeConf) / 1) * 10000) / 10000 : 0,
    avg_coverage_percent:
      coverage.length ? Math.round(mean(coverage) * 100) / 100 : 0,
    p50_duration_min: durations.length ? p50(durations) : 0,
    p90_duration_min: durations.length ? p90(durations) : 0,
  }
}

function buildByCircuitProduct(
  all: CleanJourneyForAnalysis[],
  sample: OperationalSampleRow[]
): Record<string, unknown>[] {
  const keys = new Set<string>()
  for (const r of all) keys.add(`${r.circuit_code}|${r.product_normalized}|${r.platform_normalized}`)
  const rows: Record<string, unknown>[] = []
  for (const key of keys) {
    const [circuit_code, product_normalized, platform_normalized] = key.split('|')
    const avail = all.filter(
      (r) =>
        r.circuit_code === circuit_code &&
        r.product_normalized === product_normalized &&
        r.platform_normalized === platform_normalized
    )
    const sel = sample.filter(
      (r) =>
        r.circuit_code === circuit_code &&
        r.product_normalized === product_normalized &&
        r.platform_normalized === platform_normalized
    )
    const durs = sel.map((r) => r.duration_min).filter((d) => Number.isFinite(d) && d > 0)
    const valid = sel.filter((r) => r.executive_status === 'VALIDO').length
    rows.push({
      circuit_code,
      circuit_label: sel[0]?.circuit_label ?? avail[0]?.circuit_label ?? '',
      product_normalized,
      platform_normalized,
      total_available: avail.length,
      total_analysis_ready: avail.filter((r) => r.analysis_ready).length,
      total_selected: sel.length,
      avg_coverage_percent:
        sel.length ?
          Math.round(mean(sel.map((r) => r.coverage_percent)) * 100) / 100
        : 0,
      avg_merge_confidence:
        sel.length ?
          Math.round(mean(sel.map((r) => r.merge_confidence)) * 10000) / 10000
        : 0,
      p50_duration_min: durs.length ? p50(durs) : 0,
      p90_duration_min: durs.length ? p90(durs) : 0,
      avg_duration_min: durs.length ? Math.round(mean(durs) * 100) / 100 : 0,
      valid_rate: sel.length ? Math.round((valid / sel.length) * 10000) / 10000 : 0,
      anomaly_real_rate:
        sel.length ?
          Math.round(
            (sel.filter((r) => r.analysis_exclusion_reason === 'ANOMALY_REAL').length / sel.length) *
              10000
          ) / 10000
        : 0,
    })
  }
  return rows.sort((a, b) => String(a.circuit_code).localeCompare(String(b.circuit_code)))
}

export function operationalSampleCsv(rows: OperationalSampleRow[]): string {
  const headers = [
    'sample_id',
    'journey_uid',
    'plate_normalized',
    'start_time',
    'end_time',
    'circuit_code',
    'circuit_label',
    'product_normalized',
    'platform_normalized',
    'planta_normalized',
    'movement_type',
    'executive_status',
    'valid_detail',
    'merge_status',
    'merge_confidence',
    'coverage_percent',
    'has_strong_point',
    'sample_group',
    'sample_reason',
    'analysis_ready',
    'operational_enrichment_ready',
    'missing_camera_discharge',
  ]
  return recordsToCsv(headers, rows as unknown as Record<string, unknown>[])
}

export function operationalSampleSummaryCsv(summary: Record<string, unknown>): string {
  return recordsToCsv(Object.keys(summary), [summary])
}

export function operationalSampleByCircuitProductCsv(rows: Record<string, unknown>[]): string {
  const headers = [
    'circuit_code',
    'circuit_label',
    'product_normalized',
    'platform_normalized',
    'total_available',
    'total_analysis_ready',
    'total_selected',
    'avg_coverage_percent',
    'avg_merge_confidence',
    'p50_duration_min',
    'p90_duration_min',
    'avg_duration_min',
    'valid_rate',
    'anomaly_real_rate',
  ]
  return recordsToCsv(headers, rows)
}

export function segmentScatterSampleCsv(
  scatter: SegmentScatterRow[],
  sampleUids: Set<string>
): string {
  const filtered = scatter.filter((r) => sampleUids.has(String(r.journey_uid ?? '')))
  const headers = [
    'journey_uid',
    'plate_normalized',
    'product_normalized',
    'platform_normalized',
    'planta_normalized',
    'movement_type',
    'circuit_code',
    'circuit_label',
    'segment_order',
    'segment_name',
    'segment_from',
    'segment_to',
    'segment_start_time',
    'segment_end_time',
    'segment_duration_min',
    'segment_plant',
    'segment_leg',
    'executive_status',
    'valid_detail',
    'merge_status',
    'merge_confidence',
    'coverage_percent',
    'has_strong_point',
    'analysis_ready',
    'analysis_exclusion_reason',
    'is_outlier',
    'outlier_method',
    'outlier_reason',
    'p50_segment_duration',
    'p90_segment_duration',
    'p95_segment_duration',
    'avg_segment_duration',
    'std_segment_duration',
    'segment_duration_zscore',
  ]
  return recordsToCsv(headers, filtered)
}
