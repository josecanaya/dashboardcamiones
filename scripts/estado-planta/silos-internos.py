# Transile interno en silos de Ricardone: camiones con 3+ viajes desde el silo 7 o el silo 8 en un día, destino de cada
# viaje por cámara y cruce con data/movimientos.
# Uso: python scripts/estado-planta/silos-internos.py <salida.json> <desde> <hasta>
# Viaje = una carga en el silo (lecturas de la misma cámara de carga a menos de 15 min son el mismo viaje); su destino es la
# primera cámara de descarga que lo lee antes de la carga siguiente (volcable 2 o silo 7 línea 1/2), si no «sin lectura».
# Hora operativa = occurredAt + 206 min. Las lecturas mal leídas de un camión interno (una letra distinta, o la patente
# cortada) se le suman si caen en una cámara de silo o de volcable.
import json, os, datetime as dt, collections, sys
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SKEW = dt.timedelta(minutes=206)
OUT, DESDE, HASTA = sys.argv[1:4]
d0, d1 = dt.date.fromisoformat(DESDE), dt.date.fromisoformat(HASTA)
DAYS = [(d0 + dt.timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]
iso = lambda d, n: (dt.date.fromisoformat(d) + dt.timedelta(days=n)).isoformat()
CARGA = {'RicS7Carga': '7', 'RicS8CargaLinea1': '8', 'RicS8CargaLinea2': '8'}
DESC = {'RicVolcable2': 'volcable2', 'RicS7DescLinea1': 'silo7', 'RicS7DescLinea2': 'silo7'}
SILOS = set(CARGA) | set(DESC) | {'RicC16Carga1', 'RicC16Carga2'}
GAP = dt.timedelta(minutes=15)

ev = collections.defaultdict(list)
for i in range(-1, len(DAYS) + 1):
    f = os.path.join(ROOT, 'data', 'truckflow', iso(DESDE, i), 'event-list.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8-sig'))['records']:
        if r.get('truckPlate') and r.get('occurredAt'):
            t = dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + SKEW
            if t.date().isoformat() in DAYS: ev[r['truckPlate'].upper()].append((t, r['deviceCode']))
mov = collections.defaultdict(dict)
for i in range(-2, len(DAYS) + 2):
    f = os.path.join(ROOT, 'data', 'movimientos', iso(DESDE, i), 'movimientos.json')
    if os.path.exists(f):
        j = json.load(open(f, encoding='utf-8')); rows = j if isinstance(j, list) else (j.get('rows') or [])
        for r in rows: mov[(r.get('plate_normalized') or '').upper()][r['external_operation_id']] = r

def viajes(es):
    """Cargas en silo 7/8 sin repetir (misma cámara a menos de 15 min = mismo viaje), con su destino."""
    cargas = []
    for t, d in es:
        if d not in CARGA: continue
        l = cargas[-1] if cargas else None
        if l and CARGA[l['dev']] == CARGA[d] and t - l['t'] < GAP: continue
        cargas.append({'t': t, 'dev': d})
    out = []
    for k, c in enumerate(cargas):
        nxt = cargas[k + 1]['t'] if k + 1 < len(cargas) else None
        dst = next((DESC[d] for t, d in es if d in DESC and t > c['t'] and (nxt is None or t < nxt)), 'sinLectura')
        out.append({'t': c['t'], 'silo': CARGA[c['dev']], 'destino': dst, 'ciclo': (nxt - c['t']).total_seconds() / 60 if nxt else None})
    return out

def cuenta_dia(vs):
    return collections.Counter(v['t'].date().isoformat() for v in vs)

# camiones internos: 3+ viajes desde un silo en un mismo día
inter = sorted(p for p, es in ev.items() if any(n >= 3 for n in cuenta_dia(viajes(sorted(es))).values()))
# lecturas mal leídas de un interno: una letra distinta (mismo largo) o patente cortada (5+ caracteres al principio)
def parecida(a, b):
    if a == b: return False
    if len(a) == len(b): return sum(x != y for x, y in zip(a, b)) == 1
    return len(a) >= 5 and b.startswith(a)
alias = {}
nviajes = {p: len(viajes(sorted(ev[p]))) for p in inter}
keep = []
for p in sorted(inter, key=lambda q: -nviajes[q]):   # un interno chico parecido a uno grande es el mismo camión mal leído
    q = next((k for k in keep if parecida(p, k) or parecida(k, p)), None)
    if q: alias[p] = q
    else: keep.append(p)
for p, es in ev.items():
    if p in inter or not any(d in SILOS for t, d in es): continue
    cand = {alias.get(q, q) for q in inter if parecida(p, q) or parecida(q, p)}
    if len(cand) == 1: alias[p] = cand.pop()
for p, q in alias.items(): ev[q] += [(t, d) for t, d in ev[p] if d in SILOS]
# transile interno = al menos un cuarto de los viajes con descarga leída dentro de la planta (volcable 2 o silo 7); el resto
# (cargas que salen por balanza, con alguna lectura suelta en una descarga) va a «otros»
def adentro(p):
    vs = viajes(sorted(ev[p])); return bool(vs) and sum(v['destino'] != 'sinLectura' for v in vs) >= 0.25 * len(vs)
inter = [p for p in keep if adentro(p)]

med = lambda a: (sorted(a)[len(a) // 2] if a else None)
porDia = {d: {'viajes': 0, 'silo7': 0, 'silo8': 0, 'volcable2': 0, 'aSilo7': 0, 'sinLectura': 0, 'camiones': 0} for d in DAYS}
porHora = [0] * 24
cuartos = {}
cam = []
for p in inter:
    vs = viajes(sorted(ev[p]))
    for d, n in cuenta_dia(vs).items(): porDia[d]['camiones'] += 1
    for v in vs:
        x = porDia[v['t'].date().isoformat()]
        x['viajes'] += 1; x['silo' + v['silo']] += 1
        x[{'volcable2': 'volcable2', 'silo7': 'aSilo7', 'sinLectura': 'sinLectura'}[v['destino']]] += 1
        porHora[v['t'].hour] += 1
    xl = [r for r in mov[p].values() if (r.get('external_ingreso_at') or '')[:10] in DAYS or (r.get('external_salida_at') or '')[:10] in DAYS]
    noche = sum(1 for v in vs if v['t'].hour >= 22 or v['t'].hour < 6)
    for v in vs:   # cuartos del día operativo (desde las 22 h): Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22
        o = v['t'] + dt.timedelta(hours=2); k = f'{o.date().isoformat()}|Q{o.hour // 6 + 1}'
        cuartos.setdefault(k, collections.Counter())[p] += 1
    cam.append({'patente': p, 'alias': sorted(a for a, q in alias.items() if q == p), 'dias': len(cuenta_dia(vs)), 'viajes': len(vs),
                'silos': dict(collections.Counter(v['silo'] for v in vs)), 'destinos': dict(collections.Counter(v['destino'] for v in vs)),
                'porDia': dict(sorted(cuenta_dia(vs).items())), 'cicloMedianaMin': (round(med([v['ciclo'] for v in vs if v['ciclo'] and v['ciclo'] < 120])) if vs else None),
                'nocturnos': noche, 'horasActivas': len({v['t'].replace(minute=0, second=0, microsecond=0) for v in vs}), 'primero': vs[0]['t'].isoformat(timespec='minutes'), 'ultimo': vs[-1]['t'].isoformat(timespec='minutes'),
                'excel': {'filas': len(xl), 'producto': sorted({r['product_normalized'] for r in xl}), 'planta': sorted({r['planta_normalized'] for r in xl}), 'mov': sorted({r['mov'] for r in xl}),
                          'kgsNeto': sum(float(r.get('kgs_neto') or 0) for r in xl), 'turnos': [(r['external_ingreso_at'][5:16], r['external_salida_at'][5:16]) for r in xl]}})
otros = []
for p, es in ev.items():
    if p in inter or p in alias or not any(d in SILOS - {'RicVolcable2'} for t, d in es): continue
    c = collections.Counter(d for t, d in es if d in SILOS | {'RicB3Ingreso', 'RicB3Egreso'})
    xl = [r for r in mov[p].values() if (r.get('external_ingreso_at') or '')[:10] in DAYS]
    otros.append({'patente': p, 'lecturas': dict(c), 'excel': [f'{r["mov"]} {r["product_normalized"].lower()}' for r in xl]})
out = {'criterio': 'camiones con 3 o más viajes desde el silo 7 (RicS7Carga) o el silo 8 (RicS8CargaLinea1/2) en un mismo día; viaje = carga sin repetir a menos de 15 min, '
                   'destino = primera descarga leída antes de la carga siguiente; hora operativa = occurredAt + 206 min; cruce con data/movimientos por patente',
       'periodo': {'desde': DESDE, 'hasta': HASTA, 'dias': DAYS}, 'viajes': sum(c['viajes'] for c in cam),
       'internos': cam, 'porDia': porDia, 'porHora': porHora,
       'cuartos': [{'dia': k.split('|')[0], 'q': k.split('|')[1], 'viajes': sum(c.values()), 'porCamion': dict(c)} for k, c in sorted(cuartos.items())], 'otros': sorted(otros, key=lambda o: o['patente'])}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'viajes': out['viajes'], 'internos': [(c['patente'], c['viajes'], c['silos'], c['destinos'], c['alias']) for c in cam],
                  'porDia': {d: v['viajes'] for d, v in porDia.items()}}, ensure_ascii=False))
