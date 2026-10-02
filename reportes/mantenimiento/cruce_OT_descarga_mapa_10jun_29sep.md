# Cruce mantenimiento × descarga (10/06–29/09)

Descargas: Excel de movimientos (INGRESO por plataforma, sin patentes ficticias). Dependencias: mapa de planta `mapa_planta_mantenimiento.json` (415 equipos con efecto sobre la descarga). OT: 240 sobre equipos que afectan la descarga, sin canceladas ni trabajos que no paran equipo. Una OT “toca” un día si su inicio programado está entre 2 días antes y ese día.

> La fecha de la OT es la programada (el EAM copia la real en el 92 % de los casos) y no hay horas de parada. Una coincidencia es una pista para validar con planta, no una causa probada.

## 1. ¿Qué cadenas mueven la descarga?

Para cada cadena y cada plataforma que afecta: días de planta operando con OT fuerte (correctiva, urgente, emergencia o parada anual) en esa cadena, contra los días sin ninguna OT en la cadena. “Apagada” = % de días con la plataforma casi sin descargar. “Tiempo” = mediana del tiempo del día dividido su mediana de 14 días (1,00 = normal).

| Cadena | Relación | Plataforma | Días con OT | Apagada con OT | Apagada sin OT | Tiempo con OT | Tiempo sin OT |
|---|---|---|---:|---:|---:|---:|---:|
| demora · aguas_arriba | aguas_arriba (mapa) | Celda 16 Ricardone | 39 | 0 % | 0 % | 0.89 | s/d |
| demora · servicio | servicio (mapa) | Celda 16 Ricardone | 8 | 0 % | 0 % | s/d | 0.98 |
| detiene · aguas_abajo | aguas_abajo (mapa) | Celda 16 Ricardone | 4 | 0 % | 0 % | s/d | 0.98 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | Celda 16 Ricardone | 7 | 0 % | 0 % | s/d | 0.98 |
| reduce_capacidad · servicio | servicio (mapa) | Celda 16 Ricardone | 5 | 0 % | 0 % | s/d | 0.98 |
| demora · aguas_arriba | aguas_arriba (mapa) | Kepler 1 | 39 | 13 % | 3 % | 0.97 | s/d |
| demora · servicio | servicio (mapa) | Kepler 1 | 8 | 38 % ⬆ | 5 % | s/d | 1.00 |
| detiene · directo | directo (mapa) | Kepler 1 | 3 | 100 % ⬆ | 4 % | s/d | 1.00 |
| reduce_capacidad · servicio | servicio (mapa) | Kepler 1 | 3 | 0 % | 9 % | 1.22 ⬆ | 1.00 |
| demora · aguas_arriba | aguas_arriba (mapa) | Kepler 2 | 39 | 0 % | 0 % | s/d | s/d |
| demora · servicio | servicio (mapa) | Kepler 2 | 8 | 0 % | 0 % | s/d | s/d |
| detiene · aguas_abajo | aguas_abajo (mapa) | Kepler 2 | 5 | 0 % | 0 % | s/d | s/d |
| reduce_capacidad · servicio | servicio (mapa) | Kepler 2 | 3 | 0 % | 0 % | s/d | s/d |
| demora · aguas_arriba | aguas_arriba (mapa) | Volcable 1 Ricardone | 39 | 0 % | 10 % | 1.19 ⬆ | 0.96 |
| demora · servicio | servicio (mapa) | Volcable 1 Ricardone | 8 | 0 % | 5 % | 1.50 ⬆ | 1.06 |
| detiene · aguas_abajo | aguas_abajo (mapa) | Volcable 1 Ricardone | 3 | 0 % | 4 % | 1.89 ⬆ | 1.05 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | Volcable 1 Ricardone | 15 | 0 % | 5 % | 1.50 ⬆ | 0.99 |
| reduce_capacidad · servicio | servicio (mapa) | Volcable 1 Ricardone | 3 | 0 % | 4 % | 1.18 ⬆ | 1.07 |
| demora · aguas_arriba | aguas_arriba (mapa) | Volcable 2 Ricardone | 39 | 0 % | 0 % | 1.29 ⬆ | 1.12 |
| demora · servicio | servicio (mapa) | Volcable 2 Ricardone | 8 | 0 % | 0 % | 1.72 ⬆ | 1.14 |
| detiene · aguas_abajo | aguas_abajo (mapa) | Volcable 2 Ricardone | 18 | 0 % | 0 % | 1.74 ⬆ | 1.01 |
| detiene · directo | directo (mapa) | Volcable 2 Ricardone | 8 | 0 % | 0 % | 1.33 ⬆ | 1.12 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | Volcable 2 Ricardone | 9 | 0 % | 0 % | 1.79 ⬆ | 1.12 |
| reduce_capacidad · servicio | servicio (mapa) | Volcable 2 Ricardone | 3 | 0 % | 0 % | 1.25 ⬆ | 1.14 |
| demora · aguas_arriba | aguas_arriba (mapa) | PV1 puerto | 52 | 10 % | 13 % | 1.23 | 1.18 |
| demora · compartido | compartido (mapa) | PV1 puerto | 9 | 22 % ⬆ | 11 % | 1.23 | 1.23 |
| demora · servicio | servicio (mapa) | PV1 puerto | 5 | 40 % ⬆ | 10 % | 0.93 | 1.20 |
| detiene · directo | directo (mapa) | PV1 puerto | 6 | 0 % | 12 % | s/d | 1.08 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | PV1 puerto | 54 | 9 % | 9 % | 1.18 | s/d |
| reduce_capacidad · servicio | servicio (mapa) | PV1 puerto | 21 | 19 % | 10 % | 1.09 | 1.17 |
| demora · aguas_arriba | aguas_arriba (mapa) | PV2 puerto | 52 | 8 % | 10 % | 1.00 | 0.93 |
| demora · compartido | compartido (mapa) | PV2 puerto | 9 | 33 % ⬆ | 5 % | 1.13 ⬆ | 0.94 |
| demora · servicio | servicio (mapa) | PV2 puerto | 5 | 60 % ⬆ | 5 % | s/d | 0.97 |
| detiene · directo | directo (mapa) | PV2 puerto | 6 | 33 % ⬆ | 7 % | 1.31 ⬆ | 0.93 |
| detiene · servicio | servicio (mapa) | PV2 puerto | 3 | 0 % | 9 % | 0.89 | 0.95 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | PV2 puerto | 54 | 6 % | 6 % | 1.03 ⬆ | 0.78 |
| reduce_capacidad · servicio | servicio (mapa) | PV2 puerto | 21 | 24 % ⬆ | 3 % | 0.71 | 0.96 |
| demora · aguas_arriba | aguas_arriba (mapa) | PV3 puerto | 52 | 12 % | 3 % | 1.03 | 0.97 |
| demora · compartido | compartido (mapa) | PV3 puerto | 9 | 0 % | 10 % | 1.23 ⬆ | 0.94 |
| demora · servicio | servicio (mapa) | PV3 puerto | 5 | 0 % | 9 % | 0.98 | 1.00 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | PV3 puerto | 51 | 8 % | 9 % | 1.05 ⬆ | 0.86 |
| reduce_capacidad · servicio | servicio (mapa) | PV3 puerto | 21 | 10 % | 8 % | 0.91 | 0.98 |
| demora · aguas_arriba | aguas_arriba (mapa) | PV4 puerto | 52 | 0 % | 0 % | 0.95 | s/d |
| demora · compartido | compartido (mapa) | PV4 puerto | 9 | 0 % | 0 % | 0.95 | s/d |
| demora · servicio | servicio (mapa) | PV4 puerto | 5 | 0 % | 0 % | 0.95 | s/d |
| detiene · directo | directo (mapa) | PV4 puerto | 5 | 0 % | 0 % | s/d | 0.95 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | PV4 puerto | 51 | 0 % | 0 % | 0.95 | s/d |
| reduce_capacidad · servicio | servicio (mapa) | PV4 puerto | 21 | 0 % | 0 % | 0.88 | s/d |
| demora · aguas_arriba | aguas_arriba (mapa) | PV5 puerto (secadora) | 52 | 0 % | 0 % | 0.95 | 0.86 |
| demora · servicio | servicio (mapa) | PV5 puerto (secadora) | 5 | 0 % | 0 % | 0.94 | 0.93 |
| detiene · aguas_abajo | aguas_abajo (mapa) | PV5 puerto (secadora) | 9 | 0 % | 0 % | 1.01 ⬆ | 0.86 |
| detiene · directo | directo (mapa) | PV5 puerto (secadora) | 3 | 0 % | 0 % | 1.76 ⬆ | 0.90 |
| detiene · servicio | servicio (mapa) | PV5 puerto (secadora) | 10 | 0 % | 0 % | 1.04 ⬆ | 0.89 |
| reduce_capacidad · aguas_abajo | aguas_abajo (mapa) | PV5 puerto (secadora) | 40 | 0 % | 0 % | 0.98 ⬆ | 0.85 |
| reduce_capacidad · directo | directo (mapa) | PV5 puerto (secadora) | 3 | 0 % | 0 % | 1.13 ⬆ | 0.89 |
| reduce_capacidad · servicio | servicio (mapa) | PV5 puerto (secadora) | 23 | 0 % | 0 % | 0.95 | 0.89 |

⬆ = con OT la plataforma se apaga al menos 10 puntos más seguido, o su tiempo sube al menos un 10 % más que sin OT. Se omiten los cruces con menos de 3 días con OT o menos de 15 días sin OT.

## 2. Episodios y OT más específicas

Orden de las OT: primero las de la propia plataforma, después las de su cadena exclusiva (secadora, celda, noria), al final las compartidas (calada, playa, recepción). Se muestran hasta 4.

### Celda 16 Ricardone — DEMORA 11/06

Datos: 11/06 355 vs 210 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/06 | reduce_capacidad · servicio | PRELIMPIADOR NEUMATICO 01 C-16 <E> | REPARAR PLATO DEBIDO A QUE SE MUEVE Y GOLPEA LOS COSTADOS | plan Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 11/06–13/06

Datos: 11/06 3 de 4 plataformas; 12/06 4 de 4 plataformas; 13/06 4 de 4 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 11/06 | reduce_capacidad · aguas_abajo ⬆ | CINTA SOBRE SILO 5 | CAMBIO DE BABETAS Y CONTROL DE RASCADORES | Correctivo  | REALIZADA |
| 11/06 | reduce_capacidad · aguas_abajo ⬆ | CINTA 7 DE CARGA A CELDA 4 | CAMBIO TAMBOR PRESION EN MANDO | Correctivo  | REALIZADA |
| 11/06 | reduce_capacidad · aguas_abajo ⬆ | CINTA SOBRE SILO 5 | REORDENAMIENTO Y CONTROL DE FUNCIONAMIENTO PULSADOR PARADA DE EMERGENCIA | Correctivo Normal | REALIZADA |
| 11/06 | demora · aguas_arriba | SECTOR PLAYA DE CAMIONES | Se solicita reparar barrera de ingreso a playa. la misma quedo fuera de servicio. | Correctivo Emergencia | REALIZADA |

### PV1 puerto — APAGADA 15/06–16/06

Datos: 15/06 0 vs 70; 16/06 0 vs 56

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 16/06 | reduce_capacidad · aguas_abajo | CINTA DE TRANSFERENCIA CT2 | CT2 RED: RUIDO EN EJE DE ENTRADA. CONTROLAR NIVEL DE ACEITE. | Planificado Emergencia | REALIZADA |
| 16/06 | reduce_capacidad · aguas_abajo | ELEVADOR EL1 | ELEVADOR 1 OESTE: REALIZAR TENSIÓN Y ALINEACIÓN DE CORREAS, COMO ASÍ TAMBIÉN ESTADO DE LA  | Planificado Emergencia | NO REALIZADA |
| 16/06 | reduce_capacidad · aguas_abajo | CINTA SOBRE SILO 7 | REPARACION ROSCA SENSOR CERO VELOCIDAD/ | Correctivo Normal | REALIZADA |
| 16/06 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 1 -L/OESTE | CA01: SE SOLICITA CAMBIO DE LANZA CALADOR 1 | plan Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 19/06

Datos: 19/06 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 19/06 | reduce_capacidad · aguas_abajo ⬆ | CINTA TRANSP. BAJO VOLCABLE CELDA 16 | REVISAR MANDO DE CINTA INFERIOR DE VOLCABLES / SE CAMBIA ACOPLAMIENTO AG20 | plan Emergencia | REALIZADA |
| 17/06 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 1 -L/OESTE | REVISAR TURBINA SUPERIOR (4TA) DEL CALADOR Nº1 (QUEMA LA CORREA) | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 03/07

Datos: 03/07 4 de 5 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 01/07 | detiene · servicio ⬆ | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE NRO 5 | CAMBIO MOTOR BOMBA RECIRCULADORA PV5 | Planificado Normal | REALIZADA |
| 02/07 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV1 | CAMBIO REJILLA PIVOT POR DESGASTE | Correctivo Normal | REALIZADA |
| 01/07 | reduce_capacidad · servicio ⬆ | FILTRO DE MANGAS TORRE DE MANIPULEO | CAMBIO DE MANGAS POR  ROTURAS | Correctivo  | REALIZADA |
| 03/07 | detiene · servicio ⬆ | CCM TORRE DE MANIPULEO | LIMPIEZA DE RACK DE SERVIDORES | plan  | REALIZADA |

### PV2 puerto — DEMORA 04/07

Datos: 04/07 718 vs 340 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/07 | detiene · servicio | CCM TORRE DE MANIPULEO | LIMPIEZA DE RACK DE SERVIDORES | plan  | REALIZADA |

### PV5 puerto (secadora) — DEMORA 04/07

Datos: 04/07 782 vs 446 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/07 | detiene · servicio ⬆ | CCM TORRE DE MANIPULEO | LIMPIEZA DE RACK DE SERVIDORES | plan  | REALIZADA |
| 03/07 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV5 A SECADORA | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | REALIZADA |

### PV4 puerto — DEMORA 10/07–11/07

Datos: 10/07 254 vs 80 min; 11/07 468 vs 198 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 08/07 | detiene · servicio | CCM TORRE DE MANIPULEO | LIMPIEZA DE UPS APC Symmetra | plan  | REALIZADA |
| 10/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIAR CILINDRO ELEVADOR | Correctivo Normal | REALIZADA |
| 10/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | REALIZAR CABLEADO Y CONEXION ASPIRACION CATRE Nº2. | Correctivo Normal | REALIZADA |

### PV3 puerto — APAGADA 12/07

Datos: 12/07 18 vs 96

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIAR CILINDRO ELEVADOR | Correctivo Normal | REALIZADA |
| 10/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | REALIZAR CABLEADO Y CONEXION ASPIRACION CATRE Nº2. | Correctivo Normal | REALIZADA |

### Volcable 1 Ricardone — DEMORA 13/07–14/07

Datos: 13/07 540 vs 341 min; 14/07 586 vs 351 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 13/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR PIÑON | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 14/07

Datos: 14/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 13/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR PIÑON | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 17/07–18/07

Datos: 17/07 2 de 3 plataformas; 18/07 3 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/07 | reduce_capacidad · servicio ⬆ | BASCULANTE SALIDA SECADORA | REALIZAR CAMBIO RESORTES REGISTRO DE CIERRE BASCULANTES | Correctivo Normal | NO REALIZADA |
| 15/07 | reduce_capacidad · servicio ⬆ | FILTRO DE MANGAS AUTONOMO PV5 | CONTROL FUNCIONAMIENTO ELECTROVALVULAS (SE VERICA QUE NO REALIZA AUTO LIMPIEZA DE MANGAS C | Correctivo Normal | REALIZADA |
| 15/07 | reduce_capacidad · servicio ⬆ | VENTILADOR PRINCIPAL FILTRO MANGA TDM | REALIZAR LIMPIEZA DEL ROTOR DEL VENTILADOR POR COMPONENTES DE DESBALANCEO, MEDIR NUEVAMENT | Planificado Normal | REALIZADA |
| 15/07 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIAR MANGUERA HIDRAULICA APERTURA-CIERRE CALADOR Nª1 | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 23/07–24/07

Datos: 23/07 2 de 3 plataformas; 24/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 3 -L/ESTE | CAMBIAR MOTOR HIDRAULICO | Correctivo Normal | REALIZADA |
| 21/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMABIAR RODILLO DEL BRAZO TELESCOPICO CALADOR UNO | Correctivo Normal | REALIZADA |
| 22/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR RODILLO BRAZO TELESCOPICO CALADOR DOS | Correctivo Normal | REALIZADA |

### Volcable 1 Ricardone — DEMORA 27/07–28/07

Datos: 27/07 700 vs 456 min; 28/07 702 vs 468 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 27/07 | reduce_capacidad · aguas_abajo ⬆ | REDLER RCR 1  CRUCERO L/ESTE | PERARAR GUIAS Y PALETAS DOBLADAS.  ASIGNADOS: LANATTI, ENCINA. | Correctivo Normal | REALIZADA |

### PV1 puerto — DEMORA 30/07

Datos: 30/07 614 vs 369 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 30/07 | reduce_capacidad · aguas_abajo | CELDA 4 | REPARAR PERDIDA DE CAÑERIA DE RED DE INCENDIO DEL LADO SUR DE CELDA 4. | Correctivo Emergencia | REALIZADA |
| 30/07 | reduce_capacidad · aguas_abajo | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | REPARAR CAÑERIA EN TRANSPORTE. | Correctivo Normal | REALIZADA |
| 28/07 | demora · aguas_arriba | SECTOR BALANZA PUERTO | Se necesita volver a montar la barrera lindera a las balanzas de salida, la misma tiene la | Correctivo Emergencia | REALIZADA |
| 30/07 | reduce_capacidad · aguas_abajo | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | LIMPIEZA DE FILTRO EN TRANSPORTE. | Preventivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 31/07

Datos: 31/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV2 | REPARAR MALLA DE ASPIRACION LADO OESTE (SECTOR TOLBA) | Correctivo Normal | NO REALIZADA |
| 30/07 | reduce_capacidad · aguas_abajo ⬆ | CELDA 4 | REPARAR PERDIDA DE CAÑERIA DE RED DE INCENDIO DEL LADO SUR DE CELDA 4. | Correctivo Emergencia | REALIZADA |
| 30/07 | reduce_capacidad · aguas_abajo ⬆ | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | REPARAR CAÑERIA EN TRANSPORTE. | Correctivo Normal | REALIZADA |
| 30/07 | reduce_capacidad · aguas_abajo ⬆ | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | LIMPIEZA DE FILTRO EN TRANSPORTE. | Preventivo Normal | REALIZADA |

### Volcable 1 Ricardone — DEMORA 31/07–01/08

Datos: 31/07 903 vs 480 min; 01/08 1220 vs 493 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | reduce_capacidad · aguas_abajo ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | REVISAR ENCENDIDO DE QUEMADORES Y PARADA DE EMERGENCIA | Correctivo Normal | REALIZADA |
| 29/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### Volcable 2 Ricardone — DEMORA 31/07–01/08

Datos: 31/07 1324 vs 521 min; 01/08 1221 vs 585 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | detiene · aguas_abajo ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | REVISAR ENCENDIDO DE QUEMADORES Y PARADA DE EMERGENCIA | Correctivo Normal | REALIZADA |
| 29/07 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 05/08

Datos: 05/08 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/08 | detiene · aguas_abajo ⬆ | CINTA TRANSP. CSG-3 | CAMBIO DE RODAMIENTOS.  ASIGNADO: LANATTI Y ENCINA | Correctivo Normal | REALIZADA |
| 04/08 | detiene · aguas_abajo ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | CAMBIO DE RODAMIENTO, CAJA Y OBTURADORES. REALIZADO POR MECANICO DE TURNO | Correctivo Normal | REALIZADA |
| 04/08 | detiene · aguas_abajo ⬆ | CINTA TRANSP. CSG-3 | CAMBIO DE ACOPLAMIENTO | Correctivo Normal | REALIZADA |
| 03/08 | detiene · directo ⬆ | RAMPA VOLC. CAMIONES Nº 2 | CAMBIAR MANGUERA PINCHADA | Correctivo Normal | REALIZADA |

### Kepler 1 — APAGADA 12/08–13/08

Datos: 12/08 0 vs 46; 13/08 0 vs 35

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 11/08 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR VALVULA DOSIFICADORA | Correctivo Normal | REALIZADA |

### PV1 puerto — DEMORA 12/08

Datos: 12/08 417 vs 261 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 12/08 | reduce_capacidad · aguas_abajo | VENTILADOR FILTRO MANGA DE CELDA 4 | REPARAR SISTEMA DE SENSORES EN VALVULAS DE DESCARGA Y ELECTROVÁLVULAS DE FMC4 | Planificado Emergencia | NO REALIZADA |
| 12/08 | reduce_capacidad · aguas_abajo | ELEVADOR EL2 | PARADA CAMBIO DEL TAMBOR POR MALAS CONDICIONES | Planificado En Espera de Parada | NO REALIZADA |
| 11/08 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR VALVULA DOSIFICADORA | Correctivo Normal | REALIZADA |

### PV5 puerto (secadora) — DEMORA 12/08–14/08

Datos: 12/08 654 vs 372 min; 14/08 927 vs 396 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/08 | detiene · aguas_abajo ⬆ | REDLER 31 (PV5 A EL7) | REVISAR GUIAS (ESPESOR) | Correctivo Normal | REALIZADA |
| 12/08 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV5 A SECADORA | CAMBIO CORTINA DUST MASTER (CAÑOS DOBLADOS Y LONA ROTA POR INCIDENTE CON TRANSPORTE TIPO T | Correctivo Urgente | REALIZADA |
| 12/08 | reduce_capacidad · servicio | DEPURADOR 2 INFERIOR (VENTILADOR) | REEMPLAZO DE CORREAS | Correctivo Normal | REALIZADA |
| 12/08 | reduce_capacidad · aguas_abajo ⬆ | REDLER 33 (DE EL7 A SECADORA) | REPARAR CAÑO DE RETORNO (SECTOR ELEV 7) REMONTAR | Preventivo Normal | REALIZADA |

### Volcable 2 Ricardone — DEMORA 19/08

Datos: 19/08 562 vs 362 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 18/08 | demora · aguas_arriba ⬆ | LOGICO CALADORES | REALIZAR CABLEADO TRIFASICO PARA PRENSA HIDRAULICA | Mejora Normal | REALIZADA |

### PV1 puerto — COMPENSA 21/08

Datos: 21/08 162 vs 11 (cubre PV3 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 20/08 | reduce_capacidad · aguas_abajo | CINTA RECEPCION CR2 | CAMBIAR RODILLO DE ALINEACION | Correctivo Normal | NO REALIZADA |
| 21/08 | demora · aguas_arriba | SECTOR BALANZA PUERTO | CAMBIO DE TERMICA BIPOLAR BALANZA DE SALIDA, ALIMENTACION SWITCH DE CAMARAS Y DATOS EN BAL | Correctivo Normal | REALIZADA |

### PV3 puerto — APAGADA 21/08

Datos: 21/08 0 vs 95

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 21/08 | demora · aguas_arriba | SECTOR BALANZA PUERTO | CAMBIO DE TERMICA BIPOLAR BALANZA DE SALIDA, ALIMENTACION SWITCH DE CAMARAS Y DATOS EN BAL | Correctivo Normal | REALIZADA |

### PV1 puerto — APAGADA 23/08–25/08

Datos: 23/08 2 vs 28; 24/08 0 vs 28; 25/08 0 vs 28

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/08 | reduce_capacidad · servicio | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 24/08 | reduce_capacidad · aguas_abajo | CINTA C01 | CAMBIO DE TAMBOR | Preventivo En Espera de Parada | NO REALIZADA |
| 21/08 | demora · aguas_arriba | SECTOR BALANZA PUERTO | CAMBIO DE TERMICA BIPOLAR BALANZA DE SALIDA, ALIMENTACION SWITCH DE CAMARAS Y DATOS EN BAL | Correctivo Normal | REALIZADA |
| 25/08 | demora · aguas_arriba | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |

### PV4 puerto — COMPENSA 23/08–26/08

Datos: 23/08 40 vs 0 (cubre PV1 puerto); 24/08 121 vs 0 (cubre PV1 puerto, PV2 puerto); 25/08 166 vs 0 (cubre PV1 puerto, PV2 puerto); 26/08 60 vs 0 (cubre PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 21/08 | detiene · directo | PLATAFORMA VOLCABLE PV4 | REPARACION DE SOPORTE DE CALZA. LADO ESTE | Correctivo Normal | REALIZADA |
| 24/08 | reduce_capacidad · servicio | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE CELDA 3 | PP107320 FABRICACION Y MONTAJE DE CERRAMIENTO EN ENCAUSADOR CONTINUO | Correctivo Normal | NO REALIZADA |

### PV2 puerto — APAGADA 24/08–26/08

Datos: 24/08 20 vs 112; 25/08 1 vs 112; 26/08 1 vs 80

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 25/08 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV2 | CAMBIO DE CAÑOS, CORTINAS Y TIRAS DE IZAJE PV2 | Correctivo  | REALIZADA |
| 26/08 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | Diferido Normal | REALIZADA |
| 24/08 | reduce_capacidad · servicio ⬆ | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo ⬆ | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 25/08–27/08

Datos: 25/08 2 de 2 plataformas; 26/08 2 de 3 plataformas; 27/08 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 25/08 | demora · aguas_arriba ⬆ | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |

### PV1 puerto — COMPENSA 26/08

Datos: 26/08 131 vs 15 (cubre PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/08 | reduce_capacidad · servicio | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE CELDA 3 | PP107320 FABRICACION Y MONTAJE DE CERRAMIENTO EN ENCAUSADOR CONTINUO | Correctivo Normal | NO REALIZADA |
| 24/08 | reduce_capacidad · aguas_abajo | CINTA C01 | CAMBIO DE TAMBOR | Preventivo En Espera de Parada | NO REALIZADA |

### PV4 puerto — DEMORA 27/08

Datos: 27/08 444 vs 242 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA SOBRE CELDA 3 | PP107320 FABRICACION Y MONTAJE DE CERRAMIENTO EN ENCAUSADOR CONTINUO | Correctivo Normal | NO REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA DE CARGA A SILO DIARIO (PRELIMPIEZA) | REVISION GENERTAL DE CINTAS (ROLOS CÓNICOS Y RODAMIENTOS) | Control Normal | REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo | CINTA 8 SOBRE CELDA 4 | TENSAR BANDA Y/O ALINEAR | Preventivo Normal | NO REALIZADA |

### PUERTO — DEMORA DE PLANTA 28/08–29/08

Datos: 28/08 4 de 4 plataformas; 29/08 4 de 4 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/08 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | Diferido Normal | REALIZADA |
| 26/08 | reduce_capacidad · servicio ⬆ | QUEMADORES DE SECADORA | LIMPIEZA MECHEROS QUEMADORES 1-2-3-4-5-6 | Correctivo Normal | REALIZADA |
| 26/08 | reduce_capacidad · aguas_abajo ⬆ | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |
| 26/08 | reduce_capacidad · directo ⬆ | VALVULA PV5 B DESCARGA DESDE PV5 A REDLER 31 | REPARACION INTEGRAL (CREMALLERA, RUEDAS, ESTADO DE CUCHILLA) | Correctivo Normal | NO REALIZADA |

### Volcable 1 Ricardone — APAGADA 31/08–01/09

Datos: 31/08 0 vs 24; 01/09 0 vs 24

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | detiene · servicio | CENTRAL HIDRAULICA <RVC-1> | Inspección mecánica Volcable 01 | Predictivo Normal | REALIZADA |

### Volcable 2 Ricardone — DEMORA 01/09

Datos: 01/09 717 vs 454 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | detiene · aguas_abajo ⬆ | NORIA N-08  PTV Nº 2 | Inspección mecánica Volcable 02 | Predictivo Normal | REALIZADA |

### PV3 puerto — DEMORA 01/09

Datos: 01/09 458 vs 298 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | reduce_capacidad · aguas_abajo ⬆ | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 31/08 | reduce_capacidad · aguas_abajo ⬆ | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | EN EL DÍA DE HOY SE REEMPLAZO MOTOR QUEMADO DE SOPLANTE V_TN1 EN FMCELDA 4 SE SOLICITA MOD | Correctivo Normal | REALIZADA |
| 31/08 | reduce_capacidad · aguas_abajo ⬆ | CINTA RECEPCION CR0 | CONTROLAR ESTADO DEL REDUCTOR VALORES DE VIBRACION EN AUMENTO, POSIBLE FALLA EN FRECUENCIA | Mitigación Normal | NO REALIZADA |
| 31/08 | reduce_capacidad · servicio | FILTRO DE MANGAS DESCARGA DE CAMIONES | CAMBIO DE ROTOR VENTILADOR BOOSTER PV5 | Correctivo Normal | NO REALIZADA |

### RICARDONE — DEMORA DE PLANTA 02/09

Datos: 02/09 3 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 02/09 | detiene · aguas_abajo ⬆ | NORIA N-08  PTV Nº 2 | CAMBIO COMPLETO DE NORIA. ASIGNADO A TORK | Mejora Normal | NO REALIZADA |
| 02/09 | reduce_capacidad · servicio ⬆ | LOGICO PLATAFORMAS VOLCABLES | CAMBIO Y REPARACION DE CORTINAS DE TIRAS Y ENRROLLABLES SEGUN P/P 107729 ASIG A CARNEVALLI | Planificado Urgente | NO REALIZADA |
| 31/08 | detiene · servicio | CENTRAL HIDRAULICA <RVC-1> | Inspección mecánica Volcable 01 | Predictivo Normal | REALIZADA |
| 31/08 | detiene · aguas_abajo ⬆ | NORIA N-08  PTV Nº 2 | Inspección mecánica Volcable 02 | Predictivo Normal | REALIZADA |

### PV1 puerto — COMPENSA 02/09

Datos: 02/09 136 vs 52 (cubre PV3 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | reduce_capacidad · aguas_abajo | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 31/08 | reduce_capacidad · aguas_abajo | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | EN EL DÍA DE HOY SE REEMPLAZO MOTOR QUEMADO DE SOPLANTE V_TN1 EN FMCELDA 4 SE SOLICITA MOD | Correctivo Normal | REALIZADA |
| 02/09 | reduce_capacidad · aguas_abajo | CINTA C01 | PA C01 TRABAJOS EN PARADA ANUAL 09.2026 | Planificado  | NO REALIZADA |
| 02/09 | reduce_capacidad · aguas_abajo | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |

### PV3 puerto — APAGADA 02/09–04/09

Datos: 02/09 15 vs 128; 03/09 0 vs 128; 04/09 0 vs 128

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | reduce_capacidad · aguas_abajo ⬆ | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 31/08 | reduce_capacidad · aguas_abajo ⬆ | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | EN EL DÍA DE HOY SE REEMPLAZO MOTOR QUEMADO DE SOPLANTE V_TN1 EN FMCELDA 4 SE SOLICITA MOD | Correctivo Normal | REALIZADA |
| 02/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA C01 | PA C01 TRABAJOS EN PARADA ANUAL 09.2026 | Planificado  | NO REALIZADA |
| 02/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |

### Kepler 1 — APAGADA 05/09–09/09

Datos: 05/09 0 vs 25; 07/09 0 vs 25; 08/09 0 vs 25; 09/09 0 vs 25

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 07/09 | detiene · directo ⬆ | RAMPA VOLC. CAMIONES Nº 7  SKW   <N> | CALZAR PISTON EN SU BASE | Correctivo Normal | REALIZADA |
| 07/09 | demora · aguas_arriba | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |
| 09/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 3 -L/ESTE | CAMBIAR VALVULA ROTATIVA | Correctivo Normal | REALIZADA |
| 07/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | SE SOLICITA VER PERDIDA DE ACEITE CILINDRO ELEVADOR - Y PAQUETE DE VÁLVULAS PALANCA DE IZQ | Control Normal | REALIZADA |

### PV1 puerto — APAGADA 07/09

Datos: 07/09 0 vs 57

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 07/09 | reduce_capacidad · aguas_abajo | CELDA 4 | REALIZAR EL MONTAJE DE CARRETEL Y MANGUERA DEVANADERA DE RED DE INCENDIO EN PASARELA DE IN | Correctivo Normal | REALIZADA |
| 05/09 | detiene · directo | PLATAFORMA VOLCABLE PV1 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | NO REALIZADA |
| 07/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | SE SOLICITA VER PERDIDA DE ACEITE CILINDRO ELEVADOR - Y PAQUETE DE VÁLVULAS PALANCA DE IZQ | Control Normal | REALIZADA |

### PV2 puerto — COMPENSA 07/09

Datos: 07/09 145 vs 62 (cubre PV1 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 07/09 | reduce_capacidad · aguas_abajo ⬆ | CELDA 4 | REALIZAR EL MONTAJE DE CARRETEL Y MANGUERA DEVANADERA DE RED DE INCENDIO EN PASARELA DE IN | Correctivo Normal | REALIZADA |
| 05/09 | detiene · directo ⬆ | PLATAFORMA VOLCABLE PV2 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | NO REALIZADA |
| 07/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | SE SOLICITA VER PERDIDA DE ACEITE CILINDRO ELEVADOR - Y PAQUETE DE VÁLVULAS PALANCA DE IZQ | Control Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 09/09–11/09

Datos: 09/09 2 de 3 plataformas; 10/09 3 de 3 plataformas; 11/09 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 09/09 | detiene · aguas_abajo ⬆ | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Correctivo Normal | REALIZADA |
| 09/09 | detiene · aguas_abajo ⬆ | CINTA TRANSP. CSG-3 | CAMBIAR ACOPLE GUMMI Y ALINEAR | Correctivo Urgente | REALIZADA |
| 07/09 | detiene · directo ⬆ | RAMPA VOLC. CAMIONES Nº 7  SKW   <N> | CALZAR PISTON EN SU BASE | Correctivo Normal | REALIZADA |
| 09/09 | reduce_capacidad · aguas_abajo ⬆ | REDLER RCR 2  CRUCERO L/OESTE | SACAR CAIDA DEL REDLER AL SILO 5 PARA LIMPIEZA | Correctivo Normal | REALIZADA |

### Volcable 1 Ricardone — COMPENSA 09/09

Datos: 09/09 69 vs 24 (cubre Kepler 1)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 09/09 | detiene · aguas_abajo ⬆ | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Correctivo Normal | REALIZADA |
| 09/09 | reduce_capacidad · aguas_abajo ⬆ | REDLER RCR 2  CRUCERO L/OESTE | SACAR CAIDA DEL REDLER AL SILO 5 PARA LIMPIEZA | Correctivo Normal | REALIZADA |
| 07/09 | demora · aguas_arriba ⬆ | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |
| 09/09 | demora · aguas_arriba ⬆ | CALADOR AUTOMATICO Nº 3 -L/ESTE | CAMBIAR VALVULA ROTATIVA | Correctivo Normal | REALIZADA |

### PV1 puerto — APAGADA 12/09

Datos: 12/09 3 vs 68

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/09 | reduce_capacidad · aguas_abajo | CELDA 4 | REPARACION ANTENA REPETIDORA DE COMUNICACION | Correctivo Emergencia | REALIZADA |

### PV2 puerto — DEMORA 12/09

Datos: 12/09 446 vs 287 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/09 | reduce_capacidad · aguas_abajo ⬆ | CELDA 4 | REPARACION ANTENA REPETIDORA DE COMUNICACION | Correctivo Emergencia | REALIZADA |

### PV3 puerto — APAGADA 14/09

Datos: 14/09 0 vs 97

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 14/09 | reduce_capacidad · aguas_abajo ⬆ | VALVULA ROTATIVA FILTRO MANGA DE CELDA 4 (INF | CAMBIO DE VALVULA ROTATIVA | Correctivo Normal | NO REALIZADA |
| 14/09 | reduce_capacidad · aguas_abajo ⬆ | VENTILADOR FILTRO MANGA DE CELDA 4 | CAMBIO DE CORREAS | Diferido Normal | NO REALIZADA |

### PV1 puerto — APAGADA 16/09–17/09

Datos: 16/09 0 vs 80; 17/09 0 vs 47

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CARRO CINTA 8 SOBRE CELDA 4 | PA C4 TRABAJOS EN PARADA DE PLANTA | Planificado  | NO REALIZADA |

### PV2 puerto — APAGADA 16/09–17/09

Datos: 16/09 0 vs 118; 17/09 0 vs 106

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CARRO CINTA 8 SOBRE CELDA 4 | PA C4 TRABAJOS EN PARADA DE PLANTA | Planificado  | NO REALIZADA |

### PV3 puerto — COMPENSA 16/09

Datos: 16/09 131 vs 41 (cubre PV1 puerto, PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo ⬆ | CARRO CINTA 8 SOBRE CELDA 4 | PA C4 TRABAJOS EN PARADA DE PLANTA | Planificado  | NO REALIZADA |

### PV4 puerto — COMPENSA 16/09–17/09

Datos: 16/09 122 vs 0 (cubre PV1 puerto, PV2 puerto); 17/09 119 vs 0 (cubre PV1 puerto, PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |
| 15/09 | reduce_capacidad · aguas_abajo | CARRO CINTA 8 SOBRE CELDA 4 | PA C4 TRABAJOS EN PARADA DE PLANTA | Planificado  | NO REALIZADA |

### PV1 puerto — DEMORA 18/09

Datos: 18/09 526 vs 319 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 18/09 | detiene · servicio | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE NRO 1 | FILTRADO DE ACEITE EN CENTRAL HIDRAULICA, DE ACUERDO A INFORME DE ANALISIS DE ACEITE 07/09 | Mitigación En Espera de Parada | NO REALIZADA |
| 18/09 | reduce_capacidad · aguas_abajo | CINTA RECEPCION CR2 | Montaje de bandeja en retentor de metales | Correctivo Normal | NO REALIZADA |
| 18/09 | reduce_capacidad · aguas_abajo | CINTA RECEPCION CR1 | Montaje de bandeja en retentor de metales | Correctivo Normal | NO REALIZADA |
| 16/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | Se solicita cambiar turbina 3 (media)del calador 2. también mangueras neumáticas internas  | Correctivo Normal | NO REALIZADA |

### PV3 puerto — APAGADA 21/09

Datos: 21/09 0 vs 97

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 21/09 | reduce_capacidad · servicio | ROSCA FILTRO MANGA TDM | REPARACION COMPLETA DE ROSCA | Correctivo Normal | NO REALIZADA |
| 21/09 | reduce_capacidad · servicio | SOPLANTE DEL FILTRO MANGA TORRE DE MANIPULEO | CAMBIO DE FILTRO BOMBA SOPLANTE TDM | Correctivo  | NO REALIZADA |
| 21/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 2 - CENTRAL | ARREGLAR LA BASE DONDE SOSTIENE EL PISTON ELEVADOR DEL CALADOR Nº 2 HABRIA QUE SOLDAR POR  | Correctivo Normal | NO REALIZADA |

## 3. Episodios sin OT en su cadena

Candidatos a causa operativa (sin producto para esa plataforma, asignación de volcables) o a una parada que no se cargó en el EAM.

- PV1 puerto — APAGADA 10/06: 10/06 0 vs 25
- PV2 puerto — APAGADA 15/06: 15/06 18 vs 108
- Celda 16 Ricardone — DEMORA 01/07: 01/07 441 vs 179 min
- RICARDONE — DEMORA DE PLANTA 02/07–03/07: 02/07 2 de 3 plataformas; 03/07 3 de 3 plataformas
- PV2 puerto — APAGADA 17/08: 17/08 17 vs 134
- Kepler 1 — COMPENSA 28/08: 28/08 46 vs 0 (cubre Volcable 1 Ricardone)
- Volcable 1 Ricardone — APAGADA 28/08: 28/08 3 vs 24
- Kepler 1 — COMPENSA 31/08–01/09: 31/08 51 vs 0 (cubre Volcable 1 Ricardone); 01/09 56 vs 0 (cubre Volcable 1 Ricardone)
