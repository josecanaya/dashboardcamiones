// Replay del reconocedor con la capa 2 completa (carta de porte + Vehículos Permitidos) contra las decisiones
// de operaciones (data/plate-identification-log.jsonl): cuántas correcciones automáticas hace cada regla y
// cuántas coinciden con lo que confirmó operaciones, sin la búsqueda por parecido en las cartas y con ella.
// Las cartas salen del export de ARCA (data/arca/arca_consignment_notes.json); la balanza, de replayBalanzaRegistry.
//
//   node scripts/replay-carta-parecida.mjs [días separados por coma] [umbrales separados por coma]
//   node scripts/replay-carta-parecida.mjs 2026-10-06,2026-10-07,2026-10-08,2026-10-09 0.72,0.75,0.8
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'
import { padronCartas } from '../server/plantState/padronCartas.mjs'
import { normalizeNote } from '../server/live/padron/cartasSource.mjs'

const root = process.cwd()
const DAYS = (process.argv[2] ?? '2026-10-06,2026-10-07,2026-10-08,2026-10-09').split(',')
const THRESHOLDS = (process.argv[3] ?? '0.72,0.75,0.8').split(',').map(Number)
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))

const logs = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
const final = new Map()
for (const r of logs) if (r.fragmentKey && r.action !== 'note') final.set(`${r.site}|${r.fragmentKey}`, r)
const labels = [...final.values()].filter((r) => r.action === 'confirm' && r.readPlate && r.plate && !['automatic_relevance', 'automatic_algorithm'].includes(r.source))

// Padrón como lo arma el servidor: cartas por patente y todas las notas (para el universo de vigentes).
const notes = json('data/arca/arca_consignment_notes.json').map(normalizeNote)
const byPlate = new Map()
for (const n of notes) for (const p of n.plates) byPlate.set(p, [...(byPlate.get(p) ?? []), n])
const permitidosDoc = fs.existsSync(path.join(root, 'data/padron/vehiculos-permitidos.json')) ? json('data/padron/vehiculos-permitidos.json') : { entries: [] }
const permitidos = new Map((permitidosDoc.entries ?? []).map((e) => [e.plate, e]))
const permitidosLookup = { lookup: (p) => permitidos.get(p) ?? null }
const padronFull = padronCartas({ lookup: (p) => byPlate.get(p) ?? [], notes: () => notes }, permitidosLookup)
// Sin la búsqueda por parecido: mismo padrón, sin universo de cartas vigentes.
const padronExact = { at: padronFull.at, cartaAt: padronFull.cartaAt }

const catalog = nodeModelCatalog()
const SITE_OF = (e) => (String(e.deviceCode ?? '').startsWith('SLZ') ? 'san_lorenzo' : 'ricardone')

const configs = { 'sin carta parecida': { padron: padronExact } }
for (const t of THRESHOLDS) configs[`carta parecida ≥ ${t}`] = { padron: padronFull, similarity: t }

const out = {}
for (const name of Object.keys(configs)) out[name] = { auto: 0, bien: 0, mal: 0, porRegla: {}, errores: [], casosAuto: 0 }

for (const day of DAYS) {
  const events = new Map()
  for (const n of [-1, 0, 1]) {
    const d = new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
    const f = `data/truckflow/${d}/event-list.json`
    if (!fs.existsSync(path.join(root, f))) continue
    const obj = json(f)
    for (const e of Array.isArray(obj) ? obj : obj.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
  }
  const end = Date.parse(day + 'T23:59:59-03:00')
  const list = [...events.values()].filter((e) => { const t = getEventLiveInstantMs(e); return t >= end - 48 * 3600000 && t <= end })
  const bySite = { ricardone: list.filter((e) => SITE_OF(e) === 'ricardone'), san_lorenzo: list.filter((e) => SITE_OF(e) === 'san_lorenzo') }
  const balanza = replayBalanzaRegistry(day)
  for (const [name, cfg] of Object.entries(configs)) {
    // El umbral se lee al cargar el módulo: se pasa por variable de entorno en cada corrida (ver abajo).
    if (cfg.similarity && Number(process.env.CARTA_SIMILARITY) !== cfg.similarity) continue
    const o = out[name]
    for (const site of ['ricardone', 'san_lorenzo']) {
      const { items } = identifyFragments(bySite[site], end, {
        catalog,
        otherSiteEvents: bySite[site === 'ricardone' ? 'san_lorenzo' : 'ricardone'],
        balanza,
        padron: cfg.padron,
      })
      o.casosAuto += items.filter((i) => i.level === 'casi_seguro' && Math.abs(Date.parse(i.at) - end) < 24 * 3600000).length
      for (const r of labels.filter((l) => l.site === site && String(l.captureAt ?? '').startsWith(day))) {
        const it = items.find((i) => i.fragmentKey === r.fragmentKey && i.readPlate === r.readPlate)
        if (!it || it.level !== 'casi_seguro') continue
        o.auto += 1
        const regla = it.rule ?? 'sin_regla'
        o.porRegla[regla] ??= { n: 0, bien: 0 }
        o.porRegla[regla].n += 1
        if (it.assignedPlate === r.plate) { o.bien += 1; o.porRegla[regla].bien += 1 }
        else { o.mal += 1; o.errores.push(`${day} ${site} ${r.readPlate} → ${it.assignedPlate} (operaciones: ${r.plate}) [${regla}]`) }
      }
    }
  }
}
const n = labels.filter((l) => DAYS.some((d) => String(l.captureAt ?? '').startsWith(d))).length
for (const [name, o] of Object.entries(out)) {
  if (!o.auto && !o.casosAuto) continue
  console.log(`\n${name} · ${n} decisiones de operaciones`)
  console.log(`  automáticas sobre lo decidido: ${o.auto} · bien ${o.bien} · mal ${o.mal} · casos resueltos solos (todos): ${o.casosAuto}`)
  for (const [regla, v] of Object.entries(o.porRegla).sort((a, b) => b[1].n - a[1].n)) console.log(`    ${regla.padEnd(24)} ${String(v.n).padStart(4)} · bien ${v.bien}`)
  for (const e of o.errores.filter((x) => x.includes('carta'))) console.log(`    ✗ ${e}`)
}
