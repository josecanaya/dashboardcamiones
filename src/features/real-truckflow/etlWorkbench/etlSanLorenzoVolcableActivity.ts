/**
 * Actividad por CALLE del volcable de San Lorenzo (5 calles).
 *
 * Doble fuente (la clave de este panel):
 * 1. **Cámara** — el puerto tiene una cámara por calle (`SLZVolcableC1`…`SLZVolcableC5`),
 *    igual que calada: da la calle y el instante exacto de la pasada.
 * 2. **Refuerzo Excel** — la plataforma del Movimiento por Contrato (`VOLCABLE_PTO_N`) también
 *    dice la calle, y trae el producto. Si el camión ESTÁ en el Excel se cuenta en esa calle
 *    aunque la cámara no lo haya leído (usa la hora de descarga del Excel), y se completa el
 *    producto que la cámara no informa. Un camión que la cámara vio pero NO está en el Excel
 *    probablemente sea un error: se lo deja visible con producto «Sin dato».
 *
 * Se arma en el build de KPI (tramo 4) y se persiste con la corrida (allowlist).
 */
import { recordsToCsv } from './etlCsv'
import { franjaOperativaFromHour } from './etlSectorOccupancy30min'
import { argentinaLocalParts, ensureArgentinaOffsetIso } from '../../../etl-core/domain/timestamps'
import { getEventOperationalInstantIso } from '../../../services/realEventOperationalTime'
import { isPelletExcelProduct } from '../../../etl-core/reports/transileExternoCiclo'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'
import {
  CALADA_CAMERA_EVENTS_HEADERS,
  type CaladaCameraEventRow,
} from './etlCaladaCameraActivity'

/** Reusamos el esquema y el intervalo de calada (1 h): el panel es el mismo. */
export const SL_VOLCABLE_EVENTS_HEADERS = CALADA_CAMERA_EVENTS_HEADERS

/** Cámara de calle volcable SL (`SLZVolcableC1`…`C5`) → «Volcable N», o null. */
export function sanLorenzoVolcableCalleFromDevice(deviceCode: string | null | undefined): string | null {
  const m = String(deviceCode ?? '')
    .trim()
    .match(/^SLZVolcableC([1-5])$/i)
  return m ? `Volcable ${m[1]}` : null
}

/** Plataforma Excel del puerto (`VOLCABLE_PTO_N`) → «Volcable N», o null si no es volcable SL. */
export function sanLorenzoVolcableCalleFromPlatform(platform: string | null | undefined): string | null {
  const m = String(platform ?? '')
    .toUpperCase()
    .match(/VOLCABLE[_\s]*PTO[_\s]*0*([1-5])\b/)
  return m ? `Volcable ${m[1]}` : null
}

/** Info Excel de la operación de volcable SL por journey (refuerzo: calle + producto + hora). */
export type VolcableExcelInfo = { calle: string; producto: string; tiempo: string }

/** Fila de Movimiento por Contrato normalizada (solo los campos que usa el panel volcable). */
export type VolcableIngresoMovimientoLike = {
  movement_type?: string
  platform_normalized?: string
  plataforma_original?: string
  plate_normalized?: string
  product_normalized?: string
  producto_original?: string
  es_de_vuelta?: boolean | string
  es_de_vuelta_original?: string
  ctg?: string
  external_operation_id?: string
  external_ingreso_at?: string
  external_calado_at?: string
  external_salida_at?: string
  external_sl_volcable_at?: string
}

/**
 * Sufijo que se le agrega al `external_operation_id` de la **pata INGRESO en volcable del
 * pellet de la vuelta** durante la normalización, para que el dedup por operación (CTG) NO la
 * colapse con su pata EGRESO (la carga en Ricardone, mismo CTG). Sin este sufijo, la fila «I»
 * —la única que dice el volcable del puerto donde descargó— se pierde y el pellet no aparece
 * por Excel en el panel de calles. Mantiene idempotencia: dos «I» del mismo CTG (solape de
 * archivos) reciben el mismo id sufijado y se colapsan entre sí. Ver
 * [[pellet-chip-inyeccion-evidencia]] y [[volcable-sl-calles-panel]].
 */
export const SL_VOLCABLE_PELLET_INGRESO_ID_SUFFIX = '#SLVOLC_IN'

/** De la vuelta laxo: acepta el flag booleano normalizado y el original «SI»/«S»/«X»… */
function isDeVueltaTruthy(row: VolcableIngresoMovimientoLike): boolean {
  if (row.es_de_vuelta === true) return true
  const truthy = new Set(['true', '1', 'yes', 'si', 'sí', 's', 'x', 'verdadero', 'v'])
  const a = String(row.es_de_vuelta ?? '').trim().toLowerCase()
  const b = String(row.es_de_vuelta_original ?? '').trim().toLowerCase()
  return truthy.has(a) || truthy.has(b)
}

/**
 * ¿Es la **pata INGRESO en volcable del pellet de la vuelta**? Es la fila que se pierde hoy en
 * el dedup y que el usuario pide recuperar: dice en qué volcable del puerto descargó el pellet.
 * Criterio acotado (para no tocar nada más): `mov = I` + plataforma `VOLCABLE_PTO_N` +
 * `es_de_vuelta` + producto pellet (match laxo `isPelletExcelProduct`, tolera variantes/typos
 * del operario como «PELLETS GIRASOL», «CASCARA … PELLETEADA», «EXPELLER»). La soja del puerto
 * NO cae acá (no es de la vuelta ni pellet) y sigue contándose como hasta ahora.
 */
export function isSanLorenzoPelletVolcableIngresoLeg(row: VolcableIngresoMovimientoLike): boolean {
  return (
    String(row.movement_type ?? '').toUpperCase() === 'INGRESO' &&
    sanLorenzoVolcableCalleFromPlatform(row.platform_normalized || row.plataforma_original) !== null &&
    isDeVueltaTruthy(row) &&
    isPelletExcelProduct(String(row.product_normalized || row.producto_original || ''))
  )
}

/** Clave patente|día para cruzar movimiento Excel ↔ journey Truckflow. */
export function volcablePlateDayKey(plate: string, day: string): string {
  return `${String(plate ?? '').trim().toUpperCase()}|${day}`
}

/** Días (hora local AR) que cubre un movimiento: ingreso, calado y salida. */
function movimientoDays(m: VolcableIngresoMovimientoLike): string[] {
  const days = new Set<string>()
  for (const iso of [m.external_ingreso_at, m.external_calado_at, m.external_salida_at]) {
    const p = argentinaLocalParts(String(iso ?? '').trim())
    if (p) days.add(p.fecha_tramo)
  }
  return [...days]
}

/**
 * Filas de **INGRESO** (tipo de operación «I») con plataforma `VOLCABLE_PTO_N`: cada una es un
 * camión que descargó en un volcable del puerto, y dice en cuál. Es la fuente de verdad del
 * conteo por calle (el usuario: "solo contá las I, esas dicen a qué volcable descargan").
 */
export function filterVolcableSlIngresoMovimientos<T extends VolcableIngresoMovimientoLike>(
  movimientos: readonly T[]
): T[] {
  return movimientos.filter(
    (m) =>
      String(m.movement_type ?? '').toUpperCase() === 'INGRESO' &&
      sanLorenzoVolcableCalleFromPlatform(m.platform_normalized || m.plataforma_original) !== null
  )
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export type BuildSanLorenzoVolcableEventsInput = {
  classifiedJourneys: readonly ClassifiedJourneyForTiming[]
  /** Filas INGRESO (VOLCABLE_PTO) del Excel — cada una es un camión que descargó en un volcable. */
  volcableIngresoMovimientos?: readonly VolcableIngresoMovimientoLike[] | null
  /** journey_uid → producto (merge), para el producto de los camiones que solo vio la cámara. */
  productByJourneyUid?: Map<string, string> | null
  /**
   * `external_operation_id` (CTG/comprob) → `journey_uid` del match Excel↔Truckflow. Cuando
   * está, cada fila INGRESO del Excel se resuelve 1:1 contra SU journey (y su cámara volcable),
   * en vez de compartir la primera cámara del día para todos los viajes de esa patente. El
   * matching viejo `patente|día` mezclaba los viajes múltiples del mismo día: la fila de las
   * 22:43 podía quedarle a la del 00:32 (delta de 22 h en el pico horario). Ver auditoría
   * en `scratchpad/audit_volcable_sl_hora.mjs`.
   */
  journeyUidByOpId?: Map<string, string> | null
}

/**
 * Conteo por calle del volcable SL. Fuente de verdad = las **filas INGRESO** del Excel (una por
 * camión, con su calle VOLCABLE_PTO), enriquecidas con la hora de la cámara `SLZVolcableC{N}`
 * cuando la pasó (si no, la hora de descarga del Excel). Los camiones que la cámara vio pero que
 * NO están en el Excel (sin fila INGRESO en su patente+día) se cuentan aparte con producto del
 * merge (o «Sin dato»): son los que probablemente sean un error.
 */
export function buildSanLorenzoVolcableEvents(
  input: BuildSanLorenzoVolcableEventsInput
): CaladaCameraEventRow[] {
  const movimientos = input.volcableIngresoMovimientos ?? []
  const productByUid = input.productByJourneyUid ?? null
  const journeyUidByOpId = input.journeyUidByOpId ?? null
  const rows: CaladaCameraEventRow[] = []

  // Índices desde los journeys:
  // - por uid (matching 1:1 con el CTG del Excel cuando lo tenemos: es la vía correcta);
  // - por patente|día (fallback para movimientos sin `external_operation_id` matcheable).
  const camByJourneyUid = new Map<string, { iso: string; circuito: string; calle: string }>()
  const camByPlateDay = new Map<string, { iso: string; uid: string; circuito: string; calle: string }>()
  const journeyByPlateDay = new Map<string, { uid: string; circuito: string }>()
  const cameraJourneys: {
    uid: string
    patente: string
    circuito: string
    calle: string
    iso: string
    days: string[]
  }[] = []

  for (const cj of input.classifiedJourneys) {
    const journey = cj.journey
    const uid = String(journey.journeyUid ?? '').trim()
    const patente = String(journey.normalizedPlate || journey.plate || '').trim().toUpperCase()
    const circuito = String(cj.executiveCircuitCode ?? '').trim()
    let camIso = ''
    let camCalle: string | null = null
    const days = new Set<string>()
    for (const e of journey.events) {
      const iso = getEventOperationalInstantIso(e)
      if (iso) {
        const p = argentinaLocalParts(iso)
        if (p) days.add(p.fecha_tramo)
      }
      if (!camCalle) {
        const calle = sanLorenzoVolcableCalleFromDevice(e.deviceCode)
        if (calle && iso) {
          // Instante operativo (`createdAt` primero), NO `occurredAt` crudo. En este export
          // `occurredAt` viene corrido ~3h26 respecto a `createdAt` (offset fijo: p10=p50=p90
          // =206 min sobre los eventos de volcable). Con `occurredAt` la cámara de la balanza
          // de salida `SLZBalSC2Fte` daba 206 min de delta contra `external_salida_at` del
          // Excel siendo el MISMO evento; con `createdAt` da 0. El volcable pasa de 219 min a
          // 13 min antes de la salida, que es el tiempo real de la operación. Es la misma
          // regla que ya aplica `buildCaladaCameraEvents`; acá se había colado el campo crudo
          // y desplazaba todo el panel (picos en horas donde no había descargas).
          camIso = iso
          camCalle = calle
        }
      }
    }
    if (uid && camCalle && camIso) {
      camByJourneyUid.set(uid, { iso: camIso, circuito, calle: camCalle })
    }
    for (const day of days) {
      const key = volcablePlateDayKey(patente, day)
      if (!journeyByPlateDay.has(key)) journeyByPlateDay.set(key, { uid, circuito })
      if (camCalle && !camByPlateDay.has(key)) camByPlateDay.set(key, { iso: camIso, uid, circuito, calle: camCalle })
    }
    if (camCalle && camIso) cameraJourneys.push({ uid, patente, circuito, calle: camCalle, iso: camIso, days: [...days] })
  }

  const push = (r: {
    journey_id: string
    patente: string
    producto: string
    circuito: string
    calle: string
    iso: string
  }) => {
    const parts = argentinaLocalParts(r.iso)
    if (!parts) return
    const hour = Number(parts.hora_inicio.slice(0, 2))
    rows.push({
      journey_id: r.journey_id,
      patente: r.patente,
      producto: r.producto,
      circuito: r.circuito,
      camara: r.calle,
      timestamp: r.iso,
      fecha: parts.fecha_tramo,
      hora: parts.hora_inicio,
      intervalo_hora: `${parts.fecha_tramo}T${pad2(hour)}:00:00`,
      franja_operativa: franjaOperativaFromHour(hour),
    })
  }

  // 1. Una fila por movimiento INGRESO volcable (la fuente de verdad de la calle y el conteo).
  const consumed = new Set<string>()
  let excelSeq = 0
  for (const m of movimientos) {
    if (String(m.movement_type ?? '').toUpperCase() !== 'INGRESO') continue
    const calle = sanLorenzoVolcableCalleFromPlatform(m.platform_normalized || m.plataforma_original)
    if (!calle) continue
    const plate = String(m.plate_normalized ?? '').trim().toUpperCase()
    if (!plate) continue
    const opId = String(m.external_operation_id || m.ctg || '').trim()
    const days = movimientoDays(m)

    // Prioridad de matching cámara→movimiento:
    // (a) por CTG/opId → journey_uid → cámara volcable de ESE journey (1:1);
    // (b) fallback patente|día si no hay CTG matcheable en el merge.
    // Salvaguarda: solo aceptamos la cámara si su calle == calle del Excel. Un journey puede
    // pasar por más de una cámara volcable (lecturas erróneas, backup); usar la hora de OTRA
    // calle para esta descarga infla horas irrelevantes. Si la calle no coincide, se cae al
    // fallback `salida − 20 min`, que representa mejor el fin de operación de ESA descarga.
    let cam: { iso: string; uid: string; circuito: string } | undefined
    const uidFromOp = opId && journeyUidByOpId ? journeyUidByOpId.get(opId) : undefined
    if (uidFromOp) {
      const c = camByJourneyUid.get(uidFromOp)
      if (c && c.calle === calle) cam = { iso: c.iso, uid: uidFromOp, circuito: c.circuito }
    }

    let jrn: { uid: string; circuito: string } | undefined
    for (const day of days) {
      const key = volcablePlateDayKey(plate, day)
      if (!cam) {
        const c = camByPlateDay.get(key)
        if (c && c.calle === calle) cam = { iso: c.iso, uid: c.uid, circuito: c.circuito }
      }
      jrn = jrn ?? journeyByPlateDay.get(key)
      consumed.add(key)
    }

    // Prioridad de hora (decisión del usuario):
    // (1) cámara del propio journey — matcheada 1:1 por CTG arriba (o patente|día como
    //     último fallback si el CTG no está en el merge);
    // (2) si la cámara no leyó al camión, `salida − 13 min` del Excel (siempre disponible:
    //     el usuario garantiza que TODA descarga tiene salida cargada). 13 min es la mediana
    //     empírica volcable→balanza de salida medida sobre 982 eventos (p10=8, p90=20).
    let iso = cam?.iso || String(m.external_sl_volcable_at || '').trim()
    if (!iso) {
      const salidaRaw = String(m.external_salida_at || '').trim()
      if (salidaRaw) {
        const salidaMs = new Date(ensureArgentinaOffsetIso(salidaRaw)).getTime()
        if (Number.isFinite(salidaMs)) {
          iso = new Date(salidaMs - 13 * 60 * 1000).toISOString()
        }
      }
    }
    if (!iso) continue
    // journey_id ÚNICO por viaje (una fila del Excel = un CTG = una descarga). El panel cuenta
    // journey_id distintos, y un MISMO camión (patente) hace varios viajes/descargas el mismo día
    // —cada uno cuenta—. Antes se usaba el uid de la cámara (uno por patente+día) y los viajes
    // repetidos de la misma patente colapsaban a uno (pellet real 530→290). Se usa la id estable de
    // la operación; la cámara sólo aporta la hora fina. Sin CTG (raro) cae al uid o a un id sintético.
    const journeyId =
      opId ? `excel:${opId}` : cam?.uid || jrn?.uid || `excel-vol:${plate}:${days[0] ?? excelSeq++}`
    push({
      journey_id: journeyId,
      patente: plate,
      producto: String(m.product_normalized ?? '').trim(),
      circuito: cam?.circuito || jrn?.circuito || '',
      calle,
      iso,
    })
  }

  // 2. Camiones que la cámara vio pero SIN fila INGRESO en su patente+día: se cuentan con la
  //    calle de la cámara y el producto del merge (o «Sin dato»). Probables errores / faltantes.
  for (const cj of cameraJourneys) {
    if (cj.days.some((d) => consumed.has(volcablePlateDayKey(cj.patente, d)))) continue
    push({
      journey_id: cj.uid,
      patente: cj.patente,
      producto: (cj.uid && productByUid?.get(cj.uid)) || '',
      circuito: cj.circuito,
      calle: cj.calle,
      iso: cj.iso,
    })
  }

  // Dedupe físico: una descarga = un camión pasa una vez por una calle en un instante. Si
  // aparecen varias filas con (patente, timestamp, calle) idénticos son el mismo camión con
  // múltiples CTGs (típico del pellet de la vuelta: un mismo pase de cámara acarrea 2-4
  // contratos comerciales — TVH101 tenía 4 filas idénticas a las 00:01:37 en V4). Sin este
  // dedupe el pico horario se infla ×4. El primer CTG gana; el resto se descarta para el
  // conteo de descargas físicas.
  const seen = new Set<string>()
  const deduped: CaladaCameraEventRow[] = []
  for (const r of rows) {
    const key = `${r.patente}|${r.timestamp}|${r.camara}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(r)
  }
  deduped.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.camara.localeCompare(b.camara))
  return deduped
}

export function sanLorenzoVolcableEventsCsv(rows: CaladaCameraEventRow[]): string {
  return recordsToCsv([...SL_VOLCABLE_EVENTS_HEADERS], rows as unknown as Record<string, unknown>[])
}
