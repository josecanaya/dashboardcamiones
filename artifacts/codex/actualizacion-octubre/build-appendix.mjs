import fs from 'node:fs/promises';
import path from 'node:path';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const directory=path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const data=JSON.parse(await fs.readFile(path.join(directory,'analysis.json'),'utf8'));
const output=path.join(directory,'build');
await fs.mkdir(output,{recursive:true});
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
const colors={green:'#0B5638',text:'#14281E',muted:'#4A5D52',light:'#F1F6F2',white:'#FCFDFB',amber:'#91520C'};
const font='IBM Plex Sans';
const fmt=value=>value.toLocaleString('es-AR');
const source='Runs: 2026-09-21_2026-09-27 y 2026-09-28_2026-10-04. rulesVersion: etl_transform_v17. Octubre: ejecución aislada camera-runs, sin Excel. Fuentes: excel_operations_with_truckflow; calada_camera_events; san_lorenzo_volcable_events; ricardone_volcable_events; calada_ricardone_liquid_events; circuit_timing_summary, circuit_timing_journeys y segment_timing_legs. Cálculos reproducibles: analyze.mjs y analysis.json.';
function text(slide,value,left,top,width,height,size=24,color=colors.text,bold=false){
  const shape=slide.shapes.add({geometry:'textbox',position:{left,top,width,height},fill:'none',line:{fill:'none',width:0}});
  shape.text=value;
  shape.text.style={typeface:font,fontSize:size,bold,color,autoFit:'none'};
  return shape;
}
function page(title,subtitle){
  const slide=presentation.slides.add();
  slide.background.fill=colors.white;
  text(slide,title,70,48,1140,88,36,colors.green,true);
  text(slide,subtitle,70,140,1140,58,21,colors.muted);
  text(slide,`Comité de Logística · Actualización 1–3/10/2026 · Provisional · Anexo ${presentation.slides.items.length}`,70,666,1135,28,16,colors.muted);
  slide.speakerNotes.textFrame.setText(source);
  return slide;
}
function table(slide,values,widths,top=218,rowHeight=56,fontSize=22){
  const native=slide.tables.add({rows:values.length,columns:values[0].length,left:70,top,width:1140,height:rowHeight*values.length,columnWidths:widths,values});
  native.borders.assign({fill:'#D3E2D7',width:1,style:'solid'});
  for(let row=0;row<values.length;row++){
    native.rows[row].height=rowHeight;
    for(let column=0;column<values[row].length;column++){
      const cell=native.getCell(row,column);
      cell.fill=row===0?colors.green:row%2?colors.light:colors.white;
      cell.text.style={typeface:font,fontSize:fontSize,bold:row===0||column===0,color:row===0?'#FFFFFF':colors.text,autoFit:'none'};
    }
  }
  return native;
}

const totalBase=data.groups.reduce((total,row)=>total+row.base,0);
const totalExtra=data.groups.reduce((total,row)=>total+row.estimate,0);
let slide=page('Cuánto cambiarían los movimientos','Escenario sin Excel de octubre. Misma base temporal: fecha de ingreso; todos los circuitos del producto.');
table(slide,[['Producto','24–30/9 real¹','1–3/10 estimado','24/9–3/10²','Aumento'],...data.groups.map(row=>[row.name,fmt(row.base),`≈ ${fmt(row.estimate)}`,`≈ ${fmt(row.cumulative)}`,`+${row.deltaPct}%`]),['Total',fmt(totalBase),`≈ ${fmt(totalExtra)}`,`≈ ${fmt(totalBase+totalExtra)}`,`+${Math.round(totalExtra/totalBase*100)}%`]],[190,230,240,260,220],205,51,21);
text(slide,'¹ Movimientos registrados en Excel, no descargas verificadas. ² Acumulado condicional, no cierre confirmado.',70,527,1130,52,20,colors.muted);
text(slide,'No sumar estos valores a los 770 / 307 / 208 / 383 de la portada: corresponden a otras poblaciones.',70,594,1140,54,21,colors.amber,true);

slide=page('Qué registraron las cámaras','Conteos observados por punto. Un registro no equivale a un movimiento Excel ni identifica por sí solo el producto.');
const labels={'calada_camera_events':'Calada sólida Ricardone','san_lorenzo_volcable_events':'Volcables San Lorenzo','ricardone_volcable_events':'Volcables Ricardone','calada_ricardone_liquid_events':'Calada calle de líquidos'};
table(slide,[['Punto observado','Jue 1/10','Vie 2/10','Sáb 3/10','3 días'],...data.activity.map(row=>[labels[row.table],...row.days.map(day=>String(day.records)),String(row.days.reduce((total,day)=>total+day.records,0))])],[460,170,170,170,170],216,62,23);
text(slide,'No se suman puntos entre sí: un mismo recorrido puede aparecer en varias cámaras.',70,548,1140,40,22,colors.green,true);
text(slide,'Cobertura limitada a los archivos disponibles. La caída del sábado puede reflejar actividad o menor captura; no prueba una caída de descargas.',70,601,1140,48,20,colors.muted);

slide=page('Estimación diaria por producto','Relación histórica entre movimientos Excel y actividad del punto de cámara. No se reconstruyen contratos ni toneladas.');
table(slide,[['Producto','1/10 estimado','2/10 estimado','3/10 estimado','Total estimado'],...data.groups.map(row=>[row.name,...row.daily.map(day=>`≈ ${day.estimate}`),`≈ ${row.estimate}`])],[220,230,230,230,230],215,61,23);
text(slide,'Soja: calada sólida · Pellet: volcables del puerto · Girasol: volcables de Ricardone · Líquidos: calada de líquidos.',70,537,1140,60,20,colors.muted);
text(slide,'Son indicadores indirectos y compartidos. Suponer la misma mezcla de productos que en septiembre es la principal limitación.',70,606,1140,49,21,colors.amber,true);

slide=page('Cuánto confiar en la reconstrucción','Prueba temporal: calibración 24–27/9 y evaluación 28–30/9. WAPE = error absoluto total / movimientos reales.');
table(slide,[['Producto','Escenario 1–3/10','Sensibilidad¹','Error temporal'],...data.groups.map(row=>[row.name,`≈ ${row.estimate}`,`${row.low}–${row.high}`,`${row.holdoutWapePct}%`])],[260,300,300,280],216,58,24);
text(slide,'Soja es el escenario más consistente, pero sigue siendo provisional. Pellet, Girasol y Líquidos no tienen precisión suficiente para cerrar volúmenes.',70,526,1140,66,23,colors.amber,true);
text(slide,'¹ Mínimo y máximo de las razones diarias históricas aplicados a octubre; no es un intervalo de confianza. Modelo final calibrado con 7 días; muestra muy pequeña.',70,606,1140,48,19,colors.muted);

slide=page('Líquidos: nuevos tiempos por tramo','R8 de cámara con inicio entre el 1 y el 3/10. Son recorridos, no movimientos de producto confirmados por Excel.');
table(slide,[['Tramo observado','Promedio','Muestra'],...data.liquidLegs.map(row=>[row.key.replace('PREINGRESO','Preingreso').replace('LIQUIDO','Punto líquido').replace('BALANZA_EGRESO','Balanza egreso'),`${row.mean.toLocaleString('es-AR')} min`,`${row.n} recorridos`]),['Resto de los tramos','Sin evidencia suficiente','—']],[640,250,250],222,68,23);
text(slide,'No sumar 7,0 + 40,6 como tiempo total: las muestras son distintas y faltan tramos del circuito.',70,523,1140,58,24,colors.amber,true);
text(slide,'Se conserva el histórico de 328 min de la presentación, sin recalcularlo con esta muestra parcial. No hay una nueva medición comparable de puerta a puerta.',70,600,1140,54,21,colors.muted);

slide=page('Qué cambia para el comité','La ampliación agrega evidencia de octubre y escenarios; no reemplaza el cierre histórico del 24–30/9.');
text(slide,'Mantener los resultados históricos',70,222,1140,43,27,colors.green,true);
text(slide,'Los 770 Soja, 307 Pellet, 208 Girasol y 383 Líquidos del resumen original conservan su alcance. Las cifras del anexo no se suman directamente a esas tarjetas.',70,272,1140,66,23);
text(slide,'Usar la estimación para dimensionar, no para certificar',70,361,1140,42,27,colors.green,true);
text(slide,'El escenario suma aproximadamente 503 movimientos al universo de ingreso comparable. No confirma descargas, toneladas ni mejoras de tiempos.',70,410,1140,65,23);
text(slide,'Reemplazar el escenario cuando llegue el Excel',70,498,1140,42,27,colors.green,true);
text(slide,'Conciliar movimientos, producto y plataforma. Recalcular el acumulado y los tiempos con la misma población; publicar el desvío entre estimado y real.',70,548,1140,65,23);

await (await PresentationFile.exportPptx(presentation)).save(path.join(output,'appendix.pptx'));
for(let index=0;index<presentation.slides.items.length;index++){
  const preview=await presentation.export({slide:presentation.slides.items[index],format:'png',scale:1});
  await fs.writeFile(path.join(output,`appendix-${index+1}.png`),new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({appendix:path.join(output,'appendix.pptx'),slides:presentation.slides.items.length}));
