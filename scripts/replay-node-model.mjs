// Auditoría offline del modelo por nodos (en evaluación) contra las decisiones de operaciones del
// 06 y 07/10. Solo patente + recorrido + «nunca visto» por nodo (sin DSS). No modifica nada.
// Uso: node scripts/replay-node-model.mjs
import fs from 'node:fs'
import path from 'node:path'
import { identifyFragments, nodeModelCatalog } from '../server/plantState/plateIdentification.mjs'
import { scoreWithNodeModel } from '../server/plantState/nodeModelScore.mjs'
import { scoreCandidates } from '../server/plantState/identificationEvidence.mjs'
import { getEventLiveInstantMs } from '../server/plantState/liveEventTime.mjs'

const root = process.cwd()
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8').replace(/^﻿/, ''))
const logs = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
const final = new Map()
for (const r of logs) if (r.fragmentKey && r.action !== 'note') final.set(`${r.site}|${r.fragmentKey}`, r)
const labels = [...final.values()].filter((r) => r.action === 'confirm' && r.readPlate && r.plate && r.source !== 'automatic_relevance')
const catalog = nodeModelCatalog()
const cases = []
for (const day of ['2026-10-06', '2026-10-07']) {
  const target = labels.filter((r) => String(r.captureAt).startsWith(day))
  const events = new Map()
  for (const n of [-1, 0, 1]) {
    const d = new Date(Date.parse(day + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
    const f = `data/truckflow/${d}/event-list.json`
    if (!fs.existsSync(path.join(root, f))) continue
    const obj = json(f)
    for (const e of Array.isArray(obj) ? obj : obj.records ?? []) if (!e.inferred && !e.manualCorrection && e.eventCategory === 'physical') events.set(e.id ?? `${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`, e)
  }
  const end = Date.parse(day + 'T23:59:59-03:00')
  const { items } = identifyFragments([...events.values()].filter((e) => getEventLiveInstantMs(e) >= end - 48 * 3600000), end, { catalog })
  for (const r of target) {
    const item = items.find((i) => i.fragmentKey === r.fragmentKey && i.readPlate === r.readPlate && Math.abs(Date.parse(i.at) - Date.parse(r.captureAt)) < 5000)
    if (!item) continue
    const nm = scoreWithNodeModel(item, item.candidates)
    const top = [...nm.candidates].sort((a, b) => b.probability - a.probability)[0]
    const winner = !top || nm.neverSeen.probability >= top.probability ? { plate: item.readPlate, p: nm.neverSeen.probability } : { plate: top.plate, p: top.probability }
    const old = scoreCandidates({ readPlate: item.readPlate, validFormat: item.validFormat, readAttrs: null }, item.candidates.slice(0, 3).map((c) => ({ ...c, attrs: null })))
    const oldTop = [...old.candidates].sort((a, b) => b.probability - a.probability)[0]
    const oldWinner = !oldTop || old.otherProbability >= oldTop.probability ? { plate: item.readPlate, p: old.otherProbability } : { plate: oldTop.plate, p: oldTop.probability }
    // En vivo solo se puede acertar con lo que ya se había leído. Si el camión que eligió operaciones
    // todavía no tenía lecturas buenas (su primera llegó después), la respuesta correcta era «nunca visto».
    const knownBefore = item.candidates.some((c) => c.plate === r.plate && !c.seenAfter)
    const liveTruth = r.plate === r.readPlate || knownBefore ? r.plate : item.readPlate
    cases.push({ read: r.readPlate, human: r.plate, liveTruth, decidibleEnVivo: knownBefore, node: item.node, franja: nm.franja, valid: item.validFormat, expected: nm.expectedAtNode, nuevo: winner, actual: oldWinner })
  }
}
// Acierto = coincide con lo que se podía saber en vivo. «Asigna» = el ganador es un camión distinto
// de la lectura (corrige la patente); ahí un error renombra mal un viaje.
const band = (list, key, lo) => {
  const s = list.filter((c) => c[key].p >= lo)
  const fix = s.filter((c) => c[key].plate !== c.read)
  return { n: s.length, ok: s.filter((c) => c[key].plate === c.liveTruth).length, corrige: fix.length, corrigeBien: fix.filter((c) => c[key].plate === c.liveTruth).length }
}
const report = { casos: cases.length, decidiblesEnVivo: cases.filter((c) => c.decidibleEnVivo).length,
  correctaEraNuncaVisto: cases.filter((c) => c.liveTruth === c.read && c.human !== c.read).length }
for (const key of ['nuevo', 'actual']) {
  report[key] = { aciertoGanador: cases.filter((c) => c[key].plate === c.liveTruth).length,
    '≥90%': band(cases, key, 0.9), '≥95%': band(cases, key, 0.95), '≥98%': band(cases, key, 0.98) }
}
report.erroresNuevoConAltaProbabilidad = cases.filter((c) => c.nuevo.p >= 0.9 && c.nuevo.plate !== c.liveTruth).map((c) => `${c.read}→${c.nuevo.plate} ${Math.round(c.nuevo.p * 100)}% (en vivo ${c.liveTruth}, humano ${c.human}, ${c.node} ${c.franja})`)
fs.writeFileSync(path.join(root, 'docs/auditoria-patentes-2026-10-08/teorema/replay-modelo-nodos.json'), JSON.stringify({ ...report, cases }, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
