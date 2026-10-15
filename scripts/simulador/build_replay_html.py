"""Arma la página de la repetición a partir de la salida de build_replay.py --all.

Uso: python scripts/simulador/build_replay_html.py <carpeta de build_replay> <salida.html> [día por defecto] [--standalone]
--standalone: agrega doctype y metas para servirla tal cual (p. ej. public/simulador/index.html de la app).
La página trae embebidos el modelo, el índice de días y el día por defecto; los demás días
se cargan de days/<día>.json, que se publican junto a la página.
"""
import sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])
args = [a for a in sys.argv[3:] if not a.startswith('--')]
default = args[0] if args else '2026-08-29'
import base64, json
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]


def plan(plant, img_name, width):
    """Foto aérea + puntos y playas del editor del plano (public/plant/<planta>/plantZones.json)."""
    z = json.loads((ROOT / 'public/plant' / plant / 'plantZones.json').read_text(encoding='utf-8'))
    im = Image.open(ROOT / 'public/plant' / plant / img_name).convert('RGB')
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    tmp = src / f'_{plant}.webp'
    im.save(tmp, quality=78)
    return {'img': 'data:image/webp;base64,' + base64.b64encode(tmp.read_bytes()).decode(), 'aspect': im.width / im.height,
            'points': {p['id']: [p['xPercent'], p['yPercent'], p['label']] for p in z['points']},
            'zones': {zz['zoneId']: [[v['xPercent'], v['yPercent']] for v in zz['polygonPercent']] for zz in z['zones'] if zz.get('polygonPercent')},
            # Caminos entre puntos: los mismos tramos que dibuja En vivo (fuente única).
            'tramos': [[t['fromPointId'], [[v['xPercent'], v['yPercent']] for v in t['viaPercent']], t['toPointId']] for t in z.get('tramos', [])]}


PLAN = {'ric': plan('ricardone', 'ricardone-plano.png', 1100), 'sl': plan('san_lorenzo', 'san_lorenzo-plano.png', 1500)}
tpl = (Path(__file__).parent / 'replay_template.html').read_text(encoding='utf-8')
# Mesa de control: días con entradas del motor de colas (scripts/simulador/motor_colas.py <día> --visual).
# El motor corre en la página (motor_colas.js) con escenarios/<día>_motor.json.
esc_dir = src / 'escenarios'
MOTOR_DAYS = sorted(f.name[:10] for f in esc_dir.glob('*_motor.json')) if esc_dir.exists() else []
ENGINE = (Path(__file__).parent / 'motor_colas.js').read_text(encoding='utf-8')
html = (tpl.replace('__PLAN__', json.dumps(PLAN, ensure_ascii=False, separators=(',', ':')))
           .replace('__MOTOR_DAYS__', json.dumps(MOTOR_DAYS))
           .replace('/*__ENGINE__*/', ENGINE)
           .replace('__MODEL__', (src / 'model.json').read_text(encoding='utf-8'))
           .replace('__INDEX__', (src / 'index.json').read_text(encoding='utf-8'))
           .replace('__DEFAULT__', (src / 'days' / f'{default}.json').read_text(encoding='utf-8')))
if '--standalone' in sys.argv:
    html = ('<!doctype html>\n<html lang="es"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n' + html + '\n</body></html>')
out.write_text(html, encoding='utf-8')
print(out)
