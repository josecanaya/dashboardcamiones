import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { calculateDuration, createMetricService, quantile } from './metrics.mjs'
import { sourceFingerprint, archiveRun } from './provenance.mjs'
const scope = { mode: 'historical', site: 'both', from:'2026-09-28', to:'2026-10-04', metricId:'circuit.duration_median', runIds:['2026-09-28_2026-10-04'] }
const row = (key, value, extra={}) => ({ journey_key:key, external_operation_id:key, circuito_code:'R7', total_min:value, inicio_at:'2026-09-28T10:00:00-03:00', ...extra })
describe('Contrato transversal de métricas', () => {
  it('P90 combina hechos, no promedia los percentiles de ventanas', () => assert.equal(quantile([1,2,3,100,200], .9),160))
  it('sin observaciones es null; cero real conserva n', () => {
    assert.equal(calculateDuration([],scope,scope.metricId).value,null)
    assert.deepEqual(calculateDuration([row('a',0)],scope,scope.metricId),{value:0,n:1,rejected:0,durationColumn:'total_min'})
  })
  it('filtra período, circuito, producto y patente; no incluye vacíos como cero', () => {
    const rows=[row('a',10,{product_normalized:'SOJA',plate_normalized:'ABC123'}),row('b',''),row('c',100,{inicio_at:'2026-10-05T10:00:00-03:00'})]
    assert.equal(calculateDuration(rows,{...scope,circuit:'R7',product:'SOJA',plate:'ABC123'},scope.metricId).value,10)
    assert.equal(calculateDuration(rows,scope,scope.metricId).rejected,1)
  })
  it('no cuenta dos veces ni oculta duplicados contradictorios', () => {
    assert.equal(calculateDuration([row('a',10),row('a',10)],scope,scope.metricId).n,1)
    assert.throws(()=>calculateDuration([row('a',10),row('a',20)],scope,scope.metricId),/contradictorias/)
  })
  it('el mismo valor y revisión generan la misma evidencia; cambiar el contenido invalida la revisión', async () => {
    const root=mkdtempSync(path.join(tmpdir(),'truckflow-metric-'))
    try {
      const dir=path.join(root,'windows',scope.runIds[0]); mkdirSync(path.join(dir,'tables'),{recursive:true})
      writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({rulesVersion:'v17',status:'ok'}))
      writeFileSync(path.join(dir,'stats.json'),'{}')
      const file=path.join(dir,'tables','E_kpi_operacion.json')
      writeFileSync(file,JSON.stringify({rows:[row('a',10),row('b',20)]}))
      const service=createMetricService({runsRoot:root})
      const a=await service.getMetric(scope),b=await service.getMetric(scope)
      assert.equal(a.value,15); assert.equal(a.evidenceId,b.evidenceId); assert.equal(a.coverage,'complete')
      writeFileSync(file,JSON.stringify({rows:[row('a',30),row('b',20)]}))
      await assert.rejects(service.getMetric({...scope,revisions:{[scope.runIds[0]]:a.runs[0].revision}}),/cambió/)
      const partial=await service.getMetric({...scope,to:'2026-10-05'})
      assert.equal(partial.coverage,'partial'); assert.deepEqual(partial.missingDays,['2026-10-05'])
    } finally { rmSync(root,{recursive:true,force:true}) }
  })
  it('el snapshot se consulta para la planta pedida y no inventa presencia faltante', async () => {
    const sites=[]
    const service=createMetricService({getSnapshot:async site=>{sites.push(site);return {plant:{trucksInPlant:3},zones:[{id:'Z1',backlog:2}]}}})
    const result=await service.getMetric({mode:'live',site:'san_lorenzo',metricId:'plant.trucks_present',zone:'Z1'})
    assert.equal(result.value,2); assert.deepEqual(sites,['san_lorenzo'])
    assert.equal((await service.getMetric({mode:'live',site:'ricardone',metricId:'plant.trucks_present',zone:'missing'})).value,null)
  })
  it('rechaza contratos y períodos incompatibles', async () => {
    const service=createMetricService({})
    await assert.rejects(service.getMetric({...scope,from:'2026-02-30'}),/Período inválido/)
    await assert.rejects(service.getMetric({...scope,metricId:'no-existe'}),/desconocida/)
    await assert.rejects(service.getMetric({...scope,mode:'live'}),/modo/)
  })
})
describe('Correcciones y materializaciones', () => {
  it('detecta un archivo reemplazado con igual ruta y tamaño, y cambios de correcciones', () => {
    const root=mkdtempSync(path.join(tmpdir(),'truckflow-input-'))
    try {
      const file=path.join(root,'events.json');writeFileSync(file,'[1]')
      const args={eventsPaths:[file],movimientosRoot:path.join(root,'mov'),from:scope.from,to:scope.to,corrections:[]}
      const first=sourceFingerprint(args);writeFileSync(file,'[2]')
      const second=sourceFingerprint(args);assert.notEqual(first,second)
      assert.notEqual(second,sourceFingerprint({...args,corrections:[{key:'one',plate:'ABC123'}]}))
    } finally { rmSync(root,{recursive:true,force:true}) }
  })
  it('reprocesar no altera la materialización anterior', () => {
    const root=mkdtempSync(path.join(tmpdir(),'truckflow-revision-'))
    try {
      const dir=path.join(root,'windows',scope.runIds[0]);mkdirSync(dir,{recursive:true})
      writeFileSync(path.join(dir,'manifest.json'),'{}');writeFileSync(path.join(dir,'stats.json'),'old')
      const revision=archiveRun(root,scope.runIds[0],dir)
      writeFileSync(path.join(dir,'stats.json'),'new')
      assert.equal(readFileSync(path.join(root,'_revisions',scope.runIds[0],revision,'stats.json'),'utf8'),'old')
      assert.notEqual(archiveRun(root,scope.runIds[0],dir),revision)
    } finally { rmSync(root,{recursive:true,force:true}) }
  })
})
