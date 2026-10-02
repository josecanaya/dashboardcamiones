"""Comité de Seguridad Nodo Sur — semana 24–30/09/2026.

Uso: python scripts/estado-planta/gen_comite_seguridad.py <carpeta_salida>
Réplica de la maqueta del comité de seguridad 28-9 (artifact D7QN1SsViUJhoQT11MhGNo).
Horas de cada caso = hora de las capturas de DSS (C:/Users/Public/DSS Client/<patente>.zip).
Cruce con el Excel de movimientos 24–30/09 (data/movimientos) para confirmar descargas.
"""
import json, os, sys, datetime
OUT = os.path.abspath(sys.argv[1])
SL = os.path.join(OUT, 'project', 'slides'); os.makedirs(SL, exist_ok=True)
LBL = 'Comité de Seguridad · 24 al 30/09/2026'
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
def section(id, body, notes='', bg=BG, dark=False):
    color = '#F4F8F5' if dark else INK
    a = f'<aside>{notes}</aside>' if notes else ''
    slides.append((id, f'<section id="{id}" style="background:{bg}; color:{color}; font-family:{SANS}; padding:112px 128px 176px; display:flex; flex-direction:column; gap:36px; justify-content:start">{body}{footer(dark)}{a}</section>'))
def divider(id, num, title, sub):
    section(id, f'<div style="flex:1"></div><p style="font-family:{SERIF}; font-size:200px; font-weight:700; line-height:1; color:#8C7BB0">{num}</p>'
                f'<h1 style="font-family:{SERIF}; font-size:80px; font-weight:700; color:#FBFBF8; line-height:1.1">{title}</h1>'
                f'<p style="font-size:34px; line-height:1.45; color:#DCD5EA; width:1400px">{sub}</p><div style="flex:1"></div>', bg=VIO, dark=True)
def h2(t, size=60): return f'<h2 style="font-family:{SERIF}; font-size:{size}px; font-weight:700; color:{GDK}">{t}</h2>'
def eyebrow(t, col=ORG): return f'<p style="font-size:26px; font-weight:700; letter-spacing:3px; color:{col}">{t}</p>'

# ---------- portada
slides.append(('cover', f'<section id="cover" data-transition="fade" style="display:flex; flex-direction:column; gap:22px; padding:96px 128px 88px; background:#0B5638; font-family:\'IBM Plex Sans\', Arial, sans-serif; color:#F1F6F2"><div style="position:absolute; left:0px; top:0px; width:1920px; height:1080px; background:linear-gradient(160deg, #0B5638 0%, #0E4A33 60%, #2E1B4E 100%)"></div><img src="{AER_RIC}" alt="Vista aérea de la planta Ricardone" style="position:absolute; left:900px; top:0px; width:1020px; height:536px; object-fit:cover"><img src="{AER_SL}" alt="Vista aérea del puerto San Lorenzo" style="position:absolute; left:900px; top:544px; width:1020px; height:536px; object-fit:cover"><div style="position:absolute; left:900px; top:0px; width:460px; height:1080px; background:linear-gradient(90deg, #0B5638 0%, rgba(11,86,56,0.55) 45%, rgba(11,86,56,0) 100%)"></div><div style="position:absolute; left:900px; top:536px; width:1020px; height:8px; background:#9CCBAE"></div><div style="position:absolute; left:1512px; top:448px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(14,40,28,0.82); border-left:6px solid #7CC3EC; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Planta Ricardone</p></div><div style="position:absolute; left:1512px; top:992px; width:368px; height:60px; display:flex; flex-direction:row; align-items:center; justify-content:center; background:rgba(30,18,52,0.82); border-left:6px solid #F2A65A; border-radius:10px"><p style="font-size:24px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#F1F6F2">Puerto San Lorenzo</p></div><img src="{NVA_L}" alt="Nueva Vicentin Argentina" style="width:240px; height:128px; object-fit:contain; align-self:start"><div style="flex:1"></div><p style="width:700px; font-size:28px; font-weight:600; letter-spacing:3px; text-transform:uppercase; color:#9CCBAE">Seguridad · Ricardone y San Lorenzo</p><h1 style="width:720px; font-size:112px; font-weight:600; line-height:1.02; color:#F1F6F2">Comité de Seguridad Nodo Sur</h1><div style="width:160px; height:8px; background:#9CCBAE; border-radius:4px"></div><p style="width:700px; font-size:40px; line-height:1.3; color:#D6E4DA">Semana del 24 al 30 de septiembre de 2026</p><div style="flex:1"></div><img src="{BTZ_L}" alt="Bimtrazer" style="width:190px; height:90px; object-fit:contain; align-self:start"><aside>Portada. Comité de Seguridad Nodo Sur, semana 24 al 30/09. Ricardone arriba, puerto San Lorenzo abajo.</aside></section>'))

# ---------- números
def card(big, txt, bg, col):
    return f'<div style="flex:1; display:flex; flex-direction:column; gap:20px; background:{bg}; padding:44px 40px; border-radius:24px"><p style="font-family:{SERIF}; font-size:96px; font-weight:700; line-height:1.05; color:{col}; white-space:nowrap">{big}</p><p style="font-size:30px; line-height:1.35; color:{INK}">{txt}</p></div>'
section('numeros', h2('La semana en números', 64)
    + '<div style="flex:1; display:flex; flex-direction:row; gap:28px">'
    + card('636', 'descargas controladas · 99,8 % en su calle', '#E4EFE8', GDK)
    + card('6', 'volvieron a Ricardone sin descargar', '#FBE9E4', RED)
    + card('6', 'demoras de más de 30 min entre plantas sin calado en el puerto', '#FDEEDD', ORG)
    + card('2', 'recorridos raros en las calles del puerto', '#ECE8F3', VIO)
    + '</div>'
    + f'<div style="display:flex; flex-direction:row; gap:24px; align-items:center; background:#FFFFFF; border:2px solid #D3DAD6; border-radius:20px; padding:28px 40px"><x-icon name="Search" style="color:{RED}; width:48px; height:48px"></x-icon><p style="flex:1; font-size:28px; line-height:1.4"><b>HGC160 y AC293WB:</b> el Excel registra dos descargas completas en el puerto; las cámaras vieron una sola.</p></div>',
    'Descargas controladas: ingresos al puerto del Excel 24–30/09 con volcable declarado y lectura de la cámara de la calle (636); 1 en otra calle (AD745GM). Vueltas a Ricardone: el camión llegó al puerto, salió sin pasar por un volcable y volvió a entrar a Ricardone; confirmado con el Excel (sin operación en la primera visita, o con una operación que la cámara del volcable no vio).')

divider('div-vuelta', '01', 'Fueron al puerto y volvieron a Ricardone', 'El circuito de grano termina en San Lorenzo. Estos camiones llegaron al puerto, salieron sin descargar y volvieron a entrar a Ricardone.')

# ---------- casos
def box(t, lab, red=False, plant='ric'):
    c = RED if red else (BLU if plant == 'ric' else ORG)
    bc = RED if red else ('#2F8FCB' if plant == 'ric' else '#E07B1F')
    bw = 3 if red else 2
    lc = RED if red else INK
    return (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:#FFFFFF; border:{bw}px solid {bc}; border-radius:14px; padding:12px 6px">'
            f'<p style="font-size:28px; font-weight:700; color:{c}; white-space:nowrap">{t}</p><p style="font-size:24px; line-height:1.15; text-align:center; color:{lc}">{lab}</p></div>')
def group(plant, items, flex):
    bg, col, name = ('#E3F1FA', BLU, 'RICARDONE') if plant == 'ric' else ('#FDEEDD', ORG, 'SAN LORENZO')
    return (f'<div style="flex:{flex}; display:flex; flex-direction:column; gap:10px; background:{bg}; border-radius:20px; padding:14px 12px 12px"><p style="font-size:24px; font-weight:700; letter-spacing:2px; color:{col}">{name}</p>'
            f'<div style="display:flex; flex-direction:row; gap:8px">' + ''.join(box(t, l, r, plant) for t, l, r in items) + '</div></div>')
def arrow(red=False):
    return f'<div style="display:flex; flex-direction:column; justify-content:center; padding-top:38px"><x-shape kind="arrow-right" style="background:{RED if red else "#A7B0AB"}; width:44px; height:26px"></x-shape></div>'
def case(id, plate, meta, title, pills, groups, photos, notes):
    pl = ''.join(f'<div style="display:flex; flex-direction:row; align-items:baseline; gap:14px; background:{bg}; padding:12px 24px; border-radius:40px"><p style="font-family:{SERIF}; font-size:36px; font-weight:700; color:{c}; white-space:nowrap">{a}</p><p style="font-size:24px; color:{INK}; white-space:nowrap">{b}</p></div>'
                 for (a, b), (bg, c) in zip(pills, [('#FBE9E4', RED), ('#FDEEDD', ORG)]))
    tl = ''
    for i, (plant, items, flex, red_in) in enumerate(groups):
        if i: tl += arrow(red_in)
        tl += group(plant, items, flex)
    ph = ''.join(f'<div style="width:401px; display:flex; flex-direction:column; gap:12px"><img src="{src}" alt="Cámara {t} · {lab}" style="width:401px; height:236px; object-fit:cover; border-radius:14px"><p style="font-size:24px; color:{MUTE}"><b style="color:{INK}">{t}</b> · {lab}</p></div>' for src, t, lab in photos)
    body = (f'<div style="display:flex; flex-direction:row; gap:40px; align-items:center"><div style="display:flex; flex-direction:column; width:340px; background:#FFFFFF; border:4px solid {INK}; border-radius:14px; overflow:hidden"><div style="height:22px; background:#1F3F8C"></div><p style="font-family:Arial, sans-serif; font-size:64px; font-weight:700; text-align:center; letter-spacing:2px; color:{INK}; padding:4px 0px 8px">{plate}</p></div>'
            f'<div style="flex:1; display:flex; flex-direction:column; gap:14px"><p style="font-size:24px; font-weight:600; letter-spacing:2px; color:{MUTE}">{meta}</p><h2 style="font-family:{SERIF}; font-size:44px; font-weight:700; line-height:1.15; color:{INK}">{title}</h2><div style="display:flex; flex-direction:row; gap:16px">{pl}</div></div></div>'
            f'<div style="display:flex; flex-direction:row; gap:10px; align-items:stretch">{tl}</div><div style="display:flex; flex-direction:row; gap:20px">{ph}</div>')
    slides.append((id, f'<section id="{id}" style="background:{BG}; color:{INK}; font-family:{SANS}; padding:112px 128px 176px; display:flex; flex-direction:column; gap:30px; justify-content:start">{body}{footer()}<aside>{notes}</aside></section>'))

case('hgc160', 'HGC160', '28 AL 30/09 · SOJA', 'Salió del puerto sin descargar y descargó al día siguiente',
     [('75 min', 'en el puerto sin descargar'), ('29 h 45 m', 'hasta descargar')],
     [('ric', [('01:05', 'Calada', False), ('01:28', 'Egreso', False)], 2, False),
      ('sl', [('01:40', 'Ingreso', False), ('01:58', 'Balanza', False), ('02:55', 'Egreso', True)], 3, False),
      ('ric', [('05:49', 'Ingreso 30/09', True), ('07:41', '2.ª calada', True)], 2, True),
      ('sl', [('08:40', 'Volcable 5', False), ('09:01', 'Egreso', False)], 2, False)],
     [('/_blob/25bfacfce4bdf4a9a81fe89d7e0bb820', '29/09 01:05', 'Calada'), ('/_blob/7a68969c18bb22d8458f82d54f591272', '02:55', 'Egreso puerto'),
      ('/_blob/3f9e08207e67bcd5d2c938d6224b9beb', '30/09 05:49', 'Ingreso Ricardone'), ('/_blob/7adcf9f9e35d144273a17c10f30ef0c5', '30/09 08:40', 'Volcable 5')],
     'HGC160: pre-ingreso 28/09 23:18, calada 29/09 01:05, puerto 01:40 a 02:55 sin pasar por un volcable. Volvió a Ricardone el 30/09 05:49, caló otra vez a las 07:41 y descargó en el volcable 5 a las 08:40. El Excel registra DOS ingresos al puerto en el volcable 5: 28/09 23:23–29/09 02:56 (34.220 kg) y 30/09 05:55–09:02 (34.320 kg). Las cámaras de los volcables solo lo vieron en el segundo. Vale confirmar si el primero fue una descarga real o un rechazo.')
case('ac293wb', 'AC293WB', '27 Y 28/09 · SOJA', 'Esperó 3 horas y media en el puerto, salió sin descargar y volvió sin calar',
     [('3 h 32 m', 'en el puerto sin descargar'), ('11 h 47 m', 'hasta descargar')],
     [('ric', [('00:08', 'Calada', False), ('00:14', 'Egreso', False)], 2, False),
      ('sl', [('00:23', 'Ingreso', False), ('03:07', 'Balanza', False), ('03:55', 'Egreso', True)], 3, False),
      ('ric', [('10:24', 'Ingreso', True), ('11:08', 'Egreso sin calar', True)], 2, True),
      ('sl', [('14:46', 'Balanza', False), ('15:42', 'Volcable 3', False)], 2, False)],
     [('/_blob/61fe6a81d517b3923bdf1e1978022708', '28/09 00:08', 'Calada'), ('/_blob/eae34763017de2aaec796c353742043c', '03:55', 'Egreso puerto'),
      ('/_blob/fcfc2490397911f1d20356327e88f50f', '10:24', 'Ingreso Ricardone'), ('/_blob/245fc3b5e895092668cb806cd8dd82dc', '15:42', 'Volcable 3')],
     'AC293WB: calada 28/09 00:08, puerto de 00:23 a 03:55 (balanza 03:07, balanza de salida 03:52) sin pasar por un volcable. Volvió a Ricardone a las 10:24 y salió a las 11:08 sin calar; descargó en el volcable 3 a las 15:42. El Excel registra dos ingresos al puerto: volcable 5 27/09 23:33–28/09 03:58 (35.060 kg) y volcable 3 28/09 10:30–16:00 (35.420 kg). La cámara del volcable 5 no lo leyó en la primera.')
case('ai082ap', 'AI082AP', '24/09 · SOJA', 'Salió del puerto a los 24 minutos y volvió a calar dos veces',
     [('24 min', 'en el puerto sin descargar'), ('5 h 49 m', 'hasta descargar')],
     [('ric', [('13:05', 'Calada', False), ('13:12', 'Egreso', False)], 2, False),
      ('sl', [('13:34', 'Ingreso', False), ('13:42', 'Balanza', False), ('13:58', 'Egreso', True)], 3, False),
      ('ric', [('15:04', 'Ingreso', True), ('17:31', '2.ª calada', True), ('18:05', '3.ª calada', True)], 3, True),
      ('sl', [('19:47', 'Volcable 3', False), ('20:02', 'Egreso', False)], 2, False)],
     [('/_blob/bb94320a1f90e6019bbba41452afb55f', '13:05', 'Calada'), ('/_blob/24065620f709777ea9d8a7cf2e13d301', '13:58', 'Egreso puerto'),
      ('/_blob/59297a0ff8132fef3140dd523a1c09f5', '15:04', 'Ingreso Ricardone'), ('/_blob/49c65a1e13a6212709b23d6a2c1466f2', '19:47', 'Volcable 3')],
     'AI082AP: calada 13:05, puerto 13:34 a 13:58 sin descargar, ingreso a Ricardone 15:04, caladas 17:31 y 18:05, volcable 3 a las 19:47. El Excel tiene una sola operación en el puerto: volcable 3, 18:04–20:02 (38.700 kg). La primera visita no tiene operación.')
case('oko733', 'OKO733', '25/09 · SOJA', 'Fue al puerto, salió sin descargar y volvió a calar',
     [('36 min', 'en el puerto sin descargar'), ('2 h 28 m', 'hasta descargar')],
     [('ric', [('13:32', 'Calada', False), ('13:45', 'Egreso', False)], 2, False),
      ('sl', [('13:56', 'Ingreso', False), ('14:19', 'Balanza', False), ('14:32', 'Egreso', True)], 3, False),
      ('ric', [('15:32', 'Ingreso', True), ('15:49', '2.ª calada', True)], 2, True),
      ('sl', [('17:00', 'Volcable 5', False), ('17:14', 'Egreso', False)], 2, False)],
     [('/_blob/85e6289e9194d9bc45fa9a0a1f797b84', '13:32', 'Calada'), ('/_blob/9bb6a34f0c10a0ce3c61effc72bcbd40', '14:32', 'Egreso puerto'),
      ('/_blob/4d7a7c2daa5cf0f433b506b201edc334', '15:32', 'Ingreso Ricardone'), ('/_blob/2a45a25ec102ff0a0d686d6819a3a2ac', '17:00', 'Volcable 5')],
     'OKO733: calada 13:32, puerto 13:56 a 14:32 sin descargar, ingreso a Ricardone 15:32, segunda calada 15:49 y volcable 5 a las 17:00. El Excel tiene una sola operación: volcable 5, 15:37–17:14 (30.240 kg). La primera visita no tiene operación.')
case('ag847tb', 'AG847TB', '26/09 · SOJA', 'Pasó por las dos balanzas del puerto sin descargar y volvió a calar',
     [('28 min', 'en el puerto sin descargar'), ('3 h 12 m', 'hasta descargar')],
     [('ric', [('09:58', 'Calada', False), ('10:14', 'Egreso', False)], 2, False),
      ('sl', [('10:26', 'Ingreso', False), ('10:42', 'Balanza salida', True), ('10:54', 'Egreso', True)], 3, False),
      ('ric', [('12:01', 'Ingreso', True), ('13:19', '2.ª calada', True)], 2, True),
      ('sl', [('14:06', 'Volcable 5', False), ('14:21', 'Egreso', False)], 2, False)],
     [('/_blob/ea7f85f6ad69b101201909a3586e44d1', '09:58', 'Calada'), ('/_blob/20bfc1e0c52a5ba21e4e0a1f5658a6ae', '10:42', 'Balanza de salida'),
      ('/_blob/1c99acdd191b6b2e5276bc1cb8f8ddb8', '12:01', 'Ingreso Ricardone'), ('/_blob/b69a68e38729addb39bb0164ad9233b6', '14:06', 'Volcable 5')],
     'AG847TB (las capturas están en el archivo AG479TB): calada 09:58, puerto 10:26 a 10:54 con balanza de ingreso 10:29 y balanza de salida 10:42, sin volcable. Volvió a Ricardone 12:01, caló 13:19 y descargó en el volcable 5 a las 14:06. El Excel tiene una sola operación: volcable 5, 12:06–14:24 (30.260 kg).')
case('knp563', 'KNP563', '27/09 · SOJA', 'Salió del puerto a los 20 minutos y descargó 13 horas después',
     [('20 min', 'en el puerto sin descargar'), ('12 h 58 m', 'hasta descargar')],
     [('ric', [('00:32', 'Pre-ingreso', False), ('03:08', 'Calada', False)], 2, False),
      ('sl', [('03:34', 'Ingreso', False), ('03:37', 'Balanza', False), ('03:54', 'Egreso', True)], 3, False),
      ('ric', [('12:36', 'Ingreso', True), ('15:48', '2.ª calada', True)], 2, True),
      ('sl', [('16:24', 'Calado', False), ('16:52', 'Volcable 2', False)], 2, False)],
     [('/_blob/0a83df336a10646d49bc0d90c0b994e6', '03:08', 'Calada'), ('/_blob/8bd7e0ad0a0563c6f94d0af877704d8e', '03:54', 'Egreso puerto'),
      ('/_blob/57c00a988fadce4ef7ae400ee9c3c1d8', '12:36', 'Ingreso Ricardone'), ('/_blob/e452f5ce7875dc3a458f4f94bd4aeb74', '16:52', 'Volcable 2')],
     'KNP563 (las capturas están en el archivo KNP653): calada 03:08, puerto 03:34 a 03:54 sin descargar, ingreso a Ricardone 12:36, segunda calada 15:48, calado en el puerto 16:24 y volcable 2 a las 16:52. El Excel tiene una sola operación: volcable 2, 12:41–17:14 (31.120 kg).')

divider('div-calles', '02', 'Calles del puerto', 'Sobre 636 descargas con volcable declarado y lectura de cámara, una sola terminó en otra calle. Se suman dos recorridos que no son de una descarga normal.')

section('calles', eyebrow('CALLE DE DESCARGA · PUERTO SAN LORENZO') + h2('Calles: otra calle y dos calles en la misma visita')
    + f'<table style="font-size:30px; color:{INK}; padding:18px 22px"><tr><th style="width:15%">Patente</th><th style="width:11%">Fecha</th><th style="width:26%">Excel</th><th style="width:48%">Cámara de la calle</th></tr>'
    + f'<tr style="background:#FDEEDD"><td style="font-weight:700">AD745GM</td><td>24/09</td><td style="color:{GDK}">Soja · Volcable 5</td><td style="color:{RED}">Calle 4 · 00:10</td></tr>'
    + f'<tr style="background:{BG}"><td style="font-weight:700">HYC360</td><td>26/09</td><td style="color:{GDK}">Soja · Volcable 5</td><td style="color:{RED}">Calle 1 · 10:19, luego calle 5 · 10:32</td></tr>'
    + f'<tr style="background:#FDEEDD"><td style="font-weight:700">EEW075</td><td>24/09</td><td style="color:{GDK}">Transile de soja</td><td style="color:{RED}">Calle 3 · 05:26, calles 3 y 4 · 05:29</td></tr>'
    + f'<tr style="background:{BG}"><td style="font-weight:700">KEB002</td><td>30/09</td><td style="color:{GDK}">Despacho de cáscara pelleteada</td><td style="color:{RED}">Calle 2 · 11:52, calle 3 · 12:42, calle 2 · 13:13, calle 3 · 13:34</td></tr></table>'
    + '<p style="font-size:28px; line-height:1.4">AD745GM descargó en la calle 4 con el volcable 5 declarado. HYC360 pasó por la calle 1, que casi no se usa. EEW075 y KEB002 tienen lámina propia.</p>',
    'Descargas controladas: 636 ingresos al puerto 24–30/09 con volcable declarado en el Excel y lectura de la cámara de la calle; 635 en la calle declarada (99,8 %). La semana anterior: 1.108, 99,2 %.')

case('keb002', 'KEB002', '29 Y 30/09 · DESPACHO CÁSCARA DE SOJA', 'Camión de despacho que cargó en las calles de descarga del puerto',
     [('4', 'pasadas por las calles 2 y 3'), ('2', 'caladas en el puerto')],
     [('ric', [('29/09 13:52', 'Pre-ingreso', False), ('07:38', 'Egreso 30/09', False)], 2, False),
      ('sl', [('07:52', 'Ingreso', False), ('08:05', 'Calado', False), ('11:26', 'Balanza', False)], 3, False),
      ('sl', [('11:52', 'Calle 2', True), ('12:42', 'Calle 3', True), ('13:13', 'Calle 2', True)], 3, True),
      ('sl', [('13:25', '2.º calado', True), ('13:34', 'Calle 3', True), ('13:50', 'Egreso', False)], 3, False)],
     [('/_blob/e034e97fdf7a07b280c6bc7751661476', '08:05', 'Calado puerto'), ('/_blob/b34cc3341cb100a59e0d102ec746fbda', '11:52', 'Calle 2'),
      ('/_blob/546d37390b902aeafdf89fe12f13c4cb', '12:42', 'Calle 3'), ('/_blob/7d57f572aa9761339b5b470241a24c95', '13:34', 'Calle 3')],
     'KEB002: el Excel lo registra como EGRESO de la Terminal con cáscara de soja pelleteada (ingreso 29/09 13:58, salida 30/09 13:42, 30.460 kg). Las cámaras lo leyeron en el pre-ingreso de Ricardone el 29/09 y el 30/09 lo vieron calado dos veces en el puerto y pasando cuatro veces por las calles 2 y 3. En la captura de las 11:52 se ve una pala cargadora junto al camión en la calle 2. Vale confirmar si la carga de cáscara se hace en las calles de descarga.')
case('eew075', 'EEW075', '24/09 · TRANSILE DE SOJA', 'Leído por las cámaras de dos calles en el mismo segundo',
     [('05:29', 'en las calles 3 y 4 a la vez'), ('3 min', 'entre las dos lecturas de la calle 3')],
     [('ric', [('04:44', 'Carga silo', False), ('05:00', 'Balanza', False), ('05:05', 'Calada', False)], 3, False),
      ('sl', [('05:24', 'Balanza', False), ('05:26', 'Calle 3', True), ('05:29', 'Calles 3 y 4', True)], 3, False),
      ('sl', [('05:37', 'Egreso', False)], 1, False),
      ('ric', [('05:46', 'Ingreso', False)], 1, False)],
     [('/_blob/8e0afe3853359d92419ca916c1ee770e', '04:44', 'Carga en silo'), ('/_blob/4fe292291bc0101accbc0cd88e0b202a', '05:26', 'Calle 3'),
      ('/_blob/f496d717b2e2e250fafb99aca7eb7d36', '05:29', 'Calle 4'), ('/_blob/2a05b9cae621ab772b3c9e9d2b0d3832', '05:37', 'Egreso puerto')],
     'EEW075, transile de soja silo → puerto: carga en S8 línea 2 a las 04:44, calada 05:05, balanza del puerto 05:24, calle 3 a las 05:26 y a las 05:29 lo leen a la vez las cámaras de las calles 3 y 4. Puede ser una lectura cruzada entre calles vecinas: vale confirmar en qué calle descargó. En el Excel la carga del silo está (salida de Ricardone 05:06) y el ingreso al puerto no figura.')

divider('div-interplanta', '03', 'Demoras entre plantas sin calado en el puerto', 'Más de 30 minutos entre la salida de Ricardone y la entrada al puerto (el viaje normal es de 12), sin pasar después por la calada de San Lorenzo.')
rows = [('24/09', '12:50', 'SYB408', 'Soja', 40), ('24/09', '12:53', 'RXV065', 'Transile soja', 38), ('24/09', '12:56', 'KLW300', 'Soja', 36),
        ('24/09', '13:00', 'FDH917', 'Transile soja', 35), ('29/09', '09:49', 'RAW481', 'Transile soja', 37), ('30/09', '12:44', 'VJG112', 'Transile pellet', 75)]
tr = ''.join(f'<tr style="background:{"#FDEEDD" if i % 2 == 0 else BG}"><td>{d}</td><td>{h}</td><td style="font-weight:700">{p}</td><td>{c}</td><td style="color:{RED}; font-weight:700; text-align:right">{m} min</td></tr>' for i, (d, h, p, c, m) in enumerate(rows))
section('interplanta', eyebrow('INTERPLANTA · RICARDONE → SAN LORENZO') + h2('Seis camiones tardaron más de 30 minutos y no pasaron por la calada del puerto')
    + f'<table style="font-size:30px; color:{INK}; padding:16px 22px"><tr><th style="width:14%">Día</th><th style="width:16%">Salida Ric</th><th style="width:20%">Patente</th><th style="width:28%">Carga</th><th style="width:22%; text-align:right">Demora</th></tr>{tr}</table>'
    + '<p style="font-size:28px; line-height:1.4">Cuatro salieron de Ricardone el 24/09 entre las 12:50 y las 13:00 y entraron juntos al puerto a las 13:30: parece una espera en la entrada más que un desvío. VJG112 tardó 75 minutos el 30/09.</p>',
    'Regla: egreso Ricardone → ingreso San Lorenzo entre 30 min y 2 h, y sin lectura en la calada del puerto hasta la salida. Solo grano (soja y transile). Quedan fuera tres camiones de metanol (26/09) y uno de productos varios (30/09). Las semanas del 11/09 y 18/09 hubo 33 y 25 casos, casi todos alrededor de la medianoche; esta semana no se repitió ese patrón.')

divider('div-grafo', '04', 'Otros caminos fuera del modelo', 'Cruzamos cada recorrido de la semana con el modelo de nodos de la planta: estos son los pasos que no aparecen en ningún circuito.')
grows = [('24', 'De la calada volvieron al pre-ingreso', 'La mayoría en 5 a 10 minutos y sin recalar. Puede ser una vuelta a Playa 1 a esperar turno de balanza.', ORG),
         ('2', 'Descargaron girasol y volvieron al pre-ingreso', 'SAI142 y JFB974 (24/09): volcable 1 y, 3 horas después, de nuevo en el pre-ingreso sin egreso leído.', RED),
         ('3', 'Salieron y volvieron directo a calada', 'ROL445, IWX998 y GIN200: egreso de Ricardone y después calada, sin pasar por el pre-ingreso.', RED),
         ('2', 'Del volcable del puerto volvieron a entrar', 'ROS380 (25/09) y KWN857 (30/09): volcable y luego otra vez el ingreso del puerto.', VIO)]
gc = ''.join(f'<div style="display:flex; flex-direction:column; gap:12px; background:#FFFFFF; border:2px solid #D3DAD6; border-left:10px solid {c}; border-radius:20px; padding:26px 30px"><div style="display:flex; flex-direction:row; align-items:baseline; gap:18px"><p style="font-family:{SERIF}; font-size:64px; font-weight:700; color:{c}">{n}</p><h3 style="font-size:32px; font-weight:700; line-height:1.2; color:{INK}">{t}</h3></div><p style="font-size:26px; line-height:1.4; color:{MUTE}">{d}</p></div>' for n, t, d, c in grows)
section('grafo', eyebrow('MODELO DE NODOS · NODO SUR', VIO) + h2('Pasos que no figuran en ningún circuito')
    + f'<div style="display:grid; grid-template-columns:1fr 1fr; gap:24px">{gc}</div>'
    + '<p style="font-size:26px; line-height:1.4; color:#2E1B4E"><b>Para revisar antes de sumarlos como regla.</b> No se cuentan los pasos propios del transile (Playa 3, silos) ni camiones internos sin Excel.</p>',
    'Método: cada patente, sus cámaras en orden de la semana 24–30/09, y cada par consecutivo se compara con el orden de los 50 circuitos del modelo de nodos (docs/propuesta-en-vivo/modelo-nodos-nodo-sur). Aparecen además pasos del transile que el modelo todavía no tiene (salida → Playa 3 en 97 camiones, volcables 1 y 2 → volcable silo Keppler) y circuitos internos del puerto (Renova, OSL); son huecos del modelo, no anomalías.')

# ---------- histórico
H = [('10/6', 2), ('18/6', 5), ('24/6', 4), ('8/7', 2), ('15/7', 5), ('23/7', 8), ('31/7', 10), ('7/8', 10), ('14/8', 8), ('4/9', 10), ('11/9', 4), ('18/9', 7), ('28/9', 9), ('2/10', 10)]
mx = max(v for _, v in H)
bars = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:end; gap:8px"><p style="font-size:26px; font-weight:700">{v}</p><div style="align-self:stretch; height:{round(v / mx * 300)}px; background:{RED if l == "2/10" else GDK}; border-radius:8px 8px 0px 0px"></div><p style="font-size:24px; color:{MUTE}">{l}</p></div>' for l, v in H)
CAT = [('Doble ciclo o doble ingreso', 34, GDK), ('Volvió a Ricardone desde el puerto', 22, RED), ('Primer ingreso por el puerto', 11, BLU),
       ('Descarga en otra calle', 10, ORG), ('Vuelta al pre-ingreso', 5, '#7B8A83'), ('Cambio de punto de descarga (Celda 16, silos)', 5, '#7B8A83'),
       ('Otros (calle interna, líquidos, despacho)', 5, '#7B8A83'), ('Transile sin lectura en el puerto', 2, '#7B8A83')]
tot = sum(v for _, v, _ in CAT)
cats = ''.join(f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px"><p style="width:330px; font-size:24px; line-height:1.2; color:{INK}">{n}</p><div style="width:{max(8, round(v / 34 * 260))}px; height:30px; background:{c}; border-radius:0px 6px 6px 0px"></div><p style="font-size:26px; font-weight:700; color:{INK}; white-space:nowrap">{v}</p></div>' for n, v, c in CAT)
section('historico', eyebrow('HISTÓRICO · 10/06 AL 02/10', GDK) + h2(f'{tot} anomalías presentadas desde junio')
    + f'<div style="flex:1; display:flex; flex-direction:row; gap:56px"><div style="flex:1; display:flex; flex-direction:column; gap:12px"><p style="font-size:26px; font-weight:700">Casos por comité</p><div style="flex:1; display:flex; flex-direction:row; gap:8px; align-items:end">{bars}</div></div>'
    + f'<div style="width:720px; display:flex; flex-direction:column; gap:14px"><p style="font-size:26px; font-weight:700">Las que más se repiten</p>{cats}</div></div>'
    + f'<p style="font-size:28px; line-height:1.4"><b>Doble ciclo</b> sigue siendo la más frecuente (34). En los dos últimos comités pasó al frente <b>la vuelta a Ricardone desde el puerto</b>: 9 de 19 casos.</p>',
    'Casos con lámina propia en cada comité de seguridad (10/06 al 02/10), sin contar las tablas de demoras interplanta (33 el 11/09, 25 el 18/09, 6 esta semana). Fuente: PDF de cada comité y Excel Historico anomalias (29/06–05/08). Clasificación propuesta, a validar: doble ciclo incluye doble ingreso, doble o triple calado y recalado; volver a Ricardone incluye después de descargar y sin descargar.')

# ---------- write
ORDER = ['cover', 'numeros', 'div-vuelta', 'hgc160', 'ac293wb', 'ai082ap', 'oko733', 'ag847tb', 'knp563', 'div-calles', 'calles', 'keb002', 'eew075',
         'div-interplanta', 'interplanta', 'div-grafo', 'grafo', 'historico']
slides = sorted(slides, key=lambda x: ORDER.index(x[0]))
for k, (i, h) in enumerate(slides):
    open(os.path.join(SL, f'{i}.html'), 'w', encoding='utf-8').write(h.replace('§N§', str(k + 1)))
deck = {"v": 4, "createdOnFiles": {"v": 1, "at": datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}, "lists": "css",
        "title": "Comité de Seguridad · Semana 24–30 sep", "order": ORDER, "cover": "cover",
        "sections": {"s1": {"description": "Portada y números de la semana", "start": "cover"},
                     "s2": {"description": "Camiones que fueron al puerto y volvieron a Ricardone antes de descargar", "start": "div-vuelta"},
                     "s3": {"description": "Calles del puerto: otra calle y dos calles en la misma visita", "start": "div-calles"},
                     "s4": {"description": "Demoras entre plantas sin calado en el puerto", "start": "div-interplanta"},
                     "s5": {"description": "Caminos fuera del modelo de nodos e histórico de anomalías", "start": "div-grafo"}},
        "faces": {"domine": {"family": "Domine", "href": "https://fonts.googleapis.com/css2?family=Domine:wght@400..700&display=swap"},
                  "public-sans": {"family": "Public Sans", "href": "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;600;700&display=swap"},
                  "ibm-plex-sans": {"family": "IBM Plex Sans", "href": "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600;700&display=swap"}},
        "designSystems": []}
json.dump(deck, open(os.path.join(OUT, 'project', 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(slides), 'láminas')
