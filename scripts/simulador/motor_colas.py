"""Motor de colas del simulador (eventos discretos, Python sin dependencias).

Uso:
  python scripts/simulador/motor_colas.py 2026-08-29                 # escenario base + calibración
  python scripts/simulador/motor_colas.py 2026-08-29 --escenario A   # A, AB, AC, ABC
  python scripts/simulador/motor_colas.py 2026-08-29 --todos         # base y todos los escenarios

Toma las llegadas reales de public/simulador/days/<día>.json (las mismas que usa la repetición)
y las hace pasar por los recursos que limitan el flujo R7 Ricardone → puerto
(plan en docs/simulador/PLAN_MOTOR_COLAS.md):

  Preingreso ─► [Playa 1] ─► CALADA RIC (perfil cal_cap[h]) ─► demora real del camión
  ─► Ingreso SL ─► [Playa OSL] ─► BALANZA INGRESO SL (1,5 min; sale solo si hay lugar abajo)
  ─► traslado + calada SL ─► VOLCABLES SL (V(t) servidores, paradas) ─► fin

Los que descargan en Ricardone ('R') usan la calada y salen del modelo. Los transiles
(soja/pellet de silos al puerto) no pasan por la calada: entran al puerto a su hora real.
La simulación arranca a las −6 h para que la cola de Playa 1 de las 00 h se forme sola.
"""
import argparse, heapq, json, math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DAYS = ROOT / 'public/simulador/days'
OUT = ROOT / 'outputs/simulador/motor'

# Nodos de model.json
N_ING_RIC, N_PRE, N_CAL, N_SAL2 = 0, 1, 2, 19
N_ING_SL, N_BAL_SL, N_VOLC, N_BAL_EGR, N_EGR_SL = 20, 22, 25, 28, 30
SL_NODES = set(range(20, 31))
RIC_IN = {N_ING_RIC, N_PRE, N_CAL, N_SAL2}

T0, T_END = -360.0, 26 * 60.0       # arranque a −6 h, corte a las 26 h
DIA = (0.0, 1440.0)                  # ventana que se mide

# Medianas del 29/08 para imputar lecturas faltantes (plan, «Huecos de lectura»)
IMP = {'cal_desde_sal2': 6.0, 'cal_desde_ingsl': 19.0, 'pre_desde_ing': 5.6, 'ingsl_desde_sal2': 12.8,
       'cal_a_ingsl': 26.0, 'bal_a_volc': 33.0, 'volc_desde_bal': 31.0, 'volc_desde_egr': 17.4,
       'transile_ingsl_desde_balegr': 18.1}

BASE = {
    'cal_nominal': 60.0,          # 2 caladores, camiones por hora, en horas sin cola
    'bloque_h': 2,                # suavizado del caudal de calada y de volcables
    'cola_saturada': 5,           # cola mínima en todo el bloque para tomar el caudal como capacidad
    'bal_min': 1.5,               # pesaje en la balanza de ingreso SL
    'bal_limpieza': [390.0, 15.0],  # 15 min de limpieza por día (inicio, duración)
    'traslado_bal_volc': 16.0,    # balanza → volcable sin cola (p10 medido 16 min, incluye calada SL)
    'gate_extra_por_volc': 3,     # V(t) volcando + 3 por volcable en camino (con +1, como decía el plan, el puerto rinde −31 %)
    'volc_nominal': 32.0,         # techo medido de los 5 volcables, camiones por hora
    'paradas': [[390.0, 45.0, [0, 1, 2, 3, 4]]],  # 06:30 todos juntos 45 min (se ve en los 5 volcables)
    'liberar_si_osl_menor': None,  # palanca B: N camiones (Playa OSL + en viaje)
}


# ───────────────────────────── datos reales ─────────────────────────────

def first(path, node, after=-1e9):
    for n, m, _ in path:
        if n == node and m >= after:
            return m
    return None


def split_sl_visits(path):
    """Tramos seguidos del recorrido dentro del puerto (una visita al puerto por tramo), como índices del recorrido."""
    out, cur = [], []
    for j, x in enumerate(path):
        if x[0] in SL_NODES:
            cur.append(j)
        elif cur:
            out.append(cur); cur = []
    if cur:
        out.append(cur)
    return out


def port_pass(visit, dest_s):
    """Horas reales (con imputación) de una visita al puerto: ingreso, balanza, volcable."""
    g = lambda n: next((m for k, m, _ in visit if k == n), None)
    t20, t22, t25, t30 = g(N_ING_SL), g(N_BAL_SL), g(N_VOLC), g(N_EGR_SL) or g(N_BAL_EGR)
    real25 = t25 is not None
    if t25 is None and (t22 is not None or t30 is not None) and dest_s:
        t25 = t22 + IMP['bal_a_volc'] if t22 is not None else t30 - IMP['volc_desde_egr']
    if t25 is None:
        return None  # no descargó en el puerto
    if t22 is None:
        t22 = t25 - IMP['volc_desde_bal']
    return {'t20': t20, 't22': t22, 't25': t25, 'real25': real25}


def load_day(day):
    d = json.loads((DAYS / f'{day}.json').read_text(encoding='utf-8'))
    ric, port = [], []   # camiones que usan la calada; visitas al puerto
    for i, t in enumerate(d['trucks']):
        plate, grupo, _, path, transile, dest = t[0], t[1], t[2], t[3], t[4], t[5]
        visits = split_sl_visits(path)
        has_ric = any(n in RIC_IN for n, _, _ in path)
        r = None
        if not transile and has_ric:
            cal = first(path, N_CAL)
            imp_cal = cal is None
            if cal is None:
                s2, sl = first(path, N_SAL2), first(path, N_ING_SL)
                if s2 is not None:
                    cal = s2 - IMP['cal_desde_sal2']
                elif sl is not None and (first(path, N_PRE) is not None or first(path, N_ING_RIC) is not None):
                    cal = sl - IMP['cal_desde_ingsl']
            if cal is not None:
                pre = first(path, N_PRE)
                if pre is None and first(path, N_ING_RIC) is not None:
                    pre = first(path, N_ING_RIC) + IMP['pre_desde_ing']
                if pre is not None and pre > cal:
                    pre = None  # lectura de preingreso de otra vuelta
                r = {'id': i, 'plate': plate, 'grupo': grupo, 'dest': dest, 'pre': pre, 'cal': cal,
                     'imp_cal': imp_cal, 'pass': None}
                ric.append(r)
        for v in visits:
            p = port_pass([path[j] for j in v], dest == 'S' or bool(transile))
            if not p:
                continue
            p.update({'id': i, 'plate': plate, 'transile': bool(transile), 'vidx': v})
            if r is not None and r['pass'] is None and p['t25'] > r['cal']:
                r['pass'] = p
                p['ric'] = r
                if p['t20'] is None:
                    s2 = first(path, N_SAL2, r['cal'])
                    p['t20'] = s2 + IMP['ingsl_desde_sal2'] if s2 is not None else r['cal'] + IMP['cal_a_ingsl']
                r['delay'] = max(3.0, p['t20'] - r['cal'])
            else:
                p['ric'] = None
                if p['t20'] is None:
                    # sin lectura de ingreso: balanza de egreso RIC previa + 18 min (transiles) o se imputa luego
                    prev = [m for n, m, _ in path if n == 16 and m < p['t22']]
                    p['t20'] = prev[-1] + IMP['transile_ingsl_desde_balegr'] if prev else None
            port.append(p)
    # Preingreso faltante: calada real menos la espera mediana de los vecinos (±60 min)
    _impute_by_neighbors(ric, 'pre', 'cal')
    # Ingreso SL faltante en visitas sin calada: balanza menos la espera mediana de los vecinos
    _impute_by_neighbors(port, 't20', 't22')
    for p in port:
        if p['t20'] > p['t22']:
            p['t20'] = p['t22']
    return d, ric, port


def _impute_by_neighbors(items, fld, ref):
    known = sorted((x[ref], x[ref] - x[fld]) for x in items if x[fld] is not None)
    for x in items:
        if x[fld] is None:
            w = sorted(dw for t, dw in known if abs(t - x[ref]) <= 60) or sorted(dw for _, dw in known)
            x[fld] = x[ref] - w[len(w) // 2]
            x['imp_' + fld] = True


# ───────────────────────────── calibración ─────────────────────────────

def hours():
    return range(int(T0 // 60), int(T_END // 60) + 1)


def queue_at(items, a, b, t):
    return sum(1 for x in items if x[a] is not None and x[b] is not None and x[a] <= t < x[b])


def capacity_profile(times, items, a, b, nominal, prm, corr=None):
    """Caudal observado en bloques de 2 h con cola en toda la ventana (capacidad saturada); si no, nominal."""
    blk = prm['bloque_h']
    cap = {}
    for h0 in range(int(T0 // 60), 24, blk):
        hs = list(range(h0, h0 + blk))
        # antes de las 00 h el archivo solo trae los camiones que tocan el día: se repite el caudal observado
        sat = h0 < 0 or all(queue_at(items, a, b, h * 60 + m) >= prm['cola_saturada'] for h in hs for m in (0, 30))
        if sat:
            n = sum(1 for t in times if h0 * 60 <= t < (h0 + blk) * 60)
            eff = sum((corr or {}).get(h, 1.0) for h in hs)
            val = n / eff
        else:
            val = nominal
        for h in hs:
            cap[h] = val
    for h in hours():
        cap.setdefault(h, cap.get(h - 24, nominal))
    return cap


def calibrate(ric, port, prm):
    cal_times = [r['cal'] for r in ric]
    cal_cap = capacity_profile(cal_times, ric, 'pre', 'cal', prm['cal_nominal'], prm)
    # volcables: horas abiertas por volcable descontando las paradas explícitas
    stop_frac = defaultdict(float)
    for s, dur, vs in prm['paradas']:
        for m in range(int(s), int(s + dur)):
            stop_frac[m // 60] += len(vs) / 5 / 60
    corr = {h: max(0.2, 1 - stop_frac[h]) for h in hours()}
    volc_cap = capacity_profile([p['t25'] for p in port], port, 't20', 't22', prm['volc_nominal'], prm, corr)
    return cal_cap, volc_cap


def active_volcables(day_json):
    act = defaultdict(set)
    for t in day_json['trucks']:
        for n, m, dv in t[3]:
            if n == N_VOLC and dv >= 11:
                act[int(m // 60)].add(dv - 11)
    return act


# ───────────────────────────── motor ─────────────────────────────

class Sim:
    def __init__(self, ric, port, prm, cal_cap, volc_cap, vact):
        self.prm, self.cal_cap, self.volc_cap, self.vact = prm, cal_cap, volc_cap, vact
        self.ev, self.seq = [], 0
        self.ric, self.port = ric, port
        self.q_cal, self.q_osl, self.q_volc, self.hold = [], [], [], []
        self.cal_busy_until = -1e9
        self.bal_busy_until = -1e9
        self.downstream = 0           # pesados que todavía no terminaron de volcar
        self.in_transit = 0           # soltados de Ricardone que todavía no llegaron al puerto
        self.volc_busy = [None] * 5   # hasta qué minuto está ocupado cada volcable
        self.busy_min = defaultdict(lambda: defaultdict(float))  # recurso → hora → minutos ocupados
        self.out = {}

    def push(self, t, kind, x):
        self.seq += 1
        heapq.heappush(self.ev, (t, self.seq, kind, x))

    def hcap(self, prof, t):
        return prof.get(int(math.floor(t / 60)), prof.get(23))

    def open_volcables(self, t):
        h = int(math.floor(t / 60))
        n = self.vact(h)
        ids = list(range(5))[:n] if n < 5 else list(range(5))
        for s, dur, vs in self.prm['paradas']:
            if s <= t < s + dur:
                ids = [i for i in ids if i not in vs]
        return ids

    def run(self):
        for r in self.ric:
            if r['cal'] < T0:   # ya calado al arrancar: llega al puerto a su hora real
                self.out[('R', r['id'])] = {'pre': r['pre'], 'cal': r['cal']}
                if r['pass']:
                    self.push(r['pass']['t20'], 'arr_sl', r['pass'])
                continue
            self.push(max(r['pre'], T0), 'arr_pre', r)
        for p in self.port:
            if p['ric'] is None:
                if p['t22'] < T0:
                    self.out[('P', id(p))] = {'t20': p['t20'], 't22': p['t22'], 't25': p['t25'], 'fixed': True}
                else:
                    self.push(max(p['t20'], T0), 'arr_sl', p)
        t = T0
        while t <= T_END:   # cada minuto se reintenta despachar (perfiles por hora y paradas)
            self.push(t, 'tick', None)
            t += 1.0
        while self.ev:
            t, _, kind, x = heapq.heappop(self.ev)
            if t > T_END + 600:
                break
            if kind == 'arr_pre':
                self.q_cal.append(x)
            elif kind == 'cal_done':
                self.out[('R', x['id'])] = {'pre': x['pre'], 'cal': t}
                if x['pass']:
                    self.hold.append((t, x))
            elif kind == 'arr_sl':
                if x['ric'] is not None:
                    self.in_transit -= 1
                self.q_osl.append((t, x))
            elif kind == 'bal_done':
                self.push(t + self.prm['traslado_bal_volc'], 'arr_volc', x)
            elif kind == 'arr_volc':
                self.q_volc.append((t, x))
            elif kind == 'volc_done':
                srv, p = x
                self.volc_busy[srv] = None
                self.downstream -= 1
                self.out[('P', id(p))]['fin'] = t
            self.dispatch(t)
        return self

    def dispatch(self, t):
        prm = self.prm
        # calada: un servidor de ritmo cal_cap[h]
        if self.q_cal and self.cal_busy_until <= t:
            cap = self.hcap(self.cal_cap, t)
            if cap > 0:
                r = self.q_cal.pop(0)
                dur = 60.0 / cap
                self.cal_busy_until = t + dur
                self._busy('calada', t, dur, 1.0)
                self.push(t + dur, 'cal_done', r)
        # soltar desde Ricardone (palanca B)
        n_lim = prm['liberar_si_osl_menor']
        while self.hold and (n_lim is None or len(self.q_osl) + self.in_transit < n_lim):
            tc, r = self.hold.pop(0)
            self.in_transit += 1
            self.out[('R', r['id'])]['salida'] = t
            self.push(t + r['delay'], 'arr_sl', r['pass'])
        # balanza ingreso SL: sale de OSL solo si hay lugar en los volcables
        lim = prm['bal_limpieza']
        in_clean = lim and lim[0] <= t < lim[0] + lim[1]
        if self.q_osl and self.bal_busy_until <= t and not in_clean:
            nv = self.vact(int(math.floor(t / 60)))
            if self.downstream < nv * (1 + prm['gate_extra_por_volc']):
                ta, p = self.q_osl.pop(0)
                self.bal_busy_until = t + prm['bal_min']
                self.downstream += 1
                self._busy('balanza', t, prm['bal_min'], 1.0)
                self.out[('P', id(p))] = {'t20': ta, 't22': t}
                self.push(t + prm['bal_min'], 'bal_done', p)
        # volcables
        if self.q_volc:
            open_ids = self.open_volcables(t)
            nv = max(1, len(open_ids))
            cap = self.hcap(self.volc_cap, t)
            for srv in open_ids:
                if not self.q_volc:
                    break
                if self.volc_busy[srv] is None:
                    ta, p = self.q_volc.pop(0)
                    dur = 60.0 * self.vact(int(math.floor(t / 60))) / cap if cap > 0 else 60.0
                    self.volc_busy[srv] = t + dur
                    self._busy('volcables', t, dur, 1.0)
                    self.out[('P', id(p))]['t25'] = t
                    self.out[('P', id(p))]['srv'] = srv
                    self.push(t + dur, 'volc_done', (srv, p))

    def _busy(self, res, t, dur, w):
        m = t
        while m < t + dur:
            h = int(math.floor(m / 60))
            step = min(t + dur, (h + 1) * 60) - m
            self.busy_min[res][h] += step * w
            m += step


# ───────────────────────────── medición ─────────────────────────────

def metrics(ric, port, sim_out=None):
    """Mismas medidas para el día real y para el simulado."""
    if sim_out is None:
        R = [{'pre': r['pre'], 'cal': r['cal'], 'dest': r['dest'], 'id': r['id']} for r in ric]
        P = [{'t20': p['t20'], 't22': p['t22'], 't25': p['t25']} for p in port]
    else:
        R = [dict(sim_out[('R', r['id'])], dest=r['dest'], id=r['id']) for r in ric if ('R', r['id']) in sim_out]
        P = [sim_out[('P', id(p))] for p in port if ('P', id(p)) in sim_out]
        P = [dict(p, t25=p.get('t25', 1e9), t22=p.get('t22', 1e9)) for p in P]
        for r in ric:
            if ('R', r['id']) not in sim_out:
                R.append({'pre': r['pre'], 'cal': 1e9, 'dest': r['dest'], 'id': r['id']})
        for p in port:
            if ('P', id(p)) not in sim_out:
                P.append({'t20': 1e9, 't22': 1e9, 't25': 1e9})
    hs = range(24)
    hourly = lambda xs: [sum(1 for v in xs if h * 60 <= v < (h + 1) * 60) for h in hs]
    q = lambda items, a, b: [sum(1 for x in items if x[a] <= h * 60 < x[b]) for h in hs]
    in_day = lambda v: DIA[0] <= v < DIA[1]
    w_cal = [x['cal'] - x['pre'] for x in R if in_day(x['cal'])]
    w_osl = [x['t22'] - x['t20'] for x in P if in_day(x['t22'])]
    hold = []
    if sim_out is not None:
        hold = [sum(1 for x in R if x.get('salida') is not None and x['cal'] <= h * 60 < x['salida']) for h in hs]
    return {
        'descargas_volcables_0_24': sum(1 for x in P if in_day(x['t25'])),
        'caladas_0_24': sum(1 for x in R if in_day(x['cal'])),
        'serie_volcables': hourly([x['t25'] for x in P]),
        'serie_calada': hourly([x['cal'] for x in R]),
        'serie_balanza_sl': hourly([x['t22'] for x in P]),
        'cola_playa1': q(R, 'pre', 'cal'),
        'cola_osl': q(P, 't20', 't22'),
        'cola_retenidos_ric': hold,
        'espera_media_pre_calada': round(sum(w_cal) / len(w_cal), 1) if w_cal else None,
        'espera_media_ingsl_balanza': round(sum(w_osl) / len(w_osl), 1) if w_osl else None,
        'pendientes_a_las_24': {
            'playa1': sum(1 for x in R if x['pre'] <= 1440 < x['cal']),
            'osl_y_puerto': sum(1 for x in P if x['t20'] <= 1440 < x['t25']),
        },
    }


def mando(sim, m):
    """Qué recurso manda por bloque de 4 h: el saturado (≥95 % ocupado) con cola adelante."""
    out = []
    for h0 in range(0, 24, 4):
        hs = range(h0, h0 + 4)
        u_cal = sum(sim.busy_min['calada'][h] for h in hs) / 240
        cap_v = sum(len(sim.open_volcables(float(m))) for m in range(h0 * 60, (h0 + 4) * 60)) or 1
        u_vol = sum(sim.busy_min['volcables'][h] for h in hs) / cap_v
        u_bal = sum(sim.busy_min['balanza'][h] for h in hs) / 240
        cola_p1 = max(m['cola_playa1'][h] for h in hs)
        cola_osl = max(m['cola_osl'][h] for h in hs)
        if u_vol >= 0.95 and cola_osl > 0:
            quien = 'volcables SL'
        elif u_bal >= 0.95 and cola_osl > 0:
            quien = 'balanza ingreso SL'
        elif cola_p1 > 0 and m['serie_calada'][h0] >= 0:
            quien = 'calada RIC'
        else:
            quien = 'llegadas (sin cola)'
        out.append({'bloque': f'{h0:02d}-{h0 + 4:02d}', 'manda': quien, 'uso_calada': round(u_cal, 2),
                    'uso_balanza_sl': round(u_bal, 2), 'uso_volcables': round(u_vol, 2),
                    'cola_playa1_max': cola_p1, 'cola_osl_max': cola_osl})
    return out


def compare(real, sim):
    def err(a, b):
        return round(sum(abs(x - y) for x, y in zip(a, b)) / len(a), 1)
    pct = lambda s, r: round(100 * (s - r) / r, 1) if r else None
    c = {
        'descargas_real': real['descargas_volcables_0_24'], 'descargas_sim': sim['descargas_volcables_0_24'],
        'descargas_dif_pct': pct(sim['descargas_volcables_0_24'], real['descargas_volcables_0_24']),
        'error_medio_hora_volcables': err(real['serie_volcables'], sim['serie_volcables']),
        'error_medio_hora_calada': err(real['serie_calada'], sim['serie_calada']),
        'cola_playa1_cada_2h': [(h, real['cola_playa1'][h], sim['cola_playa1'][h]) for h in range(0, 24, 2)],
        'cola_osl_cada_2h': [(h, real['cola_osl'][h], sim['cola_osl'][h]) for h in range(0, 24, 2)],
        'error_medio_cola_playa1_2h': err(real['cola_playa1'][::2], sim['cola_playa1'][::2]),
        'error_medio_cola_osl_2h': err(real['cola_osl'][::2], sim['cola_osl'][::2]),
        'espera_cal_real': real['espera_media_pre_calada'], 'espera_cal_sim': sim['espera_media_pre_calada'],
        'espera_cal_dif_pct': pct(sim['espera_media_pre_calada'], real['espera_media_pre_calada']),
        'espera_osl_real': real['espera_media_ingsl_balanza'], 'espera_osl_sim': sim['espera_media_ingsl_balanza'],
        'espera_osl_dif_pct': pct(sim['espera_media_ingsl_balanza'], real['espera_media_ingsl_balanza']),
    }
    c['acepta'] = {
        'descargas_5pct': abs(c['descargas_dif_pct']) <= 5,
        'error_hora_4': c['error_medio_hora_volcables'] <= 4,
        'espera_cal_15pct': abs(c['espera_cal_dif_pct']) <= 15,
        'espera_osl_15pct': abs(c['espera_osl_dif_pct']) <= 15,
    }
    return c


# ───────────────────────────── escenarios ─────────────────────────────

def escenario(nombre, cal_cap, prm):
    cal, p = dict(cal_cap), dict(prm)
    if 'A' in nombre:   # llenar la madrugada: 2 caladores a ritmo pleno de 00 a 08 h, sin el hueco de la hora 7
        for h in range(0, 8):
            cal[h] = 60.0
    if 'B' in nombre:   # soltar desde Ricardone solo si Playa OSL (+ en viaje) tiene menos de N
        p['liberar_si_osl_menor'] = p.get('N_B', 80)
    if 'C' in nombre:   # parada de las 06:30 escalonada: de a un volcable, 45 min cada uno
        s0, dur, vs = p['paradas'][0]
        p['paradas'] = [[s0 + k * dur, dur, [v]] for k, v in enumerate(vs)] + p['paradas'][1:]
    return cal, p


def run(day, nombre='base', prm=None, verbose=True):
    prm = dict(BASE, **(prm or {}))
    d, ric, port = load_day(day)
    real = metrics(ric, port)
    cal_cap, volc_cap = calibrate(ric, port, prm)
    act = active_volcables(d)
    sat_v = {h for h in hours() if volc_cap.get(h) != prm['volc_nominal']}
    vact = lambda h: max(2, len(act.get(h, ()))) if h in sat_v else 5
    cal_s, prm_s = escenario(nombre, cal_cap, prm) if nombre != 'base' else (cal_cap, prm)
    if 'P' in nombre:   # sensibilidad: puerto de 00 a 08 h al ritmo de día (5 volcables, 30/h)
        volc_cap = dict(volc_cap)
        for h in range(0, 8):
            volc_cap[h] = max(volc_cap[h], 30.0)
        vact0 = vact
        vact = lambda h: 5 if 0 <= h < 8 else vact0(h)
    sim = Sim(ric, port, prm_s, cal_s, volc_cap, vact).run()
    m = metrics(ric, port, sim.out)
    res = {'dia': day, 'escenario': nombre, 'parametros': prm_s,
           'cal_cap': {h: round(cal_s[h], 1) for h in hours()},
           'volc_cap': {h: round(volc_cap[h], 1) for h in hours()},
           'volcables_en_uso': {h: vact(h) for h in hours()},
           'real': real, 'sim': m, 'calibracion': compare(real, m), 'mando': mando(sim, m),
           'n_camiones_calada': len(ric), 'n_visitas_puerto': len(port),
           'imputados': {'calada': sum(1 for r in ric if r['imp_cal']), 'preingreso': sum(1 for r in ric if r.get('imp_pre')),
                         'ingreso_sl': sum(1 for p in port if p.get('imp_t20')),
                         'volcable': sum(1 for p in port if not p['real25'])},
           'trayectorias': [[r['plate'], r['dest'], sim.out.get(('R', r['id']), {}).get('pre'),
                             sim.out.get(('R', r['id']), {}).get('cal'),
                             (sim.out.get(('P', id(r['pass'])), {}) if r['pass'] else {}).get('t25')] for r in ric]}
    if verbose:
        report(res)
    res['_x'] = (d, ric, port, sim.out)
    return res


# ───────────────────────────── trayectorias para el simulador visual ─────────────────────────────

ESCENARIOS = {
    'base': ('Día real (motor)', 'El motor reproduce el día con las llegadas y las capacidades medidas.'),
    'A': ('Calada plena de madrugada', '2 caladores a 60 camiones por hora de 00 a 08 h, sin el hueco del cambio de turno.'),
    'AB': ('Calada plena + soltar según OSL', 'Como A, pero Ricardone suelta un camión calado solo si Playa OSL y la ruta tienen menos de {N}.'),
    'AC': ('Calada plena + parada escalonada', 'Como A, y la parada de las 06:30 de los volcables del puerto se hace de a uno (45 min cada uno) en vez de los 5 juntos.'),
    'P': ('Puerto de noche a ritmo de día', 'De 00 a 08 h los 5 volcables del puerto rinden como de día: 30 camiones por hora en vez de 15 a 19.'),
    'AP': ('Calada plena + puerto de noche', 'A y P juntos: calada a 60 por hora y puerto a ritmo de día entre las 00 y las 08 h.'),
}


def sim_trucks(d, ric, port, out):
    """Recorridos simulados con el formato de days/<día>.json. Las lecturas entre dos hitos del motor
    (calada, ingreso SL, balanza, volcable) se corren junto con el hito siguiente: la espera queda en la playa."""
    by_r = {r['id']: r for r in ric}
    by_p = defaultdict(list)
    for p in port:
        by_p[p['id']].append(p)
    trucks = []
    for i, t in enumerate(d['trucks']):
        path = [list(x) for x in t[3]]
        anchors = []  # (índice en el recorrido o None, nodo, hora real, hora simulada, device)
        r = by_r.get(i)
        if r is not None and ('R', i) in out:
            j = next((k for k, x in enumerate(path) if x[0] == N_CAL), None)
            anchors.append((j, N_CAL, r['cal'], out[('R', i)]['cal'], path[j][2] if j is not None else -1))
        for p in by_p.get(i, []):
            o = out.get(('P', id(p)))
            if not o or o.get('fixed'):
                continue
            vis = {path[k][0]: k for k in reversed(p['vidx'])}
            for node, fld in ((N_ING_SL, 't20'), (N_BAL_SL, 't22'), (N_VOLC, 't25')):
                if node == N_VOLC and 'srv' in o:
                    dev = 11 + o['srv']
                else:
                    dev = path[vis[node]][2] if node in vis else -1
                anchors.append((vis.get(node), node, p[fld], o.get(fld), dev))
        if not anchors:
            trucks.append(t)
            continue
        anchors.sort(key=lambda a: a[2])
        idx_anchor = {a[0]: a for a in anchors if a[0] is not None}
        reads = []
        for k, (n, m, dv) in enumerate(path):
            if k in idx_anchor:
                a = idx_anchor[k]
                if a[3] is not None:
                    reads.append([n, round(a[3], 1), a[4]])
                continue
            prev = [a for a in anchors if a[2] <= m]
            nxt = [a for a in anchors if a[2] > m]
            if any(a[3] is None for a in prev):
                continue  # el motor no llegó a ese hito: se corta el recorrido
            if not prev:
                # antes del primer hito: la llegada es la real (el motor no la mueve)
                new = min(m, nxt[0][3] - 0.1) if nxt and nxt[0][3] is not None else m
            elif nxt and nxt[0][3] is not None:
                new = max(nxt[0][3] - (nxt[0][2] - m), prev[-1][3] + 0.5)
                new = min(new, nxt[0][3] - 0.1)
            elif prev:
                new = prev[-1][3] + (m - prev[-1][2])
            else:
                new = m
            reads.append([n, round(new, 1), dv])
        for a in anchors:   # hitos imputados (sin lectura real): se agregan para que se vean
            if a[0] is None and a[3] is not None:
                reads.append([a[1], round(a[3], 1), a[4]])
        reads.sort(key=lambda x: x[1])
        trucks.append([t[0], t[1], t[2], reads, t[4], t[5], t[6]])
    return trucks


def export_visual(day, res, base):
    """public/simulador/escenarios/<día>_<escenario>.json para el modo «Corregir el día» de la repetición."""
    d, ric, port, out = res['_x']
    name = res['escenario']
    titulo, cambio = ESCENARIOS.get(name, (name, ''))
    cambio = cambio.format(N=res['parametros'].get('liberar_si_osl_menor') or '')
    sb, sm = base['sim'], res['sim']
    manda = Counter(b['manda'] for b in res['mando']).most_common(1)[0][0]
    resumen = {
        'descargas': sm['descargas_volcables_0_24'], 'descargas_base': sb['descargas_volcables_0_24'],
        'descargas_real': res['real']['descargas_volcables_0_24'],
        'de_mas': sm['descargas_volcables_0_24'] - sb['descargas_volcables_0_24'],
        'espera_playa1': [sb['espera_media_pre_calada'], sm['espera_media_pre_calada']],
        'espera_osl': [sb['espera_media_ingsl_balanza'], sm['espera_media_ingsl_balanza']],
        'osl_max': [max(sb['cola_osl']), max(sm['cola_osl'])],
        'playa1_max': [max(sb['cola_playa1']), max(sm['cola_playa1'])],
        'retenidos_max': max(sm['cola_retenidos_ric'] or [0]),
        'manda': manda, 'mando': res['mando'],
    }
    lect = []
    if name == 'base':
        lect.append(f'El motor reproduce el día: {resumen["descargas"]} descargas en el puerto contra {resumen["descargas_real"]} reales.')
        lect.append(f'Manda: {manda} todo el día; Playa OSL nunca se vacía.')
    else:
        dm = resumen['de_mas']
        lect.append(f'Se descargan {dm} camiones más en el día.' if dm > 0 else
                    'No se descarga ningún camión de más: el puerto ya trabajaba a su máximo.')
        (e1, e2), (o1, o2) = resumen['espera_playa1'], resumen['espera_osl']
        if abs(e2 - e1) >= 15:
            lect.append(f'La espera para calar pasa de {e1:.0f} a {e2:.0f} min.')
        if abs(o2 - o1) >= 15:
            lect.append(f'La espera en Playa OSL pasa de {o1:.0f} a {o2:.0f} min.')
        if resumen['osl_max'][1] > 100:
            lect.append(f'Playa OSL llega a {resumen["osl_max"][1]} camiones, y su capacidad es de 100.')
        if resumen['retenidos_max'] > 30:
            lect.append(f'Quedan hasta {resumen["retenidos_max"]} camiones calados esperando en Ricardone, y Playa demorado tiene 30 lugares.')
        if dm > 0:
            lect.append('Es el techo con las llegadas de ese día: son los camiones que a las 24 h seguían en el puerto.')
        lect.append(f'Manda: {manda}.')
    doc = {'day': day, 'escenario': name, 'titulo': titulo, 'cambio': cambio, 'lectura': lect, 'resumen': resumen,
           'trucks': sim_trucks(d, ric, port, out)}
    dst = ROOT / 'public/simulador/escenarios'
    dst.mkdir(parents=True, exist_ok=True)
    (dst / f'{day}_{name}.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if name == 'base':
        export_motor_inputs(day, res, dst)


def export_motor_inputs(day, res, dst):
    """Entradas del motor para la mesa de control (el mismo motor, en JS, dentro de la repetición):
    llegadas e hitos reales por camión y los perfiles calibrados por hora, de −6 a 26 h."""
    d, ric, port, _ = res['_x']
    hs = list(hours())
    calles = defaultdict(set)   # calles de calada con lecturas en cada hora (RicCal01..06 = device 0..5)
    for t in d['trucks']:
        for n, m, dv in t[3]:
            if n == N_CAL and 0 <= dv <= 5:
                calles[int(m // 60)].add(dv)
    pidx = {id(p): k for k, p in enumerate(port)}
    ridx = {id(r): k for k, r in enumerate(ric)}
    rnd = lambda v: None if v is None else round(v, 1)
    R = []
    for r in ric:
        path = d['trucks'][r['id']][3]
        j = next((k for k, x in enumerate(path) if x[0] == N_CAL), -1)
        R.append([r['id'], rnd(r['pre']), rnd(r['cal']), rnd(r.get('delay')), pidx[id(r['pass'])] if r['pass'] else -1,
                  j, path[j][2] if j >= 0 else -1])
    P = []
    for p in port:
        path = d['trucks'][p['id']][3]
        vis = {path[k][0]: k for k in reversed(p['vidx'])}
        P.append([p['id'], rnd(p['t20']), rnd(p['t22']), rnd(p['t25']), ridx[id(p['ric'])] if p['ric'] is not None else -1,
                  vis.get(N_ING_SL, -1), vis.get(N_BAL_SL, -1), vis.get(N_VOLC, -1)])
    prm = res['parametros']
    doc = {'day': day, 'T0': T0, 'T_END': T_END, 'h0': hs[0],
           'cal': [res['cal_cap'][h] for h in hs], 'volc': [res['volc_cap'][h] for h in hs],
           'vact': [res['volcables_en_uso'][h] for h in hs],
           'calles': [max(1, len(calles.get(h, ()))) for h in hs],
           'prm': {'bal_min': prm['bal_min'], 'bal_limpieza': prm['bal_limpieza'], 'traslado': prm['traslado_bal_volc'],
                   'gate_extra': prm['gate_extra_por_volc'], 'paradas': prm['paradas']},
           'real': {'descargas': res['real']['descargas_volcables_0_24']},
           'calibracion': {k: res['calibracion'][k] for k in ('descargas_real', 'descargas_sim', 'descargas_dif_pct',
                                                              'error_medio_hora_volcables', 'espera_cal_dif_pct',
                                                              'espera_osl_dif_pct', 'acepta')},
           'ric': R, 'port': P}
    (dst / f'{day}_motor.json').write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def report(res):
    c, s, r = res['calibracion'], res['sim'], res['real']
    print(f"\n=== {res['dia']} · {res['escenario']} ===")
    print(f"camiones con calada {res['n_camiones_calada']} · visitas al puerto {res['n_visitas_puerto']} · imputados {res['imputados']}")
    print('cal_cap -6..23:', [res['cal_cap'][h] for h in range(-6, 24)])
    print('volc_cap 0-23:', [res['volc_cap'][h] for h in range(24)])
    print(f"descargas 0-24: real {c['descargas_real']} · sim {c['descargas_sim']} ({c['descargas_dif_pct']:+} %)")
    print(f"volcables/h real: {r['serie_volcables']}")
    print(f"volcables/h sim : {s['serie_volcables']}  error medio {c['error_medio_hora_volcables']}/h")
    print(f"calada/h real   : {r['serie_calada']}")
    print(f"calada/h sim    : {s['serie_calada']}")
    print('cola Playa 1 (h, real, sim):', c['cola_playa1_cada_2h'])
    print('cola OSL     (h, real, sim):', c['cola_osl_cada_2h'])
    if any(s['cola_retenidos_ric']):
        print('retenidos en RIC:', s['cola_retenidos_ric'][::2])
    print(f"espera Preingreso→Calada: real {c['espera_cal_real']} · sim {c['espera_cal_sim']} ({c['espera_cal_dif_pct']:+} %)")
    print(f"espera Ingreso SL→Balanza: real {c['espera_osl_real']} · sim {c['espera_osl_sim']} ({c['espera_osl_dif_pct']:+} %)")
    print('pendientes a las 24 h:', s['pendientes_a_las_24'], '(real', r['pendientes_a_las_24'], ')')
    print('acepta:', c['acepta'])
    for b in res['mando']:
        print('  ', b)


def main():
    import sys
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('days', nargs='+', help="días AAAA-MM-DD, o 'todos': los días con puerto y ≥ 300 camiones desde el 31/07")
    ap.add_argument('--escenario', default='base')
    ap.add_argument('--todos', action='store_true')
    ap.add_argument('--N', type=int, default=80, help='palanca B: tope de Playa OSL + en viaje')
    ap.add_argument('--visual', action='store_true', help='exporta public/simulador/escenarios/<día>_motor.json para la consola')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.days == ['todos']:
        # antes del 31/07 el puerto tenía menos cámaras; el 01/09 tiene un hueco en el export de cámaras
        idx = json.loads((DAYS.parent / 'index.json').read_text(encoding='utf-8'))
        a.days = [x['day'] for x in idx if x.get('puerto') and x.get('camiones', 0) >= 300 and x['day'] >= '2026-07-31' and x['day'] != '2026-09-01']
    # la consola solo usa las entradas del motor (base); los escenarios A…AP son del análisis del 29/08
    names = ['base'] if a.visual and not a.todos else ['base', 'A', 'AB', 'AC', 'P', 'AP'] if a.todos else [a.escenario]
    for day in a.days:
        try:
            run_day(day, names, a)
        except Exception as e:  # un día con datos raros no corta el resto
            print(f'{day}: no se pudo calibrar ({e})')


def run_day(day, names, a):
    base = None
    for n in names:
        res = run(day, n, {'N_B': a.N}, verbose=not a.visual)
        if n == 'base':
            base = res
        if a.visual:
            export_visual(day, res, base)
        elif base:
            res['contra_base'] = {
                'descargas_de_mas': res['sim']['descargas_volcables_0_24'] - base['sim']['descargas_volcables_0_24'],
                'espera_cal': [base['sim']['espera_media_pre_calada'], res['sim']['espera_media_pre_calada']],
                'espera_osl': [base['sim']['espera_media_ingsl_balanza'], res['sim']['espera_media_ingsl_balanza']],
                'osl_max': max(res['sim']['cola_osl']), 'osl_pasa_100': max(res['sim']['cola_osl']) > 100,
            }
            print('contra base:', res['contra_base'])
        res.pop('_x', None)
        f = OUT / f"{day}_{n}.json"
        f.write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
        print('→', f.relative_to(ROOT))


if __name__ == '__main__':
    main()
