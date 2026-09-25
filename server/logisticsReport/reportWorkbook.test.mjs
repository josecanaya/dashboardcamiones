/**
 * Pruebas del escritor del Excel del informe.
 *
 * Lo que se protege acá es la política de relleno: que el mapeo de celdas sea el de
 * `vinculos.json`, que un histórico ya presentado no se recalcule, que un gráfico sin dato
 * se vacíe (para que no pase una cifra vieja por actual) y que un fallo se propague como
 * error en vez de escribir un informe a medias.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import XLSX from 'xlsx'
import {
  buildReportWorkbook,
  CHART_CATALOG,
  CHART_TEXT_MARKERS,
  FALTAN_DATOS,
  SIN_DATO,
  aplicarExclusiones,
  playaOsl,
  slCorregido,
  weekdayNameOf,
} from './reportWorkbook.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const TEMPLATE = path.join(ROOT, 'reportes', 'logistica', 'prueba_manual', 'Datos_MANUAL.xlsx')
const VINCULOS = path.join(ROOT, 'reportes', 'logistica', 'prueba_manual', 'vinculos.json')

const DAYS = [
  '2026-09-10',
  '2026-09-11',
  '2026-09-12',
  '2026-09-13',
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
]

/** Sección de actividad con `camiones` por calle, igual para todos los días. */
function activitySection(id, calles) {
  const porCalle = calles.map((camiones, i) => ({ camara: `Calle ${i + 1}`, camiones }))
  const porDia = {}
  for (const d of DAYS) porDia[d] = { camiones: calles.reduce((a, b) => a + b, 0), porCalle }
  return {
    id,
    label: id,
    table: `${id}_events`,
    dayRule: 'calendar',
    missing: false,
    rowsTotal: 100,
    rowsOutsidePeriod: 0,
    duplicateRowsDropped: 0,
    periodo: {
      camiones: calles.reduce((a, b) => a + b, 0),
      camaras: calles.length,
      picoCamiones: 10,
      picoLabel: '10/09 08h',
      promedioPorHora: 5,
      medianaPorHora: 5,
      horasConActividad: 20,
      porCalle,
    },
    porDia,
  }
}

function basePkg(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-09-23T12:00:00.000Z',
    periodo: {
      from: '2026-09-10',
      to: '2026-09-16',
      days: DAYS,
      dayCount: 7,
      atipico: false,
      label: '10/09 al 16/09/2026',
    },
    fuentes: {
      rulesVersion: 'etl_transform_v16',
      runIds: ['2026-09-07_2026-09-13'],
      composedRange: null,
      kpiTiemposBuilt: true,
      tablesUsed: [],
    },
    actividad: {
      calada_ricardone: activitySection('calada_ricardone', [10, 20, 30, 40, 50, 60]),
      calada_ricardone_liquidos: activitySection('calada_ricardone_liquidos', [5]),
      calada_san_lorenzo: activitySection('calada_san_lorenzo', [7]),
      volcable_ricardone: activitySection('volcable_ricardone', [11, 22]),
      silos_ricardone: activitySection('silos_ricardone', [3]),
      volcable_san_lorenzo: activitySection('volcable_san_lorenzo', [1, 2, 3, 4, 5]),
    },
    tiempos: {},
    ejecutivo: {
      recorridosEnPeriodo: 3000,
      porProducto: { SOJA: 2323, GIRASOL: 464, ACEITE: 146, PELLET: 211 },
      circuitosPorProducto: {
        SOJA: [{ code: 'R7', label: 'Terminal de embarque', count: 2323 }],
        GIRASOL: [
          { code: 'R5', label: 'Volcable 1', count: 349 },
          { code: 'R6', label: 'Volcable 2', count: 77 },
        ],
        ACEITE: [],
        PELLET: [],
      },
      circuitosTotales: [],
      missing: false,
    },
    controles: { sinDatos: false, pendientes: [], advertencias: [], politicaDia: {} },
    ...overrides,
  }
}

async function build(pkg) {
  return buildReportWorkbook({ templatePath: TEMPLATE, vinculosPath: VINCULOS, pkg })
}

function sheetOf(buffer, name) {
  return XLSX.read(buffer, { type: 'buffer' }).Sheets[name]
}

describe('mapeo de celdas', () => {
  it('escribe cada valor en la celda que dice vinculos.json', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D35_G1')
    const { buffer, detalle } = await build(basePkg())

    expect(detalle.graficos.completados.map((x) => x.id)).toContain('D35_G1')
    const ws = sheetOf(buffer, g.sheet)
    // D35_G1 = calada semanal por calle: Calle 1..6 → 10,20,30,40,50,60.
    const got = []
    for (let r = g.start; r <= g.end; r++) got.push(ws[`C${r}`]?.v)
    expect(got).toEqual([10, 20, 30, 40, 50, 60])
  })

  it('completa el período en las celdas de texto conectadas', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const t = vinculos.texts.find((x) => x.label === 'period.label')
    const { buffer } = await build(basePkg())
    expect(sheetOf(buffer, 'Textos')[t.cell]?.v).toBe('Período analizado: 10/09 al 16/09/2026')
  })

  it('deja vacíos los rótulos estáticos para que la plantilla conserve su texto', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    // «Objeto 125» es el bloque de contenido de la D4: un rótulo, no un indicador.
    const t = vinculos.texts.find((x) => x.label === 'Objeto 125')
    const { buffer, detalle } = await build(basePkg())
    expect(sheetOf(buffer, 'Textos')[t.cell]).toBeUndefined()
    // Cada objeto de texto cae en exactamente una categoría: conectado al período, sin dato,
    // tapado con «FALTAN DATOS» o rótulo fijo de la plantilla. Un número absoluto de
    // estáticos rompía el test cada vez que se etiquetaba un indicador nuevo; lo que importa
    // es que ningún texto quede sin clasificar y que los rótulos sigan existiendo.
    const t2 = detalle.textos
    expect(t2.conectados + t2.sinDato + t2.faltanDatos + t2.estaticos).toBe(vinculos.texts.length)
    expect(t2.estaticos).toBeGreaterThan(0)
  })
})

describe('cero válido frente a faltante', () => {
  it('publica el gráfico cuando una calle no operó (cero medido)', async () => {
    const pkg = basePkg()
    // La calle 5 no aparece en `porCalle`: no operó, vale 0.
    pkg.actividad.calada_ricardone.periodo.porCalle = [
      { camara: 'Calle 1', camiones: 10 },
      { camara: 'Calle 2', camiones: 20 },
      { camara: 'Calle 3', camiones: 30 },
      { camara: 'Calle 4', camiones: 40 },
      { camara: 'Calle 6', camiones: 60 },
    ]
    const { buffer, detalle } = await build(pkg)
    expect(detalle.graficos.completados.map((x) => x.id)).toContain('D35_G1')
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D35_G1')
    expect(sheetOf(buffer, g.sheet)[`C${g.start + 4}`]?.v).toBe(0)
  })

  it('declara pendiente (y vacía) cuando la sección entera falta', async () => {
    const pkg = basePkg()
    pkg.actividad.calada_ricardone.missing = true
    const { buffer, detalle } = await build(pkg)
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D35_G1')
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D35_G1')
    for (let r = g.start; r <= g.end; r++) {
      expect(sheetOf(buffer, g.sheet)[`C${r}`]).toBeUndefined()
    }
  })
})

describe('no dejar pasar cifras viejas por actuales', () => {
  it('vacía un gráfico del período que no se pudo calcular, aunque la plantilla traiga valores', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D50_G1')
    // La plantilla trae la calada líquida del informe de referencia.
    const template = XLSX.readFile(TEMPLATE)
    expect(template.Sheets[g.sheet][`C${g.start}`]?.v).toBeGreaterThan(0)

    // Sin esa sección de actividad el gráfico no se puede sostener.
    const pkg = basePkg()
    delete pkg.actividad.calada_ricardone_liquidos
    const { buffer, detalle } = await build(pkg)
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D50_G1')
    for (let r = g.start; r <= g.end; r++) {
      expect(sheetOf(buffer, g.sheet)[`C${r}`]).toBeUndefined()
    }
  })

  it('un gráfico retirado del informe se vacía, no conserva la plantilla', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D05_G1')
    // La plantilla trae la cobertura LPR del informe de referencia…
    const template = XLSX.readFile(TEMPLATE)
    expect(template.Sheets[g.sheet][`C${g.start}`]?.v).toBeGreaterThan(0)

    const { buffer, detalle } = await build(basePkg())
    // …y como el gráfico se retiró, esas cifras no pueden sobrevivir.
    expect(detalle.graficos.retirados.map((x) => x.id)).toContain('D05_G1')
    expect(detalle.graficos.retirados.map((x) => x.id)).toContain('D28_G1')
    for (let r = g.start; r <= g.end; r++) {
      expect(sheetOf(buffer, g.sheet)[`C${r}`]).toBeUndefined()
    }
  })

  it('conserva las series históricas ya presentadas sin recalcularlas', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D17_G1')
    const template = XLSX.readFile(TEMPLATE)
    const before = []
    for (let r = g.start; r <= g.end; r++) before.push(template.Sheets[g.sheet][`C${r}`]?.v)

    const { buffer, detalle } = await build(basePkg())
    expect(detalle.graficos.conservados.map((x) => x.id)).toContain('D17_G1')
    const ws = sheetOf(buffer, g.sheet)
    const after = []
    for (let r = g.start; r <= g.end; r++) after.push(ws[`C${r}`]?.v)
    expect(after).toEqual(before)
  })

  it('el catálogo marca como histórico exactamente las series ya presentadas', () => {
    const historical = Object.entries(CHART_CATALOG)
      .filter(([, v]) => v.policy === 'historical')
      .map(([k]) => k)
      .sort()
    expect(historical).toEqual(['D17_G1', 'D17_G2', 'D31_G1', 'D31_G2'])
  })
})

describe('período atípico', () => {
  it('deja pendientes los gráficos por día cuando el período no es jueves→miércoles', async () => {
    const pkg = basePkg()
    pkg.periodo = {
      from: '2026-09-10',
      to: '2026-09-12',
      days: ['2026-09-10', '2026-09-11', '2026-09-12'],
      dayCount: 3,
      atipico: true,
      label: '10/09 al 12/09/2026',
    }
    const { detalle } = await build(pkg)
    // Sin mapa de día, los gráficos rotulados por día no se pueden ubicar.
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D50_G1')
  })
})

describe('fallo de exportación', () => {
  it('propaga el error si falta la plantilla, sin escribir nada', async () => {
    await expect(
      buildReportWorkbook({
        templatePath: path.join(ROOT, 'no', 'existe.xlsx'),
        vinculosPath: VINCULOS,
        pkg: basePkg(),
      })
    ).rejects.toBeTruthy()
  })

  it('propaga el error si faltan los vínculos', async () => {
    await expect(
      buildReportWorkbook({
        templatePath: TEMPLATE,
        vinculosPath: path.join(ROOT, 'no', 'vinculos.json'),
        pkg: basePkg(),
      })
    ).rejects.toBeTruthy()
  })
})

describe('utilidades', () => {
  it('nombra los días como la plantilla', () => {
    expect(weekdayNameOf('2026-09-10')).toBe('Jueves')
    expect(weekdayNameOf('2026-09-16')).toBe('Miércoles')
  })
})

describe('distribución por circuito y tarjetas de producto', () => {
  it('lee el código del circuito del rótulo de la categoría', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D28_G2')
    const { buffer, detalle } = await build(basePkg())
    expect(detalle.graficos.completados.map((x) => x.id)).toContain('D28_G2')
    const ws = sheetOf(buffer, g.sheet)
    // Categorías: «R5 Volcable 1», «R6 Volcable 2», «R4 Silos Kepler».
    // R4 no operó en el período: cero medido, no faltante.
    expect(ws[`C${g.start}`]?.v).toBe(349)
    expect(ws[`C${g.start + 1}`]?.v).toBe(77)
    expect(ws[`C${g.start + 2}`]?.v).toBe(0)
  })

  it('completa las tarjetas de producto de la D3 con separador de miles', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const { buffer } = await build(basePkg())
    const ws = sheetOf(buffer, 'Textos')
    const cellOf = (label) => vinculos.texts.find((t) => t.label === label).cell
    expect(ws[cellOf('products.soja.count')]?.v).toBe('2.323')
    expect(ws[cellOf('products.girasol.count')]?.v).toBe('464')
    expect(ws[cellOf('products.liquidos.count')]?.v).toBe('146')
    expect(ws[cellOf('products.pellet.count')]?.v).toBe('211')
    expect(ws[cellOf('sample.total')]?.v).toBe('3.144')
    // El denominador se declara: son recorridos de cámara, no movimientos del Excel.
    expect(ws[cellOf('sample.unit')]?.v).toContain('recorridos de cámara')
  })

  it('sin sección ejecutiva deja el gráfico pendiente y el texto en s/d', async () => {
    const pkg = basePkg()
    pkg.ejecutivo.missing = true
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const { buffer, detalle } = await build(pkg)
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D28_G2')
    const cell = vinculos.texts.find((t) => t.label === 'products.soja.count').cell
    // s/d y NO la cifra del informe de referencia.
    expect(sheetOf(buffer, 'Textos')[cell]?.v).toBe('s/d')
  })

  it('la cobertura LPR quedó fuera del informe', () => {
    // Retirada por decisión del negocio: sin entrada en el catálogo, el escritor la vacía
    // en vez de conservar la plantilla.
    expect(CHART_CATALOG.D05_G1).toBeUndefined()
    expect(CHART_CATALOG.D28_G1).toBeUndefined()
    expect(CHART_TEXT_MARKERS.D05_G1).toBeUndefined()
  })
})

describe('semana en curso: el día que no ocurrió vale 0', () => {
  /** Período jueves→martes: seis días reales, sin miércoles. */
  function semanaEnCurso() {
    const days = DAYS.slice(0, 6)
    const pkg = basePkg()
    pkg.periodo = { ...pkg.periodo, days, dayCount: 6, to: days[days.length - 1], semanaEnCurso: true }
    for (const sec of Object.values(pkg.actividad)) {
      for (const d of Object.keys(sec.porDia)) if (!days.includes(d)) delete sec.porDia[d]
    }
    return pkg
  }

  it('publica el gráfico diario con la jornada faltante en 0, en vez de dejarlo pendiente', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D51_G1')
    const { buffer, detalle } = await build(semanaEnCurso())

    expect(detalle.graficos.pendientes.map((x) => x.id)).not.toContain('D51_G1')
    const hecho = detalle.graficos.completados.find((x) => x.id === 'D51_G1')
    expect(hecho.diasFueraDelPeriodoEnCero).toBe(1)

    // Ninguna celda queda vacía: la plantilla no puede reponer la cifra del informe anterior.
    const ws = sheetOf(buffer, g.sheet)
    const valores = []
    for (let r = g.start; r <= g.end; r++) {
      expect(ws[`C${r}`]).toBeDefined()
      valores.push(ws[`C${r}`].v)
    }
    expect(valores.filter((v) => v === 0)).toHaveLength(1)
  })

  it('un gráfico de un día entero fuera del período sale todo en 0', async () => {
    // D48_G1 es «calada por calle · Miércoles»: su jornada no ocurrió.
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D48_G1')
    const { buffer, detalle } = await build(semanaEnCurso())

    const hecho = detalle.graficos.completados.find((x) => x.id === 'D48_G1')
    expect(hecho.diasFueraDelPeriodoEnCero).toBe(g.end - g.start + 1)
    const ws = sheetOf(buffer, g.sheet)
    for (let r = g.start; r <= g.end; r++) expect(ws[`C${r}`].v).toBe(0)
  })

  it('un día DENTRO del período sin dato sigue invalidando el gráfico', async () => {
    // La distinción es el punto: 0 solo para la jornada inexistente, nunca para tapar un hueco.
    const pkg = semanaEnCurso()
    delete pkg.actividad.calada_san_lorenzo.porDia[DAYS[2]]
    const { detalle } = await build(pkg)
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D51_G1')
  })
})

describe('aviso visible cuando faltan datos', () => {
  it('sin bloques marcados no se emite ningún FALTAN DATOS', async () => {
    // El único bloque que usaba el aviso era la cobertura LPR, ya retirada. El mecanismo
    // sigue en pie (`CHART_TEXT_MARKERS`) para el próximo bloque que lo necesite, pero hoy
    // ninguna diapositiva debe salir con el cartel.
    const { detalle } = await build(basePkg())
    expect(detalle.textos.faltanDatos).toBe(0)
  })

  it('un bloque marcado tapa las cifras de la plantilla', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const cellOf = (label) => vinculos.texts.find((t) => t.label === label).cell
    const marcado = 'Objeto 147'

    CHART_TEXT_MARKERS.D15_G1 = [marcado]
    try {
      const pkg = basePkg()
      pkg.tiempos = {} // deja D15_G1 pendiente
      const { buffer, detalle } = await build(pkg)
      expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D15_G1')
      expect(sheetOf(buffer, 'Textos')[cellOf(marcado)]?.v).toBe(FALTAN_DATOS)
    } finally {
      delete CHART_TEXT_MARKERS.D15_G1
    }
  })
})

describe('tiempos por planta: suma de medias por tramo', () => {
  function tiemposSoja(over = {}) {
    const slice = {
      camiones: 100,
      tiempoMedioMin: 300,
      tiempoMedioN: 100,
      porCuarto: { Q1: 25, Q2: 25, Q3: 25, Q4: 25 },
      ricMediaMin: 144.6,
      ricTramos: 3,
      ricN: 1336,
      slMediaMin: 199,
      slTramos: 3,
      slN: 434,
      bridgeMediaMin: 12.4,
      bridgeN: 992,
      tramos: [],
    }
    const porDia = {}
    for (const d of DAYS) porDia[d] = slice
    return {
      label: 'Soja · R7',
      circuitCodes: ['R7'],
      plantsPublishable: true,
      doorToDoorPublishable: true,
      reasons: [],
      operaciones: 2514,
      recorridosCamara: 2104,
      periodo: slice,
      porDia,
      ...over,
    }
  }

  it('escribe la suma por planta en el gráfico de tiempos', async () => {
    const pkg = basePkg()
    pkg.tiempos = { soja: tiemposSoja() }
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D15_G1')
    const { buffer, detalle } = await build(pkg)
    expect(detalle.graficos.completados.map((x) => x.id)).toContain('D15_G1')
    const ws = sheetOf(buffer, g.sheet)
    // Filas alternadas Ricardone / San Lorenzo, en minutos enteros (144,6 → 145).
    expect(ws[`C${g.start}`]?.v).toBe(145)
    expect(ws[`C${g.start + 1}`]?.v).toBe(199)
  })

  it('un puerta a puerta inverosímil NO bloquea los tiempos por tramo', async () => {
    const pkg = basePkg()
    // Girasol real: patas sanas, puerta a puerta de 864 min.
    pkg.tiempos = { soja: tiemposSoja({ doorToDoorPublishable: false }) }
    const { detalle } = await build(pkg)
    // El gráfico por planta se publica…
    expect(detalle.graficos.completados.map((x) => x.id)).toContain('D15_G1')
    // …y el del tiempo medio diario queda pendiente, que es la métrica afectada.
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D16_G2')
  })

  it('sin muestra en ningún tramo el gráfico por planta queda pendiente', async () => {
    const pkg = basePkg()
    pkg.tiempos = { soja: tiemposSoja({ plantsPublishable: false }) }
    const { detalle } = await build(pkg)
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D15_G1')
  })
})

describe('KPI de actividad conectados al período', () => {
  it('escribe pico, ventana, total y promedio desde la sección del paquete', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const cellOf = (label) => vinculos.texts.find((t) => t.label === label).cell
    const { buffer } = await build(basePkg())
    const ws = sheetOf(buffer, 'Textos')

    // La sección de prueba: 6 calles de 10..60 = 210 camiones, pico 10, 12 horas activas.
    expect(ws[cellOf('kpi.calada_ricardone.total')]?.v).toBe(210)
    expect(ws[cellOf('kpi.calada_ricardone.pico')]?.v).toBe(10)
    expect(ws[cellOf('kpi.calada_ricardone.ventana')]?.v).toBe('10/09 08h')
    // Solo la cifra, alineada con los otros tres recuadros: el denominador (horas con
    // actividad) lo dice el rótulo «Promedio x hora activa».
    expect(String(ws[cellOf('kpi.calada_ricardone.promedio')]?.v)).toBe('5')
  })

  it('el promedio diario del puerto divide por los días del período', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const cellOf = (label) => vinculos.texts.find((t) => t.label === label).cell
    const { buffer } = await build(basePkg()) // 5 volcables de 1..5 = 15 camiones / 7 días
    expect(sheetOf(buffer, 'Textos')[cellOf('kpi.volcable_san_lorenzo.promedio_diario')]?.v).toBe(2)
  })

  it('sin la sección, el KPI sale s/d y no la cifra de la plantilla', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const cellOf = (label) => vinculos.texts.find((t) => t.label === label).cell
    const pkg = basePkg()
    delete pkg.actividad.silos_ricardone
    const { buffer } = await build(pkg)
    const ws = sheetOf(buffer, 'Textos')
    expect(ws[cellOf('kpi.silos_ricardone.total')]?.v).toBe(SIN_DATO)
    expect(ws[cellOf('kpi.silos_ricardone.pico')]?.v).toBe(SIN_DATO)
  })
})

describe('día a día de soja conectado al período', () => {
  const cellOf = async (label) => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    return vinculos.texts.find((t) => t.label === label)?.cell
  }

  /** Paquete con un jueves real: 10/09 es el primer día del período de prueba. */
  function conJueves() {
    const pkg = basePkg()
    pkg.tiempos = {
      soja: {
        porDia: {
          '2026-09-10': {
            camiones: 376,
            tiempoMedioMin: 372.3,
            porCuarto: { Q1: 131, Q2: 91, Q3: 92, Q4: 62 },
            ricMediaMin: 138.8,
            slMediaMin: 192.0,
            tramos: [
              { key: 'INGRESO→PREINGRESO', mediaMin: 3.9, n: 264 },
              { key: 'PREINGRESO→CALADA', mediaMin: 123.2, n: 269 },
            ],
          },
        },
      },
    }
    return pkg
  }

  it('escribe título, fecha, totales y tramos del día que corresponde', async () => {
    const { buffer } = await build(conJueves())
    const ws = sheetOf(buffer, 'Textos')
    expect(ws[await cellOf('dia.Jueves.titulo')]?.v).toBe('Circuito R7 | Jueves 10/09')
    expect(ws[await cellOf('dia.Jueves.fecha')]?.v).toBe('10/09')
    expect(ws[await cellOf('dia.Jueves.camiones')]?.v).toBe(376)
    expect(ws[await cellOf('dia.Jueves.total_min')]?.v).toBe('372 Min')
    expect(ws[await cellOf('dia.Jueves.total_hs')]?.v).toBe('(6 hs 12 m)')
    expect(ws[await cellOf('dia.Jueves.ricardone_min')]?.v).toBe('139 min')
    expect(ws[await cellOf('dia.Jueves.san_lorenzo_min')]?.v).toBe('192 min')
    expect(ws[await cellOf('dia.Jueves.cuarto.Q1')]?.v).toBe('131 camiones')
  })

  it('los tramos se ubican por su posición en el diagrama, no por el texto', async () => {
    const { buffer } = await build(conJueves())
    const ws = sheetOf(buffer, 'Textos')
    // Primero y segundo tramo del R7, en el orden que dibuja la plantilla.
    expect(ws[await cellOf('dia.Jueves.tramo.1')]?.v).toBe(4)
    expect(ws[await cellOf('dia.Jueves.tramo.2')]?.v).toBe(123)
    // El tramo sin muestra sale s/d, nunca con la cifra de la plantilla.
    expect(ws[await cellOf('dia.Jueves.tramo.5')]?.v).toBe(SIN_DATO)
  })

  it('un día fuera del período sale entero en s/d', async () => {
    const pkg = conJueves()
    pkg.periodo = { ...pkg.periodo, days: DAYS.slice(0, 6), dayCount: 6, semanaEnCurso: true }
    const { buffer } = await build(pkg)
    const ws = sheetOf(buffer, 'Textos')
    for (const campo of ['titulo', 'fecha', 'camiones', 'total_min', 'cuarto.Q1', 'tramo.1']) {
      expect(ws[await cellOf(`dia.Miércoles.${campo}`)]?.v).toBe(SIN_DATO)
    }
  })
})

describe('gráfico parcial (D25_G1, tiempos de pellet)', () => {
  function pelletSinSanLorenzo(conRicardone = true) {
    const pkg = basePkg()
    const dia = (ric) => ({ camiones: 5, ricMediaMin: ric, ricN: ric ? 3 : 0, slMediaMin: null, slN: 0 })
    pkg.tiempos = {
      pellet: {
        plantsPublishable: true,
        porDia: {
          '2026-09-14': dia(conRicardone ? 114 : null),
          '2026-09-15': dia(conRicardone ? 30 : null),
        },
      },
    }
    return pkg
  }

  it('publica Ricardone y deja vacía la planta sin muestra, en vez de dejarlo pendiente', async () => {
    const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
    const g = vinculos.charts.find((c) => c.id === 'D25_G1')
    const { buffer, detalle } = await build(pelletSinSanLorenzo())

    expect(detalle.graficos.pendientes.map((x) => x.id)).not.toContain('D25_G1')
    const hecho = detalle.graficos.completados.find((x) => x.id === 'D25_G1')
    expect(hecho.celdasSinMedicion).toBe(2)

    const ws = sheetOf(buffer, g.sheet)
    const porFila = {}
    for (let r = g.start; r <= g.end; r++) porFila[`${ws[`A${r}`].v}|${ws[`B${r}`].v}`] = ws[`C${r}`]?.v
    expect(porFila['Lunes|Ricardone']).toBe(114)
    expect(porFila['Martes|Ricardone']).toBe(30)
    // Vacío, no 0: «no se midió» no es «cero minutos».
    expect(porFila['Lunes|San Lorenzo']).toBeUndefined()
  })

  it('sin ningún valor real sigue siendo pendiente', async () => {
    const { detalle } = await build(pelletSinSanLorenzo(false))
    expect(detalle.graficos.pendientes.map((x) => x.id)).toContain('D25_G1')
  })
})

describe('espera en playa San Lorenzo deducida (cámara de ingreso SL caída)', () => {
  const tramo = (key, planta, mediaMin, n) => ({ key, planta, mediaMin, n })
  /** Un día como el 22/09: total 261, Playa OSL sin muestra, el resto medido. */
  function dia(osl = { mediaMin: 0, n: 0 }) {
    return {
      tiempoMedioMin: 261,
      slMediaMin: 53,
      tramos: [
        tramo('INGRESO→PREINGRESO', 'RICARDONE', 3, 20),
        tramo('PREINGRESO→CALADA', 'RICARDONE', 61, 20),
        tramo('CALADA→EGRESO', 'RICARDONE', 11, 20),
        tramo('EGRESO→SL_INGRESO', 'INTERPLANTA', 16, 18),
        tramo('SL_INGRESO→SL_BALANZA_INGRESO', 'SAN_LORENZO', osl.mediaMin, osl.n),
        tramo('SL_BALANZA_INGRESO→SL_VOLCABLE', 'SAN_LORENZO', 36, 19),
        tramo('SL_VOLCABLE→SL_EGRESO', 'SAN_LORENZO', 17, 15),
      ],
    }
  }

  it('sin muestra, se deduce como total menos el resto de los tramos', () => {
    const v = playaOsl(dia())
    expect(v.estimado).toBe(true)
    expect(Math.round(v.min)).toBe(261 - (3 + 61 + 11 + 16 + 36 + 17))
  })

  it('con la cámara andando se usa lo medido', () => {
    expect(playaOsl(dia({ mediaMin: 131, n: 18 }))).toEqual({ min: 131, estimado: false })
  })

  it('con muy pocas mediciones frente al tramo siguiente, se deduce (cobertura parcial)', () => {
    // 3 camiones medidos contra 19 del tramo siguiente: la media no representa el día.
    expect(playaOsl(dia({ mediaMin: 131, n: 3 })).estimado).toBe(true)
  })

  it('si falta otro tramo no se deduce: la resta sería falsa', () => {
    const d = dia()
    d.tramos[1].n = 0
    expect(playaOsl(d)).toBeNull()
  })

  it('San Lorenzo corregido suma la espera deducida a sus otros tramos', () => {
    const v = slCorregido(dia())
    expect(v.estimado).toBe(true)
    expect(Math.round(v.min)).toBe(Math.round(playaOsl(dia()).min) + 36 + 17)
  })

  it('sin deducción posible, San Lorenzo queda como lo trae el paquete', () => {
    expect(slCorregido(dia({ mediaMin: 131, n: 18 }))).toEqual({ min: 53, estimado: false })
  })
})

describe('exclusión de días no confiables', () => {
  const dia = (tiempoMedioMin, tiempoMedioN, camiones) => ({
    camiones,
    tiempoMedioMin,
    tiempoMedioN,
    porCuarto: { Q1: camiones },
    tramos: [{ key: 'INGRESO→PREINGRESO', planta: 'RICARDONE', mediaMin: tiempoMedioMin / 10, n: tiempoMedioN }],
  })
  function pkgGirasol() {
    const porDia = { '2026-09-22': dia(300, 30, 40), '2026-09-23': dia(1136, 27, 30) }
    return { tiempos: { girasol: { porDia, periodo: { tramos: [{ key: 'INGRESO→PREINGRESO', planta: 'RICARDONE' }] } } } }
  }

  it('saca el día y recalcula la semana ponderando por muestra', () => {
    const r = aplicarExclusiones(pkgGirasol(), [{ producto: 'girasol', dia: '2026-09-23', motivo: 'cámaras' }])
    const g = r.tiempos.girasol
    expect(Object.keys(g.porDia)).toEqual(['2026-09-22'])
    expect(g.periodo.tiempoMedioMin).toBe(300)
    expect(g.periodo.tiempoMedioN).toBe(30)
    expect(g.periodo.camiones).toBe(40)
    // Queda declarado en el control, no escondido.
    expect(r.controles.exclusiones).toHaveLength(1)
  })

  it('sin exclusiones reproduce la semana ponderada exacta', () => {
    const r = aplicarExclusiones(pkgGirasol(), [{ producto: 'girasol', dia: '2099-01-01', motivo: 'control' }])
    expect(r.tiempos.girasol.periodo.tiempoMedioMin).toBeCloseTo((300 * 30 + 1136 * 27) / 57, 6)
  })

  it('no toca el paquete original', () => {
    const pkg = pkgGirasol()
    aplicarExclusiones(pkg, [{ producto: 'girasol', dia: '2026-09-23', motivo: 'cámaras' }])
    expect(Object.keys(pkg.tiempos.girasol.porDia)).toHaveLength(2)
  })
})
