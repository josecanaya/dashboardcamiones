"""QA de estructura del PPTX y geometría del PDF, sin alterar las fuentes."""
import json,sys,zipfile
from pathlib import Path
from pptx import Presentation
folder=Path(sys.argv[1]).resolve()
pptx=folder/'informe.pptx'
prs=Presentation(pptx)
overflow=[]
for i,slide in enumerate(prs.slides,1):
    for shape in slide.shapes:
        if shape.left<0 or shape.top<0 or shape.left+shape.width>prs.slide_width+10000 or shape.top+shape.height>prs.slide_height+10000:
            overflow.append({'slide':i,'shape':shape.name})
with zipfile.ZipFile(pptx) as z:
    charts=sum(1 for n in z.namelist() if n.startswith('ppt/charts/chart') and n.endswith('.xml'))
    workbooks=sum(1 for n in z.namelist() if n.startswith('ppt/embeddings/') and n.endswith('.xlsx'))
result={'slides':len(prs.slides),'nativeCharts':charts,'embeddedWorkbooks':workbooks,'shapeOverflow':overflow}
pdf=folder/'informe.pdf'
if pdf.exists():
    import fitz
    doc=fitz.open(pdf)
    result['pdfPages']=len(doc)
    result['pdfTextOverflow']=[]
    for i,page in enumerate(doc,1):
        for block in page.get_text('dict')['blocks']:
            if 'lines' not in block:continue
            x0,y0,x1,y1=block['bbox']
            if x0<-.5 or y0<-.5 or x1>page.rect.width+.5 or y1>page.rect.height+.5:
                result['pdfTextOverflow'].append({'page':i,'bbox':block['bbox']})
    # Captura de una lámina con gráfico y la portada para inspección visual.
    chart_index=next((i for i,s in enumerate(prs.slides) if any(sh.has_chart for sh in s.shapes)),0)
    doc[chart_index].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(folder/'qa-grafico.png')
    doc.close()
(folder/'qa.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
if overflow or result.get('pdfTextOverflow'):raise SystemExit(1)
