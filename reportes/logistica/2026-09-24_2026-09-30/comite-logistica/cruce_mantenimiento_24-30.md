# Cruce mantenimiento × descarga (24/09–30/09)

Descargas: Excel de movimientos (INGRESO por plataforma, sin patentes ficticias). Dependencias: mapa de planta `mapa_planta_mantenimiento.json` (415 equipos con efecto sobre la descarga). OT: 240 sobre equipos que afectan la descarga, sin canceladas ni trabajos que no paran equipo. Una OT “toca” un día si su inicio programado está entre 2 días antes y ese día.

> La fecha de la OT es la programada (el EAM copia la real en el 92 % de los casos) y no hay horas de parada. Una coincidencia es una pista para validar con planta, no una causa probada.

## 1. ¿Qué cadenas mueven la descarga?

Para cada cadena y cada plataforma que afecta: días de planta operando con OT fuerte (correctiva, urgente, emergencia o parada anual) en esa cadena, contra los días sin ninguna OT en la cadena. “Apagada” = % de días con la plataforma casi sin descargar. “Tiempo” = mediana del tiempo del día dividido su mediana de 14 días (1,00 = normal).

| Cadena | Relación | Plataforma | Días con OT | Apagada con OT | Apagada sin OT | Tiempo con OT | Tiempo sin OT |
|---|---|---|---:|---:|---:|---:|---:|

⬆ = con OT la plataforma se apaga al menos 10 puntos más seguido, o su tiempo sube al menos un 10 % más que sin OT. Se omiten los cruces con menos de 3 días con OT o menos de 15 días sin OT.

## 2. Episodios y OT más específicas

Orden de las OT: primero las de la propia plataforma, después las de su cadena exclusiva (secadora, celda, noria), al final las compartidas (calada, playa, recepción). Se muestran hasta 4.

### Volcable 1 Ricardone — DEMORA 24/09

Datos: 24/09 970 vs 571 min

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 24/09 | reduce_capacidad · servicio | SISTEMA ASP. POLVILLO PTV-1 | Desconexión motores aspiración PTV1 | Correctivo Normal | NO REALIZADA |
| 22/09 | demora · aguas_arriba | CALADOR AUTOMATICO Nº 1 -L/OESTE | CAMBIA BRAZO DE APERTURA Y CIERRE DE VASOS  CATRE Nº 1 | Correctivo Normal | NO REALIZADA |

### Volcable 1 Ricardone — APAGADA 28/09–29/09

Datos: 28/09 4 vs 48; 29/09 0 vs 46

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 29/09 | reduce_capacidad · aguas_abajo | SILO CELDA DEP. M. P. Nº 5 | REPARAR VOLANTE DE VALVULA 1 EN TUNEL. | Correctivo Normal | NO REALIZADA |
| 28/09 | demora · aguas_arriba | LOGICO ACCESO | SE SOLICITA AMURAR CAJA ELECTRICA Y MODEM DE SISTEMA EN PARED. SE ENCUENTRAN SOSTENIDOS PO | Correctivo Normal | NO REALIZADA |
| 29/09 | demora · aguas_arriba | LOGICO BALANZA | CELDA 6 DE BALANZA 1 SE ENCUENTRA GIRADA, SE SOLICITA CORRECCION. | Correctivo Normal | NO REALIZADA |
| 29/09 | demora · aguas_arriba | LOGICO BALANZA | Se solicita reparación de chapón cubre junta de paños en Balanza 1. Segundo de Sur hacia N | Correctivo Normal | NO REALIZADA |

### Volcable 2 Ricardone — COMPENSA 28/09

Datos: 28/09 31 vs 2 (cubre Volcable 1 Ricardone)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 28/09 | demora · aguas_arriba | LOGICO ACCESO | SE SOLICITA AMURAR CAJA ELECTRICA Y MODEM DE SISTEMA EN PARED. SE ENCUENTRAN SOSTENIDOS PO | Correctivo Normal | NO REALIZADA |

### PV2 puerto — APAGADA 28/09

Datos: 28/09 0 vs 22

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/09 | reduce_capacidad · servicio | COMPRESOR ATLAS GA-75+P A 7,5 Nº SERIE API628 | MANTENIMIENTO PREVENTIVO   8000 HS | plan Normal | NO REALIZADA |

### PV4 puerto — COMPENSA 28/09

Datos: 28/09 29 vs 4 (cubre PV2 puerto)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 26/09 | reduce_capacidad · servicio | COMPRESOR ATLAS GA-75+P A 7,5 Nº SERIE API628 | MANTENIMIENTO PREVENTIVO   8000 HS | plan Normal | NO REALIZADA |

### Kepler 2 — COMPENSA 29/09

Datos: 29/09 23 vs 0 (cubre Volcable 1 Ricardone)

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 28/09 | demora · aguas_arriba | LOGICO ACCESO | SE SOLICITA AMURAR CAJA ELECTRICA Y MODEM DE SISTEMA EN PARED. SE ENCUENTRAN SOSTENIDOS PO | Correctivo Normal | NO REALIZADA |
| 29/09 | demora · aguas_arriba | LOGICO BALANZA | CELDA 6 DE BALANZA 1 SE ENCUENTRA GIRADA, SE SOLICITA CORRECCION. | Correctivo Normal | NO REALIZADA |
| 29/09 | demora · aguas_arriba | LOGICO BALANZA | Se solicita reparación de chapón cubre junta de paños en Balanza 1. Segundo de Sur hacia N | Correctivo Normal | NO REALIZADA |

### PV3 puerto — APAGADA 30/09

Datos: 30/09 0 vs 28

| Inicio prog. | Cadena | Activo | Trabajo | Tipo | Resultado |
|---|---|---|---|---|---|
| 29/09 | reduce_capacidad · aguas_abajo | CINTA C01 | PA C01 TRABAJOS EN PARADA ANUAL 09-2026 | Planificado  | NO REALIZADA |

## 3. Episodios sin OT en su cadena

Candidatos a causa operativa (sin producto para esa plataforma, asignación de volcables) o a una parada que no se cargó en el EAM.

