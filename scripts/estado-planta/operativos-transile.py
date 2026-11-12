"""Operativos de transile entre Ricardone (21832) y el puerto (25567), contados por cartas de porte, y su velocidad.

Producto: pellet (tipo 284, derivado 199, Ricardone → puerto), soja de silos (tipo 74 Soja, Ricardone → puerto) y
girasol (tipo 74 Girasol, puerto → Ricardone). Sin anuladas. Un operativo = cartas del mismo producto y sentido sin un
hueco de más de 24 h entre salidas; se listan los de 40 cartas o más. Velocidad del operativo = toneladas / horas entre la
primera y la última salida; día pico = el día (calendario, hora local) con más toneladas / 24 h.

Uso: [HASTA=AAAA-MM-DD] python scripts/estado-planta/operativos-transile.py <salida.json> <cartas.json> [<cartas.json> ...]
"""
import collections, datetime as dt, json, os, sys

OUT, FILES = sys.argv[1], sys.argv[2:]
HASTA = dt.datetime.fromisoformat(os.environ['HASTA']) + dt.timedelta(hours=22) if os.environ.get('HASTA') else None   # corte del comité: fin del día operativo (22 h)
C = {}
for f in FILES:
    d = json.load(open(f, encoding='utf-8')); d = d if isinstance(d, list) else d.get('cartas', d)
    for x in d: C[str(x['ctg'])] = x
loc = lambda s: dt.datetime.fromisoformat(s[:19]) - dt.timedelta(hours=3)
def tipo(x):
    o, p = x.get('originPlant'), x.get('plant')
    if x.get('typeCode') == 284 and x.get('derivedProductCode') == 199 and o == '21832' and p == '25567': return 'Pellet'
    if x.get('typeCode') == 74 and x.get('grain') == 'Soja' and o == '21832' and p == '25567': return 'Soja de silos'
    if x.get('typeCode') == 74 and x.get('grain') == 'Girasol' and o == '25567' and p == '21832': return 'Girasol puerto→Ricardone'
cs = collections.defaultdict(list)
for x in C.values():
    t = tipo(x)
    if t and x.get('stateCode') != 'AN' and x.get('departure') and (not HASTA or loc(x['departure']) < HASTA):
        cs[t].append((loc(x['departure']), x['plates'][0], ((x.get('grossKg') or 0) - (x.get('tareKg') or 0)) / 1000))
ops = []
for t, v in cs.items():
    v.sort(); g = [v[0]]
    def cierra(g):
        if len(g) < 40: return
        a, b = g[0][0], g[-1][0]; hs = max(1, (b - a).total_seconds() / 3600); ton = sum(x[2] for x in g)
        pd = collections.Counter()
        for x in g: pd[x[0].strftime('%Y-%m-%d')] += x[2]
        dia, tdia = pd.most_common(1)[0]
        ops.append({'producto': t, 'desde': a.strftime('%Y-%m-%d %H:%M'), 'hasta': b.strftime('%Y-%m-%d %H:%M'), 'cartas': len(g),
                    'camiones': len({x[1] for x in g}), 'toneladas': round(ton), 'horas': round(hs), 'tHora': round(ton / hs),
                    'diaPico': dia, 'tHoraDiaPico': round(tdia / 24)})
    for x in v[1:]:
        if (x[0] - g[-1][0]).total_seconds() > 24 * 3600: cierra(g); g = []
        g.append(x)
    cierra(g)
ops.sort(key=lambda o: o['desde'])
json.dump({'criterio': __doc__.split('Uso:')[0].strip(), 'cartasLeidas': len(C),
           'rango': [min(x[0] for v in cs.values() for x in v).strftime('%Y-%m-%d'), max(x[0] for v in cs.values() for x in v).strftime('%Y-%m-%d')] if cs else None,
           'operativos': ops}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for o in ops: print(o['producto'], o['desde'][:10], o['hasta'][:10], o['cartas'], o['camiones'], o['toneladas'], o['horas'], o['tHora'], o['tHoraDiaPico'])
