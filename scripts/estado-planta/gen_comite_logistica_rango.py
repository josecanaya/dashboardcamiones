"""Comité de Logística Nodo Sur — período de varios días (p. ej. 24/09–04/10), con planilla y cámaras.

Uso: python scripts/estado-planta/gen_comite_logistica_rango.py <carpeta>
  <carpeta> contiene datos.json (ver calculo/README.md). Escribe <carpeta>/deck/project/...
Misma maqueta que gen_comite_logistica.py (comité 24–30/09, artifact SxeVbx2h3pxKuaAf6nfMRF), con los días del
período en lugar de una semana jueves→miércoles y la sección Líquidos (movimientos, días, circuitos y tramos).

Fuentes (todas en datos.json):
- Paquete del dashboard (`paquete`): soja R7 (operaciones, tramos, por día, cuartos), girasol (operaciones por día),
  actividad de sectores (calada, volcables, silos) — composición de las corridas semanales como «Cargar rango».
- Movimientos (`extras`, tabla excel_operations_with_truckflow): líquidos, transile de pellet, R29, girasol por volcable.
- Tiempos de líquidos (`liquidosTiempos`): circuit_timing_journeys + segment_timing_legs por fecha de inicio.
- Cámaras: girasol (publicado 24–30 + variación medida al sumar 01–04/10), pellet (24–30 + 01/10, ponderado por n),
  transile R29 (no corrió en octubre: tramos de 24–29/09).
"""
import json, os, sys, datetime
D = os.path.abspath(sys.argv[1])
X = json.load(open(os.path.join(D, 'datos.json'), encoding='utf-8'))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PX = json.load(open(os.path.join(ROOT, X['paquete']), encoding='utf-8'))
XX, LT, GI, PO, PH = X['extras'], X['liquidosTramos'], dict(X['girasol']), X['pelletOperativo'], X['pelletHistorico']
OUT = os.path.join(D, 'deck')
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)

DAYS = X['days']
N = len(DAYS)
DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
DOWF = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
def wd(d): return datetime.date.fromisoformat(d).weekday()
def dd(d): return int(d[8:10])
days = [f'{DOW[wd(d)]} {dd(d)}' for d in DAYS]                       # «Jue 24»
ini = [DOW[wd(d)][0] for d in DAYS]                                  # «J»
full = [f'{DOWF[wd(d)]} {dd(d)}' + ('/10' if d[5:7] == '10' else '') for d in DAYS]  # «jueves 1/10»
full = [f.replace('/10', '/10') for f in full]
LBL = f'{DAYS[0][8:10]}/{DAYS[0][5:7]}–{DAYS[-1][8:10]}/{DAYS[-1][5:7]}'  # 24/09–04/10
HOURS = 24 * N

GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'; G2='#1F7A4D'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'; GREY='#B7C3BB'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'; VXLT='#A99BCF'
BLU='#1F4E7A'; BMID='#3F7FB5'; BXLT='#DCE8F3'
FONT="'IBM Plex Sans', Arial, sans-serif"
NVA_G='/_blob/2c1166d4fbf2fbec7430398abf6b0e3b'; NVA_L='/_blob/18aa8ca0d589832dda48c77f1ed28a0b'
BTZ='/_blob/916ea0722fd539b2369ca6413631c60d'; BTZ_L='/_blob/0e7d769a3aba86ad2cd768091719225b'
AER_RIC='/_blob/d87935e062f6db2ad585a52b0b30e02f'; AER_SL='/_blob/b2b7b4c6595ee63172090f5ac4fd588e'

fmtn = lambda v: f'{round(v):,}'.replace(',', '.')
def hm(m): return f'{m // 60} h {m % 60} m'
def sgn(d): return f'+{d}' if d > 0 else (f'−{abs(d)}' if d < 0 else '0')
fx = lambda v: str(round(v, 1)).replace('.', ',')

# ------------------------------------------------------------------ datos
# Publicado en el comité anterior (17–23/09, comité 25/09) — base de los comparativos
PUB = dict(r7_ops=1370, total=303, p1=89, ric=104, slz=184, g_total=228, liq=282, cal=1935, cal_h=139, liq_cal=290, liq_cal_h=69, sil=329, r29=313)
PREV_DAYS = 7
sj = PX['tiempos']['soja']; pe = sj['periodo']; trm = {x['key']: round(x['mediaMin']) for x in pe['tramos'] if x['mediaMin'] is not None}
R7 = dict(ing=trm['INGRESO→PREINGRESO'], p1=trm['PREINGRESO→CALADA'], sal=trm['CALADA→EGRESO'], inter=trm['EGRESO→SL_INGRESO'],
          osl=trm['SL_INGRESO→SL_BALANZA_INGRESO'], desc=trm['SL_BALANZA_INGRESO→SL_VOLCABLE'], egr=trm['SL_VOLCABLE→SL_EGRESO'],
          total=round(pe['tiempoMedioMin']), ops=pe['camiones'])
R7['ric'] = R7['ing'] + R7['p1'] + R7['sal']; R7['slz'] = R7['osl'] + R7['desc'] + R7['egr']
ddx = [sj['porDia'].get(d, {}) for d in DAYS]
R7['dia'] = [x.get('camiones', 0) for x in ddx]
R7['totDia'] = [round(x.get('tiempoMedioMin') or 0) for x in ddx]
R7['ricDia'] = [round(x.get('ricMediaMin') or 0) for x in ddx]
# San Lorenzo por día: medido por patente con cámaras (el paquete solo trae los tramos de los recorridos unidos a una operación R7)
R7['slzDia'] = X['r7Dia']['sl']
R7['slzN'] = X['r7Dia']['n']
R7['ricN'] = [x.get('ricN', 0) for x in ddx]
QN = dict(pe['porCuarto'])
qd = {q: [x.get('porCuarto', {}).get(q, 0) for x in ddx] for q in QN}
per_day = lambda v, n=N: v / n
# R29: planilla (fecha del movimiento); tramos de cámaras 24–29/09 (sin transile en octubre)
r = X['r29']['tramos']
R29 = dict(preLiq=r['preLiq']['mean'], liqP3=r['liqP3']['mean'], p3Silo=r['p3Silo']['mean'], siloBal=r['siloBal']['mean'], balCal=r['balCal']['mean'],
           calEgr=r['calEgr']['mean'], puente=r['puente']['mean'], osl=r['osl']['mean'], balVolc=r['balVolc']['mean'], volcSal=r['volcSal']['mean'])
R29['ric'] = R29['preLiq'] + R29['liqP3'] + R29['p3Silo'] + R29['siloBal'] + R29['balCal'] + R29['calEgr']
R29['slz'] = R29['osl'] + R29['balVolc'] + R29['volcSal']
R29['ciclo'] = R29['ric'] + R29['puente'] + R29['slz']
R29['ops'] = XX['r29']['ops']; R29['dia'] = XX['r29']['dia']
R29_last = max(i for i, v in enumerate(R29['dia']) if v > 0)
# girasol
gs = PX['tiempos']['girasol']
GI['ops'] = gs['operaciones']; GI['dia'] = [gs['porDia'].get(d, {}).get('camiones', 0) for d in DAYS]
GI['r5'] = XX['girasol']['R5']; GI['r6'] = XX['girasol']['R6']; GI['r4'] = XX['r4']
GIR_MED = XX['girasol']['mediana']
gc = GI['cam']
# sectores (paquete del dashboard)
def act(key):
    a = PX['actividad'][key]; per = a['periodo']
    return {'camiones': per['camiones'], 'horas': per['horasConActividad'], 'pico': per['picoCamiones'], 'picoLabel': per['picoLabel'],
            'porCalle': {c['camara']: c['camiones'] for c in per['porCalle']}, 'porDia': [a['porDia'].get(d, {}).get('camiones', 0) for d in DAYS],
            'calleDia': {d: {c['camara']: c['camiones'] for c in a['porDia'].get(d, {}).get('porCalle', [])} for d in DAYS}}
CAL = act('calada_ricardone'); LIQ = act('calada_ricardone_liquidos'); CSL = act('calada_san_lorenzo')
VR = act('volcable_ricardone'); SIL = act('silos_ricardone'); VSA = act('volcable_san_lorenzo')
VOL = {f'V{n}': [VSA['calleDia'][d].get(f'Volcable {n}', 0) for d in DAYS] for n in range(1, 6)}
VOL_TOT = VSA['camiones']
LIQX = XX['liquidos']
PELX = XX['pelletTransile']
v1, v2 = VR['porCalle'].get('RicVolcable1', 0), VR['porCalle'].get('RicVolcable2', 0)

# series de comités (rótulo = fecha del comité); el último punto es este período
weeks = ['17/6', '24/6', '8/7', '15/7', '24/7', '30/7', '7/8', '13/8', '21/8', '28/8', '4/9', '11/9', '18/9', '25/9', 'Actual']
TOT = [338, 316, 383, 304, 445, 389, 421, 346, 368, 296, 379, 276, 334, 303, R7['total']]
P1 = [94, 113, 145, 114, 171, 181, 120, 101, 130, 112, 140, 87, 126, 89, R7['p1']]
SLZ = [196, 150, 175, 125, 199, 143, 213, 176, 198, 153, 199, 160, 180, 184, R7['slz']]
GT = [315, 287, 317, 306, 351, 361, 347, 241, 289, 353, 430, 319, 382, 228, GI['total']]
GP = [107, 105, 122, 117, 140, 137, 138, 80, 99, 163, 190, 116, 133, 78, GI['p1']]
GD = [180, 159, 170, 166, 188, 208, 186, 110, 146, 152, 215, 155, 208, 124, GI['desc'] + GI['tara']]
avg = lambda a: round(sum(a) / len(a))
def rank(a, v, low=True):
    s = sorted(a) if low else sorted(a, reverse=True)
    return s.index(v) + 1
iD = {d: i for i, d in enumerate(DAYS)}

# ------------------------------------------------------------------ helpers de maqueta (iguales al original)
slides = []
def footer(n, dark=False):
    nva = NVA_L if dark else NVA_G; btz = BTZ_L if dark else BTZ; col = '#C9D8CE' if dark else BODY
    return (f'<img src="{nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">'
            f'<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:{col}">Comité de Logística Nodo Sur · {LBL} · §N§</p>'
            f'<img src="{btz}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">')
def add(id, html): slides.append((id, html))
def section(id, body, notes, bg=BG, gap=40, extra=''):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:{TEXT}; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:{gap}px{extra}">{body}{footer(0)}<aside>{notes}</aside></section>')
def pill(t, bg): return f'<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:{bg}; padding:6px 18px; border-radius:999px">{t}</p>'
def head(tag, title, tagbg=GDK, size=64):
    return (f'<div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">{pill(tag, tagbg)}</div>'
            f'<h2 style="font-size:{size}px; font-weight:600; line-height:1.1; color:{TEXT}">{title}</h2></div>')
def p(t, size=30, color=BODY, extra=''): return f'<p style="font-size:{size}px; line-height:1.4; color:{color}{extra}">{t}</p>'
def key(t, size=26): return f'<p style="font-size:{size}px; line-height:1.4; color:{GDK}; font-weight:600; border-left:6px solid {GMID}; padding:4px 0px 4px 20px">{t}</p>'
def legend(items, extra=''):
    s = ''.join(f'<div style="width:28px; height:28px; background:{c}; border-radius:6px"></div><p style="font-size:24px; color:{TEXT}; white-space:nowrap">{n}</p><div style="width:16px"></div>' for n, c in items)
    return f'<div style="display:flex; flex-direction:row; gap:12px; align-items:center">{s}{extra}</div>'
def spark(vals, w, h, col, lastcol, x0=10, y0=10):
    lo, hi = min(vals), max(vals); n = len(vals)
    pts = [(x0 + i * (w - 2 * x0) / (n - 1), y0 + (hi - v) / (hi - lo or 1) * (h - 2 * y0)) for i, v in enumerate(vals)]
    return (f'<svg aria-label="Evolución de {n} semanas" viewBox="0 0 {w} {h}" width="{w}" height="{h}" style="width:{w}px; height:{h}px">'
            f'<polyline fill="none" stroke="{col}" stroke-width="4" stroke-linejoin="round" points="' + ' '.join(f'{x:.0f},{y:.0f}' for x, y in pts) + '"/>'
            f'<circle cx="{pts[-1][0]:.0f}" cy="{pts[-1][1]:.0f}" r="8" fill="{lastcol}"/></svg>')
def minibars(vals, dark, light):
    mx = max(vals) or 1; out = ''; step = 342 / len(vals); bw = round(step * 0.62)
    for i, v in enumerate(vals):
        x = round(i * step + (step - bw) / 2); hgt = round(v / mx * 52)
        if v == 0: out += f'<rect x="{x}" y="66" width="{bw}" height="2" fill="{LINE}"/>'
        else: out += f'<rect x="{x}" y="{68 - hgt}" width="{bw}" height="{max(3, hgt)}" rx="3" fill="{dark if v == mx else light}"/>'
        out += f'<text x="{x + bw / 2:.0f}" y="96" text-anchor="middle" font-size="24" fill="{BODY}" font-family="IBM Plex Sans, Arial, sans-serif">{ini[i]}</text>'
    return f'<svg aria-label="Por día, del {LBL}" viewBox="0 0 342 100" width="342" height="100" style="width:342px; height:100px">{out}</svg>'
def daybars(vals, labels, colfn, H=360, bw=64, sub=None):
    mx = max(vals) or 1
    return ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600; color:{TEXT}; text-align:center">{v}</p><div style="width:{bw}px; height:{max(6, round(v / mx * H))}px; background:{colfn(i, v)}; border-radius:8px 8px 0 0"></div><p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center; white-space:nowrap">{labels[i]}</p>' + (f'<p style="font-size:24px; color:{BODY}; text-align:center; white-space:nowrap">{sub[i]}</p>' if sub else '') + '</div>' for i, v in enumerate(vals))

# ------------------------------------------------------------------ 1 portada
add('portada', f'<section id="portada" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:{GDK}; font-family:{FONT}; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(14,40,28,0.82); border-left:6px solid #9CCBAE; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(30,18,52,0.82); border-left:6px solid #B9A8E0; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Logística · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Logística Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">Del 24 de septiembre al 4 de octubre de 2026</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Logística Nodo Sur, período 24/09–04/10 (11 días). Datos: planilla de movimientos por contrato del 24/09 al 04/10 y lecturas de cámaras de Ricardone y del puerto. Comparativos contra la semana 17–23/09 (comité 25/09); las cantidades se comparan por día, porque el período es más largo que una semana.</aside></section>')

# ------------------------------------------------------------------ 2 resumen planta
def pcard(tag, tagcol, band, big, unit, line2, vals, dark, light, foot):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:22px 26px">'
            f'<p style="font-size:24px; font-weight:600; color:{tagcol}; text-transform:uppercase; letter-spacing:1px">{tag}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:10px"><p style="font-size:60px; font-weight:600; line-height:1.05; color:{tagcol}">{big}</p><p style="font-size:24px; color:{BODY}">{unit}</p></div>'
            f'<p style="font-size:24px; color:{TEXT}">{line2}</p>{minibars(vals, dark, light)}<p style="font-size:24px; line-height:1.3; color:{BODY}">{foot}</p></div>')
def strip(t1, t2): return f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; border-left:8px solid #9AA8A0; padding:4px 0px 4px 18px"><p style="font-size:24px; font-weight:600; color:{TEXT}">{t1}</p><p style="font-size:24px; color:{BODY}">{t2}</p></div>'
imx = max(range(N), key=lambda i: R7['dia'][i])
c34 = CAL['porCalle'].get('RicCal04', 0) + CAL['porCalle'].get('RicCal03', 0)
calles_tot = sum(CAL['porCalle'].values())
v5share = round(sum(VOL['V5']) / VOL_TOT * 100)
lq_top = sorted(range(N), key=lambda i: -LIQX['dia'][i])[:3]
section('resumen-planta', head('Planta', 'Qué entró a la planta, cuándo y cuánto tardó', VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + pcard('Soja · R7', GDK, GMID, fmtn(R7['ops']), 'operaciones', f'<b>{R7["total"]} min</b> puerta a puerta', R7['dia'], GDK, GMID, f'{days[imx]}: el día más cargado.')
    + pcard('Girasol · R5+R6', '#7A5608', '#E0A526', fmtn(GI['ops']), 'operaciones', f'<b>{GI["total"]} min</b> en planta', GI['dia'], '#7A5608', '#E0A526', f'Volcable 1: {GI["r5"]} · volcable 2: {GI["r6"]}.')
    + pcard('Líquidos', BLU, BMID, fmtn(LIQX['camiones']), 'camiones', f'<b>{LIQX["media"]} min</b> puerta a puerta', LIQX['dia'], BLU, BMID, 'Aceites, borras y glicerina. Pico del lunes 28 al miércoles 30.')
    + pcard('Pellet', '#5E4428', '#9A7650', fmtn(PELX['viajes']), 'viajes', f'<b>{fmtn(PELX["viajes"] * 30)} t</b> al puerto', PELX['dia'], '#5E4428', '#9A7650', 'Transile en 2 tandas: 24–26/09 y 30/09–01/10.')
    + '</div><div style="display:flex; flex-direction:row; gap:32px">'
    + strip('Calada sólida Ricardone', f'{fmtn(CAL["camiones"])} recorridos de cámara · activa el {round(CAL["horas"] / HOURS * 100)} % de las horas')
    + strip('Volcables puerto', f'{fmtn(VOL_TOT)} recorridos de cámara · V5 hizo el {v5share} %')
    + strip('Silos Ricardone', f'{fmtn(R29["ops"])} transiles de soja (R29), del 24 al {DAYS[R29_last][8:10]}/09')
    + '</div>',
    f'Período de {N} días (24/09 al 04/10). Productos y tiempos por día operativo desde las 22 h; sectores por día calendario. Soja: {fmtn(R7["ops"])} operaciones R7 y {R7["total"]} min puerta a puerta. Girasol: {fmtn(GI["ops"])} operaciones R5+R6 (volcable 1 {GI["r5"]}, volcable 2 {GI["r6"]}; además {GI["r4"]} a silos Kepler, R4); tiempo en planta = suma de tramos medios ({GI["total"]} min, lámina de girasol). '
    f'Líquidos: {LIQX["camiones"]} camiones (ingresos {LIQX["ingresos"]}, egresos {LIQX["egresos"]}), sin Renopack (no tiene cámaras); tiempo medio {LIQX["media"]} min. Pellet: {PELX["viajes"]} transiles de pellet de girasol al puerto (R30/31/32, planilla). '
    f'Calada sólida: {fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} de {HOURS} h. Volcables puerto: {fmtn(VOL_TOT)} descargas de soja R7. Silos: {fmtn(SIL["camiones"])} recorridos; transile R29 {R29["ops"]} operaciones (planilla). '
    'Con la planilla completa (incluye los movimientos del 01/10 que ingresaron el 30/09) el 30/09 suma 116 operaciones R7 (antes 100).', gap=28)

# ------------------------------------------------------------------ 3 día a día (camiones adentro)
ricA = [round(c / 24 * m / 60) for c, m in zip(CAL['porDia'], R7['ricDia'])]
volD = [sum(VOL[v][i] for v in VOL) for i in range(N)]
slA = [round(c / 24 * m / 60) for c, m in zip(volD, R7['slzDia'])]
totA = [a + b for a, b in zip(ricA, slA)]
mxA = max(totA)
cols = ''
for i in range(N):
    hs, hr = round(slA[i] / mxA * 330), round(ricA[i] / mxA * 330)
    cols += (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:end; align-items:center; gap:0px"><p style="font-size:28px; font-weight:600; line-height:1.2; color:{TEXT}; padding:0px 0px 6px 0px">{totA[i]}</p>'
             f'<div style="width:68px; display:flex; flex-direction:column; border-radius:6px 6px 0px 0px; overflow:hidden">'
             f'<div style="height:{max(hs, 18)}px; background:{VMID}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hs >= 24 else 0.75}; color:#F1F6F2">{slA[i]}</p></div>'
             f'<div style="height:{max(hr, 18)}px; background:{GDK}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hr >= 24 else 0.75}; color:#F1F6F2">{ricA[i]}</p></div></div>'
             f'<div style="align-self:stretch; display:flex; flex-direction:column; align-items:center; gap:2px; border-top:2px solid {GREY}; padding:8px 0px 0px 0px"><p style="font-size:24px; font-weight:600; line-height:1.2; color:{TEXT}; white-space:nowrap">{days[i]}</p><p style="font-size:24px; line-height:1.2; color:{BODY}">{R7["dia"][i]}</p></div></div>')
iA = max(range(N), key=lambda i: totA[i]); iB = min(range(N), key=lambda i: totA[i])
def note(big, txt, band, col=TEXT):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:8px solid {band}; border-radius:14px; padding:12px 20px"><p style="font-size:44px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; line-height:1.3; color:{BODY}">{txt}</p></div>'
section('dia-a-dia', head('Planta', f'El {full[iA]} fue el día con más camiones adentro de la planta', VIO, 60)
    + p('<b>Camiones adentro:</b> cuántos hay en promedio a cualquier hora. Sube si entran más o si tardan más en salir.', 26)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:40px; padding:16px 0px 0px 0px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Ricardone', GDK), ('San Lorenzo', VMID)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}; white-space:nowrap">Abajo: camiones de soja del día</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:0px">{cols}</div></div>'
    + '<div style="width:440px; display:flex; flex-direction:column; justify-content:center; gap:14px">'
    + note(totA[iA], f'camiones adentro el {full[iA]}: {ricA[iA]} en Ricardone y {slA[iA]} en San Lorenzo.', VIO)
    + note(f'{min(totA)}–{max(totA)}', f'por día en el período; el más bajo, el {full[iB]}.', GLT)
    + note(slA[iA], f'en San Lorenzo el {full[iA]}: el puerto tardó {R7["slzDia"][iA]} min por camión.', GDK, GDK)
    + '</div></div>',
    'Camiones adentro = camiones del día por hora (camiones / 24) × horas que pasa cada uno adentro (ley de Little). '
    f'Ricardone: recorridos por la calada sólida del día ({", ".join(map(str, CAL["porDia"]))}) por el tiempo de la soja en Ricardone ({", ".join(map(str, R7["ricDia"]))} min). '
    f'San Lorenzo: descargas R7 en las volcables del puerto ({", ".join(map(str, volD))}) por el tiempo de la soja en San Lorenzo ({", ".join(map(str, R7["slzDia"]))} min). '
    f'Por día (Ricardone / San Lorenzo / total): ' + ', '.join(f'{days[i].lower()} {ricA[i]}/{slA[i]}/{totA[i]}' for i in range(N)) + '. '
    f'El tiempo de San Lorenzo de cada día se mide por patente con cámaras sobre los camiones de soja R7 del día ({", ".join(map(str, R7["slzN"]))}). Soja del día: planilla.', gap=20)

# ------------------------------------------------------------------ dividers
def divider(id, num, title, sub, bg, accent):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:#F1F6F2; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px; gap:24px"><div style="flex:1"></div><p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p><h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1><p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p><div style="flex:1"></div>{footer(0, True)}</section>')
divider('div-soja', '01', 'Soja', 'Circuito R7 Ricardone → San Lorenzo: el período día por día, por planta y por horario.', GDK, GLT)

# ------------------------------------------------------------------ tramos (barra proporcional)
def tramos(cols_def, vals, colors, numcols, brackets, total_w=1664):
    s = sum(vals); ws = [round(v / s * total_w) for v in vals]; ws[vals.index(max(vals))] += total_w - sum(ws)
    grid = f'<div style="display:grid; grid-template-columns:repeat({len(vals)}, 1fr); gap:12px">' + ''.join(
        f'<div style="display:flex; flex-direction:column; gap:8px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="height:10px; background:{colors[i]}; border-radius:5px"></div><p style="font-size:24px; line-height:1.35; color:{BODY}">{b}</p></div>'
        for i, (a, b) in enumerate(cols_def)) + '</div>'
    nums = ''.join(f'<p style="width:{w}px; font-size:36px; font-weight:600; color:{numcols[i]}; text-align:center; white-space:nowrap">{v}</p>' for i, (w, v) in enumerate(zip(ws, vals)))
    bar = ''.join(f'<div style="width:{w}px; height:56px; background:{colors[i]}{"" if i == 0 else "; border-left:3px solid #F5F8F4"}"></div>' for i, w in enumerate(ws))
    br = ''
    for kind, a, b, label, col, tcol in brackets:
        w = sum(ws[a:b])
        br += f'<div style="width:{w}px"></div>' if kind == 'gap' else f'<div style="width:{w}px; display:flex; flex-direction:column; gap:8px; border-top:4px solid {col}; padding:10px 0px 0px 0px"><p style="font-size:28px; font-weight:600; color:{tcol}; text-align:center">{label}</p></div>'
    return grid + f'<div style="display:flex; flex-direction:column; gap:8px"><div style="display:flex; flex-direction:row">{nums}</div><div style="display:flex; flex-direction:row; border-radius:8px; overflow:hidden">{bar}</div><div style="display:flex; flex-direction:row; gap:0px">{br}</div></div>'
def hstack(rows, width=1000, bh=44, gap=10, c1=None, c2=None, lab_w=150, ticks=True):
    """rows = [(etiqueta, ricardone, san_lorenzo)] → barras apiladas horizontales con la cifra adentro de cada tramo."""
    c1 = c1 or GMID; c2 = c2 or VMID
    mx = max((a or 0) + (b or 0) for _, a, b in rows) or 1
    top = 100 * ((mx + 99) // 100)
    out = ''
    for lab, a, b in rows:
        wa, wb = round((a or 0) / top * width), round((b or 0) / top * width)
        seg = lambda w, v, c: (f'<div style="width:{w}px; height:{bh}px; background:{c}; display:flex; flex-direction:row; align-items:center; justify-content:end; padding:0px 10px 0px 0px"><p style="font-size:24px; font-weight:700; color:#FFFFFF">{v}</p></div>' if v else '')
        out += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:{lab_w}px; font-size:26px; font-weight:600; color:{TEXT}; text-align:right; white-space:nowrap">{lab}</p>'
                f'<div style="display:flex; flex-direction:row; border-left:2px solid {TEXT}">{seg(wa, a, c1)}{seg(wb, b, c2)}</div></div>')
    if ticks:
        step = 100 if top <= 500 else 200
        tk = ''.join(f'<p style="width:{round(width * step / top)}px; font-size:24px; color:{BODY}">{v}</p>' for v in range(0, top, step))
        out += f'<div style="display:flex; flex-direction:row; gap:16px"><p style="width:{lab_w}px"></p><div style="display:flex; flex-direction:row">{tk}<p style="font-size:24px; color:{BODY}">{top}</p></div></div>'
    return f'<div style="display:flex; flex-direction:column; gap:{gap}px">{out}</div>'
HC1, HC2 = GMID, VMID
def kcard(label, big, band, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {band}; border-radius:14px; padding:24px 32px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p><p style="font-size:56px; font-weight:600; line-height:1.1; color:{col}">{big}</p></div>'
v7 = [R7['ing'], R7['p1'], R7['sal'], R7['inter'], R7['osl'], R7['desc'], R7['egr']]
section('tramos-r7', head('Soja · R7', 'Tiempos medios por tramo')
    + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('Salida', 'Calada → Salida Ricardone'), ('Interplanta', 'Salida Ricardone → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable puerto'), ('Egreso', 'Volcable puerto → Salida SLZ')],
             v7, [GLT, GDK, GMID, GREY, VIO, VMID, VXLT], [TEXT, GDK, TEXT, TEXT, VIO, VMID, TEXT],
             [('b', 0, 3, f'Ricardone · {R7["ric"]} min ({hm(R7["ric"])})', GDK, GDK), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {R7["slz"]} min ({hm(R7["slz"])})', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Tiempo total puerta a puerta', f'{R7["total"]} min · {hm(R7["total"])}', GDK, GDK)
    + kcard('Comparativo semana anterior', f'{sgn(R7["total"] - PUB["total"])} min', GMID, GDK)
    + kcard('Total de camiones', fmtn(R7['ops']), VMID, VIO) + '</div>',
    f'Circuito R7, promedio del período por tramo en minutos: ingreso {R7["ing"]}, Playa 1 {R7["p1"]}, salida {R7["sal"]}, interplanta {R7["inter"]}, Playa OSL {R7["osl"]}, descarga {R7["desc"]}, egreso {R7["egr"]}. '
    f'Suman {sum(v7)}; el puerta a puerta medido de punta a punta (ingreso → salida de la planilla) da {R7["total"]}. Semana anterior (comité 25/09): 303. En 24–30/09 había dado 265 (Playa OSL 113, descarga 55): la suma del 01 al 04/10 bajó la espera en Playa OSL. '
    'Tramos = legs de cámara de los recorridos asociados a una operación R7, compuestos como «Cargar rango» del dashboard.', gap=36)
v29 = [R29['preLiq'], R29['liqP3'], R29['p3Silo'], R29['siloBal'], R29['balCal'], R29['calEgr'], R29['puente'], R29['osl'], R29['balVolc'], R29['volcSal']]
section('tramos-r29', head('Soja · transile R29', 'Transile desde silos: tiempos medios por tramo', GMID)
    + tramos([('Ingreso y Playa 1', 'Ingreso → Calle líquida'), ('Acceso P3', 'Calle líquida → Playa 3'), ('Espera carga', 'Playa 3 → Silo'), ('Carga', 'Silo → Balanza egreso'), ('A calada', 'Balanza egreso → Calada'), ('Salida', 'Calada → Salida Ric'), ('Traslado', 'Salida Ric → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza SLZ'), ('Descarga', 'Balanza SLZ → Volcable'), ('Egreso', 'Volcable → Salida SLZ')],
             v29, [GMID, GLT, GDK, GMID, G2, GLT, GREY, VIO, VMID, VXLT], [TEXT, TEXT, GDK, TEXT, TEXT, TEXT, TEXT, VIO, VMID, TEXT],
             [('b', 0, 6, f'Ricardone · {R29["ric"]} min ({hm(R29["ric"])})', GDK, GDK), ('gap', 6, 7, '', '', ''), ('b', 7, 10, f'San Lorenzo · {R29["slz"]}', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Ciclo completo (suma de tramos)', f'{R29["ciclo"]} min · {hm(R29["ciclo"])}', GDK, GDK)
    + kcard('De la carga en silo a la calada', f'{R29["siloBal"] + R29["balCal"]} min', GMID, GDK)
    + kcard('Espera en Playa OSL', f'{R29["osl"]} min', VIO, VIO) + '</div>'
    + key(f'El transile corrió del jueves 24 al {full[R29_last]} ({R29["ops"]} operaciones) y no volvió a correr hasta el 4/10. La espera para cargar en silo fue lo más largo del ciclo ({R29["p3Silo"]} min, contra 183 la semana anterior).'),
    f'Transile R29: soja cargada en silos de Ricardone y descargada en las volcables del puerto. Ciclo observado por patente: ingreso → calle líquida → Playa 3 → carga en silo → balanza egreso → calada → egreso → balanza San Lorenzo → volcable → salida. '
    f'Promedios por tramo medidos con cámaras sobre las vueltas del 24 al 29/09; del 01 al 04/10 la planilla no tiene operaciones R29, así que los tramos no cambian. Operaciones R29 de la planilla por día (fecha del movimiento): {", ".join(map(str, R29["dia"]))}.', gap=24)


r29d = X['r29Dia']
r29rows = [(days[iD[d]], a, b) for d, a, b in zip(DAYS, r29d['ric'], r29d['sl']) if a is not None and b is not None]
section('r29-dias', head('Soja · transile R29', 'Transile por día: el tiempo se fue en Ricardone, esperando cargar en silo', GMID)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Ricardone', HC1), ('San Lorenzo', HC2)])
    + hstack(r29rows, width=980, bh=52, gap=14) + '</div><div style="width:440px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Ricardone se movió entre <b>{min(a for _, a, _b in r29rows)} y {max(a for _, a, _b in r29rows)} min</b>; San Lorenzo, entre <b>{min(b for _, _a, b in r29rows)} y {max(b for _, _a, b in r29rows)} min</b>.', 28)
    + key('En el transile, la mayor parte de la vuelta pasa en Ricardone: la espera en Playa 3 para cargar en silo.' + (' Solo el ' + ' y el '.join(full[iD[DAYS[[days[iD[d]] for d in DAYS].index(l)]]] for l, a, b in r29rows if b > a) + ' pesó más el puerto.' if any(b > a for _, a, b in r29rows) else ''), 28) + '</div></div>',
    f'Transile R29 por día (24 al 29/09; del 30/09 al 04/10 no hubo transile). Medido por patente con cámaras: Ricardone = pre-ingreso → egreso (incluye calle líquida, Playa 3, carga en silo, balanza y calada); San Lorenzo = egreso de Ricardone → salida del puerto, sin el traslado. '
    f'Vueltas medidas por día: {", ".join(str(n) for n in r29d["n"][:len(r29rows)])}.', gap=24)

# ------------------------------------------------------------------ resumen soja
def kpi(label, big, col, delta, tone, vals):
    sp = spark(vals, 300, 80, GMID, GDK) if vals else ''
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p><div style="flex:1"></div>{sp}</div>')
rk_tot = rank(TOT, R7['total']); rk_p1 = rank(P1, R7['p1']); rk_sl = rank(SLZ, R7['slz'])
ordinal = {1: 'La más baja', 2: '2.ª más baja', 3: '3.ª más baja'}
r7_dia, r7_dia_prev = per_day(R7['ops']), PUB['r7_ops'] / PREV_DAYS
section('resumen-soja', head('Soja · R7', 'Resumen del período: soja')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('Puerta a puerta', f'{R7["total"]} min', GDK, f'{sgn(R7["total"] - PUB["total"])} min vs. semana anterior', GXLT, TOT)
    + kpi('Espera Playa 1 · Ricardone', f'{R7["p1"]} min', GDK, f'{ordinal.get(rk_p1)} desde junio' if rk_p1 <= 3 else f'{sgn(R7["p1"] - PUB["p1"])} vs. semana anterior', GXLT, P1)
    + kpi('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', VIO, f'{sgn(R7["slz"] - PUB["slz"])} vs. semana anterior', VLT, SLZ)
    + kpi('Camiones R7 por día', fmtn(r7_dia), GDK, f'{round((r7_dia / r7_dia_prev - 1) * 100)} % vs. semana anterior'.replace('-', '−'), GXLT, None)
    + '</div>' + key(f'Período liviano y el más rápido desde junio: {R7["total"]} min puerta a puerta. La mejora vino de Ricardone (Playa 1 en {R7["p1"]} min, el mínimo de la serie); San Lorenzo quedó en su nivel: {R7["slz"]} min contra {PUB["slz"]}.', 28),
    f'{fmtn(R7["ops"])} camiones R7 en {N} días: {fmtn(r7_dia)} por día, contra {fmtn(r7_dia_prev)} por día de la semana anterior (1.370 en 7 días). '
    f'Líneas: evolución por fecha de comité (cada punto informa la semana previa), del 17/06 al 25/09, y el último punto es este período (24/09–04/10). Promedios de la serie: total {avg(TOT)} min, Playa 1 {avg(P1)} min, San Lorenzo {avg(SLZ)} min.')

# ------------------------------------------------------------------ hallazgo
mxd = max(R7['dia']); top2 = sorted(range(N), key=lambda i: -R7['dia'][i])[:2]
islow = max(range(N), key=lambda i: R7['totDia'][i]); ifast = min(range(N), key=lambda i: R7['totDia'][i])
bars = daybars(R7['dia'], days, lambda i, v: GDK if i in top2 else GLT, 270, 52, [f'{m}' for m in R7['totDia']])
i28 = iD['2026-09-28']; i2 = top2[1] if top2[0] == i28 else top2[0]
section('hallazgo', '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:600px; display:flex; flex-direction:column; gap:28px">'
    + head('Soja · R7', 'El lunes 28 fue el día más cargado y también el más lento' if islow == i28 and imx == i28 else f'El {full[imx]} fue el día más cargado')
    + p(f'El lunes 28 entraron {R7["dia"][i28]} camiones de soja y el ciclo llegó a {R7["totDia"][i28]} min. El {full[i2]} le siguió en volumen ({R7["dia"][i2]}), con {R7["totDia"][i2]} min.', 28)
    + p(f'El {full[ifast]} fue el día más rápido: {R7["totDia"][ifast]} min con {R7["dia"][ifast]} camiones.', 28)
    + key(f'El lunes el tiempo se fue en San Lorenzo ({R7["slzDia"][i28]} min): la PV2 no descargó (preventivo de 8.000 h en su compresor) y la PV4 la cubrió.')
    + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Días de mayor volumen', GDK), ('Resto', GLT)])
    + f'<p style="font-size:24px; color:{BODY}">Camiones por día y, abajo, minutos puerta a puerta</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{bars}</div></div></div>',
    'Camiones R7 por día operativo (planilla) y tiempo puerta a puerta medio del día: ' + ', '.join(f'{days[i].lower()} {R7["dia"][i]} / {R7["totDia"][i]} min' for i in range(N)) + '. PV2 el 28/09: 0 descargas contra una mediana de 22; PV4: 29 contra 4. Mantenimiento: fechas programadas de las OT del EAM hasta el 29/09, sin horas de parada (cruce_mantenimiento.py); para octubre no hay cruce con mantenimiento.')

# ------------------------------------------------------------------ plantas
pchart = hstack([(days[k], R7['ricDia'][k], R7['slzDia'][k]) for k in range(N)], width=980, bh=40, gap=8)
section('plantas', head('Soja · R7', 'Tiempos por planta, día por día: San Lorenzo volvió a ser la que más varió')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Ricardone', HC1), ('San Lorenzo', HC2)])
    + f'{pchart}</div><div style="width:440px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Ricardone se movió entre <b>{min(R7["ricDia"])} y {max(R7["ricDia"])} min</b>. San Lorenzo, entre <b>{min(R7["slzDia"])} y {max(R7["slzDia"])} min</b>.', 28)
    + p(f'El lunes 28 San Lorenzo llegó a {R7["slzDia"][i28]} min, con la PV2 fuera de servicio; el sábado 3/10 volvió a subir ({R7["slzDia"][iD["2026-10-03"]]} min).', 28)
    + key('Dentro del período, la variación se jugó otra vez en San Lorenzo.', 28) + '</div></div>',
    'Minutos promedio por planta y por día. Ricardone = ingreso + Playa 1 + egreso (paquete del dashboard). '
    f'San Lorenzo = ingreso al puerto → salida, medido por patente con cámaras sobre los camiones de soja R7 de cada día ({", ".join(map(str, R7["slzN"]))}); promedio del período {X["r7Dia"]["periodo"]["mean"]} min sobre {X["r7Dia"]["periodo"]["n"]} camiones. '
    'La suma de tramos de la lámina 5 sale de otra muestra (los recorridos de cámara unidos a una operación de la planilla) y por eso no coincide con este promedio.')

# ------------------------------------------------------------------ cuartos
QCOL = {'Q4': GDK, 'Q3': '#7B1E3A', 'Q2': '#C9651A', 'Q1': '#C8372D'}
dayq = [sum(qd[q][i] for q in qd) for i in range(N)]
mxq = max(dayq)
stack = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600">{dayq[i]}</p><div style="display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                + ''.join(f'<div style="width:68px; height:{round(qd[q][i] / mxq * 400)}px; background:{QCOL[q]}"></div>' for q in ('Q4', 'Q3', 'Q2', 'Q1'))
                + f'</div><p style="font-size:24px; font-weight:600; white-space:nowrap">{days[i]}</p></div>' for i in range(N))
pct = {q: round(QN[q] / R7['ops'] * 100) for q in QN}
qrow = lambda q, lab: f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QCOL[q]}; border-radius:12px; padding:16px 24px"><p style="font-size:28px; font-weight:600; width:220px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QCOL[q]}">{pct[q]} %</p><p style="font-size:24px; color:{BODY}">{QN[q]}</p></div>'
section('cuartos', head('Soja · R7', 'El ingreso entre cuartos sigue parejo')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:40px"><div style="flex:1; display:flex; flex-direction:row; gap:4px; align-items:end">{stack}</div><div style="width:480px; display:flex; flex-direction:column; gap:20px">'
    + qrow('Q1', 'Q1 · 22–04 h') + qrow('Q2', 'Q2 · 04–10 h') + qrow('Q3', 'Q3 · 10–16 h') + qrow('Q4', 'Q4 · 16–22 h')
    + key(f'La noche (Q1) sigue siendo el cuarto más cargado ({pct["Q1"]} %, la semana anterior 36 %); los otros tres quedaron entre {min(pct["Q2"], pct["Q3"], pct["Q4"])} y {max(pct["Q2"], pct["Q3"], pct["Q4"])} %.')
    + '</div></div>',
    f'Camiones R7 por cuarto del día operativo y por día. Suma = {fmtn(R7["ops"])}. Franjas: 22–04 / 04–10 / 10–16 / 16–22.', bg=BG2)

# ------------------------------------------------------------------ histórico
def linechart(vals, col, vmin, vmax, avgv, X0=168, Y0=380, W=1000, H=400):
    n = len(vals)
    xy = lambda i, v: (X0 + round(i * W / (n - 1)), Y0 + round((vmax - v) / (vmax - vmin) * H))
    out = f'<svg aria-label="Serie semanal 17/06 a 25/09 y el período actual" viewBox="0 0 {W + 40} {H + 40}" width="{W + 40}" height="{H + 40}" style="position:absolute; left:{X0 - 20}px; top:{Y0 - 20}px; width:{W + 40}px; height:{H + 40}px">'
    for gl in range(5): out += f'<line x1="20" y1="{20 + gl * 100}" x2="{W + 20}" y2="{20 + gl * 100}" stroke="{LINE}" stroke-width="2"/>'
    ay = xy(0, avgv)[1] - Y0 + 20
    out += f'<line x1="20" y1="{ay}" x2="{W + 20}" y2="{ay}" stroke="{BODY}" stroke-width="2" stroke-dasharray="8 8"/>'
    pts = [xy(i, v) for i, v in enumerate(vals)]
    out += f'<polyline fill="none" stroke="{col}" stroke-width="5" stroke-linejoin="round" points="' + ' '.join(f'{x - X0 + 20},{y - Y0 + 20}' for x, y in pts) + '"/>'
    out += ''.join(f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="{11 if i == n - 1 else 6}" fill="{col}"/>' for i, (x, y) in enumerate(pts)) + '</svg>'
    for i, (x, y) in enumerate(pts):
        out += f'<p style="position:absolute; left:{x - 40}px; top:{y - 48}px; width:80px; text-align:center; font-size:24px; font-weight:600; color:{col}">{vals[i]}</p>'
        out += f'<p style="position:absolute; left:{x - 44}px; top:{Y0 + H + 24}px; width:88px; text-align:center; font-size:24px; color:{BODY}{"; font-weight:600" if i == n - 1 else ""}">{weeks[i]}</p>'
    return out
def ctx(label, big, vals, col, sub):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:14px; padding:20px 24px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:end; justify-content:space-between; gap:16px"><p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>{spark(vals, 220, 70, col, col)}</div><p style="font-size:24px; color:{BODY}">{sub}</p></div>')
section('historico', head('Soja · R7', 'Dónde queda el período: el tiempo más bajo desde junio' if rk_tot == 1 else 'Dónde queda el período')
    + legend([('Tiempo puerta a puerta (min) · rótulo = fecha del comité', GDK), (f'Promedio de la serie: {avg(TOT)}', BODY)])
    + linechart(TOT, GDK, 230, 470, avg(TOT))
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Ricardone · espera Playa 1', f'{R7["p1"]} min', P1, GDK, f'Promedio desde junio: {avg(P1)}')
    + ctx('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', SLZ, VMID, f'Promedio desde junio: {avg(SLZ)}')
    + key(f'La mejora vino otra vez de Ricardone; San Lorenzo quedó {"arriba" if R7["slz"] > avg(SLZ) else "en"} de su promedio ({R7["slz"]} contra {avg(SLZ)}).' if R7['slz'] > avg(SLZ) else f'La mejora vino otra vez de Ricardone; San Lorenzo quedó en su promedio ({R7["slz"]} contra {avg(SLZ)}).') + '</div>',
    f'Tiempo puerta a puerta R7 por comité (rótulo = fecha del comité, que informa la semana previa). «Actual» = período 24/09–04/10, {N} días ({R7["total"]} min; el 24–30/09 solo había dado 265). Queda por debajo del mínimo previo de la serie (276, punto 11/9).', gap=24)

# ------------------------------------------------------------------ pellet (operativo de transile R30/31/32)
FLETE_T = 6000  # $ por tonelada, flete interplanta Ricardone → puerto
TN_VIAJE = 30
def pesos(v):
    return f'$ {str(round(v / 1e6, 1)).replace(".", ",")} M' if v >= 1e6 else '$ ' + f'{round(v):,}'.replace(',', '.')
PL, PC = PO['planilla'], PO['camaras']
pt = {k: v['mean'] for k, v in PC['periodo'].items()}
pdays = PO['periodo']['dias']
dlab = {d: days[iD[d]] for d in pdays}
dfull = {d: full[iD[d]] for d in pdays}
divider('div-pellet', '02', 'Pellet', 'Un operativo de transile de pellet de girasol en dos tandas, de Ricardone a las volcables del puerto.', '#5E4428', '#E3C9A3')
TD = X['pelletTandas']
def box(big, lab, sub=''):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid #9A7650; border-radius:14px; padding:18px 26px"><p style="font-size:24px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:56px; font-weight:600; line-height:1.05; color:#5E4428">{big}</p>' + (f'<p style="font-size:24px; color:{BODY}">{sub}</p>' if sub else '') + '</div>'
t1, t2 = TD[0], TD[-1]
fdd = lambda s_: f'{s_[8:10]}/{s_[5:7]}'
prow = [(days[iD[d]], round(PC['porDia'][d]['tramos']['ric']['mean']), round(PC['porDia'][d]['tramos']['sl']['mean'])) for d in pdays]
section('pellet-operativo', head('Pellet · R30/31/32', 'Un operativo en dos tandas, por la volcable 4', '#5E4428')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:440px; display:flex; flex-direction:column; gap:16px">'
    + box(fmtn(PL['toneladas30']) + ' t', 'Pellet de girasol al puerto')
    + box(fmtn(PL['viajes']), 'Viajes', f'{PL["patentes"]} camiones')
    + box('2 tandas', f'{fdd(t1["inicio"])}–{fdd(t1["fin"])} y {fdd(t2["inicio"])}–{fdd(t2["fin"])}')
    + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">{legend([("Ricardone", HC1), ("San Lorenzo", HC2)])}<p style="font-size:24px; color:{BODY}">Tiempo por viaje, día por día (min)</p></div>'
    + hstack(prow, width=900, bh=60, gap=18, lab_w=120)
    + '</div></div>'
    + key(f'La segunda tanda movió más viajes pero tardó más: el puerto pasó de {t1["sl"]} a {t2["sl"]} min por viaje, con una sola volcable para el pellet.'),
    f'Transile de pellet de girasol de Ricardone a la volcable 4 del puerto (R30/31/32), según la planilla de movimientos: {PL["viajes"]} viajes, {PL["patentes"]} camiones distintos, {fmtn(PL["toneladasReales"])} t netas (viajes × 30 = {fmtn(PL["toneladas30"])} t). '
    f'1.ª tanda: {t1["viajes"]} viajes, {t1["camiones"]} camiones, {fx(t1["horas"])} h de actividad, ciclo {t1["ciclo"]} min. 2.ª tanda: {t2["viajes"]} viajes, {t2["camiones"]} camiones, {fx(t2["horas"])} h, ciclo {t2["ciclo"]} min. Del 02 al 04/10 no hubo transile de pellet. '
    f'Por día, Ricardone = pre-ingreso → balanza egreso y San Lorenzo = ingreso → salida del puerto, medidos por patente con cámaras. Las pocas lecturas en otras volcables ({", ".join(f"{k} {v}" for k, v in sorted(PC["porVolcable"].items()) if k != "V4")}) son lecturas cruzadas de la cámara vecina: el pellet descargó por la V4.', gap=26)
# tramos
vp = [pt['playa1'], pt['ptara'], pt['carga'], pt['interplanta'], pt['playaOsl'], pt['descarga'], pt['salida']]
ric_s, sl_s = sum(vp[:3]), sum(vp[4:])
section('pellet-tramos', head('Pellet · R30/31/32', 'Pellet: tiempos medios por tramo', '#5E4428')
    + tramos([('Playa 1', 'Pre-ingreso → Calle líquida'), ('Acceso P3', 'Calle líquida → Playa 3'), ('Carga', 'Playa 3 → Balanza egreso'), ('Interplanta', 'Balanza egreso → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable'), ('Salida', 'Volcable → Salida SLZ')],
             vp, [GLT, GMID, '#9A7650', GREY, VIO, VMID, VXLT], [TEXT, TEXT, '#5E4428', TEXT, VIO, VMID, TEXT],
             [('b', 0, 3, f'Ricardone · {ric_s} min ({hm(ric_s)})', '#9A7650', '#5E4428'), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {sl_s} min ({hm(sl_s)})', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Ciclo completo por viaje', f'{pt["ciclo"]} min · {hm(pt["ciclo"])}', '#9A7650', '#5E4428')
    + kcard('Vuelta puerto → Ricardone', f'{pt["vuelta"]} min', GMID, GDK)
    + kcard('Viajes por camión en el operativo', str(round(PL['viajes'] / PL['patentes'])), VMID, VIO) + '</div>'
    + key(f'Playa OSL y la descarga suman {pt["playaOsl"] + pt["descarga"]} de los {pt["ciclo"]} min del ciclo: el tiempo del operativo se fue en el puerto. En Ricardone, la carga en Playa 3 tomó {pt["carga"]} min y no cambió entre tandas.'),
    f'Tramos medidos con cámaras sobre {PC["viajes"]} de los {PL["viajes"]} viajes (patentes de la planilla; viaje = pre-ingreso → calle líquida → Playa 3 → balanza egreso cargado → ingreso SLZ → balanza OSL → volcable → salida SLZ, sin carga de silo ni calada sólida en el medio). '
    f'Corridas 2026-09-21_2026-09-27 y 2026-09-28_2026-10-04 (reprocesada con todas las cámaras), reglas etl_transform_v17. Suman {sum(vp)}; el ciclo medido de punta a punta da {pt["ciclo"]} (cada tramo se promedia sobre los viajes que lo tienen leído). '
    f'La calle líquida aparece en {PC["conCalleLiquida"]} de {PC["viajes"]} viajes: en el primero del día de cada camión ({PC["calleLiquidaPorOrden"]["primero"][1]} de {PC["calleLiquidaPorOrden"]["primero"][0]}) y también en los siguientes ({PC["calleLiquidaPorOrden"]["siguientes"][1]} de {PC["calleLiquidaPorOrden"]["siguientes"][0]}).', gap=32)
# histórico
fd = lambda s_: f'{s_[8:10]}/{s_[5:7]}'
cols_w = [170, 260, 140, 170, 250, 200, 140, 160]
hdr = ['Comité', 'Período', 'Viajes', 'Camiones', 'Viajes por camión y día', 'Toneladas', 'Horas', 'Ciclo']
def row(cells, bold=False, bg=None, col=TEXT):
    return (f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:10px 0px{"; background:" + bg if bg else ""}">'
            + ''.join(f'<p style="width:{w}px; font-size:26px; font-weight:{600 if bold or k == 0 else 400}; color:{col}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, cells))) + '</div>')
PHs = [dict(o, hasta=('2026-10-01' if o['id'] == 'actual' else o['hasta'])) for o in PH]
table = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 6px 0px">' + ''.join(f'<p style="width:{w}px; font-size:24px; font-weight:600; color:{BODY}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, hdr))) + '</div>'
         + ''.join(row([o['comite'] or '—', f'{fd(o["desde"])} a {fd(o["hasta"])}', fmtn(o['viajes']), str(o['camiones']), str(round(o['viajesPorCamionDia'])),
                        f'{fmtn(o["toneladas30"])} t', fx(o['horas']), f'{o["ciclo"]} min' if o['ciclo'] else '—'],
                       bold=(n == len(PHs) - 1), bg=('#F3EADF' if n == len(PHs) - 1 else None), col=('#5E4428' if n == len(PHs) - 1 else TEXT)) for n, o in enumerate(PHs)))
cam_rng = (min(o['camiones'] for o in PH), max(o['camiones'] for o in PH))
section('pellet-hist', head('Pellet · R30/31/32', 'Los operativos de pellet desde junio', '#5E4428')
    + f'<div style="display:flex; flex-direction:column">{table}</div>'
    + '<div style="display:flex; flex-direction:row; gap:48px">'
    + p(f'Todos los operativos usaron entre <b>{cam_rng[0]} y {cam_rng[1]} camiones</b> y cada camión hizo 2 o 3 viajes por día: el volumen depende de cuántos camiones se suman y cuántas horas corre.', 26, BODY, '; flex:1')
    + '<div style="flex:1">' + key(f'Este operativo usó {PH[-1]["camiones"]} camiones y movió {fmtn(PH[-1]["toneladas30"])} t. Su ciclo ({PH[-1]["ciclo"]} min) quedó en la franja baja de la serie, pero la segunda tanda volvió a subir.') + '</div></div>',
    'Operativos contados en la planilla de movimientos: transile de pellet de girasol de Ricardone al puerto, sin patentes ficticias. Camiones = patentes distintas. Toneladas = viajes × 30. Horas = primer ingreso → última salida de cada tramo continuo (corte con más de 4 h sin movimientos). '
    'Viajes por camión y día = promedio de viajes de cada camión en cada día que trabajó, redondeado. Ciclo = tiempo publicado en cada comité (los operativos de junio y julio no se presentaron en comité); el de este operativo, medido con cámaras.', gap=24)
# propuesta (prueba + tarifa)
PE = [x for x in json.load(open(os.path.join(D, X['pelletEscenarios']), encoding='utf-8')) if x['leidos'] >= 25 and x['viajes'] >= 50]
wv = lambda a, k: sum(x[k] * x['viajes'] for x in a if x[k] is not None) / max(1, sum(x['viajes'] for x in a if x[k] is not None))
pv1 = [x for x in PE if len(x['volcables']) == 1]; pv2 = [x for x in PE if len(x['volcables']) == 2]
V1 = (len(pv1), round(wv(pv1, 'puerto'))); V2 = (len(pv2), round(wv(pv2, 'puerto')))
chicos = [x for x in PE if x['camiones'] <= 45]; grandes = [x for x in PE if x['camiones'] > 55]
lam = PL['viajes'] / PL['horasOperativo']
puerto_hoy = pt['sl']                      # tiempo total en el puerto: ingreso SLZ → salida SLZ
vd_hoy_real = PH[-1]['viajesPorCamionDia']
vuelta_hoy_m = pt['ciclo'] + pt['vuelta']
jornada = vd_hoy_real * vuelta_hoy_m       # minutos que trabaja un camión por día en el operativo (se mantiene)
hoy_vd = round(vd_hoy_real)
pico_dia = max(PL['viajesDia'].values())
FLETE_OBJ = 5000
viaje_hoy = TN_VIAJE * FLETE_T; viaje_obj = TN_VIAJE * FLETE_OBJ
def etapa(puerto):
    ciclo = pt['ciclo'] - puerto_hoy + puerto; vuelta = ciclo + pt['vuelta']
    vd = int(jornada // vuelta)            # viajes enteros: se redondea para abajo
    return dict(puerto=puerto, ciclo=ciclo, vuelta=vuelta, vd=vd, cam=-(-pico_dia // vd), dia=vd * viaje_obj, circ=round(lam * vuelta / 60))
EP, EO = etapa(90), etapa(60)              # propuesta y objetivo
circ_hoy = round(lam * vuelta_hoy_m / 60)
dia_hoy = hoy_vd * viaje_hoy
flete_hoy, flete_obj = PL['viajes'] * viaje_hoy, PL['viajes'] * viaje_obj
total_hist = sum(o['viajes'] for o in PH)
hist_hoy, hist_obj = total_hist * viaje_hoy, total_hist * viaje_obj
def etapas(lab, vals, nota='', big=60):
    """vals = [(rótulo, valor)]: hoy, propuesta y objetivo uno abajo del otro; el último resaltado."""
    n = len(vals)
    rows = ''.join(f'<div style="display:flex; flex-direction:row; align-items:baseline; justify-content:space-between; gap:12px; border-top:1px solid {LINE}; padding:10px 0px 4px 0px">'
                   f'<p style="font-size:24px; font-weight:600; color:{BODY}">{r}</p>'
                   f'<p style="font-size:{big if k == n - 1 else round(big * 0.7)}px; font-weight:600; line-height:1.05; white-space:nowrap; color:{GDK if k == n - 1 else ("#5E4428" if k else "#B39A7C")}">{v}</p></div>' for k, (r, v) in enumerate(vals))
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid #9A7650; border-radius:18px; padding:28px 30px">'
            f'<p style="font-size:28px; font-weight:600; color:{TEXT}">{lab}</p>{rows}<div style="flex:1"></div>'
            + (f'<p style="font-size:24px; line-height:1.35; color:{BODY}">{nota}</p>' if nota else '') + '</div>')
H3 = lambda a, b, c: [('Hoy', a), ('Propuesta', b), ('Objetivo', c)]
section('pellet-propuesta', head('Pellet · propuesta', 'Primero 90 minutos en el puerto, después 60', '#5E4428')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:28px">'
    + etapas('Tiempo en el puerto', H3(f'{puerto_hoy} min', f'{EP["puerto"]} min', f'{EO["puerto"]} min'), 'Del ingreso a la salida, abriendo una segunda volcable además de la V4.')
    + etapas('Viajes por camión y día', H3(hoy_vd, EP['vd'], EO['vd']), f'La vuelta completa: {hm(vuelta_hoy_m)} hoy, {hm(EP["vuelta"])} y {hm(EO["vuelta"])}, en la misma jornada.')
    + etapas('Camiones contratados', H3(PL['patentes'], EP['cam'], EO['cam']), f'Los que hacen falta para el día de más viajes del operativo ({pico_dia}).')
    + '</div>'
    + key(f'La propuesta es bajar a {EP["puerto"]} min y {EP["vd"]} viajes por día; el objetivo, {EO["puerto"]} min y {EO["vd"]} viajes. En las dos etapas se mueven los mismos {fmtn(PL["viajes"])} viajes con menos camiones.'),
    f'Base: {len(PE)} días de operativo con al menos 50 viajes y 25 leídos por cámaras (18/08 al 01/10). Hasta 45 camiones: {len(chicos)} días, ciclo {round(wv(chicos, "ciclo"))} min; más de 55: {len(grandes)} días, ciclo {round(wv(grandes, "ciclo"))} min. '
    f'Una volcable: {V1[0]} días, espera en el puerto {V1[1]} min; dos volcables: {V2[0]} días, {V2[1]} min. La carga en Ricardone ({pt["ric"]} min) y los traslados quedan como hoy; solo cambia el tiempo total en el puerto (ingreso → salida SLZ), hoy {puerto_hoy} min. '
    f'Ciclo: {pt["ciclo"]} hoy, {EP["ciclo"]} en la propuesta, {EO["ciclo"]} en el objetivo; vuelta completa con el regreso a Ricardone ({pt["vuelta"]} min): {vuelta_hoy_m}, {EP["vuelta"]} y {EO["vuelta"]} min. '
    f'Jornada del camión: la de este operativo, {fx(jornada / 60)} h por día. Viajes por día = vueltas enteras que entran en esa jornada (redondeado para abajo): {hoy_vd}, {EP["vd"]} y {EO["vd"]}. '
    f'Camiones = día de más viajes ({pico_dia}) dividido viajes por camión, redondeado para arriba: {EP["cam"]} y {EO["cam"]}. Camiones dando vueltas a la vez (ley de Little): {circ_hoy} hoy, {EP["circ"]} y {EO["circ"]}.', gap=36)
def ahorro(lab, big, sub):
    return (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:12px; background:{GXLT}; border-radius:18px; padding:28px 30px">'
            f'<p style="font-size:28px; font-weight:600; color:{TEXT}">{lab}</p><p style="font-size:64px; font-weight:600; line-height:1; white-space:nowrap; color:{GDK}">{big}</p><p style="font-size:24px; line-height:1.35; color:{BODY}">{sub}</p></div>')
section('pellet-camionero', head('Pellet · propuesta', 'Le pagamos menos por viaje y el camionero gana más por día', '#5E4428')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + etapas('Flete por viaje', [('Hoy', pesos(viaje_hoy)), ('Propuesta', pesos(viaje_obj))], f'$ {fmtn(FLETE_T)} → $ {fmtn(FLETE_OBJ)} por tonelada.', 52)
    + etapas('Cobra el camionero por día', H3(pesos(dia_hoy), pesos(EP['dia']), pesos(EO['dia'])), f'+{round((EP["dia"] / dia_hoy - 1) * 100)} % con {EP["vd"]} viajes y +{round((EO["dia"] / dia_hoy - 1) * 100)} % con {EO["vd"]}.', 52)
    + ahorro('Ahorro en este operativo', pesos(flete_hoy - flete_obj), f'en flete, con los mismos {fmtn(PL["viajes"])} viajes')
    + ahorro('Ahorro desde junio', pesos(hist_hoy - hist_obj), f'si los {len(PH)} operativos se hubieran pagado a $ {fmtn(FLETE_OBJ)} por tonelada')
    + '</div>'
    + key('La clave para convencer al camionero: cobra menos por viaje, pero como espera menos en el puerto hace más vueltas y se lleva más plata por día.'),
    f'Flete interplanta: $ {fmtn(FLETE_T)} por tonelada × 30 t = {pesos(viaje_hoy)} por viaje; propuesta $ {fmtn(FLETE_OBJ)} por tonelada = {pesos(viaje_obj)}. Ingreso del camionero por día = viajes por día × flete por viaje: {hoy_vd} × {pesos(viaje_hoy)} = {pesos(dia_hoy)} hoy, {EP["vd"]} × {pesos(viaje_obj)} = {pesos(EP["dia"])} en la propuesta y {EO["vd"]} × {pesos(viaje_obj)} = {pesos(EO["dia"])} en el objetivo. '
    f'Flete del operativo: {fmtn(PL["viajes"])} viajes × 30 t: {pesos(flete_hoy)} hoy y {pesos(flete_obj)} con la tarifa nueva. Desde junio: {len(PH)} operativos, {fmtn(total_hist)} viajes, {pesos(hist_hoy)} pagados contra {pesos(hist_obj)} a la tarifa nueva. '
    f'Con {EP["vd"]} viajes por día el camionero empata lo de hoy a $ {fmtn(FLETE_T * hoy_vd / EP["vd"])} por tonelada; la tarifa de $ {fmtn(FLETE_OBJ)} le deja ganancia desde la propuesta.', gap=36)

# ------------------------------------------------------------------ pellet · respuesta a las 15 h y negociación con el camionero
EJ = json.load(open(os.path.join(D, 'calculo-pc', 'pellet-ejemplos-24h.json'), encoding='utf-8'))
PP = json.load(open(os.path.join(D, 'calculo-pc', 'pellet-por-patente.json'), encoding='utf-8'))
nE = len(EJ)
eh = round(sum(e['horas'] for e in EJ) / nE, 1); ep = round(sum(e['minPuerto'] for e in EJ) / nE / 60, 1)
er = round(sum(e['minRuta'] for e in EJ) / nE / 60, 1); eric = round(sum(e['minRicardone'] for e in EJ) / nE / 60, 1)
SHOW = [e for e in EJ if e['leidosPuerto'] == e['viajes']][:4]
H_ = 3600000
t0 = min(e['ini'] for e in SHOW) - (min(e['ini'] for e in SHOW) % H_)
t1 = max(e['fin'] for e in SHOW); span = (t1 - t0) / H_
TW = 1080
X_ = lambda t: round((t - t0) / H_ / span * TW)
TC = {'ric': GMID, 'ida': GREY, 'vuelta': GREY, 'puerto': VMID}
def tl(e):
    seg = ''
    for v in e['viajesDetalle']:
        for k in ('ric', 'ida', 'puerto', 'vuelta'):
            if v.get(k):
                a, b = v[k]; seg += f'<div style="position:absolute; left:{X_(a)}px; top:0px; width:{max(2, X_(b) - X_(a))}px; height:52px; background:{TC[k]}"></div>'
    m15 = X_(e['ini'] + 15 * H_)
    seg += f'<div style="position:absolute; left:{m15}px; top:-10px; width:4px; height:72px; background:#C8372D"></div>'
    return (f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:130px; font-size:28px; font-weight:600; color:{TEXT}">{e["patente"]}</p>'
            f'<div style="position:relative; width:{TW}px; height:52px; background:{BG2}; border-radius:6px">{seg}</div>'
            f'<p style="font-size:26px; font-weight:600; color:{TEXT}; white-space:nowrap">{fx(e["horas"])} h · {round(e["minPuerto"] / 60)} h en el puerto</p></div>')
ticks = ''
hh = (t0 // H_) * H_
import datetime as _dt
for k in range(0, int(span) + 1, 6):
    t = t0 + k * H_; lt = _dt.datetime.utcfromtimestamp((t - 3 * H_) / 1000)
    ticks += f'<p style="position:absolute; left:{X_(t) - 60}px; top:0px; width:120px; text-align:center; font-size:24px; color:{BODY}">{lt.day:02d}/{lt.month:02d} {lt.hour:02d} h</p>'
section('pellet-15h', head('Pellet · las 15 horas', f'Pasó: {nE} camiones hicieron 5 viajes seguidos en {round(eh)} h, {round(ep)} de ellas en el puerto', '#5E4428', 56)
    + legend([('Ricardone', GMID), ('En ruta', GREY), ('Puerto: fila y descarga', VMID), ('15 h desde la primera carga', '#C8372D')])
    + f'<div style="display:flex; flex-direction:column; gap:22px">' + ''.join(tl(e) for e in SHOW)
    + f'<div style="display:flex; flex-direction:row; gap:20px"><p style="width:130px"></p><div style="position:relative; width:{TW}px; height:30px">{ticks}</div></div></div>'
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard(f'Los {nE} camiones, 5 viajes', f'{fx(eh)} h seguidas', '#9A7650', '#5E4428')
    + kcard('En el puerto', f'{fx(ep)} h', VMID, VIO)
    + kcard('Manejando', f'{fx(er)} h', GREY, TEXT) + '</div>'
    + key(f'Pasa hoy: de {fx(eh)} h seguidas, el camión maneja {fx(er)} h y pasa {fx(ep)} h en el puerto, parado en la fila. Esas horas son las que pagamos y las que la propuesta saca.'),
    f'Camiones de pellet que cargaron 5 veces en menos de 24 h (planilla, 30/09–01/10): {nE} de 64. Cálculo suponiendo un mismo chofer. Para cada uno, desde la primera de esas 5 cargas en Ricardone hasta la salida del puerto de la quinta: '
    f'media {fx(eh)} h (entre {fx(min(e["horas"] for e in EJ))} y {fx(max(e["horas"] for e in EJ))}); en Ricardone {fx(eric)} h, en ruta {fx(er)} h, en el puerto (ingreso SLZ → salida SLZ) {fx(ep)} h. '
    'Ricardone = ingreso → salida de la planilla; puerto = cámaras de ingreso y salida de San Lorenzo; en ruta = el resto hasta la carga siguiente. '
    + 'Ejemplos (los 5 viajes leídos en el puerto): ' + '; '.join(f'{e["patente"]} {fx(e["horas"])} h, puerto {round(e["minPuerto"] / 60)} h, ruta {fx(e["minRuta"] / 60)} h' for e in SHOW) + '. '
    'Todos: ' + ', '.join(f'{e["patente"]} {fx(e["horas"])} h' for e in EJ) + '. Scripts: pellet-por-patente.cjs y pellet-ejemplos-24h.cjs.', gap=26)

# plata por hora
VU_H = PP['totales']['vueltaMedia']['total']
esc = [('Hoy', VU_H, FLETE_T, 'medido'), ('Propuesta', EP['vuelta'], FLETE_OBJ, f'{EP["puerto"]} min de puerto'), ('Objetivo', EO['vuelta'], FLETE_OBJ, f'{EO["puerto"]} min de puerto')]
ph = [(n, round(TN_VIAJE * t / (v / 60)), v, t, sub) for n, v, t, sub in esc]
eq = lambda v: round(ph[0][1] * (v / 60) / TN_VIAJE / 100) * 100
def hcard(n, xh, v, t, sub, k):
    col = GDK if k else '#5E4428'
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD if k else "#F3EADF"}; border:1px solid {LINE}; border-top:8px solid {col}; border-radius:18px; padding:28px 30px">'
            f'<p style="font-size:28px; font-weight:600; color:{TEXT}">{n} · {sub}</p><p style="font-size:24px; color:{BODY}">$ {fmtn(t)}/t · vuelta de {hm(v)}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1; color:{col}">$ {fmtn(xh)}</p><p style="font-size:24px; color:{BODY}">por hora de trabajo' + (f' · <b>+{round((xh / ph[0][1] - 1) * 100)} %</b>' if k else '') + '</p></div>')
d12 = [max(1, round(720 / v)) for _, _, v, _, _ in ph]   # viajes enteros en una jornada de unas 12 h
section('pellet-hora', head('Pellet · el camionero', 'Cobra menos por viaje pero más por hora: deja de cobrar por esperar', '#5E4428', 56)
    + '<div style="display:flex; flex-direction:row; gap:24px">' + ''.join(hcard(*x, k) for k, x in enumerate(ph)) + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + ''.join(kcard(f'Jornada de unas 12 h · {n.lower()}: {d12[k]} viajes en {fx(round(d12[k] * v / 60, 1))} h', pesos(d12[k] * TN_VIAJE * t), GLT if k == 0 else GMID, '#5E4428' if k == 0 else GDK) for k, (n, xh, v, t, sub) in enumerate(ph)) + '</div>'
    + key(f'Con $ 6.000 toda la mejora del puerto se la lleva el camionero y Vicentin paga lo mismo. Con $ 5.000 se reparte: el camionero gana {round((ph[1][1] / ph[0][1] - 1) * 100)} % más por hora y Vicentin ahorra el 17 %. Empata lo de hoy recién a $ {fmtn(eq(EP["vuelta"]))}/t.'),
    f'Hoy: {fmtn(PP["totales"]["flete"])} de flete en {fmtn(PP["totales"]["horasCamion"])} horas de camión trabajando (planilla, jornadas con cortes de más de 6 h) = $ {fmtn(PP["totales"]["flete"] / PP["totales"]["horasCamion"])} por hora; con la vuelta medida ({VU_H} min: Ricardone {PP["totales"]["vueltaMedia"]["ricardone"]}, manejando {PP["totales"]["vueltaMedia"]["manejando"]}, fila del puerto {PP["totales"]["vueltaMedia"]["filaPuerto"]}, descarga y salida {PP["totales"]["vueltaMedia"]["descargaSalida"]}) da $ {fmtn(ph[0][1])}. '
    f'Por hora = flete por viaje / vuelta completa. Si la tarifa quedara en $ 6.000 con la vuelta de la propuesta, el camionero cobraría $ {fmtn(round(TN_VIAJE * FLETE_T / (EP["vuelta"] / 60)))} por hora. Tarifa con la que empata lo de hoy: $ {fmtn(eq(EP["vuelta"]))}/t en la propuesta y $ {fmtn(eq(EO["vuelta"]))}/t en el objetivo. '
    f'Jornada de unas 12 h: viajes enteros más cercanos a 12 h con cada vuelta.', gap=30)

# los 10 camiones que más viajaron
top = PP['camiones'][:10]
tw = [170, 150, 190, 210, 230, 220, 230, 230]
th = ['Patente', 'Viajes', 'Horas', 'Cobró hoy', 'Viajes propuesta', 'Cobraría', 'Viajes objetivo', 'Cobraría']
trow = lambda cells, hdr=False: ('<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid ' + LINE + '; padding:8px 0px">'
    + ''.join(f'<p style="width:{w}px; font-size:{24 if hdr else 26}px; font-weight:{600 if hdr or k in (0, 5, 7) else 400}; color:{BODY if hdr else (GDK if k in (5, 7) else TEXT)}; text-align:{"left" if k == 0 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(tw, cells))) + '</div>')
def topcells(r):
    h = r['horasJornadas']; vp = int(h * 60 // EP['vuelta']); vo = int(h * 60 // EO['vuelta'])
    return [r['patente'], r['viajes'], f'{round(h)} h', pesos(r['flete']), vp, pesos(vp * viaje_obj), vo, pesos(vo * viaje_obj)]
section('pellet-top10', head('Pellet · el camionero', 'Los 10 que más viajaron: con las mismas horas, cobrarían más', '#5E4428', 56)
    + '<div style="display:flex; flex-direction:column">' + trow(th, True) + ''.join(trow(topcells(r)) for r in top) + '</div>'
    + key('Mismas horas que trabajaron en este operativo, a $ 5.000/t. La condición: el volumen es el mismo, así que hacen falta menos camiones, cada uno con más viajes.'),
    'Los 10 camiones con más viajes del operativo (planilla). Horas = suma de sus jornadas (primera carga → salida del puerto del último viaje; corte con más de 6 h entre la salida de Ricardone y la carga siguiente). '
    f'Viajes con la propuesta/objetivo = viajes enteros que entran en esas horas con una vuelta de {EP["vuelta"]} / {EO["vuelta"]} min; cobraría = viajes × {pesos(viaje_obj)}. Hoy: viajes × {pesos(viaje_hoy)}. Todos están entre los {nE} camiones que cargaron 5 veces en 24 h.', gap=24)

# ------------------------------------------------------------------ girasol
divider('div-girasol', '03', 'Girasol', 'Circuitos R5 y R6: recepción en las volcables 1 y 2 de Ricardone.', VIO, '#B9A8E0')
vg = [GI['ing'], GI['p1'], GI['pb'], GI['ap3'], GI['desc'], GI['tara']]
section('girasol', head('Girasol · R5+R6', 'Girasol: tiempos medios por tramo', VIO)
    + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('P. Bruto', 'Calada → Balanza ingreso'), ('Acceso P3', 'Balanza ingreso → Playa 3'), ('Descarga', 'Playa 3 → Volcable'), ('Tara', 'Volcable → Balanza egreso')],
             vg, [GLT, GDK, GMID, GLT, VIO, VMID], [TEXT, GDK, TEXT, TEXT, VIO, TEXT], [('b', 0, 6, f'Ricardone · {GI["total"]} min ({hm(GI["total"])})', VIO, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Tiempo total (suma de tramos)', f'{GI["total"]} min · {hm(GI["total"])}', VIO, VIO)
    + kcard('Comparativo semana anterior', f'{sgn(GI["total"] - PUB["g_total"])} min', GMID, GDK)
    + kcard('Total de camiones', fmtn(GI['ops']), GDK, GDK) + '</div>'
    + key(f'La descarga sigue siendo el tramo más largo ({GI["desc"]} min): la volcable 1 estuvo demorada el jueves 24 y parada el 28 y 29/09. En octubre, con pocos camiones ({gc["oct"]["n"]}), el girasol pasó más rápido (Playa 1 {gc["oct"]["p1"]} y descarga {gc["oct"]["descarga"]} min).'),
    f'Girasol R5+R6, suma de tramos: ingreso {GI["ing"]}, Playa 1 {GI["p1"]}, pesada bruta {GI["pb"]}, acceso a Playa 3 {GI["ap3"]}, Playa 3 → volcable {GI["desc"]}, tara {GI["tara"]} = {GI["total"]} min. '
    f'Los tramos de girasol salen de cámaras: cada tramo es el publicado para 17–23/09 (comité 25/09) más la variación medida por cámaras con el mismo criterio las dos semanas (Playa 1 {gc["prev"]["p1"]["mean"]}→{gc["cur"]["p1"]["mean"]}, Playa 3 → volcable {gc["prev"]["descarga"]["mean"]}→{gc["cur"]["descarga"]["mean"]}, tara {gc["prev"]["tara"]["mean"]}→{gc["cur"]["tara"]["mean"]}; {gc["cur"]["p1"]["n"]} camiones con Playa 1 medida en el período). '
    f'Operaciones por día (planilla): {", ".join(map(str, GI["dia"]))}. Volcable 1: {v1} recorridos de cámara, volcable 2: {v2}.', gap=32)
section('girasol-hist', head('Girasol · R5+R6', 'Dónde queda el período: de los tiempos más altos desde junio', VIO)
    + legend([('Tiempo total, suma de tramos (min) · rótulo = fecha del comité', VIO), (f'Promedio de la serie: {avg(GT)}', BODY)])
    + linechart(GT, VIO, 200, 500, avg(GT))
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Espera Playa 1', f'{GI["p1"]} min', GP, GDK, f'Promedio desde junio: {avg(GP)} · {rank(GP, GI["p1"], low=False)}.ª más alta')
    + ctx('Descarga (Playa 3 → volcable y tara)', f'{GI["desc"] + GI["tara"]} min', GD, VMID, f'Promedio desde junio: {avg(GD)} · {"máximo de la serie" if rank(GD, GI["desc"] + GI["tara"], low=False) == 1 else "entre las más altas"}')
    + key(f'La espera se concentró a fines de septiembre, con la volcable 1 demorada y parada. ') + '</div>',
    f'Girasol R5+R6, tiempo total por comité como suma de medias de tramo. Este período {GI["total"]} min ({rank(GT, GI["total"], low=False)}.º más alto de la serie); máximo 430 (punto 4/9). El 24–30/09 solo había dado 477. Volcable 1 Ricardone: 4 y 0 descargas el 28 y 29/09 (mediana 46–48); la volcable 2 la cubrió el 28 (31 contra 2) y Kepler 2 el 29 (23).', gap=24)

# ------------------------------------------------------------------ líquidos (como en la versión con líquidos del 24–30/09)
divider('div-liquidos', '04', 'Líquidos', 'Aceites, borras y glicerina: movimientos, tiempos y circuitos del período.', BLU, '#A9C8E6')
lq_dia, lq_dia_prev = per_day(LIQX['camiones']), PUB['liq'] / PREV_DAYS
def lbox(lab, big, sub, band, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:80px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:26px; color:{BODY}">{sub}</p></div>'
x7 = X['extras2430']['liquidos']
n7, n4 = x7['camiones'], LIQX['camiones'] - x7['camiones']
section('liq-resumen', head('Líquidos', 'Resumen del período: líquidos', BLU)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + lbox('Movimientos', fmtn(LIQX['camiones']), f'{LIQX["ingresos"]} ingresos · {LIQX["egresos"]} egresos', BMID, BLU)
    + lbox('Tiempo medio', f'{LIQX["media"]} min', f'puerta a puerta · {hm(LIQX["media"])}', BMID, BLU)
    + lbox('Movimientos por día', round(lq_dia), f'en los {N} días del período', VMID, VIO)
    + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + note(round(n7 / 7), f'movimientos por día del 24 al 30/09 ({fmtn(n7)} en 7 días).', BMID, BLU)
    + note(round(n4 / 4), f'movimientos por día del 1 al 4/10 ({fmtn(n4)} en 4 días).', GLT)
    + '</div>'
    + key(f'En octubre el ritmo bajó a {round(n4 / 4)} movimientos por día, contra {round(n7 / 7)} de fines de septiembre; el sábado 3 y el domingo 4 fueron los días más flojos.'),
    f'{LIQX["camiones"]} movimientos de líquidos en {N} días: Ricardone y Terminal; ingresos y egresos; movimientos con circuito líquido resuelto (R8, SL1, SL2, SL3), sin agua; día operativo del ingreso (desde las 22 h). '
    'Renopack no se cuenta: no tiene cámaras instaladas. Por producto: ' + ', '.join(f'{k.lower()} {v}' for k, v in sorted(LIQX['porProducto'].items(), key=lambda kv: -kv[1])) + '. '
    f'Tiempo medio puerta a puerta: ingreso → salida de cada movimiento.', gap=28)
lq_top3 = sum(LIQX['dia'][iD[d]] for d in ('2026-09-28', '2026-09-29', '2026-09-30'))
ilq = max(range(N), key=lambda i: LIQX['dia'][i])
lbars = daybars(LIQX['dia'], days, lambda i, v: BLU if i in (iD['2026-09-28'], iD['2026-09-29'], iD['2026-09-30']) else '#A9C8E6', 380, 64)
section('liq-dias', head('Líquidos', 'La actividad se concentró del lunes 28 al miércoles 30', BLU)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + f'<p style="font-size:24px; color:{BODY}">Movimientos por día</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{lbars}</div></div>'
    + '<div style="width:440px; display:flex; flex-direction:column; justify-content:center; gap:20px">'
    + note(lq_top3, 'movimientos del lunes 28 al miércoles 30', BLU, BLU)
    + note(f'{round(lq_top3 / LIQX["camiones"] * 100)} %', 'del volumen del período en esos tres días', BMID)
    + note(LIQX['dia'][ilq], f'el {full[ilq]}, el día de mayor movimiento', GLT)
    + '</div></div>',
    'Movimientos de líquidos por día operativo del ingreso (planilla): ' + ', '.join(f'{days[i].lower()} {LIQX["dia"][i]}' for i in range(N)) + '. Mismo criterio que la lámina anterior (sin Renopack).', gap=28)
pc = LIQX['porCircuito']
PCM = LIQX['porCircuitoMov']
cmv = lambda c, lugar: ' · '.join([lugar] + [f'{PCM[c][k]} {t}' for k, t in (('carga', 'cargas'), ('descarga', 'descargas')) if PCM[c][k]])
LQC = [('SL1', 'Recepción OSL', cmv('SL1', 'Terminal')), ('R8', 'Recepción líquida', cmv('R8', 'Ricardone')), ('SL2', 'Aceite PTO', cmv('SL2', 'Puerto')), ('SL3', 'Otros líquidos SL', cmv('SL3', 'San Lorenzo'))]
mxc_ = max(pc.values())
crow = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><div style="width:380px; display:flex; flex-direction:column; gap:2px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{c} · {lab}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div><div style="width:{max(8, round(pc.get(c, 0) / mxc_ * 620))}px; height:52px; background:{BLU if i == 0 else BMID if i < 2 else "#A9C8E6"}; border-radius:0px 8px 8px 0px"></div><p style="font-size:30px; font-weight:600; color:{TEXT}; white-space:nowrap">{pc.get(c, 0)} · {round(pc.get(c, 0) / LIQX["camiones"] * 100)} %</p></div>' for i, (c, lab, sub) in enumerate(LQC))
section('liq-circuitos', head('Líquidos', f'Los movimientos se concentraron en SL1 y R8', BLU)
    + f'<p style="font-size:24px; color:{BODY}">Movimientos de líquidos por circuito</p><div style="display:flex; flex-direction:column; gap:22px">{crow}</div>'
    + key(f'SL1 reunió {pc.get("SL1", 0)} movimientos, el {round(pc.get("SL1", 0) / LIQX["camiones"] * 100)} % del total; con R8 suman {pc.get("SL1", 0) + pc.get("R8", 0)} de {LIQX["camiones"]}. '),
    f'Los mismos {LIQX["camiones"]} movimientos de la lámina de resumen, agrupados por circuito. Solo se cuentan los movimientos con circuito resuelto.', gap=32)
S1, R8L = LT['circuitos']['SL1'], LT['circuitos']['R8']
CZ = X['sl1Calada']; SM = X['sl1Mov']
tl = S1['tramos']
vl = [t['media'] for t in tl]
s1_sum = sum(vl)
big = max(tl, key=lambda t: t['media'])
section('liq-tramos', head('Líquidos · SL1', 'SL1, el circuito con más movimiento: tiempos por tramo', BLU)
    + tramos([('Calada', 'Ingreso SLZ → Calada'), ('Pesaje', 'Calada → Balanza ingreso'), ('Espera de carga', 'Balanza ingreso → Carga OSL'), ('Salida', 'Carga OSL → Egreso')],
             vl, [BXLT, BMID, BLU, '#A9C8E6'], [TEXT, TEXT, BLU, TEXT],
             [('b', 0, 4, f'Terminal San Lorenzo · {s1_sum} min ({hm(s1_sum)})', BMID, BLU)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Cargas · E (egreso)', f'{S1["operaciones"]} · {S1["puertaAPuerta"]["media"]} min', BLU, BLU)
    + kcard('Espera de carga', f'{big["media"]} min', BMID, BLU)
    + kcard('Cargas que pasaron por calada', f'{CZ["sl"]["n"]} de {S1["operaciones"]}', GREY, TEXT) + '</div>'
    + key(f'Los {pc.get("SL1", 0)} movimientos de SL1 son cargas (E) de aceite y borras. La espera entre la balanza de entrada y la carga se lleva {big["media"]} de los {s1_sum} min: es el tramo a atacar.'),
    f'SL1 = egresos de aceite de la Terminal de Embarque (planilla, {S1["operaciones"]} operaciones del 24/09 al 04/10). Tramos medidos con cámaras pegadas a cada operación de la planilla por patente y horario (desde 1 h antes del ingreso hasta 1 h después de la salida): '
    + '; '.join(f'{t["desde"]} → {t["hasta"]}: media {t["media"]} min, {t["n"]} operaciones' for t in tl) + '. '
    f'Puerta a puerta: media {S1["puertaAPuerta"]["media"]} min. Cámaras: SLZIngCamFrente, SLZCalado, SLZBalIngFte, RenCargFte/RenDescFte, SLZSalidaC1Fte/C2Fte. '
    f'En la planilla E = egreso = carga, I = ingreso = descarga. SL1: {PCM["SL1"]["carga"]} cargas (' + ', '.join(f'{k.lower()} {v}' for k, v in SM['carga']['productos'].items()) + f') y {PCM["SL1"]["descarga"]} descargas; el agua industrial que se descarga en el mismo punto no se cuenta como líquido. '
    f'Calada: {CZ["sl"]["n"]} cargas con paso por la calada de San Lorenzo (SLZCalado), media puerta a puerta {CZ["sl"]["p2p"]["media"]} min; {CZ["sinLectura"]["n"]} sin paso por calada, media {CZ["sinLectura"]["p2p"]["media"]} min (script sl1-calada.cjs). '
    f'R8 ({R8L["operaciones"]} operaciones): puerta a puerta media {R8L["puertaAPuerta"]["media"]} min; sus tramos tienen muy pocas lecturas por punto y no se publican. Script: scripts/estado-planta/liquidos-tramos.cjs.', gap=32)

# ------------------------------------------------------------------ sectores
divider('div-sectores', '05', 'Sectores', 'Calada, volcables y silos: dónde se concentró la actividad del período.', GDK, GLT)
calles = sorted([(f'Calle {k[-1]}', v) for k, v in CAL['porCalle'].items()] + [(f'Calle {n}', 0) for n in '123456' if f'RicCal0{n}' not in CAL['porCalle']], key=lambda x: -x[1])
ccol = [GDK, GDK, GLT, GLT, GXLT, GXLT]
crows = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:140px; font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="width:{max(6, round(b / calles[0][1] * 560))}px; height:48px; background:{ccol[i]}; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(b)}</p></div>' for i, (a, b) in enumerate(calles))
def occ(a, sub, pc_, col): return f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div><p style="font-size:44px; font-weight:600; color:{col}">{pc_} %</p></div>'
p34 = round(c34 / calles_tot * 100)
cal_dia, cal_dia_prev = per_day(CAL['camiones']), PUB['cal'] / PREV_DAYS
c12 = [d for d in DAYS if CAL['calleDia'][d].get('RicCal01', 0) or CAL['calleDia'][d].get('RicCal02', 0)]
section('calada', head('Sectores · calada', f'Calada con menos recorridos por día: las calles 3 y 4 hicieron el {p34} %')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · recorridos de cámara por calle ({calles_tot - CAL["camiones"]} pasaron por dos)</p><div style="display:flex; flex-direction:column; gap:20px">{crows}</div></div>'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Horas con actividad, sobre {HOURS}</p><div style="display:flex; flex-direction:column; gap:16px">'
    + occ('Ricardone sólida', f'{fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h', round(CAL['horas'] / HOURS * 100), GDK)
    + occ('Ricardone líquida', f'{fmtn(LIQ["camiones"])} recorridos en {LIQ["horas"]} h', round(LIQ['horas'] / HOURS * 100), VMID)
    + occ('San Lorenzo', f'{fmtn(CSL["camiones"])} recorridos en {CSL["horas"]} h', round(CSL['horas'] / HOURS * 100), VMID) + '</div></div></div>'
    + key(f'{fmtn(cal_dia)} recorridos por día, contra {fmtn(cal_dia_prev)} la semana anterior ({round((1 - cal_dia / cal_dia_prev) * 100)} % menos). Las calles 1 y 2 abrieron solo el {" y el ".join(full[iD[d]] for d in c12)}; el resto del período la calada trabajó con la 3 y la 4.'),
    f'Calada por calle, período completo: ' + ', '.join(f'{a.lower()} {b}' for a, b in calles) + f'. Suman {fmtn(calles_tot)}, no {fmtn(CAL["camiones"])}, porque algunos recorridos pasaron por dos calles. Horas = horas con al menos una lectura, sobre {HOURS} ({N} días). '
    f'Por día: {", ".join(map(str, CAL["porDia"]))}. Pico: {CAL["pico"]} recorridos ({CAL["picoLabel"]}). Calada líquida {fmtn(LIQ["camiones"])} en {LIQ["horas"]} h (semana anterior 290 en 69 h; por día {", ".join(map(str, LIQ["porDia"]))}): cuenta también los camiones del transile, que entran por la calle líquida rumbo a Playa 3.', gap=28)
vrows_order = sorted(VOL, key=lambda k: -sum(VOL[k]))
mxv = max(sum(v) for v in VOL.values())
def cell(v):
    if v >= 20: return f'<div style="width:44px; height:52px; background:{GMID}; border-radius:10px"></div>'
    if v > 0: return f'<div style="width:44px; height:52px; background:{GXLT}; border:3px solid {GLT}; border-radius:10px"></div>'
    return f'<div style="width:44px; height:52px; border:3px dashed {LINE}; border-radius:10px"></div>'
dini = [DOW[wd(d)][:2] for d in DAYS]
rows = f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:24px; color:{BODY}"></p><p style="width:520px; font-size:24px; font-weight:600; color:{BODY}">Camiones en el período</p>' + ''.join(f'<p style="width:44px; font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in dini) + f'<p style="flex:1; font-size:24px; font-weight:600; text-align:right; color:{BODY}">Días</p></div>'
for i, k in enumerate(vrows_order):
    tot = sum(VOL[k]); top_ = i == 0
    bcol = VIO if top_ else GMID
    rows += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:32px; font-weight:600; color:{TEXT}">{k}</p><div style="width:520px; display:flex; flex-direction:row; align-items:center; gap:16px"><div style="width:{max(10, round(tot / mxv * 330))}px; height:52px; background:{bcol}; border-radius:0px 8px 8px 0px"></div><p style="font-size:30px; font-weight:600; color:{VIO if top_ else TEXT}; white-space:nowrap">{fmtn(tot)} · {round(tot / VOL_TOT * 100)} %</p></div>'
             + ''.join((f'<div style="width:44px; height:52px; background:{VIO}; border-radius:10px"></div>' if (top_ and v >= 20) else cell(v)) for v in VOL[k])
             + f'<p style="flex:1; font-size:32px; font-weight:600; text-align:right; color:{VIO if top_ else TEXT}">{sum(1 for v in VOL[k] if v >= 20)}</p></div>')
section('volcables', head('Sectores · volcables puerto', 'La volcable 5 sostuvo el período', VIO)
    + f'<div style="display:flex; flex-direction:column; gap:18px">{rows}</div>'
    + legend([('Operó (20 camiones o más)', GMID), ('Actividad mínima', GXLT)])
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p(f'V5 trabajó todos los días y tomó el <b>{v5share} %</b> ({fmtn(sum(VOL["V5"]))} de {fmtn(VOL_TOT)}). Del 2 al 4/10 descargó casi sola; el 01/10 la acompañaron V2 y V4.', 28, BODY, '; flex:1')
    + '<div style="flex:1">' + key('El lunes 28 la PV2 no descargó (preventivo en su compresor) y la PV4 la cubrió; el miércoles 30 quedó sin descargar la PV3, en la parada anual de la cinta C01 de la Terminal. V5 sostuvo esos días y todo octubre.') + '</div></div>',
    f'Descargas de soja R7 por volcable en el puerto de San Lorenzo, {LBL}. Barra = total del período y participación. Cuadros = días del período; lleno = 20 camiones o más, claro = entre 1 y 19, vacío = sin camiones. Por día: '
    + '; '.join(f'{k} ' + '/'.join(map(str, VOL[k])) for k in vrows_order) + '. Camiones = recorridos de cámara, por día calendario, con la calle que declara la planilla (mismo criterio que el comité anterior, 1.401); el transile R29 no entra en este conteo. Mantenimiento: fechas programadas de las OT del EAM hasta el 29/09, sin horas de parada.', gap=24)
VH = X['volcablesHistorico']['meses']
MES = {'2026-08': 'Agosto', '2026-09': 'Septiembre'}
VA, VS = VH['2026-08']['volcables'], VH['2026-09']['volcables']
MC = {'2026-08': BMID, '2026-09': BLU}
tot2 = VH['2026-08']['total'] + VH['2026-09']['total']
vtot = {k: VA[k]['descargas'] + VS[k]['descargas'] for k in VA}
vshare = {k: round(vtot[k] / tot2 * 100) for k in VA}
mx2 = max(vtot.values())
VW = 1180
def vrow(k):
    seg = ''
    for mk, V in (('2026-08', VA), ('2026-09', VS)):
        w = round(V[k]['descargas'] / mx2 * VW)
        seg += (f'<div style="width:{w}px; height:64px; background:{MC[mk]}; display:flex; flex-direction:row; align-items:center; justify-content:center; border-right:3px solid {BG}">'
                f'<p style="font-size:26px; font-weight:700; color:#FFFFFF; white-space:nowrap">{fmtn(V[k]["descargas"])}</p></div>')
    return (f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:72px; font-size:34px; font-weight:600; color:{TEXT}">{k}</p>'
            f'<div style="display:flex; flex-direction:row; border-left:2px solid {TEXT}">{seg}</div>'
            f'<p style="font-size:36px; font-weight:700; color:{VIO if k == max(vshare, key=vshare.get) else TEXT}; white-space:nowrap">{vshare[k]} %</p></div>')
vh_rows = ''.join(vrow(k) for k in ['V1', 'V2', 'V3', 'V4', 'V5'])
pel_s = VS['V4']['pellet']
top_v = max(vshare, key=vshare.get); low_v = min(vshare, key=vshare.get)
section('volcables-hist', head('Sectores · volcables puerto', f'Agosto y septiembre: la {top_v} fue la más usada', VIO)
    + f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">{legend([("Agosto", MC["2026-08"]), ("Septiembre", MC["2026-09"])])}<p style="font-size:24px; color:{BODY}">Descargas por volcable · % = participación en los dos meses</p></div>'
    + f'<div style="display:flex; flex-direction:column; gap:26px">{vh_rows}</div>'
    + key(f'La {top_v} se llevó el {vshare[top_v]} % de las descargas y la {low_v}, el {vshare[low_v]} %. La V3 cayó de {fmtn(VA["V3"]["descargas"])} a {fmtn(VS["V3"]["descargas"])}; la V4 es la volcable del pellet ({round(pel_s / VS["V4"]["descargas"] * 100)} % de lo que descargó en septiembre).'),
    'Uso de cada volcable del puerto según la planilla de movimientos (plataforma VOLCABLE PTO 1 a 5 de la Terminal: soja R7 y la pata de puerto del pellet), sin patentes ficticias, por día operativo del ingreso. '
    f'Agosto {fmtn(VH["2026-08"]["total"])} descargas, septiembre {fmtn(VH["2026-09"]["total"])}; % = descargas de la volcable en los dos meses sobre {fmtn(tot2)}. '
    + ' '.join(f'{MES[mk]}: ' + ', '.join(f'{k} {fmtn(v["descargas"])} ({v["share"]} % del mes; soja {fmtn(v["soja"])}' + (f', pellet {fmtn(v["pellet"])}' if v['pellet'] else '') + f'; {v["diasOperando"]} días con 20 o más)' for k, v in VH[mk]['volcables'].items()) + '.' for mk in VH)
    + ' Script: scripts/estado-planta/volcables-historico.cjs.', gap=36)
sd = SIL['porDia']
sbars = daybars(R29['dia'], days, lambda i, v: GDK if v >= 50 else GLT, 380, 64)
s8 = SIL['porCalle'].get('RicS8CargaLinea2', 0); sdesc = SIL['porCalle'].get('RicS7DescLinea2', 0)
section('silos', head('Sectores · silos Ricardone', f'Silos: el transile corrió del jueves 24 al {full[R29_last]}')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Transiles de soja desde silos por día (R29)</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{sbars}</div></div>'
    + '<div style="width:480px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Jueves 24, viernes 25 y sábado 26: <b>{R29["dia"][0]}, {R29["dia"][1]} y {R29["dia"][2]} transiles</b>, todos egresos de soja de Silo Chief 2 en la planilla de movimientos.', 28)
    + p(f'En total, {R29["ops"]} transiles del jueves 24 al {full[R29_last]}, con el pico el lunes 28 ({R29["dia"][iD["2026-09-28"]]}).', 28)
    + key('En octubre los silos quedaron casi quietos: la planilla no tiene transile R29 del 1 al 4/10.') + '</div></div>',
    f'Barras = transiles R29 de la planilla por día (RICARDONE · EGRESO · SOJA · SILO_CHIEF_2): {", ".join(map(str, R29["dia"]))}. Jueves a sábado se cotejaron patente por patente: son transiles de la planilla, no lecturas sueltas de cámara. Cámaras de silos por día (carga y descarga): {", ".join(map(str, sd))}. En el período {SIL["camiones"]} recorridos (semana anterior 329). Por cámara: ' + ', '.join(f'{k} {v}' for k, v in SIL['porCalle'].items()) + f'. Operaciones R29 de la planilla: {R29["ops"]} (semana anterior 313).', bg=BG2)

# ------------------------------------------------------------------ cruces
def cx(big, title, txt, band):
    return f'<div style="display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.07); border:1px solid rgba(241,246,242,0.18); border-top:6px solid {band}; border-radius:16px; padding:24px 28px"><p style="font-size:48px; font-weight:600; line-height:1; color:#F1F6F2">{big}</p><h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{band}">{title}</h3><p style="font-size:24px; line-height:1.4; color:#D6E4DA">{txt}</p></div>'
add('cruces', f'<section id="cruces" data-transition="fade" style="background:{VIO}; color:#F1F6F2; font-family:{FONT}; padding:96px 128px 96px; display:flex; flex-direction:column; gap:28px"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, #2E1B4E 0%, #1F3A38 60%, #0B5638 100%)"></div>'
    f'<div style="display:flex; flex-direction:column; gap:12px"><p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Cierre · análisis general</p><h2 style="font-size:72px; font-weight:600; line-height:1.1; color:#F1F6F2">El período en seis lecturas</h2></div>'
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cx(f'{R7["total"]} min', 'La soja, en su mejor tiempo', f'Puerta a puerta de {N} días por debajo de todo lo visto desde junio (mínimo previo 276).', GLT)
    + cx(f'{R7["p1"]} min', 'Ricardone sostuvo la mejora', f'Playa 1 en su mínimo desde junio (antes 87). San Lorenzo, en {R7["slz"]} min, quedó en su nivel.', GLT)
    + cx(f'{p34} %', 'Calada en dos calles', f'Las calles 3 y 4 hicieron el {p34} %; la 1 y la 2 abrieron solo el lunes 28 y el martes 29.', GLT)
    + cx(f'{GI["total"]} min', 'Girasol, con más espera', f'Playa 1 en {GI["p1"]} y Playa 3 → volcable en {GI["desc"]} min: la volcable 1 estuvo demorada el jueves 24 y parada el 28 y 29.', '#B9A8E0')
    + cx(f'{fmtn(LIQX["camiones"])}', 'Líquidos, en SL1 y R8', f'SL1 y R8 hicieron el {round((pc.get("SL1", 0) + pc.get("R8", 0)) / LIQX["camiones"] * 100)} %; el pico, del lunes 28 al miércoles 30.', '#B9A8E0')
    + cx('Lun 28', 'El día para revisar', f'Más soja del período ({R7["dia"][i28]}), PV2 del puerto y volcable 1 de Ricardone sin descargar, San Lorenzo en {R7["slzDia"][i28]} min.', '#B9A8E0')
    + f'</div><div style="flex:1"></div><div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center"><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:180px; height:96px; object-fit:contain"><p style="font-size:24px; color:#C9D8CE">Comité de Logística Nodo Sur · {LBL}</p><img src="{BTZ_L}" alt="Bimtrazer" style="width:170px; height:80px; object-fit:contain"></div>'
    f'<aside>Lecturas para discutir en comité; no son conclusiones cerradas. Período de {N} días (24/09–04/10). Ricardone (ingreso + Playa 1 + egreso): {PUB["ric"]}→{R7["ric"]}. San Lorenzo (Playa OSL + descarga + salida): {PUB["slz"]}→{R7["slz"]}. Pellet: {PL["viajes"]} viajes en {len(X["pelletTandas"])} tandas. Transile R29: {R29["ops"]} operaciones, del 24 al 29/09.</aside></section>')

# ------------------------------------------------------------------ write
ORDER = ['portada', 'resumen-planta', 'dia-a-dia', 'div-soja', 'tramos-r7', 'tramos-r29', 'r29-dias', 'resumen-soja', 'hallazgo', 'plantas', 'cuartos', 'historico',
         'div-pellet', 'pellet-operativo', 'pellet-tramos', 'pellet-hist', 'pellet-propuesta', 'pellet-camionero', 'pellet-15h', 'pellet-hora', 'pellet-top10', 'div-girasol', 'girasol', 'girasol-hist',
         'div-liquidos', 'liq-resumen', 'liq-dias', 'liq-circuitos', 'liq-tramos', 'div-sectores', 'calada', 'volcables', 'volcables-hist', 'silos', 'cruces']
slides = sorted(slides, key=lambda x: ORDER.index(x[0]))
assert [i for i, _ in slides] == ORDER
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
print(json.dumps({'R7': R7, 'R29': R29, 'GI': {k: v for k, v in GI.items() if k != 'cam'}, 'QN': QN, 'pct': pct, 'CAL': [CAL['camiones'], CAL['horas'], CAL['porCalle']], 'VOL': VOL, 'adentro': [ricA, slA, totA],
                  'pellet': pt, 'liq': LIQX, 'ranks': {'tot': rk_tot, 'p1': rk_p1, 'sl': rk_sl}, 'avg': {'tot': avg(TOT), 'p1': avg(P1), 'slz': avg(SLZ)}}, ensure_ascii=False))
