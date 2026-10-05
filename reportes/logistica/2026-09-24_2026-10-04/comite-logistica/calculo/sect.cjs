// sectores-etl.cjs adaptado: corridas por carpeta (21–27, 28–04 versionada, 28–04 reprocesada).
const fs=require('fs'),path=require('path');
const W='C:/Users/Pc/Desktop/JOSE/Programacion/Vicentin/rutas/dashboard/runs/windows/';
const runs=[W+'2026-09-21_2026-09-27',W+'2026-09-28_2026-10-04',path.resolve('runs-oct/windows/2026-09-28_2026-10-04')];
const days=process.argv.slice(2);
const T=['calada_camera_events','calada_ricardone_liquid_events','calada_sl_camera_events','san_lorenzo_volcable_events','ricardone_silo_events','ricardone_volcable_events'];
const o={days};
for(const t of T){const seen=new Set(),rows=[];for(const r of runs){const j=JSON.parse(fs.readFileSync(path.join(r,'tables',t+'.json')));for(const x of (j.rows||j)){const k=x.journey_id+'|'+x.camara+'|'+x.timestamp;if(seen.has(k))continue;seen.add(k);rows.push(x)}}
 const R=rows.filter(x=>days.includes(x.fecha));const cams={};for(const x of R)((cams[x.camara]??={})[x.fecha]??=new Set()).add(x.journey_id);
 o[t]={semana:new Set(R.map(x=>x.journey_id)).size,porDia:days.map(d=>new Set(R.filter(x=>x.fecha===d).map(x=>x.journey_id)).size),porCamara:Object.fromEntries(Object.entries(cams).map(([c,m])=>[c,days.map(d=>m[d]?m[d].size:0)])),horas:new Set(R.map(x=>x.intervalo_hora)).size}}
console.log(JSON.stringify(o));
