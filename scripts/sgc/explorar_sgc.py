"""Explorador de la vista SGC_PROD.CamionesActivos24horas (balanza Vicentin).

Consulta la vista en vivo y escribe reportes/sgc/explorador-sgc.html (autocontenido)
para evaluar qué columnas sirven. Uso:
  agentes/.venv/Scripts/python.exe scripts/sgc/explorar_sgc.py
Requiere VPN + ruta a 192.168.15.55 (ver scripts/sgc/probe_sgc.py).
"""
import json
from datetime import datetime
from pathlib import Path

import oracledb

from probe_sgc import ROOT, load_env

import os

OUT = ROOT / "reportes" / "sgc" / "explorador-sgc.html"
NODO_SUR = {"0003", "0004", "0097"}

# Evaluación de cada columna frente a lo que ya tenemos (Excel de movimientos + cámaras).
COLUMNAS = {
    "PATENTECAMION": ("Clave de cruce con cámaras (LPR) y con el Excel.", "sirve"),
    "PATENTEACOPLADO": ("Las cámaras traseras leen el acoplado: permite cruzar lecturas traseras.", "sirve"),
    "PRODUCTOCODIGO": ("Mismo código que cod_prod del Excel (ej. 0883 glicerina): reglas grano/líquido.", "sirve"),
    "PRODUCTO": ("Nombre legible del producto.", "sirve"),
    "FECHAINGRESO": ("Ingreso por balanza en vivo: hoy lo esperamos del Excel al día siguiente.", "sirve"),
    "FECHASALIDA": ("Vacía = el camión sigue en planta. Permanencia total puerta a puerta (R7).", "sirve"),
    "PESOBRUTO": ("Solo bruto sin salida = entró cargado (viene a descargar).", "parcial"),
    "PESOTARA": ("Solo tara sin salida = entró vacío (viene a cargar).", "parcial"),
    "PESONETO": ("Toneladas por camión: volumen del día sin esperar el Excel.", "sirve"),
    "PESONETONETO": ("Neto con mermas/humedad; a veces vacío. Poco uso operativo.", "poco"),
    "PLANTACODIGO": ("Filtrar Nodo Sur (0003, 0004, 0097).", "sirve"),
    "PLANTA": ("Nombre de la planta.", "sirve"),
    "NROINGRESO": ("Clave única del ingreso; puede ser el id para deduplicar.", "sirve"),
}

FALTAN = [
    "Plataforma / calle de descarga (calada, volcable 1–5): la tiene el Excel.",
    "Sentido explícito (ingreso / despacho) y es_de_vuelta / transile.",
    "CTG, contrato, cliente/proveedor.",
    "Hora de cada pesada (bruto y tara por separado): solo hay ingreso y salida.",
    "Historia: la vista muestra solo las últimas 24 h; hay que guardarla periódicamente.",
]


def fetch():
    load_env()
    e = os.environ
    dsn = oracledb.makedsn(e["ORACLE_SGC_HOST"], int(e["ORACLE_SGC_PORT"]), service_name=e["ORACLE_SGC_SERVICE"])
    with oracledb.connect(user=e["ORACLE_SGC_USER"], password=e["ORACLE_SGC_PASSWORD"], dsn=dsn, tcp_connect_timeout=8) as con:
        cur = con.cursor()
        cur.execute(f"SELECT * FROM {e['ORACLE_SGC_SCHEMA']}.{e['ORACLE_SGC_VIEW']}")
        cols = [d[0] for d in cur.description]
        rows = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            for k, v in d.items():
                if isinstance(v, datetime):
                    d[k] = v.strftime("%Y-%m-%d %H:%M")
            rows.append(d)
    return cols, rows


def main():
    cols, rows = fetch()
    meta = {
        "generado": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "nodoSur": sorted(NODO_SUR),
        "columnas": [{"nombre": c, "uso": COLUMNAS.get(c, ("", "?"))[0], "nivel": COLUMNAS.get(c, ("", "?"))[1]} for c in cols],
        "faltan": FALTAN,
    }
    html = TEMPLATE.replace("__DATA__", json.dumps(rows, ensure_ascii=False)).replace("__META__", json.dumps(meta, ensure_ascii=False))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"{len(rows)} filas -> {OUT}")


TEMPLATE = r"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Explorador SGC</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1d2433;--mute:#667085;--line:#e4e7ec;--ok:#12805c;--okbg:#e7f6ef;--mid:#b54708;--midbg:#fef3e2;--low:#667085;--lowbg:#f2f4f7;--acc:#5b3fd1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,Segoe UI,sans-serif}
main{max-width:1280px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:0 0 10px}.sub{color:var(--mute);margin:4px 0 18px}
.grid{display:grid;gap:12px}.kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.kpi b{display:block;font-size:26px}.kpi span{color:var(--mute);font-size:12px}
.two{grid-template-columns:1.4fr 1fr;margin-bottom:14px}@media(max-width:860px){.two{grid-template-columns:1fr}}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
th{position:sticky;top:0;background:#fafbfc;font-weight:600;cursor:pointer;user-select:none}td.wrap{white-space:normal}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:600}
.sirve{background:var(--okbg);color:var(--ok)}.parcial{background:var(--midbg);color:var(--mid)}.poco{background:var(--lowbg);color:var(--low)}
.bar{height:6px;background:var(--line);border-radius:3px;width:70px;display:inline-block;vertical-align:middle;margin-right:6px}.bar i{display:block;height:100%;background:var(--acc);border-radius:3px}
.filters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.filters input,.filters select{padding:6px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;background:#fff}
.scroll{overflow:auto;max-height:520px;border:1px solid var(--line);border-radius:8px}
.open{color:var(--acc);font-weight:600}ul{margin:0;padding-left:18px}li{margin:4px 0}.muted{color:var(--mute)}
</style></head><body><main>
<h1>Explorador SGC · camiones activos 24 h</h1>
<p class="sub">Vista <code>SGC_PROD.CamionesActivos24horas</code> · consultada <span id="gen"></span> · cada fila = un ingreso por balanza</p>
<div class="grid kpis" id="kpis"></div>
<div class="grid two">
  <div class="card"><h2>Columnas: qué trae y para qué sirve</h2><table id="cols"></table></div>
  <div class="card"><h2>Por planta</h2><table id="plantas"></table>
    <h2 style="margin-top:16px">Lo que la vista no trae</h2><ul id="faltan"></ul></div>
</div>
<div class="card"><h2>Filas</h2>
  <div class="filters"><select id="fPlanta"></select><select id="fEstado"><option value="">Todos</option><option value="open">En planta (sin salida)</option><option value="closed">Ya salieron</option></select>
  <input id="fQ" placeholder="Buscar patente o producto" size="26"><span class="muted" id="cnt"></span></div>
  <div class="scroll"><table id="rows"></table></div>
</div>
</main>
<script>
const DATA=__DATA__, META=__META__;
const $=id=>document.getElementById(id), NS=new Set(META.nodoSur);
$('gen').textContent=META.generado;
const mins=r=>r.FECHASALIDA?(new Date(r.FECHASALIDA.replace(' ','T'))-new Date(r.FECHAINGRESO.replace(' ','T')))/60000:null;
const fmtMin=m=>m==null?'':(m>=60?Math.floor(m/60)+' h '+String(Math.round(m%60)).padStart(2,'0'):Math.round(m)+' min');
const median=a=>{a=a.filter(x=>x!=null).sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
const tipo=r=>r.FECHASALIDA?'':(r.PESOTARA!=null&&r.PESOBRUTO==null?'vino a cargar':r.PESOBRUTO!=null&&r.PESOTARA==null?'vino a descargar':'');
const sur=DATA.filter(r=>NS.has(r.PLANTACODIGO));
const k=[[DATA.length,'ingresos 24 h (todas)'],[sur.length,'ingresos Nodo Sur'],[sur.filter(r=>!r.FECHASALIDA).length,'en planta ahora (Sur)'],
 [Math.round(sur.reduce((s,r)=>s+(r.PESONETO||0),0)/1000).toLocaleString('es-AR'),'toneladas netas cerradas (Sur)'],[fmtMin(median(sur.map(mins))),'permanencia mediana (Sur)']];
$('kpis').innerHTML=k.map(([v,l])=>`<div class="card kpi"><b>${v}</b><span>${l}</span></div>`).join('');
$('cols').innerHTML='<tr><th>Columna</th><th>Completa</th><th>Ejemplo</th><th>Uso</th></tr>'+META.columnas.map(c=>{
  const filled=DATA.filter(r=>r[c.nombre]!=null&&r[c.nombre]!=='').length, p=Math.round(100*filled/DATA.length);
  const ex=(DATA.find(r=>r[c.nombre]!=null)||{})[c.nombre]??'';
  return `<tr><td><b>${c.nombre}</b></td><td><span class="bar"><i style="width:${p}%"></i></span>${p}%</td><td>${ex}</td><td class="wrap"><span class="tag ${c.nivel}">${c.nivel}</span> ${c.uso}</td></tr>`}).join('');
const byP={};DATA.forEach(r=>(byP[r.PLANTACODIGO+' '+r.PLANTA]??=[]).push(r));
$('plantas').innerHTML='<tr><th>Planta</th><th>Ingresos</th><th>En planta</th><th>Perm. mediana</th></tr>'+Object.entries(byP).sort((a,b)=>b[1].length-a[1].length).map(([p,rs])=>
  `<tr><td>${NS.has(p.slice(0,4))?'<b>'+p+'</b> <span class="tag sirve">Sur</span>':'<span class="muted">'+p+'</span>'}</td><td>${rs.length}</td><td>${rs.filter(r=>!r.FECHASALIDA).length}</td><td>${fmtMin(median(rs.map(mins)))}</td></tr>`).join('');
$('faltan').innerHTML=META.faltan.map(f=>`<li>${f}</li>`).join('');
$('fPlanta').innerHTML='<option value="sur">Solo Nodo Sur</option><option value="">Todas las plantas</option>'+Object.keys(byP).map(p=>`<option value="${p.slice(0,4)}">${p}</option>`).join('');
const COLS=['PATENTECAMION','PATENTEACOPLADO','PLANTA','PRODUCTOCODIGO','PRODUCTO','FECHAINGRESO','FECHASALIDA','PERMANENCIA','TIPO','PESOBRUTO','PESOTARA','PESONETO','PESONETONETO','NROINGRESO'];
let sortK='FECHAINGRESO',sortD=-1;
function render(){
  const fp=$('fPlanta').value,fe=$('fEstado').value,q=$('fQ').value.trim().toUpperCase();
  let rs=DATA.map(r=>({...r,PERMANENCIA:mins(r),TIPO:tipo(r)})).filter(r=>(fp==='sur'?NS.has(r.PLANTACODIGO):!fp||r.PLANTACODIGO===fp)
    &&(!fe||(fe==='open')===!r.FECHASALIDA)&&(!q||[r.PATENTECAMION,r.PATENTEACOPLADO,r.PRODUCTO].join(' ').toUpperCase().includes(q)));
  rs.sort((a,b)=>{const x=a[sortK],y=b[sortK];return (x==null)-(y==null)||(x>y?1:x<y?-1:0)*sortD});
  $('cnt').textContent=rs.length+' filas';
  $('rows').innerHTML='<tr>'+COLS.map(c=>`<th data-k="${c}">${c}${c===sortK?(sortD>0?' ▲':' ▼'):''}</th>`).join('')+'</tr>'+rs.map(r=>'<tr>'+COLS.map(c=>{
    let v=r[c];if(c==='PERMANENCIA')v=fmtMin(v);if(c==='FECHASALIDA'&&!v)v='<span class="open">en planta</span>';
    if(typeof v==='number'&&c.startsWith('PESO'))v=v.toLocaleString('es-AR');return `<td>${v??''}</td>`}).join('')+'</tr>').join('');
  document.querySelectorAll('#rows th').forEach(th=>th.onclick=()=>{const kk=th.dataset.k;sortD=kk===sortK?-sortD:1;sortK=kk;render()});
}
['fPlanta','fEstado','fQ'].forEach(id=>$(id).oninput=render);render();
</script></body></html>"""

if __name__ == "__main__":
    main()
