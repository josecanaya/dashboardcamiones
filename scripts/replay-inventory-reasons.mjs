// Auditoría offline del inventario por visita: qué motivo de excepción frena automáticas correctas.
// No modifica decisiones ni datos. Uso: node scripts/replay-inventory-reasons.mjs
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'

const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const logs = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
const final = new Map()
for (const r of logs) if (r.fragmentKey && r.action !== 'note') final.set(`${r.site}|${r.fragmentKey}`, r)
const labels = [...final.values()].filter((r) => r.action === 'confirm' && r.readPlate && r.plate && r.source !== 'automatic_relevance')
const catalog = nodeModelCatalog()
const inputs = []
for (const day of ['2026-10-06', '2026-10-07']) {
  const target = labels.filter((r) => String(r.captureAt).startsWith(day))
  if (!target.length) continue
  const events = new Map()
  for (const n of [-1, 0, 1]) {
    const d = new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
    const f = `data/truckflow/${d}/event-list.json`
    if (!fs.existsSync(path.join(root, f))) continue
    const obj = json(f)
    for (const e of Array.isArray(obj) ? obj : obj.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
  }
  const end = Date.parse(day + 'T23:59:59-03:00')
  inputs.push({ day, target, end, list: [...events.values()].filter((e) => getEventLiveInstantMs(e) >= end - 48 * 3600000) })
}
function run(options) {
  const out = []
  for (const { target, end, list } of inputs) {
    const { items } = identifyFragments(list, end, { catalog, options })
    for (const r of target) {
      const item = items.find((i) => i.fragmentKey === r.fragmentKey && i.readPlate === r.readPlate && Math.abs(Date.parse(i.at) - Date.parse(r.captureAt)) < 5000)
      if (item) out.push({ r, item })
    }
  }
  const autos = out.filter((x) => x.item.level === 'casi_seguro')
  return { matched: out.length, top1: out.filter((x) => x.item.candidates[0]?.plate === x.r.plate).length, autos: autos.length,
    ok: autos.filter((x) => x.item.assignedPlate === x.r.plate).length, bad: autos.filter((x) => x.item.assignedPlate !== x.r.plate).map((x) => `${x.r.readPlate}->${x.item.assignedPlate} (humano ${x.r.plate})`), out }
}
const base = run({ allowInventoryReasons: [''] })
const cur = run({})
const reasonOf = (x) => x.item.candidates.find((c) => c.plate === x.r.plate)?.inventory?.reason ?? 'sin candidato correcto'
const lost = base.out.filter((x) => x.item.level === 'casi_seguro' && !cur.out.find((y) => y.r === x.r && y.item.level === 'casi_seguro'))
const tally = {}
for (const x of cur.out) {
  const c = x.item.candidates.find((c) => c.plate === x.r.plate)
  const wrong = x.item.candidates.filter((c) => c.plate !== x.r.plate)
  for (const [k, list] of [['correct', c ? [c] : []], ['wrong', wrong]]) for (const cc of list) {
    const why = cc.inventory?.status === 'exception' ? cc.inventory.reason : cc.inventory?.shadow ? `[evaluación] ${cc.inventory.shadow.reason}` : null
    if (!why) continue
    const t = (tally[why] ??= { correct: 0, wrong: 0 }); t[k]++
  }
}
const strip = ({ out, ...o }) => o
console.log(JSON.stringify({ sinInventario: strip(base), conInventario: strip(cur),
  perdidasPorMotivo: lost.map((x) => ({ read: x.r.readPlate, human: x.r.plate, reason: reasonOf(x) })), excepcionesPorMotivo: tally }, null, 2))
