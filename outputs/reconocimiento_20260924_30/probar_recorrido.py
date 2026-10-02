import json,re,bisect
from pathlib import Path
from collections import defaultdict
import pandas as pd
import numpy as np
P=Path(__file__).parent
d=pd.read_excel(r'C:/Users/Usuario/AppData/Local/Temp/VehicleCaptureRecord202610021644394118890.xlsx').fillna('')
d['excel_row']=range(2,len(d)+2)
d['t']=pd.to_datetime(d['Capture Time']); d=d.sort_values('t').reset_index(drop=True)
d['p']=d['Plate No.'].astype(str).str.upper().str.replace(r'[^A-Z0-9]','',regex=True)
d['valid']=d.p.str.match(r'^(?:[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[A-Z]{3}[0-9][A-Z][0-9]{2})$')
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
def known(x):return x not in ('','Unknown','Unrecognized')
cut=pd.Timestamp('2026-09-27')
train=d[(d.t<cut)&d.valid&(d.conf>=80)]
legs=defaultdict(list)
# Empirical directed camera transitions trained exclusively September 24–26.
for _,g in train.groupby('p'):
    a=g.to_dict('records')
    for r,s in zip(a,a[1:]):
        dt=(s['t']-r['t']).total_seconds()
        if r['Device Name']!=s['Device Name'] and 0<=dt<=21600:
            legs[(r['Device Name'],s['Device Name'])].append(dt)
limits={k:(max(0,float(np.quantile(v,.05))-30),float(np.quantile(v,.95))+30,len(v)) for k,v in legs.items() if len(v)>=5}
mapping=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
catalog=json.loads((P/'circuit_catalog.json').read_text(encoding='utf-8-sig'))['catalog']
def allowed(a,b):
    ma,mb=mapping.get(a,{}),mapping.get(b,{})
    sa,sb=str(ma.get('sector','')).split('-')[-1],str(mb.get('sector','')).split('-')[-1]
    if not sa.startswith('S') or not sb.startswith('S'):return False
    if ma.get('node_id')==mb.get('node_id'):return True
    for code,c in catalog.items():
        for seq in [c.get('baseSequence',[])]+c.get('allowedSequences',[]):
            if any(x==sa and sb in seq[k+1:] for k,x in enumerate(seq)):return True
    return False
limits={k:v for k,v in limits.items() if allowed(*k)}
rows=d.to_dict('records'); times=[r['t'].timestamp() for r in rows]
refidx=defaultdict(list)
for j,s in enumerate(rows):
    if s['valid'] and s['conf']>=80:refidx[s['Device Name']].append(j)
reftimes={c:[times[j] for j in v] for c,v in refidx.items()}
linked=defaultdict(set)
for a,b in limits:linked[a].add(b);linked[b].add(a)
out=[]
for i,r in enumerate(rows):
    if r['t']<cut or not ((r['valid'] and r['conf']>=80) or not r['valid']):continue
    cand={}
    idx=[]
    for cam in linked[r['Device Name']]:
        tt=reftimes.get(cam,[]); ids=refidx.get(cam,[])
        idx.extend(ids[bisect.bisect_left(tt,times[i]-21600):bisect.bisect_right(tt,times[i]+21600)])
    for j in idx:
        s=rows[j]
        if i==j or not s['valid'] or s['conf']<80 or s['Device Name']==r['Device Name']:continue
        prev,next_=(s,r) if j<i else (r,s)
        rule=limits.get((prev['Device Name'],next_['Device Name']))
        dt=abs(times[j]-times[i])
        if not rule or not rule[0]<=dt<=rule[1]:continue
        available=[k for k in ['Vehicle Color','Vehicle Brand','Vehicle Category'] if known(r[k]) and known(s[k])]
        matches=[k for k in available if r[k]==s[k]]
        score=sum({'Vehicle Color':2,'Vehicle Brand':3,'Vehicle Category':1}[k] if k in matches else -{'Vehicle Color':2,'Vehicle Brand':3,'Vehicle Category':1}[k] for k in available)
        if score<2:continue
        q=cand.setdefault(s['p'],{'score':-99,'before':False,'after':False,'refs':0,'matches':0})
        q['before']|=j<i; q['after']|=j>i; q['refs']+=1
        if score>q['score']:q['score']=score;q['matches']=len(matches)
    ordered=sorted(cand.items(),key=lambda z:(int(z[1]['before'] and z[1]['after']),z[1]['score']),reverse=True)
    top=ordered[0] if ordered else None
    def rank(z):return (int(z[1]['before'] and z[1]['after']),z[1]['score'])
    unique=bool(top) and (len(ordered)==1 or rank(top)>rank(ordered[1]))
    both=bool(top and top[1]['before'] and top[1]['after'])
    strict=unique and both and top[1]['score']>=5
    out.append({'excel_row':r['excel_row'],'camera':r['Device Name'],'time':str(r['t']),'plate':r['p'],'test':bool(r['valid']),
      'candidates':len(cand),'candidate':top[0] if top else '', 'unique':unique,'two_sides':both,'strict':strict,
      'color':r['Vehicle Color'],'brand':r['Vehicle Brand'],'category':r['Vehicle Category'],
      'ocr_confidence':r['conf'],'heuristic_score':top[1]['score'] if top else None,
      'matching_attributes_best_reference':top[1]['matches'] if top else 0,
      'candidate_reference_captures':top[1]['refs'] if top else 0,
      'correct':bool(top and top[0]==r['p']) if r['valid'] else None})
x=pd.DataFrame(out);x.to_csv(P/'candidatos_recorrido.csv',index=False,encoding='utf-8-sig')
summary={}
for flag,label in [(True,'blind_test'),(False,'nonstandard')]:
    z=x[x.test==flag];u=z[z.unique];s=z[z.strict]
    summary[label]={'n':len(z),'with_candidate':int((z.candidates>0).sum()),'unique':len(u),'strict':len(s),
      'correct_top':int(z.correct.fillna(False).sum()) if flag else None,'correct_unique':int(u.correct.fillna(False).sum()) if flag else None,
      'correct_strict':int(s.correct.fillna(False).sum()) if flag else None}
cams=[]
for c,g in d.groupby('Device Name'):
    z=x[(x.camera==c)&x.test];a=x[(x.camera==c)&~x.test];s=z[z.strict]
    cams.append({'camera':c,'all_captures':len(g),'test_n':len(z),'strict_n':len(s),'strict_correct':int(s.correct.fillna(False).sum()),
      'nonstandard_test_period':len(a),'nonstandard_no_candidate':int((a.candidates==0).sum()),'nonstandard_strict':int(a.strict.sum())})
pd.DataFrame(cams).to_csv(P/'validacion_recorrido_por_punto.csv',index=False,encoding='utf-8-sig')
summary.update({'training':'2026-09-24/2026-09-26','evaluation':'2026-09-27/2026-09-30','learned_transitions':len(limits),'per_camera':cams,
 'method':'Transiciones consecutivas con OCR>=80, minimo 5 ejemplos; compatibles con alguna secuencia del catalogo de circuitos (no circuito individual confirmado); ventana p05–p95 ±30s, máximo 6h; ranking por evidencia anterior y posterior, luego atributos. Puntajes heurísticos, no probabilidades calibradas. Etiqueta de referencia OCR, no identidad auditada.'})
(P/'recorrido_resultado.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='per_camera'},ensure_ascii=False))
