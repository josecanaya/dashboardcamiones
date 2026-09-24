/**
 * Sección de actividad del informe (calada y descargas/volcables).
 *
 * Reusa `buildCameraActivityModel` — el MISMO módulo que dibuja los paneles del dashboard —
 * y solo agrega el recorte al período y el desglose por día que la plantilla necesita.
 *
 * ## Política temporal (diferencia real, declarada a propósito)
 *
 * En el dashboard estos paneles agrupan por **día calendario Argentina** (`localDayOf`),
 * mientras que KPI tiempos usa el **día operativo con arranque 22:00**. El exportador
 * conserva la regla de cada bloque para que las cifras coincidan con lo que el usuario ve y
 * valida en pantalla, y **declara la diferencia** en el control del informe en lugar de
 * unificar en silencio. Cambiar calada a 22:00 haría que el informe deje de coincidir con
 * el dashboard, que es la fuente que el usuario coteja.
 */
import { parseCsvToRecords } from '../../../etl-core/csvParse'
import type { CaladaCameraEventRow } from '../etlWorkbench/etlCaladaCameraActivity'
import {
  buildCameraActivityModel,
  localDayOf,
  type CameraActivityModel,
  type CameraActivityOptions,
} from '../etlWorkbench/etlCameraActivityModel'
import { operationalDayOfIso } from '../etlWorkbench/etlOperationalDay'
import type { ReportPeriod } from './logisticsReportPeriod'

export type ActivityDayRule = 'calendar' | 'operational'

export type ActivitySourceSpec = {
  /** Id estable de la sección (se usa en el control y en el catálogo de campos). */
  id: string
  /** Etiqueta legible para el control del informe. */
  label: string
  /** Tabla ETL de origen (clave de `tr.csv`). */
  table: string
  /** Regla de día efectiva en el dashboard para esta sección. */
  dayRule: ActivityDayRule
  options?: CameraActivityOptions
}

/**
 * Secciones de actividad que el informe necesita, con las MISMAS opciones que el dashboard
 * pasa a `CaladaCamerasPanel` en cada pestaña.
 */
export const ACTIVITY_SOURCES: ActivitySourceSpec[] = [
  {
    id: 'calada_ricardone',
    label: 'Calada Ricardone (sólidos)',
    table: 'calada_camera_events',
    dayRule: 'calendar',
    options: { hourlyTrucksExcludeCameras: ['RicCalLiq'] },
  },
  {
    id: 'calada_ricardone_liquidos',
    label: 'Calada Ricardone (líquidos)',
    table: 'calada_ricardone_liquid_events',
    dayRule: 'calendar',
  },
  {
    id: 'calada_san_lorenzo',
    label: 'Calada San Lorenzo',
    table: 'calada_sl_camera_events',
    dayRule: 'calendar',
  },
  {
    id: 'volcable_ricardone',
    label: 'Volcables Ricardone',
    table: 'ricardone_volcable_events',
    dayRule: 'calendar',
  },
  {
    id: 'silos_ricardone',
    label: 'Silos Ricardone',
    table: 'ricardone_silo_events',
    dayRule: 'calendar',
  },
  {
    id: 'volcable_san_lorenzo',
    label: 'Volcables Puerto San Lorenzo',
    table: 'san_lorenzo_volcable_events',
    dayRule: 'calendar',
    // Volcable SL: la verdad del conteo son las filas INGRESO del Excel.
    options: { splitExcelVsCamera: true },
  },
]

/** Día de la fila según la regla de la sección. */
export function dayOfRow(r: CaladaCameraEventRow, rule: ActivityDayRule): string {
  if (rule === 'operational') return operationalDayOfIso(String(r.timestamp ?? ''))
  return localDayOf(r)
}

export type ActivitySection = {
  id: string
  label: string
  table: string
  dayRule: ActivityDayRule
  /** Modelo del período completo (recortado al período exacto). */
  period: CameraActivityModel
  /** Modelo por día del período. Clave: `YYYY-MM-DD`. */
  byDay: Map<string, CameraActivityModel>
  /** Camiones distintos por día (conteo del período recortado). */
  trucksByDay: Map<string, number>
  /** Filas descartadas por caer fuera del período exacto. */
  rowsOutsidePeriod: number
  /** Eventos repetidos descartados (día del borde que llega por dos corridas). */
  duplicateRowsDropped: number
  /** Filas totales de la tabla antes de recortar. */
  rowsTotal: number
  /** `true` si la tabla no existe o vino vacía. */
  missing: boolean
}

function parseRows(csv: string | undefined): CaladaCameraEventRow[] {
  if (!csv?.trim()) return []
  return parseCsvToRecords(csv).rows as unknown as CaladaCameraEventRow[]
}

/**
 * Construye una sección de actividad recortada al período exacto.
 *
 * El recorte es imprescindible: una corrida lunes→domingo contiene días fuera de un informe
 * jueves→miércoles, y `etlComposeRuns` no los saca de estas tablas.
 */
export function buildActivitySection(
  spec: ActivitySourceSpec,
  csv: string | undefined,
  period: ReportPeriod
): ActivitySection {
  const all = parseRows(csv)
  const inPeriod: CaladaCameraEventRow[] = []
  const byDayRows = new Map<string, CaladaCameraEventRow[]>()
  const periodDays = new Set(period.days)
  // Cada corrida guardada incluye el día anterior (arrastre nocturno), así que al componer
  // dos semanas el día del borde llega por duplicado. La composición recorta por la columna
  // `fecha` horneada, pero acá el día se deriva del `timestamp`, que puede diferir: se
  // deduplica por evento para no contar dos veces el mismo paso de cámara.
  const seen = new Set<string>()
  let duplicates = 0
  let outside = 0
  for (const r of all) {
    const day = dayOfRow(r, spec.dayRule)
    if (!periodDays.has(day)) {
      outside += 1
      continue
    }
    const key = `${r.journey_id}|${r.camara}|${r.timestamp}`
    if (seen.has(key)) {
      duplicates += 1
      continue
    }
    seen.add(key)
    inPeriod.push(r)
    const list = byDayRows.get(day) ?? []
    list.push(r)
    byDayRows.set(day, list)
  }
  const byDay = new Map<string, CameraActivityModel>()
  const trucksByDay = new Map<string, number>()
  for (const day of period.days) {
    const model = buildCameraActivityModel(byDayRows.get(day) ?? [], spec.options)
    byDay.set(day, model)
    trucksByDay.set(day, model.totals.trucks)
  }
  return {
    id: spec.id,
    label: spec.label,
    table: spec.table,
    dayRule: spec.dayRule,
    period: buildCameraActivityModel(inPeriod, spec.options),
    byDay,
    trucksByDay,
    rowsOutsidePeriod: outside,
    duplicateRowsDropped: duplicates,
    rowsTotal: all.length,
    missing: all.length === 0,
  }
}

/** Camiones de una calle/cámara concreta en un modelo (0 si esa calle no tuvo actividad). */
export function trucksForCamera(model: CameraActivityModel, camara: string): number {
  return model.perCamera.find((c) => c.camara === camara)?.camiones ?? 0
}

/**
 * Busca una calle por número (`Calle 3`, `Volcable 2`, `RicCal03`…). La plantilla rotula
 * «Calle N» / «Volcable N» y las tablas usan nombres de cámara distintos por sede, así que
 * el match es por el número que aparece en el nombre.
 */
export function trucksForCameraNumber(model: CameraActivityModel, n: number): number | null {
  const hit = model.perCamera.find((c) => {
    const m = c.camara.match(/(\d+)/)
    return m ? Number(m[1]) === n : false
  })
  return hit ? hit.camiones : null
}
