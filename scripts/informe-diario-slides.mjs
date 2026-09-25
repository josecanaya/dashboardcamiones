/**
 * Publica una revisión del informe DIARIO en Google Slides.
 *
 * ## Qué es
 *
 * Un reporte de la **actividad de la planta en el día**: cuántos camiones, cuántas toneladas,
 * qué producto, en qué planta, a qué hora y dónde se descargó. Parte del Excel de Movimientos
 * (la operación declarada) y lo completa con la corrida del dashboard (tiempos de la soja al
 * puerto, calada y descarga por hora, camiones para revisar). Pocas palabras, cifras grandes.
 *
 * No muestra nada de la calidad de la lectura de cámaras (cobertura, tramos deducidos,
 * métricas no publicables): eso queda en `control.json` de la revisión. Si una métrica no se
 * puede publicar, simplemente no aparece.
 *
 * ## Mismo diseño que el semanal
 *
 * La presentación diaria nace como COPIA de la semanal (`SEMANAL`): conserva la portada con la foto
 * de la planta y, en cada lámina, los logos y el título del semanal. El script solo reescribe
 * el título y dibuja el contenido encima, con los mismos colores, marcos y tipografía.
 *
 * ## Una presentación viva + una copia por día
 *
 * Igual que el semanal, hay UNA presentación y UNA hoja que se actualizan en el lugar
 * (`reportes/logistica/diario/destino.json`); los gráficos viven en la hoja, vinculados. Después
 * se guarda una **copia fechada** en Drive («Informe diario DD-MM-AAAA»). No se exporta PDF.
 *
 * ## El diseño vive en este archivo
 *
 * Cada corrida borra y vuelve a dibujar las láminas (los gráficos se reinsertan vinculados
 * desde la hoja, que conserva su formato). Un ajuste de diseño se hace acá, no a mano en la
 * presentación. Solo hay gráficos con categorías fijas (24 horas, productos, plantas, top 10
 * de plataformas, tramos): así ningún gráfico lee filas corridas. Si cambia el layout de la
 * hoja (`LAYOUT`), los gráficos viejos se borran y se crean los nuevos en la misma hoja.
 *
 * ## Uso
 *
 *   node scripts/informe-diario-slides.mjs <revisionDir> [--crear] [--dry] [--sin-copia]
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import XLSX from 'xlsx'
import { aplicarExclusiones, slCorregido } from '../server/logisticsReport/reportWorkbook.mjs'
import { AZUL, FUENTE, GRIS, colocar, estiloGraficosHoja, indiceDelMaximo, rectangulo, rgb, tinte } from './informe-diseno.mjs'
import {
  destacadosDia,
  diaLargo,
  hm,
  minutosTramo,
  n0,
  resumenDia,
  TRAMOS_SOJA,
  variacion,
} from './informe-diario-conclusiones.mjs'
import { conectar, tool } from './lib/mcpCliente.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..')
const DIARIO = path.join(RAIZ, 'reportes', 'logistica', 'diario')
const DESTINO_PATH = path.join(DIARIO, 'destino.json')
const PT = 12700
const VERDE = '0F5A3A'
const ROJO = 'C62828'
const VERDE_OK = '2E7D32'
const TAB_HORAS = 'Graficos horarios'
const TAB_BARRAS = 'Graficos circuitos'
/** Versión del layout de la hoja: si no coincide con `destino.layout`, se rehacen los gráficos. */
const LAYOUT = 2
/** Reglas que el diario no lista: su evidencia es la falta de registro, no una conducta. */
const REGLAS_FUERA = new Set(['VOLCABLE_SIN_CALADA_RIC', 'OBSERVACION_MANUAL'])

const PRODUCTOS = [
  // Colores de producto del semanal (lámina 3); maíz y otros no tienen, se suman afines.
  { k: 'SOJA', nombre: 'Soja', color: '38761D' },
  { k: 'GIRASOL', nombre: 'Girasol', color: 'A78619' },
  { k: 'MAIZ', nombre: 'Maíz', color: 'C0392B' },
  { k: 'ACEITE', nombre: 'Líquidos', color: 'B86415' },
  { k: 'PELLET', nombre: 'Pellet', color: '356CB3' },
  { k: 'OTROS', nombre: 'Otros', color: '6B7280' },
]
const PLANTAS = [
  ['RICARDONE', 'Ricardone'],
  ['TERMINAL_EMBARQUE', 'Puerto San Lorenzo'],
  ['AVELLANEDA', 'Avellaneda'],
  ['RENOPACK', 'Renopack'],
  ['LOS_CORRALES_DE_NICANOR', 'Los Corrales'],
]

const args = process.argv.slice(2)
const revDir = args.find((a) => !a.startsWith('--'))
const ensayo = args.includes('--dry')
if (!revDir || !existsSync(path.join(revDir, 'diario.json'))) {
  console.error('Uso: node scripts/informe-diario-slides.mjs <revisionDir> [--crear] [--dry] [--sin-copia]')
  process.exit(1)
}

// —— Datos ————————————————————————————————————————————————————————————————

const leerJson = async (p, def = null) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'))
  } catch {
    return def
  }
}

async function leerRevision(dir) {
  const diaDir = path.dirname(dir)
  const exclusiones = await leerJson(path.join(diaDir, 'exclusiones.json'), [])
  return {
    paquete: aplicarExclusiones(await leerJson(path.join(dir, 'paquete.json')), exclusiones),
    diario: await leerJson(path.join(dir, 'diario.json')),
    control: await leerJson(path.join(dir, 'control.json')),
  }
}

const { paquete, diario, control } = await leerRevision(revDir)
const dia = diario.dia
diario.anomalias.casos = diario.anomalias.casos.filter((c) => !REGLAS_FUERA.has(c.reason))
diario.anomalias.total = diario.anomalias.casos.length

const shift = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** Resumen de los 7 días anteriores que tengan informe con Excel (el más reciente primero). */
async function leerHistorial() {
  const out = []
  for (let k = 1; k <= 7; k++) {
    const d = shift(dia, -k)
    const ultima = (await fs.readFile(path.join(DIARIO, d, 'ULTIMA.txt'), 'utf8').catch(() => '')).trim()
    if (!ultima || !existsSync(path.join(ultima, 'diario.json'))) continue
    const r = await leerRevision(ultima)
    // Un día sin Excel de movimientos no es base de comparación: sus conteos darían cero.
    if ((r.control?.advertencias ?? []).some((a) => /^movimientos\.(falta_excel|sin_filas)$/.test(a.id))) continue
    out.push(resumenDia(r.paquete, r.diario))
  }
  return out
}
const historial = await leerHistorial()
const hoy = resumenDia(paquete, diario)
console.log(`Historial: ${historial.length} días anteriores con informe.`)

// —— Valores de la hoja (layout fijo: los gráficos apuntan a estas celdas) ————————————

const q = (t) => `'${t}'`
const letra = (i) => String.fromCharCode(65 + i)
const mov = diario.movimientos

/** Curva por hora de una sección de actividad del dashboard (0 si esa hora no operó). */
function curvaActividad(id) {
  const s = paquete.actividad?.[id]
  const v = Array(24).fill(0)
  if (!s || s.missing) return v
  for (const h of s.periodo?.porHora ?? []) {
    const hora = Number(String(h.bucket).slice(11, 13))
    if (Number.isInteger(hora) && hora >= 0 && hora < 24) v[hora] += h.camiones ?? 0
  }
  return v
}

/** Curvas por hora: columna de valores + columna «Máximo» (la que `estiloGraficosHoja` pinta de rojo). */
const HORARIOS = [
  { key: 'ingresos_hora', titulo: 'Ingresos por hora', valores: mov.ingresosPorHora },
  { key: 'salidas_hora', titulo: 'Salidas por hora', valores: mov.salidasPorHora },
  { key: 'calada_ricardone', titulo: 'Calada Ricardone', valores: curvaActividad('calada_ricardone') },
  { key: 'descarga_puerto', titulo: 'Descarga Puerto San Lorenzo', valores: curvaActividad('volcable_san_lorenzo') },
].map((h, i) => ({ ...h, col: 1 + i * 2 }))

function filasHoras() {
  const filas = [['Hora', ...HORARIOS.flatMap((h) => [h.titulo, 'Máximo'])]]
  const maxIdx = HORARIOS.map((h) => indiceDelMaximo(h.valores))
  for (let hora = 0; hora < 24; hora++) {
    filas.push([
      String(hora).padStart(2, '0'),
      ...HORARIOS.flatMap((h, i) => [h.valores[hora] ?? 0, maxIdx[i] === hora ? h.valores[hora] : '']),
    ])
  }
  return filas
}

const lindo = (s) =>
  s
    .replace(/_-_/g, ' ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\bpto\b/g, 'puerto')
    .replace(/\bosl\b/g, 'OSL')
    .replace(/^./, (m) => m.toUpperCase())

const TOP_PLATAFORMAS = 10
const plataformas = Object.entries(mov.porPlataforma ?? {})
  .filter(([k, v]) => k && v > 0)
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_PLATAFORMAS)

const soja = paquete.tiempos?.soja
const sojaPlantas = soja?.plantsPublishable ? soja.periodo : null

/** Bloques de barras: [titulo, filas [categoría, valor]] en columnas fijas. */
const BARRAS = [
  {
    key: 'productos',
    titulo: 'Camiones por producto',
    tipo: 'COLUMN',
    filas: PRODUCTOS.map((p) => [p.nombre, mov.porProducto?.[p.k] ?? 0]),
  },
  {
    key: 'plantas',
    titulo: 'Camiones por planta',
    tipo: 'BAR',
    filas: PLANTAS.map(([k, nombre]) => [nombre, mov.porPlanta?.[k] ?? 0]),
  },
  {
    key: 'plataformas',
    titulo: 'Camiones por plataforma',
    tipo: 'BAR',
    filas: Array.from({ length: TOP_PLATAFORMAS }, (_, i) => (plataformas[i] ? [lindo(plataformas[i][0]), plataformas[i][1]] : ['', ''])),
  },
  {
    key: 'tramos_soja',
    titulo: 'Soja al puerto · minutos por etapa',
    tipo: 'COLUMN',
    filas: TRAMOS_SOJA.map((t) => {
      const v = sojaPlantas ? minutosTramo(sojaPlantas, t.key) : null
      return [t.corto, typeof v === 'number' ? Math.round(v) : '']
    }),
  },
].map((b, i) => ({ ...b, col: i * 3 }))

function filasBarras() {
  const alto = Math.max(...BARRAS.map((b) => b.filas.length)) + 1
  const filas = Array.from({ length: alto }, () => Array(BARRAS.length * 3).fill(''))
  for (const b of BARRAS) {
    filas[0][b.col] = b.titulo
    filas[0][b.col + 1] = 'Valor'
    b.filas.forEach(([c, v], r) => {
      filas[r + 1][b.col] = c
      filas[r + 1][b.col + 1] = v
    })
  }
  return filas
}

// —— Primitivas de Slides ———————————————————————————————————————————————————

const caja = (x, y, w, h) => ({ x: x * PT, y: y * PT, w: w * PT, h: h * PT })

/** Cuadro de texto; `**negrita**` en el contenido, `\n` separa párrafos. */
function texto(id, pagina, [x, y, w, h], contenido, o = {}) {
  const { size = 11, color = AZUL, bold = false, align = 'START', valign = 'TOP', espacio = 0, interlineado = 100 } = o
  let plano = ''
  const negritas = []
  for (const [k, trozo] of String(contenido ?? '').split('**').entries()) {
    if (k % 2 === 1) negritas.push([plano.length, plano.length + trozo.length])
    plano += trozo
  }
  const c = caja(x, y, w, h)
  const req = [
    { createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: colocar(pagina, c.x, c.y, c.w, c.h) } },
    {
      updateShapeProperties: {
        objectId: id,
        shapeProperties: { contentAlignment: valign, autofit: { autofitType: 'NONE' } },
        fields: 'contentAlignment,autofit.autofitType',
      },
    },
  ]
  if (!plano) return req
  req.push(
    { insertText: { objectId: id, text: plano, insertionIndex: 0 } },
    {
      updateTextStyle: {
        objectId: id,
        textRange: { type: 'ALL' },
        style: {
          fontFamily: FUENTE,
          fontSize: { magnitude: size, unit: 'PT' },
          bold,
          foregroundColor: { opaqueColor: { rgbColor: rgb(color) } },
        },
        fields: 'fontFamily,fontSize,bold,foregroundColor',
      },
    },
    {
      updateParagraphStyle: {
        objectId: id,
        textRange: { type: 'ALL' },
        style: {
          alignment: align,
          lineSpacing: interlineado,
          spaceAbove: { magnitude: 0, unit: 'PT' },
          spaceBelow: { magnitude: espacio, unit: 'PT' },
        },
        fields: 'alignment,lineSpacing,spaceAbove,spaceBelow',
      },
    },
    ...negritas.map(([a, b]) => ({
      updateTextStyle: { objectId: id, textRange: { type: 'FIXED_RANGE', startIndex: a, endIndex: b }, style: { bold: true }, fields: 'bold' },
    })),
  )
  return req
}

function recuadro(id, pagina, [x, y, w, h], relleno) {
  return rectangulo(id, pagina, caja(x, y, w, h), { relleno, borde: null }, 'ROUND_RECTANGLE')
}

/**
 * Alto que Slides le da de verdad a una tabla (pt). Las celdas llevan un margen interno fijo
 * que la API no deja cambiar (~7 pt arriba y abajo), y un texto largo pasa a dos líneas: con
 * el alto nominal las notas de abajo quedaban encimadas.
 */
function altoFila(columnas, fila, size, alto, cabecera = false) {
  const lineas = Math.max(
    1,
    ...fila.map((celda, i) => Math.ceil((String(celda ?? '').length * size * (cabecera ? 0.62 : 0.55)) / Math.max(1, columnas[i].ancho - 14))),
  )
  return Math.max(alto, lineas * size * 1.25 + 14.5)
}
function medirTabla(columnas, filas, { size = 9, alto = 17 } = {}) {
  return (
    altoFila(columnas, columnas.map((c) => c.titulo), size, alto, true) +
    filas.reduce((suma, fila) => suma + altoFila(columnas, fila, size, alto), 0)
  )
}

/**
 * Tabla nativa. `columnas`: `{ titulo, ancho (pt), align }`. `filas`: celdas de texto.
 * `ultimaTotal` resalta la última fila (total).
 */
function tabla(id, pagina, [x, y], columnas, filas, { size = 9, alto = 17, ultimaTotal = false } = {}) {
  const nf = filas.length + 1
  const nc = columnas.length
  const ancho = columnas.reduce((s, c) => s + c.ancho, 0)
  const req = [
    {
      createTable: {
        objectId: id,
        rows: nf,
        columns: nc,
        elementProperties: colocar(pagina, x * PT, y * PT, ancho * PT, nf * alto * PT),
      },
    },
    ...columnas.map((c, i) => ({
      updateTableColumnProperties: {
        objectId: id,
        columnIndices: [i],
        tableColumnProperties: { columnWidth: { magnitude: c.ancho * PT, unit: 'EMU' } },
        fields: 'columnWidth',
      },
    })),
    {
      updateTableRowProperties: {
        objectId: id,
        rowIndices: [...Array(nf).keys()],
        tableRowProperties: { minRowHeight: { magnitude: alto * PT, unit: 'EMU' } },
        fields: 'minRowHeight',
      },
    },
    {
      updateTableBorderProperties: {
        objectId: id,
        tableRange: { location: { rowIndex: 0, columnIndex: 0 }, rowSpan: nf, columnSpan: nc },
        borderPosition: 'ALL',
        tableBorderProperties: { tableBorderFill: { solidFill: { color: { rgbColor: rgb('D9DEE8') } } }, weight: { magnitude: 0.5, unit: 'PT' } },
        fields: 'tableBorderFill,weight',
      },
    },
  ]
  const todas = [columnas.map((c) => c.titulo), ...filas]
  todas.forEach((fila, r) => {
    const cabecera = r === 0
    const total = ultimaTotal && r === nf - 1
    req.push({
      updateTableCellProperties: {
        objectId: id,
        tableRange: { location: { rowIndex: r, columnIndex: 0 }, rowSpan: 1, columnSpan: nc },
        tableCellProperties: {
          tableCellBackgroundFill: { solidFill: { color: { rgbColor: rgb(cabecera ? AZUL : total ? tinte(AZUL, 0.85) : r % 2 ? 'FFFFFF' : tinte(AZUL, 0.95)) } } },
          contentAlignment: 'MIDDLE',
        },
        fields: 'tableCellBackgroundFill.solidFill.color,contentAlignment',
      },
    })
    fila.forEach((celda, cIdx) => {
      const t = String(celda ?? '')
      if (!t) return
      const cellLocation = { rowIndex: r, columnIndex: cIdx }
      req.push(
        { insertText: { objectId: id, cellLocation, text: t, insertionIndex: 0 } },
        {
          updateTextStyle: {
            objectId: id,
            cellLocation,
            textRange: { type: 'ALL' },
            style: {
              fontFamily: FUENTE,
              fontSize: { magnitude: size, unit: 'PT' },
              bold: cabecera || total,
              foregroundColor: { opaqueColor: { rgbColor: rgb(cabecera ? 'FFFFFF' : AZUL) } },
            },
            fields: 'fontFamily,fontSize,bold,foregroundColor',
          },
        },
        {
          updateParagraphStyle: {
            objectId: id,
            cellLocation,
            textRange: { type: 'ALL' },
            style: { alignment: columnas[cIdx].align ?? 'START' },
            fields: 'alignment',
          },
        },
      )
    })
  })
  return req
}

// —— Estilo del semanal ———————————————————————————————————————————————————

/** Presentación semanal: de acá salen la portada, los logos y los títulos del diario. */
const SEMANAL = '1fSx_fDqJS-1QXAlzNkLSp7laxnwW2T4n0C2dYpaRI_g'
const N_LAMINAS = 6
const NAVY = '06245F'
const GRIS_TITULO = '434343'
const MARCO = { relleno: 'EEF3FB', borde: '8FA8D6', grosor: 1 }
const SOLAPA = '4A7FD4'

const fecha = diaLargo(dia)
const fechaTitulo = fecha.charAt(0).toUpperCase() + fecha.slice(1)
const fechaPortada = `${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}`

/** Reescribe un texto existente del semanal con el estilo dado (borrar+insertar pierde el formato). */
function reescribir(objectId, t, { size, bold = false, color, align = 'CENTER' }) {
  return [
    { deleteText: { objectId, textRange: { type: 'ALL' } } },
    { insertText: { objectId, text: t, insertionIndex: 0 } },
    {
      updateTextStyle: {
        objectId,
        textRange: { type: 'ALL' },
        style: { fontFamily: FUENTE, fontSize: { magnitude: size, unit: 'PT' }, bold, foregroundColor: { opaqueColor: { rgbColor: rgb(color) } } },
        fields: 'fontFamily,fontSize,bold,foregroundColor',
      },
    },
    { updateParagraphStyle: { objectId, textRange: { type: 'ALL' }, style: { alignment: align }, fields: 'alignment' } },
  ]
}

const marco = (id, p, c, estilo = MARCO) => rectangulo(id, p, caja(...c), estilo, 'ROUND_RECTANGLE')

/** Tarjeta de marco celeste (como «Período de análisis» del semanal). */
function tarjetaMarco(id, p, [x, y, w, h], etiqueta, valor, extra, { size = 26 } = {}) {
  return [
    ...marco(`${id}_f`, p, [x, y, w, h]),
    ...texto(`${id}_e`, p, [x + 10, y + 8, w - 20, 16], etiqueta, { size: 10, color: NAVY }),
    ...texto(`${id}_v`, p, [x + 10, y + 24, w - 20, size + 10], valor, { size, bold: true, color: NAVY, align: 'CENTER', valign: 'MIDDLE' }),
    ...(extra ? texto(`${id}_x`, p, [x + 10, y + h - 20, w - 20, 14], extra.t, { size: 9, color: extra.c ?? GRIS, align: 'CENTER' }) : []),
  ]
}

/** Tarjeta con solapa azul (como «Pico de camiones» del semanal). */
function tarjetaSolapa(id, p, [x, y, w, h], etiqueta, valor, extra, { size = 20 } = {}) {
  return [
    ...rectangulo(`${id}_s`, p, caja(x - 5, y - 4, w, h), { relleno: SOLAPA, borde: null }),
    ...rectangulo(`${id}_f`, p, caja(x, y, w, h), { relleno: 'FFFFFF', borde: '9AA3AE', grosor: 0.75 }),
    ...texto(`${id}_e`, p, [x + 8, y + 5, w - 16, 15], etiqueta, { size: 10, color: '202020' }),
    ...texto(`${id}_v`, p, [x + 8, y + 20, w - 16, size + 8], valor, { size, bold: true, color: NAVY, align: 'CENTER', valign: 'MIDDLE' }),
    ...(extra ? texto(`${id}_x`, p, [x + 8, y + h - 18, w - 16, 14], extra.t, { size: 9, color: GRIS, align: 'CENTER' }) : []),
  ]
}

/** Recuadro de producto (borde y tinte del color del producto, como la lámina 3). */
function tarjetaProducto(id, p, [x, y, w, h], pr, valor, extra) {
  return [
    ...marco(`${id}_f`, p, [x, y, w, h], { relleno: tinte(pr.color, 0.9), borde: pr.color, grosor: 1.75 }),
    ...texto(`${id}_n`, p, [x + 6, y + 7, w - 12, 16], pr.nombre.toUpperCase(), { size: 11, bold: true, color: pr.color, align: 'CENTER' }),
    ...texto(`${id}_v`, p, [x + 6, y + 24, w - 12, 28], valor, { size: 22, bold: true, color: pr.color, align: 'CENTER', valign: 'MIDDLE' }),
    ...texto(`${id}_t`, p, [x + 6, y + h - 19, w - 12, 14], extra, { size: 9, color: GRIS, align: 'CENTER' }),
  ]
}

const rotulo = (id, p, [x, y, w], t) => texto(id, p, [x, y, w, 16], t.toUpperCase(), { size: 11, bold: true, color: NAVY })

// —— Láminas ——————————————————————————————————————————————————————————————

/** Se completan al resolver la plantilla (ids de las láminas de la copia del semanal). */
let LAMINAS = Array.from({ length: N_LAMINAS }, (_, i) => `ensayo_s${i + 1}`)
let TITULOS = {}

function encabezado(n, titulo) {
  const p = LAMINAS[n - 1]
  return [
    ...(TITULOS[p] ? reescribir(TITULOS[p], titulo, { size: 18, bold: true, color: GRIS_TITULO }) : []),
    ...texto(`d${n}_fecha`, p, [150, 45, 420, 16], fechaTitulo, { size: 10, color: GRIS, align: 'CENTER' }),
  ]
}

/** Variación corta contra el promedio de los días anteriores. */
function delta(v) {
  if (!v) return null
  if (Math.abs(v.pct) < 5) return { t: 'en línea con el promedio' }
  return { t: `${v.pct > 0 ? '▲' : '▼'} ${Math.abs(v.pct)} % vs promedio`, c: v.pct > 0 ? VERDE_OK : ROJO }
}

const toneladas = (kg) => n0((kg ?? 0) / 1000)

function lamina1() {
  const p = LAMINAS[0]
  const req = [...encabezado(1, 'Actividad de planta')]
  const W = 157.5
  const heroes = [
    ['Camiones', n0(mov.total), delta(variacion(hoy.movimientos, historial, (h) => h.movimientos))],
    ['Toneladas', toneladas(mov.kgNetos), delta(variacion(hoy.toneladas, historial, (h) => h.toneladas))],
    ['Ingresos', n0(mov.ingresos), null],
    ['Egresos', n0(mov.egresos), null],
  ]
  req.push(...rotulo('d1_r1', p, [30, 66, 400], 'Volumen del día'))
  heroes.forEach(([et, v, d], i) => req.push(...tarjetaMarco(`d1_h${i}`, p, [30 + i * (W + 10), 86, W, 82], et, v, d)))
  req.push(...rotulo('d1_r2', p, [30, 180, 400], 'Por producto'))
  const CW = (660 - 5 * 8) / 6
  PRODUCTOS.forEach((pr, i) => {
    req.push(...tarjetaProducto(`d1_p${i}`, p, [30 + i * (CW + 8), 200, CW, 80], pr, n0(mov.porProducto?.[pr.k] ?? 0), `${toneladas(mov.kgPorProducto?.[pr.k])} t`))
  })
  const lineas = destacadosDia(paquete, diario, historial)
  req.push(...rotulo('d1_r3', p, [30, 294, 400], 'Lo destacado'))
  lineas.forEach((l, i) => {
    const y = 314 + i * 25
    req.push(
      ...rectangulo(`d1_dest${i}_b`, p, caja(32, y + 7, 7, 7), { relleno: '38761D', borde: null }, 'ELLIPSE'),
      ...texto(`d1_dest${i}`, p, [46, y, 644, 22], l, { size: 12, color: NAVY, valign: 'MIDDLE' }),
    )
  })
  return req
}

function lamina2() {
  return [...encabezado(2, 'Productos y plantas')]
}

/** Pico de una curva: «14 h» y camiones. */
function pico(valores) {
  const i = indiceDelMaximo(valores)
  return i === undefined ? null : { hora: `${String(i).padStart(2, '0')} h`, n: valores[i] }
}

function lamina3() {
  const p = LAMINAS[2]
  const req = [...encabezado(3, 'Movimiento por hora')]
  HORARIOS.slice(0, 2).forEach((h, i) => {
    const pk = pico(h.valores)
    req.push(...tarjetaSolapa(`d3_k${i}`, p, [560, 100 + i * 172, 130, 90], `Pico de ${i ? 'salidas' : 'ingresos'}`, pk?.hora ?? '—', pk ? { t: `${n0(pk.n)} camiones` } : null, { size: 24 }))
  })
  return req
}

function lamina4() {
  const p = LAMINAS[3]
  const req = [...encabezado(4, 'Descarga y calada')]
  ;[
    ['calada_ricardone', 'Calada Ricardone', 70],
    ['volcable_san_lorenzo', 'Descarga puerto', 248],
  ].forEach(([id, et, y], i) => {
    const s = paquete.actividad?.[id]
    if (!s || s.missing) return
    const pk = String(s.periodo?.picoLabel ?? '').match(/(\d{2})h/)?.[1]
    req.push(...texto(`d4_c${i}`, p, [375, y + 152, 315, 16], `**${n0(s.periodo.camiones)} camiones** · pico ${pk ?? '—'} h`, { size: 10, color: NAVY, align: 'CENTER' }))
  })
  return req
}

function lamina5() {
  const p = LAMINAS[4]
  const req = [...encabezado(5, 'Soja al puerto')]
  const s = soja?.periodo
  if (!soja?.doorToDoorPublishable || typeof s?.tiempoMedioMin !== 'number') return req
  req.push(...tarjetaMarco('d5_pap', p, [30, 72, 250, 96], 'Puerta a puerta', hm(s.tiempoMedioMin), { t: `${n0(s.camiones)} camiones de Ricardone al puerto` }, { size: 28 }))
  if (sojaPlantas) {
    const sl = slCorregido(sojaPlantas)
    ;[
      ['En Ricardone', sojaPlantas.ricMediaMin],
      ['Traslado', sojaPlantas.bridgeMediaMin],
      ['En el puerto', sl?.min],
    ].forEach(([et, v], i) => {
      if (typeof v !== 'number') return
      req.push(...tarjetaSolapa(`d5_t${i}`, p, [35, 190 + i * 76, 245, 60], et, hm(v), null, { size: 20 }))
    })
  }
  return req
}

const NOMBRE_DEMORA = { 'CALADA→EGRESO': 'Salida de Ricardone', 'EGRESO→SL_INGRESO': 'Traslado al puerto' }
const hora = (iso) => {
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  return m[1] === dia ? `${m[2]}:${m[3]}` : `${m[1].slice(8, 10)}/${m[1].slice(5, 7)} ${m[2]}:${m[3]}`
}
const tituloCorto = (c) => c.title.split(' · ')[0]

function lamina6() {
  const p = LAMINAS[5]
  const req = [...encabezado(6, 'Para revisar')]
  const casos = diario.anomalias.casos
  const demoras = (diario.demorados ?? []).filter((d) => d.casos.length)
  if (!casos.length && !demoras.length) {
    return [...req, ...texto('d6_ok', p, [30, 170, 660, 60], 'Sin novedades en el día', { size: 28, bold: true, color: VERDE_OK, align: 'CENTER', valign: 'MIDDLE' })]
  }
  req.push(...tarjetaSolapa('d6_n', p, [35, 76, 190, 72], 'Camiones para revisar', n0(casos.length), null, { size: 26 }))
  if (casos.length) {
    const COL = [
      { titulo: 'Patente', ancho: 80 },
      { titulo: 'Qué pasó', ancho: 250 },
      { titulo: 'Hora', ancho: 70, align: 'END' },
    ]
    const filas = casos.slice(0, 7).map((c) => [c.plate, tituloCorto(c), hora(c.inicio)])
    req.push(...tabla('d6_tab', p, [30, 164], COL, filas, { size: 9 }))
  }
  let y = 76
  demoras.forEach((d, i) => {
    const x = 455
    const filas = d.casos.slice(0, 2).map((c) => [c.plate, n0(c.minutos)])
    const COL = [
      { titulo: 'Patente', ancho: 125 },
      { titulo: 'Minutos', ancho: 110, align: 'END' },
    ]
    req.push(...tarjetaSolapa(`d6_d${i}`, p, [x, y, 235, 62], `${NOMBRE_DEMORA[d.tramo] ?? d.tramo} · más de ${d.umbralMin} min`, `${n0(d.casos.length)} camiones`, null, { size: 18 }))
    req.push(...tabla(`d6_dt${i}`, p, [x, y + 70], COL, filas, { size: 8.5 }))
    y += 70 + medirTabla(COL, filas, { size: 8.5 }) + 18
  })
  return req
}

/** Portada del semanal con el rótulo y la fecha del diario. */
function portada(plantilla) {
  const t = plantilla.portadaTextos ?? {}
  return [
    ...(t.rotulo ? reescribir(t.rotulo, 'Informe Diario de Logística', { size: 11, color: '202020' }) : []),
    ...(t.fecha ? reescribir(t.fecha, fechaPortada, { size: 13, color: '202020' }) : []),
  ]
}

// —— Programa ——————————————————————————————————————————————————————————————

/** Gráficos de la hoja y dónde van en la presentación. */
const GRAFICOS = [
  ...HORARIOS.map((h) => ({
    key: h.key,
    titulo: h.titulo,
    tipo: 'AREA',
    tab: TAB_HORAS,
    domain: `${q(TAB_HORAS)}!A2:A25`,
    series: `${q(TAB_HORAS)}!${letra(h.col)}2:${letra(h.col)}25`,
  })),
  ...BARRAS.map((b) => ({
    key: b.key,
    titulo: b.titulo,
    tipo: b.tipo,
    tab: TAB_BARRAS,
    domain: `${q(TAB_BARRAS)}!${letra(b.col)}2:${letra(b.col)}${b.filas.length + 1}`,
    series: `${q(TAB_BARRAS)}!${letra(b.col + 1)}2:${letra(b.col + 1)}${b.filas.length + 1}`,
  })),
]
/** Lámina y recuadro (pt) de cada gráfico. La página del semanal mide 720 × 429 pt. */
const UBICACION = {
  productos: [2, [30, 72, 320, 340]],
  plantas: [2, [370, 72, 320, 340]],
  ingresos_hora: [3, [30, 68, 510, 168]],
  salidas_hora: [3, [30, 240, 510, 168]],
  plataformas: [4, [30, 68, 330, 345]],
  calada_ricardone: [4, [375, 68, 315, 150]],
  descarga_puerto: [4, [375, 246, 315, 150]],
  tramos_soja: [5, [300, 68, 390, 345]],
}
const sinSoja = !(soja?.doorToDoorPublishable && typeof soja?.periodo?.tiempoMedioMin === 'number')
const construir = () => [lamina1(), lamina2(), lamina3(), lamina4(), lamina5(), lamina6()]

if (ensayo) {
  console.log(`(--dry) ${construir().flat().length} pedidos de Slides; nada escrito.`)
  console.log(destacadosDia(paquete, diario, historial).map((x) => `  · ${x.replace(/\*\*/g, '')}`).join('\n'))
  process.exit(0)
}

await conectar('informe-diario')

async function escribirHoja(hoja) {
  await tool('google_sheets_write_sheet', { spreadsheet: hoja, sheetTitle: TAB_HORAS, values: filasHoras() })
  await tool('google_sheets_write_sheet', { spreadsheet: hoja, sheetTitle: TAB_BARRAS, values: filasBarras() })
}

/** Crea los gráficos del layout vigente (con datos ya escritos: una serie vacía al crear se pierde). */
async function crearGraficos(hoja) {
  const graficos = {}
  for (const g of GRAFICOS) {
    const r = await tool('google_sheets_add_chart', {
      spreadsheet: hoja,
      chartType: g.tipo,
      title: g.titulo,
      domain: g.domain,
      series: [g.series],
      legendPosition: 'NO_LEGEND',
      anchorSheetTitle: g.tab,
    })
    graficos[g.key] = r.chartId
  }
  return graficos
}

const cerca = (a, b, tol = 80000) => Math.abs((a ?? -1e9) - b) < tol

/** Lámina «estándar» del semanal: logo a la izquierda, logo a la derecha y título centrado. */
function encabezadoSemanal(s) {
  const els = s.elements ?? []
  const izq = els.find((e) => e.type === 'image' && cerca(e.box?.x, 374601) && cerca(e.box?.y, 216175))
  const der = els.find((e) => e.type === 'image' && cerca(e.box?.x, 8427032) && cerca(e.box?.y, 244075))
  const tit = els.find((e) => e.type === 'text' && cerca(e.box?.y, 210000) && (e.box?.width ?? 0) > 5000000)
  return izq && der && tit ? { conservar: [izq.objectId, der.objectId, tit.objectId], titulo: tit.objectId } : null
}

/**
 * Presentación del diario = copia del semanal reducida a la portada y 6 láminas estándar.
 * Se hace una sola vez; los ids quedan en `destino.plantilla`.
 */
async function prepararPlantilla() {
  const copia = await tool('google_slides_duplicate_presentation', { presentation: SEMANAL, name: 'Informe diario de logística' })
  const pres = await tool('google_slides_get_presentation', { presentation: copia.id })
  const tapa = pres.slides[0]
  const elegidas = pres.slides
    .slice(1)
    .map((s) => ({ s, h: encabezadoSemanal(s) }))
    .filter((x) => x.h)
    .slice(0, N_LAMINAS)
  if (elegidas.length < N_LAMINAS) throw new Error('El semanal no tiene 6 láminas con el encabezado estándar.')
  const usar = new Set([tapa.objectId, ...elegidas.map((x) => x.s.objectId)])
  const textoTapa = (re) => tapa.elements.find((e) => e.type === 'text' && re.test(e.text ?? ''))?.objectId
  await tool('google_slides_batch_update', {
    presentation: copia.id,
    confirm: true,
    requests: [
      ...pres.slides.filter((s) => !usar.has(s.objectId)).map((s) => ({ deleteObject: { objectId: s.objectId } })),
      { updateSlidesPosition: { slideObjectIds: [tapa.objectId, ...elegidas.map((x) => x.s.objectId)], insertionIndex: 0 } },
    ],
  })
  return {
    presentacion: copia.id,
    plantilla: {
      portada: tapa.objectId,
      portadaTextos: { rotulo: textoTapa(/comit|informe/i), fecha: textoTapa(/^\s*\d{2}-\d{2}-\d{4}\s*$/) },
      laminas: elegidas.map((x) => x.s.objectId),
      conservar: Object.fromEntries(elegidas.map((x) => [x.s.objectId, x.h.conservar])),
      titulos: Object.fromEntries(elegidas.map((x) => [x.s.objectId, x.h.titulo])),
    },
  }
}

let destino = await leerJson(DESTINO_PATH)
if (!destino || args.includes('--crear')) {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasHoras()), TAB_HORAS)
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filasBarras()), TAB_BARRAS)
  const dir = path.join(DIARIO, '_plantilla')
  await fs.mkdir(dir, { recursive: true })
  const xlsx = path.join(dir, 'Informe_diario_datos.xlsx')
  XLSX.writeFile(libro, xlsx)
  const hoja = await tool('google_drive_upload_file', { localPath: xlsx, name: 'Informe diario de logística · datos', convert: true })
  // Se guarda enseguida: si algo falla después, la corrida siguiente retoma sin duplicar archivos.
  destino = { hoja: hoja.id, layout: 0, graficos: {}, creado: new Date().toISOString() }
  await fs.writeFile(DESTINO_PATH, JSON.stringify(destino, null, 2), 'utf8')
}
if (!destino.plantilla) {
  // La presentación del diario pasa a ser una copia del semanal (su diseño). Una presentación
  // diaria anterior sin plantilla queda en Drive sin usarse.
  if (destino.presentacion) destino.presentacionAnterior = destino.presentacion
  Object.assign(destino, await prepararPlantilla())
  await fs.writeFile(DESTINO_PATH, JSON.stringify(destino, null, 2), 'utf8')
  console.log(`Presentación creada desde el semanal: https://docs.google.com/presentation/d/${destino.presentacion}/edit`)
}
LAMINAS = destino.plantilla.laminas
TITULOS = destino.plantilla.titulos
const ocultas = new Set(sinSoja ? [LAMINAS[4]] : [])

// 1. Hoja: valores y, si cambió el layout, gráficos nuevos en la misma hoja.
await escribirHoja(destino.hoja)
if (destino.layout !== LAYOUT) {
  const { charts } = await tool('google_sheets_get_charts', { spreadsheet: destino.hoja })
  if (charts.length) await tool('google_sheets_delete_charts', { spreadsheet: destino.hoja, chartIds: charts.map((c) => c.chartId), confirm: true })
  destino.graficos = await crearGraficos(destino.hoja)
  destino.layout = LAYOUT
  await fs.writeFile(DESTINO_PATH, JSON.stringify(destino, null, 2), 'utf8')
  console.log(`Hoja: layout ${LAYOUT}, ${Object.keys(destino.graficos).length} gráficos creados.`)
}
{
  // Tamaño de cada gráfico = proporción de su recuadro (Slides la respeta); 1,4 px por pt
  // deja la letra legible al encajarlo.
  const meta = await tool('google_sheets_get_metadata', { spreadsheet: destino.hoja })
  const idTab = new Map(meta.sheets.map((x) => [x.title, x.sheetId]))
  await tool('google_sheets_batch_update', {
    spreadsheet: destino.hoja,
    requests: GRAFICOS.map((g, i) => ({
      updateEmbeddedObjectPosition: {
        objectId: destino.graficos[g.key],
        newPosition: {
          overlayPosition: {
            anchorCell: { sheetId: idTab.get(g.tab), rowIndex: 1 + (i % 4) * 16, columnIndex: 14 },
            widthPixels: Math.round(UBICACION[g.key][1][2] * 1.4),
            heightPixels: Math.round(UBICACION[g.key][1][3] * 1.4),
          },
        },
        fields: 'anchorCell,widthPixels,heightPixels',
      },
    })),
  })
  // Curvas más bajas que las del semanal: el techo del eje necesita más aire para que Sheets
  // dibuje la cifra del pico (si no entra, la oculta).
  const maximos = Object.fromEntries(HORARIOS.map((h) => [h.titulo, Math.max(0, ...h.valores) * 1.3]))
  const estilo = await estiloGraficosHoja({ tool, hoja: destino.hoja, maximos })
  console.log(`Hoja: valores escritos · ${estilo.actualizados} gráficos con estilo actualizado.`)
}

// 2. Láminas: se borra lo que no es del semanal (logos y título) y se redibuja.
const pres = await tool('google_slides_get_presentation', { presentation: destino.presentacion })
const porId = new Map(pres.slides.map((s) => [s.objectId, s]))
const borrar = LAMINAS.flatMap((id) => {
  const quedan = new Set(destino.plantilla.conservar[id] ?? [])
  return (porId.get(id)?.elements ?? []).filter((e) => !quedan.has(e.objectId)).map((e) => ({ deleteObject: { objectId: e.objectId } }))
})
const pedidos = [...borrar, ...portada(destino.plantilla)]
for (const g of GRAFICOS) {
  const [n, [x, y, w, h]] = UBICACION[g.key]
  if (ocultas.has(LAMINAS[n - 1])) continue
  pedidos.push({
    createSheetsChart: {
      objectId: `dg_${g.key}`,
      spreadsheetId: destino.hoja,
      chartId: destino.graficos[g.key],
      linkingMode: 'LINKED',
      elementProperties: colocar(LAMINAS[n - 1], x * PT, y * PT, w * PT, h * PT),
    },
  })
}
pedidos.push(...construir().flat())
pedidos.push(
  ...LAMINAS.map((objectId) => ({ updateSlideProperties: { objectId, slideProperties: { isSkipped: ocultas.has(objectId) }, fields: 'isSkipped' } })),
)
for (let i = 0; i < pedidos.length; i += 400) {
  await tool('google_slides_batch_update', { presentation: destino.presentacion, confirm: true, requests: pedidos.slice(i, i + 400) })
}
console.log(`Presentación: portada + ${LAMINAS.length - ocultas.size} láminas${ocultas.size ? ` (${ocultas.size} oculta sin datos)` : ''}.`)

// 3. Copia fechada del día (foto que no cambia).
const publicacion = {
  presentacion: `https://docs.google.com/presentation/d/${destino.presentacion}/edit`,
  hoja: `https://docs.google.com/spreadsheets/d/${destino.hoja}/edit`,
  copia: null,
}
if (!args.includes('--sin-copia')) {
  const nombre = `Informe diario ${fechaPortada}`
  const copias = path.join(path.dirname(revDir), 'copia.json')
  const previa = await leerJson(copias)
  // No se borra la copia anterior: si el día se rehace, la nueva lleva la revisión en el nombre.
  const c = await tool('google_slides_duplicate_presentation', {
    presentation: destino.presentacion,
    name: previa?.id ? `${nombre} (rev. ${control.revision})` : nombre,
  })
  publicacion.copia = c.url
  if (!previa?.id) await fs.writeFile(copias, JSON.stringify({ id: c.id, url: c.url, revision: control.revision }, null, 2), 'utf8')
  console.log(`Copia del día: ${publicacion.copia}`)
}
await fs.writeFile(path.join(revDir, 'publicacion.json'), JSON.stringify(publicacion, null, 2), 'utf8')
console.log(`\n${publicacion.presentacion}`)
