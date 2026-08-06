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

/**
 * Inicio de la hora local que contiene `ms`, ISO sin zona. Se trunca por componentes
 * locales (no por aritmética sobre el epoch) para no depender de que el offset de zona
 * sea múltiplo de la ventana.
 */
function intervalStartIso(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:00:00`
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
      const iso = String(e.occurredAt ?? '').trim()
      const ms = Date.parse(iso)
      if (!Number.isFinite(ms)) continue
      const d = new Date(ms)
      rows.push({
        journey_id: journeyUid,
        patente,
        producto,
        circuito,
        camara,
        timestamp: iso,
        fecha: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
        hora: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
        intervalo_hora: intervalStartIso(ms),
        franja_operativa: franjaOperativaFromHour(d.getHours()),
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
