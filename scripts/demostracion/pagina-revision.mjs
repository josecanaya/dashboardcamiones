// Arma la página de revisión de los corregidos: foto de la captura asignada al lado de una foto buena del
// camión, con «Sí es / No es / No se ve». Uso: node scripts/demostracion/pagina-revision.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const dir = path.join(root, 'outputs/demostracion_camaras')
const casos = JSON.parse(fs.readFileSync(path.join(dir, 'corregidos-fotos.json'), 'utf8'))
const web = path.join(dir, 'fotos/web')
const img = (f) => (f && fs.existsSync(path.join(web, path.basename(f))) ? `data:image/jpeg;base64,${fs.readFileSync(path.join(web, path.basename(f))).toString('base64')}` : '')
const editDist = (a, b) => { const d = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
const punto = (n) => n.replace('san_lorenzo:', '').replace('ricardone:', '') + (n.startsWith('san_lorenzo') ? ' SL' : ' Ric')
const hh = (iso) => (iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(11, 16) : '')
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const attrs = (d) => (d ? [d.color, d.marca, d.tipo].filter((x) => x && !/unrecognized/i.test(x)).join(' · ') : '')
const data = casos.map((c) => ({ id: c.id, camion: c.camion, punto: punto(c.punto), hora: hh(c.hora), leyo: c.leyo, metodo: c.metodo, tipo: editDist(c.leyo, c.camion) <= 3 ? 'parecida' : 'fragmento' }))

const cards = casos.map((c, i) => {
  const d = data[i]
  const r = c.referencia
  const capAttrs = attrs(c.captura.dss)
  const refAttrs = attrs(r.dss)
  return `<article class="case" id="${c.id}" data-id="${c.id}">
  <header><span class="num">${i + 1}</span><div class="who"><b class="plate">${esc(c.camion)}</b><span>${esc(d.punto)} · ${d.hora} · ${esc(c.camara)}</span></div>
  <div class="tags"><span class="tag ${d.tipo}">${d.tipo === 'parecida' ? 'patente parecida' : 'fragmento'}</span><span class="tag m">${esc(d.metodo)}</span></div></header>
  <div class="pair">
    <figure><img src="${img(c.captura.file)}" alt="Captura asignada a ${esc(c.camion)}"><figcaption><b>Captura asignada</b> · la cámara leyó <span class="plate">${esc(c.leyo)}</span>${capAttrs ? ` · ${esc(capAttrs)}` : ''}</figcaption>${c.captura.plateFile ? `<img class="crop" src="${img(c.captura.plateFile)}" alt="Recorte de la patente leída">` : ''}</figure>
    <figure><img src="${img(r.file)}" alt="Foto buena de ${esc(c.camion)}"><figcaption><b>${esc(c.camion)} bien leído</b>${r.paso ? ` · ${esc(punto(r.paso.node))} ${hh(r.paso.t)}` : ''}${refAttrs ? ` · ${esc(refAttrs)}` : ''}</figcaption>${r.plateFile ? `<img class="crop" src="${img(r.plateFile)}" alt="Recorte de la patente buena">` : ''}</figure>
  </div>
  <div class="vote" role="group" aria-label="¿Es el mismo camión?"><span>¿Es el mismo camión?</span>
    <button type="button" data-v="si">Sí es</button><button type="button" data-v="no">No es</button><button type="button" data-v="nose">No se ve</button></div>
</article>`
}).join('\n')

const css = fs.readFileSync(path.join(root, 'scripts/demostracion/pagina-revision.css'), 'utf8')
const js = fs.readFileSync(path.join(root, 'scripts/demostracion/pagina-revision.client.js'), 'utf8').replace('__DATA__', JSON.stringify(data))
const html = `<title>Revisión de corregidos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
${css}
</style>
<div class="wrap">
  <div class="top">
    <h1>¿Es el mismo camión? 22 capturas corregidas del 07/10</h1>
    <p class="lead">El algoritmo asignó cada captura mal leída a un camión del inventario. A la izquierda, la captura asignada; a la derecha, el mismo camión bien leído en otro punto. Marcá si es el mismo. Las fotos se agrandan con un clic.</p>
    <div class="counts" aria-live="polite"><span>Revisados <b id="nRev">0</b> de ${casos.length}</span><span>Sí es <b id="nSi">0</b></span><span>No es <b id="nNo">0</b></span><span>No se ve <b id="nNs">0</b></span></div>
  </div>
${cards}
  <section class="summary" aria-labelledby="sum-t">
    <h2 id="sum-t">Conclusiones</h2>
    <p id="concl" class="lead">Marcá los casos para ver el resultado.</p>
    <table id="tbl"></table>
    <button type="button" class="copy" id="copy">Copiar el resultado para pegarlo en el chat</button>
    <textarea id="out" readonly aria-label="Resultado para pegar"></textarea>
  </section>
</div>
<script>
${js}
</script>
`
const outFile = path.join(root, 'docs/demostracion-patentes/revision-corregidos-0710.html')
fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, html)
console.log(outFile, (fs.statSync(outFile).size / 1e6).toFixed(1) + ' MB')
