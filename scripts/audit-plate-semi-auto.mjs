// Auditoría offline: no modifica decisiones, patentes ni parámetros del modelo.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scoreCandidates } from '../server/plantState/identificationEvidence.mjs'
import { plateSimilarity } from '../server/plantState/plateIdentification.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const log = fs.readFileSync(path.join(root, 'data/plate-identification-log.jsonl'), 'utf8')
const rows = log.split(/\r?\n/).filter(Boolean).map(JSON.parse)
const latest = new Map()
for (const row of rows) if (row.fragmentKey) latest.set(`${row.site}|${row.fragmentKey}`, row)
const final = [...latest.values()]
const confirmed = final.filter(r => r.action === 'confirm' && r.readPlate && r.plate)
const renamed = confirmed.filter(r => r.plate !== r.readPlate)
const ranked = renamed.filter(r => r.suggested)
const topK = (k) => renamed.filter(r => Array.isArray(r.candidates) && r.candidates.length).reduce((o, r) => {
  o.n++
  if (r.candidates.slice(0, k).some(c => c.plate === r.plate)) o.hits++
  return o
}, { n: 0, hits: 0 })
const countBy = (list, fn) => list.reduce((o,r) => { const k=fn(r); o[k]=(o[k]??0)+1; return o }, {})
const causalReferences = confirmed.reduce((o,r) => {
  const c = r.candidates?.find(c => c.plate === r.plate)
  if (r.plate === r.readPlate || !c || !r.captureAt || !c.photoAt) return o
  o.n++
  if (Date.parse(c.photoAt) > Date.parse(r.captureAt)) o.after++
  return o
}, { n:0, after:0 })
const example = scoreCandidates({readPlate:'CFK008',validFormat:true,readAttrs:{vehicleColor:'White',vehicleBrand:'Scania',vehicleCategory:'Large Truck'}}, [{plate:'CFK006',similarity:plateSimilarity('CFK008','CFK006'),nodeProbability:1,circuit:'R7',circuitProbability:1,attrs:{vehicleColor:'Black',vehicleCategory:'Medium Truck'}}])
const report = {
  generatedAt:new Date().toISOString(), source:'data/plate-identification-log.jsonl',
  interpretation:'Resultados descriptivos de decisiones humanas seleccionadas, no validación de precisión automática ni prevalencia de particulares en el feed.',
  logRows:rows.length, latestCases:final.length, actions:countBy(final,r=>r.action),
  confirmedWithContext:confirmed.length, renamed:renamed.length, retainedRead:confirmed.length-renamed.length,
  suggestedAmongRenames:{n:ranked.length,hits:ranked.filter(r=>r.suggested===r.plate).length},
  listedTop3AmongRenames:topK(3), listedTop5AmongRenames:topK(5),
  referenceTimingAmongMatchedRenames:causalReferences,
  confirmedByDevice:countBy(confirmed,r=>r.deviceCode??'sin_contexto'),
  rejectionReasons:countBy(final.filter(r=>r.action==='reject'),r=>r.reason??'sin_motivo'),
  exampleCFK008:example,
  allSuccessOneSided95LowerBound:{sevenOfSeven:Math.pow(0.05,1/7),fiveOfFive:Math.pow(0.05,1/5),
    successesNeededFor98Percent:Math.ceil(Math.log(0.05)/Math.log(0.98)),
    assumption:'Ensayos independientes representativos sin selección; ejemplos repetidos del mismo viaje no cuentan como independientes.'},
}
const dir=path.join(root,'docs/auditoria-patentes-2026-10-08')
fs.mkdirSync(dir,{recursive:true})
fs.writeFileSync(path.join(dir,'resultados.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
