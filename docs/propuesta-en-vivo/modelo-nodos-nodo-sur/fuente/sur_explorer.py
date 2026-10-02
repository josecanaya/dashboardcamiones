# -*- coding: utf-8 -*-
"""Explorador del Nodo Sur: plantilla anterior + estilos de hilos por circuito + script nuevo + datos de sur_model."""
import json, os, re, runpy

HERE = os.path.dirname(os.path.abspath(__file__))
S = runpy.run_path(os.path.join(HERE, 'sur_model.py'))
data = json.load(open(os.path.join(HERE, 'sur_data.json'), encoding='utf-8'))
N = S['N']
TRUNK = {'Ingreso', 'Pre ingreso', 'Calada', 'Balanza Ingreso', 'Balanza Egreso', 'Playa de egreso', 'Salida 1', 'Salida 2', 'Egreso'}
for c in data['circuits']:
    parts, seen, last = [], set(), None
    for nid in c['seq']:
        n = N[nid]
        if last and n['plant'] != last:
            parts.append('→ ' + ('San Lorenzo' if n['plant'] == 'san_lorenzo' else 'Ricardone'))
        last = n['plant']
        if n['name'].strip() in TRUNK or nid in seen:
            continue
        seen.add(nid)
        parts.append(n['label'])
    c['desc'] = ' · '.join(parts).replace(' · → ', ' → ')

t = open(os.path.join(HERE, 'explorer_template.html'), encoding='utf-8').read()
t = t[:t.index('<script>')]


def rep(a, b, s):
    assert a in s, a[:80]
    return s.replace(a, b)


# tokens: colores por tipo de movimiento (validados en claro y oscuro)
t = rep("--f-display:", "--rec: #1A8FD0; --des: #D9542B; --tin: #3A8F63; --tex: #7A5BB5; --area: #C27C0E; --area-ink: #8A5600;\n  --f-display:", t)
# estilos de la red
a, b = t.index('.edge { fill: none;'), t.index('.label {')
t = t[:a] + (""".cas { fill: none; stroke: var(--surface); }
.e { fill: none; stroke-linecap: round; transition: opacity .18s; }
.e.faint { opacity: .22; } .e.dim { opacity: .1; }
.ov.rec { stroke: var(--rec); } .ov.des { stroke: var(--des); } .ov.tin { stroke: var(--tin); } .ov.tex { stroke: var(--tex); }
.ov { fill: none; stroke-width: 6; stroke-linecap: round; pointer-events: none; }
.node { cursor: pointer; transition: opacity .18s; }
.node .core { fill: var(--surface); stroke: var(--ink); stroke-width: 3.5; }
.node.nocam .core { stroke: var(--muted); stroke-width: 3; stroke-dasharray: 5 4; }
.node.sel .core { stroke: var(--focus); stroke-width: 5; stroke-dasharray: none; }
.node.faint { opacity: .45; } .node.dim { opacity: .15; }
.node:focus { outline: none; } .node:focus-visible .core { stroke: var(--focus); stroke-width: 5; }
.node.area .core { fill: color-mix(in srgb, var(--area) 22%, var(--surface)); stroke: var(--area); stroke-width: 4.5; stroke-dasharray: none; }
.node.area.sel .core { stroke: var(--focus); }
.eopt { fill: none; stroke: var(--area); stroke-width: 2.5; stroke-dasharray: 6 5; stroke-linecap: round; }
.cap { font: 600 15px var(--f-body); fill: var(--area-ink); pointer-events: none; transition: opacity .18s; }
.cap.faint { opacity: .45; } .cap.dim { opacity: .15; }
.tag.area { background: color-mix(in srgb, var(--area) 20%, var(--surface)); color: var(--area-ink); }
.area-note { border-left: 3px solid var(--area); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --area: #E8A93A; --area-ink: #F3C77A; } }
:root[data-theme="dark"] { --area: #E8A93A; --area-ink: #F3C77A; }
""") + t[b:]
t = re.sub(r"\.ptitle\.ric \{[^\n]*\n", "", t)
t = rep(".ptitle { font: 600 24px var(--f-body); letter-spacing: 2px; }", ".ptitle { font: 600 24px var(--f-body); letter-spacing: 2px; fill: var(--ink); }", t)
t = rep(".bar i { display: block; height: 100%; border-radius: 3px; }", ".bar { display: flex; gap: 1px; } .bar i { display: block; height: 100%; }", t)
t = re.sub(r"\.bar i\.ric \{[^\n]*\n", "", t)
t = rep(".chips button:hover { background: var(--hi); color: var(--on-hi); }",
        ".chips button:hover { background: var(--hi); color: var(--on-hi); }\n.chips button { box-shadow: inset 3px 0 0 var(--c, transparent); }\n"
        ".chips .rec { --c: var(--rec); } .chips .des { --c: var(--des); } .chips .tin { --c: var(--tin); } .chips .tex { --c: var(--tex); }\n"
        ".swc { display: inline-block; width: 16px; height: 5px; border-radius: 3px; margin-right: 6px; vertical-align: 3px; }", t)
# textos
t = rep("<p class=\"eyebrow\">Truckflow · Matriz de circuitos · Nodo Sur</p>", "<p class=\"eyebrow\">Truckflow · Matriz de circuitos · Ricardone y San Lorenzo</p>", t)
t = rep("<h1>Modelo de nodos</h1>", "<h1>Modelo de nodos del Nodo Sur</h1>", t)
t = rep("Cada punto de la matriz es un nodo y cada par de pasos seguidos de un circuito es una conexión posible. Tocá un nodo para ver de dónde llegan y a dónde siguen los camiones, o elegí un circuito para ver su recorrido.",
        "Cada punto de la matriz es un nodo y cada circuito es una línea. Las líneas se superponen: cuantos más circuitos comparten una conexión, más oscura se ve. Tocá un nodo para ver de dónde llegan y a dónde siguen los camiones, o elegí un circuito para ver su recorrido, con el color de su tipo de movimiento.", t)
t = re.sub(r'aria-label="Red de nodos de la matriz de circuitos[^"]*"', 'aria-label="Red del Nodo Sur: una línea por circuito, coloreada por tipo de movimiento"', t)
a, b = t.index('      <div class="legend"'), t.index('      </div>\n\n      </div>')
t = t[:a] + """      <div class="legend" aria-label="Cómo leer la red">
        <span><svg width="150" height="12" viewBox="0 0 150 12" aria-hidden="true">""" + "".join(f'<path d="M{3 + i * 21} 6H{19 + i * 21}" stroke="{S["tone"](n)}" stroke-width="{S["lw"](n)}" stroke-linecap="round"/>' for i, n in enumerate([1, 2, 4, 8, 17, 30, S["NMAX"]])) + """</svg>1 circuito → 42 superpuestos</span>
        <span><svg width="44" height="20" viewBox="0 0 44 20" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke-width="3" style="fill:var(--surface); stroke:var(--ink)"/><circle cx="32" cy="10" r="7" stroke-width="2.5" stroke-dasharray="4 3" style="fill:var(--surface); stroke:var(--muted)"/></svg>con / sin cámara</span>
        <span><svg width="22" height="20" viewBox="0 0 22 20" aria-hidden="true"><circle cx="11" cy="10" r="7.5" stroke-width="3.5" style="fill:color-mix(in srgb, var(--area) 22%, var(--surface)); stroke:var(--area)"/></svg>playa: área de espera, con su capacidad en camiones</span>
        <span><svg width="36" height="12" viewBox="0 0 36 12" aria-hidden="true"><path d="M3 6H33" stroke-width="2.5" stroke-dasharray="6 5" style="stroke:var(--area)"/></svg>desvío (solo camión demorado)</span>
""" + t[b:]
t = rep("<li><b>Volcable 2 sin código.</b> La matriz no le asigna cámara; en el informe de instalación S9 cubre Volcable 1 y Volcable 2.</li>",
        "<li><b>Volcable 2 sin código en la matriz.</b> Tiene cámara (S9 cubre Volcable 1 y Volcable 2, según el informe de instalación); falta cargar el código en la matriz. Acá se muestra con S9.</li>", t)
t = re.sub(r'<p class="foot">.*?</p>', '<p class="foot">Fuente: Matriz de circuitos de Vicentin, Nodo Sur (Ricardone R1–R34, San Lorenzo SL1–SL15). '
           'La red se dibuja para leer el flujo de izquierda a derecha, con la vuelta a Calada abajo y los transiles entre plantas arriba.</p>', t, flags=re.S)
js = open(os.path.join(HERE, 'sur_explorer_script.js'), encoding='utf-8').read()
js = js.replace('/*__DATA__*/null', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
out = t + '<script>\n' + js + '</script>\n'
open(os.path.join(HERE, 'modelo-nodos-vicentin.html'), 'w', encoding='utf-8').write(out)
print('ok', len(out.encode()), 'bytes')
