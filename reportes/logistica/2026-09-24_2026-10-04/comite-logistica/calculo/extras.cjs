// Extras del comité desde excel_operations_with_truckflow (tabla canónica de movimientos).
const t=require(process.argv[2]); const days=process.argv.slice(3);
const ts=s=>/^\d{4}-\d{2}-\d{2}T\d{2}/.test(String(s||''))?String(s):'';
const shift=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const pkgDay=r=>{const i=ts(r.truckflow_first_seen_at)||ts(r.external_ingreso_at);if(!i)return null;const h=+i.slice(11,13);return h>=22?shift(i.slice(0,10),1):i.slice(0,10)};
const excDay=r=>{const i=ts(r.external_ingreso_at);if(!i)return null;const h=+i.slice(11,13);return h>=22?shift(i.slice(0,10),1):i.slice(0,10)};
const p2p=r=>{const a=ts(r.external_ingreso_at)||ts(r.truckflow_first_seen_at),b=ts(r.external_salida_at);if(!a||!b)return null;const x=(Date.parse(b)-Date.parse(a))/6e4;return x>=0?x:null};
const pick=(f,dayOf)=>{const m=new Map();for(const r of t.rows){if(!f(r))continue;const d=dayOf(r);if(!days.includes(d))continue;if(!m.has(r.external_operation_id))m.set(r.external_operation_id,{...r,_d:d})}return[...m.values()]};
const per=a=>days.map(d=>a.filter(r=>r._d===d).length);
const med=a=>{a=[...a].sort((x,y)=>x-y);const n=a.length;return n? (n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2):null};
const stats=a=>{const v=a.map(p2p).filter(x=>x!=null);return{n:v.length,media:Math.round(v.reduce((s,x)=>s+x,0)/v.length),mediana:Math.round(med(v))}};
const out={days};
const r7=pick(r=>r.resolved_executive_circuit_code==='R7',pkgDay); out.r7={ops:r7.length,dia:per(r7),...stats(r7)};
const g=pick(r=>['R5','R6'].includes(r.resolved_executive_circuit_code),pkgDay); out.girasol={ops:g.length,dia:per(g),R5:g.filter(r=>r.resolved_executive_circuit_code==='R5').length,R6:g.filter(r=>r.resolved_executive_circuit_code==='R6').length,...stats(g)};
const r4=pick(r=>r.resolved_executive_circuit_code==='R4',pkgDay); out.r4=r4.length;
const PROD=/ACEITE|BORRA|GLICERINA|LECITINA|GOMA|ACIDO.? GRASO|METANOL|METILATO/, EXC=/ENVASADO|AGUA/, PL=new Set(['RICARDONE','TERMINAL_EMBARQUE']); // Renopack queda fuera: no tiene cámaras instaladas
// líquidos = movimientos con circuito líquido resuelto (R8, SL1, SL2, SL3), así cada circuito suma igual en todas las láminas
const LQC=new Set(['R8','SL1','SL2','SL3']);
const lq=pick(r=>LQC.has(r.resolved_executive_circuit_code)&&!/AGUA/.test(r.product_normalized||'')&&PL.has(r.planta_normalized)&&['INGRESO','EGRESO'].includes(r.movement_type),excDay);
out.liquidos={camiones:lq.length,ingresos:lq.filter(r=>r.movement_type==='INGRESO').length,egresos:lq.filter(r=>r.movement_type==='EGRESO').length,dia:per(lq),...stats(lq)};
const src=r=>r.source_date;
const pt=pick(r=>/^R3[012]$/.test(r.resolved_executive_circuit_code),src); out.pelletTransile={viajes:pt.length,dia:per(pt),camiones:new Set(pt.map(r=>r.plate_normalized)).size,kgs:pt.reduce((s,r)=>s+(+r.kgs_neto||0),0)};
const pe=pick(r=>/PELLETS GIRASOL/.test(r.product_normalized)&&r.planta_normalized==='RICARDONE'&&r.movement_type==='EGRESO',pkgDay); out.pelletEgresos={n:pe.length,dia:per(pe)};
const r29=pick(r=>r.resolved_executive_circuit_code==='R29',src); out.r29={ops:r29.length,dia:per(r29)};

// líquidos por circuito resuelto (mismo denominador)
const byC={};for(const r of lq){const c=r.resolved_executive_circuit_code||'sin circuito';byC[c]=(byC[c]||0)+1}
out.liquidos.porCircuito=byC;
// por circuito: E = egreso = carga, I = ingreso = descarga
const byCM={};for(const r of lq){const c=r.resolved_executive_circuit_code;(byCM[c]??={carga:0,descarga:0})[r.movement_type==='EGRESO'?'carga':'descarga']++}out.liquidos.porCircuitoMov=byCM;
const prod={};for(const r of lq){prod[r.product_normalized]=(prod[r.product_normalized]||0)+1};out.liquidos.porProducto=prod;
// pellet: viajes por camión y día (pares camión-día)
const pairs=new Set(pt.map(r=>r.plate_normalized+'|'+r.source_date));out.pelletTransile.paresCamionDia=pairs.size;
require('fs').writeFileSync(process.env.OUT||'/dev/null',JSON.stringify(out,null,1));
const sc={};for(const r of lq)if(!r.resolved_executive_circuit_code)sc[r.planta_normalized]=(sc[r.planta_normalized]||0)+1;out.liquidos.sinCircuito=sc;
require('fs').writeFileSync(process.env.OUT||'/dev/null',JSON.stringify(out,null,1));
