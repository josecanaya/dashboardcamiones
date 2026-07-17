// Video en vivo desde DSS Professional V8.x — cliente OpenAPI + registro en go2rtc.
// Runbook y arquitectura: docs/POC_DSS_LIVE.md. Espejo de scripts/poc-dss-live.mjs.
//
// Flujo por request de stream:
//   deviceCode (RicCal01) → channelId DSS (por nombre de canal u override manual)
//   → POST realmonitor/uri → URL RTSP con token temporal (Media Gateway)
//   → PUT go2rtc /api/streams → playerUrl local para el browser.
//
// Credenciales DSS solo en .env del server; el browser nunca ve host/token del DSS.

import crypto from 'node:crypto'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'

/** Paths de la OpenAPI DSS — único lugar a ajustar si un build difiere. */
const DSS_API = {
  authorize: '/brms/api/v1.0/accounts/authorize',
  keepalive: '/brms/api/v1.0/accounts/keepalive',
  rtspUri: '/vms/api/v1.0/realmonitor/uri',
  channelCandidates: [
    ['GET', '/brms/api/v1.1/tree/channels?page=1&pageSize=500'],
    ['GET', '/brms/api/v1.0/tree/channels?page=1&pageSize=500'],
    ['GET', '/brms/api/v1.0/devices?page=1&pageSize=500'],
    ['POST', '/brms/api/v1.0/tree/list', {}],
  ],
}

const DSS_HTTP_TIMEOUT_MS = 15_000
const GO2RTC_PUT_TIMEOUT_MS = 3_000
const GO2RTC_PING_TIMEOUT_MS = 1_500
const CHANNEL_CACHE_TTL_MS = 10 * 60_000

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

export function createDssLiveRouter({ projectRoot }) {
  const overridesPath = path.join(projectRoot, 'data', 'dss', 'dss-channel-overrides.json')

  const cfg = () => ({
    host: process.env.DSS_HOST?.trim() || '',
    port: Number(process.env.DSS_PORT || 443),
    user: process.env.DSS_USER?.trim() || '',
    pass: process.env.DSS_PASS ?? '',
    go2rtcBase: (process.env.GO2RTC_BASE?.trim() || 'http://127.0.0.1:1984').replace(/\/$/, ''),
  })

  const isDssConfigured = () => {
    const c = cfg()
    return Boolean(c.host && c.user && c.pass)
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
    const durationSec = Number(login.duration) > 0 ? Number(login.duration) : 300
    session = { token: login.token, expiresAt: Date.now() + Math.max(durationSec - 60, 30) * 1000 }
    keepaliveTimer = setInterval(async () => {
      const current = session
      if (!current) return
      try {
        const res = await dssHttpJson('PUT', DSS_API.keepalive, { token: current.token, body: { token: current.token } })
        if (res.status !== 200) throw new Error(`keepalive HTTP ${res.status}`)
        current.expiresAt = Date.now() + Math.max(durationSec - 60, 30) * 1000
      } catch {
        invalidateDssSession()
      }
    }, Math.max(Math.floor(durationSec / 3), 20) * 1000)
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

  // ── Canales: mapeo automático nombre→channelId + overrides manuales ──

  let channelCache = null // { at, map: Map<lowerName, {channelId, name, source}> }

  function extractChannels(json) {
    // Extractor tolerante: busca arrays de objetos con id+nombre en shapes conocidos.
    const buckets = []
    const visit = (node, depth) => {
      if (!node || depth > 4) return
      if (Array.isArray(node)) {
        buckets.push(node)
        return
      }
      if (typeof node === 'object') {
        for (const v of Object.values(node)) visit(v, depth + 1)
      }
    }
    visit(json, 0)
    const out = []
    for (const arr of buckets) {
      for (const item of arr) {
        if (!item || typeof item !== 'object') continue
        const channelId = item.channelId ?? item.id ?? item.channelCode
        const name = item.channelName ?? item.name ?? item.channelAlias
        if (typeof channelId === 'string' && typeof name === 'string' && channelId.length > 0 && name.length > 0) {
          out.push({ channelId, name })
        }
      }
    }
    return out
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
    const map = new Map()
    const res = await withDssAuth(async (token) => {
      for (const [method, apiPath, body] of DSS_API.channelCandidates) {
        const r = await dssHttpJson(method, apiPath, { token, ...(body !== undefined ? { body } : {}) })
        if (isAuthExpired(r)) return r
        if (r.status === 200 && r.json) {
          const channels = extractChannels(r.json)
          if (channels.length > 0) return { status: 200, channels }
        }
      }
      return { status: 200, channels: [] }
    })
    for (const ch of res.channels ?? []) {
      map.set(ch.name.trim().toLowerCase(), { channelId: ch.channelId, name: ch.name, source: 'dss' })
    }
    for (const [deviceCode, channelId] of Object.entries(readOverrides())) {
      if (typeof channelId !== 'string') continue
      map.set(deviceCode.trim().toLowerCase(), { channelId, name: deviceCode, source: 'override' })
    }
    channelCache = { at: Date.now(), map }
    return map
  }

  async function resolveChannelId(deviceCode) {
    const map = await loadChannelMap()
    const hit = map.get(deviceCode.trim().toLowerCase())
    if (hit) return { channelId: hit.channelId }
    const needle = deviceCode.trim().toLowerCase()
    const suggestions = [...map.values()]
      .filter((c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase()))
      .slice(0, 8)
      .map((c) => c.name)
    return { notFound: true, suggestions }
  }

  async function getRtspUrl(channelId) {
    const res = await withDssAuth((token) =>
      dssHttpJson('POST', DSS_API.rtspUri, {
        token,
        body: { channelId, streamType: '2', type: 'rtsp' },
      })
    )
    const url = res.json?.data?.url ?? res.json?.url ?? null
    if (res.status !== 200 || !url) {
      throw new Error(`DSS no devolvió URL RTSP para canal ${channelId} (HTTP ${res.status}): ${res.text?.slice(0, 300)}`)
    }
    return url
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
    try {
      const resolved = await resolveChannelId(deviceCode)
      if (resolved.notFound) {
        const hint = resolved.suggestions.length > 0 ? ` Canales parecidos: ${resolved.suggestions.join(', ')}.` : ''
        res.status(404).json({
          error: `Canal DSS no encontrado para ${deviceCode}.${hint} Ver GET /api/truckflow/live-camera/channels o agregar override en data/dss/dss-channel-overrides.json.`,
          code: 'channel_not_found',
          suggestions: resolved.suggestions,
        })
        return
      }
      const rtspUrl = await getRtspUrl(resolved.channelId)
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
        streamType: 'sub',
      })
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e), code: 'dss_error' })
    }
  }

  return { status, getStream, listChannels, isDssConfigured }
}
