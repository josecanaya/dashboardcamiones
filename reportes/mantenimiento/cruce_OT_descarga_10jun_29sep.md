# Cruce mantenimiento × descarga (10/06–29/09)

Descargas: Excel de movimientos (INGRESO por plataforma, sin patentes ficticias). OT: 400 de Ricardone y Terminal Embarque que caen en alguna cadena del grafo, sin canceladas ni trabajos que no paran equipo. Una OT “toca” un día si su inicio programado está entre 2 días antes y ese día.

> La fecha de la OT es la programada (el EAM copia la real en el 92 % de los casos) y no hay horas de parada. Una coincidencia es una pista para validar con planta, no una causa probada.

## 1. ¿Qué cadenas mueven la descarga?

Para cada cadena y cada plataforma que afecta: días de planta operando con OT fuerte (correctiva, urgente, emergencia o parada anual) en esa cadena, contra los días sin ninguna OT en la cadena. “Apagada” = % de días con la plataforma casi sin descargar. “Tiempo” = mediana del tiempo del día dividido su mediana de 14 días (1,00 = normal).

| Cadena | Relación | Plataforma | Días con OT | Apagada con OT | Apagada sin OT | Tiempo con OT | Tiempo sin OT |
|---|---|---|---:|---:|---:|---:|---:|
| pv1 | directo (hipotesis) | PV1 puerto | 10 | 0 % | 13 % | 1.65 ⬆ | 1.07 |
| pv2 | directo (observado) | PV2 puerto | 9 | 22 % ⬆ | 7 % | 1.08 ⬆ | 0.94 |
| pv4 | directo (hipotesis) | PV4 puerto | 5 | 0 % | 0 % | s/d | 0.95 |
| pv5_secadora_puerto | aguas_abajo (hipotesis) | PV5 puerto (secadora) | 27 | 0 % | 0 % | 0.98 ⬆ | 0.84 |
| recepcion_puerto | aguas_abajo (hipotesis) | PV1 puerto | 42 | 14 % | 11 % | 1.00 | 1.16 |
| recepcion_puerto | aguas_abajo (hipotesis) | PV2 puerto | 42 | 12 % | 5 % | 1.02 ⬆ | 0.89 |
| recepcion_puerto | aguas_abajo (hipotesis) | PV3 puerto | 42 | 12 % | 5 % | 1.04 ⬆ | 0.90 |
| recepcion_puerto | aguas_abajo (hipotesis) | PV4 puerto | 42 | 0 % | 0 % | 0.91 | s/d |
| comun_puerto | compartido (hipotesis) | PV1 puerto | 26 | 8 % | 13 % | 1.46 ⬆ | 1.16 |
| comun_puerto | compartido (hipotesis) | PV2 puerto | 26 | 8 % | 8 % | 1.03 ⬆ | 0.89 |
| comun_puerto | compartido (hipotesis) | PV3 puerto | 26 | 4 % | 10 % | 1.03 | 0.97 |
| comun_puerto | compartido (hipotesis) | PV4 puerto | 26 | 0 % | 0 % | 1.12 | s/d |
| comun_puerto | compartido (hipotesis) | PV5 puerto (secadora) | 26 | 0 % | 0 % | 1.03 ⬆ | 0.85 |
| calada_ricardone | aguas_arriba (hipotesis) | Volcable 1 Ricardone | 41 | 0 % | 11 % | 1.24 ⬆ | 0.88 |
| calada_ricardone | aguas_arriba (hipotesis) | Volcable 2 Ricardone | 41 | 0 % | 0 % | 1.33 ⬆ | 1.09 |
| calada_ricardone | aguas_arriba (hipotesis) | Celda 16 Ricardone | 41 | 0 % | 0 % | 0.94 | s/d |
| calada_ricardone | aguas_arriba (hipotesis) | Kepler 1 | 41 | 12 % | 4 % | 0.97 | s/d |
| calada_ricardone | aguas_arriba (hipotesis) | Kepler 2 | 41 | 0 % | 0 % | s/d | s/d |
| calada_ricardone | aguas_arriba (hipotesis) | PV1 puerto | 50 | 8 % | 15 % | 1.25 | 1.16 |
| calada_ricardone | aguas_arriba (hipotesis) | PV2 puerto | 50 | 8 % | 9 % | 1.02 ⬆ | 0.87 |
| calada_ricardone | aguas_arriba (hipotesis) | PV3 puerto | 50 | 10 % | 6 % | 1.07 ⬆ | 0.87 |
| calada_ricardone | aguas_arriba (hipotesis) | PV4 puerto | 50 | 0 % | 0 % | 1.03 | s/d |
| calada_ricardone | aguas_arriba (hipotesis) | PV5 puerto (secadora) | 50 | 0 % | 0 % | 0.95 | 0.85 |
| rv2 | directo (hipotesis) | Volcable 2 Ricardone | 11 | 0 % | 0 % | 1.33 ⬆ | 1.13 |
| secadora_girasol_ricardone | aguas_abajo (observado) | Volcable 1 Ricardone | 25 | 0 % | 7 % | 1.18 ⬆ | 1.07 |
| secadora_girasol_ricardone | aguas_abajo (observado) | Volcable 2 Ricardone | 25 | 0 % | 0 % | 1.62 ⬆ | 1.12 |
| celda16 | aguas_abajo (hipotesis) | Celda 16 Ricardone | 14 | 0 % | 0 % | s/d | 0.94 |
| kepler | aguas_abajo (hipotesis) | Kepler 1 | 20 | 15 % | 6 % | 0.99 | 1.03 |
| kepler | aguas_abajo (hipotesis) | Kepler 2 | 20 | 0 % | 0 % | s/d | s/d |
| comun_ricardone | compartido (hipotesis) | Volcable 1 Ricardone | 10 | 0 % | 2 % | 0.82 | 1.16 |
| comun_ricardone | compartido (hipotesis) | Volcable 2 Ricardone | 10 | 0 % | 0 % | 0.89 | 1.32 |
| comun_ricardone | compartido (hipotesis) | Celda 16 Ricardone | 10 | 0 % | 0 % | s/d | 0.98 |
| comun_ricardone | compartido (hipotesis) | Kepler 1 | 10 | 30 % ⬆ | 6 % | s/d | 0.97 |
| comun_ricardone | compartido (hipotesis) | Kepler 2 | 10 | 0 % | 0 % | s/d | s/d |

⬆ = con OT la plataforma se apaga al menos 10 puntos más seguido, o su tiempo sube al menos un 10 % más que sin OT. Se omiten los cruces con menos de 3 días con OT o menos de 15 días sin OT.

## 2. Episodios y OT más específicas

Orden de las OT: primero las de la propia plataforma, después las de su cadena exclusiva (secadora, celda, noria), al final las compartidas (calada, playa, recepción). Se muestran hasta 4.

### PV1 puerto — APAGADA 10/06

Datos: 10/06 0 vs 25

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/06 | almacenaje_puerto | CINTA 13 BAJO CELDA 4 | SOPORTAR CAÑERIA ACOMETIDA 0V CINTA 13, BAJO CELDA 4. | Planificado Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 11/06–13/06

Datos: 11/06 3 de 4 plataformas; 12/06 4 de 4 plataformas; 13/06 4 de 4 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 11/06 | comun_puerto ⬆ | SECTOR PLAYA DE CAMIONES | Se solicita reparar barrera de ingreso a playa. la misma quedo fuera de servicio. | Correctivo Emergencia | REALIZADA |
| 11/06 | almacenaje_puerto | CELDA 1 | CAMBIO DE TUBOS BAJO CELDA 1 Y 2. | Correctivo Normal | REALIZADA |
| 11/06 | almacenaje_puerto | CINTA SOBRE SILO 5 | CAMBIO DE BABETAS Y CONTROL DE RASCADORES | Correctivo  | REALIZADA |
| 11/06 | almacenaje_puerto | CINTA 7 DE CARGA A CELDA 4 | CAMBIO TAMBOR PRESION EN MANDO | Correctivo  | REALIZADA |

### PV1 puerto — APAGADA 15/06–16/06

Datos: 15/06 0 vs 70; 16/06 0 vs 56

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 16/06 | recepcion_puerto | CINTA DE TRANSFERENCIA CT2 | CT2 RED: RUIDO EN EJE DE ENTRADA. CONTROLAR NIVEL DE ACEITE. | Planificado Emergencia | REALIZADA |
| 16/06 | recepcion_puerto | ELEVADOR EL1 | ELEVADOR 1 OESTE: REALIZAR TENSIÓN Y ALINEACIÓN DE CORREAS, COMO ASÍ TAMBIÉN ESTADO DE LA  | Planificado Emergencia | NO REALIZADA |
| 16/06 | almacenaje_puerto | CINTA 11 DE CARGA A NORIA EL6 | LIMPIEZA DE MOTOR C11. (CELDA 4) | Correctivo Normal | REALIZADA |
| 16/06 | almacenaje_puerto | CINTA 13 BAJO CELDA 4 | LIMPIEZA MOTOR CINTA 13. (CELDA 4) | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 19/06

Datos: 19/06 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 19/06 | celda16 | CINTA TRANSP. BAJO VOLCABLE CELDA 16 | REVISAR MANDO DE CINTA INFERIOR DE VOLCABLES / SE CAMBIA ACOPLAMIENTO AG20 | plan Emergencia | REALIZADA |
| 18/06 | kepler | SECADORA DE GRANOS KEPLER WEBER | CAMBIO DE RUEDAS DE BRAZOS DE DEPURADORES DE SECADORA | Correctivo Normal | REALIZADA |
| 17/06 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 1 -L/OESTE | REVISAR TURBINA SUPERIOR (4TA) DEL CALADOR Nº1 (QUEMA LA CORREA) | Correctivo Normal | REALIZADA |

### Celda 16 Ricardone — DEMORA 01/07

Datos: 01/07 441 vs 179 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 29/06 | comun_ricardone | PALA MECANICA CATERPILLAR 924K Nº2 (CAT0924KV | SERVICE COMPLETO. REALIZADO POR SAVV | Preventivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 02/07–03/07

Datos: 02/07 2 de 3 plataformas; 03/07 3 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/07 | kepler | LOGICO SILOS KEPLER WEBER | IMPERMIABILIZACION DE SILOS KEPLER. DEL 1 AL 10. REALIZADO POR DEMU. | Correctivo Normal | NO REALIZADA |
| 02/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR EQUIPOS DE TUBOS FLUORESCENTES POR NUEVOS CATRE 2 | Correctivo Normal | REALIZADA |
| 02/07 | comun_ricardone ⬆ | PALA MECANICA 924K Nº1 KW400304 | CONTROL PALA MECANICA | plan Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 03/07

Datos: 03/07 4 de 5 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 02/07 | pv1 ⬆ | PLATAFORMA VOLCABLE PV1 | CAMBIO REJILLA PIVOT POR DESGASTE | Correctivo Normal | REALIZADA |
| 03/07 | pv4 | PLATAFORMA VOLCABLE PV4 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | REALIZADA |
| 01/07 | pv5_secadora_puerto ⬆ | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE NRO 5 | CAMBIO MOTOR BOMBA RECIRCULADORA PV5 | Planificado Normal | REALIZADA |
| 03/07 | pv5_secadora_puerto ⬆ | PLATAFORMA VOLCABLE PV5 A SECADORA | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | REALIZADA |

### PV2 puerto — DEMORA 04/07

Datos: 04/07 718 vs 340 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/07 | almacenaje_puerto | NORIA EL9 | CERAMIZAR CAIDA DE CINTA 13 A ELEV.9. | Correctivo Emergencia | REALIZADA |
| 02/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR EQUIPOS DE TUBOS FLUORESCENTES POR NUEVOS CATRE 2 | Correctivo Normal | REALIZADA |
| 02/07 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | CAMBIO DE BOMBA ASPERSORA CELDA 4. | Planificado Normal | REALIZADA |
| 02/07 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | CAMBIO BBA DE RECIRCULACION DE PRODUCTO ASPERSOR CELDA 3. | Planificado Normal | REALIZADA |

### PV5 puerto (secadora) — DEMORA 04/07

Datos: 04/07 782 vs 446 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/07 | pv5_secadora_puerto ⬆ | PLATAFORMA VOLCABLE PV5 A SECADORA | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | REALIZADA |
| 02/07 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR EQUIPOS DE TUBOS FLUORESCENTES POR NUEVOS CATRE 2 | Correctivo Normal | REALIZADA |

### PV4 puerto — DEMORA 10/07–11/07

Datos: 10/07 254 vs 80 min; 11/07 468 vs 198 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 08/07 | almacenaje_puerto | CARRO CINTA SOBRE CELDA 4 | REPARACION GUIA CABLE CSC4-9 Y REPARACION DE CARRITOS | Planificado Emergencia | REALIZADA |
| 10/07 | calada_ricardone | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIAR CILINDRO ELEVADOR | Correctivo Normal | REALIZADA |
| 10/07 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | REALIZAR CABLEADO Y CONEXION ASPIRACION CATRE Nº2. | Correctivo Normal | REALIZADA |
| 08/07 | almacenaje_puerto | AIREADOR SILO 7 (A57) | CAMBIO DE MOTOR VENTILADOR A57. (RODAMIENTOS) | Planificado Normal | REALIZADA |

### PV3 puerto — APAGADA 12/07

Datos: 12/07 18 vs 96

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIAR CILINDRO ELEVADOR | Correctivo Normal | REALIZADA |
| 10/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | REALIZAR CABLEADO Y CONEXION ASPIRACION CATRE Nº2. | Correctivo Normal | REALIZADA |
| 10/07 | almacenaje_puerto | AIREADOR SILO 5 (A35) | CAMBIO DE MOTOR VENTILADOR A35. | Planificado Normal | REALIZADA |
| 10/07 | almacenaje_puerto | CELDA 2 | REVISAR/REPARAR ALARMA BAJADA DE PALAS CELDA 2 LADO NORTE. | Planificado Normal | REALIZADA |

### Volcable 1 Ricardone — DEMORA 13/07–14/07

Datos: 13/07 540 vs 341 min; 14/07 586 vs 351 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 13/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR PIÑON | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 14/07

Datos: 14/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 13/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR PIÑON | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 17/07–18/07

Datos: 17/07 2 de 3 plataformas; 18/07 3 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 16/07 | pv1 ⬆ | PLATAFORMA VOLCABLE PV1 | DE PREV.Nº90608:CAMBIO DE LED DE CORTINA,NO FUNCIONA. | Correctivo Normal | REALIZADA |
| 15/07 | pv5_secadora_puerto ⬆ | BASCULANTE SALIDA SECADORA | REALIZAR CAMBIO RESORTES REGISTRO DE CIERRE BASCULANTES | Correctivo Normal | NO REALIZADA |
| 15/07 | pv5_secadora_puerto ⬆ | FILTRO DE MANGAS AUTONOMO PV5 | CONTROL FUNCIONAMIENTO ELECTROVALVULAS (SE VERICA QUE NO REALIZA AUTO LIMPIEZA DE MANGAS C | Correctivo Normal | REALIZADA |
| 15/07 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | CONTROL Y FUNCIONAMIENTO TRACING (SECTOR CONO TANQUE PRODUCTO NO TIENE TEMPERATURA) | Correctivo Emergencia | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 23/07–24/07

Datos: 23/07 2 de 3 plataformas; 24/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 23/07 | secadora_girasol_ricardone ⬆ | NORIA TSG-2 | FABRICAR PLATAFORMA PARA ACCEDER DE MANERA SEGURA A LA CAIDA DE LA NORIA AL REDLER TSG 3 | Correctivo En espera de Parada Anual | NO REALIZADA |
| 23/07 | secadora_girasol_ricardone ⬆ | NORIA TS-2 (O) | REPARAR BASE REDUCTOR Y MOTOR | Correctivo En espera de Parada Anual | NO REALIZADA |
| 23/07 | secadora_girasol_ricardone ⬆ | REDLER TS-4 | EXTENDER CAIDA DE REDLER TS 4 A REDLER TS 16 (ACTUALMENTE LA CAIDA LLEGA AL REDLER SOBRE Q | Correctivo En espera de Parada Anual | NO REALIZADA |
| 23/07 | secadora_girasol_ricardone ⬆ | REDLER TS-5 | CAMBIO COMPLETO DE TRANSMICION | Correctivo En espera de Parada Anual | NO REALIZADA |

### Volcable 1 Ricardone — DEMORA 27/07–28/07

Datos: 27/07 700 vs 456 min; 28/07 702 vs 468 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 27/07 | secadora_girasol_ricardone ⬆ | REDLER RCR 1  CRUCERO L/ESTE | PERARAR GUIAS Y PALETAS DOBLADAS.  ASIGNADOS: LANATTI, ENCINA. | Correctivo Normal | REALIZADA |
| 27/07 | secadora_girasol_ricardone ⬆ | NORIA TSG-2 | BAJAR CAPOTA PARA LIMPIAR | Correctivo En Espera de Parada | REALIZADA |

### PV1 puerto — DEMORA 30/07

Datos: 30/07 614 vs 369 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 28/07 | comun_puerto ⬆ | SECTOR BALANZA PUERTO | Se necesita volver a montar la barrera lindera a las balanzas de salida, la misma tiene la | Correctivo Emergencia | REALIZADA |
| 30/07 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | CAMBIO DE MOTOR BBA RECIRCULACION DE PRODUCTO CELDA 3. (RODAMIENTOS) | Planificado Emergencia | REALIZADA |
| 30/07 | almacenaje_puerto | CELDA 4 | REPARAR PERDIDA DE CAÑERIA DE RED DE INCENDIO DEL LADO SUR DE CELDA 4. | Correctivo Emergencia | REALIZADA |
| 29/07 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 31/07

Datos: 31/07 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | pv2 ⬆ | PLATAFORMA VOLCABLE PV2 | REPARAR MALLA DE ASPIRACION LADO OESTE (SECTOR TOLBA) | Correctivo Normal | NO REALIZADA |
| 30/07 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | CAMBIO DE MOTOR BBA RECIRCULACION DE PRODUCTO CELDA 3. (RODAMIENTOS) | Planificado Emergencia | REALIZADA |
| 30/07 | almacenaje_puerto | CELDA 4 | REPARAR PERDIDA DE CAÑERIA DE RED DE INCENDIO DEL LADO SUR DE CELDA 4. | Correctivo Emergencia | REALIZADA |
| 29/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### Volcable 1 Ricardone — DEMORA 31/07–01/08

Datos: 31/07 903 vs 480 min; 01/08 1220 vs 493 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | secadora_girasol_ricardone ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | REVISAR ENCENDIDO DE QUEMADORES Y PARADA DE EMERGENCIA | Correctivo Normal | REALIZADA |
| 29/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### Volcable 2 Ricardone — DEMORA 31/07–01/08

Datos: 31/07 1324 vs 521 min; 01/08 1221 vs 585 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/07 | secadora_girasol_ricardone ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | REVISAR ENCENDIDO DE QUEMADORES Y PARADA DE EMERGENCIA | Correctivo Normal | REALIZADA |
| 29/07 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | COLOCAR PERNO DE LA LANZA | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 05/08

Datos: 05/08 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 03/08 | rv2 ⬆ | RAMPA VOLC. CAMIONES Nº 2 | CAMBIAR MANGUERA PINCHADA | Correctivo Normal | REALIZADA |
| 03/08 | secadora_girasol_ricardone ⬆ | CINTA TRANSP. CSG-3 | CAMBIO DE RODAMIENTOS.  ASIGNADO: LANATTI Y ENCINA | Correctivo Normal | REALIZADA |
| 04/08 | secadora_girasol_ricardone ⬆ | SECADORA DE GRANOS CEDAR M- ADF 250 | CAMBIO DE RODAMIENTO, CAJA Y OBTURADORES. REALIZADO POR MECANICO DE TURNO | Correctivo Normal | REALIZADA |
| 04/08 | secadora_girasol_ricardone ⬆ | CINTA TRANSP. CSG-3 | CAMBIO DE ACOPLAMIENTO | Correctivo Normal | REALIZADA |

### Kepler 1 — APAGADA 12/08–13/08

Datos: 12/08 0 vs 46; 13/08 0 vs 35

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 11/08 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR VALVULA DOSIFICADORA | Correctivo Normal | REALIZADA |

### PV1 puerto — DEMORA 12/08

Datos: 12/08 417 vs 261 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 12/08 | almacenaje_puerto | VENTILADOR FILTRO MANGA DE CELDA 4 | REPARAR SISTEMA DE SENSORES EN VALVULAS DE DESCARGA Y ELECTROVÁLVULAS DE FMC4 | Planificado Emergencia | NO REALIZADA |
| 11/08 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | REALIZAR MEJORA EN EL SISTEMA DE ASPERSION CONTROLANDO PRESION Y CAUDAL DE AGUA | Correctivo Normal | NO REALIZADA |
| 11/08 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | CAMBIAR VALVULA DOSIFICADORA | Correctivo Normal | REALIZADA |
| 12/08 | almacenaje_puerto | ASPERSOR DE LIQUIDO P/REDUCC DE POLUCION - CE | COLOCAR PRESOSTATO EN SALIDA BBA ALTA PRESION ASPERSOR CELDA 4. | Correctivo Urgente | REALIZADA |

### PV5 puerto (secadora) — DEMORA 12/08–14/08

Datos: 12/08 654 vs 372 min; 14/08 927 vs 396 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/08 | pv5_secadora_puerto ⬆ | REDLER 31 (PV5 A EL7) | REVISAR GUIAS (ESPESOR) | Correctivo Normal | REALIZADA |
| 12/08 | pv5_secadora_puerto ⬆ | DEPURADOR 2 INFERIOR (VENTILADOR) | REEMPLAZO DE CORREAS | Correctivo Normal | REALIZADA |
| 12/08 | pv5_secadora_puerto ⬆ | PLATAFORMA VOLCABLE PV5 A SECADORA | CAMBIO CORTINA DUST MASTER (CAÑOS DOBLADOS Y LONA ROTA POR INCIDENTE CON TRANSPORTE TIPO T | Correctivo Urgente | REALIZADA |
| 12/08 | pv5_secadora_puerto ⬆ | REDLER 33 (DE EL7 A SECADORA) | REPARAR CAÑO DE RETORNO (SECTOR ELEV 7) REMONTAR | Preventivo Normal | REALIZADA |

### Volcable 2 Ricardone — DEMORA 19/08

Datos: 19/08 562 vs 362 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 18/08 | calada_ricardone ⬆ | LOGICO CALADORES | REALIZAR CABLEADO TRIFASICO PARA PRENSA HIDRAULICA | Mejora Normal | REALIZADA |

### PV1 puerto — COMPENSA 21/08

Datos: 21/08 162 vs 11 (cubre PV3 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 19/08 | comun_puerto ⬆ | CARGADOR FRONTAL BOB-CAT S630 | SE REALIZA REPARACION POR ROTURA CARGADOR FRONTAL 630 PLAYA | Correctivo  | REALIZADA |
| 20/08 | almacenaje_puerto | ALMACENAJE (CELDAS) | SC 107854 - REEMPLAZO DE ANCLAJES DEL SISTEMA ANTICAÍDA CELDA 1 Y 2 TERM EMB | Mitigación Urgente | NO REALIZADA |
| 20/08 | almacenaje_puerto | CINTA BAJO CELDA 1 | CAMBIO DE MOTOR CBAC1. INFORMADO POR SKF.(RODAMIENTOS) | Correctivo Urgente | REALIZADA |
| 20/08 | almacenaje_puerto | CINTA BAJO CELDA 3 | CAMBIO UÑA RASCADOR SECTOR CABEZAL | Correctivo Normal | REALIZADA |

### PV3 puerto — APAGADA 21/08

Datos: 21/08 0 vs 95

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 19/08 | comun_puerto | CARGADOR FRONTAL BOB-CAT S630 | SE REALIZA REPARACION POR ROTURA CARGADOR FRONTAL 630 PLAYA | Correctivo  | REALIZADA |
| 20/08 | almacenaje_puerto | ALMACENAJE (CELDAS) | SC 107854 - REEMPLAZO DE ANCLAJES DEL SISTEMA ANTICAÍDA CELDA 1 Y 2 TERM EMB | Mitigación Urgente | NO REALIZADA |
| 20/08 | almacenaje_puerto | CINTA BAJO CELDA 1 | CAMBIO DE MOTOR CBAC1. INFORMADO POR SKF.(RODAMIENTOS) | Correctivo Urgente | REALIZADA |
| 20/08 | almacenaje_puerto | CINTA BAJO CELDA 3 | CAMBIO UÑA RASCADOR SECTOR CABEZAL | Correctivo Normal | REALIZADA |

### PV1 puerto — APAGADA 23/08–25/08

Datos: 23/08 2 vs 28; 24/08 0 vs 28; 25/08 0 vs 28

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/08 | recepcion_puerto | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 21/08 | comun_puerto ⬆ | SECTOR BALANZA PUERTO | CAMBIO DE TERMICA BIPOLAR BALANZA DE SALIDA, ALIMENTACION SWITCH DE CAMARAS Y DATOS EN BAL | Correctivo Normal | REALIZADA |
| 25/08 | calada_ricardone | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |
| 25/08 | comun_puerto ⬆ | CARGADOR FRONTAL BOB-CAT S630 | SE SOLICITA REALIZAR EL SERVICIO COMPLETO DE MATENIMIENTO (CAMBIO DE ACEITE, FILTROS).  HO | Correctivo Normal | REALIZADA |

### PV4 puerto — COMPENSA 23/08–26/08

Datos: 23/08 40 vs 0 (cubre PV1 puerto); 24/08 121 vs 0 (cubre PV1 puerto, PV2 puerto); 25/08 166 vs 0 (cubre PV1 puerto, PV2 puerto); 26/08 60 vs 0 (cubre PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 21/08 | pv4 | PLATAFORMA VOLCABLE PV4 | REPARACION DE SOPORTE DE CALZA. LADO ESTE | Correctivo Normal | REALIZADA |
| 24/08 | recepcion_puerto | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 21/08 | comun_puerto | SECTOR BALANZA PUERTO | CAMBIO DE TERMICA BIPOLAR BALANZA DE SALIDA, ALIMENTACION SWITCH DE CAMARAS Y DATOS EN BAL | Correctivo Normal | REALIZADA |
| 25/08 | calada_ricardone | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |

### PV2 puerto — APAGADA 24/08–26/08

Datos: 24/08 20 vs 112; 25/08 1 vs 112; 26/08 1 vs 80

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 25/08 | pv2 ⬆ | PLATAFORMA VOLCABLE PV2 | CAMBIO DE CAÑOS, CORTINAS Y TIRAS DE IZAJE PV2 | Correctivo  | REALIZADA |
| 26/08 | pv2 ⬆ | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | Diferido Normal | REALIZADA |
| 24/08 | recepcion_puerto ⬆ | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 25/08 | calada_ricardone ⬆ | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 25/08–27/08

Datos: 25/08 2 de 2 plataformas; 26/08 2 de 3 plataformas; 27/08 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/08 | kepler | SECADORA DE GRANOS KEPLER WEBER | REPARACION TEJIDOS PANELES 1-2-5 | Correctivo Normal | REALIZADA |
| 25/08 | calada_ricardone ⬆ | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |

### PV1 puerto — COMPENSA 26/08

Datos: 26/08 131 vs 15 (cubre PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/08 | recepcion_puerto | CCM PISO 0 | IMPERMEABILIZAR EL TECHO DEL CCM PISO 0 DE TORRE DE MANIPULEO. | Correctivo Emergencia | NO REALIZADA |
| 25/08 | calada_ricardone | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |
| 25/08 | comun_puerto ⬆ | CARGADOR FRONTAL BOB-CAT S630 | SE SOLICITA REALIZAR EL SERVICIO COMPLETO DE MATENIMIENTO (CAMBIO DE ACEITE, FILTROS).  HO | Correctivo Normal | REALIZADA |
| 26/08 | almacenaje_puerto | VENTILADOR 5 AIREACION CUMBRERA DE CELDA Nº 3 | LIMPIEZA Y CONTROL DE TURBINA | Correctivo Normal | NO REALIZADA |

### PV4 puerto — DEMORA 27/08

Datos: 27/08 444 vs 242 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 25/08 | calada_ricardone | LOGICO CALADORES | LA SELECTORA QUE REALIZA EL CAMBIO DE TOLVA NO FUNCIONA | Correctivo Normal | REALIZADA |
| 25/08 | comun_puerto | CARGADOR FRONTAL BOB-CAT S630 | SE SOLICITA REALIZAR EL SERVICIO COMPLETO DE MATENIMIENTO (CAMBIO DE ACEITE, FILTROS).  HO | Correctivo Normal | REALIZADA |
| 26/08 | almacenaje_puerto | VENTILADOR 5 AIREACION CUMBRERA DE CELDA Nº 3 | LIMPIEZA Y CONTROL DE TURBINA | Correctivo Normal | NO REALIZADA |
| 26/08 | almacenaje_puerto | CINTA SOBRE SILO 4 INFERIOR | REALIZAR SOLDADURA EN BASE DE MOTOR Y OBTURADOR EN ROLO DE REENVIO | Correctivo Normal | REALIZADA |

### Kepler 1 — COMPENSA 28/08

Datos: 28/08 46 vs 0 (cubre Volcable 1 Ricardone)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/08 | kepler | SECADORA DE GRANOS KEPLER WEBER | REPARACION TEJIDOS PANELES 1-2-5 | Correctivo Normal | REALIZADA |

### PUERTO — DEMORA DE PLANTA 28/08–29/08

Datos: 28/08 4 de 4 plataformas; 29/08 4 de 4 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/08 | pv2 ⬆ | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | Diferido Normal | REALIZADA |
| 26/08 | pv5_secadora_puerto ⬆ | QUEMADORES DE SECADORA | LIMPIEZA MECHEROS QUEMADORES 1-2-3-4-5-6 | Correctivo Normal | REALIZADA |
| 26/08 | pv5_secadora_puerto ⬆ | VALVULA PV5 B DESCARGA DESDE PV5 A REDLER 31 | REPARACION INTEGRAL (CREMALLERA, RUEDAS, ESTADO DE CUCHILLA) | Correctivo Normal | NO REALIZADA |
| 26/08 | pv5_secadora_puerto ⬆ | SECADORA DE GRANOS KEPLER WEBER | REPARACION TEJIDOS PANELES 1-2-5 | Correctivo Normal | REALIZADA |

### Kepler 1 — COMPENSA 31/08–01/09

Datos: 31/08 51 vs 0 (cubre Volcable 1 Ricardone); 01/09 56 vs 0 (cubre Volcable 1 Ricardone)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | comun_ricardone ⬆ | LOGICO SILOS CELDA | Inspección Mecánica Silos 1 al 9 | Predictivo Normal | REALIZADA |
| 01/09 | comun_ricardone ⬆ | PALA MECANICA 924K Nº1 KW400304 | CONTROL PALA MECANICA | plan Normal | NO REALIZADA |

### Volcable 1 Ricardone — APAGADA 31/08–01/09

Datos: 31/08 0 vs 24; 01/09 0 vs 24

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | rv1 | CENTRAL HIDRAULICA <RVC-1> | Inspección mecánica Volcable 01 | Predictivo Normal | REALIZADA |
| 31/08 | comun_ricardone | LOGICO SILOS CELDA | Inspección Mecánica Silos 1 al 9 | Predictivo Normal | REALIZADA |
| 01/09 | comun_ricardone | PALA MECANICA 924K Nº1 KW400304 | CONTROL PALA MECANICA | plan Normal | NO REALIZADA |

### Volcable 2 Ricardone — DEMORA 01/09

Datos: 01/09 717 vs 454 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | rv2 ⬆ | NORIA N-08  PTV Nº 2 | Inspección mecánica Volcable 02 | Predictivo Normal | REALIZADA |
| 31/08 | comun_ricardone | LOGICO SILOS CELDA | Inspección Mecánica Silos 1 al 9 | Predictivo Normal | REALIZADA |
| 01/09 | comun_ricardone | PALA MECANICA 924K Nº1 KW400304 | CONTROL PALA MECANICA | plan Normal | NO REALIZADA |

### PV3 puerto — DEMORA 01/09

Datos: 01/09 458 vs 298 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | almacenaje_puerto | ALMACENAJE (SILOS) | REPARACION INTEGRAL DE FILTRACIONES EN TECHO (4-5-6-7) | Emergencia Emergencia | NO REALIZADA |
| 31/08 | almacenaje_puerto | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 31/08 | almacenaje_puerto | BOMBA SOPLANTE DE TRASPORTE NEUMATICO TN1 DE  | EN EL DÍA DE HOY SE REEMPLAZO MOTOR QUEMADO DE SOPLANTE V_TN1 EN FMCELDA 4 SE SOLICITA MOD | Correctivo Normal | REALIZADA |
| 31/08 | recepcion_puerto ⬆ | FILTRO DE MANGAS DESCARGA DE CAMIONES | CAMBIO DE ROTOR VENTILADOR BOOSTER PV5 | Correctivo Normal | NO REALIZADA |

### RICARDONE — DEMORA DE PLANTA 02/09

Datos: 02/09 3 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | rv1 | CENTRAL HIDRAULICA <RVC-1> | Inspección mecánica Volcable 01 | Predictivo Normal | REALIZADA |
| 31/08 | rv2 ⬆ | NORIA N-08  PTV Nº 2 | Inspección mecánica Volcable 02 | Predictivo Normal | REALIZADA |
| 02/09 | rv2 ⬆ | NORIA N-08  PTV Nº 2 | CAMBIO COMPLETO DE NORIA. ASIGNADO A TORK | Mejora Normal | NO REALIZADA |
| 02/09 | secadora_girasol_ricardone ⬆ | LOGICO PLATAFORMAS VOLCABLES | CAMBIO Y REPARACION DE CORTINAS DE TIRAS Y ENRROLLABLES SEGUN P/P 107729 ASIG A CARNEVALLI | Planificado Urgente | NO REALIZADA |

### PV1 puerto — COMPENSA 02/09

Datos: 02/09 136 vs 52 (cubre PV3 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 31/08 | almacenaje_puerto | ALMACENAJE (SILOS) | REPARACION INTEGRAL DE FILTRACIONES EN TECHO (4-5-6-7) | Emergencia Emergencia | NO REALIZADA |
| 31/08 | almacenaje_puerto | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 02/09 | recepcion_puerto | CINTA C01 | PA C01 TRABAJOS EN PARADA ANUAL 09.2026 | Planificado  | NO REALIZADA |
| 02/09 | almacenaje_puerto | CINTA 12 BAJO CELDA 4 | PA C12 TRABAJOS DE PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |

### PV3 puerto — APAGADA 02/09–04/09

Datos: 02/09 15 vs 128; 03/09 0 vs 128; 04/09 0 vs 128

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 04/09 | pv3 | PLATAFORMA VOLCABLE PV3 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | NO REALIZADA |
| 31/08 | almacenaje_puerto | ALMACENAJE (SILOS) | REPARACION INTEGRAL DE FILTRACIONES EN TECHO (4-5-6-7) | Emergencia Emergencia | NO REALIZADA |
| 31/08 | almacenaje_puerto | CELDA 3 | REPARACION FILTRACION PERIMETRO SECTOR ACCESO DE PALAS NORTE | Emergencia Emergencia | NO REALIZADA |
| 02/09 | recepcion_puerto ⬆ | CINTA C01 | PA C01 TRABAJOS EN PARADA ANUAL 09.2026 | Planificado  | NO REALIZADA |

### Kepler 1 — APAGADA 05/09–09/09

Datos: 05/09 0 vs 25; 07/09 0 vs 25; 08/09 0 vs 25; 09/09 0 vs 25

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 07/09 | kepler | CINTA TRANSP. CBS KW-4 <NORTE | CAMBIAR ROLOS POR DESGASTE Y REVISAR EN GENERAL | Correctivo Normal | NO REALIZADA |
| 07/09 | kepler | RAMPA VOLC. CAMIONES Nº 7  SKW   <N> | CALZAR PISTON EN SU BASE | Correctivo Normal | REALIZADA |
| 07/09 | calada_ricardone | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |
| 07/09 | comun_ricardone ⬆ | LOGICO PLAYA Y MATERIA PRIMA | RECAMBIO DE CORTINAS (TIRAS ) INGRESOS A VOLCABLES Y CARGADEROS, REPARAR CORTINAS ENROLLAB | Correctivo Urgente | NO REALIZADA |

### PV1 puerto — APAGADA 07/09

Datos: 07/09 0 vs 57

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 05/09 | pv1 ⬆ | PLATAFORMA VOLCABLE PV1 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | NO REALIZADA |
| 07/09 | calada_ricardone | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |
| 07/09 | almacenaje_puerto | CINTA 13 BAJO CELDA 4 | REPARAR SENSOR ROTO TAMBOR CONDUCTOR | Correctivo Normal | NO REALIZADA |
| 07/09 | almacenaje_puerto | CELDA 4 | REALIZAR EL MONTAJE DE CARRETEL Y MANGUERA DEVANADERA DE RED DE INCENDIO EN PASARELA DE IN | Correctivo Normal | REALIZADA |

### PV2 puerto — COMPENSA 07/09

Datos: 07/09 145 vs 62 (cubre PV1 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 05/09 | pv2 ⬆ | PLATAFORMA VOLCABLE PV2 | CONTROL DE PLATAFORMA VOLCABLE | plan Normal | NO REALIZADA |
| 07/09 | calada_ricardone ⬆ | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |
| 07/09 | almacenaje_puerto | CINTA 13 BAJO CELDA 4 | REPARAR SENSOR ROTO TAMBOR CONDUCTOR | Correctivo Normal | NO REALIZADA |
| 07/09 | almacenaje_puerto | CELDA 4 | REALIZAR EL MONTAJE DE CARRETEL Y MANGUERA DEVANADERA DE RED DE INCENDIO EN PASARELA DE IN | Correctivo Normal | REALIZADA |

### RICARDONE — DEMORA DE PLANTA 09/09–11/09

Datos: 09/09 2 de 3 plataformas; 10/09 3 de 3 plataformas; 11/09 2 de 3 plataformas

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 07/09 | kepler | CINTA TRANSP. CBS KW-4 <NORTE | CAMBIAR ROLOS POR DESGASTE Y REVISAR EN GENERAL | Correctivo Normal | NO REALIZADA |
| 07/09 | kepler | RAMPA VOLC. CAMIONES Nº 7  SKW   <N> | CALZAR PISTON EN SU BASE | Correctivo Normal | REALIZADA |
| 07/09 | celda16 | CINTA TRANSP. BAJO VOLCABLE CELDA 16 | Revisión de cortinas Plataforma volcable 8 y 10 | Correctivo Normal | REALIZADA |
| 09/09 | secadora_girasol_ricardone ⬆ | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Correctivo Normal | REALIZADA |

### Volcable 1 Ricardone — COMPENSA 09/09

Datos: 09/09 69 vs 24 (cubre Kepler 1)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 09/09 | secadora_girasol_ricardone ⬆ | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Correctivo Normal | REALIZADA |
| 09/09 | secadora_girasol_ricardone ⬆ | REDLER RCR 2  CRUCERO L/OESTE | SACAR CAIDA DEL REDLER AL SILO 5 PARA LIMPIEZA | Correctivo Normal | REALIZADA |
| 09/09 | secadora_girasol_ricardone ⬆ | CINTA TRANSP. CSG-3 | CAMBIAR ACOPLE GUMMI Y ALINEAR | Correctivo Urgente | REALIZADA |
| 07/09 | calada_ricardone ⬆ | LOGICO BALANZA | CAMBIAR CABLE UTP DE LA CAMARA DE BALANZA 1 ENTRADA, HABLAR CON FRANCO MAZZETTI PARA COORD | Mejora Urgente | REALIZADA |

### PV1 puerto — APAGADA 12/09

Datos: 12/09 3 vs 68

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/09 | almacenaje_puerto | CELDA 4 | REPARACION ANTENA REPETIDORA DE COMUNICACION | Correctivo Emergencia | REALIZADA |
| 11/09 | recepcion_puerto | CINTA DE TRANSFERENCIA CT1 | CAMBIO DE RODILLOS Y BABETAS. | Diferido Normal | REALIZADA |

### PV2 puerto — DEMORA 12/09

Datos: 12/09 446 vs 287 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 10/09 | almacenaje_puerto | CELDA 4 | REPARACION ANTENA REPETIDORA DE COMUNICACION | Correctivo Emergencia | REALIZADA |
| 11/09 | recepcion_puerto ⬆ | CINTA DE TRANSFERENCIA CT1 | CAMBIO DE RODILLOS Y BABETAS. | Diferido Normal | REALIZADA |

### PV3 puerto — APAGADA 14/09

Datos: 14/09 0 vs 97

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 14/09 | almacenaje_puerto | VALVULA ROTATIVA FILTRO MANGA DE CELDA 4 (INF | CAMBIO DE VALVULA ROTATIVA | Correctivo Normal | NO REALIZADA |
| 14/09 | almacenaje_puerto | VENTILADOR FILTRO MANGA DE CELDA 4 | CAMBIO DE CORREAS | Diferido Normal | NO REALIZADA |

### PV1 puerto — APAGADA 16/09–17/09

Datos: 16/09 0 vs 80; 17/09 0 vs 47

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | almacenaje_puerto | CINTA 6 DE CARGA A CELDA 4 | PA C6 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |

### PV2 puerto — APAGADA 16/09–17/09

Datos: 16/09 0 vs 118; 17/09 0 vs 106

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | almacenaje_puerto | CINTA 6 DE CARGA A CELDA 4 | PA C6 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |

### PV3 puerto — COMPENSA 16/09

Datos: 16/09 131 vs 41 (cubre PV1 puerto, PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | almacenaje_puerto | CINTA 6 DE CARGA A CELDA 4 | PA C6 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |

### PV4 puerto — COMPENSA 16/09–17/09

Datos: 16/09 122 vs 0 (cubre PV1 puerto, PV2 puerto); 17/09 119 vs 0 (cubre PV1 puerto, PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 15/09 | almacenaje_puerto | CINTA 6 DE CARGA A CELDA 4 | PA C6 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 7 DE CARGA A CELDA 4 | PA C7 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 8 SOBRE CELDA 4 | PA C8 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 15/09 | almacenaje_puerto | CINTA 9 SOBRE CELDA 4 | PA C9 TRABAJOS EN PARADA ANUAL | Planificado  | NO REALIZADA |

### PV1 puerto — DEMORA 18/09

Datos: 18/09 526 vs 319 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 18/09 | pv1 ⬆ | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE NRO 1 | FILTRADO DE ACEITE EN CENTRAL HIDRAULICA, DE ACUERDO A INFORME DE ANALISIS DE ACEITE 07/09 | Mitigación En Espera de Parada | NO REALIZADA |
| 18/09 | almacenaje_puerto | CINTA 11 DE CARGA A NORIA EL6 | PA C4C11 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 18/09 | almacenaje_puerto | CINTA 12 BAJO CELDA 4 | PA TE-ALM-CNT-C12  TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 16/09 | calada_ricardone | CALADOR AUTOMATICO Nº 2 - CENTRAL | Se solicita cambiar turbina 3 (media)del calador 2. también mangueras neumáticas internas  | Correctivo Normal | NO REALIZADA |

### PV3 puerto — APAGADA 21/09

Datos: 21/09 0 vs 97

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 21/09 | recepcion_puerto ⬆ | CINTA C05 | PA C05 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |
| 19/09 | almacenaje_puerto | CINTA 13 BAJO CELDA 4 | REEMPLAZAR ACEITE DE REDUCTOR, DE ACUERDO A INFORME DE ANALISIS DE ACEITES 07/09/2026.- | Mitigación Urgente | NO REALIZADA |
| 21/09 | calada_ricardone ⬆ | CALADOR AUTOMATICO Nº 2 - CENTRAL | ARREGLAR LA BASE DONDE SOSTIENE EL PISTON ELEVADOR DEL CALADOR Nº 2 HABRIA QUE SOLDAR POR  | Correctivo Normal | NO REALIZADA |

## 3. Episodios sin OT en su cadena

Candidatos a causa operativa (sin producto para esa plataforma, asignación de volcables) o a una parada que no se cargó en el EAM.

- Celda 16 Ricardone — DEMORA 11/06: 11/06 355 vs 210 min
- PV2 puerto — APAGADA 15/06: 15/06 18 vs 108
- PV2 puerto — APAGADA 17/08: 17/08 17 vs 134
- Volcable 1 Ricardone — APAGADA 28/08: 28/08 3 vs 24
