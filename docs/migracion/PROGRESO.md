# Progreso de la migración (rama `automatizacion`)

> El agente ejecutor marca `[x]` al completar cada paso (después del commit).
> Anotar bloqueos/decisiones en la sección Notas con fecha.

## Fase 0 — Red de seguridad
- [x] 0.1 Golden master ampliado (hash de todos los CSVs)
- [ ] 0.2 Script check-arch-rules + integrado a npm test
- [ ] 0.3 Línea base tsc documentada (TSC_BASELINE.md)

## Fase 1 — etl-core
- [ ] 1.1 etl-core/csv.ts separado de descarga browser
- [ ] 1.2 Módulos hoja movidos (timestamps, externalNormalization, rearDevices, csvParse)
- [ ] 1.3 Transiles interno/externo en etl-core/reports (piloto)
- [ ] 1.4 argentinaPlate, eventNormalization, journeyEvents.types en domain
- [ ] 1.5 pipelineTypes.ts centralizado
- [ ] 1.6 🛑 Revisión de cierre con usuario

## Fase 2 — TypedTable
- [ ] 2.1 TypedTable + test
- [ ] 2.2 Piloto transile externo emite tablas
- [ ] 2.3 EtlTransformOutput.tables
- [ ] 2.4 Panel piloto consume filas tipadas
- [ ] 2.5 Resto de claves migradas (listar acá las completadas)
- [ ] 2.6 🛑 Poda de csv interno (decisión usuario)

## Fase 3 — Catálogo único
- [ ] 3.1 circuitCatalog + test de paridad
- [ ] 3.2 🛑 R26-R32 transile externo (necesita matriz Excel del usuario)
- [ ] 3.3 EXECUTIVE_CIRCUIT_MATRIX derivada del catálogo
- [ ] 3.4 Reclasificación transile externo (propuesta → 🛑 aprobación → override)
- [ ] 3.5 circuitEtlV2 y realPreliminaryCircuit eliminados
- [ ] 3.6 etlSegmentTiming.ts particionado (opcional)

## Fase 4 — Servicio + persistencia
- [ ] 4.1 Runner headless con persistencia (runs/<runId>/)
- [ ] 4.2 Endpoints /api/etl/runs
- [ ] 4.3 Smoke test de la API
- [ ] 4.4 🛑 Decisión Supabase

## Fase 5 — Agentes Python
- [ ] 5.1 Paquete agentes/ + etl_client
- [ ] 5.2 tools.py
- [ ] 5.3 Orquestador REPL
- [ ] 5.4 Subagentes (Knowledge Truckflow → Contratos → Seguridad → Comunicador)
- [ ] 5.5 🛑 Decisión MCP / exposición

## Notas y bloqueos

- (fecha) — nota
