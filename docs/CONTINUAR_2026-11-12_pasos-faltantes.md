# Continuar: cerrar los pasos que faltan, caso por caso (12/11)

Objetivo del usuario: en 3 días de mucho volumen, que **cada camión con carta de porte tenga todos los pasos de su
circuito, cada uno con su foto**, y entender en el camino qué hace perder pasos. Se trabaja **caso por caso**
(nada de bajadas masivas del DSS: el usuario lo pidió explícitamente) y **sin la prueba de la patente borrada** en
los informes al usuario. **No usar «foto a pedido por hora de pesada»** (descartado por el usuario).

## Días elegidos y punto de partida

05, 06 y 09/11 (más viajes y mejor lectura). 1.038 viajes con carta, 9.548 pasos esperados. Antes de los cambios:
cámara 8.512 · reconstruido 450 · deducido 499 · por carta 67 · en curso 11 · falta 9 → **586 pasos sin captura
propia ni asignada**. Más concentrados en volcables del puerto (156) y balanza ingreso de Ricardone (121).

Inventario y scripts de trabajo (scratchpad de la sesión, se pierden): `inventario.mjs`, `dss-ventana.mjs`
(capturas del DSS de unas cámaras en una ventana corta, hora del feed), `fotos-pasos.mjs` (foto de escena por paso,
800 px). Si hacen falta, rehacerlos con `server/dss-live.mjs` (`listVehicleCaptures`, `findVehicleCapture`,
`fetchPicture`); el DSS marca 240 s menos que la hora del feed y limita consultas (429).

## Hallazgos y cambios (todo en `scripts/vinculo/cobertura.mjs`, sin commit)

1. **Cartas de aceite (derivado 101) → circuito de líquidos.** AF763AJ (carta tipo 284, derivado 101, «Girasol» =
   aceite) descargó en Carga/descarga del puerto (SLZBalLiq2a) y el lote le daba R7 con volcables «deducido».
   Ahora `esLiquido(n)` deja elegir circuitos de líquidos; AF763AJ queda R35 con sus 9 pasos por cámara.
   El 05/11 volcables sin captura 68 → 59. `VINCULO_DERIVADOS_LIQUIDOS` amplía la lista de códigos.
2. **Capturas de pasada la medianoche.** El lote de un día solo repartía capturas de ese día: los viajes que
   empiezan a la noche perdían puerto y egreso (EWH682). **264 de los 575 pasos sin captura** de los 3 días caían el
   día siguiente. Ahora `free` usa todas las capturas cargadas (día −1 a +1) y los viajes de los días vecinos
   compiten (`enSemana`), pero solo se informan los del día. 05/11: con captura 2.830 → 2.902, deducido 148 → 87.
   `VINCULO_SOLO_DIA=1` vuelve a como estaba. **Ojo**: hay asignaciones nuevas de baja probabilidad; verificar con
   foto. Control interno (no informar al usuario): aciertos de la prueba 56 % → 50 %, recupera 41 % → 44 %.
3. **Volcables y calada: una pasada leída solo toma capturas de su misma calle** (`CON_CALLES`, `carril`). AC732KC
   leído en calle 3 se llevaba «IAGQ17» de la calle 2, que era EWH682 (confirmado con foto).
4. **Marca, color y tamaño de noche en volcables** (segunda pasada; `ATRIB_CAMS`, `deNoche`, `VINCULO_ATRIB_NOCHE=0`
   lo apaga). Perfil del camión = atributos de alertas frontales de sus lecturas + capturas asignadas ≥ 60 %.
   **Limitación encontrada**: el feed de TruckFlow no trae atributos (solo las alertas), así que muchos camiones
   quedan sin perfil (EWH682: ninguno) y la regla no actúa. EWH682 sigue con «AG504R5» (Scania) en volcables cuando
   el correcto es «IAGQ17» (Benz, 05:20, calle 2). Siguiente paso posible: perfil desde el export del DSS
   (`npm run vinculo` ya lo importa de `C:\Users\Public\DSS Client`) o marca del DSS de una lectura frontal por camión.
5. `scripts/vinculo/asignacion.mjs` + `VINCULO_CONJUNTA=1`: reparto conjunto (húngaro). **Medido: no mejora**
   (03/11 20 → 21 faltas, peor acierto). Queda apagado; se puede borrar.
6. `scripts/replay-capas-dia.mjs`: `VINCULO_DEBUG_DIR=<carpeta>` guarda las entradas del lote del día (cartas,
   extra, conocidas) para repetir `cobertura.mjs` a mano:
   `VINCULO_CARTAS=<d>/cartas.json VINCULO_EXTRA=<d>/extra.json VINCULO_CONOCIDAS=<d>/conocidas.json VINCULO_OUT=<out> VINCULO_SIN_DSS=1 node scripts/vinculo/cobertura.mjs DIA DIA`

## Casos revisados

| Camión | Día | Qué faltaba | Causa | Estado |
|---|---|---|---|---|
| AF763AJ | 05–06/11 | volcables | carta de aceite con circuito de granos | resuelto (1) |
| AE879OO | 05/11 | volcables 11:54 | la lectura «AE87900» (calle 5) está solo en el DSS; no está en `data/truckflow/2026-11-05/alert-list.json` ni en `data/alertas` | sin resolver: no llegó a TruckFlow. La API `alert/list` hoy devuelve 0 para cualquier día: el usuario iba a buscarla a mano en TruckFlow |
| EWH682 | 05→06/11 | puerto completo | pasada la medianoche (2) + calle (3) | Ingreso y Balanza ingreso bien (foto); volcables mal (Scania) → falta (4) |

## Pendientes

- Resolver volcables de EWH682 (perfil de marca sin atributos en el feed).
- Seguir caso por caso: balanzas de Ricardone (121 + 58 sin captura en los 3 días), Ingreso de Ricardone (54).
- Cuando los cambios estén validados: `npm run reconocer -- 2026-11-01 2026-11-10 --forzar` (copia de los días
  previos en el scratchpad viejo, se pierde) y recalcular las tablas de reconocimiento por día.
- Octubre ya reconocido del 11 al 31/10 (`data/reconocido/`), con el código de antes de estos cambios.
- Nada commiteado. Archivos tocados: `scripts/vinculo/cobertura.mjs`, `scripts/replay-capas-dia.mjs`,
  `scripts/vinculo/asignacion.mjs` (nuevo), este documento; además `data/padron/2026-10-1x…31`, `data/sgc/2026-10-1{1,2,3,7}`,
  `data/sgc/2026-10-31`, `data/arca/api/cartas-2026-10-01_2026-11-05.json` (bajados para reconocer octubre).

## Segunda sesión (12/11 tarde) — estado y cambios

Medido con `cobertura.mjs` sobre las entradas guardadas de 05, 06 y 09/11 (receta abajo). **Solo viajes con carta.**

| | Al empezar (código de la mañana) | Ahora |
|---|---|---|
| Viajes con carta | 1.046 (con duplicados) | 970 |
| Pasos esperados | 9.603 | 8.676 |
| Pasos sin captura propia ni asignada | 380 (4,0 %) | 323 (3,7 %) |
| Viajes completos (todos los pasos con captura) | 756 (72 %) | 743 (77 %) |
| Prueba interna (borrar 1 de 4 lecturas: vuelve a su camión) | 50 / 51 / 52 % | 53 / 53 / 60 % |

Cambios (todos en `scripts/vinculo/cobertura.mjs` salvo los scripts nuevos):

7. **Una visita por carta** (`visitaDe`, `VINCULO_UNA_VISITA=0` lo apaga). Un camión con dos cartas seguidas: la carta del
   segundo viaje cubría también el primero (ventana −48 h…+120 h) y se quedaba con sus capturas; el segundo viaje se
   evaluaba con los pasos del primero y sus propios pasos no se miraban nunca (35 de 405 camiones el 05/11; EYL559, LPW214).
   Ahora las capturas del camión se parten en visitas (vuelve a Ricardone después de salir del puerto; vuelve a entrar al
   puerto; reentra a Ricardone con > 1 h sin lecturas) y cada carta se queda con una: la cerrada (CN) con la visita que pasó
   por la balanza de egreso a la hora del cierre (coincide a ±2 min), el resto por orden de partida. Solo camiones con más
   de una carta: con una sola partía viajes largos legítimos (AF763AJ, aceite, 27 h entre Ricardone y el puerto). Los
   camiones lanzadera del 09/11 (RAW481, DFP716, SAT582: varios viajes Ricardone→puerto por día) quedan bien separados.
   Se descartan además los viajes sin carta repetidos en `extra.json` (mismo ctg dos veces).
8. **«Auto» del DSS según la cámara y la hora** (`autoFiable`, `VINCULO_LIVIANO_MEDIDO=0` vuelve a como estaba). Se mide en
   cada corrida con los camiones con carta que la cámara leyó bien: si llama auto a 1 de cada 10 o más, una captura «auto»
   ya no queda afuera, solo pesa ×0,3. De noche las frontales llaman auto a 20–50 % de los camiones (foto: «W68» volcables
   05/11 20:56 y «MJJ» Ingreso Ricardone 05/11 00:10 son camiones); de día solo la balanza 1 de Ricardone («L20» 09/11
   08:04 es CIF516). La balanza 2 de día sí ve autos (AH049…, Fiat blanco). +27 pasos con captura en los 3 días.
9. **Marca del DSS para el perfil de noche** (`scripts/vinculo/marca-dss.mjs` → `data/dss-marcas/<día>.json`). Para cada
   camión con un paso de volcables de noche pendiente se piden al DSS 3 lecturas frontales propias (solo datos); vale la
   marca que se repite en 2. De noche el DSS discrepa entre lecturas del mismo camión (05/11: 25 de 85 con 2 lecturas).
   Solo marcas de camión (Suzuki, Jeep, Aston Martin… en un camión = sin marca) y Naveco = Iveco (KRE352). El perfil
   necesita 2 coincidencias; el color de noche ya no pesa (imagen infrarroja; le sacaba a NUW682 su «W68»;
   `VINCULO_COLOR_NOCHE=1` lo vuelve a usar). **EWH682 resuelto**: volcables «IAGQ17» (Benz, 05:20) al 75 %.
   Validado con foto: GLK688 ↔ «MTK» (Iveco Stralis) y VNI813 ↔ «QL3» (Fiat azul) estaban cruzados y ahora están bien;
   FLU483 pierde «CAN» (Scania, probablemente suyo) con JKM390 al 34 %; LEV032 se lleva «JLJ» (Mercedes viejo, no es el
   Axor de LEV032). La prueba interna no mide esta pasada (borra lecturas del feed, que no traen marca): la medida es foto.
   167+182+61 consultas para los 3 días, una por vez (el DSS espacia y reintenta los 429).
10. Herramientas: `VINCULO_CAPTURAS=1` escribe `capturas.json` (todas las capturas con su dueño) junto a la cobertura;
    `VINCULO_TRAZA='<cámara>|<HH:MM>'` imprime candidatos, vetos y decisión de una captura;
    `scripts/vinculo/fotos-par.mjs` baja la foto propia del camión y la de una captura candidata, lado a lado.

### Qué queda (323 pasos, motivo medido sobre la ventana de cada hueco)

| Motivo | Pasos | Qué es |
|---|---|---|
| Capturas a horario tomadas por otro camión | ~105 | competencia en la fila (Ingreso Ricardone de noche, volcables). Se resuelve con más señal por captura, no con reglas |
| Sin ninguna captura en la ventana | ~80 | la cámara no la mandó a TruckFlow: balanzas de Ricardone (sobre todo Balanza Egreso: la carta ancla la hora y no hay captura), Pre ingreso de los camiones lanzadera del 09/11. Solo el DSS puede tenerla |
| Capturas solo lejos del horario esperado | ~50 | revisar tiempos de tramo de R10/R11/R16/R28 (circuitos que pasan dos veces por la calada) |
| Captura libre a horario sin asignar | ~40 | patentes válidas leídas una sola vez (fotos: HRL423 es «WHL 423», otro camión; DCA012, VW azul en volcables: sin decidir) |
| En curso / sin pasos vecinos | ~17 | |

### Pendientes, en orden

1. Ventanas invertidas (desde > hasta) en circuitos que pasan dos veces por la calada o el Ingreso (R27/R28: ESB427,
   VJG112, LFT141, AYB759 el 09/11): `firstAt` toma la primera lectura del nodo y el orden del circuito no coincide.
2. Balanza Egreso de Ricardone «por carta» sin captura (19 pasos): ver en el DSS si la cámara capturó (caso por caso).
3. Volver a reconocer 01–10/11 con todo esto: `npm run reconocer -- 2026-11-01 2026-11-10 --forzar`, luego
   `marca-dss.mjs` por día sobre `data/reconocido/<día>/cobertura.json`, y reconocer otra vez. `data/dss-marcas` tiene
   hoy 05, 06 y 09/11.
4. El servidor en vivo (`vinculoLive.mjs`) usa el mismo `cobertura.mjs`: visitas y «auto» medido ya aplican; la marca del
   DSS solo si existe `data/dss-marcas/<día>.json` (no se genera en vivo).

### Repetir la medición

```
VINCULO_DEBUG_DIR=<dbg> node --max-old-space-size=8192 scripts/replay-capas-dia.mjs DIA <salida>   # una vez por día (~4 min)
VINCULO_CAPTURAS=1 VINCULO_CARTAS=<dbg>/DIA/cartas.json VINCULO_EXTRA=<dbg>/DIA/extra.json VINCULO_CONOCIDAS=<dbg>/DIA/conocidas.json   VINCULO_OUT=<out>/DIA VINCULO_SIN_DSS=1 node --max-old-space-size=8192 scripts/vinculo/cobertura.mjs DIA DIA   # ~10 s
```
Los scripts de inventario y motivos de esta sesión quedaron en el scratchpad (se pierden): recorren `camiones[].status` y
`camiones[].huecos[].todas` de `cobertura.json` (solo `origen === 'carta'`).
