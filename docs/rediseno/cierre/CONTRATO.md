# Contrato de implementación — decisiones cerradas

## 1. Una fuente de estado

Crear `features/real-truckflow/dataPreparation/` con `types.ts`, `preparationReducer.ts`, `buildPreparationPlan.ts`, `preparationRunner.ts` y `useDataPreparation.ts`. Integrarlo dentro del EtlWorkbenchProvider existente; no crear otro provider con otro resultado ETL.

Tipos obligatorios:

```ts
type DateRange = { from: string; to: string }
type SourceState = 'available' | 'missing' | 'partial' | 'error' | 'unknown'
type SourceDay = {
  day: string
  events: { state: SourceState; count: number | null; fetchedAt: string | null }
  alerts: { state: SourceState; count: number | null; fetchedAt: string | null }
}
type PreparationPhase = 'idle' | 'checking' | 'needs_sources' | 'needs_processing'
  | 'downloading' | 'processing' | 'loading' | 'ready' | 'failed' | 'interrupted'
type PreparationState = {
  draft: DateRange
  requested: DateRange | null
  active: DateRange | null
  phase: PreparationPhase
  operationId: number
  sourceDays: SourceDay[]
  missingExcelDays: string[]
  steps: { key: string; kind: 'download' | 'process' | 'load'; from: string; to: string;
    state: 'queued' | 'running' | 'done' | 'failed'; error: string | null }[]
  error: string | null
  limitations: string[]
}
```

El resultado ETL sigue en `transformResult`; no almacenarlo en reducer/localStorage. `draft` cambia al editar. `requested` es foto al iniciar. `active` cambia solo después de hidratar correctamente todas las tablas. Toda respuesta/progreso lleva operationId; si no coincide con el actual, se descarta. Lock síncrono en ref antes del primer await. Deshabilitar mutaciones legacy durante operación normal y viceversa, incluyendo cargar JSON/Excel/limpiar.

LocalStorage `truckflow.dataPreparation.v1`: solo draft/requested/phase y fecha de actualización. No guardar credenciales, URLs, archivos ni tablas. Al recargar con fase activa, convertir a interrupted; mostrar «La preparación anterior se interrumpió. Revisá disponibilidad para continuar». Reinspeccionar antes de reintentar; nunca relanzar POST automáticamente al montar. Migrar rango de `truckflow.historicalPeriod.v1` cuando no exista la clave nueva.

## 2. Inspección, sin escrituras

Consultar en paralelo listado de corridas y cobertura Excel. Verificar con resolveWindow las corridas que cubren el rango, usando máximo cuatro consultas simultáneas. Una corrida solo es vigente si resolve-window lo confirma. Guardar runId y reglas en detalles. No usar cantidad de eventos como prueba de que la carga está completa.

Si la cobertura vigente ya cubre todo el rango, plan = solo load. No exigir volver a descargar archivos crudos para abrir una corrida válida. Si falta preparar semanas, consultar disponibilidad de fuentes de esas semanas.

Semanas canónicas: usar `historicalWeeks`; no crear ventanas ad hoc. Para cada semana pendiente, verificar eventos/alertas de sus días **hasta el último día completo (ayer en America/Argentina/Buenos_Aires)** y además eventos del día previo al lunes (arrastre que ya usa el servidor). Días futuros no se descargan ni cuentan como huecos. No alterar la conversión de timestamps operativos: aquí se manejan fechas civiles de extracción.

Rango que incluye hoy o futuro: la vista normal propone y muestra explícitamente ajustar Hasta a ayer; solo aplicar al pulsar «Usar hasta ayer». Extracción de hoy/horas permanece disponible en Avanzado. Para una semana calendario todavía abierta, procesar el intervalo canónico con las fuentes hasta ayer y marcar siempre «Semana en curso · datos hasta YYYY-MM-DD». Ese límite acompaña el período activo. Una corrida de semana abierta no se etiqueta como semana completa; reinspeccionar al día siguiente. Si el runner existente no admite la semana abierta, detener R04 y documentar la respuesta real; no cambiar el ETL para forzarlo.

Excel: `getMovimientosBackupCoverage` informa días con filas, no distingue falta de archivo de un día legítimamente sin movimientos. Texto obligatorio cuando falta un día: «Sin movimientos Excel registrados; no se puede confirmar si falta el archivo». No inventar cero movimientos. Permitir subir Excel o elegir explícitamente «Continuar con cobertura Excel incompleta»; esa elección queda en limitations y acompaña resultados/exportaciones de la sesión. Por defecto no declarar el período completo con Excel desconocido.

## 3. Disponibilidad de archivos

R02 crea POST `/api/truckflow/source-availability` con body `{startDate,endDate}`, respuesta `{days: SourceDay[]}`. Leer `DATA_ROOT/YYYY-MM-DD/event-list.json` y alert-list.json; no devolver records, baseUrl ni rutas físicas.

Clasificación por archivo, en este orden:

1. No existe → missing/count null. JSON inválido, error no vacío o records no array → error/count null.
2. `queryStart/queryEnd` presentes → partial salvo que cubran explícitamente el día entero; exigir también sede global demostrable. Si falta sede en un archivo de ventana, unknown, no global implícito.
3. Export diario existente: propiedad `siteFilter` propia y null, day coincidente, endpoint correcto y records array, sin error ni query parcial → available. Sede específica → partial.
4. Archivo legacy sin evidencia de alcance → unknown, aunque tenga filas.
5. count = records.length solo para archivo legible sin error; available con [] es cero real. fetchedAt válido se conserva; ausente/inválido = null.

Extensión estrictamente de lectura; no cambiar escritores, ETL, DSS o fórmulas. `exists=true` no equivale a available.

## 4. Plan y ejecución

Orden fijo: inspect → descargas pendientes (días ascendentes) → re-inspect sources → procesar semanas pendientes (ascendentes) → resolve vigente → cargar todas las tablas → commit atómico → ready.

Las descargas usan `postTruckflowExportOneDay({day,site:'all'})`, una por vez; preservan backend/API configurados. No pasar baseUrl inventada. Como el endpoint escribe eventos y alertas juntos, si falta uno se descarga el día completo y la UI dice «Actualizar eventos y alertas del día». No afirmar que se descarga solo el archivo ausente. Para el día de arrastre, requerir eventos; si se necesita descargarlo, el endpoint igualmente obtiene ambos.

Si una descarga falla, conservar pasos completados, detener antes de procesar; CTA Reintentar pendientes. No borrar corridas ni ejecutar clearLoaded antes de éxito. Reintento reinspecciona y omite lo que ya está vigente. Los archivos partial/error/unknown elegidos para actualizar se enumeran antes del CTA; no sobrescribir silenciosamente una extracción manual bajo una etiqueta de reutilización.

Procesar con requestRunEtl; `force=true` únicamente cuando la ventana exacta existente fue resuelta stale. Las vigentes se omiten. Mantener `skipSupabase` actual. Antes de process verificar nuevamente fuentes y autorización de Excel incompleto. No encadenar loadLocalPeriod + runTransform + requestRunEtl: se usaría el cálculo dos veces. La vía automática usa runner guardado; los pasos manuales quedan en Avanzado.

Parada: ofrecer «Detener después del paso actual». No prometer cancelar el proceso del servidor: dejar terminar la llamada activa, no iniciar siguiente paso, marcar interrupted. Al cambiar de ruta la cola continúa en provider; al cerrar pestaña no hay garantía de continuidad, explicar en la fila de progreso.

Progreso: texto del paso actual y `pasos completados / pasos del plan`; dentro de un request sin progreso real usar indicador indeterminado. No porcentajes/ETA simulados. ready solo después de lectura íntegra y publicación atómica, y siempre con limitations si existen.

## 5. UI exacta

Dato disponible: chip verde «Disponible» y CTA **Abrir datos** (GETs; cero POST). Fuentes válidas sin corrida: ámbar «Requiere preparación», CTA **Preparar datos**. Fuentes faltantes/parciales/error: ámbar «Faltan fuentes», CTA **Descargar y preparar**, deshabilitada hasta resolver Excel o aceptar limitación. Fallo: rojo «No se pudo completar», CTA **Reintentar pendientes**. Error de inspección: «No se pudo comprobar disponibilidad», CTA **Revisar disponibilidad**; no confundir con fuentes ausentes.

La edición del rango no dispara escrituras. Botón **Revisar disponibilidad** inspecciona. Una vez inspeccionado, una única CTA principal ejecuta el plan elegido. Debajo de Desde/Hasta: «El período se comparte con indicadores y reportes». Distinguir en todo momento «Período elegido» y «Datos visibles» si difieren.

Fuentes: tres tarjetas (Cámaras, Excel, Procesamiento), resumen textual; detalle por día colapsado. Cero conocido visible; desconocido «sin dato». Estadísticas de cámara dicen «eventos»/«recorridos de cámara»; jamás se presentan como movimientos Excel.

Pantalla Datos no recibe formulario duplicado de HistoricalWorkspace. La barra superior fuera de Datos muestra rango activo, limitaciones y enlace Cambiar período. Mantener el provider en su ubicación actual; cambiar de ruta no remonta datos.

## 6. Apariencia decidida

Tema claro. Fondo #f8fafc, panel #ffffff, texto #0f172a, secundario #475569, borde #e2e8f0; primario #1d4ed8; éxito texto #166534/fondo #f0fdf4; aviso #92400e/#fffbeb; error #b91c1c/#fef2f2. Declarar en ui.css y consumir variables; sin otra librería o tema nuevo.

Tipografía: 12 px metadatos, 14 px controles/cuerpo, 16 px subtítulos, 24 px títulos, 28 px valores. Espaciado 4/8/12/16/24. Radio controles 8/paneles 12. Estado nunca solo color. Indicadores de carga respetan reduced-motion. En pantallas rediseñadas evitar cajas enormes sin información.

No recolorear semántica de gráficos, circuitos ni puntos de plano. Video sigue oscuro. Home conserva mapa cenital, tabs existentes y cámaras DSS; editor y puntos sin ubicar intactos.
