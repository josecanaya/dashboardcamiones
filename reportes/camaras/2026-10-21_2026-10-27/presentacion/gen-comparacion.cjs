// Láminas finales: 6–14/10 contra 21–27/10 por sector, mismo criterio de sectores en los dos períodos.
const fs = require('fs')
const path = require('path')
const out = process.argv[2]
const BASE = 'C:/Users/Usuario/Desktop/Dashboard_camiones/reportes/camaras/'
const PER = [
  ['6 al 14', require(BASE + '2026-10-06_2026-10-14/sectores.json')],
  ['15 al 20', require(BASE + '2026-10-15_2026-10-20/sectores.json')],
  ['21 al 27', require(BASE + '2026-10-21_2026-10-27/sectores.json')],
]
const NVA = '/_blob/33b755d883abb543c90ecf8484467b8e'
const BIM = '/_blob/72c0d8fa42015cee095452bfe3600658'
const B = 'border:1px solid #B9C6BE'
const get = (J, id) => J.sectores.find((s) => s.sector === id)
const MIN = 30 // pasos mínimos para comparar

const tone = (v) => (v == null ? '#9AA59E' : v >= 90 ? '#0B5638' : v >= 75 ? '#8A5A00' : '#B3261E')
const logos = (foot) =>
  `<img src="${NVA}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain"><img src="${BIM}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain"><p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:#4A5D52">${foot}</p>`

function slide(id, planta, rows, color, headBg, titulo, total, num, aside) {
  const T = `font-size:32px; ${B}; padding:14px 20px`
  let g = `<div style="display:grid; grid-template-columns:520px repeat(3, 260px) 364px; gap:0px; font-variant-numeric:tabular-nums">`
  const h = (t, al = 'center') => `<p style="${T}; font-size:28px; font-weight:600; text-align:${al}; background:${color}; color:#F1F6F2">${t}</p>`
  g += h('Sector', 'left') + PER.map(([l]) => h(l + ' oct')).join('') + h('Resultado')
  for (const [sid, lab] of rows) {
    const ss = PER.map(([, J]) => get(J, sid))
    const d = ss[2].total.pctTomados - ss[0].total.pctTomados
    const [lbl, c, bg] =
      d >= 10 ? ['Mucho mejor', '#F1F6F2', '#0B5638'] :
      d >= 5 ? ['Mejoró', '#0B5638', '#E3F1E7'] :
      d > -5 ? ['Igual', '#4A5D52', '#FCFDFB'] :
      d > -10 ? ['Desmejoró', '#8A5A00', '#FBF1DC'] :
      ['Empeoró', '#B3261E', '#F9E1DE']
    g += `<p style="${T}; background:#FCFDFB; color:#14281E">${lab}</p>`
    for (const x of ss) g += `<p style="${T}; background:#FCFDFB; text-align:center; color:${tone(x.total.pctTomados)}">${x.total.pctTomados} %</p>`
    g += `<p style="${T}; background:${bg}; text-align:center; font-weight:700; color:${c}">${lbl} (${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(d)})</p>`
  }
  g += '</div>'
  const box = `<div style="display:flex; flex-direction:row; gap:32px; align-items:center; padding:20px 28px; background:${color}; border-radius:12px"><p style="font-size:32px; font-weight:600; color:#F1F6F2">${total[0]}</p><p style="font-size:44px; font-weight:700; color:#F1F6F2; font-variant-numeric:tabular-nums">${total[1]}</p></div>`
  const tag = planta === 'ric' ? 'Ricardone' : 'Puerto San Lorenzo'
  const html = `<section id="${id}" data-transition="fade" style="background:#F5F8F4; color:#14281E; font-family:'IBM Plex Sans', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:32px"><div style="display:flex; flex-direction:column; gap:12px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:${color}; padding:6px 18px; border-radius:999px">Antes y después · ${tag}</p><p style="font-size:24px; color:#4A5D52">% de camiones que la cámara tomó</p></div><h2 style="font-size:52px; font-weight:600; line-height:1.1; color:#14281E">${titulo}</h2></div>${g}${box}${logos(`${planta === 'ric' ? '* conectividad · ' : ''}Puntos del 6–14 al 21–27: −10 empeoró · −5 desmejoró · ±4 igual · +5 mejoró · +10 mucho mejor · ${num}`)}<aside>${aside}</aside></section>
`
  fs.writeFileSync(path.join(out, id + '.html'), html)
}

const comun = 'Los tres períodos se midieron con el mismo criterio de sectores: un camión cuenta solo si pasó seguro por el sector (hora de pesada del sistema de balanza, o tomado por otra cámara antes y después) y es falla solo si ninguna cámara del sector lo registró. Por eso las cifras del 6 al 14 no coinciden con el informe que se presentó para ese período, que medía cámara por cámara contra lo esperado del Excel. Cada celda es el porcentaje del sector, día y noche juntos; el resultado compara el 6 al 14 con el 21 al 27 en puntos: −10 o menos empeoró, −5 a −9 desmejoró, ±4 igual, +5 a +9 mejoró, +10 o más mucho mejor. El 21 al 27 llega hasta el martes a las 12 h.'

slide(
  'comparacion-ric',
  'ric',
  [
    ['ricardone:Ingreso', 'Ingreso *'],
    ['ricardone:Pre ingreso', 'Preingreso'],
    ['ricardone:Calada', 'Calada (calles 3 y 4)'],
    ['ricardone:Balanzas', 'Balanzas (B1 · B2)'],
    ['ricardone:Salida 2', 'Salida'],
  ],
  '#0B5638',
  '#D5E3D9',
  'Mejoró el Ingreso; el resto se mantiene',
  ['Total Ricardone', '88 % → 91 % → 92 %'],
  8,
  comun + ' Ricardone: Ingreso pasó de 74 a 82 % del 15 al 20 y quedó en 81 % (de día 68 → 81 → 80 %); de noche parecido (81 → 82 → 82 %). Balanzas: de día 92 → 85 → 84 % y de noche 68 → 69 → 75 %; la lectura de noche cayó de 51 a 41 y a 19 %. Hubo menos pesadas medibles en las últimas semanas (488, 197 y 112). Playa 3 y Volcable 2 casi no se usaron del 21 al 27: no se comparan (del 15 al 20 Playa 3 tomó 90 % y Volcable 2, 84 %). El total de la planta se calcula sobre los mismos cinco sectores en los tres períodos.'
)

slide(
  'comparacion-sl',
  'sl',
  [
    ['san_lorenzo:Ingreso', 'Ingreso'],
    ['san_lorenzo:Balanza Ingreso', 'Balanza ingreso'],
    ['san_lorenzo:Carga / Descarga OSL', 'Carga OSL'],
    ['san_lorenzo:Plataformas Volcables', 'Volcables'],
    ['san_lorenzo:Balanza Egreso', 'Balanza egreso'],
    ['san_lorenzo:Egreso', 'Egreso'],
  ],
  '#2E1B4E',
  '#DCD8E8',
  'Mejoraron la balanza de egreso y los volcables',
  ['Total Puerto San Lorenzo', '85 % → 93 % → 92 %'],
  9,
  comun + ' Puerto San Lorenzo: la balanza de egreso de noche tomó 19 % del 6 al 14 (220 camiones sin tomar de 273), 67 % del 15 al 20 y 93 % del 21 al 27; de día 94 → 98 → 88 %. Volcables de noche: toma 65 → 93 → 85 % y lectura 34 → 70 → 58 %. Balanza ingreso de noche 89 → 90 → 84 %. Carga OSL 94 → 87 → 88 %, con pocos camiones de noche. Líquidos: 3 y 9 camiones medibles en los dos primeros períodos, no se compara.'
)
console.log('ok')
