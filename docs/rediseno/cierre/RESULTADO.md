# Resultado del cierre — 16-09-2026

## Alcance ejecutado

Fichas **R01 → R11** de `docs/rediseno/cierre/tareas/` procesadas en orden. Cada ficha en un
commit de código + un commit `chore(cierre)` en `docs/rediseno/cierre/ESTADO.md` con el SHA
real del commit de código. R10 se declara **parcial** (ver §Pendientes).

## Commits

| Ficha | Código          | ESTADO          |
| :---: | :-------------: | :-------------: |
| R01 | `11da843` | (mismo commit) |
| R02 | `a297f6d` | (mismo commit) |
| R03 | `06744ef` | `5573c59` (fix SHA post-amend) |
| R04 | `3c9bb8d` | `3a8c250` |
| R05 | `46143b8` | `4a9f7e7` |
| R06 | `e7a6085` | `eb453db` |
| R07 | `9f5a017` | `efe6d05` |
| R08 | `8cb6f11` | `bc34264` |
| R09 | `28461f1` | `bf5604b` |
| R10 | `268bf23` (parcial) | `7848eb5` |
| R11 | este documento + `chore(cierre): baseline fix` para ES2022 `.at` en R01 test | — |

Todos los commits usan attribution `Co-Authored-By: Claude ... <noreply@anthropic.com>` y
respetan la regla «no stagear cambios concurrentes ajenos» (editor de plano, DSS live,
supervisor go2rtc, plano de San Lorenzo, `SeguridadTab`, `.gitignore`, backups y binarios).

## Verificación

### Test suite
- `node node_modules/vitest/vitest.mjs run --maxWorkers=2` — exit 1.
- **940 / 947** tests aprobados; **7 fallos en 4 archivos**: `etlCaladaCameraActivity`,
  `etlSanLorenzoVolcableActivity`, `etlRicSanLorenzoRoute`, `etlSegmentTiming`.
- Comparación con la línea base de `docs/rediseno/cierre/ENTREGA.md` (873 pasan / 7 fallos):
  **mismos 7 fallos**, **+67 pasos nuevos** (paginación de R01 + reducer/plan/runner/
  integración/tabs de R03–R08).
- Duración observada: 164,72 s (no es una estimación).

### Chequeo de arquitectura
- `npm run check:arch` → **OK** en cada ficha.

### TypeScript
- `npx tsc -b --pretty false` → **191 errores** (misma cantidad que la línea base). Ningún
  archivo nuevo agrega errores. R11 detectó un `+1` transitorio por uso de `.at()` (ES2022)
  en `etlRunCacheApi.test.ts`, reemplazado por indexación clásica (`rows[rows.length - 1]`)
  para volver al baseline sin cambiar semántica.

## Cambios de comportamiento por ficha

- **R01** · `fetchRunTable` pagina `limit=10000` desde offset 0 hasta acumular `total`.
  Rechaza inconsistencias entre páginas y páginas vacías antes de completar. Antes truncaba
  tablas > 10 000 filas.
- **R02** · Nuevo endpoint `POST /api/truckflow/source-availability` sin efectos secundarios,
  clasifica `event-list.json` / `alert-list.json` por día con paralelismo ≤ 4. Nunca marca
  «disponible» por mera existencia; nunca asume sede global implícita. Cliente
  `postSourceAvailability` en `truckflowLocalServerApi.ts`.
- **R03** · Reducer puro `preparationReducer` + `buildPreparationPlan`. Todo evento de
  operación se descarta si `operationId` no coincide. Sólo `LOAD_SUCCEEDED` muta `active`.
  Plan sigue orden fijo download → process → load y respeta semanas canónicas (sin
  ventanas ad hoc) y arrastre del domingo.
- **R04** · `preparationRunner` + `useDataPreparation`. Lock síncrono de doble-click,
  descargas secuenciales, `force:true` sólo cuando `resolveWindow` confirma stale, publish
  atómico posterior a leer todas las tablas. `requestStop()` no cancela el request activo;
  el paso vigente termina y se descarta si un `execute` nuevo lo superó.
- **R05** · `EtlWorkbenchProvider` instancia el hook una sola vez y expone
  `Ctx.dataPreparation` + `isDataMutationBusy`. Publicación atómica compartida entre
  `activateHistoricalPeriod` y el runner. Cargas manuales (JSON/Excel/SavedWindow) bloquean
  si hay mutación en curso. Hidratación inicial: una sola inspección; nunca descarga o
  reprocesa al montar.
- **R06** · Nueva pantalla `/estadisticas/datos` (`DataWorkspace`) con cuatro bloques:
  editor de rango con presets, tarjetas de disponibilidad, panel de progreso con «Detener»
  y CTA único elegido por fase. En `ready` ofrece enlaces a KPI tiempos, Resumen y
  Anomalías. `HistoricalWorkspace` deja de mostrar el formulario en las otras rutas y
  ofrece una barra compacta con estado + `Cambiar período`.
- **R07** · `AdvancedDataTools` reúne en Disclosures los flujos legacy
  (extracción por horas/sede, análisis y fases manuales, backup Excel, asistente).
  Tabs aceptan `embedded` para ocultar sólo su encabezado duplicado. `MovimientosBackupPanel`
  reinspecciona disponibilidad vía `onIngested`. Sin duplicar handlers.
- **R08** · Sidebar consolidado en un único enlace `Datos → /estadisticas/datos`.
  URLs viejas `/extraccion`, `/analisis-local`, `/estadisticas/datos/extraccion|analisis-local`
  redirigen a `?vista=extraccion-avanzada|analisis-avanzado`. Gate de reportes sin datos
  ahora dice «Preparar datos» y linkea a Datos.
- **R09** · `TransformEtlTab` → `ExecutiveSummaryTab` (rename 99% preservado). Se retira
  el `Disclosure` que envolvía `MovimientosBackupPanel` (ya disponible en Datos avanzado).
  «Ejecutando transform…» → «Preparando datos…». Nombres internos del motor no cambian.
- **R10** *(parcial)* · Normalización de `text-[9-11.5px]` → `text-xs` y `text-[12.5|13px]`
  → `text-sm` en `ExecutiveSummaryTab` (60) y `KpiTiemposTab` (5). `plantHome.css` consume
  `var(--ui-muted)` / `var(--ui-primary)` en texto/foco. Restos abajo.

## Pendientes conscientes

Registrados aquí para R11 futuro / próximas fichas:

- **R10 restante**:
  - Sustitución `violet-* → blue-*` en `className` de elementos de interacción
    (buttons/inputs/nav) en ExecutiveSummary, KpiTiempos, Calada, CaladaCamerasPanel,
    Descargas, Seguridad. Requiere auditoría por elemento para excluir chips/etiquetas
    semánticas y constantes de datos/gráficos.
  - Remoción de encabezados de tab que dupliquen exactamente el título que ya inyecta
    `HistoricalWorkspace`. Necesita comparación textual normalizada por ruta. Seguridad
    debe conservar su header de detalle (patente/cámara).
  - Home: `—` → «sin dato» sólo donde el valor sea `null`/`undefined`. No tocar ceros ni
    denominadores. No tocar el resto de la lógica.
  - Verificación visual a 1024×768 para descartar overflow del sidebar (no se aplicó
    ajuste 208px por no estar reproducido el problema en esta sesión).
- **Cargas manuales visibles en la barra de mutaciones**: `isDataMutationBusy` toma los
  ref legacy actuales; si hay caminos aún sin instrumentar, retornarán inertes cuando
  haya operación en curso (garantía por `isDataMutationBusyRef`), pero conviene revisar
  cada `useCallback` en el provider al ampliar herramientas avanzadas.
- **Pruebas UI de la pantalla Datos**: se dejan como pendiente para una vuelta con
  Testing Library; los tests actuales cubren reducer/plan/runner e integración de mutación.

## Reversión

Cada ficha es revertible por separado con `git revert <sha>` (respetando el orden inverso
si las dependencias entre R03→R04→R05 lo requieren). El commit `chore(cierre)` de cada
ficha puede revertirse sin efecto funcional.

## Continuación

Leer `docs/rediseno/cierre/EMPEZAR_AQUI.md` para contexto general, `CONTRATO.md` para las
reglas fijas, y esta `RESULTADO.md` + `ESTADO.md` para el estado real. La rama sigue
siendo `automatizacion`; el editor de plano y demás cambios concurrentes del usuario
quedan intactos en el working tree, listos para su propio flujo de commits.
