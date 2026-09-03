import { yieldToBrowser } from '../../../utils/yieldToBrowser'
import {
  buildCaladaCameraEvents,
  buildSanLorenzoCaladaCameraEvents,
  buildRicardoneCaladaLiquidCameraEvents,
  buildRicardoneVolcableCameraEvents,
  buildRicardoneSiloCameraEvents,
  buildRicardoneCelda16CameraEvents,
  buildSanLorenzoAceiteOslCameraEvents,
  buildSanLorenzoAceitePtoCameraEvents,
  caladaCameraEventsCsv,
} from './etlCaladaCameraActivity'
import {
  buildSanLorenzoVolcableEvents,
  sanLorenzoVolcableEventsCsv,
  type VolcableIngresoMovimientoLike,
} from './etlSanLorenzoVolcableActivity'
import type { ExcelOperationSegmentScatterRow } from './etlExcelFirstMerge'
import { excelOperationSegmentsForScatterCsv } from './etlExcelFirstMerge'
import {
  buildCircuitTimingIndex,
  circuitTimingJourneysCsv,
  circuitTimingSummaryCsv,
  type CircuitTimingIndex,
} from './etlCircuitTiming'
import {
  buildSegmentScatterAnalysis,
  segmentScatterAnalysisCsv,
  type CleanJourneyForAnalysis,
  type TruckflowSegmentForMerge,
} from './etlOperationalAnalysis'
import type { MergedTruckflowMovimientoRow } from './etlTruckflowMovimientosMerge'
import { segmentScatterSampleCsv } from './etlOperationalSampling'
import {
  buildSegmentScatterByDayRows,
  buildExcelScatterByDaySources,
  normalizeTruckflowScatterRowForByDay,
  segmentScatterByDayCsv,
  auditSlBalanzaScatterEligibility,
  summarizeSlBalanzaComiteFunnel,
  formatSlBalanzaComiteFunnelLog,
  summarizeSlBalanzaComiteRejectDetail,
  formatSlBalanzaComiteRejectDetailLog,
} from './etlSegmentScatterByDay'
import {
  buildAllSectorOccupancy30MinRows,
  sectorOccupancy30MinCsv,
  sectorOccupancyEventsCsv,
} from './etlSectorOccupancy30min'
import {
  buildSegmentTimingIndex,
  buildSegmentTimingIndexFromExcelFirstSegments,
  mergeSegmentTimingIndexes,
  segmentTimingKpiCsv,
  segmentTimingLegsCsv,
  SL_BALANZA_COMITE_PRODUCT_OPTIONS,
  type ClassifiedJourneyForTiming,
  type SegmentTimingIndex,
} from './etlSegmentTiming'

export type KpiTiemposMovimientosSnapshot = {
  excelSegmentRows: ExcelOperationSegmentScatterRow[]
  segments: TruckflowSegmentForMerge[]
  mergedRows: MergedTruckflowMovimientoRow[]
  cleanRows: CleanJourneyForAnalysis[]
  /** UIDs de muestra operativa (para CSV sample). */
  operationalSampleUids: string[]
  /** Filas INGRESO (VOLCABLE_PTO) del Excel: fuente de verdad del conteo por calle del panel volcable. */
  volcableSlIngresoMovimientos?: VolcableIngresoMovimientoLike[]
}

export type KpiTiemposBuildInput = {
  classifiedJourneys: ClassifiedJourneyForTiming[]
  movimientosSnapshot: KpiTiemposMovimientosSnapshot | null
}

export type KpiTiemposBuildOutput = {
  segmentTiming: SegmentTimingIndex
  circuitTiming: CircuitTimingIndex
  slBalanzaComiteDiagnostics?: {
    funnelLog: string
    detailLog: string
  }
  csv: {
    segment_timing_kpi: string
    segment_timing_legs: string
    segment_scatter_analysis: string
    segment_scatter_by_day: string
    segment_scatter_sample: string
    circuit_timing_summary: string
    circuit_timing_journeys: string
    sector_occupancy_30min: string
    sector_occupancy_events: string
    calada_camera_events: string
    calada_sl_camera_events: string
    calada_ricardone_liquid_events: string
    san_lorenzo_volcable_events: string
    ricardone_volcable_events: string
    ricardone_silo_events: string
    ricardone_celda16_events: string
    san_lorenzo_aceite_pto_events: string
    san_lorenzo_aceite_osl_events: string
  }
  logs: string[]
}

export async function buildKpiTiemposArtifacts(input: KpiTiemposBuildInput): Promise<KpiTiemposBuildOutput> {
  const logs: string[] = []
  await yieldToBrowser()

  let segmentTiming = buildSegmentTimingIndex(input.classifiedJourneys, {
    committeeGroups: ['COMPLETOS'],
  })
  logs.push(
    `Truckflow COMPLETOS: ${segmentTiming.legs.length} tramos, ${segmentTiming.journeyCount} journeys` +
      (segmentTiming.excludedNoEntryAnchor ?
        ` · ${segmentTiming.excludedNoEntryAnchor} excluidos sin ingreso/preingreso`
      : '')
  )

  const snap = input.movimientosSnapshot
  const excelScatterReady = snap?.excelSegmentRows.filter((r) => r.analysis_ready_for_scatter) ?? []

  if (excelScatterReady.length) {
    await yieldToBrowser()
    const fromExcel = buildSegmentTimingIndexFromExcelFirstSegments(
      excelScatterReady,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    // El Excel de Movimientos solo trae ingreso/calado/salida (el libro «Tiempos entre
    // pasos» quedó viejo), así que solo mide tramos que arrancan en INGRESO. Reemplazar
    // el índice de cámaras con él dejaba el KPI por tramo sin R7, R1, R5, R6 ni R8: se
    // perdían las cadenas completas por una sola fila del Excel. Se unen por
    // recorrido+tramo, con el Excel ganando donde ambos miden.
    const journeyUidByOperationId = new Map<string, string>()
    for (const r of excelScatterReady) {
      const opId = String(r.external_operation_id ?? '').trim()
      const uid = String(r.journey_uid ?? '').trim()
      if (opId && uid && !journeyUidByOperationId.has(opId)) journeyUidByOperationId.set(opId, uid)
    }
    const cameraLegs = segmentTiming.legs.length
    segmentTiming = mergeSegmentTimingIndexes(segmentTiming, fromExcel, { journeyUidByOperationId })
    logs.push(
      `Excel-first: ${fromExcel.legs.length} tramos, ${fromExcel.journeyCount} operaciones (ready_for_scatter)` +
        (fromExcel.excludedNoEntryAnchor ?
          ` · ${fromExcel.excludedNoEntryAnchor} excluidas sin ingreso/preingreso`
        : '')
    )
    logs.push(
      `KPI tramos unificado (cámaras + Excel): ${segmentTiming.legs.length} tramos ` +
        `(${cameraLegs} de cámara + ${fromExcel.legs.length} de Excel, deduplicados por recorrido+tramo) ` +
        `· circuitos: ${segmentTiming.circuitCodes.join(', ') || '—'}`
    )
  }

  await yieldToBrowser()
  const circuitTiming = buildCircuitTimingIndex(input.classifiedJourneys, {
    committeeGroups: ['COMPLETOS'],
  })

  let scatter: Record<string, unknown>[] = []
  if (excelScatterReady.length) {
    scatter = excelScatterReady.map((r) => ({ ...r }) as Record<string, unknown>)
  } else if (snap) {
    const mergedByUid = new Map(snap.mergedRows.map((r) => [r.journey_uid, r]))
    const cleanByUid = new Map(snap.cleanRows.map((r) => [r.journey_uid, r]))
    scatter = buildSegmentScatterAnalysis(snap.segments, mergedByUid, cleanByUid)
  }
  logs.push(`segment_scatter_analysis: ${scatter.length} filas`)

  await yieldToBrowser()
  const scatterByDaySources =
    excelScatterReady.length ?
      buildExcelScatterByDaySources(excelScatterReady, SL_BALANZA_COMITE_PRODUCT_OPTIONS)
    : scatter
        .map((r) => normalizeTruckflowScatterRowForByDay(r as never))
        .filter((s): s is NonNullable<typeof s> => s !== null)
  const scatterByDay = buildSegmentScatterByDayRows(scatterByDaySources)
  logs.push(`segment_scatter_by_day: ${scatterByDay.length} filas`)
  let slBalanzaComiteDiagnostics: KpiTiemposBuildOutput['slBalanzaComiteDiagnostics']
  if (excelScatterReady.length) {
    const slAudits = auditSlBalanzaScatterEligibility(
      excelScatterReady,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    const slFunnel = summarizeSlBalanzaComiteFunnel(excelScatterReady, slAudits)
    const slDetail = summarizeSlBalanzaComiteRejectDetail(
      excelScatterReady,
      SL_BALANZA_COMITE_PRODUCT_OPTIONS
    )
    const funnelLog = formatSlBalanzaComiteFunnelLog(slFunnel)
    const detailLog = formatSlBalanzaComiteRejectDetailLog(slDetail)
    logs.push(funnelLog)
    logs.push(detailLog)
    slBalanzaComiteDiagnostics = { funnelLog, detailLog }
  }

  const sampleUids = new Set(snap?.operationalSampleUids ?? [])
  const segment_scatter_analysis =
    excelScatterReady.length ?
      excelOperationSegmentsForScatterCsv(excelScatterReady)
    : segmentScatterAnalysisCsv(scatter)

  await yieldToBrowser()
  const occupancy = buildAllSectorOccupancy30MinRows(scatterByDay)
  logs.push(
    `sector_occupancy_30min: ${occupancy.series.length} intervalos · events: ${occupancy.events.length}`
  )

  // Actividad por cámara de calada (RicCal01–06 + RicCalLiq): la cámara individual solo
  // vive en el device crudo, así que se arma acá desde los eventos y se persiste.
  // El producto NO lo trae el journey (es Truckflow puro, solo cámaras): sale del merge con
  // el Excel de Movimientos. Si esta corrida no lo integró, no hay producto que asignar y las
  // calles quedan en «Sin dato». Se leen ambas fuentes del snapshot (merged y clean) porque
  // según el camino del transform una u otra puede venir más completa.
  const productByJourneyUid = new Map<string, string>()
  for (const r of [...(snap?.mergedRows ?? []), ...(snap?.cleanRows ?? [])]) {
    const uid = String(r.journey_uid ?? '').trim()
    const producto = String((r as { product_normalized?: unknown }).product_normalized ?? '').trim()
    if (uid && producto && !productByJourneyUid.has(uid)) productByJourneyUid.set(uid, producto)
  }
  const caladaCameraEvents = buildCaladaCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  // Actividad por calle del volcable de San Lorenzo. Fuente de verdad = las filas INGRESO
  // (VOLCABLE_PTO) del Excel — el usuario: "solo contá las I, esas dicen a qué volcable descargan".
  // Cada fila INGRESO es un camión en su calle; se enriquece con la hora de la cámara SLZVolcableC{N}
  // cuando la pasó (cruce por patente+día). Los que la cámara vio pero no están en el Excel se
  // cuentan aparte (producto del merge / «Sin dato»).
  const volcableIngresoMovimientos = snap?.volcableSlIngresoMovimientos ?? null
  const sanLorenzoVolcableEvents = buildSanLorenzoVolcableEvents({
    classifiedJourneys: input.classifiedJourneys,
    volcableIngresoMovimientos,
    productByJourneyUid,
  })
  const volcConProducto = sanLorenzoVolcableEvents.filter((r) => r.producto).length
  logs.push(
    `san_lorenzo_volcable_events: ${sanLorenzoVolcableEvents.length} camiones · ` +
      `${new Set(sanLorenzoVolcableEvents.map((r) => r.camara)).size} calles · ` +
      `producto en ${volcConProducto}/${sanLorenzoVolcableEvents.length} · ` +
      `filas INGRESO volcable: ${volcableIngresoMovimientos?.length ?? 0}`
  )
  const caladaConProducto = caladaCameraEvents.filter((r) => r.producto).length
  logs.push(
    `calada_camera_events: ${caladaCameraEvents.length} eventos · ${new Set(caladaCameraEvents.map((r) => r.camara)).size} cámaras · ` +
      `producto asignado a ${caladaConProducto}/${caladaCameraEvents.length}` +
      (productByJourneyUid.size === 0 ?
        ' (sin movimientos en la corrida: producto por calle quedará en «Sin dato»)'
      : ` (mapa uid→producto: ${productByJourneyUid.size})`)
  )

  // Calada San Lorenzo (SLZCalado): misma lógica que Ricardone, solo cámara diferente.
  const caladaSlEvents = buildSanLorenzoCaladaCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const caladaSlConProducto = caladaSlEvents.filter((r) => r.producto).length
  logs.push(
    `calada_sl_camera_events: ${caladaSlEvents.length} eventos · ` +
      `producto asignado a ${caladaSlConProducto}/${caladaSlEvents.length}`
  )

  // Calada líquida Ricardone (RicCalLiq): misma lógica que Ricardone calada, solo cámara diferente.
  const caladaLiquidEvents = buildRicardoneCaladaLiquidCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const caladaLiquidConProducto = caladaLiquidEvents.filter((r) => r.producto).length
  logs.push(
    `calada_ricardone_liquid_events: ${caladaLiquidEvents.length} eventos · ` +
      `producto asignado a ${caladaLiquidConProducto}/${caladaLiquidEvents.length}`
  )

  // Descargas Ricardone (volcables, silos, celda 16) y aceites San Lorenzo (Pto, OSL):
  // misma lógica de eventos por cámara que calada, solo cambia el set de dispositivos.
  const ricVolcableEvents = buildRicardoneVolcableCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const ricSiloEvents = buildRicardoneSiloCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const ricCelda16Events = buildRicardoneCelda16CameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  // Aceite SL: actividad de las cámaras físicas (Ren* = OSL, SLZBaiLiq = PTO), descartando las
  // lecturas con patente inválida (basura del OCR). El Excel de aceite NO sirve de cruce acá
  // (plataforma ACEITE_OSL contaminada con agua; la lógica canónica usa la cámara S10, no las Ren*).
  const slAceitePtoEvents = buildSanLorenzoAceitePtoCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const slAceiteOslEvents = buildSanLorenzoAceiteOslCameraEvents({
    classifiedJourneys: input.classifiedJourneys,
    productByJourneyUid,
  })
  const ptoOps = new Set(slAceitePtoEvents.map((r) => r.journey_id)).size
  const oslOps = new Set(slAceiteOslEvents.map((r) => r.journey_id)).size
  logs.push(
    `descargas: ricardone_volcable=${ricVolcableEvents.length} · ` +
      `ricardone_silo=${ricSiloEvents.length} · ricardone_celda16=${ricCelda16Events.length} · ` +
      `sl_aceite_pto=${ptoOps} camiones (${slAceitePtoEvents.length} ev) · ` +
      `sl_aceite_osl=${oslOps} camiones (${slAceiteOslEvents.length} ev) ` +
      `(aceite: actividad de cámara, solo patentes válidas — sin cruce Excel)`
  )

  return {
    segmentTiming,
    circuitTiming,
    slBalanzaComiteDiagnostics,
    csv: {
      segment_timing_kpi: segmentTimingKpiCsv(segmentTiming),
      segment_timing_legs: segmentTimingLegsCsv(segmentTiming),
      segment_scatter_analysis,
      segment_scatter_by_day: segmentScatterByDayCsv(scatterByDay),
      segment_scatter_sample: segmentScatterSampleCsv(scatter, sampleUids),
      circuit_timing_summary: circuitTimingSummaryCsv(circuitTiming),
      circuit_timing_journeys: circuitTimingJourneysCsv(circuitTiming),
      sector_occupancy_30min: sectorOccupancy30MinCsv(occupancy.series),
      sector_occupancy_events: sectorOccupancyEventsCsv(occupancy.events),
      calada_camera_events: caladaCameraEventsCsv(caladaCameraEvents),
      calada_sl_camera_events: caladaCameraEventsCsv(caladaSlEvents),
      calada_ricardone_liquid_events: caladaCameraEventsCsv(caladaLiquidEvents),
      san_lorenzo_volcable_events: sanLorenzoVolcableEventsCsv(sanLorenzoVolcableEvents),
      ricardone_volcable_events: caladaCameraEventsCsv(ricVolcableEvents),
      ricardone_silo_events: caladaCameraEventsCsv(ricSiloEvents),
      ricardone_celda16_events: caladaCameraEventsCsv(ricCelda16Events),
      san_lorenzo_aceite_pto_events: caladaCameraEventsCsv(slAceitePtoEvents),
      san_lorenzo_aceite_osl_events: caladaCameraEventsCsv(slAceiteOslEvents),
    },
    logs,
  }
}
