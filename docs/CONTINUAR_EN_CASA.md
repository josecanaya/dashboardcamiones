# Continuación del proyecto Dashboard_camiones

Continuá el trabajo desde la rama `automatizacion` del repositorio
`https://github.com/josecanaya/dashboardcamiones`.

Antes de trabajar, ejecutá:

```powershell
git switch automatizacion
git pull origin automatizacion
npm install
```

## Contexto del trabajo

El proyecto analiza la logística de camiones de Ricardone / Puerto San Lorenzo.
La presentación del comité debe mantener los mismos lineamientos visuales y
ejecutivos de las presentaciones existentes. El desglose principal debe ser:

- Soja
- Pellet
- Girasol
- Líquidos

Para Líquidos, incluir también tiempos por tramo del circuito y utilizar las
tablas canónicas del ETL. No inventar cifras, recorridos ni patentes.

## Cuatro presentaciones originales

Las cuatro presentaciones iniciales viajaron en el repositorio:

1. `artifacts/claude_import/Comité de Logística Nodo Sur · Semana 24–30 sep.pptx`
2. `artifacts/claude_import/Comité de Seguridad · Semana 24–30 sep.pptx`
3. `artifacts/claude_import/Reconocimiento de cámaras · Septiembre.pptx`
4. `artifacts/claude_import/Reeingeniería logística del Nodo Sur.pptx`

También existen las revisiones `v2` y `v3` del reconocimiento de cámaras.

## Presentación de logística actualizada

Usar como versión de trabajo más reciente:

`artifacts/codex/Comité de Logística Nodo Sur · Semana 24–30 sep · líquidos final.pptx`

Las versiones intermedias con Líquidos también están en `artifacts/codex/`.

## Corridas disponibles

Las corridas necesarias quedaron versionadas en:

- `runs/windows/2026-09-21_2026-09-27/`
- `runs/windows/2026-09-28_2026-10-04/`

Para responder preguntas o actualizar presentaciones, respetar `AGENTS.md` y
usar estas tablas canónicas:

- Movimientos/productos/plataformas: `excel_operations_with_truckflow`
- Clasificación ejecutiva: `final_circuits.executive_bucket`
- Tiempos y tramos: `circuit_timing_summary`

Siempre indicar el denominador utilizado y citar `run_id`, `rulesVersion` y las
tablas consultadas.

## Prompt para iniciar el chat

> Leé `AGENTS.md` y `docs/CONTINUAR_EN_CASA.md`. Continuá el proyecto desde la
> rama `automatizacion`. Verificá primero que estén disponibles las cuatro
> presentaciones originales, la presentación final con Líquidos y las dos
> corridas versionadas. Conservá los lineamientos visuales de las presentaciones
> originales. Para el comité de logística, mantené el desglose Soja, Pellet,
> Girasol y Líquidos, e incluí los tiempos por tramo del circuito de Líquidos.
> No inventes cifras: obtenelas de las tablas canónicas indicadas en `AGENTS.md`.
