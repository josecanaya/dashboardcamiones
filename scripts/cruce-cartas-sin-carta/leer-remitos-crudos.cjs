const XLSX=require('xlsx');const fs=require('fs');const out={};
for(const f of fs.readdirSync('data/movimientos/_raw').filter(x=>/MovimientosPorContrato_2026(09(2[6-9]|30)|10)/.test(x))){
 const wb=XLSX.readFile('data/movimientos/_raw/'+f);const r=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1});const hi=r.findIndex(x=>x.includes('Patente'));const h=r[hi];
 for(const row of r.slice(hi+1)){const o={};h.forEach((k,i)=>o[k]=row[i]);if(o.Ingreso)out[String(o.Ingreso)]={rr:o['Remito Renova'],cp:o['CP/Remito'],comp:o.Comprob,tt:o['Tipo Transp.'],ctg:o.CTG};}
}
fs.writeFileSync(process.argv[2],JSON.stringify(out));console.log(Object.keys(out).length);
