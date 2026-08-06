import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildJourneyKeyIndex,
  canonicalJourneyKey,
  journeyUidParts,
  parseJourneyUid,
  resolveJourneyKeys,
} from './journeyKey'
import { resolveOperationTimes } from './levelC'
import { clasificarConContrato, esAnomaliaAfirmable, MIN_EVENTOS_AFIRMABLE } from './levelD'
import { buildLevels, type Row } from './index'

describe('journeyKey — las tres formas de uid conviven', () => {
  it('parsea uid crudo', () => {
    const p = parseJourneyUid('d50b1d90-9f05-4458-a599-631f0127070f')
    expect(p.kind).toBe('raw')
    expect(p.parts).toEqual(['d50b1d90-9f0'])
  })

  it('parsea uid fusionado', () => {
    const p = parseJourneyUid('merged_329523c2-a2d__c7c3fe96-fa2')
    expect(p.kind).toBe('merged')
    expect(p.parts).toEqual(['329523c2-a2d', 'c7c3fe96-fa2'])
  })

  it('parsea vueltas del mismo camión', () => {
    const p = parseJourneyUid('c4a26b1a-9532-414b-9fb5-d22102d1419e__cycle_2')
    expect(p.kind).toBe('cycle')
    expect(p.cycle).toBe('2')
  })

  /**
   * El defecto que costó 205 recorridos de 2.384: truncar a 12 chars hacía que
   * las 7 vueltas de un camión fueran la misma llave y se pisaran entre sí.
   */
  it('NO colapsa dos vueltas del mismo camión', () => {
    const base = 'c4a26b1a-9532-414b-9fb5-d22102d1419e'
    const k1 = canonicalJourneyKey(`${base}__cycle_1`)
    const k2 = canonicalJourneyKey(`${base}__cycle_2`)
    expect(k1).not.toBe(k2)
  })

  it('la llave de un fusionado no depende del orden de sus partes', () => {
    expect(canonicalJourneyKey('merged_bbb__aaa')).toBe(canonicalJourneyKey('merged_aaa__bbb'))
  })

  /**
   * Normalizar una llave ya normalizada tiene que devolver la misma llave. Sin
   * esto, un fusionado de dos partes de 12 chars se volvía a truncar a 12 y
   * perdía la segunda mitad en cada pasada.
   */
  it('canonicalJourneyKey es idempotente', () => {
    for (const uid of [
      'merged_329523c2-a2d__c7c3fe96-fa2',
      'c4a26b1a-9532-414b-9fb5-d22102d1419e__cycle_3',
      'd50b1d90-9f05-4458-a599-631f0127070f',
    ]) {
      const k1 = canonicalJourneyKey(uid)
      expect(canonicalJourneyKey(k1)).toBe(k1)
    }
  })

  it('religa un uid crudo del Excel con el journey que lo contiene', () => {
    const index = buildJourneyKeyIndex(['merged_d50b1d90-9f0__c7c3fe96-fa2'])
    // El Excel cita el uid completo; D lo guarda fusionado y truncado.
    expect(resolveJourneyKeys('d50b1d90-9f05-4458-a599-631f0127070f', index)).toEqual([
      'c7c3fe96-fa2__d50b1d90-9f0',
    ])
  })

  it('un prefijo compartido devuelve todas las vueltas candidatas', () => {
    const base = 'c4a26b1a-9532-414b-9fb5-d22102d1419e'
    const index = buildJourneyKeyIndex([`${base}__cycle_1`, `${base}__cycle_2`])
    expect(resolveJourneyKeys(base, index)).toHaveLength(2)
  })

  it('journeyUidParts no rompe con basura', () => {
    expect(journeyUidParts('')).toEqual([])
    expect(canonicalJourneyKey('   ')).toBe('')
  })
})

describe('nivel C — los tiempos los da la cámara, el Excel es respaldo', () => {
  const excel = { ingreso: '2026-07-15T06:00:00Z', salida: '2026-07-15T12:00:00Z' }

  it('con cámara completa, ignora el Excel', () => {
    const r = resolveOperationTimes(
      { inicio: '2026-07-15T06:12:00Z', fin: '2026-07-15T11:30:00Z' },
      excel
    )
    expect(r.time_source).toBe('CAMARA')
    expect(r.inicio_at).toBe('2026-07-15T06:12:00Z')
    expect(r.total_min).toBe(318)
  })

  it('con un solo extremo de cámara, completa con Excel y lo declara', () => {
    const r = resolveOperationTimes({ inicio: '2026-07-15T06:12:00Z', fin: '' }, excel)
    expect(r.time_source).toBe('CAMARA_PARCIAL_EXCEL')
    expect(r.inicio_source).toBe('CAMARA')
    expect(r.fin_source).toBe('EXCEL')
  })

  it('sin cámara, usa Excel como respaldo', () => {
    const r = resolveOperationTimes({ inicio: '', fin: '' }, excel)
    expect(r.time_source).toBe('EXCEL_RESPALDO')
  })

  it('sin ninguna hora válida, lo dice en vez de inventar un 0', () => {
    const r = resolveOperationTimes({ inicio: '', fin: '' }, { ingreso: '', salida: 'basura' })
    expect(r.time_source).toBe('SIN_TIEMPO')
    expect(r.total_min).toBe('')
  })

  it('no calcula duraciones negativas', () => {
    const r = resolveOperationTimes(
      { inicio: '2026-07-15T12:00:00Z', fin: '2026-07-15T06:00:00Z' },
      { ingreso: '', salida: '' }
    )
    expect(r.total_min).toBe('')
  })
})

describe('nivel D — precedencia y umbral de evidencia', () => {
  it('una anomalía afirmable gana sobre COMPLETO', () => {
    // El agujero de v13: 52 journeys eran COMPLETO y BEHAVIORAL a la vez, y
    // alimentaban los KPI de logística como si fueran limpios.
    expect(clasificarConContrato('COMPLETO', 'BEHAVIORAL', 8)).toBe("D'")
  })

  it('no afirma comportamiento con evidencia insuficiente', () => {
    expect(esAnomaliaAfirmable('COMPLETO', 'BEHAVIORAL', MIN_EVENTOS_AFIRMABLE)).toBe(false)
    expect(clasificarConContrato('COMPLETO', 'BEHAVIORAL', MIN_EVENTOS_AFIRMABLE)).toBe('D')
  })

  it('el bucket ANOMALO del ETL entra sin importar el conteo', () => {
    expect(esAnomaliaAfirmable('ANOMALO', 'NONE', 1)).toBe(true)
  })

  it('COMPLETO y DEDUCIDO van juntos a D', () => {
    expect(clasificarConContrato('COMPLETO', 'NONE', 9)).toBe('D')
    expect(clasificarConContrato('DEDUCIDO', 'NONE', 9)).toBe('D')
  })

  it('INCOMPLETO va a D-doble-prima', () => {
    expect(clasificarConContrato('INCOMPLETO', 'DATA_COVERAGE', 9)).toBe("D''")
  })

  it('un bucket desconocido no se cuela como válido', () => {
    expect(clasificarConContrato('', '', 9)).toBe("D''")
  })
})

/**
 * Golden: la ventana de referencia. Si estos números cambian, cambió el modelo
 * y hay que explicar por qué — no ajustar el test.
 */
const REF_RUN = join(process.cwd(), 'runs', 'windows', '2026-07-13_2026-07-19', 'tables')
const hayCorrida = existsSync(join(REF_RUN, 'final_circuits.json'))

describe.skipIf(!hayCorrida)('golden — ventana 2026-07-13_2026-07-19', () => {
  const leer = (n: string): Row[] => {
    const p = join(REF_RUN, `${n}.json`)
    if (!existsSync(p)) return []
    const j = JSON.parse(readFileSync(p, 'utf8'))
    return Array.isArray(j) ? j : (j.rows ?? [])
  }

  const res = buildLevels({
    excelRows: leer('excel_operations_with_truckflow'),
    finalCircuits: leer('final_circuits'),
    cleanJourneys: leer('clean_journeys_for_analysis'),
    journeyTimeline: leer('journey_timeline'),
  })

  it('C parte el Excel sin perder ni duplicar filas', () => {
    expect(res.stats.c.excelTotal).toBe(4215)
    expect(res.stats.c.conCamara).toBe(3281)
    expect(res.stats.c.sinCamara).toBe(934)
  })

  it('C no deja citas huérfanas — la llave única cerró la fisura', () => {
    expect(res.stats.c.huerfanas).toBe(0)
  })

  it('D es la partición esperada', () => {
    expect(res.stats.d.validos).toBe(1001)
    expect(res.stats.d.anomalos).toBe(214)
    expect(res.stats.d.incompletos).toBe(1290)
    expect(res.stats.d.sinContrato).toBe(82)
    expect(res.stats.d.esParticion).toBe(true)
  })

  it('ningún recorrido clasificado se pierde en el camino', () => {
    const clasificados = [
      ...res.tables.D_circuitos_validos.rows,
      ...res.tables.D_circuitos_anomalos.rows,
      ...res.tables.D_circuitos_incompletos.rows,
      ...res.tables.D_camiones_sin_contrato.rows,
      ...res.tables.D_descartados.rows,
    ].filter((r) => r.origen === 'CLASIFICADO')
    expect(clasificados).toHaveLength(2384)
  })

  it('todos los invariantes del modelo pasan', () => {
    const rotos = res.invariantes.filter((i) => !i.ok)
    expect(rotos.map((r) => `${r.nombre}: ${r.detalle}`)).toEqual([])
  })

  it('E calcula el KPI de R7 sobre recorridos válidos', () => {
    const r7 = res.tables.E_kpi_circuito.rows.find((r) => r.circuito_code === 'R7')
    expect(r7).toBeDefined()
    expect(r7!.n_operaciones).toBe(751)
    expect(r7!.porcentaje_camara_pura).toBe(100)
  })
})
