// Replay del reconocedor de patentes contra las decisiones de operaciones (data/plate-identification-log.jsonl):
// compara el comportamiento anterior (reglas, sin balanza) con el nuevo (cuenta del documento + refuerzo de balanza).
// La balanza de días viejos sale de los movimientos del Excel (sin acoplado); desde el 15/10, del SGC.
// Uso: node scripts/replay-identificacion-balanza.mjs [días separados por coma]
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { replayBalanzaRegistry } from '../server/plantState/balanzaRegistry.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'

const root = process.cwd()
const DAYS = (process.argv[2] ?? '2026-10-06,2026-10-07,2026-10-08,2026-10-09').split(',')
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const logs = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
const final = new Map()
for (const r of logs) if (r.fragmentKey && r.action !== 'note') final.set(`${r.site}|${r.fragmentKey}`, r)
const labels = [...final.values()].filter((r) => r.action === 'confirm' && r.readPlate && r.plate && !['automatic_relevance', 'automatic_algorithm'].includes(r.source))
const catalog = nodeModelCatalog()
const SITE_OF = (e) => (String(e.deviceCode ?? '').startsWith('SLZ') ? 'san_lorenzo' : 'ricardone')

const configs = {
  anterior: { options: { cuenta: false } },
  nuevo: { balanza: true },
}
const out = {}
for (const name of Object.keys(configs)) out[name] = { auto: 0, autoBien: 0, autoMal: 0, porRegla: {}, errores: [], sueltosTotales: 0, sueltosAuto: 0 }

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
    const o = out[name]
    for (const site of ['ricardone', 'san_lorenzo']) {
      const { items } = identifyFragments(bySite[site], end, {
        catalog,
        otherSiteEvents: bySite[site === 'ricardone' ? 'san_lorenzo' : 'ricardone'],
        balanza: cfg.balanza ? balanza : null,
        options: cfg.options,
      })
      const dayItems = items.filter((i) => i.at.slice(0, 10) === new Date(end).toISOString().slice(0, 10) || Math.abs(Date.parse(i.at) - end) < 24 * 3600000)
      o.sueltosTotales += dayItems.length
      o.sueltosAuto += dayItems.filter((i) => i.level === 'casi_seguro').length
      for (const r of labels.filter((l) => l.site === site && String(l.captureAt ?? '').startsWith(day))) {
        const it = items.find((i) => i.fragmentKey === r.fragmentKey && i.readPlate === r.readPlate)
        if (!it || it.level !== 'casi_seguro') continue
        o.auto += 1
        const regla = it.rule ?? 'sin_regla'
        o.porRegla[regla] ??= { n: 0, bien: 0 }
        o.porRegla[regla].n += 1
        if (it.assignedPlate === r.plate) { o.autoBien += 1; o.porRegla[regla].bien += 1 }
        else { o.autoMal += 1; o.errores.push(`${day} ${site} ${r.readPlate} → ${it.assignedPlate} (operaciones: ${r.plate}) [${regla}] ${it.reason}`) }
      }
    }
  }
}
const n = labels.filter((l) => DAYS.some((d) => String(l.captureAt ?? '').startsWith(d))).length
console.log(JSON.stringify({ dias: DAYS, decisionesDeOperaciones: n, ...out }, null, 2))
