/**
 * Paquete de datos del informe de logística.
 *
 * Es el contrato entre el dashboard (que calcula) y el escritor del Excel (que rellena las
 * celdas vinculadas). Se arma con los MISMOS módulos que dibujan las pantallas; acá no hay
 * reglas de negocio nuevas, solo recorte al período exacto y empaquetado.
 *
 * Toda cifra que no se pueda sostener con datos del período queda **fuera** del paquete y
 * entra en `controles.pendientes`. Nunca se rellena con cero ni se deja pasar el valor
 * histórico de la plantilla como si fuera actual.
 */
import type { EtlTransformOutput } from '../etlWorkbench/etlTransformContracts'
import {
  ACTIVITY_SOURCES,
  buildActivitySection,
  type ActivitySection,
} from './logisticsReportActivity'
import { buildTiemposSection, type TiemposCircuitSection } from './logisticsReportTiempos'
import { buildEjecutivoSection, type EjecutivoSection } from './logisticsReportEjecutivo'
import { buildReportPeriod, periodLabel, type ReportPeriod } from './logisticsReportPeriod'

/** Umbral por encima del cual un tiempo puerta a puerta medio deja de ser creíble (min). */
const TIEMPO_MEDIO_IMPLAUSIBLE_MIN = 720

export type PendingField = {
  /** Id del gráfico o campo de la plantilla (p. ej. `D28_G1`, `tiempos.girasol`). */
  id: string
  /** Por qué no se pudo completar. */
  reason: string
}

export type ReportWarning = { id: string; detail: string }

export type TiemposGroupSpec = {
  key: string
  label: string
  circuitCodes: string[]
}

/** Grupos de circuitos que la plantilla presenta por producto. */
export const TIEMPOS_GROUPS: TiemposGroupSpec[] = [
  { key: 'soja', label: 'Soja · R7', circuitCodes: ['R7'] },
  { key: 'girasol', label: 'Girasol · R5+R6', circuitCodes: ['R5', 'R6'] },
  {
    key: 'pellet',
    label: 'Pellet',
    circuitCodes: ['R30', 'R31', 'R32', 'R13', 'R14', 'R15'],
  },
]

export type LogisticsReportPackage = {
  schemaVersion: 1
  generatedAt: string
  periodo: {
    from: string
    to: string
    days: string[]
    dayCount: number
    /** `true` solo si el período no arranca jueves (no se puede ubicar en la plantilla). */
    atipico: boolean
    /** Semana en curso: arranca jueves pero todavía no llegó al miércoles. */
    semanaEnCurso: boolean
    /** Días de la semana que el período todavía no cubre. */
    diasFaltantes: string[]
    label: string
  }
  fuentes: {
    rulesVersion: string
    runIds: string[]
    composedRange: string | null
    kpiTiemposBuilt: boolean
    tablesUsed: string[]
  }
  actividad: Record<string, ActivitySectionPayload>
  tiempos: Record<string, TiemposPayload>
  /** Muestra por producto y distribución por circuito (recorridos de cámara clasificados). */
  ejecutivo: EjecutivoSection
  controles: {
    /** `true` si el período no tiene ningún dato cargado (no se debe escribir informe). */
    sinDatos: boolean
    pendientes: PendingField[]
    advertencias: ReportWarning[]
    /**
     * Diferencia de política temporal declarada: actividad usa día calendario, tiempos usa
     * día operativo (22:00). Se informa para que nadie compare rótulos de día entre bloques
     * como si midieran el mismo intervalo.
     */
    politicaDia: { actividad: string; tiempos: string; nota: string }
  }
}

export type ActivitySectionPayload = {
  id: string
  label: string
  table: string
  dayRule: string
  missing: boolean
  rowsTotal: number
  rowsOutsidePeriod: number
  duplicateRowsDropped: number
  periodo: {
    camiones: number
    camaras: number
    picoCamiones: number
    picoLabel: string
    promedioPorHora: number
    medianaPorHora: number
    horasConActividad: number
    porCalle: { camara: string; camiones: number }[]
    /**
     * Camiones por hora, en orden cronológico (una fila por hora con actividad).
     *
     * Es la curva que el dashboard dibuja en el panel de actividad. Antes se calculaba para
     * sacar el pico y se descartaba, y por eso los recuadros de actividad horaria de la
     * presentación quedaban vacíos.
     */
    porHora: HourPoint[]
  }
  porDia: Record<string, ActivityDayPayload>
}

/** Una hora de la curva de actividad: clave ordenable, rótulo para el eje y camiones. */
export type HourPoint = { bucket: string; label: string; camiones: number }

/**
 * Un día de una sección de actividad, con los mismos indicadores que el período.
 *
 * Las láminas diarias muestran pico, ventana del máximo, promedio por hora y total del día;
 * sin estos campos la presentación mostraba los del informe de referencia.
 */
export type ActivityDayPayload = {
  camiones: number
  porCalle: { camara: string; camiones: number }[]
  picoCamiones: number
  picoLabel: string
  promedioPorHora: number
  horasConActividad: number
  porHora: HourPoint[]
}

export type TiemposPayload = {
  label: string
  circuitCodes: string[]
  /** ¿Se pueden publicar los tiempos por planta (suma de medias por tramo)? */
  plantsPublishable: boolean
  /** ¿Se puede publicar el tiempo medio puerta a puerta? Es una métrica distinta. */
  doorToDoorPublishable: boolean
  reasons: string[]
  operaciones: number
  recorridosCamara: number
  periodo: TiemposSlicePayload
  porDia: Record<string, TiemposSlicePayload>
}

export type TiemposSlicePayload = {
  camiones: number
  tiempoMedioMin: number | null
  tiempoMedioN: number
  porCuarto: Record<string, number>
  /** Suma de las medias de los tramos de Ricardone (min). */
  ricMediaMin: number | null
  ricTramos: number
  ricN: number
  /** Suma de las medias de los tramos de San Lorenzo (min). */
  slMediaMin: number | null
  slTramos: number
  slN: number
  /** Tránsito interplanta: lo que separa a las dos plantas. */
  bridgeMediaMin: number | null
  bridgeN: number
  /** Detalle tramo por tramo, para auditar la suma. */
  tramos: { key: string; planta: string; mediaMin: number | null; n: number }[]
}

/** Curva por hora del modelo, ordenada cronológicamente. */
function hourPoints(rows: { bucket: string; label: string; camiones: number }[] | undefined): HourPoint[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((r) => ({ bucket: r.bucket, label: r.label, camiones: r.camiones }))
}

function activityPayload(s: ActivitySection, period: ReportPeriod): ActivitySectionPayload {
  const porDia: ActivitySectionPayload['porDia'] = {}
  for (const day of period.days) {
    const m = s.byDay.get(day)
    porDia[day] = {
      camiones: m?.totals.trucks ?? 0,
      porCalle: (m?.perCamera ?? []).map((c) => ({ camara: c.camara, camiones: c.camiones })),
      picoCamiones: m?.totals.peakTrucks ?? 0,
      picoLabel: m?.totals.peakTrucksLabel ?? '',
      promedioPorHora: m?.totals.avgTrucksPerHour ?? 0,
      horasConActividad: m?.periodHours ?? 0,
      porHora: hourPoints(m?.trucksPerHour),
    }
  }
  return {
    id: s.id,
    label: s.label,
    table: s.table,
    dayRule: s.dayRule,
    missing: s.missing,
    rowsTotal: s.rowsTotal,
    rowsOutsidePeriod: s.rowsOutsidePeriod,
    duplicateRowsDropped: s.duplicateRowsDropped,
    periodo: {
      camiones: s.period.totals.trucks,
      camaras: s.period.totals.cams,
      picoCamiones: s.period.totals.peakTrucks,
      picoLabel: s.period.totals.peakTrucksLabel,
      promedioPorHora: s.period.totals.avgTrucksPerHour,
      medianaPorHora: s.period.totals.medianTrucksPerHour,
      horasConActividad: s.period.periodHours,
      porCalle: s.period.perCamera.map((c) => ({ camara: c.camara, camiones: c.camiones })),
      porHora: hourPoints(s.period.trucksPerHour),
    },
    porDia,
  }
}

function slicePayload(
  q: TiemposCircuitSection['period']['quarters'],
  p: TiemposCircuitSection['period']['plants']
): TiemposSlicePayload {
  const porCuarto: Record<string, number> = {}
  for (const [k, v] of Object.entries(q.porCuarto)) porCuarto[k] = v.camiones
  return {
    camiones: q.total,
    tiempoMedioMin: q.tiempoMedioMin,
    tiempoMedioN: q.tiempoMedioN,
    porCuarto,
    ricMediaMin: p.ricMediaMin,
    ricTramos: p.ricTramos,
    ricN: p.ricN,
    slMediaMin: p.slMediaMin,
    slTramos: p.slTramos,
    slN: p.slN,
    bridgeMediaMin: p.bridgeMediaMin,
    bridgeN: p.bridgeN,
    tramos: p.tramos.map((t) => ({
      key: t.key,
      planta: t.planta,
      mediaMin: t.mediaMin,
      n: t.n,
    })),
  }
}

/**
 * Controles de publicabilidad de una sección de tiempos. No corrige ni ajusta: decide si la
 * cifra se puede sostener, y si no, dice por qué.
 */
function reviewTiempos(section: TiemposCircuitSection): {
  plantsPublishable: boolean
  doorToDoorPublishable: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  if (section.empty) {
    return {
      plantsPublishable: false,
      doorToDoorPublishable: false,
      reasons: ['sin operaciones ni recorridos en el período'],
    }
  }
  const p = section.period

  // Tiempos por planta: dependen de que los tramos tengan muestra.
  const conMuestra = p.plants.tramos.filter((t) => t.n > 0).length
  const plantsPublishable = conMuestra > 0
  if (!plantsPublishable) {
    reasons.push(
      'ningún tramo del circuito tiene muestra: la cobertura de cámara no sostiene el tiempo por planta'
    )
  }

  // Puerta a puerta: es una métrica DISTINTA (salida Excel − ingreso). Se evalúa aparte para
  // no bloquear los tiempos por tramo, que se miden con cámara y pueden estar sanos.
  const medio = p.quarters.tiempoMedioMin
  const doorToDoorPublishable = medio === null || medio <= TIEMPO_MEDIO_IMPLAUSIBLE_MIN
  if (!doorToDoorPublishable) {
    reasons.push(
      `tiempo medio puerta a puerta de ${Math.round(medio as number)} min supera el umbral de verosimilitud (${TIEMPO_MEDIO_IMPLAUSIBLE_MIN} min): no se publica el puerta a puerta`
    )
  }
  return { plantsPublishable, doorToDoorPublishable, reasons }
}

export type BuildPackageOptions = {
  from: string
  to: string
  runIds?: string[]
  composedRange?: string | null
}

/**
 * Arma el paquete del informe a partir de la salida del dashboard ya cargada
 * (`transformResult`), recortando todo al período exacto seleccionado.
 */
export function buildLogisticsReportPackage(
  tr: EtlTransformOutput,
  opts: BuildPackageOptions
): LogisticsReportPackage {
  const period = buildReportPeriod(opts.from, opts.to)
  const pendientes: PendingField[] = []
  const advertencias: ReportWarning[] = []
  const tablesUsed: string[] = []

  if (period.atypical) {
    advertencias.push({
      id: 'periodo.atipico',
      detail:
        `El período ${period.from} → ${period.to} (${period.dayCount} días) no arranca jueves ` +
        'ni es la semana estándar jueves→miércoles. Los gráficos de la plantilla rotulan días ' +
        'por nombre y no admiten este período: quedan pendientes.',
    })
  } else if (period.partialWeekInProgress) {
    advertencias.push({
      id: 'periodo.semana_en_curso',
      detail:
        `Semana en curso: ${period.dayCount} de 7 días (faltan ${period.missingWeekdays.join(', ')}). ` +
        'Los días cargados se ubican en su lugar de la plantilla; los gráficos que necesitan la ' +
        'semana completa quedan pendientes y NO se rellenan con cero.',
    })
  }

  // —— Actividad (calada y descargas) ——
  const actividad: Record<string, ActivitySectionPayload> = {}
  for (const spec of ACTIVITY_SOURCES) {
    const csv = (tr.csv as Record<string, string | undefined>)[spec.table]
    const section = buildActivitySection(spec, csv, period)
    tablesUsed.push(spec.table)
    actividad[spec.id] = activityPayload(section, period)
    if (section.missing) {
      pendientes.push({
        id: `actividad.${spec.id}`,
        reason: `la tabla ${spec.table} no está en la corrida cargada o vino vacía`,
      })
    } else if (section.rowsOutsidePeriod > 0) {
      advertencias.push({
        id: `actividad.${spec.id}`,
        detail:
          `${section.rowsOutsidePeriod} eventos quedaron fuera del período exacto y ` +
          `${section.duplicateRowsDropped} eran repetidos del día de borde entre corridas.`,
      })
    }
  }

  // —— Tiempos por grupo de circuitos ——
  const tiempos: Record<string, TiemposPayload> = {}
  const tiemposInput = {
    excelOperationsCsv: tr.csv.excel_operations_with_truckflow,
    circuitTimingJourneysCsv: tr.csv.circuit_timing_journeys,
    segmentTimingLegsCsv: tr.csv.segment_timing_legs,
  }
  tablesUsed.push(
    'excel_operations_with_truckflow',
    'circuit_timing_journeys',
    'segment_timing_legs'
  )
  for (const spec of TIEMPOS_GROUPS) {
    const section = buildTiemposSection(spec.circuitCodes, tiemposInput, period)
    const review = reviewTiempos(section)
    const reasons = review.reasons
    const porDia: Record<string, TiemposSlicePayload> = {}
    for (const day of period.days) {
      const d = section.byDay.get(day)
      if (d) porDia[day] = slicePayload(d.quarters, d.plants)
    }
    tiempos[spec.key] = {
      label: spec.label,
      circuitCodes: spec.circuitCodes,
      plantsPublishable: review.plantsPublishable,
      doorToDoorPublishable: review.doorToDoorPublishable,
      reasons,
      operaciones: section.operations,
      recorridosCamara: section.period.journeys,
      periodo: slicePayload(section.period.quarters, section.period.plants),
      porDia,
    }
    if (reasons.length) {
      pendientes.push({ id: `tiempos.${spec.key}`, reason: reasons.join('; ') })
    }
  }

  // —— Resumen ejecutivo: producto y distribución por circuito ——
  const ejecutivo = buildEjecutivoSection(
    {
      debugMatrixCsv: tr.csv.debug_matrix_classification,
      mergedTruckflowCsv: tr.csv.merged_truckflow_movimientos,
      excelOperationsCsv: tr.csv.excel_operations_with_truckflow,
    },
    period
  )
  tablesUsed.push('debug_matrix_classification', 'merged_truckflow_movimientos')
  if (ejecutivo.missing) {
    pendientes.push({
      id: 'ejecutivo',
      reason: 'sin debug_matrix_classification en la corrida: no hay clasificación por circuito',
    })
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    periodo: {
      from: period.from,
      to: period.to,
      days: period.days,
      dayCount: period.dayCount,
      atipico: period.atypical,
      semanaEnCurso: period.partialWeekInProgress,
      diasFaltantes: period.missingWeekdays,
      label: periodLabel(period),
    },
    fuentes: {
      rulesVersion: String(tr.rulesVersion ?? ''),
      runIds: opts.runIds ?? [],
      composedRange: opts.composedRange ?? null,
      kpiTiemposBuilt: Boolean(tr.stats?.kpiTiemposBuilt),
      tablesUsed: [...new Set(tablesUsed)],
    },
    actividad,
    tiempos,
    ejecutivo,
    controles: {
      /**
       * `true` cuando el período no tiene NADA cargado: ninguna sección de actividad con
       * filas y ninguna operación de tiempos. Pasa si se cambia el período del formulario
       * sin recargar los datos. Un informe así no se escribe: sería un archivo entero de
       * pendientes con el rótulo de un período que nunca se procesó.
       */
      sinDatos:
        Object.values(actividad).every((a) => a.rowsTotal === 0) &&
        Object.values(tiempos).every((t) => t.operaciones === 0 && t.recorridosCamara === 0),
      pendientes,
      advertencias,
      politicaDia: {
        actividad: 'dia_calendario_argentina',
        tiempos: 'dia_operativo_22h',
        nota:
          'Calada y descargas agrupan por día calendario (regla vigente de esos paneles); KPI ' +
          'tiempos usa el día operativo con arranque 22:00. Se conserva la regla de cada bloque ' +
          'para que el informe coincida con el dashboard; no comparar rótulos de día entre bloques.',
      },
    },
  }
}
