"""Create a source-preserving review template and inspectable slide bindings.

This is NOT the live report generator. All reference numbers remain reported
values; text and chart candidates require the audited adapters described in map.
"""
import argparse
import hashlib
import json
import posixpath
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from defusedxml import minidom
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'executive': {'file':'src/features/real-truckflow/tabs/ExecutiveSummaryTab.tsx', 'symbols':['executiveProductFilterPlan','productCoverage','displayClassIndex'], 'status':'UI identificado; conciliación canónica pendiente'},
    'calibration': {'file':'src/features/real-truckflow/etlWorkbench/cameraCalibrationDashboardModel.ts', 'symbols':['buildCalibrationDashboardModel','buildRecognitionDepth'], 'status':'Fórmula identificada; falta validar período'},
    'timing': {'file':'src/features/real-truckflow/tabs/SegmentTimingChartPanel.tsx', 'symbols':['displayStats.mean'], 'detail_file':'src/features/real-truckflow/etlWorkbench/etlSegmentScatterByDay.ts', 'status':'Media y día operativo identificados; falta auditar muestra y filtros'},
    'calada': {'file':'src/features/real-truckflow/tabs/CaladaCamerasPanel.tsx', 'symbols':['baseRows','perCamera','concurrency','trucksPerHour','totals'], 'status':'Agregaciones identificadas; falta extraer adaptador compartido'},
    'discharge': {'file':'src/features/real-truckflow/tabs/DescargasTab.tsx', 'symbols':['CaladaCamerasPanel','splitExcelVsCamera'], 'status':'Tablas por sede identificadas; reutilizar modelo de actividad'},
    'history': {'file':'Reporte de Logistica 18_9.pptx', 'symbols':[], 'status':'Histórico reportado preservado en imágenes; transcripción de series pendiente'},
    'derived': {'file':'docs/CUESTIONARIO_AGENTE_LOGISTICA.md', 'symbols':['P18','P22','P27'], 'status':'Regla de negocio confirmada; implementación pendiente'},
    'static': {'file':'Reporte de Logistica 18_9.pptx', 'symbols':[], 'status':'Recurso original conservado'},
}

def spec(n):
    d = dict(reference_slide=n, key=f'slide_{n:03d}', scope='weekly', include_when='always', status='reference_only', source='static', fields=[], title='')
    if n==1: d.update(title='Portada',family='cover',fields=['report.title','period.label','committee.date'])
    elif n==2: d.update(title='Índice',family='index',fields=['sections[].title','sections[].page_range','period.label'])
    elif n==3: d.update(title='Muestra por producto',family='sample',source='executive',fields=['sample.products[].count','sample.products[].unit','sample.total','period.label'])
    elif n in [4,19,27]: d.update(title={4:'Contenido soja',19:'Contenido pellet',27:'Contenido girasol'}[n],family='section_index',fields=['section.items'])
    elif n in [5,28]: d.update(title='Calidad de lectura '+('soja' if n==5 else 'girasol'),family='lpr',source='calibration',fields=['recognitionDepthBuckets','top_missing_step','missing_count','sample_n'],requires='Conservar cobertura observada; no sumar baja cobertura a TODAS')
    elif n in [6,21,29]: d.update(title={6:'Mapa R7',21:'Mapa R30/R31/R32',29:'Mapa R5/R6'}[n],family='route',fields=['route.label','product.label','route.steps'],include_when='circuit_has_activity')
    elif n in [7,22,30] or 8<=n<=14 or n in [23,24]:
        daily = n not in [7,22,30]
        d.update(title=('Tiempos diarios ' if daily else 'Tiempos semanales ')+('soja' if n<=14 else 'pellet' if n<=24 else 'girasol'),family='timing_daily' if daily else 'timing_weekly',source='timing',scope='operational_day' if daily else 'weekly',include_when='product_circuit_day_has_activity' if daily else 'product_circuit_has_activity',fields=['segments[].mean_minutes','segments[].sample_n','sum_segment_means_minutes','plants[].sum_segment_means_minutes','sample_count','sample_unit','previous_operation.delta_minutes']+(['quarters.Q1','quarters.Q2','quarters.Q3','quarters.Q4','day'] if daily else []),requires='No confundir suma de medias con media de ciclo; comparar con último operativo')
        if daily:d['reference_day']='2026-09-'+str(n+2 if n<=14 else n-9)
    elif n in [15,25]: d.update(title='Comparativo diario por planta',family='plant_comparison',source='timing',fields=['days[].label','days[].ricardone_minutes','days[].san_lorenzo_minutes'],requires='Comparación de días del período; no confundir con serie histórica de operativos')
    elif n==16:d.update(title='Comparativo diario de tiempos y turnos',family='daily_comparison',source='timing',fields=['days[].total_minutes','period.total_minutes','days[].quarters.Q1','days[].quarters.Q2','days[].quarters.Q3','days[].quarters.Q4'])
    elif n in [17,31]: d.update(title='Histórico de operativos',family='history',source='history',fields=['historical_series[].reported_values','historical_series[].periods','historical_series[].unit','previous_operation.period'],requires='No recalcular el histórico presentado; sustituir imagen solo con transcripción validada')
    elif n in [18,26,32]: d.update(title='Conclusiones '+{18:'soja',26:'pellet',32:'girasol'}[n],family='conclusions',source='derived',fields=['findings[].statement','findings[].metric_refs'],include_when='product_has_activity',requires='Redacción basada en indicadores; no inferir causas sin evidencia')
    elif n==20:d.update(title='Operativo pellet',family='operation',source='derived',fields=['operation.start','operation.end','operation.status','truck_count','estimated_tonnes','tonnes_assumption'],include_when='product_has_activity',requires='Toneladas estimadas = camiones × 30; falta conciliar 185/188 de referencia')
    elif n in [33,52]: d.update(title='Calada' if n==33 else 'Volcables',family='divider')
    elif 34<=n<=51:
        daily=36<=n<=49
        chart=daily and n%2==1
        family='activity_line_kpis' if chart else 'activity_bars' if daily else 'activity_overview' if n==34 else 'activity_combined' if n in [50,51] else 'activity_bars_kpis'
        d.update(title=('Calada diaria' if daily else 'Calada semanal')+(' líquidos Ricardone' if n==50 else ' San Lorenzo' if n==51 else ' por sede y tipo' if n==34 else ' Ricardone'),family=family,source='calada',scope='calendar_day_current_dashboard' if daily else 'weekly',include_when='site_day_has_activity' if daily else 'site_has_activity',fields=['hourly[].bucket','hourly[].trucks','hourly[].active_cameras','perCamera[].trucks','perCamera[].active_hours','totals.trucks','totals.peakTrucks','totals.peakTrucksLabel','totals.avgTrucksPerHour','totals.medianTrucksPerHour','periodHours'],table='calada_ricardone_liquid_events' if n==50 else 'calada_sl_camera_events' if n==51 else 'calada_camera_events',requires='Calendario actual; migración 22:00 pendiente. Pico de tarjeta y curva pueden usar poblaciones distintas')
        if n==34:d['table']=['calada_camera_events','calada_ricardone_liquid_events','calada_sl_camera_events']
        if daily:d['reference_day']=f'2026-09-{10+(n-36)//2:02}'
    elif 53<=n<=72:
        daily=n>=59
        chart=n in [54,56] or (daily and n%2==0)
        d.update(title='Actividad '+('volcables Ricardone' if n<=54 else 'silos Ricardone' if n<=56 else 'volcables Puerto'),family='activity_line' if chart else 'activity_summary',source='discharge',scope='calendar_day_current_dashboard' if daily else 'weekly',include_when='equipment_day_has_activity' if daily else 'equipment_has_activity',fields=['hourly[].trucks','perCamera[].trucks','totals.trucks','totals.peakTrucks','totals.peakTrucksLabel','totals.avgTrucksPerHour','periodHours','average_daily','distribution_pct'],table='ricardone_volcable_events' if n<=54 else 'ricardone_silo_events' if n<=56 else 'san_lorenzo_volcable_events',requires='SL: conteo principal Excel y solo cámara separados; no sumar distintos diarios para forzar total semanal')
        if daily:d['reference_day']=f'2026-09-{10+(n-59)//2:02}'
        d['family']='activity_line_kpis' if chart else 'activity_bars_narrative' if n==58 else 'activity_bars_kpis' if n==57 else 'activity_bars'
        d['fields'].append('totals.medianTrucksPerHour')
    return d

def txt(node):
    return ''.join(c.data for c in node.childNodes if c.nodeType==c.TEXT_NODE)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
    source=Path(args.source);out=Path(args.out);out.mkdir(parents=True,exist_ok=True)
    z=ZipFile(source); parts={n:z.read(n) for n in z.namelist()}
    slide_names=sorted([n for n in parts if re.fullmatch(r'ppt/slides/slide\d+\.xml',n)],key=lambda s:int(re.search(r'(\d+)\.xml',s).group(1)))
    assert len(slide_names)==72,'Reference changed: review slide inventory before generating'
    p=minidom.parseString(parts['ppt/presentation.xml']);size=p.getElementsByTagName('p:sldSz')[0];cx=int(size.getAttribute('cx'));cy=int(size.getAttribute('cy'))
    # Dedicated footer area below source content, so no original content is covered.
    footer_h=304800; size.setAttribute('cy',str(cy+footer_h));parts['ppt/presentation.xml']=p.toxml(encoding='UTF-8')
    specs=[]
    for n,name in enumerate(slide_names,1):
        entry=spec(n);doc=minidom.parseString(parts[name]);rels=minidom.parseString(parts[f'ppt/slides/_rels/slide{n}.xml.rels'])
        targets={r.getAttribute('Id'):posixpath.normpath(posixpath.join('ppt/slides',r.getAttribute('Target'))) for r in rels.getElementsByTagName('Relationship')}
        inv=[]
        for shape in doc.getElementsByTagName('p:sp'):
            ids=shape.getElementsByTagName('p:cNvPr');runs=shape.getElementsByTagName('a:t')
            if not ids or not runs:continue
            value=' '.join(txt(t) for t in runs).strip();sid=ids[0].getAttribute('id')
            if not value or value=='ACTUALIZAR':continue
            inv.append({'shape_id':sid,'slot_id':f's{n:03d}.text.{sid}','reference_text':value,'role':'binding_candidate' if re.search(r'\d',value) else 'label_or_narrative','binding_status':'not_connected'})
            ids[0].setAttribute('name',f's{n:03d}.text.{sid}')
        pics=[]
        for pic in doc.getElementsByTagName('p:pic'):
            ids=pic.getElementsByTagName('p:cNvPr');blips=pic.getElementsByTagName('a:blip')
            if not ids or not blips:continue
            target=targets.get(blips[0].getAttribute('r:embed'));sid=ids[0].getAttribute('id')
            if not target or (n!=1 and target=='ppt/media/image10.png'):continue
            pics.append({'shape_id':sid,'slot_id':f's{n:03d}.image.{sid}','source_part':target,'sha256':hashlib.sha256(parts[target]).hexdigest(),'status':'original_asset_preserved'})
        entry['text_objects']=inv;entry['image_objects']=pics;specs.append(entry)
        # Normalize only page headings; leave every metric and logo intact.
        for sh in list(doc.getElementsByTagName('p:sp')):
            value=' '.join(txt(t) for t in sh.getElementsByTagName('a:t')).strip()
            if value=='ACTUALIZAR':
                sh.parentNode.removeChild(sh);continue
            if n==1 or not re.match(r'^(Comparativo|Actividad|Resumen Semanal|Tiempos medios|Calidad de|Circuito|Circuitos|Conclusiones|Análisis Logístico|Tamaño de la Muestra|Operativo de Pellet)',value):continue
            xf=sh.getElementsByTagName('a:xfrm')
            if not xf:continue
            off=xf[0].getElementsByTagName('a:off')[0]
            if int(off.getAttribute('y'))>1100000:continue
            off.setAttribute('x','1050000');off.setAttribute('y','210000')
            ext=xf[0].getElementsByTagName('a:ext')[0];ext.setAttribute('cx','7100000');ext.setAttribute('cy','355000')
            for body in sh.getElementsByTagName('a:bodyPr'):
                for attr in ['lIns','rIns','tIns','bIns']:body.setAttribute(attr,'0')
                body.setAttribute('anchor','ctr')
            for pp in sh.getElementsByTagName('a:pPr'):pp.setAttribute('algn','ctr')
            for rp in sh.getElementsByTagName('a:rPr'):
                rp.setAttribute('sz','1800' if len(value)<60 else '1600')
                rp.setAttribute('b','1')
            sh.parentNode.appendChild(sh)
        # Remove decorative title underline instances, retaining original media bytes.
        for pic in list(doc.getElementsByTagName('p:pic')):
            blips=pic.getElementsByTagName('a:blip')
            if n!=1 and blips and targets.get(blips[0].getAttribute('r:embed'))=='ppt/media/image10.png':
                pic.parentNode.removeChild(pic)
        maxid=max(int(x.getAttribute('id')) for x in doc.getElementsByTagName('p:cNvPr'))+1
        label=f'PLANTILLA v1 · Referencia reportada 10–16/09/2026 · Sin recálculo · {n}/72'
        footer=f'''<p:sp xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:nvSpPr><p:cNvPr id="{maxid}" name="template_status"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="{cy}"/><a:ext cx="{cx}" cy="{footer_h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr lIns="150000" rIns="50000" tIns="25000" bIns="10000" anchor="ctr"/><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr lang="es-AR" sz="1000"><a:solidFill><a:srgbClr val="06245F"/></a:solidFill><a:latin typeface="Inter"/></a:rPr><a:t>{escape(label)}</a:t></a:r><a:endParaRPr lang="es-AR" sz="1000"/></a:p></p:txBody></p:sp>'''
        doc.getElementsByTagName('p:spTree')[0].appendChild(doc.importNode(minidom.parseString(footer).documentElement,True))
        parts[name]=doc.toxml(encoding='UTF-8')
        note_path=next(v for v in targets.values() if v.startswith('ppt/notesSlides/'))
        notes=minidom.parseString(parts[note_path]);body=None
        for sh in notes.getElementsByTagName('p:sp'):
            ph=sh.getElementsByTagName('p:ph')
            if ph and ph[0].getAttribute('type')=='body':body=sh.getElementsByTagName('p:txBody')[0];break
        if body is not None:
            content=[f'Plantilla v1. Fuente visual: {source.name}, diapositiva {n}. Los valores son reportados, no recalculados.',f'Familia: {entry["family"]}. Fuente prevista: {entry["source"]}.',f'Campos previstos: {", ".join(entry["fields"])}.',f'Inclusión futura: {entry["include_when"]}.',entry.get('requires','')]
            for line in content:
                if not line:continue
                e=notes.createElement('a:p');r=notes.createElement('a:r');t=notes.createElement('a:t');t.appendChild(notes.createTextNode(line));r.appendChild(t);e.appendChild(r);body.appendChild(e)
            parts[note_path]=notes.toxml(encoding='UTF-8')
    candidate=out/'plantilla_comite_logistica_v1.pptx'
    with ZipFile(candidate,'w',ZIP_DEFLATED) as dest:
        for name,data in parts.items():dest.writestr(name,data)
    unchanged_media=all(parts[n]==z.read(n) for n in parts if n.startswith('ppt/media/'))
    assert unchanged_media
    manifest={'schema_version':1,'status':'review_template_not_live_report','reference':str(source),'reference_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'original_size_emu':[cx,cy],'template_size_emu':[cx,cy+footer_h],'reference_values':'reported_not_recomputed','original_media_unchanged':unchanged_media,'sources':SOURCES,'slides':specs}
    (out/'mapa_diapositivas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    lines=['# Mapa de la plantilla de logística v1','','Estado: plantilla de revisión. Las 72 páginas conservan valores e imágenes de referencia; no están conectadas a una corrida.','', 'El pie de revisión ocupa una franja nueva bajo el contenido original. No cubre cifras, mapas ni logos. Las imágenes originales se conservan byte a byte.','', '## Cobertura por diapositiva','']
    for e in specs:
        lines += [f'### {e["reference_slide"]:02d}. {e["title"]}',f'- Familia: `{e["family"]}`. Fuente prevista: `{e["source"]}`.',f'- Campos: '+(', '.join(f'`{f}`' for f in e['fields']) or 'recurso visual original')+'.',f'- Inclusión automática futura: `{e["include_when"]}`.',f'- Estado: {SOURCES[e['source']]['status']}.']
        if 'reference_day' in e:lines += [f'- Día ilustrado en el ejemplo: {e["reference_day"]}.']
        if 'table' in e:lines += [f'- Tabla de actividad identificada: `{e["table"]}`.']
        if 'requires' in e:lines += [f'- Control: {e["requires"]}.']
        lines += ['']
    lines += ['## Fuentes del código','']
    for key,s in SOURCES.items():lines += [f'- **{key}**: `{s["file"]}`. '+', '.join(f'`{x}`' for x in s['symbols'])+'. '+s['status']+'.']
    lines += ['', '## Uso de la plantilla','', 'El JSON enumera identificadores estables de objetos de texto e imagen y sus valores originales. Son candidatos de vinculación, no asignaciones semánticas completas ni conexiones activas. Antes de reemplazarlos, el adaptador deberá resolver cada campo de negocio y conciliar su muestra.', '', 'Las páginas diarias son modelos repetibles: el generador posterior las duplicará u omitirá según actividad verificada. La paginación y el índice deberán regenerarse tras esa selección. Los días con fuentes ausentes no se consideran días sin actividad.', '', 'Los gráficos pegados como imágenes conservan la referencia original. Todavía no son editables como series de PowerPoint. Textos, formas y mapas mantienen la estructura del PPTX fuente.']
    (out/'MAPA_DIAPOSITIVAS.md').write_text('\n'.join(lines),encoding='utf8')
    print(json.dumps({'slides':len(specs),'template':str(candidate),'original_media_unchanged':unchanged_media,'text_objects':sum(len(e['text_objects']) for e in specs)},ensure_ascii=False))

if __name__=='__main__':main()
