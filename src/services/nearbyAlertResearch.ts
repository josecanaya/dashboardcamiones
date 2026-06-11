/**
 * Capa: diagnóstico — cruces alerta ↔ journey incompleto. Exploración; no pipeline obligatorio.
 */
import { normalizePlate } from './argentinaPlate'
import type { ReconstructedRealJourney } from './realJourneyEvents.types'
import type { NormalizedRealAlertView } from './realAlertsInspector'

export type NearbyAlertClassification =
  | 'POSIBLE_PATENTE_MAL_LEIDA'
  | 'POSIBLE_PUNTO_FALTANTE'
  | 'POSIBLE_INICIO_INVALIDO_POR_FALTA_INGRESO'
  | 'POSIBLE_CIERRE_FALTANTE'
  | 'ALERTA_NO_RELACIONADA'

export type NearbyAlertMatch = {
  alert: NormalizedRealAlertView
  diffMinutesFromStart: number
  diffMinutesFromEnd: number
  similarityScore: number
  similarPlate: boolean
  classification: NearbyAlertClassification
  relationHint: string
}

export type NearbyAlertInvestigation = {
  rows: NearbyAlertMatch[]
  hasNearbyRelevantAlerts: boolean
  nearbyAlertCodes: string[]
  possibleMissingPointsExplained: string[]
  reconstructionSuggestion: string
}

type Opts = {
  backwardHours: number
  forwardHours: number
  includeExpectedMissingSectors: boolean
  includeSimilarPlates: boolean
  includeLprMalfunction: boolean
}

const OCR_EQUIV: Record<string, string[]> = {
  O: ['0'],
  '0': ['O'],
  I: ['1'],
  '1': ['I'],
  B: ['8'],
  '8': ['B'],
  S: ['5'],
  '5': ['S'],
  Z: ['2'],
  '2': ['Z'],
  G: ['6'],
  '6': ['G'],
}

const PREV_INGRESO_SECTORS = ['RICARDONE_INGRESO_CAMIONES']
const PREV_INGRESO_DEVICES = ['RicIngCamFrente', 'RicIngCamTrasera']
const PREV_PREINGRESO_SECTORS = ['RICARDONE_PREINGRESO']
const PREV_PREINGRESO_DEVICES = ['RicPreIngInFr', 'RicPreIngInTr']
const NEXT_BALANZA_SECTORS = ['RICARDONE_BALANZA']
const NEXT_BALANZA_DEVICES = ['RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso']
const NEXT_EGRESO_SECTORS = ['RICARDONE_EGRESO_CAMIONES']
const NEXT_EGRESO_DEVICES = ['RicEgrCamFrente', 'RicEgrCamTraser', 'RicEgrCamTrasera']

function toTime(v: string): number {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : NaN
}

function includesAny(text: string, words: string[]): boolean {
  const t = text.toLowerCase()
  return words.some((w) => t.includes(w.toLowerCase()))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

function ocrAwareNormalize(s: string): string {
  return s
    .toUpperCase()
    .split('')
    .map((ch) => (OCR_EQUIV[ch]?.[0] ?? ch))
    .join('')
}

function plateSimilarity(target: string, candidate: string): { similar: boolean; score: number } {
  const a = normalizePlate(target)
  const b = normalizePlate(candidate)
  if (!a || !b) return { similar: false, score: 0 }
  if (a === b) return { similar: true, score: 1 }
  const minLen = Math.min(a.length, b.length)
  let samePos = 0
  for (let i = 0; i < minLen; i++) if (a[i] === b[i]) samePos++
  const dist = levenshtein(a, b)
  const ocrDist = levenshtein(ocrAwareNormalize(a), ocrAwareNormalize(b))
  const prefixSuffix = a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a)
  const similar = (a.length === b.length && Math.min(dist, ocrDist) <= 2) || samePos >= 4 || prefixSuffix
  const score = Math.max(0, 1 - Math.min(dist, ocrDist) / Math.max(a.length, b.length))
  return { similar, score }
}

export function findSimilarPlateReadings(targetPlate: string, alerts: NormalizedRealAlertView[]) {
  return alerts
    .map((a) => {
      const candidates = [
        a.rawPlate,
        a.normalizedPlate,
        String(a.payload.plate ?? ''),
        String(a.payload.normalizedPlate ?? ''),
        a.description,
      ].filter(Boolean)
      let best = { similar: false, score: 0 }
      for (const c of candidates) {
        const x = plateSimilarity(targetPlate, c)
        if (x.score > best.score) best = x
      }
      return { alertId: a.alertId, similar: best.similar, score: best.score }
    })
    .filter((x) => x.similar)
}

function classifyAlert(match: {
  a: NormalizedRealAlertView
  journey: ReconstructedRealJourney
  similarPlate: boolean
  expectedPrev: { sectors: string[]; devices: string[] }
  expectedNext: { sectors: string[]; devices: string[] }
}): { classification: NearbyAlertClassification; relationHint: string } {
  const a = match.a
  const code = `${a.alertCode} ${a.alertType} ${a.reason} ${a.description} ${a.message}`.toUpperCase()
  const isLpr = code.includes('LPR_MALFUNCTION')
  const isInvalidStart = code.includes('INVALID_START_JOURNEY')
  const isInvalidRoute = code.includes('INVALID_ROUTE')
  const sec = a.sectorCode
  const dev = a.deviceCode
  const startsAtPre = match.journey.logicalCodeSequence[0] === 'PREINGRESO'
  const startsAtBal = match.journey.logicalCodeSequence[0] === 'BALANZA_INGRESO'
  const hasBalIn = match.journey.logicalCodeSequence.includes('BALANZA_INGRESO')
  const hasBalEg = match.journey.logicalCodeSequence.includes('BALANZA_EGRESO')

  if ((isLpr || isInvalidStart) && (startsAtPre || startsAtBal) && (match.expectedPrev.sectors.includes(sec) || match.expectedPrev.devices.includes(dev))) {
    return { classification: 'POSIBLE_INICIO_INVALIDO_POR_FALTA_INGRESO', relationHint: 'Posible inicio inválido por falta de ingreso previo.' }
  }
  if ((isLpr || isInvalidRoute) && (match.expectedPrev.sectors.includes(sec) || match.expectedPrev.devices.includes(dev))) {
    return { classification: 'POSIBLE_PUNTO_FALTANTE', relationHint: 'Posible punto faltante en tramo inicial.' }
  }
  if ((isLpr || isInvalidRoute) && hasBalIn && !hasBalEg && (match.expectedNext.sectors.includes(sec) || match.expectedNext.devices.includes(dev))) {
    return { classification: 'POSIBLE_CIERRE_FALTANTE', relationHint: 'Posible cierre faltante posterior.' }
  }
  if (match.similarPlate) {
    return { classification: 'POSIBLE_PATENTE_MAL_LEIDA', relationHint: 'Posible OCR erróneo de patente.' }
  }
  return { classification: 'ALERTA_NO_RELACIONADA', relationHint: 'Sin evidencia suficiente de relación directa.' }
}

export function investigateNearbyAlerts(
  journey: ReconstructedRealJourney,
  alerts: NormalizedRealAlertView[],
  opts: Opts
): NearbyAlertInvestigation {
  const startMs = toTime(journey.startedAt)
  const endMs = toTime(journey.endedAt)
  const from = startMs - opts.backwardHours * 3600000
  const to = endMs + opts.forwardHours * 3600000
  const expectedPrev =
    journey.logicalCodeSequence[0] === 'BALANZA_INGRESO'
      ? { sectors: [...PREV_INGRESO_SECTORS, ...PREV_PREINGRESO_SECTORS], devices: [...PREV_INGRESO_DEVICES, ...PREV_PREINGRESO_DEVICES] }
      : { sectors: PREV_INGRESO_SECTORS, devices: PREV_INGRESO_DEVICES }
  const expectedNext = journey.logicalCodeSequence.includes('BALANZA_INGRESO') && !journey.logicalCodeSequence.includes('BALANZA_EGRESO')
    ? { sectors: NEXT_BALANZA_SECTORS, devices: NEXT_BALANZA_DEVICES }
    : { sectors: NEXT_EGRESO_SECTORS, devices: NEXT_EGRESO_DEVICES }

  const similarMap = new Map(findSimilarPlateReadings(journey.plate, alerts).map((x) => [x.alertId, x]))
  const rows: NearbyAlertMatch[] = []
  for (const a of alerts) {
    const t = toTime(a.occurredAt || String(a.raw.createdAt ?? ''))
    if (!Number.isFinite(t) || t < from || t > to) continue
    const similar = similarMap.get(a.alertId)
    const hasJourney = a.journeyUid && a.journeyUid === journey.journeyUid
    const byPlate = a.normalizedPlate && a.normalizedPlate === journey.normalizedPlate
    const inExpected = expectedPrev.sectors.includes(a.sectorCode) || expectedPrev.devices.includes(a.deviceCode) || expectedNext.sectors.includes(a.sectorCode) || expectedNext.devices.includes(a.deviceCode)
    const codeText = `${a.alertCode} ${a.alertType} ${a.reason} ${a.description} ${a.message}`.toUpperCase()
    const isLpr = codeText.includes('LPR_MALFUNCTION')
    if (!opts.includeLprMalfunction && isLpr) continue
    // Modo investigación: mostrar TODAS las alertas dentro de la ventana horaria
    // para permitir asociación manual, aunque queden como no relacionadas.
    const cls = classifyAlert({ a, journey, similarPlate: Boolean(similar?.similar), expectedPrev, expectedNext })
    if (!opts.includeExpectedMissingSectors && (cls.classification === 'POSIBLE_PUNTO_FALTANTE' || cls.classification === 'POSIBLE_CIERRE_FALTANTE')) continue
    rows.push({
      alert: a,
      diffMinutesFromStart: Math.round((t - startMs) / 60000),
      diffMinutesFromEnd: Math.round((t - endMs) / 60000),
      similarityScore: similar?.score ?? 0,
      similarPlate: Boolean(similar?.similar),
      classification: cls.classification,
      relationHint:
        hasJourney || byPlate || inExpected || Boolean(similar?.similar)
          ? cls.relationHint
          : 'Dentro de ventana horaria, sin vínculo automático.',
    })
  }
  rows.sort((x, y) => (toTime(x.alert.occurredAt) || 0) - (toTime(y.alert.occurredAt) || 0))
  const relevant = rows.filter((r) => r.classification !== 'ALERTA_NO_RELACIONADA')
  const nearbyAlertCodes = [...new Set(relevant.map((r) => r.alert.alertCode || r.alert.alertType).filter(Boolean))]
  const explained = [...new Set(relevant.map((r) => r.classification))]
  const first = relevant[0]
  const reconstructionSuggestion =
    first
      ? `${first.relationHint} (${first.alert.deviceCode || first.alert.sectorCode || 'sin device/sector'} ${Math.abs(first.diffMinutesFromStart)} min respecto al inicio del journey).`
      : 'No se encontraron alertas cercanas que expliquen los puntos faltantes.'
  return {
    rows,
    hasNearbyRelevantAlerts: relevant.length > 0,
    nearbyAlertCodes,
    possibleMissingPointsExplained: explained,
    reconstructionSuggestion,
  }
}
