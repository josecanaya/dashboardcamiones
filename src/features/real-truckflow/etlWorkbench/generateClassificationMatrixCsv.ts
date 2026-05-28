import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RealJourneyEventDto, ReconstructedRealJourney } from '../../../services/realJourneyEvents.types'
import { classifyOperationalPreliminaryCircuit } from '../../../services/realPreliminaryCircuit'
import { resolveCommitteeClassification } from './committeeClassification'
import { ETL_SL_INTERNAL_CLASSIFICATION_ENABLED } from './etlSanLorenzoSupport'
import { journeyIsRicSanLorenzoRouteEvidence, journeyHasSlIngresoEvidence } from './etlRicSanLorenzoRoute'
import {
  DEFAULT_CIRCUIT_MATRIX,
  classifyJourneyAgainstCircuitMatrix,
  computeJourneyReliability,
  isExecutiveSequenceConfigured,
  isRicSanLorenzoRouteCircuit,
  journeyHasDeducedStrongEvidence,
  journeyHasStrongDefiningPoint,
  journeyMeetsDeducedEvidenceThreshold,
  resolveExecutiveCircuitDecision,
  resolveExecutiveCircuitConfigForJourney,
  resolveOperationalEntry,
  resolveOperationalExit,
  resolveProbableSolidExecutiveDecision,
} from './finalCircuitScoring'
import { SAN_LORENZO_CAMERAS } from '../../../data/sanLorenzoCameraCatalog'

/** Orden operativo canónico Ricardone → San Lorenzo (subsecuencias = combinaciones válidas en tiempo). */
export const CLASSIFICATION_MATRIX_CANONICAL_ORDER = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'VOLCABLE',
  'CELDA16_DESCARGA',
  'CELDA16_CARGA',
  'LIQUIDO',
  'BALANZA_EGRESO',
  'EGRESO',
  'SL_INGRESO',
  'SL_PREINGRESO',
  'SL_CALADA',
  'SL_BALANZA_INGRESO',
  'SL_DESCARGA',
  'SL_BALANZA_SALIDA',
  'SL_EGRESO',
] as const

const LOGICAL_DEVICE: Record<string, { deviceCode: string; sectorCode: string }> = {
  INGRESO: { deviceCode: 'RicIngCamFrente', sectorCode: 'RICARDONE_INGRESO_CAMIONES' },
  PREINGRESO: { deviceCode: 'RicPreIngInFr', sectorCode: 'RICARDONE_PREINGRESO' },
  CALADA: { deviceCode: 'RicCal01', sectorCode: 'RICARDONE_CALADA' },
  BALANZA_INGRESO: { deviceCode: 'RicB1Ingreso', sectorCode: 'RICARDONE_BALANZA' },
  BALANZA_EGRESO: { deviceCode: 'RicB1Egreso', sectorCode: 'RICARDONE_BALANZA' },
  BALANZA: { deviceCode: 'RicB1Ingreso', sectorCode: 'RICARDONE_BALANZA' },
  VOLCABLE: { deviceCode: 'RicVolcable1', sectorCode: 'RICARDONE_VOLCABLE_1' },
  CELDA16_DESCARGA: { deviceCode: 'RicC16Descarga1', sectorCode: 'RICARDONE_CELDA_16' },
  CELDA16_CARGA: { deviceCode: 'RicC16Carga1', sectorCode: 'RICARDONE_CELDA_16' },
  LIQUIDO: { deviceCode: 'RicCalLiq01', sectorCode: 'RICARDONE_CALADA' },
  EGRESO: { deviceCode: 'RicEgrCamFrente', sectorCode: 'RICARDONE_EGRESO_CAMIONES' },
}

for (const cam of SAN_LORENZO_CAMERAS) {
  if (cam.rearExcluded || cam.installed === false) continue
  if (!LOGICAL_DEVICE[cam.logicalCode]) {
    LOGICAL_DEVICE[cam.logicalCode] = { deviceCode: cam.deviceCode, sectorCode: cam.sectorCode }
  }
}

export type ClassificationMatrixRow = {
  seq_id: number
  event_count: number
  logical_sequence: string
  preliminary_circuit_code: string
  preliminary_circuit_name: string
  technical_circuit_code: string
  executive_circuit_code: string
  executive_circuit_label: string
  matrix_final_status: string
  matrix_reason: string
  committee_group: string
  committee_reason: string
  operational_variation_type: string
  executive_status: string
  executive_reason: string
  analysis_scope: string
  has_operational_entry: boolean
  has_operational_exit: boolean
  has_sl_ingreso: boolean
  is_ric_sl_route_evidence: boolean
  notas: string
}

function* orderedSubsequences(tokens: readonly string[], minLen: number): Generator<string[]> {
  const n = tokens.length
  for (let mask = 1; mask < 1 << n; mask++) {
    const seq: string[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) seq.push(tokens[i]!)
    }
    if (seq.length >= minLen) yield seq
  }
}

function buildSyntheticEvents(logicalSequence: string[], baseIso = '2026-05-12T06:00:00.000Z'): RealJourneyEventDto[] {
  const baseMs = Date.parse(baseIso)
  return logicalSequence.map((code, idx) => {
    const tpl = LOGICAL_DEVICE[code] ?? { deviceCode: `Synth_${code}`, sectorCode: 'RICARDONE_CALADA' }
    return {
      id: idx + 1,
      sequenceNumber: idx + 1,
      occurredAt: new Date(baseMs + idx * 30 * 60_000).toISOString(),
      recordedAt: new Date(baseMs + idx * 30 * 60_000).toISOString(),
      deviceCode: tpl.deviceCode,
      sectorCode: tpl.sectorCode,
      plate: 'SIM000',
    } as RealJourneyEventDto
  })
}

function buildJourney(logicalSequence: string[]): ReconstructedRealJourney {
  const events = buildSyntheticEvents(logicalSequence)
  const startedAt = events[0]?.occurredAt ?? '2026-05-12T06:00:00.000Z'
  const endedAt = events[events.length - 1]?.occurredAt ?? startedAt
  const durationMinutes = Math.max(30, (events.length - 1) * 30)
  return {
    journeyUid: `sim_${logicalSequence.join('_')}`,
    plate: 'SIM000',
    normalizedPlate: 'SIM000',
    isValidPlate: true,
    startedAt,
    endedAt,
    durationMinutes,
    eventCount: events.length,
    events,
    logicalCodeSequence: [...logicalSequence],
    deviceCodeSequence: events.map((e) => String(e.deviceCode)),
    preliminaryCircuitCode: '',
    preliminaryCircuitName: '',
    preliminaryCircuitConfidence: 'media',
    isDiscardedOperational: false,
    siteId: 'ricardone',
  } as ReconstructedRealJourney
}

export function classifyLogicalSequence(logicalSequence: string[]): ClassificationMatrixRow {
  let journey = buildJourney(logicalSequence)
  const prelim = classifyOperationalPreliminaryCircuit(journey)
  journey = {
    ...journey,
    preliminaryCircuitCode: prelim.preliminaryCircuitCode,
    preliminaryCircuitName: prelim.preliminaryCircuitName,
    preliminaryCircuitConfidence: prelim.preliminaryCircuitConfidence,
    isDiscardedOperational: prelim.isDiscardedOperational,
  }

  const logicals = new Set(logicalSequence.map(String))
  const entry = resolveOperationalEntry(logicals)
  const exit = resolveOperationalExit(logicals, false)
  const relPack = computeJourneyReliability(journey)
  const matrixClassification = classifyJourneyAgainstCircuitMatrix(journey, DEFAULT_CIRCUIT_MATRIX)
  const technicalCircuitCode = matrixClassification.matchedCircuitCode ?? prelim.preliminaryCircuitCode
  const matrixExpectedPoints =
    matrixClassification.matchedCircuitCode ?
      (DEFAULT_CIRCUIT_MATRIX[matrixClassification.matchedCircuitCode]?.length ?? 0)
    : 0
  const matrixMatchedPoints = Math.max(0, matrixExpectedPoints - matrixClassification.missingPoints.length)
  const executiveCircuitConfig = resolveExecutiveCircuitConfigForJourney(journey, technicalCircuitCode)
  const executiveCircuitCode = executiveCircuitConfig?.code ?? ''
  const isRicSlzRoute =
    isRicSanLorenzoRouteCircuit(executiveCircuitCode) ||
    isRicSanLorenzoRouteCircuit(technicalCircuitCode) ||
    prelim.preliminaryCircuitCode === 'CIRCUITO_SAN_LORENZO' ||
    journeyIsRicSanLorenzoRouteEvidence(journey)
  const sequenceConfigured =
    isRicSlzRoute && !ETL_SL_INTERNAL_CLASSIFICATION_ENABLED ?
      true
    : isExecutiveSequenceConfigured(executiveCircuitConfig)
  const coveragePercent = executiveCircuitConfig?.coveragePercent ?? 0
  let hasStrongPoint = executiveCircuitConfig?.hasStrongPoint === true || journeyHasStrongDefiningPoint(journey)
  if (isRicSlzRoute && journeyHasSlIngresoEvidence(journey)) hasStrongPoint = true

  const deducedStrongEvidence = journeyHasDeducedStrongEvidence({
    journey,
    hasOperationalEntry: entry.has_operational_entry,
    hasOperationalExit: exit.has_operational_exit,
    frontEventCount: logicalSequence.length,
    hasInstrumentedStrongPoint: hasStrongPoint,
  })
  const journeyEvidence = {
    matchedPoints: Math.max(relPack.matched_points_count, matrixMatchedPoints),
    expectedPoints: Math.max(relPack.expected_points_count, matrixExpectedPoints),
    hasJourneyStrongPoint: deducedStrongEvidence,
  }
  const deducedEvidenceOk = journeyMeetsDeducedEvidenceThreshold({
    matrixFinalStatus: matrixClassification.finalStatus,
    ...journeyEvidence,
    matrixConfidence: matrixClassification.confidence,
  })

  let executiveCircuit = resolveExecutiveCircuitDecision({
    matrixFinalStatus: matrixClassification.finalStatus,
    matrixReason: matrixClassification.reason,
    coverageInfo: { coveragePercent, hasStrongPoint },
    sequenceConfig: {
      enabledForClassification: executiveCircuitConfig?.enabledForClassification === true,
      sequenceConfigured,
    },
    journeyEvidence,
  })

  if (executiveCircuitCode === 'RS_REC' || executiveCircuitCode === 'RS_DESP') {
    if (!deducedEvidenceOk && executiveCircuit.executiveStatus !== 'VALIDO') {
      executiveCircuit = resolveProbableSolidExecutiveDecision({
        matrixFinalStatus: matrixClassification.finalStatus,
        matrixReason: matrixClassification.reason,
        frontEventCount: logicalSequence.length,
        hasOperationalEntry: entry.has_operational_entry,
        hasOperationalExit: exit.has_operational_exit,
      })
    }
  }

  const committee = resolveCommitteeClassification({
    journey,
    executiveCircuitConfig,
    executiveCircuitCode,
    technicalCircuitCode,
    matrixFinalStatus: matrixClassification.finalStatus,
    matrixReason: matrixClassification.reason,
    executive: executiveCircuit,
    sequenceConfigured,
    hasStrongPoint,
    frontEventCount: logicalSequence.length,
    hasOperationalEntry: entry.has_operational_entry,
    hasOperationalExit: exit.has_operational_exit,
    matchedPoints: journeyEvidence.matchedPoints,
    expectedPoints: journeyEvidence.expectedPoints,
    matrixConfidence: matrixClassification.confidence,
  })

  const ricSlEvidence = journeyIsRicSanLorenzoRouteEvidence(journey)
  const slIngreso = journeyHasSlIngresoEvidence(journey)
  const hasCalada = logicalSequence.includes('CALADA')
  const hasEgresoRic = logicalSequence.includes('EGRESO')
  let notas = 'Demoras R7 (ESPERA_EN_CALADA / POSIBLE_RECHAZO) dependen de gaps ≥4 h; aquí 30 min entre eventos.'
  if (prelim.isDiscardedOperational) notas = `Descartado operativo: ${prelim.preliminaryCircuitCode}. ${notas}`
  if (ricSlEvidence && !hasEgresoRic && hasCalada && slIngreso) {
    notas = `Ruta Ric→SL cerrada por SL_INGRESO sin egreso Ricardone. ${notas}`
  }

  return {
    seq_id: 0,
    event_count: logicalSequence.length,
    logical_sequence: logicalSequence.join('>'),
    preliminary_circuit_code: prelim.preliminaryCircuitCode,
    preliminary_circuit_name: prelim.preliminaryCircuitName,
    technical_circuit_code: technicalCircuitCode,
    executive_circuit_code: executiveCircuitCode,
    executive_circuit_label: executiveCircuitConfig?.label ?? '',
    matrix_final_status: matrixClassification.finalStatus,
    matrix_reason: matrixClassification.reason,
    committee_group: committee.committee_group,
    committee_reason: committee.committee_reason,
    operational_variation_type: committee.operational_variation_type,
    executive_status: committee.executive_status,
    executive_reason: committee.executive_reason,
    analysis_scope: committee.analysis_scope,
    has_operational_entry: entry.has_operational_entry,
    has_operational_exit: exit.has_operational_exit,
    has_sl_ingreso: slIngreso,
    is_ric_sl_route_evidence: ricSlEvidence,
    notas,
  }
}

function csvEscape(value: string | number | boolean): string {
  const s = String(value ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function generateAllClassificationMatrixRows(minEvents = 3): ClassificationMatrixRow[] {
  const rows: ClassificationMatrixRow[] = []
  let id = 1
  for (const seq of orderedSubsequences(CLASSIFICATION_MATRIX_CANONICAL_ORDER, minEvents)) {
    const row = classifyLogicalSequence(seq)
    row.seq_id = id++
    rows.push(row)
  }
  return rows
}

export function classificationMatrixRowsToCsv(rows: ClassificationMatrixRow[]): string {
  const headers: (keyof ClassificationMatrixRow)[] = [
    'seq_id',
    'event_count',
    'logical_sequence',
    'preliminary_circuit_code',
    'preliminary_circuit_name',
    'technical_circuit_code',
    'executive_circuit_code',
    'executive_circuit_label',
    'matrix_final_status',
    'matrix_reason',
    'committee_group',
    'committee_reason',
    'operational_variation_type',
    'executive_status',
    'executive_reason',
    'analysis_scope',
    'has_operational_entry',
    'has_operational_exit',
    'has_sl_ingreso',
    'is_ric_sl_route_evidence',
    'notas',
  ]
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function writeClassificationMatrixCsv(
  outputPath?: string,
  minEvents = 3
): { path: string; rowCount: number } {
  const rows = generateAllClassificationMatrixRows(minEvents)
  const csv = classificationMatrixRowsToCsv(rows)
  const path = outputPath ?? resolve(process.cwd(), 'ETL_CLASSIFICATION_MATRIX.csv')
  const preamble = [
    '# Matriz de clasificación ETL — subsecuencias ordenadas de puntos operativos Ricardone + San Lorenzo',
    `# Generado: ${new Date().toISOString()}`,
    `# Puntos canónicos (${CLASSIFICATION_MATRIX_CANONICAL_ORDER.length}): ${CLASSIFICATION_MATRIX_CANONICAL_ORDER.join(' | ')}`,
    `# Combinaciones con >= ${minEvents} eventos (orden temporal respetado): ${rows.length} filas`,
    '#',
  ].join('\n')
  writeFileSync(path, `${preamble}\n${csv}`, 'utf8')
  return { path, rowCount: rows.length }
}
