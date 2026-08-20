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

/**
 * Emite una fila por cada evento de calada observado. La cámara es el `deviceCode` crudo;
 * el circuito es el ejecutivo del journey (para el filtro por circuito de la UI).
 */
export function buildCaladaCameraEvents(input: BuildCaladaCameraEventsInput): CaladaCameraEventRow[] {
  const productByUid = input.productByJourneyUid ?? null
  const rows: CaladaCameraEventRow[] = []

  for (const cj of input.classifiedJourneys) {
    const journey = cj.journey
    const journeyUid = String(journey.journeyUid ?? '').trim()
    const patente = String(journey.normalizedPlate || journey.plate || '').trim()
    const circuito = String(cj.executiveCircuitCode ?? '').trim()
    const producto = (journeyUid && productByUid?.get(journeyUid)) || ''

    for (const e of journey.events) {
      // La cámara individual solo se puede saber por el device crudo, y el set del
      // catálogo es la fuente de verdad (incluye RicCalLiq, que normaliza a LIQUIDO).
      const camara = String(e.deviceCode ?? '').trim()
      if (!CALADA_CAMERA_DEVICES.has(camara)) continue
      // Instante operativo Truckflow = `createdAt` (regla de producto en realEventOperationalTime).
      // NO `occurredAt`: ese campo del evento crudo viene corrido ~3 h respecto de la hora real de
      // captura del DSS (bug de parseo de zona en origen), así que agruparía la calada en la hora
      // equivocada. `createdAt` es el sello del microservicio en hora Argentina y coincide con el
      // "Capture Time" del DSS. Fallback a modifiedAt→recordedAt→occurredAt si falta.
      const iso = getEventOperationalInstantIso(e)
      if (!iso) continue
      // Hora de pared Argentina (−03:00), independiente de la zona del runtime: la calada
      // se agrupa por la hora en que el camión pasó la cámara, no por la hora UTC ni por la
      // del proceso. `getHours()` sobre el epoch daría la hora del host (mal si no es UTC−3);
      // `argentinaLocalParts` deriva las partes desde el offset del ISO (o lo asume −03:00).
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
