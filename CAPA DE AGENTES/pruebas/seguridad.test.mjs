import {test} from 'node:test';
import assert from 'node:assert/strict';
import {period,transitionStatus,security} from '../servicios/seguridad.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
test('período inclusivo y fechas imposibles rechazadas',()=>{assert.equal(period('2026-09-24','2026-09-30').length,7);assert.throws(()=>period('2026-02-30','2026-03-02'));assert.throws(()=>period('2026-10-02','2026-09-30'));});
test('salto de nodo sin lectura compatible es subsecuencia, no anomalía',()=>{const g={circuits:[{id:'R1',seq:['a','b','c']}]};assert.deepEqual(transitionStatus('a','c',g),{status:'COMPATIBLE_CON_MODELO',circuits:['R1']});assert.equal(transitionStatus('c','a',g).status,'TRANSICION_SIN_MODELO');assert.equal(transitionStatus('a','a',g).status,'MISMO_NODO');});
test('retorno comparte ID entre producto y seguridad sin afirmar ausencia de descarga',async t=>{
  const temp=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../temporal');await fs.mkdir(temp,{recursive:true});const root=await fs.mkdtemp(path.join(temp,'seguridad-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const modelDir=path.join(root,'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos');await fs.mkdir(modelDir,{recursive:true});
  const model={nodes:[{id:'sl-ing',devices:['SLZIngCamFrente']},{id:'sl-exit',devices:['SLZSalidaC1Fte']},{id:'ric-pre',devices:['RicPreIngInFr']}],circuits:[{id:'R7',seq:['sl-ing','sl-exit','ric-pre']}]};await fs.writeFile(path.join(modelDir,'modelo_nodo_sur.json'),JSON.stringify(model));
  const m=path.join(root,'data/movimientos/2026-09-24'),c=path.join(root,'data/truckflow/2026-09-24');await fs.mkdir(m,{recursive:true});await fs.mkdir(c,{recursive:true});
  await fs.writeFile(path.join(m,'movimientos.json'),JSON.stringify([{external_operation_id:'op',planta_normalized:'RICARDONE',mov:'I',product_normalized:'SOJA',plate_normalized:'ABC123',external_ingreso_at:'2026-09-24T10:00:00',external_salida_at:'2026-09-24T13:00:00'}]));
  const records=['SLZIngCamFrente','SLZSalidaC1Fte','RicPreIngInFr'].map((deviceCode,i)=>({id:String(i),truckPlate:'ABC123',occurredAt:`2026-09-24T${10+i}:00:00-03:00`,deviceCode}));records.push({id:'invalid',truckPlate:'ABC123',occurredAt:'invalid',deviceCode:'RicPreIngInFr'});await fs.writeFile(path.join(c,'event-list.json'),JSON.stringify({records}));
  const all=await security({root,from:'2026-09-24',to:'2026-09-24'}),product=await security({root,from:'2026-09-24',to:'2026-09-24',product:'soja'});
  const a=all.candidates.find(c=>c.kind==='RETORNO_SIN_LECTURA_DE_DESCARGA');assert.ok(a);assert.equal(a.caseId,product.candidates.find(c=>c.kind===a.kind).caseId);assert.equal(a.status,'PENDIENTE_REVISION');assert.deepEqual(a.operationIds,['op|RICARDONE|I']);assert.match(a.doesNotProve,/No acredita/);
  await fs.unlink(path.join(c,'event-list.json'));const missing=await security({root,from:'2026-09-24',to:'2026-09-24'});assert.equal(missing.status,'DATOS_INSUFICIENTES');assert.equal(missing.coverage.missingFiles.camaras.length,1);
});
