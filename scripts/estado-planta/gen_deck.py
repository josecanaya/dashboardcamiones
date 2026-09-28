"""Genera el deck "Comité de Logística Nodo Sur" (Slides artifact de claude.ai).

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
            f'<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:{col}">Comité de Logística Nodo Sur · 17–23/09 · §N§</p>'
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
P1=[94,113,145,114,171,181,120,101,130,112,140,87,126,89]
OSL=[104,86,105,65,140,85,145,113,127,89,137,97,119,116]
DSC=[92,64,70,60,59,58,68,63,71,64,62,63,61,68]
SLZ=[o+d for o,d in zip(OSL,DSC)]
SLE=VMID
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
  f'<h1 style="font-size:120px; font-weight:600; line-height:1.05; color:#F1F6F2">Comité de Logística Nodo Sur</h1>'
  f'<p style="font-size:40px; line-height:1.3; color:#D6E4DA">Semana del 17 al 23 de septiembre de 2026</p>'
  f'<div style="width:160px; height:8px; background:{GLT}; border-radius:4px"></div>'),
  bg=GDK, dark=True, foot=False, extra='; gap:28px',
  notes='Portada. Comité de Logística Nodo Sur, semana 17–23/09.')

# ===== 2 resumen soja =====
sec('resumen-soja', head('Soja · R7','Resumen de la semana: soja')+
    '<div style="flex:1; display:flex; flex-direction:row; gap:24px">'
    + kpi('303 min','Puerta a puerta','−31 min vs. semana anterior',TOT)
    + kpi('89 min','Espera Playa 1 · Ricardone','2.ª más baja desde junio',P1)
    + kpi('184 min','San Lorenzo · playa, descarga y salida','+4 vs. semana anterior',SLZ,col=VIO,tone=VLT)
    + kpi('1.370','Camiones R7','Menos de la mitad que la semana 27/08–02/09',None)
    + '</div>'
    + key('Semana liviana: Ricardone la aprovechó y tuvo su segunda mejor espera en Playa 1 desde junio (solo 03–09/09 fue menor: 87 min). San Lorenzo se mantuvo en su nivel: 184 min contra 180.'),
    notes='Líneas: evolución semanal por fecha de comité (cada punto informa la semana previa), del 17/06 al 25/09. Promedios de la serie: total 350 min, Playa 1 123 min, San Lorenzo 175 min. El punto 11/09 va como lo publicó ese comité: Playa 1 87, Playa OSL 97. San Lorenzo = Playa OSL + descarga + salida. Ojo con el −31: el 334 del comité del 18/09 era suma de medias de tramo; con la misma regla que el 303, la semana 10–16 daba 385 min. La baja es segura, la magnitud no.')

# ===== 3 resumen planta =====
def mini(big, label, sub, col=GDK, band=GMID):
    return (f'<div style="display:flex; flex-direction:column; gap:8px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:28px 32px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-transform:uppercase; letter-spacing:1px">{label}</p>'
            f'<p style="font-size:64px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.35; color:{BODY}">{sub}</p></div>')
# colores por producto (solo como acento sutil: banda superior y rótulo)
PROD={'soja':('#3A8F63','#0B5638'),'girasol':('#E0A526','#7A5608'),'liquidos':('#3F7FB5','#1F4E7A'),'pellet':('#9A7650','#5E4428')}
FF='IBM Plex Sans, Arial, sans-serif'
DSHORT=['J','V','S','D','L','M','M']
def minibars(vals, band, dark, W=342, H=100):
    slot=W/7; base=H-32; mx=max(vals)
    o=f'<svg aria-label="Camiones por día, jueves a miércoles" viewBox="0 0 {W} {H}" width="{W}" height="{H}" style="width:{W}px; height:{H}px">'
    for i,v in enumerate(vals):
        cx=slot*i+slot/2; h=max(3,round(v/mx*52)) if v else 0
        if h: o+=f'<rect x="{cx-15:.0f}" y="{base-h}" width="30" height="{h}" rx="4" fill="{dark if v==mx else band}"/>'
        else: o+=f'<rect x="{cx-15:.0f}" y="{base-2}" width="30" height="2" fill="{LINE}"/>'
        o+=f'<text x="{cx:.0f}" y="{H-4}" text-anchor="middle" font-size="24" fill="{BODY}" font-family="{FF}">{DSHORT[i]}</text>'
    return o+'</svg>'
def prodcard(prod, name, big, unit, tline, vals, note):
    band,dark=PROD[prod]
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-top:8px solid {band}; border-radius:16px; padding:22px 26px">'
            f'<p style="font-size:24px; font-weight:600; color:{dark}; text-transform:uppercase; letter-spacing:1px">{name}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:10px"><p style="font-size:60px; font-weight:600; line-height:1.05; color:{dark}">{big}</p><p style="font-size:24px; color:{BODY}">{unit}</p></div>'
            f'<p style="font-size:24px; color:{TEXT}">{tline}</p>{minibars(vals,band,dark)}'
            f'<p style="font-size:24px; line-height:1.3; color:{BODY}">{note}</p></div>')
def chip(t, sub):
    return (f'<div style="flex:1; display:flex; flex-direction:column; gap:2px; border-left:8px solid #9AA8A0; padding:4px 0px 4px 18px">'
            f'<p style="font-size:24px; font-weight:600; color:{TEXT}">{t}</p><p style="font-size:24px; color:{BODY}">{sub}</p></div>')
sec('resumen-planta', head('Planta','Qué entró a la planta, cuándo y cuánto tardó', tagbg=VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + prodcard('soja','Soja · R7','1.370','operaciones','<b>303 min</b> puerta a puerta',[376,343,174,103,130,115,129],'Jueves y viernes: 52 % de la semana.')
    + prodcard('girasol','Girasol · R5+R6','313','operaciones','<b>469 min</b> puerta a puerta',[88,61,26,5,58,48,27],'Jue y vie: 48 %. Espera y descarga, en baja.')
    + prodcard('liquidos','Líquidos','286','camiones','<b>356 min</b> puerta a puerta',[53,47,11,8,53,59,55],'Aceites, borras y glicerina. Pico el martes.')
    + prodcard('pellet','Pellet','26','egresos','<b>536 min</b> puerta a puerta',[7,3,0,1,8,3,4],'Pellet de girasol 18 y cáscara 8.')
    + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:32px">'
    + chip('Calada sólida Ricardone','1.935 recorridos de cámara · activa el 83 % de las horas')
    + chip('Volcables puerto','1.401 recorridos de cámara · V5 hizo el 46 %')
    + chip('Silos Ricardone','313 transiles de soja (R29), lunes a miércoles')
    + '</div>',
    extra='; gap:28px',
    notes='Qué entró, cuándo y cuánto tardó, por producto. Barras: jueves a miércoles; la más oscura es el día pico de ese producto (cada tarjeta tiene su escala). Productos y tiempos por día operativo desde las 22 h; sectores (calada, volcables, silos) por día calendario. Soja: 1.370 operaciones R7 y 303 min puerta a puerta. Girasol: 313 operaciones R5+R6 (88/61/26/5/58/48/27) y 469 min. Líquidos: 286 camiones de productos líquidos de Planta Ricardone y Terminal de Embarque (aceites, borras, glicerina, lecitina, goma, ácidos grasos, metanol y metilato; sin agua, químicos de proceso ni envasados), ingresos y egresos, por día operativo; 356 min puerta a puerta promedio (mediana 280). Ingresos 79 (543 min), egresos 207 (285 min). Por día: 53/47/11/8/53/59/55. Pellet: 26 egresos en camión según los movimientos 17–23/09 (18 de pellet de girasol y 8 de cáscara de soja pelleteada), sin transiles; 536 min puerta a puerta promedio (mediana 420). No se cuentan 10 movimientos de cáscara pelleteada que no fueron en camión (ajustes con patente PPPPPP) ni un egreso anulado. Calada sólida: 1.935 recorridos de cámara por las calles 1–6, activa 139 de 168 horas. No es la suma de productos: de jueves a domingo coincide con soja + girasol (1.130 recorridos contra 1.176 operaciones); de lunes a miércoles tiene 300 de más (807 contra 507), los mismos días del transile de soja desde silos (R29, 313), sin confirmar que el R29 pase por esas calles. Volcables puerto: 1.401 recorridos, la descarga de soja R7.')

# ===== 3 camiones adentro (ritmo x tiempo) =====
CAL=[465,389,178,98,254,233,320]; VOL=[400,325,185,97,126,110,158]
TRIC=[139,93,87,70,83,75,104]; TSL=[192,250,124,147,125,168,109]
WR=[c/24*t/60 for c,t in zip(CAL,TRIC)]; WS=[v/24*t/60 for v,t in zip(VOL,TSL)]
def wipchart(W=1060, H=560):
    slot=(W-40)/7; base=460; sc=372/100
    o=f'<svg aria-label="Camiones adentro de cada planta por día" viewBox="0 0 {W} {H}" width="{W}" height="{H}" style="width:{W}px; height:{H}px">'
    for lab,a0,n in [('PICO',0,2),('PAUSA',2,2),('TRANSILE SOJA',4,3)]:
        x1=20+slot*a0+8; x2=20+slot*(a0+n)-8
        o+=f'<line x1="{x1:.0f}" y1="44" x2="{x2:.0f}" y2="44" stroke="{VMID}" stroke-width="4"/>'
        o+=f'<text x="{(x1+x2)/2:.0f}" y="30" text-anchor="middle" font-size="24" font-weight="600" letter-spacing="2" fill="{VIO}" font-family="{FF}">{lab}</text>'
    o+=f'<line x1="20" y1="{base}" x2="{W-20}" y2="{base}" stroke="{LINE}" stroke-width="2"/>'
    for i in range(7):
        cx=20+slot*i+slot/2; r=WR[i]; q=WS[i]; hr=round(r*sc); hs=round(q*sc)
        o+=f'<rect x="{cx-46:.0f}" y="{base-hr}" width="92" height="{hr}" fill="{GDK}"/>'
        sc_col=VMID if i==0 else SLE; sc_txt='#F1F6F2' if i==0 else VIO
        o+=f'<rect x="{cx-46:.0f}" y="{base-hr-hs}" width="92" height="{hs}" fill="{sc_col}"/>'
        if hr>=34: o+=f'<text x="{cx:.0f}" y="{base-hr/2+9:.0f}" text-anchor="middle" font-size="24" font-weight="600" fill="#F1F6F2" font-family="{FF}">{round(r)}</text>'
        if hs>=34: o+=f'<text x="{cx:.0f}" y="{base-hr-hs/2+9:.0f}" text-anchor="middle" font-size="24" font-weight="600" fill="{sc_txt}" font-family="{FF}">{round(q)}</text>'
        o+=f'<text x="{cx:.0f}" y="{base-hr-hs-14}" text-anchor="middle" font-size="30" font-weight="600" fill="{TEXT}" font-family="{FF}">{round(r+q)}</text>'
        o+=f'<text x="{cx:.0f}" y="{base+36}" text-anchor="middle" font-size="24" font-weight="600" fill="{TEXT}" font-family="{FF}">{days[i]}</text>'
        o+=f'<text x="{cx:.0f}" y="{base+72}" text-anchor="middle" font-size="24" fill="{BODY}" font-family="{FF}">soja {[376,343,174,103,130,115,129][i]}</text>'
    return o+'</svg>'
def insight(big, col, text):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; border-top:2px solid {LINE}; padding-top:14px">'
            f'<p style="font-size:56px; font-weight:600; line-height:1.05; color:{col}">{big}</p>'
            f'<p style="font-size:26px; line-height:1.35; color:{BODY}">{text}</p></div>')
sec('dia-a-dia', head('Planta','Camiones adentro de la planta, día por día', tagbg=VIO)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:48px">'
    + '<div style="flex:1; display:flex; flex-direction:column; gap:12px">'
    + legend([('Ricardone',GDK),('San Lorenzo',VMID)])
    + p('Promedio del día: camiones que entran por hora × horas que pasa cada uno adentro.',24)
    + wipchart() + '</div>'
    + '<div style="width:480px; display:flex; flex-direction:column; gap:22px">'
    + insight('98',TEXT,'camiones adentro el jueves en promedio: 45 en Ricardone y 53 en el puerto.')
    + insight('15–35',TEXT,'desde el sábado, contra 98 el jueves: la ocupación cayó a menos de la mitad.')
    + insight('23',GDK,'en Ricardone el miércoles, contra 15 y 12 lunes y martes: subieron la calada (320) y el tiempo (104 min).')
    + '</div></div>',
    extra='; gap:24px',
    notes='Indicador nuevo: camiones adentro en promedio = (camiones del día / 24 h) × (minutos que pasa cada uno / 60). Es la ley de Little: une volumen y tiempo en una sola cifra; para separar cola de proceso se mira en la lámina siguiente contra los camiones del día. Ricardone: recorridos de cámara en calada sólida por día (incluyen girasol y transile, no solo soja) × tiempo de soja en Ricardone (ingreso + Playa 1 + egreso: 139, 93, 87, 70, 83, 75, 104 min). San Lorenzo: recorridos en volcables del puerto × tiempo de soja en San Lorenzo (192, 250, 124, 147, 125, 168, 109 min). Aplica el tiempo de la soja a todo el flujo. Miércoles contra lunes y martes: calada 320 contra 254 y 233; tiempo en Ricardone 104 contra 83 y 75 min. Promedio de la semana: 19 camiones en Ricardone y 24 en el puerto.')

# ===== 4 cola o proceso =====
def scatter(W=1040, H=520):
    X0,X1,Y0,Y1=100,1010,440,50; xs=(X1-X0)/500; ys=(Y0-Y1)/270
    X=lambda v:X0+v*xs; Y=lambda v:Y0-v*ys
    o=f'<svg aria-label="Minutos en planta contra camiones del día, por día y por planta" viewBox="0 0 {W} {H}" width="{W}" height="{H}" style="width:{W}px; height:{H}px">'
    for t in [0,90,180,270]:
        o+=f'<line x1="{X0}" y1="{Y(t):.0f}" x2="{X1}" y2="{Y(t):.0f}" stroke="{LINE}" stroke-width="2"/>'
        o+=f'<text x="{X0-14}" y="{Y(t)+8:.0f}" text-anchor="end" font-size="24" fill="{BODY}" font-family="{FF}">{t}</text>'
    for t in [0,100,200,300,400,500]:
        o+=f'<text x="{X(t):.0f}" y="{Y0+36}" text-anchor="middle" font-size="24" fill="{BODY}" font-family="{FF}">{t}</text>'
    o+=f'<text x="{X0}" y="24" font-size="24" font-weight="600" fill="{TEXT}" font-family="{FF}">Minutos en la planta</text>'
    o+=f'<text x="{X1}" y="{Y0+76}" text-anchor="end" font-size="24" font-weight="600" fill="{TEXT}" font-family="{FF}">Camiones del día (calada en Ricardone, volcables en el puerto)</text>'
    o+=f'<line x1="{X0}" y1="{Y(70):.0f}" x2="{X1}" y2="{Y(70):.0f}" stroke="{GDK}" stroke-width="3" stroke-dasharray="10 8"/>'
    o+=f'<text x="{X1}" y="{Y(70)+32:.0f}" text-anchor="end" font-size="24" font-weight="600" fill="{GDK}" font-family="{FF}">Mejor día Ricardone: 70 min (dom)</text>'
    o+=f'<line x1="{X0}" y1="{Y(109):.0f}" x2="{X1}" y2="{Y(109):.0f}" stroke="{VMID}" stroke-width="3" stroke-dasharray="10 8"/>'
    o+=f'<text x="{X1}" y="{Y(109)-12:.0f}" text-anchor="end" font-size="24" font-weight="600" fill="{VMID}" font-family="{FF}">Mejor día puerto: 109 min (mié)</text>'
    for i in (3,5):
        o+=f'<circle cx="{X(VOL[i]):.0f}" cy="{Y(TSL[i]):.0f}" r="24" fill="none" stroke="{PROD["girasol"][0]}" stroke-width="4"/>'
    DL=['Jue','Vie','Sáb','Dom','Lun','Mar','Mié']
    offR={0:(-18,-14,'end'),1:(18,-12,'start'),2:(0,36,'middle'),3:(-18,8,'end'),4:(18,-10,'start'),5:(0,38,'middle'),6:(0,-18,'middle')}
    offS={0:(18,-10,'start'),1:(18,8,'start'),2:(18,-6,'start'),3:(-30,8,'end'),4:(-18,-8,'end'),5:(30,-6,'start'),6:(-16,30,'end')}
    for vals,ts,off,cols in [(CAL,TRIC,offR,[GDK]*7),(VOL,TSL,offS,[VMID]+[SLE]*6)]:
        for i in range(7):
            x,y=X(vals[i]),Y(ts[i]); dx,dy,an=off[i]; col=cols[i]; lab=VIO if col==SLE else col
            o+=f'<circle cx="{x:.0f}" cy="{y:.0f}" r="11" fill="{col}"/>'
            o+=f'<text x="{x+dx:.0f}" y="{y+dy:.0f}" text-anchor="{an}" font-size="24" font-weight="600" fill="{lab}" font-family="{FF}">{DL[i]}</text>'
    return o+'</svg>'
def reading(tag, col, text):
    return (f'<div style="display:flex; flex-direction:column; gap:6px; border-left:8px solid {col}; padding-left:20px">'
            f'<p style="font-size:24px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:{col}">{tag}</p>'
            f'<p style="font-size:26px; line-height:1.35; color:{BODY}">{text}</p></div>')
sec('cruce-tiempos', head('Planta · ¿cola o proceso?','Dos días el puerto tardó sin tener cola', tagbg=VIO)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:40px">'
    + '<div style="display:flex; flex-direction:column; gap:12px">' + legend([('Ricardone',GDK),('San Lorenzo',VMID),('Tardó sin cola',PROD['girasol'][0])]) + scatter() + '</div>'
    + '<div style="flex:1; display:flex; flex-direction:column; gap:26px">'
    + reading('Ricardone',GDK,'El tiempo sube con el volumen: el jueves la calada registró 465 recorridos y la soja tardó 139 min; el domingo, 98 y 70.')
    + reading('Puerto · jueves y viernes',VMID,'Fue cola: los dos días de más descargas (400 y 325), con 192 y 250 min.')
    + reading('Puerto · domingo y martes',PROD['girasol'][1],'Con las descargas más bajas de la semana (97 y 110) tardó 147 y 168 min, 38 y 59 más que su mejor día. No fue cola: conviene revisar la operación con el puerto.')
    + '</div></div>'
    + key('Para seguir cada semana: el mejor día de cada planta como piso (70 y 109 min) y los días que se despegan de él con pocos camiones.',26),
    extra='; gap:24px',
    notes='Cada punto es un día de una planta. Eje horizontal: camiones del día (Ricardone: recorridos de cámara en calada sólida 465, 389, 178, 98, 254, 233, 320; puerto: recorridos en volcables 400, 325, 185, 97, 126, 110, 158). Eje vertical: minutos de soja en esa planta. Si el tiempo sube en los días de muchos camiones, la demora es cola; si sube con pocos, es proceso. Mejor día de la semana como piso: Ricardone 70 min (domingo), puerto 109 min (miércoles). Minutos sobre el piso en Ricardone: 69, 23, 17, 0, 13, 5, 34. En el puerto: 83, 141, 15, 38, 16, 59, 0. Domingo y martes el puerto tardó 147 y 168 min con 97 y 110 descargas, las más bajas de la semana. De domingo a martes V4 no descargó y V3 apenas (15, 0 y 2 camiones); el lunes, sin ninguna de las dos, dio 125 min: la parada sola no lo explica. Conviene revisar esos dos días con el puerto.')

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
      + ctx('Ricardone · espera Playa 1','89 min','Promedio desde junio: 123',P1,GDK,GXLT)
      + ctx('San Lorenzo · playa, descarga y salida','184 min','Promedio desde junio: 175',SLZ,VMID,VLT)
      + key('La mejora de la semana vino de Ricardone; San Lorenzo quedó apenas arriba de su promedio (184 contra 175).',26)+'</div>')
sec('historico', head('Soja · R7','Dónde queda la semana: por debajo del promedio')+legend([('Tiempo puerta a puerta (min) · rótulo = fecha del comité',GDK),('Promedio de la serie: 350',BODY)])+lc+side,
    extra='; gap:24px',
    notes='Tiempo puerta a puerta R7 por comité (rótulo = fecha del comité, que informa la semana previa; el punto 8/7 cubre 22/06–05/07). 303 min es el tercer mejor registro de la serie (03–09/09: 276; 20–26/08: 296). Máximo 445 (punto 24/7, semana 13–19/07; el comité del 23/07 había impreso 433). Playa 1 del punto 11/9 = 87, como lo publicó ese comité. Ojo: el 303 se calcula de punta a punta y los puntos anteriores son suma de medias de tramo que imprimió cada comité; con la regla del 303, la semana 10–16 daba 385. La baja es segura, la posición exacta en la serie no.')

# ===== 9 plantas por día =====
ric=[139,93,87,70,83,75,104]; slz=[192,250,124,147,125,168,109]
cols=''
for k,(d,a,b) in enumerate(zip(days,ric,slz)):
    bc=VMID if k==0 else SLE; bt=VMID if k==0 else VIO
    cols+=(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px">'
           f'<div style="display:flex; flex-direction:row; align-items:end; gap:8px">'
           f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{GDK}">{a}</p><div style="width:52px; height:{round(a/250*320)}px; background:{GDK}; border-radius:8px 8px 0px 0px"></div></div>'
           f'<div style="display:flex; flex-direction:column; align-items:center; gap:6px"><p style="font-size:24px; font-weight:600; color:{bt}">{b}</p><div style="width:52px; height:{round(b/250*320)}px; background:{bc}; border-radius:8px 8px 0px 0px"></div></div>'
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
sec('girasol', head('Girasol · R5+R6','Girasol: bajaron la espera y la descarga; el total no es comparable',tagbg=VIO)
    + '<div style="display:flex; flex-direction:row; gap:24px">'
    + gcard('469 min','Puerta a puerta','El 382 del 18/09 sumaba tramos: no es comparable con este total.',VIO)
    + gcard('78 min','Espera Playa 1','133 la semana anterior. Mínimo desde junio.',GDK)
    + gcard('124 min','Descarga','Playa 3 → volcable 105 + tara 19. Semana anterior: 191 + 17 = 208.',GDK)
    + '</div>'
    + '<div style="display:flex; flex-direction:row; gap:48px">'
    + p('Tramos con lectura: 205 min (ingreso 3, Playa 1 78, Playa 3 → volcable 105, tara 19), todos en baja salvo la tara. Los otros 264 min hasta 469 no tienen tramo medido: la balanza no tuvo muestra.',28,BODY,'; flex:1')
    + '<div style="flex:1; display:flex; flex-direction:column; gap:16px">' + p('Recepción: 9 de cada 10 camiones descargaron en la volcable 1 (R5); la volcable 2 (R6) casi no se usó.',28) + key('Playa 3 → volcable sigue siendo el tramo medido más largo (105 min). Pendiente: recuperar la lectura de balanza.',26) + '</div>'
    + '</div>',
    notes='Girasol R5+R6: 313 operaciones en la semana (día operativo desde las 22 h; 88/61/26/5/58/48/27) y 469 min puerta a puerta. No es comparable con los totales de comité (382 el 18/09; 430 en la semana 27/08–02/09), que eran suma de medias de tramo. Esta semana tienen lectura 4 de 6 tramos (205 min); la balanza no tuvo muestra. Volcable 1: 9 de cada 10 (269 de 287 recorridos clasificados).')

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
            for a,b,s,c in [('Ricardone sólida','83 %','1.935 recorridos en 139 h',GDK),('Ricardone líquida','41 %','290 recorridos en 69 h',VMID),('San Lorenzo','60 %','253 recorridos en 101 h',VMID)])
left=(f'<div style="width:880px; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Calada sólida Ricardone · recorridos de cámara por calle (16 pasaron por dos)</p>{chart}</div>')
right=(f'<div style="flex:1; display:flex; flex-direction:column; gap:20px"><p style="font-size:24px; color:{BODY}">Horas con actividad, sobre 168</p><div style="display:flex; flex-direction:column; gap:16px">{occ}</div></div>')
sec('calada', head('Sectores · calada','Calada activa, con menos ritmo: las calles 3 y 4 hicieron el 72 %')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px">{left}{right}</div>'
    + key('Actividad casi las mismas horas que la semana anterior (139 contra 148) con un tercio menos de recorridos (1.935 contra 2.908). No es soja + girasol: de lunes a miércoles hubo 300 recorridos más, los días del transile desde silos.',26),
    extra='; gap:28px',
    notes='Calada por calle, semana completa: calle 4 722, calle 3 679, calle 1 255, calle 2 243, calle 6 29, calle 5 23. Suman 1.951, no 1.935, porque 16 recorridos pasaron por dos calles. Calada = recorridos de cámara distintos por las calles 1–6, por día calendario. No es la suma de productos: de jueves a domingo coincide con soja + girasol (1.130 recorridos contra 1.176 operaciones) y de lunes a miércoles tiene 300 de más (807 contra 507), los días del transile de soja desde silos (R29, 313), sin confirmar que pase por estas calles. Horas = horas con al menos una lectura, sobre 168. El jueves 17/09 todavía dominaron las calles 1 y 2 (284 de 466); desde el viernes, la 3 y la 4. Semana anterior (comité 18/09): 2.908 recorridos en 148 h, con las calles 1 y 2 en 56 %. Pico: jueves 17/09 14 h, 36 recorridos.')

# ===== 16 volcables heatmap =====
m=[('V5',[133,98,115,82,82,59,70]),('V3',[138,78,0,15,0,2,39]),('V4',[129,80,26,0,0,0,22]),('V2',[0,39,43,0,44,49,26]),('V1',[0,30,1,0,0,0,1])]
TV=sum(sum(v) for _,v in m)
def dayc(v, col):
    if v>=20: return f'<div style="width:56px; height:56px; background:{col}; border-radius:12px"></div>'
    if v>0: return f'<div style="width:56px; height:56px; background:{GXLT}; border:3px solid {GLT}; border-radius:12px"></div>'
    return f'<div style="width:56px; height:56px; border:3px dashed {LINE}; border-radius:12px"></div>'
rows=(f'<div style="display:flex; flex-direction:row; align-items:center; gap:24px">'
      f'<p style="width:80px; font-size:24px; color:{BODY}"></p><p style="width:760px; font-size:24px; font-weight:600; color:{BODY}">Camiones en la semana</p>'
      + ''.join(f'<p style="width:56px; font-size:24px; font-weight:600; text-align:center; color:{BODY}">{d.split()[0][:2]}</p>' for d in days)
      + f'<p style="flex:1; font-size:24px; font-weight:600; text-align:right; color:{BODY}">Días</p></div>')
for e,vals in m:
    t=sum(vals); col=VIO if e=='V5' else GMID
    rows+=(f'<div style="display:flex; flex-direction:row; align-items:center; gap:24px">'
           f'<p style="width:80px; font-size:32px; font-weight:600; color:{TEXT}">{e}</p>'
           f'<div style="width:760px; display:flex; flex-direction:row; align-items:center; gap:16px"><div style="width:{max(8,round(t/639*560))}px; height:56px; background:{col}; border-radius:0px 8px 8px 0px"></div>'
           f'<p style="font-size:30px; font-weight:600; color:{col if e=="V5" else TEXT}; white-space:nowrap">{t} · {round(t/TV*100)} %</p></div>'
           + ''.join(dayc(v,col) for v in vals)
           + f'<p style="flex:1; font-size:32px; font-weight:600; text-align:right; color:{col if e=="V5" else TEXT}">{sum(1 for v in vals if v>=20)}</p></div>')
sec('volcables', head('Sectores · volcables puerto','La volcable 5 sostuvo la semana', tagbg=VIO)
    + f'<div style="display:flex; flex-direction:column; gap:20px">{rows}</div>'
    + legend([('Operó (20 camiones o más)',GMID),('Actividad mínima',GXLT)])
    + '<div style="display:flex; flex-direction:row; gap:48px; align-items:start">'
    + p('V5 fue la única que trabajó todos los días y tomó el <b>46 %</b> (639 de 1.401). De domingo a martes V4 no descargó y V3 casi nada (15, 0 y 2).',28,BODY,'; flex:1')
    + '<div style="flex:1">' + key('Esos días llegaron menos camiones al puerto (97, 126 y 110, contra 400 el jueves) y la descarga se hizo casi toda en V5 y una segunda volcable.',26) + '</div>'
    + '</div>',
    extra='; gap:28px',
    notes='Camiones por volcable en el puerto de San Lorenzo, semana 17–23/09. Barra = total de la semana y participación. Cuadros = días Jue a Mié; lleno = 20 camiones o más, claro = entre 1 y 19, vacío = sin camiones. Por día: V5 133/98/115/82/82/59/70; V3 138/78/0/15/0/2/39; V4 129/80/26/0/0/0/22; V2 0/39/43/0/44/49/26; V1 0/30/1/0/0/0/1. Promedio 200 por día. Camiones = recorridos de cámara, por día calendario. Son descargas de soja externa R7; el transile de silos R29 (313) no aparece en estas cámaras.')

# ===== 17 silos =====
carga=[3,4,7,13,99,103,116]
chart=vbars(list(zip(days,carga)),116,380,[GLT,GLT,GLT,GLT,GDK,GDK,GDK],barw=96)
sec('silos', head('Sectores · silos Ricardone','Silos: carga para el transile de soja')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:64px"><div style="flex:1; display:flex; flex-direction:column; gap:16px"><p style="font-size:24px; color:{BODY}">Camiones en silos por día (recorridos de cámara)</p>{chart}</div>'
    + f'<div style="width:560px; display:flex; flex-direction:column; gap:28px">'
    + p('Casi toda la actividad fue <b>carga</b> para el transile de soja (313 recorridos R29), de lunes a miércoles.',28)
    + p('La carga salió casi toda por la línea 2 de S8; las descargas fueron pocas.',28)
    + key('El transile corrió de lunes a miércoles, con poca soja externa (115–130 operaciones R7 por día). No aparece en las volcables del puerto: falta confirmar dónde descarga.',26)
    + '</div></div>',
    bg=BG2, notes='Camiones por día en las 4 cámaras de silos Ricardone, carga y descarga, como en el reporte semanal (recorridos de cámara, día calendario). En la semana fueron 329 recorridos distintos; la suma diaria da más porque algunos aparecen en dos días. Por cámara: carga S8 línea 2 267, S7 48, S8 línea 1 4; descarga S7 línea 2 22. El transile R29 son 313 recorridos clasificados. De lunes a miércoles las volcables del puerto registraron 394 descargas, casi las 374 operaciones de soja R7: el R29 no aparece ahí.')

# ===== 18 divider análisis =====
divider('div-analisis','04','Análisis general','Análisis general','Lectura integrada de la planta: circuitos, sectores y actividad cruzados.',VIO,'#B9A8E0')

# ===== 19 mapa de planta =====
def node(title, rows, col, width=560):
    r=''.join(f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center; border-top:1px solid {LINE}; padding:12px 0px"><p style="font-size:26px; color:{TEXT}">{a}</p><p style="font-size:30px; font-weight:600; color:{col}">{b}</p></div>' for a,b in rows)
    return (f'<div style="width:{width}px; display:flex; flex-direction:column; gap:8px; background:{CARD}; border:2px solid {col}; border-radius:20px; padding:28px 32px">'
            f'<p style="font-size:32px; font-weight:600; color:{col}">{title}</p>{r}</div>')
ricn=node('Ricardone · recorridos',[('Calada sólida','1.935'),('Líquidos','290'),('Volcables 1 y 2 · girasol','363'),('Silos · carga y descarga','329'),('Egresos de pellet','26')],GDK)
sln=node('San Lorenzo · recorridos',[('Volcables puerto · soja R7','1.401'),('Calada','253'),('Aceite · recepción interna','134'),('Aceite · puerto','60')],VMID)
def flow(label, val, col):
    return (f'<div style="display:flex; flex-direction:column; align-items:center; gap:8px">'
            f'<p style="font-size:24px; font-weight:600; color:{BODY}; text-align:center">{label}</p>'
            f'<div style="display:flex; flex-direction:row; align-items:center; gap:0px"><div style="width:260px; height:14px; background:{col}"></div><x-shape kind="arrow-right" style="width:64px; height:44px; background:{col}"></x-shape></div>'
            f'<p style="font-size:40px; font-weight:600; color:{col}">{val}</p></div>')
mid=(f'<div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:48px">'
     + flow('Soja R7 · operaciones',fmtn(1370),GDK) + flow('Transile R29 · recorridos (destino a confirmar)','313',GMID) + '</div>')
sec('mapa', head('Análisis general','La semana en un mapa: qué se movió entre plantas', tagbg=VIO)
    + f'<div style="flex:1; display:flex; flex-direction:row; align-items:center; gap:24px">{ricn}{mid}{sln}</div>',
    extra='; gap:32px',
    notes='Las cifras del mapa tienen bases distintas y no se suman entre sí. Cajas: recorridos de cámara por sector en la semana, por día calendario; un camión cuenta en cada sector por el que pasa. Calada sólida 1.935 (por calle suman 1.951): no es soja + girasol; de jueves a domingo coincide con esas operaciones y de lunes a miércoles tiene unos 300 de más, los días del transile desde silos. Líquidos 290: recorridos de la calada de líquidos; no es volumen de aceite. Volcables 1 y 2: 363 recorridos distintos (la suma por cámara da 372); el girasol son 313 operaciones. Silos: 329 recorridos distintos en sus 4 cámaras (carga y descarga); casi todo fue carga para el transile R29. Flechas: soja R7 son 1.370 operaciones, igual que en el resto del deck; el transile R29 son 313 recorridos clasificados. Volcables puerto 1.401 = descarga de soja R7; el R29 no aparece en esas cámaras y su punto de descarga está por confirmar. Egresos de pellet: 26 camiones, igual que en la lámina 2 (sin transiles; sin los 10 movimientos de cáscara pelleteada que no fueron en camión). Aceite SL1 134 / SL2 60: recorridos clasificados.')

# ===== 20 cruces =====
def cross(num, title, text, col, band):
    return (f'<div style="display:flex; flex-direction:column; gap:10px; background:{CARD}; border:1px solid {LINE}; border-left:10px solid {band}; border-radius:16px; padding:24px 28px">'
            f'<p style="font-size:48px; font-weight:600; line-height:1; color:{col}">{num}</p>'
            f'<h3 style="font-size:30px; font-weight:600; line-height:1.2; color:{TEXT}">{title}</h3>'
            f'<p style="font-size:24px; line-height:1.4; color:{BODY}">{text}</p></div>')
sec('cruces', head('Análisis general','Seis lecturas cruzando circuitos y sectores', tagbg=VIO)
    + '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px">'
    + cross('89 min','Ricardone aprovechó la semana','Playa 1 en su segundo mejor registro desde junio (03–09/09: 87), con la mitad de camiones que a fines de agosto.',GDK,GDK)
    + cross('78 · 89','Una calada, dos productos','La espera de girasol y la de soja se mueven juntas: girasol en su mínimo desde junio, soja en el segundo.',GDK,GMID)
    + cross('72 %','Calada en dos calles','Las calles 3 y 4 hicieron el 72 %; la semana anterior dominaron la 1 y la 2 (56 %). La 5 y la 6, casi sin uso.',GDK,GLT)
    + cross('184','San Lorenzo no acompañó','Ricardone bajó de 142 a 104 min; San Lorenzo pasó de 180 a 184, aun con menos camiones.',VIO,VIO)
    + cross('313','Silos entró en escena','De lunes a miércoles, con poca soja externa, se sumó el transile desde silos; su destino está por confirmar.',VIO,VMID)
    + cross('372 min','El jueves no cedió','El 17/09 tardó casi lo mismo que el 27/08 con 35 % menos camiones: no todo se explica por volumen.',VIO,VLT)
    + '</div>',
    extra='; gap:32px',
    notes='Lecturas para discutir en comité; no son conclusiones cerradas. Ricardone (ingreso + Playa 1 + egreso): 142→104; de eso, Playa 1 126→89. San Lorenzo (Playa OSL + descarga + salida): 180→184. Semana anterior = comité 18/09. Playa 1: el mínimo desde junio sigue siendo 87 (semana 03–09/09). Calles 3 y 4: 1.401 de 1.951 pasadas por calle (72 %); semana 10–16/09: 1.251 de 2.960 (42 %), con las calles 1 y 2 en 56 %. Transile R29: 313 recorridos clasificados; su punto de descarga está por confirmar.')

# ===== 21 cierre =====
sec('cierre', (
  f'<div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(120deg, {VIO} 0%, #1F3A38 60%, {GDK} 100%)"></div>'
  f'<div style="flex:1"></div>'
  f'<p style="font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:{GLT}">La semana en una frase</p>'
  f'<h2 style="font-size:88px; font-weight:600; line-height:1.1; color:#F1F6F2; width:1560px">Llegó la mitad de los camiones y Ricardone lo aprovechó. San Lorenzo tardó lo mismo que la semana anterior.</h2>'f'<p style="font-size:30px; line-height:1.4; color:#C9D8CE">1.370 camiones de soja · Ricardone en 104 min (Playa 1: 89) · San Lorenzo en 184 min</p>'
  f'<div style="flex:1"></div>'
  f'<div style="display:flex; flex-direction:row; justify-content:space-between; align-items:center">'
  f'<img src="{LOGO_NVA_L}" alt="Nueva Vicentin Argentina" style="width:220px; height:118px; object-fit:contain">'
  f'<img src="{LOGO_BTZ_L}" alt="Bimtrazer" style="width:200px; height:94px; object-fit:contain"></div>'),
  bg=VIO, dark=True, foot=False, extra='; gap:32px')

# ---------- write ----------
old=set(os.listdir(SL))
ORDER=['portada','resumen-planta','dia-a-dia','cruce-tiempos','div-soja','resumen-soja','hallazgo','plantas','cuartos','historico','div-girasol','girasol','div-sectores','calada','volcables','silos','div-analisis','mapa','cruces','cierre']
slides=sorted(slides,key=lambda x:ORDER.index(x[0]))
slides=[(i,h.replace('§N§',str(k+1))) for k,(i,h) in enumerate(slides)]
for id,html in slides:
    open(os.path.join(SL,f'{id}.html'),'w',encoding='utf-8').write(html)
deckp=os.path.join(ROOT,'project','deck.json')
deck=json.load(open(deckp,encoding='utf-8')) if os.path.exists(deckp) else {
    "v":4,"createdOnFiles":{"v":1,"at":datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')},
    "title":"Comité de Logística Nodo Sur · Semana 17–23 sep","cover":"portada",
    "faces":{"ibm-plex-sans":{"family":"IBM Plex Sans","href":"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
    "designSystems":[]}
deck['title']='Comité de Logística Nodo Sur · Semana 17–23 sep'
deck['order']=[s[0] for s in slides]
deck['sections']={"s1":{"description":"Portada, resumen de la planta, la semana día por día y su cruce con los tiempos","start":"portada"},
 "s2":{"description":"Soja R7: resumen, la semana día por día, por planta, por horario y en contexto","start":"div-soja"},
 "s3":{"description":"Girasol R5+R6: la semana","start":"div-girasol"},
 "s4":{"description":"Sectores: calada, volcables y silos","start":"div-sectores"},
 "s5":{"description":"Análisis general cruzado y cierre","start":"div-analisis"}}
json.dump(deck,open(deckp,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
removed=sorted(f for f in old if f[:-5] not in deck['order'])
print('order',deck['order']); print('removed',removed)
for id,html in slides:
    print(id, html.count('<')//2)
