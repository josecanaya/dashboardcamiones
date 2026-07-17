#!/usr/bin/env node
/**
 * POC DSS Professional V8.x OpenAPI — login, listado de canales y URL RTSP en vivo.
 *
 * Uso (desde una PC con acceso VPN al server DSS):
 *   set DSS_HOST=10.x.x.x           (IP o host del server DSS, sin https://)
 *   set DSS_USER=usuario_api
 *   set DSS_PASS=contraseña
 *   node scripts/poc-dss-live.mjs login
 *   node scripts/poc-dss-live.mjs channels
 *   node scripts/poc-dss-live.mjs rtsp <channelId>
 *
 * Notas:
 *  - El DSS usa certificado autofirmado: este script deshabilita la
 *    verificación TLS SOLO para sus propias requests (POC).
 *  - Las credenciales van por variables de entorno; no commitear .env.
 *  - Endpoints según manual "DSS Pro OpenAPI" V8. Si algún endpoint devuelve
 *    404/405 en tu build, el comando `channels` prueba variantes y muestra la
 *    respuesta cruda para ajustar.
 */

import crypto from 'node:crypto'
import https from 'node:https'

const HOST = process.env.DSS_HOST
const USER = process.env.DSS_USER
const PASS = process.env.DSS_PASS
const PORT = Number(process.env.DSS_PORT ?? '443')

if (!HOST || !USER || !PASS) {
  console.error('Faltan variables: DSS_HOST, DSS_USER, DSS_PASS (opcional DSS_PORT, default 443).')
  process.exit(1)
}

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

function httpJson(method, path, { token, body } = {}) {
  const payload = body ? JSON.stringify(body) : null
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        rejectUnauthorized: false,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { 'X-Subject-Token': token } : {}),
        },
      },
      (res) => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { text += chunk })
        res.on('end', () => {
          let json = null
          try { json = JSON.parse(text) } catch { /* respuesta no-JSON */ }
          resolve({ status: res.statusCode ?? 0, json, text })
        })
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * Login en dos pasos (/brms/api/v1.0/accounts/authorize):
 * 1) primer POST solo con userName → 401 con { realm, randomKey, encryptType }
 * 2) segundo POST con la firma MD5 encadenada → { token, duration, ... }
 */
async function login() {
  const first = await httpJson('POST', '/brms/api/v1.0/accounts/authorize', {
    body: { userName: USER, ipAddress: '', clientType: 'WINPC_V2' },
  })
  const { realm, randomKey, encryptType } = first.json ?? {}
  if (!realm || !randomKey) {
    console.error('Primer paso de login no devolvió realm/randomKey. Respuesta:')
    console.error(first.status, first.text.slice(0, 500))
    process.exit(1)
  }

  const temp1 = md5(PASS)
  const temp2 = md5(USER + temp1)
  const temp3 = md5(temp2)
  const temp4 = md5(`${USER}:${realm}:${temp3}`)
  const signature = md5(`${temp4}:${randomKey}`)

  const second = await httpJson('POST', '/brms/api/v1.0/accounts/authorize', {
    body: {
      userName: USER,
      signature,
      randomKey,
      encryptType: encryptType ?? 'MD5',
      ipAddress: '',
      clientType: 'WINPC_V2',
      userType: '0',
    },
  })
  if (second.status !== 200 || !second.json?.token) {
    console.error('Login falló en el segundo paso. Respuesta:')
    console.error(second.status, second.text.slice(0, 500))
    process.exit(1)
  }
  return second.json // { token, duration, secretKey, secretVector, ... }
}

/** Prueba variantes conocidas de listado de canales y muestra qué respondió cada una. */
async function listChannels(token) {
  const candidates = [
    ['GET', '/brms/api/v1.1/tree/channels?page=1&pageSize=200'],
    ['GET', '/brms/api/v1.0/tree/channels?page=1&pageSize=200'],
    ['GET', '/brms/api/v1.0/devices?page=1&pageSize=200'],
    ['POST', '/brms/api/v1.0/tree/list', { body: {} }],
  ]
  for (const [method, path, opts] of candidates) {
    const res = await httpJson(method, path, { token, ...(opts ?? {}) })
    console.log(`\n=== ${method} ${path} → HTTP ${res.status} ===`)
    console.log(res.text.slice(0, 2000))
    if (res.status === 200 && res.json) return res.json
  }
  return null
}

/** Pide la URL RTSP en vivo de un canal (sale por el Media Gateway del DSS). */
async function getRtspUrl(token, channelId) {
  const res = await httpJson('POST', '/vms/api/v1.0/realmonitor/uri', {
    token,
    body: {
      channelId,       // ej: "1000004$1$0$0" (lo devuelve el listado de canales)
      streamType: '2', // 1 = main stream, 2 = sub stream (más liviano para POC)
      type: 'rtsp',
    },
  })
  console.log(`\n=== POST /vms/api/v1.0/realmonitor/uri → HTTP ${res.status} ===`)
  console.log(res.text.slice(0, 2000))
  return res.json?.data?.url ?? res.json?.url ?? null
}

const [, , command, arg] = process.argv

const session = await login()
console.log(`Login OK. token=${session.token.slice(0, 12)}… duration=${session.duration ?? '?'}s`)

if (command === 'login' || !command) {
  process.exit(0)
} else if (command === 'channels') {
  await listChannels(session.token)
} else if (command === 'rtsp') {
  if (!arg) {
    console.error('Uso: node scripts/poc-dss-live.mjs rtsp <channelId>')
    process.exit(1)
  }
  const url = await getRtspUrl(session.token, arg)
  if (url) {
    console.log('\nURL RTSP obtenida (probala con VLC o go2rtc dentro de la VPN):')
    console.log(url)
  }
} else {
  console.error(`Comando desconocido: ${command}. Usar: login | channels | rtsp <channelId>`)
  process.exit(1)
}
