"""Tiempo en planta ponderado por viajes, por producto y planta, para uno o más períodos.
Planilla (data/movimientos): tiempo = salida − ingreso; período por día operativo de la salida (22 h).
Soja R7 (ingreso Ricardone, salida puerto): cada viaje toma de su semana el tiempo de cámaras en Ricardone y del
interplanta (paquete semanal de la corrida); Ricardone = ese tiempo, San Lorenzo = total − Ricardone − interplanta.
Total del producto: soja y pellet = Ricardone + San Lorenzo (el mismo camión pasa por las dos, sin interplanta); líquidos =
las dos plantas ponderadas por sus viajes. Nodo Sur = viajes de nodo (soja y pellet una vez, con su total) ponderados.
Girasol (recepción): con --girasol-serie, cada viaje toma el tiempo publicado del comité que lo cubre (suma de tramos por
cámaras), como en los comités; sin la serie, salida − ingreso del SGC.
Uso: python scripts/estado-planta/ponderado-producto.py <salida.json> <nombre:desde:hasta> [...] [--girasol-serie <json>]
  --girasol-serie: {"comites": [["AAAA-MM-DD", minutos], ...]} (fecha del comité, que informa los días previos).
  Paquetes semanales: data/cache/paquetes-semana/<lunes>.json (se arman con paquete-periodo.ts desde
  runs/windows/<lunes>_<domingo> si faltan; una semana sin corrida usa la media de las otras).
VICENTIN_ROOT = raíz con data/ y runs/.
"""
import json, os, re, sys, subprocess, datetime as dt, collections
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.environ.get('VICENTIN_ROOT') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MOV = os.path.join(ROOT, 'data', 'movimientos')
CACHE = os.path.join(ROOT, 'data', 'cache', 'paquetes-semana')
ARGS = sys.argv[1:]
GS = None
if '--girasol-serie' in ARGS:
    k = ARGS.index('--girasol-serie'); GS = sorted(json.load(open(ARGS[k + 1], encoding='utf-8'))['comites']); ARGS = ARGS[:k] + ARGS[k + 2:]
OUT = ARGS[0]
PER = {a: (b, c) for a, b, c in (x.split(':') for x in ARGS[1:])}
gir_pub = lambda od: next((m for f, m in GS if od <= f), GS[-1][1]) if GS else None
D0, D1 = min(v[0] for v in PER.values()), max(v[1] for v in PER.values())
day = lambda s: dt.date.fromisoformat(s)
LIQ = re.compile(r'BORRA|GLICERIN|^(ACEITE|AC |ACGIRASOL)|METANOL|METILATO|SODA CAUSTICA|ACIDO|HIPOCLORITO|BIODIESEL|LECITINA')
NOLIQ = re.compile(r'ENVASADO|^AGUA|ALCOHOL|NITROGENO|THIN STILLAGE|SAL GLICERINOSA')
FICT = re.compile(r'^(.)\1+$')

def prod(planta, p):
    if p == 'SOJA': return 'Soja'
    if p == 'GIRASOL' and planta == 'RICARDONE': return 'Girasol'
    if 'PELLET' in p: return 'Pellet'
    if LIQ.search(p) and not NOLIQ.search(p): return 'Líquidos'
    return None

# ---- semanas lunes→domingo que cubren el rango y su tiempo de Ricardone por cámaras
lun = day(D0) - dt.timedelta(days=day(D0).weekday())
SEMANAS = []
while lun <= day(D1): SEMANAS.append(lun.isoformat()); lun += dt.timedelta(days=7)
os.makedirs(CACHE, exist_ok=True)
TSX = os.path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
CAM = {}
for w in SEMANAS:
    f = os.path.join(CACHE, w + '.json'); fin = (day(w) + dt.timedelta(days=6)).isoformat()
    run = os.path.join(ROOT, 'runs', 'windows', f'{w}_{fin}')
    if not os.path.exists(f) and os.path.exists(os.path.join(run, 'manifest.json')):
        subprocess.run(['node', '--max-old-space-size=6144', TSX, 'scripts/estado-planta/paquete-periodo.ts', f, w, fin, f'{run}:{w}:{fin}'], cwd=ROOT, capture_output=True)
    try:
        s = json.load(open(f, encoding='utf-8'))['tiempos']['soja']['periodo']
        CAM[w] = (s.get('ricMediaMin'), s.get('bridgeMediaMin') or 12)
    except Exception:
        CAM[w] = (None, 12)
_ok = [v[0] for v in CAM.values() if v[0]]
SIN_CAM = [w for w, v in CAM.items() if not v[0]]
CAM = {w: (v[0] or (sum(_ok) / len(_ok) if _ok else 100), v[1]) for w, v in CAM.items()}
sem = lambda d: next(s for s in reversed(SEMANAS) if d >= s)

rows, seen = [], set()
lo, hi = (day(D0) - dt.timedelta(days=3)).isoformat(), (day(D1) + dt.timedelta(days=3)).isoformat()
for d in sorted(os.listdir(MOV)):
    if not (lo <= d <= hi): continue
    f = os.path.join(MOV, d, 'movimientos.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8')):
        if r['external_operation_id'] in seen: continue
        seen.add(r['external_operation_id']); rows.append(r)

V = collections.defaultdict(list)   # (período, producto, planta) -> minutos por viaje
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
    pers = [k for k, (a, b) in PER.items() if a <= od <= b]
    if not pers: continue
    m = (s - i).total_seconds() / 60
    if FICT.match(r['plate_normalized'] or 'X'): exc['patente ficticia'] += 1; continue
    if m < 5: exc['menos de 5 min'] += 1; continue
    if m > 3 * 1440: exc['más de 3 días'] += 1; continue
    if p == 'Girasol' and GS: m = gir_pub(od)
    for k in pers:
        if p == 'Soja' and pl == 'San Lorenzo' and r['movement_type'] == 'INGRESO':   # R7
            ric, br = CAM[sem(od)]
            V[(k, p, 'Ricardone')].append(ric); V[(k, p, 'San Lorenzo')].append(m - ric - br)
        else:
            V[(k, p, pl)].append(m)

mean = lambda x: sum(x) / len(x) if x else None
out = {'periodos': PER, 'criterio': __doc__.split('Uso:')[0].strip(), 'semanasSinCamaraRicardone': SIN_CAM, 'excluidos': dict(exc), 'productos': {}, 'plantas': {}}
for p in ('Soja', 'Girasol', 'Pellet', 'Líquidos'):
    out['productos'][p] = {}
    for k in PER:
        g = {pl: V[(k, p, pl)] for pl in ('Ricardone', 'San Lorenzo') if V.get((k, p, pl))}
        tot = [x for v in g.values() for x in v]
        tt = ({'n': max(len(v) for v in g.values()), 'prom': sum(mean(v) for v in g.values())} if p in ('Soja', 'Pellet') and len(g) == 2
              else {'n': len(tot), 'prom': mean(tot)})
        out['productos'][p][k] = {**{pl: {'n': len(v), 'prom': mean(v)} for pl, v in g.items()}, 'Total': tt}
for k in PER:   # por planta y Nodo Sur: todos los viajes de los cuatro productos, ponderados por viajes
    out['plantas'][k] = {}
    for pl in ('Ricardone', 'San Lorenzo'):
        x = [m for p in ('Soja', 'Girasol', 'Pellet', 'Líquidos') for m in V.get((k, p, pl), [])]
        out['plantas'][k][pl] = {'n': len(x), 'prom': mean(x)}
    t = [out['productos'][p][k]['Total'] for p in out['productos'] if out['productos'][p][k]['Total']['n']]
    n = sum(x['n'] for x in t)
    out['plantas'][k]['Nodo Sur'] = {'n': n, 'prom': sum(x['n'] * x['prom'] for x in t) / n if n else None}
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('excluidos', dict(exc), '· semanas sin cámaras de Ricardone', SIN_CAM)
for p, ms in out['productos'].items():
    for k, v in ms.items(): print(p, k, {a: (round(x['prom']) if x['prom'] is not None else None, x['n']) for a, x in v.items()})
for k, v in out['plantas'].items(): print('plantas', k, {a: (round(x['prom']) if x['prom'] else None, x['n']) for a, x in v.items()})
