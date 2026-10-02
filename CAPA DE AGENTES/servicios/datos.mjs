import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import XLSX from 'xlsx';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
const plateKey=x=>norm(x).replace(/[^A-Z0-9]/g,'');
export const usablePlate=x=>{const p=plateKey(x);return p.length>=6&&!/^(.)\1+$/.test(p);};
export const operationId=row=>row.external_operation_id?`${row.external_operation_id}|${row.planta_normalized||row.planta_original}|${row.movement_type_detail||row.mov}`:createHash('sha256').update(JSON.stringify(row)).digest('hex');
export function timestamp(value){if(!value)return NaN;const s=String(value);return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)?s:s+'-03:00');}
const cache=new Map();
export function days(from,to){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from??'')||!/^\d{4}-\d{2}-\d{2}$/.test(to??''))throw Error('Fechas requeridas YYYY-MM-DD');
 const a=Date.parse(from+'T00:00:00Z'),b=Date.parse(to+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||new Date(a).toISOString().slice(0,10)!==from||new Date(b).toISOString().slice(0,10)!==to||b<a||b-a>366*86400000)throw Error('Ventana inválida o mayor a 366 días');
 return Array.from({length:1+(b-a)/86400000},(_,i)=>new Date(a+i*86400000).toISOString().slice(0,10));
}
async function safe(root,file){const base=await fs.realpath(root);const target=await fs.realpath(path.resolve(root,file));if(target!==base&&!target.startsWith(base+path.sep))throw Error('Archivo fuera del repositorio');return target;}
async function load(file,kind){try{const stat=await fs.stat(file),key=stat.mtimeMs+':'+stat.size;let value=cache.get(file)?.key===key?cache.get(file).value:undefined;if(!value){value=JSON.parse(await fs.readFile(file,'utf8'));cache.set(file,{key,value});if(cache.size>32)cache.delete(cache.keys().next().value);}const rows=Array.isArray(value)?value:value.records;if(!Array.isArray(rows))throw Error('Esquema inválido: se esperaba array o records');return {file,kind,available:true,count:rows.length,metadata:Array.isArray(value)?{}:{fetchedAt:value.fetchedAt,recordCount:value.recordCount,cardinalityConsistent:value.recordCount===undefined?null:value.recordCount===rows.length},warning:'Archivo disponible no garantiza cobertura upstream completa',rows};}catch(e){return {file,kind,available:false,error:e.message,rows:[]};}}
export async function sources({from,to,root=ROOT,includeCameras=true}){const calendar=days(from,to);const entries=await Promise.all(calendar.flatMap(day=>(includeCameras?['movimientos','truckflow']:['movimientos']).map(async kind=>{const result=await load(path.join(root,'data',kind,day,kind==='movimientos'?'movimientos.json':'event-list.json'),kind);return {...result,day,rows:undefined};})));return {from,to,dateCriterion:'Particiones source_date para Excel; particiones de eventos para cámaras. Presencia de archivo no certifica exhaustividad upstream.',sources:entries,coverage:{expectedDays:calendar.length,camarasConsultadas:includeCameras,movimientos:entries.filter(x=>x.kind==='movimientos'&&x.available).length,camaras:entries.filter(x=>x.kind==='truckflow'&&x.available).length},runs:'No consultadas; sin ejecución automática de ETL'};}
export function productFilter(product){const p=norm(product||'TODOS');if(!['SOJA','GIRASOL','PELLET','LIQUIDOS','TODOS'].includes(p))throw Error('Producto no soportado');return {product:p,description:p==='LIQUIDOS'?'ACEITE, BIODIESEL, GLICERINA/GLICEROL, LECITINA, BORRAS, GOMA, METANOL, METILATO o ACIDOS; excluye pellets, expeller y harinas':p==='PELLET'?'Contiene PELLET':p==='TODOS'?'Todos los productos':'Coincidencia exacta de grano '+p,test:r=>{const s=norm(r.product_normalized||r.producto_original);return p==='TODOS'||(p==='SOJA'||p==='GIRASOL'?s===p:p==='PELLET'?s.includes('PELLET'):!/(PELLET|EXPELLER|HARINA)/.test(s)&&/(ACEITE|BIODIESEL|GLICERINA|GLICEROL|LECITINA|BORRAS|GOMA|METANOL|METILATO|ACIDO)/.test(s));}};}
export async function query({from,to,product,plate,limit=20,root=ROOT,timestamps,includeCameras=true}){
 const calendar=days(from,to),filter=productFilter(product);if(!Number.isInteger(limit)||limit<0||limit>10000)throw Error('limit entre 0 y 10000');
 if(timestamps&&(!Number.isFinite(timestamp(timestamps.from))||!Number.isFinite(timestamp(timestamps.to))||timestamp(timestamps.to)<timestamp(timestamps.from)))throw Error('Intervalo timestamp inválido');
 const coverage=await sources({from,to,root,includeCameras});const operations=new Map(),events=new Map();
 for(const day of calendar){for(const kind of (includeCameras?['movimientos','truckflow']:['movimientos'])){const f=path.join(root,'data',kind,day,kind==='movimientos'?'movimientos.json':'event-list.json');const data=await load(f,kind);for(let i=0;i<data.rows.length;i++){const row=data.rows[i];if(kind==='movimientos'){
 if(!filter.test(row)||(plate&&plateKey(row.plate_normalized||row.patente_original)!==plateKey(plate)))continue;
 // An operation identifier can repeat in distinct plants or movement directions; preserve those legs.
 const identity=operationId(row);
 const evidence={file:f,index:i,source_file:row.source_file,source_date:row.source_date};
 if(operations.has(identity)){const old=operations.get(identity);old.evidence.push(evidence);if(JSON.stringify(old.data)!==JSON.stringify(row))old.conflictingSnapshots=true;}else operations.set(identity,{id:identity,data:row,evidence:[evidence]});
 }else{if(plate&&plateKey(row.truckPlate)!==plateKey(plate))continue;if(timestamps){const t=timestamp(row.occurredAt);if(!Number.isFinite(t)||t<timestamp(timestamps.from)||t>timestamp(timestamps.to))continue;}const key=row.id??createHash('sha256').update(JSON.stringify(row)).digest('hex');if(!events.has(key))events.set(key,{...row,evidence:{file:f,index:i}});}}
 }}
 const all=[...operations.values()],camera=[...events.values()].sort((a,b)=>String(a.occurredAt).localeCompare(String(b.occurredAt)));
 const byPlate=new Map();for(const e of camera){const key=plateKey(e.truckPlate);if(!byPlate.has(key))byPlate.set(key,[]);byPlate.get(key).push(e);}
 const matching=all.slice(0,limit).map(op=>{const start=timestamp(op.data.external_ingreso_at),end=timestamp(op.data.external_salida_at);const valid=usablePlate(op.data.plate_normalized||op.data.patente_original)&&Number.isFinite(start)&&Number.isFinite(end)&&end>=start;const candidates=valid?(byPlate.get(plateKey(op.data.plate_normalized))||[]).filter(e=>timestamp(e.occurredAt)>=start&&timestamp(e.occurredAt)<=end):[];const journeys=[...new Set(candidates.map(e=>e.journeyUid).filter(Boolean))];return {...op,cameraEvidence:{state:!valid||coverage.coverage.camaras<calendar.length?'DATOS_INSUFICIENTES':journeys.length>1?'AMBIGUO':candidates.length?'CANDIDATO':'SIN_EVIDENCIA',reason:'Coincidencia por patente y intervalo original de Excel; no constituye atribución de producto ni match canónico. Sin aplicar desfase histórico de 206 minutos.',candidateEvents:candidates.length,journeys,events:candidates.slice(0,limit)}};});
 return {from,to,state:all.length?'CON_ACTIVIDAD':coverage.coverage.movimientos===calendar.length?'SIN_ACTIVIDAD_CONFIRMADA':'DATOS_INSUFICIENTES',stateScope:'Registros de movimientos originales disponibles, no certifica actividad física ni completitud upstream',productFilter:{product:filter.product,description:filter.description},denominators:{movimientos:all.length,patentesUnicas:new Set(all.map(x=>plateKey(x.data.plate_normalized||x.data.patente_original)).filter(usablePlate)).size,movimientosSinPatenteUtilizable:all.filter(x=>!usablePlate(x.data.plate_normalized||x.data.patente_original)).length,criterioPatente:'Alfanumérica normalizada, longitud >=6, excluye caracteres idénticos repetidos; no valida registro automotor',eventosCamara:plate?camera.length:undefined},coverage:coverage.coverage,sources:coverage.sources,dateCriterion:coverage.dateCriterion,operations:matching,events:plate?camera.slice(0,limit):[],truncated:all.length>limit||Boolean(plate&&camera.length>limit)};
}
export async function readExcel({file,sheet,limit=20,root=ROOT}){const target=await safe(root,file);if(!/\.xlsx?$/i.test(target))throw Error('Sólo Excel xls/xlsx');if(!Number.isInteger(limit)||limit<0||limit>10000)throw Error('limit inválido');const wb=XLSX.read(await fs.readFile(target),{type:'buffer',cellDates:false});if(!sheet)return {file:target,sheets:wb.SheetNames};if(!wb.Sheets[sheet])throw Error('Hoja inexistente');const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:null});return {file:target,sheet,totalRows:rows.length,rows:rows.slice(0,limit).map((values,i)=>({row:i+1,values})),truncated:rows.length>limit};}
export async function readApi({path:route,base='http://127.0.0.1:8787'}){const origin=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(origin.hostname)||!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('API debe ser local');const url=new URL(route,origin);if(url.origin!==origin.origin)throw Error('Endpoint fuera de API local');const response=await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error(`API ${response.status}`);return {source:url.href,status:response.status,data:await response.json()};}
export async function circuits({search='',root=ROOT}={}){const file=path.join(root,'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json');const model=JSON.parse(await fs.readFile(file,'utf8'));const needle=norm(search);const keep=x=>!needle||norm(JSON.stringify(x)).includes(needle);return {source:file,nodes:model.nodes.filter(keep),edges:model.edges.filter(keep),optionalEdges:model.optEdges.filter(keep),circuits:Array.isArray(model.circuits)?model.circuits.filter(keep):Object.fromEntries(Object.entries(model.circuits).filter(([k,v])=>keep({id:k,...v}))),warning:'Modelo físico declarado; no atribuye productos ni valida automáticamente recorridos'};}



export async function operations(options){return query({...options,includeCameras:false});}
export async function runTable({run,table,from,to,limit=20,root=ROOT}){
 if(!/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(run??''))throw Error('run debe identificar una ventana guardada');
 if(!/^[A-Za-z0-9_]+(?:\.json)?$/.test(table??''))throw Error('Nombre de tabla inválido');
 const name=table.replace(/\.json$/,'');
 if(['merged_truckflow_movimientos','movimientos_without_truckflow_match'].includes(name))throw Error('Tabla no autorizada para conteos ni conciliación; usar excel_operations_with_truckflow');
 if(!Number.isInteger(limit)||limit<0||limit>10000)throw Error('limit entre 0 y 10000');
 if(Boolean(from)!==Boolean(to))throw Error('Especificar ambas fechas');if(from)days(from,to);
 const dir=path.join(root,'runs/windows',run),file=await safe(root,path.join(dir,'tables',name+'.json'));
 const manifest=JSON.parse(await fs.readFile(await safe(root,path.join(dir,'manifest.json')),'utf8'));
 const value=JSON.parse(await fs.readFile(file,'utf8'));const rows=Array.isArray(value)?value:value.rows??value.records;
 if(!Array.isArray(rows))throw Error('Esquema de tabla desconocido');
 const dateFields=['source_date','operation_day','operational_day','day','date','journey_day'];
 const dateField=dateFields.find(k=>rows.some(r=>r&&r[k]));
 if(from&&!dateField)throw Error('Tabla sin campo de fecha reconocido; no se recorta silenciosamente. Consultar ventana completa');
 const selected=from?rows.filter(r=>String(r[dateField]??'').slice(0,10)>=from&&String(r[dateField]??'').slice(0,10)<=to):rows;
 return {run_id:manifest.runId??run,rulesVersion:manifest.rulesVersion,manifest,file,table:name,headers:value.headers??Object.keys(rows[0]??{}),from:from??manifest.fromDay,to:to??manifest.toDay,dateField:dateField??null,totalRows:selected.length,rows:selected.slice(0,limit),truncated:selected.length>limit,warning:'Lectura explícita de tabla guardada; filas no equivalen automáticamente a movimientos. Denominador depende de la tabla.'};
}


