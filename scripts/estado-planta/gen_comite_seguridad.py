"""Comité de Seguridad Nodo Sur — maqueta (17 láminas, igual que el comité 24/09–04/10).

Uso:
  node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts 2026-10-05 2026-10-11
  python scripts/estado-planta/gen_comite_seguridad.py reportes/logistica/2026-10-05_2026-10-11/comite-seguridad

La detección (casos, tablas, cifras) sale de <carpeta>/datos.json, que arma comite-seguridad-deteccion.ts con
las cámaras y, si está, el Excel del período. Histórico y anexo: scripts/estado-planta/comite-seguridad-historico.json.
Capturas de DSS (opcional): <carpeta>/fotos.json = {"PATENTE": [["/_blob/<id>", "HH:MM", "Calada"], ...]}.
Escribe <carpeta>/deck/project/{deck.json, slides/*.html}. Lo que depende del Excel o de DSS y todavía no está
queda marcado en la lámina como pendiente.
"""
import json, collections, os, re, sys, datetime
CARPETA = os.path.abspath(sys.argv[1])
D = json.load(open(os.path.join(CARPETA, 'datos.json'), encoding='utf-8'))
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'comite-seguridad-historico.json'), encoding='utf-8'))
FOTOS_F = os.path.join(CARPETA, 'fotos.json')
import io, base64
def thumb(path, w, h):
    from PIL import Image
    im = Image.open(path).convert('RGB'); im.thumbnail((w, h))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=74, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
FOTOS = json.load(open(FOTOS_F, encoding='utf-8')) if os.path.exists(FOTOS_F) else {}
OUT = os.path.join(CARPETA, 'deck')
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)

MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
P0, P1 = D['periodo']['desde'], D['periodo']['hasta']
dm = lambda d: f'{d[8:10]}/{d[5:7]}'
D0, D1 = dm(P0), dm(P1)
LBL = f'Comité de Seguridad · {D0} al {D1}/{P1[:4]}'
d0, d1 = datetime.date.fromisoformat(P0), datetime.date.fromisoformat(P1)
PERIODO_LARGO = (f'Del {d0.day} al {d1.day} de {MESES[d1.month - 1]} de {d1.year}' if d0.month == d1.month
                 else f'Del {d0.day} de {MESES[d0.month - 1]} al {d1.day} de {MESES[d1.month - 1]} de {d1.year}')
F = D['fuentes']
SIN_EXCEL = len(F['excelFaltante']) == len(D['periodo']['dias'])
EXCEL_PARCIAL = bool(F['excelFaltante']) and not SIN_EXCEL
FALTA_EXCEL = (f'el Excel del {D0} al {D1}' if SIN_EXCEL else 'el Excel de ' + ', '.join(dm(x) for x in F['excelFaltante'])) if F['excelFaltante'] else ''
NUM = ['ningún', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']
miles = lambda n: f'{n:,}'.replace(',', '.')
num = lambda n, cap=False: (NUM[n] if n < len(NUM) else str(n)).capitalize() if cap else (NUM[n] if n < len(NUM) else str(n))

INK = '#1B2420'; MUTE = '#4F5A55'; BG = '#FBFBF8'; GDK = '#0B5638'; VIO = '#2E1B4E'
RED = '#B83A26'; ORG = '#A8560C'; BLU = '#1C6E9F'
AER_RIC = '/_blob/e8229e75c2a0a968b6be6c3d527f7935'; AER_SL = '/_blob/e2e09e7c898ca1ad7be75da7e18712df'
NVA_L = '/_blob/2df255c7ee65ff030b6abac843aadd01'; BTZ_L = '/_blob/92d65b1e6c8f547eebb719a09aad5012'
NVA = '/_blob/640efa7bef389ff0d26e0af3b1636d39'; BTZ = '/_blob/0858c3bd8314ca0d46fba166c79465cc'
SANS = "'Public Sans', Arial, sans-serif"; SERIF = "'Domine', Georgia, serif"
slides = []

def footer(dark=False):
    col = '#CFE3D7' if dark else MUTE
    nva, btz = (NVA_L, BTZ_L) if dark else (NVA, BTZ)
    return (f'<div style="position:absolute; left:128px; right:128px; bottom:56px; height:64px; display:flex; flex-direction:row; align-items:center; justify-content:space-between">'
            f'<p style="font-size:24px; color:{col}">{LBL} · §N§</p><div style="display:flex; flex-direction:row; align-items:center; gap:40px">'
            f'<img src="{nva}" alt="Nueva Vicentin Argentina" style="width:75px; height:40px; object-fit:contain"><img src="{btz}" alt="Bimtrazer" style="width:119px; height:56px; object-fit:contain"></div></div>')
def section(id, body, notes='', bg=BG, dark=False, gap=36, foot=True):
    color = '#F4F8F5' if dark else INK
    a = f'<aside>{notes}</aside>' if notes else ''
    slides.append((id, f'<section id="{id}" style="background:{bg}; color:{color}; font-family:{SANS}; padding:112px 128px 176px; display:flex; flex-direction:column; gap:{gap}px; justify-content:start">{body}{footer(dark) if foot else ""}{a}</section>'))
def divider(id, num_, title, sub):
    section(id, f'<div style="flex:1"></div><p style="font-family:{SERIF}; font-size:200px; font-weight:700; line-height:1; color:#8C7BB0">{num_}</p>'
                f'<h1 style="font-family:{SERIF}; font-size:80px; font-weight:700; color:#FBFBF8; line-height:1.1">{title}</h1>'
                f'<p style="font-size:34px; line-height:1.45; color:#DCD5EA; width:1400px">{sub}</p><div style="flex:1"></div>', bg=VIO, dark=True)
def h2(t, size=60): return f'<h2 style="font-family:{SERIF}; font-size:{size}px; font-weight:700; line-height:1.2; color:{GDK}">{t}</h2>'
def eyebrow(t, col=ORG): return f'<p style="font-size:26px; font-weight:700; letter-spacing:3px; color:{col}">{t}</p>'
def pendiente(t):
    return (f'<div style="display:flex; flex-direction:row; gap:24px; align-items:center; background:#FFFFFF; border:2px dashed {ORG}; border-radius:20px; padding:24px 36px">'
            f'<x-icon name="Clock" style="color:{ORG}; width:44px; height:44px"></x-icon><p style="flex:1; font-size:26px; line-height:1.4; color:{INK}">{t}</p></div>')
def badge(t, col=ORG, bg='#FDEEDD'):
    return f'<span style="display:inline-block; font-size:22px; font-weight:700; letter-spacing:2px; color:{col}; background:{bg}; border-radius:24px; padding:6px 18px; white-space:nowrap">{t}</span>'

# ---------- casos del período
DC = json.load(open(os.path.join(CARPETA, 'doble-ciclo.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'doble-ciclo.json')) else {'dobleCiclo': []}
VUELTAS = [v for v in D['vueltas'] if v['estado'] != 'descartado_excel']
for v in VUELTAS:   # también doble ciclo (volvió por el pre-ingreso, un solo movimiento en el Excel): se aclara en la lámina de fotos
    x = next((x for x in DC['dobleCiclo'] if x['patente'] == v['patente'] and x['dia'] == v['dia'] and x['opsExcel'] == 1), None)
    if x:
        pre = next((it['hora'] for it in x['grupos'][2]['items'] if it['punto'] == 'Pre-ingreso'), None)
        ing = x['excel'][0].split('ingreso ')[1].split(' ')[0] if x['excel'] else None
        v['fotosNota'] = (f'Al volver pasó por el pre-ingreso ({pre}) y la planilla tiene un solo movimiento ({ing}): también es un doble ciclo con un solo contrato.' if pre and ing else 'También es un doble ciclo con un solo contrato.')
VUELTAS_DESC = [v for v in D['vueltas'] if v['estado'] == 'descartado_excel']
V_PEND = [v for v in VUELTAS if v['estado'] == 'pendiente_excel']
PKG = (D.get('balanza') or {}).get('pasadosKg', [])   # pasados de kilos por balanza (comite-seguridad-deteccion.ts 1b)
CAMIONETAS = {x['patente'] for x in D['camionetas']['lista']}
CALLES = [dict(c, tipo='dos') for c in D['dosCalles']]
for c in D['declarado']:
    if not any(x['patente'] == c['patente'] and x['dia'] == c['dia'] for x in CALLES): CALLES.append(dict(c, tipo='otra'))
    else: next(x for x in CALLES if x['patente'] == c['patente'] and x['dia'] == c['dia'])['excel'] = c['excel']
CALLES.sort(key=lambda c: (c['dia'][3:5], c['dia'][:2], c['calles'][0]['hora']))
# depuración: fuera los vehículos sin operación en el Excel (camionetas que circulan por el puerto) y una explicación por caso
SACADOS = [c['patente'] for c in CALLES if c['tipo'] == 'dos' and c.get('excel') in (None, 'Sin operación')]
CALLES = [c for c in CALLES if not (c['tipo'] == 'dos' and c.get('excel') in (None, 'Sin operación'))]
_min = lambda h: int(h[:2]) * 60 + int(h[3:])
def explica(c):
    ex = c.get('excel') or ''; cs = [x['calle'] for x in c['calles']]
    decl = re.search(r'Volcable (\d)', ex); decl = decl.group(1) if decl else None
    if c['tipo'] == 'otra':
        return f'Declaró el volcable {decl} y la cámara lo leyó en la calle {cs[0]}.', True
    contig = all(abs(int(a) - int(b)) == 1 for a, b in zip(cs, cs[1:]))
    if not decl and ex and 'VOLCABLE_PTO' not in ex.upper():
        return f'Egreso de {ex.lower()}: carga, sin volcable declarado; circula por la zona de volcables' + (' (calles contiguas).' if contig else '.'), False
    gaps = [(_min(b['hora']) - _min(a['hora'])) % 1440 for a, b in zip(c['calles'], c['calles'][1:])]
    if max(gaps) <= 5:
        return f'Entró a la calle {cs[0]} y a los {max(gaps)} min estaba en la {cs[-1]}: se equivocó y cambió en el momento' + (f'; descargó en la {cs[-1]}, como declaró.' if decl == cs[-1] else '.'), False
    if contig:
        return 'Calles contiguas: puede ser la cámara de la calle de al lado.', False
    return 'Para revisar.', True
for c in CALLES: c['motivo'], c['revisar'] = explica(c)
EXCL = json.load(open(os.path.join(CARPETA, 'casos-excluidos.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'casos-excluidos.json')) else {}
CALLES = [c for c in CALLES if c['patente'] not in EXCL.get('calles', [])]   # sacados a mano después de revisar las fotos
REVISAR = [c for c in CALLES if c['revisar']]
EXTRA = json.load(open(os.path.join(CARPETA, 'casos-extra.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'casos-extra.json')) else []
INTER = D['interplanta']; CERCA = D['interplantaCercanos']; UI = D.get('umbralInterplantaMin', 30)   # norma: 20 min (pedido 26/10)
N_HOY = len(VUELTAS) + len(REVISAR) + len(EXTRA)

# ---------- portada
slides.append(('cover', f'<section id="cover" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:#0B5638; font-family:\'IBM Plex Sans\', Arial, sans-serif; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(14,40,28,0.82); border-left:6px solid #7CC3EC; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(30,18,52,0.82); border-left:6px solid #F2A65A; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Seguridad · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Seguridad Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">{PERIODO_LARGO}</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Seguridad Nodo Sur, del {D0} al {D1}. Ricardone arriba, puerto San Lorenzo abajo.</aside></section>'))

# ---------- histórico (comité actual primero, como en el comité anterior)
HC = CFG['historico']
H = [('Hoy', N_HOY)] + [tuple(x) for x in HC['series']]
mx = max(v for _, v in H) or 1
bars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:700">{v}{"*" if l == "Hoy" and (V_PEND or SIN_EXCEL) else ""}</p><div style="align-self:stretch; height:{max(4, round(v / mx * 300))}px; background:{RED if l == "Hoy" else "#D9EBD9"}; border:{"0" if l == "Hoy" else "2px solid #1B2420"}; border-radius:6px 6px 0px 0px"></div><p style="font-size:24px; color:{MUTE}">{l}</p></div>' for l, v in H)
add = {'vuelta': len(VUELTAS), 'calles': len(REVISAR)}
for x in EXTRA: add[x.get('categoria', 'otros')] = add.get(x.get('categoria', 'otros'), 0) + 1
CAT = [(c['nombre'], c['casos'] + add.get(c['clave'], 0), c['clave']) for c in HC['categorias']]
CAT.sort(key=lambda x: -x[1])
CCOL = {'doble': GDK, 'vuelta': RED, 'otros': '#7B8A83', 'primer': BLU, 'calles': ORG}
tot = sum(v for _, v in H)
cmax = max(v for _, v, _ in CAT)
cats = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:330px; font-size:24px; line-height:1.2; color:{INK}">{n}</p><div style="width:{max(8, round(v / cmax * 260))}px; height:30px; background:{CCOL[k]}; border-radius:0px 6px 6px 0px"></div><p style="font-size:26px; font-weight:700; color:{INK}; white-space:nowrap">{v}</p></div>' for n, v, k in CAT)
top = CAT[0]
txt_hoy = (f'Este comité suma {N_HOY}: {len(VUELTAS)} {"vuelta" if len(VUELTAS) == 1 else "vueltas"} a Ricardone desde el puerto, {len(REVISAR)} {"camión" if len(REVISAR) == 1 else "camiones"} en una calle distinta de la declarada' + (f' y {", ".join(x["patente"] for x in EXTRA)} ({", ".join(x["meta"].split(" · ")[0] for x in EXTRA)}), que no descargó todo en el puerto.' if EXTRA else '.'))
section('historico', eyebrow(f'HISTÓRICO · {HC["desde"]} AL {D1}', GDK) + h2(f'{tot} anomalías presentadas desde junio')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:12px"><p style="font-size:26px; font-weight:700">Casos por comité</p><div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{bars}</div></div>'
    + f'<div style="width:720px; display:flex; flex-direction:column; gap:14px"><p style="font-size:26px; font-weight:700">Las que más se repiten</p>{cats}</div></div>'
    + f'<p style="font-size:28px; line-height:1.4"><b>{top[0].split(" (")[0]}</b> sigue siendo la más frecuente ({top[1]}). {txt_hoy}'
    + (f' <span style="color:{ORG}">* Provisorio: falta {FALTA_EXCEL} para confirmar los casos.</span>' if (V_PEND or SIN_EXCEL) else '') + '</p>',
    f'Casos con lámina propia en cada comité de seguridad ({HC["desde"]} al {D1}; «Hoy» = {D0} al {D1}), sin contar las tablas de demoras interplanta. Serie anterior: comite-seguridad-historico.json. «Hoy» = vueltas a Ricardone candidatas o confirmadas + camiones en dos calles u otra calle del período.'
    + (f' Sin {FALTA_EXCEL}: las vueltas son candidatas por cámaras y el cruce volcable declarado vs calle no se pudo hacer.' if F['excelFaltante'] else ''))

# ---------- números
def card(big, txt, bg, col, sub=''):
    s = f'<p style="font-size:24px; line-height:1.35; color:{ORG}; font-weight:600">{sub}</p>' if sub else ''
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:20px; background:{bg}; padding:44px 40px; border-radius:24px"><p style="font-family:{SERIF}; font-size:96px; font-weight:700; line-height:1.05; color:{col}; white-space:nowrap">{big}</p><p style="font-size:30px; line-height:1.35; color:{INK}">{txt}</p>{s}</div>'
nv = len(VUELTAS)
vtxt = ('candidato a volver a Ricardone sin descargar' if nv == 1 else 'candidatos a volver a Ricardone sin descargar') if V_PEND else ('volvió a Ricardone sin descargar' if nv == 1 else 'volvieron a Ricardone sin descargar')
ctxt = 'camión descargó en una calle distinta de la declarada' if len(REVISAR) == 1 else 'camiones descargaron en una calle distinta de la declarada'
banner = []
if F['excelFaltante']:
    banner.append(f'<b>Pendiente de Excel:</b> falta {FALTA_EXCEL}. Con cámaras solas salen las demoras entre plantas y las dos calles; el Excel confirma las vueltas y agrega el volcable declarado vs la calle.')
if F['camarasFaltantes']:
    banner.append(f'<b>Sin cámaras:</b> ' + ', '.join(dm(x) for x in F['camarasFaltantes']) + '.')
section('numeros', h2(f'Del {D0} al {D1} en números', 64)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:28px">'
    + card(str(nv), vtxt, '#FBE9E4', RED, 'A confirmar con el Excel' if V_PEND else '')
    + card(str(len(INTER)), f'demoras de más de {UI} min entre plantas sin calado en el puerto', '#FDEEDD', ORG)
    + card(str(len(REVISAR)), ctxt, '#ECE8F3', VIO, 'Volcable declarado: falta el Excel' if F['excelFaltante'] else ((f'{len(CALLES) - len(REVISAR)} paso por dos calles explicado' if len(CALLES) - len(REVISAR) == 1 else f'{len(CALLES) - len(REVISAR)} pasos por dos calles explicados') if len(CALLES) > len(REVISAR) else ''))
    + '</div>' + ''.join(pendiente(b) for b in banner),
    f'Cámaras {D0}–{D1} ({F["lecturasPeriodo"]} lecturas; hora operativa = hora de cámara + 206 min) con {F["correcciones"]["renombradas"]} lecturas corregidas y {F["correcciones"]["descartadas"]} descartadas por las correcciones de patentes de En vivo. '
    + f'Vueltas: llegó al puerto desde Ricardone (después de calar), salió sin lectura de volcable y volvió a entrar directo a Ricardone (ingreso o calada, sin pre-ingreso) antes de 12 h. '
    + ('Sin Excel del período no se puede confirmar que no hubo descarga en esa visita.' if V_PEND else 'El Excel no tiene operación en el puerto para esa visita.')
    + (f' Descartadas por el Excel: {", ".join(v["patente"] + " " + v["dia"] for v in VUELTAS_DESC)}.' if VUELTAS_DESC else ''))

# ---------- 01 vueltas
divider('div-vuelta', '01', 'Anomalías de circuito' if EXTRA else 'Fueron al puerto y volvieron a Ricardone',
        ('Camiones que no cumplieron el circuito: llegaron al puerto, salieron sin descargar y volvieron a Ricardone, o no terminaron de descargar.' if EXTRA else
         'El circuito de grano termina en San Lorenzo. Estos camiones llegaron al puerto, salieron sin descargar y volvieron a entrar a Ricardone.')
        + (' Detectados con las cámaras; falta el Excel para confirmarlos.' if V_PEND else ''))

def box(t, lab, red=False, plant='ric', compacto=False):
    c = RED if red else (BLU if plant == 'ric' else ORG)
    bc = RED if red else ('#2F8FCB' if plant == 'ric' else '#E07B1F')
    ft, fl, pad = (22, 18, '8px 2px') if compacto else (28, 24, '12px 6px')
    return (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:#FFFFFF; border:{3 if red else 2}px solid {bc}; border-radius:14px; padding:{pad}">'
            f'<p style="font-size:{ft}px; font-weight:700; color:{c}; white-space:nowrap">{t}</p><p style="font-size:{fl}px; line-height:1.15; text-align:center; color:{RED if red else INK}">{lab}</p></div>')
def group(plant, items, flex, compacto=False):   # compacto: muchos pasos en la misma línea (recorridos de 10+ lecturas)
    bg, col, name = ('#E3F1FA', BLU, 'RICARDONE') if plant == 'ric' else ('#FDEEDD', ORG, 'SAN LORENZO')
    return (f'<div style="flex:{flex}; display:flex; flex-direction:column; gap:{6 if compacto else 10}px; background:{bg}; border-radius:20px; padding:{"10px 8px 8px" if compacto else "14px 12px 12px"}"><p style="font-size:{20 if compacto else 24}px; font-weight:700; letter-spacing:2px; color:{col}">{name}</p>'
            f'<div style="display:flex; flex-direction:row; gap:{4 if compacto else 8}px">' + ''.join(box(t, l, r, plant, compacto) for t, l, r in items) + '</div></div>')
def arrow(red=False):
    return f'<div style="display:flex; flex-direction:column; justify-content:center; padding-top:38px"><x-shape kind="arrow-right" style="background:{RED if red else "#A7B0AB"}; width:44px; height:26px"></x-shape></div>'

def titulo_vuelta(v):
    if v.get('titulo'): return v['titulo']
    if v['balanzaSalida']: t = 'Pasó por las dos balanzas del puerto sin descargar'
    else: t = f'Salió del puerto a los {v["minPuerto"]} minutos'
    n = v['caladasVuelta']
    t += ' y volvió a calar' + (' dos veces' if n >= 2 else '') if n else ' y volvió a Ricardone'
    return t
# rechazados en la balanza del puerto: mismo formato que las vueltas (patente, línea por planta y todas las fotos del DSS)
_bf = os.path.join(CARPETA, 'fotos', 'recorridos', 'blobs.json'); _ef = os.path.join(CARPETA, 'recorridos-excluidos.json')
BLOBS_REC = json.load(open(_bf, encoding='utf-8')) if os.path.exists(_bf) else {}
EXC_REC0 = json.load(open(_ef, encoding='utf-8'))['pasos'] if os.path.exists(_ef) else []
CORTO = {'Ingreso puerto': 'Ingreso', 'Balanza puerto': 'Balanza', 'Balanza salida puerto': 'Bal. salida', 'Salida puerto': 'Salida'}
hm_ = lambda m: f'{int(m)} min' if m < 60 else f'{int(m) // 60} h {int(m) % 60:02d} m'
# Sistema de camiones (data/movimientos, sin kilos) de los rechazados: ingresos del período (¿dado de baja?) y descargas anteriores,
# para responder «¿es un camión de descarga?» y «¿son dos viajes distintos?» (pedido 26/10).
DATA_DIR = os.path.abspath(os.path.join(CARPETA, '..', '..', '..', '..', 'data'))
_FLOTA = {x['patente'] for x in PKG}
SGC_HIST = collections.defaultdict(list)
for _d in sorted(os.listdir(os.path.join(DATA_DIR, 'movimientos'))) if _FLOTA else []:
    _f = os.path.join(DATA_DIR, 'movimientos', _d, 'movimientos.json')
    if not os.path.exists(_f): continue
    for r in json.load(open(_f, encoding='utf-8')):
        if r.get('plate_normalized') in _FLOTA:
            k = (r.get('ingreso_id') or r.get('external_operation_id'), r.get('fecha_ing_original'))
            if all((o.get('ingreso_id') or o.get('external_operation_id'), o.get('fecha_ing_original')) != k for o in SGC_HIST[r['plate_normalized']]): SGC_HIST[r['plate_normalized']].append(r)
PLAT = lambda p: (p or '').replace('VOLCABLE_PTO_SGC', 'volcable').replace('VOLCABLE_PTO_', 'volcable ').replace('CELDA_16', 'Celda 16').lower() or 'sin plataforma'
# Calle donde descargó el reingreso. El DEPOSITO del SGC («SILO 5») es el destino del grano, no la calle: no se usa.
# GVW791: Volcable 5 por foto del DSS (listVehicleCaptures): Ford Cargo sin patente en SLZVolcableC5 02:13:50 (cámara) y
# en SLZBalSC2Fte 02:23:04 (leyó «VH4»), 6 min antes de su salida leída. Las dos fotos se agregaron a mano a la lámina (26/10).
CALLE_DESCARGA = {'GVW791': '5'}
def sistema_rechazo(pl, dia):   # texto corto: ingresos desde el rechazo + historial de descargas
    rs = SGC_HIST.get(pl, []); d0 = f'{P0[:4]}-{dia[3:5]}-{dia[:2]}'
    hoy = sorted([r for r in rs if str(r.get('external_ingreso_at', ''))[:10] >= d0], key=lambda r: r.get('external_ingreso_at') or '')
    antes = [r for r in rs if str(r.get('external_ingreso_at', ''))[:10] < d0 and r.get('movement_type') == 'INGRESO' and not r.get('baja')]
    ing = '; '.join(f'ingreso {r.get("ingreso_id")} {"en Ricardone" if r.get("planta_normalized") == "RICARDONE" else "al puerto"} {str(r.get("external_ingreso_at"))[8:10]}/{str(r.get("external_ingreso_at"))[5:7]} {str(r.get("external_ingreso_at"))[11:16]}'
                    + (' dado de baja por la balanza' if r.get('baja') else f', descargó{" en el Volcable " + CALLE_DESCARGA[pl] if pl in CALLE_DESCARGA else ""}') for r in hoy)
    hist = (f'Camión de descarga habitual: {len(antes)} descargas de {antes[0]["product_normalized"].lower()} antes ({", ".join(dict.fromkeys(PLAT(r.get("platform_normalized")) for r in antes))})' if antes else 'Sin descargas anteriores en el sistema')
    return ing, hist
for x in PKG:
    pl = x['patente']; exk = {e['clave'] for e in EXC_REC0 if e['patente'] == pl}
    vis = [dict(v, items=[it for it in v['items'] if f'{pl}|{it.get("device")}|{it.get("at")}' not in exk]) for v in x['visitas']]
    vis = [v for v in vis if v['items']]
    sl_ = [v for v in vis if v['planta'] == 'sl']
    m1 = (sl_[0]['items'][-1]['t'] - sl_[0]['items'][0]['t']) / 60000 if sl_ else 0
    hasta = (sl_[1]['items'][0]['t'] - sl_[0]['items'][-1]['t']) / 60000 if len(sl_) > 1 else None
    fotos_ = [(BLOBS_REC.get(f'{pl}_{it["hora"].replace(":", "")}_{it.get("device", "")}'), it['hora'], CORTO.get(it['punto'], it['punto']) + (' (alg.)' if it['estado'] != 'camara' else ''), v['planta']) for v in vis for it in v['items']]
    sin_foto = [f for f in fotos_ if not f[0]]
    if len(sin_foto) < len(fotos_): FOTOS[f'{pl}_todas'] = [f for f in fotos_ if f[0]]   # el DSS no siempre tiene la captura
    exc_txt = '; '.join(f'{e["punto"]} {e["hora"]}' for e in EXC_REC0 if e['patente'] == pl)
    s_ing, s_hist = sistema_rechazo(pl, x['primerIngreso'][:5])
    # reingreso que la detección no ve (fuera de sus horas): un ingreso posterior sin baja en el sistema (GXO579 28/10)
    reing = sorted([r for r in SGC_HIST.get(pl, []) if not r.get('baja') and str(r.get('external_ingreso_at', '')) > f'{P0[:4]}-{x["primerIngreso"][3:5]}-{x["primerIngreso"][:2]}T{x["primerIngreso"][6:11]}'], key=lambda r: r['external_ingreso_at'])
    VUELTAS.append({'patente': pl, 'dia': x['primerIngreso'][:5], 'estado': 'balanza', 'producto': x['producto'],
        'titulo': ((('La balanza del puerto le dio de baja el ingreso' if any(r.get('baja') for r in SGC_HIST.get(pl, [])) else 'La balanza del puerto no lo pesó') + (', volvió a Ricardone y entró de nuevo' if x['estado'] == 'volvio_a_ricardone' else (f'; volvió a entrar el {reing[0]["external_ingreso_at"][8:10]}/{reing[0]["external_ingreso_at"][5:7]} y descargó' if reing else ' y no volvió a entrar')))),
        'puertoTxt': hm_(m1), 'hastaTxt': hm_(hasta) if hasta is not None else (f'{reing[0]["external_ingreso_at"][8:10]}/{reing[0]["external_ingreso_at"][5:7]} {reing[0]["external_ingreso_at"][11:16]}' if reing else 'Sin volver'), 'hastaLbl': 'hasta entrar de nuevo al puerto' if hasta is not None else ('nuevo ingreso en el sistema' if reing else 'todavía'),
        'grupos': [{'planta': v['planta'], 'items': [{'hora': it['hora'], 'punto': CORTO.get(it['punto'], it['punto']) + (' (alg.)' if it['estado'] != 'camara' else '')} for it in v['items']]} for v in vis],
        'lecturas': [f'{it["hora"]} {it["punto"]}' + (f' (algoritmo, leyó {it.get("leyo") or "sin patente"})' if it['estado'] != 'camara' else '') for v in vis for it in v['items']],
        'fotosNota': (f'<b>Sistema de camiones:</b> {s_ing}. {s_hist}.<br>' + '(alg.) = paso que la cámara vio sin leer bien la patente y el algoritmo por lote asignó a este camión; se revisó con la foto.' + (f' Se sacó lo que la foto mostró de otro camión: {exc_txt}.' if exc_txt else '')
                      + (f' Sin foto en el DSS: {", ".join(f[1] + " " + f[2] for f in sin_foto)}.' if sin_foto else '')),
        'notas': f'{pl}: sistema de camiones — {s_ing}. {s_hist}. Balanza SGC, 1.º ingreso {x["primerIngreso"]}–{x["primeraSalida"][-5:]} sin pesar' + (f'; 2.º ingreso {x["segundoIngreso"]}–{x["segundaSalida"][-5:]}' if x['segundoIngreso'] else '; sin otro ingreso todavía') + '. Lecturas: ' + '; '.join(f'{it["hora"]} {it["punto"]}' for v in vis for it in v['items']) + '.'})
for v in VUELTAS:
    pl = v['patente']
    pills = [(v['puertoTxt'], 'en el puerto sin descargar')] + ([(v['hastaTxt'], v['hastaLbl'])] if v['hastaTxt'] else [])
    pl_html = ''.join(f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:14px; background:{bg}; padding:12px 24px; border-radius:40px"><p style="font-family:{SERIF}; font-size:36px; font-weight:700; color:{c}; white-space:nowrap">{a}</p><p style="font-size:24px; color:{INK}; white-space:nowrap">{b}</p></div>'
                      for (a, b), (bg, c) in zip(pills, [('#FBE9E4', RED), ('#FDEEDD', ORG)]))
    tl = ''
    compacto = sum(len(g['items']) for g in v['grupos']) > 10
    for i, g in enumerate(v['grupos']):
        red_grp = i == 2
        items = [(x['hora'], x['punto'], red_grp or (i == 1 and x['punto'] in ('Egreso', 'Balanza salida'))) for x in g['items']]
        if i: tl += arrow(red_grp)
        tl += group(g['planta'], items, max(2, len(items)), compacto)
    fotos = FOTOS.get(pl, []); todas = FOTOS.get(f'{pl}_todas', [])
    if todas:   # todas las lecturas del camión en la misma lámina
        n_t = len(todas)
        if n_t <= 12: nc, fw, fh = 6, 264, 146
        else:   # muchas lecturas: dos filas, fotos más chicas y el rótulo en dos líneas
            nc = min(10, -(-n_t // 2)); fw = (1664 - (nc - 1) * 12) // nc; fh = round(fw * 0.56)
        ph = (f'<div style="display:grid; grid-template-columns:repeat({nc}, {fw}px); gap:8px {16 if n_t <= 12 else 12}px">' + ''.join(
              f'<div style="display:flex; flex-direction:column; gap:4px"><img src="{src}" alt="Cámara {t} · {pt}" style="width:{fw}px; height:{fh}px; object-fit:cover; border-radius:10px">'
              + (f'<p style="font-size:20px; color:{MUTE}; white-space:nowrap"><b style="color:{INK}">{t}</b> · {"Ric." if planta == "ric" else "SL"} · {pt}</p></div>' if n_t <= 12 else
                 f'<p style="font-size:18px; line-height:1.2; color:{MUTE}"><b style="color:{INK}">{t}</b> · {"Ric." if planta == "ric" else "SL"}<br>{pt}</p></div>') for src, t, pt, planta in todas) + '</div>'
              + (f'<p style="font-size:24px; line-height:1.35; color:{INK}">{v["fotosNota"]}</p>' if v.get('fotosNota') else ''))
    elif fotos:
        ph = ''.join(f'<div style="width:401px; display:flex; flex-direction:column; gap:12px"><img src="{src}" alt="Cámara {t} · {lab}" style="width:401px; height:236px; object-fit:cover; border-radius:14px"><p style="font-size:24px; color:{MUTE}"><b style="color:{INK}">{t}</b> · {lab}</p></div>' for src, t, lab in fotos)
    else:
        falta = (['el Excel (confirmar que no hubo operación en el puerto en esa visita)'] if v['estado'] == 'pendiente_excel' else []) + ['las capturas de DSS (sin VPN)']
        ph = (f'<div style="flex:1; display:flex; flex-direction:row; align-items:center; gap:24px; background:#FFFFFF; border:2px dashed {ORG if v["estado"] == "pendiente_excel" else "#D3DAD6"}; border-radius:20px; padding:32px 40px"><x-icon name="{"Clock" if v["estado"] == "pendiente_excel" else "Search"}" style="color:{ORG}; width:44px; height:44px"></x-icon>'
              f'<p style="font-size:28px; line-height:1.4; color:{INK}">{"Candidato detectado con las cámaras" if v["estado"] == "pendiente_excel" else "Caso detectado con las cámaras y confirmado con el Excel"}. Falta: {" y ".join(falta)}.</p></div>')
    prod = (v.get('producto') or '').upper()
    meta = f'{v["dia"]} · {prod}' if prod else f'{v["dia"]}'
    head = (f'<div style="display:flex; flex-direction:row; gap:40px; align-items:center"><div style="display:flex; flex-direction:column; width:340px; background:#FFFFFF; border:4px solid {INK}; border-radius:14px; overflow:hidden"><div style="height:22px; background:#1F3F8C"></div><p style="font-family:Arial, sans-serif; font-size:64px; font-weight:700; text-align:center; letter-spacing:2px; color:{INK}; padding:4px 0px 8px">{pl}</p></div>'
            f'<div style="flex:1; display:flex; flex-direction:column; gap:14px"><div style="display:flex; flex-direction:row; gap:20px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; color:{MUTE}">{meta}</p>{badge("CANDIDATO · A CONFIRMAR CON EXCEL") if v["estado"] == "pendiente_excel" else ""}</div>'
            f'<h2 style="font-family:{SERIF}; font-size:44px; font-weight:700; line-height:1.15; color:{INK}">{titulo_vuelta(v)}</h2><div style="display:flex; flex-direction:row; gap:16px">{pl_html}</div></div></div>')
    body = f'{head}<div style="display:flex; flex-direction:row; gap:10px; align-items:stretch">{tl}</div>' + (f'<div style="display:flex; flex-direction:column; gap:12px">{ph}</div>' if todas else f'<div style="display:flex; flex-direction:row; gap:20px">{ph}</div>')
    notes = v['notas'] if v.get('notas') else (f'{pl}: lecturas de cámara (hora operativa) — ' + '; '.join(v['lecturas']) + '. '
             + ('Excel del día no disponible: candidato.' if v['estado'] == 'pendiente_excel' else f'Excel: sin operación en el puerto para la primera visita. Operaciones: {"; ".join(v["excel"] or [])}.'))
    slides.append((f'v-{pl.lower()}-{v["dia"].replace("/", "")}', f'<section id="v-{pl.lower()}-{v["dia"].replace("/", "")}" style="background:{BG}; color:{INK}; font-family:{SANS}; padding:{"80px 128px 150px" if todas else "112px 128px 176px"}; display:flex; flex-direction:column; gap:{18 if todas else 30}px; justify-content:start">{body}{footer()}<aside>{notes}</aside></section>'))
def caso_extra(x):
    plate = (f'<div style="display:flex; flex-direction:column; width:300px; background:#FFFFFF; border:4px solid {INK}; border-radius:14px; overflow:hidden"><div style="height:20px; background:#1F3F8C"></div>'
             f'<p style="font-family:Arial, sans-serif; font-size:68px; font-weight:700; letter-spacing:2px; text-align:center; color:{INK}; padding:4px 0px 10px">{x["patente"]}</p></div>')
    pills = ''.join(f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:12px; background:{bg}; padding:10px 22px; border-radius:40px"><p style="font-family:{SERIF}; font-size:32px; font-weight:700; color:{c}; white-space:nowrap">{a}</p><p style="font-size:22px; color:{INK}; white-space:nowrap">{b}</p></div>'
                    for (a, b), (bg, c) in zip(x['pills'], [('#FBE9E4', RED), ('#FDEEDD', ORG)]))
    head = (f'<div style="display:flex; flex-direction:row; gap:36px; align-items:center">{plate}<div style="flex:1; display:flex; flex-direction:column; gap:12px"><p style="font-size:24px; font-weight:600; letter-spacing:2px; color:{MUTE}">{x["meta"]}</p>'
            f'<h2 style="font-family:{SERIF}; font-size:42px; font-weight:700; line-height:1.15; color:{INK}">{x["titulo"]}</h2><div style="display:flex; flex-direction:row; gap:14px">{pills}</div></div></div>')
    miles_ = lambda n: f'{n:,}'.replace(',', '.')
    vrows = ''
    for v in x['viajes']:
        boxes = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; background:{"#FBE9E4" if note else "#FFFFFF"}; border:2px solid {RED if note else "#D3DAD6"}; border-radius:12px; padding:10px 18px">'
                        f'<p style="font-size:20px; color:{MUTE}">{lab}</p><p style="font-family:{SERIF}; font-size:34px; font-weight:700; line-height:1.1; color:{RED if note else INK}">{miles_(kg)}</p>'
                        + (f'<p style="font-size:19px; color:{RED}">{note}</p>' if note else '') + '</div>' for lab, kg, note in v['pesos'])
        mal = v['cargo'] != v['descargo']
        vrows += (f'<div style="display:flex; flex-direction:column; gap:8px"><p style="font-size:24px; font-weight:700; color:{INK}">{v["lbl"]}</p><div style="display:flex; flex-direction:row; gap:14px; align-items:stretch">{boxes}'
                  f'<div style="width:230px; display:flex; flex-direction:column; justify-content:center; gap:2px; border-left:4px solid {RED if mal else "#D3DAD6"}; padding:0px 0px 0px 16px"><p style="font-size:21px; color:{MUTE}">Cargó {miles_(v["cargo"])}</p><p style="font-size:24px; font-weight:700; color:{RED if mal else INK}">Descargó {miles_(v["descargo"])}</p></div></div></div>')
    fotos_x = ''.join(f'<div style="display:flex; flex-direction:column; gap:4px"><img src="{thumb(os.path.join(CARPETA, "fotos", x["patente"], f), 528, 300)}" alt="{t} · {lab}" style="width:264px; height:140px; object-fit:cover; border-radius:10px{"; outline:4px solid " + RED if red else ""}">'
                      f'<p style="width:264px; font-size:20px; line-height:1.25; color:{RED if red else MUTE}"><b style="color:{INK}">{t}</b> · {lab}</p></div>' for f, t, lab, red in x['fotos'])
    body = (head + f'<div style="display:flex; flex-direction:column; gap:14px">{vrows}</div>'
            + f'<div style="display:grid; grid-template-columns:repeat(6, 264px); gap:8px 16px">{fotos_x}</div>'
            + f'<p style="font-size:24px; line-height:1.35; color:{INK}; border-left:6px solid {RED}; padding:2px 0px 2px 18px"><b>{x["conclusion"]}</b></p>')
    sid = f'v-x-{x["id"]}'
    slides.append((sid, f'<section id="{sid}" style="background:{BG}; color:{INK}; font-family:{SANS}; padding:72px 128px 150px; display:flex; flex-direction:column; gap:18px">{body}{footer()}'
                   f'<aside>{x["nota"]} {x["_fuente"]}</aside></section>'))
for x in EXTRA: caso_extra(x)
if not VUELTAS and not PKG:
    section('v-ninguna', eyebrow('VUELTAS A RICARDONE') + h2(f'Del {D0} al {D1} ningún camión volvió a Ricardone sin descargar')
        + (pendiente(f'Revisado con las cámaras; falta {FALTA_EXCEL} para cerrar.') if F['excelFaltante'] else ''),
        'Misma regla que el comité anterior, sobre todas las visitas al puerto del período.')

# ---------- 02 calles
divider('div-calles', '02', 'Calles del puerto', 'Camiones que la cámara de una calle leyó junto con la de otra en la misma visita'
        + (', y descargas en una calle distinta del volcable declarado en el Excel.' if not F['excelFaltante'] else '. El cruce con el volcable declarado en el Excel queda pendiente.'))
def cam_txt(c): return ', luego '.join(('Calle ' if k == 0 else 'calle ') + f'{x["calle"]} · {x["hora"]}' for k, x in enumerate(c['calles']))
CALLES.sort(key=lambda c: (not c['revisar'], c['dia'][3:5], c['dia'][:2]))
trs = ''.join(f'<tr style="background:{"#FBE9E4" if c["revisar"] else ("#F1F4F2" if i % 2 == 0 else BG)}"><td style="font-weight:700; vertical-align:top">{c["patente"]}</td><td style="vertical-align:top">{c["dia"]}</td>'
              f'<td style="vertical-align:top">{c.get("excel") or "Pendiente"}</td><td style="vertical-align:top">{cam_txt(c)}</td><td style="vertical-align:top; color:{RED if c["revisar"] else GDK}; font-weight:{700 if c["revisar"] else 400}">{c["motivo"]}</td></tr>' for i, c in enumerate(CALLES))
DOS = [c for c in CALLES if c['tipo'] == 'dos']; OTRA = [c for c in CALLES if c['tipo'] == 'otra']
n5 = sum(1 for c in DOS if c['involucraC5'])
gap_min = lambda c: (lambda a, b: (int(b[:2]) * 60 + int(b[3:])) - (int(a[:2]) * 60 + int(a[3:])))(c['calles'][0]['hora'], c['calles'][1]['hora']) % 1440
rapidos = [c['patente'] for c in DOS if gap_min(c) <= 2]
ctexto = (f'{num(len(REVISAR), True)} {"camión" if len(REVISAR) == 1 else "camiones"} para revisar: la cámara {"lo" if len(REVISAR) == 1 else "los"} leyó en una calle distinta del volcable declarado en el Excel. '
          if REVISAR else 'Ningún caso para revisar. ') + (f'{"El otro caso se explica" if len(CALLES) - len(REVISAR) == 1 else f"Los otros {len(CALLES) - len(REVISAR)} casos se explican"} (ver la lectura de cada uno). ' if len(CALLES) > len(REVISAR) else '') + (f' Se {"sacó" if len(SACADOS) == 1 else "sacaron"} {" y ".join(SACADOS)}: {"es una camioneta" if len(SACADOS) == 1 else "son camionetas"} sin operación en el Excel.' if SACADOS else '')
section('calles-tabla', eyebrow('CALLE DE DESCARGA · PUERTO SAN LORENZO') + h2(f'Calles: {num(len(REVISAR))} {"caso" if len(REVISAR) == 1 else "casos"} para revisar; los pasos por dos calles se explican' if REVISAR else 'Calles: los pasos por dos calles se explican', 52)
    + (f'<table style="font-size:23px; color:{INK}; padding:10px 18px"><tr><th style="width:12%">Patente</th><th style="width:8%">Fecha</th><th style="width:20%">Excel</th><th style="width:24%">Cámara de la calle</th><th style="width:36%">Lectura</th></tr>{trs}</table>' if CALLES else '')
    + f'<p style="font-size:28px; line-height:1.4">{ctexto if CALLES else "Ninguna visita con lecturas en dos calles."}</p>'
    + (pendiente(f'<b>Volcable declarado vs calle:</b> se cruza con {FALTA_EXCEL}. La columna Excel se completa sola al regenerar.') if F['excelFaltante'] else ''),
    f'Cámaras {D0}–{D1}: visitas al puerto con lecturas de dos o más cámaras de volcable (SLZVolcableC1–C5). «Sin Excel desde …»: la patente no figura en ningún Excel disponible ({F["padronExcel"]}).'
    + (f' Excel: ingresos al puerto con volcable declarado y lectura de la cámara de otra calle: {len(D["declarado"])}.' if not SIN_EXCEL else ''))

FC = json.load(open(os.path.join(CARPETA, 'fotos', 'calles.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'fotos', 'calles.json')) else []
FC = [f for f in FC if f.get('archivo') and any(c['patente'] == f['patente'] for c in CALLES)]
def tarjeta_calle(c):
    fs = [f for f in FC if f['patente'] == c['patente'] and f['dia'] == c['dia']]
    inner = (1664 - 28 * (len(CALLES) - 1)) // max(1, len(CALLES)) - 52   # ancho útil de la tarjeta
    w = (inner - 12 * (len(fs) - 1)) // max(1, len(fs))
    hh = min(330 if len(CALLES) <= 2 else 274, round(w * 0.5625))
    imgs = ''.join(f'<div style="display:flex; flex-direction:column; gap:4px"><img src="{thumb(os.path.join(CARPETA, "fotos", "calles", f["archivo"]), 640, 360)}" alt="{f["patente"]} en la calle {f["calle"]}" style="width:{w}px; height:{hh}px; object-fit:cover; border-radius:10px">'
                   f'<p style="font-size:20px; color:{MUTE}; white-space:nowrap"><b style="color:{INK}">{f["hora"]}</b> · cámara calle {f["calle"]}</p></div>' for f in fs)
    col = RED if c['revisar'] else GDK
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:#FFFFFF; border:2px solid #D3DAD6; border-top:8px solid {col}; border-radius:16px; padding:20px 24px">'
            f'<div style="display:flex; flex-direction:row; gap:12px">{imgs}</div>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; justify-content:space-between"><p style="font-family:{SERIF}; font-size:38px; font-weight:700; color:{INK}">{c["patente"]}</p><p style="font-size:22px; color:{MUTE}">{c["dia"]}</p></div>'
            + badge('PARA REVISAR' if c['revisar'] else 'EXPLICADO', col, '#FBE9E4' if c['revisar'] else '#E3F1EA')
            + f'<p style="font-size:22px; line-height:1.35; color:{INK}"><b>Excel:</b> {c.get("excel") or "sin operación"}</p>'
            + f'<p style="font-size:22px; line-height:1.35; color:{INK}"><b>Cámara:</b> {cam_txt(c)}</p>'
            + f'<p style="font-size:22px; line-height:1.35; color:{col}; font-weight:{700 if c["revisar"] else 400}">{c["motivo"]}</p></div>')
if CALLES:
    section('calles', eyebrow('CALLE DE DESCARGA · PUERTO SAN LORENZO') + h2(f'Calles: {num(len(REVISAR))} {"caso" if len(REVISAR) == 1 else "casos"} para revisar' if REVISAR else 'Calles: ningún caso para revisar', 52)
        + f'<div style="display:flex; flex-direction:row; gap:28px; align-items:stretch">{"".join(tarjeta_calle(c) for c in CALLES)}</div>',
        f'Cámaras {D0}–{D1}: visitas al puerto con lecturas de dos o más cámaras de volcable (SLZVolcableC1–C5) y descargas en una calle distinta del volcable declarado en el Excel. Fotos del DSS de cada lectura (fotos-dss-lote.py calles). '
        + ('Sacados después de revisar las fotos: ' + ', '.join(EXCL.get('calles', [])) + '. ' if EXCL.get('calles') else '')
        + (f'Sin operación en el Excel (camionetas): {", ".join(SACADOS)}. ' if SACADOS else '') + ctexto, gap=24)
else:
    # sin casos: la lámina lo dice (y por qué la comparación contra el volcable declarado puede no estar)
    section('calles', eyebrow('CALLE DE DESCARGA · PUERTO SAN LORENZO') + h2('Calles: ningún caso para revisar', 52)
        + f'<p style="font-size:30px; line-height:1.4; color:{INK}; max-width:1500px">Ninguna visita al puerto con lecturas de dos calles que no tenga explicación'
        + (f' (sacados por no tener operación en la planilla: {", ".join(SACADOS)})' if SACADOS else '') + '.</p>',
        f'Cámaras {D0}–{D1}: visitas al puerto con lecturas de dos o más cámaras de volcable (SLZVolcableC1–C5). '
        + (f'Sin operación en la planilla: {", ".join(SACADOS)}. ' if SACADOS else '') + ctexto, gap=32)

# ---------- 03 interplanta
divider('div-interplanta', '03', 'Demoras entre plantas sin calado en el puerto',
        f'Más de {UI} minutos entre la salida de Ricardone y la entrada al puerto (el viaje normal es de {D["viajeNormalRicSLmin"]}), sin pasar después por la calada de San Lorenzo.')
if INTER:
    # todos los casos, sin fotos: día, salida, patente, demora (pedido 26/10). Los que salieron de Ricardone con ≤15 min
    # de diferencia el mismo día se marcan como tanda: llegan juntos y esperan juntos en el ingreso del puerto.
    _ts = sorted(INTER, key=lambda r: (r['dia'][3:5], r['dia'][:2], r['salida']))
    _mins = lambda r: int(r['salida'][:2]) * 60 + int(r['salida'][3:])
    tanda = {}
    for a, b in zip(_ts, _ts[1:]):
        if a['dia'] == b['dia'] and _mins(b) - _mins(a) <= 15: tanda[id(a)] = tanda[id(b)] = True
    def celda(r): return (f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:14px; background:{"#FDEEDD" if tanda.get(id(r)) else "#FFFFFF"}; border:2px solid {"#F2C9A0" if tanda.get(id(r)) else "#D3DAD6"}; border-radius:12px; padding:8px 16px">'
                          f'<p style="font-size:22px; color:{MUTE}; width:150px; white-space:nowrap">{r["dia"]} {r["salida"]}</p><p style="flex:1; font-size:24px; font-weight:700; color:{INK}">{r["patente"]}</p><p style="font-size:24px; font-weight:700; color:{RED}">{r["min"]} min</p></div>')
    n = len(INTER); nt = sum(1 for r in INTER if tanda.get(id(r)))
    section('interplanta', eyebrow('INTERPLANTA · RICARDONE → SAN LORENZO') + h2(f'{num(n, True)} {"camión tardó" if n == 1 else "camiones tardaron"} más de {UI} minutos y no {"pasó" if n == 1 else "pasaron"} por la calada del puerto', 52)
        + f'<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px 20px">' + ''.join(celda(r) for r in _ts) + '</div>'
        + (f'<p style="font-size:26px; line-height:1.4; color:{INK}"><span style="display:inline-block; width:30px; height:20px; background:#FDEEDD; border:2px solid #F2C9A0; border-radius:5px"></span> <b>{nt} salieron en tanda</b> (con menos de 15 min entre uno y otro): llegaron juntos al puerto; hay que ver si la demora fue espera en el ingreso.</p>' if nt else ''),
        f'Regla: último egreso de Ricardone → cámara de ingreso de San Lorenzo, más de {UI} min (norma) y hasta 2 h, sin lectura en la calada del puerto hasta la salida. Solo grano: caló en Ricardone o transile (Playa 3 / carga); fuera líquidos y camiones sin calada ni carga (residuos, servicios). Si después del egreso hay Playa 3 o carga, la salida real no se leyó y el viaje no se mide. Viaje normal = mediana de la semana ({D["viajeNormalRicSLmin"]} min).')
else:
    cr = ''.join(f'<tr style="background:{"#FDEEDD" if i % 2 == 0 else BG}"><td>{r["dia"]}</td><td>{r["salida"]}</td><td style="font-weight:700">{r["patente"]}</td><td style="text-align:right">{r["min"]} min</td><td>{r["motivo"].capitalize()}</td></tr>' for i, r in enumerate(CERCA))
    section('interplanta', eyebrow('INTERPLANTA · RICARDONE → SAN LORENZO') + h2(f'Del {D0} al {D1}, ningún camión de grano tardó más de {UI} minutos sin pasar por la calada del puerto', 52)
        + f'<div style="display:flex; flex-direction:row; gap:28px; align-items:stretch">{card(str(D["viajeNormalRicSLmin"]) + " min", "viaje normal de Ricardone al puerto (mediana de la semana)", "#E3F1EA", GDK)}'
        + (f'<div style="flex:2; display:flex; flex-direction:column; gap:14px"><p style="font-size:26px; font-weight:700">Los más cercanos a la regla</p><table style="font-size:24px; color:{INK}; padding:8px 22px"><tr><th style="width:12%">Día</th><th style="width:16%">Salida Ric</th><th style="width:18%">Patente</th><th style="width:16%; text-align:right">Viaje</th><th style="width:38%">Por qué no entra</th></tr>{cr}</table></div>' if CERCA else '')
        + '</div>',
        f'Regla: último egreso de Ricardone → cámara de ingreso de San Lorenzo, más de {UI} min y hasta 2 h, sin lectura en la calada del puerto. Solo grano (caló en Ricardone o transile). Cercanos: hasta 5 min por debajo de la norma, o más pero con calada en el puerto.')

# ---------- camionetas sin Excel
CL = D['camionetas']['lista']
zonas = [('Ricardone y San Lorenzo', 'Ricardone y puerto', BLU), ('Ricardone', 'Solo Ricardone', GDK), ('San Lorenzo', 'Solo puerto San Lorenzo', ORG)]
NDIAS = len(F['camaras']) if F.get('camaras') else 7
SIEMPRE = lambda x: x.get('dias', 0) >= NDIAS - 1   # vienen siempre: todos los días o todos menos uno
CHIP = 'padding:4px 12px; font-size:22px' if len(CL) <= 45 else 'padding:2px 10px; font-size:19px'
def chip(x, col):
    mark = ' ≈' if x['parecida'] else ''
    if SIEMPRE(x):
        return f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:{VIO}; border:2px solid {VIO}; border-radius:10px; {CHIP}"><b style="color:#FFFFFF">{x["patente"]}{mark}</b><span style="color:#E4DCF5">{x["viajes"]}</span></span>'
    return f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:10px; {CHIP}"><b style="color:{INK}">{x["patente"]}{mark}</b><span style="color:{col}">{x["viajes"]}</span></span>'
grp = ''
for z, nombre, col in zonas:
    xs = [x for x in CL if x['zona'] == z]
    if not xs: continue
    grp += f'<div style="display:flex; flex-direction:column; gap:10px"><p style="font-size:24px; font-weight:700; color:{col}">{nombre} · {len(xs)}</p><div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:10px">' + ''.join(chip(x, col) for x in xs) + '</div></div>'
FVR = {f['patente']: f for f in (json.load(open(os.path.join(CARPETA, 'fotos', 'camionetas-ric.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'fotos', 'camionetas-ric.json')) else []) if f.get('archivo')}
def foto_planta(pl_):   # foto de Ricardone si la hay (vehículos que van a las dos plantas), si no la del puerto
    if pl_ in FVR: return os.path.join(CARPETA, 'fotos', 'camionetas-ric', FVR[pl_]['archivo']), 'Ricardone'
    f_ = FV[pl_]; return os.path.join(CARPETA, 'fotos', 'camionetas', f_['archivo']), ('Ricardone' if (f_.get('dispositivo') or '').startswith('Ric') else 'San Lorenzo')
def tag_planta(n): return f'<p style="position:absolute; left:8px; top:8px; font-size:15px; font-weight:700; letter-spacing:1px; color:#FFFFFF; background:{GDK if n == "Ricardone" else VIO}; padding:2px 8px; border-radius:6px">{n.upper()}</p>'
FV = {f['patente']: f for f in (json.load(open(os.path.join(CARPETA, 'fotos', 'camionetas.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'fotos', 'camionetas.json')) else []) if f.get('archivo')}
CC = json.load(open(os.path.join(CARPETA, 'fotos', 'camionetas-clasificacion.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'fotos', 'camionetas-clasificacion.json')) else None
cat_of = lambda pl_: (CC['patentes'].get(pl_) if CC else None)
ccount = collections.Counter(cat_of(x['patente']) for x in CL if cat_of(x['patente'])) if CC else {}
cres = ' · '.join(f'{CC["categorias"][k]["nombre"].lower()} {n}' for k, n in sorted(ccount.items(), key=lambda kv: CC['categorias'][kv[0]]['orden'])) if CC else ''
section('camionetas', eyebrow('VEHÍCULOS LIVIANOS SIN EXCEL', VIO)
    + h2(f'{len(CL)} vehículos con {D["camionetas"]["umbral"]} o más viajes que no figuran en el Excel' if CC else f'{len(CL)} camionetas, utilitarios y traffics con {D["camionetas"]["umbral"]} o más viajes que no figuran en el Excel', 52)
    + (f'<p style="font-size:28px; line-height:1.35; color:{INK}">Según la foto de cada uno: <b>{cres}</b>.</p>' if CC else '')
    + f'<div style="display:flex; flex-direction:row; align-items:center; gap:12px"><span style="display:inline-block; width:34px; height:22px; background:{VIO}; border-radius:6px"></span><p style="font-size:24px; color:{INK}"><b>{sum(1 for x in CL if SIEMPRE(x))} vienen siempre</b>: {NDIAS - 1} o {NDIAS} de los {NDIAS} días de la semana, fin de semana incluido.</p></div>'
    + f'<div style="display:flex; flex-direction:column; gap:18px">{grp}</div>'
    + (pendiente(f'<b>Provisorio:</b> se cruzó con el Excel del {F["padronExcel"]} ({miles(F["padronPatentes"])} patentes); falta {FALTA_EXCEL}. ≈ = una letra distinta de una patente del Excel (puede ser mala lectura).') if F['excelFaltante'] else '')
    + f'<div style="display:flex; flex-direction:row; gap:24px; align-items:center; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:20px; padding:22px 36px"><x-icon name="Search" style="color:{RED}; width:40px; height:40px"></x-icon><p style="flex:1; font-size:26px; line-height:1.4"><b>Para definir:</b> ¿le asignamos a cada uno un recorrido permitido, para que el sistema avise solo cuando se salga de él?</p></div>',
    f'Viajes = recorridos de cámara (journeys) del {D0} al {D1}, patentes con formato válido, después de las correcciones de En vivo. No figuran en ningún Excel disponible ({F["padronExcel"]}). Parecidas a una patente del Excel: {", ".join(D["camionetas"]["parecidas"]) or "ninguna"}. En el registro de vehículos particulares: {", ".join(D["camionetas"]["enRegistro"]) or "ninguna"}. Lista completa en patentes-sin-excel.csv.' + (f' Clasificación por la foto de DSS (fotos/camionetas-clasificacion.json): {cres}.' if CC else ''), gap=26)
if FV and CC:
    CLs = sorted(CL, key=lambda x: (CC['categorias'][cat_of(x['patente']) or 'auto']['orden'], -x['viajes']))
    CCOL = {'pickup': BLU, 'utilitario': GDK, 'colectivo': RED, 'camion_chico': ORG, 'auto': VIO}
    for k in range(0, len(CLs), 24):
        part = CLs[k:k + 24]
        gal = ''.join(f'<div style="position:relative; display:flex; flex-direction:column; gap:3px">{tag_planta(foto_planta(x["patente"])[1])}<img src="{thumb(foto_planta(x["patente"])[0], 528, 300)}" alt="{x["patente"]}" style="width:264px; height:124px; object-fit:cover; border-radius:10px 10px 0px 0px; border-bottom:6px solid {CCOL.get(cat_of(x["patente"]), INK)}">'
                      f'<p style="font-size:20px; color:{MUTE}; white-space:nowrap"><b style="color:{INK}">{x["patente"]}</b> · {x["viajes"]} viajes' + (f' · <b style="color:{VIO}">{x["dias"]} días</b>' if SIEMPRE(x) else '') + '</p></div>'
                      for x in part if x['patente'] in FV)
        cats_here = ' · '.join(dict.fromkeys(CC['categorias'][cat_of(x['patente'])]['nombre'] for x in part))
        ley = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:10px"><div style="width:26px; height:12px; background:{CCOL[k_]}; border-radius:3px"></div><p style="font-size:22px; color:{INK}">{CC["categorias"][k_]["nombre"]} · {ccount.get(k_, 0)}</p></div>'
                      for k_ in dict.fromkeys(cat_of(x['patente']) for x in part))
        section(f'camionetas-fotos-{k // 24 + 1}', eyebrow(f'VEHÍCULOS SIN EXCEL · FOTOS {k + 1}–{k + len(part)} DE {len(CLs)}', VIO) + h2(cats_here, 44)
            + f'<div style="display:flex; flex-direction:row; gap:32px">{ley}</div>'
            + f'<div style="display:grid; grid-template-columns:repeat(6, 264px); gap:8px 16px">{gal}</div>',
            'Una captura del DSS por vehículo (de día cuando hay), con la patente leída por el DSS igual a la de la cámara (scripts/estado-planta/fotos-dss-lote.py camionetas). '
            + '; '.join(f'{x["patente"]} {FV[x["patente"]].get("cuando")} {FV[x["patente"]].get("dispositivo")} (DSS: {FV[x["patente"]].get("tipo")})' for x in part if x['patente'] in FV) + '.', gap=18)

# ---------- anexo: antigüedad del parque (Excel histórico)
AX = CFG['anexo']
section('anexo', f'<p style="font-size:28px; font-weight:700; letter-spacing:3px; color:#F1F6F2">ANEXO</p><h1 style="font-family:{SERIF}; font-size:84px; font-weight:700; line-height:1.15; color:#F1F6F2; width:1400px; margin-top:40px">¿Qué tan viejos son los camiones que entran a planta?</h1>'
    + f'<div style="display:flex; flex-direction:row; gap:200px; margin-top:80px"><div style="display:flex; flex-direction:column; gap:24px"><p style="font-size:120px; font-weight:700; line-height:1; color:#F2C14E">{AX["promedioAnios"]} <span style="font-size:64px; color:#F1F6F2">años</span></p><p style="font-size:34px; color:#CFE3D7">Antigüedad promedio</p></div>'
    + f'<div style="display:flex; flex-direction:column; gap:24px"><p style="font-size:120px; font-weight:700; line-height:1; color:#F2B880">{AX["unoDeCada"]}</p><p style="font-size:30px; color:#CFE3D7">{AX["unoDeCadaTxt"]}</p></div></div>',
    AX['fuente'], bg=GDK, dark=True, foot=False)
BC = ['#7A2A0C', '#B5441C', '#E07B3A', '#F2B880', '#BBDCC8', '#4E9C72', '#0B5638']
bmx = max(b['camiones'] for b in AX['bins'])
cols = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:12px"><p style="font-size:40px; font-weight:700">{b["pct"]}</p>'
               f'<div style="align-self:stretch; height:{round(b["camiones"] / bmx * 440)}px; background:{BC[i]}; border-radius:8px 8px 0px 0px; display:flex; justify-content:center; padding-top:14px"><p style="font-size:28px; font-weight:700; color:{"#1B2420" if i in (3, 4) else "#FFFFFF"}">{miles(b["camiones"])}</p></div>'
               + f'<p style="font-size:28px; font-weight:700">{b["rango"]}</p><p style="font-size:22px; color:{MUTE}">{b["edad"]}</p></div>' for i, b in enumerate(AX['bins']))
section('parque-anios', h2('Camiones por antigüedad de patente') + f'<div style="flex:1; display:flex; flex-direction:row; gap:24px; align-items:end">{cols}</div>', AX['fuente'], foot=False)
VU = AX['vuelta']
kp = ''.join(f'<div style="display:flex; flex-direction:column; gap:10px"><p style="font-size:84px; font-weight:700; line-height:1; color:#F1F6F2">{k["big"]}</p><p style="font-size:24px; line-height:1.4; color:#CFE3D7">{k["txt"]}</p></div>' for k in VU['kpis'])
vmx = max(b[1] for b in VU['bins']) or 1
vr = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:28px"><p style="width:200px; font-size:26px; font-weight:700">{r}</p><div style="flex:1; height:52px; background:#ECEFEC; border-radius:8px; position:relative"><div style="position:absolute; left:0; top:0; bottom:0; width:{n / vmx * 100:.1f}%; background:{BC[i]}; border-radius:8px"></div></div><p style="width:180px; font-size:34px; font-weight:700; text-align:right">{n} <span style="color:{MUTE}">· {p}</span></p></div>' for i, (r, n, p) in enumerate(VU['bins']))
slides.append(('parque-vuelta', f'<section id="parque-vuelta" style="background:{BG}; color:{INK}; font-family:{SANS}; display:flex; flex-direction:row"><div style="width:640px; background:{GDK}; padding:112px 80px; display:flex; flex-direction:column; gap:48px"><p style="font-size:24px; font-weight:700; letter-spacing:2px; color:#F1F6F2">CAMIONES DE LA VUELTA</p>{kp}</div>'
    + f'<div style="flex:1; padding:112px 96px; display:flex; flex-direction:column; gap:22px">{h2("Una flota chica, intensiva y vieja", 56)}<p style="font-size:24px; color:{MUTE}">{VU["fechables"]} de los {VU["total"]} se pueden fechar por patente</p>{vr}<p style="font-size:28px; line-height:1.4; margin-top:12px">{VU["conclusion"].replace("<b>", f"<b style=\"color:{RED}\">")}</p></div>'
    + f'<aside>{VU["_nota"]} {AX["fuente"]}</aside></section>'))

SV = json.load(open(os.path.join(CARPETA, 'fotos', 'servicio-patentes.json'), encoding='utf-8')) if os.path.exists(os.path.join(CARPETA, 'fotos', 'servicio-patentes.json')) else None
if SV:
    SVL = SV['lista'] if isinstance(SV, dict) else SV
    TCOL = {'Agua': BLU, 'Atmos': RED, 'Cister': ORG, 'Resid': ORG, 'Recol': GDK}
    tcol = lambda t: next((c for k, c in TCOL.items() if t.startswith(k)), INK)
    sg = ''.join(f'<div style="position:relative; display:flex; flex-direction:column; gap:4px">{tag_planta("Ricardone" if "Ric" in r["foto"] else "San Lorenzo")}<img src="{thumb(os.path.join(CARPETA, "fotos", r["foto"]), 528, 300)}" alt="{r["patente"]}" style="width:264px; height:190px; object-fit:cover; border-radius:10px 10px 0px 0px; border-bottom:6px solid {tcol(r["tipo"])}">'
                 f'<p style="font-size:21px; color:{INK}; white-space:nowrap"><b>{r["patente"]}</b> · <span style="color:{tcol(r["tipo"])}; font-weight:700">{r.get("corto") or r["tipo"].split(" · ")[0]}</span></p>'
                 f'<p style="font-size:19px; color:{INK}; white-space:nowrap">{r.get("destino", "")}</p><p style="font-size:19px; color:{MUTE}; white-space:nowrap">{r["dias"]} días · {r["mov"]} mov. en la semana</p></div>' for r in SVL if os.path.exists(os.path.join(CARPETA, 'fotos', r['foto'])))
    nsiempre = sum(1 for r in SVL if r['dias'] >= NDIAS - 1)
    section('servicio', eyebrow('VEHÍCULOS DE SERVICIO · FIGURAN EN LA PLANILLA', VIO) + h2('Los de servicio que vienen siempre: agua, atmosférico y residuos', 50)
        + f'<p style="font-size:26px; line-height:1.35; color:{INK}">Están en la planilla, así que no entran en la lista anterior. Las cisternas sacan residuos orgánicos a Solamb (Timbúes) y Worms (Arroyo Seco), unas 20 t por viaje; el atmosférico los mueve entre Ricardone y la Terminal. ' + (lambda ag, rs: f'Los camiones de agua industrial ({", ".join(r["patente"] for r in ag)}) vinieron {min(r["dias"] for r in ag)} de los {NDIAS} días; el atmosférico y las cisternas de residuos, entre {min(r["dias"] for r in rs)} y {max(r["dias"] for r in rs)} días.')([r for r in SVL if r['tipo'] == 'Agua industrial'], [r for r in SVL if not r['tipo'].startswith('Agua')]) + '</p>'
        + f'<div style="display:grid; grid-template-columns:repeat(6, 264px); gap:10px 16px">{sg}</div>',
        SV.get('_nota', '') + ' ' + '; '.join(f'{r["patente"]} {r["tipo"]} ({r["producto"]}): {r["mov"]} movimientos, {r["dias"]} días' for r in SVL) + '.', gap=20)

# ---------- 04 balanza (SGC) y ETL: datos.json → balanza / etl (comite-seguridad-deteccion.ts)
BAL = D.get('balanza'); ETL = [x for x in (D.get('etl') or []) if not str(x.get('conclusion', '')).startswith('Descargó')]   # balanza + algoritmo confirman la descarga: no es caso
hmin = lambda m: f'{m} min' if m < 60 else f'{m // 60} h {m % 60:02d} m'
def y_(l): l = list(l); return l[0] if len(l) == 1 else ', '.join(l[:-1]) + ' y ' + l[-1]
TD = 'padding:6px 18px'
if BAL is not None:
    divider('div-balanza', '04', 'Balanza y recorridos fuera de lo común',
            'Lo que marcan la balanza (SGC) y el ETL, explicado con las cámaras: ingresos que salieron sin pesar, reingresos rápidos, visitas relámpago al puerto.')
    SP = [x for x in BAL['sinPesar'] if x['planta'] == 'Ricardone']; SPP = [x for x in BAL['sinPesar'] if x['planta'] != 'Ricardone']
    al_puerto = [x for x in SP if x['alerta']]
    if SP:
        ult = lambda x: ' → '.join(x['adentro'].split(' → ')[-2:]) if ' → ' in x['adentro'] else x['adentro']
        # muchos casos: en la tabla solo los que fueron al puerto; los demás, en una línea (no entran 14+ filas)
        RESTO = [x for x in SP if x['destino'] == 'No fue al puerto'] if len(SP) > 13 else []
        TAB = [x for x in SP if x not in RESTO]
        tr =''.join(f'<tr style="background:{"#FDEEDD" if x["alerta"] else ("#F1F4F2" if i % 2 == 0 else BG)}"><td>{x["ingreso"]}</td><td style="font-weight:700">{x["patente"]}</td><td>{x["producto"].capitalize()}</td><td style="text-align:right">{hmin(x["minutos"])}</td><td>{ult(x)}</td><td style="color:{RED if x["alerta"] else GDK}; font-weight:700">{x["destino"]}</td></tr>' for i, x in enumerate(TAB))
        section('sin-pesar', eyebrow('BALANZA · INGRESOS SIN PESAR', BLU)
            + h2(f'{num(len(SP), True)} camiones entraron a Ricardone y salieron sin pesar: ' + (f'{num(len(al_puerto))} fue{"ron" if len(al_puerto) != 1 else ""} igual al puerto' if al_puerto else 'ninguno fue al puerto'), 48)
            + f'<table style="font-size:22px; color:{INK}; {TD}"><tr><th style="width:13%">Ingreso</th><th style="width:11%">Patente</th><th style="width:16%">Producto</th><th style="width:10%; text-align:right">Adentro</th><th style="width:25%">Últimas cámaras en Ricardone</th><th style="width:25%">Después (12 h)</th></tr>{tr}</table>'
            + (f'<p style="font-size:24px; color:{INK}"><b>No fueron al puerto ({len(RESTO)}):</b> ' + ', '.join(f'{x["patente"]} {x["ingreso"][:5]}' for x in RESTO) + '. Calaron o se quedaron en Ricardone y salieron.</p>' if RESTO else '')
            + (f'<p style="font-size:22px; color:{MUTE}">En el puerto salieron sin pesar {num(len(SPP))} más: ' + ', '.join(x['patente'] for x in SPP) + '. Los de grano van en la lámina de vueltas a Ricardone.</p>' if SPP else ''),
            f'Balanza SGC del {D0} al {D1}: ingresos de grano y aceite con salida y sin peso neto (no se pesaron). Son rechazos de la balanza (calidad, documentación u otros). '
            f'Cámaras (con las correcciones de En vivo): lecturas de la patente o el acoplado entre 1 h antes del ingreso y 30 min después de la salida, y si en las 12 h siguientes apareció en el puerto. Total sin pesar: {len(BAL["sinPesar"])}.', gap=24)
    if ETL:
        # cada caso contra el sistema (balanza), el algoritmo por lote y En vivo (comite-seguridad-deteccion.ts → contraste)
        CASOS = [x for x in ETL if x.get('esCaso')]
        sis = lambda x: re.sub(r' · [\d.]+ kg', '', x.get('sistema', '')) if x.get('sistema') != 'No figura' else '<span style="color:' + RED + '">No figura</span>'
        def alg(x):
            t = x.get('lote') or ''
            m = re.match(r'Circuito (\S+): (\d+) pasos leídos, (\d+) reconstruidos, (\d+) deducidos, (\d+) faltan', t)
            if not m: return t.replace('No está en el lote (no es camión del sistema)', 'Fuera del lote')
            c, *n = m.groups()
            return f'{c} · {n[0]} leídos' + ''.join(f', {v} {k}' for v, k in zip(n[1:], ('reconstruidos', 'deducidos', 'faltan')) if v != '0')
        tr = ''.join(f'<tr style="background:{"#FDEEDD" if x.get("esCaso") else ("#F1F4F2" if i % 2 == 0 else BG)}"><td>{x["dia"]}</td><td style="font-weight:700">{x["patente"]}</td><td>{x["motivo"].replace(" (error de destino)", "")}</td><td>{sis(x)}</td><td>{alg(x)}</td><td style="font-weight:700; color:{RED if x.get("esCaso") else GDK}">{x.get("conclusion", "")}</td></tr>' for i, x in enumerate(ETL))
        cnt = collections.Counter(x['motivo'] for x in ETL)
        ETL_TXT = {'Reingreso rápido a Ricardone': ('reingreso rápido a Ricardone', 'reingresos rápidos a Ricardone'),
                   'Visita relámpago al puerto sin operar': ('visita relámpago al puerto', 'visitas relámpago al puerto'),
                   'Del puerto a Ricardone en menos de 2 h (error de destino)': ('vuelta del puerto a Ricardone en menos de 2 h', 'vueltas del puerto a Ricardone en menos de 2 h')}
        pls = sorted({x['patente'] for x in CASOS})
        section('etl-raros', eyebrow('RECORRIDOS · LO QUE MARCA EL ETL, CONTRA EL SISTEMA Y EL ALGORITMO', BLU)
            + h2(f'{num(len(ETL), True)} recorridos marcados por el ETL; con la balanza y el algoritmo, ' + (f'quedan {len(pls)} vehículos fuera del sistema para identificar' if pls else 'ninguno queda como caso'), 48)
            + f'<table style="font-size:22px; color:{INK}; {TD}"><tr><th style="width:7%">Día</th><th style="width:10%">Patente</th><th style="width:16%">Qué marcó</th><th style="width:20%">En el sistema (balanza)</th><th style="width:24%">Algoritmo por lote</th><th style="width:23%">Conclusión</th></tr>{tr}</table>'
            + (f'<p style="font-size:24px; color:{INK}"><b>Para identificar:</b> {", ".join(pls)}. Circulan por la planta varios días del período sin ningún movimiento de balanza.</p>' if pls else ''),
            'Corridas ETL semanales (final_circuits.anomaly_kind_reason, v17): ' + y_(sorted(f'{n_} {ETL_TXT.get(m, (m, m))[n_ != 1]}' for m, n_ in cnt.items())) + '. '
            'Cada caso se cruzó con los movimientos de balanza del período (SGC o Excel, misma patente ±3 h), con el algoritmo por lote (outputs/demostracion_lote, lote.mjs: el lote son los camiones del sistema) y con lo que se decidió en En vivo. '
            'Cámaras: ' + ' | '.join(f'{x["patente"]} {x["dia"]}: {x["lecturas"]}' for x in ETL), gap=24)
    if PKG:
        VOLV = [x for x in PKG if x['estado'] == 'volvio_a_ricardone']; SIGUE = [x for x in PKG if x['estado'] == 'sin_reingreso']
        tr = ''.join(f'<tr style="background:{"#FDEEDD" if x["estado"] == "volvio_a_ricardone" else ("#F1F4F2" if i % 2 == 0 else BG)}"><td style="font-weight:700">{x["patente"]}</td><td>{x["primerIngreso"]}–{x["primeraSalida"][-5:]}</td><td>{x["primerViaje"]}</td><td>{x["ricardone"]}</td><td>{(x["segundoIngreso"] or "Sin volver todavía")}</td><td>{x["segundoViaje"] or "—"}</td></tr>' for i, x in enumerate(PKG))
        section('pasados-kg', eyebrow('VUELTAS A RICARDONE · RECHAZADOS EN LA BALANZA DEL PUERTO')
            + h2((f'{num(len(VOLV), True)} camiones salieron del puerto sin pesar, volvieron a Ricardone y entraron de nuevo' if VOLV else f'{num(len(PKG), True)} camiones salieron del puerto sin pesar') + (f'; {"uno" if len(SIGUE) == 1 else num(len(SIGUE))} sin volver todavía' if SIGUE else ''), 48)
            + f'<table style="font-size:22px; color:{INK}; {TD}"><tr><th style="width:10%">Patente</th><th style="width:15%">1.º ingreso, sin pesar</th><th style="width:25%">Cámaras en el puerto</th><th style="width:20%">De vuelta en Ricardone</th><th style="width:11%">2.º ingreso</th><th style="width:19%">2.ª vez en el puerto</th></tr>{tr}</table>'
            + (f'<p style="font-size:24px; color:{INK}"><b>Lectura:</b> la balanza del puerto no los registró; volvieron a Ricardone y entraron con un ingreso nuevo.</p>' if VOLV else ''),
            f'Balanza SGC del {D0} al {D1}: ingresos de grano a la terminal con salida y sin peso (la balanza no los registró) y, dentro de las 24 h, otro ingreso de la misma patente. '
            'En el medio, las cámaras de Ricardone (con las correcciones de En vivo). El segundo ingreso del SGC arranca en Ricardone (la operación R7 se abre ahí). '
            'Equivale a la categoría «volvió a Ricardone desde el puerto» de los comités anteriores.', gap=24)
        # recorrido completo de cada uno: cámaras + pasos del algoritmo por lote (reconstruidos punteados, deducidos abajo)
        # fotos del DSS ya subidas al deck (fotos-recorridos.cjs + upload) y pasos que la foto desmintió (otro vehículo)
        _bf = os.path.join(CARPETA, 'fotos', 'recorridos', 'blobs.json'); _ef = os.path.join(CARPETA, 'recorridos-excluidos.json')
        BLOBS = json.load(open(_bf, encoding='utf-8')) if os.path.exists(_bf) else {}
        EXC_REC = json.load(open(_ef, encoding='utf-8'))['pasos'] if os.path.exists(_ef) else []
        exc_keys = {e['clave'] for e in EXC_REC}
        for x in PKG:
            pat = x['patente']; dia = x['primerIngreso'][:5]
            x['visitas'] = [dict(v, items=[it for it in v['items'] if f'{pat}|{it.get("device")}|{it.get("at")}' not in exc_keys]) for v in x['visitas']]
            x['visitas'] = [v for v in x['visitas'] if v['items']]
            exc_x = [e for e in EXC_REC if e['patente'] == pat]
            def chip(it):
                if it['estado'] == 'camara':
                    return f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:10px; padding:6px 14px; font-size:24px"><b style="color:{INK}">{it["punto"]}</b><span style="color:{MUTE}">{it["hora"]}</span></span>'
                return (f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:#F6F3FB; border:2px dashed {VIO}; border-radius:10px; padding:6px 14px; font-size:24px"><b style="color:{VIO}">{it["punto"]}</b><span style="color:{MUTE}">{it["hora"]}</span>'
                        f'<span style="font-size:20px; color:{VIO}">algoritmo{" · leyó " + it["leyo"] if it.get("leyo") else ""}</span></span>')
            fil = ''
            for v in x['visitas']:
                ric = v['planta'] == 'ric'
                fil += (f'<div style="display:flex; flex-direction:row; gap:24px; align-items:center"><div style="width:250px; display:flex; flex-direction:column; gap:2px; background:{GDK if ric else VIO}; border-radius:12px; padding:10px 16px">'
                        f'<p style="font-size:24px; font-weight:700; color:#FFFFFF">{"Ricardone" if ric else "Puerto"}</p><p style="font-size:22px; color:#DCE7E1">{v["items"][0]["hora"]} a {v["items"][-1]["hora"]}</p></div>'
                        f'<div style="flex:1; display:flex; flex-direction:row; flex-wrap:wrap; gap:10px">{"".join(chip(it) for it in v["items"])}</div></div>')
            ded = [d_ for d_ in x.get('deducidos', []) if not (d_['punto'] == 'Volcable' and d_['viaje'] == 1)]
            sgc = f'1.º ingreso {x["primerIngreso"][-5:]} a {x["primeraSalida"][-5:]}, sin pesar' + (f' · 2.º ingreso {x["segundoIngreso"][-5:]} a {x["segundaSalida"][-5:]}' if x['segundoIngreso'] else ' · sin otro ingreso todavía')
            tit = (f'{pat} · {dia}: la balanza del puerto no lo pesó, volvió a Ricardone y entró de nuevo a las {x["segundoIngreso"][-5:]}' if x['estado'] == 'volvio_a_ricardone'
                   else f'{pat} · {dia}: la balanza del puerto no lo pesó y no volvió a entrar' if x['estado'] == 'sin_reingreso' else f'{pat} · {dia}: la balanza del puerto no lo pesó y entró de nuevo sin pasar por Ricardone')
            foto = lambda it: BLOBS.get(f'{pat}_{it["hora"].replace(":", "")}_{it.get("device", "")}')
            if BLOBS and all(foto(it) for v in x['visitas'] for it in v['items']):
                # con fotos: una lámina por viaje (Ricardone + puerto); cada paso, su escena del DSS
                viajes = []
                for v in x['visitas']:
                    if not viajes or (v['planta'] == 'ric' and viajes[-1][-1]['planta'] == 'sl'): viajes.append([])
                    viajes[-1].append(v)
                for n_, vj in enumerate(viajes, 1):
                    def card_f(it, ric):
                        alg = it['estado'] != 'camara'
                        return (f'<div style="width:268px; display:flex; flex-direction:column; gap:4px; background:#FFFFFF; border:{"3px dashed " + VIO if alg else "2px solid #D3DAD6"}; border-top:6px solid {GDK if ric else VIO}; border-radius:10px; padding:6px">'
                                f'<img src="{foto(it)}" alt="{pat}, {it["punto"]} {it["hora"]}" style="width:252px; height:150px; object-fit:cover; border-radius:6px">'
                                f'<p style="font-size:22px; line-height:1.2; color:{INK}"><b>{it["punto"]}</b> {it["hora"]}</p>'
                                + (f'<p style="font-size:18px; color:{VIO}">algoritmo · leyó {it.get("leyo") or "sin patente"}</p>' if alg else '') + '</div>')
                    grid = ''.join(f'<div style="display:flex; flex-direction:row; gap:16px; align-items:center"><div style="width:150px; display:flex; flex-direction:column; gap:2px; background:{GDK if v["planta"] == "ric" else VIO}; border-radius:12px; padding:10px 14px">'
                                   f'<p style="font-size:24px; font-weight:700; color:#FFFFFF">{"Ricardone" if v["planta"] == "ric" else "Puerto"}</p><p style="font-size:20px; color:#DCE7E1">{v["items"][0]["hora"]}–{v["items"][-1]["hora"]}</p></div>'
                                   f'<div style="flex:1; display:flex; flex-direction:row; flex-wrap:wrap; gap:12px">{"".join(card_f(it, v["planta"] == "ric") for it in v["items"])}</div></div>' for v in vj)
                    ultimo = n_ == len(viajes)
                    section(f'pk-{pat.lower()}-{n_}', eyebrow(f'RECHAZADOS EN LA BALANZA DEL PUERTO · RECORRIDO COMPLETO · {n_} DE {len(viajes)}')
                        + h2(tit if n_ == 1 else f'{pat} · {dia}: de vuelta en Ricardone y el 2.º ingreso al puerto', 44)
                        + (f'<p style="font-size:24px; color:{INK}"><b>Balanza (SGC):</b> {sgc}.</p>' if n_ == 1 else '')
                        + f'<div style="display:flex; flex-direction:column; gap:14px">{grid}</div>'
                        + (f'<p style="font-size:22px; color:{MUTE}"><b>Sin lectura, deducido por el algoritmo:</b> ' + ', '.join(f'{d_["punto"]} ({"Ricardone" if d_["planta"] == "ric" else "puerto"})' for d_ in ded) + '.' + (' Se sacó el paso que la foto mostró de otro camión: ' + ', '.join(f'{e["punto"]} {e["hora"]}' for e in exc_x) + '.' if exc_x else '') + '</p>' if ultimo and (ded or exc_x) else ''),
                        f'Escenas del DSS de cada lectura de {pat} (fotos-recorridos.cjs), viaje {n_} de {len(viajes)}. Borde punteado: paso que la cámara vio sin leer bien la patente y el algoritmo por lote asignó a este camión; '
                        'se revisó con la foto que sea el mismo vehículo. En el ingreso que la balanza no pesó no se muestra la volcable que el algoritmo pueda asignar.', gap=18)
                continue
            section(f'pk-{pat.lower()}', eyebrow('RECHAZADOS EN LA BALANZA DEL PUERTO · RECORRIDO COMPLETO')
                + h2(tit, 46)
                + f'<p style="font-size:26px; color:{INK}"><b>Balanza (SGC):</b> {sgc}.</p>'
                + f'<div style="display:flex; flex-direction:column; gap:16px">{fil}</div>'
                + (f'<p style="font-size:24px; color:{MUTE}"><b>Sin lectura, deducido por el algoritmo:</b> ' + ', '.join(f'{d_["punto"]} ({"Ricardone" if d_["planta"] == "ric" else "puerto"})' for d_ in ded) + '.</p>' if ded else '')
                + f'<p style="font-size:22px; color:{MUTE}">Punteado: paso que la cámara vio sin leer bien la patente y el algoritmo por lote asignó a este camión.</p>',
                f'Lecturas de cámara de {pat} (patente o acoplado) desde 2 h antes del primer ingreso hasta 1 h después de la última salida, con las correcciones de En vivo, más los pasos del algoritmo por lote '
                '(outputs/demostracion_lote, lote.mjs). En el ingreso que la balanza no pesó no se muestra la volcable que el algoritmo pueda asignar: sin peso no hubo descarga.', gap=22)
    PS = BAL['pesados']
    if PS:
        tope = max(PS, key=lambda x: x['brutoKg'])
        bajo53 = sum(1 for x in PS if x['brutoKg'] <= 53000)
        prod = collections.Counter(x['producto'] for x in PS)
        chips = ''.join(f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:{"#FBE9E4" if x["brutoKg"] > 53000 else "#FFFFFF"}; border:2px solid {"#E7B9AE" if x["brutoKg"] > 53000 else "#D3DAD6"}; border-radius:10px; padding:4px 12px; font-size:22px"><b style="color:{INK}">{x["patente"]}</b><span style="color:{MUTE}">{x["dia"]} · {miles(x["brutoKg"])} kg</span></span>' for x in PS if x['brutoKg'] > 53000)
        pdia = collections.Counter(x['dia'] for x in PS if x['brutoKg'] <= 53000)
        chips += f'<p style="font-size:24px; color:{MUTE}; width:100%">Entre 52.500 y 53.000 kg, por día: ' + ' · '.join(f'{d} {n_}' for d, n_ in sorted(pdia.items(), key=lambda kv: (kv[0][3:5], kv[0][:2]))) + '</p>'
        section('pesados', eyebrow('BALANZA · BRUTOS ALTOS', BLU)
            + h2(f'{num(len(PS), True)} ingresos pesaron más de {miles(BAL["brutoMaxKg"])} kg de bruto; el más pesado, {tope["patente"]} con {miles(tope["brutoKg"])} kg', 48)
            + f'<div style="display:flex; flex-direction:row; gap:28px; align-items:stretch">{card(str(len(PS) - bajo53), "pasaron los 53.000 kg (en rojo)", "#FBE9E4", RED)}{card(str(bajo53), "entre 52.500 y 53.000 kg", "#E3F1EA", GDK)}{card(str(BAL["ingresosConPeso"]), "ingresos con peso en Ricardone y el puerto", "#EEF0EF", INK)}</div>'
            + f'<div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:10px">{chips}</div>'
            + f'<p style="font-size:24px; color:{INK}"><b>Para definir:</b> ¿cuál es el bruto que el comité toma como pasado de kilos? El corte de {miles(BAL["brutoMaxKg"])} kg es provisorio.</p>',
            f'Balanza SGC, Ricardone y puerto, del {D0} al {D1}: ingresos con PESOBRUTO mayor a {miles(BAL["brutoMaxKg"])} kg. Por producto: ' + ', '.join(f'{k} {v}' for k, v in prod.most_common()) + '. '
            'La planilla de pasados de kilos de Vicentin (julio–02/10) tiene brutos de 45 a 60 t: el peso solo no alcanza para decir pasado de kilos.', gap=28)

# ---------- fichas por tema (un caso de ejemplo cada una): patente, qué pasó, sistema de camiones / cámaras / qué pedimos,
# recorrido por planta y fotos del DSS. Ejemplo elegido: FICHA_EJEMPLOS (o el primero de cada tema). Sin kilos.
DATA_DIR = os.path.abspath(os.path.join(CARPETA, '..', '..', '..', '..', 'data'))
FICHA_EJEMPLOS = {'vuelta': os.environ.get('FICHA_VUELTA', 'GVW791'), 'demora': os.environ.get('FICHA_DEMORA', ''),
                  'calles': os.environ.get('FICHA_CALLES', 'LUE562'), 'particular': os.environ.get('FICHA_PARTICULAR', 'IMH787')}
def sistema_txt(pat, dia):   # movimientos de la balanza de esa patente ese día y el siguiente (sin kilos)
    d = datetime.date.fromisoformat(f'{P0[:4]}-{dia[3:5]}-{dia[:2]}'); out = []
    for dd in (d, d + datetime.timedelta(days=1)):
        f = os.path.join(DATA_DIR, 'movimientos', dd.isoformat(), 'movimientos.json')
        for r in (json.load(open(f, encoding='utf-8')) if os.path.exists(f) else []):
            if r.get('plate_normalized') != pat or str(r.get('external_ingreso_at', ''))[:10] != d.isoformat(): continue
            t = f'{"Ricardone" if r.get("planta_normalized") == "RICARDONE" else "Puerto"} · {str(r.get("product_normalized") or "").capitalize()} · {str(r.get("external_ingreso_at"))[11:16]} a {str(r.get("external_salida_at") or "")[11:16] or "?"}'
            if t not in out: out.append(t)
    return out
def ficha(sid, tema, col, n_txt, x, que, datos, otros, nota, meta=''):
    pat = x['patente']; vis = [v for v in x.get('visitas', []) if v['items']]
    fotos_ = [(BLOBS_REC.get(f'{pat}_{it["hora"].replace(":", "")}_{it.get("device", "")}'), it['hora'], CORTO.get(it['punto'], it['punto']), v['planta'], it['estado'] != 'camara') for v in vis for it in v['items']]
    fotos_ = [f for f in fotos_ if f[0]]
    if len(fotos_) > 8: fotos_ = [fotos_[round(i * (len(fotos_) - 1) / 7)] for i in range(8)]
    n_items = sum(len(v['items']) for v in vis)
    tl = ''.join((arrow(False) if i else '') + group(v['planta'], [(it['hora'], CORTO.get(it['punto'], it['punto']) + (' (alg.)' if it['estado'] != 'camara' else ''), False) for it in v['items']], max(1, len(v['items'])), n_items > 8) for i, v in enumerate(vis[:8]))
    plate = (f'<div style="display:flex; flex-direction:column; width:280px; background:#FFFFFF; border:4px solid {INK}; border-radius:12px; overflow:hidden"><div style="height:16px; background:#1F3F8C"></div>'
             f'<p style="font-family:Arial, sans-serif; font-size:52px; font-weight:700; letter-spacing:2px; text-align:center; color:{INK}; padding:2px 0px 6px">{pat}</p></div>')
    cajas = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; gap:6px; background:#FFFFFF; border:2px solid #D3DAD6; border-top:6px solid {col}; border-radius:12px; padding:12px 16px">'
                    f'<p style="font-size:20px; font-weight:700; letter-spacing:1px; color:{col}">{t.upper()}</p><p style="font-size:22px; line-height:1.3; color:{INK}">{v}</p></div>' for t, v in datos)
    fw = 194 if len(fotos_) > 6 else 260
    ph = ''.join(f'<div style="width:{fw}px; display:flex; flex-direction:column; gap:4px"><img src="{s}" alt="{pat} · {pt} {h}" style="width:{fw}px; height:{round(fw * .56)}px; object-fit:cover; border-radius:8px; border:{"3px dashed " + VIO if alg else "0px solid #FFFFFF"}">'
                 f'<p style="font-size:18px; line-height:1.2; color:{MUTE}"><b style="color:{INK}">{h}</b> · {"Ric." if pl_ == "ric" else "SL"} · {pt}{" (alg.)" if alg else ""}</p></div>' for s, h, pt, pl_, alg in fotos_)
    section(sid, f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between"><p style="font-size:26px; font-weight:700; letter-spacing:3px; color:{col}">FICHA · {tema.upper()}</p>'
            f'<p style="font-size:26px; font-weight:700; color:{INK}; background:#EEF0EF; padding:6px 18px; border-radius:24px">{n_txt}</p></div>'
        + f'<div style="display:flex; flex-direction:row; gap:32px; align-items:center">{plate}<div style="flex:1; display:flex; flex-direction:column; gap:8px"><p style="font-size:22px; font-weight:600; letter-spacing:2px; color:{MUTE}">{meta}</p>'
          f'<h2 style="font-family:{SERIF}; font-size:38px; font-weight:700; line-height:1.2; color:{INK}">{que}</h2></div></div>'
        + f'<div style="display:flex; flex-direction:row; gap:16px; align-items:stretch">{cajas}</div>'
        + f'<div style="display:flex; flex-direction:row; gap:8px; align-items:stretch">{tl}</div>'
        + f'<div style="display:flex; flex-direction:row; gap:12px">{ph}</div>'
        + (f'<p style="font-size:22px; color:{MUTE}"><b>Otros casos del período:</b> {otros}</p>' if otros else ''),
        nota, gap=14)
CAM_NOMBRE = {'SLZSalidaC1Fte': 'la portería del puerto', 'SLZSalidaC2Fte': 'la portería del puerto', 'RicB3Ingreso': 'la balanza 3 de Ricardone', 'RicB3Egreso': 'la balanza 3 de Ricardone',
              'RicIngCamFrente': 'el ingreso de Ricardone', 'RicEgrCamFrente': 'el egreso de Ricardone', 'SLZTK400': 'los tanques del puerto', 'SLZBalIngFte': 'la balanza del puerto'}
FICHAS = []
_pk = {x['patente']: x for x in PKG}
if PKG:
    x = _pk.get(FICHA_EJEMPLOS['vuelta']) or PKG[0]
    vis = [v for v in x['visitas'] if v['items']]; sl_ = [v for v in vis if v['planta'] == 'sl']
    hasta = (sl_[1]['items'][0]['t'] - sl_[0]['items'][-1]['t']) / 60000 if len(sl_) > 1 else None
    ficha('ficha-vuelta', 'Van y vuelven entre el puerto y Ricardone', RED, f'{len(PKG)} casos en el período', x,
          ('Llegó al puerto, ' + ('la balanza le dio de baja el ingreso' if any(r.get('baja') for r in SGC_HIST.get(x['patente'], [])) else 'la balanza no lo pesó')
           + (', volvió a Ricardone y entró de nuevo' + (f' {hm_(hasta)} después' if hasta else '') if x['estado'] == 'volvio_a_ricardone' else ' y no volvió a entrar')),
          [('Sistema de camiones', sistema_rechazo(x['patente'], x['primerIngreso'][:5])[0].replace('; ', '<br>')),
           ('Cámaras', f'{sum(len(v["items"]) for v in vis)} lecturas en {len(vis)} pasadas por planta; mismo camión en todas las fotos'),
           ('Qué pedimos', 'Que la balanza informe el peso del 1.º ingreso, por qué lo dio de baja y si ese ingreso tuvo descarga')],
          ', '.join(p for p in _pk if p != x['patente']), f'{x["patente"]}: ' + '; '.join(f'{it["hora"]} {it["punto"]}' for v in vis for it in v['items']), meta=f'{x["primerIngreso"][:5]} · {x["producto"].upper()}')
    FICHAS.append('ficha-vuelta')
_dc = {c['patente']: c for c in D['dosCalles']}
if _dc:
    x = _dc.get(FICHA_EJEMPLOS['calles']) or next(iter(_dc.values()))
    cs = x['calles']; sis = sistema_txt(x['patente'], x['dia'])
    ficha('ficha-calles', 'Declaran una calle y descargan en otra', VIO, f'{len(_dc)} pasos por dos calles · {len(REVISAR)} para revisar', x,
          f'Entró a la calle {cs[0]["calle"]} a las {cs[0]["hora"]} y a las {cs[-1]["hora"]} estaba en la calle {cs[-1]["calle"]}',
          [('Sistema de camiones', ('<br>'.join(sis) or 'No figura') + '<br>la balanza no informa la calle declarada'), ('Cámaras', ' → '.join(f'calle {c["calle"]} {c["hora"]}' for c in cs)),
           ('Qué pedimos', 'Que la balanza informe la calle declarada para cruzarla con la cámara')],
          ', '.join(f'{c["patente"]} {c["dia"]}' for c in D['dosCalles'] if c['patente'] != x['patente']), f'{x["patente"]} {x["dia"]}: cámaras de volcable ' + ' → '.join(f'C{c["calle"]} {c["hora"]}' for c in cs) + '. Sin calle declarada en el SGC (VOLCABLE_PTO_SGC).', meta=f'{x["dia"]} · PUERTO SAN LORENZO')
    FICHAS.append('ficha-calles')
# Ficha «Vehículo permitido» para los livianos de la lámina de camionetas (no son camiones: la regla del sistema de
# camiones no les aplica). Un ejemplo con foto y los puntos donde lo leyeron; los campos los completa cada sector en la
# reunión (luego, en línea). Pedido 26/10.
FICHA_PERMITIDO = []
_cl = {c['patente']: c for c in CL if c.get('visitas')}
PUNTO_SECTOR = {'RicIngCamFrente': ('ric', 'Ingreso / egreso'), 'RicEgrCamFrente': ('ric', 'Ingreso / egreso'), 'RicPreIngInFr': ('ric', 'Pre-ingreso y playas'),
                'RicCal03': ('ric', 'Calada'), 'RicCal04': ('ric', 'Calada'), 'SLZSalidaC1Fte': ('sl', 'Portería'), 'SLZSalidaC2Fte': ('sl', 'Portería'), 'SLZIngCamFrente': ('sl', 'Ingreso camiones'),
                'SLZTK400': ('sl', 'Tanques y líquidos'), 'SLZBalLiq2b': ('sl', 'Tanques y líquidos'), 'SLZBalIngFte': ('sl', 'Balanzas'), 'SLZBalSC1Fte': ('sl', 'Balanzas'), 'SLZBalSC2Fte': ('sl', 'Balanzas')}
SECTORES = {'ric': ['Ingreso / egreso', 'Pre-ingreso y playas', 'Balanzas', 'Calada', 'Planta y silos'], 'sl': ['Portería', 'Ingreso camiones', 'Balanzas', 'Volcables', 'Tanques y líquidos', 'Muelle']}
def sector_de(it):
    d = it.get('device', '')
    if d in PUNTO_SECTOR: return PUNTO_SECTOR[d]
    if d.startswith('RicB'): return ('ric', 'Balanzas')
    if d.startswith('SLZVolcable'): return ('sl', 'Volcables')
    return None
if _cl:
    x = _cl.get(os.environ.get('FICHA_PERMITIDO', 'AE264XY')) or next(iter(_cl.values()))
    pat = x['patente']; vis = [v for v in x['visitas'] if v['items']]
    visto = collections.Counter(s for v in vis for it in v['items'] if (s := sector_de(it)))
    fotos_ = [(BLOBS_REC[k], it['hora'], (sector_de(it) or ('', it['punto']))[1], v['planta']) for v in vis for it in v['items'] if (k := f'{pat}_{it["hora"].replace(":", "")}_{it.get("device", "")}') in BLOBS_REC][:2]
    ph = ''.join(f'<div style="position:relative; width:560px; height:300px"><img src="{s}" alt="{pat} · {pt} {h}" style="width:560px; height:300px; object-fit:cover; border-radius:14px">'
                 f'<p style="position:absolute; left:12px; bottom:12px; font-size:20px; font-weight:700; color:#FFFFFF; background:rgba(27,36,32,0.78); padding:4px 12px; border-radius:8px">{h} · {"Ricardone" if pl_ == "ric" else "Puerto"} · {pt}</p></div>' for s, h, pt, pl_ in fotos_)
    def casilla(planta, s):
        n_ = visto.get((planta, s), 0)
        marca = f' <b style="color:{VIO}">· visto {n_}</b>' if n_ else ''
        return (f'<div style="display:flex; flex-direction:row; align-items:center; gap:10px; background:{"#EEE8F7" if n_ else "#FFFFFF"}; border:2px solid {"#B9A8DA" if n_ else "#D3DAD6"}; border-radius:10px; padding:6px 12px">'
                f'<span style="display:inline-block; width:24px; height:24px; background:#FFFFFF; border:3px solid {INK}; border-radius:5px"></span>'
                f'<p style="font-size:21px; color:{INK}">{s}{marca}</p></div>')
    def planta_box(planta, nombre, col):
        return (f'<div style="flex:1; display:flex; flex-direction:column; gap:8px"><p style="font-size:20px; font-weight:700; letter-spacing:2px; color:{col}">{nombre}</p>'
                f'<div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:8px">' + ''.join(casilla(planta, s) for s in SECTORES[planta]) + '</div></div>')
    def campo(lbl, ancho=1):
        return (f'<div style="flex:{ancho}; display:flex; flex-direction:column; gap:4px"><p style="font-size:19px; font-weight:700; letter-spacing:1px; color:{MUTE}">{lbl.upper()}</p>'
                f'<div style="height:44px; background:#FFFFFF; border:2px solid #D3DAD6; border-bottom:3px solid {INK}; border-radius:8px"></div></div>')
    plate = (f'<div style="display:flex; flex-direction:column; width:260px; background:#FFFFFF; border:4px solid {INK}; border-radius:12px; overflow:hidden"><div style="height:14px; background:#1F3F8C"></div>'
             f'<p style="font-family:Arial, sans-serif; font-size:48px; font-weight:700; letter-spacing:2px; text-align:center; color:{INK}; padding:2px 0px 6px">{pat}</p></div>')
    section('ficha-permitido',
        f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between"><p style="font-size:26px; font-weight:700; letter-spacing:3px; color:{VIO}">FICHA · VEHÍCULO PERMITIDO</p>'
        f'<p style="font-size:24px; font-weight:700; color:{INK}; background:#EEE8F7; padding:6px 18px; border-radius:24px">Ejemplo · la completa cada sector</p></div>'
        + f'<div style="display:flex; flex-direction:row; gap:32px; align-items:start">'
          f'<div style="width:560px; display:flex; flex-direction:column; gap:14px"><div style="display:flex; flex-direction:row; gap:20px; align-items:center">{plate}<p style="flex:1; font-size:24px; line-height:1.3; color:{INK}"><b>{x["viajes"]} viajes</b> en {x["dias"]} días<br><span style="color:{MUTE}">{x["zona"]}</span></p></div>{ph}</div>'
          f'<div style="flex:1; display:flex; flex-direction:column; gap:16px">'
          f'<div style="display:flex; flex-direction:row; gap:16px">{campo("Titular / empresa", 3)}{campo("Tipo de vehículo", 2)}</div>'
          f'<div style="display:flex; flex-direction:row; gap:16px">{campo("Motivo del ingreso", 3)}{campo("Contacto", 2)}</div>'
          f'<div style="display:flex; flex-direction:column; gap:10px; background:#FFFFFF; border:2px solid #D3DAD6; border-top:6px solid {VIO}; border-radius:12px; padding:14px 18px">'
          f'<p style="font-size:20px; font-weight:700; letter-spacing:1px; color:{VIO}">SECTORES PERMITIDOS <span style="font-weight:400; color:{MUTE}">· en violeta, donde lo leyeron las cámaras el {x.get("diaEjemplo", "")}</span></p>'
          f'<div style="display:flex; flex-direction:row; gap:20px">{planta_box("ric", "RICARDONE", GDK)}{planta_box("sl", "PUERTO SAN LORENZO", ORG)}</div></div>'
          f'<div style="display:flex; flex-direction:row; gap:16px">{campo("Horario permitido", 2)}{campo("Vigencia hasta", 2)}{campo("Autoriza (nombre y sector)", 3)}</div>'
          f'<div style="display:flex; flex-direction:row; gap:20px; align-items:center; background:#EEE8F7; border-radius:16px; padding:16px 24px"><x-icon name="ShieldCheck" style="color:{VIO}; width:40px; height:40px"></x-icon>'
          f'<p style="flex:1; font-size:24px; line-height:1.4; color:{INK}"><b>Vehículos Permitidos:</b> cada sector carga los suyos en la ficha en línea. Con eso el sistema deja de marcarlos y avisa solo cuando uno pasa por un sector que no tiene permitido.</p></div>'
          f'</div></div>',
        f'{pat}: utilitario con {x["viajes"]} viajes de cámara en {x["dias"]} días del {D0} al {D1}, sin movimientos en el sistema de camiones (no es camión: la regla del sistema no le aplica). Sectores donde lo leyeron el {x.get("diaEjemplo", "")}: '
        + ', '.join(f'{"Ricardone" if p == "ric" else "Puerto"} {s} ({n_})' for (p, s), n_ in visto.most_common()) + '. Los campos en blanco los completa el sector responsable; la versión en línea alimenta el registro de vehículos permitidos.', gap=22)
    FICHA_PERMITIDO.append('ficha-permitido')

# ---------- escribir
CALLES_VAN = bool(REVISAR)   # todas explicadas: la sección de calles no va (pedido 23/10)
ORDER = ['cover'] + FICHAS + ['div-vuelta', 'pasados-kg'] + [s[0] for s in slides if s[0].startswith('v-')] + (['div-calles', 'calles'] if CALLES_VAN else []) + ['div-interplanta', 'interplanta', 'camionetas'] + FICHA_PERMITIDO + [s_[0] for s_ in slides if s_[0].startswith('camionetas-fotos-')] + ['div-balanza', 'sin-pesar', 'etl-raros', 'servicio']   # sin 'pesados': los kilos son del sistema de camiones (pedido 23/10)   # el anexo de antigüedad del parque se presentó una sola vez (24/09–04/10)   # sin la lámina del histórico de anomalías (pedido 13/10)
slides = sorted([x for x in slides if x[0] in ORDER], key=lambda x: ORDER.index(x[0]))
if not CALLES_VAN:   # sin la sección 02 de calles, las siguientes se corren un número
    slides = [(i, h.replace('>03</p>', '>02</p>', 1) if i == 'div-interplanta' else h.replace('>04</p>', '>03</p>', 1) if i == 'div-balanza' else h) for i, h in slides]
for f in os.listdir(SL):
    if f.endswith('.html'): os.remove(os.path.join(SL, f))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
deck = {"v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, "lists": "css",
        "title": f"Comité de Seguridad · {D0} al {D1}", "order": ORDER, "cover": "cover",
        "sections": {"s1": {"description": "Portada, histórico y números del período", "start": "cover"},
                     "s2": {"description": "Anomalías de circuito: vueltas a Ricardone y descargas incompletas" if EXTRA else "Camiones que fueron al puerto y volvieron a Ricardone antes de descargar", "start": "div-vuelta"},
                     **({"s3": {"description": "Calles del puerto", "start": "div-calles"}} if CALLES_VAN else {}),
                     "s4": {"description": "Demoras entre plantas sin calado en el puerto y vehículos sin Excel", "start": "div-interplanta"},
                     **({"s5": {"description": "Balanza y recorridos fuera de lo común: sin pesar, reingresos y visitas relámpago", "start": "div-balanza"}} if BAL is not None else {})},
        "faces": {"domine": {"family": "Domine", "href": "https://fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap"},
                  "public-sans": {"family": "Public Sans", "href": "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap"},
                  "ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
        "designSystems": []}
json.dump(deck, open(os.path.join(OUT, 'project', 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(slides), 'láminas ·', OUT)
