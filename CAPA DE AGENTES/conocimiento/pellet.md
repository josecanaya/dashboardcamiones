# Pellet — contexto del especialista

Fuente estructurada: `contexto.json`, entrada `products.pellet`.

## Conocimiento recuperado

- Transile pellet de girasol al puerto separado de despachos en camión — `scripts/estado-planta/gen_comite_logistica.py`, observada_en_codigo.
- Tandas corte >4h; neto real separado de viajes ×30t — `scripts/estado-planta/pellet-operativo.cjs`, observada_en_codigo.

## Recetas del informe

- **Viajes y patentes del operativo** (`pellet.viajes`): excel_operations_with_truckflow; producto PELLET, circuito R30/31/32, source_date rango; dedup external_operation_id; excluir patente ficticia. Fuente `scripts/estado-planta/pellet-operativo.cjs`, selector `X, viajesDia, viajesPorCamion`. Unidad: operaciones de transile y patentes únicas. Estado: observada_en_codigo.
- **Toneladas reales y estimadas** (`pellet.toneladas`): Neto suma kgs_neto/1000; estimación viajes ×30 separada de pesaje; campo ausente no implica neto cero confirmado. Fuente `scripts/estado-planta/pellet-operativo.cjs`, selector `kgReal y toneladas`. Unidad: toneladas. Estado: observada_en_codigo.
- **Duración del operativo** (`pellet.tandas`): Primer ingreso a última salida por tanda; cortar con más de 4h sin marcas; es criterio del informe. Fuente `scripts/estado-planta/pellet-operativo.cjs`, selector `marks, bloques`. Unidad: horas por tanda. Estado: observada_en_codigo.
- **Tiempos del viaje** (`pellet.tramos`): Cámaras de patentes Excel: pre→playa3→balanza egreso→SL ingreso→balanza→volcable→salida, sin silo/calada sólida; n y caps por tramo. Fuente `scripts/estado-planta/pellet-operativo.cjs`, selector `trips y is`. Unidad: minutos, muestra de recorridos. Estado: observada_en_codigo.
- **Operativos históricos** (`pellet.historico`): Reglas del script; períodos operativos pueden cruzar semanas. Fuente `scripts/estado-planta/pellet-historico.cjs`, selector `archivo completo`. Unidad: operativos, viajes, patentes. Estado: observada_en_codigo.
- **Comparación flota y tarifa** (`pellet.escenarios`): Anexo de escenario; filtros leidos>=25 y viajes>=50; hipótesis tarifaria y causalidad no confirmada. Fuente `scripts/estado-planta/gen_comite_logistica.py`, selector `pellet-flota y pellet-tarifa`. Unidad: escenario. Estado: historico_reportado.

## Seguridad y comunicación

múltiples vueltas no son anomalía por sí mismas, operación sin vínculo, recorrido transile incompatible, operativo abierto fuera período. Entregar al comunicador el contrato de README; conservar ID de cada caso compartido.

## Ausencia de actividad

Verificar cobertura de operaciones del período y faltantes. Cero cámara no significa cero producto. Informar uno de los cuatro estados del README. Si faltan datos, publicar limitación, no cifra cero.
