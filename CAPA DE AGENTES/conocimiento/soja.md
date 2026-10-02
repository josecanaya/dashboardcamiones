# Soja — contexto del especialista

Fuente estructurada: `contexto.json`, entrada `products.soja`.

## Conocimiento recuperado

- R7 cámara: calada→volcable puerto sin carga silo previa; producto se confirma con Excel — `scripts/estado-planta/metricas-camaras.cjs`, observada_en_codigo.
- R29: carga silo→calada→egreso→volcable puerto; generador lo presenta como transile soja — `scripts/estado-planta/gen_comite_logistica.py`, observada_en_codigo.

## Recetas del informe

- **Operaciones R7** (`soja.operaciones`): Rama EXCEL del generador; confirmar denominador del paquete antes de llamar movimientos a camiones. Fuente `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/paquete_excel.json`, selector `tiempos.soja.periodo.camiones`. Unidad: unidad del paquete, requiere validación. Estado: observada_en_codigo.
- **Tiempos por tramo R7** (`soja.tramos`): mediaMin por key; total tiempoMedioMin independiente de suma de medias. Fuente `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/paquete_excel.json`, selector `tiempos.soja.periodo.tramos`. Unidad: minutos y n por tramo. Estado: observada_en_codigo.
- **Transile desde silos** (`soja.r29`): Tramos medidos por cámaras; cantidad EXCEL ejecutivo.circuitosTotales R29 y excel_extra.r29_dia. Fuente `scripts/estado-planta/metricas-camaras.cjs`, selector `trips.r29 y CAPS`. Unidad: operaciones vs recorridos de cámara. Estado: observada_en_codigo.
- **Serie publicada R7** (`soja.historico`): Serie embebida reportada; no volver a calcular historia sin fuentes originales. Fuente `scripts/estado-planta/gen_comite_logistica.py`, selector `TOT, P1, SLZ, PUB`. Unidad: minutos publicados. Estado: historico_reportado.

## Seguridad y comunicación

retornos puerto→Ricardone, descargas Excel sin lectura volcable, calada repetida, equipo declarado vs observado. Entregar al comunicador el contrato de README; conservar ID de cada caso compartido.

## Ausencia de actividad

Verificar cobertura de operaciones del período y faltantes. Cero cámara no significa cero producto. Informar uno de los cuatro estados del README. Si faltan datos, publicar limitación, no cifra cero.
