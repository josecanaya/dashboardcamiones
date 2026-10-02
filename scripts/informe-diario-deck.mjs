/**
 * Informe DIARIO como presentación de Claude (tipo Slides), con la estética de «Estado de planta».
 *
 * Solo Nodo Sur: Ricardone y el puerto de San Lorenzo, con los circuitos y sectores que se
 * vienen trabajando. Cuatro láminas y tono de relato: del semanal se toma la estética y la
 * forma de narrar, no la estructura. Parte del
 * Excel de Movimientos filtrado a esas dos plantas y lo completa con la corrida del dashboard.
 * No muestra nada sobre la calidad de lectura de cámaras: si una métrica no se puede publicar,
 * no aparece.
 *
 * Escribe los archivos del deck (`project/deck.json` + `project/slides/*.html`) en una carpeta;
 * la publicación la hace Claude con la herramienta de artefactos (ver
 * `docs/INFORME_LOGISTICA_DIARIO.md`).
 *
 * Uso:
 *   node scripts/informe-diario-deck.mjs <revisionDir> <carpetaSalida> <assets.json>
 *
 * `assets.json`: `{ "nva": "/_blob/…", "bimtrazer": "/_blob/…", "nvaChico": "/_blob/…",
 * "bimtrazerOscuro": "/_blob/…" }`, los logos ya copiados al artefacto del día.
 */
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { aplicarExclusiones, slCorregido } from '../server/logisticsReport/reportWorkbook.mjs'
import { diaLargo, hm, minutosTramo, n0, TRAMOS_SOJA, variacion, MIN_HISTORIAL } from './informe-diario-conclusiones.mjs'

const [revDir, salida, assetsPath] = process.argv.slice(2)
if (!revDir || !salida || !assetsPath || !existsSync(path.join(revDir, 'diario.json'))) {
  console.error('Uso: node scripts/informe-diario-deck.mjs <revisionDir> <carpetaSalida> <assets.json>')
  process.exit(1)
}
const RAIZ = path.resolve(import.meta.dirname, '..')
const DIARIO = path.join(RAIZ, 'reportes', 'logistica', 'diario')
const leer = async (p, def = null) => {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8'))
  } catch {
    return def
  }
}
async function revision(dir) {
  const exclusiones = await leer(path.join(path.dirname(dir), 'exclusiones.json'), [])
  return {
    paquete: aplicarExclusiones(await leer(path.join(dir, 'paquete.json')), exclusiones),
    diario: await leer(path.join(dir, 'diario.json')),
    control: await leer(path.join(dir, 'control.json')),
  }
}
const { paquete, diario } = await revision(revDir)
const A = await leer(assetsPath)
const dia = diario.dia
const mov = diario.movimientosNodoSur ?? diario.movimientos
if (!diario.movimientosNodoSur) console.warn('Revisión sin corte Nodo Sur: usa todas las plantas. Regenerarla.')

// —— Historial (días anteriores con Excel) ———————————————————————————————————

const shift = (d, k) => {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + k)
  return t.toISOString().slice(0, 10)
}
const historial = []
for (let k = 1; k <= 7; k++) {
  const ultima = (await fs.readFile(path.join(DIARIO, shift(dia, -k), 'ULTIMA.txt'), 'utf8').catch(() => '')).trim()
  if (!ultima || !existsSync(path.join(ultima, 'diario.json'))) continue
  const r = await revision(ultima)
  if ((r.control?.advertencias ?? []).some((a) => /^movimientos\.(falta_excel|sin_filas)$/.test(a.id))) continue
  const m = r.diario.movimientosNodoSur
  const s = r.paquete.tiempos?.soja
  historial.push({
    camiones: m?.total ?? null,
    toneladas: m?.kgNetos ? m.kgNetos / 1000 : null,
    r7: s?.doorToDoorPublishable ? s.periodo?.tiempoMedioMin : null,
    calada: r.paquete.actividad?.calada_ricardone?.missing ? null : r.paquete.actividad?.calada_ricardone?.periodo?.camiones,
    volcSl: r.paquete.actividad?.volcable_san_lorenzo?.missing ? null : r.paquete.actividad?.volcable_san_lorenzo?.periodo?.camiones,
  })
}
const vs = (valor, clave) => variacion(valor, historial, (h) => h[clave])

// —— Estética «Estado de planta» ——————————————————————————————————————————————

const C = {
  verde: '#0B5638',
  verdeMedio: '#3A8F63',
  verdeClaro: '#9CCBAE',
  verdeTenue: '#DCEDE1',
  fondoAlt: '#EAF2EC',
  fondo: '#F5F8F4',
  tarjeta: '#FCFDFB',
  borde: '#D3E2D7',
  tinta: '#14281E',
  texto: '#4A5D52',
  violeta: '#6B55A3',
  violetaOscuro: '#2E1B4E',
  claro: '#F1F6F2',
  claroTexto: '#D6E4DA',
  claroTenue: '#C9D8CE',
}
const FUENTE = "font-family:'IBM Plex Sans', Arial, sans-serif"
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** `**negrita**` → `<b>`, con el resto escapado. */
const rico = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
const fechaCorta = `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaLarga = (() => {
  const d = diaLargo(dia).split(' ')[0]
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} ${Number(dia.slice(8, 10))} de ${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`
})()

let pagina = 1
const slides = []

function seccion(id, contenido, { fondo = C.fondo, notas = '' } = {}) {
  slides.push({
    id,
    html: `<section id="${id}" data-transition="fade" style="background:${fondo}; color:${C.tinta}; ${FUENTE}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px">${contenido}${notas ? `<aside>${esc(notas)}</aside>` : ''}</section>`,
  })
}

function pie() {
  pagina++
  return (
    `<img src="${A.nvaChico}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">` +
    `<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:${C.texto}">Estado de planta · Nodo Sur · ${fechaCorta} · ${pagina}</p>` +
    `<img src="${A.bimtrazerOscuro}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">`
  )
}

function encabezado(pill, titulo, colorPill = C.verde) {
  return `<div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:${C.claro}; background:${colorPill}; padding:6px 18px; border-radius:999px">${esc(pill)}</p></div><h2 style="font-size:64px; font-weight:600; line-height:1.1; color:${C.tinta}">${esc(titulo)}</h2></div>`
}

/** Tarjeta de cifra con franja superior de color. */
function tarjeta(etiqueta, valor, nota, acento = C.verdeMedio, colorValor = C.verde) {
  return `<div style="display:flex; flex-direction:column; gap:8px; background:${C.tarjeta}; border:1px solid ${C.borde}; border-top:8px solid ${acento}; border-radius:16px; padding:28px 32px"><p style="font-size:24px; font-weight:600; color:${C.texto}; text-transform:uppercase; letter-spacing:1px">${esc(etiqueta)}</p><p style="font-size:64px; font-weight:600; line-height:1.05; color:${colorValor}">${esc(valor)}</p>${nota ? `<p style="font-size:26px; line-height:1.35; color:${C.texto}">${rico(nota)}</p>` : ''}</div>`
}

/** Fila de tarjeta con borde izquierdo (como «Ocupación semanal»). */
function fila(titulo, detalle, cifra, acento = C.verde) {
  return `<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:${C.tarjeta}; border:1px solid ${C.borde}; border-left:10px solid ${acento}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:${C.tinta}">${esc(titulo)}</p>${detalle ? `<p style="font-size:24px; color:${C.texto}">${esc(detalle)}</p>` : ''}</div><p style="font-size:44px; font-weight:600; color:${acento}; white-space:nowrap">${esc(cifra)}</p></div>`
}

const remate = (t) => `<p style="font-size:26px; line-height:1.4; color:${C.verde}; font-weight:600; border-left:6px solid ${C.verdeMedio}; padding:4px 0px 4px 20px">${rico(t)}</p>`

/** Barras horizontales: las dos mayores en verde, las del medio claras, las chicas tenues. */
function barras(items, { ancho = 560, rotulo = 160 } = {}) {
  const max = Math.max(1, ...items.map((x) => x.n))
  const orden = [...items].sort((a, b) => b.n - a.n)
  const tono = (x) => {
    const r = orden.indexOf(x)
    return r < 2 && x.n > 0 ? C.verde : x.n >= max * 0.2 ? C.verdeClaro : C.verdeTenue
  }
  return `<div style="display:flex; flex-direction:column; gap:20px">${items
    .map(
      (x) =>
        `<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:${rotulo}px; font-size:28px; font-weight:600; color:${C.tinta}">${esc(x.label)}</p><div style="width:${Math.max(8, Math.round((x.n / max) * ancho))}px; height:48px; background:${tono(x)}; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:${C.tinta}; white-space:nowrap">${n0(x.n)}</p></div>`,
    )
    .join('')}</div>`
}

const pico = (valores) => {
  let i
  valores.forEach((v, k) => {
    if (v > 0 && (i === undefined || v > valores[i])) i = k
  })
  return i
}
const hh = (i) => `${String(i).padStart(2, '0')} h`
const deltaTexto = (v, unidad = '') =>
  v ? (Math.abs(v.pct) < 5 ? 'en línea con el promedio' : `${v.pct > 0 ? '+' : '−'}${Math.abs(v.pct)} % vs. promedio (${n0(v.media)}${unidad})`) : ''

// —— Datos del día ————————————————————————————————————————————————————————

const act = (id) => (paquete.actividad?.[id]?.missing ? null : paquete.actividad?.[id]?.periodo ?? null)
const calada = act('calada_ricardone')
const caladaLiq = act('calada_ricardone_liquidos')
const caladaSl = act('calada_san_lorenzo')
const volcSl = act('volcable_san_lorenzo')
const volcRic = act('volcable_ricardone')
const silos = act('silos_ricardone')
const circuito = (code) => (paquete.ejecutivo?.circuitosTotales ?? []).find((c) => c.code === code)?.count ?? 0
const soja = paquete.tiempos?.soja
const r7 = soja?.doorToDoorPublishable && typeof soja.periodo?.tiempoMedioMin === 'number' ? soja.periodo : null
const r7Plantas = soja?.plantsPublishable ? soja.periodo : null
const picoLabel = (s) => String(s?.picoLabel ?? '').match(/(\d{2})h/)?.[1]
const calleDe = (camara) => {
  const m = String(camara).match(/(\d+)\s*$/)
  return m ? `Calle ${Number(m[1])}` : camara
}

// —— Láminas ——————————————————————————————————————————————————————————————
//
// El diario es corto y conversado: cuatro láminas, títulos que cuentan (no que sentencian),
// pocas etiquetas. Toma del semanal la estética y la forma de narrar, no su estructura.

const momento = (h) => (h < 6 ? 'de madrugada' : h < 12 ? 'a la mañana' : h < 19 ? 'a la tarde' : 'a la noche')
const nombreProd = { SOJA: 'la soja', GIRASOL: 'el girasol', MAIZ: 'el maíz', ACEITE: 'los líquidos', PELLET: 'el pellet', OTROS: 'otros productos' }
const fraccion = (p) => (p >= 45 && p <= 55 ? 'la mitad' : p >= 30 && p <= 36 ? 'un tercio' : p >= 60 && p <= 70 ? 'dos tercios' : `el ${p} %`)

/** Título grande sin píldora: lo que se cuenta es la frase, no el rótulo. */
const titulo = (t) => `<h2 style="font-size:64px; font-weight:600; line-height:1.1; color:${C.tinta}; width:1500px">${esc(t)}</h2>`
const parrafo = (t) => `<p style="font-size:32px; line-height:1.45; color:${C.texto}; width:1400px">${rico(t)}</p>`
/** Cifra grande con una línea chica debajo, sin caja. */
const cifra = (valor, texto, color = C.verde) =>
  `<div style="flex:1; display:flex; flex-direction:column; gap:6px; border-top:6px solid ${color}; padding:24px 0px 0px 0px"><p style="font-size:88px; font-weight:600; line-height:1; color:${color}">${esc(valor)}</p><p style="font-size:28px; color:${C.texto}">${esc(texto)}</p></div>`

// 1. Portada.
slides.push({
  id: 'portada',
  html: `<section id="portada" data-transition="fade" style="background:${C.verde}; color:${C.claro}; ${FUENTE}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:28px"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, #0B5638 0%, #0E4A33 55%, #2E1B4E 100%)"></div><img src="${A.nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:112px; width:280px; height:150px; object-fit:contain"><img src="${A.bimtrazer}" alt="Bimtrazer" style="position:absolute; left:1560px; top:128px; width:232px; height:110px; object-fit:contain"><div style="flex:1"></div><p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:${C.verdeClaro}">Nodo Sur · Ricardone y San Lorenzo</p><h1 style="font-size:120px; font-weight:600; line-height:1.05; color:${C.claro}">El día en planta</h1><p style="font-size:40px; line-height:1.3; color:${C.claroTexto}">${esc(fechaLarga)}</p><div style="width:160px; height:8px; background:${C.verdeClaro}; border-radius:4px"></div><aside>Informe diario del Nodo Sur: Excel de Movimientos de Ricardone y Terminal San Lorenzo, completado con la corrida del dashboard.</aside></section>`,
})

// 2. Cómo fue el día.
{
  const vCam = vs(mov.total, 'camiones')
  const tono =
    vCam && vCam.pct >= 15 ? 'Un día con más movimiento que de costumbre' : vCam && vCam.pct <= -15 ? 'Un día más tranquilo que de costumbre' : 'Un día de ritmo habitual'
  const [prodTop] = Object.entries(mov.kgPorProducto ?? {}).sort((a, b) => b[1] - a[1])
  const pctTop = prodTop && mov.kgNetos ? Math.round((prodTop[1] / mov.kgNetos) * 100) : null
  const pi = pico(mov.ingresosPorHora ?? [])
  const ps = pico(mov.salidasPorHora ?? [])
  const frases = [
    `Entraron **${n0(mov.ingresos)}** camiones y salieron **${n0(mov.egresos)}**${prodTop ? `; ${nombreProd[prodTop[0]] ?? prodTop[0]} fue ${fraccion(pctTop)} de lo que se movió` : ''}.`,
    pi !== undefined && ps !== undefined
      ? `Los ingresos se concentraron ${momento(pi)} (pico a las ${hh(pi)}) y las salidas ${momento(ps) === momento(pi) ? 'también' : momento(ps)}, con el pico a las ${hh(ps)}.`
      : null,
  ].filter(Boolean)
  const comparacion =
    vCam && Math.abs(vCam.pct) >= 5
      ? `Fueron unos ${n0(Math.abs(mov.total - vCam.media))} camiones ${vCam.pct > 0 ? 'más' : 'menos'} que en un día promedio de la última semana.`
      : vCam
        ? 'Un volumen parecido al de los últimos días.'
        : null
  seccion(
    'el-dia',
    `${titulo(tono)}<div style="display:flex; flex-direction:row; gap:64px">${[
      cifra(n0(mov.total), 'camiones en el Nodo Sur', C.verde),
      cifra(n0(mov.kgNetos / 1000), 'toneladas', C.violetaOscuro),
      r7 ? cifra(hm(r7.tiempoMedioMin), 'la soja de Ricardone al puerto', C.verdeMedio) : '',
    ].join('')}</div><div style="display:flex; flex-direction:column; gap:16px">${frases.map(parrafo).join('')}</div>${comparacion ? remate(comparacion) : ''}${pie()}`,
    { notas: `Excel de Movimientos, plantas Ricardone y Terminal San Lorenzo. Comparación contra ${historial.length} días anteriores.` },
  )
}

// 3. El viaje de la soja.
if (r7) {
  const etapas = r7Plantas
    ? TRAMOS_SOJA.map((t) => ({ ...t, min: minutosTramo(r7Plantas, t.key) })).filter((t) => typeof t.min === 'number' && t.min > 0)
    : []
  const total = etapas.reduce((s, t) => s + t.min, 0) || 1
  const colorEtapa = (k) => (k.startsWith('SL_') ? C.violeta : k.startsWith('EGRESO→SL') ? C.verdeClaro : C.verde)
  const tira = etapas.length
    ? `<div style="display:flex; flex-direction:row; gap:4px">${etapas
        .map((t) => `<div style="display:flex; flex-direction:column; gap:8px; width:${Math.max(80, Math.round((t.min / total) * 1600))}px"><p style="font-size:32px; font-weight:600; color:${C.tinta}; white-space:nowrap">${n0(t.min)}</p><div style="height:36px; background:${colorEtapa(t.key)}; border-radius:6px"></div><p style="font-size:24px; color:${C.texto}; white-space:nowrap">${esc(t.corto)}</p></div>`)
        .join('')}</div>`
    : ''
  const sl = r7Plantas ? slCorregido(r7Plantas) : null
  const partes = [
    typeof r7Plantas?.ricMediaMin === 'number' ? `**${hm(r7Plantas.ricMediaMin)}** en Ricardone` : null,
    typeof r7Plantas?.bridgeMediaMin === 'number' ? `**${hm(r7Plantas.bridgeMediaMin)}** de traslado` : null,
    sl ? `**${hm(sl.min)}** en el puerto` : null,
  ].filter(Boolean)
  const mayor = [...etapas].sort((a, b) => b.min - a.min)[0]
  const q = soja.periodo.porCuarto ?? {}
  const totalQ = ['Q1', 'Q2', 'Q3', 'Q4'].reduce((s, k) => s + (q[k] ?? 0), 0)
  const [qTop] = Object.entries(q).sort((a, b) => b[1] - a[1])
  const franja = { Q1: 'de noche, entre las 22 y las 4', Q2: 'temprano, entre las 4 y las 10', Q3: 'al mediodía, entre las 10 y las 16', Q4: 'a la tarde, entre las 16 y las 22' }
  seccion(
    'soja',
    `${titulo(`La soja hizo el viaje al puerto en ${hm(r7.tiempoMedioMin)}`)}${tira}${partes.length ? parrafo(`${partes.join(', ')}. ${mayor ? `La espera más larga fue en ${mayor.corto} (${n0(mayor.min)} min).` : ''}`) : ''}${qTop && totalQ ? parrafo(`De los **${n0(r7.camiones)}** camiones, la mayoría entró ${franja[qTop[0]]}: ${Math.round((qTop[1] / totalQ) * 100)} %.`) : ''}${pie()}`,
    { fondo: C.fondoAlt, notas: 'Circuito R7. Puerta a puerta = salida − ingreso del Excel; etapas = promedio de cada tramo, en minutos.' },
  )
}

// 4. Dónde se trabajó.
{
  const top = volcSl ? [...(volcSl.porCalle ?? [])].sort((a, b) => b.camiones - a.camiones)[0] : null
  const ric = [
    calada ? fila('Calada', `pico a las ${picoLabel(calada) ?? '—'} h`, n0(calada.camiones), C.verde) : '',
    caladaLiq ? fila('Calada de líquidos', '', n0(caladaLiq.camiones), C.verdeMedio) : '',
    volcRic ? fila('Volcables', '', n0(volcRic.camiones), C.verdeMedio) : '',
    silos ? fila('Silos', '', n0(silos.camiones), C.verdeMedio) : '',
  ].filter(Boolean)
  const sl = [
    volcSl ? fila('Volcables', top ? `la ${top.camara.toLowerCase()} tomó el ${Math.round((top.camiones / volcSl.camiones) * 100)} %` : '', n0(volcSl.camiones), C.violetaOscuro) : '',
    caladaSl ? fila('Calado', '', n0(caladaSl.camiones), C.violeta) : '',
    circuito('R29') ? fila('Transile desde silos', '', n0(circuito('R29')), C.violeta) : '',
  ].filter(Boolean)
  const casos = (diario.anomalias?.casos ?? []).filter((c) => !['VOLCABLE_SIN_CALADA_RIC', 'OBSERVACION_MANUAL'].includes(c.reason)).length
  const demoras = (diario.demorados ?? []).reduce((s, d) => s + d.casos.length, 0)
  const mirar =
    casos || demoras
      ? `Para mirar: ${casos ? `${n0(casos)} ${casos === 1 ? 'camión hizo un recorrido' : 'camiones hicieron recorridos'} fuera de lo habitual` : ''}${casos && demoras ? ' y ' : ''}${demoras ? `${n0(demoras)} demoraron más de media hora en algún tramo` : ''}.`
      : null
  const columna = (nombre, filas, color) =>
    `<div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:30px; font-weight:600; color:${color}">${nombre}</p>${filas.join('')}</div>`
  seccion(
    'sectores',
    `${titulo('Dónde se trabajó')}<div style="flex:1; display:flex; flex-direction:row; gap:56px">${columna('Ricardone', ric, C.verde)}${columna('San Lorenzo', sl, C.violetaOscuro)}</div>${mirar ? parrafo(mirar) : ''}${pie()}`,
    { notas: 'Camiones por sector del día. El detalle de patentes para revisar está en el panel de seguridad.' },
  )
}

// —— Archivos ——————————————————————————————————————————————————————————————

const indice = {
  v: 4,
  createdOnFiles: { v: 1, at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') },
  title: `Estado de planta · Nodo Sur · ${fechaCorta}`,
  order: slides.map((s) => s.id),
  sections: { s1: { description: 'El día en planta, en cuatro láminas', start: 'portada' } },
  cover: 'portada',
  faces: { 'ibm-plex-sans': { family: 'IBM Plex Sans', href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap' } },
  designSystems: [],
}
await fs.mkdir(path.join(salida, 'project', 'slides'), { recursive: true })
await fs.writeFile(path.join(salida, 'project', 'deck.json'), JSON.stringify(indice, null, 1), 'utf8')
for (const s of slides) await fs.writeFile(path.join(salida, 'project', 'slides', `${s.id}.html`), s.html, 'utf8')
console.log(JSON.stringify({ deck: path.join(salida, 'project', 'deck.json'), slides: slides.map((s) => `project/slides/${s.id}.html`) }))
