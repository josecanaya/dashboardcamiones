"""Láminas de tiempos por tramo y por día: pellet (con «sin espera en playas») y soja R7.

Uso: python scripts/estado-planta/tramos-por-dia.py <carpeta comité> <cobertura-vinculo.json>
Pellet: viajes = cartas (visor/datos-viajes.json, horarios ya corregidos); bordes de cada viaje con los registros de
balanza (visor/registros-balanza-cruce.json: ingreso y salida de Ricardone, ingreso y salida del puerto); Playa 3,
balanza de ingreso del puerto y volcable con las lecturas de cámara del vínculo. Cada día: tiempo en Ricardone,
interplanta y puerto = medias de todos los viajes; Ricardone y puerto se reparten entre sus tramos con la proporción
de los viajes que tienen todas las lecturas, así los tramos suman el ciclo del día. Día = día operativo (22 h) de la
salida de Ricardone. «Tiempo promedio teórico sin esperas»: Playa 3 y carga y Playa OSL con el cuartil más rápido (lo que logró uno de cada
cuatro camiones); resto, medias. En la lámina solo los días completos del operativo (50 viajes o más).
Soja R7: calculo/r7-camaras.json (tramosDia), tramos reescalados para sumar el puerta a puerta medio del día.
Escribe <carpeta>/tramos-por-dia/{pel-op-tramos,tramos-r7-dia}.html, calculo/pellet-tramos-dia.json y reemplaza
deck/project/slides/pel-op-tramos.html.
"""
import json, os, sys, base64, datetime as dt, collections

D = os.path.abspath(sys.argv[1]); COB = sys.argv[2]
OUT = os.path.join(D, 'tramos-por-dia'); os.makedirs(OUT, exist_ok=True)
P = lambda s: dt.datetime.fromisoformat(s[:19]) if s else None
mn = lambda a, b: (b - a).total_seconds() / 60
DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
dlab = lambda d: f'{DIAS[dt.date.fromisoformat(d).weekday()]} {int(d[8:10])}'
hm = lambda m: f'{int(m) // 60} h {int(m) % 60:02d} m'

# ---------------- pellet: nodos de cada viaje ----------------
V = json.load(open(os.path.join(D, 'visor', 'datos-viajes.json'), encoding='utf-8'))['viajes']
M = json.load(open(os.path.join(D, 'visor', 'registros-balanza-cruce.json'), encoding='utf-8'))
C = json.load(open(COB, encoding='utf-8'))
reads = collections.defaultdict(dict)
for x in C['camiones']:
    for l in x['lecturas']:
        t = dt.datetime.fromisoformat(l['at'].replace('Z', '')) - dt.timedelta(hours=3)
        for p in x['plates']: reads[p][(l['at'], l['camara'])] = (t, l['nodo'])
R = {p: sorted(v.values()) for p, v in reads.items()}
def first(p, node, a, b):
    return next((t for t, n in R.get(p, []) if n == node and a <= t <= b), None)

viajes = []
for v in V:
    ri, se = P(v['ri']), P(v['se']); m = M[v['ctg']]
    be, tin = P(m[1]), P(m[2])
    if not tin or not (be <= tin <= se): tin = None
    w0, w1 = ri - dt.timedelta(minutes=5), se + dt.timedelta(minutes=5)
    p3 = first(v['p'], 'ricardone:Playa 3', w0, be)
    x = dict(p=v['p'], n=v['n'], dia=(be + dt.timedelta(hours=2)).date().isoformat(), ciclo=mn(ri, se), ric=mn(ri, be),
             inter=mn(be, tin) if tin else None, puerto=mn(tin, se) if tin else None,
             ingreso=mn(ri, p3) if p3 and ri <= p3 else None, carga=mn(p3, be) if p3 and ri <= p3 else None)
    if tin:
        slb = first(v['p'], 'san_lorenzo:Balanza Ingreso', tin, se)
        vol = first(v['p'], 'san_lorenzo:Plataformas Volcables', slb or tin, se)
        if slb and vol: x.update(playaOsl=mn(tin, slb), descarga=mn(slb, vol), salida=mn(vol, se))
    viajes.append(x)

avg = lambda a: sum(a) / len(a)
def reparto(total, partes):   # enteros que suman round(total) (mayor resto)
    s = sum(partes) or 1; raw = [total * p / s for p in partes]; out = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - out[i], reverse=True)[:round(total) - sum(out)]: out[i] += 1
    return out
TP = ['ingreso', 'carga', 'interplanta', 'playaOsl', 'descarga', 'salida']
porDia = {}
for d in sorted({x['dia'] for x in viajes}):
    xs = [x for x in viajes if x['dia'] == d]
    ric, inter = avg([x['ric'] for x in xs]), avg([x['inter'] for x in xs if x['inter'] is not None])
    pu = avg([x['puerto'] for x in xs if x['puerto'] is not None])
    sub_r = [x for x in xs if x['ingreso'] is not None]; sub_p = [x for x in xs if x.get('playaOsl') is not None]
    seg = reparto(ric, [sum(x['ingreso'] for x in sub_r), sum(x['carga'] for x in sub_r)]) + [round(inter)] \
        + reparto(pu, [sum(x[k] for x in sub_p) for k in ('playaOsl', 'descarga', 'salida')])
    porDia[d] = dict(viajes=len(xs), tramos=dict(zip(TP, seg)), ciclo=sum(seg), conPlaya3=len(sub_r), conPuerto=len(sub_p))
q10 = lambda a: sorted(a)[len(a) // 10]
col = lambda k: [x[k] for x in viajes if x.get(k) is not None]
media = {k: round(avg(col(k))) for k in ('ingreso', 'carga', 'playaOsl', 'descarga', 'salida')}; media['interplanta'] = round(avg(col('inter')))
q25 = lambda a: sorted(a)[len(a) // 4]
sinEsp = dict(media, carga=round(q25(col('carga'))), playaOsl=round(q25(col('playaOsl'))))
CIC = round(avg([x['ciclo'] for x in viajes])); SIN = sum(sinEsp[k] for k in TP)
vuelta = []
for p in {x['p'] for x in V}:
    vs = sorted((x for x in V if x['p'] == p), key=lambda x: x['n'])
    vuelta += [g for a, b in zip(vs, vs[1:]) if (g := mn(P(a['se']), P(b['ri']))) < 360]
VUE = round(sorted(vuelta)[len(vuelta) // 2])
json.dump(dict(criterio=__doc__.split('Soja R7')[0].strip(), porDia=porDia, media=media, sinEspera=sinEsp, ciclo=CIC, cicloSinEspera=SIN, vueltaMediana=VUE,
               p25=dict(carga=sinEsp['carga'], playaOsl=sinEsp['playaOsl'])),
          open(os.path.join(D, 'calculo', 'pellet-tramos-dia.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ---------------- soja R7 ----------------
R7 = json.load(open(os.path.join(D, 'calculo', 'r7-camaras.json'), encoding='utf-8'))
TR = ['ingreso', 'playa1', 'salida', 'interplanta', 'playaOsl', 'descarga', 'egreso']
r7Dia = {d: dict(viajes=x['total']['n'], tramos=dict(zip(TR, reparto(x['total']['mean'], [x[k]['mean'] for k in TR]))), ciclo=x['total']['mean'])
         for d, x in R7['tramosDia'].items()}

# ---------------- láminas ----------------
TEXT, BODY, BG = '#14281E', '#4A5D52', '#F5F8F4'
deck = json.load(open(os.path.join(D, 'deck', 'project', 'deck.json'), encoding='utf-8'))
PIE = 'Comité de Logística Nodo Sur · 30/10–05/11'
LOGOS = ('<img src="/_blob/3caa4c251260230c044ec112ee3a8b0e" alt="Nueva Vicentin Argentina" style="position:absolute; left:128px; top:976px; width:90px; height:48px; object-fit:contain">'
         '<p style="position:absolute; left:260px; top:982px; width:1400px; text-align:center; font-size:24px; color:#4A5D52">{pie}</p>'
         '<img src="/_blob/187e91d70dcb24c0d3e96da3308b438d" alt="Bimtrazer" style="position:absolute; left:1690px; top:976px; width:102px; height:48px; object-fit:contain">')

LOGO_DIR = os.environ.get('LOGO_DIR')   # PNG de scripts/estado-planta/logos.py: para exportar imágenes con los logos adentro
def conLogos(h):
    if not LOGO_DIR: return h
    for blob, f in (('/_blob/3caa4c251260230c044ec112ee3a8b0e', 'nva_green.png'), ('/_blob/187e91d70dcb24c0d3e96da3308b438d', 'btz.png')):
        h = h.replace(blob, 'data:image/png;base64,' + base64.b64encode(open(os.path.join(LOGO_DIR, f), 'rb').read()).decode())
    return h
def lamina(sid, chip, chipc, titulo, leyenda, filas, clave, nota, pagina):
    mx = max(sum(v for v, _ in segs) for _, segs, _ in filas); W = 1260
    ley = ''.join(f'<div style="display:flex; flex-direction:row; gap:10px; align-items:center"><div style="width:28px; height:28px; background:{c}; border-radius:6px"></div>'
                  f'<p style="font-size:24px; color:{TEXT}; white-space:nowrap">{t}</p></div>' for t, c in leyenda)
    rows = ''
    for lab, segs, estilo in filas:
        tot = sum(v for v, _ in segs); bar = ''
        for v, c in segs:
            w = max(2, round(v / mx * W)); oscuro = c in ('#5E4428', '#2E1B4E', '#6B55A3', '#0B5638', '#3A8F63')
            txt = f'<p style="font-size:{22 if w >= 46 else 18}px; font-weight:600; text-align:center; color:{"#F1F6F2" if oscuro else TEXT}">{v}</p>' if w >= 30 else ''
            bar += f'<div style="width:{w}px; height:50px; background:{c}; border-right:3px solid {BG}; display:flex; flex-direction:column; justify-content:center">{txt}</div>'
        rows += (f'<div style="display:flex; flex-direction:row; align-items:center; gap:16px{"; margin-top:10px; padding-top:14px; border-top:2px dashed #B7C3BB" if estilo else ""}">'
                 f'<p style="width:200px; font-size:{22 if estilo else 28}px; font-weight:{700 if estilo else 600}; line-height:1.15; color:{"#1E6B45" if estilo else TEXT}">{lab}</p>'
                 f'<div style="display:flex; flex-direction:row; border-radius:8px; overflow:hidden">{bar}</div>'
                 f'<p style="font-size:26px; font-weight:700; color:{"#1E6B45" if estilo else TEXT}; white-space:nowrap">{tot} min</p></div>')
    return (f'<section id="{sid}" data-transition="fade" style="background:{BG}; color:{TEXT}; font-family:\'IBM Plex Sans\', Arial, sans-serif; padding:112px 128px 160px; display:flex; flex-direction:column; gap:22px">'
            f'<div style="display:flex; flex-direction:column; gap:16px"><div style="display:flex; flex-direction:row; gap:16px; align-items:center"><p style="font-size:24px; font-weight:600; letter-spacing:2px; text-transform:uppercase; color:#F1F6F2; background:{chipc}; padding:6px 18px; border-radius:999px">{chip}</p></div>'
            f'<h2 style="font-size:52px; font-weight:600; line-height:1.1; color:{TEXT}">{titulo}</h2></div>'
            f'<div style="display:flex; flex-direction:row; flex-wrap:wrap; gap:10px 26px; align-items:center">{ley}<p style="font-size:24px; color:{BODY}">Minutos por viaje (promedio), por día</p></div>'
            f'<div style="display:flex; flex-direction:column; gap:14px">{rows}</div>'
            + (f'<div style="border-left:6px solid #3A8F63; padding:4px 0 4px 20px"><p style="font-size:26px; font-weight:600; line-height:1.35; color:#1E6B45">{clave}</p></div>' if clave else '')
            + LOGOS.format(pie=f'{PIE} · {pagina}') + f'<aside>{nota}</aside></section>')

CP = {'ingreso': '#E3C9A3', 'carga': '#5E4428', 'interplanta': '#B7C3BB', 'playaOsl': '#2E1B4E', 'descarga': '#6B55A3', 'salida': '#A99BCF'}
NP = {'ingreso': 'Ingreso', 'carga': 'Playa 3 y carga', 'interplanta': 'Interplanta', 'playaOsl': 'Playa OSL', 'descarga': 'Descarga', 'salida': 'Salida'}
FULL = {d: x for d, x in porDia.items() if x['viajes'] >= 50}
filas = [(dlab(d), [(x['tramos'][k], CP[k]) for k in TP], False) for d, x in FULL.items()]
filas.append(('Tiempo promedio teórico sin esperas', [(sinEsp[k], CP[k]) for k in TP], True))
lento_p = max(FULL.items(), key=lambda kv: kv[1]['tramos']['playaOsl']); lento_r = max(FULL.items(), key=lambda kv: kv[1]['tramos']['carga'])
clave = (f'Sin esperas en Playa 3 ni en Playa OSL, el ciclo teórico es de {SIN} min ({hm(SIN)}) contra {CIC} reales; con la vuelta a Ricardone ({VUE} min), {SIN + VUE} min por camión. '
         f'La espera más larga: Playa OSL el {dlab(lento_p[0]).lower()} ({lento_p[1]["tramos"]["playaOsl"]} min) y Playa 3 el {dlab(lento_r[0]).lower()} ({lento_r[1]["tramos"]["carga"]} min).')
nota = ('Viajes = cartas de porte de pellet; ingreso y salida de Ricardone e ingreso y salida del puerto por registros de balanza; Playa 3, balanza de ingreso del puerto y volcable por cámaras (vínculo). '
        'Cada día: Ricardone, interplanta y puerto = promedio de todos los viajes; Ricardone y puerto repartidos entre sus tramos con la proporción de los viajes que tienen todas las lecturas. Día = día operativo (22 h) de la salida de Ricardone. '
        f'Teórico sin esperas: Playa 3 y carga {sinEsp["carga"]} min y Playa OSL {sinEsp["playaOsl"]} min = cuartil más rápido de los viajes (lo que logró uno de cada cuatro); resto, promedios ({", ".join(f"{NP[k]} {media[k]}" for k in TP)}). Vuelta = mediana de salida del puerto a ingreso a Ricardone sin descanso. '
        'Días parciales fuera de la lámina (jue 29 y mar 3, inicio y cierre del operativo, menos de 50 viajes). Por día (viajes · con Playa 3 · con puerto completo): ' + '; '.join(f'{d} {x["viajes"]} · {x["conPlaya3"]} · {x["conPuerto"]}' for d, x in porDia.items()) + '.')
pag = deck['order'].index('pel-op-tramos') + 1
htm = lamina('pel-op-tramos', 'Anexo · operativo de pellet', '#5E4428', f'Pellet: ciclo real de {os.environ.get("CICLO_PUBLICADO", CIC)} min; teórico sin esperas, {SIN} min',
             [(NP[k], CP[k]) for k in TP], filas, '', nota, pag)
open(os.path.join(OUT, 'pel-op-tramos.html'), 'w', encoding='utf-8').write(conLogos(htm))
open(os.path.join(D, 'deck', 'project', 'slides', 'pel-op-tramos.html'), 'w', encoding='utf-8').write(htm)

CR = {'ingreso': '#9CCBAE', 'playa1': '#0B5638', 'salida': '#3A8F63', 'interplanta': '#B7C3BB', 'playaOsl': '#2E1B4E', 'descarga': '#6B55A3', 'egreso': '#A99BCF'}
NR = {'ingreso': 'Ingreso', 'playa1': 'Playa 1', 'salida': 'Salida', 'interplanta': 'Interplanta', 'playaOsl': 'Playa OSL', 'descarga': 'Descarga', 'egreso': 'Egreso'}
filas = [(dlab(d), [(x['tramos'][k], CR[k]) for k in TR], False) for d, x in r7Dia.items()]
cs = [x['ciclo'] for x in r7Dia.values()]; lento = max(r7Dia.items(), key=lambda kv: kv[1]['ciclo'])
esp = lambda x: x['tramos']['playa1'] + x['tramos']['playaOsl']
clave = (f'El día más lento fue el {dlab(lento[0]).lower()}: {lento[1]["tramos"]["playa1"]} min en Playa 1. '
         f'Las dos playas se llevaron entre {min(esp(x) for x in r7Dia.values())} y {max(esp(x) for x in r7Dia.values())} min por viaje según el día; el resto del recorrido, entre {min(x["ciclo"] - esp(x) for x in r7Dia.values())} y {max(x["ciclo"] - esp(x) for x in r7Dia.values())}.')
nota = ('Soja R7 por cámaras (calada sólida → egreso Ricardone → puerto). Tramos = promedios por día reescalados para sumar el puerta a puerta promedio del día. Por día (viajes medidos): '
        + '; '.join(f'{d} {x["viajes"]}' for d, x in r7Dia.items()) + '.')
htm = lamina('tramos-r7-dia', 'Soja · R7', '#0B5638', f'Soja R7: de {min(cs)} a {max(cs)} min puerta a puerta; la espera, en las playas',
             [(NR[k], CR[k]) for k in TR], filas, clave, nota, deck['order'].index('tramos-r7') + 1)
open(os.path.join(OUT, 'tramos-r7-dia.html'), 'w', encoding='utf-8').write(conLogos(htm))
print('pellet', CIC, '->', SIN, '+ vuelta', VUE, {d: x['ciclo'] for d, x in porDia.items()}, '| R7', {d: x['ciclo'] for d, x in r7Dia.items()})
