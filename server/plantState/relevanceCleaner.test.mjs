import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createPlantStateService} from './service.mjs'
import {createRelevanceCleaner} from './relevanceCleaner.mjs'

test('limpieza histórica guarda evidencia, exporta la quita y permite reabrir sin volver a descartar',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relevance-'))
  try {
    const at='2026-09-01T15:00:00.000Z'
    const item={fragmentKey:'f1',readPlate:'ABC123',deviceCode:'SLZTK400',at,level:'provisorio',originalLevel:'provisorio',validFormat:true,candidates:[]}
    fs.mkdirSync(path.join(root,'data','truckflow','2026-09-01'),{recursive:true})
    fs.writeFileSync(path.join(root,'data','plate-identification-archive.json'),JSON.stringify({san_lorenzo:{f1:item}}))
    fs.writeFileSync(path.join(root,'data','truckflow','2026-09-01','event-list.json'),JSON.stringify({records:[{
      truckPlate:'ABC123',deviceCode:'SLZTK400',journeyUid:'f1',occurredAt:new Date(Date.parse(at)-206*60000).toISOString(),
    }]}))
    const ps=createPlantStateService({projectRoot:root,apiBase:'http://127.0.0.1:9'})
    const ctx=ps.getIdentificationRelevanceContext('san_lorenzo','f1')
    assert.equal(ctx.historyAvailable,true)
    const capture={plate:'ABC123',at:new Date(Date.parse(at)-240000).toISOString(),vehicleCategory:'Pickup'}
    const cleaner=createRelevanceCleaner({projectRoot:root,getPlantState:()=>({...ps,getIdentifications:async()=>({items:[ctx.item]})}),dss:{isDssConfigured:()=>true,findVehicleCapture:async()=>capture}})
    assert.equal((await cleaner.sweep({dryRun:true})).eligible,1)
    assert.equal(ps.exportCorrections().corrections.length,0)
    assert.equal((await cleaner.sweep({dryRun:false})).rejected,1)
    assert.equal(ps.exportCorrections().corrections[0].kind,'drop')
    const log=JSON.parse(fs.readFileSync(path.join(root,'data','plate-identification-log.jsonl'),'utf8').trim())
    assert.equal(log.source,'automatic_relevance')
    assert.equal(log.relevance.capture.vehicleCategory,'Pickup')
    ps.decideIdentification('san_lorenzo','f1',{action:'review',reason:'Es un camión mal clasificado'})
    assert.equal(ps.rejectIdentificationByRelevance('san_lorenzo','f1',{...capture,diffMs:0}).applied,false)
    assert.equal(ps.exportCorrections().corrections.length,0)
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})

test('DSS 429 preserva el caso y hace backoff; no aplica descartes',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'relevance-'))
  try {
    let calls=0
    const item={fragmentKey:'f1',at:'2026-09-01T15:00:00Z',deviceCode:'SLZTK400',level:'pendiente',readPlate:'ABC123'}
    const cleaner=createRelevanceCleaner({projectRoot:root,getPlantState:()=>({getIdentifications:async()=>({items:[item]}),getIdentificationRelevanceContext:()=>({item})}),dss:{isDssConfigured:()=>true,findVehicleCapture:async()=>{calls++;throw new Error('DSS 429')}}})
    const result=await cleaner.sweep({dryRun:false})
    assert.equal(result.rejected,0)
    assert.equal((await cleaner.sweep()).retryAfterMs>0,true)
    assert.equal(calls,1)
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})
