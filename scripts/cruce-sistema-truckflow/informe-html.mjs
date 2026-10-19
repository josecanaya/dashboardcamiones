/**
 * Informe HTML del cruce Sistema ↔ TruckFlow.
 * Uso: node scripts/cruce-sistema-truckflow/informe-html.mjs <from>_<to>  → reportes/cruce-sistema-truckflow/<from>_<to>/informe.html
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { OUT_DIR } from './lecturas.mjs'

const dir = join(OUT_DIR, process.argv[2] ?? '')
const R = JSON.parse(readFileSync(join(dir, 'resumen.json'), 'utf8'))
const readCsv = (f) => {
  const txt = readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '')
  const rows = []
  for (const line of txt.split('\n')) {
    const out = []
    let cur = ''
    let q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) {
        if (c === '"' && line[i + 1] === '"') (cur += '"'), i++
        else if (c === '"') q = false
        else cur += c
      } else if (c === '"') q = true
      else if (c === ',') out.push(cur), (cur = '')
      else cur += c
    }
    out.push(cur)
    rows.push(out)
  }
  const [head, ...body] = rows
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
const rec = readCsv('recuperadas.csv')
const nunca = readCsv('nunca-cruzaron.csv')
const fuera = readCsv('fuera-del-sistema.csv')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const n = (x) => Number(x ?? 0).toLocaleString('es-AR')
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '–')
const G = R.global
const sinExacta = G.sinExactaEnPuntosClave
const recuperados = G.recuperado + G.solo_otras_camaras

// Ejemplos: por tipo, repartidos en el período.
const muestra = (how, k) => {
  const xs = rec.filter((r) => r.como === how)
  const step = Math.max(1, Math.floor(xs.length / k))
  return xs.filter((_, i) => i % step === 0).slice(0, k)
}
const COMO = {
  formato: 'Formato',
  parecida: 'Parecida',
  por_hora: 'Por hora',
  otra_patente: 'Patente distinta',
}
const COMO_TXT = {
  formato: 'La cámara confundió letras y números (B↔8, O↔0, S↔5). Forzada al formato AAA999 / AA999AA da la patente exacta.',
  parecida: 'Lectura con uno o dos caracteres mal o cortada, en la hora en que ese camión tenía que pasar por el punto.',
  por_hora: 'Lectura sin patente útil (vacía, 2–4 caracteres). Es la única lectura para el único camión pendiente en esa ventana.',
  otra_patente: 'La cámara leyó otra patente bien formada justo a la hora de alta en Preingreso. No se aplica: es para revisar la carga en el Sistema.',
}

const puntos = Object.entries(R.porPunto)
const maxEsp = Math.max(...puntos.map(([, c]) => c.esperados))
const barra = (c) => {
  const segs = [
    ['exacta', c.exacta, 'var(--ok)'],
    ['recuperada', c.formato + c.parecida + c.por_hora, 'var(--acc)'],
    ['patente distinta', c.otra_patente, 'var(--warn)'],
    ['sin lectura', c.sin_lectura, 'var(--miss)'],
  ]
  return `<div class="bar" style="width:${(c.esperados / maxEsp) * 100}%">${segs
    .filter(([, v]) => v > 0)
    .map(([k, v, col]) => `<span title="${k}: ${n(v)}" style="flex:${v};background:${col}"></span>`)
    .join('')}</div>`
}
const val = (modo) =>
  Object.entries(R.validacion?.[modo] ?? {})
    .map(([p, c]) => `<tr><td>${esc(R.porPunto[p]?.label ?? p)}</td><td class="num">${n(c.n)}</td><td class="num">${n(c.bien)}</td><td class="num">${n(c.mal)}</td><td class="num">${n(c.nada)}</td><td class="num"><b>${pct(c.bien, c.bien + c.mal)}</b></td></tr>`)
    .join('')
const valTot = (modo) => {
  const t = Object.values(R.validacion?.[modo] ?? {}).reduce((a, c) => ({ bien: a.bien + c.bien, mal: a.mal + c.mal, n: a.n + c.n }), { bien: 0, mal: 0, n: 0 })
  return t
}
const vb = valTot('borrada')
const va = valTot('alterada')

const html = `<title>Cruce Sistema ↔ TruckFlow</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Informe operativo: columna de lectura de 1040px, cifras grandes arriba, tablas densas abajo. */
:root{
  --bg:#f5f6f4; --panel:#ffffff; --fg:#1d2321; --mute:#5d6863; --line:#d9ded9;
  --ok:#2f7d5b; --acc:#2867a8; --warn:#c08a1e; --miss:#c4cbc6;
  --display:'IBM Plex Sans Condensed','Arial Narrow',sans-serif; --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#141816;--panel:#1c2220;--fg:#e4e9e5;--mute:#98a39d;--line:#2f3833;--ok:#4fb386;--acc:#6aa5e6;--warn:#e0ab45;--miss:#46504a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141816;--panel:#1c2220;--fg:#e4e9e5;--mute:#98a39d;--line:#2f3833;--ok:#4fb386;--acc:#6aa5e6;--warn:#e0ab45;--miss:#46504a;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.55 var(--body)}
.wrap{max-width:1040px;margin:0 auto;padding-block:32px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:40px}
h1,h2{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:2.1rem}
h2{font-size:1.35rem;margin-bottom:12px}
p{margin:0;max-width:68ch}
.eyebrow{font:500 .75rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.lede{color:var(--mute);margin-top:8px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.tile{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px;display:grid;gap:4px;align-content:start}
.tile b{font:700 2rem/1 var(--display);font-variant-numeric:tabular-nums}
.tile span{color:var(--mute);font-size:.88rem}
.tile.key{border-color:var(--acc)}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-family:var(--mono);font-size:.9rem;color:var(--mute)}
.flow strong{color:var(--fg)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:.82rem;color:var(--mute);margin-bottom:10px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
.pts{display:grid;gap:10px}
.pt{display:grid;grid-template-columns:200px 1fr 150px;gap:12px;align-items:center}
.pt .lbl{font-weight:500}
.pt .fig{font:400 .82rem var(--mono);color:var(--mute);text-align:right;font-variant-numeric:tabular-nums}
.bar{display:flex;height:14px;border-radius:3px;overflow:hidden;min-width:4px}
.bar span{display:block;height:100%}
@media (max-width:640px){.pt{grid-template-columns:1fr}.pt .fig{text-align:left}}
.scroll{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font:500 .72rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);background:var(--bg);position:sticky;top:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.pl{font-family:var(--mono);white-space:nowrap}
.read{font-family:var(--mono);color:var(--acc);white-space:nowrap}
.cerca{font-family:var(--mono);font-size:.78rem;color:var(--mute);max-width:520px}
.chip{display:inline-block;font:500 .72rem var(--mono);padding:1px 7px;border-radius:10px;border:1px solid currentColor}
.c-formato,.c-parecida,.c-por_hora{color:var(--acc)} .c-otra_patente{color:var(--warn)}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.how div{display:grid;gap:4px;font-size:.88rem}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.two>div{min-width:0}
details summary{cursor:pointer;color:var(--acc);font-weight:500;margin-top:8px}
.note{font-size:.85rem;color:var(--mute)}
</style>
<div class="wrap">
<header>
  <div class="eyebrow">Ricardone + Terminal de Embarque · ${esc(R.desde)} → ${esc(R.hasta)}</div>
  <h1>Cruce Sistema de camiones ↔ TruckFlow</h1>
  <p class="lede">Cada movimiento del Sistema (Excel por contrato hasta el 14/10, balanza SGC desde el 15/10) contra todas las lecturas de cámara de Preingreso, Ingreso, Calada y Balanza. Cuando la patente no se lee o se lee mal, se busca la lectura que corresponde por hora y parecido.</p>
</header>

<section class="tiles">
  <div class="tile"><span>Movimientos de camión</span><b>${n(R.movimientos)}</b><span>sin vagones ni registros sin patente (${n(R.noCamionesExcluidos)} afuera)</span></div>
  <div class="tile"><span>Sin lectura exacta en puntos clave</span><b>${n(sinExacta)}</b><span>${pct(sinExacta, R.movimientos)} del total: la patente nunca se leyó bien</span></div>
  <div class="tile key"><span>Resueltos</span><b>${n(recuperados)}</b><span>${pct(recuperados, sinExacta)} de esos; ${n(G.solo_otras_camaras)} se leyeron bien en otra cámara</span></div>
  <div class="tile"><span>Siguen sin cruzar</span><b>${n(G.nunca_cruzó + G.patente_distinta)}</b><span>${n(G.patente_distinta)} con otra patente leída a la hora del alta</span></div>
</section>

<section>
  <h2>Por punto</h2>
  <p class="note" style="margin-bottom:12px">Esperados: movimientos de productos que pasan por el punto en al menos la mitad de los cruces exactos.</p>
  <div class="legend"><span><i style="background:var(--ok)"></i>Lectura exacta</span><span><i style="background:var(--acc)"></i>Recuperada</span><span><i style="background:var(--warn)"></i>Patente distinta</span><span><i style="background:var(--miss)"></i>Sin lectura</span></div>
  <div class="pts">
  ${puntos
    .map(
      ([, c]) => `<div class="pt"><div class="lbl">${esc(c.label)}</div>${barra(c)}<div class="fig">${pct(c.exacta, c.esperados)} → ${pct(c.exacta + c.formato + c.parecida + c.por_hora, c.esperados)}</div></div>`
    )
    .join('')}
  </div>
  <details><summary>Ver tabla por punto</summary>
  <div class="scroll" style="margin-top:10px"><table>
  <tr><th>Punto</th><th class="num">Esperados</th><th class="num">Exacta</th><th class="num">Formato</th><th class="num">Parecida</th><th class="num">Por hora</th><th class="num">Patente distinta</th><th class="num">Sin lectura</th></tr>
  ${puntos.map(([, c]) => `<tr><td>${esc(c.label)}</td><td class="num">${n(c.esperados)}</td><td class="num">${n(c.exacta)}</td><td class="num">${n(c.formato)}</td><td class="num">${n(c.parecida)}</td><td class="num">${n(c.por_hora)}</td><td class="num">${n(c.otra_patente)}</td><td class="num">${n(c.sin_lectura)}</td></tr>`).join('')}
  </table></div></details>
</section>

<section>
  <h2>Cómo se resuelve una patente mala</h2>
  <p style="margin-bottom:14px">El alta en el Sistema cae dentro de los 2 minutos de la lectura en Preingreso; la salida, dentro del minuto de la balanza de egreso; la calada de cámara, 3 minutos antes de la hora de calado. Con esos desfases medidos en los ${n(G['cruzó'])} cruces exactos se sabe en qué minuto tenía que pasar cada camión por cada punto. Ahí se busca la lectura.</p>
  <div class="how">${Object.entries(COMO)
    .map(([k, v]) => `<div><span class="chip c-${k}">${v}</span><span>${COMO_TXT[k]}</span></div>`)
    .join('')}</div>
</section>

<section>
  <h2>Qué tan confiable es</h2>
  <p style="margin-bottom:12px">Prueba a ciegas sobre 1 de cada 25 cruces exactos: se borró o se alteró la patente leída y se dejó que el método la encontrara entre todas las lecturas y todos los camiones pendientes.</p>
  <div class="two">
    <div><div class="eyebrow" style="margin-bottom:6px">Un carácter cambiado · acierta ${pct(va.bien, va.bien + va.mal)} de las que asigna (${n(va.bien)} de ${n(va.n)})</div>
    <div class="scroll"><table><tr><th>Punto</th><th class="num">n</th><th class="num">Bien</th><th class="num">Mal</th><th class="num">Nada</th><th class="num">Precisión</th></tr>${val('alterada')}</table></div></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Patente borrada · acierta ${pct(vb.bien, vb.bien + vb.mal)} (${n(vb.bien)} de ${n(vb.n)})</div>
    <div class="scroll"><table><tr><th>Punto</th><th class="num">n</th><th class="num">Bien</th><th class="num">Mal</th><th class="num">Nada</th><th class="num">Precisión</th></tr>${val('borrada')}</table></div></div>
  </div>
  <p class="note" style="margin-top:10px">Sin patente, solo se asigna cuando la lectura es la única candidata del único camión pendiente: por eso recupera menos en Ingreso puerto y Balanza ingreso puerto, donde llegan muchos camiones juntos, pero casi no se equivoca.</p>
</section>

<section>
  <h2>Por mes</h2>
  <div class="scroll"><table>
  <tr><th>Mes</th><th class="num">Movimientos</th><th class="num">Sin exacta</th><th class="num">Recuperados</th><th class="num">Solo otras cámaras</th><th class="num">Patente distinta</th><th class="num">Nunca cruzaron</th></tr>
  ${Object.entries(R.porMes)
    .sort()
    .map(([k, c]) => `<tr><td class="pl">${k}</td><td class="num">${n(c.movimientos)}</td><td class="num">${n(c.sinExactaEnPuntosClave)}</td><td class="num">${n(c.recuperado)}</td><td class="num">${n(c.solo_otras_camaras)}</td><td class="num">${n(c.patente_distinta)}</td><td class="num"><b>${n(c['nunca_cruzó'])}</b></td></tr>`)
    .join('')}
  </table></div>
</section>

<section>
  <h2>Ejemplos de lecturas recuperadas</h2>
  <div class="scroll" style="max-height:520px"><table>
  <tr><th>Cómo</th><th>Punto</th><th>Cámara leyó</th><th>Patente Sistema</th><th>Hora cámara</th><th>Alta Sistema</th><th>Producto</th></tr>
  ${['formato', 'parecida', 'por_hora']
    .flatMap((h) => muestra(h, h === 'parecida' ? 30 : 15))
    .map((r) => `<tr><td><span class="chip c-${r.como}">${COMO[r.como]}</span></td><td>${esc(R.porPunto[r.punto]?.label ?? r.punto)}</td><td class="read">${esc(r.lectura_camara)}</td><td class="pl">${esc(r.patente_sistema)}</td><td class="pl">${esc(r.hora_camara)}</td><td class="pl">${esc(r.ingreso_sistema)}</td><td>${esc(r.producto)}</td></tr>`)
    .join('')}
  </table></div>
  <p class="note" style="margin-top:8px">${n(rec.filter((r) => r.como !== 'otra_patente').length)} lecturas corregidas en total, en <span class="pl">recuperadas.csv</span> y <span class="pl">correcciones-patentes.json</span>.</p>
</section>

<section>
  <h2>Patente distinta a la hora del alta</h2>
  <p style="margin-bottom:12px">La cámara de acceso leyó una patente válida, que no figura en el Sistema, en el mismo minuto del alta del camión. Puede ser un error de carga en el Sistema o la chapa del acoplado. Conviene revisarlas con la foto.</p>
  <div class="scroll" style="max-height:420px"><table>
  <tr><th>Patente Sistema</th><th>Cámara leyó</th><th>Alta Sistema</th><th>Producto</th></tr>
  ${nunca
    .filter((r) => r.estado === 'patente_distinta')
    .map((r) => `<tr><td class="pl">${esc(r.patente)}</td><td class="read">${esc(r.lectura_propuesta)}</td><td class="pl">${esc(r.ingreso)}</td><td>${esc(r.producto)}</td></tr>`)
    .join('')}
  </table></div>
</section>

<section>
  <h2>Nunca cruzaron</h2>
  <p style="margin-bottom:12px">${n(G['nunca_cruzó'])} movimientos sin ninguna lectura atribuible en ninguna cámara. La última columna muestra lo que leyeron los accesos ±5 min del alta (→ asignada a otro camión, = lectura exacta de otro).</p>
  <div class="scroll" style="max-height:560px"><table>
  <tr><th>Patente</th><th>Mov</th><th>Producto</th><th>Alta Sistema</th><th>Lecturas en accesos</th></tr>
  ${nunca
    .filter((r) => r.estado === 'nunca_cruzó')
    .slice(-300)
    .reverse()
    .map((r) => `<tr><td class="pl">${esc(r.patente)}</td><td>${esc(r.mov)}</td><td>${esc(r.producto)}</td><td class="pl">${esc(r.ingreso)}</td><td class="cerca">${esc(r['lecturas_accesos_±5min']).slice(0, 260)}</td></tr>`)
    .join('')}
  </table></div>
  <p class="note" style="margin-top:8px">Se muestran los 300 más recientes; la lista completa está en <span class="pl">nunca-cruzaron.csv</span>.</p>
</section>

<section>
  <h2>Al revés: vehículos fuera del Sistema</h2>
  <p style="margin-bottom:12px">${n(R.fueraDelSistema.patentes)} patentes leídas bien en dos o más puntos el mismo día que nunca figuraron en el Sistema (${n(R.fueraDelSistema.recurrentes3dias)} en 3 días o más). La mayoría son autos y camionetas en la portería del puerto y movimientos internos en la balanza 3 de Ricardone.</p>
  <div class="scroll" style="max-height:420px"><table>
  <tr><th>Patente</th><th class="num">Días</th><th class="num">Días por acceso</th><th class="num">Lecturas</th><th>Cámaras</th><th>Última</th></tr>
  ${fuera
    .slice(0, 80)
    .map((r) => `<tr><td class="pl">${esc(r.patente)}</td><td class="num">${n(r.dias)}</td><td class="num">${n(r.dias_por_acceso)}</td><td class="num">${n(r.lecturas)}</td><td class="cerca">${esc(r.puntos)}</td><td class="pl">${esc(r.ultima)}</td></tr>`)
    .join('')}
  </table></div>
</section>

<footer class="note">Generado ${esc(R.generado.slice(0, 16).replace('T', ' '))} UTC con <span class="pl">scripts/cruce-sistema-truckflow/cruce.mjs</span>. Fuentes: <span class="pl">data/movimientos</span> y <span class="pl">data/truckflow</span> (eventos + alertas, hora operativa).</footer>
</div>
`
writeFileSync(join(dir, 'informe.html'), html)
console.log(join(dir, 'informe.html'))
