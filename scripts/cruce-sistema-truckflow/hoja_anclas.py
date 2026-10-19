"""Hoja de revisión de la búsqueda por anclas del Excel: una fila por punto con hasta 12 candidatas.

Uso: python scripts/cruce-sistema-truckflow/hoja_anclas.py <carpeta anclas> <salida.jpg>
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

d = Path(sys.argv[1])
rec = json.loads((d / "anclas.json").read_text(encoding="utf8"))
W, H, COLS = 330, 194, 6
try:
    font = ImageFont.truetype("arial.ttf", 13)
    big = ImageFont.truetype("arialbd.ttf", 15)
except OSError:
    font = big = ImageFont.load_default()
filas = []
for p in rec["puntos"]:
    cs = [c for c in p["candidatas"] if c.get("foto")]
    for i in range(0, max(1, len(cs)), COLS):
        filas.append((p, cs[i : i + COLS], i))
sheet = Image.new("RGB", (170 + COLS * W, len(filas) * (H + 20) + 30), "white")
dr = ImageDraw.Draw(sheet)
dr.text((6, 6), f"{rec['patente']} · ingreso {rec['ingreso'][:16]} · calado {rec['calado'][11:16]} · salida {rec['salida'][5:16]} · {rec['plataforma']}", fill="black", font=big)
y = 30
for p, cs, i in filas:
    if i == 0:
        dr.text((6, y + 4), p["punto"], fill="black", font=big)
        dr.text((6, y + 26), f"ancla {p['ancla']}", fill="gray", font=font)
        dr.text((6, y + 42), f"{p['ventana'][0][:5]}–{p['ventana'][1][:5]}", fill="gray", font=font)
        dr.text((6, y + 58), f"centro {p['centro'][:5]}", fill="gray", font=font)
        dr.text((6, y + 74), f"{p['total']} capturas", fill="gray", font=font)
    for j, c in enumerate(cs):
        x = 170 + j * W
        sheet.paste(Image.open(d / c["foto"]).convert("RGB").resize((W - 4, H)), (x, y))
        k = i + j
        dr.text((x + 2, y + H + 2), f"{k + 1}. {c['hora'][11:]} {c['camara'][-10:]} «{c['lectura']}»", fill="black", font=font)
    y += H + 20
sheet.save(sys.argv[2], "JPEG", quality=78)
print(sys.argv[2])
