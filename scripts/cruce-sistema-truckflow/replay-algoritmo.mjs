/**
 * Replay del reconocedor sobre TODAS las lecturas de un período (eventos del feed + lecturas que solo
 * llegan como alerta), con la balanza de cada día, evaluado contra el cruce Sistema ↔ cámaras.
 *
 * A diferencia de reconocimiento-algoritmo.mjs (que mira lo que pasó por la bandeja en vivo), acá el
 * algoritmo ve cada lectura mala de un camión del Sistema y se mide qué hace con ella.
 *
 * Uso: node scripts/cruce-sistema-truckflow/replay-algoritmo.mjs <dir del cruce> [--sin-alertas]
 * Salida: <dir>/replay-algoritmo.json y .csv
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { identifyFragments, journeyKeyOf, nodeModelCatalog } from '../../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../../server/plantState/liveEventTime.mjs'
import { alertReadEvents } from '../../server/plantState/alertReads.mjs'

const root = resolve(import.meta.dirname, '../..')
const dir = process.argv[2]
const ALERTS = !process.argv.includes('--sin-alertas')
if (!dir) throw new Error('falta el directorio del cruce')

const csv = (f) => {
  const [head, ...rows] = readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/)
  const cols = head.split(',')
  return rows.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])))
}
const movs = new Map(csv('movimientos.csv').map((m) => [m.id, m]))
const recs = csv('recuperadas.csv')
const load = (f) => {
  if (!existsSync(f)) return []
  const raw = JSON.parse(readFileSync(f, 'utf8'))
  return Array.isArray(raw) ? raw : (raw.value ?? raw.records ?? [])
}
const plateKey = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const SITE_OF = (dev) => (/^(SLZ|Ren)/.test(dev) ? 'san_lorenzo' : 'ricardone')
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
const ms = (s) => Date.parse(s.replace(' ', 'T') + ':00-03:00')
const catalog = nodeModelCatalog()

const days = [...new Set(recs.map((r) => r.hora_camara.slice(0, 10)))].sort()
const detalle = []
for (const day of days) {
  const evs = new Map()
  const alerts = []
  for (const d of [addDay(day, -1), day, addDay(day, 1)]) {
    for (const e of load(join(root, 'data/truckflow', d, 'event-list.json'))) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') evs.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
    if (ALERTS) alerts.push(...load(join(root, 'data/truckflow', d, 'alert-list.json')))
  }
  const end = Math.min(Date.parse(day + 'T23:59:59-03:00') + 6 * 3600_000, Date.now())
  let list = [...evs.values()]
  if (ALERTS) list.push(...alertReadEvents(alerts, list))
  list = list.filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 54 * 3600_000 && t <= end })
  const balanza = replayBalanzaRegistry(day)
  /** lectura (cámara|patente) → [{t, key}] para ubicar cada lectura mala en su journey */
  const where = new Map()
  for (const e of list) {
    const t = getEventLiveInstantMs(e)
    const k = `${e.deviceCode}|${plateKey(e.truckPlate ?? e.normalizedPlate)}`
    if (!where.has(k)) where.set(k, [])
    where.get(k).push({ t, key: journeyKeyOf(e, t), alert: Boolean(e.fromAlert) })
  }
  const bySite = {}
  for (const site of ['ricardone', 'san_lorenzo']) {
    const mine = list.filter((e) => SITE_OF(e.deviceCode) === site)
    const { items } = identifyFragments(mine, end, { catalog, balanza, otherSiteEvents: list.filter((e) => SITE_OF(e.deviceCode) !== site) })
    bySite[site] = new Map(items.map((i) => [i.fragmentKey, i]))
  }
  for (const r of recs.filter((x) => x.hora_camara.slice(0, 10) === day)) {
    const m = movs.get(r.id)
    if (!m) continue
    const t = ms(r.hora_camara)
    const hit = (where.get(`${r.camara}|${plateKey(r.lectura_camara)}`) ?? []).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]
    const it = hit && Math.abs(hit.t - t) <= 20 * 60_000 ? bySite[SITE_OF(r.camara)].get(hit.key) : null
    const out = !hit || Math.abs(hit.t - t) > 20 * 60_000 ? 'sin_lectura_replay' : !it ? 'no_revisada' : it.assignedPlate ? (it.assignedPlate === r.patente_sistema ? 'bien' : 'mal') : it.level === 'fuera_sistema' ? 'fuera_sistema' : 'abierta'
    detalle.push({ dia: day, planta: SITE_OF(r.camara), punto: r.punto, como: r.como, sistema: r.patente_sistema, leyo: r.lectura_camara, camara: r.camara, hora: r.hora_camara, alerta: r.alerta || '', resultado: out, asignada: it?.assignedPlate ?? '', regla: it?.rule ?? '', nivel: it?.level ?? '', motivo: it?.reason ?? '', candidatos: (it?.candidates ?? []).slice(0, 3).map((c) => `${c.plate}:${c.similarity}:${c.inUniverse ? 'U' : ''}${c.inBalanza ? 'B' : ''}`).join(' ') })
  }
  process.stderr.write(`${day} ok\n`)
}
const tot = (rows) => rows.reduce((a, d) => ((a[d.resultado] = (a[d.resultado] ?? 0) + 1), a), {})
const porDia = {}
for (const d of detalle) (porDia[`${d.dia} ${d.planta}`] ??= []).push(d)
const tabla = Object.entries(porDia).sort().map(([k, rows]) => ({ dia: k, malLeidas: rows.length, ...tot(rows) }))
const porRegla = detalle.filter((d) => d.asignada).reduce((a, d) => ((a[`${d.regla} ${d.resultado}`] = (a[`${d.regla} ${d.resultado}`] ?? 0) + 1), a), {})
writeFileSync(join(dir, `replay-algoritmo${ALERTS ? '' : '-sin-alertas'}.json`), JSON.stringify({ total: tot(detalle), porRegla, tabla, detalle }, null, 1))
console.table(tabla)
console.log('semana:', detalle.length, tot(detalle))
console.log('por regla:', porRegla)
