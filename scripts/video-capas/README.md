# Video de las capas del reconocedor

Video explicativo de cómo el reconocedor identifica cada captura (capas 2 → 3.1–3.4 → alerta), con el modelo
IFC de las dos plantas y el 29/10/2026 completo. Lo publicado está en `outputs/video-capas/` (página con el video
y las 20 alertas del día con su decisión).

## Partes

- `escenas/video.html` + `escenas/render.cjs`: escenas del deck (portada, recorrido, un caso por capa). Cuadro a
  cuadro con `seek(t)`; las fotos de los casos están en `escenas/media/`.
- `modelo/modelo.html` + `modelo/mrender.cjs`: el modelo de Ricardone y San Lorenzo (`public/plant/<planta>/modelo-3d.json`)
  con camiones sobre los tramos, la recreación con casos reales y el 29/10 completo (`modelo/dia29c.json`).
- `dia29/`: clasificación de cada captura del 29/10 en una capa.

## Cómo se clasificó el 29/10

1. `dia29/cobertura-padron.mjs` es `scripts/vinculo/cobertura.mjs` (rama `claude/dss-vinculo-e5702c`) con dos cambios:
   lee las cartas también de `data/padron/<día>.json` (la copia de `data/arca` era del 27/10) y vuelca cada captura a
   `reportes/vinculo/<desde>_<hasta>/capturas-todas.json` (copiado acá como `dia29/capturas-todas.json`).
   Se corrió con `VINCULO_DSS_ROOT` apuntando al export parcial del DSS (`dia29/dss-29-parcial.csv`, 19:50–23:59).
2. `dia29/dss-alertas29.mjs` y `dia29/dss-nr29.mjs` buscan en el DSS, una por una, las capturas en alerta y las sin
   patente útil (tipo, marca, fotos). Usan la sesión del DSS: no correr con el servidor En vivo levantado.
3. `dia29/dia29-algoritmo.cjs` lleva cada captura a una capa: carta / Permitidos / remito (SGC del día), parecidas y
   lote, metadatos (marca, tipo del DSS), banco (`corregidos`, `no-camiones`), IA (veredictos de `data/vision` y las
   lecturas confirmadas a mano con el recorte de la patente: `IA_FIX`, `IA_NO_PATENTE`, `NO_CAMION_FOTO`) y alerta.
   La trasera con frontal del mismo punto a ±3 min no cuenta como otra captura. Resultado del 29/10: 3.069 capturas,
   442 patentes, 20 en alerta (45 capturas).

Pendiente en el algoritmo de vínculo: que `cobertura.mjs` no cuente la trasera con par y lea las cartas del padrón.

## Renderizar

```bash
node scripts/video-capas/dia29/dia29-algoritmo.cjs
python -m http.server 8851 --bind 127.0.0.1
node scripts/video-capas/modelo/mrender.cjs frames
FFMPEG=<ruta a ffmpeg> node scripts/video-capas/escenas/render.cjs video salida.mp4 30
```

`dia29-algoritmo.cjs` escribe `dia29/dia29-alg.json`; para el modelo hay que pasarlo a `modelo/dia29c.json`
(`{caps:[{t,s,d,n,l,p}], trucks}`). El servidor HTTP va desde la raíz del repo (el modelo lee `public/plant`).
Hace falta `puppeteer-core` y Chrome; `ffmpeg` sale de `pip install imageio-ffmpeg`.
