# Comités × mantenimiento × descarga

Once semanas analizadas por el comité de logística (del 14/06 al 16/09) cruzadas con el mapa de planta y las OT. Tiempos del comité en minutos. “Días-plataforma” = suma, sobre las plataformas del grupo, de los días en ese estado.

- **Sim. detenidas**: días-plataforma que el mapa da por detenidas con las OT que paran equipo por su texto o son emergencia (inicio programado hasta 2 días antes).
- **Sim. amplia**: lo mismo sumando correctivas, urgentes y diferidas.
- **Apagadas (Excel)**: días-plataforma en que la planta descargó normal y esa plataforma no.
- **Calador-días**: caladores de Ricardone con OT correctiva, urgente o de emergencia cada día, sumados en la semana.

## Semana a semana

| Comité | Período | R7 | Playa 1 / calada | Playa OSL / balanza | R5+R6 | Calador-días | Puerto: sim. det. / amplia / apagadas | Girasol Ric.: sim. det. / amplia / apagadas | Soja Ric.: sim. det. / apagadas |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| 24/06 | 14/06–21/06 | 316 | 113 | 86 | 287 | 2 | 3 / 4 / 3 | 0 / 0 / 0 | 0 / 0 |
| 08/07 | 22/06–05/07 | 383 | 145 | 105 | 317 | 2 | 3 / 9 / 0 | 3 / 3 / 0 | 0 / 0 |
| 15/07 | 06/07–12/07 | 304 | 114 | 65 | 306 | 2 | 0 / 0 / 1 | 0 / 0 / 0 | 0 / 0 |
| 23/07 | 13/07–19/07 | 433 | 171 | 140 | 351 | 2 | 0 / 0 / 0 | 6 / 6 / 0 | 0 / 0 |
| 31/07 | 20/07–26/07 | 389 | 181 | 85 | 361 | 4 | 4 / 4 / 0 | 3 / 3 / 0 | 0 / 0 |
| 07/08 | 27/07–02/08 | 421 | 120 | 145 | 347 | 1 | 0 / 6 / 0 | 0 / 3 / 0 | 3 / 0 |
| 14/08 | 07/08–12/08 | 346 | 101 | 113 | 241 | 1 | 0 / 3 / 0 | 0 / 0 / 0 | 0 / 1 |
| 28/08 | 20/08–26/08 | 296 | 112 | 89 | 353 | 0 | 0 / 5 / 7 | 0 / 0 / 0 | 0 / 0 |
| 04/09 | 27/08–02/09 | 379 | 140 | 137 | 430 | 1 | 0 / 2 / 1 | 1 / 1 / 3 | 0 / 0 |
| 11/09 | 03/09–09/09 | 276 | 87 | 97 | 319 | 1 | 5 / 8 / 3 | 4 / 4 / 0 | 0 / 4 |
| 18/09 | 10/09–16/09 | 334 | 126 | 119 | 382 | 2 | 1 / 1 / 4 | 4 / 4 / 0 | 0 / 0 |

## ¿Acompaña el mantenimiento lo que midió el comité?

Correlación de rangos (Spearman) entre las 11 semanas. Con 11 puntos, |ρ| < 0,5 es ruido; 0,5–0,7 es una señal a mirar; > 0,7 es fuerte.

| Métrica del comité | Métrica de mantenimiento | ρ |
|---|---|---:|
| Playa 1 / calada (comité) | Calador-días | +0.66 |
| R7 total (comité) | Calador-días | +0.36 |
| Playa OSL / balanza (comité) | Puerto sim. amplia | -0.05 |
| Playa OSL / balanza (comité) | Puerto apagadas (Excel) | -0.30 |
| R7 total (comité) | Puerto sim. amplia | -0.12 |
| R5+R6 (comité) | Girasol sim. amplia | +0.44 |
| R5+R6 (comité) | Girasol sim. detenidas | +0.45 |
| R5+R6 (comité) | Girasol apagadas (Excel) | +0.50 |

## Qué OT de cada semana detienen alguna plataforma según el mapa

OT fuertes con inicio programado entre 2 días antes de la semana y su último día. ● = para el equipo por su texto o es emergencia.

### Comité 24/06 (14/06–21/06) — R7 316 · Playa 1 113 · Playa OSL 86 · R5+R6 287

Excel, plataformas apagadas: PV1 puerto 2 d, PV2 puerto 1 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 17/06 | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE N | REPARAR ILUMINJACION SALA CENTRAL HIDRAULICA PV5. | PV5 puerto (secadora) |  |
| 18/06 | NORIA EL7  CARGA A SECADORA DESDE PV5 | CAMBIO DE MOTOR EL7 SECADORA. (RODAMIENTOS) | PV5 puerto (secadora) | ● |

### Comité 08/07 (22/06–05/07) — R7 383 · Playa 1 145 · Playa OSL 105 · R5+R6 317

Excel, plataformas apagadas: ninguna.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 26/06 | PLATAFORMA VOLCABLE PV1 | REPARAR MALLA DE ASPIRACION LADO OESTE (SECTOR TOLBA) | PV1 puerto |  |
| 29/06 | CINTA TRANSP. CSG-3 | CAMBIAR REDUCTOR POR ROTURA DEL MISMO / ASIG: LANATTI-ENCINA | Volcable 2 Ricardone | ● |
| 01/07 | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE N | CAMBIO MOTOR BOMBA RECIRCULADORA PV5 | PV5 puerto (secadora) | ● |
| 02/07 | PLATAFORMA VOLCABLE PV1 | CAMBIO REJILLA PIVOT POR DESGASTE | PV1 puerto |  |

### Comité 15/07 (06/07–12/07) — R7 304 · Playa 1 114 · Playa OSL 65 · R5+R6 306

Excel, plataformas apagadas: PV3 puerto 1 d.

Ninguna OT de la semana detiene una plataforma según el mapa.

### Comité 23/07 (13/07–19/07) — R7 433 · Playa 1 171 · Playa OSL 140 · R5+R6 351

Excel, plataformas apagadas: ninguna.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 14/07 | RAMPA VOLC. CAMIONES Nº 2 | CAMBIAR CILINDRO HIDRAULICO. ASIGNADO: LANATTI, HORACIO | Volcable 2 Ricardone | ● |
| 17/07 | RAMPA VOLC. CAMIONES Nº 2 | CAMBIAR CILINDRO. ASIGNADO LANATTI Y MARTINEZ | Volcable 2 Ricardone | ● |

### Comité 31/07 (20/07–26/07) — R7 389 · Playa 1 181 · Playa OSL 85 · R5+R6 361

Excel, plataformas apagadas: ninguna.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 20/07 | NORIA N-08  PTV Nº 2 | CAMBIAR CADENA DE MANDO DE NORIA 8. ASIGNADO: LANATTI | Volcable 2 Ricardone | ● |

### Comité 07/08 (27/07–02/08) — R7 421 · Playa 1 120 · Playa OSL 145 · R5+R6 347

Excel, plataformas apagadas: ninguna.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 27/07 | CINTA TRANSP. CSS KW-1 <SUR> | ALINEAR CINTA, COLOCAR ROLOS DE GUIAS FALTANTES. | Kepler 2 |  |
| 27/07 | NORIA EL7  CARGA A SECADORA DESDE PV5 | CAMBIO DE ACEITE. (ST= REDUCTOR CON COMPONENTES DE ENGRANE, TOMAR MUESTRA DE ACE | PV5 puerto (secadora) |  |
| 28/07 | CINTA TRANSP. CSS KW-1 <SUR> | CAMBIAR REDUCTOR | Kepler 2 | ● |
| 31/07 | PLATAFORMA VOLCABLE PV2 | REPARAR MALLA DE ASPIRACION LADO OESTE (SECTOR TOLBA) | PV2 puerto |  |
| 31/07 | SECADORA DE GRANOS CEDAR M- ADF 250 | REVISAR ENCENDIDO DE QUEMADORES Y PARADA DE EMERGENCIA | Volcable 2 Ricardone |  |

### Comité 14/08 (07/08–12/08) — R7 346 · Playa 1 101 · Playa OSL 113 · R5+R6 241

Excel, plataformas apagadas: Kepler 1 1 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 10/08 | REDLER 31 (PV5 A EL7) | REVISAR GUIAS (ESPESOR) | PV5 puerto (secadora) |  |
| 12/08 | PLATAFORMA VOLCABLE PV5 A SECADORA | CAMBIO CORTINA DUST MASTER (CAÑOS DOBLADOS Y LONA ROTA POR INCIDENTE CON TRANSPO | PV5 puerto (secadora) |  |

### Comité 28/08 (20/08–26/08) — R7 296 · Playa 1 112 · Playa OSL 89 · R5+R6 353

Excel, plataformas apagadas: PV1 puerto 3 d, PV2 puerto 3 d, PV3 puerto 1 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 21/08 | PLATAFORMA VOLCABLE PV4 | REPARACION DE SOPORTE DE CALZA. LADO ESTE | PV4 puerto |  |
| 25/08 | PLATAFORMA VOLCABLE PV2 | CAMBIO DE CAÑOS, CORTINAS Y TIRAS DE IZAJE PV2 | PV2 puerto |  |
| 26/08 | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | PV2 puerto |  |

### Comité 04/09 (27/08–02/09) — R7 379 · Playa 1 140 · Playa OSL 137 · R5+R6 430

Excel, plataformas apagadas: Volcable 1 Ricardone 3 d, PV3 puerto 1 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 25/08 | PLATAFORMA VOLCABLE PV2 | CAMBIO DE CAÑOS, CORTINAS Y TIRAS DE IZAJE PV2 | PV2 puerto |  |
| 26/08 | PLATAFORMA VOLCABLE PV2 | REPARACION DE REJILLA PIVOTE | PV2 puerto |  |
| 02/09 | NORIA N-08  PTV Nº 2 | CAMBIO COMPLETO DE NORIA. ASIGNADO A TORK | Volcable 2 Ricardone | ● |

### Comité 11/09 (03/09–09/09) — R7 276 · Playa 1 87 · Playa OSL 97 · R5+R6 319

Excel, plataformas apagadas: Kepler 1 4 d, PV1 puerto 1 d, PV3 puerto 2 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 02/09 | NORIA N-08  PTV Nº 2 | CAMBIO COMPLETO DE NORIA. ASIGNADO A TORK | Volcable 2 Ricardone | ● |
| 03/09 | PLATAFORMA VOLCABLE PV4 | CAMBIO CORTINA DUST MASTER POR INCIDENTE OCURRIDO EL DIA 30-08. | PV4 puerto | ● |
| 04/09 | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE N | REEMPLAZO DE MANGUERA DE PILOTO DE BOMBA 1 | PV5 puerto (secadora) |  |
| 07/09 | RAMPA VOLC. CAMIONES Nº 7  SKW   <N> | CALZAR PISTON EN SU BASE | Kepler 1 |  |
| 08/09 | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE N | MOTOR NRO.1 DE CENT.HID.2 CON RUIDO, POSIBLEMENTE VENTILADOR A PALETA DEL EQUIPO | PV2 puerto | ● |
| 09/09 | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Volcable 1 Ricardone, Volcable 2 Ricardone | ● |
| 09/09 | CINTA TRANSP. CSG-3 | CAMBIAR ACOPLE GUMMI Y ALINEAR | Volcable 2 Ricardone | ● |

### Comité 18/09 (10/09–16/09) — R7 334 · Playa 1 126 · Playa OSL 119 · R5+R6 382

Excel, plataformas apagadas: PV1 puerto 2 d, PV2 puerto 1 d, PV3 puerto 1 d.

| Inicio prog. | Equipo | Trabajo | Detiene | |
|---|---|---|---|---|
| 08/09 | CENTRAL HIDRAULICA PLATAFORMA VOLCABLE N | MOTOR NRO.1 DE CENT.HID.2 CON RUIDO, POSIBLEMENTE VENTILADOR A PALETA DEL EQUIPO | PV2 puerto | ● |
| 09/09 | REDLER RSG-1  CRUCERO | REPARAR, LA CADENA DE ARRASTRE SE DESMONTO DE LA CORONA | Volcable 1 Ricardone, Volcable 2 Ricardone | ● |
| 09/09 | CINTA TRANSP. CSG-3 | CAMBIAR ACOPLE GUMMI Y ALINEAR | Volcable 2 Ricardone | ● |
| 15/09 | SILO CELDA DEP. M. P. Nº 16 | REPARAR 2 PINCHADURAS EN CAÑERIA RED DE INCENDIO A LA ALTURA DE LOS SOPORTES LAD | Celda 16 Ricardone |  |
