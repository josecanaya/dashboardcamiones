"""Cuánto se mantiene cada atributo del mismo camión entre cámaras distintas
y cuánto distingue frente a otro camión en el mismo lugar/hora. Sin modificar fuentes."""
import json,math,random
from pathlib import Path
import pandas as pd, numpy as np
P=Path(__file__).parent;random.seed(1)
d=pd.read_excel(P/'inputs/VehicleCaptureRecord202610021644394118890.xlsx').fillna('')
m=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
d['t']=pd.to_datetime(d['Capture Time']);d=d.sort_values('t').reset_index(drop=True)
d['p']=d['Plate No.'].astype(str).str.upper().str.replace(r'[^A-Z0-9]','',regex=True)
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
d['node']=d['Device Name'].map(lambda x:m.get(x,{}).get('node_id'))
d['rear']=d['Device Name'].map(lambda x:m.get(x,{}).get('rear',False))
d=d[d.node.notna()&~d.rear].copy()
d['anchor']=d.p.str.fullmatch(r'[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2}')&(d.conf>=80)
BAD={'','Unknown','Unrecognized'}
TRUCK={'Large Truck','Medium Truck','Small Truck'}
d['tipo']=d['Vehicle Category'].map(lambda c:'' if c in BAD else ('CAMION' if c in TRUCK else 'OTRO'))
d['color']=d['Vehicle Color'];d['marca']=d['Vehicle Brand']
A=d[d.anchor].reset_index(drop=True)
# ráfagas: misma patente, misma cámara, <5 min
A['burst']=(A.groupby(['p','Device Name']).t.diff().dt.total_seconds().fillna(1e9)>=300).groupby([A.p,A['Device Name']]).cumsum()
first=A.groupby(['p','Device Name','burst']).head(1)
same=[];
for p,g in first.groupby('p'):
    g=g.sort_values('t')
    for (_,a),(_,b) in zip(g.iterrows(),list(g.iterrows())[1:]):
        dt=(b.t-a.t).total_seconds()
        if a.node!=b.node and 60<=dt<=6*3600: same.append((a,b))
bycam={k:v for k,v in first.groupby('Device Name')}
rows=[]
for a,b in same:
    pool=bycam[b['Device Name']];pool=pool[(abs((pool.t-b.t).dt.total_seconds())<=900)&(pool.p!=a.p)]
    o=pool.sample(1,random_state=random.randint(0,10**6)).iloc[0] if len(pool) else None
    for f in ['color','marca','tipo']:
        if a[f] in BAD or b[f] in BAD: rows.append((f,'same',None,a[f],a['Device Name'],b['Device Name']))
        else: rows.append((f,'same',a[f]==b[f],a[f],a['Device Name'],b['Device Name']))
        if o is not None:
            rows.append((f,'diff',None if (a[f] in BAD or o[f] in BAD) else a[f]==o[f],a[f],a['Device Name'],b['Device Name']))
r=pd.DataFrame(rows,columns=['attr','pair','match','valor','camA','camB'])
r['match']=pd.to_numeric(r.match.map({True:1.0,False:0.0}));print('pares mismo camion entre camaras:',len(same))
out={}
for f in ['color','marca','tipo']:
    s=r[(r.attr==f)&(r.pair=='same')];o=r[(r.attr==f)&(r.pair=='diff')]
    ks,ko=s.match.dropna(),o.match.dropna()
    ps,po=ks.mean(),ko.mean()
    lr_m=ps/po;lr_x=(1-ps)/(1-po)
    info=ps*math.log(lr_m)+(1-ps)*math.log(lr_x)  # KL aprox: poder de distinción
    out[f]=dict(disponible=round(len(ks)/len(s),3),coincide_mismo=round(ps,3),coincide_otro=round(po,3),
                LR_si_coincide=round(lr_m,2),LR_si_no=round(lr_x,3),info=round(info,3))
    print(f,out[f])
# color por valor
s=r[(r.attr=='color')];
cv=s.dropna(subset=['match']).groupby(['valor','pair']).match.mean().unstack()
cv['n']=s[s.pair=='same'].dropna(subset=['match']).groupby('valor').size();cv['LR']=cv['same']/cv['diff']
print(cv.sort_values('n',ascending=False).head(10).round(2))
mv=r[r.attr=='marca'].dropna(subset=['match']).groupby(['valor','pair']).match.mean().unstack()
mv['n']=r[(r.attr=='marca')&(r.pair=='same')].dropna(subset=['match']).groupby('valor').size();mv['LR']=mv['same']/mv['diff']
print(mv.sort_values('n',ascending=False).head(8).round(2))
# fiabilidad por cámara destino (coincidencia mismo camión)
cam=r[r.pair=='same'].dropna(subset=['match']).groupby(['camB','attr']).match.agg(['mean','size']).unstack()
cam.to_csv(P/'fiabilidad_atributos_por_camara.csv')
print(cam['mean'].round(2).sort_values('marca').head(8))
# ráfagas por cámara
b=A.groupby(['p','Device Name','burst']).size();print('capturas por paso (media):',round(b.mean(),2))
print(b.groupby(level=1).mean().sort_values(ascending=False).head(6).round(2))
# patente: conf de lecturas no-ancla
print('lecturas no validas:',int((~d.anchor).sum()),'de',len(d),' conf mediana',d[~d.anchor].conf.median())
tot=sum(v['info'] for v in out.values())
print('peso relativo atributos (por info):',{k:round(v['info']/tot,2) for k,v in out.items()})
json.dump(out,open(P/'atributos_entre_camaras.json','w'),indent=1)
# color: día vs noche (hora de la cámara destino)
s=r[(r.attr=='color')&(r.pair=='same')].copy()
