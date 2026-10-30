import json, os, re, shutil, sys
S = sys.argv[1]; G = S + '/comite-23-28/deck/project'; O = S + '/deck-std/project'
os.makedirs(O + '/slides', exist_ok=True)
BL = {'2c1166d4fbf2fbec7430398abf6b0e3b': '3caa4c251260230c044ec112ee3a8b0e', '18aa8ca0d589832dda48c77f1ed28a0b': '76a01f0108b56b171ad4862121d4a8d6',
      '916ea0722fd539b2369ca6413631c60d': '187e91d70dcb24c0d3e96da3308b438d', '0e7d769a3aba86ad2cd768091719225b': 'db3c67ddbffd555ec7c30de310dd04cc',
      'd87935e062f6db2ad585a52b0b30e02f': '0664eac09363ed7bf6a79939ec9adb98', 'b2b7b4c6595ee63172090f5ac4fd588e': '63923d5ab465cccc0f70c08eab4550cd'}
d = json.load(open(G + '/deck.json', encoding='utf-8'))
order = [x for x in d['order'] if x != 'div-girasol']
order = order[:1] + ['permanencia', 'permanencia-mezcla'] + order[1:]
src = {x: G + f'/slides/{x}.html' for x in order}
src['permanencia'] = S + '/deck23/project/slides/tabla.html'; src['permanencia-mezcla'] = S + '/deck23/project/slides/ponderado.html'
rep = {
 'silos': [('Silos: transiles internos en Ricardone, sin envíos al puerto', 'Silos: el silo 8 cargó girasol para despacho, sin transiles'),
           (re.compile(r'Las cámaras de silos leyeron cargas[^<]*'), 'Las cargas del silo 8 son 92 despachos de girasol de la planilla (42 camiones, 1938 t), con 221 min de espera en Playa 3 hasta la carga. Ninguno siguió al puerto (sin transile R29) y el transile interno, que hizo 212 viajes del 16 al 20/10, no volvió.'),
           ('Pendiente: analizar los transiles internos de la semana (qué silos y con qué destino).', 'El pellet al puerto volvió el jueves 29, fuera del período: 5 transiles completos hasta las 11:44, con 153 min de ciclo.')],
 'cruces': [(re.compile(r'>0</p>((?:(?!</p>).)*?</p>)?(.{0,400}?)>0 recorridos por la volcable 2\.'), None)],
}
for i, x in enumerate(order, 1):
    s = open(src[x], encoding='utf-8').read()
    if x in ('permanencia', 'permanencia-mezcla'):
        s = re.sub(r'<section id="[^"]+"', f'<section id="{x}"', s, count=1)
    for a, b in BL.items(): s = s.replace(a, b)
    for pat, new in rep.get(x, []):
        if x == 'cruces':
            m = pat.search(s); assert m, 'cruces girasol'
            seg = m.group(0).replace('>0</p>', '>92</p>', 1).replace('>0 recorridos por la volcable 2.', '>despachos de girasol desde el silo 8; ninguna recepción por la volcable 2.')
            s = s[:m.start()] + seg + s[m.end():]
        elif isinstance(pat, str):
            assert pat in s, pat; s = s.replace(pat, new)
        else:
            assert pat.search(s), pat.pattern; s = pat.sub(new, s, count=1)
    s = re.sub(r'(Comité de Logística Nodo Sur · 23/10–28/10) · \d+</p>', rf'\1 · {i}</p>', s)
    open(O + f'/slides/{x}.html', 'w', encoding='utf-8').write(s)
d['order'] = order
d['title'] = 'Comité de Logística Nodo Sur · 23 – 28 oct'
d['createdOnFiles'] = {'v': 1, 'at': '2026-10-29T15:40:00Z'}
d['cover'] = 'portada'
d['sections'] = {k: v for k, v in d['sections'].items() if v['start'] in order}
d['sections']['s0'] = {'description': 'Permanencia en planta ponderada por viajes', 'start': 'permanencia'}
d['sections'] = {k: d['sections'][k] for k in sorted(d['sections'], key=lambda k: order.index(d['sections'][k]['start']))}
d.pop('lists', None); d['lists'] = 'css'
json.dump(d, open(O + '/deck.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(order); print(d['sections'])
