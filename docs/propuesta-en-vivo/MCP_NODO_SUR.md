# MCP del Nodo Sur — diseño

Un solo servidor MCP, **en la nube**, con **usuario y rol**. Es la puerta por la que cualquier
IA (Claude, ChatGPT u otra) y nuestros propios agentes consultan y operan la planta.
Reemplaza al prototipo local (`agentes/prototipo-mcp-local/`, rescatado de `fe76ac5`).

## Principios (heredados del prototipo)

- Las reglas de negocio viven en el server (ETL, modelo de nodos). El MCP **compone**, no recalcula.
- Tools **de dominio** (circuito, playa, camión, ventana), no CRUD de tablas.
- Toda cifra sale de una tool; tablas canónicas (`docs/RUNS_TABLAS_CANONICAS.md`).

## Qué cambia respecto del prototipo

| | Prototipo | MCP Nodo Sur |
|---|---|---|
| Transporte | stdio, local | HTTP (streamable), en la nube |
| Acceso | quien tenga la PC | OAuth, usuario + rol, auditoría por llamada |
| Datos | solo corridas históricas | modelo de nodos + estado en vivo + histórico |
| Agentes | 4 subagentes sueltos | capas 1–4 bajo un orquestador |
| Acción | ninguna | capa 4 propone → aprueba → ejecuta vía API PLC |

## Recursos (lectura, se suscriben)

- `nodo-sur://modelo` — nodos, cámaras, playas, capacidades, circuitos R1–R35 / SL1–SL15
  (`datos/modelo_nodo_sur.json`, misma fuente que `nodoSur.ts`).
- `nodo-sur://en-vivo/planta` — ocupación por nodo/playa, colas, camiones en curso
  (`/api/truckflow/live/plant-state`, `/live/stream`).
- `nodo-sur://en-vivo/camion/{patente}` y `nodo-sur://en-vivo/sector/{codigo}`.
- `nodo-sur://comites/historico` — serie de comités.

## Tools por capa

**Capa 1 — Deterministas (miden y validan).** Hoy, sobre ETL y en vivo.
`resolve_window`, `get_summary`, `query_table`, `explain_journey`, `get_circuit_catalog`,
`tiempo_por_tramo(circuito, ventana)`, `espera_por_playa(ventana)`, `capacidad_vs_uso(circuito)`,
`anomalias(ventana, regla?)`.

**Capa 2 — Predictivos (anticipan colas).**
`pronostico_cola(playa, horizonte)`, `simular_escenario(cambios)` — primero simulación de colas
sobre el grafo del modelo; después modelos aprendidos (línea de investigación tipo JEPA).

**Capa 3 — Comunicadores.**
`informe_diario(dia)`, `material_comite(semana)`, `alerta(destinatarios, mensaje)`.

**Capa 4 — Correctivos (actúan sobre el flujo).**
`proponer_accion(tipo, objetivo, motivo)` → `aprobar_accion(id)` → `ejecutar_accion(id)`.
Tipos iniciales: liberar/retener cupo en playa, habilitar barrera, re-ruteo a playa alternativa.
La ejecución llama a la **API de comandos de TruckFlow (Enesimal)**; el MCP nunca habla con un PLC directo.

## Roles

| Rol | Recursos | Capa 1 | Capa 2 | Capa 3 | Capa 4 |
|---|---|---|---|---|---|
| lector (dirección, IA de Vicentin) | sí | sí | sí | leer | ver propuestas |
| operador (torre / logística) | sí | sí | sí | sí | proponer, aprobar |
| orquestador (agente) | sí | sí | sí | sí | proponer; ejecutar solo dentro de límites |
| admin BIMtrazer | todo | | | | configurar límites |

## Escalera de autonomía (capa 4)

1. **Propone** y una persona aprueba (arranque).
2. **Actúa dentro de límites** configurados por acción (ej. cupo ±N, franja horaria).
3. **Actúa y avisa**.

Cada acción queda registrada: quién propuso, quién aprobó, límite aplicado, respuesta del PLC.

## División de trabajo

- **Enesimal — plataforma TruckFlow:** lectura de patentes, Edge por nodo, microservicios de
  eventos, integración PLC (barreras, semáforos), balanzas y fotocélulas, operación de la plataforma.
- **BIMtrazer — capa de inteligencia:** modelo de nodos, reglas y ETL versionados, estado en vivo,
  agentes capas 1–4, orquestador, MCP de dominio con roles y auditoría.
- **Dos interfaces entre ambos:** API de eventos (sube cada paso confirmado, tiempo real) y
  API de comandos (baja órdenes a barrera/semáforo/llamado, siempre con aprobación y registro).

El MCP de Enesimal (si existe) queda como fuente cruda detrás de este; la IA de Vicentin se
conecta a **un solo** MCP, el de dominio.

## Pasos

1. Portar las tools del prototipo a HTTP + OAuth sobre la API actual (capa 1 + recursos).
2. Sumar recursos del en vivo y del modelo.
3. Capa 3 (informe diario y comité ya existen como scripts).
4. Capa 2: simulador de colas sobre el grafo.
5. Capa 4 en modo "propone y aprueba" cuando esté la API de comandos.
