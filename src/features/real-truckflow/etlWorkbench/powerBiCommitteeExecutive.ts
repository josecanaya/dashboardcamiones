import { MASTER_CIRCUIT_CATALOG } from '../../../data/masterCircuitCatalog'
import { recordsToCsv } from './etlCsv'
import { parseCsvToRecords, rowGet } from './etlCsvParse'
import { finalStatusLabel, type FinalCircuitStatus } from './finalCircuitScoring'
import {
  cameraAggregateStatus,
  ratePer100Events,
  recommendedActionForCameraStatus,
} from './powerBiCameraAggregates'

export const POWER_BI_COMMITTEE_FILES = {
  committee_summary: 'pb_committee_summary.csv',
  camera_committee_status: 'pb_camera_committee_status.csv',
  circuit_coverage: 'pb_circuit_coverage.csv',
  dss_vs_truckflow: 'pb_dss_vs_truckflow.csv',
} as const

export type PowerBiCommitteeFileKey = keyof typeof POWER_BI_COMMITTEE_FILES

/** Referencia manual DSS (opcional) para comparativa en Load. */
export type DssReferenceMetrics = Partial<{
  ingreso_frontal: number
  ingreso_operativo: number
  journeys: number
  circuitos_finales: number
  circuitos_completos: number
  circuitos_probables: number
}>

const OPERATIONAL_MATRIX_POINTS = [
  'INGRESO',
  'PREINGRESO',
  'CALADA',
  'BALANZA_INGRESO',
  'BALANZA_EGRESO',
  'EGRESO',
  'VOLCABLE',
  'CELDA16_DESCARGA',
  'CELDA16_CARGA',
  'LIQUIDO',
  'SL_INGRESO',
] as const

const FINAL_CIRCUITS_EXECUTIVE_COLUMNS = [
  'journey_uid',
  'truck_plate',
  'normalized_plate',
  'final_status',
  'final_status_label',
  'matrix_final_status',
  'executive_status',
  'executive_reason',
  'valid_detail',
  'executive_bucket',
  'executive_bucket_label',
  'confidence_level',
  'reliability_score',
  'reliability_explanation',
  'expected_points_count',
  'matched_points_count',
  'missing_points_count',
  'has_operational_entry',
  'entry_source',
  'has_operational_exit',
  'exit_source',
  'has_ingreso_frontal',
  'has_logical_egreso',
  'preliminary_code',
  'event_count_front',
  'logical_sequence_front',
  'matched_circuit_code',
  'executive_circuit_code',
  'executive_circuit_label',
  'technical_matched_circuit_code',
  'sequence_respected',
  'coverage_percent',
  'has_strong_point',
  'enabled_for_classification',
  'sequence_configured',
  'operationalAlertCount',
  'hasInvalidRoute',
  'hasInvalidJourneyStart',
  'operationalAlertCodes',
  'firstOperationalAlertAt',
  'operationalAlertSectors',
  'possibleSystemCutReason',
] as const

function numVal(v: string | undefined): number {
  if (!v) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function pct(num: number, den: number): number | '' {
  if (den <= 0) return ''
  return Math.round((num / den) * 1000) / 10
}

function criticidadFromEstado(estado: string): string {
  switch (estado) {
    case 'Crítico':
      return 'Crítica'
    case 'Alto':
      return 'Alta'
    case 'Medio':
      return 'Media'
    case 'Bajo':
      return 'Baja'
    case 'Sin base':
      return 'Alta'
    case 'Sin eventos':
      return 'Media'
    default:
      return 'Media'
  }
}

function sequenceHasPoint(seq: string, point: string): boolean {
  if (!seq) return false
  return seq.split('>').some((p) => p.trim() === point)
}

function isReconstructableStatus(st: string): boolean {
  return (
    st === 'circuito_completo' ||
    st === 'circuito_probable' ||
    st === 'circuito_probable_sin_ingreso' ||
    st === 'circuito_probable_sin_egreso'
  )
}

/** Proyecta final_circuits con columnas ejecutivas primero (listas para gráficos). */
export function projectFinalCircuitsForCommittee(rows: Record<string, string>[]): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const enriched = rows.map((r) => {
    const st = rowGet(r, 'final_status') as FinalCircuitStatus
    const label = rowGet(r, 'final_status_label') || (st ? finalStatusLabel(st) : '')
    return {
      ...r,
      final_status_label: label,
      has_operational_entry: rowGet(r, 'has_operational_entry') || 'false',
      has_operational_exit: rowGet(r, 'has_operational_exit') || 'false',
      entry_source: rowGet(r, 'entry_source') || 'sin_ingreso',
      exit_source: rowGet(r, 'exit_source') || 'sin_egreso',
      confidence_level: rowGet(r, 'confidence_level') || '',
      reliability_explanation: rowGet(r, 'reliability_explanation') || '',
    }
  })

  const extra = new Set<string>()
  for (const r of enriched) {
    for (const k of Object.keys(r)) extra.add(k)
  }
  for (const c of FINAL_CIRCUITS_EXECUTIVE_COLUMNS) extra.delete(c)

  const headers = [...FINAL_CIRCUITS_EXECUTIVE_COLUMNS, ...[...extra].sort()]
  return { headers, rows: enriched }
}

export function buildCommitteeSummaryRow(input: {
  periodStart: string
  periodEnd: string
  loadGeneratedAt: string
  rulesVersion: string
  totalSummary: Record<string, string>
  finalCircuits: Record<string, string>[]
  cameraSummaryRows: Record<string, string>[]
  daysInPeriod: number
}): Record<string, string> {
  const t = input.totalSummary
  const ingresoFrontal = numVal(t.ingreso_frontal_event_count)
  const ingresoOperativo = numVal(t.ingresos_operativos_count)
  const journeys = numVal(t.journeys_after_rear_filter)
  const circuits = numVal(t.final_circuits_count)
  const conIngresoEgreso = numVal(t.circuitos_con_ingreso_y_egreso_operativo)

  let lprTotal = 0
  let eventCam = 0
  let camerasCriticas = 0
  let camerasAltas = 0
  for (const c of input.cameraSummaryRows) {
    const ev = numVal(rowGet(c, 'event_count'))
    const lpr = numVal(rowGet(c, 'alert_lpr_count'))
    lprTotal += lpr
    eventCam += ev
    const st = rowGet(c, 'status') || cameraAggregateStatus(ev, lpr)
    if (st === 'Crítico') camerasCriticas++
    if (st === 'Alto') camerasAltas++
  }

  const lprRate = ratePer100Events(lprTotal, eventCam)
  const baseIngreso = ingresoOperativo > 0 ? ingresoOperativo : ingresoFrontal

  let journeysWithOperationalAlerts = 0
  let journeysWithInvalidRoute = 0
  let journeysWithInvalidJourneyStart = 0
  let incompletosWithInvalidJourneyStart = 0
  let anomalosWithInvalidRoute = 0

  for (const fc of input.finalCircuits) {
    const alertN = numVal(rowGet(fc, 'operationalAlertCount'))
    if (alertN <= 0) continue
    journeysWithOperationalAlerts++
    if (rowGet(fc, 'hasInvalidRoute') === 'true' || rowGet(fc, 'hasInvalidRoute') === '1') {
      journeysWithInvalidRoute++
    }
    if (rowGet(fc, 'hasInvalidJourneyStart') === 'true' || rowGet(fc, 'hasInvalidJourneyStart') === '1') {
      journeysWithInvalidJourneyStart++
    }
    const bucket = rowGet(fc, 'executive_bucket')
    if (bucket === 'INCOMPLETO' && (rowGet(fc, 'hasInvalidJourneyStart') === 'true' || rowGet(fc, 'hasInvalidJourneyStart') === '1')) {
      incompletosWithInvalidJourneyStart++
    }
    if (bucket === 'ANOMALO' && (rowGet(fc, 'hasInvalidRoute') === 'true' || rowGet(fc, 'hasInvalidRoute') === '1')) {
      anomalosWithInvalidRoute++
    }
  }

  const summaryFromTransform = input.totalSummary
  if (numVal(summaryFromTransform.journeys_with_operational_alerts) > 0) {
    journeysWithOperationalAlerts = numVal(summaryFromTransform.journeys_with_operational_alerts)
    journeysWithInvalidRoute = numVal(summaryFromTransform.journeys_with_invalid_route)
    journeysWithInvalidJourneyStart = numVal(summaryFromTransform.journeys_with_invalid_journey_start)
    incompletosWithInvalidJourneyStart = numVal(summaryFromTransform.incompletos_with_invalid_journey_start)
    anomalosWithInvalidRoute = numVal(summaryFromTransform.anomalos_with_invalid_route)
  }

  return {
    summary_level: 'executive_week',
    load_period_start: input.periodStart,
    load_period_end: input.periodEnd,
    load_generated_at: input.loadGeneratedAt,
    rules_version: input.rulesVersion,
    dias_en_periodo: String(input.daysInPeriod),
    front_events_count: t.front_events_count ?? '0',
    rear_events_count: t.rear_events_count ?? '0',
    front_alerts_count: t.front_alerts_count ?? '0',
    rear_alerts_count: t.rear_alerts_count ?? '0',
    ingreso_frontal_event_count: String(ingresoFrontal),
    ingresos_operativos_count: String(ingresoOperativo),
    journeys_after_rear_filter: String(journeys),
    final_circuits_count: String(circuits),
    valid_journeys: t.valid_journeys ?? '0',
    incomplete_journeys: t.incomplete_journeys ?? '0',
    anomalous_journeys: t.anomalous_journeys ?? '0',
    non_evaluable_journeys: t.non_evaluable_journeys ?? '0',
    valid_complete: t.valid_complete ?? '0',
    valid_deduced: t.valid_deduced ?? '0',
    non_evaluable_by_coverage: t.non_evaluable_by_coverage ?? '0',
    non_evaluable_missing_sequence: t.non_evaluable_missing_sequence ?? '0',
    anomalous_no_respeta_secuencia: t.anomalous_no_respeta_secuencia ?? '0',
    final_circuitos_completos: t.final_circuitos_completos ?? '0',
    final_circuitos_probables: t.final_circuitos_probables ?? '0',
    final_circuitos_sin_ingreso: t.final_circuitos_sin_ingreso ?? '0',
    final_circuitos_sin_egreso: t.final_circuitos_sin_egreso ?? '0',
    final_incompletos_revision: t.final_incompletos_revision ?? '0',
    circuitos_con_ingreso_operativo: t.circuitos_con_ingreso_operativo ?? '0',
    circuitos_con_egreso_operativo: t.circuitos_con_egreso_operativo ?? '0',
    circuitos_con_ingreso_y_egreso_operativo: String(conIngresoEgreso),
    journeys_vs_ingreso_ratio: t.journeys_vs_ingreso_ratio ?? '',
    final_circuits_vs_ingreso_ratio: t.final_circuits_vs_ingreso_ratio ?? '',
    lpr_alerts_total: String(lprTotal),
    lpr_alerts_per_100_events: lprRate !== '' ? String(lprRate) : '',
    cameras_estado_critico: String(camerasCriticas),
    cameras_estado_alto: String(camerasAltas),
    cobertura_circuito_entrada_salida_pct:
      baseIngreso > 0 ? String(pct(conIngresoEgreso, baseIngreso)) : '',
    cobertura_circuitos_sobre_ingreso_frontal_pct:
      ingresoFrontal > 0 ? String(pct(circuits, ingresoFrontal)) : '',
    journeys_with_operational_alerts: String(journeysWithOperationalAlerts),
    journeys_with_invalid_route: String(journeysWithInvalidRoute),
    journeys_with_invalid_journey_start: String(journeysWithInvalidJourneyStart),
    incompletos_with_invalid_journey_start: String(incompletosWithInvalidJourneyStart),
    anomalos_with_invalid_route: String(anomalosWithInvalidRoute),
    coherence_diagnosis: t.coherence_diagnosis ?? '',
    mensaje_comite:
      `Ingresos frontales ${ingresoFrontal}; operativos ${ingresoOperativo}; journeys ${journeys}; circuitos finales ${circuits} (completos ${t.final_circuitos_completos ?? 0}).`,
  }
}

export function buildCameraCommitteeStatusRows(input: {
  cameraSummaryRows: Record<string, string>[]
  periodStart: string
  periodEnd: string
}): Record<string, string>[] {
  return input.cameraSummaryRows.map((c) => {
    const ev = numVal(rowGet(c, 'event_count'))
    const lpr = numVal(rowGet(c, 'alert_lpr_count'))
    const estado = rowGet(c, 'status') || cameraAggregateStatus(ev, lpr)
    return {
      load_period_start: input.periodStart,
      load_period_end: input.periodEnd,
      deviceCode: rowGet(c, 'deviceCode', 'device_code'),
      sectorCode: rowGet(c, 'sectorCode', 'sector_code'),
      camera_type: rowGet(c, 'camera_type') || 'front',
      event_count: String(ev),
      alert_lpr_count: String(lpr),
      lpr_alerts_per_100_events: String(rowGet(c, 'lpr_alerts_per_100_events') || ratePer100Events(lpr, ev) || ''),
      estado_camara: estado,
      criticidad: criticidadFromEstado(estado),
      accion_sugerida:
        rowGet(c, 'recommended_action') || recommendedActionForCameraStatus(estado),
    }
  })
}

export function buildCircuitCoverageRows(finalCircuits: Record<string, string>[]): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const total = finalCircuits.length

  for (const point of OPERATIONAL_MATRIX_POINTS) {
    let observed = 0
    let reconstructable = 0
    for (const fc of finalCircuits) {
      const seq = rowGet(fc, 'logical_sequence_front', 'logical_sequence')
      const st = rowGet(fc, 'final_status')
      if (!sequenceHasPoint(seq, point)) continue
      observed++
      if (isReconstructableStatus(st)) reconstructable++
    }
    rows.push({
      coverage_type: 'punto_operativo',
      matrix_code: point,
      matrix_name: point.replace(/_/g, ' ').toLowerCase(),
      circuit_group: 'Secuencia lógica Ricardone',
      en_matriz_operativa: 'si',
      circuitos_observados: String(observed),
      reconstruccion_posible: String(reconstructable),
      cobertura_sobre_circuitos_pct: total > 0 ? String(pct(observed, total)) : '',
      reconstruccion_sobre_observados_pct: observed > 0 ? String(pct(reconstructable, observed)) : '',
    })
  }

  const byPrelim = new Map<string, { observed: number; reconstructable: number }>()
  for (const fc of finalCircuits) {
    const code = rowGet(fc, 'preliminary_code', 'preliminaryCircuitCode') || 'SIN_CLASIFICAR'
    const st = rowGet(fc, 'final_status')
    let b = byPrelim.get(code)
    if (!b) {
      b = { observed: 0, reconstructable: 0 }
      byPrelim.set(code, b)
    }
    b.observed++
    if (isReconstructableStatus(st)) b.reconstructable++
  }

  for (const [code, b] of [...byPrelim.entries()].sort((a, b) => b[1].observed - a[1].observed)) {
    rows.push({
      coverage_type: 'circuito_preliminar',
      matrix_code: code,
      matrix_name: code,
      circuit_group: 'Clasificación ETL',
      en_matriz_operativa: code.startsWith('CIRCUITO_') || code.startsWith('PRELIM_') ? 'si' : 'parcial',
      circuitos_observados: String(b.observed),
      reconstruccion_posible: String(b.reconstructable),
      cobertura_sobre_circuitos_pct: total > 0 ? String(pct(b.observed, total)) : '',
      reconstruccion_sobre_observados_pct: b.observed > 0 ? String(pct(b.reconstructable, b.observed)) : '',
    })
  }

  const ric = MASTER_CIRCUIT_CATALOG.ricardone
  for (const grupo of ric.grupos) {
    for (const cir of grupo.circuitos) {
      const equiv = new Set([cir.codigo, ...(cir.codigosEquivalentes ?? [])])
      let observed = 0
      let reconstructable = 0
      for (const fc of finalCircuits) {
        const seq = rowGet(fc, 'logical_sequence_front')
        const pre = rowGet(fc, 'preliminary_code')
        const matchSeq =
          Boolean(cir.secuenciaCamaras?.some((s) => sequenceHasPoint(seq, s))) ||
          Boolean(pre && equiv.has(pre))
        if (!matchSeq) continue
        observed++
        if (isReconstructableStatus(rowGet(fc, 'final_status'))) reconstructable++
      }
      rows.push({
        coverage_type: 'matriz_negocio',
        matrix_code: cir.codigo,
        matrix_name: cir.nombre,
        circuit_group: grupo.nombre,
        en_matriz_operativa: 'si',
        circuitos_observados: String(observed),
        reconstruccion_posible: String(reconstructable),
        cobertura_sobre_circuitos_pct: total > 0 ? String(pct(observed, total)) : '',
        reconstruccion_sobre_observados_pct: observed > 0 ? String(pct(reconstructable, observed)) : '',
      })
    }
  }

  return rows
}

const DSS_METRIC_DEFS: {
  metric_key: string
  metric_label: string
  truckflowField: string
  dssKey: keyof DssReferenceMetrics
}[] = [
  { metric_key: 'ingreso_frontal', metric_label: 'Ingresos frontales (RicIngCamFrente)', truckflowField: 'ingreso_frontal_event_count', dssKey: 'ingreso_frontal' },
  { metric_key: 'ingreso_operativo', metric_label: 'Ingresos operativos (INGRESO/PREINGRESO)', truckflowField: 'ingresos_operativos_count', dssKey: 'ingreso_operativo' },
  { metric_key: 'journeys', metric_label: 'Journeys Truckflow (post filtro)', truckflowField: 'journeys_after_rear_filter', dssKey: 'journeys' },
  { metric_key: 'circuitos_finales', metric_label: 'Circuitos finales ETL', truckflowField: 'final_circuits_count', dssKey: 'circuitos_finales' },
  { metric_key: 'circuitos_completos', metric_label: 'Circuitos completos', truckflowField: 'final_circuitos_completos', dssKey: 'circuitos_completos' },
  { metric_key: 'circuitos_probables', metric_label: 'Circuitos probables', truckflowField: 'final_circuitos_probables', dssKey: 'circuitos_probables' },
]

export function buildDssVsTruckflowRows(
  executiveSummary: Record<string, string>,
  dssRef?: DssReferenceMetrics
): Record<string, string>[] {
  return DSS_METRIC_DEFS.map((def) => {
    const truckflow = numVal(executiveSummary[def.truckflowField])
    const dssRaw = dssRef?.[def.dssKey]
    const hasDss = dssRaw != null && Number.isFinite(dssRaw)
    const dss = hasDss ? Number(dssRaw) : ''
    const diff = hasDss ? truckflow - Number(dssRaw) : ''
    const pctDiff =
      hasDss && Number(dssRaw) > 0 ?
        String(Math.round(((truckflow - Number(dssRaw)) / Number(dssRaw)) * 1000) / 10)
      : ''
    return {
      metric_key: def.metric_key,
      metric_label: def.metric_label,
      truckflow_count: String(truckflow),
      dss_count: hasDss ? String(dssRaw) : '',
      diferencia: diff !== '' ? String(diff) : '',
      porcentaje_diferencia: pctDiff,
      nota: hasDss ? 'comparativa_activa' : 'cargar_dss_manual',
    }
  })
}

export type CommitteeExecutiveCsvPack = {
  csv: Record<PowerBiCommitteeFileKey, string>
  rowCounts: Record<PowerBiCommitteeFileKey, number>
}

export function buildCommitteeExecutiveCsvPack(input: {
  periodStart: string
  periodEnd: string
  loadGeneratedAt: string
  rulesVersion: string
  totalSummary: Record<string, string>
  finalCircuits: Record<string, string>[]
  cameraSummaryCsv: string
  daysInPeriod: number
  dssReference?: DssReferenceMetrics
}): CommitteeExecutiveCsvPack {
  const { rows: cameraSummaryRows } = parseCameraSummaryCsv(input.cameraSummaryCsv)

  const executiveRow = buildCommitteeSummaryRow({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    loadGeneratedAt: input.loadGeneratedAt,
    rulesVersion: input.rulesVersion,
    totalSummary: input.totalSummary,
    finalCircuits: input.finalCircuits,
    cameraSummaryRows,
    daysInPeriod: input.daysInPeriod,
  })

  const committeeHeaders = Object.keys(executiveRow)
  const committee_summary = recordsToCsv(committeeHeaders, [executiveRow])

  const cameraStatusRows = buildCameraCommitteeStatusRows({
    cameraSummaryRows,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  })
  const camera_committee_status = recordsToCsv(
    cameraStatusRows.length ?
      Object.keys(cameraStatusRows[0])
    : [
        'load_period_start',
        'load_period_end',
        'deviceCode',
        'estado_camara',
        'criticidad',
        'accion_sugerida',
      ],
    cameraStatusRows
  )

  const coverageRows = buildCircuitCoverageRows(input.finalCircuits)
  const circuit_coverage = recordsToCsv(
    coverageRows.length ?
      Object.keys(coverageRows[0])
    : [
        'coverage_type',
        'matrix_code',
        'matrix_name',
        'circuitos_observados',
        'reconstruccion_posible',
        'cobertura_sobre_circuitos_pct',
      ],
    coverageRows
  )

  const dssRows = buildDssVsTruckflowRows(executiveRow, input.dssReference)
  const dss_vs_truckflow = recordsToCsv(
    Object.keys(dssRows[0] ?? { metric_key: '' }),
    dssRows
  )

  return {
    csv: {
      committee_summary,
      camera_committee_status,
      circuit_coverage,
      dss_vs_truckflow,
    },
    rowCounts: {
      committee_summary: 1,
      camera_committee_status: cameraStatusRows.length,
      circuit_coverage: coverageRows.length,
      dss_vs_truckflow: dssRows.length,
    },
  }
}

function parseCameraSummaryCsv(csv: string): { rows: Record<string, string>[] } {
  if (!csv.trim()) return { rows: [] }
  return { rows: parseCsvToRecords(csv).rows }
}
