# Mapa del informe: de dónde sale cada dato

Generado desde `reportes/logistica/prueba_manual/vinculos.json` y los catálogos de
`server/logisticsReport/reportWorkbook.mjs`. Es la referencia de qué alimenta cada lámina.

**Circuito de datos:** corrida del ETL (`runs/windows/<ventana>/tables`) → paquete del informe
(`logisticsReportPackage.ts`, o `scripts/build-report-package.ts` sin navegador) → Excel de la
revisión → `scripts/sync-informe-slides.mjs` → la hoja y la presentación en Google (una sola versión).

## Gráficos

| Lámina | ID | Título | Hoja (Excel) | Política | Fuente en el paquete |
|---|---|---|---|---|---|
| 5 | D05_G1 | Cobertura de lecturas | Soja!7–11 | retirado | — |
| 5 | D05_G2 | Distribución por circuito | Soja!16–16 | current | ejecutivo.circuitosPorProducto.SOJA |
| 15 | D15_G1 | Tiempos por planta | Soja!21–34 | current | tiempos.soja |
| 16 | D16_G1 | Volumen por cuarto de turno | Soja!39–66 | current | tiempos.soja |
| 16 | D16_G2 | Tiempo medio diario | Soja!71–77 | current | tiempos.soja |
| 17 | D17_G1 | Histórico por tramo | Soja!82–123 | historical | histórico por tramo soja (informes ya presentados) |
| 17 | D17_G2 | Histórico total | Soja!128–141 | historical | histórico total soja (informes ya presentados) |
| 20 | D20_G1 | Camiones por día del operativo | Pellet!7–8 | current | tiempos.pellet |
| 25 | D25_G1 | Tiempos por planta | Pellet!13–16 | current (parcial) | tiempos.pellet |
| 28 | D28_G1 | Cobertura de lecturas | Girasol!7–10 | retirado | — |
| 28 | D28_G2 | Distribución por circuito | Girasol!15–17 | current | ejecutivo.circuitosPorProducto.GIRASOL |
| 31 | D31_G1 | Histórico por tramo | Girasol!22–49 | historical | histórico por tramo girasol (informes ya presentados) |
| 31 | D31_G2 | Histórico total | Girasol!54–67 | historical | histórico total girasol (informes ya presentados) |
| 35 | D35_G1 | Calada semanal por calle | Calada!7–12 | current | actividad.calada_ricardone |
| 36 | D36_G1 | Calada por calle · Jueves | Calada!17–22 | current | actividad.calada_ricardone |
| 38 | D38_G1 | Calada por calle · Viernes | Calada!27–32 | current | actividad.calada_ricardone |
| 40 | D40_G1 | Calada por calle · Sábado | Calada!37–42 | current | actividad.calada_ricardone |
| 42 | D42_G1 | Calada por calle · Domingo | Calada!47–52 | current | actividad.calada_ricardone |
| 44 | D44_G1 | Calada por calle · Lunes | Calada!57–62 | current | actividad.calada_ricardone |
| 46 | D46_G1 | Calada por calle · Martes | Calada!67–72 | current | actividad.calada_ricardone |
| 48 | D48_G1 | Calada por calle · Miércoles | Calada!77–82 | current | actividad.calada_ricardone |
| 50 | D50_G1 | Calada líquidos por día | Calada!87–93 | current | actividad.calada_ricardone_liquidos |
| 51 | D51_G1 | Calada San Lorenzo por día | Calada!98–104 | current | actividad.calada_san_lorenzo |
| 53 | D53_G1 | Descargas semanales por equipo | Descargas!7–8 | current | actividad.volcable_ricardone |
| 53 | D53_G2 | Descargas diarias por equipo | Descargas!13–26 | current | actividad.volcable_ricardone |
| 55 | D55_G1 | Silos por día | Descargas!31–37 | current | actividad.silos_ricardone |
| 57 | D57_G1 | Puerto por día | Descargas!42–48 | current | actividad.volcable_san_lorenzo |
| 58 | D58_G1 | Puerto semanal por equipo | Descargas!53–57 | current | actividad.volcable_san_lorenzo |
| 59 | D59_G1 | Puerto por equipo · Jueves | Descargas!62–66 | current | actividad.volcable_san_lorenzo |
| 61 | D61_G1 | Puerto por equipo · Viernes | Descargas!71–75 | current | actividad.volcable_san_lorenzo |
| 63 | D63_G1 | Puerto por equipo · Sábado | Descargas!80–84 | current | actividad.volcable_san_lorenzo |
| 65 | D65_G1 | Puerto por equipo · Domingo | Descargas!89–93 | current | actividad.volcable_san_lorenzo |
| 67 | D67_G1 | Puerto por equipo · Lunes | Descargas!98–102 | current | actividad.volcable_san_lorenzo |
| 69 | D69_G1 | Puerto por equipo · Martes | Descargas!107–111 | current | actividad.volcable_san_lorenzo |
| 71 | D71_G1 | Puerto por equipo · Miércoles | Descargas!116–120 | current | actividad.volcable_san_lorenzo |

### Gráficos que salen directo del paquete (sin plantilla Excel)

| Láminas | Pestaña de la hoja | Qué muestran | Fuente |
|---|---|---|---|
| 37–49 (impares) | Graficos horarios | Calada Ricardone por hora, un día | `actividad.calada_ricardone.porDia[día].porHora` |
| 50, 51, 54, 56 | Graficos horarios | Curva horaria de la semana | `actividad.<sección>.periodo.porHora` |
| 60–72 (pares) | Graficos horarios | Volcables puerto por hora, un día | `actividad.volcable_san_lorenzo.porDia[día].porHora` |
| 5, 28 | Graficos circuitos | Distribución por circuito (todos los circuitos) | `ejecutivo.circuitosPorProducto` |

## Textos conectados

| Láminas | Textos | Conectados | Campo del paquete | Origen |
|---|---|---|---|---|
| 2, 3 | 8 | 4 | `periodo` | Período del informe (buildReportPeriod) |
| 2 | 18 | 0 | `—` | Índice fijo de la plantilla |
| 3 | 12 | 6 | `ejecutivo.porProducto` | final_circuits → resumen ejecutivo |
| 7 | 14 | 14 | `tiempos.soja.periodo` | circuit_timing_journeys (R7) → tramos |
| 8–14 (7) | 140 | 140 | `tiempos.soja.porDia` | circuit_timing_journeys (R7), día operativo 22:00 |
| 20 | 4 | 4 | `tiempos.pellet.porDia` | Días con camiones de pellet; toneladas: s/d (no está en el paquete) |
| 22 | 16 | 16 | `tiempos.pellet.periodo` | circuit_timing_journeys (R30/31/32) + Excel pellet |
| 23, 24 | 34 | 34 | `tiempos.pellet.porDia` | circuit_timing_journeys, día operativo 22:00 |
| 30 | 8 | 8 | `tiempos.girasol.periodo` | circuit_timing_journeys (R5+R6) |
| 34 | 22 | 9 | `actividad.<sección>.periodo` | Tabla de calada semanal (horas, camiones/h, total); encabezados fijos |
| 35–57 (6) | 21 | 21 | `actividad.<sección>.periodo` | Modelo de actividad de cámaras (calada/volcables) |
| 36–72 (28) | 28 | 28 | `periodo.days` | Día y fecha real de la lámina |
| 37–72 (14) | 56 | 56 | `actividad.<sección>.porDia` | Modelo de actividad de cámaras del día (mismo que el panel) |

## Lo que sigue siendo manual o sin fuente

- **Conclusiones** (láminas 18, 26, 32): texto escrito a mano; el sync no las toca.
- **Comparativo semana anterior** (lámina 7, "+58 Min"): requiere el paquete de la semana previa.
- **Toneladas de pellet** (lámina 20): el paquete no trae toneladas → `s/d`.
- **Históricos** (láminas 17 y 31): series ya presentadas, se conservan sin recalcular.
