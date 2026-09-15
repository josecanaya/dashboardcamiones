# Criterios de aceptación — rediseño UI (15-09-2026)

Base de referencia: `691e40e` + excepción arch `12936ee`. Alcance: marco visual, período histórico compartido y secciones analíticas. **No** ETL, clasificación, DSS/credenciales ni cálculos.

## Correctitud de datos (invariantes)

1. Conteos de movimientos/producto/plataforma: `excel_operations_with_truckflow`.
2. Clasificación ejecutiva: `final_circuits.executive_bucket`.
3. Tiempos: `circuit_timing_summary` / KPI existente sin cambiar agregadores.
4. Reloj operativo: `occurredAt + 206 min` vía helper live; cuartos Q1 22–04 / Q2 04–10 / Q3 10–16 / Q4 16–22.
5. Catálogo de circuitos: `CIRCUIT_CATALOG`. Ausencia = «sin dato»; no inventar cifras.
6. Composición multi-corrida: si faltan fechas de legs, los tiempos pueden abarcar corridas completas — la UI debe explicitarlo.

## Marco y Home

- Identidad textual Truckflow / Vicentin (sin inventar logo).
- Sidebar con activo visible contenido al panel; contraste legible.
- Home: vistas plano / colas / actividad; paneles con `hidden` (no desmontar stream de datos); fila de zona operable; cámaras DSS abren modal y Cerrar desmonta reproductores.
- Errores y demoras honestos; sin promesas de serie horaria ni detecciones individuales inexistentes.

## Período histórico

- Un período activo compartido entre pantallas estadísticas.
- Intento incompleto o con error: **no** reemplaza el período activo ni muestra resultado viejo con fecha nueva; sí puede mostrar gaps del intento.
- Flujo principal no publica coberturas parciales como completas; composición parcial avanzada conserva aviso explícito.
- Corridas stale: señal visible; flujo principal exige vigencia; lectura manual stale queda como herramienta avanzada.
- Extracción toma fechas del intento faltante (`periodInspection.output === null`) o del `diskPeriod` activo.
- Cargas concurrentes: revisión de datos; respuestas viejas no pisan período nuevo.

## Pantallas analíticas

- Transform / Calada (y vistas que reutilizan el panel): bloques secundarios en Disclosure; exportaciones y handlers intactos.
- Anomalías: paginación/búsqueda sin alterar orden de dominio ni edición/ocultos.
- Al abrir un Disclosure con gráficos, se dispara `resize` para re-medir el ancho.

## Validación

- `npx tsc -b`: no aumentar el baseline de 191 errores.
- `npm test -- --maxWorkers=2` y `npm run check:arch`: no empeorar fallos semánticos preexistentes de ETL; no “arreglar” tests cambiando expectativas de dominio.
- Capturas reales (no fixtures). `home-antes` / `tiempos-antes` = pre-cambio; capturas `*-antes-secciones` ya incluyen marco nuevo.

## Fuera de alcance (pendiente explícito)

- Partición física de componentes gigantes.
- Unificación exhaustiva de tokens tipográficos en toda la app.
- Gestión de foco del diálogo de cámaras (T-03 solo etiqueta `role`/`aria-*`).
