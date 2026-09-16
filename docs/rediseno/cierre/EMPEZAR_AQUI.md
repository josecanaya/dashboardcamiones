# Cierre del rediseño — instrucciones para el agente ejecutor

Fecha: 16-09-2026. Repo: `C:/Users/Usuario/Desktop/Dashboard_camiones`. Rama actual: `automatizacion`. Leer este archivo y luego **una ficha por vez**. No volver a diseñar la solución ni rehacer lo ya commiteado.

## Pedido vigente

Completar el rediseño general, mejorar carga/extracción/análisis local y eliminar Transform como pantalla del proceso. Este paquete fija las decisiones para que lo implemente un agente económico. El calendario del viernes fue retirado por el usuario. DSS, cámaras en vivo y editor del plano recientemente incorporado se preservan.

## Ya hecho y qué falta

Commits anteriores: `a4eebc3` marco/Home/componentes, `8aa0569` período compartido, `db7c408` secciones/sincronización, `517a5de` y `7b02cf6` fichas mecánicas, `42724e2` documentación. No repetir T-01/T-02/T-03.

El 16-09 se retiró Transform ETL de Datos y proceso. Su contenido ejecutivo se accede como **Reportes → Resumen ejecutivo** (`/estadisticas/reportes/resumen`). `/transform` y `/estadisticas/datos/transform` redirigen allí. El cálculo interno y las exportaciones siguen existiendo. El archivo interno aún se llama TransformEtlTab: R09 retira ese nombre técnico sin perder contenido.

La pantalla única Datos y la automatización completa de fuentes **todavía no están implementadas**. Las fichas siguientes son la entrega pendiente, no un informe de trabajo terminado.

## Resultado final decidido

Navegación: En vivo; Indicadores (Tiempos, Calada, Descargas, Anomalías); Reportes (Resumen ejecutivo y los cinco existentes); **Datos** como única entrada de preparación. No habrá tres entradas Extracción/Análisis local/Transform.

`/estadisticas/datos` abre una pantalla con cuatro bloques, en este orden:

1. Período: único par Desde/Hasta de la app, presets Semana anterior y Últimos 7 días completos. Cambiar el borrador no cambia datos ya visibles.
2. Disponibilidad: fuentes de cámaras, movimientos Excel y corridas preparadas; cada una con estado textual verificable.
3. Acción principal: Abrir datos, Descargar y preparar, Preparar datos o Reintentar pendientes, según contrato. Una cola visible de fases, sin obligar a navegar.
4. Herramientas avanzadas colapsadas: extracción por horas/sede, JSON manual, Excel de tiempos, fases manuales, diagnóstico, composición parcial, limpieza y asistente. Se conserva funcionalidad; no se exige conocer estas herramientas para el caso normal.

Al finalizar se muestran **Ver tiempos**, **Ver resumen ejecutivo**, **Ver anomalías**. No navegar automáticamente. Los indicadores/reportes conservan una barra compacta de período activo con **Cambiar período**, que lleva a Datos. No tienen otro formulario de fechas del período global. Filtros de día/franja dentro de un resultado siguen siendo filtros propios.

## Reglas de ejecución

- Leer `CONTRATO.md` y la ficha actual. Inventario de funciones en `../INVENTARIO.md`.
- Una ficha = un commit; ejecutar en el orden indicado. No stagear cambios ajenos.
- No instalar librerías nuevas. React, TypeScript, Tailwind y el kit `components/ui` bastan.
- No cambiar cálculo ETL, clasificación, catálogo, cuartos de día ni modelo de movimientos. No tocar credenciales DSS, puente go2rtc, mapas, coordenadas ni APIs de cámaras.
- No declarar «sin cambios» porque los tests ya fallaban: comparar firmas de fallos. Los fallos nuevos se arreglan en la ficha que los introduce.
- No hacer llamadas reales de extracción/reproceso para probar durante implementación: usar mocks para escritura y datos guardados para prueba visual. La UI queda habilitada para que el usuario ejecute sus acciones normales.
- Si el repo no coincide con un ancla o contrato, parar esa ficha y reportar el punto exacto. No adivinar paths, fuentes ni semánticas.
- Actualizar `ESTADO.md` al terminar cada ficha con commit, comandos, resultado y pendientes.

## Orden y costo estimado (no consumo medido)

- R01 · Carga completa de tablas paginadas: 3 k tokens. Primero; evita truncar evidencia.
- R02 · Disponibilidad real de fuentes en disco: 6 k.
- R03 · Estado y plan de preparación: 5 k.
- R04 · Cola de descarga/preparación/reintento: 8 k.
- R05 · Integración única con el contexto: 6 k.
- R06 · Pantalla Datos y barra compacta: 6 k.
- R07 · Herramientas avanzadas y migración de acciones: 5 k.
- R08 · Rutas, entradas antiguas y textos: 3 k.
- R09 · Informe ejecutivo sin pantalla Transform: 3 k.
- R10 · Consistencia visual y Home: 5 k.
- R11 · Verificación final y entrega: 5 k.

Total estimado: **55 k tokens** de implementación especificada para agente económico. Diseño/contratos decididos aquí. No ejecutar todas las fichas en paralelo: R01→R02→R03→R04→R05→R06→R07→R08→R09→R10→R11. R01 y R02 pueden desarrollarse en ramas aisladas, pero fusionar y verificar antes de R03.

## Línea base y trabajo concurrente

El último informe registra 191 errores TypeScript, arquitectura OK y siete fallos semánticos ETL en cuatro archivos; los timeouts iniciales desaparecieron con dos workers. Volver a medir, porque hay cambios posteriores del usuario. Comandos exactos en R11.

Al iniciar este paquete había cambios ajenos en `.gitignore`, `ETL_CLASSIFICATION_MATRIX.csv`, README/RESUMEN eliminados, plano/JSON, `server/dss-live.mjs`, servidor local, `src/App.tsx` (editor), `SeguridadTab.tsx`; archivos nuevos del editor de plano, captura DSS, supervisor y configuración de agentes. Verificar git status actual, no restaurar ni commitear esos cambios por accidente.

## Lo que queda eliminado / lo que se conserva

- Eliminados del flujo final: pantalla técnica Transform, selección repetida del rango, botones competidores «Cargar período»/«Cargar rango»/«Procesar todo» en la vista normal, promesas de tareas futuras.
- Conservados: cálculos, tablas, exports, diagnóstico, carga manual, modo por horas/sede, composición parcial señalizada, cámaras, NVAi, filtros locales y editor de plano. Los detalles técnicos están en Avanzado; los resultados ejecutivos están en Reportes.
