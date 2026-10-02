// Reutiliza los mismos builders del dashboard. No escribe revisiones ni ejecuta ETL.
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildLogisticsReportPackage} from '../../src/features/real-truckflow/logisticsReport/logisticsReportPackage';
import {composeRunsIntoTransformOutput} from '../../src/features/real-truckflow/etlWorkbench/etlComposeRuns';
const [root,from,to,out,...specs]=process.argv.slice(2);
const esc=(v:unknown)=>{const s=v==null?'':String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
const runs=[];
for(const spec of specs){
  const [runId,spanFrom,spanTo]=spec.split(':');
  const dir=path.join(root,'runs/windows',runId);const csv:Record<string,string>={},tables:Record<string,unknown>={};
  for(const f of (await fs.readdir(path.join(dir,'tables'))).filter(n=>n.endsWith('.json'))){
    const j=JSON.parse(await fs.readFile(path.join(dir,'tables',f),'utf8')); const rs=Array.isArray(j)?j:j.rows??j.records??[];
    const headers=j.headers??Object.keys(rs[0]??{});const name=f.slice(0,-5);
    tables[name]={headers,rows:rs};csv[name]=[headers.join(','),...rs.map((r:Record<string,unknown>)=>headers.map((h:string)=>esc(r[h])).join(','))].join('\n');
  }
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));let stats={};
  try{stats=JSON.parse(await fs.readFile(path.join(dir,'stats.json'),'utf8'));}catch{}
  runs.push({runId,spanFrom,spanTo,output:{tables,csv,rulesVersion:manifest.rulesVersion,stats}});
}
const composed=composeRunsIntoTransformOutput(runs as any,from,to);
const pkg=buildLogisticsReportPackage(composed.output,{from,to,runIds:composed.usedRunIds,composedRange:specs.join(' + ')});
await fs.writeFile(out,JSON.stringify(pkg,null,2));
console.log(JSON.stringify({ok:true,out,rulesVersion:pkg.fuentes.rulesVersion,runIds:pkg.fuentes.runIds,controles:pkg.controles}));
