/**
 * Diseño del informe de logística en Google Slides: lo que el sync aplica en cada corrida
 * además de los valores, para que las correcciones de formato del comité no se pierdan.
 *
 * ## Por qué vive en código y no «a mano» en la presentación
 *
 * El sync reescribe los textos conectados y reaplica el estilo de la plantilla
 * (`estilos_textos.json`): cualquier ajuste manual sobre esos textos se pierde en la corrida
 * siguiente. Todo lo que sigue es idempotente: correrlo dos veces deja lo mismo.
 *
 * ## Qué hace (pedidos del comité, 25/09/2026)
 *
 * - Curvas de actividad por hora (37–51, 54, 56, 60–72): todas de área, con el máximo en rojo.
 * - Gráficos de línea (16, 17, 31): etiqueta de datos en cada punto.
 * - Lámina 2: colores por sección. Lámina 3: cada dato en su recuadro. Lámina 20: tipografía
 *   y alineación. Lámina 34: jerarquía de la tabla. Recuadro «Promedio x hora»: alineado.
 *
 * Los gráficos de BARRAS son gráficos vinculados de Sheets y su formato (borde, opacidad de
 * la serie) se ajusta a mano desde la interfaz de Sheets: este módulo nunca los toca.
 */
export const FUENTE = 'Inter'
export const AZUL = '06245F'
export const GRIS = '6B7280'

// —— Primitivas de pedidos de Slides ————————————————————————————————————

export const rgb = (hex) => {
  const n = parseInt(hex, 16)
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 }
}
export const emu = (v) => ({ magnitude: Math.round(v), unit: 'EMU' })
export const colocar = (pagina, x, y, w, h) => ({
  pageObjectId: pagina,
  size: { width: emu(Math.max(1, w)), height: emu(Math.max(1, h)) },
  transform: { scaleX: 1, scaleY: 1, translateX: Math.round(x), translateY: Math.round(y), unit: 'EMU' },
})

export function estiloTexto(objectId, { size, bold = false, color = AZUL, italic = false }, rango = { type: 'ALL' }) {
  return {
    updateTextStyle: {
      objectId,
      textRange: rango,
      style: {
        fontFamily: FUENTE,
        fontSize: { magnitude: size, unit: 'PT' },
        bold,
        italic,
        foregroundColor: { opaqueColor: { rgbColor: rgb(color) } },
      },
      fields: 'fontFamily,fontSize,bold,italic,foregroundColor',
    },
  }
}

export function alinear(objectId, alignment) {
  return {
    updateParagraphStyle: {
      objectId,
      textRange: { type: 'ALL' },
      style: { alignment, spaceAbove: { magnitude: 0, unit: 'PT' }, spaceBelow: { magnitude: 0, unit: 'PT' } },
      fields: 'alignment,spaceAbove,spaceBelow',
    },
  }
}

/** Cuadro de texto nuevo, sin relleno ni borde, centrado en vertical. */
export function cuadroTexto(id, pagina, { x, y, w, h }, texto, estilo, alineacion = 'CENTER') {
  return [
    { createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: colocar(pagina, x, y, w, h) } },
    { insertText: { objectId: id, text: texto, insertionIndex: 0 } },
    estiloTexto(id, estilo),
    alinear(id, alineacion),
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: { contentAlignment: 'MIDDLE', autofit: { autofitType: 'NONE' } },
        fields: 'contentAlignment,autofit.autofitType',
      },
    },
  ]
}

export function rellenoYBorde(objectId, { relleno, alfa = 1, borde, grosor }) {
  const shapeProperties = {}
  const fields = []
  if (relleno === null) {
    shapeProperties.shapeBackgroundFill = { propertyState: 'NOT_RENDERED' }
    fields.push('shapeBackgroundFill.propertyState')
  } else if (relleno) {
    shapeProperties.shapeBackgroundFill = { solidFill: { color: { rgbColor: rgb(relleno) }, alpha: alfa } }
    fields.push('shapeBackgroundFill.solidFill.color', 'shapeBackgroundFill.solidFill.alpha')
  }
  if (borde === null) {
    shapeProperties.outline = { propertyState: 'NOT_RENDERED' }
    fields.push('outline.propertyState')
  } else if (borde) {
    shapeProperties.outline = {
      outlineFill: { solidFill: { color: { rgbColor: rgb(borde) } } },
      weight: { magnitude: grosor, unit: 'PT' },
      dashStyle: 'SOLID',
    }
    fields.push('outline.outlineFill.solidFill.color', 'outline.weight', 'outline.dashStyle')
  }
  return { updateShapeProperties: { objectId, shapeProperties, fields: fields.join(',') } }
}

export function rectangulo(id, pagina, caja, estilo, forma = 'RECTANGLE') {
  return [
    { createShape: { objectId: id, shapeType: forma, elementProperties: colocar(pagina, caja.x, caja.y, caja.w, caja.h) } },
    rellenoYBorde(id, estilo),
  ]
}

export function linea(id, pagina, x1, y1, x2, y2, color, grosor) {
  return [
    {
      createLine: {
        objectId: id,
        lineCategory: 'STRAIGHT',
        elementProperties: colocar(pagina, Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)),
      },
    },
    {
      updateLineProperties: {
        objectId: id,
        lineProperties: { lineFill: { solidFill: { color: { rgbColor: rgb(color) } } }, weight: { magnitude: grosor, unit: 'PT' } },
        fields: 'lineFill.solidFill.color,weight',
      },
    },
  ]
}

/** Tinte de un color hacia el blanco (0 = el color, 1 = blanco). */
export function tinte(hex, t) {
  const n = parseInt(hex, 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t))
  return c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}

// —— Gráficos de la hoja ————————————————————————————————————————————————

/** Rojo del punto máximo de cada curva horaria. */
export const ROJO_MAXIMO = 'D32F2F'

/** Tamaño mínimo de las etiquetas de datos (pedido del comité: «que se lean», 11–12 pt). */
export const ETIQUETA_PT = 12
/** Gráficos de línea con varias series muy juntas (históricos): 11 pt para no encimarlas. */
const ETIQUETA_LINEA_PT = 11
/** Gráficos con etiquetas más grandes que el mínimo (pedido del comité). */
const ETIQUETA_POR_GRAFICO = { 'Descargas diarias por equipo': 14, 'Descargas semanales por equipo': 14 }

/** Techo del eje con aire sobre el máximo, para que la etiqueta del pico nunca quede cortada. */
export function techoEje(maximo) {
  const m = maximo * 1.2
  if (m <= 10) return Math.ceil(m) + 1
  if (m <= 50) return Math.ceil(m / 5) * 5
  return Math.ceil(m / 10) * 10
}

const etiqueta = (pt, color, placement) => ({
  type: 'DATA',
  ...(placement ? { placement } : {}),
  textFormat: { fontSize: pt, bold: true, ...(color ? { foregroundColorStyle: { rgbColor: color } } : {}) },
})

/**
 * Estilo de los gráficos de la hoja. Idempotente: solo manda `updateChartSpec` cuando algo de
 * lo que controla (tipo, etiquetas, eje) difiere de lo que ya tiene el gráfico.
 *
 * - Curvas por hora («Graficos horarios», láminas 37–51, 54, 56, 60–72): combinado ÁREA + serie
 *   «Máximo» (columna C, con valor solo en la primera hora pico), que se ve como un punto rojo
 *   con su cifra. `styleOverrides` no sirve: Sheets lo guarda pero no lo dibuja en áreas. El
 *   techo del eje se recalcula cada semana (`maximos`) para que la cifra del pico siempre se vea.
 * - Distribución por circuito (5, 28): etiqueta de datos en cada barra.
 * - Líneas de la pestaña de pivote (16, 17, 31): etiqueta en cada punto.
 * - Todas las etiquetas de datos: mínimo 12 pt (11 en los históricos de línea).
 *
 * Los gráficos de barras solo se tocan si una etiqueta quedó por debajo del mínimo: una vez
 * corregida, el sync no vuelve a mandarles `updateChartSpec` y se conserva el formato que se
 * les da a mano en Sheets (borde, opacidad de la serie), que la API no expone y un
 * `updateChartSpec` borraría.
 *
 * @param maximos `{ título del gráfico horario: valor máximo de su curva }`
 */
export async function estiloGraficosHoja({ tool, hoja, maximos = {} }) {
  const { charts } = await tool('google_sheets_get_charts', { spreadsheet: hoja })
  const requests = []
  const huella = (spec) =>
    JSON.stringify({
      t: spec.basicChart?.chartType,
      s: (spec.basicChart?.series ?? []).map((x) => [x.type ?? null, x.dataLabel?.type ?? null, x.dataLabel?.textFormat?.fontSize ?? null]),
      a: (spec.basicChart?.axis ?? []).find((x) => x.position === 'LEFT_AXIS')?.viewWindowOptions?.viewWindowMax ?? null,
    })
  for (const c of charts) {
    const b = c.spec?.basicChart
    if (!b) continue
    const spec = structuredClone(c.spec)
    const bc = spec.basicChart
    if (c.sheetTitle === 'Graficos horarios') {
      const curva = bc.series[0]
      const rojo = { rgbColor: rgb(ROJO_MAXIMO) }
      if (!(bc.chartType === 'COMBO' && bc.series.length === 2)) {
        const { styleOverrides, pointStyle, type, ...resto } = curva
        const fuente = curva.series.sourceRange.sources[0]
        bc.chartType = 'COMBO'
        bc.series = [
          { ...resto, type: 'AREA', lineStyle: { width: 2, type: 'SOLID' } },
          {
            series: {
              sourceRange: {
                sources: [{ ...fuente, startColumnIndex: fuente.startColumnIndex + 1, endColumnIndex: fuente.endColumnIndex + 1 }],
              },
            },
            targetAxis: curva.targetAxis ?? 'LEFT_AXIS',
            type: 'LINE',
            colorStyle: rojo,
            pointStyle: { shape: 'CIRCLE', size: 10 },
          },
        ]
      }
      bc.series[1].dataLabel = etiqueta(ETIQUETA_PT, rojo.rgbColor, 'ABOVE')
      const max = maximos[spec.title]
      if (typeof max === 'number' && max > 0) {
        const techo = techoEje(max)
        bc.axis = bc.axis ?? []
        let eje = bc.axis.find((x) => x.position === 'LEFT_AXIS')
        if (!eje) bc.axis.push((eje = { position: 'LEFT_AXIS' }))
        eje.viewWindowOptions = { viewWindowMode: 'EXPLICIT', viewWindowMin: 0, viewWindowMax: techo }
      }
    } else if (c.sheetTitle === 'Graficos circuitos') {
      bc.series = bc.series.map((x) => ({ ...x, dataLabel: etiqueta(ETIQUETA_PT, rgb('202020'), 'OUTSIDE_END') }))
    } else if (spec.title === 'Histórico por tramo') {
      // Solo el máximo histórico de cada tramo lleva cifra (si no, se cruzan): lo arma el sync.
      continue
    } else if (c.sheetTitle === 'Graficos pivote' && b.chartType === 'LINE') {
      bc.series = bc.series.map((x) => ({
        ...x,
        pointStyle: x.pointStyle ?? { shape: 'CIRCLE', size: 5 },
        dataLabel: etiqueta(ETIQUETA_LINEA_PT, x.colorStyle?.rgbColor ?? x.color ?? rgb('202020'), 'ABOVE'),
      }))
    } else {
      // Barras y demás: solo agrandar etiquetas que quedaron chicas.
      const pt = ETIQUETA_POR_GRAFICO[spec.title] ?? ETIQUETA_PT
      bc.series = (bc.series ?? []).map((x) =>
        x.dataLabel?.type === 'DATA' && (x.dataLabel.textFormat?.fontSize ?? 10) < pt
          ? { ...x, dataLabel: { ...x.dataLabel, textFormat: { ...(x.dataLabel.textFormat ?? {}), fontSize: pt, bold: true } } }
          : x,
      )
    }
    if (huella(spec) !== huella(c.spec)) requests.push({ updateChartSpec: { chartId: c.chartId, spec } })
  }
  for (let i = 0; i < requests.length; i += 20) {
    await tool('google_sheets_batch_update', { spreadsheet: hoja, requests: requests.slice(i, i + 20) })
  }
  return { actualizados: requests.length }
}

/** Índice de la primera fila con el valor máximo (el primero si hay empate), o undefined. */
export function indiceDelMaximo(valores) {
  let idx
  valores.forEach((v, i) => {
    if (typeof v === 'number' && v > 0 && (idx === undefined || v > valores[idx])) idx = i
  })
  return idx
}

// —— Diseño de láminas puntuales ————————————————————————————————————————

/** Colores por sección del índice (lámina 2), los mismos de cada producto en la lámina 3. */
const SECCIONES_INDICE = ['06245F', '38761D', '356CB3', 'A78619', '00796B', '1565C0']

/** Portadas de sección con guía de páginas: qué láminas cubre cada una y dónde va la guía. */
const GUIAS = [
  // Soja: la lista vivía en p4_i125; queda solo su encabezado.
  { portada: 4, desde: 5, hasta: 18, lista: 'p4_i125', encabezado: '\nContenido del análisis', color: '38761D', x: 2790000, y: 2580000, alto: 255000, ancho: 2700000, letra: 11 },
  { portada: 19, desde: 20, hasta: 26, lista: 'p19_i740', encabezado: null, color: 'A78619', x: 3050000, y: 2950000, alto: 255000, ancho: 2650000, letra: 10.5 },
  { portada: 27, desde: 28, hasta: 32, lista: 'p27_i1080', encabezado: null, color: 'A78619', x: 2900000, y: 2950000, alto: 255000, ancho: 2550000, letra: 10.5 },
  { portada: 33, desde: 34, hasta: 51, lista: null, encabezado: null, color: '00796B', x: 2850000, y: 2650000, alto: 255000, ancho: 2750000, letra: 10.5 },
  { portada: 52, desde: 53, hasta: 72, lista: null, encabezado: null, color: '1565C0', x: 2900000, y: 2650000, alto: 255000, ancho: 3300000, letra: 11 },
]

const DIAS_TITULO = /\|\s*(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)\b/

/**
 * Filas de la guía de una sección: láminas consecutivas con el mismo título se agrupan
 * («Comparativo semanal e histórico · Pág. 15–17») y las diarias van juntas como «Evolución
 * diaria del operativo». Las láminas ocultas (días fuera del período) no cuentan.
 */
export function guiaDePaginas(pres, desde, hasta, ocultas = new Set()) {
  const filas = []
  for (let n = desde; n <= hasta; n++) {
    if (ocultas.has(n)) continue
    const s = pres.slides[n - 1]
    const t = (s?.elements ?? []).find((e) => e.type === 'text' && e.box && e.box.y < 600000 && String(e.text ?? '').trim())
    if (!t) continue
    let titulo = String(t.text).split('\n')[0].trim()
    if (DIAS_TITULO.test(titulo)) titulo = 'Evolución diaria del operativo'
    else {
      titulo = titulo
        .replace(/\s*\|\s*Producto\s*:.*$/i, '')
        .replace(/\/\s*$/, '')
        // «Circuito R5 y R6» y «Circuito R5+R6» son la misma sección.
        .replace(/(R\d+)\s+y\s+(R\d+)/g, '$1+$2')
        .trim()
    }
    if (/^Circuitos$/i.test(titulo)) titulo = 'Distribución por circuito'
    const ultima = filas[filas.length - 1]
    if (ultima && ultima.titulo === titulo) ultima.hasta = n
    else filas.push({ titulo, desde: n, hasta: n })
  }
  return filas.map((f) => ({ titulo: f.titulo, paginas: f.desde === f.hasta ? `Pág. ${f.desde}` : `Pág. ${f.desde}–${f.hasta}` }))
}

const PRODUCTOS_L3 = [
  { label: 'p3_i20011', valor: 'p3_i20012', color: '38761D' },
  { label: 'p3_i20013', valor: 'p3_i20014', color: 'A78619' },
  { label: 'p3_i20015', valor: 'p3_i20016', color: 'B86415' },
  { label: 'p3_i20017', valor: 'p3_i20018', color: '356CB3' },
]

/**
 * Formato de las láminas 2, 3, 20 y 34 y de los recuadros de «Promedio x hora».
 *
 * Solo toca objetos por su id fijo (`p<lámina>_i<objeto>` de la plantilla) o crea objetos
 * con prefijo `dz` que no existían; si ya existen, no los duplica. Los textos CONECTADOS de
 * estas láminas toman su estilo de `estilos_textos.json`, que se actualizó junto con esto.
 */
export async function disenoLaminas({ tool, presentacion, hoja, vinculos, ocultas = new Set() }) {
  const pres = await tool('google_slides_get_presentation', { presentation: presentacion })
  const existe = new Set(pres.slides.flatMap((s) => (s.elements ?? []).map((e) => e.objectId)))
  const caja = new Map(pres.slides.flatMap((s) => (s.elements ?? []).map((e) => [e.objectId, e.box])))
  const pagina = (n) => pres.slides[n - 1]?.objectId
  const r = []
  const crear = (id, pedidos) => {
    if (!existe.has(id)) r.push(...pedidos)
  }

  // Lámina 2 — índice: cada sección con su color (número lleno, fila en tinte, página en color).
  SECCIONES_INDICE.forEach((color, i) => {
    const num = `p2_i${20002 + 3 * i}`
    const tit = `p2_i${20003 + 3 * i}`
    const pag = `p2_i${20004 + 3 * i}`
    if (!existe.has(num)) return
    r.push(
      rellenoYBorde(num, { relleno: color, borde: null }),
      estiloTexto(num, { size: 15, bold: true, color: 'FFFFFF' }),
      rellenoYBorde(tit, { relleno: tinte(color, 0.9), borde: null }),
      estiloTexto(tit, { size: 13.5, bold: true, color: AZUL }),
      rellenoYBorde(pag, { relleno: tinte(color, 0.9), borde: null }),
      estiloTexto(pag, { size: 11.5, bold: true, color }),
    )
  })

  // Lámina 3 — cada dato en su recuadro: los cuatro de arriba con el mismo alto, fondo azul
  // suave y el dato centrado (rótulo chico en gris arriba, cifra grande debajo).
  if (pagina(3)) {
    const marco = { relleno: 'EEF3FB', borde: '8FA8D6', grosor: 1 }
    const alto = 1047750
    const marcos = [
      ['dz3_inicio', { x: 628650, y: 1400175, w: 1143000, h: alto }, ['p3_i20002', 'p3_i20003']],
      ['dz3_fin', { x: 1866900, y: 1400175, w: 1143000, h: alto }, ['p3_i20004', 'p3_i20005']],
      ['dz3_dias', { x: 3105150, y: 1400175, w: 1143000, h: alto }, ['p3_i20006', 'p3_i20007']],
      ['dz3_volumen', { x: 5010150, y: 1400175, w: 3771900, h: alto }, ['p3_i20009', 'p3_i20010']],
    ]
    // Se rehacen en cada corrida (ids fijos): así un cambio de tamaño o de estilo se aplica.
    for (const [id, c] of marcos) {
      if (existe.has(id)) r.push({ deleteObject: { objectId: id } })
      r.push(...rectangulo(id, pagina(3), c, marco, 'ROUND_RECTANGLE'))
    }
    for (const [, c, ids] of marcos) {
      const cajas = ids.map((id) => caja.get(id)).filter(Boolean)
      if (cajas.length !== ids.length) continue
      const arriba = Math.min(...cajas.map((b) => b.y))
      const abajo = Math.max(...cajas.map((b) => b.y + b.height))
      const dy = c.y + c.h / 2 - (arriba + abajo) / 2
      ids.forEach((id, k) => {
        const b = cajas[k]
        const dx = c.x + c.w / 2 - (b.x + b.width / 2)
        if (Math.abs(dx) > 5000 || Math.abs(dy) > 5000) {
          r.push({
            updatePageElementTransform: {
              objectId: id,
              applyMode: 'RELATIVE',
              transform: { scaleX: 1, scaleY: 1, translateX: dx, translateY: dy, unit: 'EMU' },
            },
          })
        }
      })
    }
    PRODUCTOS_L3.forEach(({ label, valor, color }, i) => {
      const b = caja.get(label)
      if (!b) return
      const id = `dz3_prod${i}`
      crear(id, rectangulo(id, pagina(3), { x: b.x, y: b.y, w: b.width, h: 1076325 }, { relleno: tinte(color, 0.9), borde: color, grosor: 1.75 }, 'ROUND_RECTANGLE'))
      r.push(rellenoYBorde(label, { relleno: null, borde: null }), rellenoYBorde(valor, { relleno: null, borde: null }))
    })
    const alFondo = [...marcos.map(([id]) => id), ...PRODUCTOS_L3.map((_, i) => `dz3_prod${i}`).filter((id) => !existe.has(id))]
    r.push({ updatePageElementsZOrder: { pageElementObjectIds: alFondo, operation: 'SEND_TO_BACK' } })
  }

  // Láminas 4 y 19 — portada de sección: guía de páginas (como el índice de la lámina 2),
  // armada desde los títulos reales de la presentación. Antes era una lista fija que nombraba
  // secciones que ya no existen («Calidad de lectura de cámaras»).
  for (const g of GUIAS) {
    const slide = pres.slides[g.portada - 1]
    if (!slide) continue
    for (const e of slide.elements ?? []) if (e.objectId.startsWith(`dz${g.portada}_g`)) r.push({ deleteObject: { objectId: e.objectId } })
    const lista = g.lista ? (slide.elements ?? []).find((e) => e.objectId === g.lista) : null
    // Sin encabezado la caja de la lista vieja sobra: vacía deja una viñeta suelta.
    if (lista && !g.encabezado) r.push({ deleteObject: { objectId: g.lista } })
    else if (lista) {
      // deleteText sobre una caja vacía es un error de la API.
      if (String(lista.text ?? '').length) r.push({ deleteText: { objectId: g.lista, textRange: { type: 'ALL' } } })
      if (g.encabezado) {
        r.push(
          { insertText: { objectId: g.lista, text: g.encabezado, insertionIndex: 0 } },
          estiloTexto(g.lista, { size: 16, bold: true, color: '202020' }),
        )
      }
    }
    const filas = guiaDePaginas(pres, g.desde, g.hasta, ocultas)
    filas.forEach((f, i) => {
      const y = g.y + i * (g.alto + 45000)
      const P = `dz${g.portada}_g${i}`
      r.push(
        ...cuadroTexto(`${P}n`, slide.objectId, { x: g.x, y, w: g.alto, h: g.alto }, String(i + 1), { size: 11, bold: true, color: 'FFFFFF' }),
        rellenoYBorde(`${P}n`, { relleno: g.color, borde: null }),
        ...cuadroTexto(`${P}t`, slide.objectId, { x: g.x + g.alto + 40000, y, w: g.ancho, h: g.alto }, f.titulo, { size: g.letra, bold: true, color: AZUL }, 'START'),
        rellenoYBorde(`${P}t`, { relleno: tinte(g.color, 0.88), borde: null }),
        ...cuadroTexto(`${P}p`, slide.objectId, { x: g.x + g.alto + 40000 + g.ancho, y, w: 950000, h: g.alto }, f.paginas, { size: 9.5, bold: true, color: g.color }, 'END'),
        rellenoYBorde(`${P}p`, { relleno: tinte(g.color, 0.88), borde: null }),
      )
    })
  }

  // Lámina 53 — los dos gráficos de volcables 1/2 eran chicos: diario a la izquierda y semanal
  // a la derecha, ocupando la lámina. Se re-incrustan (mismo gráfico de la hoja, mismo formato)
  // solo si no están ya en su lugar.
  if (pagina(53)) {
    const LUGAR = {
      'Descargas diarias por equipo': { x: 250000, y: 700000, w: 5600000, h: 4300000 },
      'Descargas semanales por equipo': { x: 5950000, y: 1250000, w: 3000000, h: 3200000 },
    }
    const { charts } = await tool('google_sheets_get_charts', { spreadsheet: hoja })
    // Slides dibuja el gráfico al tamaño que tiene en la hoja y lo escala a su recuadro: con
    // 600×371 px dentro de un recuadro angosto, letras y etiquetas salían diminutas. El tamaño
    // en la hoja se ajusta a la proporción del recuadro (≈ 1 px cada 9.525 EMU a 96 ppp,
    // achicado para que el texto se vea más grande).
    const tamanos = Object.entries(LUGAR)
      .map(([titulo, c]) => ({ c, g: charts.find((x) => x.spec?.title === titulo) }))
      .filter((x) => x.g)
      .map(({ c, g }) => ({
        updateEmbeddedObjectPosition: {
          objectId: g.chartId,
          newPosition: { overlayPosition: { widthPixels: Math.round(c.w / 9525 * 0.8), heightPixels: Math.round(c.h / 9525 * 0.8) } },
          fields: 'widthPixels,heightPixels',
        },
      }))
    if (tamanos.length) await tool('google_sheets_batch_update', { spreadsheet: hoja, requests: tamanos })
    for (const e of pres.slides[52].elements ?? []) {
      if (e.type !== 'chart') continue
      const titulo = charts.find((c) => c.chartId === e.chart?.chartId)?.spec?.title
      const c = LUGAR[titulo]
      if (!c) continue
      const b = e.box
      if (Math.abs(b.x - c.x) < 5000 && Math.abs(b.y - c.y) < 5000 && Math.abs(b.width - c.w) < 5000) continue
      r.push(
        { deleteObject: { objectId: e.objectId } },
        {
          createSheetsChart: {
            spreadsheetId: hoja,
            chartId: e.chart.chartId,
            linkingMode: 'LINKED',
            elementProperties: colocar(pagina(53), c.x, c.y, c.w, c.h),
          },
        },
      )
    }
  }

  // Láminas 7–14 — rótulos fijos que con Inter (más ancha que la fuente original) se partían
  // en dos líneas: «Total de camiones» encima de la cifra y «Q3»/«Q4» en su etiqueta angosta.
  for (let n = 7; n <= 14; n++) {
    for (const e of pres.slides[n - 1]?.elements ?? []) {
      const t = String(e.text ?? '').trim()
      if (e.type !== 'text' || !/^(Total de camiones|Q[1-4])$/.test(t)) continue
      r.push({
        updateTextStyle: {
          objectId: e.objectId,
          textRange: { type: 'ALL' },
          style: { fontSize: { magnitude: t.startsWith('Q') ? 10 : 10.5, unit: 'PT' } },
          fields: 'fontSize',
        },
      })
    }
  }

  // Todas las láminas — sin el pie «BORRADOR MANUAL · Datos de referencia y carga manual · n/72».
  for (const s of pres.slides) {
    for (const e of s.elements ?? []) {
      if (/^BORRADOR MANUAL/.test(e.text ?? '')) r.push({ deleteObject: { objectId: e.objectId } })
    }
  }

  // Lámina 20 — pellet: rótulos centrados sin espacios de relleno, recuadro de total con su rótulo.
  if (pagina(20)) {
    for (const [id, texto] of [['p20_i758', 'Inicio'], ['p20_i759', 'Fin']]) {
      if (!existe.has(id)) continue
      r.push(
        { deleteText: { objectId: id, textRange: { type: 'ALL' } } },
        { insertText: { objectId: id, text: texto, insertionIndex: 0 } },
        estiloTexto(id, { size: 14, bold: true, color: '092454' }),
        alinear(id, 'CENTER'),
      )
    }
    if (existe.has('dz20_total_rotulo')) {
      r.push(
        { deleteText: { objectId: 'dz20_total_rotulo', textRange: { type: 'ALL' } } },
        { insertText: { objectId: 'dz20_total_rotulo', text: 'Total de camiones', insertionIndex: 0 } },
        estiloTexto('dz20_total_rotulo', { size: 14, bold: true, color: '092454' }),
      )
    }
    if (existe.has('p20_i753')) {
      const texto = 'Toneladas\n30 t por camión'
      r.push(
        { deleteText: { objectId: 'p20_i753', textRange: { type: 'ALL' } } },
        { insertText: { objectId: 'p20_i753', text: texto, insertionIndex: 0 } },
        estiloTexto('p20_i753', { size: 14, bold: true, color: '092454' }),
        estiloTexto('p20_i753', { size: 9, color: GRIS }, { type: 'FIXED_RANGE', startIndex: 10, endIndex: texto.length }),
        alinear('p20_i753', 'CENTER'),
      )
    }
    // Cifra del total centrada en su recuadro (arriba) y rótulo fijo debajo.
    const marco = caja.get('p20_i745')
    const cifra = caja.get('p20_i756')
    if (marco && cifra) {
      const dx = marco.x + marco.width / 2 - (cifra.x + cifra.width / 2)
      const dy = marco.y + marco.height * 0.4 - (cifra.y + cifra.height / 2)
      if (Math.abs(dx) > 5000 || Math.abs(dy) > 5000) {
        r.push({
          updatePageElementTransform: {
            objectId: 'p20_i756',
            applyMode: 'RELATIVE',
            transform: { scaleX: 1, scaleY: 1, translateX: dx, translateY: dy, unit: 'EMU' },
          },
        })
      }
      crear(
        'dz20_total_rotulo',
        cuadroTexto('dz20_total_rotulo', pagina(20), { x: marco.x, y: marco.y + marco.height * 0.6, w: marco.width, h: 380000 }, 'Total de camiones', {
          size: 14,
          bold: true,
          color: '092454',
        }),
      )
    }
  }

  // Lámina 34 — tabla: el total manda (grande, verde, a la derecha), las métricas de apoyo
  // quedan en segundo plano, la sede se lee una vez por grupo y los números alineados a la
  // derecha para comparar magnitudes de un vistazo.
  if (pagina(34)) {
    const VERDE = '0F5A3A'
    for (const id of ['p34_i20004', 'p34_i20005', 'p34_i20006']) r.push(alinear(id, 'END'))
    const filas = [
      { ids: [20007, 20008, 20009, 20010, 20011], fondo: 'EEF4F0', sede: true },
      { ids: [20012, 20013, 20014, 20015, 20016], fondo: 'EEF4F0', sede: false },
      { ids: [20017, 20018, 20019, 20020, 20021], fondo: 'FFFFFF', sede: true },
    ]
    for (const f of filas) {
      const [sede, tipo, ...nums] = f.ids.map((n) => `p34_i${n}`)
      for (const id of f.ids.map((n) => `p34_i${n}`)) r.push(rellenoYBorde(id, { relleno: f.fondo, borde: null }))
      // La sede repetida en la segunda fila de Ricardone es ruido: queda en el color del fondo.
      r.push(estiloTexto(sede, { size: 13, bold: true, color: f.sede ? GRIS : f.fondo }))
      r.push(estiloTexto(tipo, { size: 16, bold: true, color: AZUL }))
      r.push(alinear(nums[0], 'END'), alinear(nums[1], 'END'), alinear(nums[2], 'END'))
    }
    // Horas activas resaltadas: encabezado en ámbar, columna con fondo ámbar suave y cifra en
    // negrita (estilo de las cifras en `estilos_textos.json`).
    r.push(rellenoYBorde('p34_i20004', { relleno: 'B26A00', borde: null }))
    // La columna muestra la ocupación de cada calada, «83% (139 hs)».
    r.push({
      replaceAllText: {
        containsText: { text: 'Horas activas', matchCase: true },
        replaceText: 'Ocupación',
        pageObjectIds: [pagina(34)],
      },
    })
    for (const n of [20009, 20014, 20019]) r.push(rellenoYBorde(`p34_i${n}`, { relleno: 'FFF1D6', borde: null }))
    crear('dz34_separador', linea('dz34_separador', pagina(34), 666750, 3543300, 8477250, 3543300, 'B7C4BC', 1))
    crear('dz34_base', linea('dz34_base', pagina(34), 666750, 4295775, 8477250, 4295775, VERDE, 1.5))
    r.push(estiloTexto('p34_i20022', { size: 11, italic: true, color: GRIS }))
  }

  // Recuadro de promedio de las láminas semanales: al sacar «(139 h activas)» de la cifra,
  // queda ubicada igual que la de «Pico de camiones» respecto de su rótulo.
  const textosDe = (n) => (pres.slides[n - 1]?.elements ?? []).filter((e) => e.type === 'text' && e.box)
  const semanales = vinculos.texts.filter((t) => /^kpi\.[a-z_]+\.promedio$/.test(t.label ?? ''))
  for (const t of semanales) {
    const slide = pres.slides[t.slide - 1]
    const idValor = `p${t.slide}_i${t.object}`
    const bv = caja.get(idValor)
    if (!slide || !bv) continue
    // Un rótulo que quedó de una corrida anterior vuelve al texto de la plantilla.
    r.push({
      replaceAllText: {
        containsText: { text: 'Prom. x hora activa', matchCase: true },
        replaceText: 'Promedio x hora',
        pageObjectIds: [slide.objectId],
      },
    })
    // Referencia: otro KPI de la misma lámina (pico, o total si no hay pico) y su rótulo.
    const ref = ['pico', 'total']
      .map((k) => vinculos.texts.find((x) => x.slide === t.slide && x.label === t.label.replace('.promedio', `.${k}`)))
      .find((x) => x && caja.get(`p${x.slide}_i${x.object}`))
    if (!ref) continue
    const br = caja.get(`p${ref.slide}_i${ref.object}`)
    // `vinculos.texts` lista TODOS los textos; los fijos llevan etiqueta «Objeto N».
    const conectados = new Set(
      vinculos.texts
        .filter((x) => x.slide === t.slide && x.label && !/^Objeto /.test(x.label))
        .map((x) => `p${x.slide}_i${x.object}`),
    )
    // El rótulo de un KPI es el texto fijo que está justo encima de su cifra.
    const rotuloDe = (b) =>
      textosDe(t.slide)
        .filter((e) => !conectados.has(e.objectId) && e.box.y <= b.y && e.box.y > b.y - 450000)
        .map((e) => ({ e, solape: Math.min(e.box.x + e.box.width, b.x + b.width) - Math.max(e.box.x, b.x) }))
        .filter((x) => x.solape > 0)
        .sort((a, c) => c.solape - a.solape)[0]?.e
    const rv = rotuloDe(bv)
    const rr = rotuloDe(br)
    if (!rv || !rr) continue
    const dx = rv.box.x + (br.x + br.width / 2 - rr.box.x) - (bv.x + bv.width / 2)
    const dy = rv.box.y + (br.y - rr.box.y) - bv.y
    if (Math.abs(dx) > 5000 || Math.abs(dy) > 5000) {
      r.push({
        updatePageElementTransform: {
          objectId: idValor,
          applyMode: 'RELATIVE',
          transform: { scaleX: 1, scaleY: 1, translateX: dx, translateY: dy, unit: 'EMU' },
        },
      })
    }
  }

  for (let i = 0; i < r.length; i += 200) {
    await tool('google_slides_batch_update', { presentation: presentacion, confirm: true, requests: r.slice(i, i + 200) })
  }
  return { pedidos: r.length }
}
