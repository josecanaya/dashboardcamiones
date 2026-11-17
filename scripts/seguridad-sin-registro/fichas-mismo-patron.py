"""Visor HTML (láminas 1920×1080) con las fichas del Comité de Seguridad para los camiones que cruzan las balanzas
de Ricardone sin pesar (mismo patrón que CXV575). Formato de `ficha` en scripts/estado-planta/gen_comite_seguridad.py;
sin kg (memoria «Comité de Seguridad sin kg"). Fotos del DSS incrustadas.

Uso: python scripts/seguridad-sin-registro/fichas-mismo-patron.py <carpeta logos> <salida.html>
     (logos: python scripts/estado-planta/logos.py <carpeta>)
Lee reportes/barrera-sin-sistema/fichas-mismo-patron.json (datos-mismo-patron.py) y fotos-mismo-patron/*.jpg.
"""
import base64, io, json, os, sys
from datetime import datetime, timedelta
from PIL import Image

LOGOS, OUT = sys.argv[1], sys.argv[2]
R = 'reportes/barrera-sin-sistema'
D = json.load(open(f'{R}/fichas-mismo-patron.json', encoding='utf-8'))
# Fuera (05/11): sus visitas caen en días sin Excel de movimientos (salidas 18/05 y 26–28/05); camión de granos según el usuario.
FUERA = {'AE131JP'}
D = [x for x in D if x['patente'] not in FUERA]
NUM = {6: 'Seis', 7: 'Siete', 8: 'Ocho', 9: 'Nueve', 10: 'Diez', 11: 'Once', 12: 'Doce'}

INK = '#1B2420'; MUTE = '#4F5A55'; BG = '#FBFBF8'; GDK = '#0B5638'; VIO = '#2E1B4E'
RED = '#B83A26'; ORG = '#A8560C'; BLU = '#1C6E9F'
SERIF = "'Domine', Georgia, serif"; SANS = "'Public Sans', Arial, sans-serif"
PERIODO = '01/07 al 04/11/2026'

# Lo que se ve en las fotos (revisadas a mano el 05/11) y el pedido de cada caso.
VEHICULO = {
    'MTM450': 'Mercedes-Benz Atego con hidrogrúa', 'FQI716': 'Volkswagen con caja playa y barandas', 'LPZ703': 'Ford Cargo blanco',
    'AF831ID': 'Mercedes-Benz Atego con caja y barandas', 'RSW086': 'Mercedes-Benz amarillo con hidrogrúa',
    'CXV575': 'Tractor blanco con batea (el DSS lo clasificó como camioneta)', 'AF241DX': 'Tractor Mercedes-Benz Axor blanco',
    'NAD656': 'Mercedes-Benz Atego con hidrogrúa', 'AE131JP': 'Camión; las dos veces de madrugada', 'AH498JW': 'Mercedes-Benz con caja azul',
    'OAA734': 'Iveco Tector con caja playa',
    'AB531CT': 'Iveco Tector con hidrogrúa, leyenda «Solmec»', 'AB127BY': 'Iveco Tector con caja roja',
}
VEHICULO['NAD656'] = 'Mercedes-Benz Atego con hidrogrúa, leyenda «LH Servicios Industriales»'
EXTRA = {
    'MTM450': 'Con FQI716 coincidió 5 días.', 'FQI716': 'Con MTM450 coincidió 5 días.', 'RSW086': 'Con AF241DX coincidió 2 días.',
    'AF241DX': 'Con RSW086 coincidió 2 días.', 'CXV575': 'El 02/11 dio dos vueltas en el día.', 'NAD656': 'Con AB531CT coincidió el 23/10 en el puerto.', 'AB531CT': 'Las tres veces pasó por los tanques del puerto. Con NAD656 coincidió el 23/10.',
    'AB127BY': 'En el puerto pasó por los tanques.',
}
PLANTA = {'RICARDONE': 'Ricardone', 'TERMINAL_EMBARQUE': 'el puerto'}
DEV = {'RicB1Ingreso': 'Balanza 1 · ingreso', 'RicB2Egreso': 'Balanza 2 · egreso', 'RicB3Ingreso': 'Balanza 3 · ingreso', 'RicB3Egreso': 'Balanza 3 · egreso',
       'RicIngCamFrente': 'Ingreso', 'RicEgrCamFrente': 'Salida 2', 'RicPreIngInFr': 'Preingreso',
       'SLZBalIngFte': 'Puerto · balanza ingreso', 'SLZBalSC1Fte': 'Puerto · balanza salida', 'SLZBalSC2Fte': 'Puerto · balanza salida',
       'SLZSalidaC1Fte': 'Puerto · egreso', 'SLZSalidaC2Fte': 'Puerto · egreso', 'SLZIngCamFrente': 'Puerto · ingreso', 'SLZTK400': 'Puerto · tanques'}
PLANTA_HUELLA = {'ric': ('RICARDONE', '#E3F1FA', BLU, 'Balanza 1 → Balanza 2'), 'sl': ('PUERTO SAN LORENZO', '#FDEEDD', ORG, 'balanza de ingreso → balanza de salida o egreso')}

dm = lambda d: f'{d[8:10]}/{d[5:7]}'
def hm(m): return f'{m} min' if m < 60 else f'{m // 60} h {m % 60:02d} m'
def b64(path, w=None):
    im = Image.open(path)
    if w: im.thumbnail((w, w))
    buf = io.BytesIO(); fmt = 'PNG' if path.endswith('.png') else 'JPEG'
    im.save(buf, fmt, **({'quality': 70} if fmt == 'JPEG' else {}))
    return f'data:image/{fmt.lower()};base64,' + base64.b64encode(buf.getvalue()).decode()
NVA, BTZ, NVA_L, BTZ_L = (b64(os.path.join(LOGOS, f), 400) for f in ('nva_green.png', 'btz.png', 'nva_light.png', 'btz_light.png'))

slides = []
def footer(dark=False):
    col = '#CFE3D7' if dark else MUTE
    return (f'<div style="position:absolute; left:128px; right:128px; bottom:56px; height:64px; display:flex; align-items:center; justify-content:space-between">'
            f'<p style="font-size:24px; color:{col}">Comité de Seguridad · Anexo · balanza sin pesar · {len(slides) + 1}</p>'
            f'<div style="display:flex; align-items:center; gap:40px"><img src="{NVA_L if dark else NVA}" alt="Nueva Vicentin Argentina" style="width:75px; height:40px; object-fit:contain">'
            f'<img src="{BTZ_L if dark else BTZ}" alt="Bimtrazer" style="width:119px; height:56px; object-fit:contain"></div></div>')
def section(body, bg=BG, dark=False, gap=28, pad='112px 128px 176px'):
    color = '#F4F8F5' if dark else INK
    slides.append(f'<section style="background:{bg}; color:{color}; font-family:{SANS}; padding:{pad}; display:flex; flex-direction:column; gap:{gap}px">{body}{footer(dark)}</section>')
def eyebrow(t, col=ORG): return f'<p style="font-size:26px; font-weight:700; letter-spacing:3px; color:{col}">{t}</p>'
def h2(t, size=56): return f'<h2 style="font-family:{SERIF}; font-size:{size}px; font-weight:700; line-height:1.2; color:{GDK}">{t}</h2>'
def chip(t): return f'<p style="font-size:26px; font-weight:700; color:{INK}; background:#EEF0EF; padding:6px 18px; border-radius:24px">{t}</p>'

def balanza_txt(x, corto=False):
    if not x['balanza']: return 'Nunca pasó por la balanza'
    out = []
    vistos = set()
    for b in x['balanza']:
        if (b['dia'], b['mov'], b['planta']) in vistos: continue   # dos pesadas iguales el mismo día: una sola
        vistos.add((b['dia'], b['mov'], b['planta']))
        t = f'{dm(b["dia"])}, {b["mov"].lower()} en {PLANTA.get(b["planta"], b["planta"])}'
        if not corto: t += f': «{b["obs"].capitalize()}»' + (f' ({b["empresa"].title().replace("S.A.I.C.", "SAIC").replace("Srl", "SRL").replace("S.R.L.", "SRL")})' if b['empresa'] and 'VARIOS' not in b['empresa'] else '')
        out.append(t)
    return '; '.join(out)

# ── 1. Portada ──────────────────────────────────────────────────────────────────────────────────────────────
n_pas = sum(len(x['huellas']) for x in D)
section(f'<div style="flex:1"></div>{eyebrow("COMITÉ DE SEGURIDAD · ANEXO", "#CDBFE6")}'
        f'<h1 style="font-family:{SERIF}; font-size:84px; font-weight:700; line-height:1.12; color:#FBFBF8; width:1500px">Camiones que cruzan las balanzas sin pesar</h1>'
        f'<p style="font-size:36px; line-height:1.45; color:#DCD5EA; width:1450px">El mismo patrón que CXV575: <b style="color:#FFFFFF">{len(D)} camiones, {n_pas} pasadas</b> por las balanzas de Ricardone y del puerto San Lorenzo '
        f'sin ingreso en el sistema, sin carta de porte y sin alta en el back office. {PERIODO}.</p><div style="flex:1"></div>', bg=VIO, dark=True)

# ── 2. Resumen ──────────────────────────────────────────────────────────────────────────────────────────────
th = lambda t, a='left': f'<th style="text-align:{a}; font-size:20px; letter-spacing:1px; color:{MUTE}; padding:8px 14px; border-bottom:3px solid {INK}">{t}</th>'
td = lambda t, a='left', b=False: f'<td style="text-align:{a}; font-size:20px; line-height:1.25; padding:6px 12px; border-bottom:1px solid #D3DAD6; {"font-weight:700;" if b else ""}">{t}</td>'
filas = ''.join('<tr>' + td(f'<span style="font-family:Arial; letter-spacing:1px">{x["patente"]}</span>', b=True) + td(len(x['huellas']), 'right', True)
                + td(f'{dm(x["huellas"][0]["dia"])} → {dm(x["huellas"][-1]["dia"])}') + td(len(x['visitas']), 'right') + td(VEHICULO[x['patente']].split(' (')[0])
                + td(balanza_txt(x, corto=True)) + '</tr>' for x in D)
section(eyebrow('RESUMEN') + h2(f'{NUM.get(len(D), len(D))} camiones repiten la pasada por las dos balanzas sin pesar', 50)
        + f'<table style="border-collapse:collapse; width:100%"><thead><tr>{th("PATENTE")}{th("PASADAS SIN PESAR", "right")}{th("PRIMERA → ÚLTIMA")}{th("DÍAS SIN REGISTRO", "right")}{th("VEHÍCULO")}{th("ÚNICAS VECES EN LA BALANZA")}</tr></thead><tbody>{filas}</tbody></table>'
        + f'<p style="font-size:20px; line-height:1.35; color:{MUTE}"><b style="color:{INK}">Pasada sin pesar:</b> en Ricardone, Balanza 1 de ingreso y Balanza 2 de egreso; en el puerto, balanza de ingreso y balanza de salida (o el egreso, porque la cámara de salida falla). '
          f'25 min o más entre una y otra, sin calada ni ingreso del sistema (±2 h). <b style="color:{INK}">Días sin registro:</b> días con cámaras y sin registro en cualquiera de las dos plantas.</p>', gap=16, pad='88px 128px 150px')

# ── 3. Mismos días ──────────────────────────────────────────────────────────────────────────────────────────
dias = {}
for x in D:
    for h in x['huellas']: dias.setdefault(h['dia'], []).append(x['patente'])
juntos = sorted((d, ps) for d, ps in dias.items() if len(ps) > 1)
cards = ''.join(f'<div style="width:300px; display:flex; flex-direction:column; gap:8px; background:#FFFFFF; border:2px solid #D3DAD6; border-top:6px solid {BLU}; border-radius:12px; padding:14px 18px">'
                f'<p style="font-size:30px; font-weight:700; color:{BLU}">{dm(d)}</p>' + ''.join(f'<p style="font-family:Arial; font-size:28px; font-weight:700; letter-spacing:1px">{p}</p>' for p in ps) + '</div>' for d, ps in juntos)
section(eyebrow('MISMOS DÍAS', BLU) + h2('Varios vienen juntos: parece la misma flota o el mismo trabajo', 50)
        + f'<div style="display:flex; flex-wrap:wrap; gap:18px">{cards}</div>'
        + f'<p style="font-size:26px; line-height:1.4; color:{INK}; width:1600px">MTM450 y FQI716 cruzaron las balanzas los mismos cinco días. AB531CT y NAD656 coincidieron el 23/10 en el puerto. MTM450, RSW086, AB531CT y NAD656 tienen hidrogrúa. '
          f'Cuando pasaron por la balanza fueron «productos varios»: almacenes, obradores y trabajos varios.</p>')

# ── 4. Fichas ───────────────────────────────────────────────────────────────────────────────────────────────
def hora(at): return (datetime.fromisoformat(at.replace('Z', '+00:00')) - timedelta(hours=3)).strftime('%H:%M')
BAL_FOTO = ('RicB1Ingreso', 'RicB2Egreso', 'SLZBalIngFte', 'SLZBalSC2Fte', 'SLZBalSC1Fte', 'SLZSalidaC1Fte', 'SLZSalidaC2Fte')
def elegir_fotos(fs, n=4):
    fs = sorted(fs, key=lambda f: (f['dia'], f['device'] not in BAL_FOTO, f['at']))
    dias_ = sorted({f['dia'] for f in fs})
    pick = []
    for d in [dias_[round(i * (len(dias_) - 1) / (n - 1))] for i in range(n)] if len(dias_) >= n else dias_:
        for f in fs:
            if f['dia'] == d and f not in pick: pick.append(f); break
    for f in fs:   # completa con otra cámara de los mismos días
        if len(pick) >= n: break
        if f not in pick: pick.append(f)
    return sorted(pick[:n], key=lambda f: f['at'])

for x in D:
    pl = x['patente']; hs = x['huellas']; n = len(hs)
    mins = [h['minB1B2'] for h in hs]
    rango = f'{dm(hs[0]["dia"])} a {dm(hs[-1]["dia"])}'
    por = {k: [h for h in hs if h['planta'] == k] for k in ('ric', 'sl')}
    donde = ' y '.join(t for t in (f'{len(por["ric"])} en Ricardone' if por['ric'] else '', f'{len(por["sl"])} en el puerto' if por['sl'] else '') if t)
    if not por['sl']:
        que = f'Cruzó la Balanza 1 y la Balanza 2 de Ricardone {n} veces sin pesar'
    elif not por['ric']:
        que = f'Cruzó las balanzas del puerto San Lorenzo {n} veces sin pesar'
    else:
        que = f'Cruzó las balanzas sin pesar {n} veces: {donde}'
    que += f', entre el {dm(hs[0]["dia"])} y el {dm(hs[-1]["dia"])}' if n > 2 else f': {dm(hs[0]["dia"])} y {dm(hs[1]["dia"])}'
    registro = 'Sin carta de porte, sin alta en el back office y sin ingreso en el sistema esos días. ' + (
        'Nunca pasó por la balanza.' if not x['balanza'] else 'En la balanza solo: ' + balanza_txt(x) + '.')
    otros = len(x['visitas']) - n
    camaras = ('. '.join(f'{len(v)} {"pasada" if len(v) == 1 else "pasadas"} {PLANTA_HUELLA[k][3]}' + (f' en {"Ricardone" if k == "ric" else "el puerto"}' if por['ric'] and por['sl'] else '') for k, v in por.items() if v)
               + f', de {hm(min(mins))} a {hm(max(mins))} entre una y otra. '
               + (f'También vino el {dm(next(d for d in x["visitas"] if d not in {h["dia"] for h in hs}))} sin registro. ' if otros == 1
                  else f'Vino otros {otros} días sin registro desde el {dm(x["visitas"][0])}. ' if otros > 1 else '') + EXTRA.get(pl, ''))
    pedimos = 'Qué hizo en cada pasada por la balanza, a quién presta servicio y quién le abrió la barrera sin alta en el sistema.'
    plate = (f'<div style="display:flex; flex-direction:column; width:280px; background:#FFFFFF; border:4px solid {INK}; border-radius:12px; overflow:hidden"><div style="height:16px; background:#1F3F8C"></div>'
             f'<p style="font-family:Arial, sans-serif; font-size:52px; font-weight:700; letter-spacing:2px; text-align:center; color:{INK}; padding:2px 0px 6px">{pl}</p></div>')
    cajas = ''.join(f'<div style="flex:1; display:flex; flex-direction:column; gap:6px; background:#FFFFFF; border:2px solid #D3DAD6; border-top:6px solid {ORG}; border-radius:12px; padding:12px 16px">'
                    f'<p style="font-size:20px; font-weight:700; letter-spacing:1px; color:{ORG}">{t}</p><p style="font-size:21px; line-height:1.3; color:{INK}">{v}</p></div>'
                    for t, v in (('REGISTRO', registro), ('CÁMARAS', camaras), ('QUÉ PEDIMOS', pedimos)))
    compacto = n > 5
    pasada = lambda h: (f'<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; background:#FFFFFF; border:2px solid {BLU}; border-radius:12px; padding:{"6px 4px" if compacto else "8px 10px"}">'
                      f'<p style="font-size:{24 if compacto else 28}px; font-weight:700; color:{BLU}">{dm(h["dia"])}</p>'
                      f'<p style="font-size:{18 if compacto else 21}px; color:{INK}">{h["primera"]}–{h["ultima"]}</p>'
                      f'<p style="font-size:{16 if compacto else 19}px; color:{MUTE}">{hm(h["minB1B2"])} entre balanzas</p></div>')
    def grupo(k, v):
        nom, bg, col, _ = PLANTA_HUELLA[k]
        chips = ''.join(pasada(h).replace(f'border:2px solid {BLU}', f'border:2px solid {col}').replace(f'color:{BLU}">', f'color:{col}">') for h in v)
        return (f'<div style="flex:{len(v)}; display:flex; flex-direction:column; gap:10px; background:{bg}; border-radius:20px; padding:14px 12px 12px">'
                f'<p style="font-size:24px; font-weight:700; letter-spacing:2px; color:{col}">{nom} · PASADAS SIN PESAR</p><div style="display:flex; gap:8px">{chips}</div></div>')
    tl = f'<div style="display:flex; gap:12px">' + ''.join(grupo(k, v) for k, v in por.items() if v) + '</div>'
    fs = elegir_fotos([f for f in x['fotos'] if f['dia'] in {h['dia'] for h in hs}])
    fw = 400
    ph = ''.join(f'<div style="width:{fw}px; display:flex; flex-direction:column; gap:4px"><img src="{b64(os.path.join(R, "fotos-mismo-patron", f["foto"]), 720)}" alt="{pl} · {DEV.get(f["device"], f["device"])} {dm(f["dia"])}" '
                 f'style="width:{fw}px; height:{round(fw * .45)}px; object-fit:cover; border-radius:8px">'
                 f'<p style="font-size:19px; color:{MUTE}"><b style="color:{INK}">{dm(f["dia"])} {hora(f["at"])}</b> · {DEV.get(f["device"], f["device"])}</p></div>' for f in fs)
    section(f'<div style="display:flex; align-items:center; justify-content:space-between">{eyebrow("RIESGO MEDIO · BALANZA SIN PESAR")}{chip(f"{n} pasadas · {rango}")}</div>'
            f'<div style="display:flex; gap:32px; align-items:center">{plate}<div style="flex:1; display:flex; flex-direction:column; gap:8px">'
            f'<p style="font-size:22px; font-weight:600; letter-spacing:2px; color:{MUTE}">{VEHICULO[pl].upper()}</p>'
            f'<h2 style="font-family:{SERIF}; font-size:38px; font-weight:700; line-height:1.2; color:{INK}">{que}</h2></div></div>'
            f'<div style="display:flex; gap:16px; align-items:stretch">{cajas}</div>{tl}<div style="display:flex; gap:16px">{ph}</div>', gap=14, pad='88px 128px 150px')

# ── 5. Qué pedimos ──────────────────────────────────────────────────────────────────────────────────────────
items = [('Balanza y portería', 'Quién autoriza que un camión cruce las balanzas de Ricardone o del puerto sin ingreso en el sistema, y dónde queda anotado.'),
         ('Sectores que los contratan', 'A quién presta servicio cada uno (almacenes, obras, mantenimiento) y qué carga o descarga.'),
         ('Back office', 'Si corresponde, dar de alta a cada camión en Vehículos Permitidos, con los sectores y el horario autorizados. Así el sistema deja de marcarlos.'),
         ('Sin explicación', 'Los que nadie reconozca (AF831ID nunca pasó por la balanza) se revisan con portería en la próxima visita.')]
section(eyebrow('QUÉ PEDIMOS', VIO) + h2('Que cada pasada por la balanza quede registrada', 52)
        + ''.join(f'<div style="display:flex; gap:28px; align-items:baseline; background:#FFFFFF; border:2px solid #D3DAD6; border-left:8px solid {VIO}; border-radius:12px; padding:20px 28px">'
                  f'<p style="width:420px; font-size:28px; font-weight:700; color:{VIO}">{t}</p><p style="flex:1; font-size:28px; line-height:1.4">{v}</p></div>' for t, v in items), gap=22)

html = f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Balanza sin pesar</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Domine:wght@400..700&family=Public+Sans:wght@400;600;700&display=swap">
<style>
:root {{ --page:#E6E9E7; --ink:#1B2420; --mute:#4F5A55; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --page:#151A18; --ink:#E9EEEB; --mute:#A9B3AE; }} }}
:root[data-theme="dark"] {{ --page:#151A18; --ink:#E9EEEB; --mute:#A9B3AE; }}
* {{ box-sizing:border-box; margin:0; }}
body {{ background:var(--page); color:var(--ink); font-family:'Public Sans', Arial, sans-serif; padding:24px 16px 48px; }}
header {{ max-width:1280px; margin:0 auto 16px; display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }}
header p {{ color:var(--mute); font-size:14px; }}
.deck {{ max-width:1280px; margin:0 auto; display:flex; flex-direction:column; gap:20px; }}
.frame {{ width:100%; aspect-ratio:16/9; position:relative; overflow:hidden; border-radius:8px; box-shadow:0 2px 12px rgba(0,0,0,.18); }}
.frame > section {{ position:absolute; top:0; left:0; width:1920px; height:1080px; transform-origin:0 0; }}
@media print {{ body {{ padding:0; background:#fff; }} header {{ display:none; }} .deck {{ gap:0; max-width:none; }} .frame {{ border-radius:0; box-shadow:none; page-break-after:always; }} }}
</style></head><body>
<header><h1 style="font-size:20px">Balanza sin pesar · mismo patrón que CXV575</h1><p>{len(slides)} láminas · {PERIODO} · imprimir para PDF</p></header>
<div class="deck">{"".join(f'<div class="frame">{s}</div>' for s in slides)}</div>
<script>
function fit() {{ document.querySelectorAll('.frame').forEach(f => {{ f.firstElementChild.style.transform = 'scale(' + (f.clientWidth / 1920) + ')' }}) }}
addEventListener('resize', fit); new ResizeObserver(fit).observe(document.querySelector('.deck')); fit();
</script></body></html>'''
open(OUT, 'w', encoding='utf-8').write(html)
print('ok', OUT, len(slides), 'láminas', round(len(html) / 1e6, 1), 'MB')
