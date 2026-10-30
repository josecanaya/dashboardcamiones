import fs from 'fs';
const a = JSON.parse(fs.readFileSync('data/arca/arca_consignment_notes.json','utf8'));
const byCtg=new Map(a.map(x=>[x.ctg,x]));
const byPlate=new Map();
for(const x of a){const t=Date.parse(x.departure_time?.$date||x.issue_time?.$date);for(const p of x.transport?.plates||[]){const k=p.replace(/\s/g,'').toUpperCase();if(!byPlate.has(k))byPlate.set(k,[]);byPlate.get(k).push({t,x});}}
const H=3600e3;
// ingreso local (-03) -> UTC ms
const tIng=s=>Date.parse(s+'-03:00');
function plateMatch(r){
  const ti=tIng(r.external_ingreso_at);
  for(const p of [r.plate_normalized,r.patente_acoplado].filter(Boolean)){
    for(const c of byPlate.get(p.toUpperCase())||[]){ if(ti-c.t<=120*H && c.t-ti<=48*H) return c.x; }
  }
  return null;
}
const NS=['RICARDONE','TERMINAL_EMBARQUE','RENOPACK'];
const FICT=/^(X+|P+|T+)$/;
const rows=[];
for(const d of fs.readdirSync('data/movimientos').filter(x=>/^\d{4}-/.test(x)&&x>='2026-09-26'&&x<='2026-10-27')){
  for(const r of JSON.parse(fs.readFileSync(`data/movimientos/${d}/movimientos.json`))){
    if(r.movement_type!=='INGRESO'||!NS.includes(r.planta_normalized))continue;
    if(FICT.test(r.plate_normalized||''))continue;
    const src=r.source_file.startsWith('SGC')?'sgc':'excel';
    const dia=(r.external_ingreso_at||'').slice(0,10);
    rows.push({...r,src,dia,partDay:d});
  }
}
// dedupe by external_operation_id
const seen=new Map();for(const r of rows){seen.set(r.external_operation_id,r);} 
const all=[...seen.values()].filter(r=>r.dia>='2026-09-28'&&r.dia<='2026-10-25');
const out=[];
for(const r of all){
  const sgcExcl = r.src==='sgc' && (r.baja || /RECHAZ/i.test(r.condicion||''));
  const num=/^\d{10,}$/.test(r.ctg||'');
  let cls;
  if(num && byCtg.has(r.ctg)) cls='carta_ctg';
  else { const m=plateMatch(r); if(m) cls='carta_patente'; else if(num) cls='ctg_fuera_base'; else cls='sin_carta'; }
  out.push({dia:r.dia,src:r.src,planta:r.planta_normalized,prod:r.product_normalized,cod:r.cod_prod,pat:r.plate_normalized,aco:r.patente_acoplado||'',ctg:r.ctg,kg:+r.kgs_neto||0,cls,sgcExcl,id:r.external_operation_id,ing:r.external_ingreso_at,warn:r.normalization_warnings,entregado:r.entregado_por_a||'',cond:r.condicion||'',baja:!!r.baja});
}
fs.writeFileSync(process.argv[2],JSON.stringify(out));
const c={};for(const o of out){const k=o.src+' '+o.cls+(o.sgcExcl?' EXCL':'');c[k]=(c[k]||0)+1;}console.log(c);
// calibration: excel ctg-matched rows, does plate method also find?
let n=0,ok=0;for(const r of all){if(r.src==='excel'&&/^\d{10,}$/.test(r.ctg)&&byCtg.has(r.ctg)){n++;if(plateMatch(r))ok++;}}console.log('calib patente vs ctg',ok,'/',n);
