"""Actualizador manual: lectura XLSX, edición puntual OOXML, sin recalcular negocio."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from datetime import datetime
from copy import deepcopy
import json, math, argparse, sys
from lxml import etree as E
import openpyxl

HERE=Path(__file__).resolve().parent
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','c':'http://schemas.openxmlformats.org/drawingml/2006/chart','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
REL='http://schemas.openxmlformats.org/package/2006/relationships'
CT='http://schemas.openxmlformats.org/package/2006/content-types'
def tag(k):
    pre,name=k.split(':');return '{'+NS[pre]+'}'+name
def sub(parent,k,**attrs):return E.SubElement(parent,tag(k),{a:str(v) for a,v in attrs.items()})
def val(parent,k,v):return sub(parent,k,val=v)
def xml(doc):return E.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True)
def numtext(v):
    if isinstance(v,(float,int)) and not isinstance(v,bool):
        if not math.isfinite(v):raise ValueError('Valor no finito')
        return str(int(v)) if v==int(v) else str(v).replace('.',',')
    return str(v)
def set_text(shape,value):
    body=shape.find('p:txBody',NS)
    if body is None:raise ValueError('El objeto no contiene texto editable')
    old=body.find('a:p',NS); pprops=deepcopy(old.find('a:pPr',NS)) if old is not None and old.find('a:pPr',NS) is not None else None
    rprops=body.find('.//a:rPr',NS);rprops=deepcopy(rprops) if rprops is not None else E.Element(tag('a:rPr'))
    for p in list(body.findall('a:p',NS)):body.remove(p)
    for line in numtext(value).split('\n'):
        p=sub(body,'a:p')
        if pprops is not None:p.append(deepcopy(pprops))
        r=sub(p,'a:r');r.append(deepcopy(rprops));sub(r,'a:t').text=line
def rich(parent,k,text,size=1000):
    o=sub(parent,k);sub(o,'a:bodyPr');sub(o,'a:lstStyle');p=sub(o,'a:p');r=sub(p,'a:r');rp=sub(r,'a:rPr',sz=size,lang='es-AR');sub(rp,'a:latin',typeface='Arial');sub(r,'a:t').text=text
    return o
def chart_xml(conf,cats,series):
    root=E.Element(tag('c:chartSpace'),nsmap={k:NS[k] for k in ['c','a','r']});val(root,'c:date1904',0);val(root,'c:lang','es-AR');chart=sub(root,'c:chart')
    title=sub(chart,'c:title');tx=sub(title,'c:tx');rich(tx,'c:rich',conf['title']+(' (%)' if conf['unit']=='%' else ' (min)' if conf['unit']=='min' else ''),1050);sub(title,'c:layout');val(title,'c:overlay',0)
    plot=sub(chart,'c:plotArea');sub(plot,'c:layout');typ=conf['type'];kind={'bar':'barChart','line':'lineChart','pie':'pieChart'}[typ];obj=sub(plot,'c:'+kind)
    if typ=='bar':val(obj,'c:barDir','col');val(obj,'c:grouping','clustered')
    if typ=='line':val(obj,'c:grouping','standard');val(obj,'c:varyColors',0)
    if typ=='pie':val(obj,'c:varyColors',1)
    colors=['0B5A43','4472C4','C49A32','A95C3F','6E7D91','82A35E']
    for i,(name,values) in enumerate(series.items()):
        se=sub(obj,'c:ser');val(se,'c:idx',i);val(se,'c:order',i);tx=sub(se,'c:tx');sub(tx,'c:v').text=name
        sp=sub(se,'c:spPr');fill=sub(sp,'a:solidFill');sub(fill,'a:srgbClr',val=colors[i%len(colors)]);ln=sub(sp,'a:ln',w=19050);fill=sub(ln,'a:solidFill');sub(fill,'a:srgbClr',val=colors[i%len(colors)])
        if typ=='pie':
            for j in range(len(cats)):
                pt=sub(se,'c:dPt');val(pt,'c:idx',j);sp=sub(pt,'c:spPr');fill=sub(sp,'a:solidFill');sub(fill,'a:srgbClr',val=colors[j%len(colors)])
        if typ=='line':mark=sub(se,'c:marker');val(mark,'c:symbol','circle');val(mark,'c:size',4)
        cat=sub(se,'c:cat');lit=sub(cat,'c:strLit');val(lit,'c:ptCount',len(cats))
        for j,catname in enumerate(cats):pt=sub(lit,'c:pt',idx=j);sub(pt,'c:v').text=str(catname)
        data=sub(se,'c:val');lit=sub(data,'c:numLit');sub(lit,'c:formatCode').text='0' if all(v==int(v) for v in values) else '0.0';val(lit,'c:ptCount',len(values))
        for j,n in enumerate(values):pt=sub(lit,'c:pt',idx=j);sub(pt,'c:v').text=str(n)
        if typ=='line':val(se,'c:smooth',0)
    if typ!='line':
        labels=sub(obj,'c:dLbls');sub(labels,'c:numFmt',formatCode='0.0"%"' if conf['unit']=='%' else '0' if all(v==int(v) for arr in series.values() for v in arr) else '0.0',sourceLinked=0);val(labels,'c:dLblPos','bestFit' if typ=='pie' else 'outEnd');val(labels,'c:showLegendKey',0);val(labels,'c:showVal',1);val(labels,'c:showCatName',0);val(labels,'c:showSerName',0);val(labels,'c:showPercent',0)
    if typ=='bar':val(obj,'c:gapWidth',70)
    if typ!='pie':
        val(obj,'c:axId',100);val(obj,'c:axId',200)
        for axis,aid,cross,pos in [('catAx',100,200,'b'),('valAx',200,100,'l')]:
            ax=sub(plot,'c:'+axis);val(ax,'c:axId',aid);scale=sub(ax,'c:scaling');val(scale,'c:orientation','minMax');val(ax,'c:delete',0);val(ax,'c:axPos',pos)
            if axis=='valAx':sub(ax,'c:majorGridlines');sub(ax,'c:numFmt',formatCode='0',sourceLinked=0)
            val(ax,'c:majorTickMark','none');val(ax,'c:minorTickMark','none');val(ax,'c:tickLblPos','nextTo');rich(ax,'c:txPr','',850);val(ax,'c:crossAx',cross);val(ax,'c:crosses','autoZero')
            if axis=='catAx':val(ax,'c:auto',1);val(ax,'c:lblAlgn','ctr');val(ax,'c:lblOffset',100)
            else:val(ax,'c:crossBetween','between')
    if len(series)>1 or typ=='pie':leg=sub(chart,'c:legend');val(leg,'c:legendPos','b');sub(leg,'c:layout');val(leg,'c:overlay',0)
    val(chart,'c:plotVisOnly',1);val(chart,'c:dispBlanksAs','gap');sp=sub(root,'c:spPr');fill=sub(sp,'a:solidFill');sub(fill,'a:srgbClr',val='FFFFFF');ln=sub(sp,'a:ln');sub(ln,'a:noFill');rich(root,'c:txPr','',900)
    return xml(root)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--excel',type=Path,default=HERE/'Datos_MANUAL.xlsx');ap.add_argument('--demo',action='store_true');ap.add_argument('--work',type=Path,default=HERE/'_trabajo'/datetime.now().strftime('%Y%m%d_%H%M%S_%f'));args=ap.parse_args()
    cfg=json.loads((HERE/'vinculos.json').read_text(encoding='utf8'));geometry=json.loads((HERE/'geometria.json').read_text(encoding='utf8'));wb=openpyxl.load_workbook(args.excel,data_only=False)
    with ZipFile(HERE/'Plantilla_BASE.pptx') as z:parts={n:z.read(n) for n in z.namelist()}
    docs={};changes=[];warnings=[]
    def slide(n):
        if n not in docs:docs[n]=E.fromstring(parts[f'ppt/slides/slide{n}.xml'])
        return docs[n]
    def shape(n,oid):
        hits=slide(n).xpath('.//p:spTree/*[p:nvSpPr/p:cNvPr/@id=$id or p:nvPicPr/p:cNvPr/@id=$id or p:nvGraphicFramePr/p:cNvPr/@id=$id]',namespaces=NS,id=str(oid))
        if len(hits)!=1:raise ValueError(f'D{n}: objeto {oid} ausente o ambiguo')
        return hits[0]
    def read(sh,cell):
        c=wb[sh][cell]
        if c.data_type=='f':raise ValueError(f'{sh}!{cell}: usar un valor manual, no una fórmula')
        if c.data_type=='e':raise ValueError(f'{sh}!{cell}: error Excel')
        return c.value
    def replace_slot(n,oid,new=None):
        slot=geometry[f'{n}:{oid}'];tree=slide(n).find('p:cSld/p:spTree',NS)
        for remove in slot['remove']:
            old=shape(n,remove);old.getparent().remove(old)
        if new is not None:tree.append(new)
    def transform(n,oid):
        x,y,w,h=geometry[f'{n}:{oid}']['rect'];xf=E.Element(tag('a:xfrm'));sub(xf,'a:off',x=x,y=y);sub(xf,'a:ext',cx=w,cy=h);return xf
    for t in cfg['texts']:
        v=read(t['sheet'],t['cell'])
        if v is None or v=='':continue
        set_text(shape(t['slide'],t['object']),v);changes.append(f"D{t['slide']} objeto {t['object']}: {t['original']} -> {numtext(v)}")
    ct=E.fromstring(parts['[Content_Types].xml'])
    for index,g in enumerate(cfg['charts']):
        cats=[];series={};missing=[]
        for offset,row in enumerate(range(g['start'],g['end']+1)):
            cat=read(g['sheet'],'A'+str(row));ser=read(g['sheet'],'B'+str(row));expected=g['rows'][offset]
            if [cat,ser]!=expected:raise ValueError(f"{g['id']}: categorías o filas modificadas; conservar la estructura de la planilla")
            v=read(g['sheet'],'C'+str(row))
            if v is None or v=='':missing.append(row);continue
            if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or v<0:raise ValueError(f"{g['sheet']}!C{row}: se requiere un número no negativo")
            if cat not in cats:cats.append(cat)
            series.setdefault(ser,[]).append(v)
        if missing:warnings.append(f"{g['id']} D{g['slide']}: se conserva grafico base; faltan {len(missing)} valores en {g['sheet']}");continue
        if g['type']=='pie' and not any(sum(v)>0 for v in series.values()):warnings.append(g['id']+': torta sin valores positivos; imagen conservada');continue
        xf=transform(g['slide'],g['object'])
        number=1000+index;target=f'ppt/charts/chart{number}.xml';parts[target]=chart_xml(g,cats,series)
        E.SubElement(ct,'{'+CT+'}Override',PartName='/'+target,ContentType='application/vnd.openxmlformats-officedocument.drawingml.chart+xml')
        relpath=f"ppt/slides/_rels/slide{g['slide']}.xml.rels";rels=E.fromstring(parts[relpath]);rid='rIdManual'+str(number)
        E.SubElement(rels,'{'+REL+'}Relationship',Id=rid,Type=NS['r']+'/chart',Target=f'../charts/chart{number}.xml');parts[relpath]=xml(rels)
        gf=E.Element(tag('p:graphicFrame'));nv=sub(gf,'p:nvGraphicFramePr');sub(nv,'p:cNvPr',id=g['object'],name=g['id']);sub(nv,'p:cNvGraphicFramePr');sub(nv,'p:nvPr');tr=sub(gf,'p:xfrm');tr.extend(deepcopy(list(xf)));graphic=sub(gf,'a:graphic');data=sub(graphic,'a:graphicData',uri=NS['c']);ch=sub(data,'c:chart');ch.set(tag('r:id'),rid);replace_slot(g['slide'],g['object'],gf)
        changes.append(f"{g['id']} D{g['slide']}: gráfico editable desde {g['sheet']}!C{g['start']}:C{g['end']}")
    for cap in cfg['captures']:
        xf=transform(cap['slide'],cap['object'])
        # Tiny screenshot fragments are removed, the main slot becomes a picture placeholder.
        ext=xf.find('a:ext',NS)
        if int(ext.get('cx'))<300000 or int(ext.get('cy'))<150000:replace_slot(cap['slide'],cap['object']);continue
        sp=E.Element(tag('p:sp'));nv=sub(sp,'p:nvSpPr');sub(nv,'p:cNvPr',id=cap['object'],name='Captura de actividad pendiente');sub(nv,'p:cNvSpPr');nvp=sub(nv,'p:nvPr');sub(nvp,'p:ph',type='pic');pr=sub(sp,'p:spPr');pr.append(deepcopy(xf));geo=sub(pr,'a:prstGeom',prst='rect');sub(geo,'a:avLst');sub(pr,'a:noFill');ln=sub(pr,'a:ln',w=9525);fill=sub(ln,'a:solidFill');sub(fill,'a:srgbClr',val='B8C7C0');replace_slot(cap['slide'],cap['object'],sp)
    for n in range(1,73):
        d=slide(n)
        foot=d.xpath('.//p:sp[p:nvSpPr/p:cNvPr/@name="template_status"]',namespaces=NS)
        if foot:set_text(foot[0],f'PRUEBA 100 / 200 · DATOS FICTICIOS · {n}/72' if args.demo else f'BORRADOR MANUAL · Datos de referencia y carga manual · {n}/72')
        parts[f'ppt/slides/slide{n}.xml']=xml(d)
    parts['[Content_Types].xml']=xml(ct);args.work.mkdir(parents=True,exist_ok=True)
    with ZipFile(args.work/'candidate.pptx','w',ZIP_DEFLATED) as z:
        for n,b in parts.items():z.writestr(n,b)
    log='CAMBIOS\n'+'\n'.join(changes)+'\n\nPENDIENTES\n'+'\n'.join(warnings)+'\n\nCapturas de actividad vacias. Tarjetas, totales y conclusiones requieren revision manual.\n'
    (args.work/'registro_cambios.txt').write_text(log,encoding='utf8');(args.work/'result.json').write_text(json.dumps({'changes':len(changes),'warnings':len(warnings),'work':str(args.work)},ensure_ascii=False),encoding='utf8')
    print(json.dumps({'work':str(args.work),'changes':len(changes),'warnings':len(warnings)},ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)
