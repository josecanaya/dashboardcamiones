"""Recorta el recuadro ampliado que la cámara pega arriba a la izquierda de la foto (lo que tomó como
patente) y arma hojas de revisión con esos recortes.

Uso: python scripts/cruce-sistema-truckflow/recorte_recuadro.py [por_hoja=40]
Lee reportes/cruce-sistema-truckflow/sin-patente/index.json; escribe detalle/<semana>/<foto>.jpg,
miniaturas mini/<semana>/<foto>.jpg y hojas en revision/hoja_NN.jpg (+ revision/hojas.json con el orden).
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / "reportes" / "cruce-sistema-truckflow" / "sin-patente"
POR_HOJA = int(sys.argv[1]) if len(sys.argv) > 1 else 40
# Recuadro en la foto original de 2688×1584 (borde verde): x 10–215, y 75–275.
CAJA = (12, 77, 213, 273)
index = json.loads((ROOT / "index.json").read_text(encoding="utf8"))
items = []
for rec in index:
    for f in rec.get("sinPatente", []):
        if not f.get("escena"):
            continue
        src = ROOT / f["escena"]
        det = ROOT / "detalle" / Path(f["escena"]).relative_to("fotos")
        mini = ROOT / "mini" / Path(f["escena"]).relative_to("fotos")
        if not det.exists() or not mini.exists():
            im = Image.open(src).convert("RGB")
            k = im.width / 2688
            det.parent.mkdir(parents=True, exist_ok=True)
            mini.parent.mkdir(parents=True, exist_ok=True)
            im.crop(tuple(round(v * k) for v in CAJA)).resize((300, 292), Image.LANCZOS).save(det, "JPEG", quality=85)
            im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS).save(mini, "JPEG", quality=72, optimize=True)
        items.append({"id": f"{rec['patente']}|{f['hora']}", "rotulo": f"{rec['patente']} {f['hora'][5:16]} ({f['difMin']:+d}m)", "detalle": str(det), "mini": str(mini)})
rev = ROOT / "revision"
rev.mkdir(exist_ok=True)
(rev / "hojas.json").write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf8")
try:
    font = ImageFont.truetype("arial.ttf", 16)
except OSError:
    font = ImageFont.load_default()
W, H, COLS = 300, 292, 8
for h in range(0, len(items), POR_HOJA):
    lote = items[h : h + POR_HOJA]
    rows = (len(lote) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * W, rows * (H + 22)), "white")
    d = ImageDraw.Draw(sheet)
    for i, it in enumerate(lote):
        x, y = (i % COLS) * W, (i // COLS) * (H + 22)
        sheet.paste(Image.open(it["detalle"]), (x, y))
        d.text((x + 3, y + H + 2), f"{h + i + 1}. {it['rotulo']}", fill="black", font=font)
    sheet.save(rev / f"hoja_{h // POR_HOJA + 1:02d}.jpg", "JPEG", quality=82)
print(f"{len(items)} capturas sin chapa, {(len(items) + POR_HOJA - 1) // POR_HOJA} hojas", file=sys.stderr)
