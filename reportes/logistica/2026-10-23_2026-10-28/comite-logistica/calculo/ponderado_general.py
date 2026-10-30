"""Tiempo en planta ponderado por viajes, por producto y planta, del 1/6 al 28/10/2026 (un solo período).
Planilla (data/movimientos): tiempo = salida - ingreso; mes por dia operativo de la salida (22 h).
Soja R7 (ingreso Ricardone, salida puerto): cada viaje toma de su semana el tiempo de camaras en Ricardone y del
interplanta (paquetes semanales); Ricardone = ese tiempo, San Lorenzo = total - Ricardone - interplanta.
Total del producto = las dos plantas ponderadas por sus viajes.
Uso: python -I ponderado_mes.py <dir paquetes> <salida.json>
"""
import json, os, re, sys, datetime as dt, collections

R = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/movimientos/'
PAQ, OUT = sys.argv[1], sys.argv[2]
SEMANAS = ['2026-06-01','2026-06-08','2026-06-15','2026-06-22','2026-06-29','2026-07-06','2026-07-13','2026-07-20','2026-07-27','2026-08-03','2026-08-10','2026-08-17','2026-08-24','2026-08-31','2026-09-07','2026-09-14','2026-09-21','2026-09-28','2026-10-05','2026-10-12','2026-10-19','2026-10-26']
MESES = {'jun-oct': ('2026-06-01', '2026-10-28')}
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
NOLIQ = re.compile(r'ENVASADO|^AGUA|ALCOHOL|NITROGENO|THIN STILLAGE|SAL GLICERINOSA')
FICT = re.compile(r'^(.)\1+$')

def prod(planta, p):
    if p == 'SOJA': return 'Soja'
    if p == 'GIRASOL' and planta == 'RICARDONE': return 'Girasol'
    if 'PELLET' in p: return 'Pellet'
    if LIQ.search(p) and not NOLIQ.search(p): return 'Líquidos'
    return None

CAM = {}
for w in SEMANAS:
    s = json.load(open(os.path.join(PAQ, w + '.json'), encoding='utf-8'))['tiempos']['soja']['periodo']
    CAM[w] = (s['ricMediaMin'], s['bridgeMediaMin'] or 12)
_ok = [v[0] for v in CAM.values() if v[0]]
SIN_CAM = [w for w, v in CAM.items() if not v[0]]
CAM = {w: (v[0] or sum(_ok) / len(_ok), v[1]) for w, v in CAM.items()}   # semana sin tramos de Ricardone: media del período
sem = lambda d: next(s for s in reversed(SEMANAS) if d >= s)

rows, seen = [], set()
for d in sorted(os.listdir(R)):
    if not ('2026-05-30' <= d <= '2026-10-30'): continue
    f = R + d + '/movimientos.json'
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8')):
        if r['external_operation_id'] in seen: continue
        seen.add(r['external_operation_id']); rows.append(r)

V = collections.defaultdict(list)   # (mes, producto, planta) -> minutos por viaje
exc = collections.Counter()
for r in rows:
    pl = {'RICARDONE': 'Ricardone', 'TERMINAL_EMBARQUE': 'San Lorenzo'}.get(r['planta_normalized'])
    p = prod(r['planta_normalized'], r['product_normalized'])
    if not pl or not p: continue
    try:
        i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    except Exception:
        continue
    od = (s + dt.timedelta(hours=2)).date().isoformat()
    mes = next((k for k, (a, b) in MESES.items() if a <= od <= b), None)
    if not mes: continue
    m = (s - i).total_seconds() / 60
    if FICT.match(r['plate_normalized'] or 'X'): exc['patente ficticia'] += 1; continue
    if m < 5: exc['menos de 5 min'] += 1; continue
    if m > 3 * 1440: exc['más de 3 días'] += 1; continue
    if p == 'Soja' and pl == 'San Lorenzo' and r['movement_type'] == 'INGRESO':   # R7
        ric, br = CAM[sem(od)]
        V[(mes, p, 'Ricardone')].append(ric); V[(mes, p, 'San Lorenzo')].append(m - ric - br)
    else:
        V[(mes, p, pl)].append(m)

mean = lambda x: sum(x) / len(x)
out = {'semanasSinCamaraRicardone': SIN_CAM, 'meses': MESES, 'excluidos': dict(exc), 'productos': {}}
for p in ('Soja', 'Girasol', 'Pellet', 'Líquidos'):
    out['productos'][p] = {}
    for mes in MESES:
        g = {pl: V[(mes, p, pl)] for pl in ('Ricardone', 'San Lorenzo') if V.get((mes, p, pl))}
        tot = [x for v in g.values() for x in v]
        out['productos'][p][mes] = {**{pl: {'n': len(v), 'prom': mean(v)} for pl, v in g.items()},
                                    'Total': {'n': len(tot), 'prom': mean(tot) if tot else None}}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.stdout.reconfigure(encoding='utf-8')
print('excluidos', dict(exc))
for p, ms in out['productos'].items():
    for mes, v in ms.items():
        print(p, mes, {k: (round(x['prom']) if x['prom'] is not None else None, x['n']) for k, x in v.items()})
