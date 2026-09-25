"""Prepara los logos NVA (verde / claro) y Bimtrazer (fondo claro / oscuro) en PNG transparente.

Uso: python scripts/estado-planta/logos.py <carpeta_salida>
Los PNG resultantes se suben como assets del artifact; gen_deck.py referencia sus /_blob/<id>.
"""
import os, sys
import numpy as np
from PIL import Image

S = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
os.makedirs(S, exist_ok=True)
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'branding')

# NVA: el logo es texto claro sobre verde; se extrae el texto como alfa y se recolorea.
im = np.array(Image.open(os.path.join(SRC, 'nueva-vicentin-argentina.jfif')).convert('RGB')).astype(float)
bg = np.array([11, 86, 56.]); fg = np.array([212, 232, 221.])
t = np.clip(((im - bg) @ (fg - bg)) / ((fg - bg) @ (fg - bg)), 0, 1)
ys, xs = np.where(t > 0.3)
t = t[ys.min() - 4:ys.max() + 5, xs.min() - 4:xs.max() + 5]
for name, col in [('nva_green', (11, 86, 56)), ('nva_light', (241, 246, 242))]:
    arr = np.zeros(t.shape + (4,), dtype='uint8'); arr[..., :3] = col; arr[..., 3] = (t * 255).astype('uint8')
    Image.fromarray(arr, 'RGBA').resize((t.shape[1] * 3, t.shape[0] * 3), Image.LANCZOS).save(os.path.join(S, name + '.png'))

# Bimtrazer: fondo blanco -> transparente, recorte y ancho 800 px.
a = np.array(Image.open(os.path.join(SRC, 'LOGOS-BIMTRAZER_LOGO-VERTICAL chico.jpg')).convert('RGB')).astype(int)
alpha = 255 - np.clip((a.min(axis=2) - 200) * 255 // 55, 0, 255)
b = Image.fromarray(np.dstack([a, alpha]).astype('uint8'), 'RGBA')
b = b.crop(b.getbbox())
b = b.resize((800, round(800 * b.height / b.width)), Image.LANCZOS)
b.save(os.path.join(S, 'btz.png'))

# Versión para fondo oscuro: solo la palabra BIMTRAZER (tercio inferior) pasa de azul a claro.
arr = np.array(b).astype(int); h = arr.shape[0]
blue = (abs(arr[..., 0] - 27) < 45) & (abs(arr[..., 1] - 155) < 55) & (abs(arr[..., 2] - 219) < 55)
blue[:int(h * 0.66)] = False
arr[blue, 0] = 241; arr[blue, 1] = 246; arr[blue, 2] = 242
Image.fromarray(arr.astype('uint8'), 'RGBA').save(os.path.join(S, 'btz_light.png'))
print('ok', S)
