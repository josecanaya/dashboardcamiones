# Girasol — contexto del especialista

Fuente estructurada: `contexto.json`, entrada `products.girasol`.

## Conocimiento recuperado

- R5/R6: calada→volcable1/2 Ricardone observado por script; corroborar producto Excel — `scripts/estado-planta/metricas-camaras.cjs`, observada_en_codigo.
- Generador mantiene tiempos ajustados incluso con Excel por muestra pequeña — `scripts/estado-planta/gen_comite_logistica.py`, observada_en_codigo.

## Recetas del informe

- **Operaciones por circuito** (`girasol.operaciones`): Separar R4/R5/R6; rama EXCEL conserva tramos ajustados por cámara. Fuente `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/paquete_excel.json`, selector `tiempos.girasol.operaciones y ejecutivo.circuitosPorProducto.GIRASOL`. Unidad: operaciones. Estado: observada_en_codigo.
- **Tramos publicados de girasol** (`girasol.tramos`): Publicado previo + variación de cámara para p1/descarga/tara; ing/pb constantes y ap3 ajuste fijo; NO media directa validada. Fuente `scripts/estado-planta/gen_comite_logistica.py`, selector `GI y seccion girasol`. Unidad: minutos ajustados. Estado: historico_reportado.
- **Puerta a puerta Excel** (`girasol.mediana`): Valor complementario; productor/filtros pendientes de reconstruir. Fuente `reportes/logistica/2026-09-24_2026-09-30/comite-logistica/excel_extra.json`, selector `girasol_p2p_excel_mediana`. Unidad: minutos. Estado: pendiente.

## Seguridad y comunicación

equipo declarado vs observado, cobertura de volcable2, demora vs evidencia mantenimiento. Entregar al comunicador el contrato de README; conservar ID de cada caso compartido.

## Ausencia de actividad

Verificar cobertura de operaciones del período y faltantes. Cero cámara no significa cero producto. Informar uno de los cuatro estados del README. Si faltan datos, publicar limitación, no cifra cero.
