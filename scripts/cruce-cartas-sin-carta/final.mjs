import fs from 'fs';
const rows=JSON.parse(fs.readFileSync(process.argv[2]));
const OUT=process.argv[3]; fs.mkdirSync(OUT,{recursive:true});
const CTG_PROD=new Set(['ACGIRASOL OLEICO','ACEITE GIRASOL PARA REFINAR']);
for(const r of rows){ if(r.src==='sgc'&&r.cat==='sin carta'&&CTG_PROD.has(r.prod)) r.cat='con CTG en Excel, fuera de base ARCA'; }
const SC=rows.filter(r=>r.cat==='sin carta');
const weeks=[...new Set(rows.map(r=>r.sem))].sort();
const days=[...new Set(rows.map(r=>r.dia))].sort();
const t=k=>Math.round(k/1000);
const agg=(arr,f)=>{const m={};for(const r of arr){const k=f(r);m[k]=m[k]||{n:0,kg:0};m[k].n++;m[k].kg+=r.kg;}return m;};
const prods=Object.entries(agg(SC,r=>r.prod)).sort((a,b)=>b[1].kg-a[1].kg).map(e=>e[0]);
let md='';
// totals by week & cat
md+='## Totales por semana (descargas Nodo Sur)\n\n| Semana | Fuente | Descargas | Con carta | Con CTG fuera de base | **Sin carta** | t sin carta | % t sin carta |\n|---|---|--:|--:|--:|--:|--:|--:|\n';
for(const w of weeks){const R=rows.filter(r=>r.sem===w);const c=agg(R,r=>r.cat);const kgT=R.reduce((s,r)=>s+r.kg,0);const s=c['sin carta']||{n:0,kg:0};
 md+=`| ${w} | ${[...new Set(R.map(r=>r.src))].join('+')} | ${R.length} | ${c['con carta (en base ARCA)']?.n||0} | ${c['con CTG en Excel, fuera de base ARCA']?.n||0} | **${s.n}** | ${t(s.kg)} | ${(100*s.kg/kgT).toFixed(1)} % |\n`;}
// product by week
md+='\n## Productos sin carta: camiones y toneladas netas por semana\n\n| Producto | '+weeks.map(w=>w.slice(5)).join(' | ')+' | Total cam. | Total t | Prom. cam/día | Prom. t/día |\n|---|'+weeks.map(()=>'--:').join('|')+'|--:|--:|--:|--:|\n';
const csvW=['producto,semana,camiones,toneladas'];
for(const p of prods){const R=SC.filter(r=>r.prod===p);const a=agg(R,r=>r.sem);const kg=R.reduce((s,r)=>s+r.kg,0);
 md+=`| ${p} | ${weeks.map(w=>a[w]?`${a[w].n} · ${t(a[w].kg)} t`:'—').join(' | ')} | ${R.length} | ${t(kg)} | ${(R.length/days.length).toFixed(1)} | ${(kg/1000/days.length).toFixed(0)} |\n`;
 for(const w of weeks)csvW.push(`${p},${w},${a[w]?.n||0},${t(a[w]?.kg||0)}`);}
const S=agg(SC,r=>r.sem);const kgS=SC.reduce((s,r)=>s+r.kg,0);
md+=`| **Total** | ${weeks.map(w=>`**${S[w]?.n||0} · ${t(S[w]?.kg||0)} t**`).join(' | ')} | **${SC.length}** | **${t(kgS)}** | **${(SC.length/days.length).toFixed(1)}** | **${(kgS/1000/days.length).toFixed(0)}** |\n`;
// planta
md+='\n## Sin carta por planta\n\n| Planta | Camiones | t |\n|---|--:|--:|\n';for(const [k,v] of Object.entries(agg(SC,r=>r.planta)))md+=`| ${k} | ${v.n} | ${t(v.kg)} |\n`;
// daily
md+='\n## Diario: sin carta (camiones · t)\n\n| Día | Fuente | Descargas | Sin carta | t sin carta | Top producto |\n|---|---|--:|--:|--:|---|\n';
const csvD=['dia,fuente,producto,camiones,toneladas'];
for(const d of days){const R=rows.filter(r=>r.dia===d);const s=SC.filter(r=>r.dia===d);const a=Object.entries(agg(s,r=>r.prod)).sort((x,y)=>y[1].n-x[1].n);
 md+=`| ${d} | ${R[0].src} | ${R.length} | ${s.length} | ${t(s.reduce((q,r)=>q+r.kg,0))} | ${a.slice(0,3).map(([p,v])=>p+' '+v.n).join(', ')} |\n`;
 for(const [p,v] of a)csvD.push(`${d},${R[0].src},${p},${v.n},${t(v.kg)}`);}
fs.writeFileSync(OUT+'/tablas.md',md);fs.writeFileSync(OUT+'/sin_carta_semanal.csv',csvW.join('\n'));fs.writeFileSync(OUT+'/sin_carta_diario.csv',csvD.join('\n'));
fs.writeFileSync(OUT+'/detalle_sin_carta.csv',['dia,fuente,planta,producto,patente,acoplado,ingreso,kg_neto,ingreso_id'].concat(SC.map(r=>[r.dia,r.src,r.planta,r.prod,r.pat,r.aco,r.ing,r.kg,r.id].join(','))).join('\n'));
console.log(md);
