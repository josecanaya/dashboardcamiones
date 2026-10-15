# Motor de colas del simulador · plan de trabajo (15/10/2026)

Objetivo: pasar de la **repetición** de un día real (`scripts/simulador/replay_template.html`) a un **motor de colas** (simulación de eventos discretos) que, con las mismas llegadas reales, reproduzca el día y después muestre cuántos camiones más se podrían haber descargado cambiando el flujo.
Primer día de calibración: **29/08/2026**. Primer escenario: **llenar la noche** (más ritmo de calada en Ricardone en horario nocturno).

Contexto general: `docs/simulador/PLAN.md` (simulador) y `docs/presentaciones/alineamiento-camaras-2026-10-14/estudio-capacidades/traspaso_modelo_capacidades_circuitos.md` (capacidades).

## Estado (lo que ya se hizo)

- [x] Estrategia acordada con el usuario: calibrar primero, después las palancas A (llenar la noche), B (despacho desde Ricardone según ocupación de OSL), C (paradas escalonadas de volcables), D (cupos de llegada) y E (balanza automática en SL).
- [x] Medición de los días pico (sobre `public/simulador/days/<día>.json`):

| Día | Descargas (Excel) | Volcables SL de día | Volcables SL de noche | Preingreso→Calada |
|---|---|---|---|---|
| 29/08 | 560 | 26–32 por hora | 11–20 por hora | 308 min |
| 03/09 | 567 | 22–32 por hora | 3–17 por hora | 171 min |
| 21/08 | 548 | 18–22 por hora | 4–15 por hora | 182 min |

- [x] Mediciones del 29/08, solo camiones que descargan en el puerto con lectura en Preingreso y en Ingreso SL (421 camiones):
  - Calada→Salida 2: p50 11 min, p90 121 min (cola larga = Playa demorado).
  - Salida 2→Ingreso SL: p50 13 min.
  - Balanza ingreso SL→Volcable: p50 33 min, p90 68 min.
  - **Cola en Playa 1** (llegó a Preingreso y todavía no pasó por Calada): 113 camiones a las 00 h, 150 a las 04 h, 164 a las 10 h, 27 a las 16 h, **0 desde las 20 h**.
  - **Cola en Playa OSL** (pasó Ingreso SL y todavía no pasó por la balanza de ingreso): 30–77 camiones entre las 00 y las 16 h; baja a 14 a las 22 h.
  - Lecturas por hora del 29/08: la calada sale **a los saltos** (36, 5, 24, 10, 27, 3, 0…) y en la hora 7 marca **0**: hay un cambio de turno o una parada. Entre las 19 y las 23 h la calada está en ~0, pero esa noche Playa 1 ya estaba vacía. La balanza de ingreso SL llega a un **máximo de ~40 por hora** (1,5 min por pesaje) y los volcables a **~32 por hora**.
- **Corrección de la hipótesis «llenar la noche» para el 29/08:** la noche *de ese día* no tenía camiones esperando. Donde de verdad sobra cola es la **madrugada, de 00 a 08 h**: Playa 1 tiene 113–160 camiones, la calada saca unos 20 por hora con huecos, y los volcables del puerto trabajan a 8–17 por hora. El escenario A tiene que ser: **calada a ritmo pleno (2 caladores, ~60 por hora) entre las 00 y las 08 h, sin el hueco del cambio de turno**. Después hay que mirar si el puerto (OSL → balanza → volcables) absorbe ese adelanto.
- [x] Huecos de lectura: no todos los camiones tienen todas las lecturas (368 en Calada contra 407 en Preingreso; 79 camiones van «Preingreso→SL→Volcable» sin lectura de Calada). Hay que **imputar**: calada = Salida 2 − 6 min o, si no hay Salida 2, Ingreso SL − 19 min. La lectura que falta en el volcable se completa con balanza de ingreso + 33 min.

## Pasos que faltan

### 1. [x] Motor (`scripts/simulador/motor_colas.py`, Python sin dependencias) · hecho 15/10
Entrada: `public/simulador/days/<día>.json` + `public/simulador/model.json`. Formato de un camión: `[patente, grupo, t, [[nodo, minuto, device], …], transile, 'R'|'S'|'', t_descargadas]`. El minuto es relativo a las 00:00 del día; un minuto negativo es del día anterior. Los nodos son índices de `model.json`: 0 Ingreso RIC, 1 Preingreso, 2 Calada, 19 Salida 2, 20 Ingreso SL, 22 Balanza ingreso SL, 25 Volcables SL, 28 Balanza egreso SL, 30 Egreso SL, 31 Playa 1, 24 Playa OSL.

Alcance de la primera versión: el flujo R7 y todo lo que **descarga en el puerto** (`t[5] == 'S'`). Los que descargan en Ricardone (`'R'`, ~48) consumen calada, pero no van al puerto.

Recursos:
1. **Calada RIC**: perfil de capacidad por hora `cal_cap[h]` (camiones por hora). Cola FIFO por hora de llegada a Preingreso. El estado inicial son los camiones que ya estaban en Playa 1 a la hora de arranque. Hay que arrancar la simulación a las −6 h para que esa cola se forme sola.
2. **Calada→Ingreso SL**: la demora real de *cada* camión (incluye Playa demorado). Si falta, se usa la mediana (26 min).
3. **Playa OSL → balanza de ingreso SL**: 1 servidor, 1,5 min por pesaje y 15 min de limpieza por día. Un camión sale de OSL solo si hay lugar en los volcables (como máximo `V(t)` camiones + 1 por volcable en camino).
4. **Volcables SL**: `V(t)` servidores, con el tiempo de servicio y las paradas sacados de los datos (06:00 son 45 min todos juntos; 3 limpiezas de 30 min). La medición da un techo de ~32 por hora.
5. Opcional en la primera versión: la balanza de egreso no limita.

### 2. [x] Calibración contra el 29/08 · hecho 15/10, cumple los 4 criterios (ver «Resultados»)
- `cal_cap[h]`: sale del caudal observado en las horas en que **había cola** en Playa 1 (capacidad saturada), suavizado en bloques de 2 h, porque la cámara de calada sube las lecturas a los saltos. En horas sin cola se usa la capacidad nominal: 60 por hora con 2 caladores.
- `V(t)` y tiempo por volcable: se ajustan para que la serie de volcables por hora caiga cerca de la real.
- **Criterios de aceptación**: descargas en volcables entre las 0 y las 24 h dentro de ±5 % de lo real (491 lecturas, 512 descargas según el Excel). Serie por hora con error medio ≤ 4 camiones por hora. Colas en Playa 1 y en OSL cada 2 h parecidas a la tabla de arriba. Espera media Preingreso→Calada y Ingreso SL→Balanza dentro de ±15 %.
- Salida: `outputs/simulador/motor/2026-08-29_base.json`, con la serie por hora, las colas y las esperas, y un resumen de calibración en consola.

### 3. [x] Escenario A · llenar la madrugada · hecho 15/10, **no suma camiones** (ver «Resultados»)
- `cal_cap[h] = 60` entre las 00 y las 08 h, sin el hueco de la hora 7. El resto queda igual que en el escenario base.
- Medir: descargas extra en el día, nueva espera en Playa 1, si OSL pasa su capacidad (100) y qué recurso pasa a mandar. Ahí el puerto (balanza a 40 por hora o volcables a 32 por hora) debería convertirse en el techo.
- Variante A+B: soltar desde Ricardone solo si OSL tiene menos de N camiones, para no colapsar el puerto.
- Variante A+C: escalonar la parada de las 06:00.

### 4. [x] Llevarlo al visual · hecho 15/10
Hecho como **«Corregir el día»** en la repetición, en vez de pantalla dividida. Arriba hay una barra con «Como fue» y un botón por escenario (A, A+B, A+C, P, A+P). Al apretar uno, la animación pasa a los recorridos simulados sin perder la hora. La tarjeta «Qué corrige» muestra qué cambia, los **camiones descargados de más**, el contador hasta la hora actual, la comparación de esperas y máximos de las playas y qué recurso manda. En el gráfico de playas, el día real aparece punteado.
- `motor_colas.py <día> --visual` escribe `public/simulador/escenarios/<día>_<escenario>.json`, con el mismo formato de `trucks`. Las lecturas entre dos hitos del motor se corren con el hito siguiente, y la llegada queda fija.
- `build_replay_html.py` embebe el resumen de los escenarios. `npm run sim:motor` regenera los del 29/08, y `sim:build` ya lo incluye.
- La comparación es contra «Día real (motor)», el escenario base: no contra las lecturas, para no confundir mejora con lecturas faltantes.
- **Mesa de control (15/10, pedido del usuario: «un joystick del circuito», con perillas y sin presets).** El motor también corre en la página (`scripts/simulador/motor_colas.js`, embebido por `build_replay_html.py`), con las mismas reglas que el de Python: base 592, A 0, P +15, A+C +4 (Python +3), y cada corrida tarda entre 20 y 40 ms. La capacidad es física: **abiertas × ritmo de cada una**, para la calada (calles) y para el puerto (volcables). Hay dos capas:
  - **Barras por franja de 2 h:** calles de calada abiertas, ritmo por calle, volcables abiertos y ritmo por volcable.
  - **Perillas giratorias para todo el día:** ritmo de calada en %, calles ±, volcables ±, ritmo de volcables en %, pesaje en la balanza del puerto, camiones en camino por volcable, tope de OSL para soltar desde Ricardone y la parada de las 06:30. Las perillas solo actúan de 00 a 24 h: si movieran la precarga, los camiones se corrían al día anterior y salían del conteo.
  - **Para monitorear:** capacidad total por franja (en verde o rojo contra lo medido), colas de Playa 1 y OSL, qué recurso manda y el panel «Calles», con los camiones de la última hora por calle de calada y por volcable y si están abiertos, cerrados o en parada.
  - **Consola en vivo (bajo el mapa):** un canal por calle de calada (6) y por volcable (5), con vúmetro de la última hora, fader de ritmo y botón de encendido. Cada toque queda como **jugada** a la hora del reloj y vale desde ahí hasta que se vuelva a cambiar (motorLaneState en motor_colas.js: lo que dicen las perillas de esa hora y, encima, las jugadas). La lista de jugadas se puede borrar de a una. Al lado del reloj va el puntaje: descargas hasta esa hora contra lo real, y el total del día. Sin jugadas, el motor da exactamente lo mismo que antes. En el 29/08, prender el volcable 5 a las 12:00 da +38 a las 16:40 y +15 en el día.
  - **Manual desde la configuración típica (15/10, corrige «da muy mal»).** Congelar el minuto de la primera jugada dejaba la configuración de la noche todo el día (03/09 a las 00:14: V3 y V4 cerrados y 111 de pellet varados). Ahora motorFreeze arma la configuración típica de cada sector: reparte la capacidad media del día (00 a 24 h) entre productos según el volumen de cada uno, cada canal abierto trabaja por lo menos a su ritmo normal y como máximo al físico (volcable 10 por hora). Manual sin tocar contra lo real, en descargas del puerto: 29/08 +0,7 %, 21/08 +3,6 %, 25/08 +0,5 %, 03/09 −5,4 %.
  - **Flota de transile (pellet y soja de silos).** Los transiles ya no entran a su hora real: cada camión de la flota hace vueltas (ingreso SL → balanza → volcable → egreso → su vuelta medida, la mediana de egreso SL → siguiente ingreso → vuelve), dentro de su turno (de su primera llegada a su última salida reales). En la base reproduce los viajes reales (21/08: 154 contra 154). Las perillas «Flota pellet» y «Flota soja silos» van de 0 al triple de la flota real. La carga en Ricardone (tolvas) no se modela como recurso.
  - **Para qué sirve (definido por el usuario, 15/10):** se elige un día y ese día es el escenario fijo: camiones y toneladas por producto, flota de pellet y viajes, y la hora de llegada de cada camión. Se configura solo lo que se decide: calles de calada (abiertas, ritmo y producto), volcables y silos de Ricardone y del puerto (cuáles, ritmo y producto), egreso (Salida 2, balanza de egreso y egreso del puerto) y camiones de la flota de transile. Garitas, preingreso y balanzas de ingreso quedan como pasaron y no tienen perilla. Después se **proyecta el día** hasta las 24:00 o se mira hora a hora: se pausa, se cambia desde esa hora y se vuelve a proyectar, porque las capacidades varían en el día.
    - El cierre muestra la **capacidad que sobró**: desde qué hora la planta queda vacía y cuántos camiones más entraban con esa configuración. Para medirlo se agregan llegadas con la misma mezcla y el mismo horario (motorAugment admite más de 100 %, en rondas) hasta que cada tanda nueva rinde menos de 1 de cada 4. Ejemplo en el 29/08 con V1 abierto: +12 contra el día real, y entraban 127 camiones más (≈ 4.147 t).
  - **Varios días y confiabilidad (15/10).** `npm run sim:motor` (motor_colas.py todos --visual) prepara los 41 días con puerto y 300 camiones o más desde el 31/07, salvo el 01/09. Confiabilidad del motor sin cambios contra las cámaras, en descargas del puerto: 35 de 41 días dentro de ±5 %, 38 dentro de ±10 % y mediana 1,4 %. Fuera quedan el 12/08 (−15 %), el 31/08 (+11 %) y el 25/09 (+29 %). Cada día muestra si es confiable, aproximado o poco confiable.
    - **⏭ Varios días:** aplica la misma configuración (cambios con su hora y la flota en la misma proporción) a cada día del rango y muestra una tabla por día: real, proyección, diferencia en camiones y toneladas, capacidad que sobró y desde qué hora queda vacía, más el total. Una semana tarda unos 4 s. Cada día se simula por separado, sin arrastre entre días.
    - **Informe del día, nuevo y corto:** confiabilidad, número grande real contra proyección, capacidad que sobró, una tabla corta (productos, esperas, playas que se llenaron, viajes de transile), gráficos de descargas acumuladas y de Playa 1 y OSL (real punteado y proyección) y horas trabajando solo de los canales que trabajaron.
  - **Más y menos que se entiende (15/10).** Abrir una calle podía restar (29/08: abrir C5 daba −38) porque la balanza del puerto tenía un solo cupo «abajo» compartido por todos los productos: la soja llenaba el cupo y el pellet no pasaba aunque V4 estuviera libre. Ahora el cupo es por producto: volcables abiertos que lo reciben × (1 + en camino). Abrir suma o da 0 y cerrar resta en los 4 días, y la base sigue en ±5 %. Arriba a la derecha el resultado se separa en «pasar a manual sin tocar» y «tus jugadas» (una corrida extra sin jugadas) y aparece el **freno principal**: la playa o cola con más camiones de más que el día real, con su mezcla de productos, la jugada que cerró lo que la alimenta o el aviso de que ningún canal recibe ese producto. El día real se cuenta en descargas, con cada vuelta de transile, y no en camiones del Excel.
  - **Informe de cierre:** camiones y toneladas (Excel) en la realidad y en la simulación, por producto. Esperas. Veces que se llenó cada playa y horas llena. Flota: camiones, viajes y viajes por camión, con el detalle por patente. Horas de cada calle de calada, volcable y punto de Ricardone: activo, parado o en cambio, y cerrado. Base de comparación: el motor con todo en lo medido.
  - **Control manual (pedido del usuario: «cada 2 horas se vuelve a setear, eso no tiene sentido»).** Hasta la primera jugada los canales siguen el día medido. Desde la primera jugada (K.frozen, motorFreeze) cada calle, volcable, punto de Ricardone y estación queda como estaba en ese minuto y solo cambia con jugadas. Cada canal pasa a tener **un solo producto**, repartido según lo que espera y viene en camino en el día medido, con al menos un canal por producto. **Cambiar de producto deja al canal 60 min sin recibir** (luz ámbar y cuenta regresiva en el canal). Ejemplo en el 29/08: pasar a manual a las 10:00 sin tocar nada da 556 contra 626, porque el día medido abría volcables de 12 a 18 y en manual eso queda en manos del usuario.
  - Debajo de cada aguja de playa se ven los camiones por producto (soja verde, girasol amarillo, pellet violeta, líquido azul). En la consola están el total esperando por producto, el botón de pausa y el estado «día medido / manual desde HH:MM».
  - **Productos y plataformas (pedido del usuario).** Se separan soja, girasol y pellet: cada punto de descarga acepta ciertos productos y el camión solo va a uno que acepte el suyo. La balanza del puerto pesa al primero de OSL que tenga volcable abierto para su producto.
    - Reglas de planta por defecto: en el puerto, V1, V2 y V5 soja y girasol; V3 soja, girasol y pellet; V4 pellet y soja. Ritmo propio de cada volcable: p75 del día entre 5 y 10 por hora.
    - El girasol de Ricardone hace calada → balanza de ingreso RIC → Playa 3 (50 lugares) → Volcable 1 o 2 de Ricardone (solo girasol) o Silos Keppler línea 1, línea 2 y Chief (girasol y soja), a 4,5 por hora → balanza de egreso RIC. Arrancan abiertos los puntos que trabajaron ese día.
    - Las cámaras de los volcables pierden lecturas (21/08: 182 lecturas para 414 camiones de soja), así que en el puerto mandan las reglas y no lo que se leyó.
    - Calibración: la capacidad de cada hora se reparte entre los volcables abiertos según el ritmo de cada uno, × 1,05. Descargas del puerto: 29/08 +2,4 %, 21/08 −3,7 %, 25/08 0 %, 03/09 +0,8 %. Espera en OSL: 29/08 186 contra 203 y 25/08 103 contra 95; 21/08 190 contra 129 y 03/09 32 contra 63 quedan fuera del ±15 %.
    - Bloqueos que ahora sí frenan: Playa demorado llena (30) deja al camión en la calle de calada, y la espera para salir cuenta hasta pasar el egreso. Ejemplos en el 29/08: cerrar el egreso del puerto a las 12:00 da −312 y cerrar V4 a las 10:00, −91.
    - Consola: canales de descarga de Ricardone (BAL, VR1, VR2, K1, K2, CH, BAL E) y, debajo de cada volcable o silo, tres botones S, G y P para elegir qué recibe desde la hora del reloj.
    - Puntos del mapa: soja verde, girasol amarillo, pellet violeta.
    - Calada por producto: C1 a C6 calan soja y girasol, y se agrega la **calle de líquidos (CL, RicCalLiq)**, que en los datos caló pellet, líquidos y girasol. Cada calle tiene botones S, G, P y L, y cala al primero de Playa 1 cuyo producto acepta. La CL trabaja a su ritmo medido del día (p75 entre 2 y 7 por hora), que se descuenta de la calada calibrada. Espera para calar en la base: 29/08 366 contra 371, 25/08 104 contra 113, 03/09 154 contra 166, 21/08 251 contra 203. Si se cierra la CL, los líquidos se quedan en Playa 1 (03/09: −7 % de descargas en el puerto).
  - **Circuito completo (pedido del usuario: «lo único que se mantiene del original es la llegada»).** El motor JS ya no usa la demora real de cada camión entre calada y puerto: cada estación es un recurso con su ritmo y su cola. Las estaciones son Ingreso RIC, Preingreso, calles de calada, Salida 2, Ingreso SL, Balanza ingreso SL, volcables, Balanza egreso SL y Egreso SL. Solo quedan reales la hora de llegada a la garita y los tramos a pie o de ruta entre estaciones. Cuando una playa se llena frena a la estación anterior: Playa 1 llena frena el preingreso, Playa OSL con tope frena el ingreso SL y la espera para salir llena deja al camión arriba del volcable. Con todo en lo medido da 593 (Python 592); las garitas y la balanza de egreso no estaban medidas y van por encima de lo observado (90 y 40 por hora). Ejemplo en el 29/08: si la balanza de egreso baja a 20 por hora a las 10:00, el día termina con −75 y OSL llega a 151. La consola tiene un canal por estación y otro por calle o volcable. Los velocímetros tienen marcas y números: 9 son de ritmo por estación y 6 son agujas de playas y colas (afuera de Ricardone, Playa 1, Playa demorado, afuera del puerto, Playa OSL y espera para salir), con zonas verde, amarilla y roja contra la capacidad. En el mapa aparece el cartel «SIMULACIÓN».
  - **Rediseño en una sola pantalla (pedido del usuario):** al costado del mapa, **velocímetros** que solo muestran el ritmo de la última hora en la hora del reloj: llegadas, calada, balanza del puerto y volcables, más la cola de Playa 1 y de OSL. La aguja es la simulación y la marca amarilla, lo que pasó. En la consola, junto a los faders, van las **perillas de velocidad** para todo el día, con una nueva: **demora Ricardone → puerto** (escala el tramo calada→ingreso SL de 00 a 24 h). Preingreso e ingreso no llevan perilla porque no son cuello: la llegada es lo único fijo. El botón **Correr el día** arranca de 00:00, y a las 24 h se abre un **popup de cierre** con realidad contra simulación y lo que se cambió.
  - **Perilla «Llegadas extra a Ricardone» (palanca D):** copia el % elegido de los camiones que llegan en el día, repartidos parejo y 6 min después del original, con su producto, su destino y su demora real (`motorAugment` en `motor_colas.js`). En el 29/08, +20 % (56 camiones) da **0 de más**: 41 de las copias descargan, pero ocupan el lugar de otros y quedan 62 adentro a las 24 h. Con +20 % y los volcables al 150 % se suman **+61**; con +40 %, calada al 150 % y volcables al 150 %, **+116**, y no queda nadie adentro.
  - Con las mismas llegadas, en el 29/08 subir el puerto da como máximo +15 y bajarlo lo castiga fuerte: ritmo de volcables al 80 % da −113 y una balanza de 3 min, −128. La calada al 150 % no suma nada.
- La calada del motor JS usa calles en paralelo (servidores) para poder mostrar cada calle; el ritmo total por hora es el mismo de Python.
- Días con mesa (`npm run sim:motor`): 29/08 y 21/08, que cumplen los 4 criterios sin tocar parámetros (el 21/08 da 583 contra 589), y 25/08 y 03/09, con calibración aproximada (2 de 4: error por hora de 5,6 y 4,7; espera en OSL +19 % y −22 %). La mesa muestra el aviso. Esto adelanta parte del paso 5.
Pendiente original:
- `build_replay_html.py` / `replay_template.html`: modo «real contra mejorado» con el mismo día en pantalla dividida y un contador de **camiones descargados de más**. El motor exporta trayectorias con el mismo formato de `trucks` para reusar la animación.

### 5. Validación con un segundo día
- Repetir la calibración con el **03/09** y el **21/08** sin retocar los parámetros a mano, salvo el perfil de capacidad del día. Si no se puede, revisar el modelo.

## Resultados (15/10/2026)

Uso: `python scripts/simulador/motor_colas.py 2026-08-29 --todos` (o `--escenario A|AB|AC|P|AP`, `--N 80` para la palanca B).
Salidas en `outputs/simulador/motor/2026-08-29_<escenario>.json`: perfiles, series por hora, colas, esperas, qué recurso manda cada 4 h y la trayectoria simulada de cada camión.

### Cómo quedó el motor
- Eventos discretos con reintento cada minuto. Arranca a las −6 h y corta a las 26 h. Usa 476 camiones con calada y 656 visitas al puerto (incluye las vueltas de los transiles, que entran al puerto a su hora real y no pasan por la calada).
- Imputación: 65 caladas (Salida 2 − 6 min o Ingreso SL − 19 min), 66 preingresos (calada − espera mediana de los vecinos ±60 min), 45 ingresos SL y 117 volcables (balanza + 33 min, o egreso − 17 min).
- **El total real de comparación es 590 descargas en volcables entre las 0 y las 24 h**, no 491 ni 512: son las 491 lecturas más las 99 visitas con pesaje pero sin lectura de volcable. El Excel (512) cuenta una sola vez a cada transil, aunque hizo varias vueltas.
- Antes de las 00 h la calada repite el caudal observado: el archivo del día solo trae los camiones que tocan el día, así que poner 60 por hora en la precarga vaciaba Playa 1 (99 camiones a las 00 h contra 131 reales).
- **Ajuste que cambia el plan:** la compuerta «V(t) + 1 por volcable en camino» no calibra. El traslado balanza→volcable mínimo (p10 medido) es de 16 min e incluye la calada de SL, así que para sacar 30 por hora tiene que haber unos 8 camiones en camino. Con +1 el puerto rinde **−31 %** (409 descargas). Con **+3 por volcable** (20 camiones abajo con 5 volcables) cierra.
- Paradas de volcables vistas en los datos: a las 06:30 se paran los 5 durante unos 45 min (no a las 06:00) y a las 18:30 hay otra parada colectiva. La de las 18:30 queda dentro del perfil observado.

### Calibración 29/08 (escenario base)
| Criterio | Real | Simulado | ¿Cumple? |
|---|---|---|---|
| Descargas en volcables 0–24 h | 590 | 592 (+0,3 %) | sí (±5 %) |
| Error medio por hora en volcables | — | 3,6 por hora | sí (≤4) |
| Espera Preingreso→Calada | 371 min | 364 min (−1,9 %) | sí (±15 %) |
| Espera Ingreso SL→Balanza | 203 min | 213 min (+5,1 %) | sí (±15 %) |
| Cola Playa 1 a las 00/04/08/12/16/20 h | 131/182/178/94/32/3 | 132/184/180/96/34/5 | sí |
| Cola OSL a las 00/04/08/12/16/20 h | 45/84/97/109/92/70 | 38/101/90/114/109/70 | sí, el error medio es de 7 camiones |

Perfiles calibrados: la calada (camiones por hora, en bloques de 2 h, de 00 a 23 h) da 33, 16, 20,5, **1,5** (06–08), 20,5, 58, 11, 29,5, 13 y 2,5, y después 60 nominal. Los volcables dan 15,5 (00–02), 18,5, 24, 33, 31, 29, 34,5, 30,5, 29,5 y 20–22,5 de noche.
Ojo: medida con todas las visitas, **Playa OSL ya estuvo en 95–115 camiones entre las 02 y las 16 h el 29/08 real**, en el límite de su capacidad de 100. La tabla de arriba (30–77) usaba solo los 421 camiones con las dos lecturas.

### Escenarios (29/08, mismas llegadas)
| Escenario | Descargas de más | Espera Playa 1 | Espera OSL | OSL máximo | Manda |
|---|---|---|---|---|---|
| Base | — | 364 min | 213 min | 123 | volcables SL todo el día |
| **A** calada 60 por hora de 00 a 08 h | **0** | 87 min | **388 min** | **258 (pasa 100)** | volcables SL |
| A+B (N = 80) | 0 | 87 min | 172 min | 90 | volcables SL; quedan **hasta 185 camiones retenidos en Ricardone** ya calados |
| A+B (N = 100) | 0 | 87 min | 207 min | 107 | ídem, con hasta 173 retenidos |
| A+C parada de 06:30 escalonada | +3 | 87 min | 379 min | 253 | volcables SL |
| P (sensibilidad): puerto de 00 a 08 h a ritmo de día (5 volcables, 30 por hora) | **+15** | 364 min | **78 min** | 57 | volcables hasta las 20 h; después se queda sin camiones |
| A+P | +15 | 87 min | 252 min | 192 | volcables SL |

Lectura:
- **El 29/08 la calada no era el techo: mandaba el puerto.** Playa OSL nunca bajó de 37 camiones y los volcables trabajaron al 100 % las 24 h. Calar más rápido de madrugada **solo pasa la espera de Playa 1 a Playa OSL**: se ganan 277 min en Ricardone, se pierden 175 min en el puerto, y OSL llega a 258 camiones, 2,5 veces su capacidad. No se descarga ningún camión de más.
- B evita que OSL colapse, pero no gana nada: los camiones esperan ya calados en Ricardone, y son 150–185 contra los 30 lugares de Playa demorado. En la práctica, B con A equivale a no adelantar la calada.
- C (escalonar la parada) mueve muy poco: +3 camiones, porque reparte la misma pérdida de capacidad.
- **La palanca que sí mueve es el puerto de noche.** De 00 a 06 h los volcables rinden 15–19 por hora contra 30–34 de día, con cola en OSL. Llevarlos al ritmo de día saca **+15 camiones** en el día (todos los que a las 24 h seguían en el puerto: es el máximo posible con las llegadas de ese día) y baja la espera en OSL de 213 a 78 min. Con estas llegadas fijas, «más descargas» tiene ese techo de unos 15–20 camiones. Para ver más, hay que sumar la palanca D (más llegadas o cupos).
- Hay que preguntar a planta por qué el puerto rinde la mitad de noche: ¿menos personal por volcable, calada SL o balanza de egreso? Eso decide si P es factible.

## Cuidados
- No usar el 01/09: tiene un hueco en el export de cámaras.
- En el Excel, mayo agrupa los movimientos por ingreso y agosto en adelante por salida. Para comparar, usar días del mismo período.
- La hora operativa ya viene corregida en `days/*.json` (occurredAt + 206 min).
- Preguntar a planta: ¿la calada trabaja de noche? ¿Cuántos caladores hay por turno y a qué hora es el cambio?
