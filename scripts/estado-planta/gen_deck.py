"""Genera el deck "Estado general de la planta" (Slides artifact de claude.ai).

Uso:  python scripts/estado-planta/gen_deck.py <carpeta_salida>
Escribe <carpeta_salida>/project/deck.json y project/slides/<id>.html.
Las cifras de la semana 17-23/09/2026 están cargadas a mano desde el reporte de
comité (v3) y su planilla (rev 8); los logos son assets ya subidos al artifact.
"""
import json, os, sys, datetime
ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'deck')
SL = os.path.join(ROOT, 'project', 'slides')
os.makedirs(SL, exist_ok=True)

# ---------- paleta ----------
GDK='#0B5638'; GMID='#3A8F63'; GLT='#9CCBAE'; GXLT='#DCEDE1'
BG='#F5F8F4'; BG2='#EAF2EC'; CARD='#FCFDFB'; LINE='#D3E2D7'
TEXT='#14281E'; BODY='#4A5D52'
VIO='#2E1B4E'; VMID='#6B55A3'; VLT='#DDD6EC'
FONT="'IBM Plex Sans', Arial, sans-serif"
LOGO_NVA_G='/_blob/f00836e4ffd453e24fa741f7d9716b5b'
LOGO_NVA_L='/_blob/cffaaaa255758cfac5c172dc8b87363a'
LOGO_BTZ='/_blob/97830a45ee1645f9398e6935190582f3'
LOGO_BTZ_L='/_blob/e8f9ad1a878ee13e71d49a04e1c540fb'

slides=[]
def footer(n, dark=False):
    nva = LOGO_NVA_L if dark else LOGO_NVA_G
    btz = LOGO_BTZ_L if dark else LOGO_BTZ
    col = '#C9D8CE' if dark else BODY
    return (f'<img src="{nva}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">'
            f'<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:{col}">Estado de planta · semana del 17 al 23/09/2026 · §N§</p>'
            f'<img src="{btz}" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">')
SKIP={'ric-vs-slz','buenas-malas','girasol-hist'}
def sec(id, body, bg=BG, notes='', dark=False, extra='', foot=True):
    if id in SKIP: return
    n=len(slides)+1
    color = '#F1F6F2' if dark else TEXT
    html=(f'<section id="{id}" data-transition="fade" style="background:{bg}; color:{color}; font-family:{FONT}; padding:112px 128px 160px; display:flex; flex-direction:column; gap:40px{extra}">'
          + body + (footer(n, dark) if foot else '') + (f'<aside>{notes}</aside>' if notes else '') + '</section>')
    slides.append((id, html))
def pill(t, bg, fg='#F1F6F2'):
    return f'<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:{fg}; background:{bg}; padding:6px 18px; border-radius:999px">{t}</p>'
def head(tag, title, tagbg=GDK, eyebrow=''):
    eb = f'<p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:{GDK}">{eyebrow}</p>' if eyebrow else ''
    tg = pill(tag, tagbg) if tag else ''
    return (f'<div style="display:flex; flex-direction:column; gap:16px">'
            f'<div style="display:flex; flex-direction:row; gap:16px; align-items:center">{tg}{eb}</div>'
            f'<h2 style="font-size:64px; font-weight:600; line-height:1.1; color:{TEXT}">{title}</h2></div>')
def p(t, size=30, color=BODY, extra=''):
    return f'<p style="font-size:{size}px; line-height:1.4; color:{color}{extra}">{t}</p>'
def key(t, size=28):
    return f'<p style="font-size:{size}px; line-height:1.4; color:{GDK}; font-weight:600; border-left:6px solid {GMID}; padding:4px 0px 4px 20px">{t}</p>'
def fmtn(v): return f'{v:,}'.replace(',', '.')
def spark(vals, w, h, col=GMID, lastcol=GDK):
    lo,hi=min(vals),max(vals); pad=10
    pts=[(pad+i*(w-2*pad)/(len(vals)-1), pad+(hi-v)/(hi-lo or 1)*(h-2*pad)) for i,v in enumerate(vals)]
    s=(f'<svg aria-label="Evolución de 14 semanas" viewBox="0 0 {w} {h}" width="{w}" height="{h}" style="width:{w}px; height:{h}px">'
       f'<polyline fill="none" stroke="{col}" stroke-width="4" stroke-linejoin="round" points="' + ' '.join(f'{x:.0f},{y:.0f}' for x,y in pts) + '"/>'
       f'<circle cx="{pts[-1][0]:.0f}" cy="{pts[-1][1]:.0f}" r="8" fill="{lastcol}"/></svg>')
    return s
def kpi(big, label, delta, vals=None, col=GDK, tone=GXLT):
    sp = spark(vals, 300, 80) if vals else ''
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{CARD}; border:1px solid {LINE}; border-radius:16px; padding:32px">'
            f'<p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:24px; font-weight:600; color:{GDK}; background:{tone}; padding:6px 14px; border-radius:8px; align-self:start">{delta}</p>'
            f'<div style="flex:1"></div>{sp}</div>')
def vbars(data, maxv, h, colors, top_fmt=str, bottom2=None, barw=80):
    cols=''
    for i,(lab,v) in enumerate(data):
        bh=max(4,round(v/maxv*h))
        b2=f'<p style="font-size:24px; color:{BODY}; text-align:center">{bottom2[i]}</p>' if bottom2 else ''
        cols+=(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
               f'<p style="font-size:28px; font-weight:600; color:{TEXT}; text-align:center">{top_fmt(v)}</p>'
               f'<div style="width:{barw}px; height:{bh}px; background:{colors[i]}; border-radius:8px 8px 0 0"></div>'
               f'<p style="font-size:24px; font-weight:600; color:{TEXT}; text-align:center">{lab}</p>{b2}</div>')
    return f'<div style="flex:1; display:flex; flex-direction:row; gap:12px; align-items:end">{cols}</div>'
def hbars(data, maxv, w, colors, labw=260, fmt=str, bh=52, gap=24):
    rows=''
    for i,(lab,v) in enumerate(data):
        bw=max(6,round(v/maxv*w))
        rows+=(f'<div style="display:flex; flex-direction:row; align-items:center; gap:20px">'
               f'<p style="width:{labw}px; font-size:28px; font-weight:600; color:{TEXT}">{lab}</p>'
               f'<div style="width:{bw}px; height:{bh}px; background:{colors[i]}; border-radius:0px 8px 8px 0px"></div>'
               f'<p style="font-size:28px; font-weight:600; color:{TEXT}; white-space:nowrap">{fmt(v)}</p></div>')
    return f'<div style="display:flex; flex-direction:column; gap:{gap}px">{rows}</div>'
def linechart(series, xl, X0, Y0, W, H, vmin, vmax, labelled=(0,), avg=None):
    """series: list of (name, values, color). Pinned to the slide."""
    n=len(xl)
    def xy(i,v): return X0+round(i*W/(n-1)), Y0+round((vmax-v)/(vmax-vmin)*H)
    out=(f'<svg aria-label="Serie semanal 17/06 a 25/09" viewBox="0 0 {W+40} {H+40}" width="{W+40}" height="{H+40}" style="position:absolute; left:{X0-20}px; top:{Y0-20}px; width:{W+40}px; height:{H+40}px">')
    for g in range(5):
        yy=20+round(g*H/4)
        out+=f'<line x1="20" y1="{yy}" x2="{W+20}" y2="{yy}" stroke="{LINE}" stroke-width="2"/>'
    if avg is not None:
        ay=xy(0,avg)[1]-Y0+20
        out+=f'<line x1="20" y1="{ay}" x2="{W+20}" y2="{ay}" stroke="{BODY}" stroke-width="2" stroke-dasharray="8 8"/>'
    for si,(name,vals,col) in enumerate(series):
        pts=[xy(i,v) for i,v in enumerate(vals)]
        out+=f'<polyline fill="none" stroke="{col}" stroke-width="5" stroke-linejoin="round" points="' + ' '.join(f'{x-X0+20},{y-Y0+20}' for x,y in pts)+'"/>'
        for i,(x,y) in enumerate(pts):
            out+=f'<circle cx="{x-X0+20}" cy="{y-Y0+20}" r="{11 if i==n-1 else 6}" fill="{col}"/>'
    out+='</svg>'
    labs=''
    for si,(name,vals,col) in enumerate(series):
        for i,v in enumerate(vals):
            if si in labelled or i==n-1:
                x,y=xy(i,v)
                labs+=f'<p style="position:absolute; left:{x-40}px; top:{y-48}px; width:80px; text-align:center; font-size:24px; font-weight:600; color:{col}">{v}</p>'
    for i,w in enumerate(xl):
        x,_=xy(i,0)
        labs+=f'<p style="position:absolute; left:{x-40}px; top:{Y0+H+24}px; width:80px; text-align:center; font-size:24px; color:{BODY}">{w}</p>'
    return out+labs
def legend(items):
    s=''.join(f'<div style="width:28px; height:28px; background:{c}; border-radius:6px"></div><p style="font-size:24px; color:{TEXT}; white-space:nowrap">{n}</p><div style="width:16px"></div>' for n,c in items)
    return f'<div style="display:flex; flex-direction:row; gap:12px; align-items:center">{s}</div>'
def divider(id, num, tag, title, sub, bg, accent):
    body=(f'<div style="flex:1"></div>'
          f'<p style="font-size:160px; font-weight:600; line-height:1; color:{accent}">{num}</p>'
          f'<h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">{title}</h1>'
          f'<p style="font-size:36px; line-height:1.35; color:#D6E4DA; width:1300px">{sub}</p>'
          f'<div style="flex:1"></div>')
    sec(id, body, bg=bg, dark=True, extra='; gap:24px')

days=['Jue 17','Vie 18','Sáb 19','Dom 20','Lun 21','Mar 22','Mié 23']
weeks=['17/6','24/6','8/7','15/7','24/7','30/7','7/8','13/8','21/8','28/8','4/9','11/9','18/9','25/9']
TOT=[338,316,383,304,445,389,421,346,368,296,379,276,334,303]
P1=[94,113,145,114,171,181,120,101,130,112,140,97,126,89]
OSL=[104,86,105,65,140,85,145,113,127,89,137,87,119,116]
DSC=[92,64,70,60,59,58,68,63,71,64,62,63,61,68]
SLZ=[o+d for o,d in zip(OSL,DSC)]
GT=[315,287,317,306,351,361,347,241,289,353,430,319,382,469]
GP=[107,105,122,117,140,137,138,80,99,163,190,116,133,78]
GD=[180,159,170,166,188,208,186,110,146,152,215,155,208,124]

# ===== 1 portada =====
sec('portada', (
  f'<div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, {GDK} 0%, #0E4A33 55%, {VIO} 100%)"></div>'
  f'<img src="{LOGO_NVA_L}" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:112px; width:280px; height:150px; object-fit:contain">'
  f'<img src="{LOGO_BTZ_L}" alt="Bimtrazer" style="position:absolute; left:1560px; top:128px; width:232px; height:110px; object-fit:contain">'
  f'<div style="flex:1"></div>'
  f'<p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">Logística · Ricardone y San Lorenzo</p>'
  f'<h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">Estado general de la planta</h1>'
  f'<p style="font-size:40px; line-height:1.3; color:#D6E4DA">Semana del 17 al 23 de septiembre de 2026</p>'
  f'<div style="width:160px; height:8px; background:{GLT}; border-radius:4px"></div>'
  f'<p style="font-size:26px; line-height:1.5; color:#C9D8CE; width:1300px">Lectura del reporte de Comité de Logística y de la serie semanal desde junio. Propuesta de Bimtrazer para NVA.</p>'),
  bg=GDK, dark=True, foot=False, extra='; gap:28px',
  notes='Portada. Síntesis del reporte de comité de 72 láminas, leída contra la serie semanal que se viene presentando desde el 17/06.')

# ===== 2 resumen soja =====
sec('resumen-soja', head('Soja · R7','Resumen de la semana: soja')+
    '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('303 min','Puerta a puerta','−31 min vs. semana anterior',TOT)
    + kpi('89 min','Espera Playa 1 · Ricardone','Mínimo desde junio',P1)
    + kpi('184 min','San Lorenzo · playa + descarga','+10 min sobre su promedio',SLZ,col=VIO,tone=VLT)
    + kpi('1.370','Camiones R7','Menos de la mitad que la semana del 27/08',None)
    + '</div>'
    + key('Semana liviana: Ricardone la aprovechó y tuvo su mejor espera desde junio; San Lorenzo se mantuvo en su rango habitual.'),
    notes='Líneas: evolución semanal del 17/06 al 25/09. Promedios de la serie: total 350 min, Playa 1 124 min, San Lorenzo 174 min.')

# ===== 3 resumen planta =====
def mini(big, label, sub, col=GDK, band=GMID):
    return (f'<div style="display:flex; flex-direction:column; gap:8px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:28px 32px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-transform:uppercase; letter-spacing:1px">{label}</p>'
            f'<p style="font-size:64px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.35; color:{BODY}">{sub}</p></div>')
sec('resumen-planta', head('Planta','Resumen de la semana: girasol y sectores', tagbg=VIO)+
    '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + mini('469 min','Girasol · puerta a puerta','Máximo desde junio; +87 min vs. semana anterior',VIO,VMID)
    + mini('83 %','Calada sólida Ricardone','1.935 camiones · 14 por hora (21 el 27/08)')
    + mini('72 %','Calles 3 y 4 de calada','Concentraron 1.401 de los 1.951 calados')
    + mini('1.401','Volcables puerto','La volcable 5 tomó el 46 %',VIO,VMID)
    + mini('313','Transile de silos a puerto','Carga desde silos Ricardone, de lunes a miércoles')
    + mini('290','Calada de líquidos','74 % entre lunes y martes',VIO,VMID)
    + '</div>',
    notes='Girasol: circuitos R5+R6 (286 camiones). Calada por calle: calle 4 722, calle 3 679, calle 1 255, calle 2 243, calle 6 29, calle 5 23. Transile R29: soja de silos a volcables puerto.')

# ===== 4 divider soja =====
divider('div-soja','01','Soja','Soja','Circuito R7 Ricardone → San Lorenzo: la semana día por día, por planta y por horario.',GDK,GLT)

# ===== 5 hallazgo =====
trucks=[376,343,174,103,130,115,129]; times=[372,360,226,232,226,260,230]
chart=vbars(list(zip(days,trucks)),376,360,[GDK,GDK,GLT,GLT,GLT,GLT,GLT],bottom2=[f'{x} min' for x in times],barw=96)
left=(f'<div style="width:680px; display:flex; flex-direction:column; gap:28px">'
      + head('Soja · R7','La semana arrancó cargada y se fue aliviando')
      + p('Jueves y viernes concentraron 719 de los 1.370 camiones (52 %) y fueron también los días más lentos: 372 y 360 min.')
      + p('Desde el sábado entraron entre 103 y 174 camiones por día y el ciclo bajó a 226–260 min.')
      + key('El jueves 17/09 tardó casi lo mismo que el jueves 27/08 (378 min), que tuvo 582 camiones. Vale mirar qué pasó ese día más allá del volumen.',26)+'</div>')
right=(f'<div style="flex:1; display:flex; flex-direction:column; gap:16px">'
       + legend([('Días de mayor volumen',GDK),('Resto',GLT)])
       + f'<p style="font-size:24px; color:{BODY}">Camiones por día y tiempo puerta a puerta</p>{chart}</div>')
sec('hallazgo', f'<div style="flex:1; display:flex; flex-direction:row; gap:64px">{left}{right}</div>',
    notes='Los dos días de mayor volumen fueron los más lentos. La baja desde el sábado conviene validarla con planta: programación de arribos, clima o una parada.')

# ===== 6 evolución Ricardone vs San Lorenzo =====
lc=linechart([('Ricardone · espera Playa 1',P1,GDK),('San Lorenzo · playa + descarga',SLZ,VMID)],weeks,188,360,1000,420,60,240,labelled=(0,1))
side=(f'<div style="position:absolute; left:1300px; top:320px; width:492px; display:flex; flex-direction:column; gap:24px">'
      + p('<b>Ricardone</b> va y viene: de 89 a 181 min. Es el tramo que mejor acompaña las subidas y bajadas del total.',28)
      + p('<b>San Lorenzo</b> oscila entre 125 y 213 min, con un promedio de 174. Esta semana, 184.',28)
      + key('La distancia entre plantas (95 min) es la segunda más amplia de la serie: Ricardone mejoró y San Lorenzo no acompañó.',26)+'</div>')
sec('ric-vs-slz', head('Soja · R7','Ricardone y San Lorenzo desde junio')
    + legend([('Ricardone · espera Playa 1',GDK),('San Lorenzo · Playa OSL + descarga',VMID)]) + lc + side,
    extra='; gap:24px',
    notes='Minutos por semana. Ricardone = espera Preingreso→Calada (Playa 1). San Lorenzo = Playa OSL + descarga y salida en puerto. La brecha máxima previa fue 102 min el 17/06.')

# ===== 7 semanas buenas vs malas =====
def weekcol(title, sub, rows, col, bg):
    r=''.join(f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; border-top:1px solid {LINE}; padding:10px 0px"><p style="font-size:28px; color:{TEXT}">{a}</p><p style="font-size:28px; font-weight:600; color:{col}">{b}</p></div>' for a,b in rows)
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:12px; background:{bg}; border-radius:16px; padding:28px 36px">'
            f'<p style="font-size:26px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:{col}">{title}</p>'
            f'<p style="font-size:26px; color:{BODY}">{sub}</p>{r}</div>')
good=weekcol('Las 4 mejores semanas','11/09 · 28/08 · 25/09 · 15/07',[('Puerta a puerta','295 min'),('Espera Playa 1','103 min'),('Playa OSL','89 min'),('Descarga y salida','64 min')],GDK,GXLT)
bad=weekcol('Las 4 peores semanas','24/07 · 07/08 · 30/07 · 08/07',[('Puerta a puerta','410 min'),('Espera Playa 1','154 min'),('Playa OSL','119 min'),('Descarga y salida','64 min')],VIO,VLT)
sec('buenas-malas', head('Soja · R7','Qué distingue a una semana buena de una mala')
    + f'<div style="display:flex; flex-direction:row; gap:32px">{good}{bad}</div>'
    + '<div style="display:flex; flex-direction:row; gap:48px">'
    + p('La diferencia entre unas y otras (115 min) se explica sobre todo por <b>Playa 1 (+51)</b> y <b>Playa OSL (+30)</b>. La descarga es la misma.',28,BODY,'; flex:1')
    + '<div style="flex:1">' + key('Las cuatro semanas en que alguna de las playas pasó los 140 min terminaron todas arriba de 380.',28) + '</div>'
    + '</div>',
    notes='Promedios simples de las cuatro semanas de menor y mayor tiempo puerta a puerta de la serie 17/06–25/09. El resto del ciclo (ingreso, egreso, traslado) completa la diferencia.')

# ===== 8 histórico total =====
lc=linechart([('Puerta a puerta',TOT,GDK)],weeks,168,380,1000,400,250,470,labelled=(0,),avg=350)
def ctx(t, big, sub, vals, col, tone):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {col}; border-radius:14px; padding:20px 24px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}">{t}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:end; justify-content:space-between; gap:16px"><p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>{spark(vals,220,70,col,col)}</div>'
            f'<p style="font-size:24px; color:{BODY}">{sub}</p></div>')
side=(f'<div style="position:absolute; left:1280px; top:330px; width:512px; display:flex; flex-direction:column; gap:20px">'
      + ctx('Ricardone · espera Playa 1','89 min','Promedio desde junio: 124',P1,GDK,GXLT)
      + ctx('San Lorenzo · playa + descarga','184 min','Promedio desde junio: 174',SLZ,VMID,VLT)
      + key('La mejora de la semana vino de Ricardone; San Lorenzo quedó apenas arriba de su promedio.',26)+'</div>')
sec('historico', head('Soja · R7','Dónde queda la semana: por debajo del promedio')+legend([('Tiempo puerta a puerta (min)',GDK),('Promedio de la serie: 350',BODY)])+lc+side,
    extra='; gap:24px',
    notes='Tiempo puerta a puerta R7 por semana, 17/06 a 25/09. 303 min es el tercer mejor registro de la serie (11/09: 276; 28/08: 296). Máximo 445 (24/07).')

# ===== 9 plantas por día =====
ric=[139,93,87,70,83,75,104]; slz=[192,250,124,147,125,168,109]
cols=''
for d,a,b in zip(days,ric,slz):
    cols+=(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
           f'<div style="display:flex; flex-direction:row; align-items:end; gap:8px">'
           f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{GDK}">{a}</p><div style="width:52px; height:{round(a/250*320)}px; background:{GDK}; border-radius:8px 8px 0px 0px"></div></div>'
           f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{VMID}">{b}</p><div style="width:52px; height:{round(b/250*320)}px; background:{VMID}; border-radius:8px 8px 0px 0px"></div></div>'
           f'</div><p style="font-size:24px; font-weight:600">{d}</p></div>')
chart=f'<div style="flex:1; display:flex; flex-direction:column; gap:20px">{legend([("Ricardone",GDK),("San Lorenzo",VMID)])}<div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{cols}</div></div>'
side=(f'<div style="width:520px; display:flex; flex-direction:column; gap:28px">'
      + p('Ricardone se movió entre <b>70 y 139 min</b>; San Lorenzo, entre <b>109 y 250 min</b>.',30)
      + p('El viernes 18/09 San Lorenzo llegó a 250 min, con Playa OSL en 183.',30)
      + p('El miércoles 23/09 las dos plantas quedaron casi parejas: 104 y 109.',30)
      + key('Dentro de la semana, la variación se jugó más en San Lorenzo.')+'</div>')
sec('plantas', head('Soja · R7','Día por día, San Lorenzo fue la planta que más varió')+f'<div style="flex:1; display:flex; flex-direction:row; gap:64px">{chart}{side}</div>',
    notes='Minutos promedio por planta y por día. Ricardone = ingreso + Playa 1 + egreso. San Lorenzo = Playa OSL + descarga + salida.')

# ===== 10 cuartos =====
QC=[VIO,VMID,GMID,GDK]
qd={'Q1':[131,129,83,28,31,38,52],'Q2':[91,65,27,17,39,20,18],'Q3':[92,86,32,23,26,14,33],'Q4':[62,63,32,35,34,43,26]}
stack=''
for i,d in enumerate(days):
    segs=''
    for qi,qk in enumerate(['Q4','Q3','Q2','Q1']):
        v=qd[qk][i]; c=QC[3-qi]
        segs+=f'<div style="width:96px; height:{round(v/376*400)}px; background:{c}"></div>'
    stack+=(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
            f'<p style="font-size:26px; font-weight:600">{sum(qd[k][i] for k in qd)}</p>'
            f'<div style="display:flex; flex-direction:column; border-radius:8px 8px 0px 0px; overflow:hidden">{segs}</div>'
            f'<p style="font-size:24px; font-weight:600">{d}</p></div>')
tot={k:sum(v) for k,v in qd.items()}
side=(f'<div style="width:520px; display:flex; flex-direction:column; gap:20px">'
      + ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:12px solid {QC[i]}; border-radius:12px; padding:16px 24px"><p style="font-size:28px; font-weight:600; width:220px">{lab}</p><p style="font-size:40px; font-weight:600; color:{QC[i]}">{round(tot[k]/1370*100)} %</p><p style="font-size:24px; color:{BODY}">{tot[k]}</p></div>'
                for i,(k,lab) in enumerate([('Q1','Q1 · 22–04 h'),('Q2','Q2 · 04–10 h'),('Q3','Q3 · 10–16 h'),('Q4','Q4 · 16–22 h')]))
      + key('La noche recibió el 36 % de los camiones, sobre todo jueves y viernes. Vale cruzarlo con la dotación nocturna de calada.',26)+'</div>')
sec('cuartos', head('Soja · R7','La noche fue el cuarto más cargado')+f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{stack}</div>{side}</div>',
    bg=BG2, notes='Camiones R7 por cuarto del día operativo y por día. Suma = 1.370.')

# ===== 11 divider girasol =====
divider('div-girasol','02','Girasol','Girasol','Circuitos R5 y R6: recepción en las volcables 1 y 2 de Ricardone.',VIO,'#B9A8E0')

# ===== 12 girasol semana =====
def gcard(big, label, sub, col):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {col}; border-radius:16px; padding:32px">'
            f'<p style="font-size:26px; font-weight:600; color:{BODY}">{label}</p>'
            f'<p style="font-size:72px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.4; color:{BODY}">{sub}</p></div>')
sec('girasol', head('Girasol · R5+R6','El tiempo total de girasol subió, aunque la espera y la descarga bajaron',tagbg=VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + gcard('469 min','Puerta a puerta','382 la semana anterior: +87 min. Máximo desde junio.',VIO)
    + gcard('78 min','Espera Playa 1','133 la semana anterior. Mínimo desde junio.',GDK)
    + gcard('124 min','Descarga','208 la semana anterior. Segundo más bajo de la serie.',GDK)
    + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:48px">'
    + p('Girasol viene subiendo desde el 13/08 (241 → 469). La suba se concentra en el paso por balanza y Playa 3, el mismo lugar donde se fue el tiempo el 04/09 (Playa 3: 195 min).',28,BODY,'; flex:1')
    + '<div style="flex:1; display:flex; flex-direction:column; gap:16px">' + p('Recepción: 269 camiones por la volcable 1 (R5) y 18 por la volcable 2 (R6).',28) + key('Playa 3 aparece como el punto a seguir de girasol, semana tras semana.',26) + '</div>'
    + '</div>',
    notes='Girasol R5+R6, 286 camiones. Serie 17/06–25/09: promedio 341 min; máximo previo 430 (04/09).')

# ===== 13 girasol historico =====
lc=linechart([('Puerta a puerta',GT,VIO),('Espera Playa 1',GP,GMID),('Descarga',GD,GLT)],weeks,188,370,1000,440,50,480,labelled=(0,))
side=(f'<div style="position:absolute; left:1300px; top:330px; width:492px; display:flex; flex-direction:column; gap:24px">'
      + p('Girasol viene subiendo desde el 13/08: de 241 a 469 min, con un solo alivio el 11/09.',28)
      + p('Su espera en Playa 1 se mueve junto con la de soja: comparten la calada. Esta semana las dos marcaron su mínimo (78 y 89).',28)
      + key('Si la calada no explica la suba, la mirada va hacia balanza y Playa 3.',26)+'</div>')
sec('girasol-hist', head('Girasol · R5+R6','Girasol desde junio',tagbg=VIO)
    + legend([('Puerta a puerta',VIO),('Espera Playa 1',GMID),('Descarga',GLT)]) + lc + side,
    extra='; gap:24px',
    notes='Minutos por semana, 17/06–25/09. Los valores del total se rotulan en cada punto; los tramos solo en la última semana.')

# ===== 14 divider sectores =====
divider('div-sectores','03','Sectores','Sectores','Calada, volcables y silos: dónde se concentró la actividad de la semana.',GDK,GLT)

# ===== 15 calada =====
calles=[('Calle 4',722),('Calle 3',679),('Calle 1',255),('Calle 2',243),('Calle 6',29),('Calle 5',23)]
chart=hbars(calles,722,560,[GDK,GDK,GLT,GLT,GXLT,GXLT],labw=140,fmt=fmtn,bh=48,gap=20)
occ=''.join(f'<div style="display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:16px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {c}; border-radius:12px; padding:16px 24px"><div style="display:flex; flex-direction:column; gap:2px"><p style="font-size:26px; font-weight:600; color:{TEXT}">{a}</p><p style="font-size:24px; color:{BODY}">{s}</p></div><p style="font-size:44px; font-weight:600; color:{c}">{b}</p></div>'
            for a,b,s,c in [('Ricardone sólida','83 %','1.935 · 14,1 por hora',GDK),('Ricardone líquida','41 %','290 · 4,5 por hora',VMID),('San Lorenzo','60 %','253 · 3,1 por hora',VMID)])
left=(f'<div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · camiones por calle</p>{chart}</div>')
right=(f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Ocupación semanal</p><div style="display:flex; flex-direction:column; gap:16px">{occ}</div></div>')
sec('calada', head('Sectores · calada','Calada abierta, con menos ritmo: dos calles hicieron casi todo')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px">{left}{right}</div>'
    + key('La calada estuvo abierta casi las mismas horas que la semana del 27/08 (82 %), pero con 1.935 camiones en vez de 2.704. No parece haber limitado; las calles 5 y 6 casi no se usan desde julio.',26),
    extra='; gap:28px',
    notes='Calada por calle, semana completa: calle 4 722, calle 3 679, calle 1 255, calle 2 243, calle 6 29, calle 5 23. Pico: jueves 17/09 14 h, 36 camiones.')

# ===== 16 volcables heatmap =====
m=[('V1',[0,30,1,0,0,0,1]),('V2',[0,39,43,0,44,49,26]),('V3',[138,78,0,15,0,2,39]),('V4',[129,80,26,0,0,0,22]),('V5',[133,98,115,82,82,59,70])]
def cellc(v):
    if v==0: return BG2, BODY
    if v<40: return GXLT, TEXT
    if v<80: return GLT, TEXT
    if v<110: return GMID, '#F1F6F2'
    return GDK, '#F1F6F2'
grid='<div style="display:grid; grid-template-columns:120px repeat(7, 1fr) 160px; gap:8px">'
grid+='<div></div>'+''.join(f'<p style="font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d}</p>' for d in days)+f'<p style="font-size:24px; font-weight:600; text-align:right; color:{BODY}">Semana</p>'
for e,vals in m:
    grid+=f'<p style="font-size:28px; font-weight:600; color:{TEXT}">{e}</p>'
    for v in vals:
        bgc,fg=cellc(v)
        grid+=f'<div style="background:{bgc}; border-radius:10px; height:88px; display:flex; align-items:center; justify-content:center"><p style="font-size:30px; font-weight:600; color:{fg}">{"–" if v==0 else v}</p></div>'
    grid+=f'<p style="font-size:32px; font-weight:600; text-align:right; color:{VIO if e=="V5" else TEXT}">{sum(vals)}</p>'
grid+='</div>'
sec('volcables', head('Sectores · volcables puerto','La volcable 5 sostuvo la semana', tagbg=VIO)
    + grid
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p('V5 operó los 7 días y tomó el <b>46 %</b> (639 de 1.401). V3 y V4 casi no tuvieron actividad de domingo a martes; V1 solo el viernes. «–» = sin camiones.',28,BODY,'; flex:1')
    + '<div style="flex:1">' + key('Esos días coinciden con el menor ingreso de soja: el puerto tuvo capacidad libre y la operación se concentró en un solo equipo.',26) + '</div>'
    + '</div>',
    extra='; gap:28px',
    notes='Camiones por volcable y por día en el puerto de San Lorenzo. Color más oscuro = más camiones. Promedio 200 por día y 9,5 por hora operativa.')

# ===== 17 silos =====
carga=[3,4,9,13,97,99,110]
chart=vbars(list(zip(days,carga)),110,380,[GLT,GLT,GLT,GLT,GDK,GDK,GDK],barw=96)
sec('silos', head('Sectores · silos Ricardone','Silos funcionó como origen: carga para enviar al puerto')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Camiones cargados en silos por día</p>{chart}</div>'
    + f'<div style="width:560px; display:flex; flex-direction:column; gap:28px">'
    + p('La actividad de silos fue casi toda <b>carga</b> para transile a las volcables de San Lorenzo (313 recorridos R29), y se concentró de lunes a miércoles.',30)
    + p('La carga salió casi toda por la línea 2 de S8. Las descargas en silos fueron pocas en la semana.',30)
    + key('El transile arrancó justo cuando bajó el ingreso de camiones externos de soja: parece una decisión de programación para aprovechar la capacidad del puerto.',26)
    + '</div></div>',
    bg=BG2, notes='Camiones de carga en silos Ricardone por día (S7 carga y S8 carga líneas 1 y 2). El producto de las pocas descargas no está identificado en el reporte.')

# ===== 18 divider análisis =====
divider('div-analisis','04','Análisis general','Análisis general','Lectura integrada de la planta: circuitos, sectores y actividad cruzados.',VIO,'#B9A8E0')

# ===== 19 mapa de planta =====
def node(title, rows, col, width=560):
    r=''.join(f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; border-top:1px solid {LINE}; padding:12px 0px"><p style="font-size:26px; color:{TEXT}">{a}</p><p style="font-size:30px; font-weight:600; color:{col}">{b}</p></div>' for a,b in rows)
    return (f'<div style="width:{width}px; display:flex; flex-direction:column; gap:8px; background:{CARD}; border:2px solid {col}; border-radius:20px; padding:28px 32px">'
            f'<p style="font-size:32px; font-weight:600; color:{col}">{title}</p>{r}</div>')
ricn=node('Ricardone',[('Calada sólida','1.935'),('Calada líquida','290'),('Volcables 1 y 2 · girasol','372'),('Carga en silos','335'),('Despacho de pellet','30')],GDK)
sln=node('San Lorenzo',[('Volcables puerto','1.401'),('Calada','253'),('Aceite · recepción interna','134'),('Aceite · puerto','60')],VMID)
def flow(label, val, col):
    return (f'<div style="display:flex; flex-direction:column; align-items:center; gap:8px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-align:center">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:center; gap:0px"><div style="width:260px; height:14px; background:{col}"></div><x-shape kind="arrow-right" style="width:64px; height:44px; background:{col}"></x-shape></div>'
            f'<p style="font-size:40px; font-weight:600; color:{col}">{val}</p></div>')
mid=(f'<div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:48px">'
     + flow('Soja · R7',fmtn(1370),GDK) + flow('Transile de silos · R29','313',GMID) + '</div>')
sec('mapa', head('Análisis general','La semana en un mapa: qué se movió entre plantas', tagbg=VIO)
    + f'<div style="flex:1; display:flex; flex-direction:row; align-items:center; gap:24px">{ricn}{mid}{sln}</div>',
    extra='; gap:32px',
    notes='Camiones por sector en la semana. Soja: 1.569 (R7 1.256–1.370 según tabla, R29 313). Girasol 288, líquidos 212, pellet 30: 2.099 recorridos clasificados. Carga en silos = S7 carga + S8 carga líneas 1 y 2.')

# ===== 20 cruces =====
def cross(num, title, text, col, band):
    return (f'<div style="display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {band}; border-radius:16px; padding:24px 28px">'
            f'<p style="font-size:48px; font-weight:600; line-height:1; color:{col}">{num}</p>'
            f'<h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{TEXT}">{title}</h3>'
            f'<p style="font-size:24px; line-height:1.4; color:{BODY}">{text}</p></div>')
sec('cruces', head('Análisis general','Seis lecturas cruzando circuitos y sectores', tagbg=VIO)
    + '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cross('89 min','Ricardone aprovechó la semana','Playa 1 en su mínimo desde junio, con menos de la mitad de los camiones que a fines de agosto.',GDK,GDK)
    + cross('78 · 89','Una calada, dos productos','La espera de girasol y la de soja se mueven juntas: esta semana ambas en su mínimo desde junio.',GDK,GMID)
    + cross('72 %','Calada en dos calles','Las calles 3 y 4 hicieron casi todo, como en julio y agosto; la 5 y la 6 siguen casi sin uso.',GDK,GLT)
    + cross('184','San Lorenzo no acompañó','Ricardone mejoró 37 min frente a la semana anterior y San Lorenzo sumó 4, aun con menos camiones.',VIO,VIO)
    + cross('313','Silos entró en escena','Con menos camiones externos, de lunes a miércoles se sumó el transile de soja desde silos hacia el puerto.',VIO,VMID)
    + cross('372 min','El jueves no cedió','El 17/09 tardó casi lo mismo que el 27/08 con 35 % menos camiones: no todo se explica por volumen.',VIO,VLT)
    + '</div>',
    extra='; gap:32px',
    notes='Lecturas para discutir en comité; no son conclusiones cerradas. Ricardone: Playa 1 126→89. San Lorenzo: 180→184 (Playa OSL + descarga).')

# ===== 21 cierre =====
sec('cierre', (
  f'<div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, {VIO} 0%, #1F3A38 60%, {GDK} 100%)"></div>'
  f'<div style="flex:1"></div>'
  f'<p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">La semana en una frase</p>'
  f'<h2 style="font-size:88px; font-weight:600; line-height:1.1; color:#F1F6F2; width:1560px">Llegó la mitad de los camiones y Ricardone lo aprovechó. San Lorenzo tardó lo de siempre.</h2>'f'<p style="font-size:30px; line-height:1.4; color:#C9D8CE">1.370 camiones de soja · Playa 1 en 89 min · San Lorenzo en 184 min</p>'
  f'<div style="flex:1"></div>'
  f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">'
  f'<img src="{LOGO_NVA_L}" alt="Nueva Vicentin Argentina" style="width:220px; height:118px; object-fit:contain">'
  f'<img src="{LOGO_BTZ_L}" alt="Bimtrazer" style="width:200px; height:94px; object-fit:contain"></div>'),
  bg=VIO, dark=True, foot=False, extra='; gap:32px')

# ---------- write ----------
old=set(os.listdir(SL))
ORDER=['portada','resumen-soja','resumen-planta','div-soja','hallazgo','plantas','cuartos','historico','div-girasol','girasol','div-sectores','calada','volcables','silos','div-analisis','mapa','cruces','cierre']
slides=sorted(slides,key=lambda x:ORDER.index(x[0]))
slides=[(i,h.replace('§N§',str(k+1))) for k,(i,h) in enumerate(slides)]
for id,html in slides:
    open(os.path.join(SL,f'{id}.html'),'w',encoding='utf-8').write(html)
deckp=os.path.join(ROOT,'project','deck.json')
deck=json.load(open(deckp,encoding='utf-8')) if os.path.exists(deckp) else {
    "v":4,"createdOnFiles":{"v":1,"at":datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
    "title":"Estado de planta · Semana 17–23 sep","cover":"portada",
    "faces":{"ibm-plex-sans":{"family":"IBM Plex Sans","href":"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
    "designSystems":[]}
deck['order']=[s[0] for s in slides]
deck['sections']={"s1":{"description":"Portada y resumen de la semana","start":"portada"},
 "s2":{"description":"Soja R7: la semana día por día, por planta, por horario y en contexto","start":"div-soja"},
 "s3":{"description":"Girasol R5+R6: la semana","start":"div-girasol"},
 "s4":{"description":"Sectores: calada, volcables y silos","start":"div-sectores"},
 "s5":{"description":"Análisis general cruzado y cierre","start":"div-analisis"}}
json.dump(deck,open(deckp,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
removed=sorted(f for f in old if f[:-5] not in deck['order'])
print('order',deck['order']); print('removed',removed)
for id,html in slides:
    print(id, html.count('<')//2)
