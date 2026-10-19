"""Sondeo de la vista Oracle SGC_PROD.CamionesActivos24horas (sistema de camiones).

Uso: agentes/.venv/Scripts/python.exe scripts/sgc/probe_sgc.py [--csv salida.csv]
Lee credenciales ORACLE_SGC_* de .env. Modo thin de python-oracledb (sin Instant Client).
"""
import csv, os, sys
from collections import Counter
from pathlib import Path

import oracledb

ROOT = Path(__file__).resolve().parents[2]


def load_env():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    e = os.environ
    dsn = oracledb.makedsn(e["ORACLE_SGC_HOST"], int(e["ORACLE_SGC_PORT"]), service_name=e["ORACLE_SGC_SERVICE"])
    with oracledb.connect(user=e["ORACLE_SGC_USER"], password=e["ORACLE_SGC_PASSWORD"], dsn=dsn, tcp_connect_timeout=8) as con:
        cur = con.cursor()
        schema = e["ORACLE_SGC_SCHEMA"].upper()
        cur.execute("SELECT owner, view_name FROM all_views WHERE owner = :o AND UPPER(view_name) LIKE '%CAMION%'", o=schema)
        views = cur.fetchall()
        print("Vistas visibles:", views)
        view = e["ORACLE_SGC_VIEW"]
        cur.execute(f"SELECT * FROM {schema}.{view}")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        print(f"\n{len(rows)} filas, {len(cols)} columnas:")
        for d in cur.description:
            print(f"  {d[0]:32} {d[1].name if hasattr(d[1], 'name') else d[1]}")
        for c in cols:
            if "PLANTA" in c.upper():
                print(f"\nDistribución {c}:", Counter(r[cols.index(c)] for r in rows).most_common())
        print("\nPrimeras 5 filas:")
        for r in rows[:5]:
            print(dict(zip(cols, r)))
        if "--csv" in sys.argv:
            out = Path(sys.argv[sys.argv.index("--csv") + 1])
            with out.open("w", newline="", encoding="utf-8") as f:
                w = csv.writer(f); w.writerow(cols); w.writerows(rows)
            print("\nCSV:", out)


if __name__ == "__main__":
    main()
