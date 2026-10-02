import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ROOT,days,runTable} from './datos.mjs';
const execute=promisify(execFile);
const add=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function coveringWeeks(from,to){const result=new Set();for(const day of days(from,to)){const date=new Date(day+'T12:00:00Z'),weekday=date.getUTCDay();const monday=add(day,-((weekday+6)%7));result.add(monday+'_'+add(monday,6));}return [...result];}
export async function pellet({from,to,runs}={}){
 days(from,to);const selected=runs??coveringWeeks(from,to);
 if(!Array.isArray(selected)||!selected.length||selected.some(run=>!/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(run)))throw Error('Corridas inválidas');
 if(days(from,to).some(day=>!selected.some(run=>{const [start,end]=run.split('_');return day>=start&&day<=end;})))throw Error('Corridas no cubren todo el período solicitado');
 const tables=[];for(const run of [...new Set(selected)]){const [start,end]=run.split('_');days(start,end);if(new Date(start+'T12:00:00Z').getUTCDay()!==1||end!==add(start,6))throw Error('Sólo semanas calendario lunes–domingo');tables.push(await runTable({run,table:'excel_operations_with_truckflow',limit:10000}));if(tables.at(-1).truncated)throw Error('Tabla supera límite de 10000 filas; no ejecutar receta incompleta');}
 // Preserve the legacy recipe's exact denominator, including its dedup by external_operation_id.
 const seen=new Set(),matched=[];for(const table of tables)for(const x of table.rows){if(seen.has(x.external_operation_id))continue;seen.add(x.external_operation_id);if(!/PELLET/i.test(x.product_normalized)||!/R3[012]/.test(x.resolved_executive_circuit_code||'')||/^(.)\1+$/.test(x.plate_normalized)||x.source_date<from||x.source_date>to)continue;matched.push(x);}
 const cameraCoverage=[];for(const day of days(add(from,-1),add(to,1))){const file=path.join(ROOT,'data/truckflow',day,'event-list.json');let available=false;try{await fs.access(file);available=true;}catch{}cameraCoverage.push({day,file,available});}
 const dir=path.join(ROOT,'CAPA DE AGENTES/salidas');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`pellet-operativo-${from}_${to}.json`);
 const script=path.join(ROOT,'scripts/estado-planta/pellet-operativo.cjs');await execute(process.execPath,['--max-old-space-size=4096',script,from,to,file,...selected],{cwd:ROOT,timeout:120000,maxBuffer:2*1024*1024,windowsHide:true});
 const data=JSON.parse(await fs.readFile(file,'utf8'));
 const weighed=matched.filter(x=>x.kgs_neto!==null&&x.kgs_neto!==undefined&&String(x.kgs_neto).trim()!==''&&Number.isFinite(Number(x.kgs_neto)));
 if(weighed.length!==matched.length||!matched.length)data.planilla.toneladasReales=null;
 data.planilla.pesaje={estado:weighed.length===matched.length&&matched.length?'DISPONIBLE_EN_TABLA':'PENDIENTE_FUENTE',movimientosConKilos:weighed.length,movimientos:matched.length,reason:'Ausencia de kilos no representa cero toneladas. La estimación toneladas30 usa 30 toneladas por viaje y no es pesaje.'};
 data.provenance={recipe:script,runs:tables.map(t=>({run_id:t.run_id,rulesVersion:t.rulesVersion,source:t.file})),cameraCoverage,legacyRules:{offsetMinutes:206,timezone:'-03:00',dedup:'external_operation_id; conserva receta histórica, distinto de dedup por planta y dirección de consultas generales',circuits:'R30/R31/R32',operativeGapHours:4,cameraLookbackHours:10,cameraLookaheadHours:12,duplicateScaleMinutes:30,capsMinutes:{ingreso:60,playa1:240,ptara:120,carga:480,interplanta:60,playaOsl:480,descarga:360,salida:120,ric:600,sl:720,ciclo:1200,vuelta:180}},warning:'Receta histórica reutilizada; offset y reconocimiento de viajes requieren validación operativa antes de conclusiones de seguridad. Fuentes cámara incompletas impiden concluir ausencia.'};
 data.state=data.planilla.viajes?'CON_ACTIVIDAD':cameraCoverage.every(x=>x.available)?'SIN_ACTIVIDAD_CONFIRMADA':'DATOS_INSUFICIENTES';data.stateScope='Movimientos de pellet clasificados R30/31/32 en tablas guardadas; no incluye todos los movimientos de pellet';
 await fs.writeFile(file,JSON.stringify(data,null,2));return {...data,output:file};
}
