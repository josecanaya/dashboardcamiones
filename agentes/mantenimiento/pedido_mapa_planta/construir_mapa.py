"""Construye mapa_planta_mantenimiento.json: equipos del EAM que pueden frenar la descarga de camiones.

Entradas (todas locales, sólo lectura):
  - maestro de activos del ETL EAM→Bimtrazer (tables/activos.csv)
  - trabajo/ot_corpus.csv: todas las OT de PR y TE de los exports del EAM (armado desde data/input y data/kpi)
  - trabajo/ifc_elementos.json: elementos de los IFC con sus etiquetas BTZ (trabajo/ifc_extraer.py)
  - circuito_descarga_nodos.json y grafo_mantenimiento_borrador.json (del pedido)

El grafo de flujo se escribe a mano abajo, vínculo por vínculo, con su evidencia. El efecto de cada equipo
sobre cada plataforma NO se escribe a mano: se calcula sacando el equipo del grafo y viendo si el grano todavía
llega a algún destino (detiene) o sí (reduce_capacidad).

Uso:  python construir_mapa.py
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

import pandas as pd

AQUI = Path(__file__).resolve().parent
TRABAJO = AQUI / 'trabajo'
MAESTRO = Path(r'C:/Users/Usuario/Desktop/Jose/maintence/Agente_EAM_Bimtrazer_v2/eam_bimtrazer/tables/activos.csv')
EAM_EXPORT = 'EAM_OT_20260929_1245_132785352.csv (corte 29/09/2026 12:45) + exports previos del 14/09 al 28/09/2026'
IFC_FILES = {'PR': 'NVA_Ricardone.ifc', 'TE': 'NVA_puerto22.ifc'}
IFC_DESC = ['NVA_Ricardone.ifc (FILE_NAME RIC_labels.ifc, Revit 2026, IFC2X3, 26/08/2026)',
            'NVA_puerto22.ifc (FILE_NAME NVA_puerto22.ifc, Revit 2026, IFC2X3, 24/09/2026)']

sys.stdout.reconfigure(encoding='utf-8')

# ----------------------------------------------------------------------------- datos
M = pd.read_csv(MAESTRO, dtype=str, encoding='utf-8-sig', keep_default_na=False)
M['codigo_activo'] = M.codigo_activo.str.strip()
MA = {r.codigo_activo: r for r in M.itertuples()}
OT = pd.read_csv(TRABAJO / 'ot_corpus.csv', dtype=str, encoding='utf-8-sig', keep_default_na=False)
OT['Nro_Activo'] = OT.Nro_Activo.str.strip()
OTX = {r.Pedido_Trabajo: r for r in OT.itertuples()}
IFC = json.loads((TRABAJO / 'ifc_elementos.json').read_text(encoding='utf-8'))
CIRC = json.loads((AQUI / 'circuito_descarga_nodos.json').read_text(encoding='utf-8'))
NODOS = {n['id'] for n in CIRC['nodes']}
PLANTA = {'PR': 'Ricardone', 'TE': 'Terminal Embarque'}
NIV = {'alta': 3, 'media': 2, 'baja': 1}
INV = {3: 'alta', 2: 'media', 1: 'baja'}


def chk(code):
    if code not in MA:
        raise SystemExit(f'código inexistente en el maestro: {code!r}')
    return code


def desc(code):
    return MA[chk(code)].descripcion_activo.strip()


def like(rx):
    """Códigos del maestro que matchean un regex (anclado al inicio)."""
    r = re.compile(rx)
    return sorted(c for c in MA if r.match(c))


# ----------------------------------------------------------------------------- evidencia
def ev_m(*codes, extra=''):
    return {'fuente': 'maestro', 'detalle': '; '.join(f'{c}: «{desc(c)}»' for c in codes) + extra}


def ev_ot(ots, detalle=None):
    ots = [ots] if isinstance(ots, str) else list(ots)
    for o in ots:
        if o not in OTX:
            raise SystemExit(f'OT inexistente en el corpus: {o}')
    if detalle is None:
        detalle = ' | '.join(f'{o} ({OTX[o].Nro_Activo}, {OTX[o].Fecha_Ini_Prog[:10]}): «{OTX[o].Descripcion.strip()[:110]}»'
                             for o in ots)
    return {'fuente': 'ot', 'ot': ots, 'detalle': detalle}


def ev_n(detalle):
    return {'fuente': 'nombre', 'detalle': detalle}


def ev_c(caso, detalle):
    return {'fuente': 'caso_descarga', 'caso': caso, 'detalle': detalle}


def ev_com(detalle):
    return {'fuente': 'comite', 'detalle': 'agentes/conocimiento/HISTORICO_COMITES.md: ' + detalle}


# ----------------------------------------------------------------------------- flujo de grano
FLOW = []           # vínculos desde → hasta
SINKS = set()       # destinos finales (celda, silo, proceso)
EXTERNOS = {}       # nodo → destino externo al maestro (p. ej. "Planta P10000")


def E(desde, hasta, conf, evid, via=(), productos=None, alternativo=False, nota=None):
    for c in (desde, hasta, *via):
        chk(c)
    FLOW.append({'desde': desde, 'hasta': hasta, 'via': list(via), 'productos': productos or [],
                 'alternativo': alternativo, 'confianza': conf, 'evidencia': evid,
                 **({'nota': nota} if nota else {})})


def EV(desde, hasta, via, conf='media', productos=None, evid_extra=(), **kw):
    """Vínculo cuya evidencia es la descripción de las válvulas del maestro («VALVULA X DESCARGA DE A A B»)."""
    E(desde, hasta, conf, [ev_m(*via)] + list(evid_extra), via=via, productos=productos, **kw)


# ---- Terminal Embarque: volcables → cintas de recepción (válvulas bajo cada plataforma)
for pv in ('PV1', 'PV2'):
    EV(f'TE-DDC-PTV-{pv}', 'TE-TNL-CNT-CR1', [f'TE-DDC-VLV-{pv}{x}' for x in 'ABC'])
    EV(f'TE-DDC-PTV-{pv}', 'TE-TNL-CNT-CR2', [f'TE-DDC-VLV-{pv}{x}' for x in 'DEF'])
for pv in ('PV3', 'PV4'):
    EV(f'TE-DDC-PTV-{pv}', 'TE-TNL-CNT-CR1', [f'TE-DDC-VLV-{pv}{x}' for x in 'ABC'])
    EV(f'TE-DDC-PTV-{pv}', 'TE-TNL-CNT-CR0', [f'TE-DDC-VLV-{pv}{x}' for x in 'DEF'])
# PV5: a la secadora, con desvío a CT1/CT2 por el redler 32
EV('TE-DDC-PTV-PV5', 'TE-SEC-RDL-R31', ['TE-DDC-VLV-PV5A', 'TE-DDC-VLV-PV5B', 'TE-DDC-VLV-PV5C'])
E('TE-SEC-RDL-R31', 'TE-SEC-NOR-EL7', 'media', [ev_m('TE-SEC-RDL-R31', 'TE-SEC-NOR-EL7')])
E('TE-SEC-NOR-EL7', 'TE-SEC-RDL-R33', 'media', [ev_m('TE-SEC-RDL-R33')])
E('TE-SEC-RDL-R33', 'TE-SEC-DST-DESTERRADOR', 'baja', [ev_m('TE-SEC-VLV-V5'), ev_n('el desterrador está sobre R33: la V5 lo puentea')])
E('TE-SEC-DST-DESTERRADOR', 'TE-SEC-SEC-SEKW (SECADORA)', 'baja', [ev_n('desterrador antes de la secadora (inferido de V5 «BY PASS DE DESTERRADOR R33»)')])
EV('TE-SEC-RDL-R33', 'TE-SEC-SEC-SEKW (SECADORA)', ['TE-SEC-VLV-V5'], alternativo=True,
   evid_extra=[ev_m('TE-SEC-RDL-R33')])
E('TE-SEC-SEC-SEKW (SECADORA)', 'TE-SEC-RDL-R34', 'media', [ev_m('TE-SEC-RDL-R34')])
E('TE-SEC-RDL-R34', 'TE-SEC-NOR-EL8', 'media', [ev_m('TE-SEC-RDL-R34', 'TE-SEC-NOR-EL8')])
E('TE-SEC-NOR-EL8', 'TE-ALM-CNT-CSS4', 'baja', [ev_m('TE-SEC-VLV-V6'), ev_n('la V6 está en el sector secadora; se asume que descarga el EL8')],
  via=['TE-SEC-VLV-V6'])
for dst in ('TE-ALM-CNT-CSSDIARIO', 'TE-ALM-CNT-CSC3', 'TE-ALM-CNT-CSC3S'):
    E('TE-SEC-NOR-EL8', dst, 'baja', [ev_m('TE-SEC-VLV-V8'), ev_n('la V8 está en el sector secadora; se asume que descarga el EL8')],
      via=['TE-SEC-VLV-V8'])
EV('TE-SEC-NOR-EL7', 'TE-SEC-RDL-R32', ['TE-SEC-VLV-V3', 'TE-SEC-VLV-V4'], alternativo=True,
   evid_extra=[ev_m('TE-SEC-RDL-R32'), ev_ot('PSL-89040')])
EV('TE-SEC-RDL-R32', 'TE-TDM-CNT-CT1', ['TE-SEC-VLV-V1'], alternativo=True)
EV('TE-SEC-RDL-R32', 'TE-TDM-CNT-CT2', ['TE-SEC-VLV-V2'], alternativo=True)
E('TE-TDM-CNT-CT1', 'TE-DDC-PTV-PV5', 'baja',
  [ev_m('TE-TDM-VLV-P38'), ev_ot(['PSL-92392', 'PSL-81838'])], via=['TE-TDM-VLV-P38'],
  nota='Sentido dudoso: el maestro dice «TOLVA PV5 A CT1» y dos OT dicen que CT1 descarga en la tolva de PV5 '
       '(«se va toda la mercadería para la PV5»). Mientras CT1 descarga ahí, PV5 no recibe camiones.')
# cintas de recepción → elevadores de la torre
EV('TE-TNL-CNT-CR0', 'TE-TDM-NOR-EL1', ['TE-ALM-VLV-P31'])
EV('TE-TNL-CNT-CR0', 'TE-TDM-NOR-EL2', ['TE-ALM-VLV-P31'])
EV('TE-TNL-CNT-CR0', 'TE-TDM-NOR-EL3', ['TE-ALM-VLV-P32'])
EV('TE-TNL-CNT-CR1', 'TE-TDM-NOR-EL1', ['TE-ALM-VLV-P81', 'TE-TDM-VLV-P81'])
EV('TE-TNL-CNT-CR1', 'TE-TDM-NOR-EL2', ['TE-ALM-VLV-P82', 'TE-TDM-VLV-P82'], evid_extra=[ev_ot('PSL-81332')])
EV('TE-TNL-CNT-CR2', 'TE-TDM-NOR-EL1', ['TE-ALM-VLV-P51', 'TE-TDM-VLV-P51'])
EV('TE-TNL-CNT-CR2', 'TE-TDM-NOR-EL2', ['TE-ALM-VLV-P52', 'TE-TDM-VLV-P52'])
# alimentaciones de las CR que no vienen de camiones (vagones, silo 4)
EV('TE-TNL-CNT-CR4', 'TE-TNL-CNT-CR2', ['TE-ALM-VLV-P17', 'TE-TNL-VLV-VDP17'])
EV('TE-TNL-CNT-CR4', 'TE-TNL-CNT-CR1', ['TE-ALM-VLV-P18', 'TE-TNL-VLV-VDP18'])
EV('TE-TNL-CNT-CR6', 'TE-TNL-CNT-CR4', ['TE-TNL-VLV-P29'])
EV('TE-TNL-CNT-CR6', 'TE-TNL-CNT-CR3', ['TE-TNL-VLV-P30'])
EV('TE-DDV-NOR-EDDVAG', 'TE-TNL-CNT-CR6', ['TE-DDV-VLV-VAGONES/CR6'], evid_extra=[ev_ot('PSL-83414')])
EV('TE-TNL-CNT-CBS4', 'TE-ALM-NOR-EL5', ['TE-TNL-VLV-P27'])
EV('TE-TNL-CNT-CBS4', 'TE-TNL-CNT-CR3', ['TE-TNL-VLV-P28'])
# elevadores → distribución en la torre
EV('TE-TDM-NOR-EL2', 'TE-TDM-CNT-C01', ['TE-TDM-VLV-Q10', 'TE-TDM-VLV-Q12'], evid_extra=[ev_ot('PSL-87837')])
EV('TE-TDM-NOR-EL2', 'TE-TDM-LGC-PENDULARES TDM', ['TE-TDM-VLV-Q11'], conf='baja',
   evid_extra=[ev_ot('PSL-87837'), ev_n('«PENDULAR»: se toma el conjunto TE-TDM-LGC-PENDULARES TDM (embarque directo)')])
EV('TE-TDM-NOR-EL2', 'TE-TDM-CNT-CT2', ['TE-TDM-VLV-Q13'], evid_extra=[ev_ot('PSL-80281')])
EV('TE-TDM-NOR-EL3', 'TE-TDM-CNT-C01', ['TE-TDM-VLV-Q08'])
EV('TE-TDM-NOR-EL3', 'TE-TDM-CNT-CT2', ['TE-TDM-VLV-Q09', 'TE-TDM-VLV-Q45', 'TE-TDM-VLV-Q07'], evid_extra=[ev_ot('PSL-85821')])
EV('TE-TDM-NOR-EL3', 'TE-TDM-LGC-PENDULARES TDM', ['TE-TDM-VLV-Q9 - (1)', 'TE-TDM-VLV-Q45'], conf='baja',
   evid_extra=[ev_ot('PSL-85821')])
EV('TE-TDM-NOR-EL4', 'TE-ALM-CNT-CSC1', ['TE-TDM-VLV-Q35'], evid_extra=[ev_ot('PSL-75680')])
EV('TE-TDM-NOR-EL4', 'TE-ALM-CNT-CSC2', ['TE-TDM-VLV-Q36', 'TE-TDM-VLV-Q38', 'TE-TDM-VLV-Q39A'])
EV('TE-TDM-NOR-EL4', 'TE-TDM-CNT-CT1', ['TE-TDM-VLV-Q38', 'TE-TDM-VLV-Q39'])
EV('TE-TDM-NOR-EL4', 'TE-TDM-CNT-CT2', ['TE-TDM-VLV-Q36', 'TE-TDM-VLV-Q37'])
EV('TE-TDM-BLN-BALANZA EMB. B3', 'TE-TDM-NOR-EL4', ['TE-TDM-VLV-P20'], evid_extra=[ev_m('TE-TDM-VLV-ABE3')])
EV('TE-TDM-BLN-BALANZA EMB. B3', 'TE-TDM-NOR-EL3', ['TE-TDM-VLV-P21', 'TE-TDM-VLV-P75'])
# torre → almacenaje
EV('TE-TDM-CNT-C01', 'TE-ALM-CNT-C7 (C4C7)', ['TE-TE6-VLV-VG27'])
EV('TE-TE6-NOR-EL6', 'TE-ALM-CNT-C7 (C4C7)', ['TE-TE6-VLV-VG22'])
EV('TE-TE6-NOR-EL6', 'TE-ALM-CNT-C6 (C6CC4)', ['TE-TE6-VLV-VG23'])
EV('TE-TE6-NOR-EL6', 'TE-TDM-CNT-C05', ['TE-TE6-VLV-VG25', 'TE-TE6-VLV-VG26'])
EV('TE-ALM-CNT-C6 (C6CC4)', 'TE-ALM-CNT-C8 (C8SC4)', ['TE-ALM-VLV-VG17'])
EV('TE-ALM-CNT-C6 (C6CC4)', 'TE-ALM-CNT-C9 (C9SC4)', ['TE-ALM-VLV-VG18'])
EV('TE-ALM-CNT-C7 (C4C7)', 'TE-ALM-CNT-C8 (C8SC4)', ['TE-ALM-VLV-VG19'])
EV('TE-ALM-CNT-C7 (C4C7)', 'TE-ALM-CNT-C9 (C9SC4)', ['TE-ALM-VLV-VG20'])
E('TE-ALM-CNT-C8 (C8SC4)', 'TE-ALM-CLD-CELDA 4', 'media', [ev_m('TE-ALM-CNT-C8 (C8SC4)', 'TE-ALM-CRR-CTC8')], via=['TE-ALM-CRR-CTC8'])
E('TE-ALM-CNT-C9 (C9SC4)', 'TE-ALM-CLD-CELDA 4', 'media', [ev_m('TE-ALM-CNT-C9 (C9SC4)', 'TE-ALM-CRR-CTC9')], via=['TE-ALM-CRR-CTC9'])
EV('TE-TDM-CNT-CT1', 'TE-ALM-CNT-CSS4', ['TE-TDM-VLV-P39'], nota='La P39 dice «CT1 A CSS4S» (sobre silo 4 superior); el maestro sólo tiene CSS4 (inferior).')
EV('TE-TDM-CNT-CT2', 'TE-ALM-CNT-CSS4', ['TE-TDM-VLV-Q40', 'TE-TDM-VLV-Q41'], evid_extra=[ev_ot('PSL-81971')])
EV('TE-TDM-CNT-CT1', 'TE-ALM-CNT-CSC3S', ['TE-TDM-VLV-Q43'], evid_extra=[ev_ot('PSL-92495')])
EV('TE-TDM-CNT-CT2', 'TE-ALM-CNT-CSC3S', ['TE-TDM-VLV-Q43'], evid_extra=[ev_ot('PSL-92495')])
EV('TE-ALM-CNT-CSC3S', 'TE-ALM-CNT-CSC3', ['TE-TDM-VLV-Q44', 'TE-TDM-VLV-P41'], conf='baja')
EV('TE-ALM-CNT-CSC3S', 'TE-ALM-CNT-CSSDIARIO', ['TE-TDM-VLV-Q44', 'TE-TDM-VLV-P42'])
E('TE-ALM-CNT-CSC3', 'TE-ALM-CLD-CELDA 3', 'media', [ev_m('TE-ALM-CNT-CSC3', 'TE-ALM-CRR-CTCSC3')], via=['TE-ALM-CRR-CTCSC3'])
E('TE-ALM-CNT-CSC3S', 'TE-ALM-CLD-CELDA 3', 'media', [ev_m('TE-ALM-CNT-CSC3S')])
EV('TE-ALM-CNT-CSS4', 'TE-ALM-SLO-SILO 4', ['TE-ALM-VLV-P54', 'TE-ALM-VLV-Q54'])
EV('TE-ALM-CNT-CSS4', 'TE-ALM-CNT-CSS5', ['TE-ALM-VLV-P53', 'TE-ALM-VLV-Q55'])
EV('TE-ALM-CNT-CSS4', 'TE-ALM-CNT-CSS6', ['TE-ALM-VLV-P55', 'TE-ALM-VLV-Q53'])
EV('TE-ALM-CNT-CSS4', 'TE-ALM-CNT-CSS7', ['TE-ALM-VLV-P56', 'TE-ALM-VLV-Q56'])
for n in '567':
    E(f'TE-ALM-CNT-CSS{n}', f'TE-ALM-SLO-SILO {n}', 'media', [ev_m(f'TE-ALM-CNT-CSS{n}')])
E('TE-ALM-CNT-CSC1', 'TE-ALM-CLD-CELDA 1', 'media', [ev_m('TE-ALM-CNT-CSC1', 'TE-ALM-CRR-CTCSC1')], via=['TE-ALM-CRR-CTCSC1'])
E('TE-ALM-CNT-CSC2', 'TE-ALM-CLD-CELDA 2', 'media', [ev_m('TE-ALM-CNT-CSC2', 'TE-ALM-CRR-CTCSC2')], via=['TE-ALM-CRR-CTCSC2'])
EV('TE-TDM-CNT-C05', 'TE-ALM-CNT-CSC2', ['TE-TDM-VLV-Q03'])
EV('TE-TDM-CNT-C05', 'TE-ALM-CNT-CSC1', ['TE-TDM-VLV-Q06'])
E('TE-ALM-NOR-EL5', 'TE-ALM-CNT-CSSDIARIO', 'media', [ev_m('TE-ALM-NOR-EL5')])
# extracción de la Celda 4 (no es recepción; la uso para explicar la parada anual de la cadena)
E('TE-ALM-CNT-C13 (CBC4-13)', 'TE-TE6-NOR-EL9', 'media', [ev_ot(['PSL-89905', 'PSL-91899'])])
E('TE-ALM-CNT-C12 (CBC4-12)', 'TE-ALM-CNT-C11 (C4C11)', 'baja', [ev_n('C12 y C11 están bajo Celda 4; C11 «de carga a noria EL6»')])
E('TE-TNL-CNT-CBC4 C10', 'TE-ALM-CNT-C11 (C4C11)', 'baja', [ev_n('C10 bajo Celda 4; C11 «de carga a noria EL6»')])
E('TE-ALM-CNT-C11 (C4C11)', 'TE-TE6-NOR-EL6', 'media', [ev_m('TE-ALM-CNT-C11 (C4C11)')])
SINKS |= {'TE-ALM-CLD-CELDA 1', 'TE-ALM-CLD-CELDA 2', 'TE-ALM-CLD-CELDA 3', 'TE-ALM-CLD-CELDA 4',
          'TE-ALM-SLO-SILO 4', 'TE-ALM-SLO-SILO 5', 'TE-ALM-SLO-SILO 6', 'TE-ALM-SLO-SILO 7',
          'TE-ALM-CNT-CSSDIARIO', 'TE-TDM-LGC-PENDULARES TDM'}
EXTERNOS.update({'TE-ALM-CNT-CSSDIARIO': 'silo diario / Planta 6000 (no está en el maestro)',
                 'TE-TDM-LGC-PENDULARES TDM': 'embarque directo por pendulares (hipótesis)'})

# ---- Ricardone
G = ['GIRASOL']
S = ['SOJA']
E('PR-PLYMP-PTV-CAM01', 'PR-PLYMP-NOR-N07PTV1', 'media', [ev_m('PR-PLYMP-NOR-N07PTV1')], productos=G)
E('PR-PLYMP-PTV-CAM02', 'PR-PLYMP-NOR-N08PTV2', 'media', [ev_m('PR-PLYMP-NOR-N08PTV2', 'PR-PLYMP-SIS-PLNN08')], productos=G)
E('PR-PLYMP-NOR-N08PTV2', 'PR-PLYMP-CNT-CSG3', 'baja',
  [ev_c('csg3_0629', 'con la CSG-3 rota (OT PSL-91436, 29/06) el Volcable 2 no descargó el 30/06 ni el 01/07; el Volcable 1 sí'),
   ev_ot('PSL-91436'), ev_m('PR-PLYMP-VNT-SAPN-5/6', extra=' (la aspiración es común a N-05, N-06 y CSG-3: están juntas)')],
  productos=G, nota='No hay OT ni descripción que diga que N-08 descarga en CSG-3: se infiere del caso.')
E('PR-PLYMP-CNT-CSG3', 'PR-PLYMP-SCD-CED', 'media', [ev_ot('PSL-79346')], productos=G)
E('PR-PLYMP-NOR-N07PTV1', 'PR-PLYMP-NOR-N04', 'baja',
  [ev_c('secadora_ric_0731', 'con OT en la secadora los volcables 1 y 2 tardan 903–1.324 min contra ~550'),
   ev_n('N-04 es la noria de la secadora: «PRELIMPIADOR NEUMATICO 01 SECADORA DE GRANOS (NORIA 04)»')], productos=G,
  nota='Que el Volcable 1 pase por la secadora es hipótesis.')
E('PR-PLYMP-NOR-N04', 'PR-PLYMP-SCD-CED', 'media',
  [ev_m('PR-PLYMP-PLN-RSG1N', 'PR-PLYMP-PLN-RSG2S', 'PR-PLYMP-CCL-CPLN1N4')], productos=G)
E('PR-PLYMP-SCD-CED', 'PR-PLYMP-BSC-DSC', 'media', [ev_m('PR-PLYMP-BSC-DSC')], productos=G)
E('PR-PLYMP-BSC-DSC', 'PR-PLYMP-RDL-RSG1CRU', 'baja',
  [ev_n('«RSG» = redler secadora de granos (como CSG, SFSG, CPLN…N4); «crucero»'),
   ev_c('cruceros_0909', 'RSG-1 con la cadena desmontada (PSL-94896, 09/09): volcables a 1.100–1.358 min')], productos=G)
E('PR-PLYMP-NOR-N07PTV1', 'PR-PLYMP-RDL-RSG1CRU', 'baja',
  [ev_c('cruceros_0909', 'RSG-1, RCR-2 y CSG-3 con OT el 09/09 y los dos volcables demorados'),
   ev_c('csg3_0629', 'con CSG-3 rota el Volcable 1 siguió descargando: tiene otro camino')], productos=G, alternativo=True)
E('PR-PLYMP-RDL-RSG1CRU', 'PR-PLYMP-RDL-RCRU1', 'baja', [ev_n('RSG-1 «CRUCERO» y RCR-1 «CRUCERO L/ESTE»'), ev_ot('PSL-93680')], productos=G)
E('PR-PLYMP-RDL-RSG1CRU', 'PR-PLYMP-RDL-RCRU2', 'baja', [ev_n('RSG-1 «CRUCERO» y RCR-2 «CRUCERO L/OESTE»'), ev_ot('PSL-93680')], productos=G)
E('PR-PLYMP-RDL-RSG1CRU', 'PR-PLYMP-CNT-CRU2', 'baja',
  [ev_n('cinta crucero 2'), ev_c('secadora_ric_0731', 'OT en cinta crucero 2 entre el 03 y el 06/08 (PSL-93273)')], productos=G)
E('PR-PLYMP-RDL-RCRU2', 'PR-PLYMP-SLO-DMP05', 'media', [ev_ot('PSL-94897')], productos=G)
E('PR-PLYMP-RDL-RCRU1', 'PR-PLYMP-SLO-DMP04', 'baja', [ev_n('RCR-1 es el crucero este; destino no documentado, se supone la celda vecina de la 5')],
  productos=G)
for c in ('PR-PLYMP-SLO-DMP04', 'PR-PLYMP-SLO-DMP05'):
    SINKS.add(c)
SINKS.add('PR-PLYMP-CNT-CRU2')
EXTERNOS['PR-PLYMP-CNT-CRU2'] = 'destino de la cinta crucero 2 no identificado'
# Celda 16: volcables 8 y 10
for ptv in ('PR-PLYMP-PTV-CAM08', 'PR-PLYMP-PTV-CAM10'):
    E(ptv, 'PR-PLYMP-CNT-CBVC16', 'media', [ev_ot(['PSL-94830']), ev_m('PR-PLYMP-CNT-CBVC16')] +
      ([ev_ot('PSL-92043')] if ptv.endswith('10') else []), productos=S)
E('PR-PLYMP-PTV-CAM08', 'PR-PLYMP-NOR-N12PTV8', 'media', [ev_m('PR-PLYMP-NOR-N12PTV8')], productos=S)
E('PR-PLYMP-PTV-CAM10', 'PR-PLYMP-NOR-N16', 'media', [ev_m('PR-PLYMP-NOR-N16'), ev_ot('PSL-90072')], productos=S)
E('PR-PLYMP-PTV-CAM09', 'PR-PLYMP-NOR-N15', 'media', [ev_m('PR-PLYMP-NOR-N15'), ev_ot('PSL-90071')], productos=S)
for nor in ('PR-PLYMP-NOR-N12PTV8', 'PR-PLYMP-NOR-N16'):
    E(nor, 'PR-PLYMP-TRR-MC16', 'baja', [ev_n('noria de una rampa de la Celda 16 → torre de manipuleo de la celda')], productos=S)
E('PR-PLYMP-CNT-CBVC16', 'PR-PLYMP-TRR-MC16', 'baja', [ev_n('«cinta bajo volcable celda 16» → «torre manipuleo celda 16»')], productos=S)
E('PR-PLYMP-TRR-MC16', 'PR-PLYMP-CNT-CSSC16', 'baja', [ev_n('torre de la celda → «cinta sobre celda 16»')], productos=S)
E('PR-PLYMP-CNT-CSSC16', 'PR-PLYMP-SLO-DMP16', 'media', [ev_m('PR-PLYMP-CNT-CSSC16', 'PR-PLYMP-CRR-CSS16'), ev_ot('PSL-93567')],
  via=['PR-PLYMP-CRR-CSS16'], productos=S)
SINKS.add('PR-PLYMP-SLO-DMP16')
SINKS.add('PR-PLYMP-NOR-N15')
EXTERNOS['PR-PLYMP-NOR-N15'] = '«caída silo pulmón» (PSL-90071): destino no identificado'
# Silos Kepler Weber: PTV6 (sur, línea 1) y PTV7 (norte, línea 2)
KW = ['SOJA', 'GIRASOL']
for nor in ('PR-PLYMP-NOR-N10PTV6', 'PR-PLYMP-NOR-N10/APTV6'):
    E('PR-PLYMP-PTV-CAM06', nor, 'media', [ev_m(nor)], productos=KW)
    E(nor, 'PR-PLYMP-CNT-CSSKW1', 'baja', [ev_n('noria sur de PTV6 → cinta sobre silos KW-1 <SUR>'), ev_m('PR-PLYMP-SIS-PLNSV1S')], productos=KW)
E('PR-PLYMP-PTV-CAM07', 'PR-PLYMP-NOR-N11PTV7', 'media', [ev_m('PR-PLYMP-NOR-N11PTV7')], productos=KW)
E('PR-PLYMP-NOR-N11PTV7', 'PR-PLYMP-CNT-CSSKW3', 'baja', [ev_n('noria norte de PTV7 → cinta sobre silos KW-3 <NORTE>'), ev_m('PR-PLYMP-SIS-PLNSV2N')], productos=KW)
for i in range(1, 6):
    E('PR-PLYMP-CNT-CSSKW1', f'PR-PLYMP-SLO-SVKW{i:02d}', 'baja', [ev_n('carro de la cinta sur sobre los silos KW 1–5 (SV-1 <SUR-EST>, SV-5 <SUR-OES>)')],
      via=['PR-PLYMP-CRR-CSSKW1'], productos=KW)
    SINKS.add(f'PR-PLYMP-SLO-SVKW{i:02d}')
for i in range(6, 11):
    E('PR-PLYMP-CNT-CSSKW3', f'PR-PLYMP-SLO-SVKW{i:02d}', 'baja', [ev_n('carro de la cinta norte sobre los silos KW 6–10 (SV-6 <NOR-EST>, SV-10 <NOR-OE>)')],
      via=['PR-PLYMP-CRR-CSSKW3'], productos=KW)
    SINKS.add(f'PR-PLYMP-SLO-SVKW{i:02d}')
# Carga de camiones (el grano va del silo a la tolva; el análisis se hace al revés)
for i in range(1, 7):
    E(f'PR-PLYMP-SLO-SVCHF0{i}', 'PR-PLYMP-NOR-N14SCH', 'media' if i in (1, 4) else 'baja',
      [ev_m(f'PR-PLYMP-VLV-VDSCH{i}', 'PR-PLYMP-RDL-SCH06' if i <= 3 else 'PR-PLYMP-RDL-SCH12')],
      via=[f'PR-PLYMP-VLV-VDSCH{i}', 'PR-PLYMP-RDL-SCH06' if i <= 3 else 'PR-PLYMP-RDL-SCH12'], productos=['SOJA', 'GIRASOL'],
      nota=None if i in (1, 4) else 'SCH05/SCH11 llevan el grano de los silos 2–3 y 5–6 hacia el 1 y el 4 antes de la noria.')
for n in ('01', '02'):
    E('PR-PLYMP-NOR-N14SCH', f'PR-PLYMP-SLO-SECH{n}', 'baja', [ev_n('noria N-14 de silos Chief → silos de expedición Chief')])
E('PR-PLYMP-SLO-SECH02', 'PR-PLYMP-VLV-DSE2CH', 'media', [ev_m('PR-PLYMP-SLO-SECH02', 'PR-PLYMP-VLV-DSE2CH')])
E('PR-PLYMP-SLO-SECH01', 'PR-PLYMP-VLV-DSE1CH', 'media', [ev_m('PR-PLYMP-SLO-SECH01', 'PR-PLYMP-VLV-DSE1CH')])
E('PR-PLYSP-SLO-DSP10', 'PR-PLYSP-CNT-CBS10', 'media', [ev_m('PR-PLYSP-CRR-CBS10-1')])
E('PR-PLYSP-CNT-CBS10', 'PR-PLYSP-NOR-NS10', 'baja', [ev_n('cinta bajo celda 10 → noria del silo 10')])
E('PR-PLYSP-NOR-NS10', 'PR-PLYSP-RDL-RNS10', 'media', [ev_m('PR-PLYSP-RDL-RNS10')])
E('PR-PLYSP-RDL-RNS10', 'PR-PLYSP-TLV-CCC10', 'media', [ev_m('PR-PLYSP-VLV-MC10', 'PR-PLYSP-TLV-CCC10')], via=['PR-PLYSP-VLV-MC10'])
E('PR-PLYSP-SLO-DSP11', 'PR-PLYSP-TLV-CCC11', 'media', [ev_m('PR-PLYSP-SLO-DSP11', 'PR-PLYSP-VLV-DCS11')], via=['PR-PLYSP-VLV-DCS11'])
SINKS |= {f'PR-PLYMP-SLO-SVCHF0{i}' for i in range(1, 7)} | {'PR-PLYSP-SLO-DSP10', 'PR-PLYSP-SLO-DSP11'}
# Aceite OSL (puerto)
E('TE-ACT-PLA-CARGDESCACEOSL', 'TE-ACT-BMB-BO510', 'media', [ev_m('TE-ACT-PLA-CARGDESCACEOSL', 'TE-ACT-BMB-BO510')], productos=['ACEITE'])
E('TE-ACT-BMB-BO510', 'TE-ACT-LGC-TANQUES ACEITE OSL', 'baja', [ev_n('la bomba de camiones está en la sala de bombas OSL, junto a los tanques OSL')],
  productos=['ACEITE'])
SINKS.add('TE-ACT-LGC-TANQUES ACEITE OSL')

# ----------------------------------------------------------------------------- plataformas del Excel
PLAT = {
    'VOLCABLE_PTO_1': dict(nodo='san_lorenzo:Plataformas Volcables', raices=['TE-DDC-PTV-PV1'], productos=['SOJA']),
    'VOLCABLE_PTO_2': dict(nodo='san_lorenzo:Plataformas Volcables', raices=['TE-DDC-PTV-PV2'], productos=['SOJA']),
    'VOLCABLE_PTO_3': dict(nodo='san_lorenzo:Plataformas Volcables', raices=['TE-DDC-PTV-PV3'], productos=['SOJA', 'PELLET']),
    'VOLCABLE_PTO_4': dict(nodo='san_lorenzo:Plataformas Volcables', raices=['TE-DDC-PTV-PV4'], productos=['SOJA', 'PELLET']),
    'VOLCABLE_PTO_5': dict(nodo='san_lorenzo:Plataformas Volcables', raices=['TE-DDC-PTV-PV5'], productos=['SOJA']),
    'VOLCABLE_1': dict(nodo='ricardone:Volcable 1', raices=['PR-PLYMP-PTV-CAM01'], productos=G),
    'VOLCABLE_2': dict(nodo='ricardone:Volcable 2', raices=['PR-PLYMP-PTV-CAM02'], productos=G),
    'CELDA_16': dict(nodo='ricardone:Celda 16', raices=['PR-PLYMP-PTV-CAM08', 'PR-PLYMP-PTV-CAM10'], productos=S),
    'KEPPLER_1': dict(nodo='ricardone:Volcable Silo Keppler', raices=['PR-PLYMP-PTV-CAM07'], productos=KW),
    'KEPPLER_2': dict(nodo='ricardone:Volcable Silo Keppler', raices=['PR-PLYMP-PTV-CAM06'], productos=KW),
    'SILO_CHIEF_2': dict(nodo='ricardone:Tolva de carga silo Chief', raices=['PR-PLYMP-VLV-DSE2CH'], productos=KW, carga=True),
    'CARGA_SILO_10': dict(nodo='ricardone:Tolva de carga Celda 10', raices=['PR-PLYSP-TLV-CCC10'], productos=['SUBPRODUCTO'], carga=True),
    'CARGA_SILO_11': dict(nodo='ricardone:Tolva de carga Celda 11', raices=['PR-PLYSP-TLV-CCC11'], productos=['SUBPRODUCTO'], carga=True),
    'ACEITE': dict(nodo='ricardone:Liquidos Carga/Descarga', raices=[], productos=['ACEITE']),
    'ACEITE_OSL': dict(nodo='san_lorenzo:Carga / Descarga OSL', raices=['TE-ACT-PLA-CARGDESCACEOSL'], productos=['ACEITE']),
    'ACEITE_PTO': dict(nodo='san_lorenzo:Carga/descarga', raices=[], productos=['ACEITE', 'LECITINA']),
}
assert set(PLAT) == set(CIRC['plataformas_excel']), set(PLAT) ^ set(CIRC['plataformas_excel'])
for p, d in PLAT.items():
    assert d['nodo'] == CIRC['plataformas_excel'][p], p
TE_PV = [f'VOLCABLE_PTO_{i}' for i in range(1, 6)]
TE_PV14 = TE_PV[:4]
RIC_DESC = ['VOLCABLE_1', 'VOLCABLE_2', 'CELDA_16', 'KEPPLER_1', 'KEPPLER_2']
RIC_ALL = RIC_DESC + ['SILO_CHIEF_2', 'CARGA_SILO_10', 'CARGA_SILO_11', 'ACEITE']
PROPIOS = {  # mecanismo propio de cada plataforma (relación «directo»)
    **{f'VOLCABLE_PTO_{i}': set(like(rf'TE-DDC-(PTV|CHD|CLZ|VLV|SIS-DUSTMASTER)-.*PV0?{i}[A-F]?$')) for i in range(1, 6)},
    'VOLCABLE_1': {'PR-PLYMP-PTV-CAM01', 'PR-PLYMP-CHD-PTV01'},
    'VOLCABLE_2': {'PR-PLYMP-PTV-CAM02', 'PR-PLYMP-CHD-PTV02'},
    'CELDA_16': {'PR-PLYMP-PTV-CAM08', 'PR-PLYMP-PTV-CAM10', 'PR-PLYMP-CHD-PTV08', 'PR-PLYMP-CHD-PTV10', 'PR-PLYMP-TRJL-PTV8'},
    'KEPPLER_1': {'PR-PLYMP-PTV-CAM07', 'PR-PLYMP-CHD-PTV07'},
    'KEPPLER_2': {'PR-PLYMP-PTV-CAM06', 'PR-PLYMP-CHD-PTV06'},
    'SILO_CHIEF_2': {'PR-PLYMP-VLV-DSE2CH', 'PR-PLYMP-SLO-SECH02'},
    'CARGA_SILO_10': {'PR-PLYSP-TLV-CCC10', 'PR-PLYSP-VLV-MC10'},
    'CARGA_SILO_11': {'PR-PLYSP-TLV-CCC11', 'PR-PLYSP-VLV-DCS11'},
    'ACEITE_OSL': {'TE-ACT-PLA-CARGDESCACEOSL', 'TE-ACT-BMB-BO510'},
}

# ----------------------------------------------------------------------------- grafo
ADJ = defaultdict(list)     # nodo → [(siguiente, conf, idx_vínculo)]
for i, f in enumerate(FLOW):
    c = NIV[f['confianza']]
    if f['via']:
        for v in f['via']:
            ADJ[f['desde']].append((v, c, i))
            ADJ[v].append((f['hasta'], c, i))
    else:
        ADJ[f['desde']].append((f['hasta'], c, i))
RADJ = defaultdict(list)
for a, lst in list(ADJ.items()):
    for b, c, i in lst:
        RADJ[b].append((a, c, i))


def es_sumidero(n, carga):
    if carga:
        return n in SINKS and not RADJ.get(n)
    return n in SINKS or not ADJ.get(n)   # sin salida conocida = destino desconocido


def alcance(raices, carga, quitar=frozenset()):
    """Nodos alcanzables y sumideros alcanzados. El recorrido se corta en los sumideros."""
    g = RADJ if carga else ADJ
    vis, sinks = set(), set()
    q = deque(r for r in raices if r not in quitar)
    vis |= set(q)
    while q:
        n = q.popleft()
        if es_sumidero(n, carga) and n not in raices:
            sinks.add(n)
            continue
        for m, _, _ in g.get(n, []):
            if m not in vis and m not in quitar:
                vis.add(m)
                q.append(m)
    return vis, sinks


def camino(raices, destino, carga):
    """Camino de máxima confianza mínima (widest path) hasta destino."""
    g = RADJ if carga else ADJ
    best = {r: (4, [r]) for r in raices}
    q = deque(raices)
    while q:
        n = q.popleft()
        c0, path = best[n]
        if n != destino and es_sumidero(n, carga) and n not in raices:
            continue
        for m, c, _ in g.get(n, []):
            cc = min(c0, c)
            if m not in best or cc > best[m][0]:
                best[m] = (cc, path + [m])
                q.append(m)
    return best.get(destino)


ALC = {p: alcance(d['raices'], d.get('carga', False)) for p, d in PLAT.items() if d['raices']}


def efecto_quitando(p, quitar):
    d = PLAT[p]
    if not d['raices']:
        return None
    if set(d['raices']) <= set(quitar):
        return 'detiene'
    vis0, s0 = ALC[p]
    if not (set(quitar) & vis0):
        return None
    _, s1 = alcance(d['raices'], d.get('carga', False), frozenset(quitar))
    return 'detiene' if not s1 else 'reduce_capacidad'


# ----------------------------------------------------------------------------- tipos de equipo
def tipo_de(code):
    seg = code.split('-')
    t = seg[2] if len(seg) > 2 else ''
    d = desc(code) if code in MA else ''
    if t == 'PTV' or 'PLA-CARGDESC' in code:
        return 'volcable'
    if t == 'CHD':
        return 'central_hidraulica'
    if t in ('CNT',) or t == 'TRJL':
        return 'cinta' if t == 'CNT' else 'tolva_carga'
    if t == 'RDL':
        return 'redler'
    if t == 'RSC':
        return 'rosca'
    if t in ('NOR',):
        return 'noria'
    if t == 'VLV':
        return 'valvula'
    if t in ('SCD', 'SEC') or 'SECADORA' in d and t in ('SEC',):
        return 'secadora'
    if t in ('PLN', 'BTD', 'ZRN', 'CRB', 'MQP') or 'PRELIMPIADOR' in d:
        return 'prelimpieza'
    if t == 'CLD' and code.startswith('TE-ALM'):
        return 'celda'
    if t == 'SLO':
        return 'celda' if 'CELDA' in d and 'EXPEDICION' not in d else 'silo'
    if t == 'TLV':
        return 'tolva_carga'
    if t == 'CDR':
        return 'calador'
    if t == 'BLN':
        return 'balanza'
    if t == 'CCM':
        return 'ccm'
    if t == 'TRF' or t == 'SBE':
        return 'trafo'
    if t == 'LGC' or (len(seg) == 3 and seg[1] == 'LGC'):
        return 'plc_logico'
    if t in ('FLT', 'SAP', 'ASP', 'CCL', 'BRL') or ('FILTRO' in d or 'ASPIRACI' in d) and t in ('VNT', 'SIS', 'BMB', 'VLV', 'RSC'):
        return 'filtro_aspiracion'
    if t == 'PLM':
        return 'pala_cargador'
    if t == 'CRR':
        return 'cinta'
    return 'otro'


# ----------------------------------------------------------------------------- impactos
IMP = {}


def I(equipo, plats, relacion, efecto, conf, evid, productos=None, comentario=None, redundancia=None, nodo=None):
    chk(equipo)
    plats = [plats] if isinstance(plats, str) else list(plats)
    if not plats:   # equipo revisado que no se pudo ligar a ninguna plataforma
        IMP[(equipo, None, relacion)] = {'equipo': equipo, 'nodo_circuito': nodo, 'plataformas_excel': [], 'relacion': relacion,
                                         'efecto': efecto, 'productos': productos or [],
                                         'redundancia': redundancia or {'alternativas': [], 'comentario': None},
                                         'confianza': conf, 'evidencia': evid, **({'comentario': comentario} if comentario else {})}
        return
    grupos = defaultdict(list)
    for p in plats:
        grupos[nodo or PLAT[p]['nodo']].append(p)
    for nd, ps in grupos.items():
        k = (equipo, nd, relacion)
        prev = IMP.get(k)
        if prev and prev['efecto'] == efecto:
            prev['plataformas_excel'] = sorted(set(prev['plataformas_excel']) | set(ps))
            continue
        if prev:   # mismo equipo y nodo con otro efecto: se separa por plataforma
            k = (equipo, nd, relacion, efecto)
            if k in IMP:
                IMP[k]['plataformas_excel'] = sorted(set(IMP[k]['plataformas_excel']) | set(ps))
                continue
        IMP[k] = {'equipo': equipo, 'nodo_circuito': nd, 'plataformas_excel': sorted(ps), 'relacion': relacion,
                  'efecto': efecto,
                  'productos': productos if productos is not None else sorted({x for p in ps for x in PLAT[p]['productos']}),
                  'redundancia': redundancia or {'alternativas': [], 'comentario': None},
                  'confianza': conf, 'evidencia': evid, **({'comentario': comentario} if comentario else {})}


def nombre_corto(c):
    return c.split('-', 3)[-1] if c.count('-') >= 3 else c


# 1) impactos calculados sobre el grafo
for p, d in PLAT.items():
    if not d['raices']:
        continue
    carga = d.get('carga', False)
    vis, sinks = ALC[p]
    g = RADJ if carga else ADJ
    desc_de = {}
    for n in vis:
        desc_de[n] = alcance([n], carga)[0]
    for n in sorted(vis):
        ef = efecto_quitando(p, [n])
        if n in d['raices'] and not carga:
            I(n, p, 'directo', ef, 'media', [ev_m(n), {'fuente': 'circuito', 'detalle': f'plataforma {p} del Excel = {nombre_corto(n)} (ver preguntas)'}],
              redundancia={'alternativas': [r for r in d['raices'] if r != n], 'comentario': 'otra rampa de la misma plataforma' if len(d['raices']) > 1 else None})
            continue
        cw = camino(d['raices'], n, carga)
        conf = INV[min(cw[0], 2)] if cw else 'baja'
        path = cw[1] if cw else [n]
        rel = 'directo' if n in PROPIOS.get(p, set()) or n in d['raices'] else ('compartido' if carga else 'aguas_abajo')
        alts = []
        if ef != 'detiene':
            t = tipo_de(n)
            alts = sorted(m for m in vis if m != n and tipo_de(m) == t and n not in desc_de[m] and m not in desc_de[n])[:8]
        evid = [{'fuente': 'mapa', 'detalle': ('camino del grano (al revés, del destino a la tolva): ' if carga else 'camino del grano: ')
                 + ' → '.join(nombre_corto(x) for x in (reversed(path) if carga else path))
                 + ('' if ef == 'detiene' else '; sin este equipo el grano todavía llega a un destino') +
                 ('; si falta, no queda otro camino' if ef == 'detiene' else '')}]
        entra = [FLOW[i] for _, _, i in RADJ.get(n, [])] if not carga else [FLOW[i] for _, _, i in ADJ.get(n, [])]
        for f in entra[:1]:
            evid += f['evidencia'][:2]
        coment = None
        if n in SINKS:
            coment = ('destino final: si está llena o en mantenimiento, ' +
                      ('no hay otro destino' if ef == 'detiene' else 'el grano puede ir a otro destino'))
            if n in EXTERNOS:
                coment += f' ({EXTERNOS[n]})'
        elif not ADJ.get(n) and not carga:
            coment = 'no se encontró a dónde entrega: la cadena se corta acá (se lo trata como destino desconocido)'
        I(n, p, rel, ef, conf, evid, comentario=coment,
          redundancia={'alternativas': alts, 'comentario': None if ef == 'detiene' else
                       ('alternativas en paralelo del mismo tipo dentro de la cadena' if alts else 'hay otro camino aguas abajo')})

# 2) activos adosados a una cadena sin estar en el flujo (hidráulica, aspiración, aireación, extracción…)
SERV = []     # dependencias de servicio


def D(equipo, depende_de, tipo, conf, evid, bloqueante=None):
    """bloqueante: sin el proveedor el equipo no funciona (energía, control, hidráulica). Aire/aspiración por defecto no:
    sólo lo frena si hay enclavamiento, que no está documentado."""
    chk(equipo); chk(depende_de)
    if bloqueante is None:
        bloqueante = tipo != 'aire'
    SERV.append({'equipo': equipo, 'depende_de': depende_de, 'tipo': tipo, 'bloqueante': bloqueante,
                 'confianza': conf, 'evidencia': evid})


# hidráulica y control propios de cada volcable
for i in range(1, 6):
    D(f'TE-DDC-PTV-PV{i}', f'TE-DDC-CHD-CHPV{i}', 'hidraulica', 'media', [ev_m(f'TE-DDC-CHD-CHPV{i}')])
    D(f'TE-DDC-CLZ-CPV{i}', f'TE-DDC-CHD-CHCALZPV0{i}', 'hidraulica', 'media', [ev_m(f'TE-DDC-CHD-CHCALZPV0{i}')])
    D(f'TE-DDC-PTV-PV{i}', 'TE-DDC-LGC-PLAT. VOLCABLES', 'control', 'media',
      [ev_m('TE-DDC-LGC-PLAT. VOLCABLES'), ev_ot(['PSL-87894', 'PSL-82886'])])
    I(f'TE-DDC-CLZ-CPV{i}', f'VOLCABLE_PTO_{i}', 'directo', 'detiene', 'baja',
      [ev_m(f'TE-DDC-CLZ-CPV{i}'), ev_n('sin calzas el camión no se asegura para volcar')] + ([ev_ot('PSL-93257')] if i == 1 else []))
    I(f'TE-DDC-SIS-DUSTMASTER-PV{i}', f'VOLCABLE_PTO_{i}', 'directo', 'demora', 'baja',
      [ev_m(f'TE-DDC-SIS-DUSTMASTER-PV{i}'), ev_n('cortina anti-polvo de la plataforma: se puede volcar sin ella, con más polvo o más lento')])
for pv, plats in (('TE-DDC-SIS-LUBCENTRAL 01', ['VOLCABLE_PTO_3', 'VOLCABLE_PTO_4']),
                  ('TE-DDC-SIS-LUBCENTRAL 02', ['VOLCABLE_PTO_1', 'VOLCABLE_PTO_2', 'VOLCABLE_PTO_5'])):
    I(pv, plats, 'compartido', 'ninguno', 'media', [ev_m(pv)],
      comentario='lubricación centralizada de las plataformas: una OT no las frena en el corto plazo')
D('TE-DDC-PTV-PV5', 'TE-DDC-FLT-FMAPV5', 'aire', 'baja', [ev_m('TE-DDC-FLT-FMAPV5'), ev_n('filtro de mangas propio de PV5')])
D('TE-DDC-FLT-FMAPV5', 'TE-DDC-VNT-VEFMAPV5', 'energia', 'media', [ev_m('TE-DDC-VNT-VEFMAPV5')])
for eq in ('TE-DDC-FLT-FMDDC',):
    for i in range(1, 5):
        D(f'TE-DDC-PTV-PV{i}', eq, 'aire', 'baja', [ev_m(eq), ev_n('filtro de mangas común de la descarga de camiones; si hay enclavamiento, la plataforma no arranca')])
for dep in ('TE-DDC-VNT-VFMDDC', 'TE-DDC-RSC-RFMDDC', 'TE-DDC-VLV-VRFMDDC', 'TE-DDC-BRL-BFMDDC'):
    D('TE-DDC-FLT-FMDDC', dep, 'aire', 'media', [ev_m(dep)])
D('TE-DDC-FLT-FMDDC', 'TE-DCC-SIS-ASPIR. BOOSTER PV', 'aire', 'baja', [ev_m('TE-DCC-SIS-ASPIR. BOOSTER PV'), ev_ot('PSL-94079')])
for i in range(1, 5):
    D(f'TE-DDC-PTV-PV{i}', 'TE-TDM-BMB-BSFMTDM-2', 'aire', 'baja', [ev_m('TE-TDM-BMB-BSFMTDM-2', 'TE-TDM-VLV-VRBSFMTDM-2')])
for cr in ('TE-TNL-CNT-CR0', 'TE-TNL-CNT-CR1', 'TE-TNL-CNT-CR2', 'TE-TDM-NOR-EL1', 'TE-TDM-NOR-EL2', 'TE-TDM-NOR-EL3', 'TE-TDM-NOR-EL4'):
    D(cr, 'TE-TDM-VNT-B35', 'aire', 'baja', [ev_m('TE-TDM-VNT-B35')])
D('TE-TNL-CNT-CR0', 'TE-TDM-SIS-ASP. CR0', 'aire', 'media', [ev_m('TE-TDM-SIS-ASP. CR0')])
D('TE-TNL-CNT-CR2', 'TE-TDM-SIS-ASP. CR2', 'aire', 'media', [ev_m('TE-TDM-SIS-ASP. CR2')])
for el in ('TE-TDM-NOR-EL1', 'TE-TDM-NOR-EL2'):
    D(el, f'TE-TDM-VLV-ASEL{el[-1]}', 'aire', 'media', [ev_m(f'TE-TDM-VLV-ASEL{el[-1]}')])
for eq in ('TE-TDM-NOR-EL1', 'TE-TDM-NOR-EL2', 'TE-TDM-NOR-EL3', 'TE-TDM-NOR-EL4', 'TE-TDM-CNT-C01', 'TE-TDM-CNT-C05', 'TE-TDM-CNT-CT1', 'TE-TDM-CNT-CT2'):
    D(eq, 'TE-TDM-FLT-FMTDM', 'aire', 'baja', [ev_m('TE-TDM-FLT-FMTDM'), ev_n('filtro de mangas de la torre (aspira elevadores y cintas)')])
for dep in ('TE-TDM-VNT-VFMTDM', 'TE-TDM-RSC-RFMTDM', 'TE-TDM-BRL-BRFMTDM', 'TE-TDM-VLV-VRFMTDM -M3', 'TE-TDM-BMB-BSFMTDM'):
    D('TE-TDM-FLT-FMTDM', dep, 'aire', 'media', [ev_m(dep)] + ([ev_ot('PSL-92037')] if dep.startswith('TE-TDM-VNT') else []))
D('TE-TDM-FLT-FMTDM', 'TE-TDM-CMP-COM1 (COMPRESOR)', 'aire', 'baja', [ev_m('TE-TDM-CMP-COM1 (COMPRESOR)'), ev_n('aire comprimido para la limpieza por pulsos')])
D('TE-TDM-CNT-CT1', 'TE-TDM-ASP-ACT1', 'aire', 'media', [ev_m('TE-TDM-ASP-ACT1')])
D('TE-TDM-CNT-C01', 'TE-TDM-CNT-SACAMMETALES', 'energia', 'baja', [ev_m('TE-TDM-CNT-SACAMMETALES'), ev_ot('PSL-86388')], bloqueante=False)
# secadora del puerto
for eq in like(r'TE-SEC-(QMD|VNT-VE0)') + ['TE-SEC-VLV-VALV AUTOREG SEC', 'TE-SEC-VLV-VALV AUTOREG CLD', 'TE-SEC-VLV-VALV SEG',
                                         'TE-SCD-LGC-QUEMADORES', 'TE-SCD-LGC-VENTIL AIRE CALIENT']:
    D('TE-SEC-SEC-SEKW (SECADORA)', eq, 'energia', 'media',
      [ev_m(eq), ev_n('quemadores/aire caliente: sin ellos la secadora no seca, pero el grano puede seguir por el bypass R32')]
      + ([ev_ot(['PSL-90168', 'PSL-90198'])] if 'VENTIL' in eq else []), bloqueante=False)
for eq in ('TE-SEC-CCL-CDEPU1', 'TE-SEC-CCL-CDEPU2', 'TE-SEC-DPR-DEPU1', 'TE-SEC-DPR-DEPU2', 'TE-SEC-BRZ-BDEP1', 'TE-SEC-BRZ-BDEP2',
           'TE-SEC-RSC-ROSCDEPU', 'TE-SCD-FLT-FMAMAP', 'TE-SCD-VLV-VRFMAMAP', 'TE-SCD-VNT-VLFMAMAP', 'TE-SEC-VNT-VENTDEST', 'TE-SEC-VLV-VRDEST'):
    D('TE-SEC-SEC-SEKW (SECADORA)' if 'DEST' not in eq else 'TE-SEC-DST-DESTERRADOR', eq, 'aire', 'baja', [ev_m(eq)])
D('TE-SEC-SEC-SEKW (SECADORA)', 'TE-SEC-BSC-BASCULANTE', 'energia', 'media', [ev_m('TE-SEC-BSC-BASCULANTE'), ev_n('basculante de salida de la secadora')])
D('TE-SEC-RDL-R33', 'TE-SCD-LGC-REDLER SECADORA', 'control', 'baja', [ev_m('TE-SCD-LGC-REDLER SECADORA')])
# energía del puerto
D('TE-TRF-TRF-CZERWENY-1600KVA', 'TE-TRF-TRF-CZERWENY-3000KVA', 'energia', 'baja', [ev_m('TE-TRF-TRF-CZERWENY-3000KVA', 'TE-TRF-TRF-CZERWENY-1600KVA'),
                                                                                     ev_n('trafo de entrada 33/6,6 kV alimenta a los de 6,6 kV')])
D('TE-TRF-TRF-N.RIVERA-2500KVA', 'TE-TRF-TRF-CZERWENY-3000KVA', 'energia', 'baja', [ev_m('TE-TRF-TRF-N.RIVERA-2500KVA')])
for ccm in ('TE-TDM-CCM-CCMP0', 'TE-TDM-CCM-CCMP2', 'TE-TDM-LGC-CCM TDM'):
    D(ccm, 'TE-TRF-TRF-CZERWENY-1600KVA', 'energia', 'media' if ccm != 'TE-TDM-LGC-CCM TDM' else 'baja',
      [ev_m('TE-TRF-TRF-CZERWENY-1600KVA'), ev_n('«TRAFO NRO2 1600 KVA TORRE DE MANIPULEO»')])
for ccm in ('TE-TDM-CCM-CCMP0', 'TE-TDM-CCM-CCMP2'):
    D('TE-TDM-LGC-CCM TDM', ccm, 'energia', 'baja', [ev_m(ccm), ev_ot('PSL-92389'),
                                                     ev_n('el agrupador «CCM torre de manipuleo» son los CCM piso 0 y piso 2; no se sabe qué equipo cuelga de cada uno')],
      bloqueante=False)
TORRE = (like(r'TE-TNL-CNT-CR[0-6]$') + like(r'TE-TDM-NOR-EL[1-4]$') + ['TE-TDM-CNT-C01', 'TE-TDM-CNT-C05', 'TE-TDM-CNT-CT1', 'TE-TDM-CNT-CT2']
         + like(r'TE-DDC-PTV-PV[1-5]$') + like(r'TE-DDC-CHD-CHPV[1-5]$'))
for eq in TORRE:
    D(eq, 'TE-TDM-LGC-CCM TDM', 'energia', 'baja', [ev_m('TE-TDM-LGC-CCM TDM'), ev_n('no se sabe si es el CCM piso 0 o el piso 2; ver preguntas')])
for n in '1234':
    fed = like(rf'TE-ALM-(CNT-CSC{n}|CRR-CTCSC{n}|LGC-VALV BAJO CELDA {n})') + (like(r'TE-TNL-CNT-CBC1$') if n == '1' else []) \
        + (like(r'TE-ALM-CNT-CBC2$') if n == '2' else []) + (like(r'TE-TNL-CNT-CBC3$') if n == '3' else []) \
        + (like(r'TE-ALM-(CNT-C(6|7|8|9|11|12|13) |CRR-CTC[89])') + ['TE-TNL-CNT-CBC4 C10'] if n == '4' else [])
    if n == '3':
        fed += ['TE-ALM-CNT-CSC3S']
    for eq in fed:
        D(eq, f'TE-ALM-CCM-CCMBC{n}', 'energia', 'baja', [ev_m(f'TE-ALM-CCM-CCMBC{n}'), ev_n(f'CCM bajo celda {n}: se supone que alimenta las cintas de esa celda')])
for eq in like(r'TE-(ALM-CNT-CSS[4-7]|TNL-CNT-CBS[4-7]|TNL-VLV-P2[78]|ALM-NOR-EL5)'):
    D(eq, 'TE-ALM-CCM-CCMBS4', 'energia', 'media' if 'P28' in eq else 'baja',
      [ev_m('TE-ALM-CCM-CCMBS4')] + ([ev_ot('PSL-87781')] if 'P28' in eq else [ev_n('CCM bajo silos')]))
for eq in like(r'TE-SEC-(RDL|NOR)-') + ['TE-SEC-SEC-SEKW (SECADORA)']:
    D(eq, 'TE-SCD-CCM-CCM SECAD', 'energia', 'baja', [ev_m('TE-SCD-CCM-CCM SECAD'), ev_n('CCM de la secadora')])
for eq in ('TE-DDV-NOR-EDDVAG',):
    D(eq, 'TE-DDV-CCM-DESCVAGONES', 'energia', 'media', [ev_m('TE-DDV-CCM-DESCVAGONES'), ev_ot('PSL-86925')])
for eq in ('TE-ACT-BMB-BO510',):
    D(eq, 'TE-ACT-CCM-CCMAC', 'energia', 'baja', [ev_m('TE-ACT-CCM-CCMAC'), ev_ot('PSL-89019')])
for v in like(r'TE-TDM-VLV-P[5-8][12]$'):
    D(v, 'TE-TDM-LGC-VALVULAS VDT', 'control', 'media', [ev_m(v, 'TE-TDM-LGC-VALVULAS VDT')])

# Ricardone: hidráulica, control, energía, aire
for n in ('01', '02', '06', '07', '08', '09', '10'):
    D(f'PR-PLYMP-PTV-CAM{n}', f'PR-PLYMP-CHD-PTV{n}', 'hidraulica', 'media', [ev_m(f'PR-PLYMP-CHD-PTV{n}'), ev_n('RVC = rampa volcadora de camiones; el código repite el número de la rampa')])
D('PR-PRL3-PTV-CAM03', 'PR-PRL3-CHD-PTV3', 'hidraulica', 'media', [ev_m('PR-PRL3-CHD-PTV3')])
D('PR-AGR-PTV-CAM05', 'PR-AGR-CHD-PTV05', 'hidraulica', 'media', [ev_m('PR-AGR-CHD-PTV05')])
D('PR-PLYMP-PTV-CAM04', 'PR-PLYMP-CHD-PTV04', 'hidraulica', 'media', [ev_m('PR-PLYMP-CHD-PTV04')])
for n in ('01', '02', '04', '06', '07', '08', '09', '10'):
    D(f'PR-PLYMP-PTV-CAM{n}', 'PR-PLYMP-LGC-PLATAFORMAS VOLC', 'control', 'baja', [ev_m('PR-PLYMP-LGC-PLATAFORMAS VOLC'), ev_ot('PSL-91924')],
      bloqueante=False)
for n in '123':
    D(f'PR-PLYMP-CDR-CA0{n}', f'PR-PLYMP-CHD-CA0{n}', 'hidraulica', 'media', [ev_m(f'PR-PLYMP-CHD-CA0{n}')])
    D(f'PR-PLYMP-CDR-CA0{n}', 'PR-PLYMP-LGC-CALADORES', 'control', 'media', [ev_m('PR-PLYMP-LGC-CALADORES'), ev_ot(['PSL-95298', 'PSL-93827'])])
    D(f'PR-PLYMP-CDR-CA0{n}', 'PR-PLYMP-BMB-SCAL', 'aire', 'baja', [ev_m('PR-PLYMP-BMB-SCAL'), ev_n('soplante que lleva la muestra de los caladores')])
for cmp_ in like(r'PR-RAC-CMP-'):
    D('PR-PLYMP-CDR-CA01', cmp_, 'aire', 'baja', [ev_m(cmp_), ev_ot(['PSL-90259', 'PSL-93149'], 'OT de mangueras neumáticas del calador 1: usa aire comprimido; no se sabe de qué compresor')])
# prelimpiadores neumáticos y aspiración de las norias
for noria, deps in (('PR-PLYMP-NOR-N08PTV2', like(r'PR-PLYMP-(PLN-PL[12]N8|SIS-PLN[12]N8|SIS-PLNN08|CCL-CPLN[12]N08|VLV-PLN[NS]{1,2}N08|VNT-PLN[NS]{1,2}N08)')),
                    ('PR-PLYMP-NOR-N04', like(r'PR-PLYMP-(PLN-RSG[12]|SIS-PLN[12]N04|CCL-CPLN[12]N4|VLV-PLN[12]N04|VNT-PLN[12]?N04|VNT-PLN.*N04)')),
                    ('PR-PLYMP-PTV-CAM01', like(r'PR-PLYMP-(SAP-PTV1|CCL-CSAPTV1|VLV-PTV1|RSC-PTV1|VNT-PTV1)$')),
                    ('PR-PLYMP-PTV-CAM02', like(r'PR-PLYMP-(SAP-PTV2|CCL-CSAPTV2|VLV-PTV2|RSC-PTV2|VNT-PTV2)$')),
                    ('PR-PLYMP-PTV-CAM06', like(r'PR-PLYMP-(SAP-PTV6|VLV-PTV6|VNT-PTV6)')),
                    ('PR-PLYMP-PTV-CAM07', like(r'PR-PLYMP-(SAP-PTV7|VLV-PTV7|VNT-PTV7)')),
                    ('PR-PLYMP-CNT-CSG3', ['PR-PLYMP-VNT-SAPN-5/6', 'PR-PLYMP-SAP-N05/06']),
                    ('PR-PLYMP-TRR-MC16', like(r'PR-PLYMP-(PLN-N0[12]|SIS-PL[12][EO]C16|CCL-CPL[12]|VNT-PL[12]|SAP-C16|CCL-CSAC16|VLV-VSAC16|CCL-CREIC16|VLV-VREIC16|VNT-VREIC|VNT-VTSAC)')),
                    ('PR-PLYMP-CNT-CSSKW1', like(r'PR-PLYMP-(PLN-SV1S|SIS-PLNSV1S|VLV-PLNSV1|VNT-PLNSV1)')),
                    ('PR-PLYMP-CNT-CSSKW3', like(r'PR-PLYMP-(PLN-SV2N|SIS-PLNSV2N|VLV-PLNSV2|VNT-PLNSV2)')),
                    ('PR-PLYMP-SCD-CED', like(r'PR-PLYMP-(QMD-|VNT-ASPS(0\d|10)$|VNT-QSE|VLV-PCV-)')),
                    ):
    for dep in deps:
        tp = 'energia' if ('QMD' in dep or 'PCV' in dep or 'QSE' in dep) else 'aire'
        if tp == 'energia':   # quemadores y gas: la secadora no seca, pero no está probado que el grano no pase
            D(noria, dep, tp, 'media', [ev_m(dep)] + ([ev_n('gas de los quemadores: se carga como «energia» porque el esquema no tiene «gas»')] if 'PCV' in dep else []),
              bloqueante=False)
            continue
        D(noria, dep, tp, 'media' if ('N04' in dep or 'N08' in dep or 'PTV' in dep or 'C16' in dep or 'SV' in dep or 'SECADORA' in desc(dep) or 'QUEMADOR' in desc(dep)) else 'baja',
          [ev_m(dep)] + ([ev_n('gas de los quemadores: se carga como «energia» porque el esquema no tiene «gas»')] if 'PCV' in dep else []))
D('PR-PLYMP-SCD-CED', 'PR-PLYMP-BSC-DSC', 'energia', 'media', [ev_m('PR-PLYMP-BSC-DSC')])
for eq in like(r'PR-PLYMP-(PTV-CAM0[67]|NOR-N1[01]|CNT-CSSKW|CRR-CSSKW|FLT-FMKW|VNT-ASFMKW|RSC-FMKW|SAP-FMKW)'):
    D(eq, 'PR-CCM-CCM-SILOS KW', 'energia', 'media' if 'PTV' in eq or 'NOR' in eq or 'CNT' in eq else 'baja', [ev_m('PR-CCM-CCM-SILOS KW'), ev_n('CCM silos Kepler Weber')])
for eq in like(r'PR-PLYMP-(NOR-N1[34]SCH|RDL-SCH|VLV-VDSCH|VLV-DSE[12]CH|SLO-SECH)'):
    D(eq, 'PR-CCM-CCM-SILOS CH', 'energia', 'media' if 'NOR' in eq else 'baja', [ev_m('PR-CCM-CCM-SILOS CH')])
for eq in like(r'PR-PLYMP-(PTV-CAM(08|10)|NOR-N12|NOR-N16|CNT-CBVC16|TRR-MC16|CNT-CSSC16|CRR-CSS16|CNT-CBSC16)'):
    D(eq, 'PR-CCM-CCM- CELDA 16', 'energia', 'media', [ev_m('PR-CCM-CCM- CELDA 16'), ev_ot('PSL-95247', 'PSL-95247: «tablero de repetidoras CCM Keple y CCM Celda 16»')])
for eq in like(r'PR-PLYSP-(TLV-CCC10|VLV-MC10|RDL-RNS10|NOR-NS10|CNT-CBS10)'):
    D(eq, 'PR-CCM-CCM-SILO 10', 'energia', 'baja', [ev_m('PR-CCM-CCM-SILO 10')])
for eq in like(r'PR-PLYSP-(TLV-CCC11|VLV-DCS11)'):
    D(eq, 'PR-CCM-CCM-SILO 11', 'energia', 'baja', [ev_m('PR-CCM-CCM-SILO 11')])
for eq in like(r'PR-PLYMP-(PTV-CAM0[12]$|NOR-N0[478]|CNT-CSG3|CNT-CRU2|RDL-RSG1|RDL-RCRU|SCD-CED|BSC-DSC)'):
    D(eq, 'PR-CCM-LGC-PLYMP', 'energia', 'baja', [ev_m('PR-CCM-LGC-PLYMP'), ev_n('«CCM playa y materia prima»: no hay un CCM propio de volcables 1 y 2 en el maestro')])
for ccm in ('PR-CCM-CCM- CELDA 16',):
    D(ccm, 'PR-REL-TRF-SC16MP', 'energia', 'media', [ev_m('PR-REL-TRF-SC16MP')])
for ccm in ('PR-CCM-CCM-SILOS KW', 'PR-CCM-CCM-SILOS CH', 'PR-CCM-CCM-SILO 10', 'PR-CCM-CCM-SILO 11', 'PR-CCM-LGC-PLYMP'):
    D(ccm, 'PR-REL-TRF-SMPSP', 'energia', 'baja', [ev_m('PR-REL-TRF-SMPSP'), ev_n('«TRAFO SILOS M.P. Y S.P.»')])
for trf in ('PR-REL-TRF-SC16MP', 'PR-REL-TRF-SMPSP'):
    D(trf, 'PR-REL-SBE-EPE', 'energia', 'baja', [ev_m('PR-REL-SBE-EPE'), ev_n('subestación principal')])
for eq in like(r'PR-PRL1-(BTD|NOR|RDL|RSC)'):
    D(eq, 'PR-CCM-CCM-PLPZ1', 'energia', 'media', [ev_m('PR-CCM-CCM-PLPZ1')])
for eq in like(r'PR-PRL2-(BTD|NOR|RDL|RSC)'):
    D(eq, 'PR-CCM-CCM-PLPZ2', 'energia', 'media', [ev_m('PR-CCM-CCM-PLPZ2')])
for eq in like(r'PR-EXP-(BLN|BRR|CMR)-'):
    D(eq, 'PR-EXP-LGC-BALANZA' if 'CBNPI' not in eq and 'CMRPI' not in eq else 'PR-EXP-LGC-PREINGRESO', 'control', 'baja',
      [ev_m('PR-EXP-LGC-BALANZA' if 'PI' not in eq else 'PR-EXP-LGC-PREINGRESO')])
D('PR-PLYMP-LGC-PLAYA DE CAMIONES', 'PR-PLYMP-GNR-GPR', 'energia', 'baja', [ev_m('PR-PLYMP-GNR-GPR'), ev_n('grupo electrógeno de la playa (respaldo)')])

# ---- impactos de servicio: se sacan el proveedor y todo lo que depende de él (transitivo)
DEP_DURO = defaultdict(set)     # proveedor → equipos que sin él no funcionan
DEP_BLANDO = defaultdict(set)   # proveedor → equipos que sólo se frenan si hay enclavamiento
for s in SERV:
    (DEP_DURO if s['bloqueante'] else DEP_BLANDO)[s['depende_de']].add(s['equipo'])


def cierre(prov):
    out, q = set(), [prov]
    while q:
        x = q.pop()
        for y in DEP_DURO.get(x, ()):
            if y not in out:
                out.add(y)
                q.append(y)
    return out

# 3) aguas arriba: calada, balanzas, playa
CALADA = ['PR-PLYMP-CDR-CA01', 'PR-PLYMP-CDR-CA02', 'PR-PLYMP-CDR-CA03']
for c in CALADA:
    I(c, RIC_ALL, 'aguas_arriba', 'demora', 'media',
      [ev_m(c), ev_n('todos los recorridos de Ricardone pasan por ricardone:Calada')], nodo='ricardone:Calada',
      redundancia={'alternativas': [x for x in CALADA if x != c], 'comentario': 'tres caladores; con uno menos la calada sigue, más lenta'})
    I(c, TE_PV, 'aguas_arriba', 'demora', 'media',
      [ev_c('calada_puerto', 'días con OT correctiva en los caladores: tiempo en Ricardone 1,24–1,33× su mediana y en los volcables del puerto 1,02–1,07×'),
       {'fuente': 'circuito', 'detalle': 'R7 cala en ricardone:Calada y descarga en san_lorenzo:Plataformas Volcables'}],
      nodo='ricardone:Calada', productos=['SOJA'],
      redundancia={'alternativas': [x for x in CALADA if x != c], 'comentario': 'efecto chico y diferido: el camión llega tarde al puerto'})
for eq in ('PR-PLYMP-LGC-CALADORES', 'PR-PLYMP-BMB-SCAL', 'PR-PLYMP-CNT-CLD1', 'PR-PLYMP-CNT-CLD2', 'PR-PLYMP-CNT-CLD3',
           'PR-PLYMP-CHD-CA01', 'PR-PLYMP-CHD-CA02', 'PR-PLYMP-CHD-CA03'):
    I(eq, RIC_ALL + TE_PV, 'aguas_arriba', 'demora', 'baja', [ev_m(eq)], nodo='ricardone:Calada',
      comentario='equipo de la calada: si falla, cala un calador menos o más lento')
I('PR-PLYMP-LGC-CALADO ACEITE', ['ACEITE'], 'aguas_arriba', 'demora', 'baja', [ev_m('PR-PLYMP-LGC-CALADO ACEITE')], nodo='ricardone:Calada')
BAL_R = like(r'PR-EXP-BLN-CAM[1-4]$')
for b in BAL_R:
    I(b, RIC_ALL, 'aguas_arriba', 'demora', 'media', [ev_m(b), ev_n('básculas de camiones de Ricardone: ingreso y egreso')],
      nodo='ricardone:Balanza Ingreso', redundancia={'alternativas': [x for x in BAL_R if x != b], 'comentario': 'hay 3 básculas fijas y una móvil (CAM4)'})
for eq in like(r'PR-EXP-(BRR|CMR-CMR[NS]|LGC-BALANZA|CBN-CBBLZ)') + ['PR-PLYMP-LGC-BASCULAS']:
    I(eq, RIC_ALL, 'aguas_arriba', 'demora' if 'CBN' not in eq else 'ninguno', 'baja', [ev_m(eq)] + ([ev_ot(['PSL-94785', 'PSL-95902'])] if 'LGC-BALANZA' in eq else []),
      nodo='ricardone:Balanza Ingreso')
for eq in like(r'PR-EXP-(LGC-PREINGRESO|CMR-CMRPI|CBN-CBNPI)'):
    I(eq, RIC_ALL, 'aguas_arriba', 'demora' if 'CBN' not in eq else 'ninguno', 'baja', [ev_m(eq)], nodo='ricardone:Pre ingreso')
for eq in ('PR-EXP-LGC-ACCESO', 'PR-EXP-LGC-EXPEDICION'):
    I(eq, RIC_ALL, 'aguas_arriba', 'demora', 'baja', [ev_m(eq)], nodo='ricardone:Ingreso')
for eq in ['PR-PLYMP-LGC-PLAYA DE CAMIONES'] + like(r'PR-PLYMP-PLY-CAM'):
    I(eq, RIC_ALL, 'aguas_arriba', 'demora', 'baja', [ev_m(eq)] + ([ev_ot(['PSL-86579'])] if 'LGC' in eq else []), nodo='ricardone:Playa 3')
I('PR-PLYMP-GNR-GPR', RIC_ALL, 'servicio', 'ninguno', 'baja', [ev_m('PR-PLYMP-GNR-GPR')], nodo='ricardone:Playa 3',
  comentario='grupo electrógeno de respaldo: sólo importa si se corta la energía')
# puerto
I('TE-PLY-LGC-SECTOR PLAYA', TE_PV, 'aguas_arriba', 'demora', 'media',
  [ev_ot(['PSL-91058', 'PSL-89963', 'PSL-92476', 'PSL-95744']),
   ev_c('barrera_0611', 'los 4 volcables del puerto demoran a la vez del 11/06 al 13/06 (459–769 min contra ~290)')],
  nodo='san_lorenzo:Playa OSL', comentario='barrera de ingreso a la playa: si queda fuera de servicio se frena la entrada de todos los camiones')
I('TE-PLY-BRR-ACC', TE_PV + ['ACEITE_OSL', 'ACEITE_PTO'], 'aguas_arriba', 'demora', 'media', [ev_m('TE-PLY-BRR-ACC')], nodo='san_lorenzo:Ingreso')
for eq in ('TE-PLY-LGC-PRINCIPAL TERM EMB', 'TE-PLY-LGC-CHICA TERM EMB'):
    I(eq, TE_PV, 'aguas_arriba', 'demora', 'baja', [ev_m(eq)], nodo='san_lorenzo:Playa OSL')
BAL_T = ['TE-PLY-BLN-1 SUR', 'TE-PLY-BLN-2 NORTE']
for b in BAL_T:
    I(b, TE_PV + ['ACEITE_PTO'], 'aguas_arriba', 'demora', 'media', [ev_m(b)], nodo='san_lorenzo:Balanza Ingreso',
      redundancia={'alternativas': [x for x in BAL_T if x != b], 'comentario': 'dos básculas de camiones'})
for eq in like(r'TE-EXP-.*(PTO|EXPEDICION)'):
    I(eq, TE_PV + ['ACEITE_PTO'], 'aguas_arriba', 'demora' if 'CBN' not in eq else 'ninguno', 'baja', [ev_m(eq)] + ([ev_ot('PSL-93726')] if 'SECTOR BALANZA PTO' in eq else []),
      nodo='san_lorenzo:Balanza Ingreso')
for eq in like(r'TE-EXP-.*OSL') + ['TE-PLY-BLN-OSL']:
    I(eq, ['ACEITE_OSL'], 'aguas_arriba', 'demora' if 'CBN' not in eq else 'ninguno', 'baja', [ev_m(eq)], nodo='san_lorenzo:Balanza Ingreso')
for eq in ('TE-PLY-LGC-CCTV', 'TE-PLY-LGC-CANALES PLUVIALES', 'TE-PLY-CNL-CANAL PLUVIAL NORTE', 'TE-PLY-CNL-CANAL PLUVIAL SUR',
           'TE-PLY-PLM-CFB630', 'TE-PLY-PLM-CFBS850', 'TE-PLY-LGC-RGRAC'):
    I(eq, TE_PV, 'compartido', 'ninguno', 'baja', [ev_m(eq)], nodo='san_lorenzo:Playa OSL',
      comentario='está en la playa pero no interviene en la descarga')
I('PR-PLYMP-TRJL-PTV8', 'CELDA_16', 'directo', 'reduce_capacidad', 'media', [ev_m('PR-PLYMP-TRJL-PTV8')],
  comentario='tolva-rejilla de la rampa 8: si falla, la Celda 16 sigue recibiendo por la rampa 10')
# vagones: cuando descargan usan CR4 → CR1/CR2, las mismas cintas que los volcables 1 a 4
for eq in ('TE-DDV-NOR-EDDVAG', 'TE-DDV-VLV-VAGONES/CR6', 'TE-TNL-CNT-CR6', 'TE-TNL-VLV-P29', 'TE-TNL-CNT-CR4',
           'TE-ALM-VLV-P17', 'TE-TNL-VLV-VDP17', 'TE-ALM-VLV-P18', 'TE-TNL-VLV-VDP18'):
    ps = TE_PV14 if eq in ('TE-DDV-NOR-EDDVAG', 'TE-DDV-VLV-VAGONES/CR6', 'TE-TNL-CNT-CR6', 'TE-TNL-VLV-P29', 'TE-TNL-CNT-CR4') \
        else (['VOLCABLE_PTO_1', 'VOLCABLE_PTO_2'] if eq.endswith('17') else TE_PV14)
    I(eq, ps, 'compartido', 'demora', 'baja',
      [ev_m(eq), {'fuente': 'mapa', 'detalle': 'vagones → CR6 → CR4 → CR2 (P17) o CR1 (P18): comparte las cintas de recepción de los volcables'}],
      comentario='no frena por falla; compite por CR1/CR2 cuando se descargan vagones. Una OT sobre este equipo no afecta la descarga de camiones.')
# líquidos
I('TE-PLY-BLN-LECITNA', ['ACEITE_PTO'], 'directo', 'detiene', 'baja', [ev_m('TE-PLY-BLN-LECITNA')],
  comentario='única pieza del maestro que nombra la carga de camiones de lecitina en el puerto')
for eq in ('TE-ACT-LGC-BOMBAS LECITINA', 'TE-ACT-TNQ-TK2'):
    I(eq, ['ACEITE_PTO'], 'compartido', 'reduce_capacidad', 'baja', [ev_m(eq)])
for eq in ('TE-ACT-SLA-SALA BMB OSL', 'TE-ACT-LGC-TANQUES ACEITE OSL'):
    I(eq, ['ACEITE_OSL'], 'compartido', 'reduce_capacidad', 'baja', [ev_m(eq)])
for eq in ('PR-ACT-LGC-BOMBAS', 'PR-ACT-LGC-TANQUES', 'PR-ACT-LGC-ACEITE', 'PR-ACT-CÑR-OLD'):
    I(eq, ['ACEITE'], 'compartido', 'reduce_capacidad' if 'OLD' not in eq else 'ninguno', 'baja', [ev_m(eq)],
      comentario='no se encontró en el maestro la bomba o plataforma de carga/descarga de camiones de líquidos de Ricardone')

# 4) servicio: efecto calculado sacando el proveedor y lo que depende de él
ORDEN = {None: 0, 'ninguno': 0, 'demora': 1, 'reduce_capacidad': 2, 'detiene': 3}
def cierre_todo(prov):
    out, q = set(), [prov]
    while q:
        x = q.pop()
        for y in DEP_DURO.get(x, set()) | DEP_BLANDO.get(x, set()):
            if y not in out:
                out.add(y)
                q.append(y)
    return out


ESTATICO = {k: dict(v) for k, v in IMP.items()}   # impactos directos/aguas arriba ya cargados (antes de los de servicio)


def peor_estatico(equipos, p):
    efs = [v['efecto'] for k, v in ESTATICO.items() if k[0] in equipos and p in v['plataformas_excel']]
    return max(efs, key=lambda e: ORDEN[e]) if efs else None


for prov in sorted(set(DEP_DURO) | set(DEP_BLANDO)):
    duro = cierre(prov)
    blando = cierre_todo(prov) - duro
    for p in PLAT:
        ef_d = max((efecto_quitando(p, duro | {prov}) if duro else None, peor_estatico(duro, p)), key=lambda e: ORDEN[e])
        ef_b = max((efecto_quitando(p, blando) if blando else None, peor_estatico(blando, p)), key=lambda e: ORDEN[e])
        if ef_b == 'detiene':
            ef_b = 'reduce_capacidad'     # sin enclavamiento documentado no se puede decir que detiene
        ef = max((ef_d, ef_b), key=lambda e: ORDEN[e])
        cl = duro | blando
        if not ef or ef == 'ninguno':
            continue
        deps = sorted(cl & (ALC[p][0] if p in ALC else set()))
        conf_min = min([NIV[s['confianza']] for s in SERV if s['depende_de'] == prov] + [2])
        coment = []
        if deps:
            coment.append('lo que depende de este equipo está en el camino del grano: ' + ', '.join(nombre_corto(x) for x in deps[:8]))
        if ef_b and ORDEN[ef_b] >= ORDEN[ef_d] and ORDEN[ef_b] > 0:
            coment.append('dependencia no bloqueante (aspiración, filtro, quemador, lógico): si hay enclavamiento podría detener')
        I(prov, p, 'servicio', ef, INV[conf_min],
          [{'fuente': 'mapa', 'detalle': f'si {nombre_corto(prov)} cae, quedan fuera o sin servicio: ' + ', '.join(nombre_corto(x) for x in sorted(cl)[:12])
            + (' …' if len(cl) > 12 else '')}] + [s['evidencia'][0] for s in SERV if s['depende_de'] == prov][:2],
          comentario='; '.join(coment) or None)

# 5) adosados sin efecto (aireación, termometría, extracción, seguridad…) → se clasifican igual (regla 7)
ADOS = [
    (r'TE-ALM-VLV-V[123]\d\d$|TE-ALM-VLV-VC4\d\d$|TE-ALM-LGC-VALV BAJO CELDA', 'extracción: válvula de descarga de la celda (hacia las cintas de abajo); no frena la recepción'),
    (r'TE-ALM-VLV-P(4[89]|5[789]|6[567]|7[789]) DESC|TE-TNL-CNT-CBS[5-7]|TE-TNL-CNT-CBS4|TE-TNL-CNT-CBC[13]|TE-ALM-CNT-CBC2|TE-TDM-VLV-P[67][12]$', 'extracción de silo o celda: no frena la recepción'),
    (r'TE-ALM-VNT-A\d\d|TE-ALM-SIS-AIREACION|TE-ALM-SIS-VENTICELDA3|TE-ALM-VNT-VECSC3', 'aireación del almacenaje: no frena la recepción'),
    (r'TE-ALM-ASP-ASPERSOR|TE-ALM-BMB-BDN|TE-ALM-MLC|TE-ALM-SRN|TE-TDM-(ASP-ASPERSOR|BMB-BATM|BMB-BDPO|BMB-BR|BMB-BRPF|SRN|INCENDIO|ASC|MLC|PUL)', 'seguridad / anti-polución / servicios del edificio: no frena la descarga'),
    (r'TE-TDM-(AIR|CMP-AC|CMP-TM)', 'aire acondicionado de sala de CCM o tablero: no frena la descarga salvo que el CCM se dispare por temperatura'),
    (r'TE-TDM-GNR', 'generador de respaldo: sólo importa si se corta la energía'),
    (r'TE-ALM-(FLT-FMC4|VNT-VFMC4|RSC-RFMC4|BRL-BRFMC4|VLV-VRFMC4|BMB-BSTN1)', 'filtro de mangas de la Celda 4: si hay enclavamiento, la carga de la celda se frena'),
    (r'TE-ALM-(FLT-FMSV|BRL-BRFMSV|RSC-RFMSV|VLV-VDFMSV|VLV-VRFMSV|VLV-VRTNFMSV|VNT-VBRFMSV|VNT-VEFMSV|BMB-BSFMSV)', 'filtro de mangas de silos verticales: si hay enclavamiento, la carga de silos se frena'),
    (r'TE-ALM-(FLT-FMACSC3INF|VNT-VLFMACSC3INF|FLT-FMACSSD|VNT-VLFMACSSD)', 'filtro de mangas sobre celda 3 / silo diario'),
    (r'TE-ALM-LGC-ALMACENAJE|TE-ALM-CCM-', 'lógico o CCM del almacenaje'),
    (r'TE-TNL-VNT-IA[1-6]|TE-TNL-ASP-ACR6|TE-DCC-SIS-ASP. TUNEL|TE-DDC-SIS-ASPIRACION CH PV|TE-DCC-SIS-ASPIR', 'ventilación / aspiración de túneles y plataformas: no frena la descarga en el corto plazo'),
    (r'TE-DDC-LGC-DESCARGA CAMIONES|TE-TDM-LGC-(TORRE|ELEVADORES|CINTAS TRANSFERENCI|GALERIA|SIRENAS|BANCO)', 'activo lógico (agrupador del EAM): mirar el texto de la OT para saber qué equipo toca'),
    (r'TE-TE6-(FLT|BRZ|RSC|VNT|VLV-VR|MND|MLC|LGC)', 'Torre EL6: filtro EL9 / servicios; sólo importa para la carga de Celda 4'),
    (r'PR-PLYMP-VNT-(AIR|SA\d|SA-|ESCH|ASSKW|ASPS12|ASPS4|AIRS)|PR-PLYMP-SIS-TRM|PR-PLYMP-LDV|PR-PLYMP-HOM|PR-PLYMP-DSP-SV|PR-PLYMP-RSC-SV\d|PR-PLYMP-RSC-SCH\d|PR-PLYMP-SIS-VES12', 'aireación, termometría, barredoras o seguridad del silo: no frena la recepción'),
    (r'PR-PLYMP-(FLT-FMKW|VNT-ASFMKW|RSC-FMKW|SAP-FMKW|VLV-VDFMKW|SIS-LMPFMKW|VNT-LMPFMKW)', 'filtro de mangas de silos KW'),
    (r'PR-PLYMP-(CRB|ZRN-ZD|RDL-TSS5|RSC-SF0[12]PRL1|VLV-RM[1-4])', 'prelimpieza de colza-camelina sobre N-10/N-10A: desvío opcional'),
    (r'PR-PLYMP-LGC-(CINTAS|NORIAS|REDLERS|ROSCAS|PRELIMP|SILOS|SIST ASP|PLAYA Y MP)', 'activo lógico (agrupador del EAM): mirar el texto de la OT para saber qué equipo toca'),
    (r'PR-PLYMP-(CNT-CBSKW|CRR-CBSKW|SLO-SEKW|VLV-.?DSE[12]KW|VLV- DSE2KW)', 'extracción / expedición de silos KW: no frena la recepción'),
    (r'PR-PLYMP-(CNT-CBSC16|CRR-CBS16|SLO-SE0|GLL-SE0|VNT-AIR-\d\dC16)', 'extracción / expedición de Celda 16: no frena la recepción'),
    (r'PR-PLYMP-(RDL-SCH0[1-57-9]|RDL-SCH1[01]|NOR-N13SCH|SIS-TRM-SVCHF)', 'redlers/noria de carga y trasvase de silos Chief'),
]


def plats_de(code):
    return sorted({p for k, v in IMP.items() if k[0] == code for p in v['plataformas_excel']})


ANCLA = [  # a qué equipo de la cadena se adosa cada familia
    (r'TE-ALM-VLV-V1\d\d|TE-TNL-CNT-CBC1|TE-TDM-VLV-P6[12]', 'TE-ALM-CLD-CELDA 1'),
    (r'TE-ALM-VLV-V2\d\d|TE-ALM-CNT-CBC2|TE-TDM-VLV-P7[12]', 'TE-ALM-CLD-CELDA 2'),
    (r'TE-ALM-VLV-V3\d\d|TE-TNL-CNT-CBC3|TE-ALM-(ASP-ASPERSOR CELDA 3|BMB-BDN3|SIS-VENTICELDA3|VNT-VECSC3|FLT-FMACSC3INF|VNT-VLFMACSC3INF)', 'TE-ALM-CLD-CELDA 3'),
    (r'TE-ALM-(VLV-VC4|LGC-VALV BAJO CELDA 4|ASP-ASPERSOR CELDA 4|FLT-FMC4|VNT-VFMC4|RSC-RFMC4|BRL-BRFMC4|VLV-VRFMC4|BMB-BSTN1)', 'TE-ALM-CLD-CELDA 4'),
    (r'TE-ALM-(BMB-BDN1|LGC-VALV BAJO CELDA 1)', 'TE-ALM-CLD-CELDA 1'),
    (r'TE-ALM-(BMB-BDN2|LGC-VALV BAJO CELDA 2)', 'TE-ALM-CLD-CELDA 2'),
    (r'TE-ALM-VLV-P(4[89])|TE-TNL-CNT-CBS4|TE-ALM-SIS-AIREACION SILO 4', 'TE-ALM-SLO-SILO 4'),
    (r'TE-ALM-VLV-P5[789]|TE-TNL-CNT-CBS5|TE-ALM-VNT-A\d5|TE-ALM-SIS-AIREACION SILO 5|TE-ALM-SRN', 'TE-ALM-SLO-SILO 5'),
    (r'TE-ALM-VLV-P6[567]|TE-TNL-CNT-CBS6|TE-ALM-VNT-A\d6|TE-ALM-SIS-AIREACION SILO 6', 'TE-ALM-SLO-SILO 6'),
    (r'TE-ALM-VLV-P7[789]|TE-TNL-CNT-CBS7|TE-ALM-VNT-A\d7|TE-ALM-SIS-AIREACION SILO 7', 'TE-ALM-SLO-SILO 7'),
    (r'TE-ALM-(FLT-FMSV|BRL-BRFMSV|RSC-RFMSV|VLV-VDFMSV|VLV-VRFMSV|VLV-VRTNFMSV|VNT-VBRFMSV|VNT-VEFMSV|BMB-BSFMSV|MLC|LGC-ALMACENAJE \(SILOS\)|CCM-CCMBS4)', 'TE-ALM-CNT-CSS4'),
    (r'TE-ALM-(FLT-FMACSSD|VNT-VLFMACSSD)', 'TE-ALM-CNT-CSSDIARIO'),
    (r'TE-ALM-LGC-ALMACENAJE\(CELDAS\)|TE-ALM-CCM-CCMBC', 'TE-ALM-CLD-CELDA 3'),
    (r'TE-TNL-VNT-IA5|TE-DDC-SIS-ASPIRACION CH PV|TE-DCC-SIS-ASPIR|TE-DDC-LGC-DESCARGA CAMIONES', 'TE-TNL-CNT-CR1'),
    (r'TE-TNL-VNT-IA[1-46]|TE-TNL-ASP-ACR6|TE-DCC-SIS-ASP. TUNEL', 'TE-TNL-CNT-CR0'),
    (r'TE-TDM-', 'TE-TDM-NOR-EL2'),
    (r'TE-TE6-', 'TE-TE6-NOR-EL6'),
    (r'PR-PLYMP-VNT-(AIR-\d+C16|AIR.*TUNEL C16)|PR-PLYMP-(CNT-CBSC16|CRR-CBS16|SLO-SE0|GLL-SE0|SIS-TRM-C16)', 'PR-PLYMP-SLO-DMP16'),
    (r'PR-PLYMP-.*(KW|SKW|SV\d|SV-|SEKW|DSE[12]KW)|PR-PLYMP-(DSP-SV|RSC-SV|HOM-SKW|CRB|ZRN-ZD|RDL-TSS5|RSC-SF0[12]PRL1|VLV-RM[1-4])', ('PR-PLYMP-SLO-SVKW01', 'PR-PLYMP-SLO-SVKW06')),
    (r'PR-PLYMP-.*(SCH|CHIEF|CHF)|PR-PLYMP-VNT-SA\d|PR-PLYMP-VNT-ESCH', 'PR-PLYMP-SLO-SVCHF01'),
    (r'PR-PLYMP-(SIS-TRM-DMP0|VNT-AIRS|LDV-LS0|SLO-DMP0[1-3])', 'PR-PLYMP-SLO-DMP05'),
    (r'PR-PLYMP-LGC-', 'PR-PLYMP-NOR-N08PTV2'),
]
SIN_CADENA = []
for code in sorted(MA):
    if not re.match(r'(PR-(PLYMP|PRL[12]|EXP|CCM|REL|PLYSP)|TE-(DDC|DCC|TNL|TDM|TE6|ALM|SEC|SCD|PLY|EXP|TRF|DDV))-', code):
        continue
    if any(k[0] == code for k in IMP):
        continue
    motivo = next((m for rx, m in ADOS if re.match(rx, code)), None)
    ancla = next((a for rx, a in ANCLA if re.match(rx, code)), None)
    anclas = ancla if isinstance(ancla, tuple) else (ancla,) if ancla else ()
    ps = sorted({p for a in anclas for p in plats_de(a)})
    ancla = anclas[0] if anclas else None
    if motivo and ps:
        ef = 'reduce_capacidad' if 'enclavamiento' in motivo else 'ninguno'
        I(code, ps, 'compartido' if 'lógico' in motivo else 'aguas_abajo', ef, 'baja',
          [ev_m(code), {'fuente': 'mapa', 'detalle': f'adosado a {nombre_corto(ancla)}: {motivo}'}], comentario=motivo)
    else:
        SIN_CADENA.append({'codigo_activo': code, 'nombre': desc(code),
                           'motivo': motivo or 'no se encontró vínculo con una plataforma de camiones'})
# prelimpieza 1 y 2 de Ricardone: no se ubicó su cadena → también quedan en SIN_CADENA (ver preguntas)

# ----------------------------------------------------------------------------- activos
def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]', '', s)


CLASE_IFC = {'IFCROOF': 'IfcRoof', 'IFCSLAB': 'IfcSlab', 'IFCBUILDINGELEMENTPROXY': 'IfcBuildingElementProxy',
             'IFCWALLSTANDARDCASE': 'IfcWallStandardCase', 'IFCWALL': 'IfcWall'}
IFC_SECT = defaultdict(list)
IFC_NODO = defaultdict(list)
for f, L in IFC.items():
    for e in L:
        p = e['props']
        l2 = (p.get('BTZ_Label_02') or '').split('\r')[0].strip()
        ref = {'guid': e['guid'], 'clase': CLASE_IFC.get(e['clase'], e['clase']),
               'nombre': e['objeto'] or e['nombre'], 'nivel': e['contenedor'], 'archivo': f}
        if l2:
            IFC_SECT[(f, norm(l2))].append(ref)
        if p.get('Nodo_inst'):
            IFC_NODO[p['Nodo_inst']].append(ref)
SECT_INF = [(r'TE-ALM-(CLD|CNT-C[S0-9]|CNT-CBC|CRR|VLV-V|VLV-VC|VLV-VG|LGC-VALV|ASP|BMB-BDN|CCM-CCMBC|FLT-FMC4|FLT-FMACSC3)', 'Almacenaje(Celdas)'),
            (r'TE-ALM-', 'Almacenaje (Silos)'), (r'TE-(SEC|SCD)-', 'Secadora'), (r'TE-DCC-', 'Descarga Camiones')]
NODO_IFC = [(r'PR-PLYMP-(CDR|CHD-CA|LGC-CALAD|BMB-SCAL|CNT-CLD)', 'CALADA'),
            (r'PR-PLYMP-(SLO-DMP16|CNT-CSSC16|CNT-CBVC16|CNT-CBSC16|TRR-MC16|CRR-CSS16|CRR-CBS16)', 'CELDA_16'),
            (r'PR-PLYMP-(SLO-SVKW|CNT-C[SB]SKW|CRR-C[SB]SKW)', 'SILOS_KEPLER'),
            (r'PR-EXP-(BLN|LGC-BALANZA)', 'BALANZA'), (r'PR-EXP-(LGC-PREINGRESO|CMR-CMRPI|CBN-CBNPI)', 'PRE_INGRESO')]


def ifc_de(code):
    for rx, nd in NODO_IFC:
        if re.match(rx, code):
            return [dict(r, nivel=f"{r['nivel']} (edificio del nodo {nd})") for r in IFC_NODO[nd]]
    return []


def sector_ifc(code):
    pl = code.split('-')[0]
    f = IFC_FILES.get(pl)
    sec = MA[code].label_2.strip()
    if not sec:
        sec = next((s for rx, s in SECT_INF if re.match(rx, code)), '')
    return f'{f}|{sec}' if f and sec and (f, norm(sec)) in IFC_SECT else None


USADOS = set()
for f in FLOW:
    USADOS |= {f['desde'], f['hasta'], *f['via']}
for s in SERV:
    USADOS |= {s['equipo'], s['depende_de']}
USADOS |= {k[0] for k in IMP}


def funcion(code):
    rec = sorted({nombre_corto(FLOW[i]['desde']) for _, _, i in RADJ.get(code, [])})
    ent = sorted({nombre_corto(FLOW[i]['hasta']) for _, _, i in ADJ.get(code, [])})
    vias = sorted({f"{nombre_corto(f['desde'])}→{nombre_corto(f['hasta'])}" for f in FLOW if code in f['via']})
    if vias:
        return 'Válvula/carro en el tramo ' + ', '.join(vias)
    partes = []
    if rec:
        partes.append('Recibe de ' + ', '.join(rec))
    if ent:
        partes.append('entrega a ' + ', '.join(ent))
    if partes:
        return ' y '.join(partes)
    usa = sorted({nombre_corto(s['equipo']) for s in SERV if s['depende_de'] == code})
    if usa:
        return 'Da servicio a ' + ', '.join(usa[:10]) + (' …' if len(usa) > 10 else '')
    return desc(code)


ACTIVOS = []
for code in sorted(USADOS):
    r = MA[code]
    sk = sector_ifc(code)
    ACTIVOS.append({'codigo_activo': code, 'nombre': r.descripcion_activo.strip(), 'planta': PLANTA.get(code.split('-')[0], r.planta),
                    'sector': r.label_2.strip(), 'tipo': tipo_de(code), 'funcion': funcion(code),
                    'ifc': ifc_de(code), 'ifc_sector': sk, 'capacidad_t_h': None})
    if not r.label_2.strip():
        s_inf = next((s for rx, s in SECT_INF if re.match(rx, code)), None)
        if s_inf:
            ACTIVOS[-1]['sector_inferido'] = s_inf
missing = [a['codigo_activo'] for a in ACTIVOS if not any(k[0] == a['codigo_activo'] for k in IMP)]
RAMPAS_SIN_EXCEL = {'PR-PRL3-PTV-CAM03', 'PR-PRL3-CHD-PTV3', 'PR-PLYMP-PTV-CAM04', 'PR-PLYMP-CHD-PTV04', 'PR-AGR-PTV-CAM05',
                    'PR-AGR-CHD-PTV05', 'PR-PLYMP-PTV-CAM09', 'PR-PLYMP-CHD-PTV09', 'PR-PLYMP-NOR-N15'}
for code in missing:   # regla 7: todo lo que está en el mapa queda clasificado, aunque no se lo pueda ligar a una plataforma
    en_flujo = code in {f['desde'] for f in FLOW} | {f['hasta'] for f in FLOW} | {v for f in FLOW for v in f['via']}
    if code in RAMPAS_SIN_EXCEL:
        motivo = 'rampa volcable (o su hidráulica/noria) sin plataforma en el Excel de movimientos: ver preguntas'
    elif en_flujo and code.startswith('TE'):
        motivo = ('está en el flujo de granos del puerto pero no en el camino de los camiones según el mapa '
                  '(se alimenta de vagones, del silo 4, de la balanza de recepción 3 o es extracción/embarque)')
    elif code.startswith(('PR-PRL', 'PR-CCM-CCM-PLPZ')):
        motivo = 'Prelimpieza 1/2: no se encontró vínculo con ninguna plataforma de camiones (ver preguntas)'
    else:
        motivo = 'no se identificó efecto sobre una plataforma de camiones'
    I(code, [], 'compartido', 'ninguno', 'baja', [ev_m(code), {'fuente': 'mapa', 'detalle': motivo}], comentario=motivo)

# ----------------------------------------------------------------------------- grupos redundantes
GR = [
    dict(id='caladores_ricardone', miembros=CALADA, nodo_circuito='ricardone:Calada', capacidad_con_uno_menos=None,
         comentario='Tres caladores automáticos (1 oeste, 2 central, 3 este). En 2026 el CA01 tuvo 29 OT, el CA02 18 y el CA03 8: el 1 es el que más falla. No hay dato de capacidad por calador en el EAM.'),
    dict(id='basculas_ricardone', miembros=BAL_R, nodo_circuito='ricardone:Balanza Ingreso', capacidad_con_uno_menos=None,
         comentario='Tres básculas fijas y una móvil (CAM4). Se usan para ingreso y egreso.'),
    dict(id='basculas_puerto', miembros=BAL_T, nodo_circuito='san_lorenzo:Balanza Ingreso', capacidad_con_uno_menos=None, comentario='Dos básculas de camiones (sur y norte).'),
    dict(id='cintas_recepcion_pv1_pv2', miembros=['TE-TNL-CNT-CR1', 'TE-TNL-CNT-CR2'], nodo_circuito='san_lorenzo:Plataformas Volcables', capacidad_con_uno_menos=None,
         comentario='PV1 y PV2 sólo tienen válvulas a CR1 (A, B, C) y CR2 (D, E, F). CR2 es exclusiva del par; CR1 la comparten los cuatro volcables.'),
    dict(id='cintas_recepcion_pv3_pv4', miembros=['TE-TNL-CNT-CR0', 'TE-TNL-CNT-CR1'], nodo_circuito='san_lorenzo:Plataformas Volcables', capacidad_con_uno_menos=None,
         comentario='PV3 y PV4 sólo tienen válvulas a CR1 (A, B, C) y CR0 (D, E, F). CR0 es exclusiva del par.'),
    dict(id='elevadores_recepcion_puerto', miembros=['TE-TDM-NOR-EL1', 'TE-TDM-NOR-EL2', 'TE-TDM-NOR-EL3'], nodo_circuito='san_lorenzo:Plataformas Volcables',
         capacidad_con_uno_menos=None, comentario='CR1 y CR2 caen a EL1 o EL2; CR0 cae a EL1, EL2 o EL3. No se encontró a dónde descarga EL1.'),
    dict(id='norias_ptv6_kw', miembros=['PR-PLYMP-NOR-N10PTV6', 'PR-PLYMP-NOR-N10/APTV6'], nodo_circuito='ricardone:Volcable Silo Keppler', capacidad_con_uno_menos=None,
         comentario='PTV6 tiene dos norias (sur y norte).'),
    dict(id='volcables_celda16', miembros=['PR-PLYMP-PTV-CAM08', 'PR-PLYMP-PTV-CAM10'], nodo_circuito='ricardone:Celda 16', capacidad_con_uno_menos=None,
         comentario='Las rampas 8 y 10 descargan sobre la misma cinta CBVC16 (OT PSL-94830).'),
    dict(id='volcables_kepler', miembros=['PR-PLYMP-PTV-CAM06', 'PR-PLYMP-PTV-CAM07'], nodo_circuito='ricardone:Volcable Silo Keppler', capacidad_con_uno_menos=None,
         comentario='Líneas independientes (sur / norte) hasta los silos: si cae una, la otra sigue, pero a otros silos.'),
    dict(id='prelimpiadores_secadora_ric', miembros=['PR-PLYMP-PLN-RSG1N', 'PR-PLYMP-PLN-RSG2S'], nodo_circuito='ricardone:Volcable 1', capacidad_con_uno_menos=None,
         comentario='Dos prelimpiadores neumáticos sobre la noria 04 de la secadora.'),
    dict(id='prelimpiadores_n08', miembros=['PR-PLYMP-PLN-PL1N8', 'PR-PLYMP-PLN-PL2N8'], nodo_circuito='ricardone:Volcable 2', capacidad_con_uno_menos=None,
         comentario='Dos prelimpiadores neumáticos sobre la noria 08 del volcable 2.'),
    dict(id='cruceros_ricardone', miembros=['PR-PLYMP-RDL-RCRU1', 'PR-PLYMP-RDL-RCRU2', 'PR-PLYMP-CNT-CRU2'], nodo_circuito='ricardone:Volcable 1', capacidad_con_uno_menos=None,
         comentario='Salidas de RSG-1 (hipótesis).'),
]

# ----------------------------------------------------------------------------- clasificación de trabajos
CLS = {
    'detienen_equipo': [r'PARADA ANUAL|^PA |P\. ?ANUAL|TRABAJOS (VARIOS )?(EN|DE|POR) PARADA', r'CAMBIO COMPLETO',
                        r'CAMBI(O|AR) (DE )?(LA )?(CINTA|BANDA)', r'CAMBI(O|AR) (DE )?(EL )?REDUCTOR|ROTURA', r'CAMBI(O|AR) (DE )?MOTOR|MOTOR QUEMADO',
                        r'CADENA .*(DESMONT|CORTAD|ROTA)|CAMBI(O|AR) (DE )?CADENA', r'CAMBI(O|AR) (DE )?(CILINDRO|PISTON)', r'TAMBOR DE MANDO|ROLO DE MANDO',
                        r'CAMBI(O|AR) (DE )?(ACOPLAMIENTO|ACOPLE|MANCHON)', r'CAMBI(O|AR) (DE )?RODAMIENTO', r'FUERA DE SERVICIO|\bF/S\b|INHABILITAD|SE CORT[OÓ] (EL )?EJE',
                        r'CAMBI(O|AR) (DE )?TRANSMISI', r'CANGILON', r'REVAMPING', r'SACAR CAIDA', r'CAMBI(O|AR) (DE )?LANZA', r'TRABAD[OA]'],
    'no_detienen': [r'ILUMINACI|LUMINARI|ARTEFACTO|REFLECTOR|TUBOS|\bLED\b', r'CAPACITACI|\b5S\b', r'CONTROL DE CCMS|BANCO DE CAPACITORES',
                    r'CONTROL DE TRANSFORMADORES|ANALISIS DE ACEITES', r'TERMOGRAF', r'RECORRIDA|INSP(ECCI[OÓ]N)? VISUAL', r'BIOMETRIC|CERRADURA',
                    r'PINTUR|CARTEL|BARANDA|PORTA CANDADO|LINEAS? DE VIDA', r'PRECINTAR|CONECTAR PAT|SELLA', r'AIRE ACONDICIONADO|OFICINA|GARITA|BAÑO',
                    r'CONTROL SEMANAL', r'SIRENA|ALARMA BAJADA DE PALAS'],
    'dudosos': [r'CAMBI(O|AR) (DE )?(ROLO|RODILLO)', r'CERAMIZ', r'(REPARA\w*|REPARACION) (DE )?(LA )?CAIDA', r'TERMOMETR', r'LIMPIEZA',
                r'CAMBI(O|AR) (DE )?(MANGAS|FILTRO)', r'MANGUERA', r'REVISAR', r'CORTINA', r'SENSOR', r'VALVULA ROTATIVA', r'TENSAR|ALINEAR'],
}
D_ = OT[OT.Nro_Activo.isin(USADOS)].Descripcion.str.upper()
clas = {}
for k, pats in CLS.items():
    clas[k] = [{'patron': p, 'ot_en_el_mapa': int(D_.str.contains(p, regex=True).sum())} for p in pats]
clas['_uso'] = ('Regex sobre el texto de la OT en mayúsculas. Orden: si matchea «detienen_equipo», el equipo queda fuera de servicio; '
                'si sólo matchea «no_detienen», la OT no afecta la descarga; el resto es dudoso. La prioridad Emergencia/Urgente '
                'y el estado «En espera de parada» también indican parada. `ot_en_el_mapa` = OT del corpus sobre activos del mapa que matchean.')

# ----------------------------------------------------------------------------- validación de casos


def efx(eq, p):
    ks = [v for k, v in IMP.items() if k[0] == eq and p in v['plataformas_excel']]
    return ks[0]['efecto'] + f" ({ks[0]['relacion']}, {ks[0]['confianza']})" if ks else 'sin vínculo'


VC = [
    dict(caso='secadora_ric_0731', confirma=True, grado='parcial',
         explicacion=f"La secadora CEDAR (PR-PLYMP-SCD-CED) queda aguas abajo de los dos volcables: Volcable 1 → {efx('PR-PLYMP-SCD-CED', 'VOLCABLE_1')}; "
                     f"Volcable 2 → {efx('PR-PLYMP-SCD-CED', 'VOLCABLE_2')}. El mapa dice que al Volcable 2 lo detiene; los datos muestran demora (903–1.324 min), "
                     "no cero. Eso sugiere un bypass de la secadora que no encontramos. Los vínculos son de confianza baja."),
    dict(caso='csg3_0629', confirma=True, grado='parcial',
         explicacion=f"CSG-3 → Volcable 2: {efx('PR-PLYMP-CNT-CSG3', 'VOLCABLE_2')}; Volcable 1: {efx('PR-PLYMP-CNT-CSG3', 'VOLCABLE_1')}. "
                     "Ojo: el vínculo N-08 → CSG-3 salió de este mismo caso, así que el caso no lo prueba. Lo que sí es independiente: la OT PSL-79346 dice que CSG-3 es la «cinta salida a secadora»."),
    dict(caso='cruceros_0909', confirma=True, grado='parcial',
         explicacion=f"RSG-1 → V1 {efx('PR-PLYMP-RDL-RSG1CRU', 'VOLCABLE_1')}, V2 {efx('PR-PLYMP-RDL-RSG1CRU', 'VOLCABLE_2')}; "
                     f"RCR-2 → V1 {efx('PR-PLYMP-RDL-RCRU2', 'VOLCABLE_1')}. Los cruceros quedan aguas abajo de los dos volcables, lo que explica que demoren juntos. "
                     "Confianza baja: el camino se armó con los nombres y los casos."),
    dict(caso='noria8_0912', confirma=True, grado='total',
         explicacion=f"N-08 es la única noria de la rampa 2 (maestro «NORIA N-08 PTV Nº 2»): {efx('PR-PLYMP-NOR-N08PTV2', 'VOLCABLE_2')}. "
                     "La OT de cambio completo (PSL-94586) sigue Liberada: el equipo sigue malo."),
    dict(caso='pv2_0824', confirma=True, grado='total',
         explicacion=f"PV2 es la plataforma misma ({efx('TE-DDC-PTV-PV2', 'VOLCABLE_PTO_2')}). PV4 puede absorber porque no comparte la CR2 "
                     "con PV2: usa CR1 y CR0."),
    dict(caso='pares_pv', confirma=True, grado='total',
         explicacion="Lo explican las válvulas bajo cada volcable (maestro): PV1 y PV2 sólo descargan a CR1 y CR2; PV3 y PV4 sólo a CR1 y CR0. "
                     "Cada par tiene una cinta exclusiva (CR2 o CR0) y los cuatro comparten CR1. Si el par PV1+PV2 cae, CR1 queda libre y entra PV4. "
                     "Confianza media: sale de la descripción de las válvulas, no del IFC."),
    dict(caso='celda4_0916', confirma=False, grado='parcial',
         explicacion="La Celda 4 se carga por C6/C7 → C8/C9. A C7 llega C01 (VG27), y a C01 llegan EL2 y EL3. PV1 y PV2 sólo llegan a EL1 y EL2; PV3 y PV4 llegan además a EL3. "
                     "Pero EL2 también tiene salida a CT2 (Q13) → silos, así que el mapa no explica por qué PV1+PV2 quedaron en cero. Faltan dos datos: a dónde descarga EL1 y "
                     "si CT2 tenía lugar. Además las OT de la parada figuran Liberadas o No despachadas."),
    dict(caso='pv3_0902', confirma=False, grado='parcial',
         explicacion="C01 queda aguas abajo de PV3 (CR0 → EL3 → Q08 → C01), pero PV3 y PV4 tienen las mismas válvulas y los mismos destinos. "
                     "El mapa no puede separar PV3 de PV4: la diferencia tiene que ser operativa (qué volcable se asigna a qué ruta) o una válvula PV3D/E/F. "
                     "La OT PSL-87836 cambió la cuchilla de la PV3 E en marzo."),
    dict(caso='celda16_08', confirma=True, grado='total',
         explicacion=f"El carro distribuidor de la cinta sobre Celda 16 (PR-PLYMP-CRR-CSS16) es paso obligado: {efx('PR-PLYMP-CRR-CSS16', 'CELDA_16')}. "
                     "Si no se mueve, la celda no se llena. La OT PSL-93567 (sacar caída, enderezar el carro) figura Finalizada el 14/08."),
    dict(caso='kepler1_0905', confirma=True, grado='parcial',
         explicacion=f"Si KEPPLER_1 es la rampa 7 (norte): {efx('PR-PLYMP-PTV-CAM07', 'KEPPLER_1')}. La correspondencia KEPPLER_1 = rampa 7 sale de este caso "
                     "(hay que confirmarla). La CBS KW-4 es cinta bajo silos (extracción): no frena la recepción salvo que los silos estén llenos."),
    dict(caso='calada_puerto', confirma=True, grado='total',
         explicacion="Los caladores de Ricardone están aguas arriba de todas las plataformas del puerto (R7 cala en ricardone:Calada). Efecto: demora, confianza media."),
    dict(caso='barrera_0611', confirma=True, grado='total',
         explicacion="La barrera de ingreso a la playa (TE-PLY-LGC-SECTOR PLAYA, OT PSL-91058 del 11/06: «quedó fuera de servicio») es aguas arriba y común a los 5 volcables."),
]

# ----------------------------------------------------------------------------- preguntas
PQ = [
    dict(tema='A dónde descarga el elevador EL1 de la torre de manipuleo', a_quien_preguntar='Operaciones / supervisor Terminal Embarque',
         por_que_importa='CR1 y CR2 caen a EL1 o EL2. Sin el destino del EL1 no se sabe si PV1 y PV2 dependen del EL2, ni por qué quedaron en cero con la parada de la Celda 4.'),
    dict(tema='Con la Celda 4 parada, ¿por qué PV1 y PV2 no pueden desviar a silos por EL2 → Q13 → CT2?', a_quien_preguntar='Operaciones Terminal Embarque',
         por_que_importa='Es el único caso que el mapa no explica (celda4_0916).'),
    dict(tema='¿Qué diferencia a PV3 de PV4 aguas abajo? (parada anual de C01, 02/09)', a_quien_preguntar='Operaciones Terminal Embarque',
         por_que_importa='En el maestro PV3 y PV4 tienen las mismas válvulas y los mismos destinos; los datos dicen que sólo PV3 cayó.'),
    dict(tema='¿Qué CCM alimenta volcables, centrales hidráulicas y cintas CR0–CR6: el piso 0 o el piso 2 de la torre?', a_quien_preguntar='Mantenimiento eléctrico TE',
         por_que_importa='Se cargó el agrupador «CCM torre de manipuleo» con confianza baja. Con el unifilar se sabe qué plataformas se apagan juntas si cae un CCM.'),
    dict(tema='Sentido de la válvula P38 entre CT1 y la tolva de PV5', a_quien_preguntar='Operaciones TE',
         por_que_importa='El maestro dice «TOLVA PV5 A CT1» y dos OT dicen que CT1 descarga en la tolva de PV5. Si CT1 manda grano a la tolva, PV5 no puede recibir camiones mientras tanto.'),
    dict(tema='Camino del girasol de los volcables 1 y 2 de Ricardone hasta la secadora CEDAR, y si hay bypass', a_quien_preguntar='Jefe de Materia Prima Ricardone',
         por_que_importa='Toda la cadena es de confianza baja salvo CSG-3 → secadora. Con OT en la secadora los datos muestran demora, no cero, así que puede haber bypass. También falta saber si pasa todo el girasol o sólo el húmedo.'),
    dict(tema='¿La CSG-3 y los cruceros (RSG-1, RCR-1, RCR-2, cinta crucero 2) son el camino de los volcables 1 y 2? ¿A qué celdas llegan?', a_quien_preguntar='Jefe de Materia Prima Ricardone',
         por_que_importa='Sólo RCR-2 → silo 5 tiene OT que lo diga (PSL-94897).'),
    dict(tema='Correspondencia entre rampas del EAM y plataformas del Excel', a_quien_preguntar='Logística Ricardone (quien arma el Excel de movimientos)',
         por_que_importa='Supuesto: VOLCABLE_1 = rampa 1, VOLCABLE_2 = rampa 2, CELDA_16 = rampas 8 y 10, KEPPLER_1 = rampa 7 (norte), KEPPLER_2 = rampa 6 (sur). Las rampas 3, 4, 5 y 9 no tienen plataforma en el Excel.'),
    dict(tema='Destino de las norias N-12 (rampa 8), N-15 (rampa 9) y N-16 (rampa 10): «caída silo pulmón»', a_quien_preguntar='Jefe de Materia Prima Ricardone',
         por_que_importa='Se supuso que N-12 y N-16 suben a la torre de la Celda 16. Si van a un silo pulmón de proceso, la Celda 16 tiene otra cadena.'),
    dict(tema='¿Cuántos caladores hacen falta para calar a ritmo normal? ¿Cuántos camiones por hora cala cada uno?', a_quien_preguntar='Calidad / calada Ricardone',
         por_que_importa='Sin eso no se puede estimar la capacidad de la calada con un calador menos.'),
    dict(tema='Enclavamientos: ¿qué equipos no arrancan si su filtro de mangas o su aspiración están parados?', a_quien_preguntar='Mantenimiento eléctrico / automatización',
         por_que_importa='Se cargaron como «aire» con confianza baja. Si hay enclavamiento, un filtro detiene la cinta o el volcable.'),
    dict(tema='Equipos de carga y descarga de líquidos: ACEITE (Ricardone) y ACEITE_PTO', a_quien_preguntar='Sector aceite Ricardone y Terminal',
         por_que_importa='No se encontró en el maestro la bomba ni la plataforma de carga de camiones de Ricardone, ni la del puerto (sólo la balanza de lecitina).'),
    dict(tema='Prelimpieza 1 y 2 y Girasol: ¿reciben grano directo de algún volcable?', a_quien_preguntar='Jefe de Materia Prima / Preparación Ricardone',
         por_que_importa='No se encontró ninguna OT ni descripción que las conecte con una plataforma; quedaron en «activos_revisados_sin_cadena».'),
    dict(tema='¿Hay un IFC con equipos, o un diagrama de flujo (P&ID)?', a_quien_preguntar='Ingeniería / BIM',
         por_que_importa='Los IFC entregados sólo tienen volúmenes de edificio por sector: no hay puertos, sistemas ni equipos. Por eso ningún vínculo es de confianza alta.'),
]

# ----------------------------------------------------------------------------- salida
IMPL = sorted(IMP.values(), key=lambda v: (v['nodo_circuito'] or '~', v['equipo'], v['relacion']))
cortes = {}
for p, d in PLAT.items():
    if not d['raices']:
        cortes[p] = 'no se identificó en el maestro el equipo de la plataforma; sólo hay activos compartidos y aguas arriba'
        continue
    vis, sinks = ALC[p]
    reales = [s for s in sinks if s in SINKS and s not in EXTERNOS]
    desc_ = [s for s in sinks if s not in SINKS or s in EXTERNOS]
    if not reales:
        cortes[p] = 'la cadena no llega a un destino conocido: se corta en ' + ', '.join(nombre_corto(x) for x in sorted(desc_))
    elif desc_:
        cortes[p] = 'completa hasta ' + ', '.join(nombre_corto(x) for x in sorted(reales)[:6]) + '; además hay ramas que se cortan en ' + ', '.join(nombre_corto(x) for x in sorted(desc_))
    else:
        cortes[p] = 'completa hasta ' + ', '.join(nombre_corto(x) for x in sorted(reales)[:8])

out = {
    'version': '1',
    'generado': date.today().isoformat(),
    'fuentes': {'ifc': IFC_DESC, 'eam': EAM_EXPORT, 'maestro_activos': 'eam_bimtrazer/tables/activos.csv (maestro corregido, 6.178 activos)',
                'otros': ['circuito_descarga_nodos.json', 'grafo_mantenimiento_borrador.json', 'agentes/conocimiento/HISTORICO_COMITES.md (pellet por PV3/PV4, productos por circuito)']},
    'notas': [
        'Los IFC no tienen IfcRelConnectsPorts, IfcDistributionSystem ni equipos: son volúmenes de edificio (techos y modelos genéricos) con etiquetas BTZ por sector. '
        'Ningún vínculo de flujo pudo salir del IFC, por eso no hay confianza «alta». `ifc` lista sólo el edificio de un nodo del circuito (Nodo_inst) cuando lo hay; `ifc_sector` apunta al volumen del sector en `ifc_sectores`.',
        '`efecto` en impacto_descarga NO es a mano: se calcula sacando el equipo (o el proveedor de servicio y todo lo que depende de él) del grafo. '
        '«detiene» = el grano ya no llega a ningún destino; «reduce_capacidad» = llega por otro camino. Es lo que pasa si el equipo queda FUERA DE SERVICIO: '
        'cruzalo con `clasificacion_trabajos` para saber si la OT lo saca de servicio.',
        'Un nodo sin salida conocida se trata como destino desconocido (ver `cortes_por_plataforma`). Eso evita marcar «detiene» por falta de datos, pero puede subestimar.',
        'En `flujo_grano`, `via` son las válvulas o carros del tramo; hay válvulas duplicadas en el EAM (TE-ALM-VLV-P81 y TE-TDM-VLV-P81, etc.): se listan las dos.',
        'Las cadenas de carga (SILO_CHIEF_2, CARGA_SILO_10/11) se analizan al revés: del silo a la tolva.',
        'Fuentes de evidencia: maestro (descripción del activo), ot (texto de la OT), nombre (inferido del nombre), caso_descarga (lo observado en los datos del pedido), mapa (cálculo sobre el grafo), circuito, comite.',
    ],
    'ifc_sectores': None,   # se completa abajo
    'activos': ACTIVOS,
    'flujo_grano': FLOW,
    'dependencias_servicio': SERV,
    'impacto_descarga': IMPL,
    'grupos_redundantes': GR,
    'clasificacion_trabajos': clas,
    'validacion_casos': VC,
    'preguntas_abiertas': PQ,
    'cortes_por_plataforma': cortes,
    'activos_revisados_sin_cadena': [x for x in SIN_CADENA if x['codigo_activo'] not in USADOS and not any(k[0] == x['codigo_activo'] for k in IMP)],
}
# ifc_sectores con clave legible (archivo|sector tal como está en el IFC)
sect = {}
for f, L in IFC.items():
    for e in L:
        l2 = (e['props'].get('BTZ_Label_02') or '').split('\r')[0].strip()
        if l2:
            key = f'{f}|{l2}'
            sect.setdefault(key, []).append({'guid': e['guid'], 'clase': CLASE_IFC.get(e['clase'], e['clase']), 'nombre': e['objeto'] or e['nombre'],
                                             'nivel': e['contenedor'], 'nodo_inst': e['props'].get('Nodo_inst')})
# normalizar las claves ifc_sector de los activos a las del IFC
keymap = {(k.split('|')[0], norm(k.split('|')[1])): k for k in sect}
for a in ACTIVOS:
    if a['ifc_sector']:
        f, s = a['ifc_sector'].split('|')
        a['ifc_sector'] = keymap.get((f, norm(s)))
used_keys = {a['ifc_sector'] for a in ACTIVOS if a['ifc_sector']}
out['ifc_sectores'] = {k: v for k, v in sorted(sect.items()) if k in used_keys}
(AQUI / 'mapa_planta_mantenimiento.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')

# ----------------------------------------------------------------------------- resumen en consola
from collections import Counter
print('activos', len(ACTIVOS), '| flujo', len(FLOW), '| dependencias', len(SERV), '| impactos', len(IMPL), '| sin cadena', len(SIN_CADENA))
for nombre, L in (('flujo', FLOW), ('dependencias', SERV), ('impactos', IMPL)):
    print(nombre, dict(Counter(x['confianza'] for x in L)))
print('efectos', dict(Counter(x['efecto'] for x in IMPL)))
for p, c in cortes.items():
    print(f'  {p}: {c}')
for p in PLAT:
    det = sorted(v['equipo'] for v in IMPL if p in v['plataformas_excel'] and v['efecto'] == 'detiene')
    print(f'DETIENE {p}: {", ".join(nombre_corto(x) for x in det)}')
