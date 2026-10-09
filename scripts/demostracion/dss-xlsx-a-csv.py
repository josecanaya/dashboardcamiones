"""Pasa un export «Vehicle Search» del DSS (.xlsx) a capturas.csv: una fila por lectura.
Uso: python -I scripts/demostracion/dss-xlsx-a-csv.py <entrada.xlsx> <salida.csv>
Sin dependencias: lee el XML del xlsx directamente."""
import csv, re, sys, zipfile

src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
strs = [re.sub(r'<[^>]+>', '', m) for m in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode('utf8'), re.S)] if 'xl/sharedStrings.xml' in z.namelist() else []
rows = []
for r in re.findall(r'<row [^>]*>(.*?)</row>', z.read('xl/worksheets/sheet1.xml').decode('utf8'), re.S):
    row = []
    for attrs, val in re.findall(r'<c ([^>]*)>(.*?)</c>', r, re.S):
        v = re.sub(r'<[^>]+>', '', val)
        row.append(strs[int(v)] if 't="s"' in attrs else v)
    rows.append(row)
idx = {h: i for i, h in enumerate(rows[0])}
cols = [('camara', 'Device Name'), ('planta', 'Organization'), ('patente', 'Plate No.'), ('confianza', 'Confidence Level'),
        ('carril', 'Lane No.'), ('velocidad', 'Vehicle Speed'), ('origen', 'Place of Issue'), ('color', 'Vehicle Color'),
        ('tipo', 'Vehicle Category'), ('marca', 'Vehicle Brand'), ('hora_camara', 'Capture Time')]
n = 0
with open(dst, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow([c for c, _ in cols])
    for r in rows[1:]:
        if len(r) <= idx['Capture Time']:
            continue
        w.writerow([r[idx[h]] for _, h in cols])
        n += 1
print(dst, n, 'filas')
