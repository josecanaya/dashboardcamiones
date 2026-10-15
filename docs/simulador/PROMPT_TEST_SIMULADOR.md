# Prompt · test estético y funcional del simulador de días

> Copiá todo lo que está debajo de la línea y pegalo en la IA que va a testear.

---

Sos un tester de producto **y** un revisor de modelos de simulación. Vas a probar a fondo, en el navegador, el **simulador de días de planta** del proyecto `Dashboard_camiones` (C:\Users\Usuario\Desktop\Dashboard_camiones, rama `automatizacion`). Respondé siempre en **español**.

**Tu trabajo es medir y reportar, no arreglar.** No edites código, no commitees, no regeneres datos (`npm run sim:motor` / `sim:build`), no borres nada. Si para avanzar necesitás cambiar algo, frená y preguntá.

## 1. Para qué existe esto (leelo antes de tocar nada)

La planta Ricardone y el Puerto San Lorenzo (Vicentin, Nodo Sur) reciben camiones de soja, girasol, pellet y líquidos. En los días pico la planta se satura: hay camiones esperando 3 a 6 h en Playa 1 (Ricardone) y en Playa OSL (puerto). La gerencia **no entiende tablas de capacidad**. Por eso el simulador tiene que **mostrarle**:

1. **Cómo fue** un día real, en el plano y hora a hora.
2. **Qué habría pasado** si en planta se decidía otra cosa: qué calles de calada abrir, qué volcables o silos y con qué producto, ritmo de egreso y camiones de la flota de transile.
3. **Cuántos camiones más se descargaban** con esa configuración y **qué la frena**.
4. **Cuánta capacidad sobró**: cuántos camiones más entraban ese día con esa configuración y desde qué hora la planta quedaba vacía.

Regla de oro del modelo: **lo único fijo del día real es la hora de llegada de cada camión** a la garita (o al puerto, en el caso de los transiles). Todo lo demás se maneja y tiene que cambiar la simulación.

Hallazgo que el simulador tiene que poder **demostrar**: el 29/08 manda el puerto (volcables de San Lorenzo), no la calada. Calar más rápido de madrugada no suma descargas, solo pasa la espera de Playa 1 a OSL. El puerto de noche rinde la mitad (15–19 por hora contra 30–34 por hora de día).

Preferencias del usuario. Son criterios de aceptación, no sugerencias:
- **Perillas y canales para manejar con la mano. Nada de presets.**
- **Todo en una sola pantalla de 1440×860, sin scroll.** Si hay que scrollear, es inoperable.
- **Sentido físico:** abrir un canal suma o da 0, nunca resta; cerrar resta o da 0. Más camiones no significa más descarga si algo satura.
- Informes **cortos y visuales**, y cada día dice **cuánto confiar** en él (confiable / aproximado / poco confiable).
- Colores de producto: **soja verde, girasol amarillo, pellet violeta, líquido azul.**

Contexto completo: leé `docs/simulador/PLAN_MOTOR_COLAS.md` (decisiones y números) y mirá por arriba `scripts/simulador/motor_colas.js` (motor que corre en la página) y `scripts/simulador/replay_template.html` (la página).

## 2. Cómo abrirlo

- Preferido: el dev server `vite-dev` de `.claude/launch.json` (puerto 5173) y navegar a **http://localhost:5173/simulador/index.html**. También probalo **dentro de la app** en la ruta de Simulación (`src/pages/SimulacionPage.tsx`, un iframe a esa misma página).
- Viewport principal: **1440×860**. Repetí lo visual en **1366×768** y **1920×1080**.
- Antes de empezar y después de cada bloque, revisá la **consola del navegador** (errores, warnings, NaN, requests 404 a `days/`, `escenarios/` o `model.json`).
- Días de referencia: **29/08/2026** (calibrado), **21/08** (calibrado), **25/08 y 03/09** (aproximados), **25/09** (poco confiable, +29 %), **01/09** (no debería estar: hueco de cámaras).

## 3. Pruebas funcionales

Para cada prueba anotá: pasos, lo que esperabas, lo que viste y una captura. Los números de referencia salen del plan y pueden haberse movido con cambios posteriores del motor: **tolerancia ±10 %**. Si un número se sale de esa tolerancia, reportalo como **"desvío a revisar"**, no como bug seguro.

### 3.1 Carga y navegación
- El selector de día, ◀ ▶ y el cambio de día: carga sin errores, el reloj vuelve a 00:00 y el escenario real del día (camiones y toneladas por producto, flota de pellet y viajes) cambia.
- Que el 01/09 no aparezca, o que aparezca con aviso.
- Que cada día muestre su confiabilidad y que coincida con el plan (25/09 tiene que decir poco confiable).

### 3.2 «Como fue» (repetición)
- ▶ Reproducir / Pausa, la barra de hora y la velocidad. Los camiones se mueven por los caminos y no cruzan campo.
- Las agujas de las playas (Playa 1, OSL) siguen la cola real. **29/08 de referencia: Playa 1 ≈ 131 / 182 / 178 / 94 / 32 / 3 a las 00/04/08/12/16/20 h; OSL ≈ 45 / 84 / 97 / 109 / 92 / 70.**
- Los eventos de la lista llevan a su hora al hacer clic.

### 3.3 Proyección sin tocar nada (calibración)
- 29/08 → «Proyección» → **⏭ Proyectar el día** sin tocar nada: el resultado tiene que quedar cerca del real (**≈ 590 descargas en el puerto, motor ≈ 592–593, ±5 %**).
- Lo mismo con 21/08 (≈ 583 contra 589). Con 25/08 y 03/09, que muestre el aviso de calibración aproximada.
- El cierre separa «configuración típica sin cambios» de «tus cambios». Sin jugadas, «tus cambios» tiene que dar **0**.

### 3.4 Sentido físico (lo más importante)
Sobre el 29/08, desde cero en cada caso («Empezar de cero» o «Volver a lo medido»):

| # | Jugada | Esperado |
|---|---|---|
| a | Abrir un volcable cerrado (por ejemplo V5 o V1) | ≥ 0 descargas de más; referencia V1 abierto ≈ +12 |
| b | Cerrar V4 a las 10:00 | resta (referencia ≈ −91) y sube la cola de pellet |
| c | Cerrar el egreso del puerto a las 12:00 | resta mucho (referencia ≈ −312); los camiones quedan arriba del volcable |
| d | Balanza de egreso del puerto a 20 por hora desde las 10:00 | resta (≈ −75) y OSL llega a ≈ 151 |
| e | Calada al 150 % | ≈ 0: no es el cuello |
| f | Puerto de noche a ritmo de día (00–06 h) | suma poco, techo ≈ +15 con llegadas fijas |
| g | Llegadas extra +20 % sin tocar capacidad | ≈ 0 de más; quedan camiones adentro a las 24 h |
| h | Llegadas +20 % y volcables al 150 % | suma (≈ +61) |
| i | Flota de pellet de 1,5× a 3× | el pellet descargado casi no cambia (≈ 159–164); crece la cola de carga en Ricardone |
| j | Cerrar la calle de líquidos (CL) | los líquidos se quedan en Playa 1 |
| k | Abrir cualquier canal (calle, volcable, silo) en 3 días distintos | **nunca resta** |
| l | Cerrar cualquier canal | **nunca suma** |

Reportá como **bug grave** cualquier caso en que abrir reste o cerrar sume.

### 3.5 Productos y canales
- Cambiar el producto de un volcable o calle (S/G/P/L): el canal queda **60 min sin recibir**, con luz ámbar y cuenta regresiva.
- Un canal recibe un solo producto. Si ningún canal abierto recibe un producto, el «Freno» tiene que avisarlo.
- Los Volcables 1/2 de Ricardone solo aceptan girasol, y los silos (K1, K2, CH) solo girasol o soja.
- Que los puntos del mapa y los conteos por producto bajo las agujas usen los colores correctos.

### 3.6 Hora a hora y jugadas
- **▶ Ver hora a hora**, pausar a las 10:00, cambiar un canal, volver a proyectar: el cambio vale **desde las 10:00** y lo anterior no se altera.
- La lista **Tus jugadas** muestra hora y texto entendible, y borrar una jugada recalcula.
- Después de la primera jugada **nada se reajusta solo** cada 2 h. El estado tiene que decir «día medido» o «manual desde HH:MM».
- Lo tocado a las 00:00 vale todo el día.

### 3.7 Cierre del día y Varios días
- El popup de cierre trae confiabilidad, real contra proyección (camiones y t), capacidad que sobró y desde qué hora queda vacía, una tabla corta, gráficos (acumulado, Playa 1 y OSL, con lo real punteado) y horas trabajando por canal. Sus botones son Repetir, Varios días, Seguir ajustando y Empezar de cero.
- **⏭ Varios días** con «Última semana» y con «Todos»: tabla por día y total. Medí cuánto tarda (referencia: una semana ≈ 4 s) y si la página se congela.
- Que los totales de la tabla sumen bien (verificá a mano 2 filas).

### 3.8 Robustez
- Clics rápidos repetidos en Proyectar, cambiar de día en medio de una proyección y abrir/cerrar modales con Esc.
- Valores extremos en perillas (0 y máximo) y faders a 0 con LED encendido: ¿qué pasa?
- Recargar la página: ¿se pierde la configuración? (Anotá el comportamiento; no es necesariamente bug.)
- Busca **NaN, undefined, negativos, porcentajes > 100 % sin explicación y textos en inglés**.

## 4. Pruebas estéticas y de usabilidad

- **Una pantalla sin scroll en 1440×860.** Medí `document.documentElement.scrollHeight > innerHeight` y lo mismo dentro del iframe de la app. Si hay scroll, decí qué bloque lo provoca y cuántos px sobran.
- Jerarquía: en 5 segundos, ¿se entiende **qué frena** y **cuánto se gana**? El número grande del resultado tiene que dominar.
- Legibilidad: el tamaño mínimo de texto (marcá todo lo que esté por debajo de 11 px), el contraste (WCAG AA en textos y en las etiquetas de velocímetros y vúmetros) y que no haya textos cortados o superpuestos.
- Consola: que faders, LEDs y botones S/G/P/L tengan un área de clic razonable (≥ 24 px), con hover y foco visibles y uso con teclado (Tab, flechas en las perillas `role="slider"`).
- Coherencia: los colores de producto en mapa, agujas, botones y gráficos; la marca amarilla siempre es «lo real» y la aguja, la simulación; el cartel «SIMULACIÓN» visible cuando corresponde.
- El lenguaje es para gerencia: sin jerga técnica (motor, freeze, augment, p75), números enteros y unidades claras.
- Dentro de la app: que el iframe ocupe bien el alto, sin doble scroll ni bordes raros, y que el tema oscuro de la página no choque con el shell.
- Comparación de viewports: capturas a 1366×768, 1440×860 y 1920×1080.

## 5. Revisión del modelo (crítica, sin tocar código)

Leé `motor_colas.js` y el plan, y opiná con evidencia de las pruebas:
- ¿Hay supuestos que puedan engañar a la gerencia? Por ejemplo: llegadas fijas (el techo de ganancia es chico), «capacidad que sobró» por réplica de llegadas, pellet con 17 % de error, Playa 3 con 9 min contra ~100 reales, OSL fuera de ±15 % en 21/08 y 03/09, Varios días sin arrastre entre días.
- ¿El paso de «día medido» a «manual» ya cambia el resultado sin tocar nada? Medilo en 29/08 a las 10:00 y explicá si eso se entiende en pantalla.
- ¿La página comunica bien cuándo un resultado es poco confiable?

## 6. Entregable

Un informe en Markdown en `docs/simulador/TEST_SIMULADOR_<fecha>.md`. Es el **único archivo que podés crear**. Tiene que traer:
1. **Veredicto en 3 líneas:** ¿está listo para mostrarle a la gerencia? Sí, no o con condiciones.
2. **Tabla de hallazgos:** # · severidad (bloqueante / grave / menor / sugerencia) · área (funcional / estética / modelo) · pasos · esperado · observado · captura.
3. **Tabla de la sección 3.4** con el resultado real de cada jugada contra la referencia.
4. Resultado de «una pantalla sin scroll» en los 3 viewports.
5. Lista de los 5 arreglos que más valor darían, ordenados por impacto.

No inventes resultados: si algo no lo pudiste probar, decilo.
