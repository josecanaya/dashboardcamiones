"""Despachos de Vicentin a terceros por cartas de porte (p. ej. girasol del silo Chief a Molinos Agro): viajes, camiones,
viajes por camión, destino y cruce con los egresos de la planilla (SGC) por patente.
Carta = tipo 74 (granos) con origen Vicentin (planta 21832) y destino con otro CUIT. Día = día operativo (22 h) de la partida.
Uso: python scripts/estado-planta/despachos-cartas.py <cartas.json> <desde> <hasta> <salida.json>
VICENTIN_ROOT = raíz con data/movimientos.
"""
import json, os, sys, collections, datetime as dt
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CF, D0, D1, OUT = sys.argv[1:5]
VIC = '30500959629'
loc = lambda s: dt.datetime.fromisoformat(s.replace('Z', '')) - dt.timedelta(hours=3)
od = lambda t: (t + dt.timedelta(hours=2)).date().isoformat()
C = [x for x in json.load(open(CF, encoding='utf-8')) if x['typeCode'] == 74 and x.get('originCuit') == VIC and x['originPlant'] == '21832'
     and x.get('destCuit') != VIC and x.get('stateCode') != 'AN' and x.get('departure') and D0 <= od(loc(x['departure'])) <= D1]
# egresos de la planilla por patente (control)
eg = collections.defaultdict(list)
lo = (dt.date.fromisoformat(D0) - dt.timedelta(days=1)).isoformat(); hi = (dt.date.fromisoformat(D1) + dt.timedelta(days=2)).isoformat()
seen = set()
for d in sorted(os.listdir(os.path.join(ROOT, 'data', 'movimientos'))):
    f = os.path.join(ROOT, 'data', 'movimientos', d, 'movimientos.json')
    if not (lo <= d <= hi) or not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8')):
        if r['external_operation_id'] in seen or r.get('planta_normalized') != 'RICARDONE': continue
        seen.add(r['external_operation_id'])
        if r.get('external_salida_at'): eg[r['plate_normalized']].append(dt.datetime.fromisoformat(r['external_salida_at'][:19]))
out = {'desde': D0, 'hasta': D1, 'criterio': __doc__.split('Uso:')[0].strip(), 'grupos': []}
for (grano, dest, cuit), cs in collections.Counter((x['grain'], x['plant'], x['destCuit']) for x in C).items():
    xs = [x for x in C if (x['grain'], x['plant'], x['destCuit']) == (grano, dest, cuit)]
    vpc = collections.Counter(x['plates'][0] for x in xs)
    con_sgc = sum(1 for x in xs if any(abs((t - loc(x['departure'])).total_seconds()) <= 12 * 3600 for p in x['plates'] for t in eg.get(p, [])))
    out['grupos'].append({'grano': grano, 'plantaDestino': dest, 'cuitDestino': cuit, 'viajes': len(xs), 'camiones': len(vpc),
                          'toneladas': round(sum((x.get('grossKg') or 0) - (x.get('tareKg') or 0) for x in xs) / 1000),
                          'porDia': dict(sorted(collections.Counter(od(loc(x['departure'])) for x in xs).items())),
                          'viajesPorCamion': dict(sorted(collections.Counter(vpc.values()).items())), 'camionesTop': vpc.most_common(15),
                          'conEgresoSgc': con_sgc})
out['grupos'].sort(key=lambda g: -g['viajes'])
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for g in out['grupos']: print(g['grano'], '→', g['plantaDestino'], g['cuitDestino'], g['viajes'], 'viajes', g['camiones'], 'camiones', g['toneladas'], 't · con egreso SGC', g['conEgresoSgc'])
