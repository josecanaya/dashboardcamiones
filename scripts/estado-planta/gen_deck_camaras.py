"""Deck "Estado general de la planta" armado SOLO con cámaras (semana sin Excel de movimientos).

Uso:  python scripts/estado-planta/gen_deck_camaras.py <carpeta_salida> <metricas-camaras.json>
Las métricas salen de scripts/estado-planta/metricas-camaras.cjs (misma regla para la semana
actual y la anterior, así la comparación es pareja). Escribe <carpeta_salida>/project/deck.json y
project/slides/<id>.html. Los logos son assets ya copiados al artifact del deck.
"""
import json, os, sys, datetime
ROOT = os.path.abspath(sys.argv[1])
M = json.load(open(sys.argv[2], encoding='utf-8'))
SL = os.path.join(ROOT, 'project', 'slides')
os.makedirs(SL, exist_ok=True)

TITLE = 'Estado de planta · Semana 24–30 sep'
PERIODO = 'semana del 24 al 30/09/2026'
days = ['Jue 24', 'Vie 25', 'Sáb 26', 'Dom 27', 'Lun 28', 'Mar 29', 'Mié 30']

# ---------- paleta (igual que el semanal 17–23) ----------
GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'
FONT="'IBM Plex Sans', Arial, sans-serif"
LOGO_NVA_G='/_blob/050ae33e2fdf6dd13dcdb1e2328a3114'
LOGO_NVA_L='/_blob/070c30550507864396ea35a38f27b002'
LOGO_BTZ='/_blob/0a9b8378b349813a234120f3cb6c9b2a'
LOGO_BTZ_L='/_blob/366eb23c6b39447ebe73078dad2dfe90'

# ---------- datos ----------
S, Sp = M['sectores']['cur'], M['sectores']['prev']
C, Cp = M['calles']['cur'], M['calles']['prev']
R7, R7p = M['circuitos']['cur']['r7'], M['circuitos']['prev']['r7']
G, Gp = M['circuitos']['cur']['gir'], M['circuitos']['prev']['gir']
Hc, Hp = M['horas']['cur'], M['horas']['prev']
tot = lambda k, w=S: sum(w[k])
def pct(a, b): return round((a - b) / b * 100)
def dpct(a, b):
    d = pct(a, b)
    return f'{"+" if d > 0 else "−" if d < 0 else ""}{abs(d)} % vs. semana anterior'
def dmin(a, b):
    d = a - b
    return 'Igual que la semana anterior' if abs(d) <= 2 else f'{"+" if d > 0 else "−"}{abs(d)} min vs. semana anterior'
t = lambda w, k: w['tiempos'][k]['mean']
puerto, puertoP = t(R7, 'egrVolc') + t(R7, 'volcSal'), t(R7p, 'egrVolc') + t(R7p, 'volcSal')
total, totalP = t(R7, 'total'), t(R7p, 'total')
ric, ricP = t(R7, 'ric'), t(R7p, 'ric')
p1, p1P = t(R7, 'p1'), t(R7p, 'p1')
ricDia = [d['ric'] for d in R7['tiemposDia']]
ptoDia = [d['egrVolc'] + d['volcSal'] for d in R7['tiemposDia']]
totDia = [d['total'] for d in R7['tiemposDia']]
p1Dia = [d['p1'] for d in R7['tiemposDia']]
ing, ingP = tot('ingresoRic'), tot('ingresoRic', Sp)
cal, calP = tot('caladaRic'), tot('caladaRic', Sp)
liq, liqP = tot('caladaLiq'), tot('caladaLiq', Sp)
vsl, vslP = tot('volcSL'), tot('volcSL', Sp)
gir = [a + b for a, b in zip(S['volcRic1'], S['volcRic2'])]
girP = [a + b for a, b in zip(Sp['volcRic1'], Sp['volcRic2'])]
silo, siloP = tot('silosCarga'), tot('silosCarga', Sp)
p3, p3P = tot('playa3'), tot('playa3', Sp)
calSL, calSLP = tot('caladaSL'), tot('caladaSL', Sp)
calles = sorted([(f'Calle {k[2]}', sum(v)) for k, v in C.items() if k.startswith('RC')], key=lambda x: -x[1])
callesTot = sum(v for _, v in calles)
c34 = sum(sum(C[k]) for k in ('RC3', 'RC4'))
c34P = sum(sum(Cp[k]) for k in ('RC3', 'RC4')); callesTotP = sum(sum(v) for k, v in Cp.items() if k.startswith('RC'))
def cuartos(h):
    q = {'Q1': [22, 23, 0, 1, 2, 3], 'Q2': range(4, 10), 'Q3': range(10, 16), 'Q4': range(16, 22)}
    s = {k: sum(h[i] for i in v) for k, v in q.items()}
    n = sum(s.values())
    return {k: round(v / n * 100) for k, v in s.items()}
qc, qp = cuartos(Hc['caladaRic']), cuartos(Hp['caladaRic'])
fmtn = lambda v: f'{v:,}'.replace(',', '.')

slides=[]
def footer(n, dark=False):
    nva = LOGO_NVA_L if dark else LOGO_NVA_G
    btz = LOGO_BTZ_L if dark else LOGO_BTZ
    col = '#C9D8CE' if dark else BODY
    return (f'<img src="{nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">'
            f'<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:{col}">Estado de planta · {PERIODO} · §N§</p>'
            f'<img src="{btz}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">')
def sec(id, body, bg=BG, notes='', dark=False, extra='', foot=True):
    color = '#F1F6F2' if dark else TEXT
    html=(f'<section id="{id}" data-transition="fade" style="background:{bg}; color:{color}; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px{extra}">'
          + body + (footer(0, dark) if foot else '') + (f'<aside>{notes}</aside>' if notes else '') + '</section>')
    slides.append((id, html))
def pill(t, bg, fg='#F1F6F2'):
    return f'<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:{fg}; background:{bg}; padding:6px 18px; border-radius:999px">{t}</p>'
def head(tag, title, tagbg=GDK):
    return (f'<div style="display:flex; flex-direction:column; gap:16px">'
            f'<div style="display:flex; flex-direction:row; gap:16px; align-items:center">{pill(tag, tagbg)}</div>'
            f'<h2 style="font-size:64px; font-weight:600; line-height:1.1; color:{TEXT}">{title}</h2></div>')
def p(t, size=30, color=BODY, extra=''):
    return f'<p style="font-size:{size}px; line-height:1.4; color:{color}{extra}">{t}</p>'
def key(t, size=28):
    return f'<p style="font-size:{size}px; line-height:1.4; color:{GDK}; font-weight:600; border-left:6px solid {GMID}; padding:4px 0px 4px 20px">{t}</p>'
def kpi(big, label, delta, col=GDK, tone=GXLT):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px">'
            f'<p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p></div>')
def mini(big, label, sub, col=GDK, band=GMID):
    return (f'<div style="display:flex; flex-direction:column; gap:8px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:28px 32px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-transform:uppercase; letter-spacing:1px">{label}</p>'
            f'<p style="font-size:64px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.35; color:{BODY}">{sub}</p></div>')
def vbars(data, maxv, h, colors, bottom2=None, barw=80):
    cols=''
    for i,(lab,v) in enumerate(data):
        bh=max(4,round(v/maxv*h))
        b2=f'<p style="font-size:24px; color:{BODY}; text-align:center">{bottom2[i]}</p>' if bottom2 else ''
        cols+=(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
               f'<p style="font-size:28px; font-weight:600; color:{TEXT}; text-align:center">{fmtn(v)}</p>'
               f'<div style="width:{barw}px; height:{bh}px; background:{colors[i]}; border-radius:8px 8px 0px 0px"></div>'
               f'<p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center">{lab}</p>{b2}</div>')
    return f'<div style="flex:1; display:flex; flex-direction:row; gap:12px; align-items:end">{cols}</div>'
def hbars(data, maxv, w, colors, labw=260, bh=52, gap=24):
    rows=''
    for i,(lab,v) in enumerate(data):
        bw=max(6,round(v/maxv*w))
        rows+=(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px">'
               f'<p style="width:{labw}px; font-size:28px; font-weight:600; color:{TEXT}">{lab}</p>'
               f'<div style="width:{bw}px; height:{bh}px; background:{colors[i]}; border-radius:0px 8px 8px 0px"></div>'
               f'<p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmtn(v)}</p></div>')
    return f'<div style="display:flex; flex-direction:column; gap:{gap}px">{rows}</div>'
def legend(items):
    s=''.join(f'<div style="width:28px; height:28px; background:{c}; border-radius:6px"></div><p style="font-size:24px; color:{TEXT}; white-space:nowrap">{n}</p><div style="width:16px"></div>' for n,c in items)
    return f'<div style="display:flex; flex-direction:row; gap:12px; align-items:center">{s}</div>'
def divider(id, num, title, sub, bg, accent):
    body=(f'<div style="flex:1"></div>'
          f'<p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p>'
          f'<h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1>'
          f'<p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p>'
          f'<div style="flex:1"></div>')
    sec(id, body, bg=bg, dark=True, extra='; gap:24px')

# ===== portada =====
sec('portada', (
  f'<div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, {GDK} 0%, #0E4A33 55%, {VIO} 100%)"></div>'
  f'<img src="{LOGO_NVA_L}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:112px; width:280px; height:150px; object-fit:contain">'
  f'<img src="{LOGO_BTZ_L}" alt="Bimtrazer" style="position:absolute; left:1560px; top:128px; width:232px; height:110px; object-fit:contain">'
  f'<div style="flex:1"></div>'
  f'<p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Logística · Ricardone y San Lorenzo</p>'
  f'<h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">Estado general de la planta</h1>'
  f'<p style="font-size:40px; line-height:1.3; color:#D6E4DA">Semana del 24 al 30 de septiembre de 2026</p>'
  f'<div style="width:160px; height:8px; background:{GLT}; border-radius:4px"></div>'
  f'<p style="font-size:26px; line-height:1.5; color:#C9D8CE; width:1300px">Lectura de la actividad registrada por las cámaras de Ricardone y del puerto de San Lorenzo. Propuesta de Bimtrazer para NVA.</p>'),
  bg=GDK, dark=True, foot=False, extra='; gap:28px',
  notes='Semana sin planilla de movimientos: todas las cifras salen de las lecturas de cámaras. La semana anterior se recalculó con el mismo criterio, para que la comparación sea pareja; por eso algunas cifras de 17–23 no coinciden con las del deck anterior, que partía del Excel.')

# ===== resumen soja =====
sec('resumen', head('Semana', 'Resumen de la semana')+
    '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi(fmtn(ing), 'Camiones que ingresaron a Ricardone', dpct(ing, ingP))
    + kpi(f'{total} min', 'Soja · puerta a puerta', dmin(total, totalP))
    + kpi(f'{ric} min', 'Soja · paso por Ricardone', dmin(ric, ricP))
    + kpi(f'{puerto} min', 'Soja · traslado y puerto', dmin(puerto, puertoP), col=VIO, tone=VLT)
    + '</div>'
    + key(f'Entraron {abs(pct(ing, ingP))} % menos camiones y la soja tardó {totalP - total} min menos de punta a punta. La mejora vino del puerto; Ricardone tardó lo mismo.'),
    notes=f'Puerta a puerta = preingreso Ricardone → salida del puerto, promedio por camión de soja (R7) con lectura en todo el recorrido. Paso por Ricardone = preingreso → egreso. Traslado y puerto = egreso Ricardone → salida San Lorenzo. Semana anterior con el mismo criterio: {totalP}, {ricP} y {puertoP} min.')

# ===== resumen planta =====
sec('resumen-planta', head('Planta', 'Resumen de la semana: sectores', tagbg=VIO)+
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + mini(fmtn(cal), 'Calada sólida Ricardone', f'{dpct(cal, calP).replace(" vs. semana anterior", "")} · calles 3 y 4 hicieron el {round(c34 / callesTot * 100)} %')
    + mini(fmtn(vsl), 'Volcables puerto', f'{dpct(vsl, vslP).replace(" vs. semana anterior", "")} · V3 y V5 llevaron la semana', VIO, VMID)
    + mini(fmtn(sum(gir)), 'Girasol · volcables Ricardone', f'{dpct(sum(gir), sum(girP)).replace(" vs. semana anterior", "")} · más espera en Playa 3', VIO, VMID)
    + mini(fmtn(liq), 'Calada de líquidos', f'{dpct(liq, liqP).replace(" vs. semana anterior", "")} · repartida en toda la semana')
    + mini(fmtn(silo), 'Carga en silos Ricardone', f'{dpct(silo, siloP).replace(" vs. semana anterior", "")} · casi todos los días')
    + mini(fmtn(calSL), 'Calada San Lorenzo', f'{dpct(calSL, calSLP).replace(" vs. semana anterior", "")}', VIO, VMID)
    + '</div>',
    notes='Camiones distintos por día leídos en cada sector, sumados en la semana (un camión que pasa dos días cuenta dos veces). Variación contra 17–23/09 con el mismo criterio.')

# ===== divider soja =====
divider('div-soja', '01', 'Soja', 'Circuito Ricardone → San Lorenzo: la semana día por día, por planta y por horario.', GDK, GLT)

# ===== hallazgo: volumen y tiempo por día =====
calDia = S['caladaRic']
top2 = sorted(range(7), key=lambda i: -calDia[i])[:2]
chart = vbars(list(zip(days, calDia)), max(calDia), 360, [GDK if i in top2 else GLT for i in range(7)], bottom2=[f'{x} min' for x in totDia], barw=96)
imax = max(range(7), key=lambda i: totDia[i]); imin = min(range(7), key=lambda i: totDia[i])
left = (f'<div style="width:680px; display:flex; flex-direction:column; gap:28px">'
        + head('Soja', 'Una semana más liviana y más rápida')
        + p(f'La calada recibió entre {min(calDia)} y {max(calDia)} camiones por día; jueves y viernes fueron los más cargados.')
        + p(f'El tiempo puerta a puerta se movió entre <b>{totDia[imin]} min</b> ({days[imin].lower()}) y <b>{totDia[imax]} min</b> ({days[imax].lower()}).')
        + key(f'El lunes 28 fue el día más lento sin ser el de más volumen: el tiempo se fue en el puerto ({ptoDia[4]} min). Vale mirar qué pasó ese día en San Lorenzo.', 26) + '</div>')
right = (f'<div style="flex:1; display:flex; flex-direction:column; gap:16px">'
         + legend([('Días de mayor volumen', GDK), ('Resto', GLT)])
         + f'<p style="font-size:24px; color:{BODY}">Camiones en calada sólida por día y tiempo puerta a puerta de la soja</p>{chart}</div>')
sec('hallazgo', f'<div style="flex:1; display:flex; flex-direction:row; gap:64px">{left}{right}</div>',
    notes=f'Barras: camiones distintos leídos en las calles de calada de Ricardone por día. Debajo: promedio puerta a puerta (preingreso → salida del puerto) de los camiones de soja con recorrido completo. Semana anterior: {totalP} min.')

# ===== plantas por día =====
cols = ''
mx = max(ricDia + ptoDia)
for d, a, b in zip(days, ricDia, ptoDia):
    cols += (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
             f'<div style="display:flex; flex-direction:row; align-items:end; gap:8px">'
             f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{GDK}">{a}</p><div style="width:52px; height:{round(a / mx * 320)}px; background:{GDK}; border-radius:8px 8px 0px 0px"></div></div>'
             f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{VMID}">{b}</p><div style="width:52px; height:{round(b / mx * 320)}px; background:{VMID}; border-radius:8px 8px 0px 0px"></div></div>'
             f'</div><p style="font-size:24px; font-weight:600">{d}</p></div>')
chart = f'<div style="flex:1; display:flex; flex-direction:column; gap:20px">{legend([("Ricardone", GDK), ("Traslado y puerto", VMID)])}<div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{cols}</div></div>'
side = (f'<div style="width:520px; display:flex; flex-direction:column; gap:28px">'
        + p(f'Ricardone fue acelerando: de <b>{ricDia[0]} min</b> el jueves a <b>{ricDia[-1]} min</b> el miércoles.', 30)
        + p(f'El puerto se movió entre <b>{min(ptoDia)} y {max(ptoDia)} min</b>, con el lunes como pico.', 30)
        + p(f'En la semana, el puerto bajó de {puertoP} a {puerto} min; Ricardone quedó en {ric}.', 30)
        + key('La espera en Playa 1 sigue siendo lo que más pesa dentro de Ricardone.') + '</div>')
sec('plantas', head('Soja', 'Ricardone fue acelerando en la semana') + f'<div style="flex:1; display:flex; flex-direction:row; gap:64px">{chart}{side}</div>',
    notes=f'Minutos promedio por día. Ricardone = preingreso → egreso (espera en Playa 1 de {p1} min en la semana, {p1P} la anterior). Traslado y puerto = egreso Ricardone → salida San Lorenzo.')

# ===== horas de calada =====
hc, hp = Hc['caladaRic'], Hp['caladaRic']
order = [22, 23] + list(range(0, 22))
vmax = max(hc + hp)
X0, Y0, W, Hh = 128, 330, 1060, 400
bw = W / 24
bars = ''
for i, h in enumerate(order):
    v = hc[h]; bh = round(v / vmax * Hh)
    col = VIO if h in (22, 23, 0, 1, 2, 3) else GMID
    bars += f'<rect x="{round(i * bw + 4)}" y="{Hh - bh}" width="{round(bw - 8)}" height="{bh}" rx="4" fill="{col}"/>'
pts = ' '.join(f'{round(i * bw + bw / 2)},{Hh - round(hp[h] / vmax * Hh)}' for i, h in enumerate(order))
svg = (f'<svg aria-label="Camiones en calada por hora" viewBox="0 0 {W} {Hh}" width="{W}" height="{Hh}" style="position:absolute; left:{X0}px; top:{Y0}px; width:{W}px; height:{Hh}px">'
       f'{bars}<polyline fill="none" stroke="{TEXT}" stroke-width="3" stroke-dasharray="8 6" points="{pts}"/></svg>')
labs = ''.join(f'<p style="position:absolute; left:{X0 + round(i * bw * 3) - 10}px; top:{Y0 + Hh + 12}px; width:{round(bw * 3)}px; font-size:24px; color:{BODY}">{order[i * 3]} h</p>' for i in range(8))
QC = [VIO, VMID, GMID, GDK]
side = (f'<div style="position:absolute; left:1270px; top:300px; width:522px; display:flex; flex-direction:column; gap:16px">'
        + ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QC[i]}; border-radius:12px; padding:14px 24px"><p style="font-size:28px; font-weight:600; width:200px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QC[i]}">{qc[k]} %</p><p style="font-size:24px; color:{BODY}">antes {qp[k]} %</p></div>'
                  for i, (k, lab) in enumerate([('Q1', 'Q1 · 22–04 h'), ('Q2', 'Q2 · 04–10 h'), ('Q3', 'Q3 · 10–16 h'), ('Q4', 'Q4 · 16–22 h')]))
        + key('La noche siguió siendo el cuarto más cargado de la calada. Las pausas de las 6, 12 y 18–19 h se repiten semana a semana.', 26) + '</div>')
sec('horas', head('Soja', 'La calada trabajó de noche y con pausas fijas') + legend([('Esta semana · noche', VIO), ('Esta semana · día', GMID), ('Semana anterior', TEXT)]) + svg + labs + side,
    bg=BG2, extra='; gap:24px',
    notes='Camiones distintos por hora en las calles de calada sólida de Ricardone, sumados en la semana. Línea punteada: la semana anterior. Cuartos del día operativo: Q1 22–04, Q2 04–10, Q3 10–16, Q4 16–22.')

# ===== divider girasol =====
divider('div-girasol', '02', 'Girasol', 'Recepción en las volcables 1 y 2 de Ricardone.', VIO, '#B9A8E0')

# ===== girasol =====
def gcard(big, label, sub, col):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {col}; border-radius:16px; padding:32px">'
            f'<p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.4; color:{BODY}">{sub}</p></div>')
v1, v2 = sum(S['volcRic1']), sum(S['volcRic2'])
cv, cvP = t(G, 'calVolc'), t(Gp, 'calVolc')
pv, pvP = t(G, 'p3Volc'), t(Gp, 'p3Volc')
sec('girasol', head('Girasol', 'Llegó menos girasol, pero esperó más en Playa 3', tagbg=VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + gcard(fmtn(sum(gir)), 'Camiones en volcables', f'{fmtn(sum(girP))} la semana anterior: {pct(sum(gir), sum(girP))} %.', VIO)
    + gcard(f'{cv} min', 'De calada a descarga', f'{cvP} la semana anterior: +{cv - cvP} min.', VIO)
    + gcard(f'{pv} min', 'Espera en Playa 3', f'{pvP} la semana anterior. Es casi todo el tramo.', GDK)
    + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:48px">'
    + p(f'Recepción: {v1} camiones por la volcable 1 y {v2} por la volcable 2. Desde el domingo la volcable 1 casi no recibió ({", ".join(map(str, S["volcRic1"][3:]))} camiones por día) y la recepción pasó a la volcable 2. Playa 3 tuvo {fmtn(p3)} camiones en la semana ({"+" if p3 >= p3P else ""}{pct(p3, p3P)} %).', 28, BODY, '; flex:1')
    + '<div style="flex:1">' + key('Playa 3 vuelve a ser el punto a seguir de girasol. Vale confirmar con planta cómo estuvo la volcable 1 desde el domingo.', 26) + '</div>'
    + '</div>',
    notes=f'De calada a descarga = primera lectura en calada → volcable 1 o 2, promedio por camión. Espera en Playa 3 = Playa 3 → volcable. Volcable 1 por día: {", ".join(map(str, S["volcRic1"]))}; volcable 2: {", ".join(map(str, S["volcRic2"]))}.')

# ===== divider sectores =====
divider('div-sectores', '03', 'Sectores', 'Calada, volcables y silos: dónde se concentró la actividad de la semana.', GDK, GLT)

# ===== calada =====
cc = [GDK, GDK, GLT, GLT, GXLT, GXLT]
chart = hbars(calles, calles[0][1], 560, cc, labw=140, bh=48, gap=20)
occ = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {c}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{s}</p></div><p style="font-size:40px; font-weight:600; color:{c}">{b}</p></div>'
              for a, b, s, c in [('Ricardone sólida', fmtn(cal), dpct(cal, calP), GDK), ('Ricardone líquida', fmtn(liq), dpct(liq, liqP), VMID), ('San Lorenzo', fmtn(calSL), dpct(calSL, calSLP), VMID)])
left = f'<div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · camiones por calle</p>{chart}</div>'
right = f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Camiones calados en la semana</p><div style="display:flex; flex-direction:column; gap:16px">{occ}</div></div>'
sec('calada', head('Sectores · calada', 'Dos calles hicieron casi toda la calada')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px">{left}{right}</div>'
    + key(f'Las calles 3 y 4 hicieron el {round(c34 / callesTot * 100)} % (la semana anterior, {round(c34P / callesTotP * 100)} %). Las calles 1 y 2 se sumaron solo el lunes y el martes. La calada de líquidos creció {pct(liq, liqP)} %.', 26),
    extra='; gap:28px',
    notes='Camiones distintos por calle y por día, sumados en la semana. Calle 1 y 2 por día: ' + ', '.join(f'{a}/{b}' for a, b in zip(C['RC1'], C['RC2'])) + '.')

# ===== volcables heatmap =====
m = [(f'V{k[1]}', C[k]) for k in ('V1', 'V2', 'V3', 'V4', 'V5')]
def cellc(v):
    if v == 0: return BG2, BODY
    if v < 30: return GXLT, TEXT
    if v < 60: return GLT, TEXT
    if v < 90: return GMID, '#F1F6F2'
    return GDK, '#F1F6F2'
grid = '<div style="display:grid; grid-template-columns:120px repeat(7, 1fr) 160px; gap:8px">'
grid += '<div></div>' + ''.join(f'<p style="font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in days) + f'<p style="font-size:24px; font-weight:600; text-align:right; color:{BODY}">Semana</p>'
vtot = sum(sum(v) for _, v in m)
for e, vals in m:
    grid += f'<p style="font-size:28px; font-weight:600; color:{TEXT}">{e}</p>'
    for v in vals:
        bgc, fg = cellc(v)
        grid += f'<div style="background:{bgc}; border-radius:10px; height:88px; display:flex; align-items:center; justify-content:center"><p style="font-size:30px; font-weight:600; color:{fg}">{"–" if v == 0 else v}</p></div>'
    grid += f'<p style="font-size:32px; font-weight:600; text-align:right; color:{TEXT}">{sum(vals)}</p>'
grid += '</div>'
s35 = round((sum(C['V3']) + sum(C['V5'])) / vtot * 100)
sec('volcables', head('Sectores · volcables puerto', 'V3 y V5 se repartieron la semana', tagbg=VIO)
    + grid
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p(f'V3 y V5 tomaron el <b>{s35} %</b>. El domingo operaron solo V2 y V5; el lunes V3 llevó {C["V3"][4]} camiones y V5 apenas {C["V5"][4]}. «–» = sin camiones.', 28, BODY, '; flex:1')
    + '<div style="flex:1">' + key('El lunes, con V5 casi quieta, coincide con el día más lento del puerto. Vale confirmar con planta si hubo una parada.', 26) + '</div>'
    + '</div>',
    extra='; gap:28px',
    notes=f'Camiones distintos por volcable y por día en el puerto de San Lorenzo. Color más oscuro = más camiones. Semana anterior: {fmtn(vslP)} camiones en volcables; esta semana {fmtn(vsl)}.')

# ===== silos =====
carga = S['silosCarga']
chart = vbars(list(zip(days, carga)), max(carga), 380, [GDK if v >= 40 else GLT for v in carga], barw=96)
sdesc, sdescP = tot('silosDesc'), tot('silosDesc', Sp)
sec('silos', head('Sectores · silos Ricardone', 'Silos cargó casi todos los días')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Camiones cargados en silos por día</p>{chart}</div>'
    + f'<div style="width:560px; display:flex; flex-direction:column; gap:28px">'
    + p(f'Silos sumó <b>{silo} cargas</b> en la semana ({"+" if silo >= siloP else ""}{pct(silo, siloP)} %), con el pico el lunes ({carga[4]}).', 30)
    + p(f'La semana anterior la carga se había concentrado de lunes a miércoles; esta vez se repartió desde el jueves. Las descargas en silos fueron {sdesc} ({sdescP} la semana anterior).', 30)
    + key('La carga de silos para el puerto se volvió una actividad de todos los días, no solo de inicio de semana.', 26)
    + '</div></div>',
    bg=BG2, notes='Camiones de carga en silos Ricardone por día (S7 carga y S8 carga líneas 1 y 2). Silos funciona sobre todo como origen: carga para transile a las volcables del puerto.')

# ===== divider análisis =====
divider('div-analisis', '04', 'Análisis general', 'Lectura integrada de la planta: circuitos, sectores y actividad cruzados.', VIO, '#B9A8E0')

# ===== mapa =====
def node(title, rows, col, width=560):
    r = ''.join(f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; border-top:1px solid {LINE}; padding:12px 0px"><p style="font-size:26px; color:{TEXT}">{a}</p><p style="font-size:30px; font-weight:600; color:{col}">{b}</p></div>' for a, b in rows)
    return (f'<div style="width:{width}px; display:flex; flex-direction:column; gap:8px; background:{CARD}; border:2px solid {col}; border-radius:20px; padding:28px 32px">'
            f'<p style="font-size:32px; font-weight:600; color:{col}">{title}</p>{r}</div>')
ricn = node('Ricardone', [('Ingresos', fmtn(ing)), ('Calada sólida', fmtn(cal)), ('Calada líquida', fmtn(liq)), ('Volcables 1 y 2 · girasol', fmtn(sum(gir))), ('Carga en silos', fmtn(silo))], GDK)
sln = node('San Lorenzo', [('Llegadas a balanza', fmtn(tot('balanzaSL'))), ('Volcables puerto', fmtn(vsl)), ('Calada', fmtn(calSL)), ('Balanzas de líquidos', fmtn(tot('aceiteSL')))], VMID)
def flow(label, val, col):
    return (f'<div style="display:flex; flex-direction:column; align-items:center; gap:8px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-align:center">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:center; gap:0px"><div style="width:260px; height:14px; background:{col}"></div><x-shape kind="arrow-right" style="width:64px; height:44px; background:{col}"></x-shape></div>'
            f'<p style="font-size:40px; font-weight:600; color:{col}">{val}</p></div>')
mid = (f'<div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:48px">'
       + flow('Egresos de Ricardone', fmtn(tot('egresoRic')), GDK) + flow('Soja · tiempo puerta a puerta', f'{total} min', GMID) + '</div>')
sec('mapa', head('Análisis general', 'La semana en un mapa: qué se movió entre plantas', tagbg=VIO)
    + f'<div style="flex:1; display:flex; flex-direction:row; align-items:center; gap:24px">{ricn}{mid}{sln}</div>',
    extra='; gap:32px',
    notes='Camiones distintos por día y por sector, sumados en la semana. A la balanza del puerto también llegan camiones que no pasan por Ricardone.')

# ===== cruces =====
def cross(num, title, text, col, band):
    return (f'<div style="display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {band}; border-radius:16px; padding:24px 28px">'
            f'<p style="font-size:48px; font-weight:600; line-height:1; color:{col}">{num}</p>'
            f'<h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{TEXT}">{title}</h3>'
            f'<p style="font-size:24px; line-height:1.4; color:{BODY}">{text}</p></div>')
sec('cruces', head('Análisis general', 'Seis lecturas cruzando circuitos y sectores', tagbg=VIO)
    + '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cross(f'−{abs(pct(ing, ingP))} %', 'Una semana más liviana', f'Ingresaron {fmtn(ing)} camiones a Ricardone; la calada sólida bajó {abs(pct(cal, calP))} %.', GDK, GDK)
    + cross(f'−{puertoP - puerto} min', 'El puerto fue más ágil', f'Del egreso de Ricardone a la salida de San Lorenzo: {puerto} min, contra {puertoP} la semana anterior.', GDK, GMID)
    + cross(f'{ric} min', 'Ricardone no acompañó la baja', 'Con menos camiones, el paso por Ricardone tardó lo mismo. Igual fue mejorando día a día.', GDK, GLT)
    + cross(f'{pv} min', 'Girasol espera en Playa 3', f'Menos camiones de girasol y {pv - pvP} min más de espera antes de la volcable.', VIO, VIO)
    + cross(f'+{pct(liq, liqP)} %', 'Más líquidos', f'La calada de líquidos tuvo {liq} camiones, repartidos en toda la semana.', VIO, VMID)
    + cross('Lun 28', 'El día para revisar', f'Más ingresos de la semana, calles 1 y 2 abiertas, V5 casi quieta y el puerto en {ptoDia[4]} min.', VIO, VLT)
    + '</div>',
    extra='; gap:32px',
    notes='Lecturas para discutir en comité; no son conclusiones cerradas.')

# ===== cierre =====
sec('cierre', (
  f'<div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, {VIO} 0%, #1F3A38 60%, {GDK} 100%)"></div>'
  f'<div style="flex:1"></div>'
  f'<p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">La semana en una frase</p>'
  f'<h2 style="font-size:88px; font-weight:600; line-height:1.1; color:#F1F6F2; width:1560px">Menos camiones y un puerto más ágil: la soja tardó {totalP - total} minutos menos.</h2>'
  f'<p style="font-size:30px; line-height:1.4; color:#C9D8CE">{fmtn(ing)} ingresos a Ricardone · puerta a puerta en {total} min · girasol con más espera en Playa 3</p>'
  f'<div style="flex:1"></div>'
  f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">'
  f'<img src="{LOGO_NVA_L}" alt="Nueva Vicentin Argentina" style="width:220px; height:118px; object-fit:contain">'
  f'<img src="{LOGO_BTZ_L}" alt="Bimtrazer" style="width:200px; height:94px; object-fit:contain"></div>'),
  bg=VIO, dark=True, foot=False, extra='; gap:32px')

# ---------- write ----------
slides = [(i, h.replace('§N§', str(k + 1))) for k, (i, h) in enumerate(slides)]
for id, html in slides:
    open(os.path.join(SL, f'{id}.html'), 'w', encoding='utf-8').write(html)
deckp = os.path.join(ROOT, 'project', 'deck.json')
deck = json.load(open(deckp, encoding='utf-8')) if os.path.exists(deckp) else {
    "v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
    "lists": "css", "title": TITLE, "cover": "portada",
    "faces": {"ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
    "designSystems": []}
deck['order'] = [s[0] for s in slides]
deck['sections'] = {"s1": {"description": "Portada y resumen de la semana", "start": "portada"},
                    "s2": {"description": "Soja: la semana día por día, por planta y por horario", "start": "div-soja"},
                    "s3": {"description": "Girasol: la semana", "start": "div-girasol"},
                    "s4": {"description": "Sectores: calada, volcables y silos", "start": "div-sectores"},
                    "s5": {"description": "Análisis general cruzado y cierre", "start": "div-analisis"}}
json.dump(deck, open(deckp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('order', deck['order'])
for id, html in slides:
    print(id, html.count('<') // 2)
