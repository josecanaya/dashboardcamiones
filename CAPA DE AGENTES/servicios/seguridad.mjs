import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {productFilter} from './datos.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GRAPH = 'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json';
const plateKey = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const realPlate = p => p.length >= 6 && !/^(.)\1+$/.test(p);
const rows = j => Array.isArray(j) ? j : (j.records ?? j.rows ?? []);
export function period(from,to) {
  const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!valid(from) || !valid(to) || from > to) throw new Error('Período inválido; use YYYY-MM-DD y desde <= hasta');
  const result=[]; for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000) { if(result.length>=366) throw new Error('Máximo 366 días por consulta'); result.push(new Date(t).toISOString().slice(0,10)); } return result;
}
export function transitionStatus(a,b,graph) {
  if(a===b) return {status:'MISMO_NODO',circuits:[]};
  const compatible=(graph.circuits ?? []).filter(c=>{const ia=c.seq.indexOf(a);return ia>=0 && c.seq.slice(ia+1).includes(b);}).map(c=>c.id);
  return {status:compatible.length ? 'COMPATIBLE_CON_MODELO' : 'TRANSICION_SIN_MODELO', circuits:compatible};
}
function excelTime(s) { if(!s) return NaN; return Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(s) ? s : s+'-03:00'); }
export async function security({from,to,plate,product,limit=30,timeOffsetMinutes=0,root=ROOT}={}) {
  const ds=period(from,to); product=product?.toLowerCase();
  if(product && !['soja','girasol','pellet','liquidos'].includes(product)) throw new Error('Producto desconocido');
  if(!Number.isFinite(+timeOffsetMinutes) || Math.abs(+timeOffsetMinutes)>1440) throw new Error('Offset inválido');
  const filterProduct=productFilter(product);
  const max=Math.max(1,Math.min(100,Number(limit)||30)); const filter=plate ? plateKey(plate) : null;
  const graph=JSON.parse(await fs.readFile(path.join(root,GRAPH),'utf8'));
  const map=new Map(); for(const n of graph.nodes) for(const dev of n.devices ?? []) { if(!map.has(dev))map.set(dev,[]);map.get(dev).push(n.id); }
  const rear=new Set(graph.nodes.flatMap(n=>n.rear ?? []));
  const ops=[],events=[],missing={movimientos:[],camaras:[]},files=[],seenOps=new Set(),seenEvents=new Set();
  for(const d of ds) {
    for(const [family,rel] of [['movimientos',`data/movimientos/${d}/movimientos.json`],['camaras',`data/truckflow/${d}/event-list.json`]]) {
      let content; try{content=JSON.parse(await fs.readFile(path.join(root,rel),'utf8'));}catch(e){if(e.code==='ENOENT'){missing[family].push(d);continue;}throw e;}
      files.push(rel);
      for(const [i,x] of rows(content).entries()) {
        if(family==='movimientos') {
          const p=plateKey(x.plate_normalized ?? x.patente_original); if(filter && p!==filter)continue;
          if(!filterProduct.test(x))continue;
          const id=x.external_operation_id ? `${x.external_operation_id}|${x.planta_normalized||x.planta_original}|${x.movement_type_detail||x.mov}` : `${rel}#${i}`; if(seenOps.has(id))continue; seenOps.add(id);
          ops.push({...x,plate:p,evidence:{file:rel,row:i+1,operationId:id}});
        } else {
          const p=plateKey(x.truckPlate); if(!realPlate(p)||(filter&&p!==filter)||rear.has(x.deviceCode))continue;
          const id=x.id || `${p}|${x.occurredAt}|${x.deviceCode}`; if(seenEvents.has(id))continue;seenEvents.add(id);
          const t=Date.parse(x.occurredAt)+Number(timeOffsetMinutes)*60000;
          if(!Number.isFinite(t))continue;
          const localDay=new Date(t-3*3600000).toISOString().slice(0,10); if(!ds.includes(localDay))continue;
          if(Number.isFinite(t))events.push({id,plate:p,t,device:x.deviceCode,rawOccurredAt:x.occurredAt,correctedAt:new Date(t).toISOString(),nodes:map.get(x.deviceCode)??[],evidence:{file:rel,eventId:id}});
        }
      }
    }
  }
  const opPlates=new Set(ops.filter(x=>realPlate(x.plate)).map(x=>x.plate));
  const scope=product ? events.filter(e=>opPlates.has(e.plate)) : events;
  const byPlate=new Map();for(const e of scope){if(!byPlate.has(e.plate))byPlate.set(e.plate,[]);byPlate.get(e.plate).push(e);}
  const candidates=[];const counts={};
  const emit=(kind, p, ev, detail)=>{
    counts[kind]=(counts[kind]??0)+1;
    if(candidates.length>=max)return;
    const key=createHash('sha256').update(`${kind}|${p}|${ev.map(e=>e.id).join('|')}`).digest('hex').slice(0,20);
    const related=ops.filter(o=>o.plate===p && ev.some(e=>Number.isFinite(excelTime(o.external_ingreso_at)) && Number.isFinite(excelTime(o.external_salida_at)) && e.t>=excelTime(o.external_ingreso_at)&&e.t<=excelTime(o.external_salida_at)));
    candidates.push({caseId:`CASO_${key}`,kind,status:'PENDIENTE_REVISION',plate:p,productAttribution:related.length===1?'CANDIDATA_TEMPORAL':'NO_RESUELTA',operationIds:related.map(o=>o.evidence.operationId),events:ev,detail,doesNotProve:'No acredita infracción ni ausencia de operación; requiere revisión de cobertura, vínculo y contexto del producto.'});
  };
  for(const [p,list] of byPlate) {
    list.sort((a,b)=>a.t-b.t);
    for(let i=1;i<list.length;i++) {
      const a=list[i-1],b=list[i];
      if(a.nodes.length!==1 || b.nodes.length!==1) continue;
      if(b.t-a.t>12*3600000)continue;
      const status=transitionStatus(a.nodes[0],b.nodes[0],graph);
      if(status.status==='TRANSICION_SIN_MODELO')emit('TRANSICION_SIN_MODELO',p,[a,b],{fromNode:a.nodes[0],toNode:b.nodes[0],minutes:(b.t-a.t)/60000,rule:'Dos lecturas consecutivas sin orden compatible en un circuito del catálogo; no equivale a recorrido completo.'});
    }
    for(let i=0;i<list.length;i++) {
      const entry=list[i];
      if(entry.device!=='SLZIngCamFrente')continue;
      const exitIndex=list.findIndex((e,j)=>j>i && /^SLZSalidaC[12]Fte$/.test(e.device) && e.t-entry.t<=24*3600000);
      if(exitIndex<0)continue;
      const visit=list.slice(i,exitIndex+1),exit=list[exitIndex];
      const returnRic=list.slice(exitIndex+1).find(e=>['RicIngCamFrente','RicPreIngInFr'].includes(e.device) && e.t-exit.t<=48*3600000);
      if(!visit.some(e=>/^SLZVolcableC[1-5]$/.test(e.device))) {
        if(returnRic)emit('RETORNO_SIN_LECTURA_DE_DESCARGA',p,[entry,exit,returnRic],{rule:'Visita al puerto sin lectura de volcable seguida de ingreso/preingreso Ricardone dentro de 48 h; hipótesis de cobertura u operación pendiente, no prueba no descarga.',portMinutes:(exit.t-entry.t)/60000,searchWindowHours:48});
        else emit('VISITA_PUERTO_SIN_LECTURA_VOLCABLE',p,[entry,exit],{rule:'Ingreso y egreso observados sin lectura de volcable; candidato de cobertura/operación, no anomalía confirmada.',portMinutes:(exit.t-entry.t)/60000});
      }
      const prevRic=list.slice(0,i).reverse().find(e=>e.device==='RicEgrCamFrente');
      const delay=prevRic?(entry.t-prevRic.t)/60000:0;
      if(prevRic && delay>30 && delay<=12*60 && !visit.some(e=>/^SLZCal/.test(e.device)))emit('DEMORA_INTERPLANTA_SIN_CALADO_OBSERVADO',p,[prevRic,entry,exit],{minutes:delay,thresholdMinutes:30,thresholdStatus:'CRITERIO_HISTORICO_DEL_INFORME_NO_UMBRAL_UNIVERSAL',source:'scripts/estado-planta/gen_comite_seguridad.py',rule:'Demora >30 minutos entre lecturas de egreso Ricardone e ingreso SLZ sin calado observado durante la visita; requiere contexto operativo.'});
    }
  }
  // Comparar calle declarada sólo cuando los extremos temporales son válidos.
  for(const o of ops) {
    const platform=String(o.platform_normalized ?? ''); const declared=platform.match(/VOLCABLE_PTO_([1-5])/);
    if(!declared || !realPlate(o.plate))continue;
    const start=excelTime(o.external_ingreso_at),end=excelTime(o.external_salida_at);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    const readings=(byPlate.get(o.plate)??[]).filter(e=>e.t>=start&&e.t<=end&&/^SLZVolcableC[1-5]$/.test(e.device));
    if(readings.length && !readings.some(e=>e.device===`SLZVolcableC${declared[1]}`))emit('CALLE_DECLARADA_VS_OBSERVADA',o.plate,readings,{operationId:o.evidence.operationId,declaredPlatform:platform,observedDevices:[...new Set(readings.map(e=>e.device))],rule:'Lecturas en ventana Excel; confirmar vueltas y offset antes de clasificar.'});
  }
  return {schemaVersion:1,period:{from,to,dayPolicy:'calendario Argentina, eventos con offset explícito'},product:product??'todos',plate:filter,
    status:missing.camaras.length?'DATOS_INSUFICIENTES':'CONTROLES_EJECUTADOS_CON_LIMITACIONES',
    timePolicy:{rawField:'occurredAt',offsetMinutes:Number(timeOffsetMinutes),status:Number(timeOffsetMinutes)===0?'ORIGINAL_SIN_CORRECCION':'CORRECCION_EXPLICITA_PENDIENTE_VALIDACION',legacyOffsetMinutes:206,source:'scripts/estado-planta/metricas-camaras.cjs'},
    coverage:{missingFiles:missing,filesAvailable:files.length,instrumentalCoverage:'NO_CERTIFICADA',boundary:'Carga archivos del período solicitado; eventos corregidos en archivos adyacentes pueden faltar en los extremos.'},
    denominators:{operations:ops.length,events:scope.length,distinctPlates:byPlate.size,unitCandidates:'candidatos de control; una patente puede generar varios'},
    candidatesByKind:counts,totalCandidates:Object.values(counts).reduce((a,b)=>a+b,0),candidates,truncated:Object.values(counts).reduce((a,b)=>a+b,0)>candidates.length,
    implementedControls:['transiciones sin orden en catálogo','calle declarada vs lectura temporal','visita/retorno sin lectura de descarga','demora interplanta sin calado observado'],
    graphSource:GRAPH,sources:files,limitations:['Sin anomalías confirmadas automáticamente.','Eventos de un producto seleccionados por patentes de sus movimientos: atribución individual exige vínculo temporal.','Nodos ambiguos y cámaras sin mapeo no clasifican transiciones.','No encontrar lectura no prueba ausencia de descarga.','Los antecedentes del informe de Claude no se incorporan como casos recalculados.']};
}
