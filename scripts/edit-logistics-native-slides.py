"""Patch slides 2, 3 and 34 only; keep reference values and other ZIP parts."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from defusedxml import minidom
from xml.sax.saxutils import escape
import hashlib,json,shutil

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'reportes/logistica/plantilla_v1/plantilla_comite_logistica_v1_revision3.pptx'
WORK=ROOT/'scratchpad/plantilla_logistica_native'
WORK.mkdir(parents=True,exist_ok=True)
backup=WORK/'before.pptx'
if not backup.exists():shutil.copy2(SOURCE,backup)
with ZipFile(SOURCE) as z: parts={n:z.read(n) for n in z.namelist()}
original=dict(parts)
NS='xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
slots={}
def emu(x):return str(round(x*9525))

for num in [2,3,34]:
    part=f'ppt/slides/slide{num}.xml';doc=minidom.parseString(parts[part]);tree=doc.getElementsByTagName('p:spTree')[0]
    rel=minidom.parseString(parts[f'ppt/slides/_rels/slide{num}.xml.rels'])
    targets={r.getAttribute('Id'):r.getAttribute('Target') for r in rel.getElementsByTagName('Relationship')}
    # Keep the two original logos, title and review footer; replace content only.
    for child in list(tree.childNodes):
        if child.nodeType!=child.ELEMENT_NODE:continue
        if child.tagName=='p:pic':
            blip=child.getElementsByTagName('a:blip')[0]
            if targets.get(blip.getAttribute('r:embed')) not in ['../media/image2.jpg','../media/image16.png']:tree.removeChild(child)
        elif child.tagName=='p:sp':
            props=child.getElementsByTagName('p:cNvPr')[0]
            text=' '.join(t.firstChild.data for t in child.getElementsByTagName('a:t') if t.firstChild)
            if props.getAttribute('name')!='template_status' and not text.startswith(('Análisis Logístico','Tamaño de la Muestra','Resumen Semanal')):tree.removeChild(child)
        elif child.tagName not in ['p:nvGrpSpPr','p:grpSpPr']:tree.removeChild(child)
    counter=20000
    slots[str(num)]=[]
    def box(key,value,x,y,w,h,size=18,bold=False,color='06245F',fill=None,align='l'):
        global counter
        counter+=1
        bg=f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
        paragraphs=''.join(f'<a:p><a:pPr algn="{align}"/><a:r><a:rPr lang="es-AR" sz="{round(size*75)}" b="{int(bold)}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:latin typeface="Inter"/></a:rPr><a:t>{escape(line)}</a:t></a:r><a:endParaRPr sz="{round(size*75)}"/></a:p>' for line in str(value).split('\n'))
        xml=f'<p:sp {NS}><p:nvSpPr><p:cNvPr id="{counter}" name="{escape(key)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="{emu(x)}" y="{emu(y)}"/><a:ext cx="{emu(w)}" cy="{emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{bg}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr lIns="{emu(10)}" rIns="{emu(10)}" tIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>{paragraphs}</p:txBody></p:sp>'
        tree.appendChild(doc.importNode(minidom.parseString(xml).documentElement,True))
        slots[str(num)].append({'shape_id':str(counter),'field':key,'value':str(value),'status':'native_editable_reference_value'})
    if num==2:
        box('period.label','Período analizado: 10/09 al 16/09/2026',115,82,730,35,17)
        rows=[('Tamaño de la muestra y período','3'),('Operación de soja','4–18'),('Operativo de pellet de girasol','19–26'),('Operación de semilla de girasol','27–32'),('Actividad de calada','33–51'),('Actividad de volcables','52–72')]
        for i,(label,pages) in enumerate(rows):
            y=135+i*60
            box(f'index.{i}.number',str(i+1),115,y,48,46,22,True,'FFFFFF','0B5A43','ctr')
            box(f'index.{i}.title',label,178,y,560,46,20,True,fill='F3F6F5')
            box(f'index.{i}.pages',f'Pág. {pages}',738,y,112,46,17,False,fill='F3F6F5',align='r')
    elif num==3:
        box('period.heading','PERÍODO DE ANÁLISIS',70,112,400,30,17,True)
        for key,label,value,x in [('start','Inicio','10/09',70),('end','Fin','16/09',200),('days','Días','7',330)]:
            box(f'period.{key}.label',label,x,153,120,25,15)
            box(f'period.{key}',value,x,180,120,45,30,True)
        box('sample.total.label','VOLUMEN TOTAL REGISTRADO',530,112,380,30,17,True)
        box('sample.total','3.423',530,154,350,60,42,True)
        box('sample.unit','camiones · valor reportado',530,220,350,30,17)
        data=[('soja','SOJA','2.557','38761D'),('girasol','GIRASOL','523','A78619'),('liquidos','LÍQUIDOS','155','B86415'),('pellet','PELLET','188','356CB3')]
        for i,(key,label,value,color) in enumerate(data):
            x=70+i*220
            box(f'products.{key}.label',label,x,312,200,40,19,True,color,fill='F3F6F5',align='ctr')
            box(f'products.{key}.count',value,x,352,200,73,37,True,color,fill='F3F6F5',align='ctr')
        box('sample.caption','Totales por producto del informe de referencia',70,454,830,35,16)
    else:
        box('calada.subtitle','Actividad semanal por sede y tipo de calada',70,105,820,35,20)
        cols=[(70,185,'Sede'),(255,185,'Tipo'),(440,150,'Horas activas'),(590,150,'Camiones/h'),(740,150,'Camiones')]
        for x,w,label in cols:box('calada.header.'+label,label,x,166,w,48,17,True,'FFFFFF','0B5A43')
        rows=[('ric_solida','Ricardone','Sólida','148','20','2.908'),('ric_liquida','Ricardone','Líquida','49','3,6','152'),('sl','San Lorenzo','Calada','90','3,3','237')]
        for i,row in enumerate(rows):
            key,*values=row
            for j,((x,w,_),value) in enumerate(zip(cols,values)):
                box(f'calada.{key}.'+['sede','tipo','horas','camiones_h','camiones'][j],value,x,214+i*79,w,79,22,j>=2,fill='F3F6F5' if i%2==0 else 'FFFFFF')
        box('calada.caption','Cada calada responde a una operación y una demanda diferentes.',70,474,820,38,16)
    parts[part]=doc.toxml(encoding='UTF-8')

changed=[n for n in parts if parts[n]!=original[n]]
assert changed==[f'ppt/slides/slide{n}.xml' for n in [2,3,34]],changed
candidate=WORK/'candidate.pptx'
with ZipFile(candidate,'w',ZIP_DEFLATED) as z:
    for n,b in parts.items():z.writestr(n,b)
(WORK/'native_bindings.json').write_text(json.dumps(slots,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'candidate':str(candidate),'changed_parts':changed,'all_other_parts_identical':True}))
