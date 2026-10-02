import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {report} from '../servicios/informes.mjs';

test('rechaza período y tipo inválidos antes de leer fuentes',async()=>{
 await assert.rejects(report({from:'../../',to:'2026-09-30'}));
 await assert.rejects(report({from:'2026-09-30',to:'2026-09-24'}));
 await assert.rejects(report({from:'2026-09-24',to:'2026-09-30',type:'otro'}));
});
test('período sin fuentes no hereda cifras del comité anterior',async()=>{
 const files=await report({from:'2025-01-01',to:'2025-01-01',type:'logistica',product:'soja'});
 const data=JSON.parse(await fs.readFile(files.json,'utf8'));
 assert.equal(data.sections.length,1);
 assert.equal(data.sections[0].metrics[0].value,0);
 assert.match(data.sections[0].status,/INSUFICIENTES/);
 assert.ok(!data.sections.some(s=>s.id.includes('antecedente')));
 assert.ok((await fs.readFile(files.html,'utf8')).includes('DATOS_INSUFICIENTES'));
});
test('pellet 24–30 produce evidencia actual y antecedente separado',async()=>{
 const files=await report({from:'2026-09-24',to:'2026-09-30',type:'logistica',product:'pellet',includeLegacy:true});
 const data=JSON.parse(await fs.readFile(files.json,'utf8'));
 assert.ok(data.sections.find(s=>s.id==='pellet').data.sources.length>0);
 const prior=data.sections.find(s=>s.id==='pellet-antecedente');
 assert.ok(prior); assert.match(prior.status,/NO REVALIDADO/);
 assert.equal(prior.metrics.find(m=>m.label==='Viajes de planilla del operativo').value,prior.pellet.planilla.viajes);
 assert.ok(files.pptx,'Python bundled genera PPTX editable');
});
test('combinado conserva unicode del comité seguridad y muestra casos actuales',async()=>{
 const files=await report({from:'2026-09-24',to:'2026-09-30',type:'ambos',product:'pellet',includeLegacy:true});
 assert.deepEqual(files.warnings,[]);
 const data=JSON.parse(await fs.readFile(files.json,'utf8'));
 const security=data.sections.find(s=>s.id==='seguridad');
 assert.equal(security.metrics[0].value,security.data.totalCandidates);
 assert.ok(security.tables.find(t=>t.title==='Muestra de candidatos'));
 const legacy=data.sections.find(s=>s.id==='seguridad-antecedente');
 assert.ok(legacy.referenceSlides.length>0);
 assert.match(legacy.referenceSlides.map(s=>s.text).join('\n'),/→/);
});
