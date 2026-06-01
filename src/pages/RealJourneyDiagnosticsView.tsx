import { useMemo, useState, lazy, Suspense, type ReactNode } from 'react'
import {
  POWER_BI_COMMITTEE_FILENAMES,
  POWER_BI_COMMITTEE_FILE_COUNT,
  POWER_BI_ETL_DEBUG_FILE_COUNT,
  POWER_BI_ETL_FILENAMES,
  POWER_BI_ETL_SCHEMA_VERSION,
  type PowerBiCommitteeCsvKey,
} from '../services/powerBiEtlExport'

const COMMITTEE_SINGLE_CSV_ROWS: readonly { key: PowerBiCommitteeCsvKey; label: string }[] = [
  { key: 'clean_circuits_v2', label: 'Circuitos v2' },
  { key: 'clean_events_v2', label: 'Eventos v2' },
  { key: 'etl_quality_summary_v2', label: 'Calidad ETL v2' },
  { key: 'incompletos_por_motivo', label: 'Incompletos' },
  { key: 'camera_diagnostics', label: 'Diagnóstico cámaras' },
]
import { normalizeSequenceForPattern, pctOfIncomplete } from '../services/realIncompleteAnalysis'
import { preliminaryCircuitTypicalSectorPath } from '../services/realPreliminaryCircuit'
import type { OperationalDepurationSnapshot, OperationalJourneyScopeFilter } from '../services/realJourneyDepurationMap'
import type { PlateQualitySummaryResult } from '../services/realPlateQuality'
import type { CameraCoverageBuildResult } from '../services/realCameraCoverage'
import type { IncompleteSequenceGroup } from '../services/realIncompleteAnalysis'
import { normalizeRealEventPoint } from '../services/realEventNormalization'
import type { RealJourneyEventDto, ReconstructedRealJourney } from '../services/realJourneyEvents.types'
import type { RealAlertDto, RealTruckflowQueryParams } from '../services/realTruckflowApi'
import type { buildCleanRealDataset } from '../services/realTruckflowCleanDataset'
import type { AlertsQuickFilter, NormalizedRealAlertView } from '../services/realAlertsInspector'
import type { RearCameraFilterTrace } from '../services/rearCameraFilter'
import type { CommitteePipelineExecutiveSummary } from '../services/realCommitteePipeline'
import { ExecutiveMetricCard } from '../components/realDiagnostics/ExecutiveMetricCard'
import { DiagDrawer } from '../components/realDiagnostics/DiagDrawer'
import { DataDistributionDonut } from '../components/realDiagnostics/DataDistributionDonut'
import { DataQualityFunnel } from '../components/realDiagnostics/DataQualityFunnel'
import { HorizontalBarChart } from '../components/realDiagnostics/HorizontalBarChart'
import { EventosTruckflowPresentation } from '../components/realDiagnostics/EventosTruckflowPresentation'
import { ExtraccionDatosTab } from '../features/real-truckflow/tabs/ExtraccionDatosTab'
import { AnalisisLocalTab } from '../features/real-truckflow/tabs/AnalisisLocalTab'
import { TransformEtlTab } from '../features/real-truckflow/tabs/TransformEtlTab'
import { KpiComiteTab } from '../features/real-truckflow/tabs/KpiComiteTab'
import { KpiTiemposTab } from '../features/real-truckflow/tabs/KpiTiemposTab'
import { LoadExportTab } from '../features/real-truckflow/tabs/LoadExportTab'
import {
  ETL_DEV_MODE,
  ETL_DEV_TAB_IDS,
  ETL_PRODUCT_TAB_IDS,
} from '../config/committeeEtlLite'
const LiveCameraMonitorLazy = lazy(async () => {
  const m = await import('../components/realDiagnostics/LiveCameraMonitor')
  return { default: m.LiveCameraMonitor }
})

export type RealDataMainTab =
  | 'extraccion_datos'
  | 'transform_etl'
  | 'load_export'
  | 'analisis_local'
  | 'eventos'
  | 'alertas'
  | 'resumen'
  | 'circuitos'
  | 'buscar'
  | 'envivo'
  | 'depuracion'
  | 'incompletos'
  | 'camara_por_camara'
  | 'etl_export'
  | 'dss_truckflow'
  | 'kpi_comite'
  | 'kpi_tiempos'

/** Navegación completa Datos reales (modo histórico; muchas vistas no están en la barra y se enlazan desde otras pantallas). */
export const MAIN_TABS: { id: RealDataMainTab; label: string }[] = [
  { id: 'eventos', label: 'Eventos' },
  { id: 'alertas', label: 'Alertas' },
  { id: 'circuitos', label: 'Circuitos preliminares' },
  { id: 'buscar', label: 'Buscar patente' },
  { id: 'envivo', label: 'En vivo' },
]

/** Etiquetas del proceso ETL (productivo + diagnóstico DEV). */
const ETL_TAB_LABELS: Record<RealDataMainTab, string> = {
  extraccion_datos: 'Extracción',
  analisis_local: 'Análisis local',
  transform_etl: 'Transform',
  kpi_tiempos: 'KPI tiempos',
  load_export: 'Load / Export',
  kpi_comite: 'KPIs ETL',
  resumen: 'Resumen',
  depuracion: 'Depuración',
  incompletos: 'Incompletos',
  eventos: 'Eventos',
  alertas: 'Alertas',
  circuitos: 'Circuitos preliminares',
  camara_por_camara: 'Cámara por cámara',
  buscar: 'Buscar patente',
  etl_export: 'Export ETL',
  envivo: 'En vivo',
  dss_truckflow: 'DSS vs Truckflow',
}

const ETL_PRODUCT_NAV_TABS = ETL_PRODUCT_TAB_IDS.map((id) => ({
  id,
  label: ETL_TAB_LABELS[id],
}))

const ETL_DEV_NAV_TABS = ETL_DEV_TAB_IDS.map((id) => ({
  id,
  label: ETL_TAB_LABELS[id],
}))

/** @deprecated Usar ETL_PRODUCT_NAV_TABS + ETL_DEV_NAV_TABS */
const ETL_PROCESS_NAV_TABS = [...ETL_PRODUCT_NAV_TABS, ...ETL_DEV_NAV_TABS]

export type RealDataTimeFilterMode = 'month' | 'week' | 'day'

type RealDataSource = 'api' | 'file'

export type JourneyQuickFilter =
  | 'all'
  | 'complete_minimal'
  | 'incomplete'
  | 'solo_ingreso'
  | 'solo_egreso'
  | 'solo_volcable'
  | 'volcable_ingreso'
  | 'volcable_complete'
  | 'mixed'
  | 'long'
  | 'repeat'
  | 'inc_prelim'
  | 'inc_prelim_grouped'
  | 'inc_prelim_with_ing'
  | 'inc_prelim_without_ing'
  | 'inc_prelim_with_bal'
  | 'inc_prelim_with_volc'
  | 'inc_prelim_with_egr'
  | 'inc_prelim_sl'

const DEPURATION_SCOPE_OPTIONS: { id: OperationalJourneyScopeFilter; label: string }[] = [
  { id: 'all', label: 'Ver todos' },
  { id: 'useful_only', label: 'Solo útiles' },
  { id: 'discarded_only', label: 'Solo descartados' },
  { id: 'solo_ingreso_discarded', label: 'Solo ingreso descartado' },
  { id: 'solo_egreso_discarded', label: 'Solo egreso descartado' },
  { id: 'minimal_valid', label: 'Válidos mínimos' },
  { id: 'partial_valid', label: 'Válidos parciales' },
  { id: 'real_incomplete', label: 'Registro incompleto' },
  { id: 'solo_volcable', label: 'Solo Volcable' },
]

const ALERTS_QUICK_FILTER_OPTIONS: { id: AlertsQuickFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'invalid_plate', label: 'Con patente inválida' },
  { id: 'valid_plate', label: 'Con patente válida' },
  { id: 'with_journey', label: 'Con journeyUuid' },
  { id: 'without_journey', label: 'Sin journeyUuid' },
  { id: 'invalid_route', label: 'Por recorrido inválido (inferido)' },
  { id: 'ocr_plate', label: 'Por OCR / patente (inferido)' },
  { id: 'sector_device', label: 'Por sector/cámara (inferido)' },
  { id: 'level_high', label: 'Nivel alto' },
  { id: 'level_medium', label: 'Nivel medio' },
  { id: 'level_low', label: 'Nivel bajo' },
]

const FLAG_BADGE_CLASS: Record<string, string> = {
  VIAJE_COMPLETO_MINIMO: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80',
  VOLCABLE_COMPLETO_MINIMO: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100',
  VIAJE_INCOMPLETO: 'bg-slate-200 text-slate-800',
  SOLO_VOLCABLE: 'bg-amber-100 text-amber-900 ring-1 ring-amber-200/80',
  JOURNEY_SOSPECHOSO_LARGO: 'bg-rose-100 text-rose-900 ring-1 ring-rose-200/80',
  MIXTO_RICARDONE_SAN_LORENZO: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/80',
}

function QualityFlagBadge({ flag }: { flag: string }) {
  const cls = FLAG_BADGE_CLASS[flag] ?? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
  return <span className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>{flag}</span>
}

export function formatDateTimeShort(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

export type PowerBiExportLoadedSummary = {
  queryStart: string
  queryEnd: string
  loadedAtIso: string
  eventsReceived: number
  alertsReceived: number
  operationalEvents: number
  operationalAlerts: number
  circuitsGenerated: number
  zeroEventsNotice: boolean
  zeroAlertsNotice: boolean
}

export type RealJourneyDiagnosticsViewProps = {
  loading: boolean
  error: string | null
  dataSource: RealDataSource
  setDataSource: (v: RealDataSource) => void
  apiStartDate: string
  apiEndDate: string
  setApiStartDate: (v: string) => void
  setApiEndDate: (v: string) => void
  filePath: string
  setFilePath: (v: string) => void
  load: () => Promise<void>
  includeInvalidPlateDiagnostics: boolean
  setIncludeInvalidPlateDiagnostics: (v: boolean) => void
  selectedDay: string
  setSelectedDay: (v: string) => void
  calendarDayOptions: string[]
  calendarDayPickerIndex: number
  eventCountByCalendarDay: Map<string, number>
  formatCalendarDayOptionLabel: (dayKey: string, eventCount: number | undefined, countLabel: 'valid' | 'all_reads') => string
  eventMinDay: string
  eventMaxDay: string
  timeFilterMode: RealDataTimeFilterMode
  setTimeFilterMode: (v: RealDataTimeFilterMode) => void
  timeFilterMonth: string
  setTimeFilterMonth: (v: string) => void
  timeFilterWeek: string
  setTimeFilterWeek: (v: string) => void
  timeFilterDay: string
  setTimeFilterDay: (v: string) => void
  timeFilterAllDay: boolean
  setTimeFilterAllDay: (v: boolean) => void
  timeFilterStartTime: string
  setTimeFilterStartTime: (v: string) => void
  timeFilterEndTime: string
  setTimeFilterEndTime: (v: string) => void
  appliedTimeRangeLabel: string
  applyTimeFilter: () => Promise<void>
  prelimCircuitFilter: string
  setPrelimCircuitFilter: (v: string) => void
  circuitRangeStartDate: string
  setCircuitRangeStartDate: (v: string) => void
  circuitRangeEndDate: string
  setCircuitRangeEndDate: (v: string) => void
  journeyQuickFilter: JourneyQuickFilter
  setJourneyQuickFilter: (v: JourneyQuickFilter) => void
  depurationScopeFilter: OperationalJourneyScopeFilter
  setDepurationScopeFilter: (v: OperationalJourneyScopeFilter) => void
  onlyThisPlateScope: boolean
  setOnlyThisPlateScope: (v: boolean) => void
  plateQuery: string
  setPlateQuery: (v: string) => void
  plateNorm: string
  journeyQuery: string
  setJourneyQuery: (v: string) => void
  journeyQueryNorm: string
  interplantWindowHours: number
  setInterplantWindowHours: (v: number) => void
  mainTab: RealDataMainTab
  setMainTab: (v: RealDataMainTab) => void
  showExcludedRearEvents: boolean
  setShowExcludedRearEvents: (v: boolean) => void
  showExcludedRearAlerts: boolean
  setShowExcludedRearAlerts: (v: boolean) => void
  rearCameraFilterTrace: RearCameraFilterTrace
  standaloneRearAlertFilterTrace: RearCameraFilterTrace

  journeys: ReconstructedRealJourney[]
  events: RealJourneyEventDto[]
  /** Lista de la última carga tras filtrar sólo Ricardone (`sectorCode` → `RICARDONE_*`; sin San Lorenzo/Puerto). */
  eventsUnfiltered: RealJourneyEventDto[]
  plateQualitySummary: PlateQualitySummaryResult
  depurationSnapshot: OperationalDepurationSnapshot
  donutJourneys: {
    usefulKpi: number
    discarded: number
    incompleteReal: number
    diagOnly: number
    total: number
  }
  prelimCircuitCardMetrics: {
    totalOperational: number
    volcable: number
    sinVolcable: number
    caladaSl: number
    liquido: number
    loopBalanza: number
    celda16: number
    soloVolcable: number
    incompletos: number
    minIngEgr: number
    minPreEg: number
    partialIngBal: number
    partialPreBal: number
  }
  circuitBarItems: { id: string; label: string; count: number; colorClass?: string }[]
  circuitSummaryRows: {
    code: string
    variant: string
    count: number
    uniquePlates: number
    meanDur: number
    p90: number
    confidence: string
    alertsAssociated: number
    pctOfUseful: number
  }[]
  cameraCoverageSummary: CameraCoverageBuildResult
  cameraStatusCounts: { activas: number; parciales: number; baja: number; repetitiva: number; combos: number }
  topInvalidPlateReading: string
  plateEventsAll: RealJourneyEventDto[]
  plateJourneysFull: ReconstructedRealJourney[]
  plateSummary: {
    totalEvents: number
    totalJourneys: number
    firstAt: string
    lastAt: string
    dayCount: number
    sectors: string[]
    devices: string[]
    circuits: string[]
    flagTop: [string, number][]
  } | null
  plateQueryFormatWarning: boolean
  plateTimelineRows: ReturnType<typeof import('../services/realPlateAudit').buildPlateEventRows>
  interplantHintsForPlate: ReturnType<typeof import('../services/realPlateAudit').detectRicardoneEgressToSanLorenzoWindow>
  plateMilestoneTimeline: { slot: string; event: RealJourneyEventDto | undefined }[]
  downloadPlateCsv: () => void
  incompleteGroups: IncompleteSequenceGroup[]
  incompleteTotal: number
  incompleteRankings: {
    topSignature: string
    topCount: number
    pctTop5: number
    withIngreso: number
    withBalanza: number
    withVolcable: number
    withEgreso: number
    onlySlFull: number
  }
  depurationExecutiveRows: {
    key: string
    label: string
    count: number
    pct: number
    reason: string
    kpi: 'Sí' | 'No' | 'Parcial'
  }[]
  topDiscardInfo: { label: string; count: number; detail: string }
  integrityLabel: { tone: 'emerald' | 'amber' | 'rose'; text: string }
  datasetQualityBadge: { cls: string; text: string }
  filteredJourneys: ReconstructedRealJourney[]
  filteredPlateRows: ReturnType<typeof import('../services/realJourneyQuality').buildPlateRowsByDay>
  prelimCircuitDailyFiltered: import('../services/realPreliminaryCircuit').PreliminaryCircuitDailyRow[]

  drawerCircuitCode: string | null
  setDrawerCircuitCode: (v: string | null) => void
  drawerCircuitJourneys: ReconstructedRealJourney[]
  drawerIncompleteGroup: IncompleteSequenceGroup | null
  setDrawerIncompleteGroup: (v: IncompleteSequenceGroup | null) => void
  apiQuery: RealTruckflowQueryParams
  setApiQuery: (v: RealTruckflowQueryParams) => void
  rawAlerts: RealAlertDto[]
  etlLoadingEvents: boolean
  etlLoadingAlerts: boolean
  etlError: string | null
  lastQueryUrl: string
  cleanDataset: ReturnType<typeof buildCleanRealDataset> | null
  datasetProcessedAt: string
  loadEtlEvents: () => Promise<void>
  loadEtlAlerts: () => Promise<void>
  loadEtlAll: () => Promise<void>
  processCleanDataset: () => void
  exportCleanDatasetJson: () => void
  exportCleanSummaryCsv: () => void
  alertsQuery: RealTruckflowQueryParams
  setAlertsQuery: (v: RealTruckflowQueryParams) => void
  alertsLoading: boolean
  alertsError: string | null
  alertsLastQueryUrl: string
  alertsLastQueriedAt: string
  alertsQuickFilter: AlertsQuickFilter
  setAlertsQuickFilter: (v: AlertsQuickFilter) => void
  normalizedAlertsStandalone: NormalizedRealAlertView[]
  filteredAlertsStandalone: NormalizedRealAlertView[]
  alertsSummary: {
    total: number
    validPlate: number
    invalidPlate: number
    withJourney: number
    withoutJourney: number
    invalidRoute: number
    sectorDevice: number
    mostFrequentLevel: string
    mostFrequentType: string
    byType: Array<{ group: string; count: number; pct: number; firstAt: string; lastAt: string; alerts: NormalizedRealAlertView[] }>
    bySector: Array<{ group: string; count: number; pct: number; firstAt: string; lastAt: string; alerts: NormalizedRealAlertView[] }>
    byDevice: Array<{ group: string; count: number; pct: number; firstAt: string; lastAt: string; alerts: NormalizedRealAlertView[] }>
    byPlate: Array<{ group: string; count: number; pct: number; firstAt: string; lastAt: string; alerts: NormalizedRealAlertView[] }>
    byJourney: Array<{ group: string; count: number; pct: number; firstAt: string; lastAt: string; alerts: NormalizedRealAlertView[] }>
  }
  selectedAlert: NormalizedRealAlertView | null
  setSelectedAlert: (v: NormalizedRealAlertView | null) => void
  selectedAlertJourneyEvents: RealJourneyEventDto[]
  selectedAlertJourneyLoading: boolean
  selectedAlertJourneyError: string | null
  loadAlertsStandalone: () => Promise<void>
  clearAlertsFilters: () => void
  exportAlertsCsv: () => void
  exportAlertsJson: () => void
  loadJourneyEventsForAlert: (journeyUid: string) => Promise<void>
  setSelectedAlertJourneyEvents: (v: RealJourneyEventDto[]) => void
  setRawAlerts: (v: RealAlertDto[]) => void
  loadSummaryAll: () => Promise<void>
  useUsefulWindow: boolean
  setUseUsefulWindow: (v: boolean) => void
  usefulWindow: {
    firstIngresoAt: string
    lastIngresoAt: string
    usefulWindowStart: string
    usefulWindowEnd: string
    windowValid: boolean
    insideCount: number
    outsideCount: number
  }
  summaryJourneys: Array<{
    etlStatus: 'included' | 'review_required' | 'excluded'
    reason: string
    journeyUid: string
    plate: string
    startedAt: string
    endedAt: string
    durationMinutes: number
    preliminaryCircuitCode: string
    alertCodes: string[]
    logicalSequence: string[]
    rawSequence: string[]
    inUsefulWindow: boolean
    hasNearbyRelevantAlerts: boolean
    nearbyAlertCodes: string[]
    possibleMissingPointsExplained: string[]
    reconstructionSuggestion: string
    committeeOperationalCircuit?: string
    committeeFlags?: string[]
    committeeTemporalBucket?: string
  }>
  summaryFilter: 'all' | 'included' | 'review_required' | 'excluded' | 'with_alert' | 'without_alert' | 'lpr_malfunction' | 'invalid_route' | 'invalid_start' | 'outside_window'
  setSummaryFilter: (v: 'all' | 'included' | 'review_required' | 'excluded' | 'with_alert' | 'without_alert' | 'lpr_malfunction' | 'invalid_route' | 'invalid_start' | 'outside_window') => void
  exportKpiJson: () => void
  exportSummaryKpiCsv: () => void
  exportRawEventsJson: () => void
  exportRawEventsCsv: () => void
  /** Un clic = un solo CSV (recomendado si el navegador bloquea varias descargas). */
  exportPowerBiCommitteeSingleCsv: (key: PowerBiCommitteeCsvKey) => void
  /** ZIP modo debug con todos los CSV de auditoría (raw, legacy clean, fusión OCR, score debug, etc.). */
  exportPowerBiDebugZip: () => void
  powerBiExportStartDate: string
  setPowerBiExportStartDate: (v: string) => void
  powerBiExportStartTime: string
  setPowerBiExportStartTime: (v: string) => void
  powerBiExportEndDate: string
  setPowerBiExportEndDate: (v: string) => void
  powerBiExportEndTime: string
  setPowerBiExportEndTime: (v: string) => void
  loadPowerBiExportPeriod: () => Promise<void>
  powerBiExportLoading: boolean
  powerBiPeriodValidationError: string | null
  powerBiExportLoadError: string | null
  /** Error al construir/descargar el bundle después de cargar período (p. ej. excepción en ETL v2). */
  powerBiExportBundleError: string | null
  powerBiExportLoadedSummary: PowerBiExportLoadedSummary | null
  lastLoadedAt: string
  circuitSourceRows: Array<{
    etlStatus: 'included' | 'review_required' | 'excluded'
    journeyUid: string
    plate: string
    startedAt: string
    endedAt: string
    durationMinutes: number
    eventCount: number
    preliminaryCircuitCode: string
    preliminaryCircuitVariant: string
    preliminaryCircuitConfidence: string
    classificationRuleId: string
    classificationReason: string
    missingExpectedPoints: string[]
    evidencePoints: string[]
    alertCodes: string[]
    reviewReason: string
    exclusionReason: string
    logicalSequence: string[]
    rawSequence: string[]
    deviceSequence: string[]
    alerts: NormalizedRealAlertView[]
    inUsefulWindow: boolean
    events: RealJourneyEventDto[]
    hasNearbyRelevantAlerts: boolean
    nearbyAlertCodes: string[]
    possibleMissingPointsExplained: string[]
    reconstructionSuggestion: string
  }>
  circuitSourceSummary: { eventsCount: number; plates: number; alertsCount: number; inside: number; outside: number; included: number; review: number; excluded: number }
  selectedCircuitJourneyUid: string | null
  setSelectedCircuitJourneyUid: (v: string | null) => void
  exportClassificationAuditCsv: () => void
  exportCircuitosCsv: () => void
  nearbyDrawerJourneyUid: string | null
  setNearbyDrawerJourneyUid: (v: string | null) => void
  nearbyBackwardHours: number
  setNearbyBackwardHours: (v: number) => void
  nearbyForwardHours: number
  setNearbyForwardHours: (v: number) => void
  nearbyIncludeExpectedSectors: boolean
  setNearbyIncludeExpectedSectors: (v: boolean) => void
  nearbyIncludeSimilarPlates: boolean
  setNearbyIncludeSimilarPlates: (v: boolean) => void
  nearbyIncludeLpr: boolean
  setNearbyIncludeLpr: (v: boolean) => void
  nearbyDrawerResult: {
    rows: Array<{
      alert: NormalizedRealAlertView
      diffMinutesFromStart: number
      diffMinutesFromEnd: number
      similarityScore: number
      similarPlate: boolean
      classification: string
      relationHint: string
    }>
    hasNearbyRelevantAlerts: boolean
    nearbyAlertCodes: string[]
    possibleMissingPointsExplained: string[]
    reconstructionSuggestion: string
  } | null
  applyAlertsHourPreset: (hours: 1 | 2 | 3, aroundJourney?: boolean) => void
  nearbyAlertsLoading: boolean
  nearbyAlertsError: string | null
  associateNearbyAlert: (journeyUid: string, alertCode: string) => void
  lprQualitySummary: {
    eventsTotal: number
    alertsTotal: number
    lprCount: number
    lprIndexPer100Events: number | null
    lprPctAlerts: number
    invalidRoute: number
    invalidStart: number
    hasOver100Index: boolean
  }
  lprByCameraRows: Array<{
    deviceCode: string
    sectorCode: string
    eventsAssociated: number
    lprAlerts: number
    lprIndexPer100VisibleEvents: number | null
    lprShareOnCameraAlerts: number
    status: string
    mostFrequentInvalidRead: string
    firstAlert: string
    lastAlert: string
    noVisibleEventBaseHint: boolean
  }>
  lprFailedReadRows: Array<{
    createdAt: string
    deviceCode: string
    sectorCode: string
    description: string
    payloadPlate: string
    payloadNormalizedPlate: string
    alertCode: string
    severity: string
  }>
  lprSourceMeta: {
    sourceMode: string
    startDate: string
    endDate: string
    rawEventCount: number
    rawAlertCount: number
    usingRawEvents: boolean
    lastLoadedAt: string
  }
  lprCameraAudit: { deviceCode: string; sectorCode: string } | null
  setLprCameraAudit: (v: { deviceCode: string; sectorCode: string } | null) => void
  lprCameraAuditData: {
    deviceCode: string
    sectorCode: string
    eventsForCamera: RealJourneyEventDto[]
    alertsForCamera: Array<{
      createdAt: string
      deviceCode: string
      sectorCode: string
      description: string
      payloadPlate: string
      payloadNormalizedPlate: string
      alertCode: string
      severity: string
    }>
    eventCount: number
    alertCount: number
    rangeStart: string
    rangeEnd: string
    hourlySeries: Array<{ hour: string; events: number; lprAlerts: number }>
  } | null
  lprGeneralBars: Array<{ label: string; value: number; color: string }>
  exportLprSummaryCsv: () => void
  exportLprGeneralPng: () => void
  exportLprCameraChartPng: () => void
  exportLprCameraCsv: () => void
  committeeExecutiveSummary: CommitteePipelineExecutiveSummary
  committeeAlertsAlignedCount: number
  committeeEtlTotals: { included: number; review: number; excluded: number }
  committeeIncludedBarItems: { id: string; label: string; count: number; colorClass?: string }[]
  committeeReviewBarItems: { id: string; label: string; count: number; colorClass?: string }[]
  committeeLprBarItems: { id: string; label: string; count: number; colorClass?: string }[]
  exportCommitteeDataset: () => void
  /** Modo período único (comité): oculta filtro mes/semana/día inferior. */
  hideLegacyPeriodFilters?: boolean
  /** Reemplaza la pestaña ETL legacy por export acoplado al workspace. */
  renderEtlExportTab?: () => ReactNode
}

export function RealJourneyDiagnosticsView(p: RealJourneyDiagnosticsViewProps) {
  const [nearbyPlateFilter, setNearbyPlateFilter] = useState('')
  const [etlDevOpen, setEtlDevOpen] = useState(ETL_DEV_MODE)
  const isDevEtlTab = (ETL_DEV_TAB_IDS as readonly string[]).includes(p.mainTab)
  const [nearbyDeviceFilter, setNearbyDeviceFilter] = useState('')
  const [nearbySectorFilter, setNearbySectorFilter] = useState('')
  const [drawerJourneySearch, setDrawerJourneySearch] = useState('')
  const [drawerSectorFilter, setDrawerSectorFilter] = useState('')
  const [drawerDeviceFilter, setDrawerDeviceFilter] = useState('')
  const [drawerOnlySinglePoint, setDrawerOnlySinglePoint] = useState(false)
  const [drawerOnlyWithNearby, setDrawerOnlyWithNearby] = useState(false)
  const [eventosViewMode, setEventosViewMode] = useState<'consulta' | 'presentacion'>('consulta')
  const filteredNearbyRows = useMemo(() => {
    const rows = p.nearbyDrawerResult?.rows ?? []
    const plateQ = nearbyPlateFilter.trim().toUpperCase()
    const devQ = nearbyDeviceFilter.trim().toUpperCase()
    const secQ = nearbySectorFilter.trim().toUpperCase()
    return rows.filter((r) => {
      const plateCandidates = [
        r.alert.normalizedPlate,
        r.alert.rawPlate,
        String(r.alert.payload.plate ?? ''),
        String(r.alert.payload.normalizedPlate ?? ''),
        r.alert.description,
      ]
        .join(' ')
        .toUpperCase()
      const dev = (r.alert.deviceCode || '').toUpperCase()
      const sec = (r.alert.sectorCode || '').toUpperCase()
      const okPlate = !plateQ || plateCandidates.includes(plateQ)
      const okDevice = !devQ || dev.includes(devQ)
      const okSector = !secQ || sec.includes(secQ)
      return okPlate && okDevice && okSector
    })
  }, [nearbyDeviceFilter, nearbyPlateFilter, nearbySectorFilter, p.nearbyDrawerResult?.rows])
  const filteredCircuitRows = useMemo(() => {
    const q = drawerJourneySearch.trim().toUpperCase()
    const sectorQ = drawerSectorFilter.trim().toUpperCase()
    const deviceQ = drawerDeviceFilter.trim().toUpperCase()
    return p.circuitSourceRows.filter((r) => {
      const firstSector = (r.rawSequence[0] || '').toUpperCase()
      const firstDevice = (r.deviceSequence[0] || '').toUpperCase()
      const anySector = r.rawSequence.join(' ').toUpperCase()
      const anyDevice = r.deviceSequence.join(' ').toUpperCase()
      const anyText = `${r.journeyUid} ${r.plate}`.toUpperCase()
      if (q && !anyText.includes(q)) return false
      if (sectorQ && !firstSector.includes(sectorQ) && !anySector.includes(sectorQ)) return false
      if (deviceQ && !firstDevice.includes(deviceQ) && !anyDevice.includes(deviceQ)) return false
      if (drawerOnlySinglePoint && r.logicalSequence.length !== 1) return false
      if (drawerOnlyWithNearby && !r.hasNearbyRelevantAlerts) return false
      return true
    })
  }, [drawerDeviceFilter, drawerJourneySearch, drawerOnlySinglePoint, drawerOnlyWithNearby, drawerSectorFilter, p.circuitSourceRows])

  const filteredCircuitSinglePointSummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of filteredCircuitRows) {
      if (r.logicalSequence.length !== 1) continue
      const key = `${r.logicalSequence[0] || 'UNKNOWN'} · ${r.rawSequence[0] || 'SIN_SECTOR'} · ${r.deviceSequence[0] || 'SIN_DEVICE'}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [filteredCircuitRows])
  const searchAlertsForCurrentQuery = useMemo(() => {
    if (!p.plateNorm && !p.journeyQueryNorm) return []
    return p.normalizedAlertsStandalone.filter((a) => {
      const matchesPlate = Boolean(p.plateNorm && (a.normalizedPlate || '').includes(p.plateNorm))
      const matchesJourney = Boolean(
        p.journeyQueryNorm && (a.journeyUid || '').trim().toUpperCase().includes(p.journeyQueryNorm)
      )
      return p.plateNorm && p.journeyQueryNorm ? matchesPlate && matchesJourney : matchesPlate || matchesJourney
    })
  }, [p.journeyQueryNorm, p.normalizedAlertsStandalone, p.plateNorm])
  const g = p.depurationSnapshot.general
  const raw = Math.max(1, g.rawJourneyCount)
  const afterSoloIe = Math.max(0, g.journeysReconstructedValidPlate - g.discardedSoloIngresoCount - g.discardedSoloEgresoCount)
  const discardRatePct = raw > 0 ? (1 - g.operationalUsefulJourneyCount / raw) * 100 : 0

  const funnelStages = [
    {
      title: 'Datos crudos',
      value: g.rawJourneyCount,
      badge: 'RAW',
      pctOfRaw: 1,
    },
    {
      title: 'Patentes válidas — recorridos reconstruidos',
      value: g.journeysReconstructedValidPlate,
      badge: `${((g.journeysReconstructedValidPlate / raw) * 100).toFixed(1)}% retención`,
      pctOfRaw: g.rawJourneyCount > 0 ? g.journeysReconstructedValidPlate / raw : 0,
    },
    {
      title: 'Tras descartar solo ingreso / solo egreso (ruta probable)',
      value: afterSoloIe,
      badge: `${((afterSoloIe / raw) * 100).toFixed(1)}%`,
      pctOfRaw: g.rawJourneyCount > 0 ? afterSoloIe / raw : 0,
    },
    {
      title: 'Datos útiles — operativos',
      value: g.operationalUsefulJourneyCount,
      badge: `${((g.operationalUsefulJourneyCount / raw) * 100).toFixed(1)}% útil`,
      pctOfRaw: g.pctOperationalUsefulVsRaw,
    },
  ]

  const incTone =
    p.integrityLabel.tone === 'emerald'
      ? 'bg-emerald-500'
      : p.integrityLabel.tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pb-10">
      <header className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Dataset Ricardone (sin puerto SL)</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Datos reales</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Diagnóstico operativo y calidad de ingesta. Circuitos observables aquí siguen siendo{' '}
              <span className="font-medium text-slate-800">preliminares</span>; no equivalen todavía a la matriz oficial R/SL.
            </p>
            <p className="mt-3 max-w-2xl border-l-2 border-teal-500 pl-3 text-xs leading-relaxed text-slate-600">
              Los datos crudos se conservan; el pipeline ETL excluye provisoriamente cámaras traseras/sensibles y aplica segmentación temporal sobre journeys no operativos.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-200/80 ${p.datasetQualityBadge.cls}`}
            >
              {p.datasetQualityBadge.text}
            </span>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 ring-1 ring-teal-200/90">
              Dataset filtrado ETL
            </span>
          </div>
        </div>

        {p.eventMinDay && p.eventMaxDay ? (
          <p className="mt-4 text-[11px] text-slate-500">
            Rango cargado Ricardone: <span className="font-mono">{p.eventMinDay}</span> → <span className="font-mono">{p.eventMaxDay}</span>
          </p>
        ) : null}
        {p.error ? <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{p.error}</div> : null}
      </header>

      <section className="space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700/90">Datos reales</p>
          <h2 className="text-lg font-bold text-slate-900">Consola en vivo</h2>
          <p className="mt-1 text-sm text-slate-600">Consulta operativa por cámara, día y franja horaria (API Truckflow).</p>
        </div>
        <Suspense
          fallback={
            <div className="rounded-3xl border border-slate-800 bg-[#0b1020] px-6 py-14 text-center text-sm text-slate-400">
              Cargando monitor en vivo…
            </div>
          }
        >
          <LiveCameraMonitorLazy />
        </Suspense>
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700/90">Proceso</p>
          <h2 className="text-xl font-bold text-slate-900">ETL</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Extract → análisis local → transform → export Power BI. Evidencia ejecutiva para comité; la depuración técnica
            queda en modo DEV.
          </p>
        </div>

      <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {ETL_PRODUCT_NAV_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => p.setMainTab(t.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${p.mainTab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
        {ETL_DEV_MODE ?
          <>
            <button
              type="button"
              onClick={() => setEtlDevOpen((v) => !v)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide ${
                etlDevOpen ?
                  'border-amber-400 bg-amber-50 text-amber-950'
                : 'border-dashed border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {etlDevOpen ? 'Ocultar DEV' : 'Diagnóstico DEV'}
            </button>
            {etlDevOpen ?
              ETL_DEV_NAV_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setEtlDevOpen(true)
                    p.setMainTab(t.id)
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    p.mainTab === t.id ?
                      'bg-amber-900 text-white shadow'
                    : 'border border-amber-200 bg-amber-50/60 text-amber-950 hover:bg-amber-100'
                  }`}
                >
                  {t.label}
                </button>
              ))
            : null}
          </>
        : null}
      </nav>

      {isDevEtlTab && ETL_DEV_MODE ?
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
          Vista de diagnóstico DEV — no forma parte del flujo productivo para comité.
        </p>
      : null}

      {p.mainTab === 'extraccion_datos' ?
        <ExtraccionDatosTab onGoToAnalysis={() => p.setMainTab('analisis_local')} />
      : null}
      {p.mainTab === 'analisis_local' ? (
        <AnalisisLocalTab onTransformSucceeded={() => p.setMainTab('transform_etl')} />
      ) : null}
      {p.mainTab === 'transform_etl' ? <TransformEtlTab /> : null}
      {p.mainTab === 'kpi_tiempos' ? <KpiTiemposTab /> : null}
      {ETL_DEV_MODE && p.mainTab === 'kpi_comite' ? <KpiComiteTab /> : null}
      {p.mainTab === 'load_export' ? <LoadExportTab /> : null}

      {isDevEtlTab && !p.hideLegacyPeriodFilters ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-600">
              Ver por
              <select
                value={p.timeFilterMode}
                onChange={(e) => p.setTimeFilterMode(e.target.value as RealDataTimeFilterMode)}
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
              >
                <option value="month">Mes</option>
                <option value="week">Semana</option>
                <option value="day">Día</option>
              </select>
            </label>
            {p.timeFilterMode === 'month' ? (
              <label className="text-xs font-semibold text-slate-600">
                Mes
                <input
                  type="month"
                  value={p.timeFilterMonth}
                  onChange={(e) => p.setTimeFilterMonth(e.target.value)}
                  className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>
            ) : p.timeFilterMode === 'week' ? (
              <label className="text-xs font-semibold text-slate-600">
                Semana
                <input
                  type="week"
                  value={p.timeFilterWeek}
                  onChange={(e) => p.setTimeFilterWeek(e.target.value)}
                  className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>
            ) : (
              <label className="text-xs font-semibold text-slate-600">
                Día
                <input
                  type="date"
                  value={p.timeFilterDay}
                  onChange={(e) => p.setTimeFilterDay(e.target.value)}
                  className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>
            )}
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={p.timeFilterAllDay}
                onChange={(e) => p.setTimeFilterAllDay(e.target.checked)}
              />
              Todo el día
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Desde hora
              <input
                type="time"
                value={p.timeFilterStartTime}
                onChange={(e) => p.setTimeFilterStartTime(e.target.value)}
                disabled={p.timeFilterAllDay}
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Hasta hora
              <input
                type="time"
                value={p.timeFilterEndTime}
                onChange={(e) => p.setTimeFilterEndTime(e.target.value)}
                disabled={p.timeFilterAllDay}
                className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </label>
            <button
              type="button"
              onClick={() => void p.applyTimeFilter()}
              disabled={p.loading || p.alertsLoading}
              className="rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {p.loading || p.alertsLoading ? 'Filtrando…' : 'Filtrar'}
            </button>
            <div className="min-w-[220px] text-xs text-slate-500">
              Los listados de Eventos, Alertas y Circuitos preliminares se actualizan con este rango.
            </div>
          </div>
        </section>
      ) : null}

      {p.mainTab === 'dss_truckflow' && (
        <section className="rounded-3xl border border-dashed border-amber-200/90 bg-gradient-to-br from-amber-50/80 to-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">DSS vs Truckflow</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Placeholder para el comparador DSS (CSV manual) contra eventos y alertas de la API Truckflow. Aquí vivirán la
            normalización DSS, métricas de brecha y export <span className="font-mono text-xs">api_vs_dss</span>.
          </p>
          <p className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80">
            Aún no implementado — no afecta el resto del ETL. Usá pestañas Eventos / Export ETL mientras tanto.
          </p>
        </section>
      )}

      {p.mainTab === 'resumen' && (
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Resumen operativo (cruce + depuración)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Eventos + alertas + ventana útil + reglas ETL para exportar JSON de entrada a KPIs.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Nota: eventos (X) y alertas (Y) son canales independientes; en este resumen las alertas se consultan sin filtro horario para no perder volumen diagnóstico.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void p.loadSummaryAll()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Recargar eventos + alertas</button>
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs">
                <input type="checkbox" checked={p.useUsefulWindow} onChange={(e) => p.setUseUsefulWindow(e.target.checked)} />
                usar ventana útil automática
              </label>
              <button type="button" onClick={p.exportKpiJson} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900">Exportar JSON limpio para KPIs</button>
              <button type="button" onClick={p.exportSummaryKpiCsv} className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900">Exportar resumen CSV</button>
              <button type="button" onClick={p.exportClassificationAuditCsv} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">Exportar auditoría de clasificación CSV</button>
            </div>
            <div className="mt-4 text-xs text-slate-600">
              <div>
                Eventos operativos: {p.events.length.toLocaleString()} · Alertas alineadas (ETL):{' '}
                {p.committeeAlertsAlignedCount.toLocaleString()} · Alertas operativas base (post-traseras):{' '}
                {p.rearCameraFilterTrace.operationalAlerts.length.toLocaleString()}
              </div>
              <div>Ventana útil: {p.usefulWindow.windowValid ? `${formatDateTimeShort(p.usefulWindow.usefulWindowStart)} -> ${formatDateTimeShort(p.usefulWindow.usefulWindowEnd)}` : 'inválida (usa rango completo)'}</div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="font-semibold">Fuente de datos</div>
              <div>sourceMode: {p.dataSource === 'api' ? 'API real' : 'archivo local'} · startDate: {p.apiQuery.startDate || '—'} · endDate: {p.apiQuery.endDate || '—'}</div>
              <div>useUsefulWindow: {p.useUsefulWindow ? 'sí' : 'no'} · usefulWindowStart: {p.usefulWindow.usefulWindowStart || '—'} · usefulWindowEnd: {p.usefulWindow.usefulWindowEnd || '—'}</div>
              <div>rawEventCount: {p.eventsUnfiltered.length} · rawAlertCount: {p.rawAlerts.length} · lastLoadedAt: {p.lastLoadedAt ? formatDateTimeShort(p.lastLoadedAt) : '—'} · lastProcessedAt: {p.datasetProcessedAt ? formatDateTimeShort(p.datasetProcessedAt) : '—'}</div>
              <div>eventsInsideUsefulWindow: {p.usefulWindow.insideCount} · eventsOutsideUsefulWindow: {p.usefulWindow.outsideCount}</div>
              <button type="button" onClick={() => p.setMainTab('eventos')} className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">Ver fuente cruda</button>
            </div>
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
              <div className="font-semibold">Filtro de cámaras traseras provisorio</div>
              <div>Eventos excluidos: {p.rearCameraFilterTrace.excludedRearEvents.length} · Alertas traseras excluidas: {p.rearCameraFilterTrace.excludedRearAlerts.length} · Alertas route/start ingreso-preingreso excluidas: {p.rearCameraFilterTrace.excludedIngressRouteAlerts.length} · Recorridos sólo traseras: {p.rearCameraFilterTrace.excludedRearOnlyJourneyUids.length}</div>
              <div>Dataset operativo final: {p.events.length} eventos (tras segmentación ETL) · {p.committeeAlertsAlignedCount} alertas alineadas a recorridos · base traseras: {p.rearCameraFilterTrace.operationalAlerts.length}</div>
              <p className="mt-1">El filtro de cámaras traseras es provisorio y se aplica para evitar que lecturas de acoplados, semirremolques o vehículos no operativos ensucien la reconstrucción preliminar.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-teal-200 bg-gradient-to-br from-teal-50/90 to-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Datos útiles ETL</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Conteos del pipeline operativo (traseras + segmentación temporal + clasificación Ricardone). Las filas de revisión incluyen alertas y flags de journey largo.
                </p>
              </div>
              <button
                type="button"
                onClick={p.exportCommitteeDataset}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
              >
                Exportar dataset ETL
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <ExecutiveMetricCard label="Eventos crudos recibidos" value={p.committeeExecutiveSummary.rawEventCount} />
              <ExecutiveMetricCard accent="green" label="Eventos operativos usados" value={p.events.length} />
              <ExecutiveMetricCard accent="amber" label="Eventos excluidos por cámaras traseras" value={p.committeeExecutiveSummary.excludedRearEventCount} />
              <ExecutiveMetricCard label="Alertas crudas recibidas" value={p.committeeExecutiveSummary.rawAlertCount} />
              <ExecutiveMetricCard accent="green" label="Alertas operativas usadas (alineadas)" value={p.committeeAlertsAlignedCount} />
              <ExecutiveMetricCard label="Recorridos procesados" value={p.committeeExecutiveSummary.journeysProcessedCount} />
              <ExecutiveMetricCard accent="green" label="Circuitos incluidos (heurística ETL)" value={p.committeeExecutiveSummary.includedCircuitCount} />
              <ExecutiveMetricCard accent="amber" label="Registros en revisión (ETL fusionado)" value={p.committeeEtlTotals.review} />
              <ExecutiveMetricCard accent="rose" label="Registros descartados (ETL fusionado)" value={p.committeeEtlTotals.excluded} />
              <ExecutiveMetricCard label="Circuito de mayor volumen (incl.)" value={`${p.committeeExecutiveSummary.topCircuitCode}`} sub={`${p.committeeExecutiveSummary.topCircuitCount} recorridos`} />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <HorizontalBarChart title="Circuitos incluidos por tipo" items={p.committeeIncludedBarItems} />
              <HorizontalBarChart title="Registros en revisión por motivo (ETL)" items={p.committeeReviewBarItems} />
              <HorizontalBarChart title="Alertas LPR por cámara" items={p.committeeLprBarItems} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ExecutiveMetricCard label="Eventos crudos" value={p.eventsUnfiltered.length} />
            <ExecutiveMetricCard label="Alertas crudas" value={p.rawAlerts.length} />
            <ExecutiveMetricCard accent="amber" label="Eventos excluidos traseras" value={p.rearCameraFilterTrace.excludedRearEvents.length} />
            <ExecutiveMetricCard accent="amber" label="Alertas excluidas traseras" value={p.rearCameraFilterTrace.excludedRearAlerts.length} />
            <ExecutiveMetricCard accent="amber" label="Alertas route/start ingreso-preingreso excluidas" value={p.rearCameraFilterTrace.excludedIngressRouteAlerts.length} />
            <ExecutiveMetricCard accent="rose" label="Recorridos sólo traseras" value={p.rearCameraFilterTrace.excludedRearOnlyJourneyUids.length} />
            <ExecutiveMetricCard accent="green" label="Dataset operativo final" value={`${p.events.length} evt / ${p.committeeAlertsAlignedCount} alert alin.`} />
            <ExecutiveMetricCard label="Eventos dentro ventana" value={p.usefulWindow.insideCount} />
            <ExecutiveMetricCard label="Eventos fuera ventana" value={p.usefulWindow.outsideCount} />
            <ExecutiveMetricCard accent="green" label="Recorridos incluidos" value={p.summaryJourneys.filter((x) => x.etlStatus === 'included').length} />
            <ExecutiveMetricCard accent="amber" label="Recorridos revisión" value={p.summaryJourneys.filter((x) => x.etlStatus === 'review_required').length} />
            <ExecutiveMetricCard accent="rose" label="Recorridos descartados" value={p.summaryJourneys.filter((x) => x.etlStatus === 'excluded').length} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Calidad de captura LPR</h3>
            <p className="mt-1 text-sm text-slate-600">
              Las alertas LPR y los eventos físicos provienen de endpoints distintos. Esta métrica no representa porcentaje exacto de error, sino un índice relativo: cuántas alertas LPR se registraron cada 100 eventos físicos visibles.
            </p>
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              <div className="font-semibold">Fuente usada para Calidad LPR</div>
              <div>sourceMode: {p.lprSourceMeta.sourceMode} · startDate: {p.lprSourceMeta.startDate || '—'} · endDate: {p.lprSourceMeta.endDate || '—'}</div>
              <div>rawEventCount usado: {p.lprSourceMeta.rawEventCount} · rawAlertCount usado: {p.lprSourceMeta.rawAlertCount} · base: {p.lprSourceMeta.usingRawEvents ? 'eventos crudos completos' : 'eventos filtrados'}</div>
              <div>lastLoadedAt: {p.lprSourceMeta.lastLoadedAt ? formatDateTimeShort(p.lprSourceMeta.lastLoadedAt) : '—'}</div>
              {!p.lprSourceMeta.usingRawEvents ? <div className="mt-1 text-rose-700">Advertencia: esta métrica está usando eventos filtrados. Para Calidad LPR debe utilizarse la lista cruda completa de eventos.</div> : null}
            </div>
            {p.lprQualitySummary.hasOver100Index ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                Un valor mayor a 100 indica más alertas LPR que eventos físicos visibles; puede ocurrir si lecturas fallidas no se guardan como eventos en `/journey-event/list` o si una cámara genera múltiples alertas.
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={p.exportLprGeneralPng} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">Exportar gráfico general PNG</button>
              <button type="button" onClick={p.exportLprCameraChartPng} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">Exportar gráfico por cámara PNG</button>
              <button type="button" onClick={p.exportLprSummaryCsv} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold">Exportar resumen LPR CSV</button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <ExecutiveMetricCard label="Eventos físicos visibles" value={p.lprQualitySummary.eventsTotal} />
              <ExecutiveMetricCard label="Alertas generadas" value={p.lprQualitySummary.alertsTotal} />
              <ExecutiveMetricCard accent="rose" label="Alertas LPR" value={p.lprQualitySummary.lprCount} />
              <ExecutiveMetricCard accent="rose" label="Alertas LPR cada 100 eventos visibles" value={p.lprQualitySummary.lprIndexPer100Events === null ? 'sin base' : p.lprQualitySummary.lprIndexPer100Events.toFixed(2)} />
              <ExecutiveMetricCard accent="amber" label="Participación LPR sobre alertas" value={`${p.lprQualitySummary.lprPctAlerts.toFixed(2)}%`} />
              <ExecutiveMetricCard label="Recorridos inválidos" value={p.lprQualitySummary.invalidRoute} />
              <ExecutiveMetricCard label="Inicios inválidos" value={p.lprQualitySummary.invalidStart} />
            </div>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-900">Calidad general de lectura LPR</div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {p.lprGeneralBars.map((b) => {
                  const max = Math.max(1, ...p.lprGeneralBars.map((x) => x.value))
                  const pct = (b.value / max) * 100
                  return (
                    <div key={b.label} className="rounded border border-slate-200 bg-white p-2">
                      <div className="text-[11px] text-slate-600">{b.label}</div>
                      <div className="text-lg font-bold">{b.value}</div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div className="h-2 rounded" style={{ width: `${pct}%`, background: b.color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Índice LPR cada 100 eventos visibles: <span className="font-semibold">{p.lprQualitySummary.lprIndexPer100Events === null ? 'sin base' : p.lprQualitySummary.lprIndexPer100Events.toFixed(2)}</span> · Participación LPR sobre alertas: <span className="font-semibold">{p.lprQualitySummary.lprPctAlerts.toFixed(2)}%</span>
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Indicador LPR por cámara</div>
              <div className="mt-2 max-h-[260px] space-y-1 overflow-auto">
                {p.lprByCameraRows.map((r) => {
                  const val = r.lprIndexPer100VisibleEvents ?? 0
                  const width = Math.min(100, val)
                  const tone =
                    r.status === 'Bajo'
                      ? '#16a34a'
                      : r.status === 'Medio'
                        ? '#f59e0b'
                        : r.status === 'Alto'
                          ? '#ea580c'
                          : r.status === 'Crítico'
                            ? '#dc2626'
                            : '#6b7280'
                  return (
                    <button
                      key={`${r.deviceCode}-${r.sectorCode}-bar`}
                      type="button"
                      onClick={() => p.setLprCameraAudit({ deviceCode: r.deviceCode, sectorCode: r.sectorCode })}
                      className="w-full rounded border border-slate-100 p-2 text-left hover:bg-slate-50"
                      title={`device=${r.deviceCode} sector=${r.sectorCode} eventos=${r.eventsAssociated} lpr=${r.lprAlerts} índice=${r.lprIndexPer100VisibleEvents ?? 'sin base'} share=${r.lprShareOnCameraAlerts.toFixed(2)}% top=${r.mostFrequentInvalidRead}`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono">{r.deviceCode} · {r.sectorCode}</span>
                        <span>{r.lprIndexPer100VisibleEvents === null ? 'sin base' : `${r.lprIndexPer100VisibleEvents.toFixed(2)} /100`} · {r.status}</span>
                      </div>
                      <div className="mt-1 h-2 rounded bg-slate-100">
                        <div className="h-2 rounded" style={{ width: `${width}%`, background: tone }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-900">Calidad LPR por cámara</h4>
              <div className="mt-2 max-h-[28vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-[1300px] w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">deviceCode</th><th className="px-2 py-2 text-left">sectorCode</th><th className="px-2 py-2 text-right">eventos físicos visibles</th><th className="px-2 py-2 text-right">alertas LPR</th><th className="px-2 py-2 text-right">alertas LPR cada 100 eventos visibles</th><th className="px-2 py-2 text-right">participación LPR sobre alertas cámara</th><th className="px-2 py-2 text-left">estado</th><th className="px-2 py-2 text-left">lectura inválida más frecuente</th><th className="px-2 py-2 text-left">primer alerta</th><th className="px-2 py-2 text-left">última alerta</th><th className="px-2 py-2 text-left">acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lprByCameraRows.map((r) => (
                      <tr key={`${r.deviceCode}-${r.sectorCode}`} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-mono">{r.deviceCode}</td>
                        <td className="px-2 py-2 font-mono">{r.sectorCode}</td>
                        <td className="px-2 py-2 text-right">{r.eventsAssociated}</td>
                        <td className="px-2 py-2 text-right">{r.lprAlerts}</td>
                        <td className="px-2 py-2 text-right">{r.lprIndexPer100VisibleEvents === null ? (r.lprAlerts > 0 ? 'sin base de eventos visibles' : '—') : r.lprIndexPer100VisibleEvents.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right">{r.lprShareOnCameraAlerts.toFixed(2)}%</td>
                        <td className="px-2 py-2">{r.status}</td>
                        <td className="px-2 py-2">{r.mostFrequentInvalidRead}</td>
                        <td className="px-2 py-2">{r.firstAlert ? formatDateTimeShort(r.firstAlert) : '—'}</td>
                        <td className="px-2 py-2">{r.lastAlert ? formatDateTimeShort(r.lastAlert) : '—'}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <button type="button" className="rounded border px-2 py-1" onClick={() => p.setLprCameraAudit({ deviceCode: r.deviceCode, sectorCode: r.sectorCode })}>Ver eventos crudos</button>
                            <button type="button" className="rounded border px-2 py-1" onClick={() => p.setLprCameraAudit({ deviceCode: r.deviceCode, sectorCode: r.sectorCode })}>Ver alertas LPR</button>
                          </div>
                          {r.noVisibleEventBaseHint ? <div className="mt-1 text-[10px] text-amber-800">Hay alertas LPR pero no hay eventos físicos visibles para esta cámara en el rango consultado.</div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mt-5">
              <h4 className="text-sm font-bold text-slate-900">Lecturas LPR fallidas</h4>
              <div className="mt-2 max-h-[28vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-[1300px] w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">createdAt</th><th className="px-2 py-2 text-left">deviceCode</th><th className="px-2 py-2 text-left">sectorCode</th><th className="px-2 py-2 text-left">description</th><th className="px-2 py-2 text-left">payload.plate</th><th className="px-2 py-2 text-left">payload.normalizedPlate</th><th className="px-2 py-2 text-left">alertCode</th><th className="px-2 py-2 text-right">severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.lprFailedReadRows.slice(0, 1500).map((r, i) => (
                      <tr key={`${r.createdAt}-${r.deviceCode}-${i}`} className="border-t border-slate-100">
                        <td className="px-2 py-2">{r.createdAt ? formatDateTimeShort(r.createdAt) : '—'}</td>
                        <td className="px-2 py-2 font-mono">{r.deviceCode}</td>
                        <td className="px-2 py-2 font-mono">{r.sectorCode}</td>
                        <td className="px-2 py-2">{r.description}</td>
                        <td className="px-2 py-2 font-mono">{r.payloadPlate}</td>
                        <td className="px-2 py-2 font-mono">{r.payloadNormalizedPlate}</td>
                        <td className="px-2 py-2 font-mono">{r.alertCode}</td>
                        <td className="px-2 py-2 text-right">{r.severity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DiagDrawer
            open={Boolean(p.lprCameraAudit)}
            title="Auditoría LPR por cámara"
            subtitle={p.lprCameraAudit ? `${p.lprCameraAudit.deviceCode} / ${p.lprCameraAudit.sectorCode}` : ''}
            onClose={() => p.setLprCameraAudit(null)}
          >
            {p.lprCameraAuditData ? (
              <div className="space-y-3 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                  <div>Rango horario: {p.lprCameraAuditData.rangeStart || '—'} → {p.lprCameraAuditData.rangeEnd || '—'}</div>
                  <div>Cantidad eventos crudos: {p.lprCameraAuditData.eventCount} · Cantidad alertas LPR: {p.lprCameraAuditData.alertCount}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <ExecutiveMetricCard label="Eventos físicos visibles" value={p.lprCameraAuditData.eventCount} />
                  <ExecutiveMetricCard label="Alertas LPR" value={p.lprCameraAuditData.alertCount} />
                  <ExecutiveMetricCard
                    label="Alertas LPR cada 100 eventos visibles"
                    value={
                      p.lprCameraAuditData.eventCount > 0
                        ? ((p.lprCameraAuditData.alertCount / p.lprCameraAuditData.eventCount) * 100).toFixed(2)
                        : 'sin base'
                    }
                  />
                </div>
                <div className="rounded-xl border border-slate-200 p-2">
                  <div className="mb-1 font-semibold">Evolución por hora (eventos vs alertas LPR)</div>
                  <div className="max-h-40 overflow-auto">
                    {p.lprCameraAuditData.hourlySeries.map((h) => {
                      const max = Math.max(1, h.events, h.lprAlerts)
                      return (
                        <div key={h.hour} className="mb-1">
                          <div className="text-[10px] text-slate-600">{h.hour}</div>
                          <div className="flex items-center gap-2">
                            <div className="w-16 text-[10px]">Eventos {h.events}</div>
                            <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-slate-500" style={{ width: `${(h.events / max) * 100}%` }} /></div>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <div className="w-16 text-[10px]">LPR {h.lprAlerts}</div>
                            <div className="h-2 flex-1 rounded bg-slate-100"><div className="h-2 rounded bg-rose-500" style={{ width: `${(h.lprAlerts / max) * 100}%` }} /></div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded border px-2 py-1" onClick={p.exportLprCameraCsv}>Exportar CSV de esta cámara</button>
                </div>
                <div>
                  <div className="mb-1 font-semibold">Eventos crudos de esta cámara</div>
                  <div className="max-h-40 overflow-auto rounded border border-slate-200">
                    <table className="min-w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">occurredAt</th><th className="px-2 py-1 text-left">journeyUid</th><th className="px-2 py-1 text-left">truckPlate</th><th className="px-2 py-1 text-right">seq</th></tr></thead>
                      <tbody>
                        {p.lprCameraAuditData.eventsForCamera.map((e) => (
                          <tr key={`${e.id}-${e.sequenceNumber}`} className="border-t border-slate-100">
                            <td className="px-2 py-1">{formatDateTimeShort(e.occurredAt)}</td>
                            <td className="px-2 py-1 font-mono">{e.journeyUid}</td>
                            <td className="px-2 py-1 font-mono">{e.truckPlate}</td>
                            <td className="px-2 py-1 text-right">{e.sequenceNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-semibold">Alertas LPR de esta cámara</div>
                  <div className="max-h-40 overflow-auto rounded border border-slate-200">
                    <table className="min-w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-left">createdAt</th><th className="px-2 py-1 text-left">description</th><th className="px-2 py-1 text-left">payload.plate</th><th className="px-2 py-1 text-left">payload.normalizedPlate</th></tr></thead>
                      <tbody>
                        {p.lprCameraAuditData.alertsForCamera.map((a, i) => (
                          <tr key={`${a.createdAt}-${i}`} className="border-t border-slate-100">
                            <td className="px-2 py-1">{a.createdAt ? formatDateTimeShort(a.createdAt) : '—'}</td>
                            <td className="px-2 py-1">{a.description}</td>
                            <td className="px-2 py-1 font-mono">{a.payloadPlate}</td>
                            <td className="px-2 py-1 font-mono">{a.payloadNormalizedPlate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </DiagDrawer>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                ['all', 'Todos'],
                ['included', 'Incluidos'],
                ['review_required', 'Revisión'],
                ['excluded', 'Descartados'],
                ['with_alert', 'Con alerta'],
                ['without_alert', 'Sin alerta'],
                ['lpr_malfunction', 'LPR_MALFUNCTION'],
                ['invalid_route', 'INVALID_ROUTE'],
                ['invalid_start', 'INVALID_START_JOURNEY'],
                ['outside_window', 'Fuera ventana útil'],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => p.setSummaryFilter(id as any)} className={`rounded-full px-3 py-1 text-[11px] font-semibold ${p.summaryFilter === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="max-h-[46vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-[1500px] w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">etlStatus</th><th className="px-2 py-2 text-left">motivo</th><th className="px-2 py-2 text-left">journeyUid</th><th className="px-2 py-2 text-left">patente</th><th className="px-2 py-2 text-left">inicio</th><th className="px-2 py-2 text-left">fin</th><th className="px-2 py-2 text-right">duración</th><th className="px-2 py-2 text-left">circuito prelim.</th><th className="px-2 py-2 text-left">circuito comité</th><th className="px-2 py-2 text-left">alertCodes</th><th className="px-2 py-2 text-left">alertas cercanas</th><th className="px-2 py-2 text-left">sugerencia</th><th className="px-2 py-2 text-left">secuencia lógica</th><th className="px-2 py-2 text-left">secuencia real</th><th className="px-2 py-2 text-center">ventana útil</th><th className="px-2 py-2 text-left">acción</th>
                  </tr>
                </thead>
                <tbody>
                  {p.summaryJourneys.map((row) => (
                    <tr key={row.journeyUid} className="border-t border-slate-100">
                      <td className="px-2 py-2">{row.etlStatus}</td>
                      <td className="px-2 py-2">{row.reason}</td>
                      <td className="px-2 py-2 font-mono">{row.journeyUid}</td>
                      <td className="px-2 py-2 font-mono">{row.plate}</td>
                      <td className="px-2 py-2">{formatDateTimeShort(row.startedAt)}</td>
                      <td className="px-2 py-2">{formatDateTimeShort(row.endedAt)}</td>
                      <td className="px-2 py-2 text-right">{row.durationMinutes} min</td>
                      <td className="px-2 py-2 font-mono">{row.preliminaryCircuitCode}</td>
                      <td className="max-w-[160px] truncate px-2 py-2 font-mono text-[10px]" title={row.committeeOperationalCircuit ?? ''}>
                        {row.committeeOperationalCircuit || '—'}
                      </td>
                      <td className="px-2 py-2 font-mono">{row.alertCodes.join('|') || '—'}</td>
                      <td className="px-2 py-2">{row.hasNearbyRelevantAlerts ? row.nearbyAlertCodes.join('|') || 'sí' : 'no'}</td>
                      <td className="px-2 py-2">{row.reconstructionSuggestion || '—'}</td>
                      <td className="px-2 py-2 font-mono">{row.logicalSequence.join(' > ')}</td>
                      <td className="px-2 py-2 font-mono">{row.rawSequence.join(' > ')}</td>
                      <td className="px-2 py-2 text-center">{row.inUsefulWindow ? 'dentro' : 'fuera'}</td>
                      <td className="px-2 py-2"><button type="button" onClick={() => p.setNearbyDrawerJourneyUid(row.journeyUid)} className="rounded border px-2 py-1">Buscar alertas cercanas</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'eventos' && (
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-xl">
                <h2 className="text-lg font-bold text-slate-900">Eventos crudos · Truckflow</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Consulta directa de <code>/journey-event/list</code>. Alcance actual: sólo Ricardone (sectores{' '}
                  <span className="font-mono text-[11px]">RICARDONE_*</span>
                  ); Puerto San Lorenzo y cámaras fuera de esos sectores no se cargan para esta etapa. En la vista comité se excluye además{' '}
                  <span className="font-mono text-[11px]">LPR_MALFUNCTION</span>.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-slate-100 bg-slate-50/90 p-1">
                <button
                  type="button"
                  onClick={() => setEventosViewMode('presentacion')}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${eventosViewMode === 'presentacion' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Presentación comité
                </button>
                <button
                  type="button"
                  onClick={() => setEventosViewMode('consulta')}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${eventosViewMode === 'consulta' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Consulta técnica
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-slate-600">Desde
                <input type="date" value={p.apiQuery.startDate ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, startDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Hasta
                <input type="date" value={p.apiQuery.endDate ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, endDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Patente
                <input value={p.apiQuery.plate ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, plate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Device
                <input value={p.apiQuery.device ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, device: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Sector
                <input value={p.apiQuery.sector ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, sector: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Site
                <input value={p.apiQuery.site ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, site: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Journey UUID
                <input value={p.apiQuery.journeyUuid ?? ''} onChange={(e) => p.setApiQuery({ ...p.apiQuery, journeyUuid: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void p.loadEtlEvents()} disabled={p.etlLoadingEvents} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Cargar eventos</button>
              <button type="button" onClick={p.exportRawEventsJson} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900">Exportar eventos crudos JSON</button>
              <button type="button" onClick={p.exportRawEventsCsv} className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900">Exportar eventos crudos CSV</button>
            </div>
            {p.etlError ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{p.etlError}</div> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ExecutiveMetricCard label="Eventos crudos recibidos" value={p.eventsUnfiltered.length} />
            <ExecutiveMetricCard accent="amber" label="Excluidos por cámara trasera" value={p.rearCameraFilterTrace.excludedRearEvents.length} />
            <ExecutiveMetricCard accent="green" label="Eventos operativos usados" value={p.events.length} />
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
            Filtro provisorio activo: se excluyen cámaras traseras/sensibles del análisis principal.
            <label className="ml-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={p.showExcludedRearEvents}
                onChange={(e) => p.setShowExcludedRearEvents(e.target.checked)}
              />
              Ver excluidos por cámara trasera
            </label>
          </div>

          {eventosViewMode === 'presentacion' ? (
            <EventosTruckflowPresentation eventsFromApi={p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events} apiQuery={p.apiQuery} loading={p.etlLoadingEvents} />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">Tabla y desglose · Ricardone</h3>
              <p className="mt-1 text-xs text-slate-500">
                Misma base que la presentación comité: sólo lecturas asociadas a sectores Ricardone (`sectorCode` con prefijo RICARDONE_).
                Puerto San Lorenzo y otros sitios fuera del prefijo Ricardone quedan excluidos al cargar.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <ExecutiveMetricCard label={p.showExcludedRearEvents ? 'Eventos excluidos (vista técnica)' : 'Total eventos operativos'} value={(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).length} />
                <ExecutiveMetricCard label="Primer evento" value={(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).length ? formatDateTimeShort([...(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events)].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())[0].occurredAt) : '—'} />
                <ExecutiveMetricCard label="Último evento" value={(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).length ? formatDateTimeShort([...(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events)].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0].occurredAt) : '—'} />
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="text-xs font-semibold text-slate-700">Eventos por sector</div>
                  <div className="mt-2 max-h-36 overflow-auto text-xs">
                    {[...new Map((p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).map((e) => [e.sectorCode, 0])).keys()].slice(0, 20).map((sector) => (
                      <div key={sector} className="flex justify-between border-b border-slate-100 py-1"><span className="font-mono">{sector}</span><span>{(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).filter((e) => e.sectorCode === sector).length}</span></div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="text-xs font-semibold text-slate-700">Eventos por device</div>
                  <div className="mt-2 max-h-36 overflow-auto text-xs">
                    {[...new Map((p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).map((e) => [e.deviceCode, 0])).keys()].slice(0, 20).map((device) => (
                      <div key={device} className="flex justify-between border-b border-slate-100 py-1"><span className="font-mono">{device}</span><span>{(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).filter((e) => e.deviceCode === device).length}</span></div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 max-h-[45vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-[1450px] w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-2 text-left">id</th><th className="px-2 py-2 text-left">occurredAt</th><th className="px-2 py-2 text-left">createdAt</th><th className="px-2 py-2 text-left">journeyUid</th><th className="px-2 py-2 text-right">sequenceNumber</th><th className="px-2 py-2 text-left">truckPlate</th><th className="px-2 py-2 text-left">sectorCode</th><th className="px-2 py-2 text-left">deviceCode</th><th className="px-2 py-2 text-left">eventType</th><th className="px-2 py-2 text-right">alertLevel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.showExcludedRearEvents ? p.rearCameraFilterTrace.excludedRearEvents : p.events).slice(0, 1200).map((e) => (
                      <tr key={`${e.id}-${e.sequenceNumber}`} className="border-t border-slate-100">
                        <td className="px-2 py-2">{e.id}</td>
                        <td className="px-2 py-2">{formatDateTimeShort(e.occurredAt)}</td>
                        <td className="px-2 py-2">{formatDateTimeShort(e.createdAt ?? e.recordedAt)}</td>
                        <td className="px-2 py-2 font-mono">{e.journeyUid}</td>
                        <td className="px-2 py-2 text-right">{e.sequenceNumber}</td>
                        <td className="px-2 py-2 font-mono">{e.truckPlate}</td>
                        <td className="px-2 py-2 font-mono">{e.sectorCode}</td>
                        <td className="px-2 py-2 font-mono">{e.deviceCode}</td>
                        <td className="px-2 py-2">{e.eventType}</td>
                        <td className="px-2 py-2 text-right">{e.alertLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {p.mainTab === 'alertas' && (
        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Consulta de alertas</h2>
            <p className="mt-1 text-sm text-slate-600">Inspección directa de <code>/alert/list</code> independiente del ETL.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-xs text-slate-600">Desde
                <input type="datetime-local" value={(p.alertsQuery.startDate ?? '').slice(0, 16)} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, startDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Hasta
                <input type="datetime-local" value={(p.alertsQuery.endDate ?? '').slice(0, 16)} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, endDate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Patente
                <input value={p.alertsQuery.plate ?? ''} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, plate: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Device
                <input value={p.alertsQuery.device ?? ''} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, device: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Sector
                <input value={p.alertsQuery.sector ?? ''} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, sector: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Site
                <input value={p.alertsQuery.site ?? ''} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, site: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-600">Journey UUID
                <input value={p.alertsQuery.journeyUuid ?? ''} onChange={(e) => p.setAlertsQuery({ ...p.alertsQuery, journeyUuid: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void p.loadAlertsStandalone()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Cargar alertas</button>
              <button type="button" onClick={p.clearAlertsFilters} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">Limpiar filtros</button>
              <button type="button" onClick={p.exportAlertsCsv} disabled={!p.normalizedAlertsStandalone.length} className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 disabled:opacity-50">Exportar alertas CSV</button>
              <button type="button" onClick={p.exportAlertsJson} disabled={!p.normalizedAlertsStandalone.length} className="rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-900 disabled:opacity-50">Exportar alertas JSON</button>
              <button type="button" onClick={() => p.setRawAlerts(p.normalizedAlertsStandalone.map((a) => a.raw))} disabled={!p.normalizedAlertsStandalone.length} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50">Usar estas alertas en ETL</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <button type="button" onClick={() => p.applyAlertsHourPreset(1)} className="rounded-full border px-3 py-1">Última 1 hora</button>
              <button type="button" onClick={() => p.applyAlertsHourPreset(2)} className="rounded-full border px-3 py-1">Últimas 2 horas</button>
              <button type="button" onClick={() => p.applyAlertsHourPreset(3)} className="rounded-full border px-3 py-1">Últimas 3 horas</button>
              <button type="button" onClick={() => p.applyAlertsHourPreset(1, true)} className="rounded-full border px-3 py-1">±1h alrededor de journey</button>
              <button type="button" onClick={() => p.applyAlertsHourPreset(2, true)} className="rounded-full border px-3 py-1">±2h alrededor de journey</button>
              <button type="button" onClick={() => p.applyAlertsHourPreset(3, true)} className="rounded-full border px-3 py-1">±3h alrededor de journey</button>
            </div>
            <div className="mt-3 text-xs text-slate-600">
              <div>Estado: {p.alertsLoading ? 'Cargando alertas...' : 'En espera'}</div>
              <div>URL consultada: {p.alertsLastQueryUrl || '—'}</div>
              <div>Última consulta: {p.alertsLastQueriedAt ? formatDateTimeShort(p.alertsLastQueriedAt) : '—'}</div>
              <div>Total alertas operativas: {p.normalizedAlertsStandalone.length.toLocaleString()}</div>
              {p.alertsError ? <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">{p.alertsError}</div> : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <ExecutiveMetricCard label="Alertas crudas recibidas" value={p.standaloneRearAlertFilterTrace.rawAlerts.length} />
            <ExecutiveMetricCard accent="amber" label="Alertas excluidas por cámara trasera" value={p.standaloneRearAlertFilterTrace.excludedRearAlerts.length} />
            <ExecutiveMetricCard accent="amber" label="Alertas route/start ingreso-preingreso excluidas" value={p.standaloneRearAlertFilterTrace.excludedIngressRouteAlerts.length} />
            <ExecutiveMetricCard accent="green" label="Alertas operativas usadas" value={p.normalizedAlertsStandalone.length} />
          </div>
          <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
            Filtro provisorio activo: la tabla principal muestra alertas operativas filtradas. También se excluyen INVALID_ROUTE / INVALID_START_JOURNEY de cámaras o sectores Ingreso/Preingreso.
            <label className="ml-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={p.showExcludedRearAlerts}
                onChange={(e) => p.setShowExcludedRearAlerts(e.target.checked)}
              />
              Ver alertas excluidas
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ExecutiveMetricCard label="Total alertas" value={p.alertsSummary.total} />
            <ExecutiveMetricCard label="Patente válida" value={p.alertsSummary.validPlate} />
            <ExecutiveMetricCard label="Patente inválida / OCR" value={p.alertsSummary.invalidPlate} />
            <ExecutiveMetricCard label="Con journeyUuid" value={p.alertsSummary.withJourney} />
            <ExecutiveMetricCard label="Sin journeyUuid" value={p.alertsSummary.withoutJourney} />
            <ExecutiveMetricCard label="Recorrido inválido (inferido)" value={p.alertsSummary.invalidRoute} />
            <ExecutiveMetricCard label="Sector / cámara (inferido)" value={p.alertsSummary.sectorDevice} />
            <ExecutiveMetricCard label="Nivel más frecuente" value={p.alertsSummary.mostFrequentLevel} />
            <ExecutiveMetricCard label="Tipo/motivo más frecuente" value={p.alertsSummary.mostFrequentType} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Alertas recibidas</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {ALERTS_QUICK_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => p.setAlertsQuickFilter(option.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${p.alertsQuickFilter === option.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="mt-4 max-h-[42vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-[1700px] w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">id</th>
                    <th className="px-2 py-2 text-left">createdAt</th>
                    <th className="px-2 py-2 text-left">alertCode</th>
                    <th className="px-2 py-2 text-right">severity</th>
                    <th className="px-2 py-2 text-left">status</th>
                    <th className="px-2 py-2 text-left">Patente</th>
                    <th className="px-2 py-2 text-center">Válida</th>
                    <th className="px-2 py-2 text-left">JourneyUuid</th>
                    <th className="px-2 py-2 text-left">Sector</th>
                    <th className="px-2 py-2 text-left">Device</th>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-left">Payload parseado</th>
                    <th className="px-2 py-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {p.filteredAlertsStandalone.slice(0, 600).map((a) => (
                    <tr key={a.alertId} className="border-t border-slate-100">
                      <td className="px-2 py-2">{String((a.raw as any).id ?? a.alertId)}</td>
                      <td className="px-2 py-2">{formatDateTimeShort(String((a.raw as any).createdAt ?? a.occurredAt))}</td>
                      <td className="px-2 py-2 font-mono">{a.alertCode || 'sin dato'}</td>
                      <td className="px-2 py-2 text-right">{String((a.raw as any).severity ?? a.alertLevel)}</td>
                      <td className="px-2 py-2">{String((a.raw as any).status ?? 'sin dato')}</td>
                      <td className="px-2 py-2 font-mono">{a.normalizedPlate || a.rawPlate || 'sin dato'}</td>
                      <td className="px-2 py-2 text-center">{a.normalizedPlate ? (a.isValidPlate ? 'Sí' : 'No') : '—'}</td>
                      <td className="px-2 py-2 font-mono">{a.journeyUid || 'sin dato'}</td>
                      <td className="px-2 py-2 font-mono">{a.sectorCode || 'sin dato'}</td>
                      <td className="px-2 py-2 font-mono">{a.deviceCode || 'sin dato'}</td>
                      <td className="max-w-[320px] truncate px-2 py-2" title={a.description || a.reason || a.message}>
                        {a.description || a.reason || a.message || 'sin dato'}
                      </td>
                      <td className="max-w-[360px] truncate px-2 py-2 font-mono" title={JSON.stringify(a.payload)}>
                        {Object.keys(a.payload).length ? JSON.stringify(a.payload) : 'sin payload'}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" onClick={() => p.setSelectedAlert(a)} className="rounded border px-2 py-1">Ver JSON</button>
                          <button type="button" disabled={!a.journeyUid} onClick={() => { p.setSelectedAlert(a); void p.loadJourneyEventsForAlert(a.journeyUid) }} className="rounded border px-2 py-1 disabled:opacity-40">Ver eventos journey</button>
                          <button type="button" disabled={!a.normalizedPlate} onClick={() => p.setAlertsQuery({ ...p.alertsQuery, plate: a.normalizedPlate })} className="rounded border px-2 py-1 disabled:opacity-40">Filtrar patente</button>
                          <button type="button" disabled={!a.sectorCode} onClick={() => p.setAlertsQuery({ ...p.alertsQuery, sector: a.sectorCode })} className="rounded border px-2 py-1 disabled:opacity-40">Filtrar sector</button>
                          <button type="button" disabled={!a.deviceCode} onClick={() => p.setAlertsQuery({ ...p.alertsQuery, device: a.deviceCode })} className="rounded border px-2 py-1 disabled:opacity-40">Filtrar device</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="font-bold text-slate-900">Alertas por tipo/motivo</h4>
              <div className="mt-3 max-h-72 overflow-auto">
                {p.alertsSummary.byType.map((r) => (
                  <div key={r.group} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                    <span className="max-w-[70%] truncate">{r.group}</span>
                    <span>{r.count} · {(r.pct * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="font-bold text-slate-900">Alertas por sector</h4>
              <div className="mt-3 max-h-72 overflow-auto">
                {p.alertsSummary.bySector.map((r) => (
                  <div key={r.group} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                    <span className="font-mono">{r.group}</span>
                    <span>{r.count} · {(r.pct * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="font-bold text-slate-900">Alertas por device/cámara</h4>
              <div className="mt-3 max-h-72 overflow-auto">
                {p.alertsSummary.byDevice.map((r) => (
                  <div key={r.group} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                    <span className="font-mono">{r.group}</span>
                    <span>{r.count} · {(r.pct * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <h4 className="font-bold text-slate-900">Alertas por patente</h4>
              <div className="mt-3 max-h-72 overflow-auto">
                {p.alertsSummary.byPlate.map((r) => (
                  <div key={r.group} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                    <span className="font-mono">{r.group}</span>
                    <span>{r.count} · {(r.pct * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="font-bold text-slate-900">Alertas por journeyUuid</h4>
            <div className="mt-3 max-h-72 overflow-auto">
              {p.alertsSummary.byJourney.map((r) => (
                <div key={r.group} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs">
                  <span className="font-mono">{r.group}</span>
                  <span>{r.count} · {(r.pct * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'etl_export' &&
        (p.renderEtlExportTab ? (
          p.renderEtlExportTab()
        ) : (
        <section className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ExecutiveMetricCard label="Eventos recibidos (Ricardone)" value={p.events.length.toLocaleString()} />
            <ExecutiveMetricCard
              accent="green"
              label="Patentes válidas (eventos)"
              value={p.plateQualitySummary.validPlateEvents.toLocaleString()}
              sub={`${(p.plateQualitySummary.validPlateEventRatio * 100).toFixed(1)}% del volumen`}
            />
            <ExecutiveMetricCard
              accent="rose"
              label="Patentes inválidas / OCR"
              value={p.plateQualitySummary.invalidPlateEvents.toLocaleString()}
              sub={`${(p.plateQualitySummary.invalidPlateEventRatio * 100).toFixed(1)}%`}
            />
            <ExecutiveMetricCard label="Recorridos reconstruidos" value={p.journeys.length.toLocaleString()} />
            <ExecutiveMetricCard
              accent="green"
              label="Recorridos operativos útiles"
              value={p.depurationSnapshot.general.operationalUsefulJourneyCount.toLocaleString()}
            />
            <ExecutiveMetricCard
              accent="rose"
              label="Recorridos descartados (ruido/clasificación)"
              value={(p.depurationSnapshot.general.totalDiscardedJourneyCount - p.depurationSnapshot.general.invalidPlateOnlyJourneyCount).toLocaleString()}
              sub="Excluye journeyUid sólo OCR inválido (ver depuración)"
            />
            <ExecutiveMetricCard
              label="% utilizable sobre crudos"
              value={`${(p.depurationSnapshot.general.pctOperationalUsefulVsRaw * 100).toFixed(1)}%`}
              accent="green"
            />
            <ExecutiveMetricCard
              label="% descartado sobre crudos"
              value={`${(p.depurationSnapshot.general.pctDiscardedVsRaw * 100).toFixed(1)}%`}
              accent="rose"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Distribución de datos procesados</h2>
              <p className="mt-1 text-sm text-slate-600">Journey reconstruido = unidad fuente tras patente válida (vista período/día).</p>
              <div className="mt-8 flex justify-center">
                <DataDistributionDonut
                  centerLabel="Recorridos"
                  slices={[
                    { label: 'Datos útiles (KPI prelim)', count: p.donutJourneys.usefulKpi, colorVar: '--c0' },
                    { label: 'Descartados operativamente', count: p.donutJourneys.discarded, colorVar: '--c1' },
                    { label: 'Registro incompleto', count: p.donutJourneys.incompleteReal, colorVar: '--c2' },
                    { label: 'Solo diagnóstico (otros)', count: p.donutJourneys.diagOnly, colorVar: '--c3' },
                  ]}
                />
              </div>
            </div>
            <div className="rounded-3xl border border-blue-950/35 bg-gradient-to-b from-[#162456] via-[#1a2f6e] to-[#0f1a42] p-7 text-blue-50 shadow-lg">
              <div className="flex items-start gap-2">
                <span className="text-xl" aria-hidden>
                  ●
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white">Qué podemos calcular</h2>
                  <p className="mt-2 text-sm text-blue-100/95">Interpretación ejecutiva sobre la ingestión observable en Ricardone.</p>
                </div>
              </div>
              <div className="mt-8 space-y-8 text-sm">
                <div>
                  <div className="flex items-center gap-2 font-bold text-emerald-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-emerald-500/80 ring-2 ring-emerald-200/60" /> CONFIABLE
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/98">
                    <li>● Ingresos y egresos Ricardone con secuencias captadas</li>
                    <li>● Flujo mínimo ingreso / egreso cuando las cámaras lo muestran</li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-amber-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-amber-500/80 ring-2 ring-amber-200/60" /> PRELIMINAR
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/92">
                    <li>● Tiempos aproximados ingreso‑egreso (recorridos parciales o saltos entre cámaras)</li>
                    <li>● Recorridos mínimos y circuitos agrupados en esta página</li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2 font-bold text-rose-200">
                    <span aria-hidden className="h-5 w-5 rounded-full bg-rose-600/85 ring-2 ring-rose-300/55" /> NO DISPONIBLE
                  </div>
                  <ul className="mt-3 list-none space-y-2 pl-1 text-blue-50/92">
                    <li>● Circuitos oficiales planta vs matriz R/SL aquí declarados fuera del alcance de esta ingestión.</li>
                    <li>● Anomalías y variaciones oficiales KPI finales hasta validar modelo de datos.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50/90 via-white to-white p-8 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Export ETL para Power BI</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Export mínimo para comité:{' '}
                <span className="font-semibold text-slate-800">{POWER_BI_COMMITTEE_FILE_COUNT} archivos CSV</span> sin ZIP (schema v
                {POWER_BI_ETL_SCHEMA_VERSION}). Usá{' '}
                <span className="font-semibold text-slate-800">un botón por archivo</span>: así cada descarga va con su propio clic y el navegador no suele bloquear.
                Por cada pulsación se vuelve a armar todo el bundle en memoria y se guarda solo ese CSV — con rangos grandes puede tardar unos segundos en cada clic.{' '}
                El modo debug sigue disponible como <span className="font-medium">un ZIP aparte</span>.
                Primero pulsá <span className="font-semibold text-slate-800">Cargar datos del período</span>.
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Archivos en export comité (CSV sueltos, sin ZIP)
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-500">
                {Object.values(POWER_BI_COMMITTEE_FILENAMES).join(' · ')}
              </p>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Incluye debug completo ({POWER_BI_ETL_DEBUG_FILE_COUNT} CSV; raw, legacy, OCR, debug…)
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-slate-400">
                {Object.values(POWER_BI_ETL_FILENAMES).join(' · ')}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seleccionar período</div>
              <p className="mt-1 text-xs text-slate-500">
                Consultas paralelas a <code className="rounded bg-slate-50 px-1">/journey-event/list</code> y{' '}
                <code className="rounded bg-slate-50 px-1">/alert/list</code> con parámetros{' '}
                <span className="font-mono">startDate</span> y <span className="font-mono">endDate</span> en formato{' '}
                <span className="font-mono">YYYY-MM-DDTHH:mm:ss</span> (hora local).
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-xs font-semibold text-slate-600">
                  Fecha inicial
                  <input
                    type="date"
                    value={p.powerBiExportStartDate}
                    onChange={(e) => p.setPowerBiExportStartDate(e.target.value)}
                    className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Hora inicial
                  <input
                    type="time"
                    value={p.powerBiExportStartTime}
                    onChange={(e) => p.setPowerBiExportStartTime(e.target.value)}
                    className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Fecha final
                  <input
                    type="date"
                    value={p.powerBiExportEndDate}
                    onChange={(e) => p.setPowerBiExportEndDate(e.target.value)}
                    className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Hora final
                  <input
                    type="time"
                    value={p.powerBiExportEndTime}
                    onChange={(e) => p.setPowerBiExportEndTime(e.target.value)}
                    className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void p.loadPowerBiExportPeriod()}
                  disabled={p.powerBiExportLoading}
                  className="rounded-xl bg-slate-950 px-6 py-2.5 text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {p.powerBiExportLoading ? 'Cargando…' : 'Cargar datos del período'}
                </button>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Descargá cada CSV aparte (<span className="font-bold text-amber-800">recomendado</span>)
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Cada clic baja solo un archivo con nombre fijo (<span className="font-mono">clean_circuits_v2.csv</span>, etc.). Si la pestaña tarda,
                  esperá a que termine antes del siguiente clic.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COMMITTEE_SINGLE_CSV_ROWS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      title={
                        !p.powerBiExportLoadedSummary
                          ? 'Primero cargá el período.'
                          : `Generar y guardar ${POWER_BI_COMMITTEE_FILENAMES[key]}`
                      }
                      disabled={!p.powerBiExportLoadedSummary || p.powerBiExportLoading}
                      onClick={() => p.exportPowerBiCommitteeSingleCsv(key)}
                      className="inline-flex flex-col rounded-xl border border-amber-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-amber-500 hover:bg-amber-50 disabled:opacity-40"
                    >
                      <span className="text-xs font-black uppercase tracking-wide text-amber-950">{label}</span>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-600">{POWER_BI_COMMITTEE_FILENAMES[key]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  title={
                    !p.powerBiExportLoadedSummary
                      ? 'Primero cargá el período. Incluye raw, legacy clean, OCR, score debug y el resto de CSV de auditoría.'
                      : undefined
                  }
                  onClick={() => p.exportPowerBiDebugZip()}
                  disabled={!p.powerBiExportLoadedSummary || p.powerBiExportLoading}
                  className="rounded-xl border border-indigo-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-indigo-900 shadow-sm hover:bg-indigo-50 disabled:opacity-50"
                >
                  Debug completo ({POWER_BI_ETL_DEBUG_FILE_COUNT})
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Si modificás fecha u hora, tenés que volver a cargar antes de exportar.
              </p>
            </div>

            {p.powerBiPeriodValidationError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{p.powerBiPeriodValidationError}</div>
            ) : null}
            {p.powerBiExportLoadError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{p.powerBiExportLoadError}</div>
            ) : null}
            {p.powerBiExportBundleError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                Fallo al generar o descargar el export Power BI / ETL: {p.powerBiExportBundleError}
              </div>
            ) : null}

            {p.powerBiExportLoadedSummary?.zeroEventsNotice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Aviso: la API devolvió <strong>0 eventos</strong> Ricardone en este rango (tras el filtro de sitio). Los CSV pueden salir vacíos en capas de eventos.
              </div>
            ) : null}
            {p.powerBiExportLoadedSummary?.zeroAlertsNotice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Aviso: la API devolvió <strong>0 alertas</strong> en este rango. Revisá la ventana o el servidor de alertas.
              </div>
            ) : null}

            {p.powerBiExportLoadedSummary ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wide text-emerald-950">Período cargado</h3>
                <p className="mt-1 text-xs text-emerald-900/80">
                  Listo: usá los cinco botones de descarga ({POWER_BI_COMMITTEE_FILE_COUNT} CSV). El modo debug sigue compactando todo en un ZIP (
                  <span className="font-mono">raw_*</span>, legacy, <span className="font-mono">etl_summary</span>, OCR, score…).
                </p>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Desde</dt>
                    <dd className="mt-1 font-mono text-sm text-emerald-950">{p.powerBiExportLoadedSummary.queryStart}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Hasta</dt>
                    <dd className="mt-1 font-mono text-sm text-emerald-950">{p.powerBiExportLoadedSummary.queryEnd}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Carga local</dt>
                    <dd className="mt-1 text-sm text-emerald-950">{formatDateTimeShort(p.powerBiExportLoadedSummary.loadedAtIso)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Eventos recibidos</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{p.powerBiExportLoadedSummary.eventsReceived.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Alertas recibidas</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{p.powerBiExportLoadedSummary.alertsReceived.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Eventos operativos</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{p.powerBiExportLoadedSummary.operationalEvents.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Alertas operativas</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{p.powerBiExportLoadedSummary.operationalAlerts.toLocaleString()}</dd>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/90">Circuitos generados (preliminares)</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{p.powerBiExportLoadedSummary.circuitsGenerated.toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-sm text-slate-600">
                Todavía no hay período cargado para esta pestaña. Usá <strong>Cargar datos del período</strong> para habilitar la exportación.
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              Una descarga por botón suele funcionar mejor que tirar todas juntas. Revisá la carpeta de descargas y permisos del sitio. Debug:{' '}
              <span className="font-medium text-slate-700">ZIP</span> (<span className="font-mono">powerbi-etl-debug_…</span>).{' '}
              <code className="rounded bg-white/90 px-1">powerbi-export/README.md</code>.
            </p>
          </div>
        </section>
        ))}

      {p.mainTab === 'depuracion' && (
        <section className="space-y-8">
          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">Flujo de calidad de datos</h2>
              <p className="mt-1 text-sm text-slate-600">
                Embudo sobre journeyUid Ricardone crudo: reconstrucción con patente válida, exclusiones de solo ingreso/solo egreso (ruta probable) y
                utilidad operativa final.
              </p>
              <div className="mt-8 flex justify-center px-2">
                <DataQualityFunnel stages={funnelStages} />
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <ExecutiveMetricCard
                accent="rose"
                label="Tasa de descarte (exploratoria)"
                value={`${discardRatePct.toFixed(1)} %`}
                sub={`1 − operativos útiles / datos crudos`}
              />
              <div className="flex items-stretch gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className={`w-1 shrink-0 rounded-full ${incTone}`} />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Estado de integridad</div>
                  <div className="mt-1 text-lg font-bold text-slate-900">{p.integrityLabel.text}</div>
                </div>
              </div>
              <ExecutiveMetricCard
                accent="rose"
                label="Principal categoría DESCARTADO"
                value={p.topDiscardInfo.count > 0 ? p.topDiscardInfo.label : '—'}
                sub={p.topDiscardInfo.count > 0 ? p.topDiscardInfo.detail : 'Sin descartes etiquetados DESCARTADO_* en el período.'}
              />
              <ExecutiveMetricCard
                label="Calidad del dataset (KPI prelim)"
                value={p.depurationSnapshot.general.preliminaryValidPatternCount.toLocaleString()}
                sub="Patrones preliminares distintos de INCOMPLETO y no descartados (ver mapa servicio)."
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Análisis de categorías (ejecutivo)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Mismos números que el mapa operativo; formato compacto para comité. KPI = si alimenta KPIs primarios de esta capa.
            </p>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-[640px] w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-3">Categoría</th>
                    <th className="py-3 pr-3 text-right">Cantidad</th>
                    <th className="py-3 pr-3 text-right">% / crudo</th>
                    <th className="py-3 pr-6">Motivo</th>
                    <th className="py-3 text-center">Se usa en KPI</th>
                  </tr>
                </thead>
                <tbody>
                  {p.depurationExecutiveRows.map((r) => (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-3 font-medium text-slate-900">{r.label}</td>
                      <td className="py-3 pr-3 text-right tabular-nums font-semibold">{r.count.toLocaleString()}</td>
                      <td className="py-3 pr-3">
                        <div className="flex items-center justify-end gap-2">
                          <span className="tabular-nums text-slate-800">{(r.pct * 100).toFixed(1)}%</span>
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-2 rounded-full bg-slate-400" style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="max-w-md py-3 pr-6 text-slate-600">{r.reason}</td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            r.kpi === 'Sí'
                              ? 'bg-emerald-100 text-emerald-900'
                              : r.kpi === 'Parcial'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-200 text-slate-800'
                          }`}
                        >
                          {r.kpi}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <details className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">
              Ver detalle técnico — secuencias lógicas (depuración)
            </summary>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {DEPURATION_SCOPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => p.setDepurationScopeFilter(opt.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      p.depurationScopeFilter === opt.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="max-h-[40vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">Secuencia lógica</th>
                      <th className="px-2 py-2 text-right">Crudo</th>
                      <th className="px-2 py-2 text-right">Desc.</th>
                      <th className="px-2 py-2 text-right">Útil</th>
                      <th className="px-2 py-2 font-mono">Preliminar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.depurationSnapshot.sequenceRows.slice(0, 80).map((r) => (
                      <tr key={r.logicalSignature} className="border-t border-slate-100">
                        <td className="max-w-md truncate px-2 py-2 font-mono text-[10px]" title={r.logicalSignature}>
                          {r.logicalSignature.length > 120 ? `${r.logicalSignature.slice(0, 120)}…` : r.logicalSignature}
                        </td>
                        <td className="px-2 py-2 text-right">{r.countRaw}</td>
                        <td className="px-2 py-2 text-right">{r.countDiscarded}</td>
                        <td className="px-2 py-2 text-right">{r.countUseful}</td>
                        <td className="max-w-[160px] truncate px-2 py-2 font-mono text-[9px]">{r.preliminaryClassification}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>
      )}

      {p.mainTab === 'circuitos' && (
        <section className="space-y-8">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="font-semibold">Fuente de datos</div>
            <div>sourceMode: {p.dataSource === 'api' ? 'API real' : 'archivo local'} · startDate: {p.apiQuery.startDate || '—'} · endDate: {p.apiQuery.endDate || '—'}</div>
            <div>useUsefulWindow: {p.useUsefulWindow ? 'sí' : 'no'} · usefulWindowStart: {p.usefulWindow.usefulWindowStart || '—'} · usefulWindowEnd: {p.usefulWindow.usefulWindowEnd || '—'}</div>
            <div>operationalEventCount: {p.events.length} · rawEventCount: {p.eventsUnfiltered.length} · rawAlertCount: {p.rawAlerts.length} · lastLoadedAt: {p.lastLoadedAt ? formatDateTimeShort(p.lastLoadedAt) : '—'} · lastProcessedAt: {p.datasetProcessedAt ? formatDateTimeShort(p.datasetProcessedAt) : '—'}</div>
            <div>Filtro traseras: excluidos {p.rearCameraFilterTrace.excludedRearEvents.length} eventos · {p.rearCameraFilterTrace.excludedRearOnlyJourneyUids.length} recorridos sólo cámaras traseras</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => p.setMainTab('eventos')} className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px]">Ver fuente cruda</button>
              <button type="button" onClick={p.exportCircuitosCsv} disabled={p.prelimCircuitCardMetrics.totalOperational === 0} className="rounded bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Exportar CSV</button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['Ricardone → San Lorenzo', p.prelimCircuitCardMetrics.caladaSl],
                ['Descarga Celda 16 / Carga Celda 16', p.prelimCircuitCardMetrics.celda16],
                ['Volcable 1/2', p.prelimCircuitCardMetrics.volcable],
                ['Circuito líquido', p.prelimCircuitCardMetrics.liquido],
                ['Despacho / descarga sin punto instrumentado', p.prelimCircuitCardMetrics.sinVolcable],
                ['Transile Volcable→Balanza', p.prelimCircuitCardMetrics.loopBalanza],
              ] as const
            ).map(([label, value]) => (
              <ExecutiveMetricCard key={label} label={`${label} (útiles)`} value={value} />
            ))}
            <ExecutiveMetricCard accent="amber" label="Registro incompleto (útiles)" value={p.prelimCircuitCardMetrics.incompletos} />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <HorizontalBarChart
              items={p.circuitBarItems}
              title="Circuito observado vs volumen"
              onPick={(id) => p.setDrawerCircuitCode(id)}
            />
            <ExecutiveMetricCard
              label="Recorridos operativamente útiles (alcance día)"
              value={p.prelimCircuitCardMetrics.totalOperational}
              sub={p.appliedTimeRangeLabel || (p.selectedDay ? `Filtrados al día ${p.selectedDay}` : 'Todos los días Ricardone en carga')}
            />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Resumen compacto por circuito</h3>
            <p className="mt-1 text-sm text-slate-600">Click en una fila para ver ejemplos en el panel lateral.</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-3 pr-2">Circuito</th>
                    <th className="py-3 pr-2">Variante</th>
                    <th className="py-3 pr-2 text-right">Cantidad</th>
                    <th className="py-3 pr-2 text-right">Patentes únicas</th>
                    <th className="py-3 pr-2 text-right">% total útil</th>
                    <th className="py-3 pr-2 text-right">Duración media</th>
                    <th className="py-3 pr-2 text-right">P90</th>
                    <th className="py-3 pr-2">Confianza</th>
                    <th className="py-3 pr-2 text-right">Alertas asociadas</th>
                  </tr>
                </thead>
                <tbody>
                  {p.circuitSummaryRows.map((row) => (
                    <tr
                      key={row.code}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                      onClick={() => p.setDrawerCircuitCode(row.code)}
                    >
                      <td className="py-3 pr-2 font-mono text-xs font-semibold text-slate-900">{row.code}</td>
                      <td className="max-w-[220px] truncate py-3 pr-2 font-mono text-[10px]">{row.variant}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.count}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.uniquePlates}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{(row.pctOfUseful * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.meanDur} min</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.p90} min</td>
                      <td className="py-3 pr-2 capitalize">{row.confidence}</td>
                      <td className="py-3 pr-2 text-right tabular-nums">{row.alertsAssociated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">Ver tablas técnicas — desglose diario × circuito</summary>
            <div className="mt-4 max-h-[48vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 text-left">Día</th>
                    <th className="px-2 py-2 font-mono text-left">Circuito</th>
                    <th className="min-w-[220px] px-2 py-2 text-left">Secuencia típica</th>
                    <th className="px-2 py-2 text-right">J.</th>
                    <th className="px-2 py-2 text-right">Pat.</th>
                    <th className="px-2 py-2 text-right">Ømin</th>
                    <th className="px-2 py-2 text-right">P90</th>
                  </tr>
                </thead>
                <tbody>
                  {p.prelimCircuitDailyFiltered.map((row) => (
                    <tr key={`${row.day}-${row.preliminaryCircuitCode}`} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-2 font-mono">{row.day}</td>
                      <td className="max-w-[200px] truncate px-2 py-2 font-mono text-[10px]">{row.preliminaryCircuitCode}</td>
                      <td className="max-w-[440px] px-2 py-2 font-mono text-[10px] text-slate-700">{preliminaryCircuitTypicalSectorPath(row.preliminaryCircuitCode)}</td>
                      <td className="px-2 py-2 text-right">{row.journeyCount}</td>
                      <td className="px-2 py-2 text-right">{row.uniquePlateCount}</td>
                      <td className="px-2 py-2 text-right">{row.meanDurationMinutes}</td>
                      <td className="px-2 py-2 text-right">{row.p90DurationMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h3 className="text-base font-bold text-amber-950">Registro incompleto (integrado en Circuitos)</h3>
            <p className="mt-1 text-sm text-amber-900">Sección consolidada: ya no requiere pestaña separada para lectura operativa.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <ExecutiveMetricCard accent="amber" label="Total incompletos" value={p.incompleteTotal} />
              <ExecutiveMetricCard label="Top firma" value={p.incompleteRankings.topSignature || '—'} />
              <ExecutiveMetricCard label="% top 5" value={`${p.incompleteRankings.pctTop5.toFixed(1)}%`} />
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'incompletos' && (
        <section className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <ExecutiveMetricCard accent="amber" label="Total registros incompletos" value={p.incompleteTotal} />
            <ExecutiveMetricCard
              accent="amber"
              label="Secuencia más frecuente"
              value={
                (p.incompleteRankings.topSignature ?? '—').length > 52
                  ? `${(p.incompleteRankings.topSignature ?? '').slice(0, 52)}…`
                  : (p.incompleteRankings.topSignature ?? '—')
              }
              sub={`${p.incompleteRankings.topCount} viajes`}
            />
            <ExecutiveMetricCard accent="green" label="% explicado top 5" value={`${p.incompleteRankings.pctTop5.toFixed(1)}%`} />
            <ExecutiveMetricCard label="+ Ingreso" value={p.incompleteRankings.withIngreso} />
            <ExecutiveMetricCard label="+ Balanza" value={p.incompleteRankings.withBalanza} />
            <ExecutiveMetricCard label="+ Egreso" value={p.incompleteRankings.withEgreso} />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900">Análisis de registros incompletos</h3>
            <div className="mt-4 max-h-[42vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-[1500px] w-full text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left">firma lógica</th><th className="px-2 py-2 text-right">cantidad</th><th className="px-2 py-2 text-right">% incompletos</th><th className="px-2 py-2 text-right">patentes</th><th className="px-2 py-2 text-right">eventos prom.</th><th className="px-2 py-2 text-left">alertCodes frecuentes</th><th className="px-2 py-2 text-left">puntos presentes</th><th className="px-2 py-2 text-left">puntos faltantes</th><th className="px-2 py-2 text-left">interpretación</th><th className="px-2 py-2 text-left">acción sugerida</th><th className="px-2 py-2 text-center">candidato</th><th className="px-2 py-2 text-left">motivo candidato</th><th className="px-2 py-2 text-left">acción</th>
                  </tr>
                </thead>
                <tbody>
                  {p.incompleteGroups.map((g) => {
                    const avgEvents =
                      g.journeys.length > 0
                        ? g.journeys.reduce((s, j) => s + j.eventCount, 0) / g.journeys.length
                        : 0
                    const alertCounts = new Map<string, number>()
                    for (const j of g.journeys) {
                      const row = p.summaryJourneys.find((x) => x.journeyUid === j.journeyUid)
                      for (const code of row?.alertCodes ?? []) {
                        alertCounts.set(code, (alertCounts.get(code) ?? 0) + 1)
                      }
                    }
                    const topAlerts = [...alertCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]).join('|')
                    return (
                      <tr key={g.signature} className="border-t border-slate-100">
                        <td className="px-2 py-2 font-mono">{g.signature}</td>
                        <td className="px-2 py-2 text-right">{g.count}</td>
                        <td className="px-2 py-2 text-right">{pctOfIncomplete(g.count, p.incompleteTotal).toFixed(1)}%</td>
                        <td className="px-2 py-2 text-right">{g.uniquePlateCount}</td>
                        <td className="px-2 py-2 text-right">{avgEvents.toFixed(1)}</td>
                        <td className="px-2 py-2 font-mono">{topAlerts || '—'}</td>
                        <td className="px-2 py-2">{g.elementsPresentLabels || '—'}</td>
                        <td className="px-2 py-2">{g.missingElements.join(', ') || '—'}</td>
                        <td className="px-2 py-2">{g.possibleInterpretation}</td>
                        <td className="px-2 py-2">{g.suggestedAction}</td>
                        <td className="px-2 py-2 text-center">{g.candidatePattern ? 'sí' : 'no'}</td>
                        <td className="px-2 py-2">{g.candidateReason || '—'}</td>
                        <td className="px-2 py-2"><button type="button" onClick={() => p.setDrawerIncompleteGroup(g)} className="rounded border px-2 py-1">Ver ejemplos</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            {p.incompleteGroups.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
                Sin registros incompletos con filtros vigentes.
              </p>
            ) : (
              p.incompleteGroups.slice(0, 16).map((g) => (
                <article key={g.signature} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold uppercase text-slate-500">Secuencia</div>
                      <p className="mt-1 break-all font-mono text-[12px] font-semibold text-slate-900">{g.signature}</p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                      <div className="text-2xl font-bold tabular-nums text-slate-900">{g.count}</div>
                      <div className="mt-1 text-xs text-slate-600">{pctOfIncomplete(g.count, p.incompleteTotal).toFixed(1)}% incompletos</div>
                    </div>
                  </div>
                  <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-slate-700">Elementos observados</dt>
                      <dd className="mt-1 text-slate-600">{g.elementsPresentLabels}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-700">Faltantes rutas típicas</dt>
                      <dd className="mt-1 font-mono text-xs text-slate-600">{g.missingElements.join(', ') || '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 text-sm">
                    <div className="font-semibold text-slate-800">Interpretación posible</div>
                    <p className="mt-1 text-slate-600">{g.possibleInterpretation}</p>
                  </div>
                  <div className="mt-3 text-sm">
                    <div className="font-semibold text-slate-800">Acción sugerida</div>
                    <p className="mt-1 text-slate-600">{g.suggestedAction}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {g.candidatePattern ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200">
                        Posible nuevo patrón
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => p.setDrawerIncompleteGroup(g)}
                      className="ml-auto rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Ver ejemplos
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {p.mainTab === 'camara_por_camara' && (
        <section className="space-y-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Calidad de lectura de patentes</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ExecutiveMetricCard accent="green" label="Eventos patente válida" value={p.plateQualitySummary.validPlateEvents} />
              <ExecutiveMetricCard accent="rose" label="Eventos patente inválida" value={p.plateQualitySummary.invalidPlateEvents} />
              <ExecutiveMetricCard label="% inválidas" value={`${(p.plateQualitySummary.invalidPlateEventRatio * 100).toFixed(1)} %`} />
              <ExecutiveMetricCard label="Lectura OCR inválida más frecuente" value={p.topInvalidPlateReading} sub="valor crudo" />
            </div>
            <details className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <summary className="cursor-pointer select-none font-semibold text-slate-800">Tablas técnicas adicionales (inválidas por sector/cámara)</summary>
              <div className="mt-4 max-h-[260px] overflow-auto rounded-xl border bg-white">
                <table className="min-w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-2 py-2 text-left">sectorCode</th>
                      <th className="px-2 py-2 text-left">deviceCode</th>
                      <th className="px-2 py-2 text-right">Evts</th>
                      <th className="px-2 py-2 text-right">Invál.</th>
                      <th className="px-2 py-2 text-right">%</th>
                      <th className="min-w-[200px] px-2 py-2 text-left">Top OCR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.plateQualitySummary.invalidByCameraRows.map((row) => (
                      <tr key={`${row.sectorCode}-${row.deviceCode}`} className="border-t border-slate-100">
                        <td className="truncate px-2 py-2 font-mono">{row.sectorCode}</td>
                        <td className="truncate px-2 py-2 font-mono">{row.deviceCode}</td>
                        <td className="px-2 py-2 text-right">{row.totalEvents}</td>
                        <td className="px-2 py-2 text-right">{row.invalidPlateEvents}</td>
                        <td className="px-2 py-2 text-right">{(row.pctInvalid * 100).toFixed(1)}%</td>
                        <td className="px-2 py-2 font-mono text-[9px]">{row.topInvalidReadingsSummary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <div className="mt-6 overflow-x-auto rounded-xl border border-slate-100">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Lectura OCR</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 font-mono text-left">Cámara top</th>
                    <th className="px-3 py-2 font-mono text-left">Sector top</th>
                    <th className="px-3 py-2 text-left">Primer evt</th>
                    <th className="px-3 py-2 text-left">Último evt</th>
                  </tr>
                </thead>
                <tbody>
                  {p.plateQualitySummary.topInvalidPlateReadings.slice(0, 35).map((r) => (
                    <tr key={`${r.truckPlateOriginal}-${r.normalizedPlate}`} className="border-t border-slate-100">
                      <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px]">{r.truckPlateOriginal}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.eventCount}</td>
                      <td className="truncate px-3 py-2 font-mono text-[11px]">{r.topDeviceCode}</td>
                      <td className="truncate px-3 py-2 font-mono text-[11px]">{r.topSectorCode}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.firstOccurredAt ? formatDateTimeShort(r.firstOccurredAt) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">{r.lastOccurredAt ? formatDateTimeShort(r.lastOccurredAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Cobertura de cámaras</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ExecutiveMetricCard accent="green" label="Cámaras / combos activas (completo)" value={p.cameraStatusCounts.activas} />
              <ExecutiveMetricCard accent="amber" label="Cobertura parcial de días" value={p.cameraStatusCounts.parciales} />
              <ExecutiveMetricCard label="Actividad baja (heurística)" value={p.cameraStatusCounts.baja} />
              <ExecutiveMetricCard label="Actividad repetitiva" value={p.cameraStatusCounts.repetitiva} />
              <ExecutiveMetricCard label="Combinaciones observadas (sector×device)" value={p.cameraStatusCounts.combos} />
            </div>
            <div className="mt-6 max-h-[48vh] overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-[960px] w-full text-[11px]">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-2 py-2 font-mono text-left">Sector</th>
                    <th className="px-2 py-2 font-mono text-left">Cámara</th>
                    <th className="px-2 py-2 text-left">Primer</th>
                    <th className="px-2 py-2 text-left">Último</th>
                    <th className="px-2 py-2 text-right">Evts</th>
                    <th className="px-2 py-2 text-right">Pat.</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {p.cameraCoverageSummary.rows.map((r) => (
                    <tr key={`${r.sectorCode}-${r.deviceCode}`} className="border-t border-slate-100">
                      <td className="max-w-[180px] truncate px-2 py-2 font-mono">{r.sectorCode}</td>
                      <td className="max-w-[120px] truncate px-2 py-2 font-mono">{r.deviceCode}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.firstEventAt ? formatDateTimeShort(r.firstEventAt) : '—'}</td>
                      <td className="whitespace-nowrap px-2 py-2">{r.lastEventAt ? formatDateTimeShort(r.lastEventAt) : '—'}</td>
                      <td className="px-2 py-2 text-right">{r.totalEventCount}</td>
                      <td className="px-2 py-2 text-right">{r.uniquePlateCount}</td>
                      <td className="max-w-[220px] truncate px-2 py-2 font-mono text-[10px]" title={r.coverageStatus}>
                        {r.coverageStatus}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {p.mainTab === 'buscar' && (
        <section className="space-y-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-md">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Buscar patente</span>
                <input
                  value={p.plateQuery}
                  onChange={(e) => p.setPlateQuery(e.target.value)}
                  placeholder="Ej. ABC123 o AB123CD"
                  className="mt-3 w-full rounded-2xl border-2 border-slate-900/70 px-5 py-4 text-xl font-mono outline-none shadow-inner focus:border-sky-600"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">Buscar journey ID</span>
                <input
                  value={p.journeyQuery}
                  onChange={(e) => p.setJourneyQuery(e.target.value)}
                  placeholder="Ej. 5e4a... o journeyUuid"
                  className="mt-3 w-full rounded-2xl border-2 border-slate-900/70 px-5 py-4 text-xl font-mono outline-none shadow-inner focus:border-sky-600"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={p.onlyThisPlateScope} onChange={(e) => p.setOnlyThisPlateScope(e.target.checked)} disabled={!p.plateNorm} />
                Filtrar otras pestañas por esta patente
              </label>
              <div className="flex items-center gap-2">
                <span>Ventana interplanta (h)</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={p.interplantWindowHours}
                  onChange={(e) => p.setInterplantWindowHours(Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-20 rounded-lg border px-2 py-2"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  p.setPlateQuery('')
                  p.setJourneyQuery('')
                }}
                className="rounded-xl border px-4 py-2 font-medium hover:bg-slate-50"
              >
                Limpiar
              </button>
              <button
                type="button"
                disabled={p.plateTimelineRows.length === 0}
                onClick={p.downloadPlateCsv}
                className="rounded-xl bg-slate-900 px-5 py-2 font-semibold text-white disabled:opacity-40"
              >
                CSV eventos
              </button>
            </div>
            {p.plateQueryFormatWarning ? (
              <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                Consulta fuera del formato habitual de patente Argentina.
              </p>
            ) : null}
          </div>

          {(p.plateNorm || p.journeyQueryNorm) && p.plateSummary && (
            <>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Resumen de búsqueda</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <ExecutiveMetricCard label="Eventos" value={p.plateSummary.totalEvents} />
                  <ExecutiveMetricCard label="Recorridos reconstr." value={p.plateSummary.totalJourneys} />
                  <ExecutiveMetricCard label="Primer evento" value={p.plateSummary.firstAt ? formatDateTimeShort(p.plateSummary.firstAt) : '—'} />
                  <ExecutiveMetricCard label="Último evento" value={p.plateSummary.lastAt ? formatDateTimeShort(p.plateSummary.lastAt) : '—'} />
                  <ExecutiveMetricCard label="Días activos" value={p.plateSummary.dayCount} />
                </div>
                <p className="mt-6 text-[11px] font-semibold uppercase text-slate-500">Circuitos observados</p>
                <p className="mt-2 font-mono text-xs">{p.plateSummary.circuits.join(', ') || '—'}</p>
                <div className="mt-6">
                  <h4 className="text-sm font-bold text-slate-900">Registros completos de la patente ({p.plateTimelineRows.length})</h4>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Se muestran todas las lecturas detectadas para la patente en orden cronológico (no solo hitos).
                  </p>
                  <div className="mt-4 max-h-[260px] overflow-auto rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex min-w-max items-stretch gap-2">
                      {p.plateTimelineRows.map((row, idx) => (
                        <div key={`${row.journeyUid}-${row.occurredAt}-${idx}`} className="flex items-center gap-2">
                          <div className="min-w-[170px] rounded-2xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-center shadow-sm">
                            <div className="font-mono text-[10px] font-semibold text-slate-900">{formatDateTimeShort(row.occurredAt)}</div>
                            <div className="mt-1 font-mono text-[10px] text-sky-900">{row.logicalCode}</div>
                            <div className="mt-1 truncate font-mono text-[10px] text-slate-700" title={row.sectorCode}>{row.sectorCode}</div>
                            <div className="truncate font-mono text-[10px] text-slate-500" title={row.deviceCode}>{row.deviceCode}</div>
                          </div>
                          {idx < p.plateTimelineRows.length - 1 ? <span className="text-slate-400">→</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="text-base font-bold text-slate-900">Alertas asociadas a la búsqueda</h4>
                  <div className="mt-3 max-h-48 overflow-auto">
                    {searchAlertsForCurrentQuery
                      .slice(0, 80)
                      .map((a) => (
                        <div key={a.alertId} className="border-b border-slate-100 py-2 text-xs">
                          <span className="font-mono">{formatDateTimeShort(a.occurredAt)}</span> · <span className="font-mono">{a.alertCode || a.alertType || '—'}</span> · {a.reason || a.description || a.message || 'sin detalle'}
                        </div>
                      ))}
                    {searchAlertsForCurrentQuery.length === 0 ? (
                      <div className="text-xs text-slate-500">Sin alertas asociadas en la consulta actual.</div>
                    ) : null}
                  </div>
                </div>
                {p.interplantHintsForPlate.map((hint, hi) => (
                  <div key={`${hint.journeyUidRicardone}-${hi}`} className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-950">
                    Posible Ricardone → San Lorenzo dentro de ventana configurada • Δ {(hint.deltaMs / 3600000).toFixed(2)} h
                  </div>
                ))}
                <h4 className="text-base font-bold text-slate-900">Por journeyUid</h4>
                {[...p.plateJourneysFull]
                  .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
                  .map((j) => (
                    <div key={j.journeyUid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap gap-2 font-mono text-[11px] text-slate-700">
                        <span className="font-bold">{j.journeyUid}</span>
                        <span>Duración {j.durationMinutes} min</span>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <span className="text-slate-500">Circuito</span>{' '}
                          <span className="font-mono font-semibold">{j.preliminaryCircuitCode}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Confianza</span> <span>{j.preliminaryCircuitConfidence}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Grupo preliminar</span>{' '}
                          <span>{j.preliminaryCircuitGroup ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Variante</span>{' '}
                          <span className="font-mono text-[11px]">{j.preliminaryCircuitVariant ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">etlStatus</span>{' '}
                          <span>
                            {p.summaryJourneys.find((x) => x.journeyUid === j.journeyUid)?.etlStatus ?? '—'}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <button type="button" onClick={() => p.setNearbyDrawerJourneyUid(j.journeyUid)} className="rounded border px-2 py-1 text-[11px]">Buscar alertas cercanas</button>
                        </div>
                      </dl>
                      <p className="mt-1 text-xs text-slate-600">{j.preliminaryCircuitReason}</p>
                      <p className="mt-2 font-mono text-[11px] text-slate-900">{normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{normalizeSequenceForPattern(j.rawSectorSequence).join(' → ')}</p>
                      <div className="mt-2 flex flex-wrap gap-1">{j.qualityFlags.map((f) => (<QualityFlagBadge key={f} flag={f} />))}</div>
                    </div>
                  ))}
              </div>

              <details className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <summary className="cursor-pointer font-semibold text-slate-800">Ver tabla detallada de eventos crudos</summary>
                <div className="mt-4 max-h-[40vh] overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-[10px]">
                    <thead className="sticky top-0 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-2 py-1 text-left">Fecha</th>
                        <th className="px-2 py-1 font-mono text-left">logical</th>
                        <th className="px-2 py-1 font-mono text-left">sectorCode</th>
                        <th className="px-2 py-1 font-mono text-left">deviceCode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.plateTimelineRows.map((row, ri) => (
                        <tr key={`${row.journeyUid}-${ri}`} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2 py-1">{formatDateTimeShort(row.occurredAt)}</td>
                          <td className="px-2 py-1 font-mono">{row.logicalCode}</td>
                          <td className="max-w-[120px] truncate px-2 py-1 font-mono">{row.sectorCode}</td>
                          <td className="max-w-[110px] truncate px-2 py-1 font-mono">{row.deviceCode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}

          {(p.plateNorm || p.journeyQueryNorm) && p.plateEventsAll.length === 0 ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">Sin lecturas encontradas para la consulta actual.</p>
          ) : null}
        </section>
      )}

      </section>

      <DiagDrawer open={Boolean(p.drawerCircuitCode)} title="Fuente del circuito" subtitle={p.drawerCircuitCode ?? ''} onClose={() => p.setDrawerCircuitCode(null)}>
        <div className="space-y-3 text-[11px]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>cantidad recorridos: {p.circuitSourceRows.length} · cantidad eventos: {p.circuitSourceSummary.eventsCount} · patentes únicas: {p.circuitSourceSummary.plates}</div>
            <div>alertas asociadas: {p.circuitSourceSummary.alertsCount} · dentro/fuera ventana útil: {p.circuitSourceSummary.inside}/{p.circuitSourceSummary.outside}</div>
            <div>incluidos/revisión/descartados: {p.circuitSourceSummary.included}/{p.circuitSourceSummary.review}/{p.circuitSourceSummary.excluded}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 font-semibold">Modo corrección de inválidos/incompletos</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input value={drawerJourneySearch} onChange={(e) => setDrawerJourneySearch(e.target.value)} placeholder="Buscar journeyUid o patente" className="rounded border px-2 py-1" />
              <input value={drawerSectorFilter} onChange={(e) => setDrawerSectorFilter(e.target.value)} placeholder="Filtrar sector (ej: PREINGRESO)" className="rounded border px-2 py-1" />
              <input value={drawerDeviceFilter} onChange={(e) => setDrawerDeviceFilter(e.target.value)} placeholder="Filtrar device/cámara" className="rounded border px-2 py-1" />
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={drawerOnlySinglePoint} onChange={(e) => setDrawerOnlySinglePoint(e.target.checked)} /> solo recorridos de 1 punto</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={drawerOnlyWithNearby} onChange={(e) => setDrawerOnlyWithNearby(e.target.checked)} /> solo con alertas cercanas</label>
            </div>
            <div className="mt-2 text-slate-600">Visibles: {filteredCircuitRows.length} / {p.circuitSourceRows.length}</div>
            {filteredCircuitSinglePointSummary.length > 0 ? (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                <div className="font-semibold text-amber-950">Top firmas de 1 punto (para atacar error masivo)</div>
                <div className="mt-1 grid gap-1">
                  {filteredCircuitSinglePointSummary.map(([k, c]) => (
                    <div key={k} className="flex justify-between text-[11px]"><span className="font-mono">{k}</span><span>{c}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="max-h-[36vh] overflow-auto rounded-xl border border-slate-100">
            <table className="min-w-[1300px] w-full text-[11px]">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-left">etlStatus</th><th className="px-2 py-2 text-left">journeyUid</th><th className="px-2 py-2 text-left">patente</th><th className="px-2 py-2 text-left">inicio</th><th className="px-2 py-2 text-left">fin</th><th className="px-2 py-2 text-right">duración</th><th className="px-2 py-2 text-right">eventos</th><th className="px-2 py-2 text-left">circuito</th><th className="px-2 py-2 text-left">variante</th><th className="px-2 py-2 text-left">confidence</th><th className="px-2 py-2 text-left">alertCodes</th><th className="px-2 py-2 text-left">alertas cercanas</th><th className="px-2 py-2 text-left">reason</th><th className="px-2 py-2 text-left">regla</th><th className="px-2 py-2 text-left">missing</th><th className="px-2 py-2 text-left">evidence</th><th className="px-2 py-2 text-left">acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredCircuitRows.map((r) => (
                  <tr key={r.journeyUid} className="border-t border-slate-100">
                    <td className="px-2 py-2">{r.etlStatus}</td>
                    <td className="px-2 py-2 font-mono">{r.journeyUid}</td>
                    <td className="px-2 py-2 font-mono">{r.plate}</td>
                    <td className="px-2 py-2">{formatDateTimeShort(r.startedAt)}</td>
                    <td className="px-2 py-2">{formatDateTimeShort(r.endedAt)}</td>
                    <td className="px-2 py-2 text-right">{r.durationMinutes}</td>
                    <td className="px-2 py-2 text-right">{r.eventCount}</td>
                    <td className="px-2 py-2 font-mono">{r.preliminaryCircuitCode}</td>
                    <td className="px-2 py-2 font-mono">{r.preliminaryCircuitVariant}</td>
                    <td className="px-2 py-2">{r.preliminaryCircuitConfidence}</td>
                    <td className="px-2 py-2 font-mono">{r.alertCodes.join('|') || '—'}</td>
                    <td className="px-2 py-2">{r.hasNearbyRelevantAlerts ? r.nearbyAlertCodes.join('|') || 'sí' : 'no'}</td>
                    <td className="px-2 py-2">{r.reviewReason || r.exclusionReason || '—'}</td>
                    <td className="px-2 py-2 font-mono">{r.classificationRuleId}</td>
                    <td className="px-2 py-2 font-mono">{r.missingExpectedPoints.join('|') || '—'}</td>
                    <td className="px-2 py-2 font-mono">{r.evidencePoints.join('|') || '—'}</td>
                    <td className="px-2 py-2"><div className="flex gap-1"><button type="button" onClick={() => p.setSelectedCircuitJourneyUid(r.journeyUid)} className="rounded border px-2 py-1">Ver eventos</button><button type="button" onClick={() => p.setNearbyDrawerJourneyUid(r.journeyUid)} className="rounded border px-2 py-1">Buscar alertas cercanas</button></div></td>
                  </tr>
                ))}
                {filteredCircuitRows.length === 0 ? (
                  <tr><td colSpan={17} className="px-2 py-3 text-center text-slate-500">Sin resultados con los filtros aplicados.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {p.selectedCircuitJourneyUid ? (
            <div className="space-y-2">
              <div className="font-semibold">Eventos del journey {p.selectedCircuitJourneyUid}</div>
              <div className="rounded-xl border border-slate-100 p-2">
                <div className="mb-1 font-semibold">Alertas asociadas</div>
                <div className="max-h-32 overflow-auto text-[11px]">
                  {(p.circuitSourceRows.find((r) => r.journeyUid === p.selectedCircuitJourneyUid)?.alerts ?? []).map((a) => (
                    <div key={a.alertId} className="border-b border-slate-100 py-1">
                      <span className="font-mono">{a.alertCode || '—'}</span> · sev {a.alertLevel} · {String((a.raw as any).status ?? '—')} · {a.description || a.reason || a.message || 'sin detalle'} · <span className="font-mono">{a.sectorCode || '—'}/{a.deviceCode || '—'}</span> · {formatDateTimeShort(String((a.raw as any).createdAt ?? a.occurredAt))}
                    </div>
                  ))}
                  {(p.circuitSourceRows.find((r) => r.journeyUid === p.selectedCircuitJourneyUid)?.alerts ?? []).length === 0 ? <div className="text-slate-500">Sin alertas asociadas.</div> : null}
                </div>
              </div>
              <div className="max-h-[28vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-[1200px] w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1 text-left">id</th><th className="px-2 py-1 text-left">occurredAt</th><th className="px-2 py-1 text-left">createdAt</th><th className="px-2 py-1 text-right">seq</th><th className="px-2 py-1 text-left">truckPlate</th><th className="px-2 py-1 text-left">sectorCode</th><th className="px-2 py-1 text-left">deviceCode</th><th className="px-2 py-1 text-left">logicalCode</th><th className="px-2 py-1 text-left">pointLabel</th><th className="px-2 py-1 text-right">alertLevel</th><th className="px-2 py-1 text-left">alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(p.circuitSourceRows.find((r) => r.journeyUid === p.selectedCircuitJourneyUid)?.events ?? []).map((e) => {
                      const point = normalizeRealEventPoint(e)
                      const row = p.circuitSourceRows.find((r) => r.journeyUid === p.selectedCircuitJourneyUid)
                      return (
                        <tr key={`${e.id}-${e.sequenceNumber}`} className="border-t border-slate-100">
                          <td className="px-2 py-1">{e.id}</td>
                          <td className="px-2 py-1">{formatDateTimeShort(e.occurredAt)}</td>
                          <td className="px-2 py-1">{formatDateTimeShort(e.createdAt ?? e.recordedAt)}</td>
                          <td className="px-2 py-1 text-right">{e.sequenceNumber}</td>
                          <td className="px-2 py-1 font-mono">{e.truckPlate}</td>
                          <td className="px-2 py-1 font-mono">{e.sectorCode}</td>
                          <td className="px-2 py-1 font-mono">{e.deviceCode}</td>
                          <td className="px-2 py-1 font-mono">{point.logicalCode}</td>
                          <td className="px-2 py-1">{point.pointLabel}</td>
                          <td className="px-2 py-1 text-right">{e.alertLevel}</td>
                          <td className="px-2 py-1 font-mono">{row?.alertCodes.join('|') || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </DiagDrawer>

      <DiagDrawer open={Boolean(p.nearbyDrawerJourneyUid)} title="Alertas cercanas al recorrido" subtitle={p.nearbyDrawerJourneyUid ?? ''} onClose={() => p.setNearbyDrawerJourneyUid(null)}>
        <div className="space-y-3 text-[11px]">
          {p.nearbyAlertsLoading ? <div className="rounded border border-slate-200 bg-slate-50 p-2">Consultando alertas por rango horario...</div> : null}
          {p.nearbyAlertsError ? <div className="rounded border border-rose-200 bg-rose-50 p-2 text-rose-900">{p.nearbyAlertsError}</div> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <label>Ventana hacia atrás (h)
              <input type="number" min={0} max={12} value={p.nearbyBackwardHours} onChange={(e) => p.setNearbyBackwardHours(Math.max(0, Math.min(12, Number(e.target.value) || 0)))} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
            <label>Ventana hacia adelante (h)
              <input type="number" min={0} max={12} value={p.nearbyForwardHours} onChange={(e) => p.setNearbyForwardHours(Math.max(0, Math.min(12, Number(e.target.value) || 0)))} className="mt-1 w-full rounded border px-2 py-1" />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={p.nearbyIncludeExpectedSectors} onChange={(e) => p.setNearbyIncludeExpectedSectors(e.target.checked)} /> incluir sectores esperados faltantes</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={p.nearbyIncludeSimilarPlates} onChange={(e) => p.setNearbyIncludeSimilarPlates(e.target.checked)} /> incluir patentes similares</label>
            <label className="inline-flex items-center gap-1"><input type="checkbox" checked={p.nearbyIncludeLpr} onChange={(e) => p.setNearbyIncludeLpr(e.target.checked)} /> incluir LPR_MALFUNCTION</label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label>Buscar por letras de patente
              <input
                value={nearbyPlateFilter}
                onChange={(e) => setNearbyPlateFilter(e.target.value)}
                placeholder="Ej: MYW, 26I, FFD"
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label>Filtrar por cámara / device
              <input
                value={nearbyDeviceFilter}
                onChange={(e) => setNearbyDeviceFilter(e.target.value)}
                placeholder="Ej: RicPreIngInTr, RicB2Egreso"
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label>Filtrar por sector
              <input
                value={nearbySectorFilter}
                onChange={(e) => setNearbySectorFilter(e.target.value)}
                placeholder="Ej: RICARDONE_PREINGRESO"
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
          </div>
          {p.nearbyDrawerResult ? (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                <div>Mostrando todas las alertas en la ventana horaria para auditoría manual. Coincidencias visibles: {filteredNearbyRows.length} / {p.nearbyDrawerResult.rows.length}</div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
                <div className="font-semibold">Sugerencia de reconstrucción</div>
                <div>{p.nearbyDrawerResult.reconstructionSuggestion}</div>
              </div>
              <div className="max-h-[35vh] overflow-auto rounded-xl border border-slate-100">
                <table className="min-w-[1300px] w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1 text-left">relación sugerida</th><th className="px-2 py-1 text-right">Δ inicio (min)</th><th className="px-2 py-1 text-right">Δ fin (min)</th><th className="px-2 py-1 text-left">alertCode</th><th className="px-2 py-1 text-right">severity</th><th className="px-2 py-1 text-left">createdAt</th><th className="px-2 py-1 text-left">sectorCode</th><th className="px-2 py-1 text-left">deviceCode</th><th className="px-2 py-1 text-left">patente</th><th className="px-2 py-1 text-left">payload.plate</th><th className="px-2 py-1 text-left">payload.normalizedPlate</th><th className="px-2 py-1 text-left">description</th><th className="px-2 py-1 text-right">similitud</th><th className="px-2 py-1 text-left">acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNearbyRows.map((r) => (
                      <tr key={r.alert.alertId} className="border-t border-slate-100">
                        <td className="px-2 py-1">{r.classification}</td>
                        <td className="px-2 py-1 text-right">{r.diffMinutesFromStart}</td>
                        <td className="px-2 py-1 text-right">{r.diffMinutesFromEnd}</td>
                        <td className="px-2 py-1 font-mono">{r.alert.alertCode || r.alert.alertType || '—'}</td>
                        <td className="px-2 py-1 text-right">{r.alert.alertLevel}</td>
                        <td className="px-2 py-1">{formatDateTimeShort(String((r.alert.raw as any).createdAt ?? r.alert.occurredAt))}</td>
                        <td className="px-2 py-1 font-mono">{r.alert.sectorCode || '—'}</td>
                        <td className="px-2 py-1 font-mono">{r.alert.deviceCode || '—'}</td>
                        <td className="px-2 py-1 font-mono">{r.alert.normalizedPlate || r.alert.rawPlate || '—'}</td>
                        <td className="px-2 py-1 font-mono">{String(r.alert.payload.plate ?? '—')}</td>
                        <td className="px-2 py-1 font-mono">{String(r.alert.payload.normalizedPlate ?? '—')}</td>
                        <td className="px-2 py-1">{r.alert.description || r.alert.reason || r.alert.message || '—'}</td>
                        <td className="px-2 py-1 text-right">{(r.similarityScore * 100).toFixed(0)}%</td>
                        <td className="px-2 py-1"><button type="button" onClick={() => p.associateNearbyAlert(p.nearbyDrawerJourneyUid || '', r.alert.alertCode || r.alert.alertType || r.alert.alertId)} className="rounded border px-2 py-1">Asociar y reclasificar</button></td>
                      </tr>
                    ))}
                    {filteredNearbyRows.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-2 py-3 text-center text-slate-500">
                          Sin coincidencias con los filtros actuales.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : <div className="text-slate-500">Sin resultados para este recorrido.</div>}
        </div>
      </DiagDrawer>

      <DiagDrawer
        open={Boolean(p.drawerIncompleteGroup)}
        title="Ejemplos — incompleto recurrente"
        subtitle={p.drawerIncompleteGroup?.signature ?? ''}
        onClose={() => p.setDrawerIncompleteGroup(null)}
      >
        {p.drawerIncompleteGroup ? (
          <ul className="space-y-3 text-[11px]">
            {p.drawerIncompleteGroup.journeys.slice(0, 25).map((j) => (
              <li key={j.journeyUid} className="rounded-xl border border-slate-100 p-3">
                <div className="font-mono text-xs">{j.journeyUid}</div>
                <div className="mt-1">
                  Pat. {j.plate} • {formatDateTimeShort(j.startedAt)}
                </div>
                <p className="mt-2 font-mono text-[10px]">{normalizeSequenceForPattern(j.logicalCodeSequence).join(' → ')}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </DiagDrawer>

      <DiagDrawer
        open={Boolean(p.selectedAlert)}
        title="Detalle de alerta"
        subtitle={p.selectedAlert?.alertId ?? ''}
        onClose={() => {
          p.setSelectedAlert(null)
          p.setSelectedAlertJourneyEvents([])
        }}
      >
        {p.selectedAlert ? (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl border border-slate-200 p-3">
              <div><span className="font-semibold">Fecha:</span> {formatDateTimeShort(p.selectedAlert.occurredAt)}</div>
              <div><span className="font-semibold">Patente:</span> {p.selectedAlert.normalizedPlate || p.selectedAlert.rawPlate || 'sin dato'}</div>
              <div><span className="font-semibold">Journey:</span> <span className="font-mono">{p.selectedAlert.journeyUid || 'sin dato'}</span></div>
              <div><span className="font-semibold">Sector/Device:</span> <span className="font-mono">{p.selectedAlert.sectorCode || 'sin sector'} / {p.selectedAlert.deviceCode || 'sin device'}</span></div>
              <div><span className="font-semibold">Tipo/Código:</span> {p.selectedAlert.alertType || 'sin tipo'} / <span className="font-mono">{p.selectedAlert.alertCode || 'sin código'}</span></div>
              <div><span className="font-semibold">Motivo:</span> {p.selectedAlert.reason || p.selectedAlert.description || p.selectedAlert.message || 'sin dato'}</div>
              <div><span className="font-semibold">Inferencia:</span> {p.selectedAlert.inferenceCategory} {p.selectedAlert.inferenceIsHeuristic ? '(inferido)' : ''}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigator.clipboard.writeText(p.selectedAlert?.journeyUid || '')} className="rounded border px-2 py-1">Copiar journeyUuid</button>
              <button type="button" onClick={() => navigator.clipboard.writeText(p.selectedAlert?.normalizedPlate || p.selectedAlert?.rawPlate || '')} className="rounded border px-2 py-1">Copiar patente</button>
              <button type="button" onClick={() => navigator.clipboard.writeText(JSON.stringify(p.selectedAlert?.raw ?? {}, null, 2))} className="rounded border px-2 py-1">Copiar JSON</button>
              <button type="button" disabled={!p.selectedAlert.journeyUid} onClick={() => void p.loadJourneyEventsForAlert(p.selectedAlert?.journeyUid || '')} className="rounded border px-2 py-1 disabled:opacity-40">Ver eventos de este journey</button>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 font-semibold">Payload original</div>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(p.selectedAlert.payload, null, 2)}</pre>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 font-semibold">JSON alerta (raw)</div>
              <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(p.selectedAlert.raw, null, 2)}</pre>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 font-semibold">Eventos asociados</div>
              {p.selectedAlertJourneyLoading ? <div>Cargando eventos...</div> : null}
              {p.selectedAlertJourneyError ? <div className="text-rose-700">{p.selectedAlertJourneyError}</div> : null}
              {!p.selectedAlertJourneyLoading && !p.selectedAlertJourneyError ? (
                <div className="max-h-52 overflow-auto">
                  {p.selectedAlertJourneyEvents.length === 0 ? (
                    <div className="text-slate-500">Sin eventos cargados para este journey.</div>
                  ) : (
                    <table className="min-w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-50">
                        <tr>
                          <th className="px-2 py-1 text-left">occurredAt</th>
                          <th className="px-2 py-1 text-left">sectorCode</th>
                          <th className="px-2 py-1 text-left">deviceCode</th>
                          <th className="px-2 py-1 text-left">patente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.selectedAlertJourneyEvents.map((e) => (
                          <tr key={`${e.id}-${e.sequenceNumber}`} className="border-t border-slate-100">
                            <td className="px-2 py-1">{formatDateTimeShort(e.occurredAt)}</td>
                            <td className="px-2 py-1 font-mono">{e.sectorCode}</td>
                            <td className="px-2 py-1 font-mono">{e.deviceCode}</td>
                            <td className="px-2 py-1 font-mono">{e.normalizedPlate || e.truckPlate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DiagDrawer>
    </div>
  )
}