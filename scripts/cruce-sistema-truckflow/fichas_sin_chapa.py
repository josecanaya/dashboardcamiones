# Fichas A4 de camiones SIN CHAPA DELANTERA (sin nada, papel o chapa suelta en el parabrisas), con el mismo
# formato que las fichas de vehículos fuera del sistema (scripts/estado-planta/gen_vehiculos_sin_sistema.py fichas).
# Arriba: foto + carta (patente del Sistema, cómo lleva la patente, marca, color, ingresos, permanencia, cómo la
# leen las cámaras); una tira con las fotos del recorrido; abajo, una fila por visita con su recorrido por cámaras.
# Uso: python scripts/cruce-sistema-truckflow/fichas_sin_chapa.py
#   (antes: node scripts/cruce-sistema-truckflow/fichas-sin-chapa-datos.mjs)
# Salida: reportes/cruce-sistema-truckflow/fichas-sin-chapa/fichas.html + img/*.jpg
import json, os, html, collections
from datetime import datetime
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'reportes', 'cruce-sistema-truckflow')
DIR = os.path.join(OUT, 'fichas-sin-chapa')
IMG = os.path.join(DIR, 'img'); os.makedirs(IMG, exist_ok=True)
D = json.load(open(os.path.join(DIR, 'datos.json'), encoding='utf-8'))
INK = '#1B2420'; MUTE = '#4F5A55'; GDK = '#0B5638'; VIO = '#2E1B4E'; RED = '#B83A26'
e = html.escape

def jpg(src, name, w, h, q=78):
    if not src or not os.path.exists(src): return ''
    dst = os.path.join(IMG, name)
    if not os.path.exists(dst):
        im = Image.open(src).convert('RGB'); im.thumbnail((w, h)); im.save(dst, 'JPEG', quality=q, optimize=True)
    return f'img/{name}'

LOGO_N = jpg(os.path.join(ROOT, 'public', 'branding', 'nueva-vicentin-argentina.jfif'), 'nva.jpg', 200, 110, 88)
LOGO_B = jpg(os.path.join(ROOT, 'public', 'branding', 'LOGOS-BIMTRAZER_LOGO-VERTICAL chico.jpg'), 'bimtrazer.jpg', 200, 140, 88)
HEAD = f'<header><p class="kick">FICHA DE CAMIÓN · SIN CHAPA DELANTERA</p><div class="logos"><img src="{LOGO_N}" alt="NVA"><img src="{LOGO_B}" alt="Bimtrazer"></div></header>'
FOOT = lambda izq, der: f'<footer><span>{izq}</span><span>{der}</span></footer>'
PLANTA = {'TERMINAL_EMBARQUE': ('Puerto', 'sl'), 'RICARDONE': ('Ricardone', 'ric')}
CORTO = {'Ingreso Ricardone': 'Ingreso Ric', 'Preingreso': 'Preingreso', 'Calada Ricardone': 'Calada', 'Balanza ingreso Ricardone': 'Bal. ing. Ric',
         'Playa 3': 'Playa 3', 'Celda 16': 'Celda 16', 'Silo Keppler': 'Silo Keppler', 'Volcables Ricardone': 'Volcable Ric', 'Balanza egreso Ricardone': 'Bal. egr. Ric',
         'Egreso Ricardone': 'Egreso Ric', 'Ingreso puerto': 'Ingreso SL', 'Balanza ingreso puerto': 'Bal. ing. SL', 'Volcables puerto': 'Volcable SL',
         'Balanza egreso puerto': 'Bal. egr. SL', 'Salida puerto': 'Salida SL'}
OP = ('Calada', 'Volcable', 'Celda 16', 'Silo', 'Playa')
GRUPOS = ['Sin chapa', 'Papel en el parabrisas']
TITULO = {'Sin chapa': 'Camiones sin chapa patente', 'Papel en el parabrisas': 'Tienen un papel en el parabrisas con el número de patente'}
MESN = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
fecha = lambda s: f'{s[8:10]}/{s[5:7]}/{s[:4]}'
def mins(a, b):
    if not a or not b: return None
    return int((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() // 60)
def hm(m):
    if m is None: return '—'
    return f'{m} min' if m < 60 else f'{m // 60} h {m % 60:02d} min'
def recorrido(v):
    if not v['dss']: return '<span class="t">sin fotos del DSS para esta fecha</span>'
    if not v['pasos']: return '<span class="t">ninguna pasada atribuible: sin chapa, las cámaras no lo identifican</span>'
    out = []
    for p in v['pasos']:
        lab = CORTO.get(p['punto'], p['punto'])
        lab = f'<u>{e(lab)}</u>' if lab.startswith(OP) else e(lab)
        cls = '' if p['estado'] == 'confirmado' else ' class="au"'
        out.append(f'<span{cls}>{lab} <span class="t">{p["hora"][11:16]}</span></span>')
    return ' <span class="ar">→</span> '.join(out)

fichas = []
for c in D:
    p = c['patente']; vis = c['visitas']
    foto = jpg(os.path.join(OUT, c['foto']), f'{p}.jpg', 1000, 700)
    ric = [v for v in vis if v['planta'] == 'RICARDONE']; sl = [v for v in vis if v['planta'] == 'TERMINAL_EMBARQUE']
    perm = lambda xs: [mins(v['ingreso'], v['salida']) for v in xs if v['salida']]
    pr, ps = perm(ric), perm(sl)
    conf = [x for v in vis for x in v['pasos'] if x['estado'] == 'confirmado' and x['foto']]
    auto = [x for v in vis for x in v['pasos'] if x['estado'] == 'automatico' and x['foto']]
    # Tira de fotos: hasta 6 pasadas confirmadas de puntos distintos (si faltan, automáticas).
    tira, vistos = [], set()
    for x in conf + auto:
        if x['punto'] in vistos or len(tira) == 6: continue
        vistos.add(x['punto']); tira.append(x)
    tira_html = ''.join(f'<figure class="mini"><img src="{jpg(x["foto"], f"{p}_{x["hora"][5:16].replace("-", "").replace(" ", "_").replace(":", "")}_{x["camara"]}.jpg", 420, 260, 70)}" alt="{e(x["punto"])}" loading="lazy">'
                        f'<figcaption>{e(CORTO.get(x["punto"], x["punto"]))} · {fecha(x["hora"])[:5]} {x["hora"][11:16]}{"" if x["estado"] == "confirmado" else " · auto"}</figcaption></figure>' for x in tira)
    lect = [l for l in c['lecturas'] if l != p]
    exacta = p in c['lecturas']
    dato = lambda k, val, sub='': f'<div class="d"><span class="k">{k}</span><span class="v">{val}</span>{f"<span class=s>{sub}</span>" if sub else ""}</div>'
    carta = (f'<section class="top"><figure>{"<img src=" + chr(34) + foto + chr(34) + " alt=" + chr(34) + "Foto " + p + chr(34) + ">" if foto else "<div class=nofoto>Sin foto</div>"}'
             f'<figcaption>Captura DSS · {e(os.path.basename(c["foto"]))}</figcaption></figure>'
             f'<div class="carta"><p class="grupo">{e(c["grupo"].upper())}</p><p class="pat">{p}</p>'
             f'<div class="det">Patente en el Sistema de camiones <b>SÍ</b> · leída por las cámaras de acceso <b class="no">NO</b></div>'
             + dato('Marca y modelo', e(' '.join(x for x in (c['marca'], c['modelo']) if x))) + dato('Color', e(c['color'])) + dato('Tipo', e(c['tipo']))
             + dato('Ingresos Ricardone', len(ric)) + dato('Ingresos Puerto', len(sl))
             + dato('Permanencia total', hm(sum(x for x in pr + ps if x is not None)) if pr or ps else '—', f'{len(pr) + len(ps)} de {len(vis)} visitas con salida')
             + dato('Lectura exacta de la patente', 'Sí, a veces' if exacta else 'Nunca', 'solo cámaras altas (calada, Celda 16)' if exacta else '')
             + (dato('Las cámaras leen', e(', '.join(f'«{l}»' for l in lect[:6]))) if lect else '')
             + f'<p class="nota">{e(c["nota"])}</p></div></section>')
    filas, cur = [], None
    porm = collections.Counter(v['ingreso'][:7] for v in vis)
    for v in vis:
        if v['ingreso'][:7] != cur:
            cur = v['ingreso'][:7]
            filas.append(f'<tr class="mes"><td colspan="5">{MESN[int(cur[5:7]) - 1]} {cur[:4]} <span>· {porm[cur]} visitas</span></td></tr>')
        pl, cls = PLANTA.get(v['planta'], (v['planta'], ''))
        sal = v['salida'][11:16] if v['salida'] else '—'
        filas.append(f'<tr><td>{fecha(v["ingreso"])}</td><td>{v["ingreso"][11:16]} → {sal}</td><td class="pl {cls}">{pl}</td><td>{e(v["producto"].title()[:22])}</td><td class="rc">{recorrido(v)}</td></tr>')
    tabla = f'<table><thead><tr><th>Fecha</th><th>Alta → salida</th><th>Destino</th><th>Producto</th><th>Recorrido por cámaras</th></tr></thead><tbody>{"".join(filas)}</tbody></table>'
    nconf = len([x for v in vis for x in v['pasos'] if x['estado'] == 'confirmado'])
    pag = (f'<div class="page">{HEAD}{carta}<div class="tira">{tira_html}</div>'
           f'<p class="sec">Secuencia de visitas · {len(vis)} visitas · {nconf} pasadas confirmadas por foto</p>{tabla}'
           f'<p class="ley">Horas = alta y salida en el Sistema de camiones; en el recorrido, hora de la cámara. En gris: pasada elegida por el algoritmo (lectura del logo o de parte de la patente) sin revisar a ojo. Subrayado: zona operativa.</p>'
           + FOOT(f'{p} · {e(c["grupo"])}', 'cámaras TruckFlow + DSS, julio a octubre 2026') + '</div>')
    # Galería: TODAS las pasadas confirmadas, por visita y en orden, 12 por hoja (3 × 4).
    gal = [(v, x) for v in vis for x in v['pasos'] if x['foto'] and x['estado'] == 'confirmado']
    for h in range(0, len(gal), 12):
        celdas = ''.join(
            f'<figure class="gf"><img src="{jpg(x["foto"], f"{p}_g_{x["hora"][5:19].replace("-", "").replace(" ", "_").replace(":", "")}_{x["camara"]}.jpg", 700, 420, 74)}" alt="{e(x["punto"])}" loading="lazy">'
            f'<figcaption><b>{e(CORTO.get(x["punto"], x["punto"]))}</b> · {fecha(x["hora"])} {x["hora"][11:19]}<br>{e(x["camara"])}{" · leyó «" + e(x["lectura"]) + "»" if x["lectura"] else " · sin lectura"}</figcaption></figure>'
            for v, x in gal[h:h + 12])
        pag += (f'<div class="page">{HEAD}<p class="sec">{p} · fotos del recorrido ({h + 1}–{min(h + 12, len(gal))} de {len(gal)})</p><div class="gal">{celdas}</div>'
                + FOOT(f'{p} · {e(c["grupo"])}', f'Fotos {h // 12 + 1} de {(len(gal) + 11) // 12}') + '</div>')
    fichas.append((GRUPOS.index(c['grupo']), c['grupo'], p, pag, len(vis)))
fichas.sort(key=lambda x: (x[0], -x[4]))
grupos = collections.OrderedDict()
for x in fichas: grupos.setdefault(x[1], []).append(x)
pages = []
for gi, (g, xs) in enumerate(grupos.items(), 1):
    chips = ''.join(f'<a class="chip" href="#f-{p}">{p}<span>{n}</span></a>' for _, _, p, _, n in xs)
    # Carátula: número, cantidad y título; nada más (pedido del usuario 19/10).
    pages.append(f'<div class="page cover" id="g-{gi}">{HEAD}<div class="cv"><p class="cvn">{gi:02d}</p>'
                 f'<p class="cvs"><b>{len(xs)}</b> camiones · <b>{sum(x[4] for x in xs)}</b> visitas</p><h1>{e(TITULO[g])}</h1>'
                 f'<div class="chips">{chips}</div></div>' + FOOT(f'Carátula · {e(g)}', f'{len(xs)} fichas') + '</div>')
    pages += [f'<div class="ficha" id="f-{p}">{pg}</div>' for _, _, p, pg, _ in xs]
nav = ''.join(f'<a href="#g-{i}">{e(g)}</a>' for i, g in enumerate(grupos, 1))
BAR = f'<div id="bar"><p><b>{len(fichas)}</b> fichas de camiones sin chapa delantera</p><nav>{nav}</nav></div>'
CSS = f'''
:root{{--paper:#FFFFFF;--desk:#D9DEDB;--ink:{INK};--mute:{MUTE};--line:#E1E6E3;--green:{GDK};--vio:{VIO};--red:{RED};--ric:#E3EFE8;--sl:#E9E4F2;color-scheme:light}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--desk);color:var(--ink);font-family:'Public Sans',Arial,sans-serif;padding-block:24px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
#wrap{{display:flex;flex-direction:column;align-items:center;gap:24px}}
.page{{width:210mm;height:297mm;background:var(--paper);padding:11mm 13mm 9mm;display:flex;flex-direction:column;gap:3mm;box-shadow:0 2px 10px rgba(0,0,0,.15);position:relative;overflow:hidden}}
header{{display:flex;justify-content:space-between;align-items:center;border-bottom:.6mm solid var(--green);padding-bottom:2mm}}
.kick{{font-size:8pt;font-weight:700;letter-spacing:.4mm;color:var(--vio)}}
.logos{{display:flex;gap:5mm;align-items:center}} .logos img{{height:8mm}}
.top{{height:92mm;display:grid;grid-template-columns:108mm 1fr;gap:5mm}}
figure{{display:flex;flex-direction:column;gap:1.2mm;min-width:0}}
.top figure img{{width:100%;height:86mm;object-fit:cover;border-radius:1.5mm;display:block}}
.nofoto{{height:86mm;background:#EEF1EF;display:flex;align-items:center;justify-content:center;color:var(--mute)}}
figcaption{{font-size:6.3pt;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.carta{{display:flex;flex-direction:column;gap:1mm;min-width:0}}
.grupo{{font-size:7.5pt;font-weight:700;letter-spacing:.5mm;color:var(--red)}}
.pat{{font-family:'Domine',Georgia,serif;font-size:27pt;font-weight:700;line-height:1;letter-spacing:.6mm;border:.5mm solid var(--ink);border-radius:1.5mm;padding:1.6mm 3mm;align-self:flex-start}}
.det{{font-size:8pt;font-weight:700;background:#FBE6E1;border-radius:1.2mm;padding:1.4mm 2.2mm;margin:.6mm 0}} .det b{{color:var(--green);font-size:10pt;margin:0 .8mm}} .det b.no{{color:var(--red)}}
.d{{display:grid;grid-template-columns:auto 1fr;column-gap:2mm;border-bottom:.2mm solid var(--line);padding:.6mm 0;align-items:baseline}}
.k{{font-size:7.6pt;color:var(--mute)}} .v{{font-size:9.4pt;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}} .s{{grid-column:1/3;font-size:6.3pt;color:var(--mute);text-align:right}}
.nota{{font-size:7.4pt;line-height:1.35;color:var(--ink);margin-top:.8mm}}
.tira{{display:grid;grid-template-columns:repeat(6,1fr);gap:2mm;min-height:24mm}}
.mini img{{width:100%;height:19mm;object-fit:cover;border-radius:1mm;display:block}}
.mini figcaption{{font-size:5.8pt}}
.sec{{font-size:9pt;font-weight:700;color:var(--green)}}
.gal{{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm 2.5mm}}
.gf img{{width:100%;height:35mm;object-fit:cover;border-radius:1mm;display:block}}
.gf figcaption{{white-space:normal;font-size:6.4pt;line-height:1.3;color:var(--mute)}} .gf b{{color:var(--ink)}}
table{{width:100%;border-collapse:collapse;font-size:7.2pt;table-layout:fixed}}
th{{text-align:left;font-size:6.6pt;color:var(--mute);border-bottom:.4mm solid var(--green);padding:.8mm 1.2mm}}
td{{padding:.6mm 1.2mm;min-height:5mm;border-bottom:.2mm solid var(--line);vertical-align:top;font-variant-numeric:tabular-nums}}
th:nth-child(1){{width:17mm}} th:nth-child(2){{width:20mm}} th:nth-child(3){{width:16mm}} th:nth-child(4){{width:24mm}}
td.rc{{line-height:1.5}}
tr.mes td{{padding-top:1.6mm;border-bottom:.3mm solid var(--green);font-size:7pt;font-weight:700;letter-spacing:.3mm;text-transform:uppercase;color:var(--green)}} tr.mes td span{{font-weight:400;text-transform:none;letter-spacing:0;color:var(--mute)}}
td.pl{{font-weight:700;font-size:6.8pt}} td.pl.ric{{background:var(--ric);color:var(--green)}} td.pl.sl{{background:var(--sl);color:var(--vio)}}
.t{{color:var(--mute);font-size:6.4pt}} .ar{{color:var(--green)}} .au{{color:#8A938F;font-style:italic}}
td u{{text-decoration-color:var(--red);text-decoration-thickness:.35mm;text-underline-offset:.5mm}}
.ley{{font-size:6.3pt;color:var(--mute);margin-top:auto;margin-bottom:5mm}}
footer{{position:absolute;left:13mm;right:13mm;bottom:5mm;display:flex;justify-content:space-between;font-size:6.5pt;color:var(--mute)}}
.ficha{{display:flex;flex-direction:column;gap:24px}}
.cover{{background:var(--green);color:#F1F6F2}} .cover header{{border-color:#9CC7AF}} .cover .kick{{color:#DCEBE2}} .cover footer{{color:#BFD9C9}}
.cover .logos{{background:#fff;border-radius:1.5mm;padding:1mm 2mm}}
.cv{{display:flex;flex-direction:column;gap:5mm;margin-top:38mm}}
.cvn{{font-family:'Domine',Georgia,serif;font-size:60pt;font-weight:700;line-height:1;color:#8FC2A5}}
.cover h1{{font-family:'Domine',Georgia,serif;font-size:36pt;line-height:1.1;text-wrap:balance}}
.cvs{{font-size:16pt;color:#DCEBE2}} .cvs b{{color:#fff}} .cvh{{font-size:8pt;color:#BFD9C9}}
.chips{{display:flex;flex-wrap:wrap;gap:1.6mm}}
.chip{{display:inline-flex;gap:1.5mm;align-items:baseline;background:#F1F6F2;color:var(--ink);text-decoration:none;font-weight:700;font-size:10pt;border-radius:1.2mm;padding:1mm 2.4mm}}
.chip span{{font-weight:400;color:var(--mute);font-size:7.5pt}}
#bar{{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;width:100%;max-width:210mm;margin:0 auto 16px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:10px 14px;display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;font-size:13px}}
#bar nav{{display:flex;flex-wrap:wrap;gap:4px 12px}} #bar nav a{{color:var(--green);font-weight:700;text-decoration:none}}
'''
JS = "const wrap=document.getElementById('wrap');function fit(){const w=document.body.clientWidth-32;const k=Math.min(1,w/794);wrap.style.zoom=k<1?k:''}addEventListener('resize',fit);fit();"
out = os.path.join(DIR, 'fichas.html')
open(out, 'w', encoding='utf-8').write('<title>Fichas camiones sin chapa</title><meta name="claude:viewport-fit-sides" content="cover">'
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Domine:wght@700&family=Public+Sans:wght@400;700&display=swap" rel="stylesheet">'
    f'<style>{CSS}</style>{BAR}<div id="wrap">{"".join(pages)}</div><script>{JS}</script>')
json.dump(sorted(f'img/{n}' for n in os.listdir(IMG)), open(os.path.join(DIR, 'img-files.json'), 'w'), indent=0)
print(len(fichas), 'fichas ->', out)
