"""Calada de líquidos de Ricardone (calle RicCalLiq): camiones por día, por producto, por hora y espera antes de calar.

Camión calado = paso del reconocedor por capas en RicCalLiq (data/reconocido; un camión por patente cada 60 min).
Producto = el del registro de balanza de Ricardone de esa patente cuyo ingreso→salida contiene la calada (±30 min) o, si no
hay, el de su ingreso al puerto en las 12 h siguientes (aceite que se cala acá); agrupado en aceite, soja de silos, pellet, otros. Espera = última lectura de Pre ingreso o Ingreso de la misma patente en las 6 h previas
→ calada. Día = día operativo (22 h). Hora = hora local de la calada.

Uso: python scripts/estado-planta/calada-liquidos.py <desde> <hasta> <salida.json>
"""
import collections, datetime as dt, json, os, statistics as st, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reconocido import pasos_reconocidos, ROOT

D0, D1, OUT = sys.argv[1:4]
sh = lambda d, k: (dt.date.fromisoformat(d) + dt.timedelta(days=k)).isoformat()
loc = lambda s: dt.datetime.fromisoformat(s[:19]) - dt.timedelta(hours=3)          # 'at' del paso = hora operativa en UTC
od = lambda t: (t + dt.timedelta(hours=2)).strftime('%Y-%m-%d')                       # día operativo desde las 22 h
P = pasos_reconocidos(sh(D0, -1), D1)
cal, pre = collections.defaultdict(list), collections.defaultdict(list)
for p in P:
    pl = p.get('final')
    if not pl: continue
    t = loc(p['at'])
    if p.get('device') == 'RicCalLiq': cal[pl].append(t)
    elif p.get('nodo') in ('Pre ingreso', 'Ingreso') and p.get('site') == 'ricardone': pre[pl].append(t)
# balanza de Ricardone (todas las filas de los días del rango ± 1)
rows = {}
d = sh(D0, -1)
while d <= sh(D1, 1):
    f = os.path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
    if os.path.exists(f):
        for r in json.load(open(f, encoding='utf-8')):
            rows[r['external_operation_id']] = r
    d = sh(d, 1)
P_ = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
porPat = collections.defaultdict(list)
for r in rows.values():
    a, b = P_(r.get('external_ingreso_at')), P_(r.get('external_salida_at'))
    if a: porPat[r['plate_normalized']].append((a, b or a + dt.timedelta(hours=12), r))
def producto(pl, t):
    # primero el registro de Ricardone que contiene la calada; si no, el del puerto de las 12 h siguientes (aceite que cala acá y descarga allá)
    c = [(a, b, r) for a, b, r in porPat.get(pl, []) if r['planta_normalized'] == 'RICARDONE' and a - dt.timedelta(minutes=30) <= t <= b + dt.timedelta(minutes=30)]
    if not c: c = [(a, b, r) for a, b, r in porPat.get(pl, []) if t - dt.timedelta(hours=1) <= a <= t + dt.timedelta(hours=12)]
    if not c: return 'sin registro', None, None
    r = min(c, key=lambda x: abs((t - x[0]).total_seconds()))[2]
    return (r.get('product_normalized') or r.get('producto_original') or 'sin dato').strip().upper(), r.get('movement_type'), r['planta_normalized']
def grupo(prod, mov, planta):
    if 'ACEITE' in prod or 'ACGIRASOL' in prod: return 'Aceite de girasol' if 'GIRASOL' in prod else 'Aceite'
    if prod == 'SOJA' and mov == 'EGRESO' and planta == 'RICARDONE': return 'Soja de silos (transile)'
    if 'PELLET' in prod: return 'Pellet de girasol'
    if prod == 'sin registro': return 'Sin registro'
    return 'Otros'
camiones = []
for pl, ts in cal.items():
    ts.sort(); last = None
    for t in ts:
        if last and (t - last).total_seconds() < 3600: continue
        last = t
        if not (D0 <= od(t) <= D1): continue
        prod, mov, planta = producto(pl, t)
        pr = [x for x in pre.get(pl, []) if dt.timedelta(0) < t - x <= dt.timedelta(hours=6)]
        camiones.append({'patente': pl, 'hora': t.strftime('%Y-%m-%d %H:%M'), 'dia': od(t), 'producto': grupo(prod, mov, planta), 'detalleProducto': prod, 'movimiento': mov, 'planta': planta,
                         'espera': round((t - max(pr)).total_seconds() / 60) if pr else None})
dias = [d for d in (sh(D0, k) for k in range((dt.date.fromisoformat(D1) - dt.date.fromisoformat(D0)).days + 1))]
prods = collections.Counter(c['producto'] for c in camiones)
esp = lambda cs: {'media': round(st.mean(z)), 'mediana': round(st.median(z)), 'n': len(z)} if (z := [c['espera'] for c in cs if c['espera'] is not None]) else None
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(), 'camiones': len(camiones),
       'porProducto': dict(prods.most_common()), 'porMovimiento': dict(collections.Counter(c['movimiento'] or 'sin registro' for c in camiones)), 'detalleProducto': dict(collections.Counter(c['detalleProducto'] for c in camiones).most_common()),
       'porDia': {d: {'camiones': sum(1 for c in camiones if c['dia'] == d), 'porProducto': dict(collections.Counter(c['producto'] for c in camiones if c['dia'] == d)),
                      'espera': esp([c for c in camiones if c['dia'] == d])} for d in dias},
       'porHora': [sum(1 for c in camiones if int(c['hora'][11:13]) == h) for h in range(24)],
       'espera': esp(camiones), 'esperaPorProducto': {p: esp([c for c in camiones if c['producto'] == p]) for p in prods},
       'detalle': camiones}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(out['camiones'], out['porProducto'], out['porMovimiento']); print({d: (v['camiones'], v['espera']) for d, v in out['porDia'].items()}); print('espera', out['espera'], out['esperaPorProducto'])
