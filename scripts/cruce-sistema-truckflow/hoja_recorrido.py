"""Hoja de revisión de un recorrido: una fila por punto con sus candidatas (la elegida primero).

Uso: python scripts/cruce-sistema-truckflow/hoja_recorrido.py <carpeta del recorrido> <salida.jpg>
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

d = Path(sys.argv[1])
rec = json.loads((d / "recorrido.json").read_text(encoding="utf8"))
W, H, MAXC = 420, 248, 6
try:
    font = ImageFont.truetype("arial.ttf", 15)
    big = ImageFont.truetype("arialbd.ttf", 17)
except OSError:
    font = big = ImageFont.load_default()
rows = [p for p in rec["puntos"] if p.get("candidatas")]
sheet = Image.new("RGB", (190 + MAXC * W, len(rows) * (H + 22)), "white")
dr = ImageDraw.Draw(sheet)
for i, p in enumerate(rows):
    y = i * (H + 22)
    dr.text((6, y + 6), p["punto"], fill="black", font=big)
    dr.text((6, y + 30), "vecinos:", fill="gray", font=font)
    for k, v in enumerate(p.get("vecinos", [])[:6]):
        dr.text((6, y + 48 + k * 18), v, fill="gray", font=font)
    for j, c in enumerate(p["candidatas"][:MAXC]):
        x = 190 + j * W
        if c.get("foto") and (d / c["foto"]).exists():
            sheet.paste(Image.open(d / c["foto"]).convert("RGB").resize((W - 4, H)), (x, y))
        dr.text((x + 2, y + H + 2), f"{chr(65 + j)}. {c['hora'][11:]} {c['camara']} «{c['lectura'] or ''}»", fill="black", font=font)
sheet.save(sys.argv[2], "JPEG", quality=80)
print(sys.argv[2])
