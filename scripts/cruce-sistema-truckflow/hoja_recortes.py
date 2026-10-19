"""Hoja de recortes de patente (solo el recorte del DSS) para revisar muchos a ojo.

Uso: python scripts/cruce-sistema-truckflow/hoja_recortes.py <index.json> <salida_prefijo> [por_hoja=40]
Cada item: {"rotulo": str, "patente": ruta}
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

items = [x for x in json.loads(Path(sys.argv[1]).read_text(encoding="utf8")) if x.get("patente") and Path(x["patente"]).exists()]
prefijo = sys.argv[2]
por_hoja = int(sys.argv[3]) if len(sys.argv) > 3 else 40
W, H, COLS = 300, 110, 5
try:
    font = ImageFont.truetype("arial.ttf", 17)
except OSError:
    font = ImageFont.load_default()
for h in range(0, len(items), por_hoja):
    lote = items[h : h + por_hoja]
    rows = (len(lote) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * W, rows * (H + 24)), "white")
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(lote):
        x, y = (i % COLS) * W, (i // COLS) * (H + 24)
        im = Image.open(it["patente"]).convert("RGB")
        im.thumbnail((W - 6, H))
        sheet.paste(im, (x + 3, y))
        d.text((x + 4, y + H + 2), f"{h + i + 1}. {it['rotulo']}"[:34], fill="black", font=font)
    out = f"{prefijo}_{h // por_hoja + 1:02d}.jpg"
    sheet.save(out, "JPEG", quality=85)
    print(out)
