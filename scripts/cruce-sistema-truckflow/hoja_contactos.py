"""Hoja de contactos para revisar a ojo: escena reducida + recorte de patente + rótulo, en grilla.

Uso: python scripts/cruce-sistema-truckflow/hoja_contactos.py <index.json> <salida_prefijo> [por_hoja=12]
Cada item del índice: {"rotulo": str, "escena": ruta, "patente": ruta|None}
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

items = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
prefijo = sys.argv[2]
por_hoja = int(sys.argv[3]) if len(sys.argv) > 3 else 12
W, H, COLS = 640, 377, 3
try:
    font = ImageFont.truetype("arial.ttf", 22)
except OSError:
    font = ImageFont.load_default()
for h in range(0, len(items), por_hoja):
    lote = items[h : h + por_hoja]
    rows = (len(lote) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * W, rows * (H + 34)), "white")
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(lote):
        x, y = (i % COLS) * W, (i // COLS) * (H + 34)
        try:
            sc = Image.open(it["escena"]).convert("RGB").resize((W, H))
            if it.get("patente") and Path(it["patente"]).exists():
                pl = Image.open(it["patente"]).convert("RGB")
                pl = pl.resize((200, max(1, round(pl.height * 200 / pl.width))))
                sc.paste(pl, (W - 205, 5))
            sheet.paste(sc, (x, y))
        except Exception as e:  # foto rota: se deja el hueco con el error
            d.text((x + 10, y + 10), str(e)[:60], fill="red", font=font)
        d.text((x + 6, y + H + 4), f"{h + i + 1}. {it['rotulo']}"[:52], fill="black", font=font)
    out = f"{prefijo}_{h // por_hoja + 1:02d}.jpg"
    sheet.save(out, "JPEG", quality=80)
    print(out)
