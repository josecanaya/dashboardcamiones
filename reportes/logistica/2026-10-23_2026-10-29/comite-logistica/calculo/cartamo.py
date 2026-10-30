"""Cártamo 23-29/10: viajes SGC (día operativo del ingreso), cámaras de la patente o acoplado, cruce con cartas."""
import json, sys, collections, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
ev = collections.defaultdict(list)
for d in range(22, 31):
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/event-list.json', encoding='utf-8'))['records']:
        ev[r['truckPlate']].append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), r['deviceCode']))
for v in ev.values(): v.sort()
sg = [x for x in json.load(open('cartamo_sgc.json', encoding='utf-8')) if '2026-10-23' <= x['od'] <= '2026-10-29' and not x['baja']]
cartas = [c for c in json.load(open('../cartas-20-30.json', encoding='utf-8')) if c['grain'].startswith('C') and 'rtamo' in c['grain']]
cnt = collections.Counter(); seqs = collections.Counter()
for x in sg:
    i = dt.datetime.fromisoformat(x['ing']); s = dt.datetime.fromisoformat(x['sal'])
    rs = sorted(e for p in (x['plate'], x['acop']) if p for e in ev.get(p, []) if i - dt.timedelta(minutes=60) <= e[0] <= s + dt.timedelta(minutes=20))
    seq = []
    for t, d in rs:
        if not seq or seq[-1][1] != d: seq.append((t, d))
    devs = {d for _, d in rs}; cnt.update(devs)
    cs = [c for c in cartas if x['plate'] in c['plates'] or x['acop'] in c['plates']]
    x['cartas'] = [(c['ctg'], c['stateCode'], c['originCuit'], c['distanceKm']) for c in cs]
    print(x['od'], x['plate'], x['min'], len(cs), ' > '.join(f"{d}@{t:%H:%M}" for t, d in seq))
print(len(sg), 'viajes', sum(x['kg'] for x in sg), 'kg'); print(cnt.most_common())

# Circuito R4 (recepción volcable silo Chief): tramos por cámara, cada punto = primera lectura posterior al anterior
import statistics as st
PUNTOS = [('Ingreso', {'RicIngCamFrente', 'RicPreIngInFr'}), ('Calada', {'RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05'}),
          ('Playa 3', {'RicS6Playa3'}), ('Volcable silo Chief', {'RicS7DescLinea2'}), ('Balanza egreso', {'RicB2Egreso', 'RicB3Egreso'})]
tr = collections.defaultdict(list); dia = collections.Counter(); kgd = collections.Counter()
for x in sg:
    i = dt.datetime.fromisoformat(x['ing']); s = dt.datetime.fromisoformat(x['sal'])
    dia[x['od']] += 1; kgd[x['od']] += x['kg']
    rs = sorted(e for p in (x['plate'], x['acop']) if p for e in ev.get(p, []) if i - dt.timedelta(minutes=60) <= e[0] <= s + dt.timedelta(minutes=20))
    prev, marcas = None, []
    for n, devs in PUNTOS:
        t = next((e[0] for e in rs if e[1] in devs and (prev is None or e[0] >= prev)), None)
        marcas.append((n, t)); prev = t or prev
    for (a, ta), (b, tb) in zip(marcas, marcas[1:]):
        if ta and tb: tr[f'{a} → {b}'].append((tb - ta).total_seconds() / 60)
    tr['Balanza egreso → salida (planilla)'] += [(s - marcas[-1][1]).total_seconds() / 60] if marcas[-1][1] else []
tot = [x['min'] for x in sg]
out = {'viajes': len(sg), 'kg': sum(x['kg'] for x in sg), 'porDia': dict(sorted(dia.items())), 'kgDia': dict(sorted(kgd.items())),
       'totalMedia': st.mean(tot), 'totalMediana': st.median(tot), 'conCarta': sum(1 for x in sg if x['cartas']),
       'tramos': [{'tramo': k, 'media': st.mean(v), 'mediana': st.median(v), 'n': len(v)} for k, v in tr.items()]}
cw = [c for c in cartas if '2026-10-22T21' <= c['departure'] and c['departure'] < '2026-10-29T22']
out['cartasEstado'] = collections.Counter(c['stateCode'] for c in cartas)
out['cartasPlanta'] = collections.Counter(c['plant'] for c in cartas)
out['cartasDist'] = collections.Counter(c['distanceKm'] for c in cartas)
out['cartasOrigenCuit'] = len({c['originCuit'] for c in cartas})
print(json.dumps(out, ensure_ascii=False, indent=1))
json.dump(out, open('cartamo.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
