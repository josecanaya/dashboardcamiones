import fs from 'node:fs';
import { productMatchesExecutiveSampleFilter } from '../../../src/features/real-truckflow/etlWorkbench/etlProductFilter.ts';
const root = 'artifacts/codex/actualizacion-octubre';
const runs = ['2026-09-21_2026-09-27','2026-09-28_2026-10-04'];
const read = (base,key) => JSON.parse(fs.readFileSync(`${base}/tables/${key}.json`)).rows;
const current = `${root}/camera-runs/windows/${runs[1]}`;
const dates = Array.from({length:7},(_,index)=>`2026-09-${24+index}`);
const added = ['2026-10-01','2026-10-02','2026-10-03'];
const historical = key => runs.flatMap(run=>read(`runs/windows/${run}`,key).filter(row=>!row.fecha || (row.fecha>=run.slice(0,10) && row.fecha<=run.slice(11))));
const operations = [...new Map(historical('excel_operations_with_truckflow').map(row=>[row.external_operation_id,row])).values()];
const groups = [
  ['Soja','SOJA','calada_camera_events'],
  ['Pellet','PELLET','san_lorenzo_volcable_events'],
  ['Girasol','GIRASOL','ricardone_volcable_events'],
  ['Líquidos','ACEITE','calada_ricardone_liquid_events'],
];
const sum = values=>values.reduce((total,value)=>total+value,0);
const countCamera = (rows,day)=>new Set(rows.filter(row=>row.fecha===day).map(row=>`${row.journey_id}|${row.camara}|${row.timestamp}`)).size;
const output = {method:'Razón de movimientos Excel por registro de actividad ETL, calibrada 24–30/09. Validación dejando un día afuera. Rango de sensibilidad con mínimo y máximo de las razones diarias, no intervalo de confianza.',runId:runs[1],rulesVersion:'etl_transform_v17',groups:[],activity:[],liquidLegs:[]};
for(const [name,product,table] of groups){
  const oldRows=historical(table), newRows=read(current,table);
  const training=dates.map(day=>({day,x:countCamera(oldRows,day),y:operations.filter(row=>String(row.external_ingreso_at).slice(0,10)===day && productMatchesExecutiveSampleFilter(row.resolved_product||row.product_normalized,product)).length}));
  const base=sum(training.map(row=>row.y)), exposure=sum(training.map(row=>row.x));
  const rate=base/exposure;
  const daily=added.map(day=>({day,activity:countCamera(newRows,day),estimate:Math.round(countCamera(newRows,day)*rate)}));
  const extra=sum(daily.map(row=>row.activity));
  let residual=Math.round(extra*rate)-sum(daily.map(row=>row.estimate));
  for(const row of [...daily].sort((left,right)=>right.activity-left.activity)){
    if(!residual) break;
    const adjustment=Math.sign(residual);
    row.estimate+=adjustment;
    residual-=adjustment;
  }
  const ratios=training.filter(row=>row.x>0).map(row=>row.y/row.x);
  const errors=training.map(row=>Math.abs(row.y-row.x*(base-row.y)/(exposure-row.x)));
  const reportBase=new Set(historical('excel_operations_with_truckflow').filter(row=>dates.includes(row.source_date) && productMatchesExecutiveSampleFilter(row.resolved_product||row.product_normalized,product)).map(row=>row.external_operation_id)).size;
  const fit=training.slice(0,4),test=training.slice(4);
  const holdoutRate=sum(fit.map(row=>row.y))/sum(fit.map(row=>row.x));
  const holdoutWapePct=Math.round(sum(test.map(row=>Math.abs(row.y-row.x*holdoutRate)))/sum(test.map(row=>row.y))*100);
  output.groups.push({name,table,base,reportBase,training,daily,estimate:Math.round(extra*rate),cumulative:base+Math.round(extra*rate),deltaPct:Math.round(extra*rate/base*100),low:Math.floor(extra*Math.min(...ratios)),high:Math.ceil(extra*Math.max(...ratios)),looWapePct:Math.round(sum(errors)/base*100),holdoutWapePct});
}
for(const table of ['calada_camera_events','ricardone_volcable_events','san_lorenzo_volcable_events','calada_ricardone_liquid_events']) output.activity.push({table,days:added.map(day=>({day,records:countCamera(read(current,table),day)}))});
const journeys=read(current,'circuit_timing_journeys');
const liquidIds=new Set(journeys.filter(row=>row.executive_circuit_code==='R8' && added.includes(row.start_time.slice(0,10))).map(row=>row.journey_id));
const legs=read(current,'segment_timing_legs').filter(row=>row.executive_circuit_code==='R8' && liquidIds.has(row.journey_id));
for(const key of [...new Set(legs.map(row=>`${row.from_logical} → ${row.to_logical}`))]){const values=legs.filter(row=>`${row.from_logical} → ${row.to_logical}`===key).map(row=>Number(row.duration_min)).filter(value=>Number.isFinite(value)&&value>=0);output.liquidLegs.push({key,n:values.length,mean:Math.round(sum(values)/values.length*10)/10});}
output.timingSummary=read(current,'circuit_timing_summary').map(({min_plate,max_plate,...row})=>row);
output.periodTiming=[...new Set(journeys.map(row=>row.executive_circuit_code))].map(code=>{const values=journeys.filter(row=>row.executive_circuit_code===code && added.includes(row.start_time.slice(0,10))).map(row=>Number(row.total_duration_min)).filter(Number.isFinite).sort((left,right)=>left-right);return {code,n:values.length,mean:sum(values)/values.length};});
fs.writeFileSync(`${root}/analysis.json`,JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
