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
