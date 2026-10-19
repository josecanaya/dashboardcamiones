"""Miniaturas de las fotos de escena (las del DSS pesan ~1,6 MB) para la página de patentes nunca leídas.

Uso: python scripts/cruce-sistema-truckflow/fotos_miniaturas.py
Lee reportes/cruce-sistema-truckflow/fotos-nunca-leidos/index.json y escribe mini/<semana>/<foto>.jpg
(escena a 1000 px de ancho; el recorte de patente se copia tal cual).
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "reportes" / "cruce-sistema-truckflow" / "fotos-nunca-leidos"
index = json.loads((ROOT / "index.json").read_text(encoding="utf8"))
hechas = 0
for rec in index:
    for f in rec["fotos"]:
        for k, ancho in (("escena", 1000), ("patente", None)):
            rel = f.get(k)
            if not rel:
                continue
            src = ROOT / rel
            dst = ROOT / "mini" / rel
            if dst.exists() or not src.exists():
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            im = Image.open(src).convert("RGB")
            if ancho and im.width > ancho:
                im = im.resize((ancho, round(im.height * ancho / im.width)), Image.LANCZOS)
            im.save(dst, "JPEG", quality=72, optimize=True)
            hechas += 1
print(f"miniaturas nuevas: {hechas}", file=sys.stderr)
