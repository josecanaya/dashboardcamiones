// Server del simulador del vínculo: sirve la página, las fotos y guarda las correcciones del usuario.
// Uso: node scripts/vinculo/simulador-server.mjs [DESDE HASTA] [PUERTO=8820]
//   página    http://127.0.0.1:8820/
//   guarda en reportes/vinculo/<desde>_<hasta>/simulador/correcciones.json
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const [FROM = '2026-10-19', TO = '2026-10-25', PORT = '8820'] = process.argv.slice(2)
const dir = path.join(process.cwd(), 'reportes/vinculo', `${FROM}_${TO}`, 'simulador')
const corrFile = path.join(dir, 'correcciones.json')
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const readCorr = () => (fs.existsSync(corrFile) ? JSON.parse(fs.readFileSync(corrFile, 'utf8')) : {})

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/') {
    const data = fs.readFileSync(path.join(dir, 'casos.json'), 'utf8')
    const page = fs.readFileSync(path.join(here, 'simulador.html'), 'utf8').replace('__DATA__', () => data.replace(/</g, '\\u003c')).replace('__CORR__', () => JSON.stringify(readCorr()))
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    return res.end(page)
  }
  if (url.pathname.startsWith('/fotos/')) {
    const f = path.join(dir, 'fotos', path.basename(url.pathname))
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' })
    return fs.createReadStream(f).pipe(res)
  }
  if (url.pathname === '/api/correcciones' && req.method === 'POST') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const { key, value } = JSON.parse(body)
      const all = readCorr()
      if (value == null) delete all[key]
      else all[key] = { ...value, guardado: new Date().toISOString() }
      fs.writeFileSync(corrFile, JSON.stringify(all, null, 1))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, n: Object.keys(all).length }))
    })
    return
  }
  res.writeHead(404)
  res.end()
}).listen(Number(PORT), '127.0.0.1', () => console.log(`simulador en http://127.0.0.1:${PORT}/`))
