/**
 * Página de fotos de los camiones nunca leídos: por semana, la pasada por Preingreso más cercana
 * a la hora de ingreso del Sistema, con la foto de escena y el recorte de la patente.
 *
 * Uso: node scripts/cruce-sistema-truckflow/fotos-nunca-leidos-html.mjs
 *  (antes: fotos-nunca-leidos.mjs y fotos_miniaturas.py)
 * Salida: reportes/cruce-sistema-truckflow/fotos-nunca-leidos/fotos.html (escenas en mini/, recortes embebidos)
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { OUT_DIR } from './lecturas.mjs'

const ROOT = join(OUT_DIR, 'fotos-nunca-leidos')
const index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'))
const VALID = /^(?:[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2})$/
const dataUri = (rel) => {
  const f = join(ROOT, 'mini', rel)
  return rel && existsSync(f) ? `data:image/jpeg;base64,${readFileSync(f).toString('base64')}` : null
}
/** Qué muestra la foto, según lo que leyeron TruckFlow y el DSS en esa pasada. */
function diagnostico(rec) {
  if (rec.sinPasada) return 'sin_pasada'
  const f = rec.fotos.find((x) => x.escena) ?? rec.fotos[0]
  if (!f?.escena) return 'sin_foto'
  const lec = f.lecturaDss || (f.lecturaTruckflow === '(vacía)' ? '' : f.lecturaTruckflow)
  if (VALID.test(lec)) return 'otra_patente'
  return 'ilegible'
}
const DIAG = {
  ilegible: 'Lectura cortada o ilegible',
  otra_patente: 'La cámara leyó otra patente válida',
  sin_pasada: 'Ninguna pasada en Preingreso a esa hora',
  sin_foto: 'El DSS no tiene la foto',
}
const camiones = index.map((r) => {
  const fotos = r.fotos.map((f) => ({ ...f, patenteImg: dataUri(f.patente), escena: f.escena && existsSync(join(ROOT, 'mini', f.escena)) ? `mini/${f.escena}` : null }))
  return { semana: r.semana, patente: r.patente, acoplado: r.acoplado, planta: r.planta, producto: r.producto, tipo: r.tipo, alta: r.alta, salida: r.salida, diag: diagnostico(r), fotos }
})
// Solo la escena de la pasada más cercana viaja como archivo (la página publicada admite ~500).
for (const c of camiones) {
  const first = c.fotos.find((f) => f.escena)
  for (const f of c.fotos) if (f !== first) f.escena = null
}
const escenas = [...new Set(camiones.map((c) => c.fotos.find((f) => f.escena)?.escena).filter(Boolean))]
writeFileSync(join(ROOT, 'escenas.json'), JSON.stringify(escenas))
const data = JSON.stringify(camiones).replace(/</g, '\\u003c')
const html = `<title>Patentes nunca leídas: fotos</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Galería de revisión: semanas arriba, una ficha por camión con la patente del Sistema frente a lo que vio la cámara. */
:root{
  --bg:#f3f4f2; --panel:#ffffff; --fg:#1b211f; --mute:#5b6661; --line:#d7dcd7; --acc:#23629f; --accbg:#e2ecf6;
  --amber:#a8710f; --amberbg:#f8eed8; --red:#b23b30; --redbg:#f8e3e0; --grey:#6c7570; --greybg:#e8ebe8;
  --display:'IBM Plex Sans Condensed','Arial Narrow',sans-serif; --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--accbg:#1c2b3a;--amber:#e0aa45;--amberbg:#33290f;--red:#ec7b6f;--redbg:#3a1e1b;--grey:#a3aca7;--greybg:#262d29;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--accbg:#1c2b3a;--amber:#e0aa45;--amberbg:#33290f;--red:#ec7b6f;--redbg:#3a1e1b;--grey:#a3aca7;--greybg:#262d29;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:14.5px/1.5 var(--body)}
.wrap{max-width:1240px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:20px}
h1{font:700 2rem/1.1 var(--display);margin:0;text-wrap:balance}
.lede{color:var(--mute);max-width:76ch;margin:6px 0 0}
.eyebrow{font:500 .74rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.weeks{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.wk{flex:0 0 auto;font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:6px 12px;cursor:pointer;display:grid;text-align:left}
.wk[aria-pressed="true"]{background:var(--accbg);border-color:var(--acc)}
.wk:focus-visible,.chipf:focus-visible,.scene:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.wk .d{font:500 .82rem var(--mono)} .wk .c{font-size:.76rem;color:var(--mute)}
.filters{display:flex;flex-wrap:wrap;gap:8px}
.chipf{font:500 .8rem var(--body);border-radius:14px;padding:4px 12px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer}
.chipf[aria-pressed="true"]{border-color:var(--fg)}
.chipf b{font-variant-numeric:tabular-nums}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px}
@media (max-width:420px){.cards{grid-template-columns:minmax(0,1fr)}}
.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden;display:grid;grid-template-rows:auto auto 1fr;min-width:0}
.top{display:grid;gap:4px;padding:10px 12px}
.toprow{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.plate{font:600 1.35rem var(--mono);letter-spacing:.06em}
.meta{font-size:.8rem;color:var(--mute)}
.meta b{color:var(--fg);font-family:var(--mono);font-weight:500}
.diag{font:500 .7rem var(--mono);padding:2px 8px;border-radius:9px;white-space:nowrap}
.d-ilegible{background:var(--amberbg);color:var(--amber)} .d-otra_patente{background:var(--redbg);color:var(--red)}
.d-sin_pasada,.d-sin_foto{background:var(--greybg);color:var(--grey)}
.scene{display:block;width:100%;aspect-ratio:2688/1584;max-width:100%;object-fit:cover;background:var(--greybg);cursor:zoom-in;border:0;padding:0}
.scene img{width:100%;height:100%;object-fit:cover;display:block}
.noimg{display:grid;place-items:center;aspect-ratio:2688/1584;background:var(--greybg);color:var(--mute);font-size:.85rem;padding:12px;text-align:center}
.passes{display:grid;gap:8px;padding:10px 12px}
.pass{display:grid;grid-template-columns:110px 1fr;gap:10px;align-items:center}
.pass img{width:110px;height:auto;border-radius:3px;border:1px solid var(--line);image-rendering:auto}
.pass .ph{width:110px;height:34px;border-radius:3px;background:var(--greybg)}
.reads{font-size:.8rem;display:grid;gap:1px;min-width:0}
.reads .r{font-family:var(--mono);color:var(--acc);font-weight:500}
.reads .m{color:var(--mute)}
.empty{padding:30px;color:var(--mute)}
dialog{border:0;padding:0;background:transparent;max-width:96vw;max-height:94vh}
dialog::backdrop{background:rgba(0,0,0,.82)}
dialog img{max-width:96vw;max-height:88vh;display:block}
dialog p{color:#fff;font:500 .85rem var(--mono);margin:6px 0 0}
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">Preingreso Ricardone · DSS · desde la 2.ª semana de agosto</div>
    <h1>Patentes nunca leídas: fotos</h1>
    <p class="lede">Camiones del Sistema cuya patente ninguna cámara leyó jamás de mayo a octubre. Para cada uno, la pasada por Preingreso más cercana a su hora de ingreso en el Sistema (la cámara pasa ±2 min del alta), con la foto y el recorte que guardó el DSS. Tocá la foto para verla grande.</p>
  </header>
  <nav class="weeks" id="weeks" aria-label="Semanas"></nav>
  <div class="filters" id="filters"></div>
  <section class="cards" id="cards"></section>
</div>
<dialog id="dlg"><img id="dlgImg" alt=""><p id="dlgTxt"></p></dialog>
<script>
const C = ${data}
const DIAG = ${JSON.stringify(DIAG)}
const $ = (id) => document.getElementById(id)
const dm = (d) => d.slice(8, 10) + '/' + d.slice(5, 7)
const weeks = [...new Set(C.map((c) => c.semana))].sort()
let wk = weeks[0], diag = ''
try { const k = localStorage.getItem('fnl-semana'); if (weeks.includes(k)) wk = k } catch (e) {}
function renderWeeks() {
  $('weeks').innerHTML = weeks.map((w) => '<button class="wk" type="button" data-w="' + w + '" aria-pressed="' + (w === wk) + '"><span class="d">' + dm(w.slice(0, 10)) + ' → ' + dm(w.slice(11)) + '</span><span class="c">' + C.filter((c) => c.semana === w).length + ' camiones</span></button>').join('')
}
function renderFilters() {
  const of = C.filter((c) => c.semana === wk)
  const opts = [['', 'Todos', of.length]].concat(Object.keys(DIAG).map((k) => [k, DIAG[k], of.filter((c) => c.diag === k).length]).filter((x) => x[2]))
  $('filters').innerHTML = opts.map(([k, l, n]) => '<button class="chipf" type="button" data-d="' + k + '" aria-pressed="' + (k === diag) + '">' + l + ' · <b>' + n + '</b></button>').join('')
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
function card(c) {
  const f0 = c.fotos.find((f) => f.escena)
  const scene = f0 ? '<button class="scene" type="button" data-src="' + f0.escena + '" data-txt="' + esc(c.patente + ' · ' + f0.camara + ' ' + f0.horaCamara) + '" aria-label="Ver foto grande de ' + c.patente + '"><img loading="lazy" src="' + f0.escena + '" alt="Pasada por ' + f0.camara + ' a las ' + f0.horaCamara.slice(11) + '"></button>' : '<div class="noimg">' + (c.diag === 'sin_pasada' ? 'Preingreso no registró ninguna pasada entre 4 min antes y 3 min después del ingreso' : 'El DSS no devolvió la foto de esta pasada') + '</div>'
  const passes = c.fotos.map((f) => '<div class="pass">' + (f.patenteImg ? '<img src="' + f.patenteImg + '" alt="Recorte de patente">' : '<div class="ph"></div>') + '<div class="reads"><span>TruckFlow: <span class="r">' + esc(f.lecturaTruckflow) + '</span>' + (f.lecturaDss && f.lecturaDss !== f.lecturaTruckflow ? ' · DSS: <span class="r">' + esc(f.lecturaDss) + '</span>' : '') + '</span><span class="m">' + esc(f.camara) + ' ' + esc(f.horaCamara.slice(11)) + ' (' + (f.difSeg >= 0 ? '+' : '') + Math.round(f.difSeg / 60) + ' min del ingreso)' + (f.confianza ? ' · conf. ' + f.confianza : '') + '</span><span class="m">' + esc([f.tipo, f.marca, f.color].filter(Boolean).join(' · ')) + (f.error && !f.escena ? esc(f.error) : '') + '</span></div></div>').join('')
  return '<article class="card"><div class="top"><div class="toprow"><span class="plate">' + c.patente + '</span><span class="diag d-' + c.diag + '">' + DIAG[c.diag] + '</span></div><div class="meta">Ingreso <b>' + c.alta + '</b>' + (c.salida ? ' · salida <b>' + c.salida.slice(11) + '</b>' : '') + '<br>' + esc(c.planta + ' · ' + c.producto + ' · ' + c.tipo) + (c.acoplado ? ' · acoplado <b>' + c.acoplado + '</b>' : '') + '</div></div>' + scene + '<div class="passes">' + passes + '</div></article>'
}
function render() {
  const v = C.filter((c) => c.semana === wk && (!diag || c.diag === diag))
  $('cards').innerHTML = v.length ? v.map(card).join('') : '<p class="empty">No hay camiones con ese filtro en esta semana.</p>'
  document.querySelectorAll('.wk').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.w === wk)))
  document.querySelectorAll('.chipf').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === diag)))
}
$('weeks').addEventListener('click', (e) => { const b = e.target.closest('.wk'); if (!b) return; wk = b.dataset.w; diag = ''; try { localStorage.setItem('fnl-semana', wk) } catch (x) {} renderFilters(); render() })
$('filters').addEventListener('click', (e) => { const b = e.target.closest('.chipf'); if (!b) return; diag = b.dataset.d; render() })
$('cards').addEventListener('click', (e) => { const b = e.target.closest('.scene'); if (!b) return; $('dlgImg').src = b.dataset.src; $('dlgTxt').textContent = b.dataset.txt; $('dlg').showModal() })
$('dlg').addEventListener('click', () => $('dlg').close())
renderWeeks(); renderFilters(); render()
</script>
`
writeFileSync(join(ROOT, 'fotos.html'), html)
const n = (k) => camiones.filter((c) => c.diag === k).length
console.log(`fotos.html: ${camiones.length} camiones · ${escenas.length} escenas · ilegible ${n('ilegible')} · otra patente ${n('otra_patente')} · sin pasada ${n('sin_pasada')} · sin foto ${n('sin_foto')} · ${(html.length / 1e6).toFixed(1)} MB`)
