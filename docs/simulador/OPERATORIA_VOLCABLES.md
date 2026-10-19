# Volcables del puerto y balanza de ingreso SL: operatoria real (16/10/2026)

Lo medido sirve para que los escenarios del simulador tengan techos reales. Las fuentes son dos:
- **Cámaras:** 146 días del simulador (`public/simulador/days`, del 15/05 al 12/10), con la lectura de cada volcable (`SLZVolcableC1–C5`) y de la balanza de ingreso SL.
- **Excel:** la planilla de movimientos (`data/movimientos`, 143 días), con plataforma `VOLCABLE_PTO_1–5`, sin patentes ficticias y por día operativo.

Las cámaras leen alrededor del **75 %** de lo que dice el Excel en los días fuertes (29/08: 491 contra 654). Por eso los ritmos por hora de cámara son un piso. Para escalar, multiplicar por 1,3.

Los scripts que lo calculan están en el scratchpad de la sesión: `stress_volc.py`, `stress_excel.py` y `stress_patrones.py`. Si se vuelve a medir, conviene pasarlos a `scripts/simulador/`.

## Techos reales

| Qué | Normal | Fuerte (p90) | Récord |
|---|---|---|---|
| Descargas por día en volcables del puerto (Excel) | 326 | 511 | **654** (29/08, 167 de pellet) |
| Descargas por día de una volcable (Excel) | 85 a 116 | 140 a 167 | V1 170 · V2 195 · V3 194 · V4 169 · V5 170 |
| Camiones por hora de una volcable (cámaras, horas activas) | 3 a 4 | 6 a 7 | 8 a 12 en una hora; sostenido 6 h: 7 a 9 |
| Camiones por hora en todo el puerto (cámaras) | 7 | 18 | 32 (cuatro días distintos) |
| Balanza de ingreso SL, camiones por hora (cámaras) | 11 | 23 | 50 en una hora; sostenido 3 h: 41 (p90 de los días: 29) |

- No hay **ningún día** con 4 volcables por encima de 150 camiones a la vez, y hay **uno solo** con 3.
- Las 5 volcables trabajando a la vez solo se vieron en 28 horas de los 146 días.

## Cómo opera

1. **Dos cambios de turno, a las 06:00 y a las 18:00.** Todo el puerto queda al menos 30 min sin descargas en 10 de 16 días fuertes a las 06 h, y en 14 de 16 a las 18 h. Esa hora cae de unos 20 a 4–12 camiones leídos. El motor solo tiene la parada de las 06:30 (`prm.paradas`), y la de las 18 h no está en la planta estándar.
2. **De noche se descarga a la mitad, aunque haya cola.** Entre las 00 y las 05 h se leen unos 10–11 camiones por hora, contra 19–20 entre las 08 y las 17 h. En esas horas esperan unos 30 camiones en Playa OSL y hay unas 3,3 volcables activas. Así que no faltan camiones: cada volcable rinde unos 4 por hora de noche (escalado) contra unos 7 de día.
3. **El pellet va a V4 y a V3.** V4 descargó 1.021 viajes de pellet contra 723 de soja; V3, 301 de pellet. V1, V2 y V5 son de soja casi siempre, y V5 es la más usada (134 días).
4. **Mezclar soja y pellet en la misma volcable el mismo día es raro:** pasó 3 días en V3 y 3 en V4 (Excel). En los 58 cambios que leyeron las cámaras, el hueco medio fue de 9 min, igual que entre dos camiones del mismo producto. No alcanza para medir el costo del cambio. La regla del simulador (60 min sin recibir) sigue el criterio operativo y no se cambió.
5. **La balanza de ingreso SL aguanta picos de 40 a 50 por hora,** pero ningún día sostuvo más de 41 por hora durante 3 h. En el día récord pasaron unos 690 camiones (escalado), o sea unos 27 por hora en promedio. El motor la toma a 40 por hora, que corresponde al pico y no al promedio del día.
6. **Del ingreso a la salida del puerto pasan unos 312 min de mediana** (p10 152, p90 506), según el Excel.

## OEE de cada volcable (capacidad teórica × disponibilidad × rendimiento)

El concepto de ingeniería es la eficiencia global del equipo (**OEE**). La capacidad real de una máquina es su capacidad teórica (60 min / ciclo ideal) por la **disponibilidad** (parte del tiempo en que puede trabajar) y por el **rendimiento** (qué tan cerca del ciclo ideal va cuando trabaja). Se midió en los 16 días fuertes, solo en las horas con cola en el puerto (≥ 15 camiones adentro esperando volcar), que es cuando la volcable tenía trabajo:

| Volcable | Ciclo teórico | Teórica/h | Disponible de día (07–19) | Disponible de noche | Rendimiento | Real/h día · noche |
|---|---|---|---|---|---|---|
| V1 | 5,9 min | 10,2 | 62 % | 40 % | 83 % | 5,2 · 3,4 |
| V2 | 5,7 min | 10,5 | 58 % | 33 % | 100 % | 6,1 · 3,5 |
| V3 | 5,3 min | 11,3 | 53 % | 33 % | 96 % | 5,7 · 3,6 |
| V4 | 7,2 min | 8,3 | 66 % | 32 % | 100 % | 5,5 · 2,7 |
| V5 | 7,4 min | 8,1 | 76 % | 25 % | 100 % | 6,2 · 2,0 |

Cómo se midió:
- **Ciclo teórico:** p20 del intervalo entre dos camiones seguidos en la misma volcable con cola. Una lectura perdida alarga el intervalo y nunca lo acorta, así que los percentiles bajos son confiables.
- **Disponibilidad:** minutos de la hora sin un hueco de más de 20 min en esa volcable.
- **Rendimiento:** camiones de la hora, escalados por la cobertura de cámara (0,75), contra los que entraban en los minutos disponibles a ritmo teórico, con tope 100 %.

Lectura: **cuando trabajan, las volcables van casi al ciclo ideal; lo que se pierde es disponibilidad**, sobre todo de noche. Hay un sesgo posible: un hueco por falta de camiones de su producto, con cola de otro, cuenta como parada.

Cinco volcables a capacidad real durante 24 h dan unas 550 a 600 descargas, cerca del récord de 654. A capacidad teórica serían unas 1.150, y eso no se ve nunca.

## En el simulador (desde 16/10)

**OEE (reemplaza a los turnos):** `planta_estandar.mjs` guarda `oee` en `_estandar.json` (ciclo, teórica, dispDia, dispNoche y rend por volcable). En el escenario propio, cada volcable trabaja así:
- A **teórica × rendimiento**, sin pasar nunca la teórica.
- Cada hora para **(1 − disponibilidad) × 60 min**, con la disponibilidad de día o de noche según la hora. Cada volcable para en otro minuto de la hora para que no paren todas juntas.

Como la disponibilidad medida ya incluye los cambios de turno, en este modo no se suman las paradas ni el factor de `turnos`. Las perillas **Disponibilidad** (medido 48 %, hasta 100 %) y **Rendimiento** (medido 96 %, hasta 100 %) reemplazan a «Ritmo calada» y «Ritmo volcables» en el escenario propio, y multiplican lo medido de cada volcable. El chip de la barra dice «OEE medido», con el detalle por volcable. Los días reales no cambian (29/08 sigue en 635).

| «Soja Fuerte + Pellets», V5 y C1 en soja, carga a 7 | Descargas | En el puerto | Adentro a las 24 h | Por volcable |
|---|---|---|---|---|
| OEE de hoy (disponibilidad 48 %) | 606 | 567 | 268 | 118/130/117/85/117 |
| Disponibilidad 60 % | 714 | 675 | 167 | 141/153/151/100/130 |
| Disponibilidad 75 % | 790 | 751 | 91 | sale el aviso de récord |
| Disponibilidad 100 % (techo teórico) | 867 | 828 | 14 | 181/183/180/105/179 |

Día típico con OEE: 390 descargas, 359 en el puerto.

**Turnos y récords (antes del OEE):**

`node scripts/simulador/planta_estandar.mjs` guarda dos cosas en `_estandar.json`:
- **`turnos`:** de los 16 días fuertes salen dos datos:
  - Un factor por hora para el ritmo de las volcables, contra el de las 08–17 h. Va de 0,40 a 0,58 entre las 19 y las 07 h, con 0,78 a las 08 h y 0,73 a las 18 h.
  - Las paradas de cambio de turno: **06:00 durante 65 min y 18:00 durante 40 min**, con los 5 volcables, medidas como el hueco mediano sin descargas en todo el puerto.
- **`record`:**
  - Excel: puerto 654 por día (29/08); por volcable V1 170, V2 195, V3 194, V4 169 y V5 170.
  - Cámaras: balanza de ingreso SL 43,3 por hora durante 3 h (15/09).

En el escenario propio, el motor aplica el factor de la hora a cada volcable (`ln.turno` en `motorLaneState`, solo si el motor trae `turnos`) y las paradas de turno en lugar de la de 06:30. Los días reales no cambian: siguen con su perfil medido. La perilla Parada en «sin» saca las paradas y el factor. La barra muestra el chip «turnos reales». Cuando la proyección pasa un récord (descargas del puerto en el día, descargas de una volcable o balanza de ingreso SL en 3 h), aparece un aviso «Por encima de lo real» en la tarjeta de resultado y en el cierre del día.

Con turnos, el día típico (295 llegadas) da 397 descargas, 366 en el puerto (antes eran 421 y quedaban 2 adentro). El Excel da 326 en un día normal.

## Qué cambia para los escenarios

Antes de los turnos, la planta estándar del escenario propio usaba el ritmo mediano de cada volcable cuando abre (7,3 a 8,4 por hora) durante 24 h, sin parada a las 18 h. De noche y en los cambios de turno daba más de lo que se ve.

Ejemplo, «Soja Fuerte + Pellets» (750 de soja, operativo de pellet de 3.000 t) con V5 y C1 en soja y carga a 7 por hora:

| | Descargas | Adentro a las 24 h | Playa OSL máx. |
|---|---|---|---|
| Planta estándar (24 h parejas) | 867 (unas 828 en el puerto) | 14 | 20 |
| Con turnos reales (noche a 4,5 por hora y paradas de 06 y 18 h de 60 min) | 685 (unas 650 en el puerto) | 196 | 180 (desborda) |

Con la operatoria real, el puerto queda en el récord histórico (654). Un escenario que da más de unas 650 descargas por día en el puerto, o más de unas 190 en una volcable, va **por encima de todo lo que se vio**.
