import type { CommitteePipelineResult } from '../../services/realCommitteePipeline'
import type { RealAlertDto } from '../../services/realTruckflowApi'
import type { RealJourneyEventDto } from '../../services/realJourneyEvents.types'
import type { buildCleanRealDataset } from '../../services/realTruckflowCleanDataset'

export type WorkPeriodStatus = 'idle' | 'loading' | 'loaded' | 'error'

export type LoadedRangeIso = { startIso: string; endIso: string }

/** Etapa fina dentro de `loading` / transición a `loaded`. */
export type WorkspaceLoadStage =
  | 'idle'
  | 'fetching_events'
  | 'fetching_alerts'
  | 'filtering_ricardone'
  | 'committee_pipeline'
  | 'clean_dataset'
  | 'committing_state'
  | 'ready'

export type WorkspaceLastLoadCounts = {
  eventsApiCount: number
  alertsApiCount: number
  ricardoneEventCount: number
  operationalEventCount: number
  operationalAlertCount: number
  /** Filas `reconstructedJourneysRaw` si hubo dataset limpio; si no, estimación vía comité. */
  circuitsApprox: number
}

export type LoadTimingRow = {
  etapa: string
  ms: number
  detalle?: string
}

export type LocalAnalysisPhase = 'none' | 'staging' | 'processed'

export type LocalDiskLoadSummary = {
  daysLoaded: number
  dataRoot: string
}

export type LocalFilesPowerBiMeta = {
  source_mode: 'local_files'
  local_folder: string
  start_date: string
  end_date: string
  days_loaded: number
}

export type RealTruckflowWorkspaceData = {
  status: WorkPeriodStatus
  error: string | null
  loadedRange: LoadedRangeIso | null
  loadedAt: string | null
  rawEventsRicardone: RealJourneyEventDto[]
  rawAlerts: RealAlertDto[]
  committee: CommitteePipelineResult | null
  cleanDataset: ReturnType<typeof buildCleanRealDataset> | null
}
