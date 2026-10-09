# Implementación 1-2-3: estado al 08/10/2026

Reproducible con `node scripts/build-plate-learning-audit.mjs` (validacion.json) y
`node scripts/replay-inventory-reasons.mjs` (motivos-inventario.json). Replay causal de 06 y 07/10
contra 114 confirmaciones de operaciones (feedback seleccionado, no muestra aleatoria).

## 1. Inventario por visita (`server/plantState/visitInventory.mjs`)

- La visita se corta por reentrada o pausa >8 h: el `journeyUid` del proveedor se reutiliza entre vueltas.
- Solo se usan lecturas anteriores a la captura. Las referencias posteriores quedan como excepción.
- Balanzas de Ricardone por fase (ingreso/egreso) y carril; egresos C1/C2 de San Lorenzo por carril.

Motivos de excepción medidos (candidato correcto / incorrecto con ese motivo):

| Motivo | Correcto | Incorrecto | Estado |
|---|---|---|---|
| Referencia posterior a la captura | 16 | 32 | bloquea |
| Fuera de la ventana temporal del tramo | 1 | 20 | bloquea |
| Egreso de balanza sin proceso previo | 3 | 19 | bloquea |
| Otro carril de egreso | 2 | 12 | bloquea |
| Balanza de egreso ya registrada | 0 | 4 | bloquea |
| Recorrido incompleto: faltan pasos previos | 7 | 4 | **en evaluación** |
| Paso ya consumido o recorrido incompatible | 11 | 9 | **en evaluación** |

Los dos últimos no separan correctos de incorrectos y frenaban 4 de 6 automáticas correctas
(AJ7141→AD714BI, NWZJ836→NWZ336, EFA3233→EFA323, RNI79→RNI799): las cámaras pierden lecturas
intermedias. Quedan registrados en `inventory.shadow` y se muestran al operador, sin bloquear.

Resultado: automáticas 6/6 de acuerdo con operaciones (con los dos motivos bloqueando: 2/2).
Candidato correcto en "esperados" 27 casos (antes 20), en excepciones 34 (antes 41). El orden
del primer candidato no cambia (53/114): el inventario filtra y separa, no mejora el ranking.

## 2. Aprendizaje por cámara (`server/plantState/cameraLearning.mjs`), modo sombra

Confirmar patente, "mismo vehículo / otro vehículo" y atributo mal leído se guardan por separado.
Las 103 correcciones viejas no tienen comparación visual registrada: quedan como patrones
exploratorios. Hay 0 comparaciones verificadas, así que ninguna propuesta se activa.

## 3. Prior de circuitos v17 (circuit-prior-v17-shadow.json), modo sombra

Denominador: recorridos de cámara con `executive_circuit_code` (no movimientos Excel).

## Pendiente para promover reglas

Juntar comparaciones verificadas con el diálogo de fotos y repetir el replay sobre días nuevos.
6 de 6 no alcanza para afirmar precisión (límite inferior 95% ≈ 61%).
