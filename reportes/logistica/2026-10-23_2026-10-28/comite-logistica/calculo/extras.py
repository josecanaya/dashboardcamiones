import json,sys,collections,statistics as st,datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
S=sys.argv[1]; P=json.load(open(S+'/permanencia.json',encoding='utf-8'))
A,B=P['viajesAct'],P['viajesAnt']
def g(V):
  d=collections.defaultdict(list)
  for v in V: d[(v['planta'],v['familia'],v['operacion'])].append(v['min'])
  return d
GA,GB=g(A),g(B); W=sum(len(GB[k]) for k in GB if k in GA)
print('contribucion tiempos (Δprom × peso ant):')
for k in sorted([k for k in GB if k in GA],key=lambda k:-abs((st.mean(GA[k])-st.mean(GB[k]))*len(GB[k])/W)):
  print(f"  {' · '.join(k):60} {(st.mean(GA[k])-st.mean(GB[k]))*len(GB[k])/W:+6.1f}")
print('contribucion mezcla por grupo ((part act - part ant) × prom act):')
NA,NB=len(A),len(B)
for k in sorted(set(GA)|set(GB),key=lambda k:-len(GA.get(k,[]))):
  pa,pb=len(GA.get(k,[]))/NA,len(GB.get(k,[]))/NB
  print(f"  {' · '.join(k):60} part {pb*100:5.1f}->{pa*100:5.1f}")
# sensibilidad: anterior sin dias 19-20 / solo SGC
for lbl,f in (('sin 19-20',lambda v:v['dia'] not in ('2026-10-19','2026-10-20')),('solo 21-22 SGC',lambda v:v['dia'] in('2026-10-21','2026-10-22')),('solo 16-18 Excel',lambda v:v['dia']<='2026-10-18')):
  x=[v for v in B if f(v)]; s=[v['min'] for v in x if v['familia']=='Soja' and v['operacion']=='Recepción' and v['planta'].startswith('Puerto')]
  print(lbl,len(x),round(st.mean(v['min'] for v in x)),'soja',len(s),round(st.mean(s)))
# soja R7 por dia
for lbl,V in (('act',A),('ant',B)):
  d=collections.defaultdict(list)
  for v in V:
    if v['familia']=='Soja' and v['operacion']=='Recepción' and v['planta'].startswith('Puerto'): d[v['dia']].append(v['min'])
  print(lbl,'soja por dia',{k:(len(x),round(st.mean(x))) for k,x in sorted(d.items())})
  q=collections.defaultdict(list)
  for v in V:
    if v['familia']=='Soja' and v['operacion']=='Recepción' and v['planta'].startswith('Puerto'):
      h=int(v['ingreso'][11:13]); Q='Q1' if h>=22 or h<4 else 'Q2' if h<10 else 'Q3' if h<16 else 'Q4'; q[Q].append(v['min'])
  print(lbl,'soja por cuarto ingreso',{k:(len(x),round(st.mean(x))) for k,x in sorted(q.items())})
  print(lbl,'>24h',[ (v['planta'],v['familia'],v['operacion'],round(v['min'])) for v in V if v['min']>1440])
