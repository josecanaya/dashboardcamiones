"""Camiones calados por producto y por día en la calada de Ricardone (pedido del sector de calado).
Camión calado = viaje con carta de porte que el vínculo de lecturas (scripts/vinculo/cobertura.mjs) ubicó en una cámara
de calada; producto = el de su carta (derivado 199 = pellet de girasol). Día = día operativo (22 h) de la primera
lectura en la calada. El pellet en transile no se cuenta (pasa por la calle de líquidos sin calar). Calles sólidas = RicCal01–06; calle de líquidos = RicCalLiq. El SGC no trae la hora de calado.
Uso: python scripts/estado-planta/calada-producto.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.json>
"""
import json, sys, collections, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
cartas = {x['ctg']: x for x in json.load(open(CF, encoding='utf-8'))}
V = json.load(open(VF, encoding='utf-8'))
def producto(c):
    if c is None: return 'Sin carta'
    if c['typeCode'] == 284: return 'Pellet de girasol' if c.get('derivedProductCode') == 199 else f"{c.get('grain') or 'Derivado'} (derivado)"
    g = c.get('grain') or 'Otro'
    if g.startswith('Grano '): g = f'Otro grano (código {g[6:]})'
    return f'{g} (despacho)' if c.get('originCuit') == '30500959629' else g
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
CALLE = lambda cam: 'líquidos' if cam == 'RicCalLiq' else ('sólida' if cam.startswith('RicCal0') else None)
cnt = {'sólida': collections.defaultdict(collections.Counter), 'líquidos': collections.defaultdict(collections.Counter)}
porCalle = collections.defaultdict(collections.Counter)
for t in V['camiones']:
    cal = sorted((l for l in t['lecturas'] if l['nodo'] == 'ricardone:Calada' and CALLE(l.get('camara') or '')), key=lambda l: l['at'])
    if not cal: continue
    l = cal[0]; dia = od(H(l['hora'], l['at'][:4]))
    if not (D0 <= dia <= D1): continue
    p = producto(cartas.get(t['ctg']))
    if p == 'Pellet de girasol': continue   # el transile de pellet pasa por la calle de líquidos sin calar
    cnt[CALLE(l['camara'])][dia][p] += 1
    if CALLE(l['camara']) == 'sólida': porCalle[dia][l['camara']] += 1
dias = []
x = dt.date.fromisoformat(D0)
while x.isoformat() <= D1: dias.append(x.isoformat()); x += dt.timedelta(days=1)
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(),
       'calles': {k: {d: dict(v.get(d, {})) for d in dias} for k, v in cnt.items()},
       'totalPorProducto': {k: dict(sum((v[d] for d in dias), collections.Counter())) for k, v in cnt.items()},
       'porCalleSolida': {d: dict(porCalle.get(d, {})) for d in dias}}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in ('sólida', 'líquidos'):
    print(k, out['totalPorProducto'][k])
    for d in dias: print('  ', d, out['calles'][k][d])
