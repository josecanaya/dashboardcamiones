# Análisis de experiencia operativa — En vivo

**Fecha:** 7 de octubre de 2026, hora argentina.  
**Objeto:** la experiencia de un operador que supervisa varios puntos de cámara y corrige identificaciones semiautomáticas.  
**Estado:** auditoría y propuestas; este documento no implica que las mejoras estén implementadas.

## 1. Diagnóstico

La pantalla ya permite observar plantas, abrir cámaras, consultar ocupación y comparar dos fotografías antes de confirmar una patente. La base es útil, pero todavía obliga al operador a reconstruir demasiado contexto. Las prioridades de atención no están claras; algunos mensajes transmiten normalidad cuando hay trabajo oculto; y una decisión puede afectar más registros de los que se ven en la comparación.

Un puesto para operar durante horas debe responder constantemente:

1. ¿Qué necesita mi atención y en qué punto?
2. ¿Qué captura estoy corrigiendo y cuál es su referencia?
3. ¿La evidencia permite afirmar que es el mismo vehículo?
4. ¿Qué cambiará al confirmar?
5. ¿Se guardó y qué debo revisar después?

El orden de mejora recomendado es **alcance correcto de la decisión → contexto correcto → evidencia confiable → continuidad del trabajo → velocidad y comodidad**. Reducir clics sin resolver primero esas condiciones puede acelerar los errores.

## 2. Alcance, método y límites

Se recorrieron mediante la extensión de Chrome las cuatro vistas internas de **En vivo**: Monitoreo, Colas por zona, Actividad y cámaras y Bandeja de patentes. Se revisaron Ricardone, San Lorenzo y Ambas, filtros, zonas, cámaras, comparación de candidatos y pendientes de turnos anteriores. Se inspeccionó el código que soporta esos recorridos.

**No se analizaron los módulos de KPI, edición de plano, histórico, datos ni otros módulos estadísticos.** Los pendientes anteriores y las resueltas se incluyen únicamente porque pertenecen a la bandeja operativa de En vivo. Tampoco se evalúa aquí la exactitud de los indicadores estadísticos superiores.

Durante esta auditoría no se confirmaron, descartaron, reabrieron ni reubicaron registros. Se hicieron consultas, cambios de vista y aperturas/cancelaciones de diálogos. No se simularon cortes de red, fallos de escritura ni concurrencia entre operadores. Los riesgos derivados del código están identificados como tales.

Los conteos de pantalla son instantáneas cambiantes. Parte de los pendientes de Ricardone se reabrió anteriormente por pedido del usuario para probar la experiencia: no permite estimar la carga natural ni la tasa de errores del algoritmo.

### Convenciones

- **O:** observado en Chrome o en la interacción documentada del usuario.
- **C:** confirmado en la implementación.
- **R:** riesgo o propuesta pendiente de validación; no es un incidente comprobado.
- **P0:** puede inducir una decisión sobre un registro/contexto incorrecto, ampliar su alcance sin claridad o impedir saber si se guardó.
- **P1:** deteriora significativamente la operación continua.
- **P2:** mejora de eficiencia, comprensión y comodidad.

Las fuentes S1–S13 y las capturas E1–E8 se encuentran al final.

## 3. El trabajo real del operador

**Al comenzar el turno**, necesita reconocer sus plantas y puntos, comprobar cámaras disponibles y conocer pendientes heredados. Una lista de casos sin motivo, responsable ni último intento no constituye una entrega de turno suficiente.

**Mientras vigila**, debe poder detectar excepciones sin leer probabilidades de cada captura. Una lectura dudosa, una cámara caída y una falta de fotografías son problemas distintos y requieren señales diferentes.

**Al corregir**, necesita fijar una captura, comparar evidencia y decidir una acción de alcance explícito. Seleccionar un candidato debe servir para inspeccionarlo. El guardado tiene que ocurrir después de la verificación.

**Si no puede resolver**, necesita posponer, buscar otra captura o escalar. Cancelar cierra una interacción; descartar retira una detección. Ninguno reemplaza “no tengo evidencia suficiente”.

**Con mucho volumen**, la cola debe mantener estable el caso abierto, agrupar capturas con criterio visible y priorizar sin abandonar las antiguas. Las novedades no deben mover el objetivo del clic ni cerrar la comparación.

**Al terminar el turno**, debe dejar casos con contexto: qué se intentó, qué falta y cuál es el próximo paso. El siguiente operador no debería empezar de cero.

## 4. Capacidades que conviene conservar

- Abrir cámaras desde los puntos del plano.
- Consultar ocupación y patentes de una zona.
- Mostrar planta y punto en las tarjetas de revisión.
- Distinguir aplicación automática de confirmación humana.
- Comparar fotos y recortes de patente en el popup.
- Incluir la patente destino en el botón de confirmación.
- Cancelar la comparación con Escape.
- Conservar casos fuera del buffer y registrar decisiones.
- Permitir una patente manual cuando no está entre los candidatos.

## 5. Hallazgos priorizados

### A. Alcance de la decisión y prevención de errores

#### EV-01 · P0 · La confirmación puede afectar otras lecturas no inspeccionadas — C

**Problema:** el servidor aplica confirmaciones o descartes a otras lecturas pendientes con la misma patente leída dentro de tres horas. El popup compara un caso y la cantidad de relacionadas se informa después. Dos errores de OCR iguales no garantizan el mismo vehículo.

**Cambio:** mostrar previamente las capturas afectadas, cámara, hora y motivo de agrupación. Aplicar al caso visible por defecto; aplicar al grupo debe ser una elección explícita.

**Aceptación:** ninguna lectura adicional cambia sin figurar en el resumen previo; el recibo enumera el alcance real. **Fuente:** S8, `decideIdentification` y `siblings`.

#### EV-02 · P0 · “La cámara leyó bien” puede renombrar otro viaje — O/C

**Problema:** “Es [patente leída]” envía el viaje del primer candidato. El servidor puede renombrarlo. El popup lo menciona en una nota, pero conservar una lectura y afirmar que el viaje de otro candidato es el mismo vehículo son decisiones diferentes.

**Cambio:** separar “La lectura original es correcta; es otro vehículo” de “Es el mismo vehículo; corregir la patente de este viaje”. La segunda requiere elegir el viaje y ver su evidencia.

**Aceptación:** conservar la lectura original no renombra un viaje implícitamente. Un renombrado muestra identidad anterior, nueva y registros afectados. **Fuentes:** S3, `ownRead`; S8, `renameJourneyUid`.

#### EV-03 · P0 · La selección de zona puede cruzarse entre plantas — O/C

**Reproducción:** Ambas → Colas por zona → Playa OSL → Actividad y cámaras. Se mostró **Espera C16 · sin cámara**, aunque la selección había sido Playa OSL.

**Cambio:** llevar `{site, zoneId}` en toda selección. `pickZone` recibe actualmente solo el identificador de zona y la búsqueda del detalle usa la planta previamente seleccionada. Mostrar también la planta en las filas de la tabla.

**Aceptación:** cualquier zona de San Lorenzo abre su propio detalle y cámaras, incluso cuando coincide su identificador con el de una zona de Ricardone. **Fuente:** S1, `pickZone`, `selectedMapSite`; **evidencia:** E5.

#### EV-04 · P0 · El OK está habilitado antes de cargar las fotos — O/C

**Problema:** se puede confirmar mientras ambos paneles dicen “Buscando foto en DSS…”, y también ante una referencia ausente. El botón solo depende de `busy`, no de la disponibilidad real de imágenes.

**Cambio:** estados explícitos de cargando, lista, no disponible y error. La confirmación visual debe esperar la evidencia requerida. Si se permite una excepción sin foto, debe ser otra acción, con motivo y alcance visibles.

**Aceptación:** una consulta pendiente o una imagen rota no cuentan como verificación visual. Cancelar permanece disponible antes del envío. **Fuente:** S4; **evidencia:** E6.

#### EV-05 · P0 · El resultado de un guardado fallido puede ser ambiguo — C/R

**Problema:** el error se muestra en el padre, detrás del popup. El diálogo vuelve a decir “Todavía no se guardó ninguna decisión”. El servidor escribe decisiones antes del registro de auditoría: un fallo posterior puede dejar una operación parcialmente persistida. No se provocó ese fallo durante la revisión.

**Cambio:** comunicar dentro del diálogo guardando, guardado, rechazado o resultado desconocido. Identificar cada operación y consultar su resultado antes de reintentar cuando la respuesta se perdió. Dar coherencia transaccional al guardado y su registro.

**Aceptación:** no se repite una operación aplicada ni se afirma “no guardado” sin comprobarlo. **Fuentes:** S2, `decide`; S4; S8, escrituras de decisión y log.

#### EV-06 · P0 · Falta protección explícita ante cambios concurrentes — C/R

**Problema:** la decisión no lleva versión del caso/evidencia. Otra pestaña, operador o proceso puede modificarlo entre apertura y envío. La lista también se refresca mientras se trabaja. No se reprodujo una colisión.

**Cambio:** fijar identidad y evidencia al abrir; enviar su versión. Si cambió, explicar el conflicto y pedir revisar. Para varios operadores, reservar temporalmente el caso o indicar quién lo está atendiendo.

**Aceptación:** dos sesiones no sobrescriben silenciosamente decisiones incompatibles; el OK siempre pertenece al caso inspeccionado. **Fuentes:** S2, S8 y S10.

#### EV-07 · P1 · Quitar y reubicar camiones son acciones inmediatas — C

**Problema:** cambiar el selector de zona ejecuta la reubicación; la cruz junto a la patente ejecuta “Sacar del sistema”. Explorar opciones o confundir la cruz con cerrar puede modificar el estado de planta.

**Cambio:** acciones verbales “Reubicar” y “Quitar del estado de planta”, con vehículo, planta, origen, destino y motivo antes de aplicar. Reservar la cruz para cerrar interfaces.

**Aceptación:** abrir o recorrer opciones no modifica registros; el cambio requiere una aplicación explícita. **Fuente:** S1, `MapContextPanel`.

#### EV-08 · P1 · Descartar no distingue incertidumbre de detección inválida — O/C

**Problema:** falta “No puedo identificarlo”. Descartar usa el popup de candidatos, que puede mostrar un segundo panel sin referencia y porcentajes no disponibles.

**Cambio:** separar Posponer, Buscar otra captura, Escalar y Descartar detección. El descarte requiere motivo; no debe representar falta de certeza.

**Aceptación:** una lectura válida pero dudosa puede quedar pendiente con motivo y próxima acción, sin inventar una identificación. **Fuentes:** S3 y S4.

### B. Evidencia visual y probabilidades

#### EV-09 · P1 · La referencia no siempre es la “última foto” — C

**Problema:** el algoritmo usa la última lectura anterior en un caso y la primera posterior en otro; el popup llama a ambas “Última foto registrada”.

**Cambio:** nombrar “Última lectura válida anterior” o “Primera lectura válida posterior”; mostrar fecha, planta, punto, diferencia temporal y razón de selección. Permitir otra referencia sin perder la foto dudosa.

**Aceptación:** el título coincide con la regla real; otro día u otra planta resultan inequívocos. **Fuentes:** S8, `photoDevice/photoAt`; S4.

#### EV-10 · P1 · La hora del evento y la de la fotografía no se explican juntas — O/C

**Problema:** el encabezado usa hora operativa y la imagen trae hora de cámara. El servidor corrige el tiempo al buscar en DSS, pero el popup no explica la diferencia ni muestra `diffMs`. Tampoco destaca si la patente devuelta por DSS difiere de la solicitada.

**Cambio:** mostrar hora operativa, hora cámara y calidad de coincidencia temporal. Señalar capturas aproximadas y ofrecer alternativas cercanas cuando corresponda.

**Aceptación:** el operador puede verificar que la foto pertenece al evento, sin interpretar una corrección de reloj como otra captura. **Fuentes:** S4 y S9, `realAt`, `diffMs`.

#### EV-11 · P1 · Ampliar una foto rompe la comparación — O/C

**Problema:** las dos imágenes y recortes ya se muestran enfrentados, pero la escena ampliada abre otra pestaña. No hay zoom o desplazamiento dentro del popup.

**Cambio:** zoom independiente, restablecer escala, ampliación de recortes y zoom coordinado opcional. Mantener ambas referencias visibles. “Enfrentadas” significa lado a lado; no reflejar horizontalmente las patentes.

**Aceptación:** inspeccionar un carácter en cada foto y volver a la comparación no requiere salir del diálogo. **Fuente:** S4.

#### EV-12 · P1 · Porcentajes diferentes tienen demasiado parecido visual — O

**Problema:** un candidato observado mostraba 16% combinado, 83% de similitud y 99% de circuito. Es fácil tomar el valor mayor como certeza de identidad.

**Cambio:** priorizar “Apoyo del modelo a este candidato” y presentar similitud/recorrido como factores. Explicar con una frase por qué discrepan, y mostrar el estado de calibración sin prometer precisión no medida.

**Aceptación:** el operador entiende qué estima cada porcentaje y que no deben sumarse ni sustituirse. **Fuentes:** S3, S4 y S11.

#### EV-13 · P1 · “Otro camión” agrupa hipótesis distintas — O/C

**Problema:** un único porcentaje representa lectura correcta u otro vehículo fuera de los candidatos. La acción ofrecida es más específica que esa hipótesis residual.

**Cambio:** rotular “Ningún candidato listado”. Separar las decisiones: lectura original correcta, otro vehículo identificado manualmente e identidad aún desconocida.

**Aceptación:** la probabilidad residual no se presenta como certeza de una patente particular. **Fuentes:** S3 y S11, `otherProbability`.

#### EV-14 · P1 · Se anuncian cinco candidatos y se muestran hasta tres — O/C

**Problema:** la tarjeta cuenta todos los candidatos guardados; la evidencia filtra y limita a tres, sin acceso explícito a los restantes.

**Cambio:** “3 sugeridos de 5 evaluados”, explicación del criterio y revisión de los demás bajo demanda.

**Aceptación:** el total se reconcilia con lo visible; un candidato conservado no queda inaccesible. **Fuentes:** S2, S3 y S9.

#### EV-15 · P1 · Los atributos detectados parecen hechos confirmados — O/C

**Problema:** color, marca y tipo se presentan con coincidencias/diferencias categóricas, a veces en inglés. Una etiqueta incorrecta de cámara puede contradecir las fotos y sesgar la decisión.

**Cambio:** rotular “Detectado por cámara”, traducir y permitir señalar un atributo incorrecto sin editar el original. Distinguir dato ausente, falla de consulta y diferencia registrada.

**Aceptación:** confirmar identidad no valida implícitamente todos los atributos del DSS. **Fuentes:** S3, S4 y S11.

#### EV-16 · P1 · La recuperación de fotos/evidencia es incompleta — C/R

**Problema:** hay reintento de consulta, pero no manejo explícito del error de descarga de una imagen. Metadatos sin archivos pueden no ofrecer reintento. Para algunas fallas de evidencia se pide volver a abrir el caso.

**Cambio:** carga/error/reintento independientes para foto dudosa, referencia, recortes y probabilidades. Advertir si el cálculo carece de atributos; mantener utilizable lo que sí llegó.

**Aceptación:** una imagen fallida tiene mensaje y recuperación; reintentar no cambia el candidato ni reinicia la decisión. **Fuentes:** S3, S4 y S9.

### C. Bandeja y continuidad del trabajo

#### EV-17 · P1 · Un filtro puede ocultar todo y la pantalla afirmar “está al día” — O/C

**Reproducción:** con pendientes globales, filtrar Turno actual por Ricardone · Volcable. La lista dice “Sin coincidencias para estos filtros” y el panel derecho “La bandeja está al día”. Esto explica la confusión anterior del usuario sobre la ausencia de pendientes.

**Cambio:** separar carga, sin pendientes reales, sin coincidencias, error y datos viejos. Mostrar filtros activos, “0 de N casos” y Limpiar filtros.

**Aceptación:** “al día” nunca aparece por un filtro, carga pendiente o falla. **Fuente:** S2; **evidencia:** E7.

#### EV-18 · P1 · Antigüedad es el único criterio de atención — O/C

**Problema:** se atiende primero lo más antiguo del turno, sin distinguir casos que afectan puntos activos o requieren intervención inmediata. No existe información suficiente para asumir que un camión sigue esperando físicamente.

**Cambio:** definir con planta prioridades y sus causas; permitir ordenar por atención actual, antigüedad y punto. Mostrar tiempo pendiente y motivo de prioridad, sin inventar urgencia.

**Aceptación:** las prioridades tienen reglas acordadas y visibles; los casos de baja prioridad no se abandonan. **Fuente:** S2; priorización propuesta R.

#### EV-19 · P1 · Cambiar de vista pierde la sesión de revisión — C

**Problema:** la bandeja se desmonta al salir. Cola, filtros, selección y texto manual viven en estados locales; al volver se comienza otra vez en Turno actual.

**Cambio:** conservar selección, filtros, borrador y posición. Identificar el caso de forma navegable y ofrecer Volver al caso en revisión desde las cámaras y el plano.

**Aceptación:** consultar una zona y regresar mantiene el caso y el borrador exactos, sin guardar nada. **Fuentes:** S1, montaje condicional; S2 y S3.

#### EV-20 · P1 · El paso al siguiente caso no es suficientemente explícito — C

**Problema:** tras guardar se borra la selección y se toma el primer caso visible. El recibo es genérico; el operador puede confundir el nuevo vehículo con el anterior.

**Cambio:** recibo breve con lectura original, patente elegida, punto, hora y alcance. Ofrecer Confirmar y siguiente o Confirmar y permanecer. Anunciar el nuevo caso y reiniciar las imágenes de manera inequívoca.

**Aceptación:** se reconoce qué se guardó y qué está abierto; un doble clic no alcanza al siguiente registro. **Fuentes:** S2 y S4.

#### EV-21 · P1 · Los turnos están fijados y no hay entrega de trabajo — C/R

**Problema:** los cortes 00–08, 08–16 y 16–24 están codificados. No hay responsable, último intento, motivo de espera ni nota de relevo.

**Cambio:** configurar horarios acordados y conservar contexto de cada pendiente: primera alerta, último intento, motivo y próximo paso. El cambio de turno no debe desplazar el caso abierto.

**Aceptación:** los horarios representan la operación real y el siguiente operador retoma sin repetir la investigación. **Fuente:** S2, `shiftStart`.

#### EV-22 · P1 · Consultar resueltas obliga a reabrir para ver la comparación — O/C

**Problema:** las resueltas muestran resultado y foto; no toda la comparación. Reabrir cambia el estado, aunque la intención solo sea inspeccionar evidencia.

**Cambio:** separar Ver decisión y evidencia de Reabrir revisión. Mostrar quién decidió, cuándo, con qué datos y qué registros afectó. Reapertura deliberada con motivo.

**Aceptación:** consultar imágenes/probabilidades no altera estados ni conteos de pendientes. **Fuente:** S2 e interacción del usuario.

#### EV-23 · P1 · Reabrir una aplicación automática puede resolverla otra vez — C/R

**Problema:** `clear` elimina la decisión humana, pero no crea un estado persistente que exija revisión manual. Si el algoritmo continúa clasificando `casi_seguro`, puede volver a aparecer como resuelta.

**Cambio:** estado Revisión humana solicitada que suspenda la reaplicación automática del caso. Separar reabrir, revertir y recalcular sugerencias.

**Aceptación:** una reapertura permanece pendiente tras refrescos y reinicios hasta una resolución explícita. **Fuentes:** S8 y S12.

#### EV-24 · P1 · Los conteos mezclan patentes, casos y capturas — O/C

**Problema:** el aviso habla de patentes, la bandeja de casos y el feed cuenta capturas pendientes entre sus últimas cuarenta. Una patente puede aparecer en varios registros.

**Cambio:** usar casos pendientes para la unidad de trabajo y capturas para la evidencia. Explicar agrupaciones. Identificar el alcance del contador del feed; la bandeja debe ser la autoridad del trabajo pendiente.

**Aceptación:** todo número tiene unidad y alcance comprensibles; las diferencias no parecen pérdida de datos. **Fuentes:** S2 y S5.

### D. Zonas, cámaras y vigilancia

#### EV-25 · P1 · Elegir una zona en la tabla no muestra su detalle allí — O/C

**Problema:** Colas por zona invita a elegir una fila para revisar camiones y cámaras, pero el detalle está dentro de Monitoreo y queda oculto. El clic parece no funcionar.

**Cambio:** panel contextual en la misma vista o navegación explícita al detalle. Presentar planta, zona, ocupación, vehículos y cámaras juntos.

**Aceptación:** el clic produce un resultado visible y útil sin adivinar otra pestaña. **Fuente:** S1, `pickZone` y `hidden`; **evidencia:** E2.

#### EV-26 · P1 · Actividad y cámaras muestra un vacío permanente — O/C

**Problema:** Últimas detecciones dice sin dato mientras el feed dispone de capturas. Los grupos de cámaras dependen de elegir una zona en otra vista.

**Cambio:** selector directo de planta/punto con sus cámaras y capturas, o integración de esta función en Monitoreo. Retirar el bloque vacío hasta darle una utilidad real.

**Aceptación:** no hay mensajes contradictorios sobre capturas disponibles ni dependencias de navegación implícitas. **Fuente:** S1, vista actividad; **evidencia:** E3.

#### EV-27 · P1 · La lista de camiones no se actualiza al ritmo de la ocupación — C/R

**Problema:** `getZoneTrucks` se consulta al cambiar selección o corregir, mientras el plano recibe nuevos estados. Al cambiar zona, la lista previa puede persistir durante la carga.

**Cambio:** actualizar detalle y ocupación con una revisión coherente; mostrar la hora propia si difieren. Durante el cambio, atenuar/vaciar datos viejos e impedir acciones sobre una lista que aún no corresponde a la selección.

**Aceptación:** una zona abierta mantiene conteo/listado consistentes y no permite actuar sobre vehículos de la zona anterior. **Fuente:** S1, efecto de `getZoneTrucks`.

#### EV-28 · P1 · “Sin datos” no explica qué se desconoce — O/C

**Problema:** hay zonas con ocupación visible y estado Sin datos, sin aclarar si falta actividad, captura, conexión o certeza de ubicación.

**Cambio:** separar salud de cámara, última captura, certeza de ocupación y actividad. Usar estados específicos solo cuando exista evidencia: Sin capturas recientes, Cámara desconectada, Ocupación estimada.

**Aceptación:** cada estado identifica el dato afectado, su antigüedad y una acción posible. **Fuentes:** S1, S6 y plano observado.

#### EV-29 · P1 · “En vivo” no confirma que estén llegando cuadros — C/R

**Problema:** la cámara pasa a ready y muestra En vivo al obtener la URL del iframe, sin comprobar reproducción o congelamiento.

**Cambio:** distinguir conectando, recibiendo video, sin cuadros recientes y reconectando mediante señales del reproductor. La hora de la página no sustituye a la del último cuadro.

**Aceptación:** una URL abierta con video detenido no continúa marcada En vivo. **Fuente:** S6. Congelamiento no provocado durante esta auditoría.

#### EV-30 · P1 · Los errores de cámara dan instrucciones técnicas al operador — O

**Problema:** la cámara trasera de ingreso mostró canal parecido, endpoint GET y archivo JSON de overrides. Reintentar no resuelve un nombre mal configurado.

**Cambio:** Cámara trasera de ingreso no disponible, alcance de cobertura afectada y Reportar incidencia. Mantener las demás cámaras utilizables. Guardar detalles técnicos en una sección para soporte.

**Aceptación:** el operador entiende qué punto perdió cobertura y cómo continuar sin conocer archivos o APIs. **Evidencia:** E4.

#### EV-31 · P1 · Los modales tienen comportamientos de teclado diferentes — O/C

**Problema:** Escape cerró la comparación, pero no el modal de cámaras con Cerrar enfocado. El modal de cámaras declara `aria-modal` sin gestión explícita de foco.

**Cambio:** foco inicial, tabulación contenida, fondo inerte, Escape y retorno del foco consistentes. Definir cuándo el clic exterior puede cerrar sin perder trabajo.

**Aceptación:** ambos diálogos se operan y cierran por teclado sin llegar a controles del fondo. **Fuentes:** S4 y S6; prueba de Escape.

#### EV-32 · P1 · Revisar una patente oculta la supervisión de otros puntos — O/R

**Problema:** la bandeja reemplaza el área de planta/capturas y el popup bloquea casi toda la pantalla. No queda una señal compacta del resto de los puntos asignados.

**Cambio:** franja persistente de salud/alertas, novedades acumuladas y acceso a cámaras fijadas. Las alertas normales no deben interrumpir o superponerse a una decisión abierta.

**Aceptación:** se detecta una incidencia relevante de otro punto sin perder ni reemplazar el caso actual. Propuesta sobre las vistas observadas.

### E. Actualización y confiabilidad percibida

#### EV-33 · P1 · El reloj puede reiniciar el polling del feed cada segundo — C/R

**Problema:** PlantHome crea `visibleSites` como un arreglo nuevo en cada render y actualiza el reloj cada segundo. LiveActivityFeed depende de esa identidad: recrea la carga, reinicia el intervalo y vacía `seen`.

**Cambio:** dependencias estables por contenido, actualización coordinada, reducción de consultas de vistas ocultas y un registro acotado de capturas vistas.

**Aceptación:** el reloj no dispara consultas; las novedades conservan su identidad y la frecuencia cumple la política definida. **Fuentes:** S1 y S5. No se midió el tráfico efectivo.

#### EV-34 · P1 · El error de una planta puede bloquear la actualización conjunta — C/R

**Problema:** bandeja y feed usan `Promise.all`: una falla descarta el conjunto de resultados. La bandeja tampoco cancela respuestas antiguas cuando cambia el alcance.

**Cambio:** carga independiente por planta, antigüedad por fuente y descarte de respuestas fuera de orden. Datos conservados deben estar rotulados como anteriores si no se actualizaron.

**Aceptación:** fallar San Lorenzo no impide datos nuevos de Ricardone; alternar plantas rápidamente no muestra resultados del alcance anterior. **Fuentes:** S2 y S5.

#### EV-35 · P1 · Snapshot reciente no significa capturas recientes — C/R

**Problema:** el hook marca live con el instante de recepción en navegador. La bandeja dice Asistencia automática activa de manera fija. Ninguna de esas señales verifica toda la cadena de cámaras, reconocimiento y fotos.

**Cambio:** separar conexión de interfaz, último evento por punto, reconocimiento y disponibilidad de imágenes. El silencio de una cámara solo indica falta de capturas, salvo que otra señal permita afirmar una falla.

**Aceptación:** el operador identifica qué parte está fresca y cuál está degradada. **Fuentes:** S7 y S2.

#### EV-36 · P1 · Candidatos y probabilidades pueden pertenecer a revisiones distintas — C/R

**Problema:** identificación y evidencia se actualizan con períodos de caché diferentes. No hay versión compartida para comprobar que ranking, motivo y probabilidades pertenecen al mismo conjunto.

**Cambio:** versionar candidatos/evidencia e invalidar por versión. Congelar lo inspeccionado mientras se compara e indicar si llegó evidencia nueva.

**Aceptación:** todo el caso visible corresponde a una revisión identificable; actualizarla es una transición perceptible. **Fuentes:** S8, S9 y S3.

### F. Legibilidad, escala y automatización futura

#### EV-37 · P1 · La revisión completa no cabe en el feed compacto — O/C

**Problema:** la columna de capturas incluye la tabla de ocho columnas del detalle amplio. `compact` modifica cabecera, pero no simplifica la tabla.

**Cambio:** resumir lectura, punto, hora, motivo y Abrir caso. Hacer la comparación detallada en un espacio amplio único.

**Aceptación:** la actividad lateral no exige scroll horizontal ni contiene un formulario completo por cada captura. **Fuentes:** S3 y S5; **evidencia:** E1.

#### EV-38 · P2 · Estados, nombres y lenguaje cambian según la vista — O/C

**Problema:** Provisoria, Confirmar candidato, Corregida y Aplicada automáticamente describen estados relacionados con vocabulario distinto. Hay códigos de cámara, términos en inglés y frases como si es él o drena por.

**Cambio:** vocabulario operativo común, nombres humanos de cámara/punto y código secundario copiable. Color acompañado por texto o símbolo; etiquetas del mapa consultables sin memorizar colores.

**Aceptación:** el mismo estado conserva nombre/significado en feed, bandeja, plano y popup. **Fuentes:** S1–S6 y S13.

#### EV-39 · P2 · Densidad y repetición aumentan la fatiga — O/C

**Problema:** texto operativo pequeño, metadatos grises, varios scrolls y repetición de patente/cámara. Cambiar de candidato en comparación requiere cerrar y abrir. Los conteos no funcionan como accesos directos.

**Cambio:** tamaños legibles, blancos de clic mayores, navegación entre candidatos dentro del popup manteniendo fija la captura dudosa y atajos documentados. Confirmar debe seguir protegido. Probar 100%/125% de zoom y monitores más pequeños.

**Aceptación:** fotos, destino de la decisión y Cancelar/Confirmar permanecen utilizables; los recorridos repetidos no requieren precisión fina. **Fuentes:** CSS y observación; validación ergonómica propuesta.

#### EV-40 · P1 · Guardar candidatos no completa el circuito de aprendizaje — C/R

**Problema:** las fotos se consultan al DSS bajo demanda. El archivo se actualiza con resultados recientes y no garantiza un paquete inmutable de lo visto al decidir. El log tampoco representa una sesión completa de operador, motivos y versiones. Un caso reabierto para demostración no equivale a un nuevo ejemplo validado.

**Cambio:** conservar evidencia/versiones usadas, autor, motivo, alcance y procedencia. Definir disponibilidad de fotos. Separar ejemplos confirmados, descartes, pruebas y decisiones revocadas. Informar registrado para calibración; afirmar aprendizaje solo si existe un proceso verificable.

**Aceptación:** se reconstruye la decisión como la vio el operador y una rectificación invalida el ejemplo anterior de forma trazable. **Fuentes:** S8, S9 y S12.

## 6. Experiencia objetivo para el operador

### 6.1 Organización de la pantalla

La tarea principal es vigilar varios puntos y atender excepciones. La pantalla debe permitir responder «qué ocurre», «qué necesita mi intervención» y «qué evidencia tengo» sin reconstruir el contexto al cambiar de vista.

Propuesta de tres regiones conectadas:

1. **Cabecera persistente:** planta o plantas, estado de conexión por fuente, última actualización y pendientes que requieren intervención. El alcance elegido debe ser evidente también en ventanas y detalles.
2. **Supervisión:** mapa, zonas y cámaras con selección coherente. Elegir una zona abre su detalle visible; elegir una cámara abre sus capturas o transmisión. Cada cantidad indica qué cuenta y cuándo se actualizó.
3. **Bandeja de intervención:** casos pendientes con contexto suficiente para elegir el siguiente. Abrir un caso preserva la vigilancia mediante un resumen discreto de otras incidencias. Ninguna llegada nueva cambia la evidencia que se está comparando.

No hace falta concentrar todo en una pantalla densa. Monitoreo y revisión pueden tener espacios propios, siempre que conserven selección, filtros, posición y una señal persistente de lo que requiere atención.

### 6.2 Qué debe mostrar un caso antes de abrirlo

- Miniatura de la captura dudosa y lectura original, distinguiendo «sin lectura» de una patente real.
- Planta, punto, sentido de circulación y hora de captura con fecha cuando corresponda.
- Motivo de revisión expresado en lenguaje operativo: lectura débil, candidatos cercanos, evidencia contradictoria o falta de referencia, según datos disponibles.
- Antigüedad del pendiente y prioridad justificada. La antigüedad de una foto no demuestra que el camión siga esperando.
- Cantidad de capturas agrupadas, si el caso representa más de una observación.
- Acción principal **Revisar**. Seleccionar una tarjeta o un candidato prepara una decisión; no la guarda.

### 6.3 Secuencia de revisión propuesta

1. El operador abre un caso. La aplicación fija su identificador y versión, sin perder la ubicación en la bandeja.
2. Aparece la captura dudosa, su recorte y lectura original. Se presentan los candidatos con su puntuación y el motivo de la sugerencia.
3. Al elegir un candidato, se abre la comparación con dos columnas: **Captura a identificar** y **Referencia de [patente]**. Ambas mantienen tamaño y herramientas equivalentes. «Espejadas» significa lado a lado: no invertir horizontalmente las imágenes ni los caracteres.
4. La referencia indica planta, cámara, fecha, patente realmente devuelta y relación temporal. «Última foto» solo se usa si esa condición está garantizada y se aclara respecto de qué momento.
5. El operador puede ampliar, mover, ver recortes y alternar candidatos manteniendo fija la captura dudosa. Las puntuaciones quedan visibles, con explicación breve y detalle opcional.
6. Antes de guardar se ve el cambio exacto: **Lectura original → patente elegida**, más los registros afectados. Una ampliación a otras capturas requiere una selección explícita.
7. **Confirmar [patente]** envía una única operación. Mientras se guarda, se bloquean envíos duplicados. **Cancelar** cierra sin cambios y conserva el caso.
8. El resultado distingue guardado correcto, conflicto y resultado incierto. Tras el éxito se muestra un recibo breve con patente y alcance, y se ofrece el siguiente pendiente sin saltos inesperados.

La doble verificación debe prevenir el clic equivocado mediante evidencia, alcance y una acción final clara. Agregar confirmaciones genéricas repetidas produciría clics automáticos sin mejorar la decisión.

### 6.4 Semántica de las acciones

| Acción | Qué significa | Resultado esperado |
|---|---|---|
| Elegir candidato | Quiero comparar esta hipótesis | Abre evidencia; no persiste |
| Confirmar patente | Verifiqué esta identificación y su alcance | Guarda decisión trazable |
| La lectura original es correcta | La cámara leyó correctamente | Conserva identidad sin renombrar otro recorrido implícitamente |
| Ingresar otra patente | Ninguna propuesta corresponde, pero puedo leerla | Valida formato y abre verificación del valor escrito |
| No puedo determinar | La evidencia no permite decidir | Conserva pendiente con motivo y próximo tratamiento |
| Descartar detección | La captura no representa un caso válido | Solicita motivo; no equivale a «no sé» |
| Cancelar comparación | No deseo confirmar esta selección | Ningún cambio persistente |
| Revisar decisión resuelta | Quiero consultar cómo se resolvió | Muestra evidencia y decisión sin reabrir |
| Reabrir | La decisión necesita nueva revisión | Crea revisión vinculada y evita resolución automática inmediata |

Las etiquetas finales deben acordarse con los operadores. La distinción entre esas intenciones debe mantenerse aunque cambie el texto.

### 6.5 Estados que la interfaz debe distinguir

**Del caso:** pendiente → en revisión → resuelto; pendiente → diferido con motivo; resuelto → reabierto. «En revisión» solo implica reserva frente a otros operadores si el sistema realmente la implementa.

**De la operación de guardado:** sin enviar, enviando, guardada, rechazada por conflicto, fallida sin cambios o resultado por verificar. Un error de transporte no permite afirmar por sí solo que no hubo escritura.

**De la evidencia:** cargando, disponible, parcial, no encontrada o error recuperable. Una imagen anterior de otro caso nunca debe ocupar silenciosamente el lugar de la nueva.

**De la conexión:** datos actualizados, datos demorados, reconectando o fuente sin respuesta. La conectividad y la confianza de una identificación son dimensiones diferentes.

## 7. Orden de implementación recomendado

| Etapa | Objetivo | Hallazgos principales | Condición para avanzar |
|---|---|---|---|
| 1. Decisiones y contexto correctos | Evitar guardar sobre registros o zonas equivocados | EV-01 a EV-08, EV-10, EV-17 | Alcance visible, planta/zona consistente, fotos verificadas y resultado de guardado inequívoco |
| 2. Puesto de operación continuo | Trabajar varios puntos sin perder casos ni contexto | EV-18 a EV-27, EV-32 | Cola estable, navegación reversible, pendientes anteriores recuperables y detalle de zona actualizado |
| 3. Evidencia y confiabilidad visual | Comparar con claridad y confiar en la vigencia de la pantalla | EV-09, EV-11 a EV-16, EV-28 a EV-31, EV-33 a EV-39 | Comparación usable, fallos parciales explícitos y actualización estable |
| 4. Retroalimentación verificable | Preparar automatización y corrección posterior | EV-40, más trazabilidad de etapas anteriores | Evidencia reproducible y ejemplos de entrenamiento separados de pruebas y decisiones revocadas |

Las etapas son un orden de dependencia, no estimaciones de esfuerzo. Los P0 deben resolverse antes de ampliar la automatización. Mejorar la apariencia de las probabilidades no habilita a cambiar umbrales: eso requiere evaluar el modelo con ejemplos validados.

## 8. Pruebas de aceptación operativas

Estas pruebas son una propuesta para validar las correcciones; no se presentan como ejecutadas durante esta auditoría. Las pruebas que cambian decisiones, simulan fallos o involucran concurrencia deben realizarse con datos de prueba identificables.

| ID | Escenario | Resultado que debe observar el operador |
|---|---|---|
| A01 | Abrir una cámara desde Monitoreo | Punto y planta correctos, estado real de reproducción y cierre accesible |
| A02 | Elegir Playa OSL con Ambas plantas seleccionadas | Detalle de Puerto y de esa zona; nunca Espera C16 por coincidencia de identificadores |
| A03 | Elegir zona desde Colas | Detalle visible de la zona sin descubrir otra vista por ensayo y error |
| A04 | Cambiar de zona con carga lenta | Título y contenido coherentes; datos anteriores no se presentan como los nuevos |
| A05 | Recibir cambios de ocupación con una zona abierta | Conteo y lista se actualizan o explicitan distinta vigencia |
| A06 | Abrir candidato y luego cancelar | No cambia ninguna decisión, recorrido ni cantidad de pendientes |
| A07 | Abrir un segundo candidato | Captura dudosa fija; referencia, patente y puntuaciones corresponden al segundo |
| A08 | Comparar con las dos fotos disponibles | Ambas ampliables, etiquetas legibles y botón final con patente explícita |
| A09 | Referencia posterior a la captura dudosa | Relación temporal visible; no se presenta como observación previa |
| A10 | Falta una foto o falla su carga | Mensaje localizado, reintento y tratamiento explícito de evidencia insuficiente |
| A11 | Confirmar con capturas relacionadas | Lista y alcance visibles antes de guardar; solo se afecta lo seleccionado |
| A12 | Confirmar lectura original correcta | No se renombra implícitamente el recorrido del primer candidato |
| A13 | Escribir una patente diferente | Verificación del valor escrito y de su alcance antes de persistir |
| A14 | No poder determinar la patente | Caso conservado con motivo; no se contabiliza como identificación confirmada |
| A15 | Doble clic o Enter reiterado al guardar | Una sola operación y un resultado consistente |
| A16 | Cortarse la respuesta después del envío | Estado por verificar y reconciliación; sin inducir duplicados con reintentos ciegos |
| A17 | Dos operadores abren el mismo caso | El segundo guardado detecta la versión modificada y pide revisar evidencia actual |
| A18 | Llegan nuevas capturas durante una comparación | No cambian candidato, imagen ni alcance bajo el cursor |
| A19 | Un filtro no encuentra casos, pero existen pendientes | Se informa «sin coincidencias» y se ofrece limpiar filtro |
| A20 | Salir a ver una cámara y volver a la bandeja | Se recuperan caso, filtros y posición; el borrador se conserva o se gestiona explícitamente |
| A21 | Cambiar de turno con casos sin resolver | Siguen accesibles con origen, motivo y continuidad de tratamiento |
| A22 | Consultar una decisión resuelta | Se ve lo decidido y la evidencia disponible sin reabrirla automáticamente |
| A23 | Reabrir una decisión automática | Permanece en revisión manual hasta una nueva decisión autorizada |
| A24 | Una planta deja de responder | La otra sigue visible y actualizada; la falla tiene alcance identificable |
| A25 | Hay conexión, pero dejan de llegar datos de origen | Se señala antigüedad; la recepción de respuestas vacías no simula actividad reciente |
| A26 | Abrir y cerrar modales con teclado | Foco dentro del diálogo, Escape coherente y retorno al elemento que lo abrió |
| A27 | Trabajar con zoom de navegador 125% | Fotos, contexto y acciones usables, sin ocultar confirmación o cancelación |
| A28 | Sostener supervisión con varias cámaras y nuevas alertas | No se roba foco ni se interrumpe una decisión; las urgencias siguen detectables |
| A29 | Revocar una confirmación usada como ejemplo | La versión anterior queda trazable e invalidada para su uso posterior |
| A30 | Reabrir casos para demostración | Se identifican como prueba y no se interpretan como errores nuevos del algoritmo |

## 9. Validación con operadores y decisiones pendientes

### Sesión propuesta

Realizar una sesión observada con operadores que hoy cubren entradas y salidas. Incluir casos correctos, dos candidatos visualmente parecidos, lectura ilegible, foto ausente, caso de turno anterior y llegada de una alerta mientras se compara otro camión. Pedirles que expliquen qué creen que ocurrirá antes de confirmar; esa respuesta revela si el alcance está claro.

Registrar errores de selección, cambios de contexto, abandonos, necesidad de ayuda y tiempo hasta una decisión correcta. Estas mediciones sirven para evaluar el rediseño; esta auditoría no midió esos tiempos ni permite prometer una reducción porcentual. La velocidad se evalúa junto con exactitud y carga de atención.

### Definiciones de negocio necesarias

- Qué determina que un caso sea urgente y qué dato permite afirmar que hay una operación esperando.
- Qué capturas pueden agruparse y cuándo una corrección debe aplicarse a una sola observación o a un conjunto.
- Cuáles son los turnos reales y cómo se transfiere un pendiente entre operadores.
- Quién puede descartar, reabrir o confirmar sin referencia visual, y cómo se registra el motivo.
- Qué significa cada puntuación, si está calibrada como probabilidad y qué universo cubre el residual.
- Cuál es la retención de imágenes y cómo se conserva evidencia de una decisión cuando la fuente deja de servirla.
- Cómo una corrección validada entra al proceso de mejora del reconocimiento y cómo se excluyen demostraciones, errores y decisiones revocadas.

Estas definiciones no impiden empezar por las correcciones evidentes de contexto, alcance y navegación. Sí condicionan la automatización y los mensajes que la interfaz puede afirmar con certeza.

## 10. Evidencia visual del recorrido

Capturas de la sesión de auditoría, obtenidas desde Chrome. Documentan estados puntuales de la aplicación, no una medición de desempeño del algoritmo. Los números pueden incluir casos reabiertos para probar la experiencia.

| Referencia | Captura | Qué documenta |
|---|---|---|
| E1 | [Monitoreo](01-monitoreo.jpg) | Distribución general de mapa, actividad y contexto operativo |
| E2 | [Zona seleccionada sin detalle visible](02-zona-sin-detalle.jpg) | Falta de continuidad entre Colas y detalle |
| E3 | [Actividad](03-actividad.jpg) | Mensaje de ausencia de detecciones en el recorrido observado |
| E4 | [Cámaras](04-camaras.jpg) | Reproducción y tratamiento de una cámara con error |
| E5 | [Zona con Ambas plantas](05-ambas-zona-osl.jpg) | Inconsistencia entre zona elegida y contexto mostrado |
| E6 | [Comparación](06-comparacion.jpg) | Estructura del diálogo, probabilidades y estado de carga |
| E7 | [Filtro sin coincidencias](07-filtro-sin-casos.jpg) | Mensaje de bandeja vacía bajo un filtro |
| E8 | [Pendientes anteriores](08-pendientes-anteriores.jpg) | Continuidad de casos entre turnos dentro de En vivo |

La presencia incidental del menú de otras secciones en las capturas no implica análisis de esas secciones.

## 11. Fuentes de implementación consultadas

Rutas relativas a este documento. Corresponden al estado local revisado; futuras modificaciones pueden cambiar su comportamiento. La inspección de código sustenta hallazgos marcados C, pero no reemplaza las pruebas operativas pendientes.

| Fuente | Archivos | Aspecto revisado |
|---|---|---|
| S1 | [PlantHome.tsx](../../src/pages/PlantHome.tsx) | Navegación, selección de planta/zona, detalle y actualización |
| S2 | [IdentificationPanel.tsx](../../src/components/plant/IdentificationPanel.tsx) | Bandeja, filtros, turnos, estados y decisiones |
| S3 | [ReviewCandidates.tsx](../../src/components/plant/ReviewCandidates.tsx) | Candidatos, lectura original y acciones |
| S4 | [PlateVerification.tsx](../../src/components/plant/PlateVerification.tsx), [estilos](../../src/components/plant/plateVerification.css) | Doble verificación, fotos y diálogo |
| S5 | [LiveActivityFeed.tsx](../../src/components/plant/LiveActivityFeed.tsx) | Capturas recientes, refresco y revisión embebida |
| S6 | [LiveCameraPlayerModal.tsx](../../src/components/plant/LiveCameraPlayerModal.tsx) | Ventana de cámaras, cierre y reproducción |
| S7 | [useLivePlantState.ts](../../src/hooks/useLivePlantState.ts) | Actualización y estado de conexión |
| S8 | [service.mjs](../../server/plantState/service.mjs), [plateIdentification.mjs](../../server/plantState/plateIdentification.mjs) | Persistencia, alcance y propagación de decisiones |
| S9 | [dssPhotoLookup.mjs](../../server/dssPhotoLookup.mjs) | Búsqueda de fotos, desfase horario y referencias |
| S10 | [plantStateApi.ts](../../src/services/live/plantStateApi.ts) | Consultas y operaciones del cliente |
| S11 | [identificationEvidence.mjs](../../server/plantState/identificationEvidence.mjs) | Construcción de evidencia; no se evaluó calibración estadística |
| S12 | [identificationArchive.mjs](../../server/plantState/identificationArchive.mjs) | Conservación y actualización de casos resueltos |
| S13 | [PlantMap.tsx](../../src/components/plant/PlantMap.tsx), [TruckSteps.tsx](../../src/components/plant/TruckSteps.tsx), [CapturePhoto.tsx](../../src/components/plant/CapturePhoto.tsx), [plantHome.css](../../src/pages/plantHome.css) | Interacción visual, recorridos, imágenes y legibilidad |

**Estado de entrega:** análisis y propuesta de corrección. Este documento no acredita que los hallazgos estén corregidos ni que las pruebas de aceptación hayan sido ejecutadas. El recorrido de auditoría no modificó decisiones operativas.
