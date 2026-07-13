/**
 * Bundle CSV compatible Power BI (ex circuitEtlV2). Conservado como artefacto de export;
 * la clasificación ejecutiva vigente vive en finalCircuitScoring / CIRCUIT_CATALOG.
 */

import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { getEventOperationalInstantMs } from '../../../services/realEventOperationalTime'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import {
  normalizePlateStrict,
  plateSimilarityScore,
  isLikelyOcrPlateMatch,
  weightedOcrLevenshtein,
} from '../../../services/circuitPlateOcr'

const MS_MIN = 60 * 1000
const MS_HOUR = 60 * MS_MIN

export const CIRCUIT_V2_DEFAULT_MAX_GAP_MS = 4 * MS_HOUR

/** Nombres estables del bundle v2 (Power BI consume estos archivos junto al ETL legacy). */
export const CIRCUIT_ETL_V2_FILENAMES = {
  clean_circuits_v2: 'clean_circuits_v2.csv',
  clean_events_v2: 'clean_events_v2.csv',
  etl_quality_summary_v2: 'etl_quality_summary_v2.csv',
  incompletos_por_motivo: 'incompletos_por_motivo.csv',
  reconstructed_from_fragments: 'reconstructed_from_fragments.csv',
  circuit_score_debug: 'circuit_score_debug.csv',
  circuit_fuzzy_merge_top: 'circuit_fuzzy_merge_top.csv',
} as const

/** Gap máximo (minutos) entre eventos vecinos cuando se acepta Levenshtein OCR = 2. */
const STRONG_MERGE_MAX_GAP_MIN = 180

export type CircuitMatrixRule = {
  circuit_type: string
  expected_sequence_joined: string
  core_points_S: readonly string[]
  optional_points_S: readonly string[]
  entry_points_S: readonly string[]
  exit_points_S: readonly string[]
  minimum_score: number
  site: 'ricardone' | 'san_lorenzo' | 'unknown'
}

export const RICARDONE_CELDA16_RECEPCION: CircuitMatrixRule = {
  circuit_type: 'RICARDONE_CELDA16_RECEPCION',
  expected_sequence_joined: 'S0>S1>S2>S4>S5>S6>S7>S4>S10',
  core_points_S: ['S2', 'S4', 'S5', 'S6', 'S7', 'S4'],
  optional_points_S: ['S0', 'S1', 'S10'],
  entry_points_S: ['S0', 'S1'],
  exit_points_S: ['S10'],
  minimum_score: 45,
  site: 'ricardone',
}

const CIRCUIT_MATRICES: readonly CircuitMatrixRule[] = [
  RICARDONE_CELDA16_RECEPCION,
  {
    circuit_type: 'RICARDONE_VOLCABLE_BASICO',
    expected_sequence_joined: 'S0>S1>S2>S4>S5>S4>S10',
    core_points_S: ['S5', 'S4'],
    optional_points_S: ['S0', 'S1', 'S2', 'S10'],
    entry_points_S: ['S0', 'S1'],
    exit_points_S: ['S10'],
    minimum_score: 42,
    site: 'ricardone',
  },
  {
    circuit_type: 'RICARDONE_DESPACHO_SIN_CELDA',
    expected_sequence_joined: 'S0>S1>S2>S4>S10',
    core_points_S: ['S2', 'S4'],
    optional_points_S: ['S0', 'S1', 'S10'],
    entry_points_S: ['S0', 'S1'],
    exit_points_S: ['S10'],
    minimum_score: 42,
    site: 'ricardone',
  },
  {
    circuit_type: 'SAN_LORENZO_VOLCABLE_BASICO',
    expected_sequence_joined: 'S0>S1>S2>S4>S5>S4>S10',
    core_points_S: ['S4', 'S5'],
    optional_points_S: ['S0', 'S1', 'S2', 'S10'],
    entry_points_S: ['S0', 'S1'],
    exit_points_S: ['S10'],
    minimum_score: 40,
    site: 'san_lorenzo',
  },
]

/** Convención planta: S0 = ingreso, S1 = preingreso (orden S0→S1→S2→… ). */
export function logicalPointToSToken(e: RealJourneyEventDto): string {
  const n = normalizeRealEventPoint(e)
  switch (n.logicalCode) {
    case 'INGRESO':
    case 'INGRESO_TRASERA_EXCLUIDA':
      return 'S0'
    case 'PREINGRESO':
    case 'PREINGRESO_TRASERA_EXCLUIDA':
    case 'PREINGRESO_EGRESO':
    case 'PREINGRESO_EGRESO_TRASERA':
      return 'S1'
    case 'CALADA':
      return 'S2'
    case 'SL_INGRESO':
      return 'S3_SL'
    case 'BALANZA_INGRESO':
      return 'S4'
    case 'BALANZA_EGRESO':
      return 'S4'
    case 'VOLCABLE':
      return 'S5'
    case 'CELDA16_DESCARGA':
    case 'CELDA16_CARGA':
      return 'S6'
    case 'LIQUIDO':
      return 'S7'
    case 'BALANZA':
      return 'S4'
    case 'EGRESO':
    case 'EGRESO_TRASERA_EXCLUIDA':
      return 'S10'
    default:
      return 'SX'
  }
}

/** Colapsa solo consecutivos duplicados manteniendo orden temporal. */
export function collapseGtSequence(parts: readonly string[]): string {
  const out: string[] = []
  for (const p of parts) {
    if (!p || p === 'UNKNOWN' || p === 'SX') continue
    if (out[out.length - 1] !== p) out.push(p)
  }
  return out.join('>')
}

function eventTs(e: RealJourneyEventDto): number {
  const t = getEventOperationalInstantMs(e)
  return Number.isFinite(t) ? t : NaN
}

function hashShort(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36).slice(0, 8)
}

export type PlateMatchType = 'EXACT' | 'FUZZY_OCR' | 'MIXED' | 'UNKNOWN'

export type ReconstructedOperationalSession = {
  reconstructed_journey_id: string
  source_journey_uids: string[]
  events: RealJourneyEventDto[]
  normalized_plate: string
  site_id: string
  merged_fragment: boolean
  /** Patentes strict distintas presentes en los eventos agrupados. */
  source_plates_strict: string[]
  canonical_plate: string
  plate_match_type: PlateMatchType
  plate_match_confidence: number
  /** Nº de fusiones asistidas por similitud OCR (no cuenta sólo merges journey_uid exactos). */
  fuzzy_merged_count: number
}

/** Eventos con patente normalizada no vacía; incluye OCR dudoso (isValidPlate=false) para no perder trayectos recuperables. */
export function buildOperationalSessionsPlateSite(
  events: RealJourneyEventDto[],
  opts: { maxGapMs?: number } = {}
): ReconstructedOperationalSession[] {
  const maxGapMs = opts.maxGapMs ?? CIRCUIT_V2_DEFAULT_MAX_GAP_MS
  const valid = events.filter((e) => String(e.normalizedPlate ?? '').trim().length >= 5)
  const buckets = new Map<string, RealJourneyEventDto[]>()

  for (const e of valid) {
    const n = normalizeRealEventPoint(e)
    const site = n.siteId
    const plate = String(e.normalizedPlate ?? '').trim()
    if (site !== 'ricardone' && site !== 'san_lorenzo') continue
    const k = `${plate}|${site}`
    let bucket = buckets.get(k)
    if (!bucket) {
      bucket = []
      buckets.set(k, bucket)
    }
    bucket.push(e)
  }

  const sessions: ReconstructedOperationalSession[] = []

  for (const [, bucket] of buckets) {
    const sorted = [...bucket].sort((a, b) => compareRealEvents(a, b))
    let cur: RealJourneyEventDto[] = []
    let sessIdx = 0

    const flush = () => {
      if (cur.length === 0) return
      const plate = String(cur[0].normalizedPlate ?? '').trim()
      const siteId = normalizeRealEventPoint(cur[0]).siteId
      const uidsSet = new Set(cur.map((x) => String(x.journeyUid ?? '').trim()).filter(Boolean))
      const uids = [...uidsSet].sort()
      const t0 = eventTs(cur[0])
      const sjid = `rv2_${siteId}_${hashShort(plate)}_${Number.isFinite(t0) ? t0 : Date.now()}_${sessIdx++}_${hashShort(uids.join(','))}`
      sessions.push({
        reconstructed_journey_id: sjid,
        source_journey_uids: uids,
        merged_fragment: uids.length > 1,
        events: [...cur],
        normalized_plate: plate,
        site_id: siteId,
        source_plates_strict: [...new Set(cur.map((e) => normalizePlateStrict(e.normalizedPlate ?? '')).filter(Boolean))].sort(),
        canonical_plate: plate,
        plate_match_type: 'EXACT',
        plate_match_confidence: 1,
        fuzzy_merged_count: 0,
      })
      cur = []
    }

    for (const e of sorted) {
      if (cur.length === 0) {
        cur.push(e)
        continue
      }
      const prev = cur[cur.length - 1]!
      const dt = eventTs(e) - eventTs(prev)
      const prevL = normalizeRealEventPoint(prev).logicalCode
      const nextL = normalizeRealEventPoint(e).logicalCode

      if (Number.isFinite(dt) && dt > maxGapMs) {
        flush()
        cur = [e]
        continue
      }
      const egressLike =
        prevL === 'EGRESO' ||
        prevL === 'BALANZA_EGRESO' ||
        prevL === 'SL_INGRESO' ||
        prevL === 'EGRESO_TRASERA_EXCLUIDA'
      const entryLike = nextL === 'INGRESO' || nextL === 'PREINGRESO'
      if (egressLike && entryLike && Number.isFinite(dt) && dt > 15 * MS_MIN) {
        flush()
        cur = [e]
        continue
      }
      if (Number.isFinite(dt) && dt > 6 * MS_HOUR) {
        flush()
        cur = [e]
        continue
      }
      cur.push(e)
    }
    flush()
  }

  sessions.sort((a, b) => eventTs(a.events[0]!) - eventTs(b.events[0]!))
  return sessions
}

function canonicalPlateFromEvents(events: readonly RealJourneyEventDto[], fallback: string): string {
  const counts = new Map<string, number>()
  for (const e of events) {
    const p = normalizePlateStrict(e.normalizedPlate ?? '')
    if (p.length < 5) continue
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  if (counts.size === 0) return normalizePlateStrict(fallback)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
}

function validateMergedTimeline(sorted: readonly RealJourneyEventDto[], maxGapMs: number): boolean {
  for (let i = 1; i < sorted.length; i++) {
    const dt = eventTs(sorted[i]!) - eventTs(sorted[i - 1]!)
    if (!Number.isFinite(dt)) return false
    if (dt > maxGapMs) return false
    if (dt > 6 * MS_HOUR) return false
    const prevL = normalizeRealEventPoint(sorted[i - 1]!).logicalCode
    const nextL = normalizeRealEventPoint(sorted[i]!).logicalCode
    const egressLike =
      prevL === 'EGRESO' ||
      prevL === 'BALANZA_EGRESO' ||
      prevL === 'SL_INGRESO' ||
      prevL === 'EGRESO_TRASERA_EXCLUIDA'
    const entryLike = nextL === 'INGRESO' || nextL === 'PREINGRESO'
    if (egressLike && entryLike && dt > 15 * MS_MIN) return false
  }
  return true
}

function maxAdjacentGapMinutes(sorted: readonly RealJourneyEventDto[]): number {
  let mx = 0
  for (let i = 1; i < sorted.length; i++) {
    const dt = eventTs(sorted[i]!) - eventTs(sorted[i - 1]!)
    if (!Number.isFinite(dt) || dt < 0) continue
    mx = Math.max(mx, dt / MS_MIN)
  }
  return mx
}

export type SessionScoreBreakdown = {
  raw_score: number
  penalties: number
  bonuses: number
  logical_order_bonus: boolean
  loop_bonus: boolean
  illogical: boolean
  time_penalty: boolean
}

const ORDER_IDS: Record<string, number> = {
  S0: 1,
  S1: 2,
  S2: 3,
  S3_SL: 3.5,
  S4: 4,
  S5: 5,
  S6: 6,
  S7: 7,
  S10: 10,
}

export function computeSessionScores(session: ReconstructedOperationalSession): SessionScoreBreakdown {
  const evs = session.events
  let bonuses = 0
  let penalties = 0

  const hasIngPre = evs.some((e) =>
    ['INGRESO', 'PREINGRESO'].includes(normalizeRealEventPoint(e).logicalCode)
  )
  if (hasIngPre) bonuses += 15

  if (evs.some((e) => normalizeRealEventPoint(e).logicalCode === 'CALADA')) bonuses += 10

  if (evs.some((e) => normalizeRealEventPoint(e).logicalCode === 'BALANZA_INGRESO')) bonuses += 15

  const hasVolCeldaLiq = evs.some((e) =>
    ['VOLCABLE', 'CELDA16_DESCARGA', 'CELDA16_CARGA', 'LIQUIDO'].includes(normalizeRealEventPoint(e).logicalCode)
  )
  if (hasVolCeldaLiq) bonuses += 25

  if (evs.some((e) => normalizeRealEventPoint(e).logicalCode === 'BALANZA_EGRESO')) bonuses += 15

  const hasEg = evs.some((e) => ['EGRESO', 'EGRESO_TRASERA_EXCLUIDA'].includes(normalizeRealEventPoint(e).logicalCode))
  if (hasEg) bonuses += 10

  const seqTokens = collapseGtSequence(evs.map((e) => logicalPointToSToken(e))).split('>')
  const orderOk =
    seqTokens.length <= 3 ||
    seqTokens.every((t, i, a) => {
      if (i === 0) return true
      const cur = ORDER_IDS[t] ?? 0
      const prv = ORDER_IDS[a[i - 1]!] ?? 0
      return cur + 1e-6 >= prv || t === 'S4' || a[i - 1] === 'S4'
    })
  if (orderOk) bonuses += 20

  const sCounts = new Map<string, number>()
  for (const e of session.events) {
    const s = logicalPointToSToken(e)
    if (s === 'SX') continue
    sCounts.set(s, (sCounts.get(s) ?? 0) + 1)
  }
  const loopBonus = (sCounts.get('S4') ?? 0) >= 2 && hasVolCeldaLiq
  if (loopBonus) bonuses += 5

  let illogical = false
  const tsSorted = [...evs].sort((a, b) => eventTs(a) - eventTs(b))
  let firstEntryT = NaN
  let lastExitT = NaN
  for (const ev of tsSorted) {
    const lc = normalizeRealEventPoint(ev).logicalCode
    const tt = eventTs(ev)
    if ((lc === 'INGRESO' || lc === 'PREINGRESO') && !Number.isFinite(firstEntryT)) firstEntryT = tt
    if (lc === 'EGRESO' || lc === 'EGRESO_TRASERA_EXCLUIDA') lastExitT = tt
  }
  if (Number.isFinite(firstEntryT) && Number.isFinite(lastExitT) && lastExitT < firstEntryT - MS_MIN)
    illogical = true

  let timePenalty = false
  for (let i = 1; i < evs.length; i++) {
    const dt = eventTs(evs[i]!) - eventTs(evs[i - 1]!)
    const sameSector = evs[i]!.sectorCode === evs[i - 1]!.sectorCode
    if (sameSector && Number.isFinite(dt) && dt > 3 * MS_HOUR) timePenalty = true
  }

  if (illogical) penalties += 30
  if (!orderOk && !loopBonus && evs.length >= 4) penalties += 25
  if (timePenalty) penalties += 20

  return {
    raw_score: bonuses - penalties,
    bonuses,
    penalties,
    logical_order_bonus: orderOk,
    loop_bonus: loopBonus,
    illogical,
    time_penalty: timePenalty,
  }
}

function pickBestMatrix(sess: ReconstructedOperationalSession): CircuitMatrixRule | null {
  const obs = multiset(sess.events.map((e) => logicalPointToSToken(e)).filter((s) => s !== 'SX'))
  let best: CircuitMatrixRule | null = null
  let score = -1
  for (const m of CIRCUIT_MATRICES) {
    if (m.site !== sess.site_id) continue
    let overlap = 0
    const seenUnique = [...new Set(m.core_points_S)]
    for (const c of seenUnique) {
      if ((obs.get(c) ?? 0) > 0) overlap++
    }
    if (overlap > score) {
      score = overlap
      best = m
    }
  }
  return best
}

function multiset(values: readonly string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1)
  return m
}

function coreRequirements(core: readonly string[]): Map<string, number> {
  const r = new Map<string, number>()
  for (const c of core) r.set(c, (r.get(c) ?? 0) + 1)
  for (const [k, n] of r) {
    if (k === 'S4') r.set(k, Math.min(2, n))
    else if (n > 1) r.set(k, 1)
  }
  return r
}

/** Tokens de core faltantes vs requisitos (S4 permite hasta dos pasadas observadas). */
function missingAgainstCore(sess: ReconstructedOperationalSession, m: CircuitMatrixRule): string[] {
  const obs = multiset(sess.events.map((e) => logicalPointToSToken(e)).filter((s) => s !== 'SX'))
  const need = coreRequirements(m.core_points_S)
  const missing: string[] = []
  for (const [token, n] of need) {
    const have = Math.min(obs.get(token) ?? 0, token === 'S4' ? 2 : n)
    for (let k = have; k < n; k++) missing.push(token)
  }
  return missing
}

export type ClassifiedOperationalCircuit = {
  session: ReconstructedOperationalSession
  matrix: CircuitMatrixRule | null
  observed_logical_sequence: string
  observed_sequence: string
  expected_sequence_joined: string
  circuit_type: string
  circuit_status:
    | 'COMPLETO_CONFIRMADO'
    | 'COMPLETO_RECONSTRUIDO'
    | 'VARIACION_OPERATIVA'
    | 'INCOMPLETO_RECUPERABLE'
    | 'INCOMPLETO_NO_RECUPERABLE'
    | 'ANOMALIA'
  confidence_pct: number
  missing_points: string
  missing_points_count: number
  reconstructed: boolean
  reconstruction_reason: string
  score_breakdown: SessionScoreBreakdown
}

function hasCargoLike(seqS: string): boolean {
  return seqS.includes('S5') || seqS.includes('S6') || seqS.includes('S7')
}

function hasCalada(sess: ReconstructedOperationalSession): boolean {
  return sess.events.some((e) => normalizeRealEventPoint(e).logicalCode === 'CALADA')
}

/** Clasifica una sesión ya reconstruida. */
export function classifyOperationalSession(session: ReconstructedOperationalSession): ClassifiedOperationalCircuit {
  const sorted = [...session.events].sort((a, b) => compareRealEvents(a, b))
  const sess = { ...session, events: sorted }
  const breakdown = computeSessionScores(sess)

  const logicalGt = collapseGtSequence(sorted.map((e) => normalizeRealEventPoint(e).logicalCode))
  const seqS = collapseGtSequence(sorted.map((e) => logicalPointToSToken(e)).filter((x) => x !== 'SX'))
  const matrix = pickBestMatrix(sess)

  let expectedJoined = ''
  let circuit_type = 'SIN_MATRIZ_OPERATIVO'
  if (matrix) {
    expectedJoined = matrix.expected_sequence_joined
    circuit_type = matrix.circuit_type
  }

  const missingCoreTokens = matrix ? missingAgainstCore(sess, matrix) : []

  const hasEntryTok =
    /\bS[01]\b/.test(seqS) ||
    /\bPREINGRESO|INGRESO\b/i.test(logicalGt) ||
    sess.events.some((e) =>
      ['INGRESO', 'PREINGRESO', 'PREINGRESO_EGRESO'].includes(normalizeRealEventPoint(e).logicalCode)
    )
  const hasExitTok = seqS.includes('S10') || logicalGt.includes('EGRESO')

  const operativeScore = Math.max(0, Math.min(100, breakdown.raw_score))

  let reconstructionReason = ''

  let status: ClassifiedOperationalCircuit['circuit_status'] = 'INCOMPLETO_NO_RECUPERABLE'

  const coreOkEnough =
    matrix && missingCoreTokens.length === 0
      ? true
      : Boolean(
          matrix &&
            missingCoreTokens.length <= 2 &&
            hasCargoLike(seqS) &&
            (hasCalada(sess) || seqS.includes('S4'))
        )

  const canStrongComplete =
    matrix &&
    missingCoreTokens.length === 0 &&
    hasEntryTok &&
    hasExitTok &&
    operativeScore >= 85 &&
    !breakdown.illogical

  if (breakdown.illogical) {
    status = 'ANOMALIA'
    reconstructionReason = 'SECUENCIA_TEMPORAL_INCOHERENTE'
  } else if (canStrongComplete && !breakdown.loop_bonus) {
    status = 'COMPLETO_CONFIRMADO'
    reconstructionReason = ''
  } else if (canStrongComplete && breakdown.loop_bonus) {
    status = 'VARIACION_OPERATIVA'
    reconstructionReason = 'LOOP_OPERATIVO_PERO_CIERRE_CONFIRMADO'
  } else if (
    breakdown.loop_bonus &&
    operativeScore >= 40 &&
    seqS.length >= 4 &&
    breakdown.logical_order_bonus &&
    !canStrongComplete
  ) {
    status = 'VARIACION_OPERATIVA'
    reconstructionReason = 'LOOP_OPERATIVO_S4_COMPATIBLE'
  } else if (
    matrix &&
    (missingCoreTokens.length === 0 || (missingCoreTokens.length <= 2 && coreOkEnough)) &&
    operativeScore >= matrix.minimum_score &&
    (hasCargoLike(seqS) || hasCalada(sess))
  ) {
    status = 'COMPLETO_RECONSTRUIDO'
    reconstructionReason =
      sess.merged_fragment
        ? 'FUSION_PATENTE_SITE_VENTANA_4H'
        : !hasEntryTok
          ? 'FALTA_INGRESO_CORE_VISIBLE'
          : !hasExitTok
            ? 'FALTA_EGRESO_CORE_VISIBLE'
            : missingCoreTokens.length > 0
              ? 'CORE_PARCIAL_COMPATIBLE_MATRIZ'
              : 'SECUENCIA_OPERATIVA_CLARA'
  } else if (operativeScore >= 45 || (matrix && operativeScore >= matrix.minimum_score - 10 && seqS.includes('S4'))) {
    status = 'INCOMPLETO_RECUPERABLE'
    reconstructionReason =
      operativeScore >= 45 ? 'FRAGMENTOS_UTILES_REVISION' : 'CERCA_MINIMO_MATRIZ_BALANZA'
  } else if (sess.events.length <= 1) {
    status = 'INCOMPLETO_NO_RECUPERABLE'
    reconstructionReason = 'EVENTOS_AISLADOS'
  } else {
    status = 'INCOMPLETO_NO_RECUPERABLE'
    reconstructionReason = 'SEÑALES_INSUFICIENTES'
  }

  if (status === 'VARIACION_OPERATIVA' && operativeScore < 35 && !canStrongComplete) {
    status = 'INCOMPLETO_RECUPERABLE'
    reconstructionReason = reconstructionReason || 'LOOP_DEBIL'
  }

  let confidencePct = operativeScore
  if (status === 'COMPLETO_CONFIRMADO') confidencePct = Math.max(operativeScore, 90)
  else if (status === 'COMPLETO_RECONSTRUIDO') confidencePct = Math.max(operativeScore, 68)
  else if (status === 'VARIACION_OPERATIVA') confidencePct = Math.max(operativeScore, 62)
  else if (status === 'ANOMALIA') confidencePct = Math.min(operativeScore, 28)

  let missingPtsUnique = [...new Set(missingCoreTokens)].sort()

  if (!matrix && status !== 'ANOMALIA') {
    missingPtsUnique = []
    circuit_type = `${sess.site_id.toUpperCase()}_SIN_MATRIZ`
    if (operativeScore >= 55) {
      status = 'INCOMPLETO_RECUPERABLE'
      reconstructionReason = reconstructionReason || 'SIN_MATRIZ_SITE'
      confidencePct = Math.max(confidencePct, 42)
    } else if (sess.events.length >= 4 && status === 'INCOMPLETO_NO_RECUPERABLE') {
      status = 'INCOMPLETO_RECUPERABLE'
      reconstructionReason = reconstructionReason || 'FRAGMENTOS_MUCHOS_EVENTS'
    }
  }

  const missingJoin = [...new Set(missingCoreTokens)].sort().join('|')

  const reconstructed =
    status === 'COMPLETO_RECONSTRUIDO' ||
    status === 'VARIACION_OPERATIVA' ||
    sess.merged_fragment

  return {
    session: sess,
    matrix,
    observed_logical_sequence: logicalGt,
    observed_sequence: seqS,
    expected_sequence_joined: expectedJoined,
    circuit_type,
    circuit_status: status,
    confidence_pct: Math.round(confidencePct * 10) / 10,
    missing_points: missingJoin,
    missing_points_count: missingPtsUnique.length,
    reconstructed,
    reconstruction_reason: reconstructionReason,
    score_breakdown: breakdown,
  }
}


function reconstructionRateFrom(classifiedList: readonly ClassifiedOperationalCircuit[]): number {
  const n = classifiedList.length
  if (n === 0) return 0
  let u = 0
  for (const c of classifiedList) {
    if (
      c.circuit_status === 'COMPLETO_CONFIRMADO' ||
      c.circuit_status === 'COMPLETO_RECONSTRUIDO' ||
      c.circuit_status === 'VARIACION_OPERATIVA'
    )
      u++
  }
  return Math.round((u / n) * 100000) / 100000
}

function platesForPairing(sess: ReconstructedOperationalSession): string[] {
  const s = [...new Set(sess.source_plates_strict.map(normalizePlateStrict).filter((x) => x.length >= 5))]
  return s.length > 0 ? s : [normalizePlateStrict(sess.normalized_plate)].filter(Boolean)
}

function setsIntersectStrictPlates(sa: readonly string[], sb: readonly string[]): boolean {
  const bs = new Set(sb.map(normalizePlateStrict))
  return sa.some((x) => bs.has(normalizePlateStrict(x)))
}

function bestPlateBetweenSessions(sa: readonly string[], sb: readonly string[]): {
  sim: number
  lev: number
  pa: string
  pb: string
} {
  let bestSim = -1
  let bestLev = Number.POSITIVE_INFINITY
  let pa = sa[0] ?? ''
  let pb = sb[0] ?? ''
  for (const x of sa) {
    const nx = normalizePlateStrict(x)
    if (nx.length < 5) continue
    for (const y of sb) {
      const ny = normalizePlateStrict(y)
      if (ny.length < 5) continue
      const sim = plateSimilarityScore(nx, ny)
      const lev = weightedOcrLevenshtein(nx, ny)
      if (sim > bestSim || (sim === bestSim && lev < bestLev)) {
        bestSim = sim
        bestLev = lev
        pa = nx
        pb = ny
      }
    }
  }
  if (!Number.isFinite(bestLev)) bestLev = 99
  if (bestSim < 0) bestSim = 0
  return { sim: bestSim, lev: bestLev, pa, pb }
}

function circuitStatusRankFusion(st: ClassifiedOperationalCircuit['circuit_status']): number {
  switch (st) {
    case 'ANOMALIA':
      return 0
    case 'INCOMPLETO_NO_RECUPERABLE':
      return 1
    case 'INCOMPLETO_RECUPERABLE':
      return 2
    case 'COMPLETO_RECONSTRUIDO':
    case 'VARIACION_OPERATIVA':
      return 3
    case 'COMPLETO_CONFIRMADO':
      return 4
    default:
      return 1
  }
}

function seeksFuzzyOcrPartner(c: ClassifiedOperationalCircuit): boolean {
  const st = c.circuit_status
  if (st === 'ANOMALIA') return false
  const seq = c.observed_sequence
  const logical = c.observed_logical_sequence
  const hasS0 = seq.includes('S0')
  const hasS1 = seq.includes('S1')
  const hasEntryEarly = hasS0 || hasS1 || /\bPREINGRESO\b|\bINGRESO\b/i.test(logical)
  const hasCoreMid =
    seq.includes('S5') || seq.includes('S6') || seq.includes('S7') || (seq.includes('S4') && seq.includes('S2'))
  const hasExit = seq.includes('S10') || /\bEGRESO\b/i.test(logical)
  if (st === 'INCOMPLETO_RECUPERABLE') return true
  if (st === 'INCOMPLETO_NO_RECUPERABLE' && c.session.events.length > 1) return true
  if (hasEntryEarly && !hasCoreMid && c.session.events.length >= 2) return true
  if (hasCoreMid && (!hasEntryEarly || !hasExit)) return true
  return false
}

function mergeImprovesOutcome(
  bi: ClassifiedOperationalCircuit,
  bj: ClassifiedOperationalCircuit,
  merged: ClassifiedOperationalCircuit,
  levD: number,
  maxGapMinutesTrail: number
): boolean {
  if (merged.circuit_status === 'ANOMALIA') return false
  const rBefore = Math.max(circuitStatusRankFusion(bi.circuit_status), circuitStatusRankFusion(bj.circuit_status))
  const rAfter = circuitStatusRankFusion(merged.circuit_status)
  const rawBefore = Math.max(bi.score_breakdown.raw_score, bj.score_breakdown.raw_score)
  const rawAfter = merged.score_breakdown.raw_score
  const incomBefore =
    bi.circuit_status === 'INCOMPLETO_RECUPERABLE' ||
    bi.circuit_status === 'INCOMPLETO_NO_RECUPERABLE' ||
    bj.circuit_status === 'INCOMPLETO_RECUPERABLE' ||
    bj.circuit_status === 'INCOMPLETO_NO_RECUPERABLE'
  const usefulAfter =
    merged.circuit_status === 'COMPLETO_CONFIRMADO' ||
    merged.circuit_status === 'COMPLETO_RECONSTRUIDO' ||
    merged.circuit_status === 'VARIACION_OPERATIVA'
  if (levD >= 2 && (!usefulAfter || !incomBefore || maxGapMinutesTrail > STRONG_MERGE_MAX_GAP_MIN)) return false
  if (rAfter > rBefore) return true
  if (incomBefore && usefulAfter && rawAfter >= rawBefore - 2) return true
  if (rawAfter > rawBefore + 5) return true
  return false
}

function mergeOperationalSessionPair(
  a: ReconstructedOperationalSession,
  b: ReconstructedOperationalSession,
  eventsSorted: RealJourneyEventDto[],
  pairSim: number,
  exactPlate: boolean
): ReconstructedOperationalSession {
  const unitedStrict = [
    ...new Set(
      [...a.source_plates_strict, ...b.source_plates_strict].map(normalizePlateStrict).filter((x) => x.length >= 5)
    ),
  ].sort()
  const canonical = canonicalPlateFromEvents(eventsSorted, unitedStrict[0] ?? a.canonical_plate)
  const uids = [...new Set([...a.source_journey_uids, ...b.source_journey_uids])].sort()
  const t0 = eventTs(eventsSorted[0]!)
  const sjid = `rv2fm_${a.site_id}_${hashShort(canonical)}_${Number.isFinite(t0) ? t0 : Date.now()}_${hashShort(uids.join(','))}`
  let plateType: PlateMatchType
  if (exactPlate && unitedStrict.length === 1 && a.plate_match_type === 'EXACT' && b.plate_match_type === 'EXACT')
    plateType = 'EXACT'
  else if (!exactPlate) plateType = 'FUZZY_OCR'
  else plateType = 'MIXED'
  const fuzzyBump = exactPlate ? 0 : 1
  return {
    reconstructed_journey_id: sjid,
    source_journey_uids: uids,
    events: [...eventsSorted],
    normalized_plate: canonical,
    site_id: a.site_id,
    merged_fragment: true,
    source_plates_strict: unitedStrict,
    canonical_plate: canonical,
    plate_match_type: plateType,
    plate_match_confidence: Math.round(Math.min(a.plate_match_confidence, b.plate_match_confidence, pairSim || 1) * 1000) / 1000,
    fuzzy_merged_count: a.fuzzy_merged_count + b.fuzzy_merged_count + fuzzyBump,
  }
}

export type ControlledOcrMergeExample = {
  reconstructed_journey_id: string
  merge_reason: string
  plate_similarity_score: number
  source_plates: string
  canonical_plate: string
  time_gap_minutes: number
  score_before: number
  score_after: number
  rank_before: number
  rank_after: number
}

export type ControlledOcrFusionStats = {
  fuzzy_merge_count: number
  exact_merge_count: number
  circuits_improved_by_fuzzy: number
  reconstruction_rate_before_fuzzy: number
  reconstruction_rate_after_fuzzy: number
  merge_examples: ControlledOcrMergeExample[]
}

export function fusePlateClustersByControlledOcr(sessions: ReconstructedOperationalSession[]): {
  fused: ReconstructedOperationalSession[]
  stats: ControlledOcrFusionStats
} {
  type Block = { session: ReconstructedOperationalSession; classified: ClassifiedOperationalCircuit }

  let blocks: Block[] = sessions.map((session) => ({
    session,
    classified: classifyOperationalSession(session),
  }))

  const reconstruction_rate_before_fuzzy = reconstructionRateFrom(blocks.map((b) => b.classified))
  let fuzzy_merge_count = 0
  let exact_merge_count = 0
  let circuits_improved_by_fuzzy = 0
  const mergeExamples: ControlledOcrMergeExample[] = []

  const maxGapMs = CIRCUIT_V2_DEFAULT_MAX_GAP_MS
  const maxSweeps = Math.min(500, Math.max(64, blocks.length * blocks.length))

  for (let sweep = 0; sweep < maxSweeps && blocks.length >= 2; sweep++) {
    let picked: null | {
      gain: number
      lo: number
      hi: number
      nb: Block
      exPlate: boolean
      simScore: number
      maxGapM: number
    } = null

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const bi = blocks[i]!.session
        const bj = blocks[j]!.session
        const ci = blocks[i]!.classified
        const cj = blocks[j]!.classified
        if (bi.site_id !== bj.site_id) continue
        if (!seeksFuzzyOcrPartner(ci) && !seeksFuzzyOcrPartner(cj)) continue

        const pa = platesForPairing(bi)
        const pb = platesForPairing(bj)
        const exactPlate = setsIntersectStrictPlates(pa, pb)
        let simScore = 1
        let levD = 0
        if (exactPlate) {
          simScore = 1
          levD = 0
        } else {
          const m = bestPlateBetweenSessions(pa, pb)
          if (!isLikelyOcrPlateMatch(m.pa, m.pb)) continue
          simScore = m.sim
          levD = m.lev
        }

        const trial = [...bi.events, ...bj.events].sort((a, b) => compareRealEvents(a, b))
        if (!validateMergedTimeline(trial, maxGapMs)) continue
        const gapM = maxAdjacentGapMinutes(trial)
        const mergedSession = mergeOperationalSessionPair(bi, bj, trial, simScore, exactPlate)
        const classifiedMerged = classifyOperationalSession(mergedSession)
        if (!mergeImprovesOutcome(ci, cj, classifiedMerged, levD, gapM)) continue

        const rBeforeMax = Math.max(circuitStatusRankFusion(ci.circuit_status), circuitStatusRankFusion(cj.circuit_status))
        const rAfter = circuitStatusRankFusion(classifiedMerged.circuit_status)
        const rawBefore = Math.max(ci.score_breakdown.raw_score, cj.score_breakdown.raw_score)
        const rawAfter = classifiedMerged.score_breakdown.raw_score
        const gain = (rAfter - rBeforeMax) * 300 + Math.floor(rawAfter - rawBefore + simScore * 35)

        if (
          !picked ||
          gain > picked.gain ||
          (gain === picked.gain && simScore > picked.simScore) ||
          (gain === picked.gain && simScore === picked.simScore && gapM < picked.maxGapM)
        ) {
          picked = {
            gain,
            lo: i,
            hi: j,
            nb: { session: mergedSession, classified: classifiedMerged },
            exPlate: exactPlate,
            simScore,
            maxGapM: gapM,
          }
        }
      }
    }

    if (!picked) break

    const ic = blocks[picked.lo]!.classified
    const jc = blocks[picked.hi]!.classified
    const is = blocks[picked.lo]!.session
    const js = blocks[picked.hi]!.session

    if (picked.exPlate) exact_merge_count++
    else fuzzy_merge_count++

    const rBeforeMax = Math.max(circuitStatusRankFusion(ic.circuit_status), circuitStatusRankFusion(jc.circuit_status))
    const rawBeforeMax = Math.max(ic.score_breakdown.raw_score, jc.score_breakdown.raw_score)
    const incomParents =
      ic.circuit_status === 'INCOMPLETO_RECUPERABLE' ||
      ic.circuit_status === 'INCOMPLETO_NO_RECUPERABLE' ||
      jc.circuit_status === 'INCOMPLETO_RECUPERABLE' ||
      jc.circuit_status === 'INCOMPLETO_NO_RECUPERABLE'

    const usefulChild =
      picked.nb.classified.circuit_status === 'COMPLETO_RECONSTRUIDO' ||
      picked.nb.classified.circuit_status === 'VARIACION_OPERATIVA' ||
      picked.nb.classified.circuit_status === 'COMPLETO_CONFIRMADO'

    if (!picked.exPlate && incomParents && usefulChild) circuits_improved_by_fuzzy++

    const srcPlates = [...new Set([...is.source_plates_strict, ...js.source_plates_strict])].sort().join('|')
    mergeExamples.push({
      reconstructed_journey_id: picked.nb.session.reconstructed_journey_id,
      merge_reason: picked.exPlate ? 'EXACT_PLATE_SPLIT_REJOIN' : 'FUZZY_OCR_SCORE_TEMPO',
      plate_similarity_score: Math.round(picked.simScore * 1000) / 1000,
      source_plates: srcPlates,
      canonical_plate: picked.nb.session.canonical_plate,
      time_gap_minutes: Math.round(picked.maxGapM * 10) / 10,
      score_before: Math.round(rawBeforeMax * 10) / 10,
      score_after: Math.round(picked.nb.classified.score_breakdown.raw_score * 10) / 10,
      rank_before: rBeforeMax,
      rank_after: circuitStatusRankFusion(picked.nb.classified.circuit_status),
    })

    const hi = Math.max(picked.lo, picked.hi)
    const lo = Math.min(picked.lo, picked.hi)
    blocks.splice(hi, 1)
    blocks.splice(lo, 1, picked.nb)
  }

  const classifiedAfter = blocks.map((b) => b.classified)

  const stats: ControlledOcrFusionStats = {
    fuzzy_merge_count,
    exact_merge_count,
    circuits_improved_by_fuzzy,
    reconstruction_rate_before_fuzzy,
    reconstruction_rate_after_fuzzy: reconstructionRateFrom(classifiedAfter),
    merge_examples: mergeExamples
      .slice()
      .sort((x, y) => y.score_after - y.score_before - (x.score_after - x.score_before)),
  }

  return { fused: blocks.map((b) => b.session), stats }
}

export type QualitySummaryCounts = {
  raw_events_count: number
  raw_journeys_count: number
  reconstructed_journeys_count: number
  complete_confirmed_count: number
  complete_reconstructed_count: number
  operational_variation_count: number
  incomplete_recoverable_count: number
  incomplete_unrecoverable_count: number
  anomaly_count: number
  reconstruction_rate: number
  avg_confidence: number
  merged_journeys_count: number
  inferred_missing_points_count: number
  fuzzy_merge_count: number
  exact_merge_count: number
  circuits_improved_by_fuzzy: number
  reconstruction_rate_before_fuzzy: number
  reconstruction_rate_after_fuzzy: number
}

export function buildQualitySummary(
  classified: ClassifiedOperationalCircuit[],
  rawEventsCountHint: number,
  rawJourneyUidsDistinct: number
): QualitySummaryCounts {
  let complete_confirmed_count = 0
  let complete_reconstructed_count = 0
  let operational_variation_count = 0
  let incomplete_recoverable_count = 0
  let incomplete_unrecoverable_count = 0
  let anomaly_count = 0
  let merged_journeys_count = 0
  let inferredMissing = 0
  let confidenceSum = 0

  for (const c of classified) {
    confidenceSum += c.confidence_pct
    if (c.session.merged_fragment) merged_journeys_count++
    inferredMissing += c.missing_points_count
    switch (c.circuit_status) {
      case 'COMPLETO_CONFIRMADO':
        complete_confirmed_count++
        break
      case 'COMPLETO_RECONSTRUIDO':
        complete_reconstructed_count++
        break
      case 'VARIACION_OPERATIVA':
        operational_variation_count++
        break
      case 'INCOMPLETO_RECUPERABLE':
        incomplete_recoverable_count++
        break
      case 'INCOMPLETO_NO_RECUPERABLE':
        incomplete_unrecoverable_count++
        break
      case 'ANOMALIA':
        anomaly_count++
        break
    }
  }

  const n = classified.length
  const useful = complete_confirmed_count + complete_reconstructed_count + operational_variation_count
  const reconstruction_rate = n === 0 ? 0 : Math.round((useful / n) * 100000) / 100000

  return {
    raw_events_count: rawEventsCountHint,
    raw_journeys_count: rawJourneyUidsDistinct,
    reconstructed_journeys_count: n,
    complete_confirmed_count,
    complete_reconstructed_count,
    operational_variation_count,
    incomplete_recoverable_count,
    incomplete_unrecoverable_count,
    anomaly_count,
    reconstruction_rate,
    avg_confidence: n === 0 ? 0 : Math.round((confidenceSum / n) * 1000) / 1000,
    merged_journeys_count,
    inferred_missing_points_count: inferredMissing,
    fuzzy_merge_count: 0,
    exact_merge_count: 0,
    circuits_improved_by_fuzzy: 0,
    reconstruction_rate_before_fuzzy: 0,
    reconstruction_rate_after_fuzzy: reconstruction_rate,
  }
}

function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

function csvFrom(headers: readonly string[], rows: string[][]): string {
  return '\uFEFF' + [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n')
}

function summarizeEtlReason(c: ClassifiedOperationalCircuit): string {
  const parts = [c.reconstruction_reason, c.circuit_status, c.score_breakdown.illogical ? 'ILOGICO' : ''].filter(Boolean)
  return [...new Set(parts)].join('|').slice(0, 420)
}

function incompleteBucketMotivo(c: ClassifiedOperationalCircuit): string | null {
  const st = c.circuit_status
  if (st !== 'INCOMPLETO_RECUPERABLE' && st !== 'INCOMPLETO_NO_RECUPERABLE') return null
  const logical = c.observed_logical_sequence
  const hasIn = /\bPREINGRESO|INGRESO\b/i.test(logical)
  const hasOut = /\bEGRESO\b/i.test(logical)

  const ocrSuspect = c.session.events.length > 0 && c.session.events.every((e) => !e.isValidPlate)

  if (ocrSuspect && c.session.events.length >= 2) return 'ruido_ocr'
  if (hasIn && !hasOut && c.session.events.length <= 4) return 'solo_ingreso'
  if (!hasIn && hasOut && c.session.events.length <= 4) return 'solo_egreso'
  const miss = c.missing_points
  if (miss.includes('S10') || (!hasOut && c.session.events.length >= 6)) return 'falta_egreso'
  if (/\bS0\b|\bS1\b/i.test('|' + logical + '|') === false || miss.includes('S0') || miss.includes('S1'))
    return 'falta_ingreso'

  const stepsLogical = logical.split('>').filter(Boolean).length
  if (st === 'INCOMPLETO_RECUPERABLE' && c.missing_points_count === 0 && stepsLogical >= 5)
    return 'secuencia_central_completa'

  if (c.session.source_journey_uids.length > 1) return 'journey_partido'

  return 'insuficiente'
}

export type CircuitV2NamedCsv = { filename: string; csv: string }

/**
 * Índices de viaje UID distintos en la entrada operativa (para métricas).
 */
export function distinctJourneyUidCount(events: RealJourneyEventDto[]): number {
  const u = new Set(events.map((e) => String(e.journeyUid ?? '').trim()).filter(Boolean))
  return u.size
}

/** Genera CSV v2 desde eventos ya operativos (p. ej. segmentedOperationalEvents del comité). */
export function buildCircuitEtlV2CsvBundle(
  operationalEvents: RealJourneyEventDto[],
  opts: { rawEventsCountHint?: number; /** Omitir artefactos v2 sólo-debug (fusión OCR, score debug); reduce RAM/CPU si el ZIP es `POWER_BI_COMMITTEE_FILENAMES`. */
    committeePowerBiSubset?: boolean } = {}
): CircuitV2NamedCsv[] {
  const committeeSubset = Boolean(opts.committeePowerBiSubset)
  const rawHint = opts.rawEventsCountHint ?? operationalEvents.length
  const journeysHint = distinctJourneyUidCount(operationalEvents)

  const sessionsExact = buildOperationalSessionsPlateSite(operationalEvents)
  const { fused: sessions, stats: fusionStats } = fusePlateClustersByControlledOcr(sessionsExact)
  const classified = sessions.map(classifyOperationalSession)
  const qBase = buildQualitySummary(classified, rawHint, journeysHint)
  const { merge_examples: topMergeExamplesRaw, ...fusionMetrics } = fusionStats
  const q: QualitySummaryCounts = {
    ...qBase,
    fuzzy_merge_count: fusionMetrics.fuzzy_merge_count,
    exact_merge_count: fusionMetrics.exact_merge_count,
    circuits_improved_by_fuzzy: fusionMetrics.circuits_improved_by_fuzzy,
    reconstruction_rate_before_fuzzy: fusionMetrics.reconstruction_rate_before_fuzzy,
    reconstruction_rate_after_fuzzy: fusionMetrics.reconstruction_rate_after_fuzzy,
  }

  const FACT_CIR_HEADERS = [
    'reconstructed_journey_id',
    'source_journey_uids',
    'source_journey_count',
    'plate',
    'normalized_plate',
    'canonical_plate',
    'source_plates',
    'site_id',
    'started_at',
    'ended_at',
    'duration_minutes',
    'observed_sequence',
    'expected_sequence',
    'circuit_type',
    'circuit_status',
    'confidence',
    'missing_points',
    'missing_points_count',
    'reconstructed',
    'reconstruction_reason',
    'event_count',
    'score_raw',
    'plate_match_type',
    'plate_match_confidence',
    'fuzzy_merged_count',
    'etl_reason',
  ] as const

  const SCORE_DBG_HEADERS = [
    'reconstructed_journey_id',
    'normalized_plate',
    'score_raw',
    'bonuses',
    'penalties',
    'logical_order_ok',
    'loop_bonus',
    'illogical',
    'time_penalty',
    'circuit_status',
    'matrix_circuit_type',
    'observed_logical',
    'expected_sequence',
  ] as const

  const RECON_FRAG_HEADERS = [
    'reconstructed_journey_id',
    'merge_reason',
    'plate_similarity_score',
    'source_plates',
    'canonical_plate',
    'time_gap_minutes',
    'score_before_merge',
    'score_after_merge',
    'rank_before',
    'rank_after',
  ] as const

  const incompletosMap = new Map<string, number>()

  const factRows: string[][] = []
  const scoreDebugRows: string[][] = []
  const reconstructedRows: string[][] = committeeSubset
    ? []
    : topMergeExamplesRaw.map((m) => [
        m.reconstructed_journey_id,
        m.merge_reason,
        String(m.plate_similarity_score),
        m.source_plates,
        m.canonical_plate,
        String(m.time_gap_minutes),
        String(m.score_before),
        String(m.score_after),
        String(m.rank_before),
        String(m.rank_after),
      ])

  for (const c of classified) {
    const ev = c.session.events
    const sorted = [...ev].sort((a, b) => compareRealEvents(a, b))
    const start = sorted[0]!
    const end = sorted[sorted.length - 1]!

    const durationMinutesNum =
      sorted.length >= 2 && Number.isFinite(eventTs(end) - eventTs(start))
        ? Math.max(1, Math.round((eventTs(end) - eventTs(start)) / MS_MIN))
        : 1

    factRows.push([
      c.session.reconstructed_journey_id,
      c.session.source_journey_uids.join('|'),
      String(c.session.source_journey_uids.length),
      start?.truckPlate ?? '',
      c.session.normalized_plate,
      c.session.canonical_plate,
      c.session.source_plates_strict.join('|'),
      c.session.site_id,
      start?.occurredAt ?? '',
      end?.occurredAt ?? '',
      String(durationMinutesNum),
      c.observed_sequence,
      c.expected_sequence_joined,
      c.circuit_type,
      c.circuit_status,
      String(c.confidence_pct),
      c.missing_points,
      String(c.missing_points_count),
      c.reconstructed ? 'true' : 'false',
      c.reconstruction_reason,
      String(ev.length),
      String(Math.round(c.score_breakdown.raw_score)),
      c.session.plate_match_type,
      String(c.session.plate_match_confidence),
      String(c.session.fuzzy_merged_count),
      summarizeEtlReason(c),
    ])

    if (!committeeSubset) {
      scoreDebugRows.push([
        c.session.reconstructed_journey_id,
        c.session.normalized_plate,
        String(Math.round(c.score_breakdown.raw_score)),
        String(c.score_breakdown.bonuses),
        String(c.score_breakdown.penalties),
        c.score_breakdown.logical_order_bonus ? 'true' : 'false',
        c.score_breakdown.loop_bonus ? 'true' : 'false',
        c.score_breakdown.illogical ? 'true' : 'false',
        c.score_breakdown.time_penalty ? 'true' : 'false',
        c.circuit_status,
        c.matrix?.circuit_type ?? '',
        c.observed_logical_sequence,
        c.expected_sequence_joined,
      ])
    }

    const b = incompleteBucketMotivo(c)
    if (b) incompletosMap.set(b, (incompletosMap.get(b) ?? 0) + 1)
  }

  const FACT_EVT_HEADERS = [
    'event_id',
    'reconstructed_journey_id',
    'source_journey_uid',
    'plate',
    'normalized_plate',
    'occurred_at',
    'sector_code',
    'device_code',
    'logical_point',
    'event_order',
    'is_valid_plate',
  ] as const

  const factEvtRows: string[][] = []
  for (const c of classified) {
    const sorted = [...c.session.events].sort((a, b) => compareRealEvents(a, b))
    sorted.forEach((ev, idx) => {
      const nf = normalizeRealEventPoint(ev)
      factEvtRows.push([
        String(ev.id),
        c.session.reconstructed_journey_id,
        ev.journeyUid,
        ev.truckPlate,
        ev.normalizedPlate ?? '',
        ev.occurredAt,
        ev.sectorCode,
        ev.deviceCode,
        nf.logicalCode,
        String(idx + 1),
        ev.isValidPlate ? 'true' : 'false',
      ])
    })
  }

  const SUMMARY_HEADERS = [
    'metric_key',
    'metric_value',
  ] as const

  const sumRows = (Object.entries(q) as [keyof QualitySummaryCounts, QualitySummaryCounts[keyof QualitySummaryCounts]][])
    .map(([k, v]) => [`${String(k)}`, typeof v === 'number' ? String(v) : String(v)])

  const incompleteRows = [...incompletosMap.entries()].map(([motivo, n]) => [motivo, String(n)])

  const coreV2: CircuitV2NamedCsv[] = [
    { filename: CIRCUIT_ETL_V2_FILENAMES.clean_circuits_v2, csv: csvFrom([...FACT_CIR_HEADERS], factRows) },
    { filename: CIRCUIT_ETL_V2_FILENAMES.clean_events_v2, csv: csvFrom([...FACT_EVT_HEADERS], factEvtRows) },
    {
      filename: CIRCUIT_ETL_V2_FILENAMES.etl_quality_summary_v2,
      csv: csvFrom([...SUMMARY_HEADERS], sumRows),
    },
    {
      filename: CIRCUIT_ETL_V2_FILENAMES.incompletos_por_motivo,
      csv: csvFrom(['motivo', 'count'], incompleteRows.sort((a, b) => a[0].localeCompare(b[0]))),
    },
  ]

  if (committeeSubset) return coreV2

  return [
    ...coreV2,
    {
      filename: CIRCUIT_ETL_V2_FILENAMES.reconstructed_from_fragments,
      csv: csvFrom([...RECON_FRAG_HEADERS], reconstructedRows),
    },
    {
      filename: CIRCUIT_ETL_V2_FILENAMES.circuit_score_debug,
      csv: csvFrom([...SCORE_DBG_HEADERS], scoreDebugRows),
    },
    {
      filename: CIRCUIT_ETL_V2_FILENAMES.circuit_fuzzy_merge_top,
      csv: csvFrom(
        [
          ...RECON_FRAG_HEADERS,
        ],
        topMergeExamplesRaw.slice(0, 40).map((m) => [
          m.reconstructed_journey_id,
          m.merge_reason,
          String(m.plate_similarity_score),
          m.source_plates,
          m.canonical_plate,
          String(m.time_gap_minutes),
          String(m.score_before),
          String(m.score_after),
          String(m.rank_before),
          String(m.rank_after),
        ])
      ),
    },
  ]
}
