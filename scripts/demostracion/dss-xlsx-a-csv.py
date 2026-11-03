"""Pasa un export «Vehicle Search» del DSS (.xlsx, o el .zip que baja el DSS con uno o más .xlsx) a capturas.csv:
una fila por lectura, ordenadas por hora.
Uso: python -I scripts/demostracion/dss-xlsx-a-csv.py <entrada.xlsx|.zip> <salida.csv> [DESDE HASTA]
Con DESDE y HASTA (AAAA-MM-DD) guarda solo esos días. Imprime filas, primera y última hora.
Sin dependencias: lee el XML del xlsx directamente. El DSS exporta como mucho 100.000 filas (las más nuevas)."""
import csv, io, re, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
desde, hasta = (sys.argv[3], sys.argv[4]) if len(sys.argv) > 4 else ('0000', '9999')
cols = [('camara', 'Device Name'), ('planta', 'Organization'), ('patente', 'Plate No.'), ('confianza', 'Confidence Level'),
        ('carril', 'Lane No.'), ('velocidad', 'Vehicle Speed'), ('origen', 'Place of Issue'), ('color', 'Vehicle Color'),
        ('tipo', 'Vehicle Category'), ('marca', 'Vehicle Brand'), ('hora_camara', 'Capture Time')]


def xlsx_rows(z):
    strs = [re.sub(r'<[^>]+>', '', m) for m in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf8'), re.S)] if 'xl/sharedStrings.xml' in z.namelist() else []
    rows = []
    for r in re.findall(r'<row [^>]*>(.*?)</row>', z.read('xl/worksheets/sheet1.xml').decode('utf8'), re.S):
        row = []
        for attrs, val in re.findall(r'<c ([^>]*)>(.*?)</c>', r, re.S):
            v = re.sub(r'<[^>]+>', '', val)
            row.append(strs[int(v)] if 't="s"' in attrs else v)
        rows.append(row)
    idx = {h: i for i, h in enumerate(rows[0])}
    return [[r[idx[h]] for _, h in cols] for r in rows[1:] if len(r) > idx['Capture Time']]


z = zipfile.ZipFile(src)
if 'xl/worksheets/sheet1.xml' in z.namelist():
    out = xlsx_rows(z)
else:
    out = [r for n in z.namelist() if n.lower().endswith('.xlsx') for r in xlsx_rows(zipfile.ZipFile(io.BytesIO(z.read(n))))]
out = sorted((r for r in out if desde <= r[-1][:10] <= hasta), key=lambda r: r[-1])
with open(dst, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow([c for c, _ in cols])
    w.writerows(out)
print(len(out), out[0][-1] if out else '', out[-1][-1] if out else '')
