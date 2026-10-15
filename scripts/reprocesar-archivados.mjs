// Reprocesa con el reconocedor actual (cuenta del documento + balanza) los casos archivados que quedaron
// abiertos (provisorio/pendiente sin decisión) y, con --apply, aplica los que resuelve como decisión
// automática (source automatic_algorithm) vía la API del server, para que lleguen a la bandeja y al ETL.
// Uso: node scripts/reprocesar-archivados.mjs [--apply] [--api http://127.0.0.1:8787]
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'

const root = process.cwd()
const APPLY = process.argv.includes('--apply')
const API = process.argv.includes('--api') ? process.argv[process.argv.indexOf('--api') + 1] : 'http://127.0.0.1:8787'
const json = (p, fb) => { try { return JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, '')) } catch { return fb } }
const archive = json('data/plate-identification-archive.json', {})
const decisions = json('data/plate-identification-decisions.json', {})
const catalog = nodeModelCatalog()
const SITE_OF = (e) => (String(e.deviceCode ?? '').startsWith('SLZ') ? 'san_lorenzo' : 'ricardone')
const arDay = (iso) => new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10)

/** Casos archivados abiertos: sin decisión de operaciones y no resueltos solos. */
const open = []
for (const site of ['ricardone', 'san_lorenzo']) {
  for (const it of Object.values(archive[site] ?? {})) {
    const d = decisions[site]?.[it.fragmentKey]
    if (d && ['confirm', 'reject'].includes(d.action)) continue
    if (!['provisorio', 'pendiente'].includes(it.originalLevel ?? it.level)) continue
    open.push({ site, ...it })
  }
}
const days = [...new Set(open.map((it) => arDay(it.at)))].sort()
const resolved = []
const sinDatos = []
const porDia = {}
for (const day of days) {
  const dir = path.join(root, 'data/truckflow', day)
  if (!fs.existsSync(path.join(dir, 'event-list.json'))) { sinDatos.push(day); continue }
  const events = new Map()
  for (const n of [-1, 0, 1]) {
    const d = new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
    const obj = json(`data/truckflow/${d}/event-list.json`, null)
    if (!obj) continue
    for (const e of Array.isArray(obj) ? obj : obj.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
  }
  const end = Date.parse(day + 'T23:59:59-03:00')
  const list = [...events.values()].filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 48 * 3600000 && t <= end })
  const balanza = replayBalanzaRegistry(day)
  for (const site of ['ricardone', 'san_lorenzo']) {
    const mine = open.filter((it) => it.site === site && arDay(it.at) === day)
    if (!mine.length) continue
    const { items } = identifyFragments(list.filter((e) => SITE_OF(e) === site), end, {
      catalog,
      otherSiteEvents: list.filter((e) => SITE_OF(e) !== site),
      balanza,
      decisions: decisions[site] ?? {},
    })
    const byKey = new Map(items.map((i) => [`${i.fragmentKey}|${i.readPlate}`, i]))
    const stat = (porDia[`${day} ${site}`] = { abiertos: mine.length, resueltos: 0, porRegla: {} })
    for (const it of mine) {
      const now = byKey.get(`${it.fragmentKey}|${it.readPlate}`)
      if (!now || now.level !== 'casi_seguro' || !now.assignedPlate) continue
      stat.resueltos += 1
      stat.porRegla[now.rule] = (stat.porRegla[now.rule] ?? 0) + 1
      resolved.push({ site, fragmentKey: it.fragmentKey, readPlate: it.readPlate, plate: now.assignedPlate, journeyUid: now.assignedJourneyUid, rule: now.rule, reason: now.reason, at: it.at })
    }
  }
}
console.log(JSON.stringify({ abiertos: open.length, resueltos: resolved.length, diasSinDatos: sinDatos, porDia }, null, 2))
for (const r of resolved.slice(0, 40)) console.log(`${r.at.slice(0, 16)} ${r.site} ${r.readPlate} → ${r.plate} [${r.rule}]`)

if (APPLY) {
  let ok = 0
  const fails = []
  for (const r of resolved) {
    const res = await fetch(`${API}/api/truckflow/live/identifications/${encodeURIComponent(r.fragmentKey)}?site=${r.site}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', plate: r.plate, journeyUid: r.journeyUid ?? null, reason: `algoritmo (${r.rule}): ${r.reason}`.slice(0, 300), operator: 'Sistema · algoritmo', source: 'automatic_algorithm', rule: r.rule }),
    })
    if (res.ok) ok += 1
    else fails.push(`${r.readPlate} ${res.status} ${await res.text()}`)
  }
  console.log(`aplicados ${ok} de ${resolved.length}`, fails.slice(0, 10))
}
