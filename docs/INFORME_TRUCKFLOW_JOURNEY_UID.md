# Informe — `journeyUid` abierto en API Truckflow

**Para:** equipo Truckflow / soporte técnico  
**De:** Dashboard camiones — ETL Ricardone / San Lorenzo  
**Fecha:** 2026-06-03  
**Severidad:** Alta (afecta métricas, circuitos y clasificación de anomalías)

---

## 1. Resumen ejecutivo

La API `GET /journey-event/list` devuelve, en muchos casos, **un mismo `journeyUid` (o `journeyUuid`)** para eventos que operativamente son **varios viajes distintos**: distintos días, cierres en balanza seguidos de nuevos ingresos, o huecos de muchas horas.

El dashboard y el ETL **no inventan** ese UID: lo leen del JSON y agrupan por él. Eso produce secuencias imposibles (p. ej. dos veces INGRESO → PREINGRESO → BALANZA en el mismo “viaje”) y eleva falsas anomalías.

**Mitigación en nuestro lado:** el ETL parte esos UID antes de reconstruir viajes (reglas abajo). **Solución de fondo:** Truckflow debería **cerrar el journey** al completar un ciclo o superar un umbral de tiempo.

---

## 2. Cómo reproducir

### 2.1 Consulta API

```http
GET http://138.36.237.33:8090/journey-event/list
  ?startDate=2026-05-01T00:00:00
  &endDate=2026-06-07T23:59:59
  &plate=AE785CS
```

### 2.2 Caso de referencia (patente AE785CS)

| Campo | Valor |
|--------|--------|
| **journeyUid** | `06ea3e62-505e-4a87-adfa-9dc0c572b3b8` |
| **Patente** | AE785CS |
| **Eventos en API** | 14 |
| **Días cubiertos** | 2026-05-28, 2026-05-29, 2026-05-31, 2026-06-01 |

**Viajes operativos esperados (4):**

1. **28/05** — Ingreso → Preingreso → Calada → Balanza ingreso → Balanza egreso (~09:12–11:24)  
2. **29/05** — Ingreso → Preingreso → Balanza ingreso → Balanza egreso (~13:43–20:26)  
3. **31/05–01/06** — Ingreso → Preingreso → Calada → Balanza ingreso (31/05) → Balanza egreso (01/06 00:34)  
4. (Otro UID distinto para el recorrido del 03/06 con San Lorenzo.)

**Comportamiento actual Truckflow:** los 14 eventos comparten **un solo** `journeyUid` y `sequenceNumber` 1…14 continuo.

### 2.3 Evidencia JSON (extracto API)

Archivo local de auditoría: `data/audit-AE785CS-api.json`

```json
{
  "journeyUid": "06ea3e62-505e-4a87-adfa-9dc0c572b3b8",
  "days": ["2026-05-28", "2026-05-29", "2026-05-31", "2026-06-01"],
  "eventCount": 14,
  "events": [
    { "sequenceNumber": 5, "occurredAt": "2026-05-28T11:24:31.959-03:00", "deviceCode": "RicB2Egreso" },
    { "sequenceNumber": 6, "occurredAt": "2026-05-29T13:43:50.318-03:00", "deviceCode": "RicIngCamFrente" },
    { "sequenceNumber": 9, "occurredAt": "2026-05-29T20:26:53.218-03:00", "deviceCode": "RicB2Egreso" },
    { "sequenceNumber": 10, "occurredAt": "2026-05-31T21:18:11.026-03:00", "deviceCode": "RicIngCamFrente" }
  ]
}
```

Entre el evento 5 y el 6 hay **~26 horas** y un **nuevo ingreso** tras **balanza egreso** — claramente otro viaje.

---

## 3. Magnitud (muestra mayo 2026)

Sobre exportación cruda `raw_events_api` (misma forma que la API):

| Métrica | Valor |
|---------|--------|
| journey_uid distintos | 6 347 |
| UID con eventos en **≥ 2 días** | **770** (~12 %) |
| Mismo UID: `RicB2Egreso` → luego `RicIngCamFrente` en **día distinto** | **99** casos |

Ejemplo adicional (BNL618), mismo UID `759aa424-9494-4278-add3-4d8d93a99688`:

- 2026-05-14 08:52 — `RicB2Egreso`  
- 2026-05-16 20:02 — `RicPreIngInFr` (~59 h después)

---

## 4. Impacto en negocio / KPIs

- Secuencias lógicas imposibles en un solo viaje.  
- Inflado de “anomalías” (`NO_DIFERENCIABLE_SIN_PUNTO_FUERTE`, secuencia inválida).  
- Tiempos de estadía y circuitos distorsionados (un viaje de varios días).  
- Conteos de ingresos vs journeys incoherentes.

---

## 5. Comportamiento esperado en Truckflow

Sugerimos cerrar el journey y abrir uno nuevo cuando ocurra **cualquiera** de:

1. **Cierre de ciclo:** lectura de tipo egreso operativo (`BALANZA_EGRESO` / egreso de planta) seguida, tras un margen (≥ 15 min), de `INGRESO` o `PREINGRESO`.  
2. **Inactividad prolongada:** sin eventos del camión por **≥ 6 horas** (configurable).  
3. **Opcional:** cambio de día civil **solo si** además hay hueco ≥ 6 h (no cortar viajes que solo cruzan medianoche en &lt; 6 h).

---

## 6. Mitigación implementada en nuestro ETL (mientras tanto)

Módulo: `src/services/realJourneyCycleSplit.ts`  
Integrado en: `etlTransformPipeline.ts` (antes de `reconstructRealJourneys`).

**Parte un mismo `journeyUid` de la API si:**

| Regla | Condición |
|--------|-----------|
| **Ciclo cerrado** | Punto lógico `BALANZA_EGRESO` o `EGRESO` → luego `INGRESO` o `PREINGRESO`, con ≥ 15 min entre lecturas. |
| **Hueco largo** | ≥ **6 horas** entre dos eventos consecutivos del mismo UID. |

**No parte** si el camión solo **cruzó las 00:00** con hueco **&lt; 6 h** (mismo viaje continuo de noche a madrugada).

Los segmentos quedan como `journeyUid__cycle_1`, `journeyUid__cycle_2`, … para trazabilidad.

---

## 7. Pedido formal a Truckflow

1. Confirmar si el comportamiento del UID abierto es **intencional** o un bug.  
2. Documentar reglas de apertura/cierre de journey en planta Ricardone.  
3. Evaluar corrección en backend para **cerrar journey** en los casos de la sección 5.  
4. Facilitar prueba de regresión con patente **AE785CS** y UID `06ea3e62-505e-4a87-adfa-9dc0c572b3b8`.

---

## 8. Contacto / archivos adjuntos sugeridos

- `data/audit-AE785CS-api.json` — respuesta API completa patente AE785CS  
- `tools/audit-journey-uid-multi-day.mjs` — script de conteo multi-día sobre CSV crudo  
- `tools/fetch-plate-api.mjs` — re-ejecución de consulta por patente

---

*Documento generado a partir de consulta API en vivo y exportación histórica mayo 2026.*
