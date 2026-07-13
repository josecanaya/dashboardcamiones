/**
 * Servidor local: extracción día a día hacia data/truckflow/ y lectura fusionada para el dashboard.
 * Puerto: TRUCKFLOW_LOCAL_SERVER_PORT (default 8787)
 */
import './load-env.mjs'
import cors from 'cors'
import express from 'express'
import fs from 'fs/promises'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createTruckPlateRegistryRouter } from './truck-plate-registry.mjs'
import { createTruckFleetRouter } from './truck-fleet-registry.mjs'
import { supabasePublicHost } from './supabase-client.mjs'
import {
  buildApiJourneyDayStat,
  countUniqueRawJourneyUids,
} from './truckflow-raw-journey-stats.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const DATA_ROOT = path.join(PROJECT_ROOT, 'data', 'truckflow')
const POWERBI_ROOT = path.join(PROJECT_ROOT, 'data', 'powerbi')
const RUNS_ROOT = path.join(PROJECT_ROOT, 'runs')
const ETL_HEADLESS_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'run-etl-headless.ts')


const DEFAULT_API_BASE = process.env.TRUCKFLOW_EXPORT_API_BASE?.trim() || 'http://138.36.237.33:8090'
const FETCH_TIMEOUT_MS = Number(process.env.TRUCKFLOW_FETCH_TIMEOUT_MS || 120_000)
const PORT = Number(process.env.TRUCKFLOW_LOCAL_SERVER_PORT || 8787)
/** Días descargados en paralelo en export-period (eventos+alertas siguen en serie por día). */
const EXPORT_PERIOD_CONCURRENCY = Math.max(
  1,
  Math.min(7, Number(process.env.TRUCKFLOW_EXPORT_CONCURRENCY || 3))
)

function extractArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const obj = payload
    if (Array.isArray(obj.value)) return obj.value
    if (Array.isArray(obj.data)) return obj.data
    if (Array.isArray(obj.events)) return obj.events
    if (Array.isArray(obj.alerts)) return obj.alerts
    if (Array.isArray(obj.items)) return obj.items
    if (Array.isArray(obj.records)) return obj.records
  }
  return []
}

async function fetchJson(url) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
    const text = await res.text()
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      throw new Error(`Respuesta no JSON (${url.slice(0, 80)}… primeros caracteres: ${text.slice(0, 120)}…)`)
    }
  } finally {
    clearTimeout(t)
  }
}

function parseDay(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d).trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const dt = new Date(y, mo - 1, da)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return null
  return { y, mo, da, iso: `${m[1]}-${m[2]}-${m[3]}` }
}

function daysInclusive(startStr, endStr) {
  const a = parseDay(startStr)
  const b = parseDay(endStr)
  if (!a || !b) throw new Error('startDate/endDate deben ser YYYY-MM-DD')
  let cur = new Date(a.y, a.mo - 1, a.da)
  const end = new Date(b.y, b.mo - 1, b.da)
  if (cur > end) throw new Error('startDate debe ser <= endDate')
  const out = []
  while (cur <= end) {
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    out.push(iso)
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)
  }
  return out
}

function mapUiSiteToQuery(site) {
  const s = String(site ?? '').trim().toLowerCase()
  if (!s || s === 'all' || s === 'todos') return ''
  if (s === 'ricardone') return 'Ricardone'
  if (s === 'san_lorenzo' || s === 'sanlorenzo') return 'San Lorenzo'
  return String(site ?? '').trim()
}

function buildListUrl(baseUrl, pathname, dayIso, siteQuery) {
  const u = new URL(pathname.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  u.searchParams.set('startDate', `${dayIso}T00:00:00`)
  u.searchParams.set('endDate', `${dayIso}T23:59:59`)
  if (siteQuery) u.searchParams.set('site', siteQuery)
  return u.toString()
}

/** Rango arbitrario dentro de una partición de día (`partitionDay`). */
function buildListUrlAbsolute(baseUrl, pathname, startIso, endIso, siteQuery) {
  const u = new URL(pathname.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  u.searchParams.set('startDate', String(startIso).trim())
  u.searchParams.set('endDate', String(endIso).trim())
  if (siteQuery) u.searchParams.set('site', siteQuery)
  return u.toString()
}

/** Prefijo calendario YYYY-MM-DD de un parámetro `startDate`/`endDate` (evita depender de TZ al validar). */
function calendarDayPrefixFromParam(s) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s).trim())
  return m ? m[1] : null
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeJsonAtomic(filePath, obj) {
  await ensureDir(path.dirname(filePath))
  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const app = express()
app.use(cors({ origin: true }))
const JSON_BODY_LIMIT = process.env.TRUCKFLOW_JSON_BODY_LIMIT?.trim() || '64mb'
app.use(express.json({ limit: JSON_BODY_LIMIT }))

const plateRegistry = createTruckPlateRegistryRouter({
  projectRoot: PROJECT_ROOT,
  ensureDir,
  writeJsonAtomic,
  readJsonIfExists,
})

const fleetRegistry = createTruckFleetRouter({
  projectRoot: PROJECT_ROOT,
  ensureDir,
  writeJsonAtomic,
  readJsonIfExists,
  lookupRegistryEntry: (plate) => plateRegistry.lookupPlateEntry(plate),
})

app.get('/api/truckflow/health', (_req, res) => {
  res.json({
    ok: true,
    dataRoot: DATA_ROOT,
    plateRegistryRoot: plateRegistry.registryRoot,
    plateRegistryStorage: plateRegistry.storageMode,
    fleetRegistryRoot: fleetRegistry.fleetRoot,
    fleetRegistryStorage: fleetRegistry.storageMode,
    supabaseHost: supabasePublicHost(),
    supabaseConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  })
})

/** Catálogo manual de patentes (JSON en data/truck-registry/). */
app.get('/api/truckflow/plate-registry', plateRegistry.getRegistry)
app.get('/api/truckflow/plate-registry/lookup', plateRegistry.lookupPlate)
app.post('/api/truckflow/plate-registry', plateRegistry.createEntry)
app.put('/api/truckflow/plate-registry/:id', plateRegistry.updateEntry)
app.delete('/api/truckflow/plate-registry/:id', plateRegistry.deleteEntry)

app.get('/api/truckflow/fleet/lookup', fleetRegistry.lookup)
app.get('/api/truckflow/fleet/status', fleetRegistry.status)
app.patch('/api/truckflow/fleet/camion/:plate', fleetRegistry.updateCamion)
app.post('/api/truckflow/fleet/visitas/sync', fleetRegistry.syncVisitas)

/** Lista carpetas día existentes (YYYY-MM-DD). */
app.get('/api/truckflow/list-days', async (_req, res) => {
  try {
    await ensureDir(DATA_ROOT)
    const names = await fs.readdir(DATA_ROOT)
    const days = []
    for (const n of names) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(n)) continue
      const st = await fs.stat(path.join(DATA_ROOT, n)).catch(() => null)
      if (st?.isDirectory()) days.push(n)
    }
    days.sort()
    res.json({ days, dataRoot: DATA_ROOT })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

async function mapPool(items, worker, concurrency) {
  const n = Math.min(Math.max(1, concurrency), items.length || 1)
  const results = new Array(items.length)
  let next = 0
  async function runWorker() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: n }, () => runWorker()))
  return results
}

async function exportSingleDay(dayIso, baseUrl, siteQ) {
  const dayDir = path.join(DATA_ROOT, dayIso)
  const eventPath = path.join(dayDir, 'event-list.json')
  const alertPath = path.join(dayDir, 'alert-list.json')
  let eventsDownloaded = 0
  let alertsDownloaded = 0
  let uniqueJourneyUids = 0
  let uniqueAlertJourneyUids = 0
  let status = 'ok'
  let error = ''

  try {
    const evUrl = buildListUrl(baseUrl, '/journey-event/list', dayIso, siteQ)
    const alUrl = buildListUrl(baseUrl, '/alert/list', dayIso, siteQ)
    const [evPayload, alPayload] = await Promise.all([fetchJson(evUrl), fetchJson(alUrl)])
    const evRecords = extractArray(evPayload)
    eventsDownloaded = evRecords.length
    uniqueJourneyUids = countUniqueRawJourneyUids(evRecords)
    await writeJsonAtomic(eventPath, {
      day: dayIso,
      fetchedAt: new Date().toISOString(),
      endpoint: 'journey-event/list',
      baseUrl,
      siteFilter: siteQ || null,
      recordCount: eventsDownloaded,
      records: evRecords,
    })

    const alRecords = extractArray(alPayload)
    alertsDownloaded = alRecords.length
    uniqueAlertJourneyUids = countUniqueRawJourneyUids(alRecords)
    await writeJsonAtomic(alertPath, {
      day: dayIso,
      fetchedAt: new Date().toISOString(),
      endpoint: 'alert/list',
      baseUrl,
      siteFilter: siteQ || null,
      recordCount: alertsDownloaded,
      records: alRecords,
    })
  } catch (e) {
    status = 'error'
    error = e instanceof Error ? e.message : String(e)
    await ensureDir(dayDir)
    try {
      await writeJsonAtomic(eventPath, {
        day: dayIso,
        fetchedAt: new Date().toISOString(),
        endpoint: 'journey-event/list',
        error,
        recordCount: 0,
        records: [],
      })
      await writeJsonAtomic(alertPath, {
        day: dayIso,
        fetchedAt: new Date().toISOString(),
        endpoint: 'alert/list',
        error,
        recordCount: 0,
        records: [],
      })
    } catch {
      /* noop */
    }
  }

  return {
    day: dayIso,
    eventsDownloaded,
    alertsDownloaded,
    uniqueJourneyUids: status === 'ok' ? uniqueJourneyUids : 0,
    uniqueAlertJourneyUids: status === 'ok' ? uniqueAlertJourneyUids : 0,
    status,
    error: error || undefined,
  }
}

/** Body: { partitionDay, startDatetime, endDatetime, site?, baseUrl? } guarda en data/truckflow/partitionDay/ */
app.post('/api/truckflow/export-window', async (req, res) => {
  const partitionDay = String(req.body?.partitionDay ?? '').trim()
  const startDatetime = String(req.body?.startDatetime ?? '').trim()
  const endDatetime = String(req.body?.endDatetime ?? '').trim()
  const baseUrl = String(req.body?.baseUrl ?? DEFAULT_API_BASE).trim().replace(/\/$/, '')
  const siteQ = mapUiSiteToQuery(req.body?.site)

  const parsed = parseDay(partitionDay)
  if (!parsed) {
    res.status(400).json({ error: 'partitionDay debe ser YYYY-MM-DD' })
    return
  }
  if (!startDatetime || !endDatetime) {
    res.status(400).json({ error: 'startDatetime y endDatetime son obligatorios' })
    return
  }
  const dkStart = calendarDayPrefixFromParam(startDatetime)
  const dkEnd = calendarDayPrefixFromParam(endDatetime)
  if (!dkStart || !dkEnd || dkStart !== parsed.iso || dkEnd !== parsed.iso) {
    res.status(400).json({
      error: `startDatetime/endDatetime deben comenzar con partitionDay (${parsed.iso}). Recibido ${dkStart ?? '?'} … ${dkEnd ?? '?'}`,
    })
    return
  }

  const dayDir = path.join(DATA_ROOT, parsed.iso)
  const eventPath = path.join(dayDir, 'event-list.json')
  const alertPath = path.join(dayDir, 'alert-list.json')
  let eventsDownloaded = 0
  let alertsDownloaded = 0
  let uniqueJourneyUids = 0
  let status = 'ok'
  let errorMsg = ''

  try {
    const evUrl = buildListUrlAbsolute(baseUrl, '/journey-event/list', startDatetime, endDatetime, siteQ)
    const alUrl = buildListUrlAbsolute(baseUrl, '/alert/list', startDatetime, endDatetime, siteQ)
    const [evPayload, alPayload] = await Promise.all([fetchJson(evUrl), fetchJson(alUrl)])
    const evRecords = extractArray(evPayload)
    eventsDownloaded = evRecords.length
    uniqueJourneyUids = countUniqueRawJourneyUids(evRecords)
    await writeJsonAtomic(eventPath, {
      day: parsed.iso,
      fetchedAt: new Date().toISOString(),
      endpoint: 'journey-event/list',
      baseUrl,
      siteFilter: siteQ || null,
      queryStart: startDatetime,
      queryEnd: endDatetime,
      recordCount: eventsDownloaded,
      records: evRecords,
    })

    const alRecords = extractArray(alPayload)
    alertsDownloaded = alRecords.length
    await writeJsonAtomic(alertPath, {
      day: parsed.iso,
      fetchedAt: new Date().toISOString(),
      endpoint: 'alert/list',
      baseUrl,
      siteFilter: siteQ || null,
      queryStart: startDatetime,
      queryEnd: endDatetime,
      recordCount: alertsDownloaded,
      records: alRecords,
    })
  } catch (e) {
    status = 'error'
    errorMsg = e instanceof Error ? e.message : String(e)
    await ensureDir(dayDir)
    try {
      await writeJsonAtomic(eventPath, {
        day: parsed.iso,
        fetchedAt: new Date().toISOString(),
        endpoint: 'journey-event/list',
        queryStart: startDatetime,
        queryEnd: endDatetime,
        error: errorMsg,
        recordCount: 0,
        records: [],
      })
      await writeJsonAtomic(alertPath, {
        day: parsed.iso,
        fetchedAt: new Date().toISOString(),
        endpoint: 'alert/list',
        queryStart: startDatetime,
        queryEnd: endDatetime,
        error: errorMsg,
        recordCount: 0,
        records: [],
      })
    } catch {
      /* noop */
    }
  }

  res.json({
    dataRoot: DATA_ROOT,
    baseUrl,
    site: siteQ || 'all',
    partitionDay: parsed.iso,
    startDatetime,
    endDatetime,
    eventsDownloaded,
    alertsDownloaded,
    uniqueJourneyUids: status === 'ok' ? uniqueJourneyUids : 0,
    status,
    error: errorMsg || undefined,
  })
})

/** Body: { day: YYYY-MM-DD, site?, baseUrl? } */
app.post('/api/truckflow/export-one-day', async (req, res) => {
  const dayRaw = String(req.body?.day ?? '').trim()
  const baseUrl = String(req.body?.baseUrl ?? DEFAULT_API_BASE).trim().replace(/\/$/, '')
  const siteQ = mapUiSiteToQuery(req.body?.site)
  const parsed = parseDay(dayRaw)
  if (!parsed) {
    res.status(400).json({ error: 'day debe ser YYYY-MM-DD' })
    return
  }
  try {
    const row = await exportSingleDay(parsed.iso, baseUrl, siteQ)
    res.json({ dataRoot: DATA_ROOT, baseUrl, site: siteQ || 'all', ...row })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/**
 * Body: { startDate, endDate, site?, baseUrl? }
 * site: ricardone | san_lorenzo | all | omit
 */
app.post('/api/truckflow/export-period', async (req, res) => {
  const startDate = String(req.body?.startDate ?? '').trim()
  const endDate = String(req.body?.endDate ?? '').trim()
  const baseUrl = String(req.body?.baseUrl ?? DEFAULT_API_BASE).trim().replace(/\/$/, '')
  const siteRaw = req.body?.site
  const siteQ = mapUiSiteToQuery(siteRaw)

  let days
  try {
    days = daysInclusive(startDate, endDate)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
    return
  }

  const summary = await mapPool(
    days,
    (dayIso) => exportSingleDay(dayIso, baseUrl, siteQ),
    EXPORT_PERIOD_CONCURRENCY
  )

  res.json({
    dataRoot: DATA_ROOT,
    baseUrl,
    startDate,
    endDate,
    site: siteQ || 'all',
    concurrency: EXPORT_PERIOD_CONCURRENCY,
    days: summary,
  })
})

/**
 * Body: { startDate, endDate }
 * Fusiona records de cada día (archivos guardados por export-period).
 */
/**
 * Body: { periodStart, periodEnd, loadGroupType?, files: Record<filename, csvText> }
 * Escribe salida Power BI en data/powerbi/semana_YYYY-MM-DD_YYYY-MM-DD/
 */
app.post('/api/truckflow/powerbi-export', async (req, res) => {
  const periodStart = String(req.body?.periodStart ?? '').trim()
  const periodEnd = String(req.body?.periodEnd ?? '').trim()
  const group = String(req.body?.loadGroupType ?? 'custom').trim()
  const files = req.body?.files
  if (!periodStart || !periodEnd || !files || typeof files !== 'object') {
    res.status(400).json({ error: 'periodStart, periodEnd y files son obligatorios' })
    return
  }
  const folderName =
    group === 'week' ?
      `semana_${periodStart}_${periodEnd}`
    : group === 'day' && periodStart === periodEnd ?
      `dia_${periodStart}`
    : `rango_${periodStart}_${periodEnd}`
  const outputDir = path.join(POWERBI_ROOT, folderName)
  try {
    await ensureDir(outputDir)
    const written = []
    for (const [name, content] of Object.entries(files)) {
      if (typeof content !== 'string') continue
      const safe = path.basename(String(name))
      if (!safe.endsWith('.csv') && !safe.endsWith('.json')) continue
      const fp = path.join(outputDir, safe)
      await fs.writeFile(fp, content, 'utf8')
      written.push(safe)
    }
    res.json({ ok: true, outputDir, files: written, powerBiRoot: POWERBI_ROOT })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.post('/api/truckflow/load-local-period', async (req, res) => {
  const startDate = String(req.body?.startDate ?? '').trim()
  const endDate = String(req.body?.endDate ?? '').trim()

  let days
  try {
    days = daysInclusive(startDate, endDate)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
    return
  }

  const mergedEvents = []
  const mergedAlerts = []
  const perDay = []

  const dayPayloads = await mapPool(
    days,
    async (dayIso) => {
      const dayDir = path.join(DATA_ROOT, dayIso)
      const [evDoc, alDoc] = await Promise.all([
        readJsonIfExists(path.join(dayDir, 'event-list.json')),
        readJsonIfExists(path.join(dayDir, 'alert-list.json')),
      ])
      const ev = evDoc ? extractArray(evDoc.records ?? evDoc) : []
      const al = alDoc ? extractArray(alDoc.records ?? alDoc) : []
      return { day: dayIso, eventFile: Boolean(evDoc), alertFile: Boolean(alDoc), ev, al }
    },
    Math.min(7, Math.max(2, EXPORT_PERIOD_CONCURRENCY))
  )

  for (const row of dayPayloads) {
    mergedEvents.push(...row.ev)
    mergedAlerts.push(...row.al)
    perDay.push(
      buildApiJourneyDayStat(row.day, row.ev, row.al, row.eventFile, row.alertFile)
    )
  }

  res.json({
    dataRoot: DATA_ROOT,
    startDate,
    endDate,
    daysLoaded: days.length,
    perDay,
    events: mergedEvents,
    alerts: mergedAlerts,
  })
})

/**
 * Body: { startDate, endDate }
 * Solo estadísticas de journeyUid en JSON en disco (sin devolver records).
 */
app.post('/api/truckflow/journey-stats-period', async (req, res) => {
  const startDate = String(req.body?.startDate ?? '').trim()
  const endDate = String(req.body?.endDate ?? '').trim()

  let days
  try {
    days = daysInclusive(startDate, endDate)
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) })
    return
  }

  const perDay = await mapPool(
    days,
    async (dayIso) => {
      const dayDir = path.join(DATA_ROOT, dayIso)
      const [evDoc, alDoc] = await Promise.all([
        readJsonIfExists(path.join(dayDir, 'event-list.json')),
        readJsonIfExists(path.join(dayDir, 'alert-list.json')),
      ])
      const ev = evDoc ? extractArray(evDoc.records ?? evDoc) : []
      const al = alDoc ? extractArray(alDoc.records ?? alDoc) : []
      return buildApiJourneyDayStat(dayIso, ev, al, Boolean(evDoc), Boolean(alDoc))
    },
    Math.min(7, Math.max(2, EXPORT_PERIOD_CONCURRENCY))
  )

  res.json({
    dataRoot: DATA_ROOT,
    startDate,
    endDate,
    perDay,
  })
})

// ─── ETL headless / corridas (Fase 4) ───────────────────────────────────────

function* etlDayRange(startIso, endIso) {
  const start = new Date(`${startIso}T12:00:00`)
  const end = new Date(`${endIso}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    yield `${y}-${m}-${day}`
  }
}

function resolveEtlEventsPaths({ eventsPaths, from, to }) {
  const paths = []
  if (Array.isArray(eventsPaths)) {
    for (const p of eventsPaths) {
      const abs = path.isAbsolute(p) ? p : path.resolve(PROJECT_ROOT, p)
      paths.push(abs)
    }
  }
  const fromDay = String(from ?? '').trim()
  const toDay = String(to ?? '').trim()
  if (fromDay && toDay) {
    for (const day of etlDayRange(fromDay, toDay)) {
      const eventPath = path.join(DATA_ROOT, day, 'event-list.json')
      if (existsSync(eventPath)) paths.push(eventPath)
    }
  }
  return [...new Set(paths)]
}

function readJsonSyncSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function listEtlRunManifests() {
  if (!existsSync(RUNS_ROOT)) return []
  const names = readdirSync(RUNS_ROOT, { withFileTypes: true })
  const out = []
  for (const ent of names) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue
    const manifest = readJsonSyncSafe(path.join(RUNS_ROOT, ent.name, 'manifest.json'))
    if (manifest) out.push(manifest)
  }
  out.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
  return out
}

/** POST /api/etl/runs — spawnea runner headless; responde { runId }. */
app.post('/api/etl/runs', (req, res) => {
  const eventsPaths = resolveEtlEventsPaths({
    eventsPaths: req.body?.eventsPaths,
    from: req.body?.from,
    to: req.body?.to,
  })
  if (!eventsPaths.length) {
    res.status(400).json({
      error: 'Indicá eventsPaths[] y/o from+to con event-list.json en data/truckflow/',
    })
    return
  }
  for (const p of eventsPaths) {
    if (!existsSync(p)) {
      res.status(400).json({ error: `No existe events path: ${p}` })
      return
    }
  }

  let excelPath = ''
  if (req.body?.excelPath) {
    excelPath = path.isAbsolute(req.body.excelPath)
      ? req.body.excelPath
      : path.resolve(PROJECT_ROOT, String(req.body.excelPath))
    if (!existsSync(excelPath)) {
      res.status(400).json({ error: `No existe excelPath: ${excelPath}` })
      return
    }
  }

  const args = [ETL_HEADLESS_SCRIPT, '--out', RUNS_ROOT]
  for (const p of eventsPaths) {
    args.push('--events', p)
  }
  if (excelPath) args.push('--excel', excelPath)

  const result = spawnSync('npx', ['tsx', ...args], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  })

  const stdout = String(result.stdout || '')
  const stderr = String(result.stderr || '')
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const runId = lines[lines.length - 1] || ''

  if (result.status !== 0 || !runId) {
    res.status(500).json({
      error: 'Falló el runner headless',
      status: result.status,
      runId: runId || null,
      stderr: stderr.slice(-4000),
      stdout: stdout.slice(-4000),
    })
    return
  }

  res.json({ runId })
})

/** GET /api/etl/runs — lista manifests. */
app.get('/api/etl/runs', (_req, res) => {
  res.json({ runs: listEtlRunManifests() })
})

/** GET /api/etl/runs/:id/summary — stats.json */
app.get('/api/etl/runs/:id/summary', (req, res) => {
  const runId = String(req.params.id || '').trim()
  const statsPath = path.join(RUNS_ROOT, runId, 'stats.json')
  if (!existsSync(statsPath)) {
    res.status(404).json({ error: `Corrida no encontrada: ${runId}` })
    return
  }
  const stats = readJsonSyncSafe(statsPath)
  const manifest = readJsonSyncSafe(path.join(RUNS_ROOT, runId, 'manifest.json'))
  res.json({ runId, manifest, stats })
})

/** GET /api/etl/runs/:id/tables — nombres de tablas */
app.get('/api/etl/runs/:id/tables', (req, res) => {
  const runId = String(req.params.id || '').trim()
  const tablesDir = path.join(RUNS_ROOT, runId, 'tables')
  if (!existsSync(tablesDir)) {
    res.status(404).json({ error: `Corrida no encontrada: ${runId}` })
    return
  }
  const names = readdirSync(tablesDir)
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.replace(/\.json$/i, ''))
    .sort()
  res.json({ runId, tables: names })
})

/** GET /api/etl/runs/:id/tables/:name — filas con limit/offset/col/eq */
app.get('/api/etl/runs/:id/tables/:name', (req, res) => {
  const runId = String(req.params.id || '').trim()
  const name = String(req.params.name || '').trim()
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    res.status(400).json({ error: 'Nombre de tabla inválido' })
    return
  }
  const tablePath = path.join(RUNS_ROOT, runId, 'tables', `${name}.json`)
  if (!existsSync(tablePath)) {
    res.status(404).json({ error: `Tabla no encontrada: ${name}` })
    return
  }
  const doc = readJsonSyncSafe(tablePath)
  if (!doc || !Array.isArray(doc.rows)) {
    res.status(500).json({ error: 'Tabla corrupta o sin filas' })
    return
  }

  let rows = doc.rows
  const col = req.query.col != null ? String(req.query.col) : ''
  const eq = req.query.eq != null ? String(req.query.eq) : ''
  if (col) {
    rows = rows.filter((r) => String(r?.[col] ?? '') === eq)
  }

  const limit = Math.max(0, Math.min(10_000, Number(req.query.limit ?? 100) || 100))
  const offset = Math.max(0, Number(req.query.offset ?? 0) || 0)
  const slice = rows.slice(offset, offset + limit)

  res.json({
    runId,
    name,
    headers: doc.headers ?? [],
    total: rows.length,
    limit,
    offset,
    rows: slice,
  })
})

/** GET /api/etl/catalog/circuits — CIRCUIT_CATALOG (escrito por el runner). */
app.get('/api/etl/catalog/circuits', (_req, res) => {
  const catalogPath = path.join(RUNS_ROOT, '_catalog', 'circuits.json')
  if (!existsSync(catalogPath)) {
    res.status(404).json({
      error: 'Catálogo no generado aún. Ejecutá una corrida ETL (POST /api/etl/runs) primero.',
    })
    return
  }
  const catalog = readJsonSyncSafe(catalogPath)
  res.json({ catalog })
})

app.listen(PORT, () => {
  console.info(`[truckflow-local] http://localhost:${PORT}  data→ ${DATA_ROOT}  powerbi→ ${POWERBI_ROOT}`)
})
