"""Peso de cada circuito = viajes clasificados (final_circuits.executive_circuit_code) en todas las
semanas calendario lunes→domingo desde junio. Ventanas ad-hoc solapadas se ignoran."""
import json,datetime as dt
from pathlib import Path
from collections import Counter
R=Path(__file__).parents[2];W=R/'runs/windows';O=Path(__file__).parent
tot=Counter();sem={}
for w in sorted(W.iterdir()):
    try: a,b=[dt.date.fromisoformat(x) for x in w.name.split('_')]
    except Exception: continue
    if a<dt.date(2026,6,1) or a.weekday()!=0 or (b-a).days!=6: continue
    f=w/'tables/final_circuits.json'
    if not f.exists(): continue
    rows=json.loads(f.read_text(encoding='utf-8-sig'))['rows']
    c=Counter(r.get('executive_circuit_code') or 'SIN_CIRCUITO' for r in rows if r.get('executive_bucket')!='DESCARTADO')
    sem[w.name]=dict(c);tot.update(c)
valid={k:v for k,v in tot.items() if k and k[0] in 'RS' and k!='SIN_CIRCUITO' and not k.startswith('SIN')}
n=sum(valid.values())
prior={k:round(v/n,5) for k,v in sorted(valid.items(),key=lambda x:-x[1])}
json.dump(dict(semanas=list(sem),viajes=n,prior=prior,por_semana=sem),open(O/'prior_circuitos_historico.json','w',encoding='utf-8'),indent=1,ensure_ascii=False)
print('semanas',len(sem),list(sem)[0],'→',list(sem)[-1],'viajes',n)
print('excluidos',{k:v for k,v in tot.items() if k not in valid})
print(list(prior.items())[:20])
