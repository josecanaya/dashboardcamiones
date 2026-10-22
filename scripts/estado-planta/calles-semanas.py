# Actividad y horas de ocupación por calle (calada sólida de Ricardone y volcables del puerto), semana por semana.
# Uso: python scripts/estado-planta/calles-semanas.py <salida.json> <hasta> [semanas=4 | desde:hasta,desde:hasta,...]
#   (con la lista de períodos, uno por comité, en vez de semanas de 7 días)
# Semanas de 7 días que terminan en <hasta>. Por calle y semana:
#   camiones = patentes distintas por visita (lecturas de la misma patente en la calle a menos de 60 min = un camión);
#   horas    = horas reloj con al menos una lectura (ocupación de la calle).
# Hora operativa = occurredAt + 206 min. Cámaras: RicCal01–06 (calles de calada) y SLZVolcableC1–C5 (volcables).
import json, os, sys, collections, datetime as dt
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT, HASTA = sys.argv[1:3]
ARG = sys.argv[3] if len(sys.argv) > 3 else '4'
SKEW = dt.timedelta(minutes=206)
h = dt.date.fromisoformat(HASTA)
if ':' in ARG:
    SEMANAS = [tuple(x.split(':')) for x in ARG.split(',')]
else:
    NS = int(ARG)
    SEMANAS = [((h - dt.timedelta(days=7 * (NS - k) - 1)).isoformat(), (h - dt.timedelta(days=7 * (NS - k - 1))).isoformat()) for k in range(NS)]
D0 = SEMANAS[0][0]
GRUPOS = {'calada': {f'RicCal0{n}': str(n) for n in range(1, 7)}, 'volcables': {f'SLZVolcableC{n}': f'V{n}' for n in range(1, 6)}}
dev2 = {d: (g, c) for g, m in GRUPOS.items() for d, c in m.items()}
# sectores enteros: horas con alguna lectura en cualquiera de sus cámaras (ocupación del sector)
SECTORES = {'Calada sólida': [f'RicCal0{n}' for n in range(1, 7)], 'Calada líquidos': ['RicCalLiq'], 'Calada San Lorenzo': ['SLZCalado', 'SLZCalCam'],
            'Volcables puerto': [f'SLZVolcableC{n}' for n in range(1, 6)]}
dev2.update({d: ('sector', k) for k, ds in SECTORES.items() for d in ds if d not in dev2})
sect = collections.defaultdict(list)   # sector → [t]
lect = collections.defaultdict(list)   # (grupo, calle) → [(t, patente)]
d = dt.date.fromisoformat(D0) - dt.timedelta(days=1)
while d <= h + dt.timedelta(days=1):
    f = os.path.join(ROOT, 'data', 'truckflow', d.isoformat(), 'event-list.json')
    if os.path.exists(f):
        for r in json.load(open(f, encoding='utf-8-sig'))['records']:
            gc = dev2.get(r.get('deviceCode') or '')
            if not gc or not r.get('occurredAt'): continue
            t = dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + SKEW
            if not D0 <= t.date().isoformat() <= HASTA: continue
            for k, ds in SECTORES.items():
                if r['deviceCode'] in ds: sect[k].append(t)
            if gc[0] != 'sector': lect[gc].append((t, (r.get('truckPlate') or '').upper()))
    d += dt.timedelta(days=1)
out = {'criterio': 'camiones = patentes distintas por visita (misma patente y calle a menos de 60 min = un camión); horas = horas reloj con al menos una lectura; hora operativa = occurredAt + 206 min',
       'semanas': [{'desde': a, 'hasta': b} for a, b in SEMANAS], 'grupos': {}}
for g, m in GRUPOS.items():
    out['grupos'][g] = {}
    for dev, calle in m.items():
        rs = sorted(lect[(g, calle)])
        fila = []
        for a, b in SEMANAS:
            w = [(t, p) for t, p in rs if a <= t.date().isoformat() <= b]
            ult, cam = {}, 0
            for t, p in w:
                if p and (p not in ult or t - ult[p] > dt.timedelta(minutes=60)): cam += 1
                if p: ult[p] = t
            fila.append({'camiones': cam, 'horas': len({t.replace(minute=0, second=0, microsecond=0) for t, p in w})})
        out['grupos'][g][calle] = fila
hs = lambda a, b: ((dt.date.fromisoformat(b) - dt.date.fromisoformat(a)).days + 1) * 24
out['sectores'] = {k: [{'horas': len({t.replace(minute=0, second=0, microsecond=0) for t in sect[k] if a <= t.date().isoformat() <= b}), 'horasPeriodo': hs(a, b)} for a, b in SEMANAS] for k in SECTORES}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, f in out['sectores'].items(): print('sector', k, [(x['horas'], x['horasPeriodo']) for x in f])
for g in out['grupos']:
    for c, f in out['grupos'][g].items(): print(g, c, [(x['camiones'], x['horas']) for x in f])
