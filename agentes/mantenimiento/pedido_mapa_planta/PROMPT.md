# Pedido: mapa de planta que vincule mantenimiento con la descarga de camiones

## Contexto

Trabajamos con dos plantas de Nueva Vicentin en el Nodo Sur: **Ricardone** y el **Puerto San Lorenzo** (en el EAM figura como *Terminal Embarque*). Del lado logístico ya tenemos, para cada camión, por qué cámaras pasó, en qué plataforma descargó (Excel de movimientos) y cuánto tardó en cada tramo.

Queremos explicar las demoras de descarga con el estado de mantenimiento. El problema es que casi nunca la causa es el volcable mismo. Es algo de su cadena:

- Si para la **secadora** de Ricardone, no se puede usar el volcable 1 ni el 2, porque el girasol que descargan va a la secadora.
- Si la **Celda 4** del puerto está en mantenimiento, los volcables que la cargan no pueden volcar soja ahí.
- Si se **limpia una cinta** o se cambia una noria, el volcable que alimenta anda más lento o se apaga.
- Si un **calador** de Ricardone anda mal, la soja R7 tarda más en calarse y llega tarde al puerto, así que la demora aparece en los volcables del puerto aunque ahí no haya ninguna OT.

Hicimos un primer borrador de estas dependencias con solo los nombres de los activos, y ya aparecieron casos reales (están más abajo). Para seguir necesitamos el mapa real de la planta. Vos tenés el IFC, todas las OT y el maestro de activos con su descripción.

## Tarea

Armá un **mapa en JSON** que diga, para cada equipo del EAM que puede frenar o demorar una descarga de camiones:

1. **Qué es y dónde está**: código del EAM, nombre, tipo de equipo, sector y su elemento en el IFC.
2. **Por dónde pasa el grano**: de qué equipo recibe y a qué equipo entrega. Es un grafo dirigido activo → activo que va desde la plataforma de descarga hasta el destino final (celda, silo, secadora, proceso).
3. **Qué punto de descarga afecta y cómo**: el nodo del circuito de camiones y la plataforma del Excel, el tipo de relación, el efecto y si hay redundancia.
4. **Qué otras cosas lo pueden frenar**: energía (CCM, trafo), control (PLC, lógico), aire o hidráulica. Que un CCM caído pare una cinta es exactamente el tipo de cruce que buscamos.

## Qué te paso

En esta misma carpeta:

- `circuito_descarga_nodos.json`: el circuito de camiones.
  - `nodes`: los 33 puntos del Nodo Sur, con cámara o sin ella.
  - `edges`: los tramos posibles entre puntos.
  - `circuits`: los 50 recorridos (R1–R35, SL1–SL15) como secuencias de nodos.
  - `plataformas_excel`: a qué nodo corresponde cada plataforma del Excel.
  - Importante: `san_lorenzo:Plataformas Volcables` agrupa 5 plataformas físicas distintas, PV1 a PV5. **En tu mapa tratalas por separado.**
- `grafo_mantenimiento_borrador.json`: nuestro borrador de cadenas. Es un regex sobre `codigo_activo` por cadena, con relación y confianza. Casi todo es hipótesis. Usalo como punto de partida y **corregilo**. No lo tomes como verdad.

## Formato de salida

Un archivo `mapa_planta_mantenimiento.json` con esta estructura. Los campos entre `<>` son ejemplos.

```json
{
  "version": "1",
  "generado": "<AAAA-MM-DD>",
  "fuentes": {
    "ifc": ["<nombre de archivo y versión>"],
    "eam": "<export y fecha de corte>",
    "maestro_activos": "<archivo>"
  },

  "activos": [
    {
      "codigo_activo": "TE-TNL-CNT-CR2",
      "nombre": "CINTA RECEPCION CR2",
      "planta": "Terminal Embarque",
      "sector": "<como figura en el maestro>",
      "tipo": "cinta",
      "funcion": "Recibe de PV1 y PV2 y entrega a EL1",
      "ifc": [{ "guid": "<GlobalId>", "clase": "IfcFlowMovingDevice", "nombre": "<Name del IFC>" }],
      "capacidad_t_h": null
    }
  ],

  "flujo_grano": [
    {
      "desde": "TE-DDC-PTV-PV1",
      "hasta": "TE-TNL-CNT-CR2",
      "productos": ["SOJA", "GIRASOL"],
      "alternativo": false,
      "confianza": "alta",
      "evidencia": [
        { "fuente": "ifc", "detalle": "IfcRelConnectsPorts <guid puerto> → <guid puerto>" },
        { "fuente": "ot", "ot": ["123456"], "detalle": "<texto de la OT que lo confirma>" }
      ]
    }
  ],

  "dependencias_servicio": [
    {
      "equipo": "TE-TNL-CNT-CR2",
      "depende_de": "TE-TDM-CCM-CCMP0",
      "tipo": "energia",
      "confianza": "media",
      "evidencia": [{ "fuente": "ifc", "detalle": "<cómo se ve>" }]
    }
  ],

  "impacto_descarga": [
    {
      "equipo": "TE-TNL-CNT-CR2",
      "nodo_circuito": "san_lorenzo:Plataformas Volcables",
      "plataformas_excel": ["VOLCABLE_PTO_1", "VOLCABLE_PTO_2"],
      "relacion": "aguas_abajo",
      "efecto": "detiene",
      "productos": ["SOJA"],
      "redundancia": { "alternativas": ["TE-TNL-CNT-CR3"], "comentario": "<si puede desviar y con qué costo>" },
      "confianza": "alta",
      "evidencia": [{ "fuente": "ifc", "detalle": "<...>" }]
    }
  ],

  "grupos_redundantes": [
    {
      "id": "caladores_ricardone",
      "miembros": ["PR-PLYMP-CDR-CA01", "PR-PLYMP-CDR-CA02", "PR-PLYMP-CDR-CA03"],
      "nodo_circuito": "ricardone:Calada",
      "capacidad_con_uno_menos": "<estimación o null>",
      "comentario": "<...>"
    }
  ],

  "clasificacion_trabajos": {
    "detienen_equipo": ["<patrón de texto de OT que implica parar el equipo: CAMBIO DE CINTA, PARADA ANUAL, CAMBIO DE REDUCTOR...>"],
    "no_detienen": ["<ILUMINACION, CAPACITACION, CONTROL DE CCMS...>"],
    "dudosos": ["<...>"]
  },

  "validacion_casos": [
    { "caso": "<id del caso de la lista de abajo>", "explicacion": "<qué dice el mapa>", "confirma": true }
  ],

  "preguntas_abiertas": [
    { "tema": "<...>", "por_que_importa": "<...>", "a_quien_preguntar": "<sector o rol>" }
  ]
}
```

Valores permitidos:

| Campo | Valores |
|---|---|
| `tipo` | `volcable`, `central_hidraulica`, `cinta`, `redler`, `rosca`, `noria`, `valvula`, `secadora`, `prelimpieza`, `celda`, `silo`, `tolva_carga`, `calador`, `balanza`, `ccm`, `trafo`, `plc_logico`, `filtro_aspiracion`, `pala_cargador`, `otro` |
| `relacion` | `directo` (es la plataforma o su mecanismo)<br>`aguas_abajo` (por donde se va el grano)<br>`aguas_arriba` (lo que el camión usa antes: calada, balanza, playa)<br>`servicio` (energía, control, aire)<br>`compartido` |
| `efecto` | `detiene`, `reduce_capacidad`, `demora`, `ninguno` |
| `tipo` de `dependencias_servicio` | `energia`, `control`, `aire`, `hidraulica`, `vapor` |
| `confianza` | `alta` (IFC o documento de planta lo muestra)<br>`media` (OT o descripción lo dicen explícitamente)<br>`baja` (inferido por nombre o cercanía) |

## Reglas

1. **Códigos exactos del EAM.** Usá `codigo_activo` tal como figura en el EAM y no inventes códigos. Si un elemento del IFC no tiene activo en el EAM, ponelo en `activos` con `codigo_activo: null` y el GUID. Si un activo del EAM no está en el IFC, dejá `ifc: []`.
2. **Cada vínculo con su evidencia.** Cada vínculo de `flujo_grano`, `dependencias_servicio` e `impacto_descarga` lleva al menos una evidencia. Si es por cercanía o por nombre, decilo y poné `confianza: "baja"`.
3. **Qué conexiones del IFC valen.** Usá solo las físicas del IFC: puertos conectados (`IfcRelConnectsPorts`), sistemas de distribución (`IfcRelAssignsToGroup` a `IfcDistributionSystem`) y contención espacial. Que dos equipos estén en el mismo edificio no prueba que el grano pase de uno a otro.
4. **Las OT también son evidencia.** Muchas OT nombran la conexión, por ejemplo «REDLER 31 (PV5 A EL7)», «CINTA 11 DE CARGA A NORIA EL6», «VALVULA P31 DESCARGA DE CR0 A EL1 Y EL2» o «CINTA TRANSP. BAJO VOLCABLE CELDA 16». Citá el número de OT.
5. **Alcance.** Cubrí como mínimo:
   - Ricardone: sectores Materia prima, Prelimpieza 1 y 2, Girasol (solo lo que recibe grano de los volcables), Expedición, y los CCM y trafos que los alimentan.
   - Terminal Embarque: Descarga Camiones, recepción (CR0–CR6), Torre de Manipuleo, Torre EL6, almacenaje (celdas 1–4, silos 4–7), Secadora, Expedición y Sector Playa, más sus CCM y trafos.
   - Si ves que un sector de proceso (Preparación, Extracción) frena la recepción cuando para, por ejemplo porque se llena el silo pulmón, incluilo y explicalo.
6. **Todas las plataformas.** Cada plataforma de `plataformas_excel` tiene que tener al menos una cadena completa, desde la plataforma hasta su destino final. Si no llegás al destino, decí dónde se corta.
7. **Todo lo que pertenece a una cadena queda clasificado.** Si un activo pertenece a una cadena, va en `impacto_descarga` aunque su efecto sea `ninguno`. Ejemplo: un aspersor anti-polución de la Celda 4. Así sabemos que lo miraste y que no afecta.
8. **Sin fecha no hay cronología.** No intentes armar una línea de tiempo con las fechas de las OT: en el 92 % de las cerradas la fecha real es copia de la programada. Lo que necesitamos de vos es la estructura, no el cuándo.

## Lo que ya vimos en los datos (validalo con el mapa)

Cada caso cruza una OT con lo que pasó en la descarga. Decinos en `validacion_casos` si el mapa lo explica.

| Id | Qué pasó en la descarga | OT cerca |
|---|---|---|
| `secadora_ric_0731` | Volcables 1 y 2 de Ricardone tardan de 903 a 1.324 min (normal: unos 550), del 31/07 al 08/08 | Secadora CEDAR M-ADF 250: «revisar encendido de quemadores y parada de emergencia» (31/07), «cambio de rodamiento, caja y obturadores» (04/08). Cinta CSG-3 y cinta crucero 2 (03–06/08) |
| `csg3_0629` | Volcable 2 de Ricardone no descarga el 30/06 ni el 01/07 | Cinta CSG-3: «cambiar reductor por rotura», emergencia (29/06) |
| `cruceros_0909` | Volcables de Ricardone a 1.100–1.358 min del 09/09 al 11/09 | Redler RSG-1 «la cadena de arrastre se desmontó de la corona», redler RCR-2 «sacar caída al silo 5 para limpieza», CSG-3 urgente (09/09) |
| `noria8_0912` | Volcable 2 de Ricardone casi sin descargar desde el 12/09 | Noria N-08 PTV Nº 2: «cambio completo de noria, asignado a Tork» (02/09, figura no realizada) |
| `pv2_0824` | PV2 del puerto descarga 20, 1 y 1 camiones del 24/08 al 26/08 (normal: 112), y PV4 absorbe 121 y 166 | PV2: «cambio de caños, cortinas y tiras de izaje» (25/08), «reparación de rejilla pivote» (26/08) |
| `pares_pv` | PV1+PV2 y PV3+PV4 se prenden y apagan de a pares. PV4 solo se usa cuando cae el par PV1+PV2 | Ninguna. Sospechamos una cinta de recepción o una celda compartida |
| `celda4_0916` | PV1 y PV2 en cero el 16–17/09; PV3 y PV4 cubren | Parada anual de la cadena Celda 4 programada el 15/09: cintas 6, 7, 8, 9, 11 y 12, válvulas bajo celda, noria EL6 (figura no realizada) |
| `pv3_0902` | PV3 casi sin descargar del 02/09 al 04/09 | Parada anual de la cinta C01 programada el 02/09 |
| `celda16_08` | La plataforma Celda 16 de Ricardone no recibe desde el 01/08 | Carro distribuidor de la cinta sobre Celda 16: «sacar caída, enderezar o modificar para poder mover el carro» (14/08) |
| `kepler1_0905` | Kepler 1 de Ricardone apagado del 05/09 al 09/09 y sin descargas desde el 12/09 | Cinta CBS KW-4 (rolos) y rampa volcable Nº 7 SKW (07/09) |
| `calada_puerto` | Los días con OT correctiva en los caladores de Ricardone, el tiempo sube en Ricardone (1,24–1,33× su mediana) y también en los volcables del puerto (1,02–1,07× contra 0,87×) | Caladores automáticos 1, 2 y 3 |
| `barrera_0611` | Los 4 volcables del puerto demoran a la vez del 11/06 al 13/06 (459–769 min contra unos 290) | Sector playa de camiones: «reparar barrera de ingreso, quedó fuera de servicio», emergencia (11/06) |

## Preguntas que más nos importan

1. ¿Qué cinta de recepción (CR0–CR6) toma cada volcable PV1–PV5 del puerto, y a qué celda o silo llega cada una?
2. ¿La secadora CEDAR recibe de los volcables 1 y 2 de Ricardone? ¿Recibe todo el girasol o solo el húmedo? ¿Hay un bypass?
3. ¿La CSG-3 y los redlers crucero (RCR-1, RCR-2, RSG-1) son el camino de los volcables 1 y 2?
4. ¿Qué rampas volcables del EAM («RAMPA VOLC. CAMIONES Nº 1 a 10») corresponden a cada plataforma del Excel (VOLCABLE_1, VOLCABLE_2, CELDA_16, KEPPLER_1, KEPPLER_2, silo Chief)?
5. ¿Qué CCM y qué trafo alimenta cada cadena? Si un CCM cae, ¿qué plataformas se apagan juntas?
6. ¿Cuántos caladores hacen falta para calar a ritmo normal?

## Entrega

- `mapa_planta_mantenimiento.json` con la estructura de arriba.
- Un resumen corto en texto con:
  - cuántos activos, vínculos e impactos cargaste, y cuántos de confianza alta, media y baja;
  - qué plataformas quedaron con la cadena incompleta;
  - las 5 correcciones más importantes al borrador;
  - lo que no pudiste resolver.
