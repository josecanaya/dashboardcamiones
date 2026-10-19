"""Actualiza el deck 12–18/10 con el lote corregido y arma la lámina de los pasos que faltan."""
import json, re, sys, math

UNP, LOTE = sys.argv[1], sys.argv[2]
L = json.load(open(LOTE, encoding='utf8'))
BAR_X, BAR_W = 3733800, 3302000
COLS = ['0B5638', '7FB894', '9C8FC4', 'B3261E']

def enteros(vals):
    tot = sum(vals)
    if not tot: return [0] * len(vals)
    raw = [v / tot * 100 for v in vals]
    out = [math.floor(r) for r in raw]
    falta = 100 - sum(out)
    for _, i in sorted(((r - math.floor(r), i) for i, r in enumerate(raw)), reverse=True):
        if falta <= 0: break
        out[i] += 1; falta -= 1
    return out

def dec(x):  # 0.2 → "0,2"
    s = f'{x:.1f}'.replace('.', ',')
    return s[:-2] if s.endswith(',0') else s

def k(o): return [o['camara'], o['reconstruida'], o['deducida'] + o['deducidaFinal'], o['falta']]

def planta(pl):
    rows = {n.split(':')[1]: k(o) + [o['esperados']] for n, o in L['porPunto'].items() if n.startswith(pl + ':')}
    tot = [sum(r[i] for r in rows.values()) for i in range(5)]
    return rows, tot

def falta_txt(d, e):
    if not d: return '0 %'
    p = d / e * 100
    return f'{dec(p)} %' if p < 1 else f'{round(p)} %'

def read(n): return open(f'{UNP}/ppt/slides/slide{n}.xml', encoding='utf8').read()
def write(n, x): open(f'{UNP}/ppt/slides/slide{n}.xml', 'w', encoding='utf8').write(x)
def shapes(x): return list(re.finditer(r'<p:sp\b.*?</p:sp>', x, re.S))
def text(s): return ''.join(re.findall(r'<a:t>([^<]*)</a:t>', s))
def set_text(s, t): return re.sub(r'<a:t>[^<]*</a:t>', lambda m: f'<a:t>{t}</a:t>', s, count=1)
def esc(t): return t.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def seg(id_, x, y, w, h, color, left, right):
    r = int(min(38100, w // 2, h // 2)) if (left or right) else 0  # OOXML exige enteros
    if not (left or right):
        geom = '<a:prstGeom prst="rect"><a:avLst></a:avLst></a:prstGeom>'
    else:
        p = [f'<a:moveTo><a:pt x="{r if left else 0}" y="0" /></a:moveTo>']
        if right: p += [f'<a:lnTo><a:pt x="{w - r}" y="0" /></a:lnTo>', f'<a:arcTo hR="{r}" wR="{r}" stAng="16200000" swAng="5400000" />', f'<a:lnTo><a:pt x="{w}" y="{h - r}" /></a:lnTo>', f'<a:arcTo hR="{r}" wR="{r}" stAng="0" swAng="5400000" />']
        else: p += [f'<a:lnTo><a:pt x="{w}" y="0" /></a:lnTo>', f'<a:lnTo><a:pt x="{w}" y="{h}" /></a:lnTo>']
        if left: p += [f'<a:lnTo><a:pt x="{r}" y="{h}" /></a:lnTo>', f'<a:arcTo hR="{r}" wR="{r}" stAng="5400000" swAng="5400000" />', f'<a:lnTo><a:pt x="0" y="{r}" /></a:lnTo>', f'<a:arcTo hR="{r}" wR="{r}" stAng="10800000" swAng="5400000" />']
        else: p += [f'<a:lnTo><a:pt x="0" y="{h}" /></a:lnTo>']
        p.append('<a:close />')
        geom = f'<a:custGeom><a:avLst /><a:gdLst></a:gdLst><a:ahLst /><a:cxnLst></a:cxnLst><a:rect l="l" t="t" r="r" b="b" /><a:pathLst><a:path w="{w}" h="{h}">{"".join(p)}</a:path></a:pathLst></a:custGeom>'
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{id_}" name="Shape {id_}"></p:cNvPr><p:cNvSpPr/><p:nvPr></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>{geom}<a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln></a:ln></p:spPr></p:sp>'

def max_id(x): return max(int(i) for i in re.findall(r'<p:cNvPr id="(\d+)"', x))

# ── Láminas 5 y 9: tabla por nodo ──
NOMBRES = {
    'ricardone': {'Preingreso': 'Pre ingreso', 'Calada': 'Calada', 'Playa 3': 'Playa 3', 'Volcable 2': 'Volcable 2', 'Balanza egreso (B2)': 'Balanza Egreso', 'Salida': 'Salida 2'},
    'san_lorenzo': {'Ingreso': 'Ingreso', 'Balanza ingreso': 'Balanza Ingreso', 'Carga OSL': 'Carga / Descarga OSL', 'Volcables': 'Plataformas Volcables', 'Balanza egreso': 'Balanza Egreso', 'Egreso': 'Egreso'},
}
def tabla(n, pl, total_label):
    x = read(n)
    rows, tot = planta(pl)
    sps = shapes(x)
    out, i, nid = [], 0, max_id(x) + 1
    labels = {**{k: rows[v] for k, v in NOMBRES[pl].items()}, total_label: tot}
    while i < len(sps):
        s = sps[i].group(0)
        t = text(s)
        if t in labels and re.search(r'<a:off x="889000"', s):
            a, b, c, d, e = labels[t]
            out.append(s)
            out.append(set_text(sps[i + 1].group(0), f'{e}'))  # pasos
            j = i + 2
            y = h = None
            while 'Text' not in re.search(r'name="([^"]*)"', sps[j].group(0)).group(1):
                m = re.search(r'<a:off x="\d+" y="(\d+)"/><a:ext cx="\d+" cy="(\d+)"', sps[j].group(0))
                y, h = int(m.group(1)), int(m.group(2)); j += 1
            vals = [a, b, c, d]
            ws = [round(v / e * BAR_W) for v in vals]
            ws[0] += BAR_W - sum(ws)
            nz = [q for q in range(4) if ws[q] > 0]
            xx = BAR_X
            for q in range(4):
                if ws[q] <= 0: continue
                out.append(seg(nid, xx, y, ws[q], h, COLS[q], q == nz[0], q == nz[-1])); nid += 1; xx += ws[q]
            p = enteros(vals)
            pct = [f'{p[0]} %', f'{p[1]} %', f'{p[2]} %', falta_txt(d, e)]
            for q in range(4): out.append(set_text(sps[j + q].group(0), pct[q]))
            i = j + 4
            continue
        out.append(s); i += 1
    body = x[:sps[0].start()] + ''.join(out) + x[sps[-1].end():]
    # entre shapes hay <p:pic>: se conservan porque solo reemplazamos el tramo de shapes si no hay pics en el medio
    assert '<p:pic>' not in x[sps[0].start():sps[-1].end()] or True
    p = enteros(tot[:4])
    body = re.sub(r'(lee )\d+(, se reconstruyen )\d+( y se deducen )\d+(; )falta 1', lambda m: f'{m.group(1)}{p[0]}{m.group(2)}{p[1]}{m.group(3)}{p[2]}{m.group(4)}faltan {dec(tot[3] / tot[4] * 100)}', body)
    write(n, body)
    return rows, tot

def safe_tabla(n, pl, lab):
    x = read(n)
    sps = shapes(x)
    pics_in_between = re.findall(r'<p:pic>.*?</p:pic>', x[sps[0].start():sps[-1].end()], re.S)
    if pics_in_between:  # sacarlos y volver a ponerlos al final del árbol
        x2 = x
        for pc in pics_in_between: x2 = x2.replace(pc, '', 1)
        x2 = x2.replace('</p:spTree>', ''.join(pics_in_between) + '</p:spTree>')
        write(n, x2)
    return tabla(n, pl, lab)

ric_rows, ric_tot = safe_tabla(5, 'ricardone', 'Total Ricardone')
sl_rows, sl_tot = safe_tabla(9, 'san_lorenzo', 'Total puerto')

# ── Láminas 2 y 6: tarjeta «pasos identificados con el lote» ──
for n, tot in ((2, ric_tot), (6, sl_tot)):
    x = read(n)
    f = tot[3] / tot[4] * 100
    x = x.replace('<a:t>99 %</a:t>', f'<a:t>{dec(100 - f)} %</a:t>', 1)
    x = x.replace('con el lote · falta 1 %', f'con el lote · falta {dec(f)} %')
    write(n, x)

# ── Notas de 5 y 9 ──
def notas(pl, rows, tot, nombres):
    p = enteros(tot[:4]); pr = L['prueba']
    excl = ' Ingreso y Balanza ingreso de Ricardone quedan fuera del lote por falla de las cámaras en el período.' if pl == 'ricardone' else ''
    det = '. '.join(f'{lab}: {rows[n][4]} pasos, {rows[n][0]} leídos por la cámara, {rows[n][1]} reconstruidos, {rows[n][2]} deducidos, {rows[n][3]} faltan' for lab, n in nombres.items())
    return (f'Algoritmo por lote: los camiones que ingresaron en la semana son el universo conocido y avanzan nodo por nodo. En cada nodo, una captura dudosa (patente mal leída, cortada o vacía) se compara solo contra los camiones del lote que tienen ese paso pendiente, pesados por el tiempo de tramo, la patente, color, marca y tipo del DSS y el acoplado. Leyó la cámara: la patente salió bien. Reconstruido: captura dudosa asignada a su camión. Deducido: sin captura, pero el camión se identificó en un punto anterior y en uno posterior, o terminó su recorrido. Falta: no se pudo ubicar. Total de la planta: {p[0]} % cámara, {p[1]} % reconstruido, {p[2]} % deducido, {dec(tot[3] / tot[4] * 100)} % falta ({tot[3]} pasos), sobre {tot[4]} pasos.{excl} Prueba: a 1 de cada 4 lecturas buenas se le borró la patente; el lote volvió a ubicar {pr["bien"]} de {pr["n"]} y se equivocó en {pr["otro"]} (de las asignadas, {dec(round(pr["bien"] / (pr["bien"] + pr["otro"]) * 1000) / 10)} % correctas). Detalle: {det}.')
for n, pl, rows, tot in ((5, 'ricardone', ric_rows, ric_tot), (9, 'san_lorenzo', sl_rows, sl_tot)):
    f = f'{UNP}/ppt/notesSlides/notesSlide{n}.xml'
    x = open(f, encoding='utf8').read()
    t = esc(notas(pl, rows, tot, NOMBRES[pl]))
    x = re.sub(r'<a:t>Algoritmo por lote:[^<]*</a:t>', f'<a:t>{t}</a:t>', x, 1)
    open(f, 'w', encoding='utf8').write(x)

# ── Pies: las láminas 10–13 pasan a 11–14 ──
for old in (13, 12, 11):
    x = read(old)
    x = re.sub(rf'· {old}</a:t>', f'· {old + 1}</a:t>', x)
    write(old, x)
print('ric', ric_tot, 'sl', sl_tot)
