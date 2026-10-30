import json,sys,collections,statistics as st,datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
S=sys.argv[1]; B='C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
ev=collections.defaultdict(list)
for d in range(22,30):
  for r in json.load(open(B+f'truckflow/2026-10-{d:02d}/event-list.json',encoding='utf-8'))['records']:
    t=dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None)+dt.timedelta(minutes=206)
    ev[r['truckPlate']].append((t,r['deviceCode']))
P=json.load(open(S+'/permanencia.json',encoding='utf-8'))
sel=[v for v in P['viajesAct'] if v['planta']=='Ricardone' and v['familia']=='Girasol' and v['operacion']=='Despacho']
off=collections.defaultdict(list); 
SEQ=[('Ingreso',('RicIngCamFrente','RicPreIngInFr')),('Calada',('RicCalLiq',)),('Playa 3',('RicS6Playa3',)),('Carga silo 8',('RicS8CargaLinea1','RicS8CargaLinea2')),('Balanza egreso',('RicB2Egreso','RicB3Egreso')),('Egreso',('RicEgrCamFrente',))]
stg=collections.defaultdict(list); dia=collections.Counter(); cu=collections.Counter(); cam=collections.Counter()
for v in sel:
  i=dt.datetime.fromisoformat(v['ingreso']); s=dt.datetime.fromisoformat(v['salida'])
  dia[v['dia']]+=1; h=i.hour; cu['Q1' if h>=22 or h<4 else 'Q2' if h<10 else 'Q3' if h<16 else 'Q4']+=1; cam[v['patente']]+=1
  rs=[x for x in ev.get(v['patente'],[]) if i-dt.timedelta(minutes=60)<=x[0]<=s+dt.timedelta(minutes=30)]
  first={}
  for name,devs in SEQ:
    ts=[t for t,dv in rs if dv in devs]
    if ts: first[name]=min(ts) if name!='Egreso' else max(ts)
  for name in first: off[name].append((first[name]-i).total_seconds()/60)
  names=[n for n,_ in SEQ]
  for a,b in zip(names,names[1:]):
    if a in first and b in first and first[b]>=first[a]: stg[a+' → '+b].append((first[b]-first[a]).total_seconds()/60)
print('viajes',len(sel),'camiones',len(cam),'prom',round(st.mean(v['min'] for v in sel)),'por dia',dict(sorted(dia.items())),'cuartos',dict(sorted(cu.items())))
print('minutos desde ingreso SGC (mediana, n):',{k:(round(st.median(x)),len(x)) for k,x in off.items()})
print('etapas (media, mediana, n):',{k:(round(st.mean(x)),round(st.median(x)),len(x)) for k,x in stg.items()})
print('viajes por camion top',cam.most_common(5))
