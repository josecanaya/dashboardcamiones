"""Operativo de transile por cartas de porte + cámaras vinculadas (algoritmo de vínculo).
Viajes = cartas de porte (verdad); tiempos = lecturas de cámara que el vínculo (scripts/vinculo/cobertura.mjs) asignó
a esas cartas. Con varias vueltas por día, las lecturas de un camión se unen por patente y el viaje se corta cuando
vuelve a Ricardone después del puerto. Salida de Ricardone = Balanza Egreso (el transile no pasa por la salida
tradicional). Se corta también tras 8 h sin lecturas del camión. Día = día operativo (22 h) de la Balanza Egreso de Ricardone (o del ingreso al puerto).
Uso: python scripts/estado-planta/transile-cartas-camaras.py <cartas.json> <cobertura.json> <desde> <hasta> <salida.json> [tipo]
  tipo: pellet (por defecto: tipo 284, derivado 199, planta 21832 → 25567)
"""
import json, os, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, D0, D1, OUT = sys.argv[1:6]
TIPO = sys.argv[6] if len(sys.argv) > 6 else 'pellet'
FILTRO = {'pellet': lambda x: x['typeCode'] == 284 and x.get('derivedProductCode') == 199 and x['originPlant'] == '21832' and x['plant'] == '25567'}[TIPO]
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()          # hora local → día operativo
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
cartas = [x for x in json.load(open(CF, encoding='utf-8')) if FILTRO(x) and x.get('stateCode') != 'AN']
cartas = [x for x in cartas if D0 <= od(loc(x['departure'])) <= D1]
CT = {x['ctg'] for x in cartas}
V = json.load(open(VF, encoding='utf-8'))
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
R = collections.defaultdict(dict)
for t in V['camiones']:
    if t['ctg'] in CT:
        for l in t['lecturas']: R[t['plate']][(l['at'], l['nodo'])] = (H(l['hora'], l['at'][:4]), l['nodo'])
trips = []
for p, dd in R.items():
    cur = {'p': p, 'n': {}}
    last = None
    for t, n in sorted(dd.values()):
        # viaje nuevo: vuelve a Ricardone después del puerto, o más de 8 h sin lecturas (lecturas sueltas de antes del operativo)
        if cur['n'] and ((n.startswith('ricardone') and any(k.startswith('san_lorenzo') for k in cur['n'])) or (last and (t - last).total_seconds() > 8 * 3600)):
            trips.append(cur); cur = {'p': p, 'n': {}}
        cur['n'].setdefault(n, t); last = t
    trips.append(cur)
trips = [x for x in trips if 'ricardone:Balanza Egreso' in x['n'] or any(k.startswith('san_lorenzo') for k in x['n'])]
d = lambda a, b: (b - a).total_seconds() / 60 if a and b and 0 <= (b - a).total_seconds() <= 12 * 3600 else None
byp = collections.defaultdict(list)
for x in trips: x['t0'] = min(x['n'].values()); byp[x['p']].append(x)
TR = ['ric', 'playa3', 'ida', 'playaOsl', 'descarga', 'puerto', 'vuelta', 'ciclo']
for vs in byp.values():
    vs.sort(key=lambda x: x['t0'])
    for i, x in enumerate(vs):
        n = x['n']; g = lambda *ks: next((n[k] for k in ks if k in n), None)
        ri = g('ricardone:Ingreso', 'ricardone:Pre ingreso', 'ricardone:Calada', 'ricardone:Balanza Ingreso'); p3 = g('ricardone:Playa 3'); be = g('ricardone:Balanza Egreso')
        si = g('san_lorenzo:Ingreso', 'san_lorenzo:Balanza Ingreso'); sb = g('san_lorenzo:Balanza Ingreso'); sv = g('san_lorenzo:Plataformas Volcables'); se = g('san_lorenzo:Egreso', 'san_lorenzo:Balanza Egreso')
        nri = min(vs[i + 1]['n'].values()) if i + 1 < len(vs) else None
        x['_p3'] = (p3, be) if p3 and be and d(p3, be) is not None else None   # espera en Playa 3 hasta la carga
        x['_osl'] = (si, sb) if si and sb and d(si, sb) is not None else None  # espera en Playa OSL hasta la balanza
        x.update(dia=od(be or si) if (be or si) else None, ric=d(ri, be), playa3=d(p3, be), ida=d(be, si), playaOsl=d(si, sb), descarga=d(sb, sv), puerto=d(si, se), vuelta=d(se, nri))
        x['ciclo'] = sum(x[k] for k in ('ric', 'ida', 'puerto', 'vuelta')) if all(x[k] is not None for k in ('ric', 'ida', 'puerto', 'vuelta')) else None
sel = [x for x in trips if x['dia'] and D0 <= x['dia'] <= D1]
agg = lambda vs: {k: ({'media': round(st.mean(z)), 'mediana': round(st.median(z)), 'n': len(z)} if (z := [v[k] for v in vs if v[k] is not None]) else None) for k in TR}
dias = sorted({od(loc(x['departure'])) for x in cartas} | {x['dia'] for x in sel})
porCarta = collections.Counter(od(loc(x['departure'])) for x in cartas)
camCarta = collections.defaultdict(set)
for x in cartas: camCarta[od(loc(x['departure']))].add(x['plates'][0])
vpc = collections.Counter(x['plates'][0] for x in cartas)
out = {'tipo': TIPO, 'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(),
       'cartas': len(cartas), 'camiones': len(vpc), 'toneladas': round(sum((x.get('grossKg') or 0) - (x.get('tareKg') or 0) for x in cartas) / 1000),
       'estados': dict(collections.Counter(x['stateCode'] for x in cartas)), 'viajesCamara': len(sel),
       'viajesPorCamion': {'media': round(len(cartas) / max(1, len(vpc)), 1), 'max': vpc.most_common(3)},
       'tramos': agg(sel),
       'porDia': {dd: {'cartas': porCarta.get(dd, 0), 'camiones': len(camCarta.get(dd, ())), 'viajesCamara': sum(1 for x in sel if x['dia'] == dd), 'tramos': agg([x for x in sel if x['dia'] == dd])} for dd in dias},
       'ultimaCarta': max((x['issued'] for x in cartas), default=None)}
# camiones esperando por hora en cada playa: viajes cuyo intervalo de espera toca esa hora (hora local)
h0 = dt.datetime.fromisoformat(D0) - dt.timedelta(hours=2); h1 = dt.datetime.fromisoformat(D1) + dt.timedelta(hours=22)
hs = []
while h0 < h1: hs.append(h0); h0 += dt.timedelta(hours=1)
def ocup(key):
    iv = [x[key] for x in sel if x.get(key)]
    return [sum(1 for a, b in iv if a < h + dt.timedelta(hours=1) and b > h) for h in hs]
out['esperaPorHora'] = {'horas': [h.strftime('%Y-%m-%dT%H:00') for h in hs], 'playa3': ocup('_p3'), 'playaOsl': ocup('_osl'),
                        'nota': 'camiones con la espera abierta en esa hora (Playa 3 → Balanza Egreso de Ricardone; Ingreso → Balanza Ingreso del puerto), viajes vinculados por cámaras'}
# flota: viajes por camión (cartas) y duración de cada viaje por cámaras (primera lectura en Ricardone → última en el puerto)
dcart = {od(loc(x['departure'])) for x in cartas}
vs_ = [x for x in sel if x['dia'] in dcart]
for x in vs_: x['dur'] = (max(x['n'].values()) - min(x['n'].values())).total_seconds() / 3600
TR_ = [(0, 4, 'menos de 4 h'), (4, 8, '4 a 8 h'), (8, 12, '8 a 12 h'), (12, 24, '12 a 24 h'), (24, 999, 'más de 24 h')]
bin_ = lambda h: next(l for a, b, l in TR_ if a <= h < b)
cam = []
for pl, nv in vpc.items():
    mine = [x for x in vs_ if x['p'] == pl]
    cam.append({'patente': pl, 'viajes': nv, 'dias': len({od(loc(x['departure'])) for x in cartas if x['plates'][0] == pl}), 'viajesCamara': len(mine),
                'mas12': sum(1 for x in mine if x['dur'] > 12), 'durMax': round(max((x['dur'] for x in mine), default=0), 1),
                'durMediana': round(st.median([x['dur'] for x in mine]), 1) if mine else None})
# trabajo de corrido: lecturas de cámara del camión encadenadas; descansó solo si después de un egreso (Egreso de
# San Lorenzo, Salida 2 de Ricardone o cualquier Balanza Egreso) pasaron 6 h o más hasta la lectura siguiente.
# Un hueco largo después de otra cámara (p. ej. esperando en Playa 3) cuenta como trabajo.
PAUSA = float(os.environ.get('PAUSA_H', 6))
EGR = lambda n: n in ('san_lorenzo:Egreso', 'ricardone:Salida 2') or n.endswith(':Balanza Egreso')
corr = []
for pl in vpc:
    mine = [x for x in vs_ if x['p'] == pl]
    if not mine: continue
    t0, t1 = min(min(x['n'].values()) for x in mine), max(max(x['n'].values()) for x in mine)
    ls = sorted(v for v in R[pl].values() if t0 <= v[0] <= t1)
    cad = []
    for t, n in ls:
        if cad and not (cad[-1][2] and (t - cad[-1][1]).total_seconds() >= PAUSA * 3600): cad[-1][1:] = [t, EGR(n)]
        else: cad.append([t, t, EGR(n)])
    for a0, a1, _ in cad:
        nv = sum(1 for x in mine if a0 <= min(x['n'].values()) <= a1)
        corr.append({'patente': pl, 'desde': a0.strftime('%Y-%m-%d %H:%M'), 'hasta': a1.strftime('%Y-%m-%d %H:%M'), 'horas': round((a1 - a0).total_seconds() / 3600, 1), 'viajes': nv})
for c in cam:
    mc = [x for x in corr if x['patente'] == c['patente']]
    best = max(mc, key=lambda x: x['horas'], default=None)
    c['corridoMax'] = best['horas'] if best else None; c['corridoMaxViajes'] = best['viajes'] if best else None; c['corridoMaxDesde'] = best['desde'] if best else None
    c['tramosMas12'] = sum(1 for x in mc if x['horas'] > 12)
cam.sort(key=lambda c: -c['viajes'])
out['flota'] = {'camiones': cam, 'histViajes': dict(sorted(collections.Counter(c['viajes'] for c in cam).items())),
                'viajesMedidos': len(vs_), 'durMediana': round(st.median([x['dur'] for x in vs_]), 1) if vs_ else None,
                'porDuracion': {l: sum(1 for x in vs_ if bin_(x['dur']) == l) for _, _, l in TR_},
                'viajesMas12': sum(1 for x in vs_ if x['dur'] > 12), 'camionesMas12': sum(1 for c in cam if c['mas12']),
                'masLargos': [{'patente': x['p'], 'dia': x['dia'], 'horas': round(x['dur'], 1)} for x in sorted(vs_, key=lambda x: -x['dur'])[:8]],
                'pausaCorte': PAUSA, 'tramosCorridos': sorted(corr, key=lambda x: -x['horas']),
                'corridoPorCamion': {l: sum(1 for c in cam if c['corridoMax'] is not None and a <= c['corridoMax'] < b) for a, b, l in [(0, 8, 'menos de 8 h'), (8, 12, '8 a 12 h'), (12, 18, '12 a 18 h'), (18, 24, '18 a 24 h'), (24, 999, 'más de 24 h')]},
                'camionesCorridoMas12': sum(1 for c in cam if (c['corridoMax'] or 0) > 12),
                'nota': f'trabajo de corrido = lecturas de cámara encadenadas; descanso = {PAUSA:g} h o más sin lecturas después de un egreso (Egreso SL, Salida 2 Ricardone o Balanza Egreso); dura de la primera a la última lectura; viajes por camión = cartas de porte; duración del viaje = de la primera lectura en Ricardone a la última en el puerto (cámaras, algoritmo de vínculo), sin la vuelta; día = el de la Balanza Egreso de Ricardone'}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
E = out['esperaPorHora']; print('máximo esperando: Playa 3', max(E['playa3'] or [0]), '· Playa OSL', max(E['playaOsl'] or [0]))
F = out['flota']; print('corrido > 12 h:', F['camionesCorridoMas12'], 'camiones ·', F['corridoPorCamion'])
print('flota:', len(F['camiones']), 'camiones ·', F['viajesMedidos'], 'viajes medidos ·', F['viajesMas12'], 'de más de 12 h en', F['camionesMas12'], 'camiones ·', F['porDuracion'])
print(f"{TIPO}: {out['cartas']} cartas · {out['camiones']} camiones · {out['toneladas']} t · {len(sel)} viajes por cámaras")
for dd, v in out['porDia'].items():
    t = v['tramos']; print(dd, v['cartas'], 'cartas ·', ' '.join(f"{k} {t[k]['mediana']}" for k in TR if t[k]))
