/**
 * Página con los camiones del Sistema nunca leídos por cámaras, una pestaña por semana.
 * Uso: node scripts/cruce-sistema-truckflow/nunca-leidos-html.mjs → reportes/cruce-sistema-truckflow/nunca-leidos.html
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { OUT_DIR } from './lecturas.mjs'

const J = JSON.parse(readFileSync(join(OUT_DIR, 'nunca-leidos-semanal.json'), 'utf8'))
// Semanas con cámaras solo parte de los días (inicio del export, 27/06 vacío, semana en curso).
const semanas = J.semanas.map((s) => ({ ...s, parcial: s.movimientos < 1000 }))
const data = JSON.stringify(semanas).replace(/</g, '\\u003c')
const total = semanas.reduce((a, s) => a + s.camionesNuncaLeidos, 0)

const html = `<title>Camiones nunca leídos</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Lista operativa: selector de semanas a la izquierda (arriba en el teléfono), tabla de patentes a la derecha. */
:root{
  --bg:#f4f5f3; --panel:#ffffff; --fg:#1c2220; --mute:#5c6762; --line:#d8ddd8; --acc:#23629f; --accbg:#e3edf7; --warn:#a8710f; --warnbg:#f8eed9;
  --display:'IBM Plex Sans Condensed','Arial Narrow',sans-serif; --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#131715;--panel:#1b211f;--fg:#e3e8e4;--mute:#97a29c;--line:#2e3732;--acc:#72a9e4;--accbg:#1d2c3b;--warn:#e0aa45;--warnbg:#33290f;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#131715;--panel:#1b211f;--fg:#e3e8e4;--mute:#97a29c;--line:#2e3732;--acc:#72a9e4;--accbg:#1d2c3b;--warn:#e0aa45;--warnbg:#33290f;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:14.5px/1.5 var(--body)}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:22px}
h1{font:700 2rem/1.1 var(--display);margin:0;text-wrap:balance}
.lede{color:var(--mute);max-width:72ch;margin:6px 0 0}
.eyebrow{font:500 .74rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.grid{display:grid;grid-template-columns:270px minmax(0,1fr);gap:20px;align-items:start}
@media (max-width:760px){.grid{grid-template-columns:minmax(0,1fr)}}
.weeks{display:grid;gap:4px;max-height:75vh;overflow:auto;padding-right:4px}
@media (max-width:760px){.weeks{grid-auto-flow:column;grid-auto-columns:200px;max-height:none;overflow-x:auto;padding-bottom:6px}}
.wk{display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-align:left;font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:8px 10px;cursor:pointer}
.wk:hover{border-color:var(--acc)}
.wk:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.wk[aria-pressed="true"]{background:var(--accbg);border-color:var(--acc)}
.wk .d{font:500 .86rem var(--mono)}
.wk .c{font:700 1.1rem var(--display);text-align:right;font-variant-numeric:tabular-nums}
.wk .s{grid-column:1/-1;font-size:.76rem;color:var(--mute)}
.main{display:grid;gap:12px;min-width:0}
.head{display:flex;flex-wrap:wrap;gap:12px;align-items:end;justify-content:space-between}
.head h2{font:700 1.4rem var(--display);margin:0}
.stats{display:flex;flex-wrap:wrap;gap:18px;font-size:.86rem;color:var(--mute)}
.stats b{color:var(--fg);font-variant-numeric:tabular-nums}
.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
input[type=search],select{font:inherit;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:5px;padding:6px 10px}
input[type=search]{width:200px}
button.copy{font:inherit;background:var(--panel);color:var(--acc);border:1px solid var(--acc);border-radius:5px;padding:6px 12px;cursor:pointer}
.scroll{overflow:auto;max-height:70vh;background:var(--panel);border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font:500 .7rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);background:var(--bg);position:sticky;top:0;z-index:1}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.pl{font:500 .95rem var(--mono);white-space:nowrap;letter-spacing:.03em}
.mono{font-family:var(--mono);font-size:.8rem;white-space:nowrap}
.tag{display:inline-block;font:500 .7rem var(--mono);padding:1px 7px;border-radius:9px;white-space:nowrap}
.t0{background:var(--warnbg);color:var(--warn)}
.t1{background:var(--accbg);color:var(--acc)}
.note{font-size:.82rem;color:var(--mute)}
.empty{padding:24px;color:var(--mute)}
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">Sistema de camiones vs. cámaras TruckFlow · ${J.desde} → ${J.hasta}</div>
    <h1>Camiones nunca leídos por las cámaras</h1>
    <p class="lede">Camiones que figuran en el Sistema (Excel por contrato y, desde el 15/10, balanza SGC) y que ninguna cámara leyó, ni la patente del camión ni la del acoplado, entre 60 min antes del alta y 30 min después de la salida. Son ${total.toLocaleString('es-AR')} camión-semana en total.</p>
  </header>
  <div class="grid">
    <nav class="weeks" id="weeks" aria-label="Semanas"></nav>
    <section class="main">
      <div class="head">
        <div><div class="eyebrow" id="wkLbl"></div><h2 id="wkTitle"></h2></div>
        <div class="stats" id="stats"></div>
      </div>
      <div class="tools">
        <input type="search" id="q" placeholder="Buscar patente o producto" aria-label="Buscar">
        <select id="filtro" aria-label="Filtro">
          <option value="">Todos</option>
          <option value="0">Nunca leída en todo el período</option>
          <option value="1">Leída otros días</option>
        </select>
        <button class="copy" id="copy" type="button">Copiar patentes</button>
        <span class="note" id="copied" role="status"></span>
      </div>
      <div class="scroll"><table>
        <thead><tr><th>Patente</th><th>Acoplado</th><th>Planta</th><th>Producto</th><th>Tipo</th><th>Ingreso (Sistema)</th><th>Salida (Sistema)</th><th>Mov.</th><th>Cámaras la conocen</th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div>
      <p class="note"><b>Para buscar en el video:</b> la hora de ingreso del Sistema es el alta en Preingreso de Ricardone y cae dentro de ±2 min de la pasada por esa cámara (RicPreIngInFr). Los camiones que entran directo al puerto pasan por el Ingreso SL a esa hora. La salida coincide con la balanza de egreso (±1 min). El Excel guarda la hora al minuto; la balanza SGC (desde el 15/10), al segundo.</p>
      <p class="note">«Nunca leída en todo el período»: ninguna cámara leyó jamás esa patente exacta de mayo a octubre; la chapa no se lee o está tapada. «Leída otros días»: la cámara la conoce, esa visita falló o la leyó mal.</p>
    </section>
  </div>
</div>
<script>
const S = ${data}
const $ = (id) => document.getElementById(id)
const fmt = (n) => n.toLocaleString('es-AR')
const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
let cur = S.length - 1
while (cur > 0 && S[cur].parcial) cur--
try { const k = localStorage.getItem('nl-semana'); const i = S.findIndex((s) => s.semana === k); if (i >= 0) cur = i } catch (e) {}
function weeks() {
  $('weeks').innerHTML = S.map((s, i) => {
    const [a, b] = s.semana.split('_')
    return '<button class="wk" type="button" data-i="' + i + '" aria-pressed="' + (i === cur) + '"><span class="d">' + dm(a) + ' → ' + dm(b) + '</span><span class="c">' + fmt(s.camionesNuncaLeidos) + '</span><span class="s">de ' + fmt(s.camionesSistema) + ' camiones' + (s.parcial ? ' · semana parcial' : '') + '</span></button>'
  }).reverse().join('')
}
function visibles() {
  const q = $('q').value.trim().toUpperCase()
  const f = $('filtro').value
  return S[cur].camiones.filter((c) => (!q || (c.patente + ' ' + c.acoplado + ' ' + c.producto).toUpperCase().includes(q)) && (f === '' || (f === '0' ? c.lecturasEnTodoElPeriodo === 0 : c.lecturasEnTodoElPeriodo > 0)))
}
function render() {
  const s = S[cur]
  const [a, b] = s.semana.split('_')
  $('wkLbl').textContent = 'Semana lunes → domingo' + (s.parcial ? ' · parcial' : '')
  $('wkTitle').textContent = dm(a) + '/' + a.slice(0, 4) + ' al ' + dm(b) + '/' + b.slice(0, 4)
  const nunca = s.camiones.filter((c) => !c.lecturasEnTodoElPeriodo).length
  $('stats').innerHTML = '<span><b>' + fmt(s.camionesNuncaLeidos) + '</b> nunca leídos</span><span><b>' + fmt(s.camionesSistema) + '</b> camiones en el Sistema</span><span><b>' + (s.camionesSistema ? Math.round(s.camionesNuncaLeidos / s.camionesSistema * 1000) / 10 : 0).toLocaleString('es-AR') + ' %</b></span><span><b>' + fmt(nunca) + '</b> sin ninguna lectura en todo el período</span>'
  const v = visibles()
  $('rows').innerHTML = v.length ? v.map((c) => '<tr><td class="pl">' + c.patente + '</td><td class="pl">' + (c.acoplado || '') + '</td><td>' + c.planta + '</td><td>' + c.producto + '</td><td>' + c.tipo + '</td><td class="mono">' + c.altas.join('<br>') + '</td><td class="num">' + c.movimientos + '</td><td>' + (c.lecturasEnTodoElPeriodo ? '<span class="tag t1">sí, ' + fmt(c.lecturasEnTodoElPeriodo) + ' lecturas</span>' : '<span class="tag t0">nunca</span>') + '</td></tr>').join('') : '<tr><td colspan="9" class="empty">Ningún camión coincide con la búsqueda.</td></tr>'
  document.querySelectorAll('.wk').forEach((el) => el.setAttribute('aria-pressed', String(+el.dataset.i === cur)))
}
$('weeks').addEventListener('click', (e) => {
  const b = e.target.closest('.wk'); if (!b) return
  cur = +b.dataset.i
  try { localStorage.setItem('nl-semana', S[cur].semana) } catch (e) {}
  render()
})
$('q').addEventListener('input', render)
$('filtro').addEventListener('change', render)
$('copy').addEventListener('click', () => {
  const txt = visibles().map((c) => c.patente).join('\\n')
  const done = () => { $('copied').textContent = 'Copiadas ' + visibles().length + ' patentes' }
  try { navigator.clipboard.writeText(txt).then(done, () => { $('copied').textContent = 'No se pudo copiar' }) } catch (e) { $('copied').textContent = 'No se pudo copiar' }
})
weeks(); render()
</script>
`
writeFileSync(join(OUT_DIR, 'nunca-leidos.html'), html)
console.log(join(OUT_DIR, 'nunca-leidos.html'), (html.length / 1024).toFixed(0) + ' KB')
