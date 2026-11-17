"""Camiones calados por producto y por día en la calada de Ricardone (pedido del sector de calado).
Camión calado = viaje con carta de porte que el vínculo de lecturas (scripts/vinculo/cobertura.mjs) ubicó en una cámara
de calada; producto = el de su carta (derivado 199 = pellet de girasol). Día = día operativo (22 h) de la primera
lectura en la calada. Solo grano: carta de grano (no derivados como pellet o aceite, ni despachos) leída en una calle de grano (RicCal01–06); la calle de líquidos (RicCalLiq) no se cuenta. El SGC no trae la hora de calado.
Uso: python scripts/estado-planta/calada-producto.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.json>
"""
import json, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
cartas = {x['ctg']: x for x in json.load(open(CF, encoding='utf-8'))}
V = json.load(open(VF, encoding='utf-8'))
def producto(c):
    if c is None: return 'Sin carta'
    if c['typeCode'] == 284:   # derivados: 199 = pellet de girasol; 101 = aceite de girasol (cruce con el SGC 06/11: «aceite girasol para refinar» y oleico)
        return {199: 'Pellet de girasol', 101: 'Aceite de girasol'}.get(c.get('derivedProductCode'), f"{c.get('grain') or 'Derivado'} (derivado)")
    g = c.get('grain') or 'Otro'
    if g == 'Grano 82': g = 'Camelina'   # ARCA no nombra el código 82; el SGC lo registra como SEMILLA DE CAMELINA
    elif g.startswith('Grano '): g = f'Otro grano (código {g[6:]})'
    return f'{g} (despacho)' if c.get('originCuit') == '30500959629' else g
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
CALLE = lambda cam: 'líquidos' if cam == 'RicCalLiq' else ('sólida' if cam.startswith('RicCal0') else None)
cnt = {'sólida': collections.defaultdict(collections.Counter), 'líquidos': collections.defaultdict(collections.Counter)}
porCalle = collections.defaultdict(collections.Counter)
calleProd = collections.defaultdict(collections.Counter)
porHora = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
espera = collections.defaultdict(list); esperaDia = collections.defaultdict(lambda: collections.defaultdict(list))
for t in V['camiones']:
    cal = sorted((l for l in t['lecturas'] if l['nodo'] == 'ricardone:Calada' and CALLE(l.get('camara') or '') == 'sólida'), key=lambda l: l['at'])   # solo calles de grano (pedido 06/11)
    if not cal: continue
    l = cal[0]; dia = od(H(l['hora'], l['at'][:4]))
    if not (D0 <= dia <= D1): continue
    c_ = cartas.get(t['ctg']); p = producto(c_)
    if not c_ or c_['typeCode'] == 284 or p.endswith('(despacho)'): continue   # solo grano que entra a calar: fuera derivados (pellet, aceite) y despachos (pedido 06/11)
    cnt[CALLE(l['camara'])][dia][p] += 1
    if CALLE(l['camara']) == 'sólida': porCalle[dia][l['camara']] += 1
    calleProd[l['camara']][p] += 1
    porHora[dia][H(l['hora'], l['at'][:4]).hour][p] += 1   # hora local de la primera lectura en la calada
    pre =[x for x in t['lecturas'] if x['nodo'] in ('ricardone:Pre ingreso', 'ricardone:Ingreso') and x['at'] <= l['at']]
    if pre:   # espera en Playa 1: última lectura de pre-ingreso (o ingreso) antes de la calada → calada
        w = (H(l['hora'], l['at'][:4]) - H(max(pre, key=lambda x: x['at'])['hora'], l['at'][:4])).total_seconds() / 60
        if 0 <= w <= 24 * 60: espera[p].append(w); esperaDia[dia][p].append(w)
dias = []
x = dt.date.fromisoformat(D0)
while x.isoformat() <= D1: dias.append(x.isoformat()); x += dt.timedelta(days=1)
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(),
       'calles': {k: {d: dict(v.get(d, {})) for d in dias} for k, v in cnt.items()},
       'totalPorProducto': {k: dict(sum((v[d] for d in dias), collections.Counter())) for k, v in cnt.items()},
       'porCalleSolida': {d: dict(porCalle.get(d, {})) for d in dias},
       'calleProducto': {k: dict(v) for k, v in sorted(calleProd.items())},
       'porHora': {d: {str(h): dict(porHora[d][h]) for h in range(24) if porHora[d][h]} for d in dias},
       'notaHora': 'hora local de la primera lectura en la calada; el día operativo empieza a las 22 h del día anterior',
       'esperaPlaya1': {p: {'media': round(st.mean(v)), 'mediana': round(st.median(v)), 'n': len(v)} for p, v in espera.items()},
       'esperaPlaya1Dia': {d: {p: {'media': round(st.mean(v)), 'n': len(v)} for p, v in esperaDia[d].items()} for d in dias},
       'notaEspera': 'Playa 1 = última lectura de Pre ingreso (o Ingreso) antes de la calada → primera lectura en la calada, por cámaras vinculadas'}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in ('sólida', 'líquidos'):
    print(k, out['totalPorProducto'][k])
    for d in dias: print('  ', d, out['calles'][k][d])
