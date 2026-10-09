// Página del simulador: una captura mala y los camiones que esperaban en ese punto en ese momento. El usuario
// elige; después se muestra qué eligió el algoritmo y con qué probabilidades.
// Uso: node scripts/demostracion/simulador-pagina.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const SIM = process.env.SIM ?? 'simulador'
const dir = path.join(root, 'outputs/demostracion_camaras', SIM)
const casos = JSON.parse(fs.readFileSync(path.join(dir, 'casos.json'), 'utf8'))
const img = (f) => (f && fs.existsSync(path.join(dir, 'web', f)) ? `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, 'web', f)).toString('base64')}` : '')
const punto = (n) => n.replace('san_lorenzo:', '').replace('ricardone:', '') + (n.startsWith('san_lorenzo') ? ' SL' : ' Ric')
const hh = (iso) => new Date(Date.parse(iso) - 3 * 3600_000 - 240_000).toISOString().slice(11, 16)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const attrs = (d) => (d ? [d.color, d.marca, d.tipo].filter((x) => x && !/unrecognized|unknown/i.test(x)).join(' · ') : '')

const data = casos.map((c) => ({ id: c.id, punto: punto(c.node), hora: hh(c.tFeed), leyo: c.leyo, elegido: c.elegido, otro: c.otro, candidatos: c.candidatos.map((k) => ({ plate: k.plate, p: k.p, pesoTiempo: k.pesoTiempo })) }))
const cards = casos.map((c, i) => `<article class="case sim" id="${c.id}" data-id="${c.id}">
  <header><span class="num">${i + 1}</span><div class="who"><b>${esc(punto(c.node))} · ${hh(c.tFeed)}</b><span>${esc(c.device)} · la cámara leyó <span class="plate">${esc(c.leyo)}</span>${attrs(c.captura?.dss) ? ` · ${esc(attrs(c.captura.dss))}` : ''}</span></div></header>
  <figure class="capture"><img src="${img(c.captura?.file)}" alt="Captura a identificar"></figure>
  <p class="ask">¿Cuál de estos camiones, que estaban esperando este paso, es?</p>
  <div class="cands">
    ${c.candidatos.map((k) => `<button type="button" class="cand" data-plate="${esc(k.plate)}"><img src="${img(k.foto?.file)}" alt="Última foto buena de ${esc(k.plate)}"><b class="plate">${esc(k.plate)}</b><span>viene de ${esc(punto(k.ultimo))} · hace ${k.esperaMin} min</span><span class="attrs">${esc(attrs(k.foto?.dss))}</span></button>`).join('\n    ')}
    <button type="button" class="cand none" data-plate="__ninguno__"><b>Ninguno de estos</b><span>es otro camión o no se puede saber</span></button>
    <button type="button" class="cand none" data-plate="__nocamion__"><b>No es un camión</b><span>auto, colectivo, servicio, máquina o captura sin vehículo</span></button>
  </div>
  <label class="note-l" for="note-${c.id}">Comentario (opcional)</label>
  <textarea class="note" id="note-${c.id}" data-id="${c.id}" rows="2" placeholder="Qué ves en la foto, por qué elegiste ese camión…"></textarea>
  <div class="reveal" hidden></div>
</article>`).join('\n')

const css = fs.readFileSync(path.join(root, 'scripts/demostracion/pagina-revision.css'), 'utf8') + `
.capture > img { aspect-ratio: auto; object-fit: contain; max-height: 460px; cursor: zoom-in; }
.ask { margin: 0; font-weight: 600; }
.cands { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.cand { font: inherit; text-align: left; display: grid; gap: 4px; padding: 8px; border-radius: 8px; border: 2px solid var(--rule); background: var(--card); color: var(--ink); cursor: pointer; align-content: start; min-width: 0; }
.cand img { width: 100%; max-width: 100%; aspect-ratio: 16 / 9.4; object-fit: cover; border-radius: 5px; background: var(--rule); }
.cand span { font-size: 12px; color: var(--muted); }
.cand .attrs { min-height: 1em; }
.cand.none { place-content: center; text-align: center; min-height: 120px; }
.cand[aria-pressed="true"] { border-color: var(--violet); background: var(--violet-soft); }
.cand.algo { box-shadow: 0 0 0 3px var(--accent) inset; }
.reveal { border-top: 1px solid var(--rule); padding-top: 10px; display: grid; gap: 6px; font-size: 14px; }
.bar { display: grid; grid-template-columns: 110px minmax(0, 1fr) 54px; gap: 8px; align-items: center; }
.bar .tr { height: 10px; background: var(--rule); border-radius: 3px; overflow: hidden; }
.bar .tr i { display: block; height: 100%; background: var(--accent); }
.bar.otro .tr i { background: var(--violet); }
.verdict { font-weight: 600; }
.note-l { font-size: 13px; color: var(--muted); }
.note { width: 100%; font: inherit; font-size: 14px; padding: 8px; border-radius: 6px; border: 1px solid var(--rule); background: var(--bg); color: var(--ink); }
`
const js = fs.readFileSync(path.join(root, 'scripts/demostracion/simulador.client.js'), 'utf8').replace('__DATA__', JSON.stringify(data))
const html = `<title>Simulador de candidatos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
${css}
</style>
<div class="wrap">
  <div class="top">
    <h1>¿Cuál es? ${casos.length} capturas mal leídas del 07/10${SIM === 'simulador' ? '' : ' · con filtros'}</h1>
    <p class="lead">Cada captura viene con los camiones que en ese momento esperaban ese paso: de qué punto venían, hace cuánto y su última foto buena. Elegí el que te parece, o «Ninguno». Después se muestra qué eligió el algoritmo y con qué probabilidad.</p>
    <div class="counts" aria-live="polite"><span>Decididos <b id="nRev">0</b> de ${casos.length}</span><span>Coincidís con el algoritmo <b id="nSi">0</b></span><span>No coincidís <b id="nNo">0</b></span></div>
  </div>
${cards}
  <section class="summary" aria-labelledby="sum-t">
    <h2 id="sum-t">Conclusiones</h2>
    <p id="concl" class="lead">Decidí los casos para ver el resultado.</p>
    <table id="tbl"></table>
    <button type="button" class="copy" id="copy">Copiar el resultado para pegarlo en el chat</button>
    <textarea id="out" readonly aria-label="Resultado para pegar"></textarea>
  </section>
</div>
<script>
${js}
</script>
`
const outFile = path.join(root, `docs/demostracion-patentes/${SIM === 'simulador' ? 'simulador-candidatos-0710' : SIM + '-candidatos-0710'}.html`)
fs.writeFileSync(outFile, html)
console.log(outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB')
