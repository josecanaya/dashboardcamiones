/**
 * Pipeline operativo para datos útiles en comité:
 * carga → filtro traseras → segmentación temporal → clasificación operativa Ricardone → trazabilidad ETL.
 */

import type { RealJourneyEventDto } from './realJourneyEvents.types'
import type { RealAlertDto } from './realTruckflowApi'
import { compareRealEvents } from './realJourneyEventsMapper'
import { normalizeRealEventPoint } from './realEventNormalization'
import { buildRearCameraFilterTrace, type RearCameraFilterTrace } from './rearCameraFilter'

export const COMMITTEE_FLAG_JOURNEY_LARGO_REVISION = 'JOURNEY_LARGO_REVISION'
export const COMMITTEE_FLAG_JOURNEY_SOSPECHOSO_LARGO = 'JOURNEY_SOSPECHOSO_LARGO'
export const COMMITTEE_UNSPLIT_SUFFIX = '__committee_unsplit_long'
export const COMMITTEE_SEG_PREFIX = '__committee_seg_'

const MS_HOUR = 3600 * 1000
const TWELVE_H_MS = 12 * MS_HOUR
const TWENTY_FOUR_H_MS = 24 * MS_HOUR
const GAP_SPLIT_MS = 6 * MS_HOUR

export type CommitteeTemporalBucket = 'normal' | 'largo_revision' | 'split' | 'unsplit_long'

export type CommitteeJourneyMeta = {
  sourceJourneyUid: string
  segmentIndex: number | null
  syntheticJourneyUid: string
  temporalBucket: CommitteeTemporalBucket
  committeeFlags: string[]
  committeeOperationalCircuit: string
  durationMs: number
  startedAt: string
  endedAt: string
}

export type CommitteePipelineExecutiveSummary = {
  rawEventCount: number
  rawAlertCount: number
  operationalEventCount: number
  operationalAlertCount: number
  excludedRearEventCount: number
  excludedRearAlertCount: number
  journeysProcessedCount: number
  includedCircuitCount: number
  reviewRequiredCount: number
  excludedCount: number
  topCircuitCode: string
  topCircuitCount: number
  reviewReasonCounts: Record<string, number>
  includedCircuitCounts: Record<string, number>
}

export type CommitteePipelineResult = {
  rearCameraTrace: RearCameraFilterTrace
  /** Eventos operativos tras filtro traseras y segmentación temporal (journeyUid puede ser sintético). */
  segmentedOperationalEvents: RealJourneyEventDto[]
  /** Alertas operativas alineadas a segmentos cuando hay journeyUid coincidente y tiempo dentro del segmento. */
  alertsAlignedToSegments: RealAlertDto[]
  journeyMetaByUid: Map<string, CommitteeJourneyMeta>
  executiveSummary: CommitteePipelineExecutiveSummary
}

function eventTimeMs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? t : NaN
}

function alertTimeMs(a: RealAlertDto): number {
  const raw = a.occurredAt ?? a.recordedAt ?? a.createdAt ?? ''
  const t = new Date(String(raw)).getTime()
  return Number.isFinite(t) ? t : NaN
}

function cloneEventWithJourney(e: RealJourneyEventDto, journeyUid: string): RealJourneyEventDto {
  return { ...e, journeyUid }
}

function cloneAlertWithJourney(a: RealAlertDto, journeyUid: string): RealAlertDto {
  return { ...a, journeyUid: journeyUid as typeof a.journeyUid }
}

/** Parte una lista ordenada por tiempo en segmentos donde el hueco entre eventos consecutivos > gapMs. */
function splitByTemporalGaps(sorted: RealJourneyEventDto[], gapMs: number): RealJourneyEventDto[][] {
  if (sorted.length === 0) return []
  const chunks: RealJourneyEventDto[][] = []
  let cur: RealJourneyEventDto[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const ev = sorted[i]
    const dt = eventTimeMs(ev.occurredAt) - eventTimeMs(prev.occurredAt)
    if (Number.isFinite(dt) && dt > gapMs) {
      chunks.push(cur)
      cur = [ev]
    } else {
      cur.push(ev)
    }
  }
  chunks.push(cur)
  return chunks
}

export type CommitteeOperationalCircuitCode =
  | 'CIRCUITO_CELDA16_DESCARGA'
  | 'CIRCUITO_CELDA16_CARGA'
  | 'CIRCUITO_VOLCABLE_1_2'
  | 'CIRCUITO_LIQUIDO'
  | 'CIRCUITO_SAN_LORENZO'
  | 'DESPACHO_SIN_PUNTO_INSTRUMENTADO'
  | 'TRANSILE_VOLCABLE_BALANZA'
  | 'REGISTRO_INCOMPLETO_COMITE'
  | 'JOURNEY_SOSPECHOSO_LARGO'

export function classifyCommitteeOperationalCircuit(sortedOperationalEvents: RealJourneyEventDto[]): CommitteeOperationalCircuitCode {
  if (!sortedOperationalEvents.length) return 'REGISTRO_INCOMPLETO_COMITE'
  const devices = new Set(sortedOperationalEvents.map((e) => (e.deviceCode ?? '').trim()).filter(Boolean))
  const has = (d: string) => devices.has(d)
  const logicals = new Set(sortedOperationalEvents.map((e) => normalizeRealEventPoint(e).logicalCode))

  if (has('RicC16Descarga1') || has('RicC16Descarga2')) return 'CIRCUITO_CELDA16_DESCARGA'
  if (has('RicC16Carga1') || has('RicC16Carga2')) return 'CIRCUITO_CELDA16_CARGA'
  if (has('RicVolcable1') || has('RicVolcable2')) return 'CIRCUITO_VOLCABLE_1_2'
  if (has('RicCalLiq')) return 'CIRCUITO_LIQUIDO'

  const hasBal = [...logicals].some((c) => c.startsWith('BALANZA'))
  const hasVol = logicals.has('VOLCABLE')
  const hasCel = logicals.has('CELDA_16')
  const hasIng = logicals.has('INGRESO')
  const hasPre = logicals.has('PREINGRESO')
  const hasEgr = logicals.has('EGRESO')
  const hasSl = logicals.has('SL_INGRESO')

  const hasCeldaDevices = [...devices].some((d) => d.includes('C16') || d.includes('CELDA'))
  const hasLiquidoDevice = has('RicCalLiq')

  // Ricardone → San Lorenzo: ruta calada / puerto sin balanza ni volcable ni celda ni líquido explícito
  if ((hasIng || hasPre) && (hasEgr || hasSl) && !hasBal && !hasVol && !hasCel && !hasCeldaDevices && !hasLiquidoDevice) {
    return 'CIRCUITO_SAN_LORENZO'
  }

  // Despacho / descarga sin punto instrumentado (balanza en juego pero sin celda/volc/líquido)
  if ((hasIng || hasPre) && hasBal && hasEgr && !hasVol && !hasCel && !hasCeldaDevices && !hasLiquidoDevice) {
    return 'DESPACHO_SIN_PUNTO_INSTRUMENTADO'
  }

  // Transile volcable → balanza (volcable + balanza sin cadena ingreso→pre→balanza ingreso completa)
  if (hasVol && hasBal && !(hasIng && hasPre && logicals.has('BALANZA_INGRESO'))) {
    return 'TRANSILE_VOLCABLE_BALANZA'
  }

  return 'REGISTRO_INCOMPLETO_COMITE'
}

const INCLUDED_COMMITTEE_CODES = new Set<CommitteeOperationalCircuitCode>([
  'CIRCUITO_CELDA16_DESCARGA',
  'CIRCUITO_CELDA16_CARGA',
  'CIRCUITO_VOLCABLE_1_2',
  'CIRCUITO_LIQUIDO',
  'CIRCUITO_SAN_LORENZO',
  'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
  'TRANSILE_VOLCABLE_BALANZA',
])

export type CommitteeEtlHint = 'included' | 'review_required' | 'excluded'

export function committeeEtlHintFromMeta(meta: CommitteeJourneyMeta): { etl: CommitteeEtlHint; reason: string } {
  if (meta.committeeOperationalCircuit === 'JOURNEY_SOSPECHOSO_LARGO') {
    return { etl: 'review_required', reason: 'COMMITTEE_JOURNEY_SOSPECHOSO_LARGO' }
  }
  if (meta.committeeFlags.includes(COMMITTEE_FLAG_JOURNEY_LARGO_REVISION)) {
    return { etl: 'review_required', reason: 'COMMITTEE_JOURNEY_LARGO_REVISION' }
  }
  if (meta.committeeOperationalCircuit === 'REGISTRO_INCOMPLETO_COMITE') {
    return { etl: 'review_required', reason: 'COMMITTEE_REGISTRO_INCOMPLETO' }
  }
  if (INCLUDED_COMMITTEE_CODES.has(meta.committeeOperationalCircuit as CommitteeOperationalCircuitCode)) {
    return { etl: 'included', reason: 'COMMITTEE_CIRCUITO_OPERATIVO_CLARO' }
  }
  return { etl: 'review_required', reason: 'COMMITTEE_GENERIC_REVIEW' }
}

function applyTemporalSegmentation(
  operationalEvents: RealJourneyEventDto[]
): { events: RealJourneyEventDto[]; metaList: CommitteeJourneyMeta[] } {
  const byUid = new Map<string, RealJourneyEventDto[]>()
  const orphansNoJourneyUid: RealJourneyEventDto[] = []
  for (const ev of operationalEvents) {
    const uid = (ev.journeyUid ?? '').trim()
    if (!uid) {
      orphansNoJourneyUid.push(ev)
      continue
    }
    byUid.set(uid, [...(byUid.get(uid) ?? []), ev])
  }

  const outEvents: RealJourneyEventDto[] = []
  const metaList: CommitteeJourneyMeta[] = []

  for (const [sourceUid, group] of byUid) {
    const sorted = [...group].sort((a, b) => compareRealEvents(a, b))
    const t0 = eventTimeMs(sorted[0].occurredAt)
    const t1 = eventTimeMs(sorted[sorted.length - 1].occurredAt)
    const durationMs = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, t1 - t0) : 0

    if (durationMs <= TWELVE_H_MS) {
      const circuit = classifyCommitteeOperationalCircuit(sorted)
      metaList.push({
        sourceJourneyUid: sourceUid,
        segmentIndex: 0,
        syntheticJourneyUid: sourceUid,
        temporalBucket: 'normal',
        committeeFlags: [],
        committeeOperationalCircuit: circuit,
        durationMs,
        startedAt: sorted[0].occurredAt,
        endedAt: sorted[sorted.length - 1].occurredAt,
      })
      outEvents.push(...sorted)
      continue
    }

    if (durationMs <= TWENTY_FOUR_H_MS) {
      const circuit = classifyCommitteeOperationalCircuit(sorted)
      metaList.push({
        sourceJourneyUid: sourceUid,
        segmentIndex: 0,
        syntheticJourneyUid: sourceUid,
        temporalBucket: 'largo_revision',
        committeeFlags: [COMMITTEE_FLAG_JOURNEY_LARGO_REVISION],
        committeeOperationalCircuit: circuit,
        durationMs,
        startedAt: sorted[0].occurredAt,
        endedAt: sorted[sorted.length - 1].occurredAt,
      })
      outEvents.push(...sorted)
      continue
    }

    const chunks = splitByTemporalGaps(sorted, GAP_SPLIT_MS)
    if (chunks.length <= 1) {
      const syntheticUid = `${sourceUid}${COMMITTEE_UNSPLIT_SUFFIX}`
      const circuit: CommitteeOperationalCircuitCode = 'JOURNEY_SOSPECHOSO_LARGO'
      metaList.push({
        sourceJourneyUid: sourceUid,
        segmentIndex: null,
        syntheticJourneyUid: syntheticUid,
        temporalBucket: 'unsplit_long',
        committeeFlags: [COMMITTEE_FLAG_JOURNEY_SOSPECHOSO_LARGO],
        committeeOperationalCircuit: circuit,
        durationMs,
        startedAt: sorted[0].occurredAt,
        endedAt: sorted[sorted.length - 1].occurredAt,
      })
      outEvents.push(...sorted.map((e) => cloneEventWithJourney(e, syntheticUid)))
      continue
    }

    chunks.forEach((chunk, idx) => {
      const syntheticUid = `${sourceUid}${COMMITTEE_SEG_PREFIX}${idx}`
      const st = eventTimeMs(chunk[0].occurredAt)
      const en = eventTimeMs(chunk[chunk.length - 1].occurredAt)
      const dMs = Number.isFinite(st) && Number.isFinite(en) ? Math.max(0, en - st) : 0
      const circuit = classifyCommitteeOperationalCircuit(chunk)
      metaList.push({
        sourceJourneyUid: sourceUid,
        segmentIndex: idx,
        syntheticJourneyUid: syntheticUid,
        temporalBucket: 'split',
        committeeFlags: [],
        committeeOperationalCircuit: circuit,
        durationMs: dMs,
        startedAt: chunk[0].occurredAt,
        endedAt: chunk[chunk.length - 1].occurredAt,
      })
      outEvents.push(...chunk.map((e) => cloneEventWithJourney(e, syntheticUid)))
    })
  }

  return { events: [...outEvents, ...orphansNoJourneyUid], metaList }
}

function alignAlertsToSegments(operationalAlerts: RealAlertDto[], metaList: CommitteeJourneyMeta[]): RealAlertDto[] {
  const segments = [...metaList].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
  const out: RealAlertDto[] = []
  const seen = new Set<string>()
  let invalidTsSeq = 0
  for (const alert of operationalAlerts) {
    const ju = String(alert.journeyUid ?? alert.journeyUuid ?? '').trim()
    const ta = alertTimeMs(alert)
    let matched: CommitteeJourneyMeta | null = null
    if (ju) {
      for (const m of segments) {
        if (m.sourceJourneyUid !== ju) continue
        const s = eventTimeMs(m.startedAt)
        const e = eventTimeMs(m.endedAt)
        if (!Number.isFinite(ta) || !Number.isFinite(s) || !Number.isFinite(e)) continue
        if (ta >= s && ta <= e) {
          matched = m
          break
        }
      }
    }
    const targetUid = matched?.syntheticJourneyUid ?? ju
    const clone = targetUid && matched ? cloneAlertWithJourney(alert, targetUid) : alert
    const alertKey = String(clone.id ?? (clone as { alertId?: string }).alertId ?? '')
    /** Sin timestamp válido, el dedupe no puede usar `NaN`: colapsaría miles de alertas (p. ej. LPR sin `occurredAt`). */
    const taPart = Number.isFinite(ta) ? String(ta) : `invalid_ts_${invalidTsSeq++}`
    const dedupeKey = `${alertKey}-${targetUid}-${taPart}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push(clone)
  }
  return out
}

function buildExecutiveSummary(rear: RearCameraFilterTrace, metaList: CommitteeJourneyMeta[]): CommitteePipelineExecutiveSummary {
  const journeyUids = new Set(metaList.map((m) => m.syntheticJourneyUid))
  let included = 0
  let review = 0
  let excluded = 0
  const reviewReasons: Record<string, number> = {}
  const circuitCounts: Record<string, number> = {}

  for (const m of metaList) {
    const k = m.syntheticJourneyUid
    if (!k) continue
    const { etl, reason } = committeeEtlHintFromMeta(m)
    if (etl === 'included') included++
    else if (etl === 'excluded') excluded++
    else {
      review++
      reviewReasons[reason] = (reviewReasons[reason] ?? 0) + 1
    }
    const cc = m.committeeOperationalCircuit
    circuitCounts[cc] = (circuitCounts[cc] ?? 0) + 1
  }

  let topCircuitCode = '—'
  let topCircuitCount = 0
  for (const [code, n] of Object.entries(circuitCounts)) {
    if (n > topCircuitCount && INCLUDED_COMMITTEE_CODES.has(code as CommitteeOperationalCircuitCode)) {
      topCircuitCount = n
      topCircuitCode = code
    }
  }
  if (topCircuitCount === 0) {
    const sorted = Object.entries(circuitCounts).sort((a, b) => b[1] - a[1])
    topCircuitCode = sorted[0]?.[0] ?? '—'
    topCircuitCount = sorted[0]?.[1] ?? 0
  }

  return {
    rawEventCount: rear.rawEvents.length,
    rawAlertCount: rear.rawAlerts.length,
    operationalEventCount: rear.operationalEvents.length,
    operationalAlertCount: rear.operationalAlerts.length,
    excludedRearEventCount: rear.metadata.excludedEventsCount,
    excludedRearAlertCount: rear.metadata.excludedAlertsCount,
    journeysProcessedCount: journeyUids.size,
    includedCircuitCount: included,
    reviewRequiredCount: review,
    excludedCount: excluded,
    topCircuitCode,
    topCircuitCount,
    reviewReasonCounts: reviewReasons,
    includedCircuitCounts: Object.fromEntries(
      Object.entries(circuitCounts).filter(([c]) => INCLUDED_COMMITTEE_CODES.has(c as CommitteeOperationalCircuitCode))
    ),
  }
}

/** Alertas LPR agregadas por cámara (operativas, misma base que filtro traseras). */
export function buildCommitteeLprAlertsByCamera(alerts: RealAlertDto[]): Array<{ deviceCode: string; count: number }> {
  const map = new Map<string, number>()
  for (const a of alerts) {
    const payload = typeof a.payload === 'string' ? {} : (a.payload as Record<string, unknown>) ?? {}
    const dc = String(a.deviceCode ?? a.device ?? payload.deviceCode ?? payload.device ?? '').trim()
    if (!dc) continue
    const text = [a.alertType, a.type, a.reason, a.message, JSON.stringify(payload)].join(' ').toUpperCase()
    if (!/(LPR|OCR|PATENTE|PLATE|LECTURA)/i.test(text)) continue
    map.set(dc, (map.get(dc) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([deviceCode, count]) => ({ deviceCode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40)
}

/**
 * Pipeline completo desde Ricardone crudo + alertas crudas.
 */
export function buildCommitteeOperationalPipeline(
  rawRicardoneEvents: RealJourneyEventDto[],
  rawAlerts: RealAlertDto[]
): CommitteePipelineResult {
  const rearCameraTrace = buildRearCameraFilterTrace(rawRicardoneEvents, rawAlerts)
  const { events: segmentedOperationalEvents, metaList } = applyTemporalSegmentation(rearCameraTrace.operationalEvents)
  const alertsAlignedToSegments = alignAlertsToSegments(rearCameraTrace.operationalAlerts, metaList)
  const journeyMetaByUid = new Map(metaList.map((m) => [m.syntheticJourneyUid, m]))
  const executiveSummary = buildExecutiveSummary(rearCameraTrace, metaList)

  return {
    rearCameraTrace,
    segmentedOperationalEvents,
    alertsAlignedToSegments,
    journeyMetaByUid,
    executiveSummary,
  }
}

export function getCommitteeJourneyMetaForUid(
  pipeline: CommitteePipelineResult | null,
  journeyUid: string
): CommitteeJourneyMeta | undefined {
  if (!pipeline) return undefined
  return pipeline.journeyMetaByUid.get(journeyUid)
}
