"""Cruce semana a semana: lo que midió cada comité de logística × mantenimiento (mapa de planta) × descarga real (Excel).

Para cada semana analizada por un comité:
  - Comité: R7 total, Playa 1 / calada, Playa OSL / espera balanza, descarga, R5+R6 (de HISTORICO_COMITES.md).
  - Excel: días-plataforma apagadas (planta operando y la plataforma <=20 % de su mediana) y equipos activos por día.
  - Mapa: días-plataforma que el mapa da por detenidas o reducidas con las OT de esa semana (simulación de alcance del
    grano desde cada plataforma sacando los equipos con OT fuerte y los que se quedan sin servicio por un CCM/trafo).
  - Calada: días-calador con OT correctiva, urgente o de emergencia en los caladores de Ricardone.

Uso: python agentes/mantenimiento/cruce_comites.py --ot <OT_detalle_fechas.csv> [--out informe.md]
"""
import argparse, collections, csv, datetime as dt, json, os, re, statistics as st, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from cruce_mantenimiento import cargar_descargas, medir, NOMBRE, fecha, rango  # noqa: E402

MAPA = os.path.join(AQUI, 'pedido_mapa_planta', 'mapa_planta_mantenimiento.json')
PLANTAS = {'PUERTO': ['VOLCABLE_PTO_1', 'VOLCABLE_PTO_2', 'VOLCABLE_PTO_3', 'VOLCABLE_PTO_4', 'VOLCABLE_PTO_5'],
           'RICARDONE': ['VOLCABLE_1', 'VOLCABLE_2', 'CELDA_16', 'KEPPLER_1', 'KEPPLER_2']}
GIRASOL, SOJA_RIC, PUERTO = {'VOLCABLE_1', 'VOLCABLE_2'}, {'CELDA_16', 'KEPPLER_1', 'KEPPLER_2'}, set(PLANTAS['PUERTO'])

# (comité, desde, hasta, R7 total, Playa1/calada, Playa OSL/balanza, descarga, R5+R6) — HISTORICO_COMITES.md, "Evolución semana a semana"
COMITES = [
    ('24/06', '2026-06-14', '2026-06-21', 316, 113, 86, 64, 287),
    ('08/07', '2026-06-22', '2026-07-05', 383, 145, 105, 70, 317),
    ('15/07', '2026-07-06', '2026-07-12', 304, 114, 65, 60, 306),
    ('23/07', '2026-07-13', '2026-07-19', 433, 171, 140, 59, 351),
    ('31/07', '2026-07-20', '2026-07-26', 389, 181, 85, 58, 361),
    ('07/08', '2026-07-27', '2026-08-02', 421, 120, 145, 68, 347),
    ('14/08', '2026-08-07', '2026-08-12', 346, 101, 113, 63, 241),
    ('28/08', '2026-08-20', '2026-08-26', 296, 112, 89, 35, 353),
    ('04/09', '2026-08-27', '2026-09-02', 379, 140, 137, 42, 430),
    ('11/09', '2026-09-03', '2026-09-09', 276, 87, 97, 44, 319),
    ('18/09', '2026-09-10', '2026-09-16', 334, 126, 119, 42, 382),
]


def spearman(x, y):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i]); r = [0] * len(v)
        i = 0
        while i < len(o):
            j = i
            while j + 1 < len(o) and v[o[j + 1]] == v[o[i]]:
                j += 1
            for k in range(i, j + 1):
                r[o[k]] = (i + j) / 2
            i = j + 1
        return r
    rx, ry = rk(x), rk(y)
    mx, my = st.mean(rx), st.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    den = (sum((a - mx) ** 2 for a in rx) * sum((b - my) ** 2 for b in ry)) ** .5
    return num / den if den else float('nan')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ot', required=True)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()

    mapa = json.load(open(MAPA, encoding='utf-8'))
    clas = mapa['clasificacion_trabajos']
    rx_det = re.compile('|'.join(p['patron'] for p in clas['detienen_equipo']), re.I)
    rx_no = re.compile('|'.join(p['patron'] for p in clas['no_detienen']), re.I)
    planta_de = {x['codigo_activo']: ('RICARDONE' if x['planta'] == 'Ricardone' else 'PUERTO') for x in mapa['activos']}

    # Grafo del grano y servicios bloqueantes
    out = collections.defaultdict(list)
    nodos = set()
    for f in mapa['flujo_grano']:
        out[f['desde']].append(f['hasta']); nodos |= {f['desde'], f['hasta']}
    sinks = {n for n in nodos if not out[n]}
    fuentes = collections.defaultdict(set)  # plataforma excel -> nodos fuente
    for i in mapa['impacto_descarga']:
        if i['relacion'] == 'directo' and i['equipo'] in nodos:
            for p in i['plataformas_excel']:
                if p in NOMBRE:
                    fuentes[p].add(i['equipo'])
    alimenta = collections.defaultdict(set)
    for s in mapa['dependencias_servicio']:
        if s.get('bloqueante', True):
            alimenta[s['depende_de']].add(s['equipo'])

    def caida(eqs):
        """Equipos fuera + todo lo que queda sin servicio aguas abajo en la alimentación."""
        res, pila = set(eqs), list(eqs)
        while pila:
            x = pila.pop()
            for y in alimenta.get(x, ()):
                if y not in res:
                    res.add(y); pila.append(y)
        return res

    def destinos(src, bloq):
        if src in bloq:
            return set()
        vis, pila = {src}, [src]
        while pila:
            x = pila.pop()
            for y in out[x]:
                if y not in bloq and y not in vis:
                    vis.add(y); pila.append(y)
        return vis & sinks

    base = {p: set().union(*(destinos(s, set()) for s in ss)) for p, ss in fuentes.items()}

    def estado(bloq):
        r = {}
        for p, ss in fuentes.items():
            if p not in NOMBRE:
                continue
            ahora = set().union(*(destinos(s, bloq) for s in ss))
            r[p] = 'det' if base[p] and not ahora else ('red' if len(ahora) < len(base[p]) else 'ok')
        return r

    # OT por día (inicio programado) en equipos del mapa
    ots = []
    for r in csv.DictReader(open(a.ot, encoding='utf-8-sig')):
        c = r['codigo_activo']
        if c not in planta_de or r['resultado'] == 'CANCELADA':
            continue
        det = bool(rx_det.search(r['trabajo']))
        if not det and rx_no.search(r['trabajo']):
            continue
        tp = f"{r['tipo_ot']} {r['prioridad']}".upper()
        fuerte = det or 'EMERGEN' in tp or any(k in tp for k in ('CORRECTIVO', 'URGENTE', 'DIFERIDO', 'MITIGACI'))
        ots.append({'c': c, 'd': fecha(r['debia_iniciar']), 'det': det, 'fuerte': fuerte, 'emerg': 'EMERGEN' in tp,
                    'trabajo': ' '.join(r['trabajo'].split()), 'nombre': r['activo'].strip(), 'ot': r['ot']})
    calad = re.compile(r'PR-PLYMP-(CDR|CHD-CA)')

    n, t = cargar_descargas({p for ps in PLANTAS.values() for p in ps})
    filas = medir(n, t, PLANTAS, dt.date(2026, 5, 20), dt.date(2026, 9, 29))

    semanas = []
    for com, d0, d1, r7, pl1, osl, desc, r56 in COMITES:
        a0, a1 = dt.date.fromisoformat(d0), dt.date.fromisoformat(d1)
        dias = list(rango(a0, a1))
        s = {'com': com, 'desde': a0, 'hasta': a1, 'r7': r7, 'pl1': pl1, 'osl': osl, 'desc': desc, 'r56': r56,
             'sim_det': collections.Counter(), 'sim_red': collections.Counter(), 'sim_det_amp': collections.Counter(),
             'obs_off': collections.Counter(), 'calador_dias': 0, 'eventos': []}
        for d in dias:
            ventana = [o for o in ots if d - dt.timedelta(2) <= o['d'] <= d]
            estricto = caida({o['c'] for o in ventana if o['det'] or o['emerg']})
            amplio = caida({o['c'] for o in ventana if o['fuerte']})
            e1, e2 = estado(estricto), estado(amplio)
            for p, v in e1.items():
                if v == 'det': s['sim_det'][p] += 1
                elif v == 'red': s['sim_red'][p] += 1
            for p, v in e2.items():
                if v == 'det': s['sim_det_amp'][p] += 1
            s['calador_dias'] += len({o['c'] for o in ots if o['d'] == d and o['fuerte'] and calad.match(o['c'])})
            for p in NOMBRE:
                f = filas.get((p, d))
                if f and f['apagada']:
                    s['obs_off'][p] += 1
        # OT de la semana que detienen alguna plataforma según el mapa (para el relato)
        vistos = set()
        for o in sorted((o for o in ots if a0 - dt.timedelta(2) <= o['d'] <= a1 and o['fuerte']), key=lambda o: o['d']):
            e = estado(caida({o['c']}))
            afect = [NOMBRE[p] for p, v in e.items() if v == 'det']
            if afect and (o['c'], o['trabajo'][:30]) not in vistos:
                vistos.add((o['c'], o['trabajo'][:30]))
                s['eventos'].append((o['d'], o['nombre'], o['trabajo'], afect, o['det'] or o['emerg'], o['ot']))
        # Tiempo puerta a puerta de la semana (mediana de días) por grupo, Excel
        for g, ps in (('t_pto', PUERTO), ('t_gir', GIRASOL)):
            v = [f['t'] for (p, d), f in filas.items() if p in ps and a0 <= d <= a1 and f['t']]
            s[g] = st.median(v) if v else None
        semanas.append(s)

    grp = lambda c, ps: sum(v for p, v in c.items() if p in ps)
    L = ['# Comités × mantenimiento × descarga', '',
         'Once semanas analizadas por el comité de logística (del 14/06 al 16/09) cruzadas con el mapa de planta y las OT. '
         'Tiempos del comité en minutos. “Días-plataforma” = suma, sobre las plataformas del grupo, de los días en ese estado.', '',
         '- **Sim. detenidas**: días-plataforma que el mapa da por detenidas con las OT que paran equipo por su texto o son emergencia (inicio programado hasta 2 días antes).',
         '- **Sim. amplia**: lo mismo sumando correctivas, urgentes y diferidas.',
         '- **Apagadas (Excel)**: días-plataforma en que la planta descargó normal y esa plataforma no.',
         '- **Calador-días**: caladores de Ricardone con OT correctiva, urgente o de emergencia cada día, sumados en la semana.', '',
         '## Semana a semana', '',
         '| Comité | Período | R7 | Playa 1 / calada | Playa OSL / balanza | R5+R6 | Calador-días | Puerto: sim. det. / amplia / apagadas | Girasol Ric.: sim. det. / amplia / apagadas | Soja Ric.: sim. det. / apagadas |',
         '|---|---|---:|---:|---:|---:|---:|---|---|---|']
    for s in semanas:
        L.append(f"| {s['com']} | {s['desde']:%d/%m}–{s['hasta']:%d/%m} | {s['r7']} | {s['pl1']} | {s['osl']} | {s['r56']} | {s['calador_dias']} | "
                 f"{grp(s['sim_det'], PUERTO)} / {grp(s['sim_det_amp'], PUERTO)} / {grp(s['obs_off'], PUERTO)} | "
                 f"{grp(s['sim_det'], GIRASOL)} / {grp(s['sim_det_amp'], GIRASOL)} / {grp(s['obs_off'], GIRASOL)} | "
                 f"{grp(s['sim_det'], SOJA_RIC)} / {grp(s['obs_off'], SOJA_RIC)} |")

    pares = [
        ('Playa 1 / calada (comité)', 'pl1', 'Calador-días', lambda s: s['calador_dias']),
        ('R7 total (comité)', 'r7', 'Calador-días', lambda s: s['calador_dias']),
        ('Playa OSL / balanza (comité)', 'osl', 'Puerto sim. amplia', lambda s: grp(s['sim_det_amp'], PUERTO)),
        ('Playa OSL / balanza (comité)', 'osl', 'Puerto apagadas (Excel)', lambda s: grp(s['obs_off'], PUERTO)),
        ('R7 total (comité)', 'r7', 'Puerto sim. amplia', lambda s: grp(s['sim_det_amp'], PUERTO)),
        ('R5+R6 (comité)', 'r56', 'Girasol sim. amplia', lambda s: grp(s['sim_det_amp'], GIRASOL)),
        ('R5+R6 (comité)', 'r56', 'Girasol sim. detenidas', lambda s: grp(s['sim_det'], GIRASOL)),
        ('R5+R6 (comité)', 'r56', 'Girasol apagadas (Excel)', lambda s: grp(s['obs_off'], GIRASOL)),
    ]
    L += ['', '## ¿Acompaña el mantenimiento lo que midió el comité?', '',
          'Correlación de rangos (Spearman) entre las 11 semanas. Con 11 puntos, |ρ| < 0,5 es ruido; 0,5–0,7 es una señal a mirar; > 0,7 es fuerte.', '',
          '| Métrica del comité | Métrica de mantenimiento | ρ |', '|---|---|---:|']
    for n1, k, n2, fx in pares:
        L.append(f"| {n1} | {n2} | {spearman([s[k] for s in semanas], [fx(s) for s in semanas]):+.2f} |")

    L += ['', '## Qué OT de cada semana detienen alguna plataforma según el mapa', '',
          'OT fuertes con inicio programado entre 2 días antes de la semana y su último día. ● = para el equipo por su texto o es emergencia.', '']
    for s in semanas:
        L += [f"### Comité {s['com']} ({s['desde']:%d/%m}–{s['hasta']:%d/%m}) — R7 {s['r7']} · Playa 1 {s['pl1']} · Playa OSL {s['osl']} · R5+R6 {s['r56']}", '']
        off = ', '.join(f'{NOMBRE[p]} {v} d' for p, v in sorted(s['obs_off'].items()) if v)
        L.append(f"Excel, plataformas apagadas: {off or 'ninguna'}.")
        L.append('')
        if s['eventos']:
            L += ['| Inicio prog. | Equipo | Trabajo | Detiene | |', '|---|---|---|---|---|']
            for d, nom, tr, af, fuerte, ot in s['eventos'][:12]:
                L.append(f"| {d:%d/%m} | {nom[:40]} | {tr[:80].replace('|', '/')} | {', '.join(af)} | {'●' if fuerte else ''} |")
            if len(s['eventos']) > 12:
                L.append(f"| | y {len(s['eventos']) - 12} más | | | |")
        else:
            L.append('Ninguna OT de la semana detiene una plataforma según el mapa.')
        L.append('')

    txt = '\n'.join(L)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(txt)
    else:
        sys.stdout.reconfigure(encoding='utf-8'); print(txt)


if __name__ == '__main__':
    main()
