"""Descargas en las volcables del puerto por calle y día, contadas por cartas de porte (soja y pellet con destino al puerto,
planta 25567) y ubicadas con las cámaras SLZVolcableC1–C5 que el vínculo de lecturas (scripts/vinculo/cobertura.mjs)
asignó a cada carta. No depende del registro de la balanza (que puede faltar días enteros).
Calle: la cámara de volcable que leyó al camión (la más leída si hay varias); si ninguna lo leyó, la volcable con más lecturas del mismo producto
lecturas de otros camiones mientras el camión estaba en el puerto (balanza de ingreso → egreso); si no, la más cercana en el tiempo.
Día = día operativo (22 h) de la lectura en la volcable o, si no hay, del ingreso al puerto.
Uso: python scripts/estado-planta/volcables-cartas.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.json>
"""
import json, sys, collections, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
C = {x['ctg']: x for x in json.load(open(CF, encoding='utf-8')) if x.get('plant') == '25567' and x.get('stateCode') != 'AN'}
V = json.load(open(VF, encoding='utf-8'))
calle = lambda cam: 'V' + cam[-1]
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
nporpat = collections.Counter(x['plates'][0] for x in C.values() if x.get('plates'))
pool = {}   # lecturas de volcable (sin repetir entre cartas del mismo camión) con el producto de la carta: actividad de cada calle por producto
for t in V['camiones']:
    for l in t['lecturas']:
        if l['nodo'] == 'san_lorenzo:Plataformas Volcables' and (l.get('camara') or '').startswith('SLZVolcableC'):
            _c = C.get(t['ctg'])
            pool.setdefault((l['at'], l['camara']), (H(l['hora'], l['at'][:4]), calle(l['camara']), ('Pellet' if _c['typeCode'] == 284 else _c.get('grain')) if _c else None))
pool = sorted(pool.values(), key=lambda p: p[0])
trips = []
for t in V['camiones']:
    c = C.get(t['ctg'])
    if not c: continue
    prod = 'Pellet' if c['typeCode'] == 284 else c.get('grain') or 'Otro'
    L = [(H(l['hora'], l['at'][:4]), l['nodo'], l.get('camara') or '') for l in t['lecturas']]
    if c['typeCode'] == 284 and c.get('departure') and nporpat[c['plates'][0]] > 1:   # transile: el camión hizo varios viajes, solo las lecturas de este (salida de la carta −1 h a +8 h; la carta sale en Ricardone)
        dep = loc(c['departure']); L = [x for x in L if dep - dt.timedelta(hours=1) <= x[0] <= dep + dt.timedelta(hours=8)]
    sl = [x for x in L if x[1].startswith('san_lorenzo')]
    if not sl: continue
    vs = sorted(x for x in sl if x[1] == 'san_lorenzo:Plataformas Volcables' and x[2].startswith('SLZVolcableC'))
    if vs:
        k = calle(vs[0][2]); dia = od(vs[0][0]); met = 'lectura'   # la primera lectura de volcable del viaje
    else:
        a = min((x[0] for x in sl if x[1] in ('san_lorenzo:Balanza Ingreso', 'san_lorenzo:Ingreso')), default=min(x[0] for x in sl))
        b = max((x[0] for x in sl if x[1] in ('san_lorenzo:Balanza Egreso', 'san_lorenzo:Egreso')), default=max(x[0] for x in sl))
        cnt = collections.Counter(k for tt, k, pp in pool if a <= tt <= b and pp == prod)   # la volcable que descargaba el mismo producto
        if cnt: k = cnt.most_common(1)[0][0]; met = 'actividad'
        else:
            near = min((p for p in pool if p[2] == prod), key=lambda p: abs((p[0] - a).total_seconds()), default=None)
            k = near[1] if near else None; met = 'cercana'
        dia = od(a)
    if not (D0 <= dia <= D1) or not k: continue
    t0 = min(x[0] for x in vs) if vs else a
    trips.append({'ctg': c['ctg'], 'patente': t['plate'], 'dia': dia, 'calle': k, 'metodo': met, 'producto': prod, '_t': t0})
# una volcable con 1 o 2 descargas en el día es una lectura suelta (la calle no estaba operando): esos viajes van a la
# volcable con más lecturas en la hora alrededor de su paso, sin contar la calle suelta
cel = collections.Counter((x['calle'], x['dia']) for x in trips)
for x in trips:
    if x['metodo'] != 'lectura' and cel[(x['calle'], x['dia'])] <= 2:   # lo que leyó la cámara no se toca (pedido 05/11)
        cnt = collections.Counter(k for tt, k, pp in pool if abs((tt - x['_t']).total_seconds()) <= 3600 and pp == x['producto'] and k != x['calle'] and cel[(k, x['dia'])] > 2)
        if cnt: x['calle'], x['metodo'] = cnt.most_common(1)[0][0], 'suelta'
for x in trips: x.pop('_t')
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(), 'fuente': 'cartas',
       'metodos': dict(collections.Counter(x['metodo'] for x in trips)), 'productos': dict(collections.Counter(x['producto'] for x in trips)), 'trips': trips}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
tab = collections.defaultdict(collections.Counter)
for x in trips: tab[x['calle']][x['dia']] += 1
dias = sorted({x['dia'] for x in trips})
print('viajes', len(trips), out['metodos'], out['productos'])
for k in sorted(tab): print(k, sum(tab[k].values()), [tab[k][d] for d in dias])
