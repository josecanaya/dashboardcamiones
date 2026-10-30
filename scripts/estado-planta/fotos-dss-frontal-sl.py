# Baja del DSS fotos FRONTALES del puerto (portería C1, balanzas, ingreso camiones; no la C2, que filma la cola) para los livianos.
# Uso: python scripts/estado-planta/fotos-dss-frontal-sl.py <carpeta comité seguridad> [fotos por patente=2]
# Deja <carpeta>/fotos/camionetas-sl-frente/ y el índice <carpeta>/fotos/camionetas-sl-frente.json (mismo formato que fotos-dss-lote.py).
import json, os, re, sys, datetime as dt, urllib.request, urllib.parse, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
API = os.environ.get('API', 'http://127.0.0.1:8787')
OUT = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 2
FRENTE = ['SLZSalidaC1Fte', 'SLZBalIngFte', 'SLZBalSC1Fte', 'SLZBalSC2Fte', 'SLZIngCamFrente']
SKEW = dt.timedelta(minutes=206)
D = json.load(open(os.path.join(OUT, 'datos.json'), encoding='utf-8'))
dias = D['fuentes']['camaras']
pats = {x['patente'] for x in D['camionetas']['lista']}
ev = collections.defaultdict(list)
d0 = dt.date.fromisoformat(dias[0]); d1 = dt.date.fromisoformat(dias[-1]) + dt.timedelta(days=1)
for n in range((d1 - d0).days + 1):
    f = os.path.join(ROOT, 'data', 'truckflow', (d0 + dt.timedelta(n)).isoformat(), 'event-list.json')
    if not os.path.exists(f): continue
    for r in json.load(open(f, encoding='utf-8'))['records']:
        p = re.sub(r'[^A-Z0-9]', '', (r.get('truckPlate') or '').upper())
        if p in pats and r.get('deviceCode') in FRENTE and r.get('occurredAt'):
            ev[p].append((dt.datetime.fromisoformat(r['occurredAt'].replace('Z', '+00:00')), r['deviceCode']))
def get(url):
    with urllib.request.urlopen(url, timeout=60) as r: return r.read(), r.headers.get('content-type', '')
outdir = os.path.join(OUT, 'fotos', 'camionetas-sl-frente'); os.makedirs(outdir, exist_ok=True)
idx = []
for p in sorted(pats):
    local = lambda t: t + SKEW - dt.timedelta(hours=3)
    # de día primero, por orden de cámara, una por día como máximo
    cand = sorted(ev[p], key=lambda x: (not 8 <= local(x[0]).hour <= 17, FRENTE.index(x[1]), -x[0].timestamp()))
    got, dias_usados, intentos = 0, set(), 0
    for t, dev in cand:
        if got >= N or intentos >= 8: break
        if local(t).date() in dias_usados: continue
        intentos += 1
        at = (t + SKEW).astimezone(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
        try: r = json.loads(get(f'{API}/api/truckflow/camera-captures/find?' + urllib.parse.urlencode({'device': dev, 'at': at, 'plate': p}))[0])
        except Exception: continue
        c = r.get('capture') if r.get('found') else None
        if not c or not c.get('sceneFile'): continue
        img, ct = get(f'{API}/api/truckflow/camera-captures/image?file={urllib.parse.quote(c["sceneFile"])}')
        lt = local(t); name = f'{p}_{lt:%d%m_%H%M}_{dev}' + ('.png' if 'png' in ct else '.jpg')
        open(os.path.join(outdir, name), 'wb').write(img)
        idx.append({'patente': p, 'archivo': name, 'dispositivo': dev, 'cuando': f'{lt:%d/%m %H:%M}', 'leida': c.get('plate'), 'tipo': c.get('vehicleCategory'), 'marca': c.get('vehicleBrand'), 'color': c.get('vehicleColor')})
        got += 1; dias_usados.add(lt.date())
    print(p, got, 'frontales')
json.dump(idx, open(os.path.join(OUT, 'fotos', 'camionetas-sl-frente.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('total', len(idx), 'fotos de', len({x['patente'] for x in idx}), 'patentes')
