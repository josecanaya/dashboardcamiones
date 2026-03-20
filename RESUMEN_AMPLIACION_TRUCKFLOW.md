# Resumen de ampliación Truckflow

## Qué se agregó

### Nuevas páginas
- **AnalyticsPage** (Análisis → KPIs): KPIs operativos ampliados con secciones expandibles:
  - KPI 1 — Tiempo de estadía: n, promedio, mediana, mín, máx, σ, P90, P95, IQR; scatter duración vs hora de ingreso; serie temporal promedio por día
  - KPI 2 — Variabilidad: σ, CV, alto desvío, outliers
  - KPI 3 — Flujo: ingresos/egresos/simultáneos por hora
  - KPI 4 — Densidad por sector: camiones y duración media por sector
  - Estadísticas por turno operativo
  - Cruces analíticos: duración promedio por circuito
- **ComitePage** (Análisis → Comité): Vista para reunión con KPIs principales, conclusiones automáticas, flujo y densidad
- **ComparativoPage** (Análisis → Comparativo): Ricardone vs San Lorenzo vs Avellaneda (tiempo promedio, CV, flujo, tabla resumen)

### Nuevos servicios y utilidades
- **`src/utils/stats.ts`**: mean, median, mode, min, max, std, coefficientOfVariation, percentile, p90, p95, iqr, zScore, classifyOutlier, detectOutliersIqr, detectOutliersZScore, gaussianCurvePoints, histogramBins
- **`src/utils/chartExport.ts`**: exportChartAsPng, exportChartAsSvg, exportChartDataAsCsv, safeExportFilename, buildExportSubtitle
- **`src/config/operationalShifts.ts`**: turnos mañana/tarde/noche configurables
- **`src/services/analyticsKpi.ts`**: computeStayTimeStats, computeVariabilityStats, computeHourlyFlow, computeSectorDensity, crossDurationByPlantCircuit, statsByShift, scatterDurationVsHour, dailyStayMean
- **`src/components/charts/ChartExportButtons.tsx`**: componente reutilizable con botones PNG, SVG, CSV

### Modelo de datos extendido
- **HistoricalTrip**: `productType?: string`, `dominantSector?: string` (opcionales, preparados para futuro)

### Navegación
- Nueva sección **Análisis** en el menú lateral con sub-opciones: KPIs, Comité, Comparativo

---

## Qué se reutilizó

- **useHistoricalPageData**: para filtrar viajes por planta, período y vista
- **LogisticsOpsContext**: historicalTrips, operationalAlerts
- **SITES** y **SiteId** del dominio
- **Recharts** (BarChart, LineChart, ScatterChart, etc.) ya usados en el proyecto
- **HistoricalOperationalPage**: mantiene histograma, pie, barras y tabla existentes; se añadieron ChartExportButtons a los gráficos
- **HomePage**: se añadieron ChartExportButtons a los 3 gráficos (actividad, clasificación, alertas)

---

## Supuestos realizados

1. **Turnos operativos**: mañana 6–14h, tarde 14–22h, noche 22–6h (configurable en `operationalShifts.ts`)
2. **Densidad por sector**: se usa el último sector de `secuenciaSectores` o inferido de `secuenciaCamaras`; no hay m² reales por sector (Nivel 1 del documento)
3. **Flujo simultáneos**: se infiere como acumulado ingresos − egresos por hora (no hay serie histórica directa de camiones en planta)
4. **Tipo de producto**: campo opcional; filtros y estructuras preparados pero no visibles hasta que exista dato
5. **Comparativo**: usa todos los historicalTrips cargados (sin filtro de período adicional)
6. **Comité**: usa vista semanal por defecto

---

## Datos faltantes para la versión ideal

- **m² por sector**: para densidad real (Nivel 3)
- **Capacidad estimada por sector**: para densidad relativa (Nivel 2)
- **Serie histórica de camiones simultáneos**: hoy se infiere
- **Tipo de producto** en el mock: `productType` en HistoricalTrip
- **Sector dominante** en el mock: `dominantSector` o inferible desde secuencia
- **Variación vs período anterior**: requiere datos históricos de períodos previos
- **Tendencia**: requiere series temporales más largas

---

## Gráficos exportables (PNG, SVG, CSV)

| Ubicación | Gráfico | Exportación |
|-----------|---------|-------------|
| Home | Actividad por tiempo | ✅ PNG, SVG, CSV |
| Home | Circuitos por planta | ✅ PNG, SVG, CSV |
| Home | Alertas por severidad | ✅ PNG, SVG, CSV |
| Histórico | Histograma tiempo estadía | ✅ PNG, SVG, CSV |
| Histórico | Clasificación (pie) | ✅ PNG, SVG, CSV |
| Histórico | Recorridos por tipo (barras) | ✅ PNG, SVG, CSV |
| Análisis KPIs | Scatter duración vs hora | ✅ PNG, SVG, CSV |
| Análisis KPIs | Serie temporal promedio/día | ✅ PNG, SVG, CSV |
| Análisis KPIs | Flujo por hora | ✅ PNG, SVG, CSV |
| Análisis KPIs | Densidad por sector | ✅ PNG, SVG, CSV |
| Análisis KPIs | Estadía por turno | ✅ PNG, SVG, CSV |
| Análisis KPIs | Duración por circuito | ✅ PNG, SVG, CSV |
| Comité | Flujo por hora | ✅ PNG, SVG, CSV |
| Comité | Densidad por sector | ✅ PNG, SVG, CSV |
| Comparativo | Tiempo promedio por planta | ✅ PNG, SVG, CSV |
| Comparativo | CV por planta | ✅ PNG, SVG, CSV |
| Comparativo | Flujo por planta | ✅ PNG, SVG, CSV |

---

## Cómo usar la exportación de gráficos

1. Cada gráfico con exportación tiene botones PNG, SVG y CSV en la esquina superior derecha.
2. **PNG**: imagen de alta resolución (2x) para pegar en PowerPoint.
3. **SVG**: vector para escalado sin pérdida.
4. **CSV**: datos del gráfico con metadatos (planta, período, fecha de generación) en comentarios.
5. Los archivos se descargan con nombres como `prefix_YYYYMMDD_HHMM.ext`.

---

## Archivos creados o modificados

| Archivo | Acción |
|---------|--------|
| `src/utils/stats.ts` | Creado |
| `src/utils/chartExport.ts` | Creado |
| `src/config/operationalShifts.ts` | Creado |
| `src/components/charts/ChartExportButtons.tsx` | Creado |
| `src/services/analyticsKpi.ts` | Creado |
| `src/pages/AnalyticsPage.tsx` | Creado |
| `src/pages/ComitePage.tsx` | Creado |
| `src/pages/ComparativoPage.tsx` | Creado |
| `src/domain/logistics.ts` | Modificado (productType, dominantSector) |
| `src/App.tsx` | Modificado (navegación Análisis) |
| `src/pages/HomePage.tsx` | Modificado (ChartExportButtons) |
| `src/pages/HistoricalOperationalPage.tsx` | Modificado (ChartExportButtons) |
| `package.json` | Modificado (html-to-image) |

---

## Compatibilidad

- ✅ No se eliminó ninguna funcionalidad existente
- ✅ Compatible con Ricardone, San Lorenzo y Avellaneda
- ✅ Escenarios live, march_full y normal sin cambios
- ✅ Visor 3D y monitoreo en vivo intactos
