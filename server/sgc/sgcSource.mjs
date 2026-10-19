/**
 * Fuente SGC (balanza Vicentin, Oracle `SGC_PROD.CamionesActivos24horas`) — reemplaza al Excel.
 *
 * - Poller cada SGC_POLL_MS: la vista solo muestra 24 h, así que cada ingreso se guarda en
 *   data/sgc/<día ingreso>/ingresos.json (clave NROINGRESO) con el primer peso observado.
 * - Desde SGC_MOVIMIENTOS_FROM, los días de data/movimientos/<día>/movimientos.json se generan
 *   desde SGC (solo ingresos cerrados, partición por día de salida como el Excel) y llevan
 *   SOURCE.json = { source: 'sgc' }; la ingesta de Excel no pisa esos días.
 * - Router: GET /api/truckflow/live/balanza?site=ricardone|san_lorenzo|all, GET /api/truckflow/sgc/status.
 * Requiere VPN + ruta a ORACLE_SGC_HOST (ver memoria / docs/sgc).
 */
import express from 'express'
import oracledb from 'oracledb'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildSgcPriors, normalizeSgcPlant, pairTransiles, sgcRecordToMovimiento, SGC_SOURCE_FILE } from './sgcMovimientos.mjs'

const POLL_MS = Number(process.env.SGC_POLL_MS || 120_000)
const MOVIMIENTOS_FROM = process.env.SGC_MOVIMIENTOS_FROM?.trim() || '2026-10-15'
const PRIOR_DAYS = 60
const SITE_PLANTS = { ricardone: ['RICARDONE'], san_lorenzo: ['TERMINAL_EMBARQUE'] }

const dayOf = iso => String(iso ?? '').slice(0, 10)
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const pad = n => String(n).padStart(2, '0')
/** Oracle TIMESTAMP (sin zona) llega como Date local: se vuelve a ISO local sin zona, como el Excel. */
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

function readJson(file, fallback) {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback } catch { return fallback }
}

/** True si el día de movimientos lo genera SGC (la ingesta de Excel debe saltearlo). */
export function isSgcMovimientosDay(movRoot, day) {
  return readJson(path.join(movRoot, day, 'SOURCE.json'), null)?.source === 'sgc'
}

export function createSgcSource({ projectRoot }) {
  const sgcRoot = path.join(projectRoot, 'data', 'sgc')
  const movRoot = path.join(projectRoot, 'data', 'movimientos')
  const env = process.env
  const enabled = Boolean(env.ORACLE_SGC_HOST && env.ORACLE_SGC_USER && env.SGC_ENABLED !== '0')
  const state = { enabled, rows: [], fetchedAt: null, lastOkAt: null, error: null, lastWrite: [] }
  let priors = null
  let timer = null

  async function fetchView() {
    const con = await oracledb.getConnection({
      user: env.ORACLE_SGC_USER,
      password: env.ORACLE_SGC_PASSWORD,
      connectString: `${env.ORACLE_SGC_HOST}:${env.ORACLE_SGC_PORT || 1521}/${env.ORACLE_SGC_SERVICE}`,
      connectTimeout: 10,
    })
    try {
      const r = await con.execute(`SELECT * FROM ${env.ORACLE_SGC_SCHEMA}.${env.ORACLE_SGC_VIEW}`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
      return r.rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? localIso(v) : v])))
    } finally {
      await con.close()
    }
  }

  const storeFile = day => path.join(sgcRoot, day, 'ingresos.json')
  /** Bitácora de consultas: la vista no tiene historia, un hueco > 24 h = ingresos perdidos. */
  const logPoll = entry => {
    try {
      mkdirSync(sgcRoot, { recursive: true })
      appendFileSync(path.join(sgcRoot, '_polls.jsonl'), `${JSON.stringify(entry)}
`, 'utf8')
    } catch { /* la bitácora no debe frenar el guardado */ }
  }

  /** Upsert por NROINGRESO; devuelve los días de salida tocados. */
  function upsert(rows, nowIso) {
    const byDay = new Map()
    for (const r of rows) {
      const d = dayOf(r.FECHAINGRESO)
      if (!d) continue
      if (!byDay.has(d)) byDay.set(d, [])
      byDay.get(d).push(r)
    }
    const touched = new Set()
    for (const [day, incoming] of byDay) {
      const file = storeFile(day)
      const store = readJson(file, {})
      let changed = false
      for (const r of incoming) {
        const key = String(r.NROINGRESO)
        const prev = store[key]
        const firstWeight = prev?.firstWeight ?? (r.PESOTARA != null && r.PESOBRUTO == null ? 'tara' : r.PESOBRUTO != null && r.PESOTARA == null ? 'bruto' : null)
        const next = { ...r, firstWeight, firstSeenAt: prev?.firstSeenAt ?? nowIso, lastSeenAt: nowIso }
        const { lastSeenAt: _a, ...cmpPrev } = prev ?? {}
        const { lastSeenAt: _b, ...cmpNext } = next
        if (!prev || JSON.stringify(cmpPrev) !== JSON.stringify(cmpNext)) changed = true
        store[key] = next
        if (r.FECHASALIDA) touched.add(dayOf(r.FECHASALIDA))
      }
      mkdirSync(path.dirname(file), { recursive: true })
      if (changed || !existsSync(file)) writeFileSync(file, JSON.stringify(store), 'utf8')
    }
    return touched
  }

  function loadPriors() {
    const days = existsSync(movRoot) ? readdirSync(movRoot).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isSgcMovimientosDay(movRoot, d)).sort().slice(-PRIOR_DAYS) : []
    return buildSgcPriors(days.flatMap(d => readJson(path.join(movRoot, d, 'movimientos.json'), [])))
  }

  function storeRecords(fromDay, toDay) {
    const out = []
    for (let d = fromDay; d <= toDay; d = addDays(d, 1)) out.push(...Object.values(readJson(storeFile(d), {})))
    return out
  }

  /** Regenera data/movimientos/<day> desde el store SGC (solo si cambió). */
  function writeMovimientosDay(day) {
    // Día con el SGC incompleto (corte de VPN) que se completó con el Excel: el poller no lo pisa.
    if (readJson(path.join(movRoot, day, 'SOURCE.json'), null)?.excelOverride) return null
    priors ??= loadPriors()
    const records = storeRecords(addDays(day, -3), addDays(day, 1))
    const transiles = pairTransiles(records)
    const rows = records
      .filter(r => r.FECHASALIDA && dayOf(r.FECHASALIDA) === day)
      .sort((a, b) => String(a.FECHASALIDA).localeCompare(String(b.FECHASALIDA)))
      .map(r => sgcRecordToMovimiento(r, priors, transiles.get(r.NROINGRESO)))
    const dir = path.join(movRoot, day)
    const file = path.join(dir, 'movimientos.json')
    const body = JSON.stringify(rows)
    if (existsSync(file) && readFileSync(file, 'utf8') === body && isSgcMovimientosDay(movRoot, day)) return null
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, body, 'utf8')
    writeFileSync(path.join(dir, 'SOURCE.json'), JSON.stringify({ source: 'sgc', view: SGC_SOURCE_FILE, updatedAt: new Date().toISOString(), rows: rows.length }, null, 2), 'utf8')
    return { day, rows: rows.length }
  }

  async function tick() {
    const nowIso = localIso(new Date())
    state.fetchedAt = nowIso
    try {
      const rows = await fetchView()
      state.rows = rows
      state.lastOkAt = nowIso
      state.error = null
      const touched = [...upsert(rows, nowIso)].filter(d => d >= MOVIMIENTOS_FROM).sort()
      const written = touched.map(writeMovimientosDay).filter(Boolean)
      logPoll({ at: nowIso, ok: true, rows: rows.length, written })
      if (written.length) {
        state.lastWrite = written
        console.log(`[sgc] movimientos regenerados: ${written.map(w => `${w.day} (${w.rows})`).join(', ')}`)
      }
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e)
      logPoll({ at: nowIso, ok: false, error: state.error })
      console.warn(`[sgc] fallo consultando la vista: ${state.error}`)
    }
  }

  function start() {
    if (!enabled || timer) return
    tick()
    timer = setInterval(tick, POLL_MS)
    timer.unref?.()
  }

  function balanza(site) {
    const plants = SITE_PLANTS[site] ?? null
    const all = state.rows.map(r => ({ ...r, plant: normalizeSgcPlant(r.PLANTA) }))
    const rows = all.filter(r => !plants || plants.includes(r.plant))
    const now = Date.now()
    const enrich = r => {
      const minutes = Math.round(((r.FECHASALIDA ? Date.parse(r.FECHASALIDA) : now) - Date.parse(r.FECHAINGRESO)) / 60000)
      const intent = r.FECHASALIDA ? null : r.PESOTARA != null && r.PESOBRUTO == null ? 'carga' : r.PESOBRUTO != null && r.PESOTARA == null ? 'descarga' : null
      return {
        nroIngreso: r.NROINGRESO,
        plate: r.PATENTECAMION,
        trailer: r.PATENTEACOPLADO,
        productCode: r.PRODUCTOCODIGO,
        product: r.PRODUCTO,
        plant: r.plant,
        plantName: r.PLANTA,
        ingresoAt: r.FECHAINGRESO,
        salidaAt: r.FECHASALIDA ?? null,
        minutes,
        intent,
        brutoKg: r.PESOBRUTO ?? null,
        taraKg: r.PESOTARA ?? null,
        netoKg: r.PESONETO ?? null,
      }
    }
    const enriched = rows.map(enrich)
    // El SGC registra la planta de destino: un R7 que entra por Preingreso de Ricardone figura como
    // TERMINAL DE EMBARQUE. Para cruzar con cámaras hacen falta también los ingresos abiertos de otras plantas.
    const otherOpen = plants ? all.filter(r => !plants.includes(r.plant) && !r.FECHASALIDA).map(enrich) : []
    const inPlant = enriched.filter(r => !r.salidaAt).sort((a, b) => b.minutes - a.minutes)
    const closed = enriched.filter(r => r.salidaAt).sort((a, b) => String(b.salidaAt).localeCompare(String(a.salidaAt)))
    const byProduct = {}
    for (const r of inPlant) byProduct[r.product] = (byProduct[r.product] ?? 0) + 1
    return {
      site,
      status: { enabled, fetchedAt: state.fetchedAt, lastOkAt: state.lastOkAt, error: state.error, pollMs: POLL_MS },
      counts: {
        inPlant: inPlant.length,
        ingresos24h: enriched.length,
        salidas24h: closed.length,
        netoKg24h: closed.reduce((s, r) => s + (r.netoKg ?? 0), 0),
        carga: inPlant.filter(r => r.intent === 'carga').length,
        descarga: inPlant.filter(r => r.intent === 'descarga').length,
      },
      byProduct: Object.entries(byProduct).sort((a, b) => b[1] - a[1]).map(([product, n]) => ({ product, n })),
      inPlant,
      closed,
      otherOpen,
    }
  }

  const router = express.Router()
  router.get('/api/truckflow/live/balanza', (req, res) => {
    const site = String(req.query.site ?? 'ricardone').trim().toLowerCase()
    res.json(balanza(site))
  })
  router.get('/api/truckflow/sgc/status', (_req, res) => {
    res.json({ enabled, fetchedAt: state.fetchedAt, lastOkAt: state.lastOkAt, error: state.error, rows: state.rows.length, movimientosFrom: MOVIMIENTOS_FROM, lastWrite: state.lastWrite, priorsRows: priors?.rows ?? null })
  })
  router.post('/api/truckflow/sgc/refresh', async (_req, res) => {
    await tick()
    res.json({ ok: !state.error, error: state.error, rows: state.rows.length, lastWrite: state.lastWrite })
  })

  return { router, start, tick, balanza, writeMovimientosDay }
}
