# Deck «Reconocimiento de cámaras» · regenerar desde el lote

Edita el PPTX exportado del deck (no hay proyecto HTML de la semana 12–18/10 en el repo). Actualiza las
láminas de lote (5 y 9), las tarjetas «pasos identificados» (2 y 6), las notas y arma la lámina 10
«Los pasos que faltan». La lámina 10 tiene el texto de ADS392/recuperados escrito a mano en
`build_faltan.py`: si cambian los faltantes, editar ahí.

```bash
# 1. Lote de la semana (escribe outputs/demostracion_lote/lote_semana_<desde>_<hasta>.json)
node scripts/demostracion/lote.mjs semana:2026-10-12:2026-10-18
# 2. Medir contra el cruce Sistema ↔ TruckFlow
node scripts/demostracion/medir-lote-vs-cruce.mjs outputs/demostracion_lote/lote_semana_2026-10-12_2026-10-18.json reportes/cruce-sistema-truckflow/2026-10-13_2026-10-19
# 3. Deck: descomprimir la base, aplicar, empaquetar
python -c "import zipfile; zipfile.ZipFile('reportes/camaras/2026-10-12_2026-10-18/presentacion/base-para-regenerar.pptx').extractall('tmp_deck')"
python scripts/deck-reconocimiento-pptx/patch.py tmp_deck outputs/demostracion_lote/lote_semana_2026-10-12_2026-10-18.json
python scripts/deck-reconocimiento-pptx/build_faltan.py tmp_deck
python scripts/deck-reconocimiento-pptx/zipdir.py tmp_deck salida.pptx
```

Después de `patch.py`, además (ver historial del 19/10): ensanchar la caja «99,x %» de las láminas 2 y 6
(número `cx=1560000`, etiqueta en `x=9700000 cx=1640000`) y poner en el pie de 5 y 9 la definición
«Leyó = patente exacta u OCR, como la lámina 3/7 · reconstruido = captura sin patente legible…».
Resumida = quitar las láminas «DÍA A DÍA» del `<p:sldIdLst>`, renumerar pies y la referencia «lámina 7» → 6.

Gotchas: geometría con decimales (radios `w/2`) hace que PowerPoint no abra el archivo aunque
`validate.py` pase — siempre enteros; probar apertura con PowerPoint (COM) en Windows. Si el PPTX de
salida está abierto en PowerPoint, la escritura falla (Permission denied): guardar con otro nombre.
