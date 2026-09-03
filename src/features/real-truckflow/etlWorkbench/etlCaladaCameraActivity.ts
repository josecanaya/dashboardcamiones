/**
 * Actividad por cámara de calada (RicCal01–06, RicCalLiq).
 *
 * Motivación: la identidad de la cámara individual solo vive en `deviceCode` de los
 * eventos crudos — al normalizar, todas colapsan a `logicalCode = CALADA` y se pierde
 * cuál cámara recibió al camión. Por eso esta tabla se arma en el build de KPI (tramo 4),
 * donde los eventos siguen disponibles, y se persiste con la corrida (allowlist).
 *
 * Una fila por pasada de camión por cámara de calada. La UI agrega y filtra por circuito
 * (checklist): camiones por cámara, y concurrencia por ventana horaria. El conteo por hora
 * es la definición de ocupación elegida (no dwell hasta el próximo hito).
 */
import { recordsToCsv } from './etlCsv'
import { getExpectedDevicesForLiveSector } from '../../../services/live/liveOperationalCatalog'
import { franjaOperativaFromHour } from './etlSectorOccupancy30min'
import { argentinaLocalParts } from '../../../etl-core/domain/timestamps'
import { getEventOperationalInstantIso } from '../../../services/realEventOperationalTime'
import type { ClassifiedJourneyForTiming } from './etlSegmentTiming'

/**
 * Cámaras de calada, fuente única en el catálogo operativo (`RICARDONE_CALADA`). Incluye
 * `RicCalLiq`: es la calada de líquidos (normaliza a LIQUIDO, no a CALADA), así que hay que
 * reconocerla por device, no por logicalCode.
 */
const CALADA_CAMERA_DEVICES = new Set(getExpectedDevicesForLiveSector('RICARDONE_CALADA'))

/**
 * Ventana de agregación de calada: 1 hora. Deliberadamente distinta de la ocupación por
 * sector (30 min) — en calada la maniobra dura lo suficiente como para que media hora
 * fragmente el pico; la hora entera es la unidad que se lee en el tablero.
 */
export const CALADA_INTERVAL_MINUTES = 60

export type CaladaCameraEventRow = {
  journey_id: string
  patente: string
  producto: string
  circuito: string
  /** Cámara de calada (deviceCode crudo, p. ej. RicCal04 / RicCalLiq). */
  camara: string
  timestamp: string
  fecha: string
  hora: string
  /** Inicio de la ventana horaria (hora local), clave de concurrencia. */
  intervalo_hora: string
  /** Mañana / Tarde / Noche (misma convención que ocupación por sector). */
  franja_operativa: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export type BuildCaladaCameraEventsInput = {
  classifiedJourneys: readonly ClassifiedJourneyForTiming[]
  /** journey_uid → producto (del merge Excel). Opcional: sin merge queda vacío. */
  productByJourneyUid?: Map<string, string> | null
}

/** Opciones del constructor genérico de eventos de cámara. */
type BuildCameraEventsOptions = {
  /**
   * Descartar journeys cuya patente NO es una patente argentina válida (`isValidPlate`). En sectores
   * con OCR malo (aceite OSL: cámaras Ren*) las lecturas erróneas generan patentes basura
   * (`DQWO040`, `KWO04`, `GWO0404`…) que inflan el conteo; con esto solo se cuentan las pasadas con
   * patente legible. Ver [[aceite-descargas-ingreso-excel-first]].
   */
  requireValidPlate?: boolean
}

/**
 * Constructor genérico de eventos de cámara para cualquier set de dispositivos
 * (calada Ricardone, calada SL, etc.). Una fila por evento observado.
 */
function buildCameraEventsForDevices(
  input: BuildCaladaCameraEventsInput,
  deviceSet: Set<string>,
  opts: BuildCameraEventsOptions = {}
): CaladaCameraEventRow[] {
  const productByUid = input.productByJourneyUid ?? null
  const rows: CaladaCameraEventRow[] = []

  for (const cj of input.classifiedJourneys) {
    const journey = cj.journey
    // Patente basura del OCR: en sectores que lo piden (aceite OSL) no cuenta.
    if (opts.requireValidPlate && !journey.isValidPlate) continue
    const journeyUid = String(journey.journeyUid ?? '').trim()
    const patente = String(journey.normalizedPlate || journey.plate || '').trim()
    const circuito = String(cj.executiveCircuitCode ?? '').trim()
    const producto = (journeyUid && productByUid?.get(journeyUid)) || ''

    for (const e of journey.events) {
      const camara = String(e.deviceCode ?? '').trim()
      if (!deviceSet.has(camara)) continue
      const iso = getEventOperationalInstantIso(e)
      if (!iso) continue
      const parts = argentinaLocalParts(iso)
      if (!parts) continue
      const hour = Number(parts.hora_inicio.slice(0, 2))
      rows.push({
        journey_id: journeyUid,
        patente,
        producto,
        circuito,
        camara,
        timestamp: iso,
        fecha: parts.fecha_tramo,
        hora: parts.hora_inicio,
        intervalo_hora: `${parts.fecha_tramo}T${pad2(hour)}:00:00`,
        franja_operativa: franjaOperativaFromHour(hour),
      })
    }
  }

  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.camara.localeCompare(b.camara))
  return rows
}

/**
 * Calada Ricardone estándar (RicCal01–06, EXCLUYE RicCalLiq que tiene su propia tabla/pestaña).
 * La cámara es el `deviceCode` crudo; el circuito es el ejecutivo del journey.
 */
export function buildCaladaCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  const caladaDevicesExcludingLiquid = new Set(
    [...CALADA_CAMERA_DEVICES].filter((d) => d !== 'RicCalLiq')
  )
  return buildCameraEventsForDevices(input, caladaDevicesExcludingLiquid)
}

/** Calada SL: solo SLZCalado. */
export function buildSanLorenzoCaladaCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(input, new Set(['SLZCalado']))
}

/** Calada líquida Ricardone: solo RicCalLiq. */
export function buildRicardoneCaladaLiquidCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(input, new Set(['RicCalLiq']))
}

// ── Descargas Ricardone ──────────────────────────────────────────────────────
// Mismos eventos de cámara (una fila por pasada), distinto set de dispositivos.
// El producto sale del merge (`productByJourneyUid`); sin merge queda «Sin dato».

/** Volcables de descarga Ricardone (2 cámaras): RicVolcable1, RicVolcable2. */
export function buildRicardoneVolcableCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(input, new Set(['RicVolcable1', 'RicVolcable2']))
}

/**
 * Silos Ricardone (5 cámaras): 3 de CARGA (RicS8CargaLinea1, RicS8CargaLinea2, RicS7Carga)
 * y 2 de DESCARGA (RicS7DescLinea1, RicS7DescLinea2). La cámara individual dice la línea.
 */
export function buildRicardoneSiloCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(
    input,
    new Set(['RicS8CargaLinea1', 'RicS8CargaLinea2', 'RicS7Carga', 'RicS7DescLinea1', 'RicS7DescLinea2'])
  )
}

/**
 * Celda 16 Ricardone (4 cámaras): 2 de CARGA (RicC16Carga1, RicC16Carga2) y 2 de DESCARGA
 * (RicC16Descarga1, RicC16Descarga2).
 */
export function buildRicardoneCelda16CameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(
    input,
    new Set(['RicC16Carga1', 'RicC16Carga2', 'RicC16Descarga1', 'RicC16Descarga2'])
  )
}

// ── Descargas de aceite San Lorenzo (actividad de cámara, patentes válidas) ───
// El Excel de aceite no sirve de cruce acá: la plataforma ACEITE_OSL está contaminada con agua
// industrial (SZG666/CMF111) y la lógica canónica usa la cámara S10, no las Ren*. Así que el panel
// muestra la ACTIVIDAD de estas cámaras físicas, descartando las lecturas con patente inválida
// (basura del OCR) para no inflar el número. Ver [[aceite-descargas-ingreso-excel-first]].

/** Aceite OSL (Renova) — cámaras RenCargFte/RenDescFte/RenCargTras/RenDescTras, solo patente válida. */
export function buildSanLorenzoAceiteOslCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(
    input,
    new Set(['RenCargFte', 'RenDescFte', 'RenCargTras', 'RenDescTras']),
    { requireValidPlate: true }
  )
}

/** Aceite PTO (puerto) — cámaras SLZBaiLiq1a/1b/2a/2b, solo patente válida. */
export function buildSanLorenzoAceitePtoCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  return buildCameraEventsForDevices(
    input,
    new Set(['SLZBaiLiq2a', 'SLZBaiLiq1b', 'SLZBaiLiq2b', 'SLZBaiLiq1a']),
    { requireValidPlate: true }
  )
}

export const CALADA_CAMERA_EVENTS_HEADERS = [
  'journey_id',
  'patente',
  'producto',
  'circuito',
  'camara',
  'timestamp',
  'fecha',
  'hora',
  'intervalo_hora',
  'franja_operativa',
] as const

export function caladaCameraEventsCsv(rows: CaladaCameraEventRow[]): string {
  return recordsToCsv([...CALADA_CAMERA_EVENTS_HEADERS], rows as unknown as Record<string, unknown>[])
}
