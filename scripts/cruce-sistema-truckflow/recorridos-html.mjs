/**
 * Página de recorridos de los camiones sin chapa: por visita, cada punto del circuito con la foto
 * confirmada a ojo (recorridos/seleccion.json) o «sin foto» si ninguna captura lo muestra.
 *
 * Uso: node scripts/cruce-sistema-truckflow/recorridos-html.mjs
 * Salida: reportes/cruce-sistema-truckflow/recorridos/recorridos.html (+ pub/*.jpg reducidas)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, resolve } from 'path'
import { OUT_DIR } from './lecturas.mjs'

const ROOT = join(OUT_DIR, 'recorridos')
const SEL = JSON.parse(readFileSync(join(ROOT, 'seleccion.json'), 'utf8'))
/** Qué lleva cada camión en el frente (revisado en las fotos). */
const CAMION = {
  AB688RB: { desc: 'Volvo FM blanco', como: 'Sin chapa', nota: 'Sin chapa adelante ni papel. La cámara lee el logo «VOLVO» («VOIV0», «VO1L70») o pedazos sueltos; en calada leyó una vez «AB688R6».' },
  RGP363: { desc: 'Scania 113 azul', como: 'Papel en el parabrisas', nota: 'Sin chapa adelante; papel «PATENTE RGP363» en el parabrisas, que solo lee la calada.' },
  KTH925: { desc: 'Iveco Cursor blanco', como: 'Papel en el parabrisas', nota: 'Portapatente vacío; papel «KTH925» en el parabrisas, que leen la calada y Celda 16. Las demás cámaras leen el logo «IVECO» («AVEC0», «VEC0»).' },
  AH439OV: { desc: 'Foton Auman gris', como: 'Portapatente vacío', nota: 'Camión nuevo (2027) sin chapa colocada. La calada leyó la parrilla («WWWWW»).' },
  GQQ158: { desc: 'Mercedes-Benz 1634 blanco', como: 'Portapatente vacío', nota: 'Marco de la chapa vacío.' },
  EOV644: { desc: 'Mercedes-Benz blanco', como: 'Portapatente vacío', nota: 'Marco de la chapa vacío.' },
  AB723QC: { desc: 'Scania blanco', como: 'Sin chapa', nota: 'Paragolpes sin chapa.' },
  DDD727: { desc: 'Scania 114G blanco', como: 'Sin chapa', nota: 'Paragolpes sin chapa; la cámara lee «330», el modelo del frente.' },
}
const visitas = []
for (const [key, sel] of Object.entries(SEL)) {
  if (key.startsWith('_')) continue
  const [patente, tag] = key.split('/')
  const rec = JSON.parse(readFileSync(join(ROOT, patente, tag, 'recorrido.json'), 'utf8'))
  const pasos = []
  for (const p of rec.puntos) {
    if (p.estado === 'fuera_del_recorrido') continue
    const i = sel[p.punto]
    const c = Number.isInteger(i) ? p.candidatas?.[i] : null
    pasos.push(c ? { punto: p.punto, camara: c.camara, hora: c.hora, lectura: c.lectura, src: join(ROOT, patente, tag, c.foto) } : { punto: p.punto, sinFoto: true })
  }
  for (const x of sel.extra ?? []) {
    const k = pasos.findIndex((s) => s.punto === x.punto)
    const paso = { punto: x.punto, camara: x.camara, hora: x.hora, lectura: x.lectura, src: resolve(ROOT, patente, tag, x.foto) }
    if (k >= 0) pasos[k] = paso
    else pasos.push(paso)
  }
  // Orden por hora; los pasos sin foto quedan en el lugar del circuito.
  const conHora = pasos.filter((s) => s.hora).sort((a, b) => a.hora.localeCompare(b.hora))
  const orden = []
  let j = 0
  for (const s of pasos) orden.push(s.hora ? conHora[j++] : s)
  visitas.push({ patente, tag, ingreso: rec.ingreso, salida: rec.salida, producto: rec.producto, planta: rec.planta, pasos: orden })
}
// Fotos reducidas a 1100 px para publicar.
mkdirSync(join(ROOT, 'pub'), { recursive: true })
const pares = []
for (const v of visitas)
  for (const s of v.pasos)
    if (s.src) {
      s.img = `pub/${v.patente}_${v.tag}_${s.hora.slice(11).replace(/:/g, '')}_${s.camara}.jpg`
      if (!existsSync(join(ROOT, s.img))) pares.push(s.src, join(ROOT, s.img))
    }
if (pares.length)
  execFileSync('python', ['-c', `
import sys
from PIL import Image
a = sys.argv[1:]
for src, dst in zip(a[::2], a[1::2]):
    im = Image.open(src).convert('RGB')
    im.resize((1100, round(im.height * 1100 / im.width)), Image.LANCZOS).save(dst, 'JPEG', quality=76, optimize=True)
`, ...pares])
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const porCamion = {}
for (const v of visitas) (porCamion[v.patente] ??= []).push(v)
const ordenCamiones = Object.keys(CAMION).filter((p) => porCamion[p])
const paso = (s) =>
  s.sinFoto
    ? `<li class="step none"><div class="ph">sin foto</div><div class="cap"><b>${esc(s.punto)}</b><span>ninguna captura lo muestra</span></div></li>`
    : `<li class="step"><button type="button" class="shot" data-src="${s.img}" data-txt="${esc(`${s.punto} · ${s.camara} · ${s.hora}`)}"><img src="${s.img}" alt="${esc(s.punto)} ${esc(s.hora)}" loading="lazy"></button><div class="cap"><b>${esc(s.punto)}</b><span class="t">${esc(s.hora.slice(11, 16))}</span><span>${esc(s.camara)}${s.lectura ? ` · leyó «${esc(s.lectura)}»` : ' · sin lectura'}</span></div></li>`
const html = `<title>Recorridos sin chapa</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Una tira por visita: los puntos del circuito en orden, de izquierda a derecha, con la foto de cada pasada. */
:root{
  --bg:#f3f4f2; --panel:#ffffff; --fg:#1b211f; --mute:#5b6661; --line:#d7dcd7; --acc:#23629f; --red:#b23b30; --redbg:#f8e3e0; --empty:#e8ebe8;
  --display:'IBM Plex Sans Condensed','Arial Narrow',sans-serif; --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--red:#ec7b6f;--redbg:#3a1e1b;--empty:#262d29;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--red:#ec7b6f;--redbg:#3a1e1b;--empty:#262d29;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:14.5px/1.5 var(--body)}
.wrap{max-width:1320px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:26px}
h1{font:700 2rem/1.1 var(--display);margin:0;text-wrap:balance}
h2{font:700 1.5rem var(--display);margin:0;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline}
h2 .pl{font:600 1.5rem var(--mono);letter-spacing:.05em}
.eyebrow{font:500 .74rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.lede{color:var(--mute);max-width:80ch;margin:8px 0 0}
.tag{font:500 .72rem var(--mono);padding:2px 9px;border-radius:10px;background:var(--redbg);color:var(--red)}
.truck{display:grid;gap:12px}
.note{margin:0;color:var(--mute);font-size:.9rem;max-width:90ch}
.visit{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:grid;gap:10px;min-width:0}
.vhead{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:.88rem;color:var(--mute)}
.vhead b{color:var(--fg);font-family:var(--mono);font-weight:500}
.strip{list-style:none;margin:0;padding:0 0 6px;display:flex;gap:10px;overflow-x:auto}
.step{flex:0 0 230px;display:grid;gap:5px;align-content:start}
.shot{border:0;padding:0;background:#000;cursor:zoom-in;border-radius:4px;overflow:hidden;display:block}
.shot img{display:block;width:100%;aspect-ratio:2688/1584;object-fit:cover;max-width:100%}
.shot:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.ph{aspect-ratio:2688/1584;border-radius:4px;background:var(--empty);display:grid;place-items:center;color:var(--mute);font-size:.85rem;border:1px dashed var(--line)}
.cap{display:grid;font-size:.8rem;line-height:1.35}
.cap b{font-weight:600}
.cap .t{font:500 .95rem var(--mono)}
.cap span{color:var(--mute)}
.step.none .cap b{color:var(--mute)}
.method{font-size:.86rem;color:var(--mute);max-width:85ch;display:grid;gap:6px}
.method p{margin:0}
dialog{border:0;padding:0;background:transparent;max-width:96vw;max-height:94vh}
dialog::backdrop{background:rgba(0,0,0,.85)}
dialog img{max-width:96vw;max-height:88vh;display:block}
dialog p{color:#fff;font:500 .85rem var(--mono);margin:6px 0 0}
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">DSS · cámaras de Ricardone y del puerto · julio → septiembre 2026</div>
    <h1>Recorridos de los camiones sin chapa</h1>
    <p class="lede">Cada visita del Sistema, punto por punto del circuito, con la foto de la cámara en la que se ve el camión. Las fotos se eligieron a ojo entre las capturas sin patente de cada punto, en el intervalo en que pasaron los camiones que iban con él en la fila. «Sin foto»: el camión pasó por ahí pero ninguna captura lo muestra; de noche y con niebla, sin chapa, varias cámaras no disparan. Tocá una foto para verla grande.</p>
  </header>
  ${ordenCamiones
    .map(
      (p) => `<section class="truck">
    <h2><span class="pl">${p}</span>${esc(CAMION[p].desc)}<span class="tag">${esc(CAMION[p].como)}</span></h2>
    <p class="note">${esc(CAMION[p].nota)}</p>
    ${porCamion[p]
      .sort((a, b) => a.ingreso.localeCompare(b.ingreso))
      .map(
        (v) => `<article class="visit">
      <div class="vhead"><span>Ingreso Sistema <b>${esc(v.ingreso.slice(0, 16))}</b></span><span>Salida <b>${esc(v.salida.slice(0, 16) || '—')}</b></span><span>${esc(v.producto)} · ${v.planta === 'TERMINAL_EMBARQUE' ? 'Puerto' : 'Ricardone'}</span><span>${v.pasos.filter((s) => !s.sinFoto).length} de ${v.pasos.length} puntos con foto</span></div>
      <ol class="strip">${v.pasos.map(paso).join('')}</ol>
    </article>`
      )
      .join('\n')}
  </section>`
    )
    .join('\n')}
  <section class="method">
    <div class="eyebrow">Cómo se armó</div>
    <p>Para cada punto se pidieron al DSS las capturas sin patente válida en el intervalo en que pasaron los camiones que entraron justo antes y justo después; el intervalo de la balanza de egreso y la salida del puerto sale de la hora de salida del Sistema (coincide con la balanza de egreso ±1 min), y el de Ingreso puerto, de la calada + 24 min (tiempo de tramo medido). Después se eligió a ojo la foto del mismo camión.</p>
    <p>Quedó afuera TRO957: el recorrido mostró que es un camión viejo con chapa gastada (la cámara lee «RO957»), no un camión sin chapa.</p>
  </section>
</div>
<dialog id="dlg"><img id="dlgImg" alt=""><p id="dlgTxt"></p></dialog>
<script>
document.addEventListener('click', (e) => {
  const b = e.target.closest('.shot')
  if (b) { document.getElementById('dlgImg').src = b.dataset.src; document.getElementById('dlgTxt').textContent = b.dataset.txt; document.getElementById('dlg').showModal(); return }
  if (e.target.closest('dialog')) document.getElementById('dlg').close()
})
</script>
`
writeFileSync(join(ROOT, 'recorridos.html'), html)
writeFileSync(join(ROOT, 'pub-files.json'), JSON.stringify(visitas.flatMap((v) => v.pasos.filter((s) => s.img).map((s) => ({ path: s.img })))))
for (const v of visitas) console.log(v.patente, v.ingreso.slice(0, 16), v.pasos.map((s) => (s.sinFoto ? `(${s.punto})` : `${s.punto} ${s.hora.slice(11, 16)}`)).join(' → '))
