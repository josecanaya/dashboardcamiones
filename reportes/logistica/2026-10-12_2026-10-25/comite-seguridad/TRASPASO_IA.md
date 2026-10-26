# Traspaso — Comité de Seguridad 12/10 al 25/10/2026 (Nodo Sur: Ricardone + puerto San Lorenzo)

Prompt para otra IA con acceso al repo `C:\Users\Usuario\Desktop\Dashboard_camiones` (rama `automatizacion`),
a la VPN de Vicentin (SGC Oracle + DSS de cámaras) y al artifact de Slides en claude.ai.
Escrito el 26/10/2026. Respondé siempre en español y sin kilos en el deck de seguridad.

---

## 1. Qué es el trabajo

Armar y mantener el **deck del Comité de Seguridad** del 12/10 al 25/10. Casos que el usuario quiere presentar:

1. **Camiones que van y vuelven entre el puerto y Ricardone** (la balanza del puerto da de baja el ingreso, vuelven a Ricardone y entran de nuevo).
2. **Camiones que demoran entre plantas**: egreso Ricardone → ingreso puerto **más de 20 min** (norma; antes 30) sin pasar por la calada del puerto. Se listan todos (día, hora, patente, minutos), **sin fotos**.
3. **Declaran una calle y descargan en otra** (dos cámaras de volcable en la misma visita).
4. **Vehículos fuera del sistema de camiones** (camionetas, utilitarios, traffics): no son camiones, la regla del sistema no les aplica.
   Se presentan con la ficha **«Vehículo Permitido»** para que cada sector complete titular, motivo, sectores permitidos, horario, vigencia y quién autoriza.

Formato: **fichas** (una lámina por caso de ejemplo) + una lámina por camión con el recorrido completo (cajas por planta, flechas y todas las fotos del DSS).

## 2. Dónde está todo

### Deck publicado (fuente de verdad, el usuario edita en la página)
- Artifact Slides: https://claude.ai/artifact/5H4nBStd4rRjnzVaHF7zZG (versión 1793022997-6e3a al cierre).
- Copia local de esa versión: `reportes/logistica/2026-10-12_2026-10-25/comite-seguridad/deck-publicado/project/` (deck.json + slides/*.html).
- Orden actual: cover, ficha-vuelta, ficha-calles, div-vuelta, v-bmf567-2110, v-umt456-2110, v-jjv417-2110, v-tcd135-2310,
  v-gxu312-2310, v-gvw791-2310, div-interplanta, interplanta, camionetas, ficha-permitido, servicio (servicio figura en el orden pero no tiene archivo).
- **Antes de publicar**: leer el artifact (`action: read`) y construir sobre esa versión; el usuario edita en la página
  (la lámina ficha-vuelta la reescribió él). Mantener `createdOnFiles.at = 2026-10-21T18:25:09Z`. Publicar con `url` + `root` = carpeta local
  + `file_path` = deck.json + `files` = solo las láminas cambiadas.
- Las fotos van como assets del artifact (`/_blob/<id>`). Logos: el generador emite ids de otro artifact y hay que remapearlos:
  `640efa7bef389ff0d26e0af3b1636d39→d0ecd973e0389342a9808cfbafb74695`, `2df255c7ee65ff030b6abac843aadd01→c3a2be27c3f75aa79e140039e52b5935`,
  `0858c3bd8314ca0d46fba166c79465cc→ebf418210cba2ac25c7c394fcbb9757f`, `92d65b1e6c8f547eebb719a09aad5012→44733eaa14cc8ad2596eee27dee99765`.
- Deck de Logística (aparte): https://claude.ai/artifact/SevH7aavu2Tiph7RLcXHCg

### Pipeline (sin commit todavía: `git status`)
1. Cámaras: `node server/truckflow-local-server.mjs` (API en :8787; se cae, lanzarlo como `(node server/truckflow-local-server.mjs > server.log 2>&1 &)`).
   Descarga: `POST /api/truckflow/export-period {startDate,endDate}` → `data/truckflow/<día>/event-list.json` y `alert-list.json`.
   API de TruckFlow migrada el 23/10 a `http://100.54.73.142:8090` (la vieja tiene hueco 14:30–16:10 del 23/10).
2. Algoritmo por lote: `node scripts/demostracion/lote.mjs semana:2026-10-19:2026-10-25` → `outputs/demostracion_lote/lote_semana_*.json`
   (porCamion[].pasosDetalle con estado camara / reconstruida / deducida).
3. Detección: `node --import tsx scripts/estado-planta/comite-seguridad-deteccion.ts 2026-10-12 2026-10-25 reportes/logistica/2026-10-12_2026-10-25/comite-seguridad`
   → `datos.json` (balanza.pasadosKg = rechazados, interplanta, interplantaCercanos, dosCalles, camionetas.lista, umbralInterplantaMin=20).
4. Fotos DSS: `node scripts/estado-planta/fotos-recorridos.cjs <carpeta>` → `fotos/recorridos/<PAT>/<hhmm>_<device>.jpg` + `fotos.json`.
   `fotos/recorridos/blobs.json` mapea `PAT_hhmm_device` → `/_blob/<id>` del artifact (se suben con Artifact `asset: true`).
   `recorridos-excluidos.json` = pasos que la foto mostró de otro camión.
5. Generador: `python scripts/estado-planta/gen_comite_seguridad.py <carpeta>` → `deck/project/` (21 láminas; se publican solo las que cambian).
   Variables: `FICHA_VUELTA` (GVW791), `FICHA_CALLES` (LUE562), `FICHA_PERMITIDO` (AE264XY).
6. Esquema de automatización: `agentes/conocimiento/COMITES_SEMANALES_ESQUEMA.md`.

### Fuentes de datos
- **Sistema de camiones = SGC (balanza Vicentin)**, Oracle por VPN (ruta manual a 192.168.15.55). Usuario `BIMTRAZER_VIEW`,
  credenciales `ORACLE_SGC_*` en `.env`. **Solo** puede leer `SGC_PROD.CAMIONESACTIVOS24HORAS` (verificado: sin roles ni otros objetos).
  Columnas: PATENTECAMION, PATENTEACOPLADO, PRODUCTOCODIGO, PRODUCTO, FECHAINGRESO, FECHASALIDA, PESOBRUTO, PESOTARA, PESONETO,
  PESONETONETO, PLANTACODIGO, PLANTA, HUMEDAD, CONDICION, DEPOSITO1, DEPOSITO2, NROINGRESO, BAJA.
  «PLANTA SAN LORENZO» = fábrica de Ricardone; «TERMINAL DE EMBARQUE» = puerto. Muestra solo las últimas 24 h.
  Se guarda cada hora (tarea de Windows) en `data/sgc/<día>/ingresos.json` (objeto keyed por NROINGRESO, + firstWeight/firstSeenAt/lastSeenAt)
  y se normaliza a `data/movimientos/<día de salida>/movimientos.json` (plataforma = VOLCABLE_PTO_SGC, sin calle).
  Scripts: `scripts/sgc/` (probe_sgc.py, explorar_sgc.py, snapshot-sgc.mjs). Python: `agentes/.venv/Scripts/python.exe`.
- **DSS (cámaras, fotos)**: `server/dss-live.mjs` → `listVehicleCaptures(device, desdeMs, hastaMs, 100, page)` lista todas las capturas de una
  cámara en un rango (incluye las que el feed no tiene, con patente vacía o mal leída). Correr con `node --env-file=.env`. Ejemplo en
  `scripts/cruce-sistema-truckflow/_vecinas.mjs`. Ruta HTTP `/api/truckflow/camera-captures/find?device&at&plate` (±5 s) e `/image?file`.
  **Hora**: hora operativa del feed (la de las láminas) = hora de la cámara + 4 min = occurredAt + 206 min.
- Excel MovimientosPorContrato de Vicentin: llega hasta el 18/10. Tenía la plataforma/calle declarada y el CTG; el SGC no.
- PDFs de comités anteriores: `C:\Users\Usuario\Desktop\Jose\comites`.

## 3. Hallazgos verificados (con fuente)

### Datos disponibles
- Cámaras completas hasta el 25/10 (23–26 rebajadas de la API nueva).
- Balanza: hueco 19/10 ~18:00 → 20/10 ~09:00 (la captura horaria estuvo caída 40 h). Sin Excel del 19–20/10 ese tramo no se recupera.

### Rechazados en la balanza del puerto el 23/10 (SGC: BAJA = «BAJA», sin pesos)
| Patente | Ingreso dado de baja | Qué pasó después |
|---|---|---|
| TCD135 | 14509454, puerto 07:10–12:33 | 14509614 en Ricardone 13:03–13:22 (también baja); 14509839 puerto 24/10 05:41, descargó |
| GXU312 | 14509524, puerto 09:21–12:14 | ningún otro ingreso ni lectura hasta el 25/10. Camión de descarga habitual: 5 descargas de soja (Celda 16, volcables 1, 3, 5) |
| GVW791 | 14509528, puerto 09:29–12:23 | 14509767 puerto 23/10 22:05–24/10 02:29, descargó (Depósito SILO 5) |
- Las tres bajas caen entre 12:14 y 12:33 del 23/10; el Depósito 1 del puerto pasó de SILO 7 a SILO 5 entre las 15 y las 16 h de ese día (hipótesis a confirmar con el puerto: silo lleno).
- **GVW791, peso del 1.º ingreso**: no se puede recuperar. Ninguna captura horaria guardó peso (la de 12:00 fue antes de la balanza de 12:20; la de 13:00, después de la baja). Hay que pedirlo a Vicentin.
- **GVW791, 1.º viaje sin descarga**: balanza entrada 12:20 → balanza salida 12:27 (7 min) y ninguna cámara de volcable lo leyó.
- **GVW791, descarga del 2.º viaje = Volcable 5, con foto** (encontrada con `listVehicleCaptures`): Ford Cargo blanco sin patente en `SLZVolcableC5`
  02:13:50 hora de cámara (02:17 en la lámina) y en `SLZBalSC2Fte` 02:23:04 (DSS leyó «VH4»; foto con «CARGO 1722»; 02:27 en la lámina),
  luego portería 02:29 leído como GVW791. Mismo frente que en la balanza de entrada 00:44. Fotos subidas: `/_blob/6fbcb75b8fa21db2d58bd2ba3f29fafe`
  (Volcable 5) y `/_blob/e20c9c80f42bc61e788c01ff525ada58` (balanza salida). Ya están en ficha-vuelta y v-gvw791-2310 (agregadas a mano en el HTML publicado,
  el generador NO las produce: si se regenera hay que volver a agregarlas o sumar el paso a datos.json).
- Lección: no descartar capturas del DSS por la categoría («Van», «Pickup»); mirar la foto. Lo que el feed no trae puede estar en el DSS.

### Demora entre plantas (norma 20 min)
18 casos: 16/10 AA807IW 31, GFT109 22; 17/10 CQQ052 26; 19/10 AB608AT 24; 20/10 IRF326 22, JLK868 22, AE821PH 21, TBQ844 22, HIH946 21, HZA628 21;
21/10 UMT456 23, AD549AY 23; 22/10 EMR517 21; 24/10 KCO877 25, GXN483 25, UFH468 22, SNA047 21, AI470QZ 21.
11 salieron en tanda (20/10 08:17–08:29 y 24/10 12:07–12:15): verificar si fue espera en el ingreso del puerto. Viaje normal (mediana) 11 min.

### Calles
- Dos calles en la misma visita: AG476BU 18/10 (C1→C3), AE187VW 21/10 (C2→C1), NEU240 22/10 (C1→C2), **LUE562 25/10 (C5 14:33 → C2 15:07)**.
- **LUE562, calle declarada: no la tenemos.** El SGC no informa plataforma; el Excel del 25/10 no está. Hay que pedirla a Vicentin.
- **Depósito 1 NO es la calle** (553 ingresos de soja 16–26/10 con una sola calle leída): por día casi todo va al mismo silo
  desde cualquier calle (16–23/10 15 h SILO 7 por C1/C3/C5; desde 23/10 16 h SILO 5 por C1/C2/C5). Única excepción:
  22/10 15–18 h SILO 4 solo por C2 (pero en esa franja también hubo C2→SILO 7). Script: `scripts/sgc/silo-calle.cjs` (`node scripts/sgc/silo-calle.cjs [hora]`).

### Vehículos fuera del sistema
- 93 con ≥10 viajes de cámara sin aparecer en el sistema (12–25/10). La lámina publicada «camionetas» dice 81 (es de la corrida 12–22, el usuario la editó; no se regeneró).
- Ejemplo de la ficha: **AE264XY** (furgón Citroën refrigerado, 109 viajes en 13 días; Ricardone ingreso/egreso/balanza, puerto portería, tanques/líquidos, balanzas).
- IMH787 se sacó: no es camión.
- `datos.json` ahora trae por vehículo `porCamara` y `fotos` (1–2 lecturas de día) para bajar una foto de cada uno.

## 4. Reglas del usuario (no romper)
- **Nada de kg en el deck de seguridad** (los pesos son del sistema de camiones). En chat sí se puede responder con kg si lo pide.
- Nunca inventar cifras, patentes, calles ni «descargó en X» sin evidencia (cámara, foto o algoritmo revisado con foto). Si no hay dato, decir «sin lectura» y qué falta.
- Formato de vuelta: una lámina por camión con todo el recorrido y todas las fotos (no partir en dos).
- (alg.) = paso que la cámara vio sin leer bien la patente y el algoritmo asignó; siempre revisado con la foto.
- Tablas canónicas y reglas del analista en `CLAUDE.md` del repo; memorias en `C:\Users\Usuario\.claude\projects\C--Users-Usuario-Desktop-Dashboard-camiones\memory\`.

## 5. Pendientes
1. **TCD135 (lámina v-tcd135-2310)**: la píldora dice «Sin volver todavía» pero el título dice que volvió y el sistema muestra que descargó el 24/10 05:41. Corregir la píldora y, si se puede, sumar el viaje del 24/10 con fotos.
2. Pedir a Vicentin: peso del ingreso 14509528 (GVW791) y si tuvo descarga; calle declarada del ingreso 14510024 (LUE562); Excel del 19, 20 y 25/10.
   A futuro: sumar a la vista la plataforma declarada y hora/peso de cada pesada (así una baja no borra el peso).
3. Buscar con `listVehicleCaptures` las descargas sin lectura de TCD135 (24/10) y de los otros rechazados, igual que GVW791.
4. Pies de página: algunas láminas dicen «12/10 al 22/10» (div-vuelta, v-bmf567, v-umt456, v-jjv417) y los números de página no siguen el orden actual.
5. Ficha «Vehículos Permitidos» en línea (página con base compartida para que cada sector complete): el usuario la pausó («no la necesito ahora»). Ojo: un artifact con base solo lo abren personas de la organización en claude.ai.
6. Commit de los scripts cambiados (comite-seguridad-deteccion.ts, gen_comite_seguridad.py, fotos-recorridos.cjs) y de esta carpeta. No commitear sin que el usuario lo pida.
