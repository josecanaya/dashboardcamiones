"""Otros productos de Ricardone (cártamo, camelina…): descargas de granos que no son soja ni girasol, del SGC del período
(día operativo del ingreso), con su circuito por cámaras y el cruce con las cartas de porte.
Circuito: depósito CHIEF → R4 (volcable silo Chief); los tramos son por cámaras de la patente o el acoplado, cada punto
= primera lectura posterior al anterior (hora operativa = occurredAt + 206 min).
Uso: python scripts/estado-planta/otros-productos.py <cartas.json> <desde> <hasta> <salida.json>
"""
import os, json, re, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
B = ROOT.replace(chr(92), '/') + '/data/'
CF, D0, D1, OUT = sys.argv[1:5]
_d = lambda s, n: (dt.date.fromisoformat(s) + dt.timedelta(days=n)).isoformat()
DIAS_ALL, _x = [], _d(D0, -1)
while _x <= _d(D1, 2): DIAS_ALL.append(_x); _x = _d(_x, 1)
def jl(p, k=None):
    if not os.path.exists(p): return []
    j = json.load(open(p, encoding='utf-8-sig'))
    return j.get(k, []) if k else j
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA|HEXANO|AGUA')
FUERA = re.compile(r'^(SOJA|GIRASOL)$|PELLET|RESIDUO|PRODUCTOS VARIOS|BARRIDO|ENVASADO')
CIRC = {'CHIEF': ('R4', 'Descarga silo Chief', {'RicS7DescLinea1', 'RicS7DescLinea2'})}
RIC_ING, CAL = {'RicIngCamFrente', 'RicPreIngInFr'}, {'RicCal01', 'RicCal02', 'RicCal03', 'RicCal04', 'RicCal05'}
BAL_EGR = {'RicB1Egreso', 'RicB2Egreso', 'RicB3Egreso'}
BAL_ING = {'RicB1Ingreso', 'RicB2Ingreso', 'RicB3Ingreso'}
NOMBRE = {'CARTAMO': 'Cártamo', 'SEMILLA DE CAMELINA': 'Camelina', 'MAIZ': 'Maíz', 'GRANO DE ALGODON': 'Algodón'}
GRANO_ARCA = {'Grano 82': 'Camelina'}   # ARCA no nombra el código 82; el SGC lo registra como SEMILLA DE CAMELINA

ev = collections.defaultdict(list)
for d in DIAS_ALL:
    for r in jl(B + f'truckflow/{d}/event-list.json', 'records'):
        ev[r['truckPlate']].append((dt.datetime.fromisoformat(r['occurredAt']).replace(tzinfo=None) + dt.timedelta(minutes=206), r['deviceCode']))
for v in ev.values(): v.sort()
rows = {}
for d in DIAS_ALL:
    for r in jl(B + f'movimientos/{d}/movimientos.json'): rows[r['external_operation_id']] = r
cartas = [c for c in json.load(open(CF, encoding='utf-8')) if c.get('typeCode') == 74]

V = collections.defaultdict(list)
for r in rows.values():
    p = r['product_normalized'] or ''
    if r['planta_normalized'] != 'RICARDONE' or r['movement_type'] != 'INGRESO' or r.get('baja') or not r['external_salida_at']: continue
    if LIQ.search(p) or FUERA.search(p): continue
    i = dt.datetime.fromisoformat(r['external_ingreso_at']); s = dt.datetime.fromisoformat(r['external_salida_at'])
    od = (i + dt.timedelta(hours=2)).date().isoformat()
    if not (D0 <= od <= D1): continue
    V[p].append((r, i, s, od))

out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(), 'productos': []}
for p, xs in sorted(V.items(), key=lambda kv: -len(kv[1])):
    dep = collections.Counter(re.sub(r'\s*\d+$', '', r['deposito'] or 'sin depósito') for r, *_ in xs).most_common(1)[0][0]
    cid, cdesc, cdevs = CIRC.get(dep, (None, None, set()))
    # tramos pedidos: calada → balanza de ingreso → Playa 3 → descarga → balanza de egreso. La cámara de la balanza de ingreso
    # casi no lee estos camiones: calada → Playa 3 queda como un tramo (incluye la pesada)
    puntos = [('Calada', CAL), ('Playa 3', {'RicS6Playa3'})] + ([('Descarga', cdevs)] if cdevs else []) + [('Balanza egreso', BAL_EGR)]
    tr = collections.defaultdict(list); dia = collections.Counter(); kg = 0; con_carta = 0; ctg = set()
    for r, i, s, od in xs:
        dia[od] += 1; kg += float(r['kgs_neto'] or 0)
        pl = [x for x in (r['plate_normalized'], r.get('patente_acoplado') or '') if x]
        rs = sorted(e for x in pl for e in ev.get(x, []) if i - dt.timedelta(minutes=60) <= e[0] <= s + dt.timedelta(minutes=20))
        prev, marcas = None, []
        for n, devs in puntos:
            t = next((e[0] for e in rs if e[1] in devs and (prev is None or e[0] >= prev)), None)
            marcas.append((n, t)); prev = t or prev
        for (a, ta), (b, tb) in zip(marcas, marcas[1:]):
            if ta and tb: tr[f'{a} → {b}'].append((tb - ta).total_seconds() / 60)
        cs = [c for c in cartas if set(pl) & set(c['plates']) and c.get('stateCode') != 'AN']
        con_carta += bool(cs); ctg.update(c['ctg'] for c in cs)
    tot = [(s - i).total_seconds() / 60 for _, i, s, _ in xs]
    # cartas del grano a Vicentin, aunque el camión todavía no haya llegado
    gr = NOMBRE.get(p, p.title())
    cg = [c for c in cartas if GRANO_ARCA.get(c['grain'], c['grain']).lower() == gr.lower()]
    est = collections.Counter(c['stateCode'] for c in cg)
    out['productos'].append({'producto': p, 'nombre': gr, 'deposito': dep, 'circuito': cid, 'descarga': cdesc, 'viajes': len(xs), 'kg': kg,
                             'porDia': {d: dia[d] for d in sorted({x for x in DIAS_ALL if D0 <= x <= D1})},
                             'totalMedia': st.mean(tot), 'totalMediana': st.median(tot), 'conCarta': con_carta,
                             'tramos': [{'tramo': f'{a} → {b}', 'media': st.mean(tr[f'{a} → {b}']), 'mediana': st.median(tr[f'{a} → {b}']), 'n': len(tr[f'{a} → {b}'])}
                                        for (a, _), (b, _) in zip(puntos, puntos[1:]) if tr.get(f'{a} → {b}')],
                             'cartas': {'total': len(cg), 'estados': dict(est), 'plantas': dict(collections.Counter(c['plant'] for c in cg)),
                                        'remitentes': len({c['originCuit'] for c in cg}), 'distanciaKm': [min((c['distanceKm'] for c in cg), default=None), max((c['distanceKm'] for c in cg), default=None)]}})
    q = out['productos'][-1]
    print(f"== {gr}: {q['viajes']} viajes, {round(kg / 1000)} t, {dep} → {cid}, planilla {q['totalMedia']:.0f} min, con carta {con_carta}, cartas {len(cg)} {dict(est)}")
    for x in q['tramos']: print(f"   {x['tramo']:40} media {x['media']:5.0f}  mediana {x['mediana']:5.0f}  n {x['n']}")
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
