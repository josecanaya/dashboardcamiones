import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import { occurredAtLocalDayKey } from '../../../services/realJourneyQuality'
import {
  compareRealEvents,
  reconstructRealJourneysIncludingInvalidPlates,
} from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { isEtlRearCameraDevice } from './etlRearDevices'
import { recordsToCsv } from './etlCsv'
import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import {
  computeJourneyReliability,
  confidenceLevelFromScore,
  finalStatusLabel,
  journeyDeviceSectorLogical,
  journeyHasBalansaCompleta,
  journeyHasLogicalEgreso,
  journeyHasStrongConfidenceBonus,
  journeyHasRicB2EgresoDevice,
  journeyHasStrongDefiningPoint,
  journeySequenceCoherent,
  resolveFinalStatus,
  resolveOperationalEntry,
  resolveOperationalExit,
  type FinalCircuitStatus,
} from './finalCircuitScoring'

export const ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v4'
export type { FinalCircuitStatus } from './finalCircuitScoring'
export { finalStatusLabel } from './finalCircuitScoring'

/** Cámara frontal de ingreso de referencia (comité Truckflow vs ingresos reales). Comparación trim + lowercase. */
const INGRESO_FRONT_REFERENCE_DEVICE_NORM = 'ricingcamfrente'
const INGRESO_FRONT_REFERENCE_SECTOR_NORM = 'ricardone_ingreso_camiones'

function normDeviceOrSector(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, '_') : ''
}

function isIngresoFrontalReferenceEvent(e: RealJourneyEventDto): boolean {
  return normDeviceOrSector(e.deviceCode) === INGRESO_FRONT_REFERENCE_DEVICE_NORM &&
    normDeviceOrSector(e.sectorCode) === INGRESO_FRONT_REFERENCE_SECTOR_NORM
}

/** Ventana máxima entre journeys para candidatos merge (minutos). */
const MERGE_CANDIDATE_MAX_GAP_MINUTES = 120
const MERGE_SIMILAR_THRESHOLD = 0.8
const MERGE_TOP_LIMIT = 500

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

function parsePayloadRecord(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown
      if (j && typeof j === 'object') return j as Record<string, unknown>
    } catch {
      return {}
    }
    return {}
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

function pickStr(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function getAlertPayload(a: RealAlertDto): Record<string, unknown> {
  return parsePayloadRecord(a.payload)
}

/** Código tal como en API; prioriza `alertCode`. */
function getAlertApiCode(a: RealAlertDto): string {
  const c = pickStr(a.alertCode) || pickStr(a.alertType) || pickStr(a.type)
  return c
}

/** Dispositivo efectivo: nivel raíz o dentro de payload. */
function getEffectiveAlertDeviceCode(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return (
    pickStr(a.deviceCode) ||
    pickStr(a.device) ||
    pickStr(p.deviceCode) ||
    pickStr(p.device) ||
    pickStr(p.cameraCode) ||
    '?'
  )
}

function getEffectiveAlertSectorCode(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return pickStr(a.sectorCode) || pickStr(a.sector) || pickStr(p.sectorCode) || pickStr(p.sector) || '?'
}

function alertOccurredAtIso(a: RealAlertDto): string {
  const p = getAlertPayload(a)
  return (
    pickStr(a.occurredAt) ||
    pickStr(a.createdAt) ||
    pickStr(a.recordedAt) ||
    pickStr(a.modifiedAt) ||
    pickStr(p.occurredAt) ||
    pickStr(p.createdAt) ||
    pickStr((p as { timestamp?: unknown }).timestamp) ||
    ''
  )
}

function isLprMalfunctionAlert(a: RealAlertDto): boolean {
  return getAlertApiCode(a).toUpperCase() === 'LPR_MALFUNCTION'
}

function flattenAlertForEtlCsv(a: RealAlertDto): Record<string, unknown> {
  const p = getAlertPayload(a)
  const deviceCode = getEffectiveAlertDeviceCode(a)
  const sectorCode = getEffectiveAlertSectorCode(a)
  const trailerPlate = pickStr(a.trailerPlate) || pickStr(p.trailerPlate)
  const truckPlate = pickStr(a.truckPlate) || pickStr(a.plate) || pickStr(p.truckPlate) || pickStr(p.plate)
  const payloadJson = Object.keys(p).length ? JSON.stringify(p) : ''

  return {
    id: a.id ?? '',
    version: pickStr(a.version),
    createdAt: pickStr(a.createdAt),
    modifiedAt: pickStr(a.modifiedAt),
    alertCode: getAlertApiCode(a),
    severity: pickStr(a.severity) ?? String(a.alertLevel ?? ''),
    status: pickStr(a.status),
    journeyUid: pickStr(a.journeyUid) || pickStr(a.journeyUuid) || pickStr(p.journeyUid) || pickStr(p.journeyUuid),
    truckPlate,
    trailerPlate,
    sectorCode,
    deviceCode,
    description:
      pickStr(a.description) ||
      pickStr(a.message) ||
      pickStr(a.reason) ||
      pickStr(p.description) ||
      pickStr(p.message),
    payload: payloadJson,
    payload_plate: pickStr(p.plate) || pickStr(p.truckPlate),
    payload_normalized_plate: pickStr(p.normalizedPlate) || pickStr(p.normalized_plate),
    payload_event_id: pickStr(p.eventId) || pickStr(p.event_id) || pickStr(p.id),
    payload_device_code: pickStr(p.deviceCode) || pickStr(p.device),
    camera_type: isEtlRearCameraDevice(deviceCode) ? 'rear' : 'front',
    occurredAt: alertOccurredAtIso(a),
  }
}

function parseLocalDateFromIsoMaybe(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}

/** Número ISO de semana (lunes como inicio): YYYYWW */
function isoWeekMondayKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}W${String(weekNo).padStart(2, '0')}`
}

/** Franja horaria 4 horas etiquetada tipo 08–12 — hora LOCAL del cliente. */
function timeBucketFourHoursLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'unknown'
  const d = new Date(ts)
  const h = d.getHours()
  const bucket = Math.floor(h / 4) * 4
  const pad = (n: number) => String(n).padStart(2, '0')
  const endHour = bucket + 3
  return `${pad(bucket)}-${pad(endHour)}`
}

function dayNightLabel(iso: string): string {
  const ts = Date.parse(iso)
  if (Number.isNaN(ts)) return 'unknown'
  const h = new Date(ts).getHours()
  return h >= 7 && h < 19 ? 'dia' : 'noche'
}

function statusFromLprRate(events: number, lprAlerts: number): string {
  if (events <= 0 && lprAlerts > 0) return 'Sin base de eventos'
  if (events <= 0) return 'Sin eventos'
  const r = (lprAlerts / events) * 100
  if (r > 100) return 'Crítico'
  if (r >= 30 && r <= 100) return 'Alto'
  if (r > 10 && r < 30) return 'Medio'
  /** 0 a 10 inclusivo */
  return 'Bajo'
}

function normalizePlateForSim(s: string): string {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/**
 * Score 0–1 aprox.: Levenshtein normalizado tras mapeos OCR comunes sueltos en la matriz.
 */
function digitizePlateVariants(s: string): string[] {
  const n = normalizePlateForSim(s)
  if (!n) return []
  let x = n
  const subst: [RegExp, string][] = [
    [/O|Q/g, '0'],
    [/I|L/g, '1'],
    [/S/g, '5'],
    [/B/g, '8'],
    [/G/g, '6'],
    [/Z/g, '2'],
    [/A/g, '4'],
  ]
  for (const [re, rep] of subst) {
    x = x.replace(re, rep)
  }
  return [n, x]
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/** 1 = igual, >0 menor similitud. */
function plateSimilarityScore(plateA: string, plateB: string): number {
  const va = digitizePlateVariants(plateA)
  const vb = digitizePlateVariants(plateB)
  let best = 0
  for (const a of va) {
    for (const b of vb) {
      if (!a || !b) continue
      const d = levenshtein(a, b)
      const denom = Math.max(a.length, b.length, 1)
      best = Math.max(best, Math.max(0, 1 - d / denom))
    }
  }
  return Math.round(best * 1000) / 1000
}

function distinctHas(seq: readonly string[], code: string): boolean {
  return new Set(seq.map((x) => String(x))).has(code)
}

function userCircuitTier(j: ReconstructedRealJourney): 'circuito_detectado' | 'circuito_incompleto' | 'sin_clasificar' {
  if (j.isDiscardedOperational) return 'circuito_incompleto'
  if (j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO') return 'sin_clasificar'
  return 'circuito_detectado'
}

function refinementLabel(j: ReconstructedRealJourney): string {
  const dr = new Set(j.logicalCodeSequence)
  const hasIngreso = dr.has('INGRESO')
  const hasPre = dr.has('PREINGRESO')
  const hasEgr = dr.has('EGRESO')
  const missing = j.missingExpectedPoints ?? []
  const missN = missing.length
  const tier = userCircuitTier(j)
  if (tier === 'sin_clasificar') return 'sin_clasificar'
  let tag = ''
  if (!hasIngreso && !hasPre && (hasEgr || dr.size >= 2)) tag = 'circuito_probable_sin_ingreso'
  else if (!hasEgr && (hasIngreso || hasPre)) tag = 'circuito_probable_sin_egreso'
  else if (missN >= 1 && missN <= 2) tag = 'circuito_probable'
  else if (missN > 2) tag = 'incompleto_revision'
  else tag = 'ok'

  if (journeyHasStrongDefiningPoint(j) && tag && tag !== 'ok') return `${tag}+punto_fuerte`
  return tag || '—'
}

export type EtlTransformInput = {
  events: RealJourneyEventDto[]
  alerts: RealAlertDto[]
  mergeWindowHours?: number
  loadedEventFilesCount: number
  loadedAlertFilesCount: number
}

export type EtlTransformOutput = {
  csv: Record<string, string>
  stats: {
    step1: {
      frontEvents: number
      rearEvents: number
      frontAlerts: number
      rearAlerts: number
      pctExcludedEvents: number
      deviceRearCounts: { device: string; count: number }[]
    }
    step2: {
      rows: number
      camerasWithEvents: number
      camerasWithLpr: number
      criticalCameras: number
      sinBaseCameras: number
      totalLprMalfunctionAlerts: number
      lprMalfunctionByCamera: { deviceCode: string; count: number }[]
      cameraWithMostLpr: string | null
    }
    coherence: {
      ingreso_frontal_event_count: number
      ingreso_frontal_unique_plates: number
      ingreso_frontal_unique_journeys: number
      ingresos_operativos_count: number
      total_journeys_raw: number
      rear_only_journeys_excluded: number
      journeys_after_rear_filter: number
      final_circuits_count: number
      final_classified_count: number
      final_incomplete_count: number
      final_circuitos_completos: number
      final_circuitos_probables: number
      final_circuitos_sin_ingreso: number
      final_circuitos_sin_egreso: number
      final_incompletos_revision: number
      final_descartados: number
      circuitos_con_ingreso_operativo: number
      circuitos_con_egreso_operativo: number
      circuitos_con_ingreso_y_egreso_operativo: number
      journey_vs_ingreso_ratio: number | null
      final_circuits_vs_ingreso_ratio: number | null
      journeyFragmentationWarn: boolean
      circuitsVersusIngresoWarn: boolean
      coherenceLabel: string
      coherenceDetail: string
      exclusionMotives: { motive: string; count: number }[]
    }
    step3: {
      journeysTotal: number
      journeysValidFront: number
      rearOnlyExcluded: number
      journeysWithRearEventsRemoved: number
      single_event_discarded: number
      duplicate_suspected: number
      incomplete_sequence_count: number
      classifiedCircuitsOperational: number
      incompleteOperational: number
      unclassifiedCount: number
      cleanJourneysCount: number
    }
    step4: {
      candidates: number
      candidatesBeforeCap: number
      byExactPlate: number
      bySimilarPlate: number
      bySequenceAndPlate: number
    }
    validation: {
      totalLprMalfunctionAlerts: number
      lprMalfunctionByCamera: { deviceCode: string; count: number }[]
      cameraWithMostLpr: string | null
      circuitosClasificados: number
      registrosIncompletosOperativos: number
      sinClasificar: number
      mergeCandidatesFiltered: number
      final_circuits_count: number
    }
  }
  rulesVersion: string
}

function summarizeDeviceRear(events: RealJourneyEventDto[]) {
  const m = new Map<string, number>()
  for (const e of events) {
    if (!isEtlRearCameraDevice(e.deviceCode)) continue
    const k = (e.deviceCode ?? '').trim() || '?'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()]
    .map(([device, count]) => ({ device, count }))
    .sort((a, b) => b.count - a.count)
}

export async function runEtlTransform(inp: EtlTransformInput): Promise<EtlTransformOutput> {
  await yieldToBrowser()
  /** —— Paso 1 —— */
  const frontEv: RealJourneyEventDto[] = []
  const rearEv: RealJourneyEventDto[] = []
  for (const e of inp.events) {
    if (isEtlRearCameraDevice(e.deviceCode)) rearEv.push(e)
    else frontEv.push(e)
  }
  const frontAl: RealAlertDto[] = []
  const rearAl: RealAlertDto[] = []
  for (const a of inp.alerts) {
    const dev = getEffectiveAlertDeviceCode(a)
    const devTrim = dev === '?' ? '' : dev
    if (isEtlRearCameraDevice(devTrim)) rearAl.push(a)
    else frontAl.push(a)
  }

  const allEv = inp.events.length
  const pctExcluded = allEv <= 0 ? 0 : Math.round((rearEv.length / allEv) * 1000) / 10

  const eventCols = [
    'id',
    'journeyUid',
    'sequenceNumber',
    'occurredAt',
    'truckPlate',
    'normalizedPlate',
    'isValidPlate',
    'sectorCode',
    'deviceCode',
    'eventType',
    'eventCategory',
  ] as const
  const evtRow = (e: RealJourneyEventDto) =>
    ({
      id: e.id,
      journeyUid: e.journeyUid,
      sequenceNumber: e.sequenceNumber,
      occurredAt: e.occurredAt,
      truckPlate: e.truckPlate,
      normalizedPlate: e.normalizedPlate,
      isValidPlate: e.isValidPlate,
      sectorCode: e.sectorCode,
      deviceCode: e.deviceCode,
      eventType: e.eventType,
      eventCategory: e.eventCategory,
    }) as Record<string, unknown>
  const front_events_csv = recordsToCsv([...eventCols], frontEv.map(evtRow))
  const rear_events_csv = recordsToCsv([...eventCols], rearEv.map(evtRow))

  const alertCols = [
    'id',
    'version',
    'createdAt',
    'modifiedAt',
    'alertCode',
    'severity',
    'status',
    'journeyUid',
    'truckPlate',
    'trailerPlate',
    'sectorCode',
    'deviceCode',
    'description',
    'payload',
    'payload_plate',
    'payload_normalized_plate',
    'payload_event_id',
    'payload_device_code',
    'camera_type',
    'occurredAt',
  ] as const
  const front_alerts_csv = recordsToCsv([...alertCols], frontAl.map(flattenAlertForEtlCsv))
  const rear_alerts_csv = recordsToCsv([...alertCols], rearAl.map(flattenAlertForEtlCsv))

  const totalLprMalfunctionAlerts = inp.alerts.filter(isLprMalfunctionAlert).length
  const lprMalDeviceMap = new Map<string, number>()
  for (const a of inp.alerts) {
    if (!isLprMalfunctionAlert(a)) continue
    const d = getEffectiveAlertDeviceCode(a)
    lprMalDeviceMap.set(d, (lprMalDeviceMap.get(d) ?? 0) + 1)
  }
  const lprMalfunctionByCamera = [...lprMalDeviceMap.entries()]
    .map(([deviceCode, count]) => ({ deviceCode, count }))
    .sort((a, b) => b.count - a.count)
  const cameraWithMostLpr = lprMalfunctionByCamera[0]?.deviceCode ?? null

  const step1Stat = {
    frontEvents: frontEv.length,
    rearEvents: rearEv.length,
    frontAlerts: frontAl.length,
    rearAlerts: rearAl.length,
    pctExcludedEvents: pctExcluded,
    deviceRearCounts: summarizeDeviceRear(inp.events),
  }

  await yieldToBrowser()

  /** —— Paso 2 —— */
  type CamKey = string
  type CamAgg = {
    date: string
    week: string
    day_name: string
    time_bucket: string
    day_night: string
    deviceCode: string
    sectorCode: string
    camera_type: string
    event_count: number
    alert_count_total: number
    alert_lpr_count: number
    first_event_at: string
    last_event_at: string
    first_alert_at: string
    last_alert_at: string
  }

  const agg = new Map<CamKey, CamAgg>()

  function makeAggKey(iso: string, dev: string, sec: string, ctype: 'front' | 'rear'): CamKey {
    const ts = Date.parse(iso)
    const inst = Number.isNaN(ts) ? parseLocalDateFromIsoMaybe(iso) ?? new Date() : new Date(ts)
    const date = occurredAtLocalDayKey(iso)
    return [
      date,
      isoWeekMondayKey(inst),
      inst.toLocaleDateString('es-AR', { weekday: 'long' }),
      timeBucketFourHoursLabel(iso),
      dayNightLabel(iso),
      dev,
      sec,
      ctype,
    ].join('|')
  }

  function ensureKey(iso: string, dev: string, sec: string, ctype: 'front' | 'rear'): CamKey {
    const k = makeAggKey(iso, dev, sec, ctype)
    if (!agg.has(k)) {
      const ts = Date.parse(iso)
      const inst = Number.isNaN(ts) ? parseLocalDateFromIsoMaybe(iso) ?? new Date() : new Date(ts)
      const date = occurredAtLocalDayKey(iso)
      agg.set(k, {
        date,
        week: isoWeekMondayKey(inst),
        day_name: inst.toLocaleDateString('es-AR', { weekday: 'long' }),
        time_bucket: timeBucketFourHoursLabel(iso),
        day_night: dayNightLabel(iso),
        deviceCode: dev,
        sectorCode: sec,
        camera_type: ctype,
        event_count: 0,
        alert_count_total: 0,
        alert_lpr_count: 0,
        first_event_at: iso,
        last_event_at: iso,
        first_alert_at: iso,
        last_alert_at: iso,
      })
    }
    return k
  }
  for (const e of inp.events) {
    const iso = String(e.occurredAt ?? '').trim()
    if (!iso) continue
    const dev = String(e.deviceCode ?? '').trim() || '?'
    const sec = String(e.sectorCode ?? '').trim() || '?'
    const ctype = isEtlRearCameraDevice(e.deviceCode) ? 'rear' : 'front'
    const k = ensureKey(iso, dev, sec, ctype)
    const row = agg.get(k)!
    row.event_count += 1
    if (!row.first_event_at || iso < row.first_event_at) row.first_event_at = iso
    if (!row.last_event_at || iso > row.last_event_at) row.last_event_at = iso
  }

  for (const a of inp.alerts) {
    const iso = alertOccurredAtIso(a)
    if (!iso) continue
    const dev = getEffectiveAlertDeviceCode(a)
    const sec = getEffectiveAlertSectorCode(a)
    const ctype = isEtlRearCameraDevice(dev === '?' ? '' : dev) ? 'rear' : 'front'
    const k = ensureKey(iso, dev, sec, ctype)
    const row = agg.get(k)!
    row.alert_count_total += 1
    if (isLprMalfunctionAlert(a)) row.alert_lpr_count += 1
    if (!row.first_alert_at || iso < row.first_alert_at) row.first_alert_at = iso
    if (!row.last_alert_at || iso > row.last_alert_at) row.last_alert_at = iso
  }

  const camRowsArr = [...agg.values()].map((row) => {
    let lprPer100Disp: number | string = ''
    if (row.event_count > 0) {
      lprPer100Disp = Math.round((row.alert_lpr_count / row.event_count) * 100 * 1000) / 1000
    }
    const status = statusFromLprRate(row.event_count, row.alert_lpr_count)
    return {
      date: row.date,
      week: row.week,
      day_name: row.day_name,
      time_bucket: row.time_bucket,
      day_night: row.day_night,
      deviceCode: row.deviceCode,
      sectorCode: row.sectorCode,
      camera_type: row.camera_type,
      event_count: row.event_count,
      alert_count_total: row.alert_count_total,
      alert_lpr_count: row.alert_lpr_count,
      lpr_alerts_per_100_events: lprPer100Disp,
      first_event_at: row.first_event_at,
      last_event_at: row.last_event_at,
      first_alert_at: row.first_alert_at,
      last_alert_at: row.last_alert_at,
      status,
    } as Record<string, unknown>
  })

  const hdrCam = Object.keys(camRowsArr[0] ?? { date: '' })
  const camera_lpr_status_csv = recordsToCsv(hdrCam.length ? hdrCam : ['date'], camRowsArr)

  let criticalCameras = 0
  let sinBase = 0
  for (const r of camRowsArr) {
    if (String(r.status) === 'Crítico') criticalCameras++
    if (String(r.status) === 'Sin base de eventos') sinBase++
  }
  const step2Stat = {
    rows: camRowsArr.length,
    camerasWithEvents: new Set(inp.events.map((e) => (e.deviceCode ?? '').trim()).filter(Boolean)).size,
    camerasWithLpr: new Set(
      inp.alerts.filter(isLprMalfunctionAlert).map((a) => getEffectiveAlertDeviceCode(a))
    ).size,
    criticalCameras,
    sinBaseCameras: sinBase,
    totalLprMalfunctionAlerts,
    lprMalfunctionByCamera,
    cameraWithMostLpr,
  }

  await yieldToBrowser()

  /** —— Paso 3 — filtros traseros + reconstrucción sólo con lecturas frontales permitidas —— */
  const ingreso_frontal_events = inp.events.filter(isIngresoFrontalReferenceEvent)
  const ingreso_frontal_event_count = ingreso_frontal_events.length
  const ingresoPlateSet = new Set(
    ingreso_frontal_events
      .map((e) => normalizePlateForSim(String(e.normalizedPlate ?? e.truckPlate ?? '')))
      .filter((p) => p.length > 0)
  )
  const ingresoJourneyUidSet = new Set(
    ingreso_frontal_events.map((e) => String(e.journeyUid ?? '').trim()).filter(Boolean)
  )
  const ingreso_frontal_unique_plates = ingresoPlateSet.size
  const ingreso_frontal_unique_journeys = ingresoJourneyUidSet.size

  const byJ = new Map<string, RealJourneyEventDto[]>()
  for (const e of inp.events) {
    const uid = String(e.journeyUid ?? '').trim()
    if (!uid) continue
    if (!byJ.has(uid)) byJ.set(uid, [])
    byJ.get(uid)!.push(e)
  }

  type JourneyAuditMeta = {
    uid: string
    total_event_count: number
    front_event_count: number
    rear_event_count: number
    rear_event_ratio: number
    has_front_events: boolean
    has_rear_events: boolean
    devices: string
    logical_sequence_before_rear_removed: string
    rear_events_removed: boolean
  }

  let rear_only_journeys_excluded = 0
  const operationalFrontEvents: RealJourneyEventDto[] = []
  const rearOnlyDebugRows: Record<string, unknown>[] = []
  const journeyAuditByUid = new Map<string, JourneyAuditMeta>()

  function devicesJoined(group: readonly RealJourneyEventDto[]): string {
    const codes = [...new Set(group.map((e) => String(e.deviceCode ?? '').trim()).filter(Boolean))]
    return codes.sort().join('|')
  }

  function logicalSeqFromRawEvents(group: readonly RealJourneyEventDto[]): string {
    const sorted = [...group].sort(compareRealEvents)
    const collapsed = collapseConsecutiveEqual(sorted.map((e) => normalizeRealEventPoint(e).logicalCode))
    return collapsed.join('>')
  }

  for (const [, groupRaw] of byJ) {
    const uid = String(groupRaw[0]?.journeyUid ?? '').trim()
    let frontCt = 0
    let rearCt = 0
    for (const e of groupRaw) {
      if (isEtlRearCameraDevice(e.deviceCode)) rearCt++
      else frontCt++
    }
    const total = groupRaw.length
    const ratio = total > 0 ? rearCt / total : 0
    const hasFront = frontCt > 0
    const hasRear = rearCt > 0

    if (rearCt > 0 && !hasFront) {
      rear_only_journeys_excluded++
      rearOnlyDebugRows.push({
        journey_uid: uid,
        total_event_count: total,
        front_event_count: frontCt,
        rear_event_count: rearCt,
        rear_event_ratio: Math.round(ratio * 10000) / 10000,
        has_front_events: false,
        has_rear_events: true,
        devices: devicesJoined(groupRaw),
        logical_sequence: logicalSeqFromRawEvents(groupRaw),
        exclusion_reason: 'rear_only_journey',
      })
      continue
    }

    const rear_events_removed = hasFront && hasRear

    journeyAuditByUid.set(uid, {
      uid,
      total_event_count: total,
      front_event_count: frontCt,
      rear_event_count: rearCt,
      rear_event_ratio: Math.round(ratio * 10000) / 10000,
      has_front_events: hasFront,
      has_rear_events: hasRear,
      devices: devicesJoined(groupRaw),
      logical_sequence_before_rear_removed: logicalSeqFromRawEvents(groupRaw),
      rear_events_removed,
    })

    if (rear_events_removed) {
      for (const e of groupRaw) {
        if (!isEtlRearCameraDevice(e.deviceCode)) operationalFrontEvents.push(e)
      }
    } else {
      operationalFrontEvents.push(...groupRaw)
    }
  }

  const journeys = reconstructRealJourneysIncludingInvalidPlates(operationalFrontEvents)
  const journeys_after_rear_filter = journeys.length

  const rear_only_journeys_debug_csv =
    rearOnlyDebugRows.length ?
      recordsToCsv(Object.keys(rearOnlyDebugRows[0]), rearOnlyDebugRows)
    : 'journey_uid,exclusion_reason\n'

  const cleanRows: Record<string, unknown>[] = []
  const classifiedRows: Record<string, unknown>[] = []
  const unclassifiedRows: Record<string, unknown>[] = []

  const reliabilityByUid = new Map<string, number>()
  let classifiedOperationalCt = 0
  let incompleteOperationalCt = 0
  let unclassifiedCt = 0
  let journeysWithRearRemoved = 0

  for (const j of journeys) {
    const audit = journeyAuditByUid.get(j.journeyUid)
    const seqPack = journeyDeviceSectorLogical(j)
    if (audit?.rear_events_removed) journeysWithRearRemoved++

    const baseClean = {
      journey_uid: j.journeyUid,
      truck_plate: j.plate,
      normalized_plate: j.normalizedPlate,
      first_event_at: j.startedAt,
      last_event_at: j.endedAt,
      duration_minutes: j.durationMinutes,
      total_event_count_raw_uid: audit?.total_event_count ?? j.eventCount,
      event_count_front_reconstruction_only: j.eventCount,
      front_event_count_reconstruction: seqPack.frontEventCount,
      rear_event_count_historical: audit?.rear_event_count ?? seqPack.rearEventCount,
      rear_event_ratio_historical: audit?.rear_event_ratio ?? '',
      has_front_events: seqPack.frontEventCount > 0,
      /** histórico: había lecturas en cámaras excluídas antes de limpiar */
      has_rear_events_historical: audit?.has_rear_events ?? false,
      rear_only_excluded: false,
      rear_events_removed: audit?.rear_events_removed ?? false,
      devices_union_audit: audit?.devices ?? '',
      device_sequence_front: seqPack.deviceSequence,
      sector_sequence_front: seqPack.sectorSequence,
      logical_sequence_front: seqPack.logicalSequence,
      logical_sequence_before_rear_removed: audit?.logical_sequence_before_rear_removed ?? '',
      starts_at_valid_entry: seqPack.startsAtValidEntry,
      ends_at_valid_exit: seqPack.endsAtValidExit,
      preliminary_code: j.preliminaryCircuitCode,
      preliminary_name: j.preliminaryCircuitName,
      preliminary_confidence: j.preliminaryCircuitConfidence,
    }
    cleanRows.push(baseClean)

    const relPack = computeJourneyReliability(j)
    const tier = userCircuitTier(j)
    const refinement_note = refinementLabel(j)

    reliabilityByUid.set(j.journeyUid, relPack.reliability_score)

    const clsRow = {
      ...baseClean,
      tier_circuit_user: tier,
      circuit_classification: tier,
      refinement_note,
      reliability_score: relPack.reliability_score,
      reliability_explanation: relPack.reliability_explanation,
      expected_points_count: relPack.expected_points_count,
      matched_points_count: relPack.matched_points_count,
      missing_points_count: relPack.missing_points_count,
      extra_points_hint: '',
      missing_expected_points_join: (j.missingExpectedPoints ?? []).join('|'),
      is_discarded_operational: j.isDiscardedOperational,
    }

    if (tier === 'sin_clasificar') {
      unclassifiedCt++
      unclassifiedRows.push(clsRow)
    } else {
      classifiedRows.push(clsRow)
      if (tier === 'circuito_detectado') classifiedOperationalCt++
      else incompleteOperationalCt++
    }
  }

  const cleanCsvHeaders = Object.keys(cleanRows[0] ?? { journey_uid: '' })
  const clean_journeys_csv =
    recordsToCsv(cleanCsvHeaders.length ? cleanCsvHeaders : ['journey_uid'], cleanRows)

  const classified_circuits_csv =
    classifiedRows.length ?
      recordsToCsv(Object.keys(classifiedRows[0]), classifiedRows)
    : 'journey_uid\n'

  const unclassified_journeys_csv =
    unclassifiedRows.length ?
      recordsToCsv(Object.keys(unclassifiedRows[0]), unclassifiedRows)
    : 'journey_uid\n'

  await yieldToBrowser()

  /** —— Paso 4 merge sugerencias —— */
  function sequencesComplementary(sa: string, sb: string): boolean {
    if (!sa || !sb) return false
    const A = sa.split('>').slice(0, 8)
    const B = sb.split('>').slice(0, 8)
    if (!A.length || !B.length) return false
    const set = new Set(B)
    let hits = 0
    for (const token of A) if (set.has(token)) hits++
    return hits >= 1 || A[0] === B[B.length - 1] || A[A.length - 1] === B[0]
  }

  type MatchTypeMerge = 'exact_plate' | 'similar_plate' | 'sequence_and_plate'

  type MergeCand = {
    a: ReconstructedRealJourney
    b: ReconstructedRealJourney
    similarity: number
    gapMinutes: number
    match_type: MatchTypeMerge
    should_review: boolean
    priority: 'alta' | 'media' | 'baja'
  }

  function journeyGapMinutes(a: ReconstructedRealJourney, b: ReconstructedRealJourney): number {
    const a0 = new Date(a.startedAt).getTime()
    const a1 = new Date(a.endedAt).getTime()
    const b0 = new Date(b.startedAt).getTime()
    const b1 = new Date(b.endedAt).getTime()
    if ([a0, a1, b0, b1].some((x) => Number.isNaN(x))) return 1e9
    if (a1 < b0) return (b0 - a1) / 60000
    if (b1 < a0) return (a0 - b1) / 60000
    return 0
  }

  function plateExactNormalized(a: string, b: string): boolean {
    const na = normalizePlateForSim(a)
    const nb = normalizePlateForSim(b)
    return na.length > 0 && na === nb
  }

  const list = journeys
  const cap = Math.min(list.length, 2500)

  const seqCache = new Map<string, ReturnType<typeof journeyDeviceSectorLogical>>()
  function seqFor(j: ReconstructedRealJourney) {
    let s = seqCache.get(j.journeyUid)
    if (!s) {
      s = journeyDeviceSectorLogical(j)
      seqCache.set(j.journeyUid, s)
    }
    return s
  }

  const rawMerge: MergeCand[] = []

  for (let i = 0; i < cap; i++) {
    for (let j = i + 1; j < cap; j++) {
      const ja = list[i]
      const jb = list[j]
      const gapMin = journeyGapMinutes(ja, jb)
      if (gapMin > MERGE_CANDIDATE_MAX_GAP_MINUTES) continue

      const pa = ja.normalizedPlate || ''
      const pb = jb.normalizedPlate || ''
      if (!normalizePlateForSim(pa) && !normalizePlateForSim(pb)) continue

      const sa = seqFor(ja).logicalSequence
      const sb = seqFor(jb).logicalSequence
      const seqOk = sequencesComplementary(sa, sb)
      const exact = plateExactNormalized(pa, pb)
      const sim = plateSimilarityScore(pa, pb)
      const similarEnough = sim >= MERGE_SIMILAR_THRESHOLD

      /** A/B siempre tienen gap ≤ ventana y patente igual o muy similar; nunca sólo por secuencia sin patente cercana */
      const plateOk = exact || similarEnough
      if (!plateOk) continue

      let match_type: MatchTypeMerge
      if (exact) match_type = 'exact_plate'
      else if (seqOk) match_type = 'sequence_and_plate'
      else match_type = 'similar_plate'

      let priority: 'alta' | 'media' | 'baja'
      if (exact && gapMin <= 25) priority = 'alta'
      else if (exact) priority = 'media'
      else if (similarEnough && sim >= 0.92) priority = 'alta'
      else if (similarEnough || match_type === 'sequence_and_plate') priority = 'media'
      else priority = 'baja'

      /** Revisión humana innecesaria sólo si patente coincide exacto y hueco muy corto */
      const should_review = !(exact && gapMin <= 30)

      rawMerge.push({
        a: ja,
        b: jb,
        similarity: exact ? 1 : Math.round(sim * 1000) / 1000,
        gapMinutes: Math.round(gapMin),
        match_type,
        should_review,
        priority,
      })
    }
  }

  function mergeReliability(c: MergeCand): number {
    const ra = reliabilityByUid.get(c.a.journeyUid)
    const rb = reliabilityByUid.get(c.b.journeyUid)
    if (ra != null && rb != null) return Math.min(ra, rb)

    const r = ra ?? rb ?? 0
    return r
  }

  rawMerge.sort((u, v) => {
    if (v.similarity !== u.similarity) return v.similarity - u.similarity
    if (u.gapMinutes !== v.gapMinutes) return u.gapMinutes - v.gapMinutes
    return mergeReliability(v) - mergeReliability(u)
  })

  const candidatesBeforeCap = rawMerge.length
  const mergeTop = rawMerge.slice(0, MERGE_TOP_LIMIT)

  /** UIDs tocados por pareja merge de alta confianza (exacta, hueco corto, sin revisión). */
  const mergeHighConfidenceUids = new Set<string>()
  for (const mc of mergeTop) {
    if (mc.match_type === 'exact_plate' && mc.gapMinutes <= 30 && mc.priority === 'alta' && !mc.should_review) {
      mergeHighConfidenceUids.add(mc.a.journeyUid)
      mergeHighConfidenceUids.add(mc.b.journeyUid)
    }
  }

  let single_event_discarded = 0
  for (const mj of journeys) {
    if (mj.eventCount !== 1) continue
    if (mergeHighConfidenceUids.has(mj.journeyUid)) continue
    single_event_discarded++
  }

  const dayPlateToUids = new Map<string, Set<string>>()
  for (const mj of journeys) {
    const p = normalizePlateForSim(mj.normalizedPlate)
    const day = occurredAtLocalDayKey(mj.startedAt)
    if (!p || !day) continue
    const k = `${p}|${day}`
    if (!dayPlateToUids.has(k)) dayPlateToUids.set(k, new Set())
    dayPlateToUids.get(k)!.add(mj.journeyUid)
  }
  let duplicate_suspected = 0
  let duplicate_severe_excluded = 0
  for (const mj of journeys) {
    const p = normalizePlateForSim(mj.normalizedPlate)
    const day = occurredAtLocalDayKey(mj.startedAt)
    if (!p || !day) continue
    const nUid = dayPlateToUids.get(`${p}|${day}`)?.size ?? 0
    if (nUid > 1) duplicate_suspected++
    if (nUid >= 3) duplicate_severe_excluded++
  }

  function duplicateSeverityFor(j: ReconstructedRealJourney): 'none' | 'moderate' | 'severe' {
    const p = normalizePlateForSim(j.normalizedPlate)
    const day = occurredAtLocalDayKey(j.startedAt)
    if (!p || !day) return 'none'
    const nUid = dayPlateToUids.get(`${p}|${day}`)?.size ?? 0
    if (nUid >= 3) return 'severe'
    if (nUid > 1) return 'moderate'
    return 'none'
  }

  function journeyPassesFinalFilter(j: ReconstructedRealJourney): boolean {
    const tier = userCircuitTier(j)
    if (tier === 'sin_clasificar') return false
    if (duplicateSeverityFor(j) === 'severe') return false
    const nFront = j.eventCount
    if (nFront >= 2) return true
    if (nFront === 1) return mergeHighConfidenceUids.has(j.journeyUid)
    return false
  }

  function journeyIngresoFrontCount(j: ReconstructedRealJourney): number {
    let c = 0
    for (const ev of j.events) {
      if (isIngresoFrontalReferenceEvent(ev)) c++
    }
    return c
  }

  function pickDataQualityFlag(
    j: ReconstructedRealJourney,
    tier: ReturnType<typeof userCircuitTier>,
    suspiciousDup: boolean,
    mergedFragment: boolean
  ): string {
    const parts: string[] = []
    const ingresoN = journeyIngresoFrontCount(j)

    if (mergedFragment) parts.push('merged_fragment')
    if (journeyAuditByUid.get(j.journeyUid)?.rear_events_removed) parts.push('rear_events_removed')
    if (suspiciousDup) parts.push('suspicious_duplicate')
    if (ingresoN <= 0) parts.push('missing_ingreso_frontal')
    if (tier === 'circuito_incompleto') parts.push('incomplete_sequence')

    const uniq = [...new Set(parts)]
    if (!uniq.length) return 'ok'
    if (uniq.length === 1) return uniq[0]
    return uniq.sort().join('+')
  }

  const finalCsvRows: Record<string, unknown>[] = []
  let final_classified_count = 0
  let final_incomplete_count = 0
  let final_circuitos_completos = 0
  let final_circuitos_probables = 0
  let final_circuitos_sin_ingreso = 0
  let final_circuitos_sin_egreso = 0
  let final_incompletos_revision = 0
  let final_descartados_en_csv = 0
  let circuitos_con_ingreso_operativo = 0
  let circuitos_con_egreso_operativo = 0
  let circuitos_con_ingreso_y_egreso_operativo = 0

  let ingresos_operativos_count = 0
  for (const mj of journeys) {
    const logicals = new Set(mj.logicalCodeSequence.map((x) => String(x)))
    if (resolveOperationalEntry(logicals).has_operational_entry) ingresos_operativos_count++
  }

  for (const mj of journeys) {
    if (!journeyPassesFinalFilter(mj)) continue

    const tier = userCircuitTier(mj)
    const audit = journeyAuditByUid.get(mj.journeyUid)
    const seqPack = journeyDeviceSectorLogical(mj)
    const p = normalizePlateForSim(mj.normalizedPlate)
    const day = occurredAtLocalDayKey(mj.startedAt)
    const dupSev = duplicateSeverityFor(mj)
    const dupSus = dupSev !== 'none'
    const mergedFrag = mj.eventCount === 1 && mergeHighConfidenceUids.has(mj.journeyUid)

    const ingresoN = journeyIngresoFrontCount(mj)
    const hasIngresoFrontal = ingresoN > 0
    const relPack = computeJourneyReliability(mj)
    const rel = reliabilityByUid.get(mj.journeyUid) ?? relPack.reliability_score
    const logicals = new Set(mj.logicalCodeSequence.map((x) => String(x)))
    const entry = resolveOperationalEntry(logicals)
    const exit = resolveOperationalExit(logicals, journeyHasRicB2EgresoDevice(mj))
    const strong = journeyHasStrongDefiningPoint(mj)
    const balanzaCompleta = journeyHasBalansaCompleta(mj)
    const sequenceCoherent = journeySequenceCoherent(mj, seqPack)
    const confidence_level = confidenceLevelFromScore(
      rel,
      journeyHasStrongConfidenceBonus(mj)
    )

    const final_status = resolveFinalStatus({
      j: mj,
      reliabilityScore: rel,
      hasOperationalEntry: entry.has_operational_entry,
      hasOperationalExit: exit.has_operational_exit,
      strong,
      balanzaCompleta,
      suspiciousDuplicate: dupSus,
      duplicateSeverity: dupSev,
      sequenceCoherent,
      eventCountFront: mj.eventCount,
    })

    if (entry.has_operational_entry) circuitos_con_ingreso_operativo++
    if (exit.has_operational_exit) circuitos_con_egreso_operativo++
    if (entry.has_operational_entry && exit.has_operational_exit) {
      circuitos_con_ingreso_y_egreso_operativo++
    }

    switch (final_status) {
      case 'circuito_completo':
        final_circuitos_completos++
        final_classified_count++
        break
      case 'circuito_probable':
        final_circuitos_probables++
        final_classified_count++
        break
      case 'circuito_probable_sin_ingreso':
        final_circuitos_sin_ingreso++
        break
      case 'circuito_probable_sin_egreso':
        final_circuitos_sin_egreso++
        break
      case 'incompleto_revision':
        final_incompletos_revision++
        final_incomplete_count++
        break
      case 'descartado':
        final_descartados_en_csv++
        break
    }

    finalCsvRows.push({
      journey_uid: mj.journeyUid,
      truck_plate: mj.plate,
      normalized_plate: mj.normalizedPlate,
      final_status,
      final_status_label: finalStatusLabel(final_status),
      event_count_front: mj.eventCount,
      device_sequence_front: seqPack.deviceSequence,
      sector_sequence_front: seqPack.sectorSequence,
      logical_sequence_front: seqPack.logicalSequence,
      ingreso_frontal_reference: `RicIngCamFrente|RICARDONE_INGRESO_CAMIONES`,
      ingreso_frontal_event_hits_on_journey: ingresoN,
      has_ingreso_frontal: hasIngresoFrontal,
      has_operational_entry: entry.has_operational_entry,
      entry_source: entry.entry_source,
      has_operational_exit: exit.has_operational_exit,
      exit_source: exit.exit_source,
      has_strong_defining_point: strong,
      has_logical_egreso: journeyHasLogicalEgreso(mj),
      rear_only_excluded: false,
      rear_events_removed: audit?.rear_events_removed ?? false,
      preliminary_code: mj.preliminaryCircuitCode,
      expected_points_count: relPack.expected_points_count,
      matched_points_count: relPack.matched_points_count,
      missing_points_count: relPack.missing_points_count,
      reliability_score: rel,
      reliability_explanation: relPack.reliability_explanation,
      confidence_level,
      refinement_note: refinementLabel(mj),
      data_quality_flag: pickDataQualityFlag(mj, tier, dupSus, mergedFrag),
    })
  }

  const final_circuits_csv =
    finalCsvRows.length ?
      recordsToCsv(Object.keys(finalCsvRows[0]), finalCsvRows)
    : 'journey_uid,final_status,final_status_label,data_quality_flag\n'

  const final_circuits_count = finalCsvRows.length
  const final_descartados =
    rear_only_journeys_excluded + single_event_discarded + duplicate_severe_excluded + final_descartados_en_csv

  const incomplete_not_in_final = journeys.reduce((acc, mj) => {
    if (userCircuitTier(mj) !== 'circuito_incompleto') return acc
    return journeyPassesFinalFilter(mj) ? acc : acc + 1
  }, 0)

  let byExactPlate = 0
  let bySimilarPlate = 0
  let bySeqPlate = 0
  for (const c of mergeTop) {
    if (c.match_type === 'exact_plate') byExactPlate++
    else if (c.match_type === 'similar_plate') bySimilarPlate++
    else bySeqPlate++
  }

  let candidateId = 0
  const mergeCsvRows = mergeTop.map((c) => {
    candidateId += 1
    const seqPackA = seqFor(c.a)
    const seqPackB = seqFor(c.b)
    const sugRel = mergeReliability(c)
    return {
      candidate_id: candidateId,
      journey_uid_a: c.a.journeyUid,
      journey_uid_b: c.b.journeyUid,
      plate_a: c.a.normalizedPlate,
      plate_b: c.b.normalizedPlate,
      similarity_score: c.similarity,
      time_gap_minutes: c.gapMinutes,
      sequence_a: seqPackA.logicalSequence,
      sequence_b: seqPackB.logicalSequence,
      suggested_merged_sequence: `${seqPackA.logicalSequence}|${seqPackB.logicalSequence}`,
      suggested_circuit: `${c.a.preliminaryCircuitCode}/${c.b.preliminaryCircuitCode}`,
      suggested_reliability_score: sugRel,
      match_type: c.match_type,
      should_review: c.should_review,
      priority: c.priority,
      merge_status: 'suggested',
    } as Record<string, unknown>
  })

  const journey_merge_candidates_csv =
    mergeCsvRows.length ?
      recordsToCsv(Object.keys(mergeCsvRows[0]), mergeCsvRows)
    : 'candidate_id,match_type,should_review,priority\n'

  const merged_journeys_csv = 'journey_uid,note\n'

  const step4Stat = {
    candidates: mergeCsvRows.length,
    candidatesBeforeCap,
    byExactPlate,
    bySimilarPlate,
    bySequenceAndPlate: bySeqPlate,
  }

  const step3Stat = {
    journeysTotal: byJ.size,
    journeysValidFront: journeys_after_rear_filter,
    rearOnlyExcluded: rear_only_journeys_excluded,
    journeysWithRearEventsRemoved: journeysWithRearRemoved,
    single_event_discarded,
    duplicate_suspected,
    incomplete_sequence_count: incomplete_not_in_final,
    classifiedCircuitsOperational: classifiedOperationalCt,
    incompleteOperational: incompleteOperationalCt,
    unclassifiedCount: unclassifiedCt,
    cleanJourneysCount: cleanRows.length,
  }

  await yieldToBrowser()

  const daysSorted = inp.events
    .map((e) => occurredAtLocalDayKey(e.occurredAt))
    .filter(Boolean)
    .sort()
  const dateMin = daysSorted.length ? daysSorted[0] : ''
  const dateMax = daysSorted.length ? daysSorted[daysSorted.length - 1] : ''

  const baseIngreso = ingreso_frontal_event_count || 0
  const journey_vs_ingreso_ratio =
    baseIngreso > 0 ? Math.round((journeys_after_rear_filter / baseIngreso) * 10000) / 10000 : null
  const final_circuits_vs_ingreso_ratio =
    baseIngreso > 0 ? Math.round((final_circuits_count / baseIngreso) * 10000) / 10000 : null

  const journeyFragmentationWarn =
    baseIngreso > 0 && journeys_after_rear_filter > ingreso_frontal_event_count * 1.25
  const circuitsVersusIngresoWarn =
    baseIngreso > 0 && final_circuits_count > ingreso_frontal_event_count * 1.1

  const coherentPrelim =
    baseIngreso > 0 && final_circuits_count <= ingreso_frontal_event_count

  const warnParts: string[] = []
  if (journeyFragmentationWarn) {
    warnParts.push(
      'Cantidad de journeys superior a ingresos frontales. Posible fragmentación de recorridos.'
    )
  }
  if (circuitsVersusIngresoWarn) {
    warnParts.push(
      'Cantidad de circuitos finales superior a ingresos frontales. Revisar duplicación o fragmentación.'
    )
  }
  if (coherentPrelim) {
    warnParts.push('Coherente para análisis preliminar.')
  }

  let coherenceLabel: string
  if (journeyFragmentationWarn || circuitsVersusIngresoWarn) {
    const hiFrag =
      baseIngreso > 0 &&
      (journeys_after_rear_filter > ingreso_frontal_event_count * 1.5 ||
        final_circuits_count > ingreso_frontal_event_count * 1.2)
    coherenceLabel = hiFrag ? 'Fragmentación alta' : 'Fragmentación moderada'
  } else {
    coherenceLabel = 'Coherente'
  }

  const exclusionMotivesA = [
    { motive: 'rear_only_journey', count: rear_only_journeys_excluded },
    { motive: 'single_event_discarded', count: single_event_discarded },
    { motive: 'duplicate_suspected', count: duplicate_suspected },
    { motive: 'incomplete_sequence', count: incomplete_not_in_final },
  ]

  const coherenceStat = {
    ingreso_frontal_event_count,
    ingreso_frontal_unique_plates,
    ingreso_frontal_unique_journeys,
    ingresos_operativos_count,
    total_journeys_raw: byJ.size,
    rear_only_journeys_excluded,
    journeys_after_rear_filter,
    final_circuits_count,
    final_classified_count,
    final_incomplete_count,
    final_circuitos_completos,
    final_circuitos_probables,
    final_circuitos_sin_ingreso,
    final_circuitos_sin_egreso,
    final_incompletos_revision,
    final_descartados,
    circuitos_con_ingreso_operativo,
    circuitos_con_egreso_operativo,
    circuitos_con_ingreso_y_egreso_operativo,
    journey_vs_ingreso_ratio,
    final_circuits_vs_ingreso_ratio,
    journeyFragmentationWarn,
    circuitsVersusIngresoWarn,
    coherenceLabel,
    coherenceDetail:
      [
        ...warnParts,
        `Ingresos frontales RicIngCamFrente: ${ingreso_frontal_event_count}. Ingresos operativos (INGRESO/PREINGRESO en journey): ${ingresos_operativos_count}. Journeys Truckflow: ${journeys_after_rear_filter}. Circuitos finales: ${final_circuits_count} (completos ${final_circuitos_completos}, probables ${final_circuitos_probables}).`,
      ].join(' '),
    exclusionMotives: exclusionMotivesA,
  }

  const summaryRow = {
    generated_at: new Date().toISOString(),
    source_mode: 'manual_local_files',
    loaded_event_files_count: inp.loadedEventFilesCount,
    loaded_alert_files_count: inp.loadedAlertFilesCount,
    raw_events_count: inp.events.length,
    raw_alerts_count: inp.alerts.length,
    front_events_count: frontEv.length,
    rear_events_count: rearEv.length,
    front_alerts_count: frontAl.length,
    rear_alerts_count: rearAl.length,
    ingreso_frontal_event_count,
    ingreso_frontal_unique_plates,
    ingreso_frontal_unique_journeys,
    ingresos_operativos_count,
    total_journeys_raw: byJ.size,
    rear_only_journeys_excluded,
    journeys_after_rear_filter,
    final_circuits_count,
    final_classified_count,
    final_incomplete_count,
    final_circuitos_completos,
    final_circuitos_probables,
    final_circuitos_sin_ingreso,
    final_circuitos_sin_egreso,
    final_incompletos_revision,
    final_descartados,
    circuitos_con_ingreso_operativo,
    circuitos_con_egreso_operativo,
    circuitos_con_ingreso_y_egreso_operativo,
    journeys_vs_ingreso_ratio: journey_vs_ingreso_ratio ?? '',
    final_circuits_vs_ingreso_ratio: final_circuits_vs_ingreso_ratio ?? '',
    journey_vs_ingreso_ratio: journey_vs_ingreso_ratio ?? '',
    journey_fragmentation_warning: journeyFragmentationWarn ? 'yes' : 'no',
    circuits_above_ingreso_warning: circuitsVersusIngresoWarn ? 'yes' : 'no',
    coherence_diagnosis: coherenceLabel,
    coherence_messages: coherenceStat.coherenceDetail,
    motive_rear_only_journey: exclusionMotivesA.find((x) => x.motive === 'rear_only_journey')?.count,
    motive_single_event_discarded: exclusionMotivesA.find((x) => x.motive === 'single_event_discarded')?.count,
    motive_duplicate_suspected: exclusionMotivesA.find((x) => x.motive === 'duplicate_suspected')?.count,
    motive_incomplete_sequence: exclusionMotivesA.find((x) => x.motive === 'incomplete_sequence')?.count,
    clean_journeys_count: cleanRows.length,
    classified_circuits_count: classifiedOperationalCt,
    unclassified_journeys_count: unclassifiedCt,
    single_event_discarded,
    duplicate_suspected_flagged_journeys: duplicate_suspected,
    merge_candidates_count: mergeCsvRows.length,
    journeys_with_rear_events_removed: journeysWithRearRemoved,
    date_min: dateMin ?? '',
    date_max: dateMax ?? '',
    rules_version: ETL_TRANSFORM_RULES_VERSION,
  } as Record<string, unknown>

  const transform_summary_csv = recordsToCsv(Object.keys(summaryRow), [summaryRow])

  const validationStats = {
    totalLprMalfunctionAlerts: totalLprMalfunctionAlerts,
    lprMalfunctionByCamera,
    cameraWithMostLpr,
    circuitosClasificados: classifiedOperationalCt,
    registrosIncompletosOperativos: incompleteOperationalCt,
    sinClasificar: unclassifiedCt,
    mergeCandidatesFiltered: mergeCsvRows.length,
    final_circuits_count,
  }

  return {
    csv: {
      front_events: front_events_csv,
      rear_events: rear_events_csv,
      front_alerts: front_alerts_csv,
      rear_alerts: rear_alerts_csv,
      camera_lpr_status: camera_lpr_status_csv,
      clean_journeys: clean_journeys_csv,
      classified_circuits: classified_circuits_csv,
      final_circuits: final_circuits_csv,
      unclassified_journeys: unclassified_journeys_csv,
      rear_only_journeys_debug: rear_only_journeys_debug_csv,
      journey_merge_candidates: journey_merge_candidates_csv,
      merged_journeys: merged_journeys_csv,
      transform_summary: transform_summary_csv,
    },
    stats: {
      step1: step1Stat,
      step2: step2Stat,
      step3: step3Stat,
      step4: step4Stat,
      coherence: coherenceStat,
      validation: validationStats,
    },
    rulesVersion: ETL_TRANSFORM_RULES_VERSION,
  }
}
