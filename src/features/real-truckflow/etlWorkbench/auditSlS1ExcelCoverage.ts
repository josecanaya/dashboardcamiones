/**
 * Cruce Excel-first vs lecturas crudas S1 (SLZBalIngFte / balanza ingreso SL).
 * Para auditar pérdida entre movimientos de contrato y KPI SL_INGRESO → SL_BALANZA_INGRESO.
 */

export const S1_DEVICE_CODES = new Set(['SLZBalIngFte', 'SLZBalIngTrasera'])
export const S1_SECTOR_CODES = new Set([
  'PUERTO_SAN_LORENZO_BALANZA_INGRESO',
  '1-S1',
])

export type RawJourneyEventLike = {
  truckPlate?: string
  normalizedPlate?: string
  deviceCode?: string
  device_code?: string
  sectorCode?: string
  sector_code?: string
  occurredAt?: string
  occurred_at?: string
  createdAt?: string
  created_at?: string
  modifiedAt?: string
  modified_at?: string
  recordedAt?: string
  recorded_at?: string
}

export type TimedSegmentLike = {
  segment_from: string
  segment_to: string
  segment_start_time?: string
  segment_end_time?: string
}

export type ExcelOperationLike = {
  operationId: string
  plate: string
  executiveCircuitCode: string
  externalIngresoAt?: string
  externalSalidaAt?: string
  analysisReadyForScatter: boolean
  segments: TimedSegmentLike[]
}

export type SlS1AuditRow = {
  operationId: string
  plate: string
  circuit: string
  analysisReadyForScatter: boolean
  rawS1InExcelWindow: boolean
  rawS1AnytimeForPlate: boolean
  rawS1CountInWindow: number
  rawS1BestInstant: string
  pipelineHasS1Segment: boolean
  pipelineHasSlIngresoBalanzaLeg: boolean
  pipelineHasSlIngresoPoint: boolean
  gapClass:
    | 'ok_both'
    | 'raw_s1_no_pipeline'
    | 'pipeline_no_raw_s1'
    | 'neither'
    | 'raw_outside_window_only'
  notes: string
}

export function normalizePlateKey(plate: string): string {
  return String(plate ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function parseInstantMs(iso: string): number {
  const t = Date.parse(String(iso ?? '').trim())
  return Number.isFinite(t) ? t : Number.NaN
}

/** Regla producto: createdAt primero. */
export function operationalInstantIso(
  e: RawJourneyEventLike,
  preferCreatedAt = true
): string {
  const chain = preferCreatedAt
    ? [
        e.createdAt ?? e.created_at,
        e.modifiedAt ?? e.modified_at,
        e.recordedAt ?? e.recorded_at,
        e.occurredAt ?? e.occurred_at,
      ]
    : [e.occurredAt ?? e.occurred_at, e.createdAt ?? e.created_at]
  for (const iso of chain) {
    const s = String(iso ?? '').trim()
    if (s && Number.isFinite(parseInstantMs(s))) return s
  }
  return ''
}

export function isRawS1Event(e: RawJourneyEventLike): boolean {
  const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
  const sec = String(e.sectorCode ?? e.sector_code ?? '').trim()
  if (S1_DEVICE_CODES.has(dev)) return true
  if (S1_SECTOR_CODES.has(sec)) return true
  if (sec === 'PUERTO_SAN_LORENZO_BALANZA_INGRESO') return true
  return false
}

export function pipelineHasS1Segment(segments: TimedSegmentLike[]): boolean {
  for (const s of segments) {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') return true
    if (to === 'SL_BALANZA_INGRESO' && from !== 'SL_BALANZA_INGRESO') return true
    if (from === 'SL_BALANZA_INGRESO' && to === 'SL_EGRESO') {
      const start = String(s.segment_start_time ?? '').trim()
      if (start && Number.isFinite(parseInstantMs(start))) return true
    }
  }
  return false
}

export function pipelineHasSlIngresoBalanzaLeg(segments: TimedSegmentLike[]): boolean {
  return segments.some(
    (s) =>
      String(s.segment_from ?? '').trim() === 'SL_INGRESO' &&
      String(s.segment_to ?? '').trim() === 'SL_BALANZA_INGRESO'
  )
}

export function pipelineHasSlIngresoSegment(segments: TimedSegmentLike[]): boolean {
  return segments.some((s) => {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    return to === 'SL_INGRESO' || from === 'SL_INGRESO'
  })
}

export function excelWindowMs(op: ExcelOperationLike, paddingHours = 6): {
  fromMs: number
  toMs: number
} {
  const ing = parseInstantMs(op.externalIngresoAt ?? '')
  const sal = parseInstantMs(op.externalSalidaAt ?? '')
  const pad = paddingHours * 3600_000
  let fromMs = Number.isFinite(ing) ? ing - pad : Number.NaN
  let toMs = Number.isFinite(sal) ? sal + pad : Number.NaN
  if (!Number.isFinite(fromMs) && Number.isFinite(sal)) fromMs = sal - 48 * 3600_000
  if (!Number.isFinite(toMs) && Number.isFinite(ing)) toMs = ing + 48 * 3600_000
  return { fromMs, toMs }
}

export function indexS1EventsByPlate(
  events: RawJourneyEventLike[],
  preferCreatedAt = true
): Map<string, Array<{ instant: string; ms: number }>> {
  const map = new Map<string, Array<{ instant: string; ms: number }>>()
  for (const e of events) {
    if (!isRawS1Event(e)) continue
    const plate =
      normalizePlateKey(e.normalizedPlate ?? '') ||
      normalizePlateKey(e.truckPlate ?? '')
    if (!plate) continue
    const instant = operationalInstantIso(e, preferCreatedAt)
    const ms = parseInstantMs(instant)
    if (!Number.isFinite(ms)) continue
    const arr = map.get(plate) ?? []
    arr.push({ instant, ms })
    map.set(plate, arr)
  }
  for (const arr of map.values()) arr.sort((a, b) => a.ms - b.ms)
  return map
}

export function findS1InWindow(
  byPlate: Map<string, Array<{ instant: string; ms: number }>>,
  plate: string,
  fromMs: number,
  toMs: number
): { count: number; bestInstant: string } {
  const key = normalizePlateKey(plate)
  const hits = byPlate.get(key) ?? []
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { count: hits.length, bestInstant: hits[0]?.instant ?? '' }
  }
  const inWin = hits.filter((h) => h.ms >= fromMs && h.ms <= toMs)
  return {
    count: inWin.length,
    bestInstant: inWin[0]?.instant ?? '',
  }
}

export function auditExcelOperationsAgainstRawS1(
  operations: ExcelOperationLike[],
  events: RawJourneyEventLike[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number }
): SlS1AuditRow[] {
  const preferCreatedAt = opts?.preferCreatedAt !== false
  const padding = opts?.windowPaddingHours ?? 6
  const byPlate = indexS1EventsByPlate(events, preferCreatedAt)

  return operations.map((op) => {
    const { fromMs, toMs } = excelWindowMs(op, padding)
    const plateKey = normalizePlateKey(op.plate)
    const anytime = (byPlate.get(plateKey) ?? []).length > 0
    const { count, bestInstant } = findS1InWindow(byPlate, op.plate, fromMs, toMs)
    const rawInWindow = count > 0
    const pipeS1 = pipelineHasS1Segment(op.segments)
    const pipeLeg = pipelineHasSlIngresoBalanzaLeg(op.segments)
    const pipeS0 = pipelineHasSlIngresoSegment(op.segments)

    let gapClass: SlS1AuditRow['gapClass'] = 'neither'
    let notes = ''
    if (rawInWindow && (pipeS1 || pipeLeg)) gapClass = 'ok_both'
    else if (rawInWindow && !pipeS1 && !pipeLeg) {
      gapClass = 'raw_s1_no_pipeline'
      notes = 'S1 en crudo dentro de ventana Excel; merge/KPI no generó segmento S1 ni tramo S0→S1'
    } else if (!rawInWindow && anytime) {
      gapClass = 'raw_outside_window_only'
      notes = 'Hay S1 crudo para la patente pero fuera de ventana ingreso/salida Excel (revisar match o padding)'
    } else if (!rawInWindow && (pipeS1 || pipeLeg)) {
      gapClass = 'pipeline_no_raw_s1'
      notes = 'Segmento pipeline con S1 pero sin evento crudo S1 en ventana (rollup/inferido o ventana)'
    } else {
      gapClass = 'neither'
      notes = anytime ? 'S1 fuera de ventana' : 'Sin lectura S1 cruda en el archivo de eventos'
    }
    if (!op.analysisReadyForScatter && (rawInWindow || pipeS1)) {
      notes += '; analysis_ready_for_scatter=false'
    }
    if (rawInWindow && pipeS1 && !pipeLeg) {
      notes += '; tiene segmento S1 pero falta tramo SL_INGRESO→SL_BALANZA_INGRESO (corte cadena KPI)'
    }
    if (!pipeS0 && rawInWindow) {
      notes += '; sin segmento SL_INGRESO en merge'
    }

    return {
      operationId: op.operationId,
      plate: op.plate,
      circuit: op.executiveCircuitCode,
      analysisReadyForScatter: op.analysisReadyForScatter,
      rawS1InExcelWindow: rawInWindow,
      rawS1AnytimeForPlate: anytime,
      rawS1CountInWindow: count,
      rawS1BestInstant: bestInstant,
      pipelineHasS1Segment: pipeS1,
      pipelineHasSlIngresoBalanzaLeg: pipeLeg,
      pipelineHasSlIngresoPoint: pipeS0,
      gapClass,
      notes,
    }
  })
}

export function summarizeSlS1Audit(rows: SlS1AuditRow[]): {
  operations: number
  rawS1InWindow: number
  pipelineS1Segment: number
  pipelineSlIngresoBalanza: number
  rawYesPipelineNo: number
  rawYesNoSlIngresoBalanzaLeg: number
  rawOutsideWindowOnly: number
} {
  const rawYesPipelineNo = rows.filter((r) => r.gapClass === 'raw_s1_no_pipeline').length
  const rawYesNoLeg = rows.filter(
    (r) => r.rawS1InExcelWindow && r.pipelineHasS1Segment && !r.pipelineHasSlIngresoBalanzaLeg
  ).length
  return {
    operations: rows.length,
    rawS1InWindow: rows.filter((r) => r.rawS1InExcelWindow).length,
    pipelineS1Segment: rows.filter((r) => r.pipelineHasS1Segment).length,
    pipelineSlIngresoBalanza: rows.filter((r) => r.pipelineHasSlIngresoBalanzaLeg).length,
    rawYesPipelineNo,
    rawYesNoSlIngresoBalanzaLeg: rawYesNoLeg,
    rawOutsideWindowOnly: rows.filter((r) => r.gapClass === 'raw_outside_window_only').length,
  }
}

export function slS1AuditToCsv(rows: SlS1AuditRow[]): string {
  const header = [
    'external_operation_id',
    'plate',
    'circuit',
    'analysis_ready_for_scatter',
    'raw_s1_in_excel_window',
    'raw_s1_anytime_plate',
    'raw_s1_count_in_window',
    'raw_s1_best_instant',
    'pipeline_has_s1_segment',
    'pipeline_has_sl_ingreso_balanza_leg',
    'pipeline_has_sl_ingreso_segment',
    'gap_class',
    'notes',
  ]
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [
        r.operationId,
        r.plate,
        r.circuit,
        r.analysisReadyForScatter,
        r.rawS1InExcelWindow,
        r.rawS1AnytimeForPlate,
        r.rawS1CountInWindow,
        r.rawS1BestInstant,
        r.pipelineHasS1Segment,
        r.pipelineHasSlIngresoBalanzaLeg,
        r.pipelineHasSlIngresoPoint,
        r.gapClass,
        r.notes,
      ]
        .map(esc)
        .join(',')
    )
  }
  return lines.join('\n')
}
