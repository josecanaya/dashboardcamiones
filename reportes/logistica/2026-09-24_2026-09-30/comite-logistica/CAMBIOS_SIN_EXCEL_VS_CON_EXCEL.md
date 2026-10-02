# Comité de Logística 24–30/09 · qué cambió al cargar la planilla

Deck: https://claude.ai/artifact/SxeVbx2h3pxKuaAf6nfMRF (versión 2 = solo cámaras · versión 4 = con planilla de movimientos por contrato).

## Cómo se armó cada versión

| | Versión 2 · solo cámaras | Versión 4 · con planilla |
|---|---|---|
| Corridas | 21–27 y 28/09–04/10 sin movimientos | Las mismas, reprocesadas con los 7 días de movimientos (3.743 y 1.524 filas), reglas v17 |
| Operaciones (soja, transile, girasol) | Estimadas: operaciones del Excel de la semana anterior × variación de camiones leídos por cámaras | Contadas en la planilla (`excel_operations_with_truckflow`) |
| Tiempos de soja R7 | Valor publicado la semana anterior + variación medida por cámaras (método propio por patente) | Paquete del dashboard: puerta a puerta = salida − ingreso de la planilla; tramos = legs de cámara de los recorridos asociados a una operación R7 |
| Transile R29 | Tramos medidos por cámaras | Iguales (siguen saliendo de cámaras); solo cambia la cantidad |
| Girasol | Tramos: semana anterior + variación por cámaras | Tramos iguales (con la planilla quedan muy pocos recorridos de girasol con todos los tramos leídos); cambia la cantidad y se agrega la mediana de la planilla |
| Líquidos y pellet | No se podían publicar: en su lugar, «Transile R29» y «Calada líquida» | Vuelven las tarjetas del comité anterior |
| Calada, silos, calada SL | Cámaras | Iguales (no dependen del Excel) |
| Volcables puerto | Todas las lecturas de cámara, con el transile incluido | Solo soja R7, con la calle que declara la planilla (mismo criterio que el comité anterior, 1.401) |

Paquete oficial: `reportes/logistica/2026-09-24_2026-09-30/revision-001/` (`scripts/build-report-package-range.ts`, compone 21–27 y 28–04 como «Cargar rango (guardado)» del dashboard).

## Cifras, lámina por lámina

### 2 · Qué entró a la planta

| Métrica | Solo cámaras | Con planilla | Diferencia |
|---|---|---|---|
| Soja R7 · operaciones | 835 | **770** | −65 (−8 %) |
| Soja R7 · puerta a puerta | 253 min | **265 min** | +12 min |
| Transile R29 · operaciones | 437 (tarjeta propia) | **516** (franja de silos) | +79 (+18 %) |
| Girasol R5+R6 · operaciones | 257 | **208** (volcable 1: 118, volcable 2: 74; más 35 a silos Kepler, R4) | −49 |
| Girasol · tiempo en la tarjeta | 477 min de recorrido (suma de tramos) | **14 h en planta, mediana de la planilla** (861 min; la media, 843, supera el tope de 720 min y no se publica) | otra métrica |
| Líquidos | no publicado (iba «Calada líquida 562 recorridos») | **383 camiones · 328 min** (150 ingresos, 233 egresos) | vuelve la tarjeta |
| Pellet | no publicado | **348 egresos · 104 min** (306 transiles de pellet de girasol al puerto, 43 despachos) | vuelve la tarjeta |
| Volcables puerto | 1.227 recorridos (con transile) | **911 descargas R7 · V5 53 %** | otro universo |
| Silos | 436 recorridos | 436 recorridos · **516 transiles R29** | — |

Líquidos usa el mismo criterio que el comité anterior (aceites, borras, glicerina, lecitina, goma, ácidos grasos, metanol y metilato; sin envasados ni agua; Ricardone, Terminal y Renopack; día operativo del ingreso). Con ese criterio la semana anterior da 282 contra los 286 publicados.

### 3 · Camiones adentro (por día, J→M)

| | J | V | S | D | L | M | M |
|---|---|---|---|---|---|---|---|
| Solo cámaras | 33 | 40 | 26 | 32 | 49 | 16 | 23 |
| Con planilla | 23 | 34 | 18 | 22 | 38 | 17 | 31 |

Baja porque el puerto ahora cuenta solo las descargas R7 (sin transile). El lunes sigue siendo el día pico.

### 5 · Soja R7 · tiempos por tramo (min)

| Tramo | Solo cámaras | Con planilla |
|---|---|---|
| Ingreso | 4 | 5 |
| Playa 1 | 85 | **74** |
| Salida | 10 | 12 |
| Interplanta | 13 | 11 |
| Playa OSL | 67 | **113** |
| Descarga | 60 | 55 |
| Egreso | 18 | 20 |
| **Ricardone** | 99 | **91** |
| **San Lorenzo** | 145 | **188** |
| Puerta a puerta | 253 | **265** |
| Contra la semana anterior (303) | −50 | **−38** |

### 7 · Resumen soja

| KPI | Solo cámaras | Con planilla |
|---|---|---|
| Puerta a puerta | 253 · −50 | **265 · −38** (igual queda como el mejor tiempo desde junio; mínimo previo 276) |
| Espera Playa 1 | 85 · la más baja desde junio | **74 · la más baja desde junio** |
| San Lorenzo | 145 · −39 | **188 · +4** |
| Camiones R7 | 835 · −39 % | **770 · −44 %** |

### 8 y 9 · Día por día

| | J | V | S | D | L | M | M |
|---|---|---|---|---|---|---|---|
| Camiones R7 · cámaras | 141 | 134 | 109 | 76 | 175 | 102 | 98 |
| Camiones R7 · planilla | 109 | 131 | 92 | 107 | 135 | 96 | 100 |
| Puerta a puerta · cámaras | 194 | 263 | 257 | 289 | 337 | 168 | 222 |
| Puerta a puerta · planilla | 195 | 275 | 246 | 238 | 377 | 227 | 263 |
| Ricardone · cámaras | 122 | 98 | 101 | 127 | 93 | 64 | 68 |
| Ricardone · planilla | 93 | 76 | 76 | 124 | 69 | 83 | 93 |
| San Lorenzo · cámaras | 68 | 153 | 123 | 147 | 234 | 82 | 132 |
| San Lorenzo · planilla | 56 | 178 | 105 | 111 | 248 | 92 | 213 |

El lunes 28 sigue siendo el día más cargado y el más lento en las dos versiones. El día más rápido pasó del martes (cámaras) al jueves (planilla).

### 10 · Cuartos

| | Q1 22–04 | Q2 04–10 | Q3 10–16 | Q4 16–22 |
|---|---|---|---|---|
| Solo cámaras | 30 % | 24 % | 25 % | 21 % |
| Con planilla | **34 %** | **20 %** | **23 %** | **23 %** |

### 6 · Transile R29

Tramos sin cambios (ciclo 300 min, espera para cargar en silo 131). Operaciones 437 → 516; por día, de la planilla: 112 · 64 · 42 · 116 · 118 · 64 · 0.

### 13–14 · Girasol

Tramos sin cambios (477 min, suma de tramos medida por cámaras). Cambia el total de camiones (257 → 208) y se agrega la mediana de la planilla: la mitad de los camiones estuvo más de 14 h en planta. Las dos fuentes dicen lo mismo: el girasol esperó mucho más que la semana anterior.

### 17 · Volcables puerto

| | V5 | V3 | V4 | V2 | V1 | Total |
|---|---|---|---|---|---|---|
| Solo cámaras (todas las lecturas) | 395 (32 %) | 379 | 348 | 97 | 8 | 1.227 |
| Con planilla (descargas R7) | **481 (53 %)** | 193 | 191 | 45 | 1 | **911** |

El título vuelve a «La volcable 5 sostuvo la semana». El lunes, la cámara de V5 leyó 14 camiones y la planilla le asigna 51 descargas R7: el panel toma la calle que declara la planilla y la hora de la cámara. Ver el punto 3 de abajo.

### 16 y 18 · Calada y silos

Sin cambios: salen de las cámaras.

### 19 · Seis lecturas

| Lectura | Solo cámaras | Con planilla |
|---|---|---|
| 1 | 253 min, mejor tiempo («vale confirmarlo») | **265 min, mejor tiempo desde junio** |
| 2 | «San Lorenzo acompañó» (184 → 145) | **«Ricardone volvió a mejorar»: Playa 1 en 74, San Lorenzo en 188 no acompañó** |
| 3 | Calles 3 y 4 = 87 % | igual |
| 4 | Girasol 477 min | igual, con la mediana de 14 h de la planilla |
| 5 | Transile 437 | **516** |
| 6 | Lunes: V5 casi quieta | **Lunes: San Lorenzo en 248 min, ciclo de 377** |

## Lo que la versión de cámaras leyó mal

1. **San Lorenzo.** La estimación por cámaras dio 145 min y una «mejora del puerto»; con la planilla da 188 (+4). Cambia la conclusión: la mejora de la semana vino de Ricardone (Playa 1 en 74), como la semana anterior. El error está en Playa OSL (67 contra 113). El método por patente mide desde la primera lectura de ingreso al puerto hasta la primera de balanza, sobre casi 500 camiones. El paquete oficial mide sobre los 136 recorridos que la planilla asocia a una operación R7. Además, la semana anterior la cámara de ingreso del puerto estaba caída, así que la «variación» se calculó contra una base débil.
2. **Cantidades.** R7 quedó 8 % arriba, el transile 15 % abajo y girasol 24 % arriba. Escalar por camiones leídos sirve para el orden de magnitud, no para la cifra.
3. **Volcable 5 el lunes.** Con cámaras parecía casi quieta (14 lecturas). La planilla le asigna 51 descargas. Esa diferencia entre la calle declarada y la cámara es justamente la que mira el comité de seguridad («descargas en otra calle»): vale revisarla en ese informe.
4. **Lo que se sostuvo.** El lunes fue el día más cargado y el más lento. Playa 1 marcó el mínimo de la serie. El girasol esperó mucho más. Calada en las calles 3 y 4. El transile corrió casi toda la semana.

## Regenerar

```bash
npx tsx scripts/build-report-package-range.ts 2026-09-24 2026-09-30 2026-09-21_2026-09-27:2026-09-24:2026-09-27 2026-09-28_2026-10-04:2026-09-28:2026-09-30
python scripts/estado-planta/gen_comite_logistica.py reportes/logistica/2026-09-24_2026-09-30/comite-logistica
```

El generador usa la planilla si en la carpeta están `paquete_excel.json` (copia del `paquete.json` de la revisión) y `excel_extra.json` (líquidos, pellet, mediana de girasol, transile por día). Sin esos dos archivos vuelve a la versión de cámaras.

## Agregado después (v5): operativo de pellet

Sección nueva «02 Pellet» (6 láminas, mismo formato que el reporte del 18/09). Girasol pasa a ser la sección 03 y Sectores la 04. Necesita la planilla para saber qué patentes y qué viajes son pellet; los tramos salen de cámaras (`scripts/estado-planta/pellet-operativo.cjs` → `pellet-operativo.json`).

| Dato | Valor |
|---|---|
| Viajes (transile R30/31/32, planilla) | 307 · jue 41, vie 70, sáb 90, mié 106 |
| Toneladas (viajes × 30) | 9.210 t (8.369 t netas según la planilla) |
| Camiones (patentes distintas) | 62 · 32 a 43 por día |
| Duración | 48,5 h en 3 tandas: 24/09 18:05 → 25/09 11:34 · 26/09 06:11 → 20:53 · 30/09 07:35 → 23:53 |
| Viajes por camión y día | 1,3 · 1,8 · 2,6 · 2,5 (máximo 4) |
| Ciclo medido | 281 min · Ricardone 102 (suma de tramos) · San Lorenzo 181 |
| Tramos | Playa 1 21 · acceso P3 15 · carga 66 · interplanta 18 · Playa OSL 82 · descarga 81 · salida 18 · vuelta al puerto→Ricardone 22 |
| Volcable | V4 en 213 de 221 viajes leídos en el puerto |

En la lámina 2, la tarjeta de pellet pasa de «348 egresos · 104 min» (todo el pellet de la planilla, con puerta a puerta solo de Ricardone) a «307 viajes · 9.210 t» del operativo.

Las cámaras leyeron la calle líquida en el primer viaje del día de cada camión (106 de 151), pero también en los siguientes (103 de 133). No coincide con el recorrido descripto (calle líquida solo en el primer viaje): vale revisarlo con planta.

## Agregado (v6): histórico de pellet y cruce con mantenimiento

- **Histórico de pellet** (`scripts/estado-planta/pellet-historico.cjs` → `pellet-historico.json`): los 7 operativos desde junio, contados en la planilla (egresos de pellet de girasol de Ricardone con destino puerto). Viajes / camiones: 30/06–04/07 337 / 49 · 08–15/07 768 / 74 · 18–22/08 532 / 60 · 28/08–02/09 723 / 63 · 03–05/09 383 / 65 · 14–15/09 189 / 48 · 24–30/09 307 / 62. Viajes por camión y día, siempre entre 2,1 y 2,7. Los totales cuadran con lo publicado en cada comité (530, 723, 382, 188); el 28/08 se habían informado 57 patentes y la planilla da 60.
- **Lámina nueva «Lo que dice mantenimiento»** (antes del cierre), desde `cruce_mantenimiento.py` con las OT del EAM hasta el 29/09 (detalle en `cruce_mantenimiento_24-30.md`): volcable 1 Ricardone parada 28–29/09 (OT balanza 1 y válvula celda 5; el girasol pasó a V2 y a Kepler 2) · demora de la volcable 1 el 24/09 (OT aspiración PTV-1 y calador 1) · PV2 del puerto sin descargar el 28/09 (compresor Atlas, la PV4 compensó) · PV3 sin descargar el 30/09 (parada anual de la cinta C01 de la Terminal) · correctiva urgente del calador 3 el 25/09 sin efecto visible · parada anual de P10 y Terminal como contexto. La lectura 6 del cierre ahora nombra la PV2 y la volcable 1 del lunes.

## v7: mantenimiento dentro del relato

Se sacó la lámina «Lo que dice mantenimiento». Cada causa pasó a la lámina donde justifica una demora:
- **Camiones adentro (3), lunes:** San Lorenzo con la PV2 sin descargar.
- **Hallazgo (8):** el lunes, el más lento (248 min en San Lorenzo), con la PV2 parada por el preventivo de 8.000 h de su compresor y la PV4 cubriéndola.
- **Plantas (9):** el lunes de San Lorenzo, con la PV2 fuera de servicio.
- **Girasol (tramos e histórico):** la volcable 1 demorada el jueves 24 (970 min; OT en la aspiración de polvillo y el calador 1) y parada lunes y martes (OT en la balanza 1 y en la válvula de la celda 5). Sin redundancia, la descarga pasó a la volcable 2 y a Kepler 2.
- **Volcables puerto (17):** la PV2 el lunes y la PV3 el miércoles (parada anual de la cinta C01 de la Terminal).
- **Cierre:** las lecturas 4 (girasol) y 6 (lunes) nombran la causa.

Se dejaron afuera, porque no explican ninguna demora: la correctiva del calador 3 (Playa 1 marcó su mínimo) y la parada anual de P10 como contexto general.

## v8: anexo de pellet (2 láminas)

Fuente: `scripts/estado-planta/pellet-escenarios.cjs` → `pellet-escenarios.json`. Son 17 días de operativo entre el 18/08 y el 30/09 con al menos 50 viajes y 25 leídos por cámaras; junio y julio no tienen lecturas útiles. Del 27/08 al 02/09 se usó `event-list.raw.json`.

- **«Con la mitad de los camiones se mueve lo mismo».**
  - Ciclo según los camiones del día: hasta 45 camiones, 270 min (puerto 151); de 46 a 55, 351 (puerto 200); más de 55, 429 (puerto 214).
  - El puerto descarga igual entre 5,5 y 6,6 viajes por hora, haya los camiones que haya.
  - Hoy circulan unos 32 camiones a la vez (ley de Little: 6,3 viajes/h × 5,0 h de vuelta); el resto espera afuera.
  - Con 31 camiones contratados, cada uno pasa de 5,0 a 9,9 viajes en el operativo y de 2,1 a 4,2 por día. Con unos 20 en circulación la cola de Playa OSL desaparece.
- **«Dos volcables y menos camiones».**
  - Una volcable (V4, 9 días): 208 min de espera en el puerto y 5,8 viajes/h.
  - Dos volcables (V3 y V4, 8 días): 170 min y 6,1 viajes/h, o sea 38 min menos por viaje.
  - Tarifa: no tenemos la tarifa por viaje, así que el ahorro se muestra por cada $10.000 de baja: $3,1 M en este operativo y $32,4 M en los 3.239 viajes desde junio.
  - Con el doble de viajes por día, el camionero gana lo mismo cobrando hasta un 50 % menos por viaje.
