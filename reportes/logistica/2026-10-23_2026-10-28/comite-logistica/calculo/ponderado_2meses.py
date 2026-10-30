"""Tiempo en planta ponderado por viajes, por planta y producto, semanas lunes-domingo del 31/08 al 28/10/2026.
Planilla (data/movimientos): permanencia = salida - ingreso; semana por dia operativo de la salida (22 h).
Soja R7: la planilla tiene ingreso Ricardone y salida puerto -> se reparte con las camaras (paquete semanal):
  Ricardone = tramos de Ricardone (ingreso -> egreso), San Lorenzo = total - Ricardone - interplanta.
Uso: python -I ponderado_2meses.py <dir paquetes> <salida.json>
"""
import json, os, re, sys, datetime as dt, collections, statistics as st

R = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/movimientos/'
PAQ, OUT = sys.argv[1], sys.argv[2]
SEMANAS = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']
FIN = '2026-10-28'
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
NOLIQ = re.compile(r'ENVASADO|^AGUA|ALCOHOL|NITROGENO|THIN STILLAGE|SAL GLICERINOSA')
FICT = re.compile(r'^(.)\1+$')

def prod(planta, p):
    if p == 'SOJA': return 'Soja'
    if p == 'GIRASOL' and planta == 'RICARDONE': return 'Girasol'
    if 'PELLET' in p: return 'Pellet'
    if LIQ.search(p) and not NOLIQ.search(p): return 'Líquidos'
    return None

def semana(d):
    for s in reversed(SEMANAS):
        if d >= s: return s
    return None

rows, seen = [], set()
for d in sorted(os.listdir(R)):
    if not ('2026-08-29' <= d <= '2026-10-30'): continue
    f = R + d + '/movimientos.json'
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8')):
        if r['external_operation_id'] in seen: continue
        seen.add(r['external_operation_id']); rows.append(r)

V = collections.defaultdict(list)   # (semana, planta, producto) -> minutos
exc = collections.Counter()
for r in rows:
    pl = {'RICARDONE': 'Ricardone', 'TERMINAL_EMBARQUE': 'San Lorenzo'}.get(r['planta_normalized'])
    if not pl: continue
    try:
        i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    except Exception:
        exc['sin ingreso o salida'] += 1; continue
    od = (s + dt.timedelta(hours=2)).date().isoformat()
    if not (SEMANAS[0] <= od <= FIN): continue
    p = prod(r['planta_normalized'], r['product_normalized'])
    if not p: continue
    m = (s - i).total_seconds() / 60
    if FICT.match(r['plate_normalized'] or 'X'): exc['patente ficticia'] += 1; continue
    if m < 5: exc['menos de 5 min (registro administrativo)'] += 1; continue
    if m > 3 * 1440: exc['más de 3 días'] += 1; continue
    w = semana(od)
    if p == 'Soja' and pl == 'San Lorenzo' and r['movement_type'] == 'INGRESO':
        V[(w, 'R7', 'Soja')].append(m)      # se reparte abajo
    else:
        V[(w, pl, p)].append(m)

res = collections.defaultdict(dict)
for w in SEMANAS:
    pq = json.load(open(os.path.join(PAQ, w + '.json'), encoding='utf-8'))['tiempos']['soja']['periodo']
    r7 = V.get((w, 'R7', 'Soja'), [])
    ric, bridge = pq['ricMediaMin'], pq['bridgeMediaMin'] or 12
    tot = st.mean(r7) if r7 else None
    for pl, p in (('Ricardone', 'Soja'), ('San Lorenzo', 'Soja')):
        otros = V.get((w, pl, p), [])
        base = ric if pl == 'Ricardone' else (tot - ric - bridge if tot and ric else None)
        n = len(r7) + len(otros)
        prom = (base * len(r7) + sum(otros)) / n if base is not None and n else None
        res[w][(pl, p)] = {'n': n, 'prom': prom, 'r7': len(r7), 'r7Ric': ric, 'r7Total': tot, 'puente': bridge}
    for pl in ('Ricardone', 'San Lorenzo'):
        for p in ('Girasol', 'Pellet', 'Líquidos'):
            x = V.get((w, pl, p), [])
            if x: res[w][(pl, p)] = {'n': len(x), 'prom': st.mean(x)}
    for pl in ('Ricardone', 'San Lorenzo'):   # promedio de la planta ponderado por viajes
        g = [v for (a, _), v in res[w].items() if a == pl and v['prom'] is not None]
        n = sum(v['n'] for v in g)
        res[w][(pl, 'Planta')] = {'n': n, 'prom': sum(v['prom'] * v['n'] for v in g) / n if n else None}

def total2m(key):
    g = [res[w][key] for w in SEMANAS if key in res[w] and res[w][key]['prom'] is not None]
    n = sum(v['n'] for v in g)
    return {'n': n, 'prom': sum(v['prom'] * v['n'] for v in g) / n if n else None}

KEYS = [('Ricardone', 'Planta'), ('Ricardone', 'Soja'), ('Ricardone', 'Girasol'), ('Ricardone', 'Pellet'), ('Ricardone', 'Líquidos'),
        ('San Lorenzo', 'Planta'), ('San Lorenzo', 'Soja'), ('San Lorenzo', 'Líquidos'), ('San Lorenzo', 'Pellet')]
out = {'semanas': SEMANAS, 'fin': FIN, 'excluidos': dict(exc),
       'tabla': [{'planta': k[0], 'producto': k[1], 'semanas': [res[w].get(k) for w in SEMANAS], 'dosMeses': total2m(k)} for k in KEYS]}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=str)
sys.stdout.reconfigure(encoding='utf-8')
print('excluidos', dict(exc))
f = lambda v: ' -- ' if not v or v['prom'] is None else f"{round(v['prom']):4d}/{v['n']:<4d}"
print(' ' * 22 + ' '.join(w[8:10] + '/' + w[5:7] + '  ' for w in SEMANAS) + ' 2 meses')
for t in out['tabla']:
    print(f"{t['planta'][:11]:11} {t['producto']:9}", ' '.join(f(v) for v in t['semanas']), f(t['dosMeses']))
for w in SEMANAS:
    v = res[w][('Ricardone', 'Soja')]; print(w, 'R7', v['r7'], 'total', v['r7Total'] and round(v['r7Total']), 'ric', round(v['r7Ric'] or 0), 'puente', round(v['puente']))
