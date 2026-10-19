# Láminas de vehículos fuera del sistema de camiones (6 de fotos + 3 de datos y patrón de recorrido).
# Uso:
#   python scripts/estado-planta/gen_vehiculos_sin_sistema.py fotos <carpeta>   → baja 1 foto del DSS por patente (vía :8787, requiere VPN)
#   python scripts/estado-planta/gen_vehiculos_sin_sistema.py deck  <carpeta>   → arma <carpeta>/deck.html (visor autocontenido)
# <carpeta> = reportes/logistica/vehiculos-sin-sistema/<desde>_<hasta> (vehiculos-sin-sistema.ts).
# Selección: ≥10 viajes, no está entre los 48 del comité de seguridad, no se parece a una patente de la balanza
# (1 carácter) ni a una de los 48 (≤2 caracteres): las parecidas son casi siempre malas lecturas.
# <carpeta>/descartadas.json (lista de patentes) saca las que se revisaron por foto y no sirven.
import json, os, sys, io, base64, re, urllib.request, urllib.parse, collections, html
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
API = os.environ.get('API', 'http://127.0.0.1:8787')
modo, CARPETA = sys.argv[1], os.path.abspath(sys.argv[2])
D = json.load(open(os.path.join(CARPETA, 'vehiculos-sin-sistema.json'), encoding='utf-8'))
V = D['vehiculos']
L48 = [v['patente'] for v in V if v['enLista48']]
DESC = set(json.load(open(os.path.join(CARPETA, 'descartadas.json'), encoding='utf-8'))) if os.path.exists(os.path.join(CARPETA, 'descartadas.json')) else set()
def dif(a, b): return len(a) == len(b) and 0 < sum(x != y for x, y in zip(a, b)) <= 2
GRUPO = {'Pickup': 'pickup', 'SUV': 'pickup', 'Van': 'utilitario', 'MPV': 'utilitario', 'Sedan': 'auto', 'Bus': 'colectivo', 'Small': 'camion_chico', 'Medium': 'camion', 'Large': 'camion'}
CAT = {'pickup': ('Camionetas (pickup/SUV)', 1, '#1C6E9F'), 'utilitario': ('Utilitarios y traffics', 2, '#0B5638'), 'camion': ('Camiones', 3, '#B83A26'),
       'camion_chico': ('Camiones chicos', 4, '#A8560C'), 'colectivo': ('Colectivos y minibuses', 5, '#7A4FB0'), 'auto': ('Autos', 6, '#2E1B4E'), 'sd': ('Sin tipo DSS', 7, '#7C8783')}
def cat(v):
    t = (v['tipoDss'] or '').split(' ')[0]
    if 'Bus' in (v['tipoDss'] or ''): return 'colectivo'
    return GRUPO.get(t, 'sd')
SEL = [v for v in V if not v['enLista48'] and v['viajes'] >= 10 and not v['parecida'] and not any(dif(v['patente'], p) for p in L48) and v['patente'] not in DESC]
FOTOS_F0 = os.path.join(CARPETA, 'fotos.json')
if os.path.exists(FOTOS_F0):   # ya revisado por foto: se mantiene ese conjunto aunque cambie el conteo de viajes
    _base = {f['patente'] for f in json.load(open(FOTOS_F0, encoding='utf-8'))}
    SEL = [v for v in V if v['patente'] in _base and v['patente'] not in DESC]
SEL.sort(key=lambda v: (CAT[cat(v)][1], -v['viajes']))
FOTOS_DIR = os.path.join(CARPETA, 'fotos'); FOTOS_F = os.path.join(CARPETA, 'fotos.json')
FOTOS = {f['patente']: f for f in json.load(open(FOTOS_F, encoding='utf-8'))} if os.path.exists(FOTOS_F) else {}
# <carpeta>/correcciones-manuales.json: {"vehiculos": {patente_original: {patente?, color?, tipo?, marca?}}} revisadas a mano por foto.
# El tipo corregido (Pickup, Utilitario, Minibús, Auto, Camión chico, ...) se traduce al código DSS para agrupar.
CORR = json.load(open(os.path.join(CARPETA, 'correcciones-manuales.json'), encoding='utf-8'))['vehiculos'] if os.path.exists(os.path.join(CARPETA, 'correcciones-manuales.json')) else {}
TIPO_A_DSS = {'Pickup': 'Pickup', 'SUV': 'SUV', 'Utilitario': 'MPV', 'Minibús': 'Medium Bus', 'Colectivo': 'Bus', 'Auto': 'Sedan', 'Camión chico': 'Small Truck', 'Camión mediano': 'Medium Truck', 'Camión grande': 'Large Truck'}
PAT = {p: c['patente'] for p, c in CORR.items() if c.get('patente')}   # patente que se muestra (los datos siguen siendo los de la lectura original)
for p, c in (CORR.items() if modo != 'fotos' else []):   # «fotos» guarda fotos.json: sin mezclar correcciones
    f = FOTOS.get(p)
    if f is None: continue
    if c.get('tipo'): f['tipo'] = TIPO_A_DSS.get(c['tipo'], f.get('tipo')); f['tipoTxt'] = c['tipo']
    if c.get('marca'): f['marca'] = None if c['marca'] == 'Sin dato' else c['marca']
    if c.get('color'): f['colorTxt'] = c['color']
for v in (V if modo != 'fotos' else []):   # el deck agrupa por el tipo DSS de la foto (ya corregido)
    if FOTOS.get(v['patente'], {}).get('tipo'): v['tipoDss'] = ' '.join(x for x in (FOTOS[v['patente']]['tipo'], FOTOS[v['patente']].get('marca') or '') if x)
SEL.sort(key=lambda v: (CAT[cat(v)][1], -v['viajes']))

if modo == 'fotos':
    os.makedirs(FOTOS_DIR, exist_ok=True)
    def get(url):
        with urllib.request.urlopen(url, timeout=60) as r: return r.read(), r.headers.get('content-type', '')
    def igual(a, b):
        a = re.sub(r'[^A-Z0-9]', '', (a or '').upper())
        return not a or a == b or (len(a) == len(b) and sum(x != y for x, y in zip(a, b)) <= 1)
    for v in SEL:
        p = v['patente']
        hay_frente = any(re.search(r'^(?!SLZSalidaC2Fte).*(Fte|Frente|Fr)$', c['device']) for c in v['patron']['fotos'])
        if FOTOS.get(p, {}).get('archivo') and (re.search(r'^(?!SLZSalidaC2Fte).*(Fte|Frente|Fr)$', FOTOS[p].get('dispositivo') or '') or not hay_frente): continue
        rec = {'patente': p, 'found': False}
        for c in v['patron']['fotos']:
            q = urllib.parse.urlencode({'device': c['device'], 'at': c['at'], 'plate': p})
            try: r = json.loads(get(f'{API}/api/truckflow/camera-captures/find?{q}')[0])
            except Exception: continue
            if r.get('error') and 'red hacia DSS' in r['error']: sys.exit('DSS sin conexión (¿VPN?): ' + r['error'])
            cap = r.get('capture') if r.get('found') else None
            if not cap or not cap.get('sceneFile') or not igual(cap.get('plate'), p): continue
            img, ct = get(f'{API}/api/truckflow/camera-captures/image?file={urllib.parse.quote(cap["sceneFile"])}')
            name = f'{p}_{c["at"][5:16].replace("-", "").replace("T", "_").replace(":", "")}_{c["device"]}' + ('.png' if 'png' in ct else '.jpg')
            open(os.path.join(FOTOS_DIR, name), 'wb').write(img)
            rec.update(found=True, archivo=name, dispositivo=c['device'], cuando=c['at'][:16], leida=cap.get('plate'), tipo=cap.get('vehicleCategory'), marca=cap.get('vehicleBrand'), color=cap.get('vehicleColor'))
            break
        FOTOS[p] = rec; print(p, 'OK' if rec['found'] else 'sin foto', rec.get('tipo') or '')
        json.dump(list(FOTOS.values()), open(FOTOS_F, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(sum(1 for f in FOTOS.values() if f.get('found')), 'de', len(SEL), 'con foto')
    sys.exit()

# ---------- deck
from PIL import Image
def thumb(path, w, h, q=72):
    im = Image.open(path).convert('RGB'); im.thumbnail((w, h))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
NVA = thumb(os.path.join(ROOT, 'public', 'branding', 'nueva-vicentin-argentina.jfif'), 160, 90, 85)
BTZ = thumb(os.path.join(ROOT, 'public', 'branding', 'LOGOS-BIMTRAZER_LOGO-VERTICAL chico.jpg'), 160, 110, 85)
INK = '#1B2420'; MUTE = '#4F5A55'; BG = '#FBFBF8'; GDK = '#0B5638'; VIO = '#2E1B4E'; RED = '#B83A26'
e = html.escape
dm = lambda d: f'{d[8:10]}/{d[5:7]}'
D0, D1 = dm(D['desde']), dm(D['hasta'])
LBL = f'Vehículos fuera del sistema de camiones · {D0} al {D1}/{D["hasta"][:4]}'
if modo == 'fichas':
    # Ficha A4 por vehículo: tercio superior = foto + carta de presentación; abajo, una fila por visita con su recorrido.
    # Patentes: argumentos extra (python ... fichas <carpeta> KGY149 AD001TD ...) o, sin argumentos, todas las de la selección.
    VIS = json.load(open(os.path.join(CARPETA, 'visitas.json'), encoding='utf-8'))
    BYP = {v['patente']: v for v in V}
    pats = sys.argv[3:] or [v['patente'] for v in SEL]
    COLOR = {'White': 'Blanco', 'Black': 'Negro', 'Silver': 'Plateado', 'Gray': 'Gris', 'Grey': 'Gris', 'Blue': 'Azul', 'Red': 'Rojo', 'Brown': 'Marrón', 'Pink': 'Rosa', 'Green': 'Verde', 'Yellow': 'Amarillo', 'Orange': 'Naranja'}
    TIPO = {'Pickup': 'Pickup', 'SUV': 'SUV', 'MPV': 'Utilitario (MPV)', 'Van': 'Furgón / van', 'Sedan': 'Auto', 'Small Truck': 'Camión chico', 'Medium Truck': 'Camión mediano',
            'Large Truck': 'Camión grande', 'Bus': 'Colectivo', 'Medium Bus': 'Minibús'}
    # Grupos y orden: autos y SUV al final (pedido 16/10). Tipo = el que informa el DSS en la foto elegida.
    GRUPO_F = {'Pickup': 'Pickup', 'Small Truck': 'Camiones chicos', 'Medium Truck': 'Camiones', 'Large Truck': 'Camiones', 'MPV': 'Utilitarios y furgones',
               'Van': 'Utilitarios y furgones', 'Bus': 'Colectivos y minibuses', 'Medium Bus': 'Colectivos y minibuses', 'Sedan': 'Autos', 'SUV': 'SUV'}
    ORDEN_G = ['Pickup', 'Camiones chicos', 'Camiones', 'Utilitarios y furgones', 'Colectivos y minibuses', 'Otros', 'Autos', 'SUV']
    OPK = ('calada', 'volcable', 'carga', 'playa', 'líquidos')
    def oper(v): return {k: (v.get('patron') or {}).get('oper', {}).get(k, 0) for k in OPK if (v.get('patron') or {}).get('oper', {}).get(k)}
    OP_RE = re.compile(r'^(Calada|Volcable|Carga|Descarga|Playa|Bal\. líq|Calado)')
    def hm(mins):
        if mins is None: return '—'
        return f'{mins} min' if mins < 60 else f'{mins // 60} h {mins % 60:02d} min'
    def fecha(iso): return f'{iso[8:10]}/{iso[5:7]}/{iso[:4]}'
    def recorrido(pasos):
        txt = ' <span class="ar">→</span> '.join((f'<u>{e(l)}</u>' if OP_RE.match(l) else e(l)) + f' <span class="t">{h}</span>' for l, h in pasos)
        return txt + (' <span class="t">· una sola toma</span>' if len(pasos) == 1 else '')
    ROWS1, ROWSN = 29, 42
    # Fotos y logos como archivos aparte (149 fotos incrustadas pasan el límite de 16 MB del artifact)
    IMG = os.path.join(CARPETA, 'fichas-img'); os.makedirs(IMG, exist_ok=True)
    def jpg(src, name, w, h, q=78):
        im = Image.open(src).convert('RGB'); im.thumbnail((w, h)); im.save(os.path.join(IMG, name), 'JPEG', quality=q, optimize=True); return f'fichas-img/{name}'
    LOGO_N = jpg(os.path.join(ROOT, 'public', 'branding', 'nueva-vicentin-argentina.jfif'), 'nva.jpg', 200, 110, 88)
    LOGO_B = jpg(os.path.join(ROOT, 'public', 'branding', 'LOGOS-BIMTRAZER_LOGO-VERTICAL chico.jpg'), 'bimtrazer.jpg', 200, 140, 88)
    HEAD = f'<header><p class="kick">FICHA DE VEHÍCULO · FUERA DEL SISTEMA DE CAMIONES</p><div class="logos"><img src="{LOGO_N}" alt="NVA"><img src="{LOGO_B}" alt="Bimtrazer"></div></header>'
    FOOT = lambda izq, der: f'<footer><span>{izq}</span><span>{der}</span></footer>'
    fichas = []
    for p in pats:
        v = BYP[p]; f = FOTOS.get(p) or {}
        g = GRUPO_F.get(f.get('tipo'), 'Otros'); fichas.append((ORDEN_G.index(g), g, p, v, f))
    fichas.sort(key=lambda x: (x[0], not oper(x[3]), -x[3]['viajes']))   # en cada tipo, primero los que entran a zona operativa
    out_html = []
    grupos = collections.OrderedDict()
    for x in fichas: grupos.setdefault(x[1], []).append(x)
    miles = lambda n: f'{n:,}'.replace(',', '.')
    for gi, (g, xs) in enumerate(grupos.items(), 1):
        chips = ''.join(f'<a class="chip{" op" if oper(v) else ""}" href="#f-{p}" data-p="{p}">{PAT.get(p, p)}<span>{v["viajes"]}</span></a>' for _, _, p, v, _ in xs)
        nop = sum(1 for x in xs if oper(x[3]))
        tv = sum(x[3]['viajes'] for x in xs)
        out_html.append(f'<div class="page cover" id="g-{gi}">{HEAD}<div class="cv"><p class="cvn">{gi:02d}</p><h1>{g}</h1>'
                        f'<p class="cvs"><b>{len(xs)}</b> vehículos · <b>{miles(tv)}</b> viajes del {D0} al {D1}/{D["hasta"][:4]} · ninguno figura en el sistema de camiones</p>'
                        f'<div class="chips">{chips}</div><p class="cvh">Número = viajes. Subrayadas en rojo: entran a zona operativa ({nop}), van primero. Tocá una patente para ir a su ficha. Las tachadas fueron eliminadas.</p></div>'
                        + FOOT(f'Carátula · {g}', f'{len(xs)} fichas') + '</div>')
        for _, _, p, v, f in xs:
            vis = VIS.get(p, [])
            ric = [x for x in vis if x['planta'] == 'ric']; sl = [x for x in vis if x['planta'] == 'sl']
            perm = lambda xs_: sum(x['min'] for x in xs_ if x['min'] is not None)
            med = lambda xs_: sum(1 for x in xs_ if x['min'] is not None)
            foto = jpg(os.path.join(FOTOS_DIR, f['archivo']), f'{p}.jpg', 1000, 700) if f.get('archivo') else ''
            donde = ('Ricardone' if (f.get('dispositivo') or '').startswith('Ric') else 'San Lorenzo') if f else ''
            dato = lambda k, val, sub='', ed='': f'<div class="d"><span class="k">{k}</span><span class="v{" ed" if ed else ""}"{f" data-f={chr(34)}{ed}{chr(34)} data-p={chr(34)}{p}{chr(34)} contenteditable={chr(34)}plaintext-only{chr(34)} spellcheck={chr(34)}false{chr(34)}" if ed else ""}>{val}</span>{f"<span class=s>{sub}</span>" if sub else ""}</div>'
            img = f'<img src="{foto}" alt="Foto {p}" loading="lazy">' if foto else '<div class="nofoto">Sin foto</div>'
            cuando = fecha(f['cuando']) + ' ' + f['cuando'][11:16] if f.get('cuando') else ''
            carta = (f'<section class="top"><figure>{img}<figcaption>Captura DSS · {donde} · {e(f.get("dispositivo") or "")} · {cuando}</figcaption></figure>'
                     f'<div class="carta"><div class="gl"><p class="grupo">{g.upper()}</p><button class="del" data-p="{p}" type="button">Eliminar ficha</button></div><p class="pat ed" data-f="patente" data-p="{p}" contenteditable="plaintext-only" spellcheck="false">{PAT.get(p, p)}</p>'
                     f'<div class="det">Detectado por sistema de camiones <b>NO</b></div>'
                     + (f'<p class="zop">Entra a zona operativa: ' + ', '.join(f'{k} ×{n}' for k, n in oper(v).items()) + '</p>' if oper(v) else '')
                     + dato('Color', f.get('colorTxt') or COLOR.get(f.get('color'), f.get('color') or '—'), ed='color') + dato('Tipo de vehículo', f.get('tipoTxt') or TIPO.get(f.get('tipo'), f.get('tipo') or '—'), ed='tipo') + dato('Marca', e(f.get('marca') or 'Sin dato'), ed='marca')
                     + dato('Ingresos Ricardone', len(ric)) + dato('Ingresos San Lorenzo', len(sl))
                     + dato('Permanencia total Ricardone', hm(perm(ric)) if med(ric) else '—', f'{med(ric)} de {len(ric)} visitas medidas' if ric else '')
                     + dato('Permanencia total San Lorenzo', hm(perm(sl)) if med(sl) else '—', f'{med(sl)} de {len(sl)} visitas medidas' if sl else '')
                     + '</div></section>')
            # Sin permanencia por visita (solo el total arriba); una fila fina por mes separa la secuencia (pedido 16/10).
            MESN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
            porm = collections.Counter(x['ini'][:7] for x in vis)
            filas, cur = [], None
            for x in vis:
                if x['ini'][:7] != cur:
                    cur = x['ini'][:7]
                    filas.append(f'<tr class="mes"><td colspan="4">{MESN[int(cur[5:7]) - 1]} {cur[:4]} <span>· {porm[cur]} visitas</span></td></tr>')
                filas.append(f'<tr><td>{fecha(x["ini"])}</td><td>{x["ini"][11:16]}</td><td class="pl {x["planta"]}">{"Ricardone" if x["planta"] == "ric" else "San Lorenzo"}</td>'
                             f'<td>{recorrido(x["pasos"])}</td></tr>')
            tabla = lambda fs: f'<table><thead><tr><th>Fecha</th><th>Hora</th><th>Planta</th><th>Recorrido</th></tr></thead><tbody>{"".join(fs)}</tbody></table>'
            chunks = [filas[:ROWS1]] + [filas[i:i + ROWSN] for i in range(ROWS1, len(filas), ROWSN)]
            hojas = ''.join(f'<div class="page">{HEAD}' + (carta + f'<p class="sec">Secuencia de visitas · {len(vis)} visitas</p>' if i == 0 else f'<p class="sec">{PAT.get(p, p)} · secuencia de visitas (continúa)</p>')
                            + tabla(ch) + FOOT(f'{PAT.get(p, p)} · {g} · cámaras del {D0} al {D1}/{D["hasta"][:4]}', f'Hoja {i + 1} de {len(chunks)}') + '</div>' for i, ch in enumerate(chunks))
            out_html.append(f'<div class="ficha" id="f-{p}" data-p="{p}">{hojas}<div class="gone"><b>{p}</b> · ficha eliminada <button class="undo" data-p="{p}" type="button">Restaurar</button></div></div>')
    pages = out_html
    total = len(fichas)
    nav = ''.join(f'<a href="#g-{i}">{g}</a>' for i, g in enumerate(grupos, 1))
    BAR = (f'<div id="bar"><p><b>{total}</b> fichas · <span id="nel">0</span> eliminadas</p><label><input type="checkbox" id="hide"> Ocultar eliminadas</label>'
           f'<nav>{nav}</nav><p class="st">Para corregir patente, color, tipo o marca, tocá el texto en la ficha, escribí y salí del campo: queda guardado y marcado en azul.</p><p id="st" class="st">Conectando…</p></div>')
    CSSF = f'''
:root{{--paper:#FFFFFF;--desk:#D9DEDB;--ink:{INK};--mute:{MUTE};--line:#E1E6E3;--green:{GDK};--vio:{VIO};--red:{RED};--ric:#E3EFE8;--sl:#E9E4F2;color-scheme:light}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--desk);color:var(--ink);font-family:'Public Sans',Arial,sans-serif;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
#wrap{{display:flex;flex-direction:column;align-items:center;gap:24px}}
.page{{width:210mm;height:297mm;background:var(--paper);padding:11mm 13mm 9mm;display:flex;flex-direction:column;gap:3.2mm;box-shadow:0 2px 10px rgba(0,0,0,.15);position:relative;overflow:hidden}}
header{{display:flex;justify-content:space-between;align-items:center;border-bottom:.6mm solid var(--green);padding-bottom:2mm}}
.kick{{font-size:8pt;font-weight:700;letter-spacing:.4mm;color:var(--vio)}}
.logos{{display:flex;gap:5mm;align-items:center}} .logos img{{height:8mm}}
.top{{height:88mm;display:grid;grid-template-columns:112mm 1fr;gap:5mm}}
figure{{display:flex;flex-direction:column;gap:1.2mm;min-width:0}}
figure img{{width:100%;height:82mm;object-fit:cover;border-radius:1.5mm;display:block}}
.nofoto{{height:82mm;background:#EEF1EF;display:flex;align-items:center;justify-content:center;color:var(--mute)}}
figcaption{{font-size:6.5pt;color:var(--mute)}}
.carta{{display:flex;flex-direction:column;gap:1.1mm;min-width:0}}
.grupo{{font-size:7.5pt;font-weight:700;letter-spacing:.5mm;color:var(--green)}}
.pat{{font-family:'Domine',Georgia,serif;font-size:27pt;font-weight:700;line-height:1;letter-spacing:.6mm;border:.5mm solid var(--ink);border-radius:1.5mm;padding:1.6mm 3mm;align-self:flex-start}}
.det{{font-size:9pt;font-weight:700;background:#FBE6E1;color:var(--ink);border-radius:1.2mm;padding:1.6mm 2.4mm;margin:.8mm 0}} .det b{{color:var(--red);font-size:12pt;margin-left:1.5mm}}
.d{{display:grid;grid-template-columns:1fr auto;column-gap:2mm;border-bottom:.2mm solid var(--line);padding:.7mm 0;align-items:baseline}}
.k{{font-size:8pt;color:var(--mute)}} .v{{font-size:10pt;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}} .s{{grid-column:1/3;font-size:6.5pt;color:var(--mute);text-align:right}}
.sec{{font-size:9pt;font-weight:700;color:var(--green)}}
table{{width:100%;border-collapse:collapse;font-size:7.4pt;table-layout:fixed}}
th{{text-align:left;font-size:6.8pt;color:var(--mute);border-bottom:.4mm solid var(--green);padding:.8mm 1.2mm}}
td{{padding:0 1.2mm;height:5.1mm;border-bottom:.2mm solid var(--line);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}}
th:nth-child(1){{width:19mm}} th:nth-child(2){{width:11mm}} th:nth-child(3){{width:19mm}}
tr.mes td{{height:6mm;padding-top:1.6mm;border-bottom:.3mm solid var(--green);font-size:7pt;font-weight:700;letter-spacing:.3mm;text-transform:uppercase;color:var(--green)}} tr.mes td span{{font-weight:400;text-transform:none;letter-spacing:0;color:var(--mute)}}
td.pl{{font-weight:700;font-size:6.8pt}} td.pl.ric{{background:var(--ric);color:var(--green)}} td.pl.sl{{background:var(--sl);color:var(--vio)}}
.m{{text-align:right}} .t{{color:var(--mute);font-size:6.4pt}} .ar{{color:var(--green)}}
footer{{position:absolute;left:13mm;right:13mm;bottom:5mm;display:flex;justify-content:space-between;font-size:6.5pt;color:var(--mute)}}
.gl{{display:flex;justify-content:space-between;align-items:center}}
.zop{{font-size:8pt;font-weight:700;color:var(--red);text-decoration:underline;text-decoration-thickness:.4mm;text-underline-offset:.8mm}}
td u{{text-decoration-color:var(--red);text-decoration-thickness:.35mm;text-underline-offset:.5mm}}
.chip.op{{text-decoration:underline;text-decoration-color:var(--red);text-decoration-thickness:.5mm;text-underline-offset:.8mm;box-shadow:inset 0 0 0 .35mm var(--red)}}
button{{font:inherit;cursor:pointer}}
.del{{font-size:7pt;font-weight:700;color:var(--red);background:transparent;border:.3mm solid var(--red);border-radius:1mm;padding:.6mm 2mm}}
.del:hover,.del:focus-visible{{background:#FBE6E1;outline:none}}
.ficha{{display:flex;flex-direction:column;gap:24px}}
.gone{{display:none;width:210mm;background:#F3F4F3;border:1px dashed #9AA39F;border-radius:6px;padding:10px 16px;font-size:13px;color:var(--mute);align-items:center;gap:12px}}
.ficha.x .page{{display:none}} .ficha.x .gone{{display:flex}} body.hide .ficha.x{{display:none}}
.undo{{font-size:12px;font-weight:700;color:var(--green);background:#fff;border:1px solid var(--green);border-radius:5px;padding:3px 10px}}
.cover{{background:var(--green);color:#F1F6F2}} .cover header{{border-color:#9CC7AF}} .cover .kick{{color:#DCEBE2}} .cover footer{{color:#BFD9C9}}
.cover .logos{{background:#fff;border-radius:1.5mm;padding:1mm 2mm}}
.cv{{display:flex;flex-direction:column;gap:5mm;margin-top:38mm}}
.cvn{{font-family:'Domine',Georgia,serif;font-size:60pt;font-weight:700;line-height:1;color:#8FC2A5}}
.cover h1{{font-family:'Domine',Georgia,serif;font-size:38pt;line-height:1.1;text-wrap:balance}}
.cvs{{font-size:12pt;color:#DCEBE2}} .cvs b{{color:#fff}} .cvh{{font-size:8pt;color:#BFD9C9}}
.chips{{display:flex;flex-wrap:wrap;gap:1.6mm}}
.chip{{display:inline-flex;gap:1.5mm;align-items:baseline;background:#F1F6F2;color:var(--ink);text-decoration:none;font-weight:700;font-size:9pt;border-radius:1.2mm;padding:1mm 2.2mm}}
.chip span{{font-weight:400;color:var(--mute);font-size:7.5pt}} .chip.x{{text-decoration:line-through;opacity:.45}}
#bar{{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;width:100%;max-width:210mm;margin:0 auto 16px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:13px}}
#bar nav{{display:flex;flex-wrap:wrap;gap:4px 12px}} #bar nav a{{color:var(--green);font-weight:700;text-decoration:none}}
.ed{{cursor:text;border-radius:1mm;outline:none}} .ed:hover{{background:#EEF4F8}} .ed:focus{{background:#fff;box-shadow:0 0 0 .4mm #1C6E9F}}
.ed.mod{{color:#1C6E9F}} .ed.mod::after{{content:' ✎';font-size:.6em;color:#1C6E9F}}
#bar label{{display:flex;gap:6px;align-items:center}} .st{{color:var(--mute);font-size:12px;flex-basis:100%}}
'''
    JSF = r"""
const wrap=document.getElementById('wrap');
function fit(){const w=document.body.clientWidth-32;const k=Math.min(1,w/794);wrap.style.zoom=k<1?k:''}
addEventListener('resize',fit);fit();
let gone=new Set(), db=null;
const st=document.getElementById('st');
function paint(){
  document.querySelectorAll('.ficha').forEach(f=>f.classList.toggle('x',gone.has(f.dataset.p)));
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('x',gone.has(c.dataset.p)));
  document.getElementById('nel').textContent=gone.size;
}
const LS='fichas-eliminadas';
function local(){try{gone=new Set(JSON.parse(localStorage.getItem(LS)||'[]'))}catch(e){}paint()}
function saveLocal(){try{localStorage.setItem(LS,JSON.stringify([...gone]))}catch(e){}}
async function toggle(p,del){
  const prev=new Set(gone); if(del)gone.add(p); else gone.delete(p); paint();
  if(!db){saveLocal();return}
  try{const ref=db.collection('eliminadas').doc(p); if(del)await ref.set({patente:p,at:new Date().toISOString()}); else await ref.delete()}
  catch(e){gone=prev;paint();st.textContent='No se pudo guardar el cambio ('+(e&&e.code||'error')+'). Probá de nuevo.'}
}
document.addEventListener('click',e=>{const b=e.target.closest('.del,.undo');if(b)toggle(b.dataset.p,b.classList.contains('del'))});
// correcciones a mano: colección «correcciones», un documento por patente original {patente?, color?, tipo?, marca?}
let fix={};
const ORIG=new Map();document.querySelectorAll('.ed').forEach(el=>ORIG.set(el,el.textContent));
function paintFix(){
  document.querySelectorAll('.ed').forEach(el=>{
    if(el===document.activeElement)return;
    const v=(fix[el.dataset.p]||{})[el.dataset.f];
    el.textContent=v!=null&&v!==''?v:ORIG.get(el);el.classList.toggle('mod',v!=null&&v!==''&&v!==ORIG.get(el));
  });
  document.querySelectorAll('.chip').forEach(c=>{const v=(fix[c.dataset.p]||{}).patente;c.firstChild.textContent=v||c.dataset.p});
}
const LSF='fichas-correcciones';
try{fix=JSON.parse(localStorage.getItem(LSF)||'{}')}catch(e){}
paintFix();
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('ed')){e.preventDefault();e.target.blur()}});
document.addEventListener('focusout',async e=>{
  const el=e.target;if(!el.classList||!el.classList.contains('ed'))return;
  let v=el.textContent.trim();if(el.dataset.f==='patente')v=v.toUpperCase().replace(/[^A-Z0-9]/g,'');
  const p=el.dataset.p,f=el.dataset.f,cur=(fix[p]||{})[f]??ORIG.get(el);
  if(v===cur||(!v&&!(fix[p]||{})[f])){paintFix();return}
  const next={...(fix[p]||{})};if(!v||v===ORIG.get(el))delete next[f];else next[f]=v;
  const prev=fix;fix={...fix,[p]:next};paintFix();
  if(!db){try{localStorage.setItem(LSF,JSON.stringify(fix))}catch(er){}return}
  try{const ref=db.collection('correcciones').doc(p);if(Object.keys(next).length)await ref.set({...next,original:p,at:new Date().toISOString()});else await ref.delete()}
  catch(er){fix=prev;paintFix();st.textContent='No se pudo guardar la corrección de '+p+' ('+(er&&er.code||'error')+'). Probá de nuevo.'}
});
document.getElementById('hide').addEventListener('change',e=>document.body.classList.toggle('hide',e.target.checked));
local();
(async()=>{
  try{db=window.claude?await window.claude.use('db'):null}catch(e){db=null}
  if(!db){st.textContent='Las eliminaciones se guardan solo en este navegador.';return}
  st.textContent='Las eliminaciones quedan guardadas para todos los que abren estas fichas.';
  db.collection('correcciones').onSnapshot(s=>{const o={};s.docs.forEach(d=>{const x={...d.data()};delete x.original;delete x.at;o[d.id]=x});fix=o;paintFix()},er=>{st.textContent='Sin conexión con la base: las correcciones no se guardan ('+(er&&er.code||'error')+').'});
  db.collection('eliminadas').onSnapshot(s=>{gone=new Set(s.docs.map(d=>d.id));paint()},er=>{st.textContent='Sin conexión con la base: los cambios no se guardan ('+(er&&er.code||'error')+').'});
})();
"""
    out = os.path.join(CARPETA, 'fichas.html')
    open(out, 'w', encoding='utf-8').write('<meta charset="utf-8"><title>Fichas de vehículos</title><meta name="claude:viewport-fit-sides" content="cover">'
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Domine:wght@700&family=Public+Sans:wght@400;700&display=swap" rel="stylesheet">'
        f'<style>{CSSF}</style>{BAR}<div id="wrap">{"".join(pages)}</div><script>{JSF}</script>')
    print(len(fichas), 'fichas ·', sum(h.count('class="page') for h in pages), 'hojas ->', out)
    sys.exit()

slides = []
def section(body, notes=''):
    n = len(slides) + 1
    slides.append(f'<section class="s"><div class="body">{body}</div><div class="foot"><p>{LBL} · {n}</p><div class="logos"><img src="{NVA}" alt="NVA"><img src="{BTZ}" alt="Bimtrazer"></div></div><aside>{e(notes)}</aside></section>')
def eyebrow(t): return f'<p class="eyebrow">{t}</p>'
def h2(t, size=46): return f'<h2 style="font-size:{size}px">{t}</h2>'
MES = D['meses']
def mes_txt(v): return ' · '.join(str(v['porMes'][m]) for m in MES)
cnt = collections.Counter(cat(v) for v in SEL)
ley_all = ''.join(f'<span class="ley"><i style="background:{CAT[k][2]}"></i>{CAT[k][0]} · {cnt[k]}</span>' for k in sorted(cnt, key=lambda k: CAT[k][1]))

# 6 láminas de fotos
per = -(-len(SEL) // 6)
for k in range(6):
    part = SEL[k * per:(k + 1) * per]
    if not part: break
    cells = ''
    for v in part:
        f = FOTOS.get(v['patente'])
        col = CAT[cat(v)][2]
        planta = 'RICARDONE' if (f and (f.get('dispositivo') or '').startswith('Ric')) else 'SAN LORENZO' if f else ''
        img = (f'<img src="{thumb(os.path.join(FOTOS_DIR, f["archivo"]), 520, 300)}" alt="{v["patente"]}">' + f'<b class="tag" style="background:{GDK if planta == "RICARDONE" else VIO}">{planta}</b>') if f and f.get('archivo') \
            else f'<div class="nofoto">{"Sin foto en DSS" if f else "Foto pendiente"}</div>'
        cells += f'<div class="cell"><div class="ph" style="border-bottom:6px solid {col}">{img}</div><p><b>{PAT.get(v["patente"], v["patente"])}</b> · {v["viajes"]} viajes · {v["dias"]} días</p></div>'
    cats_here = ' · '.join(dict.fromkeys(CAT[cat(v)][0] for v in part))
    section(eyebrow(f'FUERA DEL SISTEMA DE CAMIONES · FOTOS {k * per + 1}–{k * per + len(part)} DE {len(SEL)}') + h2(cats_here, 40)
            + f'<div class="leyenda">{ley_all}</div><div class="grid">{cells}</div>',
            'Una captura del DSS por vehículo (de día y de frente cuando hay), con la patente leída por el DSS igual a la de la cámara o a un carácter. Tipo según DSS (poco confiable). '
            'Las que no sirvan van a descartadas.json y se regenera.')

# 3 láminas de datos
def patron_txt(v):
    p = v['patron']
    if not p: return '', ''
    tops = '; '.join(f'{e(t["seq"])} <span class="m">{t["pct"]}%</span>' for t in p['top'][:1])
    flags = [k for k in ('calada', 'volcable', 'carga', 'playa', 'líquidos') if p['oper'].get(k)]
    return tops, ' '.join(f'<span class="flag">{k} {p["oper"][k]}</span>' for k in flags)
def etiqueta(v):
    p = v['patron']; n = v['viajes']
    if not p: return ''
    t = []
    if any(p['oper'].get(k) for k in ('calada', 'volcable', 'carga', 'playa', 'líquidos')): t.append('<b style="color:#B83A26">entra a zona operativa</b>')
    if p['interplanta'] >= 0.15 * n: t.append('va y viene entre plantas')
    if p['top'] and p['top'][0]['pct'] >= 60: t.append('recorrido fijo')
    if p['findePct'] >= 20: t.append('también fines de semana')
    q = p['cuartos']; tot = sum(q.values()) or 1
    if (q['Q1']) / tot >= 0.2: t.append('de noche')
    return ', '.join(t)
per_d = -(-len(SEL) // 3)
for k in range(3):
    part = SEL[k * per_d:(k + 1) * per_d]
    rows = ''
    for v in part:
        p = v['patron'] or {}
        tops, flags = patron_txt(v)
        med = p.get('medianaMin')
        rows += (f'<tr><td><i class="dot" style="background:{CAT[cat(v)][2]}"></i><b>{PAT.get(v["patente"], v["patente"])}</b></td><td>{e(v["tipoDss"] or "—")}</td><td class="n">{v["viajes"]}</td><td class="n m">{mes_txt(v)}</td>'
                 f'<td class="n">{v["dias"]}</td><td class="n">{"" if med is None else (f"{med} min" if med < 120 else f"{med / 60:.1f} h".replace(".", ","))}</td><td>{p.get("horaTipica", "")}</td>'
                 f'<td class="n">{p.get("findePct", "")}%</td><td>{"Ric + SL" if v["zona"].startswith("Ricardone y") else "Ric" if v["zona"] == "Ricardone" else "SL"}{f" · {p.get("interplanta")}↔" if p.get("interplanta") else ""}</td>'
                 f'<td class="seq">{tops} {flags}</td><td class="lab">{etiqueta(v)}</td></tr>')
    section(eyebrow(f'FUERA DEL SISTEMA DE CAMIONES · DATOS Y RECORRIDO {k * per_d + 1}–{k * per_d + len(part)} DE {len(SEL)}')
            + f'<table><thead><tr><th>Patente</th><th>Tipo DSS</th><th class="n">Viajes</th><th class="n">Ago · Sep · Oct</th><th class="n">Días</th><th class="n">Estadía típica</th><th>Llega (50%)</th><th class="n">Finde</th><th>Plantas</th><th>Recorrido más frecuente</th><th>Patrón</th></tr></thead><tbody>{rows}</tbody></table>',
            f'Cámaras {D0}–{D1} (octubre hasta el 14). Viajes = entradas a una planta armadas por cámaras. Estadía típica = mediana entrada→salida (solo visitas con las dos lecturas). '
            'Llega = hora de la primera lectura de la visita, rango del 25% al 75%. Finde = % de visitas sábado/domingo. ↔ = pasadas de una planta a la otra en menos de 3 h. '
            'Recorrido = secuencia de cámaras de la visita y % de visitas que la repiten. Zona operativa = alguna lectura en calada, volcable, carga, Playa 3 o líquidos.')

CSS = f'''
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{--bg:#1a1f1d}}
html,body{{background:var(--bg);height:100%;font-family:'Public Sans',Arial,sans-serif;overflow:hidden}}
:root{{color-scheme:dark}}
#stage{{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}}
.s{{position:absolute;width:1920px;height:1080px;background:{BG};color:{INK};padding:40px 80px 96px;display:none;transform-origin:center}}
.s.on{{display:block}}
.body{{display:flex;flex-direction:column;gap:16px;height:100%}}
.eyebrow{{font-size:22px;font-weight:700;letter-spacing:3px;color:{VIO}}}
h2{{font-family:'Domine',Georgia,serif;font-weight:700;color:{GDK};line-height:1.15}}
.leyenda{{display:flex;gap:28px;flex-wrap:wrap}}
.ley{{display:flex;align-items:center;gap:8px;font-size:19px}} .ley i{{display:inline-block;width:24px;height:11px;border-radius:3px}}
.grid{{display:grid;grid-template-columns:repeat(5,1fr);gap:8px 18px}}
.cell p{{font-size:16px;color:{MUTE};white-space:nowrap;margin-top:3px}} .cell p b{{color:{INK};font-size:17px}}
.ph{{position:relative;height:118px;border-radius:9px 9px 0 0;overflow:hidden;background:#E6EAE7}}
.ph img{{width:100%;height:100%;object-fit:cover;display:block}}
.tag{{position:absolute;left:6px;top:6px;font-size:12px;letter-spacing:1px;color:#fff;padding:2px 6px;border-radius:5px}}
.nofoto{{display:flex;align-items:center;justify-content:center;height:100%;font-size:15px;color:#7C8783}}
table{{border-collapse:collapse;width:100%;font-size:13px;color:{INK};font-family:inherit}}
th{{text-align:left;font-size:13px;color:{MUTE};font-weight:700;border-bottom:2px solid {GDK};padding:4px 6px;white-space:nowrap}}
td{{padding:0 6px;border-bottom:1px solid #E3E7E4;white-space:nowrap;line-height:1.15;height:15px}}
td.seq{{max-width:640px;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}} td.lab{{max-width:330px;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}}
.n{{text-align:right}} .m{{color:{MUTE}}}
.dot{{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}}
.flag{{display:inline-block;background:#FBE6E1;color:{RED};font-weight:700;border-radius:4px;padding:0 5px;margin-left:4px;font-size:12.5px}}
.foot{{position:absolute;left:80px;right:80px;bottom:24px;height:56px;display:flex;align-items:center;justify-content:space-between}}
.foot p{{font-size:19px;color:{MUTE}}} .logos{{display:flex;gap:32px;align-items:center}} .logos img{{height:44px}}
aside{{display:none}}
#nav{{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom,0px));right:max(16px,env(safe-area-inset-right,0px));color:#cfd8d3;font:14px Arial;display:flex;gap:10px;align-items:center;z-index:2}}
#nav button{{background:#2b332f;color:#e6ece8;border:0;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:14px}}
'''
JS = '''
const S=[...document.querySelectorAll('.s')];let i=0;
function fit(){const k=Math.min(innerWidth/1920,innerHeight/1080);S.forEach(s=>s.style.transform=`scale(${k})`)}
function show(n){i=Math.max(0,Math.min(S.length-1,n));S.forEach((s,j)=>s.classList.toggle('on',j===i));document.getElementById('pg').textContent=(i+1)+' / '+S.length;try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
addEventListener('resize',fit);addEventListener('keydown',e=>{if(['ArrowRight','PageDown',' '].includes(e.key))show(i+1);if(['ArrowLeft','PageUp'].includes(e.key))show(i-1)});
document.getElementById('prev').onclick=()=>show(i-1);document.getElementById('next').onclick=()=>show(i+1);
fit();show((parseInt(location.hash.slice(1))||1)-1);
'''
# fragmento para publicar como artifact (el visor agrega doctype/head/body); aspecto único claro, como las láminas del comité
doc = ('<meta charset="utf-8"><title>Vehículos fuera del sistema</title><meta name="claude:viewport-fit-sides" content="cover">'
       '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Domine:wght@700&family=Public+Sans:wght@400;700&display=swap" rel="stylesheet">'
       f'<style>{CSS}</style><div id="stage">{"".join(slides)}</div><div id="nav"><button id="prev" aria-label="Anterior">‹</button><span id="pg"></span><button id="next" aria-label="Siguiente">›</button></div><script>{JS}</script>')
open(os.path.join(CARPETA, 'deck.html'), 'w', encoding='utf-8').write(doc)
print(len(slides), 'láminas ·', len(SEL), 'patentes ·', sum(1 for v in SEL if FOTOS.get(v['patente'], {}).get('archivo')), 'con foto ->', os.path.join(CARPETA, 'deck.html'))
