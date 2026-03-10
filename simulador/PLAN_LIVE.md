# Plan: Simulador en vivo – "Las 3 plantas funcionando"

## Objetivo

Encender el simulador en modo servicio y simular que Ricardone, San Lorenzo y Avellaneda operan en tiempo real. Los datos fluyen al histórico y se acumulan con el tiempo.

---

## Estado actual

| Componente | Comportamiento |
|------------|----------------|
| **Simulador (service)** | Cada tick (ej. 20s) ejecuta `runSimulation(scenario)` y **regenera todo** desde cero |
| **buildScenario** | Genera todos los steps de una vez (snapshot estático) |
| **simulation.ts** | Escribe JSON sobrescribiendo: historico, camiones_en_planta, etc. |
| **Dashboard** | Lee JSON cada 15s. No hay acumulación ni estado entre ticks |

**Problema**: Cada tick reemplaza el historico. No hay “plantas funcionando” en el tiempo, solo snapshots estáticos.

---

## Arquitectura propuesta

### Flujo de datos

```
[Simulador LIVE]
    │
    ├─► Cada tick: genera NUEVOS eventos (trucks entrando, pasando sectores)
    │
    ├─► historico_recorridos.json: LEE existente → APPENDE nuevos viajes completados → ESCRIBE
    │
    ├─► camiones_en_planta.json: trucks que están "en curso" (no completaron)
    │
    ├─► raw/enriched events: últimos eventos (opcional, para trazabilidad)
    │
    └─► alertas_operativas.json: alertas activas
```

### Modelo de tiempo

- **Opción A – Tiempo real**: 1 tick = 20s reales. Con ~1 truck/min por planta, cada tick habría ~0.3 trucks nuevos. Poco visible.
- **Opción B – Tiempo acelerado**: 1 tick = 5 min simulados. Cada tick avanza el “reloj” y genera eventos que “deberían” haber ocurrido en esos 5 min.
- **Opción C – Batch por tick**: Cada tick genera un lote fijo (ej. 5–15 trucks) con timestamps “ahora”. Más simple, buena visibilidad.

**Recomendación**: Empezar con **Opción C** (batch por tick) para validar el flujo. Luego se puede pasar a tiempo acelerado si hace falta.

---

## Fases de implementación

### Fase 1: Escenario `live` + acumulación en histórico

1. **Nuevo escenario `live`** en el simulador.
2. **Modo “append” en historico**:
   - Si existe `historico_recorridos.json`, leerlo.
   - Cada tick genera un batch de viajes completados (ej. 5–15 trucks repartidos en las 3 plantas).
   - Concatenar: `historicoExistente + nuevosViajes`.
   - Escribir el archivo actualizado.
3. **`camiones_en_planta`**: trucks que en este tick están “en curso” (por ejemplo, los que acaban de entrar y aún no terminaron). Puede ser un subconjunto del batch actual.
4. **Service**: Añadir soporte para `--scenario=live` y usar el flujo de append.

**Resultado**: Al correr el simulador en `live`, el historico crece tick a tick. El dashboard ve más viajes cada vez que recarga.

---

### Fase 2: Trucks “en planta” realistas

1. **Estado por truck**: Cada truck tiene una secuencia de sectores y un índice “actual”.
2. **Por tick**:
   - Avanzar trucks en curso (mover índice de sector).
   - Los que llegan al último sector → pasar a histórico, sacar de “en planta”.
   - Generar nuevos ingresos según tasa (700/500/250 por día).
3. **`camiones_en_planta`**: Solo trucks con `currentSector !== lastSector` (aún no completaron).

**Resultado**: Se ve movimiento real: trucks entrando, circulando y saliendo al histórico.

---

### Fase 3: Eventos de cámara (raw/enriched)

1. Por cada avance de sector, generar eventos ANPR con `snapshotTime` coherente.
2. Mantener `raw_camera_events` y `camera_events_enriched` como “últimos N eventos” o ventana deslizante.
3. Opcional: el dashboard puede mostrar una cola de eventos recientes.

---

## Decisiones a tomar

1. **¿Empezar con Fase 1 (append simple) o ir directo a Fase 2?**  
   - Fase 1 es más rápida de implementar y valida el flujo de acumulación.

2. **¿Tasa por tick?**  
   - Con 1450 trucks/día ≈ 1 truck/min.  
   - Si tick = 20s: ~0.3 trucks/tick.  
   - Para ver algo cada tick: 5–10 trucks por tick (tiempo acelerado ~5–10x).

3. **¿Persistir estado del simulador?**  
   - Si se reinicia el servicio, ¿se pierde el historico? No, si siempre se lee de JSON.  
   - ¿Se pierde el estado de “trucks en curso”? Sí, a menos que se guarde en un `live_state.json`.

4. **¿Dashboard detecta modo live?**  
   - Podría reducir el intervalo de polling (ej. 5s en vez de 15s) cuando `scenario === 'live'`.

---

## Próximo paso sugerido

Implementar **Fase 1**:

1. Crear `buildLiveScenario()` que devuelve un batch pequeño de steps (ej. 10 trucks) con timestamps “now”.
2. En `simulation.ts`, si `scenario === 'live'`:
   - Leer historico existente (si hay).
   - Ejecutar buildScenario + pipeline como hoy.
   - Concatenar nuevos historicalTrips al historico leído.
   - Escribir historico combinado.
3. Añadir `live` a ScenarioName y al service.
4. Probar: `npm run simulate:start -- --scenario=live --intervalSec=10`

¿Te parece bien este plan o quieres ajustar algo antes de implementar?
