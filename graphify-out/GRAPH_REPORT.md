# Graph Report - .  (2026-08-04)

## Corpus Check
- 455 files · ~382,011 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4014 nodes · 10734 edges · 182 communities (161 shown, 21 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 246 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Líquidos · workbench
- Niveles ABCD (etl-core)
- Merge Excel-first
- Timing San Lorenzo
- Clasificación comité
- ETL core · transform
- Scoring de circuitos
- Índice clasificación circuitos
- Realjourneydepurationmap
- Etltransformpipeline
- Etlsegmenttiming
- Pages
- Live
- Etlsegmentscatterbyday
- Live
- Reports
- Etlricsanlorenzoroute
- Powerbicircuitcsvbundle
- Rearcamerafilter
- Components
- Realjourneycyclesplit
- Auditslcameraexcelcoverage
- Auditexcelcameracalibration
- Cameracalibrationdashboardmodel
- Realjourneyquality
- Analyticskpi
- Etlcircuitclassificationindex
- Powerbietlexportbuilder
- Server
- Docs
- Data
- Tabs
- Ingest
- Etlsectoroccupancy30min
- Preliminarycircuitclassify
- Etlcircuitclassificationindex
- Etltruckflowmovimientosmerge
- Etlsegmenttiming
- Components
- Etlproductfilter
- Nearbyalertresearch
- Goldenanomalyrules
- Components
- Livecameradiagnostics
- Etloperationalalertmatch
- Scripts
- Reports
- Truckflowlocalserverapi
- Etlcircuitclassificationindex
- Powerbiload
- Utils
- Etlcanonicalcsvexport
- Scripts
- Auditexcelmovimientossource
- Live
- Etltiemposentrepasos
- Engine
- Auditexcelcameramatrix
- Scripts
- Auditexcelcameramatrix
- Etlexternalmovimientoscontrato
- Truckfloweventospresentation
- Logistics
- Etlruncacheapi
- Etlsegmenttiming
- Ingest
- Etlcircuittiming
- Powerbicommitteeexecutive
- Components
- Package
- Tsconfig
- Generateclassificationmatrixcsv
- Validation
- Package
- Scripts
- Truckplateregistryapi
- Engine
- Auditsls1excelcoverage
- Etlplatematchcache
- Etlsegmenttiming
- Agentes
- Config
- Truckplantvisitsync
- Excelstableoperationid
- Etlsegmentslowtail
- Context
- Engine
- Circuitverdict
- Etlcircuitclassificationindex
- Etlagentapi
- Scripts
- Scripts
- Realtruckflowcleandataset
- Package
- Scripts
- Server
- Etlcaladacameraactivity
- Powerbicameraaggregates
- Circuitcatalog
- Powerbiload
- Etlricardonesectorscatter
- Agentes
- Scripts
- Etlprofile
- Distribucionforma
- Truckflowtransform
- Agentes
- Runs
- Contract
- Truckplateregistryfilter
- Etltimelineprimitives
- Docs
- Agentes
- Scripts
- Scripts
- Server
- Movimientosbackupapi
- Etlsegmenttramoflow
- Agentes
- Docs
- Docs
- Scripts
- Anomalyclassifier
- Truckflowrawjourneystats
- Stitch
- Scripts
- Live
- Scripts
- Runs
- Data
- Tools
- Agentes
- Power
- Registry
- Docs
- Scripts
- Server
- Stitch
- Claude
- Scripts
- Reports
- Etlcontractfirstprogress
- Migracion
- Scripts
- Scripts
- Scripts
- Stitch
- Stitch
- Claude
- Server
- Package
- Docs
- Ruta
- Scripts
- Csvparse
- Tools
- Agentes
- Package
- Powerbi
- Scripts
- Vite
- Claude
- Claude
- Migracion
- Transform
- Transform
- Handoff
- Comunidad 168
- Informe
- Comunidad 170
- Comunidad 172
- Resumen
- Config
- Data
- Committeeclassification
- Powerbietlexportbuilder

## God Nodes (most connected - your core abstractions)
1. `runEtlTransform()` - 98 edges
2. `parseTimestampMs()` - 90 edges
3. `e()` - 88 edges
4. `runMovimientosContratoIntegration()` - 81 edges
5. `recordsToCsv()` - 68 edges
6. `RealJourneyDiagnosticsPageLegacy()` - 66 edges
7. `normalizeRealEventPoint()` - 58 edges
8. `RealJourneyEventDto` - 58 edges
9. `parseCsvToRecords()` - 41 edges
10. `normalizePlateStrict()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `walk()` --indirect_call--> `e()`  [INFERRED]
  scripts/check-arch-rules.mjs → src/etl-core/reports/movimientosReconciliation.test.ts
- `Capa agéntica 3 niveles (semantic/SQL/linaje)` --references--> `Servidor MCP etl`  [INFERRED]
  docs/migracion-v3/PLAN_MIGRACION_V3.md → CLAUDE.md
- `Precedencia ANOMALO>INCOMPLETO>DEDUCIDO>COMPLETO` --semantically_similar_to--> `committee_group (capa comité v10)`  [INFERRED] [semantically similar]
  docs/NIVELES_ABCD.md → ETL_POWER_BI_CONTRACT.md
- `NO_DIFERENCIABLE (solapamiento de circuitos)` --semantically_similar_to--> `Desambiguación R7↔SL1 por evidencia Ricardone/SL`  [INFERRED] [semantically similar]
  HANDOFF-limpieza-arquitectura.md → docs/migracion-v3/SPEC_R7.md
- `check-arch-rules.mjs (gate de capas)` --semantically_similar_to--> `check-arch-rules.mjs (freeze + pureza)`  [INFERRED] [semantically similar]
  HANDOFF-limpieza-arquitectura.md → docs/migracion/FASE_0_RED_SEGURIDAD.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Clasificación en 3 capas (técnica/ejecutiva/comité)** — etl_transform_v9_rules_matrix_final_status, etl_transform_v9_rules_executive_status, etl_transform_v9_rules_committee_group [EXTRACTED 1.00]
- **Flujo batch ETL (extract → staging → transform → load pb_*)** — server_truckflow_local_server, src_features_real_truckflow_etlworkbench_etlworkbenchcontext, src_features_real_truckflow_etlworkbench_etltransformpipeline, src_features_real_truckflow_etlworkbench_powerbiload [EXTRACTED 1.00]
- **Organigrama de subagentes sobre servidor MCP etl** — _claude_agents_comunicador_comunicador, _claude_agents_knowledge_contratos_knowledge_contratos, _claude_agents_knowledge_truckflow_knowledge_truckflow, _claude_agents_seguridad_seguridad, claude_mcp_server_etl [EXTRACTED 1.00]
- **Cuatro catálogos de circuitos vivos** — handoff_limpieza_arquitectura_circuit_catalog, handoff_limpieza_arquitectura_default_circuit_matrix, handoff_limpieza_arquitectura_executive_circuit_matrix, handoff_limpieza_arquitectura_master_circuit_catalog [EXTRACTED 1.00]
- **Modelo de niveles v14: C→D→E** — docs_niveles_abcd_nivel_c, docs_niveles_abcd_nivel_d, docs_niveles_abcd_nivel_e [EXTRACTED 1.00]
- **Guía de migración ETL por fases (README + FASE 2-5 + PROGRESO)** — docs_migracion_readme, docs_migracion_fase_2_typed_table, docs_migracion_fase_3_catalogo_unico, docs_migracion_fase_4_servicio_persistencia, docs_migracion_fase_5_agentes_python, docs_migracion_progreso [EXTRACTED 1.00]
- **Mockups Truckflow Ops (Inicio, Operación Semanal, Logística v3)** — stitch_previews_truckflow_ops_inicio_seleccion_periodo, stitch_previews_truckflow_ops_operacion_semanal_run_882, stitch_previews_logistica_v3 [INFERRED 0.85]
- **Fuente única de circuitos (catálogo → matriz ejecutiva; muere legacy)** — docs_migracion_fase_3_catalogo_unico_circuit_catalog, docs_migracion_fase_3_catalogo_unico_executive_circuit_matrix, docs_migracion_fase_3_catalogo_unico_legacy_classifiers [EXTRACTED 1.00]

## Communities (182 total, 21 thin omitted)

### Community 0 - "Líquidos · workbench"
Cohesion: 0.05
Nodes (89): classifyTransileExternoProduct(), COHORT_LABELS, isCsvTrue(), LiquidMovementsPanel(), parseSummary(), Props, Row, summaryFromRow() (+81 more)

### Community 1 - "Niveles ABCD (etl-core)"
Cohesion: 0.06
Nodes (72): main(), n(), parseArgs(), procesar(), readTable(), Row, RUNS_ROOT, writeTable() (+64 more)

### Community 2 - "Merge Excel-first"
Cohesion: 0.06
Nodes (71): aggregateJourneyStats(), argentinaDayBoundsMs(), buildEvidenceFromMatches(), buildExcelFirstReviewSample(), buildExcelPeriodContext(), buildPlateIndex(), buildWindowFromOpts(), CANDIDATE_DIAG_HEADERS (+63 more)

### Community 3 - "Timing San Lorenzo"
Cohesion: 0.08
Nodes (71): argentinaLocalMinutesOfDay(), argentinaLocalParts(), ensureArgentinaOffsetIso(), formatArgentinaIsoFromMs(), hasExplicitTimezone(), normalizeTimestampForExport(), pad2(), parseTimestampMs() (+63 more)

### Community 4 - "Clasificación comité"
Cohesion: 0.07
Nodes (63): Buckets de clasificación (completos / incompletos ≤2 lecturas / anómalos), Capa comité committee_group v10 (COMPLETOS/VARIACIONES_OPERATIVAS/ANOMALIAS), Capa técnica matrix_final_status (COMPLETO/DEDUCIDO/INCOMPLETO/ANOMALO), applyGoldenAnomalyOverride(), AMBIGUOUS_INFERRED_CODES, AnalysisScope, AnomalyLeg, AnomalyOriginPlant (+55 more)

### Community 5 - "ETL core · transform"
Cohesion: 0.09
Nodes (58): csvEscapeCell(), recordsToCsv(), formatTransileExternoLog(), transileExternoOperationsCsv(), transileExternoSessionsCsv(), transileExternoSummaryCsv(), transileExternoTables(), transileExternoReclasificacionCsv() (+50 more)

### Community 6 - "Scoring de circuitos"
Cohesion: 0.07
Nodes (58): Regla líquido vs sólido (RicCalLiq → R8/R16 vs RS_REC/RS_DESP), SWITCH_ORIGINAL, hasTransileRicardoneEvidence(), resolveStrongPointSource(), DEFAULT_CIRCUIT_MATRIX_EXTENSIONS, balanzasBeforeCaladaOrLiquid(), buildReliabilityExplanation(), caladaAfterBalanzasBeforeEgreso() (+50 more)

### Community 7 - "Índice clasificación circuitos"
Cohesion: 0.05
Nodes (62): operationalDayKeyFromIso(), AnomalyReasonCount, applyExecutiveCircuitCodeToEntry(), BALANZA_LOGICAL_CODES, buildCircuitClassificationIndex(), buildExecutiveCircuitBarSlices(), CircuitPieSlice, CircuitPieSliceWithTrucks (+54 more)

### Community 8 - "Realjourneydepurationmap"
Cohesion: 0.05
Nodes (51): DataDistributionDonut(), Slice, DataQualityFunnel(), Stage, DiagDrawer(), COMMITTEE_ETL_LITE_MODE, ETL_DEV_TAB_IDS, ETL_MAIN_TAB_IDS (+43 more)

### Community 9 - "Etltransformpipeline"
Cohesion: 0.07
Nodes (50): runEtlTransform unificado (orquestador ETL único), buildTaxonomyCoherenceReport(), EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES, EtlProfiler, createPhaseStore(), EtlTransformPhaseStore, EtlTransformRunOptions, alertOccurredAtIso() (+42 more)

### Community 10 - "Etlsegmenttiming"
Cohesion: 0.06
Nodes (51): aggregateFromLegs(), BalanzaStayCandidateDiagnostic, BalanzaStayTimedSegmentsInput, BalanzaStayTimingDiagnostic, buildExecutiveCircuitSegmentTemplate(), DISCHARGE_ROLLUP_ALLOWED_REAR_DEVICES, EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE, extractTemplateChainLegsFromTimeline() (+43 more)

### Community 11 - "Pages"
Cohesion: 0.08
Nodes (50): j(), buildPreliminaryCircuitDailySummary(), enrichCaladaSanLorenzoConfidence(), buildAlertsChannelQueryNoTimeFilter(), downloadCsv(), exportSimpleBarPng(), getRecentDefaultRange(), INC_PRELIM_FILTERS (+42 more)

### Community 12 - "Live"
Cohesion: 0.08
Nodes (41): LiveCameraMonitor, LiveDetailTab, LiveTableColumn, buildLiveCameraRow(), buildLiveDetections(), buildLiveFeedSectorDeviceBreakdown(), buildLiveSectorSummary(), filterLiveAlertsForView() (+33 more)

### Community 13 - "Etlsegmentscatterbyday"
Cohesion: 0.08
Nodes (46): caladaCameraEventsCsv(), circuitTimingJourneysCsv(), circuitTimingSummaryCsv(), fmtMin(), buildKpiTiemposArtifacts(), KpiTiemposBuildOutput, KpiTiemposMovimientosSnapshot, auditSlBalanzaScatterEligibility() (+38 more)

### Community 14 - "Live"
Cohesion: 0.10
Nodes (41): buildForRun(), dayOf(), main(), RUNS, ApiRealJourneyEventRow, buildFixedHourChunks(), fetchAlertsAdaptive(), fetchAlertsOneChunk() (+33 more)

### Community 15 - "Reports"
Cohesion: 0.07
Nodes (39): ExternalMovimientoContratoNormalized, normalizePlate(), ANALYZED_PRODUCT_FAMILIES, buildTransileExternoReport(), detectDeVueltaHeader(), fechaFor(), opInstantMs(), PELLET_DESPACHO_CODES (+31 more)

### Community 16 - "Etlricsanlorenzoroute"
Cohesion: 0.12
Nodes (40): lookupSanLorenzoCameraByDevice(), inferSiteLocal(), lookupRicDevicePoint(), NormalizedRealEventPoint, normalizeRealEventPoint(), RIC_DEVICE_POINT_MAP, collapseConsecutiveEqual(), computeR7LegDurations() (+32 more)

### Community 17 - "Powerbicircuitcsvbundle"
Cohesion: 0.09
Nodes (44): buildCircuitEtlV2CsvBundle(), buildOperationalSessionsPlateSite(), buildQualitySummary(), canonicalPlateFromEvents(), CIRCUIT_ETL_V2_FILENAMES, CIRCUIT_MATRICES, CircuitMatrixRule, circuitStatusRankFusion() (+36 more)

### Community 18 - "Rearcamerafilter"
Cohesion: 0.08
Nodes (43): Mapa del backend lógico Transform Truckflow, Uso recomendado — Backend Transform sin UI, Plan de limpieza futura — Transform Truckflow, Plan ETL unificado — Datos reales Truckflow, Problema raíz: dos motores Transform en paralelo (Workbench vs Comité/v2), circuitEtlV2.ts (motor Transform v2, sesiones, matriz S0–S10), alertTimeMs(), alignAlertsToSegments() (+35 more)

### Community 19 - "Components"
Cohesion: 0.09
Nodes (35): postTruckflowLoadLocalPeriod(), GlobalRangeSelector(), STAGE_LABEL, CLASS_BY_STATUS, LABELS, StatusBadge(), TimeInput24(), TimeInput24Props (+27 more)

### Community 20 - "Realjourneycyclesplit"
Cohesion: 0.09
Nodes (28): Informe journeyUid abierto en API Truckflow, Bug journeyUid abierto (mismo UID = varios viajes multi-día), Merge automático de journeys fragmentados (gap ≤240min, OCR ≥0.92), PreliminaryCircuitClassification, ReconstructedRealJourney, ReconstructedRealJourneyCore, ReconstructedRealJourneyWithQuality, ReconstructedRealSiteId (+20 more)

### Community 21 - "Auditslcameraexcelcoverage"
Cohesion: 0.09
Nodes (40): main(), PORT, listSanLorenzoInstalledCameras(), lookupSanLorenzoSectorFallback(), e(), collectVolcableVisitsFromClassified(), collectVolcableVisitsFromRaw(), isVolcableTransileDevice() (+32 more)

### Community 22 - "Auditexcelcameracalibration"
Cohesion: 0.11
Nodes (37): CameraMatrixDetailRow, DayNight, RecognitionSegment, buildCameraCalibrationReport(), buildExcelCameraMatrixDetailed(), classifyRecognitionSegment(), dayNightForMovimiento(), devicesMatchingStep() (+29 more)

### Community 23 - "Cameracalibrationdashboardmodel"
Cohesion: 0.11
Nodes (36): ExcelCameraComparativaPanel(), Props, cameraCalibrationAggregatesToCsv(), cameraCalibrationDetailToCsv(), PointCaptureDepthSummary, RAW_AUDIT_CIRCUIT_CODES, missedPlatesByCameraToCsv(), summarizeMissedPlatesByDevice() (+28 more)

### Community 24 - "Realjourneyquality"
Cohesion: 0.09
Nodes (39): lookupRealSectorCode(), REAL_SECTOR_CODE_MAP, RealSectorMappingEntry, RealSectorMapSiteId, UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER, RealJourneyEventDto, buildSanLorenzoSectorEntries(), sectorDisplayName() (+31 more)

### Community 25 - "Analyticskpi"
Cohesion: 0.08
Nodes (38): Entidad HistoricalTrip (viaje histórico), KPIs analíticos ampliados (estadía, variabilidad, flujo, densidad), clampDurationMinutes(), getHourFromIso(), getShiftForHour(), OPERATIONAL_SHIFTS, ShiftConfig, getSectorCapacityByPlant() (+30 more)

### Community 26 - "Etlcircuitclassificationindex"
Cohesion: 0.10
Nodes (40): aceiteTruckflowHaystackFromEntry(), applyExcelFirstReconciliation(), buildAceiteCircuitResolutionDebugCsv(), buildExecutiveEntryFromExcelOperationRow(), CAMERA_PRESERVED_OPERATIONAL_VARIATIONS, committeeGroupFromExcelFirst(), enforceLiquidExcelExecutiveCircuits(), entryAceiteTruckflowExecutiveCode() (+32 more)

### Community 27 - "Powerbietlexportbuilder"
Cohesion: 0.10
Nodes (34): getEventOperationalInstantMs(), downloadPowerBiNamedCsvZipSync(), triggerAnchorDownloadZip(), triggerBrowserDownloadsSequential(), triggerCommitteeCsvDownloadsSync(), triggerPowerBiDebugDownloadsSequential(), TriggerPowerBiZipDownloadOptions, triggerSinglePowerBiCsvDownload() (+26 more)

### Community 28 - "Server"
Cohesion: 0.07
Nodes (31): Informe ETL Dashboard Truckflow, annotateRunManifest(), app, buildListUrl(), DATA_ROOT, daysInclusive(), __dirname, dssLive (+23 more)

### Community 29 - "Docs"
Cohesion: 0.10
Nodes (37): FASE 2 — Intercambio tipado (TypedTable), TypedTable (filas tipadas; CSV solo al borde), FASE 3 — Un catálogo de circuitos, un clasificador, CIRCUIT_CATALOG (fuente única de circuitos en etl-core/domain), EXECUTIVE_CIRCUIT_MATRIX / finalCircuitScoring (clasificador vigente), Clasificadores legacy (circuitEtlV2, realPreliminaryCircuit) a eliminar, FASE 4 — Corridas headless por API + persistencia por runId, Endpoints /api/etl/runs (crear, listar, consultar tablas) (+29 more)

### Community 30 - "Data"
Cohesion: 0.08
Nodes (28): Reglas ETL etl_transform_v9 (+v10/v12), Criterio LPR único (alertCode === 'LPR_MALFUNCTION'), Cámaras traseras excluidas del frente ETL, Apoyo ejecutivo San Lorenzo (refuerza, no reclasifica), DEVICE_ALIASES, DEVICE_MAP, listSanLorenzoRearDeviceCodes(), normDeviceKey() (+20 more)

### Community 31 - "Tabs"
Cohesion: 0.11
Nodes (28): colorForFranja(), FRANJA_HORARIA_COLORS, FRANJA_HORARIA_ORDER, FRANJA_HORARIA_WINDOWS, FranjaHoraria, isWithinSegmentScatterDisplayMax(), SEGMENT_SCATTER_DISPLAY_MAX_MINUTES, downloadChartVisibleCsv() (+20 more)

### Community 32 - "Ingest"
Cohesion: 0.11
Nodes (27): applySourceDateGuard(), combineDateTime(), dateOnlyKey(), daysFromSourceDate(), excelSerialToDate(), formatIsoLocal(), inferSourceDateFromFileName(), isDayFirstDateString() (+19 more)

### Community 33 - "Etlsectoroccupancy30min"
Cohesion: 0.13
Nodes (29): inferPlantaFromSegment(), buildAllSectorOccupancy30MinRows(), buildSectorOccupancy30MinSeries(), computeSectorOccupancyFromScatter(), countStockInitialJourneys(), fechaFromMs(), filterScatterRowsForOccupancyDay(), FranjaOperativaOccupancy (+21 more)

### Community 34 - "Preliminarycircuitclassify"
Cohesion: 0.08
Nodes (35): classifyOperationalPreliminaryCircuit(), classifyPreliminaryRealCircuit(), collapseConsecutiveEqual(), countCode(), countEvidencePoints(), countExcludedRearLogicalPoints(), DESCARTADO_CODES, deviceRouteHintEgreso() (+27 more)

### Community 35 - "Etlcircuitclassificationindex"
Cohesion: 0.08
Nodes (31): ANOMALY_SEQUENCE_CSV_HEADERS, AnomalyReviewSummary, AnomalySequenceBreakdownRow, anomalySequenceSummaryCsv(), CIRCUIT_PIE_COLORS, CircuitClassificationEntry, CircuitClassificationIndex, COMMITTEE_DRILLDOWN_CSV_HEADERS (+23 more)

### Community 36 - "Etltruckflowmovimientosmerge"
Cohesion: 0.15
Nodes (33): applyExternalCircuitToJourney(), excelAnchorJourneyPriority(), journeyNeedsCircuitFromExcel(), applyMovimientoToRow(), collectCandidatesForJourney(), collectCandidatesForMovimiento(), compareMergeCandidates(), dayKeyFromIso() (+25 more)

### Community 37 - "Etlsegmenttiming"
Cohesion: 0.15
Nodes (35): buildBalanzaStayFlags(), buildEnrichedTimelineForBalanzaDiagnosis(), computeCameraBalanzaStayMinutesFromEvents(), computeCameraBalanzaStayMinutesFromTimeline(), diagnoseBalanzaStayFromJourney(), diagnoseBalanzaStayFromTimedSegments(), earliestSegmentStartForCode(), enrichTimelineWithExcelDischarge() (+27 more)

### Community 38 - "Components"
Cohesion: 0.12
Nodes (25): LiveCameraPlayerModal(), LoadState, FleetPlateLookupResult, fetchFleetStorageStatus(), fetchWithTimeout(), FleetStorageStatus, FleetSyncProgress, lookupFleetByPlate() (+17 more)

### Community 39 - "Etlproductfilter"
Cohesion: 0.12
Nodes (29): parseCsvToRecords(), isPelletExcelProduct(), ExecutiveSampleProductFilter(), Props, Props, appendPermittedAceiteExcelOrphansToEntries(), excelOpsHasData(), excelOpsRows() (+21 more)

### Community 40 - "Nearbyalertresearch"
Cohesion: 0.09
Nodes (30): isValidArgentinaPlate(), normalizePlate(), isValidObservedPlate(), classifyAlert(), findSimilarPlateReadings(), investigateNearbyAlerts(), levenshtein(), NearbyAlertClassification (+22 more)

### Community 41 - "Goldenanomalyrules"
Cohesion: 0.12
Nodes (29): collapseConsecutive(), detectCaladaToPreingresoRegression(), detectMissingExcelMovement(), detectRicToSlTravelTooSlow(), detectSkippedPointWithExtremeGap(), detectSlRicQuickReturnNoPellet(), EvaluateGoldenAnomalyInput, evaluateGoldenAnomalyRules() (+21 more)

### Community 42 - "Components"
Cohesion: 0.12
Nodes (27): cardBorder(), Props, statusLabel(), TRAMO_META, TransformPhaseStepper(), formatElapsed(), Props, TRAMO_LABEL (+19 more)

### Community 43 - "Livecameradiagnostics"
Cohesion: 0.11
Nodes (29): alertInstantMs(), alertIsLpr(), buildCameraDiagnostics(), buildFrontRearRow(), buildOperationalTimeline(), CameraDiagnostics, compareFrontRearCameras(), countInvalidReadings() (+21 more)

### Community 44 - "Etloperationalalertmatch"
Cohesion: 0.11
Nodes (31): accumulateOperationalAlertsMatch(), alertTimeMs(), alertWithinJourneyWindow(), attachExecutiveBucketsToOperationalAlertRows(), computeOperationalAlertCrossMetrics(), crossOperationalAlerts(), CrossOperationalAlertsResult, emptyJourneyOperationalAlertSummary() (+23 more)

### Community 45 - "Scripts"
Cohesion: 0.12
Nodes (27): Args, loadEventsFromFile(), main(), materializeTableJson(), parseArgs(), persistLevels(), persistPowerBiPack(), persistTables() (+19 more)

### Community 46 - "Reports"
Cohesion: 0.11
Nodes (23): buildTransileInternoVolcableReport(), clusterVolcableVisits(), evaluateTransileSession(), excelCircuitHintForSession(), fechaArgentina(), INTERNAL_TRANSILE_CIRCUIT_HINTS, splitVolcableVisitSessions(), TRANSILE_INTERNO_SESSION_HEADERS (+15 more)

### Community 47 - "Truckflowlocalserverapi"
Cohesion: 0.12
Nodes (28): getTruckflowListDays(), parseJson(), postTruckflowExportOneDay(), postTruckflowExportPeriod(), postTruckflowExportWindow(), postTruckflowJourneyStatsPeriod(), TruckflowApiJourneyDayStat, TruckflowExportDayResult (+20 more)

### Community 48 - "Etlcircuitclassificationindex"
Cohesion: 0.13
Nodes (30): AnomalyListContext, buildAnomalyReviewSummary(), buildAnomalySequenceBreakdown(), buildCommitteeCircuitCrossTab(), buildCommitteeEvaluableModel(), buildSuspiciousDischargeWithoutBalanza(), committeeCategoryFromEntry(), committeeChartExportCsv() (+22 more)

### Community 49 - "Powerbiload"
Cohesion: 0.12
Nodes (29): appendLoadMeta(), buildFolderName(), buildPowerBiZipName(), classifyFileName(), CommitteeGroup, consolidatePowerBiLoad(), daysInclusive(), dedupeByKey() (+21 more)

### Community 50 - "Utils"
Cohesion: 0.15
Nodes (27): buildSegmentScatterAnalysis(), buildByCircuitProduct(), buildSampleSummary(), computeStayTimeStats(), computeVariabilityStats(), classifyOutlier(), coefficientOfVariation(), detectOutliersIqr() (+19 more)

### Community 51 - "Etlcanonicalcsvexport"
Cohesion: 0.11
Nodes (26): Contract-first / Excel-first backend (conciliación Movimientos por Contrato), Excel = verdad operativa, Truckflow = evidencia física, match_quality (cruce Excel↔Truckflow), route_quality (diagnóstico Truckflow), Secuencia R7 San Lorenzo (S0→S1→S5→S7), Catálogo San Lorenzo (12 cámaras, sectores S0–S7), Escenarios de datos (live / march_full / normal), Plataforma multi-planta (Ricardone, San Lorenzo, Avellaneda) (+18 more)

### Community 52 - "Scripts"
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

### Community 53 - "Auditexcelmovimientossource"
Cohesion: 0.17
Nodes (24): dayKeyFromSalida(), ExcelMovimientoLike, assertNotScatterCsvForRawAudit(), buildExcelMovimientosUniverse(), classifyRawAuditCircuit(), computeExcelPeriodTotals(), ctgKeyForMovimiento(), describeExcelUniverse() (+16 more)

### Community 54 - "Live"
Cohesion: 0.13
Nodes (27): entryDevices(), entryKey(), entryLabel(), entrySectorCodes(), filterAlertsByMonitorScope(), filterEventsByMonitorScope(), findLiveSectorEntry(), findLiveSectorEntryForScope() (+19 more)

### Community 55 - "Etltiemposentrepasos"
Cohesion: 0.13
Nodes (25): xlsx, buildTiemposEntrePasosIndex(), cellStr(), classifyContratoXlsxFromHeaders(), ContratoXlsxKind, enrichMovimientosWithTiemposEntrePasos(), findTepHeaderRow(), headerFieldMap() (+17 more)

### Community 56 - "Engine"
Cohesion: 0.15
Nodes (22): ReconstructedVisit, buildTripSummaryFromEvents(), BarItem, bucketStatus(), DisplayStatus, filterVisitsByStatus(), getEntryTimeMinutes(), getExitTime() (+14 more)

### Community 57 - "Auditexcelcameramatrix"
Cohesion: 0.13
Nodes (23): CameraCalibrationReport, buildExcelCameraMatrix(), CameraAuditAlertLike, CameraMatrixRow, CameraStepSummary, excelCameraMatrixToCsv(), extractCtgFromOperationId(), formatExcelCameraSummaryLog() (+15 more)

### Community 58 - "Scripts"
Cohesion: 0.10
Nodes (23): assertReadableFile(), auditRows, csvPath, csvRowToJourneyEvent(), { events, sourceLabel }, eventsPath, flagged, { fromDay, toDay, positional } (+15 more)

### Community 59 - "Auditexcelcameramatrix"
Cohesion: 0.12
Nodes (25): AUDIT_INDEX_CACHE, CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS, CameraAuditIndex, CameraAuditIndexEntry, computeEventLogicalCodeOperational(), computeOperationWindowEvents(), countRowCapturePointsForCalibration(), DESCARGA_CAMERA_STEP_KEYS (+17 more)

### Community 60 - "Etlexternalmovimientoscontrato"
Cohesion: 0.16
Nodes (23): ExcelMovimientosStepResult, hasMovimientosSource(), runExcelMovimientosNormalizeStep(), buildHeaderMap(), cellStr(), COLUMN_ALIASES, EXTERNAL_MOVIMIENTOS_NORMALIZED_HEADERS, ExternalMovimientoContratoRaw (+15 more)

### Community 61 - "Truckfloweventospresentation"
Cohesion: 0.17
Nodes (21): EventosTruckflowPresentation(), formatDateOnly(), formatDt(), Props, ACCENT, ExecCardAccent, ExecutiveMetricCard(), HorizontalBarChart() (+13 more)

### Community 62 - "Logistics"
Cohesion: 0.11
Nodes (23): AlertSeverity, AlertStatus, CameraEventRaw, CameraEventsFile, HistoricalTrip, HistoricalTripsFile, IfcCameraCatalogItem, OperationalAlert (+15 more)

### Community 63 - "Etlruncacheapi"
Cohesion: 0.19
Nodes (21): base(), fetchRunTable(), getRunSummary(), listRunTables(), listWindows(), parseJson(), requestRunEtl(), resolveWindow() (+13 more)

### Community 64 - "Etlsegmenttiming"
Cohesion: 0.14
Nodes (23): CircuitChecklistFilter(), CircuitChecklistOption, Props, parseSegmentScatterByDayCsv(), legsForAggregate(), countUniqueOperationsForCircuit(), filterSegmentTimingIndex(), formatTransitionLabel() (+15 more)

### Community 65 - "Ingest"
Cohesion: 0.15
Nodes (17): Args, dayFile(), ingestMovimientosBuffer(), main(), parseArgs(), readDay(), writeDay(), dedupeMovimientosByOperationId() (+9 more)

### Community 66 - "Etlcircuittiming"
Cohesion: 0.16
Nodes (17): CommitteeGroup, aggregateCircuitSummary(), aggregateCircuitTimingSummaries(), buildCircuitTimingIndex(), CircuitTimingJourneyRow, circuitTimingJourneysFromCsvRows(), CircuitTimingSummaryRow, ClassifiedJourneyForCircuitTiming (+9 more)

### Community 67 - "Powerbicommitteeexecutive"
Cohesion: 0.17
Nodes (21): rowGet(), buildCameraCommitteeStatusRows(), buildCircuitCoverageRows(), buildCommitteeExecutiveCsvPack(), buildCommitteeSummaryRow(), buildDssVsTruckflowRows(), CommitteeExecutiveCsvPack, criticidadFromEstado() (+13 more)

### Community 68 - "Components"
Cohesion: 0.17
Nodes (18): MESES, monthKey(), monthLabel(), SavedWindowsPicker(), SavedWindowsPickerProps, shortDay(), Props, TransformTramoSummary() (+10 more)

### Community 69 - "Package"
Cohesion: 0.09
Nodes (22): cors, fflate, html-to-image, jspdf, dependencies, cors, fflate, html-to-image (+14 more)

### Community 70 - "Tsconfig"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+13 more)

### Community 71 - "Generateclassificationmatrixcsv"
Cohesion: 0.17
Nodes (19): resolveDeducedEvidence(), isExecutiveSequenceConfigured(), isJourneyProductivelyEvaluable(), journeyMeetsDeducedEvidenceThreshold(), resolveExecutiveCircuitDecision(), resolveExecutiveCircuitStatus(), resolveOperationalEntry(), resolveProbableSolidExecutiveDecision() (+11 more)

### Community 72 - "Validation"
Cohesion: 0.19
Nodes (19): TripResult, CaladaResult, CircuitLetter, CircuitStep, EVENT_TO_LETTER, eventsToCircuit(), getCaladaResult(), getCaladaResultFromRaw() (+11 more)

### Community 73 - "Package"
Cohesion: 0.10
Nodes (21): autoprefixer, concurrently, devDependencies, autoprefixer, concurrently, postcss, tailwindcss, @types/react (+13 more)

### Community 74 - "Scripts"
Cohesion: 0.12
Nodes (17): circuitCode, eventsPath, excelPath, { fromDay, toDay, minPuntos, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), loadMovimientosContratoFromPath() (+9 more)

### Community 75 - "Truckplateregistryapi"
Cohesion: 0.21
Nodes (16): TRUCK_PLATE_REGISTRY_CATEGORY_LABELS, TruckPlateRegistryCategory, TruckPlateRegistryDocument, TruckPlateRegistryEntry, getTruckflowHealth(), localApiPrefix(), createTruckPlateRegistryEntry(), deleteTruckPlateRegistryEntry() (+8 more)

### Community 76 - "Engine"
Cohesion: 0.20
Nodes (18): buildStory(), buildTripFromEvents(), buildTripsFromEventStream(), formatTime(), getDateBucket(), getVisitKey(), getVisitKeyWithMeta(), normalizeEventTypeFromRaw() (+10 more)

### Community 77 - "Auditsls1excelcoverage"
Cohesion: 0.20
Nodes (18): auditExcelOperationsAgainstRawS1(), ExcelOperationLike, excelWindowMs(), findS1InWindow(), indexS1EventsByPlate(), isRawS1Event(), normalizePlateKey(), operationalInstantIso() (+10 more)

### Community 78 - "Etlplatematchcache"
Cohesion: 0.23
Nodes (16): createPlateMatchCache(), ensurePlateMatchCacheRoom(), PlateMatchCache, plateMatchCacheSize(), PlateMatchKind, plateMatchKindCached(), prunePlateMatchCache(), bestPlateBetweenSessions() (+8 more)

### Community 79 - "Etlsegmenttiming"
Cohesion: 0.16
Nodes (18): buildSegmentTimingIndex(), circuitRequiresRicardoneEntry(), collapsedFrontLogicalPoints(), collapsedLogicalPointsForDischargeRollup(), extractAllSegmentLegsForCircuit(), extractDischargeRollupLegsFromJourney(), extractSegmentLegs(), extractSegmentLegsWithTimes() (+10 more)

### Community 80 - "Agentes"
Cohesion: 0.12
Nodes (17): call_tool(), list_tools(), main(), Servidor MCP (stdio) que expone las tools del ETL a Claude Code.  Corre en la SU, _serve(), generar_pptx_comite(), Any, Comunicador: PPTX de comité a partir de get_summary (sin reglas de negocio). (+9 more)

### Community 81 - "Config"
Cohesion: 0.15
Nodes (15): extraMatrixCodesFromTrips(), filterTripsForKpiContext(), KPI_OPERATION_LABELS, KpiMatrixPlant, KpiOperationKind, MATRIX_CODES_BY_PLANT_OP, operationsAvailableForPlant(), supportsKpiCircuitMatrix() (+7 more)

### Community 82 - "Truckplantvisitsync"
Cohesion: 0.20
Nodes (16): CamionProfile, PlantVisitProductOrigin, PlantVisitSource, PlantVisitUpsertInput, VisitaPlanta, buildPlantVisitUpsertsFromTransform(), buildTimesByJourney(), dayKeyFromIso() (+8 more)

### Community 83 - "Excelstableoperationid"
Cohesion: 0.17
Nodes (17): stableExternalHash(), buildExternalOperationId(), SegmentScatterRow, createOperationalSample(), DEFAULT_SAMPLE_OPTIONS, inPeriod(), OperationalSampleOptions, OperationalSampleRow (+9 more)

### Community 84 - "Etlsegmentslowtail"
Cohesion: 0.16
Nodes (16): CHART_VISIBLE_EXPORT_HEADERS, chartVisibleExportCsv(), ChartVisibleExportRow, downloadSlowTailCsv(), isStrictTruckflowScatterRow(), legsToSlowTailExport(), pickSlowTailByDuration(), pickSlowTailScatterRows() (+8 more)

### Community 85 - "Context"
Cohesion: 0.16
Nodes (11): SiteContext, SiteContextValue, SiteProvider(), useSite(), getSite(), getSiteIdFromStorage(), setSiteIdInStorage(), Site (+3 more)

### Community 86 - "Engine"
Cohesion: 0.17
Nodes (15): NormalizedCargoForm, NormalizedEvent, ReconstructedVisitStatus, VisitAlert, VisitMetrics, EventType, LocationKey, buildVisits() (+7 more)

### Community 87 - "Circuitverdict"
Cohesion: 0.16
Nodes (16): CircuitEvidence, CircuitStatus, CircuitVerdict, CommitteeGroupView, detectTaxonomyContradictions(), isReconstructable(), isSofterThan(), MatrixFinalStatusView (+8 more)

### Community 88 - "Etlcircuitclassificationindex"
Cohesion: 0.19
Nodes (19): normalizeDeVuelta(), resolvePelletCircuit(), buildAnomalyListContextFromTransformCsv(), buildPelletExcelMovementsFromCsv(), buildSuspiciousSlExitRicReturn(), collectDeVueltaPlatesFromCsv(), collectDeVueltaPlatesFromExcelOps(), collectExcelPlateDaysFromCsv() (+11 more)

### Community 89 - "Etlagentapi"
Cohesion: 0.20
Nodes (15): EtlAgentChatMessage, EtlAgentChatResponse, EtlAgentStatus, EtlAgentUiPayload, etlApiPrefix(), getEtlAgentStatus(), parseJson(), postEtlAgentChat() (+7 more)

### Community 90 - "Scripts"
Cohesion: 0.14
Nodes (15): CIRCUITS, eventsPath, excelPath, { fromDay, toDay, minPuntos, outDir, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), parseCli() (+7 more)

### Community 91 - "Scripts"
Cohesion: 0.11
Nodes (12): anomalies, completeAnomalies, debug, events, groupCounts, noRespeta, parsed, plateByJourney (+4 more)

### Community 92 - "Realtruckflowcleandataset"
Cohesion: 0.20
Nodes (17): AlertIndex, attachAlertsToEvents(), buildAlertIndex(), BuildCleanDatasetOptions, buildCleanRealDataset(), DEFAULT_OPTIONS, EventWithAlertInfo, isCloseTime() (+9 more)

### Community 93 - "Package"
Cohesion: 0.12
Nodes (17): scripts, build, check:arch, contract-first:local, db:migrate:etl-runs, db:migrate:plate-registry, db:sync:plate-registry, dev (+9 more)

### Community 94 - "Scripts"
Cohesion: 0.12
Nodes (12): cacheDir, cachePath, candidates, debug, exportPath, exportRows, hasLogical(), missingBalanzaPattern() (+4 more)

### Community 95 - "Server"
Cohesion: 0.20
Nodes (11): supabasePublicHost(), createTruckFleetRouter(), createJsonFleetStore(), createSupabaseFleetStore(), FUENTE_OK, normalizePlate(), passesCamionPlateDbConstraint(), PRODUCTO_ORIGEN_OK (+3 more)

### Community 96 - "Etlcaladacameraactivity"
Cohesion: 0.21
Nodes (11): buildCaladaCameraEvents(), BuildCaladaCameraEventsInput, CALADA_CAMERA_DEVICES, CALADA_CAMERA_EVENTS_HEADERS, CaladaCameraEventRow, intervalStartIso(), pad2(), triggerBrowserCsvDownload() (+3 more)

### Community 97 - "Powerbicameraaggregates"
Cohesion: 0.25
Nodes (15): addMetrics(), BucketBase, buildCameraPowerBiAggregates(), buildCameraSummaryRows(), buildDayNightSummaryRows(), buildSectorCameraSummaryRows(), cameraAggregateStatus(), CameraPowerBiAggregates (+7 more)

### Community 98 - "Circuitcatalog"
Cohesion: 0.14
Nodes (12): CIRCUIT_CATALOG, CircuitCatalogEntry, CircuitCatalogKind, CircuitCatalogProduct, KEPLER_ALLOWED_S_SEQUENCES, R19_ALLOWED_SEQUENCES, R5_ALLOWED_SEQUENCES, R7_RIC_ALLOWED_S_SEQUENCES (+4 more)

### Community 99 - "Powerbiload"
Cohesion: 0.21
Nodes (12): KEY_ALIASES, normKey(), parseDssReferenceCsv(), DssReferenceMetrics, LoadedTransformDay, LoadGroupType, mergeLoadedDays(), POWER_BI_STABLE_FILES (+4 more)

### Community 100 - "Etlricardonesectorscatter"
Cohesion: 0.26
Nodes (11): CrossCircuitSectorSummary, filterScatterByDayForSector(), legsForCrossCircuitSector(), RICARDONE_CROSS_CIRCUIT_SECTORS, RicardoneCrossCircuitSector, summarizeCrossCircuitSectorFromScatter(), SegmentScatterByDayRow, SegmentTimingIndex (+3 more)

### Community 101 - "Agentes"
Cohesion: 0.30
Nodes (4): EtlApiError, EtlClient, Any, RuntimeError

### Community 102 - "Scripts"
Cohesion: 0.13
Nodes (12): client, __dirname, PROJECT_ROOT, SQL_PATH, url, client, __dirname, PROJECT_ROOT (+4 more)

### Community 103 - "Etlprofile"
Cohesion: 0.21
Nodes (11): outArg, payload, profiler, t0, createEtlProfiler(), EtlProfilerSpan, getGlobalEtlProfiler(), heapMb() (+3 more)

### Community 104 - "Distribucionforma"
Cohesion: 0.21
Nodes (13): ChartPoint, EstadiaHistogramWithRefs(), EstadiaHistogramWithRefsProps, resolveHistogramDomain(), buildIndicadoresForma(), calcCamionesEnColaDerecha(), calcCamionesEnRango(), calcPicoFrecuencia() (+5 more)

### Community 105 - "Truckflowtransform"
Cohesion: 0.24
Nodes (12): detectKindFromDoc(), extractRecordsFromTruckflowJsonRoot(), ParsedTruckflowFile, parseTruckflowJsonFile(), TruckflowJsonKind, extractTruckflowPayloadArray(), journeyDtoListFromRawExtractedRowsChunked(), buildCliFinalCsvRowsFromLocalEventJson() (+4 more)

### Community 106 - "Agentes"
Cohesion: 0.22
Nodes (10): dispatch_tool(), _explain_journey(), Any, Tools Anthropic tool-use: solo componen llamadas al etl-api (sin reglas de negoc, Ejecuta una tool por nombre. `delegar` requiere delegate_handler., _tool(), tool_result_content(), _truncate() (+2 more)

### Community 107 - "Runs"
Cohesion: 0.19
Nodes (11): apply, __dirname, main(), PROJECT_ROOT, readIndexedRunIds(), RUNS_ROOT, ETL_RUN_CORE_TABLES, isLegacyTimestampRunId() (+3 more)

### Community 108 - "Contract"
Cohesion: 0.19
Nodes (12): ContractFirstCliArgs, dayRange(), __dirname, main(), MIN_OUTPUT_FILES, parseContractFirstCliArgv(), PROJECT_ROOT, runContractFirstCli() (+4 more)

### Community 109 - "Truckplateregistryfilter"
Cohesion: 0.27
Nodes (11): buildRegistryLookup(), normalizeRegistryPlate(), filterAlertsByPlateRegistry(), filterEventsByPlateRegistry(), filterJourneysByPlateRegistry(), lookupPlateExclusion(), PlateExclusionHit, plateFromAlert() (+3 more)

### Community 110 - "Etltimelineprimitives"
Cohesion: 0.22
Nodes (13): buildSegmentTimingIndexFromExcelFirstSegments(), isValidKpiLegDuration(), mergeVolcableReceiptLegsByTransition(), resolveExcelFirstSegmentCircuitCode(), maxAllowedMinutesForTransition(), CollapsedLogicalPoint, isBalanzaStayKpiTransition(), isSlKpiTransition() (+5 more)

### Community 111 - "Docs"
Cohesion: 0.18
Nodes (13): Comunicador (agente comité/PPTX), Reglas del analista de logística, Tool generar_pptx_comite, Tool get_summary, Tool resolve_window, runs/_index/by-window.json, Tablas núcleo (ETL_RUN_CORE_TABLES), Subagentes + carpeta runs/ (+5 more)

### Community 112 - "Agentes"
Cohesion: 0.21
Nodes (12): client(), etl_base(), _etl_ready(), _free_port(), Tests del etl_client contra el server local (levanta uno efímero si hace falta)., run_id(), test_bad_run_404(), test_circuit_catalog() (+4 more)

### Community 113 - "Scripts"
Cohesion: 0.15
Nodes (8): byDay, DEFAULT_JSON, events, hits, outDir, outPath, root, stamp

### Community 114 - "Scripts"
Cohesion: 0.31
Nodes (12): DEFAULT_PORT, __dirname, fail(), fetchJson(), getFreePort(), main(), ok(), ping() (+4 more)

### Community 115 - "Server"
Cohesion: 0.21
Nodes (8): ALLOWED_TOOLS, CHAT_TIMEOUT_MS, createEtlAgentChat(), extraerUso(), findClaudeCli(), numTok(), sumarUso(), SYSTEM_APPEND

### Community 116 - "Movimientosbackupapi"
Cohesion: 0.27
Nodes (11): fileToBase64(), getMovimientosBackupCoverage(), getMovimientosRange(), MovimientoNormalized, movimientosApiPrefix(), MovimientosBackupCoverage, MovimientosBackupDay, MovimientosIngestResult (+3 more)

### Community 117 - "Etlsegmenttramoflow"
Cohesion: 0.36
Nodes (11): collectRowFechas(), computeSegmentTramoHourlyFlow(), countSegmentTramoFlowPlacement(), fechaFromIso(), hourFromIso(), pad2(), resolveFechaEnCalendario(), resolveFechasOrdenadas() (+3 more)

### Community 118 - "Agentes"
Cohesion: 0.21
Nodes (8): get_subagente(), Skills descriptivas de subagentes (paridad con server/etl-agent-skills.mjs)., SubagenteConfig, _tools_by_name(), tools_for_subagente(), Re-export de configuración Knowledge Contratos., Re-export de configuración Knowledge Truckflow., Re-export de configuración Seguridad.

### Community 119 - "Docs"
Cohesion: 0.17
Nodes (12): Regla de tablas canónicas y denominador, Rama muerta en etlPlatformCircuitInference (no reproducir), R7 se decide por plataforma Excel VOLCABLE_PTO, Circuito R7 (Ricardone→San Lorenzo volcables), Desambiguación R7↔SL1 por evidencia Ricardone/SL, Tiempo total puerta a puerta = salida−ingreso Excel, Regla del denominador (movimientos ≠ recorridos), merged_truckflow_movimientos (prohibido para contar) (+4 more)

### Community 120 - "Docs"
Cohesion: 0.18
Nodes (12): check-arch-rules.mjs (freeze + pureza), Fase 0 — Red de seguridad, etlGoldenMaster.test.ts (hash de CSVs), Fase 1 — Extraer src/etl-core, Receta mover con shim (@deprecated re-export), Separación browser vs funciones puras (DOM/Vite fuera del core lógico), check-arch-rules.mjs (gate de capas), Lección knip: grepear scripts/server/tools antes de borrar (+4 more)

### Community 121 - "Scripts"
Cohesion: 0.20
Nodes (10): byOp, hasLeg(), header, lines, n(), ops, R7, rows (+2 more)

### Community 122 - "Anomalyclassifier"
Cohesion: 0.23
Nodes (10): AnomalyKind, AnomalyReason, AnomalyVerdict, classifyAnomaly(), ClassifyAnomalyInput, ExecutiveStatusLike, isBehavioralAnomaly(), MatrixFinalStatusLike (+2 more)

### Community 123 - "Truckflowrawjourneystats"
Cohesion: 0.32
Nodes (9): ApiJourneyCountByDayTable(), Props, countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), enrichApiJourneyStatsFromRawEvents(), normalizeApiJourneyDayStat(), RawJourneyCountByOccurredDay, rawJourneyUidFromRecord() (+1 more)

### Community 124 - "Stitch"
Cohesion: 0.20
Nodes (12): Anomalías panel with patente search and severity badges, Bottleneck insight: cuello de botella en Calada, P90 >60min, Cambiar Semana button (week selector), Chat IA assistant panel with suggested prompts, Chat inline table (Patente/Calada min/Estado), Header: Ricardone, Semana 06-12 jul 2026, run_882, KPI Tiempos panel (bottleneck timing chart), Truckflow Ops - Operación Semanal (run_882) screen (+4 more)

### Community 125 - "Scripts"
Cohesion: 0.18
Nodes (7): debugRows, finalRows, idx, idxByType, idxCalada, idxVars, root

### Community 126 - "Live"
Cohesion: 0.25
Nodes (8): getRtspUrl(), httpJson(), listChannels(), login(), md5(), PORT, createDssLiveRouter(), DSS_API

### Community 127 - "Scripts"
Cohesion: 0.27
Nodes (10): dayFilesOk(), dayRange(), DEFAULT_DATA_ROOT, DEFAULT_OUT, __dirname, main(), parseArgs(), printHelp() (+2 more)

### Community 128 - "Runs"
Cohesion: 0.27
Nodes (8): __dirname, PROJECT_ROOT, RUNS_ROOT, listEtlRunsFromSupabase(), readJson(), uploadEtlRunFromDisk(), uploadObject(), createServerSupabaseClient()

### Community 129 - "Data"
Cohesion: 0.20
Nodes (9): findCircuitByCode(), getCodigoBase(), MASTER_CIRCUIT_CATALOG, MasterCircuitGroup, MasterCircuitItem, MasterPlantCatalog, SL_RECEPCION_BASE, SL_RECEPCION_ESPERA_PLAYA (+1 more)

### Community 130 - "Tools"
Cohesion: 0.18
Nodes (9): ae785cs, byUid, crossDayPattern, csvPath, __dirname, hdr, lines, multi (+1 more)

### Community 131 - "Agentes"
Cohesion: 0.36
Nodes (9): create_run(), get_circuit_catalog(), get_client(), get_summary(), list_runs(), list_tables(), query_table(), Cliente HTTP fino del etl-api (Fase 4). Sin lógica de negocio. (+1 more)

### Community 132 - "Power"
Cohesion: 0.22
Nodes (10): Nivel D circuitos (partición), Nivel E KPI (D×C), Precedencia ANOMALO>INCOMPLETO>DEDUCIDO>COMPLETO, Umbral de evidencia >3 lecturas de cámara, committee_group (capa comité v10), Contrato Power BI / comité, executive_status (capa ejecutiva), matrix_final_status (capa técnica) (+2 more)

### Community 133 - "Registry"
Cohesion: 0.20
Nodes (8): activePlates, __dirname, doc, entries, PROJECT_ROOT, REGISTRY_FILE, supabase, toInsert

### Community 134 - "Docs"
Cohesion: 0.25
Nodes (9): contracts/ registro de tablas (fuente única), scripts/build-levels.ts, canonicalJourneyKey() (llave única), Modelo de niveles A→E (v14), Nivel C operaciones (A×B), time_source (tiempos los da la cámara), Tablas canónicas por pregunta, excel_operations_with_truckflow (tabla) (+1 more)

### Community 135 - "Scripts"
Cohesion: 0.22
Nodes (6): diagnostics, flagged, groups, ready, root, rows

### Community 136 - "Server"
Cohesion: 0.33
Nodes (4): CATEGORIES, createTruckPlateRegistryRouter(), createJsonPlateRegistryStore(), createSupabasePlateRegistryStore()

### Community 137 - "Stitch"
Cohesion: 0.28
Nodes (9): Botón primario 'Abrir Corrida', Input de comando/consulta deshabilitado hasta elegir semana, Tarjeta selector de período (Rango Lunes→Domingo), Atajos de rango (Esta semana / Anterior), Truckflow Ops — Inicio / Selección de Período (screen), Pie de estado (Sistema Operativo Activo / v2.4.1-stable / terminal), Estética terminal/monoespaciada minimalista (blanco + verde), Barra superior (TRUCKFLOW OPS / VICENTIN RICARDONE / run_882) (+1 more)

### Community 138 - "Claude"
Cohesion: 0.29
Nodes (8): Knowledge Truckflow (agente cámaras/journeys), Seguridad (agente anomalías/alertas), Runbook agentes MCP + Claude Code, Suscripción sin ANTHROPIC_API_KEY, Tool explain_journey, Tool get_circuit_catalog, circuit_timing_summary (tabla), final_circuits (tabla)

### Community 139 - "Scripts"
Cohesion: 0.25
Nodes (5): diagnostics, flagged, groups, root, rows

### Community 140 - "Reports"
Cohesion: 0.39
Nodes (6): clean(), MovimientosReconciliation, movimientosReconciliationCsv(), reconcileMovimientos(), ReconEntry, ReconPlateRow

### Community 141 - "Etlcontractfirstprogress"
Cohesion: 0.46
Nodes (6): ContractFirstProgressCallback, ContractFirstProgressEvent, ContractFirstStageTiming, countUniqueNormalizedPlates(), emitContractFirstProgress(), runContractFirstStage()

### Community 142 - "Migracion"
Cohesion: 0.29
Nodes (7): DAG declarativo de steps (reads/writes), Port fijado por paridad (gate por columna), Plan migración v3 (contrato primero), Capa agéntica 3 niveles (semantic/SQL/linaje), CIRCUIT_CATALOG (canónico, S-codes), Handoff limpieza y refactor de arquitectura, EXECUTIVE_CIRCUIT_MATRIX (derivado)

### Community 143 - "Scripts"
Cohesion: 0.29
Nodes (5): byOp, counts, R7, root, rows

### Community 144 - "Scripts"
Cohesion: 0.29
Nodes (5): ETLWORKBENCH_IMPORT_BASELINE, MASTER_CATALOG_IMPORT_BASELINE, ROOT, violations, walk()

### Community 145 - "Scripts"
Cohesion: 0.29
Nodes (6): args, __dirname, env, result, root, tsEntry

### Community 146 - "Stitch"
Cohesion: 0.43
Nodes (7): Agente analista de logística Ricardone (dominio conversacional), Composer de entrada de mensaje con adjunto y enviar, Estado vacío del chat con avatar de agente y saludo, Header con contexto de run (VICENTIN RICARDONE, run_882, rango de fechas), Chat inicial v2 — pantalla Agente operativo, Sidebar navegación Truckflow Ops (Chat agente, Consola cámaras LPR, Pipeline ETL), Tarjetas de sugerencias de consultas operativas

### Community 147 - "Stitch"
Cohesion: 0.43
Nodes (7): Drill-down links (Ver histograma completo, Ver desglose por tramos), Empty state (Sin datos de desglose seleccionados + Iniciar Nueva Consulta CTA), KPI card row (Media Preingreso+Calada 42m, P90 78m, Ops 1842), Logistica screen (Truckflow Ops v3 mockup), Left sidebar navigation (Consultar, Logistica, Seguridad, Monitoreo vivo, Eventos/Alertas), Bottom status bar (SYSTEM_LOAD, REGION SL_RICA_NORTH), Week window selector (Semana 06-12 Jul 2024)

### Community 148 - "Claude"
Cohesion: 0.47
Nodes (6): Knowledge Contratos (agente Excel/productos), mcp_server.py (servidor MCP stdio), ETL API local (truckflow-local-server.mjs), Servidor MCP etl, Tool query_table, Tool run_etl

### Community 149 - "Server"
Cohesion: 0.60
Nodes (5): buildApiJourneyDayStat(), countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), occurredAtLocalDayKey(), rawJourneyUidFromRecord()

### Community 150 - "Package"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 151 - "Docs"
Cohesion: 0.83
Nodes (4): POC video en vivo DSS, DSS OpenAPI (Dahua DSS Pro V8.7), go2rtc (RTSP→WebRTC/MSE), server/dss-live.mjs

### Community 152 - "Ruta"
Cohesion: 0.50
Nodes (4): EXECUTIVE_CIRCUIT_MATRIX (R1..R34, cobertura, punto fuerte), Audit matriz cámaras R1/R5/R6/R7 (Excel batch), Audit matriz R1 por cámara, Audit matriz R5 por cámara

### Community 153 - "Scripts"
Cohesion: 0.50
Nodes (3): child, dir, script

### Community 155 - "Tools"
Cohesion: 0.50
Nodes (3): byUid, out, outPath

## Knowledge Gaps
- **850 isolated node(s):** `C:\Users\Usuario\Desktop\Dashboard_camiones\agentes\.venv\Scripts\etl-mcp.exe`, `ETL_API_BASE`, `agentes`, `name`, `private` (+845 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `xlsx` connect `Etltiemposentrepasos` to `Etlexternalmovimientoscontrato`, `Package`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package` to `Agentes`, `Package`, `Package`, `Etltiemposentrepasos`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `RealJourneyEventDto` connect `Realjourneyquality` to `Índice clasificación circuitos`, `Realjourneydepurationmap`, `Etltransformpipeline`, `Pages`, `Live`, `Live`, `Etlricsanlorenzoroute`, `Powerbicircuitcsvbundle`, `Rearcamerafilter`, `Components`, `Realjourneycyclesplit`, `Cameracalibrationdashboardmodel`, `Powerbietlexportbuilder`, `Preliminarycircuitclassify`, `Components`, `Livecameradiagnostics`, `Etloperationalalertmatch`, `Scripts`, `Live`, `Auditexcelcameramatrix`, `Auditexcelcameramatrix`, `Truckfloweventospresentation`, `Etlruncacheapi`, `Generateclassificationmatrixcsv`, `Realtruckflowcleandataset`, `Etlcaladacameraactivity`, `Truckplateregistryfilter`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `runEtlTransform()` (e.g. with `e()` and `flattenAlertForEtlCsv()`) actually correct?**
  _`runEtlTransform()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 87 inferred relationships involving `e()` (e.g. with `buildForRun()` and `walk()`) actually correct?**
  _`e()` has 87 INFERRED edges - model-reasoned connections that need verification._
- **What connects `C:\Users\Usuario\Desktop\Dashboard_camiones\agentes\.venv\Scripts\etl-mcp.exe`, `ETL_API_BASE`, `agentes` to the rest of the system?**
  _850 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Líquidos · workbench` be split into smaller, more focused modules?**
  _Cohesion score 0.0506872852233677 - nodes in this community are weakly interconnected._