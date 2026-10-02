"""Prueba condicional: extremos de igual patente; reconstrucción de cadenas interiores.
No usa patentes interiores para generar ni puntuar caminos. OCR es referencia provisional.
"""
import argparse,json,bisect
from collections import defaultdict,Counter
from pathlib import Path
import pandas as pd
import numpy as np
P=Path(__file__).parent
parser=argparse.ArgumentParser(description='Reconstruye cadenas entre capturas ancla.')
parser.add_argument('capturas_xlsx',type=Path,help='Excel exportado de VehicleCaptureRecord')
args=parser.parse_args()
d=pd.read_excel(args.capturas_xlsx).fillna('')
d['excel_row']=range(2,len(d)+2)
d['t']=pd.to_datetime(d['Capture Time']);d=d.sort_values('t').reset_index(drop=True)
d['p']=d['Plate No.'].astype(str).str.upper().str.replace(r'[^A-Z0-9]','',regex=True)
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
d['anchor']=d.p.str.match(r'^(?:[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[A-Z]{3}[0-9][A-Z][0-9]{2})$')&(d.conf>=80)
mapping=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
catalog=json.loads((P/'circuit_catalog.json').read_text(encoding='utf-8-sig'))['catalog']
rows=d.to_dict('records');times=[r['t'].timestamp() for r in rows]
features=['Vehicle Color','Vehicle Brand','Vehicle Category']
def signature(r):
    z=tuple(r[k] for k in features)
    return z if all(x not in ('','Unknown','Unrecognized') for x in z) else None
def meta(i):return mapping.get(rows[i]['Device Name'],{})
def node(i):return meta(i).get('node_id')
def sector(i):return str(meta(i).get('sector','')).split('-')[-1]
def side(i):return meta(i).get('rear',False)
def codes(path):
    ss=[(meta(i).get('site'),sector(i)) for i in path]
    out=[]
    for code,c in catalog.items():
        for seq in [c.get('baseSequence',[])]+c.get('allowedSequences',[]):
            # Sector names repeat between plants: retain site in graph matching.
            current_site='san_lorenzo' if code.startswith('SL') else 'ricardone'
            qualified=[]
            for pos,s in enumerate(seq):
                qualified.append((current_site,s))
                next_s=seq[pos+1] if pos+1<len(seq) else None
                if current_site=='ricardone' and s=='S3' and next_s=='S0':current_site='san_lorenzo'
                elif current_site=='san_lorenzo' and s=='S7' and next_s=='S0':current_site='ricardone'
            k=0
            for s in qualified:
                if k<len(ss) and s==ss[k]:k+=1
            if k==len(ss):out.append(code);break
    return sorted(set(out))
cut=pd.Timestamp('2026-09-27')
groups=defaultdict(list)
for i,r in enumerate(rows):
    if r['anchor']:groups[r['p']].append(i)
legs=defaultdict(list)
for g in groups.values():
    a=[i for i in g if rows[i]['t']<cut]
    for i,j in zip(a,a[1:]):
        dt=times[j]-times[i]
        if node(i) and node(j) and node(i)!=node(j) and side(i)==side(j) and 0<dt<=21600 and codes([i,j]):
            legs[(node(i),node(j),side(i))].append(dt)
limits={k:(max(0,float(np.quantile(v,.01))-60),float(np.quantile(v,.99))+60,len(v)) for k,v in legs.items() if len(v)>=3}
totals=Counter()
for (a,b,side_),v in limits.items():totals[(a,side_)]+=v[2]
def path_prior(path):
    value=1.
    for a,b in zip(path,path[1:]):
        key=(node(a),node(b),side(a));value*=limits[key][2]/totals[(node(a),side(a))]
    return value
idx=defaultdict(list)
for i,r in enumerate(rows):
    s=signature(r)
    if s and node(i):idx[(s,side(i))].append(i)
itimes={k:[times[i] for i in v] for k,v in idx.items()}
def edge(i,j):
    rule=limits.get((node(i),node(j),side(i)))
    return rule and side(i)==side(j) and rule[0]<=times[j]-times[i]<=rule[1]
def solve(a,b):
    s=signature(rows[a])
    if not s or s!=signature(rows[b]):return [],False,'atributos_anclas_incompletos_o_distintos'
    key=(s,side(a))
    if side(a)!=side(b):return [],False,'vistas_incompatibles'
    candidates=idx[key][bisect.bisect_right(itimes[key],times[a]):bisect.bisect_left(itimes[key],times[b])]
    candidates=[i for i in candidates if node(i) not in (node(a),node(b))]
    if len(candidates)>150:return [],True,'demasiados_candidatos'
    allidx=[a]+candidates+[b];adj={i:[] for i in allidx}
    for pos,i in enumerate(allidx):
        for j in allidx[pos+1:]:
            if edge(i,j):adj[i].append(j)
    paths=[];budget=[0];overflow=[False]
    def walk(path):
        budget[0]+=1
        if budget[0]>30000 or len(paths)>=1000:overflow[0]=True;return
        i=path[-1]
        if i==b:
            if len(path)>2 and codes(path):paths.append(path)
            return
        if len(path)>10:return
        for j in adj[i]:
            if j==b and len(path)==1:continue
            walk(path+[j])
    walk([a])
    return paths,overflow[0],'evaluado'
tests=[];real=[];deductions=[]
for plate,g in groups.items():
    ev=[i for i in g if rows[i]['t']>=cut]
    # Hide one or two strong readings strictly between equal-plate anchors.
    for step in (2,3):
        for k in range(len(ev)-step):
            a,b=ev[k],ev[k+step];hidden=ev[k+1:k+step]
            if not 0<times[b]-times[a]<=21600 or node(a)==node(b):continue
            if any(node(i) in (node(a),node(b)) for i in hidden):continue
            paths,overflow,reason=solve(a,b)
            # The location of a misread capture is known even when its plate is hidden.
            # Require every requested gap point; do not substitute another route's points.
            required_nodes={node(i) for i in hidden}
            paths=[path for path in paths if required_nodes.issubset({node(i) for i in path[1:-1]})]
            unique=len(paths)==1 and not overflow
            path=paths[0] if unique else []
            tests.append({'anchor_plate':plate,'start_excel_row':rows[a]['excel_row'],'end_excel_row':rows[b]['excel_row'],
              'hidden_count':len(hidden),'paths':len(paths),'overflow':overflow,'reason':reason,'unique_chain':unique,
              'recovers_hidden':unique and all(i in path for i in hidden),
              'all_middle_ocr_agrees':unique and all(rows[i]['p']==plate for i in path[1:-1]),
              'transition_frequency_product':path_prior(path) if unique else None,
              'path_excel_rows':';'.join(str(rows[i]['excel_row']) for i in path)})
    # Real gaps: consecutive strong OCR anchors; inspect weaker/misread interior captures.
    for a,b in zip(ev,ev[1:]):
        if not 0<times[b]-times[a]<=21600 or node(a)==node(b):continue
        paths,overflow,reason=solve(a,b);unique=len(paths)==1 and not overflow
        ranked=sorted([path_prior(path) for path in paths],reverse=True)
        real.append({'plate':plate,'start_row':rows[a]['excel_row'],'end_row':rows[b]['excel_row'],'paths':len(paths),'unique':unique,'reason':reason,
          'best_transition_frequency_product':ranked[0] if ranked else None,'second_transition_frequency_product':ranked[1] if len(ranked)>1 else None})
        # For real gaps, check uniqueness at each observed interior point.
        point_paths=defaultdict(list)
        if not overflow:
            for path in paths:
                for n in {node(i) for i in path[1:-1]}:point_paths[n].append(path)
        accepted=[]
        for n,pp in point_paths.items():
            if len(pp)==1:accepted.append((n,pp[0]))
        seen=set()
        for required_node,path in accepted:
            for i in path[1:-1]:
                if node(i)!=required_node or i in seen:continue
                seen.add(i)
                r=rows[i]
                deductions.append({'excel_row':r['excel_row'],'camera':r['Device Name'],'time':str(r['t']),
                 'plate_original':r['Plate No.'],'plate_deduced':plate,'color':r['Vehicle Color'],'brand':r['Vehicle Brand'],
                 'category':r['Vehicle Category'],'anchor_start_row':rows[a]['excel_row'],'anchor_end_row':rows[b]['excel_row'],
                 'original_ocr_confidence':r['conf'],'strong_ocr_contradiction':bool(r['anchor'] and r['p']!=plate),
                 'transition_frequency_product':path_prior(path),
                 'compatible_circuits':';'.join(codes(path)),'path_rows':';'.join(str(rows[j]['excel_row']) for j in path),
                 'status':'CONTRADICCION_OCR_FUERTE' if r['anchor'] and r['p']!=plate else 'DEDUCIDO_PENDIENTE_VALIDACION'})
t=pd.DataFrame(tests);q=pd.DataFrame(deductions)
if len(q):
    conflicts=q.groupby('excel_row').plate_deduced.nunique();q['identity_conflict']=q.excel_row.map(conflicts)>1
t.to_csv(P/'prueba_entre_anclas.csv',index=False,encoding='utf-8-sig')
q.to_csv(P/'deducciones_entre_anclas.csv',index=False,encoding='utf-8-sig')
pd.DataFrame(real).to_csv(P/'intervalos_entre_anclas.csv',index=False,encoding='utf-8-sig')
bycamera=[]
for camera,g in d.groupby('Device Name'):
    v=q[q.camera==camera] if len(q) else q
    bycamera.append({'camera':camera,'captures':len(g),'deduced_captures':int(v.excel_row.nunique()) if len(v) else 0})
summary={'training':'24–26 septiembre 2026','evaluation':'27–30 septiembre 2026','graph_edges':len(limits),
 'test_intervals':len(t),'test_reasons':dict(Counter(t.reason)) if len(t) else {},
 'test_unique_chains':int(t.unique_chain.sum()) if len(t) else 0,
 'test_hidden_recovered':int(t.recovers_hidden.sum()) if len(t) else 0,
 'test_all_middle_correct':int(t.all_middle_ocr_agrees.sum()) if len(t) else 0,
 'real_intervals':len(real),'real_unique_chains':sum(r['unique'] for r in real),
 'real_deduced_captures':int(q.excel_row.nunique()) if len(q) else 0,
 'real_changed_plate_captures':int(q[q.plate_original!=q.plate_deduced].excel_row.nunique()) if len(q) else 0,
 'conflicted_captures':int(q[q.identity_conflict].excel_row.nunique()) if len(q) else 0,'per_camera':bycamera,
 'strong_ocr_contradictions':int(q[q.strong_ocr_contradiction].excel_row.nunique()) if len(q) else 0,
 'caveat':'Prueba condicional a extremos OCR correctos, no identidad auditada. Igualdad estricta de color/marca/categoria conocidos. Grafo empirico dirigido, tiempos p01–p99 ±60s, rutas del catalogo compatibles; no probabilidades calibradas ni asignacion global uno a uno. No se considera camino directo sin capturas intermedias: unicidad condicionada a existencia de una cadena observada intermedia. Datos traseros separados de delanteros.'}
(P/'anclas_resultado.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k!='per_camera'},ensure_ascii=False))
