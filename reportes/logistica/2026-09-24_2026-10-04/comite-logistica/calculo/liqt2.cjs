const path=require('path');const W='C:/Users/Pc/Desktop/JOSE/Programacion/Vicentin/rutas/dashboard/runs/windows/';
const RUNS=[[W+'2026-09-21_2026-09-27','2026-09-24','2026-09-27'],[W+'2026-09-28_2026-10-04','2026-09-27','2026-09-30'],['./runs-oct/windows/2026-09-28_2026-10-04','2026-10-01','2026-10-04']];
const [from,to]=process.argv.slice(2);
const med=a=>{a=[...a].sort((x,y)=>x-y);const n=a.length;return n?(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null};
const js=[],legs=[];
for(const [dir,a,b] of RUNS){const J=require(path.resolve(dir,'tables/circuit_timing_journeys.json')),L=require(path.resolve(dir,'tables/segment_timing_legs.json'));
 const ids=new Set();for(const r of J.rows){const d=String(r.start_time).slice(0,10);if(d<a||d>b||d<from||d>to)continue;js.push(r);ids.add(r.journey_id)}
 for(const l of L.rows)if(ids.has(l.journey_id))legs.push(l)}
const out={};
for(const c of ['R8','SL1','SL2','SL3']){const s=js.filter(r=>r.executive_circuit_code===c);const v=s.map(r=>+r.total_duration_min).filter(Number.isFinite);const ids=new Set(s.map(r=>r.journey_id));const g={};const seen=new Set();
 for(const l of legs){if(l.executive_circuit_code!==c||!ids.has(l.journey_id))continue;const k=l.journey_id+l.from_logical+l.to_logical;if(seen.has(k))continue;seen.add(k);(g[l.from_logical+'→'+l.to_logical]??=[]).push(+l.duration_min)}
 out[c]={n:v.length,media:v.length?+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):null,mediana:v.length?+med(v).toFixed(1):null,tramos:Object.fromEntries(Object.entries(g).map(([k,a])=>[k,{n:a.length,media:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1)}]))}}
console.log(JSON.stringify(out));
