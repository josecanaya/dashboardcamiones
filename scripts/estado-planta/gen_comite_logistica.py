"""Comité de Logística Nodo Sur — semana sin Excel de movimientos (solo cámaras).

Uso: python scripts/estado-planta/gen_comite_logistica.py <carpeta>
  <carpeta> contiene metricas-camaras.json (metricas-camaras.cjs) y sectores-etl.json (sectores-etl.cjs)
  y los paquetes por subventana pkg_*.json (actividad del dashboard).
Réplica de la maqueta del comité 17–23/09 (artifact JQMuUJEUApHwqAVYdPrQL5) con las cifras nuevas.

Criterio (semana sin Excel):
- Cantidades: operaciones de la semana anterior (Excel) × variación de camiones leídos por cámara,
  con la misma regla las dos semanas.
- Tiempos R7 y girasol: valor publicado la semana anterior + variación medida por cámara (mismo método
  las dos semanas). Transile R29: medido directo por cámara (con Excel ya coincidía con lo publicado).
- Sectores (calada, volcables, silos): tablas de cámara del ETL, igual que siempre.
"""
import json, os, sys, datetime
D = os.path.abspath(sys.argv[1])
M = json.load(open(os.path.join(D, 'metricas-camaras.json'), encoding='utf-8'))
SE = json.load(open(os.path.join(D, 'sectores-etl.json'), encoding='utf-8'))
PK = [json.load(open(os.path.join(D, f), encoding='utf-8'))['actividad'] for f in sorted(os.listdir(D)) if f.startswith('pkg_')]
OUT = os.path.join(D, 'deck')
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)

LBL = '24–30/09'
days = ['Jue 24', 'Vie 25', 'Sáb 26', 'Dom 27', 'Lun 28', 'Mar 29', 'Mié 30']
ini = ['J', 'V', 'S', 'D', 'L', 'M', 'M']
full = ['jueves 24', 'viernes 25', 'sábado 26', 'domingo 27', 'lunes 28', 'martes 29', 'miércoles 30']

GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'; G2='#1F7A4D'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'; GREY='#B7C3BB'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'; VXLT='#A99BCF'
FONT="'IBM Plex Sans', Arial, sans-serif"
NVA_G='/_blob/2c1166d4fbf2fbec7430398abf6b0e3b'; NVA_L='/_blob/18aa8ca0d589832dda48c77f1ed28a0b'
BTZ='/_blob/916ea0722fd539b2369ca6413631c60d'; BTZ_L='/_blob/0e7d769a3aba86ad2cd768091719225b'
AER_RIC='/_blob/d87935e062f6db2ad585a52b0b30e02f'; AER_SL='/_blob/b2b7b4c6595ee63172090f5ac4fd588e'

fmtn = lambda v: f'{round(v):,}'.replace(',', '.')
def hm(m): return f'{m // 60} h {m % 60} m'
def sgn(d): return f'+{d}' if d > 0 else (f'−{abs(d)}' if d < 0 else '0')

# ------------------------------------------------------------------ datos
C, Cp = M['circuitos']['cur'], M['circuitos']['prev']
t = lambda c, k: c['tiempos'][k]['mean']
# Publicado en el comité anterior (17–23/09, Excel-first)
PUB = dict(r7_ops=1370, r29_ops=313, gir_ops=313, gir_cam=286, total=303, ing=4, p1=89, sal=12, inter=16, osl=116, desc=50, egr=18,
           ric=104, slz=184, g_ing=3, g_p1=78, g_pb=13, g_ap3=10, g_desc=105, g_tara=19, g_total=228)
# soja R7: publicado + variación de cámaras
d_tot = t(C['r7'], 'total') - t(Cp['r7'], 'total')
R7 = dict(ing=PUB['ing'], p1=PUB['p1'] + t(C['r7'], 'p1') - t(Cp['r7'], 'p1'), sal=PUB['sal'] + t(C['r7'], 'calEgr') - t(Cp['r7'], 'calEgr'),
          inter=PUB['inter'] + t(C['r7'], 'puente') - t(Cp['r7'], 'puente'), desc=PUB['desc'] + t(C['r7'], 'balVolc') - t(Cp['r7'], 'balVolc'),
          egr=PUB['egr'] + t(C['r7'], 'volcSal') - t(Cp['r7'], 'volcSal'))
egrVolc = PUB['inter'] + PUB['osl'] + PUB['desc'] + t(C['r7'], 'egrVolc') - t(Cp['r7'], 'egrVolc')
R7['osl'] = egrVolc - R7['inter'] - R7['desc']
R7['total'] = PUB['total'] + d_tot
R7['ric'] = R7['ing'] + R7['p1'] + R7['sal']
R7['slz'] = R7['osl'] + R7['desc'] + R7['egr']
ratio_r7 = C['r7']['total'] / Cp['r7']['total']
R7['ops'] = round(PUB['r7_ops'] * ratio_r7)
f = R7['ops'] / C['r7']['total']
R7['dia'] = [round(x * f) for x in C['r7']['porDia']]
R7['dia'][max(range(7), key=lambda i: R7['dia'][i])] += R7['ops'] - sum(R7['dia'])
off_tot = PUB['total'] - t(Cp['r7'], 'total')
off_ric = PUB['ric'] - t(Cp['r7'], 'ric')
slz_prev = t(Cp['r7'], 'egrVolc') + t(Cp['r7'], 'volcSal') - t(Cp['r7'], 'puente')
off_slz = PUB['slz'] - slz_prev
td = C['r7']['tiemposDia']
R7['totDia'] = [d['total'] + off_tot for d in td]
R7['ricDia'] = [d['ric'] + off_ric for d in td]
R7['slzDia'] = [d['egrVolc'] + d['volcSal'] - (d['puente'] or t(C['r7'], 'puente')) + off_slz for d in td]
# cuartos: participación publicada + variación de cámaras
def qshare(c):
    tot = sum(sum(v) for v in c['r7']['cuartos'].values())
    return {q: sum(v) / tot for q, v in c['r7']['cuartos'].items()}
PUBQ = {'Q1': 492 / 1370, 'Q2': 277 / 1370, 'Q3': 306 / 1370, 'Q4': 295 / 1370}
qc, qp = qshare(C), qshare(Cp)
sh = {q: max(0.01, PUBQ[q] + qc[q] - qp[q]) for q in PUBQ}
s = sum(sh.values()); sh = {q: v / s for q, v in sh.items()}
QN = {q: round(sh[q] * R7['ops']) for q in sh}
QN['Q1'] += R7['ops'] - sum(QN.values())
qd = {}
for q in QN:
    raw = C['r7']['cuartos'][q]; fq = QN[q] / max(1, sum(raw))
    qd[q] = [round(x * fq) for x in raw]
# ajustar para que cada día sume lo mismo que R7['dia'] aproximadamente (se respeta el total por cuarto)
# transile R29: medido
r = C['r29']['tiempos']
R29 = dict(preLiq=r['preLiq']['mean'], liqP3=r['liqP3']['mean'], p3Silo=r['p3Silo']['mean'], siloBal=r['siloBal']['mean'], balCal=r['balCal']['mean'],
           calEgr=r['calEgr']['mean'], puente=r['puente']['mean'], osl=r['osl']['mean'], balVolc=r['balVolc']['mean'], volcSal=r['volcSal']['mean'])
R29['ric'] = R29['preLiq'] + R29['liqP3'] + R29['p3Silo'] + R29['siloBal'] + R29['balCal'] + R29['calEgr']
R29['slz'] = R29['osl'] + R29['balVolc'] + R29['volcSal']
R29['ciclo'] = R29['ric'] + R29['puente'] + R29['slz']
R29['ops'] = round(PUB['r29_ops'] * C['r29']['total'] / Cp['r29']['total'])
f29 = R29['ops'] / C['r29']['total']
R29['dia'] = [round(x * f29) for x in C['r29']['porDia']]
R29['dia'][max(range(7), key=lambda i: R29['dia'][i])] += R29['ops'] - sum(R29['dia'])
R29['nCam'] = len(set())  # no se usa
# girasol: publicado + variación
g, gp = C['gir']['tiempos'], Cp['gir']['tiempos']
GI = dict(ing=PUB['g_ing'], p1=PUB['g_p1'] + g['p1']['mean'] - gp['p1']['mean'], pb=PUB['g_pb'], ap3=PUB['g_ap3'] + 2,
          desc=PUB['g_desc'] + g['descarga']['mean'] - gp['descarga']['mean'], tara=PUB['g_tara'] + g['tara']['mean'] - gp['tara']['mean'])
GI['total'] = sum(GI[k] for k in ('ing', 'p1', 'pb', 'ap3', 'desc', 'tara'))
# sectores (paquete del dashboard, por subventana)
def act(key):
    out = {'camiones': 0, 'horas': 0, 'pico': 0, 'picoLabel': '', 'porCalle': {}, 'dia': {}}
    for a in PK:
        x = a[key]; pe = x['periodo']
        out['camiones'] += pe['camiones']; out['horas'] += pe['horasConActividad']
        if pe['picoCamiones'] > out['pico']: out['pico'], out['picoLabel'] = pe['picoCamiones'], pe['picoLabel']
        for c in pe['porCalle']: out['porCalle'][c['camara']] = out['porCalle'].get(c['camara'], 0) + c['camiones']
        for d, v in x.get('porDia', {}).items(): out['dia'][d] = v['camiones']
    out['porDia'] = [out['dia'].get(d, 0) for d in M['semanas']['cur']]
    return out
CAL = act('calada_ricardone'); LIQ = act('calada_ricardone_liquidos'); CSL = act('calada_san_lorenzo')
VR = act('volcable_ricardone'); SIL = act('silos_ricardone')
VS = SE[1]['san_lorenzo_volcable_events']; VSp = SE[0]['san_lorenzo_volcable_events']
VOL = {k.replace('Volcable ', 'V'): v for k, v in VS['porCamara'].items()}
VOL_TOT = sum(sum(v) for v in VOL.values())
GI['ops'] = round(PUB['gir_ops'] * VR['camiones'] / 363)
GI['dia'] = VR['porDia'][:]
fg = GI['ops'] / max(1, sum(GI['dia'])); GI['dia'] = [round(x * fg) for x in GI['dia']]
GI['dia'][max(range(7), key=lambda i: GI['dia'][i])] += GI['ops'] - sum(GI['dia'])
v1, v2 = VR['porCalle'].get('RicVolcable1', 0), VR['porCalle'].get('RicVolcable2', 0)

# ------------------------------------------------------------------ Excel (si llegó la planilla)
# Con `paquete_excel.json` (paquete del dashboard sobre las corridas reprocesadas con Excel) las cifras
# oficiales reemplazan a las estimaciones por cámaras, con el mismo criterio que el comité anterior.
EXCEL = os.path.exists(os.path.join(D, 'paquete_excel.json'))
if EXCEL:
    PX = json.load(open(os.path.join(D, 'paquete_excel.json'), encoding='utf-8'))
    XX = json.load(open(os.path.join(D, 'excel_extra.json'), encoding='utf-8'))
    sj = PX['tiempos']['soja']; pe = sj['periodo']; trm = {x['key']: round(x['mediaMin']) for x in pe['tramos'] if x['mediaMin'] is not None}
    R7.update(ing=trm['INGRESO→PREINGRESO'], p1=trm['PREINGRESO→CALADA'], sal=trm['CALADA→EGRESO'], inter=trm['EGRESO→SL_INGRESO'],
              osl=trm['SL_INGRESO→SL_BALANZA_INGRESO'], desc=trm['SL_BALANZA_INGRESO→SL_VOLCABLE'], egr=trm['SL_VOLCABLE→SL_EGRESO'],
              total=round(pe['tiempoMedioMin']), ops=pe['camiones'])
    R7['ric'] = R7['ing'] + R7['p1'] + R7['sal']; R7['slz'] = R7['osl'] + R7['desc'] + R7['egr']
    dd = [sj['porDia'].get(d, {}) for d in M['semanas']['cur']]
    R7['dia'] = [x.get('camiones', 0) for x in dd]
    R7['totDia'] = [round(x.get('tiempoMedioMin') or 0) for x in dd]
    R7['ricDia'] = [round(x.get('ricMediaMin') or 0) for x in dd]
    R7['slzDia'] = [round(x.get('slMediaMin') or 0) for x in dd]
    QN = dict(pe['porCuarto'])
    qd = {q: [x.get('porCuarto', {}).get(q, 0) for x in dd] for q in QN}
    ct = {c['code']: c['count'] for c in PX['ejecutivo']['circuitosTotales']}
    R29['ops'] = ct.get('R29', R29['ops'])
    R29['dia'] = XX['r29_dia']
    gs = PX['tiempos']['girasol']
    GI['ops'] = gs['operaciones']; GI['dia'] = [gs['porDia'].get(d, {}).get('camiones', 0) for d in M['semanas']['cur']]
    gpp = {c['code']: c['count'] for c in PX['ejecutivo']['circuitosPorProducto'].get('GIRASOL', [])}
    GI['r5'] = gpp.get('R5', 0); GI['r6'] = gpp.get('R6', 0); GI['r4'] = gpp.get('R4', 0)
    vs = PX['actividad']['volcable_san_lorenzo']
    VOL = {f'V{n}': [0] * 7 for n in range(1, 6)}
    for i, d in enumerate(M['semanas']['cur']):
        for c in vs['porDia'].get(d, {}).get('porCalle', []): VOL['V' + c['camara'][-1]][i] = c['camiones']
    VOL_TOT = vs['periodo']['camiones']
    LIQX = XX['liquidos']; PELX = XX['pellet']; GIR_MED = XX['girasol_p2p_excel_mediana']

# series de comités (rótulo = fecha del comité) + esta semana (comité 02/10)
weeks = ['17/6', '24/6', '8/7', '15/7', '24/7', '30/7', '7/8', '13/8', '21/8', '28/8', '4/9', '11/9', '18/9', '25/9', '2/10']
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

# ------------------------------------------------------------------ helpers de maqueta
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
    mx = max(vals) or 1; out = ''
    for i, v in enumerate(vals):
        x = 9 + i * 49; hgt = round(v / mx * 52)
        if v == 0: out += f'<rect x="{x}" y="66" width="30" height="2" fill="{LINE}"/>'
        else: out += f'<rect x="{x}" y="{68 - hgt}" width="30" height="{max(3, hgt)}" rx="4" fill="{dark if v == mx else light}"/>'
        out += f'<text x="{x + 15}" y="96" text-anchor="middle" font-size="24" fill="{BODY}" font-family="IBM Plex Sans, Arial, sans-serif">{ini[i]}</text>'
    return f'<svg aria-label="Camiones por día, jueves a miércoles" viewBox="0 0 342 100" width="342" height="100" style="width:342px; height:100px">{out}</svg>'

# ------------------------------------------------------------------ 1 portada
add('portada', f'<section id="portada" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:{GDK}; font-family:{FONT}; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(14,40,28,0.82); border-left:6px solid #9CCBAE; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(30,18,52,0.82); border-left:6px solid #B9A8E0; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Logística · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Logística Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">Semana del 24 al 30 de septiembre de 2026</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Logística Nodo Sur, semana 24–30/09. Datos: planilla de movimientos por contrato y lecturas de cámaras de Ricardone y del puerto.</aside></section>')

# ------------------------------------------------------------------ 2 resumen planta
def pcard(tag, tagcol, band, big, unit, line2, vals, dark, light, foot):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:22px 26px">'
            f'<p style="font-size:24px; font-weight:600; color:{tagcol}; text-transform:uppercase; letter-spacing:1px">{tag}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:10px"><p style="font-size:60px; font-weight:600; line-height:1.05; color:{tagcol}">{big}</p><p style="font-size:24px; color:{BODY}">{unit}</p></div>'
            f'<p style="font-size:24px; color:{TEXT}">{line2}</p>{minibars(vals, dark, light)}<p style="font-size:24px; line-height:1.3; color:{BODY}">{foot}</p></div>')
def strip(t1, t2): return f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; border-left:8px solid #9AA8A0; padding:4px 0px 4px 18px"><p style="font-size:24px; font-weight:600; color:{TEXT}">{t1}</p><p style="font-size:24px; color:{BODY}">{t2}</p></div>'
imx = max(range(7), key=lambda i: R7['dia'][i])
c34 = CAL['porCalle'].get('RicCal04', 0) + CAL['porCalle'].get('RicCal03', 0)
calles_tot = sum(CAL['porCalle'].values())
v5share = round(sum(VOL['V5']) / VOL_TOT * 100)
liq_peak = max(range(7), key=lambda i: LIQ['porDia'][i])
section('resumen-planta', head('Planta', 'Qué entró a la planta, cuándo y cuánto tardó', VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + pcard('Soja · R7', GDK, GMID, fmtn(R7['ops']), 'operaciones', f'<b>{R7["total"]} min</b> puerta a puerta', R7['dia'], GDK, GMID, f'{days[imx]}: el día más cargado.')
    + (pcard('Girasol · R5+R6', '#7A5608', '#E0A526', fmtn(GI['ops']), 'operaciones', f'<b>{GIR_MED // 60} h</b> en planta, mediana', GI['dia'], '#7A5608', '#E0A526', f'Volcable 1: {GI["r5"]} · volcable 2: {GI["r6"]}.')
       + pcard('Líquidos', '#1F4E7A', '#3F7FB5', fmtn(LIQX['camiones']), 'camiones', f'<b>{LIQX["media"]} min</b> puerta a puerta', LIQX['dia'], '#1F4E7A', '#3F7FB5', 'Aceites, borras y glicerina. Pico lunes a miércoles.')
       + pcard('Pellet', '#5E4428', '#9A7650', fmtn(PELX['transile']), 'viajes', f'<b>{fmtn(PELX["transile"] * 30)} t</b> al puerto', PELX['dia'], '#5E4428', '#9A7650', 'Operativo de transile, jueves a sábado y miércoles.') if EXCEL else
       pcard('Transile · R29', '#1F4E7A', '#3F7FB5', fmtn(R29['ops']), 'operaciones', f'<b>{R29["ciclo"]} min</b> de ciclo', R29['dia'], '#1F4E7A', '#3F7FB5', 'Silos → puerto, de jueves a martes.')
       + pcard('Girasol · R5+R6', '#7A5608', '#E0A526', fmtn(GI['ops']), 'operaciones', f'<b>{GI["total"]} min</b> de recorrido', GI['dia'], '#7A5608', '#E0A526', 'Más espera en Playa 1 y Playa 3.')
       + pcard('Calada líquida', '#5E4428', '#9A7650', fmtn(LIQ['camiones']), 'recorridos', f'<b>{LIQ["horas"]} h</b> con actividad', LIQ['porDia'], '#5E4428', '#9A7650', 'Incluye el paso del transile.'))
    + '</div><div style="display:flex; flex-direction:row; gap:32px">'
    + strip('Calada sólida Ricardone', f'{fmtn(CAL["camiones"])} recorridos de cámara · activa el {round(CAL["horas"] / 168 * 100)} % de las horas')
    + strip('Volcables puerto', f'{fmtn(VOL_TOT)} recorridos de cámara · ' + (f'V5 hizo el {round(sum(VOL["V5"]) / VOL_TOT * 100)} %' if EXCEL else 'V5, V3 y V4 casi parejas'))
    + strip('Silos Ricardone', (f'{fmtn(R29["ops"])} transiles de soja (R29), casi toda la semana' if EXCEL else f'{fmtn(SIL["camiones"])} recorridos · carga para el transile casi toda la semana'))
    + '</div>' + ('' if EXCEL else p('Semana sin planilla de movimientos: las operaciones se estiman con las lecturas de cámaras.', 24, BODY)),
    (f'Productos y tiempos por día operativo desde las 22 h; sectores por día calendario. Soja: {fmtn(R7["ops"])} operaciones R7 y {R7["total"]} min puerta a puerta. Girasol: {fmtn(GI["ops"])} operaciones R5+R6 (volcable 1 {GI["r5"]}, volcable 2 {GI["r6"]}; además {GI["r4"]} a silos Kepler, R4); mediana puerta a puerta de la planilla {GIR_MED} min (la media supera el tope de verosimilitud de 720 min y no se publica). '
     f'Líquidos: {LIQX["camiones"]} camiones (ingresos {LIQX["ingresos"]}, egresos {LIQX["egresos"]}), mismo criterio que la semana anterior (con él, la semana anterior da {LIQX["prev_mismo_criterio"]}); media {LIQX["media"]} min, mediana {LIQX["mediana"]}. Pellet: {PELX["egresos"]} egresos, {PELX["transile"]} transiles de pellet de girasol al puerto y {PELX["despachos"]} despachos. '
     f'Calada sólida: {fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h. Volcables puerto: {fmtn(VOL_TOT)} descargas de soja R7. Silos: {fmtn(SIL["camiones"])} recorridos; transile R29 {R29["ops"]} operaciones.') if EXCEL else
    ('Semana sin planilla de movimientos. Operaciones estimadas: las de la semana anterior (Excel: R7 1.370, R29 313, girasol 313) por la variación de camiones leídos por cámaras con la misma regla en las dos semanas '
    f'(R7 {Cp["r7"]["total"]}→{C["r7"]["total"]}, R29 {Cp["r29"]["total"]}→{C["r29"]["total"]}, volcables Ricardone 363→{VR["camiones"]}). Tiempos: valor publicado la semana anterior más la variación medida por cámaras; el transile se mide directo. '
    'Líquidos y pellet salen del Excel y no se publican esta semana: en su lugar va la calada líquida por cámara, que también cuenta los camiones del transile (entran por la calle líquida rumbo a Playa 3). '
    f'Calada sólida: {fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h. Volcables puerto: {fmtn(VOL_TOT)} recorridos, ahora con el transile incluido. Silos: {fmtn(SIL["camiones"])}.'), gap=28)

# ------------------------------------------------------------------ 3 día a día (camiones adentro)
ricA = [round(c / 24 * m / 60) for c, m in zip(CAL['porDia'], R7['ricDia'])]
volD = [sum(VOL[v][i] for v in VOL) for i in range(7)]
slA = [round(c / 24 * m / 60) for c, m in zip(volD, R7['slzDia'])]
totA = [a + b for a, b in zip(ricA, slA)]
mxA = max(totA)
cols = ''
for i in range(7):
    hs, hr = round(slA[i] / mxA * 344), round(ricA[i] / mxA * 344)
    cols += (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:end; align-items:center; gap:0px"><p style="font-size:30px; font-weight:600; line-height:1.2; color:{TEXT}; padding:0px 0px 6px 0px">{totA[i]}</p>'
             f'<div style="width:100px; display:flex; flex-direction:column; border-radius:6px 6px 0px 0px; overflow:hidden">'
             f'<div style="height:{max(hs, 18)}px; background:{VMID}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hs >= 24 else 0.75}; color:#F1F6F2">{slA[i]}</p></div>'
             f'<div style="height:{max(hr, 18)}px; background:{GDK}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hr >= 24 else 0.75}; color:#F1F6F2">{ricA[i]}</p></div></div>'
             f'<div style="align-self:stretch; display:flex; flex-direction:column; align-items:center; gap:2px; border-top:2px solid {GREY}; padding:8px 0px 0px 0px"><p style="font-size:26px; font-weight:600; line-height:1.2; color:{TEXT}">{days[i]}</p><p style="font-size:24px; line-height:1.2; color:{BODY}">soja {R7["dia"][i]}</p></div></div>')
iA = max(range(7), key=lambda i: totA[i]); iB = min(range(7), key=lambda i: totA[i])
def note(big, txt, band, col=TEXT):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:8px solid {band}; border-radius:14px; padding:12px 20px"><p style="font-size:44px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; line-height:1.3; color:{BODY}">{txt}</p></div>'
section('dia-a-dia', head('Planta', f'El {full[iA].split()[0]} fue el día con más camiones adentro de la planta', VIO, 60)
    + p('<b>Camiones adentro:</b> cuántos hay en promedio a cualquier hora. Sube si entran más o si tardan más en salir.', 26)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px; padding:16px 0px 0px 0px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Ricardone', GDK), ('San Lorenzo', VMID)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}; white-space:nowrap">Abajo: camiones de soja del día</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:0px">{cols}</div></div>'
    + '<div style="width:520px; display:flex; flex-direction:column; justify-content:center; gap:14px">'
    + note(totA[iA], f'camiones adentro el {full[iA]}: {ricA[iA]} en Ricardone y {slA[iA]} en San Lorenzo.', VIO)
    + note(f'{min(totA)}–{max(totA)}', f'por día en la semana; el más bajo, el {full[iB]}.', GLT)
    + note(slA[iA], (f'en San Lorenzo el {full[iA]}: el puerto tardó {R7["slzDia"][iA]} min por camión, con la PV2 sin descargar por un preventivo en su compresor.' if EXCEL else f'en San Lorenzo el {full[iA]}: el puerto tardó {R7["slzDia"][iA]} min por camión. Vale mirarlo.'), GDK, GDK)
    + '</div></div>',
    'Camiones adentro = camiones del día por hora (camiones / 24) × horas que pasa cada uno adentro (ley de Little). '
    f'Ricardone: recorridos por la calada sólida del día ({", ".join(map(str, CAL["porDia"]))}) por el tiempo de la soja en Ricardone ({", ".join(map(str, R7["ricDia"]))} min). '
    f'San Lorenzo: recorridos por las volcables del puerto ({", ".join(map(str, volD))}{"" if EXCEL else ", incluye el transile"}) por el tiempo de la soja en San Lorenzo ({", ".join(map(str, R7["slzDia"]))} min). '
    f'Por día (Ricardone / San Lorenzo / total): ' + ', '.join(f'{days[i].lower()} {ricA[i]}/{slA[i]}/{totA[i]}' for i in range(7)) + '. Soja del día: ' + ('planilla.' if EXCEL else 'estimación por cámaras.'), gap=20)

# ------------------------------------------------------------------ dividers
def divider(id, num, title, sub, bg, accent):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:#F1F6F2; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px; gap:24px"><div style="flex:1"></div><p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p><h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1><p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p><div style="flex:1"></div>{footer(0, True)}</section>')
divider('div-soja', '01', 'Soja', 'Circuito R7 Ricardone → San Lorenzo: la semana día por día, por planta y por horario.', GDK, GLT)

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
    f'Circuito R7, promedio semanal por tramo en minutos: ingreso {R7["ing"]}, Playa 1 {R7["p1"]}, salida {R7["sal"]}, interplanta {R7["inter"]}, Playa OSL {R7["osl"]}, descarga {R7["desc"]}, egreso {R7["egr"]}. '
    + ((f'Suman {sum(v7)}; el puerta a puerta medido de punta a punta (ingreso → salida de la planilla) da {R7["total"]}. Semana anterior (comité 25/09): 303.') if EXCEL else (f'Suman {sum(v7)}; el puerta a puerta medido de punta a punta da {R7["total"]}. Semana sin Excel: cada tramo es el de la semana anterior más la variación medida por cámaras con el mismo criterio las dos semanas '
    f'(Playa 1 {t(Cp["r7"], "p1")}→{t(C["r7"], "p1")}, egreso Ricardone → volcable {t(Cp["r7"], "egrVolc")}→{t(C["r7"], "egrVolc")}, punta a punta {t(Cp["r7"], "total")}→{t(C["r7"], "total")}). '
    'El ingreso se toma igual que la semana anterior. Total de camiones: estimación por cámaras.')), gap=36)
v29 = [R29['preLiq'], R29['liqP3'], R29['p3Silo'], R29['siloBal'], R29['balCal'], R29['calEgr'], R29['puente'], R29['osl'], R29['balVolc'], R29['volcSal']]
section('tramos-r29', head('Soja · transile R29', 'Transile desde silos: tiempos medios por tramo', GMID)
    + tramos([('Ingreso y Playa 1', 'Ingreso → Calle líquida'), ('Acceso P3', 'Calle líquida → Playa 3'), ('Espera carga', 'Playa 3 → Silo'), ('Carga', 'Silo → Balanza egreso'), ('A calada', 'Balanza egreso → Calada'), ('Salida', 'Calada → Salida Ric'), ('Traslado', 'Salida Ric → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza SLZ'), ('Descarga', 'Balanza SLZ → Volcable'), ('Egreso', 'Volcable → Salida SLZ')],
             v29, [GMID, GLT, GDK, GMID, G2, GLT, GREY, VIO, VMID, VXLT], [TEXT, TEXT, GDK, TEXT, TEXT, TEXT, TEXT, VIO, VMID, TEXT],
             [('b', 0, 6, f'Ricardone · {R29["ric"]} min ({hm(R29["ric"])})', GDK, GDK), ('gap', 6, 7, '', '', ''), ('b', 7, 10, f'San Lorenzo · {R29["slz"]}', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Ciclo completo (suma de tramos)', f'{R29["ciclo"]} min · {hm(R29["ciclo"])}', GDK, GDK)
    + kcard('De la carga en silo a la calada', f'{R29["siloBal"] + R29["balCal"]} min', GMID, GDK)
    + kcard('Espera en Playa OSL', f'{R29["osl"]} min', VIO, VIO) + '</div>'
    + key(f'La espera para cargar en silo sigue siendo lo más largo del ciclo ({R29["p3Silo"]} min, contra 183 la semana anterior). El ciclo bajó de 347 a {R29["ciclo"]} min.'),
    f'Transile R29: soja cargada en silos de Ricardone y descargada en las volcables del puerto. Ciclo observado por patente: ingreso → calle líquida → Playa 3 → carga en silo → balanza egreso → calada → egreso → balanza San Lorenzo → volcable → salida. '
    f'Promedios por tramo medidos con cámaras sobre {C["r29"]["total"]} vueltas de la semana (con Excel, la semana anterior este cálculo coincidía con lo publicado). Traslado y Playa OSL medidos con la cámara de ingreso del puerto. Operaciones R29{"" if EXCEL else " estimadas"}: {R29["ops"]}.', gap=24)

# ------------------------------------------------------------------ resumen soja
def kpi(label, big, col, delta, tone, vals):
    sp = spark(vals, 300, 80, GMID, GDK) if vals else ''
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p><div style="flex:1"></div>{sp}</div>')
rk_tot = rank(TOT, R7['total']); rk_p1 = rank(P1, R7['p1']); rk_sl = rank(SLZ, R7['slz'])
ordinal = {1: 'La más baja', 2: '2.ª más baja', 3: '3.ª más baja'}
section('resumen-soja', head('Soja · R7', 'Resumen de la semana: soja')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('Puerta a puerta', f'{R7["total"]} min', GDK, f'{sgn(R7["total"] - PUB["total"])} min vs. semana anterior', GXLT, TOT)
    + kpi('Espera Playa 1 · Ricardone', f'{R7["p1"]} min', GDK, f'{ordinal.get(rk_p1, f"{sgn(R7["p1"] - PUB["p1"])} vs. semana anterior")} desde junio' if rk_p1 <= 3 else f'{sgn(R7["p1"] - PUB["p1"])} vs. semana anterior', GXLT, P1)
    + kpi('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', VIO, f'{sgn(R7["slz"] - PUB["slz"])} vs. semana anterior', VLT, SLZ)
    + kpi('Camiones R7', fmtn(R7['ops']), GDK, f'{round((R7["ops"] / PUB["r7_ops"] - 1) * 100)} % vs. semana anterior'.replace('-', '−'), GXLT, None)
    + '</div>' + (key(f'Semana liviana y la más rápida desde junio: {R7["total"]} min puerta a puerta. La mejora vino otra vez de Ricardone (Playa 1 en {R7["p1"]} min, el mínimo de la serie); San Lorenzo quedó en su nivel: {R7["slz"]} min contra {PUB["slz"]}.', 28) if EXCEL else key(f'La soja hizo su mejor tiempo puerta a puerta desde junio ({R7["total"]} min) y la mejora vino de San Lorenzo: {R7["slz"]} min contra {PUB["slz"]}. Playa 1 quedó en {R7["p1"]} min, en línea con la semana anterior.', 28)),
    f'Líneas: evolución semanal por fecha de comité (cada punto informa la semana previa), del 17/06 al 02/10. Promedios de la serie: total {avg(TOT)} min, Playa 1 {avg(P1)} min, San Lorenzo {avg(SLZ)} min. '
    + ('' if EXCEL else 'Semana sin Excel: el punto de esta semana es el de la semana anterior más la variación medida por cámaras con el mismo criterio. Camiones R7: estimación por cámaras.'))

# ------------------------------------------------------------------ hallazgo
mxd = max(R7['dia']); top2 = sorted(range(7), key=lambda i: -R7['dia'][i])[:2]
bars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:28px; font-weight:600; color:{TEXT}; text-align:center">{v}</p><div style="width:96px; height:{round(v / mxd * 360)}px; background:{GDK if i in top2 else GLT}; border-radius:8px 8px 0 0"></div><p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center">{days[i]}</p><p style="font-size:24px; color:{BODY}; text-align:center">{R7["totDia"][i]} min</p></div>' for i, v in enumerate(R7['dia']))
islow = max(range(7), key=lambda i: R7['totDia'][i]); ifast = min(range(7), key=lambda i: R7['totDia'][i])
section('hallazgo', '<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="width:680px; display:flex; flex-direction:column; gap:28px">'
    + head('Soja · R7', f'El lunes fue el día más cargado y también el más lento')
    + p(f'El lunes 28 entraron {R7["dia"][4]} camiones de soja y el ciclo llegó a {R7["totDia"][4]} min. El viernes le siguió en volumen ({R7["dia"][1]}) y también fue de los más lentos ({R7["totDia"][1]} min).')
    + p(f'El {full[ifast].split()[0]} fue el día más rápido: {R7["totDia"][ifast]} min con {R7["dia"][ifast]} camiones.')
    + key(f'El lunes el tiempo se fue en San Lorenzo ({R7["slzDia"][4]} min): la PV2 del puerto no descargó (preventivo de 8.000 h en el compresor que la alimenta) y la PV4 tuvo que cubrirla con el día más cargado de la semana.' if EXCEL else f'El lunes el tiempo se fue en San Lorenzo ({R7["slzDia"][4]} min), el mismo día que la volcable 5 casi no descargó. Vale mirar qué pasó en el puerto.')
    + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Días de mayor volumen', GDK), ('Resto', GLT)])
    + f'<p style="font-size:24px; color:{BODY}">Camiones por día y tiempo puerta a puerta</p><div style="flex:1; display:flex; flex-direction:row; gap:12px; align-items:end">{bars}</div></div></div>',
    ('Camiones R7 por día operativo (planilla) y tiempo puerta a puerta medio del día. PV2 el 28/09: 0 descargas contra una mediana de 22; PV4: 29 contra 4. Mantenimiento: fechas programadas de las OT del EAM, sin horas de parada (cruce_mantenimiento.py).' if EXCEL else 'Camiones por día: estimación por cámaras (la soja leída en calada y en el puerto, llevada a la escala de las operaciones). Tiempo puerta a puerta por día: medido por cámaras y ajustado a la escala del comité.'))

# ------------------------------------------------------------------ plantas
mxp = max(R7['ricDia'] + R7['slzDia'])
cols = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><div style="display:flex; flex-direction:row; align-items:end; gap:8px"><div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{GDK}">{a}</p><div style="width:52px; height:{round(a / mxp * 320)}px; background:{GDK}; border-radius:8px 8px 0px 0px"></div></div><div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{VIO}">{b}</p><div style="width:52px; height:{round(b / mxp * 320)}px; background:{VMID}; border-radius:8px 8px 0px 0px"></div></div></div><p style="font-size:24px; font-weight:600">{d}</p></div>' for d, a, b in zip(days, R7['ricDia'], R7['slzDia']))
section('plantas', head('Soja · R7', 'Día por día, San Lorenzo volvió a ser la planta que más varió')
    + '<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="flex:1; display:flex; flex-direction:column; gap:20px">' + legend([('Ricardone', GDK), ('San Lorenzo', VMID)])
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{cols}</div></div><div style="width:520px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Ricardone se movió entre <b>{min(R7["ricDia"])} y {max(R7["ricDia"])} min</b>; San Lorenzo, entre <b>{min(R7["slzDia"])} y {max(R7["slzDia"])} min</b>.')
    + p(f'El lunes 28 San Lorenzo llegó a {R7["slzDia"][4]} min, con la PV2 fuera de servicio; el jueves 24 había sido de {R7["slzDia"][0]}.' if EXCEL else f'El lunes 28 San Lorenzo llegó a {R7["slzDia"][4]} min; el jueves 24 había sido de {R7["slzDia"][0]}.')
    + (p(f'Ricardone fue la planta pareja: su pico fue el domingo ({max(R7["ricDia"])} min).') if EXCEL else p(f'Ricardone fue mejorando en la semana: de {R7["ricDia"][0]} min el jueves a {R7["ricDia"][6]} el miércoles.'))
    + key('Dentro de la semana, la variación se jugó otra vez en San Lorenzo.', 28) + '</div></div>',
    'Minutos promedio por planta y por día. Ricardone = ingreso + Playa 1 + egreso. San Lorenzo = Playa OSL + descarga + salida. ' + ('' if EXCEL else 'Medido por cámaras y ajustado a la escala del comité.'))

# ------------------------------------------------------------------ cuartos
QCOL = {'Q4': GDK, 'Q3': '#7B1E3A', 'Q2': '#C9651A', 'Q1': '#C8372D'}
dayq = [sum(qd[q][i] for q in qd) for i in range(7)]
mxq = max(dayq)
stack = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600">{dayq[i]}</p><div style="display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                + ''.join(f'<div style="width:96px; height:{round(qd[q][i] / mxq * 400)}px; background:{QCOL[q]}"></div>' for q in ('Q4', 'Q3', 'Q2', 'Q1'))
                + f'</div><p style="font-size:24px; font-weight:600">{days[i]}</p></div>' for i in range(7))
pct = {q: round(QN[q] / R7['ops'] * 100) for q in QN}
qrow = lambda q, lab: f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QCOL[q]}; border-radius:12px; padding:16px 24px"><p style="font-size:28px; font-weight:600; width:220px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QCOL[q]}">{pct[q]} %</p><p style="font-size:24px; color:{BODY}">{QN[q]}</p></div>'
section('cuartos', head('Soja · R7', 'El ingreso entre cuartos sigue parejo')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{stack}</div><div style="width:520px; display:flex; flex-direction:column; gap:20px">'
    + qrow('Q1', 'Q1 · 22–04 h') + qrow('Q2', 'Q2 · 04–10 h') + qrow('Q3', 'Q3 · 10–16 h') + qrow('Q4', 'Q4 · 16–22 h')
    + key(f'La noche (Q1) sigue siendo el cuarto más cargado ({pct["Q1"]} %, la semana anterior 36 %); los otros tres quedaron entre {min(pct["Q2"], pct["Q3"], pct["Q4"])} y {max(pct["Q2"], pct["Q3"], pct["Q4"])} %.')
    + '</div></div>',
    f'Camiones R7 por cuarto del día operativo y por día. Suma = {fmtn(R7["ops"])}. {"" if EXCEL else "Semana sin Excel: la participación de cada cuarto es la de la semana anterior más la variación medida por cámaras (hora de pre-ingreso), con el mismo criterio las dos semanas. "}Franjas: 22–04 / 04–10 / 10–16 / 16–22.', bg=BG2)

# ------------------------------------------------------------------ histórico
def linechart(vals, col, vmin, vmax, avgv, X0=168, Y0=380, W=1000, H=400):
    n = len(vals)
    xy = lambda i, v: (X0 + round(i * W / (n - 1)), Y0 + round((vmax - v) / (vmax - vmin) * H))
    out = f'<svg aria-label="Serie semanal 17/06 a 02/10" viewBox="0 0 {W + 40} {H + 40}" width="{W + 40}" height="{H + 40}" style="position:absolute; left:{X0 - 20}px; top:{Y0 - 20}px; width:{W + 40}px; height:{H + 40}px">'
    for gl in range(5): out += f'<line x1="20" y1="{20 + gl * 100}" x2="{W + 20}" y2="{20 + gl * 100}" stroke="{LINE}" stroke-width="2"/>'
    ay = xy(0, avgv)[1] - Y0 + 20
    out += f'<line x1="20" y1="{ay}" x2="{W + 20}" y2="{ay}" stroke="{BODY}" stroke-width="2" stroke-dasharray="8 8"/>'
    pts = [xy(i, v) for i, v in enumerate(vals)]
    out += f'<polyline fill="none" stroke="{col}" stroke-width="5" stroke-linejoin="round" points="' + ' '.join(f'{x - X0 + 20},{y - Y0 + 20}' for x, y in pts) + '"/>'
    out += ''.join(f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="{11 if i == n - 1 else 6}" fill="{col}"/>' for i, (x, y) in enumerate(pts)) + '</svg>'
    for i, (x, y) in enumerate(pts):
        out += f'<p style="position:absolute; left:{x - 40}px; top:{y - 48}px; width:80px; text-align:center; font-size:24px; font-weight:600; color:{col}">{vals[i]}</p>'
        out += f'<p style="position:absolute; left:{x - 40}px; top:{Y0 + H + 24}px; width:80px; text-align:center; font-size:24px; color:{BODY}">{weeks[i]}</p>'
    return out
def ctx(label, big, vals, col, sub):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:14px; padding:20px 24px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:end; justify-content:space-between; gap:16px"><p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>{spark(vals, 220, 70, col, col)}</div><p style="font-size:24px; color:{BODY}">{sub}</p></div>')
section('historico', head('Soja · R7', 'Dónde queda la semana: el tiempo más bajo desde junio')
    + legend([('Tiempo puerta a puerta (min) · rótulo = fecha del comité', GDK), (f'Promedio de la serie: {avg(TOT)}', BODY)])
    + linechart(TOT, GDK, 230, 470, avg(TOT))
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Ricardone · espera Playa 1', f'{R7["p1"]} min', P1, GDK, f'Promedio desde junio: {avg(P1)}')
    + ctx('San Lorenzo · playa, descarga y salida', f'{R7["slz"]} min', SLZ, VMID, f'Promedio desde junio: {avg(SLZ)}')
    + (key(f'La mejora vino otra vez de Ricardone; San Lorenzo quedó arriba de su promedio ({R7["slz"]} contra {avg(SLZ)}).') if EXCEL else key(f'Esta vez la mejora vino de San Lorenzo ({R7["slz"]} contra {PUB["slz"]}); Ricardone se sostuvo en el nivel de la semana anterior.')) + '</div>',
    f'Tiempo puerta a puerta R7 por comité (rótulo = fecha del comité, que informa la semana previa). {R7["total"]} min queda por debajo del mínimo previo (276, punto 11/9). '
    + ('' if EXCEL else 'Semana sin Excel: el punto 2/10 es el de la semana anterior más la variación medida por cámaras con el mismo criterio las dos semanas; conviene confirmarlo cuando llegue la planilla.'), gap=24)

# ------------------------------------------------------------------ girasol
divider('div-girasol', '03' if EXCEL else '02', 'Girasol', 'Circuitos R5 y R6: recepción en las volcables 1 y 2 de Ricardone.', VIO, '#B9A8E0')
vg = [GI['ing'], GI['p1'], GI['pb'], GI['ap3'], GI['desc'], GI['tara']]
section('girasol', head('Girasol · R5+R6', 'Girasol: tiempos medios por tramo', VIO)
    + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('P. Bruto', 'Calada → Balanza ingreso'), ('Acceso P3', 'Balanza ingreso → Playa 3'), ('Descarga', 'Playa 3 → Volcable'), ('Tara', 'Volcable → Balanza egreso')],
             vg, [GLT, GDK, GMID, GLT, VIO, VMID], [TEXT, GDK, TEXT, TEXT, VIO, TEXT], [('b', 0, 6, f'Ricardone · {GI["total"]} min ({hm(GI["total"])})', VIO, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard('Tiempo total (suma de tramos)', f'{GI["total"]} min · {hm(GI["total"])}', VIO, VIO)
    + kcard('Comparativo semana anterior', f'{sgn(GI["total"] - PUB["g_total"])} min', GMID, GDK)
    + kcard('Total de camiones', fmtn(GI['ops']), GDK, GDK) + '</div>'
    + key(f'La descarga (Playa 3 → volcable) sigue siendo el tramo más largo y creció a {GI["desc"]} min; Playa 1 subió a {GI["p1"]}. Desde el domingo casi todo entró por la volcable 2.' + (f' La volcable 1 no descargó lunes y martes (OT en la balanza 1 y en la válvula de la celda 5): sin redundancia, la descarga pasó a la volcable 2 y a silos Kepler 2.' if EXCEL else '')),
    f'Girasol R5+R6, suma de tramos: ingreso {GI["ing"]}, Playa 1 {GI["p1"]}, pesada bruta {GI["pb"]}, acceso a Playa 3 {GI["ap3"]}, Playa 3 → volcable {GI["desc"]}, tara {GI["tara"]} = {GI["total"]} min. '
    + (f'Los tramos de girasol salen de cámaras: con la planilla quedan muy pocos recorridos de girasol con todos los tramos leídos, así que cada tramo es el de la semana anterior más la variación medida por cámaras (Playa 1' if EXCEL else f'Semana sin Excel: cada tramo es el de la semana anterior más la variación medida por cámaras (Playa 1') + f' {gp["p1"]["mean"]}→{g["p1"]["mean"]}, Playa 3 → volcable {gp["descarga"]["mean"]}→{g["descarga"]["mean"]}, tara {gp["tara"]["mean"]}→{g["tara"]["mean"]}); '
    f'la muestra de girasol es chica ({g["p1"]["n"]} camiones con Playa 1 medida), vale confirmarlo con planta. Volcable 1: {v1} recorridos, volcable 2: {v2}; por día, volcables 1 y 2: {", ".join(map(str, VR["porDia"]))}.', gap=32)
rk_g = rank(GT, GI['total'], low=False)
section('girasol-hist', head('Girasol · R5+R6', 'Dónde queda la semana: el tiempo más alto desde junio', VIO)
    + legend([('Tiempo total, suma de tramos (min) · rótulo = fecha del comité', VIO), (f'Promedio de la serie: {avg(GT)}', BODY)])
    + linechart(GT, VIO, 200, 500, avg(GT))
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Espera Playa 1', f'{GI["p1"]} min', GP, GDK, f'Promedio desde junio: {avg(GP)} · {rank(GP, GI["p1"], low=False)}.ª más alta')
    + ctx('Descarga (Playa 3 → volcable y tara)', f'{GI["desc"] + GI["tara"]} min', GD, VMID, f'Promedio desde junio: {avg(GD)} · {"máximo de la serie" if rank(GD, GI["desc"] + GI["tara"], low=False) == 1 else "entre las más altas"}')
    + key(f'Subieron a la vez la espera y la descarga. Según la planilla, la mitad de los camiones estuvo más de {GIR_MED // 60} h en planta: la semana empezó con la volcable 1 demorada (970 min el jueves, OT en la aspiración de polvillo y el calador 1) y la cerró sin ella lunes y martes.' if EXCEL else 'Subieron a la vez la espera y la descarga: menos camiones de girasol, pero más tiempo adentro. Vale confirmar con planta cómo estuvo la volcable 1.') + '</div>',
    f'Girasol R5+R6, tiempo total por comité como suma de medias de tramo. Esta semana {GI["total"]} min; máximo previo 430 (punto 4/9). Tramos: semana anterior más la variación medida por cámaras. Volcable 1 Ricardone: 4 y 0 descargas el 28 y 29/09 (mediana 46–48); la volcable 2 la cubrió el 28 (31 contra 2) y Kepler 2 el 29 (23). Mantenimiento: fechas programadas de las OT del EAM, sin horas de parada (cruce_mantenimiento.py).', gap=24)

# ------------------------------------------------------------------ pellet (operativo de transile R30/31/32)
FLETE_T = 6000  # $ por tonelada, flete interplanta Ricardone → puerto
TN_VIAJE = 30
def pesos(v):
    return f'$ {str(round(v / 1e6, 1)).replace(".", ",")} M' if v >= 1e6 else '$ ' + f'{round(v):,}'.replace(',', '.')
PO_PATH = os.path.join(D, 'pellet-operativo.json')
if EXCEL and os.path.exists(PO_PATH):
    PO = json.load(open(PO_PATH, encoding='utf-8'))
    PL, PC = PO['planilla'], PO['camaras']
    pt = {k: v['mean'] for k, v in PC['periodo'].items()}
    pdays = PO['periodo']['dias']
    dlab = {d: days[M['semanas']['cur'].index(d)] for d in pdays}
    divider('div-pellet', '02', 'Pellet', 'Operativo de pellet de girasol: transile de Ricardone a las volcables del puerto.', '#5E4428', '#E3C9A3')
    # operativo
    mxv = max(PL['viajesDia'].values())
    bars = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:120px; font-size:28px; font-weight:600; color:{TEXT}">{dlab[d]}</p><div style="width:{round(PL["viajesDia"][d] / mxv * 620)}px; height:56px; background:#9A7650; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{PL["viajesDia"][d]} viajes · {PL["patentesDia"][d]} camiones</p></div>' for d in pdays)
    def box(big, lab, sub=''):
        return f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid #9A7650; border-radius:14px; padding:20px 26px"><p style="font-size:24px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:56px; font-weight:600; line-height:1.05; color:#5E4428">{big}</p>' + (f'<p style="font-size:24px; color:{BODY}">{sub}</p>' if sub else '') + '</div>'
    tandas = '; '.join(f'{b["inicio"][8:10]}/{b["inicio"][5:7]} {b["inicio"][11:]} a {b["fin"][8:10]}/{b["fin"][5:7]} {b["fin"][11:]} ({str(b["horas"]).replace(".", ",")} h)' for b in PL['bloques'])
    section('pellet-operativo', head('Pellet · R30/31/32', 'Operativo de pellet de girasol', '#5E4428')
        + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="width:560px; display:flex; flex-direction:column; gap:16px">'
        + box(fmtn(PL['toneladas30']) + ' t', 'Toneladas (viajes × 30)', f'{pesos(PL["toneladas30"] * FLETE_T)} de flete a $ 6.000 por tonelada')
        + box(fmtn(PL['viajes']), 'Viajes al puerto')
        + box(str(PL['patentes']), 'Camiones (patentes distintas)')
        + box(f'{str(PL["horasOperativo"]).replace(".", ",")} h', 'Duración del operativo', f'en {len(PL["bloques"])} tandas')
        + f'</div><div style="flex:1; display:flex; flex-direction:column; gap:24px"><p style="font-size:24px; color:{BODY}">Viajes por día</p>{bars}<div style="flex:1"></div>'
        + key(f'El operativo corrió en {len(PL["bloques"])} tandas: {tandas}. Casi todo descargó en la volcable 4 ({PC["porVolcable"].get("V4", 0)} de {sum(PC["porVolcable"].values())} viajes leídos en el puerto).')
        + '</div></div>',
        f'Transile de pellet de girasol de Ricardone a las volcables del puerto (R30/31/32), según la planilla de movimientos. Viajes = operaciones de transile; toneladas = viajes × 30 (las netas de la planilla dan {fmtn(PL["toneladasReales"])} t). '
        f'Duración = horas entre el primer ingreso y la última salida de cada tanda (se corta la tanda con más de 4 h sin movimientos). Volcables: {", ".join(f"{k} {v}" for k, v in sorted(PC["porVolcable"].items()))}. Además hubo {PELX["despachos"]} despachos de pellet en camión, fuera de este operativo.', gap=28)
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
        + kcard('Total de viajes', fmtn(PL['viajes']), VMID, VIO) + '</div>'
        + key(f'Playa OSL y la descarga suman {pt["playaOsl"] + pt["descarga"]} de los {pt["ciclo"]} min del ciclo: el tiempo del operativo se fue en el puerto. En Ricardone, la carga en Playa 3 tomó {pt["carga"]} min.'),
        f'Tramos medidos con cámaras sobre {PC["viajes"]} de los {PL["viajes"]} viajes (patentes de la planilla; viaje = pre-ingreso → calle líquida → Playa 3 → balanza egreso cargado → ingreso SLZ → balanza OSL → volcable → salida SLZ, sin carga de silo ni calada sólida en el medio). '
        f'Suman {sum(vp)}; el ciclo medido de punta a punta da {pt["ciclo"]} (cada tramo se promedia sobre los viajes que lo tienen leído). Ricardone = pre-ingreso → balanza egreso; San Lorenzo = ingreso SLZ → salida. '
        f'La calle líquida aparece en {PC["conCalleLiquida"]} de {PC["viajes"]} viajes leídos: en el primero del día de cada camión ({PC["calleLiquidaPorOrden"]["primero"][1]} de {PC["calleLiquidaPorOrden"]["primero"][0]}) y también en los siguientes ({PC["calleLiquidaPorOrden"]["siguientes"][1]} de {PC["calleLiquidaPorOrden"]["siguientes"][0]}).', gap=32)
    # camiones
    vpc = PL['viajesPorCamionDia']
    cards = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; gap:8px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid #9A7650; border-radius:16px; padding:24px 28px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{dlab[d]}</p><p style="font-size:64px; font-weight:600; line-height:1.05; color:#5E4428">{round(vpc[d]["prom"])}</p><p style="font-size:24px; color:{BODY}">viajes por camión · máximo {vpc[d]["max"]}</p><p style="font-size:24px; color:{BODY}">{PL["patentesDia"][d]} camiones · {PL["viajesDia"][d]} viajes</p></div>' for d in pdays)
    top = ''.join(f'<div style="display:flex; flex-direction:row; justify-content:space-between; border-top:1px solid {LINE}; padding:10px 0px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{pl}</p><p style="font-size:26px; font-weight:600; color:#5E4428">{n} viajes</p></div>' for pl, n in PL['topCamiones'][:6])
    prom_total = PL['viajes'] / PL['patentes']
    section('pellet-camiones', head('Pellet · R30/31/32', 'Cada camión hizo más vueltas a medida que avanzó el operativo', '#5E4428')
        + f'<div style="display:flex; flex-direction:row; gap:24px">{cards}</div>'
        + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:20px">'
        + p(f'En todo el operativo, {PL["patentes"]} camiones hicieron {PL["viajes"]} viajes: <b>{round(prom_total)} por camión</b>. El primer día, que arrancó a las 18 h, cada uno hizo uno; en las tandas completas, unos 3, con camiones que llegaron a 4.')
        + key('Con jornadas completas el operativo rindió casi el doble de vueltas por camión: vale programarlo en tandas largas y no cortadas.')
        + f'</div><div style="width:560px; display:flex; flex-direction:column; gap:4px"><p style="font-size:24px; color:{BODY}">Los que más viajes hicieron en la semana</p>{top}</div></div>',
        'Viajes por camión y por día según la planilla (fecha del movimiento). Máximo = el camión con más viajes ese día.', gap=28)
    # día por día
    def dcard(d):
        x = PC['porDia'][d]; tr_ = x['tramos']; q = x['cuartos']
        qs = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:{BG2}; border-radius:10px; padding:8px 4px"><p style="font-size:24px; font-weight:600; color:{QCOL[k]}">{k}</p><p style="font-size:26px; font-weight:600; color:{TEXT}">{q[k]}</p></div>' for k in ('Q1', 'Q2', 'Q3', 'Q4'))
        return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid #9A7650; border-radius:16px; padding:24px 26px">'
                f'<p style="font-size:30px; font-weight:600; color:{TEXT}">{dlab[d]}</p><p style="font-size:24px; color:{BODY}">Ciclo</p><p style="font-size:60px; font-weight:600; line-height:1.05; color:#5E4428">{tr_["ciclo"]["mean"]} min</p>'
                f'<div style="display:flex; flex-direction:row; justify-content:space-between"><p style="font-size:24px; color:{GDK}"><b>Ricardone {tr_["ric"]["mean"]}</b></p><p style="font-size:24px; color:{VIO}"><b>San Lorenzo {tr_["sl"]["mean"]}</b></p></div>'
                f'<p style="font-size:24px; color:{BODY}">Playa OSL {tr_["playaOsl"]["mean"]} · descarga {tr_["descarga"]["mean"]}</p>'
                f'<div style="display:flex; flex-direction:row; gap:6px">{qs}</div><p style="font-size:24px; color:{BODY}">{PL["viajesDia"][d]} viajes</p></div>')
    fast = min(pdays, key=lambda d: PC['porDia'][d]['tramos']['ciclo']['mean'])
    slow = max(pdays, key=lambda d: PC['porDia'][d]['tramos']['ciclo']['mean'])
    section('pellet-dias', head('Pellet · R30/31/32', 'Día por día, el ciclo se jugó en Playa OSL', '#5E4428')
        + '<div style="display:flex; flex-direction:row; gap:20px">' + ''.join(dcard(d) for d in pdays) + '</div>'
        + key(f'El día más rápido fue el {full[M["semanas"]["cur"].index(fast)]} ({PC["porDia"][fast]["tramos"]["ciclo"]["mean"]} min, Playa OSL en {PC["porDia"][fast]["tramos"]["playaOsl"]["mean"]}). El {full[M["semanas"]["cur"].index(slow)]} Playa OSL llegó a {PC["porDia"][slow]["tramos"]["playaOsl"]["mean"]} min; ese día la soja también esperó en el puerto (San Lorenzo {R7["slzDia"][M["semanas"]["cur"].index(slow)]} min): pellet y soja comparten la playa.'),
        'Ciclo, Ricardone y San Lorenzo por día, medidos con cámaras. Cuartos = viajes por cuarto del día según la hora de pre-ingreso (Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22). Viajes = planilla.', gap=28)
    # histórico (todos los operativos desde junio, contados en la planilla)
    PH = json.load(open(os.path.join(D, 'pellet-historico.json'), encoding='utf-8'))
    PH[-1]['ciclo'] = pt['ciclo']
    fd = lambda s_: f'{s_[8:10]}/{s_[5:7]}'
    cols_w = [150, 230, 110, 140, 190, 170, 170, 120, 140]
    hdr = ['Comité', 'Período', 'Viajes', 'Camiones', 'Viajes por camión y día', 'Toneladas', 'Flete', 'Horas', 'Ciclo']
    def row(cells, bold=False, bg=None, col=TEXT):
        return (f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:10px 0px{"; background:" + bg if bg else ""}">'
                + ''.join(f'<p style="width:{w}px; font-size:26px; font-weight:{600 if bold or i == 0 else 400}; color:{col}; text-align:{"left" if i < 2 else "right"}">{c}</p>' for i, (w, c) in enumerate(zip(cols_w, cells))) + '</div>')
    table = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 6px 0px">' + ''.join(f'<p style="width:{w}px; font-size:24px; font-weight:600; color:{BODY}; text-align:{"left" if i < 2 else "right"}">{c}</p>' for i, (w, c) in enumerate(zip(cols_w, hdr))) + '</div>'
             + ''.join(row([o['comite'] or '—', f'{fd(o["desde"])} a {fd(o["hasta"])}', fmtn(o['viajes']), str(o['camiones']), str(round(o['viajesPorCamionDia'])),
                            f'{fmtn(o["toneladas30"])} t', pesos(o['toneladas30'] * FLETE_T), str(o['horas']).replace('.', ','), f'{o["ciclo"]} min' if o['ciclo'] else '—'],
                           bold=(i == len(PH) - 1), bg=('#F3EADF' if i == len(PH) - 1 else None), col=('#5E4428' if i == len(PH) - 1 else TEXT)) for i, o in enumerate(PH)))
    cam_rng = (min(o['camiones'] for o in PH), max(o['camiones'] for o in PH))
    vpd = [o['viajesPorCamionDia'] for o in PH]
    section('pellet-hist', head('Pellet · R30/31/32', 'Los operativos de pellet desde junio', '#5E4428')
        + f'<div style="display:flex; flex-direction:column">{table}</div>'
        + '<div style="display:flex; flex-direction:row; gap:48px">'
        + p(f'Todos los operativos usaron entre <b>{cam_rng[0]} y {cam_rng[1]} camiones</b>. Cada camión hace entre {round(min(vpd))} y {round(max(vpd))} viajes por día: el volumen depende de cuántos camiones se suman y cuántas horas corre, no de que cada uno haga más vueltas.', 26, BODY, '; flex:1')
        + '<div style="flex:1">' + key(f'Esta semana se usaron {PH[-1]["camiones"]} camiones, como en los operativos grandes, pero en {str(PH[-1]["horas"]).replace(".", ",")} h repartidas en {PL["bloques"].__len__()} tandas: rindió {round(PH[-1]["viajesPorCamionDia"])} viajes por camión y día, de los valores más bajos de la serie.') + '</div></div>',
        'Operativos contados en la planilla de movimientos: egresos de pellet de girasol de Ricardone con destino puerto, sin patentes ficticias. Camiones = patentes distintas. Toneladas = viajes × 30. Horas = primer ingreso → última salida de cada tanda (corte con más de 4 h sin movimientos). '
        'Viajes por camión y día = promedio de viajes de cada camión en cada día que trabajó. Ciclo = tiempo publicado en cada comité (los operativos de junio y julio no se presentaron en comité). '
        'Los comités publicaron 530 camiones para el 28/08 (57 patentes), 723 para el 04/09, 382 para el 11/09 y 188 para el 18/09; la planilla da 532, 723, 383 y 189.', gap=24)

    # ---------------- anexo pellet: prueba con menos camiones (carga igual, menos espera en el puerto, tarifa −15 %)
    PE = [x for x in json.load(open(os.path.join(D, 'pellet-escenarios.json'), encoding='utf-8')) if x['leidos'] >= 25 and x['viajes'] >= 50]
    wv = lambda a, k: sum(x[k] * x['viajes'] for x in a if x[k] is not None) / max(1, sum(x['viajes'] for x in a if x[k] is not None))
    grupos = [('Hasta 45 camiones', [x for x in PE if x['camiones'] <= 45]), ('46 a 55', [x for x in PE if 45 < x['camiones'] <= 55]), ('Más de 55', [x for x in PE if x['camiones'] > 55])]
    G = [(lab, len(a), round(wv(a, 'ciclo')), round(wv(a, 'puerto')), wv([x for x in a if x['viajesHora']], 'viajesHora')) for lab, a in grupos]
    v1 = [x for x in PE if len(x['volcables']) == 1]; v2 = [x for x in PE if len(x['volcables']) == 2]
    V1 = (len(v1), round(wv(v1, 'puerto')), wv([x for x in v1 if x['viajesHora']], 'viajesHora'))
    V2 = (len(v2), round(wv(v2, 'puerto')), wv([x for x in v2 if x['viajesHora']], 'viajesHora'))
    mejores = sorted(x['puerto'] for x in v2)[:3]
    # escenario
    lam = PL['viajes'] / PL['horasOperativo']                                   # viajes por hora que hay que sostener
    puerto_hoy = pt['playaOsl'] + pt['descarga']
    PUERTO_OBJ = 100                                                             # Playa OSL + descarga objetivo (min)
    resto = pt['ciclo'] - puerto_hoy + pt['vuelta']                              # carga, interplanta, salida y regreso: no cambian
    vuelta_hoy, vuelta_obj = (resto + puerto_hoy) / 60, (resto + PUERTO_OBJ) / 60
    circ_hoy, circ_obj = round(lam * vuelta_hoy), round(lam * vuelta_obj)        # Little: camiones dando vueltas a la vez
    CAM_OBJ = 40
    ciclo_obj = pt['ciclo'] - puerto_hoy + PUERTO_OBJ
    hoy_vc, obj_vc = round(PL['viajes'] / PL['patentes']), round(PL['viajes'] / CAM_OBJ)
    hoy_vd = round(PH[-1]['viajesPorCamionDia']); obj_vd = round(PH[-1]['viajesPorCamionDia'] * PL['patentes'] / CAM_OBJ)
    FLETE_OBJ = 5000  # $ por tonelada propuesto
    TAR = 1 - FLETE_OBJ / FLETE_T
    ingreso = round((obj_vd * (1 - TAR) / hoy_vd - 1) * 100)
    fx = lambda v: str(round(v, 1)).replace('.', ',')
    mxc = max(g[2] for g in G)
    gbars = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:230px; font-size:26px; font-weight:600; color:{TEXT}">{lab}</p><div style="width:{round(c / mxc * 380)}px; height:44px; background:{"#5E4428" if i == 0 else "#C9AE8A"}; border-radius:0px 8px 8px 0px"></div><p style="font-size:26px; font-weight:600; color:{TEXT}; white-space:nowrap">{c} min · puerto {pu}</p></div>' for i, (lab, n, c, pu, vh) in enumerate(G))
    def fila(a, hoy, obj):
        return f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:12px 0px"><p style="flex:1; font-size:26px; color:{TEXT}">{a}</p><p style="width:150px; font-size:28px; font-weight:600; color:#5E4428; text-align:right">{hoy}</p><p style="width:170px; font-size:28px; font-weight:600; color:{GDK}; text-align:right">{obj}</p></div>'
    tabla = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 4px 0px"><p style="flex:1; font-size:24px; font-weight:600; color:{BODY}"></p><p style="width:150px; font-size:24px; font-weight:600; color:#5E4428; text-align:right">Hoy</p><p style="width:170px; font-size:24px; font-weight:600; color:{GDK}; text-align:right">Prueba</p></div>'
             + fila('Camiones contratados', PL['patentes'], CAM_OBJ)
             + fila('Dando vueltas a la vez', f'~{circ_hoy}', f'~{circ_obj}')
             + fila('Carga en Ricardone', f'{pt["ric"]} min', f'{pt["ric"]} min')
             + fila('Playa OSL + descarga', f'{puerto_hoy} min', f'{PUERTO_OBJ} min')
             + fila('Ciclo por viaje', f'{pt["ciclo"]} min', f'{ciclo_obj} min')
             + fila('Viajes por camión en el operativo', fx(hoy_vc), fx(obj_vc))
             + fila('Viajes por camión y día', fx(hoy_vd), fx(obj_vd)))
    section('pellet-flota', head('Pellet · anexo', 'Una prueba: menos camiones y menos espera en el puerto', '#5E4428')
        + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + f'<p style="font-size:24px; color:{BODY}">Ciclo por viaje según cuántos camiones trabajaron ese día ({len(PE)} días de operativo, agosto y septiembre)</p>{gbars}'
        + p(f'Con más camiones el ciclo se alarga y el puerto no descarga más: entre {fx(min(g[4] for g in G))} y {fx(max(g[4] for g in G))} viajes por hora. Los días con dos volcables y pocos camiones, la espera en el puerto bajó a {mejores[0]}–{mejores[-1]} min.', 26)
        + f'</div><div style="width:720px; display:flex; flex-direction:column">{tabla}</div></div>'
        + key(f'La carga en Ricardone no cambia; lo que baja es la espera en el puerto, de {puerto_hoy} a {PUERTO_OBJ} min. Con {CAM_OBJ} camiones dando vueltas más seguido se mueven las mismas {fmtn(PL["toneladas30"])} t en las mismas horas.'),
        f'Días de operativo con al menos 50 viajes y 25 leídos por cámaras (18/08 a 30/09). Grupos por camiones del día: '
        + '; '.join(f'{lab}: {n} días, ciclo {c} min, puerto {pu} min, {fx(vh)} viajes por hora' for lab, n, c, pu, vh in G) + '. '
        f'Escenario: hay que sostener {fx(lam)} viajes por hora (los de esta semana). La carga y los traslados quedan como hoy ({resto} min por vuelta, con la carga en Ricardone de {pt["ric"]} min y el regreso); Playa OSL + descarga baja de {puerto_hoy} a {PUERTO_OBJ} min, entre lo que dieron los días con dos volcables ({V2[1]}) y los mejores días ({", ".join(map(str, mejores))}). '
        f'Vuelta completa: {fx(vuelta_hoy)} h hoy y {fx(vuelta_obj)} h en la prueba; camiones dando vueltas a la vez = viajes por hora × vuelta (ley de Little): ~{circ_hoy} hoy, ~{circ_obj} en la prueba, es decir unos {round(circ_obj / CAM_OBJ * 100)} % de los {CAM_OBJ} trabajando en cada momento. '
        f'Viajes por camión y día: {fx(hoy_vd)} × {PL["patentes"]} / {CAM_OBJ} = {fx(obj_vd)}, unas {fx(obj_vd * vuelta_obj)} h de vueltas por día y por camión.', gap=24)
    # tarifa y volcables
    def vcard(t, sub, n, pu, vh, col, bg):
        return (f'<div style="flex:1; display:flex; flex-direction:column; gap:6px; background:{bg}; border-radius:16px; padding:22px 26px"><p style="font-size:26px; font-weight:600; color:{col}">{t}</p><p style="font-size:24px; color:{BODY}">{sub} · {n} días</p>'
                f'<p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{pu} min</p><p style="font-size:24px; color:{BODY}">espera en el puerto por viaje</p><p style="font-size:26px; color:{TEXT}"><b>{fx(vh)}</b> viajes por hora</p></div>')
    viaje_hoy = TN_VIAJE * FLETE_T; viaje_obj = viaje_hoy * (1 - TAR)
    dia_hoy, dia_obj = hoy_vd * viaje_hoy, obj_vd * viaje_obj
    flete_hoy, flete_obj = PL['viajes'] * viaje_hoy, PL['viajes'] * viaje_obj
    total_hist = sum(o['viajes'] for o in PH)
    hist_hoy, hist_obj = total_hist * viaje_hoy, total_hist * viaje_obj
    section('pellet-tarifa', head('Pellet · anexo', 'Dos volcables y el flete a $ 5.000 por tonelada', '#5E4428')
        + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + f'<p style="font-size:24px; color:{BODY}">Descarga en el puerto: una volcable contra dos</p><div style="display:flex; flex-direction:row; gap:20px">'
        + vcard('Una volcable', 'solo V4', V1[0], V1[1], V1[2], '#5E4428', '#F3EADF') + vcard('Dos volcables', 'V3 y V4', V2[0], V2[1], V2[2], GDK, GXLT) + '</div>'
        + p(f'Con dos volcables cada viaje espera <b>{V1[1] - V2[1]} min menos</b> en el puerto. Esta semana se descargó casi todo por la V4: abrir la V3 es el primer paso para bajar la espera.', 26)
        + '</div><div style="width:700px; display:flex; flex-direction:column; gap:12px">'
        + f'<p style="font-size:24px; color:{BODY}">Propuesta al camionero: flete de $ 6.000 a $ 5.000 por tonelada (30 t por viaje)</p>'
        + f'<div style="display:flex; flex-direction:row; padding:0px 0px 4px 0px"><p style="flex:1; font-size:24px; font-weight:600; color:{BODY}"></p><p style="width:170px; font-size:24px; font-weight:600; color:#5E4428; text-align:right">Hoy</p><p style="width:190px; font-size:24px; font-weight:600; color:{GDK}; text-align:right">Prueba</p></div>'
        + ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:12px 0px"><div style="flex:1; display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{b}</p></div><p style="width:170px; font-size:30px; font-weight:600; color:#5E4428; text-align:right">{h}</p><p style="width:190px; font-size:30px; font-weight:600; color:{GDK}; text-align:right">{o}</p></div>' for a, b, h, o in [
            ('Tarifa por viaje', f'$ 6.000 → $ 5.000 por tonelada · −{round(TAR * 100)} %', pesos(viaje_hoy), pesos(viaje_obj)),
            ('Ingreso del camionero por día', f'{fx(hoy_vd)} → {fx(obj_vd)} viajes · +{ingreso} %', pesos(dia_hoy), pesos(dia_obj)),
            ('Flete de este operativo', f'{fmtn(PL["viajes"])} viajes · ahorro {pesos(flete_hoy - flete_obj)}', pesos(flete_hoy), pesos(flete_obj)),
            ('Flete de los operativos desde junio', f'{fmtn(total_hist)} viajes · ahorro {pesos(hist_hoy - hist_obj)}', pesos(hist_hoy), pesos(hist_obj))])
        + '</div></div>'
        + key(f'Pagando {pesos(viaje_obj)} por viaje en lugar de {pesos(viaje_hoy)}, este operativo habría costado {pesos(flete_hoy - flete_obj)} menos, y el camionero cobraría {pesos(dia_obj)} por día en lugar de {pesos(dia_hoy)}. Vale probarlo en el próximo operativo.'),
        f'Volcables: días con una sola volcable con lecturas de pellet (V4) contra días con dos (V3 y V4), mismos días que la lámina anterior. Una: {V1[0]} días, puerto {V1[1]} min, {fx(V1[2])} viajes por hora. Dos: {V2[0]} días, puerto {V2[1]} min, {fx(V2[2])} viajes por hora. '
        f'Flete interplanta: $ 6.000 por tonelada × 30 t = {pesos(viaje_hoy)} por viaje; con la baja del {round(TAR * 100)} %, {pesos(viaje_obj)}. Ingreso del camionero por día = viajes por día × tarifa: {fx(hoy_vd)} × {pesos(viaje_hoy)} = {pesos(dia_hoy)} hoy y {fx(obj_vd)} × {pesos(viaje_obj)} = {pesos(dia_obj)} en la prueba. Toneladas = viajes × 30 (las netas de la planilla son algo menores). '
        f'El camionero gana lo mismo con una baja de hasta {round((1 - hoy_vd / obj_vd) * 100)} % (unos $ {fmtn(FLETE_T * hoy_vd / obj_vd)} por tonelada): $ 5.000 deja margen aunque la espera del puerto baje menos de lo previsto.', gap=24)

# ------------------------------------------------------------------ sectores
divider('div-sectores', '04' if EXCEL else '03', 'Sectores', 'Calada, volcables y silos: dónde se concentró la actividad de la semana.', GDK, GLT)
calles = sorted([(f'Calle {k[-1]}', v) for k, v in CAL['porCalle'].items()] + [(f'Calle {n}', 0) for n in '123456' if f'RicCal0{n}' not in CAL['porCalle']], key=lambda x: -x[1])
ccol = [GDK, GDK, GLT, GLT, GXLT, GXLT]
crows = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:140px; font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="width:{max(6, round(b / calles[0][1] * 560))}px; height:48px; background:{ccol[i]}; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(b)}</p></div>' for i, (a, b) in enumerate(calles))
def occ(a, sub, pc, col): return f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div><p style="font-size:44px; font-weight:600; color:{col}">{pc} %</p></div>'
p34 = round(c34 / calles_tot * 100)
section('calada', head('Sectores · calada', f'Calada con menos recorridos: las calles 3 y 4 hicieron el {p34} %')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · recorridos de cámara por calle ({calles_tot - CAL["camiones"]} pasaron por dos)</p><div style="display:flex; flex-direction:column; gap:20px">{crows}</div></div>'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Horas con actividad, sobre 168</p><div style="display:flex; flex-direction:column; gap:16px">'
    + occ('Ricardone sólida', f'{fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h', round(CAL['horas'] / 168 * 100), GDK)
    + occ('Ricardone líquida', f'{fmtn(LIQ["camiones"])} recorridos en {LIQ["horas"]} h', round(LIQ['horas'] / 168 * 100), VMID)
    + occ('San Lorenzo', f'{fmtn(CSL["camiones"])} recorridos en {CSL["horas"]} h', round(CSL['horas'] / 168 * 100), VMID) + '</div></div></div>'
    + key(f'Activa más horas que la semana anterior ({CAL["horas"]} contra 139) con {round((1 - CAL["camiones"] / 1935) * 100)} % menos recorridos ({fmtn(CAL["camiones"])} contra 1.935). Las calles 1 y 2 abrieron solo lunes y martes; la calada líquida casi duplicó sus recorridos con el transile de toda la semana.'),
    f'Calada por calle, semana completa: ' + ', '.join(f'{a.lower()} {b}' for a, b in calles) + f'. Suman {fmtn(calles_tot)}, no {fmtn(CAL["camiones"])}, porque algunos recorridos pasaron por dos calles. Horas = horas con al menos una lectura, sobre 168. '
    f'Pico: {CAL["pico"]} recorridos ({CAL["picoLabel"]}). Calada líquida {fmtn(LIQ["camiones"])} en {LIQ["horas"]} h (semana anterior 290 en 69 h): cuenta también los camiones del transile, que entran por la calle líquida rumbo a Playa 3.', gap=28)
# volcables
vrows_order = sorted(VOL, key=lambda k: -sum(VOL[k]))
mxv = max(sum(v) for v in VOL.values())
def cell(v):
    if v >= 20: return f'<div style="width:56px; height:56px; background:{GMID}; border-radius:12px"></div>'
    if v > 0: return f'<div style="width:56px; height:56px; background:{GXLT}; border:3px solid {GLT}; border-radius:12px"></div>'
    return f'<div style="width:56px; height:56px; border:3px dashed {LINE}; border-radius:12px"></div>'
rows = f'<div style="display:flex; flex-direction:row; align-items:center; gap:24px"><p style="width:80px; font-size:24px; color:{BODY}"></p><p style="width:760px; font-size:24px; font-weight:600; color:{BODY}">Camiones en la semana</p>' + ''.join(f'<p style="width:56px; font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in ['Ju', 'Vi', 'Sá', 'Do', 'Lu', 'Ma', 'Mi']) + f'<p style="flex:1; font-size:24px; font-weight:600; text-align:right; color:{BODY}">Días</p></div>'
for i, k in enumerate(vrows_order):
    tot = sum(VOL[k]); top = i == 0
    bcol = VIO if top else GMID
    rows += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:24px"><p style="width:80px; font-size:32px; font-weight:600; color:{TEXT}">{k}</p><div style="width:760px; display:flex; flex-direction:row; align-items:center; gap:16px"><div style="width:{max(10, round(tot / mxv * 560))}px; height:56px; background:{bcol}; border-radius:0px 8px 8px 0px"></div><p style="font-size:30px; font-weight:600; color:{VIO if top else TEXT}; white-space:nowrap">{fmtn(tot)} · {round(tot / VOL_TOT * 100)} %</p></div>'
             + ''.join((f'<div style="width:56px; height:56px; background:{VIO}; border-radius:12px"></div>' if (top and v >= 20) else cell(v)) for v in VOL[k])
             + f'<p style="flex:1; font-size:32px; font-weight:600; text-align:right; color:{VIO if top else TEXT}">{sum(1 for v in VOL[k] if v >= 20)}</p></div>')
top3 = vrows_order[:3]; p3 = round(sum(sum(VOL[k]) for k in top3) / VOL_TOT * 100)
section('volcables', head('Sectores · volcables puerto', 'La volcable 5 sostuvo la semana' if EXCEL else 'Tres volcables se repartieron la semana', VIO)
    + f'<div style="display:flex; flex-direction:column; gap:20px">{rows}</div>'
    + legend([('Operó (20 camiones o más)', GMID), ('Actividad mínima', GXLT)])
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + ((p(f'V5 trabajó todos los días y tomó el <b>{round(sum(VOL["V5"]) / VOL_TOT * 100)} %</b> ({fmtn(sum(VOL["V5"]))} de {fmtn(VOL_TOT)}). V3 y V4 se repartieron casi todo el resto; el domingo descargaron solo V2 y V5.', 28, BODY, '; flex:1')
       + '<div style="flex:1">' + key(f'El lunes la PV2 no descargó (preventivo en su compresor) y la PV4 la cubrió; el miércoles quedó sin descargar la PV3, en la parada anual de la cinta C01 de la Terminal. V5 sostuvo los dos días.') + '</div></div>') if EXCEL else
       (p(f'{", ".join(top3[:2])} y {top3[2]} tomaron el <b>{p3} %</b> ({fmtn(sum(sum(VOL[k]) for k in top3))} de {fmtn(VOL_TOT)}). El domingo descargaron solo V2 y V5; el lunes V3 llevó {VOL["V3"][4]} y V5 apenas {VOL["V5"][4]}.', 28, BODY, '; flex:1')
       + '<div style="flex:1">' + key('El lunes, con V5 casi quieta, fue el día más lento del puerto. Vale confirmar con planta si hubo una parada.') + '</div></div>')),
    f'Camiones por volcable en el puerto de San Lorenzo, semana 24–30/09. Barra = total de la semana y participación. Cuadros = días Jue a Mié; lleno = 20 camiones o más, claro = entre 1 y 19, vacío = sin camiones. Por día: '
    + '; '.join(f'{k} ' + '/'.join(map(str, VOL[k])) for k in vrows_order) + f'. Camiones = recorridos de cámara, por día calendario. ' + ('Son descargas de soja externa R7, como en el comité anterior (1.401); el transile R29 no entra en este conteo. Mantenimiento: fechas programadas de las OT del EAM, sin horas de parada (cruce_mantenimiento.py).' if EXCEL else f'Esta semana incluye las descargas del transile de silos (R29), que corrió casi toda la semana; la semana anterior, con el mismo conteo, fueron {fmtn(VSp["semana"])}.'), gap=28)
# silos
sd = SIL['porDia']; mxs = max(sd)
sbars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:28px; font-weight:600; color:{TEXT}; text-align:center">{v}</p><div style="width:96px; height:{max(10, round(v / mxs * 380))}px; background:{GDK if v >= 50 else GLT}; border-radius:8px 8px 0 0"></div><p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center">{days[i]}</p></div>' for i, v in enumerate(sd))
s8 = SIL['porCalle'].get('RicS8CargaLinea2', 0); sdesc = SIL['porCalle'].get('RicS7DescLinea2', 0)
section('silos', head('Sectores · silos Ricardone', 'Silos: el transile corrió casi toda la semana')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Camiones en silos por día (recorridos de cámara)</p><div style="flex:1; display:flex; flex-direction:row; gap:12px; align-items:end">{sbars}</div></div>'
    + '<div style="width:560px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Casi toda la actividad fue <b>carga</b> para el transile de soja ({"" if EXCEL else "unas "}{R29["ops"]} operaciones R29), de jueves a martes, con el pico el lunes.', 28)
    + p(f'La carga salió casi toda por la línea 2 de S8 ({s8} de {SIL["camiones"]}); las descargas fueron {sdesc}. El miércoles casi no hubo carga.', 28)
    + key('El transile dejó de ser cosa de inicio de semana: esta vez convivió con la soja externa casi todos los días.') + '</div></div>',
    f'Camiones por día en las cámaras de silos Ricardone, carga y descarga (recorridos de cámara, día calendario). En la semana {SIL["camiones"]} recorridos (semana anterior 329). Por cámara: ' + ', '.join(f'{k} {v}' for k, v in SIL['porCalle'].items()) + (f'. Operaciones R29 de la planilla: {R29["ops"]} (semana anterior 313).' if EXCEL else f'. Operaciones R29: estimación por cámaras sobre las 313 de la semana anterior.'), bg=BG2)

# ------------------------------------------------------------------ mantenimiento × semana
MT_PATH = os.path.join(D, 'mantenimiento.json')
if False:  # el cruce con mantenimiento va dentro de cada lámina que justifica
    MT = json.load(open(MT_PATH, encoding='utf-8'))
    TONO = {'gir': ('#7A5608', '#E0A526'), 'sl': (VIO, VMID), 'ric': (GDK, GMID)}
    cards = ''.join(f'<div style="display:flex; flex-direction:column; gap:8px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {TONO[e["tono"]][1]}; border-radius:16px; padding:20px 24px"><p style="font-size:40px; font-weight:600; line-height:1; color:{TONO[e["tono"]][0]}">{e["cifra"]}</p><h3 style="font-size:28px; font-weight:600; line-height:1.2; color:{TEXT}">{e["titulo"]}</h3><p style="font-size:24px; line-height:1.35; color:{BODY}">{e["texto"]}</p></div>' for e in MT['episodios'])
    section('mantenimiento', head('Análisis general', 'Lo que dice mantenimiento de la semana', VIO)
        + f'<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px">{cards}</div>'
        + key(f'El lunes 28 se juntaron la volcable 1 de Ricardone y la PV2 del puerto fuera de servicio: fue el día más lento de la soja ({R7["totDia"][4]} min puerta a puerta). Vale confirmar con planta las horas de parada.'),
        MT['nota'] + ' Fuente: ' + MT['fuente'] + '.', gap=24)

# ------------------------------------------------------------------ cruces
def cx(big, title, txt, band):
    return f'<div style="display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.07); border:1px solid rgba(241,246,242,0.18); border-top:6px solid {band}; border-radius:16px; padding:24px 28px"><p style="font-size:48px; font-weight:600; line-height:1; color:#F1F6F2">{big}</p><h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{band}">{title}</h3><p style="font-size:24px; line-height:1.4; color:#D6E4DA">{txt}</p></div>'
add('cruces', f'<section id="cruces" data-transition="fade" style="background:{VIO}; color:#F1F6F2; font-family:{FONT}; padding:96px 128px 96px; display:flex; flex-direction:column; gap:28px"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, #2E1B4E 0%, #1F3A38 60%, #0B5638 100%)"></div>'
    f'<div style="display:flex; flex-direction:column; gap:12px"><p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Cierre · análisis general</p><h2 style="font-size:72px; font-weight:600; line-height:1.1; color:#F1F6F2">La semana en seis lecturas</h2></div>'
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cx(f'{R7["total"]} min', 'La soja, en su mejor tiempo', 'Puerta a puerta por debajo de todo lo visto desde junio (mínimo previo 276).' + ('' if EXCEL else ' Vale confirmarlo con la planilla.'), GLT)
    + (cx(f'{R7["p1"]} min', 'Ricardone volvió a mejorar', f'Playa 1 en su mínimo desde junio (antes 87). San Lorenzo, en {R7["slz"]} min, no acompañó.', GLT) if EXCEL else cx(f'{R7["slz"]}', 'San Lorenzo acompañó', f'El puerto bajó de {PUB["slz"]} a {R7["slz"]} min; Ricardone se sostuvo, con Playa 1 en {R7["p1"]}.', GLT))
    + cx(f'{p34} %', 'Calada en dos calles', f'Las calles 3 y 4 hicieron el {p34} %; la 1 y la 2 abrieron solo lunes y martes.', GLT)
    + cx(f'{GI["total"]} min', 'Girasol, con más espera', (f'Playa 1 en {GI["p1"]} y Playa 3 → volcable en {GI["desc"]} min: la volcable 1 estuvo demorada el jueves y parada lunes y martes.' if EXCEL else f'Playa 1 en {GI["p1"]} y Playa 3 → volcable en {GI["desc"]} min, con menos camiones. Vale mirar la volcable 1.'), '#B9A8E0')
    + cx(f'{R29["ops"]}', 'El transile, toda la semana', f'Silos cargó de jueves a martes; vueltas de {hm(R29["ciclo"])}, con la espera en silo como tramo más largo.', '#B9A8E0')
    + cx('Lun 28', 'El día para revisar', (f'Más soja de la semana ({R7["dia"][4]}), PV2 del puerto y volcable 1 de Ricardone sin descargar, San Lorenzo en {R7["slzDia"][4]} min.' if EXCEL else f'Más soja de la semana ({R7["dia"][4]}), calles 1 y 2 abiertas, V5 casi quieta y San Lorenzo en {R7["slzDia"][4]} min.'), '#B9A8E0')
    + f'</div><div style="flex:1"></div><div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center"><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:180px; height:96px; object-fit:contain"><p style="font-size:24px; color:#C9D8CE">Comité de Logística Nodo Sur · {LBL}</p><img src="{BTZ_L}" alt="Bimtrazer" style="width:170px; height:80px; object-fit:contain"></div>'
    f'<aside>Lecturas para discutir en comité; no son conclusiones cerradas.{"" if EXCEL else " Semana sin planilla de movimientos: cantidades y tiempos estimados con las cámaras, con el mismo criterio que la semana anterior."} Ricardone (ingreso + Playa 1 + egreso): {PUB["ric"]}→{R7["ric"]}. San Lorenzo (Playa OSL + descarga + salida): {PUB["slz"]}→{R7["slz"]}.</aside></section>')

# ------------------------------------------------------------------ write
ORDER = ['portada', 'resumen-planta', 'dia-a-dia', 'div-soja', 'tramos-r7', 'tramos-r29', 'resumen-soja', 'hallazgo', 'plantas', 'cuartos', 'historico',
         'div-pellet', 'pellet-operativo', 'pellet-tramos', 'pellet-camiones', 'pellet-dias', 'pellet-hist', 'pellet-flota', 'pellet-tarifa', 'div-girasol', 'girasol', 'girasol-hist', 'div-sectores', 'calada', 'volcables', 'silos', 'cruces']
ORDER = [o for o in ORDER if any(i == o for i, _ in slides)]
slides = sorted(slides, key=lambda x: ORDER.index(x[0]))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
deck = {"v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, "lists": "css",
        "title": "Comité de Logística Nodo Sur · Semana 24–30 sep", "order": ORDER,
        "sections": {"s1": {"description": "Portada, resumen de la planta y la semana día por día", "start": "portada"},
                     "s2": {"description": "Soja: tiempos por tramo de R7 y del transile desde silos, resumen, la semana día por día, por planta, por horario y en contexto", "start": "div-soja"},
                     "s3": {"description": "Girasol R5+R6: tiempos por tramo y evolución desde junio", "start": "div-girasol"},
                     **({"s2b": {"description": "Pellet: operativo de transile R30/31/32, tramos, viajes por camión y comparativo", "start": "div-pellet"}} if 'div-pellet' in ORDER else {}),
                     "s4": {"description": "Sectores: calada, volcables y silos", "start": "div-sectores"},
                     "s5": {"description": "Cierre: la semana en seis lecturas", "start": "cruces"}},
        "cover": "portada", "faces": {"ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}}, "designSystems": []}
dp = os.path.join(OUT, 'project', 'deck.json')
if os.path.exists(dp):
    old = json.load(open(dp, encoding='utf-8')); deck['createdOnFiles'] = old['createdOnFiles']; deck.pop('lists', None) if 'lists' not in old else None
json.dump(deck, open(dp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'R7': R7, 'R29': {k: v for k, v in R29.items() if k != 'nCam'}, 'GI': GI, 'QN': QN, 'CAL': [CAL['camiones'], CAL['horas'], CAL['porCalle']], 'LIQ': [LIQ['camiones'], LIQ['horas']], 'CSL': [CSL['camiones'], CSL['horas']],
                  'VR': [VR['camiones'], VR['porCalle'], VR['porDia']], 'SIL': [SIL['camiones'], SIL['porDia']], 'VOL': VOL, 'adentro': [ricA, slA, totA]}, ensure_ascii=False))
