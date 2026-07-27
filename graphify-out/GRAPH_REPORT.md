# Graph Report - C:/Users/Usuario/Desktop/Dashboard_camiones  (2026-07-27)

## Corpus Check
- 160 files · ~348,024 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3834 nodes · 9843 edges · 179 communities (161 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 230 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Merge Excel-first / Contract-first
- Catálogo y matriz de circuitos
- Tiempos de tramo (KPI)
- Clasificación y buckets de comité
- Movimientos de líquidos
- Cruce de alertas operativas
- CSV y reconciliación
- Monitor de cámaras en vivo
- Pipeline ETL (orquestador)
- Timeline San Lorenzo
- KPI tiempos y scatter por día
- Página de diagnóstico legacy
- Tipos de movimientos e inferencia de plataforma
- Transiles interno y externo
- Índice de clasificación de circuitos
- Journeys y reconstrucción de eventos
- Cámaras traseras y sectores SL
- API Truckflow y golden master
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 151
- Community 152
- Community 153
- Community 154
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 166
- Community 167
- Community 169
- Community 170
- Community 172
- Community 173
- Community 174
- Community 175

## God Nodes (most connected - your core abstractions)
1. `e()` - 88 edges
2. `runEtlTransform()` - 76 edges
3. `RealJourneyDiagnosticsPageLegacy()` - 66 edges
4. `runMovimientosContratoIntegration()` - 48 edges
5. `RealJourneyEventDto` - 45 edges
6. `parseCsvToRecords()` - 38 edges
7. `normalizeRealEventPoint()` - 31 edges
8. `makeTable()` - 29 edges
9. `recordsToCsv()` - 27 edges
10. `tableToCsv()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Problema raíz: dos motores Transform en paralelo (Workbench vs Comité/v2)` --semantically_similar_to--> `Tres clasificadores de circuitos en paralelo (deuda técnica)`  [INFERRED] [semantically similar]
  ETL_PLAN_UNIFICADO.md → PLAN_REFACTOR_ETL_AGENTES.md
- `Contract-first CLI (runMovimientosContratoIntegration vía tsx)` --semantically_similar_to--> `run-etl-headless.ts (runner que persiste)`  [INFERRED] [semantically similar]
  scripts/run-truckflow-transform-local.README.md → docs/migracion/FASE_4_SERVICIO_PERSISTENCIA.md
- `walk()` --indirect_call--> `e()`  [INFERRED]
  scripts/check-arch-rules.mjs → src/etl-core/reports/movimientosReconciliation.test.ts
- `buildCircuitEtlV2CsvBundle()` --indirect_call--> `n()`  [INFERRED]
  src/features/real-truckflow/etlWorkbench/powerBiCircuitCsvBundle.ts → scripts/audit-sl-funnel-from-scatter.mjs
- `Audit matriz cámaras R1/R5/R6/R7 (Excel batch)` --conceptually_related_to--> `EXECUTIVE_CIRCUIT_MATRIX (R1..R34, cobertura, punto fuerte)`  [INFERRED]
  RUTA/audit-excel-camera-matrix-batch-summary.txt → ETL_TRANSFORM_V9_RULES.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flujo batch ETL (extract → staging → transform → load pb_*)** — server_truckflow_local_server, src_features_real_truckflow_etlworkbench_etlworkbenchcontext, src_features_real_truckflow_etlworkbench_etltransformpipeline, src_features_real_truckflow_etlworkbench_powerbiload [EXTRACTED 1.00]
- **Clasificación en 3 capas (técnica/ejecutiva/comité)** — etl_transform_v9_rules_matrix_final_status, etl_transform_v9_rules_executive_status, etl_transform_v9_rules_committee_group [EXTRACTED 1.00]
- **Tres clasificadores de circuitos en paralelo (deuda técnica)** — src_services_realpreliminarycircuit, src_services_circuitetlv2, src_features_real_truckflow_etlworkbench_finalcircuitscoring [EXTRACTED 1.00]
- **Pipeline de migración por fases (etl-core → agentes)** — docs_migracion_fase_1_etl_core, docs_migracion_fase_2_typed_table, docs_migracion_fase_3_catalogo_unico, docs_migracion_fase_4_servicio_persistencia, docs_migracion_fase_5_agentes_python [EXTRACTED 1.00]
- **Tres clasificadores de circuito paralelos** — docs_migracion_fase_3_catalogo_unico_finalcircuitscoring, docs_migracion_fase_3_catalogo_unico_circuitetlv2, docs_migracion_fase_3_catalogo_unico_realpreliminarycircuit [EXTRACTED 0.90]
- **Flujo de la capa de agentes (chat → tools → etl-api)** — docs_migracion_fase_5_agentes_python_orquestador, docs_migracion_fase_5_agentes_python_subagentes, docs_migracion_fase_5_agentes_python_tools, docs_migracion_fase_5_agentes_python_etl_client, docs_migracion_fase_4_servicio_persistencia_etl_api [EXTRACTED 1.00]

## Communities (179 total, 18 thin omitted)

### Community 0 - "Merge Excel-first / Contract-first"
Cohesion: 0.06
Nodes (70): aggregateJourneyStats(), argentinaDayBoundsMs(), buildEvidenceFromMatches(), buildExcelFirstReviewSample(), buildExcelPeriodContext(), buildPlateIndex(), buildWindowFromOpts(), CANDIDATE_DIAG_HEADERS (+62 more)

### Community 1 - "Catálogo y matriz de circuitos"
Cohesion: 0.06
Nodes (66): EXECUTIVE_CIRCUIT_MATRIX (R1..R34, cobertura, punto fuerte), Regla líquido vs sólido (RicCalLiq → R8/R16 vs RS_REC/RS_DESP), Catálogo de circuitos definido 4 veces → unificar (R* clave única), Audit matriz cámaras R1/R5/R6/R7 (Excel batch), Audit matriz R1 por cámara, Audit matriz R5 por cámara, SWITCH_ORIGINAL, hasTransileRicardoneEvidence() (+58 more)

### Community 2 - "Tiempos de tramo (KPI)"
Cohesion: 0.05
Nodes (63): Análisis de tiempos por circuito (circuit_timing_summary / segment_timing_kpi), aggregateFromLegs(), BalanzaStayCandidateDiagnostic, BalanzaStayTimedSegmentsInput, BalanzaStayTimingDiagnostic, buildExecutiveCircuitSegmentTemplate(), DISCHARGE_ROLLUP_ALLOWED_REAR_DEVICES, EXECUTIVE_CIRCUIT_SEGMENT_TEMPLATE (+55 more)

### Community 3 - "Clasificación y buckets de comité"
Cohesion: 0.07
Nodes (64): Buckets de clasificación (completos / incompletos ≤2 lecturas / anómalos), Capa comité committee_group v10 (COMPLETOS/VARIACIONES_OPERATIVAS/ANOMALIAS), Capa técnica matrix_final_status (COMPLETO/DEDUCIDO/INCOMPLETO/ANOMALO), applyGoldenAnomalyOverride(), AMBIGUOUS_INFERRED_CODES, AnalysisScope, AnomalyLeg, AnomalyOriginPlant (+56 more)

### Community 4 - "Movimientos de líquidos"
Cohesion: 0.07
Nodes (64): op(), AceiteTruckflowExcelCrossRow, anySlLiquidS10(), argentinaDayKeyFromMs(), buildEventsByPlate(), buildExcelFirstGapRows(), buildLiquidMovementsReport(), buildRicCalLiqAuditSlot() (+56 more)

### Community 5 - "Cruce de alertas operativas"
Cohesion: 0.06
Nodes (62): accumulateOperationalAlertsMatch(), alertTimeMs(), alertWithinJourneyWindow(), attachExecutiveBucketsToOperationalAlertRows(), computeOperationalAlertCrossMetrics(), crossOperationalAlerts(), CrossOperationalAlertsResult, emptyJourneyOperationalAlertSummary() (+54 more)

### Community 6 - "CSV y reconciliación"
Cohesion: 0.07
Nodes (53): csvEscapeCell(), recordsToCsv(), clean(), MovimientosReconciliation, movimientosReconciliationCsv(), reconcileMovimientos(), ReconEntry, ReconPlateRow (+45 more)

### Community 7 - "Monitor de cámaras en vivo"
Cohesion: 0.07
Nodes (47): LiveCameraMonitor, LiveDetailTab, LiveTableColumn, LiveCameraPlayerModal(), LoadState, getLiveCameraStatus(), LiveCameraStatus, LiveCameraStream (+39 more)

### Community 8 - "Pipeline ETL (orquestador)"
Cohesion: 0.08
Nodes (50): Golden master test (fingerprint + hash CSVs), runEtlTransform unificado (orquestador ETL único), Archivos-dios (etlSegmentTiming 5k, etlTransformPipeline 3k LOC), EXECUTIVE_MERGE_CANDIDATE_MAX_GAP_MINUTES, EtlProfiler, alertOccurredAtIso(), buildPartialOutputTramo1(), emptyJourneyAlertSummaryRow() (+42 more)

### Community 9 - "Timeline San Lorenzo"
Cohesion: 0.09
Nodes (52): buildR7SlBalanzaSalidaFlags(), diagnoseR7SlBalanzaIngresoSalida(), resolveTimedSegmentLeg(), shouldUseExcelCaladoAsSlDescarga(), compositeSlScatterHorarioFuente(), correctSlBalanzaDescargaStayTiming(), earliestSlIngresoMsForComite(), earliestSlPoint() (+44 more)

### Community 10 - "KPI tiempos y scatter por día"
Cohesion: 0.08
Nodes (48): excelOperationSegmentsForScatterCsv(), buildKpiTiemposArtifacts(), KpiTiemposBuildOutput, KpiTiemposMovimientosSnapshot, auditSlBalanzaScatterEligibility(), buildExcelScatterByDaySources(), buildSegmentScatterByDayRows(), colorForFranja() (+40 more)

### Community 11 - "Página de diagnóstico legacy"
Cohesion: 0.09
Nodes (47): j(), buildPreliminaryCircuitDailySummary(), enrichCaladaSanLorenzoConfidence(), buildAlertsChannelQueryNoTimeFilter(), downloadCsv(), exportSimpleBarPng(), getRecentDefaultRange(), INC_PRELIM_FILTERS (+39 more)

### Community 12 - "Tipos de movimientos e inferencia de plataforma"
Cohesion: 0.11
Nodes (42): ExternalMovimientoContratoNormalized, mov(), applyExternalCircuitToJourney(), circuitFromCode(), excelAnchorJourneyPriority(), inferAceiteLiquidExecutiveCircuit(), inferCircuitFromExternalMovimiento(), InferredExecutiveCircuit (+34 more)

### Community 13 - "Transiles interno y externo"
Cohesion: 0.07
Nodes (42): TRANSILE_EXTERNO_CIRCUIT_FAMILIES, TRANSILE_EXTERNO_OPERATION_HEADERS, transileExternoOperationsCsv(), transileExternoSessionsCsv(), TransileExternoSummary, transileExternoSummaryCsv(), TRANSILE_INTERNO_SESSION_HEADERS, TransileInternoSession (+34 more)

### Community 14 - "Índice de clasificación de circuitos"
Cohesion: 0.07
Nodes (47): AnomalyReasonCount, BALANZA_LOGICAL_CODES, buildExecutiveCircuitBarSlices(), buildSuspiciousDischargeWithoutBalanza(), buildSuspiciousSlExitRicReturn(), CircuitPieSlice, classificationOrder(), collectSuspiciousExcludedPlates() (+39 more)

### Community 15 - "Journeys y reconstrucción de eventos"
Cohesion: 0.09
Nodes (31): Informe journeyUid abierto en API Truckflow, Bug journeyUid abierto (mismo UID = varios viajes multi-día), Merge automático de journeys fragmentados (gap ≤240min, OCR ≥0.92), RealJourneyEventDto, ReconstructedRealJourney, ReconstructedRealJourneyCore, ReconstructedRealJourneyWithQuality, ReconstructedRealSiteId (+23 more)

### Community 16 - "Cámaras traseras y sectores SL"
Cohesion: 0.09
Nodes (39): listSanLorenzoInstalledCameras(), listSanLorenzoRearDeviceCodes(), lookupSanLorenzoSectorFallback(), isEtlRearCameraDevice(), listEtlRearDeviceCodes(), RAW_REAR_DEVICES, SET, buildTransileInternoVolcableReport() (+31 more)

### Community 17 - "API Truckflow y golden master"
Cohesion: 0.10
Nodes (39): ApiRealJourneyEventRow, buildFixedHourChunks(), fetchAlertsAdaptive(), fetchAlertsOneChunk(), fetchEventsAdaptive(), fetchEventsOneChunk(), fetchLiveRangeMerged(), LiveChunkFetchStats (+31 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (41): ExcelCameraComparativaPanel(), Props, cameraCalibrationAggregatesToCsv(), cameraCalibrationDetailToCsv(), CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS, countRowCapturePointsForCalibration(), DESCARGA_CAMERA_STEP_KEYS, getCalibrationAnalysisSteps() (+33 more)

### Community 19 - "Community 19"
Cohesion: 0.10
Nodes (40): CameraMatrixDetailRow, DayNight, RecognitionSegment, buildCameraCalibrationReport(), buildExcelCameraMatrixDetailed(), classifyRecognitionSegment(), dayNightForMovimiento(), devicesMatchingStep() (+32 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (39): lookupSanLorenzoCameraByDevice(), inferSiteLocal(), lookupRicDevicePoint(), NormalizedRealEventPoint, normalizeRealEventPoint(), RIC_DEVICE_POINT_MAP, collapseConsecutiveEqual(), computeR7LegDurations() (+31 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (38): Mapa del backend lógico Transform Truckflow, Uso recomendado — Backend Transform sin UI, Plan de limpieza futura — Transform Truckflow, downloadPowerBiNamedCsvZipSync(), triggerAnchorDownloadZip(), triggerBrowserDownloadsSequential(), triggerCommitteeCsvDownloadsSync(), triggerPowerBiDebugDownloadsSequential() (+30 more)

### Community 22 - "Community 22"
Cohesion: 0.05
Nodes (41): 1. Qué son las “4 skills” del chat, 2. Layout de `runs/` (fuente de verdad), 3. Flujo Process → agente, 4. Checklist, Limpieza legacy, Reglas, Subagentes Claude + carpeta `runs/` — fuente única por ventana, Tablas núcleo (las que el agente debe usar) (+33 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (33): GlobalRangeSelector(), STAGE_LABEL, CLASS_BY_STATUS, LABELS, StatusBadge(), isValidTimeHHMM(), normalizeTimeHHMM(), parseLocalPeriodEnd() (+25 more)

### Community 24 - "Community 24"
Cohesion: 0.06
Nodes (40): Fase 1: Extraer src/etl-core, src/etl-core (núcleo ETL puro), Patrón mover-con-shim (re-export deprecado), Fase 2: TypedTable, TypedTable (intercambio tipado vs CSV strings), Fase 3: Catálogo único de circuitos, CIRCUIT_CATALOG (fuente única de circuitos), circuitEtlV2 (clasificador legacy) (+32 more)

### Community 25 - "Community 25"
Cohesion: 0.08
Nodes (39): Entidad HistoricalTrip (viaje histórico), KPIs analíticos ampliados (estadía, variabilidad, flujo, densidad), clampDurationMinutes(), getHourFromIso(), getShiftForHour(), OPERATIONAL_SHIFTS, ShiftConfig, getSectorCapacityByPlant() (+31 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (40): buildBalanzaStayFlags(), buildEnrichedTimelineForBalanzaDiagnosis(), computeCameraBalanzaStayMinutesFromEvents(), computeCameraBalanzaStayMinutesFromTimeline(), diagnoseBalanzaStayFromJourney(), diagnoseBalanzaStayFromTimedSegments(), earliestSegmentStartForCode(), enrichTimelineWithExcelDischarge() (+32 more)

### Community 27 - "Community 27"
Cohesion: 0.09
Nodes (36): lookupRealSectorCode(), REAL_SECTOR_CODE_MAP, RealSectorMappingEntry, RealSectorMapSiteId, UNMAPPED_LOGICAL_SECTOR_PLACEHOLDER, buildSanLorenzoSectorEntries(), sectorDisplayName(), buildCameraCoverageSummary() (+28 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (38): isGoldenAnomalyReason(), isPelletCircuitCode(), PELLET_TRANSILE_CIRCUIT_CODES, AnomalyListContext, buildAnomalyListContextFromTransformCsv(), buildAnomalyReviewSummary(), buildAnomalySequenceBreakdown(), buildCommitteeCircuitCrossTab() (+30 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (30): annotateRunManifest(), app, buildListUrl(), DATA_ROOT, daysInclusive(), __dirname, dssLive, ensureDir() (+22 more)

### Community 30 - "Community 30"
Cohesion: 0.08
Nodes (36): PreliminaryCircuitClassification, classifyOperationalPreliminaryCircuit(), classifyPreliminaryRealCircuit(), collapseConsecutiveEqual(), countCode(), countEvidencePoints(), countExcludedRearLogicalPoints(), DESCARTADO_CODES (+28 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (31): argentinaLocalMinutesOfDay(), argentinaLocalParts(), ensureArgentinaOffsetIso(), formatArgentinaIsoFromMs(), hasExplicitTimezone(), normalizeTimestampForExport(), operationalDayKeyFromIso(), pad2() (+23 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (30): inferPlantaFromSegment(), buildAllSectorOccupancy30MinRows(), buildSectorOccupancy30MinSeries(), computeSectorOccupancyFromScatter(), countStockInitialJourneys(), fechaFromMs(), filterScatterRowsForOccupancyDay(), franjaOperativaFromHour() (+22 more)

### Community 33 - "Community 33"
Cohesion: 0.08
Nodes (28): DataDistributionDonut(), Slice, DataQualityFunnel(), Stage, DiagDrawer(), JourneyQuickFilter, PowerBiExportLoadedSummary, RealDataMainTab (+20 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (28): buildRegistryLookup(), normalizeRegistryPlate(), TRUCK_PLATE_REGISTRY_CATEGORY_LABELS, TruckPlateRegistryCategory, TruckPlateRegistryDocument, TruckPlateRegistryEntry, getTruckflowHealth(), localApiPrefix() (+20 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (30): formatIsoLocal(), inferSourceDateFromFileName(), normalizeDeVuelta(), normalizeMovementType(), normalizePlate(), normalizeProduct(), hasMovimientosSource(), runExcelMovimientosNormalizeStep() (+22 more)

### Community 36 - "Community 36"
Cohesion: 0.10
Nodes (33): buildCircuitEtlV2CsvBundle(), buildOperationalSessionsPlateSite(), buildQualitySummary(), canonicalPlateFromEvents(), CIRCUIT_ETL_V2_FILENAMES, CIRCUIT_MATRICES, circuitStatusRankFusion(), CircuitV2NamedCsv (+25 more)

### Community 37 - "Community 37"
Cohesion: 0.09
Nodes (30): isValidArgentinaPlate(), normalizePlate(), isValidObservedPlate(), classifyAlert(), findSimilarPlateReadings(), investigateNearbyAlerts(), levenshtein(), NearbyAlertClassification (+22 more)

### Community 38 - "Community 38"
Cohesion: 0.08
Nodes (31): TransileExternoReclasificacionRow, committeePieFromGroup(), ANOMALY_SEQUENCE_CSV_HEADERS, AnomalyReviewSummary, AnomalySequenceBreakdownRow, anomalySequenceSummaryCsv(), CIRCUIT_PIE_COLORS, CircuitClassificationIndex (+23 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (30): listRawReadsInOperationWindow(), auditEventInOperationWindow(), auditEventInstantsMs(), buildCameraAuditCorpus(), buildExcelCameraMatrix(), CameraStepSummary, collectOperationWindowEvents(), diagnoseBalanzaEgresoPlateSources() (+22 more)

### Community 40 - "Community 40"
Cohesion: 0.11
Nodes (31): Contrato de salida pb_* (comité / Power BI), Cruce alertas operativas (INVALID_ROUTE/INVALID_START_JOURNEY), appendLoadMeta(), buildFolderName(), buildPowerBiZipName(), classifyFileName(), CommitteeGroup, consolidatePowerBiLoad() (+23 more)

### Community 41 - "Community 41"
Cohesion: 0.10
Nodes (24): FRANJA_HORARIA_COLORS, FRANJA_HORARIA_ORDER, FRANJA_HORARIA_WINDOWS, FranjaHoraria, SEGMENT_SCATTER_DISPLAY_MAX_MINUTES, chartVisibleExportCsv(), downloadChartVisibleCsv(), TURNO_SCATTER_COLORS (+16 more)

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (28): getTruckflowListDays(), parseJson(), postTruckflowExportOneDay(), postTruckflowExportPeriod(), postTruckflowExportWindow(), postTruckflowJourneyStatsPeriod(), postTruckflowLoadLocalPeriod(), TruckflowApiJourneyDayStat (+20 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (26): ExecutiveSampleProductFilter(), Props, ProductFilterSelect(), Props, excelOpsHasData(), ExcelOpsSource, buildExecutiveProductFilterPlan(), entryBelongsToAceiteExecutiveView() (+18 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (26): xlsx, buildTiemposEntrePasosIndex(), cellStr(), classifyContratoXlsxFromHeaders(), ContratoXlsxKind, enrichMovimientosWithTiemposEntrePasos(), findTepHeaderRow(), headerFieldMap() (+18 more)

### Community 45 - "Community 45"
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

### Community 46 - "Community 46"
Cohesion: 0.13
Nodes (25): Args, loadEventsFromFile(), main(), materializeTableJson(), parseArgs(), persistPowerBiPack(), persistTables(), printHelp() (+17 more)

### Community 47 - "Community 47"
Cohesion: 0.13
Nodes (23): applySourceDateGuard(), combineDateTime(), dateOnlyKey(), daysFromSourceDate(), excelSerialToDate(), isDayFirstDateString(), MOVEMENT_MAP, normalizePlant() (+15 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (26): buildSegmentScatterAnalysis(), buildByCircuitProduct(), buildSampleSummary(), computeStayTimeStats(), computeVariabilityStats(), coefficientOfVariation(), detectOutliersIqr(), detectOutliersZScore() (+18 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (27): entryDevices(), entryKey(), entryLabel(), entrySectorCodes(), filterAlertsByMonitorScope(), filterEventsByMonitorScope(), findLiveSectorEntry(), findLiveSectorEntryForScope() (+19 more)

### Community 50 - "Community 50"
Cohesion: 0.10
Nodes (20): Contrato Power BI / comité — ETL Truckflow, Reglas ETL etl_transform_v9 (+v10/v12), Criterio LPR único (alertCode === 'LPR_MALFUNCTION'), Cámaras traseras excluidas del frente ETL, Apoyo ejecutivo San Lorenzo (refuerza, no reclasifica), Informe ETL Dashboard Truckflow, DEVICE_ALIASES, DEVICE_MAP (+12 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (22): ReconstructedVisit, buildTripSummaryFromEvents(), BarItem, bucketStatus(), DisplayStatus, filterVisitsByStatus(), getEntryTimeMinutes(), getExitTime() (+14 more)

### Community 52 - "Community 52"
Cohesion: 0.15
Nodes (22): CamionProfile, FleetPlateLookupResult, PlantVisitProductOrigin, PlantVisitSource, PlantVisitUpsertInput, VisitaPlanta, fetchFleetStorageStatus(), fetchWithTimeout() (+14 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (23): collapseConsecutive(), detectCaladaToPreingresoRegression(), detectMissingExcelMovement(), detectRicToSlTravelTooSlow(), detectSkippedPointWithExtremeGap(), detectSlRicQuickReturnNoPellet(), EvaluateGoldenAnomalyInput, evaluateGoldenAnomalyRules() (+15 more)

### Community 54 - "Community 54"
Cohesion: 0.12
Nodes (22): cardBorder(), Props, statusLabel(), TRAMO_META, TransformPhaseStepper(), formatElapsed(), Props, TRAMO_LABEL (+14 more)

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (23): dayKeyFromSalida(), extractCtgFromOperationId(), assertNotScatterCsvForRawAudit(), buildExcelMovimientosUniverse(), classifyRawAuditCircuit(), computeExcelPeriodTotals(), ctgKeyForMovimiento(), describeExcelUniverse() (+15 more)

### Community 56 - "Community 56"
Cohesion: 0.14
Nodes (27): legsForAggregate(), buildSegmentTimingIndex(), buildSegmentTimingIndexFromExcelFirstSegments(), circuitRequiresRicardoneEntry(), countUniqueOperationsForCircuit(), filterSegmentTimingIndex(), getCircuitSegmentTemplate(), isExpectedCircuitTransition() (+19 more)

### Community 57 - "Community 57"
Cohesion: 0.10
Nodes (23): assertReadableFile(), auditRows, csvPath, csvRowToJourneyEvent(), { events, sourceLabel }, eventsPath, flagged, { fromDay, toDay, positional } (+15 more)

### Community 58 - "Community 58"
Cohesion: 0.14
Nodes (20): CommitteeGroup, aggregateCircuitSummary(), aggregateCircuitTimingSummaries(), buildCircuitTimingIndex(), CircuitTimingJourneyRow, circuitTimingJourneysCsv(), circuitTimingJourneysFromCsvRows(), circuitTimingSummaryCsv() (+12 more)

### Community 59 - "Community 59"
Cohesion: 0.17
Nodes (23): base(), fetchRunTable(), getRunSummary(), listRunTables(), listWindows(), parseJson(), requestRunEtl(), resolveWindow() (+15 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (27): aceiteTruckflowHaystackFromEntry(), applyExcelFirstReconciliation(), applyExecutiveCircuitCodeToEntry(), buildCircuitClassificationIndex(), debugMatrixHasData(), debugMatrixRowsFrom(), enforceLiquidExcelExecutiveCircuits(), entryAceiteTruckflowExecutiveCode() (+19 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (20): CircuitTimingIndex, buildOutputAfterExcelOnlyStep(), ExcelMovimientosStepResult, KpiTiemposBuildInput, attachContractIntegrationToOutput(), buildContractPrepFromTramo1Serialized(), movimientosStatsFromIntegration(), runContractFirstIntegration() (+12 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (21): EventosTruckflowPresentation(), formatDateOnly(), formatDt(), Props, ACCENT, ExecCardAccent, ExecutiveMetricCard(), HorizontalBarChart() (+13 more)

### Community 63 - "Community 63"
Cohesion: 0.11
Nodes (23): AlertSeverity, AlertStatus, CameraEventRaw, CameraEventsFile, HistoricalTrip, HistoricalTripsFile, IfcCameraCatalogItem, OperationalAlert (+15 more)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (23): ev(), FinalCircuitStatus, finalStatusLabel(), buildCameraCommitteeStatusRows(), buildCircuitCoverageRows(), buildCommitteeExecutiveCsvPack(), buildCommitteeSummaryRow(), buildDssVsTruckflowRows() (+15 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (18): Args, dayFile(), ingestMovimientosBuffer(), main(), parseArgs(), readDay(), writeDay(), LiveScrollTable() (+10 more)

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (23): cors, dotenv, express, fflate, html-to-image, dependencies, cors, dotenv (+15 more)

### Community 67 - "Community 67"
Cohesion: 0.18
Nodes (23): appendPermittedAceiteExcelOrphansToEntries(), buildAceiteCircuitResolutionDebugCsv(), excelLiteIsLiquidOperational(), excelRowIndicatesAceite(), GENERIC_INFERRED_CIRCUIT_CODES, inferExecutiveCircuitFromExcelPlatform(), LIQUID_EXECUTIVE_CIRCUITS, normalizeLiquidExecutiveCircuitCode() (+15 more)

### Community 68 - "Community 68"
Cohesion: 0.09
Nodes (21): DOM, DOM.Iterable, ES2020, src, compilerOptions, allowImportingTsExtensions, isolatedModules, jsx (+13 more)

### Community 69 - "Community 69"
Cohesion: 0.19
Nodes (19): TripResult, CaladaResult, CircuitLetter, CircuitStep, EVENT_TO_LETTER, eventsToCircuit(), getCaladaResult(), getCaladaResultFromRaw() (+11 more)

### Community 70 - "Community 70"
Cohesion: 0.10
Nodes (15): CIRCUIT_CATALOG, CircuitCatalogEntry, CircuitCatalogKind, CircuitCatalogProduct, ACCEPTED_AMBIGUOUS_ALIASES, ACCEPTED_CROSS_KIND_COLLISIONS, ACCEPTED_SAME_KIND_COLLISIONS, KNOWN_UNDEFINED_MATRIX_CODES (+7 more)

### Community 71 - "Community 71"
Cohesion: 0.15
Nodes (18): CHART_VISIBLE_EXPORT_HEADERS, ChartVisibleExportRow, downloadSlowTailCsv(), isStrictTruckflowScatterRow(), legsToChartVisibleExport(), legsToSlowTailExport(), pickSlowTailByDuration(), pickSlowTailScatterRows() (+10 more)

### Community 72 - "Community 72"
Cohesion: 0.10
Nodes (21): autoprefixer, concurrently, devDependencies, autoprefixer, concurrently, postcss, tailwindcss, @types/react (+13 more)

### Community 73 - "Community 73"
Cohesion: 0.12
Nodes (17): circuitCode, eventsPath, excelPath, { fromDay, toDay, minPuntos, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), loadMovimientosContratoFromPath() (+9 more)

### Community 74 - "Community 74"
Cohesion: 0.20
Nodes (18): buildStory(), buildTripFromEvents(), buildTripsFromEventStream(), formatTime(), getDateBucket(), getVisitKey(), getVisitKeyWithMeta(), normalizeEventTypeFromRaw() (+10 more)

### Community 75 - "Community 75"
Cohesion: 0.20
Nodes (18): auditExcelOperationsAgainstRawS1(), ExcelOperationLike, excelWindowMs(), findS1InWindow(), indexS1EventsByPlate(), isRawS1Event(), normalizePlateKey(), operationalInstantIso() (+10 more)

### Community 76 - "Community 76"
Cohesion: 0.19
Nodes (19): resolveDeducedEvidence(), isExecutiveSequenceConfigured(), isJourneyProductivelyEvaluable(), journeyMeetsDeducedEvidenceThreshold(), resolveExecutiveCircuitDecision(), resolveExecutiveCircuitStatus(), resolveOperationalEntry(), resolveProbableSolidExecutiveDecision() (+11 more)

### Community 77 - "Community 77"
Cohesion: 0.16
Nodes (17): buildTaxonomyCoherenceReport(), CircuitEvidence, CircuitStatus, CircuitVerdict, CommitteeGroupView, detectTaxonomyContradictions(), isReconstructable(), isSofterThan() (+9 more)

### Community 78 - "Community 78"
Cohesion: 0.19
Nodes (19): EXCLUDED_INGRESS_ROUTE_ALERT_CODE_SET, EXCLUDED_INGRESS_ROUTE_ALERT_CODES, EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODE_SET, EXCLUDED_INGRESS_ROUTE_ALERT_DEVICE_CODES, EXCLUDED_INGRESS_ROUTE_ALERT_SECTOR_SET, EXCLUDED_INGRESS_ROUTE_ALERT_SECTORS, EXCLUDED_REAR_DEVICE_CODES, getAlertCodeForFilter() (+11 more)

### Community 79 - "Community 79"
Cohesion: 0.16
Nodes (11): SiteContext, SiteContextValue, SiteProvider(), useSite(), getSite(), getSiteIdFromStorage(), setSiteIdInStorage(), Site (+3 more)

### Community 80 - "Community 80"
Cohesion: 0.17
Nodes (15): NormalizedCargoForm, NormalizedEvent, ReconstructedVisitStatus, VisitAlert, VisitMetrics, EventType, LocationKey, buildVisits() (+7 more)

### Community 81 - "Community 81"
Cohesion: 0.20
Nodes (15): EtlAgentChatMessage, EtlAgentChatResponse, EtlAgentStatus, EtlAgentUiPayload, etlApiPrefix(), getEtlAgentStatus(), parseJson(), postEtlAgentChat() (+7 more)

### Community 82 - "Community 82"
Cohesion: 0.14
Nodes (19): buildExecutiveEntryFromExcelOperationRow(), CAMERA_PRESERVED_OPERATIONAL_VARIATIONS, committeeGroupFromExcelFirst(), eventCountFromDetectedSequence(), eventCountFromMatrixRow(), EXCEL_RECONCILIATION_EXCLUDED_VARIATIONS, isExcelReconciliationExcludedEntry(), isExcelReconciliationExcludedVariation() (+11 more)

### Community 83 - "Community 83"
Cohesion: 0.17
Nodes (17): alertTimeMs(), alignAlertsToSegments(), applyTemporalSegmentation(), buildExecutiveSummary(), classifyCommitteeOperationalCircuit(), cloneAlertWithJourney(), cloneEventWithJourney(), CommitteeEtlHint (+9 more)

### Community 84 - "Community 84"
Cohesion: 0.14
Nodes (15): call_tool(), list_tools(), main(), Servidor MCP (stdio) que expone las tools del ETL a Claude Code.  Corre en la SU, _serve(), generar_pptx_comite(), Any, Comunicador: PPTX de comité a partir de get_summary (sin reglas de negocio). (+7 more)

### Community 85 - "Community 85"
Cohesion: 0.11
Nodes (12): anomalies, completeAnomalies, debug, events, groupCounts, noRespeta, parsed, plateByJourney (+4 more)

### Community 86 - "Community 86"
Cohesion: 0.20
Nodes (12): createServerSupabaseClient(), supabasePublicHost(), createTruckFleetRouter(), createJsonFleetStore(), createSupabaseFleetStore(), FUENTE_OK, normalizePlate(), passesCamionPlateDbConstraint() (+4 more)

### Community 87 - "Community 87"
Cohesion: 0.25
Nodes (16): rowGet(), addMetrics(), BucketBase, buildCameraPowerBiAggregates(), buildCameraSummaryRows(), buildDayNightSummaryRows(), buildSectorCameraSummaryRows(), cameraAggregateStatus() (+8 more)

### Community 88 - "Community 88"
Cohesion: 0.24
Nodes (13): CrossCircuitSectorSummary, filterScatterByDayForSector(), legsForCrossCircuitSector(), RICARDONE_CROSS_CIRCUIT_SECTORS, RicardoneCrossCircuitSector, summarizeCrossCircuitSectorFromScatter(), isWithinSegmentScatterDisplayMax(), SegmentScatterByDayRow (+5 more)

### Community 89 - "Community 89"
Cohesion: 0.20
Nodes (17): AlertIndex, attachAlertsToEvents(), buildAlertIndex(), BuildCleanDatasetOptions, buildCleanRealDataset(), DEFAULT_OPTIONS, EventWithAlertInfo, isCloseTime() (+9 more)

### Community 90 - "Community 90"
Cohesion: 0.13
Nodes (17): FASE 0 — Red de seguridad (migración), Contract-first / Excel-first backend (conciliación Movimientos por Contrato), Plan ETL unificado — Datos reales Truckflow, Problema raíz: dos motores Transform en paralelo (Workbench vs Comité/v2), Análisis Excel-first (Excel=verdad operativa, Truckflow=evidencia física), Secuencia R7 San Lorenzo (S0→S1→S5→S7), Catálogo San Lorenzo (12 cámaras, sectores S0–S7), Escenarios de datos (live / march_full / normal) (+9 more)

### Community 91 - "Community 91"
Cohesion: 0.12
Nodes (17): scripts, build, check:arch, contract-first:local, db:migrate:etl-runs, db:migrate:plate-registry, db:sync:plate-registry, dev (+9 more)

### Community 92 - "Community 92"
Cohesion: 0.15
Nodes (15): CIRCUITS, eventsPath, excelPath, { fromDay, toDay, minPuntos, outDir, positional }, loadEventsFromFile(), loadEventsFromTruckflowDir(), loadJsonEventArray(), parseCli() (+7 more)

### Community 93 - "Community 93"
Cohesion: 0.12
Nodes (12): cacheDir, cachePath, candidates, debug, exportPath, exportRows, hasLogical(), missingBalanzaPattern() (+4 more)

### Community 94 - "Community 94"
Cohesion: 0.23
Nodes (14): formatDateTimeShort(), LoadedPeriodSummaryCard(), LoadedPeriodSummaryProps, availableCanonicalKeys(), CANONICAL_CSV_TABLES, CanonicalCsvTable, CanonicalNamedCsv, collectCanonicalCsvBundle() (+6 more)

### Community 95 - "Community 95"
Cohesion: 0.28
Nodes (14): RawJourneyEventLike, excelPlateKeysFromMovimientos(), filterFinalCsvRowsByJourneyUids(), filterJourneysForExcelSearch(), filterRawTruckflowEventsForExcel(), bestPlateBetweenSessions(), CHAR_TO_GROUP, isLikelyOcrPlateMatch() (+6 more)

### Community 96 - "Community 96"
Cohesion: 0.18
Nodes (16): buildOperationalDepurationSnapshot(), collapseLogicalSignature(), DepurationCategoryRow, DepurationComparator, DepurationSequenceRow, distinctRicLogicalSet(), groupEventsByJourneyUid(), journeyMatchesOperationalScope() (+8 more)

### Community 97 - "Community 97"
Cohesion: 0.21
Nodes (12): KEY_ALIASES, normKey(), parseDssReferenceCsv(), DssReferenceMetrics, LoadedTransformDay, LoadGroupType, mergeLoadedDays(), POWER_BI_STABLE_FILES (+4 more)

### Community 98 - "Community 98"
Cohesion: 0.24
Nodes (14): collapsedFrontLogicalPoints(), collapsedLogicalPointsForDischargeRollup(), extractAllSegmentLegsForCircuit(), extractDischargeRollupLegsFromJourney(), extractSegmentLegs(), extractSegmentLegsWithTimes(), extractSlBalancaRollupLeg(), extractSlSalidaEgresoRollupLeg() (+6 more)

### Community 99 - "Community 99"
Cohesion: 0.30
Nodes (4): EtlApiError, EtlClient, Any, RuntimeError

### Community 100 - "Community 100"
Cohesion: 0.13
Nodes (12): client, __dirname, PROJECT_ROOT, SQL_PATH, url, client, __dirname, PROJECT_ROOT (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.21
Nodes (11): outArg, payload, profiler, t0, createEtlProfiler(), EtlProfilerSpan, getGlobalEtlProfiler(), heapMb() (+3 more)

### Community 102 - "Community 102"
Cohesion: 0.21
Nodes (13): ChartPoint, EstadiaHistogramWithRefs(), EstadiaHistogramWithRefsProps, resolveHistogramDomain(), buildIndicadoresForma(), calcCamionesEnColaDerecha(), calcCamionesEnRango(), calcPicoFrecuencia() (+5 more)

### Community 103 - "Community 103"
Cohesion: 0.22
Nodes (10): dispatch_tool(), _explain_journey(), Any, Tools Anthropic tool-use: solo componen llamadas al etl-api (sin reglas de negoc, Ejecuta una tool por nombre. `delegar` requiere delegate_handler., _tool(), tool_result_content(), _truncate() (+2 more)

### Community 104 - "Community 104"
Cohesion: 0.16
Nodes (12): loadMovimientosFromExcelPath(), byOp, hasLeg(), header, lines, n(), ops, R7 (+4 more)

### Community 105 - "Community 105"
Cohesion: 0.19
Nodes (11): apply, __dirname, main(), PROJECT_ROOT, readIndexedRunIds(), RUNS_ROOT, ETL_RUN_CORE_TABLES, isLegacyTimestampRunId() (+3 more)

### Community 106 - "Community 106"
Cohesion: 0.24
Nodes (13): main(), PORT, e(), CircuitMatrixRule, classifyOperationalSession(), collapseGtSequence(), computeSessionScores(), hasCalada() (+5 more)

### Community 107 - "Community 107"
Cohesion: 0.22
Nodes (11): CameraCalibrationReport, RAW_AUDIT_CIRCUIT_CODES, realJourneyEventDtoToCameraAuditRow(), RouteRecognitionSummary, ExcelPeriodTotals, MovimientoContratoLike, parseNormalizedMovimientosCsvRow(), buildExcelCameraComparativaReport() (+3 more)

### Community 108 - "Community 108"
Cohesion: 0.24
Nodes (11): detectKindFromDoc(), extractRecordsFromTruckflowJsonRoot(), ParsedTruckflowFile, parseTruckflowJsonFile(), TruckflowJsonKind, extractTruckflowPayloadArray(), buildCliFinalCsvRowsFromLocalEventJson(), buildCliWorkbenchInputsFromJourneys() (+3 more)

### Community 109 - "Community 109"
Cohesion: 0.21
Nodes (12): client(), etl_base(), _etl_ready(), _free_port(), Tests del etl_client contra el server local (levanta uno efímero si hace falta)., run_id(), test_bad_run_404(), test_circuit_catalog() (+4 more)

### Community 110 - "Community 110"
Cohesion: 0.15
Nodes (8): byDay, DEFAULT_JSON, events, hits, outDir, outPath, root, stamp

### Community 111 - "Community 111"
Cohesion: 0.31
Nodes (12): DEFAULT_PORT, __dirname, fail(), fetchJson(), getFreePort(), main(), ok(), ping() (+4 more)

### Community 112 - "Community 112"
Cohesion: 0.26
Nodes (11): extraMatrixCodesFromTrips(), filterTripsForKpiContext(), KPI_OPERATION_LABELS, KpiMatrixPlant, KpiOperationKind, MATRIX_CODES_BY_PLANT_OP, operationsAvailableForPlant(), supportsKpiCircuitMatrix() (+3 more)

### Community 113 - "Community 113"
Cohesion: 0.36
Nodes (11): collectRowFechas(), computeSegmentTramoHourlyFlow(), countSegmentTramoFlowPlacement(), fechaFromIso(), hourFromIso(), pad2(), resolveFechaEnCalendario(), resolveFechasOrdenadas() (+3 more)

### Community 114 - "Community 114"
Cohesion: 0.21
Nodes (8): get_subagente(), Skills descriptivas de subagentes (paridad con server/etl-agent-skills.mjs)., SubagenteConfig, _tools_by_name(), tools_for_subagente(), Re-export de configuración Knowledge Contratos., Re-export de configuración Knowledge Truckflow., Re-export de configuración Seguridad.

### Community 115 - "Community 115"
Cohesion: 0.23
Nodes (10): AnomalyKind, AnomalyReason, AnomalyVerdict, classifyAnomaly(), ClassifyAnomalyInput, ExecutiveStatusLike, isBehavioralAnomaly(), MatrixFinalStatusLike (+2 more)

### Community 116 - "Community 116"
Cohesion: 0.29
Nodes (10): fileToBase64(), getMovimientosBackupCoverage(), MovimientoNormalized, movimientosApiPrefix(), MovimientosBackupCoverage, MovimientosBackupDay, MovimientosIngestResult, parseJson() (+2 more)

### Community 117 - "Community 117"
Cohesion: 0.32
Nodes (9): ApiJourneyCountByDayTable(), Props, countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), enrichApiJourneyStatsFromRawEvents(), normalizeApiJourneyDayStat(), RawJourneyCountByOccurredDay, rawJourneyUidFromRecord() (+1 more)

### Community 118 - "Community 118"
Cohesion: 0.39
Nodes (11): buildPlantVisitUpsertsFromTransform(), buildTimesByJourney(), dayKeyFromIso(), FleetDatabaseSaveResult, fuenteFromMerge(), mapPlanta(), persistPlantVisitsFromTransform(), plateOkForFleet() (+3 more)

### Community 119 - "Community 119"
Cohesion: 0.18
Nodes (7): debugRows, finalRows, idx, idxByType, idxCalada, idxVars, root

### Community 120 - "Community 120"
Cohesion: 0.25
Nodes (8): getRtspUrl(), httpJson(), listChannels(), login(), md5(), PORT, createDssLiveRouter(), DSS_API

### Community 121 - "Community 121"
Cohesion: 0.27
Nodes (10): dayFilesOk(), dayRange(), DEFAULT_DATA_ROOT, DEFAULT_OUT, __dirname, main(), parseArgs(), printHelp() (+2 more)

### Community 122 - "Community 122"
Cohesion: 0.20
Nodes (9): findCircuitByCode(), getCodigoBase(), MASTER_CIRCUIT_CATALOG, MasterCircuitGroup, MasterCircuitItem, MasterPlantCatalog, SL_RECEPCION_BASE, SL_RECEPCION_ESPERA_PLAYA (+1 more)

### Community 123 - "Community 123"
Cohesion: 0.18
Nodes (9): ae785cs, byUid, crossDayPattern, csvPath, __dirname, hdr, lines, multi (+1 more)

### Community 124 - "Community 124"
Cohesion: 0.36
Nodes (9): create_run(), get_circuit_catalog(), get_client(), get_summary(), list_runs(), list_tables(), query_table(), Cliente HTTP fino del etl-api (Fase 4). Sin lógica de negocio. (+1 more)

### Community 125 - "Community 125"
Cohesion: 0.20
Nodes (9): Corrida, Cómo usarlo, Decisiones (2026-07-16), Flujo, Ingesta (una vez por archivo nuevo), Movimientos por contrato: backup local particionado por día, Objetivo, Piezas (+1 more)

### Community 126 - "Community 126"
Cohesion: 0.20
Nodes (8): activePlates, __dirname, doc, entries, PROJECT_ROOT, REGISTRY_FILE, supabase, toInsert

### Community 127 - "Community 127"
Cohesion: 0.27
Nodes (7): __dirname, PROJECT_ROOT, RUNS_ROOT, listEtlRunsFromSupabase(), readJson(), uploadEtlRunFromDisk(), uploadObject()

### Community 128 - "Community 128"
Cohesion: 0.22
Nodes (5): ALLOWED_TOOLS, CHAT_TIMEOUT_MS, createEtlAgentChat(), findClaudeCli(), SYSTEM_APPEND

### Community 129 - "Community 129"
Cohesion: 0.29
Nodes (6): parseCsvLine(), parseCsvToRecords(), unionHeaders(), useEtlWorkbenchOptional(), AnalisisLocalTab(), KpiComiteTab()

### Community 130 - "Community 130"
Cohesion: 0.40
Nodes (8): stableExternalHash(), buildStableExcelOperationId(), dayFromIso(), isPlaceholderExcelOperationId(), isValidExcelCtg(), sanitizeIdToken(), StableExcelOperationIdInput, timeFromIso()

### Community 131 - "Community 131"
Cohesion: 0.33
Nodes (7): createPlateMatchCache(), ensurePlateMatchCacheRoom(), PlateMatchCache, plateMatchCacheSize(), PlateMatchKind, plateMatchKindCached(), prunePlateMatchCache()

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (6): diagnostics, flagged, groups, ready, root, rows

### Community 133 - "Community 133"
Cohesion: 0.31
Nodes (8): ContractFirstCliArgs, dayRange(), __dirname, main(), MIN_OUTPUT_FILES, parseContractFirstCliArgv(), PROJECT_ROOT, runContractFirstCli()

### Community 134 - "Community 134"
Cohesion: 0.33
Nodes (4): CATEGORIES, createTruckPlateRegistryRouter(), createJsonPlateRegistryStore(), createSupabasePlateRegistryStore()

### Community 135 - "Community 135"
Cohesion: 0.25
Nodes (5): diagnostics, flagged, groups, root, rows

### Community 136 - "Community 136"
Cohesion: 0.25
Nodes (7): COMMITTEE_ETL_LITE_MODE, ETL_DEV_TAB_IDS, ETL_MAIN_TAB_IDS, ETL_OPTIONAL_MANIFEST, ETL_PRODUCT_TAB_IDS, POWER_BI_PRODUCT_FILES, REAL_DATA_APP_MODE

### Community 137 - "Community 137"
Cohesion: 0.46
Nodes (6): ContractFirstProgressCallback, ContractFirstProgressEvent, ContractFirstStageTiming, countUniqueNormalizedPlates(), emitContractFirstProgress(), runContractFirstStage()

### Community 138 - "Community 138"
Cohesion: 0.29
Nodes (6): Arquitectura, Etapa 1 — POC de la API (script listo), Etapa 2 — go2rtc para verlo en el browser, Etapa 3 — Integración en la sección "en vivo" (IMPLEMENTADA), POC — Video en vivo desde DSS Professional V8.7 (sección "en vivo"), Seguridad

### Community 139 - "Community 139"
Cohesion: 0.29
Nodes (6): Contradicciones detectadas (no usar estas fuentes para estas preguntas), Denominadores (por qué "cuántos camiones" tiene 3 respuestas si no se fija tabla), Paridad con el front, Regla de oro, Tablas canónicas por pregunta — runs/windows/<from>_<to>/tables/, Ventanas

### Community 140 - "Community 140"
Cohesion: 0.29
Nodes (5): byOp, counts, R7, root, rows

### Community 141 - "Community 141"
Cohesion: 0.29
Nodes (5): ETLWORKBENCH_IMPORT_BASELINE, MASTER_CATALOG_IMPORT_BASELINE, ROOT, violations, walk()

### Community 142 - "Community 142"
Cohesion: 0.29
Nodes (6): args, __dirname, env, result, root, tsEntry

### Community 143 - "Community 143"
Cohesion: 0.60
Nodes (5): buildApiJourneyDayStat(), countUniqueRawJourneyUids(), countUniqueRawJourneyUidsByOccurredDay(), occurredAtLocalDayKey(), rawJourneyUidFromRecord()

### Community 144 - "Community 144"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 145 - "Community 145"
Cohesion: 0.50
Nodes (3): Cuando actúes como analista de logística (preguntas de datos), Dashboard camiones — capa de agentes (Claude Code + MCP), Requisito

### Community 146 - "Community 146"
Cohesion: 0.50
Nodes (3): child, dir, script

### Community 147 - "Community 147"
Cohesion: 0.50
Nodes (3): byUid, out, outPath

### Community 148 - "Community 148"
Cohesion: 0.67
Nodes (3): check-arch-rules.mjs (freeze etlWorkbench + pureza etl-core), Separación browser vs funciones puras (DOM/Vite fuera del core lógico), src/etl-core: paquete TS puro (cero React/DOM/side-effects)

### Community 149 - "Community 149"
Cohesion: 0.67
Nodes (3): jspdf, jspdf, exportReportToPdf()

## Knowledge Gaps
- **842 isolated node(s):** `__dirname`, `PROJECT_ROOT`, `SQL_PATH`, `url`, `client` (+837 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SiteId` connect `Community 63` to `Monitor de cámaras en vivo`, `Community 74`, `Community 79`, `Community 112`, `Community 80`, `Community 49`, `Community 51`, `API Truckflow y golden master`, `Community 25`, `Community 122`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `Informe ETL Dashboard Truckflow` connect `Community 50` to `Pipeline ETL (orquestador)`, `Community 40`, `Community 59`, `Community 29`, `Community 95`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 66` to `Community 144`, `Community 44`, `Community 149`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 87 inferred relationships involving `e()` (e.g. with `walk()` and `main()`) actually correct?**
  _`e()` has 87 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `runEtlTransform()` (e.g. with `e()` and `flattenAlertForEtlCsv()`) actually correct?**
  _`runEtlTransform()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `RealJourneyDiagnosticsPageLegacy()` (e.g. with `e()` and `j()`) actually correct?**
  _`RealJourneyDiagnosticsPageLegacy()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `__dirname`, `PROJECT_ROOT`, `SQL_PATH` to the rest of the system?**
  _842 weakly-connected nodes found - possible documentation gaps or missing edges._