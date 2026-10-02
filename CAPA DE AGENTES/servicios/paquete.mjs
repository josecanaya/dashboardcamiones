import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {days} from './datos.mjs';
const CAPA=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ROOT=path.dirname(CAPA);
const run=promisify(execFile);
export async function getPackage({from,to}={}) {
  const calendar=days(from,to);
  const entries=(await fs.readdir(path.join(ROOT,'runs/windows'),{withFileTypes:true})).filter(e=>e.isDirectory()&&/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(e.name)).map(e=>e.name);
  const spans=[];
  for(const day of calendar){
    const t=new Date(day+'T12:00:00Z'),dow=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()-dow+1);const monday=t.toISOString().slice(0,10);t.setUTCDate(t.getUTCDate()+6);const sunday=t.toISOString().slice(0,10);
    let id=entries.find(e=>e===`${monday}_${sunday}`);
    if(!id){const containing=entries.filter(e=>{const [a,b]=e.split('_');return a<=day&&b>=day&&Date.parse(b)-Date.parse(a)<=6*86400000;});if(containing.length===1)id=containing[0];}
    if(!id)throw new Error(`No hay semana calendario guardada inequívoca para ${day}; no se ejecutó ETL.`);
    const last=spans.at(-1);if(last?.runId===id)last.to=day;else spans.push({runId:id,from:day,to:day});
  }
  const manifests=[];
  for(const s of spans){const file=path.join(ROOT,'runs/windows',s.runId,'manifest.json');const manifest=JSON.parse(await fs.readFile(file,'utf8'));manifests.push({file,runId:s.runId,rulesVersion:manifest.rulesVersion,manifest});}
  if(new Set(manifests.map(m=>m.rulesVersion)).size>1)throw new Error('Las semanas tienen distintas rulesVersion; requiere conciliación antes de combinar.');
  const temp=path.join(CAPA,'temporal');await fs.mkdir(temp,{recursive:true});
  const {build}=await import('esbuild');const bundle=await build({entryPoints:[path.join(CAPA,'servicios/paquete-entry.ts')],bundle:true,platform:'node',format:'esm',packages:'external',write:false,logLevel:'silent'});
  const key=randomUUID().slice(0,8);
  const compiled=path.join(temp,`paquete-builder-${key}.mjs`);await fs.writeFile(compiled,bundle.outputFiles[0].text);
  const dir=path.join(CAPA,'salidas',`${from}_${to}`,`paquete-${Date.now()}-${key}`);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'paquete.json');
  await run(process.execPath,['--max-old-space-size=4096',compiled,ROOT,from,to,file,...spans.map(s=>`${s.runId}:${s.from}:${s.to}`)],{windowsHide:true,timeout:120000,maxBuffer:4e6});
  const pkg=JSON.parse(await fs.readFile(file,'utf8'));
  const provenance={from,to,spans,manifests,method:'Builders actuales del dashboard, sólo lectura de corridas existentes; sin escribir fuera de CAPA DE AGENTES.',freshness:'NO_CERTIFICADA_CONTRA_ORIGEN',modelConflict:'Builders heredados del informe; conciliación con modelo C/D/E pendiente. No cambia las tablas fuente ni declara una canonización nueva.'};
  await fs.writeFile(path.join(dir,'procedencia.json'),JSON.stringify(provenance,null,2));
  return {ok:!pkg.controles?.sinDatos,file,provenance,package:pkg};
}
export async function indicator({from,to,id}={}) {
  const ctx=JSON.parse(await fs.readFile(path.join(CAPA,'conocimiento/contexto.json'),'utf8'));
  const recipe=(ctx.indicators??ctx.indicadores??[]).find(i=>i.id===id);if(!recipe)throw new Error('Indicador desconocido; consultar context');
  const pelletFields={'pellet.viajes':'planilla','pellet.toneladas':'planilla','pellet.tandas':'planilla.bloques','pellet.tramos':'camaras.periodo'};
  if(pelletFields[id]) {
    const {pellet}=await import('./pellet.mjs');const data=await pellet({from,to});const value=pelletFields[id].split('.').reduce((v,k)=>v?.[k],data);
    return {implemented:true,recipe,value,from,to,file:data.output,state:data.state,provenance:data.provenance,note:'Receta histórica parametrizada, con offset y límites declarados; no sustituye validación de planta.'};
  }
  const selection=String(recipe.selector??'');
  if(!/^(tiempos|ejecutivo|actividad)\.[A-Za-z0-9_.]+$/.test(selection))return {implemented:false,recipe,note:'Esta receta requiere cálculo específico o es histórica; no se interpreta como una consulta automática de campo.'};
  const result=await getPackage({from,to}); const value=selection.split('.').reduce((v,k)=>v?.[k],result.package);
  return {implemented:value!==undefined,recipe,value,from,to,file:result.file,fuentes:result.package.fuentes,controles:result.package.controles,note:'Resultado del builder vigente del dashboard; verificar muestra, cobertura y conflictos de modelo declarados en procedencia.'};
}
