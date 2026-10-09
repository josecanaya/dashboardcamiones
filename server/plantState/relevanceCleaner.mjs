import fs from 'node:fs'
import path from 'node:path'
import { assessVehicleRelevance, isRelevanceDevice, RELEVANCE_RULE_VERSION } from './vehicleRelevance.mjs'

export function createRelevanceCleaner({ dss, getPlantState, projectRoot }) {
  const checked = new Map()
  let running = false, timer = null, backoffUntil = 0
  const dir = path.join(projectRoot,'data','relevance-cleanup')
  async function sweep({dryRun=true,limit=10,force=false}={}) {
    if (running) return {busy:true}
    running=true
    const report={at:new Date().toISOString(),ruleVersion:RELEVANCE_RULE_VERSION,dryRun,scanned:0,rejected:0,eligible:0,results:[]}
    try {
      if (!dss.isDssConfigured()) return {...report,error:'DSS no configurado'}
      if (Date.now()<backoffUntil) return {...report,retryAfterMs:backoffUntil-Date.now()}
      const ps=getPlantState()
      const ids=await ps.getIdentifications('san_lorenzo')
      const pending=ids.items.filter(i=>['provisorio','pendiente'].includes(i.level)&&isRelevanceDevice(i.deviceCode)&&!i.decision&&!i.claim)
        .sort((a,b)=>a.at.localeCompare(b.at))
      report.pendingInScope=pending.length
      for (const item of pending) {
        if(report.scanned>=Math.min(100,Math.max(1,limit))) break
        const tag=`${item.fragmentKey}|${item.at}|${item.readPlate}`
        const hit=checked.get(tag)
        if(!force && hit && Date.now()-hit.at < 30*60000 && !(hit.assessment.reject && !dryRun)) continue
        report.scanned++
        try {
          const context=ps.getIdentificationRelevanceContext('san_lorenzo',item.fragmentKey)
          if(!context) continue
          // Obtener solo la captura propia: no pedir fotos/atributos de candidatos ajenos.
          const found=hit?.capture ?? await dss.findVehicleCapture(item.deviceCode,Date.parse(item.at)-240000,item.readPlate)
          const capture=found ? {plate:found.plate,at:found.at,deviceCode:item.deviceCode,
            vehicleCategory:found.vehicleCategory,vehicleBrand:found.vehicleBrand,vehicleColor:found.vehicleColor,
            diffMs:Math.abs(Date.parse(found.at)-(Date.parse(item.at)-240000))} : null
          const assessment=assessVehicleRelevance({...context,capture})
          checked.set(tag,{at:Date.now(),capture,assessment})
          const row={fragmentKey:item.fragmentKey,plate:item.readPlate,deviceCode:item.deviceCode,captureAt:item.at,capture,assessment,applied:false}
          if(assessment.reject) {
            report.eligible++
            if(!dryRun) {
              const result=ps.rejectIdentificationByRelevance('san_lorenzo',item.fragmentKey,capture)
              row.applied=result.applied
              if(result.applied) report.rejected++
              else row.assessment=result.assessment ?? {reason:result.reason}
            }
          }
          report.results.push(row)
        } catch(error) {
          const message=error instanceof Error ? error.message : String(error)
          report.results.push({fragmentKey:item.fragmentKey,plate:item.readPlate,error:message,applied:false})
          if(/429|rate.limit|too many/i.test(message)) {backoffUntil=Date.now()+60000;break}
        }
      }
      if(checked.size>10000) checked.clear()
      fs.mkdirSync(dir,{recursive:true})
      fs.appendFileSync(path.join(dir,'sweeps.jsonl'),JSON.stringify(report)+'\n')
      return report
    } finally {running=false}
  }
  function start() {
    if(timer) return
    timer=setInterval(()=>void sweep({dryRun:false,limit:3}).catch(e=>console.warn('[relevancia]',e.message)),30000)
    timer.unref?.()
  }
  return {sweep,start}
}
