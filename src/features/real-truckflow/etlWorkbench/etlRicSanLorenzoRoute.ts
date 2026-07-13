import type { ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { compareRealEvents } from '../../../services/realJourneyEventsMapper'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import { lookupSanLorenzoCameraByDevice } from '../../../data/sanLorenzoCameraCatalog'
import { isEtlRearCameraDevice } from './etlRearDevices'
import {
  R7_RIC_LOGICAL_PREFIX,
  SL_RECEPCION_LOGICAL_CHAIN,
  TRANSILE_C16_RIC_CARGA_PREFIX,
  TRANSILE_C16_RIC_DESCARGA_PREFIX,
} from './validCircuitMatrix'
import { parseTimestampMs } from './etlTimestampNormalize'
import { eventOperationalInstantForTimeline } from '../../../services/realEventOperationalTime'

const RIC_LOGICAL_MARKERS = new Set([
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'EGRESO',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'BALANZA',
  'VOLCABLE',
  'CELDA16_CARGA',
  'CELDA16_DESCARGA',
  'LIQUIDO',
])

const SL_LOGICAL_MARKERS = new Set([
  ...SL_RECEPCION_LOGICAL_CHAIN,
  'SL_PREINGRESO',
  'SL_PLAYA',
  'SL_TRAMO',
  'SL_ENLACE_FINAL',
  'SL_BALANZA_EGRESO',
])

function journeyFrontEvents(j: ReconstructedRealJourney) {
  return j.events.filter((e) => !isEtlRearCameraDevice(e.deviceCode))
}

function collapseConsecutiveEqual(seq: string[]): string[] {
  const out: string[] = []
  for (const x of seq) {
    const t = String(x ?? '')
    if (out[out.length - 1] !== t) out.push(t)
  }
  return out
}

export function getCollapsedLogicalCodes(j: ReconstructedRealJourney): string[] {
  const events = journeyFrontEvents(j)
  if (events.length) {
    return collapseConsecutiveEqual(
      [...events].sort(compareRealEvents).map((e) => normalizeRealEventPoint(e).logicalCode)
    )
  }
  return collapseConsecutiveEqual(j.logicalCodeSequence.map((x) => String(x).trim()).filter(Boolean))
}

function logicalSet(j: ReconstructedRealJourney): Set<string> {
  return new Set(getCollapsedLogicalCodes(j))
}

function firstIndexOf(logical: string[], codes: Set<string>): number {
  for (let i = 0; i < logical.length; i++) {
    if (codes.has(logical[i]!)) return i
  }
  return -1
}

function isSlLogicalCode(code: string): boolean {
  const c = String(code ?? '').trim()
  return c.startsWith('SL_') || SL_LOGICAL_MARKERS.has(c)
}

function isRicDevice(deviceCode: string): boolean {
  const d = String(deviceCode ?? '').trim()
  if (!d) return false
  if (d.toUpperCase().startsWith('SLZ')) return false
  return /^Ric/i.test(d)
}

/** SL ingreso por cámara catalogada o por secuencia lógica ya reconstruida. */
export function journeyHasSlIngresoEvidence(j: ReconstructedRealJourney): boolean {
  for (const e of journeyFrontEvents(j)) {
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    if (dev?.installed === false) continue
    const norm = normalizeRealEventPoint(e)
    const code = dev?.logicalCode ?? norm.logicalCode
    if (code === 'SL_INGRESO') return true
  }
  return j.logicalCodeSequence.some((c) => String(c).trim() === 'SL_INGRESO')
}

export function journeyHasCelda16Evidence(j: ReconstructedRealJourney): boolean {
  const logical = logicalSet(j)
  return logical.has('CELDA16_CARGA') || logical.has('CELDA16_DESCARGA')
}

export function journeyHasRicardoneLogicalEvidence(j: ReconstructedRealJourney): boolean {
  const logical = logicalSet(j)
  if (logical.has('INGRESO') || logical.has('PREINGRESO')) return true
  for (const e of journeyFrontEvents(j)) {
    if (isRicDevice(String(e.deviceCode ?? ''))) return true
  }
  return false
}

export function journeyHasSlOperationalEvidence(j: ReconstructedRealJourney): boolean {
  for (const e of journeyFrontEvents(j)) {
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    if (dev?.installed === false) continue
    const norm = normalizeRealEventPoint(e)
    const code = dev?.logicalCode ?? norm.logicalCode
    if (isSlLogicalCode(code)) return true
  }
  return getCollapsedLogicalCodes(j).some(isSlLogicalCode)
}

/** Transile Celda 16 (Ric) → San Lorenzo. */
export function journeyIsTransileC16ToSl(j: ReconstructedRealJourney): boolean {
  if (!journeyHasCelda16Evidence(j)) return false
  if (!journeyHasSlIngresoEvidence(j)) return false
  if (!journeyHasRicardoneLogicalEvidence(j)) return false
  const logical = getCollapsedLogicalCodes(j)
  const c16Idx = firstIndexOf(logical, new Set(['CELDA16_CARGA', 'CELDA16_DESCARGA']))
  const slIdx = firstIndexOf(logical, new Set(['SL_INGRESO']))
  return c16Idx >= 0 && slIdx > c16Idx
}

/** Transile San Lorenzo → Celda 16 (Ric). */
export function journeyIsTransileSlToC16(j: ReconstructedRealJourney): boolean {
  if (!journeyHasCelda16Evidence(j)) return false
  if (!journeyHasSlIngresoEvidence(j)) return false
  if (!journeyHasRicardoneLogicalEvidence(j)) return false
  const logical = getCollapsedLogicalCodes(j)
  const c16Idx = firstIndexOf(logical, new Set(['CELDA16_CARGA', 'CELDA16_DESCARGA']))
  const slIdx = firstIndexOf(logical, new Set(['SL_INGRESO']))
  return slIdx >= 0 && c16Idx > slIdx
}

/** Planta Excel que habilita circuitos SL sin restricción de plataforma. */
export function excelPlantaIsSanLorenzoTerminal(plantaNormalized: string | null | undefined): boolean {
  const p = String(plantaNormalized ?? '')
    .trim()
    .toUpperCase()
  return p === 'SAN_LORENZO' || p === 'TERMINAL_EMBARQUE' || p === 'TERMINAL_PORTUARIA'
}

/**
 * Truckflow no debe etiquetarse SL1 si el recorrido es Ricardone (líquido, volcable, calada, etc.)
 * sin ingreso operativo San Lorenzo (SL_INGRESO / cámaras SLZ).
 */
export function journeyBlocksSl1ExecutiveClassification(j: ReconstructedRealJourney): boolean {
  if (journeyIsTransileC16ToSl(j) || journeyIsTransileSlToC16(j)) return false
  if (journeyHasSlIngresoEvidence(j)) return false
  if (!journeyHasRicardoneLogicalEvidence(j)) return false
  const logical = logicalSet(j)
  if (
    logical.has('VOLCABLE') ||
    logical.has('LIQUIDO') ||
    logical.has('CALADA') ||
    logical.has('CELDA16_CARGA') ||
    logical.has('CELDA16_DESCARGA')
  ) {
    return true
  }
  if (logical.has('BALANZA_INGRESO') || logical.has('BALANZA_EGRESO') || logical.has('BALANZA')) {
    return true
  }
  for (const e of journeyFrontEvents(j)) {
    if (isRicDevice(String(e.deviceCode ?? ''))) return true
  }
  return false
}

/** Solo San Lorenzo — sin eventos Ricardone útiles. */
export function journeyIsSlOnlyInternal(j: ReconstructedRealJourney): boolean {
  if (journeyBlocksSl1ExecutiveClassification(j)) return false
  if (journeyHasRicardoneLogicalEvidence(j)) return false
  const events = journeyFrontEvents(j)
  if (events.length < 2) return false
  for (const e of events) {
    if (isRicDevice(String(e.deviceCode ?? ''))) return false
    const norm = normalizeRealEventPoint(e)
    const dev = lookupSanLorenzoCameraByDevice(String(e.deviceCode ?? '').trim())
    const code = dev?.logicalCode ?? norm.logicalCode
    if (RIC_LOGICAL_MARKERS.has(code)) return false
  }
  if (!journeyHasSlIngresoEvidence(j)) {
    const logical = getCollapsedLogicalCodes(j)
    const hasSlBal = logical.some((c) => c.startsWith('SL_'))
    if (!hasSlBal) return false
  }
  return journeyHasSlOperationalEvidence(j)
}

/**
 * Ric→SL: ingreso Ricardone + SL_INGRESO.
 * No aplica si es transile C16↔SL ni recepción Ric instrumentada completa (C16/volcable/balanza destino).
 */
export function journeyIsRicSanLorenzoRouteEvidence(j: ReconstructedRealJourney): boolean {
  if (journeyIsTransileC16ToSl(j) || journeyIsTransileSlToC16(j)) return false
  if (!journeyHasSlIngresoEvidence(j)) return false
  const logical = logicalSet(j)
  if (!logical.has('INGRESO') && !logical.has('PREINGRESO')) return false
  const blocked = [
    'VOLCABLE',
    'CELDA16_CARGA',
    'CELDA16_DESCARGA',
    'LIQUIDO',
    'BALANZA_INGRESO',
    'BALANZA_EGRESO',
    'BALANZA',
  ]
  return !blocked.some((c) => logical.has(c))
}

export function journeyHasExtendedSlChain(j: ReconstructedRealJourney): boolean {
  const logical = logicalSet(j)
  return (
    logical.has('SL_BALANZA_INGRESO') ||
    logical.has('SL_CALADA') ||
    logical.has('SL_DESCARGA') ||
    logical.has('SL_EGRESO')
  )
}

/** Código técnico DEFAULT_CIRCUIT_MATRIX según circuito ejecutivo resuelto. */
export function resolveTechnicalCircuitCodeForExecutive(
  journey: ReconstructedRealJourney,
  executiveCode: string
): string | null {
  switch (executiveCode) {
    case 'R7':
      return journeyHasExtendedSlChain(journey) ? 'CIRCUITO_R7_MIXTO' : 'CIRCUITO_SAN_LORENZO'
    case 'R26':
      return journeyIsTransileSlToC16(journey) ?
          logicalSet(journey).has('CELDA16_DESCARGA') ?
            'TRANSILE_SL_A_C16_DESCARGA'
          : 'TRANSILE_SL_A_C16'
        : logicalSet(journey).has('CELDA16_DESCARGA') ?
          'TRANSILE_C16_A_SL_DESCARGA'
        : 'TRANSILE_C16_A_SL'
    case 'R27':
    case 'R28':
    case 'R30':
    case 'R31':
    case 'R32':
      return null
    case 'SL1':
      return 'CIRCUITO_SL_RECEPCION'
    default:
      return null
  }
}

export function buildCircuitLogicalSequence(parts: readonly (readonly string[])[]): string[] {
  const out: string[] = []
  for (const p of parts) {
    for (const code of p) out.push(code)
  }
  return out
}

export const DEFAULT_CIRCUIT_MATRIX_EXTENSIONS = {
  CIRCUITO_R7_MIXTO: buildCircuitLogicalSequence([R7_RIC_LOGICAL_PREFIX, SL_RECEPCION_LOGICAL_CHAIN]),
  TRANSILE_C16_A_SL: buildCircuitLogicalSequence([
    TRANSILE_C16_RIC_CARGA_PREFIX,
    SL_RECEPCION_LOGICAL_CHAIN,
  ]),
  TRANSILE_C16_A_SL_DESCARGA: buildCircuitLogicalSequence([
    TRANSILE_C16_RIC_DESCARGA_PREFIX,
    SL_RECEPCION_LOGICAL_CHAIN,
  ]),
  TRANSILE_SL_A_C16: buildCircuitLogicalSequence([
    SL_RECEPCION_LOGICAL_CHAIN,
    TRANSILE_C16_RIC_CARGA_PREFIX,
  ]),
  TRANSILE_SL_A_C16_DESCARGA: buildCircuitLogicalSequence([
    SL_RECEPCION_LOGICAL_CHAIN,
    TRANSILE_C16_RIC_DESCARGA_PREFIX,
  ]),
  CIRCUITO_SL_RECEPCION: [...SL_RECEPCION_LOGICAL_CHAIN],
} as const

export type R7LegDurations = {
  ricDurationMin: number
  bridgeDurationMin: number
  slDurationMin: number
  totalDurationMin: number
}

export function computeR7LegDurations(j: ReconstructedRealJourney): R7LegDurations | null {
  const events = journeyFrontEvents(j).sort(compareRealEvents)
  if (events.length < 2) return null

  let ricStartIdx = 0
  let ricEndIdx = -1
  let slStartIdx = -1
  let slEndIdx = -1

  for (let i = 0; i < events.length; i++) {
    const code = normalizeRealEventPoint(events[i]!).logicalCode
    if (RIC_LOGICAL_MARKERS.has(code) && !isSlLogicalCode(code)) {
      if (ricEndIdx < 0 && code === 'EGRESO') ricEndIdx = i
    }
    if (isSlLogicalCode(code)) {
      if (slStartIdx < 0 && code === 'SL_INGRESO') slStartIdx = i
      slEndIdx = i
    }
  }

  const parseMin = (a: string, b: string) => {
    const ms = parseTimestampMs(b) - parseTimestampMs(a)
    return Number.isFinite(ms) && ms > 0 ? ms / 60000 : 0
  }

  const instantAt = (idx: number) => eventOperationalInstantForTimeline(events[idx]!)

  const totalDurationMin = parseMin(instantAt(0), instantAt(events.length - 1))
  if (totalDurationMin <= 0) return null

  let ricDurationMin = 0
  let bridgeDurationMin = 0
  let slDurationMin = 0

  if (ricEndIdx >= ricStartIdx) {
    ricDurationMin = parseMin(instantAt(ricStartIdx), instantAt(ricEndIdx))
  }
  if (slStartIdx >= 0 && slEndIdx >= slStartIdx) {
    slDurationMin = parseMin(instantAt(slStartIdx), instantAt(slEndIdx))
  }
  if (ricEndIdx >= 0 && slStartIdx > ricEndIdx) {
    bridgeDurationMin = parseMin(instantAt(ricEndIdx), instantAt(slStartIdx))
  }

  return { ricDurationMin, bridgeDurationMin, slDurationMin, totalDurationMin }
}
