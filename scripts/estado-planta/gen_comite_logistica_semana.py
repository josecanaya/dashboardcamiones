"""Comité de Logística Nodo Sur — una semana lunes→domingo, con la maqueta del deck 24/09–04/10 (artifact SxeVbx2h3pxKuaAf6nfMRF).

Uso: python scripts/estado-planta/gen_comite_logistica_semana.py <carpeta>
  <carpeta>/datos.json lo arma datos_comite_semana.py (ver <carpeta>/calculo/README.md). Escribe <carpeta>/deck/project/...
Diferencias con gen_comite_logistica_rango.py:
- Nada de fechas fijas: días, rótulos, títulos y textos salen de datos.json.
- Modo «cámaras» (sin planilla): cada cifra de cámara dice su denominador y su calibración contra la planilla de días anteriores.
- Pellet queda solo como monitoreo (sin propuesta de puerto ni de flete).
- Líquidos con el criterio por producto, planta y sentido (liquidos-criterio.cjs) y estimación por cámaras (liquidos-camaras.cjs).
"""
import json, os, sys, datetime
D = os.path.abspath(sys.argv[1])
X = json.load(open(os.path.join(D, 'datos.json'), encoding='utf-8'))
CAL_DIR = os.path.join(D, 'calculo')
JC = lambda f: json.load(open(os.path.join(CAL_DIR, f), encoding='utf-8'))
OUT = os.path.join(D, 'deck')
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)
CAMARAS = X['modo'] == 'camaras'

DAYS = X['periodo']['days']
N = len(DAYS)
MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
DOWF = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
def wd(d): return datetime.date.fromisoformat(d).weekday()
def dd(d): return int(d[8:10])
days = [f'{DOW[wd(d)]} {dd(d)}' for d in DAYS]                       # «Lun 5»
ini = [DOW[wd(d)][0] for d in DAYS]                                  # «L»
full = [f'{DOWF[wd(d)]} {dd(d)}' for d in DAYS]                       # «lunes 5»
fdm = lambda d: f'{d[8:10]}/{d[5:7]}'
LBL = f'{fdm(DAYS[0])}–{fdm(DAYS[-1])}'
LBL_LARGO = f'Del {dd(DAYS[0])} al {dd(DAYS[-1])} de {MES[int(DAYS[-1][5:7]) - 1]} de {DAYS[-1][:4]}'
HOURS = 24 * N
iD = {d: i for i, d in enumerate(DAYS)}

GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'; G2='#1F7A4D'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'; GREY='#B7C3BB'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'; VXLT='#A99BCF'
BLU='#1F4E7A'; BMID='#3F7FB5'; BXLT='#DCE8F3'
PEL='#5E4428'; PELM='#9A7650'; PELL='#F3EADF'
FONT="'IBM Plex Sans', Arial, sans-serif"
NVA_G='/_blob/2c1166d4fbf2fbec7430398abf6b0e3b'; NVA_L='/_blob/18aa8ca0d589832dda48c77f1ed28a0b'
BTZ='/_blob/916ea0722fd539b2369ca6413631c60d'; BTZ_L='/_blob/0e7d769a3aba86ad2cd768091719225b'
AER_RIC='/_blob/d87935e062f6db2ad585a52b0b30e02f'; AER_SL='/_blob/b2b7b4c6595ee63172090f5ac4fd588e'
# imágenes: ids del almacén del artifact donde se publica (deck/assets.json); por defecto, los del deck 24/09–04/10
_AS = os.path.join(OUT, 'assets.json')
if os.path.exists(_AS):
    _a = json.load(open(_AS, encoding='utf-8')); NVA_G, NVA_L, BTZ, BTZ_L, AER_RIC, AER_SL = (_a[k] for k in ('NVA_G', 'NVA_L', 'BTZ', 'BTZ_L', 'AER_RIC', 'AER_SL'))

fmtn = lambda v: f'{round(v):,}'.replace(',', '.')
def hm(m): m = round(m); return f'{m // 60} h {m % 60} m'
def sgn(d): d = round(d); return f'+{d}' if d > 0 else (f'−{abs(d)}' if d < 0 else '0')
def pct(a, b): return round((a / b - 1) * 100)
def spct(v): return (f'+{v}' if v > 0 else f'−{abs(v)}' if v < 0 else '0') + ' %'
fx = lambda v: str(round(v, 1)).replace('.', ',')
avg = lambda a: round(sum(a) / len(a))
def rank(a, v, low=True):
    s = sorted(a) if low else sorted(a, reverse=True)
    return s.index(v) + 1
def y_(l, sep=', ', last=' y '): l = list(l); return l[0] if len(l) == 1 else sep.join(l[:-1]) + last + l[-1]
cap = lambda t: t[:1].upper() + t[1:]
SEG_CAM = 'según cámaras' if CAMARAS else 'según planilla'

# ------------------------------------------------------------------ datos
RUN = X['corrida']; ANT = X['anterior']
RUNTXT = f'corrida {RUN["runId"]} ({RUN["rulesVersion"]}, {fmtn(RUN["eventCount"])} eventos de cámara, {RUN["movimientosRows"]} movimientos de planilla)'
ANT_DAYS = ANT['dias']; ANT_N = len(ANT_DAYS); ANT_LBL = f'{fdm(ANT_DAYS[0])}–{fdm(ANT_DAYS[-1])}'
ASP = ANT['sojaPeriodo']; atr = {t['key']: round(t['mediaMin']) for t in ASP['tramos'] if t['mediaMin'] is not None}
PUB = dict(r7_ops=ASP['camiones'], total=round(ASP['tiempoMedioMin']), p1=atr['PREINGRESO→CALADA'],
           slz=atr['SL_INGRESO→SL_BALANZA_INGRESO'] + atr['SL_BALANZA_INGRESO→SL_VOLCABLE'] + atr['SL_VOLCABLE→SL_EGRESO'],
           g_total=ANT['girasol']['total'], g_ops=ANT['extras']['girasol']['ops'], liq=ANT['extras']['liquidos']['camiones'],
           pel_viajes=ANT['pelletHistorico'][-1]['viajes'], pel_ciclo=ANT['pelletHistorico'][-1]['ciclo'],
           cal=ANT['actividad']['calada_ricardone']['periodo']['camiones'], cal_h=ANT['actividad']['calada_ricardone']['periodo']['horasConActividad'],
           liq_cal=ANT['actividad']['calada_ricardone_liquidos']['periodo']['camiones'], sil=ANT['actividad']['silos_ricardone']['periodo']['camiones'],
           r29=ANT['extras']['r29']['ops'])

# soja R7 · cámaras por patente (r7-camaras.cjs) y recorridos de la corrida (final_circuits)
RC = X['r7']['camaras']; T7 = {k: v['mean'] for k, v in RC['tramos'].items()}; N7 = {k: v['n'] for k, v in RC['tramos'].items()}
TD = RC['tramosDia']
K7 = X['r7']['calibracion']; R7P = JC(K7['archivo'])                   # misma medición sobre días con planilla
TP = {k: v['mean'] for k, v in R7P['tramos'].items()}
CAL_LBL = f'{fdm(K7["dias"][0])}–{fdm(K7["dias"][-1])}'
# con planilla de la semana (r7-camaras.cjs la cruza sola cuando data/movimientos trae esos días) el conteo pasa a ser el de la planilla
PR7 = RC.get('calibracion') if (RC.get('calibracion') or {}).get('planillaR7') else None
APR = '' if PR7 else '≈ '
R7 = dict(viajes=RC['viajes'], est=PR7['planillaR7'] if PR7 else round(RC['viajes'] / K7['cobertura']), etl=X['r7']['etlRecorridos'],
          dia=[PR7['planillaPorDia'][d] for d in DAYS] if PR7 else X['r7']['etlPorDia'],
          viajesDia=[RC['porDia'][d] for d in DAYS], total=T7['total'], ric=T7['ric'], slz=T7['sl'], p1=T7['playa1'],
          totDia=[TD[d]['total']['mean'] for d in DAYS], ricDia=[TD[d]['ric']['mean'] for d in DAYS], slzDia=[TD[d]['sl']['mean'] for d in DAYS],
          totN=[TD[d]['total']['n'] for d in DAYS])
r7_dia, r7_dia_prev = R7['est'] / N, PUB['r7_ops'] / ANT_N
QN = {q: sum(v) for q, v in RC['cuartos'].items()}; qd = RC['cuartos']
# girasol (metricas-camaras.cjs: calada → volcable de Ricardone por patente) · volcable 2 (paquete)
GM = X['girasol']['metricas']; GT_ = {k: v['mean'] for k, v in GM['tiempos'].items()}; GN_ = {k: v['n'] for k, v in GM['tiempos'].items()}
GA = ANT['metricas']['gir']; GAT = {k: v['mean'] for k, v in GA['tiempos'].items()}
PXA = X['paquete']['actividad']
def act(key):
    a = PXA[key]; per = a['periodo']
    return {'camiones': per['camiones'], 'horas': per['horasConActividad'], 'pico': per['picoCamiones'], 'picoLabel': per['picoLabel'],
            'porCalle': {c['camara']: c['camiones'] for c in per['porCalle']}, 'porDia': [a['porDia'].get(d, {}).get('camiones', 0) for d in DAYS],
            'calleDia': {d: {c['camara']: c['camiones'] for c in a['porDia'].get(d, {}).get('porCalle', [])} for d in DAYS}}
CAL = act('calada_ricardone'); LIQ = act('calada_ricardone_liquidos'); CSL = act('calada_san_lorenzo'); VR = act('volcable_ricardone'); SIL = act('silos_ricardone')
GI = dict(rec=VR['camiones'], dia=VR['porDia'], viajes=GM['total'], p1=GT_.get('p1'), calVolc=GT_.get('calVolc'), desc=GT_.get('descarga'), tara=GT_.get('tara'), total=GT_.get('total'))
GIR_OK = None not in (GI['p1'], GI['calVolc'], GI['tara'], GI['total']) and GN_.get('total', 0) >= 10   # con menos de 10 camiones medidos no se publican tramos
# volcables del puerto: camiones distintos leídos por cada cámara de volcable, por día calendario (metricas-camaras.cjs)
VOL = {k: X['sectores']['calles'].get(k, [0] * N) for k in ('V1', 'V2', 'V3', 'V4', 'V5')}
VOL_TOT = sum(sum(v) for v in VOL.values())
# pellet (pellet-camaras.cjs)
PE = X['pellet']['camaras']; PK = X['pellet']['calibracion']; PEP = JC(X['pellet']['calibracionArchivo'])
PPE = PE.get('calibracion') if (PE.get('calibracion') or {}).get('planillaEgresosPellet') else None   # planilla de la semana
pt = {k: v['mean'] for k, v in PE['tramos'].items()}; ptn = {k: v['n'] for k, v in PE['tramos'].items()}
ptp = {k: v['mean'] for k, v in PEP['tramos'].items()}
pdays = [d for d in DAYS if PE['viajesDia'][d]]
# líquidos
LC = X['liquidos']['camaras']; LK = X['liquidos']['calibracion']; LKV = X['liquidos']['calibracionVisitas']; LCR = X['liquidos']['criterioAnterior']; LCW = X['liquidos'].get('criterioSemana')
LKD = len(K7['dias'])
r29 = X['r29']

# series de comités (rótulo = fecha del comité); «Ant.» = comité anterior, «Actual» = esta semana
weeks = ['17/6', '24/6', '8/7', '15/7', '24/7', '30/7', '7/8', '13/8', '21/8', '28/8', '4/9', '11/9', '18/9', '25/9', 'Ant.']
TOT = [338, 316, 383, 304, 445, 389, 421, 346, 368, 296, 379, 276, 334, 303, PUB['total']]
P1 = [94, 113, 145, 114, 171, 181, 120, 101, 130, 112, 140, 87, 126, 89, PUB['p1']]
SLZ = [196, 150, 175, 125, 199, 143, 213, 176, 198, 153, 199, 160, 180, 184, PUB['slz']]
GT = [315, 287, 317, 306, 351, 361, 347, 241, 289, 353, 430, 319, 382, 228, PUB['g_total']]

# ------------------------------------------------------------------ helpers de maqueta (iguales a gen_comite_logistica_rango.py)
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
def tagcam(): return f'<p style="font-size:24px; font-weight:600; color:{BODY}; border:2px solid {GREY}; padding:4px 16px; border-radius:999px">Según cámaras</p>' if CAMARAS else ''
def head(tag, title, tagbg=GDK, size=64, cam=False):
    return (f'<div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center">{pill(tag, tagbg)}{tagcam() if cam else ""}</div>'
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
def note(big, txt, band, col=TEXT):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:8px solid {band}; border-radius:14px; padding:12px 20px"><p style="font-size:44px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; line-height:1.3; color:{BODY}">{txt}</p></div>'
def divider(id, num, title, sub, bg, accent):
    add(id, f'<section id="{id}" data-transition="fade" style="background:{bg}; color:#F1F6F2; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px; gap:24px"><div style="flex:1"></div><p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p><h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1><p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p><div style="flex:1"></div>{footer(0, True)}</section>')
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
def kpi(label, big, col, delta, tone, vals):
    sp = spark(vals, 300, 80, GMID, GDK) if vals else ''
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p><div style="flex:1"></div>{sp}</div>')
def linechart(vals, labels, col, vmin, vmax, avgv, X0=168, Y0=380, W=1000, H=400, hollow=()):
    n = len(vals)
    xy = lambda i, v: (X0 + round(i * W / (n - 1)), Y0 + round((vmax - v) / (vmax - vmin) * H))
    out = f'<svg aria-label="Serie por comité, {labels[0]} a {labels[-1]}" viewBox="0 0 {W + 40} {H + 40}" width="{W + 40}" height="{H + 40}" style="position:absolute; left:{X0 - 20}px; top:{Y0 - 20}px; width:{W + 40}px; height:{H + 40}px">'
    for gl in range(5): out += f'<line x1="20" y1="{20 + gl * 100}" x2="{W + 20}" y2="{20 + gl * 100}" stroke="{LINE}" stroke-width="2"/>'
    ay = xy(0, avgv)[1] - Y0 + 20
    out += f'<line x1="20" y1="{ay}" x2="{W + 20}" y2="{ay}" stroke="{BODY}" stroke-width="2" stroke-dasharray="8 8"/>'
    pts = [xy(i, v) for i, v in enumerate(vals)]
    out += f'<polyline fill="none" stroke="{col}" stroke-width="5" stroke-linejoin="round" points="' + ' '.join(f'{x - X0 + 20},{y - Y0 + 20}' for x, y in pts) + '"/>'
    out += ''.join((f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="11" fill="{BG}" stroke="{col}" stroke-width="5"/>' if i in hollow else
                    f'<circle cx="{x - X0 + 20}" cy="{y - Y0 + 20}" r="{11 if i == n - 1 else 6}" fill="{col}"/>') for i, (x, y) in enumerate(pts)) + '</svg>'
    for i, (x, y) in enumerate(pts):
        out += f'<p style="position:absolute; left:{x - 40}px; top:{y - 48}px; width:80px; text-align:center; font-size:24px; font-weight:600; color:{col}">{vals[i]}</p>'
        out += f'<p style="position:absolute; left:{x - 44}px; top:{Y0 + H + 24}px; width:88px; text-align:center; font-size:24px; color:{BODY}{"; font-weight:600" if i == n - 1 else ""}">{labels[i]}</p>'
    return out
def ctx(label, big, vals, col, sub):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:14px; padding:20px 24px"><p style="font-size:24px; font-weight:600; color:{BODY}">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:end; justify-content:space-between; gap:16px"><p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>{spark(vals, 220, 70, col, col)}</div><p style="font-size:24px; color:{BODY}">{sub}</p></div>')
def box(big, lab, sub=''):
    return f'<div style="display:flex; flex-direction:column; gap:4px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {PELM}; border-radius:14px; padding:18px 26px"><p style="font-size:24px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:56px; font-weight:600; line-height:1.05; color:{PEL}">{big}</p>' + (f'<p style="font-size:24px; color:{BODY}">{sub}</p>' if sub else '') + '</div>'
def lbox(lab, big, sub, band, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:32px"><p style="font-size:26px; font-weight:600; color:{BODY}">{lab}</p><p style="font-size:80px; font-weight:600; line-height:1.05; color:{col}">{big}</p><p style="font-size:26px; color:{BODY}">{sub}</p></div>'
def occ(a, sub, pc_, col): return f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div><p style="font-size:44px; font-weight:600; color:{col}">{pc_} %</p></div>'
def hbar(rows, width=620, col=BLU, lab_w=420, sub_w=None):
    """rows = [(etiqueta, sub, valor, color)] → barras horizontales con la cifra al final."""
    mx = max(v for _, _, v, _ in rows) or 1
    return '<div style="display:flex; flex-direction:column; gap:14px">' + ''.join(
        f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><div style="width:{lab_w}px; display:flex; flex-direction:column; gap:2px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{a}</p>'
        + (f'<p style="font-size:24px; color:{BODY}">{s}</p>' if s else '') + f'</div><div style="width:{max(8, round(v / mx * width))}px; height:40px; background:{c or col}; border-radius:0px 8px 8px 0px"></div>'
        f'<p style="font-size:30px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(v)}</p></div>' for a, s, v, c in rows) + '</div>'

# ------------------------------------------------------------------ 1 portada
modo_txt = ('Versión solo cámaras: la planilla de movimientos de estos días todavía no llegó' if CAMARAS else 'Con planilla de movimientos y cámaras')
add('portada', f'<section id="portada" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:{GDK}; font-family:{FONT}; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(14,40,28,0.82); border-left:6px solid #9CCBAE; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; gap:12px; background:rgba(30,18,52,0.82); border-left:6px solid #B9A8E0; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Logística · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Logística Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">{LBL_LARGO}</p><p style="width:700px; font-size:26px; line-height:1.35; color:#9CCBAE">{modo_txt}</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Logística Nodo Sur, semana {LBL} (lunes a domingo, {N} días). '
    + (f'Sin planilla de movimientos para estos días: todas las cifras salen de las cámaras ({RUNTXT}) y de los scripts por patente de scripts/estado-planta. Cada lámina dice su denominador y cómo se calibró contra la planilla de {CAL_LBL}. Cuando llegue la planilla se reemplazan los conteos.' if CAMARAS else RUNTXT)
    + f' Comparativos contra el comité anterior ({ANT_LBL}, {ANT_N} días): las cantidades se comparan por día.</aside></section>')

# ------------------------------------------------------------------ 2 resumen planta
def pcard(tag, tagcol, band, big, unit, line2, vals, dark, light, foot):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:22px 26px">'
            f'<p style="font-size:24px; font-weight:600; color:{tagcol}; text-transform:uppercase; letter-spacing:1px">{tag}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:10px"><p style="font-size:60px; font-weight:600; line-height:1.05; color:{tagcol}">{big}</p><p style="font-size:24px; color:{BODY}">{unit}</p></div>'
            f'<p style="font-size:24px; color:{TEXT}">{line2}</p>{minibars(vals, dark, light)}<p style="font-size:24px; line-height:1.3; color:{BODY}">{foot}</p></div>')
def strip(t1, t2): return f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; border-left:8px solid #9AA8A0; padding:4px 0px 4px 18px"><p style="font-size:24px; font-weight:600; color:{TEXT}">{t1}</p><p style="font-size:24px; color:{BODY}">{t2}</p></div>'
imx = max(range(N), key=lambda i: R7['dia'][i])
LQV = LC['visitas']; lq_tot = LQV['RIC'] + LQV['TER']
lq_dia = [LC['porDia'][d]['RIC'] + LC['porDia'][d]['TER'] for d in DAYS]
pel_dia = [PE['viajesDia'][d] for d in DAYS]
section('resumen-planta', head('Planta', 'Qué entró a la planta, cuándo y cuánto tardó', VIO, cam=True)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + pcard('Soja · R7', GDK, GMID, f'{APR}{fmtn(R7["est"])}', 'operaciones' if PR7 else 'camiones', f'<b>{R7["total"]} min</b> puerta a puerta', R7['dia'], GDK, GMID, f'{days[imx]}: el día con más recorridos.')
    + pcard('Girasol · R6', '#7A5608', '#E0A526', fmtn(GI['rec']), 'recorridos', (f'<b>{GI["total"]} min</b> en planta' if GIR_OK else 'pocos camiones medidos'), GI['dia'], '#7A5608', '#E0A526', 'Todo por la volcable 2.')
    + pcard('Líquidos', BLU, BMID, fmtn(lq_tot), 'visitas', f'Terminal {LQV["TER"]} · Ricardone {LQV["RIC"]}', lq_dia, BLU, BMID, 'Estimación por cámaras, ver sección 04.')
    + pcard('Pellet', PEL, PELM, fmtn(PE['viajes']), 'viajes leídos', f'<b>{pt["ciclo"]} min</b> de ciclo', pel_dia, PEL, PELM, f'Operativo corto: {y_([full[iD[d]] for d in pdays])}.' if pdays else 'Sin transile de pellet.')
    + '</div><div style="display:flex; flex-direction:row; gap:32px">'
    + strip('Calada sólida Ricardone', f'{fmtn(CAL["camiones"])} recorridos de cámara · activa el {round(CAL["horas"] / HOURS * 100)} % de las horas')
    + strip('Volcables puerto', f'{fmtn(VOL_TOT)} camiones leídos · ' + ' y '.join(f'{k} {round(sum(VOL[k]) / VOL_TOT * 100)} %' for k in sorted(VOL, key=lambda k: -sum(VOL[k]))[:2]))
    + strip('Silos Ricardone', f'{fmtn(SIL["camiones"])} recorridos de cámara · sin transile R29' if not r29['metricas']['total'] else f'{fmtn(SIL["camiones"])} recorridos · {r29["metricas"]["total"]} transiles R29')
    + '</div>',
    (f'Soja: {fmtn(R7["est"])} operaciones R7 de la planilla de la semana (TERMINAL · INGRESO · SOJA por volcable, día operativo del ingreso); por cámaras se leyeron {R7["viajes"]} viajes completos. ' if PR7 else '') + f'Semana {LBL} ({N} días), {RUNTXT}. Soja por cámaras: ≈ {fmtn(round(RC["viajes"] / K7["cobertura"]))} camiones = {R7["viajes"]} viajes completos leídos por patente (calada → egreso → ingreso y salida de San Lorenzo; r7-camaras.cjs) divididos por la cobertura medida en {CAL_LBL} ({K7["camara"]} viajes contra {K7["planilla"]} operaciones R7 de la planilla, {round(K7["cobertura"] * 100)} %). '
    f'La corrida da {R7["etl"]} recorridos R7 en final_circuits, una cifra del mismo orden. Puerta a puerta {R7["total"]} min (media de {N7["total"]} viajes; en {CAL_LBL} el mismo método dio {K7["p2pCamara"]} contra {K7["p2pPlanilla"]} de la planilla). Barras de soja: ' + ('operaciones R7 de la planilla' if PR7 else 'recorridos R7 de la corrida') + f' por día operativo ({", ".join(map(str, R7["dia"]))}). '
    f'Girasol: {GI["rec"]} recorridos de la cámara de la volcable 2 (paquete del dashboard; la volcable 1 no aparece en la planilla desde el 28/09); en {CAL_LBL} esa cámara leyó 38 camiones contra 42 operaciones R6 de la planilla. Tiempo en planta = pre-ingreso → balanza de egreso, media de {GN_["total"]} camiones medidos por patente. '
    f'Líquidos: visitas de camión a la zona de líquidos (liquidos-camaras.cjs), no movimientos; calibración en la sección 04. Pellet: viajes de transile leídos por patente (pellet-camaras.cjs); en {fdm(PK["planillaPorDia"] and list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])} las cámaras vieron {PK["emparejados"]} de {PK["planillaEgresosPellet"]} viajes de la planilla ({round(PK["recall"] * 100)} %). '
    f'Calada sólida: {fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} de {HOURS} h. Volcables puerto: camiones distintos leídos por día en cada cámara de volcable (incluye el pellet de la V4). Silos: {SIL["camiones"]} recorridos.', gap=28)

# ------------------------------------------------------------------ 3 día a día (camiones adentro)
ricA = [round(c / 24 * (m or 0) / 60) for c, m in zip(CAL['porDia'], R7['ricDia'])]
slA = [round(c / 24 * (m or 0) / 60) for c, m in zip(R7['dia'], R7['slzDia'])]
totA = [a + b for a, b in zip(ricA, slA)]
mxA = max(totA) or 1
cols = ''
for i in range(N):
    hs, hr = round(slA[i] / mxA * 330), round(ricA[i] / mxA * 330)
    cols += (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:end; align-items:center; gap:0px"><p style="font-size:28px; font-weight:600; line-height:1.2; color:{TEXT}; padding:0px 0px 6px 0px">{totA[i]}</p>'
             f'<div style="width:68px; display:flex; flex-direction:column; border-radius:6px 6px 0px 0px; overflow:hidden">'
             f'<div style="height:{max(hs, 18)}px; background:{VMID}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hs >= 24 else 0.75}; color:#F1F6F2">{slA[i]}</p></div>'
             f'<div style="height:{max(hr, 18)}px; background:{GDK}; display:flex; flex-direction:column; justify-content:center; align-items:center"><p style="font-size:24px; font-weight:600; line-height:{1 if hr >= 24 else 0.75}; color:#F1F6F2">{ricA[i]}</p></div></div>'
             f'<div style="align-self:stretch; display:flex; flex-direction:column; align-items:center; gap:2px; border-top:2px solid {GREY}; padding:8px 0px 0px 0px"><p style="font-size:24px; font-weight:600; line-height:1.2; color:{TEXT}; white-space:nowrap">{days[i]}</p><p style="font-size:24px; line-height:1.2; color:{BODY}">{R7["dia"][i]}</p></div></div>')
iA = max(range(N), key=lambda i: totA[i]); iB = min(range(N), key=lambda i: totA[i])
section('dia-a-dia', head('Planta', f'El {full[iA]} fue el día con más camiones adentro de la planta', VIO, 60, cam=True)
    + p('<b>Camiones adentro:</b> cuántos hay en promedio a cualquier hora. Sube si entran más o si tardan más en salir.', 26)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:40px; padding:16px 0px 0px 0px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Ricardone', GDK), ('San Lorenzo', VMID)], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}; white-space:nowrap">Abajo: recorridos de soja R7 del día</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:0px">{cols}</div></div>'
    + '<div style="width:440px; display:flex; flex-direction:column; justify-content:center; gap:14px">'
    + note(totA[iA], f'camiones adentro el {full[iA]}: {ricA[iA]} en Ricardone y {slA[iA]} en San Lorenzo.', VIO)
    + note(f'{min(totA)}–{max(totA)}', f'por día en la semana; el más bajo, el {full[iB]}.', GLT)
    + note(slA[iA], f'en San Lorenzo el {full[iA]}: el puerto tardó {R7["slzDia"][iA]} min por camión.', GDK, GDK)
    + '</div></div>',
    'Camiones adentro = camiones del día por hora (camiones / 24) × horas que pasa cada uno adentro (ley de Little). '
    f'Ricardone: recorridos por la calada sólida del día ({", ".join(map(str, CAL["porDia"]))}) por el tiempo de la soja en Ricardone, pre-ingreso → egreso ({", ".join(map(str, R7["ricDia"]))} min). '
    f'San Lorenzo: recorridos R7 de la corrida por día operativo ({", ".join(map(str, R7["dia"]))}) por el tiempo de la soja en San Lorenzo, ingreso → salida ({", ".join(map(str, R7["slzDia"]))} min). '
    f'Por día (Ricardone / San Lorenzo / total): ' + ', '.join(f'{days[i].lower()} {ricA[i]}/{slA[i]}/{totA[i]}' for i in range(N)) + '. '
    f'Tiempos medidos por patente con cámaras (r7-camaras.cjs) sobre los viajes R7 de cada día ({", ".join(map(str, R7["totN"]))}). Con la planilla, San Lorenzo pasa a contar descargas R7 por volcable, como en el comité anterior.', gap=20)

# ------------------------------------------------------------------ soja
divider('div-soja', '01', 'Soja', 'Circuito R7 Ricardone → San Lorenzo: la semana día por día, por planta y por horario.', GDK, GLT)
v7 = [T7['ingreso'], T7['playa1'], T7['salida'], T7['interplanta'], T7['playaOsl'], T7['descarga'], T7['egreso']]
n7 = [N7['ingreso'], N7['playa1'], N7['salida'], N7['interplanta'], N7['playaOsl'], N7['descarga'], N7['egreso']]
ric_s, sl_s = sum(v7[:3]), sum(v7[4:])
d_tot = R7['total'] - PUB['total']
section('tramos-r7', head('Soja · R7', 'Tiempos medios por tramo', cam=True)
    + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('Salida', 'Calada → Salida Ricardone'), ('Interplanta', 'Salida Ricardone → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable puerto'), ('Egreso', 'Volcable puerto → Salida SLZ')],
             v7, [GLT, GDK, GMID, GREY, VIO, VMID, VXLT], [TEXT, GDK, TEXT, TEXT, VIO, VMID, TEXT],
             [('b', 0, 3, f'Ricardone · {ric_s} min ({hm(ric_s)})', GDK, GDK), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {sl_s} min ({hm(sl_s)})', VMID, VIO)])
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + kcard(f'Tiempo total puerta a puerta · {hm(R7["total"])}', f'{R7["total"]} min', GDK, GDK)
    + kcard(f'Contra el comité anterior ({PUB["total"]})', f'{sgn(d_tot)} min', GMID, GDK)
    + kcard('Viajes medidos de punta a punta', fmtn(N7['total']), VMID, VIO) + '</div>',
    f'Circuito R7, promedio de la semana por tramo en minutos (viajes con el tramo leído): ingreso {v7[0]} ({n7[0]}), Playa 1 {v7[1]} ({n7[1]}), salida {v7[2]} ({n7[2]}), interplanta {v7[3]} ({n7[3]}), Playa OSL {v7[4]} ({n7[4]}), descarga {v7[5]} ({n7[5]}), egreso {v7[6]} ({n7[6]}). '
    f'Suman {sum(v7)}; el puerta a puerta medido de punta a punta (pre-ingreso → salida de San Lorenzo) da {R7["total"]} sobre {N7["total"]} viajes: cada tramo se promedia sobre los viajes que lo tienen leído. '
    f'Método: viajes por patente con cámaras (r7-camaras.cjs), calada sólida → egreso → ingreso a San Lorenzo en menos de 90 min → salida; la descarga y el egreso solo cuando se leyó la volcable ({n7[5]} viajes). '
    f'Calibración en {CAL_LBL}: el mismo método da {K7["p2pCamara"]} min de puerta a puerta y la planilla {K7["p2pPlanilla"]}. Comité anterior ({ANT_LBL}, planilla): {PUB["total"]} min. '
    f'Mismo método en los dos períodos: {CAL_LBL} {TP["total"]} min (Ricardone {TP["ric"]}, San Lorenzo {TP["sl"]}) → esta semana {R7["total"]} (Ricardone {R7["ric"]}, San Lorenzo {R7["slz"]}).', gap=36)

# resumen soja
rk_tot = rank(TOT + [R7['total']], R7['total'])
ordinal = {1: 'el más bajo', 2: 'el 2.º más bajo', 3: 'el 3.º más bajo'}
d_ric, d_sl = R7['ric'] - TP['ric'], R7['slz'] - TP['sl']
quien = 'Ricardone' if d_ric < d_sl else 'San Lorenzo'
section('resumen-soja', head('Soja · R7', 'Resumen de la semana: soja', cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('Puerta a puerta', f'{R7["total"]} min', GDK, f'{sgn(d_tot)} min vs. comité anterior', GXLT, TOT + [R7['total']])
    + kpi('Ricardone · ingreso, Playa 1 y salida', f'{R7["ric"]} min', GDK, f'{sgn(d_ric)} vs. {CAL_LBL}', GXLT, None)
    + kpi('San Lorenzo · ingreso a salida', f'{R7["slz"]} min', VIO, f'{sgn(d_sl)} vs. {CAL_LBL}', VLT, None)
    + kpi('Camiones R7 por día', f'{APR}{fmtn(r7_dia)}', GDK, f'{spct(pct(r7_dia, r7_dia_prev))} vs. comité anterior', GXLT, None)
    + '</div>' + key(f'Semana liviana y rápida: unos {fmtn(r7_dia)} camiones por día y {R7["total"]} min puerta a puerta, {ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio. Con el mismo método de cámaras, la mejora contra {CAL_LBL} vino más de {quien} (Ricardone {sgn(d_ric)}, San Lorenzo {sgn(d_sl)} min).', 28),
    f'{APR}{fmtn(R7["est"])} {"operaciones" if PR7 else "camiones"} R7 en {N} días: {fmtn(r7_dia)} por día, contra {fmtn(r7_dia_prev)} por día del comité anterior ({fmtn(PUB["r7_ops"])} operaciones de la planilla en {ANT_N} días). ' + ('Cifra de la planilla. ' if PR7 else 'La cifra de esta semana es una estimación por cámaras (ver lámina 2). ') +
    f'Ricardone y San Lorenzo se comparan contra {CAL_LBL} medido igual (cámaras por patente, misma PC): Ricardone {TP["ric"]} → {R7["ric"]}, San Lorenzo {TP["sl"]} → {R7["slz"]}. No se comparan contra los tramos publicados del comité anterior porque salen de otra muestra (recorridos unidos a una operación de la planilla). '
    f'Línea: puerta a puerta por fecha de comité, del 17/06 al comité anterior («Ant.», {ANT_LBL}: {PUB["total"]}), y el último punto es esta semana por cámaras.')

# hallazgo
top2 = sorted(range(N), key=lambda i: -R7['dia'][i])[:2]
valid = [i for i in range(N) if R7['totN'][i] >= 10]
islow = max(valid, key=lambda i: R7['totDia'][i]); ifast = min(valid, key=lambda i: R7['totDia'][i])
bars = daybars(R7['dia'], days, lambda i, v: GDK if i in top2 else GLT, 270, 52, [f'{m}' for m in R7['totDia']])
tit = (f'El {full[imx]} fue el día con más soja y también el más rápido' if ifast == imx else
       f'El {full[imx]} fue el día con más soja; el {full[islow]}, el más lento')
osl_d = [TD[d]['playaOsl']['mean'] for d in DAYS]; p1_d = [TD[d]['playa1']['mean'] for d in DAYS]
causa = ('Playa OSL', osl_d[islow], 'San Lorenzo') if (R7['slzDia'][islow] - avg(R7['slzDia'])) > (R7['ricDia'][islow] - avg(R7['ricDia'])) else ('Playa 1', p1_d[islow], 'Ricardone')
section('hallazgo', '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:600px; display:flex; flex-direction:column; gap:28px">'
    + head('Soja · R7', tit, cam=True)
    + p(f'El {full[imx]} hubo {R7["dia"][imx]} recorridos de soja y el ciclo fue de {R7["totDia"][imx]} min. El {full[top2[1]]} le siguió en volumen ({R7["dia"][top2[1]]}), con {R7["totDia"][top2[1]]} min.', 28)
    + p(f'El {full[islow]} fue el día más lento: {R7["totDia"][islow]} min con {R7["dia"][islow]} recorridos.' + ('' if ifast == imx else f' El más rápido, el {full[ifast]}: {R7["totDia"][ifast]} min.'), 28)
    + key(f'El {full[islow]} el tiempo se fue en {causa[2]}: {causa[0]} llegó a {causa[1]} min (media de la semana {T7["playaOsl" if causa[0] == "Playa OSL" else "playa1"]}).')
    + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Días de mayor volumen', GDK), ('Resto', GLT)])
    + f'<p style="font-size:24px; color:{BODY}">Recorridos de soja R7 por día y, abajo, minutos puerta a puerta</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{bars}</div></div></div>',
    'Recorridos R7 de la corrida por día operativo (final_circuits, día del inicio en circuit_timing_journeys) y puerta a puerta medio del día por patente (r7-camaras.cjs, viajes medidos: ' + ', '.join(map(str, R7['totN'])) + '): '
    + ', '.join(f'{days[i].lower()} {R7["dia"][i]} / {R7["totDia"][i]} min' for i in range(N)) + '. '
    f'Playa 1 por día: {", ".join(map(str, p1_d))}; Playa OSL por día: {", ".join(map(str, osl_d))}. Días con menos de 10 viajes medidos no entran en «más lento» ni «más rápido». Sin cruce con mantenimiento para esta semana.')

# plantas
pchart = hstack([(days[k], R7['ricDia'][k], R7['slzDia'][k]) for k in range(N)], width=980, bh=40, gap=8)
var_r, var_s = max(R7['ricDia']) - min(R7['ricDia']), max(R7['slzDia']) - min(R7['slzDia'])
mas = 'San Lorenzo' if var_s > var_r else 'Ricardone'
section('plantas', head('Soja · R7', f'Tiempos por planta, día por día: {mas} fue la que más varió', cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">' + legend([('Ricardone', HC1), ('San Lorenzo', HC2)])
    + f'{pchart}</div><div style="width:440px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Ricardone se movió entre <b>{min(R7["ricDia"])} y {max(R7["ricDia"])} min</b>. San Lorenzo, entre <b>{min(R7["slzDia"])} y {max(R7["slzDia"])} min</b>.', 28)
    + p(f'El pico de Ricardone fue el {full[R7["ricDia"].index(max(R7["ricDia"]))]} ({max(R7["ricDia"])} min); el de San Lorenzo, el {full[R7["slzDia"].index(max(R7["slzDia"]))]} ({max(R7["slzDia"])} min).', 28)
    + key(f'La variación de la semana se jugó en {mas}.', 28) + '</div></div>',
    f'Minutos promedio por planta y por día, medidos por patente con cámaras (r7-camaras.cjs). Ricardone = pre-ingreso → egreso; San Lorenzo = ingreso al puerto → salida. Viajes medidos por día: {", ".join(map(str, R7["totN"]))}. '
    f'Promedio de la semana: Ricardone {R7["ric"]} ({N7["ric"]} viajes), San Lorenzo {R7["slz"]} ({N7["sl"]} viajes).')

# cuartos
QCOL = {'Q4': GDK, 'Q3': '#7B1E3A', 'Q2': '#C9651A', 'Q1': '#C8372D'}
dayq = [sum(qd[q][i] for q in qd) for i in range(N)]
mxq = max(dayq) or 1
stack = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600">{dayq[i]}</p><div style="display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                + ''.join(f'<div style="width:68px; height:{round(qd[q][i] / mxq * 400)}px; background:{QCOL[q]}"></div>' for q in ('Q4', 'Q3', 'Q2', 'Q1'))
                + f'</div><p style="font-size:24px; font-weight:600; white-space:nowrap">{days[i]}</p></div>' for i in range(N))
qtot = sum(QN.values())
pq = {q: round(QN[q] / qtot * 100) for q in QN}
qrow = lambda q, lab: f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QCOL[q]}; border-radius:12px; padding:16px 24px"><p style="font-size:28px; font-weight:600; width:220px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QCOL[q]}">{pq[q]} %</p><p style="font-size:24px; color:{BODY}">{QN[q]}</p></div>'
qmax = max(pq, key=pq.get); otros = [pq[q] for q in pq if q != qmax]
QL = {'Q1': 'la noche (Q1)', 'Q2': 'la mañana (Q2)', 'Q3': 'el mediodía (Q3)', 'Q4': 'la tarde (Q4)'}
section('cuartos', head('Soja · R7', f'{cap(QL[qmax])} concentró el ingreso: {pq[qmax]} %', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:40px"><div style="flex:1; display:flex; flex-direction:row; gap:4px; align-items:end">{stack}</div><div style="width:480px; display:flex; flex-direction:column; gap:20px">'
    + qrow('Q1', 'Q1 · 22–04 h') + qrow('Q2', 'Q2 · 04–10 h') + qrow('Q3', 'Q3 · 10–16 h') + qrow('Q4', 'Q4 · 16–22 h')
    + key(f'{cap(QL[qmax])} fue el cuarto más cargado ({pq[qmax]} %); los otros tres quedaron entre {min(otros)} y {max(otros)} %.')
    + '</div></div>',
    f'Viajes R7 medidos por cámaras ({qtot}, r7-camaras.cjs) por cuarto del día operativo según la hora del pre-ingreso (o de la calada si no se leyó). Franjas: 22–04 / 04–10 / 10–16 / 16–22. '
    'Es una muestra (los viajes que las cámaras leyeron completos), no el total de camiones: sirve para el reparto entre cuartos, no para la cantidad.', bg=BG2)

# histórico
W_ = weeks + ['Actual']
section('historico', head('Soja · R7', 'Dónde queda la semana: ' + ('el tiempo más bajo desde junio' if rk_tot == 1 else f'{ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio'), cam=True)
    + legend([('Tiempo puerta a puerta (min) · rótulo = fecha del comité', GDK), (f'Promedio de la serie: {avg(TOT)}', BODY)])
    + linechart(TOT + [R7['total']], W_, GDK, 200, 500 if max(TOT) <= 500 else 600, avg(TOT), hollow=(len(W_) - 1,) if CAMARAS else ())
    + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
    + ctx('Ricardone · espera Playa 1', f'{R7["p1"]} min', P1 + [R7['p1']], GDK, f'Promedio desde junio: {avg(P1)}')
    + ctx(f'San Lorenzo · {CAL_LBL} → esta semana', f'{R7["slz"]} min', [TP['sl'], R7['slz']], VMID, f'Ingreso → salida por cámaras ({TP["sl"]} → {R7["slz"]})')
    + key(f'{R7["total"]} min contra {PUB["total"]} del comité anterior; Playa 1 en {R7["p1"]} min, {"debajo" if R7["p1"] < avg(P1) else "arriba"} del promedio de la serie ({avg(P1)}).') + '</div>',
    f'Tiempo puerta a puerta R7 por comité (rótulo = fecha del comité, que informa la semana previa); «Ant.» = comité anterior ({ANT_LBL}, {PUB["total"]} min, planilla). '
    + (f'«Actual» (círculo hueco) = esta semana medida por cámaras ({R7["total"]} min): el método se calibró en {CAL_LBL} ({K7["p2pCamara"]} por cámaras contra {K7["p2pPlanilla"]} de la planilla), así que es comparable con la serie; se confirma con la planilla. ' if CAMARAS else '')
    + f'Playa 1: serie publicada y esta semana por cámaras (en {CAL_LBL} el mismo método dio {TP["playa1"]} contra {PUB["p1"]} publicado para el período). San Lorenzo no se agrega a la serie publicada (suma de tramos de otra muestra, {PUB["slz"]} min en el comité anterior): se muestra la comparación por cámaras con el mismo método.', gap=24)

# ------------------------------------------------------------------ pellet (solo monitoreo)
divider('div-pellet', '02', 'Pellet', 'Transile de pellet de girasol de Ricardone a las volcables del puerto: monitoreo de la semana.', PEL, '#E3C9A3')
pl_blk = [b for b in PE['bloques'] if b['viajes'] >= 5]
if PE['viajes']:
    prow = [(days[iD[d]], PE['tramosDia'][d]['ric']['mean'], PE['tramosDia'][d]['sl']['mean']) for d in pdays]
    vv = sorted(PE['porVolcable'].items(), key=lambda kv: -kv[1])
    section('pellet-operativo', head('Pellet · transile', f'Un operativo corto: {fmtn(PE["viajes"])} viajes leídos, el {y_([full[iD[d]] for d in pdays], last=" y el ")}', PEL, cam=True)
        + '<div style="flex:1; display:flex; flex-direction:row; gap:48px"><div style="width:440px; display:flex; flex-direction:column; gap:16px">'
        + (box(fmtn(PPE['planillaEgresosPellet']), 'Egresos de pellet de la planilla', f'{PE["viajes"]} leídos por cámaras · {PE["camiones"]} camiones') if PPE else box(fmtn(PE['viajes']), 'Viajes leídos por cámaras', f'{PE["camiones"]} camiones distintos'))
        + box(f'{len(pl_blk)} tanda' + ('s' if len(pl_blk) != 1 else ''), ' y '.join(f'{b["inicio"][8:10]}/{b["inicio"][5:7]} {b["inicio"][11:13]}–{b["fin"][11:13]} h' for b in pl_blk))
        + box(f'{pt["ciclo"]} min', 'Ciclo por viaje', f'contra {ptp["ciclo"]} en el operativo anterior')
        + '</div><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
        + f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">{legend([("Ricardone", HC1), ("San Lorenzo", HC2)])}<p style="font-size:24px; color:{BODY}">Tiempo por viaje, día por día (min)</p></div>'
        + hstack(prow, width=900, bh=60, gap=18, lab_w=120)
        + '</div></div>'
        + key(f'Sin fila en el puerto: San Lorenzo tomó {pt["sl"]} min por viaje, contra {ptp["sl"]} en el operativo anterior. Descargó por la {vv[0][0]}.'),
        f'Transile de pellet de girasol de Ricardone al puerto, solo con cámaras (pellet-camaras.cjs): balanza de egreso de Ricardone con Playa 3 o calle líquida antes, sin calada sólida, silo ni volcable de Ricardone, y lecturas del puerto en las 12 h siguientes. '
        f'Viajes por día: {", ".join(f"{fdm(d)} {PE["viajesDia"][d]}" for d in pdays)}; camiones por día: {", ".join(f"{fdm(d)} {PE["camionesDia"][d]}" for d in pdays)}. Volcable leída: {", ".join(f"{k} {v}" for k, v in vv)}. '
        f'Calibración contra la planilla ({fdm(list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])}): las cámaras vieron {PK["emparejados"]} de los {PK["planillaEgresosPellet"]} egresos de pellet de Ricardone ({round(PK["recall"] * 100)} %) y el {round(PK["precision"] * 100)} % de lo que vieron era pellet de la planilla. '
        f'Con esa cobertura, la semana rondaría {round(PE["viajes"] / PK["recall"])} viajes; la planilla dará el número. Operativo anterior (comité {ANT_LBL}): {fmtn(PUB["pel_viajes"])} viajes de la planilla, ciclo publicado {PUB["pel_ciclo"]} min; con este mismo método de cámaras, ciclo {ptp["ciclo"]} y puerto {ptp["sl"]} min. Monitoreo: sin propuesta de puerto ni de flete.', gap=26)
    vp = [pt['playa1'], pt['ptara'], pt['carga'], pt['interplanta'], pt['playaOsl'], pt['descarga'], pt['salida']]
    vpn = [ptn['playa1'], ptn['ptara'], ptn['carga'], ptn['interplanta'], ptn['playaOsl'], ptn['descarga'], ptn['salida']]
    vpp = [ptp['playa1'], ptp['ptara'], ptp['carga'], ptp['interplanta'], ptp['playaOsl'], ptp['descarga'], ptp['salida']]
    ric_p, sl_p = sum(vp[:3]), sum(vp[4:])
    TRN = ['Playa 1', 'Acceso P3', 'Carga', 'Interplanta', 'Playa OSL', 'Descarga', 'Salida']
    imaxd = max(range(7), key=lambda i: vpp[i] - vp[i])
    section('pellet-tramos', head('Pellet · transile', 'Pellet: tiempos medios por tramo', PEL, cam=True)
        + tramos([('Playa 1', 'Pre-ingreso → Calle líquida'), ('Acceso P3', 'Calle líquida → Playa 3'), ('Carga', 'Playa 3 → Balanza egreso'), ('Interplanta', 'Balanza egreso → Ingreso SLZ'), ('Playa OSL', 'Ingreso SLZ → Balanza OSL'), ('Descarga', 'Balanza OSL → Volcable'), ('Salida', 'Volcable → Salida SLZ')],
                 [max(1, v or 0) for v in vp], [GLT, GMID, PELM, GREY, VIO, VMID, VXLT], [TEXT, TEXT, PEL, TEXT, VIO, VMID, TEXT],
                 [('b', 0, 3, f'Ricardone · {ric_p} min', PELM, PEL), ('gap', 3, 4, '', '', ''), ('b', 4, 7, f'San Lorenzo · {sl_p} min', VMID, VIO)])
        + '<div style="display:flex; flex-direction:row; gap:24px">'
        + kcard(f'Ciclo completo por viaje · {hm(pt["ciclo"])}', f'{pt["ciclo"]} min', PELM, PEL)
        + kcard('Operativo anterior, mismo método', f'{ptp["ciclo"]} min', GMID, GDK)
        + kcard('Viajes por camión en la semana', fx(PE['viajes'] / PE['camiones']), VMID, VIO) + '</div>'
        + key(f'La diferencia con el operativo anterior está en {TRN[imaxd]}: {vpp[imaxd]} → {vp[imaxd]} min. La carga en Ricardone tomó {pt["carga"]} min.'),
        f'Tramos medidos por cámaras sobre los {PE["viajes"]} viajes leídos (viajes con cada tramo: {", ".join(f"{a} {b}" for a, b in zip(TRN, vpn))}). Suman {sum(v or 0 for v in vp)}; el ciclo medido de punta a punta da {pt["ciclo"]} ({ptn["ciclo"]} viajes). '
        f'Operativo anterior con el mismo método ({fdm(list(PK["planillaPorDia"])[0])}–{fdm(list(PK["planillaPorDia"])[-1])}, {PEP["viajes"]} viajes): ' + ', '.join(f'{a} {b}' for a, b in zip(TRN, vpp)) + f', ciclo {ptp["ciclo"]}.', gap=32)
    # histórico de operativos
    fd = lambda s_: f'{s_[8:10]}/{s_[5:7]}'
    cols_w = [170, 260, 140, 170, 250, 200, 140, 160]
    hdr = ['Comité', 'Período', 'Viajes', 'Camiones', 'Viajes por camión', 'Toneladas', 'Horas', 'Ciclo']
    def row(cells, bold=False, bg=None, col=TEXT):
        return (f'<div style="display:flex; flex-direction:row; align-items:center; border-top:1px solid {LINE}; padding:10px 0px{"; background:" + bg if bg else ""}">'
                + ''.join(f'<p style="width:{w}px; font-size:26px; font-weight:{600 if bold or k == 0 else 400}; color:{col}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, cells))) + '</div>')
    PH = [dict(o, comite=('Ant.' if o['id'] == 'actual' else o['comite'])) for o in ANT['pelletHistorico']]
    horas_act = round(sum(b['horas'] for b in pl_blk), 1)
    table = (f'<div style="display:flex; flex-direction:row; padding:0px 0px 6px 0px">' + ''.join(f'<p style="width:{w}px; font-size:24px; font-weight:600; color:{BODY}; text-align:{"left" if k < 2 else "right"}">{c}</p>' for k, (w, c) in enumerate(zip(cols_w, hdr))) + '</div>'
             + ''.join(row([o['comite'] or '—', f'{fd(o["desde"])} a {fd(o["hasta"])}', fmtn(o['viajes']), str(o['camiones']), fx(o['viajesPorCamion']),
                            f'{fmtn(o["toneladas30"])} t', fx(o['horas']), f'{o["ciclo"]} min' if o['ciclo'] else '—']) for o in PH)
             + row(['Actual', f'{fd(pdays[0])} a {fd(pdays[-1])}', f'{fmtn(PE["viajes"])}*', f'{PE["camiones"]}*', fx(PE['viajes'] / PE['camiones']), f'{fmtn(PE["viajes"] * 30)} t*', fx(horas_act), f'{pt["ciclo"]} min'], bold=True, bg=PELL, col=PEL))
    section('pellet-hist', head('Pellet · transile', 'Los operativos de pellet desde junio' + (': este fue el más chico' if PE['viajes'] / PK['recall'] < min(o['viajes'] for o in PH) else ''), PEL)
        + f'<div style="display:flex; flex-direction:column">{table}</div>'
        + '<div style="display:flex; flex-direction:row; gap:48px">'
        + p(f'* Según cámaras: viajes leídos, no viajes de la planilla. Con la cobertura medida ({round(PK["recall"] * 100)} %) serían unos {round(PE["viajes"] / PK["recall"])}.', 26, BODY, '; flex:1')
        + '<div style="flex:1">' + key(f'Operativo de {PE["camiones"]} camiones y {fx(horas_act)} h de actividad, con ciclo de {pt["ciclo"]} min: el más corto de la serie.' if pt['ciclo'] < min(o['ciclo'] for o in PH if o['ciclo']) else f'Operativo de {PE["camiones"]} camiones y {fx(horas_act)} h de actividad, con ciclo de {pt["ciclo"]} min.') + '</div></div>',
        'Operativos anteriores: planilla de movimientos (transile de pellet de girasol de Ricardone al puerto, sin patentes ficticias); camiones = patentes distintas; toneladas = viajes × 30; horas = tramos continuos de actividad; ciclo = el publicado en cada comité. '
        f'Esta semana: cámaras (pellet-camaras.cjs); horas = bloques de viajes leídos separados por más de 4 h; toneladas = viajes leídos × 30. Se reemplaza por la planilla cuando llegue.', gap=24)

# ------------------------------------------------------------------ girasol
divider('div-girasol', '03', 'Girasol', 'Recepción de girasol en las volcables de Ricardone (R5 volcable 1 y R6 volcable 2).', VIO, '#B9A8E0')
if GIR_OK:
    gt_sum = 3 + GI['p1'] + GI['calVolc'] + GI['tara']
    section('girasol', head('Girasol · R6', 'Girasol: tiempos medios por tramo', VIO, cam=True)
        + tramos([('Ingreso', 'Ingreso → Pre-ingreso'), ('Playa 1', 'Pre-ingreso → Calada'), ('Calada a volcable', 'Calada → balanza → Playa 3 → Volcable'), ('Tara', 'Volcable → Balanza egreso')],
                 [3, GI['p1'], GI['calVolc'], GI['tara']], [GLT, GDK, VIO, VMID], [TEXT, GDK, VIO, TEXT], [('b', 0, 4, f'Ricardone · {gt_sum} min ({hm(gt_sum)})', VIO, VIO)])
        + '<div style="display:flex; flex-direction:row; gap:24px">'
        + kcard(f'Pre-ingreso → balanza de egreso · {hm(GI["total"])}', f'{GI["total"]} min', VIO, VIO)
        + kcard(f'Mismo método, {ANT_LBL}', f'{GAT["total"]} min', GMID, GDK)
        + kcard('Recorridos por la volcable 2', fmtn(GI['rec']), GDK, GDK) + '</div>'
        + key(f'La espera en Playa 3 para volcar bajó de {GAT["descarga"]} a {GI["desc"]} min y Playa 1, de {GAT["p1"]} a {GI["p1"]}: el girasol pasó {round((1 - GI["total"] / GAT["total"]) * 100)} % más rápido que en el comité anterior.' if GI['total'] < GAT['total'] else f'Pre-ingreso → balanza de egreso: {GI["total"]} min contra {GAT["total"]} del comité anterior.'),
        f'Girasol, medido por patente con cámaras (metricas-camaras.cjs): calada → volcable de Ricardone. Tramos (camiones medidos): Playa 1 {GI["p1"]} ({GN_["p1"]}), calada → volcable {GI["calVolc"]} ({GN_["calVolc"]}; de eso, Playa 3 → volcable {GI["desc"]}, {GN_["descarga"]}), tara {GI["tara"]} ({GN_["tara"]}); ingreso 3 min (paquete). '
        f'Pre-ingreso → balanza de egreso medido de punta a punta: {GI["total"]} min ({GN_["total"]} camiones). Mismo método en {ANT_LBL} (cámaras de la PC de la oficina): Playa 1 {GAT["p1"]}, calada → volcable {GAT["calVolc"]}, Playa 3 → volcable {GAT["descarga"]}, tara {GAT["tara"]}, total {GAT["total"]}. '
        f'El comité anterior publicó {PUB["g_total"]} min como suma de tramos de otra base (publicado 17–23/09 + variación por cámaras), por eso se compara contra la medición por cámaras. '
        f'Recorridos de la cámara de la volcable 2 por día: {", ".join(map(str, GI["dia"]))}; volcable 1 sin lecturas (sin girasol R5 en la planilla desde el 28/09). Camiones con el viaje completo por patente: {GI["viajes"]}.', gap=32)
    section('girasol-hist', head('Girasol · R5+R6', 'Dónde queda la semana', VIO, cam=True)
        + legend([('Tiempo total publicado, suma de tramos (min) · rótulo = fecha del comité', VIO), (f'Promedio de la serie: {avg(GT)}', BODY)])
        + linechart(GT, weeks, VIO, 200, 500, avg(GT))
        + '<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
        + ctx(f'Por cámaras · {ANT_LBL} → esta semana', f'{GI["total"]} min', [GAT['total'], GI['total']], VIO, f'Pre-ingreso → balanza de egreso ({GAT["total"]} → {GI["total"]})')
        + ctx('Espera en Playa 3 para volcar', f'{GI["desc"]} min', [GAT['descarga'], GI['desc']], VMID, f'Mismo método: {GAT["descarga"]} → {GI["desc"]}')
        + key(f'Por cámaras, el girasol tardó {abs(pct(GI["total"], GAT["total"]))} % {"menos" if GI["total"] < GAT["total"] else "más"} que en el comité anterior; la planilla dirá dónde queda en la serie.') + '</div>',
        f'Serie publicada por comité hasta el anterior («Ant.», {ANT_LBL}: {PUB["g_total"]} min). Esta semana no se agrega a la serie porque sin planilla no hay suma de tramos comparable; se muestra la medición por cámaras con el mismo método en los dos períodos ({GAT["total"]} → {GI["total"]} min).', gap=24)

# ------------------------------------------------------------------ líquidos
divider('div-liquidos', '04', 'Líquidos', 'Aceites, borras, glicerina e insumos químicos: un criterio nuevo para contarlos y lo que vieron las cámaras en la semana.', BLU, '#A9C8E6')
LPS = LCR['porPlantaSentido']; LPF = LCR['porPlantaFamiliaSentido']
g = lambda k: LPS.get(k, {'n': 0, 'mediana': None, 'media': None})
TE, TI, RI, RE = g('TERMINAL_EMBARQUE · EGRESO'), g('TERMINAL_EMBARQUE · INGRESO'), g('RICARDONE · INGRESO'), g('RICARDONE · EGRESO')
ric_tot = RI['n'] + RE['n']
def crit(n, t, sub):
    return f'<div style="display:flex; flex-direction:row; gap:18px; align-items:start"><p style="width:52px; height:52px; border-radius:26px; background:{BLU}; color:#FFFFFF; font-size:28px; font-weight:600; text-align:center; line-height:52px">{n}</p><div style="flex:1; display:flex; flex-direction:column; gap:2px"><p style="font-size:28px; font-weight:600; color:{TEXT}">{t}</p><p style="font-size:24px; line-height:1.35; color:{BODY}">{sub}</p></div></div>'
section('liq-criterio', head('Líquidos · criterio', 'Cómo contamos líquidos: por producto, por planta y por sentido', BLU)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:22px">'
    + crit(1, 'Por producto, no por circuito', 'Aceites a granel, borras, glicerinas e insumos químicos líquidos (metanol, metilato, ácidos, soda). Fuera: envasados, agua, alcohol y vinaza de Avellaneda, nitrógeno, sal glicerinosa.')
    + crit(2, 'Solo camiones', 'Sin patentes ficticias (TTTTTT, PPPPPP, XXXXXX): son traspasos por cañería, no camiones.')
    + crit(3, 'Ricardone y Terminal por separado', 'Renopack aparte: no tiene cámaras.')
    + crit(4, 'Cargas y descargas por separado', 'Egreso = carga, ingreso = descarga. Día operativo del ingreso (desde las 22 h) en todas las láminas.')
    + crit(5, 'Tiempo: mediana de la planilla', 'Ingreso → salida. La media se infla con los camiones que quedan de un día para otro.')
    + '</div><div style="width:640px; display:flex; flex-direction:column; gap:16px">'
    + f'<p style="font-size:24px; color:{BODY}">{ANT_LBL} recalculado con este criterio · movimientos de la planilla</p>'
    + note(fmtn(LCR['total']['n']), f'camiones de líquidos (el comité anterior publicó {fmtn(PUB["liq"])}).', BLU, BLU)
    + note(fmtn(TE['n'] + TI['n']), f'en la Terminal: {TE["n"]} cargas (mediana {TE["mediana"]} min) y {TI["n"]} descargas (mediana {TI["mediana"]} min).', BMID)
    + note(fmtn(ric_tot), f'en Ricardone: {RI["n"]} descargas (mediana {RI["mediana"]} min) y {RE["n"]} cargas. No eran 161: la cifra de «R8» sumaba la glicerina de la Terminal.', GLT)
    + '</div></div>',
    f'Criterio propuesto (pendiente de aprobación) y aplicado a {ANT_LBL} con liquidos-criterio.cjs sobre data/movimientos (nivel A, sin repetir external_operation_id). '
    f'De {fmtn(PUB["liq"])} publicados a {fmtn(LCR["total"]["n"])}: salen 29 movimientos con patente ficticia (traspasos por cañería) y 6 que no son líquidos (productos varios 3, nitrógeno 2, residuos 1); entran 48 insumos químicos de la Terminal y Ricardone (metanol 33, metilato 7, ácidos 5, soda 2, hipoclorito 1) que el filtro por circuito dejaba afuera. '
    f'«R8» publicado = 161: 90 eran glicerina de la Terminal (70 cargas, 20 descargas) con circuito R8 resuelto, 12 movimientos por cañería y 3 productos varios; camiones de líquidos de Ricardone: {ric_tot}. '
    f'Renopack ({sum(v["n"] for v in LCR["renopack"].values())} movimientos de aceite refinado a granel) queda aparte. Media puerta a puerta: Terminal cargas {TE["media"]}, descargas {TI["media"]}, Ricardone descargas {RI["media"]} min.', gap=28)
# por familia (período anterior recalculado)
FAMCOL = {'aceite': BLU, 'glicerina': BMID, 'borras': '#A9C8E6', 'insumos químicos': VMID, 'biodiésel': GREY, 'lecitina': GREY}
def famcol(planta, mx):
    rs = sorted([(k.split(' · ')[1], k.split(' · ')[2], v) for k, v in LPF.items() if k.startswith(planta)], key=lambda r: (r[1] != 'EGRESO', -r[2]['n']))
    out = ''
    for fam, se, v in rs:
        out += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:330px; font-size:26px; color:{TEXT}"><b>{fam}</b> · {"carga" if se == "EGRESO" else "descarga"}</p>'
                f'<div style="width:{max(6, round(v["n"] / mx * 330))}px; height:40px; background:{FAMCOL.get(fam, BLU)}; border-radius:0px 8px 8px 0px"></div>'
                f'<p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{v["n"]}</p><p style="font-size:24px; color:{BODY}; white-space:nowrap">· {v["mediana"]} min</p></div>')
    return out
mxf = max(v['n'] for v in LPF.values())
topk, topv = max(LPF.items(), key=lambda kv: kv[1]['n'])
tp_pl, tp_fam, tp_se = topk.split(' · ')
section('liq-productos', head('Líquidos · criterio', f'Qué se mueve: {"cargas" if tp_se == "EGRESO" else "descargas"} de {tp_fam} en la {"Terminal" if tp_pl.startswith("TERMINAL") else "Ricardone"}, {round(topv["n"] / LCR["total"]["n"] * 100)} % de los camiones', BLU)
    + f'<p style="font-size:24px; color:{BODY}">{ANT_LBL} · camiones de líquidos de la planilla por familia de producto y sentido · mediana puerta a puerta</p>'
    + '<div style="flex:1; display:flex; flex-direction:row; gap:64px">'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:14px"><p style="font-size:30px; font-weight:600; color:{BLU}">Terminal · {TE["n"] + TI["n"]}</p>{famcol("TERMINAL", mxf)}</div>'
    + f'<div style="width:760px; display:flex; flex-direction:column; gap:14px"><p style="font-size:30px; font-weight:600; color:{BLU}">Ricardone · {ric_tot}</p>{famcol("RICARDONE", mxf)}</div></div>'
    + key(f'La Terminal hace el {round((TE["n"] + TI["n"]) / LCR["total"]["n"] * 100)} % de los camiones de líquidos y el {round(TE["n"] / (TE["n"] + TI["n"]) * 100)} % de ellos son cargas; Ricardone casi solo descarga ({RI["n"]} de {ric_tot}).'),
    'Mismo criterio de la lámina anterior. Familias: aceite (crudo, para refinar, refinado, oleico, desgomado, neutro), borras, glicerina (cruda, refinada, substandard), insumos químicos (metanol, metilato, ácidos, soda, hipoclorito). '
    + '; '.join(f'{k.replace("TERMINAL_EMBARQUE", "Terminal").replace("RICARDONE", "Ricardone").replace(" · EGRESO", " · cargas").replace(" · INGRESO", " · descargas")}: {v["n"]} (mediana {v["mediana"]} min, media {v["media"]})' for k, v in LPF.items()) + '.', gap=24)
# semana por cámaras
mxl = max(lq_dia) or 1
lbars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{LC["porDia"][d]["TER"] + LC["porDia"][d]["RIC"]}</p><div style="width:64px; display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">'
                f'<div style="height:{round(LC["porDia"][d]["TER"] / mxl * 330)}px; background:{BLU}"></div><div style="height:{round(LC["porDia"][d]["RIC"] / mxl * 330)}px; background:#A9C8E6"></div></div><p style="font-size:24px; font-weight:600; color:{TEXT}; white-space:nowrap">{days[i]}</p></div>' for i, d in enumerate(DAYS))
kT, kR = LK['TER'], LK['RIC']
ter_d, ter_dp = LQV['TER'] / N, LKV['TER'] / LKD
section('liq-semana', head('Líquidos · la semana', (f'La Terminal mantuvo su ritmo: {round(ter_d)} visitas de camión por día' if abs(pct(ter_d, ter_dp)) <= 10 else f'La Terminal {"subió" if ter_d > ter_dp else "bajó"} a {round(ter_d)} visitas de camión por día ({spct(pct(ter_d, ter_dp))})'), BLU, cam=True)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px">'
    + legend([('Terminal San Lorenzo', BLU), ('Ricardone', '#A9C8E6')], f'<div style="flex:1"></div><p style="font-size:24px; color:{BODY}">Visitas de camión a la zona de líquidos por día</p>')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{lbars}</div></div>'
    + '<div style="width:480px; display:flex; flex-direction:column; justify-content:center; gap:16px">'
    + note(fmtn(LQV['TER']), f'visitas en la Terminal; {round(ter_dp)} por día en {CAL_LBL}. Cargas leídas en la playa OSL: {LC["terminalCargaDescarga"]["carga"]}.', BLU, BLU)
    + note(fmtn(LQV['RIC']), f'visitas en Ricardone ({fx(LQV["RIC"] / N)} por día; {fx(LKV["RIC"] / LKD)} en {CAL_LBL}).', GLT)
    + (note(fmtn(LCW['total']['n']), 'movimientos de líquidos en la planilla de la semana: ' + ', '.join(f'{k.replace("TERMINAL_EMBARQUE", "Terminal").replace("RICARDONE", "Ricardone").replace(" · EGRESO", " cargas").replace(" · INGRESO", " descargas")} {v["n"]}' for k, v in LCW['porPlantaSentido'].items()) + '.', BMID)
       if LCW else note(f'{round(kT["precision"] * 100)} %', f'de las visitas de la Terminal eran líquidos en la calibración; el resto, agua, residuos y varios.', BMID))
    + '</div></div>',
    f'Estimación SOLO con cámaras (liquidos-camaras.cjs): visita = lecturas de una patente en una planta separadas por menos de 4 h. Terminal: entrada (SLZIngCamFrente o SLZBalIngFte) y alguna lectura de carga/descarga OSL, tanques (SLZTK400), balanza de líquidos o calada SL, sin volcable del puerto ni carga de sólido en Ricardone antes. '
    f'Ricardone: pre-ingreso y calle líquida o balanza 2, sin Playa 3, calada sólida, silo ni volcable, y sin ir a la Terminal después (eso es pellet o soja). '
    f'Calibración contra la planilla en {CAL_LBL} (criterio por producto): Terminal {kT["visitasCamara"]} visitas para {kT["movimientosPlanilla"]} movimientos de líquidos; {kT["conVisita"]} movimientos tuvieron visita ({round(kT["cobertura"] * 100)} %) y el {round(kT["precision"] * 100)} % de las visitas era un líquido ({kT["porFamiliaPlanilla"].get("agua", 0)} agua, {kT["porFamiliaPlanilla"].get("otro", 0)} otros productos). '
    f'Ricardone: {kR["visitasCamara"]} visitas para {kR["movimientosPlanilla"]} movimientos; cobertura {round(kR["cobertura"] * 100)} %, precisión {round(kR["precision"] * 100)} %: con tan pocos camiones por día, la cifra de Ricardone es solo indicativa. '
    f'Visitas por día (Terminal/Ricardone): ' + ', '.join(f'{days[i].lower()} {LC["porDia"][d]["TER"]}/{LC["porDia"][d]["RIC"]}' for i, d in enumerate(DAYS)) + '. Desde el 05/10 la cámara RenDescFte (descarga OSL) lee camiones; antes solo leía la de carga. No son movimientos: la planilla dará cargas y descargas por producto.', gap=28)

# ------------------------------------------------------------------ sectores
divider('div-sectores', '05', 'Sectores', 'Calada, volcables y silos: dónde se concentró la actividad de la semana.', GDK, GLT)
calles = sorted([(f'Calle {k[-1]}', v) for k, v in CAL['porCalle'].items()] + [(f'Calle {n}', 0) for n in '123456' if f'RicCal0{n}' not in CAL['porCalle']], key=lambda x: -x[1])
ccol = [GDK, GDK, GLT, GLT, GXLT, GXLT]
crows = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px"><p style="width:140px; font-size:28px; font-weight:600; color:{TEXT}">{a}</p><div style="width:{max(6, round(b / (calles[0][1] or 1) * 560))}px; height:48px; background:{ccol[i]}; border-radius:0px 8px 8px 0px"></div><p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(b)}</p></div>' for i, (a, b) in enumerate(calles))
calles_tot = sum(CAL['porCalle'].values())
c34 = CAL['porCalle'].get('RicCal04', 0) + CAL['porCalle'].get('RicCal03', 0)
p34 = round(c34 / calles_tot * 100)
cal_dia, cal_dia_prev = CAL['camiones'] / N, PUB['cal'] / ANT_N
c12 = [d for d in DAYS if CAL['calleDia'][d].get('RicCal01', 0) or CAL['calleDia'][d].get('RicCal02', 0)]
section('calada', head('Sectores · calada', ('Calada con menos recorridos por día, solo por las calles 3 y 4' if p34 >= 99 else f'Calada con menos recorridos por día: las calles 3 y 4 hicieron el {p34} %') if cal_dia < cal_dia_prev else f'Calada: las calles 3 y 4 hicieron el {p34} %', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · recorridos de cámara por calle ({calles_tot - CAL["camiones"]} pasaron por dos)</p><div style="display:flex; flex-direction:column; gap:20px">{crows}</div></div>'
    + f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Horas con actividad, sobre {HOURS}</p><div style="display:flex; flex-direction:column; gap:16px">'
    + occ('Ricardone sólida', f'{fmtn(CAL["camiones"])} recorridos en {CAL["horas"]} h', round(CAL['horas'] / HOURS * 100), GDK)
    + occ('Ricardone líquida', f'{fmtn(LIQ["camiones"])} recorridos en {LIQ["horas"]} h', round(LIQ['horas'] / HOURS * 100), VMID)
    + occ('San Lorenzo', f'{fmtn(CSL["camiones"])} recorridos en {CSL["horas"]} h', round(CSL['horas'] / HOURS * 100), VMID) + '</div></div></div>'
    + key(f'{fmtn(cal_dia)} recorridos por día, contra {fmtn(cal_dia_prev)} en el comité anterior ({round((1 - cal_dia / cal_dia_prev) * 100)} % menos). ' + (f'Las calles 1 y 2 abrieron solo el {y_([full[iD[d]] for d in c12], last=" y el ")}.' if c12 else 'Las calles 1 y 2 no abrieron: toda la semana con la 3 y la 4.')),
    f'Calada por calle, semana completa: ' + ', '.join(f'{a.lower()} {b}' for a, b in calles) + f'. Suman {fmtn(calles_tot)}, no {fmtn(CAL["camiones"])}, porque algunos recorridos pasaron por dos calles. Horas = horas con al menos una lectura, sobre {HOURS} ({N} días). '
    f'Por día: {", ".join(map(str, CAL["porDia"]))}. Pico: {CAL["pico"]} recorridos ({CAL["picoLabel"]}). Comité anterior: {fmtn(PUB["cal"])} recorridos en {ANT_N} días ({PUB["cal_h"]} h con actividad), con el transile R29 pasando por la calada. '
    f'Calada líquida {fmtn(LIQ["camiones"])} en {LIQ["horas"]} h (comité anterior {fmtn(PUB["liq_cal"])}; por día {", ".join(map(str, LIQ["porDia"]))}): cuenta también los camiones de pellet, que entran por la calle líquida rumbo a Playa 3. Fuente: paquete del dashboard sobre la {RUNTXT}.', gap=28)

def cell(v, col=GMID):
    if v >= 20: return f'<div style="width:44px; height:52px; background:{col}; border-radius:10px"></div>'
    if v > 0: return f'<div style="width:44px; height:52px; background:{GXLT}; border:3px solid {GLT}; border-radius:10px"></div>'
    return f'<div style="width:44px; height:52px; border:3px dashed {LINE}; border-radius:10px"></div>'
vrows_order = sorted(VOL, key=lambda k: -sum(VOL[k]))
mxv = max(sum(v) for v in VOL.values()) or 1
dini = [DOW[wd(d)][:2] for d in DAYS]
vrows = f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:24px; color:{BODY}"></p><p style="width:520px; font-size:24px; font-weight:600; color:{BODY}">Camiones leídos en la semana</p>' + ''.join(f'<p style="width:44px; font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in dini) + f'<p style="flex:1; font-size:24px; font-weight:600; text-align:right; color:{BODY}">Días</p></div>'
for i, k in enumerate(vrows_order):
    tot = sum(VOL[k]); top_ = i == 0
    vrows += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:14px"><p style="width:72px; font-size:32px; font-weight:600; color:{TEXT}">{k}</p><div style="width:520px; display:flex; flex-direction:row; align-items:center; gap:16px"><div style="width:{max(10, round(tot / mxv * 330))}px; height:52px; background:{VIO if top_ else GMID}; border-radius:0px 8px 8px 0px"></div><p style="font-size:30px; font-weight:600; color:{VIO if top_ else TEXT}; white-space:nowrap">{fmtn(tot)} · {round(tot / VOL_TOT * 100)} %</p></div>'
              + ''.join(cell(v, VIO if top_ else GMID) for v in VOL[k])
              + f'<p style="flex:1; font-size:32px; font-weight:600; text-align:right; color:{VIO if top_ else TEXT}">{sum(1 for v in VOL[k] if v >= 20)}</p></div>')
# cambio de volcable: último día con 20 o más de la principal y primer día con 20 o más de la segunda
v1_, v2_ = vrows_order[0], vrows_order[1]
last1 = max((i for i, v in enumerate(VOL[v1_]) if v >= 20), default=None); first2 = min((i for i, v in enumerate(VOL[v2_]) if v >= 20 and (last1 is None or i > last1)), default=None)
relevo = last1 is not None and first2 is not None and first2 > last1
vtit = f'La {v1_} descargó hasta el {full[last1]}; desde el {full[first2]}, la {v2_}' if relevo else f'La {v1_} sostuvo la semana'
section('volcables', head('Sectores · volcables puerto', vtit, VIO, cam=True)
    + f'<div style="display:flex; flex-direction:column; gap:18px">{vrows}</div>'
    + legend([('20 camiones o más', GMID), ('Entre 1 y 19', GXLT)])
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p(f'{v1_} leyó el <b>{round(sum(VOL[v1_]) / VOL_TOT * 100)} %</b> de los camiones ({fmtn(sum(VOL[v1_]))} de {fmtn(VOL_TOT)}); la {v2_}, el {round(sum(VOL[v2_]) / VOL_TOT * 100)} %. La V4 es la del pellet ({sum(VOL["V4"])}, el {y_([full[i] for i, v in enumerate(VOL["V4"]) if v >= 5])}).', 28, BODY, '; flex:1')
    + '<div style="flex:1">' + key(f'Del {full[first2]} en adelante la cámara de la {v1_} casi no leyó y la de la {v2_} tomó el volumen: hay que confirmar con la planilla y mantenimiento si fue un cambio de volcable o una falla de cámara.' if relevo else 'Las cámaras de volcables leen menos camiones que los que descargan: la planilla dará las descargas por volcable.') + '</div></div>',
    f'Camiones distintos leídos por cada cámara de volcable del puerto (SLZVolcableC1 a C5) por día calendario, {LBL} (metricas-camaras.cjs). Incluye el pellet de la V4. Por día: '
    + '; '.join(f'{k} ' + '/'.join(map(str, VOL[k])) for k in vrows_order) + '. '
    f'Sin planilla, el panel del dashboard (descargas R7 con la calle que declara la planilla) da 0: por eso esta lámina usa las lecturas directas. De los {R7["viajes"]} viajes R7 medidos por cámaras, {R7["viajes"] - RC["porVolcable"].get("sin lectura", 0)} tienen la volcable leída: ' + ', '.join(f'{k} {v}' for k, v in sorted(RC['porVolcable'].items(), key=lambda kv: -kv[1])) + '. '
    f'En {CAL_LBL}, la planilla asignó {", ".join(f"{k} {v}" for k, v in sorted(R7P.get("calibracion", {}).get("planillaPorVolcable", {}).items(), key=lambda kv: -kv[1]))} descargas R7.', gap=24)

sbars = daybars(SIL['porDia'], days, lambda i, v: GDK if v >= 5 else GLT, 380, 64)
silcam = SIL['porCalle']
section('silos', head('Sectores · silos Ricardone', 'Silos casi quietos: no hubo transile R29' if not r29['metricas']['total'] else f'Silos: {r29["metricas"]["total"]} transiles R29', cam=True)
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Recorridos de cámara en silos por día (carga y descarga)</p><div style="flex:1; display:flex; flex-direction:row; gap:6px; align-items:end">{sbars}</div></div>'
    + '<div style="width:480px; display:flex; flex-direction:column; gap:28px">'
    + p(f'<b>{SIL["camiones"]} recorridos</b> en silos en toda la semana, contra {fmtn(PUB["sil"])} en el comité anterior ({ANT_N} días).', 28)
    + p(f'Ninguna patente hizo la vuelta del transile (carga en silo → calada → volcable del puerto). El comité anterior tuvo {fmtn(PUB["r29"])} transiles R29 en la planilla, del 24 al 29/09.' if not r29['metricas']['total'] else '', 28)
    + key('La soja de la semana entró directo por la calada; los silos no movieron soja al puerto.' if not r29['metricas']['total'] else 'Transile R29 activo.') + '</div></div>',
    f'Recorridos de cámara en silos por día ({", ".join(map(str, SIL["porDia"]))}); por cámara: ' + ', '.join(f'{k} {v}' for k, v in silcam.items()) + '. '
    f'Transile R29 por cámaras (metricas-camaras.cjs: carga en silo → calada → egreso → volcable del puerto): {r29["metricas"]["total"]} vueltas. Camiones leídos en carga de silo por día: {", ".join(map(str, r29["silosCarga"]))}. Con la planilla se confirma con los egresos SOJA · SILO_CHIEF.', gap=28)

# ------------------------------------------------------------------ cierre
def cx(big, title, txt, band):
    return f'<div style="display:flex; flex-direction:column; gap:10px; background:rgba(255,255,255,0.07); border:1px solid rgba(241,246,242,0.18); border-top:6px solid {band}; border-radius:16px; padding:24px 28px"><p style="font-size:48px; font-weight:600; line-height:1; color:#F1F6F2">{big}</p><h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{band}">{title}</h3><p style="font-size:24px; line-height:1.4; color:#D6E4DA">{txt}</p></div>'
add('cruces', f'<section id="cruces" data-transition="fade" style="background:{VIO}; color:#F1F6F2; font-family:{FONT}; padding:96px 128px 96px; display:flex; flex-direction:column; gap:28px"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, #2E1B4E 0%, #1F3A38 60%, #0B5638 100%)"></div>'
    f'<div style="display:flex; flex-direction:column; gap:12px"><p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Cierre · análisis general</p><h2 style="font-size:72px; font-weight:600; line-height:1.1; color:#F1F6F2">La semana en seis lecturas</h2></div>'
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cx(f'{R7["total"]} min', 'La soja, más rápida', f'Puerta a puerta por cámaras, {sgn(d_tot)} min contra el comité anterior ({PUB["total"]}); {ordinal.get(rk_tot, f"el {rk_tot}.º")} desde junio.', GLT)
    + cx(f'{APR}{fmtn(r7_dia)}', 'Semana liviana', f'Camiones R7 por día ({spct(pct(r7_dia, r7_dia_prev))}); la calada hizo {fmtn(cal_dia)} recorridos por día contra {fmtn(cal_dia_prev)}.', GLT)
    + (cx(f'{GI["total"]} min', 'Girasol, sin la espera de septiembre', f'Por cámaras, contra {GAT["total"]} con el mismo método: la espera en Playa 3 bajó de {GAT["descarga"]} a {GI["desc"]} min.', GLT) if GIR_OK and GI['total'] < GAT['total'] else cx(fmtn(GI['rec']), 'Girasol', f'{GI["rec"]} recorridos por la volcable 2.', GLT))
    + cx(f'{v1_} → {v2_}' if relevo else v1_, 'Volcables del puerto', (f'Desde el {full[first2]} la cámara de la {v1_} casi no leyó y la {v2_} tomó el volumen. Revisar con mantenimiento.' if relevo else f'La {v1_} leyó el {round(sum(VOL[v1_]) / VOL_TOT * 100)} % de los camiones.'), '#B9A8E0')
    + cx(f'{fmtn(PE["viajes"])} viajes', 'Pellet, operativo corto', (f'{y_([full[iD[d]] for d in pdays])}, {PE["camiones"]} camiones, ciclo de {pt["ciclo"]} min sin fila en el puerto.' if PE['viajes'] else 'Sin transile de pellet.'), '#B9A8E0')
    + cx(fmtn(LCR['total']['n']), 'Líquidos, con criterio nuevo', f'{ANT_LBL} recalculado por producto: Terminal {TE["n"] + TI["n"]}, Ricardone {ric_tot}. Falta aprobar el criterio y la planilla de esta semana.', '#B9A8E0')
    + f'</div><div style="flex:1"></div><div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center"><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:180px; height:96px; object-fit:contain"><p style="font-size:24px; color:#C9D8CE">Comité de Logística Nodo Sur · {LBL}</p><img src="{BTZ_L}" alt="Bimtrazer" style="width:170px; height:80px; object-fit:contain"></div>'
    f'<aside>Lecturas para discutir en comité; no son conclusiones cerradas. Semana {LBL}, {"solo cámaras" if CAMARAS else "planilla y cámaras"} ({RUNTXT}). Soja: ≈ {fmtn(R7["est"])} camiones estimados, {R7["total"]} min puerta a puerta por cámaras (calibrado en {CAL_LBL}: {K7["p2pCamara"]} contra {K7["p2pPlanilla"]} de la planilla). '
    f'Ricardone {R7["ric"]} y San Lorenzo {R7["slz"]} min (en {CAL_LBL}, {TP["ric"]} y {TP["sl"]}). Pellet: {PE["viajes"]} viajes leídos. Transile R29: {r29["metricas"]["total"]}. Líquidos: {LQV["TER"]} visitas en la Terminal y {LQV["RIC"]} en Ricardone por cámaras.</aside></section>')

# ------------------------------------------------------------------ write
ORDER = ['portada', 'resumen-planta', 'dia-a-dia', 'div-soja', 'tramos-r7', 'resumen-soja', 'hallazgo', 'plantas', 'cuartos', 'historico',
         'div-pellet', 'pellet-operativo', 'pellet-tramos', 'pellet-hist', 'div-girasol', 'girasol', 'girasol-hist',
         'div-liquidos', 'liq-criterio', 'liq-productos', 'liq-semana', 'div-sectores', 'calada', 'volcables', 'silos', 'cruces']
ORDER = [o for o in ORDER if o in {i for i, _ in slides}]
slides = sorted(slides, key=lambda x: ORDER.index(x[0]))
for f in os.listdir(SL):
    if f.endswith('.html') and f[:-5] not in ORDER: os.remove(os.path.join(SL, f))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
SECC = [('s1', 'Portada, resumen de la planta y la semana día por día', 'portada'),
        ('s2', 'Soja: tiempos por tramo de R7, resumen, día por día, por planta, por horario y en contexto', 'div-soja'),
        ('s2b', 'Pellet: monitoreo del transile de la semana', 'div-pellet'),
        ('s3', 'Girasol: tiempos por tramo y comparación con el comité anterior', 'div-girasol'),
        ('s3b', 'Líquidos: criterio nuevo, qué se mueve y la semana por cámaras', 'div-liquidos'),
        ('s4', 'Sectores: calada, volcables del puerto y silos', 'div-sectores'),
        ('s5', 'Cierre', 'cruces')]
deck = {'v': 4, 'createdOnFiles': {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, 'lists': 'css',
        'title': f'Comité de Logística Nodo Sur · {dd(DAYS[0])} – {dd(DAYS[-1])} {MES[int(DAYS[-1][5:7]) - 1][:3]}',
        'order': ORDER, 'cover': 'portada', 'faces': {'ibm-plex-sans': {'family': 'IBM Plex Sans', 'href': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap'}}, 'designSystems': [], 'sections': {k: {'description': d_, 'start': s} for k, d_, s in SECC if s in ORDER}}
json.dump(deck, open(os.path.join(OUT, 'project', 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'slides': len(slides), 'R7': {k: v for k, v in R7.items()}, 'GI': GI, 'pellet': {'viajes': PE['viajes'], 'ciclo': pt['ciclo']}, 'liq': LQV, 'adentro': [ricA, slA, totA]}, ensure_ascii=False))
