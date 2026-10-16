# Plan de mejoras del simulador · para mostrarlo a gerencia (15/10/2026)

Sale del test del 15/10 (`docs/simulador/TEST_SIMULADOR_2026-10-15.md`, hallazgos #1 a #27). El objetivo es que la página se pueda mostrar a gerencia: **una pantalla, números en los que se pueda confiar y reglas físicas que nunca fallen**.

Archivos: `scripts/simulador/motor_colas.js` (motor), `scripts/simulador/replay_template.html` (página), `scripts/simulador/build_replay_html.py` (arma `public/simulador/index.html`) y `src/pages/SimulacionPage.tsx` (iframe).
⚠ El 15/10 hay otra sesión editando `motor_colas.js` y `replay_template.html` sin commitear. Antes de empezar, esperar su commit o hacer estos arreglos en esa misma sesión, de a uno. Nunca dos sesiones a la vez sobre esos archivos.

## Orden y por qué

Primero el motor (fases 1 y 2): si los números o las reglas fallan, no sirve tener una pantalla linda. Después, lo que se muestra (fase 3) y la pantalla (fase 4). Cada fase cierra con su prueba, y al final se repite el test completo (fase 5).

| Fase | Qué arregla | Hallazgos | Tamaño |
|---|---|---|---|
| 1 | Prueba automática de las reglas físicas | #4, #5, #6 | chico |
| 2 | Motor: abrir nunca resta, productos por canal, esperas, recalibración | #4–#7, #14, #18, #19 y desvíos de la 3.4 | grande |
| 3 | Qué se muestra: confiabilidad única, «medido» contra «reproducción», cifras que coincidan | #8–#13, #15, #16 | mediano |
| 4 | Una sola pantalla, iframe, botones y letras | #1–#3, #20–#23, #25, #26 | grande |
| 5 | Repetir el test completo | — | chico |

## Fase 1 · Prueba automática de las reglas (antes de tocar el motor)

- [ ] Agregar `scripts/simulador/test_reglas.mjs` (Node, sin dependencias), que carga `motor_colas.js` y los `days/*.json` + `escenarios/*_motor.json`, y comprueba:
  - **Abrir nunca resta / cerrar nunca suma:** cada canal (7 calles, 5 puntos de Ricardone, 5 volcables, Salida 2, balanza de egreso, egreso) × horas 00, 06, 10 y 16 × días 29/08, 21/08, 25/08, 03/09 y 25/09. Se compara contra el manual sin jugadas, igual que «tus cambios».
  - **Más ritmo nunca resta:** ritmo de calada y de volcables al 50, 100, 150 y 200 %, y faders de cada canal al 50 % y al 150 %.
  - **Producto:** con un canal cerrado o sin ningún canal para un producto, ningún camión de ese producto pasa por ese recurso.
  - **Calibración** (ver fase 2.4) con los números del motor JS.
- [ ] Agregarlo como `npm run sim:test`. Hoy tiene que fallar: 19 de 200 en el barrido del test, más la calada al 150 %.

**Listo cuando:** el script corre en menos de 1 min y reproduce los fallos del test.

## Fase 2 · Motor

### 2.1 Abrir nunca resta (#4, #5, #6)
- [ ] Encontrar la causa con la prueba de la fase 1. Hipótesis a confirmar: una calle o más ritmo adelanta camiones de soja, que llenan OSL o la ruta y le quitan el turno al pellet o al girasol (bloqueo en la cola de un producto por otro). El resultado da −1 o −2 por calle y −12 con la calada al 150 %.
- [ ] Arreglarlo en el mecanismo, no en el número. Si el bloqueo existe en la planta, decidirlo con el usuario (ver «Decisiones pendientes»). Si no existe, que cada cola por producto tenga su propio lugar: cupo de OSL y ruta por producto, igual que ya se hizo con el cupo «abajo» de la balanza.
- [ ] VR1 y VR2 a las 00 h del 21/08 suman +1 al cerrar: revisar si el girasol que no va a VR1 encuentra un camino más corto (por ejemplo, Playa 3 más libre). Mismo tratamiento.

### 2.2 Productos por canal (#7, #18)
- [ ] **CL cerrada:** hoy los líquidos se calan igual (2 a 11 min después del preingreso) y quedan varados en la balanza del puerto. Revisar el reparto de `motorFreeze` (`typical('cal')`): no le puede asignar «líquido» a una calle C1–C6, y el camino del líquido al puerto no lo puede mandar como soja (`motor_colas.js:102`, `prod: pp === 'liquido' ? 'soja'`) sin volcable que lo reciba.
- [ ] **Reglas de planta como límites duros:** VR1 y VR2 solo girasol; K1, K2 y CH solo girasol y soja; en el puerto V1, V2 y V5 soja y girasol, V3 soja, girasol y pellet, V4 pellet y soja. El motor rechaza cualquier otro producto y la consola deshabilita esos botones.

### 2.3 Cifras derivadas (#14, #19)
- [ ] `extraDescargan` sin las vueltas de la flota (hoy dice «de los 49 que van al puerto, 198 alcanzan a descargar»).
- [ ] Esperas que cuentan también a los que a las 24 h todavía están esperando (hasta las 24 h). Así, cerrar la calada no puede «bajar» la espera para calar.

### 2.4 Recalibrar con el motor JS (desvíos de la 3.4)
El motor JS ya no da lo mismo que Python. En el 29/08 da 612 contra 590 en el puerto (+3,7 %) y la espera en OSL, 160 contra 203 (−21 %). Playa OSL a las 16 h y a las 20 h queda 26 % y 53 % abajo.
- [ ] Medir los 4 criterios de aceptación con el motor JS, sobre 29/08, 21/08, 25/08 y 03/09.
- [ ] Ajustar el puerto de la tarde y la noche (16–24 h) hasta que OSL quede dentro del ±15 % en el 29/08. Probable causa: la balanza o los volcables de la tarde están por encima de lo medido.
- [ ] Volver a medir las referencias de la 3.4 y dejarlas escritas en `PLAN_MOTOR_COLAS.md` con los números nuevos, para que el próximo test compare contra lo que de verdad da.

**Listo cuando:** `npm run sim:test` pasa sin fallos, 29/08 y 21/08 cumplen los 4 criterios con el motor JS y la base de los 41 días sigue ≥ 34 dentro de ±5 %.

## Fase 3 · Qué se muestra

### 3.1 Una sola confiabilidad, visible (#8, #9)
- [ ] Sacar el aviso de Python (`mesaCalib`, hoy dentro de `#mesa`, que está oculto). Usar una sola medida: el motor JS contra las cámaras, en descargas del puerto y espera en OSL.
- [x] (15/10) Mostrarla **al lado del selector de día**, con un chip de color (confiable / aproximado / poco confiable), y repetirla en el popup y en Varios días.
- [ ] Revisar el 25/09: el plan lo daba +29 % y hoy da +6,2 %. Si cambió el motor, actualizar el plan. Si no, corregir el cálculo.

### 3.2 «Medido» contra «reproducción» contra «proyección» (#10)
- [x] (15/10, en la tarjeta de resultado; popup y Varios días dicen «reproducción» en vez de «real») En el popup y en Varios días, tres cifras con nombre claro: **medido por las cámaras** (590), **reproducción del día** (612 / 635) y **con tus cambios**. La ganancia se calcula siempre contra la reproducción y se explica en una línea.
- [ ] En «Como fue», las agujas y la marca amarilla usan la cola **medida por las cámaras**, no el motor.

### 3.3 Que las cifras coincidan (#11, #12, #13)
- [ ] Viajes de transile: una sola cuenta (hoy el chip dice 134 y el popup, 168).
- [ ] Capacidad que sobró: una sola función con los mismos pasos en el popup y en Varios días (hoy +10 contra +17 el 29/08).
- [ ] Total de Varios días = suma de filas (2.619 contra 2.622; la fila «—» del 16/09).

### 3.4 Días y reloj (#15, #16)
- [ ] Al cambiar de día, el reloj va a 00:00.
- [ ] El selector muestra solo los días con proyección. El resto, si queda, va marcado «solo repetición». El 01/09 lleva el motivo («falta el export de cámaras»).

## Fase 4 · Una sola pantalla

Diseñar para **1366×768 como mínimo** y verificar en 1440×860 y 1920×1080, sin scroll.
- [x] (15/10) **Distribución:**
  - Arriba, una línea con día, confiabilidad, chips del escenario y Como fue / Proyección.
  - A la izquierda, el mapa. Debajo, la consola, más compacta.
  - A la derecha, una columna fija con el **número grande** (descargas de más o de menos), el **freno** y velocímetros más chicos (2 filas en vez de 549 px).
- [x] (15/10, panel «Ver detalle» con pestañas Qué cambia, Jugadas, Calles y Día completo) Lo demás no se pierde, se mueve:
  - «Qué cambia con la mesa», la lista de jugadas, Calles, las tarjetas `.more` y `.bottom` y el mapa de calor pasan a un panel desplegable «Detalle» o a pestañas.
  - El análisis largo queda en el popup de cierre.
- [x] (15/10, el plano se achica según el alto) **Escalar con la ventana:** `clamp()` en los tamaños y el mapa con alto relativo, para que en 1366×768 no se corte la consola.
- [x] (15/10, sin doble scroll; el botón NVAi queda sobre la columna derecha, en un hueco libre) **Iframe en la app (#3):** `SimulacionPage` con alto exacto del área (sin `min-h` + `flex-1`, que hoy desbordan 88 px) y sin el botón flotante «NVA» encima, o con el botón movido en esa ruta.
- [ ] **Botones y letras (#20–#23):**
  - S/G/P/L de 24×24 como mínimo, con el color del producto también cuando están apretados (borde o tilde en vez de verde menta).
  - LEDs y faders de 24 px como mínimo de alto, y ningún texto por debajo de 11 px.
  - Horas del popup en una línea.
- [ ] **Lenguaje (#26):** sacar «motor» y «fader» del texto visible («simulación», «ritmo»).
- [ ] **Recargar la página (#27):** guardar las jugadas y la flota en `localStorage` por día, con try/catch, y ofrecer un botón «Empezar de cero».

**Listo cuando:** `scrollHeight <= innerHeight` en 1366×768, 1440×860 y 1920×1080, en la página sola y dentro de la app, y el número grande y el freno se ven sin mover nada.

**Estado 15/10:** medido en el navegador, sin scroll en 1366×768, 1440×860 y 1920×1080, en la página sola y dentro de `/simulacion`. Botón único de producto por canal con las reglas de planta (VR1 y VR2 fijos en girasol, silos soja o girasol); vuelven las perillas de ritmo de calada, ritmo de volcables y llegadas extra. Pendiente de esta fase: tamaños mínimos de 24 px en LEDs y faders, letras de 11 px en todo, horas del popup en una línea, sacar «motor» del texto y guardar las jugadas al recargar.

## Fase 5 · Volver a testear
- [ ] Correr de nuevo `docs/simulador/PROMPT_TEST_SIMULADOR.md` con las referencias nuevas de la fase 2.4. Criterio para mostrar a gerencia: ningún hallazgo bloqueante ni grave, y `npm run sim:test` en verde.

## Decisiones pendientes (del usuario)
1. **¿El bloqueo entre productos existe en la planta?** Por ejemplo, si soja en OSL demora al pellet aunque V4 esté libre. Si existe, «abrir resta» puede ser real: se deja y se explica en pantalla. Si no existe, se elimina del motor. Por la regla pedida («abrir nunca resta»), la recomendación es eliminarlo.
2. **Perillas globales.** Hoy en la pantalla solo están las de la flota. Ritmo de calada, ritmo de volcables y llegadas extra están ocultos, así que las jugadas «calada al 150 %», «puerto de noche» y «más llegadas» no se pueden hacer a mano. ¿Se vuelven a mostrar como 3 perillas en la consola?
3. **Base de comparación.** ¿«Descargas de más» contra la reproducción del motor (recomendado: compara lo mismo con lo mismo) o contra lo medido por las cámaras?

## Informe «Por qué» (15/10, pedido del usuario: «sin un informe de por qué descarga más o menos, no se entiende»)
- [x] Pestaña **Por qué**, la primera del detalle. Se abre con el botón «¿Por qué?» al lado del número grande, y su versión corta aparece en el cierre del día. Trae:
  - un veredicto en una o dos oraciones;
  - **qué suma y qué resta**: cada jugada, cada perilla y el paso a manual, medidos sacándolos y volviendo a correr el día;
  - en qué canal se nota: horas trabajando, cerrado, sin recibir o abierto sin camiones de su producto;
  - **por qué no da más**: quién queda adentro a las 24 h, por producto, y qué recurso manda;
  - **dónde se nota** y **cuánto se parece al día real**, hora por hora contra las cámaras.
- Tarda entre 0,1 y 0,3 s por análisis en el 29/08, porque corre el motor una vez por cada cambio.

## Escenario hipotético y programador (16/10, pedido del usuario)
- [x] **✎ Escenario** (al lado de Como fue / Proyección):
  - Se elige cuántos camiones de soja, girasol, pellet a Ricardone y líquido llegan entre las 00 y las 24 h, más los camiones de la flota de transile de pellet y de soja de silos.
  - Si se piden más camiones, se copian del mismo producto con su horario real (`motorEscenario` en motor_colas.js, 7 min después del original). Si se piden menos, se sacan parejo en el día.
  - No se tocan los que ya esperaban a las 00 h ni los transiles. Por eso el «real» de esa ventana es menor que el chip del Excel, y la ventana lo aclara.
  - En Varios días se aplica en proporción. «Por qué» lo mide como un aporte más.
  - Ejemplo en el 29/08: soja +20 % y girasol ×2 dan +26 y dejan 39 adentro a las 24 h. Soja a la mitad da −114.
- [x] **⏱ Programar** (en la consola): se eligen varios canales (calles, volcables y silos, estaciones), qué hacer (abrir, cerrar, ritmo o producto) y desde qué hora. Rechaza el producto que el canal no recibe y lista lo programado, con borrar.
