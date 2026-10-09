import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {buildLearningModel} from '../server/plantState/cameraLearning.mjs'
import {identifyFragments,nodeModelCatalog} from '../server/plantState/plateIdentification.mjs'
import {getEventLiveInstantMs} from '../server/plantState/liveEventTime.mjs'
const root=process.cwd(), out=path.join(root,'docs/auditoria-patentes-2026-10-08/implementacion-1-2-3')
fs.mkdirSync(out,{recursive:true})
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''))
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
const logPath='data/plate-identification-log.jsonl'
const logs=fs.readFileSync(path.join(root,logPath),'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
const model={...buildLearningModel(logs),generatedAt:new Date().toISOString(),source:{path:logPath,sha256:hash(logPath)}}
fs.writeFileSync(path.join(out,'camera-learning-shadow.json'),JSON.stringify(model,null,2)+'\n')
const history=json('docs/auditoria-patentes-2026-10-08/investigacion-nodos/historical_nodes_evidence.json')
const versioned=history.weekly_runs.filter(r=>r.rulesVersion==='etl_transform_v17')
const counts={};const manifests=[]
for(const r of versioned) {
 const file=`runs/windows/${r.run_id}/tables/final_circuits.json`
 const rows=json(file).rows
 for(const row of rows){const code=row.executive_circuit_code;if(code)counts[code]=(counts[code]??0)+1}
 manifests.push({run_id:r.run_id,rulesVersion:r.rulesVersion,table:'final_circuits',sha256:hash(file),rows:rows.length})
}
const total=Object.values(counts).reduce((a,b)=>a+b,0)
const prior={mode:'shadow',rulesVersion:'etl_transform_v17',denominator:'recorridos de cámara con executive_circuit_code; no movimientos de Excel',sources:manifests,counts,prior:Object.fromEntries(Object.entries(counts).map(([k,n])=>[k,n/total]))}
fs.writeFileSync(path.join(out,'circuit-prior-v17-shadow.json'),JSON.stringify(prior,null,2)+'\n')
// Replay only physically captured held-out October days, independent of manual aliases.
const final=new Map();for(const r of logs)if(r.fragmentKey && r.action!=='note')final.set(`${r.site}|${r.fragmentKey}`,r)
const labels=[...final.values()].filter(r=>r.action==='confirm' && r.readPlate && r.plate && r.source!=='automatic_relevance')
const replay=[];const catalog=nodeModelCatalog()
for(const day of ['2026-10-06','2026-10-07']) {
 const target=labels.filter(r=>String(r.captureAt).startsWith(day));if(!target.length)continue
 const days=[-1,0,1].map(n=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10))
 const events=new Map();const sourceFiles=[]
 for(const d of days) {const f=`data/truckflow/${d}/event-list.json`;if(!fs.existsSync(path.join(root,f)))continue
  const obj=json(f), rows=Array.isArray(obj)?obj:obj.records??[];sourceFiles.push({path:f,sha256:hash(f)})
  for(const e of rows)if(!e.inferred && !e.manualCorrection && e.eventCategory==='physical')events.set(e.id??`${e.journeyUid}|${e.deviceCode}|${e.occurredAt}`,e)
 }
 const list=[...events.values()];const end=Date.parse(day+'T23:59:59-03:00')
 const start=performance.now();const identified=identifyFragments(list.filter(e=>getEventLiveInstantMs(e)>=end-48*3600000),end,{catalog})
 const matched=target.map(r=>({r,item:identified.items.find(i=>i.fragmentKey===r.fragmentKey && i.readPlate===r.readPlate && Math.abs(Date.parse(i.at)-Date.parse(r.captureAt))<5000)})).filter(x=>x.item)
 const autos=matched.filter(x=>x.item.level==='casi_seguro')
 replay.push({day,sourceFiles,physicalEventsInInput:list.length,humanLabels:target.length,matchedExactCase:matched.length,
  suggestedTopCorrect:matched.filter(x=>x.item.candidates[0]?.plate===x.r.plate).length,
  correctExpectedCandidatePresent:matched.filter(x=>x.item.candidates.some(c=>c.inUniverse && c.plate===x.r.plate)).length,
  correctExceptionPresent:matched.filter(x=>x.item.candidates.some(c=>!c.inUniverse && c.plate===x.r.plate)).length,
  automaticAssignments:autos.length,automaticAgreements:autos.filter(x=>x.item.assignedPlate===x.r.plate).length,
  disagreements:autos.filter(x=>x.item.assignedPlate!==x.r.plate).map(x=>({fragmentKey:x.r.fragmentKey,readPlate:x.r.readPlate,human:x.r.plate,automatic:x.item.assignedPlate})),
  elapsedMs:Math.round(performance.now()-start),limitations:'Feedback humano seleccionado, legado sin verificación estructurada; no certifica precisión general ni ajuste de umbrales.'})
}
const attrFile='outputs/reconocimiento_20260924_30/atributos_entre_camaras.json'
const report={generatedAt:new Date().toISOString(),learning:model,history:{source:'historical_nodes_evidence.json',physicalEvents:history.physical_events_deduplicated,sourceDays:history.source_days.length,journeyUidCount:history.journey_uid_count,runs:history.weekly_runs.map(r=>({run_id:r.run_id,rulesVersion:r.rulesVersion,table:'final_circuits'})),versions:history.weekly_runs.reduce((o,r)=>(o[r.rulesVersion]=(o[r.rulesVersion]??0)+1,o),{})},currentVersionPrior:prior,replay,
 historicalAttributes:{path:attrFile,sha256:hash(attrFile),data:json(attrFile),interpretation:'Acuerdo entre capturas supuestamente del mismo recorrido, no exactitud visual certificada; no aplicado como regla nueva.'},
 committee:{control:'reportes/logistica/2026-09-24_2026-09-30/revision-003/control.json',independentIdentityLabels:false},
 clock:{operationalSource:'getEventLiveInstantMs',sourceOffsetMinutes:206,photoLookupSeparate:true},
 scope:'149 fuentes históricas, corridas semanales, comités y feedback humano; no se ejecutó ETL ni se borró el historial'}
fs.writeFileSync(path.join(out,'validacion.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({history:report.history,learning:{confirmations:model.finalHumanConfirmations,verified:model.verifiedComparisons,exploratoryCorrections:model.legacyExploratoryCorrections,exploratoryPatterns:model.exploratoryProposals.length},replay},null,2))
