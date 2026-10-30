import fs from 'fs';
const o=JSON.parse(fs.readFileSync(process.argv[2]));
const PLATE=/^([A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2})$/;
const wk=d=>{const t=new Date(d+'T12:00Z');const dow=(t.getUTCDay()+6)%7;const m=new Date(t-dow*864e5);return m.toISOString().slice(0,10);};
const res={excl:{}};
const rows=[];
for(const x of o){
  let why=null;
  if(!PLATE.test(x.pat)) why=/^\d+$/.test(x.pat)?'vagón tren':'ajuste contable/patente no válida';
  else if(x.sgcExcl) why='SGC baja/rechazado';
  if(why){res.excl[why+' '+x.prod]=(res.excl[why+' '+x.prod]||0)+1;continue;}
  let cat = (x.cls==='carta_ctg'||x.cls==='carta_patente')?'con carta (en base ARCA)':(x.cls==='ctg_fuera_base'?'con CTG en Excel, fuera de base ARCA':'sin carta');
  rows.push({...x,cat,sem:wk(x.dia)});
}
console.log('excluidos',res.excl);
const tot={};for(const r of rows){const k=r.src+' | '+r.cat;tot[k]=tot[k]||[0,0];tot[k][0]++;tot[k][1]+=r.kg;}
console.log(Object.fromEntries(Object.entries(tot).map(([k,v])=>[k,[v[0],Math.round(v[1]/1000)]])));
// by product: cat split
const P={};for(const r of rows){P[r.prod]=P[r.prod]||{};P[r.prod][r.cat]=(P[r.prod][r.cat]||0)+1;}
console.log('mixtos',Object.entries(P).filter(([p,v])=>Object.keys(v).length>1));
fs.writeFileSync(process.argv[3],JSON.stringify(rows));
