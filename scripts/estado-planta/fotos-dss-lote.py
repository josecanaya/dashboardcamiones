# Baja del DSS (vía el server local /api/truckflow/camera-captures) fotos de lecturas de cámara en lote.
# Uso:
#   python scripts/estado-planta/fotos-dss-lote.py calles <carpeta comité seguridad>       → cada lectura de volcable de los casos de calles
#   python scripts/estado-planta/fotos-dss-lote.py camionetas <carpeta comité seguridad>   → una foto por camioneta sin Excel (de día si hay)
#   python scripts/estado-planta/fotos-dss-lote.py <modo> <carpeta>   → una foto por patente de <carpeta>/fotos/<modo>-patentes.json (p. ej. servicio)
#   agregar «-ric» al modo (camionetas-ric, servicio-ric) para usar solo cámaras de Ricardone
# Lee <carpeta>/datos.json (comite-seguridad-deteccion.ts) y los eventos de data/truckflow; hora operativa = occurredAt + 206 min.
# Deja las imágenes en <carpeta>/fotos/<modo>/ y un índice <carpeta>/fotos/<modo>.json con tipo/marca/color que informa el DSS.
import json, os, re, sys, datetime as dt, urllib.request, urllib.parse, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
API = os.environ.get('API', 'http://127.0.0.1:8787')
modo, OUT = sys.argv[1:3]
D = json.load(open(os.path.join(OUT, 'datos.json'), encoding='utf-8'))
dias = D['fuentes']['camaras']
SKEW = dt.timedelta(minutes=206)
d0 = dt.date.fromisoformat(dias[0]) - dt.timedelta(days=1); d1 = dt.date.fromisoformat(dias[-1]) + dt.timedelta(days=1)
ev = collections.defaultdict(list)
for n in range((d1 - d0).days + 1):
    f = os.path.join(ROOT, 'data', 'truckflow', (d0 + dt.timedelta(n)).isoformat(), 'event-list.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8'))['records']:
        if r.get('truckPlate') and r.get('occurredAt'):
            ev[re.sub(r'[^A-Z0-9]', '', r['truckPlate'].upper())].append((dt.datetime.fromisoformat(r['occurredAt']), r['deviceCode']))
def get(url):
    with urllib.request.urlopen(url, timeout=60) as r: return r.read(), r.headers.get('content-type', '')
def captura(plate, at, dev):
    q = urllib.parse.urlencode({'device': dev, 'at': (at + SKEW).astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z'), 'plate': plate})   # el endpoint espera la hora operativa, como fotos-dss.cjs
    try: r = json.loads(get(f'{API}/api/truckflow/camera-captures/find?{q}')[0])
    except Exception as e: return None
    c = r.get('capture') if r.get('found') else None
    if not c or not c.get('sceneFile'): return None
    return c
def parecida(a, b):
    a = re.sub(r'[^A-Z0-9]', '', (a or '').upper())
    if not a: return True   # el DSS no informó lectura: se acepta
    return a == b or (len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1)
def bajar(c, name, outdir):
    img, ct = get(f'{API}/api/truckflow/camera-captures/image?file={urllib.parse.quote(c["sceneFile"])}')
    p = os.path.join(outdir, name + ('.png' if 'png' in ct else '.jpg')); open(p, 'wb').write(img); return os.path.basename(p)
outdir = os.path.join(OUT, 'fotos', modo); os.makedirs(outdir, exist_ok=True)
idx = []
op = lambda t: (t + SKEW).replace(tzinfo=None)
if modo == 'calles':
    casos = [dict(c, tipo='dos') for c in D['dosCalles']] + [dict(c, tipo='otra') for c in D.get('declarado', []) if not any(x['patente'] == c['patente'] and x['dia'] == c['dia'] for x in D['dosCalles'])]
    for c in casos:
        p = c['patente']; dd, mm = c['dia'].split('/')
        for x in c['calles']:
            hh, mi = map(int, x['hora'].split(':'))
            want = dt.datetime(2026, int(mm), int(dd), hh, mi)
            dev = f'SLZVolcableC{x["calle"]}'
            cand = sorted((abs((op(t) - want).total_seconds()), t) for t, d in ev[p] if d == dev and abs((op(t) - want).total_seconds()) <= 600)
            cap = captura(p, cand[0][1], dev) if cand else None
            rec = {'patente': p, 'dia': c['dia'], 'hora': x['hora'], 'calle': x['calle'], 'tipoCaso': c['tipo'], 'excel': c.get('excel'), 'found': bool(cap)}
            if cap:
                rec.update(archivo=bajar(cap, f'{p}_{dd}{mm}_{x["hora"].replace(":", "")}_C{x["calle"]}', outdir), leida=cap.get('plate'), tipo=cap.get('vehicleCategory'), marca=cap.get('vehicleBrand'), color=cap.get('vehicleColor'))
            idx.append(rec); print(p, c['dia'], x['hora'], dev, 'OK' if cap else 'sin foto')
else:
    base = modo.replace('-ric', '')   # «<modo>-ric»: solo cámaras de Ricardone (Ric*)
    lista = D['camionetas']['lista'] if base == 'camionetas' else json.load(open(os.path.join(OUT, 'fotos', f'{base}-patentes.json'), encoding='utf-8'))
    lista = lista['lista'] if isinstance(lista, dict) else lista
    if modo == 'camionetas-ric': lista = [x for x in lista if 'Ricardone' in x['zona']]   # otro modo: <carpeta>/fotos/<modo>-patentes.json
    for x in lista:
        p = x['patente']
        es = [(t, d) for t, d in ev[p] if op(t).date().isoformat() in dias and (not modo.endswith('-ric') or d.startswith('Ric'))]
        # de día primero (8–18 h operativas) y cámaras de frente; prueba hasta 6 lecturas
        es.sort(key=lambda e: (not (8 <= op(e[0]).hour < 18), 'Fte' not in e[1] and 'Frente' not in e[1], e[0]))
        rec = dict(x, found=False)
        for t, d in es[:12]:
            cap = captura(p, t, d)
            if cap and not parecida(cap.get('plate'), p): cap = None   # la foto tiene que ser de esa patente (o una lectura a un carácter)
            if cap:
                rec.update(found=True, archivo=bajar(cap, f'{p}_{op(t):%d%m_%H%M}_{d}', outdir), dispositivo=d, cuando=f'{op(t):%d/%m %H:%M}', leida=cap.get('plate'), tipo=cap.get('vehicleCategory'), marca=cap.get('vehicleBrand'), color=cap.get('vehicleColor'))
                break
        idx.append(rec); print(p, 'OK ' + str(rec.get('tipo')) if rec['found'] else 'sin foto')
json.dump(idx, open(os.path.join(OUT, 'fotos', f'{modo}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(modo, sum(1 for r in idx if r['found']), 'de', len(idx), 'con foto')
