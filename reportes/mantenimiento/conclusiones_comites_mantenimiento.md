# Comités de logística y mantenimiento: conclusiones

Período cruzado: las 11 semanas de comité del 14/06 al 16/09. Las fuentes son tres:

- el mapa de planta `mapa_planta_mantenimiento.json`;
- las OT del EAM, con su fecha programada;
- el Excel de movimientos.

El detalle semana a semana está en `cruce_comites.md` y se regenera con `python agentes/mantenimiento/cruce_comites.py --ot <OT_detalle_fechas.csv>`.

## 1. En Ricardone, la calada depende de los caladores y no de la cola

Semana a semana, la espera de calada que publica el comité (Playa 1) sigue a la cantidad de días con OT correctiva en los caladores (ρ = +0,66). Con el volumen de Ricardone casi no se relaciona (ρ = +0,26).

| Comité | Playa 1 / calada | Qué pasó con los caladores |
|---|---:|---|
| 31/07 | **181**, máximo de la serie | Los tres caladores con correctivas en la misma semana: CA02 mangueras (20/07), CA01 rodillo del brazo (21/07), CA02 rodillo (22/07), CA03 motor hidráulico (24/07) |
| 23/07 | **171** | CA02 piñón (13/07) y CA01 manguera hidráulica (15/07) |
| 11/09 | **87**, mínimo | Un solo calador-día |

El 23/07 el comité escribió que la dispersión de 87–96 min era compatible con eventos de planta que no estaban en el dataset. Esos eventos estaban en el EAM.

## 2. En el puerto, el mantenimiento cambia qué volcable se usa, no cuánto se espera

La espera en Playa OSL no acompaña a los volcables caídos: ρ = −0,05 contra la simulación del mapa y −0,30 contra las plataformas apagadas en el Excel. Lo que sí acompaña es el pico diario de llegadas (ρ = +0,69).

La redundancia alcanza. Los volcables trabajan en pares (PV1+PV2 y PV3+PV4) y PV4 queda de reserva:

- La semana del comité del 28/08 tuvo PV2 fuera 3 días (cambio de caños y cortinas, rejilla pivote) y PV1 apagado 3 días.
- Aun así, R7 cerró en 296 min, uno de los mejores valores de la serie. PV4 absorbió 121 y 166 camiones por día.

Para bajar Playa OSL, la palanca es cómo llegan los camiones: cupos y distribución del ingreso en el día. El mantenimiento de las plataformas no la mueve.

## 3. El girasol de Ricardone es donde el mantenimiento explica los picos del comité

El girasol no tiene redundancia. Son dos volcables con un único camino de transporte (CSG-3 y los redlers cruceros) y la secadora. Cada suba de R5+R6 tiene detrás un volcable parado:

| Comité | R5+R6 | Qué pasó |
|---|---:|---|
| 23/07 | 351 (+44) | Cambio de cilindro de la rampa del volcable 2 (14/07 y 17/07). El volcable 2 descargó 0 a 8 camiones por día toda la semana; el volcable 1 absorbió todo a 540–586 min |
| 31/07 | 361, peor en 7 semanas | Cadena de mando de la noria N-08 (20/07). El volcable 2 en cero el 20 y el 21/07 |
| 04/09 | **430**, máximo de la serie | Volcable 1 sin descargar el 28/08 y del 31/08 al 01/09, sin una OT que lo explique. El 02/09 quedó programado el cambio completo de la noria N-08. Fue la semana de **menor** volumen de girasol (32 por día): el tiempo sube por falta de capacidad, no por cola |
| 18/09 | 382 (+63) | El 09/09 se desmonta la cadena del redler RSG-1 y hay OT urgente en la CSG-3: los dos volcables quedan a 1.100–1.358 min del 09/09 al 11/09. Desde el 12/09 el volcable 2 casi no descarga (noria N-08). El comité no atribuyó causa; la causa es que el girasol se descargó con un solo volcable |
| 14/08 | **241**, el mejor | Ninguna OT que pare la cadena del girasol |

Hay dos efectos que el promedio semanal no muestra:

- **Una falla al cierre de la ventana cae en el comité siguiente.** Cada comité analiza una semana ya cerrada: el del 11/09 miró del 03/09 al 09/09. La rotura del RSG-1 y la CSG-3 fue el 09/09, último día de esa ventana, y su efecto cayó en la ventana del comité del 18/09 (+63 min de girasol). El día de la presentación la falla ya había ocurrido, pero entre el corte y el comité no se miró el mantenimiento. Propuesta: una lámina con las OT fuertes desde el corte hasta el día del comité.
- **Un colapso corto se diluye en la semana.** La secadora CEDAR tuvo OT el 31/07 y los volcables llegaron a 903–1.324 min el 31/07 y el 01/08. El comité del 07/08 publicó que el girasol mejoraba (347, −14). La semana diluyó dos días de colapso.

## 4. Lo que el cruce le marca al mapa

- **Parada anual de Celda 4 (15/09):** el mapa dice que solo reduce capacidad, porque la noria EL2 puede desviar a los silos por la cinta CT2. Pero el 15 y el 16/09 son los peores días de Playa OSL de ese comité (217 y 179 min), y PV1 y PV2 quedan en cero el 16 y el 17/09. Probablemente ese desvío no estaba disponible. Hay que confirmarlo con operación del puerto.
- **Kepler 1 absorbe volumen cuando cae el volcable 1** (28/08 y del 31/08 al 01/09). Falta saber si se descargó girasol en Kepler.

## 5. Propuesta para el comité

- **Una lámina fija de estado de equipos de descarga:**
  - días fuera por plataforma;
  - días-calador con correctiva;
  - volcables de girasol disponibles.
- **Adelantar el girasol con el plan de mantenimiento.** Con la noria N-08 en cambio, el comité siguiente va a tener girasol con un solo volcable, y se puede avisar antes.
- **Leer el girasol por día, como ya se hace con R7.**

## Límites

- Son 11 semanas: una ρ de 0,5–0,7 es una señal, no una prueba.
- Las fechas de las OT son las programadas.
- Se incluyen OT que figuran como no realizadas, porque el 48 % del período está abierto en el EAM y el cierre no es confiable.
- Los vínculos del mapa son de confianza media o baja: el IFC no trae conexiones.
