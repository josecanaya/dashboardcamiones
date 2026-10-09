"""Árbol de recorridos = estructura del modelo de nodos (circuitos) × peso histórico de viajes por circuito.
Las lecturas de cámara NO dan los pesos. P(siguiente | camino visto) sale de los circuitos compatibles."""
import json
from pathlib import Path
from collections import Counter,defaultdict
import pandas as pd
P=Path(__file__).parent;R=P.parents[1]
mod=json.loads((R/'docs/propuesta-en-vivo/modelo-nodos-nodo-sur/datos/modelo_nodo_sur.json').read_text(encoding='utf-8-sig'))
prior=json.loads((P/'prior_circuitos_historico.json').read_text(encoding='utf-8'))['prior']
short=lambda n:('R:' if n.startswith('ricardone') else 'SL:')+n.split(':',1)[1]
cam={n['id']:n['hasCamera'] for n in mod['nodes']}
EPS=0.002  # circuito existente sin viajes en el histórico
circ={c['id']:[short(n) for n in c['seq']] for c in mod['circuits']}
w={k:prior.get(k,0)+EPS for k in circ}; s=sum(w.values()); w={k:v/s for k,v in w.items()}
def sub(seq,h):  # h es subsecuencia ordenada de seq → posición del último
    i=0
    for j,x in enumerate(seq):
        if i<len(h) and x==h[i]:
            i+=1
            if i==len(h): return j
    return None
def siguiente(h):
    pc=Counter();nx=Counter()
    for k,seq in circ.items():
        j=sub(seq,h)
        if j is None: continue
        pc[k]+=w[k]; nx[seq[j+1] if j+1<len(seq) else 'FIN']+=w[k]
    t=sum(pc.values()) or 1
    return {k:v/t for k,v in pc.most_common()},{k:v/t for k,v in nx.most_common()}
rows=[]
for k,seq in circ.items():
    for a in range(len(seq)):
        for b in range(a+1,len(seq)+1):
            h=tuple(seq[a:b]); pc,nx=siguiente(h)
            for n,p in list(nx.items())[:5]:
                rows.append(dict(camino=' > '.join(h),largo=len(h),siguiente=n,p=round(p,4),circuito_top=next(iter(pc)),p_circuito=round(next(iter(pc.values())),4)))
t=pd.DataFrame(rows).drop_duplicates(['camino','siguiente']).sort_values(['largo','camino','p'],ascending=[True,True,False])
t.to_csv(P/'arbol_modelo_nodos.csv',index=False,encoding='utf-8-sig')
print('circuitos',len(circ),'caminos',t.camino.nunique())
print('circuitos con peso:',{k:round(v,3) for k,v in sorted(w.items(),key=lambda x:-x[1])[:8]})
print('R7:',' > '.join(circ['R7']))
for h in [('R:Pre ingreso',),('R:Pre ingreso','R:Calada'),('R:Pre ingreso','R:Calada','R:Egreso'),('R:Calada','SL:Ingreso')]:
    pc,nx=siguiente(h)
    print('\n',' > '.join(h));print('  circuito:',{k:round(v,3) for k,v in list(pc.items())[:4]});print('  siguiente:',{k:round(v,3) for k,v in list(nx.items())[:4]})

# próxima cámara: salta nodos sin cámara (Playa 1, Salida 1…)
camS={short(k):v for k,v in cam.items()}
def proxima_camara(h):
    pc=Counter();nx=Counter()
    for k,seq in circ.items():
        j=sub(seq,h)
        if j is None: continue
        pc[k]+=w[k];rest=[x for x in seq[j+1:] if camS.get(x)]
        nx[rest[0] if rest else 'FIN']+=w[k]
    t=sum(pc.values()) or 1
    return {k:round(v/t,3) for k,v in pc.most_common(4)},{k:round(v/t,3) for k,v in nx.most_common(4)}
print('\n--- ejemplo AAA000 ---')
for h in [('R:Pre ingreso',),('R:Pre ingreso','R:Calada'),('R:Pre ingreso','R:Calada','SL:Ingreso')]:
    print(' > '.join(h),'| circuito',proxima_camara(h)[0],'| próxima cámara',proxima_camara(h)[1])
print('nodos sin cámara:',[k for k,v in camS.items() if not v])
