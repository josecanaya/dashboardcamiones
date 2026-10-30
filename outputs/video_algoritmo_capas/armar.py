"""Animación: media hora de Ricardone (29/10, 15:20–15:50) captura por captura, qué capa la identifica."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
W, H = 1280, 720
F = 'C:/Windows/Fonts/'
def font(name, size): return ImageFont.truetype(F + name, size)
f_title, f_h, f_b, f_s, f_xs = font('arialbd.ttf', 40), font('arialbd.ttf', 26), font('arial.ttf', 22), font('arial.ttf', 18), font('arial.ttf', 15)
f_mark = font('ARIALUNI.TTF', 28)
f_plate = font('consolab.ttf' if os.path.exists(F + 'consolab.ttf') else 'consola.ttf', 34)

BG, INK, MUTED, LINE = (247, 248, 246), (28, 33, 30), (110, 118, 112), (215, 220, 214)
BRAND, OK, OKBG, BAD, BADBG, OFF = (20, 83, 45), (34, 139, 70), (226, 244, 232), (198, 40, 40), (252, 232, 232), (236, 238, 235)

casos = json.load(open(os.path.join(BASE, 'casos.json'), encoding='utf8'))
casos.sort(key=lambda c: c['hora'])
resumen = json.load(open(os.path.join(BASE, 'resumen.json'), encoding='utf8'))

# Escalera: el orden en que cada captura atraviesa las capas.
STEPS = [
    ('Lectura', 'la cámara leyó bien y sigue el recorrido de su camión'),
    ('Capa 2 · ¿Quién es?', 'carta de porte / Vehículos Permitidos'),
    ('Capa 3 · Lote de cámaras', 'doble lectura, cuenta, par frontal-trasera'),
    ('Capa 3 · Balanza (SGC)', 'camión y acoplado que pesó la balanza'),
    ('Capa 3 · Base histórica', 'lo que operaciones ya corrigió'),
    ('Capa 3 · IA por imagen', 'mira la foto (apagada en este momento)'),
    ('Operaciones / Alerta', 'si nadie la identifica, decide una persona'),
]

CASOS = {
    'AYM824': dict(step=0, side='frontal', titulo='La cámara leyó bien',
                   texto='AYM824 es una patente válida y es el paso que se esperaba de ese camión: no hay nada que corregir. Así pasan 2 de cada 3 capturas.'),
    'TAC436': dict(step=1, side='frontal', titulo='Carta de porte',
                   texto='TAC436 figura como chasis en la carta de porte 10235839952 (girasol, sale): es un camión conocido y la cámara leyó bien.'),
    'AE260HD': dict(step=1, side='frontal', titulo='Vehículos Permitidos',
                    texto='AE260HD no tiene carta, pero figura en Vehículos Permitidos (varios): vehículo conocido de la planta.'),
    'SZG937': dict(step=3, side='trasera', titulo='Trasera → acoplado → chasis',
                   texto='La cámara trasera ve el acoplado. SZG937 es el acoplado de SLT958 según la balanza: la captura se suma al viaje del chasis SLT958.'),
    'AU327DS': dict(step=1, side='frontal', titulo='Carta de porte, por parecido',
                    texto='AU327DS no está en ninguna carta. La única patente parecida (86 %) entre los chasis de las cartas vigentes es AD327DS (soja, entra).'),
    'DK307': dict(step=2, side='frontal', titulo='Lote: doble lectura',
                  texto='La misma cámara de Calada leyó DKW107 seis segundos antes: DK307 es una lectura cortada del mismo camión.'),
    'AHC7ID': dict(step=2, side='frontal', titulo='Lote: la cuenta',
                   texto='Lectura ilegible. De los camiones con Calada pendiente, la cuenta da 89 % a AH677ID (carta de porte, soja).'),
    'DRF12': dict(step=6, side='frontal', titulo='Operaciones la descartó',
                  texto='Ninguna capa la identificó: es una pala cargadora, no un camión. Operaciones la descartó y queda en la base de no camiones.', alert=False),
    'UER485': dict(step=6, side='frontal', titulo='Alerta: sin registro',
                   texto='Leída bien, pero UER485 no está en una carta ni en Vehículos Permitidos. No es una falla de lectura: queda en «sin registro» para revisar.', alert=True),
}


def hhmm(s): return s[:5]

def fit(img, w, h):
    r = min(w / img.width, h / img.height)
    return img.resize((int(img.width * r), int(img.height * r)), Image.LANCZOS)

def wrap(d, text, fnt, width):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=fnt) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def header(d, sub):
    d.rectangle([0, 0, W, 64], fill=BRAND)
    d.text((28, 16), 'Reconocedor de patentes · cómo decide cada captura', font=f_h, fill=(255, 255, 255))
    d.text((W - 28 - d.textlength(sub, font=f_s), 22), sub, font=f_s, fill=(200, 230, 210))

frames, durs = [], []
def add(img, ms): frames.append(img); durs.append(ms)

# ---------- Portada ----------
def portada():
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    header(d, 'Ricardone · 29/10/2026')
    d.text((60, 110), 'Media hora de planta, captura por captura', font=f_title, fill=INK)
    d.text((60, 165), f'15:20 a 15:50 · {resumen["total"]} capturas de cámara. Cada una baja por las capas hasta que una dice qué camión es.', font=f_b, fill=MUTED)
    y = 230
    for i, (t, s) in enumerate(STEPS):
        d.rounded_rectangle([60, y, 760, y + 54], 10, fill=(255, 255, 255), outline=LINE)
        d.ellipse([76, y + 14, 102, y + 40], fill=BRAND); d.text((84 if i < 9 else 80, y + 15), str(i + 1), font=f_s, fill=(255, 255, 255))
        d.text((118, y + 7), t, font=f_s, fill=INK); d.text((118, y + 30), s, font=f_xs, fill=MUTED)
        y += 62
    d.text((800, 250), 'La primera capa que la', font=f_h, fill=INK)
    d.text((800, 284), 'identifica, decide.', font=f_h, fill=INK)
    for k, line in enumerate(wrap(d, 'Las de abajo solo trabajan si las de arriba no pudieron. Una cámara frontal se compara con el chasis; una trasera, con el acoplado.', f_b, 420)):
        d.text((800, 340 + 30 * k), line, font=f_b, fill=MUTED)
    return im
add(portada(), 4500)

# ---------- Casos ----------
def caso(c, n, upto, final):
    meta = CASOS[c['readPlate']]
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    header(d, f'Caso {n} de {len(casos)}')
    foto = fit(Image.open(os.path.join(BASE, 'fotos', f'{c["k"]}.jpg')).convert('RGB'), 700, 420)
    im.paste(foto, (28, 84))
    fy = 84 + foto.height + 14
    d.text((28, fy), f'{hhmm(c["hora"])} · {c["nodeLabel"]} · {c["deviceCode"]} (cámara {meta["side"]})', font=f_s, fill=MUTED)
    # lectura → identificada
    py = fy + 34
    d.text((28, py + 4), 'Leyó', font=f_s, fill=MUTED)
    d.rounded_rectangle([86, py - 4, 86 + 24 + d.textlength(c['readPlate'], font=f_plate), py + 40], 8, fill=(255, 255, 255), outline=LINE)
    d.text((98, py), c['readPlate'], font=f_plate, fill=INK)
    x = 86 + 40 + d.textlength(c['readPlate'], font=f_plate)
    if final:
        alert = meta.get('alert')
        es = c.get('identifiedPlate') if meta['step'] < 6 else None
        lab = 'Es' if es else ('Alerta' if alert else 'Descartada')
        col = OK if es else (BAD if alert else MUTED)
        d.text((x, py + 4), '→', font=f_h, fill=MUTED); x += 40
        d.text((x, py + 4), lab, font=f_s, fill=col); x += d.textlength(lab, font=f_s) + 12
        if es:
            d.rounded_rectangle([x, py - 4, x + 24 + d.textlength(es, font=f_plate), py + 40], 8, fill=OKBG, outline=OK)
            d.text((x + 12, py), es, font=f_plate, fill=OK)
    # escalera
    sx, sy = 752, 84
    for i, (t, s) in enumerate(STEPS):
        y = sy + i * 58
        if i < upto:  # ya pasó: no decidió
            fill, out, tc, mark = OFF, LINE, MUTED, '–'
        elif i == upto and final:
            alert = meta.get('alert')
            fill, out, tc = (BADBG, BAD, BAD) if (i == 6 and alert) else (OKBG, OK, OK) if i < 6 else (OFF, MUTED, INK)
            mark = '!' if (i == 6 and alert) else '✓'
        elif i == upto:
            fill, out, tc, mark = (255, 255, 255), BRAND, INK, '…'
        else:
            fill, out, tc, mark = (255, 255, 255), LINE, (175, 180, 176), ''
        d.rounded_rectangle([sx, y, W - 28, y + 50], 9, fill=fill, outline=out, width=2 if i == upto else 1)
        d.text((sx + 16, y + 6), t, font=f_s, fill=tc)
        d.text((sx + 16, y + 28), s if i != upto or not final else meta['titulo'], font=f_xs, fill=tc if i == upto and final else (MUTED if i <= upto else (190, 194, 190)))
        if mark: d.text((W - 62, y + 9), mark, font=f_mark, fill=tc)
    if final:
        ty = sy + 7 * 58 + 6
        for k, line in enumerate(wrap(d, meta['texto'], f_s, W - 28 - sx)):
            d.text((sx, ty + 24 * k), line, font=f_s, fill=INK)
    return im

for n, c in enumerate(casos, 1):
    step = CASOS[c['readPlate']]['step']
    for s in range(step + 1):
        add(caso(c, n, s, False), 900 if s == 0 else 450)
    add(caso(c, n, step, True), 5200)

# ---------- Resumen ----------
def cierre():
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    header(d, 'Ricardone · 29/10 · 15:20–15:50')
    d.text((60, 100), f'Las {resumen["total"]} capturas de esa media hora', font=f_title, fill=INK)
    rows = [('Lectura buena', 'lectura', OK), ('Capa 2 · carta / Permitidos', 'capa2', OK), ('Capa 3 · lote de cámaras', 'lote', OK),
            ('Capa 3 · balanza', 'balanza', OK), ('Capa 3 · base histórica', 'aprendizaje', OK), ('Capa 3 · IA por imagen', 'ia', OK),
            ('Operaciones', 'operador', MUTED), ('Alerta (sin registro)', 'alerta', BAD)]
    tot = resumen['total']; y = 180; maxw = 640
    for label, key, col in rows:
        n = resumen['c'].get(key, 0)
        d.text((60, y + 6), label, font=f_b, fill=INK)
        d.rounded_rectangle([420, y, 420 + maxw, y + 38], 6, fill=OFF)
        if n: d.rounded_rectangle([420, y, 420 + max(8, int(maxw * n / tot)), y + 38], 6, fill=col)
        d.text((420 + maxw + 18, y + 6), f'{n}', font=f_h, fill=INK)
        y += 52
    ok = tot - resumen['c'].get('alerta', 0) - resumen['c'].get('operador', 0)
    d.text((60, y + 24), f'{ok} de {tot} identificadas solas por alguna capa · {resumen["c"].get("alerta", 0)} capturas en alerta: 2 camiones leídos bien pero sin carta ni Permitidos.', font=f_b, fill=MUTED)
    return im
add(cierre(), 7000)

frames[0].save(OUT + '.gif', save_all=True, append_images=frames[1:], duration=durs, loop=0, optimize=True)
frames[0].save(OUT + '.webp', save_all=True, append_images=frames[1:], duration=durs, loop=0, quality=82, method=4)
print(len(frames), 'cuadros', sum(durs) / 1000, 's')
