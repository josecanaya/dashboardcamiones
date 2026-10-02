# Propuesta de continuidad — Comité de Seguridad · Semana 24–30 sep

## Punto de partida

La presentación tiene 18 diapositivas en formato 16:9. Su narrativa avanza desde el resumen semanal hacia cuatro familias de anomalías y termina con el histórico. La identidad visual combina verde institucional, violeta para separadores, naranja para San Lorenzo, azul para Ricardone y rojo para eventos de riesgo. Las láminas de journey usan evidencia de cámara, horarios y nodos en una secuencia fácil de auditar.

El archivo debe mantenerse como fuente visual y estructural. La referencia web de Claude requiere inicio de sesión, por lo que la inspección verificable se hizo sobre el PPTX local importado.

## Qué conservar

- Portada aérea con la división Ricardone / San Lorenzo.
- Separadores violetas numerados.
- Código de color por planta y rojo para el tramo anómalo.
- Patente como identificador dominante en las láminas de caso.
- Secuencia de nodos arriba y capturas de cámara abajo.
- Pie de página, logos y tipografías existentes: Public Sans y Domine.
- Cierre histórico como contexto, sin mezclarlo con el denominador semanal.

## Continuidad propuesta

### 1. Abrir con una lectura ejecutiva más precisa

Mantener la lámina 2, pero separar explícitamente:

- movimientos o descargas según Excel;
- recorridos observados por cámaras;
- anomalías confirmadas;
- casos que siguen en revisión.

Cada cifra futura debe indicar denominador y fuente. No se incorporará ningún valor sin validación en las tablas canónicas del ETL.

### 2. Incorporar una lámina de priorización después del resumen

Nueva lámina sugerida: **Prioridad de revisión**.

Ordenar los casos ya documentados en tres niveles, sin afirmar intencionalidad:

- alta prioridad: journey incompatible con la operación registrada o retorno sin descarga;
- prioridad media: demora o transición fuera del modelo con explicación operativa todavía abierta;
- observación técnica: lecturas simultáneas o posibles problemas de cobertura de cámaras.

La prioridad debe apoyarse en reglas explícitas y evidencia trazable, no en una puntuación opaca.

### 3. Reducir repetición en el bloque de retornos al puerto

Las láminas 4 a 9 usan la misma estructura y funcionan bien como evidencia. Para comité, conviene:

- conservar completas las dos situaciones más críticas o más representativas;
- resumir los casos restantes en una matriz comparativa;
- dejar los journeys completos como anexo verificable.

La matriz puede usar: patente, producto, permanencia en puerto sin descarga, tiempo hasta descarga, reingreso a Ricardone y condición pendiente de aclaración.

### 4. Separar anomalía operativa de anomalía de sensado

En el bloque de calles del puerto, distinguir visualmente:

- discrepancia Excel ↔ calle observada;
- recorrido operativo excepcional;
- lectura de cámaras potencialmente ambigua.

Esto evita presentar EEW075 con el mismo nivel de certeza que una descarga confirmada en otra calle.

### 5. Convertir las demoras en una lectura de patrón

La lámina 15 ya señala que cuatro camiones llegaron juntos. La continuidad debería mostrar dos grupos:

- evento agrupado compatible con espera en acceso;
- caso individual que requiere revisión.

La redacción debe preservar el carácter de hipótesis hasta que el journey y las cámaras confirmen la causa.

### 6. Transformar “fuera del modelo” en backlog de validación

La lámina 17 puede evolucionar a una tabla de decisión con:

- transición observada;
- cantidad validada;
- posible explicación operativa;
- evidencia faltante;
- decisión: incorporar regla, mantener excepción o revisar cámaras.

No se debe ampliar el catálogo de circuitos solo porque una transición aparece en cámaras.

### 7. Cerrar con decisiones y responsables

Agregar una última lámina breve: **Decisiones para la próxima semana**.

La estructura recomendada es:

- caso o patrón;
- acción de verificación;
- área responsable;
- fecha objetivo;
- estado.

Los responsables y fechas deben quedar vacíos hasta que el comité los defina.

## Orden sugerido para la próxima versión

1. Portada.
2. Semana en números, con denominadores y fuentes.
3. Prioridad de revisión.
4. Retornos a Ricardone: síntesis comparativa.
5. Dos journeys completos de mayor prioridad.
6. Calles del puerto: discrepancia operativa vs. lectura técnica.
7. Journey completo de KEB002.
8. Journey completo de EEW075 como caso de sensado.
9. Demoras interplanta: patrón agrupado y caso individual.
10. Transiciones fuera del modelo: backlog de validación.
11. Histórico.
12. Decisiones para la próxima semana.
13. Anexo con journeys restantes.

## Criterio de verificación para editar el PPTX

Antes de reescribir cualquier lámina se debe recuperar la corrida correspondiente a la semana calendario, registrar `run_id` y `rulesVersion`, y consultar únicamente las tablas canónicas:

- `excel_operations_with_truckflow` para movimientos, producto y plataforma;
- `final_circuits.executive_bucket` para clasificación ejecutiva;
- `circuit_timing_summary` para tiempos;
- `explain_journey` para cada patente incluida;
- `get_circuit_catalog` para explicar reglas o circuitos.

La versión editada debe conservar todas las capturas que sirven como evidencia y marcar con claridad cualquier interpretación pendiente.
