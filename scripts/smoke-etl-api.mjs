#!/usr/bin/env node
/**
 * Smoke test de la API de corridas ETL (Fase 4.3).
 * Uso: npm run smoke:etl
 * Env: TRUCKFLOW_LOCAL_SERVER_PORT (default 8787), SMOKE_ETL_BASE (override URL completa).
 * Si el server no responde, lo levanta en un puerto efímero y lo apaga al terminar.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..')
const FIXTURE = 'tests/fixtures/etl/s-events-slice.json'
const DEFAULT_PORT = Number(process.env.TRUCKFLOW_LOCAL_SERVER_PORT || 8787)

function fail(msg) {
  console.error(`[smoke:etl] FAIL: ${msg}`)
  process.exitCode = 1
}

function ok(msg) {
  console.info(`[smoke:etl] OK: ${msg}`)
}

async function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close((err) => (err ? reject(err) : resolvePort(port)))
    })
    s.on('error', reject)
  })
}

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { res, body }
}

async function ping(base) {
  try {
    const health = await fetchJson(`${base}/api/truckflow/health`)
    if (!health.res.ok) return false
    // Otro proceso puede ocupar el puerto sin endpoints ETL: exigir shape de Fase 4.
    const etl = await fetchJson(`${base}/api/etl/runs`)
    return etl.res.ok && Array.isArray(etl.body?.runs)
  } catch {
    return false
  }
}

function startServer(port) {
  const child = spawn(process.execPath, [resolve(PROJECT_ROOT, 'server/truckflow-local-server.mjs')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, TRUCKFLOW_LOCAL_SERVER_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return child
}

async function waitForServer(base, child, timeoutMs = 20_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (child && (child.exitCode != null || child.signalCode)) {
      throw new Error(`Server salió antes de estar listo (code=${child.exitCode})`)
    }
    if (await ping(base)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Timeout esperando ${base}`)
}

async function runSmoke(base) {
  const post = await fetchJson(`${base}/api/etl/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventsPaths: [FIXTURE] }),
  })
  if (!post.res.ok || !post.body?.runId) {
    fail(`POST /api/etl/runs → ${post.res.status} ${JSON.stringify(post.body).slice(0, 500)}`)
    return
  }
  const runId = post.body.runId
  ok(`POST runId=${runId}`)

  const list = await fetchJson(`${base}/api/etl/runs`)
  if (!list.res.ok || !Array.isArray(list.body?.runs)) {
    fail(`GET /api/etl/runs shape inválido`)
    return
  }
  if (!list.body.runs.some((r) => r.runId === runId)) {
    fail(`runId ${runId} no aparece en la lista`)
    return
  }
  ok(`GET /api/etl/runs (${list.body.runs.length} manifests)`)

  const summary = await fetchJson(`${base}/api/etl/runs/${runId}/summary`)
  if (!summary.res.ok || !summary.body?.stats?.executive) {
    fail(`GET summary sin stats.executive`)
    return
  }
  const ex = summary.body.stats.executive
  if (typeof ex.committeeCompletos !== 'number') {
    fail(`committeeCompletos no numérico`)
    return
  }
  ok(`GET summary committeeCompletos=${ex.committeeCompletos}`)

  const tables = await fetchJson(`${base}/api/etl/runs/${runId}/tables`)
  if (!tables.res.ok || !Array.isArray(tables.body?.tables) || tables.body.tables.length < 10) {
    fail(`GET tables esperaba ≥10 nombres, got ${tables.body?.tables?.length}`)
    return
  }
  ok(`GET tables count=${tables.body.tables.length}`)

  const fc = await fetchJson(`${base}/api/etl/runs/${runId}/tables/final_circuits?limit=5`)
  if (!fc.res.ok || !Array.isArray(fc.body?.rows) || !Array.isArray(fc.body?.headers)) {
    fail(`GET final_circuits shape inválido`)
    return
  }
  ok(`GET final_circuits rows=${fc.body.rows.length} total=${fc.body.total}`)

  const cat = await fetchJson(`${base}/api/etl/catalog/circuits`)
  if (!cat.res.ok || cat.body?.catalog == null) {
    fail(`GET catalog/circuits falló`)
    return
  }
  ok(`GET catalog/circuits`)
}

async function main() {
  let base = process.env.SMOKE_ETL_BASE?.trim() || ''
  let child = null
  try {
    if (!base) {
      const preferred = `http://127.0.0.1:${DEFAULT_PORT}`
      if (await ping(preferred)) {
        base = preferred
        ok(`usando server existente en ${base}`)
      } else {
        const port = await getFreePort()
        base = `http://127.0.0.1:${port}`
        child = startServer(port)
        await waitForServer(base, child)
        ok(`server propio en ${base}`)
      }
    } else {
      await waitForServer(base, null)
      ok(`usando SMOKE_ETL_BASE=${base}`)
    }

    await runSmoke(base)
    if (!process.exitCode) console.info('[smoke:etl] PASS')
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  } finally {
    if (child && !child.killed) {
      child.kill('SIGTERM')
    }
  }
}

await main()
