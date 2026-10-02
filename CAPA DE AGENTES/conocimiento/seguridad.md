# Seguridad transversal — contexto del especialista

Fuente estructurada: `contexto.json`, entrada `products.seguridad`.

## Conocimiento recuperado

- Casos históricos cruzan Excel, cámaras y horas DSS — `scripts/estado-planta/gen_comite_seguridad.py`, observada_en_codigo.
- Ausencia lectura volcable no prueba ausencia descarga: consultar operación y captura — `scripts/estado-planta/gen_comite_seguridad.py`, observada_en_codigo.

## Recetas del informe

- **Calle declarada vs observada** (`seguridad.calles`): Cruzar ingreso Excel con volcable declarado y lectura de calle; cifra embebida sólo 24–30/09, detector nuevo requiere conciliación. Fuente `scripts/estado-planta/gen_comite_seguridad.py`, selector `section numeros y notas`. Unidad: operaciones controladas. Estado: historico_reportado.
- **Retorno sin descarga observada** (`seguridad.retornos`): Ingreso/salida puerto, falta lectura volcable, posterior ingreso Ricardone; contrastar Excel y DSS; no lectura no prueba no descarga. Fuente `scripts/estado-planta/gen_comite_seguridad.py`, selector `div-vuelta y case`. Unidad: casos de revisión. Estado: historico_reportado.
- **Demoras entre plantas** (`seguridad.demoras`): Criterio del informe >30min sin calado puerto; umbral histórico, no regla universal de riesgo. Fuente `scripts/estado-planta/gen_comite_seguridad.py`, selector `section numeros`. Unidad: casos de revisión. Estado: historico_reportado.

## Seguridad y comunicación

confirmada, explicada, pendiente, evidencia_insuficiente. Entregar al comunicador el contrato de README; conservar ID de cada caso compartido.

## Ausencia de actividad

Verificar cobertura de operaciones del período y faltantes. Cero cámara no significa cero producto. Informar uno de los cuatro estados del README. Si faltan datos, publicar limitación, no cifra cero.
