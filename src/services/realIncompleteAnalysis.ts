import type { ReconstructedRealJourney } from './realJourneyEvents.types'

const TRACKED_LOGICAL = [
  'INGRESO',
  'PREINGRESO',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'VOLCABLE',
  'EGRESO',
  'SL_INGRESO',
] as const

export type TrackedLogicalCode = (typeof TRACKED_LOGICAL)[number]

/** Colapsa repeticiones consecutivas; conserva orden y repeticiones separadas (loops). */
export function normalizeSequenceForPattern(sequence: string[]): string[] {
  const out: string[] = []
  for (const raw of sequence) {
    const s = (raw ?? '').trim()
    if (!s) continue
    if (out.length === 0 || out[out.length - 1] !== s) out.push(s)
  }
  return out
}

export function getSequenceSignature(
  j: Pick<ReconstructedRealJourney, 'logicalCodeSequence' | 'normalizedPointSequence' | 'rawSectorSequence'>
): string {
  const log = (j.logicalCodeSequence ?? []).map((x) => (x ?? '').trim()).filter(Boolean)
  if (log.length > 0) return normalizeSequenceForPattern(log).join(' → ')
  const np = (j.normalizedPointSequence ?? []).map((x) => (x ?? '').trim()).filter(Boolean)
  if (np.length > 0) return normalizeSequenceForPattern(np).join(' → ')
  return normalizeSequenceForPattern((j.rawSectorSequence ?? []).map((x) => (x ?? '').trim())).join(' → ')
}

function collectPresentTracked(journeys: ReconstructedRealJourney[]): Set<string> {
  const set = new Set<string>()
  for (const j of journeys) {
    for (const c of j.logicalCodeSequence) {
      const t = (c ?? '').trim()
      if ((TRACKED_LOGICAL as readonly string[]).includes(t)) set.add(t)
    }
  }
  return set
}

export function missingTrackedElements(present: Set<string>): string[] {
  return TRACKED_LOGICAL.filter((k) => !present.has(k))
}

export function presentTrackedList(present: Set<string>): string[] {
  return TRACKED_LOGICAL.filter((k) => present.has(k))
}

function interpretationAndActions(present: Set<string>): { interpretation: string; actions: string[] } {
  const has = (x: string) => present.has(x)
  const trackedCodes = TRACKED_LOGICAL.filter((k) => present.has(k))

  const actions: string[] = []

  if (trackedCodes.length === 1 && trackedCodes[0] === 'SL_INGRESO') {
    actions.push('Separar como San Lorenzo', 'Analizar por patente para posible interplanta')
    return {
      interpretation:
        'Ingreso San Lorenzo aislado respecto del subconjunto analizado. Conviene separar de Ricardone o vincular en una etapa futura con egreso Ricardone por patente y tiempo.',
      actions,
    }
  }

  if (has('INGRESO') && has('PREINGRESO') && !has('BALANZA_INGRESO') && !has('BALANZA_EGRESO') && !has('EGRESO')) {
    actions.push(
      'Revisar si falta mapping de deviceCode/sectorCode',
      'Revisar si corresponde a corte de journey',
      'Excluir de KPIs por ahora'
    )
    return {
      interpretation:
        'Camión con ingreso y preingreso, pero sin continuidad registrada hacia balanza o egreso. Puede ser journey abierto, falta de captura posterior o cámara no vinculada.',
      actions,
    }
  }

  if (has('VOLCABLE') && has('BALANZA_EGRESO') && !has('INGRESO') && !has('BALANZA_INGRESO')) {
    actions.push(
      'Revisar si corresponde a corte de journey',
      'Revisar si esta secuencia debe convertirse en nuevo patrón preliminar',
      'Excluir de KPIs por ahora'
    )
    return {
      interpretation:
        'Actividad en descarga con salida por balanza, pero sin inicio del recorrido observable. Puede indicar journey incompleto o falta de asociación de eventos previos.',
      actions,
    }
  }

  if ((has('BALANZA_INGRESO') || has('BALANZA_EGRESO')) && !has('INGRESO') && !has('PREINGRESO')) {
    actions.push(
      'Revisar si falta mapping de deviceCode/sectorCode',
      'Revisar si corresponde a corte de journey',
      'Revisar si esta secuencia debe convertirse en nuevo patrón preliminar'
    )
    return {
      interpretation:
        'Movimiento registrado desde balanza sin ingreso asociado en la secuencia. Puede ser journey cortado, cámara de ingreso sin captura o evento separado.',
      actions,
    }
  }

  if (has('INGRESO') && has('EGRESO') && !has('PREINGRESO')) {
    actions.push('Revisar si esta secuencia debe convertirse en nuevo patrón preliminar', 'Revisar si falta mapping de deviceCode/sectorCode')
    return {
      interpretation:
        'Ingreso y egreso detectados sin preingreso intermedio. Puede ser paso directo, falta temporal de lectura en preingreso o derivación operativa no contemplada.',
      actions,
    }
  }

  actions.push(
    'Revisar si falta mapping de deviceCode/sectorCode',
    'Revisar si esta secuencia debe convertirse en nuevo patrón preliminar',
    'Excluir de KPIs por ahora'
  )
  return {
    interpretation:
      'Patrón no cubierto por las reglas preliminares actuales; puede corresponder a una operación real no modelada, datos parciales o problemas de vinculación entre cámaras.',
    actions,
  }
}

export type IncompleteSequenceGroup = {
  signature: string
  count: number
  uniquePlateCount: number
  firstSeenAt: string
  lastSeenAt: string
  sampleJourneyUids: string[]
  samplePlates: string[]
  rawSectorExamples: string[][]
  deviceCodeExamples: string[][]
  missingElements: string[]
  elementsPresentLabels: string
  possibleInterpretation: string
  suggestedAction: string
  candidatePattern: boolean
  candidateReason: string
  journeys: ReconstructedRealJourney[]
}

/** Para tablas/detalle se limitan ejemplos; el grupo conserva todos los journeys. */
const MAX_SAMPLE_IDS = 20
const MAX_SAMPLE_PLATES = 12
const MAX_EXAMPLES = 3

/** Agrupa viajes clasificados como PRELIM_INCOMPLETO por firma de secuencia. */
export function buildIncompleteSequenceGroups(journeys: ReconstructedRealJourney[]): IncompleteSequenceGroup[] {
  const incompletos = journeys.filter((j) => j.preliminaryCircuitCode === 'PRELIM_INCOMPLETO')
  const totalIncompletos = incompletos.length
  if (totalIncompletos === 0) return []

  const bySig = new Map<string, ReconstructedRealJourney[]>()
  for (const j of incompletos) {
    const sig = getSequenceSignature(j) || '(secuencia vacía)'
    if (!bySig.has(sig)) bySig.set(sig, [])
    bySig.get(sig)!.push(j)
  }

  const groups: IncompleteSequenceGroup[] = []

  for (const [signature, list] of bySig) {
    const sorted = [...list].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    const present = collectPresentTracked(sorted)
    const missing = missingTrackedElements(present)
    const { interpretation, actions } = interpretationAndActions(present)

    const plates = new Set<string>()
    let firstT = Infinity
    let lastT = -Infinity
    for (const j of sorted) {
      const p = (j.plate ?? '').trim()
      if (p) plates.add(p)
      const s = new Date(j.startedAt).getTime()
      const e = new Date(j.endedAt).getTime()
      if (Number.isFinite(s)) firstT = Math.min(firstT, s)
      if (Number.isFinite(e)) lastT = Math.max(lastT, e)
    }

    const rawSectorExamples = sorted.slice(0, MAX_EXAMPLES).map((j) => [...j.rawSectorSequence])
    const deviceCodeExamples = sorted.slice(0, MAX_EXAMPLES).map((j) => [...j.deviceCodeSequence])

    const sampleJourneyUids = sorted.slice(0, MAX_SAMPLE_IDS).map((j) => j.journeyUid)
    const samplePlatesSet = new Set<string>()
    for (const j of sorted) {
      const p = (j.plate ?? '').trim()
      if (p) samplePlatesSet.add(p)
      if (samplePlatesSet.size >= MAX_SAMPLE_PLATES) break
    }

    const { candidatePattern, candidateReason } = classifyCandidate(sorted.length, totalIncompletos, present)

    groups.push({
      signature,
      count: sorted.length,
      uniquePlateCount: plates.size,
      firstSeenAt: Number.isFinite(firstT) ? new Date(firstT).toISOString() : '',
      lastSeenAt: Number.isFinite(lastT) ? new Date(lastT).toISOString() : '',
      sampleJourneyUids,
      samplePlates: [...samplePlatesSet],
      rawSectorExamples,
      deviceCodeExamples,
      missingElements: missing,
      elementsPresentLabels: presentTrackedList(present).join(', ') || '—',
      possibleInterpretation: interpretation,
      suggestedAction: [...new Set(actions)].join(' · '),
      candidatePattern,
      candidateReason,
      journeys: sorted,
    })
  }

  groups.sort((a, b) => b.count - a.count)
  return suggestPotentialNewPreliminaryPatterns(groups, totalIncompletos)
}

function classifyCandidate(
  count: number,
  totalIncomplete: number,
  present: Set<string>
): { candidatePattern: boolean; candidateReason: string } {
  const ratio = totalIncomplete > 0 ? count / totalIncomplete : 0
  const freq = count > 10 || ratio > 0.05

  let candidatePattern = false
  const reasons: string[] = []

  if (freq) {
    candidatePattern = true
    reasons.push('Candidato a nuevo patrón preliminar (frecuencia y participación sobre incompletos).')
  }
  if (present.has('INGRESO') && present.has('EGRESO')) {
    candidatePattern = true
    reasons.push('Alta prioridad: aparece ingreso y egreso en los códigos lógicos del grupo.')
  }
  if (
    present.has('BALANZA_INGRESO') &&
    present.has('BALANZA_EGRESO') &&
    !present.has('INGRESO')
  ) {
    candidatePattern = true
    reasons.push('Posible patrón por corte de journey o falta de cámara de ingreso asociada.')
  }
  if (present.has('BALANZA_INGRESO') || present.has('BALANZA_EGRESO') || present.has('VOLCABLE')) {
    candidatePattern = true
    reasons.push('Tiene punto operativo fuerte (BALANZA/VOLCABLE).')
  }
  if (present.has('EGRESO') || present.has('BALANZA_EGRESO')) {
    candidatePattern = true
    reasons.push('Presenta cierre operativo parcial.')
  }
  const onlySlTracked =
    TRACKED_LOGICAL.filter((k) => present.has(k)).length === 1 && present.has('SL_INGRESO')
  if (onlySlTracked) {
    candidatePattern = true
    reasons.push('Separar flujo San Lorenzo.')
  }

  return {
    candidatePattern,
    candidateReason: reasons.join(' '),
  }
}

/** Ajustes finales de candidatura (mensajes globales pueden sumarse desde la UI con top 5). */
export function suggestPotentialNewPreliminaryPatterns(
  groups: IncompleteSequenceGroup[],
  _totalIncomplete: number
): IncompleteSequenceGroup[] {
  return groups
}

export function pctOfIncomplete(count: number, totalIncomplete: number): number {
  return totalIncomplete > 0 ? (count / totalIncomplete) * 100 : 0
}
