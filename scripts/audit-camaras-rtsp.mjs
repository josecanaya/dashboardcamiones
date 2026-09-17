/**
 * Audita usuario/clave RTSP contra todas las cámaras del DSS.
 * Para cada una: OPTIONS → DESCRIBE → DESCRIBE con Digest, y reporta
 * si autentica, con qué códec responde, o por qué falla.
 *
 * uso: node scripts/audit-camaras-rtsp.mjs <usuario> <clave> [subtype]
 */
import net from 'node:net'
import crypto from 'node:crypto'

const [user, pass, subtype = '1'] = process.argv.slice(2)
if (!user || !pass) {
  console.error('uso: node scripts/audit-camaras-rtsp.mjs <usuario> <clave> [subtype]')
  process.exit(1)
}

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

function probe(name, ip, port = 554) {
  return new Promise((resolve) => {
    const target = `rtsp://${ip}:${port}/cam/realmonitor?channel=1&subtype=${subtype}`
    const sock = net.createConnection({ host: ip, port })
    sock.setTimeout(5000)
    let cseq = 0
    let buf = ''
    let phase = 'describe'
    const done = (estado, detalle = '') => {
      sock.destroy()
      resolve({ name, ip, estado, detalle })
    }
    const send = (method, extra = '') => {
      cseq += 1
      sock.write(`${method} ${target} RTSP/1.0\r\nCSeq: ${cseq}\r\nUser-Agent: truckflow-audit\r\n${extra}\r\n`)
    }
    sock.on('connect', () => send('DESCRIBE', 'Accept: application/sdp\r\n'))
    sock.on('timeout', () => done('timeout'))
    sock.on('error', (e) => done('sin conexión', e.code || e.message))
    sock.on('data', (chunk) => {
      buf += chunk.toString('latin1')
      if (!buf.includes('\r\n\r\n')) return
      const m = /^RTSP\/1\.0 (\d{3}) ([^\r\n]*)/.exec(buf)
      if (!m) return done('respuesta rara')
      const [, code, reason] = m
      if (phase === 'describe') {
        if (code === '401') {
          const www = /WWW-Authenticate: ([^\r\n]*)/.exec(buf)?.[1] ?? ''
          const get = (k) => new RegExp(`${k}="([^"]*)"`).exec(www)?.[1] ?? ''
          const realm = get('realm')
          const nonce = get('nonce')
          if (!nonce) return done('auth no digest', www.split(' ')[0])
          const ha1 = md5(`${user}:${realm}:${pass}`)
          const ha2 = md5(`DESCRIBE:${target}`)
          const auth = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${target}", response="${md5(`${ha1}:${nonce}:${ha2}`)}"`
          buf = ''
          phase = 'auth'
          send('DESCRIBE', `Accept: application/sdp\r\nAuthorization: ${auth}\r\n`)
          return
        }
        if (code === '200') return done('OK sin auth', codecDe(buf))
        return done(`${code} ${reason.trim()}`)
      }
      if (phase === 'auth') {
        if (code === '200') return done('OK', codecDe(buf))
        if (code === '401') return done('usuario/clave inválidos')
        return done(`${code} ${reason.trim()}`)
      }
    })
  })
}

function codecDe(text) {
  return /a=rtpmap:\d+ ([A-Za-z0-9-]+)/.exec(text)?.[1] ?? '?'
}

const res = await fetch('http://127.0.0.1:8787/api/truckflow/live-camera/channels')
const { channels } = await res.json()
const cams = channels.filter((c) => c.deviceIp)
console.log(`probando ${cams.length} cámaras con usuario "${user}" (subtype=${subtype})\n`)

const out = []
const cola = [...cams]
async function worker() {
  while (cola.length) {
    const c = cola.shift()
    out.push(await probe(c.name, c.deviceIp))
  }
}
await Promise.all(Array.from({ length: 8 }, worker))

out.sort((a, b) => a.name.localeCompare(b.name))
const ok = out.filter((r) => r.estado.startsWith('OK'))
const mal = out.filter((r) => !r.estado.startsWith('OK'))

for (const r of out) {
  console.log(`  ${r.name.padEnd(20)} ${r.ip.padEnd(15)} ${r.estado.padEnd(24)} ${r.detalle}`)
}
console.log(`\nautentican: ${ok.length} de ${out.length}`)
const codecs = {}
for (const r of ok) codecs[r.detalle] = (codecs[r.detalle] || 0) + 1
console.log('códecs:', JSON.stringify(codecs))
if (mal.length) {
  const motivos = {}
  for (const r of mal) motivos[r.estado] = (motivos[r.estado] || 0) + 1
  console.log('fallan:', JSON.stringify(motivos))
}
