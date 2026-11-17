"""Consulta la vista SGC_PROD.CAMIONESACTIVOS24HORAS por rango de FECHAINGRESO (desde 05/11/2026 la vista
guarda historia).

IMPORTANTE: es la base de producción de Vicentin. Nunca pedir un rango largo de una sola vez: el script parte el
rango en LOTES DE 5 DÍAS como máximo (pedido del usuario, 05/11) y espera entre un lote y otro. El 05/11 se bajó
01/05→05/11 en una sola consulta por error; ese histórico ya está en data/sgc/_historico/: no volver a bajarlo.

Uso: agentes/.venv/Scripts/python.exe scripts/sgc/consultar_rango.py DESDE HASTA [--csv salida.csv] [--patentes P1,P2]
                                     [--dias-lote N (≤5)] [--pausa SEG (≥20)] [--simular]
     DESDE / HASTA en formato dd/mm/yyyy (HASTA inclusive, hasta las 23:59:59).
     --simular muestra los lotes sin consultar la base.
Sin --csv imprime columnas, filas por día y por planta. Credenciales ORACLE_SGC_* en .env.
"""
import csv, os, re, sys, time
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

import oracledb

ROOT = Path(__file__).resolve().parents[2]
for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())
e = os.environ

args = sys.argv[1:]
desde, hasta = args[0], args[1]
opt = lambda k: args[args.index(k) + 1] if k in args else None
patentes = [p.strip().upper() for p in (opt("--patentes") or "").split(",") if p.strip()]

DIAS_LOTE = min(5, int(opt("--dias-lote") or 5))   # nunca más de 5 días por consulta
PAUSA = max(20, int(opt("--pausa") or 30))           # segundos entre lotes
d0 = datetime.strptime(desde, "%d/%m/%Y")
d1 = datetime.strptime(hasta, "%d/%m/%Y")
lotes = []
while d0 <= d1:
    fin = min(d0 + timedelta(days=DIAS_LOTE - 1), d1)
    lotes.append((d0, fin))
    d0 = fin + timedelta(days=1)
print(f"{len(lotes)} lotes de hasta {DIAS_LOTE} días, {PAUSA} s entre lotes", file=sys.stderr)
if "--simular" in args:
    for a, b in lotes: print(f"  {a:%d/%m/%Y} → {b:%d/%m/%Y}", file=sys.stderr)
    sys.exit(0)

dsn = oracledb.makedsn(e["ORACLE_SGC_HOST"], int(e["ORACLE_SGC_PORT"]), service_name=e["ORACLE_SGC_SERVICE"])
sql = (f"SELECT * FROM {e['ORACLE_SGC_SCHEMA'].upper()}.{e['ORACLE_SGC_VIEW']} ch "
       "WHERE ch.FECHAINGRESO BETWEEN to_date(:d, 'dd/MM/yyyy HH24:mi:ss') AND to_date(:h, 'dd/MM/yyyy HH24:mi:ss') ORDER BY ch.FECHAINGRESO")
rows = []
for i, (a, b) in enumerate(lotes):
    if i: time.sleep(PAUSA)
    with oracledb.connect(user=e["ORACLE_SGC_USER"], password=e["ORACLE_SGC_PASSWORD"], dsn=dsn, tcp_connect_timeout=8) as con:
        cur = con.cursor()
        cur.execute(sql, d=f"{a:%d/%m/%Y} 00:00:00", h=f"{b:%d/%m/%Y} 23:59:59")
        cols = [c[0] for c in cur.description]
        lote = cur.fetchall()
    rows += lote
    print(f"  lote {i + 1}/{len(lotes)} {a:%d/%m} → {b:%d/%m}: {len(lote)} filas", file=sys.stderr)

print(f"{len(rows)} filas · {len(cols)} columnas: {', '.join(cols)}", file=sys.stderr)
if patentes:
    key = lambda v: re.sub(r"[^A-Z0-9]", "", str(v or "").upper())
    pc = [i for i, c in enumerate(cols) if "PATENTE" in c.upper() or "ACOPLADO" in c.upper()]
    rows = [r for r in rows if any(key(r[i]) in patentes for i in pc)]
    print(f"{len(rows)} filas de {', '.join(patentes)}", file=sys.stderr)
if "--csv" in args:
    with open(opt("--csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(cols); w.writerows(rows)
    print("CSV:", opt("--csv"), file=sys.stderr)
else:
    fi = cols.index("FECHAINGRESO")
    print("Por día:", sorted(Counter(r[fi].strftime("%Y-%m-%d") for r in rows if r[fi]).items()))
    for c in cols:
        if "PLANTA" in c.upper():
            print(c, Counter(r[cols.index(c)] for r in rows).most_common(8))
    for r in rows[:3]:
        print(dict(zip(cols, r)))
