/**
 * Capa: diagnóstico — mapa de depuración por journey.
 */
import type { RealJourneyEventDto, ReconstructedRealJourney } from './realJourneyEvents.types'

const RIC_LOGICAL = new Set([
  'INGRESO',
  'PREINGRESO',
  'PREINGRESO_EGRESO',
  'EGRESO',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'BALANZA',
  'VOLCABLE',
  'CELDA16_CARGA',
  'CELDA16_DESCARGA',
  'CALADA',
  'LIQUIDO',
])

/** Recorridos válidos preliminares (no incompleto ni descartados). */
const VALID_PRELIM_CODES = new Set([
  'CIRCUITO_CELDA16_DESCARGA',
  'CIRCUITO_CELDA16_CARGA',
  'CIRCUITO_VOLCABLE_1_2',
  'CIRCUITO_LIQUIDO',
  'CIRCUITO_SAN_LORENZO',
  'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
  'TRANSILE_VOLCABLE_BALANZA',
])

const VALID_MINIMAL_CODES = new Set([
  'CIRCUITO_SAN_LORENZO',
])

const VALID_PARTIAL_CODES = new Set([
  'CIRCUITO_CELDA16_DESCARGA',
  'CIRCUITO_CELDA16_CARGA',
  'CIRCUITO_VOLCABLE_1_2',
  'CIRCUITO_LIQUIDO',
  'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
])

export function collapseLogicalSignature(seq: string[]): string {
  const out: string[] = []
  for (const x of seq) {
    const c = (x ?? '').trim()
    if (!c) continue
    if (out.length === 0 || out[out.length - 1] !== c) out.push(c)
  }
  return out.join(' → ')
}

export function distinctRicLogicalSet(seq: string[]): Set<string> {
  const s = new Set<string>()
  for (const c of seq) {
    if (RIC_LOGICAL.has(c)) s.add(c)
  }
  return s
}

export function groupEventsByJourneyUid(events: RealJourneyEventDto[]): Map<string, RealJourneyEventDto[]> {
  const m = new Map<string, RealJourneyEventDto[]>()
  for (const e of events) {
    const u = (e.journeyUid ?? '').trim()
    if (!u) continue
    if (!m.has(u)) m.set(u, [])
    m.get(u)!.push(e)
  }
  return m
}

export type OperationalDepurationGeneral = {
  /** journeyUid únicos en eventos Ricardone cargados */
  rawJourneyCount: number
  /** Journeys reconstruidos sólo desde eventos patente válida */
  journeysReconstructedValidPlate: number
  /** journeyUid donde todos los eventos tienen patente inválida (no generan journey operativo) */
  invalidPlateOnlyJourneyCount: number
  discardedSoloIngresoCount: number
  discardedSoloEgresoCount: number
  /** Descartes entre journeys reconstruidos (solo ingreso/egreso ruta) */
  discardedFromReconstructedCount: number
  /** Inválidos-only + descartes reconstruidos */
  totalDiscardedJourneyCount: number
  /** {@link ReconstructedRealJourney.feedsOperationalAnalytics} */
  operationalUsefulJourneyCount: number
  pctOperationalUsefulVsRaw: number
  pctDiscardedVsRaw: number
  /** Patrones preliminares distintos de INCOMPLETO y no descartados */
  preliminaryValidPatternCount: number
}

export type DepurationCategoryRow = {
  category: string
  count: number
  pctOfRaw: number
  pctOfUseful: number
  interpretation: string
  feedsKpi: 'Sí' | 'No'
}

export type DepurationSequenceRow = {
  logicalSignature: string
  countRaw: number
  countDiscarded: number
  countUseful: number
  preliminaryClassification: string
  interpretation: string
}

export type DepurationComparator = {
  before: {
    structuralSoloIngreso: number
    structuralSoloEgreso: number
    preliminaryNonIncomplete: number
    preliminaryIncomplete: number
  }
  after: {
    discardedTotal: number
    validMinimal: number
    validPartial: number
    descargaVolcable: number
    descargaNoVolcable: number
    liquidoProbable: number
    loopBalanza: number
    soloVolcable: number
    caladaSl: number
    incompleteReal: number
  }
}

export type OperationalDepurationSnapshot = {
  general: OperationalDepurationGeneral
  categoryRows: DepurationCategoryRow[]
  sequenceRows: DepurationSequenceRow[]
  comparator: DepurationComparator
}

function preliminaryLabel(code: string): string {
  switch (code) {
    case 'DESCARTADO_PATENTE_INVALIDA':
      return 'Patente inválida (journey sin reconstrucción operativa)'
    case 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE':
      return 'Ruido — solo INGRESO'
    case 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE':
      return 'Ruido — solo EGRESO'
    case 'DESCARTADO_PREINGRESO_CAMARAS_INCOMPLETAS':
      return 'Ruido — preingreso sin par cámaras'
    case 'DESCARTADO_INGRESO_CAMARAS_INCOMPLETAS':
      return 'Ruido — ingreso sin par cámaras'
    case 'DESCARTADO_EGRESO_CAMARAS_INCOMPLETAS':
      return 'Ruido — egreso sin par cámaras'
    case 'PRELIM_RIC_LOOP_BALANZA':
      return 'Loop balanza'
    case 'CIRCUITO_SAN_LORENZO':
      return 'Ricardone → San Lorenzo'
    case 'CIRCUITO_LIQUIDO':
      return 'Circuito líquido'
    case 'DESPACHO_SIN_PUNTO_INSTRUMENTADO':
      return 'Despacho / descarga sin punto instrumentado'
    case 'CIRCUITO_VOLCABLE_1_2':
      return 'Circuito a Volcable 1/2'
    case 'CIRCUITO_CELDA16_DESCARGA':
      return 'Descarga Celda 16'
    case 'CIRCUITO_CELDA16_CARGA':
      return 'Carga Celda 16'
    case 'TRANSILE_VOLCABLE_BALANZA':
      return 'Transile Volcable → Balanza'
    case 'PRELIM_RIC_DESCARGA_VOLCABLE':
      return 'Descarga volcable'
    case 'PRELIM_RIC_LIQUIDO_PROBABLE':
      return 'Líquido probable'
    case 'PRELIM_RIC_DESCARGA_NO_VOLCABLE':
      return 'Descarga sin volcable'
    case 'PRELIM_RIC_CALADA_A_SAN_LORENZO':
      return 'Calada / probable SL'
    case 'PRELIM_RIC_INGRESO_EGRESO_VALIDO':
      return 'Mínimo ingreso‑egreso'
    case 'PRELIM_RIC_PREINGRESO_EGRESO_VALIDO':
      return 'Mínimo preingreso‑egreso'
    case 'PRELIM_RIC_INGRESO_BALANZA_VALIDO':
      return 'Parcial ingreso‑balanza'
    case 'PRELIM_RIC_PREINGRESO_BALANZA_VALIDO':
      return 'Parcial preingreso‑balanza'
    case 'PRELIM_SOLO_VOLCABLE':
      return 'Solo volcable (sector)'
    case 'REGISTRO_INCOMPLETO':
      return 'Registro incompleto'
    default:
      return code
  }
}

/**
 * Métricas y tablas para "Mapa de depuración operativa" sobre eventos Ricardone y journeys ya clasificados.
 */
export function buildOperationalDepurationSnapshot(
  ricardoneEvents: RealJourneyEventDto[],
  journeys: ReconstructedRealJourney[]
): OperationalDepurationSnapshot {
  const byUid = groupEventsByJourneyUid(ricardoneEvents)
  const rawJourneyCount = byUid.size

  let invalidPlateOnlyJourneyCount = 0
  for (const [, evs] of byUid) {
    if (evs.length > 0 && evs.every((e) => !e.isValidPlate)) invalidPlateOnlyJourneyCount++
  }

  const journeysReconstructedValidPlate = journeys.length
  const discardedSoloIngresoCount = journeys.filter(
    (j) => j.preliminaryCircuitCode === 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE'
  ).length
  const discardedSoloEgresoCount = journeys.filter(
    (j) => j.preliminaryCircuitCode === 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE'
  ).length
  const discardedFromReconstructedCount = journeys.filter((j) => j.isDiscardedOperational).length
  const operationalUsefulJourneyCount = journeys.filter((j) => j.feedsOperationalAnalytics).length

  const totalDiscardedJourneyCount = invalidPlateOnlyJourneyCount + discardedFromReconstructedCount

  const pctOperationalUsefulVsRaw =
    rawJourneyCount > 0 ? operationalUsefulJourneyCount / rawJourneyCount : 0
  const pctDiscardedVsRaw = rawJourneyCount > 0 ? totalDiscardedJourneyCount / rawJourneyCount : 0

  const OPS_KPI_PRELIMS = new Set<string>([
    'CIRCUITO_CELDA16_DESCARGA',
    'CIRCUITO_CELDA16_CARGA',
    'CIRCUITO_VOLCABLE_1_2',
    'CIRCUITO_LIQUIDO',
    'CIRCUITO_SAN_LORENZO',
    'DESPACHO_SIN_PUNTO_INSTRUMENTADO',
    'TRANSILE_VOLCABLE_BALANZA',
  ])

  const preliminaryValidPatternCount = journeys.filter(
    (j) =>
      j.feedsOperationalAnalytics &&
      OPS_KPI_PRELIMS.has(j.preliminaryCircuitCode)
  ).length

  const general: OperationalDepurationGeneral = {
    rawJourneyCount,
    journeysReconstructedValidPlate,
    invalidPlateOnlyJourneyCount,
    discardedSoloIngresoCount,
    discardedSoloEgresoCount,
    discardedFromReconstructedCount,
    totalDiscardedJourneyCount,
    operationalUsefulJourneyCount,
    pctOperationalUsefulVsRaw,
    pctDiscardedVsRaw,
    preliminaryValidPatternCount,
  }

  const interpretationForCategory = (cat: string): { text: string; feedsKpi: 'Sí' | 'No' } => {
    switch (cat) {
      case 'DESCARTADO_PATENTE_INVALIDA':
        return {
          text: 'Journeys sólo OCR inválido; no reconstruye pipeline operativo.',
          feedsKpi: 'No',
        }
      case 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE':
        return {
          text: 'Único punto INGRESO; probable captura de ruta o evento parcial.',
          feedsKpi: 'No',
        }
      case 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE':
        return {
          text: 'Único punto EGRESO; probable captura de ruta o evento parcial.',
          feedsKpi: 'No',
        }
      case 'DESCARTADO_PREINGRESO_CAMARAS_INCOMPLETAS':
        return {
          text:
            'Preingreso con lectura en un solo sentido de cámara (falta RicPreIngInFr o RicPreIngInTr); posible paso por playa sin ingreso real.',
          feedsKpi: 'No',
        }
      case 'DESCARTADO_INGRESO_CAMARAS_INCOMPLETAS':
        return {
          text: 'Ingreso planta sin par frente/trasera en el mismo journey; detección parcial o ruta.',
          feedsKpi: 'No',
        }
      case 'DESCARTADO_EGRESO_CAMARAS_INCOMPLETAS':
        return {
          text: 'Egreso planta sin par frente/trasera en el mismo journey; detección parcial o ruta.',
          feedsKpi: 'No',
        }
      case 'REGISTRO_INCOMPLETO':
        return {
          text: 'No coincide con circuitos Ricardone actuales con las cámaras cargadas.',
          feedsKpi: 'No',
        }
        default:
        if (VALID_PRELIM_CODES.has(cat)) {
          return { text: preliminaryLabel(cat), feedsKpi: 'Sí' }
        }
        return { text: '—', feedsKpi: 'No' }
    }
  }

  const codesSeen = new Set<string>()
  for (const j of journeys) codesSeen.add(j.preliminaryCircuitCode)
  codesSeen.add('DESCARTADO_PATENTE_INVALIDA')

  const sortedCodes = [...codesSeen].sort((a, b) => a.localeCompare(b))

  const categoryRows: DepurationCategoryRow[] = sortedCodes.map((category) => {
    const count =
      category === 'DESCARTADO_PATENTE_INVALIDA'
        ? invalidPlateOnlyJourneyCount
        : journeys.filter((j) => j.preliminaryCircuitCode === category).length

    const usefulCount =
      category === 'DESCARTADO_PATENTE_INVALIDA'
        ? 0
        : journeys.filter(
            (j) => j.preliminaryCircuitCode === category && j.feedsOperationalAnalytics
          ).length

    const pctOfRaw = rawJourneyCount > 0 ? count / rawJourneyCount : 0
    const pctOfUseful =
      operationalUsefulJourneyCount > 0 ? usefulCount / operationalUsefulJourneyCount : 0

    const meta = interpretationForCategory(category)

    return {
      category,
      count,
      pctOfRaw,
      pctOfUseful,
      interpretation: meta.text,
      feedsKpi: meta.feedsKpi,
    }
  })

  const sigMap = new Map<
    string,
    { raw: number; discarded: number; useful: number; code: string }
  >()

  for (const j of journeys) {
    const sig = collapseLogicalSignature(j.logicalCodeSequence)
    if (!sigMap.has(sig))
      sigMap.set(sig, { raw: 0, discarded: 0, useful: 0, code: j.preliminaryCircuitCode })
    const cell = sigMap.get(sig)!
    cell.raw++
    if (j.isDiscardedOperational) cell.discarded++
    if (j.feedsOperationalAnalytics) cell.useful++
    /** Priorizar clasificación mayoritaria en la fila si mezcla (no debería) */
    cell.code = j.preliminaryCircuitCode
  }

  const sequenceRows: DepurationSequenceRow[] = [...sigMap.entries()]
    .map(([logicalSignature, v]) => ({
      logicalSignature,
      countRaw: v.raw,
      countDiscarded: v.discarded,
      countUseful: v.useful,
      preliminaryClassification: v.code,
      interpretation: preliminaryLabel(v.code),
    }))
    .sort((a, b) => b.countRaw - a.countRaw)

  /** Comparador antes / después — sobre journeys reconstruidos */
  let structuralSoloIngreso = 0
  let structuralSoloEgreso = 0
  for (const j of journeys) {
    const d = distinctRicLogicalSet(j.logicalCodeSequence)
    if (d.size === 1 && d.has('INGRESO')) structuralSoloIngreso++
    if (d.size === 1 && d.has('EGRESO')) structuralSoloEgreso++
  }

  const preliminaryNonIncomplete = journeys.filter(
    (j) => !j.isDiscardedOperational && j.preliminaryCircuitCode !== 'REGISTRO_INCOMPLETO'
  ).length
  const preliminaryIncomplete = journeys.filter(
    (j) =>
      !j.isDiscardedOperational && j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO'
  ).length

  const usefulList = journeys.filter((j) => j.feedsOperationalAnalytics)

  const comparator: DepurationComparator = {
    before: {
      structuralSoloIngreso,
      structuralSoloEgreso,
      preliminaryNonIncomplete,
      preliminaryIncomplete,
    },
    after: {
      discardedTotal: totalDiscardedJourneyCount,
      validMinimal: usefulList.filter((j) =>
        VALID_MINIMAL_CODES.has(j.preliminaryCircuitCode)
      ).length,
      validPartial: usefulList.filter((j) => VALID_PARTIAL_CODES.has(j.preliminaryCircuitCode)).length,
      descargaVolcable: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'CIRCUITO_VOLCABLE_1_2'
      ).length,
      descargaNoVolcable: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'DESPACHO_SIN_PUNTO_INSTRUMENTADO'
      ).length,
      liquidoProbable: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'CIRCUITO_LIQUIDO'
      ).length,
      loopBalanza: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'TRANSILE_VOLCABLE_BALANZA'
      ).length,
      soloVolcable: usefulList.filter((j) => j.preliminaryCircuitCode === 'CIRCUITO_VOLCABLE_1_2')
        .length,
      caladaSl: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'CIRCUITO_SAN_LORENZO'
      ).length,
      incompleteReal: usefulList.filter(
        (j) => j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO'
      ).length,
    },
  }

  return {
    general,
    categoryRows,
    sequenceRows,
    comparator,
  }
}

export type OperationalJourneyScopeFilter =
  | 'all'
  | 'useful_only'
  | 'discarded_only'
  | 'solo_ingreso_discarded'
  | 'solo_egreso_discarded'
  | 'minimal_valid'
  | 'partial_valid'
  | 'real_incomplete'
  | 'solo_volcable'

export function journeyMatchesOperationalScope(
  j: ReconstructedRealJourney,
  f: OperationalJourneyScopeFilter
): boolean {
  if (f === 'all') return true
  if (f === 'useful_only') return j.feedsOperationalAnalytics === true
  if (f === 'discarded_only') return j.isDiscardedOperational === true
  if (f === 'solo_ingreso_discarded')
    return j.preliminaryCircuitCode === 'DESCARTADO_SOLO_INGRESO_RUTA_PROBABLE'
  if (f === 'solo_egreso_discarded')
    return j.preliminaryCircuitCode === 'DESCARTADO_SOLO_EGRESO_RUTA_PROBABLE'
  if (f === 'minimal_valid')
    return (
      j.feedsOperationalAnalytics &&
      VALID_MINIMAL_CODES.has(j.preliminaryCircuitCode)
    )
  if (f === 'partial_valid')
    return (
      j.feedsOperationalAnalytics &&
      VALID_PARTIAL_CODES.has(j.preliminaryCircuitCode)
    )
  if (f === 'real_incomplete')
    return (
      j.feedsOperationalAnalytics && j.preliminaryCircuitCode === 'REGISTRO_INCOMPLETO'
    )
  if (f === 'solo_volcable')
    return j.feedsOperationalAnalytics && j.preliminaryCircuitCode === 'CIRCUITO_VOLCABLE_1_2'
  return true
}
