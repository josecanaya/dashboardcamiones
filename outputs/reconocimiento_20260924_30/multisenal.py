"""Reconstrucción multiseñal entre anclas. Sin modificar fuentes.
Ranking aprendido con referencia OCR, evaluación cronológica y simulaciones explícitas.
"""
import argparse,json,math,bisect,hashlib
from pathlib import Path
from collections import defaultdict,Counter
import numpy as np
import pandas as pd
from rapidfuzz.distance import Levenshtein
P=Path(__file__).parent
ap=argparse.ArgumentParser();ap.add_argument('xlsx');args=ap.parse_args()
d=pd.read_excel(args.xlsx).fillna('');d['excel_row']=np.arange(2,len(d)+2)
d['t']=pd.to_datetime(d['Capture Time']);d=d.sort_values('t').reset_index(drop=True)
d['p']=d['Plate No.'].astype(str).str.upper().str.replace(r'[^A-Z0-9]','',regex=True)
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
d['anchor']=d.p.str.match(r'^(?:[A-Z]{3}[0-9]{3}|[A-Z]{2}[0-9]{3}[A-Z]{2}|[A-Z]{3}[0-9][A-Z][0-9]{2})$')&(d.conf>=80)
m=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
catalog=json.loads((P/'circuit_catalog.json').read_text(encoding='utf-8-sig'))['catalog']
rows=d.to_dict('records');ts=np.array([r['t'].timestamp() for r in rows])
def meta(i):return m.get(rows[i]['Device Name'],{})
def node(i):return meta(i).get('node_id')
def side(i):return bool(meta(i).get('rear',False))
def qual(i):return (meta(i).get('site'),str(meta(i).get('sector','')).split('-')[-1])
qualified=[]
for code,c in catalog.items():
    for seq in [c.get('baseSequence',[])]+c.get('allowedSequences',[]):
        site='san_lorenzo' if code.startswith('SL') else 'ricardone';q=[]
        for k,s in enumerate(seq):
            q.append((site,s));nxt=seq[k+1] if k+1<len(seq) else None
            if site=='ricardone' and s=='S3' and nxt=='S0':site='san_lorenzo'
            elif site=='san_lorenzo' and s=='S7' and nxt=='S0':site='ricardone'
        qualified.append((code,q))
routecache={}
def route(a,c,b):
    key=(qual(a),qual(c),qual(b))
    if key not in routecache:
        found=[]
        for code,seq in qualified:
            k=0
            for s in seq:
                if k<3 and s==key[k]:k+=1
            if k==3:found.append(code)
        routecache[key]=sorted(set(found))
    return routecache[key]
groups=defaultdict(list);idx=defaultdict(list)
for i,r in enumerate(rows):
    if r['anchor']:groups[(r['p'],side(i))].append(i)
    if node(i):idx[(node(i),side(i))].append(i)
itimes={k:ts[v].tolist() for k,v in idx.items()}
cut=pd.Timestamp('2026-09-26');testcut=pd.Timestamp('2026-09-27')
legs=defaultdict(list);attrs=defaultdict(Counter)
for (plate,view),g in groups.items():
    gg=[i for i in g if rows[i]['t']<cut]
    for a,b in zip(gg,gg[1:]):
        dt=ts[b]-ts[a]
        if node(a) and node(b) and node(a)!=node(b) and 0<dt<=21600:
            legs[(node(a),node(b),view)].append(dt)
        for f in ['Vehicle Color','Vehicle Brand','Vehicle Category']:
            if rows[a][f] not in ('','Unknown','Unrecognized') and rows[b][f] not in ('','Unknown','Unrecognized'):
                attrs[(rows[a]['Device Name'],rows[b]['Device Name'],f)][rows[a][f]==rows[b][f]]+=1
stats={k:(len(v),float(np.median(v)),float(np.quantile(v,.05)),float(np.quantile(v,.95))) for k,v in legs.items() if len(v)>=3}
nodes=sorted({n for a,b,v in stats for n in (a,b)});ni={n:i for i,n in enumerate(nodes)}
medgraphs={};mingraphs={};priorgraphs={}
for view in (False,True):
    size=len(nodes);med=np.full((size,size),np.inf);low=med.copy();prior=med.copy();np.fill_diagonal(med,0);np.fill_diagonal(low,0);np.fill_diagonal(prior,0)
    totals=Counter()
    for (a,b,v),s in stats.items():
        if v==view:totals[a]+=s[0]
    for (a,b,v),s in stats.items():
        if v==view:
            med[ni[a],ni[b]]=s[1];low[ni[a],ni[b]]=max(0,s[2]-60);prior[ni[a],ni[b]]=-math.log(s[0]/totals[a])
    for k in range(size):
        med=np.minimum(med,med[:,k,None]+med[None,k,:]);low=np.minimum(low,low[:,k,None]+low[None,k,:]);prior=np.minimum(prior,prior[:,k,None]+prior[None,k,:])
    medgraphs[view]=med;mingraphs[view]=low;priorgraphs[view]=prior
def graph(a,b,dt):
    na,nb=node(a),node(b);view=side(a)
    if na not in ni or nb not in ni:return [0,0,0,0,0]
    expected=medgraphs[view][ni[na],ni[nb]];minimum=mingraphs[view][ni[na],ni[nb]];pr=priorgraphs[view][ni[na],ni[nb]]
    if not np.isfinite(expected):return [0,0,0,0,0]
    direct=stats.get((na,nb,view));closeness=math.exp(-abs(math.log((dt+30)/(expected+30))))
    in_range=int(direct is not None and max(0,direct[2]-60)<=dt<=direct[3]+60)
    return [1,closeness,in_range,int(dt>=minimum),math.exp(-pr) if np.isfinite(pr) else 0]
known=lambda x:x not in ('','Unknown','Unrecognized')
def agree(x,y):return float(x==y) if known(x) and known(y) else 0.
def reliability(a,b,f):
    z=attrs.get((rows[a]['Device Name'],rows[b]['Device Name'],f),Counter());n=sum(z.values())
    return (z[True]+1)/(n+2) if n>=3 else .5
FEATURES=['color_left','color_right','color_anchor_agree','color_known','color_camera_reliability',
 'brand_left','brand_right','brand_anchor_agree','brand_known','brand_camera_reliability',
 'category_left','category_right','category_anchor_agree','category_known','category_camera_reliability',
 'time_left_log','time_right_log','interval_log','time_fraction',
 'graph_left_reachable','time_left_fit','time_left_direct_range','time_left_feasible','graph_left_frequency',
 'graph_right_reachable','time_right_fit','time_right_direct_range','time_right_feasible','graph_right_frequency',
 'speed_left_similarity','speed_right_similarity','speed_stationary','lane_left_equal','lane_right_equal',
 'country_left_equal','country_right_equal','same_site_left','same_site_right','route_options_inverse',
 'ocr_confidence','plate_similarity','plate_same_length','plate_prefix_similarity','plate_suffix_similarity','plate_confusion_similarity','partial_plate_substring']
def corrupt(i):
    p=rows[i]['p'];h=int(hashlib.sha256(str(rows[i]['excel_row']).encode()).hexdigest()[:8],16)
    if not p:return ''
    ch=list(p);abc='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    for k in range(1+(h%2)):
        pos=(h//(k+1))%len(ch);ch[pos]=abc[(abc.find(ch[pos])+1+h%7)%len(abc)]
    return ''.join(ch)
fold=lambda p:p.translate(str.maketrans({'O':'0','Q':'0','I':'1','L':'1','Z':'2','S':'5','B':'8','G':'6'}))
lowconf={camera:group[group.conf<80].conf.to_numpy() for camera,group in d.groupby('Device Name')}
def simconf(i,mode):
    if mode=='empty':return 0.
    values=lowconf.get(rows[i]['Device Name'],[])
    h=int(hashlib.sha256(('conf'+str(rows[i]['excel_row'])).encode()).hexdigest()[:8],16)
    return float(values[h%len(values)]) if len(values) else 40.
def partial(i):
    p=rows[i]['p'];return p[:max(1,len(p)//2)]
def feature(a,c,b,observed,confidence=None):
    ra,rc,rb=rows[a],rows[c],rows[b];v=[]
    for f in ['Vehicle Color','Vehicle Brand','Vehicle Category']:
        v += [agree(rc[f],ra[f]),agree(rc[f],rb[f]),agree(ra[f],rb[f]),float(known(rc[f])),(reliability(a,c,f)+reliability(c,b,f))/2]
    left=ts[c]-ts[a];right=ts[b]-ts[c];total=left+right
    v += [math.log1p(left/60),math.log1p(right/60),math.log1p(total/60),left/total]
    v += graph(a,c,left)+graph(c,b,right)
    speed=lambda r:float(r['Vehicle Speed']) if str(r['Vehicle Speed']).replace('.','',1).isdigit() else 0
    sc,sa,sb=speed(rc),speed(ra),speed(rb)
    v += [math.exp(-abs(sc-sa)/10),math.exp(-abs(sc-sb)/10),float(sc==0),agree(str(rc['Lane No.']),str(ra['Lane No.'])),agree(str(rc['Lane No.']),str(rb['Lane No.'])),
      agree(rc['Place of Issue'],ra['Place of Issue']),agree(rc['Place of Issue'],rb['Place of Issue']),float(meta(a).get('site')==meta(c).get('site')),float(meta(b).get('site')==meta(c).get('site')),1/max(1,len(route(a,c,b)))]
    p=ra['p'];norm=max(len(p),len(observed),1)
    v += [(rc['conf'] if confidence is None else confidence)/100,1-Levenshtein.distance(p,observed)/norm if observed else 0,float(len(p)==len(observed)),
      1-Levenshtein.distance(p[:2],observed[:2])/2 if observed else 0,1-Levenshtein.distance(p[-2:],observed[-2:])/2 if observed else 0,
      1-Levenshtein.distance(fold(p),fold(observed))/norm if observed else 0,float(bool(observed) and len(observed)>=3 and observed in p)]
    return np.array(v,dtype=float)
def candidates(a,b,targetnode,view):
    key=(targetnode,view);ids=idx.get(key,[]);tt=itimes.get(key,[])
    z=ids[bisect.bisect_right(tt,ts[a]):bisect.bisect_left(tt,ts[b])]
    # Keep all candidates at the observed missing point. No plate/attribute prefilter.
    return [i for i in z if route(a,i,b)]
queries=[];seen=set()
for (plate,view),g in groups.items():
    for step in (2,3):
        for k in range(len(g)-step):
            a,b=g[k],g[k+step]
            if not 0<ts[b]-ts[a]<=21600 or node(a)==node(b) or rows[a]['t'].date()!=rows[b]['t'].date():continue
            split='train' if rows[b]['t']<cut else 'calibration' if rows[b]['t']<testcut else 'test'
            for target in g[k+1:k+step]:
                if not node(target) or node(target) in (node(a),node(b)):continue
                key=(a,b,target)
                if key in seen:continue
                seen.add(key);cc=candidates(a,b,node(target),view)
                queries.append({'a':a,'b':b,'target':target,'split':split,'ids':cc})
print(json.dumps({'phase':'queries','splits':dict(Counter(q['split'] for q in queries)),'graph_edges':len(stats)}),flush=True)
trainx=[];trainy=[];weights=[]
for q in queries:
    if q['split']!='train':continue
    a,b=q['a'],q['b'];plate=rows[a]['p'];eligible=[i for i in q['ids'] if rows[i]['anchor']]
    pos=[i for i in eligible if rows[i]['p']==plate];neg=[i for i in eligible if rows[i]['p']!=plate]
    # Training only uses strong OCR labels; uncertain source rows are not labelled negative.
    if not pos:continue
    for i in pos+neg:
        for mode in ('empty','corrupted','partial'):
            observed='' if mode=='empty' else corrupt(i) if mode=='corrupted' else partial(i)
            trainx.append(feature(a,i,b,observed,simconf(i,mode)));trainy.append(int(rows[i]['p']==plate));weights.append(1/max(1,len(pos) if rows[i]['p']==plate else len(neg)))
X=np.array(trainx);y=np.array(trainy);weights=np.array(weights)
assert len(X) and X.shape[1]==len(FEATURES)
def fit(cols):
    xx=X[:,cols];mu=xx.mean(0);sd=xx.std(0);sd[sd<.01]=1
    xx=np.c_[np.ones(len(xx)),(xx-mu)/sd];beta=np.zeros(xx.shape[1]);penalty=np.eye(len(beta))*.8;penalty[0,0]=0
    for _ in range(18):
        p=1/(1+np.exp(-np.clip(xx@beta,-25,25)));ww=weights*p*(1-p)
        delta=np.linalg.solve(xx.T@(xx*ww[:,None])+penalty,xx.T@(weights*(y-p))-penalty@beta)
        beta+=delta
        if np.max(np.abs(delta))<1e-5:break
    def predict(v):
        z=np.c_[np.ones(len(v)),(np.array(v)[:,cols]-mu)/sd]@beta
        return 1/(1+np.exp(-np.clip(z,-25,25)))
    return predict,{'features':[FEATURES[i] for i in cols],'mean':mu.tolist(),'scale':sd.tolist(),'beta':beta.tolist()}
sets={'atributos':list(range(15)),'atributos_grafo_tiempos':list(range(29)),'multisenal_sin_patente':list(range(40)),'multisenal_ocr_danado':list(range(len(FEATURES))),'multisenal_ocr_parcial':list(range(len(FEATURES)))}
models={};modeldetails={}
for name,cols in sets.items():models[name],modeldetails[name]=fit(cols)
evaluated=[]
for q in queries:
    if q['split']=='train':continue
    a,b,target=q['a'],q['b'],q['target'];ids=q['ids']
    empty=[feature(a,i,b,'',simconf(i,'empty')) for i in ids];bad=[feature(a,i,b,corrupt(i),simconf(i,'corrupted')) for i in ids]
    partialx=[feature(a,i,b,partial(i),simconf(i,'partial')) for i in ids]
    for name,model in models.items():
        vals=model(bad if name=='multisenal_ocr_danado' else partialx if name=='multisenal_ocr_parcial' else empty) if ids else []
        order=sorted(range(len(ids)),key=lambda k:(-vals[k],rows[ids[k]]['excel_row']))
        best=order[0] if order else None;winner=ids[best] if best is not None else None
        evaluated.append({'split':q['split'],'method':name,'start_row':rows[a]['excel_row'],'end_row':rows[b]['excel_row'],'hidden_row':rows[target]['excel_row'],
          'camera':rows[target]['Device Name'],'anchor_plate':rows[a]['p'],'candidates':len(ids),'winner_row':rows[winner]['excel_row'] if winner is not None else '',
          'exact_recovery':winner==target,'ocr_identity_agrees':bool(winner is not None and rows[winner]['p']==rows[a]['p']),
          'score':float(vals[best]) if best is not None else 0,'margin':float(vals[best]-vals[order[1]]) if len(order)>1 else float(vals[best]) if best is not None else 0})
e=pd.DataFrame(evaluated);e.to_csv(P/'comparacion_multisenal.csv',index=False,encoding='utf-8-sig')
comparisons=[];thresholds={}
for name in models:
    cal=e[(e.method==name)&(e.split=='calibration')];test=e[(e.method==name)&(e.split=='test')]
    valid=[]
    for score in (.5,.7,.8,.9,.95,.98):
        for margin in (.05,.1,.2,.3,.5):
            z=cal[(cal.score>=score)&(cal.margin>=margin)&(cal.candidates>0)]
            if len(z)>=20 and z.ocr_identity_agrees.mean()>=.99:valid.append((len(z),score,margin))
    threshold=max(valid) if valid else None;thresholds[name]=threshold
    accepted=test[(test.score>=threshold[1])&(test.margin>=threshold[2])&(test.candidates>0)] if threshold else test.iloc[:0]
    comparisons.append({'method':name,'test_queries':len(test),'with_candidates':int((test.candidates>0).sum()),'exact_recovery':int(test.exact_recovery.sum()),
      'ocr_identity_agrees':int(test.ocr_identity_agrees.sum()),'top1_ocr_precision':float(test[test.candidates>0].ocr_identity_agrees.mean()) if (test.candidates>0).any() else None,
      'calibration_threshold':threshold,'accepted_test':len(accepted),'accepted_correct_ocr':int(accepted.ocr_identity_agrees.sum())})
print(json.dumps({'phase':'validation','comparisons':comparisons},ensure_ascii=True),flush=True)
# Real recovery proposals: two consecutive equal-plate anchors; all intermediate nodes.
real=[];model=models['multisenal_ocr_danado'];limit=thresholds['multisenal_ocr_danado']
for (plate,view),g in groups.items():
    ev=[i for i in g if rows[i]['t']>=testcut]
    for a,b in zip(ev,ev[1:]):
        if not 0<ts[b]-ts[a]<=21600 or node(a)==node(b):continue
        lo=bisect.bisect_right(ts,ts[a]);hi=bisect.bisect_left(ts,ts[b]);nn={node(i) for i in range(lo,hi) if node(i) and node(i) not in (node(a),node(b)) and side(i)==view}
        for n in nn:
            ids=candidates(a,b,n,view)
            if not ids:continue
            xx=[feature(a,i,b,rows[i]['p']) for i in ids];vv=model(xx);order=sorted(range(len(ids)),key=lambda k:(-vv[k],rows[ids[k]]['excel_row']))
            k=order[0];i=ids[k];r=rows[i];score=float(vv[k]);margin=float(vv[k]-vv[order[1]]) if len(order)>1 else score
            if r['p']==plate:continue
            strong=bool(r['anchor'] and r['p']!=plate)
            # Route/time prerequisite stays hard even when ranking attributes are soft.
            gleft=graph(a,i,ts[i]-ts[a]);gright=graph(i,b,ts[b]-ts[i]);supported=bool(gleft[0] and gright[0] and gleft[3] and gright[3])
            passed=bool(limit and score>=limit[1] and margin>=limit[2] and supported and not strong)
            row={'excel_row':r['excel_row'],'camera':r['Device Name'],'time':str(r['t']),'original_plate':r['Plate No.'],'candidate_plate':plate,
              'anchor_start_row':rows[a]['excel_row'],'anchor_end_row':rows[b]['excel_row'],'anchor_start_time':str(rows[a]['t']),'anchor_end_time':str(rows[b]['t']),
              'color':r['Vehicle Color'],'brand':r['Vehicle Brand'],'category':r['Vehicle Category'],'ocr_confidence':r['conf'],'speed':r['Vehicle Speed'],'lane':r['Lane No.'],
              'score':score,'margin':margin,'alternative_capture_count':len(ids)-1,'strong_ocr_conflict':strong,'graph_time_supported':supported,
              'compatible_circuits':';'.join(route(a,i,b)),'threshold_pass':passed}
            row.update({f:float(v) for f,v in zip(FEATURES,xx[k])});real.append(row)
r=pd.DataFrame(real)
if len(r):
    conflicts=r.groupby('excel_row').candidate_plate.nunique();r['different_anchor_identities']=r.excel_row.map(conflicts)
    r['status']=np.where(r.strong_ocr_conflict,'CONTRADICCION_OCR_FUERTE',np.where(r.different_anchor_identities>1,'AMBIGUO_ENTRE_IDENTIDADES',np.where(r.threshold_pass,'SUPERA_FILTRO_VALIDADO_CON_OCR','CANDIDATO_PENDIENTE')))
    r=r.sort_values(['score','margin'],ascending=False)
r.to_csv(P/'cruces_multisenal_detalle.csv',index=False,encoding='utf-8-sig')
bycamera=[]
for c,g in d.groupby('Device Name'):
    z=e[(e.camera==c)&(e.split=='test')&(e.method=='multisenal_ocr_danado')]
    zz=r[r.camera==c] if len(r) else r
    bycamera.append({'camera':c,'captures':len(g),'test_queries':len(z),'exact_recovery':int(z.exact_recovery.sum()),'ocr_identity_agrees':int(z.ocr_identity_agrees.sum()),
      'real_candidate_captures':int(zz.excel_row.nunique()) if len(zz) else 0})
pd.DataFrame(bycamera).to_csv(P/'multisenal_todos_los_puntos.csv',index=False,encoding='utf-8-sig')
summary={'captures':len(d),'training':'24–25/9/2026','calibration':'26/9/2026','test':'27–30/9/2026','signals':len(FEATURES),'feature_names':FEATURES,'graph_edges':len(stats),
 'training_labelled_comparisons':len(X),'training_queries':sum(q['split']=='train' for q in queries),'comparisons':comparisons,
 'real_candidate_captures':int(r.excel_row.nunique()) if len(r) else 0,'real_anchor_conflict_captures':int(r[r.different_anchor_identities>1].excel_row.nunique()) if len(r) else 0,
 'real_strong_ocr_conflicts':int(r[r.strong_ocr_conflict].excel_row.nunique()) if len(r) else 0,'real_status_rows':dict(Counter(r.status)) if len(r) else {},'per_camera':bycamera,
 'limitations':['Verdad de referencia OCR, no imagen auditada.','Puntajes logísticos de ranking, no certeza calibrada de identidad.','Patentes de todas las capturas candidatas se eliminan, se corrompen 1–2 caracteres o se truncan en prueba; no se usan las ocultadas como features.','Confianza simulada: cero para patente ausente; muestra determinista de confianzas<80 de la cámara para OCR dañado/parcial. Esta distribución usa contexto de toda la semana sin etiquetas de identidad; no constituye generalización a semanas futuras.','Anclas condicionadas a OCR>=80 y formato habitual: no demuestra cobertura global.','Grafo y consistencia de cámaras aprendidos sólo 24–25; contrato/circuito del camión no se usa para entrenar ni evaluar.','Se clasifican puntos entre anclas: propuestas de diferentes puntos requieren revisión de la cadena completa, no se implementa asignación global de rutas.','Las cámaras traseras se tratan por separado para evitar asumir unión tractor/remolque.','Modelo de vehículo, dirección explícita e imágenes no disponibles; marca/categoría son etiquetas de cámara.']}
(P/'multisenal_resultado.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
(P/'multisenal_modelos.json').write_text(json.dumps(modeldetails,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in ('per_camera','feature_names')},ensure_ascii=True),flush=True)
