# Propuesta en vivo · Truckflow Nodo Sur (sep-2026)

Material de cierre de la propuesta interna BIMtrazer **"De medir la semana a gestionar el turno"**:
TruckFlow como base de eventos, el sistema de camiones de Vicentin como contexto y agentes
que operan en vivo.

| Archivo | Qué es |
|---|---|
| `Truckflow_Vicentin_Propuesta_en_vivo.pptx` | Deck completo (15 láminas, con notas en 4, 5, 11 y 12) |
| `modelo-nodos-nodo-sur/` | Modelo de nodos del Nodo Sur armado desde la Matriz de circuitos (explorador HTML, datos, fuente Python, imágenes). Ver su `LEEME.txt` |

## La propuesta en una lámina

- **La base.** TruckFlow ya está instalado: 60 cámaras LPR (33 Ricardone, 27 puerto), TF Edge en
  planta, TruckFlow Service en la nube, HPE con DSS. Probado punta a punta el 15/09.
- **El dato.** El 73 % del ciclo de la soja es espera (R7, semana 10–16/09, 2.557 camiones):
  245 de 334 min en playas — Playa 1 (espera para calar) 126 min, Playa OSL 119 min.
  En 13 comités el tiempo total no bajó (osciló 276–433 min).
- **La propuesta.** Enriquecer cada evento de TruckFlow con el sistema de camiones (contrato,
  cupo, producto, plataforma) y automatizar con agentes que leen solo TruckFlow.
- **Pedido.** Aprobar la fase 1 y llevarle la propuesta a Vicentin.

## Modelo de nodos · Nodo Sur

**Fuente única de verdad de nodos, cámaras y circuitos** (ver `CRUCE_NODOS_VS_ETL.md`).
33 nodos (5 playas) · 50 circuitos (R1–R35, SL1–SL15). Partió de la
Matriz de circuitos (49) con las correcciones del 29-09-2026 (R35 nuevo, Playa 1, Playa demorado, Playa OSL, Silo Chief S8, capacidades de playas).

- `datos/modelo_nodo_sur.json`: `nodes` (id `planta:nombre`, `code` S*, `devices`, `hasCamera`, circuitos que pasan),
  `edges` (`from`/`to`, `n` = circuitos que la usan), `circuits` (`id`, `cat`, `seq` de nodos).
- `datos/matriz_circuitos_parseada.json`: la matriz leída tal cual (nodos, circuitos, pasos).
- `datos/Matriz de circuitos.xlsx`: la matriz original de Vicentin.
- Regenerar: ver `LEEME.txt` (Python 3, `sur_model.py` → `sur_explorer.py`).

En el código: `src/etl-core/domain/nodoSur.ts` (generado con `node scripts/nodo-sur-sync.mjs`).
`circuitCatalog.ts` toma de ahí cada `baseSequence`; el clasificador y el tablero en vivo leen
el nodo de cada evento. Decisiones, impacto y pendientes: `CRUCE_NODOS_VS_ETL.md`.

## Arquitectura propuesta

Nodos (cámaras + tarjeta del chofer) → TF Edge → **TruckFlow** (un JSON por evento) →
Agentes → Tablero, torre y reportes. Al costado, el **Enriquecedor** lee el sistema de camiones
por SFTP o API y suma sus campos al evento. El sistema de Vicentin se lee, no se toca; los
agentes leen solo TruckFlow.

Evento enriquecido (campos reales, valores de ejemplo):

```json
{
  "journeyUid": "540e…dd64",
  "eventType": "sector_entered",
  "occurredAt": "2026-09-16T07:49:16",
  "truckPlate": "AB123CD",
  "sectorCode": "2-S2",
  "deviceCode": "RicCal03",
  "movimiento": { "nroIngreso": "…", "contrato": "…", "cupo": "…", "producto": "SOJA", "plataforma": "VOLCABLE_1" },
  "tarjeta": { "nodo": "2-S2", "coincide": true }
}
```

Recordar: la hora operativa sale de `occurredAt` (+206 min de skew del sensor), no de `createdAt`.

## Agentes · cuatro capas

1. **Acceso MCP/API** — puerta única: eventos y viajes, alertas, modelo de nodos, sistema de
   camiones. Extiende el MCP `etl` que ya tiene el repo (`.mcp.json`, `agentes/`).
2. **En vivo** (reglas por evento): Enriquecedor, Circuito, Estado de planta, Seguridad.
3. **Histórico y decisión** (por horario o a pedido): Cierre de turno, Tiempos, Carga por punto, Asesor (IA).
4. **Comunicación**: Comunicador (IA con plantilla) — informe diario, comité, avisos a la torre.

Las reglas hacen las cuentas; la IA explica y propone, nunca inventa cifras.

### Primer pack: seis agentes desde lo que ya existe

| Agente | Tipo | Qué hace | Base en el repo |
|---|---|---|---|
| Enriquecedor | reglas · en vivo | suma contrato, cupo y producto a cada evento | cruce con el Excel en el ETL (`etlTransformContractFirst.ts`) |
| Circuito | reglas · en vivo | valida cada paso contra la matriz | `circuitCatalog.ts`, `circuitVerdict.ts`, `finalCircuitScoring` |
| Estado de planta | reglas · en vivo | colas y ocupación por nodo | `server/plantState/*` (tablero en vivo) |
| Seguridad | reglas · en vivo | desvío, doble ciclo, sin cupo, cámara caída | `anomalyClassifier.ts`, `goldenAnomalyRules.ts` |
| Cierre de turno | reglas · por horario | conciliación y tablas del período | hoy `npm run etl:run` a mano |
| Comunicador | IA con plantilla | informe diario, comité y avisos | `npm run informe:diario:procesar`, `generar_pptx_comite` |

Segunda tanda (cuando haya acceso al sistema de camiones): Tiempos, Carga por punto, Asesor.

## Fases

1. **Base** — TruckFlow y tablero en AWS; catálogo y salud desde TruckFlow. Valor: una sola base, sin depender de una PC.
2. **Enriquecer** — lectura del sistema de camiones por SFTP o API; eventos enriquecidos. Valor: cero carga manual.
3. **Edge por nodo** — reintento y hora de recepción. Valor: eventos en segundos, sin pérdidas.
4. **Agentes** — reglas en vivo e IA para excepciones; torre de control asistida. Valor: menos espera en playas.

Los cambios en TF Edge y TruckFlow Service pueden usar las 20 h/mes de mantenimiento evolutivo.
Plazos y presupuesto: a estimar.

## Qué se necesita

- **De BIMtrazer:** decisión de llevar la propuesta, entorno AWS, presupuesto de API de IA.
- **De Vicentin:** acceso SFTP o API al sistema de camiones, cómo funciona la tarjeta y dónde
  se lee, un referente en la torre de control.
- **Riesgos:** acceso lento → empezar por SFTP; envíos que fallan → reintento en el Edge;
  costo de IA → solo excepciones, con tope.

## Próximo paso (reunión con Vicentin)

1. Demo del tablero en vivo con datos del día.
2. La espera en playas y cómo atacarla.
3. TruckFlow como base y el acceso al sistema de camiones.
