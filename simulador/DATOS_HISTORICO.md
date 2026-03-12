# Estrategia de datos históricos

## Archivos por planta (resiliencia)

- **historico_recorridos_ricardone.json**
- **historico_recorridos_san_lorenzo.json**
- **historico_recorridos_avellaneda.json**

Si falla una planta, las demás siguen cargando. El dashboard usa `Promise.allSettled` para cargar las 3 en paralelo.

## Límite por planta

- Máximo **50.000 viajes** por archivo (50k × 3 = 150k total).
- Cuando se supera, los más antiguos se archivan al archivo mensual de esa planta.

## Copia mensual exacta (al reiniciar mes)

- **historico_YYYY_MM.json** (ej: `historico_2026_03.json`)
- Se crea automáticamente cuando el reloj simulado cruza a un nuevo mes (ej: 31 mar → 1 abr).
- **Copia exacta** del histórico de las 3 plantas: mismo formato completo (visitedSectors, expectedSequence, etc.).
- Para análisis de meses completos a futuro.

## Archivos de recorte (cuando se supera 75k por planta)

- **historico_archivo_YYYY_MM_ricardone.json**
- **historico_archivo_YYYY_MM_san_lorenzo.json**
- **historico_archivo_YYYY_MM_avellaneda.json**

Datos mínimos para gráficas cuando se recorta. **Campos**: tripId, truckId, plate, plant, circuitCode, fecha, egresoAt, durationMinutes, classification.

## Uso a futuro (3–6 meses)

Para análisis de varios meses:

1. Cargar los archivos `historico_archivo_YYYY_MM.json` del rango deseado.
2. Combinar los arrays `data` de cada archivo.
3. Filtrar por `fecha` para gráficas por día/semana/mes.
4. Agregar por planta, circuito, etc.

### Ejemplo de carga (futuro)

```javascript
// Cargar archivos de marzo 2026, las 3 plantas
const plantas = ['ricardone', 'san_lorenzo', 'avellaneda']
const todos = await Promise.allSettled(
  plantas.map(p => fetch(`/mock-data/live/historico_archivo_2026_03_${p}.json`).then(r => r.json()))
)
const viajes = todos
  .filter(r => r.status === 'fulfilled')
  .flatMap(r => (r.value?.data ?? []))
// Filtrar por fecha, agrupar por planta, etc.
```

## Ajustar el límite

En `simulador/src/engine/liveSimulation.ts`:

```ts
const MAX_TRIPS_POR_PLANTA = 50_000  // Por planta (75k si el archivo lo aguanta)
```
