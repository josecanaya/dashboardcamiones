"""Probabilidades del modelo de nodos desde el histórico: prior de circuito y transición nodo→nodo."""
import json
from pathlib import Path
from collections import Counter,defaultdict
import pandas as pd
P=Path(__file__).parent;R=P.parents[1]
mod=json.loads((R/'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json').read_text(encoding='utf-8-sig'))
edges={(e['from'],e['to']) for e in mod['edges']+mod['optEdges']}
circ=Counter()
for w in ['2026-09-21_2026-09-27','2026-09-28_2026-10-04']:
    j=json.loads((P/f'{w}_circuit_timing_journeys.json').read_text(encoding='utf-8-sig'))
    print(w,'total',j['total'],'filas',len(j['rows']))
    circ.update(r['executive_circuit_code'] for r in j['rows'] if r['executive_status']=='VALIDO')
n=sum(circ.values());prior={k:round(v/n,4) for k,v in circ.most_common()}
print('prior circuito',list(prior.items())[:10])
m=json.loads((P/'mapping.json').read_text(encoding='utf-8-sig'))['devices']
d=pd.read_excel(P/'inputs/VehicleCaptureRecord202610021644394118890.xlsx').fillna('')
d['t']=pd.to_datetime(d['Capture Time']);d=d.sort_values('t')
d['p']=d['Plate No.'].astype(str).str.upper()
d['conf']=pd.to_numeric(d['Confidence Level'],errors='coerce').fillna(0)
d['node']=d['Device Name'].map(lambda x:m.get(x,{}).get('node_id'))
d=d[d.node.notna()&(d.conf>=80)&d.p.str.fullmatch(r'[A-Z]{3}\d{3}|[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d[A-Z]\d{2}')]
T=defaultdict(Counter);dts=defaultdict(list);fuera=Counter()
for p,g in d.groupby('p'):
    prev=None
    for _,r in g.iterrows():
        if prev is not None and r.node!=prev.node:
            dt=(r.t-prev.t).total_seconds()/60
            if 0<dt<=360:
                T[prev.node][r.node]+=1;dts[(prev.node,r.node)].append(dt)
                if (prev.node,r.node) not in edges: fuera[(prev.node,r.node)]+=1
        prev=r
rows=[]
for a,c in T.items():
    s=sum(c.values())
    for b,k in c.most_common():
        x=pd.Series(dts[(a,b)])
        rows.append(dict(desde=a,hacia=b,n=k,p=round(k/s,3),en_modelo=(a,b) in edges,mediana_min=round(x.median(),1),p10=round(x.quantile(.1),1),p90=round(x.quantile(.9),1)))
t=pd.DataFrame(rows).sort_values(['desde','p'],ascending=[True,False])
t.to_csv(P/'transiciones_nodos.csv',index=False,encoding='utf-8-sig')
json.dump(prior,open(P/'prior_circuitos.json','w'),indent=1)
print('transiciones',len(t),'pasos',int(t.n.sum()),'fuera del modelo',round(t[~t.en_modelo].n.sum()/t.n.sum(),3))
pd.set_option('display.width',250)
for a in ['ricardone:Pre ingreso','ricardone:Calada','ricardone:Egreso']:
    print(t[t.desde==a].head(5).to_string(index=False))
print(t[~t.en_modelo].sort_values('n',ascending=False).head(8).to_string(index=False))
print(sorted({x['label'] for x in mod['nodes']}))
