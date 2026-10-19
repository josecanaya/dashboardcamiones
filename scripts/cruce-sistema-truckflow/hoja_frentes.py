"""Hojas de revisión de capturas sin patente del frente de Preingreso (RicPreIngInFr): recorta la zona
donde queda el frente del camión (mitad derecha superior de la escena) para ver si el paragolpes
tiene chapa. La cámara RicPreIngEgFr mira el carril de al lado de costado: no sirve para esto.

Uso: python scripts/cruce-sistema-truckflow/hoja_frentes.py <salida_prefijo> [por_hoja=12]
Lee reportes/cruce-sistema-truckflow/sin-patente/index.json; escribe también revision/frentes.json
con el orden de las hojas (número → patente, hora, foto).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / "reportes" / "cruce-sistema-truckflow" / "sin-patente"
prefijo = sys.argv[1]
POR_HOJA = int(sys.argv[2]) if len(sys.argv) > 2 else 12
index = json.loads((ROOT / "index.json").read_text(encoding="utf8"))
items = []
for rec in index:
    for f in rec.get("sinPatente", []):
        if f.get("escena") and f.get("camara") == "RicPreIngInFr":
            items.append({"patente": rec["patente"], "alta": rec["alta"], "hora": f["hora"], "lectura": f.get("lectura") or "", "escena": f["escena"]})
(ROOT / "revision").mkdir(exist_ok=True)
(ROOT / "revision" / "frentes.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf8")
try:
    font = ImageFont.truetype("arial.ttf", 20)
except OSError:
    font = ImageFont.load_default()
W, H, COLS = 640, 420, 3
for h in range(0, len(items), POR_HOJA):
    lote = items[h : h + POR_HOJA]
    rows = (len(lote) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * W, rows * (H + 28)), "white")
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(lote):
        x, y = (i % COLS) * W, (i // COLS) * (H + 28)
        im = Image.open(ROOT / it["escena"]).convert("RGB")
        w, hh = im.size
        # El camión entra por la derecha y frena frente a la cámara: frente en x 35–95 %, y 0–65 %.
        crop = im.crop((int(w * 0.35), int(hh * 0.03), int(w * 0.95), int(hh * 0.68))).resize((W, H))
        sheet.paste(crop, (x, y))
        d.text((x + 4, y + H + 3), f"{h + i + 1}. {it['patente']} {it['hora'][5:16]} {it['lectura'] or 'vacía'}", fill="black", font=font)
    out = f"{prefijo}_{h // POR_HOJA + 1:02d}.jpg"
    sheet.save(out, "JPEG", quality=82)
    print(out)
print(f"{len(items)} capturas de frente sin patente", file=sys.stderr)
