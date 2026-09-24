/**
 * Actualiza EL informe de logística en Google (una sola versión, siempre la misma).
 *
 * ## Por qué existe
 *
 * Volver a subir el PPTX crea un archivo nuevo cada vez: el Drive se llena de copias y,
 * peor, se pierde todo el trabajo hecho sobre la versión anterior — el diseño de los
 * gráficos, que vive en la hoja de cálculo y no en el código. Este script actualiza en el
 * lugar: escribe los valores nuevos en la hoja y los textos nuevos en la presentación.
 * Los gráficos, al estar vinculados a la hoja, se actualizan solos y conservan su formato.
 *
 * ## Qué toca y qué no
 *
 * - Hoja: solo las celdas de datos (columna C de cada bloque) y la pestaña de pivote.
 *   Nunca borra pestañas, así que ningún gráfico ni su diseño se pierde.
 * - Presentación: solo los cuadros de texto con etiqueta en `vinculos.json`.
 * - No sube ningún archivo ni crea nada en Drive.
 *
 * ## El layout del pivote se lee, no se impone
 *
 * Cada gráfico apunta a un rango concreto (`'Graficos pivote'!B12:B17`). Si el script armara
 * el pivote a su manera, un bloque de distinto tamaño correría todas las filas de abajo y
 * cada gráfico terminaría leyendo los valores de otro, en silencio. Por eso el script LEE la
 * pestaña, ubica cada bloque por su encabezado (`D35_G1 · …`) y escribe los valores en esas
 * mismas filas, emparejando por categoría.
 *
 * Consecuencia: un gráfico que no tenga bloque en la hoja no se actualiza y se informa. Para
 * agregarlo hay que crear su gráfico en la hoja, no cambiar este script.
 *
 * ## Uso
 *
 *   node scripts/sync-informe-slides.mjs <ruta-al-paquete.json> [--comite AAAA-MM-DD] [--dry]
 *
 * `--comite` es la fecha de la reunión, que va en la portada. No sale del paquete (el paquete
 * sabe del período, no de cuándo se presenta), así que se pasa a mano. Sin el flag, la
 * portada no se toca.
 *
 * La presentación y la hoja se configuran abajo, en DESTINO.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {
  aplicarExclusiones,
  buildReportWorkbook,
  playaOsl,
  TRAMO_PLAYA_OSL,
} from '../server/logisticsReport/reportWorkbook.mjs'
import XLSX from 'xlsx'

/** El informe vivo. Estos dos IDs no deben cambiar: son LA versión. */
const DESTINO = {
  presentacion: '1fSx_fDqJS-1QXAlzNkLSp7laxnwW2T4n0C2dYpaRI_g',
  hoja: '1uJVuWi1tk0fV5CrtoOFYVGwDdhAWZN7GfYNO4bWzigo',
  pestanaPivote: 'Graficos pivote',
}

const RAIZ = path.resolve(import.meta.dirname, '..')
const PLANTILLA = path.join(RAIZ, 'reportes', 'logistica', 'prueba_manual', 'Datos_MANUAL.xlsx')
const VINCULOS = path.join(RAIZ, 'reportes', 'logistica', 'prueba_manual', 'vinculos.json')
// Estilo de cada texto conectado, sacado de la plantilla (`scripts/extract-text-styles.py`).
const ESTILOS = path.join(RAIZ, 'reportes', 'logistica', 'prueba_manual', 'estilos_textos.json')
const MCP = process.env.MCP_BASE ?? 'http://127.0.0.1:8790/mcp'

// —— Cliente MCP mínimo (Streamable HTTP) ——————————————————————————————

let sesion = null
let siguienteId = 1

async function rpc(method, params) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (sesion) headers['mcp-session-id'] = sesion
  const res = await fetch(MCP, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: siguienteId++, method, params }),
  })
  const nueva = res.headers.get('mcp-session-id')
  if (nueva) sesion = nueva
  const texto = await res.text()
  const linea = texto.split('\n').find((l) => l.startsWith('data:'))
  if (!linea) throw new Error(`Respuesta inesperada del MCP: ${texto.slice(0, 200)}`)
  return JSON.parse(linea.slice(5))
}

async function conectar() {
  await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'sync-informe-slides', version: '1' },
  })
  await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-session-id': sesion,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })
}

async function tool(nombre, args) {
  const r = await rpc('tools/call', { name: nombre, arguments: args })
  const texto = r.result?.content?.[0]?.text
  if (texto === undefined) throw new Error(`${nombre}: ${JSON.stringify(r).slice(0, 300)}`)
  const datos = JSON.parse(texto)
  if (datos.error) throw new Error(`${nombre}: ${datos.error.code} ${datos.error.message}`)
  return datos
}

// —— Armado de los valores ————————————————————————————————————————————

/** `Hoja!A1:C9` con la pestaña citada si su nombre lo necesita. */
function rangoA1(hoja, celdas) {
  const tab = /^[A-Za-z_][A-Za-z0-9_]*$/.test(hoja) ? hoja : `'${hoja.replace(/'/g, "''")}'`
  return `${tab}!${celdas}`
}

/**
 * Formato largo (`categoría | serie | valor`) a formato ancho, que es lo que necesita un
 * gráfico de Sheets con más de una serie.
 */
function pivotar(filas) {
  const categorias = [...new Set(filas.map((f) => String(f[0])))]
  const series = [...new Set(filas.map((f) => String(f[1])))]
  const indice = new Map(filas.map((f) => [`${f[0]}\u0000${f[1]}`, f[2]]))
  const cuerpo = categorias.map((c) => [
    c,
    ...series.map((s) => {
      const v = indice.get(`${c}\u0000${s}`)
      return v === undefined || v === null || v === '' ? null : v
    }),
  ])
  return { series, cuerpo }
}

/**
 * Ubica en la pestaña de pivote el bloque de cada gráfico, tal como está hoy.
 *
 * Un bloque es un encabezado `D35_G1 · Título` seguido de sus filas de categorías, hasta la
 * primera fila vacía. Las columnas B en adelante del encabezado son los nombres de las series.
 */
function leerLayout(filas) {
  const bloques = new Map()
  for (let i = 0; i < filas.length; i++) {
    const a = String(filas[i]?.[0] ?? '')
    const m = a.match(/^(D\d\d_G\d)\s+·/)
    if (!m) continue
    // Las series son las columnas CONTIGUAS desde B. Un rótulo suelto más a la derecha
    // (ChatGPT dejó «GIRASOL» en la columna G del encabezado de D31_G2) es decoración, no una
    // serie: tomarlo haría escribir datos en esa columna.
    const series = []
    for (const v of (filas[i] ?? []).slice(1)) {
      if (v === null || v === undefined || v === '') break
      series.push(v)
    }
    const categorias = []
    for (let j = i + 1; j < filas.length; j++) {
      const cat = filas[j]?.[0]
      if (cat === null || cat === undefined || cat === '') break
      if (/^D\d\d_G\d\s+·/.test(String(cat))) break
      categorias.push({ fila: j + 1, nombre: String(cat) })
    }
    bloques.set(m[1], { series: series.map(String), categorias })
  }
  return bloques
}

/**
 * Láminas que muestran un solo día, por nombre de día de la semana.
 *
 * Cuando ese día no está en el período (el miércoles de una semana en curso) la lámina no
 * tiene nada que mostrar: sus gráficos salen en 0 con el eje colapsado y sus cifras en `s/d`.
 * Se oculta en la presentación (no se borra) y vuelve a mostrarse sola cuando el día exista.
 */
const LAMINAS_POR_DIA = {
  Jueves: [8, 36, 37, 59, 60],
  Viernes: [9, 38, 39, 61, 62],
  Sábado: [10, 40, 41, 63, 64],
  Domingo: [11, 42, 43, 65, 66],
  Lunes: [12, 23, 44, 45, 67, 68],
  Martes: [13, 24, 46, 47, 69, 70],
  Miércoles: [14, 48, 49, 71, 72],
}
const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_SEMANA = ['Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes', 'Miércoles']

/**
 * Gráficos de actividad horaria: los recuadros que antes quedaban vacíos «para captura».
 *
 * No pasan por la plantilla Excel (nunca tuvieron filas ahí): salen directo de la serie
 * `porHora` del paquete, que es la misma curva que dibuja el panel de actividad del dashboard.
 *
 * Cada bloque tiene tamaño FIJO —24 filas para un día, 7×24 para una semana— así que su
 * posición en la pestaña no depende de los datos de la corrida y los gráficos nunca quedan
 * leyendo filas corridas. Por eso esta pestaña sí se escribe por posición.
 */
const HORARIOS = [
  ...DIAS_SEMANA.map((dia, i) => ({
    id: `H${37 + 2 * i}`,
    slide: 37 + 2 * i,
    seccion: 'calada_ricardone',
    dia,
    titulo: `Calada Ricardone por hora · ${dia}`,
    tipo: 'COLUMN',
  })),
  { id: 'H50', slide: 50, seccion: 'calada_ricardone_liquidos', titulo: 'Calada líquidos por hora', tipo: 'AREA' },
  { id: 'H51', slide: 51, seccion: 'calada_san_lorenzo', titulo: 'Calada San Lorenzo por hora', tipo: 'AREA' },
  { id: 'H54', slide: 54, seccion: 'volcable_ricardone', titulo: 'Volcables 1/2 por hora', tipo: 'AREA' },
  { id: 'H56', slide: 56, seccion: 'silos_ricardone', titulo: 'Volcable silos por hora', tipo: 'AREA' },
  ...DIAS_SEMANA.map((dia, i) => ({
    id: `H${60 + 2 * i}`,
    slide: 60 + 2 * i,
    seccion: 'volcable_san_lorenzo',
    dia,
    titulo: `Volcables puerto por hora · ${dia}`,
    tipo: 'COLUMN',
  })),
]
const PESTANA_HORARIOS = 'Graficos horarios'
const HH = (h) => String(h).padStart(2, '0')

/** Filas `[rótulo, camiones]` de un gráfico horario, siempre del mismo largo. */
function filasHorarias(def, paquete, fechaDe) {
  const sec = paquete.actividad?.[def.seccion]
  if (def.dia) {
    // Un día: 24 horas. Una hora sin eventos en un día que ocurrió es 0 camiones: es un dato.
    const fecha = fechaDe.get(def.dia)
    const d = fecha ? sec?.porDia?.[fecha] : null
    const porHora = new Map((d?.porHora ?? []).map((p) => [p.bucket.slice(-2), p.camiones]))
    // Un día que no ocurrió va en 0, no vacío: su lámina está oculta, y una serie entera vacía
    // hace que Sheets cree el gráfico SIN serie, que queda así para siempre («Agrega una
    // serie») aunque después lleguen los datos.
    return Array.from({ length: 24 }, (_, h) => [`${HH(h)}h`, porHora.get(HH(h)) ?? 0])
  }
  // Semana: 7 días × 24 horas en el orden de la plantilla. Un día fuera del período queda
  // vacío (la curva se corta), no en 0: ese día no es «cero camiones», no existió.
  const porBucket = new Map((sec?.periodo?.porHora ?? []).map((p) => [p.bucket, p.camiones]))
  const filas = []
  for (const dia of DIAS_SEMANA) {
    const fecha = fechaDe.get(dia)
    for (let h = 0; h < 24; h++) {
      if (!fecha) {
        filas.push([`${dia.slice(0, 3)} ${HH(h)}h`, null])
        continue
      }
      const rotulo = `${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ${HH(h)}h`
      filas.push([rotulo, porBucket.get(`${fecha}T${HH(h)}`) ?? 0])
    }
  }
  return filas
}

// —— Programa ——————————————————————————————————————————————————————————

const rutaPaquete = process.argv[2]
const ensayo = process.argv.includes('--dry')
const iComite = process.argv.indexOf('--comite')
const fechaComite = iComite > 0 ? process.argv[iComite + 1] : null
if (fechaComite && !/^\d{4}-\d{2}-\d{2}$/.test(fechaComite)) {
  console.error(`--comite espera AAAA-MM-DD, llegó «${fechaComite}»`)
  process.exit(1)
}
if (!rutaPaquete) {
  console.error('Uso: node scripts/sync-informe-slides.mjs <ruta-al-paquete.json> [--dry]')
  process.exit(1)
}

/**
 * Días descartados del período, con su motivo (`reportes/logistica/<período>/exclusiones.json`).
 * Se aplican ANTES de todo, así las láminas, los gráficos y el histórico salen de la misma
 * semana corregida.
 */
async function leerExclusiones(rutaPaq) {
  const archivo = path.join(path.dirname(path.dirname(path.resolve(rutaPaq))), 'exclusiones.json')
  try {
    return JSON.parse(await fs.readFile(archivo, 'utf8'))
  } catch {
    return []
  }
}
const exclusiones = await leerExclusiones(rutaPaquete)
const paquete = aplicarExclusiones(JSON.parse(await fs.readFile(rutaPaquete, 'utf8')), exclusiones)
for (const e of exclusiones) console.log(`Excluido: ${e.producto} ${e.dia} — ${e.motivo}`)
const vinculos = JSON.parse(await fs.readFile(VINCULOS, 'utf8'))
const estilos = JSON.parse(await fs.readFile(ESTILOS, 'utf8'))
const plantilla = XLSX.readFile(PLANTILLA)

console.log(`Período: ${paquete.periodo.label} (${paquete.periodo.dayCount} días)`)

// Un paquete exportado por una versión vieja del dashboard (una pestaña que no se recargó)
// no trae la serie horaria ni los KPI por día. Publicarlo vaciaría los gráficos horarios y
// devolvería las láminas diarias a `s/d`, sin ningún error visible. Se rechaza antes de
// tocar nada.
{
  const faltan = Object.entries(paquete.actividad ?? {})
    .filter(([, s]) => !s.missing && !Array.isArray(s.periodo?.porHora))
    .map(([id]) => id)
  if (faltan.length) {
    console.error(
      `\nEl paquete no trae la serie por hora (${faltan.join(', ')}): lo exportó una versión\n` +
        'vieja del dashboard. No se escribió nada. Recargá el dashboard en el navegador, o\n' +
        'regenerá el paquete sin navegador con:\n' +
        `  npx tsx scripts/build-report-package.ts ${paquete.periodo.from}_${paquete.periodo.to}`,
    )
    process.exit(1)
  }
}

const { buffer, detalle } = await buildReportWorkbook({
  templatePath: PLANTILLA,
  vinculosPath: VINCULOS,
  pkg: paquete,
})
const libro = XLSX.read(buffer, { type: 'buffer' })
console.log(
  `Gráficos: ${detalle.graficos.completados.length} completos, ` +
    `${detalle.graficos.pendientes.length} pendientes, ` +
    `${detalle.graficos.conservados.length} históricos`,
)
console.log(`Textos: ${detalle.textos.conectados} conectados, ${detalle.textos.sinDato} s/d`)

// 1. Datos de cada gráfico en su pestaña de origen.
const rangosDatos = []
/**
 * Series históricas (D17, D31): las lleva la hoja, no la plantilla.
 *
 * La plantilla las congela en el último informe presentado; si se escribieran desde ahí en
 * cada corrida, el punto de la semana nueva se borraría. Las mantiene la etapa de histórico,
 * más abajo, que suma la semana del comité.
 */
const HISTORICOS = new Set(['D17_G1', 'D17_G2', 'D31_G1', 'D31_G2'])
for (const g of vinculos.charts) {
  if (HISTORICOS.has(g.id)) continue
  const hoja = libro.Sheets[g.sheet]
  const valores = []
  for (let r = g.start; r <= g.end; r++) valores.push([hoja?.[`C${r}`]?.v ?? null])
  rangosDatos.push({ range: rangoA1(g.sheet, `C${g.start}:C${g.end}`), values: valores })
}

// 2. Pivote: se escribe DENTRO del layout que ya tiene la hoja.
await conectar()
const pivoteActual = await tool('google_sheets_get_values', {
  spreadsheet: DESTINO.hoja,
  ranges: [rangoA1(DESTINO.pestanaPivote, 'A1:Z400')],
})
const layout = leerLayout(pivoteActual.valueRanges[0].values ?? [])
console.log(`Pivote: ${layout.size} bloques en la hoja`)

const rangosPivote = []
const sinBloque = []
for (const g of vinculos.charts) {
  if (HISTORICOS.has(g.id)) continue
  const bloque = layout.get(g.id)
  if (!bloque) {
    sinBloque.push(g.id)
    continue
  }
  const hoja = libro.Sheets[g.sheet]
  const filas = []
  for (let r = g.start; r <= g.end; r++) {
    filas.push([hoja?.[`A${r}`]?.v ?? '', hoja?.[`B${r}`]?.v ?? '', hoja?.[`C${r}`]?.v ?? null])
  }
  const { series, cuerpo } = pivotar(filas)
  const porCategoria = new Map(cuerpo.map((f) => [String(f[0]), f.slice(1)]))

  // Emparejar por nombre de categoría: si la plantilla cambiara el orden, los valores
  // siguen cayendo en su fila y no se corren en silencio.
  const valores = bloque.categorias.map((c) => {
    const fila = porCategoria.get(c.nombre)
    return bloque.series.map((nombreSerie) => {
      const idx = series.indexOf(nombreSerie)
      const v = fila && idx >= 0 ? fila[idx] : null
      return v === undefined ? null : v
    })
  })
  const primera = bloque.categorias[0]?.fila
  const ultima = bloque.categorias[bloque.categorias.length - 1]?.fila
  if (!primera) continue
  const ultimaColumna = String.fromCharCode(65 + bloque.series.length)
  rangosPivote.push({
    range: rangoA1(DESTINO.pestanaPivote, `B${primera}:${ultimaColumna}${ultima}`),
    values: valores,
  })
}
if (sinBloque.length) {
  console.log(`  sin bloque en la hoja (no se actualizan): ${sinBloque.join(', ')}`)
}

// 2b. Gráficos horarios: pestaña propia, layout fijo.
const fechaDe = new Map(
  paquete.periodo.days.map((dia) => [NOMBRES_DIA[new Date(`${dia}T00:00:00Z`).getUTCDay()], dia]),
)
const bloquesHorarios = []
{
  let fila = 3
  for (const def of HORARIOS) {
    const filas = filasHorarias(def, paquete, fechaDe)
    bloquesHorarios.push({ def, encabezado: fila, primera: fila + 1, ultima: fila + filas.length, filas })
    fila += filas.length + 2
  }
}
const rangosHorarios = [
  {
    range: rangoA1(PESTANA_HORARIOS, 'A1:A1'),
    values: [['Curvas de actividad por hora, desde el paquete del informe.']],
  },
  ...bloquesHorarios.flatMap((b) => [
    {
      range: rangoA1(PESTANA_HORARIOS, `A${b.encabezado}:B${b.encabezado}`),
      values: [[`${b.def.id} · ${b.def.titulo}`, 'Camiones']],
    },
    { range: rangoA1(PESTANA_HORARIOS, `A${b.primera}:B${b.ultima}`), values: b.filas },
  ]),
]

// 3. Textos de la presentación, por etiqueta.
const cambiosTexto = []
const textosHoja = libro.Sheets.Textos
for (const t of vinculos.texts) {
  if (!t.label || /^Objeto /.test(t.label)) continue
  const valor = textosHoja?.[t.cell]?.v
  if (valor === undefined || valor === null || valor === '') continue
  cambiosTexto.push({
    objectId: `p${t.slide}_i${t.object}`,
    texto: formatoEs(valor),
    label: t.label,
    estilo: estilos[`${t.slide}/${t.object}`],
  })
}

console.log(
  `A escribir: ${rangosDatos.length} rangos de datos, ${rangosPivote.length} bloques de pivote, ` +
    `${cambiosTexto.length} textos`,
)

if (ensayo) {
  console.log('\n--dry: no se escribió nada.')
  process.exit(0)
}


await tool('google_sheets_update_values', {
  spreadsheet: DESTINO.hoja,
  ranges: [...rangosDatos, ...rangosPivote],
})
console.log('Hoja actualizada (sin tocar gráficos ni formato).')

// —— Histórico semanal (láminas 17 y 31) y comparativo con la semana anterior (lámina 7) ——
//
// Cada informe suma un punto: la semana del comité, rotulada con su fecha (`25/09`). Las
// semanas anteriores son las ya presentadas —hasta el 18/09 son las del informe manual— y no
// se recalculan. Se guardan las últimas 14 semanas: si la semana ya está (se corre el sync
// otra vez), se pisa su valor; si no, la ventana corre un lugar.
//
// Cómo se arma cada serie desde los tramos del paquete, validado contra el informe del 18/09
// (soja: Playa 1 = 126, Playa OSL = 119, Descarga = 42 + 19 = 61; girasol: 133 y 191 + 17):
const SERIES_HISTORICAS = {
  D17_G1: {
    producto: 'soja',
    series: {
      'Playa 1': ['PREINGRESO→CALADA'],
      'Playa OSL': ['SL_INGRESO→SL_BALANZA_INGRESO'],
      Descarga: ['SL_BALANZA_INGRESO→SL_VOLCABLE', 'SL_VOLCABLE→SL_EGRESO'],
    },
  },
  D17_G2: { producto: 'soja', series: { 'Tiempo medio': 'total' } },
  D31_G1: {
    producto: 'girasol',
    series: { 'Playa 1': ['PREINGRESO→CALADA'], Descarga: ['PLAYA→VOLCABLE', 'VOLCABLE→BALANZA_EGRESO'] },
  },
  D31_G2: { producto: 'girasol', series: { Girasol: 'total' } },
}

/** Valor de una serie histórica para la semana del paquete, o null si algún tramo no se midió. */
function valorHistorico(producto, def) {
  const p = paquete.tiempos?.[producto]?.periodo
  if (!p) return null
  if (def === 'total') return typeof p.tiempoMedioMin === 'number' ? Math.round(p.tiempoMedioMin) : null
  let suma = 0
  for (const key of def) {
    // La espera en playa San Lorenzo, medida o deducida (misma regla que las láminas): si
    // no, el histórico tomaría la media de los pocos días con la cámara de ingreso andando.
    if (key === TRAMO_PLAYA_OSL) {
      const osl = playaOsl(p)
      if (!osl) return null
      suma += osl.min
      continue
    }
    const t = (p.tramos ?? []).find((x) => x.key === key)
    // Un tramo sin muestra hace la suma falsa: mejor sin punto que un punto inventado.
    if (!t || !(t.n > 0) || typeof t.mediaMin !== 'number') return null
    suma += t.mediaMin
  }
  return Math.round(suma)
}

let comparativoSoja = null
if (!fechaComite) {
  console.log('Histórico: sin --comite no se suma la semana (hace falta su fecha como rótulo).')
} else {
  const [, mm, dd] = fechaComite.split('-')
  const rotulo = `${dd}/${mm}`
  const filasPivote = pivoteActual.valueRanges[0].values ?? []
  const rangosHistorico = []
  for (const [id, def] of Object.entries(SERIES_HISTORICAS)) {
    const bloque = layout.get(id)
    if (!bloque) continue
    const actuales = bloque.categorias.map((c) => ({
      rotulo: c.nombre,
      valores: bloque.series.map((_, k) => filasPivote[c.fila - 1]?.[k + 1] ?? null),
    }))
    const nuevo = { rotulo, valores: bloque.series.map((s) => valorHistorico(def.producto, def.series[s])) }
    const ultimo = actuales[actuales.length - 1]
    const serie = ultimo?.rotulo === rotulo ? [...actuales.slice(0, -1), nuevo] : [...actuales.slice(1), nuevo]

    const primera = bloque.categorias[0].fila
    const ultimaFila = bloque.categorias[bloque.categorias.length - 1].fila
    const col = String.fromCharCode(65 + bloque.series.length)
    rangosHistorico.push({
      range: rangoA1(DESTINO.pestanaPivote, `A${primera}:${col}${ultimaFila}`),
      values: serie.map((p) => [p.rotulo, ...p.valores]),
    })
    // Espejo en la pestaña de datos, en el formato largo de la plantilla (categoría | serie | valor).
    const g = vinculos.charts.find((c) => c.id === id)
    rangosHistorico.push({
      range: rangoA1(g.sheet, `A${g.start}:C${g.end}`),
      values: serie.flatMap((p) => bloque.series.map((s, k) => [p.rotulo, s, p.valores[k]])),
    })
    if (id === 'D17_G2' && serie.length >= 2) {
      const [antes, ahora] = serie.slice(-2).map((p) => p.valores[0])
      if (typeof antes === 'number' && typeof ahora === 'number') {
        comparativoSoja = { diferencia: ahora - antes, antes, ahora, contra: serie[serie.length - 2].rotulo }
      }
    }
    console.log(`Histórico ${id}: ${rotulo} = ${nuevo.valores.map((v) => v ?? 's/d').join(' / ')}`)
  }
  await tool('google_sheets_update_values', { spreadsheet: DESTINO.hoja, ranges: rangosHistorico })
}

// La pestaña horaria se crea una sola vez; después solo se pisan sus valores.
{
  const meta = await tool('google_sheets_get_metadata', { spreadsheet: DESTINO.hoja })
  if (!meta.sheets.some((sh) => sh.title === PESTANA_HORARIOS)) {
    await tool('google_sheets_write_sheet', {
      spreadsheet: DESTINO.hoja,
      sheetTitle: PESTANA_HORARIOS,
      values: [['Curvas de actividad por hora, desde el paquete del informe.']],
    })
    console.log(`Pestaña «${PESTANA_HORARIOS}» creada.`)
  }
}
await tool('google_sheets_update_values', { spreadsheet: DESTINO.hoja, ranges: rangosHorarios })
console.log(`Horarios: ${bloquesHorarios.length} curvas escritas.`)

// Primera vez de cada curva: crear su gráfico y ponerlo donde estaba el recuadro de captura.
// Si el recuadro ya no está, el gráfico se creó en una corrida anterior: no se duplica.
{
  const capturasPorLamina = new Map()
  for (const c of vinculos.captures ?? []) {
    const id = `p${c.slide}_i${c.object}`
    capturasPorLamina.set(c.slide, [...(capturasPorLamina.get(c.slide) ?? []), id])
  }
  const presActual = await tool('google_slides_get_presentation', { presentation: DESTINO.presentacion })
  let creados = 0
  for (const b of bloquesHorarios) {
    const slide = presActual.slides[b.def.slide - 1]
    const ids = new Set((slide?.elements ?? []).map((e) => e.objectId))
    const pendientes = (capturasPorLamina.get(b.def.slide) ?? []).filter((id) => ids.has(id))
    if (!pendientes.length) continue
    // El recuadro principal es el que entra en la lámina; en la 49 hay además una tira
    // suelta del PPTX original, más ancha que la lámina, que también se saca.
    const principal = slide.elements
      .filter((e) => pendientes.includes(e.objectId) && e.box && e.box.width <= 9144000)
      .sort((a, c) => c.box.width * c.box.height - a.box.width * a.box.height)[0]
    if (!principal) continue
    const q = `'${PESTANA_HORARIOS}'`
    const chart = await tool('google_sheets_add_chart', {
      spreadsheet: DESTINO.hoja,
      chartType: b.def.tipo,
      title: b.def.titulo,
      domain: `${q}!A${b.primera}:A${b.ultima}`,
      series: [`${q}!B${b.primera}:B${b.ultima}`],
      axisTitle: 'camiones',
      legendPosition: 'NO_LEGEND',
      anchorSheetTitle: PESTANA_HORARIOS,
    })
    const box = principal.box
    await tool('google_slides_batch_update', {
      presentation: DESTINO.presentacion,
      confirm: true,
      requests: [
        {
          createSheetsChart: {
            spreadsheetId: DESTINO.hoja,
            chartId: chart.chartId,
            linkingMode: 'LINKED',
            elementProperties: {
              pageObjectId: slide.objectId,
              size: {
                width: { magnitude: box.width, unit: 'EMU' },
                height: { magnitude: box.height, unit: 'EMU' },
              },
              transform: { scaleX: 1, scaleY: 1, translateX: box.x, translateY: box.y, unit: 'EMU' },
            },
          },
        },
        ...pendientes.map((objectId) => ({ deleteObject: { objectId } })),
      ],
    })
    creados++
  }
  if (creados) console.log(`Horarios: ${creados} gráficos creados donde estaban los recuadros de captura.`)
}

/**
 * Estilo de la plantilla para un texto, como pedidos de Slides.
 *
 * Borrar e insertar texto en Slides NO conserva el formato: el texto nuevo toma el tamaño
 * que Slides decide al ajustar la caja, que en la práctica dejaba las cifras ilegibles. Por
 * eso cada escritura reaplica el estilo que la plantilla define para ese objeto
 * (`estilos_textos.json`, extraído de `Plantilla_BASE.pptx`).
 */
function pedidosDeEstilo(objectId, estilo, tamano) {
  if (!estilo) return []
  const style = {}
  const fields = []
  if (tamano ?? estilo.size) {
    style.fontSize = { magnitude: tamano ?? estilo.size, unit: 'PT' }
    fields.push('fontSize')
  }
  if (typeof estilo.bold === 'boolean') {
    style.bold = estilo.bold
    fields.push('bold')
  }
  if (estilo.color) {
    const n = parseInt(estilo.color, 16)
    style.foregroundColor = {
      opaqueColor: { rgbColor: { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 } },
    }
    fields.push('foregroundColor')
  }
  if (estilo.font) {
    style.fontFamily = estilo.font
    fields.push('fontFamily')
  }
  const pedidos = []
  if (fields.length) {
    pedidos.push({ updateTextStyle: { objectId, textRange: { type: 'ALL' }, style, fields: fields.join(',') } })
  }
  if (estilo.align) {
    pedidos.push({
      updateParagraphStyle: {
        objectId,
        textRange: { type: 'ALL' },
        style: { alignment: estilo.align },
        fields: 'alignment',
      },
    })
  }
  return pedidos
}

/**
 * Tamaño de fuente para que el texto entre en su caja sin partirse.
 *
 * PowerPoint agrandaba la caja al texto (`spAutoFit`); Slides no, y la API no permite
 * activarlo. Con el tamaño de la plantilla, «312 Min» o «139 min» se partían en dos líneas.
 * Se estima el ancho de la línea más larga y, si no entra en el ancho útil de la caja, se
 * achica la fuente lo justo. Nunca se agranda: el tamaño de la plantilla es el máximo.
 *
 * La estimación es por carácter (Inter: ~0,62 em en negrita, ~0,56 en normal), con un
 * margen: es preferible achicar un poco de más que dejar una cifra partida.
 */
function anchoNecesario(texto, estilo, tamano) {
  const em = estilo.bold ? 0.62 : 0.56
  const largo = Math.max(...String(texto).split('\n').map((l) => l.length))
  return largo * em * tamano * 12700 * 1.05
}

function tamanoQueEntra(texto, estilo, anchoCaja) {
  const base = estilo?.size
  if (!base || !anchoCaja) return base
  const util = anchoCaja - (estilo.lIns ?? 91440) - (estilo.rIns ?? 91440)
  const necesario = anchoNecesario(texto, estilo, base)
  if (necesario <= util || util <= 0) return base
  // 10 pt es el piso legible en una lámina proyectada: por debajo, mejor que la cifra se
  // parta en dos líneas a que no se pueda leer.
  return Math.max(Math.min(10, base), Math.floor(((base * util) / necesario) * 10) / 10)
}

/** Cuánto se puede ensanchar una caja como máximo, para no pisar lo que tiene al lado. */
const ENSANCHE_MAXIMO = 2.2

/**
 * Pedido para ensanchar una caja de texto hasta que su cifra entre en una línea, con el
 * tamaño de fuente de la plantilla. Es lo que hacía PowerPoint con `spAutoFit` y Slides no.
 *
 * Crece alrededor de su centro si el texto está centrado, o hacia la derecha si está
 * alineado a la izquierda, así la cifra no se corre de donde la puso el diseño. Devuelve el
 * ancho resultante, para que el tamaño de fuente se calcule sobre la caja ya ensanchada.
 *
 * Es idempotente: una caja que ya alcanza no se toca, así que correr el sync dos veces no
 * la sigue agrandando.
 */
/**
 * Espacio libre a izquierda y derecha de una caja, hasta el texto vecino más cercano que
 * comparte su franja vertical. Ensanchar más allá de eso encima la cifra con el rótulo de
 * al lado (pasaba en la lámina 7: «104 min» sobre «(1 hs 44 m)»).
 */
function espacioLibre(caja, vecinos) {
  let izquierda = caja.x
  let derecha = 9144000 - (caja.x + caja.width)
  const centro = caja.x + caja.width / 2
  for (const v of vecinos) {
    const solapaEnVertical = v.y < caja.y + caja.height && v.y + v.height > caja.y
    if (!solapaEnVertical) continue
    // Una caja que abarca de punta a punta a esta (un rótulo ancho, un fondo) no es un vecino
    // al costado: la cifra ya está adentro. Tratarla como vecino bloqueaba los dos lados.
    if (v.x <= caja.x && v.x + v.width >= caja.x + caja.width) continue
    if (v.x >= caja.x + caja.width) derecha = Math.min(derecha, v.x - (caja.x + caja.width))
    else if (v.x + v.width <= caja.x) izquierda = Math.min(izquierda, caja.x - (v.x + v.width))
    // Un vecino que ya se superpone con la caja (la plantilla trae rótulos pegados, como
    // «104 min» y «(1 hs 44 m)» en la lámina 7): no hay lugar hacia ese lado.
    else if (v.x + v.width / 2 >= centro) derecha = 0
    else izquierda = 0
  }
  return { izquierda: Math.max(0, izquierda), derecha: Math.max(0, derecha) }
}

function ensancharCaja(objectId, texto, estilo, caja, vecinos = []) {
  if (!estilo?.size || !caja?.width) return { pedidos: [], ancho: caja?.width }
  const margenes = (estilo.lIns ?? 91440) + (estilo.rIns ?? 91440)
  const necesario = anchoNecesario(texto, estilo, estilo.size) + margenes
  if (necesario <= caja.width) return { pedidos: [], ancho: caja.width }
  const libre = espacioLibre(caja, vecinos)
  // Alineada a la izquierda crece solo a la derecha. Centrada crece parejo, pero si un lado
  // está bloqueado (un rótulo pegado) usa el otro: una cifra un poco corrida se lee; una
  // achicada a 7 pt, no.
  const crecimientoPosible = estilo.align === 'START' ? libre.derecha : libre.izquierda + libre.derecha
  const ancho = Math.min(necesario, caja.width * ENSANCHE_MAXIMO, caja.width + crecimientoPosible)
  if (ancho <= caja.width) return { pedidos: [], ancho: caja.width }
  const factor = ancho / caja.width
  const crece = ancho - caja.width
  let haciaIzquierda = 0
  if (estilo.align !== 'START') {
    haciaIzquierda = Math.min(libre.izquierda, crece / 2)
    haciaIzquierda += Math.max(0, crece - haciaIzquierda - libre.derecha)
    haciaIzquierda = Math.min(haciaIzquierda, libre.izquierda)
  }
  // Pivote de la escala tal que el borde izquierdo termine en x − haciaIzquierda:
  //   x' = factor·x + (1 − factor)·pivote  ⇒  pivote = (x − haciaIzquierda − factor·x) / (1 − factor)
  const pivote = (caja.x - haciaIzquierda - factor * caja.x) / (1 - factor)
  return {
    ancho,
    pedidos: [
      {
        updatePageElementTransform: {
          objectId,
          applyMode: 'RELATIVE',
          // Escala horizontal alrededor del pivote: x' = factor·x + (1 − factor)·pivote.
          transform: { scaleX: factor, scaleY: 1, shearX: 0, shearY: 0, translateX: (1 - factor) * pivote, translateY: 0, unit: 'EMU' },
        },
      },
    ],
  }
}

/**
 * Formato de número del informe: miles con punto (`1.218`). Los textos ya armados por el
 * escritor (con coma decimal o con palabras) pasan tal cual.
 */
function formatoEs(valor) {
  return typeof valor === 'number' ? valor.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : String(valor)
}

const cajas = new Map()
/** Por objeto: las cajas de los otros textos de su misma lámina (para no pisarlos al ensanchar). */
const vecinosDe = new Map()
{
  const p = await tool('google_slides_get_presentation', { presentation: DESTINO.presentacion })
  for (const s of p.slides) {
    const textos = (s.elements ?? []).filter((e) => e.box && e.type === 'text')
    for (const e of s.elements ?? []) if (e.box) cajas.set(e.objectId, e.box)
    for (const e of textos) {
      vecinosDe.set(
        e.objectId,
        textos.filter((o) => o.objectId !== e.objectId).map((o) => o.box),
      )
    }
  }
}

// —— Distribución por circuito (láminas 5 y 28) ——
//
// El bloque de la plantilla tenía una sola fila (R7), así que un segundo circuito —R26 en
// soja, R4/R5/R6 en girasol— nunca llegaba al gráfico. Sale directo del resumen ejecutivo
// del paquete, con filas fijas (ordenado por cantidad), y el gráfico ocupa el espacio que
// quedó libre al sacar la calidad de lectura de cámaras.
{
  const PESTANA = 'Graficos circuitos'
  const FILAS = 8
  const DISTRIBUCIONES = [
    { id: 'C05', slide: 5, producto: 'SOJA', titulo: 'Distribución por circuito · Soja' },
    { id: 'C28', slide: 28, producto: 'GIRASOL', titulo: 'Distribución por circuito · Girasol' },
  ]
  // Área útil debajo del título, en EMU (lámina de 9.144.000 × 5.448.300).
  const AREA = { x: 700000, y: 950000, width: 7750000, height: 4050000 }

  const meta = await tool('google_sheets_get_metadata', { spreadsheet: DESTINO.hoja })
  if (!meta.sheets.some((sh) => sh.title === PESTANA)) {
    await tool('google_sheets_write_sheet', {
      spreadsheet: DESTINO.hoja,
      sheetTitle: PESTANA,
      values: [['Circuitos por producto, desde el resumen ejecutivo del paquete.']],
    })
  }
  // Lo que marca «ya creado» es el gráfico en la pestaña, no el encabezado: si una corrida
  // escribió el bloque y falló al crear el gráfico, la siguiente tiene que volver a intentarlo.
  const titulosExistentes = new Set(
    (meta.sheets.find((sh) => sh.title === PESTANA)?.charts ?? []).map((c) => c.title),
  )

  const rangos = []
  const nuevos = []
  DISTRIBUCIONES.forEach((d, i) => {
    const encabezado = 3 + i * (FILAS + 2)
    const circuitos = [...(paquete.ejecutivo?.circuitosPorProducto?.[d.producto] ?? [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, FILAS)
    const filas = Array.from({ length: FILAS }, (_, k) =>
      circuitos[k] ? [circuitos[k].label, circuitos[k].count] : [null, null],
    )
    const cabecera = `${d.id} · ${d.titulo}`
    rangos.push({ range: rangoA1(PESTANA, `A${encabezado}:B${encabezado}`), values: [[cabecera, 'Recorridos']] })
    rangos.push({ range: rangoA1(PESTANA, `A${encabezado + 1}:B${encabezado + FILAS}`), values: filas })
    if (!titulosExistentes.has(d.titulo)) nuevos.push({ ...d, encabezado, usadas: circuitos.length })
  })
  await tool('google_sheets_update_values', { spreadsheet: DESTINO.hoja, ranges: rangos })

  if (nuevos.length) {
    const p = await tool('google_slides_get_presentation', { presentation: DESTINO.presentacion })
    const q = `'${PESTANA}'`
    for (const d of nuevos) {
      const slide = p.slides[d.slide - 1]
      const chart = await tool('google_sheets_add_chart', {
        spreadsheet: DESTINO.hoja,
        chartType: 'BAR',
        title: d.titulo,
        domain: `${q}!A${d.encabezado + 1}:A${d.encabezado + FILAS}`,
        series: [`${q}!B${d.encabezado + 1}:B${d.encabezado + FILAS}`],
        axisTitle: 'recorridos',
        legendPosition: 'NO_LEGEND',
        anchorSheetTitle: PESTANA,
      })
      // El gráfico viejo (una sola barra) se reemplaza por el nuevo.
      const viejos = (slide.elements ?? []).filter((e) => e.type === 'chart').map((e) => e.objectId)
      await tool('google_slides_batch_update', {
        presentation: DESTINO.presentacion,
        confirm: true,
        requests: [
          {
            createSheetsChart: {
              spreadsheetId: DESTINO.hoja,
              chartId: chart.chartId,
              linkingMode: 'LINKED',
              elementProperties: {
                pageObjectId: slide.objectId,
                size: {
                  width: { magnitude: AREA.width, unit: 'EMU' },
                  height: { magnitude: AREA.height, unit: 'EMU' },
                },
                transform: { scaleX: 1, scaleY: 1, translateX: AREA.x, translateY: AREA.y, unit: 'EMU' },
              },
            },
          },
          ...viejos.map((objectId) => ({ deleteObject: { objectId } })),
        ],
      })
      console.log(`Circuitos: lámina ${d.slide} con ${d.usadas} circuitos (antes 1).`)
    }
  }
}

// Los textos van de a tandas: un batchUpdate por cada 40 para no armar un pedido gigante.
let escritos = 0
for (let i = 0; i < cambiosTexto.length; i += 40) {
  const tanda = cambiosTexto.slice(i, i + 40)
  const requests = tanda.flatMap((c) => {
    // Primero se ensancha la caja; solo si aun así no entra, se achica la fuente.
    const { pedidos: ensanche, ancho } = ensancharCaja(
      c.objectId,
      c.texto,
      c.estilo,
      cajas.get(c.objectId),
      vecinosDe.get(c.objectId),
    )
    return [
      { deleteText: { objectId: c.objectId, textRange: { type: 'ALL' } } },
      { insertText: { objectId: c.objectId, text: c.texto, insertionIndex: 0 } },
      ...ensanche,
      ...pedidosDeEstilo(c.objectId, c.estilo, tamanoQueEntra(c.texto, c.estilo, ancho)),
    ]
  })
  try {
    await tool('google_slides_batch_update', {
      presentation: DESTINO.presentacion,
      confirm: true,
      requests,
    })
    escritos += tanda.length
  } catch (err) {
    console.log(`  ⚠ tanda ${i / 40 + 1}: ${err.message}`)
  }
}
console.log(`Presentación: ${escritos}/${cambiosTexto.length} textos actualizados.`)

// Comparativo con la semana anterior (lámina 7): sale del histórico, no del paquete.
// Más minutos es peor, así que una suba va en el rojo de la plantilla y una baja en verde.
{
  const objectId = 'p7_i291'
  const estilo = estilos['7/291']
  if (comparativoSoja) {
    const d = comparativoSoja.diferencia
    const texto = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0'
    const color = d > 0 ? estilo?.color : '2E7D32'
    await tool('google_slides_batch_update', {
      presentation: DESTINO.presentacion,
      confirm: true,
      requests: [
        { deleteText: { objectId, textRange: { type: 'ALL' } } },
        { insertText: { objectId, text: texto, insertionIndex: 0 } },
        ...pedidosDeEstilo(objectId, { ...estilo, color }),
      ],
    })
    console.log(
      `Comparativo soja: ${texto} min (${comparativoSoja.ahora} vs ${comparativoSoja.antes} del ${comparativoSoja.contra}).`,
    )
  } else {
    console.log('Comparativo soja: sin dato (falta --comite o la semana no tiene tiempo medio).')
  }
}

// 4. Portada: fecha del comité, si se indicó.
if (fechaComite) {
  const [a, m, d] = fechaComite.split('-')
  await tool('google_slides_batch_update', {
    presentation: DESTINO.presentacion,
    confirm: true,
    requests: [
      { deleteText: { objectId: 'p1_i64', textRange: { type: 'ALL' } } },
      { insertText: { objectId: 'p1_i64', text: `${d}-${m}-${a}`, insertionIndex: 0 } },
    ],
  })
  console.log(`Portada: comité del ${d}-${m}-${a}.`)
}

// 5. Mostrar solo las láminas de los días que ocurrieron.
const diasEnPeriodo = new Set(
  paquete.periodo.days.map((dia) => NOMBRES_DIA[new Date(`${dia}T00:00:00Z`).getUTCDay()]),
)
const visibilidad = []
for (const [dia, laminas] of Object.entries(LAMINAS_POR_DIA)) {
  for (const n of laminas) visibilidad.push({ n, ocultar: !diasEnPeriodo.has(dia) })
}
{
  const actual = await tool('google_slides_get_presentation', { presentation: DESTINO.presentacion })
  const requests = visibilidad
    .filter((v) => actual.slides[v.n - 1])
    .map((v) => ({
      updateSlideProperties: {
        objectId: actual.slides[v.n - 1].objectId,
        slideProperties: { isSkipped: v.ocultar },
        fields: 'isSkipped',
      },
    }))
  await tool('google_slides_batch_update', { presentation: DESTINO.presentacion, requests })
  const ocultas = visibilidad.filter((v) => v.ocultar).map((v) => v.n)
  console.log(
    ocultas.length
      ? `Láminas ocultas (día fuera del período): ${ocultas.join(', ')}.`
      : 'Todas las láminas por día visibles.',
  )
}

// 6. Refrescar los gráficos vinculados.
//
// Un gráfico LINKED de Slides NO se actualiza solo cuando cambia la hoja: guarda una copia
// del render y muestra un botón «Actualizar» hasta que alguien lo aprieta. Sin este paso la
// hoja quedaría al día y la presentación seguiría mostrando los gráficos de la semana
// anterior, que es exactamente el error que este script existe para evitar.
const pres = await tool('google_slides_get_presentation', { presentation: DESTINO.presentacion })
const graficos = []
for (const s of pres.slides) {
  for (const e of s.elements ?? []) {
    if (e.type === 'chart' && e.chart?.spreadsheetId === DESTINO.hoja) graficos.push(e.objectId)
  }
}
let refrescados = 0
for (let i = 0; i < graficos.length; i += 20) {
  const tanda = graficos.slice(i, i + 20)
  try {
    await tool('google_slides_batch_update', {
      presentation: DESTINO.presentacion,
      requests: tanda.map((objectId) => ({ refreshSheetsChart: { objectId } })),
    })
    refrescados += tanda.length
  } catch (err) {
    console.log(`  ⚠ refresco tanda ${i / 20 + 1}: ${err.message}`)
  }
}
console.log(`Gráficos: ${refrescados}/${graficos.length} refrescados desde la hoja.`)

console.log(`\nhttps://docs.google.com/presentation/d/${DESTINO.presentacion}/edit`)
console.log(`https://docs.google.com/spreadsheets/d/${DESTINO.hoja}/edit`)
