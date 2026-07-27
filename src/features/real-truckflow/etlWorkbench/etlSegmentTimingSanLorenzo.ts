/**
 * Enriquecimiento y rollups de la línea de tiempo **San Lorenzo**: inyección de anclas Excel /
 * TiemposEntrePasos, inferencias de tránsito, y los endpoints de los rollups KPI
 * (ingreso→balanza, balanza→egreso, salida→egreso) más el scatter de comité.
 *
 * Extraído de `etlSegmentTiming.ts` (god-file) — 1375 líneas, 66 declaraciones, todas SL.
 * Depende solo de capas leaf (`etlSegmentTimingRules`, `etlTimelinePrimitives`,
 * `etlTimestampNormalize`, …), nunca de `etlSegmentTiming`, así que no hay ciclo.
 *
 * `etlSegmentTiming` re-exporta la superficie pública original.
 */
import {
  shouldApplyTiemposEntrePasosBalanzaOverride,
} from './etlTiemposEntrePasos'
import {
  CIRCUITS_WITH_SL_BALANZA_ROLLUP,
  SL_BALANZA_ROLLUP_TRANSITION,
  SL_BALANZA_STAY_MAX_MINUTES,
  SL_EXIT_TRANSIT_DEFAULT_MINUTES,
  SL_INGRESO_BALANZA_ROLLUP_TRANSITION,
  SL_INGRESO_TO_BALANZA_MAX_MINUTES,
  SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES,
  SL_SALIDA_EGRESO_MAX_MINUTES,
  SL_SALIDA_EGRESO_ROLLUP_TRANSITION,
  type SlExcelTimelineAnchors,
  normalizeExecutiveCircuitForKpi,
  shouldUseExcelCaladoAsSlDescarga,
} from './etlSegmentTimingRules'
import {
  ensureArgentinaOffsetIso,
  formatArgentinaIsoFromMs,
  normalizeTimestampForExport,
  parseTimestampMs,
} from './etlTimestampNormalize'
import {
  type SegmentLeg,
  type TimedLogicalPoint,
  type TimedSegmentInput,
  buildTimedLogicalTimelineFromSegments,
  collapseTimedPoints,
  inferMidpointBetweenMs,
  isValidSegmentDuration,
  isoLocalFromMs,
  minutesBetweenIso,
  selectCoherentSegmentGroup,
} from './etlTimelinePrimitives'

function sanitizeMisplacedSlEgreso(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  const salidaMs = points
    .filter((p) => p.code === 'SL_BALANZA_SALIDA')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const balInMs = points
    .filter((p) => p.code === 'SL_BALANZA_INGRESO')
    .map((p) => parseTimestampMs(p.occurredAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0]

  const cutoffMs =
    Number.isFinite(salidaMs) ? salidaMs : Number.isFinite(balInMs) ? balInMs : Number.NaN
  if (!Number.isFinite(cutoffMs)) return points

  return points.filter((p) => {
    if (p.code !== 'SL_EGRESO') return true
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms >= cutoffMs
  })
}

function latestSlPointMs(points: TimedLogicalPoint[], codes: readonly string[]): number {
  let max = Number.NaN
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = parseTimestampMs(p.occurredAt)
    if (Number.isFinite(ms) && (!Number.isFinite(max) || ms > max)) max = ms
  }
  return max
}

function earliestSlPointMsAfter(points: TimedLogicalPoint[], codes: readonly string[], afterMs: number): number {
  let min = Number.POSITIVE_INFINITY
  for (const p of points) {
    if (!codes.includes(p.code)) continue
    const ms = parseTimestampMs(p.occurredAt)
    if (Number.isFinite(ms) && ms > afterMs && ms < min) min = ms
  }
  return Number.isFinite(min) ? min : Number.NaN
}

/** Excel-first: salida = egreso SL cuando falta cámara S7 o el egreso fragmentado es inválido. */
export function enrichSlTimelineWithExcelSalida(
  points: TimedLogicalPoint[],
  externalSalidaAt: string | undefined
): TimedLogicalPoint[] {
  const salida = String(externalSalidaAt ?? '').trim()
  if (!salida || !Number.isFinite(parseTimestampMs(salida))) return points
  if (resolveSlSalidaEgresoEndpoints(points)) return points

  const salidaMs = parseTimestampMs(salida)
  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_SALIDA', 'SL_BALANZA_INGRESO', 'SL_INGRESO'])
  const hasEgresoAfterAnchor = points.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && Number.isFinite(anchorMs) && ms > anchorMs
  })
  if (Number.isFinite(anchorMs) && salidaMs <= anchorMs && hasEgresoAfterAnchor) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_EGRESO', occurredAt: salida }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

function normalizeSlExcelAnchors(anchors?: string | SlExcelTimelineAnchors): SlExcelTimelineAnchors {
  if (typeof anchors === 'string') return { externalSalidaAt: anchors }
  return anchors ?? {}
}

function injectSlIngresoFromExcel(
  points: TimedLogicalPoint[],
  externalIngresoAt?: string,
  executiveCircuitCode?: string,
  plantaNormalized?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_INGRESO')) return points
  if (!shouldUseExcelCaladoAsSlDescarga(executiveCircuitCode, plantaNormalized)) return points
  const ingreso = String(externalIngresoAt ?? '').trim()
  if (!ingreso || !Number.isFinite(parseTimestampMs(ingreso))) return points
  const hasSlContext = points.some((p) => p.code.startsWith('SL_'))
  if (!hasSlContext) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_INGRESO', occurredAt: ingreso }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** @deprecated No usar ingreso Excel como hora de balanza S1 (causa tiempos > 3 h). */
function injectSlBalanzaIngresoFromExcel(
  points: TimedLogicalPoint[],
  externalIngresoAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_INGRESO')) return points
  const ingreso = String(externalIngresoAt ?? '').trim()
  if (!ingreso || !Number.isFinite(parseTimestampMs(ingreso))) return points
  const ingresoMs = latestSlPointMs(points, ['SL_INGRESO'])
  const atMs = parseTimestampMs(ingreso)
  if (Number.isFinite(ingresoMs) && atMs < ingresoMs) return points
  const hasSlContext =
    points.some((p) => p.code.startsWith('SL_')) || Number.isFinite(ingresoMs)
  if (!hasSlContext) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_INGRESO', occurredAt: ingreso }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Excel calado en SL1 / San Lorenzo: hora de descarga (zona sin cámara). */
function injectSlDescargaFromExcel(
  points: TimedLogicalPoint[],
  externalCaladoAt?: string,
  useAsDescarga?: boolean
): TimedLogicalPoint[] {
  if (!useAsDescarga) return points
  if (points.some((p) => p.code === 'SL_DESCARGA')) return points
  const calado = String(externalCaladoAt ?? '').trim()
  if (!calado || !Number.isFinite(parseTimestampMs(calado))) return points
  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO', 'SL_INGRESO'])
  const calMs = parseTimestampMs(calado)
  if (Number.isFinite(anchorMs) && calMs <= anchorMs) return points
  return collapseTimedPoints(
    [...points, { code: 'SL_DESCARGA', occurredAt: calado }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/**
 * Timeline SL: cámaras Truckflow + anclas Excel (salida → egreso).
 * El inicio del tramo balanza usa solo cámara S1 o tránsito corto desde S0 Truckflow.
 */
export function injectSlBalanzaFromTiemposEntrePasos(
  points: TimedLogicalPoint[],
  entradaAt?: string,
  salidaAt?: string,
  opts?: { replaceCamera?: boolean }
): TimedLogicalPoint[] {
  const entrada = String(entradaAt ?? '').trim()
  const salida = String(salidaAt ?? '').trim()
  if (!opts?.replaceCamera || (!entrada && !salida)) return points
  let filtered = points.filter(
    (p) => p.code !== 'SL_BALANZA_INGRESO' && p.code !== 'SL_BALANZA_SALIDA'
  )
  const additions: TimedLogicalPoint[] = []
  if (entrada && Number.isFinite(parseTimestampMs(entrada))) {
    additions.push({
      code: 'SL_BALANZA_INGRESO',
      occurredAt: ensureArgentinaOffsetIso(entrada),
    })
  }
  if (salida && Number.isFinite(parseTimestampMs(salida))) {
    additions.push({
      code: 'SL_BALANZA_SALIDA',
      occurredAt: ensureArgentinaOffsetIso(salida),
    })
  }
  if (!additions.length) return points
  return collapseTimedPoints(
    [...filtered, ...additions].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

export function buildSlBalanzaComiteOptionsFromTiemposEntrePasos(input: {
  executiveCircuitCode: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosMatch?: string
  truckflowCircuitCodes?: string
  platformNormalized?: string
  plantaNormalized?: string
}): SlBalanzaComiteOptions | undefined {
  const circuit = normalizeExecutiveCircuitForKpi(String(input.executiveCircuitCode ?? '').trim())
  if (circuit !== 'R7') return undefined
  const apply = shouldApplyTiemposEntrePasosBalanzaOverride({
    external_sl_balanza_entrada_at: input.externalSlBalanzaEntradaAt,
    tiempos_entre_pasos_match: input.tiemposEntrePasosMatch,
    truckflow_circuit_codes: input.truckflowCircuitCodes,
    platform_normalized: input.platformNormalized,
    planta_normalized: input.plantaNormalized,
  })
  if (!apply) return undefined
  const entrada = String(input.externalSlBalanzaEntradaAt ?? '').trim()
  if (!entrada) return undefined
  return {
    ...SL_BALANZA_COMITE_PRODUCT_OPTIONS,
    useTiemposEntrePasosBalanza: true,
    tiemposEntrePasosEntradaAt: entrada,
    tiemposEntrePasosSalidaAt: String(input.externalSlBalanzaSalidaAt ?? '').trim() || undefined,
  }
}

/**
 * Timeline SL: cámaras Truckflow + anclas Excel (salida → egreso).
 * El inicio del tramo balanza usa solo cámara S1 o tránsito corto desde S0 Truckflow.
 */
export function enrichSlTimelineWithExcelAnchors(
  points: TimedLogicalPoint[],
  anchors?: string | SlExcelTimelineAnchors
): TimedLogicalPoint[] {
  const opts = normalizeSlExcelAnchors(anchors)

  let enriched = sanitizeMisplacedSlEgreso(points)
  if (
    opts.tiemposEntrePasosOverride &&
    normalizeExecutiveCircuitForKpi(String(opts.executiveCircuitCode ?? '')) === 'R7'
  ) {
    enriched = injectSlBalanzaFromTiemposEntrePasos(
      enriched,
      opts.externalSlBalanzaEntradaAt,
      opts.externalSlBalanzaSalidaAt,
      { replaceCamera: true }
    )
  }
  enriched = injectSlIngresoFromExcel(
    enriched,
    opts.externalIngresoAt,
    opts.executiveCircuitCode,
    opts.plantaNormalized
  )
  enriched = injectSlDescargaFromExcel(
    enriched,
    opts.externalCaladoAt,
    shouldUseExcelCaladoAsSlDescarga(opts.executiveCircuitCode, opts.plantaNormalized)
  )
  enriched = inferSlDescargaFromTransit(enriched)
  enriched = inferSlBalanzaSalidaFromTransit(enriched, opts.externalSalidaAt)
  enriched = enrichSlTimelineWithExcelSalida(enriched, opts.externalSalidaAt)
  return enriched
}

/** Descarga SL sin cámara: punto intermedio entre balanza ingreso y balanza salida (o egreso). */
function inferSlDescargaFromTransit(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_DESCARGA')) return points
  const balInMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO'])
  if (!Number.isFinite(balInMs)) return points

  const salidaMs = earliestSlPointMsAfter(points, ['SL_BALANZA_SALIDA', 'SL_EGRESO'], balInMs)
  if (!Number.isFinite(salidaMs)) return points

  const descargaAt = inferMidpointBetweenMs(balInMs, salidaMs)
  if (!descargaAt) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_DESCARGA', occurredAt: descargaAt }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Balanza salida SL sin cámara S5: pocos min antes de egreso Excel; cámara S5 tiene prioridad. */
function inferSlBalanzaSalidaFromTransit(
  points: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_SALIDA')) return points

  const salida = String(externalSalidaAt ?? '').trim()
  if (salida && Number.isFinite(parseTimestampMs(salida))) {
    const withExcelProxy = inferSlBalanzaSalidaBeforeExcelSalida(points, externalSalidaAt)
    if (withExcelProxy.some((p) => p.code === 'SL_BALANZA_SALIDA')) return withExcelProxy
  }

  const descargaMs = latestSlPointMs(points, ['SL_DESCARGA'])
  const egresoMs = earliestSlPointMsAfter(points, ['SL_EGRESO'], descargaMs)
  if (Number.isFinite(descargaMs) && Number.isFinite(egresoMs) && egresoMs > descargaMs) {
    const proxyAt =
      inferMidpointBetweenMs(descargaMs, egresoMs, 60_000, SL_SALIDA_EGRESO_MAX_MINUTES * 60_000) ||
      isoLocalFromMs(egresoMs - SL_EXIT_TRANSIT_DEFAULT_MINUTES * 60_000)
    if (proxyAt && parseTimestampMs(proxyAt) > descargaMs) {
      return collapseTimedPoints(
        [...points, { code: 'SL_BALANZA_SALIDA', occurredAt: proxyAt }].sort(
          (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
        )
      )
    }
  }

  return points
}


/** @deprecated S1 se resuelve en resolveSlBalanzaIngresoStartPoint (solo Truckflow). */
function inferSlBalanzaIngresoFromTransit(points: TimedLogicalPoint[]): TimedLogicalPoint[] {
  return points
}

/**
 * Solo para rollup balanza salida → egreso SL (~200–300 m).
 * Usa S5 de Truckflow o tránsito corto antes de salida Excel; nunca calado Ricardone.
 */
export function enrichSlTimelineForSalidaEgresoRollup(
  points: TimedLogicalPoint[],
  anchors?: string | SlExcelTimelineAnchors
): TimedLogicalPoint[] {
  return enrichSlTimelineWithExcelAnchors(points, anchors)
}

/** Si falta S5 en Truckflow: balanza salida pocos minutos antes de salida Excel (tránsito corto). */
function inferSlBalanzaSalidaBeforeExcelSalida(
  points: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  if (points.some((p) => p.code === 'SL_BALANZA_SALIDA')) return points
  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (!Number.isFinite(salMs)) return points

  const hasSlAnchor = points.some((p) =>
    ['SL_INGRESO', 'SL_BALANZA_INGRESO', 'SL_DESCARGA'].includes(p.code)
  )
  if (!hasSlAnchor) return points

  const anchorMs = latestSlPointMs(points, ['SL_BALANZA_INGRESO', 'SL_INGRESO', 'SL_DESCARGA'])
  const proxyMs = salMs - SL_EXIT_TRANSIT_DEFAULT_MINUTES * 60_000
  if (Number.isFinite(anchorMs) && proxyMs <= anchorMs) return points

  return collapseTimedPoints(
    [...points, { code: 'SL_BALANZA_SALIDA', occurredAt: isoLocalFromMs(proxyMs) }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

function resolveSlSalidaEgresoEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_SALIDA_EGRESO_ROLLUP_TRANSITION
  const salidaPoints = points.filter((p) => p.code === fromCode)
  if (!salidaPoints.length) return null

  const salidaPt = salidaPoints.reduce((latest, p) =>
    parseTimestampMs(p.occurredAt) >= parseTimestampMs(latest.occurredAt) ? p : latest
  )
  const salidaMs = parseTimestampMs(salidaPt.occurredAt)
  if (!Number.isFinite(salidaMs)) return null

  const egresoCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms > salidaMs
  })
  if (!egresoCandidates.length) return null

  const egresoPt = egresoCandidates.reduce((latest, p) =>
    parseTimestampMs(p.occurredAt) >= parseTimestampMs(latest.occurredAt) ? p : latest
  )
  return { from: salidaPt, to: egresoPt }
}

function resolveSlIngresoBalancaEndpoints(
  points: TimedLogicalPoint[]
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const { from: fromCode, to: toCode } = SL_INGRESO_BALANZA_ROLLUP_TRANSITION
  const ingresoPt = points.find((p) => p.code === fromCode)
  if (!ingresoPt) return null
  const ingresoMs = parseTimestampMs(ingresoPt.occurredAt)
  if (!Number.isFinite(ingresoMs)) return null

  const balInCandidates = points.filter((p) => {
    if (p.code !== toCode) return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && ms > ingresoMs
  })
  if (balInCandidates.length) {
    const toPt = balInCandidates.reduce((earliest, p) =>
      parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
    )
    return { from: ingresoPt, to: toPt }
  }

  return null
}

export function extractSlIngresoBalancaRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: toCode } = SL_INGRESO_BALANZA_ROLLUP_TRANSITION
  const endpoints = resolveSlIngresoBalancaEndpoints(points)
  if (!endpoints) return null
  const durationMinutes = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, fromCode, toCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode,
    durationMinutes,
  }
}

export function resolveTrustedSlBalanzaIngresoFromSegments(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  let bestMs = Number.POSITIVE_INFINITY
  let bestIso = ''
  for (const seg of truckflowSegments) {
    const hitIso = slBalanzaIngresoHitIsoFromSegment(seg)
    if (!hitIso) continue
    const hitMs = parseTimestampMs(hitIso)
    if (Number.isFinite(hitMs) && hitMs < bestMs) {
      bestMs = hitMs
      bestIso = hitIso
    }
  }
  if (bestIso) {
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(bestIso) }
  }
  if (!truckflowSegments.length) {
    const cam = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
    if (!cam) return null
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(cam.occurredAt) }
  }
  return null
}

function earliestSlIngresoMsForComite(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): number | null {
  let minMs = Number.POSITIVE_INFINITY
  for (const seg of truckflowSegments) {
    const from = String(seg.segment_from ?? '').trim()
    if (from !== 'SL_INGRESO') continue
    const start = String(seg.segment_start_time ?? '').trim()
    const ms = parseTimestampMs(start)
    if (Number.isFinite(ms) && ms < minMs) minMs = ms
  }
  if (Number.isFinite(minMs) && minMs < Number.POSITIVE_INFINITY) return minMs
  const pt = earliestSlPoint(truckflowPoints, 'SL_INGRESO')
  if (!pt) return null
  const ms = parseTimestampMs(pt.occurredAt)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Inicio del tramo balanza ingreso → egreso (R7): la cámara SLZBalIngFte (SL_BALANZA_INGRESO)
 * es la fuente de verdad. Nunca se inyecta desde Excel, así que se confía siempre que exista
 * en el timeline. El guarda anti-Excel (shouldRejectSlBalanzaScatterForExcelIngreso) sigue
 * rechazando inicios anclados al ingreso Excel de Ricardone.
 */
function resolveTrustedSlBalanzaIngresoForComite(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  _enrichedTimeline?: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const cam = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
  if (cam) {
    return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(cam.occurredAt) }
  }
  return resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
}

export function buildSlComiteTruckflowContext(input: {
  segments: TimedSegmentInput[]
  externalIngresoAt?: string
  externalSalidaAt?: string
  externalCaladoAt?: string
  externalSlBalanzaEntradaAt?: string
  externalSlBalanzaSalidaAt?: string
  tiemposEntrePasosOverride?: boolean
  plantaNormalized?: string
  executiveCircuitCode: string
}): {
  opSegments: TimedSegmentInput[]
  truckflowPoints: TimedLogicalPoint[]
  enrichedPoints: TimedLogicalPoint[]
} {
  const circuit = normalizeExecutiveCircuitForKpi(String(input.executiveCircuitCode ?? '').trim())
  const useAllSlSegments = CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(circuit)
  const coherent = useAllSlSegments
    ? input.segments
    : selectCoherentSegmentGroup(
        input.segments,
        input.externalIngresoAt,
        input.externalSalidaAt
      )
  const opSegments = segmentsForSlBalanzaKpiHorarios(coherent)
  const truckflowPoints = buildTimedLogicalTimelineFromSegments(opSegments)
  const enrichedPoints = enrichSlTimelineWithExcelAnchors(truckflowPoints, {
    externalIngresoAt: input.externalIngresoAt,
    externalCaladoAt: input.externalCaladoAt,
    externalSalidaAt: input.externalSalidaAt,
    externalSlBalanzaEntradaAt: input.externalSlBalanzaEntradaAt,
    externalSlBalanzaSalidaAt: input.externalSlBalanzaSalidaAt,
    tiemposEntrePasosOverride: input.tiemposEntrePasosOverride,
    plantaNormalized: input.plantaNormalized,
    executiveCircuitCode: input.executiveCircuitCode,
  })
  return { opSegments, truckflowPoints, enrichedPoints }
}

function truckflowPointsWithoutUntrustedBalanzaIngreso(
  truckflowPoints: TimedLogicalPoint[],
  truckflowSegments: TimedSegmentInput[]
): TimedLogicalPoint[] {
  if (!truckflowSegments.length) return truckflowPoints
  const trusted = resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
  if (trusted) return truckflowPoints
  return truckflowPoints.filter((p) => p.code !== 'SL_BALANZA_INGRESO')
}

/** Inicio S1 para rollup: cámara confiable en segmento dedicado; nunca rollup/unified ni ingreso+15 min fijo. */
function resolveSlBalanzaIngresoForRollup(
  truckflowPoints: TimedLogicalPoint[],
  truckflowSegments: TimedSegmentInput[],
  _enrichedPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  return resolveSlBalanzaIngresoCameraStart(truckflowSegments, truckflowPoints)
}

/** Inicio S1 solo con evidencia Truckflow (segmento o punto); sin proxy desde S0/Excel. */
export function resolveSlBalanzaIngresoCameraStart(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const fromSegments = resolveTrustedSlBalanzaIngresoFromSegments(truckflowSegments, truckflowPoints)
  if (fromSegments) return fromSegments

  if (truckflowSegments.length === 1) {
    const seg = truckflowSegments[0]
    if (!seg) return null
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') {
      const start = String(seg.segment_start_time ?? '').trim()
      if (Number.isFinite(parseTimestampMs(start))) {
        return { code: 'SL_BALANZA_INGRESO', occurredAt: ensureArgentinaOffsetIso(start) }
      }
    }
  }

  if (!truckflowPoints.some((p) => p.code === 'SL_BALANZA_INGRESO')) return null
  return resolveTrustedSlBalanzaIngresoForComite(truckflowSegments, truckflowPoints)
}

function slBalanzaIngresoHitIsoFromSegment(seg: TimedSegmentInput): string | null {
  const from = String(seg.segment_from ?? '').trim()
  const to = String(seg.segment_to ?? '').trim()
  // Rollup unificado: el inicio suele venir de Excel/inferencia, no de cámara S1.
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_EGRESO') return null
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_INGRESO') return null
  if (from === 'SL_BALANZA_INGRESO' && to === 'SL_BALANZA_SALIDA') {
    const start = String(seg.segment_start_time ?? '').trim()
    return start && Number.isFinite(parseTimestampMs(start)) ? start : null
  }
  if (to !== 'SL_BALANZA_INGRESO') return null
  const end = String(seg.segment_end_time ?? '').trim()
  if (end && Number.isFinite(parseTimestampMs(end))) return end
  const start = String(seg.segment_start_time ?? '').trim()
  return start && Number.isFinite(parseTimestampMs(start)) ? start : null
}

function slBalanzaIngresoHitMsFromSegment(seg: TimedSegmentInput): number | null {
  const iso = slBalanzaIngresoHitIsoFromSegment(seg)
  if (!iso) return null
  const ms = parseTimestampMs(iso)
  return Number.isFinite(ms) ? ms : null
}

/** Cámara S1 confiable: segmento dedicado (S0→S1 o S1→S5), no rollup unificado ni self-loop. */
export function isTrustedSlBalanzaIngresoCamera(
  segments: TimedSegmentInput[],
  candidate: TimedLogicalPoint | null
): boolean {
  if (!candidate || candidate.code !== 'SL_BALANZA_INGRESO') return false
  const candidateMs = parseTimestampMs(candidate.occurredAt)
  if (!Number.isFinite(candidateMs)) return false
  for (const seg of segments) {
    const hitMs = slBalanzaIngresoHitMsFromSegment(seg)
    if (hitMs !== null && Math.abs(hitMs - candidateMs) <= 120_000) return true
  }
  return false
}

export function segmentsForSlTruckflowTimeline(
  segments: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
) {
  const hasOtherEvidence = segments.some((s) => {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    return !(
      from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to
    )
  })
  if (!hasOtherEvidence) return segments
  return segments.filter((s) => {
    const from = String(s.segment_from ?? '').trim()
    const to = String(s.segment_to ?? '').trim()
    return !(
      from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to
    )
  })
}

/**
 * Segmentos permitidos para fijar horarios KPI balanza ingreso → egreso (solo Truckflow).
 * Excluye rollups que anclan SL_EGRESO a salida Excel (p. ej. SL_INGRESO→SL_EGRESO).
 */
export function segmentsForSlBalanzaKpiHorarios(segments: TimedSegmentInput[]): TimedSegmentInput[] {
  const base = segmentsForSlTruckflowTimeline(segments)
  return base.filter((seg) => {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from === SL_BALANZA_ROLLUP_TRANSITION.from && to === SL_BALANZA_ROLLUP_TRANSITION.to) {
      return false
    }
    if (from === 'SL_INGRESO' && to === 'SL_EGRESO') return false
    return true
  })
}

function isTrustedSlEgresoCameraSegment(from: string, to: string): boolean {
  if (to !== 'SL_EGRESO') return false
  if (from === 'SL_BALANZA_INGRESO' || from === 'SL_INGRESO') return false
  return true
}

/**
 * Fin tramo balanza→egreso: última hora SL_EGRESO en segmento cámara Truckflow;
 * si no hay lectura, `external_salida_at` (Excel).
 */
export function resolveSlBalanzaEgresoHorarioForKpi(
  segments: TimedSegmentInput[],
  afterMs: number,
  externalSalidaAt: string,
  truckflowPointsFallback?: TimedLogicalPoint[]
): { endIso: string; fin_fuente: SlScatterHorarioFinFuente } | null {
  const horarioSegments = segmentsForSlBalanzaKpiHorarios(segments)
  let bestMs = Number.NaN
  let bestIso = ''
  for (const seg of horarioSegments) {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (!isTrustedSlEgresoCameraSegment(from, to)) continue
    const end = String(seg.segment_end_time ?? '').trim()
    const ms = parseTimestampMs(end)
    if (!Number.isFinite(ms) || ms <= afterMs) continue
    if (!Number.isFinite(bestMs) || ms > bestMs) {
      bestMs = ms
      bestIso = end
    }
  }
  if (bestIso) {
    return { endIso: normalizeTimestampForExport(bestIso), fin_fuente: 'truckflow' }
  }

  const points =
    horarioSegments.length > 0 ?
      buildTimedLogicalTimelineFromSegments(horarioSegments)
    : (truckflowPointsFallback ?? [])
  const camera = latestSlEgresoCameraAfterMs(points, afterMs)
  if (camera) {
    const camMs = parseTimestampMs(camera.occurredAt)
    if (Number.isFinite(camMs) && camMs > afterMs) {
      return {
        endIso: normalizeTimestampForExport(camera.occurredAt),
        fin_fuente: 'truckflow',
      }
    }
  }

  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (Number.isFinite(salMs) && salMs > afterMs) {
    return { endIso: normalizeTimestampForExport(salida), fin_fuente: 'excel_salida' }
  }
  return null
}

function earliestSlPoint(
  points: TimedLogicalPoint[],
  code: string
): TimedLogicalPoint | null {
  const candidates = points.filter((p) => p.code === code)
  if (!candidates.length) return null
  return candidates.reduce((earliest, p) =>
    parseTimestampMs(p.occurredAt) < parseTimestampMs(earliest.occurredAt) ? p : earliest
  )
}

/** Inicio S1: cámara Truckflow; nunca ingreso Excel Ricardone ni hora de ingreso puerto como balanza. */
export function resolveSlBalanzaIngresoStartPoint(
  truckflowPoints: TimedLogicalPoint[],
  enrichedPoints: TimedLogicalPoint[]
): TimedLogicalPoint | null {
  const fromCamera = earliestSlPoint(truckflowPoints, 'SL_BALANZA_INGRESO')
  if (fromCamera) return fromCamera

  const slIngresoCam = earliestSlPoint(truckflowPoints, 'SL_INGRESO')
  if (!slIngresoCam) return null

  const ingresoMs = parseTimestampMs(slIngresoCam.occurredAt)
  if (!Number.isFinite(ingresoMs)) return null

  const nextMs = earliestSlPointMsAfter(
    enrichedPoints,
    ['SL_BALANZA_SALIDA', 'SL_DESCARGA', 'SL_EGRESO'],
    ingresoMs
  )
  if (!Number.isFinite(nextMs)) return null

  const gapMin = (nextMs - ingresoMs) / 60_000
  if (gapMin <= 0) return null

  let proxyMs: number
  if (gapMin <= SL_INGRESO_TO_BALANZA_MAX_MINUTES) {
    const mid = inferMidpointBetweenMs(ingresoMs, nextMs)
    proxyMs = mid ? parseTimestampMs(mid) : ingresoMs + SL_INGRESO_TO_BALANZA_TRANSIT_DEFAULT_MINUTES * 60_000
  } else {
    proxyMs = ingresoMs + Math.floor((nextMs - ingresoMs) / 2)
    if (proxyMs <= ingresoMs || proxyMs >= nextMs) return null
  }

  return { code: 'SL_BALANZA_INGRESO', occurredAt: formatArgentinaIsoFromMs(proxyMs) }
}

function finalizeSlBalanzaToEgresoEndpoints(
  from: TimedLogicalPoint,
  to: TimedLogicalPoint,
  minFromMs?: number
): { from: TimedLogicalPoint; to: TimedLogicalPoint } {
  let fromMs = parseTimestampMs(from.occurredAt)
  const toMs = parseTimestampMs(to.occurredAt)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return { from, to }
  }
  if (Number.isFinite(minFromMs)) fromMs = Math.max(fromMs, minFromMs!)
  if (fromMs >= toMs) return { from, to }
  return {
    from: { ...from, occurredAt: formatArgentinaIsoFromMs(fromMs) },
    to,
  }
}

export type SlScatterHorarioInicioFuente = 'truckflow' | 'balanza_ingreso_inferido' | 'tiempos_entre_pasos'
export type SlScatterHorarioFinFuente = 'truckflow' | 'excel_salida' | 'tiempos_entre_pasos'
export type SlScatterHorarioFuente =
  | 'truckflow'
  | 'excel_salida'
  | 'balanza_ingreso_inferido'
  | 'mixto'
  | 'excel_inferido'
  | 'tiempos_entre_pasos'

export function compositeSlScatterHorarioFuente(
  inicio: SlScatterHorarioInicioFuente,
  fin: SlScatterHorarioFinFuente
): SlScatterHorarioFuente {
  if (inicio === 'truckflow' && fin === 'truckflow') return 'truckflow'
  if (inicio === 'tiempos_entre_pasos' && fin === 'tiempos_entre_pasos') return 'tiempos_entre_pasos'
  if (inicio === 'balanza_ingreso_inferido' && fin === 'excel_salida') return 'mixto'
  if (inicio === 'truckflow' && fin === 'excel_salida') return 'excel_salida'
  if (inicio === 'balanza_ingreso_inferido' && fin === 'truckflow') return 'balanza_ingreso_inferido'
  return 'mixto'
}

/** Inicio S1 tomado del ingreso Excel Ric (no cámara S1); no usar como hora de balanza. */
export function isSlBalanzaIngresoAnchoredOnExcelIngreso(
  balanzaIngresoAt: string,
  externalIngresoAt?: string
): boolean {
  const ing = String(externalIngresoAt ?? '').trim()
  const at = String(balanzaIngresoAt ?? '').trim()
  if (!ing || !at) return false
  const a = parseTimestampMs(at)
  const b = parseTimestampMs(ing)
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 60_000
}

/** Scatter/CSV comité: nunca ingreso Excel Ric como hora de balanza S1. */
export function shouldRejectSlBalanzaScatterForExcelIngreso(
  _durationMin: number,
  balanzaIngresoAt: string,
  externalIngresoAt?: string
): boolean {
  return isSlBalanzaIngresoAnchoredOnExcelIngreso(balanzaIngresoAt, externalIngresoAt)
}

/** Cámara S1 en tramo dedicado balanza ingreso → balanza salida (no rollup unificado). */
export function hasDedicatedSlBalanzaIngresoCameraSegment(segments: TimedSegmentInput[]): boolean {
  return segments.some((seg) => {
    const from = String(seg.segment_from ?? '').trim()
    const to = String(seg.segment_to ?? '').trim()
    if (from !== 'SL_BALANZA_INGRESO' || to !== 'SL_BALANZA_SALIDA') return false
    return Number.isFinite(parseTimestampMs(String(seg.segment_start_time ?? '')))
  })
}

export type SlBalanzaEgresoComiteScatterPayload = {
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  horario_fuente: SlScatterHorarioFuente
  horario_fuente_inicio: SlScatterHorarioInicioFuente
  horario_fuente_fin: SlScatterHorarioFinFuente
}

export type SlBalanzaComiteRejectReason =
  | 'ok'
  | 'sin_salida_excel'
  | 'sin_inicio_balanza'
  | 'inicio_anchored_excel_ric'
  | 'inicio_antes_ingreso_sl'
  | 'fin_no_posterior'
  | 'duracion_corta'
  | 'duracion_excede_180'

export type SlBalanzaComiteEvaluation = {
  payload: SlBalanzaEgresoComiteScatterPayload | null
  reason: SlBalanzaComiteRejectReason
  durationMin?: number
}

/**
 * Corrección legacy descarga SL (−120 min a la duración si bruta ≥ 150 min).
 * No altera `segment_start_time`: S1 balanza ingreso = cámara Truckflow.
 */
export const SL_DESCARGA_TIME_CORRECTION_MINUTES = 120

/** Duración bruta mínima para aplicar corrección de planta (evita restar 2 h en estadías cortas reales). */
export const SL_DESCARGA_PLANT_OFFSET_RAW_MINUTES = 150

export function resolveSlBalanzaDescargaPlantOffsetMinutes(rawDurationMinutes: number): number {
  if (
    !Number.isFinite(rawDurationMinutes) ||
    rawDurationMinutes < SL_DESCARGA_PLANT_OFFSET_RAW_MINUTES
  ) {
    return 0
  }
  return SL_DESCARGA_TIME_CORRECTION_MINUTES
}

/** Alias histórico (comité / producto). */
export const SL_BALANZA_TIME_CORRECTION_MINUTES = SL_DESCARGA_TIME_CORRECTION_MINUTES

export function correctSlBalanzaDescargaStayTiming(
  startIso: string,
  endIso: string,
  options?: { extraCorrectionMinutes?: number; applyPlantOffset?: boolean }
): {
  segment_start_time: string
  segment_end_time: string
  durationMinutes: number
} | null {
  const extraCorrection = Math.max(0, options?.extraCorrectionMinutes ?? 0)
  const applyPlantOffset = options?.applyPlantOffset ?? false
  const rawDur = minutesBetweenIso(startIso, endIso)
  if (!Number.isFinite(rawDur) || rawDur <= 0) return null
  const plantOffset = applyPlantOffset ? resolveSlBalanzaDescargaPlantOffsetMinutes(rawDur) : 0
  const totalCorrection = plantOffset + extraCorrection
  const dur = rawDur - totalCorrection
  if (dur <= 0) return null
  return {
    segment_start_time: normalizeTimestampForExport(startIso),
    segment_end_time: normalizeTimestampForExport(endIso),
    durationMinutes: Math.round(dur * 10) / 10,
  }
}

/** Tope de estadía corregida balanza ingreso → egreso en KPI/scatter Excel-first. */
export const SL_BALANZA_COMITE_MAX_MINUTES = 240

export type SlBalanzaComiteOptions = {
  /** Minutos a restar a la duración (cámaras corridas). Default 0 = sin corrección. */
  correctionMinutes?: number
  /** Si false, no se aplica el tope legacy de 180 min ni el mínimo de tramo. Default true. */
  enforceStayLimit?: boolean
  /** Tope explícito (p. ej. 240 en producto); se evalúa sobre la duración ya corregida. */
  maxStayMinutes?: number
  /** Si true, acepta inicio inferido (rollup/timeline) cuando no hay cámara confiable. Default false. */
  lenientStart?: boolean
  /** Si true, resta corrección legacy de planta (−120 min) a la duración cuando bruta ≥ 150 min.
   * No mueve el inicio S1: el horario de balanza ingreso es siempre cámara Truckflow.
   */
  applyPlantTimeCorrection?: boolean
  /** Horarios balanza SL desde planilla TiemposEntrePasos (override cámara en ventana acordada). */
  useTiemposEntrePasosBalanza?: boolean
  tiemposEntrePasosEntradaAt?: string
  tiemposEntrePasosSalidaAt?: string
}

/** Opciones de producto: inicio S1 solo cámara; duración reloj cámara→fin; tope 240 min. */
export const SL_BALANZA_COMITE_PRODUCT_OPTIONS: SlBalanzaComiteOptions = {
  correctionMinutes: 0,
  maxStayMinutes: SL_BALANZA_COMITE_MAX_MINUTES,
  enforceStayLimit: false,
  lenientStart: false,
  applyPlantTimeCorrection: false,
}

/** Evalúa contrato comité con motivo explícito (embudo / diagnóstico). */
export function evaluateSlBalanzaComitePayload(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt: string,
  externalIngresoAt?: string,
  enrichedTimeline?: TimedLogicalPoint[],
  opts?: SlBalanzaComiteOptions
): SlBalanzaComiteEvaluation {
  const correction = Math.max(0, opts?.correctionMinutes ?? 0)
  const enforceLimit = opts?.enforceStayLimit ?? true

  const salida = String(externalSalidaAt ?? '').trim()
  if (!salida || !Number.isFinite(parseTimestampMs(salida))) {
    return { payload: null, reason: 'sin_salida_excel' }
  }

  const tepEntrada = String(opts?.tiemposEntrePasosEntradaAt ?? '').trim()
  const tepSalida = String(opts?.tiemposEntrePasosSalidaAt ?? '').trim()
  if (opts?.useTiemposEntrePasosBalanza && tepEntrada && Number.isFinite(parseTimestampMs(tepEntrada))) {
    const inicioRaw = normalizeTimestampForExport(tepEntrada)
    const s1Ms = parseTimestampMs(inicioRaw)
    let fin = tepSalida && Number.isFinite(parseTimestampMs(tepSalida)) ? normalizeTimestampForExport(tepSalida) : ''
    let finFuente: SlScatterHorarioFinFuente =
      fin ? 'tiempos_entre_pasos' : 'excel_salida'
    if (!fin) {
      const horarioSegments = segmentsForSlBalanzaKpiHorarios(truckflowSegments)
      const horarioPoints =
        horarioSegments === truckflowSegments ?
          truckflowPoints
        : buildTimedLogicalTimelineFromSegments(horarioSegments)
      const endResolved = resolveSlBalanzaEgresoHorarioForKpi(horarioSegments, s1Ms, salida, horarioPoints)
      if (!endResolved) return { payload: null, reason: 'fin_no_posterior' }
      fin = endResolved.endIso
      finFuente = endResolved.fin_fuente
    }
    const salMs = parseTimestampMs(fin)
    if (!Number.isFinite(salMs) || salMs <= s1Ms) {
      return { payload: null, reason: 'fin_no_posterior' }
    }
    const dur = minutesBetweenIso(inicioRaw, fin)
    const maxStay = opts?.maxStayMinutes
    if (maxStay != null && Number.isFinite(maxStay) && dur > maxStay) {
      return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
    }
    if (dur <= 0) return { payload: null, reason: 'duracion_corta', durationMin: dur }
    return {
      payload: {
        segment_start_time: inicioRaw,
        segment_end_time: fin,
        segment_duration_min: Math.round(dur * 10) / 10,
        horario_fuente_inicio: 'tiempos_entre_pasos',
        horario_fuente_fin: finFuente,
        horario_fuente: compositeSlScatterHorarioFuente('tiempos_entre_pasos', finFuente),
      },
      reason: 'ok',
      durationMin: dur,
    }
  }

  const horarioSegments = segmentsForSlBalanzaKpiHorarios(truckflowSegments)
  const horarioPoints =
    horarioSegments === truckflowSegments ?
      truckflowPoints
    : buildTimedLogicalTimelineFromSegments(horarioSegments)

  const cameraStart = resolveSlBalanzaIngresoCameraStart(horarioSegments, horarioPoints)
  const startIso = cameraStart?.occurredAt ?? null
  if (!startIso) return { payload: null, reason: 'sin_inicio_balanza' }

  if (shouldRejectSlBalanzaScatterForExcelIngreso(0, startIso, externalIngresoAt)) {
    return { payload: null, reason: 'inicio_anchored_excel_ric' }
  }

  const inicioRaw = normalizeTimestampForExport(startIso)
  const s1Ms = parseTimestampMs(inicioRaw)
  if (!Number.isFinite(s1Ms)) {
    return { payload: null, reason: 'fin_no_posterior' }
  }

  const endResolved = resolveSlBalanzaEgresoHorarioForKpi(horarioSegments, s1Ms, salida, horarioPoints)
  if (!endResolved) {
    return { payload: null, reason: 'fin_no_posterior' }
  }
  const fin = endResolved.endIso
  const finFuente = endResolved.fin_fuente
  const salMs = parseTimestampMs(fin)
  if (!Number.isFinite(salMs) || salMs <= s1Ms) {
    return { payload: null, reason: 'fin_no_posterior' }
  }

  const rawDur = minutesBetweenIso(inicioRaw, fin)
  const plantOffset =
    opts?.applyPlantTimeCorrection === true ?
      resolveSlBalanzaDescargaPlantOffsetMinutes(rawDur)
    : 0
  const dur = rawDur - plantOffset - correction
  const fromCode = SL_BALANZA_ROLLUP_TRANSITION.from
  const toCode = SL_BALANZA_ROLLUP_TRANSITION.to

  if (dur <= 0) {
    return { payload: null, reason: 'duracion_corta', durationMin: dur }
  }
  const maxStay = opts?.maxStayMinutes
  if (maxStay != null && Number.isFinite(maxStay) && dur > maxStay) {
    return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
  }
  if (enforceLimit) {
    if (dur > SL_BALANZA_STAY_MAX_MINUTES) {
      return { payload: null, reason: 'duracion_excede_180', durationMin: dur }
    }
    if (!isValidSegmentDuration(dur, fromCode, toCode)) {
      return { payload: null, reason: 'duracion_corta', durationMin: dur }
    }
  }

  const inicioOut = inicioRaw
  const inicioFuente: SlScatterHorarioInicioFuente = 'truckflow'

  return {
    payload: {
      segment_start_time: inicioOut,
      segment_end_time: fin,
      segment_duration_min: Math.round(dur * 10) / 10,
      horario_fuente_inicio: inicioFuente,
      horario_fuente_fin: finFuente,
      horario_fuente: compositeSlScatterHorarioFuente(inicioFuente, finFuente),
    },
    reason: 'ok',
    durationMin: dur,
  }
}

/**
 * Contrato comité balanza ingreso → egreso (gráfica, CSV lentos, KPI fila):
 * S1 cámara/inicio Truckflow, salida Excel. Con opciones de producto incluye a
 * todos, sin tope de 180 y restando la corrección de cámaras.
 */
export function buildSlBalanzaEgresoComiteScatterPayload(
  truckflowSegments: TimedSegmentInput[],
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt: string,
  externalIngresoAt?: string,
  enrichedTimeline?: TimedLogicalPoint[],
  opts?: SlBalanzaComiteOptions
): SlBalanzaEgresoComiteScatterPayload | null {
  return evaluateSlBalanzaComitePayload(
    truckflowSegments,
    truckflowPoints,
    externalSalidaAt,
    externalIngresoAt,
    enrichedTimeline,
    opts
  ).payload
}

/** Solo para inferir S1: ancla fin con salida Excel literal (sin proxies de balanza salida/descarga). */
function minimalTimelineForSlBalanzaIngresoInference(
  truckflowPoints: TimedLogicalPoint[],
  externalSalidaAt?: string
): TimedLogicalPoint[] {
  let pts = sanitizeMisplacedSlEgreso(truckflowPoints)
  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (!Number.isFinite(salMs)) return pts

  const ingresoMs = earliestSlPointMsAfter(pts, ['SL_INGRESO'], Number.NEGATIVE_INFINITY)
  const hasCameraEgresoAfterIngreso = pts.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    const ms = parseTimestampMs(p.occurredAt)
    return Number.isFinite(ms) && Number.isFinite(ingresoMs) && ms > ingresoMs
  })
  if (hasCameraEgresoAfterIngreso) return pts

  const hasSalidaAnchor = pts.some((p) => {
    if (p.code !== 'SL_EGRESO') return false
    return Math.abs(parseTimestampMs(p.occurredAt) - salMs) <= 1000
  })
  if (hasSalidaAnchor) return pts

  return collapseTimedPoints(
    [...pts, { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(salida) }].sort(
      (a, b) => parseTimestampMs(a.occurredAt) - parseTimestampMs(b.occurredAt)
    )
  )
}

/** Última cámara S7 después del inicio S1 (post balanza salida si existe). */
export function latestSlEgresoCameraAfterMs(
  points: TimedLogicalPoint[],
  afterMs: number
): TimedLogicalPoint | null {
  const timeline = sanitizeMisplacedSlEgreso(points)
  let best: TimedLogicalPoint | null = null
  let bestMs = Number.NaN
  for (const p of timeline) {
    if (p.code !== 'SL_EGRESO') continue
    const ms = parseTimestampMs(p.occurredAt)
    if (!Number.isFinite(ms) || ms <= afterMs) continue
    if (!Number.isFinite(bestMs) || ms > bestMs) {
      bestMs = ms
      best = p
    }
  }
  return best
}

/**
 * Fin KPI balanza→egreso: cámara S7 si hay lectura después de S1; si no, salida Excel.
 * Evita estadías cortas cuando Excel marca salida antes que el egreso real (p. ej. LHT051).
 */
export function resolveSlBalanzaEgresoEndForKpi(
  points: TimedLogicalPoint[],
  externalSalidaAt: string | undefined,
  afterMs: number
): { point: TimedLogicalPoint; fin_fuente: SlScatterHorarioFinFuente } | null {
  // Regla R7: el fin es el egreso por cámara (SL_EGRESO) siempre que exista una lectura
  // posterior al inicio. Solo si no hay cámara de egreso se usa la salida Excel. La balanza
  // de salida (S5) no participa de este muestreo.
  const camera = latestSlEgresoCameraAfterMs(points, afterMs)
  const camMs = camera ? parseTimestampMs(camera.occurredAt) : Number.NaN
  if (Number.isFinite(camMs) && camMs > afterMs) {
    return {
      point: { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(camera!.occurredAt) },
      fin_fuente: 'truckflow',
    }
  }

  const salida = String(externalSalidaAt ?? '').trim()
  const salMs = parseTimestampMs(salida)
  if (Number.isFinite(salMs) && salMs > afterMs) {
    return {
      point: { code: 'SL_EGRESO', occurredAt: normalizeTimestampForExport(salida) },
      fin_fuente: 'excel_salida',
    }
  }
  return null
}

export type SlBalanzaRollupKpiEndpoints = {
  from: TimedLogicalPoint
  to: TimedLogicalPoint
  inicio_fuente: SlScatterHorarioInicioFuente
  fin_fuente: SlScatterHorarioFinFuente
}

/** KPI balanza ingreso→egreso: S1 cámara o inferido Truckflow; fin cámara S7 o salida Excel. */
export function resolveSlBalanzaRollupEndpointsForKpi(
  points: TimedLogicalPoint[],
  opts?: {
    externalSalidaAt?: string
    externalIngresoAt?: string
    truckflowPoints?: TimedLogicalPoint[]
    truckflowSegments?: TimedSegmentInput[]
  }
): SlBalanzaRollupKpiEndpoints | null {
  const truckflow = opts?.truckflowPoints ?? points
  const rawSegments = opts?.truckflowSegments ?? []
  const horarioSegments =
    rawSegments.length > 0 ? segmentsForSlBalanzaKpiHorarios(rawSegments) : []
  const horarioPoints =
    horarioSegments.length > 0 ?
      buildTimedLogicalTimelineFromSegments(horarioSegments)
    : truckflow
  const salida = String(opts?.externalSalidaAt ?? '').trim()

  const resolvedFrom = resolveSlBalanzaIngresoCameraStart(
    horarioSegments.length > 0 ? horarioSegments : rawSegments,
    horarioPoints
  )
  if (!resolvedFrom) return null

  const fromMsSeed = parseTimestampMs(resolvedFrom.occurredAt)
  if (!Number.isFinite(fromMsSeed)) return null

  const externalIngresoAt = String(opts?.externalIngresoAt ?? '').trim()
  if (isSlBalanzaIngresoAnchoredOnExcelIngreso(resolvedFrom.occurredAt, externalIngresoAt)) {
    return null
  }

  const inicio_fuente: SlScatterHorarioInicioFuente = 'truckflow'

  const endResolved = resolveSlBalanzaEgresoHorarioForKpi(
    horarioSegments.length > 0 ? horarioSegments : rawSegments,
    fromMsSeed,
    salida,
    horarioPoints
  )
  if (!endResolved) return null
  const toPt: TimedLogicalPoint = {
    code: 'SL_EGRESO',
    occurredAt: endResolved.endIso,
  }
  const fin_fuente = endResolved.fin_fuente

  const cameraPt = earliestSlPoint(truckflow, 'SL_BALANZA_INGRESO')
  const cameraBalMs = parseTimestampMs(cameraPt?.occurredAt ?? resolvedFrom.occurredAt)
  const minFromMs = Number.isFinite(cameraBalMs) ? cameraBalMs : fromMsSeed

  const endpoints = finalizeSlBalanzaToEgresoEndpoints(resolvedFrom, toPt, minFromMs)
  const durationMin = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (shouldRejectSlBalanzaScatterForExcelIngreso(durationMin, endpoints.from.occurredAt, externalIngresoAt)) {
    return null
  }

  return {
    from: {
      ...endpoints.from,
      occurredAt: normalizeTimestampForExport(endpoints.from.occurredAt),
    },
    to: {
      ...endpoints.to,
      occurredAt: normalizeTimestampForExport(endpoints.to.occurredAt),
    },
    inicio_fuente,
    fin_fuente,
  }
}

/** Puntos S1→S7 para rollup balanza SL; inicio = cámara balanza (nunca ingreso Excel Ric). */
export function resolveSlBalancaRollupEndpoints(
  points: TimedLogicalPoint[],
  opts?: {
    externalSalidaAt?: string
    truckflowPoints?: TimedLogicalPoint[]
    truckflowSegments?: TimedSegmentInput[]
  }
): { from: TimedLogicalPoint; to: TimedLogicalPoint } | null {
  const kpi = resolveSlBalanzaRollupEndpointsForKpi(points, opts)
  if (!kpi) return null
  return { from: kpi.from, to: kpi.to }
}

type SlBalanzaScatterRepairOpts = {
  external_salida_at?: string
  external_ingreso_at?: string
  planta_normalized?: string
  executive_circuit_code?: string
  operationSegments?: Array<{
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
  }>
}

/** Corrige timestamps de scatter Excel-first para tramo balanza SL (KPI S1→S7 / salida Excel). */
export function repairSlBalanzaScatterSegment(
  row: {
    segment_from: string
    segment_to: string
    segment_start_time: string
    segment_end_time: string
    segment_duration_min: number
  },
  opts?: SlBalanzaScatterRepairOpts
): {
  segment_start_time: string
  segment_end_time: string
  segment_duration_min: number
  horario_fuente: SlScatterHorarioFuente
  horario_fuente_inicio: SlScatterHorarioInicioFuente
  horario_fuente_fin: SlScatterHorarioFinFuente
} | null {
  const from = String(row.segment_from ?? '').trim()
  const to = String(row.segment_to ?? '').trim()
  if (from !== SL_BALANZA_ROLLUP_TRANSITION.from || to !== SL_BALANZA_ROLLUP_TRANSITION.to) {
    return null
  }
  const start = String(row.segment_start_time ?? '').trim()
  const endRaw = String(row.segment_end_time ?? '').trim()
  if (!start || !endRaw) return null

  const salida = String(opts?.external_salida_at ?? '').trim()
  if (!salida) return null

  const operationSegments =
    opts?.operationSegments?.length ?
      opts.operationSegments
    : [
        {
          segment_from: from,
          segment_to: to,
          segment_start_time: start,
          segment_end_time: endRaw,
        },
      ]

  const truckflowSegments = segmentsForSlTruckflowTimeline(operationSegments)
  const { truckflowPoints, enrichedPoints } = buildSlComiteTruckflowContext({
    segments: operationSegments,
    externalIngresoAt: opts?.external_ingreso_at,
    externalSalidaAt: salida,
    plantaNormalized: opts?.planta_normalized,
    executiveCircuitCode: String(opts?.executive_circuit_code ?? '').trim() || 'SL1',
  })

  const payload = buildSlBalanzaEgresoComiteScatterPayload(
    truckflowSegments,
    truckflowPoints,
    salida,
    opts?.external_ingreso_at,
    enrichedPoints
  )
  if (!payload) return null
  return {
    segment_start_time: payload.segment_start_time,
    segment_end_time: payload.segment_end_time,
    segment_duration_min: payload.segment_duration_min,
    horario_fuente: payload.horario_fuente,
    horario_fuente_inicio: payload.horario_fuente_inicio,
    horario_fuente_fin: payload.horario_fuente_fin,
  }
}

export function extractSlBalancaRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: templateToCode } = SL_BALANZA_ROLLUP_TRANSITION
  const endpoints = resolveSlBalancaRollupEndpoints(points)
  if (!endpoints) return null

  const corrected = correctSlBalanzaDescargaStayTiming(
    endpoints.from.occurredAt,
    endpoints.to.occurredAt
  )
  if (!corrected) return null
  if (!isValidSegmentDuration(corrected.durationMinutes, fromCode, templateToCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode: templateToCode,
    durationMinutes: corrected.durationMinutes,
    segment_start_time: corrected.segment_start_time,
    segment_end_time: corrected.segment_end_time,
  }
}

export function extractSlSalidaEgresoRollupFromTimeline(
  points: TimedLogicalPoint[],
  executiveCircuitCode: string,
  journeyId: string,
  plate: string
): SegmentLeg | null {
  if (!CIRCUITS_WITH_SL_BALANZA_ROLLUP.has(executiveCircuitCode)) return null
  const { from: fromCode, to: toCode } = SL_SALIDA_EGRESO_ROLLUP_TRANSITION
  const endpoints = resolveSlSalidaEgresoEndpoints(points)
  if (!endpoints) return null
  const durationMinutes = minutesBetweenIso(endpoints.from.occurredAt, endpoints.to.occurredAt)
  if (!isValidSegmentDuration(durationMinutes, fromCode, toCode)) return null
  return {
    journeyId,
    plate,
    executiveCircuitCode,
    fromCode,
    toCode,
    durationMinutes,
  }
}
