# Datos de ejemplo (samples)

Archivos CSV ficticios para probar el pipeline de importación sin depender del sistema real de planta.

## Ubicación

Los CSV están en `public/samples/` para poder cargarlos por URL en la app:

- `ricardone.csv`
- `san_lorenzo.csv`
- `avellaneda.csv`

## Columnas de ejemplo

Todos los archivos usan el mismo esquema de columnas (los nombres pueden variar en exports reales; el mapeo se hace en la pantalla Importar):

| Columna    | Descripción                          | Ejemplo              |
|-----------|--------------------------------------|----------------------|
| timestamp | Fecha y hora del evento (ISO o compatible) | 2024-02-06T07:15:00 |
| event     | Tipo de evento / estado              | Ingreso, Calada, Pesaje entrada, etc. |
| location  | Sector o ubicación lógica            | GATE, SCALE_IN, SAMPLE_BAY_A, PIT_1, etc. |
| visitId   | Identificador de visita (ticket, nro turno) | ric-001, sl-002   |
| plate     | Patente del camión                   | AB 123 CD            |
| docNumber | Número de documento (carta de porte, remito) | CP-2024-001    |
| product   | Producto declarado                   | SOJA, GIRASOL, ACEITE |

## Cómo mapear en la app

1. Ir a **Importar** y elegir la planta (Ricardone, San Lorenzo o Avellaneda).
2. Subir el CSV (o arrastrarlo).
3. En "Mapear columnas":
   - **Fecha/hora** → `timestamp`
   - **Evento / Estado** → `event`
   - **Ubicación / Sector** → `location`
   - **ID visita** → `visitId`
   - **Patente** → `plate`
   - **Nro documento** → `docNumber`
   - **Producto** → `product`
4. Clic en **Procesar**.

El mapeo se guarda en `localStorage` por planta y por “tipo” de archivo (hash de encabezados), así la próxima vez que subas un archivo con las mismas columnas se rellena solo.

## Contenido de cada archivo

- **ricardone.csv**: varias visitas SOLID (soja, girasol), una LIQUID (aceite), una REJECTED (lab rechazado, egreso sin descarga), una con OBSERVED → recalada → APPROVED, y **una visita con anomalía intencional** (descarga sin calada, visitId `ric-anom`) para validar el panel de anomalías.
- **san_lorenzo.csv**: visitas SOLID, LIQUID y una OPEN (sin EXIT).
- **avellaneda.csv**: una visita SOLID cerrada y una LIQUID en curso (OPEN).

## Diccionarios de normalización

Si los exports reales usan otros textos (ej: "CALADO", "MUESTRA", "Portería"), se pueden agregar sinónimos en:

- `src/normalize/dictionaries.ts` → `EVENT_SYNONYMS` y `LOCATION_SYNONYMS`

Así el mismo pipeline sirve para distintos formatos de exportación.
