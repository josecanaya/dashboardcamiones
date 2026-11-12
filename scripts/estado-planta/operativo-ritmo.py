"""Ritmo de un operativo de transile Ricardone → puerto: carga y descarga por hora, choferes/turnos y volcables.

Carga = salidas de balanza de Ricardone (SGC, EGRESO del producto). Descarga = salidas de balanza del puerto de los
camiones que salieron cargados de Ricardone en las 8 h previas (SGC, INGRESO del producto en la terminal).
Choferes = cuitChofer de cada carta (bajar-choferes-api.mjs). Volcable = calle de
calles-volcables-cartas.json (cámara SLZVolcableC1–C5 o, si no la leyó, la volcable activa del producto). Horas en hora local.

Uso: python scripts/estado-planta/operativo-ritmo.py <cartas.json> <choferes.json> <cobertura-reconocida.json>
        <desde> <hasta> <salida.json> [soja|pellet]
"""
import collections, datetime as dt, json, os, sys

CF, CHF, COB, D0, D1, OUT = sys.argv[1:7]
OPN = sys.argv[7] if len(sys.argv) > 7 else 'soja'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
t0, t1 = dt.datetime.fromisoformat(D0), dt.datetime.fromisoformat(D1) + dt.timedelta(days=1)
HS = [t0 + dt.timedelta(hours=i) for i in range(int((t1 - t0).total_seconds() // 3600))]

# --- SGC: carga en Ricardone y descarga en el puerto -------------------------------------------------------------
PROD = 'SOJA' if OPN == 'soja' else 'PELLET'
rows = {}
d = t0 - dt.timedelta(days=1)
while d <= t1:
    f = os.path.join(ROOT, 'data', 'movimientos', d.strftime('%Y-%m-%d'), 'movimientos.json')
    if os.path.exists(f):
        for r in json.load(open(f, encoding='utf-8')): rows[r['external_operation_id']] = r
    d += dt.timedelta(days=1)
prod = lambda r: PROD in (r.get('product_normalized') or '').upper()
carga = [r for r in rows.values() if r['planta_normalized'] == 'RICARDONE' and r['movement_type'] == 'EGRESO' and prod(r) and P(r['external_salida_at']) and (OPN != 'soja' or 'CHIEF' in (r.get('deposito') or '').upper())]   # soja de silos: sale del Chief
por_pat = collections.defaultdict(list)
for r in carga: por_pat[r['plate_normalized']].append(P(r['external_salida_at']))
def de_ric(r):
    ti = P(r['external_ingreso_at'])
    return ti and any(0 <= (ti - s).total_seconds() <= 8 * 3600 for s in por_pat.get(r['plate_normalized'], []))
desc = [r for r in rows.values() if r['planta_normalized'] == 'TERMINAL_EMBARQUE' and r['movement_type'] == 'INGRESO' and prod(r) and P(r['external_salida_at']) and de_ric(r)]
kg = lambda r: float(r.get('kgs_neto') or 0)

def ritmo(rs, ti_key='external_ingreso_at'):
    rs = [r for r in rs if t0 <= P(r['external_salida_at']) < t1]
    h = collections.Counter(P(r['external_salida_at']).replace(minute=0, second=0) for r in rs)
    th = collections.Counter()
    for r in rs: th[P(r['external_salida_at']).replace(minute=0, second=0)] += kg(r)
    serie = [h.get(x, 0) for x in HS]
    dias = {}
    for k in range((t1 - t0).days):
        a = t0 + dt.timedelta(days=k); hh = [x for x in HS if a <= x < a + dt.timedelta(days=1)]
        n = sum(h.get(x, 0) for x in hh); t = sum(th.get(x, 0) for x in hh) / 1000; act = sum(1 for x in hh if h.get(x, 0))
        dias[a.strftime('%Y-%m-%d')] = {'camiones': n, 'toneladas': round(t), 'horasActivas': act,
                                        'camionesHora': round(n / act, 1) if act else None, 'tHora': round(t / act) if act else None,
                                        'maxHora': max((h.get(x, 0) for x in hh), default=0)}
    n = len(rs); t = sum(kg(r) for r in rs) / 1000; act = sum(1 for v in serie if v)
    est = sorted((P(r['external_salida_at']) - P(r[ti_key])).total_seconds() / 60 for r in rs if P(r[ti_key]))
    por_hora_dia = collections.Counter(P(r['external_salida_at']).hour for r in rs)
    return {'serie': serie, 'dias': dias, 'total': {'camiones': n, 'toneladas': round(t), 'horasActivas': act, 'horas': len(HS),
            'camionesHora': round(n / act, 1) if act else None, 'tHora': round(t / act) if act else None, 'maxHora': max(serie, default=0)},
            'estadiaMediana': round(est[len(est) // 2]) if est else None, 'porHoraDelDia': [por_hora_dia.get(i, 0) for i in range(24)],
            'deposito': dict(collections.Counter((r.get('deposito') or 'sin dato') for r in rs).most_common())}

out = {'operativo': OPN, 'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(),
       'horas': [x.strftime('%Y-%m-%dT%H:00') for x in HS], 'carga': ritmo(carga), 'descarga': ritmo(desc)}

# --- cartas, choferes y turnos -------------------------------------------------------------------------------------
C = json.load(open(CF, encoding='utf-8')); C = C if isinstance(C, list) else C.get('cartas', C)
es = (lambda x: x.get('typeCode') == 74 and x.get('grain') == 'Soja') if OPN == 'soja' else (lambda x: x.get('typeCode') == 284 and x.get('derivedProductCode') == 199)
loc = lambda s: dt.datetime.fromisoformat(s[:19]) - dt.timedelta(hours=3)
cs = [x for x in C if es(x) and x.get('originPlant') == '21832' and x.get('plant') == '25567' and x.get('stateCode') != 'AN'
      and x.get('departure') and t0 <= loc(x['departure']) < t1]
CH = json.load(open(CHF, encoding='utf-8'))
cam = collections.defaultdict(list)
for x in cs: cam[x['plates'][0]].append((loc(x['departure']), (CH.get(str(x['ctg'])) or {}).get('cuitChofer')))
choferCamiones = collections.defaultdict(set)
for p, v in cam.items():
    for _, c in v: choferCamiones[c].add(p)
multi = []
for p, v in cam.items():
    ch = collections.defaultdict(list)
    for t, c in v: ch[c].append(t.hour)
    if len(ch) > 1:
        multi.append({'patente': p, 'viajes': len(v), 'choferes': [{'horas': f'{min(h)}–{max(h)}', 'viajes': len(h)} for h in ch.values()]})
noche = lambda h: h >= 22 or h < 6
clas = collections.Counter()
for p, v in cam.items():
    fn = sum(1 for t, _ in v if noche(t.hour)) / len(v)
    clas['solo de día' if fn == 0 else 'mayormente de noche' if fn > .5 else 'día y noche'] += 1
out['choferes'] = {'camiones': len(cam), 'cartas': len(cs), 'camionesUnChofer': sum(1 for v in cam.values() if len({c for _, c in v}) == 1),
                   'choferesEnVariosCamiones': sum(1 for s in choferCamiones.values() if len(s) > 1),
                   'camionesVariosChoferes': multi, 'turnoPorCamion': dict(clas),
                   'nota': 'chofer = el declarado en la carta; noche = salida de 22 a 6 h'}

# --- volcables: calle de cada carta según calles-volcables-cartas.json (misma carpeta que la cobertura) ---------------
CV = json.load(open(os.path.join(os.path.dirname(COB), 'calles-volcables-cartas.json'), encoding='utf-8'))
ctgs = {str(x['ctg']) for x in cs}
tv = [t for t in CV['trips'] if str(t['ctg']) in ctgs and t.get('calle')]
lect = [t for t in tv if t['metodo'] == 'lectura']
out['volcables'] = {'viajes': len(cs), 'ubicados': len(tv), 'leidosPorCamara': len(lect),
                    'porVolcable': dict(collections.Counter(t['calle'] for t in tv).most_common()),
                    'porVolcableCamara': dict(collections.Counter(t['calle'] for t in lect).most_common()),
                    'porDia': {dd: dict(collections.Counter(t['calle'] for t in tv if t['dia'] == dd).most_common()) for dd in sorted({t['dia'] for t in tv})},
                    'nota': CV['criterio'].splitlines()[0]}

json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k in ('carga', 'descarga'):
    print(k, out[k]['total'], 'estadía', out[k]['estadiaMediana'], {d_: (v['camiones'], v['toneladas'], v['horasActivas'], v['camionesHora'], v['tHora'], v['maxHora']) for d_, v in out[k]['dias'].items()})
print('choferes', {k: v for k, v in out['choferes'].items() if k != 'nota'})
print('volcables', out['volcables'])
