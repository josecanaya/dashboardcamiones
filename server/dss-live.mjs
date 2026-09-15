// Video en vivo de las cámaras de planta — catálogo desde DSS Professional V8.x + go2rtc.
// Runbook y arquitectura: docs/POC_DSS_LIVE.md.
//
// Flujo por request de stream:
//   deviceCode (RicCal01) → canal DSS (nombre → channelId + IP de la cámara)
//   → URL RTSP de la cámara → PUT go2rtc /api/streams → playerUrl local para el browser.
//
// Por qué RTSP directo a la cámara y no el Media Gateway del DSS: el build instalado
// (DSS Pro V8.007) NO expone `/vms/api/v1.0/realmonitor/uri` — ese prefijo ni siquiera
// existe (el gateway responde 503 en toda ruta desconocida) y el RTSP server del DSS
// (:9320) devuelve 404 a las formas conocidas de `dss/monitor/param`. El DSS sigue
// siendo la fuente de verdad del inventario: nombre de canal → IP de cámara.
//
// Credenciales (DSS y cámaras) solo en .env del server; el browser nunca las ve.

import https from 'node:https'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** Paths de la OpenAPI DSS verificados contra el DSS de planta (V8.007). */
const DSS_API = {
  authorize: '/brms/api/v1.0/accounts/authorize',
  keepalive: '/brms/api/v1.0/accounts/keepalive',
  channelPage: '/brms/api/v1.1/device/channel/page',
  devicePage: '/brms/api/v1.1/device/page',
}

/** unitType '1' = «Video Channel» (el canal real); 3 y 4 son subcanales del mismo equipo. */
const VIDEO_UNIT_TYPE = '1'

const DSS_HTTP_TIMEOUT_MS = 15_000
const GO2RTC_PUT_TIMEOUT_MS = 3_000
const GO2RTC_PING_TIMEOUT_MS = 1_500
const CHANNEL_CACHE_TTL_MS = 10 * 60_000
const DSS_PAGE_SIZE = 500

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

export function createDssLiveRouter({ projectRoot }) {
  const overridesPath = path.join(projectRoot, 'data', 'dss', 'dss-channel-overrides.json')

  const cfg = () => ({
    host: process.env.DSS_HOST?.trim() || '',
    port: Number(process.env.DSS_PORT || 443),
    user: process.env.DSS_USER?.trim() || '',
    pass: process.env.DSS_PASS ?? '',
    camUser: process.env.CAM_RTSP_USER?.trim() || '',
    camPass: process.env.CAM_RTSP_PASS ?? '',
    camPort: Number(process.env.CAM_RTSP_PORT || 554),
    /** subtype 0 = stream principal, 1 = sub-stream (menos ancho de banda). */
    camSubtype: String(process.env.CAM_RTSP_SUBTYPE ?? '1'),
    go2rtcBase: (process.env.GO2RTC_BASE?.trim() || 'http://127.0.0.1:1984').replace(/\/$/, ''),
  })

  const isDssConfigured = () => {
    const c = cfg()
    return Boolean(c.host && c.user && c.pass)
  }

  const areCamCredentialsConfigured = () => {
    const c = cfg()
    return Boolean(c.camUser && c.camPass)
  }

  // ── HTTP hacia el DSS (cert autofirmado → node:https con rejectUnauthorized:false) ──

  function dssHttpJson(method, apiPath, { token, body } = {}) {
    const c = cfg()
    const payload = body ? JSON.stringify(body) : null
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          host: c.host,
          port: c.port,
          path: apiPath,
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
      req.setTimeout(DSS_HTTP_TIMEOUT_MS, () => req.destroy(new Error(`Timeout DSS (${DSS_HTTP_TIMEOUT_MS}ms) en ${method} ${apiPath}`)))
      req.on('error', (e) => reject(new Error(`Error de red hacia DSS ${c.host}:${c.port}: ${e.message}`)))
      if (payload) req.write(payload)
      req.end()
    })
  }

  // ── Sesión DSS: login MD5 en 2 pasos + cache de token + keepalive ──

  let session = null // { token, expiresAt }
  let keepaliveTimer = null

  function invalidateDssSession() {
    session = null
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer)
      keepaliveTimer = null
    }
  }

  async function dssLogin() {
    const c = cfg()
    // El primer paso responde HTTP 401 con realm/randomKey: es el challenge, no un error.
    const first = await dssHttpJson('POST', DSS_API.authorize, {
      body: { userName: c.user, ipAddress: '', clientType: 'WINPC_V2' },
    })
    const { realm, randomKey, encryptType } = first.json ?? {}
    if (!realm || !randomKey) {
      throw new Error(`Login DSS: primer paso no devolvió realm/randomKey (HTTP ${first.status}): ${first.text.slice(0, 300)}`)
    }

    const temp1 = md5(c.pass)
    const temp2 = md5(c.user + temp1)
    const temp3 = md5(temp2)
    const temp4 = md5(`${c.user}:${realm}:${temp3}`)
    const signature = md5(`${temp4}:${randomKey}`)

    const second = await dssHttpJson('POST', DSS_API.authorize, {
      body: {
        userName: c.user,
        signature,
        randomKey,
        encryptType: encryptType ?? 'MD5',
        ipAddress: '',
        clientType: 'WINPC_V2',
        userType: '0',
      },
    })
    if (second.status !== 200 || !second.json?.token) {
      throw new Error(`Login DSS falló (HTTP ${second.status}): ${second.text.slice(0, 300)}`)
    }
    return second.json // { token, duration, ... }
  }

  async function getDssToken() {
    if (session && Date.now() < session.expiresAt) return session.token
    invalidateDssSession()
    const login = await dssLogin()
    // Este DSS devuelve duration=30 (segundos): el margen de renovación tiene que ser corto.
    const durationSec = Number(login.duration) > 0 ? Number(login.duration) : 300
    const freshMs = () => Math.max(Math.floor(durationSec * 0.6), 10) * 1000
    session = { token: login.token, expiresAt: Date.now() + freshMs() }
    keepaliveTimer = setInterval(async () => {
      const current = session
      if (!current) return
      try {
        const res = await dssHttpJson('PUT', DSS_API.keepalive, { token: current.token, body: { token: current.token } })
        if (res.status !== 200) throw new Error(`keepalive HTTP ${res.status}`)
        current.expiresAt = Date.now() + freshMs()
      } catch {
        invalidateDssSession()
      }
    }, Math.max(Math.floor(durationSec / 3), 5) * 1000)
    keepaliveTimer.unref()
    return session.token
  }

  const isAuthExpired = (res) =>
    res?.status === 401 || res?.json?.code === 1101 || res?.json?.code === 4128

  /** Ejecuta fn(token); ante token vencido invalida sesión y reintenta 1 vez. */
  async function withDssAuth(fn) {
    const token = await getDssToken()
    const first = await fn(token)
    if (!isAuthExpired(first)) return first
    invalidateDssSession()
    const fresh = await getDssToken()
    return fn(fresh)
  }

  // ── Inventario DSS: canal (nombre) → channelId + IP de la cámara ──

  let channelCache = null // { at, map: Map<lowerName, entry> }

  /** Recorre las páginas de un endpoint `…/page` del DSS y junta `data.pageData`. */
  async function fetchAllPages(apiPath) {
    const rows = []
    for (let page = 1; page <= 20; page += 1) {
      const res = await withDssAuth((token) =>
        dssHttpJson('GET', `${apiPath}?page=${page}&pageSize=${DSS_PAGE_SIZE}`, { token })
      )
      if (res.json?.code !== 1000) {
        throw new Error(`DSS ${apiPath} respondió code ${res.json?.code ?? res.status}: ${res.json?.desc ?? res.text?.slice(0, 200)}`)
      }
      const pageData = res.json?.data?.pageData ?? []
      rows.push(...pageData)
      const total = Number(res.json?.data?.totalCount ?? rows.length)
      if (rows.length >= total || pageData.length === 0) break
    }
    return rows
  }

  function readOverrides() {
    try {
      const raw = fs.readFileSync(overridesPath, 'utf8')
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  async function loadChannelMap({ force = false } = {}) {
    if (!force && channelCache && Date.now() - channelCache.at < CHANNEL_CACHE_TTL_MS) return channelCache.map
    const [channels, devices] = await Promise.all([
      fetchAllPages(DSS_API.channelPage),
      fetchAllPages(DSS_API.devicePage),
    ])
    const ipByDevice = new Map(devices.map((d) => [d.deviceCode, d.deviceIp]))
    const map = new Map()
    for (const ch of channels) {
      if (ch?.unitType !== VIDEO_UNIT_TYPE) continue
      const name = String(ch.channelName ?? '').trim()
      if (!name) continue
      map.set(name.toLowerCase(), {
        name,
        channelId: ch.channelId ?? null,
        deviceCode: ch.deviceCode ?? null,
        deviceIp: ipByDevice.get(ch.deviceCode) ?? null,
        orgName: ch.orgName ?? null,
        source: 'dss',
      })
    }
    // Overrides manuales: `{ "RicCal01": "192.168.4.35" }` o una URL rtsp:// completa.
    for (const [deviceCode, value] of Object.entries(readOverrides())) {
      if (typeof value !== 'string' || !value.trim()) continue
      const key = deviceCode.trim().toLowerCase()
      const base = map.get(key) ?? { name: deviceCode, channelId: null, deviceCode: null, deviceIp: null, orgName: null }
      map.set(key, value.startsWith('rtsp://')
        ? { ...base, rtspUrl: value.trim(), source: 'override' }
        : { ...base, deviceIp: value.trim(), source: 'override' })
    }
    channelCache = { at: Date.now(), map }
    return map
  }

  async function resolveCamera(deviceCode) {
    const map = await loadChannelMap()
    const needle = deviceCode.trim().toLowerCase()
    const hit = map.get(needle)
    if (hit) return { camera: hit }
    const suggestions = [...map.values()]
      .filter((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()))
      .slice(0, 8)
      .map((c) => c.name)
    return { notFound: true, suggestions }
  }

  /** URL RTSP de la cámara (Dahua): las credenciales van en la URL, que nunca sale del server. */
  function buildRtspUrl(camera) {
    if (camera.rtspUrl) return camera.rtspUrl
    const c = cfg()
    if (!camera.deviceIp) {
      throw new Error(`El DSS no informa IP para ${camera.name}. Agregá un override en data/dss/dss-channel-overrides.json.`)
    }
    const auth = `${encodeURIComponent(c.camUser)}:${encodeURIComponent(c.camPass)}`
    return `rtsp://${auth}@${camera.deviceIp}:${c.camPort}/cam/realmonitor?channel=1&subtype=${c.camSubtype}`
  }

  // ── go2rtc (HTTP plano local) ──

  const streamNameFor = (deviceCode) => deviceCode.toLowerCase().replace(/[^a-z0-9_-]/g, '')

  async function registerGo2rtcStream(name, rtspUrl) {
    const c = cfg()
    const url = `${c.go2rtcBase}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtspUrl)}`
    const res = await fetch(url, { method: 'PUT', signal: AbortSignal.timeout(GO2RTC_PUT_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`go2rtc respondió HTTP ${res.status} al registrar el stream`)
  }

  async function pingGo2rtc() {
    const c = cfg()
    try {
      const res = await fetch(`${c.go2rtcBase}/api/streams`, { signal: AbortSignal.timeout(GO2RTC_PING_TIMEOUT_MS) })
      return res.ok
    } catch {
      return false
    }
  }

  // ── Handlers Express ──

  async function status(_req, res) {
    try {
      const c = cfg()
      res.json({
        dssConfigured: isDssConfigured(),
        dssHost: c.host || null,
        dssSession: session && Date.now() < session.expiresAt ? 'active' : 'none',
        camCredentialsConfigured: areCamCredentialsConfigured(),
        go2rtcBase: c.go2rtcBase,
        go2rtcOk: await pingGo2rtc(),
        channelCacheCount: channelCache?.map.size ?? 0,
      })
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  async function listChannels(_req, res) {
    try {
      if (!isDssConfigured()) {
        res.status(503).json({ error: 'DSS no configurado: faltan DSS_HOST/DSS_USER/DSS_PASS en .env del server.', code: 'dss_not_configured' })
        return
      }
      const map = await loadChannelMap({ force: true })
      res.json({ channels: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)) })
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e), code: 'dss_error' })
    }
  }

  async function getStream(req, res) {
    const deviceCode = String(req.params.deviceCode ?? '')
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceCode)) {
      res.status(400).json({ error: `deviceCode inválido: ${deviceCode.slice(0, 80)}` })
      return
    }
    if (!isDssConfigured()) {
      res.status(503).json({ error: 'DSS no configurado: faltan DSS_HOST/DSS_USER/DSS_PASS en .env del server.', code: 'dss_not_configured' })
      return
    }
    if (!areCamCredentialsConfigured()) {
      res.status(503).json({
        error: 'Faltan credenciales de cámara: definí CAM_RTSP_USER/CAM_RTSP_PASS en el .env del server (usuario de solo-visualización de las Dahua).',
        code: 'cam_credentials_missing',
      })
      return
    }
    try {
      const resolved = await resolveCamera(deviceCode)
      if (resolved.notFound) {
        const hint = resolved.suggestions.length > 0 ? ` Canales parecidos: ${resolved.suggestions.join(', ')}.` : ''
        res.status(404).json({
          error: `Cámara no encontrada en el DSS para ${deviceCode}.${hint} Ver GET /api/truckflow/live-camera/channels o agregar override en data/dss/dss-channel-overrides.json.`,
          code: 'channel_not_found',
          suggestions: resolved.suggestions,
        })
        return
      }
      const rtspUrl = buildRtspUrl(resolved.camera)
      const streamName = streamNameFor(deviceCode)
      try {
        await registerGo2rtcStream(streamName, rtspUrl)
      } catch (e) {
        res.status(502).json({
          error: `go2rtc no responde en ${cfg().go2rtcBase}. Ejecutá go2rtc.exe en esta PC (ver docs/POC_DSS_LIVE.md). Detalle: ${e instanceof Error ? e.message : String(e)}`,
          code: 'go2rtc_unreachable',
        })
        return
      }
      res.json({
        deviceCode,
        streamName,
        playerUrl: `${cfg().go2rtcBase}/stream.html?src=${encodeURIComponent(streamName)}`,
        streamType: cfg().camSubtype === '0' ? 'main' : 'sub',
      })
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e), code: 'dss_error' })
    }
  }

  return { status, getStream, listChannels, isDssConfigured }
}
