# Genera las imágenes del grafo de nodos del Nodo Sur para el deck (HTML con SVG, se rasteriza con Edge).
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
M = json.load(open(r'C:\Users\Usuario\Desktop\Dashboard_camiones\docs\propuesta-en-vivo\modelo-nodos-nodo-sur\datos\modelo_nodo_sur.json', encoding='utf-8'))
N = {n['id']: n for n in M['nodes']}
W, H = M['W'], M['H']
PAD_T, PAD_B = 70, 30

INK, MUTED, PAPER = '#13202E', '#8A97A5', '#FCFDFB'
AREA, AREA_FILL, AREA_INK = '#C27C0E', '#FBE9C8', '#8A5200'
HI = '#0F6FA8'


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;')


def circle(n, style):
    x, y, r = n['x'], n['y'], (max(n['r'], 21) if n['area'] else n['r'])
    return f'<circle cx="{x}" cy="{y}" r="{r}" {style}/>'


def build(mode):
    """mode: 'full' (red completa, playas resaltadas) | 'r7' (recorrido R7 con minutos)"""
    r7 = next(c for c in M['circuits'] if c['id'] == 'R7')
    r7_edges = set(zip(r7['seq'], r7['seq'][1:]))
    out = []
    # conexiones
    for e in sorted(M['edges'], key=lambda e: e['n']):
        on = (e['from'], e['to']) in r7_edges
        if mode == 'r7':
            if on:
                continue
            out.append(f'<path d="{e["d"]}" fill="none" stroke="#C9D3DC" stroke-width="{e["lw"]}" stroke-linecap="round"/>')
        else:
            out.append(f'<path d="{e["d"]}" fill="none" stroke="{e["tone"]}" stroke-width="{e["lw"]}" stroke-linecap="round"/>')
    if mode == 'r7':
        for e in M['edges']:
            if (e['from'], e['to']) in r7_edges:
                out.append(f'<path d="{e["d"]}" fill="none" stroke="{HI}" stroke-width="7" stroke-linecap="round"/>')
    for e in M.get('optEdges', []):
        op = '0.35' if mode == 'r7' else '1'
        out.append(f'<path d="{e["d"]}" fill="none" stroke="{AREA}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round" opacity="{op}"/>')
    # nodos
    on_nodes = set(r7['seq'])
    for n in M['nodes']:
        dim = mode == 'r7' and n['id'] not in on_nodes and not n['area']
        op = ' opacity="0.35"' if dim else ''
        if n['area']:
            out.append(f'<g{op}>' + circle(n, f'fill="{AREA_FILL}" stroke="{AREA}" stroke-width="5"') + '</g>')
            out.append(f'<text x="{n["x"]}" y="{n["y"] + 6}" text-anchor="middle" class="cap"{op}>{n["capacity"]}</text>')
        elif n['hasCamera']:
            out.append(f'<g{op}>' + circle(n, f'fill="{PAPER}" stroke="{INK}" stroke-width="3.5"') + '</g>')
        else:
            out.append(f'<g{op}>' + circle(n, f'fill="{PAPER}" stroke="{MUTED}" stroke-width="3" stroke-dasharray="5 4"') + '</g>')
    # etiquetas
    for n in M['nodes']:
        dim = mode == 'r7' and n['id'] not in on_nodes and not n['area']
        cls = 'lab area' if n['area'] else 'lab'
        op = ' opacity="0.4"' if dim else ''
        out.append(f'<text x="{n["lab"]["x"]}" y="{n["lab"]["y"]}" text-anchor="middle" class="{cls}"{op}>{esc(n["label"])}</text>')
    # minutos de R7 (Comité de Logística 18/09, semana 10–16/09)
    if mode == 'r7':
        def tag(x, y, txt, big=False, color=HI):
            w = (17 if big else 11.5) * len(txt) + 26
            h = 44 if big else 32
            fs = 28 if big else 19
            return (f'<rect x="{x - w / 2}" y="{y - h / 2}" width="{w}" height="{h}" rx="{h / 2}" fill="{color}"/>'
                    f'<text x="{x}" y="{y + fs * 0.36}" text-anchor="middle" style="font:600 {fs}px Segoe UI,Arial;fill:#fff">{txt}</text>')
        p1, osl = N['ricardone:Playa 1'], N['san_lorenzo:Playa OSL']
        out.append(tag(p1['x'] - 105, p1['y'] - 32, '126 min', True, AREA))
        out.append(tag(osl['x'] - 150, osl['y'] - 34, '119 min', True, AREA))
        out.append(tag(360, 112, 'traslado 12', False, '#5B6776'))
        out.append(tag(1500, 262, 'descarga 42', False, '#5B6776'))
    titles = (f'<text x="16" y="-38" class="pt">RICARDONE</text>'
              f'<text x="{W - 16}" y="-38" text-anchor="end" class="pt">SAN LORENZO</text>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H + PAD_T + PAD_B}" '
           f'viewBox="0 {-PAD_T} {W} {H + PAD_T + PAD_B}">'
           '<style>.lab{font:24px "Segoe UI",Arial;fill:#13202E;paint-order:stroke;stroke:#FCFDFB;stroke-width:7px;stroke-linejoin:round}'
           '.lab.area{font-weight:600;fill:#8A5200}'
           '.cap{font:700 17px "Segoe UI",Arial;fill:#8A5200}'
           '.pt{font:600 24px "Segoe UI",Arial;letter-spacing:2px;fill:#13202E}</style>'
           + titles + ''.join(out) + '</svg>')
    html = ('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#FCFDFB">' + svg + '</body>')
    path = os.path.join(HERE, f'graph_{mode}.html')
    open(path, 'w', encoding='utf-8').write(html)
    return path, W, H + PAD_T + PAD_B


if __name__ == '__main__':
    for m in ('full', 'r7'):
        print(*build(m))
