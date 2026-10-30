"""Ubica cada viaje de líquidos del puerto (SGC 23-28/10, sin los que entraron por Ricardone) en su punto de carga/descarga por cámaras:
Ren* (RenCargFte/RenDescFte) = plataforma OSL; SLZBalLiq* = plataforma PTO; SLZTK400 = Renova. Cruza con la plataforma del SGC y mide tramos.
Uso: python -I liquidos_puntos.py <salida.json>"""
import json, re, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/'
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
PUNTO = {'RenCargFte': 'OSL', 'RenDescFte': 'OSL', 'SLZTK400': 'Renova'}
def punto_de(dev):
    if dev in PUNTO: return PUNTO[dev]
    if dev.startswith('SLZBalLiq'): return 'PTO'
    return None
ev = collections.defaultdict(list)
for d in range(22, 31):
    for r in json.load(open(B + f'truckflow/2026-10-{d:02d}/event-list.json', encoding='utf-8'))['records']:
        ev[r['truckPlate']].append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), r['deviceCode']))
for v in ev.values(): v.sort()
rows = {}
for d in range(22, 31):
    for r in json.load(open(B + f'movimientos/2026-10-{d:02d}/movimientos.json', encoding='utf-8')): rows[r['external_operation_id']] = r
def first_after(rs, devs, t0):
    return next((x[0] for x in rs if x[1] in devs and (t0 is None or x[0] >= t0)), None)
V = []
for r in rows.values():
    if r['planta_normalized'] != 'TERMINAL_EMBARQUE' or not LIQ.search(r['product_normalized']) or 'ENVASADO' in r['product_normalized'] or not r['external_salida_at']: continue
    i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    if not ('2026-10-23' <= (i + dt.timedelta(hours=2)).date().isoformat() <= '2026-10-29'): continue
    ps = [p for p in (r['plate_normalized'], r.get('patente_acoplado') or '') if p]
    rs = sorted(x for p in ps for x in ev.get(p, []) if i - dt.timedelta(minutes=60) <= x[0] <= s + dt.timedelta(minutes=20))
    devs = {x[1] for x in rs}
    if 'PARA REFINAR' in r['product_normalized'] or ('RicCalLiq' in devs and r['movement_type'] == 'INGRESO'): continue
    pts = collections.Counter(punto_de(x[1]) for x in rs if punto_de(x[1]))
    punto = pts.most_common(1)[0][0] if pts else 'sin lectura'
    if punto == 'sin lectura':   # sin lectura en ningún punto: manda la plataforma del SGC; sin plataforma no se cuenta (criterio del comité)
        punto = {'ACEITE_OSL': 'OSL', 'ACEITE_PTO': 'PTO'}.get(r['platform_normalized'])
        if not punto: continue
    # tramos: ingreso -> balanza ingreso -> punto -> balanza egreso -> salida
    t_ing = first_after(rs, {'SLZIngCamFrente'}, None)
    t_bi = first_after(rs, {'SLZBalIngFte'}, t_ing)
    pdevs = {x[1] for x in rs if punto_de(x[1]) == punto}
    t_p = first_after(rs, pdevs, t_bi) if pdevs else None
    t_pl = max((x[0] for x in rs if x[1] in pdevs and (t_p is None or x[0] >= t_p)), default=None) if pdevs else None
    t_be = first_after(rs, {'SLZBalSC2Fte'}, t_pl or t_bi)
    t_sal = first_after(rs, {'SLZSalidaC1Fte'}, t_be)
    V.append({'sentido': 'Carga' if r['movement_type'] == 'EGRESO' else 'Descarga', 'producto': r['product_normalized'], 'plataformaSGC': r['platform_normalized'] or 'sin plataforma',
              'punto': punto, 'puntos': dict(pts), 'total': (s - i).total_seconds() / 60, 't': float(r['kgs_neto'] or 0),
              'm': {'Ingreso → balanza ingreso': (t_ing, t_bi), 'Balanza ingreso → punto': (t_bi, t_p), 'En el punto': (t_p, t_pl),
                    'Punto → balanza egreso': (t_pl, t_be), 'Balanza egreso → salida': (t_be, t_sal)}})
print('viajes', len(V))
print('punto x plataforma SGC:')
for k, n in collections.Counter((v['sentido'], v['punto'], v['plataformaSGC']) for v in V).most_common(): print(f'  {n:4} {k}')
print('viajes con más de un punto:', sum(1 for v in V if len(v['puntos']) > 1), collections.Counter(tuple(sorted(v['puntos'])) for v in V if len(v['puntos']) > 1))
out = {}
for key in sorted({(v['sentido'], v['punto']) for v in V}):
    g = [v for v in V if (v['sentido'], v['punto']) == key]
    tr = {}
    for name in g[0]['m']:
        x = [(b - a).total_seconds() / 60 for v in g for a, b in [v['m'][name]] if a and b and b >= a]
        if x: tr[name] = {'media': st.mean(x), 'mediana': st.median(x), 'n': len(x)}
    prod = collections.Counter(v['producto'] for v in g)
    out[' · '.join(key)] = {'viajes': len(g), 't': round(sum(v['t'] for v in g) / 1000), 'totalMedia': st.mean(v['total'] for v in g), 'totalMediana': st.median(v['total'] for v in g),
                            'productos': dict(prod), 'plataformaSGC': dict(collections.Counter(v['plataformaSGC'] for v in g)), 'tramos': tr}
    print(f"== {key}: {len(g)} viajes {out[' · '.join(key)]['t']} t total {st.mean(v['total'] for v in g):.0f} (med {st.median(v['total'] for v in g):.0f}) | {dict(prod.most_common(4))}")
    for n, x in tr.items(): print(f"     {n:28} media {x['media']:5.0f} mediana {x['mediana']:5.0f} n {x['n']}")
json.dump(out, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
