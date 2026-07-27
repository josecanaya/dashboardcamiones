# Graph Report - .  (2026-07-26)

## Corpus Check
- Large corpus: 506 files · ~389,681 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4194 nodes · 11170 edges · 186 communities (160 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 157 edges (avg confidence: 0.72)
- Token cost: 269,742 input · 0 output

## Community Hubs (Navigation)
- Circuit Scoring & Classification
- Live Camera Monitor
- Python Agents (ETL client)
- Excel-First Merge Contracts
- Saturation Analytics
- Segment Timing Templates
- Liquid Movements Workbench
- KPI Stats & Flow
- Transform ETL Tab
- Logistics Ops Domain
- Circuit Classification Index
- Committee Classification
- Movimientos Contrato Integration
- Power BI ETL Export
- Real Journey Event Types
- Real Journey Diagnostics
- ETL Transform Pipeline
- KPI Tiempos Build
- Legacy Journey Diagnostics
- San Lorenzo Camera Support
- SL Balanza Rollup KPIs
- Transile Externo Reports
- External Movimientos Contrato
- Power BI Circuit CSV
- Transile Interno Volcable
- Real Truckflow Workspace
- IFC 3D Viewer
- Migration Guide (docs)
- Committee Operational Pipeline
- Excel Camera Comparativa
- RIC-San Lorenzo Route
- Real Alerts Inspector
- Excel Camera Matrix Audit
- Sector Occupancy 30min
- Preliminary Circuit Classify
- Live Camera Diagnostics
- KPI5 Multinivel Donut
- Excel Camera Calibration
- Contract-First Transform Runner
- Truckflow-Movimientos Merge
- Balanza Stay Rollups
- Estadia Chart Export
- Segment Timing Tests
- Local ETL Server
- Real Journey Quality
- Truck Fleet Lookup API
- Data Extraction Tab
- ETL Product Filter
- Truck Route Simulator
- Logistics Data Source
- Power BI Load Consolidation
- NPM Dependencies
- SL Camera Excel-vs-Raw Audit
- Simulator Live Engine
- Analysis Tab & Progress
- Operational Alert Match
- Real Truckflow API Feed
- Tiempos Entre Pasos
- Estadia Forma Distribution
- Trip Engine Selectors
- Segment Timing Charts
- S1 Excel-vs-Raw Audit
- Analytics Page & KPI Matrix
- SL Camera Excel Coverage
- NPM Scripts
- Excel Movimientos Source Audit
- Eventos Truckflow Presentation
- Trip Validation
- Headless ETL Runner
- Segment Slow Tail
- Dev Dependencies
- KPI5 Circuit Utils
- TypeScript Config
- Nearby Alert Research
- Excel Camera Matrix Script
- Simulation Service
- SL/S1 Excel Coverage Audit
- Plate OCR Matching
- Committee Executive CSV
- Simulator State Engine
- Reconstructed Visit Context
- Event Stream Trips
- Camera Power BI Aggregates
- Platform Circuit Inference
- Sites & App Context
- ETL Workbench Context
- Load/Export Tab
- Aceite Executive Circuit
- Anomaly Trucks Script
- Scenario Builder
- Truck Catalog & Raw Generator
- Truck Plate Registry Filter
- Clean Real Dataset
- ETL Refactor Notes (docs)
- Camera Matrix Batch Script
- Anomaly Period Script
- Truck Fleet Store (server)
- Simulator Package Config
- Agent Chat Tab
- Segment Tramo Flow
- Estadia Radar Score
- R7 Aceite Reclassification
- Transile Plate Aliases
- SL Timeline Excel Anchors
- Migration Env Scripts
- SL Funnel Audit
- ETL Profiler
- Truck Event Types
- Plate Registry Modal
- KPI Tiempos Tab
- Contract-First CLI Runner
- Simulator TS Config
- Excel Camera Comparativa Workbench
- SL Exit RIC Return Script
- ETL API Smoke Test
- Ricardone Sector Scatter
- Plant Visit Sync
- March Seed Script
- Simulator Enrichment
- Anomaly Classifier
- Raw Journey Stats
- Calada Variations Audit
- Transform Local Script
- ETL Runs Store
- Simulator Start Script
- Operational Turno
- Journey UID Multi-Day Audit
- Plate Registry Supabase Sync
- March Duration Diversify
- Master Circuit Catalog
- Stable Excel Operation ID
- Balanza Stay Audit
- Plate Registry Server
- R7 Balanza Salida Audit
- ETL Agent Chat (server)
- KPI5 Multinivel View
- Committee ETL Lite Config
- Build Visits
- Circuit Timing Tests
- Simulator Overview (docs)
- SL Ingreso Balanza Drop
- ETL Profile Run Script
- Simulator Stop Script
- Movimientos Contrato Panel
- Raw Journey Stats Server
- Estadia Boxplot
- Executive Circuit Matrix (docs)
- Package Manifest
- Arch Rules Check
- Estadia KPI Grid
- KPI5 Summary Card
- R7 Camera Matrix Script
- Estadia Distribution Panel
- Loading Screen
- CSV Parsing
- Plate API Fetch
- ETL Core Purity (docs)
- Anomalies Types
- Estadia Hero Card
- Event Data
- Python Orchestrator (docs)
- Agentes Package
- Recharts Dep
- web-ifc Dep
- Vite Env Types
- Agentes Setup
- Legacy Preliminary Circuit
- Match Quality Concept
- Route Quality Concept
- Executive Status Concept
- Platform Quick Report
- Agentes Pkg
- TypedTable Concept
- Dashboard README
- Truckflow Expansion Summary
- Committee ETL Lite Tabs
- R7 Calada Wait Const
- SL Balanza Time Correction
- Power BI V1 Headers

## God Nodes (most connected - your core abstractions)
1. `runEtlTransform()` - 95 edges
2. `parseTimestampMs()` - 88 edges
3. `runMovimientosContratoIntegration()` - 78 edges
4. `SiteId` - 69 edges
5. `RealJourneyDiagnosticsPageLegacy()` - 65 edges
6. `recordsToCsv()` - 61 edges
7. `RealJourneyEventDto` - 56 edges
8. `normalizeRealEventPoint()` - 55 edges
9. `normalizePlateStrict()` - 42 edges
10. `parseCsvToRecords()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Problema raíz: dos motores Transform en paralelo (Workbench vs Comité/v2)` --semantically_similar_to--> `Tres clasificadores de circuitos en paralelo (deuda técnica)`  [INFERRED] [semantically similar]
  ETL_PLAN_UNIFICADO.md → PLAN_REFACTOR_ETL_AGENTES.md
- `Contract-first CLI (runMovimientosContratoIntegration vía tsx)` --semantically_similar_to--> `run-etl-headless.ts (runner que persiste)`  [INFERRED] [semantically similar]
  scripts/run-truckflow-transform-local.README.md → docs/migracion/FASE_4_SERVICIO_PERSISTENCIA.md
- `buildExcelFirstReviewSample()` --indirect_call--> `n()`  [INFERRED]
  src/features/real-truckflow/etlWorkbench/etlExcelFirstMerge.ts → scripts/audit-sl-funnel-from-scatter.mjs
- `timeBucketFourHoursLabel()` --indirect_call--> `n()`  [INFERRED]
  src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts → scripts/audit-sl-funnel-from-scatter.mjs
- `buildCircuitEtlV2CsvBundle()` --indirect_call--> `n()`  [INFERRED]
  src/features/real-truckflow/etlWorkbench/powerBiCircuitCsvBundle.ts → scripts/audit-sl-funnel-from-scatter.mjs

## Import Cycles
- 3-file cycle: `src/features/real-truckflow/etlWorkbench/etlExcelMovimientosStep.ts -> src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts -> src/features/real-truckflow/etlWorkbench/etlTransformPhaseStore.ts -> src/features/real-truckflow/etlWorkbench/etlExcelMovimientosStep.ts`
- 3-file cycle: `src/features/real-truckflow/etlWorkbench/etlTransformPhaseStore.ts -> src/features/real-truckflow/etlWorkbench/etlTransformTramo3.ts -> src/features/real-truckflow/etlWorkbench/etlTransformPipeline.ts -> src/features/real-truckflow/etlWorkbench/etlTransformPhaseStore.ts`
- 4-file cycle: `src/etl-core/domain/pipelineTypes.ts -> src/features/real-truckflow/etlWorkbench/etlExcelFirstMerge.ts -> src/features/real-truckflow/etlWorkbench/etlPlatformCircuitInference.ts -> src/etl-core/reports/transileExternoCiclo.ts -> src/etl-core/domain/pipelineTypes.ts`
- 5-file cycle: `src/etl-core/domain/pipelineTypes.ts -> src/features/real-truckflow/etlWorkbench/etlExcelFirstMerge.ts -> src/features/real-truckflow/etlWorkbench/etlCircuitClassificationIndex.ts -> src/features/real-truckflow/etlWorkbench/etlPlatformCircuitInference.ts -> src/etl-core/reports/transileExternoCiclo.ts -> src/etl-core/domain/pipelineTypes.ts`

## Hyperedges (group relationships)
- **Flujo batch ETL (extract → staging → transform → load pb_*)** — server_truckflow_local_server, src_features_real_truckflow_etlworkbench_etlworkbenchcontext, src_features_real_truckflow_etlworkbench_etltransformpipeline, src_features_real_truckflow_etlworkbench_powerbiload [EXTRACTED 1.00]
- **Clasificación en 3 capas (técnica/ejecutiva/comité)** — etl_transform_v9_rules_matrix_final_status, etl_transform_v9_rules_executive_status, etl_transform_v9_rules_committee_group [EXTRACTED 1.00]
- **Tres clasificadores de circuitos en paralelo (deuda técnica)** — src_services_realpreliminarycircuit, src_services_circuitetlv2, src_features_real_truckflow_etlworkbench_finalcircuitscoring [EXTRACTED 1.00]
- **Pipeline de migración por fases (etl-core → agentes)** — docs_migracion_fase_1_etl_core, docs_migracion_fase_2_typed_table, docs_migracion_fase_3_catalogo_unico, docs_migracion_fase_4_servicio_persistencia, docs_migracion_fase_5_agentes_python [EXTRACTED 1.00]
- **Tres clasificadores de circuito paralelos** — docs_migracion_fase_3_catalogo_unico_finalcircuitscoring, docs_migracion_fase_3_catalogo_unico_circuitetlv2, docs_migracion_fase_3_catalogo_unico_realpreliminarycircuit [EXTRACTED 0.90]
- **Flujo de la capa de agentes (chat → tools → etl-api)** — docs_migracion_fase_5_agentes_python_orquestador, docs_migracion_fase_5_agentes_python_subagentes, docs_migracion_fase_5_agentes_python_tools, docs_migracion_fase_5_agentes_python_etl_client, docs_migracion_fase_4_servicio_persistencia_etl_api [EXTRACTED 1.00]

## Communities (186 total, 26 thin omitted)

### Community 0 - "Circuit Scoring & Classification"
Cohesion: 0.06
Nodes (82): Regla líquido vs sólido (RicCalLiq → R8/R16 vs RS_REC/RS_DESP), hasTransileRicardoneEvidence(), resolveCommitteeClassification(), resolveDeducedEvidence(), resolveStrongPointSource(), DEFAULT_CIRCUIT_MATRIX_EXTENSIONS, balanzasBeforeCaladaOrLiquid(), buildReliabilityExplanation() (+74 more)

### Community 1 - "Live Camera Monitor"
Cohesion: 0.05
Nodes (71): LiveCameraMonitor, LiveDetailTab, LiveTableColumn, buildLiveCameraRow(), buildLiveDetections(), buildLiveFeedSectorDeviceBreakdown(), buildLiveSectorSummary(), filterLiveAlertsForView() (+63 more)

### Community 2 - "Python Agents (ETL client)"
Cohesion: 0.05
Nodes (53): create_run(), EtlApiError, EtlClient, get_circuit_catalog(), get_client(), get_summary(), list_runs(), list_tables() (+45 more)

### Community 3 - "Excel-First Merge Contracts"
Cohesion: 0.06
Nodes (72): aggregateJourneyStats(), argentinaDayBoundsMs(), buildEvidenceFromMatches(), buildExcelFirstReviewSample(), buildExcelPeriodContext(), buildPlateIndex(), buildWindowFromOpts(), CANDIDATE_DIAG_HEADERS (+64 more)

### Community 4 - "Saturation Analytics"
Cohesion: 0.06
Nodes (62): detailWindowMs(), SaturationDetailPanel(), SaturationDetailPanelProps, SaturationEpisodesTimelineProps, SaturationExecutiveHeader(), SaturationExecutiveHeaderProps, SaturationHeatmapProps, SaturationNarrative() (+54 more)

### Community 5 - "Segment Timing Templates"
Cohesion: 0.04
Nodes (70): Análisis de tiempos por circuito (circuit_timing_summary / segment_timing_kpi), aggregateFromLegs(), BALANZA_STAY_KPI_ROLLUP_RULE, BALANZA_STAY_ROLLUP_TRANSITION, BalanzaStayCandidateDiagnostic, balanzaStayDiagnosticsToCsv(), BalanzaStayTimedSegmentsInput, BalanzaStayTimingDiagnostic (+62 more)

### Community 6 - "Liquid Movements Workbench"
Cohesion: 0.06
Nodes (68): COHORT_LABELS, isCsvTrue(), LiquidMovementsPanel(), parseSummary(), Props, Row, summaryFromRow(), SlCameraAuditSlot (+60 more)

### Community 7 - "KPI Stats & Flow"
Cohesion: 0.07
Nodes (61): Entidad HistoricalTrip (viaje histórico), KPIs analíticos ampliados (estadía, variabilidad, flujo, densidad), buildFlowPoints(), FlowPoint, FlowSaturationKpi(), generateFlowInsights(), clampDurationMinutes(), getHourFromIso() (+53 more)

### Community 8 - "Transform ETL Tab"
Cohesion: 0.05
Nodes (64): committeePieFromGroup(), ANOMALY_SEQUENCE_CSV_HEADERS, AnomalyListContext, AnomalyReviewSummary, AnomalySequenceBreakdownRow, anomalySequenceSummaryCsv(), buildAnomalyListContextFromTransformCsv(), buildAnomalyReviewSummary() (+56 more)

### Community 9 - "Logistics Ops Domain"
Cohesion: 0.06
Nodes (53): PlantOperationalSummary(), PlantOperationalSummaryProps, KpiCard(), KpiCardProps, TONE_STYLES, FlowSaturationKpiProps, IfcLoadingOverlay(), IfcLoadingOverlayProps (+45 more)

### Community 10 - "Circuit Classification Index"
Cohesion: 0.06
Nodes (66): AnomalyReasonCount, applyExecutiveCircuitCodeToEntry(), BALANZA_LOGICAL_CODES, buildCircuitClassificationIndex(), buildExecutiveCircuitBarSlices(), buildExecutiveEntryFromExcelOperationRow(), CAMERA_PRESERVED_OPERATIONAL_VARIATIONS, CircuitPieSlice (+58 more)

### Community 11 - "Committee Classification"
Cohesion: 0.07
Nodes (62): Buckets de clasificación (completos / incompletos ≤2 lecturas / anómalos), Capa comité committee_group v10 (COMPLETOS/VARIACIONES_OPERATIVAS/ANOMALIAS), Capa técnica matrix_final_status (COMPLETO/DEDUCIDO/INCOMPLETO/ANOMALO), AMBIGUOUS_INFERRED_CODES, AnalysisScope, AnomalyLeg, AnomalyOriginPlant, attachSequenceMatchMeta() (+54 more)

### Community 12 - "Movimientos Contrato Integration"
Cohesion: 0.10
Nodes (52): csvEscapeCell(), recordsToCsv(), formatTransileExternoLog(), transileExternoTables(), transileExternoReclasificacionCsv(), transileExternoReclasificacionTable(), formatTransileInternoVolcableLog(), transileInternoVolcableTables() (+44 more)

### Community 13 - "Power BI ETL Export"
Cohesion: 0.07
Nodes (47): Mapa del backend lógico Transform Truckflow, Uso recomendado — Backend Transform sin UI, Plan de limpieza futura — Transform Truckflow, formatDateTimeShort(), LoadedPeriodSummaryCard(), LoadedPeriodSummaryProps, POWER_BI_STANDARD_EXPORT_ROWS, usePowerBiExport() (+39 more)

### Community 14 - "Real Journey Event Types"
Cohesion: 0.08
Nodes (36): Informe journeyUid abierto en API Truckflow, Bug journeyUid abierto (mismo UID = varios viajes multi-día), Merge automático de journeys fragmentados (gap ≤240min, OCR ≥0.92), PreliminaryCircuitClassification, RealJourneyEventDto, ReconstructedRealJourney, ReconstructedRealJourneyCore, ReconstructedRealJourneyWithQuality (+28 more)

### Community 15 - "Real Journey Diagnostics"
Cohesion: 0.06
Nodes (45): DataDistributionDonut(), Slice, DataQualityFunnel(), Stage, DiagDrawer(), JourneyQuickFilter, PowerBiExportLoadedSummary, RealDataMainTab (+37 more)

### Community 16 - "ETL Transform Pipeline"
Cohesion: 0.08
Nodes (48): Golden master test (fingerprint + hash CSVs), runEtlTransform unificado (orquestador ETL único), Archivos-dios (etlSegmentTiming 5k, etlTransformPipeline 3k LOC), EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES, JourneyMetaForAlertMatch, JourneyOperationalAlertSummary, OPERATIONAL_ALERTS_CSV_COLUMNS, EtlProfiler (+40 more)

### Community 17 - "KPI Tiempos Build"
Cohesion: 0.08
Nodes (49): aggregateCircuitSummary(), buildCircuitTimingIndex(), CircuitTimingIndex, CircuitTimingJourneyRow, circuitTimingJourneysCsv(), circuitTimingSummaryCsv(), CircuitTimingSummaryRow, dominantExecutiveStatus() (+41 more)

### Community 18 - "Legacy Journey Diagnostics"
Cohesion: 0.09
Nodes (50): normalizeRealEventPoint(), buildPreliminaryCircuitDailySummary(), enrichCaladaSanLorenzoConfidence(), buildAlertsChannelQueryNoTimeFilter(), downloadCsv(), exportSimpleBarPng(), getRecentDefaultRange(), INC_PRELIM_FILTERS (+42 more)

### Community 19 - "San Lorenzo Camera Support"
Cohesion: 0.06
Nodes (42): Contrato Power BI / comité — ETL Truckflow, Reglas ETL etl_transform_v9 (+v10/v12), Criterio LPR único (alertCode === 'LPR_MALFUNCTION'), Cámaras traseras excluidas del frente ETL, Apoyo ejecutivo San Lorenzo (refuerza, no reclasifica), Informe ETL Dashboard Truckflow, DEVICE_ALIASES, DEVICE_MAP (+34 more)

### Community 20 - "SL Balanza Rollup KPIs"
Cohesion: 0.10
Nodes (48): argentinaLocalMinutesOfDay(), argentinaLocalParts(), ensureArgentinaOffsetIso(), formatArgentinaIsoFromMs(), hasExplicitTimezone(), normalizeTimestampForExport(), pad2(), parseTimestampMs() (+40 more)

### Community 21 - "Transile Externo Reports"
Cohesion: 0.07
Nodes (39): normalizePlate(), buildTransileExternoReport(), classifyTransileExternoProduct(), detectDeVueltaHeader(), fechaFor(), opInstantMs(), resolvePelletCircuitFromPlatform(), TRANSILE_EXTERNO_CIRCUIT_FAMILIES (+31 more)

### Community 22 - "External Movimientos Contrato"
Cohesion: 0.09
Nodes (42): applySourceDateGuard(), combineDateTime(), dateOnlyKey(), daysFromSourceDate(), excelSerialToDate(), formatIsoLocal(), inferSourceDateFromFileName(), isDayFirstDateString() (+34 more)

### Community 23 - "Power BI Circuit CSV"
Cohesion: 0.09
Nodes (43): buildCircuitEtlV2CsvBundle(), buildOperationalSessionsPlateSite(), buildQualitySummary(), canonicalPlateFromEvents(), CIRCUIT_ETL_V2_FILENAMES, CIRCUIT_MATRICES, CircuitMatrixRule, circuitStatusRankFusion() (+35 more)

### Community 24 - "Transile Interno Volcable"
Cohesion: 0.10
Nodes (35): transileExternoOperationsCsv(), transileExternoSessionsCsv(), transileExternoSummaryCsv(), buildTransileInternoVolcableReport(), clusterVolcableVisits(), evaluateTransileSession(), excelCircuitHintForSession(), fechaArgentina() (+27 more)

### Community 25 - "Real Truckflow Workspace"
Cohesion: 0.10
Nodes (31): GlobalRangeSelector(), STAGE_LABEL, CLASS_BY_STATUS, LABELS, StatusBadge(), TruckPlateRegistryLauncher(), isValidTimeHHMM(), normalizeTimeHHMM() (+23 more)

### Community 26 - "IFC 3D Viewer"
Cohesion: 0.10
Nodes (40): buildCameraSnapshotDataUrl(), buildCircuitsFromCatalog(), buildExpressPointMap(), buildFallbackFloorMapBySector(), buildFloorMapBySector(), buildIfcTagsMap(), circuitCodes(), CircuitColorBuckets (+32 more)

### Community 27 - "Migration Guide (docs)"
Cohesion: 0.07
Nodes (40): Fase 1: Extraer src/etl-core, src/etl-core (núcleo ETL puro), Patrón mover-con-shim (re-export deprecado), Fase 2: TypedTable, TypedTable (intercambio tipado vs CSV strings), Fase 3: Catálogo único de circuitos, CIRCUIT_CATALOG (fuente única de circuitos), circuitEtlV2 (clasificador legacy) (+32 more)

### Community 28 - "Committee Operational Pipeline"
Cohesion: 0.10
Nodes (36): alertTimeMs(), alignAlertsToSegments(), applyTemporalSegmentation(), buildCommitteeOperationalPipeline(), buildExecutiveSummary(), classifyCommitteeOperationalCircuit(), cloneAlertWithJourney(), cloneEventWithJourney() (+28 more)

### Community 29 - "Excel Camera Comparativa"
Cohesion: 0.12
Nodes (32): ExcelCameraComparativaPanel(), Props, cameraCalibrationAggregatesToCsv(), cameraCalibrationDetailToCsv(), missedPlatesByCameraToCsv(), summarizeMissedPlatesByDevice(), AutoCalibrationBrief, buildBrief() (+24 more)

### Community 30 - "RIC-San Lorenzo Route"
Cohesion: 0.14
Nodes (32): collapseConsecutiveEqual(), computeR7LegDurations(), firstIndexOf(), getCollapsedLogicalCodes(), isRicDevice(), isSlLogicalCode(), journeyBlocksSl1ExecutiveClassification(), journeyFrontEvents() (+24 more)

### Community 31 - "Real Alerts Inspector"
Cohesion: 0.10
Nodes (21): isValidArgentinaPlate(), normalizePlate(), ApiRealJourneyEventRow, isValidObservedPlate(), AlertInferenceCategory, AlertsQuickFilter, inferCategory(), normalizeRealAlertForView() (+13 more)

### Community 32 - "Excel Camera Matrix Audit"
Cohesion: 0.12
Nodes (32): auditEventInOperationWindow(), buildExcelCameraMatrix(), CameraMatrixRow, CameraStepSummary, collectOperationWindowEvents(), countRowCapturePoints(), diagnoseBalanzaEgresoPlateSources(), eventLogicalCodeOperational() (+24 more)

### Community 33 - "Sector Occupancy 30min"
Cohesion: 0.13
Nodes (30): buildSectorOccupancy30MinSeries(), computeSectorOccupancyFromScatter(), countStockInitialJourneys(), fechaFromMs(), filterScatterRowsForOccupancyDay(), franjaOperativaFromHour(), FranjaOperativaOccupancy, horaFromMs() (+22 more)

### Community 34 - "Preliminary Circuit Classify"
Cohesion: 0.08
Nodes (35): classifyOperationalPreliminaryCircuit(), classifyPreliminaryRealCircuit(), collapseConsecutiveEqual(), countCode(), countEvidencePoints(), countExcludedRearLogicalPoints(), DESCARTADO_CODES, deviceRouteHintEgreso() (+27 more)

### Community 35 - "Live Camera Diagnostics"
Cohesion: 0.11
Nodes (32): alertInstantMs(), alertIsLpr(), buildCameraDiagnostics(), buildFrontRearRow(), buildOperationalTimeline(), CameraDiagnostics, compareFrontRearCameras(), countInvalidReadings() (+24 more)

### Community 36 - "KPI5 Multinivel Donut"
Cohesion: 0.10
Nodes (32): fmtEntero(), fmtPct(), Kpi5MultinivelDonut(), Kpi5MultinivelDonutProps, LegendRow(), strokeForRing(), MOCK_KPI5_MULTINIVEL_VIEW, KPI5_SEGURIDAD_CHART_COLORS (+24 more)

### Community 37 - "Excel Camera Calibration"
Cohesion: 0.13
Nodes (31): buildCameraCalibrationReport(), buildExcelCameraMatrixDetailed(), CameraMatrixDetailRow, classifyRecognitionSegment(), DayNight, dayNightForMovimiento(), devicesMatchingStep(), DeviceStepSummary (+23 more)

### Community 38 - "Contract-First Transform Runner"
Cohesion: 0.14
Nodes (27): ContractFirstProgressCallback, ContractFirstProgressEvent, ContractFirstStageTiming, countUniqueNormalizedPlates(), emitContractFirstProgress(), runContractFirstStage(), buildOutputAfterExcelOnlyStep(), ExcelMovimientosStepResult (+19 more)

### Community 39 - "Truckflow-Movimientos Merge"
Cohesion: 0.15
Nodes (33): applyExternalCircuitToJourney(), excelAnchorJourneyPriority(), journeyNeedsCircuitFromExcel(), applyMovimientoToRow(), collectCandidatesForJourney(), collectCandidatesForMovimiento(), compareMergeCandidates(), dayKeyFromIso() (+25 more)

### Community 40 - "Balanza Stay Rollups"
Cohesion: 0.17
Nodes (35): buildBalanzaStayFlags(), buildEnrichedTimelineForBalanzaDiagnosis(), buildSlComiteTruckflowContext(), buildTimedLogicalTimelineFromSegments(), CIRCUITS_WITH_BALANZA_STAY_ROLLUP, CIRCUITS_WITH_DISCHARGE_KPI_ROLLUP, collapseTimedPoints(), diagnoseBalanzaStayFromJourney() (+27 more)

### Community 41 - "Estadia Chart Export"
Cohesion: 0.12
Nodes (25): ChartExportButtons(), ChartExportButtonsProps, EstadiaKpiRow(), KpiItemProps, StayStatsForKpi, ChartPoint, EstadiaMetricsAndChart(), EstadiaMetricsAndChartProps (+17 more)

### Community 42 - "Segment Timing Tests"
Cohesion: 0.11
Nodes (30): buildSegmentTimingIndex(), buildSegmentTimingIndexFromExcelFirstSegments(), buildSlBalanzaEgresoComiteScatterPayload(), collapsedFrontLogicalPoints(), collapsedLogicalPointsForDischargeRollup(), extractAllSegmentLegsForCircuit(), extractDischargeRollupLegsFromJourney(), extractSegmentLegs() (+22 more)

### Community 43 - "Local ETL Server"
Cohesion: 0.08
Nodes (26): annotateRunManifest(), app, buildListUrl(), DATA_ROOT, daysInclusive(), __dirname, ensureDir(), ETL_HEADLESS_SCRIPT (+18 more)

### Community 44 - "Real Journey Quality"
Cohesion: 0.10
Nodes (30): lookupRealSectorCode(), REAL_SECTOR_CODE_MAP, RealSectorMappingEntry, RealSectorMapSiteId, UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER, buildCameraCoverageSummary(), buildEmptyHours(), CameraCoverageArchiveMeta (+22 more)

### Community 45 - "Truck Fleet Lookup API"
Cohesion: 0.12
Nodes (25): CamionProfile, FleetPlateLookupResult, PlantVisitProductOrigin, PlantVisitSource, PlantVisitUpsertInput, VisitaPlanta, TRUCK_PLATE_REGISTRY_CATEGORY_LABELS, fetchFleetStorageStatus() (+17 more)

### Community 46 - "Data Extraction Tab"
Cohesion: 0.11
Nodes (28): getTruckflowListDays(), parseJson(), postTruckflowExportOneDay(), postTruckflowExportPeriod(), postTruckflowExportWindow(), postTruckflowJourneyStatsPeriod(), TruckflowApiJourneyDayStat, TruckflowExportDayResult (+20 more)

### Community 47 - "ETL Product Filter"
Cohesion: 0.13
Nodes (30): ExecutiveSampleProductFilter(), Props, appendPermittedAceiteExcelOrphansToEntries(), buildAceiteCircuitResolutionDebugCsv(), enforceLiquidExcelExecutiveCircuits(), EXCEL_FIRST_RECONCILABLE_MATCH, excelOpsHasData(), excelOpsRows() (+22 more)

### Community 48 - "Truck Route Simulator"
Cohesion: 0.10
Nodes (27): PlantId, TruckIcon(), SPEEDS, STATION_LABELS, StationState, TruckRouteSimulator(), TruckRouteSimulatorProps, useAnimateRoute() (+19 more)

### Community 49 - "Logistics Data Source"
Cohesion: 0.12
Nodes (30): LogisticsOpsProviderInner(), configureLogisticsDataSource(), DataSourceConfig, EGRESO_SECTORS_BY_SITE, ExternalAlert, ExternalEnrichedEvent, ExternalHistoricalTrip, ExternalTruckInPlant (+22 more)

### Community 50 - "Power BI Load Consolidation"
Cohesion: 0.11
Nodes (28): Contrato de salida pb_* (comité / Power BI), Cruce alertas operativas (INVALID_ROUTE/INVALID_START_JOURNEY), appendLoadMeta(), buildFolderName(), buildPowerBiZipName(), classifyFileName(), CommitteeGroup, consolidatePowerBiLoad() (+20 more)

### Community 51 - "NPM Dependencies"
Cohesion: 0.07
Nodes (29): cors, dotenv, express, fflate, framer-motion, html-to-image, jspdf, dependencies (+21 more)

### Community 52 - "SL Camera Excel-vs-Raw Audit"
Cohesion: 0.09
Nodes (25): assertReadableFile(), auditRows, csvPath, csvRowToJourneyEvent(), { events, sourceLabel }, eventsPath, flagged, {
  fromDay,
  toDay,
  porDispositivo,
  incluirTraseras,
  incluirLiquidos,
  todasFilas,
  positional,
} (+17 more)

### Community 53 - "Simulator Live Engine"
Cohesion: 0.12
Nodes (26): CAMERA_BY_PLANT_AND_SECTOR, CIRCUITOS_POR_PLANTA, EGRESO_SECTORS_BY_PLANT, elegirCircuito(), factorHorario(), INGRESOS_POR_HORA, ingresosPorTick(), MOCK_DATA_ROOT (+18 more)

### Community 54 - "Analysis Tab & Progress"
Cohesion: 0.12
Nodes (23): cardBorder(), Props, statusLabel(), TRAMO_META, TransformPhaseStepper(), formatElapsed(), Props, TRAMO_LABEL (+15 more)

### Community 55 - "Operational Alert Match"
Cohesion: 0.13
Nodes (28): accumulateOperationalAlertsMatch(), alertTimeMs(), alertWithinJourneyWindow(), attachExecutiveBucketsToOperationalAlertRows(), computeOperationalAlertCrossMetrics(), crossOperationalAlerts(), CrossOperationalAlertsResult, emptyJourneyOperationalAlertSummary() (+20 more)

### Community 56 - "Real Truckflow API Feed"
Cohesion: 0.15
Nodes (26): buildFixedHourChunks(), fetchAlertsAdaptive(), fetchAlertsOneChunk(), fetchEventsAdaptive(), fetchEventsOneChunk(), fetchLiveRangeMerged(), LiveChunkFetchStats, LiveTimeChunk (+18 more)

### Community 57 - "Tiempos Entre Pasos"
Cohesion: 0.13
Nodes (25): xlsx, buildTiemposEntrePasosIndex(), cellStr(), classifyContratoXlsxFromHeaders(), ContratoXlsxKind, findTepHeaderRow(), headerFieldMap(), isInTiemposEntrePasosOverrideWindow() (+17 more)

### Community 58 - "Estadia Forma Distribution"
Cohesion: 0.12
Nodes (22): ChartPoint, EstadiaHistogramWithRefs(), EstadiaHistogramWithRefsProps, resolveHistogramDomain(), EstadiaRadarChartForma(), EstadiaRadarChartFormaProps, ESTADIA_FORMA_RADAR_THRESHOLDS, FormaRadarMetricKey (+14 more)

### Community 59 - "Trip Engine Selectors"
Cohesion: 0.17
Nodes (21): buildTripSummaryFromEvents(), VisitKeyResult, BarItem, bucketStatus(), DisplayStatus, filterVisitsByStatus(), getEntryTimeMinutes(), getExitTime() (+13 more)

### Community 60 - "Segment Timing Charts"
Cohesion: 0.13
Nodes (23): colorForFranja(), FRANJA_HORARIA_COLORS, FRANJA_HORARIA_ORDER, FRANJA_HORARIA_WINDOWS, FranjaHoraria, isWithinSegmentScatterDisplayMax(), SEGMENT_SCATTER_DISPLAY_MAX_MINUTES, scatterRowsToChartVisibleExport() (+15 more)

### Community 61 - "S1 Excel-vs-Raw Audit"
Cohesion: 0.10
Nodes (23): assertReadableFile(), auditRows, csvPath, csvRowToJourneyEvent(), { events, sourceLabel }, eventsPath, flagged, { fromDay, toDay, positional } (+15 more)

### Community 62 - "Analytics Page & KPI Matrix"
Cohesion: 0.17
Nodes (22): KpiCircuitFilterBar(), KpiCircuitFilterBarProps, circuitsForPlantOperation(), collectLegacyBases(), extraMatrixCodesFromTrips(), filterTripsForKpiContext(), KPI_OPERATION_LABELS, KpiMatrixPlant (+14 more)

### Community 63 - "SL Camera Excel Coverage"
Cohesion: 0.14
Nodes (23): listSanLorenzoInstalledCameras(), collectVolcableVisitsFromClassified(), collectVolcableVisitsFromRaw(), isVolcableTransileDevice(), auditEventInstantsMs(), auditExcelOperationsAgainstSlCameraSlots(), buildPerDeviceAuditSlots(), buildSlKpiCameraAuditSlots() (+15 more)

### Community 64 - "NPM Scripts"
Cohesion: 0.08
Nodes (26): scripts, build, check:arch, contract-first:local, db:migrate:etl-runs, db:migrate:plate-registry, db:sync:plate-registry, dev (+18 more)

### Community 65 - "Excel Movimientos Source Audit"
Cohesion: 0.20
Nodes (21): dayKeyFromSalida(), assertNotScatterCsvForRawAudit(), buildExcelMovimientosUniverse(), classifyRawAuditCircuit(), computeExcelPeriodTotals(), ctgKeyForMovimiento(), describeExcelUniverse(), ExcelUniverseStats (+13 more)

### Community 66 - "Eventos Truckflow Presentation"
Cohesion: 0.17
Nodes (21): EventosTruckflowPresentation(), formatDateOnly(), formatDt(), Props, ACCENT, ExecCardAccent, ExecutiveMetricCard(), HorizontalBarChart() (+13 more)

### Community 67 - "Trip Validation"
Cohesion: 0.16
Nodes (20): TripResult, CaladaResult, CircuitLetter, CircuitStep, EVENT_TO_LETTER, eventsToCircuit(), getCaladaResult(), getCaladaResultFromRaw() (+12 more)

### Community 68 - "Headless ETL Runner"
Cohesion: 0.12
Nodes (19): Args, loadEventsFromFile(), main(), makeRunId(), parseArgs(), persistTables(), printHelp(), writeCatalog() (+11 more)

### Community 69 - "Segment Slow Tail"
Cohesion: 0.13
Nodes (20): CHART_VISIBLE_EXPORT_HEADERS, chartVisibleExportCsv(), ChartVisibleExportRow, downloadChartVisibleCsv(), downloadSlowTailCsv(), isStrictTruckflowScatterRow(), legsToChartVisibleExport(), legsToSlowTailExport() (+12 more)

### Community 70 - "Dev Dependencies"
Cohesion: 0.09
Nodes (23): autoprefixer, concurrently, devDependencies, autoprefixer, concurrently, postcss, tailwindcss, @types/react (+15 more)

### Community 71 - "KPI5 Circuit Utils"
Cohesion: 0.12
Nodes (22): findCircuitByCode(), getCircuitsForSite(), circuitsForKpi5(), COLORS_BINARIO, COLORS_CLASIFICACION, computeKpi5Data(), destinoLabel(), foldDestinoSlices() (+14 more)

### Community 72 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2020, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib (+13 more)

### Community 73 - "Nearby Alert Research"
Cohesion: 0.12
Nodes (20): classifyAlert(), findSimilarPlateReadings(), investigateNearbyAlerts(), levenshtein(), NearbyAlertClassification, NearbyAlertInvestigation, NearbyAlertMatch, NEXT_BALANZA_DEVICES (+12 more)

### Community 74 - "Excel Camera Matrix Script"
Cohesion: 0.12
Nodes (17): circuitCode, eventsPath, excelPath, { fromDay, toDay, minPuntos, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), loadMovimientosContratoFromPath() (+9 more)

### Community 75 - "Simulation Service"
Cohesion: 0.19
Nodes (16): resetLive(), DASHBOARD_MOCK_DATA, writeOutputJson(), getGeneratedAt(), getSharedTruckImageUrl(), runSimulation(), getScenarioArg(), hasResetArg() (+8 more)

### Community 76 - "SL/S1 Excel Coverage Audit"
Cohesion: 0.20
Nodes (18): auditExcelOperationsAgainstRawS1(), ExcelOperationLike, excelWindowMs(), findS1InWindow(), indexS1EventsByPlate(), isRawS1Event(), normalizePlateKey(), operationalInstantIso() (+10 more)

### Community 77 - "Plate OCR Matching"
Cohesion: 0.20
Nodes (15): createPlateMatchCache(), ensurePlateMatchCacheRoom(), PlateMatchCache, plateMatchCacheSize(), PlateMatchKind, plateMatchKindCached(), prunePlateMatchCache(), bestPlateBetweenSessions() (+7 more)

### Community 78 - "Committee Executive CSV"
Cohesion: 0.18
Nodes (19): recommendedActionForCameraStatus(), buildCameraCommitteeStatusRows(), buildCircuitCoverageRows(), buildCommitteeExecutiveCsvPack(), buildCommitteeSummaryRow(), buildDssVsTruckflowRows(), CommitteeExecutiveCsvPack, criticidadFromEstado() (+11 more)

### Community 79 - "Simulator State Engine"
Cohesion: 0.17
Nodes (17): CIRCUIT_BY_CODE, CIRCUIT_TEMPLATES, CIRCUITS, PLANTS, SL_AV_CIRCUITS, buildStateAndAlerts(), classifyTrip(), minutesBetween() (+9 more)

### Community 80 - "Reconstructed Visit Context"
Cohesion: 0.14
Nodes (15): VisitDetailModal(), VisitDetailModalProps, VisitPickerSimple(), VisitPickerSimpleProps, DataContext, DataContextValue, SimulatorVisitContext, SimulatorVisitContextValue (+7 more)

### Community 81 - "Event Stream Trips"
Cohesion: 0.21
Nodes (17): buildStory(), buildTripFromEvents(), buildTripsFromEventStream(), formatTime(), getDateBucket(), getVisitKey(), getVisitKeyWithMeta(), normalizeEventTypeFromRaw() (+9 more)

### Community 82 - "Camera Power BI Aggregates"
Cohesion: 0.21
Nodes (18): rowGet(), addMetrics(), BucketBase, buildCameraPowerBiAggregates(), buildCameraSummaryRows(), buildDayNightSummaryRows(), buildSectorCameraSummaryRows(), cameraAggregateStatus() (+10 more)

### Community 83 - "Platform Circuit Inference"
Cohesion: 0.17
Nodes (14): normalizePlant(), circuitFromCode(), inferAceiteLiquidExecutiveCircuit(), inferCircuitFromExternalMovimiento(), InferredExecutiveCircuit, isSanLorenzoVolcablePtoPlatform(), journeyNeedsOperationalEnrichmentFromStatus(), EXCEL_RICARDONE() (+6 more)

### Community 84 - "Sites & App Context"
Cohesion: 0.16
Nodes (11): DataProvider(), SiteContext, SiteContextValue, SiteProvider(), getSite(), getSiteIdFromStorage(), setSiteIdInStorage(), Site (+3 more)

### Community 85 - "ETL Workbench Context"
Cohesion: 0.18
Nodes (16): postTruckflowLoadLocalPeriod(), createTransformPhaseSession(), buildLoadSummary(), Ctx, dedupeKeyAlert(), dedupeKeyEvent(), EtlLoadSummary, EtlWorkbenchContext (+8 more)

### Community 86 - "Load/Export Tab"
Cohesion: 0.17
Nodes (15): KEY_ALIASES, normKey(), parseDssReferenceCsv(), DssReferenceMetrics, loadedDayFromTransformResult(), LoadedTransformDay, LoadGroupType, mergeLoadedDays() (+7 more)

### Community 87 - "Aceite Executive Circuit"
Cohesion: 0.18
Nodes (19): excelLiteIsLiquidOperational(), GENERIC_INFERRED_CIRCUIT_CODES, inferExecutiveCircuitFromExcelPlatform(), LIQUID_EXECUTIVE_CIRCUITS, normalizeLiquidExecutiveCircuitCode(), pickExecutiveCircuitFromExcelFirst(), resolveExecutiveCircuitForExcelOperation(), resolveExecutiveCircuitFromExcelLite() (+11 more)

### Community 88 - "Anomaly Trucks Script"
Cohesion: 0.11
Nodes (12): anomalies, completeAnomalies, debug, events, groupCounts, noRespeta, parsed, plateByJourney (+4 more)

### Community 89 - "Scenario Builder"
Cohesion: 0.36
Nodes (17): CIRCUIT_BY_PLANT_AND_CODE, TRUCKS, buildAnomaliesScenario(), buildHighLoadScenario(), buildLiveBatch(), buildMarchFullScenario(), buildNormalScenario(), buildScenario() (+9 more)

### Community 90 - "Truck Catalog & Raw Generator"
Cohesion: 0.14
Nodes (16): buildTrucksForPlant(), CARGO_TYPES, CIRCUIT_CODES, DRIVERS, generatePlate(), PLANTS, TRUCK_BY_ID, deterministicPick() (+8 more)

### Community 91 - "Truck Plate Registry Filter"
Cohesion: 0.23
Nodes (13): buildRegistryLookup(), normalizeRegistryPlate(), TruckPlateRegistryDocument, TruckPlateRegistryEntry, filterAlertsByPlateRegistry(), filterEventsByPlateRegistry(), filterJourneysByPlateRegistry(), lookupPlateExclusion() (+5 more)

### Community 92 - "Clean Real Dataset"
Cohesion: 0.20
Nodes (17): AlertIndex, attachAlertsToEvents(), buildAlertIndex(), BuildCleanDatasetOptions, buildCleanRealDataset(), DEFAULT_OPTIONS, EventWithAlertInfo, isCloseTime() (+9 more)

### Community 93 - "ETL Refactor Notes (docs)"
Cohesion: 0.13
Nodes (17): FASE 0 — Red de seguridad (migración), Contract-first / Excel-first backend (conciliación Movimientos por Contrato), Plan ETL unificado — Datos reales Truckflow, Problema raíz: dos motores Transform en paralelo (Workbench vs Comité/v2), Análisis Excel-first (Excel=verdad operativa, Truckflow=evidencia física), Secuencia R7 San Lorenzo (S0→S1→S5→S7), Catálogo San Lorenzo (12 cámaras, sectores S0–S7), Escenarios de datos (live / march_full / normal) (+9 more)

### Community 94 - "Camera Matrix Batch Script"
Cohesion: 0.15
Nodes (15): CIRCUITS, eventsPath, excelPath, { fromDay, toDay, minPuntos, outDir, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), parseCli() (+7 more)

### Community 95 - "Anomaly Period Script"
Cohesion: 0.12
Nodes (12): cacheDir, cachePath, candidates, debug, exportPath, exportRows, hasLogical(), missingBalanzaPattern() (+4 more)

### Community 96 - "Truck Fleet Store (server)"
Cohesion: 0.20
Nodes (11): supabasePublicHost(), createTruckFleetRouter(), createJsonFleetStore(), createSupabaseFleetStore(), FUENTE_OK, normalizePlate(), passesCamionPlateDbConstraint(), PRODUCTO_ORIGEN_OK (+3 more)

### Community 97 - "Simulator Package Config"
Cohesion: 0.12
Nodes (16): description, devDependencies, tsx, @types/node, typescript, typescript, name, private (+8 more)

### Community 98 - "Agent Chat Tab"
Cohesion: 0.22
Nodes (13): EtlAgentChatMessage, EtlAgentChatResponse, EtlAgentStatus, EtlAgentUiPayload, etlApiPrefix(), getEtlAgentStatus(), parseJson(), postEtlAgentChat() (+5 more)

### Community 99 - "Segment Tramo Flow"
Cohesion: 0.30
Nodes (13): triggerBrowserCsvDownload(), collectRowFechas(), computeSegmentTramoHourlyFlow(), countSegmentTramoFlowPlacement(), fechaFromIso(), hourFromIso(), pad2(), resolveFechaEnCalendario() (+5 more)

### Community 100 - "Estadia Radar Score"
Cohesion: 0.23
Nodes (11): EstadiaRadarChart(), EstadiaRadarChartProps, ESTADIA_RADAR_THRESHOLDS, RadarMetricKey, RadarThreshold, buildMergedRadarDataset(), buildRadarDataset(), computeNormalizedScore() (+3 more)

### Community 101 - "R7 Aceite Reclassification"
Cohesion: 0.23
Nodes (16): operationalDayKeyFromIso(), aceiteTruckflowHaystackFromEntry(), applyExcelFirstReconciliation(), entryAceiteTruckflowExecutiveCode(), entryChangedByExcelFirst(), entryLooksLikeRicSanLorenzoRouteLabel(), excelFirstMatchRank(), excelLiteMatchesEntrySite() (+8 more)

### Community 102 - "Transile Plate Aliases"
Cohesion: 0.35
Nodes (14): parseVariantsLine(), Props, TransilePlateAliasesPanel(), DEFAULT_TRANSILE_PLATE_ALIASES, loadTransilePlateAliases(), loadUserTransilePlateAliasesOnly(), looksLikeVolcablePlateKey(), mergeTransilePlateAliasLists() (+6 more)

### Community 103 - "SL Timeline Excel Anchors"
Cohesion: 0.17
Nodes (16): enrichSlTimelineForSalidaEgresoRollup(), enrichSlTimelineWithExcelAnchors(), enrichSlTimelineWithExcelSalida(), inferC16TransitMidpoint(), inferMidpointBetweenMs(), inferSlBalanzaSalidaBeforeExcelSalida(), inferSlBalanzaSalidaFromTransit(), injectSlBalanzaFromTiemposEntrePasos() (+8 more)

### Community 104 - "Migration Env Scripts"
Cohesion: 0.13
Nodes (12): client, __dirname, PROJECT_ROOT, SQL_PATH, url, client, __dirname, PROJECT_ROOT (+4 more)

### Community 105 - "SL Funnel Audit"
Cohesion: 0.15
Nodes (13): loadMovimientosFromExcelPath(), byOp, hasLeg(), header, lines, n(), ops, R7 (+5 more)

### Community 106 - "ETL Profiler"
Cohesion: 0.21
Nodes (11): outArg, payload, profiler, t0, createEtlProfiler(), EtlProfilerSpan, getGlobalEtlProfiler(), heapMb() (+3 more)

### Community 107 - "Truck Event Types"
Cohesion: 0.16
Nodes (13): NormalizedEvent, CargoForm, DocRef, DocRefType, EventType, LabResultStatus, LocationKey, ProductType (+5 more)

### Community 108 - "Plate Registry Modal"
Cohesion: 0.30
Nodes (13): TruckPlateRegistryCategory, getTruckflowHealth(), localApiPrefix(), createTruckPlateRegistryEntry(), deleteTruckPlateRegistryEntry(), getTruckPlateRegistry(), lookupTruckPlateRegistry(), parseJson() (+5 more)

### Community 109 - "KPI Tiempos Tab"
Cohesion: 0.22
Nodes (13): ProductFilterSelect(), Props, JourneyProductLookup, parseSegmentScatterByDayCsv(), legsForAggregate(), countUniqueOperationsForCircuit(), filterSegmentTimingIndex(), kpiCircuitCodesForScatterFilter() (+5 more)

### Community 110 - "Contract-First CLI Runner"
Cohesion: 0.19
Nodes (12): ContractFirstCliArgs, dayRange(), __dirname, main(), MIN_OUTPUT_FILES, parseContractFirstCliArgv(), PROJECT_ROOT, runContractFirstCli() (+4 more)

### Community 111 - "Simulator TS Config"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule, rootDir (+5 more)

### Community 112 - "Excel Camera Comparativa Workbench"
Cohesion: 0.22
Nodes (11): CameraCalibrationReport, RAW_AUDIT_CIRCUIT_CODES, realJourneyEventDtoToCameraAuditRow(), RouteRecognitionSummary, ExcelPeriodTotals, MovimientoContratoLike, parseNormalizedMovimientosCsvRow(), buildExcelCameraComparativaReport() (+3 more)

### Community 113 - "SL Exit RIC Return Script"
Cohesion: 0.15
Nodes (8): byDay, DEFAULT_JSON, events, hits, outDir, outPath, root, stamp

### Community 114 - "ETL API Smoke Test"
Cohesion: 0.31
Nodes (12): DEFAULT_PORT, __dirname, fail(), fetchJson(), getFreePort(), main(), ok(), ping() (+4 more)

### Community 115 - "Ricardone Sector Scatter"
Cohesion: 0.32
Nodes (8): CrossCircuitSectorSummary, filterScatterByDayForSector(), legsForCrossCircuitSector(), RICARDONE_CROSS_CIRCUIT_SECTORS, RicardoneCrossCircuitSector, summarizeCrossCircuitSectorFromScatter(), buildChartData(), RicardoneSectorScatterPanel()

### Community 116 - "Plant Visit Sync"
Cohesion: 0.36
Nodes (10): buildPlantVisitUpsertsFromTransform(), buildTimesByJourney(), dayKeyFromIso(), fuenteFromMerge(), mapPlanta(), persistPlantVisitsFromTransform(), plateOkForFleet(), productOriginFromMerge() (+2 more)

### Community 117 - "March Seed Script"
Cohesion: 0.23
Nodes (11): { execSync }, fs, getISOWeek(), main(), MOCK_ROOT, path, PLANTS, processScenario() (+3 more)

### Community 118 - "Simulator Enrichment"
Cohesion: 0.21
Nodes (9): CAMERA_BY_ID, CAMERA_BY_SECTOR, CAMERAS, PLANT_PREFIX, SECTOR_TEMPLATE, TRUCK_BY_PLATE, enrichEvents(), getTruckByPlateMap() (+1 more)

### Community 119 - "Anomaly Classifier"
Cohesion: 0.23
Nodes (10): AnomalyKind, AnomalyReason, AnomalyVerdict, classifyAnomaly(), ClassifyAnomalyInput, ExecutiveStatusLike, isBehavioralAnomaly(), MatrixFinalStatusLike (+2 more)

### Community 120 - "Raw Journey Stats"
Cohesion: 0.32
Nodes (9): ApiJourneyCountByDayTable(), Props, countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), enrichApiJourneyStatsFromRawEvents(), normalizeApiJourneyDayStat(), RawJourneyCountByOccurredDay, rawJourneyUidFromRecord() (+1 more)

### Community 121 - "Calada Variations Audit"
Cohesion: 0.18
Nodes (7): debugRows, finalRows, idx, idxByType, idxCalada, idxVars, root

### Community 122 - "Transform Local Script"
Cohesion: 0.27
Nodes (10): dayFilesOk(), dayRange(), DEFAULT_DATA_ROOT, DEFAULT_OUT, __dirname, main(), parseArgs(), printHelp() (+2 more)

### Community 123 - "ETL Runs Store"
Cohesion: 0.27
Nodes (8): __dirname, PROJECT_ROOT, RUNS_ROOT, listEtlRunsFromSupabase(), readJson(), uploadEtlRunFromDisk(), uploadObject(), createServerSupabaseClient()

### Community 124 - "Simulator Start Script"
Cohesion: 0.18
Nodes (9): child, forwardArgs, fs, path, pidFile, rootDir, runDir, { spawn } (+1 more)

### Community 125 - "Operational Turno"
Cohesion: 0.27
Nodes (9): DayNight, dayNightLabelFromIso(), hourArgentina(), Turno, TURNO_SCATTER_COLORS, TURNO_SCATTER_WINDOWS, turnoForMovimiento(), turnoFromIso() (+1 more)

### Community 126 - "Journey UID Multi-Day Audit"
Cohesion: 0.18
Nodes (9): ae785cs, byUid, crossDayPattern, csvPath, __dirname, hdr, lines, multi (+1 more)

### Community 127 - "Plate Registry Supabase Sync"
Cohesion: 0.20
Nodes (8): activePlates, __dirname, doc, entries, PROJECT_ROOT, REGISTRY_FILE, supabase, toInsert

### Community 128 - "March Duration Diversify"
Cohesion: 0.29
Nodes (9): diversifyTrip(), fs, getISOWeek(), main(), MOCK_ROOT, normalFromUniform(), path, PLANTS (+1 more)

### Community 129 - "Master Circuit Catalog"
Cohesion: 0.22
Nodes (9): classifyCircuitBySequence(), MASTER_CIRCUIT_CATALOG, MasterCircuitGroup, MasterCircuitItem, MasterPlantCatalog, normalizeCameraId(), SL_RECEPCION_BASE, SL_RECEPCION_ESPERA_PLAYA (+1 more)

### Community 130 - "Stable Excel Operation ID"
Cohesion: 0.40
Nodes (8): stableExternalHash(), buildStableExcelOperationId(), dayFromIso(), isPlaceholderExcelOperationId(), isValidExcelCtg(), sanitizeIdToken(), StableExcelOperationIdInput, timeFromIso()

### Community 131 - "Balanza Stay Audit"
Cohesion: 0.22
Nodes (6): diagnostics, flagged, groups, ready, root, rows

### Community 132 - "Plate Registry Server"
Cohesion: 0.33
Nodes (4): CATEGORIES, createTruckPlateRegistryRouter(), createJsonPlateRegistryStore(), createSupabasePlateRegistryStore()

### Community 133 - "R7 Balanza Salida Audit"
Cohesion: 0.25
Nodes (5): diagnostics, flagged, groups, root, rows

### Community 134 - "ETL Agent Chat (server)"
Cohesion: 0.29
Nodes (4): createEtlAgentChat(), SUBAGENTS, TOOLS, SUBAGENT_SKILLS

### Community 135 - "KPI5 Multinivel View"
Cohesion: 0.50
Nodes (7): fmtEnteroEs(), Kpi5(), productLabel(), buildKpi5ProductFilterOptions(), computeKpi5SecurityView(), getTripProductLabel(), computeKpi5MultinivelView()

### Community 136 - "Committee ETL Lite Config"
Cohesion: 0.25
Nodes (7): COMMITTEE_ETL_LITE_MODE, ETL_DEV_TAB_IDS, ETL_MAIN_TAB_IDS, ETL_OPTIONAL_MANIFEST, ETL_PRODUCT_TAB_IDS, POWER_BI_PRODUCT_FILES, REAL_DATA_APP_MODE

### Community 137 - "Build Visits"
Cohesion: 0.43
Nodes (7): buildVisits(), computeMetrics(), computeStatus(), EVENT_TYPE_ORDER, eventTypeSortOrder(), getDateBucket(), makeVisitKey()

### Community 138 - "Circuit Timing Tests"
Cohesion: 0.32
Nodes (4): aggregateCircuitTimingSummaries(), circuitTimingJourneysFromCsvRows(), ClassifiedJourneyForCircuitTiming, isValidCircuitTotalDuration()

### Community 139 - "Simulator Overview (docs)"
Cohesion: 0.29
Nodes (7): index.html (shell del dashboard), Estrategia de datos históricos (archivos por planta), Plan simulador en vivo (3 plantas en tiempo real), Simulador logístico mock (independiente), Escenario live (servicio, acumula histórico), Regla RAW vs ENRICHED (eventos cámara ANPR), Datos de ejemplo (samples CSV de importación)

### Community 140 - "SL Ingreso Balanza Drop"
Cohesion: 0.29
Nodes (5): byOp, counts, R7, root, rows

### Community 141 - "ETL Profile Run Script"
Cohesion: 0.29
Nodes (6): args, __dirname, env, result, root, tsEntry

### Community 142 - "Simulator Stop Script"
Cohesion: 0.29
Nodes (5): fs, path, pid, pidFile, rootDir

### Community 143 - "Movimientos Contrato Panel"
Cohesion: 0.33
Nodes (5): parseCsvToRecords(), MERGE_EXPORTS, MovimientosContratoPanel(), WbSlice, EtlDiskPeriod

### Community 144 - "Raw Journey Stats Server"
Cohesion: 0.60
Nodes (5): buildApiJourneyDayStat(), countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), occurredAtLocalDayKey(), rawJourneyUidFromRecord()

### Community 145 - "Estadia Boxplot"
Cohesion: 0.53
Nodes (5): assignRows(), BoxplotStats, EstadiaBoxplot(), resolveTimelineScale(), toPct()

### Community 146 - "Executive Circuit Matrix (docs)"
Cohesion: 0.40
Nodes (5): EXECUTIVE_CIRCUIT_MATRIX (R1..R34, cobertura, punto fuerte), Catálogo de circuitos definido 4 veces → unificar (R* clave única), Audit matriz cámaras R1/R5/R6/R7 (Excel batch), Audit matriz R1 por cámara, Audit matriz R5 por cámara

### Community 147 - "Package Manifest"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 148 - "Arch Rules Check"
Cohesion: 0.40
Nodes (3): ETLWORKBENCH_IMPORT_BASELINE, ROOT, violations

### Community 150 - "KPI5 Summary Card"
Cohesion: 0.60
Nodes (4): fmtEntero(), Kpi5MultinivelSummaryCard(), Kpi5MultinivelSummaryCardProps, Kpi5MultinivelInsight

### Community 151 - "R7 Camera Matrix Script"
Cohesion: 0.50
Nodes (3): child, dir, script

### Community 155 - "Plate API Fetch"
Cohesion: 0.50
Nodes (3): byUid, out, outPath

### Community 156 - "ETL Core Purity (docs)"
Cohesion: 0.67
Nodes (3): check-arch-rules.mjs (freeze etlWorkbench + pureza etl-core), Separación browser vs funciones puras (DOM/Vite fuera del core lógico), src/etl-core: paquete TS puro (cero React/DOM/side-effects)

## Knowledge Gaps
- **933 isolated node(s):** `agentes`, `name`, `private`, `version`, `type` (+928 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SiteId` connect `Logistics Ops Domain` to `Master Circuit Catalog`, `Live Camera Monitor`, `Saturation Analytics`, `KPI5 Multinivel Donut`, `KPI5 Multinivel View`, `KPI Stats & Flow`, `Build Visits`, `KPI5 Circuit Utils`, `Truck Event Types`, `Reconstructed Visit Context`, `Event Stream Trips`, `Logistics Data Source`, `Sites & App Context`, `Real Truckflow API Feed`, `IFC 3D Viewer`, `Analytics Page & KPI Matrix`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `RealJourneyEventDto` connect `Real Journey Event Types` to `Circuit Scoring & Classification`, `Live Camera Monitor`, `Circuit Classification Index`, `Power BI ETL Export`, `Movimientos Contrato Panel`, `ETL Transform Pipeline`, `Real Journey Diagnostics`, `Legacy Journey Diagnostics`, `San Lorenzo Camera Support`, `Power BI Circuit CSV`, `Real Truckflow Workspace`, `Committee Operational Pipeline`, `Excel Camera Comparativa`, `Real Alerts Inspector`, `Excel Camera Matrix Audit`, `Preliminary Circuit Classify`, `Live Camera Diagnostics`, `Contract-First Transform Runner`, `Real Journey Quality`, `Operational Alert Match`, `Real Truckflow API Feed`, `Eventos Truckflow Presentation`, `Headless ETL Runner`, `ETL Workbench Context`, `Truck Plate Registry Filter`, `Clean Real Dataset`, `Excel Camera Comparativa Workbench`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `dependencies` connect `NPM Dependencies` to `Tiempos Entre Pasos`, `Package Manifest`, `web-ifc Dep`, `Recharts Dep`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `runEtlTransform()` (e.g. with `flattenAlertForEtlCsv()` and `getAlertApiCode()`) actually correct?**
  _`runEtlTransform()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `RealJourneyDiagnosticsPageLegacy()` (e.g. with `j()` and `missingExpectedPoints()`) actually correct?**
  _`RealJourneyDiagnosticsPageLegacy()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `agentes`, `name`, `private` to the rest of the system?**
  _933 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Circuit Scoring & Classification` be split into smaller, more focused modules?**
  _Cohesion score 0.05934242181234964 - nodes in this community are weakly interconnected._