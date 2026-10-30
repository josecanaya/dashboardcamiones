"""Permanencia por planta x producto x operacion, ponderada por viajes.
Viaje = movimiento con ingreso y salida validos; semana por dia operativo de la salida (22 h del dia anterior -> 22 h).
Uso: python -I permanencia.py <salida.json>
"""
import json, sys, collections, datetime as dt, statistics as st

R = 'C:/Users/Usuario/Desktop/Dashboard_camiones/data/movimientos/'
FICT = {'XXXXXX', 'PPPPPP', 'TTTTTT', 'XXXX', 'PPPP', 'TTTT'}
NODO = {'RICARDONE': 'Ricardone', 'TERMINAL_EMBARQUE': 'Puerto San Lorenzo'}
SEM = {'act': ('2026-10-23', '2026-10-28'), 'ant': ('2026-10-16', '2026-10-22')}
# hueco de guardado del SGC: salidas sin registrar (vista de 24 h; sondeos 19/10 17:31 y 21/10 09:35)
HUECO = (dt.datetime(2026, 10, 19, 17, 31), dt.datetime(2026, 10, 20, 9, 35))

def familia(p):
    p = p.upper()
    if p == 'SOJA': return 'Soja'
    if p == 'GIRASOL': return 'Girasol'
    if p == 'CARTAMO': return 'Cártamo'
    if 'PELLET' in p: return 'Pellet de girasol'
    if 'CASCARA' in p: return 'Cáscara'
    if p.startswith('BORRA') or 'ACIDOS GRASOS' in p or 'LECITINA' in p: return 'Subproductos de refinería'
    if 'ACEITE' in p or p.startswith('ACGIRASOL'): return 'Aceite'
    if 'GLICERINA' in p: return 'Glicerina'
    if p.startswith('AGUA'): return 'Agua'
    if 'RESIDUO' in p or 'ESCORIA' in p or 'BARRIDO' in p or 'TIERRA' in p or 'CARTON' in p or 'TARIMA' in p or 'SEMILLA CON' in p: return 'Residuos y descartes'
    if any(x in p for x in ('METANOL', 'HEXANO', 'SODA', 'ACIDO', 'METILATO', 'NITROGENO', 'HIPOCLORITO', 'CARBON', 'BIODIESEL')): return 'Insumos químicos'
    if 'VARIOS' in p: return 'Productos varios'
    return 'Otros: ' + p.title()

def op_dia(t):  # dia operativo: desde las 22 h
    return (t + dt.timedelta(hours=2)).date().isoformat()

def parse(s):
    try: return dt.datetime.fromisoformat(s) if s else None
    except Exception: return None

rows, seen, dup = [], set(), 0
for d in range(14, 30):
    try: a = json.load(open(R + f'2026-10-{d:02d}/movimientos.json', encoding='utf-8'))
    except FileNotFoundError: continue
    for r in a:
        k = r['external_operation_id']
        if k in seen: dup += 1; continue
        seen.add(k); rows.append(r)

def operacion(r):
    if r['es_de_vuelta'] or str(r['ctg']).startswith('SGC_TR'): return 'Transile'
    return {'INGRESO': 'Recepción', 'EGRESO': 'Despacho', 'DESPACHO': 'Despacho'}.get(r['movement_type'], r['movement_type'].title())

out = {'criterio': 'permanencia = salida - ingreso del SGC/planilla (external_ingreso_at -> external_salida_at); semana por día operativo de la salida (22 h); grupos excluyentes planta x producto x operación; promedio general = Σ(prom grupo × viajes) / viajes',
       'semanas': SEM, 'duplicadosDescartados': dup, 'hueco': [HUECO[0].isoformat(), HUECO[1].isoformat()]}
viajes = {}
for w, (a, b) in SEM.items():
    V, calidad = [], collections.Counter()
    cob = collections.Counter()
    for r in rows:
        i, s = parse(r['external_ingreso_at']), parse(r['external_salida_at'])
        ref = s or i
        if not ref or not (a <= op_dia(ref) <= b): continue
        if r['planta_normalized'] not in NODO: calidad['otraPlanta'] += 1; continue
        if not i or not s: calidad['sinIngresoOSalida'] += 1; continue
        if s <= i: calidad['salidaAntesDeIngreso'] += 1; continue
        if r['plate_normalized'] in FICT: calidad['patenteFicticia'] += 1; continue
        if not r['product_normalized']: calidad['sinProducto'] += 1; continue
        m = (s - i).total_seconds() / 60
        if m > 7 * 24 * 60: calidad['masDe7Dias'] += 1; continue
        cob[op_dia(s)] += 1
        V.append({'planta': NODO[r['planta_normalized']], 'familia': familia(r['product_normalized']), 'operacion': operacion(r),
                  'min': m, 'dia': op_dia(s), 'ingreso': r['external_ingreso_at'], 'salida': r['external_salida_at'],
                  'patente': r['plate_normalized'], 'fuente': 'SGC' if r['source_file'].startswith('SGC') else 'Excel',
                  'kg': float(r['kgs_neto'] or 0) if str(r['kgs_neto']).replace('.', '').isdigit() else 0})
    viajes[w] = V
    out[w] = {'viajes': len(V), 'excluidos': dict(calidad), 'porDia': dict(sorted(cob.items())),
              'fuentePorDia': {d: dict(collections.Counter(v['fuente'] for v in V if v['dia'] == d)) for d in sorted(cob)}}

def grupos(V):
    g = collections.defaultdict(list)
    for v in V: g[(v['planta'], v['familia'], v['operacion'])].append(v['min'])
    return g

GA, GP = grupos(viajes['act']), grupos(viajes['ant'])
NA, NP = len(viajes['act']), len(viajes['ant'])
tabla = []
for k in sorted(set(GA) | set(GP), key=lambda k: -len(GA.get(k, []))):
    a, p = GA.get(k, []), GP.get(k, [])
    tabla.append({'planta': k[0], 'familia': k[1], 'operacion': k[2], 'viajes': len(a), 'part': len(a) / NA if NA else 0,
                  'prom': st.mean(a) if a else None, 'mediana': st.median(a) if a else None,
                  'viajesAnt': len(p), 'partAnt': len(p) / NP if NP else 0, 'promAnt': st.mean(p) if p else None,
                  'var': (st.mean(a) - st.mean(p)) if a and p else None})
out['tabla'] = tabla
pond = lambda G, N: sum(st.mean(x) * len(x) for x in G.values()) / N
directo = lambda V: st.mean(v['min'] for v in V)
out['general'] = {'act': pond(GA, NA), 'actDirecto': directo(viajes['act']), 'ant': pond(GP, NP), 'antDirecto': directo(viajes['ant'])}
# mezcla constante: pesos = participacion por viajes de la semana anterior, solo grupos presentes en ambas
com = [k for k in GP if k in GA]
wsum = sum(len(GP[k]) for k in com)
mc = {'referencia': 'pesos = viajes de cada grupo en 16–22/10 (grupos presentes en ambas semanas)',
      'gruposComunes': len(com), 'viajesAntCubiertos': wsum,
      'soloAnt': [{'g': ' · '.join(k), 'viajes': len(GP[k])} for k in GP if k not in GA],
      'soloAct': [{'g': ' · '.join(k), 'viajes': len(GA[k])} for k in GA if k not in GP],
      'act': sum(st.mean(GA[k]) * len(GP[k]) for k in com) / wsum,
      'ant': sum(st.mean(GP[k]) * len(GP[k]) for k in com) / wsum}
out['mezclaConstante'] = mc
# descomposicion: cambio total = efecto tiempos (con mezcla anterior) + efecto mezcla (resto)
out['descomposicion'] = {'total': out['general']['act'] - out['general']['ant'], 'tiempos': mc['act'] - mc['ant']}
out['descomposicion']['mezcla'] = out['descomposicion']['total'] - out['descomposicion']['tiempos']
# por planta y operacion (consolidado, ponderado)
for nivel, key in (('porPlanta', lambda v: v['planta']), ('porOperacion', lambda v: v['planta'] + ' · ' + v['operacion'])):
    res = {}
    for w in ('act', 'ant'):
        g = collections.defaultdict(list)
        for v in viajes[w]: g[key(v)].append(v['min'])
        for k, x in g.items(): res.setdefault(k, {})[w] = {'viajes': len(x), 'prom': st.mean(x)}
    out[nivel] = res
# en planta al cierre (28/10 22 h): ingreso antes del corte y salida despues
corte = dt.datetime(2026, 10, 28, 22, 0)
ep = []
for r in rows:
    i, s = parse(r['external_ingreso_at']), parse(r['external_salida_at'])
    if r['planta_normalized'] in NODO and i and i < corte and (not s or s > corte):
        ep.append({'planta': NODO[r['planta_normalized']], 'familia': familia(r['product_normalized']), 'operacion': operacion(r),
                   'acumMin': (corte - i).total_seconds() / 60, 'patente': r['plate_normalized']})
out['enPlantaAlCierre'] = {'corte': corte.isoformat(), 'camiones': len(ep),
                           'porGrupo': dict(collections.Counter(f"{e['planta']} · {e['familia']} · {e['operacion']}" for e in ep)),
                           'acumMedia': st.mean(e['acumMin'] for e in ep) if ep else None,
                           'mas24h': sum(1 for e in ep if e['acumMin'] > 1440)}
# viajes largos (para leer la media)
for w in ('act', 'ant'):
    out[w]['mas24h'] = sum(1 for v in viajes[w] if v['min'] > 1440)
json.dump({**out, 'viajesAct': viajes['act'], 'viajesAnt': viajes['ant']}, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
sys.stdout.reconfigure(encoding='utf-8')
print(json.dumps({k: out[k] for k in ('act', 'ant', 'general', 'descomposicion', 'enPlantaAlCierre', 'duplicadosDescartados')}, ensure_ascii=False, indent=1, default=str))
print(json.dumps({k: v for k, v in mc.items()}, ensure_ascii=False, default=str))
for t in tabla:
    f = lambda x: '-' if x is None else round(x)
    print(f"{t['planta'][:9]:9} {t['familia'][:26]:26} {t['operacion'][:10]:10} {t['viajes']:4} {t['part']*100:5.1f}% {f(t['prom']):>5} med {f(t['mediana']):>5} | ant {t['viajesAnt']:4} {f(t['promAnt']):>5} var {f(t['var'])}")
print(json.dumps(out['porOperacion'], ensure_ascii=False))
