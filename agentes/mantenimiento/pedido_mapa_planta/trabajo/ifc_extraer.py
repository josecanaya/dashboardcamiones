"""Extrae de los IFC (sin ifcopenshell) los elementos con sus etiquetas BTZ y su contenedor espacial."""
import json, re, sys
from collections import defaultdict
from pathlib import Path

def dec(s):
    # \X\hh (ISO-8859-1) y \X2\hhhh\X0\ (UTF-16) del STEP.
    B = chr(92)
    s = re.sub(re.escape(B + 'X2' + B) + '([0-9A-F]+)' + re.escape(B + 'X0' + B),
               lambda m: ''.join(chr(int(m.group(1)[i:i+4], 16)) for i in range(0, len(m.group(1)), 4)), s)
    return re.sub(re.escape(B + 'X' + B) + '([0-9A-F]{2})', lambda m: bytes([int(m.group(1), 16)]).decode('latin-1'), s)

def split_args(a):
    out, depth, cur, q = [], 0, '', False
    for ch in a:
        if ch == "'" : q = not q
        if not q and ch == '(': depth += 1
        if not q and ch == ')': depth -= 1
        if not q and depth == 0 and ch == ',':
            out.append(cur); cur = ''
        else: cur += ch
    out.append(cur); return out

def parse(path):
    txt = Path(path).read_text(encoding='latin-1')
    ent = {}
    for m in re.finditer(r'^#(\d+)\s*=\s*([A-Z0-9]+)\((.*?)\);\s*$', txt, re.M | re.S):
        ent[int(m.group(1))] = (m.group(2), m.group(3))
    return ent

def s(v):
    v = v.strip()
    if v.startswith("'"): return dec(v[1:-1])
    m = re.match(r"IFC[A-Z]+\('(.*)'\)", v)
    if m: return dec(m.group(1))
    return None if v == '$' else v

def refs(v): return [int(x) for x in re.findall(r'#(\d+)', v)]

SKIP = {'IFCWALLSTANDARDCASE', 'IFCSLAB', 'IFCROOF', 'IFCWALL', 'IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER', 'IFCPLATE',
        'IFCRAILING', 'IFCSTAIR', 'IFCSTAIRFLIGHT', 'IFCDOOR', 'IFCWINDOW', 'IFCCOVERING', 'IFCCURTAINWALL'}
PRODUCTS = None

def extraer(path):
    E = parse(path)
    props = defaultdict(dict)
    pv = {i: (s(split_args(a)[0]), s(split_args(a)[2])) for i, (t, a) in E.items() if t == 'IFCPROPERTYSINGLEVALUE'}
    ps = {i: [pv[r] for r in refs(split_args(a)[4]) if r in pv] for i, (t, a) in E.items() if t == 'IFCPROPERTYSET'}
    for i, (t, a) in E.items():
        if t == 'IFCRELDEFINESBYPROPERTIES':
            x = split_args(a); pset = refs(x[5])
            for o in refs(x[4]):
                for p in pset:
                    for k, v in ps.get(p, []): props[o][k] = v
    cont = {}
    for i, (t, a) in E.items():
        if t == 'IFCRELCONTAINEDINSPATIALSTRUCTURE':
            x = split_args(a); sp = refs(x[5])[0]
            for o in refs(x[4]): cont[o] = s(split_args(E[sp][1])[2])
    agg = {}
    for i, (t, a) in E.items():
        if t == 'IFCRELAGGREGATES':
            x = split_args(a); par = refs(x[4])[0]
            for o in refs(x[5]): agg[o] = par
    out = []
    for i, (t, a) in E.items():
        if not (t.startswith('IFC') and len(split_args(a)) >= 8 and re.match(r"'[0-9A-Za-z_$]{22}'", split_args(a)[0].strip())):
            continue
        if t.startswith('IFCREL') or t.endswith('TYPE') or t in ('IFCPROJECT', 'IFCOWNERHISTORY'): continue
        x = split_args(a); p = props.get(i, {})
        btz = {k: v for k, v in p.items() if k.startswith('BTZ_') or k in ('Nodo_inst', 'Comments', 'Mark')}
        if t in SKIP and not any(k.startswith('BTZ_') for k in btz): continue
        c = cont.get(i) or (cont.get(agg[i]) if i in agg else None)
        out.append({'guid': s(x[0]), 'clase': t.replace('IFC', 'Ifc', 1).title().replace('Ifc', 'Ifc') if False else t,
                    'nombre': s(x[2]), 'objeto': s(x[4]) if len(x) > 4 else None, 'contenedor': c, 'props': btz})
    return out

if __name__ == '__main__':
    res = {}
    for f in sys.argv[1:-1]:
        res[Path(f).name] = extraer(f)
        print(Path(f).name, len(res[Path(f).name]))
    Path(sys.argv[-1]).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
