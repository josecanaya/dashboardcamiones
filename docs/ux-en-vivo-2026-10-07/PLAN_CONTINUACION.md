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
| 06 concurrencia | 🟡 versión (`expectedVersion`) → 409 conflicto. **Falta:** reserva/«lo está atendiendo X» | service.mjs |
| 07 reubicar/quitar inmediato | ✅ prepara + confirma con origen/destino | PlantHome `MapContextPanel` |
| 08 no puedo determinar | ✅ `defer` con motivo; descarte exige motivo | ReviewCandidates, service.mjs |
| 09 «última foto» | ✅ «anterior/posterior» + diferencia temporal | PlateVerification |
| 10 hora operativa vs cámara | ✅ ambas + `diffMs` + aviso si DSS devolvió otra patente | PlateVerification |
| 11 zoom | 🟡 zoom por clic dentro del diálogo. **Falta:** zoom coordinado, arrastre | PlateVerification `ZoomImage` |
| 12 porcentajes | ✅ «Apoyo del modelo» + factores + frase si discrepan | PlateVerification |
| 13 «otro camión» | ✅ «Ningún candidato listado» | ReviewCandidates |
| 14 5 vs 3 candidatos | ✅ «N sugeridos de M evaluados» + Ver todos | ReviewCandidates |
| 15 atributos como hechos | 🟡 rotulado «Detectado por cámara», traducción mínima. **Falta:** marcar atributo incorrecto | PlateVerification |
| 16 recuperación evidencia | 🟡 error de imagen + reintentar evidencia. **Falta:** avisar «probabilidad sin atributos» por candidato | |
| 17 «al día» con filtro | ✅ estados separados, «0 de N», Limpiar filtros | IdentificationPanel |
| 18 prioridad | 🟡 orden elegible (antigüedad/recientes/punto) + «hace X». **Falta:** reglas de prioridad acordadas con planta | |
| 19 sesión al cambiar vista | ✅ cola/filtros/selección en sessionStorage. **Falta:** borrador de patente escrita, «Volver al caso» desde cámaras | |
| 20 siguiente caso | 🟡 recibo con lectura→patente, punto, hora, alcance y siguiente anunciado. **Falta:** «Confirmar y permanecer» | |
| 21 turnos | 🟡 `VITE_SHIFT_HOURS`, motivo + intentos visibles en pendientes. **Falta:** nota de relevo / responsable | |
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
| 35 frescura percibida | 🟡 bandeja muestra hora de respuesta por planta. **Falta:** `useLivePlantState` / cabecera por fuente | |
| 36 versión evidencia | ⬜ pendiente | identificationEvidence.mjs, dssPhotoLookup.mjs |
| 37 feed compacto | ✅ resumen + «Abrir caso» (abre la bandeja en ese caso) | LiveActivityFeed |
| 38 vocabulario | 🟡 feed/bandeja unificados. **Falta:** códigos de cámara → nombres humanos en todas las vistas | |
| 39 densidad/atajos | ⬜ pendiente | |
| 40 aprendizaje | 🟡 log con opId, motivo, versión previa. **Falta:** congelar evidencia (fotos) usada al decidir, separar pruebas | |

## Tareas restantes (orden sugerido)

### Fáciles — aptas para un agente más barato (Sonnet/Haiku)
1. **EV-20 «Confirmar y permanecer»**: en `IdentificationPanel.decide`, opción para no saltar al siguiente (`patch({selected: row.key})`). Botón secundario en el footer de `PlateVerification`.
2. **EV-19 borrador**: guardar `typed` de `ReviewCandidates` en sessionStorage por `fragmentKey`.
3. **EV-38 nombres**: reemplazar `deviceCode` visible por `nodeLabel` + código chico copiable en `IdentificationPanel` (header del caso) y `ReviewCandidates`.
4. **EV-39 tamaños**: subir textos de 11px→12/13px en `identificationDesk.css` y `ReviewCandidates`; probar 125% de zoom.
5. **EV-11 zoom coordinado**: estado de zoom compartido opcional entre las dos `VerificationPhoto` (checkbox «zoom sincronizado»).
6. **EV-15 marcar atributo incorrecto**: botón «✗ mal detectado» por chip de comparación; mandar `attrFlags` en el body de confirm y guardarlo en el log (service.mjs ya guarda body extra solo si se agrega al JSON del log).

### Medias — conviene el mismo nivel que este trabajo
7. **EV-06 reserva**: `POST /live/identifications/:fk/claim` con TTL 2 min y operador; mostrar «en revisión por X».
8. **EV-36 versión de evidencia**: hash de candidatos en `identifyRaw` (`item.evidenceVersion`), devolverlo en `/evidence`; el diálogo avisa si cambió.
9. **EV-21 relevo**: nota libre por caso (`action: 'note'` que no cambia nivel) visible en la cola.
10. **EV-35 cabecera por fuente**: `useLivePlantState` exponer hora del último evento de cámara (no de recepción) y mostrarla en el hero.

### Requieren definición de negocio (no implementar sin respuesta)
- EV-18 reglas de prioridad · EV-28 estados de zona · EV-40 retención de fotos y circuito de entrenamiento · quién puede descartar/confirmar sin foto.

## Verificación hecha (7/10)
- `tsc` sin errores en archivos tocados; `node --test server/plantState/identificationArchive.test.mjs` 2/2.
- Navegador: Ambas → Colas → Playa OSL muestra «San Lorenzo · Playa OSL» en la misma vista; diálogo con OK bloqueado hasta cargar fotos,
  referencia «Primera lectura válida posterior… 2 h 20 min después», gemela listada sin marcar; Escape cierra; modal de cámaras con `<dialog>`.
- **No probado**: guardar decisiones contra el servidor nuevo (no se reinició el servidor del usuario ni se guardaron decisiones reales).
  Pruebas A11–A17, A23 pendientes con datos de prueba tras reiniciar.
