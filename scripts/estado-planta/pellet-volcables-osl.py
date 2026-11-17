"""Operativo de pellet: en qué volcables descargó, cuándo se abrió cada una y cómo cambió la espera en Playa OSL.
Viajes = cartas de pellet (tipo 284, derivado 199, Ricardone → puerto); lecturas = las que el vínculo de lecturas
(scripts/vinculo/cobertura.mjs) asignó a cada carta, solo las de ese viaje (salida de la carta −1 h a +8 h).
Volcable = primera lectura SLZVolcableC1–C5 del viaje. Espera en Playa OSL = Ingreso del puerto → Balanza de ingreso.
Apertura de una volcable = primera hora desde la que descarga pellet de forma seguida (3 o más viajes en 3 h).
Uso: python scripts/estado-planta/pellet-volcables-osl.py <cartas.json> <cobertura.json> <salida.json>
"""
import json, sys, collections, datetime as dt, statistics as st
sys.stdout.reconfigure(encoding='utf-8')
CF, VF, OUT = sys.argv[1:4]
H = lambda s, y: dt.datetime.strptime(f'{y}-{s}', '%Y-%m-%d %H:%M')
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
C = {x['ctg']: x for x in json.load(open(CF, encoding='utf-8')) if x['typeCode'] == 284 and x.get('derivedProductCode') == 199
     and x['originPlant'] == '21832' and x['plant'] == '25567' and x.get('stateCode') != 'AN' and x.get('departure')}
V = json.load(open(VF, encoding='utf-8'))
viajes = []
for t in V['camiones']:
    c = C.get(t['ctg'])
    if not c: continue
    dep = loc(c['departure'])
    L = sorted((H(l['hora'], l['at'][:4]), l['nodo'], l.get('camara') or '') for l in t['lecturas'])
    L = [x for x in L if dep - dt.timedelta(hours=1) <= x[0] <= dep + dt.timedelta(hours=8)]
    g = lambda n: next((x[0] for x in L if x[1] == n), None)
    vs = [x for x in L if x[1] == 'san_lorenzo:Plataformas Volcables' and x[2].startswith('SLZVolcableC')]
    si, sb = g('san_lorenzo:Ingreso'), g('san_lorenzo:Balanza Ingreso'); se = g('san_lorenzo:Egreso') or g('san_lorenzo:Balanza Egreso')
    esp = (sb - si).total_seconds() / 60 if si and sb and 0 <= (sb - si).total_seconds() <= 12 * 3600 else None
    viajes.append({'patente': t['plate'], 'salida': dep, 'ingreso': si, 'balanza': sb, 'espera': esp, 'egreso': se,
                   'volcable': 'V' + vs[0][2][-1] if vs else None, 'tv': vs[0][0] if vs else None})
# apertura de cada volcable: primera lectura con 3 o más viajes de pellet en las 3 h siguientes
aper = {}
for k in sorted({v['volcable'] for v in viajes if v['volcable']}):
    ts = sorted(v['tv'] for v in viajes if v['volcable'] == k)
    aper[k] = next((a for a in ts if sum(1 for b in ts if a <= b <= a + dt.timedelta(hours=3)) >= 3), ts[0])
# espera en Playa OSL por hora de ingreso al puerto y cuántas volcables descargaban pellet en esa hora
hs = sorted({v['ingreso'].replace(minute=0) for v in viajes if v['ingreso']})
def activas(h): return sorted({v['volcable'] for v in viajes if v['tv'] and h <= v['tv'] < h + dt.timedelta(hours=1)})
porHora = [{'hora': h.strftime('%Y-%m-%d %H:00'), 'llegadas': sum(1 for v in viajes if v['ingreso'] and v['ingreso'].replace(minute=0) == h),
            'esperaMedia': round(st.mean(e)) if (e := [v['espera'] for v in viajes if v['ingreso'] and v['ingreso'].replace(minute=0) == h and v['espera'] is not None]) else None,
            'descargas': sum(1 for v in viajes if v['tv'] and h <= v['tv'] < h + dt.timedelta(hours=1)), 'volcables': activas(h)} for h in hs]
v3 = aper.get('V3')
v3c = max(v['tv'] for v in viajes if v['volcable'] == 'V3') if v3 else None
def bloque(ivs):   # ingresos y egresos del puerto por hora, espera de los que ingresaron, sumando los intervalos [(a, b), ...]
    en = lambda t: t and any(a <= t < b for a, b in ivs)
    xs = [v for v in viajes if en(v['ingreso'])]
    e = [v['espera'] for v in xs if v['espera'] is not None]
    dur = max(1, sum((b - a).total_seconds() for a, b in ivs) / 3600)
    des = [v for v in viajes if en(v['tv'])]
    return {'desde': ivs[0][0].strftime('%Y-%m-%d %H:%M'), 'hasta': ivs[-1][1].strftime('%Y-%m-%d %H:%M'), 'intervalos': [(a.strftime('%Y-%m-%d %H:%M'), b.strftime('%Y-%m-%d %H:%M')) for a, b in ivs],
            'horas': round(dur, 1), 'viajes': len(xs), 'esperaMedia': round(st.mean(e)) if e else None, 'esperaMediana': round(st.median(e)) if e else None, 'n': len(e),
            'llegadasPorHora': round(len(xs) / dur, 1), 'salidasPorHora': round(sum(1 for v in viajes if en(v['egreso'])) / dur, 1),
            'porVolcable': dict(collections.Counter(v['volcable'] for v in des))}
# la fila: desde la primera hora con espera media de 1 h o más antes de abrir la V3
cola0 = next((dt.datetime.fromisoformat(x['hora']) for x in porHora if x['esperaMedia'] and x['esperaMedia'] >= 60 and (not v3 or dt.datetime.fromisoformat(x['hora']) < v3)), None)
# pausas de la V3 (5 h o más sin descargar pellet mientras estuvo abierta)
tv3 = sorted(v['tv'] for v in viajes if v['volcable'] == 'V3')
pausas = [(a.strftime('%Y-%m-%d %H:%M'), b.strftime('%Y-%m-%d %H:%M')) for a, b in zip(tv3, tv3[1:]) if (b - a).total_seconds() >= 5 * 3600 - 60]
# horas con la V3 descargando: de la apertura al cierre sin las pausas (comparación pedida: sábado antes de abrir contra V3 activa)
activos, _a = [], v3
for pa, pb in [(a, b) for a, b in zip(tv3, tv3[1:]) if (b - a).total_seconds() >= 5 * 3600 - 60]: activos.append((_a, pa)); _a = pb
if v3: activos.append((_a, v3c))
# camiones esperando en Playa OSL en cada hora (entraron al puerto y todavía no pasaron la balanza), sábado a lunes del operativo
_ini = (v3.replace(hour=0, minute=0) if v3 else min(v['ingreso'] for v in viajes if v['ingreso']).replace(hour=0, minute=0))
_fin = (v3c.replace(hour=0, minute=0) + dt.timedelta(days=1)) if v3c else _ini + dt.timedelta(days=3)
esperando, _h = [], _ini
while _h < _fin:
    n = sum(1 for v in viajes if v['ingreso'] and v['balanza'] and v['espera'] is not None and v['ingreso'] < _h + dt.timedelta(hours=1) and v['balanza'] > _h)
    esperando.append({'hora': _h.strftime('%Y-%m-%d %H:00'), 'camiones': n}); _h += dt.timedelta(hours=1)
out = {'criterio': __doc__.split('Uso:')[0].strip(), 'viajes': len(viajes), 'esperandoPorHora': esperando, 'conEspera': sum(1 for v in viajes if v['espera'] is not None),
       'apertura': {k: t.strftime('%Y-%m-%d %H:%M') for k, t in aper.items()},
       'cierre': {k: max(v['tv'] for v in viajes if v['volcable'] == k).strftime('%Y-%m-%d %H:%M') for k in aper},   # última descarga de pellet en esa volcable
       'pausasV3': pausas, 'inicioFila': cola0.strftime('%Y-%m-%d %H:%M') if cola0 else None,
       'porVolcable': dict(collections.Counter(v['volcable'] for v in viajes)),
       'antesV3': bloque([(v3.replace(hour=0, minute=0), v3)]) if v3 else None, 'despuesV3': bloque(activos) if v3 else None, 'porHora': porHora}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('apertura', out['apertura'], 'cierre', out['cierre'], 'fila desde', out['inicioFila']); print('pausas V3', pausas)
print('antes de V3', out['antesV3']); print('con V3', out['despuesV3'])
# récord previo: el día con más egresos de pellet de Ricardone desde junio en el registro de la balanza, antes de este operativo
import glob, os
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ini_op = min(v['salida'] for v in viajes)
_rows = {}
for f in glob.glob(os.path.join(ROOT, 'data', 'movimientos', '2026-*', 'movimientos.json')):
    try:
        for x in json.load(open(f, encoding='utf-8')): _rows[x['external_operation_id']] = x
    except Exception: pass
_c = collections.Counter()
for x in _rows.values():
    if x.get('planta_normalized') == 'RICARDONE' and x.get('movement_type') == 'EGRESO' and 'PELLET' in (x.get('product_normalized') or '') and x.get('external_ingreso_at') and not x.get('baja'):
        d = (dt.datetime.fromisoformat(x['external_ingreso_at'][:19]) + dt.timedelta(hours=2)).date()
        if dt.date(ini_op.year, 6, 1) <= d < (ini_op + dt.timedelta(hours=2)).date(): _c[d.isoformat()] += 1
out['recordPrevio'] = dict(zip(('dia', 'viajes'), _c.most_common(1)[0])) if _c else None
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('récord previo desde junio', out['recordPrevio'])
# por día operativo (22 h): ingresos y egresos del puerto, el pico de egresos en una hora y en qué volcables descargó
odia = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
pd_ = collections.defaultdict(lambda: {'ingresos': 0, 'egresos': 0, 'egresosHora': collections.Counter(), 'volcables': collections.Counter(), 'espera': []})
for v in viajes:
    if v['ingreso']: pd_[odia(v['ingreso'])]['ingresos'] += 1
    if v['espera'] is not None and v['ingreso']: pd_[odia(v['ingreso'])]['espera'].append(v['espera'])
    if v['egreso']: pd_[odia(v['egreso'])]['egresos'] += 1; pd_[odia(v['egreso'])]['egresosHora'][v['egreso'].strftime('%H')] += 1
    if v['tv']: pd_[odia(v['tv'])]['volcables'][v['volcable']] += 1
out['porDiaPuerto'] = {d: {'ingresos': x['ingresos'], 'egresos': x['egresos'], 'maxEgresosHora': max(x['egresosHora'].values(), default=0),
                           'volcables': dict(x['volcables']), 'esperaOsl': round(st.mean(x['espera'])) if x['espera'] else None} for d, x in sorted(pd_.items())}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for d, x in out['porDiaPuerto'].items(): print(d, x)
# descargas por hora y volcable (primera lectura de volcable de cada viaje), todo el operativo
_t0 = min(v['tv'] for v in viajes if v['tv']).replace(minute=0); _t1 = max(v['tv'] for v in viajes if v['tv']).replace(minute=0)
dh, _h = [], _t0
while _h <= _t1:
    c_ = collections.Counter(v['volcable'] for v in viajes if v['tv'] and _h <= v['tv'] < _h + dt.timedelta(hours=1))
    dh.append({'hora': _h.strftime('%Y-%m-%d %H:00'), **dict(c_)}); _h += dt.timedelta(hours=1)
out['descargasPorHora'] = dh
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
