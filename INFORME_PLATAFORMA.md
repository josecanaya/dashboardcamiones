# Informe rápido: Plataforma Truckflow (Trazabilidad Camiones)

## Qué es
Dashboard de trazabilidad operativa para camiones en plantas industriales. Multi-planta: **Ricardone**, **San Lorenzo**, **Avellaneda**.

---

## Módulos principales

### 1. Home (resumen)
- **KPIs por planta**: camiones activos en planta, alertas abiertas, cerrados hoy
- **Actividad por tiempo**: barra por día/semana/mes (D1–D7 o S1–S4)
- **Clasificación de viajes**: Circuitos completos / Variaciones operativas / Anómalos
- **Alertas por severidad**: Críticas, Altas, Medias

### 2. Monitoreo (planta en vivo)
- Camiones en planta en tiempo real
- Visor 3D (IFC) con sectores y cámaras
- Secuencia de cámaras por camión
- Ubicación en planta

### 3. Histórico operacional
- **Estadísticas**:
  - Histograma de tiempo de estadía (horas, bins de 0.1 h)
  - Curva de Gauss teórica
  - Estadísticas: n, promedio, mediana, moda, desvío estándar
  - Filtros: día / semana / mes
  - Clasificación por tipo de circuito (recepción, despacho, transile)
  - Gráfico de puntos por hora de ingreso
- **Registros**: tabla de viajes con patente, circuito, duración, fecha

### 4. Alertas
- Alertas operativas por severidad
- Tipos: FUERA_CIRCUITO, PERDIDA_TRAZABILIDAD, EXCESO_TIEMPO_SECTOR, etc.

### 5. Planificación
- Demanda / planificación (estructura básica)

---

## Entidades de datos

| Entidad | Campos principales |
|---------|---------------------|
| **HistoricalTrip** | `plate`, `circuitoFinal`, `ingresoAt`, `egresoAt`, `durationMinutes`, `estadoFinal` (VALIDADO/CON_OBSERVACIONES/ANOMALO), `siteId` |
| **TruckInPlant** | `plate`, `circuitoEstimado`, `sectorActual`, `camaraActual`, `ingresoAt`, `estadoOperativo` |
| **OperationalAlert** | `type`, `severity`, `status`, `plate`, `camionId` |

---

## Escenarios de datos
- **live**: datos simulados en tiempo real
- **march_full**: histórico marzo 2026 (~45.000 viajes diversificados)
- **normal**: datos pre-generados (~100 viajes)

---

## Fuentes de datos
JSON mock en `/mock-data/{escenario}/{planta}/`:
- `historico_recorridos.json` (viajes)
- `camiones_en_planta.json` (camiones activos)
- `alertas_operativas.json`
- `camera_events_enriched.json`

---

## Métricas actuales
- Tiempo de estadía (min/h)
- Distribución de tiempos (histograma)
- Promedio, mediana, moda, desvío estándar
- Conteo por circuito (recepción, despacho, transile)
- Clasificación por estado (validado, observaciones, anómalo)
- Alertas por severidad

---

## Para pensar métricas
- Hay datos de **viajes** (ingreso, egreso, duración, circuito)
- Hay datos de **camiones en planta** (sector, cámara, estado)
- Hay **alertas** por tipo y severidad
- Se puede filtrar por **planta**, **día/semana/mes**, **circuito**
