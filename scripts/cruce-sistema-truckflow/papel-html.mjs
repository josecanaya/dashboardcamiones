/**
 * Página de camiones SIN CHAPA DELANTERA (patente en un papel o una chapa suelta detrás del
 * parabrisas), confirmados mirando las fotos del DSS. Lista cada visita del Sistema de camiones.
 *
 * Candidatos: papel-parabrisas.mjs + fotos-papel.mjs (patentes que ningún acceso leyó nunca, leídas
 * por una cámara alta). La confirmación es visual: CONFIRMADOS abajo.
 *
 * Uso: node --max-old-space-size=8192 scripts/cruce-sistema-truckflow/papel-html.mjs
 * Salida: reportes/cruce-sistema-truckflow/papel/sin-chapa.html (+ mini/*.jpg)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { loadReads, OUT_DIR } from './lecturas.mjs'
import { loadMovimientos } from './sistema.mjs'

const ROOT = join(OUT_DIR, 'papel')
/** Revisados a ojo el 19/10/2026 sobre las fotos de calada / Celda 16. */
const CONFIRMADOS = {
  // Sin nada: ni chapa en el paragolpes ni número a la vista. Foto = captura del DSS en Preingreso sin
  // patente (fotos-sin-patente.mjs) a la hora del alta; el resto de los camiones de ese minuto se leyó.
  AB688RB: { grupo: 'nada', foto: 'AB688RB/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Sin chapa', nota: 'Volvo FM blanco, paragolpes liso. Otros días la cámara leyó «VOIV0» / «VO1L70»: el logo VOLVO, a falta de chapa.' },
  AB723QC: { grupo: 'nada', foto: 'AB723QC/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Sin chapa', nota: 'Scania blanco, paragolpes sin chapa.' },
  DDD727: { grupo: 'nada', foto: 'DDD727/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Sin chapa', nota: 'Scania 114G blanco; la cámara lee «330» del frente. Se repite en varias visitas.' },
  EOV644: { grupo: 'nada', foto: 'EOV644/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Portapatente vacío', nota: 'Mercedes blanco. Los otros dos camiones de ese minuto (OMG541, TRI745) tienen chapa y se leyeron.' },
  GQQ158: { grupo: 'nada', foto: 'GQQ158/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Portapatente vacío', nota: 'Mercedes blanco con el marco de la chapa vacío.' },
  AH439OV: { grupo: 'nada', foto: 'AH439OV/RicPreIngInFr.jpg', camara: 'RicPreIngInFr', como: 'Portapatente vacío', nota: 'Foton nuevo, modelo 2027: el marco de la chapa está vacío.' },
  // Papel o chapa suelta detrás del parabrisas: los accesos no la leen, las cámaras altas sí.
  KTH925: { grupo: 'papel', foto: 'KTH925/RicC16Descarga2.jpg', camara: 'RicC16Descarga2', como: 'Papel «KTH925» en el parabrisas', nota: 'Portapatente delantero vacío. Caso de Celda 16 de julio.' },
  RGP363: { grupo: 'papel', foto: 'RGP363/RicCal01_0909120429.jpg', camara: 'RicCal01', como: 'Papel «PATENTE RGP363» en el parabrisas', nota: 'Paragolpes sin chapa.' },
  AE685QF: { grupo: 'papel', foto: 'AE685QF/RicCal02_0715232258.jpg', camara: 'RicCal02', como: 'Chapa suelta detrás del parabrisas', nota: 'Paragolpes sin chapa.' },
  KYZ754: { grupo: 'papel', foto: 'KYZ754/RicCal02_0702103850.jpg', camara: 'RicCal02', como: 'Chapa suelta sobre el tablero', nota: 'Paragolpes sin chapa.' },
  HDI681: { grupo: 'papel', foto: 'HDI681/RicCal02_0716150714.jpg', camara: 'RicCal02', como: 'Chapa suelta sobre el tablero', nota: 'Portapatente delantero vacío.' },
  AH374JU: { grupo: 'papel', foto: 'AH374JU/RicCal02_0917034115.jpg', camara: 'RicCal02', como: 'Chapa suelta sobre el tablero', nota: 'Paragolpes sin chapa.' },
}
const MIN = 60_000
const conSeg = (ms) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
const ACCESO = /^(RicPreIng|RicIngCam|SLZIngCam|RicB\d|SLZBal(Ing|SC)|RicEgrCam|SLZSalida)/
const reads = loadReads()
const byPlate = new Map()
for (const r of reads) if (CONFIRMADOS[r.plate]) (byPlate.get(r.plate) ?? byPlate.set(r.plate, []).get(r.plate)).push(r)
const movs = loadMovimientos().filter((m) => CONFIRMADOS[m.plate])
mkdirSync(join(ROOT, 'mini'), { recursive: true })
// Miniatura de 1400 px de ancho (la foto del DSS pesa ~1,5 MB).
execFileSync('python', ['-c', `
from PIL import Image
import sys
for src, dst in zip(sys.argv[1::2], sys.argv[2::2]):
    im = Image.open(src).convert('RGB')
    im.resize((1400, round(im.height * 1400 / im.width)), Image.LANCZOS).save(dst, 'JPEG', quality=78, optimize=True)
`, ...Object.entries(CONFIRMADOS).flatMap(([p, c]) => [join(ROOT, c.foto), join(ROOT, 'mini', `${p}.jpg`)])])
const camiones = Object.entries(CONFIRMADOS).map(([patente, c]) => {
  const visitas = movs
    .filter((m) => m.plate === patente)
    .map((m) => {
      const a = m.ing - 60 * MIN
      const b = (Number.isFinite(m.sal) ? m.sal : m.ing + 14 * 60 * MIN) + 30 * MIN
      const hits = (byPlate.get(patente) ?? []).filter((r) => r.t >= a && r.t <= b)
      return { ingreso: conSeg(m.ing), salida: Number.isFinite(m.sal) ? conSeg(m.sal) : '', planta: m.planta === 'TERMINAL_EMBARQUE' ? 'Puerto' : 'Ricardone', producto: m.producto, mov: m.mov, camaras: [...new Set(hits.map((r) => r.dev))], acceso: hits.some((r) => ACCESO.test(r.dev)) }
    })
    .sort((x, y) => x.ingreso.localeCompare(y.ingreso))
  return { patente, ...c, img: `mini/${patente}.jpg`, visitas }
})
camiones.sort((a, b) => (a.grupo === b.grupo ? 0 : a.grupo === 'nada' ? -1 : 1) || (b.visitas.at(-1)?.ingreso ?? '').localeCompare(a.visitas.at(-1)?.ingreso ?? ''))
const nada = camiones.filter((c) => c.grupo === 'nada')
const papel = camiones.filter((c) => c.grupo === 'papel')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const totalVisitas = camiones.reduce((a, c) => a + c.visitas.length, 0)
const card = (c) => `<article class="card">
  <button class="shot" type="button" data-src="${c.img}" aria-label="Ver foto grande de ${c.patente}"><img src="${c.img}" alt="${esc(c.como)} — ${c.patente}" loading="lazy"></button>
  <div class="body">
    <div class="row"><span class="plate">${c.patente}</span><span class="tag">${esc(c.como)}</span></div>
    <p class="note">${esc(c.nota)} Foto: ${esc(c.camara)}. ${c.grupo === 'nada' ? 'Ninguna cámara leyó nunca esta patente.' : 'Ninguna cámara de acceso (Preingreso, Ingreso, balanzas, salidas) leyó nunca esta patente.'}</p>
    <div class="scroll"><table>
      <thead><tr><th>Ingreso (Sistema)</th><th>Salida</th><th>Planta</th><th>Producto</th><th>Cámaras que la leyeron</th></tr></thead>
      <tbody>${c.visitas.map((v) => `<tr><td class="mono"><b>${v.ingreso}</b></td><td class="mono">${v.salida || '—'}</td><td>${v.planta}</td><td>${esc(v.producto)}</td><td class="cams">${v.camaras.length ? esc(v.camaras.join(', ')) : '<span class="none">ninguna</span>'}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>
</article>`
const html = `<title>Camiones sin chapa delantera</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Expediente por camión: foto grande a la izquierda, visitas del Sistema a la derecha; se apila en el teléfono. */
:root{
  --bg:#f3f4f2; --panel:#ffffff; --fg:#1b211f; --mute:#5b6661; --line:#d7dcd7; --acc:#23629f; --red:#b23b30; --redbg:#f8e3e0;
  --display:'IBM Plex Sans Condensed','Arial Narrow',sans-serif; --body:'IBM Plex Sans',system-ui,sans-serif; --mono:'IBM Plex Mono',ui-monospace,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--red:#ec7b6f;--redbg:#3a1e1b;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121614;--panel:#1a201e;--fg:#e2e7e3;--mute:#96a19b;--line:#2d3631;--acc:#72a9e4;--red:#ec7b6f;--redbg:#3a1e1b;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:14.5px/1.5 var(--body)}
.wrap{max-width:1180px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:22px}
h1{font:700 2rem/1.1 var(--display);margin:0;text-wrap:balance}
h2{font:700 1.3rem var(--display);margin:8px 0 0}
.eyebrow{font:500 .74rem var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.lede{color:var(--mute);max-width:78ch;margin:8px 0 0}
.stats{display:flex;flex-wrap:wrap;gap:22px;font-size:.9rem;color:var(--mute)}
.stats b{font:700 1.6rem var(--display);color:var(--fg);display:block}
.card{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden}
@media (max-width:860px){.card{grid-template-columns:minmax(0,1fr)}}
.shot{border:0;padding:0;background:#000;cursor:zoom-in;display:block}
.shot img{width:100%;height:100%;object-fit:cover;display:block;max-width:100%}
.shot:focus-visible{outline:2px solid var(--acc);outline-offset:-2px}
.body{padding:14px 16px;display:grid;gap:10px;align-content:start;min-width:0}
.row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.plate{font:600 1.6rem var(--mono);letter-spacing:.06em}
.tag{font:500 .74rem var(--mono);padding:2px 9px;border-radius:10px;background:var(--redbg);color:var(--red)}
.note{margin:0;font-size:.86rem;color:var(--mute)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:.82rem}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font:500 .68rem var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.mono{font-family:var(--mono);white-space:nowrap}
.cams{font-family:var(--mono);font-size:.74rem;color:var(--mute)}
.none{color:var(--red)}
.method{font-size:.86rem;color:var(--mute);max-width:80ch;display:grid;gap:6px}
.method p{margin:0}
dialog{border:0;padding:0;background:transparent;max-width:96vw;max-height:94vh}
dialog::backdrop{background:rgba(0,0,0,.85)}
dialog img{max-width:96vw;max-height:92vh;display:block}
</style>
<div class="wrap">
  <header>
    <div class="eyebrow">Sistema de camiones vs. cámaras · Nodo Sur · julio → octubre 2026</div>
    <h1>Camiones sin chapa delantera</h1>
    <p class="lede">Camiones que figuran en el Sistema y que las cámaras nunca leyeron porque no llevan chapa en el paragolpes. Algunos no tienen nada; otros llevan la patente en un papel o en una chapa suelta detrás del parabrisas, que solo leen las cámaras altas de calada y Celda 16. Tocá la foto para verla grande.</p>
  </header>
  <div class="stats"><span><b>${camiones.length}</b>camiones confirmados con foto</span><span><b>${totalVisitas}</b>visitas en el Sistema</span><span><b>${nada.length}</b>sin nada</span><span><b>${papel.length}</b>con papel o chapa suelta adentro</span></div>
  <h2>Sin nada en el paragolpes</h2>
  ${nada.map(card).join('\n')}
  <h2>Patente en papel o chapa suelta detrás del parabrisas</h2>
  ${papel.map(card).join('\n')}
  <section class="method">
    <div class="eyebrow">Cómo se encontraron</div>
    <p><b>Sin nada.</b> Para cada visita desde el 10/08 de un camión del Sistema que ninguna cámara leyó nunca (314 visitas), se pidieron al DSS las capturas de Preingreso que registró sin patente, de 10 min antes a 2 min después del alta. 118 son del frente; se revisaron a ojo. La mayoría tiene chapa (rota, sucia o encandilada); estos 6 no tienen nada. Para cada foto se verificó que los otros camiones que entraban en ese minuto sí se leyeron, y después se siguió su recorrido por todas las cámaras. TRO957 salió de la lista: el recorrido mostró que es un camión viejo con chapa gastada.</p>
    <p><b>Papel o chapa suelta.</b> Patentes del Sistema que ningún acceso leyó en todo el período pero sí una cámara alta: 76 desde julio. 70 tienen chapa en el paragolpes y son fallas de lectura; estas 6 no.</p>
  </section>
</div>
<dialog id="dlg"><img id="dlgImg" alt=""></dialog>
<script>
document.addEventListener('click', (e) => {
  const b = e.target.closest('.shot')
  if (b) { document.getElementById('dlgImg').src = b.dataset.src; document.getElementById('dlg').showModal(); return }
  if (e.target.closest('dialog')) document.getElementById('dlg').close()
})
</script>
`
writeFileSync(join(ROOT, 'sin-chapa.html'), html)
for (const c of camiones) console.log(c.patente, c.visitas.length, 'visitas:', c.visitas.map((v) => v.ingreso).join(' | '))
