/**
 * Láminas de datos del deck «Reconocimiento de cámaras» (mismo diseño que el de octubre):
 * comparación contra la semana anterior, día a día y lectura/corrección por nodo, por planta.
 * Portada, conclusiones y el ejemplo se escriben a mano (son texto editorial).
 *
 * Con LOTE_JSON=outputs/demostracion_lote/lote_semana_<desde>_<hasta>.json la lámina por nodo usa el algoritmo por lote.
 * Uso: node scripts/deck-reconocimiento-camaras.mjs <semana from_to> <semana anterior from_to> <carpeta del deck> <pág. inicial ric> <pág. inicial sl>
 * Requiere reportes/camaras/<semana>/reconocimiento-camaras.json generado con --correcciones.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const root = resolve(import.meta.dirname, '..')
const [curKey, prevKey, deckDir, pageRic = '3', pageSl = '7'] = process.argv.slice(2)
if (!curKey || !prevKey || !deckDir) throw new Error('uso: deck-reconocimiento-camaras.mjs <semana> <anterior> <carpeta del deck>')
const R = (k) => JSON.parse(readFileSync(join(root, 'reportes/camaras', k, 'reconocimiento-camaras.json'), 'utf8'))
const cur = R(curKey)
const prev = R(prevKey)
const LOGO_NVA = '/_blob/2cc2ca2b1e5935cf91f079bf04fd08a9'
const LOGO_BIM = '/_blob/2a75c26fc2dc175735771e2a6403a7e8'
const MIN_N = 20
const NOMBRE = { 'Salida 2': 'Salida', 'Balanza ingreso|ricardone': 'Balanza ingreso (B1)', 'Balanza egreso|ricardone': 'Balanza egreso (B2)' }
const nombre = (p) => NOMBRE[`${p.punto}|${p.planta}`] ?? NOMBRE[p.punto] ?? p.punto
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const diaLabel = (d) => `${DIAS[new Date(d + 'T12:00:00Z').getUTCDay()]} ${Number(d.slice(8))}`
const pct = (a) => (a.esperados ? Math.round((a.leidos / a.esperados) * 100) : null)
const footer = (text) =>
  `<img src="${LOGO_NVA}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain"><img src="${LOGO_BIM}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain"><p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:#4A5D52">${text}</p>`
const pill = (t, bg = '#0B5638') => `<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${bg}; padding:6px 18px; border-radius:999px">${t}</p>`
const SECTION = 'background:#F5F8F4; color:#14281E; font-family:\'IBM Plex Sans\', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column'
const PLANTA = { ricardone: 'Ricardone', san_lorenzo: 'Puerto San Lorenzo' }
const rango = (r) => `${diaLabel(r.rango.from)} al ${diaLabel(r.rango.to)}`.replace(/^(\w+)/, (m) => m)

/** Enteros que suman 100 (mayor resto). */
function enteros(vals) {
  const total = vals.reduce((a, b) => a + b, 0)
  if (!total) return vals.map(() => 0)
  const raw = vals.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let falta = 100 - out.reduce((a, b) => a + b, 0)
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta-- > 0) out[i]++ })
  return out
}

function comparacion(planta, page, titulo) {
  const rows = cur.puntos.filter((p) => p.planta === planta && p.total.esperados >= MIN_N)
  const tr = rows.map((p) => {
    const q = prev.puntos.find((x) => x.nodeId === p.nodeId)
    const a = q ? Math.round(q.total.pct) : null
    const b = Math.round(p.total.pct)
    const d = a == null ? null : b - a
    const estado = d == null ? 'Sin dato previo' : d > 3 ? `Mejoró · ${a} → ${b} %` : d < -3 ? `Empeoró · ${a} → ${b} %` : `Igual · ${a} → ${b} %`
    const bg = d == null || Math.abs(d) <= 3 ? '#FCFDFB' : d > 0 ? '#E3F2E6' : '#F9E1DE'
    const col = d == null || Math.abs(d) <= 3 ? '#4A5D52' : d > 0 ? '#0B5638' : '#B3261E'
    const cell = (v) => {
      if (v == null) return '<td style="text-align:right; color:#9AA59E">–</td>'
      const c = v >= 80 ? '#0B5638' : v >= 65 ? '#8A5A00' : '#B3261E'
      return `<td style="text-align:right; font-weight:700; color:${c}">${Math.round(v)} %</td>`
    }
    const old = (v) => `<td style="text-align:right; color:#4A5D52">${v == null ? '–' : Math.round(v) + ' %'}</td>`
    return `<tr style="background:${bg}"><td>${nombre(p)}</td>${old(q?.dia.pct)}${old(q?.noche.pct)}${cell(p.dia.pct)}${cell(p.noche.pct)}<td style="text-align:center; font-weight:700; color:${col}">${estado}</td></tr>`
  })
  const html = `<section id="comparacion-${planta === 'ricardone' ? 'ric' : 'sl'}" data-transition="fade" style="${SECTION}; gap:28px"><div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">${pill(`Esta semana contra la anterior · ${PLANTA[planta]}`)}</div><h2 style="font-size:52px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div><div style="display:flex; flex-direction:column; gap:0px"><div style="display:flex; flex-direction:row; background:#0B5638; border-radius:8px 8px 0px 0px"><p style="font-size:24px; font-weight:600; color:#F1F6F2; width:433px; padding:6px 12px">Nodo</p><p style="font-size:24px; color:#C9D8CE; width:400px; text-align:center; padding:6px 0px">${rango(prev)}</p><p style="font-size:24px; font-weight:600; color:#F1F6F2; width:400px; text-align:center; padding:6px 0px">${rango(cur)}</p><p style="font-size:24px; font-weight:600; color:#F1F6F2; width:431px; text-align:center; padding:6px 0px">Cambio</p></div><table style="width:1664px; font-size:25px; color:#14281E; font-variant-numeric:tabular-nums"><tr style="background:#D5E3D9"><th style="width:26%; text-align:left">Nodo</th><th style="width:12%; text-align:right">Día</th><th style="width:12%; text-align:right">Noche</th><th style="width:12%; text-align:right">Día</th><th style="width:12%; text-align:right">Noche</th><th style="width:26%; text-align:center">Total</th></tr>${tr.join('')}</table></div>${footer(`Fila verde = mejoró · blanca = igual (±3 puntos) · roja = empeoró · cambio sobre el total del nodo · ${page}`)}<aside>Porcentaje de camiones con la patente leída sobre los que pasaron por el nodo según su circuito. Semana anterior: ${prev.rango.from} a ${prev.rango.to}, ${prev.universo.movimientosEvaluados} camiones. Esta semana: ${cur.rango.from} a ${cur.rango.to}, ${cur.universo.movimientosEvaluados} camiones. El cambio se mide sobre el total del nodo (día y noche juntos); ±3 puntos se considera igual. Nodos con menos de ${MIN_N} camiones en la semana fuera de la tabla.</aside></section>`
  return html
}

function diaPorDia(planta, page) {
  const rows = cur.puntos.filter((p) => p.planta === planta && p.total.esperados >= MIN_N)
  const days = cur.diasAnalizados
  const head = `<p style="font-size:24px; font-weight:600; color:#14281E; background:#E3ECE5; border:1px solid #B9C6BE; padding:3px 10px">Nodo</p>` + days.map((d) => `<p style="font-size:24px; font-weight:600; color:#14281E; text-align:center; background:#E3ECE5; border:1px solid #B9C6BE; padding:3px 0px">${diaLabel(d)}</p>`).join('')
  const cell = (a) => {
    if (!a || !a.esperados) return `<p style="font-size:24px; text-align:center; color:#9AA59E; background:#FCFDFB; border:1px solid #B9C6BE; padding:3px 0px">–</p>`
    const v = pct(a)
    if (a.esperados < 5) return `<p style="font-size:24px; text-align:center; color:#9AA59E; background:#FCFDFB; border:1px solid #B9C6BE; padding:3px 0px">${v}</p>`
    const [bg, c] = v >= 80 ? ['#DCEFE2', '#0B5638'] : v >= 65 ? ['#FBF1DC', '#8A5A00'] : ['#F9E1DE', '#B3261E']
    return `<p style="font-size:24px; text-align:center; background:${bg}; color:${c}; border:1px solid #B9C6BE; padding:3px 0px">${v}</p>`
  }
  const band = (t, bg, c) => `<p style="grid-column:span ${days.length + 1}; font-size:24px; font-weight:700; color:${c}; background:${bg}; border:1px solid #B9C6BE; padding:4px 12px">${t}</p>`
  const block = (fr) => rows.map((p) => `<p style="font-size:24px; background:#FCFDFB; border:1px solid #B9C6BE; padding:3px 10px">${nombre(p)}</p>` + days.map((d) => cell(p.porDia[d]?.[fr])).join('')).join('')
  const cams = rows.map((p) => `${nombre(p)} ${p.camarasFrontales.join(', ')}`).join('; ')
  const id = planta === 'ricardone' ? 'dia-por-dia' : 'dia-por-dia-sl'
  return `<section id="${id}" data-transition="fade" style="${SECTION}; gap:16px"><div style="display:flex; flex-direction:row; gap:20px; align-items:center">${pill(`Día a día · ${planta === 'ricardone' ? 'Ricardone' : 'San Lorenzo'}`)}<h2 style="font-size:40px; font-weight:600; line-height:1.1; color:#14281E">% de camiones leídos por nodo · ${rango(cur)}</h2></div><div style="display:grid; grid-template-columns:340px repeat(${days.length}, 180px); gap:0px; font-variant-numeric:tabular-nums">${head}${band('De día · 6 a 18 h', '#FFF6DC', '#7A5600')}${block('dia')}${band('De noche · 18 a 6 h', '#E6E1F0', '#2E1B4E')}${block('noche')}</div>${footer(`verde 80 % o más · ocre 65–79 % · rojo menos de 65 % · gris, menos de 5 camiones · ${page}`)}<aside>Porcentaje de camiones leídos sobre los que pasaron por el nodo según su circuito, del ${cur.rango.from} al ${cur.rango.to}. Arriba, de día (6 a 18 h); abajo, de noche (18 a 6 h). En gris, turnos con menos de 5 camiones; guion, sin camiones. Cámaras: ${cams}.</aside></section>`
}

function algoritmo(planta, page, titulo) {
  const rows = cur.puntos.filter((p) => p.planta === planta && p.total.esperados >= MIN_N)
  const all = cur.puntos.filter((p) => p.planta === planta)
  const tot = all.reduce((a, p) => ({ esperados: a.esperados + p.total.esperados, exactos: a.exactos + p.total.exactos, corregidos: a.corregidos + p.total.corregidos, sinCorregir: a.sinCorregir + p.total.sinCorregir, noVistos: a.noVistos + p.total.noVistos }), { esperados: 0, exactos: 0, corregidos: 0, sinCorregir: 0, noVistos: 0 })
  const COLS = [
    ['Leyó exacto', '#0B5638', '#F1F6F2'],
    ['Corregimos', '#7FB894', '#14281E'],
    ['Queda por corregir', '#E8B931', '#3A2A00'],
    ['No lo vio', '#B3261E', '#F1F6F2'],
  ]
  const fila = (label, t, bold) => {
    const v = enteros([t.exactos, t.corregidos, t.sinCorregir, t.noVistos])
    const bar = v.map((x, i) => (x ? `<div style="flex:${x}; background:${COLS[i][1]}"></div>` : '')).join('')
    const w = bold ? 700 : 400
    const bg = bold ? '#E3ECE5' : '#FCFDFB'
    return `<div style="display:grid; grid-template-columns:330px 130px 520px 160px 170px 190px 164px; align-items:center; background:${bg}; border-bottom:1px solid #D3E2D7; padding:6px 0px"><p style="font-size:26px; font-weight:${bold ? 700 : 600}; padding:0px 12px">${label}</p><p style="font-size:26px; text-align:right; color:#4A5D52; font-weight:${w}; padding:0px 16px">${t.esperados}</p><div style="display:flex; flex-direction:row; height:30px; border-radius:6px; overflow:hidden">${bar}</div><p style="font-size:26px; text-align:right; font-weight:700; color:#0B5638">${v[0]} %</p><p style="font-size:26px; text-align:right; font-weight:${w}; color:#2F6B47">${v[1]} %</p><p style="font-size:26px; text-align:right; font-weight:700; color:#8A5A00">${v[2]} %</p><p style="font-size:26px; text-align:right; font-weight:${w}; color:#B3261E; padding:0px 12px">${v[3]} %</p></div>`
  }
  const header = `<div style="display:grid; grid-template-columns:330px 130px 520px 160px 170px 190px 164px; align-items:end; background:#0B5638; border-radius:8px 8px 0px 0px; padding:8px 0px"><p style="font-size:24px; font-weight:600; color:#F1F6F2; padding:0px 12px">Nodo</p><p style="font-size:24px; color:#C9D8CE; text-align:right; padding:0px 16px">Pasos</p><p style="font-size:24px; color:#C9D8CE; padding:0px 0px">De 100 pasos</p>${COLS.map((c, i) => `<p style="font-size:24px; font-weight:600; color:#F1F6F2; text-align:right; padding:0px ${i === 3 ? 12 : 0}px">${c[0]}</p>`).join('')}</div>`
  const legend = `<div style="display:flex; flex-direction:row; gap:32px; align-items:center">${COLS.map((c) => `<div style="display:flex; flex-direction:row; gap:10px; align-items:center"><div style="width:28px; height:28px; background:${c[1]}; border-radius:6px"></div><p style="font-size:24px; color:#4A5D52">${c[0]}</p></div>`).join('')}</div>`
  const id = planta === 'ricardone' ? 'algoritmo-ric' : 'algoritmo-sl'
  const pctTot = enteros([tot.exactos, tot.corregidos, tot.sinCorregir, tot.noVistos])
  const detalle = rows.map((p) => `${nombre(p)}: ${p.total.esperados} pasos, ${p.total.exactos} exactos, ${p.total.corregidos} corregidos, ${p.total.sinCorregir} por corregir, ${p.total.noVistos} no vistos`).join('. ')
  return `<section id="${id}" data-transition="fade" style="${SECTION}; gap:24px"><div style="display:flex; flex-direction:column; gap:12px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">${pill(`Lectura y corrección por nodo · ${PLANTA[planta]}`, '#2E1B4E')}</div><h2 style="font-size:44px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div><div style="display:flex; flex-direction:column; gap:0px">${header}${rows.map((p) => fila(nombre(p), p.total, false)).join('')}${fila('Total ' + (planta === 'ricardone' ? 'Ricardone' : 'puerto'), tot, true)}</div>${legend}${footer(`Pasos = camiones que debían pasar por el nodo según su circuito · ${page}`)}<aside>De cada paso esperado de un camión por un nodo (según su circuito), qué pasó con la lectura de la cámara: leyó la patente exacta; la leyó mal y el algoritmo de identificación la corrigió (patente parecida, recorrido, hora, balanza del SGC y lecturas que TruckFlow solo manda como alerta); la cámara lo vio pero la patente todavía no se resolvió (queda por corregir); o ninguna cámara del nodo capturó al camión (no lo vio: eso no se corrige con software). Total de la planta: ${pctTot[0]} % exacto, ${pctTot[1]} % corregido, ${pctTot[2]} % por corregir, ${pctTot[3]} % no visto, sobre ${tot.esperados} pasos. Detalle: ${detalle}. Corrección medida con el algoritmo vigente al 19/10 corrido sobre toda la semana.</aside></section>`
}

/**
 * Lámina por nodo con el algoritmo por lote (scripts/demostracion/lote.mjs semana:DESDE:HASTA): de cada paso
 * esperado, si lo leyó la cámara, se reconstruyó (captura dudosa asignada a su camión), se dedujo (sin captura,
 * pero el camión se identificó antes y después, o terminó su recorrido) o falta.
 */
const LOTE_NOMBRE = { 'Pre ingreso': 'Preingreso', 'Salida 2': 'Salida', 'Balanza Egreso|ricardone': 'Balanza egreso (B2)', 'Balanza Egreso': 'Balanza egreso', 'Balanza Ingreso': 'Balanza ingreso', 'Plataformas Volcables': 'Volcables', 'Carga / Descarga OSL': 'Carga OSL' }
const LOTE_ORDEN = ['ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Playa 3', 'ricardone:Volcable 2', 'ricardone:Balanza Egreso', 'ricardone:Salida 2', 'san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso', 'san_lorenzo:Carga / Descarga OSL', 'san_lorenzo:Plataformas Volcables', 'san_lorenzo:Balanza Egreso', 'san_lorenzo:Egreso']
function loteSlide(lote, planta, page, titulo) {
  const all = Object.entries(lote.porPunto).filter(([id]) => id.startsWith(planta + ':'))
  const rows = all.filter(([, o]) => o.esperados >= MIN_N).sort((a, b) => LOTE_ORDEN.indexOf(a[0]) - LOTE_ORDEN.indexOf(b[0]))
  const k = (o) => ({ esperados: o.esperados, a: o.camara, b: o.reconstruida, c: o.deducida + o.deducidaFinal, d: o.falta })
  const tot = all.reduce((acc, [, o]) => { const x = k(o); for (const f of Object.keys(acc)) acc[f] += x[f]; return acc }, { esperados: 0, a: 0, b: 0, c: 0, d: 0 })
  const COLS = [
    ['Leyó la cámara', '#0B5638'],
    ['Reconstruido', '#7FB894'],
    ['Deducido', '#9C8FC4'],
    ['Falta', '#B3261E'],
  ]
  const GRID = '330px 130px 520px 180px 170px 170px 164px'
  const fila = (label, t, bold) => {
    const v = enteros([t.a, t.b, t.c, t.d])
    const bar = v.map((x, i) => (x ? `<div style="flex:${x}; background:${COLS[i][1]}"></div>` : '')).join('')
    const w = bold ? 700 : 400
    return `<div style="display:grid; grid-template-columns:${GRID}; align-items:center; background:${bold ? '#E3ECE5' : '#FCFDFB'}; border-bottom:1px solid #D3E2D7; padding:6px 0px"><p style="font-size:26px; font-weight:${bold ? 700 : 600}; padding:0px 12px">${label}</p><p style="font-size:26px; text-align:right; color:#4A5D52; font-weight:${w}; padding:0px 16px">${t.esperados}</p><div style="display:flex; flex-direction:row; height:30px; border-radius:6px; overflow:hidden">${bar}</div><p style="font-size:26px; text-align:right; font-weight:700; color:#0B5638">${v[0]} %</p><p style="font-size:26px; text-align:right; font-weight:700; color:#2F6B47">${v[1]} %</p><p style="font-size:26px; text-align:right; font-weight:${w}; color:#4B3D7A">${v[2]} %</p><p style="font-size:26px; text-align:right; font-weight:700; color:#B3261E; padding:0px 12px">${v[3]} %</p></div>`
  }
  const header = `<div style="display:grid; grid-template-columns:${GRID}; align-items:end; background:#0B5638; border-radius:8px 8px 0px 0px; padding:8px 0px"><p style="font-size:24px; font-weight:600; color:#F1F6F2; padding:0px 12px">Nodo</p><p style="font-size:24px; color:#C9D8CE; text-align:right; padding:0px 16px">Pasos</p><p style="font-size:24px; color:#C9D8CE">De 100 pasos</p>${COLS.map((c, i) => `<p style="font-size:24px; font-weight:600; color:#F1F6F2; text-align:right; padding:0px ${i === 3 ? 12 : 0}px">${c[0]}</p>`).join('')}</div>`
  const legend = `<div style="display:flex; flex-direction:row; gap:32px; align-items:center">${COLS.map((c) => `<div style="display:flex; flex-direction:row; gap:10px; align-items:center"><div style="width:28px; height:28px; background:${c[1]}; border-radius:6px"></div><p style="font-size:24px; color:#4A5D52">${c[0]}</p></div>`).join('')}</div>`
  const name = ([id]) => { const n = id.split(':')[1]; return LOTE_NOMBRE[`${n}|${planta}`] ?? LOTE_NOMBRE[n] ?? n }
  const pt = enteros([tot.a, tot.b, tot.c, tot.d])
  const detalle = rows.map((r) => { const x = k(r[1]); return `${name(r)}: ${x.esperados} pasos, ${x.a} leídos por la cámara, ${x.b} reconstruidos, ${x.c} deducidos, ${x.d} faltan` }).join('. ')
  const pr = lote.prueba
  const excl = planta === 'ricardone' ? ' Ingreso y Balanza ingreso de Ricardone quedan fuera del lote por falla de las cámaras en el período.' : ''
  const id = planta === 'ricardone' ? 'algoritmo-ric' : 'algoritmo-sl'
  return `<section id="${id}" data-transition="fade" style="${SECTION}; gap:24px"><div style="display:flex; flex-direction:column; gap:12px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">${pill(`Lectura y reconstrucción por nodo · ${PLANTA[planta]}`, '#2E1B4E')}</div><h2 style="font-size:44px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div><div style="display:flex; flex-direction:column; gap:0px">${header}${rows.map((r) => fila(name(r), k(r[1]), false)).join('')}${fila('Total ' + (planta === 'ricardone' ? 'Ricardone' : 'puerto'), tot, true)}</div>${legend}${footer(`Algoritmo por lote · pasos = camiones del lote que debían pasar por el nodo según su circuito · ${page}`)}<aside>Algoritmo por lote: los camiones que ingresaron en la semana son el universo conocido y avanzan nodo por nodo. En cada nodo, una captura dudosa (patente mal leída, cortada o vacía) se compara solo contra los camiones del lote que tienen ese paso pendiente, pesados por el tiempo de tramo, la patente, color, marca y tipo del DSS y el acoplado. Leyó la cámara: la patente salió bien. Reconstruido: captura dudosa asignada a su camión. Deducido: sin captura, pero el camión se identificó en un punto anterior y en uno posterior, o terminó su recorrido. Falta: no se pudo ubicar. Total de la planta: ${pt[0]} % cámara, ${pt[1]} % reconstruido, ${pt[2]} % deducido, ${pt[3]} % falta, sobre ${tot.esperados} pasos.${excl} Prueba: a 1 de cada 4 lecturas buenas se le borró la patente; el lote volvió a ubicar ${pr.bien} de ${pr.n} y se equivocó en ${pr.otro} (de las asignadas, ${Math.round((pr.bien / (pr.bien + pr.otro)) * 1000) / 10} % correctas). Detalle: ${detalle}.</aside></section>`
}

const T = JSON.parse(process.env.DECK_TITULOS ?? '{}')
const LOTE = process.env.LOTE_JSON ? JSON.parse(readFileSync(process.env.LOTE_JSON, 'utf8')) : null
mkdirSync(join(deckDir, 'project/slides'), { recursive: true })
const w = (id, html) => writeFileSync(join(deckDir, 'project/slides', `${id}.html`), html)
const pr = Number(pageRic)
const ps = Number(pageSl)
w('comparacion-ric', comparacion('ricardone', pr, T.compRic ?? 'Esta semana contra la anterior'))
w('dia-por-dia', diaPorDia('ricardone', pr + 1))
w('algoritmo-ric', LOTE ? loteSlide(LOTE, 'ricardone', pr + 2, T.algRic ?? 'Lectura y reconstrucción por nodo') : algoritmo('ricardone', pr + 2, T.algRic ?? 'Lectura y corrección por nodo'))
w('comparacion-sl', comparacion('san_lorenzo', ps, T.compSl ?? 'Esta semana contra la anterior'))
w('dia-por-dia-sl', diaPorDia('san_lorenzo', ps + 1))
w('algoritmo-sl', LOTE ? loteSlide(LOTE, 'san_lorenzo', ps + 2, T.algSl ?? 'Lectura y reconstrucción por nodo') : algoritmo('san_lorenzo', ps + 2, T.algSl ?? 'Lectura y corrección por nodo'))
console.log('ok')
