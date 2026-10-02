import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { query, days } from './datos.mjs';

const CAPA=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ROOT=path.dirname(CAPA);
const KNOWN='reportes/logistica/2026-09-24_2026-09-30/comite-logistica';
const PYTHON=process.env.CAPA_PYTHON || path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const known=({from,to})=>from==='2026-09-24'&&to==='2026-09-30';
const read=async rel=>JSON.parse(await fs.readFile(path.join(ROOT,rel),'utf8'));
const fmt=v=>typeof v==='number'?Math.round(v*100)/100:v??'sin muestra';
function svgChart(chart){
 const rows=chart.rows.filter(r=>Number.isFinite(r[1]));if(!rows.length)return '';
 const max=Math.max(1,...rows.map(r=>r[1]));const bars=rows.map((r,i)=>{const w=760/rows.length;const h=r[1]/max*160;return `<rect x="${35+i*w}" y="${185-h}" width="${Math.max(1,w-2)}" height="${h}" fill="#0B5638"><title>${esc(r[0])}: ${r[1]}</title></rect>`;}).join('');
 return `<h3>${esc(chart.title)}</h3><svg viewBox="0 0 830 220" role="img" aria-label="${esc(chart.title)}"><text x="5" y="20">${fmt(max)}</text>${bars}<text x="35" y="210">${esc(rows[0][0])}</text><text x="620" y="210">${esc(rows.at(-1)[0])}</text></svg><details><summary>Valores del gráfico</summary>${tableHTML({headers:['Fecha/hora','Valor'],rows})}</details>`;
}
function tableHTML(t){return `<h3>${esc(t.title||'')}</h3><table><thead><tr>${t.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(v=>`<td>${esc(fmt(v))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}

export async function report({from,to,type='ambos',product,includeLegacy=false}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||from>to) throw new Error('Período ISO válido requerido');
  if(!['ambos','logistica','seguridad'].includes(type)) throw new Error('type debe ser ambos, logistica o seguridad');
  days(from,to);
  const products=product?[product.toLowerCase()]:['soja','girasol','pellet','liquidos'];
  if(products.some(p=>!['soja','girasol','pellet','liquidos'].includes(p))) throw new Error('Producto no reconocido');
  const result={schemaVersion:1,from,to,type,generatedAt:new Date().toISOString(),status:'v1_parcial_para_revision',formatStatus:'Formato inicial; no réplica completa del diseño de Claude',sections:[],warnings:[],references:[{file:'scripts/estado-planta/gen_comite_logistica.py',role:'formato y método heredado'},{file:'scripts/estado-planta/gen_comite_seguridad.py',role:'formato y reglas heredadas'}]};
  if(type!=='seguridad'){
   try{
    const {getPackage}=await import('./paquete.mjs');const calculated=await getPackage({from,to});const pkg=calculated.package;
    if(!calculated.ok)result.warnings.push('El paquete del dashboard no dispone de cobertura suficiente; revisar sus controles antes de publicar.');
    result.pipeline={file:calculated.file,provenance:calculated.provenance,fuentes:pkg.fuentes,controles:pkg.controles};
    for(const p of products){const t=pkg.tiempos?.[p];if(!t?.periodo)continue;
     const s={id:`${p}-dashboard`,title:`${p.toUpperCase()} · indicadores del dashboard recalculados`,status:calculated.ok?'RECALCULADO · COBERTURA A REVISAR':'DATOS INSUFICIENTES',source:calculated.file,metrics:[],notes:['Muestra del pipeline y sus filtros: puede diferir del total de movimientos originales. No sumar ambos universos.','Builders actuales del dashboard; conciliación con modelo C/D/E y frescura contra origen pendientes.',...(t.reasons||[])],timing:t,provenance:calculated.provenance,tables:[{title:'Tiempos por tramo',headers:['Tramo','Planta','Media min','Muestra'],rows:(t.periodo.tramos||[]).map(x=>[x.key,x.planta,fmt(x.mediaMin),x.n])},{title:'Operaciones diarias de la muestra',headers:['Día','Operaciones'],rows:Object.entries(t.porDia||{}).map(([day,v])=>[day,v.camiones])}],charts:[{title:'Operaciones diarias de la muestra del pipeline',rows:Object.entries(t.porDia||{}).map(([day,v])=>[day,v.camiones])}]};
     for(const [key,label,unit] of [['camiones','Operaciones de la muestra','operaciones'],['tiempoMedioMin','Tiempo medio de la muestra','min'],['tiempoMedioN','Muestra del tiempo medio','observaciones']])if(t.periodo[key]!=null&&(key!=='tiempoMedioMin'||t.doorToDoorPublishable))s.metrics.push({label,value:fmt(t.periodo[key]),unit,field:`tiempos.${p}.periodo.${key}`});
     result.sections.push(s);
    }
    for(const [id,a] of Object.entries(pkg.actividad||{}))result.sections.push({id:`equipo-actual-${id}`,title:`ACTIVIDAD EQUIPOS · ${a.label}`,status:'RECALCULADO · SIN ATRIBUCIÓN DE PRODUCTO',source:calculated.file,notes:['Cada equipo tiene su propia unidad de observación. No sumar como movimientos de producto.','Frescura y cobertura instrumental pendientes de certificación.'],metrics:[{label:'Conteo del paquete por equipo',value:a.periodo?.camiones??'no disponible',unit:'unidad camiones del pipeline'}],tables:[{title:'Distribución por cámara/calle',headers:['Cámara','Conteo'],rows:(a.periodo?.porCalle||[]).map(x=>[x.camara,x.camiones])}],charts:[{title:'Actividad horaria recalculada',rows:(a.periodo?.porHora||[]).map(x=>[x.label||x.bucket,x.camiones])}]});
   }catch(e){result.warnings.push(`Indicadores dashboard no disponibles: ${e.message}`);}
  }
  if(type!=='seguridad') for(const p of products){
    const d=await query({from,to,product:p,limit:30});
    const section={id:p,title:p.toUpperCase(),status:d.state,source:'datos originales · servicios/datos.mjs',metrics:[{label:'Movimientos identificados según Excel',value:d.denominators.movimientos,unit:'movimientos'},{label:'Vehículos únicos según Excel',value:d.denominators.patentesUnicas,unit:'patentes'}],notes:['El estado y los conteos se limitan a los archivos disponibles; cero no acredita exhaustividad del sistema de origen.'],data:d};
    result.sections.push(section);
    if(known({from,to})&&includeLegacy){
      try{
        const pkg=await read(`${KNOWN}/paquete_excel.json`); const t=pkg.tiempos?.[p];
        const inherited={id:`${p}-antecedente`,title:`${p.toUpperCase()} · antecedente del comité`,status:'HEREDADO · NO REVALIDADO',source:`${KNOWN}/paquete_excel.json`,metrics:[],notes:['Este paquete conserva la metodología original, incluida mezcla de fuentes. Sus indicadores no sustituyen el cálculo actual.'],provenance:pkg.fuentes};
        if(t?.periodo){for(const [key,label,unit] of [['camiones','Operaciones de la muestra de tiempos','operaciones'],['tiempoMedioMin','Tiempo medio de la muestra','min'],['tiempoMedioN','Muestra del tiempo medio','observaciones']]) if(t.periodo[key]!=null&&(key!=='tiempoMedioMin'||t.doorToDoorPublishable)) inherited.metrics.push({label,value:fmt(t.periodo[key]),unit,field:`tiempos.${p}.periodo.${key}`}); inherited.timing=t;
         inherited.notes.push(...(t.reasons||[]));
         inherited.tables=[{title:'Tiempos por tramo · heredados',headers:['Tramo','Planta','Media min','Muestra'],rows:(t.periodo.tramos||[]).map(x=>[x.key,x.planta,fmt(x.mediaMin),x.n])},{title:'Operaciones diarias de la muestra heredada',headers:['Día','Operaciones'],rows:Object.entries(t.porDia||{}).map(([day,v])=>[day,v.camiones])}];
         inherited.charts=[{title:'Operaciones diarias · muestra de tiempos heredada',rows:Object.entries(t.porDia||{}).map(([day,v])=>[day,v.camiones])}];
        }
        if(p==='pellet'){const v=await read(`${KNOWN}/pellet-operativo.json`); inherited.metrics.push({label:'Viajes de planilla del operativo',value:v.planilla.viajes,unit:'viajes'},{label:'Toneladas reportadas como reales',value:v.planilla.toneladasReales,unit:'t'}); inherited.pellet=v; inherited.notes.push('Toneladas reproducidas del JSON del operativo; revisar contra pesaje antes de publicación.');}
        if(p==='liquidos'){const v=await read(`${KNOWN}/excel_extra.json`); inherited.metrics.push({label:'Conteo líquido reportado como camiones',value:v.liquidos.camiones,unit:'unidad heredada pendiente de validación'}); inherited.extra=v.liquidos; inherited.source+=` + ${KNOWN}/excel_extra.json`;}
        result.sections.push(inherited);
      }catch(e){result.warnings.push(`Antecedente ${p}: ${e.message}`);}
    }
  }
  if(type!=='seguridad'&&known({from,to})&&includeLegacy){
   try{const pkg=await read(`${KNOWN}/paquete_excel.json`);for(const [id,a] of Object.entries(pkg.actividad||{})){
     result.sections.push({id:`equipo-${id}`,title:`ACTIVIDAD EQUIPOS · ${a.label}`,status:'HEREDADO · SIN ATRIBUCIÓN DE PRODUCTO',source:`${KNOWN}/paquete_excel.json · actividad.${id}`,notes:['Conteos del paquete anterior por equipo/cámara; un vehículo puede aparecer en varios equipos. No sumar como movimientos de producto.'],metrics:[{label:'Conteo del paquete por equipo',value:a.periodo?.camiones??'no disponible',unit:'unidad camiones del paquete'}],tables:[{title:'Distribución por cámara/calle',headers:['Cámara','Conteo heredado'],rows:(a.periodo?.porCalle||[]).map(x=>[x.camara,x.camiones])}],charts:[{title:'Actividad horaria heredada',rows:(a.periodo?.porHora||[]).map(x=>[x.label||x.bucket,x.camiones])}]});
   }}catch(e){result.warnings.push(`Actividad equipos: ${e.message}`);}
  }
  if(type!=='logistica'){
    try{const {security}=await import('./seguridad.mjs');const s=await security({from,to,product,limit:30});result.sections.push({id:'seguridad',title:'SEGURIDAD · revisión de evidencia',status:s.state||s.status||'Candidatos para revisión',metrics:[{label:'Candidatos de control',value:s.totalCandidates,unit:'candidatos; pueden compartir operación'},{label:'Operaciones revisadas',value:s.denominators?.operations,unit:'movimientos'},{label:'Eventos de cámara revisados',value:s.denominators?.events,unit:'eventos'}],notes:['Los candidatos deterministas requieren evaluación; no acreditan una infracción.',...(s.limitations||[])],tables:[{title:'Tipos de candidato',headers:['Control','Candidatos'],rows:Object.entries(s.candidatesByKind||{})},{title:'Muestra de candidatos',headers:['ID','Patente','Control','Estado'],rows:(s.candidates||[]).map(c=>[c.caseId||c.id,c.plate,c.kind||c.type,c.status||'pendiente'])}],source:'servicios/seguridad.mjs',data:s});}
    catch(e){result.warnings.push(`Seguridad actual no disponible: ${e.message}`); result.sections.push({id:'seguridad',title:'SEGURIDAD',status:'DATOS INSUFICIENTES',metrics:[],notes:['No se pudo ejecutar la revisión actual.'],source:'servicios/seguridad.mjs'});}
    if(known({from,to})&&includeLegacy){
      const rel='artifacts/claude_import/Comité de Seguridad · Semana 24–30 sep.pptx';
      try{const slides=JSON.parse(execFileSync(PYTHON,[path.join(CAPA,'plantillas/presentacion.py'),'extract',path.join(ROOT,rel)],{encoding:'utf8',maxBuffer:8e6})); result.sections.push({id:'seguridad-antecedente',title:'SEGURIDAD · comité original',status:'TEXTO HEREDADO · NO REVALIDADO',metrics:[],notes:['Texto recuperado del PowerPoint original. Las capturas DSS y afirmaciones no se revalidaron.'],source:rel,referenceSlides:slides});}catch(e){result.warnings.push(`Extracción comité seguridad: ${e.message}`);}
    }
  }
  if(type!=='seguridad' && products.includes('pellet')) {
    try {
      const {pellet}=await import('./pellet.mjs');const p=await pellet({from,to,runs:result.pipeline?.fuentes?.runIds});
      const plan=p.data?.planilla ?? p.planilla ?? p.result?.planilla;const cams=p.data?.camaras ?? p.camaras ?? p.result?.camaras;
      if(plan)result.sections.push({id:'pellet-operativo',title:'PELLET · operativo de transile',status:p.state??'RECETA REEJECUTADA · MÉTODO HEREDADO',source:p.file??p.output??'scripts/estado-planta/pellet-operativo.cjs',
        metrics:[{label:'Viajes R30/31/32 según planilla',value:plan.viajes,unit:'viajes'},{label:'Patentes del operativo',value:plan.patentes,unit:'vehículos'},{label:'Toneladas estimadas',value:plan.toneladas30,unit:'t · viajes × 30'},{label:'Toneladas netas según registros',value:plan.toneladasReales??'pendiente',unit:'t'},{label:'Horas de las tandas',value:plan.horasOperativo,unit:'h'}],
        notes:['Receta existente parametrizada por período. Su universo R30/31/32 difiere del pellet total del Excel.','Tiempos de cámaras usan el offset heredado de 206 minutos y límites por tramo; vigencia pendiente de validación.','Sin actividad en el período no demuestra fin de un operativo que lo atraviesa.'],
        tables:[{title:'Viajes diarios',headers:['Día','Viajes'],rows:Object.entries(plan.viajesDia??{})},{title:'Tiempos observados de la receta',headers:['Tramo','Media min','Muestra'],rows:Object.entries(cams?.periodo??{}).map(([k,v])=>[k,v.mean??'sin muestra',v.n])}],charts:[{title:'Viajes diarios del operativo de pellet',rows:Object.entries(plan.viajesDia??{})}],data:p});
    } catch(e){result.warnings.push(`Receta de pellet no disponible: ${e.message}`);}
  }
  const order=s=>{const i=products.findIndex(p=>s.id===p||s.id.startsWith(`${p}-`));return i<0?100+(s.id.startsWith('seguridad')?10:0):i*10+(s.id===products[i]?0:s.id.endsWith('-dashboard')?1:2);};
  result.sections.sort((a,b)=>order(a)-order(b));
  const dir=path.join(CAPA,'salidas',`${from}_${to}`,`${type}-${Date.now()}`); await fs.mkdir(dir,{recursive:true});
  const json=path.join(dir,'informe.json');await fs.writeFile(json,JSON.stringify(result,null,2));
  const pptx=path.join(dir,'informe.pptx');let presentation=null;
  try{execFileSync(PYTHON,[path.join(CAPA,'plantillas/presentacion.py'),'build',json,pptx],{encoding:'utf8',maxBuffer:2e6});presentation=pptx;}catch(e){result.warnings.push(`PPTX no generado: ${e.message}`);await fs.writeFile(json,JSON.stringify(result,null,2));}
  const html=path.join(dir,'informe.html');
  const body=result.sections.map(s=>`<section><h2>${esc(s.title)}</h2><p class="badge">${esc(s.status)}</p><table>${s.metrics.map(m=>`<tr><th>${esc(m.label)}</th><td>${esc(m.value)} ${esc(m.unit)}</td></tr>`).join('')}</table>${(s.tables||[]).map(tableHTML).join('')}${(s.charts||[]).map(svgChart).join('')}${s.notes.map(n=>`<p>${esc(n)}</p>`).join('')}<p class="source">Fuente: ${esc(s.source)}</p>${(s.referenceSlides||[]).map(x=>`<details><summary>Lámina ${x.slide} · texto original</summary><pre>${esc(x.text)}</pre></details>`).join('')}${s.data?`<details><summary>Evidencia y cobertura</summary><pre>${esc(JSON.stringify(s.data,null,2))}</pre></details>`:''}</section>`).join('');
  await fs.writeFile(html,`<!doctype html><html lang="es"><meta charset="utf-8"><title>Comité Nodo Sur</title><style>body{margin:0;background:#FBFBF8;color:#1B2420;font:17px Arial}header{padding:45px;background:#0B5638;color:white}main{max-width:1080px;margin:auto;padding:30px}section{padding:25px;margin:20px 0;border:1px solid #ccd6cf;border-radius:8px}h2{color:#0B5638}.badge{color:#2E1B4E;font-weight:bold}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}.source{font-size:13px;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}details{margin:16px 0}@media print{details{display:none}section{break-inside:avoid}}</style><header><h1>Comité · Nodo Sur</h1><p>${esc(from)} al ${esc(to)} · ${esc(type)} · para revisión</p></header><main><p>V1 parcial para revisión. Formato inicial inspirado en los comités de Claude. Cada antecedente está separado de los datos consultados actualmente.</p>${body}<section><h2>Controles de generación</h2>${result.warnings.map(w=>`<p>${esc(w)}</p>`).join('')||'<p>Generación completa.</p>'}<p>JSON completo: <a href="informe.json">evidencia estructurada</a></p></section></main></html>`);
  return {ok:true,status:result.status,formatStatus:result.formatStatus,from,to,type,html,json,pptx:presentation,warnings:result.warnings};
}
