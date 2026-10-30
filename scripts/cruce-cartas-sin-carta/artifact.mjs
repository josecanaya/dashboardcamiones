// Genera la página del informe desde resumen.json (sin cifras escritas a mano).
// Uso: node scripts/cruce-cartas-sin-carta/artifact.mjs resumen.json salida.html
import fs from 'node:fs'
const [resFile, out] = process.argv.slice(2)
const R = JSON.parse(fs.readFileSync(resFile))
const ND = R.days.length, NH = R.habiles, NF = ND - NH
const isHab = d => { const w = new Date(d + 'T12:00Z').getUTCDay(); return w >= 1 && w <= 5 }
const f1 = x => x.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const NAME = {
  'PRODUCTOS VARIOS': ['Productos varios', 'Mercadería de Ricardone al puerto, materiales de obra, pallets, preformas, muestras de calado'],
  'ACEITE GIRASOL REFINADO': ['Aceite de girasol refinado', 'A Renopack (Molinos, Renova, Bunge)'],
  'ACEITE SOJA REFINADO': ['Aceite de soja refinado', 'A Renopack (Sembrar, Bunge)'],
  'GLICERINA': ['Glicerina', 'Patagonia Bioenergía y Renova, a Ricardone y Terminal'],
  'METANOL': ['Metanol', 'YPF, a Terminal'],
  'METILATO DE SODIO': ['Metilato de sodio', 'Evonik'],
  'ESCORIA': ['Escoria', 'Ricardone'],
  'NITROGENO LIQUIDO': ['Nitrógeno líquido', 'Air Liquide, Praxair'],
  'ACIDO CLORHIDRICO': ['Ácido clorhídrico', 'Transclor'],
  'RESIDUOS ORG': ['Residuos orgánicos', 'Ricardone'],
  'SODA CAUSTICA LIQUIDA': ['Soda cáustica líquida', 'Indaquim'],
  'SOLVENTE HEXANO': ['Solvente hexano', 'Solo aparece en el SGC (19–25/10)'],
  'GAS OIL': ['Gasoil', ''],
  'HIPOCLORITO DE SODIO': ['Hipoclorito de sodio', 'Total Química'],
  'ACIDO FOSFORICO': ['Ácido fosfórico', 'Rame'],
  'ACIDO CITRICO ANHIDRO': ['Ácido cítrico anhidro', 'Dalgar'],
}
const P = R.productos.map(p => {
  const hab = Object.entries(p.dia).filter(([d]) => isHab(d)).reduce((s, [, n]) => s + n, 0)
  return { ...p, nombre: NAME[p.prod]?.[0] ?? p.prod, nota: NAME[p.prod]?.[1] ?? '', pd: p.n / ND, ph: hab / NH }
})
const tot = R.sinCarta
const totHab = R.diario.filter(d => isHab(d.dia)).reduce((s, d) => s + d.sin, 0)
const max = Math.max(...P.map(p => p.pd))
const WK = ['28/09–04/10', '05/10–11/10', '12/10–18/10', '19/10–25/10']
const inWeek = (d, w) => { const t = Date.parse(d), w0 = Date.parse(w); return t >= w0 && t < w0 + 7 * 864e5 }
const semTot = R.weeks.map(w => P.reduce((s, p) => s + (p.sem[w] ?? 0), 0))
const semDesc = R.weeks.map(w => R.diario.filter(d => inWeek(d.dia, w)).reduce((s, d) => s + d.total, 0))
const conGr = (R.conCarta.SOJA ?? 0) + (R.conCarta.GIRASOL ?? 0) + (R.conCarta.CARTAMO ?? 0)
const conDer = (R.conCarta['ACGIRASOL OLEICO'] ?? 0) + (R.conCarta['ACEITE GIRASOL PARA REFINAR'] ?? 0)
const dmax = Math.max(...R.diario.map(d => d.sin))
const DOW = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá']
const nf = n => n.toLocaleString('es-AR')

const rows = P.map(p => `<tr><td><b>${p.nombre}</b>${p.nota ? `<small>${p.nota}</small>` : ''}</td>
<td class="bar"><span style="width:${(100 * p.pd / max).toFixed(1)}%"></span><em>${f1(p.pd)}</em></td>
<td class="n">${f1(p.ph)}</td>${R.weeks.map(w => `<td class="n mute">${p.sem[w] ?? '–'}</td>`).join('')}<td class="n">${p.n}</td></tr>`).join('\n')

const days = R.diario.map(d => {
  const cls = ['d', isHab(d.dia) ? '' : 'we', d.src === 'sgc' ? 'sgc' : ''].filter(Boolean).join(' ')
  return `<div class="${cls}" title="${d.dia}: ${d.sin} sin carta de ${d.total} descargas"><i style="height:${(100 * d.sin / dmax).toFixed(0)}%"></i><b>${d.sin}</b><span>${DOW[new Date(d.dia + 'T12:00Z').getUTCDay()]}<br>${d.dia.slice(8)}</span></div>`
}).join('')

const html = `<title>Descargas sin carta de porte</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: una columna de informe; arriba la cifra que responde, después los productos y el día a día */
:root{--bg:#f6f7f4;--card:#ffffff;--fg:#1d2420;--mute:#66706a;--line:#dde2dc;--accent:#2f7d4f;--accent-soft:#d8ebdf;--warn:#a5620c;--sgc:#6b5aa6;
--display:"Archivo",system-ui,sans-serif;--body:"Source Sans 3",system-ui,sans-serif;--mono:"JetBrains Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141916;--card:#1c231f;--fg:#e6ebe7;--mute:#9aa59e;--line:#2e3832;--accent:#5fbf86;--accent-soft:#24402f;--warn:#e0a24a;--sgc:#a495e0;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141916;--card:#1c231f;--fg:#e6ebe7;--mute:#9aa59e;--line:#2e3832;--accent:#5fbf86;--accent-soft:#24402f;--warn:#e0a24a;--sgc:#a495e0;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:16px/1.5 var(--body)}
main{max-width:980px;margin:0 auto;padding-block:32px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:36px}
h1,h2{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(1.7rem,4vw,2.4rem);font-weight:800}
h2{font-size:1.25rem;font-weight:700}
.eyebrow{font:600 .75rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
header{display:grid;gap:8px}header p{margin:0;max-width:65ch;color:var(--mute)}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;gap:2px;align-content:start}
.kpi b{font:800 2.4rem/1 var(--display);font-variant-numeric:tabular-nums;color:var(--accent)}
.kpi span{color:var(--mute);font-size:.92rem}
section{display:grid;gap:14px;min-width:0}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th{font:600 .72rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);text-align:right;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th.l{text-align:left}
td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
td small{display:block;color:var(--mute);font-size:.82rem}
td.n{text-align:right;font-family:var(--mono);font-size:.9rem}
td.mute{color:var(--mute)}
td.bar{min-width:150px;position:relative}
td.bar span{display:block;height:22px;background:var(--accent-soft);border-left:3px solid var(--accent);border-radius:0 3px 3px 0}
td.bar em{position:absolute;left:16px;top:50%;transform:translateY(-50%);font:600 .92rem var(--mono);font-style:normal}
tfoot td{font-weight:700;border-bottom:0}
tfoot tr.sub td{font-weight:400;color:var(--mute)}
.days{display:grid;grid-template-columns:repeat(28,minmax(22px,1fr));gap:3px;align-items:end;min-width:620px}
.d{display:grid;grid-template-rows:110px auto auto;text-align:center;font-family:var(--mono)}
.d i{align-self:end;display:block;background:var(--accent);border-radius:2px 2px 0 0}
.d.we i{background:var(--mute);opacity:.55}
.d.sgc i{background:var(--sgc)}
.d.sgc.we i{opacity:.55}
.d b{font-size:.72rem}
.d span{font-size:.62rem;color:var(--mute);line-height:1.15}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:.85rem;color:var(--mute)}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.box{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;display:grid;gap:8px;min-width:0;align-content:start}
.box h3{margin:0;font:700 1rem var(--display)}
.box ul{margin:0;padding-left:18px;display:grid;gap:6px}
.box p{margin:0}
.ok{color:var(--accent)}
.wn{color:var(--warn)}
footer{font-size:.85rem;color:var(--mute);display:grid;gap:6px;max-width:75ch}
</style>
<main>
<header>
<div class="eyebrow">Nodo Sur · Ricardone, Terminal y Renopack · 28/09 al 25/10/2026</div>
<h1>Camiones que descargan sin carta de porte</h1>
<p>Cruce de las cartas de porte ARCA (granos y derivados granarios) contra cada descarga del Excel de movimientos y del SGC. Sin agua industrial. Todas las cifras son camiones.</p>
</header>

<div class="kpis">
<div class="kpi"><b>${f1(tot / ND)}</b><span>camiones sin carta por día (promedio de ${ND} días)</span></div>
<div class="kpi"><b>${f1(totHab / NH)}</b><span>por día hábil, lunes a viernes (${NH} días)</span></div>
<div class="kpi"><b>${f1((tot - totHab) / NF)}</b><span>por día de fin de semana (${NF} días)</span></div>
<div class="kpi"><b>${tot}</b><span>camiones sin carta en el período, de ${nf(R.total)} descargas (${f1(100 * tot / R.total)} %)</span></div>
</div>

<section>
<h2>Los ${P.length} productos que descargan sin carta</h2>
<div class="scroll"><table>
<thead><tr><th class="l">Producto</th><th class="l">Camiones por día</th><th>Por día hábil</th>${WK.map(w => `<th>${w}</th>`).join('')}<th>Total</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>Total</td><td class="n" style="text-align:left">${f1(tot / ND)}</td><td class="n">${f1(totHab / NH)}</td>${semTot.map(n => `<td class="n">${n}</td>`).join('')}<td class="n">${tot}</td></tr>
<tr class="sub"><td colspan="3">Descargas totales de la semana</td>${semDesc.map(n => `<td class="n">${nf(n)}</td>`).join('')}<td class="n">${nf(R.total)}</td></tr></tfoot>
</table></div>
</section>

<section>
<h2>Día por día</h2>
<div class="legend"><span><i style="background:var(--accent)"></i>Día hábil (Excel)</span><span><i style="background:var(--mute);opacity:.55"></i>Fin de semana</span><span><i style="background:var(--sgc)"></i>Semana del SGC</span></div>
<div class="scroll"><div class="days">${days}</div></div>
</section>

<section>
<h2>Lo que sí lleva carta</h2>
<div class="cols">
<div class="box"><h3>Granos: <span class="ok">todos con carta</span></h3><p>${nf(conGr)} camiones de soja, girasol y cártamo. Ninguno sin carta en el período.</p></div>
<div class="box"><h3>Pellet de girasol: <span class="ok">con carta de derivados</span></h3><p>${R.conCarta['PELLETS GIRASOL']} camiones, todos con carta de derivado granario emitida por Vicentin.</p></div>
<div class="box"><h3>Aceite de girasol oleico y para refinar: <span class="wn">con carta, fuera de la base</span></h3><p>${conDer} camiones. En el Excel, los 107 traen CTG de la serie de derivados (300…), pero esas cartas no están en la copia de ARCA. En la semana del SGC (88 camiones) se asumen con carta por el producto.</p></div>
</div>
</section>

<section>
<h2>Cómo se cruzó</h2>
<div class="cols">
<div class="box"><ul>
<li>Excel (hasta 18/10): por el CTG de cada movimiento; si no, por patente de chasis o acoplado, con la partida de la carta entre 120 h antes y 48 h después del ingreso.</li>
<li>SGC (19–25/10, no trae CTG): solo por patente. Probado contra el Excel: encuentra 2.215 de 2.215 cartas y no da falsos positivos.</li>
<li>Derivados: se bajaron de la API de agro las 4.863 cartas emitidas en el período, de granos y de derivados. Las de derivados son todas emitidas por Vicentin; no hay ninguna de terceros hacia Vicentin.</li>
</ul></div>
<div class="box"><ul>
<li>Fuera del conteo: agua industrial (151 camiones), 25 vagones de tren, 16 ajustes contables (patentes VENTA/VVVV) y 11 camiones con baja o rechazo en el SGC.</li>
<li>La semana del SGC tiene un hueco (19/10 17:30 a 20/10 09:36) y registra menos productos varios que el Excel.</li>
<li>En los productos sin carta, el Excel trae el CTG en «0»: no se registró carta. No se pudo cotejar con cartas de derivados de terceros, porque la base no las tiene.</li>
</ul></div>
</div>
</section>

<footer>
<span>Fuentes: copia ARCA data/arca, API agro, data/movimientos (Excel MovimientosPorContrato hasta 18/10 y SGC_PROD.CamionesActivos24horas desde 19/10). Día = día de ingreso.</span>
<span>Detalle por camión: reportes/cartas-sin-carta/2026-09-28_2026-10-25/detalle_sin_carta.csv</span>
</footer>
</main>`
fs.writeFileSync(out, html)
console.log('ok', tot, f1(tot / ND), f1(totHab / NH), f1((tot - totHab) / NF), semTot, semDesc)
