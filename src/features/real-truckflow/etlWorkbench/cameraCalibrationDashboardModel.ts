/**
 * Modelo derivado para tablero UI de calibración (sin cambiar lógica de auditoría).
 */

import type { CircuitCameraComparativa } from './excelCameraComparativaWorkbench'
import type { ExcelCameraComparativaReport } from './excelCameraComparativaWorkbench'
import type { Turno } from './operationalTurno'
import { turnoLabel, TURNOS_OPERATIVOS } from './operationalTurno'
import type { CameraStepSummary } from './auditExcelCameraMatrix'
import {
  CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS,
  summarizePointCaptureDepth,
  summarizeRouteRecognitionForCalibration,
  type PointCaptureDepthSummary,
} from './auditExcelCameraMatrix'
import {
  summarizeMissedPlatesByDevice,
  type MissedPlateByCameraRow,
} from './auditExcelCameraMissedPlates'

function isExcludedFromGeneralCalibration(stepKey: string): boolean {
  return CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS.has(String(stepKey ?? '').trim())
}

export type CaptureEstado = 'OK' | 'Revisar' | 'Crítico'

export type CalibrationUiRow = {
  circuito: string
  hito: string
  hitoLabel: string
  logicalCode: string
  turno: Turno | 'todos'
  device: string
  deviceLabel: string
  totalExcel: number
  capturados: number
  sinLectura: number
  porcentajeCaptura: number
  porcentajeSinLectura: number
  estado: CaptureEstado
  prioridad: number
  accionSugerida: string
}

const HITO_LABELS: Record<string, string> = {
  ingreso: 'Ingreso planta',
  preingreso: 'Preingreso',
  calada: 'Calada',
  egreso: 'Egreso planta',
  balanza_ingreso: 'Balanza ingreso',
  balanza_egreso: 'Balanza egreso',
  celda16_descarga: 'Descarga Celda 16',
  volcable: 'Volcable',
  ingreso_slz: 'Ingreso San Lorenzo',
  balanza_ingreso_slz: 'Balanza ingreso SL',
  balanza_egreso_slz: 'Balanza egreso SL',
  salida_slz: 'Salida San Lorenzo',
}

const DEVICE_LABELS: Record<string, string> = {
  RicIngCamFrente: 'Ingreso Ricardone',
  RicPreIngInFr: 'Preingreso Ricardone',
  RicPreIngEgFr: 'Preingreso egreso Ricardone',
  RicEgrCamFrente: 'Egreso Ricardone',
  RicCal01: 'Calada 01',
  RicCal02: 'Calada 02',
  RicCal03: 'Calada 03',
  RicCal04: 'Calada 04',
  RicCal05: 'Calada 05',
  RicCal06: 'Calada 06',
  RicB1Ingreso: 'Balanza 1 ingreso',
  RicB2Ingreso: 'Balanza 2 ingreso',
  RicB3Ingreso: 'Balanza 3 ingreso',
  RicB1Egreso: 'Balanza 1 egreso',
  RicB2Egreso: 'Balanza 2 egreso',
  RicB3Egreso: 'Balanza 3 egreso',
  RicC16Descarga1: 'Descarga Celda 16 · 1',
  RicC16Descarga2: 'Descarga Celda 16 · 2',
  RicC16Carga1: 'Carga Celda 16 · 1',
  RicC16Carga2: 'Carga Celda 16 · 2',
  RicVolcable1: 'Volcable 1',
  RicVolcable2: 'Volcable 2',
  SLZIngCamFrente: 'Ingreso San Lorenzo',
  SLZBalIngFte: 'Balanza ingreso SL',
  SLZBalSC1Fte: 'Balanza SC1 SL',
  SLZBalSC2Fte: 'Balanza SC2 SL',
  SLZSalidaC1Fte: 'Salida circuito 1 SL',
  SLZSalidaC2Fte: 'Salida circuito 2 SL',
}

export function hitoOperativoLabel(stepKey: string, header?: string): string {
  const k = String(stepKey ?? '').trim()
  if (HITO_LABELS[k]) return HITO_LABELS[k]
  const h = String(header ?? k).replace(/_/g, ' ')
  return h.charAt(0).toUpperCase() + h.slice(1)
}

export function deviceOperativoLabel(deviceCode: string): string {
  const d = String(deviceCode ?? '').trim()
  if (!d) return '—'
  if (DEVICE_LABELS[d]) return DEVICE_LABELS[d]
  return d.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function captureEstadoFromPct(pct: number): CaptureEstado {
  if (pct >= 85) return 'OK'
  if (pct >= 70) return 'Revisar'
  return 'Crítico'
}

export function pct(n: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((n / total) * 10000) / 100
}

export type HitoCaptureRow = {
  hito: string
  hitoLabel: string
  logicalCode: string
  capturados: number
  totalExcel: number
  sinLectura: number
  porcentajeCaptura: number
  porcentajeSinLectura: number
  estado: CaptureEstado
}

export type StackedHitoBar = HitoCaptureRow & {
  /** Para Recharts apilado */
  name: string
}

export type TurnoCardModel = {
  turno: Turno
  turnoLabel: string
  reconocidos: number
  parciales: number
  noReconocidos: number
  pctCapturaPromedio: number
  peorHito: string
  peorHitoPct: number
  peorCamara: string
}

export type HitoTurnoCompareRow = {
  hito: string
  hitoLabel: string
  pctByTurno: Record<Turno, number | null>
  peorTurno: string
  peorTurnoPct: number
  diagnostico: string
}

export type TopCalibrationProblem = {
  prioridad: number
  hito: string
  hitoLabel: string
  camara: string
  camaraLabel: string
  turno: Turno
  turnoLabel: string
  faltantes: number
  pctSinLectura: number
  accionSugerida: string
}

export type AutoCalibrationBrief = {
  reconocimientoGeneralPct: number
  mejorHito: string
  mejorHitoPct: number
  peorHito: string
  peorHitoPct: number
  concentracionTurno: Turno | 'equilibrado' | 'unknown'
  prioridadTexto: string
  parrafos: string[]
}

export type CalibrationDashboardModel = {
  circuito: string
  excelCamiones: number
  reconocidos: number
  minRoutePoints: number
  reconocimientoPct: number
  circuitSubtitle: string
  /** Conteos de profundidad de lectura (sin balanza egreso SL). */
  pointDepth: PointCaptureDepthSummary
  pointDepthLine: string
  hitoRows: HitoCaptureRow[]
  stackedBars: StackedHitoBar[]
  brief: AutoCalibrationBrief
  turnoCards: TurnoCardModel[]
  hitoTurnoCompare: HitoTurnoCompareRow[]
  topProblems: TopCalibrationProblem[]
  uiRows: CalibrationUiRow[]
  missedByDevice: Array<{ deviceCode: string; deviceLabel: string; uniquePlates: number; missedRows: number }>
  missedPlatesSample: Array<MissedPlateByCameraRow & { deviceLabel: string; hitoLabel: string }>
}

function summaryToHitoRow(s: CameraStepSummary): HitoCaptureRow {
  const porcentajeCaptura = s.captureRatePct
  return {
    hito: s.key,
    hitoLabel: hitoOperativoLabel(s.key, s.header),
    logicalCode: s.logicalCode,
    capturados: s.captured,
    totalExcel: s.total,
    sinLectura: s.total - s.captured,
    porcentajeCaptura,
    porcentajeSinLectura: s.errorRatePct,
    estado: captureEstadoFromPct(porcentajeCaptura),
  }
}

function suggestAction(input: {
  pctSinLectura: number
  turno: Turno
  faltantes: number
  totalExcel: number
  devicesEnHito: number
}): string {
  if (input.totalExcel < 15) return 'Validar con mayor muestra'
  if (input.pctSinLectura > 50) return 'Revisar instalación / ángulo / OCR'
  if (input.turno === 'Q1' && input.pctSinLectura >= 35) {
    return 'Revisar iluminación nocturna'
  }
  if (input.devicesEnHito >= 3 && input.pctSinLectura >= 25) return 'Revisar regla de consolidación'
  if (input.pctSinLectura >= 30) return 'Revisar calibración LPR y encuadre'
  return 'Monitoreo rutinario'
}

function buildTurnoCard(
  turno: Turno,
  circuit: CircuitCameraComparativa
): TurnoCardModel | null {
  const cal = circuit.calibration
  const steps = cal.stepByDayNight.filter(
    (s) => s.dayNight === turno && !isExcludedFromGeneralCalibration(s.stepKey)
  )
  if (!steps.length) return null

  const seg = cal.recognitionByDayNight.filter((r) => r.dayNight === turno)
  const reconocidos = seg.find((r) => r.recognitionSegment === 'reconocido')?.truckCount ?? 0
  const parciales = seg.find((r) => r.recognitionSegment === 'parcial')?.truckCount ?? 0
  const noReconocidos = seg.find((r) => r.recognitionSegment === 'no_reconocido')?.truckCount ?? 0

  const avg =
    steps.length > 0 ?
      Math.round((steps.reduce((a, s) => a + s.captureRatePct, 0) / steps.length) * 100) / 100
    : 0

  const worstStep = [...steps].sort((a, b) => a.captureRatePct - b.captureRatePct)[0]
  const devices = cal.deviceByStep.filter(
    (d) => d.dayNight === turno && !isExcludedFromGeneralCalibration(d.stepKey)
  )
  const worstDev = [...devices]
    .filter((d) => d.trucksMissingStep > 0)
    .sort((a, b) => b.trucksMissingStep - a.trucksMissingStep)[0]

  return {
    turno,
    turnoLabel: turnoLabel(turno),
    reconocidos,
    parciales,
    noReconocidos,
    pctCapturaPromedio: avg,
    peorHito: worstStep ? hitoOperativoLabel(worstStep.stepKey, worstStep.header) : '—',
    peorHitoPct: worstStep?.captureRatePct ?? 0,
    peorCamara: worstDev ? deviceOperativoLabel(worstDev.deviceCode) : '—',
  }
}

function buildHitoTurnoCompare(circuit: CircuitCameraComparativa): HitoTurnoCompareRow[] {
  const cal = circuit.calibration
  const steps = circuit.summaries
    .map((s) => s.key)
    .filter((k) => !isExcludedFromGeneralCalibration(k))
  const rows: HitoTurnoCompareRow[] = []

  for (const hito of steps) {
    const summary = circuit.summaries.find((s) => s.key === hito)
    const pctByTurno = {} as Record<Turno, number | null>
    for (const t of TURNOS_OPERATIVOS) {
      const row = cal.stepByDayNight.find((s) => s.stepKey === hito && s.dayNight === t)
      pctByTurno[t] = row?.captureRatePct ?? null
    }
    const vals = TURNOS_OPERATIVOS.map((t) => pctByTurno[t]).filter((v): v is number => v != null)
    let peorTurno = '—'
    let peorTurnoPct = 100
    for (const t of TURNOS_OPERATIVOS) {
      const v = pctByTurno[t]
      if (v != null && v < peorTurnoPct) {
        peorTurnoPct = v
        peorTurno = turnoLabel(t)
      }
    }
    const max = vals.length ? Math.max(...vals) : 0
    const min = vals.length ? Math.min(...vals) : 0
    let diagnostico = 'Sin diferencia relevante'
    if (max - min >= 12 && vals.length >= 2) {
      diagnostico = `Mayor variación entre turnos (Δ ${Math.round((max - min) * 100) / 100} pp)`
    }
    if (min < 70 && vals.filter((v) => v < 70).length >= 3) diagnostico = 'Crítico en varios turnos'

    rows.push({
      hito,
      hitoLabel: hitoOperativoLabel(hito, summary?.header),
      pctByTurno,
      peorTurno,
      peorTurnoPct,
      diagnostico,
    })
  }
  return rows.sort((a, b) => a.peorTurnoPct - b.peorTurnoPct)
}

function buildTopProblems(circuit: CircuitCameraComparativa): TopCalibrationProblem[] {
  const cal = circuit.calibration
  const total = circuit.excelCamiones
  const devicesPerStep = new Map<string, Set<string>>()
  for (const d of cal.deviceByStep) {
    if (isExcludedFromGeneralCalibration(d.stepKey)) continue
    const set = devicesPerStep.get(d.stepKey) ?? new Set()
    set.add(d.deviceCode)
    devicesPerStep.set(d.stepKey, set)
  }

  const candidates: TopCalibrationProblem[] = []
  for (const d of cal.deviceByStep) {
    if (d.dayNight === 'unknown') continue
    if (isExcludedFromGeneralCalibration(d.stepKey)) continue
    const faltantes = d.trucksMissingStep
    if (faltantes <= 0 && d.trucksContributingToCapture <= 0) continue
    const stepRow = circuit.summaries.find((s) => s.key === d.stepKey)
    const totalStep = stepRow?.total ?? total
    const pctSin = pct(faltantes, totalStep)
    candidates.push({
      prioridad: 0,
      hito: d.stepKey,
      hitoLabel: hitoOperativoLabel(d.stepKey, d.header),
      camara: d.deviceCode,
      camaraLabel: deviceOperativoLabel(d.deviceCode),
      turno: d.dayNight,
      turnoLabel: turnoLabel(d.dayNight),
      faltantes,
      pctSinLectura: pctSin,
      accionSugerida: suggestAction({
        pctSinLectura: pctSin,
        turno: d.dayNight,
        faltantes,
        totalExcel: totalStep,
        devicesEnHito: devicesPerStep.get(d.stepKey)?.size ?? 1,
      }),
    })
  }

  candidates.sort(
    (a, b) => b.faltantes - a.faltantes || b.pctSinLectura - a.pctSinLectura
  )
  return candidates.slice(0, 5).map((c, i) => ({ ...c, prioridad: i + 1 }))
}

function buildBrief(
  circuit: CircuitCameraComparativa,
  hitoRows: HitoCaptureRow[],
  turnoCards: TurnoCardModel[],
  recognition: { recognizedRatePct: number; minPoints: number }
): AutoCalibrationBrief {
  const reconocimientoGeneralPct = recognition.recognizedRatePct
  const sorted = [...hitoRows].sort((a, b) => b.porcentajeCaptura - a.porcentajeCaptura)
  const mejor = sorted[0]
  const peor = [...hitoRows].sort((a, b) => a.porcentajeCaptura - b.porcentajeCaptura)[0]

  let concentracionTurno: AutoCalibrationBrief['concentracionTurno'] = 'unknown'
  if (turnoCards.length >= 2) {
    const byPct = [...turnoCards].sort((a, b) => a.pctCapturaPromedio - b.pctCapturaPromedio)
    const worst = byPct[0]!
    const best = byPct[byPct.length - 1]!
    const gap = best.pctCapturaPromedio - worst.pctCapturaPromedio
    if (gap < 8) concentracionTurno = 'equilibrado'
    else concentracionTurno = worst.turno
  }

  const peorTurnoLabel =
    concentracionTurno !== 'unknown' && concentracionTurno !== 'equilibrado' ?
      turnoLabel(concentracionTurno)
    : ''

  const prioridadTexto =
    peor ?
      `Priorizar ${peor.hitoLabel} (${peor.porcentajeCaptura}% captura${
        peorTurnoLabel ? `, peor en turno ${peorTurnoLabel}` : ''
      }).`
    : 'Sin datos de hitos.'

  const parrafos = [
    `Reconocimiento general del circuito: ${reconocimientoGeneralPct}% con ≥${recognition.minPoints} puntos (sin balanza egreso SL).`,
    mejor && peor ?
      `Mejor hito: ${mejor.hitoLabel} (${mejor.porcentajeCaptura}%). Peor: ${peor.hitoLabel} (${peor.porcentajeCaptura}%).`
    : '',
    concentracionTurno === 'Q1' ?
      `Las fallas se concentran en turno ${peorTurnoLabel}: revisar iluminación y exposición LPR.`
    : concentracionTurno === 'equilibrado' ?
      'Turnos similares: priorizar hitos y cámaras del ranking de problemas.'
    : concentracionTurno !== 'unknown' ?
      `Turno con menor captura: ${peorTurnoLabel}.`
    : '',
    prioridadTexto,
  ].filter(Boolean)

  return {
    reconocimientoGeneralPct,
    mejorHito: mejor?.hitoLabel ?? '—',
    mejorHitoPct: mejor?.porcentajeCaptura ?? 0,
    peorHito: peor?.hitoLabel ?? '—',
    peorHitoPct: peor?.porcentajeCaptura ?? 0,
    concentracionTurno,
    prioridadTexto,
    parrafos,
  }
}

function buildUiRows(circuit: CircuitCameraComparativa): CalibrationUiRow[] {
  const rows: CalibrationUiRow[] = []
  for (const s of circuit.summaries) {
    if (isExcludedFromGeneralCalibration(s.key)) continue
    const base = summaryToHitoRow(s)
    rows.push({
      circuito: circuit.circuitCode,
      hito: base.hito,
      hitoLabel: base.hitoLabel,
      logicalCode: base.logicalCode,
      turno: 'todos',
      device: '',
      deviceLabel: '—',
      totalExcel: base.totalExcel,
      capturados: base.capturados,
      sinLectura: base.sinLectura,
      porcentajeCaptura: base.porcentajeCaptura,
      porcentajeSinLectura: base.porcentajeSinLectura,
      estado: base.estado,
      prioridad: 0,
      accionSugerida: suggestAction({
        pctSinLectura: base.porcentajeSinLectura,
        turno: 'Q3',
        faltantes: base.sinLectura,
        totalExcel: base.totalExcel,
        devicesEnHito: 1,
      }),
    })
  }
  for (const d of circuit.calibration.deviceByStep) {
    if (d.dayNight === 'unknown') continue
    if (isExcludedFromGeneralCalibration(d.stepKey)) continue
    const step = circuit.summaries.find((x) => x.key === d.stepKey)
    const totalExcel = step?.total ?? circuit.excelCamiones
    const sinLectura = d.trucksMissingStep
    const pctSin = pct(sinLectura, totalExcel)
    const devicesEnHito = circuit.calibration.deviceByStep.filter((x) => x.stepKey === d.stepKey).length
    rows.push({
      circuito: circuit.circuitCode,
      hito: d.stepKey,
      hitoLabel: hitoOperativoLabel(d.stepKey, d.header),
      logicalCode: d.logicalCode,
      turno: d.dayNight,
      device: d.deviceCode,
      deviceLabel: deviceOperativoLabel(d.deviceCode),
      totalExcel,
      capturados: d.trucksContributingToCapture,
      sinLectura,
      porcentajeCaptura: pct(d.trucksContributingToCapture, totalExcel),
      porcentajeSinLectura: pctSin,
      estado: captureEstadoFromPct(100 - pctSin),
      prioridad: 0,
      accionSugerida: suggestAction({
        pctSinLectura: pctSin,
        turno: d.dayNight,
        faltantes: sinLectura,
        totalExcel,
        devicesEnHito,
      }),
    })
  }
  return rows
}

function formatPointDepthLine(depth: PointCaptureDepthSummary): string {
  const descargaNote =
    depth.descargaStepKeys.length > 0 ?
      'todos excepto descarga'
    : 'todos excepto descarga (N/A en este circuito → = todos)'
  return `${depth.allPoints} en todos los puntos · ${depth.allExceptDescarga} en ${descargaNote} · ${depth.exactly3Points} en 3 puntos`
}

export function buildCalibrationDashboardModel(
  circuit: CircuitCameraComparativa
): CalibrationDashboardModel {
  const hitoRows = circuit.summaries
    .filter((s) => !isExcludedFromGeneralCalibration(s.key))
    .map(summaryToHitoRow)
  const stackedBars = [...hitoRows]
    .sort((a, b) => b.porcentajeSinLectura - a.porcentajeSinLectura)
    .map((r) => ({
      ...r,
      name: r.hitoLabel,
    }))

  const turnoCards = TURNOS_OPERATIVOS.map((t) => buildTurnoCard(t, circuit)).filter(
    (c): c is TurnoCardModel => c != null
  )
  const minPoints = circuit.routeRecognition.minPoints
  const rr = summarizeRouteRecognitionForCalibration(
    circuit.circuitCode,
    circuit.matrixRows,
    minPoints
  )
  const pointDepth = summarizePointCaptureDepth(circuit.circuitCode, circuit.matrixRows)
  const pointDepthLine = formatPointDepthLine(pointDepth)

  const missedSummary = summarizeMissedPlatesByDevice(
    circuit.calibration.missedPlatesByCamera.filter(
      (r) => !isExcludedFromGeneralCalibration(r.stepKey)
    )
  )
  const missedByDevice = missedSummary.map((s) => ({
    deviceCode: s.deviceCode,
    deviceLabel: deviceOperativoLabel(s.deviceCode),
    uniquePlates: s.uniquePlates,
    missedRows: s.missedRows,
  }))
  const missedPlatesSample = circuit.calibration.missedPlatesByCamera
    .filter((r) => !isExcludedFromGeneralCalibration(r.stepKey))
    .slice(0, 200)
    .map((r) => ({
      ...r,
      deviceLabel: deviceOperativoLabel(r.deviceCode),
      hitoLabel: hitoOperativoLabel(r.stepKey, r.hitoHeader),
    }))

  return {
    circuito: circuit.circuitCode,
    excelCamiones: circuit.excelCamiones,
    reconocidos: rr.recognizedCount,
    minRoutePoints: rr.minPoints,
    reconocimientoPct: rr.recognizedRatePct,
    circuitSubtitle: `${circuit.circuitCode}: ${circuit.excelCamiones} camiones Excel · ${rr.recognizedCount} reconocidos ≥${rr.minPoints} puntos · ${rr.recognizedRatePct}%`,
    pointDepth,
    pointDepthLine,
    hitoRows: [...hitoRows].sort((a, b) => b.porcentajeSinLectura - a.porcentajeSinLectura),
    stackedBars,
    brief: buildBrief(circuit, hitoRows, turnoCards, rr),
    turnoCards,
    hitoTurnoCompare: buildHitoTurnoCompare(circuit),
    topProblems: buildTopProblems(circuit),
    uiRows: buildUiRows(circuit),
    missedByDevice,
    missedPlatesSample,
  }
}

export function periodLabelFromReport(report: ExcelCameraComparativaReport): string {
  if (report.fromDay && report.toDay) return `${report.fromDay} → ${report.toDay}`
  return 'Período sin filtro de egreso'
}
