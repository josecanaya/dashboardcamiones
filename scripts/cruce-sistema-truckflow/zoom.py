"""Mosaico de fotos a tamaño grande para mirar de cerca (2 por fila, 900 px).

Uso: python scripts/cruce-sistema-truckflow/zoom.py <salida.jpg> <foto> [<foto> …]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

out, fotos = sys.argv[1], sys.argv[2:]
W = 900
ims = []
for f in fotos:
    im = Image.open(f).convert("RGB")
    ims.append(im.resize((W, round(im.height * W / im.width))))
H = max(i.height for i in ims)
rows = (len(ims) + 1) // 2
sheet = Image.new("RGB", (2 * W + 10, rows * (H + 24)), "white")
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype("arial.ttf", 16)
except OSError:
    font = ImageFont.load_default()
for k, im in enumerate(ims):
    x, y = (k % 2) * (W + 10), (k // 2) * (H + 24)
    sheet.paste(im, (x, y))
    d.text((x + 4, y + H + 3), f"{k + 1}. {fotos[k].replace(chr(92), '/').split('/')[-1]}", fill="black", font=font)
sheet.save(out, "JPEG", quality=82)
print(out)
