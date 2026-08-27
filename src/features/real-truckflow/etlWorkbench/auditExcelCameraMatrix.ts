/**
 * Matriz Excel por circuito: CTG, patente, día egreso + SI/NO por hito de cámara en crudo.
 */

import { isLikelyOcrPlateMatch } from '../../../services/circuitPlateOcr'
import { normalizeRealEventPoint } from '../../../services/realEventNormalization'
import type { RealJourneyEventDto } from '../../../services/realJourneyEvents.types'
import { operationalInstantIso, parseInstantMs, normalizePlateKey } from './auditSlCameraExcelCoverage'

export type RawJourneyEventLike = {
  journeyUid?: string
  journey_uuid?: string
  truckPlate?: string
  normalizedPlate?: string
  rawTruckPlate?: string
  raw_truck_plate?: string
  deviceCode?: string
  device_code?: string
  sectorCode?: string
  sector_code?: string
  occurredAt?: string
  occurred_at?: string
  createdAt?: string
  created_at?: string
  modifiedAt?: string
  modified_at?: string
  recordedAt?: string
  recorded_at?: string
  payload?: unknown
}

export type CameraAuditAlertLike = {
  journeyUid?: string
  journeyUuid?: string
  truckPlate?: string
  deviceCode?: string
  sectorCode?: string
  occurredAt?: string
  createdAt?: string
  modifiedAt?: string
  recordedAt?: string
  payload?: unknown
}

export type ExcelCameraStep = {
  key: string
  header: string
  logicalCode: string
}

/** Ricardone → San Lorenzo (R7). */
export const R7_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'egreso', header: 'egreso', logicalCode: 'EGRESO' },
  { key: 'ingreso_slz', header: 'ingreso_slz', logicalCode: 'SL_INGRESO' },
  { key: 'balanza_ingreso_slz', header: 'balanza_ingreso_slz', logicalCode: 'SL_BALANZA_INGRESO' },
  { key: 'balanza_egreso_slz', header: 'balanza_egreso_slz', logicalCode: 'SL_BALANZA_SALIDA' },
  { key: 'salida_slz', header: 'salida_slz', logicalCode: 'SL_EGRESO' },
  // Descarga en el volcable de San Lorenzo (5 cámaras de calle SLZVolcableC1…C5 → SL_VOLCABLE).
  // Es un punto de descarga OPCIONAL (no todos los R7 descargan acá): se trata como descarga
  // (ver DESCARGA_CAMERA_STEP_KEYS) para no distorsionar la profundidad de ruta.
  { key: 'volcable_slz', header: 'volcable_slz', logicalCode: 'SL_VOLCABLE' },
]

/** Recepción Celda 16 (R1): Ric hasta balanza y descarga Celda 16 (sin cámara egreso Ric). */
export const R1_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'celda16_descarga', header: 'celda16_descarga', logicalCode: 'CELDA16_DESCARGA' },
]

/** Recepción Volcable 1 (R5): Ric hasta balanza y volcable (sin cámara egreso Ric). */
export const R5_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'volcable', header: 'volcable', logicalCode: 'VOLCABLE' },
]

/** Recepción Volcable 2 (R6): misma cadena cámara que R5. */
export const R6_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada', header: 'calada', logicalCode: 'CALADA' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'volcable', header: 'volcable', logicalCode: 'VOLCABLE' },
]

/**
 * Recepción Mercadería Líquida Ricardone (R8, aceite): no registra `CALADA` — el muestreo de
 * líquidos entra como `LIQUIDO` (cámara RicCalLiq). Sin egreso instrumentado (cierra en balanza).
 */
export const R8_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada_liq', header: 'calada_liq', logicalCode: 'LIQUIDO' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
]

/**
 * Pellet transile externo (R30/R31/R32, celdas 09/10/11): dos tramos. Cargan en Ricardone
 * (la tolva de celda NO tiene cámara → no es un hito) y descargan en el volcable San Lorenzo.
 * El muestreo en Ricardone entra como `LIQUIDO` (cámara RicCalLiq). Las 3 celdas comparten
 * exactamente la misma cadena de cámaras (sólo difieren en la tolva sin cámara).
 */
export const PELLET_TRANSILE_EXCEL_CAMERA_STEPS: readonly ExcelCameraStep[] = [
  { key: 'ingreso', header: 'ingreso', logicalCode: 'INGRESO' },
  { key: 'preingreso', header: 'preingreso', logicalCode: 'PREINGRESO' },
  { key: 'calada_liq', header: 'calada_liq', logicalCode: 'LIQUIDO' },
  { key: 'balanza_ingreso', header: 'balanza_ingreso', logicalCode: 'BALANZA_INGRESO' },
  { key: 'balanza_egreso', header: 'balanza_egreso', logicalCode: 'BALANZA_EGRESO' },
  { key: 'ingreso_slz', header: 'ingreso_slz', logicalCode: 'SL_INGRESO' },
  { key: 'balanza_ingreso_slz', header: 'balanza_ingreso_slz', logicalCode: 'SL_BALANZA_INGRESO' },
  { key: 'volcable_slz', header: 'volcable_slz', logicalCode: 'SL_VOLCABLE' },
  { key: 'balanza_egreso_slz', header: 'balanza_egreso_slz', logicalCode: 'SL_BALANZA_SALIDA' },
  { key: 'salida_slz', header: 'salida_slz', logicalCode: 'SL_EGRESO' },
]

export const EXCEL_CAMERA_STEPS_BY_CIRCUIT: Record<string, readonly ExcelCameraStep[]> = {
  R7: R7_EXCEL_CAMERA_STEPS,
  R1: R1_EXCEL_CAMERA_STEPS,
  R5: R5_EXCEL_CAMERA_STEPS,
  R6: R6_EXCEL_CAMERA_STEPS,
  R8: R8_EXCEL_CAMERA_STEPS,
  R30: PELLET_TRANSILE_EXCEL_CAMERA_STEPS,
  R31: PELLET_TRANSILE_EXCEL_CAMERA_STEPS,
  R32: PELLET_TRANSILE_EXCEL_CAMERA_STEPS,
}

/** Circuitos núcleo con matriz de cámara hecha a mano desde el inicio. */
export const RAW_AUDIT_CIRCUIT_CODES = ['R1', 'R5', 'R6', 'R7'] as const

/** Circuitos ampliados (universo por `inferCircuitFromExternalMovimiento`). */
export const EXTENDED_AUDIT_CIRCUIT_CODES = ['R8', 'R30', 'R31', 'R32'] as const

/** Todos los circuitos que muestra el tablero de calibración. */
export const AUDIT_CIRCUIT_CODES = [
  ...RAW_AUDIT_CIRCUIT_CODES,
  ...EXTENDED_AUDIT_CIRCUIT_CODES,
] as const

export function getExcelCameraStepsForCircuit(circuitCode: string): readonly ExcelCameraStep[] {
  const code = String(circuitCode ?? '').trim().toUpperCase()
  const steps = EXCEL_CAMERA_STEPS_BY_CIRCUIT[code]
  if (!steps?.length) {
    throw new Error(`Circuito no soportado para matriz cámara: ${code}. Use R1, R5, R6 o R7.`)
  }
  return steps
}

export type ExcelMovimientoLike = {
  operationId: string
  ctg: string
  plate: string
  externalIngresoAt?: string
  externalSalidaAt?: string
  executiveCircuitCode: string
}

export type CameraMatrixRow = {
  ctg: string
  patente: string
  diaEgreso: string
  captures: Record<string, boolean>
}

export type CameraStepSummary = {
  key: string
  header: string
  logicalCode: string
  captured: number
  total: number
  captureRatePct: number
  errorRatePct: number
}

function toEventDto(e: RawJourneyEventLike): RealJourneyEventDto {
  return {
    journeyUid: String(e.journeyUid ?? e.journey_uuid ?? '').trim(),
    truckPlate: String(e.truckPlate ?? e.normalizedPlate ?? ''),
    rawTruckPlate: String(e.rawTruckPlate ?? e.raw_truck_plate ?? ''),
    normalizedPlate: String(e.normalizedPlate ?? ''),
    deviceCode: String(e.deviceCode ?? e.device_code ?? ''),
    sectorCode: String(e.sectorCode ?? e.sector_code ?? ''),
    occurredAt: String(e.occurredAt ?? e.occurred_at ?? ''),
    createdAt: String(e.createdAt ?? e.created_at ?? ''),
    modifiedAt: String(e.modifiedAt ?? e.modified_at ?? ''),
    recordedAt: String(e.recordedAt ?? e.recorded_at ?? ''),
  } as RealJourneyEventDto
}

const RIC_BALANZA_EGRESO_DEVICE_RE = /^ricb[123]egreso/i
const RIC_BALANZA_INGRESO_DEVICE_RE = /^ricb[123]ingreso/i

/**
 * Memo del código lógico por evento.
 *
 * `eventLogicalCodeOperational` aloca un DTO y corre `normalizeRealEventPoint`; se lo invocaba
 * una vez **por evento y por hito** (6 hitos × eventos de ventana × movimientos × circuitos),
 * el tercer cuello de botella de la calibración. El código lógico depende sólo del evento,
 * así que se cachea por identidad.
 */
const LOGICAL_CODE_MEMO = new WeakMap<object, string>()

/** Mismo criterio lógico que el ETL (`normalizeRealEventPoint`) + alias de dispositivo balanza. */
export function eventLogicalCodeOperational(e: RawJourneyEventLike): string {
  const memoKey = typeof e === 'object' && e !== null ? (e as object) : null
  if (memoKey) {
    const hit = LOGICAL_CODE_MEMO.get(memoKey)
    if (hit !== undefined) return hit
  }
  const code = computeEventLogicalCodeOperational(e)
  if (memoKey) LOGICAL_CODE_MEMO.set(memoKey, code)
  return code
}

function computeEventLogicalCodeOperational(e: RawJourneyEventLike): string {
  const device = String(e.deviceCode ?? e.device_code ?? '').trim()
  if (RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return 'BALANZA_EGRESO'
  if (RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return 'BALANZA_INGRESO'

  try {
    const pt = normalizeRealEventPoint(toEventDto(e))
    let code = String(pt.logicalCode ?? '').trim()
    if (code.includes('EXCLUIDA') || code.includes('TRASERA')) return ''
    if (code === 'BALANZA' && device) {
      const d = device.toLowerCase()
      if (d.includes('egreso') || d.includes('salida')) return 'BALANZA_EGRESO'
      if (d.includes('ingreso') || d.includes('entrada')) return 'BALANZA_INGRESO'
    }
    if (code && code !== 'UNKNOWN') return code
  } catch {
    /* fallback device */
  }

  if (RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return 'BALANZA_EGRESO'
  if (RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return 'BALANZA_INGRESO'
  return ''
}

export function eventMatchesCameraStep(e: RawJourneyEventLike, step: ExcelCameraStep): boolean {
  const code = eventLogicalCodeOperational(e)
  if (code === step.logicalCode) return true
  const device = String(e.deviceCode ?? e.device_code ?? '').trim().toLowerCase()
  if (step.logicalCode === 'BALANZA_EGRESO' && RIC_BALANZA_EGRESO_DEVICE_RE.test(device)) return true
  if (step.logicalCode === 'BALANZA_INGRESO' && RIC_BALANZA_INGRESO_DEVICE_RE.test(device)) return true
  return false
}

function journeyUidFromRaw(e: RawJourneyEventLike): string {
  return String(e.journeyUid ?? e.journey_uuid ?? '').trim()
}

function parsePayloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null
  if (typeof payload === 'object') return payload as Record<string, unknown>
  if (typeof payload === 'string') {
    const t = payload.trim()
    if (!t.startsWith('{')) return null
    try {
      const parsed = JSON.parse(t) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

function plateFromPayload(payload: unknown): string {
  const p = parsePayloadRecord(payload)
  if (!p) return ''
  const keys = [
    'normalizedPlate',
    'payload_normalized_plate',
    'plate',
    'truckPlate',
    'truck_plate',
    'lprPlate',
    'Patente',
  ]
  for (const k of keys) {
    const v = normalizePlateKey(String(p[k] ?? ''))
    if (v) return v
  }
  return ''
}

/** Patente en fila cruda: campos DTO + payload LPR (alertas / eventos sin truckPlate). */
export function plateFromCameraAuditRow(e: RawJourneyEventLike): string {
  for (const raw of [
    e.normalizedPlate,
    e.truckPlate,
    e.rawTruckPlate,
    e.raw_truck_plate,
  ]) {
    const k = normalizePlateKey(raw ?? '')
    if (k) return k
  }
  return plateFromPayload(e.payload)
}

/** Cruce Excel ↔ lectura: clave exacta u OCR tolerante (balanza egreso Ric). */
export function platesMatchExcelCameraAudit(excelPlate: string, eventPlate: string): boolean {
  const a = normalizePlateKey(excelPlate)
  const b = normalizePlateKey(eventPlate)
  if (!a || !b) return false
  if (a === b) return true
  return isLikelyOcrPlateMatch(a, b)
}

/** Diagnóstico runtime (debug): fuentes de patente en lecturas RicB*Egreso. */
export function diagnoseBalanzaEgresoPlateSources(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): Record<string, number | string | boolean> {
  const corpus = buildCameraAuditCorpus(events, alerts)
  const stats = {
    corpusSize: corpus.length,
    alertInputCount: alerts?.length ?? 0,
    egressRows: 0,
    plateFromNormalized: 0,
    plateFromTruck: 0,
    plateFromRawTruckPlate: 0,
    plateFromPayload: 0,
    plateEmpty: 0,
    payloadIsString: 0,
    egressWithJourneyUid: 0,
    samplePayloadKeys: '' as string,
  }
  let sampleKeys = ''
  for (const e of corpus) {
    const dev = String(e.deviceCode ?? e.device_code ?? '').trim()
    if (!RIC_BALANZA_EGRESO_DEVICE_RE.test(dev)) continue
    stats.egressRows += 1
    if (journeyUidFromRaw(e)) stats.egressWithJourneyUid += 1
    const norm = normalizePlateKey(e.normalizedPlate ?? '')
    const truck = normalizePlateKey(e.truckPlate ?? '')
    const raw = normalizePlateKey(String(e.rawTruckPlate ?? e.raw_truck_plate ?? ''))
    const pay = plateFromPayload(e.payload)
    if (typeof e.payload === 'string') stats.payloadIsString += 1
    if (norm) stats.plateFromNormalized += 1
    else if (truck) stats.plateFromTruck += 1
    else if (raw) stats.plateFromRawTruckPlate += 1
    else if (pay) stats.plateFromPayload += 1
    else {
      stats.plateEmpty += 1
      if (!sampleKeys && e.payload && typeof e.payload === 'object') {
        sampleKeys = Object.keys(e.payload as object).slice(0, 12).join(',')
      }
    }
  }
  stats.samplePayloadKeys = sampleKeys
  return stats
}

/** Instantáneas operativas: occurred/recorded y created/modified (API inconsistente en balanza egreso). */
export function auditEventInstantsMs(e: RawJourneyEventLike): number[] {
  const out = new Set<number>()
  for (const preferCreatedAt of [false, true]) {
    const t = parseInstantMs(operationalInstantIso(e, preferCreatedAt))
    if (Number.isFinite(t)) out.add(t)
  }
  return [...out]
}

export function auditEventInOperationWindow(
  e: RawJourneyEventLike,
  fromMs: number,
  toMs: number
): boolean {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return true
  return auditEventInstantsMs(e).some((t) => t >= fromMs && t <= toMs)
}

/** Alertas RicB* / balanza con patente en payload → filas tipo evento para la matriz. */
export function buildCameraAuditCorpus(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): RawJourneyEventLike[] {
  const out: RawJourneyEventLike[] = [...events]
  if (!alerts?.length) return out
  for (const a of alerts) {
    const dev = String(a.deviceCode ?? '').trim()
    if (!dev) continue
    const sectorU = String(a.sectorCode ?? '').trim().toUpperCase()
    const balanzaDev = RIC_BALANZA_EGRESO_DEVICE_RE.test(dev) || RIC_BALANZA_INGRESO_DEVICE_RE.test(dev)
    if (!balanzaDev && !sectorU.includes('BALANZA')) continue
    const payloadPlate = plateFromPayload(a.payload)
    const plate = String(a.truckPlate ?? '').trim() || payloadPlate
    out.push({
      journeyUid: String(a.journeyUid ?? a.journeyUuid ?? ''),
      truckPlate: plate,
      normalizedPlate: payloadPlate || plate,
      deviceCode: dev,
      sectorCode: a.sectorCode,
      occurredAt: a.occurredAt,
      createdAt: a.createdAt,
      modifiedAt: a.modifiedAt,
      recordedAt: a.recordedAt,
      payload: a.payload,
    })
  }
  return out
}

/**
 * Índice del corpus para la auditoría de cámaras.
 *
 * Existe por performance: la versión anterior recorría los ~24k eventos **tres veces por cada
 * movimiento** y en cada visita recalculaba patente normalizada, journeyUid y —lo más caro—
 * `auditEventInstantsMs`, que parsea dos ISO y aloca un Set. Con ~2.5k movimientos × 4 circuitos
 * × 2 pasadas (matriz + calibración) eso son cientos de millones de iteraciones: el botón de
 * calibración tardaba más de 15 minutos.
 *
 * Acá los valores derivados se calculan **una sola vez por evento**, y `timeline`/`times`
 * (ordenados) permiten resolver la ventana de cada movimiento por búsqueda binaria, así cada
 * movimiento sólo toca los eventos de SU ventana en lugar del corpus completo.
 */
type CameraAuditIndexEntry = {
  event: RawJourneyEventLike
  instants: number[]
  plateKey: string
  uid: string
  isRicBalanzaEgreso: boolean
}

export type CameraAuditIndex = {
  /** En orden del corpus: el orden de salida depende de esto. */
  entries: CameraAuditIndexEntry[]
  /** El corpus (eventos + alertas de balanza), para consumidores que lo recorren entero. */
  corpus: RawJourneyEventLike[]
  /** Instantes ordenados (un evento puede aportar más de uno). */
  times: number[]
  /** `owners[i]` = índice en `entries` del evento que aportó `times[i]`. */
  owners: number[]
  /**
   * deviceCode → primer sectorCode no vacío observado.
   *
   * Reemplaza a `sectorForDevice(corpus, dev)`, que barría el corpus completo y se llamaba
   * dentro de un triple loop (filas × hitos × dispositivos) — el segundo cuello de botella
   * de la calibración después de la ventana por movimiento.
   */
  deviceSectors: Map<string, string>
}

export function buildCameraAuditIndex(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): CameraAuditIndex {
  const corpus = buildCameraAuditCorpus(events, alerts)
  const deviceSectors = new Map<string, string>()
  const entries: CameraAuditIndexEntry[] = corpus.map((event) => {
    const dev = String(event.deviceCode ?? event.device_code ?? '').trim()
    if (dev && !deviceSectors.has(dev)) {
      const sec = String(event.sectorCode ?? event.sector_code ?? '').trim()
      if (sec) deviceSectors.set(dev, sec)
    }
    return {
      event,
      instants: auditEventInstantsMs(event),
      plateKey: plateFromCameraAuditRow(event),
      uid: journeyUidFromRaw(event),
      isRicBalanzaEgreso: RIC_BALANZA_EGRESO_DEVICE_RE.test(dev),
    }
  })

  const pairs: { t: number; owner: number }[] = []
  entries.forEach((entry, i) => {
    for (const t of entry.instants) pairs.push({ t, owner: i })
  })
  pairs.sort((a, b) => a.t - b.t)

  return {
    entries,
    corpus,
    times: pairs.map((p) => p.t),
    owners: pairs.map((p) => p.owner),
    deviceSectors,
  }
}


/** Cache por identidad del array de eventos: el índice se reusa entre circuitos y pasadas. */
const AUDIT_INDEX_CACHE = new WeakMap<
  RawJourneyEventLike[],
  { alerts: CameraAuditAlertLike[] | undefined; index: CameraAuditIndex }
>()

export function cameraAuditIndexFor(
  events: RawJourneyEventLike[],
  alerts?: CameraAuditAlertLike[]
): CameraAuditIndex {
  const hit = AUDIT_INDEX_CACHE.get(events)
  if (hit && hit.alerts === alerts) return hit.index
  const index = buildCameraAuditIndex(events, alerts)
  AUDIT_INDEX_CACHE.set(events, { alerts, index })
  return index
}


/**
 * `platesMatchExcelCameraAudit` memoizado por par de claves ya normalizadas.
 *
 * Cada evaluación nueva cuesta un Levenshtein ponderado; el par (patente Excel, patente evento)
 * se repite mucho entre movimientos y entre los 4 circuitos, así que el costo total queda
 * proporcional a los pares DISTINTOS.
 */
const PLATE_MATCH_MEMO = new Map<string, boolean>()

function platesMatchExcelCameraAuditMemo(excelPlateKey: string, eventPlateKey: string): boolean {
  if (!excelPlateKey || !eventPlateKey) return false
  if (excelPlateKey === eventPlateKey) return true
  const key = `${excelPlateKey}|${eventPlateKey}`
  const hit = PLATE_MATCH_MEMO.get(key)
  if (hit !== undefined) return hit
  const res = platesMatchExcelCameraAudit(excelPlateKey, eventPlateKey)
  PLATE_MATCH_MEMO.set(key, res)
  return res
}

/** Primer i con times[i] >= target. */
function lowerBound(times: number[], target: number): number {
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid]! < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Índices de `entries` con al menos un instante en [fromMs, toMs], en orden de corpus. */
function entryIdsInWindow(index: CameraAuditIndex, fromMs: number, toMs: number): number[] {
  // Ventana no finita: `auditEventInOperationWindow` daba true para todo — se preserva.
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return index.entries.map((_, i) => i)
  }
  const seen = new Set<number>()
  for (let i = lowerBound(index.times, fromMs); i < index.times.length; i++) {
    if (index.times[i]! > toMs) break
    seen.add(index.owners[i]!)
  }
  return [...seen].sort((a, b) => a - b)
}

/**
 * Cache de la ventana por (índice, movimiento, padding).
 *
 * El mismo movimiento pasa por acá tres veces —`buildExcelCameraMatrix`,
 * `buildExcelCameraMatrixDetailed` y `buildMissedPlatesByCamera`— y el resultado es idéntico.
 */
const WINDOW_EVENTS_CACHE = new WeakMap<CameraAuditIndex, Map<string, RawJourneyEventLike[]>>()

/** Eventos en ventana Excel: patente + mismo journeyUid (egreso balanza sin OCR en patente). */
export function collectOperationWindowEvents(
  mov: ExcelMovimientoLike,
  events: RawJourneyEventLike[] | CameraAuditIndex,
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number; alerts?: CameraAuditAlertLike[] }
): RawJourneyEventLike[] {
  const index = Array.isArray(events) ? cameraAuditIndexFor(events, opts?.alerts) : events
  const padding = opts?.windowPaddingHours ?? 6

  let perIndex = WINDOW_EVENTS_CACHE.get(index)
  if (!perIndex) {
    perIndex = new Map()
    WINDOW_EVENTS_CACHE.set(index, perIndex)
  }
  // Se identifica el movimiento por lo que define su ventana y su match de patente.
  const cacheKey = `${padding}|${mov.operationId}|${mov.plate}|${mov.externalIngresoAt ?? ''}|${mov.externalSalidaAt ?? ''}`
  const cached = perIndex.get(cacheKey)
  if (cached) return cached
  const computed = computeOperationWindowEvents(mov, index, padding)
  perIndex.set(cacheKey, computed)
  return computed
}

function computeOperationWindowEvents(
  mov: ExcelMovimientoLike,
  index: CameraAuditIndex,
  padding: number
): RawJourneyEventLike[] {
  const plateKey = normalizePlateKey(mov.plate)
  const { fromMs, toMs } = operationCaptureWindowMs(mov, padding)
  const windowIds = entryIdsInWindow(index, fromMs, toMs)

  const journeyUids = new Set<string>()
  const taken = new Set<number>()
  const expanded: RawJourneyEventLike[] = []

  // Match fuzzy sólo contra las patentes DISTINTAS de la ventana (cientos), no contra todo el
  // corpus (miles): probado, restringir al corpus completo era ~2.5x más lento. El memo por par
  // hace que las combinaciones repetidas entre movimientos y circuitos no se recalculen.
  const platesInWindow = new Set<string>()
  for (const id of windowIds) {
    const pk = index.entries[id]!.plateKey
    if (pk) platesInWindow.add(pk)
  }
  const matchingPlates = new Set<string>()
  for (const pk of platesInWindow) {
    if (platesMatchExcelCameraAuditMemo(plateKey, pk)) matchingPlates.add(pk)
  }

  // 1) match por patente (incluye fuzzy OCR)
  for (const id of windowIds) {
    const en = index.entries[id]!
    if (!en.plateKey || !matchingPlates.has(en.plateKey)) continue
    taken.add(id)
    expanded.push(en.event)
    if (en.uid) journeyUids.add(en.uid)
  }

  // 2) mismo journeyUid que lo ya tomado
  for (const id of windowIds) {
    if (taken.has(id)) continue
    const en = index.entries[id]!
    if (!en.uid || !journeyUids.has(en.uid)) continue
    taken.add(id)
    expanded.push(en.event)
  }

  // 3) balanza egreso Ricardone con patente compatible (sin OCR propio)
  for (const id of windowIds) {
    if (taken.has(id)) continue
    const en = index.entries[id]!
    if (!en.isRicBalanzaEgreso) continue
    if (!en.plateKey || !matchingPlates.has(en.plateKey)) continue
    taken.add(id)
    expanded.push(en.event)
    if (en.uid) journeyUids.add(en.uid)
  }

  return expanded
}

export function extractCtgFromOperationId(operationId: string, ctgField?: string): string {
  const explicit = String(ctgField ?? '').trim()
  if (explicit) return explicit
  const id = String(operationId ?? '').trim()
  if (id.startsWith('CTG_')) return id.slice(4)
  return id
}

export function dayKeyFromSalida(externalSalidaAt?: string): string {
  const s = String(externalSalidaAt ?? '').trim()
  if (!s) return ''
  const d = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''
}

export function operationCaptureWindowMs(
  mov: ExcelMovimientoLike,
  paddingHours = 6
): { fromMs: number; toMs: number } {
  const ing = parseInstantMs(mov.externalIngresoAt ?? '')
  const sal = parseInstantMs(mov.externalSalidaAt ?? '')
  const pad = paddingHours * 3600_000
  let fromMs = Number.isFinite(ing) ? ing - pad : Number.NaN
  let toMs = Number.isFinite(sal) ? sal + pad : Number.NaN
  if (!Number.isFinite(fromMs) && Number.isFinite(sal)) fromMs = sal - 48 * 3600_000
  if (!Number.isFinite(toMs) && Number.isFinite(ing)) toMs = ing + 48 * 3600_000
  return { fromMs, toMs }
}

export function indexEventsByPlate(
  events: RawJourneyEventLike[],
  preferCreatedAt = true
): Map<string, Array<{ ms: number; logicalCode: string }>> {
  const map = new Map<string, Array<{ ms: number; logicalCode: string }>>()
  for (const e of events) {
    const plate = plateFromCameraAuditRow(e)
    if (!plate) continue
    const logicalCode = eventLogicalCodeOperational(e)
    if (!logicalCode) continue
    const instant = operationalInstantIso(e, preferCreatedAt)
    const ms = parseInstantMs(instant)
    if (!Number.isFinite(ms)) continue
    const arr = map.get(plate) ?? []
    arr.push({ ms, logicalCode })
    map.set(plate, arr)
  }
  return map
}

export function buildExcelCameraMatrix(
  circuitCode: string,
  movimientos: ExcelMovimientoLike[],
  events: RawJourneyEventLike[],
  opts?: { preferCreatedAt?: boolean; windowPaddingHours?: number; alerts?: CameraAuditAlertLike[] }
): CameraMatrixRow[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  // Índice cacheado por identidad de `events`: se reusa entre circuitos y con la calibración.
  const index = cameraAuditIndexFor(events, opts?.alerts)

  return movimientos.map((mov) => {
    const windowEvents = collectOperationWindowEvents(mov, index, opts)

    const captures: Record<string, boolean> = {}
    for (const step of steps) {
      captures[step.key] = windowEvents.some((e) => eventMatchesCameraStep(e, step))
    }

    return {
      ctg: mov.ctg,
      patente: mov.plate,
      diaEgreso: dayKeyFromSalida(mov.externalSalidaAt),
      captures,
    }
  })
}

export function countRowCapturePoints(row: CameraMatrixRow, circuitCode: string): number {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  return steps.filter((s) => row.captures[s.key]).length
}

/** Hitos que ensucian conclusiones generales del cuadro de calibración (no se usan en KPIs/brief). */
export const CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS = new Set(['balanza_egreso_slz'])

/** Puntos de “descarga” por circuito (Celda 16 / Volcable Ric / Volcable SL). */
export const DESCARGA_CAMERA_STEP_KEYS = new Set(['celda16_descarga', 'volcable', 'volcable_slz'])

export function getCalibrationAnalysisSteps(circuitCode: string): readonly ExcelCameraStep[] {
  return getExcelCameraStepsForCircuit(circuitCode).filter(
    (s) => !CALIBRATION_GENERAL_EXCLUDED_STEP_KEYS.has(s.key)
  )
}

export function countRowCapturePointsForCalibration(
  row: CameraMatrixRow,
  circuitCode: string
): number {
  return getCalibrationAnalysisSteps(circuitCode).filter((s) => row.captures[s.key]).length
}

export type PointCaptureDepthSummary = {
  total: number
  /** Camiones con todos los hitos de análisis capturados. */
  allPoints: number
  /** Todos los hitos de análisis excepto descarga (celda16/volcable). */
  allExceptDescarga: number
  /** Exactamente 3 hitos de análisis capturados. */
  exactly3Points: number
  analysisStepCount: number
  descargaStepKeys: string[]
}

/** Profundidad de lectura por camión (usa hitos de calibración, sin balanza egreso SL). */
export function summarizePointCaptureDepth(
  circuitCode: string,
  rows: CameraMatrixRow[]
): PointCaptureDepthSummary {
  const steps = getCalibrationAnalysisSteps(circuitCode)
  const descargaStepKeys = steps
    .filter((s) => DESCARGA_CAMERA_STEP_KEYS.has(s.key))
    .map((s) => s.key)
  const nonDescarga = steps.filter((s) => !DESCARGA_CAMERA_STEP_KEYS.has(s.key))
  let allPoints = 0
  let allExceptDescarga = 0
  let exactly3Points = 0
  for (const row of rows) {
    const n = steps.filter((s) => row.captures[s.key]).length
    if (steps.length > 0 && n === steps.length) allPoints += 1
    if (nonDescarga.length > 0 && nonDescarga.every((s) => row.captures[s.key])) {
      allExceptDescarga += 1
    }
    if (n === 3) exactly3Points += 1
  }
  return {
    total: rows.length,
    allPoints,
    allExceptDescarga,
    exactly3Points,
    analysisStepCount: steps.length,
    descargaStepKeys,
  }
}

export type RouteRecognitionSummary = {
  minPoints: number
  recognizedCount: number
  total: number
  recognizedRatePct: number
}

/** Camiones con al menos `minPoints` hitos de cámara SI en el recorrido del circuito. */
export function summarizeRouteRecognition(
  circuitCode: string,
  rows: CameraMatrixRow[],
  minPoints = 4
): RouteRecognitionSummary {
  const total = rows.length
  const recognizedCount = rows.filter(
    (r) => countRowCapturePoints(r, circuitCode) >= minPoints
  ).length
  const recognizedRatePct =
    total > 0 ? Math.round((recognizedCount / total) * 10000) / 100 : 0
  return { minPoints, recognizedCount, total, recognizedRatePct }
}

/** Reconocimiento para el cuadro general de calibración (excluye balanza egreso SL). */
export function summarizeRouteRecognitionForCalibration(
  circuitCode: string,
  rows: CameraMatrixRow[],
  minPoints = 4
): RouteRecognitionSummary {
  const total = rows.length
  const recognizedCount = rows.filter(
    (r) => countRowCapturePointsForCalibration(r, circuitCode) >= minPoints
  ).length
  const recognizedRatePct =
    total > 0 ? Math.round((recognizedCount / total) * 10000) / 100 : 0
  return { minPoints, recognizedCount, total, recognizedRatePct }
}

export function summarizeExcelCameraMatrix(
  circuitCode: string,
  rows: CameraMatrixRow[]
): CameraStepSummary[] {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const total = rows.length
  return steps.map((step) => {
    const captured = rows.filter((r) => r.captures[step.key]).length
    const captureRatePct = total > 0 ? Math.round((captured / total) * 10000) / 100 : 0
    const errorRatePct = total > 0 ? Math.round((1 - captured / total) * 10000) / 100 : 0
    return {
      key: step.key,
      header: step.header,
      logicalCode: step.logicalCode,
      captured,
      total,
      captureRatePct,
      errorRatePct,
    }
  })
}

export function excelCameraMatrixToCsv(
  circuitCode: string,
  rows: CameraMatrixRow[],
  summaries?: CameraStepSummary[],
  routeRecognition?: RouteRecognitionSummary
): string {
  const steps = getExcelCameraStepsForCircuit(circuitCode)
  const esc = (v: string | number | boolean) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = [
    'ctg',
    'patente',
    'dia_egreso',
    'puntos_capturados',
    ...steps.map((s) => s.header),
  ]
  const lines = [header.join(',')]
  for (const r of rows) {
    const puntos = countRowCapturePoints(r, circuitCode)
    lines.push(
      [
        r.ctg,
        r.patente,
        r.diaEgreso,
        puntos,
        ...steps.map((s) => (r.captures[s.key] ? 'SI' : 'NO')),
      ]
        .map(esc)
        .join(',')
    )
  }
  if (summaries?.length) {
    lines.push('')
    lines.push(['RESUMEN', '', 'total_camiones', String(rows.length)].map(esc).join(','))
    if (routeRecognition) {
      lines.push(
        [
          `reconocidos_${routeRecognition.minPoints}_puntos_o_mas`,
          '',
          `${routeRecognition.recognizedCount}/${routeRecognition.total}`,
          `${routeRecognition.recognizedRatePct}%`,
        ]
          .map(esc)
          .join(',')
      )
    }
    for (const s of summaries) {
      lines.push(
        [
          s.header,
          '',
          `${s.captured}/${s.total}`,
          `${s.captureRatePct}%`,
          `error_${s.errorRatePct}%`,
        ]
          .map(esc)
          .join(',')
      )
    }
  }
  return lines.join('\n')
}

/** Mapeo DTO API → filas de auditoría (incluye rawTruckPlate de balanza egreso). */
export function realJourneyEventDtoToCameraAuditRow(e: RealJourneyEventDto): RawJourneyEventLike {
  return {
    journeyUid: e.journeyUid,
    truckPlate: e.truckPlate,
    normalizedPlate: e.normalizedPlate,
    rawTruckPlate: e.rawTruckPlate,
    deviceCode: e.deviceCode,
    sectorCode: e.sectorCode,
    occurredAt: e.occurredAt,
    createdAt: e.createdAt,
    modifiedAt: e.modifiedAt,
    recordedAt: e.recordedAt,
  }
}

export function formatExcelCameraSummaryLog(
  circuitCode: string,
  summaries: CameraStepSummary[],
  total: number,
  routeRecognition?: RouteRecognitionSummary
): string {
  const code = String(circuitCode).trim().toUpperCase()
  const lines = [
    `=== Matriz ${code}: captura por cámara (crudo vs listado Excel) ===`,
    `Total camiones ${code}: ${total}`,
  ]
  if (routeRecognition) {
    lines.push(
      `Reconocidos en >= ${routeRecognition.minPoints} puntos del recorrido: ${routeRecognition.recognizedCount}/${routeRecognition.total} (${routeRecognition.recognizedRatePct}%)`
    )
  }
  lines.push('', 'columna | capturados | % ok | % error (no leído)')
  for (const s of summaries) {
    lines.push(
      `${s.header} | ${s.captured}/${s.total} | ${s.captureRatePct}% | ${s.errorRatePct}%`
    )
  }
  return lines.join('\n')
}
