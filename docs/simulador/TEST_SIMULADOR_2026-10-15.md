# Test del simulador de días · 15/10/2026

Probado en el navegador de Claude sobre `vite-dev` (`http://localhost:5175/simulador/index.html`; el 5173 estaba ocupado) y dentro de la app en `/simulacion`. Rama `automatizacion`, página generada `public/simulador/index.html` del 15/10 16:18. No se editó código ni se regeneraron datos.

**Cómo se midió.** Navegación, botones, popups y modales: con clics reales. Para la batería de sentido físico (3.4) y los extremos, las jugadas se cargaron en el estado de la propia página (`LIVE`, `G`, `K`) y se corrió `apply()`, que es el mismo camino que usa la consola. Los números son los que muestra la página. Las capturas quedaron en la sesión de prueba y no se adjuntan, porque el prompt permitía crear un solo archivo.

## Veredicto

**Con condiciones. Así como está, todavía no.** El motor reproduce bien el 29/08 y el 21/08 y demuestra el hallazgo central: manda el puerto, y calar más rápido solo pasa la espera de Playa 1 a OSL. Pero la página no cumple «una pantalla sin scroll» (3.110 px de alto en 1440×860). El aviso de confiabilidad no se ve en la pantalla principal, y hay casos en que abrir resta: calles de calada (−1 a −2) y la calada al 150 % (−12).
Antes de mostrarla a gerencia hay que arreglar el scroll, el rótulo «real» (en realidad es el motor) y la regla de «abrir nunca resta».

## Tabla de hallazgos

| # | Severidad | Área | Pasos | Esperado | Observado | Captura |
|---|---|---|---|---|---|---|
| 1 | bloqueante | estética | Abrir la página a 1440×860, en Proyección | Todo en una pantalla, sin scroll | `scrollHeight` 3.110 contra 860 (2.250 px de más). Mapa y consola entran (terminan en y = 843). La columna derecha mide 1.657 px y la tarjeta «Qué cambia con la mesa» arranca en y = 933. Debajo siguen 5 tarjetas, el bloque inferior y el mapa de calor (hasta y = 2.893) | sesión, 1440×860 |
| 2 | grave | funcional | 1366×768 | Consola visible | La consola termina en y = 843 y la pantalla tiene 768: los faders y los botones S/G/P quedan 75 px abajo | sesión |
| 3 | grave | estética | App `/simulacion` a 1440×860 | El iframe ocupa el alto, sin doble scroll | Hay doble scroll: la página de afuera sobra 88 px (948 contra 860) y el iframe, 2.525 contra 828. La parte de abajo de la consola queda fuera de la pantalla (y = 887). El botón flotante «NVA» tapa los velocímetros de la derecha | sesión, app |
| 4 | grave | funcional/modelo | 29/08, abrir C1, C2, C5 o C6 a las 00:00 y a las 10:00 | Abrir suma o da 0 | Resta **−2** (00:00) y **−1** (10:00) en «tus cambios». Lo mismo el 25/08 y el 25/09 a las 10:00 (−1). El 25/09, abrir V3 a las 10:00 da −1 | — |
| 5 | grave | funcional/modelo | 21/08, cerrar VR1 o VR2 a las 00:00 | Cerrar resta o da 0 | **Suma +1** | — |
| 6 | grave | modelo | 29/08, ritmo de calada al 150 % y al 200 % (perilla `calPct`) | ≈ 0 | **−12** y **−15**. La espera para calar baja de 366 a 203 min, pero OSL sube a 190–223 y quedan 14 adentro. Más capacidad resta | — |
| 7 | grave | funcional | 29/08, cerrar la calle de líquidos (CL) a las 00:00 | Los líquidos se quedan en Playa 1 | Los 3 líquidos que van al puerto **se calan igual**, entre 2 y 11 min después del preingreso (CL cerrada y C1–C6 que no aceptan L). Después quedan varados en la balanza de ingreso del puerto hasta las ~18 h, sin volcable. Total: −8 | — |
| 8 | grave | funcional | Mirar la pantalla principal del 25/08 o del 03/09 | Aviso de calibración aproximada | El aviso (`mesaCalib`) está dentro de `#mesa`, que siempre está oculta: **no se ve**. La confiabilidad aparece recién en el popup de cierre y en Varios días | — |
| 9 | grave | modelo | Comparar la confiabilidad del popup con el plan | 25/09 poco confiable (+29 %) | El popup dice **aproximado (+6,2 %: 275 contra 259)**. El 25/08 y el 03/09 dicen «confiable» (+0,3 % y −3,1 %), y el aviso oculto (Python) los llama «aproximados». Conviven dos medidas de confianza distintas | — |
| 10 | grave | funcional | Popup de cierre del 29/08, sin cambios | «Real» = lo que pasó | «**635 descargas reales**» es el motor con todo en lo medido; las cámaras dan 590 en el puerto. En «Como fue», las agujas y la marca «real» también muestran el motor (Playa OSL 33 a las 20 h, contra 70 de las cámaras). Gerencia lee «real» como lo medido | sesión, popup |
| 11 | menor | funcional | Popup 29/08 | Una cifra de viajes | El chip dice «flota 52 · **134 viajes**» y el popup «Viajes de transile (54 → 54 camiones) **168**» | popup |
| 12 | menor | funcional | 29/08 sin cambios: popup contra Varios días | Misma capacidad que sobró | El popup dice **+10** y la fila del 29/08 en Varios días, **+17** | — |
| 13 | menor | funcional | Varios días «Todos» | Total = suma de filas | La suma de la columna «Sobró» da 2.619 y el total, **2.622** (la fila del 16/09 dice «—») | — |
| 14 | menor | funcional | Perilla de llegadas extra +20 % | Texto coherente | «de los **49** que van al puerto, **198** alcanzan a descargar». `extraDescargan` cuenta `outP.slice(port0)`, que incluye las vueltas de la flota (`motor_colas.js:320`) | — |
| 15 | menor | funcional | Cambiar de día | El reloj vuelve a 00:00 | `load()` deja el reloj en **10:00** (`T = 600`). Solo Proyección lo pone en 00:00 | — |
| 16 | menor | funcional | Selector de días | 01/09 fuera o con aviso | El 01/09 aparece como cualquier otro («225 de 297»). No tiene mesa ni Proyección, y no dice por qué. También aparecen días de 0–3 camiones (15/05, 26/06…) | — |
| 17 | menor | funcional | Varios días | No congelar la página | Una semana tarda 1,6 s y los 41 días, 6,0 s. La página se traba hasta **~1,0 s** seguido | — |
| 18 | menor | funcional | VR1 o VR2 con el botón P | Solo girasol | Los botones S, G y P están habilitados y el motor acepta pellet en VR1. Los silos también muestran S, G y P | — |
| 19 | menor | modelo | Ritmo de calada 0 % | Esperas que se entiendan | −382 descargas, pero la «espera para calar» **baja** de 366 a 115 min, porque solo cuenta a los que calan | — |
| 20 | menor | estética | Botones S, G, P y L | Área de clic ≥ 24 px | **7×12 px y 10×12 px**, con letra de 7–8 px. LEDs de 29×20, faders de 20×54 | — |
| 21 | menor | estética | Tamaño de letra | ≥ 11 px | Por debajo de 11 px: botones de producto (7–8 px), LED (9,5), rótulos de velocímetros `.gsec`/`.gl` (10,5), chips de producto, `.rl`, `.gs` y encabezados de tabla (10). Hay 57 textos SVG de los velocímetros con menos de 9 px de alto | — |
| 22 | menor | estética | Popup, horas por canal | Texto en una línea | «13,1 h → 13,1» y la «h» cae en otra línea | popup |
| 23 | menor | estética | Botón de producto apretado | Color del producto | Apretado, cualquier producto se ve verde menta (#7CC29C), muy parecido a soja. El color del producto solo aparece cuando está suelto | — |
| 24 | sugerencia | funcional | Ver si se pueden usar las perillas globales | Perillas a mano | Solo hay 2 perillas visibles (flota de pellet y de soja). Ritmo de calada, ritmo de volcables, llegadas extra, en camino, tope de OSL y parada están ocultas (`buildKnobs`, `d.hide = !d.fleet`). Las jugadas e, f, g y h no se pueden hacer desde la pantalla | — |
| 25 | sugerencia | estética | 1920×1080 | Aprovechar la pantalla | `.app` queda en 1.500 px de ancho y sobran 420 px | — |
| 26 | sugerencia | estética | Lenguaje | Sin jerga | «motor» aparece 4 veces y «fader» 1 vez en el texto visible | — |
| 27 | sugerencia | funcional | Recargar | Saber si se pierde | Se pierde todo: las jugadas solo están en memoria, sin storage | — |

Lo que funcionó bien: no hubo errores de consola, ni requests fallidos (102 requests a `days/` y `escenarios/`, todos 200), ni NaN o undefined en pantalla. Esc cierra los dos modales. Diez clics seguidos en «Proyectar el día» no rompen nada. Cambiar de día durante «hora a hora» vuelve a «Como fue». Al hacer clic en un evento de la lista, el reloj va a su hora. La perilla responde a las flechas y tiene foco visible. Los colores de producto en el mapa y en los chips son los correctos. El cambio de producto deja el canal 60 min en ámbar con cuenta regresiva («30' … recibe a las 11:00»). El freno avisa «Ningún canal abierto recibe pellet». Antes de la jugada nada cambia: hasta las 10:00 se descargan 237 camiones en los dos casos.

## 3.4 · Sentido físico (29/08, desde cero en cada caso)

Base de la página: **635 descargas** (612 en el puerto + 23 en Ricardone), 1 adentro a las 24 h.

| # | Jugada | Referencia | Resultado | ¿Cumple? |
|---|---|---|---|---|
| a | Abrir V1 a las 00:00 (V5 ya está abierto en lo medido) | ≥ 0, ≈ +12 | **0 en el día**: configuración típica −6 y tus cambios +6. A las 10:00 va +65 | sentido sí; magnitud con desvío |
| b | Cerrar V4 a las 10:00 | ≈ −91, sube la cola de pellet | **−104**: pellet de 157 a 53 y 52 adentro a las 24 h | sí; desvío de +14 % |
| c | Cerrar el egreso del puerto a las 12:00 | ≈ −312 | **−308**: OSL 256 y 268 adentro | sí |
| d | Balanza de egreso a 20 por hora desde las 10:00 | ≈ −75, OSL ≈ 151 | **−89**, OSL máximo 127 | sentido sí; desvío (+19 % y −16 %) |
| e | Calada al 150 % (solo por código) | ≈ 0 | **−12** (al 200 %, −15) | **no**: más capacidad resta |
| f | Puerto de noche a ritmo de día, 00–06 h (5 volcables a 7 por hora; solo por código) | techo ≈ +15 | **+2**. La espera en OSL baja de 160 a 36 min | sentido sí; desvío. La base JS ya deja solo 1 adentro |
| g | Llegadas +20 % (solo por código) | ≈ 0, quedan adentro | **+10**, 39 adentro | sí, con un desvío chico |
| h | Llegadas +20 % y volcables al 150 % (solo por código) | ≈ +61 | **+49**, 5 adentro | sentido sí; desvío de −20 % |
| i | Flota de pellet ×1,5, ×2 y ×3 | pellet ≈ 159–164 | **159 / 160 / 164**; OSL máximo de 124 a 139 | sí |
| j | Cerrar CL a las 00:00 | líquidos en Playa 1 | Se calan igual y quedan varados en la balanza del puerto; −8 | **no** (hallazgo 7) |
| k | Abrir cualquier canal, en 4 días y a las 00:00 y 10:00 | nunca resta | 29/08: C1/C2/C5/C6 −2 y −1. 25/08 y 25/09: −1. 25/09, V3: −1. El 03/09 está bien | **no** |
| l | Cerrar cualquier canal | nunca suma | 21/08: VR1 y VR2 a las 00:00 suman +1. El resto bien (por ejemplo, cerrar C4 da −374 y cerrar V4, −238) | **no** |

Barrido k/l: 20 canales (7 calles, 5 puntos de Ricardone, 5 volcables, Salida 2, balanza de egreso y egreso) × 2 horas × 5 días (29/08, 21/08, 25/08, 03/09 y 25/09). En total son 200 jugadas y fallan 19. Todas las violaciones son de 1–2 camiones, pero rompen la regla que pidió el usuario.

Otros números de calibración contra el plan (±10 %):
- 3.2, colas del 29/08 que muestra la página a las 00/04/08/12/16/20 h. Playa 1: **126/177/173/101/38/12** (referencia 131/182/178/94/32/3). OSL: **35/98/86/95/68/33** (referencia 45/84/97/109/92/70). A las 16 h OSL da −26 % y a las 20 h, **−53 %**: desvío a revisar.
- 3.3: descargas en el puerto del 29/08: **612** contra 590 reales (+3,7 %; el plan dice 592–593). 21/08: **573** contra 589 (−2,7 %; el plan dice 583). Espera en OSL del 29/08: **160 min** contra 203 reales (−21 %, fuera del ±15 %), aunque el aviso oculto dice «cumple los 4 criterios» con los números de Python.
- 3.3: sin jugadas, «tus cambios» no aparece y la diferencia es 0. Correcto.
- 3.6: pasar a manual a las 10:00 sin tocar nada da **−2** (el plan decía 556 contra 626; ya está corregido). La espera para calar sube de 366 a 401 min. En pantalla se lee como «configuración típica sin cambios: −2 · tus cambios: 0» y el estado dice «1 cambio · desde 10:00».

## Una pantalla sin scroll

| Viewport | Alto de la página | ¿Entra mapa + consola? | Qué provoca el scroll |
|---|---|---|---|
| 1366×768 | 3.160 px (Proyección) | **no**: la consola termina en y = 843, 75 px abajo | lo mismo que en 1440, más la consola |
| 1440×860 | 3.110 px (Proyección) · 2.539 (Como fue) | sí (y = 843) | columna derecha de 1.657 px (perillas y velocímetros 642, jugadas 119, «Qué cambia» 513, calles 294). Debajo de `.main`: `.more` (331), `.bottom` (243), mapa de calor (434) y notas |
| 1920×1080 | 3.090 px | sí | lo mismo; además sobran 420 px de ancho |
| App `/simulacion`, 1440×860 | afuera 948 y adentro del iframe 2.525 | **no** (y = 887 en pantalla) | doble scroll, y el botón «NVA» tapa los velocímetros |

## Los 5 arreglos que más valor darían

1. **Una sola pantalla.** Pasar la columna derecha y los bloques de abajo (`.more`, `.bottom`, mapa de calor, notas) a pestañas o a un panel plegable, dejar arriba el número grande y el freno, y ajustar el alto del iframe en `SimulacionPage` (sin el `min-h` + `flex-1` que desborda, y sin el botón NVA encima).
2. **Cumplir «abrir nunca resta / cerrar nunca suma».** Revisar por qué una calle extra de soja y girasol resta (lo más probable es que adelante soja y llene OSL, así el pellet no baja) y por qué subir el ritmo de calada resta. Agregar el barrido k/l como test automático sobre los 4 días.
3. **Confiabilidad visible y única.** Mostrar el nivel del día al lado del selector y usar una sola medida (JS contra cámaras). Hoy el aviso de Python está oculto y contradice el popup, y el 25/09 no da «poco confiable».
4. **Rotular bien «real».** En el popup, en Varios días y en las agujas de «Como fue», separar «medido por las cámaras» (590) de «reproducción del motor» (612/635). Unificar los viajes de transile (134 contra 168) y la capacidad que sobró (popup +10 contra Varios días +17).
5. **Respetar el producto de cada canal.** Calle CL cerrada → los líquidos no se calan. VR1 y VR2 solo girasol (deshabilitar S y P). Botones S/G/P/L de 24 px como mínimo, con el color del producto también cuando están apretados.

## Revisión del modelo

- **Llegadas fijas.** El techo de ganancia es chico: el 29/08 sin cambios ya deja 1 camión adentro, así que el puerto de noche a ritmo de día da +2 y no +15. Está bien que se diga, pero el número grande «0 de más» puede leerse como «no hay nada que mejorar». Hay que acompañarlo siempre con la espera que se ahorra (OSL de 160 a 36 min en f).
- **«Capacidad que sobró».** Replica llegadas con la misma mezcla, así que es una cota hipotética, y da cifras distintas según dónde se calcule (+10 / +17). En días flojos da mucho: el 10/08, +173, que es casi 66 % del día. Hay que presentarlo como «techo teórico».
- **Pellet.** El popup lo dice bien (+17,2 %, 157 contra 134 viajes), pero el chip de arriba usa 134 y el cierre, 168.
- **Esperas.** Solo promedian a los que pasan el recurso: cerrar la calada baja la «espera para calar» (hallazgo 19). Conviene contar también a los que siguen esperando a las 24 h.
- **OSL de tarde y noche.** La página muestra 33 a las 20 h y las cámaras, 70. La espera en OSL da −21 % el 29/08 y la de 21/08 y 03/09 ya estaba fuera según el plan. Si el comité habla de OSL, es la cifra más débil.
- **Varios días** no arrastra camiones de un día al siguiente. Está escrito en la nota, pero no al lado del total.
- **Paso a manual.** Ya casi no cambia el resultado (−2 a las 10:00), pero sube la espera para calar 35 min sin tocar nada. En pantalla solo se ve como «configuración típica sin cambios: −2», sin explicar por qué.
- **¿Comunica cuándo un resultado es poco confiable?** En la pantalla principal no. Solo el popup y Varios días lo dicen.

## Lo que no se pudo probar o se probó a medias

- **Capturas:** se tomaron en la sesión, pero no se guardaron como archivos (regla de un solo archivo). El navegador de prueba recorta las capturas a 800×600, así que la medición de layout se hizo por DOM y no a ojo.
- **Contraste:** se midió en el texto HTML (solo `SPAN.t` da 4,4:1, apenas por debajo de AA). No se midió en los rótulos dentro del canvas del mapa ni en los SVG de los velocímetros.
- **Arrastre con mouse de faders y perillas:** no se probó. Se probó el teclado en las perillas y un clic sobre un fader, que cargó una jugada de ritmo por accidente: el fader responde al clic sobre el riel, y eso es fácil de hacer sin querer.
- **Jugadas e, f, g y h:** no se pueden hacer desde la interfaz porque sus perillas están ocultas. Se corrieron con el mismo motor de la página, por código.
- **Cola de carga en Ricardone con flota ×3:** no se midió.
- **Tema oscuro dentro de la app:** solo se miró en la captura reducida; el contorno del iframe se ve bien.
