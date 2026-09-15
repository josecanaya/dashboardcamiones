# Inventario previo — 15-09-2026

Base: `691e40e`. Registrado antes de editar interfaz.

## AppShell (marco de todas las rutas)

- 13 enlaces, sus destinos y orden provistos por PRODUCT_SECTIONS; NavLink indica activo y usa end en `/`.
- Scroll lateral independiente; contenido con Outlet, sin cambiar montajes ni providers.
- Catálogo de patentes: launcher abre su interfaz existente; conserva búsquedas, edición y persistencia delegadas.
- Burbuja NVAi global para Ricardone; conserva apertura, cierre y conversación.
- Dos imágenes de marca inexistentes. Sustituir por identidad textual explícita, sin fabricar un logo corporativo.
- No filtra, exporta ni persiste datos por sí mismo.

## Home `/` y alias `/en-vivo`

- Snapshot en vivo, estado de conexión, antigüedad y reloj; cinco KPI (planta, ingresos/h, egresos/h, cuello de botella, P90/media).
- Plano cenital y posiciones reales; filtros de circuitos, referencias, selección de punto y apertura de cámaras.
- NVAi embebido con foco del sector, preguntas y conversación.
- Tabla de zonas filtrada por backlog/capacidad; siete columnas; seleccionar fila abre el sector de drenaje y elige zona para cámaras.
- SectorPanel: detalle, camiones/journey y apertura de cámara; cerrar vuelve al plano.
- Actividad: ingresos, egresos y balance de última hora.
- Cámaras por grupo de zona, reproducción en modal y cierre.
- Layout cargado de JSON; selección local en memoria. Sin exportación propia. No alterar efectos ni callbacks.
- Detecciones individuales: tarjeta sin fuente ni acciones. Decisión: conservar aviso de indisponibilidad, quitar promesa de una tarea futura.
- Serie horaria: no implementada. Decisión: describir alcance real de última hora, sin prometer serie diaria.

## Límites de esta intervención

Solo marco visual y textos puntuales del Home. No modificar tablas, expresiones numéricas, hooks, rutas, catálogo, coordenadas, server ni ETL. Ninguna función se elimina. La jerarquía profunda y estados de red sin snapshot quedan para después del 18.

## Estado inicial y planes vigentes

Los archivos señalados como frágiles ya están en el commit `691e40e`; no hay cambios pendientes en esos paths. No corresponde un commit vacío de respaldo. Cambios ajenos al empezar: .gitignore, README.md eliminado, RESUMEN_AMPLIACION_TRUCKFLOW.md eliminado, postcss.config.js eliminado, server/truckflow-local-server.mjs, docs/PROMPT_REDISENO_UI.md, scripts/audit-camaras-rtsp.mjs y server/go2rtc-supervisor.mjs. No incluirlos en nuestros commits.

PLAN_PLANT_STATE_EJECUCION tiene tablero de dependencias, no casillas de cierre: hay implementación observable de T11–T16, T18, T21–T22 (cliente, hook, plano, Home, rutas, panel, NVAi, navegación). Eso no certifica T01–T10/T17/T19/T20 ni su integración; siguen requiriendo auditoría específica, no reimplementación automática. S10/S3/RicS7Carga no se reposicionan.

Migración existente: PROGRESO declara fases principales completadas; 2.6 poda CSV diferida, 3.6 partición opcional omitida. Este encargo no cambia esas decisiones. No borrar los candidatos a limpieza sin auditoría individual posterior; vite-env.d.ts se conserva.

## Línea base de validación

## Ampliación autorizada — inventario previo

El usuario retiró el límite del viernes.
- Contexto: JSON manual, lectura local, Excel movimientos/tiempos, limpiar insumos, fases 1–3/KPI, caché exacta/reproceso, corridas obsoletas, composición parcial explícita, guardado de flota y carga inicial. Conservar APIs; agregar camino atómico.
- Extracción: fechas/horas/presets, sede/base URL, descarga por bloques, lista de días, conteos diarios, errores y navegación a análisis. Mantener horas propias.
- Análisis local: análisis/MCP, rango/presets, guardados/composición, lectura local/manual, Excel/backup, fases, progreso, exportaciones opcionales.
- Transform: backup, filtro producto/muestra, resumen/donuts/tablas, drilldowns, exportaciones de gráfico/listado/sospechas, diagnóstico y CSV DEV.
- KPI: ejecutar/reprocesar, checklist circuitos, cuatro vistas, día/franja/circuito, tramos, detalle/histograma/modal, CSV/imagen/PDF. Fuentes y denominadores intactos.
- Calada/Descargas: sedes/subtipos, filtro día, KPI, cámaras, gráficos, tablas/modal de patentes y exportación CSV.
- Anomalías: reglas/secuencias, lista/detalle/camión, retorno, ocultar/restaurar nodos y camiones persistidos, edición/guardado, imagen/evidencia, eventos/horarios.
- Reportes: calibración, líquidos, transiles y base; conservar componentes/acciones y gate de transform.
- DSS: stream por dispositivo, carga/error/reintento, iframe y grupos, cierre desmonta consumidores. Mantener cliente/server/credenciales/URLs.

### Evidencia inicial

- npm test: falla antes de Vitest por imports etlWorkbench de src/App.tsx y src/app/postTransformRoutes.tsx fuera de freeze.
- tsc -b: 191 errores TS; guardar diagnóstico completo y comparar al finalizar.
- App activa en localhost:5173 y servidor 8787. Captura inicial real a 1440×950, sin fixtures ni cifras inventadas.
