/**
 * Contratos de entrada/salida del pipeline ETL (solo tipos + versión de reglas).
 *
 * Existe para cortar los ciclos de import contra `etlTransformPipeline.ts`: los pasos
 * (`etlExcelMovimientosStep`, `etlTransformTramo3`, `etlTransformPhaseStore`, …) necesitan
 * estos tipos, pero el pipeline necesita a los pasos. Este módulo es **leaf respecto del
 * pipeline** — no lo importa nunca — así la dependencia queda en una sola dirección.
 *
 * `etlTransformPipeline` re-exporta todo lo de acá, así que los imports existentes siguen
 * funcionando; los nuevos deberían apuntar a este archivo.
 */
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import type { RealAlertDto } from '../../../services/realTruckflowApi'
import type { TruckPlateRegistryDocument } from '../../../domain/truckPlateRegistry'
import type { MovimientosContratoFileInput } from './etlExternalMovimientosContrato'
import type { CircuitTimingIndex } from './etlCircuitTiming'
import type { SegmentTimingIndex } from './etlSegmentTiming'
import type { KpiTiemposBuildInput } from './etlKpiTiemposBuild'

/**
 * Versión de reglas del ETL. Bumpear ante **cualquier** cambio de clasificación: las corridas
 * cacheadas en `runs/windows/` se marcan `stale` comparando contra esta cadena.
 *
 * ⚠️ Está espejada en `server/truckflow-local-server.mjs` (`CURRENT_RULES_VERSION`), que es
 * `.mjs` y no puede importar TS. **Cambiar las dos juntas.**
 *
 * v13: `CIRCUITO_LIQUIDO` pasa a 6 puntos en `DEFAULT_CIRCUIT_MATRIX` (cierra en EGRESO).
 *      Antes la matriz tenía 5 y el scoring esperaba 6, así que se reportaba "N de 6" sin
 *      chequear EGRESO nunca. Afecta a journeys líquidos SIN EGRESO: ahora suman un punto
 *      faltante más (baja reliability, puede mover el estado).
 */
export const ETL_TRANSFORM_RULES_VERSION = 'etl_transform_v13'

export type EtlTransformInput = {
  events: RealJourneyEventDto[]
  alerts: RealAlertDto[]
  mergeWindowHours?: number
  loadedEventFilesCount: number
  loadedAlertFilesCount: number
  /** Catálogo manual (servicios, asociados, particulares). Si hay entradas activas, se excluyen de métricas. */
  plateRegistry?: TruckPlateRegistryDocument | null
  /** Archivos XLSX Movimientos por Contrato (opcional). */
  movimientosContratoFiles?: MovimientosContratoFileInput[]
  /** Movimientos ya normalizados (backup por día leído por rango; evita re-parsear XLSX). */
  preNormalizedMovimientos?: import('./etlExternalMovimientosContrato').ExternalMovimientoContratoNormalized[]
  /** Planillas TiemposEntrePasos (balanza SL, opcional). */
  tiemposEntrePasosFiles?: import('./etlTiemposEntrePasos').TiemposEntrePasosFileInput[]
  /** Telemetría opcional Paso 3 (Contract-first). */
  onContractFirstProgress?: import('./etlContractFirstProgress').ContractFirstProgressCallback
}

export type EtlTransformOutput = {
  csv: Record<string, string>
  /** Fase 2: artefactos tipados. Las claves espejan las de csv. Opcional durante migración. */
  tables?: Record<string, import('../../../etl-core/typedTable').TypedTable>
  stats: {
    step1: {
      frontEvents: number
      rearEvents: number
      frontAlerts: number
      rearAlerts: number
      pctExcludedEvents: number
      deviceRearCounts: { device: string; count: number }[]
    }
    plateRegistry: {
      activeExclusionEntries: number
      eventsExcluded: number
      alertsExcluded: number
      uniquePlatesExcluded: number
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
      journeys_cycle_splits_applied: number
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
    executive: {
      periodStart: string
      periodEnd: string
      eventCount: number
      alertCount: number
      completos: number
      incompletos: number
      anomalos: number
      deducidos: number
      validos: number
      probables: number
      journeysMergedApplied: number
      noEvaluables: number
      validComplete: number
      validDeduced: number
      lprAlerts: number
      operationalAlerts: number
      operationalAlertsCrossed: number
      journeysWithInvalidRoute: number
      journeysWithInvalidJourneyStart: number
      incompletosWithOperationalAlert: number
      anomalosWithOperationalAlert: number
      exportReady: boolean
      slFrontEvents: number
      slJourneysWithCorroboration: number
      slJourneysExecutiveReinforced: number
      committeeCompletos: number
      committeeVariaciones: number
      committeeAnomalias: number
      /**
       * Filas de final_circuits cuyas taxonomías paralelas se contradicen entre sí.
       * Debe tender a 0 a medida que todo derive de CircuitVerdict (etl-core/domain).
       */
      taxonomyCoherence: import('../../../etl-core/domain/circuitVerdict').TaxonomyCoherenceReport
    }
    segmentTiming?: SegmentTimingIndex | null
    circuitTiming?: CircuitTimingIndex | null
    kpiTiemposBuilt?: boolean
    movimientosContrato?: {
      enabled: boolean
      logs: string[]
      warnings: string[]
      filesRead: number
      rawCount: number
      normalizedCount: number
      withPlate: number
      withProduct: number
      withPlatform: number
      truckflowJourneys: number
      analysisReadyCount: number
      segmentScatterRows: number
      operationalSampleSelected: number
      merge: Record<string, unknown>
      excelFirst: Record<string, unknown>
      products: string[]
      platforms: string[]
      excelFirstScatterRows?: number
    }
  }
  rulesVersion: string
  /** Entrada para tramo 4 (KPI Tiempos); el contexto la guarda en ref y no la expone en estado. */
  kpiTiemposPrepared?: KpiTiemposBuildInput
}
