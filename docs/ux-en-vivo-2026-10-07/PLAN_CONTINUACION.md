# Plan de continuación — UX En vivo (EV-01…EV-40)

Fecha: 7/10/2026. Base: [ANALISIS_UX_EN_VIVO.md](ANALISIS_UX_EN_VIVO.md).

**Importante:** el servidor `node server/truckflow-local-server.mjs` tiene que **reiniciarse** para tomar
los cambios de servidor (opId, versión, `defer`, `review`, `applyTo`, `GET /live/identification-ops/:opId`).
Con el servidor viejo, el front sigue funcionando pero ignora versión/alcance.

## Estado por hallazgo

| EV | Estado | Dónde |
|---|---|---|
| 01 alcance gemelas | ✅ solo se aplican las gemelas marcadas (`applyTo`), lista previa en el diálogo | service.mjs `identificationSiblings`, PlateVerification |
| 02 «leyó bien» no renombra | ✅ `journeyUid: null` por defecto; renombrar es opción explícita | ReviewCandidates, PlateVerification |
| 03 zona cruzada entre plantas | ✅ `pickZone(site, zoneId)`, columna Planta en Ambas | PlantHome |
| 04 OK antes de fotos | ✅ OK espera las dos fotos; sin foto = casilla explícita, queda registrado | PlateVerification |
| 05 guardado ambiguo | ✅ estado dentro del diálogo, `opId` idempotente, reconciliación por opId, escritura atómica, log no fatal | plantStateApi, service.mjs |
| 06 concurrencia | ✅ versión (`expectedVersion`) → 409 + reserva blanda por puesto (`/claim`, TTL 2 min) visible en cola y caso | service.mjs, IdentificationPanel |
| 07 reubicar/quitar inmediato | ✅ prepara + confirma con origen/destino | PlantHome `MapContextPanel` |
| 08 no puedo determinar | ✅ `defer` con motivo; descarte exige motivo | ReviewCandidates, service.mjs |
| 09 «última foto» | ✅ «anterior/posterior» + diferencia temporal | PlateVerification |
| 10 hora operativa vs cámara | ✅ ambas + `diffMs` + aviso si DSS devolvió otra patente | PlateVerification |
| 11 zoom | ✅ zoom por clic + opción «ampliar las dos juntas». **Falta (opcional):** arrastre | PlateVerification |
| 12 porcentajes | ✅ «Apoyo del modelo» + factores + frase si discrepan | PlateVerification |
| 13 «otro camión» | ✅ «Ningún candidato listado» | ReviewCandidates |
| 14 5 vs 3 candidatos | ✅ «N sugeridos de M evaluados» + Ver todos | ReviewCandidates |
| 15 atributos como hechos | ✅ «Detectado por cámara», traducción mínima, marcar «mal detectado» → `attrFlags` en decisión y log | PlateVerification |
| 16 recuperación evidencia | 🟡 error de imagen + reintentar evidencia. **Falta:** avisar «probabilidad sin atributos» por candidato | |
| 17 «al día» con filtro | ✅ estados separados, «0 de N», Limpiar filtros | IdentificationPanel |
| 18 prioridad | 🟡 orden elegible (antigüedad/recientes/punto) + «hace X». **Falta:** reglas de prioridad acordadas con planta | |
| 19 sesión al cambiar vista | ✅ cola/filtros/selección + borrador de patente escrita. «Abrir caso» desde el feed | IdentificationPanel, ReviewCandidates |
| 20 siguiente caso | ✅ recibo + «Confirmar y seguir» / «Confirmar y quedarme» | |
| 21 turnos | ✅ `VITE_SHIFT_HOURS`, motivo + intentos, notas de relevo por caso, nombre de operador en cada decisión. **Falta:** turnos reales acordados | |
| 22 ver resueltas | ✅ ver sin reabrir; reabrir pide motivo | IdentificationPanel `ResolvedView` |
| 23 reapertura auto | ✅ acción `review` persiste; el reconocedor y el archivo no la re-resuelven | plateIdentification, identificationArchive (+ test) |
| 24 conteos | ✅ «casos» en bandeja, «capturas (últimas 40)» en feed | |
| 25 zona sin detalle | ✅ detalle + botones de cámaras dentro de Colas | PlantHome |
| 26 Actividad vacía | ✅ selector planta/zona; se quitó el bloque «sin dato» | PlantHome |
| 27 lista de camiones | ✅ se vacía al cambiar zona, se refresca con el estado de planta, atenúa durante carga, avisa si difiere del conteo | PlantHome |
| 28 «Sin datos» | 🟡 tooltip. **Falta:** estados específicos (requiere datos del backend) | |
| 29 «En vivo» falso | 🟡 «Reproductor abierto» + Reconectar. **Falta:** detección real de cuadros (necesita API del reproductor go2rtc) | LiveCameraPlayerModal |
| 30 errores técnicos | ✅ mensaje operativo + detalle plegado | LiveCameraPlayerModal |
| 31 modales/teclado | ✅ `<dialog>` nativo en cámaras y verificación, retorno de foco | |
| 32 supervisión durante revisión | 🟡 franja de zonas en atención en la bandeja. **Falta:** cámaras fijadas | PlantHome |
| 33 polling por reloj | ✅ dependencias por contenido (`sitesKey`), `seen` acotado | LiveActivityFeed |
| 34 una planta bloquea | ✅ carga por planta, descarte de respuestas viejas, estado por planta | IdentificationPanel, LiveActivityFeed |
| 35 frescura percibida | ✅ bandeja por planta + hero con «último evento de cámara» por planta (`snapshot.source`, requiere servidor reiniciado) | service.mjs, PlantHome |
| 36 versión evidencia | ✅ candidatos congelados mientras se inspecciona; aviso «llegaron candidatos nuevos · Actualizar» | ReviewCandidates |
| 37 feed compacto | ✅ resumen + «Abrir caso» (abre la bandeja en ese caso) | LiveActivityFeed |
| 38 vocabulario | 🟡 feed/bandeja unificados. **Falta:** nombres humanos de cámara en todas las vistas (hace falta catálogo device→nombre) | |
| 39 densidad/atajos | 🟡 textos chicos subidos 1px. **Falta:** atajos de teclado y alternar candidatos sin cerrar el diálogo | |
| 40 aprendizaje | 🟡 log con opId, operador, motivo, versión previa, attrFlags, notas. **Falta:** congelar fotos usadas al decidir, separar pruebas | |

## Tareas restantes (orden sugerido)

### Fáciles — aptas para un agente más barato (Sonnet/Haiku)
1. **EV-39 alternar candidatos dentro del diálogo**: en `PlateVerification`, flechas ←/→ (o botones) que cambian `choice.candidate`
   entre los `evidence.candidates`, manteniendo fija la captura dudosa. Reiniciar `photos.ref` a `'loading'` al cambiar.
2. **EV-39 atajos**: documentar y agregar Enter = foco en «Confirmar» solo cuando `canConfirm` (nunca envío directo), Esc ya cancela.
3. **EV-38 nombres de cámara**: si existe catálogo device→nombre (ver `src/components/plant/liveOperationalCatalog.ts` o el modelo de nodos),
   mostrar nombre humano y dejar el código en `title`.
4. **EV-11 arrastre**: en `ZoomImage`, mover `transformOrigin` con pointermove mientras está ampliado.

### Medias
5. **EV-40 evidencia congelada**: al confirmar, copiar `sceneFile`/`plateFile` consultados a `data/identification-evidence/<fragmentKey>/`
   y registrar las rutas en el log (dssPhotoLookup ya descarga los archivos).
6. **EV-32 cámaras fijadas**: lista de cámaras favoritas (localStorage) en la franja de supervisión de la bandeja.

### Requieren definición de negocio (no implementar sin respuesta)
- EV-18 reglas de prioridad · EV-28 estados de zona · EV-29 detección real de cuadros (depende de go2rtc) · EV-40 retención de fotos
  y circuito de entrenamiento · turnos reales · quién puede descartar/confirmar sin foto.

## Verificación hecha (7/10)
- `tsc` sin errores en archivos tocados; `node --test server/plantState/identificationArchive.test.mjs` 2/2.
- Navegador: Ambas → Colas → Playa OSL muestra «San Lorenzo · Playa OSL» en la misma vista; diálogo con OK bloqueado hasta cargar fotos,
  referencia «Primera lectura válida posterior… 2 h 20 min después», gemela listada sin marcar; Escape cierra; modal de cámaras con `<dialog>`.
- Parte 2: `node --test server/plantState/identificationDecisions.test.mjs server/plantState/identificationArchive.test.mjs` 5/5
  (opId idempotente, conflicto de versión, motivo obligatorio, defer, notas, attrFlags, review, reserva) sobre un directorio temporal;
  vitest `plateIdentification` + `identificationEvidence` 17/17.
- **No probado**: guardar decisiones contra el servidor nuevo (no se reinició el servidor del usuario ni se guardaron decisiones reales).
  Pruebas A11–A17, A23 pendientes con datos de prueba tras reiniciar.
