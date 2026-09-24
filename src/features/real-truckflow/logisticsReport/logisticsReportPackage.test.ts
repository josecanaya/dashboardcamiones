/**
 * Pruebas del paquete del informe de logística.
 *
 * Cubren lo que puede hacer daño en un informe: que el período sea exactamente el elegido,
 * que un cero no se confunda con un faltante, y que una corrida incompleta se declare en
 * vez de completarse sola.
 */
import { describe, expect, it } from 'vitest'
import { buildLogisticsReportPackage } from './logisticsReportPackage'
import { buildReportPeriod, weekdayNameOf } from './logisticsReportPeriod'
import { buildActivitySection, ACTIVITY_SOURCES } from './logisticsReportActivity'
import { buildTiemposSection, plantOfTramo } from './logisticsReportTiempos'
import { buildEjecutivoSection } from './logisticsReportEjecutivo'

/** CSV mínimo a partir de filas. */
function csvOf(headers: string[], rows: Record<string, string>[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(String(r[h] ?? ''))).join(',')),
  ].join('\n')
}

const ACTIVITY_HEADERS = [
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
]

function activityRow(o: Partial<Record<string, string>>): Record<string, string> {
  return {
    journey_id: 'j1',
    patente: 'AAA111',
    producto: 'SOJA',
    circuito: 'R7',
    camara: 'RicCal01',
    timestamp: '2026-09-10T08:00:00.000-03:00',
    fecha: '2026-09-10',
    hora: '08:00',
    intervalo_hora: '2026-09-10T08:00:00',
    franja_operativa: 'Mañana',
    ...o,
  }
}

describe('período del informe', () => {
  it('reconoce la semana estándar jueves→miércoles', () => {
    const p = buildReportPeriod('2026-09-10', '2026-09-16')
    expect(p.standardThursdayToWednesday).toBe(true)
    expect(p.days).toHaveLength(7)
    expect(p.dayByWeekday.get('Jueves')).toBe('2026-09-10')
    expect(p.dayByWeekday.get('Miércoles')).toBe('2026-09-16')
  })

  it('trata como semana en curso el rango que arranca jueves y aún no cierra', () => {
    // Rutina del usuario: el viernes procesa solo el jueves, el martes del jueves al lunes.
    const p = buildReportPeriod('2026-09-10', '2026-09-12')
    expect(p.standardThursdayToWednesday).toBe(false)
    expect(p.partialWeekInProgress).toBe(true)
    expect(p.atypical).toBe(false)
    // Los días cargados sí se ubican en su lugar de la plantilla.
    expect(p.dayByWeekday.get('Jueves')).toBe('2026-09-10')
    expect(p.dayByWeekday.get('Sábado')).toBe('2026-09-12')
    expect(p.missingWeekdays).toEqual(['Domingo', 'Lunes', 'Martes', 'Miércoles'])
  })

  it('marca atípico solo lo que no arranca jueves', () => {
    // Lunes→domingo (la ventana en que se guardan las corridas) NO es el período del informe.
    const w = buildReportPeriod('2026-09-07', '2026-09-13')
    expect(w.atypical).toBe(true)
    expect(w.dayByWeekday.size).toBe(0)
  })

  it('nombra los días como los rotula la plantilla', () => {
    expect(weekdayNameOf('2026-09-10')).toBe('Jueves')
    expect(weekdayNameOf('2026-09-13')).toBe('Domingo')
  })
})

describe('recorte al período exacto', () => {
  const period = buildReportPeriod('2026-09-10', '2026-09-16')
  const spec = ACTIVITY_SOURCES[0]!

  it('descarta los días de la corrida que caen fuera del período', () => {
    const csv = csvOf(ACTIVITY_HEADERS, [
      // dentro
      activityRow({ journey_id: 'in1', timestamp: '2026-09-10T08:00:00.000-03:00' }),
      activityRow({ journey_id: 'in2', timestamp: '2026-09-16T08:00:00.000-03:00' }),
      // fuera: la corrida lunes→domingo trae estos días, el informe no los quiere
      activityRow({ journey_id: 'out1', timestamp: '2026-09-08T08:00:00.000-03:00' }),
      activityRow({ journey_id: 'out2', timestamp: '2026-09-18T08:00:00.000-03:00' }),
    ])
    const s = buildActivitySection(spec, csv, period)
    expect(s.period.totals.trucks).toBe(2)
    expect(s.rowsOutsidePeriod).toBe(2)
  })

  it('no cuenta dos veces el día de borde que llega por dos corridas', () => {
    const dup = activityRow({ journey_id: 'dup', timestamp: '2026-09-13T08:00:00.000-03:00' })
    const s = buildActivitySection(spec, csvOf(ACTIVITY_HEADERS, [dup, { ...dup }]), period)
    expect(s.period.totals.trucks).toBe(1)
    expect(s.duplicateRowsDropped).toBe(1)
  })
})

describe('cero válido frente a dato faltante', () => {
  const period = buildReportPeriod('2026-09-10', '2026-09-16')
  const spec = ACTIVITY_SOURCES[0]!

  it('un día sin actividad da cero, no ausencia de sección', () => {
    const csv = csvOf(ACTIVITY_HEADERS, [
      activityRow({ journey_id: 'a', timestamp: '2026-09-10T08:00:00.000-03:00' }),
    ])
    const s = buildActivitySection(spec, csv, period)
    expect(s.missing).toBe(false)
    expect(s.trucksByDay.get('2026-09-10')).toBe(1)
    // El domingo no tuvo actividad: cero medido, no dato faltante.
    expect(s.trucksByDay.get('2026-09-13')).toBe(0)
  })

  it('una tabla ausente se marca `missing`, que es distinto de cero', () => {
    const s = buildActivitySection(spec, undefined, period)
    expect(s.missing).toBe(true)
    expect(s.period.totals.trucks).toBe(0)
  })
})

describe('corrida incompleta: se declara, no se rellena', () => {
  const period = buildReportPeriod('2026-09-10', '2026-09-16')

  it('una sección de tiempos sin recorridos de cámara no es publicable', () => {
    const excel = csvOf(
      ['external_operation_id', 'resolved_executive_circuit_code', 'truckflow_first_seen_at', 'external_ingreso_at', 'external_salida_at'],
      [
        {
          external_operation_id: 'op1',
          resolved_executive_circuit_code: 'R7',
          truckflow_first_seen_at: '2026-09-10T08:00:00-03:00',
          external_ingreso_at: '2026-09-10T07:50:00-03:00',
          external_salida_at: '2026-09-10T09:00:00-03:00',
        },
      ]
    )
    const s = buildTiemposSection(['R7'], { excelOperationsCsv: excel }, period)
    expect(s.operations).toBe(1)
    expect(s.period.journeys).toBe(0)
  })

  it('el paquete lista los pendientes en vez de completarlos con cero', () => {
    const tr = {
      csv: {
        calada_camera_events: csvOf(ACTIVITY_HEADERS, [
          activityRow({ journey_id: 'a', timestamp: '2026-09-10T08:00:00.000-03:00' }),
        ]),
      },
      stats: { kpiTiemposBuilt: true },
      rulesVersion: 'etl_transform_v16',
    } as never

    const pkg = buildLogisticsReportPackage(tr, { from: '2026-09-10', to: '2026-09-16' })
    expect(pkg.periodo.atipico).toBe(false)
    // Las secciones sin tabla quedan declaradas como pendientes, no en cero silencioso.
    const ids = pkg.controles.pendientes.map((p) => p.id)
    expect(ids).toContain('actividad.calada_san_lorenzo')
    expect(ids).toContain('actividad.volcable_san_lorenzo')
    // La que sí tiene datos NO es pendiente.
    expect(ids).not.toContain('actividad.calada_ricardone')
    expect(pkg.actividad.calada_ricardone!.periodo.camiones).toBe(1)
  })

  it('distingue período atípico de semana en curso', () => {
    const tr = { csv: {}, stats: {}, rulesVersion: 'v16' } as never
    const pkg = buildLogisticsReportPackage(tr, { from: '2026-09-07', to: '2026-09-13' })
    expect(pkg.periodo.atipico).toBe(true)
    expect(pkg.controles.advertencias.map((a) => a.id)).toContain('periodo.atipico')

    const enCurso = buildLogisticsReportPackage(tr, { from: '2026-09-10', to: '2026-09-12' })
    expect(enCurso.periodo.atipico).toBe(false)
    expect(enCurso.periodo.semanaEnCurso).toBe(true)
    expect(enCurso.controles.advertencias.map((a) => a.id)).toContain('periodo.semana_en_curso')
  })

  it('registra período, corridas y rulesVersion como procedencia', () => {
    const tr = { csv: {}, stats: { kpiTiemposBuilt: true }, rulesVersion: 'etl_transform_v16' } as never
    const pkg = buildLogisticsReportPackage(tr, {
      from: '2026-09-10',
      to: '2026-09-16',
      runIds: ['2026-09-07_2026-09-13', '2026-09-14_2026-09-20'],
      composedRange: '2026-09-10..2026-09-16',
    })
    expect(pkg.fuentes.rulesVersion).toBe('etl_transform_v16')
    expect(pkg.fuentes.runIds).toHaveLength(2)
    expect(pkg.fuentes.composedRange).toBe('2026-09-10..2026-09-16')
    expect(pkg.fuentes.kpiTiemposBuilt).toBe(true)
    // La diferencia de política temporal entre bloques queda declarada.
    expect(pkg.controles.politicaDia.actividad).toBe('dia_calendario_argentina')
    expect(pkg.controles.politicaDia.tiempos).toBe('dia_operativo_22h')
  })
})

describe('sección ejecutiva', () => {
  const period = buildReportPeriod('2026-09-10', '2026-09-16')

  const DM_HEADERS = [
    'journey_id',
    'plate',
    'site',
    'first_event_at',
    'last_event_at',
    'executive_circuit_code',
    'executive_circuit_label',
    'matched_circuit_code',
    'executive_status',
    'matrix_final_status',
    'committee_group',
    'enabled_for_classification',
    'show_in_committee',
    'executive_bucket',
  ]

  function dmRow(o: Partial<Record<string, string>>): Record<string, string> {
    return {
      journey_id: 'j1',
      plate: 'AAA111',
      site: 'ricardone',
      first_event_at: '2026-09-10T08:00:00.000-03:00',
      last_event_at: '2026-09-10T10:00:00.000-03:00',
      executive_circuit_code: 'R7',
      executive_circuit_label: 'Terminal de embarque',
      matched_circuit_code: 'R7',
      executive_status: 'VALIDO',
      matrix_final_status: 'valido',
      committee_group: 'COMPLETOS',
      enabled_for_classification: 'true',
      show_in_committee: 'true',
      executive_bucket: 'COMPLETO',
      ...o,
    }
  }

  it('recorta por período ANTES de clasificar (el índice canonicaliza el uid)', () => {
    // Un uid fusionado se normaliza dentro del índice, así que filtrar las entries por el
    // journey_id crudo después perdía la mayoría de los recorridos.
    const csv = csvOf(DM_HEADERS, [
      dmRow({ journey_id: 'merged_aaaaaaaaaaa__bbbbbbbbbbb', first_event_at: '2026-09-10T08:00:00-03:00' }),
      dmRow({ journey_id: 'merged_ccccccccccc__ddddddddddd', first_event_at: '2026-09-11T08:00:00-03:00' }),
      // fuera del período: la corrida lo trae, el informe no
      dmRow({ journey_id: 'merged_eeeeeeeeeee__fffffffffff', first_event_at: '2026-09-08T08:00:00-03:00' }),
    ])
    const s = buildEjecutivoSection({ debugMatrixCsv: csv }, period)
    expect(s.missing).toBe(false)
    expect(s.recorridosEnPeriodo).toBe(2)
  })

  it('aplica la regla del día operativo 22:00 al recorte', () => {
    const csv = csvOf(DM_HEADERS, [
      // 09/09 a las 23:00 → día operativo 10/09: entra
      dmRow({ journey_id: 'a', first_event_at: '2026-09-09T23:00:00-03:00' }),
      // 09/09 a las 21:00 → día operativo 09/09: queda fuera
      dmRow({ journey_id: 'b', first_event_at: '2026-09-09T21:00:00-03:00' }),
    ])
    const s = buildEjecutivoSection({ debugMatrixCsv: csv }, period)
    expect(s.recorridosEnPeriodo).toBe(1)
  })

  it('sin debug_matrix queda marcada como faltante, no en cero', () => {
    const s = buildEjecutivoSection({}, period)
    expect(s.missing).toBe(true)
    expect(s.recorridosEnPeriodo).toBe(0)
  })
})

describe('período sin datos cargados', () => {
  it('marca sinDatos cuando no hay nada del período', () => {
    const tr = { csv: {}, stats: {}, rulesVersion: 'v16' } as never
    const pkg = buildLogisticsReportPackage(tr, { from: '2026-09-10', to: '2026-09-16' })
    expect(pkg.controles.sinDatos).toBe(true)
  })

  it('no marca sinDatos cuando alguna sección trae filas', () => {
    const tr = {
      csv: {
        calada_camera_events: csvOf(ACTIVITY_HEADERS, [
          activityRow({ journey_id: 'a', timestamp: '2026-09-10T08:00:00.000-03:00' }),
        ]),
      },
      stats: {},
      rulesVersion: 'v16',
    } as never
    const pkg = buildLogisticsReportPackage(tr, { from: '2026-09-10', to: '2026-09-16' })
    expect(pkg.controles.sinDatos).toBe(false)
  })
})

describe('tiempos por planta: suma de medias por tramo', () => {
  const period = buildReportPeriod('2026-09-10', '2026-09-16')

  it('separa Ricardone de San Lorenzo por el tránsito interplanta', () => {
    // Los puntos de San Lorenzo llevan prefijo SL_; el salto de uno a otro es el interplanta.
    expect(plantOfTramo('INGRESO', 'PREINGRESO')).toBe('RICARDONE')
    expect(plantOfTramo('CALADA', 'EGRESO')).toBe('RICARDONE')
    expect(plantOfTramo('EGRESO', 'SL_INGRESO')).toBe('INTERPLANTA')
    expect(plantOfTramo('SL_INGRESO', 'SL_BALANZA_INGRESO')).toBe('SAN_LORENZO')
    expect(plantOfTramo('SL_VOLCABLE', 'SL_EGRESO')).toBe('SAN_LORENZO')
  })

  it('suma las medias de los tramos del template, no toda transición observada', () => {
    const legs = csvOf(
      ['executive_circuit_code', 'journey_id', 'plate', 'from_logical', 'to_logical', 'transition_label', 'duration_min'],
      [
        // Tramos del template de R7 (Ricardone): 10 + 20 + 30 = 60
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'INGRESO', to_logical: 'PREINGRESO', duration_min: '10' },
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'PREINGRESO', to_logical: 'CALADA', duration_min: '20' },
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'CALADA', to_logical: 'EGRESO', duration_min: '30' },
        // Camino alternativo: NO está en el template, no debe sumar.
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'INGRESO', to_logical: 'CALADA', duration_min: '99' },
        // San Lorenzo: 40 + 50 = 90 (falta SL_VOLCABLE→SL_EGRESO, no suma)
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'SL_INGRESO', to_logical: 'SL_BALANZA_INGRESO', duration_min: '40' },
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'SL_BALANZA_INGRESO', to_logical: 'SL_VOLCABLE', duration_min: '50' },
        // Interplanta
        { executive_circuit_code: 'R7', journey_id: 'j1', from_logical: 'EGRESO', to_logical: 'SL_INGRESO', duration_min: '15' },
      ]
    )
    const journeys = csvOf(
      ['journey_id', 'executive_circuit_code', 'start_time'],
      [{ journey_id: 'j1', executive_circuit_code: 'R7', start_time: '2026-09-10T08:00:00-03:00' }]
    )
    const s = buildTiemposSection(['R7'], { segmentTimingLegsCsv: legs, circuitTimingJourneysCsv: journeys }, period)
    const p = s.period.plants
    expect(p.ricMediaMin).toBe(60)
    expect(p.ricTramos).toBe(3)
    expect(p.slMediaMin).toBe(90)
    expect(p.slTramos).toBe(2)
    expect(p.bridgeMediaMin).toBe(15)
  })

  it('un circuito que no va a San Lorenzo deja San Lorenzo en null, no en cero', () => {
    // Girasol (R5) es solo Ricardone: su template no tiene puntos SL_.
    const legs = csvOf(
      ['executive_circuit_code', 'journey_id', 'from_logical', 'to_logical', 'duration_min'],
      [
        { executive_circuit_code: 'R5', journey_id: 'g1', from_logical: 'INGRESO', to_logical: 'PREINGRESO', duration_min: '5' },
        { executive_circuit_code: 'R5', journey_id: 'g1', from_logical: 'PREINGRESO', to_logical: 'CALADA', duration_min: '80' },
      ]
    )
    const journeys = csvOf(
      ['journey_id', 'executive_circuit_code', 'start_time'],
      [{ journey_id: 'g1', executive_circuit_code: 'R5', start_time: '2026-09-11T08:00:00-03:00' }]
    )
    const s = buildTiemposSection(['R5', 'R6'], { segmentTimingLegsCsv: legs, circuitTimingJourneysCsv: journeys }, period)
    expect(s.period.plants.ricMediaMin).toBe(85)
    expect(s.period.plants.slMediaMin).toBeNull()
    expect(s.period.plants.bridgeMediaMin).toBeNull()
  })

  it('recorta los legs al período por el día operativo de su journey', () => {
    const legs = csvOf(
      ['executive_circuit_code', 'journey_id', 'from_logical', 'to_logical', 'duration_min'],
      [
        { executive_circuit_code: 'R7', journey_id: 'dentro', from_logical: 'INGRESO', to_logical: 'PREINGRESO', duration_min: '10' },
        { executive_circuit_code: 'R7', journey_id: 'fuera', from_logical: 'INGRESO', to_logical: 'PREINGRESO', duration_min: '1000' },
      ]
    )
    const journeys = csvOf(
      ['journey_id', 'executive_circuit_code', 'start_time'],
      [
        { journey_id: 'dentro', executive_circuit_code: 'R7', start_time: '2026-09-10T08:00:00-03:00' },
        // La corrida lunes→domingo lo trae, pero cae fuera del informe jueves→miércoles.
        { journey_id: 'fuera', executive_circuit_code: 'R7', start_time: '2026-09-08T08:00:00-03:00' },
      ]
    )
    const s = buildTiemposSection(['R7'], { segmentTimingLegsCsv: legs, circuitTimingJourneysCsv: journeys }, period)
    const tramo = s.period.plants.tramos.find((t) => t.key === 'INGRESO→PREINGRESO')!
    expect(tramo.n).toBe(1)
    expect(tramo.mediaMin).toBe(10)
  })
})
