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
import json, os, sys, datetime
CARPETA = os.path.abspath(sys.argv[1])
D = json.load(open(os.path.join(CARPETA, 'datos.json'), encoding='utf-8'))
CFG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'comite-seguridad-historico.json'), encoding='utf-8'))
FOTOS_F = os.path.join(CARPETA, 'fotos.json')
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
VUELTAS = [v for v in D['vueltas'] if v['estado'] != 'descartado_excel']
VUELTAS_DESC = [v for v in D['vueltas'] if v['estado'] == 'descartado_excel']
V_PEND = [v for v in VUELTAS if v['estado'] == 'pendiente_excel']
CAMIONETAS = {x['patente'] for x in D['camionetas']['lista']}
CALLES = [dict(c, tipo='dos') for c in D['dosCalles']]
for c in D['declarado']:
    if not any(x['patente'] == c['patente'] and x['dia'] == c['dia'] for x in CALLES): CALLES.append(dict(c, tipo='otra'))
    else: next(x for x in CALLES if x['patente'] == c['patente'] and x['dia'] == c['dia'])['excel'] = c['excel']
CALLES.sort(key=lambda c: (c['dia'][3:5], c['dia'][:2], c['calles'][0]['hora']))
INTER = D['interplanta']; CERCA = D['interplantaCercanos']
N_HOY = len(VUELTAS) + len(CALLES)

# ---------- portada
slides.append(('cover', f'<section id="cover" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:#0B5638; font-family:\'IBM Plex Sans\', Arial, sans-serif; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(14,40,28,0.82); border-left:6px solid #7CC3EC; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(30,18,52,0.82); border-left:6px solid #F2A65A; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Seguridad · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Seguridad Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">{PERIODO_LARGO}</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Seguridad Nodo Sur, del {D0} al {D1}. Ricardone arriba, puerto San Lorenzo abajo.</aside></section>'))

# ---------- histórico (comité actual primero, como en el comité anterior)
HC = CFG['historico']
H = [('Hoy', N_HOY)] + [tuple(x) for x in HC['series']]
mx = max(v for _, v in H) or 1
bars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:700">{v}{"*" if l == "Hoy" and (V_PEND or SIN_EXCEL) else ""}</p><div style="align-self:stretch; height:{max(4, round(v / mx * 300))}px; background:{RED if l == "Hoy" else "#D9EBD9"}; border:{"0" if l == "Hoy" else "2px solid #1B2420"}; border-radius:6px 6px 0px 0px"></div><p style="font-size:24px; color:{MUTE}">{l}</p></div>' for l, v in H)
add = {'vuelta': len(VUELTAS), 'calles': len(CALLES)}
CAT = [(c['nombre'], c['casos'] + add.get(c['clave'], 0), c['clave']) for c in HC['categorias']]
CAT.sort(key=lambda x: -x[1])
CCOL = {'doble': GDK, 'vuelta': RED, 'otros': '#7B8A83', 'primer': BLU, 'calles': ORG}
tot = sum(v for _, v in H)
cmax = max(v for _, v, _ in CAT)
cats = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:330px; font-size:24px; line-height:1.2; color:{INK}">{n}</p><div style="width:{max(8, round(v / cmax * 260))}px; height:30px; background:{CCOL[k]}; border-radius:0px 6px 6px 0px"></div><p style="font-size:26px; font-weight:700; color:{INK}; white-space:nowrap">{v}</p></div>' for n, v, k in CAT)
top = CAT[0]
txt_hoy = (f'Este comité suma {N_HOY}: {len(VUELTAS)} {"vuelta" if len(VUELTAS) == 1 else "vueltas"} a Ricardone desde el puerto y {len(CALLES)} {"camión" if len(CALLES) == 1 else "camiones"} en dos calles del puerto.')
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
ctxt = 'camión leído en dos calles del puerto en la misma visita' if len(CALLES) == 1 else 'camiones leídos en dos calles del puerto en la misma visita'
if D['declarado']: ctxt = 'casos con el volcable fuera de su calle o en dos calles'
banner = []
if F['excelFaltante']:
    banner.append(f'<b>Pendiente de Excel:</b> falta {FALTA_EXCEL}. Con cámaras solas salen las demoras entre plantas y las dos calles; el Excel confirma las vueltas y agrega el volcable declarado vs la calle.')
if F['camarasFaltantes']:
    banner.append(f'<b>Sin cámaras:</b> ' + ', '.join(dm(x) for x in F['camarasFaltantes']) + '.')
section('numeros', h2(f'Del {D0} al {D1} en números', 64)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:28px">'
    + card(str(nv), vtxt, '#FBE9E4', RED, 'A confirmar con el Excel' if V_PEND else '')
    + card(str(len(INTER)), 'demoras de más de 30 min entre plantas sin calado en el puerto', '#FDEEDD', ORG)
    + card(str(len(CALLES)), ctxt, '#ECE8F3', VIO, 'Volcable declarado: falta el Excel' if F['excelFaltante'] else '')
    + '</div>' + ''.join(pendiente(b) for b in banner),
    f'Cámaras {D0}–{D1} ({F["lecturasPeriodo"]} lecturas; hora operativa = hora de cámara + 206 min) con {F["correcciones"]["renombradas"]} lecturas corregidas y {F["correcciones"]["descartadas"]} descartadas por las correcciones de patentes de En vivo. '
    + f'Vueltas: llegó al puerto desde Ricardone (después de calar), salió sin lectura de volcable y volvió a entrar directo a Ricardone (ingreso o calada, sin pre-ingreso) antes de 12 h. '
    + ('Sin Excel del período no se puede confirmar que no hubo descarga en esa visita.' if V_PEND else 'El Excel no tiene operación en el puerto para esa visita.')
    + (f' Descartadas por el Excel: {", ".join(v["patente"] + " " + v["dia"] for v in VUELTAS_DESC)}.' if VUELTAS_DESC else ''))

# ---------- 01 vueltas
divider('div-vuelta', '01', 'Fueron al puerto y volvieron a Ricardone',
        'El circuito de grano termina en San Lorenzo. Estos camiones llegaron al puerto, salieron sin descargar y volvieron a entrar a Ricardone.'
        + (' Detectados con las cámaras; falta el Excel para confirmarlos.' if V_PEND else ''))

def box(t, lab, red=False, plant='ric'):
    c = RED if red else (BLU if plant == 'ric' else ORG)
    bc = RED if red else ('#2F8FCB' if plant == 'ric' else '#E07B1F')
    return (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:#FFFFFF; border:{3 if red else 2}px solid {bc}; border-radius:14px; padding:12px 6px">'
            f'<p style="font-size:28px; font-weight:700; color:{c}; white-space:nowrap">{t}</p><p style="font-size:24px; line-height:1.15; text-align:center; color:{RED if red else INK}">{lab}</p></div>')
def group(plant, items, flex):
    bg, col, name = ('#E3F1FA', BLU, 'RICARDONE') if plant == 'ric' else ('#FDEEDD', ORG, 'SAN LORENZO')
    return (f'<div style="flex:{flex}; display:flex; flex-direction:column; gap:10px; background:{bg}; border-radius:20px; padding:14px 12px 12px"><p style="font-size:24px; font-weight:700; letter-spacing:2px; color:{col}">{name}</p>'
            f'<div style="display:flex; flex-direction:row; gap:8px">' + ''.join(box(t, l, r, plant) for t, l, r in items) + '</div></div>')
def arrow(red=False):
    return f'<div style="display:flex; flex-direction:column; justify-content:center; padding-top:38px"><x-shape kind="arrow-right" style="background:{RED if red else "#A7B0AB"}; width:44px; height:26px"></x-shape></div>'

def titulo_vuelta(v):
    if v['balanzaSalida']: t = 'Pasó por las dos balanzas del puerto sin descargar'
    else: t = f'Salió del puerto a los {v["minPuerto"]} minutos'
    n = v['caladasVuelta']
    t += ' y volvió a calar' + (' dos veces' if n >= 2 else '') if n else ' y volvió a Ricardone'
    return t
for v in VUELTAS:
    pl = v['patente']
    pills = [(v['puertoTxt'], 'en el puerto sin descargar')] + ([(v['hastaTxt'], v['hastaLbl'])] if v['hastaTxt'] else [])
    pl_html = ''.join(f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:14px; background:{bg}; padding:12px 24px; border-radius:40px"><p style="font-family:{SERIF}; font-size:36px; font-weight:700; color:{c}; white-space:nowrap">{a}</p><p style="font-size:24px; color:{INK}; white-space:nowrap">{b}</p></div>'
                      for (a, b), (bg, c) in zip(pills, [('#FBE9E4', RED), ('#FDEEDD', ORG)]))
    tl = ''
    for i, g in enumerate(v['grupos']):
        red_grp = i == 2
        items = [(x['hora'], x['punto'], red_grp or (i == 1 and x['punto'] in ('Egreso', 'Balanza salida'))) for x in g['items']]
        if i: tl += arrow(red_grp)
        tl += group(g['planta'], items, max(2, len(items)))
    fotos = FOTOS.get(pl, [])
    if fotos:
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
    body = f'{head}<div style="display:flex; flex-direction:row; gap:10px; align-items:stretch">{tl}</div><div style="display:flex; flex-direction:row; gap:20px">{ph}</div>'
    notes = (f'{pl}: lecturas de cámara (hora operativa) — ' + '; '.join(v['lecturas']) + '. '
             + ('Excel del día no disponible: candidato.' if v['estado'] == 'pendiente_excel' else f'Excel: sin operación en el puerto para la primera visita. Operaciones: {"; ".join(v["excel"] or [])}.'))
    slides.append((f'v-{pl.lower()}-{v["dia"].replace("/", "")}', f'<section id="v-{pl.lower()}-{v["dia"].replace("/", "")}" style="background:{BG}; color:{INK}; font-family:{SANS}; padding:112px 128px 176px; display:flex; flex-direction:column; gap:30px; justify-content:start">{body}{footer()}<aside>{notes}</aside></section>'))
if not VUELTAS:
    section('v-ninguna', eyebrow('VUELTAS A RICARDONE') + h2(f'Del {D0} al {D1} ningún camión volvió a Ricardone sin descargar')
        + (pendiente(f'Revisado con las cámaras; falta {FALTA_EXCEL} para cerrar.') if F['excelFaltante'] else ''),
        'Misma regla que el comité anterior, sobre todas las visitas al puerto del período.')

# ---------- 02 calles
divider('div-calles', '02', 'Calles del puerto', 'Camiones que la cámara de una calle leyó junto con la de otra en la misma visita'
        + (', y descargas en una calle distinta del volcable declarado en el Excel.' if not F['excelFaltante'] else '. El cruce con el volcable declarado en el Excel queda pendiente.'))
def cam_txt(c): return ', luego '.join(('Calle ' if k == 0 else 'calle ') + f'{x["calle"]} · {x["hora"]}' for k, x in enumerate(c['calles']))
trs = ''.join(f'<tr style="background:{"#FDEEDD" if i % 2 == 0 else BG}"><td style="font-weight:700">{c["patente"]}{" <span style=\"font-weight:400; color:" + MUTE + "\">· sin Excel desde " + F["padronExcel"].split(" al ")[0] + "</span>" if c["patente"] in CAMIONETAS else ""}</td><td>{c["dia"]}</td>'
              f'<td style="color:{GDK if c.get("excel") else ORG}">{c.get("excel") or "Pendiente"}</td><td style="color:{RED}">{cam_txt(c)}</td></tr>' for i, c in enumerate(CALLES))
n5 = sum(1 for c in CALLES if c['involucraC5'])
gap_min = lambda c: (lambda a, b: (int(b[:2]) * 60 + int(b[3:])) - (int(a[:2]) * 60 + int(a[3:])))(c['calles'][0]['hora'], c['calles'][1]['hora']) % 1440
rapidos = [c['patente'] for c in CALLES if gap_min(c) <= 2]
ctexto = (f'{num(len(CALLES), True)} {"camión pasó" if len(CALLES) == 1 else "camiones pasaron"} por dos o más calles en la misma visita; '
          + (f'{num(n5)} {"involucra" if n5 == 1 else "involucran"} al volcable 5.' if n5 else 'ninguno involucra al volcable 5.')
          + (f' {", ".join(rapidos)}: las dos lecturas con 1 o 2 minutos de diferencia; puede ser la cámara de la calle de al lado.' if rapidos else ''))
section('calles', eyebrow('CALLE DE DESCARGA · PUERTO SAN LORENZO') + h2('Dos calles en la misma visita')
    + (f'<table style="font-size:26px; color:{INK}; padding:12px 22px"><tr><th style="width:24%">Patente</th><th style="width:10%">Fecha</th><th style="width:22%">Excel</th><th style="width:44%">Cámara de la calle</th></tr>{trs}</table>' if CALLES else '')
    + f'<p style="font-size:28px; line-height:1.4">{ctexto if CALLES else "Ninguna visita con lecturas en dos calles."}</p>'
    + (pendiente(f'<b>Volcable declarado vs calle:</b> se cruza con {FALTA_EXCEL}. La columna Excel se completa sola al regenerar.') if F['excelFaltante'] else ''),
    f'Cámaras {D0}–{D1}: visitas al puerto con lecturas de dos o más cámaras de volcable (SLZVolcableC1–C5). «Sin Excel desde …»: la patente no figura en ningún Excel disponible ({F["padronExcel"]}).'
    + (f' Excel: ingresos al puerto con volcable declarado y lectura de la cámara de otra calle: {len(D["declarado"])}.' if not SIN_EXCEL else ''))

# ---------- 03 interplanta
divider('div-interplanta', '03', 'Demoras entre plantas sin calado en el puerto',
        f'Más de 30 minutos entre la salida de Ricardone y la entrada al puerto (el viaje normal es de {D["viajeNormalRicSLmin"]}), sin pasar después por la calada de San Lorenzo.')
if INTER:
    tr = ''.join(f'<tr style="background:{"#FDEEDD" if i % 2 == 0 else BG}"><td>{r["dia"]}</td><td>{r["salida"]}</td><td style="font-weight:700">{r["patente"]}</td><td>{r["tipo"]}</td><td>{r["descarga"]}</td><td style="color:{RED}; font-weight:700; text-align:right">{r["min"]} min</td></tr>' for i, r in enumerate(INTER))
    n = len(INTER); trans = [r for r in INTER if r['tipo'] == 'Transile']
    section('interplanta', eyebrow('INTERPLANTA · RICARDONE → SAN LORENZO') + h2(f'{num(n, True)} {"camión tardó" if n == 1 else "camiones tardaron"} más de 30 minutos y no {"pasó" if n == 1 else "pasaron"} por la calada del puerto', 52)
        + f'<table style="font-size:24px; color:{INK}; padding:8px 22px"><tr><th style="width:11%">Día</th><th style="width:13%">Salida Ric</th><th style="width:16%">Patente</th><th style="width:24%">Origen</th><th style="width:20%">Descarga</th><th style="width:16%; text-align:right">Demora</th></tr>{tr}</table>'
        + (pendiente(f'Transiles ({", ".join(r["patente"] for r in trans)}): la salida de Ricardone es la última lectura de egreso; si no se leyó la balanza de egreso, la demora real es menor. Se confirma con {FALTA_EXCEL}.') if trans and F['excelFaltante'] else ''),
        f'Regla: último egreso de Ricardone → cámara de ingreso de San Lorenzo, más de 30 min y hasta 2 h, sin lectura en la calada del puerto hasta la salida. Solo grano: caló en Ricardone o transile (Playa 3 / carga); fuera líquidos y camiones sin calada ni carga (residuos, servicios). Si después del egreso hay Playa 3 o carga, la salida real no se leyó y el viaje no se mide. Viaje normal = mediana de la semana ({D["viajeNormalRicSLmin"]} min).')
else:
    cr = ''.join(f'<tr style="background:{"#FDEEDD" if i % 2 == 0 else BG}"><td>{r["dia"]}</td><td>{r["salida"]}</td><td style="font-weight:700">{r["patente"]}</td><td style="text-align:right">{r["min"]} min</td><td>{r["motivo"].capitalize()}</td></tr>' for i, r in enumerate(CERCA))
    section('interplanta', eyebrow('INTERPLANTA · RICARDONE → SAN LORENZO') + h2(f'Del {D0} al {D1}, ningún camión de grano tardó más de 30 minutos sin pasar por la calada del puerto', 52)
        + f'<div style="display:flex; flex-direction:row; gap:28px; align-items:stretch">{card(str(D["viajeNormalRicSLmin"]) + " min", "viaje normal de Ricardone al puerto (mediana de la semana)", "#E3F1EA", GDK)}'
        + (f'<div style="flex:2; display:flex; flex-direction:column; gap:14px"><p style="font-size:26px; font-weight:700">Los más cercanos a la regla</p><table style="font-size:24px; color:{INK}; padding:8px 22px"><tr><th style="width:12%">Día</th><th style="width:16%">Salida Ric</th><th style="width:18%">Patente</th><th style="width:16%; text-align:right">Viaje</th><th style="width:38%">Por qué no entra</th></tr>{cr}</table></div>' if CERCA else '')
        + '</div>',
        f'Regla: último egreso de Ricardone → cámara de ingreso de San Lorenzo, más de 30 min y hasta 2 h, sin lectura en la calada del puerto. Solo grano (caló en Ricardone o transile). Las semanas del 11/09 y 18/09 hubo 33 y 25 casos; del 24/09 al 04/10, 10. Cercanos: entre 25 y 30 min, o más de 30 min pero con calada en el puerto.')

# ---------- camionetas sin Excel
CL = D['camionetas']['lista']
zonas = [('Ricardone y San Lorenzo', 'Ricardone y puerto', BLU), ('Ricardone', 'Solo Ricardone', GDK), ('San Lorenzo', 'Solo puerto San Lorenzo', ORG)]
def chip(x, col):
    mark = ' ≈' if x['parecida'] else ''
    return f'<span style="display:inline-flex; gap:8px; align-items:baseline; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:10px; padding:4px 12px; font-size:22px"><b style="color:{INK}">{x["patente"]}{mark}</b><span style="color:{col}">{x["viajes"]}</span></span>'
grp = ''
for z, nombre, col in zonas:
    xs = [x for x in CL if x['zona'] == z]
    if not xs: continue
    grp += f'<div style="display:flex; flex-direction:column; gap:10px"><p style="font-size:24px; font-weight:700; color:{col}">{nombre} · {len(xs)}</p><div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:10px">' + ''.join(chip(x, col) for x in xs) + '</div></div>'
section('camionetas', eyebrow('CAMIONETAS, UTILITARIOS Y TRAFFICS', VIO)
    + h2(f'{len(CL)} camionetas, utilitarios y traffics con {D["camionetas"]["umbral"]} o más viajes que no figuran en el Excel', 52)
    + f'<div style="display:flex; flex-direction:column; gap:18px">{grp}</div>'
    + (pendiente(f'<b>Provisorio:</b> se cruzó con el Excel del {F["padronExcel"]} ({miles(F["padronPatentes"])} patentes); falta {FALTA_EXCEL}. ≈ = una letra distinta de una patente del Excel (puede ser mala lectura).') if F['excelFaltante'] else '')
    + f'<div style="display:flex; flex-direction:row; gap:24px; align-items:center; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:20px; padding:22px 36px"><x-icon name="Search" style="color:{RED}; width:40px; height:40px"></x-icon><p style="flex:1; font-size:26px; line-height:1.4"><b>Para definir:</b> ¿le asignamos a cada uno un recorrido permitido, para que el sistema avise solo cuando se salga de él?</p></div>',
    f'Viajes = recorridos de cámara (journeys) del {D0} al {D1}, patentes con formato válido, después de las correcciones de En vivo. No figuran en ningún Excel disponible ({F["padronExcel"]}). Parecidas a una patente del Excel: {", ".join(D["camionetas"]["parecidas"]) or "ninguna"}. En el registro de vehículos particulares: {", ".join(D["camionetas"]["enRegistro"]) or "ninguna"}. Lista completa en patentes-sin-excel.csv.', gap=26)

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

# ---------- escribir
ORDER = ['cover', 'historico', 'numeros', 'div-vuelta'] + [s[0] for s in slides if s[0].startswith('v-')] + ['div-calles', 'calles', 'div-interplanta', 'interplanta', 'camionetas', 'anexo', 'parque-anios', 'parque-vuelta']
slides = sorted(slides, key=lambda x: ORDER.index(x[0]))
for f in os.listdir(SL):
    if f.endswith('.html'): os.remove(os.path.join(SL, f))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
deck = {"v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, "lists": "css",
        "title": f"Comité de Seguridad · {D0} al {D1}", "order": ORDER, "cover": "cover",
        "sections": {"s1": {"description": "Portada, histórico y números del período", "start": "cover"},
                     "s2": {"description": "Camiones que fueron al puerto y volvieron a Ricardone antes de descargar", "start": "div-vuelta"},
                     "s3": {"description": "Calles del puerto", "start": "div-calles"},
                     "s4": {"description": "Demoras entre plantas sin calado en el puerto y vehículos sin Excel", "start": "div-interplanta"},
                     "s5": {"description": "Anexo: antigüedad del parque", "start": "anexo"}},
        "faces": {"domine": {"family": "Domine", "href": "https://fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap"},
                  "public-sans": {"family": "Public Sans", "href": "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap"},
                  "ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
        "designSystems": []}
json.dump(deck, open(os.path.join(OUT, 'project', 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(slides), 'láminas ·', OUT)
