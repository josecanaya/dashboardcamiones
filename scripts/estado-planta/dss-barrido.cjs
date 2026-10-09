// Barre el DSS en una ventana para cámaras que no llegan al feed y busca una patente (exacta o parecida).
// Uso: node scripts/estado-planta/dss-barrido.cjs <patente> <dispositivos,coma> <desde ISO hora feed> <hasta ISO hora feed> [carpeta fotos]
// La hora es la del feed (occurredAt + 206 min); el server resta los 240 s del DSS. Paso de 9 s (el DSS busca ±5 s).
const fs = require('fs'), path = require('path')
const [plate, devs, desde, hasta, outDir] = process.argv.slice(2)
const API = process.env.API || 'http://127.0.0.1:8787'
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
;(async () => {
  const found = []
  for (const dev of devs.split(',')) {
    const seen = new Map()
    for (let t = Date.parse(desde); t <= Date.parse(hasta); t += 9000) {
      const r = await (await fetch(`${API}/api/truckflow/camera-captures/find?device=${dev}&at=${new Date(t).toISOString()}&plate=${plate}`)).json()
      if (r.error) { console.log(dev, 'error', r.error); break }
      if (r.capture && !seen.has(r.capture.at)) seen.set(r.capture.at, r.capture)
    }
    const caps = [...seen.values()]
    const hit = caps.filter(c => lev((c.plate || '').toUpperCase(), plate) <= 2)
    console.log(dev, 'lecturas en la ventana', caps.length, 'parecidas', hit.map(c => new Date(Date.parse(c.at) - 3 * 3600e3).toISOString().slice(11, 19) + ' ' + c.plate).join(', ') || '—')
    for (const c of hit) {
      found.push({ dev, ...c })
      if (!outDir) continue
      fs.mkdirSync(outDir, { recursive: true })
      const hh = new Date(Date.parse(c.at) - 3 * 3600e3).toISOString().slice(5, 16).replace('T', '_').replace(':', '')
      for (const [k, s] of [['sceneFile', 'escena'], ['plateFile', 'patente']]) {
        if (!c[k]) continue
        const im = await fetch(`${API}/api/truckflow/camera-captures/image?file=${c[k]}`)
        fs.writeFileSync(path.join(outDir, `${plate}_${hh}_${dev}_camara_${s}.jpg`), Buffer.from(await im.arrayBuffer()))
      }
    }
  }
  if (outDir) fs.writeFileSync(path.join(outDir, `${plate}_barrido_${Date.parse(desde)}.json`), JSON.stringify(found, null, 1))
})()
