"""Soja que se mueve de Ricardone a San Lorenzo (R7): cartas de soja con destino al puerto (planta 25567) cuyo camión el
vínculo de lecturas (scripts/vinculo/cobertura.mjs) vio en la calada de Ricardone y después en el puerto. Se separa de la
soja que va directo al puerto. Día = día operativo (22 h) de la calada en Ricardone (o del ingreso al puerto si no pasó).
Tramos (min) por cámaras, primera lectura de cada nodo en orden: Playa 1 (Pre ingreso → Calada), Ricardone (Calada →
Salida 2), interplanta (Salida 2 → Ingreso SL), Playa OSL (Ingreso SL → Balanza Ingreso), descarga (Balanza Ingreso →
Volcables), salida (Volcables → Egreso SL).
Uso: python scripts/estado-planta/soja-ric-sl.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.json>
"""
import json, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
VIC = '30500959629'
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
cartas = {x['ctg']: x for x in json.load(open(CF, encoding='utf-8'))
          if x['typeCode'] == 74 and x.get('grain') == 'Soja' and x['plant'] == '25567' and x.get('destCuit') == VIC and x.get('stateCode') != 'AN'}
V = json.load(open(VF, encoding='utf-8'))
TR = [('playa1', 'ricardone:Pre ingreso', 'ricardone:Calada'), ('ricardone', 'ricardone:Calada', 'ricardone:Salida 2'),
      ('interplanta', 'ricardone:Salida 2', 'san_lorenzo:Ingreso'), ('playaOsl', 'san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso'),
      ('descarga', 'san_lorenzo:Balanza Ingreso', 'san_lorenzo:Plataformas Volcables'), ('salida', 'san_lorenzo:Plataformas Volcables', 'san_lorenzo:Egreso')]
viajes = []
for t in V['camiones']:
    c = cartas.get(t['ctg'])
    if not c: continue
    n = {}
    for l in sorted(t['lecturas'], key=lambda l: l['at']): n.setdefault(l['nodo'], H(l['hora'], l['at'][:4]))
    via = 'ricardone:Calada' in n and any(k.startswith('san_lorenzo') for k in n)
    dia = od(n['ricardone:Calada']) if 'ricardone:Calada' in n else od(n['san_lorenzo:Ingreso']) if 'san_lorenzo:Ingreso' in n else od(loc(c['departure']))
    if not (D0 <= dia <= D1): continue
    v = {'ctg': c['ctg'], 'patente': t['plate'], 'dia': dia, 'via': 'Ricardone' if via else ('directo al puerto' if any(k.startswith('san_lorenzo') for k in n) else 'sin lecturas'),
         't': ((c.get('grossKg') or 0) - (c.get('tareKg') or 0)) / 1000}
    for k, a, b in TR:
        x = (n[b] - n[a]).total_seconds() / 60 if a in n and b in n else None
        v[k] = x if x is not None and 0 <= x <= 24 * 60 else None
    v['total'] = (n['san_lorenzo:Egreso'] - n.get('ricardone:Ingreso', n.get('ricardone:Pre ingreso'))).total_seconds() / 60 if via and 'san_lorenzo:Egreso' in n and ('ricardone:Ingreso' in n or 'ricardone:Pre ingreso' in n) else None
    if v['total'] is not None and not (0 < v['total'] <= 36 * 60): v['total'] = None
    viajes.append(v)
agg = lambda vs, k: ({'media': round(st.mean(z)), 'mediana': round(st.median(z)), 'n': len(z)} if (z := [x[k] for x in vs if x[k] is not None]) else None)
dias = []
x = dt.date.fromisoformat(D0)
while x.isoformat() <= D1: dias.append(x.isoformat()); x += dt.timedelta(days=1)
R7 = [v for v in viajes if v['via'] == 'Ricardone']
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(),
       'cartas': len(viajes), 'porVia': dict(collections.Counter(v['via'] for v in viajes)),
       'toneladas': {k: round(sum(v['t'] for v in viajes if v['via'] == k)) for k in {v['via'] for v in viajes}},
       'camiones': len({v['patente'] for v in R7}),
       'tramos': {k: agg(R7, k) for k, _, _ in TR + [('total', 0, 0)]},
       'porDia': {d: {'viaRicardone': sum(1 for v in R7 if v['dia'] == d), 'directo': sum(1 for v in viajes if v['dia'] == d and v['via'] == 'directo al puerto'),
                      't': round(sum(v['t'] for v in R7 if v['dia'] == d)), 'tramos': {k: agg([v for v in R7 if v['dia'] == d], k) for k, _, _ in TR + [('total', 0, 0)]}} for d in dias}}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('cartas de soja al puerto', out['cartas'], out['porVia'], 't', out['toneladas'], 'camiones R7', out['camiones'])
print('tramos (media/mediana/n):', {k: (v['media'], v['mediana'], v['n']) if v else None for k, v in out['tramos'].items()})
for d, v in out['porDia'].items(): print(d, 'vía Ricardone', v['viaRicardone'], 'directo', v['directo'], 't', v['t'], 'total', (v['tramos']['total'] or {}).get('media'))
