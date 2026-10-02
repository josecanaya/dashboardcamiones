# Estado para retomar — 02/10/2026

Primera versión funcional implementada. Todo código, configuración, contexto y resultados nuevos se encuentran en CAPA DE AGENTES. El proyecto padre y las fuentes se conservaron.

## Disponible
- Siete perfiles: coordinador, soja, girasol, pellet, líquidos, seguridad y comunicador.
- Registro local para una sesión abierta en esta carpeta: `.codex/config.toml`, roles de instrucciones y `.mcp.json`. El chat raíz ya abierto usa CLI; no se afirma recarga automática de perfiles.
- Grafo de contexto: 34 nodos y 56 relaciones; 18 recetas de indicadores con fuentes, estados y límites.
- Trece herramientas MCP/CLI: contexto, fuentes, movimientos, seguridad, circuitos, semanas, tabla, Excel, API, paquete, indicador, pellet e informes.
- Lectura directa de movimientos normalizados y cámaras. Lectura explícita de Excel original y API GET local. Tablas de corridas disponibles como adaptador.
- Reutilización de los builders del dashboard sin ejecutar ETL ni escribir revisiones fuera de la capa.
- Receta de pellet parametrizada para el período: viajes, patentes, toneladas estimadas/netas, tandas y tramos con muestras. Conserva y declara las reglas heredadas.
- Seguridad: transiciones sin modelo, calle declarada vs observada, visita/retorno sin lectura de descarga y demora sin calado observado. Son candidatos de revisión con IDs compartidos, no infracciones confirmadas.
- Informes HTML, JSON, PPTX y gráficos nativos editables. Logística y seguridad comparten evidencia; antecedentes de Claude sólo con includeLegacy true.

## Pruebas realizadas
- 17 pruebas Node aprobadas: lectores, placeholders, deduplicación, cobertura, límites, vínculo temporal, receta pellet, informes y casos compartidos.
- MCP real: initialize, list_tools, context y manejo isError de fechas inválidas; 13 herramientas.
- Registro TOML y grafo validados; referencias y aristas existentes.
- Paquete reconstruido 24–30/09 reproduce la muestra R7 del comité: 770, rulesVersion etl_transform_v17, semanas 21–27 y 28/09–04/10.
- Pellet reejecutado: 307 viajes de planilla. No equivale a movimientos totales ni a recorridos de cámara.
- Ejemplo combinado generado sin errores de generación. Ver `salidas/EJEMPLO_24-30/` y `qa.json` para estructura y render.

## Límites y próximos puntos de validación
1. No réplica exacta de la maqueta original: presentación funcional con su orientación de productos/equipos/seguridad, colores y gráficos editables.
2. Conflicto documental tablas antiguas vs modelo C/D/E continúa explícito. Builders actuales se reutilizan para reproducibilidad; no se declara resuelto el modelo.
3. Offset de cámaras +206 min del método de Claude requiere validación operativa. Consulta general y seguridad usan raw por defecto; pellet declara el offset heredado. No comparar automáticamente horas DSS y API sin conciliación.
4. Productor/filtros completos de excel_extra.json aún no recuperados. Líquidos actual usa una taxonomía explícita y no promete reproducir la tarjeta histórica.
5. Casos de seguridad originales y capturas DSS no revalidados; falta vincular evidencias locales para reproducir láminas con fotografías.
6. Archivos disponibles no acreditan cobertura instrumental ni frescura contra el sistema de origen. No interpretar cero candidatos como ausencia de riesgo.
7. API 8787 no respondió durante la prueba de salud. Lectura de disco, informes y MCP funcionan independientemente; consultas API requieren el servidor existente arriba.
8. Recetas históricas o con fórmulas no implementadas devuelven implemented:false; el especialista puede consultar sus fuentes y explicar el pendiente, sin inventar resultados.

## Próximo turno
Leer AGENTS.md y README.md. Recuperar context del producto, comprobar sources, consultar query/indicator/pellet y security. Para informe ejecutar report con fechas. Preguntas simples no necesitan convocar todo el equipo; el informe general considera los cuatro productos y seguridad.

La renovación de tokens no reinicia automáticamente este chat. Este archivo conserva el punto de continuación.

## Entrega vigente: artefacto de líquidos

salidas/liquidos-24-30/artefacto/index.html: cuatro vistas interactivas; reemplaza las presentaciones anteriores. Nodo Sur: Ricardone + Terminal de Embarque, Renopack excluido. 307 movimientos / 113 patentes. Perímetro guardado en instrucciones, contexto y grafo.
R35: nueve secuencias candidatas y cinco tramos medidos, pendientes de conciliar UID entre plantas. R33/R34: modelo y dos despachos Ricardone sin destino SLZ acreditado. Seguridad: nueve movimientos / ocho patentes a revisar. Fuentes y reproducción en salidas/liquidos-24-30/LEEME.md.
