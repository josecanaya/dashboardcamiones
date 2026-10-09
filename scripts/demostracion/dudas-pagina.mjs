// Página de dudas: por cada camión que falta, las capturas sin dueño en su entrada. El usuario marca cuál es él.
// Cada captura muestra el recorte de la patente del DSS; al tocar la foto se abre en grande (full/<archivo>.jpg).
// Uso: SIM=dudas1 node scripts/demostracion/dudas-pagina.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const SIM = process.env.SIM ?? 'dudas1'
const dir = path.join(root, 'outputs/demostracion_camaras', SIM)
const casos = JSON.parse(fs.readFileSync(path.join(dir, 'casos.json'), 'utf8'))
const img = (f, sub = 'web') => (f && fs.existsSync(path.join(dir, sub, f)) ? `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, sub, f)).toString('base64')}` : '')
const crop = (f) => (f && fs.existsSync(path.join(dir, f)) ? `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}` : '')
const local = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString()
const hh = (iso) => local(iso).slice(11, 16)
const dd = (iso) => local(iso).slice(8, 10) + '/' + local(iso).slice(5, 7)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const at = (a) => (a ?? []).filter((x) => x && !/unrecognized|unknown/i.test(x)).join(' · ')
const CAM = { RicPreIngInFr: 'Pre ingreso Ric', RicCal03: 'Calada Ric 3', RicCal04: 'Calada Ric 4', RicCalLiq: 'Calada líquidos Ric', SLZIngCamFrente: 'Ingreso SL', SLZBalIngFte: 'Balanza ingreso SL' }
const cam = (d) => CAM[d] ?? d

const candHtml = (k, j) => `<div class="cand" data-k="${j}">
      <img class="open" data-full="full/${esc(k.foto)}" src="${img(k.foto)}" alt="Captura ${esc(k.leyo)} · ${esc(cam(k.dev))} ${hh(k.t)}">
      ${k.recorte ? `<img class="crop" src="${crop(k.recorte)}" alt="Recorte de la patente">` : '<span class="nocrop">sin recorte de patente</span>'}
      <b class="plate">${esc(k.leyo)}</b><span>${esc(cam(k.dev))} · ${hh(k.t)}</span><span class="attrs">${esc(at(k.attrs))}</span>
      <button type="button" class="pick" data-k="${j}" aria-pressed="false">Es este camión</button>
    </div>`
const refHtml = (c) => c.referencia?.foto
  ? `<figure class="ref"><img class="open" data-full="full/${esc(c.referencia.foto)}" src="${img(c.referencia.foto)}" alt="${esc(c.plate)} otro día">${c.referencia.recorte ? `<img class="crop" src="${crop(c.referencia.recorte)}" alt="Patente de ${esc(c.plate)}">` : ''}<figcaption>Así se ve <b>${esc(c.plate)}</b> otro día · ${esc(cam(c.referencia.dev))} ${dd(c.referencia.t)} ${hh(c.referencia.t)}${at(c.referencia.attrs) ? ' · ' + esc(at(c.referencia.attrs)) : ''}</figcaption></figure>`
  : '<p class="noref">No hay foto buena de este camión en la quincena para comparar.</p>'

const cards = casos.map((c, i) => `<article class="case" id="${c.id}" data-id="${c.id}">
  <header><span class="num">${i + 1}</span><div class="who"><b><span class="plate">${esc(c.plate)}</span> · ${esc(c.circuito)} · ${dd(c.ingresoExcel)}</b><span>Según el Excel entró a las ${hh(c.ingresoExcel)}. Ninguna cámara lo reconoció en todo el viaje.</span></div></header>
  ${refHtml(c)}
  <p class="ask">¿Alguna de estas capturas es <b>${esc(c.plate)}</b>? Son las que ningún camión se llevó en la entrada, 40 min antes y después. Podés marcar más de una.</p>
  <div class="cands">
    ${c.candidatos.map(candHtml).join('\n    ')}
    <div class="cand none"><button type="button" class="pick" data-k="ninguno" aria-pressed="false">Ninguna es este camión</button></div>
  </div>
  <label class="note-l" for="note-${c.id}">Comentario (opcional)</label>
  <textarea class="note" id="note-${c.id}" rows="2" placeholder="Qué ves en la foto…"></textarea>
</article>`).join('\n')

const data = casos.map((c) => ({ id: c.id, plate: c.plate, dia: dd(c.ingresoExcel), leidos: c.candidatos.map((k) => `${k.leyo}@${cam(k.dev)} ${hh(k.t)}`) }))
const css = fs.readFileSync(path.join(root, 'scripts/demostracion/pagina-revision.css'), 'utf8') + `
.ref { margin: 0; display: grid; gap: 6px; }
.ref img.open { width: 100%; max-height: 360px; object-fit: contain; border-radius: 8px; background: var(--rule); border: 2px solid var(--accent); cursor: zoom-in; }
.ref .crop { width: min(100%, 420px); }
.ref figcaption, .noref { font-size: 13px; color: var(--muted); margin: 0; }
.ask { margin: 0; font-weight: 600; }
.cands { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.cand { display: grid; gap: 6px; padding: 8px; border-radius: 8px; border: 2px solid var(--rule); background: var(--card); align-content: start; min-width: 0; }
.cand img.open { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 5px; background: var(--rule); cursor: zoom-in; }
.crop { width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--rule); background: #000; }
.cand span { font-size: 12px; color: var(--muted); }
.nocrop { font-style: italic; }
.pick { font: inherit; font-weight: 600; padding: 8px; border-radius: 6px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); cursor: pointer; min-height: 40px; }
.pick[aria-pressed="true"] { background: var(--violet); border-color: var(--violet); color: #fff; }
.cand:has(.pick[aria-pressed="true"]) { border-color: var(--violet); background: var(--violet-soft); }
.cand.none { place-content: center; min-height: 120px; }
.note-l { font-size: 13px; color: var(--muted); }
.note { width: 100%; font: inherit; font-size: 14px; padding: 8px; border-radius: 6px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); }
.viewer { position: fixed; inset: 0; z-index: 20; background: rgba(0,0,0,.94); display: grid; grid-template-rows: auto minmax(0, 1fr); }
.viewer[hidden] { display: none; }
.viewer .bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 12px; align-items: center; color: #fff; font-size: 14px; }
.viewer .bar span { margin-right: auto; }
.viewer .bar button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #666; background: #222; color: #fff; cursor: pointer; }
.viewer .stage { overflow: auto; display: grid; place-items: center; }
.viewer .stage img { max-width: 100%; max-height: calc(100vh - 60px); cursor: zoom-in; }
.viewer.real .stage { place-items: start; }
.viewer.real .stage img { max-width: none; max-height: none; cursor: zoom-out; }
`
const js = `(function () {
  var DATA = ${JSON.stringify(data)}
  var KEY = 'dudas-faltantes-${SIM}'
  var st = {}
  try { st = JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { st = {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch (e) {} }
  function get(id) { return st[id] || (st[id] = { k: [], note: '' }) }
  function paint() {
    var n = 0, si = 0
    DATA.forEach(function (d) {
      var s = st[d.id] || { k: [], note: '' }
      document.getElementById(d.id).querySelectorAll('.pick').forEach(function (b) { b.setAttribute('aria-pressed', String(s.k.indexOf(b.dataset.k) >= 0)) })
      if (s.k.length) { n++; if (s.k[0] !== 'ninguno') si++ }
    })
    document.getElementById('nRev').textContent = n
    document.getElementById('nSi').textContent = si
    document.getElementById('out').value = 'Dudas faltantes: ' + DATA.map(function (d) {
      var s = st[d.id] || { k: [], note: '' }
      var r = !s.k.length ? 'sin decidir' : s.k[0] === 'ninguno' ? 'ninguna' : s.k.map(function (k) { return d.leidos[+k] }).join(' + ')
      return d.id + ' ' + d.plate + ' ' + d.dia + ' → ' + r + (s.note ? ' [' + s.note.trim() + ']' : '')
    }).join(' | ')
  }
  document.querySelectorAll('.case').forEach(function (el) {
    var id = el.dataset.id
    el.querySelectorAll('.pick').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = get(id), k = b.dataset.k
        if (k === 'ninguno') s.k = s.k[0] === 'ninguno' ? [] : ['ninguno']
        else { s.k = s.k.filter(function (x) { return x !== 'ninguno' }); var i = s.k.indexOf(k); if (i >= 0) s.k.splice(i, 1); else s.k.push(k) }
        save(); paint()
      })
    })
    var ta = el.querySelector('.note')
    ta.value = (st[id] && st[id].note) || ''
    ta.addEventListener('input', function () { get(id).note = ta.value; save(); paint() })
  })
  var V = document.getElementById('viewer'), VI = V.querySelector('.stage img'), VT = V.querySelector('.bar span')
  function closeV() { V.hidden = true; V.classList.remove('real'); VI.removeAttribute('src') }
  document.querySelectorAll('img.open').forEach(function (im) {
    im.addEventListener('click', function () {
      VI.onerror = function () { VI.onerror = null; VI.src = im.src }
      VI.src = im.dataset.full
      VT.textContent = im.alt
      V.hidden = false
      V.querySelector('.close').focus()
    })
  })
  VI.addEventListener('click', function () { V.classList.toggle('real') })
  V.querySelector('.fit').addEventListener('click', function () { V.classList.toggle('real') })
  V.querySelector('.close').addEventListener('click', closeV)
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && !V.hidden) closeV() })
  document.getElementById('copy').addEventListener('click', function () {
    var t = document.getElementById('out'), btn = document.getElementById('copy')
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.value).then(function () { btn.textContent = 'Copiado' }, function () { t.select() })
    else t.select()
  })
  paint()
})()`
const html = `<title>Camiones que faltan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
${css}
</style>
<div class="wrap">
  <div class="top">
    <h1>¿Dónde está? ${casos.length} camiones que ninguna cámara reconoció · 01 al 07/10</h1>
    <p class="lead">Cada camión viene con las capturas que nadie se llevó en su entrada (Pre ingreso y Calada en Ricardone, Ingreso y Balanza en San Lorenzo), 40 min antes y después de la hora del Excel. Debajo de cada foto, el recorte de la patente que hizo la cámara. Tocá una foto para verla en grande; tocala otra vez para tamaño real y recorrerla. Marcá «Es este camión» en la que corresponda.</p>
    <div class="counts" aria-live="polite"><span>Revisados <b id="nRev">0</b> de ${casos.length}</span><span>Encontrados <b id="nSi">0</b></span></div>
  </div>
${cards}
  <section class="summary">
    <h2>Resultado</h2>
    <button type="button" class="copy" id="copy">Copiar el resultado para pegarlo en el chat</button>
    <textarea id="out" readonly aria-label="Resultado para pegar"></textarea>
  </section>
</div>
<div class="viewer" id="viewer" hidden role="dialog" aria-label="Foto en grande"><div class="bar"><span></span><button type="button" class="fit">Tamaño real / ajustar</button><button type="button" class="close">Cerrar (Esc)</button></div><div class="stage"><img alt="Foto en grande"></div></div>
<script>
${js}
</script>
`
const outFile = path.join(root, `docs/demostracion-patentes/${SIM}-faltantes-semana.html`)
fs.writeFileSync(outFile, html)
console.log(outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB')
