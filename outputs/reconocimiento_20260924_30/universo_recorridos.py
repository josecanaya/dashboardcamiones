"""Universo empírico de recorridos: secuencias de nodos por viaje y árbol de prefijos
con P(siguiente nodo | camino hecho). Solo lecturas confiables (patente válida, conf>=80)."""
import json
from pathlib import Path
from collections import Counter,defaultdict
import pandas as pd
P=Path(__file__).parent
m=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
d=pd.read_excel(P/'inputs/VehicleCaptureRecord202610021644394118890.xlsx').fillna('')
d['t']=pd.to_datetime(d['Capture Time']);d=d.sort_values('t')
d['p']=d['Plate No.'].astype(str).str.upper()
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
d['node']=d['Device Name'].map(lambda x:m.get(x,{}).get('node_id'))
d=d[d.node.notna()&(d.conf>=80)&d.p.str.fullmatch(r'[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2}')]
short=lambda n:('R:' if n.startswith('ricardone') else 'SL:')+n.split(':',1)[1]
CORTE=6*60  # min sin verse = viaje nuevo
viajes=[]
for p,g in d.groupby('p'):
    seq=[];last=None
    for t,n in zip(g.t,g.node):
        if last is not None and (t-last).total_seconds()/60>CORTE:
            viajes.append(tuple(seq));seq=[]
        if not seq or seq[-1]!=short(n): seq.append(short(n))
        last=t
    viajes.append(tuple(seq))
viajes=[v for v in viajes if len(v)>=2]
full=Counter(viajes);N=len(viajes)
print('viajes',N,'recorridos distintos',len(full))
# árbol de prefijos
pref=Counter();nxt=defaultdict(Counter)
for v in viajes:
    for k in range(1,len(v)+1):
        pref[v[:k]]+=1
        nxt[v[:k]][v[k] if k<len(v) else 'FIN']+=1
rows=[]
for h,c in nxt.items():
    tot=sum(c.values())
    for b,k in c.most_common():
        rows.append(dict(largo=len(h),camino=' > '.join(h),siguiente=b,n=k,de=tot,p=round(k/tot,3)))
t=pd.DataFrame(rows).sort_values(['largo','de','n'],ascending=[True,False,False])
t.to_csv(P/'arbol_prefijos_recorridos.csv',index=False,encoding='utf-8-sig')
pd.DataFrame([dict(recorrido=' > '.join(k),n=v,p=round(v/N,4)) for k,v in full.most_common()]).to_csv(P/'universo_recorridos.csv',index=False,encoding='utf-8-sig')
print('cobertura top10/top30',round(sum(v for _,v in full.most_common(10))/N,2),round(sum(v for _,v in full.most_common(30))/N,2))
for k,v in full.most_common(12): print(v,round(v/N,3),' > '.join(k))
pd.set_option('display.width',250);pd.set_option('display.max_colwidth',80)
for h in [('R:Pre ingreso',),('R:Pre ingreso','R:Calada'),('R:Pre ingreso','R:Calada','R:Salida 2'),('R:Calada',)]:
    print('\n',' > '.join(h),'n=',pref[h]);print(t[t.camino==' > '.join(h)][['siguiente','n','p']].head(6).to_string(index=False))
