# Simulador de días · Nodo Sur

Objetivo: que la gerencia **vea** un día de la planta y compare escenarios, en vez de leer tablas de capacidad. Se mueven perillas (llegadas, balanza, volcables, flota de transile) y se ve en el plano cómo crecen o se vacían las colas, cuánto se descarga y cuánto cuesta.

Decisiones tomadas (14/10/2026): se hace **después de la reunión**; abarca **las dos plantas y el viaje**; **2D primero, 3D después**; perillas: **llegadas, balanza, volcables y flota de transile**.

## 0. Primero: repetición de un día real (14/10)

Antes de simular, **reproducir un día real** con los datos que ya tenemos: eventos de cámara (`data/truckflow/<día>/event-list.json`, hora operativa = occurredAt + 206 min) y el Excel de movimientos del mismo día. Se elige cualquier día y se pasa a **1 hora por minuto**: los camiones aparecen en el plano cuando la cámara los lee y avanzan por los puntos donde los vieron. Se puede pausar, adelantar y ver:

- cuántos camiones hay en cada playa y en cada recurso a cada hora;
- cuándo y dónde se saturó (playa al 100 % de su capacidad, cola en balanza o volcables);
- qué pasó en ese momento (parada de volcable, cambio de turno, pico de llegadas).

El simulador de la sección 1 parte de esa repetición: mismas llegadas, y se cambian las perillas para ver qué habría pasado.

**Parámetros fijados por el usuario (14/10):** balanza automática **1 min por pesaje**; carga en Celda 16 **30 min por camión**; el número que limita a R7 **sale del simulador** (no se carga como dato). Horarios de operación: se deducen de los datos (cuándo hay lecturas), no se asumen 24 h.

## 1. Qué se simula

Simulación de eventos discretos, camión por camión, minuto a minuto, de un día (24 h) o una semana.

| Etapa | Recurso | Capacidad de partida (estudio de capacidades) |
|---|---|---|
| Ricardone: ingreso y preingreso | puestos de lectura | ~1 min por camión |
| Playas 1 y 2 | espera | 450 camiones |
| Calada Ricardone | caladores | 2 de 3 activos, 30 camiones/h cada uno; 20 min por cambio de turno |
| Playa 3 | espera por destino | 30 camiones |
| Salida Ricardone | | ~30 s por camión |
| Viaje Ricardone → San Lorenzo | | ~12–15 min |
| Ingreso San Lorenzo / Playa OSL | espera | 150 camiones |
| Balanza ingreso SL | balanza | 1,5 min por pesaje (38/h), 15 min de limpieza por día |
| Volcables SL | 5 plataformas | 1 camión cada ~7 min; parada 06:00 de 45 min y 3 limpiezas de 30 min |
| Balanza egreso SL | balanza | 1,5 min por pesaje |
| Transile (pellet, soja de silos, Celda 16) | flota + punto de carga | carga SP 4/h; silos 4–5/h; Celda 16 carga 5/h |

Circuitos que comparten recursos (no se suman): R5+R6 volcables RIC, R13–R15 carga SP, R30–R32 transile, R33+R34 líquidos. Ver `docs/presentaciones/alineamiento-camaras-2026-10-14/estudio-capacidades/`.

## 2. Datos de entrada

- **Llegadas reales**: día y semana de mucha actividad del Excel de movimientos (`data/movimientos/`), hora de ingreso por camión y producto. Escenario alternativo: las mismas llegadas repartidas por cupo cada 2 h.
- **Tiempos de servicio**: distribución medida por tramo con las cámaras (`r7-camaras.json`, comités), no solo el promedio, para que aparezca la variabilidad.
- **Paradas reales**: mantenimiento de volcables (PV2 08/10, V1 28–29/09) para reproducir días malos.

## 3. Calibración (antes de mostrar cualquier número)

1. Reproducir 2 semanas reales con los mismos volúmenes y ciclos opuestos: **07/09 (2.654 camiones, 5,6 h)** y **13/07 (2.596 camiones, 8,7 h)**. El simulador tiene que dar ciclos y esperas cercanos a lo medido.
2. Validar contra el récord de R7 (3.800 camiones, semana del 17/06, 338 min).
3. Recién con eso, correr escenarios.

## 4. Salidas que ve la gerencia

- Plano animado: camiones como puntos que avanzan por el circuito, colas que se llenan por color (verde → ámbar → rojo según capacidad de la playa).
- Reloj del día y velocidad (×60, ×600).
- Contadores en vivo: camiones descargados, toneladas, espera media, recurso saturado ahora.
- Comparación lado a lado de dos escenarios ("hoy" vs "con balanza automática").
- Resultado en dinero: toneladas por día/semana × USD 370; viajes de transile por camión por día y flete por tonelada ($ 6.000 hoy).

## 5. Visual

- **Etapa 1 (2D)**: planta vista desde arriba sacada de los IFC parametrizados (`Desktop/Modelos Paramerizados/NVA_Ricardone.ifc`, `NVA_San_Lorenzo.ifc`), simplificada a calles, playas, balanzas y volcables. Los nodos y circuitos salen de `modelo_nodo_sur.json`.
- **Etapa 2 (3D)**: el mismo motor sobre el IFC cargado en el navegador (web-ifc + three.js), cámara orbital, camiones 3D.

## 6. Fases

0. Repetición 2D de un día real (cámaras + Excel), a 1 hora por minuto, con ocupación de playas y saturación.
1. Motor de simulación + calibración con las 2 semanas (sin visual).
2. Plano 2D animado + perillas + comparación de escenarios.
3. Escenarios de negocio: balanza automática, 5 volcables, cupo cada 2 h, flota de transile para Celda 16.
4. 3D sobre el IFC.

## 7. Datos

- Balanza automática: 1 min por pesaje (hoy 1,5 min).
- Celda 16: 30 min de carga por camión.
- Límite de R7: resultado del simulador.
- Horarios de operación: se deducen de las lecturas de cámara de cada día.
- Pendiente: tarifa de transile de soja (hoy se usa la de pellet, $ 6.000/t).
