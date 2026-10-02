"""Cruce mantenimiento (OT del EAM) x descarga de camiones (Excel de movimientos).

Busca la causa en la cadena de equipos que condiciona cada punto de descarga (grafo_planta.json),
no solo en la plataforma: secadora -> volcables que la alimentan, celda destino -> volcables que
cargan ahí, calador de Ricardone -> volcables del puerto (la soja se cala antes de viajar).

Por plataforma y día (solo días en que la planta descarga al menos la mitad de lo normal):
  APAGADA   la plataforma descarga <=20 % de su mediana de 14 días (con mediana >= 20)
  COMPENSA  otra plataforma de la misma planta descarga >= 2x su mediana ese mismo día
  DEMORA    tiempo puerta a puerta (salida - ingreso Excel) >= 1,5x su mediana de 14 días y +120 min
Si la DEMORA toca a la mayoría de las plataformas activas de la planta, se informa una vez como
demora de planta (causa común: calada, balanza, playa, lluvia...).

Secciones del informe:
  1. Prueba por cadena: días con OT fuerte en la cadena vs días sin OT -> ¿cambia algo?
  2. Episodios con las OT más específicas de su cadena.
  3. Episodios sin OT en la cadena (candidatos a causa operativa o parada no cargada).

Uso:
  python agentes/mantenimiento/cruce_mantenimiento.py --ot <OT_detalle_fechas.csv> [--desde 2026-06-10] [--hasta 2026-09-29] [--out informe.md]
"""
import argparse, collections, csv, datetime as dt, glob, json, os, re, statistics as st, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(AQUI))
PATENTES_FICTICIAS = {'XXXXXX', 'PPPPPP', 'TTTTTT', 'XXXX', 'PPPP', 'TTTT'}
PREVIO = 2  # OT con inicio programado hasta 2 días antes del día afectado
NOMBRE = {'VOLCABLE_PTO_1': 'PV1 puerto', 'VOLCABLE_PTO_2': 'PV2 puerto', 'VOLCABLE_PTO_3': 'PV3 puerto',
          'VOLCABLE_PTO_4': 'PV4 puerto', 'VOLCABLE_PTO_5': 'PV5 puerto (secadora)', 'VOLCABLE_1': 'Volcable 1 Ricardone',
          'VOLCABLE_2': 'Volcable 2 Ricardone', 'CELDA_16': 'Celda 16 Ricardone', 'KEPPLER_1': 'Kepler 1', 'KEPPLER_2': 'Kepler 2'}


def fecha(s):
    return dt.datetime.strptime(s[:10], '%d/%m/%Y').date() if s else None


def iso(s):
    try:
        return dt.datetime.fromisoformat(s[:19])
    except (TypeError, ValueError):
        return None


def rango(a, b):
    while a <= b:
        yield a
        a += dt.timedelta(1)


def cargar_descargas(plataformas):
    ops = {}
    for p in glob.glob(os.path.join(REPO, 'runs', 'windows', '*', 'tables', 'excel_operations_with_truckflow.json')):
        for r in json.load(open(p, encoding='utf-8'))['rows']:
            ops[r['external_operation_id']] = r
    n = collections.defaultdict(collections.Counter)
    t = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in ops.values():
        if r['movement_type'] != 'INGRESO' or r['platform_normalized'] not in plataformas:
            continue
        if (r['plate_normalized'] or '').upper() in PATENTES_FICTICIAS:
            continue
        i, s = iso(r['external_ingreso_at']), iso(r['external_salida_at'])
        if not i:
            continue
        d, p = i.date(), r['platform_normalized']
        n[d][p] += 1
        if s and 0 < (s - i).total_seconds() < 86400:
            t[d][p].append((s - i).total_seconds() / 60)
    return n, t


def medir(n, t, plantas, desde, hasta):
    """Una fila por (plataforma, día operativo de su planta) con volumen y tiempo relativos a su mediana de 14 días."""
    filas = {}
    for planta, plats in plantas.items():
        for d in rango(desde, hasta):
            prev = [d - dt.timedelta(k) for k in range(1, 15)]
            tot = sum(n[d][p] for p in plats)
            base_tot = st.median([sum(n[x][p] for p in plats) for x in prev])
            if base_tot == 0 or tot < 0.5 * base_tot:
                continue
            for p in plats:
                base = st.median([n[x][p] for x in prev])
                tp = [m for x in prev for m in t[x][p]]
                hoy_t = st.median(t[d][p]) if len(t[d][p]) >= 10 else None
                ref_t = st.median(tp) if len(tp) >= 30 else None
                filas[(p, d)] = {'planta': planta, 'n': n[d][p], 'base': base, 't': hoy_t, 'ref_t': ref_t,
                                 'apagada': base >= 20 and n[d][p] <= 0.2 * base,
                                 'demora': bool(hoy_t and ref_t and hoy_t >= 1.5 * ref_t and hoy_t - ref_t >= 120)}
    for (p, d), f in filas.items():
        otras = [q for q in plantas[f['planta']] if q != p and filas.get((q, d), {}).get('apagada')]
        f['compensa'] = bool(otras) and not f['apagada'] and f['n'] >= 2 * f['base'] + 20
        f['por'] = otras
    return filas


def episodios(filas, plantas):
    marcas = collections.defaultdict(dict)
    dias_planta = collections.defaultdict(lambda: collections.defaultdict(list))
    for (p, d), f in filas.items():
        if f['demora']:
            dias_planta[(f['planta'], d)]['demora'].append(p)
        if f['n'] > 0 or f['apagada']:
            dias_planta[(f['planta'], d)]['activas'].append(p)
    for (p, d), f in filas.items():
        if f['apagada']:
            marcas[(p, 'APAGADA')][d] = f"{f['n']} vs {f['base']:.0f}"
        if f['compensa']:
            marcas[(p, 'COMPENSA')][d] = f"{f['n']} vs {f['base']:.0f} (cubre {', '.join(NOMBRE[q] for q in f['por'])})"
        if f['demora']:
            dp = dias_planta[(f['planta'], d)]
            if len(dp['demora']) >= max(2, 0.6 * len(dp['activas'])):
                marcas[(f['planta'], 'DEMORA DE PLANTA')][d] = f"{len(dp['demora'])} de {len(dp['activas'])} plataformas"
            else:
                marcas[(p, 'DEMORA')][d] = f"{f['t']:.0f} vs {f['ref_t']:.0f} min"
    out = []
    for (quien, tipo), ds in marcas.items():
        orden = sorted(ds)
        ini = ult = orden[0]
        for d in orden[1:] + [None]:
            if d is not None and (d - ult).days <= 2:
                ult = d
                continue
            out.append({'quien': quien, 'tipo': tipo, 'desde': ini, 'hasta': ult,
                        'detalle': [f'{x:%d/%m} {ds[x]}' for x in orden if ini <= x <= ult]})
            if d is not None:
                ini = ult = d
    return sorted(out, key=lambda e: (e['desde'], e['quien']))


def peso(ot):
    txt = f"{ot['tipo_ot']} {ot['prioridad']}".upper()
    if 'EMERGEN' in txt or 'PARADA ANUAL' in ot['trabajo'].upper() or ot.get('_detiene'):
        return 3
    if any(k in txt for k in ('CORRECTIVO', 'URGENTE', 'DIFERIDO', 'MITIGACI', 'INMEDIATO')):
        return 2
    return 1


def especificidad(cadena):
    if 'efecto' in cadena:  # mapa de planta: manda el efecto calculado sobre la plataforma
        return {'detiene': 3, 'reduce_capacidad': 2, 'demora': 1}.get(cadena['efecto'], 0)
    if cadena['relacion'] == 'directo':
        return 3
    if len(cadena['afecta']) <= 2:
        return 2
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ot', required=True)
    ap.add_argument('--desde', default='2026-06-10')
    ap.add_argument('--hasta', default='2026-09-29')
    ap.add_argument('--out', default=None)
    ap.add_argument('--mapa', default=os.path.join(AQUI, 'pedido_mapa_planta', 'mapa_planta_mantenimiento.json'),
                    help='mapa de planta (impacto de cada equipo). Si no existe, usa el borrador grafo_planta.json')
    ap.add_argument('--borrador', action='store_true', help='forzar el borrador grafo_planta.json')
    a = ap.parse_args()
    desde, hasta = dt.date.fromisoformat(a.desde), dt.date.fromisoformat(a.hasta)

    grafo = json.load(open(os.path.join(AQUI, 'grafo_planta.json'), encoding='utf-8'))
    plantas = grafo['plantas']
    usa_mapa = os.path.exists(a.mapa) and not a.borrador

    ots = []
    if usa_mapa:
        # Mapa de planta: cada equipo trae su efecto calculado sobre cada plataforma (detiene / reduce / demora).
        mapa = json.load(open(a.mapa, encoding='utf-8'))
        clas = mapa['clasificacion_trabajos']
        rx_det = re.compile('|'.join(p['patron'] for p in clas['detienen_equipo']), re.I)
        rx_no = re.compile('|'.join(p['patron'] for p in clas['no_detienen']), re.I)
        nombre_eq = {x['codigo_activo']: x['nombre'] for x in mapa['activos']}
        por_equipo = collections.defaultdict(list)
        for i in mapa['impacto_descarga']:
            plats = [p for p in i['plataformas_excel'] if p in NOMBRE]
            if i['efecto'] == 'ninguno' or not plats:
                continue
            por_equipo[i['equipo']].append({'id': f"{i['efecto']} · {i['relacion']}", 'afecta': plats, 'relacion': i['relacion'],
                                            'confianza': i['confianza'], 'efecto': i['efecto'], 'nodo': i['nodo_circuito']})
        cadenas = []
        for rows in por_equipo.values():
            cadenas.extend(rows)
        for r in csv.DictReader(open(a.ot, encoding='utf-8-sig')):
            if r['resultado'] == 'CANCELADA' or r['codigo_activo'] not in por_equipo:
                continue
            det = bool(rx_det.search(r['trabajo']))
            if not det and rx_no.search(r['trabajo']):
                continue
            r['_ini'] = fecha(r['debia_iniciar'])
            r['_cad'] = por_equipo[r['codigo_activo']]
            r['_detiene'] = det
            if r['_ini']:
                ots.append(r)
        fuente = f'mapa de planta `{os.path.basename(a.mapa)}` ({len(por_equipo)} equipos con efecto sobre la descarga)'
    else:
        ruido = re.compile(grafo['trabajos_irrelevantes'], re.I)
        cadenas = [dict(c, rx=re.compile('|'.join(c['activos']), re.I)) for c in grafo['cadenas']]
        for r in csv.DictReader(open(a.ot, encoding='utf-8-sig')):
            if r['planta'] not in ('Ricardone', 'Terminal Embarque') or r['resultado'] == 'CANCELADA' or ruido.search(r['trabajo']):
                continue
            r['_ini'] = fecha(r['debia_iniciar'])
            r['_cad'] = [c for c in cadenas if c['rx'].search(r['codigo_activo']) or c['rx'].search(r['activo'])]
            if r['_ini'] and r['_cad']:
                ots.append(r)
        fuente = 'borrador `grafo_planta.json` (cadenas por regex de código de activo)'

    n, t = cargar_descargas({p for ps in plantas.values() for p in ps})
    filas = medir(n, t, plantas, desde, hasta)
    eps = episodios(filas, plantas)

    L = [f'# Cruce mantenimiento × descarga ({desde:%d/%m}–{hasta:%d/%m})', '',
         f'Descargas: Excel de movimientos (INGRESO por plataforma, sin patentes ficticias). '
         f'Dependencias: {fuente}. OT: {len(ots)} sobre equipos que afectan la descarga, sin canceladas ni trabajos que no paran equipo. '
         f'Una OT “toca” un día si su inicio programado está entre {PREVIO} días antes y ese día.', '',
         '> La fecha de la OT es la programada (el EAM copia la real en el 92 % de los casos) y no hay horas de parada. '
         'Una coincidencia es una pista para validar con planta, no una causa probada.', '']

    # 1. Prueba por cadena
    L += ['## 1. ¿Qué cadenas mueven la descarga?', '',
          'Para cada cadena y cada plataforma que afecta: días de planta operando con OT fuerte (correctiva, urgente, emergencia o parada anual) '
          'en esa cadena, contra los días sin ninguna OT en la cadena. “Apagada” = % de días con la plataforma casi sin descargar. '
          '“Tiempo” = mediana del tiempo del día dividido su mediana de 14 días (1,00 = normal).', '',
          '| Cadena | Relación | Plataforma | Días con OT | Apagada con OT | Apagada sin OT | Tiempo con OT | Tiempo sin OT |',
          '|---|---|---|---:|---:|---:|---:|---:|']
    fuertes = collections.defaultdict(set)   # cadena -> días tocados por OT fuerte
    todas = collections.defaultdict(set)     # cadena -> días tocados por cualquier OT
    for o in ots:
        for c in o['_cad']:
            for p in c['afecta']:
                for d in rango(o['_ini'], o['_ini'] + dt.timedelta(PREVIO)):
                    todas[(c['id'], p)].add(d)
                    if peso(o) >= 2:
                        fuertes[(c['id'], p)].add(d)
    senales = []
    grupos = sorted({(c['id'], p): c for c in cadenas for p in c['afecta']}.items(), key=lambda kv: (kv[0][1], kv[0][0]))
    for (cid, p), c in grupos:
        if True:
            con = [f for (q, d), f in filas.items() if q == p and d in fuertes[(cid, p)]]
            sin = [f for (q, d), f in filas.items() if q == p and d not in todas[(cid, p)]]
            if len(con) < 3 or len(sin) < 15:
                continue
            pa = lambda xs: 100 * sum(f['apagada'] for f in xs) / len(xs)
            ratios = lambda xs: [f['t'] / f['ref_t'] for f in xs if f['t'] and f['ref_t']]
            a_con, a_sin = pa(con), pa(sin)
            r_con, r_sin = ratios(con), ratios(sin)
            t_con = st.median(r_con) if len(r_con) >= 3 else None
            t_sin = st.median(r_sin) if len(r_sin) >= 10 else None
            sube_a = a_con - a_sin >= 10
            sube_t = t_con is not None and t_sin is not None and t_con - t_sin >= 0.10
            if sube_a or sube_t:
                senales.append((c['id'], p))
            ft = lambda x: f'{x:.2f}' if x is not None else 's/d'
            L.append(f"| {cid} | {c['relacion']} ({c['confianza'] if not usa_mapa else 'mapa'}) | {NOMBRE[p]} | {len(con)} | "
                     f"{a_con:.0f} %{' ⬆' if sube_a else ''} | {a_sin:.0f} % | {ft(t_con)}{' ⬆' if sube_t else ''} | {ft(t_sin)} |")
    L += ['', '⬆ = con OT la plataforma se apaga al menos 10 puntos más seguido, o su tiempo sube al menos un 10 % más que sin OT. '
          'Se omiten los cruces con menos de 3 días con OT o menos de 15 días sin OT.', '']

    # 2 y 3. Episodios
    L += ['## 2. Episodios y OT más específicas', '',
          'Orden de las OT: primero las de la propia plataforma, después las de su cadena exclusiva (secadora, celda, noria), '
          'al final las compartidas (calada, playa, recepción). Se muestran hasta 4.', '']
    sin_ot = []
    for e in eps:
        plats = plantas.get(e['quien'], [e['quien']])
        cand = {}
        for o in ots:
            if not (e['desde'] - dt.timedelta(PREVIO) <= o['_ini'] <= e['hasta']):
                continue
            rel = [c for c in o['_cad'] if set(plats) & set(c['afecta'])]
            if rel:
                c = max(rel, key=especificidad)
                clave = (o['activo'], o['trabajo'][:40])
                score = (especificidad(c), peso(o), any((c['id'], q) in senales for q in plats))
                if clave not in cand or cand[clave][0] < score:
                    cand[clave] = (score, c, o)
        quien = NOMBRE.get(e['quien'], e['quien'])
        titulo = f"{quien} — {e['tipo']} {e['desde']:%d/%m}" + (f"–{e['hasta']:%d/%m}" if e['hasta'] != e['desde'] else '')
        if not cand:
            sin_ot.append(f"{titulo}: {'; '.join(e['detalle'])}")
            continue
        top = sorted(cand.values(), key=lambda x: (-x[0][1] * x[0][0], -x[0][0], x[2]['_ini']))[:4]
        L += [f'### {titulo}', '', 'Datos: ' + '; '.join(e['detalle']), '',
              '| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |', '|---|---|---|---|---|---|']
        for (esp, w, sen), c, o in top:
            L.append(f"| {o['_ini']:%d/%m} | {c['id']}{' ⬆' if sen else ''} | {o['activo'][:45]} | "
                     f"{o['trabajo'][:90].replace('|', '/').replace(chr(10), ' ')} | {(o['tipo_ot'] or 'plan')} {o['prioridad']} | {o['resultado']} |")
        L.append('')

    L += ['## 3. Episodios sin OT en su cadena', '',
          'Candidatos a causa operativa (sin producto para esa plataforma, asignación de volcables) o a una parada que no se cargó en el EAM.', '']
    L += [f'- {s}' for s in sin_ot] + ['']

    txt = '\n'.join(L)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(txt)
    else:
        sys.stdout.reconfigure(encoding='utf-8')
        print(txt)


if __name__ == '__main__':
    main()
